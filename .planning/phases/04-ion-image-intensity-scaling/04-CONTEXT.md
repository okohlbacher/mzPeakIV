# Phase 4: Ion Image + Intensity Scaling — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the **headline deliverable**: a user enters an *m/z* + tolerance (Da or ppm) and sees a correct ion image rendered below the existing TIC canvas. The user can choose a colormap and intensity scaling mode; image statistics prevent "falsely blank" confusion; and the selected *m/z* window is marked on the clicked-pixel spectrum (SPEC-02).

**In scope:**
- m/z input + tolerance + Da/ppm unit selector + "Show Ion Image" button (IMAGE-02 trigger)
- Ion image compute via `extractXIC(mzRange, useProfile)` — the same reader primitive Phase 3 uses for TIC
- ppm → Da conversion at center m/z (unit-tested, locked by ROADMAP success criteria 1)
- Colormap selector (Viridis / Inferno / Grayscale) + linear/log toggle + percentile clip dropdown
- Re-rasterize from cached `Float32Array` on colormap/scale change — no file re-query (ROADMAP success criteria 5)
- Text stats readout: nonzero-pixel count, value range, scale mode (blank-prevention, ROADMAP success criteria 3)
- SPEC-02: shaded translucent band on uPlot spectrum chart marking the current m/z ± tolerance window
- PROC-01 Codex round1 (plan) + round2 (diff)

**Out of scope (later phases):**
- Web Worker offload for ion-image/TIC compute — Phase 5
- Layout or visual polish beyond functional plumbing — Phase 5
- Full error taxonomy UX (UX-01) — Phase 5

</domain>

<decisions>
## Implementation Decisions

### m/z Query Trigger (IMAGE-02)
- **D-01:** Rendering an ion image requires the user to click an explicit **"Show Ion Image" button**. No debounce or live-update while typing — `extractXIC` is a file read that blocks the main thread at Phase 4 scale; the Worker arrives in Phase 5.
- **D-02:** **Colormap and scale changes re-rasterize the cached `Float32Array` automatically** without pressing the button (no file re-query). This is the locked behavior from ROADMAP success criteria 5. Only m/z or tolerance changes require the button.
- **D-03:** ppm → Da conversion: `tol_da = (mz * ppm_tol) / 1e6` — computed at the center m/z before calling `extractXIC`. Unit-tested as a standalone pure function.

### Canvas / Display Mode
- **D-04:** Phase 4 uses **two separate canvases**: the TIC canvas always remains visible above; the ion image canvas appears **below** the compact controls row, rendered only after the first "Show Ion Image" click. The ion image canvas is not rendered (no placeholder) until first render.
- **D-05:** **Both canvases wire to `selectSpectrum`** for pixel-click. Clicking a pixel on the ion image canvas selects that pixel's spectrum (same behavior as TIC canvas from Phase 3). This means SPEC-02's m/z window marker also appears on the spectrum after a pixel-click from the ion image.
- **D-06:** The ion image canvas reuses the same hit-test (`toGridCoord`), hover readout, and selection-ring patterns from `ImagingPanel.tsx`. The hover readout for the ion image shows `x: N, y: N · intensity: N` (the XIC-aggregated value, not TIC sum). Missing pixels still render as the `#1a1a1a` sentinel.

### Controls Layout
- **D-07:** All controls live in a **single compact row above the TIC canvas**: `m/z` (number input) | `±` | `tolerance` (number input) | `Da/ppm` (select) | `[Show Ion Image]` button | colormap (select) | `linear/log` (toggle/select) | percentile clip (select).
- **D-08:** **Colormaps:** Viridis (default, already in `rasterize.ts`), Inferno, Grayscale. Three options. The colormap function in `rasterize.ts` is already designed as a swappable pure function — Phase 4 adds Inferno and Grayscale LUTs alongside `viridis()`.
- **D-09:** **Percentile clip:** preset dropdown with options `90th / 95th / 99th (default) / 99.9th`. Wires directly into the `percentile99` function signature (the percentile value is now parameterized instead of hardcoded at 0.99).
- **D-10:** **linear/log toggle:** log scaling uses `Math.log1p(v)` on the raw values before normalization. The stats readout labels the mode explicitly.

### Blank-Prevention + SPEC-02 Readout
- **D-11:** **Text stats line below the ion image canvas**: `{N} / {total} pixels with signal · range {min}–{max} · scale: {linear|log} ({Nth} pct)`. Uses the same `formatCompact()` helper from `ImagingPanel.tsx`. Always visible when the ion image is rendered.
- **D-12:** **SPEC-02 m/z window marker:** a **translucent shaded band** (filled rectangle) on the uPlot spectrum chart spanning `[mz - tol_da, mz + tol_da]`. Implemented via uPlot's `hooks.drawSeries` or a custom over-plugin — a DOM-free approach that matches how SpectrumPanel already mounts uPlot imperatively. The band only renders when a m/z has been entered (i.e., `mzWindow !== null` in store).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 output (what Phase 4 builds directly on top of)
- `.planning/phases/03-tic-image-pixel-spectrum-round-trip/03-CONTEXT.md` — D-01 through D-09; especially D-01 (`extractXIC` as ion-image primitive), D-06 (selection ring), D-07/D-08 (signal-file routing), D-09 (absent pixel sentinel). Phase 4 extends all of these.
- `src/ui/ImagingPanel.tsx` — current TIC canvas, pixel-click, hover readout, `rasterizeTic` call — Phase 4 adds m/z controls above and ion image canvas below
- `src/ui/rasterize.ts` — `viridis()`, `percentile99()`, `rasterizeTic()` — Phase 4 extends these; `viridis()` is already documented as "ONE swappable pure function so Phase 4 can add a selector without a refactor"
- `src/state/store.ts` — current store shape; Phase 4 adds `mzWindow`, `ionImage: Float32Array | null`, `ionImageStats` slice
- `src/ui/SpectrumPanel.tsx` — existing uPlot chart; Phase 4 adds SPEC-02 shaded band hook here

### Reader primitive (ion-image compute)
- `vendor/mzpeakts/lib/src/reader.ts` — `extractXIC(timeRange, mzRange, useProfile)` signature; `mzRange` is `[mzMin, mzMax]` — Phase 4 calls this with the narrow window
- `src/reader/stats.ts` — `representationCounts` for deriving `useProfile` (same logic as Phase 3 D-08)

### Imaging spec (correctness invariants)
- `.planning/research/IMAGING-SPEC-ALIGNMENT.md` — C2 (no flip/transpose, mandatory for ion image rasterizer too), C5 (pixel aspect), C8 (absent ≠ zero sentinel). Same constraints apply to the ion image rasterizer as to TIC.

### Requirements
- `.planning/REQUIREMENTS.md` — IMAGE-02, IMAGE-03, SPEC-02 (Phase 4 requirements)
- `.planning/ROADMAP.md` — Phase 4 success criteria (5 items), especially SC-5 (recolor from cache) and SC-3 (blank-prevention readout)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/rasterize.ts` — `viridis()` (swappable, add Inferno + Grayscale alongside), `percentile99(tic, presenceMask)` (parameterize the 0.99 threshold), `rasterizeTic()` (rename/generalize to `rasterizeImage(values, grid, colormap, percentile, logScale)` for Phase 4 — TIC was the only caller)
- `src/ui/ImagingPanel.tsx` — `toGridCoord()`, `formatCompact()`, `keyForSpectrumIndex()`, `onMove()`, `onClick()`, hover readout pattern — all reusable as-is or with minor edits for the ion image canvas
- `src/state/store.ts` — `selectSpectrum()`, `runLoad()` staged pattern, `yieldFrame()`, `classifyError()` — all carry over unchanged
- `src/ui/SpectrumPanel.tsx` — uPlot imperative mount (`useRef` + `new uPlot(opts, data, el)`) — Phase 4 adds a `hooks.draw` callback or `over` plugin to render the shaded m/z band

### Established Patterns
- **Single reader import boundary:** `src/reader/` is the only folder importing mzpeakts. `src/compute/` receives `XICPoint[]` as plain objects — no Arrow types above reader boundary. Ion image builder lands in `src/compute/ionImage.ts` (mirrors `src/compute/tic.ts`).
- **Store-centric staged state:** `mzWindow` + `ionImage` + `ionImageStats` live in the store. Phase 4 does not add a new LoadStage (ion image is on-demand, not part of the initial load pipeline).
- **Canvas 2D / ImageData pattern:** `new ImageData(width, height)` → fill RGBA → `ctx.putImageData` → `ctx.strokeRect` ring. Same for ion image canvas.
- **Pure rasterizer split (UI-SPEC Pitfall 4):** rasterize functions are DOM-free, testable in Vitest without a canvas. This split must be preserved for the new `rasterizeImage()` function.

### Integration Points
- `src/ui/ImagingPanel.tsx` gains a controls row (above TIC canvas) and an ion image `<canvas>` section (below TIC canvas, conditionally rendered)
- `src/state/store.ts` gains: `mzWindow: { mz: number; tolDa: number } | null`, `ionImage: Float32Array | null`, `ionImageStats: { nonzeroCount: number; min: number; max: number } | null`, `renderIonImage(mz, tolDa): Promise<void>`, `setColormapSettings(colormap, scale, percentile): void`
- `src/ui/SpectrumPanel.tsx` — reads `mzWindow` from store; adds a `hooks.draw` that fills a translucent rect over `[mz - tolDa, mz + tolDa]` on every redraw
- `src/compute/ionImage.ts` — new file: `buildIonImage(xic: XIC, grid: ImagingGrid): Float32Array` (mirrors `buildTic` in `src/compute/tic.ts`)

</code_context>

<specifics>
## Specific Ideas

- **ppm→Da conversion function:** `export function ppmToDa(mz: number, ppm: number): number { return (mz * ppm) / 1e6; }` — pure, unit-tested in isolation. Called by the Render button handler before building `mzRange = [mz - tol, mz + tol]`.
- **`rasterizeImage` signature (generalizing `rasterizeTic`):** `rasterizeImage(values: Float32Array, grid: ImagingGrid, colormap: Colormap, percentile: number, logScale: boolean): Uint8ClampedArray`. The `Colormap` type is a union (`'viridis' | 'inferno' | 'gray'`) or a function `(t: number) => [number, number, number]`. Since Phase 4 uses only a fixed set, the union is simpler — the switch inside `rasterizeImage` selects the LUT.
- **Inferno LUT:** standard matplotlib inferno anchors (same 9-stop structure as viridis in `rasterize.ts`).
- **Grayscale LUT:** trivial — `(t) => [Math.round(t*255), Math.round(t*255), Math.round(t*255)]`.
- **Log scaling:** `normalized = clipMax > 0 ? Math.log1p(raw) / Math.log1p(clipMax) : 0` — `Math.log1p` is safe for raw=0 (returns 0 exactly), never negative for non-negative input, and scales to [0,1] when raw ∈ [0, clipMax].
- **SPEC-02 uPlot band:** uPlot's `hooks.draw` receives the raw canvas context. Compute pixel x-positions from the u.valToPos(mzMin) and u.valToPos(mzMax) calls, then `ctx.fillStyle = 'rgba(255,200,0,0.25)'`; `ctx.fillRect(...)`. This is how the upstream mzpeakts demo annotates plots.
- **Ion image stats computation:** calculated inside `buildIonImage` or a sibling `computeIonImageStats(values, presenceMask)` function — returns `{ nonzeroCount, min, max }` from the PRESENT cells only (same exclusion logic as `percentile99`).

</specifics>

<deferred>
## Deferred Ideas

- **Debounced live updates** — better after Phase 5 adds the Worker so the main thread isn't blocked on every keystroke. Upgrade the trigger from button to debounce then.
- **Histogram** — ROADMAP success criteria 3 says "and/or histogram"; the text stats line covers the "and/or" without the complexity. A mini histogram can come in a later polish pass.
- **Web Worker offload for ion-image compute** — Phase 5. For PXD001283 scale (34,840 spectra), `extractXIC` on the main thread may take several seconds; profile first, Worker second.
- **Mean/sum/max aggregation toggle** (instead of or alongside sum) — v2/deferred per REQUIREMENTS.md.
- **Shareable deep-link URL encoding** selected m/z + tolerance — v2/deferred per REQUIREMENTS.md.

</deferred>

---

*Phase: 4-ion-image-intensity-scaling*
*Context gathered: 2026-06-03*
