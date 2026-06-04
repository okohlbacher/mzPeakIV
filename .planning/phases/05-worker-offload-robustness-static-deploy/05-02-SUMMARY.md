---
phase: 05-worker-offload-robustness-static-deploy
plan: "02"
subsystem: worker-pipeline
tags:
  - worker
  - reader-pipeline
  - ion-image
  - non-imaging
  - error-serialization

dependency-graph:
  requires:
    - "05-01"  # WorkerRequest/WorkerResponse/LoadResult/NonImagingResult protocol types
    - "04-ion-image-intensity-scaling/04-*"  # buildIonImage, computeIonImageStats, store logic
  provides:
    - "05-03"  # store.ts Worker dispatcher consumes mzPeakWorker.ts
    - "05-04"  # UI changes consume the noImaging message type
  affects:
    - src/worker/mzPeakWorker.ts  # created — Worker entry point
    - src/ui/ProgressBar.tsx       # modified — 'no-imaging' added to STAGE_LABEL Record

tech-stack:
  added: []
  patterns:
    - "Worker module-scope state: activeReader/activeStats/activeGrid declared outside onmessage (Pitfall 5)"
    - "workerSelf cast: (self as unknown as WorkerSelf).postMessage to resolve DOM/Worker postMessage overload mismatch"
    - "sendTransfer(message, transferList) helper: encapsulates [.buffer] transfer-list pattern"
    - "postError(): replicates classifyError — UnsupportedEncodingError vs corrupt discriminated output"
    - "postProgress(stage): typed LoadStage tick before each pipeline stage"
    - "Non-imaging early-return: send({ type: 'noImaging', ... }) and return — no tic stage"
    - "Float32Array zero-copy transfer: tic.buffer, presenceMask.buffer, mz.buffer, intensity.buffer"

key-files:
  created:
    - src/worker/mzPeakWorker.ts
  modified:
    - src/ui/ProgressBar.tsx

decisions:
  - "workerSelf cast via type alias WorkerSelf = { postMessage(m, t?): void } — avoids adding WebWorker lib to tsconfig (conflicts with DOM lib) while keeping correct runtime semantics"
  - "presenceMask.buffer added to loadResult transfer list per ImagingGrid serialization note in protocol.ts JSDoc — zero-copy for Uint8Array too"
  - "ProgressBar.tsx 'no-imaging' key fixed in this plan (Plan 01 gap) — blocking build failure takes priority over deferring to Plan 04"

metrics:
  duration: "22 minutes"
  completed: "2026-06-04"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 1
---

# Phase 05 Plan 02: mzPeakWorker.ts — Full Load + Render Pipeline Summary

**One-liner:** Worker entry point relocating the entire mzPeak read-and-compute pipeline (ZIP→manifest→metadata→grid→TIC→loadResult/noImaging) plus on-demand renderIonImage and selectSpectrum, with zero-copy Float32Array transfer and serialized error output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create mzPeakWorker.ts — full load + render pipeline | 535dd19 | src/worker/mzPeakWorker.ts, src/ui/ProgressBar.tsx |

## What Was Built

### Task 1: src/worker/mzPeakWorker.ts

Created the Worker entry point that relocates the entire runLoad pipeline from store.ts into a Worker thread. The main thread is left stateless with respect to file I/O — the Reader handle lives in the Worker and never crosses the boundary.

**Module-scope state (Pitfall 5 prevention):**
- `activeReader: Reader | null` — live mzpeakts reader handle
- `activeStats: FileStats | null` — persists for majority-rule computation in renderIonImage
- `activeGrid: ImagingGrid | null` — persists for ion-image coordinate lookup

**postMessage helpers:**
- `send(message: WorkerResponse)` — no-transfer postMessage via `workerSelf` cast
- `sendTransfer(message, transferList)` — with Transferable[] array
- `postProgress(stage: LoadStage)` — emits `{ type: 'progress', stage }` tick
- `postError(err: unknown)` — replicates `classifyError`: UnsupportedEncodingError → `class: 'unsupported-encoding'` with findings; everything else → `class: 'corrupt'`

**runLoadInWorker(reader)** — exact store.ts::runLoad body relocated:
1. `manifest` stage: readManifest
2. `metadata` stage: readFileMeta, computeStats, computeCapabilities
3. `grid` stage: extractCoords + readGridGeometry + buildImagingGrid (imaging only)
   - Grid build failure on imaging file → postError + return (corrupt class)
4. Non-imaging branch: send `{ type: 'noImaging', result }` and return (D-04/D-06)
5. `tic` stage: extractXIC(null, null, useProfile) + buildTic (imaging only)
   - TIC XIC null → tic: null (not an error)
   - TIC throw → postError + return
6. `loadResult`: sendTransfer with tic.buffer + presenceMask.buffer in transfer list
7. Auto-select spectrum 0 via runSelectSpectrum(0)

**renderIonImage handler:**
- V5 validation guard first (T-05-02): `!isFinite(mz) || mz <= 0 || !isFinite(tolDa) || tolDa <= 0 || mz - tolDa < 0`
- Guards `activeReader/activeGrid/activeStats` null check
- D-08 majority rule for profile/centroid selection
- Span1D shape `{ start: mz - tolDa, end: mz + tolDa }` (not [min, max])
- sendTransfer with ionImage.buffer in transfer list

**selectSpectrum handler:**
- Shared via `runSelectSpectrum(index)` helper
- spectrumMeta + getSpectrumArraysFor (representation-routed per DATA-03)
- sendTransfer with mz.buffer + intensity.buffer

**workerSelf cast:** The DOM lib types `self` as `Window & typeof globalThis`, whose postMessage overloads are frame-to-frame signatures, not the Worker's `(message, transfer[])` signature. A `type WorkerSelf = { postMessage(m, t?): void }` alias cast via `unknown` resolves the overload mismatch without adding the WebWorker lib (which conflicts with DOM in this tsconfig).

### ProgressBar.tsx fix (deviation)

Added `"no-imaging": "No Imaging Data"` to the `STAGE_LABEL: Record<LoadStage, string>` object. This was a pre-existing build-blocking gap documented in the Plan 01 SUMMARY as a Plan 04 responsibility. Fixed early as Rule 3 (blocking build issue) — the ProgressBar fix is required for `tsc -b` to pass, which is the acceptance criterion for this plan.

## Verification Results

```
1. tsc -b exits 0 (TypeScript clean):    PASS
2. activeReader/activeStats/activeGrid module-scope: PASS (lines 58-60)
3. postProgress/postError/runLoadInWorker defined:   PASS
4. noImaging branch sends { type: 'noImaging' }:     PASS (line 168)
5. V5 validation guard in renderIonImage:             PASS (lines 310-311)
6. Float32Array .buffer in transfer list:             PASS (lines 222-223, 263-264, 330)
7. No new Worker() instantiation:                     PASS
8. No import from ../state/store:                     PASS
```

Note: Vite production build (`vite build`) fails in the worktree due to the vendor/mzpeakts git submodule not being initialized in the linked worktree — this is a pre-existing infrastructure issue unrelated to this plan's code changes. `tsc -b` (TypeScript compile) passes cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ProgressBar.tsx Record exhaustiveness**
- **Found during:** Task 1 build verification
- **Issue:** `STAGE_LABEL: Record<LoadStage, string>` was missing `'no-imaging'` key, causing `tsc` error TS2741. This blocked the plan's acceptance criterion (build exit 0).
- **Fix:** Added `"no-imaging": "No Imaging Data"` to the STAGE_LABEL Record. `'no-imaging'` is not added to the STAGES array (it is a terminal state, not a pipeline step).
- **Files modified:** src/ui/ProgressBar.tsx
- **Commit:** 535dd19 (included in Task 1 commit)
- **Note:** This gap was documented in 05-01-SUMMARY.md as a Plan 04 responsibility. Fixed early as it was a build blocker for this plan.

**2. [Rule 1 - Bug] workerSelf cast for postMessage overload**
- **Found during:** Task 1 implementation
- **Issue:** TypeScript error TS2769: DOM lib's `self.postMessage(msg, transferList)` overloads don't accept a raw `Transferable[]` as the second argument (they expect `string` or `WindowPostMessageOptions`).
- **Fix:** Introduced `type WorkerSelf = { postMessage(m, t?): void }` and cast `self` via `unknown` to avoid the overload mismatch. Wrapped in `send()` and `sendTransfer()` helpers for clean call sites throughout.
- **Files modified:** src/worker/mzPeakWorker.ts
- **Commit:** 535dd19

## Known Stubs

None. The Worker implements the full pipeline with real reader/compute calls. No hardcoded values, no placeholder data paths.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes beyond what the threat model documents. The Worker's file I/O surface is identical to the prior main-thread surface — just relocated.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/worker/mzPeakWorker.ts exists | FOUND |
| src/ui/ProgressBar.tsx modified | FOUND |
| 05-02-SUMMARY.md created | FOUND |
| Commit 535dd19 (Task 1) | FOUND |
| tsc -b exits 0 | PASS |
| activeReader module-scope | FOUND (line 58) |
| postProgress function | FOUND (line 78) |
| postError function | FOUND (line 88) |
| runLoadInWorker function | FOUND (line 120) |
| noImaging branch | FOUND (line 168) |
| V5 validation guard | FOUND (lines 310-311) |
| .buffer in transfer list | FOUND (lines 222, 263, 330) |
| No new Worker() | CONFIRMED |
| No store import | CONFIRMED |
