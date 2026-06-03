# Walking Skeleton — mzPeakExplorer

**Phase:** 1
**Generated:** 2026-06-03 (planner-emitted contract; finalized by plan 01-01 Task 4 during execution)

## Capability Proven End-to-End

A user opens a REAL demo `.mzpeak` from a URL in the browser, sees the parsed manifest + real file-level metadata, selects a spectrum by index, and sees that spectrum's reconstructed m/z + intensity arrays plotted in uPlot — served by `npm run dev` / `npm run preview`, with the vendored WASM reader running client-side and no COOP/COEP headers.

This proves the single biggest unknown — *does the vendored mzpeakts + parquet-wasm chain actually run in-browser end-to-end* — independent of the Phase-2 imaging-coordinate risk.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build/dev tooling | Vite 8.0.16 + @vitejs/plugin-react 6.0.2 | Current SPA stack; first-class GitHub Pages `base`; official WASM plugin support (STACK.md). |
| UI framework | React 19.2.7 + TypeScript ~5.9 | Current stable; TS pinned to ~5.9 (NOT 6.x) for lint-toolchain stability (STACK.md). |
| Reader | Vendored `mzpeakts` via git submodule (`vendor/mzpeakts`) + `file:vendor/mzpeakts/lib` install, pinned to a specific commit | Format is unstable; submodule preserves provenance + clean updates; build the same artifact upstream ships (STACK.md Option A). Single import site: `src/reader/`. |
| WASM Parquet | parquet-wasm 0.7.1 (single-threaded ESM) + apache-arrow 21.1.0 + arrow-js-ffi 0.4.3 + @zip.js/zip.js 2.8.26 | Already handles ZIP/Parquet/Arrow + point/chunked/delta. Single-threaded => **no COOP/COEP / SharedArrayBuffer / coi-serviceworker** (proven by upstream demo on GitHub Pages). Do not split arrow/parquet-wasm majors. |
| WASM serving | vite-plugin-wasm + vite-plugin-top-level-await; `.wasm` emitted as a hashed asset (NOT inlined) | Required for the reader to import/init; never use vite-plugin-singlefile (would break caching). |
| Spectra plotting | uPlot 1.6.32, mounted via `useRef` (no React wrapper) | Fastest tiny canvas line chart for dense 1D series. |
| Images (later) | Canvas 2D | Few-thousand-pixel grid via one `putImageData`; WebGL is over-engineering at this scale (P3+). |
| State | zustand (light store; no business logic) | Selector subscriptions avoid re-rendering the spectrum panel when only metadata changes. |
| Type boundary | Nothing above `src/reader/` imports apache-arrow or uses bigint; plain `{x,y}`, `Float64Array`, `Float32Array`, POJOs only | ARCHITECTURE anti-pattern 2 — isolate the unstable format to one folder. |
| Directory layout | `src/reader/` `src/imaging/` `src/compute/` `src/render/` `src/state/` `src/ui/` | Bottom-up four-layer pipeline (ARCHITECTURE); imaging/compute/render folders are empty placeholders until P2-P4. |
| Deployment | GitHub Pages via GitHub Actions (build submodule, `npm ci`, `npm run build`, upload-pages-artifact); `base: '/<repo>/'` | Static, client-side, range-request-friendly. `base` value + Actions workflow finalized/hardened in Phase 5. |
| Review harness | `tools/codex_review.sh` round1 (plan) / round2 (diff) per PROC-01; logs gitignored | Bootstrapped here so Phase 1 onward is adversarially reviewed; hardened in P5. |
| Test runners | Vitest 4.1.8 (unit) + Playwright 1.60.0 (browser round-trip) | Same Vite pipeline resolves WASM/Arrow imports in unit tests; Playwright validates the real WASM+Canvas path. |
| Canonical demo fixture | (recorded by 01-01 Task 4) e.g. `small.mzpeak` (point) by URL/vendored; `small.chunked.mzpeak`, `small.numpress.mzpeak`, `has_uv.mzpeak` for DATA tests | Upstream demo files are the Phase-1 fixtures. |
| parquet-wasm consumption | (recorded by 01-01 Task 4) vendored `.tgz` from the submodule OR `parquet-wasm@0.7.1` from npm (identical bits) | Document which path CI uses. |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + React + TS, ESLint flat config, Prettier, Vitest, Playwright)
- [x] Routing — single-page app shell (`App.tsx`); no path router needed
- [x] "Data layer" read — real `.mzpeak` opened from URL (01-01) and local file (01-02); per-spectrum arrays reconstructed (01-01/01-03). (No write — this is a read-only explorer; N/A by design.)
- [x] UI interaction wired to the reader — spectrum-index selector -> `getSpectrumArrays` -> uPlot chart
- [x] Deployment — runs on `npm run dev` / `vite preview`; full GitHub Pages workflow deferred to P5 (documented local full-stack run command exists)

## Out of Scope (Deferred to Later Slices)

Explicitly NOT in this skeleton (do not re-litigate Phase 1's minimalism):

- Imaging coordinate extraction / pixel-grid reconstruction — **Phase 2 (the gate)**.
- TIC image, ion image, colormaps, intensity scaling, pixel hover/click round-trip — **Phases 3-4**.
- Web Worker offload of reader/grid/builders — **Phase 5**.
- Full three-class error taxonomy ("not imaging" vs "unsupported encoding" vs "corrupt") — only the unsupported-encoding + corrupt classes ship in Phase 1 (01-03); the "not imaging" class is surfaced from P2 and finalized in P5.
- Production GitHub Pages deploy hardening + final `base` value — Phase 5.
- In-memory full-column cache / lazy row-group projection — v2 (perf).
- Visual design system / polish — plumbing-grade UI only in Phase 1.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing its architectural decisions:

- **Phase 2:** Reconstruct the spatial pixel grid via a swappable `CoordSource` strategy (`src/imaging/`); gated on a real operator imaging `.mzpeak`.
- **Phase 3:** TIC spatial overview + pixel -> spectrum round-trip (`src/compute/`, `src/render/`, Canvas2D + the existing uPlot panel).
- **Phase 4:** Ion image for m/z ± Da/ppm tolerance + colormaps + linear/log + percentile scaling.
- **Phase 5:** Move reader+grid+builders into a Web Worker, finalize the error taxonomy, ship to GitHub Pages, harden `tools/codex_review.sh`.
