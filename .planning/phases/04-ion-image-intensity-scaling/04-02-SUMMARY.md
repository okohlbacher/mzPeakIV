---
phase: "04-ion-image-intensity-scaling"
plan: 2
subsystem: "ui/rasterize"
tags: ["colormap", "log-scaling", "percentile-clip", "IMAGE-03", "pure-function"]
dependency_graph:
  requires: []
  provides:
    - "rasterizeImage(values, grid, opts) — generalized rasterizer with colormap/percentile/log-scale"
    - "inferno(norm) — matplotlib inferno LUT"
    - "Colormap type — viridis | inferno | gray"
    - "RasterizeOpts interface — colormap, percentile, logScale"
    - "rasterizeTic — preserved as thin wrapper; all Phase 3 callers unchanged"
  affects:
    - "src/ui/ImagingPanel.tsx (rasterizeTic import still resolves)"
    - "Plans 03-05 of Phase 4 can now consume rasterizeImage with colormap settings from store"
tech_stack:
  added: []
  patterns:
    - "Parameterized percentile clip: percentileClip(values, presenceMask, p) — replaces hardcoded 0.99"
    - "Math.log1p log-scale normalization: safe for raw=0 (returns 0 exactly, never NaN)"
    - "LUT interpolation: same clamped-interpolation shape as viridis(), applied to INFERNO_STOPS"
    - "Thin wrapper pattern: rasterizeTic delegates to rasterizeImage with fixed defaults"
key_files:
  modified:
    - src/ui/rasterize.ts
    - src/ui/rasterize.test.ts
decisions:
  - "Renamed percentile99 to percentileClip(values, presenceMask, p) to match IMAGE-03 percentile-selector requirement"
  - "INFERNO_STOPS marked [ASSUMED] cosmetic — standard matplotlib inferno anchors, not from a spec reference"
  - "Gray colormap implemented inline in rasterizeImage switch (no separate constant needed — trivial formula)"
  - "Log-scale denominator pre-computed once before pixel loop (log1p(clipMax)) for efficiency"
  - "Log-scale brightness test uses 3-cell grid so percentileClip resolves non-zero clipMax (2-cell [0,100] gives clipMax=0 due to sort+floor index)"
metrics:
  duration: "6 minutes"
  completed: "2026-06-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 4 Plan 2: rasterize.ts Generalization (IMAGE-03) Summary

**One-liner:** Extended rasterize.ts from single-purpose TIC rasterizer to parameterized rasterizer with Viridis/Inferno/Grayscale colormaps, configurable percentile clip, and Math.log1p log-scale normalization; rasterizeTic preserved as a thin two-arg wrapper.

## What Was Built

### Task 1: Extend src/ui/rasterize.ts (commit 55c0f22)

Extended the existing `src/ui/rasterize.ts` with targeted in-place additions:

1. **`Colormap` type export:** `"viridis" | "inferno" | "gray"`
2. **`RasterizeOpts` interface export:** `{ colormap: Colormap; percentile: number; logScale: boolean }`
3. **`INFERNO_STOPS` constant:** 9-stop matplotlib inferno palette (marked `[ASSUMED]` cosmetic values)
4. **`inferno(norm)` export:** same LUT-interpolation shape as `viridis()`, uses INFERNO_STOPS
5. **`percentileClip(values, presenceMask, p)` rename:** `percentile99` → `percentileClip` with parameterized `p`; hardcoded `0.99` removed; sort comparator fixed from shadowed `(p,q)` to `(a,b)`
6. **`rasterizeImage(values, grid, opts)` export:** generalizes the pixel loop with:
   - Log-scale branch: `denom = Math.log1p(clipMax)`, `norm = denom>0 && raw>0 ? Math.min(Math.log1p(raw)/denom, 1) : 0` — safe for raw=0 (T-04-03 mitigated)
   - Linear branch: `norm = denom>0 && Number.isFinite(raw) ? Math.min(Math.max(raw/denom,0),1) : 0`
   - Colormap dispatch via `switch(opts.colormap)`: inferno / gray / viridis (default)
   - C2 MANDATORY: linear `k` index over `grid.width * grid.height`, no flip/transpose
   - D-09 / C8: absent cells (presenceMask[k]===0) always render as SENTINEL [0x1a,0x1a,0x1a,255]
7. **`rasterizeTic` thin wrapper:** body replaced with single `return rasterizeImage(tic, grid, { colormap: "viridis", percentile: 0.99, logScale: false })`; signature unchanged

### Task 2: Extend src/ui/rasterize.test.ts (commit 12eb16b)

Added 12 new tests across 6 describe blocks appended after all existing Phase 3 tests:

| Block | Tests |
|-------|-------|
| `rasterizeImage — log scaling` | raw=0→norm=0 no NaN; raw>0 brighter than raw=0; no NaN in dense grid |
| `rasterizeImage — percentile param` | p=0.90 produces lower clip ceiling than p=0.99 (100-value array proof) |
| `rasterizeImage — inferno colormap` | monotonic luminance lum(0)<lum(0.5)<lum(1.0); RGB bounds check |
| `rasterizeImage — gray colormap` | R===G===B for all present cells; zero value → [0,0,0,255] |
| `rasterizeImage — sentinel preserved across all colormaps` | absent cell → [0x1a,0x1a,0x1a,255] for viridis, inferno, gray |
| `rasterizeTic — regression wrapper` | byte-for-byte match with rasterizeImage(...viridis,0.99,false) |

All 19 tests pass (7 Phase 3 + 12 new IMAGE-03).

## Verification Evidence

```
Tests: 19 passed (7 Phase 3 existing + 12 new IMAGE-03)
Build: ✓ built in 982ms (no TypeScript errors, no type errors in callers)
ImagingPanel.tsx: rasterizeTic import resolves unchanged
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed percentile99 sort comparator shadowing**
- **Found during:** Task 1 (code reading)
- **Issue:** The existing `percentile99` used `present.sort((p, q) => p - q)` where the parameter `p` shadowed the outer `p` percentile parameter after renaming
- **Fix:** Changed to `present.sort((a, b) => a - b)` to eliminate the shadowing
- **Files modified:** src/ui/rasterize.ts
- **Commit:** 55c0f22 (included in Task 1 commit)

**2. [Rule 1 - Bug] Fixed log-scale brightness test scenario**
- **Found during:** Task 2 test execution (test failed)
- **Issue:** Log-scale test used a 2-cell grid [0, 100] where `percentileClip` resolves idx=floor(0.99*1)=0 → clipMax=0 → both cells have norm=0, making lum(cell0)===lum(cell1)
- **Fix:** Changed to 3-cell grid [0, 50, 100] where `percentileClip` resolves idx=floor(0.99*2)=1 → clipMax=50 (non-zero). raw=0 → norm=0; raw=100 → norm=min(log1p(100)/log1p(50),1)=1.0 → luminance contrast proven
- **Files modified:** src/ui/rasterize.test.ts
- **Commit:** 12eb16b (included in Task 2 commit)

## Known Stubs

None — all exports are fully implemented with real LUT data and functional logic.

## Threat Flags

None — this plan adds no network endpoints, auth paths, file access, or schema changes. All changes are pure DOM-free functions receiving Float32Array from the store.

## Self-Check: PASSED

- `src/ui/rasterize.ts`: FOUND (exports Colormap, RasterizeOpts, rasterizeImage, inferno, viridis, rasterizeTic; contains Math.log1p; percentileClip present; percentile99 absent)
- `src/ui/rasterize.test.ts`: FOUND (6 new describe blocks; imports rasterizeImage, inferno, Colormap, RasterizeOpts; all 3 Colormap values in sentinel test)
- Commit 55c0f22: FOUND
- Commit 12eb16b: FOUND
- All 19 tests pass; build exits 0
