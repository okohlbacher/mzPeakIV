---
phase: 02-imaging-grid-reconstruction-the-gate
plan: 02
subsystem: imaging
tags: [imaging, grid, geometry, diagnostics, sparse, tdd]
requires:
  - "src/reader/scanCoords.ts (plan 02-01): supplies plain {x,y}[] coords + GridGeometry at runtime (consumed only by the skipped PXD unlock test here)"
provides:
  - "src/imaging/types.ts: ImagingGrid / GridGeometry / GridDiagnostics — cross-phase contract for Phase 3 TIC builder"
  - "src/imaging/grid.ts: buildImagingGrid() pure sparse-grid transform"
affects:
  - "Plan 02-03 (store wiring) and Phase 3 (TIC) consume ImagingGrid.width/height/coordToSpectrumIndex/presenceMask"
tech-stack:
  added: []
  patterns:
    - "Pure transform mirroring src/reader/arrays.ts: named export, imports only ./types, no Arrow/bigint/mzpeakts"
    - "Sparse grid model: Map<key,spectrumIndex> + dense Uint8Array presence mask; key = x0*width + y0 (0-based)"
    - "Synthetic plain-array Vitest fixtures (no reader mock, no binary) for a pure transform"
key-files:
  created:
    - src/imaging/types.ts
    - src/imaging/grid.ts
    - src/imaging/grid.test.ts
  modified: []
decisions:
  - "Declared extent (IMS:1000042/43) WINS over observed max coordinate (D-11/C4); extentSource flags which path ran"
  - "coordinateBase READ from geometry (default 1), never hard-coded -1 (D-10/C3) — proven by base-0 Test 5"
  - "Duplicate coords keep the FIRST writer and increment duplicateCount; never silently overwrite"
  - "50,000,000-cell DoS cap (T-02-02-OOM): refuse + console.warn + return null rather than allocate"
  - "Out-of-range coords bounds-checked before indexing (T-02-02-OOB): skipped, counted as missing, never written"
  - "PXD unlock test uses a path-in-variable dynamic import so tsc -b passes while scanCoords.ts (02-01) is unmerged in this worktree"
metrics:
  duration: ~5m
  completed: 2026-06-03
---

# Phase 2 Plan 02: Imaging Grid Builder Summary

Pure, Arrow-free `buildImagingGrid()` that turns plain `{x,y}[]` coords + a geometry POJO into a sparse, declared-extent-wins, base-aware `ImagingGrid` with full fill/duplicate/missing/disagreement diagnostics — proven by 7 synthetic tests plus a wired-and-skipping PXD001283 unlock test.

## What Was Built

- **`src/imaging/types.ts`** — the cross-phase contract: `ImagingGrid`, `GridGeometry`, `GridDiagnostics`, `CoordSourceStrategy`. Plain `export interface`s, CONTRACT header, no runtime code, no Arrow/bigint/mzpeakts. `pixelSizeUm` uses `| null` for absent-but-valid.
- **`src/imaging/grid.ts`** — `buildImagingGrid(coords, spectrumIndices, geometry, coordSourceStrategy) → ImagingGrid | null`. Reads `coordinateBase` from geometry; computes observed extent; applies declared-extent-wins; allocates a `Map<number,number>` + `Uint8Array(width*height)` presence mask (sparse model, never a dense spectrum array); bounds-checks every coord before writing; counts duplicates (first-writer-wins); builds diagnostics including a human-readable `discoveryDisagreement` note. Returns `null` for empty coords (non-imaging valid state) and for over-cap extents (DoS guard).
- **`src/imaging/grid.test.ts`** — Tests 1–7 synthetic; Test 8 PXD001283 unlock (`test.skipIf(!existsSync(...))`).

## How It Was Verified

- `npx vitest run src/imaging/grid.test.ts` → 7 passed, 1 skipped.
- Full suite `npx vitest run` → 58 passed, 1 skipped (no pre-existing test broken).
- `npx tsc --noEmit` and `tsc -b` → exit 0.
- `npm run build` → succeeds (after initializing the `vendor/mzpeakts` submodule — see Deviations).
- `grep -rl "from '../reader'" src/imaging/` → empty; `grep -rl "from 'mzpeakts'" src/imaging/` → empty. The imaging layer imports only `./types`.

## TDD Gate Compliance

- RED commit `d989cff` — `test(02-02): failing synthetic-grid tests + PXD unlock test` (failed: `Cannot find module './grid'`).
- GREEN commit `ec33f0e` — `feat(02-02): buildImagingGrid sparse model + diagnostics (IMG-02, IMG-03)` (all non-skipped tests pass).
- No REFACTOR commit — implementation was clean on first GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vendor/mzpeakts` submodule not checked out in the worktree**
- **Found during:** final `npm run build` verification.
- **Issue:** `npm run build` (vite/rolldown) failed with `Could not load vendor/mzpeakts/lib/src/index.ts` — the git submodule was an empty directory in this fresh worktree. Pre-existing condition, unrelated to plan 02-02 (no imaging code imports the reader). `tsc -b` already passed.
- **Fix:** `git submodule update --init vendor/mzpeakts` (checked out pinned commit `a87abe3`). No package install; no source change to vendored code. The submodule pointer in the parent repo is unchanged, so nothing is staged for commit.
- **Files modified:** none committed (submodule working-tree only).
- **Commit:** n/a (no repo change).

**2. [Rule 3 - Blocking] PXD unlock test broke `tsc -b` via static dynamic-import resolution**
- **Found during:** `npm run build` (`tsc -b` stage).
- **Issue:** Test 8 dynamically imports `../reader/scanCoords`, which is created by parallel plan 02-01 and not present in this worktree. `tsc -b` (project mode) statically resolves the literal import path and errored `TS2307: Cannot find module '../reader/scanCoords'`. The test still auto-skips at runtime, but the type build failed.
- **Fix:** moved the module path into a `const scanCoordsPath` variable and added `/* @vite-ignore */`, so TS cannot statically resolve it. Runtime behavior is identical (the body only runs when the PXD file exists). Plan-faithful: the test still drives the real reader path once both the file and 02-01 land.
- **Files modified:** `src/imaging/grid.test.ts`.
- **Commit:** folded into GREEN `ec33f0e`.

## Threat Model Outcome

- **T-02-02-OOM (DoS, mitigate):** implemented — `MAX_CELLS = 50_000_000` cap; `width*height` over cap → `console.warn` + `return null`, no allocation.
- **T-02-02-OOB (Tampering, mitigate):** implemented — every coord bounds-checked (`0 ≤ x0 < width && 0 ≤ y0 < height`) before indexing; out-of-range skipped and counted, never written. Exercised by Test 4.
- **T-02-02-SC (Supply chain, accept):** honored — zero package installs.

## Known Stubs

None. `buildImagingGrid` is fully implemented; the only deferred surface is the PXD001283 unlock test, which is intentionally `test.skipIf`-gated on operator-supplied data (D-01) and will activate automatically when both `test/data/PXD001283.mzpeak` and plan 02-01's `scanCoords.ts` are present.

## Notes for Downstream

- Phase 3 / plan 02-03 should import `ImagingGrid` from `src/imaging/types.ts` and treat `coordToSpectrumIndex` (sparse) + `presenceMask` (dense bool) as the stable lookup contract. Do not assume a dense spectrum-index array exists.
- `GridGeometry` here is structurally identical to what 02-01's `readGridGeometry` returns; the imaging layer owns the type, the reader produces a matching POJO.

## Self-Check: PASSED

- All created files present (`types.ts`, `grid.ts`, `grid.test.ts`, `02-02-SUMMARY.md`).
- Both commits present in git log (`d989cff` RED, `ec33f0e` GREEN).
