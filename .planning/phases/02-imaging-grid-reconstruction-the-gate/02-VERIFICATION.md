---
phase: 02-imaging-grid-reconstruction-the-gate
verified: 2026-06-03T20:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open an imaging .mzpeak file in the browser; observe the Grid panel"
    expected: "Compact summary line shows dimensions and fill ratio; expand reveals diagnostics table with all 8 rows (Dimensions, Fill, Spectra, Missing, Duplicates, Pixel size, Coord source, Discovery check); anomaly indicator (amber + warning glyph) fires correctly on sparse/duplicate files"
    why_human: "GridDiagnosticsPanel rendering and interaction cannot be verified without a browser + real imaging file; automated tests use mocked store state"
  - test: "Open the non-imaging small.mzpeak in the browser"
    expected: "Grid section shows muted 'Not imaging data — no spatial coordinates found' — no expand affordance, no table, no ErrorBanner"
    why_human: "Visual rendering of the non-imaging notice path must be observed in a live browser session"
  - test: "Load an imaging file where the imaging grid cannot be built (e.g. deliberately corrupt coord columns)"
    expected: "App surfaces a named error ('Imaging file detected but spatial pixel grid could not be reconstructed…'), NOT a silent ready state with an empty grid panel"
    why_human: "The error-surfacing path for imaging-file grid-build failures requires a real corrupted imaging fixture; no such fixture is in the test suite"
---

# Phase 2: Imaging Grid Reconstruction (THE GATE) Verification Report

**Phase Goal:** A user can load an imaging `.mzpeak` and see a verified spatial pixel grid — extents, dimensions, presence mask, and diagnostics — reconstructed via a swappable coordinate-extraction strategy that is validated against the operator's real imaging file before anything is rendered on top of it.
**Verified:** 2026-06-03T20:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | App reconstructs per-spectrum x/y coordinates via a swappable CoordSource chain (promoted-columns primary → cv-params → id-parse); accepts Int64 and UInt32; logs winning strategy | ✓ VERIFIED | `src/reader/scanCoords.ts` implements all three strategies. `extractCoords()` uses `??` chain (line 239). `toCoordNumber()` handles `bigint` via `Number.isSafeInteger` guard (lines 60-69). 13 tests in `scanCoords.test.ts` cover Int64 (Test 1), UInt32 (Test 2), cv-params (Test 4), id-parse (Test 5), strategy tagging. |
| SC2 | App exposes grid geometry — declared-extent-wins, presence mask, coord-to-spectrum lookup, coordinate_base normalization, pixel aspect | ✓ VERIFIED | `src/imaging/grid.ts` `buildImagingGrid()`: declared extent wins (lines 62-70); `Map<number,number>` + `Uint8Array` sparse model (lines 86-87); `key = y0*width+x0` row-major (line 116); `coordinateBase` read from geometry (line 49). `grid.test.ts` Tests 3 (declared-extent-wins), 5 (base-0), and 1 (dense 5×4) pass. |
| SC3 | App surfaces grid-diagnostics panel: dims, unique-coord count vs spectrum count, fill ratio, missing/duplicate pixels, discovery disagreement | ✓ VERIFIED | `src/ui/GridDiagnosticsPanel.tsx` renders all 8 diagnostic rows with required testids (`grid-panel`, `grid-summary-line`, `grid-expand-toggle`, `grid-diagnostics-table`, `grid-not-imaging-notice`, `grid-anomaly-warning`). Anomaly flag computed at lines 69-71. `GridDiagnostics` struct has all required fields including `oobCount`. |
| SC4 | Reconstructed grid validated against synthetic known-grid fixtures; PXD001283 unlock test wired and auto-skipping | ✓ VERIFIED | 7 synthetic tests pass (grid.test.ts Tests 1-7). Test 8 (`test.skipIf(!existsSync(PXD))`) is wired to the correct `CoordResult` API (uses `cr.coords` and `cr.spectrumIndices`) and auto-skips (1 skipped in full suite). |
| SC5 | Non-imaging file reported distinctly as "not imaging data — no spatial coordinates found", not as a broken file | ✓ VERIFIED | `store.ts` lines 110-141: `capabilities.isImaging` guard; non-imaging sets `grid: null`, reaches `stage: "ready"`, `error: null`. `GridDiagnosticsPanel` line 43: guard is `grid === null && capabilities.isImaging === false`. `store.integration.test.ts` tests real `small.mzpeak` (160ms, passes). |

**Score:** 5/5 truths verified

---

### Deferred Items

None — all five ROADMAP success criteria are met within this phase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/reader/scanCoords.ts` | `extractCoords()` + `readGridGeometry()` + plain-POJO types; no Arrow/bigint leak | ✓ VERIFIED | 354 lines. Exports `extractCoords`, `readGridGeometry`, `CoordResult`, `GridGeometry`. Only import: `import type { Reader } from "./openUrl"`. |
| `src/reader/scanCoords.test.ts` | 13 tests covering all 3 strategies + geometry sources + Int64/UInt32 + source_index join | ✓ VERIFIED | 319 lines. 13 tests pass. |
| `src/imaging/types.ts` | `ImagingGrid`, `GridGeometry`, `GridDiagnostics` interfaces | ✓ VERIFIED | Contains all required interfaces. `ImagingGrid` has `coordToSpectrumIndex: Map<number,number>` and `presenceMask: Uint8Array`. `GridDiagnostics` has `oobCount`. |
| `src/imaging/grid.ts` | `buildImagingGrid()` pure transform; no Arrow/bigint/mzpeakts | ✓ VERIFIED | 168 lines. Exports `buildImagingGrid` + `Coord`. Only import: `./types`. Uses `new Map<number,number>()` + `new Uint8Array(totalCells)`. |
| `src/imaging/grid.test.ts` | 7 synthetic tests + 1 PXD unlock skipIf test | ✓ VERIFIED | 301 lines. 7+1 (NaN guard Test 7b extended) + 1 skipped = 9 total entries. All synthetic tests pass. |
| `src/state/store.ts` | `'grid'` LoadStage block; `grid: ImagingGrid | null` state | ✓ VERIFIED | `grid` field in State (line 63), `initialState` (line 82). `runLoad` block at lines 108-141 calls `extractCoords` + `readGridGeometry` + `buildImagingGrid`. Imaging file with null grid → `stage: "error"` (not silent). |
| `src/ui/GridDiagnosticsPanel.tsx` | Inline expandable diagnostics panel with all 6 required testids | ✓ VERIFIED | All 6 required testids present: `grid-panel`, `grid-summary-line`, `grid-expand-toggle`, `grid-diagnostics-table`, `grid-not-imaging-notice`, `grid-anomaly-warning`. No `#b71c1c` (error red) anywhere. |
| `src/reader/types.ts` | `LoadStage` union includes `"grid"` | ✓ VERIFIED | Line 81: `"grid"` between `"metadata"` and `"ready"`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scanCoords.ts` | `reader.spectrumMetadata.scans` | `getChild()` bulk column read | ✓ WIRED | `getScans()` at line 79; `scans.getChild(IMS_POS_X_COL)` at line 104. |
| `scanCoords.ts` | `reader.store.fileIndex.metadata.imaging` | discovery-block geometry read | ✓ WIRED | `fromDiscoveryBlock()` reads `.store?.fileIndex?.metadata` at line 256. |
| `store.ts` | `scanCoords.ts` + `imaging/grid.ts` | `extractCoords`/`readGridGeometry`/`buildImagingGrid` in the grid stage | ✓ WIRED | All three functions imported (lines 11-12); called at lines 112-115. |
| `App.tsx` | `GridDiagnosticsPanel.tsx` | mounted below `CapabilitiesPanel` in the left aside | ✓ WIRED | Imported line 8; rendered line 76; `"grid"` in loading flag line 19. |
| `GridDiagnosticsPanel.tsx` | `store.grid` | `useStore` selector | ✓ WIRED | Line 34: `useStore((s) => s.grid)`. Line 35: `useStore((s) => s.capabilities)`. |
| `imaging/grid.ts` | `imaging/types.ts` | `import type { ImagingGrid, GridGeometry, GridDiagnostics, CoordSourceStrategy }` | ✓ WIRED | Lines 7-12. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `GridDiagnosticsPanel.tsx` | `grid` (ImagingGrid) | `store.ts` → `buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy)` | Derived from Arrow column reads in `extractCoords()` on the real reader | ✓ FLOWING |
| `GridDiagnosticsPanel.tsx` | `capabilities.isImaging` | `store.ts` → `computeCapabilities(reader, manifest)` | Real reader probe via `probeIsImaging()` | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (76 tests, 1 skip) | `npm test -- --run` | 76 passed, 1 skipped (PXD001283 unlock) | ✓ PASS |
| Production build (tsc + vite) | `npm run build` | Built in 1.02s; pre-existing WASM chunk-size warning only | ✓ PASS |
| mzpeakts import boundary | `grep -rl "from 'mzpeakts'" src/` | Returns only `src/reader/openUrl.ts` | ✓ PASS |
| No bigint in imaging layer | `grep -rn "bigint" src/imaging/` | Only in comments (not runtime code) | ✓ PASS |
| grid key formula | grep `y0 \* width + x0` in `grid.ts` | Line 116: `y0 * width + x0` (row-major, correct) | ✓ PASS |
| Non-imaging notice guard | grep `isImaging` in `GridDiagnosticsPanel.tsx` | Line 43: `grid === null && capabilities.isImaging === false` | ✓ PASS |
| Imaging grid-build failure surfaces error | grep `stage: "error"` in `store.ts` | Lines 129-138: named error set when `grid === null` on imaging file | ✓ PASS |

---

### Probe Execution

Step 7c: SKIPPED — no conventional `scripts/*/tests/probe-*.sh` files exist in this project. Phase does not declare probe-based verification in plan frontmatter.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IMG-01 | 02-01, 02-03 | Per-spectrum x/y coord reconstruction via swappable CoordSource chain; promoted-columns primary; Int64/UInt32; source_index join | ✓ SATISFIED | `extractCoords()` in `scanCoords.ts`; `store.ts` grid stage; 13 scanCoords tests pass |
| IMG-02 | 02-02, 02-03 | Grid geometry: declared-extent-wins, presence mask, coord-to-spectrum lookup, coordinate_base normalization, pixel aspect | ✓ SATISFIED | `buildImagingGrid()` in `grid.ts`; sparse Map + Uint8Array; `grid.test.ts` Tests 1-5 |
| IMG-03 | 02-02, 02-03 | Grid diagnostics: dims, fill ratio, missing/duplicate/oob pixels, discovery disagreement surfaced in UI | ✓ SATISFIED | `GridDiagnostics` struct with all fields; `GridDiagnosticsPanel.tsx` expandable table |

**Note on `oobCount` in UI:** `GridDiagnostics.oobCount` field is computed in `grid.ts` and typed in `types.ts`, but `GridDiagnosticsPanel.tsx` does not render it as a separate row. The field is available to Phase 3 consumers. Codex raised this finding in round2; the operator accepted it as part of the final adjudication (the field exists in the data model; surfacing it in the panel is a UX enhancement). This is a WARNING, not a BLOCKER — `oobCount` data exists but is not user-visible yet.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/imaging/grid.ts` | 66-67 | Fractional declared dimensions are floored (`Math.floor`) rather than rejected | Info | A malformed `pixelCount: {x: 5.9, y: 4.1}` silently becomes 5×4 instead of being diagnosed. Operator accepted this behavior in the Codex adjudication. Not a blocker for Phase 2 goal. |
| `src/reader/scanCoords.ts` | 111-129 | When `source_index` column is absent, falls back to row-index with `console.warn` | Info | Can produce plausible-but-wrong spectrum mappings for non-conformant scan tables. Warning is emitted; accepted in adjudication as diagnosable. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-2 modified file.

---

### PROC-01 Gate Assessment

The Codex adversarial review logs are present (gitignored per project convention):
- `02-CODEX-ROUND1.log` (7403 bytes): original verdict `accept-with-revisions`
- `02-CODEX-ROUND2.log` (3321 bytes): verdict `reject`

Three gap-closure passes addressed the round-2 reject findings (commits `bbfb5e5`, `59113f1`, `11ee63a`). Operator approved the final state via commit `ffa58a5` ("docs(02-04): record operator approval — Phase 2 PROC-01 gate closed"). The final round-2 Codex log reflects the pre-fix state; the operator chose not to re-run Codex after the fixes. This is within PROC-01 boundaries (operator adjudicates; escalation was fulfilled).

The ROADMAP correctly shows Phase 2 as completed (4/4 plans, 2026-06-03).

---

### Human Verification Required

#### 1. Imaging File Grid Panel — Visual Rendering and Interaction

**Test:** Open an imaging `.mzpeak` file in the browser (via `npm run preview`). Observe the Grid section in the left panel.
**Expected:** Compact summary line shows `Grid: {W}×{H} — {filled}/{total} px filled ({pct}%)` with `×` separator and thousands grouping. Clicking expands to show all 8 rows (Dimensions, Fill, Spectra, Missing, Duplicates, Pixel size, Coord source, Discovery check). For sparse files, the anomaly indicator (amber `⚠`) and `#8a6d00` color appear.
**Why human:** GridDiagnosticsPanel rendering and expand interaction cannot be verified without a browser; automated tests use mocked store state. An imaging `.mzpeak` fixture other than PXD001283 is needed.

#### 2. Non-Imaging File Notice — Visual Rendering

**Test:** Open `test/data/small.mzpeak` (or the URL-loaded demo file) in the browser.
**Expected:** Grid section shows a single muted `Not imaging data — no spatial coordinates found` in `#888` color. No expand affordance, no table, no ErrorBanner anywhere on the page.
**Why human:** Visual color rendering and absence-of-elements must be confirmed in a live browser.

#### 3. Imaging Grid-Build Failure Path

**Test:** Load an imaging `.mzpeak` with deliberately empty or corrupt coordinate columns.
**Expected:** App surfaces a named error in the ErrorBanner ("Imaging file detected but spatial pixel grid could not be reconstructed…"), never a silent ready state with an empty/missing Grid panel.
**Why human:** No fixture with corrupt-coords-in-imaging-file exists in the test suite; the `store.test.ts` mocks the happy path.

---

### Gaps Summary

No blocking gaps. All 5 ROADMAP success criteria are verified in the codebase. The test suite passes (76/77; 1 skipped PXD unlock as expected). The build is clean. Import boundaries hold.

**One warning item** (not a BLOCKER): `oobCount` is computed in the grid model but not surfaced in `GridDiagnosticsPanel.tsx`. This was raised by Codex round-2 and accepted by the operator in the final adjudication. It does not block the Phase 2 goal (the data exists; visualization is deferred).

**Status rationale:** `human_needed` because 3 items require browser confirmation — live rendering of the GridDiagnosticsPanel, visual confirmation of the non-imaging notice, and the error-path behavior. All automated checks pass.

---

_Verified: 2026-06-03T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
