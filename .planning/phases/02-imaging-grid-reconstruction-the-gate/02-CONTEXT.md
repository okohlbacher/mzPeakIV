# Phase 2: Imaging Grid Reconstruction (THE GATE) — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the **spatial pixel-grid reconstruction layer**: extracting per-spectrum x/y coordinates from the mzpeakts reader, building a typed `ImagingGrid` object (geometry, presence mask, coordinate↔spectrum-index lookup), surfacing an inline diagnostics panel in the UI, and correctly reporting non-imaging (LC-MS) files as a distinct, non-error state. No image rendering — that is Phase 3.

**In scope:**
- `src/imaging/` module: `CoordSource` chain, `ImagingGrid` type, grid builder, `not-imaging` report
- New `src/reader/scanCoords.ts` extending the reader boundary with per-spectrum coordinate extraction
- Eager grid build added as a new `LoadStage` step after metadata (store update)
- Inline expandable grid-diagnostics section in the left panel (below Capabilities)
- Synthetic fixture utilities for Vitest; a PXD001283 unlock test gated on file presence
- PROC-01 Codex round1/round2 per-phase reviews

**Out of scope (later phases):**
- Image rendering of any kind — Phase 3 (TIC) and Phase 4 (ion image)
- Per-pixel click → spectrum interaction — Phase 3
- Signal-file routing (spectra_data vs spectra_peaks) for rendering — Phase 3 wires it; Phase 2 only exposes the representation field for later use
- Web Worker offload — Phase 5
</domain>

<decisions>
## Implementation Decisions

### Test fixtures
- **D-01:** PXD001283 is NOT yet available. Phase 2 builds and tests against **in-memory synthetic Arrow tables** (Vitest; known grids e.g. 5×4 dense, 5×4 sparse, non-imaging file). Add a PXD001283 unlock test (`test.skipIf(!existsSync('test/data/PXD001283.mzpeak'))`) so it activates automatically when the operator drops the file in `test/data/`.
- **D-02:** The small.mzpeak fixture from Phase 1 covers the "not imaging" path (no coordinate columns → "not imaging data" report).

### Grid diagnostics UI placement
- **D-03:** **Inline expandable section** in the existing left panel, below the Capabilities panel. Always-visible compact line: `Grid: 260×134, 34840/34840 px filled` (or a warning icon if anomalies). One click expands to show: full dimensions, fill ratio, missing/duplicate pixel counts, any discovery-block vs column disagreement. Reuses the existing collapsible-section pattern established by the Capabilities panel.
- **D-04:** For non-imaging files: the grid section shows a single "Not imaging data — no spatial coordinates found" notice (distinct from an error). No grid dimensions, no diagnostics.

### Grid build timing
- **D-05:** **Eager — during file load**, added as a new `LoadStage` step: `zip-index → manifest → metadata → grid → ready`. For PXD001283 scale (34,840 scan rows), this is a single Arrow column read — fast. Diagnostics are immediately available after load. Store gains `grid: ImagingGrid | null`.
- **D-06:** For non-imaging files, the grid step runs (to probe for coordinate columns), determines `isImaging=false`, sets `grid: null`, and continues. No extra latency.

### Reader extension approach
- **D-07:** Add `src/reader/scanCoords.ts` — a new file in the existing `src/reader/` boundary (same pattern as `arrays.ts`, `stats.ts`). It reads the Arrow `scan` facet of `spectrumMetadata` directly and extracts the `IMS_1000050_position_x` / `IMS_1000051_position_y` columns by name (keyed on accession). Returns `{ x: Int32Array|BigInt64Array, y: Int32Array|BigInt64Array } | null`. This keeps the single mzpeakts import boundary and avoids touching `src/imaging/` from inside `src/reader/`.
- **D-08:** The `src/imaging/` layer receives a plain `{x: number, y: number}[]` array (bigint converted to number) — no Arrow types leak above `src/reader/`.

### Imaging spec binding (from IMAGING-SPEC-ALIGNMENT.md — LOCKED, do not deviate)
- **D-09 (C1):** Columns `IMS_1000050_position_x` / `IMS_1000051_position_y` are the authoritative coordinate source. `metadata.imaging` is a discovery hint only and MUST agree when present.
- **D-10 (C3):** Internal grid index = coord − 1 (1-based→0-based). Preserve original 1-based coords for hover readout.
- **D-11 (C4):** Grid extent from `IMS:1000042` (max pixel x count) × `IMS:1000043` (max pixel y count) from `ms_run.parameters`, cross-checked against `metadata.imaging.pixel_count`. Fallback to max observed coordinate. Declared extent WINS over max coordinate.
- **D-12 (C5):** Pixel aspect from `IMS:1000046` / `IMS:1000047` µm. Absent → 1:1, noted in diagnostics.
- **D-13 (C7):** Imaging detection: non-null `IMS_1000050/51` columns present → imaging. `metadata.imaging.is_imaging` is a corroborating hint. Absent/null columns → non-imaging, NOT an error.
- **D-14 (C8):** Presence mask is separate from intensity. Pixel→spectrum-index lookup is a `Map<coordKey, spectrumIndex>`, not a dense array. `filled/total` ratio in diagnostics.
- **D-15:** Accept both `Int64` and `UInt32` for coordinate column types (spec open question — don't hard-assume one Arrow type).

### CoordSource fallback chain
- **D-16:** Primary strategy: promoted scan columns (`IMS_1000050/51`). Fallback 1: `scan.parameters` cvParams (`IMS:1000050/51` accessions). Fallback 2: parse from spectrum `id` string (last resort). Log which strategy won; surface in grid diagnostics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Imaging spec (primary authority for this phase)
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` — binding constraints C1–C9; layer mapping; required changes per artifact. This is the **single most important doc for Phase 2**.
- `.planning/research/imaging-spec/imaging-mzpeak-spec-draft-v0.3.md` — the full spec draft (grid geometry, coordinate columns, pixel-size CVs, metadata.imaging block)

### Phase 1 output (what to build on top of)
- `.planning/phases/01-reader-foundation-open-and-inspect/01-01-SUMMARY.md` — reader boundary contract, types.ts shapes
- `.planning/phases/01-reader-foundation-open-and-inspect/01-02-SUMMARY.md` — stats/capabilities panels, store shape, LoadStage
- `.planning/phases/01-reader-foundation-open-and-inspect/01-03-SUMMARY.md` — error taxonomy, capability.ts pattern
- `src/reader/types.ts` — current type contracts (extend, don't break)
- `src/state/store.ts` — store shape to extend with `grid: ImagingGrid | null`

### Architecture and pitfalls
- `.planning/research/ARCHITECTURE.md` — 4-layer pipeline, reader reality, `extractXIC` (used in P4)
- `.planning/research/PITFALLS.md` — Pitfall 1 (coord convention), Pitfall 2 (sparse vs dense), Pitfall 5 (memory)

### Requirements
- `.planning/REQUIREMENTS.md` — IMG-01, IMG-02, IMG-03 (the three Phase 2 requirements)

### mzpeakts reader internals
- `vendor/mzpeakts/lib/src/metadata.ts` — where `spectrumMetadata` Arrow table lives; how scan facet columns are exposed
- `vendor/mzpeakts/lib/src/reader.ts` — `fromUrl`, `fromBlob`, metadata access API

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/reader/types.ts` — `Capabilities.isImaging` bool already set by Phase 1; Phase 2 consumes it to decide whether to build the grid. `UnsupportedFinding`, `SpectrumRepresentation` types in place.
- `src/reader/stats.ts` — `computeCapabilities()` pattern: read Arrow metadata, return plain POJO. `scanCoords.ts` follows the same pattern.
- `src/state/store.ts` — `LoadStage` union already has stages; add `'grid'` between `'metadata'` and `'ready'`. Store already has `capabilities: Capabilities | null` — add `grid: ImagingGrid | null`.
- `src/ui/CapabilitiesPanel.tsx` — collapsible panel pattern; `GridDiagnosticsPanel.tsx` should follow the same pattern.
- `src/reader/errors.ts` — `ReaderErrorClass` union; do NOT add a new class for non-imaging files — it's NOT an error, it's a valid `grid: null` + specific UI state.

### Established Patterns
- **Single reader import boundary:** `src/reader/` is the only folder that imports `mzpeakts`. `src/imaging/` receives plain `{x: number, y: number}[]` — no Arrow types.
- **Plain POJO cross-boundary types:** Nothing above `src/reader/` touches `bigint`, Arrow types, or mzpeakts internals (established in Phase 1; Codex enforces this).
- **Store-centric staged load:** Each new stage (`'grid'`) must update `stage` at entry AND exit (or to `'error'` on failure). Follow the `yieldFrame()` pattern so progress transitions are visible.
- **Test fixtures in `test/data/`:** binary `.mzpeak` fixtures live here. Synthetic Arrow fixtures for grid tests live inline in Vitest test files (no binary file needed for unit tests).

### Integration Points
- `store.ts` `openUrl`/`openFile`: after `metadata` stage, call `buildImagingGrid(reader, manifest)` → set `stage: 'grid'` → set `grid` → set `stage: 'ready'`.
- `src/ui/App.tsx`: pass `grid` from store to `GridDiagnosticsPanel` and later to the imaging area. If `grid === null` and `capabilities.isImaging === false` → show "Not imaging data" notice.

</code_context>

<specifics>
## Specific Ideas

- The `ImagingGrid` type (in `src/imaging/types.ts` or `src/reader/types.ts`): `{ width: number; height: number; pixelSizeUm: { x: number; y: number } | null; coordinateBase: 1; coordToSpectrumIndex: Map<number, number>; presenceMask: Uint8Array; filledCount: number; totalCells: number; coordSourceStrategy: string; diagnostics: GridDiagnostics }` where `GridDiagnostics` captures missing/duplicate counts and any discovery-vs-authoritative discrepancies.
- Use `coordKey = x * (MAX_COORD + 1) + y` as the Map key (small integers, no collision for realistic grid sizes). Or `${x},${y}` string key if clarity matters more than perf.
- The PXD001283 unlock test pattern: `import { existsSync } from 'node:fs'; const hasPXD = existsSync('test/data/PXD001283.mzpeak'); test.skipIf(!hasPXD)('validates 260×134 grid against PXD001283', async () => { ... })`.
- Grid diagnostics compact line: `Grid: {width}×{height} — {filledCount}/{totalCells} pixels ({pct}% filled)`. Warning icon if `filledCount < totalCells * 0.95` or if duplicates > 0.
</specifics>

<deferred>
## Deferred Ideas

- **Cosmetic orientation flip control** — a view-only "flip vertical/horizontal" toggle for the grid panel for user convenience. NOT a correctness mechanism (C2 forbids that). Deferred to Phase 3 or 4.
- **PXD001283 conversion** — the operator converting the imzML dataset to `.mzpeak` is a prerequisite for the unlock test. Deferred until the file exists.

</deferred>

---

*Phase: 2-imaging-grid-reconstruction-the-gate*
*Context gathered: 2026-06-03*
