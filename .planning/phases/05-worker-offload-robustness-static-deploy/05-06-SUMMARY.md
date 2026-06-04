---
phase: 05-worker-offload-robustness-static-deploy
plan: "06"
subsystem: worker
tags: [web-worker, transferable, structured-clone, uint8array, presenceMask]

# Dependency graph
requires:
  - phase: 05-worker-offload-robustness-static-deploy
    provides: "Worker load pipeline (runLoadInWorker) and ImagingGrid transfer protocol"
provides:
  - "CR-01 closed: activeGrid.presenceMask is a valid, non-detached Uint8Array after every runLoadInWorker call"
  - "computeIonImageStats receives correct nonzero-pixel mask for all renderIonImage requests"
affects: [05-worker-offload-robustness-static-deploy, ion-image-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "presenceMask Uint8Array is intentionally structured-cloned (not transferred) across the Worker boundary to keep the Worker's copy valid for subsequent calls"

key-files:
  created: []
  modified:
    - src/worker/mzPeakWorker.ts
    - src/worker/protocol.ts

key-decisions:
  - "Do not transfer presenceMask.buffer: the ~35 KB structured-clone cost is negligible; correctness of subsequent renderIonImage calls requires the Worker to retain a live buffer"

patterns-established:
  - "Only transfer buffers that are consumed once (tic, ionImage). Buffers needed across multiple Worker-handled messages must be structured-cloned, not transferred."

requirements-completed: [UX-01]

# Metrics
duration: 5min
completed: 2026-06-03
---

# Phase 05 Plan 06: CR-01 Gap Closure Summary

**Remove presenceMask.buffer from the Worker transfer list so activeGrid retains a valid Uint8Array for all subsequent renderIonImage / computeIonImageStats calls.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-03T00:00:00Z
- **Completed:** 2026-06-03T00:05:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Removed the transfer-list line `if (grid!.presenceMask) transferList.push(grid!.presenceMask.buffer)` from `runLoadInWorker`; presenceMask is now structured-cloned across the Worker boundary, keeping the Worker's `activeGrid.presenceMask` buffer live and non-detached.
- Fixed the stale post-transfer comment ("tic and presenceMask are now detached") to accurately reflect that only `tic.buffer` is transferred.
- Updated `LoadResult` JSDoc in `protocol.ts` to replace the outdated "add presenceMask.buffer to transfer list" note with the correct structured-clone explanation.
- `npx tsc -b` exits 0; no TypeScript errors.

## Task Commits

1. **Task 1: Remove presenceMask.buffer from transfer list and fix comments** - `c6d3b37` (fix)

## Files Created/Modified

- `src/worker/mzPeakWorker.ts` - Removed presenceMask.buffer from transferList; updated post-transfer WARNING comment
- `src/worker/protocol.ts` - Updated LoadResult JSDoc: replaced transfer note with structured-clone explanation

## Decisions Made

- Structured-clone for presenceMask (not transfer): the Uint8Array is ~35 KB for PXD001283 (260x134); the copy cost is negligible while the correctness benefit is critical — the Worker needs the mask valid for every `renderIonImage` request that follows the initial load.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's automated verify step checked for zero occurrences of `presenceMask.buffer` in the file, but the replacement comment block itself contains that string. The intent of the check (remove the transfer-list line) is satisfied; the single remaining occurrence is a comment documenting that the transfer does NOT happen, which is correct per the plan's action spec.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 is closed. All `renderIonImage` calls that follow a file load will receive correct nonzero-pixel statistics from `computeIonImageStats` because `activeGrid.presenceMask` is no longer detached.
- No blockers for subsequent plans in phase 05.

---
*Phase: 05-worker-offload-robustness-static-deploy*
*Completed: 2026-06-03*
