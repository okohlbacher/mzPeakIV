# Phase 3: TIC Image + Pixel→Spectrum Round-Trip - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/compute/tic.ts` | new | compute (pure transform) | batch / transform | `src/imaging/grid.ts` | exact (pure POJO transform above reader boundary) |
| `src/compute/tic.test.ts` | new | test | batch / transform | `src/imaging/grid.test.ts` | exact (synthetic-fixture pure-transform test) |
| `src/ui/ImagingPanel.tsx` | new | component (Canvas 2D) | event-driven (hover/click) + render | `src/ui/SpectrumPanel.tsx` | role-match (imperative canvas mount via useRef, store-wired) |
| `src/ui/rasterize.ts` (optional) | new | render utility (pure) | transform | `src/imaging/grid.ts` | role-match (pure typed-array transform, unit-testable) |
| `src/state/store.ts` | modified | store (staged load) | event-driven | itself (existing `'grid'` stage) | exact (extend in place) |
| `src/reader/arrays.ts` | modified | reader (signal read) | request-response | itself (existing `getSpectrumArrays`) | exact (add representation-routed variant) |
| `src/reader/types.ts` | modified | types | — | itself (`LoadStage`) | exact (add `"tic"` union member) |
| `src/ui/App.tsx` | modified | layout | — | itself | exact (extend `ready` block) |
| `src/ui/SpectrumPanel.tsx` | modified | component | event-driven | itself | exact (heading update; keep index input) |

## Pattern Assignments

### `src/compute/tic.ts` (compute, pure transform) — NEW

**Analog:** `src/imaging/grid.ts` — the established "pure transform above the reader boundary" module. Same architectural rule: a named pure export, imports ONLY plain types, NEVER touches Arrow / bigint / mzpeakts. `src/compute/` is a new sibling layer to `src/imaging/` with the identical boundary contract.

**Module-header + boundary-rule pattern** (`src/imaging/grid.ts` lines 1-12):
```typescript
// buildImagingGrid — the pure geometry + presence + diagnostics transform (IMG-02, IMG-03).
//
// Mirrors src/reader/arrays.ts: a named pure export, no side effects (beyond one
// console.warn on the DoS cap), importing ONLY from ./types. It NEVER touches Arrow,
// bigint, or mzpeakts — it receives plain `{x,y}[]` coords from the reader boundary
// (02-CONTEXT D-08). The boundary is one-way: imaging/ does not import reader/.
import type { ImagingGrid, ... } from "./types";
```
Copy this header convention verbatim for `tic.ts`: state the function, state that it is pure, state the boundary rule (no Arrow/bigint), cite the CONTEXT decision (D-03).

**Pure-function signature + dense-allocation pattern** (`src/imaging/grid.ts` lines 37-47, 86-87):
```typescript
export function buildImagingGrid(
  coords: Coord[],
  spectrumIndices: number[],
  geometry: GridGeometry | null,
  coordSourceStrategy: CoordSourceStrategy,
): ImagingGrid | null {
  ...
  const coordToSpectrumIndex = new Map<number, number>();
  const presenceMask = new Uint8Array(totalCells);
```
`buildTic` mirrors this: `export function buildTic(xic: XIC, grid: ImagingGrid): Float32Array`, allocate `new Float32Array(grid.width * grid.height)` (absent + zero both start at 0, then rendered distinctly via presenceMask — D-09).

**bigint→number boundary conversion** — `grid.ts` floors plain numbers; the analogous bigint guard lives in `src/reader/scanCoords.ts:60` (`toCoordNumber`). In `buildTic` the FIRST op per point must be `const sIdx = Number(point.index)` (RESEARCH Pitfall 1). The grid key formula is OWNED by `grid.ts:116` — do NOT recompute, invert the existing map:
```typescript
// grid.ts:116 — the authoritative key. buildTic must REUSE, not re-derive (no flip — C2).
const key = y0 * width + x0; // row-major: row=y, col=x
```
Reverse-map build (RESEARCH Pattern 2): `for (const [key, sIdx] of grid.coordToSpectrumIndex) idxToKey.set(sIdx, key);`

**Intensity column key** — reuse the exact constant from `src/reader/arrays.ts:9-10`:
```typescript
const INTENSITY_KEY = "intensity array";
```
(`XICPoint.dataArrays` uses the same human-readable CV name — RESEARCH Assumption A1.)

---

### `src/compute/tic.test.ts` (test, pure transform) — NEW

**Analog:** `src/imaging/grid.test.ts` — synthetic-fixture pure-transform suite. NO reader mock, NO binary fixture (RESEARCH Pitfall 3: no imaging fixture exists in `test/data/`).

**Header + synthetic-fixture-builder pattern** (`grid.test.ts` lines 1-38):
```typescript
import { describe, it, test, expect } from "vitest";
import { buildImagingGrid } from "./grid";
import type { GridGeometry } from "./types";

/** Build a dense w×h coord set (1-based) row-major, returning coords + parallel indices. */
function denseCoords(w: number, h: number, base = 1): { coords: Coord[]; spectrumIndices: number[] } {
  const coords: Coord[] = [];
  const spectrumIndices: number[] = [];
  let idx = 0;
  for (let y = base; y < base + h; y++)
    for (let x = base; x < base + w; x++) { coords.push({ x, y }); spectrumIndices.push(idx++); }
  return { coords, spectrumIndices };
}
```
For `tic.test.ts`: build a tiny `ImagingGrid` (e.g. 3×2 with one absent pixel) + a hand-built `XIC` whose `points[].dataArrays["intensity array"]` are known arrays; assert `buildTic` sums correctly, scatters to the right key, skips off-grid spectrum indices, and leaves absent pixels at 0. Mirror the `describe`/`it` naming with the `(Test N)` suffix and the plan-binding comment style.

---

### `src/ui/ImagingPanel.tsx` (component, Canvas 2D) — NEW

**Analog:** `src/ui/SpectrumPanel.tsx` — the established imperative-canvas-via-useRef + store-wired panel. uPlot there becomes Canvas 2D here, but the React skeleton is identical.

**useRef mount + store-selector pattern** (`SpectrumPanel.tsx` lines 1-26):
```typescript
import { useEffect, useRef } from "react";
import { useStore } from "../state/store";

export function SpectrumPanel() {
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectSpectrum = useStore((s) => s.selectSpectrum);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
```
ImagingPanel selects `grid`, `tic`, `selectedIndex`, `selectSpectrum`; holds a `canvasRef = useRef<HTMLCanvasElement>(null)`.

**Two-`useEffect` mount-then-feed pattern** (`SpectrumPanel.tsx` lines 24-78): one `useEffect([], [])` to create the instance + resize listener + cleanup; a second `useEffect([selectedSpectrum])` to push new data. For ImagingPanel: first effect creates `ImageData` and `putImageData`s the TIC raster (1st pass) when `tic`/`grid` change; second effect (or same, keyed on `selectedIndex`) re-rasterizes then `strokeRect`s the ring (2nd pass — RESEARCH Pattern 3, because `putImageData` ignores transform/composite and overwrites a ring drawn first).

**Hover + click hit-test** (RESEARCH "Code Examples — Hover + click", resolution/aspect-safe per Pitfall 5):
```typescript
function toGridCoord(e: React.MouseEvent, canvas: HTMLCanvasElement, grid: ImagingGrid) {
  const rect = canvas.getBoundingClientRect();
  const x0 = Math.floor(((e.clientX - rect.left) / rect.width)  * grid.width);
  const y0 = Math.floor(((e.clientY - rect.top)  / rect.height) * grid.height);
  if (x0 < 0 || x0 >= grid.width || y0 < 0 || y0 >= grid.height) return null;
  return { x0, y0, key: y0 * grid.width + x0 };
}
```
onClick: guard `grid.presenceMask[hit.key]` then `const idx = grid.coordToSpectrumIndex.get(hit.key); if (idx != null) void selectSpectrum(idx);` (reuses store action unchanged — D-04).
onMouseMove: `useState`-tracked label `x: ${x0 + grid.coordinateBase}, y: ${y0 + grid.coordinateBase}, TIC: ${tic[key]}` (1-based display — add `coordinateBase`, C3). Clear label on `onMouseLeave`.

**`data-testid` + `aria-label` + inline-style convention** (`SpectrumPanel.tsx` lines 80-110): `<section aria-label="imaging-panel" data-testid="imaging-panel">`, `<canvas data-testid="tic-canvas">`, hover label `data-testid="tic-hover-readout"`. Follow the same inline-style + flex layout as SpectrumPanel's `<section>`.

---

### `src/ui/rasterize.ts` (render utility, pure) — NEW (optional but recommended)

**Analog:** `src/imaging/grid.ts` — pure typed-array transform with finite/bounds guards. Extract colormap + 99th-percentile clip + sparse sentinel out of the component so it is unit-testable without a DOM (RESEARCH Pitfall 4).

**Sparse-sentinel + clamp pattern** (RESEARCH Pattern 3, with `grid.ts` finite-guard discipline):
```typescript
const clipMax = percentile(tic, 0.99, grid.presenceMask); // ignore absent cells
for (let k = 0; k < grid.width * grid.height; k++) {
  const base = k * 4;
  if (grid.presenceMask[k] === 0) {            // D-09: absent ≠ zero-intensity
    img.data[base]=0x1a; img.data[base+1]=0x1a; img.data[base+2]=0x1a; img.data[base+3]=255;
    continue;
  }
  const norm = clipMax > 0 ? Math.min(tic[k] / clipMax, 1) : 0;  // clamp [0,1] (V5 / non-finite guard)
  const [r,g,b] = colormap(norm);
  img.data[base]=r; img.data[base+1]=g; img.data[base+2]=b; img.data[base+3]=255;
}
```
Carry over `grid.ts`'s `Number.isFinite` discipline: treat a non-finite sum as 0 (Security V5).

---

### `src/state/store.ts` (store, staged load) — MODIFIED

**Analog:** itself — the existing eager `'grid'` stage is the template for the new `'tic'` stage.

**Staged-transition pattern to mirror** (`store.ts` lines 108-141):
```typescript
set({ stage: "grid" });
await yieldFrame();
let grid: ImagingGrid | null = null;
if (capabilities.isImaging) {
  const cr = extractCoords(reader);
  const geometry = readGridGeometry(reader);
  grid = cr ? buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy) : null;
  if (grid === null) { set({ ...stage: "error", error: {...} }); return; }
}
```
Insert a `'tic'` block AFTER this, BEFORE the final `set({...stage:"ready"})` (RESEARCH "Insert the 'tic' stage"):
```typescript
let tic: Float32Array | null = null;
if (grid) {
  set({ stage: "tic" });
  await yieldFrame();
  const { profile, centroid } = stats.representationCounts;        // D-08
  const useProfile = centroid > 0 && profile === 0 ? false : true; // majority/profile-default
  const mixed = profile > 0 && centroid > 0;                       // surface named warning if so
  const xic = await reader.extractXIC(null, null, useProfile);
  tic = xic ? buildTic(xic, grid) : null;
}
```
Add `tic` to the final `set({...})` (line 143-154 shape) and to `initialState` (line 76-87) as `tic: null`. Add new imports `import { buildTic } from "../compute/tic"`.

**Add `tic` to `State` type** (`store.ts` lines 57-68): `grid: ImagingGrid | null;` → add `tic: Float32Array | null;` directly below.

**`selectSpectrum` DATA-03 routing** (`store.ts` lines 187-196): extend to look up representation first (RESEARCH "Wire DATA-03 routing"):
```typescript
async selectSpectrum(index: number) {
  const reader = get().reader; if (!reader) return;
  try {
    const meta = spectrumMeta(reader, index);                  // fileMeta.ts:89
    const selectedSpectrum = await getSpectrumArraysFor(reader, index, meta.representation);
    set({ selectedIndex: index, selectedSpectrum });
  } catch (err) { set({ stage: "error", error: classifyError(err) }); }
}
```
Add imports `spectrumMeta` (from `../reader/fileMeta`) and `getSpectrumArraysFor` (from `../reader/arrays`). Note: `selectSpectrum` is async and reused by both the index input AND pixel-click — no duplication.

---

### `src/reader/arrays.ts` (reader, signal read) — MODIFIED

**Analog:** itself — `getSpectrumArrays` (lines 20-63). KEEP it for callers without a representation (the numeric index input on non-imaging files). ADD an explicit-representation sibling (RESEARCH Pattern 4 / D-07).

**Existing dual-source pattern to refactor from** (`arrays.ts` lines 30-57):
```typescript
const da = spectrum.dataArrays;
if (da && da[MZ_KEY] && da[INTENSITY_KEY]) { /* profile/point → fromDataArrays */ }
// Centroid fallback (spectra_peaks).
const centroids = spectrum.centroids;
if (centroids && centroids.length > 0) { /* fromCentroids */ }
throw new Error(`Spectrum ${index} has no reconstructable m/z + intensity arrays`);
```
New explicit variant selects source by representation (NOT try-order):
```typescript
export async function getSpectrumArraysFor(
  reader: Reader, index: number, representation: SpectrumRepresentation,
): Promise<SpectrumArrays> {
  const spectrum = await reader.getSpectrum(index);
  if (!spectrum) throw new Error(`No spectrum at index ${index}`);
  if (representation === "centroid") return fromCentroids(spectrum, index);  // MUST be spectra_peaks
  return fromDataArrays(spectrum, index);                                     // profile / null → spectra_data
}
```
Extract the two existing branches into `fromDataArrays` / `fromCentroids` private helpers and have BOTH exports call them (DRY). Keep the existing fail-loud `throw` (line 60) — for the centroid route, throw a named error if the routed file has no rows (Pitfall 7). Add `SpectrumRepresentation` to the type import.

> **Planner action (RESEARCH A2):** D-07 here is the pragmatic "select array source by representation" interpretation, NOT exclusive file-level handle routing. Confirm in Codex round1.

**Test extension** — `src/reader/arrays.test.ts` (lines 14-33) uses real `.mzpeak` fixtures via `openBlob`. For DATA-03 routing add a MOCK-reader unit test (a fake `getSpectrum` returning both `dataArrays` and `centroids`) asserting `representation` selects the correct source — the existing fixtures are non-imaging and won't exercise the branch deterministically.

---

### `src/reader/types.ts` (types) — MODIFIED

**Analog:** itself — `LoadStage` union (lines 76-83). Add `"tic"` between `"grid"` and `"ready"`:
```typescript
export type LoadStage =
  | "idle" | "zip-index" | "manifest" | "metadata" | "grid" | "tic" | "ready" | "error";
```
`SpectrumRepresentation` (line 54) and `FileStats.representationCounts` (line 35) already exist — consumed unchanged by D-07/D-08. No type additions beyond `"tic"`.

---

### `src/ui/App.tsx` (layout) — MODIFIED

**Analog:** itself — the `stage === "ready"` block (lines 60-82) and the `loading` derivation (lines 15-19).

**Add `"tic"` to loading + stage sentinel** (lines 15-19, 40-53): include `stage === "tic"` in `loading`, and add a `"Building TIC image…"` branch to the hidden `data-testid="stage"` sentinel (mirror the existing `"grid"` → `"Building imaging grid…"` ternary arm).

**Conditional ImagingPanel render** (lines 60-82): in the `ready` `<main>`, when `grid !== null` render `<ImagingPanel />` alongside `<SpectrumPanel />`; when `grid === null` (non-imaging) keep the current right-side `<SpectrumPanel />` unchanged (D from CONTEXT integration points). Select `grid` via `useStore((s) => s.grid)`.

---

### `src/ui/SpectrumPanel.tsx` (component) — MODIFIED

**Analog:** itself. KEEP the numeric index input (lines 86-109) as secondary UX (D-04). Only change: extend the `<h2>`/heading (line 85) to read "Pixel (x, y)" when a pixel is selected in imaging mode. No uPlot duplication — pixel-click already routes through the same `selectSpectrum` store action that feeds this panel's `selectedSpectrum` effect (lines 66-78).

## Shared Patterns

### Reader boundary (no Arrow / bigint upward)
**Source:** `src/imaging/types.ts` lines 1-8, `src/reader/types.ts` lines 1-7, `src/reader/scanCoords.ts:60` (`toCoordNumber`)
**Apply to:** `src/compute/tic.ts`, `src/ui/rasterize.ts`
`src/compute/` is a NEW layer with the SAME one-way boundary as `src/imaging/`: it imports only plain types, never mzpeakts/Arrow. `XICPoint.index` is `bigint` — convert with `Number()` as the first op (Pitfall 1).
```typescript
// Boundary header to replicate (imaging/types.ts:1-8):
// Nothing here references apache-arrow, mzpeakts internals, or `bigint`: this layer
// sits ABOVE the reader boundary and receives only plain numbers.
```

### Store-centric staged load
**Source:** `src/state/store.ts` lines 89-160 (`runLoad`, `yieldFrame`)
**Apply to:** the new `'tic'` stage
Every stage: `set({ stage: "tic" })` at entry → `await yieldFrame()` → compute → include result in the final `set({...stage:"ready"})`, or `set({ stage: "error", error: classifyError(err) })` on failure.
```typescript
const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0)); // store.ts:35
```

### Imperative Canvas/uPlot mount via useRef
**Source:** `src/ui/SpectrumPanel.tsx` lines 18-63
**Apply to:** `src/ui/ImagingPanel.tsx`
`useRef` for the DOM node, `useEffect([], [])` to create + add resize listener + cleanup, second `useEffect([dep])` to feed data. No React wrapper lib.

### Collapsible diagnostics panel (for the mixed-representation D-08 warning)
**Source:** `src/ui/GridDiagnosticsPanel.tsx` lines 33-112 (summary line `role="button"` + `aria-expanded` + Enter/Space keydown + `useState(expanded)`)
**Apply to:** any "mixed profile/centroid" warning surface (D-08). Reuse the `WARNING = "#8a6d00"` amber + `⚠` glyph + `data-testid` convention.

### Authoritative grid key — never re-derive (C2 orientation)
**Source:** `src/imaging/grid.ts:116` (`key = y0 * width + x0`), `src/imaging/types.ts:44-47`
**Apply to:** `buildTic` (reverse-map), ImagingPanel hit-test
Reuse `grid.coordToSpectrumIndex` (key `y0*width+x0`, 0-based). Any transpose/flip is a correctness bug (C2 MANDATORY — RESEARCH Anti-Patterns).

## No Analog Found

None. Every Phase 3 file maps to an existing analog. The only genuinely novel surface is Canvas-2D `ImageData`/`putImageData` rasterization + `strokeRect` — but RESEARCH Pattern 3 and CLAUDE.md provide the concrete pattern, and no existing component uses Canvas (SpectrumPanel uses uPlot's canvas internally, supplying the useRef-mount skeleton).

| File | Role | Data Flow | Reason analog is partial |
|------|------|-----------|--------------------------|
| `src/ui/ImagingPanel.tsx` (rasterize logic) | render | transform | First Canvas-2D `putImageData` use in the codebase; React skeleton from SpectrumPanel, raster pattern from RESEARCH Pattern 3 / CLAUDE.md. |

## Metadata

**Analog search scope:** `src/imaging/`, `src/reader/`, `src/state/`, `src/ui/`, `vendor/mzpeakts/lib/src/reader.ts` (XICPoint / extractXIC signatures)
**Files scanned:** 13 (grid.ts, types.ts ×2, SpectrumPanel.tsx, store.ts, arrays.ts, arrays.test.ts, App.tsx, GridDiagnosticsPanel.tsx, fileMeta.ts, grid.test.ts, vendor reader.ts)
**Pattern extraction date:** 2026-06-03
