# mzPeakIV — Requirements

Scope for v1 (MVP). All v1 requirements are hypotheses until shipped and validated. REQ-ID format: `CATEGORY-NN`.

Core Value: **Open an imaging mzPeak file in a browser → pick an *m/z* → see a correct ion image → click a pixel → see its spectrum.**

## v1 Requirements

### Load (LOAD)

- [x] **LOAD-01**: User can open a local `.mzpeak` file via a file picker and drag-and-drop.
- [x] **LOAD-02**: User can open a `.mzpeak` file from a URL (range-request friendly; works against the upstream-hosted demo files).
- [x] **LOAD-03**: User sees staged progress/feedback while a file is being opened and parsed (no silent long pauses).

### Format & Metadata (FMT)

- [x] **FMT-01**: App parses the uncompressed-ZIP archive and reads the `mzpeak_index.json` manifest, listing each contained Parquet entity (name, entity_type, data_kind).
- [x] **FMT-02**: App reads and displays file-level metadata: file description, instrument configuration, software list, run, and sample (from Parquet key-value JSON).
- [x] **FMT-03**: App displays spectrum/entity counts and basic per-file stats (number of spectra, m/z range if available, ms levels present).
- [x] **FMT-04**: App detects and reports the file's capabilities/layout (point vs chunked, encodings present) and whether it contains imaging data.

### Imaging Model (IMG)

- [x] **IMG-01**: App reconstructs the spatial pixel grid by extracting per-spectrum x/y coordinates from the **promoted `scan` columns** `IMS_1000050_position_x` / `IMS_1000051_position_y` (`Int64`, 1-based, authoritative) per imaging-spec v0.3, keyed on accession via a swappable CoordSource chain (columns primary; `scan.parameters` cvParams and spectrum-id parse as fallbacks). Validated against PXD001283.
- [x] **IMG-02**: App computes and exposes grid geometry: extent from declared `IMS:1000042/43` pixel counts (falling back to coord max), pixel-presence mask (sparse vs dense), coordinate→spectrum-index lookup, 1-based→0-based normalization (reading `coordinate_base`), and pixel aspect ratio from `IMS:1000046/47` (µm).
- [x] **IMG-03**: App surfaces grid diagnostics (detected dimensions, pixel count vs spectrum count, missing/duplicate pixels) so a user can sanity-check reconstruction.

### Spatial Images (IMAGE)

- [x] **IMAGE-01**: App renders a TIC (total-ion-current) image as the default spatial overview.
- [x] **IMAGE-02**: App renders an ion image for a user-entered *m/z* with a tolerance specified in either Da or ppm.
- [x] **IMAGE-03**: User can choose a colormap and an intensity scaling mode (linear / log) with percentile clipping, so images are not blank on high-dynamic-range data.
- [x] **IMAGE-04**: Hovering the image shows the pixel's (1-based) x/y and intensity readout; the image renders with the spec's **fixed mandatory orientation** — `M[row][col]`, col=x, row=y, pixel (1,1) top-left, y increasing downward, **no flip/transpose**, scan-direction terms ignored for display — and respects pixel aspect ratio from `IMS:1000046/47`.

### Spectrum View (SPEC)

- [x] **SPEC-01**: Clicking a pixel displays that pixel's full spectrum in a fast plot (uPlot) with zoom/pan.
- [x] **SPEC-02**: The currently selected *m/z* ± tolerance window is visually marked on the spectrum.

### Signal Data (DATA)

- [x] **DATA-01**: App correctly reads the point layout and the chunked layout with delta encoding, reconstructing m/z and intensity arrays.
- [x] **DATA-02**: App detects unsupported encodings/storage (MS-Numpress, auxiliary arrays, directory storage) and fails loudly with a named, actionable error rather than rendering silent/incorrect data.
- [x] **DATA-03**: App reads each spectrum's signal (for the per-pixel spectrum view and ion-image aggregation) from the correct file per `MS_1000525_spectrum_representation` — profile → `spectra_data.parquet`, centroid → `spectra_peaks.parquet` — never assuming `spectra_data`.

### Errors & Robustness (UX)

- [ ] **UX-01**: App distinguishes and clearly communicates the three failure classes: "not an imaging file", "unsupported encoding/feature", and "corrupt/unreadable file".

## v2 / Deferred

- Full-column in-memory cache in a Web Worker for instant *m/z* scrubbing (perf upgrade over per-spectrum `extractXIC`).
- Lazy Parquet row-group projection for multi-GB files.
- Mean/representative spectrum across a region; sum-vs-max aggregation toggle.
- Shareable deep-link URL encoding the loaded file + selected *m/z* + view state.
- Raw-format inspector view (browse Parquet schemas/columns/row groups on disk).

## Out of Scope (v1)

- Writing/editing/converting mzPeak files — read-only explorer; conversion belongs to OpenMS / Rust reference tools.
- imzML/ibd ingestion or in-app conversion — app consumes `.mzpeak` only.
- Quantitative MSI analysis: peak picking, metabolite annotation, segmentation/classification, co-localization, data-level normalization — orientation tool, not analysis suite.
- Server-side processing or data upload — fully client-side by design.
- 3D / z-stack / multi-run imaging — single 2D run first.
- Re-implementing Parquet/ZIP/Arrow parsing — reuse `mzpeakts`.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LOAD-01 | Phase 1 | Complete |
| LOAD-02 | Phase 1 | Complete — e2e/remote-url.spec.ts (Range-request assertion) |
| LOAD-03 | Phase 1 | Complete |
| FMT-01 | Phase 1 | Complete |
| FMT-02 | Phase 1 | Complete |
| FMT-03 | Phase 1 | Complete |
| FMT-04 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 3 | Complete |
| IMG-01 | Phase 2 | Complete |
| IMG-02 | Phase 2 | Complete |
| IMG-03 | Phase 2 | Complete |
| IMAGE-01 | Phase 3 | Complete |
| IMAGE-04 | Phase 3 | Complete |
| SPEC-01 | Phase 3 | Complete |
| SPEC-02 | Phase 3 | Complete |
| IMAGE-02 | Phase 4 | Complete |
| IMAGE-03 | Phase 4 | Complete |
| UX-01 | Phase 5 | Pending |
