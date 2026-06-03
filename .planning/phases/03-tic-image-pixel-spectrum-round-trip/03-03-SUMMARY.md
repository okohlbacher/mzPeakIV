---
phase: 03-tic-image-pixel-spectrum-round-trip
plan: 03
subsystem: tic-image-pixel-spectrum-round-trip (visible vertical slice)
tags: [IMAGE-01, IMAGE-04, SPEC-01, SPEC-02, tic, canvas, imaging, round-trip]
requires:
  - "src/compute/tic.ts buildTic (plan 03-01)"
  - "src/ui/rasterize.ts rasterizeTic + viridis (plan 03-01)"
  - "src/reader/types.ts LoadStage 'tic' member (plan 03-01)"
  - "src/state/store.ts selectSpectrum representation-routed (plan 03-02)"
  - "src/imaging/types.ts ImagingGrid (Phase 2)"
provides:
  - "src/state/store.ts tic slice + eager 'tic' LoadStage (extractXIC(null,null,useProfile) -> buildTic) + useProfile/D-08 mixed-representation warning"
  - "src/ui/ImagingPanel.tsx Canvas-2D TIC heatmap + 1-based hover readout + pixel-click hit-test -> selectSpectrum + contrast selection ring"
  - "src/ui/App.tsx ImagingPanel stacked over SpectrumPanel when grid!==null; 'tic' loading stage + sentinel"
  - "src/ui/SpectrumPanel.tsx pixel-aware heading + SPEC-02 mzWindow placeholder prop"
affects:
  - "Phase 4 IMAGE-02/03 (m/z-windowed ion image reuses the same extractXIC primitive; mzWindow prop already threaded)"
  - "Phase 4 SPEC-02 (marker UI wires into the placeholder prop without signature change)"
tech-stack:
  added: []
  patterns:
    - "Eager compute stage gated on grid!==null in runLoad (mirrors the 'grid' stage)"
    - "Imperative Canvas via useRef mirroring SpectrumPanel's uPlot mount"
    - "Two-pass canvas render: putImageData then re-blit + strokeRect ring (overwrite-safe)"
    - "Resolution/aspect-safe hit-test via getBoundingClientRect (never offset-* props)"
    - "Reuse grid.ts key formula y0*width+x0 — no flip/transpose (C2)"
key-files:
  created:
    - src/ui/ImagingPanel.tsx
  modified:
    - src/state/store.ts
    - src/state/store.test.ts
    - src/ui/App.tsx
    - src/ui/SpectrumPanel.tsx
decisions:
  - "D-08 useProfile = !(centroid>0 && profile===0): profile-default, centroid only for a pure-centroid file; majority-profile mixed files still read profile (spec primary)"
  - "Stubbed buildTic + faked extractXIC in store.test (boundary test, not TIC math)"
  - "SPEC-02 satisfied architecturally only — mzWindow prop threaded as a no-op; no marker drawn (no m/z state in Phase 3)"
metrics:
  duration: ~10 min
  completed: 2026-06-03
  tasks: 3
  files: 5
---

# Phase 3 Plan 03: TIC Image + Pixel→Spectrum Round-Trip Summary

The visible Core-Value slice: loading an imaging `.mzpeak` now computes a TIC raster eagerly (new `'tic'` LoadStage via `extractXIC(null, null, useProfile)` + `buildTic`), paints it to a Canvas in the new `ImagingPanel`, reports 1-based hover coordinates with a sparse "— no data" sentinel, routes a present-pixel click to the existing representation-routed `selectSpectrum`, and marks the selection with a contrast ring — all stacked above the existing uPlot `SpectrumPanel`, whose heading now reflects the clicked pixel. Non-imaging files render the `SpectrumPanel` alone; mixed profile/centroid files surface a named amber warning.

## What Was Built

### Task 1 — eager `'tic'` LoadStage + tic slice + useProfile derivation (commit `23149cb`)
- `src/state/store.ts`: added `tic: Float32Array | null` and `mixedRepresentationWarning: string | null` to `State`/`initialState`. Inserted the eager `'tic'` block in `runLoad` AFTER the `'grid'` block and BEFORE the final ready `set`, guarded by `if (grid)`: `set({ stage: "tic" })` → `yieldFrame` → derive `useProfile = !(centroid > 0 && profile === 0)` from `stats.representationCounts` (D-08 profile-default), build the mixed-representation warning only when `profile > 0 && centroid > 0`, call `reader.extractXIC(null, null, useProfile)`, then `tic = xic ? buildTic(xic, grid) : null`. A `null` XIC is NOT an error (yields `tic: null` → "Could not compute TIC for this file"); a genuine throw routes through `classifyError`. Non-imaging files skip TIC entirely (`tic: null`, no error — D-06). Both new fields added to the ready payload.
- `src/state/store.test.ts` (required mock update — see Deviation 1): the fake reader now exposes `extractXIC`, `buildTic` is stubbed, the imaging staged-progress sequence asserts `…grid, tic, ready`, and a `tic`/`mixedRepresentationWarning` assertion was added.

### Task 2 — `ImagingPanel` Canvas component (commit `ed3ae2f`)
- `src/ui/ImagingPanel.tsx` (new): imperative `useRef<HTMLCanvasElement>` mirroring `SpectrumPanel`. Selects `grid`/`tic`/`selectedIndex`/`selectSpectrum`/`mixedRepresentationWarning`. Renders `<section aria-label="imaging-panel" data-testid="imaging-panel">` with `<h2>TIC Image</h2>`, an amber `⚠` mixed-representation line (`#8a6d00`), the `<canvas data-testid="tic-canvas">` (or the muted "Could not compute TIC for this file" when `tic === null`), and a `<div data-testid="tic-hover-readout">`.
  - **Paint pass** (`[tic, grid]`): intrinsic size = `width × height`, `rasterizeTic` → `new ImageData(rgba, w, h)` → `putImageData`. CSS honors `pixelSizeUm` aspect via `aspectRatio: (cols*px.x)/(rows*px.y)`, `image-rendering: pixelated`, `cursor: crosshair`.
  - **Ring pass** (`[selectedIndex, tic, grid]`, after paint): re-blit, invert `coordToSpectrumIndex` to find the selected key, luminance-pick white/black, `strokeRect(x0 + .5, y0 + .5, 1, 1)` with `lineWidth: 1`.
  - **Hit-test** `toGridCoord` uses `getBoundingClientRect` (never `offsetX/Y`), returns null off-canvas, key = `y0 * grid.width + x0` (no flip — C2). Hover sets 1-based readout (`+ coordinateBase`) / "— no data" / clears on leave (D-05); click guards `presenceMask` (absent = no-op, D-04) → `selectSpectrum`.

### Task 3 — mount in App + pixel-aware Spectrum heading + SPEC-02 placeholder (commit `9ff9a90`)
- `src/ui/App.tsx`: imported `ImagingPanel`; added `stage === "tic"` to `loading` and a `"tic" → "Building TIC image…"` arm to the hidden stage sentinel. In the ready `<main>`, selected `grid` and rendered a vertical `ImagingPanel`-over-`SpectrumPanel` stack when `grid !== null`, the bare `SpectrumPanel` otherwise (D-06).
- `src/ui/SpectrumPanel.tsx`: added the optional `mzWindow?: MzWindow | null` prop (SPEC-02 architectural placeholder, threaded as a documented no-op — `void _props.mzWindow`). Derived the imaging-mode heading `Spectrum — pixel (x1, y1)` by inverting `coordToSpectrumIndex` for `selectedIndex` (1-based via `coordinateBase`); plain `Spectrum` otherwise. Numeric index input retained intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated `store.test.ts` reader mock + imaging staged sequence**
- **Found during:** Task 1 verification (`npx vitest run src/state`).
- **Issue:** The new eager `'tic'` stage calls `reader.extractXIC(...)`, but the test's fake reader (`{ __fakeReader: true }`) had no such method → `TypeError` → the imaging load routed to `error`, breaking the staged-progress assertion (which also predated the `'tic'` stage). The plan's own acceptance gate requires `npx vitest run src/state` to pass.
- **Fix:** Inlined `extractXIC` (returning an empty XIC) onto both fake readers, stubbed `buildTic` via `vi.mock("../compute/tic", …)` so the store test stays a boundary test, updated the imaging staged-progress expectation to `…grid, tic, ready`, added `tic`/`mixedRepresentationWarning` to the `beforeEach` reset, and asserted both new fields. `store.test.ts` was not in the plan's `files_modified`, but the update is a required consequence of the new boundary call (same class as plan 03-02's mock-extension deviation).
- **Files modified:** `src/state/store.test.ts`
- **Commit:** `23149cb`

**2. [Rule 3 - Blocking] Removed the literal token `offsetX` from a doc comment**
- **Found during:** Task 2 acceptance grep.
- **Issue:** The plan's acceptance criterion is "grep confirms NO `offsetX`", but my explanatory comment named the anti-pattern ("NOT offsetX/offsetY"), tripping the grep.
- **Fix:** Reworded the comment to "the offset-* event props" — no behavioral change; `grep -c offsetX` is now 0.
- **Files modified:** `src/ui/ImagingPanel.tsx`
- **Commit:** `ed3ae2f`

## Verification Evidence

- `npx tsc --noEmit` → exit 0 (after each task and finally).
- `npx vitest run src/state src/compute` (Task 1) → 3 files, 11 passed.
- `npx eslint src/ui/ImagingPanel.tsx` (Task 2) → exit 0.
- `npx eslint src/ui/App.tsx src/ui/SpectrumPanel.tsx` (Task 3) → exit 0.
- `npx vitest run` (full suite, Task 3) → 11 files, **93 passed | 1 skipped**.
- Acceptance greps confirmed: `ImagingPanel` exports + `tic-canvas`/`tic-hover-readout` testids; `putImageData` + `strokeRect`; `getBoundingClientRect` present and `offsetX` absent (0); `coordinateBase` in hover; `presenceMask` + `selectSpectrum` click guard; `pixelSizeUm` aspect; key formula `y0 * grid.width + x0` (no transpose). App: `ImagingPanel` + `grid !== null` + `stage === "tic"` + "Building TIC image". SpectrumPanel: `mzWindow` + `SPEC-02` + `pixel (` + `spectrum-index` retained.

## Threat Model Coverage

- **T-03-07 (OOB hit-test):** Mitigated — `toGridCoord` returns null outside `[0,width)`/`[0,height)`; hover/click never index a typed array or Map OOB.
- **T-03-08 (absent vs zero spoof):** Mitigated — `rasterizeTic` sentinel (`#1a1a1a`, 03-01) keeps absent pixels visually distinct; absent clicks are no-ops via the `presenceMask` guard (D-04).
- **T-03-09 (silent wrong source):** Mitigated — D-08 named warning surfaced in `ImagingPanel` when both profile and centroid spectra exist; per-pixel reads still route per-spectrum (03-02).
- **T-03-10 (large-grid main-thread TIC):** Accepted — single synchronous pass on an already-capped grid; worker offload is Phase 5.
- **T-03-SC (installs):** N/A — zero new packages this plan.

## Known Stubs

- **SPEC-02 `mzWindow` placeholder** (`src/ui/SpectrumPanel.tsx`): the prop is accepted and explicitly unused in Phase 3 (`void _props.mzWindow`). This is intentional, plan-sanctioned scaffolding — SPEC-02's marker UI is genuinely Phase-4-gated by the absence of any m/z-selection state in Phase 3 (objective's "SPEC-02 reconciliation"; UI-SPEC; RESEARCH A4). It does NOT block the Phase 3 deliverable (the round-trip), and Phase 4 (IMAGE-03/SPEC-02) resolves it by reading the prop to draw the marker. No empty-data-to-UI stub exists otherwise — the TIC, hover, click, ring, and spectrum are all fully wired.

## Threat Flags

None — this plan introduces no new network endpoint, auth path, file-access pattern, or schema change beyond the threat-modeled surface.

## For the Next Plan (Phase 4)

- The m/z-windowed ion image reuses the exact `reader.extractXIC(timeRange, mzRange, useProfile)` primitive — swap `null` mzRange for the selected window; `rasterizeTic`'s `viridis` call site is the single colormap-selector seam.
- The SPEC-02 marker wires into `SpectrumPanel`'s already-present `mzWindow` prop — no signature change needed.

## Self-Check: PASSED

All created/modified files exist on disk (`src/ui/ImagingPanel.tsx`, `src/state/store.ts`, `src/state/store.test.ts`, `src/ui/App.tsx`, `src/ui/SpectrumPanel.tsx`, `03-03-SUMMARY.md`); all three task commits (`23149cb`, `ed3ae2f`, `9ff9a90`) present in git history.
