# Phase 5: Worker Offload, Robustness & Static Deploy — Research

**Researched:** 2026-06-03
**Domain:** Web Workers + WASM, GitHub Pages static deploy, UX error taxonomy
**Confidence:** HIGH (stack is confirmed; critical MIME-type concern resolved by upstream precedent)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** "Show Ion Image" button stays — explicit user intent, no spurious renders while typing.
- **D-02:** Button shows a spinner / "Computing…" label and is disabled while a Worker request is in flight.
- **D-03:** Full load pipeline moves into the Worker — not just ion-image render. Every blocking operation (ZIP open, Parquet read, grid reconstruction, TIC compute, extractXIC) runs off the main thread.
- **D-04:** A valid mzPeak file with no spatial coordinates is not an error — new `LoadStage` value `'no-imaging'`; friendly informational message.
- **D-05:** Non-imaging files keep metadata panel, manifest, and spectrum browser accessible; only the TIC/ion-image area shows the notice.
- **D-06:** `'no-imaging'` is a `LoadStage` variant, NOT a new `ReaderErrorClass`. `classifyError()` and error taxonomy unchanged.
- **No COOP/COEP:** parquet-wasm 0.7.1 is single-threaded, no SharedArrayBuffer — no isolation headers needed even with a Worker.
- **`base: "/mzPeakIV/"`** in `vite.config.ts` — treat as placeholder; confirm final repo name before wiring GitHub Actions.

### Claude's Discretion

- Worker API technology (Comlink vs raw postMessage vs custom protocol)
- Abort/cancel signal design for in-flight Worker requests
- Exact debounce interval (button is primary trigger per D-01)
- GitHub Pages deploy trigger (push-to-main CI or manual) — implement standard GitHub Actions workflow

### Deferred Ideas (OUT OF SCOPE)

- Live m/z scrubbing / debounced auto-trigger
- In-memory full-column cache in the Worker for instant m/z scrubbing
- Lazy Parquet row-group projection for multi-GB files
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | App distinguishes and clearly communicates the three failure classes: "not an imaging file", "unsupported encoding/feature", and "corrupt/unreadable file". | D-04/D-06 adds `'no-imaging'` LoadStage; existing `ReaderErrorClass` ('unsupported-encoding' | 'corrupt') covers the other two; ErrorBanner already class-specific. Worker path must serialize errors through the postMessage boundary before classifyError() runs. |
</phase_requirements>

---

## Summary

Phase 5 has three independent workstreams: (1) moving the full read-and-compute pipeline into a Web Worker, (2) finalizing the three-way file-outcome UX (imaging / no-imaging / error), and (3) deploying as a static site on GitHub Pages via GitHub Actions. The underlying stack (Vite + vite-plugin-wasm + vite-plugin-top-level-await) already knows how to emit WASM correctly — the critical addition for Workers is that the same two WASM plugins must also appear in `vite.config.ts`'s `worker.plugins` block, or production builds silently regress to "ESM integration proposal for Wasm is not supported" inside the Worker.

The Worker communication decision defaults to **raw postMessage with a typed message protocol** rather than Comlink. Comlink 4.4.2 uses Proxy objects which cannot cross the Worker boundary, and the async `extractXIC` calls return `DataArrays` structures whose internal buffers can be transferred zero-copy as `Float32Array`; Comlink's `transfer()` helper would work here but adds a dependency whose integration with the Zustand store is non-obvious. The project's existing store pattern (structured progress messages → `set()` calls) maps naturally to a typed union of outgoing Worker messages.

GitHub Pages serves `.wasm` files with the correct `application/wasm` MIME type in production (the `.nojekyll` concern applies only to Jekyll's local server, not GitHub's CDN). The upstream `mzpeakts` demo running at `hupo-psi.github.io/mzpeakts/app.html` is live proof: it uses the identical parquet-wasm bundle on GitHub Pages without COOP/COEP headers. The `.nojekyll` sentinel file in the dist root is still the right practice to prevent Jekyll pre-processing interference with binary assets.

**Primary recommendation:** Use a typed-postMessage Worker with the existing `runLoad` body relocated wholesale; transfer `Float32Array.buffer` zero-copy; add `worker.plugins: [wasm(), topLevelAwait()]` to `vite.config.ts`; deploy via `actions/upload-pages-artifact@v4` + `actions/deploy-pages@v4` GitHub Actions.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File I/O (ZIP open, Parquet read) | Web Worker | — | Main-thread blocking is the entire problem; Worker owns all I/O |
| Grid reconstruction, TIC compute, extractXIC | Web Worker | — | CPU-bound; same Worker owns all reader state |
| Ion-image rasterization (rasterizeImage / rasterizeTic) | Main thread | — | Pure Float32Array→Uint8Array; fast; canvas ImageData must be created on main thread |
| State / UI dispatch | Main thread (Zustand) | — | Store owns all UI state; Worker is stateless and sends messages |
| LoadStage progress updates | Main thread | Worker sends progress msgs | Worker postMessages stage ticks; main-thread store sets() them |
| Error classification (classifyError) | Main thread | — | Errors are serialized across boundary; classifyError runs after deserialization |
| GitHub Actions deploy | CDN / Static | — | Vite build → upload-pages-artifact → deploy-pages |

---

## Standard Stack

### Core (already in package.json — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vite` | 8.0.16 | Build + dev server | Already pinned; `worker.plugins` config added this phase |
| `vite-plugin-wasm` | 3.6.0 | WASM ESM in main + Worker | Already pinned; must extend to `worker.plugins` |
| `vite-plugin-top-level-await` | 1.6.0 | Top-level await in main + Worker | Already pinned; must extend to `worker.plugins` |
| `zustand` | 5.0.14 | Store remains unchanged API | Worker is stateless; store only changes are new fields |
| `react` / `react-dom` | 19.2.7 | UI | No change |

### New Optional Dependency — Comlink (Decision: NOT recommended)

Comlink 4.4.2 would simplify the RPC feel but introduces complexity:

- Comlink's `Comlink.proxy(callback)` for progress callbacks adds Proxy objects that cannot easily type-check against the existing store `set()` pattern.
- `Comlink.transfer(float32Array, [float32Array.buffer])` works but obscures the transfer list from TypeScript without extra annotations.
- The existing `runLoad` body in `store.ts` is a sequential async function that calls `set()` at each stage — moving it to the Worker and sending typed postMessages is a direct translation with no framework overhead.

**Decision for Claude's Discretion:** Use raw `postMessage` with a typed discriminated-union message protocol. [ASSUMED — alternate: Comlink would also work but is unnecessary here]

### No new npm installs required for this phase.

---

## Package Legitimacy Audit

> No new external packages are installed in this phase. All dependencies already appear in `package.json` and were audited in earlier phases.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was not installable in this environment; however, no new packages are introduced so the audit has no new items to check.*

---

## Architecture Patterns

### System Architecture Diagram

```
User (browser)
    │
    ▼
React UI (main thread)
    │ dispatch openUrl/openFile/renderIonImage
    ▼
Zustand Store (main thread)
    │ postMessage({ type: 'load', ... } | { type: 'render', ... })
    ▼
┌─────────────────────────────────────────┐
│  mzPeakWorker.ts  (Worker thread)       │
│                                         │
│  parquet-wasm (WASM)                    │
│  zip.js + mzpeakts reader               │
│  grid reconstruction                    │
│  TIC / extractXIC compute               │
│                                         │
│  postMessage progress ticks:            │
│    { type: 'progress', stage }          │
│  postMessage results:                   │
│    { type: 'loadResult', ... }          │
│    { type: 'renderResult', ionImage }   │
│  postMessage errors:                    │
│    { type: 'error', serialized }        │
└─────────────────────────────────────────┘
    │ onmessage (main thread handler)
    ▼
Store.set() updates → React re-renders
    │
    ▼
Canvas rasterization (main thread, pure/fast)
    │
    ▼
DOM (ImagingPanel, SpectrumPanel, ErrorBanner)
```

### Recommended Project Structure (Phase 5 additions)

```
src/
├── worker/
│   └── mzPeakWorker.ts      # Worker entry point — owns all reader/compute calls
├── state/
│   └── store.ts             # Extended: new fields isRendering, LoadStage 'no-imaging'
│                            # openUrl/openFile become Worker dispatcher instead of inline async
├── ui/
│   ├── ImagingPanel.tsx     # Button shows "Computing…" + disabled while isRendering
│   └── App.tsx              # Handle 'no-imaging' stage in the stage→UI dispatch
.github/
└── workflows/
    └── deploy.yml           # Vite build → upload-pages-artifact → deploy-pages
```

### Pattern 1: Worker with WASM — vite.config.ts

**What:** Both `vite-plugin-wasm` and `vite-plugin-top-level-await` must appear in `worker.plugins` in addition to the top-level `plugins`. Omitting them causes a silent production-build regression: WASM imports work in dev (Vite's dev server transforms them on the fly) but fail in the built Worker bundle with "ESM integration proposal for Wasm is not supported currently". [VERIFIED: github.com/vitejs/vite discussions#19111, github.com/Menci/vite-plugin-wasm README]

**When to use:** Any Vite project where a Worker imports a `.wasm` file or a library that does (parquet-wasm, mzpeakts/src/index.ts).

```typescript
// Source: vite-plugin-wasm README + vite discussions#19111
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  // CRITICAL: repeat wasm + topLevelAwait for Worker bundles
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
    // Leave format default (iife) for Firefox compatibility.
    // vite-plugin-top-level-await handles the iife transform internally.
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,      // keep .wasm as hashed asset, never inline
  },
  // ... existing base, resolve.alias
});
```

> **Firefox note:** Leave `worker.format` at its default (iife). Do NOT set `{ format: 'es' }` — ES module workers are unsupported in Firefox. `vite-plugin-top-level-await >= 1.4.0` handles the IIFE transformation correctly. [CITED: vite-plugin-wasm README]

### Pattern 2: Typed postMessage Worker Protocol

**What:** A discriminated union of message types flowing in each direction; the Worker is instantiated once and reused across load/render calls.

```typescript
// src/worker/mzPeakWorker.ts — Worker-side message types
export type WorkerRequest =
  | { type: 'loadUrl'; url: string }
  | { type: 'loadFile'; bytes: ArrayBuffer; name: string }
  | { type: 'renderIonImage'; mz: number; tolDa: number }
  | { type: 'selectSpectrum'; index: number };

export type WorkerResponse =
  | { type: 'progress'; stage: LoadStage }
  | { type: 'loadResult'; result: LoadResult }
  | { type: 'noImaging'; result: NonImagingResult }
  | { type: 'renderResult'; ionImage: Float32Array | null; stats: IonImageStats | null }
  | { type: 'spectrumResult'; spectrum: SpectrumArraysTransferable }
  | { type: 'error'; class: ReaderErrorClass; message: string; findings?: UnsupportedFinding[] };

// Structured result objects — only serializable types (no Reader object)
export type LoadResult = {
  manifest: ManifestEntry[];
  fileMeta: FileMeta;
  stats: FileStats;
  capabilities: Capabilities;
  grid: ImagingGrid | null;
  tic: Float32Array | null;
  mixedRepresentationWarning: string | null;
};
```

```typescript
// src/state/store.ts — main-thread Worker integration
//
// Instantiate once at module load — Worker persists across file opens.
const worker = new Worker(new URL('../worker/mzPeakWorker.ts', import.meta.url), {
  type: 'module',
});

// Within actions, replace the inline async body with a postMessage dispatch:
async openUrl(url: string) {
  set({ ...initialState, stage: 'zip-index' });
  worker.postMessage({ type: 'loadUrl', url } satisfies WorkerRequest);
}

// Single onmessage handler drives all store updates:
worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'progress':
      useStore.setState({ stage: msg.stage });
      break;
    case 'loadResult':
      useStore.setState({ ...msg.result, stage: 'ready', error: null });
      break;
    case 'noImaging':
      useStore.setState({ ...msg.result, stage: 'no-imaging', error: null });
      break;
    case 'renderResult':
      useStore.setState({ ionImage: msg.ionImage, ionImageStats: msg.stats, isRendering: false });
      break;
    case 'error':
      useStore.setState({ stage: 'error', error: { class: msg.class, message: msg.message, findings: msg.findings } });
      break;
  }
};
```

### Pattern 3: Zero-Copy Float32Array Transfer

**What:** `Float32Array` is a typed array view over an `ArrayBuffer`. The buffer (not the view) is the Transferable. After transfer, the original view is detached (`.byteLength === 0`). [CITED: MDN Transferable Objects]

```typescript
// Worker side — send Float32Array zero-copy:
const tic: Float32Array = buildTic(xic, grid);
// Transfer the underlying buffer so main thread gets the same memory, no copy.
self.postMessage(
  { type: 'progress' } satisfies WorkerResponse,   // stage tick first
  [],
);
self.postMessage(
  { type: 'loadResult', result: { ...result, tic } } satisfies WorkerResponse,
  [tic.buffer],  // transfer list — tic.buffer is detached after this
);
// WARNING: tic is now detached — do not use it after postMessage.
```

```typescript
// Main thread — receive, no copy needed:
case 'loadResult':
  // msg.result.tic is the same memory, zero-copy, usable immediately.
  useStore.setState({ ...msg.result, stage: 'ready' });
  break;
```

> **Multiple transferables in one message:** You can transfer several buffers in one postMessage by listing all of them in the transfer array: `[tic.buffer, ionImage.buffer]`. Each must be an `ArrayBuffer` not already transferred.

### Pattern 4: File → Worker (local File bytes)

**What:** A browser `File` object cannot be transferred across a Worker boundary directly. Transfer the underlying `ArrayBuffer` instead.

```typescript
// Main thread — read bytes, transfer to Worker:
async openFile(file: File) {
  set({ ...initialState, stage: 'zip-index' });
  const buffer = await file.arrayBuffer();
  worker.postMessage(
    { type: 'loadFile', bytes: buffer, name: file.name } satisfies WorkerRequest,
    [buffer],  // transfer ownership
  );
}

// Worker side — reconstruct Blob from received bytes:
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type === 'loadFile') {
    const blob = new Blob([e.data.bytes]);
    const reader = await openBlob(blob);
    // ...
  }
};
```

> URL loading is simpler — pass the URL string directly, call `MzPeakReader.fromUrl(url)` inside the Worker.

### Pattern 5: Cancel / Abort In-Flight Worker Requests

`AbortSignal` cannot be serialized over postMessage. The pragmatic pattern for this use case is a **generation counter**: the store holds a `requestId` that increments on each new request; the Worker echoes the requestId in its response; stale responses (echoed id !== current id) are dropped on the main thread. [ASSUMED — standard pattern; no official authoritative source]

```typescript
// In store state:
let currentRequestId = 0;

// On each new renderIonImage call:
const rid = ++currentRequestId;
worker.postMessage({ type: 'renderIonImage', mz, tolDa, requestId: rid });

// In onmessage handler:
case 'renderResult':
  if (msg.requestId !== currentRequestId) return;  // stale — discard
  useStore.setState({ ionImage: msg.ionImage, isRendering: false });
```

### Pattern 6: `'no-imaging'` LoadStage

**What:** Add `'no-imaging'` to the `LoadStage` union in `src/reader/types.ts`. The Worker sends `{ type: 'noImaging' }` instead of `{ type: 'loadResult' }` when `!capabilities.isImaging`. The main-thread store sets `stage: 'no-imaging'`. App.tsx renders the informational notice instead of the ImagingPanel.

```typescript
// src/reader/types.ts — add to LoadStage union:
export type LoadStage =
  | "idle" | "zip-index" | "manifest" | "metadata"
  | "grid" | "tic" | "ready"
  | "no-imaging"   // D-06: valid non-imaging file — not an error
  | "error";

// App.tsx — handle the new stage:
const nonImaging = stage === 'no-imaging';
// In the right pane: when nonImaging, show the informational notice + SpectrumPanel;
// when stage === 'ready' && grid !== null, show ImagingPanel + SpectrumPanel.
```

### Pattern 7: GitHub Actions Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true          # vendor/mzpeakts is a git submodule
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - name: Bootstrap reader
        run: npm run bootstrap       # git submodule update + build vendor/mzpeakts
      - run: npm ci
      - name: Build
        run: npm run build
        env:
          VITE_BASE: /mzPeakIV/    # or the confirmed repo name
      - name: Add .nojekyll
        run: touch dist/.nojekyll  # prevent Jekyll mangling binary assets
      - uses: actions/upload-pages-artifact@v4
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```

> **Action versions:** `upload-pages-artifact@v4` and `deploy-pages@v4` are current as of 2026 (confirmed latest releases). Use `@v4` tag, not a SHA pin, so security patches apply automatically. [CITED: github.com/actions/deploy-pages, github.com/actions/upload-pages-artifact]

### Anti-Patterns to Avoid

- **Omitting `worker.plugins`:** The most dangerous pitfall — WASM works in dev but silently breaks in the built Worker. Always mirror the plugin list. [VERIFIED: vite discussions#19111]
- **`worker.format: 'es'`:** Breaks Firefox (ES module workers unsupported). Leave default (iife). [CITED: vite-plugin-wasm README]
- **Passing `Reader` object across boundary:** The `MzPeakReader` instance holds live ZIP/Parquet handles that cannot be serialized. The Worker is stateless from the main thread's perspective — results flow out as plain data only.
- **Transferring `Float32Array` view instead of its `.buffer`:** `postMessage(msg, [float32Array])` tries to transfer the view object (not transferable); must be `[float32Array.buffer]`.
- **Re-reading `File` inside the Worker:** `File` is a `Blob` subtype; blob handles do not survive the Worker boundary. Convert to `ArrayBuffer` on the main thread first.
- **Using Comlink with Zustand's store.set as a callback:** Comlink requires functions passed to the worker be wrapped with `Comlink.proxy()`; Zustand's `set` holds mutable closures that don't serialize cleanly. Stick to the postMessage protocol.
- **Inlining WASM with vite-plugin-singlefile:** Would base64-encode the 6.5 MB `.wasm` into the HTML, breaking caching and exceeding GitHub Pages limits. The `assetsInlineLimit: 0` setting in the current `vite.config.ts` already prevents this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker → main-thread RPC with typed results | Custom promise-ID map with WeakRef cleanup | Raw typed-union postMessage (no framework) | At this project's complexity level, a custom RPC adds bugs for no gain over a simple switch on `msg.type` |
| WASM loading in Worker | Manual `fetch + WebAssembly.instantiate()` | vite-plugin-wasm in `worker.plugins` | Plugin handles the import transform + hashed-asset URL rewrites across dev and prod |
| GitHub Pages deploy | Custom `gh-pages` branch script | `upload-pages-artifact@v4` + `deploy-pages@v4` | Official actions handle artifact packaging, environment setup, and deployment atomicity |
| Error serialization | Custom JSON stringify of Error subclass | Plain serialized object `{ class, message, findings }` | Error instances don't survive structured clone; plain objects do. `classifyError()` already produces `StoreError` which is a plain object — emit that shape from the Worker directly |

**Key insight:** The Worker is not a microservice. It is a compute offload with a one-request-at-a-time queue (load then render). The postMessage protocol can be a simple flat union — no need for a request queue, timeout machinery, or RPC framework.

---

## Common Pitfalls

### Pitfall 1: WASM not working inside built Worker
**What goes wrong:** App works in `vite dev` but the deployed site throws "ESM integration proposal for Wasm is not supported currently" from inside the Worker.
**Why it happens:** Vite's dev server intercepts all module requests (including WASM imports) at the network level. In production, the Worker bundle is built separately; without `worker.plugins`, neither `vite-plugin-wasm` nor `vite-plugin-top-level-await` transforms the WASM import in the Worker bundle.
**How to avoid:** Add `worker: { plugins: () => [wasm(), topLevelAwait()] }` to `vite.config.ts`. [VERIFIED: vite discussions#19111]
**Warning signs:** Error only appears after `npm run build` / `vite preview` — not in `npm run dev`.

### Pitfall 2: Transferring a view instead of its buffer
**What goes wrong:** `TypeError: Value at index 0 is not transferable.` or silently sends a copy (no error, but 6-60 MB extra memory copy for large images).
**Why it happens:** The postMessage transfer list must contain the underlying `ArrayBuffer`, not the `Float32Array` view.
**How to avoid:** Always write `[float32Array.buffer]`, never `[float32Array]`. After transfer, the view is detached — set the local variable to null immediately to catch use-after-transfer.
**Warning signs:** Profiler shows double memory for TIC/ion image arrays.

### Pitfall 3: `File` object lost in transit
**What goes wrong:** Worker receives undefined or empty bytes when the main thread tries to pass a `File` object directly.
**Why it happens:** `File` (a `Blob` subclass) is not structured-clone-serializable in all environments; its underlying data is not transferable.
**How to avoid:** Call `await file.arrayBuffer()` on the main thread, transfer the `ArrayBuffer`, reconstruct `new Blob([bytes])` in the Worker. [ASSUMED — MDN documents File as structured-cloneable in some browsers but not all; the ArrayBuffer path is universally safe]
**Warning signs:** Works in Chrome, breaks in Firefox.

### Pitfall 4: `stage` sentinel in App.tsx not updated for `'no-imaging'`
**What goes wrong:** The hidden `data-testid="stage"` span in `App.tsx` renders blank or "Idle" for non-imaging files; e2e tests that assert `stage` text fail.
**Why it happens:** The existing stage→text switch statement in `App.tsx` has no case for `'no-imaging'`.
**How to avoid:** Add `stage === 'no-imaging' ? "No Imaging Data" : ...` in both the hidden sentinel and the `ProgressBar` step list.

### Pitfall 5: Double Worker instantiation
**What goes wrong:** Each call to `openUrl`/`openFile` creates a new Worker, leaking the old one. Multiple Workers run simultaneously, racing to update the store.
**Why it happens:** Worker instantiation placed inside the action body instead of module scope.
**How to avoid:** Instantiate the Worker once at module scope (`const worker = new Worker(...)`) outside the `create()` call. The same Worker instance handles all load and render requests for the lifetime of the page.
**Warning signs:** Memory grows on each file open; Chrome Task Manager shows multiple Worker threads.

### Pitfall 6: GitHub Pages MIME type — LOCAL DEV ONLY concern
**What goes wrong:** `vite preview` or Jekyll local server serves `.wasm` with `application/octet-stream`, causing "WebAssembly: Response has unsupported MIME type" in Firefox.
**Why it happens:** Local dev servers (Jekyll, some Node servers) don't know `.wasm`. `vite preview` serves WASM correctly; the issue is Jekyll-based local preview, which is not used by this project.
**How to avoid:** Use `npm run preview` (Vite's preview server) for local validation. In CI, `vite preview` is already the webServer for Playwright. The LIVE GitHub Pages CDN serves `.wasm` with `application/wasm` correctly (confirmed by upstream mzpeakts demo at `hupo-psi.github.io/mzpeakts/app.html`). The `.nojekyll` file in `dist/` prevents Jekyll from touching binary assets. [MEDIUM confidence — upstream demo is live proof; GitHub Pages community discussions show isolated cases of wrong MIME types that appear correlated with Jekyll processing]
**Warning signs:** Error in browser console after `npm run preview` would indicate a local Vite regression; error only on deployed URL would indicate a Jekyll processing issue (ensure `.nojekyll` is present).

### Pitfall 7: `isRendering` flag stuck on error
**What goes wrong:** If `renderIonImage` Worker call throws and the Worker sends `{ type: 'error' }`, the `isRendering: true` flag set at dispatch time is never cleared, leaving the button permanently disabled.
**Why it happens:** The error branch in the onmessage handler sets `stage: 'error'` but doesn't clear `isRendering`.
**How to avoid:** Ensure the onmessage `'error'` case sets `isRendering: false`. Also: if `stage` transitions to `'error'`, the button should not be shown at all (ImagingPanel is hidden when there's an error), so this is defense-in-depth.

### Pitfall 8: `codex_review.sh` `round2` on an empty diff
**What goes wrong:** `git diff ${SHA} -- . ':(exclude)vendor'` returns empty output; `codex` receives an empty prompt; returns "no verdict" warning; script exits 3.
**Why it happens:** Phase work not yet committed, or SHA is post-commit (zero diff).
**How to avoid:** Harden the script to detect an empty diff and print a clear diagnostic: `"ERROR: diff from ${SHA} is empty — ensure phase work is committed before running round2"`. [ASSUMED — based on existing script structure at line 90]

---

## Code Examples

### Worker entry point skeleton

```typescript
// src/worker/mzPeakWorker.ts
//
// All mzpeakts/reader imports live HERE only — the Worker boundary is the new
// encapsulation wall. The existing "no mzpeakts outside src/reader/" rule still
// applies; the Worker is part of src/reader's execution context.

import { openBlob, openUrl as openReaderUrl } from "../reader/openUrl";
import { fileMeta as readFileMeta, manifest as readManifest, spectrumMeta } from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
import { getSpectrumArraysFor } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
import { buildTic } from "../compute/tic";
import { buildIonImage, computeIonImageStats } from "../compute/ionImage";
import { UnsupportedEncodingError } from "../reader/errors";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { Reader } from "../reader/openUrl";

let activeReader: Reader | null = null;
let activeStats: ReturnType<typeof computeStats> | null = null;
let activeGrid: ReturnType<typeof buildImagingGrid> | null = null;

function postProgress(stage: string) {
  self.postMessage({ type: 'progress', stage } satisfies WorkerResponse);
}

function postError(err: unknown) {
  if (err instanceof UnsupportedEncodingError) {
    self.postMessage({
      type: 'error',
      class: 'unsupported-encoding',
      message: err.message,
      findings: err.findings,
    } satisfies WorkerResponse);
  } else {
    self.postMessage({
      type: 'error',
      class: 'corrupt',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'loadUrl' || msg.type === 'loadFile') {
      // ... run load pipeline, postMessage progress + result
    } else if (msg.type === 'renderIonImage') {
      // ... run extractXIC + buildIonImage, transfer Float32Array
    } else if (msg.type === 'selectSpectrum') {
      // ... run getSpectrumArraysFor, transfer typed arrays
    }
  } catch (err) {
    postError(err);
  }
};
```

### ImagingPanel button with "Computing…" state

```typescript
// ImagingPanel.tsx — Phase 5 button additions
const isRendering = useStore((s) => s.isRendering);

// In JSX:
<button
  onClick={handleShowIonImage}
  disabled={isRendering || !mzValid}
  style={{ cursor: isRendering ? 'wait' : undefined }}
>
  {isRendering ? "Computing…" : "Show Ion Image"}
</button>
```

### `'no-imaging'` notice in App.tsx

```typescript
// App.tsx — add to the right-pane conditional
const noImaging = stage === 'no-imaging';

// Right pane:
{noImaging ? (
  <div style={{ padding: '1.5rem', color: '#555' }}>
    <p>This file contains mass spectra but no spatial imaging coordinates.</p>
    <p>Open an imaging file to explore ion images.</p>
    <SpectrumPanel />
  </div>
) : stage === 'ready' && grid !== null ? (
  // ... existing ImagingPanel + SpectrumPanel
) : stage === 'ready' ? (
  <SpectrumPanel />
) : null}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `upload-pages-artifact@v3` / `deploy-pages@v3` | `@v4` (current as of 2026) | 2024 — v3 deprecated Jan 2025 per GitHub changelog | Must use @v4 to avoid deprecation warning / eventual failure |
| `worker.plugins` as array literal | `worker.plugins` as `() => [...]` factory function | Vite 5+ | Factory function ensures fresh plugin instances per worker build; both forms work in Vite 8 |
| `new SharedWorker` for WASM (required cross-origin isolation) | Standard `new Worker` (single-threaded WASM, no SharedArrayBuffer) | parquet-wasm 0.7.1 is single-threaded | No COOP/COEP headers needed |
| Branch-based GitHub Pages (`gh-pages` branch) | GitHub Actions with environment (`github-pages`) | 2022–2024 | Official approach; upload-artifact/deploy-pages chain |

**Deprecated/outdated:**
- `upload-pages-artifact@v3` / `deploy-pages@v3`: deprecated January 30, 2025 per GitHub changelog; use v4. [CITED: github.blog/changelog/2024-12-05]
- `vite-plugin-singlefile` in production: explicitly rejected in CLAUDE.md — inlines 6.5 MB WASM as base64.
- `coi-serviceworker` COOP/COEP workaround: not needed (single-threaded WASM, confirmed by upstream mzpeakts demo).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + CI | ✓ | v22.22.0 | — |
| npm | Package install | ✓ | 11.13.0 | — |
| Vite 8 | Build | ✓ | 8.0.16 (in package.json) | — |
| Git submodule (vendor/mzpeakts) | Reader bootstrap | ✓ | Confirmed in repo | — |
| GitHub Actions (external) | Deploy | Not verifiable locally | n/a | Can deploy manually with `gh` CLI |

**Missing dependencies with no fallback:** none (all build-time deps present)
**Missing dependencies with fallback:** GitHub Actions requires repository to have Pages enabled via Settings → Pages → Source = GitHub Actions before first deploy.

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json` — this section is SKIPPED per config.

---

## Security Domain

> `security_enforcement: true` in config; `security_asvs_level: 1`.

### Applicable ASVS Categories (ASVS L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Existing store guards (mz > 0, finite, non-negative range) — must be enforced inside the Worker too, not just in the button handler |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `.mzpeak` bytes fed to WASM parser | Tampering | Worker isolates crash/hang to its thread; main thread stays responsive; classifyError catches thrown errors |
| Worker message injection (postMessage from untrusted origin) | Tampering | Workers spawned as same-origin module — `e.origin` is always same origin; no additional check needed |
| URL loading of attacker-controlled endpoint | Information Disclosure | Existing: file is opened client-side; no bytes leave the browser; mzpeakts' HTTP reader is fetch-based (same CORS rules as any browser fetch) |

**Phase 5 security note:** The input validation guard in `renderIonImage` (`!Number.isFinite(mz) || mz <= 0 || ...`) currently runs in the store action. When this logic moves into the Worker, the guard must be replicated inside the Worker's handler — defense-in-depth requires validation at the processing site, not only at the dispatch site. [ASSUMED — standard security principle]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Raw postMessage with typed union is preferable to Comlink for this use case | Architecture Patterns — Pattern 2 | Low: Comlink 4.4.2 would also work; requires adding comlink npm dep and using transfer() helper. Difference is stylistic. |
| A2 | Generation-counter abort pattern is correct for cancelling stale renderIonImage responses | Pattern 5 | Low: The button is disabled (D-02) during flight, so concurrent requests are UI-prevented; the cancel pattern is a belt-and-suspenders safety net. |
| A3 | GitHub Pages production CDN serves `.wasm` with `application/wasm` MIME type correctly | Pitfall 6 | Medium: Community discussions show isolated regressions; upstream mzpeakts demo is the strongest counter-evidence. Add `.nojekyll` and verify after first deploy. |
| A4 | `File` object is not reliably transferable across Worker boundary in all browsers | Pattern 4 | Low: `File` is documented as structured-cloneable in Chrome/Firefox, but converting to ArrayBuffer first is universally safe and avoids edge cases. |
| A5 | `upload-pages-artifact@v4` + `deploy-pages@v4` are current release tags (not SHA-pinned) | Pattern 7 / GitHub Actions workflow | Low: SHA pinning is more secure but harder to maintain; v4 major tags are stable. Project can SHA-pin after first deploy. |
| A6 | Empty diff hardening in codex_review.sh is a gap to address | Common Pitfalls — Pitfall 8 | Low: Only affects operator workflow, not correctness. |

---

## Open Questions

1. **Final GitHub repository name / base path**
   - What we know: `vite.config.ts` has `base: "/mzPeakIV/"` as a placeholder.
   - What's unclear: The actual GitHub organization + repo name (e.g., `okohlbacher/mzPeakIV` → base stays `/mzPeakIV/`; or `HUPO-PSI/mzPeakIV` → same). No git remote is configured yet.
   - Recommendation: Confirm repo name before wiring `VITE_BASE` in the deploy workflow. The placeholder is likely correct (`/mzPeakIV/`) but needs operator confirmation.

2. **Should `selectSpectrum` also move into the Worker?**
   - What we know: CONTEXT.md D-03 says "all blocking operations" move into the Worker. `selectSpectrum` calls `getSpectrumArraysFor` which is a Parquet read.
   - What's unclear: Whether spectrum reads are fast enough that keeping them on the main thread is acceptable, or whether they should be Worker messages too.
   - Recommendation: Move `selectSpectrum` into the Worker for consistency and to avoid the main thread holding a dead reference to the Reader after it moves. The Worker holds the active `Reader` handle.

---

## Sources

### Primary (HIGH confidence)
- github.com/Menci/vite-plugin-wasm README — `worker.plugins` configuration, Firefox/iife requirement, WASM in Workers documented and supported
- github.com/vitejs/vite discussions#19111 — Confirmed: production Worker build fails without `worker.plugins: [wasm(), topLevelAwait()]`; dev works because Vite transforms at the server level
- MDN — Transferable Objects: Float32Array transfer via `[float32Array.buffer]`, zero-copy semantics
- github.com/actions/deploy-pages — v5.0.0 released March 2026 (use v4 tag for stability)
- github.com/actions/upload-pages-artifact — v4 current; path: `./dist`; deprecation notice for v3 confirmed December 2024
- github.blog/changelog/2024-12-05 — v4 requirement for Pages actions confirmed
- github.com/kylebarron/parquet-wasm/discussions/270 — maintainer confirms no known issue with Workers; one user confirmed resolution after fixing instantiation order

### Secondary (MEDIUM confidence)
- vite.dev/guide/static-deploy — Official Vite GitHub Pages workflow structure (build + upload + deploy jobs, permissions); referenced action versions
- github.com/github/pages-gem/issues/695 — WASM MIME type works on live GitHub Pages; Jekyll LOCAL SERVER is the broken case (not production CDN)
- vite-plugin-top-level-await npm README — IIFE worker format requirement for Firefox; `>=1.4.0` confirmed

### Tertiary (LOW confidence)
- github.com/orgs/community/discussions/22863 — mixed reports on GitHub Pages WASM MIME type; most failures appear correlated with Jekyll pre-processing (resolved by .nojekyll). September 2025 complaint may be atypical.
- community.latenode.com WASM MIME discussion — corroborates .nojekyll workaround

---

## Metadata

**Confidence breakdown:**
- Standard stack / vite config: HIGH — Plugin documentation is explicit; production regression is documented with fix
- Worker protocol design: HIGH — Pattern is idiomatic TypeScript + postMessage; no framework magic
- Float32Array transfer: HIGH — MDN documented, standard browser API
- GitHub Actions workflow: HIGH — Official Vite docs + official actions releases confirmed
- GitHub Pages WASM MIME type: MEDIUM — Upstream demo is live proof; isolated community reports of failures likely Jekyll-related
- `no-imaging` LoadStage: HIGH — Direct extension of existing pattern; no framework involvement

**Research date:** 2026-06-03
**Valid until:** 2026-09-03 (stable stack; GitHub Actions action versions should be re-verified before deploy)
