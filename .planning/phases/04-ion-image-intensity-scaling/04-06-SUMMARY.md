---
plan: "04-06"
phase: "04-ion-image-intensity-scaling"
status: complete
completed: "2026-06-04"
---

# Plan 04-06 Summary — Codex Adversarial Review (PROC-01)

## What Was Done

Both rounds of the PROC-01 Codex adversarial review were completed for Phase 4.

- **Round 1** — adversarial review of the Phase 4 plan bundle  
  Log: `.planning/phases/04-ion-image-intensity-scaling/04-CODEX-ROUND1.log`  
  Verdict: **accept-with-revisions**

- **Round 2** — adversarial review of the Phase 4 diff (since SHA `63b9f9c`)  
  Log: `.planning/phases/04-ion-image-intensity-scaling/04-CODEX-ROUND2.log`  
  Verdict: **accept-with-revisions**

## Round 1 Key Findings (plan review)

1. Async race in `renderIonImage` — no request-identity / cancellation (stale overwrite risk)
2. Inferno LUT has only 8 anchors vs required 9 stops
3. Percentile fixture too small to distinguish 0.90 vs 0.99 clips
4. `buildIonImage` acceptance criterion (formula check) inconsistent with cloning `buildTic`
5. Ion canvas `onClick` handler closure risk if it references TIC `canvasRef`
6. `mz + tolDa` overflow to `Infinity` not guarded in validation
7. `setColormapSettings` accepts arbitrary `percentile` with no validation
8. `computeIonImageStats.min` includes present zero-valued pixels (ambiguous range display)
9. No test asserting `setColormapSettings` does not call `extractXIC`
10. Plan 4 (SPEC-02 band) has no automated visual test

## Round 2 Key Findings (diff review)

1. **Async race** — `renderIonImage` in `store.ts:279` can be overwritten by older request (no cancellation)
2. **Inferno LUT defect** — last two stops in `rasterize.ts:58` are identical, weakening high-end discrimination; test only checks 0/0.5/1.0 so defect passes
3. **Separate click handlers** — `onIonClick` and `onTicClick` are separate in `ImagingPanel.tsx`; behavior equivalent but plan acceptance criterion technically not met
4. **Missing "tolerance" label** — controls row in `ImagingPanel.tsx:322` has no visible "tolerance" label per UI-SPEC contract
5. **Non-finite guard missing** — `rasterizeImage` log branch in `rasterize.ts:165` lacks `Number.isFinite(raw)` check before `Math.log1p`
6. **No UI behavior tests** — no tests for "Show Ion Image" calling `renderIonImage`, recolor avoiding re-query, or SPEC-02 band redraws

## Self-Check: PASSED

Both review logs are present. Verdict lines captured for phase commit footer.

## Operator Verdict

PROC-01 verdicts for the phase commit footer:
```
codex-round1: accept-with-revisions
codex-round2: accept-with-revisions
```

Issues #1 (async race), #2 (Inferno LUT), #4 (tolerance label), #5 (finite guard) are the most actionable and should be addressed in a gap-closure pass or Phase 5 polish.
