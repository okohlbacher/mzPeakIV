# mzPeakIV — Roadmap

**Granularity:** coarse (~4-5 phases)
**Project mode:** mvp (vertical slices — each phase ships an end-to-end demonstrable capability)
**Core Value:** Open an imaging mzPeak file in a browser → pick an *m/z* → see a correct ion image → click a pixel → see its spectrum.

This roadmap is derived from the research build-order (ARCHITECTURE.md dependency sequence + PITFALLS.md phase mapping), not an imposed template. The sequencing reflects the project's #1 risk: the imaging coordinate convention is unconfirmed, so a **non-imaging reader+metadata+single-spectrum capability ships first** as proof the reader works in-browser, and the **coordinate-grid reconstruction is isolated into its own gated phase** behind a swappable strategy, blocked on a real operator imaging `.mzpeak`.

## Phases

- [x] **Phase 1: Reader Foundation + Open-and-Inspect** - Open a `.mzpeak` (local/URL), read manifest + metadata, view any single spectrum; capability-detect and fail loud on unsupported encodings. (completed 2026-06-03)
- [x] **Phase 2: Imaging Grid Reconstruction (THE GATE)** - Reconstruct the spatial pixel grid from per-spectrum coordinates via a swappable strategy; gated on a real operator imaging file. (completed 2026-06-03)
- [x] **Phase 3: TIC Image + Pixel→Spectrum Round-Trip** - Render the default TIC spatial overview and complete the file→image→click→spectrum Core Value loop. (completed 2026-06-03)
- [ ] **Phase 4: Ion Image + Intensity Scaling** - Render a per-*m/z* ion image with Da/ppm tolerance, colormaps, and log/percentile scaling so images are never falsely blank.
- [ ] **Phase 5: Worker Offload, Robustness & Static Deploy** - Offload compute to a Web Worker, finalize the error taxonomy, fail loud on unsupported encodings/non-imaging, and ship to GitHub Pages.

## Phase Details

### Phase 1: Reader Foundation + Open-and-Inspect

**Goal**: A user can open any `.mzpeak` (imaging or not) from a local file or a URL, see the manifest, file-level metadata, and per-file stats, and view a single spectrum — proving the vendored reader works in-browser independently of the coordinate-grid risk.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: LOAD-01, LOAD-02, LOAD-03, FMT-01, FMT-02, FMT-03, FMT-04, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

  1. User can open a local `.mzpeak` via file picker and drag-drop, and open a remote `.mzpeak` from a URL, with staged progress shown at each stage (ZIP index → manifest → metadata loaded) — no silent long pause.
  2. User sees the parsed `mzpeak_index.json` manifest as a list of contained Parquet entities (name, entity_type, data_kind), plus file description, instrument config, software, run, and sample metadata.
  3. User sees per-file stats: spectrum/entity counts, m/z range if available, MS levels present, and a capabilities readout (point vs chunked layout, encodings present, whether imaging data is detected).
  4. User can select any spectrum by index and see its reconstructed m/z + intensity arrays plotted (point and chunked-with-delta layouts both reconstruct correctly).
  5. Opening a file using an unsupported encoding/storage (MS-Numpress, auxiliary arrays, directory storage) produces a named, actionable error and never renders silent zeros as if they were real data.

**Plans**: TBD
**Review:** Codex round1 (plan) + round2 (diff) per PROC-01
**Setup:** Bootstrap the Codex review harness `tools/codex_review.sh` (round1/round2 per PROC-01) as part of this phase's project scaffold, so Phase 1 itself — and every later phase — is adversarially reviewed.
**UI hint**: yes

### Phase 2: Imaging Grid Reconstruction (THE GATE)

**Goal**: A user can load an imaging `.mzpeak` and see a verified spatial pixel grid — extents, dimensions, presence mask, and diagnostics — reconstructed via a swappable coordinate-extraction strategy that is validated against the operator's real imaging file before anything is rendered on top of it.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: IMG-01, IMG-02, IMG-03
**Success Criteria** (what must be TRUE):

  1. App reconstructs per-spectrum x/y coordinates per imaging-spec v0.3 — primary: the promoted `scan` columns `IMS_1000050_position_x` / `IMS_1000051_position_y` (`Int64`, 1-based, authoritative), keyed on accession — via a swappable `CoordSource` chain (cvParams in `scan.parameters` and id-parse as fallbacks); logs which strategy won; accepts Int64 or UInt32.
  2. App exposes grid geometry — extent from declared `IMS:1000042/43` pixel counts (fallback: coord max), width×height, pixel-presence mask (sparse vs dense), coordinate↔spectrum-index lookup, 1-based→0-based normalization (reading `coordinate_base`), and pixel aspect from `IMS:1000046/47` — built once per file, original coords preserved. The `mzpeak_index.json.metadata.imaging` discovery block is used as a fast path and cross-checked against the authoritative columns/params.
  3. App surfaces a grid-diagnostics panel: detected dimensions, unique-coord count vs spectrum count, filled/total ratio, missing/duplicate pixels, and any discovery-vs-authoritative disagreement, so a user can sanity-check reconstruction.
  4. The reconstructed grid is validated against PXD001283 once converted (expected 260×134, no transpose, unique-coord count == spectrum count == 34,840). Until that file exists, validation uses synthetic known-grid fixtures built to the spec.
  5. A valid non-imaging (LC-MS) file is reported distinctly as "no spatial coordinates found — not imaging data," not as a broken file.

**Plans**: 4 plans

- [x] 02-01-PLAN.md — reader CoordSource chain + run-geometry reader (IMG-01)
- [x] 02-02-PLAN.md — sparse ImagingGrid builder + diagnostics (IMG-02, IMG-03)
- [x] 02-03-PLAN.md — eager 'grid' LoadStage + GridDiagnosticsPanel + non-imaging notice (IMG-01/02/03 wired)
- [x] 02-04-PLAN.md — PROC-01 Codex gate (round1 plan + round2 diff)

**Review:** Codex round1 (plan) + round2 (diff) per PROC-01
**Spec:** Build to imaging-mzpeak-spec v0.3 — see `.planning/research/IMAGING-SPEC-ALIGNMENT.md` (binding constraints C1–C8). Plannable now against the spec + synthetic fixtures; the converted PXD001283 `.mzpeak` is the **validation** input (no longer a precondition to start). Keep the CoordSource fallback chain since the spec is pre-merge into base mzPeak.
**UI hint**: yes

### Phase 3: TIC Image + Pixel→Spectrum Round-Trip

**Goal**: A user sees a TIC spatial overview the moment an imaging file loads, can click any pixel, and sees that pixel's full spectrum — completing the Core Value round-trip with minimal surface and validating the grid→sum→rasterize→paint→hit-test pipeline.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: IMAGE-01, IMAGE-04, SPEC-01, SPEC-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. App renders a TIC (total-ion-current) image as the default spatial overview immediately after grid reconstruction.
  2. Hovering the image shows the pixel's (1-based) x/y and intensity readout; the image renders with the spec's **fixed** orientation (`M[row][col]`, col=x, row=y, (1,1) top-left, y-down, NO flip/transpose; scan-direction terms ignored) and respects pixel aspect from `IMS:1000046/47`.
  3. Clicking a pixel displays that pixel's full spectrum in a fast uPlot chart with zoom/pan, reading from the correct signal file (`spectra_data` profile / `spectra_peaks` centroid) per `MS_1000525` (DATA-03).
  4. Missing pixels (sparse acquisitions) render distinctly from genuine zero-intensity pixels using the presence mask.

**Plans**: 4 plans

- [x] 03-01-PLAN.md — TIC compute (buildTic) + rasterize (colormap/clip/sparse sentinel) pure foundations + 'tic' LoadStage (IMAGE-01, IMAGE-04)
- [x] 03-02-PLAN.md — DATA-03 representation-routed signal reads (getSpectrumArraysFor) + selectSpectrum rewire (DATA-03, SPEC-01)
- [x] 03-03-PLAN.md — eager 'tic' store stage + ImagingPanel canvas (hover/click/ring) + App wiring + SPEC-02 mzWindow placeholder (IMAGE-01, IMAGE-04, SPEC-01, SPEC-02)
- [x] 03-04-PLAN.md — PROC-01 Codex gate (round1 plan + round2 diff)

**Review:** Codex round1 (plan) + round2 (diff) per PROC-01
**UI hint**: yes

### Phase 4: Ion Image + Intensity Scaling

**Goal**: A user can enter an *m/z* with a Da or ppm tolerance and see a correct ion image, choose colormaps and linear/log + percentile-clip scaling, and see the selected *m/z* window marked on the clicked-pixel spectrum — the headline deliverable, layered on the proven TIC pipeline.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: IMAGE-02, IMAGE-03, SPEC-02
**Success Criteria** (what must be TRUE):

  1. User enters an *m/z* and a tolerance in either Da or ppm (ppm→Da converted at the center *m/z*, unit-tested) and sees the corresponding ion image, computed via the reader's existing `extractXIC`.
  2. User can choose a colormap and an intensity-scaling mode (linear / log) with percentile clipping, so high-dynamic-range images are not falsely blank; the colorbar is labeled with the aggregation statistic and scale mode.
  3. App shows the nonzero-pixel count and value-range (and/or histogram) so "blank because scaling" is never confused with "blank because absent."
  4. The currently selected *m/z* ± tolerance window is visually marked on the clicked-pixel spectrum.
  5. Changing colormap or scale recolors the cached raster without re-querying the file.

**Plans**: 6 plans

- [ ] 04-01-PLAN.md — ionImage.ts compute + ionImage.test.ts (ppmToDa, buildIonImage, computeIonImageStats)
- [ ] 04-02-PLAN.md — rasterize.ts generalize + rasterize.test.ts (rasterizeImage, Inferno/Gray LUTs, log scaling)
- [ ] 04-03-PLAN.md — store.ts Phase 4 slice + renderIonImage + setColormapSettings actions
- [ ] 04-04-PLAN.md — SpectrumPanel.tsx SPEC-02 m/z band via uPlot hooks.draw
- [ ] 04-05-PLAN.md — ImagingPanel.tsx controls row + ion-image canvas + stats line
- [ ] 04-06-PLAN.md — PROC-01 Codex gate (round1 plan + round2 diff)

**Review:** Codex round1 (plan) + round2 (diff) per PROC-01
**UI hint**: yes

### Phase 5: Worker Offload, Robustness & Static Deploy

**Goal**: The app stays responsive on real-scale files by running the reader+grid+builders in a Web Worker, communicates all three failure classes clearly, and is publicly usable as a static GitHub Pages site.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: UX-01
**Success Criteria** (what must be TRUE):

  1. Reader + grid + ion-image/TIC compute run inside a Web Worker (rasters transferred zero-copy); *m/z*/tolerance controls are debounced and the UI stays responsive while images recompute on a real-scale file.
  2. The three failure classes are distinct and actionable: "not an imaging file (no spatial coords)", "unsupported encoding/feature (named)", and "corrupt/unreadable file" — each with a different suggested action.
  3. Unsupported encodings (Numpress/aux/directory) fail loud with a named error, consistent with the Phase 1 capability check, including in the worker path.
  4. The app builds and deploys as a static site to GitHub Pages (correct `base`, hashed `.wasm` asset, no COOP/COEP needed) and the full Core Value round-trip works from the deployed URL.
  5. The Codex review harness `tools/codex_review.sh` (bootstrapped in Phase 1) is finalized/hardened and supports `round1`/`round2 <phase>` per the PROC-01 convention.

**Plans**: TBD
**Review:** Codex round1 (plan) + round2 (diff) per PROC-01
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reader Foundation + Open-and-Inspect | 4/4 | Complete    | 2026-06-03 |
| 2. Imaging Grid Reconstruction (THE GATE) | 4/4 | Complete    | 2026-06-03 |
| 3. TIC Image + Pixel→Spectrum Round-Trip | 4/4 | Complete    | 2026-06-03 |
| 4. Ion Image + Intensity Scaling | 0/? | Not started | - |
| 5. Worker Offload, Robustness & Static Deploy | 0/? | Not started | - |

## Coverage

All 20 v1 requirements mapped to exactly one phase. No orphans, no duplicates. (DATA-03 added 2026-06-03 from imaging-spec alignment.)

| Category | Requirements | Phase |
|----------|--------------|-------|
| LOAD | LOAD-01, LOAD-02, LOAD-03 | 1 |
| FMT | FMT-01, FMT-02, FMT-03, FMT-04 | 1 |
| DATA | DATA-01, DATA-02 | 1 |
| DATA | DATA-03 (signal-file routing profile/centroid) | 3 |
| IMG | IMG-01, IMG-02, IMG-03 | 2 |
| IMAGE | IMAGE-01, IMAGE-04 | 3 |
| IMAGE | IMAGE-02, IMAGE-03 | 4 |
| SPEC | SPEC-01, SPEC-02 | 3 (SPEC-02 reinforced in 4) |
| UX | UX-01 | 5 |

> Note: SPEC-02 (selected *m/z* window marked on spectrum) is first satisfied in Phase 3 (window = none/TIC context) and becomes meaningful once a real *m/z* window exists in Phase 4; it is owned by Phase 3 for coverage and reinforced in Phase 4. DATA-02 (fail-loud on unsupported encodings) is owned by Phase 1 (capability detection) and re-asserted through the worker path in Phase 5.

## Process (applies to every phase)

Each phase is bracketed by a **Codex CLI adversarial review** (PROC-01 convention):

- **round1** — adversarial read of the phase plan before execution: `tools/codex_review.sh round1 <phase>`
- **round2** — adversarial read of the phase diff after execution: `tools/codex_review.sh round2 <phase> --sha <phase_start_sha>`

The verdict line (`accept` / `accept-with-revisions` / `reject`) is copied into the phase commit footer. `tools/codex_review.sh` itself is bootstrapped in Phase 1 (so Phase 1 onward is reviewable) and hardened in Phase 5.
