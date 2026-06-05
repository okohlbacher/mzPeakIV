import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Grid, Image, Layers, Download, Settings } from "lucide-react";

import { useStore } from "../state/store";
import {
  Button,
  SegmentedControl,
  NumberField,
  ColormapScale,
} from "./ds";
import { SettingsView } from "./SettingsView";
import type { View } from "./viewTypes";
import {
  rasterizeTic,
  rasterizeImage,
  rasterizeBasePeakMap,
  rasterizeMultiChannel,
  type Colormap,
} from "./rasterize";
import {
  encodeSingleChannelTiff,
  encodeRgbTiff,
  downloadTiff,
} from "../export/tiff";
import type { ImagingGrid } from "../imaging/types";
import type { ChannelRequest } from "../worker/protocol";

// Warning amber (caution, NOT error) — reused from GridDiagnosticsPanel's WARNING
// constant for the mixed-representation surface (D-08).
const WARNING = "#8a6d00";

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
 * Derive a filename stem from fileMeta.run or a fallback string.
 * Returns e.g. "dataset" when nothing is available.
 */
function filenameStem(run: unknown): string {
  if (run && typeof run === "object" && "name" in run && typeof (run as Record<string, unknown>).name === "string") {
    const n = (run as { name: string }).name;
    // Strip known extensions
    return n.replace(/\.(mzpeak|mzML|imzML|d|raw)$/i, "");
  }
  return "ion-image";
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
 *
 * BL additions: TIC norm toggle, Gaussian smooth, histogram contrast, multi-channel
 * tab, TIFF export, ROI rectangle selection.
 */
export function ImagingPanel({
  view,
  setView,
  overviewMode,
  setOverviewMode,
}: {
  view: View;
  setView: (v: View) => void;
  overviewMode: "tic" | "basepeak";
  setOverviewMode: (m: "tic" | "basepeak") => void;
}) {
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
  const fileMeta = useStore((s) => s.fileMeta);

  // BL-01: TIC normalization (getter only — setter lives in SettingsPopover)
  const ticNorm = useStore((s) => s.ticNorm);

  // BL-04: Gaussian smooth (getter only — setter lives in SettingsPopover)
  const smoothSigma = useStore((s) => s.smoothSigma);

  // BL-07: Histogram contrast (getter only — setter lives in SettingsPopover)
  const histogramMode = useStore((s) => s.histogramMode);

  // BL-02: Multi-channel
  const multiChannel = useStore((s) => s.multiChannel);
  const renderMultiChannel = useStore((s) => s.renderMultiChannel);
  const mzWindow = useStore((s) => s.mzWindow);

  // BL-06: ROI
  const requestRoiSpectrum = useStore((s) => s.requestRoiSpectrum);
  const clearRoi = useStore((s) => s.clearRoi);
  const roiIndices = useStore((s) => s.roiIndices);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mcCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store the last rasterized ion image RGBA for re-blit during overlays.
  const ionRgbaRef = useRef<Uint8ClampedArray | null>(null);
  // Store the last rasterized TIC RGBA for re-blit during ROI overlays.
  const ticRgbaRef = useRef<Uint8ClampedArray | null>(null);

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

  // Keep the m/z range inputs in sync with the rendered window, so a peak click
  // in the spectrum (which calls renderIonImage with mz ± global Δ and switches
  // to this view) is reflected in the toolbar. Keyed on mzWindow only.
  useEffect(() => {
    if (!mzWindow) return;
    setMzStart((mzWindow.mz - mzWindow.tolDa).toFixed(4));
    setMzEnd((mzWindow.mz + mzWindow.tolDa).toFixed(4));
  }, [mzWindow]);

  const [ionReadout, setIonReadout] = useState<{ text: string; muted: boolean }>({
    text: "",
    muted: false,
  });

  // BL-02: Multi-channel per-row inputs
  const [mcMz, setMcMz] = useState<[string, string, string]>(["", "", ""]);
  // Per-channel tolerance is fixed at 0.5 Da (the editing control moved out of the
  // toolbar in Phase 4); still read by handleRenderMultiChannel.
  const [mcTol] = useState<[string, string, string]>(["0.5", "0.5", "0.5"]);

  // BL-06: ROI drag state
  type DragState = {
    startX: number; // clientX at mousedown
    startY: number; // clientY at mousedown
    currentX: number;
    currentY: number;
    active: boolean; // true once mouse moved >= 2px
  };
  const dragRef = useRef<DragState | null>(null);
  const [roiRect, setRoiRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

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
    ticRgbaRef.current = rgba;
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    // view + overviewMode deps: the TIC canvas only mounts when the overview
    // view is active AND overviewMode==="tic". Switching base-peak↔TIC, or
    // leaving the overview view and returning, remounts a blank canvas; without
    // these deps the paint effect would not re-run (tic/grid unchanged).
  }, [tic, grid, view, overviewMode]);

  // Selection-ring pass (runs AFTER the paint pass): re-blit, then stroke a 1px
  // contrast ring on the selected cell. Keyed on [selectedIndex, tic, grid].
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tic) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // putImageData overwrites the composite, so re-blit before stroking the ring.
    const rgba = rasterizeTic(tic, grid);
    ticRgbaRef.current = rgba;
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
    // view + overviewMode: re-blit on remount (same mount-after-data reason).
  }, [selectedIndex, tic, grid, view, overviewMode]);

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
    // view + overviewMode: the base-peak canvas mounts only when active; repaint
    // on remount (switching TIC↔base-peak or returning to the overview view).
  }, [basePeakMz, grid, stats, view, overviewMode]);

  // Phase 4 — ion image PAINT effect: rasterize the ion image with chosen colormap/scale/percentile.
  // BL-01/04/07: also keyed on [ticNorm, smoothSigma, histogramMode].
  // BL-06: also keyed on [roiRect] to repaint ROI overlay.
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
      tic: ticNorm ? tic : null,
      ticNorm,
      smoothSigma,
      histogramMode,
    });
    ionRgbaRef.current = rgba;
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    // view dependency: the ion canvas only mounts when its view is active, so
    // switching INTO the view after ionImage already arrived must re-run this
    // paint (deps would otherwise be unchanged and the fresh canvas stays blank).
  }, [ionImage, grid, colormap, scale, percentile, ticNorm, tic, smoothSigma, histogramMode, view]);

  // Phase 4 — ion image RING effect: re-blit then stroke the ring for the selected cell.
  // BL-01/04/07: also keyed on [ticNorm, smoothSigma, histogramMode].
  // BL-06: also draws ROI overlay rectangle.
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
      tic: ticNorm ? tic : null,
      ticNorm,
      smoothSigma,
      histogramMode,
    });
    ionRgbaRef.current = rgba;
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);

    // BL-06: draw ROI rectangle overlay (committed rect from roiIndices)
    if (roiRect) {
      drawRoiOverlay(ctx, roiRect, grid.width, grid.height, canvas);
    }

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
  }, [selectedIndex, ionImage, grid, colormap, scale, percentile, ticNorm, tic, smoothSigma, histogramMode, roiRect, view]);

  // BL-02: Multi-channel canvas paint.
  useEffect(() => {
    const canvas = mcCanvasRef.current;
    if (!canvas || !grid || !multiChannel?.images) return;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = rasterizeMultiChannel(multiChannel.images, grid, tic ?? null, ticNorm);
    const img = new ImageData(grid.width, grid.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    // view dependency: same mount-after-data issue as the ion canvas above.
  }, [multiChannel, grid, tic, ticNorm, view]);

  // Grid is null until the first "Show Ion Image" click triggers lazy init.
  // We still render the controls row so the user can enter m/z and load.
  const aspect = grid
    ? grid.pixelSizeUm
      ? grid.pixelSizeUm.x / grid.pixelSizeUm.y
      : 1
    : 1;
  const cssAspectRatio = grid
    ? `${grid.width * aspect} / ${grid.height}`
    : "1 / 1";
  const base = grid?.coordinateBase ?? 1;

  // Scale the displayed image up to fill the dark stage while preserving aspect
  // ratio (contain-fit). We measure the stage and set an explicit pixel size on
  // the canvas ELEMENT — NOT object-fit — so the element box equals the visible
  // image box and getBoundingClientRect-based hit-testing (toGridCoord) stays
  // exact. A ResizeObserver tracks rail toggle / dock / window reflows.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !grid) return;
    const ar = (grid.width * aspect) / grid.height; // width / height
    const fit = () => {
      const cs = getComputedStyle(stage);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = Math.max(0, stage.clientWidth - padX);
      const availH = Math.max(0, stage.clientHeight - padY);
      if (availW <= 0 || availH <= 0) return;
      let w = availW;
      let h = w / ar;
      if (h > availH) {
        h = availH;
        w = h * ar;
      }
      setDisplaySize({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [grid, aspect]);

  // Explicit pixel size for the active canvas (contain-fit); falls back to the
  // CSS aspect-ratio box until the first measurement lands.
  const canvasSizeStyle: React.CSSProperties = displaySize
    ? { width: displaySize.w, height: displaySize.h }
    : { aspectRatio: cssAspectRatio, maxWidth: "100%", maxHeight: "100%" };

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

  // BL-02: render multi-channel
  function handleRenderMultiChannel() {
    const channels: (ChannelRequest | null)[] = mcMz.map((mzStr, i) => {
      const mz = Number(mzStr);
      const tol = Number(mcTol[i]);
      if (!mzStr || !Number.isFinite(mz) || mz <= 0) return null;
      if (!Number.isFinite(tol) || tol <= 0) return null;
      return { mz, tolDa: tol };
    });
    renderMultiChannel(channels);
  }

  // BL-05: TIFF export helpers
  function handleTiffExport() {
    if (!grid) return;
    const stem = filenameStem(fileMeta?.run);

    // If on multi-channel view and multi-channel images exist, export RGB
    if (view === "multi" && multiChannel?.images) {
      const [r, g, b] = multiChannel.images;
      if (r && g && b) {
        const bytes = encodeRgbTiff(r, g, b, grid.width, grid.height);
        downloadTiff(bytes, `${stem}_RGB.tif`);
        return;
      }
    }

    // Single-channel ion image export
    if (ionImage) {
      const mz = mzWindow?.mz;
      const tol = mzWindow?.tolDa;
      const mzLabel = mz != null && tol != null
        ? `mz${mz.toFixed(4)}±${tol.toFixed(4)}Da`
        : "ion-image";
      const bytes = encodeSingleChannelTiff(ionImage, grid.width, grid.height);
      downloadTiff(bytes, `${stem}_${mzLabel}.tif`);
    }
  }

  // BL-06: ROI drag drawing helper
  function drawRoiOverlay(
    ctx: CanvasRenderingContext2D,
    rect: { x0: number; y0: number; x1: number; y1: number },
    _width: number,
    _height: number,
    _canvas: HTMLCanvasElement,
  ) {
    const rx = Math.min(rect.x0, rect.x1);
    const ry = Math.min(rect.y0, rect.y1);
    const rw = Math.abs(rect.x1 - rect.x0);
    const rh = Math.abs(rect.y1 - rect.y0);
    if (rw < 1 || rh < 1) return;
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.setLineDash([2, 2]);
    ctx.lineDashOffset = 2;
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    ctx.restore();
  }

  // BL-06: Re-blit ion image + draw live drag rect overlay
  const repaintIonWithDrag = useCallback((rect: { x0: number; y0: number; x1: number; y1: number } | null) => {
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = ionRgbaRef.current;
    if (rgba) {
      const img = new ImageData(grid.width, grid.height);
      img.data.set(rgba);
      ctx.putImageData(img, 0, 0);
    }
    if (rect) {
      drawRoiOverlay(ctx, rect, grid.width, grid.height, canvas);
    }
  }, [grid]);

  // BL-06: Ion canvas mouse event handlers for ROI drag
  function onIonMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      active: false,
    };
  }

  function onIonMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    // Handle hover readout regardless
    onIonMove(e);

    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active && (Math.abs(dx) >= 2 || Math.abs(dy) >= 2)) {
      drag.active = true;
    }
    if (!drag.active) return;

    drag.currentX = e.clientX;
    drag.currentY = e.clientY;

    // Convert to grid coords for the live overlay
    const canvas = ionCanvasRef.current;
    if (!canvas || !grid) return;
    const startHit = toGridCoord({ clientX: drag.startX, clientY: drag.startY }, canvas, grid);
    const endHit = toGridCoord({ clientX: drag.currentX, clientY: drag.currentY }, canvas, grid);
    if (startHit && endHit) {
      repaintIonWithDrag({ x0: startHit.x0, y0: startHit.y0, x1: endHit.x0, y1: endHit.y0 });
    }
  }

  function onIonMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;

    const canvas = ionCanvasRef.current;
    if (!canvas || !grid) return;

    if (!drag || !drag.active) {
      // Normal click — select spectrum, clear ROI
      clearRoi();
      setRoiRect(null);
      const hit = toGridCoord(e, canvas, grid);
      if (!hit) return;
      if (grid.presenceMask[hit.key] === 0) return;
      const idx = grid.coordToSpectrumIndex.get(hit.key);
      if (idx != null) void selectSpectrum(idx);
      return;
    }

    // Drag completed — collect all spectrum indices in the rectangle
    const startHit = toGridCoord({ clientX: drag.startX, clientY: drag.startY }, canvas, grid);
    const endHit = toGridCoord({ clientX: drag.currentX, clientY: drag.currentY }, canvas, grid);
    if (!startHit || !endHit) return;

    const x0 = Math.min(startHit.x0, endHit.x0);
    const x1 = Math.max(startHit.x0, endHit.x0);
    const y0 = Math.min(startHit.y0, endHit.y0);
    const y1 = Math.max(startHit.y0, endHit.y0);

    const indices: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = y * grid.width + x;
        if (grid.presenceMask[key] === 0) continue;
        const idx = grid.coordToSpectrumIndex.get(key);
        if (idx != null) indices.push(idx);
      }
    }

    if (indices.length > 0) {
      setRoiRect({ x0, y0, x1, y1 });
      requestRoiSpectrum(indices);
    } else {
      clearRoi();
      setRoiRect(null);
    }
  }

  function onIonMouseLeave() {
    setIonReadout({ text: "", muted: false });
    // If dragging, cancel
    const drag = dragRef.current;
    if (drag?.active) {
      dragRef.current = null;
      repaintIonWithDrag(null);
    }
  }

  const canExportTiff = (ionImage !== null || (multiChannel?.images && multiChannel.images.some(Boolean))) && grid !== null;

  // Legend tick labels for the active view.
  const bpLow = stats?.mzRange ? String(Math.round(stats.mzRange[0])) : "lo";
  const bpHigh = stats?.mzRange ? String(Math.round(stats.mzRange[1])) : "hi";
  const showColormapCtl =
    (view === "overview" && overviewMode === "tic") || view === "ion";
  const activeReadout =
    view === "overview" ? readout : view === "ion" ? ionReadout : { text: "", muted: false };
  const ticHasImage = view === "overview" && overviewMode === "tic" && tic !== null && grid !== null;
  const bpHasImage = view === "overview" && overviewMode === "basepeak" && basePeakMz !== null && grid !== null;
  const ionHasImage = view === "ion" && ionImage !== null && grid !== null;
  const showLegend = ticHasImage || bpHasImage || ionHasImage;
  const legendColormap: "viridis" | "inferno" | "gray" | "basepeak" =
    overviewMode === "basepeak" && view === "overview" ? "basepeak" : colormap;

  return (
    <>
      {/* ── Toolbar: view tabs + per-view controls ─────────────────────────── */}
      <div className="toolbar" data-testid="imaging-panel" aria-label="imaging-panel">
        <SegmentedControl
          ariaLabel="View"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "overview", label: "Overview", icon: <Grid size={13} /> },
            { value: "ion", label: "Ion Image", icon: <Image size={13} /> },
            { value: "multi", label: "Multi-channel", icon: <Layers size={13} /> },
            { value: "settings", label: "Settings", icon: <Settings size={13} /> },
          ]}
        />
        <div className="toolbar__sep" />

        {view === "overview" && (
          <SegmentedControl
            size="sm"
            ariaLabel="Overview mode"
            value={overviewMode}
            onChange={(v) => setOverviewMode(v as "tic" | "basepeak")}
            options={
              basePeakMz
                ? [
                    { value: "tic", label: "TIC" },
                    { value: "basepeak", label: "Base-peak m/z" },
                  ]
                : [{ value: "tic", label: "TIC" }]
            }
          />
        )}

        {view === "ion" && (
          <div className="toolbar__group">
            <span className="toolbar__lbl">m/z</span>
            <NumberField
              size="sm"
              width="84px"
              type="text"
              value={mzStart}
              onChange={setMzStart}
              ariaLabel="m/z start"
            />
            <span style={{ color: "var(--text-faint)" }}>–</span>
            <NumberField
              size="sm"
              width="84px"
              type="text"
              value={mzEnd}
              onChange={setMzEnd}
              unit="Da"
              ariaLabel="m/z end"
            />
            <Button
              size="sm"
              iconLeft={<Image size={14} />}
              disabled={!rangeValid || isRendering}
              onClick={handleRenderIonImage}
            >
              {isRendering ? "Computing…" : "Show Ion Image"}
            </Button>
          </div>
        )}

        {view === "multi" && (
          <div className="toolbar__group">
            {(["r", "g", "b"] as const).map((c, i) => (
              <span key={c} className="mc-row">
                <span
                  className="mc-sw"
                  style={{ background: `var(--channel-${c})` }}
                  aria-label={`channel ${c.toUpperCase()}`}
                />
                <NumberField
                  size="sm"
                  width="78px"
                  type="text"
                  value={mcMz[i]}
                  onChange={(v) => {
                    const next = [...mcMz] as [string, string, string];
                    next[i] = v;
                    setMcMz(next);
                  }}
                  ariaLabel={`channel ${c.toUpperCase()} m/z`}
                />
              </span>
            ))}
            <Button
              size="sm"
              iconLeft={<Layers size={14} />}
              disabled={isRendering}
              onClick={handleRenderMultiChannel}
            >
              {isRendering ? "Computing…" : "Render"}
            </Button>
          </div>
        )}

        <div className="toolbar__spacer" />

        {showColormapCtl && (
          <SegmentedControl
            size="sm"
            ariaLabel="Colormap"
            value={colormap}
            onChange={(v) => handleColormapSettings(v as Colormap)}
            options={[
              { value: "viridis", label: "viridis" },
              { value: "inferno", label: "inferno" },
              { value: "gray", label: "gray" },
            ]}
          />
        )}

        {(view === "ion" || view === "multi") && (
          <>
            <div className="toolbar__sep" />
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Download size={14} />}
              disabled={!canExportTiff}
              onClick={handleTiffExport}
            >
              TIFF
            </Button>
          </>
        )}
      </div>

      {/* ── Stage: the dark data canvas area ───────────────────────────────── */}
      <div className="stage" ref={stageRef}>
        {mixedRepresentationWarning && (
          <div
            data-testid="tic-mixed-warning"
            style={{
              position: "absolute",
              left: "var(--space-6)",
              top: "var(--space-6)",
              color: WARNING,
              fontSize: "var(--text-xs)",
              background: "rgba(14,18,22,0.72)",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-sm)",
              zIndex: 2,
            }}
          >
            {mixedRepresentationWarning}
          </div>
        )}

        {/* Overview · TIC */}
        {view === "overview" &&
          overviewMode === "tic" &&
          (tic === null ? (
            <div data-testid="tic-unavailable" className="stage__empty">
              TIC not yet available
            </div>
          ) : (
            <div className="imgframe">
              <canvas
                ref={canvasRef}
                className="cross"
                data-testid="tic-canvas"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                onClick={onTicClick}
                style={canvasSizeStyle}
              />
            </div>
          ))}

        {/* Overview · Base-peak m/z */}
        {view === "overview" &&
          overviewMode === "basepeak" &&
          (basePeakMz ? (
            <div className="imgframe">
              <canvas
                ref={bpCanvasRef}
                className="cross"
                data-testid="basepeak-canvas"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                onClick={onTicClick}
                style={canvasSizeStyle}
              />
            </div>
          ) : (
            <div className="stage__empty">Base peak data not available</div>
          ))}

        {/* Ion Image */}
        {view === "ion" &&
          (ionImage === null ? (
            <div className="stage__empty">
              Enter an m/z range above and click Show Ion Image.
            </div>
          ) : (
            <div className="imgframe">
              <canvas
                ref={ionCanvasRef}
                className="cross"
                data-testid="ion-canvas"
                onMouseMove={onIonMouseMove}
                onMouseLeave={onIonMouseLeave}
                onMouseDown={onIonMouseDown}
                onMouseUp={onIonMouseUp}
                style={{ ...canvasSizeStyle, userSelect: "none" }}
              />
            </div>
          ))}

        {/* Multi-channel */}
        {view === "multi" &&
          (multiChannel?.images ? (
            <div className="imgframe">
              <canvas
                ref={mcCanvasRef}
                data-testid="mc-canvas"
                style={canvasSizeStyle}
              />
            </div>
          ) : (
            <div className="stage__empty">
              Enter R/G/B m/z values and Render
            </div>
          ))}

        {/* Settings tab — global, persisted settings */}
        {view === "settings" && <SettingsView />}

        {/* Floating legend (tic / basepeak / ion — not multi) */}
        {showLegend && (
          <div className="stage__legend">
            <ColormapScale
              colormap={legendColormap}
              onStage
              low={bpHasImage ? bpLow : "0"}
              high={bpHasImage ? bpHigh : "max"}
            />
          </div>
        )}

        {/* Floating hover readout */}
        {activeReadout.text && (
          <div className="stage__readout">
            {view === "overview" ? (
              <span data-testid="tic-hover-readout">{readout.text}</span>
            ) : (
              activeReadout.text
            )}
          </div>
        )}
        {/* Keep tic-hover-readout in the DOM for the overview view even when
            the readout text is empty (contract references the testid). */}
        {view === "overview" && !readout.text && (
          <span
            data-testid="tic-hover-readout"
            style={{ display: "none" }}
          />
        )}

        {/* Ion stats + ROI count, surfaced below the readout overlay */}
        {view === "ion" && (ionImageStats || (roiIndices && roiIndices.length > 0)) && (
          <div
            className="stage__readout"
            style={{ top: "auto", bottom: "var(--space-6)", right: "var(--space-6)" }}
          >
            {roiIndices && roiIndices.length > 0 && (
              <div>
                ROI: {roiIndices.length} pixel
                {roiIndices.length !== 1 ? "s" : ""} selected
              </div>
            )}
            {ionImageStats && grid && (
              <div data-testid="ion-stats">
                {ionImageStats.nonzeroCount} / {grid.filledCount} px · range{" "}
                {formatCompact(ionImageStats.min)}–
                {formatCompact(ionImageStats.max)} · {scale} (
                {Math.round(percentile * 100)}th pct)
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
