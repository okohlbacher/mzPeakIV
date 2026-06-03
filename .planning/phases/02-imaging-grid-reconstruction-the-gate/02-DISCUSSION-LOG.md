# Phase 2: Imaging Grid Reconstruction (THE GATE) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 02-imaging-grid-reconstruction-the-gate
**Areas discussed:** Test fixtures, Grid diagnostics UI placement, Grid build timing

---

## Test Fixture Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Not yet — synthetic fixtures | Build and test against in-memory synthetic Arrow tables. PXD001283 unlock test added as a gated TODO. | ✓ |
| Available — I'll provide the file | Operator provides PXD001283.mzpeak; tests built directly against 260×134 ground truth. | |

**User's choice:** Not yet — synthetic fixtures (recommended)
**Notes:** PXD001283 conversion is pending. Phase 2 will include an `existsSync`-gated Vitest test that activates when the file is dropped in `test/data/`.

---

## Grid Diagnostics UI Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline expandable section | Compact summary always visible below Capabilities; click to expand full diagnostics. | ✓ |
| Separate diagnostics panel | Dedicated panel/tab with more space for a diagnostic table. | |
| Badge + popover | Small badge next to filename; click for popover with details. | |

**User's choice:** Inline expandable section (recommended)
**Notes:** Fits the existing left-panel pattern from Phase 1. Non-imaging files show "Not imaging data" notice in this section (not an error).

---

## Grid Build Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Eager — during file load | New `grid` LoadStage after `metadata`. Grid ready by UI render. | ✓ |
| Lazy — on first imaging panel interaction | Grid built on demand; faster initial load for non-imaging files. | |

**User's choice:** Eager during file load (recommended)
**Notes:** Single Arrow column read for 34,840 rows is fast. Diagnostics immediately available. Simpler store logic.

---

## Claude's Discretion

- **Reader extension approach:** `src/reader/scanCoords.ts` (new file in existing boundary), returns plain `{x, y}[]` with bigint→number conversion. Decided without asking: consistent with Phase 1 `arrays.ts`/`stats.ts` pattern.
- **`ImagingGrid` type shape:** `{ width, height, pixelSizeUm, coordToSpectrumIndex: Map, presenceMask: Uint8Array, filledCount, totalCells, coordSourceStrategy, diagnostics }` — decided without asking; follows the ARCHITECTURE.md grid design.
- **CoordSource fallback chain:** promoted columns → cvParams → id-parse → null (per IMAGING-SPEC-ALIGNMENT.md C1 constraints, no user choice needed).

## Deferred Ideas

- Cosmetic orientation flip control (view-only toggle) — Phase 3 or 4.
- PXD001283 conversion — operator task; the unlock test waits for it.
