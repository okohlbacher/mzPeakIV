---
phase: 01-reader-foundation-open-and-inspect
verified: 2026-06-03T09:50:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "User can open a remote .mzpeak from a URL (range-request friendly) — e2e/remote-url.spec.ts asserts ≥1 Range:bytes= header on the .mzpeak URL, proving HttpRangeReader is active"
  gaps_remaining: []
  regressions: []
---

# Phase 1: Reader Foundation + Open-and-Inspect Verification Report

**Phase Goal:** A user can open any .mzpeak (imaging or not) from a local file or a URL, see the manifest, file-level metadata, and per-file stats, and view a single spectrum — proving the vendored reader works in-browser independently of the coordinate-grid risk.
**Verified:** 2026-06-03T09:50:00Z
**Status:** passed
**Re-verification:** Yes — after LOAD-02 gap closure

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | User can open a local .mzpeak via file picker and drag-drop with staged progress | ✓ VERIFIED | `src/reader/openFile.ts`, `FileLoader.tsx` with `onDrop`, `ProgressBar.tsx`; e2e `local-file.spec.ts` tests 1+2 assert file picker and drag-drop; staged labels asserted in test |
| 1b | User can open a remote .mzpeak from a URL via HTTP Range requests | ✓ VERIFIED | `openUrl.ts` wraps `MzPeakReader.fromUrl`; `e2e/remote-url.spec.ts` intercepts all network requests and asserts `rangeRequests.length > 0` and every captured header contains `Range:bytes=` — HttpRangeReader confirmed active. 5/5 Playwright tests pass. |
| 2 | User sees manifest (entities) + 5 file-level metadata groups | ✓ VERIFIED | `MetadataPanel.tsx` renders all 5 `MetaGroup` elements (fileDescription, instrumentConfigurations, software, run, samples); manifest table with `manifest-row` test IDs; e2e asserts `file-metadata` and `manifest-row` visible |
| 3 | User sees per-file stats: spectrum/entity counts, m/z range, MS levels, capabilities incl. imaging-detected | ✓ VERIFIED | `StatsPanel.tsx` renders counts, mzRange (null → explicit "not available" text), msLevels, representationCounts; `CapabilitiesPanel.tsx` renders layout, encodings, imaging-detected boolean; 27 Vitest tests in `stats.test.ts`; e2e asserts `stats-panel`, `capabilities-panel`, `cap-is-imaging` |
| 4 | User can select any spectrum by index and see reconstructed m/z + intensity arrays (point AND chunked-with-delta) | ✓ VERIFIED | `SpectrumPanel.tsx` selector calls `selectSpectrum` → `getSpectrumArrays`; uPlot mounted via `useRef`; 10 tests in `arrays.test.ts` prove Float64Array m/z, strictly ascending, nonzero signal, float64 precision, cross-layout equivalence for both small.mzpeak and small.chunked.mzpeak |
| 5 | Opening a file with unsupported encoding produces a named, actionable error and never renders silent zeros | ✓ VERIFIED | `capability.ts` `detectUnsupported()` checks MS:1002312/MS:1002313/MS:1002314 (Numpress), auxiliary_arrays, and directory storage; `errors.ts` defines `UnsupportedEncodingError` vs `CorruptFileError`; `openUrl.ts` capability gate throws before returning; `store.ts` `classifyError()` routes to structured `StoreError`; `ErrorBanner.tsx` class-specific render; 14 tests in `capability.test.ts` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | Vite 8 + React + wasm + top-level-await, GitHub-Pages base | ✓ VERIFIED | Contains `wasm()`, `topLevelAwait()`, `react()` plugins; explicit comment against COOP/COEP/singlefile; hashed WASM enforced in build config |
| `src/reader/openUrl.ts` | URL → MzPeakReader.fromUrl wrapper, single mzpeakts import site | ✓ VERIFIED | Imports `{ MzPeakReader }` from `"mzpeakts"`, runs `capabilityGate` after open; grep confirms only this file imports mzpeakts |
| `src/reader/openFile.ts` | Local File/Blob → MzPeakReader entry | ✓ VERIFIED | Calls `openBlob` from openUrl (which IS the mzpeakts boundary); `File extends Blob` — no createObjectURL hack; 2 unit tests pass |
| `src/reader/types.ts` | Plain UI-facing types — SpectrumArrays, FileMeta, ManifestEntry, Capabilities, SpectrumRepresentation | ✓ VERIFIED | All 7 types defined; no Arrow/bigint types; `SpectrumMeta.representation` field present (R-01a) |
| `src/reader/arrays.ts` | getSpectrumArrays returns Float64Array m/z + Float32Array intensity | ✓ VERIFIED | Float64Array.from() preserves precision; centroid fallback; fail-loud for no signal |
| `src/reader/capability.ts` | Pre-render capability detection refusing Numpress/aux/directory | ✓ VERIFIED | Contains `MS:1002312`, `MS:1002313`, `MS:1002314` checks; auxiliary_arrays check; directory storage check |
| `src/reader/errors.ts` | Named error taxonomy UnsupportedEncodingError vs CorruptFileError | ✓ VERIFIED | Both classes with proper prototype chain; `ReaderErrorClass` discriminator |
| `src/reader/stats.ts` | FileStats + Capabilities computation from eager metadata | ✓ VERIFIED | `computeStats` returns numSpectra, numEntities, mzRange (null or [n,n]), msLevels, representationCounts; `computeCapabilities` with isImaging probe |
| `src/ui/FileLoader.tsx` | File picker + drag-drop + URL input loader zone | ✓ VERIFIED | `<input type=file>`, `onDrop` handler, URL form; calls `store.openFile` and `store.openUrl` |
| `src/ui/ProgressBar.tsx` | Staged step-progress bar (LOAD-03) | ✓ VERIFIED | Labeled steps for all 4 stages; `data-testid="stage-label-zip-index"` asserted in e2e |
| `src/ui/MetadataPanel.tsx` | Manifest + 5 metadata groups render | ✓ VERIFIED | All 5 MetaGroup calls; manifest-row table |
| `src/ui/StatsPanel.tsx` | Counts + mzRange + MS levels + representation breakdown | ✓ VERIFIED | All fields rendered; null branch shows "m/z range: not available" |
| `src/ui/CapabilitiesPanel.tsx` | Layout / encodings / imaging-detected readout + unsupported findings | ✓ VERIFIED | All fields rendered; unsupported list shown when non-empty |
| `src/ui/ErrorBanner.tsx` | Class-specific error render (unsupported vs corrupt) | ✓ VERIFIED | Different background color, message, and findings list per class |
| `src/ui/SpectrumPanel.tsx` | uPlot chart mounted via useRef, spectrum-index selector | ✓ VERIFIED | `useRef<HTMLDivElement>`, `new uPlot(...)`, `selectSpectrum` wired; e2e asserts canvas visible |
| `src/state/store.ts` | zustand store with staged LoadStage + openUrl + openFile + selectSpectrum | ✓ VERIFIED | All actions wired; `yieldFrame()` for observable stage transitions; `classifyError()` for structured errors |
| `tools/codex_review.sh` | PROC-01 review harness (round1/round2) | ✓ VERIFIED | Executable; contains round1/round2 arg parsing; both log files exist in phase dir |
| `e2e/skeleton.spec.ts` | E2E: URL load → metadata → spectrum → uPlot canvas render | ✓ VERIFIED | Passes in 5/5 e2e suite |
| `e2e/local-file.spec.ts` | E2E: file picker + drag-drop + staged progress + mzRange state (R-02a,e,d) | ✓ VERIFIED | 3 tests covering picker, drag-drop, mzRange visibility |
| `e2e/remote-url.spec.ts` | E2E: URL load via HTTP Range requests — LOAD-02 gap closure | ✓ VERIFIED | Intercepts all network requests during URL load; asserts `rangeRequests.length > 0` and every entry contains `Range:bytes=`; passes in 5/5 e2e suite (Playwright test 4 of 5) |
| `dist/assets/*.wasm` | WASM shipped as hashed asset (not inlined) | ✓ VERIFIED | `dist/assets/parquet_wasm_bg-fnSaorAQ.wasm` (~6.5 MB uncompressed) present after build |
| `.planning/phases/01-reader-foundation-open-and-inspect/SKELETON.md` | Architectural backbone documentation | ✓ VERIFIED | All sections present: Capability, Architectural Decisions, Stack Touched, Out of Scope, Subsequent Slice Plan |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/ui/SpectrumPanel.tsx` | `src/reader/arrays.ts` | `store.selectedSpectrum` ← `getSpectrumArrays` called in `store.selectSpectrum` | ✓ WIRED | `store.ts` imports `getSpectrumArrays`; SpectrumPanel subscribes to `selectedSpectrum`; `setData([selectedSpectrum.mz, selectedSpectrum.intensity])` |
| `src/reader/openUrl.ts` | `vendor/mzpeakts` | `import { MzPeakReader } from "mzpeakts"` | ✓ WIRED | Only file with this import; `grep -rl "from ['\"]mzpeakts['\"]" src/` returns only this file |
| `src/ui/FileLoader.tsx` | `src/state/store.ts` | `store.openFile` / `store.openUrl` | ✓ WIRED | `useStore((s) => s.openFile)` and `useStore((s) => s.openUrl)` called in handlers |
| `src/ui/CapabilitiesPanel.tsx` | `src/reader/stats.ts` | `store.capabilities` (computed by `computeCapabilities`) | ✓ WIRED | `useStore((s) => s.capabilities)` in CapabilitiesPanel; `computeCapabilities` called in `runLoad` |
| `src/reader/openUrl.ts` | `src/reader/capability.ts` | `capabilityGate` calls `detectUnsupported` | ✓ WIRED | `capabilityGate` in `openUrl.ts` imports and calls `detectUnsupported` before returning reader |
| `src/state/store.ts` | `src/reader/errors.ts` | `classifyError` checks `instanceof UnsupportedEncodingError` | ✓ WIRED | `classifyError(err)` → `error.class = 'unsupported-encoding'` with findings |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SpectrumPanel.tsx` | `selectedSpectrum.mz` / `.intensity` | `getSpectrumArrays(reader, index)` → `reader.getSpectrum(index)` → vendored WASM reader reads Parquet | Yes — 10 Vitest tests with real fixtures confirm nonzero Float64Array/Float32Array from both layouts | ✓ FLOWING |
| `MetadataPanel.tsx` | `fileMeta`, `manifest` | `fileMeta(reader)` + `manifest(reader)` → mzpeakts `fileMetadata` + `mzpeak_index.json` | Yes — unit tests assert non-empty metadata groups and manifest entries from real files | ✓ FLOWING |
| `StatsPanel.tsx` | `stats.numSpectra`, `mzRange`, `msLevels`, `representationCounts` | `computeStats(reader, manifest)` → `reader.spectrumMetadata` O(n) scan | Yes — 5 Vitest tests assert numSpectra>0, msLevels non-empty, representation counts, mzRange contract | ✓ FLOWING |
| `CapabilitiesPanel.tsx` | `capabilities.layout`, `encodings`, `isImaging` | `computeCapabilities(reader, manifest)` → `reader._spectrumDataReader.arrayIndex` + `probeIsImaging` | Yes — unit tests verify layout and isImaging; `unsupported: []` is unconditionally empty in computeCapabilities (see Anti-Patterns) | ✓ FLOWING (with caveat on unsupported — see below) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 51 Vitest unit tests pass | `npm test` | 51/51 in 6 files, 795ms | ✓ PASS |
| 5 Playwright e2e tests pass (incl. LOAD-02 Range test) | `npx playwright test e2e/ --reporter=line` | 5/5 passed in 14.7s | ✓ PASS |
| LOAD-02: Range:bytes= headers asserted | test 4/5 in `e2e/remote-url.spec.ts` | `rangeRequests.length > 0` and every entry contains `Range:bytes=` | ✓ PASS |
| mzpeakts import boundary (single file) | `grep -rl "from ['\"]mzpeakts['\"]" src/` | `src/reader/openUrl.ts` only | ✓ PASS |
| No apache-arrow in ui/ or state/ | `grep -rl "from 'apache-arrow'" src/ui src/state` | 0 matches | ✓ PASS |
| WASM emitted as hashed asset | `ls dist/assets/*.wasm` | 1 file (`parquet_wasm_bg-fnSaorAQ.wasm`) | ✓ PASS |

### Probe Execution

Step 7c: No phase-declared probes in PLAN files. Conventional `scripts/*/tests/probe-*.sh` pattern: not found. SKIPPED — no probe scripts declared.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LOAD-01 | 01-02, 01-04 | Local .mzpeak via file picker and drag-and-drop | ✓ SATISFIED | `openFile.ts`, `FileLoader.tsx` (onDrop); e2e tests 1+2 in `local-file.spec.ts` prove picker and drag-drop with real WASM reader |
| LOAD-02 | 01-01, 01-02, 01-04 | .mzpeak from URL (range-request friendly, upstream-hosted) | ✓ SATISFIED | `e2e/remote-url.spec.ts` intercepts network requests during URL load and asserts ≥1 `Range:bytes=` header on the `.mzpeak` URL, proving `HttpRangeReader` is active. REQUIREMENTS.md traceability updated to Complete. |
| LOAD-03 | 01-01, 01-02, 01-04 | Staged progress (no silent long pauses) | ✓ SATISFIED | `ProgressBar.tsx` shows ZIP-index/manifest/metadata/ready steps; `yieldFrame()` in store; R-02e asserted in e2e (stage-label-zip-index visible) |
| FMT-01 | 01-01, 01-02, 01-04 | Parse ZIP + mzpeak_index.json manifest (name, entity_type, data_kind) | ✓ SATISFIED | `manifest()` in fileMeta.ts returns ManifestEntry[]; `MetadataPanel` renders manifest-row table; tested in reader.test.ts |
| FMT-02 | 01-01, 01-02, 01-04 | File description, instrument config, software, run, sample metadata | ✓ SATISFIED | `fileMeta()` normalizes all 5 groups; `MetadataPanel` renders all 5 MetaGroup components; unit-tested |
| FMT-03 | 01-02, 01-04 | Spectrum/entity counts, m/z range, MS levels | ✓ SATISFIED | `computeStats()` + `StatsPanel`; null mzRange → explicit "not available" text (R-02d); msLevels tested |
| FMT-04 | 01-02, 01-03, 01-04 | Capabilities/layout readout, imaging-detected | ✓ SATISFIED | `computeCapabilities()` + `CapabilitiesPanel`; `detectUnsupported()` gates load; `ErrorBanner` shows findings on abort. NOTE: `computeCapabilities().unsupported` returns `[]` unconditionally — for loaded (supported) files the `unsupported` flag in CapabilitiesPanel can never populate. The capability gate catches unsupported files before they load. See Anti-Patterns. |
| DATA-01 | 01-01, 01-03, 01-04 | Point + chunked/delta layout reconstruction | ✓ SATISFIED | `getSpectrumArrays()` + 10 tests in `arrays.test.ts` (Float64Array m/z, ascending, nonzero signal, precision, cross-layout equivalence) |
| DATA-02 | 01-03, 01-04 | Unsupported encoding → named actionable error, never silent zeros | ✓ SATISFIED | `detectUnsupported()` covers MS:1002312/1002313/1002314, auxiliary_arrays, directory storage; `UnsupportedEncodingError` thrown by gate; `classifyError` in store; `ErrorBanner` class-specific; 14 tests in `capability.test.ts` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/reader/stats.ts` | 205 | `unsupported: []` — `computeCapabilities()` returns `unsupported: []` unconditionally even though `detectUnsupported()` exists in capability.ts | ⚠️ Warning | For files that DO load successfully, `CapabilitiesPanel` can never display non-fatal unsupported-adjacent flags. The Codex round-2 `reject` cited this as a defect. The capability gate (in `openUrl.ts`) correctly uses `detectUnsupported()` to abort on unsupported files, so the DATA-02 requirement is met. But FMT-04's "report capabilities" for a partially-supported loaded file would show an empty unsupported list even if the file has unsupported flags that didn't trigger an abort. This is an accepted risk per operator adjudication. |
| `vite.config.ts` | 7–8 | `BASE` is a placeholder comment noting the repo path is finalized in Phase 5 | ℹ️ Info | The comment notes this explicitly ("This is a PLACEHOLDER — the final repo path is…"). Not a code debt marker; informational only. No TBD/FIXME/XXX markers found anywhere in modified source files. |

### Human Verification Required

None — all must-haves are now verified by automated checks. The LOAD-02 Range-request assertion (`e2e/remote-url.spec.ts`) provides programmatic proof that `HttpRangeReader` is active during URL loading, closing the only item that previously required human testing.

---

_Verified: 2026-06-03T09:50:00Z_
_Verifier: Claude (gsd-verifier)_
