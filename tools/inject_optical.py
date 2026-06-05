#!/usr/bin/env python3
"""Inject a synthetic optical image into an imaging .mzpeak (imaging-spec v0.5).

mzPeak v0.5 embeds optical images as separate TIFF ZIP members
`images/image_NNNN.tiff`, with descriptive metadata (incl. a display-hint affine)
in `mzpeak_index.json` -> `metadata.imaging.images[]`. No real optical-bearing
mzPeak exists yet, so this tool fabricates one for development / UAT of the
viewer's Optical tab, multi-image selector, and blend overlay.

The optical image is a baseline uncompressed RGB TIFF (decodable by utif2): a
diagonal gradient with a bright cross, so registration onto the MS grid is
visually checkable. The affine is the naive full-extent fit onto the given grid.

Usage:
    python3 tools/inject_optical.py <in.mzpeak> [out.mzpeak] [--grid NxNy] [--count N]

If out is omitted, rewrites in place (via a temp file). --grid defaults to
260x134 (PXD001283 HR2MSI). --count adds N images (to exercise the selector).
"""
import io
import json
import struct
import sys
import zipfile
import hashlib
import os


def make_rgb_tiff(width: int, height: int, marker: int = 0) -> bytes:
    """Baseline little-endian uncompressed RGB (8-bit x3) TIFF, single strip."""
    # Pixel data: diagonal gradient + a bright cross at the centre (per-image hue
    # shifted by `marker` so multiple images look different).
    px = bytearray(width * height * 3)
    cx, cy = width // 2, height // 2
    for y in range(height):
        for x in range(width):
            i = (y * width + x) * 3
            g = int(255 * (x + y) / max(1, (width + height - 2)))
            r = (g + marker * 60) % 256
            b = (255 - g + marker * 30) % 256
            if abs(x - cx) <= 1 or abs(y - cy) <= 1:
                r, g, b = 255, 255, 0  # bright yellow cross
            px[i], px[i + 1], px[i + 2] = r, g, b

    # IFD entries (tag, type, count, value). type: 3=SHORT 4=LONG.
    entries = [
        (256, 3, 1, width),      # ImageWidth
        (257, 3, 1, height),     # ImageLength
        (258, 3, 3, "bps"),      # BitsPerSample [8,8,8] -> extra
        (259, 3, 1, 1),          # Compression = none
        (262, 3, 1, 2),          # Photometric = RGB
        (273, 4, 1, "strip"),    # StripOffsets -> filled later
        (277, 3, 1, 3),          # SamplesPerPixel
        (278, 3, 1, height),     # RowsPerStrip
        (279, 4, 1, len(px)),    # StripByteCounts
        (339, 3, 3, "sf"),       # SampleFormat [1,1,1] -> extra
    ]
    n = len(entries)
    header = struct.pack("<2sHI", b"II", 42, 8)
    ifd_size = 2 + n * 12 + 4
    extra_start = 8 + ifd_size
    bps_bytes = struct.pack("<3H", 8, 8, 8)
    sf_bytes = struct.pack("<3H", 1, 1, 1)
    extra = bps_bytes + sf_bytes
    data_offset = extra_start + len(extra)

    def entry_bytes(tag, typ, count, val):
        if val == "bps":
            off = extra_start
            return struct.pack("<HHII", tag, typ, count, off)
        if val == "sf":
            off = extra_start + len(bps_bytes)
            return struct.pack("<HHII", tag, typ, count, off)
        if val == "strip":
            return struct.pack("<HHII", tag, typ, count, data_offset)
        return struct.pack("<HHII", tag, typ, count, val)

    ifd = struct.pack("<H", n)
    for (tag, typ, count, val) in entries:
        ifd += entry_bytes(tag, typ, count, val)
    ifd += struct.pack("<I", 0)  # next IFD = 0
    return header + ifd + extra + bytes(px)


def full_extent_affine(w, h, nx, ny):
    a = (nx - 1) / (w - 1) if w > 1 else 0.0
    e = (ny - 1) / (h - 1) if h > 1 else 0.0
    return [a, 0.0, 1.0, 0.0, e, 1.0]


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    opts = {x.split("=")[0]: (x.split("=")[1] if "=" in x else True)
            for x in sys.argv[1:] if x.startswith("--")}
    if not args:
        print(__doc__)
        sys.exit(1)
    src = args[0]
    dst = args[1] if len(args) > 1 else src
    grid = str(opts.get("--grid", "260x134"))
    nx, ny = (int(v) for v in grid.lower().split("x"))
    count = int(opts.get("--count", 1))

    with zipfile.ZipFile(src, "r") as zin:
        names = zin.namelist()
        members = {name: zin.read(name) for name in names}

    if any(n.startswith("images/") for n in names):
        print(f"[inject_optical] {src} already has images/ members — skipping.")
        return

    index = json.loads(members["mzpeak_index.json"].decode("utf-8"))
    index.setdefault("metadata", {}).setdefault("imaging", {})
    imaging = index["metadata"]["imaging"]
    imaging.setdefault("is_imaging", True)
    images_meta = []

    for k in range(count):
        # Vary native size per image so the selector is visibly distinct.
        w, h = (130 + 20 * k), (67 + 10 * k)
        tiff = make_rgb_tiff(w, h, marker=k)
        path = f"images/image_{k:04d}.tiff"
        members[path] = tiff
        images_meta.append({
            "archive_path": path,
            "source_name": f"slide_{k}.tiff",
            "media_type": "image/tiff",
            "width": w,
            "height": h,
            "sha256": hashlib.sha256(tiff).hexdigest(),
            "size_bytes": len(tiff),
            "role": "optical" if k == 0 else "histology",
            "affine": {
                "type": "affine",
                "matrix": full_extent_affine(w, h, nx, ny),
                "maps": "image_px -> ms_px",
                "registration_quality": "assumed_full_extent",
            },
        })

    imaging["images"] = images_meta
    members["mzpeak_index.json"] = json.dumps(index, indent=2).encode("utf-8")

    tmp = dst + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as zout:
        # Preserve original member order; append the new image members.
        for name in names:
            zout.writestr(name, members[name])
        for im in images_meta:
            zout.writestr(im["archive_path"], members[im["archive_path"]])
    os.replace(tmp, dst)
    print(f"[inject_optical] wrote {dst} with {count} optical image(s), grid {nx}x{ny}.")


if __name__ == "__main__":
    main()
