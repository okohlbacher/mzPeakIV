---
phase: 05-worker-offload-robustness-static-deploy
plan: "07"
subsystem: store
tags: [worker, error-handling, stale-response-guard, robustness]
dependency_graph:
  requires: []
  provides: [CR-02-closed, CR-03-closed, CR-04-closed]
  affects: [src/state/store.ts]
tech_stack:
  added: []
  patterns: [worker-error-boundary, request-id-reset-on-open, try-catch-arraybuffer]
key_files:
  created: []
  modified:
    - src/state/store.ts
decisions:
  - "Use Date.now() (not 0 or ++counter) for currentRequestId reset in openUrl/openFile per WR-02: avoids the edge case where a stale response with requestId=1 from file A matches requestId=1 for a render of file B"
  - "worker.onerror and worker.onmessageerror both set isRendering=false to prevent permanently-stuck Show Ion Image button (mirrors existing error case in onmessage)"
  - "file.arrayBuffer() try/catch routes to class='corrupt' consistent with other file-read error paths"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-03"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 05 Plan 07: CR-02/CR-03/CR-04 Store Worker Wiring Gaps Summary

Three targeted wiring gaps in `src/state/store.ts` closed: stale-render guard reset on new file open, Worker crash error surface, and arrayBuffer read failure handling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix CR-02, CR-03, CR-04 in store.ts | 85357a9 | src/state/store.ts |

## What Was Built

### CR-02: currentRequestId reset in openUrl and openFile (stale-render guard)

`currentRequestId = Date.now()` added as the **first statement** in both `openUrl` and `openFile` action bodies, before any `set()` call or `await`. This ensures any in-flight `renderResult` response carrying the previous file's `requestId` is silently discarded by the existing guard at line 212. Using `Date.now()` (not `0` or `++counter`) avoids the edge case where a stale response with `requestId=1` from file A could match `requestId=1` for a render of file B.

### CR-03: worker.onerror and worker.onmessageerror handlers

Two handlers added immediately after the `worker.onmessage` block closing brace:
- `worker.onerror` catches uncaught Worker runtime errors (script crash, WASM panic) and routes to `stage='error'` with `class='corrupt'`, clearing `isRendering`
- `worker.onmessageerror` catches structured-clone deserialization failures (e.g. a non-transferable object sent back from the Worker) and routes to the same error path

Both mirror the existing `case "error"` branch in `onmessage` that already correctly clears `isRendering` (Pitfall 7 / T-05-06).

### CR-04: try/catch around file.arrayBuffer() in openFile

The bare `await file.arrayBuffer()` was replaced with a `try/catch` block. On failure, the catch sets `stage='error'` with `class='corrupt'` and a message derived from `err.message`, then returns early. This prevents OS-level read failures (file locked, revoked File handle, out-of-memory) from leaving the UI in a permanently stuck `zip-index` state.

## Verification Results

```
grep -n "currentRequestId = Date.now()" src/state/store.ts
105:    currentRequestId = Date.now();
111:    currentRequestId = Date.now();

grep -n "worker\.onerror" src/state/store.ts
257:worker.onerror = (e: ErrorEvent): void => {

grep -n "worker\.onmessageerror" src/state/store.ts
266:worker.onmessageerror = (e: MessageEvent): void => {

grep -n "arrayBuffer" src/state/store.ts
115:      buffer = await file.arrayBuffer();

npx tsc -b: EXIT 0
```

`npm run build` exits with a pre-existing `[UNLOADABLE_DEPENDENCY]` error for `vendor/mzpeakts/lib/src/index.ts` — this is a worktree isolation issue (vendor symlink not present in the worktree); the main repo builds correctly. The store.ts changes are not implicated: TypeScript type-checking (`tsc -b`) exits 0 and the error appears in `src/reader/openUrl.ts`, a file not touched by this plan.

## Deviations from Plan

None — plan executed exactly as written. All three fixes applied as specified, using the exact code patterns from the plan's `<action>` blocks.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The changes are pure error-boundary wiring within existing trust boundaries documented in the plan's threat model (T-05-06, T-05-07, T-05-SC).

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src/state/store.ts` modified with all three fixes confirmed by grep
- [x] Two hits for `currentRequestId = Date.now()` (lines 105 and 111)
- [x] One hit for `worker.onerror` (line 257)
- [x] One hit for `worker.onmessageerror` (line 266)
- [x] `arrayBuffer()` inside try/catch (line 115)
- [x] Commit 85357a9 exists
- [x] `npx tsc -b` exits 0
