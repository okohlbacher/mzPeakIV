---
phase: 01-reader-foundation-open-and-inspect
plan: 02
subsystem: ui-loader + reader-stats
tags: [react, typescript, zustand, playwright, vitest, file-picker, drag-drop, stats, capabilities, imaging-detection]

# Dependency graph
requires:
  - "01-01 (reader boundary, store shape, demo fixtures, typed contract)"
provides:
  - "src/reader/openFile.ts: local File/Blob -> MzPeakReader.fromBlob entry"
  - "src/ui/FileLoader.tsx: unified file picker + drag-drop + URL loader zone"
  - "src/ui/ProgressBar.tsx: staged step-progress bar (LOAD-03)"
  - "src/reader/stats.ts: computeStats, computeCapabilities, probeIsImaging"
  - "src/ui/StatsPanel.tsx: counts + mzRange + msLevels + representation breakdown"
  - "src/ui/CapabilitiesPanel.tsx: layout + encodings + isImaging readout"
  - "e2e/local-file.spec.ts: Playwright tests for file picker + drag-drop (R-02a, R-02e, R-02d)"
  - "FileStats.representationCounts: profile/centroid split in types.ts"
affects: [01-03, 01-04, imaging, compute]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "openFile.ts wraps openBlob — File IS a Blob, no URL.createObjectURL hack needed"
    - "computeStats/computeCapabilities called after metadata stage in store.runLoad"
    - "probeIsImaging: accession-keyed (IMS:1000050/51) not column-name-grep"
    - "isImaging = boolean probe only, zero coordinate reconstruction (P2)"
    - "mzRange is null (explicit 'not available') or [number, number] — never undefined"
    - "representationCounts: { profile, centroid } computed per-spectrum in O(n) scan"
    - "Playwright drag-drop via DataTransfer.items.add + DragEvent injection in page.evaluate"

key-files:
  created:
    - src/reader/openFile.ts
    - src/reader/openFile.test.ts
    - src/reader/stats.ts
    - src/reader/stats.test.ts
    - src/ui/FileLoader.tsx
    - src/ui/ProgressBar.tsx
    - src/ui/StatsPanel.tsx
    - src/ui/CapabilitiesPanel.tsx
    - e2e/local-file.spec.ts
  modified:
    - src/reader/types.ts
    - src/reader/fileMeta.ts
    - src/state/store.ts
    - src/state/store.test.ts
    - src/ui/App.tsx
    - src/ui/MetadataPanel.tsx

key-decisions:
  - "File.fromBlob exists in vendored mzpeakts (vendor/mzpeakts/lib/src/reader.ts:97); no URL.createObjectURL workaround needed"
  - "computeStats/computeCapabilities live in stats.ts (not fileMeta.ts) to keep the stats module separate from the normalizer"
  - "fileStats() stub in fileMeta.ts kept (with representationCounts: {0,0}) for test mock compatibility; production now calls computeStats"
  - "stage sentinel (display:none span[data-testid=stage]) re-added for skeleton.spec compatibility"
  - "Playwright drag-drop test uses page.evaluate + DataTransfer.items.add (no native drag-file API in Playwright)"

requirements-completed: [LOAD-01, LOAD-03, FMT-01, FMT-02, FMT-03, FMT-04]

# Metrics
duration: ~90min
completed: 2026-06-03
---

# Phase 1 / Plan 01-02: Open-and-Inspect Summary

**Local-file loading (picker + drag-drop), staged progress, and full inspection panels: computeStats (msLevels, mzRange, representationCounts), computeCapabilities (layout, encodings, isImaging probe), StatsPanel, CapabilitiesPanel — all verified against real fixtures with Vitest + Playwright.**

## Accomplishments

- Added `openFile(file: File)` to the reader boundary (`src/reader/openFile.ts`) — calls `openBlob` since `File IS Blob`; no `createObjectURL` hack needed.
- Created `FileLoader.tsx`: file picker (`<input type=file>`), drag-drop zone (`onDrop`), and URL input unified in one component. Playwright `page.setInputFiles` works against the hidden `<input>`.
- Created `ProgressBar.tsx`: step-progress bar showing zip-index → manifest → metadata → ready with dot indicators (LOAD-03). Spinner visible during loading stages (R-02e).
- Added `openFile(file: File)` action to the zustand store, mirroring `openUrl`'s staged transitions.
- Created `src/reader/stats.ts` with:
  - `computeStats` — numSpectra, numEntities, mzRange (null if not derivable, R-02d), msLevels, representationCounts (R-02b).
  - `computeCapabilities` — layout (point/chunked/mixed from array index buffer formats), encodings CURIEs, isImaging boolean.
  - `probeIsImaging` — accession-keyed probe: IMS:1000050/51 promoted columns, CV-param fallback, `metadata.imaging.is_imaging` discovery block (R-02c).
- Created `StatsPanel.tsx` and `CapabilitiesPanel.tsx`; updated `App.tsx` to compose left inspection column (MetadataPanel + StatsPanel + CapabilitiesPanel).
- 27 Vitest unit tests pass; 4 Playwright e2e tests pass (3 new in `local-file.spec.ts`, 1 pre-existing skeleton).

## Task Commits

1. **Task 1: Local file loading + staged progress** — `7edecda` (feat)
2. **Task 2: Stats + capabilities computation + panels** — `15dc874` (feat)
3. **Task 3: Playwright e2e for local file loading** — `e1c5520` (test)

## Key Files

See `key-files` in frontmatter.

## Codex Binding Compliance

| Binding | Status | Evidence |
|---------|--------|----------|
| R-02a: Playwright e2e for file picker + drag-drop | DONE | `e2e/local-file.spec.ts` tests 1 + 2 |
| R-02b: StatsPanel representation breakdown | DONE | `StatsPanel.tsx` + `stats.test.ts` R-02b assertions |
| R-02c: isImaging detection via accession, not grep | DONE | `probeIsImaging()` + 7 synthetic mock tests in stats.test.ts |
| R-02d: Explicit mzRange "not available" UI state | DONE | `StatsPanel.tsx` null branch + `stat-mz-range` Playwright assertion |
| R-02e: Intermediate stage label visible in load test | DONE | Playwright test 1 asserts `stage-label-zip-index` text + ProgressBar visible |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `data-testid="stage"` removed from App header**
- **Found during:** Playwright e2e test run (skeleton.spec failed)
- **Issue:** `App.tsx` replaced the stage span with `FileLoader` + `ProgressBar`; `skeleton.spec.ts` and `local-file.spec.ts` both expected `getByTestId("stage").toHaveText("Ready")`
- **Fix:** Re-added a `display:none` sentinel `<span data-testid="stage">` to the App header; ProgressBar provides the visible feedback
- **Files modified:** `src/ui/App.tsx`
- **Commit:** `e1c5520`

**2. [Rule 2 - Missing field] `FileStats.representationCounts` needed in types + fileMeta stub**
- **Found during:** Task 1 implementation (R-02b binding)
- **Issue:** `FileStats` type defined in 01-01 did not include `representationCounts`; `fileStats()` stub in `fileMeta.ts` would fail TypeScript after the type update
- **Fix:** Added `representationCounts: { profile: number; centroid: number }` to `FileStats` type; updated `fileStats()` stub to return `{ profile: 0, centroid: 0 }`; production code calls `computeStats` which fills real counts
- **Files modified:** `src/reader/types.ts`, `src/reader/fileMeta.ts`
- **Commit:** `7edecda`

**3. [Rule 3 - Blocking] `require is not defined` in Playwright test**
- **Found during:** First Playwright test run
- **Issue:** Playwright e2e tests compile as ESM; `require("node:fs")` is not available
- **Fix:** Changed to `import { readFileSync } from "node:fs"` at the top of `local-file.spec.ts`
- **Files modified:** `e2e/local-file.spec.ts`
- **Commit:** `e1c5520`

## Known Stubs

- `capabilities.unsupported = []` in `computeCapabilities` — intentional, populated by plan 01-03 (`src/reader/capability.ts`). The field exists in the `Capabilities` type.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary crossings introduced. `openFile` uses BlobReader (local, no upload) per T-01-02-INFO mitigation.

---

## Self-Check: PASSED

All created files exist on disk. All task commits (7edecda, 15dc874, e1c5520) verified in git log. Unit tests: 27/27 passed. Playwright e2e: 4/4 passed (3 new + skeleton). TypeScript: 0 errors. Build: clean.
