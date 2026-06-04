import { useEffect, useRef, useState } from "react";

import { useStore } from "../state/store";
import { rasterizeTic, rasterizeImage, type Colormap } from "./rasterize";
import { ppmToDa } from "../compute/ionImage";
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
 *
 * Phase 4 additions: controls row (m/z, tolerance, Da/ppm, Show Ion Image button,
 * colormap, scale, percentile selectors) above the TIC canvas; ion-image canvas
 * section below (conditionally rendered after first click, IMAGE-02/IMAGE-03).
 */
export function ImagingPanel() {
  const grid = useStore((s) => s.grid);
  const tic = useStore((s) => s.tic);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectSpectrum = useStore((s) => s.selectSpectrum);
  const mixedRepresentationWarning = useStore(
    (s) => s.mixedRepresentationWarning,
  );
  // Phase 4 store subscriptions (IMAGE-02/IMAGE-03).
  const ionImage = useStore((s) => s.ionImage);
  const ionImageStats = useStore((s) => s.ionImageStats);
  const colormap = useStore((s) => s.colormap);
  const scale = useStore((s) => s.scale);
  const percentile = useStore((s) => s.percentile);
  const renderIonImage = useStore((s) => s.renderIonImage);
  const setColormapSettings = useStore((s) => s.setColormapSettings);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [readout, setReadout] = useState<{ text: string; muted: boolean }>({
    text: "",
    muted: false,
  });

  // Phase 4 local state: m/z controls + ion canvas readout.
  const [mzInput, setMzInput] = useState<string>("");
  const [tolInput, setTolInput] = useState<string>("0.01");
  const [tolUnit, setTolUnit] = useState<"Da" | "ppm">("Da");
  const [ionReadout, setIonReadout] = useState<{ text: string; muted: boolean }>({
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
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
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
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);

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

  // Phase 4 — ion image PAINT effect: rasterize the ion image with chosen colormap/scale/percentile.
  // Keyed on [ionImage, grid, colormap, scale, percentile].
  useEffect(() => {
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid || !ionImage) return;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = rasterizeImage(ionImage, grid, {
      colormap,
      percentile,
      logScale: scale === "log",
    });
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }, [ionImage, grid, colormap, scale, percentile]);

  // Phase 4 — ion image RING effect: re-blit then stroke the ring for the selected cell.
  // Keyed on [selectedIndex, ionImage, grid, colormap, scale, percentile].
  // Re-blit first (Pitfall 6 — putImageData clears the composite).
  useEffect(() => {
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid || !ionImage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Re-blit before stroking — putImageData clears composite (Pitfall 6).
    const rgba = rasterizeImage(ionImage, grid, {
      colormap,
      percentile,
      logScale: scale === "log",
    });
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);

    if (selectedIndex == null) return;
    const key = keyForSpectrumIndex(grid, selectedIndex);
    if (key == null) return;
    const x0 = key % grid.width;
    const y0 = Math.floor(key / grid.width);
    const o = key * 4;
    const lum =
      0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
    ctx.strokeStyle = lum > 140 ? "#000000" : "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, 1, 1);
  }, [selectedIndex, ionImage, grid, colormap, scale, percentile]);

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

  // Per-canvas click handlers: each uses its own ref for hit-test (D-05).
  function onTicClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;
    const hit = toGridCoord(e, canvas, grid);
    if (!hit) return;
    if (grid.presenceMask[hit.key] === 0) return;
    const idx = grid.coordToSpectrumIndex.get(hit.key);
    if (idx != null) void selectSpectrum(idx);
  }

  function onIonClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid) return;
    const hit = toGridCoord(e, canvas, grid);
    if (!hit) return;
    if (grid.presenceMask[hit.key] === 0) return;
    const idx = grid.coordToSpectrumIndex.get(hit.key);
    if (idx != null) void selectSpectrum(idx);
  }

  // Phase 4 — ion canvas hover handler (D-06: "intensity:" label, not "TIC:").
  function onIonMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid || !ionImage) return;
    const hit = toGridCoord(e, canvas, grid);
    if (!hit) {
      setIonReadout({ text: "", muted: false });
      return;
    }
    if (grid.presenceMask[hit.key] === 0) {
      setIonReadout({
        text: `x: ${hit.x0 + base}, y: ${hit.y0 + base} — no data`,
        muted: true,
      });
      return;
    }
    setIonReadout({
      text: `x: ${hit.x0 + base}, y: ${hit.y0 + base} · intensity: ${formatCompact(ionImage[hit.key])}`,
      muted: false,
    });
  }

  // Phase 4 — "Show Ion Image" button handler (IMAGE-02, D-01).
  // V5 ASVS L1 defense-in-depth: validates independently of the store action (T-04-10).
  function handleRenderIonImage() {
    const mz = Number(mzInput);
    let tolDa = Number(tolInput);
    if (!Number.isFinite(mz) || mz <= 0) return;
    if (!Number.isFinite(tolDa) || tolDa <= 0) return;
    if (tolUnit === "ppm") tolDa = ppmToDa(mz, tolDa);
    if (mz - tolDa < 0) return;
    void renderIonImage(mz, tolDa);
  }

  // Phase 4 — colormap/scale/percentile change handler (D-02: no re-query, only recolor).
  function handleColormapSettings(
    newColormap: Colormap = colormap,
    newScale: "linear" | "log" = scale,
    newPercentile: number = percentile,
  ) {
    setColormapSettings(newColormap, newScale, newPercentile);
  }

  return (
    <section
      aria-label="imaging-panel"
      data-testid="imaging-panel"
      style={{ flexShrink: 0, padding: "0.5rem" }}
    >
      {/* Phase 4 controls row — D-07: single compact row above TIC canvas */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <label>m/z</label>
        <input
          type="number"
          step="any"
          min="0"
          value={mzInput}
          onChange={(e) => setMzInput(e.target.value)}
          style={{ width: "90px" }}
        />
        <span>&#177;</span>
        <input
          type="number"
          step="any"
          min="0"
          value={tolInput}
          onChange={(e) => setTolInput(e.target.value)}
          style={{ width: "70px" }}
        />
        <select
          value={tolUnit}
          onChange={(e) => setTolUnit(e.target.value as "Da" | "ppm")}
        >
          <option value="Da">Da</option>
          <option value="ppm">ppm</option>
        </select>
        <button
          onClick={handleRenderIonImage}
          style={{
            background: "#1565c0",
            color: "#fff",
            border: "none",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
          }}
        >
          Show Ion Image
        </button>
        <select
          value={colormap}
          onChange={(e) =>
            handleColormapSettings(e.target.value as Colormap)
          }
        >
          <option value="viridis">viridis</option>
          <option value="inferno">inferno</option>
          <option value="gray">gray</option>
        </select>
        <select
          value={scale}
          onChange={(e) =>
            handleColormapSettings(colormap, e.target.value as "linear" | "log")
          }
        >
          <option value="linear">linear</option>
          <option value="log">log</option>
        </select>
        <select
          value={String(percentile)}
          onChange={(e) =>
            handleColormapSettings(colormap, scale, Number(e.target.value))
          }
        >
          <option value="0.9">90th</option>
          <option value="0.95">95th</option>
          <option value="0.99">99th</option>
          <option value="0.999">99.9th</option>
        </select>
      </div>

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
          onClick={onTicClick}
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

      {/* Phase 4 ion-image section — D-04: only rendered after first Show Ion Image click */}
      {ionImage !== null && grid !== null && (
        <div>
          <h2 style={{ margin: "0.5rem 0 0.5rem" }}>Ion Image</h2>
          <canvas
            ref={ionCanvasRef}
            data-testid="ion-canvas"
            onMouseMove={onIonMove}
            onMouseLeave={() => setIonReadout({ text: "", muted: false })}
            onClick={onIonClick}
            style={{
              width: displayWidth,
              maxWidth: "100%",
              aspectRatio: cssAspectRatio,
              imageRendering: "pixelated",
              cursor: "crosshair",
              border: "1px solid #ddd",
            }}
          />
          {ionReadout.text && (
            <div
              style={{
                fontSize: "0.8rem",
                color: ionReadout.muted ? MUTED : undefined,
                marginTop: "0.25rem",
              }}
            >
              {ionReadout.text}
            </div>
          )}
          {ionImageStats && (
            <div
              data-testid="ion-stats"
              style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}
            >
              {ionImageStats.nonzeroCount} / {grid.filledCount} pixels with
              signal &middot; range{" "}
              {formatCompact(ionImageStats.min)}&ndash;
              {formatCompact(ionImageStats.max)} &middot; scale: {scale}{" "}
              ({Math.round(percentile * 100)}th pct)
            </div>
          )}
        </div>
      )}
    </section>
  );
}
