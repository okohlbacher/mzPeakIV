# Feature Research

**Domain:** Mass spectrometry imaging (MSI) data explorer — browser-only, read-only, format-orientation tool for mzPeak
**Researched:** 2026-06-03
**Confidence:** MEDIUM-HIGH (feature landscape grounded in named MSI tools; mzPeak imaging-encoding specifics remain unconfirmed against a real file — see PROJECT.md)

## Reference Tools Surveyed

| Tool | Type | Role in this research |
|------|------|-----------------------|
| **METASPACE** | Web platform (cloud) | Closest UX analog: browser ion-image browsing, hotspot clipping, TIC scaling, optical-image overlay, intensity scale modes. Defines what a *web* MSI viewer feels like. |
| **Cardinal (R)** | Analysis package | Defines the *analysis* ceiling — segmentation, classification, normalization, peak picking. Almost everything here is an anti-feature for v1. |
| **MSiReader (MATLAB)** | Desktop imzML viewer | Closest *feature* analog for a viewer: ion image with m/z tolerance in Da OR ppm, colormap editor, intensity-scale scrollbars, sum-vs-max in bin, ROI spectra, colocalization overlay. |
| **SCiLS Lab (Bruker)** | Commercial suite | Defines the heavyweight commercial ceiling: hotspot removal, multiple normalizations, segmentation, co-localization, multi-sample. Anti-feature reference. |
| **ProteoWizard SeeMS** | Spectrum/TIC viewer | Defines spectrum-panel + TIC expectations for non-imaging MS; informs the "click pixel → spectrum" panel. |
| **imzML viewers** (imzMLConverter/Datacube Explorer/BioMap lineage) | Desktop | Source of the IMS:1000050/51 coordinate convention and grid-reconstruction expectation. |

## Feature Landscape

### Table Stakes (Users Expect These)

Every MSI viewer above does these; missing any one makes the tool feel broken to a wet-lab scientist or format implementer.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Load file** (local picker + drag-drop) | Universal entry point; MSiReader/SeeMS/Cardinal all open a file first | LOW | Reuse `mzpeakts` reader. Local file → ArrayBuffer/Blob into zip.js. |
| **Load from URL** (HTTP range-friendly) | Matches `mzpeakts` demo (`MzPeakReader.fromUrl`); enables shareable links to public datasets like METASPACE | MEDIUM | Range requests needed for large Parquet; depends on CORS + server range support. Graceful fallback to full fetch. |
| **Parse ZIP + `mzpeak_index.json` manifest; list entities** | Format-orientation core: implementers want to see what's inside | LOW-MEDIUM | `mzpeakts` already parses ZIP+manifest. Listing Parquet entities is mostly UI. |
| **File / instrument / run / sample metadata + spectrum counts** | Every viewer shows file description, instrument config, software, scan counts (SeeMS, MSiReader) | MEDIUM | mzPeak packs file-level metadata as Parquet key-value JSON in `spectra_metadata.parquet`; needs decode + display. Spectrum count from row count. |
| **Detect imaging & reconstruct pixel grid** (x/y extents) | THE gate. No ion image, no TIC image, no pixel-click without it. Every imzML viewer does this. | HIGH | **Central project risk** (PROJECT.md). Coords assumed in scan/spectrum cvParams (IMS:1000050 x / 1000051 y). Must confirm against operator's real file. Handle sparse/non-rectangular grids (missing pixels → masked). |
| **TIC overview image** (default spatial view) | The orientation default in every MSI tool; what you see before choosing an m/z. SCiLS/METASPACE/MSiReader all default to a spatial overview | MEDIUM | Sum all intensities per spectrum → map to grid. Needs grid first. Cheap once grid + per-spectrum intensity sums exist. |
| **Ion image for m/z ± tolerance (Da AND ppm)** | Core deliverable. MSiReader does exactly this with Da/ppm toggle; METASPACE renders per-annotation ion images | MEDIUM-HIGH | For each pixel-spectrum, sum (or max) intensity within window → grid value. Window-extraction over point/chunked/delta layouts is the per-spectrum hot path. |
| **Colormap selection** | Every tool offers it (MSiReader colormap editor, METASPACE palettes). Viridis-default expected | LOW | Canvas2D LUT. Ship viridis + a couple (grayscale, hot/inferno). |
| **Intensity scaling: linear/log + percentile clipping** | MSiReader scrollbars; METASPACE "hotspot clipping" (percentile clip) is on by default for visualization | LOW-MEDIUM | Percentile clip == hotspot removal in MSI vocabulary; users expect it because raw images are dominated by a few hot pixels. |
| **Click pixel → spectrum, selected m/z marked** | Closes the Core-Value round-trip; SeeMS-grade spectrum panel + the imzML viewer "click-a-pixel" idiom | MEDIUM | uPlot spectrum panel. Marker/shaded band at the selected m/z ± tolerance. Needs grid (pixel→spectrum_index) + a spectrum renderer. |
| **Handle point + chunked + delta layouts** | Files in the wild use all three; reader must not choke | MEDIUM | `mzpeakts` already does point/chunked/delta. Verify aux/Numpress gaps don't crash (graceful "unsupported encoding"). |
| **Graceful, actionable errors** (non-imaging / unsupported / bad file) | Format is explicitly unstable; users will feed it wrong files. Implementers need to know *why* it failed | MEDIUM | Distinguish: not a mzPeak, mzPeak-but-not-imaging, imaging-but-coords-missing, unsupported encoding. Each a distinct message, not a stack trace. |
| **Spectrum plot zoom/pan** | SeeMS/uPlot baseline; a spectrum you can't zoom is useless at high resolution | LOW | uPlot provides natively. |

### Differentiators (Competitive Advantage)

Not required, but distinguish this tool. Aligned to Core Value (browser-only, format-tangible). Pick a few — do NOT build all.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero-install, fully client-side, static-hosted** | No upload, no backend, no account — unlike METASPACE (cloud upload) or SCiLS (licensed install). Privacy + instant shareability is the headline | (inherent to stack) | This is the project's structural differentiator; nothing to "build", but it shapes every decision. |
| **Raw-format inspector view** (show manifest entities, schema, CV-term mapping `spectrum_array_index`, layout/encoding per array) | No existing MSI tool exposes the *on-disk structure*; this is exactly what HUPO-PSI implementers evaluating mzPeak want | MEDIUM | Differentiator *because* this is a format-orientation tool, not an analysis tool. Lean into "make the format tangible." |
| **m/z window aggregation toggle (sum vs max in bin)** | MSiReader offers it; affects how an ion image reads. Cheap given window extraction already exists | LOW | Add once ion image works; small UI + one branch in the aggregator. |
| **Hover pixel → live x/y + intensity readout** | Tightens the orientation loop; confirms grid reconstruction is correct at a glance | LOW | Canvas mousemove → grid lookup. Strong debugging aid for the risky grid layer. |
| **Shareable app-state URL** (file URL + m/z + tolerance + colormap in query string) | Reproducible "look at this ion" links; METASPACE-style sharing without the cloud | LOW-MEDIUM | Only meaningful for URL-loaded files. Serialize view state to query params. |
| **Mean/representative spectrum overview** (average spectrum across all pixels) | Helps a user pick which m/z to image without guessing; standard in SeeMS/MSiReader as a starting view | MEDIUM | Requires streaming all spectra once → memory/perf tradeoff on large files; can be a v1.x add. |
| **Pixel-grid diagnostics** (rectangular vs sparse, min/max x/y, count of mapped vs total spectra) | Surfaces grid-reconstruction correctness — directly de-risks the central unknown | LOW | Effectively free given grid reconstruction; high value for implementers and for debugging real files. |

### Anti-Features (Commonly Requested, Often Problematic)

These are the bread-and-butter of Cardinal/SCiLS/METASPACE but are explicitly OUT for a lightweight read-only orientation tool (PROJECT.md "Out of Scope"). Documenting them prevents scope creep.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Peak picking / centroiding** | METASPACE *requires* centroided data; users assume a viewer should peak-pick | Heavy DSP pipeline; correctness-critical; duplicates upstream tooling (OpenMS/Cardinal) | View whatever the file already contains; surface `spectra_peaks.parquet` if present, but don't compute. |
| **Metabolite/lipid annotation (m/z → molecule, FDR)** | The METASPACE headline feature; users conflate "MSI viewer" with "annotation" | Requires databases, isotope modeling, FDR scoring — a whole product. Out of scope by definition | Show raw m/z only. Annotation belongs to METASPACE. |
| **Spatial segmentation / clustering / classification** | Cardinal + SCiLS core analytics | Statistical modeling, large compute, not browser-friendly, not orientation | None — this is an analysis suite's job. |
| **Co-localization analysis / multi-ion overlay** | MSiReader (≤3 ions), SCiLS co-localization | Multiplies UI + intensity-blending complexity; analysis territory | Single ion image at a time in v1. Could revisit a simple 2-channel overlay far later. |
| **Normalization beyond display scaling** (TIC-normalize, median, internal standard) | SCiLS/Cardinal standard; METASPACE has TIC scaling | Changes the *data*, not just the view; introduces artifacts (METASPACE notes TIC normalization "could introduce new features"); invites trust questions about an orientation tool | Display-only intensity scaling (linear/log/percentile-clip). Do NOT silently renormalize underlying data. |
| **Writing / editing / converting mzPeak or imzML ingestion** | "Can it also open my imzML?" / "save as" | Doubles surface area; conversion is a heavyweight upstream concern (OpenMS/Rust tools) | Read-only, `.mzpeak` only. Direct users upstream for conversion. |
| **Server-side processing / data upload** | "Big files are slow in-browser" | Defeats the privacy + static-hosting + shareability differentiator; needs infra/auth | Client-side with HTTP range reads; accept large-file perf limits honestly. |
| **3D / z-stack / multi-run imaging** | Some datasets are volumetric or multi-sample (SCiLS multi-sample) | Grid reconstruction + UI complexity explodes; spec doesn't define it | Single 2D imaging run in v1 (PROJECT.md). |
| **ROI drawing + region-averaged spectra** | MSiReader ROI extraction is popular | Polygon tooling + aggregation UI; analysis-leaning; not needed to make the format tangible | Single-pixel click → spectrum covers the orientation need. Could add later. |
| **MS-Numpress / auxiliary arrays / directory storage support** | Real files may use them | `mzpeakts` doesn't yet implement these; building them is reader work, not viewer work | Detect and emit a clear "unsupported encoding" error; extend the reader only if the operator's real file needs it. |

## Feature Dependencies

```
Load file (local / URL)
    └──requires──> ZIP + mzpeak_index.json parse  [mzpeakts]
                       └──requires──> per-spectrum read across point/chunked/delta layouts
                                          │
   Metadata + spectrum counts ◄──────────┤  (metadata path; independent of imaging)
                                          │
   Detect imaging + RECONSTRUCT PIXEL GRID  ◄── THE GATE
        │   (reads x/y from scan/spectrum cvParams: IMS:1000050 / IMS:1000051)
        │
        ├──requires──> TIC overview image
        │                   └──enhanced-by──> colormap + intensity scaling (linear/log/percentile)
        │
        ├──requires──> Ion image (m/z ± Da/ppm)
        │                   ├──enhanced-by──> colormap + intensity scaling
        │                   ├──enhanced-by──> sum-vs-max aggregation toggle
        │                   └──enhanced-by──> hover x/y + intensity readout
        │
        ├──requires──> Click pixel → spectrum (uPlot)
        │                   └──enhanced-by──> selected-m/z marker band
        │
        └──enables───> Pixel-grid diagnostics (rect/sparse, mapped vs total)

Shareable app-state URL ──enhances──> Load from URL  (only meaningful for URL-loaded files)
Mean/representative spectrum ──enhances──> "pick an m/z" workflow (needs full-file streaming)

Normalization-of-data ──conflicts──> "trustworthy orientation tool" (anti-feature; display-scaling only)
```

### Dependency Notes

- **Pixel-grid reconstruction is the universal gate.** TIC image, ion image, pixel-click spectrum, and grid diagnostics ALL require a working grid. It is also the project's highest-risk feature (no spec, no public example, coords unconfirmed). It must be its own early phase, validated against the operator's real file, BEFORE any image feature is attempted. Build the hover readout + grid diagnostics alongside it as correctness instruments.
- **Layout handling (point/chunked/delta) underpins everything spatial.** Both TIC (full-intensity sum) and ion image (windowed sum) iterate every pixel-spectrum's arrays. The per-spectrum extraction must be correct across all three layouts before images can be trusted. `mzpeakts` provides this; verify against the real file.
- **TIC before ion image.** TIC is a strictly simpler special case (whole-spectrum sum, no m/z window) and serves as the default overview. Getting TIC right validates the grid + per-spectrum-sum pipeline; the ion image then only adds the m/z window predicate. Order: grid → TIC → ion image.
- **Colormap + intensity scaling are shared, image-agnostic render utilities.** Build once; both TIC and ion image consume them. Percentile clipping is effectively mandatory because raw MSI images are hot-pixel dominated (METASPACE clips by default).
- **Metadata path is independent of imaging** and can ship in parallel with (or before) grid work — useful as the first end-to-end "file actually loads" milestone and a safe fallback view for non-imaging files.
- **Data-level normalization conflicts with the tool's identity.** An orientation/inspection tool that silently renormalizes data undermines trust; keep all scaling in the display layer only.

## MVP Definition

### Launch With (v1) — the committed scope

This is exactly PROJECT.md's Active list; the round-trip file → ion image → spectrum is the Core Value and must be correct.

- [ ] Load file (local picker + drag-drop) — entry point
- [ ] Load from URL (range-friendly) — shareable public datasets; structural differentiator enabler
- [ ] Parse ZIP + `mzpeak_index.json`, list entities — format-orientation core
- [ ] Metadata (file/instrument/run/sample) + spectrum counts — what implementers came for
- [ ] Detect imaging + reconstruct pixel grid — THE gate; build with hover readout + grid diagnostics as correctness instruments
- [ ] TIC overview image — default spatial view; validates grid + sum pipeline
- [ ] Ion image (m/z ± Da and ppm) — Core-Value deliverable
- [ ] Colormap + intensity scaling (linear/log + percentile clip) — usable images
- [ ] Click pixel → spectrum, selected m/z marked — closes the round-trip
- [ ] Handle point + chunked + delta layouts — files in the wild
- [ ] Graceful, actionable errors (distinct messages per failure class) — unstable format demands it

### Add After Validation (v1.x)

Add once the v1 round-trip is proven correct against the operator's real file.

- [ ] Sum-vs-max aggregation toggle for ion images — trigger: users want SCiLS/MSiReader parity on bin aggregation
- [ ] Shareable app-state URL (file + m/z + tol + colormap) — trigger: URL-loading is in active use and people want to share specific ions
- [ ] Mean/representative spectrum overview — trigger: users struggle to pick an m/z to image; gate on acceptable full-file streaming perf
- [ ] Raw-format inspector deep view (schema + CV-term mapping + per-array encoding) — trigger: HUPO-PSI implementers want structural detail beyond the entity list

### Future Consideration (v2+)

Defer until product-market fit (i.e., until the tool is actually used to evaluate mzPeak).

- [ ] MS-Numpress / auxiliary arrays / directory storage — defer: reader-layer work; only if the operator's real files need it
- [ ] Optical-image overlay (METASPACE-style) — defer: needs coordinate-registration data that may not exist in mzPeak yet
- [ ] Simple 2-channel ion overlay (lightweight co-localization) — defer: adds blending UI; verify single-ion flow first
- [ ] Multi-run / multi-sample selection — defer: PROJECT.md keeps single 2D run for v1

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Load file (local) | HIGH | LOW | P1 |
| Load from URL (range) | HIGH | MEDIUM | P1 |
| ZIP + manifest parse, list entities | HIGH | LOW | P1 |
| Metadata + spectrum counts | HIGH | MEDIUM | P1 |
| Pixel-grid reconstruction (THE gate) | HIGH | HIGH | P1 |
| TIC overview image | HIGH | MEDIUM | P1 |
| Ion image (m/z ± Da/ppm) | HIGH | MEDIUM-HIGH | P1 |
| Colormap + intensity scaling (lin/log/clip) | HIGH | LOW-MEDIUM | P1 |
| Click pixel → spectrum + marker | HIGH | MEDIUM | P1 |
| Point/chunked/delta layout handling | HIGH | MEDIUM | P1 |
| Graceful errors | HIGH | MEDIUM | P1 |
| Hover x/y + intensity readout | MEDIUM | LOW | P2 |
| Pixel-grid diagnostics | MEDIUM | LOW | P2 |
| Sum-vs-max aggregation toggle | MEDIUM | LOW | P2 |
| Raw-format inspector deep view | MEDIUM | MEDIUM | P2 |
| Shareable app-state URL | MEDIUM | LOW-MEDIUM | P2 |
| Mean/representative spectrum | MEDIUM | MEDIUM | P2 |
| Peak picking / annotation / segmentation | (anti) | HIGH | — (excluded) |
| Data-level normalization | (anti) | MEDIUM | — (excluded) |
| imzML ingestion / write / convert | (anti) | HIGH | — (excluded) |

**Priority key:**
- P1: Must have for launch (== the committed v1 scope)
- P2: Should have, add when possible (v1.x)
- P3: Nice to have, future consideration (none promoted here; see v2+ list)

## Competitor Feature Analysis

| Feature | METASPACE | MSiReader | SCiLS Lab | Cardinal | SeeMS | Our Approach |
|---------|-----------|-----------|-----------|----------|-------|--------------|
| Deployment | Cloud (upload + account) | MATLAB desktop | Licensed Windows app | R package | Windows desktop | **Browser, static, no upload, no account** |
| Ion image (m/z window) | Per annotation | Da/ppm tolerance, sum/max | Yes | `image()` | n/a (LC-MS) | m/z ± Da AND ppm, single ion |
| TIC overview | Yes | Yes | Yes | Yes | TIC chromatogram | Default spatial view |
| Pixel → spectrum | Yes | ROI/point spectra | Yes | Yes | Spectrum panel | Click pixel → uPlot spectrum + m/z marker |
| Intensity scaling | Hotspot clip, TIC/linear modes | Scrollbars, interpolation | Hotspot removal, normalizations | Contrast/normalize | Per-spectrum processing | Display-only: linear/log + percentile clip |
| Normalization (data) | TIC scaling | TIC/normalize | TIC/median/internal std | Multiple | n/a | **None (anti-feature)** — display scaling only |
| Annotation (m/z→molecule) | Core feature | Targeted lists | Databases | Via stats | n/a | **None (anti-feature)** |
| Segmentation/classification | — | — | Yes | Core feature | — | **None (anti-feature)** |
| Co-localization | ColocAI | ≤3-ion overlay | Yes | Yes | — | **None in v1** (maybe v2 2-channel) |
| Format inspection (on-disk) | No | No | No | No | mzML model | **Yes — differentiator** (manifest/schema/CV terms) |
| Read-only | Effectively | No (analysis) | No (analysis) | No | No | **Yes by design** |

## Sources

- METASPACE — [platform overview / microbial metabolites paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8401310/); [image_processing API: hotspot clip + TIC/scale-intensity modes](https://metaspace2020.readthedocs.io/en/latest/content/apireference/image_processing.html); [GitHub org](https://github.com/metaspace2020) — confidence HIGH for feature set, MEDIUM for exact UI behaviors.
- Cardinal (R) — [Bioinformatics 2015 paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC4495298/); [Cardinal v3 paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9980127/); [cardinalmsi.org](https://cardinalmsi.org/) — confidence HIGH (defines analysis ceiling / anti-features).
- MSiReader — [v1.0 JASMS paper (Da/ppm, sum-vs-max, colormap, ROI, ≤3-ion coloc)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5786496/); [original MATLAB interface paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3693088/) — confidence HIGH (closest feature analog).
- SCiLS Lab — [Bruker product page](https://www.bruker.com/en/products-and-solutions/mass-spectrometry/ms-software/scils-lab.html); [changelog (hotspot removal, normalizations)](https://download.scils.de/scilslab/changelog.html); [segmentation paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC6612871/) — confidence MEDIUM-HIGH.
- ProteoWizard SeeMS — [TIC behavior issue #2934](https://github.com/ProteoWizard/pwiz/issues/2934); [ProteoWizard HUPO09 poster](https://proteowizard.sourceforge.io/posters/proteowizard_hupo09_poster.pdf) — confidence MEDIUM (spectrum/TIC panel expectations).
- imzML coordinate convention — informed by PROJECT.md context (Schramm et al. 2012; IMS:1000050/51) — confidence MEDIUM; **the mzPeak imaging encoding is unconfirmed and must be validated against the operator's real file**.
- mzpeakts reader capabilities (point/chunked/delta done; Numpress/aux/directory not) — from PROJECT.md — confidence HIGH (operator-sourced).

---
*Feature research for: browser-based read-only mzPeak MSI explorer*
*Researched: 2026-06-03*
