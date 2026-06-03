---
phase: 02-imaging-grid-reconstruction-the-gate
plan: 03
subsystem: state-and-ui
tags: [imaging, grid, store, load-stage, diagnostics-panel, IMG-01, IMG-02, IMG-03]
requires:
  - "src/reader/scanCoords.ts (02-01): extractCoords + readGridGeometry"
  - "src/imaging/grid.ts (02-02): buildImagingGrid"
  - "src/imaging/types.ts (02-02): ImagingGrid / GridDiagnostics / CoordSourceStrategy"
provides:
  - "LoadStage extended with 'grid' (between 'metadata' and 'ready')"
  - "store.grid: ImagingGrid | null + the eager 'grid' stage block in runLoad"
  - "src/ui/GridDiagnosticsPanel.tsx — inline expandable grid diagnostics panel"
affects:
  - "Phase 3 (TIC / ion-image) consumes store.grid directly; the GridDiagnosticsPanel is the demonstrable Phase-2 surface"
tech-stack:
  added: []
  patterns:
    - "Eager 'grid' LoadStage: set({stage:'grid'}); yieldFrame(); build only when capabilities.isImaging"
    - "Non-imaging = grid:null + ready + NO error (D-06) — never routed to ErrorBanner"
    - "GridDiagnosticsPanel cloned from CapabilitiesPanel inline-style pattern; useState disclosure"
    - "Warning amber #8a6d00 caution state (sparse/duplicate/disagreement), never error red #b71c1c"
key-files:
  created:
    - src/ui/GridDiagnosticsPanel.tsx
  modified:
    - src/reader/types.ts
    - src/state/store.ts
    - src/state/store.test.ts
    - src/ui/App.tsx
    - src/ui/ProgressBar.tsx
decisions:
  - "ProgressBar STAGES + STAGE_LABEL gained a 'grid' step (Record<LoadStage> completeness) — the grid stage is shown as a visible build step, consistent with LOAD-03"
  - "store.test mocks scanCoords + imaging/grid so the imaging path proves a non-null grid offline (no WASM, no fixture)"
  - "Anomaly threshold mirrors UI-SPEC: filledCount < totalCells*0.95 OR duplicateCount>0 OR discoveryDisagreement!=null"
metrics:
  duration: "~7 min"
  completed: "2026-06-03T11:42:00Z"
  tasks: 2
  files: 6
---

# Phase 2 Plan 03: Grid Stage + GridDiagnosticsPanel — the Phase-2 vertical slice Summary

Wires the 02-01 coordinate extractor and the 02-02 grid builder into the store as a new eager `'grid'` LoadStage and surfaces the result in a cloned-from-CapabilitiesPanel `GridDiagnosticsPanel`, completing the demonstrable Phase-2 capability: loading an imaging `.mzpeak` produces a visible, expandable grid summary and a non-null `store.grid`, while a non-imaging file shows a calm muted notice (NOT an error).

## What Was Built

**Task 1 — eager `'grid'` LoadStage + `store.grid` (commit `48582c2`):**
- `src/reader/types.ts`: `LoadStage` union extended with `"grid"` between `"metadata"` and `"ready"`.
- `src/state/store.ts`: imported `extractCoords`/`readGridGeometry` (scanCoords) + `buildImagingGrid` (imaging/grid) + the `ImagingGrid` type; added `grid: ImagingGrid | null` to `State` and `initialState` (`grid: null`). In `runLoad`, after the metadata computations and before the final `ready` set, inserted `set({ stage: "grid" }); await yieldFrame();` then a guarded build: `if (capabilities.isImaging) { grid = extractCoords(reader) ? buildImagingGrid(...) : null }`. Non-imaging files leave `grid: null` and reach `ready` with **NO error** (D-06).
- `src/state/store.test.ts`: added `grid: null` to the reset; mocked `../reader/scanCoords` + `../imaging/grid`; added (a) an imaging-path test asserting the stage sequence passes through `"grid"`, `grid` is non-null, and `filledCount === uniqueCoordCount`; (b) a non-imaging test (default `isImaging:false` mock) asserting `grid === null`, `stage === "ready"`, `error === null`.

**Task 2 — `GridDiagnosticsPanel` + App/ProgressBar wiring (commit `7a9648b`):**
- `src/ui/GridDiagnosticsPanel.tsx` (new): cloned from `CapabilitiesPanel`. Reads `grid` + `capabilities`; `return null` until `capabilities` is set. Non-imaging branch (`grid === null`) renders the muted `#888` single-line notice `Not imaging data — no spatial coordinates found` (`grid-not-imaging-notice`) — no expand, no table, never the ErrorBanner. Imaging branch renders the `grid-panel` `<section>` with a clickable `grid-summary-line` / `grid-expand-toggle` disclosure (`aria-expanded`, `▸`/`▾`, keyboard-operable) computing `pct` and the anomaly flag (amber `#8a6d00` + `⚠ ` + `grid-anomaly-warning`). On expand, the `grid-diagnostics-table` shows Dimensions / Fill / Spectra / Missing / Duplicates / Pixel size / Coord source / Discovery check per the UI-SPEC copy, using `toLocaleString()` and `×` (U+00D7).
- `src/ui/App.tsx`: imported and mounted `<GridDiagnosticsPanel />` immediately after `<CapabilitiesPanel />` in the left `<aside>`; added `"grid"` to the `loading` flag; added the `stage === "grid" ? "Building imaging grid…"` arm to the hidden stage sentinel.
- `src/ui/ProgressBar.tsx`: added the `"grid"` step + `"Building imaging grid…"` label (Rule 3 — `Record<LoadStage,string>` completeness) and `"grid"` to the spinner `isLoading` condition.

## How It Was Verified

- `npx vitest run src/state/store.test.ts` → 5 passed (imaging + non-imaging grid paths green).
- `npx vitest run` (full suite) → **73 passed, 1 skipped** (8 files; the 1 skip is the 02-02 PXD001283 unlock test). No prior test broken.
- `npx tsc --noEmit` → exit 0.
- `npm run lint` → clean.
- `npm run build` → built (pre-existing WASM chunk-size warning only).
- `grep -n "#b71c1c" src/ui/GridDiagnosticsPanel.tsx` → empty (no error red).
- All six UI-SPEC testids present: `grid-panel`, `grid-summary-line`, `grid-expand-toggle`, `grid-diagnostics-table`, `grid-not-imaging-notice`, `grid-anomaly-warning`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ProgressBar.tsx` `Record<LoadStage,string>` missing the new `'grid'` key**
- **Found during:** Task 2 `npm run build` (`tsc -b`).
- **Issue:** Extending `LoadStage` with `"grid"` (Task 1) made `STAGE_LABEL: Record<LoadStage, string>` in `ProgressBar.tsx` incomplete — `TS2741: Property 'grid' is missing`. Directly caused by this plan's LoadStage change (in scope).
- **Fix:** Added the `grid: "Building imaging grid…"` label, inserted `"grid"` into the visible `STAGES` step array between `metadata` and `ready`, and added `"grid"` to the spinner `isLoading` condition (consistent with the App loading flag and LOAD-03).
- **Files modified:** `src/ui/ProgressBar.tsx`.
- **Commit:** folded into Task 2 `7a9648b`.

**2. [Rule 3 - Blocking] `mzpeakts` build artifacts absent in the worktree**
- **Found during:** full `npm run build` + the 5 reader test files (`Cannot find package 'mzpeakts'`).
- **Issue:** This fresh worktree had neither `node_modules/mzpeakts` nor `vendor/mzpeakts/lib/dist` — the submodule is built/linked only in the main checkout. Pre-existing condition, identical to what 02-01 and 02-02 documented; unrelated to this plan's source.
- **Fix:** Copied the already-built `node_modules/mzpeakts` and `vendor/mzpeakts/lib` from the main checkout into the worktree (the same pinned, Phase-1-audited artifact — NOT a package install, no registry fetch, no source change to vendored code). The submodule pointer is unchanged; nothing is staged for commit.
- **Files modified:** none committed (build-environment population only).
- **Commit:** n/a (untracked vendor/node_modules).

## Threat Model Outcome

- **T-02-03-MISCLASS (Spoofing, mitigate):** implemented — non-imaging is `grid: null` + a muted notice; the store sets NO error and reaches `ready`. `store.test` asserts `error === null` on the non-imaging path.
- **T-02-03-XSS (Tampering, mitigate):** honored — the panel renders only numeric/derived grid fields and fixed labels via React's default text escaping; no `dangerouslySetInnerHTML`. The one file-derived string surfaced (`discoveryDisagreement`) is escaped text content.
- **T-02-03-SC (Supply chain, accept):** honored — zero package installs.

## Known Stubs

None. The grid stage is fully wired to the real `extractCoords`/`readGridGeometry`/`buildImagingGrid`; the panel binds every diagnostics field. The store-test imaging path uses module mocks (offline determinism), not a UI stub — the production `runLoad` calls the real functions. The PXD001283 real-Arrow validation remains the `test.skipIf`-gated unlock test owned by 02-02.

## Threat Flags

None. No new network endpoints, auth paths, file-access patterns, or schema changes. The only data crossing into the panel is the already-validated in-memory `ImagingGrid` POJO (the boundary already declared in the plan's threat model).

## Self-Check: PASSED

- FOUND: src/ui/GridDiagnosticsPanel.tsx
- FOUND: src/reader/types.ts ("grid" in LoadStage)
- FOUND: src/state/store.ts (grid stage + grid field)
- FOUND commit 48582c2 (Task 1), 7a9648b (Task 2)
