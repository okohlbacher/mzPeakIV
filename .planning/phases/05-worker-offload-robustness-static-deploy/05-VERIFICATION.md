---
phase: 05-worker-offload-robustness-static-deploy
verified: 2026-06-04T03:30:00Z
status: gaps_found
score: 4/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "App stays responsive and ion-image statistics are correct after Worker offload"
    status: failed
    reason: "CR-01: presenceMask.buffer is transferred to the main thread zero-copy, but activeGrid retains a reference to the same object. After sendTransfer(), activeGrid.presenceMask is a detached Uint8Array (byteLength=0). All subsequent renderIonImage calls invoke computeIonImageStats(ionImage, activeGrid) with the detached buffer, causing every element read to return undefined. ionImageStats.nonzeroCount, .min, and .max are silently wrong for every ion image rendered after the first file load."
    artifacts:
      - path: "src/worker/mzPeakWorker.ts"
        issue: "Line 216: activeGrid = grid; Line 223: if (grid!.presenceMask) transferList.push(grid!.presenceMask.buffer); — after sendTransfer at line 225, activeGrid.presenceMask is detached."
    missing:
      - "Remove line 223 (grid!.presenceMask.buffer from transfer list). presenceMask is a small Uint8Array (width*height bytes; ~35 KB for PXD001283 260x134). The structured-clone copy cost is negligible. Worker must retain a valid presenceMask for subsequent renderIonImage stat computation."
      - "Remove stale comment at line 240 ('tic and presenceMask are now detached'). Update to 'tic.buffer is now detached'."
      - "Update protocol.ts LoadResult JSDoc to drop the presenceMask transfer note."

  - truth: "Rendering stale results from a previous file are correctly discarded when a new file is opened"
    status: failed
    reason: "CR-02: currentRequestId is a module-scope let initialized to 0 (line 99 of store.ts). openUrl and openFile both call set({ ...initialState, ... }) which resets Zustand state but does NOT reset currentRequestId. If a renderIonImage was in flight for file A (requestId=1), and the user opens file B before the response arrives, the stale renderResult from file A arrives with requestId=1 which matches currentRequestId=1 — the stale ion image from file A is written into the store for file B."
    artifacts:
      - path: "src/state/store.ts"
        issue: "Lines 104-118: openUrl and openFile do not reset currentRequestId before posting the new load message."
    missing:
      - "Add currentRequestId = 0; (or a large random starting value per WR-02) at the top of both openUrl and openFile action bodies, before the set({ ...initialState }) call."

  - truth: "Worker crashes (WASM instantiation failure, script-level throws) surface as an actionable error rather than a permanently stuck loading spinner"
    status: failed
    reason: "CR-03: worker.onmessage is wired (line 163 of store.ts) but neither worker.onerror nor worker.onmessageerror is ever set. If the Worker throws an uncaught error at the script level (e.g. WASM instantiation failure, import resolution error at startup), an ErrorEvent fires on the worker object and is silently swallowed. The UI stays permanently in stage='zip-index' with the loading spinner. isRendering may remain true, permanently disabling the 'Show Ion Image' button."
    artifacts:
      - path: "src/state/store.ts"
        issue: "No worker.onerror or worker.onmessageerror handler after line 163."
    missing:
      - "Add worker.onerror = (e: ErrorEvent): void => { useStore.setState({ stage: 'error', error: { class: 'corrupt', message: 'Worker error: ' + e.message }, isRendering: false }); }; immediately after worker.onmessage."
      - "Add worker.onmessageerror = (e: MessageEvent): void => { useStore.setState({ stage: 'error', error: { class: 'corrupt', message: 'Worker message could not be deserialized.' }, isRendering: false }); }; immediately after worker.onerror."

  - truth: "file.arrayBuffer() I/O failures are communicated to the user rather than leaving the app in a permanent loading state"
    status: failed
    reason: "CR-04: openFile in store.ts (line 109-118) is async and calls await file.arrayBuffer() with no try/catch. FileLoader.tsx calls it as void openFile(file) (line 37) — no .catch() and no surrounding try/catch. If file.arrayBuffer() rejects (file deleted, OS denies access, storage failure), the promise rejection is unhandled. The store was already set to stage='zip-index', and no error path calls setState({ stage: 'error' }). The UI is permanently stuck showing 'Reading ZIP index...' — the loading flag prevents the user from opening another file."
    artifacts:
      - path: "src/state/store.ts"
        issue: "Lines 109-118: no try/catch around await file.arrayBuffer()."
      - path: "src/ui/FileLoader.tsx"
        issue: "Line 37: void openFile(file) — Promise rejection is discarded."
    missing:
      - "Wrap the await file.arrayBuffer() call in a try/catch inside openFile. On rejection, call set({ stage: 'error', error: { class: 'corrupt', message: 'Could not read file: ...' } }); return;. (Option A from CR-04 fix — preferred because error routing stays in the action.)"
---

# Phase 05: Worker Offload, Robustness & Static Deploy — Verification Report

**Phase Goal:** The app stays responsive on real-scale files by running the reader+grid+builders in a Web Worker, communicates all three failure classes clearly, and is publicly usable as a static GitHub Pages site.
**Verified:** 2026-06-04T03:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The phase delivers most of its architectural intent: the Worker offload architecture is in place, the build produces a Worker bundle, the GitHub Pages deploy workflow exists, and two of three failure classes have correct code paths. Four blocking bugs identified by the REVIEW.md (Codex round2 reject) are confirmed in the actual code. These bugs are not cosmetic — CR-01 silently corrupts ion-image statistics on every render after the first load; CR-02 can display a wrong file's ion image after a rapid file switch; CR-03 leaves the UI permanently stuck on a Worker crash; CR-04 leaves the UI permanently stuck when a file read fails.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Reader + grid + ion-image/TIC compute run inside a Web Worker (rasters transferred zero-copy) | VERIFIED | src/worker/mzPeakWorker.ts is the Worker entry point. runLoadInWorker implements the full pipeline. tic.buffer is zero-copy transferred. npm run build produces dist/assets/mzPeakWorker-DWzdChR6.js. |
| 2 | The three failure classes are distinct and actionable | PARTIAL | "not an imaging file" routes to stage='no-imaging' with informational notice (VERIFIED). "unsupported encoding" routes to error class='unsupported-encoding' with findings list (VERIFIED). "corrupt/unreadable" routes to error class='corrupt' with message. BUT: Worker-level crashes (WASM instantiation failure) do not surface at all — no worker.onerror handler (CR-03 FAILED). AND: file.arrayBuffer() rejection is not caught (CR-04 FAILED). |
| 3 | Ion-image statistics are correct (nonzeroCount, min, max) after Worker renders | FAILED | CR-01: presenceMask.buffer is transferred to main thread; activeGrid in Worker retains the same object reference. After transfer, activeGrid.presenceMask is a detached Uint8Array. computeIonImageStats(ionImage, activeGrid) at line 326 reads presenceMask[k] which returns undefined for all k — stats are silently wrong. |
| 4 | Stale render results from a previous file are discarded | FAILED | CR-02: currentRequestId is not reset in openUrl or openFile. A renderResult from file A's render (requestId=1) passes the stale-discard check after file B is opened, writing file A's ion image into the store for file B. |
| 5 | App remains usable after Worker crash or message deserialization failure | FAILED | CR-03: No worker.onerror or worker.onmessageerror handler. UI stuck permanently in loading state. isRendering left true permanently disabling the button. |
| 6 | User gets an error when a local file cannot be read (OS error, file deleted mid-pick) | FAILED | CR-04: await file.arrayBuffer() has no try/catch in openFile; FileLoader.tsx calls it as void openFile(file) discarding the Promise. Unhandled rejection leaves UI stuck at stage='zip-index'. |
| 7 | App deploys as a static site to GitHub Pages with correct WASM asset and base path | VERIFIED | .github/workflows/deploy.yml exists with upload-pages-artifact@v4 and deploy-pages@v4. VITE_BASE=/mzPeakIV/ set on build step. touch dist/.nojekyll present. submodules: true in checkout. npm run build exits 0 and produces dist/assets/mzPeakWorker-DWzdChR6.js + dist/assets/parquet_wasm_bg-fnSaorAQ.wasm (hashed, not inlined). |

**Score:** 4/7 truths verified (3 FAILED — CR-01, CR-02, CR-03+CR-04)

Note on the Vite build: 05-04-SUMMARY claimed `npm run build` failed with a vite-plugin-top-level-await TypeError in the Worker bundle. This is no longer true — the build succeeds and produces the Worker bundle. The 05-04 executor added `assetsDir: "assets"` to vite.config.ts (line 42) which fixed the path resolution issue in the plugin.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/worker/protocol.ts` | Typed postMessage protocol — WorkerRequest, WorkerResponse, LoadResult, NonImagingResult | VERIFIED | File exists. Exports all four types plus IonImageStats. Pure type declarations, no runtime code. |
| `src/reader/types.ts` | LoadStage union includes 'no-imaging' | VERIFIED | Line 85: `\| "no-imaging"` present before `"error"`. JSDoc comment: "D-06: valid non-imaging file — successful read, no spatial coords." |
| `vite.config.ts` | worker.plugins factory for WASM in Worker builds | VERIFIED | Lines 47-49: `worker: { plugins: () => [wasm(), topLevelAwait()] }`. No format:'es'. CRITICAL comment present. assetsDir:"assets" also present (fixes vite-plugin-top-level-await path issue). |
| `src/worker/mzPeakWorker.ts` | Worker entry point — full load + render pipeline | PARTIAL | File exists and implements the pipeline correctly, EXCEPT: presenceMask.buffer is incorrectly included in the transfer list (line 223), causing detached buffer corruption in all subsequent renderIonImage calls (CR-01). |
| `src/state/store.ts` | Worker dispatcher — no inline I/O; isRendering state | PARTIAL | File exists. reader field removed from State. isRendering: boolean present. module-scope Worker instantiation. onmessage handler routes all 6 response types. MISSING: worker.onerror and worker.onmessageerror handlers (CR-03). MISSING: currentRequestId reset in openUrl/openFile (CR-02). MISSING: try/catch around file.arrayBuffer() (CR-04). |
| `src/ui/App.tsx` | no-imaging branch renders metadata + informational notice | VERIFIED | Line 67: `{stage === "no-imaging" && ...}` renders MetadataPanel + StatsPanel + CapabilitiesPanel + informational notice + SpectrumPanel. GridDiagnosticsPanel omitted. Text: "This file contains mass spectra but no spatial imaging coordinates." Stage sentinel includes 'no-imaging' branch at line 53. |
| `src/ui/ProgressBar.tsx` | STAGE_LABEL includes 'no-imaging' | VERIFIED | Line 23: `"no-imaging": "No Imaging Data"`. 'no-imaging' absent from STAGES array (terminal state, not a pipeline step). |
| `src/ui/ImagingPanel.tsx` | isRendering-aware button state | VERIFIED | Line 87: const isRendering = useStore((s) => s.isRendering). Line 345: disabled={isRendering || ...}. Line 351: cursor: isRendering ? "wait" : "pointer". Line 355: {isRendering ? "Computing…" : "Show Ion Image"}. |
| `.github/workflows/deploy.yml` | GitHub Pages deploy workflow | VERIFIED | Two-job build+deploy structure. upload-pages-artifact@v4 and deploy-pages@v4 (not v3). touch dist/.nojekyll before upload. VITE_BASE:/mzPeakIV/ in build env. submodules: true in checkout. Permissions: contents:read, pages:write, id-token:write. |
| `tools/codex_review.sh` | Empty-diff hardening in round2 case | VERIFIED | Lines 90-95: DIFF captured into variable, empty check exits 1 with diagnostic before calling codex binary. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vite.config.ts` | `src/worker/mzPeakWorker.ts` | worker.plugins: () => [wasm(), topLevelAwait()] | WIRED | worker.plugins factory present at line 47. Build confirms Worker bundle is produced. |
| `src/worker/protocol.ts` | `src/state/store.ts` | WorkerRequest / WorkerResponse imports | WIRED | store.ts lines 15-20: imports WorkerRequest, WorkerResponse, LoadResult, NonImagingResult from ../worker/protocol. |
| `src/state/store.ts` | `src/worker/mzPeakWorker.ts` | new Worker(new URL('../worker/mzPeakWorker.ts', import.meta.url), { type: 'module' }) | WIRED | Lines 91-94: module-scope Worker instantiation. |
| `src/state/store.ts` worker.onmessage | `src/state/store.ts` useStore.setState | onmessage handler routes all 6 WorkerResponse types | WIRED | Lines 163-241: all 6 types routed (progress, loadResult, noImaging, renderResult, spectrumResult, error). isRendering cleared in both renderResult (line 216) and error (line 237). |
| `src/worker/mzPeakWorker.ts` | `src/reader/openUrl.ts` | readerOpenUrl call | WIRED | Line 12: import { openUrl as readerOpenUrl, openBlob }. Line 286: const reader = await readerOpenUrl(msg.url). |
| `src/worker/mzPeakWorker.ts` | `src/compute/ionImage.ts` | buildIonImage + computeIonImageStats | WIRED (with defect) | Lines 23, 325-326. The calls are wired but computeIonImageStats uses a detached presenceMask (CR-01). |
| `src/ui/App.tsx` | `src/ui/SpectrumPanel.tsx` | SpectrumPanel rendered in no-imaging branch | WIRED | Line 87 of App.tsx: `<SpectrumPanel />` inside the stage === "no-imaging" block. |
| `.github/workflows/deploy.yml` | `dist/.nojekyll` | touch dist/.nojekyll before upload | WIRED | Line 44 of deploy.yml: `run: touch dist/.nojekyll`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `src/ui/App.tsx` stage='no-imaging' branch | stage from store | Worker 'noImaging' message → useStore.setState({ stage: 'no-imaging' }) | Yes — real Worker response | FLOWING |
| `src/ui/ImagingPanel.tsx` isRendering button | isRendering from store | Worker 'renderResult' / 'error' → useStore.setState({ isRendering: false }) | Yes — real Worker state | FLOWING |
| `src/ui/ImagingPanel.tsx` ion image paint | ionImage from store | Worker 'renderResult' → store → ImagingPanel renders canvas | Yes | FLOWING |
| ionImageStats display | ionImageStats from store | Worker computeIonImageStats(ionImage, activeGrid) where activeGrid.presenceMask is DETACHED | Produces corrupted values | HOLLOW (CR-01 — wrong stats after buffer transfer) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm run build exits 0 with Worker bundle | `npm run build 2>&1 \| tail -5` | Build succeeds; dist/assets/mzPeakWorker-DWzdChR6.js emitted; 0 exit | PASS |
| TypeScript compilation clean | `npx tsc -b 2>&1 \| tail -3; echo "EXIT: $?"` | No errors, EXIT: 0 | PASS |
| 'no-imaging' in LoadStage union | `grep "no-imaging" src/reader/types.ts` | Line 85 present | PASS |
| worker.plugins in vite.config.ts | `grep "worker.plugins" vite.config.ts` | Line 48: `plugins: () => [wasm(), topLevelAwait()]` | PASS |
| worker.onerror in store.ts | `grep "onerror\|onmessageerror" src/state/store.ts` | No output — handlers absent | FAIL |
| currentRequestId reset in openUrl/openFile | `grep -A5 "openUrl\|openFile" src/state/store.ts \| grep "currentRequestId"` | No reset found in either action | FAIL |
| presenceMask.buffer NOT in transfer list | `grep "presenceMask.buffer" src/worker/mzPeakWorker.ts` | Line 223: if (grid!.presenceMask) transferList.push(grid!.presenceMask.buffer) — PRESENT (wrong) | FAIL |
| try/catch around file.arrayBuffer() | `grep -A5 "arrayBuffer" src/state/store.ts` | No try/catch — bare await with no error handling | FAIL |

### Probe Execution

No probe scripts declared for this phase. Step 7c skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| UX-01 | 05-01 through 05-04 | App distinguishes and clearly communicates the three failure classes: "not an imaging file", "unsupported encoding/feature", and "corrupt/unreadable file" | PARTIAL | "not an imaging file" (no-imaging stage + informational notice): VERIFIED. "unsupported encoding" (class='unsupported-encoding' + findings in ErrorBanner): VERIFIED. "corrupt/unreadable" (class='corrupt' in ErrorBanner): PARTIAL — Worker-thrown errors reach the error state correctly via onmessage handler, but Worker-level crashes (onerror) and file.arrayBuffer() rejections (try/catch missing) do not surface an error state at all, leaving the UI stuck in loading (CR-03, CR-04). UX-01 cannot be marked Complete while these two failure paths leave the UI unresponsive. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/worker/mzPeakWorker.ts | 223 | presenceMask.buffer transferred while activeGrid retains reference | BLOCKER | Detached Uint8Array in Worker; computeIonImageStats produces wrong stats for all ion images after first load (CR-01) |
| src/worker/mzPeakWorker.ts | 240 | Comment "tic and presenceMask are now detached" — stale, misleading | WARNING | Documents an incorrect behavior as intentional |
| src/state/store.ts | 104-118 | currentRequestId not reset in openUrl/openFile | BLOCKER | Stale renderResult from previous file can pass guard and write wrong ion image to store (CR-02) |
| src/state/store.ts | 163 | worker.onmessage only; no worker.onerror or worker.onmessageerror | BLOCKER | Unhandled Worker crashes leave UI permanently stuck in loading state with no error surface (CR-03) |
| src/state/store.ts | 111 | await file.arrayBuffer() with no try/catch; caller uses void openFile(file) | BLOCKER | OS file-read failure leaves UI stuck at stage='zip-index' with no error recovery (CR-04) |
| .github/workflows/deploy.yml | 8-11 | pages:write + id-token:write scoped at workflow level, not deploy-job level | WARNING | Supply-chain compromise in build steps (actions/setup-node, npm ci) executes with pages:write (IN-01). Functional but suboptimal permission scoping. |

Note: No TBD/FIXME/XXX/PLACEHOLDER debt markers found in phase-modified files that lack issue references.

### Human Verification Required

No items requiring human-only verification. All identified gaps are programmatically verifiable and confirmed in the actual code.

---

## Gaps Summary

Four bugs identified in the REVIEW.md (confirmed by source code inspection) block the phase goal:

**Root cause cluster A — Worker buffer management (CR-01):** The presenceMask.buffer transfer is architecturally wrong. The intent from protocol.ts JSDoc was to transfer it zero-copy, but the Worker must retain a valid presenceMask for all subsequent renderIonImage calls. Removing grid!.presenceMask.buffer from the transfer list (line 223) is the complete fix — structured clone copies the small Uint8Array for the main thread while the Worker retains its copy.

**Root cause cluster B — Store Worker integration (CR-02, CR-03, CR-04):** Three separate wiring gaps in store.ts. All have simple, targeted fixes: (1) two lines adding currentRequestId = 0 in openUrl and openFile, (2) two onerror/onmessageerror handler assignments after worker.onmessage, and (3) a try/catch block around await file.arrayBuffer() in openFile.

The PROC-01 Codex review returned `reject` for both round1 (plan review) and round2 (diff review), with both rounds independently identifying these bugs. The operator has been notified (05-05-SUMMARY.md). These gaps require a gap-closure plan before the phase can be marked complete.

---

_Verified: 2026-06-04T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
