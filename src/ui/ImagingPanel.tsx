import { useEffect, useRef, useState } from "react";

import { useStore } from "../state/store";
import { rasterizeTic } from "./rasterize";
import type { ImagingGrid } from "../imaging/types";

// Warning amber (caution, NOT error) — reused from GridDiagnosticsPanel's WARNING
// constant for the mixed-representation surface (D-08).
const WARNING = "#8a6d00";
const MUTED = "#888";

/** Hit-test result: a grid cell under the pointer, or null when off-canvas. */
type Hit = { x0: number; y0: number; key: number };

/**
 * Resolution/aspect-safe pointer → grid-cell mapping (Pitfall 5). Uses the canvas
 * bounding rect (the offset-* event props break under CSS scaling). Returns null
 * when the pointer is outside [0,width)×[0,height). The key reuses grid.ts's
 * `key = y0*width + x0` — NO flip/transpose (C2 MANDATORY).
 */
function toGridCoord(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  grid: ImagingGrid,
): Hit | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x0 = Math.floor(((e.clientX - rect.left) / rect.width) * grid.width);
  const y0 = Math.floor(((e.clientY - rect.top) / rect.height) * grid.height);
  if (x0 < 0 || x0 >= grid.width || y0 < 0 || y0 >= grid.height) return null;
  return { x0, y0, key: y0 * grid.width + x0 };
}

/** Compact intensity formatting for the hover readout (e.g. `1.4e6`, `0`, `230`). */
function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(1);
  // Trim to a short fixed/precision form without trailing noise.
  return Number(v.toPrecision(4)).toLocaleString();
}

/**
 * Invert `coordToSpectrumIndex` to find the grid key whose value === spectrumIndex.
 * Returns null when the selected spectrum is not on this grid (e.g. index-input
 * selection of an off-grid spectrum). Linear scan is fine at orientation scale.
 */
function keyForSpectrumIndex(
  grid: ImagingGrid,
  spectrumIndex: number,
): number | null {
  for (const [key, sIdx] of grid.coordToSpectrumIndex) {
    if (sIdx === spectrumIndex) return key;
  }
  return null;
}

/**
 * Imaging panel: a Canvas-2D TIC heatmap (IMAGE-01) with a 1-based hover readout
 * (IMAGE-04), pixel-click → `selectSpectrum` round-trip (SPEC-01), and a contrast
 * selection ring. Mounted imperatively via `useRef` mirroring SpectrumPanel; reads
 * the tic/grid/selection slice from the store. Orientation is fixed (no flip, C2);
 * pixel aspect honored from `grid.pixelSizeUm` (C5); absent ≠ zero (C8, D-09).
 */
export function ImagingPanel() {
  const grid = useStore((s) => s.grid);
  const tic = useStore((s) => s.tic);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectSpectrum = useStore((s) => s.selectSpectrum);
  const mixedRepresentationWarning = useStore(
    (s) => s.mixedRepresentationWarning,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [readout, setReadout] = useState<{ text: string; muted: boolean }>({
    text: "",
    muted: false,
  });

  // Paint pass: rasterize the TIC into ImageData and blit at intrinsic resolution
  // (one device pixel per grid cell). Keyed on [tic, grid].
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tic) return;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = rasterizeTic(tic, grid);
    const img = new ImageData(rgba, grid.width, grid.height);
    ctx.putImageData(img, 0, 0);
  }, [tic, grid]);

  // Selection-ring pass (runs AFTER the paint pass): re-blit, then stroke a 1px
  // contrast ring on the selected cell. Keyed on [selectedIndex, tic, grid].
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tic) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // putImageData overwrites the composite, so re-blit before stroking the ring.
    const rgba = rasterizeTic(tic, grid);
    ctx.putImageData(new ImageData(rgba, grid.width, grid.height), 0, 0);

    if (selectedIndex == null) return;
    const key = keyForSpectrumIndex(grid, selectedIndex);
    if (key == null) return;
    const x0 = key % grid.width;
    const y0 = Math.floor(key / grid.width);
    // Contrast-pick the ring color from the selected pixel's luminance so it is
    // visible against both colormap extremes and the absent-pixel sentinel (D-06).
    const o = key * 4;
    const lum =
      0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
    ctx.strokeStyle = lum > 140 ? "#000000" : "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, 1, 1);
  }, [selectedIndex, tic, grid]);

  if (!grid) return null;

  // Aspect from pixel size (C5): x:y µm; default 1:1 when null. Cap display width
  // to the pane and let height follow aspect; pixelated keeps cells crisp.
  const aspect = grid.pixelSizeUm
    ? grid.pixelSizeUm.x / grid.pixelSizeUm.y
    : 1;
  const displayWidth = "100%";
  // CSS aspect-ratio encodes (width:height) of the whole image: (cols*px.x):(rows*px.y).
  const cssAspectRatio = `${grid.width * aspect} / ${grid.height}`;

  const base = grid.coordinateBase;

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tic) return;
    const hit = toGridCoord(e, canvas, grid);
    if (!hit) {
      setReadout({ text: "", muted: false });
      return;
    }
    if (grid.presenceMask[hit.key] === 0) {
      setReadout({
        text: `x: ${hit.x0 + base}, y: ${hit.y0 + base} — no data`,
        muted: true,
      });
      return;
    }
    setReadout({
      text: `x: ${hit.x0 + base}, y: ${hit.y0 + base} · TIC: ${formatCompact(tic[hit.key])}`,
      muted: false,
    });
  }

  function onLeave() {
    // Label disappears on mouse-leave (D-05).
    setReadout({ text: "", muted: false });
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;
    const hit = toGridCoord(e, canvas, grid);
    if (!hit) return;
    // Clicking an absent pixel is a no-op — no selection change (D-04).
    if (grid.presenceMask[hit.key] === 0) return;
    const idx = grid.coordToSpectrumIndex.get(hit.key);
    if (idx != null) void selectSpectrum(idx);
  }

  return (
    <section
      aria-label="imaging-panel"
      data-testid="imaging-panel"
      style={{ flexShrink: 0, padding: "0.5rem" }}
    >
      <h2 style={{ margin: "0 0 0.5rem" }}>TIC Image</h2>

      {mixedRepresentationWarning && (
        <div
          data-testid="tic-mixed-warning"
          style={{ color: WARNING, fontSize: "0.8rem", marginBottom: "0.5rem" }}
        >
          ⚠ {mixedRepresentationWarning}
        </div>
      )}

      {tic === null ? (
        <div
          data-testid="tic-unavailable"
          style={{ color: MUTED, fontSize: "0.8rem" }}
        >
          Could not compute TIC for this file
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          data-testid="tic-canvas"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          style={{
            width: displayWidth,
            maxWidth: "100%",
            aspectRatio: cssAspectRatio,
            imageRendering: "pixelated",
            cursor: "crosshair",
            border: "1px solid #ddd",
          }}
        />
      )}

      <div
        data-testid="tic-hover-readout"
        style={{
          fontSize: "0.8rem",
          minHeight: "1.2em",
          marginTop: "0.5rem",
          color: readout.muted ? MUTED : "#000",
        }}
      >
        {readout.text}
      </div>
    </section>
  );
}
