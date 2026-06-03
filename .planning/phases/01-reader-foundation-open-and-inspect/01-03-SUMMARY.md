---
phase: 01-reader-foundation-open-and-inspect
plan: 03
subsystem: reader-trust + error-taxonomy
tags: [typescript, vitest, capability-detection, error-taxonomy, tdd, data-01, data-02, numpress, zustand]

# Dependency graph
requires:
  - "01-01 (reader boundary, openUrl/openBlob, getSpectrumArrays, demo fixtures)"
  - "01-02 (store error field, CapabilitiesPanel unsupported stub, openFile)"
provides:
  - "src/reader/capability.ts: detectUnsupported(reader, manifest) — UnsupportedFinding[] for Numpress/aux/directory"
  - "src/reader/errors.ts: UnsupportedEncodingError (findings), CorruptFileError, ReaderErrorClass discriminator"
  - "src/reader/arrays.test.ts: DATA-01 reconstruction proof for point AND chunked/delta with float64 m/z"
  - "src/reader/capability.test.ts: DATA-02 detection proof for all three unsupported classes (R-03a)"
  - "src/ui/ErrorBanner.tsx: class-specific error render (unsupported vs corrupt) — R-03b authoritative display"
  - "store.error is now StoreError { class, message, findings? } — not a bare string"
  - "openUrl/openBlob run capabilityGate before returning; abort on unsupported encodings"
affects: [01-04, imaging, compute, render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capability gate runs detectUnsupported() after every reader open; throws UnsupportedEncodingError if findings non-empty"
    - "classifyError() in store maps UnsupportedEncodingError -> 'unsupported-encoding', others -> 'corrupt'"
    - "ErrorBanner is the authoritative display for load-abort errors (R-03b); CapabilitiesPanel for non-fatal flags"
    - "Import boundary R-03c: only src/reader/openUrl.ts imports mzpeakts (verified by grep)"
    - "Synthetic mock readers for Numpress/aux/directory detection tests (no binary Numpress fixture needed)"

key-files:
  created:
    - src/reader/capability.ts
    - src/reader/errors.ts
    - src/reader/arrays.test.ts
    - src/reader/capability.test.ts
    - src/ui/ErrorBanner.tsx
    - test/data/README.md
  modified:
    - src/reader/openUrl.ts
    - src/state/store.ts
    - src/state/store.test.ts
    - src/ui/App.tsx

key-decisions:
  - "detectUnsupported inspects static ArrayIndexEntry.transform for Numpress CURIEs (no dynamic Parquet read needed at capability-check time)"
  - "store.error changed from bare string to StoreError { class, message, findings? } — ErrorBanner renders class-specifically"
  - "CapabilitiesPanel.unsupported is for files that DO load (non-fatal flags); ErrorBanner shows findings for load-abort cases (R-03b)"
  - "No binary Numpress fixture shipped: detection tests use synthetic mock readers (format is unstable; mocks are more precise)"

requirements-completed: [DATA-01, DATA-02, FMT-04]

# Metrics
duration: ~60min
completed: 2026-06-03
---

# Phase 1 / Plan 01-03: Reader Trust + Capability Gate Summary

**Named error taxonomy wired into the load path: capability gate refuses Numpress (MS:1002312), auxiliary arrays, and directory storage before any signal read; corrupt-vs-unsupported are distinct classes surfaced through a class-specific ErrorBanner. DATA-01 reconstruction correctness for point AND chunked/delta layouts proven by explicit test assertions.**

## Accomplishments

- Created `src/reader/errors.ts` with `UnsupportedEncodingError` (carries `UnsupportedFinding[]`), `CorruptFileError`, and `ReaderErrorClass = 'unsupported-encoding' | 'corrupt'` discriminator.
- Created `src/reader/capability.ts` with `detectUnsupported(reader, manifest)` that checks:
  1. Numpress transforms (`MS:1002312` / `MS:1002313` / `MS:1002314`) from `ArrayIndexEntry.transform` in the static array index.
  2. Populated `auxiliary_arrays` list in `fileIndex.metadata`.
  3. `storage_type === 'directory'` in `fileIndex.metadata`.
  Returns `[]` for supported files (point layout, chunked/delta — both demo fixtures).
- Updated `src/reader/openUrl.ts`: `capabilityGate()` runs `detectUnsupported()` after every `openUrl`/`openBlob`; throws `UnsupportedEncodingError(findings)` if non-empty. This prevents any signal arrays reaching the UI for unsupported files.
- Updated `src/state/store.ts`: `classifyError()` maps `UnsupportedEncodingError` → `class='unsupported-encoding'` (with findings), all others → `class='corrupt'`. `store.error` is now `StoreError | null` (not a bare string).
- Created `src/ui/ErrorBanner.tsx`: renders a class-specific banner — unsupported shows the findings list with CURIE codes; corrupt shows "file could not be parsed".
- Updated `src/ui/App.tsx`: replaced inline `error` string render with `<ErrorBanner error={error} />`.
- Created `src/reader/arrays.test.ts`: 10 tests proving DATA-01 correctness for point AND chunked/delta layouts — Float64Array m/z type, strict ascending order, nonzero signal, float64 precision, and cross-layout equivalence.
- Created `src/reader/capability.test.ts`: 14 tests for DATA-02 — all three unsupported classes (R-03a), error taxonomy, and corrupt-blob detection.
- Created `test/data/README.md`: documents fixture provenance and DATA-01/DATA-02 coverage.
- Verified R-03c: `grep -rl "from ['\"]mzpeakts" src/` returns ONLY `src/reader/openUrl.ts`.

## Task Commits

### Task 1: DATA-01 reconstruction tests + correctness

1. **RED: DATA-01 arrays.test.ts** — `c1f3117` (test)
2. **GREEN: implementation already correct from 01-01** — no new commit needed (getSpectrumArrays was already handling both layouts)

### Task 2: Fail-loud capability detection + named error taxonomy

3. **RED: capability.test.ts** — `070ce87` (test)
4. **GREEN: capability.ts, errors.ts, openUrl.ts gate, store structured errors, ErrorBanner** — `5f1feb3` (feat)

## Codex Binding Compliance

| Binding | Status | Evidence |
|---------|--------|----------|
| R-03a: Numpress (MS:1002312) detection | DONE | `capability.ts` checks `ArrayIndexEntry.transform`; test in `capability.test.ts` |
| R-03a: Auxiliary arrays detection | DONE | `capability.ts` checks `fileIndex.metadata.auxiliary_arrays`; test in `capability.test.ts` |
| R-03a: Directory storage detection | DONE | `capability.ts` checks `fileIndex.metadata.storage_type === 'directory'`; test in `capability.test.ts` |
| R-03b: ErrorBanner = authoritative display for load-abort | DONE | `ErrorBanner.tsx` + `store.ts classifyError`; `CapabilitiesPanel` only shown for loaded files |
| R-03c: Import boundary — only src/reader/openUrl.ts imports mzpeakts | DONE | `grep -rl "from ['\"]mzpeakts" src/` returns only `src/reader/openUrl.ts` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] store.test.ts assertion used old bare-string error shape**
- **Found during:** GREEN phase (store.ts error type change broke existing test)
- **Issue:** `expect(state.error).toContain("boom")` called `.toContain` on a `StoreError` object instead of a string
- **Fix:** Updated assertion to `expect(state.error?.class).toBe("corrupt"); expect(state.error?.message).toContain("boom")`
- **Files modified:** `src/state/store.test.ts`
- **Commit:** `5f1feb3`

**2. [Rule 3 - Blocking] TypeScript build errors: unused declarations + null type mismatch**
- **Found during:** `npm run build` after GREEN commit
- **Issue 1:** `SUPPORTED_TRANSFORMS` and `STRUCTURAL_FORMATS` were declared but unused in `capability.ts` (TS6133)
- **Issue 2:** `import type { ManifestEntry }` unused in `capability.test.ts` (TS6133)
- **Issue 3:** `transform: null` assigned to `transform?: string` parameter in mock builder (TS2322)
- **Fix:** Replaced unused constants with comments; removed unused import; widened mock builder type to `string | null`
- **Files modified:** `src/reader/capability.ts`, `src/reader/capability.test.ts`
- **Commit:** `5f1feb3` (folded into GREEN commit before final push)

## TDD Gate Compliance

- RED gate (test commit): `c1f3117` (arrays.test.ts), `070ce87` (capability.test.ts)
- GREEN gate (feat commit): `5f1feb3` (capability.ts + errors.ts + openUrl.ts + store + ErrorBanner)
- Task 1 RED passed immediately because the implementation was already correct from 01-01. This is expected — the tests are DATA-01 correctness proofs, not tests of new functionality.

## Known Stubs

None — `capabilities.unsupported = []` stub from 01-02 is now fully populated: `detectUnsupported()` computes real values, and `computeCapabilities()` in `stats.ts` still returns `unsupported: []` for supported files. The `CapabilitiesPanel` already renders the unsupported list (no stub remains).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary crossings. The capability gate is a pure read of static metadata from an already-opened reader; no new untrusted input surfaces were added.

---

## Self-Check: PASSED

All created files exist on disk. All task commits (c1f3117, 070ce87, 5f1feb3) verified in git log. Unit tests: 51/51 passed. TypeScript: 0 errors (`npx tsc --noEmit`). Build: clean (`npm run build`). R-03c: `grep -rl "from ['\"]mzpeakts" src/` returns only `src/reader/openUrl.ts`.
