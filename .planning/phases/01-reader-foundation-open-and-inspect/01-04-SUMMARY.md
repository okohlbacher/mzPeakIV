---
phase: 01-reader-foundation-open-and-inspect
plan: 04
subsystem: infra
tags: [codex, proc-01, verification, lint, eslint, playwright, vitest, typescript]

# Dependency graph
requires:
  - "01-01 (scaffold, reader boundary, walking skeleton, codex_review.sh)"
  - "01-02 (local-file loading, staged progress, stats + capabilities panels)"
  - "01-03 (capability gate, error taxonomy, DATA-01/DATA-02 proof)"
provides:
  - "Full Phase-1 verification sweep: lint + tsc + tests (51/51) + build + e2e (4/4) all green"
  - ".planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND1.log (round1 plan verdict)"
  - ".planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND2.log (round2 diff verdict)"
  - "Phase-1 Codex verdicts for commit footer (PROC-01)"
affects: [02-imaging-grid, phase-commit-footer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESLint argsIgnorePattern/varsIgnorePattern: '^_' added to allow intentionally-unused _-prefixed parameters"

key-files:
  created:
    - .planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND1.log
    - .planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND2.log
    - .planning/phases/01-reader-foundation-open-and-inspect/01-04-SUMMARY.md
  modified:
    - eslint.config.js
    - e2e/local-file.spec.ts

key-decisions:
  - "Phase-1 Codex round2 verdict is 'reject' — operator adjudication required per PROC-01 before Phase 1 is declared closed"
  - "PROC-01: both verdicts (round1: accept-with-revisions, round2: reject) recorded in SUMMARY for phase commit footer"

requirements-completed: [LOAD-01, LOAD-02, LOAD-03, FMT-01, FMT-02, FMT-03, FMT-04, DATA-01, DATA-02]

# Metrics
duration: ~30min
completed: 2026-06-03
---

# Phase 1 / Plan 01-04: PROC-01 Codex Gate Summary

**Full Phase-1 verification sweep green (lint + tsc + 51 unit tests + build + 4 e2e); Codex round1 = accept-with-revisions, round2 = reject — operator adjudication required per PROC-01 before closing Phase 1.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-03T08:55:00Z
- **Completed:** 2026-06-03T09:25:00Z
- **Tasks:** 2 complete (Task 3 = human-verify checkpoint, awaiting operator)
- **Files modified:** 4 (eslint.config.js, e2e/local-file.spec.ts, 2 Codex logs)

---

## Task 1: Full Phase-1 Verification Sweep

### Command Results

| Command | Result |
|---------|--------|
| `npm run bootstrap` | PASS — submodule built, mzpeakts.js emitted |
| `npm run lint` | PASS (after auto-fix: added `_` ignore pattern, removed unused var) |
| `npx tsc --noEmit` | PASS — 0 type errors |
| `npm test` | PASS — 51/51 tests in 6 files |
| `npm run build` | PASS — Vite 8 production build, WASM emitted as hashed asset |
| `npx playwright test e2e/ --reporter=line` | PASS — 4/4 e2e tests |

### ROADMAP Phase-1 Success Criteria Mapping

| Criterion | Satisfied By | Status |
|-----------|-------------|--------|
| 1. Local picker + drag-drop + URL with staged progress | `e2e/local-file.spec.ts` tests 1 + 2 (picker/drag-drop), `e2e/skeleton.spec.ts` (URL), `ProgressBar` visible in test 1 | PASS |
| 2. Manifest + 5 metadata groups | `e2e/skeleton.spec.ts` asserts metadata panel + manifest entity list render; `MetadataPanel.tsx` renders 5 groups | PASS |
| 3. Counts + m/z range + MS levels + capabilities incl. imaging-detected | `src/reader/stats.test.ts` (27 tests incl. imaging-detection), `StatsPanel`/`CapabilitiesPanel` confirmed by e2e | PASS |
| 4. Point + chunked/delta single-spectrum reconstruction | `src/reader/arrays.test.ts` (10 tests: Float64Array m/z, strict ascending, nonzero signal, cross-layout equivalence) | PASS |
| 5. Unsupported-encoding → named actionable error, no silent zeros | `src/reader/capability.test.ts` (14 tests: Numpress MS:1002312, aux arrays, directory storage all → `UnsupportedEncodingError`) | PASS |

### Reader Boundary Check

```
grep -rl "from ['\"]mzpeakts['\"]" src/
```

Result: `src/reader/openUrl.ts` only. Boundary holds.

---

## Task 2: PROC-01 Codex Reviews

### Phase-Start SHA

`24fa533` (commit immediately before Phase-1 execution began: "docs: relocate to mzPeakIV and rename project to mzPeakIV")

### Round 1 — Adversarial review of Phase-1 plan bundle

**Log:** `.planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND1.log`

**Verdict: `accept-with-revisions`**

Key findings (condensed):
- Import boundary contract evolved across plans (01-01 says only `openUrl.ts`; 01-02 adds `openFile.ts`; 01-03 settles on `src/reader/` directory) — creates tracking ambiguity.
- Staged progress may be flaky/fake on fast fixtures if mzpeakts doesn't expose intermediate hooks.
- `DATA-02` ordering risk: if mzpeakts eagerly reads signal during open, unsupported detection may fire too late to produce the named error.
- Stats acceptance criteria (msLevels, mzRange) could pass with partial/empty extraction.
- Several bindings underspecified: representation API contract, `FileMeta` unknown-field normalization, uPlot assertion depth.
- `computeCapabilities().unsupported` returned `[]` at plan-01 scope — noted as stub, resolved by 01-03.
- Bootstrap ordering hazard: `npm ci` depends on submodule being built first.
- `autonomous: false` in 01-04 but includes automated Codex runs (clarified in plan).

### Round 2 — Adversarial review of Phase-1 diff (since 24fa533)

**Log:** `.planning/phases/01-reader-foundation-open-and-inspect/01-CODEX-ROUND2.log`

**Verdict: `reject`**

Key findings (condensed):
- `LOAD-02` remains pending in REQUIREMENTS.md; no evidence remote/range-request URL loading is actually tested (only same-origin `/static/small.mzpeak` used in e2e).
- `openUrl.ts` calls `reader.spectrumData()` during load, potentially negating the staged progress contract (eager read may consume the whole zip-index stage time).
- `capabilityGate()` calls `reader.spectrumData()` before `detectUnsupported()` — may fail inside mzpeakts before named `UnsupportedEncodingError` can be thrown (DATA-02 ordering).
- `detectUnsupported()` relies on private `_spectrumDataReader`/`_spectrumPeaksReader` internals — unstable upstream coupling.
- `computeCapabilities()` still returns `unsupported: []` unconditionally (claims FMT-04/DATA-02 complete but CapabilitiesPanel can never show unsupported flags for loaded files).
- `Capabilities.encodings` populated from array type CURIEs, not transforms — misrepresents encoding vs. array type distinction.
- Chunked layout detection test accepts `["point","chunked","mixed"]` — doesn't prove chunked specifically detected.
- DATA-01 tests prove fixture equivalence, not correctness; no independent delta-decoding oracle.
- Submodule setup incomplete in diff: no visible gitlink/commit hash for pinned vendor.
- `bootstrap-reader.sh` falls back from `npm ci` to `npm install` (reproducibility weakened).
- REQUIREMENTS.md marks DATA-01/DATA-02 complete despite unproven unsupported paths.

---

## Task 3: Checkpoint (Awaiting Human Verification)

**Status:** Reached human-verify gate per plan 01-04 task 3 (`type="checkpoint:human-verify" gate="blocking"`).

**Required operator decision:**

Both Codex verdicts are now recorded. Per PROC-01:
- Round1: `accept-with-revisions` — noted findings, reasonable concerns about test coverage depth and acceptance strictness.
- Round2: `reject` — several substantive defects identified (LOAD-02 unverified with remote URL, DATA-02 ordering risk, private API coupling, unsupported array still unconditionally `[]`).

The operator must decide:
1. **Approve as-is** ("approved") — accept the `reject` verdict's risk items, close Phase 1, proceed to Phase 2 imaging grid.
2. **Address specific findings** — describe required revisions; a gap-closure loop will address them before closing.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint `no-unused-vars` failing on `_`-prefixed intentionally-unused params**
- **Found during:** Task 1 (`npm run lint`)
- **Issue:** ESLint flagged `_manifest` in `capability.ts` and `stats.ts`, `_acc`/`_i` in `stats.test.ts` as unused variables. The `_` prefix convention was used consistently across the codebase but the ESLint config lacked `argsIgnorePattern: "^_"`.
- **Fix:** Added `argsIgnorePattern`, `varsIgnorePattern`, and `caughtErrorsIgnorePattern: "^_"` to the `@typescript-eslint/no-unused-vars` rule in `eslint.config.js`.
- **Files modified:** `eslint.config.js`
- **Commit:** `1b52f8f`

**2. [Rule 1 - Bug] Unused variable `anyIntermediateLabel` in `local-file.spec.ts`**
- **Found during:** Task 1 (`npm run lint`)
- **Issue:** `anyIntermediateLabel` was assigned `page.getByTestId("loading-spinner")` but never used; the logic was replaced by the comment block below it.
- **Fix:** Removed the variable assignment; kept the intent as a comment.
- **Files modified:** `e2e/local-file.spec.ts`
- **Commit:** `1b52f8f`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — pre-existing lint oversights corrected during verification sweep)
**Impact on plan:** Both fixes are correctness/hygiene issues. No scope creep.

---

## Known Stubs

None in files created/modified by this plan.

---

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: repudiation | 01-04-SUMMARY.md | Both Codex verdict lines captured here for phase commit footer per T-01-04-REPUD mitigation |

---

## Self-Check: PASSED

- `01-CODEX-ROUND1.log` exists: confirmed
- `01-CODEX-ROUND2.log` exists: confirmed
- `01-04-SUMMARY.md`: this file (will be committed)
- Task commit `1b52f8f` (fix: lint errors): confirmed in git log
- All verification commands exit 0: confirmed

---

*Phase: 01-reader-foundation-open-and-inspect*
*Completed: 2026-06-03 (pending operator approval at checkpoint)*
