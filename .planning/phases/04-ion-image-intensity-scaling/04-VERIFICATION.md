---
phase: "04-ion-image-intensity-scaling"
verified: "2026-06-03T18:20:00Z"
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "The colorbar is labeled with the aggregation statistic and scale mode"
    reason: "Operator accepted text stats line (data-testid=ion-stats) as satisfying SC-2. Stats line renders nonzeroCount/filledCount, min–max range, scale mode, and Nth percentile on every ion image render. No visual gradient bar is required."
    accepted_by: "operator"
    accepted_at: "2026-06-03T18:15:00Z"
re_verification:
  previous_status: gaps_found
  previous_score: 12/14
  gaps_closed:
    - "Inferno LUT flat-top defect (CR-01): INFERNO_STOPS[7] corrected to [249,201,52]; monotonic-luminance test extended to cover t=0,0.25,0.5,0.75,0.875,1.0 — 20/20 rasterize tests pass"
    - "WR-01 (mzWindow on null XIC): mzWindow is now conditionally null — store.ts:295 sets `mzWindow: ionImage ? { mz, tolDa } : null`"
    - "WR-02 (percentile formula): changed to Math.ceil(p*n)-1 — rasterize.ts:128 confirmed"
    - "WR-03 (dead mzWindow subscription): mzWindow no longer subscribed in ImagingPanel.tsx — grep confirms zero occurrences"
    - "Gap 2 (colorbar): ACCEPTED by operator override — text stats line satisfies SC-2"
    - "REQUIREMENTS.md IMAGE-02/IMAGE-03: updated to [x] Complete"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Enter a valid m/z and Da tolerance, click Show Ion Image, verify ion image canvas renders"
    expected: "Ion image canvas appears below TIC canvas with viridis colormap applied; stats line shows pixel count and range"
    why_human: "Canvas rendering requires browser execution; cannot verify canvas pixel content via grep"
  - test: "With an ion image displayed, change colormap to inferno or gray — verify recolor without spinner or network request"
    expected: "Canvas recolors immediately; no loading indicator; browser DevTools shows no new network request"
    why_human: "Requires browser interaction and DevTools observation to confirm no extractXIC re-query"
  - test: "Click a pixel on the ion image canvas — verify spectrum panel shows SPEC-02 amber band"
    expected: "uPlot spectrum redraws with a translucent amber band over [mz-tolDa, mz+tolDa]; band is not present before Show Ion Image is clicked"
    why_human: "uPlot canvas draw hook produces a visual Canvas 2D band — not testable via DOM inspection"
  - test: "Load a file, click Show Ion Image with log scale enabled, verify no false-blank image"
    expected: "Log scaling reveals low-intensity signal; image is not entirely blank on a high-dynamic-range file"
    why_human: "Requires real mzPeak file and visual inspection to confirm log scaling renders structure correctly"
  - test: "With tolerance unit set to ppm, enter an m/z and ppm tolerance, click Show Ion Image"
    expected: "Ion image renders the correct m/z window (ppmToDa conversion applied before query)"
    why_human: "Correct ppm-to-Da conversion requires a real file to confirm the m/z window matches expected signal"
---

# Phase 4: Ion Image + Intensity Scaling — Verification Report

**Phase Goal:** A user can enter an m/z with a Da or ppm tolerance and see a correct ion image, choose colormaps and linear/log + percentile-clip scaling, and see the selected m/z window marked on the clicked-pixel spectrum — the headline deliverable, layered on the proven TIC pipeline.
**Verified:** 2026-06-03T18:20:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous status: gaps_found, score 12/14)

## Goal Achievement

### Observable Truths

All 14 truths verified. Two previously-failed items are now resolved: the Inferno LUT defect is fixed in code (VERIFIED), and the colorbar gap is accepted via operator override (PASSED override).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User enters m/z + Da or ppm tolerance and sees corresponding ion image via extractXIC | VERIFIED | `renderIonImage` in store.ts:279-298 calls `reader.extractXIC(null, {start:mz-tolDa, end:mz+tolDa}, useProfile)` then `buildIonImage`; ppmToDa applied in ImagingPanel handler before calling renderIonImage (ImagingPanel.tsx:287) |
| 2 | User can choose colormap (viridis/inferno/gray) and scaling mode (linear/log) with percentile clipping | VERIFIED | `rasterizeImage` in rasterize.ts accepts `RasterizeOpts{colormap, percentile, logScale}` with switch dispatch; ImagingPanel.tsx has three selects wired to `setColormapSettings` |
| 3 | App shows nonzero-pixel count and value-range so "blank because scaling" is never confused with "blank because absent" | VERIFIED | Stats line at ImagingPanel.tsx:464-474 renders `{ionImageStats.nonzeroCount} / {grid.filledCount} pixels with signal · range {min}–{max} · scale: {scale} ({Nth} pct)` with `data-testid="ion-stats"` |
| 4 | The colorbar is labeled with the aggregation statistic and scale mode | PASSED (override) | Override: operator accepted text stats line (data-testid=ion-stats) as satisfying SC-2 — shows nonzeroCount/filledCount, range, scale mode, and Nth percentile in text |
| 5 | Changing colormap or scale recolors the cached raster without re-querying the file | VERIFIED | `setColormapSettings` in store.ts:304-306 is a pure `set({colormap, scale, percentile})` — no extractXIC, no reader reference. Ion canvas paint useEffect keys on `[ionImage, grid, colormap, scale, percentile]` — recolors from cached ionImage |
| 6 | SPEC-02: selected m/z ± tolerance window is visually marked on the clicked-pixel spectrum | VERIFIED | SpectrumPanel.tsx hooks.draw callback (lines 79-91) draws translucent amber band via `u.valToPos` + `ctx.fillRect`; mzWindowRef synced on every mzWindow change via second useEffect (lines 133-136) |
| 7 | ppmToDa formula is correct: ppmToDa(500,10)===0.005; ppmToDa(1000,5)===0.005 | VERIFIED | ionImage.ts:51 returns `(mz * ppm) / 1e6`; 125/125 unit tests pass including ppmToDa coverage |
| 8 | buildIonImage respects C2 orientation (key = y0*width+x0, no flip) | VERIFIED | buildIonImage.ts inverts `coordToSpectrumIndex`; no flip added; cell formula is row-major as required |
| 9 | computeIonImageStats excludes absent pixels (presenceMask===0) from nonzeroCount/min/max | VERIFIED | ionImage.ts has `if (presenceMask[k] === 0) continue`; returns {0,0,0} when no present finite values; all tests pass |
| 10 | rasterizeImage generalizes rasterizeTic; rasterizeTic is a thin wrapper | VERIFIED | rasterize.ts:211-212: `rasterizeTic` body is a single `return rasterizeImage(...)` call; rasterizeImage handles all colormap dispatch |
| 11 | Log scaling uses Math.log1p so raw=0 → norm 0 exactly (never NaN) | VERIFIED | rasterize.ts:168: `denom > 0 && raw > 0 ? Math.min(Math.log1p(raw)/denom, 1) : 0` — raw=0 produces norm=0; 20/20 rasterize tests pass |
| 12 | Absent pixels render as SENTINEL [0x1a,0x1a,0x1a,255] regardless of colormap | VERIFIED | rasterize.ts:156-162: presenceMask[k]===0 branch always emits SENTINEL before colormap switch |
| 13 | Inferno LUT is monotonically distinct across full dynamic range | VERIFIED | INFERNO_STOPS[7] corrected to [249,201,52] (gold/amber); INFERNO_STOPS[8] remains [252,255,164] (pale yellow). Monotonic-luminance test now explicitly checks t=0,0.25,0.5,0.75,0.875,1.0 — all pass. 20/20 rasterize tests pass |
| 14 | Colormap changes do NOT re-query the file (D-02/SC-5) | VERIFIED | setColormapSettings in store.ts:304-306 contains only `set({colormap, scale, percentile})` — grep confirms only 2 extractXIC calls in store.ts (lines 200 and 292), neither in setColormapSettings |

**Score:** 14/14 truths verified (1 via accepted operator override)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/compute/ionImage.ts` | ppmToDa, buildIonImage, computeIonImageStats pure functions | VERIFIED | Exists, substantive, exports all three named symbols |
| `src/compute/ionImage.test.ts` | Unit tests for all three functions | VERIFIED | Tests across 4 describe blocks; all pass; makeXic uses BigInt indices |
| `src/ui/rasterize.ts` | rasterizeImage, Colormap, RasterizeOpts, inferno LUT corrected, rasterizeTic thin wrapper | VERIFIED | INFERNO_STOPS[7]=[249,201,52] confirmed at line 67; Math.ceil(p*n)-1 percentile formula at line 128; exports all required symbols |
| `src/ui/rasterize.test.ts` | Extended IMAGE-03 tests (log, percentile, colormaps, sentinel, inferno monotonic with t=0.875) | VERIFIED | 20 tests (7 Phase 3 + 13 new); monotonic-luminance test covers t=0,0.25,0.5,0.75,0.875,1.0; all pass |
| `src/state/store.ts` | Phase 4 state slice + renderIonImage + setColormapSettings | VERIFIED | 6 State fields (mzWindow, ionImage, ionImageStats, colormap, scale, percentile) + 2 Actions; mzWindow conditionally null at line 295 |
| `src/ui/SpectrumPanel.tsx` | SPEC-02 amber band via uPlot hooks.draw | VERIFIED | mzWindowRef, hooks.draw with valToPos, ctx.save/restore, second useEffect syncing ref + calling redraw |
| `src/ui/ImagingPanel.tsx` | Controls row, ion-image canvas, stats line wired to store; no dead mzWindow subscription | VERIFIED | All controls rendered; mzWindow NOT subscribed (grep finds zero occurrences); handleRenderIonImage with V5 guards; stats line with data-testid |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/compute/ionImage.ts` | `src/imaging/types.ts` | `import type { ImagingGrid }` | VERIFIED | Line 15 confirmed |
| `src/compute/ionImage.test.ts` | `src/compute/ionImage.ts` | `import { buildIonImage, computeIonImageStats, ppmToDa }` | VERIFIED | All three named exports tested; 125/125 tests pass |
| `src/state/store.ts` | `src/compute/ionImage.ts` | `import { buildIonImage, computeIonImageStats }` | VERIFIED | store.ts line 17 |
| `src/state/store.ts` | `src/ui/rasterize.ts` | `import { type Colormap }` | VERIFIED | store.ts line 18 |
| `src/ui/SpectrumPanel.tsx` | `src/state/store.ts` | `useStore(s => s.mzWindow)` | VERIFIED | SpectrumPanel.tsx line 18 |
| `src/ui/SpectrumPanel.tsx` | uPlot hooks.draw | `opts.hooks.draw + mzWindowRef.current` | VERIFIED | lines 78-93; hook reads ref, not closure |
| `src/ui/ImagingPanel.tsx` | `src/state/store.ts` | `useStore — renderIonImage, setColormapSettings, ionImage, etc.` | VERIFIED | lines 80-87: all 7 Phase 4 store subscriptions present (mzWindow correctly absent) |
| `src/ui/ImagingPanel.tsx` | `src/ui/rasterize.ts` | `rasterizeImage(ionImage, grid, {colormap, percentile, logScale})` | VERIFIED | ImagingPanel.tsx lines 157-162 |
| `src/ui/ImagingPanel.tsx` | `src/compute/ionImage.ts` | `import { ppmToDa }` | VERIFIED | ImagingPanel.tsx line 5; used in handleRenderIonImage:287 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ImagingPanel.tsx` — ion canvas | `ionImage` (Float32Array) | `renderIonImage` → `reader.extractXIC` → `buildIonImage` | Yes — XIC points aggregated per grid cell | FLOWING |
| `ImagingPanel.tsx` — stats line | `ionImageStats` | `computeIonImageStats(ionImage, grid)` | Yes — computed from live Float32Array | FLOWING |
| `SpectrumPanel.tsx` — amber band | `mzWindow` | `renderIonImage` sets `{ mzWindow: {mz, tolDa} }` only when `ionImage !== null` | Yes — set from validated user input; null when XIC returns null | FLOWING |
| `ImagingPanel.tsx` — ion canvas recolor | `colormap, scale, percentile` | `setColormapSettings` stores to Zustand; useEffect keys rerender | Yes — rasterizeImage called with live store values | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ppmToDa pure function | `npx vitest run src/compute/ionImage.test.ts` | all tests pass | PASS |
| buildIonImage + computeIonImageStats pure functions | `npx vitest run src/compute/ionImage.test.ts` | all tests pass | PASS |
| rasterizeImage log scaling, percentile, sentinel, inferno monotonic t=0.875 | `npx vitest run src/ui/rasterize.test.ts` | 20/20 tests pass | PASS |
| Full test suite (all phases) | `npx vitest run src/` | 125 passed, 1 skipped across 12 test files | PASS |
| TypeScript build | `npm run build` | Exits 0 — no TS errors; dist emitted (974ms) | PASS |
| setColormapSettings has no extractXIC | `grep -c extractXIC src/state/store.ts` + manual inspection | Only 2 actual calls (lines 200, 292); setColormapSettings contains none | PASS |
| mzWindow NOT subscribed in ImagingPanel | `grep mzWindow src/ui/ImagingPanel.tsx` | Zero occurrences — WR-03 dead subscription removed | PASS |
| mzWindow null when XIC returns null | `grep "mzWindow:" src/state/store.ts` | Line 295: `mzWindow: ionImage ? { mz, tolDa } : null` | PASS |
| Percentile formula Math.ceil(p*n)-1 | `grep "Math.ceil" src/ui/rasterize.ts` | Line 128: `Math.min(present.length - 1, Math.max(0, Math.ceil(p * present.length) - 1))` | PASS |

### Probe Execution

No probes declared for this phase (Plan 04-06 runs Codex CLI, not bash probe scripts). Step 7c: SKIPPED (no probe-*.sh files for this phase).

Codex review logs:
- `04-CODEX-ROUND1.log` exists — round1 verdict: `accept-with-revisions`
- `04-CODEX-ROUND2.log` exists — round2 verdict: `accept-with-revisions`

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IMAGE-02 | 04-01, 04-03, 04-05 | App renders an ion image for a user-entered m/z with Da or ppm tolerance | SATISFIED | `renderIonImage` in store.ts calls `extractXIC` with Span1D mzRange; ImagingPanel controls row + ion-canvas wired; REQUIREMENTS.md updated to [x] Complete |
| IMAGE-03 | 04-02, 04-03, 04-05 | User chooses colormap and scaling mode with percentile clipping | SATISFIED | `rasterizeImage` with Colormap/RasterizeOpts; inferno LUT defect fixed; all three colormaps correct; controls wired; REQUIREMENTS.md updated to [x] Complete |
| SPEC-02 | 04-04 | Currently selected m/z ± tolerance window visually marked on spectrum | SATISFIED | SpectrumPanel hooks.draw amber band verified in source; mzWindow sync useEffect verified; mzWindow null guard confirmed |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/rasterize.ts` | 165-168 | Log branch missing `Number.isFinite(raw)` guard before `Math.log1p` — if `raw` is NaN, `Math.log1p(NaN)` returns NaN but `NaN > 0` is false so the ternary returns 0. Behavior is safe but defensively incorrect. | WARNING | NaN input is handled by coincidence not intent; no crash, no user-visible error |

Debt marker check: No `TBD`, `FIXME`, or `XXX` markers found in any Phase 4 source files. The `[ASSUMED]` comment in rasterize.ts:56 is a cosmetic annotation, not an unresolved work item.

All previously-flagged anti-patterns are resolved:
- WR-03 (dead `mzWindow` subscription in ImagingPanel) — removed; grep confirms zero occurrences
- WR-01 (mzWindow set on null XIC) — fixed; store.ts:295 conditionally null
- WR-02 (percentile formula) — fixed; Math.ceil(p*n)-1 confirmed at rasterize.ts:128

### Human Verification Required

#### 1. Ion Image Round-Trip

**Test:** Open an imaging .mzpeak file, enter a valid m/z (e.g. 798.54) and tolerance (e.g. 0.01 Da), click "Show Ion Image"
**Expected:** Ion image canvas appears below TIC canvas showing a spatial ion distribution; stats line shows nonzero count and range
**Why human:** Canvas rendering requires browser execution with a real file; cannot verify pixel content via static analysis

#### 2. Colormap/Scale Recolor Without Re-query

**Test:** With an ion image displayed, open browser DevTools Network tab, change the colormap from viridis to inferno, then to gray; also toggle linear/log
**Expected:** Canvas recolors immediately with no new network request in DevTools — confirming D-02/SC-5 (recolor without re-query)
**Why human:** Requires DevTools observation during interaction; cannot confirm absence of network request via code inspection alone

#### 3. SPEC-02 Amber Band on Spectrum

**Test:** After clicking "Show Ion Image" for a valid m/z, click any pixel on either the TIC canvas or the ion canvas
**Expected:** Spectrum panel redraws with a translucent amber band at [mz-tolDa, mz+tolDa]; band is absent before Show Ion Image is clicked; band survives zoom/pan (Pitfall 5)
**Why human:** uPlot hooks.draw produces a Canvas 2D draw — not visible in DOM inspection; zoom/pan behavior requires interaction

#### 4. Log Scale on High-Dynamic-Range Image

**Test:** Load a real imaging .mzpeak file with a sparse intense signal, switch scale from linear to log
**Expected:** Log scale reveals low-intensity signal that was invisible in linear mode; image is not entirely blank
**Why human:** Requires a specific HDR mzPeak file to confirm log scaling reveals structure

#### 5. ppm Tolerance Unit Conversion

**Test:** Enter m/z=500, tolerance=10, switch unit to ppm, click "Show Ion Image"
**Expected:** Ion image computed for window [499.995, 500.005] (ppmToDa(500,10)=0.005); pixel count and range in stats line should match a 10ppm window, not a 10Da window
**Why human:** Requires a real file where the 10ppm vs 10Da difference would produce visibly different ion images

### Gaps Summary

No gaps remain. All previously-identified blockers are resolved:

- Gap 1 (Inferno LUT): CLOSED — INFERNO_STOPS[7] corrected to [249,201,52]; monotonic-luminance test now covers 6 points including t=0.875; 20/20 rasterize tests pass.
- Gap 2 (colorbar): CLOSED via operator override — text stats line accepted as satisfying SC-2.
- WR-01, WR-02, WR-03: all three warnings closed (conditional null, ceil formula, dead subscription).
- REQUIREMENTS.md: IMAGE-02 and IMAGE-03 traceability table updated to `[x] Complete`.

Phase is fully automated-verified at 14/14. Human browser testing is the sole remaining gate.

---

_Verified: 2026-06-03T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
