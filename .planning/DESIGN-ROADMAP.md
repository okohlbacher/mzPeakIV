# mzPeakIV — OpenMS Design System Migration Roadmap (v2)

> **STATUS: COMPLETE (all phases shipped & verified).**
> P0 tokens/fonts · P1 DS primitives · P2 shell (+ 2 pre-existing bug fixes:
> non-imaging metadata load, worker-init race handshake) · P3 reskinned inspector
> panels · P4 toolbar + dark data stage + settings popover · P5 spectrum dock
> (uPlot ResizeObserver) + loader card · P6 responsive rail + brand + motion.
> Every phase: tsc clean, 147 unit + 5 e2e green, browser-verified (HR2MSI
> imaging round-trip: dark-stage TIC → pixel click → styled spectrum + peak
> table; settings popover; responsive overlay). BL-01–09 backlog features all
> carried into the new shell. The ADD-01–05 spec-gap items remain future work
> (they need mzPeak files using the new schema, which don't exist yet).


**Source:** `mzPeak Design System.zip` → `.design-handoff/design_handoff_mzpeakiv_redesign/`
**Nature:** Reskin + restructure (NOT a rewrite). No change to reader, `rasterize.ts`, colormap math, or Zustand store *logic*. Add only UI-presentation state.
**Target:** Persistent app shell (top bar / inspector rail / toolbar / dark data stage / spectrum dock / status bar); only the center view swaps. IBM Plex Sans/Mono, OpenMS electric blue `#3b54da`, token-driven `.mz-*` classes.

> **v2 supersedes v1 after a 4-way adversarial review (Codex PROC-01 + 3 specialist agents) returned `reject`.** Every BLOCKER/MAJOR is folded into the hard rules and phase specs below. Review artifacts summarized in §"Review resolutions".

---

## Hard constraints (must hold at every phase)

1. **e2e test contract is sacred — testids AND their text content.** Playwright (`e2e/{skeleton,local-file,remote-url}.spec.ts`) asserts both presence and content:
   - `stage` — **hidden sentinel**, `toHaveText` is EXACT-match. Its `textContent` must equal exactly one of (verbatim from current `App.tsx`): `Idle` · `Reading ZIP index…` · `Parsing manifest…` · `Loading metadata…` · `Building imaging grid…` · `Building TIC image…` · `No Imaging Data` · `Ready` · `Error`. Text-only node, no sibling text, **always mounted** (outside any conditional view branch).
   - `file-stats` must contain the lowercase word **"spectra"**.
   - `cap-is-imaging` must contain lowercase **"yes"/"no"** (case-sensitive substring).
   - `stat-mz-range` must have **non-empty** trimmed text (renders "not available" or a range).
   - `error-banner` is asserted `toHaveCount(0)` on success → must be **conditionally mounted, never rendered-and-hidden**.
   - `url-input` must be a **text input** defaulting (value) to `${import.meta.env.BASE_URL}static/small.mzpeak` (regex `/small\.mzpeak$/`). **NOT a NumberField** (type=number rejects the URL → empty value → test fails).
   - `load-button` triggers load (keep form `onSubmit` OR wire onClick — never a `type=submit` outside a form).
   - `spectrum-plot` is the div uPlot mounts its `<canvas>` into; canvas boundingBox must be > 0×0.
   - Other required testids (presence): `manifest-row`, `file-metadata`, `stats-panel`, `capabilities-panel`, `progress-bar`, `stage-label-{zip-index,manifest,metadata}`, `spectrum-index`.
   - Imaging testids to preserve (used in-app / future tests): `imaging-panel`, `tic-canvas`, `basepeak-canvas`, `ion-canvas`, `mc-canvas`, `ion-stats`, `tic-hover-readout`, `tic-mixed-warning`, `tic-unavailable`, `grid-*`, `mean-spectrum-btn`, `mean-spectrum-dismiss`, `peak-table`, `copy-csv-btn`, `drop-zone`, `file-input`.
2. **Unit tests stay green** (`store.test.ts`, `rasterize.test.ts`, `ionImage.test.ts`, `tic.test.ts`, plus new primitive tests).
3. **`rasterize.ts`, `src/reader/*`, `src/worker/*`, `src/compute/*`, `src/export/*` logic untouched.** Rasterizer LUTs already equal the design colormap tokens.
4. **No store *logic* change.** Presentation state (`view`, `overviewMode`, `settingsOpen`, `railOpen`, `isWide`) lives in `App.tsx` local `useState`.
5. **Every structural phase ends green:** `npx tsc -b` + `npm run test` + `npm run build` + **`npm run e2e`** (the latter at P2, P3, P4, P5, P6 — P4 included because it is the highest-risk phase). Commit per phase.
6. **No CDN/offline regression; Pages deploy stays working.** Self-hosted fonts (`@fontsource`); all assets/favicon/demo-URL via `import.meta.env.BASE_URL` / `%BASE_URL%`.
7. **All asset & URL references use base, never a literal `/…` or `/mzPeakIV/…`.** index.html favicon: `%BASE_URL%openms-mark.svg`. TSX `<img>`: `import logo from "../assets/…"` (Vite-rewritten) or `` `${import.meta.env.BASE_URL}…` ``.
8. **StrictMode-safe effects.** Every effect that adds a listener/observer (uPlot `.over` click, ResizeObserver, `matchMedia`, popover outside-click) returns a cleanup that removes it. Canvas paint effects stay listener-free (idempotent `putImageData`).
9. **Accessibility carried forward.** SegmentedControl `aria-selected` + roving focus; Panel `aria-expanded`; icon buttons `aria-label`; settings popover focus-return + Esc; rail overlay dismissable; inputs labelled.

---

## CSS adoption strategy (resolves the cascade-regression class)

`design-system/styles.css` `@import`s six files. **Two are globally-scoped, four are inert (`:root` vars + `.mz-*` classes only):**
- **Inert (adopt in P0, zero visual change):** `tokens/colors.css`, `tokens/colormaps.css`, `tokens/typography.css`, `tokens/spacing.css`, `components/components.css`. These define only `:root` custom properties and `.mz-*`/`.mz-numeric`/`.mz-overline` classes — nothing matches existing markup.
- **Global (DEFER to P2, when the shell replaces the legacy layout):** `tokens/base.css` (resets `body` font/size/color/bg, `*{box-sizing}`, `h1–h6{margin:0;…}`, `a`, global `:focus-visible`, reduced-motion `*`). Adopting this while the 6 inline-styled legacy components are still mounted causes the documented regressions (heading margins collapse, body→12.5px shrinks unsized text, page bg→`#f4f6f8`, h1 weight/colour shift). **So P0 does NOT import base.css.** We write our own `src/styles/ds/index.css` that `@import`s only the inert five; base.css joins at P2 when the shell (which sets its own bg/type) lands and the legacy inline components are being replaced.
- **fonts.css:** its sole content is a render-blocking Google `@import`. **Physically empty it** (replace body with a comment). Fonts come from `@fontsource` JS imports in `main.tsx`.

---

## Phase plan

### Phase 0 — Tokens, fonts, assets (zero visual change)
- `npm i @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono lucide-react`.
- Copy `design-system/tokens/{colors,colormaps,typography,spacing}.css` + `components/components.css` → `src/styles/ds/`. Copy `base.css` too but **do not import it yet**. Empty `tokens/fonts.css` (comment only).
- Author `src/styles/ds/index.css` = `@import` of the **inert five** only (colors, colormaps, typography, spacing, components). (base.css added here in P2.)
- In `src/main.tsx`, **before** `import "./styles/ds/index.css"`, add JS font imports: sans `400,500,600,700` (+ `400-italic`), mono `400,500,600` (`import "@fontsource/ibm-plex-sans/400.css"` …). Import the specific weight files (latin-scoped), not the package index.
- Copy `assets/openms-logo.png` + `openms-mark.svg` → `public/`. Set favicon in `index.html` via `%BASE_URL%openms-mark.svg`.
- **Exit:** app pixel-identical to before (no base.css, legacy inline styles intact); fonts self-hosted/offline; tokens + `.mz-*` classes available; `tsc -b`/`test`/`build` green. (No e2e needed — purely additive.)

### Phase 1 — DS React primitives (`src/ui/ds/`)
- Typed TS components on the `.mz-*` classes: `Button`, `SegmentedControl`, `NumberField`, `Select`, `Checkbox`, `Badge`, `StatRow`, `ColormapScale`, `Panel`. `lucide-react` icons (per-icon imports).
- A11y baked in: `SegmentedControl` (`role=tablist`/`aria-selected`, arrow-key roving), `Panel` (`aria-expanded`/`aria-controls`), icon `Button` (`aria-label` required), `Checkbox` (label assoc.), `NumberField` (text/number `type` prop — **URL usage will pass `type="text"`**).
- Vitest render test per primitive (class + aria + interaction). **Additive only** — nothing consumes them. **Exit:** primitives + tests green.

### Phase 2 — Persistent shell + base.css (App.tsx rebuild)
- Port `prototype-reference/kit.css` → `src/styles/ds/shell.css`; **add `pointer-events:none` to `.stage__legend/.stage__readout/.stage__scalebar`** (overlays must not swallow canvas clicks/ROI); **remove the `.dock__plot canvas{height:100%}` rule** (it fights uPlot's inline pixel height — see P5). Add `base.css` + `shell.css` to `index.css` now.
- **Single shared stage-label module** `src/ui/stageLabels.ts` exporting the exact 9-string map; both the hidden `stage` sentinel and `ProgressBar` consume it (no drift).
- Rebuild `App.tsx` as the shell grid. Presentation `useState`: `view`, `overviewMode`, `settingsOpen`, `railOpen`, `isWide` (`matchMedia('(min-width:1041px)')` with cleanup).
- **Explicit shell states** (all share the invariant top bar + status bar; the hidden `stage` sentinel is ALWAYS mounted regardless of state):
  - `idle` → loader card fills body (rail/dock hidden).
  - loading (`zip-index…tic`) → `ProgressBar` visible; body shows loader or partial shell.
  - `ready` (imaging) → full shell (rail + toolbar + stage + dock).
  - `ready` (non-imaging) → rail + dock (spectrum browser); stage shows "no spatial coordinates" empty state.
  - `no-imaging` → same non-imaging treatment.
  - `error` → `error-banner` conditionally mounted (never hidden-mounted) in the body; shell chrome persists.
- **Slot existing panels UNCHANGED** into rail (Metadata/Stats/Capabilities/GridDiagnostics) and dock (SpectrumPanel); ImagingPanel stays whole in the stage area (its internal tabs intact) — isolates structure from reskin.
- Responsive rail: `left` + conditional mount + backdrop (NOT `transform` — handoff-flagged quirk).
- **Exit:** shell renders for all 5 states; all testids intact incl. always-mounted `stage` sentinel; e2e + unit + build green.

### Phase 3 — Reskin inspector panels
- Metadata/Stats/Capabilities/GridDiagnostics → `Panel` + `StatRow` + `Badge`; strip inline styles.
- **Preserve testids AND content:** `file-stats` keeps lowercase "spectra"; `cap-is-imaging` keeps lowercase "yes"/"no"; `stat-mz-range` keeps non-empty text; all `grid-*`, `stats-panel`, `capabilities-panel`, `file-metadata`, `manifest-row`.
- **Exit:** panels match design; e2e (content assertions) + unit green.

### Phase 4 — Toolbar + dark stage (ImagingPanel split — HIGHEST RISK)
- **Canvas mount model: KEEP conditional per-view mounting** (one canvas mounted per active view). The blank-canvas-on-tab-switch fix depends on remount-triggered repaint. Do NOT switch to persistent CSS-hidden canvases.
- Lift `mainTab`→`view` and `overviewMode` into `App` (props to ImagingPanel). **Mandatory dep renames — rename `mainTab`→`view` at the bare dependency-array tokens, not just JSX:** `ImagingPanel.tsx` lines **285** (ion paint), **327** (ion ring), **342** (multi paint). Re-audit lines 212/241/257 (tic/basepeak/selection) for the same pattern. These tokens are invisible to JSX find/replace and uncovered by unit tests.
- Per-view controls into toolbar (`SegmentedControl` view switch; overview TIC/base-peak sub-toggle; ion m/z NumberFields[type=text/number] + Show Ion Image; multi R/G/B + Render; colormap switch; TIFF export).
- **Settings popover ships in THIS phase** (not P6) so scale/percentile/ticNorm/smooth/contrast are never orphaned: gear in top bar → popover (outside-click + Esc cleanup) exposing all rendering controls already in the store.
- Canvases onto `.stage` (dark `--ink`, dot-grid, framed). **Canvas sizing = fit-to-frame** (`max-width/max-height:100%`, not `width:100%`) so tall datasets don't overflow `.stage{overflow:hidden}` and clip clickable pixels. Strip inline light-gray canvas borders. `toGridCoord` (getBoundingClientRect-based) already hit-test-safe under centering.
- Floating overlays (legend bottom-left, readout top-right, scale bar bottom-right) on translucent blur; **`pointer-events:none`** (set in shell.css P2). Keep `readout` + `ionReadout` as separate states feeding the overlay conditionally on `view` (no stale cross-view text). Keep in-canvas selection ring (`ctx.strokeRect`); `.selring` DOM element stays unused/decorative.
- **e2e at this phase** (add imaging-fixture coverage: load → tic-canvas paints → switch ion→multi→overview→ion repaint cycle → pixel click → spectrum → ROI drag).
- **Exit:** all three views render on stage; ion/multi/ROI/pixel-click/spectrum all verified in-browser AND via e2e; tsc/test/build green.

### Phase 5 — Spectrum dock + loader card
- `SpectrumPanel` → bottom dock. **uPlot sizing rebuild (not "reuse" — there is no existing ResizeObserver):** add a `ResizeObserver` on the plot container; measure `clientWidth` AND `clientHeight` (dock 188px − header − padding ≈ measured, not hardcoded 150); `plot.setSize` on observed resize; disconnect on cleanup. Keep `spectrum-plot` testid on the measured/mounted container. Restyle series stroke `--spectrum-line`, fill `--spectrum-fill`, 1.4px; keep amber band, centroid peak table, all dock testids. Fix the existing `plot.over` click listener to use `renderIonImageRef.current`.
- `FileLoader` → loader card with OpenMS logo, `drop-zone`, URL row (**text input** + secondary Load URL button), demo chips. Keep `url-input`(text, BASE_URL default), `load-button`(submit/onClick), `file-input`, `drop-zone`.
- **Exit:** dock plot has nonzero canvas box; loader matches; e2e (skeleton incl. spectrum-plot canvas >0) green.

### Phase 6 — Brand, motion, responsive polish, deploy
- Top-bar + loader logo (BASE_URL), focus rings, `--ease-standard` motion, `prefers-reduced-motion`, rail overlay/backdrop ≤1040px, toolbar horizontal scroll, final a11y pass (keyboard nav across toolbar/rail/popover).
- **Exit:** full parity; browser-verify on HR2MSI; full e2e; deploy to Pages.

---

## Review resolutions (BLOCKER/MAJOR → where fixed)
- Stage sentinel exact text + always-mounted + shared label map → HC#1, P2.
- `mainTab`→`view` dep tokens (lines 285/327/342) + keep conditional mount + e2e at P4 → P4.
- Overlay `pointer-events:none` → P2 shell.css.
- Google `@import` physically removed; `@fontsource` JS imports w/ explicit weights → CSS strategy, P0.
- uPlot ResizeObserver + measured height + remove conflicting CSS rule → P5, P2.
- Orphaned rendering controls → settings popover moved to P4.
- base.css cascade → deferred to P2 (P0 imports only inert five), killing the regression class.
- Content-based e2e assertions (spectra/no/mz-range), error-banner conditional mount, URL stays text → HC#1, P3, P5.
- BASE_URL for assets/favicon/demo-url → HC#6/7, P0/P2/P5.
- StrictMode cleanup + a11y → HC#8/9, all phases.
- Explicit error/no-imaging/loading shell states → P2.

## Out of scope
Logic changes to reader/worker/rasterize/store; new features beyond shipped BL-01–09; prototype `engine.js` mock data; the plain-JS component shim.
