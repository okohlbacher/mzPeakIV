# Architecture Research

**Domain:** Client-side browser explorer for a Parquet-backed scientific file format (mass-spectrometry imaging)
**Researched:** 2026-06-03
**Confidence:** HIGH on the reader API and data flow (read mzpeakts source directly); MEDIUM-LOW on the imaging coordinate layer (no spec, no public example — must be pinned against the operator's real file)

## Standard Architecture

The app is a four-layer, strictly **bottom-up** pipeline. Bytes flow up; user actions
(pick m/z, click pixel) flow down as *queries* against layers that are already built.
Nothing in an upper layer reaches around a lower one — the UI never touches Parquet,
the compute layer never touches Canvas.

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  (D) UI LAYER  — React + Canvas2D + uPlot                            │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ FileLoad │  │ MetaPanel  │  │ IonImageView │  │ SpectrumPanel  │ │
│  │ (file/URL)│  │            │  │ (Canvas)     │  │ (uPlot)        │ │
│  └────┬─────┘  └─────┬──────┘  └──────┬───────┘  └───────┬────────┘ │
│       │              │                │ pixel click      │           │
│       │              │                ▼                  │           │
│  ┌────┴──────────────┴────────────────────────────────────┐         │
│  │   STORE  (zustand)  — reader handle, grid, current      │         │
│  │   ion image (Float32Array), selection, colormap/scale   │         │
│  └────┬────────────────────────────────────────────────────┘         │
├───────┼───────────────────────────────────────────────────────────────┤
│  (C) COMPUTE / AGGREGATION LAYER   (runs in a Web Worker)            │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ IonImageBuilder      │  │ TicBuilder                           │  │
│  │ sum(intensity) in    │  │ sum(all intensity) per spectrum      │  │
│  │ m/z±tol per spectrum │  │                                      │  │
│  └──────────┬──────────┘  └─────────────────┬────────────────────┘  │
│             │   per-spectrum scalar[]         │                       │
├─────────────┼───────────────────────────────┼────────────────────────┤
│  (B) IMAGING MODEL LAYER                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ImagingGrid:  coord(x,y) → spectrum_index  +  index → (x,y)   │   │
│  │ bounding box (minX..maxX, minY..maxY), presence mask, w×h      │   │
│  │ CoordExtractor (pluggable: imzML IMS:1000050/51 strategy)      │   │
│  └────────────────────────────┬─────────────────────────────────┘   │
├───────────────────────────────┼──────────────────────────────────────┤
│  (A) READER / IO LAYER  — vendored mzpeakts                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ MzPeakReader (fromBlob / fromUrl)                             │   │
│  │  • spectrumMetadata (eager Arrow): get(i), parameters, time,  │   │
│  │    dataPointCount(), numSpectra                               │   │
│  │  • spectrumData() → DataArraysReader (lazy, seekable)         │   │
│  │  • getSpectrum(i) → {dataArrays:{mz,intensity}}               │   │
│  │  • extractXIC(timeRange, mzRange) → per-spectrum summed I     │   │
│  │  • fileMetadata (file_description/instrument/software/run)    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│   parquet-wasm 0.7.1 (vendored) + apache-arrow + zip.js              │
└──────────────────────────────────────────────────────────────────────┘
            ▲ bytes: File (BlobReader) or URL (HttpRangeReader → ZIP)
```

### Component Responsibilities

| Component | Responsibility (owns) | Implementation |
|-----------|------------------------|----------------|
| **MzPeakReader** (vendored) | Open ZIP, read `mzpeak_index.json`, decode Parquet→Arrow, expose metadata eagerly + signal arrays lazily. Point/chunked/delta layouts. | Vendor `mzpeakts/lib/src/*` in-tree (not on npm). Do **not** fork its internals; wrap it. |
| **CoordExtractor** | Pull (x,y) for each spectrum from metadata. Pluggable *strategy* — the one risky, format-unstable piece. | `interface CoordSource { coordsFor(meta): {x,y} | null }`. Default strategy reads imzML CV params (IMS:1000050/51) from each spectrum's `parameters`/promoted columns. Swappable when the real file is seen. |
| **ImagingGrid** | Build `index→(x,y)` and `(x,y)→index` maps, bounding box, width/height, presence mask, isImaging flag. Owns "where does each spectrum sit." | Pure TS over the eager metadata table. Built once at load. |
| **TicBuilder** | Per-spectrum total intensity → scalar array aligned to spectrum_index. | Calls reader once; fully in-memory v1. |
| **IonImageBuilder** | Per-spectrum summed intensity in m/z±tol → scalar array. | v1: `reader.extractXIC(null, {start,end})`. v2: column scan. |
| **ImageRasterizer** | Scalar-per-spectrum + grid → `Float32Array` raster (w×h), then → `ImageData` via colormap + scaling. Owns pixel hit-testing (canvas xy → spectrum_index). | Pure TS + Canvas2D. No reader/Arrow knowledge. |
| **Worker bridge** | Run A/B/C off the main thread; post raster + grid back. | One module worker + typed message protocol. |
| **Store (zustand)** | Single source of truth for UI: reader handle, grid, current raster, selected pixel, m/z window, colormap, scale. | Light. No business logic — just state + thin actions that call the worker. |
| **React panels** | Render store state. FileLoader, MetadataPanel, IonImageView (Canvas), SpectrumPanel (uPlot). | Dumb-ish components subscribing to store slices. |

## Recommended Project Structure

```
src/
├── reader/                 # (A) IO layer — the ONLY place that imports mzpeakts
│   ├── vendor/mzpeakts/    # in-tree copy of lib/src/*.ts + vendored parquet-wasm
│   ├── openFile.ts         # File → MzPeakReader.fromBlob
│   ├── openUrl.ts          # URL  → MzPeakReader.fromUrl (HTTP range)
│   ├── fileMeta.ts         # normalize fileMetadata → plain UI-friendly objects
│   └── arrays.ts           # thin helpers: getSpectrumArrays(i) → {mz,intensity}
├── imaging/                # (B) Imaging model — pure, no Arrow types leak out
│   ├── coordSource.ts      # CoordSource interface + ImzmlCvCoordSource strategy
│   ├── grid.ts             # ImagingGrid: maps, bbox, mask, isImaging detection
│   └── types.ts            # ImagingGrid, PixelCoord, GridStats
├── compute/                # (C) Aggregation
│   ├── tic.ts              # buildTic(reader) → Float32Array
│   ├── ionImage.ts         # buildIonImage(reader, mz, tol) → Float32Array
│   ├── mzWindow.ts         # binary-search window selection over sorted m/z
│   └── worker.ts           # Web Worker entry; message protocol; owns reader+grid
├── render/                 # raster + color (pure, Canvas-facing)
│   ├── rasterize.ts        # scalar[]+grid → Float32Array raster (w×h)
│   ├── colormap.ts         # viridis/inferno/grey LUTs → ImageData
│   ├── scaling.ts          # linear / log / percentile-clip normalizers
│   └── hitTest.ts          # canvas (px,py) → spectrum_index | null
├── state/
│   └── store.ts            # zustand store + actions (call worker, set raster)
├── ui/
│   ├── App.tsx
│   ├── FileLoader.tsx
│   ├── MetadataPanel.tsx
│   ├── IonImageView.tsx    # <canvas>, draws ImageData, click→hitTest
│   ├── SpectrumPanel.tsx   # uPlot, marks current m/z window
│   └── Controls.tsx        # m/z input, tol (Da/ppm), colormap, scale
└── main.tsx
```

### Structure Rationale

- **`reader/` is the single import site for mzpeakts.** The format is explicitly unstable; isolating the only dependency on it means a schema change touches one folder. Everything above `reader/` speaks in plain `{x,y}`, `Float32Array`, and `{mz, intensity}` — never Arrow `Vector`/`bigint`.
- **`imaging/` separates "where is each pixel" from "what's the value there."** The coordinate convention is the project's central risk; giving it its own strategy-pattern module lets you swap `ImzmlCvCoordSource` for a real-file strategy without touching compute or UI.
- **`compute/` lives behind a worker boundary.** Aggregation over thousands of spectra (full-column scan or repeated row-group reads) blocks the main thread; keeping it in `compute/worker.ts` keeps the UI responsive.
- **`render/` is pure and Canvas-only.** Rasterization, colormaps, scaling, and hit-testing have no I/O — trivially unit-testable and reusable for both TIC and ion images.

## Architectural Patterns

### Pattern 1: Strategy-pluggable coordinate extraction (de-risks the unknown spec)

**What:** A `CoordSource` interface with one method; the default implementation reads imzML
CV params, but the grid builder depends only on the interface.
**When to use:** Always here — the on-disk imaging convention is unconfirmed.
**Trade-offs:** Tiny indirection cost; huge adaptability win. When the operator's real
`.mzpeak` arrives, write a second strategy and select it via cheap auto-detection
(probe the first spectrum's metadata for known accessions/columns).

```typescript
export interface CoordSource {
  /** null = this spectrum has no spatial coords (not imaging). */
  coordsFor(meta: SpectrumMeta): { x: number; y: number } | null;
}

// Default hypothesis: imzML lineage. IMS:1000050 = position x, IMS:1000051 = position y.
export class ImzmlCvCoordSource implements CoordSource {
  coordsFor(meta: SpectrumMeta) {
    const x = paramNum(meta, "IMS:1000050");   // also try promoted column name variants
    const y = paramNum(meta, "IMS:1000051");
    return x != null && y != null ? { x, y } : null;
  }
}
```

> **mzpeakts reality check:** per-spectrum cvParams land in `meta.parameters` (array of
> `{name, value, accession, unit}`) *and*, when promoted to columns, in the raw record
> as `MS_xxxx_...` / `IMS_xxxx_...` keys (see `ParamColumnSpec.fromColumnName`). The
> extractor must check **both** the `parameters` list and promoted columns — accession is
> the stable key, column name is not.

### Pattern 2: Build the grid once, reuse for every ion image

**What:** `ImagingGrid` is computed once from eager metadata at load time and cached. Ion
images and TIC are just `scalar-per-spectrum-index` arrays scattered onto the same grid.
**When to use:** Always. The grid is invariant for a file; only the scalar values change
per m/z query.

```typescript
interface ImagingGrid {
  width: number; height: number;
  minX: number; minY: number;                 // bbox origin
  indexToXY: Int32Array;                       // [2*i] = x, [2*i+1] = y
  xyToIndex: Int32Array;                       // length w*h, -1 = no pixel
  mask: Uint8Array;                            // presence (w*h)
  isImaging: boolean;
}
```

### Pattern 3: Scatter + rasterize (decouple value computation from drawing)

**What:** Compute produces a `Float32Array` indexed by `spectrum_index`; rasterize
scatters it through `grid.indexToXY` into a `Float32Array` of length `w*h`; color maps
that to `ImageData`. Three pure stages, three test points.
**When to use:** Both TIC and ion image — identical downstream of the scalar array.
**Trade-offs:** One extra array copy (negligible) for a clean seam between "what's the
value" and "how do we paint it" (log/percentile/colormap changes never re-query the file).

```typescript
const raster = rasterize(scalarPerSpectrum, grid);          // Float32Array(w*h)
const norm   = applyScale(raster, { mode: "percentile", lo: 2, hi: 98 });
const img    = toImageData(norm, colormaps.viridis, grid.mask);
ctx.putImageData(img, 0, 0);
```

### Pattern 4: m/z window selection by binary search over the sorted array

**What:** mzPeak m/z arrays are sorted ascending (chunked layout *requires* a sorted
coordinate; point layout is conventionally sorted). Find the `[lo,hi]` slice for `mz±tol`
with two binary searches, then sum intensity over that slice — O(log n + k) not O(n).
**When to use:** Inside `IonImageBuilder` per spectrum.
**Note:** mzpeakts already ships `binarySearch` / `betweenSorted` (utils) and uses them in
`extractRangeFor`; v1 can lean on `extractXIC` and skip writing this. Write it yourself
only in the v2 column-scan path.

## Data Flow

### Load → TIC image (the first thing that must work)

```
File/URL bytes
   → MzPeakReader.fromBlob/fromUrl        (A) ZIP + index + eager metadata Arrow
   → CoordExtractor over metadata          (B) {x,y} per spectrum
   → ImagingGrid.build                      (B) w×h, bbox, mask, index↔xy maps
   → TicBuilder (sum intensity / spectrum)  (C) Float32Array[numSpectra]
   → rasterize(scalar, grid)               render Float32Array(w*h)
   → scale + colormap → ImageData          render
   → <canvas>.putImageData                  (D) TIC IMAGE ON SCREEN
```

### Pick m/z → ion image

```
m/z value + tol (Da or ppm)                 (D) Controls → store
   → store action → Worker.postMessage({type:"ionImage", mz, tol})
   → IonImageBuilder: extractXIC(null,{start:mz-tol,end:mz+tol})  (C)
        (per spectrum: binary-search slice, sum intensity)
   → Float32Array[numSpectra] → transfer back to main thread
   → rasterize + scale + colormap → ImageData → canvas              (D)
```

### Click pixel → spectrum

```
canvas (px,py)                              (D) IonImageView onClick
   → hitTest(px,py,grid) → spectrum_index   render
   → store.selectPixel(index)
   → reader.getSpectrum(index)              (A) lazy row-group read → {mz,intensity}
   → uPlot setData, draw m/z-window band     (D) SpectrumPanel
```

### State Management (zustand, intentionally light)

```
store: {
  reader, grid, fileMeta,                    // set once on load
  ticRaster, ionRaster, activeRaster,        // Float32Array(w*h)
  mzWindow:{mz,tol,unit}, colormap, scale,   // view params (no re-query for color/scale)
  selectedIndex, selectedSpectrum,           // pixel inspection
  status:"idle|loading|ready|error", error
}
actions: openFile, openUrl, setMzWindow→worker, setColormap, setScale,
         selectPixel→reader.getSpectrum
```

Components subscribe to slices; the worker is the only thing that does heavy work.
Context could substitute for zustand, but zustand's selector subscriptions avoid
re-rendering the Canvas panel when only the metadata panel's data changes — worth the
one tiny dependency.

## The In-Memory vs Lazy Decision (resolved)

Two viable compute strategies, with a concrete v1 pick:

| Strategy | How | Pros | Cons |
|----------|-----|------|------|
| **(v1) Per-spectrum lazy via `extractXIC`** | Reuse the reader's existing `extractXIC(null, mzRange)` which calls `DataArraysReader.extractRangeFor` — one seekable pass over `spectra_data.parquet`, summing the m/z slice per spectrum. | **Zero new parsing code** — the reader already does it. Correct against point/chunked/delta. Memory ≈ one spectrum at a time. Works the moment the reader opens the file. | Re-reads the data file for every ion image (one pass per m/z query). Fine at demo scale (thousands of pixels). |
| **(v2 upgrade) Full-column in-memory** | One-time `handle.stream({columns:["spectrum_index","mz","intensity"]})` (parquet-wasm streaming, already used internally) → concatenate into three big typed arrays + an offsets index (start row per spectrum_index). Ion image = for each spectrum, binary-search its m/z sub-slice and sum. | **Instant** ion images after the one-time load (pure in-RAM, no I/O per query). Ideal for interactive m/z sweeping. | Holds the whole signal column set in RAM (mz+intensity Float64/Float32 across all points). Only feasible for demo-/moderate-scale files. Needs ~tens–hundreds of MB for large MSI. Must be built in the worker. |
| **(v3 scale path) Lazy row-group with column projection** | Same per-spectrum scan as v1 but project only `spectrum_index`+`mz`+`intensity` columns and read by row-group; optionally cache row-group decode. | Scales to files too big for RAM; bounded memory. | Slower per query than v2; more code than v1. |

**Recommendation:**
- **v1 = `extractXIC`-based per-spectrum lazy.** It is *correct* (delegates to battle-tested
  reader code that handles every documented layout) and gets a working ion image with
  almost no new code. This directly serves the Core Value: file → ion image → spectrum,
  correctly, fast to ship.
- **Upgrade path = v2 in-worker column cache** once the demo file's size is known and
  interactive m/z scrubbing is desired. The seam is clean: `IonImageBuilder` keeps the
  same `(mz,tol) → Float32Array` signature; only its internals change. Add v2 behind a
  size threshold (e.g. load columns in-RAM if total signal points < N, else stay on v1/v3).
- **TIC** is computed the same way (sum the whole intensity array per spectrum) and is
  cheap enough to always do once at load via v1.

> **Why not start with v2?** It needs a column-streaming extension to the reader and a
> per-spectrum offsets index that the reader doesn't expose today. That's real code and a
> place to be wrong about the schema. v1 reuses `extractXIC` verbatim. Ship correct first.

### Web Worker boundary

- **Inside the worker:** the `MzPeakReader` handle (constructed there from the
  transferred `File`/`Blob` or URL), `ImagingGrid`, `TicBuilder`, `IonImageBuilder`, the
  optional v2 column cache, and `mzWindow` math. All Parquet/Arrow/WASM stays off the main
  thread.
- **Crossing the boundary (postMessage):** small, transferable payloads only —
  `Float32Array` rasters (transfer the buffer), grid stats (`{w,h,bbox,mask}` once),
  `fileMeta` (plain JSON), and on pixel-click the single spectrum's `{mz,intensity}`
  typed arrays. Never post Arrow `Table`/`Vector` or `bigint`-laden records across the
  wire — normalize to plain numbers/typed arrays in the worker first.
- **Caveat:** `HttpRangeReader` and `BlobReader` both work in a worker. A picked `File`
  is structured-cloneable to a worker; prefer transferring the `File` over reading bytes
  on the main thread.

## Dependency-Ordered Build Sequence

Each step unblocks the next; **a real TIC image appears at Step 4**, before any m/z UI,
colormap polish, or worker exists.

1. **Vendor + open (A).** Copy `mzpeakts/lib/src` + vendored `parquet-wasm` in-tree under
   `reader/vendor`. Wire `openFile`/`openUrl`. Smoke test: open the bundled `small.mzpeak`,
   log `numSpectra` and `fileMetadata`. *(Unblocks everything.)*
2. **Coordinate extraction (B).** `CoordSource` + `ImzmlCvCoordSource`. Dump per-spectrum
   `{x,y}` for the sample (or detect "no coords → not imaging"). *(De-risks the central
   unknown early; against the operator's real file the moment it exists.)*
3. **Imaging grid (B).** Build bbox, w×h, `index↔xy` maps, mask, `isImaging`. Log grid
   stats. *(Unblocks all rasterization.)*
4. **TIC + rasterize + paint, on the main thread (C+render+D-minimal).** `buildTic` via
   `extractXIC`-style full-array sum, `rasterize`, a single greyscale linear colormap,
   `putImageData` onto a bare `<canvas>`. **→ Working TIC image. Core round-trip half-done.**
5. **Pixel hit-test → spectrum (render+A+D).** `hitTest`, `reader.getSpectrum`, drop the
   `{mz,intensity}` into uPlot. **→ Core Value complete: file → image → click → spectrum.**
6. **Ion image query (C+D).** m/z + tol (Da/ppm) controls → `IonImageBuilder.extractXIC`
   → new raster. *(Now arbitrary ion images, still main-thread.)*
7. **Move A/B/C into the Web Worker.** Lift the reader+grid+builders behind the message
   protocol; transfer rasters. *(UI stays responsive on big files.)*
8. **Color + scaling polish (render).** Viridis/inferno LUTs, log + percentile clipping,
   legend. *(Pure view layer — no re-query.)*
9. **Metadata panel + error surfacing (D).** Render `fileMetadata`; clear messages for
   non-imaging / unsupported (Numpress/aux/directory storage the vendored reader can't do).
10. **(Upgrade) v2 in-worker column cache** behind a file-size threshold for instant m/z
    scrubbing.

## Scaling Considerations

"Scale" here = file size / spectrum count, not concurrent users (single-user static app).

| Scale | Architecture adjustment |
|-------|--------------------------|
| Demo file (≤ ~10k pixels, signal fits in RAM) | v1 `extractXIC` per query is fine; everything can even stay on main thread until Step 7. |
| Moderate (10k–100k pixels) | Worker mandatory (Step 7). Consider v2 column cache for interactive m/z scrubbing; otherwise v1 per-query latency grows with one data-file pass per query. |
| Large (100k+ pixels, multi-GB) | v3 lazy row-group + column projection; URL + `HttpRangeReader` so the whole file is never downloaded; cache decoded row-groups; consider a per-spectrum m/z-range index to skip irrelevant row-groups. |

### Scaling Priorities

1. **First bottleneck: main-thread blocking during aggregation** → move A/B/C into the
   worker (Step 7). This is the single highest-value scaling move.
2. **Second bottleneck: re-reading the data file per ion-image query** → v2 in-RAM column
   cache (instant queries) or v3 row-group caching (bounded memory).

## Anti-Patterns

### Anti-Pattern 1: Hardcoding the imaging coordinate convention

**What people do:** Bake `IMS:1000050/51` (or a specific promoted column name) directly
into the grid builder.
**Why it's wrong:** The convention is *unconfirmed* — there is no mzPeak imaging spec and
no public example. A real file may use different accessions, column promotion, or even a
`scan` group field. Hardcoding means a rewrite, not a config change.
**Do this instead:** Strategy pattern (`CoordSource`), auto-detect by probing the first
spectrum's metadata, key on **accession** not column name.

### Anti-Pattern 2: Leaking Arrow / bigint types upward

**What people do:** Pass the reader's Arrow `Table`/`Vector` or `bigint` spectrum indices
into the imaging, compute, or UI layers.
**Why it's wrong:** Couples every layer to mzpeakts internals (which will change), breaks
structured-clone across the worker boundary, and `bigint` arithmetic surprises the UI.
**Do this instead:** Normalize to plain `number`, `Float32Array`/`Float64Array`, and POJOs
at the `reader/` boundary. Nothing above `reader/` imports `apache-arrow`.

### Anti-Pattern 3: Re-querying the file when only the colormap or scale changes

**What people do:** Recompute the ion image whenever the user toggles log scale or changes
colormap.
**Why it's wrong:** Color/scale are pure functions of the already-computed `Float32Array`
raster. Re-reading Parquet for a colormap change is pointlessly slow.
**Do this instead:** Cache the raster (scalar-per-pixel) in the store; recompute only the
`ImageData` from raster on color/scale changes (Pattern 3's seam).

### Anti-Pattern 4: Forking mzpeakts internals instead of wrapping it

**What people do:** Edit the vendored reader to add imaging logic.
**Why it's wrong:** Makes it impossible to track upstream as the unstable format evolves;
mixes app concerns into a generic reader.
**Do this instead:** Vendor read-only; build imaging/compute *on top*. Extend the reader
only if the operator's sample needs Numpress / aux arrays / directory storage (currently
unimplemented upstream), and contribute those upstream rather than diverging.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Remote `.mzpeak` over HTTP | `MzPeakReader.fromUrl` → zip.js `HttpRangeReader` | Server must support **HTTP range requests** + permissive CORS (`Access-Control-Allow-Origin`, expose range headers). GitHub Pages / raw object stores generally do. |
| parquet-wasm WASM binary | Vendored `parquet_wasm_bg.wasm` (0.7.1) | Vite must serve/bundle the `.wasm`; ensure correct asset handling and `setPanicHook()` runs once. WASM init is async — gate the reader behind it. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| reader ↔ imaging | direct call, plain `{x,y}` | imaging never imports Arrow. |
| imaging ↔ compute | `ImagingGrid` (POJO + typed arrays) | grid built once, passed by value into worker. |
| compute(worker) ↔ store(main) | `postMessage` + transferable `Float32Array` | rasters transferred (zero-copy); grid + meta cloned once. |
| store ↔ React | zustand selector subscriptions | Canvas panel subscribes only to `activeRaster`/`colormap`/`scale`. |
| render ↔ UI | `ImageData` + `hitTest` | render is pure; UI owns the actual `<canvas>` element. |

## Sources

- HUPO-PSI/mzpeakts reader source (read directly): `lib/src/reader.ts`, `data.ts`,
  `store.ts`, `metadata.ts`, `array_index.ts`, `record.ts`, `index.ts` — confirms
  `MzPeakReader` API (`fromBlob`/`fromUrl`, `getSpectrum`, `extractXIC`, `numSpectra`,
  `spectrumMetadata.get/dataPointCount`, `DataArraysReader.enumerate/extractRangeFor`),
  vendored `parquet-wasm` 0.7.1, `packTableIntoDataArrays`, `binarySearch`/`betweenSorted`,
  point/chunked/delta support and Numpress/aux/directory **not** implemented. **HIGH.**
- HUPO-PSI/mzPeak `doc/index.md` — ZIP container, `mzpeak_index.json`,
  `spectra_metadata.parquet` / `spectra_data.parquet`, point vs chunked layout,
  `spectrum_index`, `spectrum_array_index`, CV terms MS:1000514 (m/z) / MS:1000515
  (intensity), file-level metadata. **No imaging/MSI/spatial section** (confirmed absent).
  **HIGH** for format; the imaging coordinate hypothesis is **LOW** (inferred from imzML
  lineage, not the spec).
- Project PROJECT.md (operator-supplied constraints, stack, imaging hypothesis). **HIGH.**

---
*Architecture research for: client-side mzPeak imaging explorer*
*Researched: 2026-06-03*
