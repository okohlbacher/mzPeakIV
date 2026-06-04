# Phase 5: Worker Offload, Robustness & Static Deploy — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/worker/mzPeakWorker.ts` | service (worker entry) | request-response + streaming progress | `src/state/store.ts` (`runLoad` body) | exact — runLoad moves wholesale |
| `src/worker/protocol.ts` | utility (type definitions) | — | `src/reader/types.ts` | role-match — discriminated union types |
| `src/state/store.ts` (modified) | store | request-response | `src/state/store.ts` itself | self — add fields + rewrite action bodies |
| `src/reader/types.ts` (modified) | model | — | `src/reader/types.ts` itself | self — add `'no-imaging'` to LoadStage union |
| `src/ui/App.tsx` (modified) | component | request-response | `src/ui/App.tsx` itself | self — add `'no-imaging'` branch |
| `src/ui/ImagingPanel.tsx` (modified) | component | request-response | `src/ui/ImagingPanel.tsx` itself | self — add `isRendering` button state |
| `src/ui/ProgressBar.tsx` (modified) | component | — | `src/ui/ProgressBar.tsx` itself | self — add `'no-imaging'` to STAGE_LABEL |
| `.github/workflows/deploy.yml` | config (CI) | batch | n/a — no existing workflow | none |
| `tools/codex_review.sh` (hardened) | utility (shell) | — | `tools/codex_review.sh` itself | self — harden edge cases |

---

## Pattern Assignments

### `src/worker/mzPeakWorker.ts` (service, request-response + streaming progress)

**Analog:** `src/state/store.ts` — the `runLoad` function (lines 119–231) and
`openUrl`/`openFile` action bodies (lines 236–256) move here nearly verbatim.
The Worker replaces inline async execution with `self.postMessage` for progress
ticks and structured result objects.

**Imports pattern** (from `src/state/store.ts` lines 1–21, adapted for Worker scope):
```typescript
// All mzpeakts/reader imports live in the Worker only — the Worker boundary
// is the new encapsulation wall. No Reader object ever crosses to the main thread.
import { openUrl as readerOpenUrl, type Reader } from "../reader/openUrl";
import { openFile as readerOpenFile } from "../reader/openFile";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
  spectrumMeta,
} from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
import { getSpectrumArraysFor } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
import { buildTic } from "../compute/tic";
import { buildIonImage, computeIonImageStats } from "../compute/ionImage";
import { UnsupportedEncodingError } from "../reader/errors";
import type { WorkerRequest, WorkerResponse } from "./protocol";
```

**Core pattern — `runLoad` body** (from `src/state/store.ts` lines 119–231):
The load pipeline is the exact sequence already in `runLoad`. In the Worker
it replaces `set({ stage: X })` with `self.postMessage({ type: 'progress', stage: X })`,
replaces the final `set({ reader, manifest, ... stage: 'ready' })` with
`self.postMessage({ type: 'loadResult', result: { manifest, ... } }, transferList)`,
and replaces the `set({ ..., stage: 'no-imaging' })` branch (new in Phase 5) with
`self.postMessage({ type: 'noImaging', result: { ... } })`.

```typescript
// src/state/store.ts lines 119-170 — the load sequence the Worker inherits:
async function runLoad(reader, set, get) {
  set({ stage: "manifest" });
  await yieldFrame();
  const manifest = readManifest(reader);

  set({ stage: "metadata" });
  await yieldFrame();
  const fileMeta = readFileMeta(reader);
  const stats = computeStats(reader, manifest);
  const capabilities = computeCapabilities(reader, manifest);

  set({ stage: "grid" });
  await yieldFrame();
  let grid = null;
  if (capabilities.isImaging) {
    const cr = extractCoords(reader);
    const geometry = readGridGeometry(reader);
    grid = cr
      ? buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy)
      : null;
    if (grid === null) {
      set({ ..., stage: "error", error: { class: "corrupt", message: "..." } });
      return;
    }
  }
  // ... tic stage (lines 176-210), then set({ stage: "ready", ... })
}
```

**yieldFrame pattern** (from `src/state/store.ts` lines 41–42):
```typescript
// Keep this in the Worker — it makes progress ticks observable between
// awaits so the main thread sees distinct stage transitions.
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

**Error serialization pattern** — the Worker cannot throw across the boundary.
Adapt `classifyError` (from `src/state/store.ts` lines 49–61) into a `postError` helper
that emits a plain serializable object (Error instances don't survive structured clone):
```typescript
// src/state/store.ts lines 49-61 — classifyError to adapt as postError in Worker:
function classifyError(err: unknown): StoreError {
  if (err instanceof UnsupportedEncodingError) {
    return {
      class: "unsupported-encoding",
      message: err.message,
      findings: err.findings,
    };
  }
  return {
    class: "corrupt",
    message: err instanceof Error ? err.message : String(err),
  };
}
// In the Worker, emit the same shape via postMessage instead of returning it:
// self.postMessage({ type: 'error', ...classifyError(err) })
```

**V5 input validation guard** — copy exactly from `src/state/store.ts` lines 283–285
into the Worker's `renderIonImage` handler (defense-in-depth: validate at the
processing site, not only at the dispatch site):
```typescript
// src/state/store.ts lines 283-285:
if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
if (mz - tolDa < 0) return;
```

**Worker-scoped reader state** (no analog in codebase — new pattern per RESEARCH.md):
```typescript
// The Worker holds the live Reader handle that the main thread previously held.
// Module-scope variables (not inside onmessage) persist across calls.
let activeReader: Reader | null = null;
let activeStats: ReturnType<typeof computeStats> | null = null;
let activeGrid: ImagingGrid | null = null;
```

**Float32Array transfer pattern** (from RESEARCH.md Pattern 3):
```typescript
// Transfer tic and ionImage zero-copy. The .buffer (not the view) is the Transferable.
const transferList: Transferable[] = [];
if (tic) transferList.push(tic.buffer);
self.postMessage(
  { type: 'loadResult', result: { ..., tic } } satisfies WorkerResponse,
  transferList,
);
// WARNING: tic is detached after postMessage — do not use it.
```

---

### `src/worker/protocol.ts` (utility, type definitions)

**Analog:** `src/reader/types.ts` (lines 1–84) — the project uses plain TS type
files for boundary contracts with JSDoc headers explaining the contract.

**File header pattern** (from `src/reader/types.ts` lines 1–8):
```typescript
// Plain, UI-facing types for the reader boundary.
//
// CONTRACT: this file is the shared vocabulary for everything ABOVE src/reader/.
// ...
```
Adapt the same header style for protocol.ts:
```typescript
// Typed postMessage protocol for the mzPeakWorker boundary.
//
// CONTRACT: only serializable/transferable types appear here.
// No Reader, no Arrow Table, no mzpeakts internals cross this boundary.
```

**Discriminated union type pattern** (from `src/reader/types.ts` lines 76–84,
and `src/reader/errors.ts` lines 13–13):
```typescript
// src/reader/types.ts lines 76-84 — the LoadStage union:
export type LoadStage =
  | "idle"
  | "zip-index"
  | "manifest"
  | "metadata"
  | "grid"
  | "tic"
  | "ready"
  | "error";
// Phase 5 adds 'no-imaging' to this union in types.ts.

// src/reader/errors.ts line 13 — discriminator string union:
export type ReaderErrorClass = "unsupported-encoding" | "corrupt";
```

Apply the same discriminated-union style to WorkerRequest and WorkerResponse:
```typescript
export type WorkerRequest =
  | { type: 'loadUrl'; url: string }
  | { type: 'loadFile'; bytes: ArrayBuffer; name: string }
  | { type: 'renderIonImage'; mz: number; tolDa: number; requestId: number }
  | { type: 'selectSpectrum'; index: number };

export type WorkerResponse =
  | { type: 'progress'; stage: LoadStage }
  | { type: 'loadResult'; result: LoadResult }
  | { type: 'noImaging'; result: NonImagingResult }
  | { type: 'renderResult'; ionImage: Float32Array | null; stats: IonImageStats | null; requestId: number }
  | { type: 'spectrumResult'; spectrum: SpectrumArrays }
  | { type: 'error'; class: ReaderErrorClass; message: string; findings?: UnsupportedFinding[] };
```

---

### `src/state/store.ts` (modified store, request-response)

**Self-analog** — the file is modified, not replaced. Key patterns from the
existing file that survive unchanged:

**State shape** (from `src/state/store.ts` lines 63–116):
The `State` type and `initialState` grow two new fields. Copy the existing field
block and append:
```typescript
// src/state/store.ts lines 63-85 — existing State type (excerpt):
type State = {
  reader: Reader | null;
  // ... all existing fields unchanged ...
  scale: "linear" | "log";
  percentile: number;
  // Phase 5 additions:
  isRendering: boolean;      // true while Worker renderIonImage is in flight
};

// src/state/store.ts lines 96-116 — initialState defaults (extend):
const initialState: State = {
  // ... all existing fields ...
  isRendering: false,
};
```

**Worker instantiation pattern** (module scope, outside `create()` — Pitfall 5):
```typescript
// Instantiate ONCE at module scope — not inside an action.
// The same Worker handles all load and render requests for the page's lifetime.
const worker = new Worker(
  new URL('../worker/mzPeakWorker.ts', import.meta.url),
  { type: 'module' },
);
```

**onmessage handler pattern** (replaces inline `runLoad` + `set()` calls):
The switch structure mirrors the existing `stage === "error"` conditional in
`App.tsx` (lines 17–22) and the `classifyError` result shape in `store.ts` lines 33–37:
```typescript
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
      if (msg.requestId !== currentRequestId) return; // stale — discard
      useStore.setState({ ionImage: msg.ionImage, ionImageStats: msg.stats, isRendering: false });
      break;
    case 'error':
      // classifyError already ran inside the Worker; emit its plain output shape.
      useStore.setState({
        stage: 'error',
        error: { class: msg.class, message: msg.message, findings: msg.findings },
        isRendering: false, // clear flag even on error (Pitfall 7)
      });
      break;
  }
};
```

**openFile action pattern** (from `src/state/store.ts` lines 247–255, adapted):
File objects cannot transfer; convert to ArrayBuffer first (Pitfall 3):
```typescript
// src/state/store.ts lines 247-255 — existing openFile body to replace:
async openFile(file: File) {
  set({ ...initialState, stage: "zip-index" });
  try {
    await yieldFrame();
    const reader = await readerOpenFile(file);
    await runLoad(reader, set, get);
  } catch (err) {
    set({ stage: "error", error: classifyError(err) });
  }
},
// Phase 5 replacement — dispatch to Worker instead:
async openFile(file: File) {
  set({ ...initialState, stage: "zip-index" });
  const buffer = await file.arrayBuffer();
  worker.postMessage(
    { type: 'loadFile', bytes: buffer, name: file.name } satisfies WorkerRequest,
    [buffer], // transfer ownership
  );
},
```

**renderIonImage action** (from `src/state/store.ts` lines 279–299, adapted):
```typescript
// src/state/store.ts lines 279-285 — existing guard to KEEP in the action (defense-in-depth):
async renderIonImage(mz: number, tolDa: number) {
  const { grid, stats } = get();
  if (!grid || !stats) return;
  if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
  if (mz - tolDa < 0) return;
  const rid = ++currentRequestId;
  set({ isRendering: true });
  worker.postMessage({ type: 'renderIonImage', mz, tolDa, requestId: rid } satisfies WorkerRequest);
},
```

---

### `src/reader/types.ts` (modified model)

**Self-analog** — one union member added to the existing `LoadStage` type.

**Current LoadStage union** (from `src/reader/types.ts` lines 76–84):
```typescript
export type LoadStage =
  | "idle"
  | "zip-index"
  | "manifest"
  | "metadata"
  | "grid"
  | "tic" // Phase 3 TIC compute stage (D-02)
  | "ready"
  | "error";
```

**Phase 5 addition** — append `'no-imaging'` BEFORE `'error'` to preserve the
semantic ordering (non-error terminal states before error):
```typescript
export type LoadStage =
  | "idle"
  | "zip-index"
  | "manifest"
  | "metadata"
  | "grid"
  | "tic"
  | "ready"
  | "no-imaging"   // D-06: valid non-imaging file — not a failure
  | "error";
```

---

### `src/ui/App.tsx` (modified component, request-response)

**Self-analog** — three targeted additions to the existing file.

**1. Stage sentinel switch** (from `src/ui/App.tsx` lines 43–58 — the hidden `data-testid="stage"` span):
The existing pattern uses a chain of ternaries. Add `'no-imaging'` before `'ready'`:
```typescript
// src/ui/App.tsx lines 43-58 — existing ternary chain:
{stage === "zip-index"
  ? "Reading ZIP index…"
  : stage === "manifest"
    ? "Parsing manifest…"
    : stage === "metadata"
      ? "Loading metadata…"
      : stage === "grid"
        ? "Building imaging grid…"
        : stage === "tic"
          ? "Building TIC image…"
          : stage === "ready"
            ? "Ready"
            : stage === "error"
              ? "Error"
              : "Idle"}
// Phase 5: add before stage === "ready":
// : stage === "no-imaging"
//   ? "No Imaging Data"
```

**2. `loading` guard** (from `src/ui/App.tsx` lines 17–22):
```typescript
// src/ui/App.tsx lines 17-22 — existing loading boolean:
const loading =
  stage === "zip-index" ||
  stage === "manifest" ||
  stage === "metadata" ||
  stage === "grid" ||
  stage === "tic";
// 'no-imaging' is a terminal state — NOT loading. No change needed.
```

**3. Right-pane conditional** (from `src/ui/App.tsx` lines 65–104):
The existing pattern gates on `stage === "ready"`. Phase 5 adds a parallel branch:
```typescript
// src/ui/App.tsx lines 65-104 — existing gate:
{stage === "ready" && (
  <main ...>
    <aside ...>
      <MetadataPanel />
      <StatsPanel />
      <CapabilitiesPanel />
      <GridDiagnosticsPanel />
    </aside>
    {grid !== null ? (
      <div ...><ImagingPanel /><SpectrumPanel /></div>
    ) : (
      <SpectrumPanel />
    )}
  </main>
)}
// Phase 5: add a parallel branch for 'no-imaging' (D-05: metadata panels stay):
{stage === "no-imaging" && (
  <main ...>
    <aside ...>
      <MetadataPanel />
      <StatsPanel />
      <CapabilitiesPanel />
    </aside>
    <div style={{ padding: "1.5rem", color: "#555" }}>
      <p>This file contains mass spectra but no spatial imaging coordinates.</p>
      <p>Open an imaging file to explore ion images.</p>
      <SpectrumPanel />
    </div>
  </main>
)}
```

---

### `src/ui/ImagingPanel.tsx` (modified component, request-response)

**Self-analog** — two targeted changes to the "Show Ion Image" button.

**Existing button pattern** (from `src/ui/ImagingPanel.tsx` lines 342–353):
```typescript
// src/ui/ImagingPanel.tsx lines 342-353 — existing button:
<button
  onClick={handleRenderIonImage}
  style={{
    background: "#1565c0",
    color: "#fff",
    border: "none",
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
  }}
>
  Show Ion Image
</button>
```

**Phase 5 addition** — add `isRendering` from store and wire to button:
```typescript
// New store subscription (add after line 86):
const isRendering = useStore((s) => s.isRendering);

// Modified button (lines 342-353):
<button
  onClick={handleRenderIonImage}
  disabled={isRendering || !mzValid}
  style={{
    background: "#1565c0",
    color: "#fff",
    border: "none",
    padding: "0.25rem 0.5rem",
    cursor: isRendering ? "wait" : "pointer",
    opacity: isRendering ? 0.7 : 1,
  }}
>
  {isRendering ? "Computing…" : "Show Ion Image"}
</button>
```

---

### `src/ui/ProgressBar.tsx` (modified component)

**Self-analog** — two additions to the existing `STAGE_LABEL` record and
`isLoading` check.

**Existing STAGE_LABEL record** (from `src/ui/ProgressBar.tsx` lines 13–22):
```typescript
// src/ui/ProgressBar.tsx lines 13-22:
const STAGE_LABEL: Record<LoadStage, string> = {
  idle: "Idle",
  "zip-index": "Reading ZIP index…",
  manifest: "Parsing manifest…",
  metadata: "Loading metadata…",
  grid: "Building imaging grid…",
  tic: "Rendering TIC image…",
  ready: "Ready",
  error: "Error",
};
// Phase 5: TypeScript will error if 'no-imaging' is missing from the Record.
// Add: "no-imaging": "No Imaging Data",
```

**Existing `STAGES` array** (from `src/ui/ProgressBar.tsx` lines 4–11):
```typescript
// src/ui/ProgressBar.tsx lines 4-11:
const STAGES: LoadStage[] = [
  "zip-index", "manifest", "metadata", "grid", "tic", "ready",
];
// 'no-imaging' is a terminal state, not a progress step — do NOT add it to STAGES.
// The step-dots are for the load pipeline; no-imaging replaces 'ready' as outcome.
```

---

### `.github/workflows/deploy.yml` (config, batch)

**No analog in the codebase** — no existing GitHub Actions workflows.
Use RESEARCH.md Pattern 7 directly (lines 362–412 of 05-RESEARCH.md).

Key elements verified by research:
- `actions/checkout@v4` with `submodules: true` (vendor/mzpeakts is a submodule)
- `actions/setup-node@v4` with `node-version: 22`
- `npm run bootstrap` step before `npm ci` (builds vendor/mzpeakts)
- `VITE_BASE: /mzPeakIV/` env var on the build step
- `touch dist/.nojekyll` to prevent Jekyll binary-asset mangling
- `actions/upload-pages-artifact@v4` with `path: ./dist`
- Separate `deploy` job needing `build`, using `actions/deploy-pages@v4`
- `permissions: { contents: read, pages: write, id-token: write }`
- `concurrency: { group: "pages", cancel-in-progress: false }`

---

### `tools/codex_review.sh` (hardened utility, shell)

**Self-analog** — the file is hardened, not rewritten.

**Existing structure** (from `tools/codex_review.sh` lines 1–131):
- `set -euo pipefail` (line 21) — keep
- Phase-dir glob with `find ... -name "${PHASE}-*"` (lines 48–52) — keep
- `build_prompt` function with `round1`/`round2` cases (lines 54–97) — keep
- `codex` binary check before live call (lines 116–119) — keep
- Verdict extraction via `grep -iE '^verdict:'` (lines 125–130) — keep

**Gap to harden — empty-diff detection** (Pitfall 8, research lines 485–487):
Add after line 90 in `build_prompt`'s `round2` case:
```bash
# src: tools/codex_review.sh line 90 — current diff command:
( cd "$ROOT" && git diff "${SHA}" -- . ':(exclude)vendor' )
# Phase 5 hardening: detect empty diff and exit with diagnostic:
DIFF="$(cd "$ROOT" && git diff "${SHA}" -- . ':(exclude)vendor')"
if [ -z "$DIFF" ]; then
  echo "ERROR: diff from ${SHA} is empty — ensure phase work is committed before running round2" >&2
  exit 1
fi
printf '%s\n' "$DIFF"
```

**Gap to harden — missing codex binary message** (existing check at lines 116–119
already exits 1, but the error message is minimal):
```bash
# Current (line 117-119):
if [ ! -x "$CODEX_BIN" ]; then
  echo "ERROR: codex CLI not found/executable at '$CODEX_BIN' (set \$CODEX_BIN)" >&2
  exit 1
fi
# Already adequate — no change needed.
```

---

## Shared Patterns

### LoadStage progression (applies to Worker + store + all UI components)

**Source:** `src/reader/types.ts` lines 76–84, `src/state/store.ts` lines 119–231,
`src/ui/ProgressBar.tsx` lines 4–22.

The stage sequence `zip-index → manifest → metadata → grid → tic → (ready | no-imaging | error)`
is the single source of truth for UI progress. The Worker emits `{ type: 'progress', stage }`
progress ticks that the main-thread `onmessage` handler routes to `useStore.setState({ stage })`.
Every component that branches on `stage` must handle `'no-imaging'` in Phase 5.

### Error shape (applies to Worker + store + ErrorBanner)

**Source:** `src/state/store.ts` lines 33–37 (`StoreError` type) + lines 49–61
(`classifyError`) + `src/reader/errors.ts` (error classes).

```typescript
// src/state/store.ts lines 33-37:
export type StoreError = {
  class: ReaderErrorClass;
  message: string;
  findings?: UnsupportedFinding[];
};
```

The Worker emits the same shape as a plain object in `{ type: 'error', class, message, findings? }`.
`classifyError` runs inside the Worker (to inspect the thrown Error) and its result
is transmitted as the plain-object fields of the error message. The main-thread
`onmessage` handler reconstructs the `StoreError` literal from those fields.

### Store subscription pattern (applies to all modified UI components)

**Source:** `src/ui/ImagingPanel.tsx` lines 71–86, `src/ui/App.tsx` lines 13–15.

```typescript
// src/ui/ImagingPanel.tsx lines 72-86:
const grid = useStore((s) => s.grid);
const tic = useStore((s) => s.tic);
const selectedIndex = useStore((s) => s.selectedIndex);
// ... selector per field, one per line.
```

Phase 5 adds `isRendering` as a new selector in `ImagingPanel.tsx`. Follow the
same one-selector-per-line style.

### `yieldFrame` (applies to Worker — replaces the main-thread version)

**Source:** `src/state/store.ts` lines 41–42.

```typescript
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

Copy verbatim into `mzPeakWorker.ts`. Inside a Worker, `setTimeout` is available;
`requestAnimationFrame` is not — the current implementation is correct for the Worker context.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.github/workflows/deploy.yml` | config (CI) | batch | No existing GitHub Actions workflows in the repo. Use RESEARCH.md Pattern 7 (lines 362–412) directly. |

---

## Metadata

**Analog search scope:** `src/` (all files), `tools/`, `.github/`
**Files scanned:** 14 source files read, 2 context/research documents
**Pattern extraction date:** 2026-06-03

**Key patterns identified:**
- The Worker is the `runLoad` function relocated — the body is verbatim, only the `set()` calls become `self.postMessage()` calls
- `classifyError` (already a pure function returning a plain object) runs inside the Worker; its output is the error message payload — no Error class crosses the boundary
- `'no-imaging'` is a terminal `LoadStage` variant (not a `ReaderErrorClass`); it gates the same left-panel metadata components as `'ready'` but replaces the ImagingPanel with an informational notice
- `ProgressBar`'s `STAGE_LABEL` Record will cause a TypeScript compile error if `'no-imaging'` is not added — this is the exhaustiveness check the planner should use as an acceptance criterion
- Worker instantiation must be at module scope (outside `create()`); the `onmessage` handler calls `useStore.setState()` directly (Zustand allows this from anywhere)
- Float32Array transfer: always `[float32Array.buffer]` in the transfer list, never the view itself; set the local variable to null immediately after postMessage
