# Phase 2: Imaging Grid Reconstruction (THE GATE) — Research

**Researched:** 2026-06-03
**Domain:** mzPeak imaging coordinate extraction + spatial grid reconstruction (Apache Arrow column reads, sparse-grid modeling, in-app diagnostics)
**Confidence:** HIGH (every claim verified against vendored reader source, existing Phase-1 code, and the pinned imaging-spec v0.3)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test fixtures**
- **D-01:** PXD001283 is NOT yet available. Build/test against **in-memory synthetic Arrow tables** (Vitest; known grids 5×4 dense, 5×4 sparse, non-imaging). Add a PXD001283 unlock test (`test.skipIf(!existsSync('test/data/PXD001283.mzpeak'))`) that auto-activates when the operator drops the file in `test/data/`.
- **D-02:** `small.mzpeak` (Phase 1) covers the "not imaging" path (no coordinate columns → "not imaging data" report).

**Grid diagnostics UI placement**
- **D-03:** **Inline expandable section** in the left panel, below CapabilitiesPanel. Compact line `Grid: 260×134, 34840/34840 px filled` (or warning icon); one click expands to full dimensions, fill ratio, missing/duplicate counts, discovery-vs-column disagreement. Reuse the CapabilitiesPanel collapsible pattern.
- **D-04:** Non-imaging files: single "Not imaging data — no spatial coordinates found" notice (distinct from an error). No grid dimensions, no diagnostics.

**Grid build timing**
- **D-05:** **Eager — during file load**, new `LoadStage` step: `zip-index → manifest → metadata → grid → ready`. Store gains `grid: ImagingGrid | null`.
- **D-06:** Non-imaging files: grid step still runs (probes for coordinate columns), determines `isImaging=false`, sets `grid: null`, continues. No extra latency.

**Reader extension approach**
- **D-07:** Add `src/reader/scanCoords.ts` (same pattern as `arrays.ts`, `stats.ts`). Reads the Arrow `scan` facet of `spectrumMetadata`, extracts `IMS_1000050_position_x` / `IMS_1000051_position_y` by name (keyed on accession). Returns `{ x: Int32Array|BigInt64Array, y: Int32Array|BigInt64Array } | null`. Keeps the single mzpeakts import boundary; does not touch `src/imaging/` from inside `src/reader/`.
- **D-08:** `src/imaging/` receives a plain `{x: number, y: number}[]` array (bigint→number) — no Arrow types leak above `src/reader/`.

**Imaging spec binding (from IMAGING-SPEC-ALIGNMENT.md — LOCKED)**
- **D-09 (C1):** `IMS_1000050_position_x` / `IMS_1000051_position_y` are authoritative. `metadata.imaging` is a discovery hint only and MUST agree when present.
- **D-10 (C3):** Internal grid index = coord − 1 (1-based→0-based). Preserve original 1-based coords for hover readout.
- **D-11 (C4):** Grid extent from `IMS:1000042` × `IMS:1000043` (from `ms_run.parameters`), cross-checked against `metadata.imaging.pixel_count`. Fallback to max observed coordinate. **Declared extent WINS** over max coordinate.
- **D-12 (C5):** Pixel aspect from `IMS:1000046` / `IMS:1000047` µm. Absent → 1:1, noted in diagnostics.
- **D-13 (C7):** Imaging detection: non-null `IMS_1000050/51` columns present → imaging. `metadata.imaging.is_imaging` corroborates. Absent/null → non-imaging, NOT an error.
- **D-14 (C8):** Presence mask separate from intensity. Pixel→spectrum-index lookup is a `Map<coordKey, spectrumIndex>`, not a dense array. `filled/total` ratio in diagnostics.
- **D-15:** Accept both `Int64` AND `UInt32` coordinate column types (spec open question — don't hard-assume one Arrow type).

**CoordSource fallback chain**
- **D-16:** Primary: promoted scan columns (`IMS_1000050/51`). Fallback 1: `scan.parameters` cvParams (`IMS:1000050/51`). Fallback 2: parse from spectrum `id` string (last resort). Log which strategy won; surface in grid diagnostics.

### Claude's Discretion
- `ImagingGrid` exact field shape (the CONTEXT "Specific Ideas" gives a strong starting shape — see Standard Stack below).
- `coordKey` encoding (`x * (MAX+1) + y` integer key vs `"x,y"` string key).
- Synthetic Arrow fixture mechanism (build real `apache-arrow` tables vs Reader-shaped POJO mocks — see Pitfall 4 / Code Examples for the recommendation).
- Diagnostics warning thresholds (CONTEXT suggests `filled < 0.95*total` or `duplicates > 0`).

### Deferred Ideas (OUT OF SCOPE)
- **Cosmetic orientation flip control** (view-only flip toggle) — NOT a correctness mechanism (C2 forbids that). Deferred to Phase 3/4.
- **PXD001283 conversion** — operator prerequisite for the unlock test. Deferred until the file exists.
- Image rendering of any kind (Phase 3/4); per-pixel click→spectrum (Phase 3); signal-file routing wiring (Phase 3); Web Worker offload (Phase 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMG-01 | Reconstruct the pixel grid by extracting per-spectrum x/y from promoted `scan` columns `IMS_1000050_position_x`/`51` (Int64, 1-based, authoritative), keyed on accession via a swappable CoordSource chain (columns primary; cvParams + id-parse fallbacks). | `scanCoords.ts` reads `reader.spectrumMetadata.scans` Arrow struct via `.getChild(colName)` (bulk) OR per-record `scan.meta[colName]` / `scan.getParamByAccession()` (already proven in `stats.ts probeIsImaging`). CoordSource chain = three strategies behind one interface (Pattern 1). |
| IMG-02 | Compute grid geometry: extent from declared `IMS:1000042/43` (fallback coord-max), presence mask (sparse/dense), coord→spectrum-index lookup, 1-based→0-based normalization (read `coordinate_base`), pixel aspect from `IMS:1000046/47`. | **GAP:** `ms_run.parameters` is dropped by the vendored reader — see Pitfall 1. Geometry sources priority: `metadata.imaging` discovery block (accessible) → raw run JSON params (needs new reader read) → derived max-coord. Presence mask + Map lookup = Pattern 2. |
| IMG-03 | Surface grid diagnostics: detected dims, pixel count vs spectrum count, missing/duplicate pixels. | `GridDiagnostics` computed in the grid builder; rendered by inline expandable `GridDiagnosticsPanel` (D-03), mirroring `CapabilitiesPanel`. |
</phase_requirements>

## Summary

Phase 2 builds the spatial grid layer on top of a Phase-1 reader boundary that is already most of the way there. The single most important finding: **the imaging coordinate read is already prototyped** — `src/reader/stats.ts::probeIsImaging()` reads `IMS_1000050_position_x` / `IMS_1000051_position_y` from each spectrum's `scan.meta` bag and falls back to `scan.getParamByAccession("IMS:1000050")`. Phase 2's `scanCoords.ts` is a productionized, bulk-read version of that probe that returns *all* coordinates instead of a boolean. The CoordSource strategy chain (D-16) maps cleanly onto the three access paths the reader already exposes.

The one real architectural gap is geometry source #2. The imaging spec puts grid extent (`IMS:1000042/43`) and pixel size (`IMS:1000046/47`) in `ms_run.parameters`, **but the vendored `MSRun.fromJSON` discards the `parameters` field entirely** (verified: `vendor/mzpeakts/lib/src/metadata.ts:282-291`). So `reader.fileMetadata.run` will not carry these CVs. The grid builder must therefore source geometry from (1) the `metadata.imaging` discovery block — which IS accessible via `reader.store.fileIndex.metadata.imaging` and is already read by `probeIsImaging` — then (2) the raw `run` keyValueMetadata JSON (a new small read inside `src/reader/`), then (3) derived max-coordinate. This matches the C4 priority order with the discovery block promoted to first because it is the only run-level source the reader actually surfaces today.

Everything else is pure TypeScript over data the reader already hands up: a `Map<coordKey, spectrumIndex>` presence model (never a dense array — Pitfall 2), 1-based→0-based normalization read from `coordinate_base` (never assumed — Pitfall 1), declared-extent-wins geometry, and a diagnostics object that surfaces fill ratio, duplicates, and discovery-vs-column disagreement. The synthetic-fixture story is solved: Phase 1's `stats.test.ts` already mocks the reader as Reader-shaped POJOs (no binary `.mzpeak`, no real Arrow table needed) — Phase 2 extends that exact pattern for known 5×4 grids.

**Primary recommendation:** Build `scanCoords.ts` as a bulk Arrow-column reader (one `getChild()` per axis, not 34,840 `get(i)` calls), wrap the three coordinate access paths in a `CoordSource` strategy chain, model the grid sparsely with a `Map` + presence `Uint8Array`, source geometry from `metadata.imaging` first (the only run-level data the reader exposes) with declared-extent-wins and explicit max-coord fallback, and test against Reader-shaped POJO mocks following the established `stats.test.ts` pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-spectrum coordinate extraction | Reader (`src/reader/scanCoords.ts`) | — | Only `src/reader/` may touch Arrow / mzpeakts / bigint (Phase-1 boundary, Codex-enforced). |
| CoordSource strategy chain | Reader (`scanCoords.ts`) | — | Strategies read Arrow column → cvParam → id-string; all are reader-internal. Returns plain `{x,y}[]` upward. |
| Grid geometry + presence model | Imaging (`src/imaging/grid.ts`) | — | Pure TS over plain `{x,y}[]` + plain geometry POJO. No Arrow knowledge. |
| Grid geometry source (run-level CVs) | Reader (`scanCoords.ts` or new `runParams.ts`) | — | Reading `metadata.imaging` / raw run JSON crosses the format boundary → must live in `src/reader/`. |
| Diagnostics computation | Imaging (`src/imaging/grid.ts` / `diagnostics.ts`) | — | Pure arithmetic over the built grid. |
| Eager grid build orchestration | Store (`src/state/store.ts`) | — | New `'grid'` LoadStage between metadata and ready; calls reader + imaging builders. |
| Grid diagnostics display | UI (`src/ui/GridDiagnosticsPanel.tsx`) | — | Presentational; consumes `grid` from store. Mirrors CapabilitiesPanel. |
| Codex PROC-01 gate | Process (`tools/codex_review.sh`) | — | round1 plan + round2 diff; mandatory per CLAUDE.md. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| apache-arrow | 21.1.0 (already installed) | Column-level read of the `scan` struct (`.getChild("IMS_1000050_position_x")`) inside `scanCoords.ts` | `[VERIFIED: node -e require('apache-arrow/package.json').version → 21.1.0]`. Pinned to match parquet-wasm/arrow-js-ffi memory layout (CLAUDE.md). Only `src/reader/` imports it. |
| mzpeakts (vendored) | local `file:vendor/mzpeakts/lib` | `reader.spectrumMetadata.scans` (Arrow struct), `reader.store.fileIndex.metadata` (discovery block) | Single import boundary already established in Phase 1. |
| (no new packages) | — | — | Phase 2 is pure TS over Phase-1 primitives. **No new dependencies.** |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| vitest | 4.1.8 (installed) | Unit tests for `scanCoords.ts`, `grid.ts`, diagnostics; synthetic-grid fixtures | All Phase-2 unit tests. Reader-shaped POJO mocks (no WASM needed for grid math). |
| @playwright/test | 1.60.0 (installed) | Optional e2e: load a fixture, expand GridDiagnosticsPanel, assert compact line | If an imaging `.mzpeak` fixture exists; otherwise unit tests cover the gate. |
| `apache-arrow/util/bigint` `bigIntToNumber` | from arrow 21 | Safe Int64→number conversion | Coordinate values are small (≤~10k); see Pitfall 3 for why plain `Number()` is also safe here. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bulk `.getChild(col)` column read | Per-record `sm.get(i)` loop (as `stats.ts` does) | `get(i)` does a binary search + full `.toJSON()` + `Param.fromArrow` per row — O(n log n) with heavy allocation. For 34,840 rows the bulk column path is dramatically faster and is the recommended primary. Keep `get(i)`-style access only for the cvParam fallback strategy. |
| `Map<number, number>` integer coordKey | `Map<string, number>` `"x,y"` key | Integer key (`x * (maxY+1) + y`) is faster + lower memory; string key is clearer. CONTEXT D allows either. Recommend integer key with a documented derivation. |
| Real synthetic Arrow tables | Reader-shaped POJO mocks | POJO mocks (Phase-1 `stats.test.ts` pattern) are simpler, need no WASM, and exercise the same code paths. Recommend POJO mocks for grid-math tests; reserve real-Arrow construction only if a test must exercise `getChild()` typing directly. |

**Installation:**
```bash
# None. Phase 2 adds no dependencies.
```

**Version verification:** `apache-arrow@21.1.0` confirmed installed via `node -e "require('apache-arrow/package.json').version"`. `bigIntToNumber` confirmed exported from `apache-arrow/util/bigint` (imported by the vendored `metadata.ts:6`).

## Package Legitimacy Audit

> Phase 2 installs **no external packages**. All code is pure TypeScript over Phase-1 dependencies (apache-arrow@21.1.0, vendored mzpeakts), which were audited and locked in Phase 1.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No installs — audit N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none (no installs)
**Packages flagged as suspicious [SUS]:** none (no installs)

## Architecture Patterns

### System Architecture Diagram

```
                          File load (store.openUrl / openFile)
                                       │
                  stage: metadata  ────┤  computeStats / computeCapabilities
                                       │  (Phase 1 — isImaging boolean probe)
                                       ▼
                  stage: 'grid'  ──────┐  NEW Phase-2 step (D-05)
                                       │
                                       ▼
        ┌────────────────── src/reader/scanCoords.ts ──────────────────┐
        │  CoordSource chain (D-16), keyed on accession:               │
        │    1. promoted columns  reader.spectrumMetadata.scans        │
        │         .getChild("IMS_1000050_position_x") / "..._y"        │   returns
        │    2. cvParam fallback  scan.getParamByAccession("IMS:1000050")│  plain
        │    3. id-string parse   spectrum.id  (last resort)           │  {x,y}[]
        │  + run-level geometry source:                                │  + geometry
        │    a. reader.store.fileIndex.metadata.imaging (discovery)    │  POJO
        │    b. raw `run` keyValueMetadata JSON .parameters  (GAP fix) │   (no Arrow,
        │    c. derived max-coordinate                                 │   no bigint)
        └───────────────────────────────┬─────────────────────────────┘
                                         │ {coords: {x,y}[], geometry, coordSourceStrategy}
                                         ▼
        ┌────────────────── src/imaging/grid.ts ───────────────────────┐
        │  buildImagingGrid(coords, geometry):                         │
        │    • 1-based → 0-based  (index = coord − coordinate_base)     │
        │    • extent: declared IMS:1000042/43 WINS over max-coord     │
        │    • presenceMask: Uint8Array(width*height)                  │
        │    • coordToSpectrumIndex: Map<coordKey, spectrumIndex>      │
        │    • aspect from IMS:1000046/47 (µm) or 1:1                   │
        │    • diagnostics: filled/total, missing, duplicates,         │
        │                   discovery-vs-column disagreement           │
        └───────────────────────────────┬─────────────────────────────┘
                                         │ ImagingGrid | null
                                         ▼
                   store.grid  ◄─────────┤  (null if non-imaging → D-04)
                                         ▼
                  stage: 'ready'         │
                                         ▼
        src/ui/GridDiagnosticsPanel.tsx (inline expandable, below CapabilitiesPanel)
          • imaging:    "Grid: 260×134 — 34840/34840 px (100%)" + expand
          • non-imaging: "Not imaging data — no spatial coordinates found"
```

### Recommended Project Structure
```
src/
├── reader/
│   ├── scanCoords.ts        # NEW: CoordSource chain + run-geometry read; returns plain {x,y}[] + geometry POJO
│   ├── scanCoords.test.ts   # NEW: Reader-POJO-mock tests for each strategy + geometry sources
│   ├── types.ts             # EXTEND: add 'grid' to LoadStage union; (optionally) ImagingGrid type
│   └── ...                  # existing: openUrl, fileMeta, stats, arrays, capability, errors
├── imaging/                 # NEW folder (above the reader boundary — plain {x,y}[] only)
│   ├── types.ts             # ImagingGrid, GridGeometry, GridDiagnostics
│   ├── grid.ts              # buildImagingGrid(coords, geometry) → ImagingGrid | null
│   └── grid.test.ts         # synthetic 5×4 dense / 5×4 sparse / non-imaging + PXD001283 unlock test
├── state/
│   └── store.ts             # EXTEND: 'grid' stage; grid: ImagingGrid | null; call builders in runLoad
└── ui/
    └── GridDiagnosticsPanel.tsx  # NEW: inline expandable, mirrors CapabilitiesPanel
```

### Pattern 1: CoordSource strategy chain (D-16, IMG-01, Pitfall 1)
**What:** A single interface with three implementations tried in order; the winner is recorded for diagnostics.
**When to use:** Always — this is the project's #1-risk-mitigation pattern. Never inline coordinate access.
**Example:**
```typescript
// src/reader/scanCoords.ts  — INSIDE the reader boundary (may touch Arrow/bigint)
// Source: synthesized from src/reader/stats.ts::probeIsImaging (verified working
//         coordinate access) + ARCHITECTURE.md CoordSource pattern.

const IMS_POS_X_COL = "IMS_1000050_position_x";   // promoted column name
const IMS_POS_Y_COL = "IMS_1000051_position_y";
const IMS_POS_X_ACC = "IMS:1000050";              // accession (fallback keying)
const IMS_POS_Y_ACC = "IMS:1000051";

export type CoordResult = {
  coords: { x: number; y: number }[];   // plain, bigint→number (D-08)
  strategy: "promoted-columns" | "cv-params" | "id-parse";
};

// Strategy 1 (PRIMARY): bulk Arrow column read. scans is an Arrow Struct vector.
function fromPromotedColumns(reader: Reader): CoordResult | null {
  const scans = reader.spectrumMetadata?.scans;        // Arrow.Vector<Struct> | null
  if (!scans) return null;
  const xCol = scans.getChild(IMS_POS_X_COL);          // Int64 or UInt32 (D-15)
  const yCol = scans.getChild(IMS_POS_Y_COL);
  if (!xCol || !yCol) return null;
  const coords: { x: number; y: number }[] = [];
  for (let i = 0; i < scans.length; i++) {
    const x = xCol.get(i), y = yCol.get(i);
    if (x == null || y == null) continue;
    coords.push({ x: Number(x), y: Number(y) });       // bigint→number safe (Pitfall 3)
  }
  return coords.length ? { coords, strategy: "promoted-columns" } : null;
}
// Strategy 2 (FALLBACK): per-scan cvParam via getParamByAccession (handles non-promoted).
// Strategy 3 (LAST RESORT): parse coords out of the spectrum `id` string.

export function extractCoords(reader: Reader): CoordResult | null {
  return fromPromotedColumns(reader)
      ?? fromCvParams(reader)
      ?? fromIdParse(reader);
}
```

> ⚠️ **Sparse-scan join (verify in plan):** `scans` rows are keyed by `source_index → spectrum.index` (see `metadata.ts:683-698`). For v1 (one scan row per pixel spectrum, C1) scan row order *usually* equals spectrum order, but the planner MUST NOT assume row `i` of `scans` is spectrum `i`. Read each scan row's `source_index` child alongside the coord columns and key the `Map` on that, so a sparse or reordered scan table still joins correctly. This is the per-axis bulk-read variant of the `source_index` join the reader already does in `SpectrumMetadata.get()`.

### Pattern 2: Sparse grid model — Map + presence mask, never a dense array (D-14, Pitfall 2)
**What:** `coordToSpectrumIndex: Map<coordKey, spectrumIndex>` + `presenceMask: Uint8Array(width*height)`. Width/height come from declared extent; fill is *derived*, never assumed.
**When to use:** Always. Real MSI is frequently sparse (ROI, off-tissue, failed pixels).
**Example:**
```typescript
// src/imaging/grid.ts  — ABOVE the reader boundary, plain {x,y}[] only (D-08)
const key = (x0: number, y0: number) => x0 * width + y0;   // 0-based integer key

const presenceMask = new Uint8Array(width * height);       // 0 = absent (NaN/background)
const coordToSpectrumIndex = new Map<number, number>();
let duplicates = 0;
coords.forEach((c, spectrumIndex) => {
  const x0 = c.x - coordinateBase;   // 1-based → 0-based (D-10); NEVER hard-code 1
  const y0 = c.y - coordinateBase;
  const k = key(x0, y0);
  if (coordToSpectrumIndex.has(k)) duplicates++;           // diagnostic, don't silently overwrite
  coordToSpectrumIndex.set(k, spectrumIndex);
  presenceMask[k] = 1;
});
const filledCount = coordToSpectrumIndex.size;
const totalCells = width * height;
```

### Pattern 3: Declared-extent-wins geometry with explicit fallback chain (D-11, C4)
**What:** Grid extent = `IMS:1000042 × IMS:1000043` when available; max-observed-coordinate only as fallback. Disagreement between declared and observed is surfaced, not silently resolved.
**When to use:** Always. Sparse acquisitions have max-coord < declared extent — using max-coord would shrink the grid wrongly.
```typescript
// geometry sourced inside src/reader/ (crosses format boundary), passed up as plain POJO
const declared = geometry.pixelCount;              // from metadata.imaging or run params
const observedMaxX = Math.max(...coords.map(c => c.x));
const observedMaxY = Math.max(...coords.map(c => c.y));
const width  = declared?.x ?? observedMaxX;        // declared WINS
const height = declared?.y ?? observedMaxY;
const extentDisagreement =
  declared != null && (declared.x < observedMaxX || declared.y < observedMaxY);
// → push to diagnostics; this is the "columns disagree with discovery block" warning (C1/C4)
```

### Anti-Patterns to Avoid
- **Inline `IMS:1000050` access in the grid builder.** Wrap in the CoordSource interface from day one (Pitfall 1 / tech-debt table). Codex will flag inline access.
- **Dense `width*height` buffer indexed as if every cell has a spectrum.** Empty pixels become indistinguishable from genuine-zero pixels and sparse ROIs crash/hole (Pitfall 2). Use the Map + mask.
- **Hard-coding `−1` for 1-based→0-based.** Read `coordinate_base` from the discovery block (D-10); it may become 0-based in a future spec rev.
- **Assuming `reader.fileMetadata.run.parameters` exists.** It does not — the vendored reader drops it (Pitfall 1 below). Source geometry from the discovery block / raw run JSON.
- **Arrow `Vector`, `bigint`, or mzpeakts types crossing above `src/reader/`.** Phase-1 boundary, Codex-enforced (`grep -rl "from 'mzpeakts'" src/` must stay reader-only).
- **Adding a new `ReaderErrorClass` for non-imaging files.** Non-imaging is a valid `grid: null` state with a specific UI notice, NOT an error (D-04, C7, CONTEXT code_context).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Int64 column read | Manual byte/limb decoding of the Arrow buffer | `xCol.get(i)` then `Number()` (or `bigIntToNumber`) | Arrow's vector accessor handles the FFI buffer layout; values are small so `Number()` is exact. |
| Per-spectrum coordinate access | A second hand-written scan-table walker | The `scan.meta[col]` / `getParamByAccession` paths already proven in `stats.ts::probeIsImaging` | The access pattern is solved; Phase 2 generalizes the boolean probe to a full extractor. |
| Scan↔spectrum join | Assuming row index == spectrum index | Key on the `source_index` child column (as `SpectrumMetadata.get()` does) | The reader already does this join for sparse/reordered scan tables. |
| Discovery-block access | Re-parsing `mzpeak_index.json` | `reader.store.fileIndex.metadata.imaging` | Already parsed by the reader and read by `probeIsImaging`. |
| Sparse presence tracking | Dense boolean 2D arrays | `Map` + `Uint8Array` mask | Standard sparse-grid representation; O(filled) memory not O(w*h) for huge mostly-empty grids. |

**Key insight:** Phase 2 is 80% *plumbing existing reader access into a typed grid model* and 20% the genuinely new geometry-source logic. The coordinate read, discovery-block access, and scan join are all already implemented somewhere in Phase 1 or the vendored reader — reuse, don't reinvent.

## Runtime State Inventory

> Phase 2 is a **greenfield additive code change** (new module, new store field, new panel). No rename/refactor/migration of stored data, services, OS state, secrets, or build artifacts.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys renamed. The only persisted artifact touched is the optional `test/data/PXD001283.mzpeak` fixture (operator drops it; read-only). | None |
| Live service config | None — fully client-side, no external services. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None. | None |
| Build artifacts | None renamed. New files are emitted by the existing Vite/Vitest pipeline with no config change beyond TS module resolution (automatic). | None |

**Nothing found in every category — verified by:** Phase 2 adds `src/imaging/`, `src/reader/scanCoords.ts`, one store field, one UI panel; it renames nothing and migrates no data.

## Common Pitfalls

### Pitfall 1: `ms_run.parameters` is silently dropped by the vendored reader (THE geometry gap)
**What goes wrong:** The plan assumes `reader.fileMetadata.run` carries `IMS:1000042/43/46/47` (grid extent + pixel size). It does not — so declared extent and pixel aspect come back empty, the grid silently falls back to max-coordinate (wrong for sparse files), and aspect defaults to 1:1 even when the file declares non-square pixels.
**Why it happens:** `MSRun.fromJSON` (`vendor/mzpeakts/lib/src/metadata.ts:282-291`) parses only `id`, `default_*_id`, and `start_time`. It **never reads `raw.parameters`**, unlike every sibling class (`SourceFile`, `InstrumentComponent`, etc.) which do `(raw.parameters).map(Param.fromJSON)`. The `MSRun` class has no `parameters`/`params` field at all. The raw `run` JSON *does* contain `parameters` (spec §4.2), but the reader discards it before it reaches the app.
**How to avoid:**
1. Make `metadata.imaging` discovery block geometry source **#1** (it IS exposed via `reader.store.fileIndex.metadata.imaging` and carries `pixel_count`, `pixel_size_um`, `coordinate_base` — verified in `probeIsImaging`).
2. For the authoritative `ms_run.parameters`, add a small raw-JSON read inside `src/reader/` (e.g. in `scanCoords.ts` or a tiny `runParams.ts`): read the `run` key from the Parquet footer keyValueMetadata (`reader.spectrumMetadata.handle.metadata().fileMetadata().keyValueMetadata().get("run")`, then `JSON.parse`, then pull `parameters` by accession). This recovers `IMS:1000042/43/46/47` without modifying the vendored reader.
3. Fall back to derived max-coordinate (declared-extent-wins only when declared is present).
4. **Plan must include a verification step** that the geometry-source priority is exercised by tests (discovery-present, run-params-only, neither/max-coord-only).
**Warning signs:** Grid extent always equals max observed coordinate; `pixelSizeUm` always null; aspect always 1:1 even for the PXD001283 10µm-square reference (which *should* read 10/10 from the file).
**Confidence:** HIGH `[VERIFIED: vendor/mzpeakts/lib/src/metadata.ts:261-291,317-345]`

### Pitfall 2: Treating a sparse grid as dense
**What goes wrong:** Building `width*height` and indexing `(x-xmin)+(y-ymin)*width` assuming every cell has a spectrum → empty pixels indistinguishable from genuine-zero pixels, or out-of-bounds/crash when coord count < grid area.
**Why it happens:** Demo files and imzML "continuous mode" intuition suggest full rectangles; real acquisitions skip off-tissue/failed pixels.
**How to avoid:** Map + presence mask (Pattern 2). Derive `filled/total`; render absent cells as background/NaN distinct from zero. Surface fill ratio in diagnostics.
**Warning signs:** `filledCount` noticeably < `totalCells`; speckled/striped images later; uniform-zero "background."
**Confidence:** HIGH `[CITED: .planning/research/PITFALLS.md Pitfall 2]`

### Pitfall 3: Int64 → number conversion (is `Number()` safe?)
**What goes wrong:** Fear of bigint overflow leads to defensive `bigIntToNumber` everywhere, or — worse — accidentally letting a `bigint` leak above the reader boundary (Codex violation).
**Why it happens:** Arrow `Int64`/`Uint64` columns return JS `bigint`. `Number(bigint)` loses precision only above 2^53.
**How to avoid:** Coordinate values are pixel indices, **max ~10,000** (PXD001283 is 260×134). `Number(bigint)` is exact and safe for this range; do the conversion *inside* `src/reader/scanCoords.ts` so only plain `number` crosses the boundary (D-08). `bigIntToNumber` (from `apache-arrow/util/bigint`, already used by the vendored reader) is an equivalent option. Also handle `UInt32` columns (D-15) which return plain `number` already — `Number(x)` is a no-op there, so a single `Number()` call handles both types uniformly.
**Warning signs:** A `bigint` appearing in `src/imaging/` (boundary leak); `typeof coord.x === "bigint"` anywhere above the reader.
**Confidence:** HIGH `[VERIFIED: PXD001283 grid 260×134 → max coord 260 ≪ 2^53; apache-arrow get() returns bigint for Int64, number for UInt32]`

### Pitfall 4: Synthetic fixture friction — over-engineering Arrow construction
**What goes wrong:** Trying to build real binary `.mzpeak` files or full `parquet-wasm` Arrow tables for unit tests → slow, brittle, WASM-dependent tests.
**Why it happens:** Assuming grid tests need a real reader.
**How to avoid:** Reuse the **Phase-1 `stats.test.ts` mock pattern** (`vendor`-free Reader-shaped POJOs): `makeReader([...])` returns `{ store: { fileIndex: { metadata } }, spectrumMetadata: { length, get, scans } }`. For `scanCoords.ts` bulk path, mock `scans` as a tiny object exposing `length` + `getChild(name) → { get(i) }`. For `grid.ts` (which takes plain `{x,y}[]`), no reader mock is needed at all — pass arrays directly. The PXD001283 unlock test (`test.skipIf(!existsSync(...))`) is the *only* test that touches a real binary, and it auto-skips until the operator provides the file (D-01).
**Warning signs:** Tests importing `parquet-wasm`; 30s test timeouts on grid-math tests; needing a binary fixture for non-imaging detection (use the `small.mzpeak` real fixture, D-02).
**Confidence:** HIGH `[VERIFIED: src/reader/stats.test.ts:144-242 establishes the exact mock pattern]`

### Pitfall 5: Eager grid build blocking on a heavy per-record loop
**What goes wrong:** Building the grid via 34,840 `reader.spectrumMetadata.get(i)` calls (each a binary search + `.toJSON()` + `Param.fromArrow`) makes the eager `'grid'` stage (D-05) slow enough to feel like a hang.
**Why it happens:** Copying the `stats.ts` per-record loop pattern, which is fine for a boolean probe over 5 records but not for a full 34k extraction.
**How to avoid:** Use the bulk `.getChild(col).get(i)` column path (Pattern 1) — one column object per axis, then a tight numeric loop. This is a single columnar pass, fast even at PXD001283 scale (the CONTEXT D-05 rationale explicitly assumes "a single Arrow column read"). Keep `yieldFrame()` around the stage transition so the `'grid'` label is observable (Phase-1 store pattern).
**Warning signs:** `'grid'` stage takes >1s on PXD001283; profiler shows time in `Param.fromArrow` / `toJSON`.
**Confidence:** HIGH `[VERIFIED: metadata.ts get(i) does binarySearchAll + toJSON + Param.fromArrow per call]`

### Pitfall 6: Conflating "not imaging" with an error (UX)
**What goes wrong:** A valid LC-MS file with no coordinate columns throws or shows a red error banner instead of a calm "not imaging data" notice.
**Why it happens:** Treating absence of coordinates as a failure.
**How to avoid:** D-04 / C7 — `grid: null` + a distinct neutral notice in GridDiagnosticsPanel. Do NOT route through `ErrorBanner` or add a `ReaderErrorClass`. The `'grid'` stage completes normally and proceeds to `'ready'` (D-06).
**Warning signs:** Non-imaging `small.mzpeak` shows an error; `store.error` set on a valid LC-MS file.
**Confidence:** HIGH `[CITED: CONTEXT D-04, IMAGING-SPEC-ALIGNMENT C7]`

## Code Examples

### Extend the LoadStage union and store (D-05)
```typescript
// src/reader/types.ts — add 'grid' between 'metadata' and 'ready'
export type LoadStage =
  | "idle" | "zip-index" | "manifest" | "metadata" | "grid" | "ready" | "error";
```
```typescript
// src/state/store.ts runLoad() — after the metadata block, before stage:'ready'
set({ stage: "grid" });
await yieldFrame();
const isImaging = capabilities.isImaging;          // Phase-1 probe result
let grid: ImagingGrid | null = null;
if (isImaging) {
  const coordResult = extractCoords(reader);        // src/reader/scanCoords.ts
  const geometry = readGridGeometry(reader);        // discovery block → run JSON → null
  grid = coordResult ? buildImagingGrid(coordResult, geometry) : null;  // src/imaging/grid.ts
}
set({ grid, stage: "ready", /* ...rest */ });
```

### ImagingGrid type (CONTEXT "Specific Ideas" — informs Phase 3 TIC builder)
```typescript
// src/imaging/types.ts  (plain types — no Arrow/bigint; consumed by Phase 3+)
export interface ImagingGrid {
  width: number;
  height: number;
  coordinateBase: number;                          // read from discovery block (D-10)
  pixelSizeUm: { x: number; y: number } | null;    // IMS:1000046/47, or null → 1:1 (D-12)
  coordToSpectrumIndex: Map<number, number>;       // sparse lookup (D-14) — Phase 3 needs this
  presenceMask: Uint8Array;                         // length width*height (D-14) — Phase 3 needs this
  filledCount: number;
  totalCells: number;
  coordSourceStrategy: "promoted-columns" | "cv-params" | "id-parse";
  diagnostics: GridDiagnostics;
}
export interface GridDiagnostics {
  spectrumCount: number;
  uniqueCoordCount: number;
  duplicateCount: number;
  missingCount: number;                            // totalCells − filledCount
  extentSource: "declared" | "max-coord";
  geometrySource: "discovery-block" | "run-params" | "derived";
  discoveryDisagreement: string | null;            // C1/C4 columns-vs-discovery mismatch note
}
```
> **Phase-3 forward-compat note:** the TIC builder (Phase 3) consumes exactly `width`, `height`, `coordToSpectrumIndex`, and `presenceMask` to scatter a scalar-per-spectrum array onto `M[row][col]` (C2, col=x/row=y). Keeping these four fields stable is the cross-phase contract — ARCHITECTURE.md Pattern 2.

### GridDiagnosticsPanel skeleton (D-03, mirrors CapabilitiesPanel)
```tsx
// src/ui/GridDiagnosticsPanel.tsx — inline expandable, below <CapabilitiesPanel/> in App.tsx
import { useState } from "react";
import { useStore } from "../state/store";

export function GridDiagnosticsPanel() {
  const grid = useStore((s) => s.grid);
  const capabilities = useStore((s) => s.capabilities);
  const [open, setOpen] = useState(false);
  if (!capabilities) return null;
  if (grid === null) {
    return (
      <section data-testid="grid-panel" aria-label="grid-panel">
        <span data-testid="grid-not-imaging">
          Not imaging data — no spatial coordinates found
        </span>
      </section>
    );
  }
  const pct = Math.round((grid.filledCount / grid.totalCells) * 100);
  const warn = grid.filledCount < grid.totalCells * 0.95 || grid.diagnostics.duplicateCount > 0;
  return (
    <section data-testid="grid-panel" aria-label="grid-panel">
      <button onClick={() => setOpen(!open)} data-testid="grid-summary">
        {warn ? "⚠ " : ""}Grid: {grid.width}×{grid.height} — {grid.filledCount}/{grid.totalCells} px ({pct}%)
      </button>
      {open && (
        <table data-testid="grid-diagnostics">{/* dims, dup/missing, geometrySource, disagreement */}</table>
      )}
    </section>
  );
}
```

### PXD001283 unlock test (D-01)
```typescript
// src/imaging/grid.test.ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const PXD = fileURLToPath(new URL("../../test/data/PXD001283.mzpeak", import.meta.url));
const hasPXD = existsSync(PXD);

test.skipIf(!hasPXD)("validates 260×134 grid against PXD001283", async () => {
  // open real reader → extractCoords → readGridGeometry → buildImagingGrid
  // assert: width===260, height===134, uniqueCoordCount===34840===spectrumCount,
  //         coordinateBase===1, pixelSizeUm≈{10,10}, coordSourceStrategy==="promoted-columns"
});
```

### PROC-01 Codex gate plan (mirror of 01-04, MANDATORY)
The phase's final plan (`02-04` or equivalent) MUST mirror `01-04-PLAN.md`:
- **Task 1 (auto):** Full verification sweep — `npm run lint && npx tsc --noEmit && npm test && npm run build` (+ Playwright if an imaging fixture exists). Confirm IMG-01/02/03 each map to ≥1 passing test. Re-assert the import boundary: `grep -rl "from ['\"]mzpeakts['\"]" src/` returns only `src/reader/openUrl.ts`. Re-assert no `bigint`/Arrow types in `src/imaging/`.
- **Task 2 (auto):** `bash tools/codex_review.sh round1 02` (plan bundle) and `bash tools/codex_review.sh round2 02 --sha <phase_start_sha>` (phase diff). Capture both verdict lines for the commit footer. Logs → `.planning/phases/02-.../02-CODEX-ROUND{1,2}.log` (gitignored).
- **Task 3 (checkpoint:human-verify, blocking):** Operator reviews verdicts; approves or requests revisions. Escalate on `reject` / substantive `accept-with-revisions`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Imaging coordinate convention = hypothesis (PITFALLS #1 was "no spec") | Specified by imaging-mzpeak-spec v0.3 (C1–C9): promoted `Int64` scan columns, fixed top-left orientation, declared-extent geometry | 2026-06-03 (spec ingested) | Phase 2 is plannable now; PXD001283 is *validation* input, not a precondition (STATE.md). |
| Per-spectrum `get(i)` loop (fine for boolean probe) | Bulk `getChild(col)` columnar read for full extraction | This phase | Avoids O(n log n) heavy-allocation loop at 34k-row scale (Pitfall 5). |

**Deprecated/outdated:**
- The PITFALLS.md framing of coordinate convention as "MEDIUM-LOW confidence, hypothesis only" is superseded by the v0.3 spec — treat C1–C9 as authoritative, keep the CoordSource fallback only as defensive design (spec is pre-merge).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `scan` Arrow rows are in spectrum-index order for v1 one-scan-per-pixel files, but the plan should still join on `source_index` to be safe | Pattern 1 note | LOW — joining on `source_index` (recommended) is correct regardless; only a perf micro-optimization is lost if order happens to match. |
| A2 | The raw `run` keyValueMetadata JSON actually contains `parameters` with `IMS:1000042/43/46/47` for a real converted imaging file | Pitfall 1 | MEDIUM — spec §4.2 mandates it, but no real `.mzpeak` exists yet to confirm the converter writes it. Mitigated by the discovery-block-first source order and max-coord fallback; confirm against PXD001283 when available. |
| A3 | `Number(bigint)` is exact for all real coordinate values | Pitfall 3 | LOW — true for any grid ≤ 2^53 pixels per axis; MSI grids are ≤ tens of thousands. |
| A4 | Reader-shaped POJO mocks fully exercise `scanCoords.ts` strategy logic without a real Arrow table | Pitfall 4 | LOW — the bulk path only calls `.length` + `.getChild(name).get(i)`, both trivially mockable; the PXD001283 unlock test covers the real-Arrow path when the file lands. |

**Note:** A2 is the only MEDIUM-risk assumption and is the reason the geometry-source chain (discovery → run-params → max-coord) and its diagnostics exist. The plan should explicitly test all three branches with synthetic geometry POJOs so a wrong A2 degrades gracefully rather than breaking the grid.

## Open Questions (RESOLVED)

1. **Does the converted PXD001283 `.mzpeak` populate `ms_run.parameters`, or only `metadata.imaging`?**
   - What we know: spec §4.2 says both, with `ms_run.parameters` authoritative and the discovery block a denormalized copy.
   - What's unclear: whether the sibling `imzML2mzPeak` converter writes both today; only `metadata.imaging` is guaranteed-accessible through the vendored reader without the Pitfall-1 raw-JSON read.
   - Recommendation: Source geometry from the discovery block first (always accessible), add the raw-run-JSON read for the authoritative path, fall back to max-coord. Validate which source actually fired via `diagnostics.geometrySource` against PXD001283 when the file arrives.
   - **RESOLVED:** Design is not blocked by this uncertainty. The three-branch geometry chain (discovery-block → raw-run-params JSON → max-coord derived) handles all cases correctly regardless of which the converter populates. `diagnostics.geometrySource` will empirically record which branch fired when PXD001283 arrives. No planning decision is deferred.

2. **Should the run-geometry read live in `scanCoords.ts` or a separate `runParams.ts`?**
   - What we know: both are inside `src/reader/`, both satisfy the boundary. CONTEXT D-07 only names `scanCoords.ts`.
   - Recommendation: Planner's discretion — a small `readGridGeometry(reader)` helper colocated in `scanCoords.ts` keeps the reader-extension surface to one new file (matches D-07 spirit). Split only if it grows.
   - **RESOLVED:** `readGridGeometry` is colocated in `scanCoords.ts` per D-07. The plans implement it this way (plan 02-01). No split needed at Phase 2 scale.

## Environment Availability

> Phase 2 adds no external tools/services. The toolchain (Vite, Vitest, Playwright, node, the vendored reader) was installed and verified in Phase 1.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| apache-arrow | scanCoords column read | ✓ | 21.1.0 | — |
| vitest | unit tests | ✓ | 4.1.8 | — |
| vendored mzpeakts | reader access | ✓ | local | — |
| codex CLI (PROC-01) | round1/round2 gate | ✓ (per CLAUDE.md) | `/opt/homebrew/bin/codex` | Operator runs manually if CLI absent |
| `test/data/PXD001283.mzpeak` | unlock validation test | ✗ | — | `test.skipIf` auto-skips; synthetic fixtures cover the gate (D-01) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** PXD001283 fixture — covered by `skipIf` + synthetic grids until the operator converts it.

## Security Domain

> `security_enforcement: true`, ASVS level 1. Phase 2 introduces **no new trust boundary**: it reads already-parsed, in-memory metadata from a reader that was opened and capability-gated in Phase 1. No new network endpoints, no user-supplied strings reaching a sink, no auth/session/crypto surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth (client-side static app). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No access control surface. |
| V5 Input Validation | yes (light) | Coordinate values from the file are validated as finite small integers before grid indexing; out-of-range / negative / non-integer coords → diagnostic, not a buffer index. Spectrum-`id` parse fallback (Strategy 3) must guard against malformed ids (no unbounded regex backtracking; bound the parse). |
| V6 Cryptography | no | The spec's ibd checksums (IMS:1000090/91/92) are provenance metadata only; not verified or recomputed here. |

### Known Threat Patterns for {mzPeak imaging grid build}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/garbage coordinate values → giant `width*height` allocation (DoS via OOM) | Denial of Service | Cap declared/derived extent at a sane bound; if `width*height` exceeds a threshold, refuse with a diagnostic rather than allocating. Presence Map is already O(filled) not O(w*h) — only the `Uint8Array` mask is dense, so bound its size. |
| Spectrum-`id` parse fallback fed an adversarial id string | Tampering / DoS (ReDoS) | Bounded, non-backtracking parse; treat unparseable ids as "no coord" not a throw. |
| Coordinate value used directly as array index → out-of-bounds write | Tampering | Index only after `0 ≤ x0 < width && 0 ≤ y0 < height` check; out-of-range coords increment a diagnostic counter. |

## Sources

### Primary (HIGH confidence)
- `vendor/mzpeakts/lib/src/metadata.ts` — `SpectrumMetadata.scans` Arrow struct access; `get(i)` source_index join (lines 683-698); **`MSRun.fromJSON` drops `parameters`** (282-291); `FileMetadata.fromParquet` keyValueMetadata keys (317-345); `bigIntToNumber` import.
- `vendor/mzpeakts/lib/src/record.ts` — `Scan.meta` = raw record toJSON; `getParamByAccession` (ParamDescribed) reads both `params` and promoted `meta` columns by accession (16-28).
- `vendor/mzpeakts/lib/src/reader.ts` — `reader.spectrumMetadata`, `reader.store`, `extractXIC` (Phase-4 primitive), `fileMetadata` getter.
- `vendor/mzpeakts/lib/src/store.ts` — `FileIndex.metadata` (the `metadata.imaging` discovery block lives here; lines 42-56).
- `src/reader/stats.ts` — **working coordinate access** in `probeIsImaging` (222-263): promoted column + cvParam + discovery-block paths Phase 2 generalizes.
- `src/reader/stats.test.ts` — Reader-shaped POJO mock pattern (144-242) = the synthetic-fixture approach for D-01/Pitfall 4.
- `src/reader/types.ts`, `src/state/store.ts`, `src/ui/CapabilitiesPanel.tsx`, `src/ui/App.tsx` — extension points (LoadStage union, runLoad staging, collapsible-panel pattern, left-column composition).
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` — binding constraints C1–C9 (primary authority).
- `.planning/research/imaging-spec/imaging-mzpeak-spec-draft-v0.3.md` — §4.1 coordinate columns, §4.2 run geometry + discovery block, §5.1 fixed orientation, §9 PXD001283 worked example (260×134, 34840 px, 10µm).
- `.planning/REQUIREMENTS.md` — IMG-01/02/03 exact wording.
- `.planning/phases/01-reader-foundation-open-and-inspect/01-04-PLAN.md` — PROC-01 gate plan template to mirror.
- `node -e "require('apache-arrow/package.json').version"` → 21.1.0 (installed version confirmation).

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — 4-layer pipeline, CoordSource/ImagingGrid patterns (the prescriptive design Phase 2 implements).
- `.planning/research/PITFALLS.md` — Pitfalls 1 (coord convention), 2 (sparse), 8 (orientation/aspect), 11 (not-imaging vs error).

### Tertiary (LOW confidence)
- None — all claims traced to source files or the pinned spec.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; arrow version verified installed; all access paths exist in vendored source.
- Architecture: HIGH — CoordSource + sparse-grid patterns prescribed by ARCHITECTURE.md and proven feasible by `probeIsImaging`.
- Pitfalls: HIGH — the `ms_run.parameters` gap (Pitfall 1) is verified line-by-line in the vendored reader; others cited from PITFALLS.md / spec.
- The single MEDIUM item is A2 (whether a real converted file populates run params), mitigated by the discovery-block-first geometry chain.

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable — vendored reader is pinned; spec is pinned at v0.3). Re-check if the mzpeakts submodule is bumped or imaging-spec revises past v0.3.
