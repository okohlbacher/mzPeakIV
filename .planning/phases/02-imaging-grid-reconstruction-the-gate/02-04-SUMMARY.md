---
phase: 02-imaging-grid-reconstruction-the-gate
plan: 04
subsystem: gate
tags: [codex-review, proc-01, verification, phase-gate]
requires:
  - "02-01-SUMMARY.md (scanCoords reader)"
  - "02-02-SUMMARY.md (imaging grid builder)"
  - "02-03-SUMMARY.md (grid stage + GridDiagnosticsPanel)"
provides:
  - "PROC-01 Codex adversarial review logs (round1 + round2)"
  - "Phase-2 verification sweep results"
  - "Operator adjudication request for round2 reject verdict"
affects:
  - "Phase 3 planning is blocked on operator adjudication of round2 reject"
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - ".planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND1.log"
    - ".planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND2.log"
    - ".planning/phases/02-imaging-grid-reconstruction-the-gate/02-04-SUMMARY.md"
  modified: []
decisions:
  - "Phase-2 round2 verdict is REJECT — operator must adjudicate: fix-and-re-review or accept the noted risk before Phase 3"
  - "Round1 verdict is ACCEPT-WITH-REVISIONS — findings are annotated below for operator review"
metrics:
  duration: "~12 min"
  completed: "2026-06-03"
  tasks: 2
  files: 2
---

# Phase 2 Plan 04: PROC-01 Codex Gate Summary

Full Phase-2 verification sweep (green — all 5 checks pass) plus PROC-01 Codex adversarial review: round1 plan bundle returned `accept-with-revisions`; round2 diff returned `reject`. Per PROC-01, a `reject` verdict is escalated to the operator for adjudication.

## Task 1: Phase-2 Verification Sweep

### Command Results

| Command | Result |
|---------|--------|
| `npm run lint` | PASS (exit 0, no warnings) |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm test` | PASS — 73 passed, 1 skipped (PXD001283 unlock test, expected) |
| `npm run build` | PASS — built in 955ms (pre-existing WASM chunk-size warning only) |
| `npx playwright test e2e/` | PASS — 5/5 tests passed (14.6s) |

### Phase-2 Success Criteria Mapping

| Criterion | Satisfied by |
|-----------|-------------|
| 1. CoordSource chain (promoted-columns primary, Int64/UInt32, source_index join, strategy log) | `src/reader/scanCoords.ts` (IMG-01); `scanCoords.test.ts` Tests 1–6 (promoted cols, cv-params, id-parse, Int64 bigint guard, source_index join, fallback chain) |
| 2. Grid geometry (declared-extent-wins, presence mask, coord-to-spectrum lookup, coordinate_base, pixel aspect) | `src/imaging/grid.ts` + `src/imaging/types.ts` (IMG-02); `grid.test.ts` Tests 1–5 (dense/sparse, declared-extent-wins, disagreement, base-0) |
| 3. Grid-diagnostics panel (dims, fill ratio, missing/duplicate, discovery disagreement) | `src/ui/GridDiagnosticsPanel.tsx` + store `grid` stage (IMG-03); `store.test.ts` imaging path + `grid.test.ts` Test 4 (anomaly) |
| 4. Synthetic known-grid validation (PXD001283 unlock test present + auto-skipping) | `src/imaging/grid.test.ts` Test 8 (skipIf guard; PXD file absent — expected D-01) |
| 5. Non-imaging file reported distinctly as "not imaging data" (not an error) | `store.test.ts` non-imaging path asserts `grid===null, error===null`; `GridDiagnosticsPanel` renders muted notice |

### IMG Requirement → Test Mapping

| Requirement | Tests |
|-------------|-------|
| IMG-01 | `scanCoords.test.ts`: "promoted columns (Strategy 1)" (Tests 1–4), "cv-params (Strategy 2)", "id-parse (Strategy 3)", "no coordinates"; `store.test.ts`: "imaging file passes through 'grid' stage" |
| IMG-02 | `grid.test.ts`: "dense 5x4 (Test 1)", "sparse 5x4 (Test 2)", "declared-extent-wins (Test 3)", "coordinateBase=0 (Test 5)"; `store.test.ts` imaging path grid non-null assertion |
| IMG-03 | `grid.test.ts`: "extent disagreement (Test 4)", "duplicate coord (Test 6)"; `store.test.ts` non-imaging `grid===null, error===null` |

### Boundary Re-assertion

- `grep -rl "from 'mzpeakts'" src/` returns ONLY `src/reader/openUrl.ts` — boundary HELD.
- `grep -rn "bigint" src/reader/scanCoords.ts` — `bigint` appears ONLY in comments and a single `typeof` guard (line 62: `if (typeof value === "bigint") return Number(value)`), never as an exported type — CLEAN.
- `src/imaging/` files have NO static imports of `../reader` or `mzpeakts` in production code — boundary ONE-WAY. (The PXD unlock test uses a dynamic import behind a `skipIf` guard; Codex flags this as a boundary inconsistency — see round2 findings below.)

---

## Task 2: PROC-01 Codex Reviews

### Phase-Start SHA

`250e312491dd9054bca1594e05d62ee64e6b4a0a`
(commit: "docs(02): create phase plan — 4 plans, 3 waves, checker PASS" — the last commit before Phase-2 implementation began)

### Round 1 — Plan Bundle Adversarial Review

**Log:** `.planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND1.log`

**Verdict: `accept-with-revisions`**

Key findings from round1 (plan-level; most were addressed during implementation or are pre-accepted deferred risks):

- Grid index formula `key = x0 * width + y0` is likely wrong (row-major convention should be `y0 * width + x0`). **This was raised as a plan defect and is CONFIRMED as a real bug in round2.**
- Plan 02's `coords.length !== spectrumIndices.length` case is unspecified — implementation uses `Math.min` silently.
- Plan 03's non-imaging notice triggers on any `grid === null`, not specifically `grid===null AND !isImaging` — confirmed as a real bug in round2.
- Plan 04's Playwright gate is noted in the verify command but absent from the formal acceptance criteria verify line — addressed: Playwright was run and passed (5/5).
- Other findings (source_index ambiguity, CV-param shape, id-parse format examples, Unicode in UI) are lower-severity commentary or were implemented as specified.

### Round 2 — Phase Diff Adversarial Review

**Log:** `.planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND2.log`

**Verdict: `reject`**

**Per PROC-01: a `reject` verdict is escalated to the operator for adjudication.**

Codex identified 7 concrete defects in the implemented diff:

**CRITICAL — correctness-breaking:**

1. **Grid key formula wrong** (`src/imaging/grid.ts:96`): `key = x0 * width + y0` produces keys out-of-bounds for the `Uint8Array(width*height)` presence mask on wide grids (e.g. PXD001283 260x134 → max key 67473 >> 34840). Silent typed-array writes past length mean `presenceMask` is incomplete while `filledCount` reports success. Correct formula: `y0 * width + x0`.

2. **PXD unlock test wired to wrong API** (`src/imaging/grid.test.ts:230,240`): `extractCoords` returns `CoordResult` (not `{x,y}[]`), so the test would fail with `coords.map is not a function` when the PXD file exists. The unlock gate would not validate anything.

3. **PXD unlock test discards `source_index` join** (`src/imaging/grid.test.ts:244`): synthesizes `spectrumIndices = coords.map((_, i) => i)` instead of using the real join from `CoordResult` — would not exercise the Phase-2 correctness requirement even if the type were fixed.

**HIGH — behavior/contract issues:**

4. **`GridDiagnosticsPanel` non-imaging notice fires on any `grid===null`** (`src/ui/GridDiagnosticsPanel.tsx:40`): an imaging file where grid build returns null (e.g. over-cap, extraction failure) would falsely display "Not imaging data — no spatial coordinates found", hiding real errors.

5. **`coords.length !== spectrumIndices.length` handled by silent `Math.min` truncation** (`src/imaging/grid.ts:87,123`): diagnostics still report `spectrumCount: coords.length` while the builder processed fewer entries; a broken reader-boundary join is hidden as missing pixels.

6. **No `Number.isSafeInteger` / positive-integer validation on coordinates/geometry** (`src/reader/scanCoords.ts:60`, `src/imaging/grid.ts:73`): unsafe integers, floats, Infinity, NaN, and negative extents bypass the stated DoS/OOB mitigations.

7. **`scanCoords` falls back to row index when `source_index` is absent** (`src/reader/scanCoords.ts:103`): the primary correctness requirement is joining on `source_index`; a silent row-index fallback can produce plausible-but-wrong mappings for non-conforming scan tables.

**Operator adjudication required:**

Per PROC-01, escalation on `reject`. The operator must choose one of:

- **Option A (Fix now before Phase 3):** Address the 3 critical + 4 high findings as a gap-closure pass. At minimum, fix the grid key formula (1), wire the PXD unlock test to `CoordResult` (2, 3), and guard the non-imaging notice on `capabilities.isImaging===false` (4). Then re-run round2 and record a new verdict.
- **Option B (Accept noted risk):** Document each finding as a known limitation, accept that Phase 3 will build on a grid with a proven-wrong key formula, and note that PXD001283 validation is deferred to a post-Phase-3 pass.

---

## Deviations from Plan

None — both Codex rounds ran as specified. The `reject` verdict is expected per PROC-01 (surfacing real defects is the harness's job).

## Self-Check

- FOUND: `.planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND1.log`
- FOUND: `.planning/phases/02-imaging-grid-reconstruction-the-gate/02-CODEX-ROUND2.log`
- Round1 verdict: `accept-with-revisions` (confirmed by grep)
- Round2 verdict: `reject` (confirmed by grep)
- All 5 Task 1 verification commands: PASS
- Phase-start SHA: `250e312491dd9054bca1594e05d62ee64e6b4a0a`

## Self-Check: PASSED

## Round-2 Gap Closure (Pass 1 — 2026-06-03)

Codex round-2 `reject` findings addressed in gap-closure commits:

**Fixed (Critical):**
- `grid.ts` key formula: `x0*width+y0` → `y0*width+x0` (row-major; old formula generated keys up to 67,473 on a 34,840-element array)
- `grid.test.ts` PXD unlock test: wired to `CoordResult` instead of raw `{x,y}[]`
- `GridDiagnosticsPanel`: non-imaging notice guards on `capabilities.isImaging===false`

**Fixed (High):**
- `grid.ts`: `Math.min` truncation now logs a console.warn
- `types.ts` + `grid.ts`: `oobCount` field tracks NaN/OOB coords separately from `missingCount`
- `grid.ts`: `Number.isFinite` guard before bounds check (NaN map key prevention)
- `store.integration.test.ts`: real `small.mzpeak` integration test for non-imaging path

## Round-2 Gap Closure (Pass 2 — still `reject`)

Remaining Codex round-2 findings after pass 1:
1. `scanCoords.ts`: `Number(bigint)` without `isSafeInteger` check
2. `scanCoords.ts`: row-index fallback when `source_index` absent (silent wrong mapping)
3. `scanCoords.ts`: `coordinate_base`-only discovery block silently discarded
4. `grid.ts`: geometry dimensions not validated as finite positive integers before allocation
5. `grid.ts`: fractional coordinates accepted (non-integer map keys/mask writes)
6. `grid.ts`: `spectrumCount: coords.length` inaccurate when lengths differ (should use `n`)
7. `store.ts`: imaging file with failed grid extraction reaches `ready` with `grid: null, error: null` (silent failure)
8. [Non-actionable] Key formula plan deviation noted (plan text was wrong; fix is correct)
9. [Non-actionable] PXD001283 real validation skipped (accepted per D-01 synthetic-fixtures decision)
10. [Non-actionable] Untracked vendor artifact reproducibility note (worktree environment issue)

Awaiting operator adjudication per PROC-01.

## Operator Adjudication — Final

**Verdict:** `approved` — operator accepted Codex round-2 `reject` after 3 gap-closure passes.

All substantive code defects addressed:
- Grid key formula (critical), PXD unlock test API, non-imaging notice guard
- NaN coordinate guard, oobCount field, source_index absent warning
- coordinate_base-only discovery block preservation
- Geometry dimension validation, fractional coord floor, spectrumCount accuracy
- Imaging grid-build failure surfaces as named error (not silent null)

Remaining Codex concerns acknowledged as non-code (ROADMAP tracking state, worktree vendor-artifact note).

Phase 2 is declared **closed**.
