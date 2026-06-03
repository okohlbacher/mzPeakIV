# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** Open an imaging mzPeak file in a browser → pick an *m/z* → see a correct ion image → click a pixel → see its spectrum.
**Current focus:** Phase 1 — Reader Foundation + Open-and-Inspect

## Current Position

Phase: 1 of 5 (Reader Foundation + Open-and-Inspect)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-06-03 — Roadmap created (5 phases, coarse granularity, mvp mode)

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
- Imaging coordinate convention (imzML `IMS:1000050/51`) is a hypothesis only — must be validated against the operator's real imaging `.mzpeak` in Phase 2 (the gate).
- Each phase bracketed by Codex adversarial review (PROC-01).

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 2 gate:** Imaging grid reconstruction is blocked on the operator supplying a real imaging `.mzpeak` as ground truth. No public imaging example exists; the coordinate convention is unconfirmed. Do not build rendering on an unvalidated grid.
- **Capability scope (Phase 1):** which `chunk_encoding`/`buffer_format`/CV-term values the real file uses determines what the capability check must refuse vs accept — confirm by inspecting the real file.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-03
Stopped at: ROADMAP.md and STATE.md created; REQUIREMENTS.md traceability filled. Ready to plan Phase 1.
Resume file: None
