---
phase: 03-tic-image-pixel-spectrum-round-trip
verified: 2026-06-03T14:35:00Z
status: human_needed
score: 8/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Load an imaging .mzpeak file (PXD001283 or any imaging fixture). Confirm the TIC heatmap appears immediately when the layout transitions from 'Building TIC image...' to 'Ready'. Confirm absent pixels appear visually distinct (near-black #1a1a1a sentinel) from low-intensity colormap pixels."
    expected: "TIC heatmap is rendered on the canvas within the same frame the ready state is reached; absent sparse pixels are clearly darker than the viridis colormap bottom (dark purple)."
    why_human: "Cannot drive canvas rendering or verify visual color appearance from grep. No imaging .mzpeak fixture in test/data/ — only synthetic unit fixtures exist (RESEARCH Pitfall 3)."
  - test: "Hover over the TIC canvas. Move over present pixels, absent pixels, and off the edge of the canvas."
    expected: "Present pixels show '1-based x, y · TIC: <value>'. Absent pixels show 'x: N, y: M — no data' in muted color. Hover readout clears on mouse-leave."
    why_human: "Event handler behavior (onMouseMove, onMouseLeave) cannot be verified without a running browser or component test mounting a canvas."
  - test: "Click a present pixel in the TIC canvas. Then click an absent/gap pixel."
    expected: "Clicking a present pixel updates the SpectrumPanel to show that pixel's spectrum in uPlot with a 1px contrast ring drawn on the clicked pixel. The SpectrumPanel heading reads 'Spectrum — pixel (x, y)'. Clicking an absent pixel does nothing (no spectrum change, no ring)."
    why_human: "The pixel-click → selectSpectrum path and the selection ring paint are exercised only through React event handlers on a live canvas. No component or e2e test covers ImagingPanel event handling (confirmed by Codex round2 finding #6 and plan 03-04 adjudication item)."
  - test: "Open a non-imaging .mzpeak file."
    expected: "SpectrumPanel renders alone with no ImagingPanel or empty canvas visible."
    why_human: "Layout conditional (grid !== null) and React rendering output require a browser to verify visually."
gaps:
  - truth: "Clicking a pixel shows that pixel's full spectrum in a fast uPlot chart with zoom/pan, reading from the correct signal file per MS_1000525 (ROADMAP SC3 / SPEC-01)"
    status: partial
    reason: "The selectSpectrum wiring from click event to uPlot is present in code, and representation routing is proven by unit tests, but no automated test exercises the ImagingPanel click handler end-to-end. Codex round2 explicitly flags this as unproven automated coverage (finding #6). Human verification is required to confirm the click→spectrum round-trip actually functions."
    artifacts:
      - path: "src/ui/ImagingPanel.tsx"
        issue: "onClick handler and selectSpectrum call are present in code but no automated test covers them. The plan's acceptance criteria for click behavior were grep-only."
    missing:
      - "End-to-end or component test exercising the ImagingPanel click handler → selectSpectrum → SpectrumPanel update path"
deferred: []
---

# Phase 3: TIC Image + Pixel→Spectrum Round-Trip Verification Report

**Phase Goal:** A user sees a TIC spatial overview the moment an imaging file loads, can click any pixel, and sees that pixel's full spectrum — completing the Core Value round-trip with minimal surface and validating the grid→sum→rasterize→paint→hit-test pipeline.
**Verified:** 2026-06-03T14:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | App renders a TIC image as the default spatial overview immediately after grid reconstruction (ROADMAP SC1) | VERIFIED | `store.ts:160` sets stage "tic" then calls `extractXIC(null, null, useProfile)` + `buildTic`; `App.tsx:22` includes `"tic"` in loading boolean; `"tic"` arm in stage sentinel renders "Building TIC image…"; `ImagingPanel.tsx` paint useEffect calls `rasterizeTic` + `putImageData` |
| 2 | Hovering the image shows pixel's 1-based x/y and intensity readout with fixed orientation, no flip, pixel aspect honored (ROADMAP SC2) | UNCERTAIN | Code is correct: `ImagingPanel.tsx:135` reads `grid.coordinateBase`, `hit.x0 + base` in readout; no flip in key formula `y0*grid.width+x0`; `pixelSizeUm` drives CSS `aspectRatio`. Hover readout behavior requires human browser test. |
| 3 | Clicking a pixel displays that pixel's full spectrum reading from the correct signal file per MS_1000525 (ROADMAP SC3 / SPEC-01) | UNCERTAIN | The code path is correct end-to-end: `onClick` → `presenceMask` guard → `coordToSpectrumIndex.get(hit.key)` → `selectSpectrum(idx)` → `spectrumMeta` + `getSpectrumArraysFor` (representation-routed). Unit tests prove routing. Click handler behavior requires human browser test (no component/e2e test). |
| 4 | Missing pixels (sparse acquisitions) render distinctly from genuine zero-intensity pixels (ROADMAP SC4) | VERIFIED | `rasterize.ts` writes `SENTINEL [26,26,26,255]` for `presenceMask[k]===0`, colormap for present cells; `rasterize.test.ts` Test 2 proves sentinel ≠ colormap(0); `tic.test.ts` Test 4 proves absent cells stay 0 in TIC |
| 5 | buildTic sums each spectrum's full intensity array onto the correct grid cell (no flip/transpose) | VERIFIED | `tic.ts:66` converts bigint with `Number(point.index)`, inverts `coordToSpectrumIndex` to scatter; `tic.test.ts` Test 1 (sum), Test 2 (orientation), Test 3 (bigint) all pass |
| 6 | Absent pixels render to sentinel, zero-intensity present pixels render to colormap bottom (distinct) | VERIFIED | `rasterize.ts` sentinel branch; `rasterize.test.ts` Tests 2, 3 pass |
| 7 | A spectrum read routes by MS:1000525 representation, not try-order | VERIFIED | `arrays.ts` exports `getSpectrumArraysFor`; `store.ts:245` calls `spectrumMeta(reader, index)` then `getSpectrumArraysFor(reader, index, meta.representation)`; `arrays.test.ts` 4 routing tests pass |
| 8 | A routed source with no rows fails loud with a named error | VERIFIED | `arrays.ts:71` throws `Spectrum N: centroid representation but spectra_peaks has no rows`; `arrays.test.ts` Test 4 proves it |
| 9 | ImagingPanel renders for imaging files only; non-imaging files get SpectrumPanel alone | VERIFIED | `App.tsx:87` conditional `grid !== null ? <ImagingPanel/><SpectrumPanel/> : <SpectrumPanel/>` |

**Score:** 8/9 — 6 VERIFIED, 2 UNCERTAIN (require human), 1 UNCERTAIN classified as gap (SPEC-01 click path, no automated coverage)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/compute/tic.ts` | buildTic(xic, grid) → Float32Array | VERIFIED | Exists, exports `buildTic`, contains `"intensity array"`, `Number(point.index)`, inverts `coordToSpectrumIndex`, no vendor runtime imports |
| `src/compute/tic.test.ts` | 5 synthetic-fixture unit tests | VERIFIED | 5 tests pass (12 assertions in 2 files per suite output) |
| `src/ui/rasterize.ts` | rasterizeTic + viridis exports | VERIFIED | Exists, exports `rasterizeTic` and `viridis`, sentinel `0x1a`, `presenceMask` filter for percentile, no React/DOM imports |
| `src/ui/rasterize.test.ts` | 6 unit tests + viridis sanity | VERIFIED | 7 tests pass (6 plan + 1 viridis sanity) |
| `src/reader/types.ts` | LoadStage with "tic" member | VERIFIED | `"tic"` present between `"grid"` and `"ready"` at line 82 |
| `src/reader/arrays.ts` | getSpectrumArrays + getSpectrumArraysFor | VERIFIED | Both exports present; `getSpectrumArraysFor` branches on `representation === "centroid"` |
| `src/reader/arrays.test.ts` | Mock-reader DATA-03 routing tests | VERIFIED | `getSpectrumArraysFor — DATA-03 representation routing` describe block present; 17 tests pass total |
| `src/state/store.ts` | tic slice + "tic" stage in runLoad + useProfile + routing | VERIFIED | `tic: Float32Array | null`, `mixedRepresentationWarning: string | null`, `set({ stage: "tic" })`, `extractXIC(null, null, useProfile)`, `buildTic`, `getSpectrumArraysFor` all present |
| `src/ui/ImagingPanel.tsx` | Canvas TIC + hover + click + ring | VERIFIED (code) | Exports `ImagingPanel`, `data-testid="tic-canvas"`, `data-testid="tic-hover-readout"`, `putImageData`, `strokeRect`, `getBoundingClientRect` (no `offsetX`), `coordinateBase`, `presenceMask` guard on click, `pixelSizeUm` aspect |
| `src/ui/App.tsx` | ImagingPanel conditional + tic in loading + stage sentinel | VERIFIED | `ImagingPanel` imported; `stage === "tic"` in loading; `"tic" → "Building TIC image…"` arm; `grid !== null` conditional render |
| `src/ui/SpectrumPanel.tsx` | pixel-aware heading + SPEC-02 mzWindow placeholder | VERIFIED | `mzWindow?: MzWindow | null` prop with SPEC-02 comment; heading `Spectrum — pixel (${x1}, ${y1})` when imaging; `data-testid="spectrum-index"` retained |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `store.ts runLoad` | `buildTic` + `reader.extractXIC` | "tic" stage after "grid", `if (grid)` guard | VERIFIED | `store.ts:181` calls `extractXIC(null, null, useProfile)`; `store.ts:184` calls `buildTic(xic, grid)` |
| `ImagingPanel.tsx` | `rasterize.ts rasterizeTic` + `coordToSpectrumIndex` | `putImageData` + hit-test | VERIFIED | `ImagingPanel.tsx:90` calls `rasterizeTic`; `ImagingPanel.tsx:170` reads `coordToSpectrumIndex.get(hit.key)` |
| `App.tsx` | `ImagingPanel.tsx` | `grid !== null` conditional render | VERIFIED | `App.tsx:87,97` |
| `store.ts selectSpectrum` | `arrays.ts getSpectrumArraysFor` | `spectrumMeta(...).representation` | VERIFIED | `store.ts:245-249` |
| `ImagingPanel.tsx onClick` | `store.ts selectSpectrum` | `presenceMask` guard then call | VERIFIED (code) | `ImagingPanel.tsx:169-171`; behavior requires human test |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `ImagingPanel.tsx` | `tic: Float32Array` | `store.ts` → `extractXIC(null,null,useProfile)` → `buildTic` | YES — actual reader call producing summed intensity array | FLOWING |
| `ImagingPanel.tsx` | `grid: ImagingGrid` | `store.ts` → Phase 2 `buildImagingGrid` | YES — from Phase 2, verified | FLOWING |
| `SpectrumPanel.tsx` | `selectedSpectrum: SpectrumArrays` | `selectSpectrum` → `getSpectrumArraysFor` → `reader.getSpectrum` | YES — actual reader call | FLOWING |

### Behavioral Spot-Checks

No runnable entry points available for canvas/event testing without a browser. Unit test suite used instead.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| buildTic sum + orientation | `npx vitest run src/compute/tic.test.ts` | 5 tests pass | PASS |
| rasterizeTic sentinel/clip/colormap | `npx vitest run src/ui/rasterize.test.ts` | 7 tests pass | PASS |
| DATA-03 representation routing | `npx vitest run src/reader/arrays.test.ts` | 17 tests pass | PASS |
| Full suite | `npx vitest run` | 95 passed, 1 skipped | PASS |
| Build | `npm run build` | Exit 0, Vite build successful | PASS |
| TypeScript | `npx tsc -b` (via build) | No type errors | PASS |

### Probe Execution

No probe scripts declared or found for this phase (`scripts/*/tests/probe-*.sh` not present).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| IMAGE-01 | 03-01, 03-03 | TIC as default spatial overview | SATISFIED | `buildTic` + eager `'tic'` store stage + `ImagingPanel` paint pass; 5 compute tests |
| IMAGE-04 | 03-01, 03-03 | Hover readout + fixed orientation + absent≠zero | PARTIALLY SATISFIED | Orientation/sentinel verified by tests; hover readout requires human browser test |
| SPEC-01 | 03-02, 03-03 | Click pixel → spectrum from correct signal file | PARTIALLY SATISFIED | Signal routing proven by unit tests; click handler behavior requires human test |
| SPEC-02 | 03-03 | m/z window marker on spectrum | ARCHITECTURALLY SCAFFOLDED | `mzWindow` prop present as no-op; no marker drawn (Phase 4 gated). ROADMAP note: "owned by Phase 3 for coverage and reinforced in Phase 4." |
| DATA-03 | 03-02 | Route reads by MS:1000525 representation | SATISFIED | `getSpectrumArraysFor` + `selectSpectrum` rewire; 4 routing tests + representation-routed store; `arrays.test.ts` 17 tests pass |

**SPEC-02 note:** REQUIREMENTS.md marks SPEC-02 "Complete" at Phase 3, and ROADMAP explicitly documents the deferral ("first satisfied in Phase 3 (window = none/TIC context)... reinforced in Phase 4"). This is a roadmap-sanctioned interpretation: the requirement is satisfied by the architectural placeholder with no marker possible before m/z state exists. Phase 4 owns the visual marker. Codex flagged this as a finding; the operator acknowledged it as adjudication item #4.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/SpectrumPanel.tsx` | 30 | `void _props.mzWindow` (intentional no-op) | INFO | SPEC-02 architectural placeholder — plan-sanctioned, Phase-4-gated. Not a blocker. |

No `TBD`, `FIXME`, or `XXX` markers found in any Phase-3 source files.

No stub anti-patterns found — all compute functions return real data; no `return null` / `return []` / `return {}` in rendering paths except for the `if (!grid) return null` early-return in `ImagingPanel` (correct guard, not a stub).

### Human Verification Required

#### 1. TIC Heatmap Renders on File Load

**Test:** Load an imaging .mzpeak file. Observe the right panel as the file loads through the staged progress ("Building imaging grid…" → "Building TIC image…" → "Ready").
**Expected:** A TIC heatmap appears on the canvas immediately when "Ready" is reached. Absent/sparse pixels appear as near-black (#1a1a1a sentinel), visually distinct from the dark-purple colormap bottom.
**Why human:** Canvas rendering and color appearance cannot be verified programmatically without a running browser and an imaging fixture file.

#### 2. Hover Readout Behavior

**Test:** Hover over present pixels, absent pixels, and the canvas edge. Then move the mouse off the canvas.
**Expected:** Present pixels show "x: N, y: M · TIC: value" (1-based coordinates). Absent pixels show "x: N, y: M — no data" in muted color. Readout clears completely on mouse-leave (empty string).
**Why human:** MouseEvent behavior on a scaled canvas requires a live browser. `getBoundingClientRect`-based hit-test correctness cannot be verified by grep.

#### 3. Pixel Click → Spectrum + Selection Ring

**Test:** Click a present pixel on the TIC canvas. Observe the SpectrumPanel. Then click an absent pixel.
**Expected:** Clicking a present pixel: (a) SpectrumPanel heading updates to "Spectrum — pixel (x, y)" with 1-based coords; (b) uPlot chart updates to show that pixel's spectrum; (c) a 1px contrast ring appears on the clicked pixel on the canvas. Clicking an absent pixel: nothing changes.
**Why human:** The ImagingPanel click handler path (onClick → selectSpectrum → getSpectrumArraysFor → uPlot setData + ring repaint) has no automated component or e2e test coverage. Codex round2 explicitly identifies this as the primary unproven behavior (finding #6, adjudication item #6).

#### 4. Non-Imaging File Layout

**Test:** Open a non-imaging (LC-MS) .mzpeak file.
**Expected:** Only the SpectrumPanel renders in the right pane. No empty canvas, no ImagingPanel section, no TIC-related error message.
**Why human:** React conditional rendering output requires a browser to confirm. The `grid !== null` guard is verified in code but not exercised by any test against a real non-imaging file.

### Gaps Summary

The core round-trip is wired correctly in code: TIC computation, rasterization, canvas painting, hover readout, click→selectSpectrum, selection ring, representation routing, and SpectrumPanel heading are all present and substantive. The 95/96 unit tests pass; the build is clean.

The single gap: **no automated test exercises the ImagingPanel click handler end-to-end.** The test suite covers all pure compute functions (buildTic, rasterizeTic) and the representation routing logic (getSpectrumArraysFor, store.selectSpectrum), but ImagingPanel's onClick/onMouseMove/onMouseLeave events, the ring repaint, and the full click→uPlot update path are only verified by code grep + human-check. This was acknowledged by Codex round2 (finding #6) and by the operator as adjudication item #6. For a v1 orientation tool, human verification is the accepted gate.

**Codex verdicts:** Both round1 and round2 returned `accept-with-revisions`. The operator received 8 adjudication items (4 high/medium, 4 medium/low). The three items that could affect Phase 3 status: (a) SPEC-02 is confirmed as a phase-3 architectural scaffold per the ROADMAP note; (b) DATA-03 routing interpretation (array-source selection vs file-handle isolation) is an explicit interpretation call surfaced to the operator; (c) round-trip click behavior requires human verification. None of these is a code correctness failure — they are documentation/test coverage gaps and one open interpretation.

---

_Verified: 2026-06-03T14:35:00Z_
_Verifier: Claude (gsd-verifier)_
