---
phase: 03-tic-image-pixel-spectrum-round-trip
plan: 04
subsystem: testing
tags: [proc-01, codex-review, verification, ci-gate, eslint, vite, tsc]

# Dependency graph
requires:
  - phase: 03-01
    provides: buildTic + rasterizeTic foundations + 'tic' LoadStage (IMAGE-01, IMAGE-04)
  - phase: 03-02
    provides: representation-routed signal reads (getSpectrumArraysFor) + selectSpectrum rewire (DATA-03, SPEC-01)
  - phase: 03-03
    provides: eager 'tic' store stage + ImagingPanel canvas + App wiring + SPEC-02 mzWindow placeholder
provides:
  - Phase-3 PROC-01 adversarial review gate (Codex round1 plan + round2 diff)
  - Full Phase-3 verification sweep (lint + tsc -b build + vitest) green
  - Repaired Phase-3 build regressions (tic LoadStage map, ImageData variance, XicLike boundary)
  - Both Codex verdict lines for the phase commit footer
affects: [phase-4-ion-image, phase-5-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PROC-01: every phase bracketed by Codex round1 (plan) + round2 (diff); verdict line into commit footer"
    - "Verification gate runs the REAL typecheck via `tsc -b` (build), not the no-op root `tsc --noEmit`"
    - "ESLint ignores .claude/worktrees so stale executor worktrees never poison the lint gate"

key-files:
  created:
    - .planning/phases/03-tic-image-pixel-spectrum-round-trip/03-CODEX-ROUND1.log (gitignored)
    - .planning/phases/03-tic-image-pixel-spectrum-round-trip/03-CODEX-ROUND2.log (gitignored)
  modified:
    - src/ui/ProgressBar.tsx
    - src/ui/ImagingPanel.tsx
    - src/compute/tic.ts
    - eslint.config.js

key-decisions:
  - "Phase-start SHA for round2 diff = b7c4387 (last Phase-2 commit, immediately before first Phase-3 artifact 90524d6)"
  - "tsc -b (build) is the authoritative typecheck; root tsc --noEmit checks nothing (files: [])"
  - "Both Codex verdicts are accept-with-revisions — surfaced to operator for adjudication (autonomous: false gate)"

patterns-established:
  - "Verification gate must run `npm run build`, not just `tsc --noEmit`, because the project's root tsconfig has files: [] and references the app/node projects"

requirements-completed: [IMAGE-01, IMAGE-04, SPEC-01, SPEC-02, DATA-03]

# Metrics
duration: 18min
completed: 2026-06-03
---

# Phase 3 Plan 04: PROC-01 Codex Gate + Phase-3 Verification Sweep Summary

**Phase-3 final gate: ran the Codex adversarial review harness (round1 plan / round2 diff, both `accept-with-revisions`), repaired four build-blocking Phase-3 regressions the gate surfaced, and confirmed the full lint+build+test suite green before handing the verdicts to the operator for adjudication.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files modified:** 4 source/config (+ 2 gitignored Codex logs)

## Accomplishments
- Ran the full Phase-3 verification sweep: `npm run lint` (0), `npm run build` (`tsc -b` typecheck + Vite build, 0), `npm test` (93 passed, 1 skipped, 0). No e2e: no imaging `.mzpeak` in `test/data/` (RESEARCH Pitfall 3) — unit coverage on synthetic fixtures + plan-03 human-check is the gate.
- Re-asserted the reader import boundary: no runtime `import` of `mzpeakts`/`apache-arrow` exists outside `src/reader/`. (The plan's `grep -rl mzpeakts src/` criterion matches comment text in `src/compute/tic.ts`, `src/imaging/*.ts`, `src/state/store.integration.test.ts` — these are boundary-documenting comments, NOT imports. An import-specific grep returns empty outside `src/reader/`. Boundary held.)
- Ran Codex `round1` (Phase-3 plan bundle) and `round2` (Phase-3 diff since `b7c4387`); captured both verdict lines.
- Fixed four build-blocking regressions and one integrity bug the gate + Codex round2 surfaced (see Deviations).

## Codex Verdicts (for the phase commit footer)

| Round | Scope | Verdict |
|-------|-------|---------|
| round1 | Phase-3 plan bundle (4 PLAN.md files) | **accept-with-revisions** |
| round2 | Phase-3 diff since `b7c4387` (excl. vendor/) | **accept-with-revisions** |

Logs (gitignored per PROC-01): `03-CODEX-ROUND1.log`, `03-CODEX-ROUND2.log`.

### Adjudication items surfaced to the operator (both verdicts non-accept)

Neither verdict is `reject`, so the phase is not halted — but `accept-with-revisions` requires operator adjudication. The substantive findings (deduped across both rounds):

1. **[High] Mixed profile/centroid TIC does not use the majority source.** `src/state/store.ts:163` uses `centroid > 0 && profile === 0 ? false : true`, which picks **profile for any mixed file** even when centroid is the majority — contradicting D-08 / the 03-03 must-have "TIC uses the majority source." *(Both rounds.)* — **operator: confirm intended rule or schedule a fix.**
2. **[High] Profile-routed empty spectra can render a silent blank.** `src/reader/arrays.ts` returns zero-length `mz`/`intensity` if both profile arrays exist but have length 0; only the centroid path fails loud. *(Round2 #2.)* — **operator: confirm fail-loud expectation for empty profile rows.**
3. **[Medium] DATA-03 routing is "select array source by representation," not exclusive file-handle access.** `src/reader/arrays.ts` calls `reader.getSpectrum(index)` then picks fields by `MS:1000525`. This is the interpretation the plan flagged (A2). If "route to `spectra_data`/`spectra_peaks`" means exclusive source access, it is not met. *(Both rounds; this is the explicit interpretation call the plan put before Codex.)* — **operator: ratify the representation-routing interpretation or require exclusive-source routing.**
4. **[Medium] SPEC-02 is scaffolding only.** `mzWindow` prop is accepted and discarded; no m/z window marker is drawn. This is the approved A4 deferral to Phase 4, owned by Phase 3 for coverage. *(Both rounds.)* — **operator: ratify the deferral (already roadmap-documented).**
5. **[Medium] Negative TIC values poison percentile scaling.** `src/ui/rasterize.ts` includes negative finite values in the percentile set, then collapses a negative ceiling to 0; `[-50, 100]` renders the positive pixel at colormap bottom. *(Round2 #3.)* — **operator: clamp/exclude negatives before `clipMax`?**
6. **[Medium] Round-trip behaviors lack automated coverage.** Hover readout, absent-click no-op, click→`selectSpectrum`, ring repaint, and non-imaging no-canvas are grep/human-check only — no component/e2e test exercises ImagingPanel events. *(Both rounds.)* — **operator: accept human-check for v1 or require component tests.**
7. **[Low] Raster orientation test is weak.** `rasterize.test.ts` uses 1-row, near-uniform grids that would not catch a row/column transpose. *(Round2 #7.)*
8. **[Low] `buildTic` overwrites on duplicate spectrum indices** (`tic[key] = sum`, not `+=`); relies on `extractXIC` uniqueness. *(Round1.)*

## Task Commits

1. **Task 1: Full Phase-3 verification sweep + boundary re-assertion** — `16871cb` (fix)
2. **Task 2: Codex round1 + round2** — review logs (gitignored); integrity fix `a18916e` (fix)

## Files Created/Modified
- `src/ui/ProgressBar.tsx` — add missing `tic` LoadStage to `STAGE_LABEL`, `STAGES` order, and `isLoading` guard.
- `src/ui/ImagingPanel.tsx` — construct `ImageData` by size then `.data.set(rgba)` (avoids `Uint8ClampedArray<ArrayBufferLike>` vs `<ArrayBuffer>` variance error) at both paint passes.
- `src/compute/tic.ts` — widen `XicLike.dataArrays` value to `ArrayLike<number> | ArrayLike<string> | undefined` so the reader's `XIC` is assignable without importing Arrow/mzpeakts; strict `typeof v === "number" && isFinite` sum guard.
- `eslint.config.js` — ignore `.claude/worktrees`.
- `03-CODEX-ROUND1.log`, `03-CODEX-ROUND2.log` — Codex output (gitignored).

## Decisions Made
- Phase-start SHA = `b7c4387` (last Phase-2 commit; the first Phase-3 artifact `90524d6 docs(03): capture phase context` is its child).
- The verification gate must run `npm run build` (which runs `tsc -b` over the app/node project references) — the root `tsc --noEmit` is a no-op (`files: []`) and silently passed while four real type errors blocked the build.
- Both `accept-with-revisions` verdicts are surfaced to the operator rather than auto-accepted (PROC-01, `autonomous: false`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tic` LoadStage missing from ProgressBar exhaustive map**
- **Found during:** Task 1 (build step of the verification sweep)
- **Issue:** 03-03 added `"tic"` to the `LoadStage` union but `ProgressBar.tsx`'s `STAGE_LABEL: Record<LoadStage,string>` and ordered `STAGES` array were not updated → `tsc -b` error TS2741. The build was red.
- **Fix:** Added `tic: "Rendering TIC image…"` to the label map, inserted `"tic"` between `grid` and `ready` in `STAGES`, and added `stage === "tic"` to the `isLoading` spinner guard.
- **Files modified:** src/ui/ProgressBar.tsx
- **Verification:** `npm run build` exits 0.
- **Committed in:** `16871cb`

**2. [Rule 1 - Bug] ImageData constructor variance error**
- **Found during:** Task 1 (build step)
- **Issue:** `new ImageData(rgba, w, h)` where `rgba: Uint8ClampedArray<ArrayBufferLike>` is not assignable to the DOM lib's `Uint8ClampedArray<ArrayBuffer>` (SharedArrayBuffer exclusion) → two TS2769 errors in ImagingPanel.
- **Fix:** Construct `new ImageData(w, h)` then `img.data.set(rgba)` at both paint passes — the canonical, variance-safe pattern.
- **Files modified:** src/ui/ImagingPanel.tsx
- **Verification:** `npm run build` exits 0; tests still pass.
- **Committed in:** `16871cb`

**3. [Rule 1 - Bug] Reader `XIC` not assignable to compute `XicLike`**
- **Found during:** Task 1 (build step)
- **Issue:** `store.ts:183 buildTic(xic, grid)` failed TS2345 — the reader's `XIC.points[].dataArrays` is `Record<string, FloatArray | IntArray | string[]>`, whose `string[]` member is not an `ArrayLike<number>`, so the structural `XicLike` rejected it.
- **Fix:** Widened `XicLike.dataArrays` value to `ArrayLike<number> | ArrayLike<string> | undefined` (still no Arrow/mzpeakts import — one-way boundary held) and added a numeric sum guard.
- **Files modified:** src/compute/tic.ts
- **Verification:** `npm run build` exits 0.
- **Committed in:** `16871cb`

**4. [Rule 3 - Blocking] Stale executor worktree poisoning the lint gate**
- **Found during:** Task 1 (lint step)
- **Issue:** A leftover, already-merged worktree at `.claude/worktrees/agent-a0193ed655f5991c5` (branch tip `dd341b1`, confirmed ancestor of HEAD via merge `7816cf4`) carried its own `vendor/mzpeakts/` copy that ESLint scanned, producing 198 errors. The eslint `vendor` ignore did not match the nested path.
- **Fix:** Pruned the stale worktree with `git worktree remove --force` + `git worktree prune` + branch delete (canonical cleanup — NOT `git clean`), and added `.claude/worktrees` to the eslint `ignores` as a durable guard.
- **Files modified:** eslint.config.js
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `16871cb`

**5. [Rule 1 - Bug] `buildTic` numeric-string coercion (Codex round2 #4)**
- **Found during:** Task 2 (Codex round2 review)
- **Issue:** The Task-1 boundary fix used `Number(v)`, which would coerce a numeric-looking string (`"1000"`) from a mis-typed file column into the TIC integrity total — deviating from the plan's finite-number guard.
- **Fix:** Tightened to `typeof v === "number" && Number.isFinite(v) ? v : 0` — only genuine finite numbers contribute; any string → 0.
- **Files modified:** src/compute/tic.ts
- **Verification:** `npm run build` + `npm test` exit 0.
- **Committed in:** `a18916e`

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs, 1 Rule 3 blocking). All within scope — every fix was directly caused by Phase-3 changes (the four build errors) or by the verification/review gate this plan exists to run.
**Impact on plan:** The gate caught a red build that the plan's own `tsc --noEmit` verify line would have missed. No scope creep — no features added beyond making the Phase-3 deliverable actually build, lint, and pass tests.

## Requirement → Test/Artifact Mapping

| Req | Evidence |
|-----|----------|
| IMAGE-01 (TIC default overview) | `src/compute/tic.test.ts` (buildTic aggregation); eager `'tic'` LoadStage in store; build artifact |
| IMAGE-04 (orientation + absent vs zero) | `src/compute/tic.test.ts` orientation + `src/ui/rasterize.test.ts` sparse-sentinel tests (Codex round2 #7 notes orientation test is weak — adjudication item) |
| DATA-03 (signal-file routing by MS:1000525) | `src/reader/arrays.test.ts` routing block + `src/state/store.test.ts`/`store.integration.test.ts` rewire (interpretation = representation-routed; adjudication item #3) |
| SPEC-01 (click pixel → spectrum) | `selectSpectrum` path tests + plan-03 `<human-check>` |
| SPEC-02 (m/z window marker) | Architectural placeholder only (`mzWindow` prop present, no marker) — Phase-4-gated; roadmap-documented deferral (adjudication item #4) |

## Issues Encountered
- The plan's verify line `npx tsc --noEmit` is a no-op against the root tsconfig (`files: []`) and reported success while four real type errors blocked `tsc -b` in the build. Resolved by treating `npm run build` as the authoritative typecheck; recommend future plans drop the redundant `tsc --noEmit` step or point it at `tsconfig.app.json`.

## Next Phase Readiness
- Phase-3 deliverable is lint-clean, builds, and passes 93 tests — the file→TIC→click→spectrum round-trip is green on synthetic fixtures.
- **Blocking on operator:** both Codex verdicts are `accept-with-revisions`. The operator must adjudicate the eight items above (notably #1 mixed-source majority rule, #3 DATA-03 routing interpretation, #4 SPEC-02 deferral) and copy the verdict lines into the phase commit footer before the phase is marked complete. Items #1, #2, #5, #6, #7 are candidate Phase-4 carry-forwards if not fixed now.

## Self-Check: PASSED

- Files verified present: `03-04-SUMMARY.md`, `03-CODEX-ROUND1.log`, `03-CODEX-ROUND2.log`.
- Commits verified in history: `16871cb` (Task 1 fixes), `a18916e` (Codex round2 integrity fix).

---
*Phase: 03-tic-image-pixel-spectrum-round-trip*
*Completed: 2026-06-03*
