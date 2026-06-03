# Phase 4: Ion Image + Intensity Scaling - Research

**Researched:** 2026-06-03
**Domain:** Mass-spectrometry-imaging ion-image rendering — m/z-windowed XIC aggregation, Canvas-2D colormap/scaling render transforms, uPlot annotation overlay
**Confidence:** HIGH (entirely an extension of the proven Phase 3 codebase; all primitives verified by reading the vendored reader + existing source)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Rendering an ion image requires the user to click an explicit **"Show Ion Image" button**. No debounce/live-update while typing — `extractXIC` blocks the main thread at Phase-4 scale; the Worker is Phase 5.
- **D-02:** **Colormap and scale changes re-rasterize the cached `Float32Array` automatically** without pressing the button (no file re-query). Locked from ROADMAP SC-5. Only m/z or tolerance changes require the button.
- **D-03:** ppm → Da conversion: `tol_da = (mz * ppm_tol) / 1e6` — computed at center m/z before calling `extractXIC`. Unit-tested as a standalone pure function.
- **D-04:** Phase 4 uses **two separate canvases**: the TIC canvas always remains visible above; the ion-image canvas appears **below** the compact controls row, rendered only after the first "Show Ion Image" click (no placeholder until then).
- **D-05:** **Both canvases wire to `selectSpectrum`** for pixel-click. Clicking an ion-image pixel selects that pixel's spectrum (same as TIC). SPEC-02's m/z-window marker therefore also appears after an ion-image pixel-click.
- **D-06:** The ion-image canvas reuses the same hit-test (`toGridCoord`), hover readout, and selection-ring patterns from `ImagingPanel.tsx`. Hover readout shows `x: N, y: N · intensity: N` (the XIC-aggregated value, not TIC sum). Missing pixels render as the `#1a1a1a` sentinel.
- **D-07:** All controls live in a **single compact row above the TIC canvas**: `m/z` | `±` | `tolerance` | `Da/ppm` select | `[Show Ion Image]` | colormap select | `linear/log` toggle | percentile-clip select.
- **D-08:** **Colormaps:** Viridis (default, already in `rasterize.ts`), Inferno, Grayscale. Phase 4 adds Inferno + Grayscale LUTs alongside `viridis()`.
- **D-09:** **Percentile clip:** preset dropdown `90th / 95th / 99th (default) / 99.9th`. Wires into a parameterized `percentile99` signature (no longer hardcoded 0.99).
- **D-10:** **linear/log toggle:** log scaling uses `Math.log1p(v)` on raw values before normalization. Stats readout labels the mode explicitly.
- **D-11:** **Text stats line below the ion-image canvas**: `{N} / {total} pixels with signal · range {min}–{max} · scale: {linear|log} ({Nth} pct)`. Uses `formatCompact()`. Always visible when the ion image is rendered.
- **D-12:** **SPEC-02 m/z window marker:** a **translucent shaded band** (filled rect) on the uPlot spectrum chart spanning `[mz - tol_da, mz + tol_da]`, via uPlot's `hooks.draw` (DOM-free, matches imperative mount). Renders only when an m/z has been entered (`mzWindow !== null`).

### Claude's Discretion
- Exact Inferno LUT anchor values (use standard matplotlib 9-stop anchors).
- Where `computeIonImageStats` lives (inside `buildIonImage` vs a sibling pure fn).
- Whether to keep `Colormap` as a string union or a function — CONTEXT leans union; researcher concurs (see Pattern 2).
- Control-row styling/spacing (functional plumbing only; visual polish is Phase 5).

### Deferred Ideas (OUT OF SCOPE)
- Debounced live updates (after Phase 5 Worker).
- Histogram (text stats covers ROADMAP SC-3 "and/or").
- Web Worker offload for ion-image compute (Phase 5).
- Mean/sum/max aggregation toggle (v2).
- Shareable deep-link URL encoding (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **IMAGE-02** | Render an ion image for a user-entered *m/z* with tolerance in Da or ppm. | `extractXIC(null, mzRange, useProfile)` slices each spectrum to the m/z window server-side (verified `data.ts:1134`); `buildIonImage` sums the windowed intensity per point onto its grid cell — a near-clone of `buildTic`. ppm→Da is a 1-line pure fn (D-03). |
| **IMAGE-03** | Choose a colormap and intensity-scaling mode (linear/log) with percentile clipping so HDR images aren't blank. | `rasterize.ts` already isolates `viridis()` + `percentile99()` as pure swappable fns. Generalize `rasterizeTic`→`rasterizeImage(values, grid, colormap, percentile, logScale)`; add Inferno/Gray LUTs; parameterize percentile; `Math.log1p` for log (D-08/09/10). |
| **SPEC-02** | Mark the selected *m/z* ± tolerance window on the spectrum. | uPlot `hooks.draw` exposes `self.ctx`, `self.valToPos(v,'x',true)`, `self.bbox`; fill a translucent rect over `[valToPos(mzLo) … valToPos(mzHi)]` (D-12). `SpectrumPanel` already has the `MzWindow` placeholder prop and imperative mount — wire it. |
</phase_requirements>

## Summary

Phase 4 is the headline deliverable but is, structurally, a **thin extension of the Phase 3 pipeline that already works end-to-end**. Every primitive it needs exists and is proven: `extractXIC` is the same reader call used for TIC (Phase 3 D-01); `rasterize.ts` was deliberately written with a swappable `viridis()` and a present-only `percentile99()` so a selector could be added "without a refactor"; `ImagingPanel.tsx` already owns the resolution/aspect-safe hit-test, hover readout, sentinel render, and selection-ring passes; `SpectrumPanel.tsx` already carries a no-op `MzWindow` prop placed there specifically for Phase 4.

The one genuinely new piece of reader behavior to internalize: when `extractXIC` is called with a non-null `mzRange`, **the reader slices each spectrum's data arrays down to only the m/z points inside `[mzMin, mzMax]` before returning** (verified in `data.ts` `extractRangeFor`). So `buildIonImage` is almost identical to `buildTic` — sum each point's (now-windowed) intensity array onto its grid cell — and **spectra with no points in the window are simply not returned**, leaving those present cells at genuine `0` (an in-window zero, distinct from the absent-pixel sentinel that the rasterizer already handles via `presenceMask`).

The remaining work is (1) a `mzWindow`/`ionImage`/`ionImageStats` store slice plus a `renderIonImage(mz, tolDa)` action and a `setColormapSettings` action that recolors from the cached `Float32Array` without re-querying (D-02/SC-5); (2) generalizing the rasterizer to take colormap/percentile/log parameters; (3) a controls row + second canvas in `ImagingPanel`; and (4) a uPlot `draw` hook in `SpectrumPanel` for the shaded band.

**Primary recommendation:** Mirror Phase 3 exactly. Add `src/compute/ionImage.ts` as a near-clone of `tic.ts` (`buildIonImage(xic, grid) → Float32Array` + `computeIonImageStats(values, grid) → {nonzeroCount,min,max}`); generalize `rasterizeTic`→`rasterizeImage(values, grid, {colormap, percentile, logScale})` keeping `rasterizeTic` as a thin default-args wrapper so Phase 3 callers/tests don't break; add `mzWindow`/`ionImage`/`ionImageStats` to the store with `renderIonImage` (file read, button-triggered) and `setColormapSettings` (recolor-only, auto); add the controls row + ion-image canvas to `ImagingPanel`; and draw the SPEC-02 band via uPlot `hooks.draw` reading `mzWindow` from the store. Keep all transform logic in pure, DOM-free functions for Vitest (the established split). Do **not** introduce a flip/transpose (C2) — reuse the existing `y0*width+x0` key inversion.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ppm → Da conversion | Pure util (`src/compute/` or inline pure fn) | — | Stateless arithmetic; unit-tested in isolation (D-03). No reader/DOM. |
| m/z-window XIC read (file I/O) | Reader (`extractXIC`) | Store action `renderIonImage` | Only `src/reader/` touches mzpeakts/Arrow. Store orchestrates the async + staged set. |
| Window-sum → `Float32Array` raster + stats | Compute (`src/compute/ionImage.ts`) | — | Pure aggregation over plain XIC points; mirrors `buildTic`. No Canvas, no Arrow. |
| `Float32Array` → RGBA (colormap, percentile, log, sentinel) | UI render (`src/ui/rasterize.ts`, pure) | — | Pure transform; Canvas-facing but DOM-free → Vitest-testable. |
| Canvas blit + hit-test + hover + ring | UI component (`ImagingPanel.tsx`) | — | Imperative Canvas-2D, reuses Phase 3 patterns. |
| Cached-raster recolor on colormap/scale change | Store (`setColormapSettings`) + UI re-render | UI render | Recolor must NOT re-query the file (D-02/SC-5) — colormap state in store, raster cached, render effect re-keys on colormap state. |
| SPEC-02 m/z band overlay | UI component (`SpectrumPanel.tsx` uPlot `hooks.draw`) | Store (`mzWindow`) | uPlot owns its canvas; the draw hook is the DOM-free annotation seam. |

## Standard Stack

No new runtime dependencies. Phase 4 is built entirely on packages already installed and proven in Phases 1–3.

### Core (already present)
| Library | Version (installed) | Purpose in Phase 4 | Why standard |
|---------|--------------------|--------------------|--------------|
| `uplot` | 1.6.32 | SPEC-02 shaded m/z band via `hooks.draw` | Already the spectrum chart; `draw` hook gives raw `ctx` + `valToPos` — no plugin/dep needed. [VERIFIED: node_modules/uplot/dist/uPlot.d.ts lines 1160–1166, 117] |
| `apache-arrow` / `parquet-wasm` / `mzpeakts` | 21.x / 0.7.1 / vendored | `extractXIC(null, mzRange, useProfile)` ion-image read | Same reader chain as TIC (Phase 3 D-01). [VERIFIED: vendor/mzpeakts/lib/src/reader.ts:252, data.ts:1118] |
| `zustand` | (installed) | `mzWindow` / `ionImage` / `ionImageStats` slice + actions | Existing store pattern. [VERIFIED: src/state/store.ts:1] |
| React / react-dom | 19.x | Controls row + second canvas | Existing UI. |

### Supporting (already present, dev)
| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.8 | Unit tests: `ppmToDa`, `buildIonImage`, `computeIonImageStats`, `rasterizeImage` (colormaps/percentile/log) | All new pure logic — mirrors `tic.test.ts` + `rasterize.test.ts`. |
| `@playwright/test` | 1.60.0 | (Optional) e2e: enter m/z → Show Ion Image → click pixel → band appears | Validates the real WASM+Canvas+uPlot path if a fixture exists. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rasterizeImage` string-union `Colormap` | A `(t)=>[r,g,b]` function-typed colormap | Function type is more extensible but Phase 4 has a fixed set of 3; the union keeps the LUT switch local and the value JSON-serializable into the store (recolor state). Use the **union** (CONTEXT D-08; researcher concurs). |
| uPlot `hooks.draw` band | A separate React-positioned `<div>` overlay | A DOM overlay must track zoom/pan/resize and devicePixelRatio manually; `draw` fires inside every redraw with correct `valToPos` — strictly simpler and stays inside the imperative mount. Use the **draw hook** (D-12). |
| New `ionImage.ts` | Extend `buildTic` with an optional window flag | A separate file mirrors the established 1-builder-per-image-type structure and keeps each pure fn single-purpose. Use a **new file** (CONTEXT code_context). |

**Installation:** None. `npm ci` already provides everything.

**Version verification:** `uplot@1.6.32` confirmed installed (`package.json`); `hooks.draw`, `self.ctx`, `self.valToPos`, `self.bbox` confirmed in the shipped `.d.ts`. No registry install needed.

## Package Legitimacy Audit

Phase 4 installs **no new external packages** — it consumes only packages already vetted in the Phase 1 stack research (see CLAUDE.md "Recommended Stack" + Sources, all `npm view`-verified). The Package Legitimacy Gate therefore has nothing to add: there are zero new registry fetches, zero new `postinstall` scripts, and no new supply-chain surface.

| Package | Registry | Disposition |
|---------|----------|-------------|
| *(none — all deps pre-existing and previously audited)* | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none (no new packages).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram (Phase 4 data flow)

```
                    ┌─────────────────── ImagingPanel (controls row, D-07) ───────────────────┐
 user types m/z,    │  [m/z] ± [tol] [Da|ppm▾] [Show Ion Image]  [colormap▾] [lin|log] [pct▾]│
 tol, picks units   └───────┬───────────────────────────────────────┬───────────────────────┘
                            │ click "Show Ion Image"                 │ change colormap / scale / pct
                            ▼ (file read — D-01)                      ▼ (recolor only — D-02 / SC-5)
                 store.renderIonImage(mz, tolDa)            store.setColormapSettings(cmap,scale,pct)
                            │                                         │ (no extractXIC, no file I/O)
            tolDa = ppmToDa(mz,ppm) if unit==ppm                      │
            mzRange = {start: mz-tolDa, end: mz+tolDa}                │
                            │                                         │
                            ▼                                         │
   reader.extractXIC(null, mzRange, useProfile)  ── slices each       │
            spectrum to [mzLo,mzHi] (data.ts:1134) ──┐               │
                            │                         │               │
                            ▼                         │               │
   buildIonImage(xic, grid) → Float32Array  ◄─────────┘               │
   computeIonImageStats(values, grid) → {nonzeroCount,min,max}        │
                            │                                         │
            store.ionImage = Float32Array (CACHED)  ◄─────────────────┘ reads cached ionImage
            store.ionImageStats = {...}              store.colormap/scale/percentile = ...
            store.mzWindow = {mz, tolDa}
                            │                                         │
                            ▼ (render effect, keyed on [ionImage, colormap, scale, percentile])
   rasterizeImage(ionImage, grid, {colormap, percentile, logScale}) → Uint8ClampedArray
                            │
                            ▼
   ImageData → putImageData → strokeRect ring   (second ion-image <canvas>, D-04)
   hit-test/hover/click reuse toGridCoord → selectSpectrum (D-05/D-06)
                            │
        click a pixel ──────┘
                            ▼
   SpectrumPanel: selectedSpectrum redraws; hooks.draw reads store.mzWindow
                 → ctx.fillRect over [valToPos(mzLo) … valToPos(mzHi)]  (SPEC-02, D-12)
```

### Recommended Project Structure (additions only)

```
src/
├── compute/
│   ├── tic.ts                  # existing — buildTic
│   ├── ionImage.ts             # NEW: buildIonImage(xic,grid)→Float32Array;
│   │                           #      computeIonImageStats(values,grid)→stats; ppmToDa(mz,ppm)
│   └── ionImage.test.ts        # NEW: mirrors tic.test.ts
├── ui/
│   ├── rasterize.ts            # GENERALIZE: rasterizeImage(values,grid,opts); add inferno/gray LUTs
│   │                           #             keep rasterizeTic as thin wrapper (no Phase-3 break)
│   ├── rasterize.test.ts       # EXTEND: log scaling, percentile param, inferno/gray, sentinel
│   ├── ImagingPanel.tsx        # ADD: controls row + ion-image canvas section
│   └── SpectrumPanel.tsx       # ADD: hooks.draw band reading store.mzWindow
└── state/
    └── store.ts                # ADD: mzWindow, ionImage, ionImageStats, colormap/scale/percentile,
                                #      renderIonImage(), setColormapSettings()
```

### Pattern 1: `extractXIC(null, mzRange, useProfile)` returns m/z-WINDOWED per-spectrum arrays

**What:** Unlike the TIC call (`mzRange = null` → full spectrum), passing a non-null `mzRange` makes the reader slice each spectrum's data arrays to only points within `[start, end]`. Spectra with no points in the window are **not** returned at all.

**Why it matters:** `buildIonImage` does NOT need to filter m/z itself — the reader already did. It just sums each (windowed) point's intensity array onto its grid cell, exactly like `buildTic`. Cells whose spectrum had zero in-window points stay `0` (genuine in-window-zero). The absent-vs-zero distinction remains a *render* concern (`presenceMask`, already handled).

```typescript
// Source: vendor/mzpeakts/lib/src/data.ts:1134-1166 (extractRangeFor) + reader.ts:252 (extractXIC)
// When coordinateRange (mzRange) is set, the reader calls betweenSorted() on the sorted
// m/z column and slices the table to [idxRange[0], idxRange[1]] before packing dataArrays.
// Points with no in-window data are skipped (not pushed) → that spectrum is absent from xic.points.
const mzRange = { start: mz - tolDa, end: mz + tolDa };   // Span1D {start,end}, NOT [min,max]
const xic = await reader.extractXIC(null, mzRange, useProfile);
```

> ⚠️ **Span1D shape:** `mzRange` is `{ start: number; end: number }` (verified `utils.ts:169`), **not** a `[min,max]` tuple. CONTEXT prose says `mzRange = [mz - tol, mz + tol]` — the planner must translate to `{start, end}` at the reader call. The narrow window where this differs from `buildTic` is the call site only; downstream `buildIonImage` is shape-identical to `buildTic`.

### Pattern 2: `buildIonImage` is `buildTic` with a different name

**What:** Same reverse-map (`spectrumIndex → grid key`), same `Number(point.index)` boundary conversion, same per-element `typeof v === "number" && Number.isFinite(v)` guard, same `key = y0*width+x0` (no flip, C2).

```typescript
// Source: pattern verified against src/compute/tic.ts:54 (buildTic) — clone it.
import type { ImagingGrid } from "../imaging/types";
const INTENSITY_KEY = "intensity array";

export function buildIonImage(xic: XicLike, grid: ImagingGrid): Float32Array {
  const img = new Float32Array(grid.width * grid.height);
  const idxToKey = new Map<number, number>();
  for (const [key, sIdx] of grid.coordToSpectrumIndex) idxToKey.set(sIdx, key);
  for (const point of xic.points) {
    const sIdx = Number(point.index);                       // bigint→number FIRST (Pitfall 1)
    const key = idxToKey.get(sIdx);
    if (key === undefined) continue;                        // off-grid — skip
    const arr = point.dataArrays[INTENSITY_KEY];
    if (!arr) continue;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      sum += typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    img[key] = sum;                                         // already windowed by the reader
  }
  return img;
}
```

> The local `XicLike`/`XicPointLike` structural interfaces in `tic.ts` (no Arrow/mzpeakts import) must be reused/duplicated so `compute/` stays above the reader boundary.

### Pattern 3: `computeIonImageStats` — present-cells-only (mirrors `percentile99` exclusion)

```typescript
// nonzeroCount/min/max computed over PRESENT cells only (presenceMask[k] !== 0),
// matching percentile99's exclusion so an absent cell's 0 never counts as "no signal here".
export function computeIonImageStats(values: Float32Array, grid: ImagingGrid) {
  const { presenceMask } = grid;
  let nonzeroCount = 0, min = Infinity, max = -Infinity;
  const n = Math.min(values.length, presenceMask.length);
  for (let k = 0; k < n; k++) {
    if (presenceMask[k] === 0) continue;                    // absent — not "present-with-zero"
    const v = values[k];
    if (!Number.isFinite(v)) continue;
    if (v !== 0) nonzeroCount++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 0; }          // no present finite values
  return { nonzeroCount, min, max };
}
```

> **Design choice (D-11):** "pixels with signal" = nonzero present cells; "range" = min/max over present cells. Decide explicitly whether the displayed `min` is over all present cells (likely includes 0 for in-window-zero pixels) or over nonzero cells only — recommend min/max over **present** cells and report `nonzeroCount` separately, so the line literally answers "blank because scaling vs blank because absent" (SC-3).

### Pattern 4: Generalize `rasterizeTic` → `rasterizeImage` (keep Phase-3 callers working)

```typescript
// Source: extend src/ui/rasterize.ts (existing viridis + percentile99 + rasterizeTic).
export type Colormap = "viridis" | "inferno" | "gray";

function applyColormap(cmap: Colormap, t: number): [number, number, number] {
  switch (cmap) {
    case "inferno": return inferno(t);          // NEW 9-stop matplotlib inferno LUT
    case "gray": { const g = Math.round(Math.min(Math.max(t,0),1)*255); return [g,g,g]; }
    case "viridis":
    default: return viridis(t);                 // existing
  }
}

// percentile99 → percentileClip(values, presenceMask, p)  (p∈(0,1], default 0.99)
// (parameterize the hardcoded 0.99 at rasterize.ts:72; D-09)

export interface RasterizeOpts { colormap: Colormap; percentile: number; logScale: boolean; }

export function rasterizeImage(
  values: Float32Array, grid: ImagingGrid, opts: RasterizeOpts,
): Uint8ClampedArray {
  const { presenceMask } = grid;
  const clipMax = percentileClip(values, presenceMask, opts.percentile);
  // D-10 log: normalize via log1p so raw=0 → 0 exactly, never negative for v≥0.
  const denom = opts.logScale ? Math.log1p(clipMax) : clipMax;
  const out = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let k = 0; k < grid.width * grid.height; k++) {
    const o = k * 4;
    if (presenceMask[k] === 0) { out[o]=0x1a; out[o+1]=0x1a; out[o+2]=0x1a; out[o+3]=255; continue; }
    const raw = values[k];
    let norm = 0;
    if (denom > 0 && Number.isFinite(raw) && raw > 0) {
      const v = opts.logScale ? Math.log1p(raw) : raw;
      norm = Math.min(Math.max(v / denom, 0), 1);
    }
    const [r,g,b] = applyColormap(opts.colormap, norm);
    out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=255;
  }
  return out;
}

// Keep Phase-3 callers/tests green: rasterizeTic becomes a thin default-opts wrapper.
export function rasterizeTic(tic: Float32Array, grid: ImagingGrid): Uint8ClampedArray {
  return rasterizeImage(tic, grid, { colormap: "viridis", percentile: 0.99, logScale: false });
}
```

> **Inferno LUT (D-08, Claude's discretion):** use standard matplotlib inferno 9 evenly-spaced anchors, e.g. `[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[250,193,39],[252,255,164]` (8 stops shown — pad to the same 9-stop structure `viridis` uses; the exact bytes are cosmetic, not a correctness invariant — tag `[ASSUMED]` and let the planner snapshot-test only monotonic luminance, not exact RGB).

### Pattern 5: SPEC-02 shaded band via uPlot `hooks.draw`

```typescript
// Source: node_modules/uplot/dist/uPlot.d.ts — draw?:(self)=>void (1166), self.ctx (22),
//   valToPos(val, scaleKey, canvasPixels?) (117), self.bbox (25).
// Add to the uPlot Options.hooks at mount; read mzWindow from the store inside the closure
// (or store it in a ref the hook reads, so the band updates without re-creating the plot).
hooks: {
  draw: [(u: uPlot) => {
    const w = mzWindowRef.current;            // {mz, tolDa} | null
    if (!w) return;
    const xLo = u.valToPos(w.mz - w.tolDa, "x", true);   // canvasPixels=true → device px
    const xHi = u.valToPos(w.mz + w.tolDa, "x", true);
    const { ctx } = u;
    ctx.save();
    ctx.fillStyle = "rgba(255,200,0,0.25)";
    ctx.fillRect(xLo, u.bbox.top, xHi - xLo, u.bbox.height);
    ctx.restore();
  }],
}
```

> **Why a ref, not a dep:** the uPlot instance is created once in a `useEffect([])`. To make the band track a changing `mzWindow` without destroying/recreating the plot, store `mzWindow` in a `useRef` updated by a separate effect, and call `plot.redraw()` when it changes (uPlot re-runs `draw` on `redraw()`). `valToPos` with `canvasPixels=true` returns device-pixel coords matching `ctx`; `bbox.top/.height` bound the plot area (verified `.d.ts:25`).

### Anti-Patterns to Avoid
- **Re-querying the file on colormap/scale change.** Violates D-02/SC-5. Colormap/scale/percentile changes must read the cached `store.ionImage` and only re-run `rasterizeImage`. The button (`renderIonImage`) is the *only* path that calls `extractXIC`.
- **Introducing a flip/transpose in the ion-image rasterizer.** C2 mandatory; reuse the `y0*width+x0` key. The ion-image canvas and TIC canvas share orientation by construction.
- **Filtering m/z inside `buildIonImage`.** The reader already windowed the arrays (Pattern 1). Double-filtering is wrong and wasteful.
- **Passing `mzRange` as a `[min,max]` array.** It is a `Span1D {start,end}` (Pattern 1).
- **Computing the band in CSS pixels with a DOM overlay.** Use `valToPos(..., 'x', true)` inside `draw` (Pattern 5).
- **Letting an in-window-zero present pixel render as the absent sentinel** (or vice-versa). Presence comes from `presenceMask`, value from `ionImage` — never conflate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| m/z-window slicing per spectrum | A manual loop filtering each spectrum's m/z array | `extractXIC(null, mzRange, …)` | Reader does a sorted `betweenSorted` slice in WASM/Arrow space (`data.ts:1134`); reimplementing is slower and risks dtype/precision bugs. |
| Spectrum-chart annotation overlay | A positioned `<div>` tracking zoom/pan/DPR | uPlot `hooks.draw` + `valToPos` | uPlot recomputes pixel positions on every redraw; the hook gets correct device-pixel coords for free. |
| Colormap interpolation | Per-pixel HSV math or a color library | The existing 9-stop LUT + linear interp in `viridis()` | Already written, tested, perceptually uniform; just add 2 more LUTs in the same shape. |
| Percentile clip | A new sorting routine | Parameterize the existing `percentile99` | Already excludes absent/non-finite cells correctly. |
| Pointer→grid hit-test | New `offsetX` math | `toGridCoord` from `ImagingPanel.tsx` | Already resolution- and aspect-safe (Phase 3 Pitfall 5). |

**Key insight:** Phase 4 adds *zero* new algorithms — every transform is either already present (`viridis`, `percentile99`, `toGridCoord`, the `ImageData` blit) or a parameterized/cloned variant of one. The risk is integration (store wiring, cache-vs-requery discipline), not invention.

## Runtime State Inventory

Not applicable — Phase 4 is a greenfield feature addition (new code + new store slice), **not** a rename/refactor/migration. No existing stored data, service config, OS-registered state, secrets, or build artifacts carry a string this phase changes.

**Verified:** the only renames are *internal symbol* generalizations (`rasterizeTic`→`rasterizeImage`, `percentile99`→`percentileClip`) fully contained in `src/`, with a `rasterizeTic` compatibility wrapper retained so no caller or test breaks. No persisted state, no external system, no build artifact references these symbols. None in any category — verified by reading all callers (`ImagingPanel.tsx`, `rasterize.test.ts`).

## Common Pitfalls

### Pitfall 1: `bigint` leak from `XICPoint.index` (inherited from Phase 3)
**What goes wrong:** `XICPoint.index` is a `bigint` (`reader.ts:21`). `Map<number,…>.get(bigint)` misses the key → every pixel scatters nowhere → blank ion image.
**Why it happens:** Arrow indices arrive as bigint at the reader boundary.
**How to avoid:** `Number(point.index)` as the **first** op in `buildIonImage` (exact for pixel-scale indices ≪ 2^53). Identical to `tic.ts:65`.
**Warning sign:** ion image is all-sentinel/all-zero despite a valid m/z.

### Pitfall 2: Recolor accidentally re-queries the file
**What goes wrong:** Wiring colormap/scale changes through `renderIonImage` re-runs `extractXIC` on every dropdown change — slow, and violates SC-5/D-02.
**Why it happens:** Convenience of one action.
**How to avoid:** Two distinct store actions: `renderIonImage(mz,tolDa)` (button-only, does the file read + caches `ionImage`) and `setColormapSettings(colormap,scale,percentile)` (mutates only the colormap state). The canvas render effect keys on `[ionImage, colormap, scale, percentile]` and calls `rasterizeImage` over the cached array.
**Warning sign:** a spinner/network/CPU spike when changing colormap; e2e shows a re-read.

### Pitfall 3: `Span1D` vs tuple at the `extractXIC` call
**What goes wrong:** Passing `[lo, hi]` where `{start, end}` is expected → reader treats it as `null`/garbage → unwindowed (full-spectrum) sums → ion image == TIC.
**How to avoid:** Build `{ start: mz - tolDa, end: mz + tolDa }` (verified `utils.ts:169`).
**Warning sign:** the ion image looks identical to the TIC regardless of m/z.

### Pitfall 4: Log scaling producing NaN/negative norms
**What goes wrong:** `Math.log(0) = -Infinity`; naive `log(v)/log(max)` blows up at zero/near-one.
**How to avoid:** `Math.log1p(v)` (D-10): `log1p(0) === 0` exactly, never negative for `v ≥ 0`; divide by `log1p(clipMax)`. Guard `denom > 0` and `raw > 0`. Unit-test raw=0 → norm 0, raw=clipMax → norm 1.

### Pitfall 5: uPlot band drawn once then frozen on zoom/pan
**What goes wrong:** Computing the rect in pixel space at mount, or only on `setData`, leaves a stale band after the user zooms the spectrum.
**Why it happens:** uPlot redraws on zoom/pan but custom geometry must be recomputed each draw.
**How to avoid:** Do the `valToPos` computation *inside* `hooks.draw` (fires every redraw, `.d.ts:1166`), not once. Trigger `plot.redraw()` when `mzWindow` changes.
**Warning sign:** band stays put while axes move.

### Pitfall 6: Canvas re-blit before stroking the ring (inherited)
**What goes wrong:** `putImageData` overwrites the composite; stroking the ring without re-blitting first leaves stale rings.
**How to avoid:** Re-run `rasterizeImage` + `putImageData`, *then* `strokeRect` — exactly as `ImagingPanel.tsx:104-121` already does for TIC. The ion-image canvas must follow the same two-effect pattern.

### Pitfall 7: Mixed-representation `useProfile` (inherited from Phase 3 D-08)
**What goes wrong:** Choosing the wrong signal file (`spectra_data` vs `spectra_peaks`) yields an empty or wrong ion image.
**How to avoid:** Reuse the exact majority rule from `store.ts:167-176` (`useProfile = profile >= centroid`) and surface the same `mixedRepresentationWarning`. Do **not** re-derive routing logic.

## Code Examples

### ppm → Da (D-03, unit-tested pure fn)
```typescript
// Source: CONTEXT D-03. Pure, no deps. Test: ppmToDa(500, 10) ≈ 0.005; ppmToDa(1000,5)===0.005.
export function ppmToDa(mz: number, ppm: number): number {
  return (mz * ppm) / 1e6;
}
```

### Render-button → store action (file read, button-only)
```typescript
// store.ts addition — mirrors selectSpectrum's try/classifyError shape.
async renderIonImage(mz: number, tolDa: number) {
  const { reader, grid, stats } = get();
  if (!reader || !grid || !stats) return;
  try {
    const { profile, centroid } = stats.representationCounts;
    const useProfile = profile >= centroid;                 // reuse D-08 rule
    const xic = await reader.extractXIC(null, { start: mz - tolDa, end: mz + tolDa }, useProfile);
    const ionImage = xic ? buildIonImage(xic, grid) : null;
    const ionImageStats = ionImage ? computeIonImageStats(ionImage, grid) : null;
    set({ ionImage, ionImageStats, mzWindow: { mz, tolDa } });
  } catch (err) {
    set({ stage: "error", error: classifyError(err) });
  }
}
```

### Recolor (no file I/O, auto on change)
```typescript
setColormapSettings(colormap: Colormap, scale: "linear" | "log", percentile: number) {
  set({ colormap, scale, percentile });                     // render effect re-rasterizes cache
}
```

## State of the Art

| Old Approach (Phase 3) | Current Approach (Phase 4) | When Changed | Impact |
|------------------------|----------------------------|--------------|--------|
| `rasterizeTic(tic, grid)` hardcoded viridis + 0.99 + linear | `rasterizeImage(values, grid, {colormap, percentile, logScale})` | Phase 4 | Generalized; `rasterizeTic` retained as default-args wrapper. |
| `extractXIC(null, null, useProfile)` (full spectrum, TIC) | `extractXIC(null, {start,end}, useProfile)` (windowed, ion image) | Phase 4 | Same primitive, m/z window supplied. |
| `SpectrumPanel` `mzWindow` prop unused (no-op placeholder) | `mzWindow` read from store, drawn via `hooks.draw` | Phase 4 | The placeholder is finally wired (SPEC-02). |

**Deprecated/outdated:** none. `percentile99`'s hardcoded `0.99` is *parameterized*, not removed; the `MzWindow` placeholder in `SpectrumPanel` (lines 14–30) is *activated*, not replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact Inferno LUT anchor RGB values (matplotlib 9-stop) | Pattern 4 / D-08 | LOW — colormap appearance only; not a correctness invariant. Snapshot-test monotonic luminance, not exact bytes. Planner/user may swap anchors freely. |
| A2 | SPEC-02 band color `rgba(255,200,0,0.25)` (amber translucent) | Pattern 5 / D-12 | LOW — cosmetic; CONTEXT proposes this value. Adjust freely if it clashes with the `#1565c0` series stroke. |
| A3 | "min over present cells (may include 0)" vs "min over nonzero cells" for the stats line | Pattern 3 / D-11 | LOW–MEDIUM — affects what the readout reports as "range". Recommend present-cells min/max + separate `nonzeroCount`; confirm wording with the SC-3 intent ("blank because scaling vs absent"). |

**Note:** All structural/behavioral claims (reader windowing, `Span1D` shape, uPlot hook API, existing pure-fn signatures, C2 orientation) are **VERIFIED** by reading the vendored/installed source — only the three cosmetic/wording items above are assumptions.

## Open Questions

1. **Is a small windowed-XIC e2e fixture available?**
   - What we know: Phase 3 used synthetic fixtures for unit tests; a real `.mzpeak` (PXD001283) is the validation input but may not be in `test/data/`.
   - What's unclear: whether an automated Playwright "enter m/z → image → click → band" path can run in CI this phase.
   - Recommendation: unit-test all pure logic (`ppmToDa`, `buildIonImage`, `computeIonImageStats`, `rasterizeImage` log/percentile/colormaps) with synthetic fixtures (guaranteed); make the e2e optional/gated on a fixture being present (mirrors Phase 3's stance). Not a blocker.

2. **`stats.representationCounts` availability at render time.**
   - What we know: `renderIonImage` needs `useProfile`, derived from `stats.representationCounts` (store-resident after load).
   - What's unclear: nothing — it is set during `runLoad`. Listed only to remind the planner to read it from `get()` inside the action, not recompute.
   - Recommendation: reuse `store.ts:167` logic verbatim; surface the same `mixedRepresentationWarning` for the ion image (consistency).

## Environment Availability

Skipped — Phase 4 adds only client-side TypeScript/React code and unit tests using the already-installed toolchain (Vite/Vitest/uPlot, all confirmed present in `node_modules`). No new external tools, services, runtimes, or CLIs are introduced. (`codex` CLI for PROC-01 review is already bootstrapped per CLAUDE.md.)

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (config.json). Phase 4 is a **client-side, read-only data-visualization feature**: it reads numeric arrays already in memory (from a user-chosen local file or URL loaded in Phases 1–2) and renders them to Canvas/uPlot. No server, no auth, no session, no persistence, no new network egress (the only I/O is `extractXIC` against the already-open reader).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface (fully client-side, no backend). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No multi-user/server resources. |
| V5 Input Validation | **yes** | Validate the m/z and tolerance numeric inputs: finite, positive, tolerance > 0; clamp/reject non-finite before building `mzRange`. Guard against `mz - tolDa < 0`. `Number.isFinite` guards already pervasive in `rasterize`/`tic`. |
| V6 Cryptography | no | No crypto; never hand-roll any. |

### Known Threat Patterns for {client-side React + Canvas/uPlot, numeric data}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed numeric input (NaN/Infinity/negative m/z or tol) crashing render or producing garbage windows | Tampering / DoS | `Number.isFinite` + positivity checks on m/z and tolerance before `extractXIC`; the button handler rejects invalid input (reuse the input-guard pattern from `SpectrumPanel.tsx:137`). |
| Pathological window (huge `tolDa`) forcing a giant per-spectrum slice → main-thread freeze | DoS (self-inflicted) | The reader's `betweenSorted` is O(log n) + slice; freeze risk is the same as TIC and accepted for Phase 4 (Worker is Phase 5). No user-facing security boundary; document as a known perf limit. |
| `dangerouslySetInnerHTML` / injection via filename or m/z echoed into the DOM | XSS (Tampering) | N/A — all UI text is React-escaped string interpolation (e.g. the stats line); never use `innerHTML`. Numeric values are formatted via `formatCompact`. |
| Untrusted `.mzpeak` content driving array lengths/values | Tampering | Already mitigated upstream: DATA-02 fails loud on unsupported encodings; per-element `typeof === "number" && Number.isFinite` guard in the summation prevents string/NaN poisoning of totals (reused from `tic.ts:80`). |

**Net:** the only net-new security-relevant surface is **V5 input validation of the two numeric inputs** — handled by finite/positive guards in the button handler. No high-severity findings; nothing that should block on `security_block_on: high`.

## Sources

### Primary (HIGH confidence)
- `vendor/mzpeakts/lib/src/reader.ts:20-32, 252-292` — `XICPoint`/`XIC` types; `extractXIC(timeRange, mzRange=null, useProfile=true)` signature.
- `vendor/mzpeakts/lib/src/data.ts:1118-1175` — `extractRangeFor`: confirms `coordinateRange` slices each spectrum via `betweenSorted` and drops out-of-window spectra.
- `vendor/mzpeakts/lib/src/utils.ts:169-172` — `Span1D = {start,end}`.
- `node_modules/uplot/dist/uPlot.d.ts:22,25,117,1160-1166` — `ctx`, `bbox`, `valToPos(val,scaleKey,canvasPixels)`, `hooks.draw`.
- `src/ui/rasterize.ts` — `viridis()`, `percentile99()`, `rasterizeTic()`, SENTINEL (existing, to extend).
- `src/compute/tic.ts` — `buildTic` (template for `buildIonImage`).
- `src/ui/ImagingPanel.tsx` — `toGridCoord`, `formatCompact`, hover/ring two-effect pattern (to reuse).
- `src/ui/SpectrumPanel.tsx:14-30` — the `MzWindow` placeholder to activate.
- `src/state/store.ts:167-176` — `useProfile` majority rule + `mixedRepresentationWarning`.
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` — C2 (no flip), C5 (aspect), C6 (signal routing), C8 (sparse sentinel).
- `.planning/config.json` — `nyquist_validation:false`, `security_enforcement:true`, `security_asvs_level:1`.

### Secondary (MEDIUM confidence)
- `.planning/phases/03-tic-image-pixel-spectrum-round-trip/03-RESEARCH.md` — inherited pitfalls (bigint leak, reverse-map, canvas DPR hit-test, mixed-rep) carried into Phase 4.

### Tertiary (LOW confidence)
- matplotlib inferno anchor RGB values (A1) — from training knowledge; cosmetic only, not verified against a source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every primitive read from installed/vendored source.
- Architecture: HIGH — a direct, verified extension of the Phase 3 pipeline.
- Pitfalls: HIGH — most are Phase 3 pitfalls confirmed still relevant + the verified `Span1D`/windowing nuance.
- Cosmetics (inferno LUT, band color, stats min wording): LOW/ASSUMED — explicitly flagged, non-load-bearing.

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable — internal codebase + pinned vendored reader; refresh only if `mzpeakts` is re-vendored or uPlot is bumped).
