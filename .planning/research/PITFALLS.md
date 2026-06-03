# Pitfalls Research

**Domain:** Browser-based MSI (mass spectrometry imaging) explorer for the mzPeak format (novel, unstable, no imaging spec)
**Researched:** 2026-06-03
**Confidence:** HIGH on the mzPeak encoding mechanics (verified against `HUPO-PSI/mzPeak/doc/index.md` and `mzpeakts` README); MEDIUM-LOW on the imaging coordinate layer (no spec, no public example — hypothesis only)

> Phase vocabulary used below: **scaffold/reader**, **imaging-model** (grid reconstruction), **ion-image**, **spectrum**, **polish**.

---

## Critical Pitfalls

### Pitfall 1: Hard-coding the imaging coordinate convention (THE #1 RISK)

**What goes wrong:**
The whole app is built assuming `IMS:1000050` (x) / `IMS:1000051` (y) live as scan-level cvParams, one spectrum per pixel — and then the operator's real `.mzpeak` puts coordinates somewhere else: as dedicated Parquet columns in `spectra_metadata.parquet`, in the `scan_settings` group, as a 3D triple (`IMS:1000052` z present), or encoded in the spectrum `id` string. The grid reconstruction silently produces garbage (all spectra map to (0,0), a 1×N strip, or a transposed image) and every downstream ion image is wrong while *looking* plausible.

**Why it happens:**
There is **no formal MSI section in the mzPeak spec** (verified: `doc/index.md` contains zero mentions of imaging, raster, position, or spatial coordinates). The imzML lineage makes `IMS:1000050/51` the obvious bet, but mzPeak is Parquet-columnar — it may well promote coordinates to first-class columns rather than cvParam rows. Treating a hypothesis as fact is the natural failure.

**How to avoid:**
- Build a dedicated, swappable **coordinate-extraction strategy layer** with an explicit interface (`extractCoordinates(metadata) -> {x,y,z?}[] | null`), not inline access in the grid builder.
- Implement *multiple* probes and pick the first that yields a sane grid: (a) scan cvParams `IMS:1000050/51/52`, (b) named Parquet columns (`position_x`, `x`, `scan_x`, etc.), (c) `scan_settings` group fields, (d) parse from spectrum `id`. Log which strategy won.
- **Validate the reconstructed grid before trusting it:** count unique (x,y) pairs == spectrum count? extents contiguous or explainably sparse? duplicates? Surface these as a "grid diagnostics" panel.
- Pin the convention against the operator's real file **first**, before building ion-image rendering on top.
- Treat 1-based vs 0-based, min-offset normalization, and pixel-size/unit cvParams (`IMS:1000046` pixel size x, etc.) as data to *read*, never to assume. Normalize to a 0-based dense index internally and keep the original coords for display.

**Warning signs:**
Ion image is a single row/column; image looks transposed vs the instrument's known scan direction; unique-coordinate count ≠ spectrum count; coordinate values are floats with units rather than small integers; max coordinate >> sqrt(spectrum count) (sparse) or coordinates start at 1.

**Phase to address:**
**imaging-model** owns it. But the *strategy interface* must be designed in **scaffold/reader** so the reader returns raw per-spectrum metadata in a form the strategies can inspect. Gate the whole milestone on "grid verified against operator file."

---

### Pitfall 2: Assuming sparse imaging is dense (missing pixels)

**What goes wrong:**
Code builds the image buffer as `width*height` and indexes by `(x - xmin) + (y - ymin)*width`, assuming every grid cell has a spectrum. Real MSI acquisitions are frequently **sparse** (irregular ROI, off-tissue pixels skipped, failed acquisitions). Result: either an out-of-bounds/holes-as-zero image where empty pixels are indistinguishable from genuine-zero-intensity pixels, or a crash when coordinate count < grid area.

**Why it happens:**
imzML "continuous vs processed" and full-raster assumptions carry over; demo files are often dense rectangles.

**How to avoid:**
- Maintain an explicit **presence mask** separate from intensity. Render missing pixels distinctly (transparent / NaN color), never as intensity 0.
- Build the pixel→spectrum index as a `Map<(x,y), spectrumIndex>`, not an implicit dense array; derive `width/height` from extents but never assume fill.
- Report `filled / total` cell ratio in grid diagnostics.

**Warning signs:**
Speckled/striped images; coordinate count noticeably less than `(xmax-xmin+1)*(ymax-ymin+1)`; a "background" that is suspiciously uniform zero.

**Phase to address:** **imaging-model** (mask construction); **ion-image** (mask-aware rendering).

---

### Pitfall 3: Silently mis-reading unsupported mzpeakts encodings (Numpress / aux arrays / directory storage)

**What goes wrong:**
The operator's file uses **MS-Numpress linear (MS:1002312)**, **auxiliary arrays**, or **directory storage** — all explicitly *not implemented* in `mzpeakts` (verified). The reader either throws an opaque error, returns empty `dataArrays`, or (worst case) returns mis-decoded bytes as if they were valid intensities. The user sees blank or nonsense ion images with no idea why.

**Why it happens:**
`mzpeakts` is work-in-progress; the app builds an imaging layer on top and assumes the reader handles whatever it's given.

**How to avoid:**
- **Detect and fail loudly at load.** Before rendering, inspect the manifest / Parquet metadata: check `chunk_encoding` values, `spectrum_array_index` `buffer_format`/encoding CV terms, presence of `.auxiliary_arrays`, and ZIP-vs-directory storage. If any unsupported encoding is present, show a precise, named error ("This file uses MS-Numpress (MS:1002312), which the bundled reader does not yet decode") rather than rendering wrong data.
- Add a capability check: enumerate which encodings/layouts each loaded file uses and display them in the metadata panel.
- Never let a decode path return all-zeros silently; distinguish "decoded, genuinely zero" from "could not decode."

**Warning signs:**
`chunk_encoding` ∉ {none/basic, delta}; `MS:1002312` in array index; `auxiliary_arrays` column populated; manifest points at a directory layout; spectra return empty `dataArrays` for files that clearly have data.

**Phase to address:** **scaffold/reader** (capability detection + loud failure). Re-check in **spectrum** phase when actually decoding arrays.

---

### Pitfall 4: m/z window math wrong — ppm vs Da, profile vs centroid, sum vs max

**What goes wrong:**
The ion image is the core deliverable and three independent bugs converge here: (1) tolerance given in ppm but applied as Da (or vice versa) → window 1000× too wide/narrow; (2) treating **profile** spectra like **centroid** spectra — summing all profile samples in a window over-counts vs picking the apex, or a too-narrow window on profile data lands between samples and returns ~0; (3) choosing sum vs max vs apex-area inconsistently so images aren't comparable. Net effect: blank, saturated, or quantitatively meaningless ion images.

**Why it happens:**
ppm↔Da conversion (`Δm = mz * ppm / 1e6`) is easy to drop a factor on; profile/centroid distinction is invisible until you reason about it; MSI literature uses different aggregation conventions.

**How to avoid:**
- Convert ppm to an absolute Da window **at the chosen center m/z** explicitly and unit-test it (e.g. 500 m/z @ 10 ppm = 0.005 Da).
- Detect profile vs centroid: check spectrum `MS:1000128` (profile) / `MS:1000127` (centroid) cvParam, or infer from point spacing. For profile, integrate (sum × spacing) or take apex within window; for centroid, sum the peaks in window. Make the aggregation explicit and labeled in the UI.
- Default to **sum within window**, expose max/apex as options, and label the colorbar with the chosen statistic.
- Validate against the TIC image (TIC should always render non-blank if any data exists — it's the smoke test).

**Warning signs:**
Ion image blank for an m/z you know is present; TIC fine but every targeted image blank (window too narrow / ppm-as-Da); images saturated everywhere (window too wide / Da-as-ppm); changing profile/centroid handling changes image by orders of magnitude.

**Phase to address:** **ion-image** owns the aggregation; **spectrum** phase confirms profile/centroid detection.

---

### Pitfall 5: Loading the whole MSI file into memory → browser OOM

**What goes wrong:**
A real MSI run is thousands–hundreds of thousands of spectra. Eagerly decoding every spectrum's m/z+intensity arrays into JS objects (or holding all Arrow tables fully materialized) blows the browser tab's memory and crashes — especially on the main thread, freezing the UI first.

**Why it happens:**
The simplest code path is `for each spectrum: getSpectrum(i)` and cache it. Parquet+Arrow makes random access *possible* but the app has to choose to use it.

**How to avoid:**
- Exploit Parquet/Arrow random access and HTTP range requests: for an ion image, you need per-spectrum *intensity within an m/z window*, not full spectra in JS. Slice columns; keep data in Arrow/typed-array form, not boxed JS arrays.
- Compute ion images by streaming/chunked passes over the data column, accumulating into a single `Float32Array` of size `gridCells`. Free intermediate Arrow vectors as you go.
- Only fully materialize **one** spectrum at a time (for the click-to-spectrum view).
- Cap and stream: process in batches with `gc`-friendly scoping; avoid retaining references in closures/React state.

**Warning signs:**
Tab memory climbs linearly with spectrum count; `getSpectrum` cache grows unbounded; loading a large file works in dev (small sample) but kills the tab on the real file; profiler shows large retained Arrow Tables.

**Phase to address:** **scaffold/reader** (streaming/range-friendly access pattern); **ion-image** (single-buffer accumulation).

---

### Pitfall 6: Ion-image recompute on the main thread → frozen UI; plus parquet-wasm bundle/init cost

**What goes wrong:**
Each m/z change recomputes the whole ion image by scanning all spectra on the main thread → the tab locks for seconds, sliders feel dead. Separately, **parquet-wasm** + apache-arrow is a large bundle and WASM must initialize before any read; if init is synchronous/unguarded the first interaction stalls or errors.

**Why it happens:**
Canvas + React makes it tempting to compute in a render/effect; WASM init is async and easy to mis-sequence.

**How to avoid:**
- Run ion-image recompute in a **Web Worker**; transfer typed arrays (transferable) back to the main thread for Canvas. Debounce m/z/tolerance changes.
- Initialize parquet-wasm once, await it explicitly before enabling file load; show an init progress state. Lazy-load/code-split the WASM+Arrow chunk so the initial page is light.
- Render TIC immediately after grid build (one pass) so the user sees *something* fast; targeted ion images computed on demand.

**Warning signs:**
Dragging the m/z slider freezes the page; first file load throws "wasm not initialized"; Lighthouse/main-bundle size dominated by wasm/arrow; long task warnings in the performance panel.

**Phase to address:** **scaffold/reader** (WASM init sequencing, code-split); **ion-image** (worker offload, debounce).

---

### Pitfall 7: Intensity dynamic range — images look blank without log/percentile scaling

**What goes wrong:**
MSI intensities span several orders of magnitude with a few hot pixels. Linear-scaled to a fixed [min,max] colormap, the image is almost entirely the bottom color (looks blank/empty) and the user concludes the m/z isn't present — when it is.

**Why it happens:**
Naive `value/max` mapping; one outlier pixel sets max and crushes everything else.

**How to avoid:**
- Default to **percentile clipping** (e.g. clip at 1st–99th percentile) and offer **log** (or asinh) scaling, plus a manual range. This is table-stakes for MSI viewers (Cardinal, METASPACE behavior).
- Compute and show a histogram of intensities so the user understands the distribution.
- Make "blank because scaling" impossible to confuse with "blank because absent" by showing the underlying value range / nonzero-pixel count.

**Warning signs:**
Image is one flat color but max intensity in the panel is clearly nonzero; switching to log/percentile suddenly reveals structure.

**Phase to address:** **ion-image** (scaling modes) — must ship in the same phase as basic rendering, not deferred to polish, or every early image looks broken.

---

### Pitfall 8: Y-axis orientation, aspect ratio, and non-square pixels

**What goes wrong:**
Canvas y grows downward; MSI/instrument coordinate y may grow upward → vertically flipped image. And many MSI acquisitions have **non-square pixels** (e.g. 50 µm × 100 µm) carried by separate pixel-size-x/-y cvParams; ignoring them gives a geometrically wrong (squashed/stretched) image even when intensities are correct.

**Why it happens:**
Canvas convention vs lab convention mismatch; pixel size assumed isotropic.

**How to avoid:**
- Decide and document a canonical orientation; offer a flip-Y toggle. Validate against the operator's expected sample image.
- Read pixel-size-x/y (`IMS:1000046`/`IMS:1000047`) and scale Canvas draw accordingly; default to square only when sizes are absent/equal. Show physical extent (µm) on axes.

**Warning signs:**
Known tissue feature is upside-down; circular sample looks elliptical; aspect looks wrong vs the operator's reference.

**Phase to address:** **imaging-model** (read pixel size, orientation metadata); **ion-image**/**polish** (flip toggle, axis scaling).

---

### Pitfall 9: Numerical reconstruction bugs — delta decoding, null marking, zero-run, float precision

**What goes wrong:**
The chunked layout requires reconstructing arrays from encoded forms, and the spec has subtle, easy-to-get-wrong rules (all verified in `doc/index.md`):
- **Delta:** "the start point is excluded from chunk values"; nulls are "encoded as null and treated as 0.0 for computing the next delta" — off-by-one on the seed value or mishandling null-as-0 corrupts the whole array.
- **Null marking:** reconstruct singleton points using the `mz_delta_model` (`δmz ~ β₀ + β₁·mz + β₂·mz²`) or the "second median" delta; parallel null intensities → 0. Skipping this leaves `null` m/z values that break binary search.
- **Zero-run stripping:** "3+ zeros reduced to first and last positions" must be re-expanded for profile data, or the spectrum's m/z axis is wrong.
- **Float precision:** m/z is **float64**; doing the m/z-window **binary search** in float32 (or building bins with accumulated float error) mis-selects boundary samples.

**Why it happens:**
These are spec details, not obvious from the data; the reader (`mzpeakts`) implements delta but not the more advanced paths, so the imaging layer may hit unreconstructed data.

**How to avoid:**
- Keep m/z in `Float64Array` end-to-end; do window selection by `lowerBound/upperBound` on the sorted float64 m/z, not on rebuilt float32 bins.
- If the file uses null marking / zero-run stripping and the bundled reader doesn't reconstruct them, **detect and fail loudly** (ties to Pitfall 3) rather than searching arrays with embedded nulls.
- Unit-test delta reconstruction (seed excluded, null=0) and ppm-window selection against a tiny synthetic array with known answers.

**Warning signs:**
Spectrum m/z axis has gaps or `null`/NaN; reconstructed array length ≠ expected; binary search returns wrong index near bin edges; first sample of every chunk is off.

**Phase to address:** **spectrum** (reconstruction correctness + binary search); detection hook in **scaffold/reader**.

---

### Pitfall 10: ZIP is *uncompressed* but still a ZIP — and Arrow memory ownership

**What goes wrong:**
mzPeak is an **uncompressed ZIP of Parquet files**. Two traps: (a) assuming "uncompressed" means "just concatenated" and skipping `zip.js` — you still must parse the ZIP central directory to find each Parquet entry's offset/length; (b) Arrow/parquet-wasm vectors hold WASM-linear-memory buffers that must be explicitly freed — leaking them defeats the streaming design and OOMs anyway.

**Why it happens:**
"Uncompressed" misleads; JS Arrow memory ownership (wasm `free`) is non-obvious.

**How to avoid:**
- Use `zip.js` to read the central directory; uncompressed entries let you do HTTP **range reads** straight to a Parquet entry (a real win — exploit it), but you still parse ZIP structure first.
- Explicitly free Arrow/parquet-wasm objects after use; scope materialized tables tightly; don't stash them in React state.

**Warning signs:**
Reader fails on valid files because ZIP dir wasn't parsed; memory grows despite "streaming"; wasm heap grows monotonically.

**Phase to address:** **scaffold/reader**.

---

### Pitfall 11: UX — no feedback during parse, and "not imaging" vs "unsupported" conflated

**What goes wrong:**
Large file parsing gives no progress → user thinks the app hung and reloads (losing work, possibly mid-range-fetch). And the app collapses two distinct outcomes into one generic error: a perfectly valid **non-imaging** mzPeak (LC-MS) vs an imaging file using an **unsupported encoding** vs a **truly broken** file. The user can't tell whether to try a different file, file a bug, or convert upstream.

**Why it happens:**
Progress plumbing is extra work; error taxonomy is an afterthought.

**How to avoid:**
- Show staged progress: ZIP index → manifest parsed → metadata loaded → grid reconstructed → TIC rendered. Each stage a visible step.
- Distinct, named outcomes: "Loaded, but no spatial coordinates found — this looks like non-imaging (LC-MS) data" vs "Imaging file, but uses unsupported encoding X" vs "File could not be parsed (corrupt/format mismatch)." Each with a different suggested action.

**Warning signs:**
Users reload during parse; bug reports say "it just shows an error"; can't distinguish your three failure classes from logs.

**Phase to address:** **scaffold/reader** (error taxonomy + progress) for load-time; **imaging-model** for the "not imaging" verdict; **polish** for refinement.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code `IMS:1000050/51` coordinate access inline | Fast first ion image | Total rework when real file differs; wrong images that look right | Never — wrap in a strategy interface from day one |
| Eagerly cache every `getSpectrum` result | Snappy re-render | OOM on real files | Only for the single currently-viewed spectrum |
| Assume dense full-raster grid | Simple buffer indexing | Wrong/holey images on sparse ROIs | Acceptable only for a confirmed-dense demo, never as the model |
| Linear-only intensity scaling | Less UI | Every image looks blank → users distrust tool | Never ship without log/percentile |
| Compute ion image on main thread | No worker plumbing | Frozen UI on real files | Acceptable for tiny demo file behind a size guard |
| Treat decode failure as zero intensity | No error path | Silent wrong science | Never — fail loudly |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `mzpeakts` reader | Assume it decodes all encodings | Capability-detect; fail loudly on Numpress/aux/directory (verified unimplemented) |
| parquet-wasm | Read before WASM init; ship in main bundle | Await init explicitly; code-split the wasm+arrow chunk |
| apache-arrow | Hold tables in JS state | Free wasm-backed vectors; keep typed arrays only |
| zip.js | Skip it because ZIP is "uncompressed" | Still needed to parse central directory; enables range reads |
| Canvas 2D | Use lab y-up orientation directly | Flip y to canvas convention; offer toggle |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-file materialization | Memory linear in spectra | Stream columns, single accumulator buffer | ~10⁴–10⁵ spectra |
| Main-thread ion recompute | Slider freezes UI | Web Worker + debounce | Any non-trivial file |
| Boxed JS arrays for m/z/intensity | GC churn, memory bloat | Float64/Float32 typed arrays | Mid-size files |
| Unbounded spectrum cache | Memory never released | Cache size 1 (current spectrum) | Browsing many pixels |
| Re-decoding for every m/z change | Each slider tick re-reads file | Cache per-spectrum window data or pre-extract intensity matrix in worker | Interactive use |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Loading arbitrary URL into wasm parser with no guard | Malformed file crashes tab / hangs | Bound parse work; wrap in worker; size/type checks at boundary |
| Trusting file-supplied dimensions to size a buffer | Huge width×height from bad coords → OOM allocation | Sanity-cap grid dimensions; validate against spectrum count before allocating |
| (Privacy is a feature) accidental upload via analytics/CDN | Sensitive sample data leaves the browser | Enforce fully client-side; no telemetry that includes file content |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blank ion image from linear scaling | User thinks m/z absent | Default percentile/log scaling + nonzero-pixel count |
| No parse progress | User reloads, thinks it hung | Staged progress indicator |
| Generic "error loading file" | User can't act | Distinguish non-imaging / unsupported-encoding / corrupt |
| Missing pixels drawn as zero | User reads holes as real signal | Render presence-mask gaps distinctly |
| No statistic label on colorbar | Misinterprets sum vs max image | Label aggregation + units + scale mode |
| Flipped/squashed image | Misorients tissue | Flip-Y toggle, pixel-size aspect, µm axes |

## "Looks Done But Isn't" Checklist

- [ ] **Ion image:** renders for demo file — but verify it's not transposed/flipped and unique-coord count == spectrum count against the operator's real file
- [ ] **Coordinate extraction:** "works" — but verify it tried multiple strategies and reports which won, handles 1-based and min-offset
- [ ] **m/z window:** returns an image — but verify ppm↔Da conversion with a unit test and profile-vs-centroid handling
- [ ] **Reader:** opens the file — but verify it detects and *refuses* Numpress / aux arrays / directory storage instead of silent zeros
- [ ] **Intensity scaling:** has a colormap — but verify log/percentile present so real images aren't blank
- [ ] **Memory:** fine in dev — but verify on the real large file (no unbounded cache, Arrow freed, worker offload)
- [ ] **Sparse data:** image fills — but verify missing pixels are distinct from zero-intensity
- [ ] **Spectrum view:** shows a trace — but verify m/z has no residual nulls/NaN from null-marking and selected window is marked
- [ ] **Errors:** shows messages — but verify the three failure classes are distinguishable

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Coordinate convention wrong (Pitfall 1) | HIGH if not abstracted; LOW if strategy layer exists | Add/swap a strategy probe; re-validate grid; no rework if interface was clean |
| OOM on real file | MEDIUM | Move to streaming/worker accumulation; cap caches; free Arrow |
| Silent wrong decode (Numpress) | HIGH (wrong science shipped) | Add capability detection + loud failure; audit any prior outputs |
| Blank images from scaling | LOW | Add percentile/log scaling modes |
| Transposed/flipped image | LOW | Add flip-Y + axis-swap toggles; pin against reference |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Coordinate convention (TOP RISK) | imaging-model (interface in scaffold/reader) | Grid validated against operator's real file; correct strategy logged |
| 2. Sparse-as-dense | imaging-model + ion-image | filled/total ratio shown; gaps render distinctly |
| 3. Unsupported encodings silent | scaffold/reader | Loads a Numpress/aux/dir file → named refusal, not zeros |
| 4. m/z window (ppm/profile/aggregation) | ion-image (+ spectrum) | Unit test ppm→Da; profile/centroid detected; TIC smoke test |
| 5. OOM | scaffold/reader + ion-image | Real large file loads without tab crash; bounded memory |
| 6. Main-thread freeze + wasm init | scaffold/reader + ion-image | Slider stays responsive; init gated; bundle code-split |
| 7. Dynamic range / blank images | ion-image | Log + percentile default; histogram shown |
| 8. Orientation / aspect / non-square | imaging-model + ion-image/polish | Matches reference image; pixel-size respected |
| 9. Numerical reconstruction + float64 search | spectrum (detect in reader) | Delta/null/zero-run unit tests; float64 binary search |
| 10. ZIP uncompressed + Arrow ownership | scaffold/reader | Central dir parsed; range reads work; wasm heap stable |
| 11. UX feedback + error taxonomy | scaffold/reader + imaging-model + polish | Progress stages visible; 3 failure classes distinct |

## Sources

- HUPO-PSI/mzPeak `doc/index.md` — encodings (delta MS:1003089, Numpress MS:1002312 "not compatible with null marking", zero-run stripping ≥3, null marking + `mz_delta_model` δmz ~ β₀+β₁·mz+β₂·mz², point vs chunked layout, `spectrum_array_index` buffer_format/units, sorting_rank, float64 m/z, auxiliary_arrays). Verified 2026-06-03. **HIGH**, and confirmed: **no imaging/spatial section exists**.
- HUPO-PSI/mzpeakts README — implemented: point/chunked, basic+delta, ZIP; **not** implemented: Numpress/opaque transforms, auxiliary arrays, directory storage. API `MzPeakReader.fromUrl`/`getSpectrum`/`Spectrum`. Verified 2026-06-03. **HIGH**.
- imzML coordinate convention (Schramm et al. 2012; PSI IMS ontology): `IMS:1000050/51/52` x/y/z, integer 1-based pixel indices in scan cvParams, pixel-size cvParams. Used as the *hypothesis*, not confirmed for mzPeak. **MEDIUM-LOW** for applicability.
- MSI viewer conventions (Cardinal, METASPACE) for percentile/log scaling and sparse handling — domain knowledge. **MEDIUM**.

---
*Pitfalls research for: browser-based mzPeak MSI explorer*
*Researched: 2026-06-03*
