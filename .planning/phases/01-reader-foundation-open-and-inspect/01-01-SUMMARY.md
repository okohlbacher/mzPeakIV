---
phase: 01-reader-foundation-open-and-inspect
plan: 01
subsystem: infra
tags: [vite, react, typescript, mzpeakts, parquet-wasm, apache-arrow, zip.js, uplot, zustand, vitest, playwright]

# Dependency graph
requires: []
provides:
  - "Vite 8 + React 19 + TypeScript ~5.9 SPA scaffold with ESLint flat config, Prettier, Vitest, Playwright"
  - "Vendored mzpeakts reader (git submodule + file: install) behind a single import boundary at src/reader/"
  - "Reader boundary: openUrl(url) -> MzPeakReader, normalized FileMeta, getSpectrumArrays(index) -> {mz: Float64Array, intensity: Float32Array}"
  - "src/reader/types.ts contract: FileMeta, SpectrumMeta (incl. representation profile/centroid), FileStats, Capabilities shapes"
  - "zustand store with staged LoadStage (zip-index -> manifest -> metadata -> ready) and openUrl action"
  - "Walking-skeleton UI: URL loader, MetadataPanel, spectrum-index selector + uPlot SpectrumPanel"
  - "Bundled demo fixtures: small.mzpeak (point) and small.chunked.mzpeak (chunked+delta), in public/static and test/data"
  - "tools/codex_review.sh PROC-01 harness (round1/round2) + scripts/bootstrap-reader.sh"
affects: [01-02, 01-03, 01-04, imaging, compute, render]

# Tech tracking
tech-stack:
  added: [vite@8.0.16, react@19.2.7, typescript@~5.9, "@vitejs/plugin-react@6.0.2", vite-plugin-wasm@3.6.0, vite-plugin-top-level-await@1.6.0, uplot@1.6.32, zustand, vitest@4.1.8, "@playwright/test@1.60.0", "mzpeakts (vendored)", parquet-wasm@0.7.1, apache-arrow@21.1.0, arrow-js-ffi@0.4.3, "@zip.js/zip.js@2.8.26"]
  patterns: ["single reader import boundary (only src/reader/* imports mzpeakts)", "no bigint/arrow types above src/reader", "uPlot mounted imperatively via useRef", "zustand selectors per panel", "single-threaded WASM ESM (no COOP/COEP)"]

key-files:
  created:
    - src/reader/types.ts
    - src/reader/openUrl.ts
    - src/reader/fileMeta.ts
    - src/reader/arrays.ts
    - src/state/store.ts
    - src/ui/App.tsx
    - src/ui/MetadataPanel.tsx
    - src/ui/SpectrumPanel.tsx
    - src/main.tsx
    - vite.config.ts
    - vitest.config.ts
    - playwright.config.ts
    - eslint.config.js
    - tools/codex_review.sh
    - scripts/bootstrap-reader.sh
    - e2e/skeleton.spec.ts
    - public/static/small.mzpeak
    - public/static/small.chunked.mzpeak
  modified: []

key-decisions:
  - "Vendor mzpeakts as a git submodule pinned to a commit + file:vendor/mzpeakts/lib install (format is unstable; build the artifact upstream ships)"
  - "Single-threaded parquet-wasm ESM build -> no COOP/COEP / SharedArrayBuffer / coi-serviceworker required (proven by upstream GitHub Pages demo)"
  - "Isolate the unstable format to src/reader/ only; nothing above it imports apache-arrow or uses bigint"
  - "uPlot mounted via useRef (no React wrapper) for dense spectra"
  - "Demo fixtures small.mzpeak (point) + small.chunked.mzpeak (chunked+delta) bundled for unit + e2e"

patterns-established:
  - "Reader boundary: all mzpeakts access funnels through src/reader/* (enforced by grep gate in later plans)"
  - "Staged LoadStage progression in the store so the UI never shows a silent long pause"
  - "Plain POJO/Float64Array/Float32Array types cross the reader boundary"

requirements-completed: [LOAD-02, LOAD-03, FMT-01, FMT-02, DATA-01]

# Metrics
duration: reconstructed
completed: 2026-06-03
---

# Phase 1 / Plan 01-01: Walking Skeleton Summary

**Vite 8 + React 19 + TypeScript SPA that opens a real demo `.mzpeak` from a URL via the vendored mzpeakts + parquet-wasm reader, shows normalized file metadata + the manifest entity list, and plots a selected spectrum's reconstructed m/z+intensity arrays in uPlot — all client-side with no COOP/COEP.**

> Reconstructed retroactively by the execute-phase safe-resume gate: plan 01-01 was implemented, Codex-reviewed, and committed (`8abba25`, `9ac3e98`) but its SUMMARY.md was never written, which left the SDK reporting the plan as incomplete and downstream plans (01-02 depends on this summary) without their dependency artifact. Content below is derived from the committed diff, SKELETON.md, and STATE.md.

## Accomplishments
- Scaffolded the full SPA toolchain at the STACK.md-pinned versions (Vite 8, React 19, TS ~5.9, ESLint flat config, Prettier, Vitest, Playwright).
- Vendored the `mzpeakts` reader via git submodule + `file:` install behind a single `src/reader/` import boundary.
- Proved the vendored WASM reader chain (parquet-wasm + apache-arrow + zip.js) runs in-browser end-to-end: URL load → manifest + metadata → per-spectrum array reconstruction → uPlot render.
- Established the typed reader contract (`FileMeta`, `SpectrumMeta` incl. profile/centroid `representation`, `FileStats`, `Capabilities`) consumed by all later Phase-1 plans.
- Bootstrapped the PROC-01 Codex review harness (`tools/codex_review.sh`).

## Task Commits
1. **Walking skeleton (scaffold, vendored reader, URL load, metadata + spectrum UI)** — `8abba25` (feat)
2. **Codex round-2 fixes on the 01-01 slice** — `9ac3e98` (fix)

## Files Created/Modified
See `key-files.created` in frontmatter. Notable:
- `src/reader/openUrl.ts` — URL → `MzPeakReader` entry (the single reader import site).
- `src/reader/fileMeta.ts` — normalizes mzpeakts metadata into the framework-agnostic `FileMeta`.
- `src/reader/arrays.ts` — reconstructs per-spectrum m/z+intensity (point and chunked+delta).
- `src/state/store.ts` — zustand store with staged `LoadStage` transitions + `openUrl`.
- `src/ui/{App,MetadataPanel,SpectrumPanel}.tsx` — skeleton UI; uPlot mounted via `useRef`.

## Decisions Made
See `key-decisions` in frontmatter — followed SKELETON.md architectural contract as specified.

## Deviations from Plan
Codex round-2 produced a `reject` verdict dominated by phase-incompleteness/diff-framing (01-01 is one slice of a 4-plan phase); the genuine 01-01-scoped defects it surfaced were fixed in `9ac3e98` (package-lock pruning, vite.config + store corrections). No scope creep.

## Issues Encountered
The SUMMARY.md for this plan was not written at execution time; reconstructed here during the Phase-1 resume so tracking and downstream dependencies are consistent.

## Next Phase Readiness
- Reader boundary, store, demo fixtures, and typed contract are in place for plan 01-02 (local-file loading + full inspection panels), 01-03 (signal-layout correctness + fail-loud capability detection), and 01-04 (Codex phase gate).

---
*Phase: 01-reader-foundation-open-and-inspect*
*Completed: 2026-06-03 (reconstructed)*
