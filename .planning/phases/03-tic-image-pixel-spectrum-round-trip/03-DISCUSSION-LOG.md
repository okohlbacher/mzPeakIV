# Phase 3: TIC Image + Pixel→Spectrum Round-Trip — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 03-tic-image-pixel-spectrum-round-trip
**Areas discussed:** TIC pipeline, Pixel interaction, DATA-03 routing scope

---

## TIC pipeline

### Q1: How should TIC per-pixel values be computed?

| Option | Description | Selected |
|--------|-------------|----------|
| `extractXIC(null, null)` | One async call; reuses Phase 4 ion-image primitive; signal-file routing via `useProfile` | ✓ |
| Iterate `getSpectrumArrays` | N async calls for N spectra; simple but slow (34,840 calls for PXD001283) | |
| Custom reader function | Reads intensity-only columns directly via Arrow; most efficient but violates reader boundary | |

**User's choice:** `extractXIC(null, null)` — recommended option accepted.

---

### Q2: When should TIC be computed?

| Option | Description | Selected |
|--------|-------------|----------|
| New LoadStage `'tic'` after `'grid'` | Consistent with Phase 2 pattern; image ready instantly when layout appears | ✓ |
| Lazy on first render | Faster load, brief spinner; more complex state | |
| Let Claude decide | — | |

**User's choice:** New LoadStage — recommended option accepted.

---

### Q3: Where does TIC computation live?

| Option | Description | Selected |
|--------|-------------|----------|
| `src/compute/tic.ts` | New `compute/` layer above `reader/` and `imaging/`; Phase 4 ion-image builder lands here too | ✓ |
| `src/imaging/tic.ts` | Inside imaging module; mixes grid geometry with signal aggregation | |
| `src/reader/tic.ts` | Reader layer; wrong — reader exposes typed arrays, not image-build logic | |

**User's choice:** `src/compute/tic.ts` — recommended option accepted.

---

## Pixel interaction

### Q1: When a pixel is clicked, what happens to the spectrum panel?

| Option | Description | Selected |
|--------|-------------|----------|
| Update existing SpectrumPanel in-place | Click → `selectSpectrum(index)` → same store action; no duplication | ✓ |
| New ImagingSpectrumPanel | Separate component; cleaner for imaging but duplicates uPlot setup | |
| Let Claude decide | — | |

**User's choice:** Update existing SpectrumPanel — recommended option accepted.

---

### Q2: Where does the hover readout appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Label below the canvas | Single text line `x: N, y: N, TIC: N`; simple, no z-index issues | ✓ |
| Overlay tooltip on canvas | Floating tooltip follows cursor; more interactive but needs CSS positioning | |
| Status bar at bottom | Thin footer; far from cursor for large images | |

**User's choice:** Label below canvas — recommended option accepted.

---

### Q3: Should a selected pixel be visually marked?

| Option | Description | Selected |
|--------|-------------|----------|
| 1px ring/outline on canvas | Drawn in contrast color; redrawn on selection change | ✓ |
| No marker | Spectrum panel title update only | |
| CSS crosshair overlay | Absolute-positioned CSS; pixel-alignment tricky when canvas scales | |

**User's choice:** 1px ring — recommended option accepted.

---

## DATA-03 routing scope

### Q1: Per-pixel spectrum — explicit routing or implicit fallback?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit `SpectrumMeta.representation` lookup | Read representation before `getSpectrum(index)`; routes explicitly to `spectrumData()` or `spectrumPeaks()` | ✓ |
| Keep implicit fallback | `dataArrays → centroids` fallback; may silently pick wrong file | |

**User's choice:** Explicit routing — recommended option accepted.

---

### Q2: `useProfile` flag for `extractXIC` — per-file or per-spectrum?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file uniform from `representationCounts` | Majority rule; surface warning on mixed profile/centroid | ✓ |
| Per-spectrum (not feasible) | Would require N separate `extractXIC` calls | |
| Let Claude decide | — | |

**User's choice:** Per-file uniform — recommended option accepted.

---

## Claude's Discretion

None — user selected a concrete option for every question.

## Deferred Ideas

- Colormap selector + intensity scaling (linear/log, percentile clipping) — Phase 4
- SPEC-02 m/z window marker on spectrum — Phase 4
- Web Worker offload for TIC compute — Phase 5
- Mean/sum/max aggregation toggle — v2
- Cosmetic orientation flip toggle — deferred from Phase 2, still deferred
