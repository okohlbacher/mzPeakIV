---
phase: 05-worker-offload-robustness-static-deploy
reviewed: 2026-06-04T02:46:04Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/worker/mzPeakWorker.ts
  - src/worker/protocol.ts
  - src/state/store.ts
  - src/reader/types.ts
  - src/ui/App.tsx
  - src/ui/ImagingPanel.tsx
  - src/ui/ProgressBar.tsx
  - vite.config.ts
  - .github/workflows/deploy.yml
  - tools/codex_review.sh
findings:
  critical: 4
  warning: 2
  info: 1
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-06-04T02:46:04Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This phase offloads the mzPeak read/compute pipeline into a `DedicatedWorker`, introduces the `currentRequestId` stale-response guard, and adds static-deploy infrastructure. The implementation is broadly correct in structure but contains four blocking defects identified by Codex Round 2, all confirmed by source tracing. Two of those four are data-correctness bugs (silent incorrect rendering), one is a silent UI deadlock after I/O failure, and one is a missing error surface for unhandled Worker crashes. Two additional warnings address argument-parsing fragility in the CI script and a minor stale-request leak.

---

## Critical Issues

### CR-01: `presenceMask.buffer` transferred but `activeGrid.presenceMask` retained — detached buffer silently corrupts all subsequent ion-image stats and rendering

**File:** `src/worker/mzPeakWorker.ts:216,223`

**Issue:** `activeGrid` is assigned `grid` at line 216 — both names point to the same object. At line 223, `grid!.presenceMask.buffer` is added to `transferList` and transferred out of the Worker via `sendTransfer` (lines 225-238). After `postMessage` with a transfer list, the backing `ArrayBuffer` is detached: `activeGrid.presenceMask.byteLength` becomes 0 and every element access returns `undefined`.

All subsequent `renderIonImage` calls invoke `computeIonImageStats(ionImage, activeGrid)` (line 326), which reads `presenceMask[k]` inside a loop (ionImage.ts:134). Because `undefined === 0` is `false`, every absent cell passes the presence check — absent pixels are silently counted in statistics. Concurrently, the main thread's `rasterize.ts` (lines 149-157) reads `presenceMask[k]` for colormap rendering; `undefined === 0` is also `false` there, so absent pixels render with signal color instead of the sentinel dark-gray, corrupting the spatial layout of every ion image rendered after the first file load.

The defect is silent — no exception is thrown when reading a detached TypedArray in JavaScript; elements return `undefined`.

**Fix:** Do NOT transfer `presenceMask.buffer`. The `Uint8Array` is typically small (width × height bytes, e.g. 34,840 bytes for a 260×134 grid) — the structured-clone copy cost is negligible compared to the 6.5 MB WASM asset. Remove lines 220-223 and the comment at line 240 that references presenceMask transfer:

```diff
-  // Build the transfer list: transfer tic.buffer zero-copy (Pattern 3 / Pitfall 2).
-  // CRITICAL: always [float32Array.buffer] not [float32Array].
-  // Also transfer presenceMask.buffer from grid (ImagingGrid note in protocol.ts).
   const transferList: Transferable[] = [];
   if (tic) transferList.push(tic.buffer);
-  if (grid!.presenceMask) transferList.push(grid!.presenceMask.buffer);
+  // NOTE: presenceMask.buffer is NOT transferred — activeGrid retains a valid
+  // buffer for subsequent renderIonImage calls. The Uint8Array is small enough
+  // that structured-clone copy cost is negligible.
```

Also remove the stale comment at line 240:
```diff
-  // WARNING: tic and presenceMask are now detached — do not use after postMessage.
+  // WARNING: tic.buffer is now detached — do not use tic after postMessage.
```

Update `protocol.ts` line 85 to drop the presenceMask transfer note from the `LoadResult` comment.

---

### CR-02: `currentRequestId` not reset on new file open — stale render accepted after file switch

**File:** `src/state/store.ts:99,105,110,138,212`

**Issue:** `currentRequestId` is a module-scope `let` initialized to `0` (line 99). It is incremented on each `renderIonImage` call (line 138) and compared in the `renderResult` handler (line 212). `openUrl` and `openFile` both call `set({ ...initialState, ... })` (lines 105, 110) which resets Zustand state but does NOT reset `currentRequestId`.

Scenario: user opens file A, fires `renderIonImage` → `currentRequestId` becomes 1, Worker starts computing. User opens file B before the response arrives. `openFile` resets Zustand state but leaves `currentRequestId = 1`. When the stale Worker response for file A arrives with `requestId: 1`, the guard at line 212 passes (`1 === 1`) and the ion image from file A is committed into the store for file B — a data-correctness defect. The user sees ion-image data from the wrong file.

**Fix:** Reset `currentRequestId` in both `openUrl` and `openFile`:

```typescript
openUrl(url: string) {
  currentRequestId = 0;           // ← add
  set({ ...initialState, stage: "zip-index" });
  worker.postMessage({ type: "loadUrl", url } satisfies WorkerRequest);
},

async openFile(file: File) {
  currentRequestId = 0;           // ← add
  set({ ...initialState, stage: "zip-index" });
  const buffer = await file.arrayBuffer();
  worker.postMessage(
    { type: "loadFile", bytes: buffer, name: file.name } satisfies WorkerRequest,
    [buffer],
  );
},
```

Note: the reset in `openFile` must occur before `await file.arrayBuffer()` so that any in-flight render from the previous file is discarded while the new load is initiated.

---

### CR-03: Missing `worker.onerror` and `worker.onmessageerror` handlers — unhandled Worker crashes are invisible to the user

**File:** `src/state/store.ts:163`

**Issue:** `worker.onmessage` is wired (line 163) but `worker.onerror` and `worker.onmessageerror` are never set. Two failure modes go completely unhandled:

1. **`worker.onerror`**: Fires when the Worker throws an uncaught error at the script level (e.g. WASM instantiation failure, import resolution error at Worker startup, or a synchronous exception that escapes all `try/catch`). Without a handler, this fires a global `ErrorEvent` that is silently swallowed — the UI stays in `stage: "zip-index"` with the loading spinner permanently visible.

2. **`worker.onmessageerror`**: Fires when structured clone deserialization of a Worker message fails (e.g. a transferred `ArrayBuffer` whose type cannot be deserialized). Without a handler, the main thread never learns the message was lost; the store is left in an inconsistent intermediate state.

In both cases, `isRendering` may remain `true` (if the error occurs during a render) and the "Show Ion Image" button is permanently disabled.

**Fix:** Add both handlers immediately after `worker.onmessage`:

```typescript
worker.onerror = (e: ErrorEvent): void => {
  console.error("[mzPeakWorker] uncaught error:", e.message, e);
  useStore.setState({
    stage: "error",
    error: { class: "corrupt", message: `Worker error: ${e.message}` },
    isRendering: false,
  });
};

worker.onmessageerror = (e: MessageEvent): void => {
  console.error("[mzPeakWorker] message deserialization error:", e);
  useStore.setState({
    stage: "error",
    error: { class: "corrupt", message: "Worker message could not be deserialized." },
    isRendering: false,
  });
};
```

---

### CR-04: `file.arrayBuffer()` rejection is unhandled — UI is permanently stuck in loading state

**File:** `src/state/store.ts:111` / `src/ui/FileLoader.tsx:37`

**Issue:** `openFile` is declared `async` and calls `await file.arrayBuffer()` at line 111. The call site in `FileLoader.tsx` discards the returned Promise with `void openFile(file)` (line 37) — no `.catch()` and no surrounding `try/catch`.

`File.prototype.arrayBuffer()` can reject in practice: the file may have been deleted between selection and read, the OS can deny access due to permission changes, or storage failure can interrupt the read. When it rejects:

1. The store was already set to `stage: "zip-index"` (line 110) before the `await`.
2. The rejection propagates as an unhandled Promise rejection (`window.unhandledrejection`).
3. No `catch` path calls `useStore.setState({ stage: "error", ... })`.
4. The UI is permanently stuck showing "Reading ZIP index…" with the loading spinner — the user cannot open another file because `loading === true` keeps all inputs disabled.

**Fix option A — catch in the store action:**

```typescript
async openFile(file: File) {
  currentRequestId = 0;
  set({ ...initialState, stage: "zip-index" });
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    set({
      stage: "error",
      error: {
        class: "corrupt",
        message: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    return;
  }
  worker.postMessage(
    { type: "loadFile", bytes: buffer, name: file.name } satisfies WorkerRequest,
    [buffer],
  );
},
```

**Fix option B — catch at the call site in FileLoader.tsx** (less preferred; the action owns error routing):

```typescript
openFile(file).catch((err) => {
  /* store error state */
});
```

Option A is preferred because it keeps error-state writes co-located with the action.

---

## Warnings

### WR-01: `codex_review.sh` — `shift 2` with no following argument exits non-zero under `set -e`

**File:** `tools/codex_review.sh:40`

**Issue:** The argument-parsing loop contains:

```bash
--sha) SHA="${2:-}"; shift 2 ;;
```

If a user passes `--sha` as the final argument without a value (e.g., `bash tools/codex_review.sh round2 05 --sha`), `${2:-}` evaluates to an empty string (accepted) but `shift 2` then attempts to shift two positional parameters when only one (`--sha`) remains. Under `set -euo pipefail` (line 21), bash exits non-zero for an out-of-range shift count, terminating the script before the helpful error at line 73 ("round2 requires --sha") is reached.

**Fix:**

```bash
--sha)
  if [ -z "${2:-}" ]; then
    echo "ERROR: --sha requires a value" >&2; exit 1
  fi
  SHA="$2"; shift 2 ;;
```

---

### WR-02: In-flight `renderIonImage` `isRendering` not cleared when a new file is opened mid-render

**File:** `src/state/store.ts:105,110,141`

**Issue:** `initialState.isRendering` is `false` (line 83), so `set({ ...initialState, ... })` in `openUrl`/`openFile` does reset `isRendering`. However, the Worker's `renderIonImage` pipeline is async — the Worker does not receive a cancellation signal when a new `loadUrl`/`loadFile` message is posted. The Worker will process the queued `renderIonImage` request to completion, then send a `renderResult` back. Because `currentRequestId` is not reset (CR-02), this stale result can land and re-set `isRendering: false` redundantly — or, after CR-02 is fixed, the stale result is discarded but `isRendering` is already `false` from the file-open reset.

The immediate consequence of fixing CR-02 is that after a rapid file-switch, the stale `renderResult` is discarded at line 212. But `isRendering` is already `false` because `initialState` was spread, so no UI deadlock occurs. The residual concern is that the Worker continues burning CPU on a render that will be discarded; there is no cancellation protocol.

This is a latent quality issue rather than a crash — but if CR-02's fix resets `currentRequestId` to `0` and a subsequent render of the new file also gets `requestId: 1`, the stale response from the old file (also `requestId: 1`) could pass the guard again. The fix for CR-02 (reset to `0`) combined with the stale result guard is still safe because the stale result arrives before the new file's `loadResult`, and the new `renderIonImage` for the new file won't be triggered until `stage === "ready"`, meaning any in-flight old render's `requestId: 1` response will arrive when `currentRequestId` is still `0` → discarded. This is safe but fragile; a more robust approach is to reset to a large random starting value rather than 0.

**Fix:** In `openUrl` and `openFile`, reset `currentRequestId` to a value that can never collide with a stale response:

```typescript
currentRequestId = Date.now(); // or any monotonically large starting value
```

---

## Info

### IN-01: `deploy.yml` — deploy job inherits top-level permissions rather than declaring its own

**File:** `.github/workflows/deploy.yml:51`

**Issue:** The top-level `permissions` block grants `pages: write` and `id-token: write` to all jobs in the workflow, including the `build` job which only needs `contents: read`. GitHub Actions best practice is to scope permissions to the least-privilege job level. As-written, a supply-chain compromise in the `actions/setup-node` or build steps executes with `pages: write` permission.

**Fix:** Move `pages: write` and `id-token: write` to the `deploy` job scope:

```yaml
permissions:
  contents: read  # workflow-wide default

jobs:
  build:
    runs-on: ubuntu-latest
    # inherits contents: read — no extra permissions needed
    steps: ...

  deploy:
    runs-on: ubuntu-latest
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps: ...
```

---

_Reviewed: 2026-06-04T02:46:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
