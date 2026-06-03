---
phase: 02-imaging-grid-reconstruction-the-gate
plan: 01
subsystem: reader
tags: [imaging, coordinates, reader-boundary, tdd, IMG-01]
requires:
  - "src/reader/openUrl.ts (opaque Reader type)"
  - "src/reader/stats.ts (probeIsImaging access pattern, IMS_POS_* constants)"
  - "reader.spectrumMetadata.scans (Arrow Struct vector + source_index child)"
  - "reader.store.fileIndex.metadata.imaging (discovery block)"
provides:
  - "extractCoords(reader) -> CoordResult | null"
  - "readGridGeometry(reader) -> GridGeometry | null"
  - "CoordResult / GridGeometry plain-POJO types"
affects:
  - "src/imaging/ grid builder (Phase 2, plan 02-02) consumes CoordResult + GridGeometry"
tech-stack:
  added: []
  patterns:
    - "CoordSource strategy chain (D-16): promoted-columns -> cv-params -> id-parse"
    - "Bulk getChild() column read + source_index join (Pattern 1, Pitfall 5)"
    - "Number() conversion at the reader boundary — no bigint/Arrow leak (D-08/Pitfall 3)"
    - "Geometry source order discovery-block -> run-params -> null (Pitfall 1)"
key-files:
  created:
    - "src/reader/scanCoords.ts"
    - "src/reader/scanCoords.test.ts"
  modified: []
decisions:
  - "Colocated readGridGeometry in scanCoords.ts (D-07 / Open Question 2 RESOLVED) — one reader-extension file"
  - "Geometry discovery-block WINS over run-params (the only run-level source the vendored reader reliably surfaces; Pitfall 1)"
  - "id-parse uses bounded /x=(\\d{1,9})/ regex (non-backtracking) to guard ReDoS (T-02-01-RD)"
metrics:
  duration: "~4 min"
  completed: "2026-06-03T18:32:01Z"
  tasks: 2
  files: 2
---

# Phase 2 Plan 01: scanCoords — CoordSource chain + run-geometry reader Summary

Reader-boundary per-spectrum coordinate extractor (`extractCoords`) and run-level grid-geometry reader (`readGridGeometry`) — the productionized, bulk-read generalization of `probeIsImaging`, behind a swappable three-strategy CoordSource chain that accepts Int64/UInt32, joins scans to spectra on `source_index`, and recovers geometry despite the vendored reader dropping `ms_run.parameters` — with no bigint/Arrow leak above `src/reader/`.

## What Was Built

`src/reader/scanCoords.ts` (340 lines) implementing IMG-01:

- **`extractCoords(reader) -> CoordResult | null`** — the `?? ` strategy chain (D-16):
  - **Strategy 1 (promoted-columns, PRIMARY):** bulk `scans.getChild(IMS_1000050_position_x)` / `..._y` + `scans.getChild("source_index")`; tight numeric loop over `scans.length`; `Number()` conversion (exact for Int64 ≤ 2^53, no-op for UInt32 — D-15); null cells skipped; spectrum index keyed on `source_index`, NOT row position (Pattern 1).
  - **Strategy 2 (cv-params, FALLBACK):** per-record `sm.get(i)` loop reading `scan.getParamByAccession("IMS:1000050"/"IMS:1000051")`.
  - **Strategy 3 (id-parse, LAST RESORT):** bounded non-backtracking `x=(\d{1,9})` / `y=(\d{1,9})` regex over the spectrum `id`; unparseable/adversarial ids skipped, never throws (T-02-01-RD).
- **`readGridGeometry(reader) -> GridGeometry | null`** — source order (Pitfall 1 / C4): (a) `metadata.imaging` discovery block (`pixel_count`, `pixel_size_um`, `coordinate_base`); (b) raw `run` keyValueMetadata JSON `parameters` by accession (IMS:1000042/43/46/47); (c) null. Tags `geometrySource`. `coordinateBase` defaults to 1 when absent (D-10).
- Exported plain-POJO types `CoordResult` and `GridGeometry` — only `number`/POJO cross the boundary (D-08).

`src/reader/scanCoords.test.ts` (319 lines, 13 tests) — Reader-shaped POJO mocks extending the `stats.test.ts` pattern (no real Arrow, no WASM). Covers all 9 plan-mandated behaviors plus 4 edge cases (null-cell skip, missing-column fallthrough, discovery-wins-over-run-params, coordinateBase default).

## How to Verify

- `npx vitest run src/reader/scanCoords.test.ts` → 13 passed.
- `npx vitest run` → 64 passed (7 files; all prior tests still green).
- `npx tsc --noEmit` → exit 0.
- `npm run build` → built (pre-existing WASM chunk-size warning only).
- `npm run lint` → clean.
- `grep -rl "from 'mzpeakts'" src/` → only `src/reader/openUrl.ts` (boundary held).
- `grep -q source_index src/reader/scanCoords.ts` → present (Test 3 asserts out-of-order join).
- No `bigint` types exported — `bigint` appears only in a `typeof` guard and comments.

## TDD Gate Compliance

- RED commit `c2173f9` — `test(02-01)`: 13 tests written first, failed (module did not exist).
- GREEN commit `72354c3` — `feat(02-01)`: implementation, all tests pass.
- No REFACTOR commit: implementation was minimal and clean on first GREEN; no cleanup warranted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built `mzpeakts` artifacts absent in the worktree**
- **Found during:** Pre-RED baseline run (existing `stats.test.ts` failed to import `mzpeakts`).
- **Issue:** This git worktree did not have the `vendor/mzpeakts` submodule checked out or `node_modules/mzpeakts` populated — `import { MzPeakReader } from "mzpeakts"` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`. The submodule is built/linked only in the main checkout.
- **Fix:** Copied the already-built submodule (`vendor/mzpeakts`) and the installed `node_modules/mzpeakts` from the main checkout into the worktree. This is the same pinned, Phase-1-audited artifact — NOT a package install (no registry fetch, no new dependency). The artifacts live outside this branch's tracked files; nothing was committed for this fix.
- **Files modified:** none committed (build-environment population only).
- **Commit:** n/a (untracked vendor/node_modules).

### Notes
- `readGridGeometry` colocated in `scanCoords.ts` per D-07 (Open Question 2 RESOLVED in 02-RESEARCH) rather than a separate `runParams.ts` — keeps the reader-extension surface to one new file.

## Known Stubs

None. Both functions are fully wired against the real reader access paths (verified against vendored `metadata.ts`); the per-strategy fallbacks and geometry sources all have live implementations. The PXD001283 real-Arrow validation is covered by a future `skipIf` unlock test (plan 02-02, D-01) and is out of scope here.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The single file-metadata→parser boundary is the one already declared in the plan's threat model; the id-parse ReDoS mitigation (T-02-01-RD) and the bigint-leak mitigation (T-02-01-LEAK) are both implemented and tested.
