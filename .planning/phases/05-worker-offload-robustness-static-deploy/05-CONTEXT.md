# Phase 5: Worker Offload, Robustness & Static Deploy - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 makes the app production-ready: the entire read-and-compute pipeline moves into a Web Worker so the UI stays responsive on real-scale files, the error taxonomy is finalized with a distinct "not-imaging" flow, and the app ships as a static site to GitHub Pages.

**What this phase delivers:**
- Web Worker wrapping the full load pipeline (open → zip-index → manifest → grid → TIC → ready) and on-demand ion-image renders
- Three clearly distinct file-open outcomes: imaging file (happy path), non-imaging file (informational, partial app), unsupported/corrupt (error)
- GitHub Pages deploy via GitHub Actions
- Hardened `tools/codex_review.sh` per PROC-01

**Out of scope:**
- Live m/z scrubbing / in-memory full-column cache (v2 performance upgrade, noted in prior phases)
- New UI features, new colormaps, new analysis modes
- Multi-file or side-by-side comparison

</domain>

<decisions>
## Implementation Decisions

### Worker Scope and Trigger (UX-01)
- **D-01:** The **"Show Ion Image" button stays** — explicit user intent, no spurious renders while typing. The Worker removes the main-thread block, but the button provides a clear trigger boundary and avoids wasted Worker round-trips for partial m/z values.
- **D-02:** The button **shows a spinner / "Computing…" label and is disabled** while a Worker request is in flight. This prevents double-submits and gives clear feedback for large files where the Worker may take several seconds.
- **D-03:** The **full load pipeline moves into the Worker** — not just ion-image render. Every blocking operation (ZIP open, Parquet read, grid reconstruction, TIC compute, extractXIC) runs off the main thread. Architecture: one Worker owns all file interaction. The main thread receives structured progress messages and final result objects.

### "Not-Imaging" File Handling (UX-01)
- **D-04:** A valid mzPeak file with no spatial coordinates is **not an error** — it is a distinct successful outcome. The app shows a friendly informational message in the imaging section: "This file contains mass spectra but no spatial imaging coordinates. Open an imaging file to explore ion images."
- **D-05:** For non-imaging files, the **metadata panel, manifest, and spectrum browser remain accessible** — only the TIC/ion-image canvas area shows the "no spatial coordinates" notice. The file is still useful for spectrum inspection.
- **D-06:** Implement as a **new `LoadStage` value `'no-imaging'`** rather than a third `ReaderErrorClass` variant. A non-imaging file is a valid, successful read that routes to a different UI mode — it is not a failure. `classifyError()` and the error taxonomy remain for actual failures only.

### Claude's Discretion
- Worker API technology (Comlink vs raw postMessage vs custom protocol) — pick whichever integrates cleanly with the existing async store pattern and keeps the planner/executor's work straightforward
- Abort/cancel signal design for in-flight Worker requests
- Exact debounce interval (if any — button is primary trigger per D-01)
- GitHub Pages deploy trigger (push-to-main CI or manual `gh-pages` deploy) — implement a standard GitHub Actions workflow matching the Vite static-deploy docs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing architecture
- `src/state/store.ts` — Current LoadStage type, error shape, and the full async pipeline (openUrl/openFile) that moves into the Worker
- `src/reader/errors.ts` — Current error taxonomy (`UnsupportedEncodingError`, `CorruptFileError`, `ReaderErrorClass`) — Phase 5 does NOT add to ReaderErrorClass; "not-imaging" is a LoadStage
- `src/reader/types.ts` — Reader boundary types
- `vite.config.ts` — Current `base: "/mzPeakIV/"` (placeholder — confirm GitHub repo name before wiring GitHub Actions)

### Phase decisions and constraints
- `.planning/phases/04-ion-image-intensity-scaling/04-CONTEXT.md` — D-01/D-02 (button trigger, colormap caching) — D-01 is preserved, D-02 is unchanged
- `.planning/phases/03-tic-image-pixel-spectrum-round-trip/03-CONTEXT.md` — D-01/D-02 (TIC LoadStage chain) — Worker wraps this chain, not replaces it
- `CLAUDE.md` § Constraints — Client-side only; no COOP/COEP (parquet-wasm 0.7.1 is single-threaded, no SharedArrayBuffer)
- `CLAUDE.md` § PROC-01 — Codex adversarial review convention; Phase 5 hardens `tools/codex_review.sh`

### Deploy
- `CLAUDE.md` § GitHub Pages deploy — `base: '/<REPO>/'`, hashed `.wasm` asset, no single-file inlining

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/state/store.ts` `LoadStage` — add `'no-imaging'` as a new variant; the stage-driven UI pattern is already established
- `src/reader/errors.ts` — `UnsupportedEncodingError` and `CorruptFileError` carry through to the Worker path unchanged; they are thrown inside the Worker and `postMessage`'d as serialized error objects
- `tools/codex_review.sh` — already functional for Phase 4; Phase 5 hardens edge cases (empty diff, missing codex binary error message, etc.)

### Established Patterns
- **LoadStage chain** — the `'zip-index' → 'manifest' → 'metadata' → 'grid' → 'tic' → 'ready'` progression is the UI's source of truth for progress; the Worker sends progress messages that update this chain on the main thread
- **Store-owns-state** — the Worker is stateless (no store reference); the main-thread store receives Worker results and drives all UI state changes
- **`classifyError`** — stays on the main thread; serialized error objects from the Worker are classified here

### Integration Points
- The Worker replaces the `async openUrl` / `async openFile` body in `store.ts` — the store becomes a message dispatcher
- The ion-image render path (`renderIonImage` action in store.ts) posts a Worker message and awaits the `Float32Array` result; store then calls `buildIonImage` / `rasterizeImage` on the main thread (pure, fast) or optionally in the Worker
- `ImagingPanel.tsx` button loading state wires to a new `isRendering: boolean` store field set on Worker message dispatch/response

</code_context>

<specifics>
## Specific Ideas

- "Computing…" label on the button (not a spinner icon) — matches the text-first style of the current UI
- Informational message for non-imaging files should use the same neutral text style as the existing metadata panel, not a warning color

</specifics>

<deferred>
## Deferred Ideas

- Live m/z scrubbing (debounced auto-trigger) — deferred pending v2 performance work; button stays per D-01
- In-memory full-column cache in the Worker for instant m/z scrubbing — explicitly deferred in Phase 3 CONTEXT.md, still deferred
- Lazy Parquet row-group projection for multi-GB files — v2

</deferred>

---

*Phase: 5-Worker Offload, Robustness & Static Deploy*
*Context gathered: 2026-06-04*
