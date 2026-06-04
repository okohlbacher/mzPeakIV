---
phase: 04-ion-image-intensity-scaling
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/compute/ionImage.ts
  - src/compute/ionImage.test.ts
  - src/ui/rasterize.ts
  - src/ui/rasterize.test.ts
  - src/state/store.ts
  - src/ui/SpectrumPanel.tsx
  - src/ui/ImagingPanel.tsx
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Seven files covering the ion-image aggregation layer (`buildIonImage`, `computeIonImageStats`, `ppmToDa`), the generalized rasterizer (`rasterizeImage`, `rasterizeTic`, colormap LUTs), the Zustand store extensions (`renderIonImage`, `setColormapSettings`), and the two UI panels were reviewed.

The core round-trip — XIC extraction, intensity aggregation, percentile clip, colormap mapping, canvas blit — is structurally correct. Boundary discipline is well observed: `bigint` index conversion happens first, `presenceMask` exclusion is consistent, absent-cell sentinel is never confused with zero-intensity, and the orientation invariant (C2, no flip) is not violated. Input validation at both the UI layer and the store action is layered correctly.

One critical defect was found in the inferno colormap LUT. Three warnings concern a UI inconsistency when `extractXIC` returns null, a surprising percentile degradation at small grid sizes, and an unnecessary store subscription that causes redundant re-renders.

## Critical Issues

### CR-01: Inferno LUT stop[7] duplicates stop[8] — flat top 12.5% of dynamic range

**File:** `src/ui/rasterize.ts:64-68`

**Issue:** The `INFERNO_STOPS` table at indices 7 and 8 (the 0.875 and 1.000 stops) are identical — both set to `[252, 255, 164]` (pale yellow). The matplotlib inferno palette at `t=0.875` is approximately `[249, 201, 52]` (gold/amber), not pale yellow. Because the LUT interpolates between consecutive stop pairs, the entire segment from `norm=0.875` to `norm=1.0` maps to the same color. Any pixel whose normalized intensity falls in the top 12.5% of the color range (after percentile clip) renders as the same pale yellow as the absolute maximum. High-intensity structure within that band is invisible.

The comment on line 57 already flags this table as `[ASSUMED]`, confirming the values were not verified against the reference palette. The monotonic-luminance test in `rasterize.test.ts:288-289` passes only because it samples at `0`, `0.5`, and `1.0` — it does not sample `0.875`, so the flat segment goes undetected.

**Fix:**
Replace the duplicated stop[7] with the correct matplotlib inferno value at `t=0.875`:

```typescript
const INFERNO_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 4],       // 0.000
  [40, 11, 84],    // 0.125
  [101, 21, 110],  // 0.250
  [159, 42, 99],   // 0.375
  [212, 72, 66],   // 0.500
  [245, 125, 21],  // 0.625
  [250, 193, 39],  // 0.750
  [249, 201, 52],  // 0.875  gold/amber — NOT [252,255,164]
  [252, 255, 164], // 1.000  pale yellow (top)
];
```

Also extend the monotonic-luminance test to cover `0.875`:

```typescript
expect(lum(0.75)).toBeLessThan(lum(0.875));
expect(lum(0.875)).toBeLessThan(lum(1.0));
```

## Warnings

### WR-01: `renderIonImage` sets `mzWindow` even when `extractXIC` returns null, leaving the UI in an inconsistent state

**File:** `src/state/store.ts:292-295`

**Issue:** When `extractXIC` returns `null`, the action sets `ionImage: null, ionImageStats: null` but still sets `mzWindow: { mz, tolDa }`. The `SpectrumPanel` uses `mzWindow` to draw an amber band over `[mz - tolDa, mz + tolDa]`, and that band will appear even though no ion-image canvas is rendered (because `ionImage === null` suppresses the canvas section). A researcher sees a spectrum band highlighting an m/z window but no corresponding ion image — with no explanation for why the ion image is absent.

**Fix:** Either clear `mzWindow` when `xic` is null, or emit a surfaced warning to the UI:

```typescript
// Option A — clear mzWindow on null XIC:
const ionImage = xic ? buildIonImage(xic, grid) : null;
const ionImageStats = ionImage ? computeIonImageStats(ionImage, grid) : null;
set({
  ionImage,
  ionImageStats,
  mzWindow: ionImage ? { mz, tolDa } : null,
});
```

If the band is intentionally shown regardless (to preserve the window state), add a UI note below the TIC canvas when `mzWindow !== null && ionImage === null` explaining that no signal was found in the window.

---

### WR-02: `percentileClip` formula produces incorrect percentile rank for small `n`

**File:** `src/ui/rasterize.ts:127`

**Issue:** The index formula `Math.floor(p * (present.length - 1))` is a correct "nearest rank" implementation when `n` is large, but it degrades unexpectedly at small grid sizes. For `n=2` and `p=0.99`: `floor(0.99 * 1) = 0`, so the clip ceiling is the **minimum** present value, not the 99th percentile. Every cell then normalizes to `value / min` which is `≥ 1.0` and gets clamped — both cells render at colormap maximum, washing out any contrast. This affects any grid where the number of present cells is fewer than `1 / (1 - p)` (roughly: fewer than 100 cells for `p=0.99`).

This behavior is undocumented and surprising to users who select "99th percentile" to preserve outliers but instead see a fully saturated image.

**Fix:** Use the standard nearest-rank formula that avoids the degeneracy at small `n`:

```typescript
// Replace line 127:
const idx = Math.min(
  present.length - 1,
  Math.max(0, Math.ceil(p * present.length) - 1),
);
```

This gives: `n=2, p=0.99` → `ceil(0.99*2)-1 = ceil(1.98)-1 = 2-1 = 1` → picks the higher value (correct 99th percentile). Also add a regression test covering `n=2` and `p=0.99`.

---

### WR-03: `ImagingPanel` subscribes to `mzWindow` from the store but never uses it, causing extra re-renders

**File:** `src/ui/ImagingPanel.tsx:82,89-91`

**Issue:**

```typescript
const mzWindow = useStore((s) => s.mzWindow);
// ...
void mzWindow;  // "suppress unused warning"
```

`renderIonImage` atomically sets `{ ionImage, ionImageStats, mzWindow }` in a single `set()` call. The `ImagingPanel` already re-renders when `ionImage` changes (subscribed on line 80). The additional `mzWindow` subscription causes a second re-render of the same component with no visual change on that render pass, because no JSX in `ImagingPanel` reads `mzWindow`. The comment says "re-renders are consistent when the window changes," but this is redundant — the `ionImage` subscription already guarantees consistency.

**Fix:** Remove the `mzWindow` subscription from `ImagingPanel`. The amber band is drawn in `SpectrumPanel`, which correctly subscribes to `mzWindow` (line 18 of `SpectrumPanel.tsx`).

```typescript
// Remove these two lines from ImagingPanel:
const mzWindow = useStore((s) => s.mzWindow);
void mzWindow;
```

## Info

### IN-01: Test `XicLike` type is narrower than production `XicPointLike`, requiring `as never` casts to compile

**File:** `src/compute/ionImage.test.ts:56-58, 108, 120, 131, 148, 160, 175, 185`

**Issue:** The local `XicLike` type in the test file omits `ArrayLike<string>` from the `dataArrays` union (production type includes it for mis-typed column tolerance). Every `makeXic(per) as never` cast silences TypeScript's structural type error rather than fixing the type mismatch. If the production `XicPointLike` interface changes (e.g., adding a new union member to `dataArrays`), the type system will not catch incompatible test fixtures — the cast swallows the error.

**Fix:** Align the test `XicLike` type with the production interface:

```typescript
type XicLike = {
  points: {
    index: bigint | number;
    dataArrays: Record<string, ArrayLike<number> | ArrayLike<string> | undefined>;
  }[];
};
```

Remove the `as never` casts once the types align.

---

### IN-02: `rasterize.test.ts` monotonic-luminance test for inferno does not exercise the 0.875 stop

**File:** `src/ui/rasterize.test.ts:283-301`

**Issue:** The test only asserts `lum(0) < lum(0.5) < lum(1.0)`. It misses the `0.875` stop, allowing the flat-top defect reported in CR-01 to pass undetected. The test title claims monotonic luminance as a property of the inferno function but does not enforce it over the full `[0, 1]` range.

**Fix:** After correcting the LUT (CR-01), add intermediate monotonicity assertions:

```typescript
expect(lum(0)).toBeLessThan(lum(0.25));
expect(lum(0.25)).toBeLessThan(lum(0.5));
expect(lum(0.5)).toBeLessThan(lum(0.75));
expect(lum(0.75)).toBeLessThan(lum(0.875));
expect(lum(0.875)).toBeLessThan(lum(1.0));
```

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
