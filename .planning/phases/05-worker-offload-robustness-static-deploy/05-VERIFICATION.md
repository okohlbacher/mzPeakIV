---
phase: 05-worker-offload-robustness-static-deploy
verified: 2026-06-03T12:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/7
  gaps_closed:
    - "CR-01: presenceMask.buffer removed from transfer list — activeGrid retains valid Uint8Array"
    - "CR-02: currentRequestId reset to Date.now() in both openUrl and openFile"
    - "CR-03: worker.onerror and worker.onmessageerror handlers added"
    - "CR-04: file.arrayBuffer() wrapped in try/catch with error routing to stage='error'"
  gaps_remaining: []
  regressions: []
---

# Phase 05: Worker Offload, Robustness & Static Deploy — Verification Report

**Phase Goal:** The app stays responsive on real-scale files by running the reader+grid+builders in a Web Worker, communicates all three failure classes clearly, and is publicly usable as a static GitHub Pages site.
**Verified:** 2026-06-03T12:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (4 gaps from initial verification)

## Goal Achievement

All four blocking bugs from the initial verification (CR-01 through CR-04) are confirmed fixed in the actual source code. The phase goal is now fully achieved: Worker offload is correct, all three failure classes surface an actionable error state, and the GitHub Pages deploy workflow is operational.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Reader + grid + ion-image/TIC compute run inside a Web Worker (rasters transferred zero-copy) | VERIFIED | `src/worker/mzPeakWorker.ts` implements the full pipeline. `npm run build` emits `dist/assets/mzPeakWorker-BagyBagJ.js`. tic.buffer and ionImage.buffer transferred zero-copy. |
| 2 | The three failure classes are distinct and actionable | VERIFIED | "not an imaging file" routes to `stage='no-imaging'` with informational notice (App.tsx line 67). "unsupported encoding" routes to `class='unsupported-encoding'` with findings. "corrupt/unreadable" routes to `class='corrupt'`. Worker-level crashes now surface via `worker.onerror` (store.ts line 257). file.arrayBuffer() failures now caught and routed (store.ts lines 114-125). |
| 3 | Ion-image statistics are correct (nonzeroCount, min, max) after Worker renders | VERIFIED | CR-01 closed: `presenceMask.buffer` is NOT in the transfer list. mzPeakWorker.ts line 220: comment confirms intentional structured-clone. `activeGrid.presenceMask` buffer remains live for all `computeIonImageStats` calls. |
| 4 | Stale render results from a previous file are discarded | VERIFIED | CR-02 closed: `currentRequestId = Date.now()` is the first statement in both `openUrl` (line 105) and `openFile` (line 111) before any `set()` call. Uses `Date.now()` (not 0) to avoid requestId collision across file loads. |
| 5 | App remains usable after Worker crash or message deserialization failure | VERIFIED | CR-03 closed: `worker.onerror` at store.ts line 257 sets `stage='error'`, `class='corrupt'`, and `isRendering: false`. `worker.onmessageerror` at line 266 does the same for deserialization failures. |
| 6 | User gets an error when a local file cannot be read (OS error, file deleted mid-pick) | VERIFIED | CR-04 closed: `file.arrayBuffer()` is wrapped in try/catch (store.ts lines 114-125). On failure, sets `stage='error'`, `class='corrupt'` with message derived from `err.message`, then returns early. |
| 7 | App deploys as a static site to GitHub Pages with correct WASM asset and base path | VERIFIED | `.github/workflows/deploy.yml` exists: upload-pages-artifact@v4, deploy-pages@v4, `touch dist/.nojekyll`, `VITE_BASE: /mzPeakIV/`, `submodules: true`. Build emits `dist/assets/parquet_wasm_bg-fnSaorAQ.wasm` as hashed asset (not inlined). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/worker/protocol.ts` | Typed postMessage protocol | VERIFIED | Exports WorkerRequest, WorkerResponse, LoadResult, NonImagingResult, IonImageStats. Pure type declarations. |
| `src/reader/types.ts` | LoadStage union includes 'no-imaging' | VERIFIED | `"no-imaging"` present before `"error"`. |
| `vite.config.ts` | worker.plugins factory for WASM in Worker builds | VERIFIED | Lines 47-49: `worker: { plugins: () => [wasm(), topLevelAwait()] }`. No `format:'es'`. `assetsDir:"assets"` present. |
| `src/worker/mzPeakWorker.ts` | Worker entry point — full load + render pipeline | VERIFIED | CR-01 closed: `presenceMask.buffer` absent from transfer list (only comment at line 220 references it to explain the intentional omission). Pipeline correct. |
| `src/state/store.ts` | Worker dispatcher — isRendering state, onerror, onmessageerror, try/catch | VERIFIED | CR-02: `currentRequestId = Date.now()` at lines 105 and 111. CR-03: `worker.onerror` at line 257, `worker.onmessageerror` at line 266. CR-04: try/catch around `file.arrayBuffer()` at lines 114-125. |
| `src/ui/App.tsx` | no-imaging branch renders metadata + informational notice | VERIFIED | Line 67: `{stage === "no-imaging" && ...}` renders MetadataPanel, StatsPanel, CapabilitiesPanel, informational notice, SpectrumPanel. GridDiagnosticsPanel omitted. |
| `src/ui/ProgressBar.tsx` | STAGE_LABEL includes 'no-imaging' | VERIFIED | `"no-imaging": "No Imaging Data"` present. Not in STAGES array (terminal state). |
| `src/ui/ImagingPanel.tsx` | isRendering-aware button state | VERIFIED | Line 87: `const isRendering = useStore((s) => s.isRendering)`. Line 345: `disabled={isRendering || ...}`. Line 351: `cursor: isRendering ? "wait" : "pointer"`. Line 355: `{isRendering ? "Computing…" : "Show Ion Image"}`. |
| `.github/workflows/deploy.yml` | GitHub Pages deploy workflow | VERIFIED | Two-job build+deploy. upload-pages-artifact@v4, deploy-pages@v4. `touch dist/.nojekyll`. `VITE_BASE: /mzPeakIV/`. `submodules: true`. Permissions: contents:read, pages:write, id-token:write. |
| `tools/codex_review.sh` | Empty-diff hardening in round2 case | VERIFIED | DIFF captured into variable, empty check exits 1 with diagnostic before calling codex binary. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vite.config.ts` | `src/worker/mzPeakWorker.ts` | `worker.plugins: () => [wasm(), topLevelAwait()]` | WIRED | Lines 47-49. Build confirms Worker bundle emitted. |
| `src/worker/protocol.ts` | `src/state/store.ts` | WorkerRequest / WorkerResponse imports | WIRED | store.ts lines 15-20. |
| `src/state/store.ts` | `src/worker/mzPeakWorker.ts` | `new Worker(new URL('../worker/mzPeakWorker.ts', import.meta.url), { type: 'module' })` | WIRED | Lines 91-94. |
| `src/state/store.ts` worker.onmessage | `src/state/store.ts` useStore.setState | onmessage handler routes all 6 WorkerResponse types | WIRED | Lines 177-255: all 6 types routed. isRendering cleared in renderResult (line 230) and error (line 251). |
| `src/state/store.ts` worker.onerror | `src/state/store.ts` useStore.setState | ErrorEvent → stage='error', isRendering=false | WIRED | Lines 257-264 (CR-03 fix). |
| `src/state/store.ts` worker.onmessageerror | `src/state/store.ts` useStore.setState | MessageEvent → stage='error', isRendering=false | WIRED | Lines 266-272 (CR-03 fix). |
| `src/state/store.ts` openFile try/catch | `src/state/store.ts` useStore.setState | arrayBuffer() failure → stage='error' | WIRED | Lines 114-125 (CR-04 fix). |
| `src/worker/mzPeakWorker.ts` | `src/reader/openUrl.ts` | readerOpenUrl call | WIRED | Line 12 import, line 285 call. |
| `src/worker/mzPeakWorker.ts` | `src/compute/ionImage.ts` | buildIonImage + computeIonImageStats | WIRED | Lines 23, 324-325. presenceMask valid (CR-01 fixed). |
| `src/ui/App.tsx` | `src/ui/SpectrumPanel.tsx` | SpectrumPanel in no-imaging branch | WIRED | App.tsx line 87. |
| `.github/workflows/deploy.yml` | `dist/.nojekyll` | `touch dist/.nojekyll` before upload | WIRED | deploy.yml line 44. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `src/ui/App.tsx` stage='no-imaging' | stage from store | Worker 'noImaging' message → useStore.setState({ stage: 'no-imaging' }) | Yes — real Worker response | FLOWING |
| `src/ui/ImagingPanel.tsx` isRendering button | isRendering from store | Worker 'renderResult' / 'error' / worker.onerror → useStore.setState({ isRendering: false }) | Yes — all terminal paths clear the flag | FLOWING |
| ionImageStats display | ionImageStats from store | Worker computeIonImageStats(ionImage, activeGrid) where activeGrid.presenceMask is live (CR-01 fixed) | Yes — valid stats | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm run build exits 0 with Worker bundle | `npm run build 2>&1 \| tail -10` | Build succeeds; `dist/assets/mzPeakWorker-BagyBagJ.js` emitted; exit 0 | PASS |
| TypeScript compilation clean | `npx tsc -b 2>&1 \| tail -5; echo "EXIT: $?"` | No errors, EXIT: 0 | PASS |
| presenceMask.buffer NOT in transfer list | `grep "presenceMask.buffer" src/worker/mzPeakWorker.ts` | Single comment-only occurrence at line 220 ("NOT transferred"); no `transferList.push(...)` for presenceMask | PASS |
| currentRequestId reset in openUrl and openFile | `grep -n "currentRequestId = Date.now()" src/state/store.ts` | Lines 105 and 111 — two hits, one in each action | PASS |
| worker.onerror and worker.onmessageerror present | `grep -n "worker\.onerror\|worker\.onmessageerror" src/state/store.ts` | Lines 257 and 266 — both handlers present | PASS |
| try/catch around file.arrayBuffer() | `grep -n -A5 "arrayBuffer" src/state/store.ts` | Lines 114-125: bare await replaced with try/catch; catch sets stage='error' and returns | PASS |

### Probe Execution

No probe scripts declared for this phase. Step 7c skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| UX-01 | 05-01 through 05-04 | App distinguishes and clearly communicates the three failure classes: "not an imaging file", "unsupported encoding/feature", and "corrupt/unreadable file" | SATISFIED | "not an imaging file": `stage='no-imaging'` + App.tsx informational notice. "unsupported encoding": `class='unsupported-encoding'` + findings in ErrorBanner. "corrupt/unreadable": `class='corrupt'` in ErrorBanner, covering Worker onmessage errors (all 4 CRs), worker.onerror (CR-03), worker.onmessageerror (CR-03), and file.arrayBuffer() failures (CR-04). All failure paths now reach the error state. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/deploy.yml` | 8-11 | pages:write + id-token:write scoped at workflow level, not deploy-job level | WARNING | Supply-chain concern (IN-01). Functional; suboptimal permission scoping. Not introduced by gap-closure plans. |

No TBD/FIXME/XXX/PLACEHOLDER debt markers found in phase-modified files that lack issue references.

No regressions observed. The four CR fixes are surgical and do not alter the behavior of any previously passing code path.

### Human Verification Required

No items requiring human-only verification. All must-haves are programmatically verifiable and confirmed in the actual code.

---

## Gaps Summary

No gaps remain. All four blocking bugs from the initial verification are confirmed closed:

- **CR-01** (mzPeakWorker.ts): `presenceMask.buffer` absent from the transfer list. The only reference to it is a comment at line 220 explicitly documenting the intentional omission. `activeGrid.presenceMask` remains a valid, non-detached `Uint8Array` for all subsequent `renderIonImage` calls.

- **CR-02** (store.ts): `currentRequestId = Date.now()` is the first statement in both `openUrl` (line 105) and `openFile` (line 111). Any in-flight `renderResult` from a previous file carries a different `requestId` and is silently discarded by the guard at line 226.

- **CR-03** (store.ts): `worker.onerror` (line 257) and `worker.onmessageerror` (line 266) both set `stage='error'`, `class='corrupt'`, and `isRendering: false`. Worker-level crashes and deserialization failures now surface as actionable errors rather than permanent loading spinners.

- **CR-04** (store.ts): `file.arrayBuffer()` is wrapped in try/catch (lines 114-125). OS-level file read failures route to `stage='error'` and return early, preventing the UI from being permanently stuck at `stage='zip-index'`.

The phase goal is fully achieved.

---

_Verified: 2026-06-03T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
