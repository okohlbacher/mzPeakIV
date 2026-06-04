---
phase: 05-worker-offload-robustness-static-deploy
plan: "04"
subsystem: ui-deploy
tags:
  - no-imaging
  - isRendering
  - deploy
  - github-actions
  - codex-review

dependency-graph:
  requires:
    - "05-03"  # isRendering field in store.ts; no-imaging onmessage handler
  provides:
    - "05-05"  # e2e tests can now trigger the no-imaging UX path
  affects:
    - src/ui/App.tsx                         # no-imaging branch added
    - src/ui/ImagingPanel.tsx                # isRendering button state
    - .github/workflows/deploy.yml           # new GitHub Pages deploy workflow
    - tools/codex_review.sh                  # empty-diff hardening

tech-stack:
  added: []
  patterns:
    - "stage === 'no-imaging' branch in App.tsx — renders metadata panels + informational notice + SpectrumPanel, omits GridDiagnosticsPanel and ImagingPanel (D-04/D-05)"
    - "isRendering selector via useStore((s) => s.isRendering) in ImagingPanel — one-selector-per-line pattern"
    - "Button disabled/cursor/opacity wired to isRendering; label toggles Computing… / Show Ion Image (D-02)"
    - "GitHub Actions jobs.build + jobs.deploy split — build uploads artifact, deploy consumes it (GitHub Pages v4 API)"
    - "upload-pages-artifact@v4 + deploy-pages@v4 — not v3 (deprecated Jan 2025)"
    - "touch dist/.nojekyll before artifact upload — prevents Jekyll binary-asset mangling"
    - "DIFF capture + empty-diff guard in round2 case — exits 1 before calling codex binary (T-05-10)"

key-files:
  created:
    - .github/workflows/deploy.yml
  modified:
    - src/ui/App.tsx
    - src/ui/ImagingPanel.tsx
    - tools/codex_review.sh

decisions:
  - "disabled expression computed inline from mzInput/tolInput state (no pre-computed mzValid variable exists in ImagingPanel) — guards isRendering OR invalid numeric inputs"
  - "no-imaging branch placed BEFORE stage===ready in App.tsx JSX — both are mutually exclusive terminal states, ordering is cosmetic"
  - "npm run bootstrap script confirmed as the correct name (package.json scripts.bootstrap)"
  - "Build step VITE_BASE=/mzPeakIV/ matches vite.config.ts placeholder (process.env.VITE_BASE ?? '/mzPeakIV/')"
  - "vite build (npm run build) has a pre-existing vite-plugin-top-level-await TypeError in Worker bundle — not caused by this plan; tsc -b exits 0 confirming TypeScript correctness"

metrics:
  duration: "15 minutes"
  completed: "2026-06-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 05 Plan 04: UI Wire-Up, Deploy Workflow, Codex Hardening Summary

**One-liner:** No-imaging UX branch wired in App.tsx, isRendering Computing… button state active in ImagingPanel, GitHub Actions deploy.yml created with upload-pages-artifact@v4, and codex_review.sh hardened with empty-diff exit guard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ProgressBar, App.tsx, ImagingPanel — wire no-imaging and isRendering | 8103747 | src/ui/App.tsx, src/ui/ImagingPanel.tsx |
| 2 | GitHub Actions deploy.yml + codex_review.sh hardening | c81dcf7 | .github/workflows/deploy.yml, tools/codex_review.sh |

## What Was Built

### src/ui/App.tsx

**Stage sentinel ternary** (data-testid="stage" span): added `stage === "no-imaging"` branch yielding "No Imaging Data" before the `stage === "ready"` branch.

**no-imaging right-pane branch**: renders `<main>` with a 400px aside (MetadataPanel + StatsPanel + CapabilitiesPanel — GridDiagnosticsPanel omitted, no grid exists) and an informational div with neutral `#555` text: "This file contains mass spectra but no spatial imaging coordinates." + SpectrumPanel for spectrum browsing (D-04/D-05).

**loading boolean** left unchanged — `no-imaging` is a terminal state, not a loading step.

### src/ui/ImagingPanel.tsx

**isRendering selector**: `const isRendering = useStore((s) => s.isRendering)` added after the existing Phase 4 store subscriptions block (line 87), following the one-selector-per-line pattern.

**Button changes**: disabled when `isRendering || !mzInputValid` (computed inline from mzInput/tolInput Number checks); `cursor: "wait"` and `opacity: 0.7` when rendering; label switches to `"Computing…"` (unicode ellipsis, matching CONTEXT.md D-02 spec).

### .github/workflows/deploy.yml

Two-job workflow:

- **build** (ubuntu-latest): checkout@v4 with `submodules: true`, setup-node@v4 node-version:22 cache:npm, `npm run bootstrap` (builds vendor/mzpeakts), `npm ci`, `npm run build` with `VITE_BASE: /mzPeakIV/`, `touch dist/.nojekyll`, upload-pages-artifact@v4 path:./dist
- **deploy** (ubuntu-latest): needs:build, github-pages environment with page_url output, deploy-pages@v4

Permissions: `contents: read, pages: write, id-token: write` (minimal scopes, T-05-08).
Concurrency: group "pages", cancel-in-progress: false.
Triggers: push to main + workflow_dispatch.

### tools/codex_review.sh

Round2 `build_prompt` case hardened: diff captured into `DIFF` variable; if empty exits 1 with "ERROR: diff from ${SHA} is empty — ensure phase work is committed before running round2"; otherwise `printf '%s\n' "$DIFF"`. Both `--dry-run` invocations confirmed to exit 0.

## Verification Results

```
1. tsc -b exits 0:                                        PASS
2. grep "no-imaging" ProgressBar.tsx STAGE_LABEL:         PASS — "no-imaging": "No Imaging Data"
3. ProgressBar.tsx STAGES array has no "no-imaging":      PASS — array ends at "ready"
4. grep "no-imaging" App.tsx (sentinel + branch):         PASS — lines 53, 67
5. App.tsx no-imaging branch has informational text:      PASS
6. App.tsx no-imaging branch renders SpectrumPanel:       PASS
7. App.tsx no-imaging branch omits ImagingPanel/Grid:     PASS
8. grep "isRendering" ImagingPanel.tsx selector:          PASS — line 87
9. grep "isRendering" ImagingPanel.tsx button:            PASS — lines 345, 351, 352, 355
10. ls .github/workflows/deploy.yml:                      PASS
11. grep upload-pages-artifact@v4 deploy.yml:             PASS
12. grep deploy-pages@v4 deploy.yml:                      PASS
13. grep nojekyll deploy.yml:                             PASS
14. grep VITE_BASE deploy.yml:                            PASS — /mzPeakIV/
15. grep submodules deploy.yml:                           PASS — true
16. grep DIFF= codex_review.sh:                           PASS
17. grep empty.*diff codex_review.sh:                     PASS
18. round1 dry-run exits 0:                               PASS
19. round2 dry-run exits 0:                               PASS
20. python3 yaml.safe_load deploy.yml:                    PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Adaptation] mzValid computed inline rather than referencing named variable**
- **Found during:** Task 1 — ImagingPanel has no pre-computed `mzValid` variable; validation is inline in `handleRenderIonImage()`
- **Issue:** Plan said "check the actual variable name in the file" — no such variable exists
- **Fix:** Computed validity inline in the `disabled` prop: `!(Number.isFinite(Number(mzInput)) && Number(mzInput) > 0 && Number.isFinite(Number(tolInput)) && Number(tolInput) > 0)`. Logic is equivalent to the existing `handleRenderIonImage()` guard.
- **Files modified:** src/ui/ImagingPanel.tsx
- **Commit:** 8103747

### Pre-existing Issues (not caused by this plan)

**vite build vite-plugin-top-level-await TypeError in Worker bundle:**
- `npm run build` fails with "TypeError: The 'path' argument must be of type string. Received undefined" in vite-plugin-top-level-await during Worker bundle generation.
- Confirmed pre-existing on main branch (git stash + build reproduced the same error).
- Not caused by any changes in this plan.
- TypeScript compilation (`tsc -b`) exits 0 cleanly, confirming type correctness.
- Deferred: Worker WASM plugin configuration issue requires investigation in a separate plan.

## Known Stubs

None. All state is driven by Worker messages. The informational notice for non-imaging files contains final text, not placeholders.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: github-actions-permissions | .github/workflows/deploy.yml | New GitHub Actions workflow with pages:write + id-token:write permissions. Scoped to contents:read only (no repo write access). Mitigation T-05-08 implemented: minimal permission set. |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/ui/App.tsx modified | FOUND |
| src/ui/ImagingPanel.tsx modified | FOUND |
| .github/workflows/deploy.yml created | FOUND |
| tools/codex_review.sh modified | FOUND |
| 05-04-SUMMARY.md created | FOUND |
| Commit 8103747 (Task 1) | FOUND |
| Commit c81dcf7 (Task 2) | FOUND |
| no-imaging in ProgressBar STAGE_LABEL | CONFIRMED |
| no-imaging absent from ProgressBar STAGES | CONFIRMED |
| stage sentinel no-imaging branch | CONFIRMED (line 53) |
| no-imaging right-pane branch | CONFIRMED (line 67) |
| isRendering selector in ImagingPanel | CONFIRMED (line 87) |
| button disabled/cursor/label wired | CONFIRMED (lines 345, 351, 352, 355) |
| upload-pages-artifact@v4 | CONFIRMED |
| deploy-pages@v4 | CONFIRMED |
| touch dist/.nojekyll | CONFIRMED |
| VITE_BASE: /mzPeakIV/ | CONFIRMED |
| submodules: true | CONFIRMED |
| DIFF empty-guard in codex_review.sh | CONFIRMED |
| round1 dry-run exits 0 | CONFIRMED |
| round2 dry-run exits 0 | CONFIRMED |
| tsc -b exits 0 | CONFIRMED |
