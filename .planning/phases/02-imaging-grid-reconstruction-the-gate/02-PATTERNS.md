# Phase 2: Imaging Grid Reconstruction (THE GATE) — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 8 (6 new, 2 extended)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/reader/scanCoords.ts` | service | request-response (Arrow→POJO) | `src/reader/stats.ts` | exact |
| `src/reader/scanCoords.test.ts` | test | — | `src/reader/stats.test.ts` | exact |
| `src/imaging/types.ts` | model | — | `src/reader/types.ts` | exact |
| `src/imaging/grid.ts` | service | transform (plain arrays→ImagingGrid) | `src/reader/arrays.ts` | role-match |
| `src/imaging/grid.test.ts` | test | — | `src/reader/stats.test.ts` | exact |
| `src/ui/GridDiagnosticsPanel.tsx` | component | request-response (store→render) | `src/ui/CapabilitiesPanel.tsx` | exact |
| `src/reader/types.ts` (extend) | model | — | same file | exact |
| `src/state/store.ts` (extend) | store | CRUD | same file | exact |
| `src/ui/App.tsx` (extend) | component | — | same file | exact |

---

## Pattern Assignments

### `src/reader/scanCoords.ts` (service, Arrow→POJO transform)

**Analog:** `src/reader/stats.ts`

**Imports pattern** (`stats.ts` lines 1–12):
```typescript
// Single reader boundary import — only the opaque Reader type from openUrl.
// Plain POJO types from ./types. No apache-arrow, no mzpeakts internals here.
import type { Reader } from "./openUrl";
import type {
  Capabilities,
  FileStats,
  ManifestEntry,
  SpectrumRepresentation,
} from "./types";
```

For `scanCoords.ts` adapt to:
```typescript
import type { Reader } from "./openUrl";
// No types needed from ./types yet; ImagingGrid lives in src/imaging/types.ts
```

**CV accession constants pattern** (`stats.ts` lines 14–29):
```typescript
// ── CV accession constants ────────────────────────────────────────────────────
// IMS:1000050 = position x; IMS:1000051 = position y (imaging-mzpeak-spec v0.3)
const IMS_POS_X_COL = "IMS_1000050_position_x";
const IMS_POS_Y_COL = "IMS_1000051_position_y";
const IMS_POS_X_ACC = "IMS:1000050";
const IMS_POS_Y_ACC = "IMS:1000051";
```
These exact constants are ALREADY DEFINED in `stats.ts` lines 25–29 — copy verbatim, do not redefine with differing names.

**Discovery-block access pattern** (`stats.ts` lines 222–230 in `probeIsImaging`):
```typescript
// Source 3: mzpeak_index.json metadata.imaging.is_imaging discovery block.
const fileIndexMeta = reader.store?.fileIndex?.metadata;
if (fileIndexMeta && typeof fileIndexMeta === "object") {
  const imaging = (fileIndexMeta as Record<string, unknown>)["imaging"];
  if (imaging && typeof imaging === "object") {
    const isImagingFlag = (imaging as Record<string, unknown>)["is_imaging"];
    if (isImagingFlag === true) return true;
  }
}
```
`scanCoords.ts` uses the same `reader.store.fileIndex.metadata` path to read the `imaging` discovery block for `pixel_count`, `pixel_size_um`, and `coordinate_base`. The same nested-object-with-`as Record<string, unknown>` defensive cast applies throughout.

**Per-record scan access pattern** (`stats.ts` lines 238–259, inside `probeIsImaging`):
```typescript
// check first few spectra for promoted IMS position columns on scans.
const probeLimit = Math.min(sm.length, 5);
for (let i = 0; i < probeLimit; i++) {
  const rec = sm.get(i);

  if (rec.scans && rec.scans.length > 0) {
    for (const scan of rec.scans) {
      const scanMeta = scan.meta ?? {};
      if (
        metaValue(scanMeta, IMS_POS_X_COL) !== undefined ||
        metaValue(scanMeta, IMS_POS_Y_COL) !== undefined
      ) {
        return true;
      }
      // Source 2: CV-param probe via accession
      if (
        scan.getParamByAccession?.(IMS_POS_X_ACC) !== undefined ||
        scan.getParamByAccession?.(IMS_POS_Y_ACC) !== undefined
      ) {
        return true;
      }
    }
  }
}
```
`scanCoords.ts` EXTENDS this into a full extractor. Strategy 2 (cvParams fallback) copies the `scan.getParamByAccession?.(...)` call pattern. Strategy 3 (id-string parse) is new but follows the same `rec = sm.get(i)` loop entry.

**Export shape pattern** (`stats.ts` lines 65–68, `computeStats`; lines 149–153, `computeCapabilities`):
```typescript
export function computeStats(
  reader: Reader,
  manifest: ManifestEntry[],
): FileStats {
```
`scanCoords.ts` exports a named function with the same signature style:
```typescript
export function extractCoords(reader: Reader): CoordResult | null { ... }
export function readGridGeometry(reader: Reader): GridGeometry | null { ... }
```

**Error handling pattern** — `stats.ts` uses no try/catch (pure metadata reads that cannot throw). `scanCoords.ts` should follow the same pattern: return `null` on missing data rather than throwing, allowing the caller (`store.ts`) to handle the null gracefully.

---

### `src/reader/scanCoords.test.ts` (test, Reader-POJO mocks)

**Analog:** `src/reader/stats.test.ts`

**File-level fixture import pattern** (`stats.test.ts` lines 1–29):
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openBlob, type Reader } from "./openUrl";
import { manifest } from "./fileMeta";
import { computeStats, computeCapabilities, probeIsImaging } from "./stats";
import type { ManifestEntry } from "./types";

const POINT_FIXTURE = fileURLToPath(
  new URL("../../test/data/small.mzpeak", import.meta.url),
);

async function openFixture(path: string): Promise<Reader> {
  const bytes = await readFile(path);
  return openBlob(new Blob([bytes]));
}
```

**Reader-shaped POJO mock pattern** (`stats.test.ts` lines 144–174):
```typescript
function makeScanMeta(meta: Record<string, unknown>) {
  return {
    scans: [
      {
        meta,
        getParamByAccession: (_acc: string) => undefined,
      },
    ],
  };
}

function makeReader(spectra: ReturnType<typeof makeScanMeta>[], fileIndexMeta?: unknown): Reader {
  return {
    store: {
      fileIndex: {
        metadata: fileIndexMeta ?? {},
      },
    },
    spectrumMetadata: {
      length: spectra.length,
      get: (i: number) => spectra[i],
    },
    _spectrumDataReader: null,
    _spectrumPeaksReader: null,
  } as unknown as Reader;
}
```
For `scanCoords.test.ts`, extend `makeReader` to also accept a mock `scans` Arrow-like object (for the bulk `.getChild()` path). The mock `scans` object needs: `length: number` + `getChild(name: string): { get(i: number): bigint | number | null }`.

**Bigint scan-meta values** (`stats.test.ts` line 178):
```typescript
makeScanMeta({ IMS_1000050_position_x: 1n, IMS_1000051_position_y: 1n })
```
Tests for `scanCoords.ts` use the same `1n` bigint literals for Int64 mock values and plain `number` for UInt32 mock values, verifying both column types (D-15).

**PXD001283 unlock test pattern** (`stats.test.ts` lines 19–20, `fileURLToPath`/`new URL` pattern):
```typescript
const PXD = fileURLToPath(new URL("../../test/data/PXD001283.mzpeak", import.meta.url));
// Usage: test.skipIf(!existsSync(PXD))("validates 260×134 grid", async () => { ... });
```

---

### `src/imaging/types.ts` (model, plain POJO types)

**Analog:** `src/reader/types.ts`

**File header pattern** (`types.ts` lines 1–7):
```typescript
// Plain, UI-facing types for the reader boundary.
//
// CONTRACT: this file is the shared vocabulary for everything ABOVE src/reader/.
// Plans 01-02 and 01-03 (and Phases 2-5) build against these exact shapes.
// Nothing here references apache-arrow, mzpeakts internals, or `bigint` — the
// reader/ folder is the ONLY place that touches the unstable format
```
`src/imaging/types.ts` carries an analogous header:
```typescript
// Plain imaging-layer types. No Arrow, no bigint, no mzpeakts internals.
// CONTRACT: ImagingGrid.width/height/coordToSpectrumIndex/presenceMask are
// the cross-phase contract consumed by Phase 3 (TIC builder).
```

**Named type export pattern** (`types.ts` lines 9–83):
All types are plain `export type { ... }` declarations — no classes, no default export, no runtime code. `src/imaging/types.ts` follows identically.

**Null-as-optional-field pattern** (`types.ts` line 54):
```typescript
export type SpectrumRepresentation = "profile" | "centroid" | null;
```
Used in `ImagingGrid.pixelSizeUm: { x: number; y: number } | null` — same `| null` idiom for absent-but-valid data.

---

### `src/imaging/grid.ts` (service, pure transform)

**Analog:** `src/reader/arrays.ts`

**File header / boundary comment pattern** (`arrays.ts` lines 1–5):
```typescript
// Reconstruct one spectrum's signal as plain typed arrays.
//
// Keeps m/z at float64 precision (PITFALLS 9) and intensity at float32. Returns
// `Float64Array`/`Float32Array` only — no Arrow Vectors leak upward.
import type { Reader } from "./openUrl";
```
`grid.ts` adapts:
```typescript
// Build ImagingGrid from plain {x,y}[] coords and geometry POJO.
//
// Pure TypeScript — no Arrow, no bigint, no mzpeakts imports.
// Cross-phase contract: width/height/coordToSpectrumIndex/presenceMask are
// stable across Phases 2–5 (ARCHITECTURE Pattern 2).
```

**Import pattern** (`arrays.ts` lines 5–6):
```typescript
import type { Reader } from "./openUrl";
import type { SpectrumArrays } from "./types";
```
`grid.ts` imports from its own layer only:
```typescript
import type { ImagingGrid, GridGeometry } from "./types";
```
No import from `src/reader/` (the boundary is one-way: `src/reader/` → `src/imaging/`, never the reverse).

**Named-export pure function pattern** (`arrays.ts` lines 20–63):
```typescript
export async function getSpectrumArrays(
  reader: Reader,
  index: number,
): Promise<SpectrumArrays> {
  // ... pure transformation, no side effects
}
```
`grid.ts` follows:
```typescript
export function buildImagingGrid(
  coords: { x: number; y: number }[],
  geometry: GridGeometry | null,
): ImagingGrid | null {
  // ... pure transformation
}
```

**Explicit null-path pattern** (`arrays.ts` lines 60–63):
```typescript
// No decodable signal arrays — fail loud rather than render silent zeros.
throw new Error(
  `Spectrum ${index} has no reconstructable m/z + intensity arrays`,
);
```
`grid.ts` equivalent for non-imaging: `if (!coords || coords.length === 0) return null;` — return null rather than throw (non-imaging is not an error per D-04).

---

### `src/imaging/grid.test.ts` (test, synthetic grid fixtures)

**Analog:** `src/reader/stats.test.ts` (POJO-mock section, lines 144–242)

**describe block structure** (`stats.test.ts` lines 144–242):
```typescript
describe("probeIsImaging — synthetic imaging / non-imaging mocks (R-02c)", () => {
  function makeScanMeta(...) { ... }
  function makeReader(...): Reader { ... }

  it("returns TRUE when ...", () => { ... });
  it("returns FALSE for ...", () => { ... });
});
```
`grid.test.ts` mirrors:
```typescript
describe("buildImagingGrid — synthetic grids (IMG-02)", () => {
  const DENSE_5x4 = [...];   // 20 {x,y} pairs, x:[1..5], y:[1..4]
  const SPARSE_5x4 = [...];  // 15 pairs (5 missing)

  it("dense 5×4: width=5, height=4, filledCount=20, totalCells=20", () => { ... });
  it("sparse 5×4: filledCount < totalCells, missingCount correct", () => { ... });
  it("non-imaging (empty coords): returns null", () => { ... });
});
```

**PXD001283 unlock test** (`stats.test.ts` `fileURLToPath`/`new URL` pattern):
```typescript
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const PXD = fileURLToPath(new URL("../../test/data/PXD001283.mzpeak", import.meta.url));
const hasPXD = existsSync(PXD);

test.skipIf(!hasPXD)("validates 260×134 grid against PXD001283", async () => {
  // real reader open → extractCoords → readGridGeometry → buildImagingGrid
  // assert: width===260, height===134, filledCount===34840===totalCells
});
```

---

### `src/ui/GridDiagnosticsPanel.tsx` (component, store→render)

**Analog:** `src/ui/CapabilitiesPanel.tsx`

**Imports pattern** (`CapabilitiesPanel.tsx` line 1):
```typescript
import { useStore } from "../state/store";
```
`GridDiagnosticsPanel.tsx` adds `useState`:
```typescript
import { useState } from "react";
import { useStore } from "../state/store";
```

**Early-return guard pattern** (`CapabilitiesPanel.tsx` lines 7–10):
```typescript
export function CapabilitiesPanel() {
  const capabilities = useStore((s) => s.capabilities);
  if (!capabilities) return null;
```
`GridDiagnosticsPanel.tsx`:
```typescript
export function GridDiagnosticsPanel() {
  const grid = useStore((s) => s.grid);
  const capabilities = useStore((s) => s.capabilities);
  const [open, setOpen] = useState(false);
  if (!capabilities) return null;   // same guard — don't render before load completes
```

**Section wrapper pattern** (`CapabilitiesPanel.tsx` lines 14–22):
```typescript
<section
  aria-label="capabilities-panel"
  data-testid="capabilities-panel"
  style={{
    padding: "0.5rem",
    borderTop: "1px solid #eee",
  }}
>
  <h3 style={{ margin: "0 0 0.4rem" }}>Capabilities</h3>
```
Copy exactly, substituting `capabilities-panel` → `grid-panel` and `Capabilities` → `Grid`.

**Table pattern** (`CapabilitiesPanel.tsx` lines 25–31):
```typescript
<table
  data-testid="capabilities-table"
  style={{ fontSize: "0.8rem", borderCollapse: "collapse", width: "100%" }}
>
  <tbody>
```
Copy exactly; substitute `capabilities-table` → `grid-diagnostics-table`.

**Table row pattern** (`CapabilitiesPanel.tsx` lines 32–36):
```typescript
<tr>
  <th
    style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}
  >
    Layout
  </th>
  <td data-testid="cap-layout">{layout}</td>
</tr>
```
All expanded-diagnostics rows follow this exact `<th style=...>Label</th><td data-testid=...>Value</td>` shape.

**Muted grey / conditional colour pattern** (`CapabilitiesPanel.tsx` lines 63–77):
```typescript
{isImaging ? (
  <span
    data-testid="imaging-detected-yes"
    style={{ color: "#1b5e20", fontWeight: 600 }}
  >
    Imaging data detected: yes
  </span>
) : (
  <span
    data-testid="imaging-detected-no"
    style={{ color: "#888" }}
  >
    Imaging data detected: no
  </span>
)}
```
Non-imaging notice copies the `#888` muted path; warning anomaly uses `#8a6d00` (new amber from UI-SPEC — not in Phase 1 palette, but the conditional-span idiom is identical); healthy grid uses `#1b5e20`.

**ul indent pattern** (`CapabilitiesPanel.tsx` lines 45–54):
```typescript
<ul
  style={{ margin: 0, padding: "0 0 0 1rem" }}
>
  {encodings.map((enc) => (
    <li key={enc}>{enc}</li>
  ))}
</ul>
```
Used for the disagreement-notes list under the `Discovery check` row in the expanded diagnostics table.

---

### `src/reader/types.ts` — extend `LoadStage` union

**Analog:** same file, lines 76–82

**Current LoadStage** (`types.ts` lines 76–82):
```typescript
export type LoadStage =
  | "idle"
  | "zip-index"
  | "manifest"
  | "metadata"
  | "ready"
  | "error";
```
**After Phase 2 extension:**
```typescript
export type LoadStage =
  | "idle"
  | "zip-index"
  | "manifest"
  | "metadata"
  | "grid"         // NEW — between metadata and ready (D-05)
  | "ready"
  | "error";
```

---

### `src/state/store.ts` — extend with `grid` field and `'grid'` stage

**Analog:** same file

**State type pattern** (`store.ts` lines 54–64):
```typescript
type State = {
  reader: Reader | null;
  fileMeta: FileMeta | null;
  manifest: ManifestEntry[];
  stats: FileStats | null;
  capabilities: Capabilities | null;
  stage: LoadStage;
  error: StoreError | null;
  selectedIndex: number | null;
  selectedSpectrum: SpectrumArrays | null;
};
```
Add `grid: ImagingGrid | null;` after `capabilities`. The `ImagingGrid` import comes from `"../imaging/types"`.

**initialState pattern** (`store.ts` lines 72–82):
```typescript
const initialState: State = {
  reader: null,
  ...
  capabilities: null,
  stage: "idle",
  ...
};
```
Add `grid: null,` to `initialState`.

**`runLoad` staged-transition pattern** (`store.ts` lines 85–116):
```typescript
set({ stage: "manifest" });
await yieldFrame();
const manifest = readManifest(reader);

set({ stage: "metadata" });
await yieldFrame();
const fileMeta = readFileMeta(reader);
const stats = computeStats(reader, manifest);
const capabilities = computeCapabilities(reader, manifest);

set({
  reader,
  manifest,
  fileMeta,
  stats,
  capabilities,
  stage: "ready",
  error: null,
  selectedIndex: null,
  selectedSpectrum: null,
});
```
Insert the `'grid'` stage block AFTER the `metadata` block, BEFORE the final `set({ ..., stage: "ready" })`:
```typescript
set({ stage: "grid" });
await yieldFrame();
let grid: ImagingGrid | null = null;
if (capabilities.isImaging) {
  const coordResult = extractCoords(reader);       // src/reader/scanCoords.ts
  const geometry = readGridGeometry(reader);        // src/reader/scanCoords.ts
  grid = coordResult ? buildImagingGrid(coordResult.coords, geometry) : null;
}
// Then include grid in the final set() call:
set({ reader, manifest, fileMeta, stats, capabilities, grid, stage: "ready", ... });
```

**`yieldFrame` pattern** (`store.ts` line 32–33):
```typescript
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```
Every new stage transition uses `await yieldFrame()` before computing — copy exactly, do NOT introduce a new `yieldFrame` implementation.

**`loading` flag update in `App.tsx`** (`App.tsx` line 14–16):
```typescript
const loading =
  stage === "zip-index" || stage === "manifest" || stage === "metadata";
```
Must be updated to include `"grid"`:
```typescript
const loading =
  stage === "zip-index" || stage === "manifest" || stage === "metadata" || stage === "grid";
```

---

### `src/ui/App.tsx` — append `GridDiagnosticsPanel`

**Analog:** same file, lines 68–69

**Panel mounting pattern** (`App.tsx` lines 67–70):
```typescript
<MetadataPanel />
<StatsPanel />
<CapabilitiesPanel />
```
Phase 2 extends to:
```typescript
<MetadataPanel />
<StatsPanel />
<CapabilitiesPanel />
<GridDiagnosticsPanel />   {/* NEW — D-03: below CapabilitiesPanel */}
```
Import at top alongside existing panel imports (lines 3–7):
```typescript
import { GridDiagnosticsPanel } from "./GridDiagnosticsPanel";
```

**`stage` sentinel text update** (`App.tsx` lines 34–47):
```typescript
{stage === "zip-index"
  ? "Reading ZIP index…"
  : stage === "manifest"
    ? "Parsing manifest…"
    : stage === "metadata"
      ? "Loading metadata…"
      : stage === "ready"
        ? "Ready"
        : ...}
```
Add `stage === "grid" ? "Building imaging grid…" :` between `metadata` and `ready` arms.

---

## Shared Patterns

### Single Reader Import Boundary
**Source:** `src/reader/stats.ts` line 1–12, `src/reader/arrays.ts` lines 1–6
**Apply to:** `src/reader/scanCoords.ts` ONLY
```typescript
// The ONLY files that may import from mzpeakts or apache-arrow are inside src/reader/.
// Verify after Phase 2: grep -rl "from 'mzpeakts'" src/ must return only src/reader/openUrl.ts
import type { Reader } from "./openUrl";   // opaque handle — no Arrow types exposed
```
`src/imaging/grid.ts` MUST NOT import from `src/reader/` or `mzpeakts`. It receives only plain `{ x: number; y: number }[]`.

### Null-not-throw for Missing Data
**Source:** `src/reader/stats.ts` lines 69–72 (`computeStats` early exit pattern), `src/reader/stats.ts` line 222 (`probeIsImaging` returns `false` rather than throwing when `sm` is null)
**Apply to:** `src/reader/scanCoords.ts`, `src/imaging/grid.ts`
```typescript
// Return null when data is absent; the caller decides whether to error.
const sm = reader.spectrumMetadata;
if (!sm || sm.length === 0) return false;   // or return null
```

### `as Record<string, unknown>` Defensive Cast
**Source:** `src/reader/stats.ts` lines 85–90, 225–228
**Apply to:** `src/reader/scanCoords.ts` (discovery-block reads)
```typescript
const fileIndexMeta = reader.store?.fileIndex?.metadata;
if (fileIndexMeta && typeof fileIndexMeta === "object") {
  const imaging = (fileIndexMeta as Record<string, unknown>)["imaging"];
  if (imaging && typeof imaging === "object") {
    // ... field access
  }
}
```
Never assume the shape of the discovery block — always guard with `typeof === "object"` before casting.

### `yieldFrame` Staged Progress
**Source:** `src/state/store.ts` lines 32–33, 90–99
**Apply to:** `src/state/store.ts` new `'grid'` stage block
```typescript
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
// ...
set({ stage: "grid" });
await yieldFrame();
// ... compute grid ...
```

### `data-testid` + `aria-label` on Every Panel
**Source:** `src/ui/CapabilitiesPanel.tsx` lines 14–22, `src/ui/StatsPanel.tsx` lines 16–24
**Apply to:** `src/ui/GridDiagnosticsPanel.tsx`
```typescript
<section
  aria-label="grid-panel"
  data-testid="grid-panel"
  style={{ padding: "0.5rem", borderTop: "1px solid #eee" }}
>
```
Required `data-testid` hooks (per UI-SPEC): `grid-panel`, `grid-summary-line`, `grid-expand-toggle`, `grid-diagnostics-table`, `grid-not-imaging-notice`, `grid-anomaly-warning`.

### Inline-style Objects (no CSS files, no Tailwind)
**Source:** All existing panels (`CapabilitiesPanel.tsx`, `StatsPanel.tsx`, `App.tsx`)
**Apply to:** `src/ui/GridDiagnosticsPanel.tsx`

Token table (binding, from UI-SPEC):
| Token | Value | Usage |
|-------|-------|-------|
| section-padding | `"0.5rem"` | `<section>` padding |
| panel-separator | `"1px solid #eee"` | `borderTop` |
| heading-margin | `"0 0 0.4rem"` | `<h3>` margin |
| cell-gap | `"0.75rem"` | `<th>` paddingRight |
| list-indent | `"1rem"` | `<ul>` padding-left |
| font-size-body | `"0.8rem"` | table, compact line |
| muted | `"#888"` | non-imaging notice, absent values |
| success-green | `"#1b5e20"` | healthy grid accent |
| warning-amber | `"#8a6d00"` | anomaly indicator (NEW — not in Phase 1) |
| error-red | `"#b71c1c"` | DO NOT USE — reserved for hard errors only |

---

## No Analog Found

All files have close analogs. No entries in this table.

---

## Metadata

**Analog search scope:** `src/reader/`, `src/ui/`, `src/state/`
**Files scanned:** 8 source files read in full
**Pattern extraction date:** 2026-06-03
