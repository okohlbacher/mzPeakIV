---
phase: 04-ion-image-intensity-scaling
plan: 7
subsystem: ui
tags: [colormap, inferno, lut, percentile, rasterize, canvas]

requires:
  - phase: 03-tic-image-pixel-spectrum-round-trip
    provides: rasterize.ts with initial INFERNO_STOPS table and percentileClip formula

provides:
  - Corrected INFERNO_STOPS[7] = [249,201,52] — matches matplotlib inferno t=0.875 (gold/amber)
  - Fixed percentileClip nearest-rank formula: Math.ceil(p*n)-1 (handles n=2 correctly)
  - Extended monotonic-luminance test covering t=0,0.25,0.5,0.75,0.875,1.0
  - Regression test for n=2 p=0.99 percentile case

affects: [ion-image rendering, inferno colormap, dynamic range scaling]

tech-stack:
  added: []
  patterns:
    - "Nearest-rank percentile: Math.ceil(p*n)-1 clamped to [0,n-1] — handles all n>=1"

key-files:
  created: []
  modified:
    - src/ui/rasterize.ts
    - src/ui/rasterize.test.ts

key-decisions:
  - "INFERNO_STOPS[7] corrected to [249,201,52] (matplotlib inferno t=0.875); initial [ASSUMED] annotation removed"
  - "percentileClip formula changed from Math.floor(p*(n-1)) to Math.ceil(p*n)-1 (nearest-rank method, degrades gracefully at n=2)"

patterns-established:
  - "Nearest-rank percentile: ceil(p*n)-1 is robust for any n>=1; floor(p*(n-1)) returns index 0 for n=2"

requirements-completed: [IMAGE-03]

duration: 5min
completed: 2026-06-04
---

# Phase 04 Plan 07: Inferno LUT Flat-Top + percentileClip n=2 Fix Summary

**Corrected INFERNO_STOPS[7] from duplicate pale-yellow [252,255,164] to matplotlib-accurate gold/amber [249,201,52], and fixed percentileClip formula to use nearest-rank (ceil) that returns the correct index for grids as small as 2 cells.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-04T01:08:00Z
- **Completed:** 2026-06-04T01:11:17Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

### Task 1: Fix Inferno LUT stop[7] and percentileClip formula

Two targeted edits to `src/ui/rasterize.ts`:

1. **INFERNO_STOPS[7]:** Changed from `[252, 255, 164]` (which duplicated stop[8]) to `[249, 201, 52]` (gold/amber, matching matplotlib inferno at t=0.875). The previous duplicate created a 12.5% flat band at the top of the dynamic range where high-intensity structure was invisible. Stop[8] (`[252, 255, 164]` at t=1.0) is unchanged.

2. **percentileClip formula:** Changed from `Math.floor(p * (present.length - 1))` to `Math.min(present.length - 1, Math.max(0, Math.ceil(p * present.length) - 1))`. The old formula returned index 0 for n=2, p=0.99 (clipping to the minimum value). The new nearest-rank formula returns index 1 (the 99th percentile value), correctly distinguishing the two cells.

All 19 existing rasterize tests continued to pass.

### Task 2: Extend rasterize.test.ts regression coverage

Two edits to `src/ui/rasterize.test.ts`:

1. **Monotonic-luminance test extended:** Updated from 2-assertion (t=0, 0.5, 1.0) to 5-assertion form covering t=0, 0.25, 0.5, 0.75, 0.875, 1.0. The test name updated to reflect the extended coverage. This test now catches the flat-top defect that the previous version missed.

2. **n=2 percentile regression test added:** New `it(...)` in the "percentile param" block: creates a 1×2 dense grid with values=[1,2], rasterizes with p=0.99, and asserts the two cells are distinguishable (not both at colormap max) and that the higher-value cell renders at `viridis(1)`.

Final test count: 20 (up from 19).

## Verification

```
# LUT fix confirmed
grep "249, 201, 52" src/ui/rasterize.ts
→ [249, 201, 52], // 0.875  gold/amber

# Formula fix confirmed
grep "Math.ceil" src/ui/rasterize.ts
→ const idx = Math.min(present.length - 1, Math.max(0, Math.ceil(p * present.length) - 1));

# Test extension confirmed
grep "lum(0.875)" src/ui/rasterize.test.ts
→ expect(lum(0.875)).toBeLessThan(lum(1.0));

# 20 tests pass
npx vitest run src/ui/rasterize.test.ts (from worktree)
→ Tests  20 passed (20)
```

## Commits

| Task | Description | Hash | Files |
|------|-------------|------|-------|
| 1 | Fix INFERNO_STOPS[7] and percentileClip formula | c72b890 | src/ui/rasterize.ts |
| 2 | Extend monotonic-luminance test + n=2 regression | 56198ff | src/ui/rasterize.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both edits are concrete value corrections, no placeholders introduced.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Changes are limited to in-memory LUT constants and an arithmetic formula within a pure function.

## Self-Check: PASSED

- `src/ui/rasterize.ts` exists and contains `[249, 201, 52]` ✓
- `src/ui/rasterize.ts` contains `Math.ceil(p * present.length) - 1` ✓
- `src/ui/rasterize.test.ts` exists and contains `lum(0.875)` ✓
- Commit c72b890 exists ✓
- Commit 56198ff exists ✓
- 20 tests pass in rasterize.test.ts ✓
