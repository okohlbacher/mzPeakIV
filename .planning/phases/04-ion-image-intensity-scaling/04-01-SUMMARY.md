---
phase: "04-ion-image-intensity-scaling"
plan: 1
subsystem: "compute"
tags: [ion-image, pure-functions, unit-tests, tdd]
dependency_graph:
  requires: []
  provides:
    - "ppmToDa pure function (D-03 ppm→Da conversion)"
    - "buildIonImage pure aggregation function"
    - "computeIonImageStats pure stats function"
  affects:
    - src/state/store.ts (will import buildIonImage, computeIonImageStats, ppmToDa — Plan 03)
tech_stack:
  added: []
  patterns:
    - "Local structural interfaces (XicPointLike, XicLike) to keep compute/ above reader boundary"
    - "Number(point.index) as first op on XICPoint.index to convert bigint before Map.get"
    - "presenceMask[k] === 0 exclusion guard for absent-pixel stats"
key_files:
  created:
    - src/compute/ionImage.ts
    - src/compute/ionImage.test.ts
  modified: []
decisions:
  - "Separate computeIonImageStats as a sibling pure function (not inside buildIonImage) — cleaner API for store action"
  - "Return {0,0,0} when no present finite values found — not Infinity/-Infinity — matches D-11 safe UI requirement"
  - "Wrote test file first (RED), then implementation (GREEN) per TDD mandate"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-04T00:27:42Z"
  tasks: 2
  files: 2
---

# Phase 4 Plan 1: Ion Image Pure Compute Layer Summary

**One-liner:** Three pure functions — `ppmToDa`, `buildIonImage`, `computeIonImageStats` — with 17 vitest unit tests covering D-03 formula, C2 orientation, Pitfall 1 bigint boundary, and D-09 absent-pixel exclusion.

## What Was Built

Created two new files in `src/compute/`:

### `src/compute/ionImage.ts`

A near-clone of `src/compute/tic.ts` with three named exports:

1. **`ppmToDa(mz, ppm): number`** — Implements the D-03 formula `(mz * ppm) / 1e6`. No guards (input validation is the store action's responsibility).

2. **`buildIonImage(xic: XicLike, grid: ImagingGrid): Float32Array`** — Aggregates windowed XIC intensities per grid cell. Key implementation details:
   - Inverts `coordToSpectrumIndex` once into a `spectrumIndex → cell key` reverse map
   - Converts `point.index` via `Number()` as the **first** operation (Pitfall 1 — bigint→number before Map.get)
   - Applies `typeof v === "number" && Number.isFinite(v)` per-element guard (T-04-02)
   - Uses `key = y0*width+x0` by reusing the grid's inverted map — C2 mandatory, no flip
   - Does NOT filter m/z (reader already windowed the arrays — RESEARCH Pattern 1)

3. **`computeIonImageStats(values, grid)`** — Computes `{nonzeroCount, min, max}` over present cells only. Excludes absent cells (`presenceMask[k] === 0`) from all stats. Returns `{0,0,0}` when no present finite values exist (not Infinity/-Infinity).

Local `XicPointLike`/`XicLike` structural interfaces keep `src/compute/` free of any vendor import — the same boundary discipline as `tic.ts`.

### `src/compute/ionImage.test.ts`

17 vitest unit tests across four describe blocks:

| Block | Tests | Coverage |
|-------|-------|----------|
| `ppmToDa` | 5 | D-03 formula, zero inputs, symmetry |
| `buildIonImage — aggregation` | 5 | Dense 2×2 sum, output length, off-grid skip, non-finite guard, absent cell |
| `buildIonImage — bigint boundary` | 2 | BigInt(0)→cell 0, 4n→cell 4 |
| `computeIonImageStats` | 5 | Absent exclusion, present-zero not counted, all-absent={0,0,0}, typical min/max, non-finite exclusion |

`makeGrid` and `makeXic` fixture helpers copied verbatim from `tic.test.ts`. `makeXic` emits `BigInt` indices to exercise the Pitfall 1 boundary conversion by default.

## Verification

- `npx vitest run src/compute/ionImage.test.ts`: **17/17 passed**
- `npx tsc -p tsconfig.app.json --noEmit`: **zero errors for ionImage.ts**
- `npm run build` fails with a pre-existing `[UNLOADABLE_DEPENDENCY]` error for `vendor/mzpeakts/lib/src/index.ts` — this is the vendor submodule not present in the worktree (worktree isolation); it is NOT caused by Plan 1's changes and was failing before them.

## TDD Gate Compliance

1. RED gate: `test(04-01)` commit `de9d565` — tests written first, confirmed failing (module not found)
2. GREEN gate: `feat(04-01)` commit `7a0fc64` — implementation written, all 17 tests pass

## Deviations from Plan

None — plan executed exactly as written.

The `must_haves.truths` are all verified:
- `ppmToDa(500, 10) === 0.005; ppmToDa(1000, 5) === 0.005` ✓ (tests pass, formula is `(mz * ppm) / 1e6`)
- `buildIonImage sums windowed intensities per grid cell, bigint index converted first` ✓
- `buildIonImage respects C2 orientation (key = y0*width+x0, no flip)` ✓
- `computeIonImageStats excludes absent pixels (presenceMask===0) from nonzeroCount/min/max` ✓
- `all three pure functions are unit-tested with synthetic fixtures` ✓ (17 tests)

## Known Stubs

None — all three functions are fully implemented with correct logic. No hardcoded empty values or placeholders.

## Threat Flags

None — Plan 1 creates pure compute functions with no I/O, no network endpoints, and no new trust boundaries. The threat register dispositions (T-04-01, T-04-02, T-04-SC) are all `accept` and the mitigations are implemented:
- T-04-02: `typeof v === "number" && Number.isFinite(v)` guard is present in `buildIonImage`

## Self-Check: PASSED

- `src/compute/ionImage.ts` exists: FOUND
- `src/compute/ionImage.test.ts` exists: FOUND
- Commit `de9d565` exists: FOUND (test(04-01))
- Commit `7a0fc64` exists: FOUND (feat(04-01))
- 17 tests pass: CONFIRMED
- Zero type errors: CONFIRMED
