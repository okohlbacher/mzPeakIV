---
phase: 03-tic-image-pixel-spectrum-round-trip
plan: 01
subsystem: compute + render foundations (TIC)
tags: [tic, rasterize, viridis, imaging, pure-transform, tdd]
requires:
  - src/imaging/types.ts (ImagingGrid: width/height/coordToSpectrumIndex/presenceMask)
  - src/reader/arrays.ts ("intensity array" key convention)
provides:
  - "buildTic(xic, grid) -> Float32Array (pure intensity-sum TIC raster, IMAGE-01)"
  - "rasterizeTic(tic, grid) -> Uint8ClampedArray (viridis + 99th-pct clip + sparse sentinel, IMAGE-04)"
  - "viridis(norm) -> [r,g,b] (single swappable LUT for Phase 4 selector)"
  - "LoadStage union extended with 'tic' member (D-02)"
affects:
  - "Plan 03-02 (ion-image canvas panel consumes rasterizeTic output)"
  - "Plan 03-03 (store stage references LoadStage 'tic')"
  - "Phase 4 IMAGE-03 (colormap selector swaps the viridis function)"
tech-stack:
  added: []
  patterns:
    - "Pure DOM-free transforms split out of React components (RESEARCH Pitfall 4)"
    - "bigint boundary conversion at the first op (Number(point.index), Pitfall 1)"
    - "Reuse grid.ts key formula by inverting coordToSpectrumIndex (no re-derived flip, C2)"
    - "Number.isFinite per-element guard carried over from grid.ts discipline"
key-files:
  created:
    - src/compute/tic.ts
    - src/compute/tic.test.ts
    - src/ui/rasterize.ts
    - src/ui/rasterize.test.ts
  modified:
    - src/reader/types.ts
decisions:
  - "Local structural XIC type in tic.ts (no vendor import) keeps src/compute/ free of apache-arrow/mzpeakts"
  - "viridis as a 9-stop fixed anchor LUT with linear interpolation — one swappable pure fn (UI-SPEC)"
  - "Sentinel #1a1a1a (RGBA 26,26,26,255) near-black, distinct from viridis bottom #440154 (D-09)"
metrics:
  duration: ~4 min
  completed: 2026-06-03
  tasks: 2
  files: 5
  tests: 12
---

# Phase 3 Plan 01: TIC Compute + Render Foundations Summary

Two pure, DOM-free foundations of the TIC slice: `buildTic` (intensity-sum → `Float32Array` raster, IMAGE-01) and `rasterizeTic` (viridis colormap + present-only 99th-percentile clip + sparse sentinel → `Uint8ClampedArray`, IMAGE-04), plus a one-line `LoadStage` extension. Built TDD with 12 synthetic-fixture unit tests proving orientation, the bigint boundary, the reverse-map scatter, the percentile clip, and the absent≠zero rule without any canvas or reader mock.

## What Was Built

### Task 1 — `buildTic` + `'tic'` LoadStage
- `src/compute/tic.ts`: new layer above `src/reader/` and `src/imaging/`. `buildTic(xic, grid)` allocates a `Float32Array(width*height)`, inverts `coordToSpectrumIndex` to a `spectrumIndex → cellKey` map (reusing grid.ts's `key = y0*width+x0`, no flip), converts each `point.index` bigint with `Number()` at the first op, skips off-grid/absent points, reads `"intensity array"`, and sums elements with a `Number.isFinite ? v : 0` guard.
- Local structural `XicLike`/`XicPointLike` types keep `src/compute/` free of any apache-arrow / mzpeakts import.
- `src/reader/types.ts`: inserted `"tic"` into the `LoadStage` union between `"grid"` and `"ready"`.
- 5 tests: dense sum, orientation (no transpose), bigint boundary, sparse/off-grid skip, missing/non-finite intensity.

### Task 2 — `rasterizeTic` + `viridis`
- `src/ui/rasterize.ts`: pure DOM-free helper (no `react`/`uplot`/canvas import). `rasterizeTic(tic, grid)` writes the sentinel `[26,26,26,255]` on every `presenceMask[k]===0` cell, otherwise `viridis(clamp(tic[k]/clipMax))`. `clipMax` = `percentile99(tic, presenceMask)` computed over **present cells only**. Non-finite/negative normalize to 0. No cell reorder.
- `viridis(norm)`: 9-stop fixed matplotlib-viridis anchor LUT with linear interpolation, returning integer `[r,g,b]`. Single swappable pure function so Phase 4's colormap selector needs no refactor.
- 7 tests (6 plan + 1 viridis-bounds sanity): shape, sparse sentinel vs colormap-zero distinction, present-zero colormap, present-only percentile clip, clamp on non-finite/negative, orientation passthrough.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Test 6 (orientation passthrough) fixture**
- **Found during:** Task 2 GREEN phase.
- **Issue:** The originally-written RED fixture used `tic = [0,0,0,100]` (one bright outlier among zeros) and asserted the bright cell mapped to LUT top. But the present-only 99th-percentile clip *correctly* clips that single outlier (index `floor(0.99*3)=2` → value 0 → `clipMax=0`), so everything renders at colormap-bottom. The implementation was behaving correctly per the percentile spec; the test expectation was wrong.
- **Fix:** Rewrote the fixture to a uniform-bright field plus a `[0,100,100,100]` gradient where the percentile preserves the span, still proving offset `k*4` tracks `tic[k]` with no reorder.
- **Files modified:** src/ui/rasterize.test.ts
- **Commit:** 1b63243

## Verification Evidence

- `npx vitest run src/compute/tic.test.ts src/ui/rasterize.test.ts` → 2 files, **12 tests passed**.
- `npx tsc --noEmit` → exit 0, no type errors.
- `grep` confirms: no `apache-arrow`/`mzpeakts` import in `src/compute/tic.ts`; no `react`/`uplot` import in `src/ui/rasterize.ts`; `tic.ts` contains `"intensity array"`, `Number(point.index)`, and inverts `coordToSpectrumIndex`; `rasterize.ts` references `presenceMask` (9×) and contains the `0x1a` sentinel byte; `LoadStage` contains `"tic"`.

## TDD Gate Compliance

Both tasks followed RED → GREEN:
- buildTic: `test(03-01)` ff64d70 (RED) → `feat(03-01)` 561435c (GREEN).
- rasterizeTic: `test(03-01)` 17ea3a7 (RED) → `feat(03-01)` 1b63243 (GREEN).
No REFACTOR commits needed.

## Known Stubs

None. Both modules are fully wired pure functions with no placeholder/empty-return paths; absent cells rendering to the sentinel is intended behavior (D-09), not a stub.

## For the Next Plan

- Plan 03-02 (ion-image canvas) calls `rasterizeTic(tic, grid)` and pushes the `Uint8ClampedArray` into an `ImageData` → `putImageData`; the selection ring and hover hit-test are its concern (orientation is already correct in this output).
- Plan 03-03 (store stage) can reference `LoadStage` `"tic"`.
- Phase 4 IMAGE-03: swap the `viridis` function for a selector — the call site in `rasterizeTic` is the single seam.

## Self-Check: PASSED

All 5 created/modified files exist on disk; all 4 task commits (ff64d70, 561435c, 17ea3a7, 1b63243) present in git history.
