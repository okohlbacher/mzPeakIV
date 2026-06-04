import { useEffect, useRef, useState } from "react";

import { useStore } from "../state/store";
import { rasterizeTic, rasterizeImage, rasterizeBasePeakMap, type Colormap } from "./rasterize";
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
  const isRendering = useStore((s) => s.isRendering);

  const basePeakMz = useStore((s) => s.basePeakMz);
  const stats = useStore((s) => s.stats);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Overview mode: "tic" shows TIC image, "basepeak" shows dominant-mass false-color
  const [overviewMode, setOverviewMode] = useState<"tic" | "basepeak">("tic");

  const [readout, setReadout] = useState<{ text: string; muted: boolean }>({
    text: "",
    muted: false,
  });

  // m/z range inputs. Auto-populated from stats.mzRange when available.
  const [mzStart, setMzStart] = useState<string>("");
  const [mzEnd, setMzEnd] = useState<string>("");
  const [autoFilled, setAutoFilled] = useState(false);

  // Auto-fill m/z range from dataset stats the first time they become available.
  useEffect(() => {
    if (autoFilled) return;
    if (!stats?.mzRange) return;
    const [lo, hi] = stats.mzRange;
    if (!mzStart) setMzStart(lo.toFixed(2));
    if (!mzEnd) setMzEnd(hi.toFixed(2));
    setAutoFilled(true);
  }, [stats?.mzRange, autoFilled, mzStart, mzEnd]);
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

  // Base-peak m/z overview paint — Option C false-color map.
  useEffect(() => {
    const canvas = bpCanvasRef.current;
    if (!canvas || !grid || !basePeakMz) return;
    const mzMin = stats?.mzRange?.[0] ?? 0;
    const mzMax = stats?.mzRange?.[1] ?? 1000;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = rasterizeBasePeakMap(basePeakMz, grid, mzMin, mzMax);
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }, [basePeakMz, grid, stats]);

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

  // Grid is null until the first "Show Ion Image" click triggers lazy init.
  // We still render the controls row so the user can enter m/z and load.
  const aspect = grid
    ? grid.pixelSizeUm
      ? grid.pixelSizeUm.x / grid.pixelSizeUm.y
      : 1
    : 1;
  const displayWidth = "100%";
  const cssAspectRatio = grid
    ? `${grid.width * aspect} / ${grid.height}`
    : "1 / 1";
  const base = grid?.coordinateBase ?? 1;

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

  // m/z range → center + half-window for renderIonImage
  function handleRenderIonImage() {
    const start = Number(mzStart);
    const end = Number(mzEnd);
    if (!Number.isFinite(start) || start < 0) return;
    if (!Number.isFinite(end) || end <= 0 || end <= start) return;
    const mz = (start + end) / 2;
    const tolDa = (end - start) / 2;
    if (tolDa <= 0) return;
    void renderIonImage(mz, tolDa);
  }

  // Allow start=0 (show all m/z above 0); require end > start > -1
  const startNum = Number(mzStart);
  const endNum = Number(mzEnd);
  const rangeValid =
    mzStart !== "" && mzEnd !== "" &&
    Number.isFinite(startNum) && startNum >= 0 &&
    Number.isFinite(endNum) && endNum > startNum;

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
      {/* Controls: m/z range → Show Ion Image → colormap/scale/percentile */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.5rem" }}>
        {/* Row 1: m/z range input */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
          <label style={{ fontWeight: 600, minWidth: "5rem" }}>m/z range</label>
          <input
            type="number"
            step="any"
            min="0"
            placeholder={stats?.mzRange ? stats.mzRange[0].toFixed(1) : "start"}
            value={mzStart}
            onChange={(e) => setMzStart(e.target.value)}
            style={{ width: "90px" }}
            aria-label="m/z start"
          />
          <span style={{ color: "#666" }}>–</span>
          <input
            type="number"
            step="any"
            min="0"
            placeholder={stats?.mzRange ? stats.mzRange[1].toFixed(1) : "end"}
            value={mzEnd}
            onChange={(e) => setMzEnd(e.target.value)}
            style={{ width: "90px" }}
            aria-label="m/z end"
          />
          <span style={{ color: "#888", fontSize: "0.75rem" }}>Da</span>
          <button
            onClick={handleRenderIonImage}
            disabled={isRendering || !rangeValid}
            style={{
              background: rangeValid && !isRendering ? "#1565c0" : "#ccc",
              color: rangeValid && !isRendering ? "#fff" : "#666",
              border: "none",
              padding: "0.3rem 0.75rem",
              borderRadius: "3px",
              cursor: isRendering ? "wait" : rangeValid ? "pointer" : "not-allowed",
              fontWeight: 600,
              opacity: isRendering ? 0.7 : 1,
            }}
          >
            {isRendering ? "Computing…" : "Show Ion Image"}
          </button>
        </div>
        {/* Row 2: rendering options */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
          <label style={{ fontWeight: 600, minWidth: "5rem", color: "#555", fontSize: "0.8rem" }}>Display</label>
          <select
            value={colormap}
            onChange={(e) => handleColormapSettings(e.target.value as Colormap)}
            style={{ fontSize: "0.8rem" }}
            aria-label="colormap"
          >
            <option value="viridis">viridis</option>
            <option value="inferno">inferno</option>
            <option value="gray">gray</option>
          </select>
          <select
            value={scale}
            onChange={(e) => handleColormapSettings(colormap, e.target.value as "linear" | "log")}
            style={{ fontSize: "0.8rem" }}
            aria-label="scale"
          >
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
          <select
            value={String(percentile)}
            onChange={(e) => handleColormapSettings(colormap, scale, Number(e.target.value))}
            style={{ fontSize: "0.8rem" }}
            aria-label="percentile clip"
          >
            <option value="0.9">90th pct</option>
            <option value="0.95">95th pct</option>
            <option value="0.99">99th pct</option>
            <option value="0.999">99.9th pct</option>
          </select>
        </div>
      </div>

      {/* TIC and ion-image sections: only shown after grid is built */}
      {!grid && !stats && (
        <div style={{ color: "#888", fontSize: "0.85rem", padding: "0.5rem 0" }}>
          ⏳ Loading image overview… (reading coordinate + TIC columns)
        </div>
      )}
      {!grid && stats && (
        <div style={{ color: "#555", fontSize: "0.85rem", padding: "0.5rem 0" }}>
          Overview ready — enter an m/z range and click <strong>Show Ion Image</strong>.
          {stats.mzRange && (
            <span style={{ color: "#888" }}>
              {" "}Dataset range: {stats.mzRange[0].toFixed(1)}–{stats.mzRange[1].toFixed(1)} Da.
            </span>
          )}
        </div>
      )}

      {grid && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Overview</h2>
          <div style={{ display: "flex", gap: 0, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden", fontSize: "0.78rem" }}>
            <button
              onClick={() => setOverviewMode("tic")}
              style={{
                padding: "0.2rem 0.5rem",
                background: overviewMode === "tic" ? "#1565c0" : "#fff",
                color: overviewMode === "tic" ? "#fff" : "#333",
                border: "none",
                cursor: "pointer",
              }}
            >
              TIC
            </button>
            {basePeakMz && (
              <button
                onClick={() => setOverviewMode("basepeak")}
                style={{
                  padding: "0.2rem 0.5rem",
                  background: overviewMode === "basepeak" ? "#1565c0" : "#fff",
                  color: overviewMode === "basepeak" ? "#fff" : "#333",
                  border: "none",
                  borderLeft: "1px solid #ccc",
                  cursor: "pointer",
                }}
              >
                Base Peak m/z
              </button>
            )}
          </div>
          {overviewMode === "basepeak" && stats?.mzRange && (
            <span style={{ fontSize: "0.72rem", color: "#666" }}>
              {stats.mzRange[0].toFixed(0)}–{stats.mzRange[1].toFixed(0)} Da hue scale
            </span>
          )}
        </div>
      )}

      {grid && mixedRepresentationWarning && (
        <div
          data-testid="tic-mixed-warning"
          style={{ color: WARNING, fontSize: "0.8rem", marginBottom: "0.5rem" }}
        >
          ⚠ {mixedRepresentationWarning}
        </div>
      )}

      {grid && overviewMode === "tic" && (tic === null ? (
        <div data-testid="tic-unavailable" style={{ color: MUTED, fontSize: "0.8rem" }}>
          TIC not yet available
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          data-testid="tic-canvas"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onTicClick}
          style={{ width: displayWidth, maxWidth: "100%", aspectRatio: cssAspectRatio, imageRendering: "pixelated", cursor: "crosshair", border: "1px solid #ddd" }}
        />
      ))}

      {grid && overviewMode === "basepeak" && (basePeakMz ? (
        <canvas
          ref={bpCanvasRef}
          data-testid="basepeak-canvas"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onTicClick}
          style={{ width: displayWidth, maxWidth: "100%", aspectRatio: cssAspectRatio, imageRendering: "pixelated", cursor: "crosshair", border: "1px solid #ddd" }}
        />
      ) : (
        <div style={{ color: MUTED, fontSize: "0.8rem" }}>Base peak data not available</div>
      ))}

      {grid && (
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
      )}

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
