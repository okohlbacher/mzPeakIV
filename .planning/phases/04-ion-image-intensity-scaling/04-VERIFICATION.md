---
phase: "04-ion-image-intensity-scaling"
verified: "2026-06-03T18:10:00Z"
status: gaps_found
score: 12/14 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The colorbar is labeled with the aggregation statistic and scale mode"
    status: failed
    reason: "No colorbar UI element exists — the stats line shows scale mode and range text but SC-2 explicitly states 'the colorbar is labeled with the aggregation statistic and scale mode'. There is no rendered colorbar gradient with a label."
    artifacts:
      - path: "src/ui/ImagingPanel.tsx"
        issue: "Stats line (data-testid=ion-stats) shows nonzeroCount, range, scale, and percentile in text — but there is no visual colorbar (gradient bar) element labeled with aggregation stat and scale mode, as required by SC-2."
    missing:
      - "A visual colorbar element labeled with the aggregation statistic (e.g. 'sum intensity') and scale mode (linear/log + Nth pct)"
  - truth: "Inferno LUT is monotonically distinct across full dynamic range"
    status: failed
    reason: "INFERNO_STOPS stop[7] ([252,255,164]) duplicates stop[8] ([252,255,164]). The top 12.5% of the inferno dynamic range (norm=0.875 to 1.0) maps to an identical color — high-intensity structure within that band is invisible. This is a confirmed defect documented in the REVIEW.md (CR-01) and Codex round2 finding #2."
    artifacts:
      - path: "src/ui/rasterize.ts"
        issue: "INFERNO_STOPS[7] == INFERNO_STOPS[8] == [252,255,164]. Correct value for stop[7] (t=0.875) is [249,201,52]."
      - path: "src/ui/rasterize.test.ts"
        issue: "Monotonic-luminance test only samples t=0, 0.5, 1.0 — does not catch the flat segment at t=0.875."
    missing:
      - "Fix INFERNO_STOPS[7] to [249, 201, 52] (gold/amber, correct matplotlib inferno t=0.875)"
      - "Extend monotonic-luminance test to cover t=0.25, 0.5, 0.75, 0.875, 1.0"
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
**Verified:** 2026-06-03T18:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

The phase has 5 roadmap success criteria. The PLAN frontmatter must-haves are merged in, resulting in 14 truths to verify.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User enters m/z + Da or ppm tolerance and sees corresponding ion image via extractXIC | VERIFIED | `renderIonImage` in store.ts:279-298 calls `reader.extractXIC(null, {start:mz-tolDa, end:mz+tolDa}, useProfile)` then `buildIonImage`; ppmToDa applied in ImagingPanel handler before calling renderIonImage (ImagingPanel.tsx:292) |
| 2 | User can choose colormap (viridis/inferno/gray) and scaling mode (linear/log) with percentile clipping | VERIFIED | `rasterizeImage` in rasterize.ts accepts `RasterizeOpts{colormap, percentile, logScale}` with switch dispatch; ImagingPanel.tsx has three selects wired to `setColormapSettings` |
| 3 | App shows nonzero-pixel count and value-range so "blank because scaling" is never confused with "blank because absent" | VERIFIED | Stats line at ImagingPanel.tsx:469-479 renders `{ionImageStats.nonzeroCount} / {grid.filledCount} pixels with signal · range {min}–{max} · scale: {scale} ({Nth} pct)` with `data-testid="ion-stats"` |
| 4 | The colorbar is labeled with the aggregation statistic and scale mode | FAILED | No colorbar UI element exists. The stats line conveys scale mode and range in text only. SC-2 explicitly requires a labeled colorbar — this is absent. |
| 5 | Changing colormap or scale recolors the cached raster without re-querying the file | VERIFIED | `setColormapSettings` in store.ts:304-306 is a pure `set({colormap, scale, percentile})` — no extractXIC, no reader reference. Ion canvas paint useEffect keys on `[ionImage, grid, colormap, scale, percentile]` — recolors from cached ionImage. |
| 6 | SPEC-02: selected m/z ± tolerance window is visually marked on the clicked-pixel spectrum | VERIFIED | SpectrumPanel.tsx hooks.draw callback (lines 79-91) draws translucent amber band via `u.valToPos` + `ctx.fillRect`; mzWindowRef synced on every mzWindow change via second useEffect (lines 133-136) |
| 7 | ppmToDa formula is correct: ppmToDa(500,10)===0.005; ppmToDa(1000,5)===0.005 | VERIFIED | ionImage.ts:51 returns `(mz * ppm) / 1e6`; 17/17 unit tests pass including ppmToDa coverage |
| 8 | buildIonImage respects C2 orientation (key = y0*width+x0, no flip) | VERIFIED | buildIonImage.ts:79-82 inverts `coordToSpectrumIndex` (which owns the key formula); no flip added; cell formula is row-major as required |
| 9 | computeIonImageStats excludes absent pixels (presenceMask===0) from nonzeroCount/min/max | VERIFIED | ionImage.ts:134 has `if (presenceMask[k] === 0) continue`; returns {0,0,0} when no present finite values; all 17 unit tests pass |
| 10 | rasterizeImage generalizes rasterizeTic; rasterizeTic is a thin wrapper | VERIFIED | rasterize.ts:210-211: `rasterizeTic` body is a single `return rasterizeImage(...)` call; rasterizeImage handles all colormap dispatch |
| 11 | Log scaling uses Math.log1p so raw=0 → norm 0 exactly (never NaN) | VERIFIED | rasterize.ts:167: `denom > 0 && raw > 0 ? Math.min(Math.log1p(raw)/denom, 1) : 0` — raw=0 produces norm=0; 19/19 rasterize tests pass |
| 12 | Absent pixels render as SENTINEL [0x1a,0x1a,0x1a,255] regardless of colormap | VERIFIED | rasterize.ts:156-161: presenceMask[k]===0 branch always emits SENTINEL before colormap switch |
| 13 | Inferno LUT is monotonically distinct across full dynamic range | FAILED | INFERNO_STOPS[7] == INFERNO_STOPS[8] == [252,255,164]; the top 12.5% of the dynamic range maps to a flat identical color. Confirmed defect in REVIEW.md CR-01 and Codex round2 finding #2. |
| 14 | Colormap changes do NOT re-query the file (D-02/SC-5) | VERIFIED | setColormapSettings in store.ts:304-306 contains only `set({colormap, scale, percentile})` — grep confirms 2 total extractXIC calls in store.ts (lines 200 and 292), neither is in setColormapSettings |

**Score:** 12/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/compute/ionImage.ts` | ppmToDa, buildIonImage, computeIonImageStats pure functions | VERIFIED | Exists, substantive (147 lines), imports only `ImagingGrid` type, exports all three named symbols |
| `src/compute/ionImage.test.ts` | Unit tests for all three functions | VERIFIED | 17 tests across 4 describe blocks; all pass; makeXic uses BigInt indices |
| `src/ui/rasterize.ts` | rasterizeImage, Colormap, RasterizeOpts, inferno, rasterizeTic thin wrapper | VERIFIED | Exports Colormap, RasterizeOpts, rasterizeImage, inferno, viridis, rasterizeTic; Math.log1p present; percentileClip present (old percentile99 absent) |
| `src/ui/rasterize.test.ts` | Extended IMAGE-03 tests (log, percentile, colormaps, sentinel) | VERIFIED | 19 tests (7 Phase 3 + 12 new); all pass; 6 new describe blocks covering all required scenarios |
| `src/state/store.ts` | Phase 4 state slice + renderIonImage + setColormapSettings | VERIFIED | 6 State fields (mzWindow, ionImage, ionImageStats, colormap, scale, percentile) + 2 Actions; initialState correct |
| `src/ui/SpectrumPanel.tsx` | SPEC-02 amber band via uPlot hooks.draw | VERIFIED | mzWindowRef, hooks.draw with valToPos, ctx.save/restore, second useEffect syncing ref + calling redraw |
| `src/ui/ImagingPanel.tsx` | Controls row, ion-image canvas, stats line wired to store | VERIFIED | All controls rendered; handleRenderIonImage with V5 guards; handleColormapSettings; ion canvas conditionally rendered; stats line with data-testid |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/compute/ionImage.ts` | `src/imaging/types.ts` | `import type { ImagingGrid }` | VERIFIED | Line 15: `import type { ImagingGrid } from "../imaging/types"` |
| `src/compute/ionImage.test.ts` | `src/compute/ionImage.ts` | `import { buildIonImage, computeIonImageStats, ppmToDa }` | VERIFIED | Test imports all three named exports; 17 tests pass |
| `src/state/store.ts` | `src/compute/ionImage.ts` | `import { buildIonImage, computeIonImageStats }` | VERIFIED | store.ts line 17 |
| `src/state/store.ts` | `src/ui/rasterize.ts` | `import { type Colormap }` | VERIFIED | store.ts line 18 |
| `src/ui/SpectrumPanel.tsx` | `src/state/store.ts` | `useStore(s => s.mzWindow)` | VERIFIED | SpectrumPanel.tsx line 18 |
| `src/ui/SpectrumPanel.tsx` | uPlot hooks.draw | `opts.hooks.draw + mzWindowRef.current` | VERIFIED | lines 78-93; hook reads ref, not closure |
| `src/ui/ImagingPanel.tsx` | `src/state/store.ts` | `useStore — renderIonImage, setColormapSettings, ionImage, etc.` | VERIFIED | lines 80-87: all 8 Phase 4 store subscriptions present |
| `src/ui/ImagingPanel.tsx` | `src/ui/rasterize.ts` | `rasterizeImage(ionImage, grid, {colormap, percentile, logScale})` | VERIFIED | ImagingPanel.tsx lines 162-166 |
| `src/ui/ImagingPanel.tsx` | `src/compute/ionImage.ts` | `import { ppmToDa }` | VERIFIED | ImagingPanel.tsx line 5; used in handleRenderIonImage:292 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ImagingPanel.tsx` — ion canvas | `ionImage` (Float32Array) | `renderIonImage` → `reader.extractXIC` → `buildIonImage` | Yes — XIC points aggregated per grid cell | FLOWING |
| `ImagingPanel.tsx` — stats line | `ionImageStats` | `computeIonImageStats(ionImage, grid)` | Yes — computed from live Float32Array | FLOWING |
| `SpectrumPanel.tsx` — amber band | `mzWindow` | `renderIonImage` sets `{ mzWindow: {mz, tolDa} }` | Yes — set from validated user input | FLOWING |
| `ImagingPanel.tsx` — ion canvas recolor | `colormap, scale, percentile` | `setColormapSettings` stores to Zustand; useEffect keys rerender | Yes — rasterizeImage called with live store values | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ppmToDa pure function | `npx vitest run src/compute/ionImage.test.ts` | 17/17 tests pass | PASS |
| buildIonImage + computeIonImageStats pure functions | `npx vitest run src/compute/ionImage.test.ts` | 17/17 tests pass | PASS |
| rasterizeImage log scaling, percentile, sentinel | `npx vitest run src/ui/rasterize.test.ts` | 19/19 tests pass | PASS |
| Full test suite (all phases) | `npx vitest run src/` | 124 passed, 1 skipped across 12 test files | PASS |
| TypeScript build | `npm run build` | Exits 0 — 232 modules, no TS errors | PASS |
| setColormapSettings has no extractXIC | `grep -c extractXIC src/state/store.ts` | 7 lines — only comments + 2 actual calls (lines 200, 292); setColormapSettings contains none | PASS |

### Probe Execution

No probes declared for this phase (Plan 04-06 runs Codex CLI, not bash probe scripts). Step 7c: SKIPPED (no probe-*.sh files for this phase).

Codex review log verification:
- `04-CODEX-ROUND1.log` exists (confirmed in directory listing)
- `04-CODEX-ROUND2.log` exists (confirmed in directory listing)
- Round1 verdict: `accept-with-revisions`
- Round2 verdict: `accept-with-revisions`

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IMAGE-02 | 04-01, 04-03, 04-05 | App renders an ion image for a user-entered m/z with Da or ppm tolerance | SATISFIED | `renderIonImage` in store.ts calls `extractXIC` with Span1D mzRange; ImagingPanel controls row + ion-canvas wired |
| IMAGE-03 | 04-02, 04-03, 04-05 | User chooses colormap and scaling mode with percentile clipping | SATISFIED (with defect) | `rasterizeImage` with Colormap/RasterizeOpts; inferno LUT has flat-top defect but viridis and gray are correct; controls wired |
| SPEC-02 | 04-04 | Currently selected m/z ± tolerance window visually marked on spectrum | SATISFIED | SpectrumPanel hooks.draw amber band verified in source; mzWindow sync useEffect verified |

REQUIREMENTS.md traceability note: IMAGE-02 and IMAGE-03 are still marked "Pending" in the traceability table at the bottom of REQUIREMENTS.md, even though the implementation is present. This is a documentation consistency issue — the `[ ]` checkbox is not updated to `[x]`. Not a blocker for code verification, but should be corrected.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/rasterize.ts` | 67 | INFERNO_STOPS[7] == INFERNO_STOPS[8]: identical stops `[252,255,164]` create flat color band in top 12.5% of dynamic range | BLOCKER | High-intensity structure at norm=0.875–1.0 is indistinguishable; inferno colormap degraded for any high-DR image |
| `src/ui/ImagingPanel.tsx` | 82,91 | `void mzWindow` — subscribed but never used; causes extra re-render on every m/z query | WARNING | Minor performance impact; WR-03 in REVIEW.md |
| `src/ui/rasterize.ts` | 165-167 | Log branch missing `Number.isFinite(raw)` guard before `Math.log1p` — if `raw` is NaN/Infinity (possible from malformed XIC), `Math.log1p(NaN)` returns NaN and norm=0 (guarded by `raw > 0`), so the effect is norm=0 not a crash. Codex finding #5. | WARNING | Math.log1p(NaN) returns NaN; `NaN > 0` is false so the ternary returns 0 — behavior is safe but defensively incorrect |
| `src/state/store.ts` | 292-295 | `mzWindow: {mz, tolDa}` is set even when `extractXIC` returns null (XIC null → ionImage null → ion canvas hidden, but SPEC-02 band would still appear) | WARNING | Amber band shown on spectrum with no corresponding ion image if XIC is null; WR-01 in REVIEW.md |
| `.planning/REQUIREMENTS.md` | 88-89 | IMAGE-02 and IMAGE-03 remain marked as "Pending" (`[ ]`) in traceability table despite implementation being complete | INFO | Documentation drift only |

Debt marker check: No `TBD`, `FIXME`, or `XXX` markers found in any Phase 4 source files. The `[ASSUMED]` comment in rasterize.ts:56 is a cosmetic annotation (acknowledges the LUT values are not spec-verified), not an unresolved work item.

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

Two blockers were found:

**Gap 1 — Inferno LUT flat-top defect (CR-01):** INFERNO_STOPS[7] duplicates INFERNO_STOPS[8], both set to [252,255,164] (pale yellow). The correct matplotlib inferno value at t=0.875 is [249,201,52] (gold/amber). Any pixel in the top 12.5% of the dynamic range (norm=0.875 to 1.0) renders as identical pale yellow — high-intensity spatial structure is invisible. This was identified by the Codex round2 review (finding #2) and confirmed by the internal REVIEW.md (CR-01). The monotonic-luminance test passes because it only samples t=0, 0.5, 1.0 — not t=0.875. Fix: correct INFERNO_STOPS[7] and extend the test.

**Gap 2 — Missing colorbar labeled with aggregation statistic and scale mode (SC-2):** ROADMAP.md success criterion 2 states "the colorbar is labeled with the aggregation statistic and scale mode." No colorbar UI element exists — only a text stats line. The stats line shows the scale mode and percentile but does not present a visual colormap gradient bar with labels. Whether the text-only stats line satisfies the intent of SC-2 is a product decision requiring operator adjudication.

The two gaps differ in severity: the Inferno LUT defect is a clearly wrong implementation (flat color band, invisible structure) — this is a functional BLOCKER. The missing colorbar depends on whether the text stats line is acceptable as a substitute for an explicit colorbar — this may be an intentional scope decision, in which case an override could be recorded.

---

_Verified: 2026-06-03T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
