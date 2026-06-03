# mzPeakIV — mzPeak Image Viewer

## What This Is

A browser-based TypeScript application for exploring **mass spectrometry imaging (MSI)** data stored in the [mzPeak](https://github.com/HUPO-PSI/mzPeak) file format. A researcher opens an imaging `.mzpeak` file (locally or from a URL) and interactively explores it: reconstructs the spatial pixel grid, renders ion images for a chosen *m/z* window, inspects the spectrum behind any pixel, and reads the file's metadata. Everything runs client-side — no backend, no upload — and the app deploys as a static site (GitHub Pages).

It is a *format-exploration and orientation tool*, not a full analysis suite. The point is to make the new mzPeak imaging format tangible and inspectable for wet-lab scientists, format implementers, and the HUPO-PSI community evaluating mzPeak.

## Core Value

**You can open an imaging mzPeak file in a browser and see an ion image — pick an *m/z*, get a spatial map, click a pixel, see its spectrum.** If everything else fails, this round-trip from file → ion image → spectrum must work and must be correct.

## Requirements

### Validated

- [x] Load an mzPeak file from a local file picker (drag-drop / file input) — Phase 1
- [x] Load an mzPeak file from a URL (HTTP range-friendly) — Phase 1
- [x] Parse the ZIP archive + `mzpeak_index.json` manifest and list contained Parquet entities — Phase 1
- [x] Read and display file-level metadata and spectrum counts — Phase 1
- [x] Detect imaging data and reconstruct the pixel grid from per-spectrum spatial coordinates — Phase 2
- [x] Render a TIC (total-ion-current) image as the default spatial overview — Phase 3
- [x] Click a pixel to view its full spectrum (signal-file routing by MS:1000525) — Phase 3

### Active

- [ ] Load an mzPeak file from a local file picker (drag-drop / file input)
- [ ] Load an mzPeak file from a URL (HTTP range-friendly)
- [ ] Parse the ZIP archive + `mzpeak_index.json` manifest and list contained Parquet entities
- [ ] Read and display file-level metadata (file description, instrument config, software, run, sample) and spectrum counts
- [ ] Detect whether the file contains imaging data and reconstruct the pixel grid (x/y extents) from per-spectrum spatial coordinates
- [ ] Render a TIC (total-ion-current) image as the default spatial overview
- [ ] Render an ion image for a user-chosen *m/z* ± tolerance (Da and ppm)
- [ ] Provide colormap selection and intensity scaling (linear/log, percentile clipping)
- [ ] Click a pixel to view its full spectrum, with the selected *m/z* window marked
- [ ] Handle the documented signal layouts: point and chunked, with delta encoding
- [ ] Surface clear, actionable errors when a file is unsupported or not imaging data

### Out of Scope

- Writing / editing / converting mzPeak files — read-only explorer (conversion belongs to OpenMS / the Rust reference tools)
- imzML/ibd ingestion or in-app conversion — the app consumes `.mzpeak` only; conversion is upstream
- Quantitative MSI analysis (segmentation, co-localization, peak picking pipelines, statistics) — orientation tool, not analysis suite
- Non-imaging mzPeak workflows beyond basic metadata/spectrum display (LC-MS feature finding, proteomics search, etc.)
- Re-implementing Parquet/ZIP/Arrow parsing from scratch — reuse the upstream `mzpeakts` reader
- Server-side processing or data upload — fully client-side by design
- 3D / z-stack / multi-run imaging in v1 — single 2D imaging run first

## Context

- **Format maturity:** mzPeak is an early, explicitly unstable format ("work in progress, no stability guaranteed"). It is an *uncompressed ZIP of Apache Parquet files* plus an `mzpeak_index.json` manifest. Core files: `spectra_metadata.parquet` (packed parallel metadata: spectrum / scan / precursor / selected_ion groups + file-level metadata as Parquet key-value JSON), `spectra_data.parquet` (signal arrays), optional `spectra_peaks.parquet`, plus chromatogram and wavelength-spectrum equivalents. Signal arrays use **point layout** (parallel arrays keyed by `spectrum_index`) or **chunked layout** (`mz_chunk_start/end/values` + `chunk_encoding`, with delta / MS-Numpress compression). A `spectrum_array_index` JSON in Parquet metadata maps columns to PSI-MS CV terms (`MS:1000514` m/z, `MS:1000515` intensity).
- **Imaging is now specified by a draft extension** (was the project's #1 risk). `doc/index.md` in upstream mzPeak still has no MSI section, but the sibling `imzML2mzPeak` project produced **`imaging-mzpeak-spec-draft v0.3`** (Codex verdict after 3 adversarial rounds: IMPLEMENTABLE: yes), pinned at `.planning/research/imaging-spec/` with a full binding map in [`.planning/research/IMAGING-SPEC-ALIGNMENT.md`](research/IMAGING-SPEC-ALIGNMENT.md). Confirmed convention: an imaging mzPeak is **one spectrum per pixel**; coordinates are **promoted `scan` columns** `IMS_1000050_position_x` / `IMS_1000051_position_y` (`Int64`, 1-based, no unit, authoritative); display orientation is a **fixed top-left convention** (col=x, row=y, y-down, no flip); grid geometry from `ms_run.parameters` (`IMS:1000042/43` counts, `IMS:1000046/47` µm pixel size) + a `mzpeak_index.json.metadata.imaging` discovery block; signal reads route to `spectra_data` (profile) vs `spectra_peaks` (centroid) by `MS_1000525`. The spec is **pre-merge** into base mzPeak, so the viewer keeps a thin CoordSource fallback chain. **Validation target: PXD001283** (mouse bladder, 260×134 = 34,840 px) once the operator's converted `.mzpeak` is available.
- **Existing reader to reuse:** [HUPO-PSI/mzpeakts](https://github.com/HUPO-PSI/mzpeakts) — a pure-TypeScript browser reader (no backend) built on `parquet-wasm` + `apache-arrow` + `zip.js`, with a live demo at https://hupo-psi.github.io/mzpeakts/app.html. API: `MzPeakReader.fromUrl(path)` → `getSpectrum(index)`; `Spectrum` exposes `id`, `index`, `dataArrays`, `precursors`, `selectedIons`. **Implemented:** metadata, point + chunked + delta, ZIP storage. **Not yet:** MS-Numpress, auxiliary arrays, directory storage. Not published to npm → vendor it (git submodule or in-tree copy) and add a thin imaging layer on top.
- **The paper** ("mzPeak: Designing a Scalable, Interoperable, and Future-Ready Mass Spectrometry Data Format", *J. Proteome Res.* 2025, 24, 5329–5335) is a high-level Perspective and sets direction (Parquet-backed, random access, MSI/ion-mobility as first-class future workflows) but contains no on-disk spec. The operator (O. Kohlbacher) is corresponding author.
- **Reference:** earlier MSI format imzML (Schramm et al., *J. Proteomics* 2012) informs the coordinate convention and the expected explorer UX (cf. mzmine, METASPACE, Cardinal).

## Constraints

- **Tech stack**: Vite + React + TypeScript; Canvas 2D for the ion-image heatmap; `uPlot` for spectra — minimal, fast, static-deployable. Chosen to match the plain-TS spirit of the upstream demo while giving a component model for the multi-panel UI.
- **Reader**: reuse/vendor `mzpeakts` (`parquet-wasm` + `apache-arrow` + `zip.js`) rather than re-implementing — *Why:* re-implementing browser Parquet/ZIP/Arrow parsing is large and error-prone; the upstream reader already handles the layouts. Extend it only if the operator's sample needs Numpress / aux arrays / directory storage.
- **Client-side only**: no server, no data upload — *Why:* MSI files can be large and sensitive; researchers must be able to inspect locally, and static hosting keeps the tool trivially shareable.
- **Format instability**: mzPeak has no stability guarantee — *Why:* the reader/imaging layer must fail gracefully and version-detect, not assume fixed schemas.
- **Imaging coordinate convention is unconfirmed** — *Why:* no spec section and no public example; the grid-reconstruction layer must be built against a real operator-supplied file and kept adaptable.
- **Process**: every phase is bracketed by a **Codex CLI adversarial review** — round 1 on the phase plan, round 2 on the phase diff — per the PROC-01 convention (`tools/codex_review.sh round{1,2} <phase>`), verdict line copied into the phase commit footer.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build on `mzpeakts`, don't reimplement the reader | Upstream already parses ZIP+Parquet+Arrow and the point/chunked layouts; reimplementing is large, slow, and duplicative | — Pending |
| Vite + React + TypeScript + Canvas2D + uPlot | Static-deployable, fast, component model for multi-panel UI, tiny plotting dep | — Pending |
| Read-only explorer; conversion stays upstream (OpenMS / Rust tools) | Keep scope tight on the Core Value; conversion is a separate, heavier concern | — Pending |
| Imaging = one-spectrum-per-pixel; coords = promoted `Int64` `scan` columns `IMS_1000050/51_position_x/y` (1-based, authoritative); fixed top-left orientation; signal-file routing by `MS_1000525` | Specified by imaging-mzpeak-spec v0.3 (IMPLEMENTABLE: yes); supersedes the earlier cvParam hypothesis. See [`IMAGING-SPEC-ALIGNMENT.md`](research/IMAGING-SPEC-ALIGNMENT.md) | ✓ Good — spec-backed; still validate vs PXD001283 |
| Operator supplies converted PXD001283 `.mzpeak` as validation ground truth | The spec defines the convention; the real file validates the implementation (grid 260×134, no transpose) | — Pending (Phase 2 builds against spec + synthetic fixtures meanwhile) |
| Fully client-side, static-hosted | Privacy, shareability, matches upstream demo | — Pending |
| Each phase bracketed by Codex adversarial review (PROC-01) | Operator process requirement; novel under-specified format warrants adversarial checks | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 after Phase 3 completion*
