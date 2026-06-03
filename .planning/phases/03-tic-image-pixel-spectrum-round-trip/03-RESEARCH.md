# Phase 3: TIC Image + Pixel→Spectrum Round-Trip — Research

**Researched:** 2026-06-03
**Domain:** Canvas 2D rasterization, MSI total-ion-current aggregation, mzpeakts `extractXIC` consumption, signal-file routing (profile/centroid)
**Confidence:** HIGH (all findings verified against vendored source + existing codebase; no external packages introduced)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** TIC computed via `extractXIC(null, null, useProfile)` — a single async call returning one `XICPoint` per spectrum with its intensity arrays. Sum each point's intensity array in `src/compute/tic.ts` → `Float32Array[width*height]`. Reuses the Phase 4 ion-image primitive.
- **D-02:** TIC compute runs as a new **LoadStage `'tic'`** inserted after `'grid'`, before `'ready'`: `zip-index → manifest → metadata → grid → tic → ready`. Store gains `tic: Float32Array | null`. Image renders immediately when layout appears — no spinner after load.
- **D-03:** TIC compute lives in `src/compute/tic.ts` — a new `src/compute/` layer above `src/reader/` and `src/imaging/`. Receives XIC points + `ImagingGrid`, returns a plain `Float32Array`. No Arrow types leak out.
- **D-04:** Click on Canvas → hit-test canvas px coord → convert to 0-based `(x0, y0)` → `grid.coordToSpectrumIndex.get(y0 * grid.width + x0)` → `selectSpectrum(spectrumIndex)`. Existing `SpectrumPanel` updates in-place. Numeric index input stays as secondary UX.
- **D-05:** Hover readout: single text label **below the canvas** showing `x: N, y: N, TIC: N.Ne6` (1-based coords). Disappears on mouse leave. `useState`-tracked string updated on `mousemove`.
- **D-06:** Selected pixel: **1px contrast ring** drawn directly on canvas around the selected pixel. Canvas redraws on `selectedIndex` change — rasterize TIC ImageData, then draw ring in a second pass.
- **D-07:** Per-pixel spectrum reads — look up `SpectrumMeta.representation` for that spectrum index BEFORE reading, route explicitly to `spectrumData()` (profile, MS:1000128) or `spectrumPeaks()` (centroid, MS:1000127). Never the implicit fallback order.
- **D-08:** TIC `useProfile` derived from file's uniform representation via `stats.representationCounts`. `profile>0 && centroid===0` → `useProfile=true`; `centroid>0 && profile===0` → `useProfile=false`; both>0 (mixed) → pick majority + surface a named warning in diagnostics.
- **D-09:** Pixels with `presenceMask[y0*width+x0] === 0` render as a **distinct background color** (e.g., `#1a1a1a`), NOT as zero-intensity. Zero-intensity is real signal; absent is a missing acquisition.

### Claude's Discretion
- Colormap choice (single fixed colormap — linear gray or viridis-like; NO selector until Phase 4).
- Percentile-clip ceiling (CONTEXT suggests 99th percentile) and exact normalization.
- Exact file/module decomposition within `src/compute/` and `src/ui/` for the TIC canvas component.
- Contrast-ring color logic (white vs black based on background).

### Deferred Ideas (OUT OF SCOPE)
- Colormap selector + intensity scaling (linear/log, percentile clipping UI) — **Phase 4 (IMAGE-03)**.
- SPEC-02 m/z-window marker on spectrum — **Phase 4** (SpectrumPanel has no m/z state yet).
- Ion image for a specific m/z window — **Phase 4 (IMAGE-02)**.
- Web Worker offload for TIC compute — **Phase 5**.
- Mean/sum/max aggregation toggle for TIC — **v2**.
- Cosmetic orientation flip toggle — later (NOT a correctness mechanism; C2 forbids flip as correctness).
- Layout / visual polish beyond functional plumbing — **Phase 5**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **IMAGE-01** | Render a TIC image as the default spatial overview. | `extractXIC(null,null,useProfile)` returns all-spectra intensity arrays (verified in `reader.ts:252`); sum→raster→`putImageData`. New `'tic'` LoadStage renders it eagerly. |
| **IMAGE-04** | Hover shows 1-based x/y + intensity; **fixed** orientation `M[row][col]` col=x/row=y, (1,1) top-left, y-down, no flip; respect `IMS:1000046/47` aspect. | Grid already keyed `y0*width+x0` (`grid.ts:116`) — fixed orientation is baked in. `grid.pixelSizeUm` carries aspect. Hover math in §Architecture Patterns. |
| **SPEC-01** | Click pixel → that pixel's full spectrum in uPlot with zoom/pan. | `selectSpectrum(index)` already exists (`store.ts:187`); SpectrumPanel already mounts uPlot. Wire hit-test → `selectSpectrum`. |
| **SPEC-02** | Selected m/z ± tol window marked on spectrum. | **DEFERRED to Phase 4** per CONTEXT (no m/z state in Phase 3). Listed in phase metadata but CONTEXT scopes the UI to Phase 4. Flag to planner: SPEC-02 is NOT implementable in Phase 3 as scoped. |
| **DATA-03** | Read each spectrum's signal from the correct file per `MS_1000525` — profile→`spectra_data`, centroid→`spectra_peaks`; never assume `spectra_data`. | `spectrumMeta(reader,index).representation` already exposes this (`fileMeta.ts:89`). Per-pixel: extend `arrays.ts`. TIC: derive `useProfile` from `representationCounts`. |

> **Planner action required:** SPEC-02 appears in the phase requirement IDs but CONTEXT.md explicitly defers the m/z-window marker to Phase 4 ("Phase 3's SpectrumPanel has no m/z selection state yet"). The planner should either (a) confirm SPEC-02 is deferred and adjust traceability, or (b) escalate the contradiction. Do NOT silently implement a marker with no m/z source. REQUIREMENTS.md traceability lists SPEC-02 as "Phase 3 / Pending" but the body has no SPEC-02 phase mapping in the table for the m/z marker — treat as deferred.
</phase_requirements>

## Summary

Phase 3 is a **pure-TypeScript + Canvas 2D + existing-uPlot** phase. **No new external packages.** All work composes existing, verified infrastructure: the vendored `extractXIC`, the `ImagingGrid` from Phase 2, the `spectrumMeta` representation accessor and `representationCounts` from Phase 1, the `selectSpectrum` store action, and the existing uPlot SpectrumPanel. The new surface is one compute module (`src/compute/tic.ts`), a store stage (`'tic'`), a Canvas-based imaging panel, and a small extension to `src/reader/arrays.ts` for explicit representation routing.

Three findings dominate the risk profile. **(1)** `extractXIC(null, null, useProfile)` does NOT do m/z filtering when both ranges are null — it calls `extractRangeFor(null, null)` which `enumerate()`s every spectrum and packs each one's **full** intensity array (verified `data.ts:1119`). So "TIC = sum of each point's full intensity array" is correct, and `XICPoint.index` is a **`bigint`** (must be `Number()`-converted at the reader boundary — Arrow/bigint must not leak above `src/reader/`). **(2)** The grid's `coordToSpectrumIndex` maps `key→spectrumIndex`; TIC needs the **reverse** (`spectrumIndex→key`) to scatter each point's sum onto the raster. This reverse must be built (cheaply, once) since the forward Map cannot be indexed by value. **(3)** There is **no imaging test fixture** in `test/data/` — both `small.mzpeak` and `small.chunked.mzpeak` are non-imaging LC-MS demos. Phase 3's grid/raster/hit-test correctness must be tested with **synthetic in-memory fixtures** (a tiny known grid + fake XIC points), not the canonical PXD001283 file (which the operator has not yet dropped in).

**Primary recommendation:** Build `src/compute/tic.ts` as a pure function `buildTic(xic, grid) → Float32Array`, insert the `'tic'` stage in `runLoad()` exactly mirroring the existing `'grid'` stage, render via a single `ImageData`/`putImageData` pass with a second `strokeRect` ring pass, and test the compute + hit-test math with synthetic fixtures. Treat the orientation as **already correct** by reusing the grid's existing `y0*width+x0` key — do not introduce any flip/transpose.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read all-spectra intensity (TIC source) | Reader (`src/reader/`) | — | Only `src/reader/` touches mzpeakts/Arrow/bigint; `extractXIC` lives there. |
| Sum intensity arrays → scalar-per-spectrum → raster | Compute (`src/compute/tic.ts`) | — | Pure aggregation; receives plain XIC points + grid, returns `Float32Array`. No Canvas, no Arrow. |
| Scatter scalar onto grid (orientation, presence) | Compute / Imaging | — | Orientation is the grid's `y0*width+x0` key (already correct); compute reuses it. |
| Rasterize `Float32Array` → `ImageData` (colormap, clip, sparse) | UI / render (Canvas) | — | Colormap + percentile clip + sparse sentinel are Canvas-facing pure transforms. |
| Paint + selection ring + hover/click hit-test | UI (`src/ui/`, Canvas 2D) | Store | Canvas owns pixel↔coord math; store owns `selectedIndex`. |
| Per-pixel spectrum read (DATA-03 routing) | Reader (`src/reader/arrays.ts`) | — | Representation→file routing is a reader-boundary concern. |
| Derive `useProfile` for TIC | Store / Compute | Reader (stats) | `representationCounts` already in store; a small derivation, not a reader call. |
| Display clicked spectrum | UI (`SpectrumPanel`, uPlot) | Store (`selectSpectrum`) | Existing, unchanged. |

> **Note on architecture drift:** `.planning/research/ARCHITECTURE.md` envisions a 4-way split (`compute/` aggregation, `render/` rasterize+colormap+hitTest, `worker.ts`, `ui/`). CONTEXT.md (D-03) collapses this for the MVP: TIC compute in `src/compute/tic.ts`, rasterization + hit-test inline in the UI Canvas component, no worker (Phase 5). **Follow CONTEXT.md.** The planner may optionally split a pure `render`/`rasterize` helper out of the UI component for testability (recommended — see Pitfall 4), but the worker boundary is explicitly deferred.

## Standard Stack

**No new packages.** Phase 3 introduces zero dependencies. Everything is already installed and verified in CLAUDE.md / Phase 1–2.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `uplot` | 1.6.32 | Spectrum chart (clicked pixel) | Already mounted in `SpectrumPanel.tsx`; reused unchanged. |
| `react` / `react-dom` | 19.2.7 | Imaging panel + hover state | Existing component model. |
| Canvas 2D (`ImageData`/`putImageData`) | browser native | TIC heatmap raster | CLAUDE.md decision (validated): few-thousand-pixel grid is trivial for Canvas 2D; WebGL is over-engineering. |
| `zustand` (via `src/state/store.ts`) | (in tree) | `tic` slice + `'tic'` stage + `selectSpectrum` reuse | Existing store-centric staged-load pattern. |
| `mzpeakts` (vendored) | `vendor/mzpeakts` | `extractXIC`, `getSpectrum`, `spectrumData`/`spectrumPeaks` | The only mzPeak reader; consumed only inside `src/reader/`. |

### Supporting (already present, dev)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.8 | Unit-test `buildTic`, raster math, hit-test math, `useProfile` derivation, DATA-03 routing | All pure compute/reader logic. |
| `@playwright/test` | 1.60.0 | e2e round-trip (load → TIC visible → click pixel → spectrum) | Only once an imaging fixture exists; otherwise gate behind a `checkpoint`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas 2D `putImageData` | WebGL / regl | Only justified >~1M px or GPU colormap remap — not at PXD001283's 34,840 px. Defer. |
| Inline rasterize in UI component | Separate pure `render/rasterize.ts` | Pure split is more testable (ARCHITECTURE.md preference) but adds a file; CONTEXT allows either. Recommend the pure split for the colormap+clip+sparse logic so it is unit-testable without a DOM. |

**Installation:** None.

## Package Legitimacy Audit

> Not applicable — Phase 3 installs **no external packages**. All code composes existing, vendored, or native APIs. No registry verification, slopcheck, or postinstall audit required.

| Package | Disposition |
|---------|-------------|
| (none) | — |

## Architecture Patterns

### System Architecture Diagram (Phase 3 data flow)

```
                         (already done by Phase 2 — grid stage)
  imaging file ──► reader ──► extractCoords + readGridGeometry ──► buildImagingGrid ──► grid
                                                                                          │
  ┌───────────────────────────── NEW: 'tic' stage (after 'grid') ──────────────────────┐ │
  │                                                                                     │ │
  │  derive useProfile  ◄── stats.representationCounts (D-08)                           │ │
  │        │                                                                            │ │
  │        ▼                                                                            ▼ │
  │  reader.extractXIC(null, null, useProfile)  ─► XIC { points: XICPoint[] }            │
  │        (src/reader/ boundary — bigint index, Arrow-backed arrays)                    │
  │        │   each point: { index: bigint, dataArrays: { "intensity array": ... } }    │
  │        ▼                                                                             │
  │  src/compute/tic.ts  buildTic(xic, grid):                                            │
  │     for each point:  sIdx = Number(point.index)                                      │
  │                      sum  = Σ point.dataArrays["intensity array"]                    │
  │                      key  = spectrumIndexToKey[sIdx]   (reverse of grid map)         │
  │                      tic[key] = sum                                                  │
  │        │  returns Float32Array[width*height]                                         │
  └────────┼────────────────────────────────────────────────────────────────────────────┘
           ▼
  store.tic = Float32Array  ──►  stage 'ready'
           │
           ▼  (UI)
  ImagingPanel <canvas>:
     percentile-clip + colormap + sparse sentinel (presenceMask) ──► ImageData ──► putImageData
     selectedIndex ──► strokeRect ring (2nd pass)
     mousemove  ──► (x0,y0) ──► hover label "x:N y:N TIC:N"   (1-based display)
     click      ──► (x0,y0) ──► key ──► coordToSpectrumIndex.get(key) ──► selectSpectrum(idx)
                                                                              │
                                                                              ▼
                                                       getSpectrumArrays (DATA-03 routing) ──► SpectrumPanel (uPlot)
```

### Recommended Project Structure (additions only)
```
src/
├── compute/                  # NEW layer (above reader/ and imaging/)
│   ├── tic.ts                # buildTic(xic, grid) → Float32Array   [pure, unit-tested]
│   └── tic.test.ts
├── reader/
│   └── arrays.ts             # EXTEND: explicit representation routing (D-07)
├── state/
│   └── store.ts              # ADD: tic slice, 'tic' LoadStage, derive useProfile, call buildTic
├── ui/
│   ├── ImagingPanel.tsx      # NEW: <canvas> TIC + hover + click + ring
│   └── (optional) rasterize.ts  # OPTIONAL pure helper: Float32Array+grid → ImageData (testable)
```

### Pattern 1: `extractXIC(null, null, useProfile)` returns FULL per-spectrum arrays
**What:** With both `timeRange` and `mzRange` null, `extractXIC` → `extractRangeFor(null, null)` → `enumerate()` over every spectrum, packing each row's complete `dataArrays` (no m/z slicing). This is exactly a per-spectrum dump, ideal for a TIC sum.
**When to use:** TIC (sum the whole intensity array). Phase 4 will pass a narrow `mzRange` for an ion image (the slicing branch).
**Verified source:** `vendor/mzpeakts/lib/src/reader.ts:252-296` (extractXIC), `vendor/mzpeakts/lib/src/data.ts:1119-1176` (extractRangeFor — `if (indexRange == null) iter = enumerate()`; the `coordinateRange` slicing branch is skipped when null).

```typescript
// In src/reader/ — extractXIC returns XICPoint[] with bigint index + Arrow-backed arrays.
// XICPoint: { index: bigint, time: number|null, dataArrays: Record<string, FloatArray|IntArray|string[]> }
// dataArrays key for intensity is the human-readable CV name "intensity array"
// (same key arrays.ts already uses: INTENSITY_KEY = "intensity array").
const xic = await reader.extractXIC(null, null, useProfile);  // XIC | null
```

### Pattern 2: Build the reverse map (spectrumIndex → grid key) in `buildTic`
**What:** `grid.coordToSpectrumIndex` is `Map<key, spectrumIndex>`. To scatter a per-spectrum sum onto the raster you need `spectrumIndex → key`. Invert it once.
**Why:** The forward Map cannot be queried by value; iterating it per-XIC-point would be O(n²).
**Verified source:** `src/imaging/grid.ts:116,122` (key = `y0*width+x0`, value = `spectrumIndices[i]`).

```typescript
// src/compute/tic.ts — pure, no Arrow/bigint leaks (index already Number()'d at reader boundary
// OR convert here as the first thing). Boundary rule: if XICPoint.index (bigint) reaches compute/,
// the reader layer leaked a bigint. Prefer converting in src/reader/ and passing plain points,
// OR convert with Number() as the very first op and document it.
export function buildTic(xic: XIC, grid: ImagingGrid): Float32Array {
  const tic = new Float32Array(grid.width * grid.height);   // absent + zero both start at 0
  // reverse index: spectrumIndex → grid key
  const idxToKey = new Map<number, number>();
  for (const [key, sIdx] of grid.coordToSpectrumIndex) idxToKey.set(sIdx, key);

  const INTENSITY_KEY = "intensity array";
  for (const point of xic.points) {
    const sIdx = Number(point.index);                       // bigint → number (pixel-scale safe)
    const key = idxToKey.get(sIdx);
    if (key === undefined) continue;                        // spectrum not on the grid → skip
    const arr = point.dataArrays[INTENSITY_KEY] as ArrayLike<number> | undefined;
    if (!arr) continue;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    tic[key] = sum;
  }
  return tic;
}
```

### Pattern 3: Single-pass `ImageData` + second-pass ring (Canvas 2D)
**What:** Fill an `RGBA Uint8ClampedArray` from the TIC raster (colormap + percentile clip + sparse sentinel), `putImageData`, then `strokeRect` the selection ring on top. Two passes because `putImageData` ignores the canvas transform/composite and would overwrite a ring drawn first.
**Verified source:** existing CLAUDE.md Canvas pattern + `ARCHITECTURE.md:172-181`.

```typescript
// Pseudocode for ImagingPanel rasterize:
const img = new ImageData(grid.width, grid.height);
const clipMax = percentile(tic, 0.99, grid.presenceMask);  // ignore absent cells in the percentile
for (let k = 0; k < grid.width * grid.height; k++) {
  const base = k * 4;
  if (grid.presenceMask[k] === 0) {                         // D-09: absent ≠ zero-intensity
    img.data[base] = 0x1a; img.data[base+1] = 0x1a; img.data[base+2] = 0x1a; img.data[base+3] = 255;
    continue;
  }
  const norm = clipMax > 0 ? Math.min(tic[k] / clipMax, 1) : 0;
  const [r,g,b] = colormap(norm);                           // single fixed colormap (no selector — Phase 4)
  img.data[base] = r; img.data[base+1] = g; img.data[base+2] = b; img.data[base+3] = 255;
}
ctx.putImageData(img, 0, 0);                                // canvas is grid.width × grid.height (CSS-scaled, see Pitfall 5)
// ring on selected pixel (2nd pass, AFTER putImageData):
if (selectedKey != null) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, 1, 1); }
```

### Pattern 4: DATA-03 explicit per-pixel routing (extend `arrays.ts`)
**What:** Before reading a pixel's spectrum, consult `spectrumMeta(reader, index).representation` and route to the correct underlying file. The current `getSpectrumArrays` works by *trying* `dataArrays` then falling back to `centroids` — which happens to be correct because `getSpectrum` only populates `dataArrays` when `dataPointCount>0` and `centroids` when `peakCount>0` (`reader.ts:226-250`). But D-07 wants the routing **explicit and testable**, not incidental.
**Why explicit:** A spectrum with both profile and peak rows (unusual but legal) would currently prefer `dataArrays`; D-07 makes the choice deterministic per `MS:1000525`.
**Verified source:** `src/reader/fileMeta.ts:89` (`spectrumMeta` exposes `representation`), `reader.ts:226-250` (`getSpectrum` populates both conditionally).

```typescript
// src/reader/arrays.ts — add an explicit-representation path (keep the existing function for callers
// that don't have a representation, e.g. the numeric index input on non-imaging files).
export async function getSpectrumArraysFor(
  reader: Reader, index: number, representation: SpectrumRepresentation,
): Promise<SpectrumArrays> {
  const spectrum = await reader.getSpectrum(index);   // populates dataArrays AND/OR centroids
  if (!spectrum) throw new Error(`No spectrum at index ${index}`);
  if (representation === "centroid") {
    // MUST come from spectra_peaks (centroids). Fail loud if the routed file has no data.
    return fromCentroids(spectrum, index);
  }
  // profile (or null → default profile) → spectra_data (dataArrays)
  return fromDataArrays(spectrum, index);
}
```

> **Note:** `getSpectrum` itself reads from BOTH underlying files conditionally (it does not "route" — it loads whichever counts are nonzero). True file-level routing (`spectrumData()` vs `spectrumPeaks()` exclusively) would require bypassing `getSpectrum` and calling the per-file reader handles directly. For the MVP, the pragmatic D-07 implementation is: call `getSpectrum`, then **select the correct array source by representation** rather than by try-order. This satisfies "explicit and testable" without re-plumbing the vendored reader. The planner should confirm this interpretation; deeper file-level routing is a larger change.

### Anti-Patterns to Avoid
- **Re-deriving orientation / adding a flip.** The grid key `y0*width+x0` already encodes C2 (col=x, row=y, top-left, y-down). Any transpose/flip in the rasterizer is a **correctness bug** (C2 MANDATORY). Two files differing only in scan direction must render identically.
- **Letting `bigint` or Arrow `Vector` reach `src/compute/`.** `XICPoint.index` is `bigint`; convert with `Number()` at the boundary. `dataArrays` values are Arrow-backed typed arrays — summing is fine, but do not pass them above compute or store them.
- **Treating absent pixels as zero-intensity.** D-09/C8: `presenceMask===0` is a missing acquisition → sentinel color, NOT colormap-bottom.
- **Per-spectrum `extractXIC` for the image.** One `extractXIC(null,null,...)` covers all spectra. Do not loop `getSpectrum` per pixel for the TIC (that is the per-pixel *spectrum* path, not the image path).
- **Assuming `spectra_data` for centroid files.** DATA-03/C6 — route by representation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| All-spectra intensity read | Custom per-spectrum loop | `reader.extractXIC(null, null, useProfile)` | Vendored, handles point/chunked/delta + the index iteration; D-01. |
| Spectrum→file routing | Re-implement Parquet file selection | `getSpectrum` + representation selection (Pattern 4) | Vendored reader already opens both files. |
| Coordinate→spectrum lookup | Recompute key formula | `grid.coordToSpectrumIndex` (key `y0*width+x0`) | Phase 2 owns it; recomputing risks orientation drift. |
| Spectrum line chart | New chart lib / re-mount uPlot | Existing `SpectrumPanel` + `selectSpectrum` | Already imperatively mounted; reused unchanged. |
| Profile/centroid count | Recount representation | `stats.representationCounts` (in store from Phase 1) | Already computed; just read it for `useProfile`. |
| Heatmap paint | WebGL / 3rd-party heatmap | `ImageData` + `putImageData` | CLAUDE.md validated decision; trivial at this scale. |

**Key insight:** Almost everything Phase 3 needs already exists. The genuinely new code is small: a ~30-line pure `buildTic`, a `'tic'` stage mirroring `'grid'`, a Canvas component, and a representation-routing extension. The risk is *reusing the existing pieces correctly* (orientation, bigint boundary, reverse map, sparse mask), not building new machinery.

## Common Pitfalls

### Pitfall 1: `bigint` leak from `XICPoint.index`
**What goes wrong:** `XICPoint.index` is `bigint` (`reader.ts:21`). Passing points straight into `src/compute/` leaks a bigint above the reader boundary (violates the ARCHITECTURE anti-pattern "no Arrow/bigint upward").
**Why it happens:** `extractXIC` returns vendored `XIC` whose points carry `bigint` indices.
**How to avoid:** Convert with `Number()` as the first operation in `buildTic` (or, cleaner, have the reader layer map points to plain `{ index: number, intensity: Float32Array }` before they cross). `Number(bigint)` is exact for pixel/spectrum-scale indices (≪ 2^53), matching the existing `toCoordNumber` pattern in `scanCoords.ts:60`.
**Warning signs:** TS error "Cannot mix BigInt and number"; a Map `.get(point.index)` miss because `bigint !== number` keys.

### Pitfall 2: Reverse-map mismatch (scatter onto wrong cell)
**What goes wrong:** Using `coordToSpectrumIndex` forward (key→idx) while iterating XIC points by spectrum index scatters intensities onto the wrong pixels or misses them.
**Why it happens:** The Map is keyed by grid cell, not by spectrum index.
**How to avoid:** Build `spectrumIndex → key` once (Pattern 2). Skip XIC points whose spectrum index is not in the grid (sparse / non-imaging spectra).
**Warning signs:** TIC image looks scrambled or shifted; filled-pixel count in the raster ≠ `grid.filledCount`.

### Pitfall 3: No imaging test fixture — synthetic fixtures required
**What goes wrong:** Writing an e2e/integration test against a real imaging file fails — `test/data/` contains only `small.mzpeak` and `small.chunked.mzpeak`, both **non-imaging** LC-MS demos (verified `test/data/README.md`). PXD001283 has not been dropped in.
**Why it happens:** The canonical acceptance file is operator-supplied and not yet present.
**How to avoid:** Unit-test `buildTic`, the reverse map, the hit-test math, the `useProfile` derivation, and DATA-03 routing with **synthetic in-memory fixtures** — a tiny `ImagingGrid` (e.g., 3×2 with one absent pixel) + hand-built `XIC` points. Gate any real-file e2e behind a `checkpoint:human-verify` ("drop PXD001283 .mzpeak in test/data/") or skip it with a TODO. Phase 2 already validated grid reconstruction this way.
**Warning signs:** A Playwright spec that loads an imaging file with no fixture to load; tests that pass only because they never exercise the imaging path.

### Pitfall 4: Rasterize logic trapped inside a React component (untestable)
**What goes wrong:** Colormap + percentile clip + sparse sentinel buried in a `useEffect` cannot be unit-tested without a DOM/canvas mock.
**Why it happens:** Tempting to do everything in the Canvas component.
**How to avoid:** Extract the pure `Float32Array + grid → ImageData` (or `→ Uint8ClampedArray`) transform into a plain function (e.g., `src/ui/rasterize.ts` or `src/render/`). Unit-test the colormap mapping, the 99th-percentile clip (ignoring absent cells), and the sparse sentinel. The component just calls it + `putImageData`. ARCHITECTURE.md §"render/ is pure and Canvas-only" endorses this.
**Warning signs:** Zero unit tests for the colormap/clip; only an e2e covers rendering.

### Pitfall 5: Canvas intrinsic size vs CSS display size (hit-test math)
**What goes wrong:** Canvas is `grid.width × grid.height` px intrinsically but CSS-scaled larger (and aspect-stretched per `pixelSizeUm`). A naive `e.offsetX` maps to display px, not grid px → wrong pixel selected, especially with non-square aspect.
**Why it happens:** `IMS:1000046/47` aspect (C5) means CSS width:height ≠ grid width:height; and high-DPI displays add `devicePixelRatio`.
**How to avoid:** Compute grid coords from the canvas bounding rect: `x0 = Math.floor((e.clientX - rect.left) / rect.width * grid.width)`, `y0 = Math.floor((e.clientY - rect.top) / rect.height * grid.height)`. Clamp to `[0,width)`/`[0,height)`. This is resolution- and aspect-independent. (CONTEXT's `canvasX / (canvasWidth/width)` is correct only if canvasWidth is the *displayed* width — use the bounding rect to be safe.)
**Warning signs:** Hover readout off-by-N near edges; clicks select a neighboring pixel; breaks when the panel is resized or on a Retina display.

### Pitfall 6: Mixed-representation file silently picks wrong `useProfile`
**What goes wrong:** A file with both profile and centroid spectra (D-08 "both>0") gets a single `useProfile` for the whole TIC, summing the wrong file for some spectra.
**Why it happens:** `extractXIC` reads ONE file (`spectrumData` xor `spectrumPeaks`) for all spectra — it cannot route per-spectrum.
**How to avoid:** Pick the majority representation, AND surface a **named warning** in the diagnostics panel (D-08). Per-pixel *spectrum* reads (D-07) still route correctly per spectrum, so the click-spectrum is always right even when the TIC image uses the majority file. Document this asymmetry for the user.
**Warning signs:** A file where `representationCounts.profile>0 && centroid>0` with no warning shown; some pixels read as 0 in the TIC because their representation's data lives in the other file.

### Pitfall 7: `getSpectrum` index type and empty-array fail-loud
**What goes wrong:** `getSpectrum` takes `bigint | number` and may return `undefined` (no meta). Calling it with a stale/out-of-range index or assuming a non-null return crashes.
**Why it happens:** `reader.ts:226` returns `meta` only if it exists; `arrays.ts` already guards (`if (!spectrum) throw`).
**How to avoid:** Keep the existing fail-loud guards; for the centroid route, throw a named error if the routed file has no rows (don't silently render zeros — matches existing `arrays.ts:60`).
**Warning signs:** "Cannot read properties of undefined"; a blank spectrum on click instead of an error.

## Runtime State Inventory

> Not applicable — Phase 3 is a greenfield feature addition (new compute module, new stage, new UI component, reader extension). No rename/refactor/migration. No stored data, live-service config, OS-registered state, secrets, or build artifacts carry a renamed identifier.

## Code Examples

### Insert the `'tic'` stage in `runLoad` (mirror the `'grid'` stage)
```typescript
// src/state/store.ts — after the grid block, before the final set({ stage: "ready" }).
// Only run for imaging files (grid !== null). Non-imaging files skip TIC and go to ready.
let tic: Float32Array | null = null;
if (grid) {
  set({ stage: "tic" });
  await yieldFrame();
  // D-08: derive useProfile from uniform representation.
  const { profile, centroid } = stats.representationCounts;
  const useProfile = centroid > 0 && profile === 0 ? false : true; // majority/profile-default
  const mixed = profile > 0 && centroid > 0;                       // surface a named warning if so
  const xic = await reader.extractXIC(null, null, useProfile);
  tic = xic ? buildTic(xic, grid) : null;
}
set({ reader, manifest, fileMeta, stats, capabilities, grid, tic, stage: "ready", error: null, /* ... */ });
```
**Source:** `src/state/store.ts:108-159` (existing `'grid'` stage shape), `src/reader/types.ts:76` (LoadStage — add `"tic"`), `vendor/mzpeakts/lib/src/reader.ts:252` (extractXIC).

### Hover + click hit-test (resolution/aspect-safe)
```typescript
// src/ui/ImagingPanel.tsx
function toGridCoord(e: React.MouseEvent, canvas: HTMLCanvasElement, grid: ImagingGrid) {
  const rect = canvas.getBoundingClientRect();
  const x0 = Math.floor(((e.clientX - rect.left) / rect.width)  * grid.width);
  const y0 = Math.floor(((e.clientY - rect.top)  / rect.height) * grid.height);
  if (x0 < 0 || x0 >= grid.width || y0 < 0 || y0 >= grid.height) return null;
  return { x0, y0, key: y0 * grid.width + x0 };
}
// onClick: const hit = toGridCoord(...); if (hit && grid.presenceMask[hit.key]) {
//   const idx = grid.coordToSpectrumIndex.get(hit.key); if (idx != null) void selectSpectrum(idx); }
// onMouseMove: set label `x: ${x0 + grid.coordinateBase}, y: ${y0 + grid.coordinateBase}, TIC: ${tic[key]}`
//   (display coords are 1-based: add coordinateBase, per C3 — preserve 1-based for the readout)
```
**Source:** `src/imaging/grid.ts:116` (key formula), `src/imaging/types.ts:44-47` (coordToSpectrumIndex / presenceMask), `src/state/store.ts:187` (selectSpectrum).

### Wire DATA-03 routing through `selectSpectrum`
```typescript
// src/state/store.ts selectSpectrum — look up representation, route explicitly (D-07).
async selectSpectrum(index: number) {
  const reader = get().reader; if (!reader) return;
  try {
    const meta = spectrumMeta(reader, index);                 // fileMeta.ts:89 — has representation
    const selectedSpectrum = await getSpectrumArraysFor(reader, index, meta.representation);
    set({ selectedIndex: index, selectedSpectrum });
  } catch (err) { set({ stage: "error", error: classifyError(err) }); }
}
```
**Source:** `src/reader/fileMeta.ts:89` (spectrumMeta), `src/reader/arrays.ts` (extend), `src/state/store.ts:187` (existing selectSpectrum).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Numeric-index-only spectrum selection | Pixel-click → spectrum (this phase) | Phase 3 | Completes the Core Value round-trip. Index input retained as secondary. |
| Implicit try-order array source (`dataArrays` then `centroids`) | Explicit representation routing (D-07) | Phase 3 (DATA-03) | Deterministic, testable file selection. |
| Grid only (Phase 2) | Grid + eager TIC raster | Phase 3 | Image appears on load, no extra click. |

**Deprecated/outdated:** None — Phase 3 only adds.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The intensity column key in `XICPoint.dataArrays` is `"intensity array"` (same as `arrays.ts` MZ/INTENSITY_KEY). | Pattern 1/2 | If the column is named differently for chunked/centroid files, the sum reads `undefined` → all-zero TIC. **Verify against a real imaging file or the chunked fixture's `dataArrays` keys.** `arrays.ts` already relies on this exact key for point layout, so HIGH confidence for profile/point. |
| A2 | D-07 satisfied by "call `getSpectrum`, select array source by representation" rather than exclusive file-level routing. | Pattern 4 | If the operator/spec demands true file-level isolation (never touch `spectra_data` for a centroid spectrum), this needs deeper reader plumbing. CONTEXT D-07 says "route to `spectrumData()`/`spectrumPeaks()`" which *could* mean exclusive handles. **Planner should confirm interpretation.** |
| A3 | Summing the full `intensity array` per spectrum = TIC (no per-spectrum normalization or m/z weighting needed). | Pattern 2 | Standard TIC definition; matches REQUIREMENTS IMAGE-01. LOW risk. |
| A4 | SPEC-02 (m/z window marker) is deferred to Phase 4 despite being in the phase requirement IDs. | phase_requirements | If SPEC-02 must ship in Phase 3, there is no m/z source to mark. **Planner must reconcile** the phase ID list vs CONTEXT's explicit deferral. |
| A5 | `Number(point.index)` is always safe (spectrum index ≪ 2^53). | Pitfall 1 | True for any realistic file; guard like `scanCoords.ts` `toCoordNumber` if paranoid. LOW risk. |

## Open Questions

1. **Is PXD001283 (or any imaging `.mzpeak`) going to be available for e2e validation in Phase 3?**
   - What we know: It is the canonical acceptance file (260×134, 34,840 px, profile MS1) but is operator-supplied and NOT in `test/data/`.
   - What's unclear: Whether the operator will drop it before Phase 3 verification.
   - Recommendation: Plan all automated tests on synthetic fixtures; gate the real-file round-trip e2e behind a `checkpoint:human-verify` so the phase is not blocked on file availability.

2. **Does D-07 mean "exclusive file routing" or "select array source from a dual-loaded spectrum"?** (See A2.)
   - Recommendation: Implement the pragmatic version (select by representation from `getSpectrum`); flag for operator/Codex confirmation in round1.

3. **Which colormap for the single fixed v1 colormap — gray or viridis-like?**
   - What we know: Claude's discretion; viridis is perceptually uniform and standard for MSI.
   - Recommendation: Viridis-like LUT (perceptually uniform, accessible) or simple gray; either is acceptable. Keep it a single pure function so Phase 4 can add a selector.

## Environment Availability

> Skipped — Phase 3 has no external tool/service/runtime dependencies beyond the already-installed project toolchain (Vite, Vitest, Playwright, the vendored reader). All work is in-repo TypeScript + browser-native Canvas/uPlot.

## Validation Architecture

> `workflow.nyquist_validation` is **false** in `.planning/config.json` — this section is intentionally minimal. The project uses Vitest (unit) + Playwright (e2e) per CLAUDE.md, but per-task Nyquist sampling is disabled. Test guidance below is advisory for the planner, not a mandated sampling regime.

**Test framework:** Vitest 4.1.8 (`vitest run`), config at `vitest.config.ts` (reuses the Vite pipeline). e2e: Playwright 1.60.0 (`playwright test`), specs in `e2e/`.

**Phase 3 test map (synthetic fixtures — see Pitfall 3):**
| Req | Behavior | Test type | Command | Fixture |
|-----|----------|-----------|---------|---------|
| IMAGE-01 | `buildTic` sums intensity → correct raster | unit | `vitest run src/compute/tic.test.ts` | synthetic XIC + 3×2 grid |
| IMAGE-04 | Orientation key + 1-based hover + aspect | unit | hit-test math test | synthetic grid |
| IMAGE-04 | Sparse sentinel ≠ zero | unit | rasterize test (`presenceMask=0` cell) | synthetic grid with 1 absent px |
| DATA-03 | Representation routing selects correct source | unit | `vitest run src/reader/arrays.test.ts` | mock reader (profile + centroid) |
| DATA-03 | `useProfile` derivation (profile/centroid/mixed) | unit | store/compute test | mock `representationCounts` |
| SPEC-01 | Click → selectSpectrum → uPlot data set | unit/e2e | store action test; e2e gated on imaging fixture | mock reader / PXD001283 (gated) |

**Wave 0 gaps:**
- [ ] `src/compute/tic.test.ts` — covers IMAGE-01, reverse-map, bigint conversion, sparse skip.
- [ ] Synthetic imaging-grid + XIC fixture builder (shared helper) — no real imaging `.mzpeak` exists.
- [ ] Extend `src/reader/arrays.test.ts` for DATA-03 explicit routing.
- [ ] (Optional) `src/ui/rasterize.test.ts` if rasterize is extracted as a pure function (Pitfall 4).
- [ ] e2e imaging round-trip: **blocked** on a real imaging fixture → gate behind `checkpoint:human-verify`.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config. Phase 3 is a client-side, read-only, no-network, no-auth feature. Most ASVS categories are N/A.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth — client-side static app. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No server, no resources to access-control. |
| V5 Input Validation | yes (light) | TIC/coords derived from file data — bound-check canvas→grid coords (clamp to `[0,width)`), guard `Number(bigint)` (Pitfall 1/5), reject non-finite sums. Reuse `grid.ts` guards. |
| V6 Cryptography | no | No crypto. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed coords → OOB typed-array write / huge allocation | Tampering / DoS | Already mitigated in `grid.ts` (`MAX_CELLS` cap, finite/bounds checks). TIC raster is `width*height` of an already-capped grid → no new allocation risk. |
| Adversarial spectrum id (regex) | DoS (ReDoS) | Already bounded in `scanCoords.ts` (`{1,9}` digit cap). Not touched in Phase 3. |
| NaN/Infinity intensity → broken colormap | Tampering | Clamp normalized value to `[0,1]`; treat non-finite sum as 0 or skip. |

**No new attack surface:** no network calls, no `eval`, no user-supplied HTML, no postinstall, no new dependency.

## Sources

### Primary (HIGH confidence)
- `vendor/mzpeakts/lib/src/reader.ts:20-32, 226-296` — `XICPoint`/`XIC` types, `getSpectrum`, `extractXIC(timeRange, mzRange, useProfile)`, `spectrumData()`/`spectrumPeaks()`.
- `vendor/mzpeakts/lib/src/data.ts:18-27, 1119-1176` — `DataArrays` type, `packTableIntoDataArrays`, `extractRangeFor` (null-range → enumerate-all behavior).
- `vendor/mzpeakts/lib/src/metadata.ts:377-430` — `dataPointCount`/`peakCount` accessors (why `getSpectrum` populates dataArrays xor centroids).
- `src/state/store.ts:88-197` — `runLoad` staged pattern, `'grid'` stage, `selectSpectrum`.
- `src/imaging/grid.ts:37-168` — `buildImagingGrid`, key formula `y0*width+x0`, presence mask, diagnostics.
- `src/imaging/types.ts` — `ImagingGrid` shape (coordToSpectrumIndex, presenceMask, pixelSizeUm, coordinateBase).
- `src/reader/types.ts` — `SpectrumRepresentation`, `SpectrumMeta`, `FileStats.representationCounts`, `LoadStage`.
- `src/reader/fileMeta.ts:77-104` — `spectrumMeta` representation accessor.
- `src/reader/arrays.ts` — current `getSpectrumArrays` (extension target for D-07).
- `src/reader/scanCoords.ts:60-70` — `toCoordNumber` bigint-safe conversion pattern.
- `src/ui/SpectrumPanel.tsx`, `src/ui/App.tsx`, `src/ui/GridDiagnosticsPanel.tsx` — uPlot mount, layout, collapsible-panel pattern.
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` C2/C3/C5/C6/C8 — fixed orientation, 1-based, aspect, signal routing, sparse mask.
- `.planning/research/ARCHITECTURE.md:52-246` — compute/render/worker layering, TIC dataflow, `extractXIC` usage.
- `test/data/README.md` — fixture inventory (both fixtures non-imaging → Pitfall 3).
- `.planning/REQUIREMENTS.md` — IMAGE-01/04, SPEC-01/02, DATA-03 wording + traceability.

### Secondary (MEDIUM confidence)
- None — no WebSearch needed; phase is fully internal.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all APIs read from vendored source + existing code.
- Architecture: HIGH — dataflow verified end-to-end against `extractXIC`/`extractRangeFor`/grid source.
- Pitfalls: HIGH — each pitfall traced to a specific source line (bigint at `reader.ts:21`, null-range enumerate at `data.ts:1125`, fixtures at `README.md`, reverse-map at `grid.ts:116`).
- Open question A2/A4 (D-07 interpretation, SPEC-02 scope): MEDIUM — needs planner/operator confirmation.

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable — internal codebase + pinned vendored reader; revisit if the vendored mzpeakts is updated or an imaging fixture lands).
