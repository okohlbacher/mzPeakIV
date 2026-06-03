# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** Open an imaging mzPeak file in a browser → pick an *m/z* → see a correct ion image → click a pixel → see its spectrum.
**Current focus:** Phase 1 — Reader Foundation + Open-and-Inspect

## Current Position

Phase: 1 of 5 (Reader Foundation + Open-and-Inspect)
Plan: 0 of 4 complete (4 plans + SKELETON.md created)
Status: Planned — ready to execute (awaiting operator go / `/gsd:execute-phase 1`)
Last activity: 2026-06-03 — Ingested imaging-mzpeak-spec v0.3 + aligned viewer artifacts (PROJECT/REQUIREMENTS/ROADMAP/CLAUDE/CONTEXT); added DATA-03; Phase 2 unblocked. (Prior: Phase 1 planned — 4 plans, walking skeleton, plan-checker PASS.)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Build on vendored `mzpeakts`; do not reimplement ZIP/Parquet/Arrow parsing.
- Vite + React + TypeScript + Canvas2D + uPlot; fully client-side, static-hosted.
- Imaging coordinate convention is SPECIFIED (imaging-mzpeak-spec v0.3): promoted `Int64` `scan` columns `IMS_1000050/51_position_x/y` (1-based, authoritative), fixed top-left orientation, signal-file routing by `MS_1000525`, grid from `IMS:1000042/43/46/47` + `metadata.imaging`. See `.planning/research/IMAGING-SPEC-ALIGNMENT.md`.
- Each phase bracketed by Codex adversarial review (PROC-01).

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 2 gate (DOWNGRADED 2026-06-03):** the imaging coordinate convention is now SPECIFIED by `imaging-mzpeak-spec v0.3` (ingested; see `.planning/research/IMAGING-SPEC-ALIGNMENT.md`). Phase 2 is plannable/buildable against the spec + synthetic fixtures. The converted **PXD001283** `.mzpeak` is now a *validation* input (260×134), not a precondition to start. Spec is pre-merge into base mzPeak → keep the CoordSource fallback chain.
- **Capability scope (Phase 1):** which `chunk_encoding`/`buffer_format`/CV-term values real files use determines what the capability check must refuse vs accept — confirm against converter output (the imzML2mzPeak project) and PXD001283.
- **Signal-file routing (DATA-03, new):** ion-image + spectrum reads must select `spectra_data` (profile) vs `spectra_peaks` (centroid) by `MS_1000525` — do not assume `spectra_data`.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-03
Stopped at: Phase 1 planned and committed (4 PLAN.md + SKELETON.md). Plan-checker PASS. Ready to execute Phase 1 (`/gsd:execute-phase 1`).
Resume file: None
