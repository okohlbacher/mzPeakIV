# Phase 4: Ion Image + Intensity Scaling - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/compute/ionImage.ts` | compute/transform | batch (XIC → Float32Array) | `src/compute/tic.ts` | exact |
| `src/compute/ionImage.test.ts` | test | batch | `src/compute/tic.test.ts` | exact |
| `src/ui/rasterize.ts` | utility (pure render transform) | batch (Float32Array → Uint8ClampedArray) | `src/ui/rasterize.ts` (self — extend) | self |
| `src/ui/rasterize.test.ts` | test | batch | `src/ui/rasterize.test.ts` (self — extend) | self |
| `src/ui/ImagingPanel.tsx` | component | request-response + event-driven | `src/ui/ImagingPanel.tsx` (self — extend) | self |
| `src/ui/SpectrumPanel.tsx` | component | event-driven + request-response | `src/ui/SpectrumPanel.tsx` (self — extend) | self |
| `src/state/store.ts` | store/actions | CRUD + async request-response | `src/state/store.ts` (self — extend) | self |

---

## Pattern Assignments

### `src/compute/ionImage.ts` (new compute, batch)

**Analog:** `src/compute/tic.ts` — near-identical structure; clone and rename.

**Imports pattern** (`src/compute/tic.ts` lines 1–10):
```typescript
// No vendor imports — pure TS above the reader boundary.
import type { ImagingGrid } from "../imaging/types";

const INTENSITY_KEY = "intensity array";
```

**Local structural interfaces** (`src/compute/tic.ts` lines 21–37):
```typescript
// Declared locally so src/compute/ stays free of any vendor import.
interface XicPointLike {
  index: bigint | number;
  dataArrays: Record<
    string,
    ArrayLike<number> | ArrayLike<string> | undefined
  >;
}
interface XicLike {
  points: XicPointLike[];
}
```

**Core aggregation pattern** (`src/compute/tic.ts` lines 54–86):
```typescript
export function buildTic(xic: XicLike, grid: ImagingGrid): Float32Array {
  const tic = new Float32Array(grid.width * grid.height);
  const idxToKey = new Map<number, number>();
  for (const [key, sIdx] of grid.coordToSpectrumIndex) {
    idxToKey.set(sIdx, key);
  }
  for (const point of xic.points) {
    const sIdx = Number(point.index);           // bigint boundary FIRST (Pitfall 1)
    const key = idxToKey.get(sIdx);
    if (key === undefined) continue;
    const arr = point.dataArrays[INTENSITY_KEY];
    if (!arr) continue;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      sum += typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    tic[key] = sum;
  }
  return tic;
}
```

**For `ionImage.ts`:** clone `buildTic` → `buildIonImage`. Add a sibling `computeIonImageStats` and `ppmToDa` pure function in the same file. The reader already windows the XIC by m/z range before returning — `buildIonImage` does NOT filter m/z itself (RESEARCH Pattern 1). The `stats` function iterates over `presenceMask` to exclude absent cells, matching the exclusion logic of `percentile99` in `rasterize.ts` (lines 62–75):

```typescript
export function computeIonImageStats(values: Float32Array, grid: ImagingGrid) {
  const { presenceMask } = grid;
  let nonzeroCount = 0, min = Infinity, max = -Infinity;
  const n = Math.min(values.length, presenceMask.length);
  for (let k = 0; k < n; k++) {
    if (presenceMask[k] === 0) continue;
    const v = values[k];
    if (!Number.isFinite(v)) continue;
    if (v !== 0) nonzeroCount++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 0; }
  return { nonzeroCount, min, max };
}
```

---

### `src/compute/ionImage.test.ts` (new test, batch)

**Analog:** `src/compute/tic.test.ts` — mirror the fixture helpers and test structure exactly.

**Vitest imports pattern** (`src/compute/tic.test.ts` lines 1–13):
```typescript
import { describe, it, expect } from "vitest";
import { buildTic } from "./tic";
import type { ImagingGrid } from "../imaging/types";
```

**Grid fixture helper** (`src/compute/tic.test.ts` lines 22–53):
```typescript
function makeGrid(width: number, height: number, absent: number[] = []): ImagingGrid {
  const totalCells = width * height;
  const coordToSpectrumIndex = new Map<number, number>();
  const presenceMask = new Uint8Array(totalCells);
  const absentSet = new Set(absent);
  for (let key = 0; key < totalCells; key++) {
    if (absentSet.has(key)) continue;
    coordToSpectrumIndex.set(key, key);
    presenceMask[key] = 1;
  }
  return {
    width, height, coordinateBase: 1, pixelSizeUm: null,
    coordToSpectrumIndex, presenceMask,
    filledCount: coordToSpectrumIndex.size,
    totalCells,
    coordSourceStrategy: "promoted-columns",
    diagnostics: {
      spectrumCount: coordToSpectrumIndex.size, uniqueCoordCount: coordToSpectrumIndex.size,
      duplicateCount: 0, missingCount: totalCells - coordToSpectrumIndex.size,
      oobCount: 0, extentSource: "declared", geometrySource: "run-params",
      discoveryDisagreement: null,
    },
  };
}
```

**XIC fixture helper** (`src/compute/tic.test.ts` lines 55–69, emit bigint indices):
```typescript
type XicLike = {
  points: { index: bigint | number; dataArrays: Record<string, ArrayLike<number> | undefined> }[];
};
function makeXic(perSpectrum: Map<number, number[]>): XicLike {
  const points: XicLike["points"] = [];
  for (const [idx, arr] of perSpectrum) {
    points.push({ index: BigInt(idx), dataArrays: { "intensity array": arr } });
  }
  return { points };
}
```

**Test cases to mirror:** Tests 1–5 from `tic.test.ts` (dense sum, orientation, bigint boundary, sparse skip, missing/non-finite). Additionally add tests for `ppmToDa` (D-03: pure arithmetic) and `computeIonImageStats` (present-only min/max/nonzeroCount, absent exclusion).

---

### `src/ui/rasterize.ts` (extend — generalize)

**Self-analog.** Extend the existing file.

**LUT stop structure to replicate** (`src/ui/rasterize.ts` lines 26–36):
```typescript
const VIRIDIS_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84],    // 0.000
  [72, 40, 120],  // 0.125
  // ... 9 stops
  [253, 231, 37], // 1.000
];
```
Add `INFERNO_STOPS` (9 stops, standard matplotlib inferno) and `GRAY` inline — same structure.

**LUT interpolation function to replicate** (`src/ui/rasterize.ts` lines 42–55):
```typescript
export function viridis(norm: number): [number, number, number] {
  const t = Number.isFinite(norm) ? Math.min(Math.max(norm, 0), 1) : 0;
  const segments = VIRIDIS_STOPS.length - 1;
  const scaled = t * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const frac = scaled - i;
  const a = VIRIDIS_STOPS[i];
  const b = VIRIDIS_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}
```
Add `inferno(norm)` in the same shape. `gray` is a one-liner (`(t) => [g,g,g]` where `g = Math.round(clamp(t)*255)`).

**`percentile99` to parameterize** (`src/ui/rasterize.ts` lines 62–75):
```typescript
// Rename to percentileClip(values, presenceMask, p: number) — default p=0.99.
// Change only: line 72: Math.floor(p * (present.length - 1))
function percentile99(tic: Float32Array, presenceMask: Uint8Array): number { ... }
```

**`rasterizeTic` pixel loop to generalize** (`src/ui/rasterize.ts` lines 85–111):
```typescript
export function rasterizeTic(tic: Float32Array, grid: ImagingGrid): Uint8ClampedArray {
  const total = grid.width * grid.height;
  const out = new Uint8ClampedArray(total * 4);
  const { presenceMask } = grid;
  const clipMax = percentile99(tic, presenceMask);   // → percentileClip(..., opts.percentile)
  for (let k = 0; k < total; k++) {
    const o = k * 4;
    if (presenceMask[k] === 0) {
      out[o] = SENTINEL[0]; out[o+1] = SENTINEL[1]; out[o+2] = SENTINEL[2]; out[o+3] = 255;
      continue;
    }
    const raw = tic[k];
    const norm = clipMax > 0 && Number.isFinite(raw) ? Math.min(Math.max(raw / clipMax, 0), 1) : 0;
    const [r, g, b] = viridis(norm);                 // → applyColormap(opts.colormap, norm)
    out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=255;
  }
  return out;
}
```
The new `rasterizeImage(values, grid, opts: RasterizeOpts)` generalizes this loop. Add log branch: when `opts.logScale`, compute `denom = Math.log1p(clipMax)` then `const v = Math.log1p(raw); norm = denom > 0 && raw > 0 ? Math.min(v/denom, 1) : 0`. Keep `rasterizeTic` as a thin wrapper calling `rasterizeImage` with `{ colormap:'viridis', percentile:0.99, logScale:false }`.

**New exports to add:**
```typescript
export type Colormap = "viridis" | "inferno" | "gray";
export interface RasterizeOpts { colormap: Colormap; percentile: number; logScale: boolean; }
export function rasterizeImage(values: Float32Array, grid: ImagingGrid, opts: RasterizeOpts): Uint8ClampedArray
export function inferno(norm: number): [number, number, number]
```

---

### `src/ui/rasterize.test.ts` (extend)

**Self-analog.** Extend existing tests. Reuse the `makeGrid` and `rgbaAt` helpers verbatim (`src/ui/rasterize.test.ts` lines 17–48).

**Existing test structure to mirror** (`src/ui/rasterize.test.ts` lines 50–171):
```typescript
describe("rasterizeTic — output shape (Test 1)", () => {
  it("returns a Uint8ClampedArray of length width*height*4", () => { ... });
});
```
Add new `describe` blocks (after existing ones, do not touch existing tests):
- `rasterizeImage — log scaling`: raw=0 → norm 0; raw=clipMax → norm 1; no NaN (Pitfall 4)
- `rasterizeImage — percentile param`: p=0.90 clips at 90th vs p=0.99 differs
- `rasterizeImage — inferno colormap`: monotonic luminance (do not assert exact RGB — A1)
- `rasterizeImage — gray colormap`: R==G==B for all cells
- `rasterizeImage — sentinel preserved across all colormaps`: absent → SENTINEL regardless of colormap
- `rasterizeTic — still works as before` (regression; existing tests cover this implicitly)

---

### `src/ui/ImagingPanel.tsx` (extend — add controls row + ion-image canvas)

**Self-analog.** Extend the existing component.

**Store slice pattern** (`src/ui/ImagingPanel.tsx` lines 66–79):
```typescript
const grid = useStore((s) => s.grid);
const tic = useStore((s) => s.tic);
const selectedIndex = useStore((s) => s.selectedIndex);
const selectSpectrum = useStore((s) => s.selectSpectrum);
const mixedRepresentationWarning = useStore((s) => s.mixedRepresentationWarning);
```
Add Phase 4 slices in the same pattern:
```typescript
const ionImage = useStore((s) => s.ionImage);
const ionImageStats = useStore((s) => s.ionImageStats);
const mzWindow = useStore((s) => s.mzWindow);
const colormap = useStore((s) => s.colormap);
const scale = useStore((s) => s.scale);
const percentile = useStore((s) => s.percentile);
const renderIonImage = useStore((s) => s.renderIonImage);
const setColormapSettings = useStore((s) => s.setColormapSettings);
```

**Canvas ref + local state pattern** (`src/ui/ImagingPanel.tsx` lines 75–79):
```typescript
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const [readout, setReadout] = useState<{ text: string; muted: boolean }>({ text: "", muted: false });
```
Add a second ref for the ion-image canvas:
```typescript
const ionCanvasRef = useRef<HTMLCanvasElement | null>(null);
```
Add local state for the m/z controls:
```typescript
const [mzInput, setMzInput] = useState<string>("");
const [tolInput, setTolInput] = useState<string>("0.01");
const [tolUnit, setTolUnit] = useState<"Da" | "ppm">("Da");
const [ionReadout, setIonReadout] = useState<{ text: string; muted: boolean }>({ text: "", muted: false });
```

**Two-effect paint+ring pattern** (`src/ui/ImagingPanel.tsx` lines 82–122) — replicate exactly for the ion-image canvas:
```typescript
// Paint pass: rasterize TIC into ImageData and blit at intrinsic resolution.
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

// Selection-ring pass: re-blit THEN stroke ring (Pitfall 6 — putImageData clears composite).
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas || !grid || !tic) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rgba = rasterizeTic(tic, grid);
  const img = new ImageData(grid.width, grid.height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  if (selectedIndex == null) return;
  const key = keyForSpectrumIndex(grid, selectedIndex);
  if (key == null) return;
  const x0 = key % grid.width;
  const y0 = Math.floor(key / grid.width);
  const o = key * 4;
  const lum = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
  ctx.strokeStyle = lum > 140 ? "#000000" : "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, 1, 1);
}, [selectedIndex, tic, grid]);
```
Replicate for ion-image canvas keyed on `[ionImage, grid, colormap, scale, percentile]` (paint) and `[selectedIndex, ionImage, grid, colormap, scale, percentile]` (ring). Use `rasterizeImage(ionImage, grid, { colormap, percentile, logScale: scale === "log" })` in place of `rasterizeTic`.

**Hit-test + hover pattern** (`src/ui/ImagingPanel.tsx` lines 137–171) — reuse `toGridCoord`, `formatCompact`, `onClick` verbatim for the ion-image canvas. Change hover readout label from `TIC:` to `intensity:` and read from `ionImage[hit.key]`.

**Absent-click no-op** (`src/ui/ImagingPanel.tsx` line 169):
```typescript
if (grid.presenceMask[hit.key] === 0) return;  // no-op for absent pixels — copy exactly
```

**Aspect + CSS pattern** (`src/ui/ImagingPanel.tsx` lines 127–133):
```typescript
const aspect = grid.pixelSizeUm ? grid.pixelSizeUm.x / grid.pixelSizeUm.y : 1;
const displayWidth = "100%";
const cssAspectRatio = `${grid.width * aspect} / ${grid.height}`;
```
Both canvases use the same `cssAspectRatio` (they represent the same grid).

**Canvas JSX element pattern** (`src/ui/ImagingPanel.tsx` lines 199–215):
```tsx
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
```
Clone for the ion-image canvas (`data-testid="ion-canvas"`, `ref={ionCanvasRef}`). Wrap in `{ionImage !== null && (...)}` — no placeholder until first render (D-04).

**Warning display pattern** (`src/ui/ImagingPanel.tsx` lines 182–188) — reuse for the stats line:
```tsx
{ionImageStats && (
  <div data-testid="ion-stats" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
    {ionImageStats.nonzeroCount} / {grid.filledCount} pixels with signal ·
    range {formatCompact(ionImageStats.min)}–{formatCompact(ionImageStats.max)} ·
    scale: {scale} ({Math.round(percentile * 100)}th pct)
  </div>
)}
```

---

### `src/ui/SpectrumPanel.tsx` (extend — wire SPEC-02 band)

**Self-analog.** The Phase 3 file already has the `MzWindow` type and `_props.mzWindow` no-op placeholder to activate.

**uPlot imperative mount pattern** (`src/ui/SpectrumPanel.tsx` lines 63–102):
```typescript
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const opts: uPlot.Options = {
    width: el.clientWidth || 640,
    height: 360,
    title: "Spectrum",
    scales: { x: { time: false } },
    series: [
      { label: "m/z" },
      { label: "intensity", stroke: "#1565c0", width: 1, points: { show: false } },
    ],
    axes: [{ label: "m/z" }, { label: "intensity" }],
  };
  const plot = new uPlot(opts, [new Float64Array(0), new Float64Array(0)], el);
  plotRef.current = plot;
  // ...resize listener...
  return () => { window.removeEventListener("resize", onResize); plot.destroy(); plotRef.current = null; };
}, []);
```
Add `hooks.draw` to the `opts` object before creating the plot:
```typescript
const mzWindowRef = useRef<{ mz: number; tolDa: number } | null>(null);

// In opts:
hooks: {
  draw: [(u: uPlot) => {
    const w = mzWindowRef.current;
    if (!w) return;
    const xLo = u.valToPos(w.mz - w.tolDa, "x", true);
    const xHi = u.valToPos(w.mz + w.tolDa, "x", true);
    const { ctx } = u;
    ctx.save();
    ctx.fillStyle = "rgba(255,200,0,0.25)";
    ctx.fillRect(xLo, u.bbox.top, xHi - xLo, u.bbox.height);
    ctx.restore();
  }],
},
```
Add a second effect (after the mount effect) to sync `mzWindow` from the store into the ref and trigger `plot.redraw()` (RESEARCH Pattern 5, Pitfall 5):
```typescript
const mzWindow = useStore((s) => s.mzWindow);
useEffect(() => {
  mzWindowRef.current = mzWindow;
  plotRef.current?.redraw();
}, [mzWindow]);
```

**Data feed pattern** (`src/ui/SpectrumPanel.tsx` lines 104–117) — unchanged:
```typescript
useEffect(() => {
  const plot = plotRef.current;
  if (!plot) return;
  if (!selectedSpectrum) { plot.setData([new Float64Array(0), new Float64Array(0)]); return; }
  plot.setData([selectedSpectrum.mz, selectedSpectrum.intensity as unknown as number[]]);
}, [selectedSpectrum]);
```

**Remove the no-op `void _props.mzWindow`** (line 30) and read `mzWindow` from the store directly — the prop signature can be simplified or removed since the store is the authority.

---

### `src/state/store.ts` (extend — add mzWindow slice + 2 actions)

**Self-analog.** Extend the existing store.

**Imports to add** (`src/state/store.ts` lines 1–19):
```typescript
// Add to existing imports block:
import { buildIonImage, computeIonImageStats, ppmToDa } from "../compute/ionImage";
import { rasterizeImage, type Colormap } from "../ui/rasterize";
```

**State type extension** (`src/state/store.ts` lines 61–76) — add to the `State` type:
```typescript
// Phase 4 additions — after existing fields:
mzWindow: { mz: number; tolDa: number } | null;
ionImage: Float32Array | null;
ionImageStats: { nonzeroCount: number; min: number; max: number } | null;
colormap: Colormap;
scale: "linear" | "log";
percentile: number;
```

**Actions type extension** — add to `Actions`:
```typescript
renderIonImage: (mz: number, tolDa: number) => Promise<void>;
setColormapSettings: (colormap: Colormap, scale: "linear" | "log", percentile: number) => void;
```

**`initialState` extension** (`src/state/store.ts` lines 84–97):
```typescript
// Add to initialState:
mzWindow: null,
ionImage: null,
ionImageStats: null,
colormap: "viridis",
scale: "linear",
percentile: 0.99,
```

**`renderIonImage` action — mirrors `selectSpectrum` try/classifyError shape** (`src/state/store.ts` lines 239–255):
```typescript
async selectSpectrum(index: number) {
  const reader = get().reader;
  if (!reader) return;
  try {
    // ... reader call ...
    set({ selectedIndex: index, selectedSpectrum });
  } catch (err) {
    set({ stage: "error", error: classifyError(err) });
  }
},
```
Apply the same try/classifyError shape for `renderIonImage`:
```typescript
async renderIonImage(mz: number, tolDa: number) {
  const { reader, grid, stats } = get();
  if (!reader || !grid || !stats) return;
  // V5 input validation: reject non-finite / non-positive inputs.
  if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
  try {
    const { profile, centroid } = stats.representationCounts;
    const useProfile = profile >= centroid;     // reuse D-08 majority rule (store.ts:168)
    const xic = await reader.extractXIC(null, { start: mz - tolDa, end: mz + tolDa }, useProfile);
    const ionImage = xic ? buildIonImage(xic, grid) : null;
    const ionImageStats = ionImage ? computeIonImageStats(ionImage, grid) : null;
    set({ ionImage, ionImageStats, mzWindow: { mz, tolDa } });
  } catch (err) {
    set({ stage: "error", error: classifyError(err) });
  }
},
```

**`setColormapSettings` action — state mutation only, no file I/O** (D-02/SC-5):
```typescript
setColormapSettings(colormap: Colormap, scale: "linear" | "log", percentile: number) {
  set({ colormap, scale, percentile });    // render effect in ImagingPanel re-rasterizes cache
},
```

**`useProfile` majority rule to reuse verbatim** (`src/state/store.ts` lines 167–168):
```typescript
const { profile, centroid } = stats.representationCounts;
const useProfile = profile >= centroid;
```
Copy this exact pattern into `renderIonImage`; do not re-derive.

**`yieldFrame` + `classifyError` utilities** (`src/state/store.ts` lines 39–59) — unchanged; both are available inside the new actions:
```typescript
const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function classifyError(err: unknown): StoreError { ... }
```

---

## Shared Patterns

### Bigint boundary conversion (Pitfall 1)
**Source:** `src/compute/tic.ts` line 66
**Apply to:** `src/compute/ionImage.ts` — `buildIonImage`
```typescript
const sIdx = Number(point.index);  // FIRST op — bigint → number before Map.get()
```

### Sentinel RGBA for absent pixels (D-09 / C8)
**Source:** `src/ui/rasterize.ts` lines 18, 93–97
**Apply to:** `rasterizeImage` in `src/ui/rasterize.ts`
```typescript
const SENTINEL: readonly [number, number, number] = [0x1a, 0x1a, 0x1a];
// In loop:
if (presenceMask[k] === 0) {
  out[o] = SENTINEL[0]; out[o+1] = SENTINEL[1]; out[o+2] = SENTINEL[2]; out[o+3] = 255;
  continue;
}
```

### Non-finite element guard
**Source:** `src/compute/tic.ts` line 80
**Apply to:** `buildIonImage`, `computeIonImageStats`
```typescript
sum += typeof v === "number" && Number.isFinite(v) ? v : 0;
```

### Present-only percentile exclusion
**Source:** `src/ui/rasterize.ts` lines 63–70
**Apply to:** `computeIonImageStats` in `src/compute/ionImage.ts`, `percentileClip` in `src/ui/rasterize.ts`
```typescript
if (presenceMask[k] === 0) continue;  // absent — excluded from stats and clip ceiling
```

### No flip / no transpose (C2 MANDATORY)
**Source:** `src/compute/tic.ts` lines 58–62; `src/ui/ImagingPanel.tsx` lines 29–31
**Apply to:** `buildIonImage`, ion-image canvas paint effect, `rasterizeImage`
```typescript
// Key formula: key = y0*width + x0 — reused by inverting coordToSpectrumIndex.
// Never reorder the output — orientation is owned by the grid upstream.
```

### try/classifyError store action shape
**Source:** `src/state/store.ts` lines 239–255
**Apply to:** `renderIonImage` action in `src/state/store.ts`
```typescript
try {
  // ... async reader call ...
  set({ ... });
} catch (err) {
  set({ stage: "error", error: classifyError(err) });
}
```

### Two-effect canvas paint + ring (Pitfall 6)
**Source:** `src/ui/ImagingPanel.tsx` lines 82–122
**Apply to:** ion-image canvas effects in `ImagingPanel.tsx`
```typescript
// Effect 1 keyed on [data, grid, colormapSettings]: putImageData
// Effect 2 keyed on [selectedIndex, data, grid, colormapSettings]: re-putImageData then strokeRect
// putImageData overwrites composite — must re-blit before stroking the ring.
```

### Luminance-contrast ring color
**Source:** `src/ui/ImagingPanel.tsx` lines 116–119
**Apply to:** ion-image canvas ring effect
```typescript
const lum = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
ctx.strokeStyle = lum > 140 ? "#000000" : "#ffffff";
```

---

## No Analog Found

None — all files have exact or self analogs. The Phase 4 additions are deliberate extensions of Phase 3 patterns.

---

## Metadata

**Analog search scope:** `src/compute/`, `src/ui/`, `src/state/`, `src/imaging/`
**Files read:** 9 source files
**Pattern extraction date:** 2026-06-03
