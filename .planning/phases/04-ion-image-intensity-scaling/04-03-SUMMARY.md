---
phase: "04-ion-image-intensity-scaling"
plan: 3
subsystem: "state/store"
tags: ["store", "actions", "ion-image", "IMAGE-02", "IMAGE-03", "SPEC-02"]
dependency_graph:
  requires:
    - "04-01 (buildIonImage, computeIonImageStats, ppmToDa exports)"
    - "04-02 (Colormap type, rasterizeImage export)"
  provides:
    - "mzWindow / ionImage / ionImageStats state slice in store"
    - "colormap / scale / percentile settings state in store"
    - "renderIonImage(mz, tolDa) action — file read, button-triggered"
    - "setColormapSettings(colormap, scale, percentile) action — recolor-only, no file I/O"
  affects:
    - "src/ui/ImagingPanel.tsx (Plans 04-05 read mzWindow/ionImage/colormap/scale/percentile)"
    - "src/ui/SpectrumPanel.tsx (Plan 04-05 reads mzWindow for SPEC-02 band)"
tech_stack:
  added: []
  patterns:
    - "V5 ASVS L1 input validation on numeric inputs before file read (Number.isFinite + positivity)"
    - "Span1D {start, end} object shape for mzRange — NOT [min,max] tuple (Pitfall 3 / T-04-07)"
    - "useProfile majority rule reused verbatim from store.ts:167-168 (D-08, no re-derivation)"
    - "setColormapSettings as pure synchronous state mutation (D-02/SC-5 cache-not-requery discipline)"
    - "try/classifyError error-handling shape mirroring selectSpectrum (consistency)"
key_files:
  modified:
    - src/state/store.ts
decisions:
  - "Added mz-tolDa<0 guard in renderIonImage (non-physical window rejection per T-04-05)"
  - "setColormapSettings contains zero async operations, zero reader references — provably cannot re-query"
  - "ppmToDa imported but not used in store — conversion is ImagingPanel's job before calling renderIonImage(mz, tolDa)"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-04T00:35:19Z"
  tasks: 2
  files: 1
---

# Phase 4 Plan 3: Store Slice — mzWindow, ionImage, Colormap State + Actions Summary

**One-liner:** Extended store.ts with six Phase 4 state fields and two actions — `renderIonImage` (the sole file-read path, with V5 input guards and Span1D mzRange) and `setColormapSettings` (pure synchronous mutation, provably zero file I/O per D-02/SC-5).

## What Was Built

### Task 1 — State fields, imports, type definitions (commit 530a6b2)

Added to `src/state/store.ts`:

**New imports:**
- `import { buildIonImage, computeIonImageStats } from "../compute/ionImage"` — the Plan 01 pure compute functions
- `import { type Colormap } from "../ui/rasterize"` — the Plan 02 colormap type union

**State type additions (6 fields):**
- `mzWindow: { mz: number; tolDa: number } | null` — tracks the current ion-image query window
- `ionImage: Float32Array | null` — cached raster from the last renderIonImage call
- `ionImageStats: { nonzeroCount: number; min: number; max: number } | null` — blank-prevention stats (SC-3)
- `colormap: Colormap` — current colormap ("viridis" | "inferno" | "gray")
- `scale: "linear" | "log"` — intensity scale mode
- `percentile: number` — percentile clip threshold

**Actions type additions (2 signatures):**
- `renderIonImage: (mz: number, tolDa: number) => Promise<void>`
- `setColormapSettings: (colormap: Colormap, scale: "linear" | "log", percentile: number) => void`

**initialState additions:**
- `mzWindow: null, ionImage: null, ionImageStats: null` — null until first button click
- `colormap: "viridis"` (D-08 default), `scale: "linear"` (D-10 default), `percentile: 0.99` (D-09 default)

### Task 2 — Action implementations (commit c07fa37)

**`renderIonImage(mz, tolDa)` implementation:**
- Guards: `!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0` — V5 ASVS L1 defense-in-depth (T-04-05)
- Guard: `mz - tolDa < 0` — non-physical window rejection
- Reads `stats.representationCounts` and reuses `useProfile = profile >= centroid` verbatim (D-08, store.ts:167-168)
- Builds `mzRange = { start: mz - tolDa, end: mz + tolDa }` — Span1D shape, not `[min,max]` tuple (Pitfall 3 / T-04-07)
- Calls `reader.extractXIC(null, mzRange, useProfile)` → `buildIonImage(xic, grid)` → `computeIonImageStats(ionImage, grid)`
- Sets `{ ionImage, ionImageStats, mzWindow: { mz, tolDa } }` — caches the raster for recolor-without-requery
- try/catch/classifyError error-handling shape mirrors `selectSpectrum` exactly

**`setColormapSettings(colormap, scale, percentile)` implementation:**
- Body is exactly `set({ colormap, scale, percentile })` — a synchronous state mutation
- Zero async operations, zero `reader` references, zero `extractXIC` calls — provably cannot re-query the file (D-02/SC-5)
- Colormap/scale changes re-rasterize from the cached `ionImage` in the render effect (ImagingPanel, Plans 04-05)

## Verification Evidence

```
npm run build: ✓ built in 976ms (zero TypeScript errors)
store.test.ts: 5/5 passed (all Phase 3 tests still green)
grep "extractXIC" store.ts → code calls = 2 exactly:
  line 200: reader.extractXIC(null, null, useProfile)      — runLoad TIC
  line 292: reader.extractXIC(null, mzRange, useProfile)   — renderIonImage only
setColormapSettings body: set({ colormap, scale, percentile }) — no extractXIC, no reader
```

## Deviations from Plan

None — plan executed exactly as written.

The `must_haves.truths` are all verified:
- `Store holds mzWindow, ionImage, ionImageStats, colormap, scale, percentile` ✓
- `renderIonImage validates m/z and tolDa (finite, positive) before calling extractXIC` ✓
- `renderIonImage passes mzRange as { start: mz-tolDa, end: mz+tolDa } (Span1D, not tuple)` ✓
- `setColormapSettings mutates only colormap/scale/percentile — never calls extractXIC` ✓
- `colormap changes do NOT re-query the file (D-02/SC-5)` ✓
- `useProfile majority rule in renderIonImage matches store.ts:167-168 verbatim` ✓

## Known Stubs

None — all state fields are fully initialized and both action implementations are complete. The store is the single source of truth that Plans 04-04 (ImagingPanel) and 04-05 (SpectrumPanel) will consume.

## Threat Flags

None — this plan modifies only the existing store.ts file. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The mitigations for T-04-05 (V5 input validation) and T-04-07 (Span1D shape) are implemented in `renderIonImage`.

## Self-Check: PASSED

- `src/state/store.ts`: FOUND (contains all 6 Phase 4 State fields, 2 Actions, 2 implementations)
- Commit `530a6b2`: FOUND (feat(04-03): state fields, imports, type definitions)
- Commit `c07fa37`: FOUND (feat(04-03): renderIonImage and setColormapSettings implementations)
- Build exits 0: CONFIRMED (✓ built in 976ms)
- store.test.ts: 5/5 passed — CONFIRMED
- setColormapSettings has no extractXIC reference: CONFIRMED
