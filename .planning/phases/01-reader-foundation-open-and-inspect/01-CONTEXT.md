# Phase 1: Reader Foundation + Open-and-Inspect — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** Operator decisions (captured directly; discuss-phase skipped — decisions were locked during project init)

<domain>
## Phase Boundary

This phase delivers the **non-imaging foundation**: a deployable Vite + React + TypeScript app that opens a `.mzpeak` file (local or URL), parses the ZIP + `mzpeak_index.json` manifest via the vendored `mzpeakts` reader, displays file-level metadata and per-file stats, lets the user view a single reconstructed spectrum, and **fails loudly** on unsupported encodings. It proves the vendored reader works in-browser — **independent of the imaging coordinate risk**, which is Phase 2.

In scope (this phase): project scaffold, vendor `mzpeakts`, file/URL loading with staged progress, manifest + metadata + stats display, single-spectrum view (point + chunked/delta), capability/encoding detection, fail-loud errors, the Codex review harness `tools/codex_review.sh` (bootstrap).

Out of scope (later phases): pixel-grid reconstruction (P2), TIC image + pixel→spectrum (P3), ion image + scaling (P4), Web Worker offload + error taxonomy + Pages deploy hardening (P5). No imaging-coordinate work here.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Stack & tooling
- Vite 8 + React 19 + TypeScript ~5.9 (TS pinned to ~5.9, NOT latest 6.x — toolchain lag, per STACK.md).
- ESLint ~9 (not 10) + Prettier 3.8.x. Vitest 4.x for unit tests; Playwright for the browser round-trip (set up here, exercised more later).
- uPlot 1.6.x for spectra; Canvas 2D for images (images are P3+, but the spectrum plot lands here).
- Package manager: npm (lockfile committed).

### Reader (vendoring)
- Reuse `HUPO-PSI/mzpeakts` — do NOT reimplement Parquet/ZIP/Arrow parsing.
- Vendor via **git submodule + `file:` install** (Option A from STACK.md). The publishable package lives in the repo's `/lib` subdir (`mzpeakts@0.1.0`, builds via `tsc && vite build`, depends on a vendored parquet-wasm `.tgz`). CI must build the vendored lib.
- Keep a single import site (`src/reader/`) wrapping `MzPeakReader` — the only module that touches the unstable format. Drop to an in-tree source copy only if reader-internal edits become necessary (defer).
- Reader API to use: `MzPeakReader.fromUrl(path)`; metadata is loaded eagerly (Arrow table; `spectrumMetadata.get(i)`, `numSpectra`, `dataPointCount()`); signal data lazily (`spectrumData()` → seekable `DataArraysReader`). `getSpectrum(index)` returns `{ id, index, dataArrays, precursors, selectedIons }`.

### Loading
- Local: file picker + drag-and-drop (File/Blob). URL: range-request friendly (works against upstream-hosted demo files, e.g. `small.mzpeak`).
- Staged progress feedback at each stage: ZIP index → manifest → metadata loaded. No silent long pause (LOAD-03).
- `mzpeakts.fromUrl` is the URL path; for local File, adapt to the reader's blob/bytes entry (confirm the reader's local-file entry point; if only `fromUrl` exists, wrap a File via `URL.createObjectURL` or extend the reader minimally).

### Metadata & stats
- Manifest: list each Parquet entity (name, entity_type, data_kind) from `mzpeak_index.json` (FMT-01).
- File-level metadata (from Parquet key-value JSON): file_description, instrument_configuration_list, software_list, run, sample_list (FMT-02).
- Stats: number of spectra/entities, m/z range if available, MS levels present (FMT-03).
- Capability readout: point vs chunked layout, encodings present (from `spectrum_array_index` / `chunk_encoding`), and **whether imaging data is detected** — a boolean probe per imaging-spec v0.3: presence of the promoted `scan` columns `IMS_1000050_position_x` / `IMS_1000051_position_y` (authoritative) and/or `mzpeak_index.json.metadata.imaging.is_imaging` (discovery). Full grid reconstruction is P2. Also note per-spectrum `MS_1000525_spectrum_representation` (profile/centroid) for later signal-file routing (DATA-03, P3). See `.planning/research/IMAGING-SPEC-ALIGNMENT.md`. (FMT-04)

### Single spectrum view
- User selects a spectrum by index → reconstructed m/z + intensity arrays plotted in uPlot (DATA-01).
- Both **point** layout and **chunked layout with delta encoding (MS:1003089)** must reconstruct correctly. m/z is float64 — keep precision.

### Fail-loud (DATA-02)
- Detect unsupported encodings/storage at load: **MS-Numpress (MS:1002312)**, **auxiliary arrays**, **directory storage** — `mzpeakts` does NOT implement these. On detection, surface a **named, actionable error**; NEVER render silent zeros as if real data.
- Distinguish "unsupported encoding/feature" from "corrupt/unreadable" (full three-way taxonomy is finalized in P5, but the unsupported-encoding class is required here).

### Process
- Bootstrap `tools/codex_review.sh` supporting `round1 <phase>` (plan) and `round2 <phase> --sha <sha>` (diff) per PROC-01 (operator-mandated; `codex` CLI at `/opt/homebrew/bin/codex`). This phase's own plan + diff get reviewed with it.

### UI (lightweight contract — full UI-SPEC deferred to P3/P4)
- Single-page layout: a drop/loader zone → after load, a two-area view: left = metadata + manifest + stats + capabilities panel; right = spectrum panel (index selector + uPlot). Plain, legible, no design system yet. Errors shown as a prominent, named banner. This is plumbing-grade UI; visual polish + colormaps come with the image phases.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project research (already produced — read these; they are the substitute for a phase-research pass)
- `.planning/research/SUMMARY.md` — synthesized findings, build order, watch-outs
- `.planning/research/STACK.md` — exact versions, vendoring of mzpeakts, WASM/Vite serving, no COOP/COEP, GitHub Pages deploy
- `.planning/research/ARCHITECTURE.md` — 4-layer design, reader reality (eager metadata / lazy data / extractXIC), build order, worker boundary
- `.planning/research/PITFALLS.md` — fail-loud on unsupported encodings, m/z math, delta/null-marking reconstruction, browser memory

### Format & reader (external)
- https://github.com/HUPO-PSI/mzPeak — `doc/index.md`: ZIP+Parquet layout, `mzpeak_index.json`, point vs chunked, `spectrum_array_index`, metadata groups, encodings (delta MS:1003089, Numpress MS:1002312)
- https://github.com/HUPO-PSI/mzpeakts — reader API + what is/isn't implemented; demo files (`small.mzpeak`, `small.chunked.mzpeak`, `small.numpress.mzpeak`, `has_uv.mzpeak`) usable as test fixtures
- `CLAUDE.md` — PROC-01 convention + format reference
</canonical_refs>

<specifics>
## Specific Ideas

- Use the upstream demo files as Phase 1 test fixtures: `small.mzpeak` (point), `small.chunked.mzpeak` (chunked/delta) for DATA-01; `small.numpress.mzpeak` to prove DATA-02 fail-loud; `has_uv.mzpeak` for wavelength-spectrum metadata edge handling. Vendor a few into `test/data/` or load by URL.
- Walking Skeleton target (this is Phase 1 of a new project, MVP mode): thinnest end-to-end slice = scaffold + routing/app shell + load a REAL `.mzpeak` (one of the demo files) + read+display REAL metadata + one REAL user interaction (select a spectrum index → see its plotted arrays) + a dev/preview deployment. Produce `SKELETON.md`.
- Capability/encoding detection should read `chunk_encoding` CURIEs and the `spectrum_array_index` to decide supported vs unsupported, rather than failing only at array-decode time.
</specifics>

<deferred>
## Deferred Ideas

- Imaging coordinate extraction / pixel grid — Phase 2 (the gate).
- Any spatial image (TIC, ion image), colormaps, intensity scaling — Phases 3–4.
- Web Worker offload, full 3-class error taxonomy, production GitHub Pages deploy hardening — Phase 5.
- In-memory full-column cache / lazy row-group projection — v2 (perf).
</deferred>

---

*Phase: 01-reader-foundation-open-and-inspect*
*Context captured: 2026-06-03 (operator decisions; discuss-phase skipped)*
