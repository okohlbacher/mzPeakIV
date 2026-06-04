---
phase: 05-worker-offload-robustness-static-deploy
plan: "01"
subsystem: worker-protocol
tags:
  - worker
  - vite-config
  - type-contracts
  - load-stage

dependency-graph:
  requires:
    - "04-ion-image-intensity-scaling/04-*"  # LoadStage union, existing reader types
  provides:
    - "05-02"  # WorkerRequest/WorkerResponse — Worker implementation consumes these
    - "05-03"  # protocol.ts imported by store.ts onmessage handler
    - "05-04"  # 'no-imaging' LoadStage needed by ProgressBar/App UI changes
  affects:
    - src/reader/types.ts  # LoadStage union extended
    - vite.config.ts       # worker.plugins factory added

tech-stack:
  added: []
  patterns:
    - "Worker.plugins factory pattern: () => [wasm(), topLevelAwait()] mirrors main plugins for WASM in Worker bundles"
    - "Discriminated union postMessage protocol — WorkerRequest/WorkerResponse — pure type declarations, no runtime code"
    - "ImagingGrid structured-clone notes: Map is deep-cloned; presenceMask.buffer is transferable"

key-files:
  created:
    - src/worker/protocol.ts
  modified:
    - src/reader/types.ts
    - vite.config.ts

decisions:
  - "ImagingGrid crosses Worker boundary via structured clone — Map<number,number> is deep-cloned (not zero-copy); Uint8Array.buffer in presenceMask is transferable. No custom serialization needed at this stage."
  - "ProgressBar.tsx STAGE_LABEL Record<LoadStage, string> does not error at definition for missing 'no-imaging' key — TypeScript checks at usage sites, not declaration. Plan 04 must add the key to avoid runtime undefined access."

metrics:
  duration: "12 minutes"
  completed: "2026-06-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 05 Plan 01: Worker Protocol Contracts Summary

**One-liner:** Vite worker.plugins factory for WASM-in-Worker builds, typed postMessage discriminated-union protocol, and 'no-imaging' LoadStage extension — foundational contracts for Plans 02–04.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend LoadStage and add worker.plugins to vite.config.ts | a70d74f | src/reader/types.ts, vite.config.ts |
| 2 | Create src/worker/protocol.ts — typed postMessage boundary contract | 17df2c8 | src/worker/protocol.ts |

## What Was Built

### Task 1: LoadStage + vite.config.ts

**src/reader/types.ts** — `'no-imaging'` added to `LoadStage` union before `'error'`, per D-06: a valid non-imaging file is a successful terminal state, not a failure.

**vite.config.ts** — `worker` block added with `plugins: () => [wasm(), topLevelAwait()]`. This factory function ensures production Worker bundles receive the same WASM and top-level-await transforms as the main bundle. Without this, WASM imports work in `vite dev` (dev server transforms at the network level) but silently fail in the built Worker with "ESM integration proposal for Wasm is not supported" (RESEARCH.md Pitfall 1). `format` is intentionally omitted from the worker block — leaving it at the default `iife` is required for Firefox ES module worker support (RESEARCH.md §Anti-Patterns).

### Task 2: src/worker/protocol.ts

Created the complete typed postMessage boundary contract:

- **WorkerRequest**: `loadUrl | loadFile | renderIonImage | selectSpectrum` — loadFile takes `bytes: ArrayBuffer` (not `File`, per Pitfall 3); renderIonImage carries a `requestId` for stale-response cancellation (Pattern 5).
- **WorkerResponse**: `progress | loadResult | noImaging | renderResult | spectrumResult | error` — error carries the `ReaderErrorClass` discriminator + message + optional findings (plain object, not Error instance, per structured-clone rules).
- **LoadResult**: full imaging-mode result — manifest, fileMeta, stats, capabilities, grid (ImagingGrid), tic (Float32Array), mixedRepresentationWarning.
- **NonImagingResult**: metadata-only result for non-imaging files (D-05) — manifest, fileMeta, stats, capabilities. No grid, no tic.
- **IonImageStats**: nonzeroCount/min/max — mirrors the ionImageStats field shape already in store.ts.

**ImagingGrid serialization decision** (documented in JSDoc):
- `coordToSpectrumIndex: Map<number, number>` — Maps are structured-clone serializable; a deep clone occurs (not zero-copy). No custom serialization needed.
- `presenceMask: Uint8Array` — TypedArrays are transferable; Plan 02 should include `presenceMask.buffer` in the transfer list for zero-copy.
- This decision is noted with `// SERIALIZATION NOTE:` in the LoadResult JSDoc.

## Verification Results

```
1. npm run build exits 0:           PASS
2. 'no-imaging' in LoadStage:       PASS (src/reader/types.ts line 85)
3. worker.plugins in vite.config:   PASS (vite.config.ts line 43)
4. src/worker/protocol.ts exists:   PASS
5. Required exports (5 types):      PASS
6. No format:'es' in worker block:  PASS
```

## Notes for Plan 04

**ProgressBar.tsx exhaustiveness** — `STAGE_LABEL: Record<LoadStage, string>` in ProgressBar.tsx does not currently include `'no-imaging'`. TypeScript does NOT error at the Record literal definition — it checks at usage sites. However, at runtime, `STAGE_LABEL['no-imaging']` will return `undefined`, which will crash `aria-label={`Load stage: ${STAGE_LABEL[stage]}`}` silently. Plan 04 must add:
```typescript
"no-imaging": "No Imaging Data",
```
to the `STAGE_LABEL` Record and handle the `'no-imaging'` stage in the `App.tsx` stage-sentinel switch and right-pane conditional.

**App.tsx** — The stage sentinel ternary chain at `data-testid="stage"` has no `'no-imaging'` case and will fall through to the `"Idle"` fallback. Plan 04 should add `stage === 'no-imaging' ? "No Imaging Data"` before the `stage === "ready"` branch.

## Deviations from Plan

None — plan executed exactly as written.

The plan anticipated that TypeScript exhaustiveness errors on `ProgressBar.tsx` and `App.tsx` might or might not appear during this task. They did NOT appear at compile time (TypeScript checks `Record<K, V>` exhaustiveness at usage sites, not object literal definitions), so no suppression was needed. The locations requiring Plan 04 fixes are documented above.

## Known Stubs

None. This plan creates foundational type contracts only — no runtime behavior, no UI rendering, no data flow.

## Threat Flags

None. This plan adds pure type declarations and a build-config entry. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/worker/protocol.ts exists | FOUND |
| src/reader/types.ts modified | FOUND |
| vite.config.ts modified | FOUND |
| 05-01-SUMMARY.md created | FOUND |
| Commit a70d74f (Task 1) | FOUND |
| Commit 17df2c8 (Task 2) | FOUND |
| 'no-imaging' in LoadStage | FOUND |
| worker.plugins in vite.config.ts | FOUND |
| Required exports in protocol.ts | FOUND |
