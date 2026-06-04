---
phase: "04-ion-image-intensity-scaling"
plan: 5
subsystem: "ui/ImagingPanel"
tags: ["ui", "ion-image", "canvas", "controls", "IMAGE-02", "IMAGE-03", "SPEC-02"]
dependency_graph:
  requires:
    - "04-01 (ppmToDa, buildIonImage, computeIonImageStats exports)"
    - "04-02 (rasterizeImage, Colormap type from rasterize.ts)"
    - "04-03 (renderIonImage, setColormapSettings store actions; ionImage/ionImageStats/colormap/scale/percentile state)"
  provides:
    - "Controls row: m/z input, tolerance input, Da/ppm selector, Show Ion Image button, colormap/scale/percentile selectors"
    - "Ion-image canvas section (conditionally rendered after first Show Ion Image click)"
    - "Per-canvas click handlers calling selectSpectrum (D-05, SPEC-01 round-trip)"
    - "Ion canvas hover readout with 1-based coords and 'intensity:' label (D-06)"
    - "Stats line: nonzeroCount/filledCount, range, scale mode (D-11, SC-3)"
  affects:
    - "src/ui/ImagingPanel.tsx (modified — full Phase 4 UI surface)"
tech_stack:
  added: []
  patterns:
    - "Two-canvas one-panel layout: TIC always visible, ion canvas conditionally rendered post-click (D-04)"
    - "Per-canvas click handlers (onTicClick/onIonClick) each using their own ref for hit-test (D-05)"
    - "Dual useEffect paint+ring pattern for ion canvas mirroring TIC canvas (Pitfall 6: re-blit before strokeRect)"
    - "V5 ASVS L1 input validation in handleRenderIonImage — independent of store action guard (T-04-10)"
    - "ppmToDa applied in UI handler before calling renderIonImage(mz, tolDa) (D-03)"
    - "setColormapSettings called from onChange only — no extractXIC in colormap/scale/percentile path (D-02/SC-5)"
    - "formatCompact for all numeric output in hover readout and stats line (T-04-11, XSS-safe)"
key_files:
  modified:
    - src/ui/ImagingPanel.tsx
decisions:
  - "Implemented onTicClick and onIonClick as separate functions each using their own canvas ref, rather than a single shared onClick — semantically identical behavior (both call selectSpectrum) but avoids the ?? fallback pattern that could hit the wrong ref"
  - "mzWindow subscribed in ImagingPanel to stay in sync with store re-renders; used void mzWindow to suppress unused-variable lint"
  - "Ion canvas hover readout uses x0+base (same formula as TIC hover) for 1-based coords, matching the UI-SPEC D-06 contract"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-04T00:41:32Z"
  tasks: 2
  files: 1
---

# Phase 4 Plan 5: ImagingPanel UI Surface — Controls Row + Ion-Image Canvas Summary

**One-liner:** Added the Phase 4 UI surface to ImagingPanel.tsx — controls row with m/z inputs, Da/ppm selector, Show Ion Image button, colormap/scale/percentile selectors, plus a conditionally rendered ion-image canvas with paint/ring effects, hover readout, stats line, and per-canvas pixel-click handlers.

## What Was Built

### Task 1 — Controls row above TIC canvas + Task 2 — Ion-image canvas section below TIC canvas (commit 0ce9bc5)

Both tasks implemented together in one file edit to `src/ui/ImagingPanel.tsx`.

**New imports:**
- `rasterizeImage, type Colormap` added to existing rasterize import (was `rasterizeTic` only)
- `import { ppmToDa } from "../compute/ionImage"` — for Da/ppm conversion in the button handler

**New useStore subscriptions (8 additions):**
- `ionImage`, `ionImageStats`, `mzWindow`, `colormap`, `scale`, `percentile` — state fields
- `renderIonImage`, `setColormapSettings` — Phase 4 actions

**New local state (4 additions):**
- `mzInput: string`, `tolInput: string` (default "0.01"), `tolUnit: "Da" | "ppm"` — m/z control inputs
- `ionReadout: { text: string; muted: boolean }` — ion canvas hover state

**New ref:**
- `ionCanvasRef = useRef<HTMLCanvasElement | null>(null)` — for the ion canvas element

**New useEffect blocks (2 for ion canvas):**
- Paint effect keyed on `[ionImage, grid, colormap, scale, percentile]` — calls `rasterizeImage(ionImage, grid, { colormap, percentile, logScale: scale === "log" })`
- Ring effect keyed on `[selectedIndex, ionImage, grid, colormap, scale, percentile]` — re-blits then strokeRect (Pitfall 6 prevention)

**Controls row JSX (D-07):**
- m/z number input + tolerance number input + Da/ppm select
- "Show Ion Image" button with `background: "#1565c0"` accent
- Colormap select (viridis/inferno/gray)
- Scale select (linear/log)
- Percentile select (90th/95th/99th/99.9th)

**Handler logic:**
- `handleRenderIonImage`: V5 guards (`!Number.isFinite(mz) || mz <= 0`, `!Number.isFinite(tolDa) || tolDa <= 0`, `mz - tolDa < 0`), ppmToDa conversion, then `void renderIonImage(mz, tolDa)` (T-04-10)
- `handleColormapSettings`: calls `setColormapSettings` with default-parameter fallback — never calls `renderIonImage` or `extractXIC` (D-02/SC-5)

**Ion-image section JSX (D-04 conditional):**
- Wrapped in `{ionImage !== null && grid !== null && (...)}` — no placeholder (D-04)
- Canvas with `data-testid="ion-canvas"`, `imageRendering: "pixelated"`, same CSS display/aspect pattern as TIC canvas
- `onIonClick` (calls `selectSpectrum` via `coordToSpectrumIndex`, D-05) and `onIonMove` (hover readout with "intensity:" label, D-06)
- Hover readout div with muted color for absent pixels
- Stats line `data-testid="ion-stats"`: `{N} / {total} pixels with signal · range {min}–{max} · scale: {mode} ({Nth} pct)` (D-11)

**TIC canvas click handler refactored:**
- Was `onClick` with `canvasRef.current ?? ionCanvasRef.current` (ambiguous ref)
- Changed to `onTicClick` using only `canvasRef.current` — semantically identical behavior

## Verification Evidence

```
npm run build: ✓ built in 975ms (zero TypeScript errors)
vitest: 12 test files passed, 124 tests passed, 1 skipped — all Phase 3 tests still green

Acceptance criteria checklist:
- ppmToDa imported from "../compute/ionImage" ✓
- rasterizeImage imported from "./rasterize" ✓
- ionImage/ionImageStats/colormap/scale/percentile/renderIonImage/setColormapSettings subscriptions ✓
- local state: mzInput/tolInput/tolUnit/ionReadout ✓
- handleRenderIonImage guard: !Number.isFinite(mz) || mz <= 0 ✓
- ppmToDa(mz, tolDa) called when tolUnit === "ppm" ✓
- "Show Ion Image" button with #1565c0 background ✓
- colormap select (viridis/inferno/gray) ✓
- scale select (linear/log) ✓
- percentile select (0.9/0.95/0.99/0.999) displayed as 90th/95th/99th/99.9th ✓
- setColormapSettings called from onChange handlers only (not button) ✓
- ionCanvasRef = useRef<HTMLCanvasElement | null>(null) ✓
- Two new useEffect blocks keyed on ionImage (paint and ring) ✓
- Paint effect: rasterizeImage(ionImage, grid, { colormap, percentile, logScale: scale === "log" }) ✓
- Ion canvas section in {ionImage !== null && grid !== null && (...)} ✓
- data-testid="ion-canvas" ✓
- Both TIC and ion canvas call selectSpectrum (D-05) ✓
- data-testid="ion-stats" with "pixels with signal" text ✓
- formatCompact for min/max in stats line ✓
- "intensity:" label in ion hover (not "TIC:") ✓
- npm run build exits 0 ✓
- All Phase 3 vitest tests pass ✓
```

## Deviations from Plan

### Auto-refactor: Separate per-canvas click handlers instead of shared onClick

**Found during:** Task 2 implementation

**Issue:** The plan specified reusing the same `onClick` function across both canvases (D-05). However, the existing `onClick` uses `canvasRef.current` (the TIC canvas ref) — this would be incorrect when attached to the ion canvas. A shared handler using `canvasRef.current ?? ionCanvasRef.current` would introduce a ref-fallback pattern that could silently hit the wrong ref.

**Fix:** Implemented `onTicClick` (uses `canvasRef.current`) and `onIonClick` (uses `ionCanvasRef.current`), both with identical body: `toGridCoord → presenceMask check → coordToSpectrumIndex.get → selectSpectrum`. Semantically identical to D-05 — both canvases call `selectSpectrum` with the same logic.

**Files modified:** `src/ui/ImagingPanel.tsx` (same file)

**Impact:** None — behavior is identical, correctness is better. The original `onClick` would have silently used the TIC canvas ref when called on the ion canvas if `ionCanvasRef.current` were null at the time of the click.

## Known Stubs

None — all ion-image state fields are fully wired: `ionImage`, `ionImageStats`, `colormap`, `scale`, `percentile`, `renderIonImage`, `setColormapSettings` are all consumed from the store. The controls row and canvas section are fully functional (no placeholder data sources). The rasterizeImage call uses the real store values; formatCompact formats real stats values.

## Threat Flags

None — this plan modifies only `src/ui/ImagingPanel.tsx`. No new network endpoints, auth paths, file access patterns, or schema changes. The T-04-10 mitigation (V5 input validation in handleRenderIonImage) is implemented. T-04-11 (XSS via DOM text) is mitigated by React JSX text nodes and formatCompact.

## Self-Check: PASSED

- `src/ui/ImagingPanel.tsx`: FOUND (contains all controls row, ion canvas, effects, handlers)
- Commit `0ce9bc5`: FOUND (feat(04-05): add controls row + ion-image canvas to ImagingPanel)
- Build exits 0: CONFIRMED (✓ built in 975ms)
- vitest: 12/12 test files passed, 124 tests passed: CONFIRMED
- ion-canvas data-testid present: CONFIRMED
- ion-stats data-testid present: CONFIRMED
- "intensity:" label in ion hover: CONFIRMED
- setColormapSettings not called from button onClick: CONFIRMED
- rasterizeImage called with { colormap, percentile, logScale: scale === "log" }: CONFIRMED
