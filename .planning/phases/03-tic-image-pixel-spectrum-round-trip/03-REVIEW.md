---
phase: 03-tic-image-pixel-spectrum-round-trip
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - eslint.config.js
  - src/compute/tic.test.ts
  - src/compute/tic.ts
  - src/reader/arrays.test.ts
  - src/reader/arrays.ts
  - src/reader/types.ts
  - src/state/store.test.ts
  - src/state/store.ts
  - src/ui/App.tsx
  - src/ui/ImagingPanel.tsx
  - src/ui/ProgressBar.tsx
  - src/ui/SpectrumPanel.tsx
  - src/ui/rasterize.test.ts
  - src/ui/rasterize.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The Phase 3 implementation covers the TIC-image/pixel-spectrum round-trip across five layers:
`buildTic` (compute), `rasterizeTic` (render), `arrays.ts` (reader boundary), the Zustand store
(orchestration), and `ImagingPanel`/`SpectrumPanel`/`ProgressBar` (UI). The overall architecture
is sound — the bigint boundary conversion, the absent-vs-zero sentinel distinction, and the
representation-routing split between `getSpectrumArrays` / `getSpectrumArraysFor` are all
implemented correctly.

Three issues deserve immediate attention before shipping:

1. **BLOCKER** — `selectSpectrum` routes any spectrum-read failure to `stage: "error"`, which
   completely wipes the loaded TIC image, grid, and metadata. A single bad pixel click on an
   imaging file forces the user to reload the whole file.

2. **WARNING** — `percentile99` in `rasterize.ts` uses `Math.floor(0.99 * (length - 1))`,
   which is systematically lower than the 99th percentile for small arrays (e.g., for 3 cells it
   returns the 50th-percentile element). The tests pass coincidentally because the clamping in
   `rasterizeTic` absorbs the error for any raw value above the lower clip ceiling.

3. **WARNING** — The store unconditionally emits `stage: "grid"` before checking `isImaging`,
   causing a non-imaging file to display "Building imaging grid…" in the ProgressBar during a
   frame where no grid work is being done.

---

## Critical Issues

### CR-01: `selectSpectrum` error handler destroys the entire loaded state

**File:** `src/state/store.ts:253`
**Issue:** When `spectrumMeta` or `getSpectrumArraysFor` throws inside `selectSpectrum` — e.g.,
because the user typed a valid-looking index that the reader rejects, or because a pixel click
triggers a transient read error — the catch block calls
`set({ stage: "error", error: classifyError(err) })`. This is a partial-state update. The store's
`reader`, `grid`, `tic`, `manifest`, and all loaded metadata are left as-is from the preceding
`runLoad` commit, so those fields retain their values — but the `stage` flips to `"error"`.
App.tsx renders `<ErrorBanner>` only when `stage === "error" && error`, and renders `<main>` only
when `stage === "ready"`. The net result: the entire imaging canvas, the spectrum panel, and all
metadata panels disappear and are replaced by the error banner. The user must reload the file to
recover. A transient or user-caused spectrum-read error should not destroy the session.

**Fix:** Introduce a per-selection error field (e.g., `selectionError: string | null`) that is
set without touching `stage`, then surface it locally in `SpectrumPanel`. The store action should
remain non-destructive:

```typescript
// In State, add:
selectionError: string | null;

// In selectSpectrum catch block, replace:
set({ stage: "error", error: classifyError(err) });
// with:
set({
  selectionError:
    err instanceof Error ? err.message : String(err),
  selectedIndex: null,
  selectedSpectrum: null,
});
```

---

## Warnings

### WR-01: `percentile99` formula returns below the 99th percentile for small arrays

**File:** `src/ui/rasterize.ts:72`
**Issue:** The index formula `Math.floor(0.99 * (present.length - 1))` systematically
under-reaches the 99th percentile when `present.length` is small. For `n = 2` it returns element
index 0 (the minimum, effectively the 0th percentile). For `n = 3` it returns index 1 (the
median, ~50th percentile). The function is named `percentile99` and is documented as the "99th
percentile clip ceiling", but the implementation does not satisfy that contract at small array
sizes. Tests in `rasterize.test.ts` do not catch this because the clamping step
(`Math.min(raw / clipMax, 1)`) absorbs the mismatch: any value above the under-estimated clip
ceiling just normalizes to 1.0 and maps to the LUT top, producing a visually plausible result.
For real imaging datasets (e.g., PXD001283 with 34,840 pixels) the formula is approximately
correct. The risk is that the function's contract is not met and future callers or tests relying
on a true 99th-percentile ceiling will be surprised.

**Fix:** Use the nearest-rank definition:
```typescript
// Replace line 72:
const idx = Math.min(present.length - 1, Math.floor(0.99 * (present.length - 1)));
// with:
const idx = Math.min(present.length - 1, Math.ceil(0.99 * present.length) - 1);
```
Verification for the affected sizes: `n=2` → index 1 (100th pct, i.e. max), `n=3` → index 2
(100th pct, i.e. max), `n=100` → index 98 (99th pct, unchanged).

### WR-02: `stage: "grid"` emitted unconditionally for non-imaging files

**File:** `src/state/store.ts:118`
**Issue:** `runLoad` calls `set({ stage: "grid" })` and then `await yieldFrame()` unconditionally,
before checking `if (capabilities.isImaging)`. For a non-imaging file, the ProgressBar will
briefly display "Building imaging grid…" during a frame where no grid work is being done. The
`store.test.ts` test that verifies the non-imaging stage sequence (line 130) masks this by
filtering the `seen` array to only four expected stages — "grid" is in `seen` but excluded from
the assertion, so the test passes despite the spurious emission.

**Fix:** Guard the `grid` stage emission behind the imaging check:

```typescript
// Replace the unconditional block (lines 118-119):
set({ stage: "grid" });
await yieldFrame();
let grid: ImagingGrid | null = null;
if (capabilities.isImaging) {

// With:
let grid: ImagingGrid | null = null;
if (capabilities.isImaging) {
  set({ stage: "grid" });
  await yieldFrame();
```

Then update `store.test.ts` line 141–143 to assert the full unfiltered stage sequence for the
non-imaging case, removing the `filter()` call so the regression would be caught in the future.

### WR-03: `ImagingPanel` calls `rasterizeTic` twice on initial TIC load

**File:** `src/ui/ImagingPanel.tsx:83–122`
**Issue:** Two `useEffect` hooks both call `rasterizeTic(tic, grid)` — the paint pass (deps:
`[tic, grid]`) and the selection-ring pass (deps: `[selectedIndex, tic, grid]`). When the TIC
first arrives, both effects fire in the same React commit because all three dependencies
(`tic`, `grid`, `selectedIndex`) are freshly set. `rasterizeTic` is pure and deterministic, but
it allocates a new `Uint8ClampedArray` and iterates over every pixel on each call. For large
imaging datasets this is a redundant O(n) computation every time `tic` or `grid` changes.

**Fix:** Memoize the RGBA output so it is computed once per `[tic, grid]` pair:

```typescript
// After the store subscriptions (before the two useEffects):
const rgba = useMemo(
  () => (tic && grid ? rasterizeTic(tic, grid) : null),
  [tic, grid],
);

// In the paint-pass useEffect, replace the rasterizeTic call with:
if (!rgba) return;
const img = new ImageData(grid.width, grid.height);
img.data.set(rgba);
ctx.putImageData(img, 0, 0);

// Similarly in the selection-ring pass.
```

### WR-04: `selectSpectrum` in store test does not assert representation routing

**File:** `src/state/store.test.ts:63–71`
**Issue:** The mock for `getSpectrumArraysFor` is set up as:
```typescript
vi.mock("../reader/arrays", () => ({
  getSpectrumArraysFor: vi.fn(
    async (_reader, index, _representation) => ({ ... })
  ),
}));
```
The `_representation` parameter is discarded without inspection. The test at line 151
(`expect(state.selectedSpectrum?.mz).toBeInstanceOf(Float64Array)`) verifies the return value
but never asserts that `getSpectrumArraysFor` was called with the correct representation (e.g.
`"profile"`). If `selectSpectrum` were changed to always pass `null` for representation, all
store tests would still pass. The DATA-03 representation-routing invariant is only tested in
`arrays.test.ts`, not in the integration path through the store.

**Fix:** Add an assertion in the store test that the mock was called with the expected
representation:

```typescript
import { getSpectrumArraysFor } from "../reader/arrays";
// ...after openUrl/openFile completes:
expect(getSpectrumArraysFor).toHaveBeenCalledWith(
  expect.anything(),
  0,
  "profile", // expected from the spectrumMeta mock which returns representation: "profile"
);
```

---

## Info

### IN-01: `ProgressBar` renders with all steps dimmed when `stage === "error"`

**File:** `src/ui/ProgressBar.tsx:44,62–77`
**Issue:** `STAGES.indexOf("error")` returns `-1` because `"error"` is not in the `STAGES`
array. This makes `currentIndex = -1`, so `done = (-1 > i) = false` for all steps and
`active = (s === "error") = false` for all steps in the loop. When the load fails, the
ProgressBar renders all steps at `opacity: 0.4` (the inactive style) with no visual marker
indicating how far the load progressed before the error occurred. The red background
(`isError ? "#fdecea"`) distinguishes the error state, and `ErrorBanner` provides context, but
the step display offers no diagnostic value.

**Fix:** Preserve `currentIndex` at the last known progress point. One approach: track the last
non-error stage in a ref, or map `"error"` to the last element in `STAGES` for display purposes:
```typescript
const displayIndex =
  stage === "error"
    ? STAGES.length - 1  // show all steps as 'done' up to ready
    : STAGES.indexOf(stage as (typeof STAGES)[number]);
```
This is a minor UX polish item.

### IN-02: `SpectrumPanel` index label is misleading when `numSpectra === 0`

**File:** `src/ui/SpectrumPanel.tsx:127`
**Issue:** When `numSpectra === 0`, the label renders as `"Spectrum index (0–0):"` and the input
has `min={0}` and `max={0}`. The `onChange` guard `v >= 0 && v < numSpectra` (i.e. `v < 0`)
correctly prevents any `selectSpectrum` call, so the input is functionally inert. However, the
`"0–0"` range label implies spectrum 0 is valid when no spectra exist. A file with `numSpectra =
0` is arguably a degenerate or corrupt file, but the UI should handle it gracefully.

**Fix:**
```typescript
// Wrap the numeric input section in a conditional:
{numSpectra > 0 ? (
  <div style={{ marginBottom: "0.5rem" }}>
    <label htmlFor="spectrum-index">
      Spectrum index (0–{numSpectra - 1}):{" "}
    </label>
    <input ... />
  </div>
) : (
  <div style={{ color: "#888" }}>No spectra in this file.</div>
)}
```

---

_Reviewed: 2026-06-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
