---
phase: 03-tic-image-pixel-spectrum-round-trip
plan: 02
subsystem: reader-signal-routing
tags: [DATA-03, SPEC-01, representation-routing, MS-1000525, imaging]
requires:
  - "src/reader/types.ts SpectrumRepresentation / SpectrumArrays (shipped 01-x)"
  - "src/reader/fileMeta.ts spectrumMeta (shipped, exposes .representation)"
  - "src/reader/arrays.ts getSpectrumArrays (existing try-order reader)"
provides:
  - "src/reader/arrays.ts getSpectrumArraysFor(reader, index, representation) — deterministic per-MS:1000525 source routing"
  - "src/state/store.ts selectSpectrum routes every read via spectrumMeta(...).representation"
affects:
  - "plan 03-03 pixel-click reuses selectSpectrum unchanged → correct profile/centroid file per pixel"
tech-stack:
  added: []
  patterns:
    - "Explicit representation routing over incidental try-order (DATA-03 / IMAGING-SPEC C6)"
    - "Fail-loud named error on empty routed source (Pitfall 7) — never silent zeros"
key-files:
  created: []
  modified:
    - src/reader/arrays.ts
    - src/reader/arrays.test.ts
    - src/state/store.ts
    - src/state/store.test.ts
decisions:
  - "D-07 implemented as source-array selection by representation (per RESEARCH A2 / objective interpretation note), not deeper per-file handle isolation — deferred unless Codex/operator requires."
  - "Dropped now-unused getSpectrumArrays import from store.ts to satisfy noUnusedLocals; legacy export retained in arrays.ts for non-imaging callers."
metrics:
  duration: ~6m
  completed: 2026-06-03
---

# Phase 3 Plan 02: Representation-Routed Signal Reads (DATA-03) Summary

Per-spectrum signal reads now route to their source file deterministically by `MS:1000525` representation (profile → `spectra_data`, centroid → `spectra_peaks`) through a new `getSpectrumArraysFor(reader, index, representation)`, with the store's single `selectSpectrum` action driving the choice via `spectrumMeta(...).representation` — so the upcoming pixel-click (03-03) reads the right file for both profile and centroid imaging files, and an empty routed source fails loud instead of rendering a silent blank.

## What Was Built

**Task 1 — `getSpectrumArraysFor` + DATA-03 mock-reader tests (TDD)** (commit `cd982a9`)
- Refactored `src/reader/arrays.ts`: extracted the existing dataArrays branch into private `fromDataArrays(spectrum, index)` and the centroid branch into private `fromCentroids(spectrum, index)`, preserving the exact length-mismatch guard and Float64/Float32 dtype copies.
- Added `getSpectrumArraysFor(reader, index, representation)`: `"centroid"` → `fromCentroids` (named throw `Spectrum N: centroid representation but spectra_peaks has no rows` when zero rows); `"profile"` or `null` → `fromDataArrays` (profile-default). Throws a distinct `No spectrum at index N` when `getSpectrum` is falsy.
- Kept legacy `getSpectrumArrays` exported with its current try-order for non-imaging callers.
- Added a `getSpectrumArraysFor — DATA-03 representation routing` describe block in `arrays.test.ts` using a hand-built mock reader whose spectrum carries BOTH `dataArrays` and `centroids` with distinguishable m/z, proving each representation selects the correct source (Tests 1–4 + a missing-spectrum case). Existing point + chunked fixture describe blocks unchanged (Test 5).

**Task 2 — Rewire `store.selectSpectrum` to route by representation** (commit `b679832`)
- `selectSpectrum` now derives `const meta = spectrumMeta(reader, index)` and calls `getSpectrumArraysFor(reader, index, meta.representation)`; signature unchanged (`(index: number) => Promise<void>`); `if (!reader) return` guard and `classifyError` error path retained; `runLoad`'s auto-select-first (`selectSpectrum(0)`) routes correctly for free.
- Extended `store.test.ts` reader-boundary `vi.mock`s with `spectrumMeta` and `getSpectrumArraysFor` so the rewired action resolves offline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dropped unused `getSpectrumArrays` import in store.ts**
- **Found during:** Task 2 type-check.
- **Issue:** The plan said keep both imports, but `tsconfig.app.json`/`tsconfig.node.json` set `noUnusedLocals: true`. With `selectSpectrum` now calling only `getSpectrumArraysFor`, retaining the `getSpectrumArrays` import fails `tsc --noEmit` — the plan's own acceptance gate.
- **Fix:** Removed `getSpectrumArrays` from the store import (left an explanatory comment). The legacy export still exists in `arrays.ts` for non-imaging callers.
- **Files modified:** `src/state/store.ts`
- **Commit:** `b679832`

**2. [Rule 3 - Blocking] Extended store.test.ts reader-boundary mocks**
- **Found during:** Task 2 verification (`npx vitest run src/state`).
- **Issue:** `store.test.ts` mocks `../reader/fileMeta` and `../reader/arrays`. The rewired `selectSpectrum` (called by `runLoad`'s auto-select) now needs `spectrumMeta` and `getSpectrumArraysFor`, which the mocks did not export — they resolved to `undefined`, throwing and driving 4 staged-progress tests into the `error` state.
- **Fix:** Added `spectrumMeta` (returns `representation: "profile"`) to the fileMeta mock and `getSpectrumArraysFor` to the arrays mock. `src/state/store.test.ts` was not in the plan's `files_modified` but the mock update is a required consequence of the rewire.
- **Files modified:** `src/state/store.test.ts`
- **Commit:** `b679832`

## Verification Evidence

- `npx vitest run src/reader/arrays.test.ts` → 15 passed (5 new routing/error tests + 10 legacy fixture tests).
- `npx tsc --noEmit` → exit 0.
- `npx vitest run src/state` → 6 passed (store.test + store.integration.test).
- `npx vitest run` (full suite) → 9 files, 81 passed, 1 skipped.
- grep confirms: `arrays.ts` exports both functions; centroid branch on `representation === "centroid"`; named throw mentions `spectra_peaks`; `store.ts selectSpectrum` calls `spectrumMeta` + `getSpectrumArraysFor` with `meta.representation`; signature `(index: number) => Promise<void>` unchanged.

## Threat Model Coverage

- **T-03-04 (wrong-source read):** Mitigated — explicit representation routing prevents a centroid spectrum being read as profile zeros; `null` → documented profile default.
- **T-03-05 (empty source as zeros):** Mitigated — `fromCentroids` throws a named `spectra_peaks has no rows` error (Pitfall 7); proven by Test 4.
- **T-03-06 (length-mismatched arrays):** Mitigated — `fromDataArrays` retains the length-mismatch guard.
- **T-03-SC (installs):** N/A — no new packages this plan.

## Known Stubs

None. Both routed sources reconstruct real typed arrays; no hardcoded empty values or placeholder UI introduced.

## Environment Note (non-code, not committed)

The worktree was provisioned without `node_modules` or the `vendor/mzpeakts` submodule checkout. To run the test/type-check gates, dependency entries were symlinked from the main repo's `node_modules` and the already-built `mzpeakts` lib was copied into the worktree's (gitignored / submodule-path) `vendor/mzpeakts/lib`. This is local execution scaffolding only — `node_modules` is gitignored and `vendor/mzpeakts` is a submodule gitlink, so nothing of this appears in the commits. No source or dependency manifest was changed.

## Self-Check: PASSED
