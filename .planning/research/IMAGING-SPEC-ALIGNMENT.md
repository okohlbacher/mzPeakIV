# Imaging mzPeak Spec → Viewer Alignment

**Date:** 2026-06-03
**Source spec:** `imaging-mzpeak-spec-draft v0.3` (Codex verdict after 3 adversarial rounds: **IMPLEMENTABLE: yes**). Pinned copy: [`.planning/research/imaging-spec/imaging-mzpeak-spec-draft-v0.3.md`](./imaging-spec/imaging-mzpeak-spec-draft-v0.3.md); review: [`.planning/research/imaging-spec/imaging-mzpeak-spec-review-codex.md`](./imaging-spec/imaging-mzpeak-spec-review-codex.md). Authored by the sibling `imzML2mzPeak` converter project for the HUPO-PSI mzPeak committee.

**Purpose:** This is the now-concrete answer to the project's #1 risk (imaging coordinate convention was previously a hypothesis). It binds the viewer's reader / coordinate / grid / image / spectrum layers to the spec, and lists the exact changes to the viewer's planning artifacts.

> **Status of the spec:** a *draft for the committee*, not yet merged into HUPO-PSI/mzPeak `doc/index.md`. It depends on two proposed base-spec amendments (CV-inflection accepting `IMS`; provisional `ms_run.parameters` placement). The viewer treats it as the **primary, authoritative** convention but keeps a thin fallback layer (below) so a non-conforming or pre-spec file still degrades gracefully rather than crashing.

---

## 1. Binding constraints the viewer MUST honor

### C1 — Coordinates are promoted `scan` columns (authoritative)
- Per pixel: `IMS_1000050_position_x`, `IMS_1000051_position_y` (optional `IMS_1000052_position_z`) in the **`scan`** facet of `spectra_metadata.parquet`.
- Type **`Int64`**, **1-based**, **no unit**. Keyed by `scan.source_index` → `spectrum.index`.
- v1: **exactly one scan row per pixel spectrum** (mzPeak has no scan ordinal). >1 coordinate-bearing scan per spectrum is non-conformant — the converter errors; the viewer should treat duplicate coords for one spectrum as a diagnostic, not silently pick one.
- The **columns are the single source of truth.** `metadata.imaging` is discovery-only and MUST agree when present.

### C2 — Fixed display orientation (MANDATORY — no detection, no flip)
- Render ion image as `M[row][col]` with **`col = position_x`, `row = position_y`**, pixel `(1,1)` at **top-left**; x increases rightward, y increases **downward**.
- Readers **MUST NOT** apply any extra flip or transpose. **Scan pattern / scan type / line-scan direction terms are acquisition-order provenance ONLY and MUST NOT affect display.** Two files with identical pixels but different scan directions render identically.
- ⇒ The viewer does **not** have an "orientation detector" or a user flip-to-match control as a correctness mechanism. (A cosmetic view-only flip is fine, but the *default/correct* render is the fixed convention.)

### C3 — 1-based → 0-based indexing
- `coordinate_base: 1`. For 0-based JS arrays/canvas, internal index = `position − 1`. Preserve original 1-based coords for the hover readout.

### C4 — Grid geometry sources (in priority order)
1. **`mzpeak_index.json.metadata.imaging`** discovery block (fast path): `is_imaging`, `pixel_count {x,y}`, `pixel_size_um {x,y}`, `max_dimension_um`, `scan_pattern|scan_type|line_scan_direction|linescan_sequence` (CURIEs), `coordinate_base`. Governed by `schema/imaging.json`.
2. **`ms_run.parameters`** (authoritative run-level): `IMS:1000042` max count of pixel x, `IMS:1000043` max count of pixel y, `IMS:1000046` pixel size (x), `IMS:1000047` pixel size y (µm), `IMS:1000044/45` max dimension x/y.
3. **Derived from the coordinate columns** (extents = max position). Use only if 1 & 2 absent.
- Grid extent = `IMS:1000042 × IMS:1000043` (NOT necessarily max observed coordinate — sparse acquisitions). When the discovery block disagrees with the columns/params, the **columns/params win** and the viewer should surface the discrepancy in diagnostics.

### C5 — Pixel aspect ratio
- Physical pixel size from `IMS:1000046` (x) / `IMS:1000047` (y) µm → render aspect = `size_x : size_y`. Non-square pixels MUST be respected. Absent → assume square (1:1) and note it.

### C6 — Signal-file routing (profile vs centroid)
- Destination is governed by `MS_1000525_spectrum_representation`, **independent** of imzML storage mode:
  - **profile** (`MS:1000128`) → `spectra_data.parquet`
  - **centroid** (`MS:1000127`) → `spectra_peaks.parquet`
- The ion-image builder and the per-pixel spectrum view MUST read from the file that actually holds the data for that spectrum's representation. Do **not** assume `spectra_data.parquet`.
- Continuous-mode source files are re-materialized per spectrum at conversion time (v1 fallback) — by the time the viewer reads, every spectrum has its own m/z+intensity arrays, so no shared-axis handling is needed reader-side.

### C7 — Imaging detection
- A file is imaging iff non-null `IMS_1000050_position_x` + `IMS_1000051_position_y` exist in `scan` (authoritative). `metadata.imaging.is_imaging == true` is a discovery hint (SHOULD be present; absence does not invalidate).
- A valid non-imaging (LC-MS) file → reported distinctly as "no spatial coordinates — not imaging data" (not an error).

### C8 — Sparse grids
- Absent pixels simply have no `scan` row → logical addressing, not dense storage. Use a **presence mask**; missing cells render as background/NaN, distinct from genuine zero-intensity pixels.

### C9 — Lossless expectation (informational)
- v1 default is L1 numerically-lossless decoded arrays (point layout, no opaque transform → bit-for-bit). L2 (Numpress/delta/null-marking) is opt-in with declared tolerances. The viewer just decodes faithfully via `mzpeakts`; it must keep float dtype as stored (f32 stays f32, f64 stays f64) and must fail loud on transforms `mzpeakts` can't decode (already DATA-02).

---

## 2. Per-layer mapping (spec → viewer component)

| Viewer layer | Spec input | What the layer does |
|---|---|---|
| **Reader** (`src/reader/`) | `scan` columns, `ms_run.parameters`, `metadata.imaging`, `MS_1000525_spectrum_representation` | Expose: per-spectrum representation; per-spectrum `scan` coords by accession; run-level imaging params; `metadata.imaging` block. Route signal reads to `_data` vs `_peaks` (C6). |
| **CoordSource** (`src/imaging/coords.ts`) | `IMS_1000050/51[/52]` columns (primary); cvParams in `scan.parameters` (fallback); spectrum-id parse (last-resort) | Strategy chain. **Primary = inflected scan columns keyed on accession `IMS:1000050/51`** (per ARCHITECTURE research, `mzpeakts` promotes `IMS_xxxx_` columns AND exposes `meta.parameters`; check columns first, key on accession not column string). Log which strategy won. |
| **Grid model** (`src/imaging/grid.ts`) | C3, C4, C5, C8 | Build `pixel_count`, presence mask, coord↔index lookup; 1-based→0-based; aspect from pixel size; extent from declared counts not max-coord. |
| **Ion image / TIC** (`src/compute/`) | C2, C6 | `M[row][col]` with col=x,row=y, top-left; aggregate via `extractXIC` (m/z window) reading the correct signal file. No flip. |
| **Spectrum view** (`src/ui/SpectrumPanel`) | C6 | Read the clicked pixel's arrays from `_data`/`_peaks` by representation. |
| **Diagnostics** (`src/imaging/diagnostics.ts`) | C1, C4, C7 | unique-coord count vs spectrum count; filled/total; duplicate/missing; discovery-vs-authoritative disagreement; non-imaging report. |
| **Capabilities probe** (Phase 1, `src/reader/capability.ts`) | C7 | `is_imaging` boolean: columns present AND/OR `metadata.imaging.is_imaging`. |

---

## 3. Required changes to existing viewer planning artifacts

| Artifact | Change | Reason |
|---|---|---|
| `PROJECT.md` — Context, Key Decisions | Imaging convention is no longer a hypothesis: it's the v0.3 spec (C1–C8). Decision row "imzML IMS:1000050/51 cvParams" → "promoted `Int64` scan columns; fixed top-left orientation; signal-file routing". Mark ⚠️ Revisit → still validate vs real file, but convention is specified. Add the spec as a Constraint/reference. | Accuracy; unblocks Phase 2. |
| `REQUIREMENTS.md` — IMG-01 | Reword to inflected scan columns (`IMS_1000050_position_x`/`51`, Int64, 1-based, authoritative), with `metadata.imaging` discovery; CoordSource fallback chain retained. | Precise representation. |
| `REQUIREMENTS.md` — IMG-02 | Add: extent from declared `IMS:1000042/43` (not max coord); pixel aspect from `IMS:1000046/47`; coordinate_base normalization. | C3/C4/C5. |
| `REQUIREMENTS.md` — IMAGE-04 | Orientation wording → **fixed** top-left, col=x/row=y, y-down, no flip/transpose; scan-direction terms ignored for display. | C2 (was implying detect/validate). |
| `REQUIREMENTS.md` — new DATA-03 | Add: ion-image + spectrum reads route to `spectra_data` (profile) vs `spectra_peaks` (centroid) by `MS_1000525`. | C6 (was missing). |
| `ROADMAP.md` — Phase 2 | No longer fully "blocked on a real file": plan against the spec now; the real file (PXD001283) becomes the **validation** input, not a precondition to start. Success criteria → spec-aligned (Int64 columns authoritative, metadata.imaging discovery, coordinate_base, fixed orientation prep, aspect). Keep swappable CoordSource as defensive design with the spec strategy primary. | Convention now exists. |
| `ROADMAP.md` — Phase 3 (IMAGE-04 / SC2) | Fixed orientation (no flip); aspect from pixel size. | C2/C5. |
| `Phase 1 CONTEXT` — FMT-04 detection | Imaging probe = `IMS_1000050/51` columns and/or `metadata.imaging.is_imaging`; representation routing noted for later phases. | C7/C6. |
| `CLAUDE.md` — risk/format note | Replace "#1 risk: convention unconfirmed (hypothesis)" with "convention specified by imaging spec v0.3 (pinned); validate vs PXD001283". | Risk resolved. |

---

## 4. Test fixtures / validation

- **Canonical acceptance file: PXD001283** "HR2MSI mouse urinary bladder S096" — imzML processed, **34,840** pixels, **grid 260×134**, profile MS1, 10 µm pixels, UUID `C7822330-F1A8-4D11-AD30-504B30B33722`. Converted to mzPeak it is the Phase-2 grid ground-truth (expected 260×134, no transpose, unique-coord count == spectrum count == 34,840) and a **real-scale perf input** for Phase 5 (worker offload).
- Phase-2 plan should assert: grid dims == 260×134; coordinate columns present, Int64, 1-based; `metadata.imaging` (if present) agrees; render orientation matches the fixed convention against a known reference image of this dataset.
- Until the operator drops the converted `.mzpeak` in `test/data/`, Phase 2 can be **planned and built against the spec** with synthetic fixtures (a tiny known grid), then validated against PXD001283.

---

## 5. Open items inherited from the spec (track, don't block)

- Spec is **pre-merge** into mzPeak base (needs the IMS-inflection amendment + scanSettings-home decision). If the committee changes the `scanSettings` home from `ms_run.parameters` to a first-class `scan_settings`/`imaging` footer, the viewer's grid-geometry source #2 (C4) must follow — isolate that read behind one function.
- Coordinate base could be normalized to 0-based in a future spec rev (open question #5). The viewer reads `coordinate_base` from the discovery block rather than assuming `1`, so it absorbs that change.
- Promoted-column type could become `UInt32` (open question #6). CoordSource should read the coord columns by accession and accept Int64 **or** UInt32, not hard-assume one Arrow type.
- ROI / z-stack / subimages are spec-deferred (v1 out) → viewer keeps them out of scope (already so).

---

*This document is the binding contract between the imaging mzPeak spec v0.3 and mzPeakExplorer. When the spec revises, update §1 constraints and propagate via §3.*
