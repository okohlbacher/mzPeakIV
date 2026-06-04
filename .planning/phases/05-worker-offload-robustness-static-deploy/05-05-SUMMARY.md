---
plan: "05-05"
phase: "05-worker-offload-robustness-static-deploy"
status: complete
completed: "2026-06-04"
---

# Plan 05-05 Summary — Codex Adversarial Review (PROC-01)

## What Was Done

Both rounds of the PROC-01 Codex adversarial review were completed for Phase 5.

- **Round 1** — adversarial review of the Phase 5 plan bundle
  Log: `.planning/phases/05-worker-offload-robustness-static-deploy/05-CODEX-ROUND1.log`
  Verdict: **reject**

- **Round 2** — adversarial review of the Phase 5 diff (since SHA `2bb2969`)
  Log: `.planning/phases/05-worker-offload-robustness-static-deploy/05-CODEX-ROUND2.log`
  Verdict: **reject**

## Operator Escalation Required

Per PROC-01: "The operator adjudicates any non-accept verdict; escalate on reject."
Both rounds returned `reject`. The operator must review the findings and decide whether to:
1. Accept findings as tracked (create gap-closure plans for the real bugs)
2. Require re-execution with fixes before marking phase complete
3. Explicitly accept the phase as-is with documented risks

## Round 1 Key Findings (plan review)

1. Plan 01 acceptance contradicts itself: requires `npm run build` to exit 0 while TS exhaustiveness errors from 'no-imaging' are deferred
2. No verification that production Worker can load WASM or works under GitHub Pages base paths
3. `ImagingGrid.presenceMask.buffer` transfer + Worker-side `activeGrid` retention → detached buffer → wrong stats
4. Missing load-request generation/cancellation guard (stale `loadResult` from file A after file B opened)
5. Missing `worker.onerror` / `worker.onmessageerror` → UI stuck on Worker crash
6. Error responses lack `requestId` — stale render errors can collapse a loaded file to error state
7. Action tags (`@v4`) not SHA-pinned — supply-chain risk with `pages: write` + `id-token: write`
8. No regression tests for behavioral promises (non-imaging flow, render button disabled/re-enabled, Worker error recovery)

## Round 2 Key Findings (diff review)

1. **REAL BUG** — `mzPeakWorker.ts:221` transfers `presenceMask.buffer` while retaining `activeGrid` → buffer detached → `computeIonImageStats` computes wrong stats
2. **REAL BUG** — `currentRequestId` not reset on `openUrl`/`openFile` → render result from file A accepted after file B opened
3. **REAL BUG** — `worker.onmessage` only; no `worker.onerror` or `worker.onmessageerror` → UI stuck on Worker crash
4. **REAL BUG** — `file.arrayBuffer()` on main thread without try/catch → unhandled rejection leaves UI at `zip-index`
5. **STALE TESTS** — e2e tests expect `"Ready"` for non-imaging small.mzpeak but Phase 5 routes it to `"No Imaging Data"`
6. **MISSING COVERAGE** — integration test skipped, no Playwright test for no-imaging UX (D-05/D-06 unvalidated)
7. **MINOR** — ImagingPanel button validity guard incomplete vs handler's ppm validation

## Self-Check: PASSED

Both logs are present. Verdicts captured for phase commit footer.

## Operator Verdict Required

```
codex-round1: reject
codex-round2: reject
```

Four bugs require gap-closure plans:
- presenceMask buffer detachment after transfer
- currentRequestId not reset on new file open
- Missing worker.onerror handler
- file.arrayBuffer() unhandled rejection
