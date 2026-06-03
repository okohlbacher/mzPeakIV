# Phase 3: TIC Image + Pixel→Spectrum Round-Trip — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the **Core Value round-trip**: a TIC (total-ion-current) heatmap rendered on a Canvas 2D element immediately after the imaging grid is built, pixel-click → spectrum lookup → uPlot display using the correct signal file, and correct signal-file routing (DATA-03) for both image builds and per-pixel spectrum views.

**In scope:**
- `src/compute/tic.ts` — new compute layer: `buildTic(xicPoints, grid) → Float32Array[width*height]`
- New LoadStage `'tic'` after `'grid'`: `zip-index → manifest → metadata → grid → tic → ready`
- Canvas 2D image rasterizer: paint TIC values using a colormap with `ImageData`/`putImageData`; missing pixels (presence mask = 0) rendered distinctly from zero-intensity
- Pixel-click hit-test on Canvas → `coordToSpectrumIndex` lookup → `selectSpectrum(index)` — wires to existing SpectrumPanel in-place
- Hover readout: label below canvas showing `x: N, y: N, TIC: N` (disappears on mouse leave)
- Selected-pixel marker: 1px contrast ring drawn on canvas, redrawn on selection change
- DATA-03 explicit signal-file routing for per-pixel spectrum reads (explicit `SpectrumMeta.representation` check)
- DATA-03 `useProfile` flag for `extractXIC`: derived from file's uniform representation (from `representationCounts`); surface a warning if mixed profile/centroid is detected
- PROC-01 Codex round1 (plan) + round2 (diff)

**Out of scope (later phases):**
- Ion image for a specific m/z window — Phase 4
- Colormap selection, intensity scaling (linear/log, percentile clipping) — Phase 4
- Selected m/z window marker on spectrum — Phase 4 (SPEC-02 UI wired there)
- Web Worker offload for TIC compute — Phase 5
- Layout or visual polish beyond functional plumbing — Phase 5

</domain>

<decisions>
## Implementation Decisions

### TIC computation pipeline
- **D-01:** TIC is computed via `extractXIC(null, null, useProfile)` — a single async call that returns one `XICPoint` per spectrum with its intensity arrays. Sum each point's intensity array in `src/compute/tic.ts` to produce a `Float32Array[width*height]`. This reuses the exact Phase 4 ion-image primitive (Phase 4 will call `extractXIC` with a narrow m/z window), making TIC a warm-up for that pipeline.
- **D-02:** TIC computation runs as a new **LoadStage `'tic'`** inserted after `'grid'` and before `'ready'`: `zip-index → manifest → metadata → grid → tic → ready`. This is consistent with Phase 2's eager `'grid'` stage. The image renders immediately when the layout appears, no spinner needed after load. `store.ts` gains `tic: Float32Array | null` alongside `grid: ImagingGrid | null`.
- **D-03:** TIC compute lives in `src/compute/tic.ts` — a new `src/compute/` layer sitting above both `src/reader/` and `src/imaging/`. It receives `XIC` points (from the reader boundary) + `ImagingGrid` and returns a plain `Float32Array` — no Arrow types leak out. Phase 4's ion-image builder will land in this same `src/compute/` layer.

### Pixel interaction
- **D-04:** Click on Canvas → hit-test canvas pixel coordinate → convert to 0-based grid `(x0, y0)` → lookup `grid.coordToSpectrumIndex.get(y0 * grid.width + x0)` → call `selectSpectrum(spectrumIndex)`. The existing `SpectrumPanel` updates in-place (same store action as the index selector). The numeric index input in SpectrumPanel stays as secondary UX (still useful for non-imaging files and for debugging).
- **D-05:** Hover readout: a single text label **below the canvas** showing `x: N, y: N, TIC: N.Ne6` (1-based coords, as spec requires for user-facing coordinates). The label disappears when the mouse leaves the canvas. Implemented as a `useState`-tracked string updated on `mousemove`.
- **D-06:** Selected pixel: **1px contrast ring** drawn directly on the canvas (not CSS overlay) around the selected pixel. Drawn in a color that contrasts the colormap (e.g., white or black border based on background). The canvas redraws on `selectedIndex` change — rasterize the TIC ImageData, then draw the ring on top in a second pass.

### Signal-file routing (DATA-03)
- **D-07:** For **per-pixel spectrum reads** (`getSpectrumArrays`): before calling `reader.getSpectrum(index)`, look up `SpectrumMeta.representation` for that spectrum index. Pass the representation explicitly so the call routes to `spectrumData()` (profile, `MS:1000128`) or `spectrumPeaks()` (centroid, `MS:1000127`). This makes routing visible, explicit, and testable — never the implicit fallback order.
- **D-08:** For **TIC via `extractXIC`**: derive `useProfile` from the file's uniform representation. Read `stats.representationCounts` (already in store from Phase 1). If `profile > 0 && centroid === 0` → `useProfile=true`. If `centroid > 0 && profile === 0` → `useProfile=false`. If both > 0 (mixed file): pick the majority, but surface a named warning in the diagnostics panel (unusual for imaging; the user should know). Per-spectrum routing for `extractXIC` is not feasible (one call covers all spectra).

### Sparse pixel rendering
- **D-09:** Pixels with `presenceMask[y0 * width + x0] === 0` (absent, no spectrum acquired) render as a **distinct background color** (e.g., near-black `#1a1a1a` or a configurable sentinel) — not as zero-intensity (which maps to the bottom of the colormap). Zero-intensity pixels ARE real signal; absent pixels are missing acquisitions. The distinction must be preserved in the rasterizer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Imaging spec (primary authority for orientation and signal routing)
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` — binding constraints C1–C9; especially C2 (fixed orientation, no flip), C5 (pixel aspect), C6 (signal-file routing), C8 (sparse presence mask). **Most important doc for Phase 3.**
- `.planning/research/imaging-spec/imaging-mzpeak-spec-draft-v0.3.md` — full spec draft

### Phase 2 output (what Phase 3 builds on top of)
- `.planning/phases/02-imaging-grid-reconstruction-the-gate/02-CONTEXT.md` — D-01 through D-16; especially D-14 (`coordToSpectrumIndex` Map key), D-09 (authoritative coordinate columns), D-03 (GridDiagnosticsPanel collapsible pattern)
- `src/imaging/types.ts` — `ImagingGrid` shape: `width`, `height`, `coordToSpectrumIndex`, `presenceMask`, `pixelSizeUm`, `coordinateBase` — Phase 3 consumes all of these
- `src/state/store.ts` — current store shape (add `tic: Float32Array | null`, new `'tic'` LoadStage)
- `src/reader/types.ts` — `SpectrumMeta.representation: SpectrumRepresentation` (critical for D-07), `FileStats.representationCounts` (critical for D-08)

### Reader and compute
- `vendor/mzpeakts/lib/src/reader.ts` — `extractXIC(timeRange, mzRange, useProfile)` signature; `XICPoint.dataArrays` shape; `spectrumData()` vs `spectrumPeaks()` methods — Phase 3 calls `extractXIC(null, null, useProfile)` for TIC
- `src/reader/arrays.ts` — current `getSpectrumArrays(reader, index)` — Phase 3 must extend for explicit representation routing (D-07)

### Layout baseline
- `src/ui/App.tsx` — current two-pane layout; Phase 3 adds a TIC canvas component alongside or within the right pane
- `src/ui/SpectrumPanel.tsx` — existing spectrum panel; Phase 3 wires pixel-click → `selectSpectrum()` here; keeps the numeric index input as secondary UX

### Requirements
- `.planning/REQUIREMENTS.md` — IMAGE-01, IMAGE-04, SPEC-01, DATA-03 (Phase 3 requirements)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/state/store.ts` — `selectSpectrum(index)` already exists and updates `selectedIndex + selectedSpectrum`; pixel-click reuses it unchanged. `runLoad()` pattern for staged load; add `'tic'` stage after `'grid'` following the existing `yieldFrame()` pattern.
- `src/ui/SpectrumPanel.tsx` — existing uPlot chart + `selectedIndex` display. Phase 3 wires pixel-click to it; no uPlot duplication needed. Extend the heading to say "Pixel (x, y)" when a pixel is selected in imaging mode.
- `src/imaging/types.ts` — `ImagingGrid.coordToSpectrumIndex: Map<number, number>` key = `y0 * width + x0` (row-major, 0-based); `ImagingGrid.presenceMask: Uint8Array` — both ready for Phase 3's hit-test and rasterizer.
- `src/reader/stats.ts` — `FileStats.representationCounts` already computed (Phase 1); read from store to derive `useProfile` for `extractXIC` call.
- `src/ui/CapabilitiesPanel.tsx` and `src/ui/GridDiagnosticsPanel.tsx` — collapsible panel pattern; any "mixed representation" warning can follow this same collapsible pattern.

### Established Patterns
- **Single reader import boundary:** `src/reader/` is the only folder importing mzpeakts. `src/compute/` receives XIC points as plain objects — no Arrow or mzpeakts types leak upward (same rule as `src/imaging/`).
- **Store-centric staged load:** Every new stage must call `set({ stage: 'tic' })` at entry, then `set({ tic: ... stage: 'ready' })` on success, or `set({ stage: 'error', error: ... })` on failure. Use `yieldFrame()` for visible progress transitions.
- **Canvas 2D / ImageData pattern:** `new ImageData(width, height)` → fill `data` (RGBA Uint8ClampedArray) → `ctx.putImageData(imageData, 0, 0)` → ring drawn with `ctx.strokeRect`. No WebGL.
- **uPlot imperative mount:** `useRef` + `new uPlot(opts, data, el)` in `useEffect([], [])` — already established in SpectrumPanel. No React wrapper lib.
- **Plain POJO cross-boundary types:** `XICPoint.dataArrays` (from reader boundary) → sum to `Float32Array` in `src/compute/tic.ts` → store. Nothing above `src/reader/` touches Arrow or bigint.

### Integration Points
- `store.ts` `runLoad()`: after `'grid'` stage, add `'tic'` stage — call `extractXIC(null, null, useProfile)` via the reader, pass XIC + grid to `buildTic()`, set `tic: Float32Array`.
- `src/ui/App.tsx`: in the `stage === "ready"` block, when `grid !== null`, render the new `ImagingPanel` (TIC canvas + pixel interaction) alongside `SpectrumPanel`. When `grid === null` (non-imaging file), keep the current right-side SpectrumPanel unchanged.
- `src/reader/arrays.ts` `getSpectrumArrays()`: extend signature or add a new `getSpectrumArraysForPixel(reader, index, representation)` overload that explicitly routes to `spectrumData()` vs `spectrumPeaks()` per D-07.

</code_context>

<specifics>
## Specific Ideas

- `buildTic(xic: XIC, grid: ImagingGrid): Float32Array` — iterate `xic.points`; for each point, get `spectrumIndex = Number(point.index)`; look up `coordKey` via the reverse map (or maintain a `spectrumIndex → coordKey` parallel array built in Phase 2); sum `point.dataArrays[INTENSITY_KEY]` into `tic[coordKey]`. Absent pixels stay at 0 (but rendered distinctly via the presence mask in the rasterizer — D-09).
- Canvas rasterizer: colormap = simple linear gray or viridis-like (no colormap *selector* until Phase 4); clip to 99th percentile to avoid washed-out images (one-time percentile compute from the TIC array). Phase 4 adds configurable colormaps and scaling UI on top of this base.
- Hit-test math: `x0 = Math.floor(canvasX / (canvasWidth / grid.width))`, `y0 = Math.floor(canvasY / (canvasHeight / grid.height))`. Check `grid.presenceMask[y0 * grid.width + x0] !== 0` before calling `selectSpectrum`; hovering a missing pixel shows `(x, y) — no data` in the label.
- The `coordToSpectrumIndex` Map was built by `buildImagingGrid` with key `y0*width + x0` (0-based, per D-14 in 02-CONTEXT). Phase 3 must use the same key formula — do not recompute it.

</specifics>

<deferred>
## Deferred Ideas

- **Colormap selector + intensity scaling (linear/log, percentile clipping)** — Phase 4 (IMAGE-03). Phase 3 uses a single fixed colormap with a simple percentile clip.
- **SPEC-02 m/z window marker on spectrum** — Phase 4. Phase 3's SpectrumPanel has no m/z selection state yet; the marker UI lands when Phase 4 adds the m/z input.
- **Web Worker offload for TIC compute** — Phase 5. For PXD001283 scale (34,840 spectra), the main-thread pass may take 1-5 s; profile first, worker second.
- **Mean/sum/max aggregation toggle for TIC** — v2 (deferred in REQUIREMENTS.md).
- **Cosmetic orientation flip toggle** — deferred from Phase 2 CONTEXT. NOT a correctness mechanism (C2 forbids it). Phase 3 or later.

</deferred>

---

*Phase: 3-tic-image-pixel-spectrum-round-trip*
*Context gathered: 2026-06-03*
