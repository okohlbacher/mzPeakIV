# Project Research Summary

**Project:** mzPeakExplorer
**Domain:** Client-side, static-hosted browser explorer for mass-spectrometry-imaging (MSI) data in the mzPeak format (in-browser Parquet/Arrow via WASM, Canvas2D ion images, uPlot spectra)
**Researched:** 2026-06-03
**Confidence:** HIGH on stack/architecture/format mechanics; MEDIUM-LOW on the imaging coordinate convention (no spec, no public example)

## Executive Summary

mzPeakExplorer is a read-only, fully client-side browser tool that makes the new mzPeak imaging format tangible: open a `.mzpeak` (local or URL), reconstruct the spatial pixel grid, render a TIC overview and per-*m/z* ion images, and click any pixel to see its spectrum. Experts in this space (METASPACE, MSiReader, Cardinal, SCiLS) build MSI viewers around exactly this round-trip — grid → ion image → pixel spectrum — with display-only intensity scaling (log/percentile) as table stakes. The differentiator here is structural: no upload, no backend, no account, statically hostable on GitHub Pages, plus a "raw-format inspector" view that no analysis tool offers. The committed scope deliberately excludes the heavy analysis features (peak picking, annotation, segmentation, co-localization, data-level normalization) that define the commercial suites — this is an orientation tool, not an analysis suite.

The recommended approach leans hard on reuse. The upstream `mzpeakts` reader already handles ZIP + Parquet + Arrow and the point/chunked/delta layouts, and — critically — **already ships `extractXIC(timeRange, mzRange)`, which is the exact ion-image primitive**: per-spectrum summed intensity over an *m/z* slice. v1 therefore needs almost no new parsing code; it adds a thin imaging layer (coordinate extraction + grid + rasterizer + colormaps) on top. The verified stack is Vite 8 + React 19 + TypeScript ~5.9, Canvas2D for heatmaps, uPlot 1.6.x for spectra, with the reader chain pinned to parquet-wasm 0.7.1 / apache-arrow 21.1.0 / arrow-js-ffi 0.4.3 / zip.js 2.8.x. parquet-wasm 0.7.1 is single-threaded ESM, so **no COOP/COEP / SharedArrayBuffer / cross-origin isolation is needed** (proven by the upstream demo running on GitHub Pages). The one real stack cost is the ~6.5 MB uncompressed WASM (~1.5–2 MB on the wire via gzip), loaded once and cached.

The dominant risk is singular and must shape the roadmap: **the imaging coordinate convention is unconfirmed.** mzPeak has no MSI spec section and there is no public imaging example. The working hypothesis (one spectrum per pixel, coords in scan/spectrum cvParams `IMS:1000050`/`1000051`, imzML lineage) may be wrong — a real file could promote coords to Parquet columns, use `scan_settings`, encode them in the spectrum `id`, or carry a z dimension. Hard-coding the convention produces ion images that are *wrong while looking plausible*. Mitigation is a swappable `CoordSource` strategy layer with multiple auto-detecting probes, grid diagnostics (unique-coord count vs spectrum count, filled/total ratio), and gating the whole imaging milestone on validation against the operator's real `.mzpeak`. Secondary risks — silently mis-reading unsupported encodings (Numpress/aux/directory), browser OOM, blank images from linear-only scaling, and Y-flip/aspect — all have known, cheap preventions if addressed in the right phase.

## Key Findings

### Recommended Stack

The pre-made decisions (Vite + React + TS, Canvas2D, uPlot, vendor `mzpeakts`) are validated as sound; research mainly pinned exact current versions and answered the WASM/deployment questions. The reader (`mzpeakts`) is not on npm — vendor it via git submodule (build-and-`file:`-link) for normal use, dropping to an in-tree copy of `lib/src/*.ts` only when the imaging coordinate layer needs reader-internal edits. Pin to a specific upstream commit (the format is unstable). Deploy via the official Vite GitHub Actions pattern with `base: '/<REPO>/'`; ship the `.wasm` as a hashed asset (never inline it). See STACK.md.

**Core technologies:**
- **Vite 8.0.16 + @vitejs/plugin-react 6.0.2** — build/dev + JSX — current SPA stack, first-class GitHub Pages `base`, official WASM plugin support.
- **React 19.2.7 + TypeScript ~5.9** — multi-panel UI — current stable; pin TS to ~5.9 (TS 6 too new for the lint toolchain).
- **uPlot 1.6.32** — spectrum plotting — fastest tiny canvas line chart for dense 1D series; mount via `useRef`, no React wrapper.
- **mzpeakts (vendored, pinned commit) → parquet-wasm 0.7.1 + apache-arrow 21.1.0 + arrow-js-ffi 0.4.3 + @zip.js/zip.js 2.8.26** — the reader chain — already parses ZIP/Parquet/Arrow + point/chunked/delta; **do not split the arrow/parquet-wasm majors** (zero-copy layout must match).
- **vite-plugin-wasm 3.6.0 + vite-plugin-top-level-await 1.6.0** — mandatory for the WASM reader to import/init.
- **No COOP/COEP, no coi-serviceworker, no vite-plugin-singlefile** — single-threaded WASM needs no isolation; inlining 6.5 MB breaks caching.

### Expected Features

Reference tools: METASPACE (closest web UX analog), MSiReader (closest feature analog — Da/ppm tolerance, sum/max, colormap), Cardinal/SCiLS (analysis ceiling = anti-features), SeeMS (spectrum-panel idiom). See FEATURES.md.

**Must have (table stakes):**
- Load file (local picker + drag-drop) and from URL (HTTP range-friendly)
- Parse ZIP + `mzpeak_index.json`, list entities; show file/instrument/run/sample metadata + spectrum counts
- Detect imaging + reconstruct pixel grid — **THE gate** for everything spatial
- TIC overview image (default), then ion image for *m/z* ± tolerance (Da AND ppm)
- Colormap selection + intensity scaling (linear/log + percentile clip — not optional; raw MSI images are hot-pixel-dominated and look blank without it)
- Click pixel → spectrum with selected *m/z* window marked
- Handle point + chunked + delta layouts; graceful, *distinct* errors per failure class

**Should have (competitive / differentiators):**
- Zero-install, fully client-side, static-hosted (structural — shapes every decision)
- Raw-format inspector view (manifest entities, schema, CV-term mapping, per-array encoding) — what HUPO-PSI implementers want; no existing tool does it
- Hover pixel → live x/y + intensity readout, and pixel-grid diagnostics — cheap, and double as correctness instruments for the risky grid layer
- Sum-vs-max aggregation toggle; shareable app-state URL; mean/representative spectrum

**Defer (v2+):**
- MS-Numpress / auxiliary arrays / directory storage (reader work; only if a real file needs it — fail loudly until then)
- Optical-image overlay, 2-channel co-localization, multi-run/multi-sample
- All analysis features (peak picking, annotation, segmentation, data-level normalization) — explicit anti-features

### Architecture Approach

A strictly bottom-up four-layer pipeline: bytes flow up, user queries flow down, and no upper layer reaches around a lower one (the UI never touches Parquet; compute never touches Canvas). `reader/` is the single import site for `mzpeakts` — everything above it speaks plain `{x,y}`, `Float32Array`, `{mz,intensity}`, never Arrow `Vector`/`bigint`. The grid is built once per file; ion images and TIC are just scalar-per-spectrum arrays scattered onto it, then colored — so colormap/scale changes never re-query the file. v1 computes ion images via the reader's existing `extractXIC` (zero new parsing); a v2 in-worker column cache is the clean upgrade for interactive *m/z* scrubbing. See ARCHITECTURE.md.

**Major components:**
1. **MzPeakReader (vendored)** — open ZIP, read manifest, decode Parquet→Arrow, expose metadata eagerly + signal arrays lazily; `extractXIC` is the ion-image primitive.
2. **CoordSource (pluggable strategy) + ImagingGrid** — the one risky, format-unstable piece; produces `(x,y)↔index` maps, bbox, presence mask, `isImaging` flag.
3. **TicBuilder / IonImageBuilder (compute, worker-bound)** — per-spectrum scalar arrays.
4. **Rasterizer + colormap/scaling + hitTest (render, pure Canvas)** — scalar → `Float32Array` raster → `ImageData`; pixel → spectrum_index.
5. **Store (zustand) + React panels** — light single source of truth; dumb-ish panels subscribing to slices.

### Critical Pitfalls

1. **Hard-coding the imaging coordinate convention (THE #1 risk)** — build a swappable `CoordSource` strategy with multiple probes (scan cvParams `IMS:1000050/51/52`, named columns, `scan_settings`, parse from `id`), key on accession not column name, validate the grid (unique coords == spectrum count, contiguous/explainably-sparse extents), and pin against the operator's real file before building rendering on top.
2. **Silently mis-reading unsupported encodings (Numpress / aux arrays / directory storage)** — these are unimplemented in `mzpeakts`; detect at load and **fail loudly with a named error**, never return all-zeros that look like real (absent) signal.
3. **m/z window math (ppm vs Da, profile vs centroid, sum vs max)** — convert ppm→Da at the center *m/z* and unit-test it (500 @ 10 ppm = 0.005 Da); detect profile (`MS:1000128`) vs centroid (`MS:1000127`); default to sum, label the colorbar; TIC is the smoke test.
4. **Blank images from linear-only scaling + sparse-as-dense** — ship percentile clip + log/asinh in the same phase as basic rendering; maintain an explicit presence mask so missing pixels render distinctly from zero intensity.
5. **Main-thread OOM/freeze + WASM init** — stream columns into one accumulator buffer, free Arrow vectors, cache only the current spectrum; move compute into a Web Worker; await WASM init explicitly and code-split the wasm/arrow chunk.

## Implications for Roadmap

The architecture's dependency-ordered build sequence and the pitfall-to-phase mapping converge on the same shape: **reach a working TIC image early, gate everything on grid reconstruction, validate against the real file before rendering polish.** Suggested phases:

### Phase 1: Scaffold + Reader + Capability Detection
**Rationale:** Everything depends on opening a file; the reader is the single dependency on the unstable format, and the encoding-capability check must exist before any rendering so unsupported files fail loudly rather than producing garbage.
**Delivers:** Vite/React/TS project deploying to GitHub Pages; vendored `mzpeakts` + WASM init gated and code-split; `openFile`/`openUrl`; ZIP central-dir parse; manifest + file/instrument/run/sample metadata panel; staged parse progress; capability detection that refuses Numpress/aux/directory with a named error.
**Addresses:** Load file (local/URL), parse ZIP + manifest + list entities, metadata + spectrum counts, graceful errors.
**Avoids:** Pitfall 3 (unsupported encodings), 5/6 (WASM init sequencing, code-split, range-friendly access), 10 (ZIP-still-needs-parsing + Arrow ownership), 11 (progress + error taxonomy). Design the `CoordSource` *interface* here so the reader returns raw per-spectrum metadata strategies can inspect.

### Phase 2: Imaging Model — Coordinate Extraction + Grid (THE GATE)
**Rationale:** The highest-risk feature and the universal gate for all spatial output. Must be validated against the operator's real `.mzpeak` before any image is trusted.
**Delivers:** `CoordSource` strategy with multiple auto-detecting probes (logs which won); `ImagingGrid` (bbox, w×h, index↔xy maps, presence mask, `isImaging`); grid-diagnostics panel (unique coords vs spectrum count, filled/total ratio, 1-based/min-offset normalization, pixel-size/orientation metadata read not assumed).
**Implements:** Imaging model layer (Architecture component 2).
**Avoids:** Pitfall 1 (coordinate convention), 2 (sparse-as-dense via presence mask), 8 (read pixel-size + orientation metadata). Gate the milestone on "grid verified against operator file."

### Phase 3: TIC Image + Pixel → Spectrum (Core Round-Trip)
**Rationale:** TIC is the simplest spatial output (whole-spectrum sum, no *m/z* window) and validates grid + per-spectrum-sum + rasterize + paint. Adding pixel hit-test → spectrum completes the Core Value round-trip with minimal surface.
**Delivers:** `buildTic` via full-array sum, rasterizer, a baseline colormap, `putImageData` onto canvas; `hitTest` → `reader.getSpectrum` → uPlot spectrum panel with selected-window marker.
**Uses:** Canvas2D, uPlot, `MzPeakReader.getSpectrum`.
**Avoids:** Pitfall 9 (delta/null/zero-run reconstruction + float64 binary search in the spectrum path), 8 (Y-flip/aspect first appears here).

### Phase 4: Ion Image + Intensity Scaling
**Rationale:** The headline deliverable; only adds the *m/z*-window predicate on top of the proven TIC pipeline. Scaling must ship here, not in polish, or every early image looks blank.
**Delivers:** *m/z* + tolerance controls (Da and ppm); `IonImageBuilder.extractXIC`; colormap selection; linear/log + percentile clip; nonzero-pixel count / value-range readout; intensity histogram.
**Addresses:** Ion image (*m/z* ± Da/ppm), colormap + intensity scaling.
**Avoids:** Pitfall 4 (ppm/Da, profile/centroid, sum/max), 7 (dynamic range / blank images).

### Phase 5: Web Worker Offload + Polish
**Rationale:** UI responsiveness on real files is the highest-value scaling move; pure-view polish has no data dependency and comes last.
**Delivers:** Lift reader+grid+builders behind a worker message protocol (transfer rasters); debounce *m/z* controls; viridis/inferno LUTs, legend, flip-Y toggle, µm axes; raw-format inspector deep view; refined error UX. Optional v2 in-worker column cache behind a file-size threshold.
**Avoids:** Pitfall 6 (main-thread recompute freeze), 5 (bounded memory on large files).

### Phase Ordering Rationale
- **Reader and capability detection first** because every feature depends on opening a file and the unstable format demands loud failure before any rendering (Pitfalls 3/10/11).
- **Grid is its own gated phase** because it is both the universal dependency for all spatial output *and* the project's top risk — it must be validated against the real file before anything is built on it (Pitfall 1, architecture's "the gate").
- **TIC before ion image** because TIC is the strictly simpler special case that validates the whole grid→sum→rasterize→paint pipeline; the ion image then only adds the *m/z* predicate.
- **Scaling ships with ion rendering**, not in polish, because linear-only images look blank and destroy trust (Pitfall 7).
- **Worker offload is deferred to last** because v1's `extractXIC` path is correct and works on the main thread at demo scale; the worker is a responsiveness upgrade with a clean seam (same `IonImageBuilder` signature).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Imaging Model):** the central unknown — no spec, no public example; needs the operator's real `.mzpeak` as ground truth. Use `/gsd:plan-phase --research-phase` and treat it as a discovery/validation phase against the real file. Coordinate accessions, 1-based vs 0-based, pixel-size and z-dimension presence are all unconfirmed.
- **Phase 1 (capability detection):** moderate — needs concrete inspection of which `chunk_encoding`/`buffer_format`/CV-term values the real file actually uses to know what to refuse vs accept.

Phases with standard patterns (skip research-phase):
- **Phase 3 (TIC + spectrum):** well-trodden Canvas2D + uPlot; reader API read directly and verified.
- **Phase 4 (ion image + scaling):** `extractXIC` already exists; ppm/Da and percentile/log are standard, just unit-test them.
- **Phase 5 (worker + polish):** standard Web Worker + transferable typed arrays; clean architectural seam already specified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Exact versions verified via npm registry + upstream `mzpeakts` pins; WASM/COOP-COEP answered prescriptively; deploy pattern from official Vite docs. |
| Features | MEDIUM-HIGH | Feature landscape grounded in named MSI tools (METASPACE/MSiReader/Cardinal/SCiLS/SeeMS); mzPeak imaging specifics unconfirmed against a real file. |
| Architecture | HIGH on reader API + data flow (mzpeakts source read directly); MEDIUM-LOW on the imaging coordinate layer | `extractXIC`/`getSpectrum`/`fromBlob`/`fromUrl` confirmed in source; coordinate hypothesis inferred from imzML lineage, not the spec. |
| Pitfalls | HIGH on mzPeak encoding mechanics (verified vs `doc/index.md` + `mzpeakts` README); MEDIUM-LOW on imaging coordinate layer | Encoding/null-marking/zero-run/delta rules verified; coordinate convention is a hypothesis. |

**Overall confidence:** HIGH for stack/architecture/build-order; MEDIUM-LOW specifically for the imaging coordinate convention — the one thing that must be validated against the operator's real file before the roadmap's spatial phases can be trusted.

### Gaps to Address
- **Imaging coordinate convention (the central gap):** no spec, no public example. Handle via the `CoordSource` strategy + grid diagnostics, and **gate Phase 2 on a real operator `.mzpeak`**. Do not build rendering on an unvalidated grid.
- **Which Parquet/encoding paths the real file uses:** determines whether the slim read-only parquet-wasm build (~456 KB brotli) is viable and what the capability check must refuse. Resolve by inspecting the real file in Phase 1.
- **Profile vs centroid + non-square pixels + Y orientation:** read from metadata, never assume; validate ion-image geometry against the operator's expected reference image.
- **File scale (spectrum count / size):** decides when the worker (Phase 5) and v2 column cache become mandatory vs optional. Confirm against the real file before committing perf-engineering effort.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) — exact versions of vite/react/typescript/uplot/parquet-wasm/apache-arrow/arrow-js-ffi/zip.js/vitest/playwright/eslint/plugins. (STACK.md)
- GitHub `HUPO-PSI/mzpeakts` source read directly — `MzPeakReader` API (`fromBlob`/`fromUrl`, `getSpectrum`, `extractXIC`, `numSpectra`, `DataArraysReader`), vendored parquet-wasm 0.7.1, point/chunked/delta support, Numpress/aux/directory **not** implemented. (STACK.md, ARCHITECTURE.md, PITFALLS.md)
- HUPO-PSI/mzPeak `doc/index.md` — ZIP container, manifest, point vs chunked layout, delta/null-marking/zero-run rules, float64 m/z, CV terms; **no imaging/spatial section** (confirmed absent). (PITFALLS.md, ARCHITECTURE.md)
- parquet-wasm 0.7.1 tarball measured (~6.5 MB wasm) + README (single-threaded ESM, no isolation needed) + vite.dev static-deploy docs. (STACK.md)

### Secondary (MEDIUM confidence)
- MSI viewer feature sets — METASPACE, MSiReader, SCiLS Lab, Cardinal, SeeMS (peer-reviewed papers + product docs). (FEATURES.md)
- MSI scaling/sparse-handling conventions (Cardinal, METASPACE) — percentile/log defaults, presence masks. (PITFALLS.md)

### Tertiary (LOW confidence — needs validation)
- imzML coordinate convention (Schramm et al. 2012; PSI IMS `IMS:1000050/51/52`, pixel-size cvParams) — used as the imaging *hypothesis* only; **not confirmed for mzPeak**, must be validated against the operator's real `.mzpeak`. (PROJECT.md, ARCHITECTURE.md, PITFALLS.md)

---
*Research completed: 2026-06-03*
*Ready for roadmap: yes*
