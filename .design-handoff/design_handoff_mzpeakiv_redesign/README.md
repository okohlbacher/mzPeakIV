# Handoff: mzPeakIV — OpenMS-branded compact redesign

## Overview
This package describes a **modern, slim, compact redesign** of **mzPeakIV** — the browser-based mass-spectrometry-imaging (MSI) explorer for the mzPeak format — visually aligned to the **OpenMS** brand. It converts today's utilitarian, inline-styled UI into a cohesive, instrument-grade interface built on a **design-token system** and a **persistent application shell** where only the center view changes between modes.

The goal is a **reskin + restructure**, not a rewrite. The app's data flow, reader, colormap math, and Zustand state already do the right things — this redesign is almost entirely **presentational and structural**.

## About the design files
The files in `prototype-reference/` are a **design reference built in HTML/JSX** — a working prototype showing the intended look, layout, and behavior. **They are not production code to paste in.** Your task is to **recreate this design inside the existing mzPeakIV codebase** (Vite + React 19 + TypeScript) using its established patterns (function components, the Zustand store in `src/state/store.ts`, uPlot for spectra, Canvas 2D for ion images).

The `design-system/` folder, by contrast, **is** intended to be adopted directly: it is plain, framework-agnostic **CSS** (design tokens + component classes) you can copy into `src/styles/` and import once. The React components there are thin reference wrappers — port their class usage, not their exact code.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, and interaction states are final and exact (see Design Tokens). Recreate the UI to match, using the codebase's libraries. The one area that is representational is the **mock data** in the prototype's `engine.js` — the real app already renders real data via `rasterize.ts` + the worker; do **not** port `engine.js`.

---

## The target codebase (what already exists)
mzPeakIV (`okohlbacher/mzPeakIV`, `main`): Vite 8 + React 19 + TypeScript, Zustand store, uPlot spectra, Canvas 2D ion images, client-side only.

Relevant files you will touch:
| File | Role today | Redesign treatment |
|---|---|---|
| `src/ui/App.tsx` | Root layout: inline-styled `header` + 400px `aside` + right column. | **Rebuild as the persistent shell** (top bar / inspector rail / toolbar / stage / dock / status bar). |
| `src/ui/FileLoader.tsx` | Drop zone + URL + file input. | Restyle into the centered **loader card** with the OpenMS logo. |
| `src/ui/MetadataPanel.tsx`, `StatsPanel.tsx`, `CapabilitiesPanel.tsx`, `GridDiagnosticsPanel.tsx` | Left-column panels (inline styles). | Wrap each in the collapsible **Panel** + **StatRow** pattern; group into the **inspector rail**. |
| `src/ui/SpectrumPanel.tsx` | uPlot spectrum + peak table. | Move into the bottom **spectrum dock**; restyle uPlot series stroke to `--spectrum-line`, fill `--spectrum-fill`; keep the amber m/z band. |
| `src/ui/ImagingPanel.tsx` | TIC/ion/multi canvases, controls row, tabs. | Split: **view tabs + per-view controls** go into the toolbar; canvases render on the **dark stage** with floating legend/readout/scale-bar overlays. |
| `src/ui/rasterize.ts` | viridis/inferno/gray LUTs + sentinel `#1a1a1a`. | **No change** — these already match the design tokens exactly. Reuse as-is. |
| `src/state/store.ts` | All app state + actions. | **No logic change.** Add only UI-presentation state (below). |

---

## Implementation plan (incremental, low-risk)
1. **Tokens first.** Copy `design-system/styles.css`, `design-system/tokens/`, and `design-system/components/components.css` into `src/styles/`. Import `styles.css` once in `src/main.tsx`. Add the IBM Plex `@import` (or self-host). Nothing breaks; tokens become available.
2. **Shell.** Rebuild `App.tsx` as the shell grid (CSS in `kit.css` reference → move into a `shell.css`). Slot existing panels into the rail/dock unchanged for now.
3. **Reskin panels** to the `.mz-*` classes (Button, SegmentedControl, NumberField, Select, Checkbox, Badge, StatRow, ColormapScale, Panel). Delete inline styles as you go.
4. **Toolbar + stage.** Lift `ImagingPanel`'s view tabs (Overview/Ion/Multi) and per-view controls into the toolbar; put the canvases on the dark stage with the floating overlays.
5. **Brand.** Add the OpenMS logo to the top bar + loader; set the favicon to `openms-mark.svg`.
6. **Polish.** Settings popover, responsive rail overlay, focus rings, motion.

---

## Screens / Views

### Shell (persistent — never relayouts between views)
- **Layout:** full-viewport CSS grid, rows `44px / 1fr / 26px` (top bar / body / status bar). Body is a grid `272px / 1fr` (inspector rail / center). Center is a flex column: toolbar `52px` (flex-shrink 0) / stage `1fr` / spectrum dock `188px` (flex-shrink 0).
- **Top bar** (`--surface` white, `border-bottom: 1px solid --border-hairline`): OpenMS logo (`height 30px`) · 1px divider · product lockup ("mzPeak IV" / "IMAGING VIEWER" overline) · file chip (mono, `--gray-50` bg) · spacer · actions (`Open file` ghost button, settings icon-button, info link). On <1040px a panel-left icon-button appears at the far left to toggle the rail.
- **Status bar** (`--surface`, `border-top` hairline, mono `--text-2xs --text-muted`): `● mzPeak v0.3 · client-side` · current mode · spacer · `{w} × {h} px` · `{filled} / {total} spectra` · zoom.

### Loader (pre-file state, fills the body)
- Centered **card**: `width min(560px, 92%)`, `--surface`, `border 1px --border-hairline`, `radius --radius-lg (8px)`, `--shadow-3`, padding `32px`, column, centered, gap `12px`.
- Contents: OpenMS logo (40px) · `h` "Open an imaging mzPeak file" (`--text-xl`, 600) · `p` description (`--text-sm --text-muted`, max ~40ch) · **drop zone** (`2px dashed --border-strong`, `radius --radius-md`, `--gray-25`, hover → `--accent` border + `--accent-subtle` bg) · URL row (NumberField-style input + secondary "Load URL" button) · demo chips (pill, mono).

### Overview view (default)
- Toolbar: view SegmentedControl `[Overview | Ion Image | Multi-channel]` · separator · sub-toggle `[TIC | Base-peak m/z]` · spacer · colormap SegmentedControl `[viridis | inferno | gray]`.
- Stage: the TIC (or base-peak) canvas, centered & framed; floating **ColormapScale** legend (bottom-left), **hover readout** (top-right: `x N · y N` + `intensity {compact}`), **scale bar** (bottom-right).

### Ion Image view
- Toolbar: view switch · `m/z` label · NumberField – NumberField (unit `Da`) · primary **"Show Ion Image"** button · spacer · colormap switch · separator · secondary **"TIFF"** export.
- Stage: the ion-image canvas with the same overlays; **selection ring** on the picked pixel; the m/z window draws as the amber band in the spectrum dock.

### Multi-channel view
- Toolbar: view switch · three rows `[R/G/B swatch] NumberField` · primary **"Render"** · separator · **"TIFF"**.
- Stage: the RGB-composite canvas (channels R `#e53935` / G `#43a047` / B `#1e88e5`).

### Inspector rail (persistent on desktop; fixed overlay <1040px)
- Header: "Inspector" (`--text-md`, 600) + a `Ready` success Badge with dot.
- Collapsible **Panel**s, each with an uppercase overline title + optional count: **Image Info** (Dimensions, Spectra, Pixels with data, m/z range, Pixel size), **Acquisition** (Instrument, Analyzer, MS levels, Mode badge), **Capabilities** (success/neutral badges), **Grid Diagnostics** (Orientation, Coordinate base, Fill %). Values use **StatRow** (mono, tabular, units dimmed via `<em>`).

### Spectrum dock (persistent, bottom)
- Header: heading (`Spectrum` / `Pixel (x, y)` / `Mean spectrum`) · sub-meta (mono: points · MS¹ · profile) · spacer · `⌀ Mean spectrum` toggle button.
- Body: the uPlot chart — series stroke `--spectrum-line #3b54da`, fill `--spectrum-fill rgba(59,84,218,0.09)`, 1.4px; amber m/z band `rgba(255,200,0,0.25)`; axes mono `--text-2xs`. Keep the existing centroid peak table beneath when applicable.

---

## Interactions & behavior
Mostly preserved from today; presentational changes only.
- **View switch** (SegmentedControl): swaps toolbar controls + stage content; shell stays fixed.
- **Pixel click** on a stage canvas → `selectSpectrum(idx)` (existing) → dock updates to `Pixel (x, y)` + redraws. Selection ring overlays the cell.
- **Hover** over the stage → readout chip (`x · y · intensity`), `crosshair` cursor; clears on mouse-leave.
- **Show Ion Image / Render** → existing `renderIonImage` / `renderMultiChannel` actions.
- **Settings popover** (opened from the top-bar settings icon): colormap, scale (linear/log), percentile clip, contrast (none/equalize/CLAHE), TIC-normalize, smooth σ — all already in the store. Anchored top-right, `--shadow-pop`, dismiss on outside click.
- **TIFF export** → existing `encodeSingleChannelTiff` / `encodeRgbTiff`.
- **Motion:** `--ease-standard cubic-bezier(.2,0,0,1)`, `--dur-fast 120ms` / `--dur-base 180ms`. Subtle fades; no bounces; respect `prefers-reduced-motion`.
- **Responsive:** ≥1041px the inspector is a persistent 272px column. ≤1040px it becomes a fixed left **overlay** with a dim backdrop, toggled from the top-bar panel button. ⚠️ **Implementation gotcha:** position/animate the overlay with `left` + conditional mount, **not** a CSS `transform` slide (a transform-rendering quirk surfaced in the prototype's preview engine; `left`-based positioning is reliable). The toolbar scrolls horizontally on narrow widths.

## State management
The Zustand store already holds the functional state: `stage`, `capabilities`, `grid`, `tic`, `ionImage`, `selectedIndex`, `colormap`, `scale`, `percentile`, `ticNorm`, `smoothSigma`, `histogramMode`, `multiChannel`, `mzWindow`, etc. **Do not change these.**
Add only **UI-presentation** state (local `useState` in `App.tsx` is fine — does not belong in the store):
- `view: "overview" | "ion" | "multi"` (the toolbar tab; note `ImagingPanel` already has a similar local `mainTab` you can lift up).
- `overviewMode: "tic" | "basepeak"`.
- `settingsOpen: boolean`, `railOpen: boolean`, and a `isWide` flag from a `matchMedia('(min-width:1041px)')` listener.

## Design tokens
Full source in `design-system/tokens/` (colors, colormaps, typography, spacing) and `design-system/components/components.css`. A complete written spec is in `DESIGN-HANDOFF.md`. Headline values:
- **Accent (primary):** OpenMS electric blue `--blue-600 #3b54da` (hover `#2f44bf`, active `#263799`, subtle `#f2f4fe`).
- **Signal red** (sparing flourish): `#c00000`. **Brand spectrum** gradient `--openms-spectrum` (logo peaks).
- **Neutrals:** `#ffffff … #151a1e` cool-gray ramp; hairline borders `#dde2e7`.
- **Data stage:** `--ink #0e1216`; **no-data sentinel** `#1a1a1a`.
- **Colormaps (already in `rasterize.ts`):** viridis `#440154→#fde725`, inferno `#000004→#fcffa4`, gray, base-peak hue.
- **Type:** IBM Plex Sans (chrome) + IBM Plex Mono (all numbers, tabular). Base UI `12.5px`; scale `10.5 / 11.5 / 12.5 / 13 / 14 / 16 / 20 / 26 / 34`.
- **Spacing:** 2px base (`2,4,6,8,12,16,20,24,32,40,48,64`). **Radii:** 3 / 4 / 6 / 8 / 999. **Shadows:** `--shadow-1…3`, `--shadow-pop`.
- **Shell rails:** top bar 44 · status bar 26 · inspector 272 · dock 188 · control height 28 (sm 22).

## Assets
- `assets/openms-logo.png` — official OpenMS logo (light backgrounds only; near-black wordmark). Top bar 30px, loader 40px.
- `assets/openms-mark.svg` — app mark / favicon (blue square, white peaks, red baseline) for dark/compact contexts.
- **Icons:** [Lucide](https://lucide.dev), 2px stroke, 24×24. Add `lucide-react` to the app (`npm i lucide-react`) and use its icons rather than porting the prototype's hand-rolled `icons.js`. No emoji.

## Content & tone
Terse, lowercase-technical, imperative; always carry units; em-dash for missing values; no emoji. Keep all existing copy strings; only restyle.

## Files in this package
- `DESIGN-HANDOFF.md` — the full standalone visual spec (read this for any value not in this README).
- `design-system/styles.css` — single entry point (`@import`s tokens + component CSS). Adopt directly.
- `design-system/tokens/` — `colors.css`, `colormaps.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css`.
- `design-system/components/` — `components.css` (the `.mz-*` classes — adopt) + reference React wrappers (`controls/`, `forms/`, `data/`) and their `.prompt.md` usage notes.
- `design-system/ds-runtime-fallback.js` — plain-JS version of the components (reference only; in a real React app you'll write TS components using the same classes).
- `assets/` — logo + mark.
- `prototype-reference/` — the interactive HTML/JSX prototype (`index.html`, `kit.css` ← the shell CSS to port, `panels.jsx`, `stage.jsx`, `app.jsx`, `engine.js` ← mock data, do NOT port). Open `index.html` to see the intended result. The canonical runnable copy lives in the design-system project under `ui_kits/mzpeak-iv/`.

> **Reminder:** recreate the prototype's look inside mzPeakIV's React/TS environment. Adopt `design-system/` CSS directly; treat `prototype-reference/` as the visual target; leave `rasterize.ts`, the reader, and the store's logic untouched.
