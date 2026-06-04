---
phase: 04-ion-image-intensity-scaling
plan: 8
subsystem: store / ImagingPanel / requirements tracking
tags: [bug-fix, re-render, mzWindow, gap-closure]
dependency_graph:
  requires: []
  provides: [consistent-mzWindow-state, leaner-ImagingPanel-subscriptions]
  affects: [SpectrumPanel-amber-band, ImagingPanel-re-render-frequency]
tech_stack:
  added: []
  patterns: [zustand-conditional-set]
key_files:
  modified:
    - src/state/store.ts
    - src/ui/ImagingPanel.tsx
    - .planning/REQUIREMENTS.md
decisions:
  - "Set mzWindow to null when extractXIC returns null (not {mz,tolDa}) so amber band never appears without an ion image"
  - "Remove dead mzWindow useStore subscription from ImagingPanel — SpectrumPanel subscribes independently; ImagingPanel does not need it"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-06-04"
  tasks: 2
  files_modified: 3
---

# Phase 04 Plan 08: Gap-Closure — mzWindow Conditional + Dead Subscription Removal

## One-liner

Conditional `mzWindow: ionImage ? {mz,tolDa} : null` in store + removal of the dead `mzWindow` subscription from ImagingPanel prevents amber-band-without-ion-image UI state and eliminates a redundant re-render per m/z query.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix mzWindow conditional set + remove dead subscription | 2cbe703 | src/state/store.ts, src/ui/ImagingPanel.tsx |
| 2 | Mark IMAGE-02 and IMAGE-03 Complete in REQUIREMENTS.md | 3584426 | .planning/REQUIREMENTS.md |

## What Was Built

**Task 1 — store.ts WR-01 fix:**
Changed `set({ ionImage, ionImageStats, mzWindow: { mz, tolDa } })` to `set({ ionImage, ionImageStats, mzWindow: ionImage ? { mz, tolDa } : null })` inside `renderIonImage`. When `extractXIC` returns `null` (e.g., no signal at the queried m/z), `ionImage` is null and `mzWindow` is now set to null. This prevents `SpectrumPanel` from drawing the amber SPEC-02 band when no ion image is visible — fixing the inconsistent UI state.

**Task 1 — ImagingPanel.tsx WR-03 fix:**
Removed the `const mzWindow = useStore((s) => s.mzWindow)` subscription and the `void mzWindow` suppressor comment from ImagingPanel. The subscription was never used by any JSX in ImagingPanel — `SpectrumPanel` subscribes independently via its own `useStore(s => s.mzWindow)`. The Phase 4 subscriptions block now has 7 useStore calls (ionImage, ionImageStats, colormap, scale, percentile, renderIonImage, setColormapSettings) down from 8.

**Task 2 — REQUIREMENTS.md:**
Updated IMAGE-02 and IMAGE-03 from `[ ] Pending` to `[x] Complete` in both the Spatial Images checkbox section (lines 31-32) and the Traceability table (lines 88-89).

## Verification Results

- `grep "mzWindow: ionImage" src/state/store.ts` — matches line 295 (conditional set confirmed)
- `grep "void mzWindow" src/ui/ImagingPanel.tsx` — no output (dead suppressor removed)
- `grep "mzWindow" src/ui/ImagingPanel.tsx` — no output (subscription fully removed)
- `npm run build` — exits 0, 232 modules transformed, no TypeScript errors
- `npx vitest run src/` — 12 test files, 124 passed, 1 skipped (zero regressions)
- IMAGE-02 and IMAGE-03 rows: `[x]` in checkboxes, "Complete" in traceability table

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The mzWindow conditional null tightens (not widens) the trust boundary at `store state → SpectrumPanel`: the amber band is now suppressed when no ion image is rendered, matching T-04-GC3 mitigation intent.

## Self-Check: PASSED

- [x] src/state/store.ts modified — confirmed (line 295: `mzWindow: ionImage ? { mz, tolDa } : null`)
- [x] src/ui/ImagingPanel.tsx modified — confirmed (no mzWindow subscription remains)
- [x] .planning/REQUIREMENTS.md modified — confirmed (IMAGE-02/03 marked Complete)
- [x] Commit 2cbe703 exists — confirmed (Task 1)
- [x] Commit 3584426 exists — confirmed (Task 2)
- [x] Build passes — confirmed (npm run build exits 0)
- [x] Tests pass — confirmed (124/124 pass, 1 skipped)
