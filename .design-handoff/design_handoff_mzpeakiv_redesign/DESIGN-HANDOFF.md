# OpenMS / mzPeak — Design Handoff

A portable specification of the visual language used by the **mzPeak Design System** (OpenMS family). Hand this file to a design agent to synchronize a different but related app. Every value below is literal and copy-pasteable; where the source project is available, the canonical files are noted in `‹brackets›`.

> **What this brand is.** Tooling for **mass spectrometry** under the open-source **OpenMS** umbrella. The aesthetic is a *modern scientific instrument*: light, hairline-bordered chrome wrapping a **dark "data stage"** where the actual data visualization lives. Dense, precise, calm. The hero visual is the **perceptually-uniform scientific colormap** (viridis/inferno); the brand flourish is the OpenMS **mass-spectrum of coloured peaks**.

---

## 1. Logo

- **Primary:** `assets/openms-logo.png` — the official OpenMS logo: a near-black "OpenMS" wordmark stacked over a warm→cool **mass-spectrum of coloured peaks** (orange → red → magenta → purple → blue). Transparent background, ~1156×843 (ratio ≈ 1.37).
- **Usage:** place on **light** surfaces only (the wordmark is near-black). Top bar height ≈ 30px; loader/hero ≈ 40–74px. Never recolor, rotate, or place on a busy/dark background.
- **App mark / dark contexts:** `assets/openms-mark.svg` — a rounded square in the primary blue `#3B54DA` with white stick-spectrum peaks + a red baseline. Use as favicon and wherever the full wordmark won't read (dark backgrounds, tiny sizes).
- **Reversed wordmark:** the official logo has no white version. For dark backgrounds use the mark, or source a reversed wordmark from <https://openms.org/press-kit>.
- **Brand device:** the **mass-spectrum "stick" peaks** (vertical bars of varying height over a baseline). Reuse this motif for iconography, splash icons, and empty states. The peak colours follow the brand spectrum (below).

---

## 2. Color system

All colours are CSS custom properties on `:root` ‹`tokens/colors.css`›. Consume the alias tokens (e.g. `--accent`) in components; the raw ramps back them.

### 2.1 Primary — OpenMS electric blue
The single UI accent. Tuned to the logo's blue peaks. White text is legible on `600`+.
| Token | Hex |
|---|---|
| `--blue-50`  | `#f2f4fe` |
| `--blue-100` | `#e6e9fc` |
| `--blue-200` | `#c9d0f7` |
| `--blue-300` | `#a6b1f0` |
| `--blue-400` | `#7d8ce8` |
| `--blue-500` | `#5468e0` |
| **`--blue-600`** | **`#3b54da`**  ← PRIMARY accent |
| `--blue-700` | `#2f44bf` |
| `--blue-800` | `#263799` |
| `--blue-900` | `#1b2870` |

### 2.2 Signal red (sparing accent — peak lines, brand flourish)
`--red-600 #c00000`, `--red-700 #9b0000`, `--red-500 #d62828`, `--red-200 #f1b4b4`, `--red-100 #fbe0e0`, `--red-50 #fdf2f2`.

### 2.3 OpenMS brand spectrum (flourish only — never for data)
`--openms-spectrum`:
```css
linear-gradient(90deg, #f5a623 0%, #f4612e 16%, #f0344e 33%, #e6249e 50%, #b026d3 66%, #6d3be8 83%, #3b5be0 100%);
```

### 2.4 Cool-neutral ramp (chrome, text, borders)
`#ffffff` `--gray-0` · `#fafbfc` 25 · `#f4f6f8` 50 · `#eceff2` 100 · `#e3e7eb` 150 · `#dde2e7` 200 · `#c5ccd3` 300 · `#9aa4ad` 400 · `#6b757e` 500 · `#4b545c` 600 · `#353c43` 700 · `#232a30` 800 · `#151a1e` 900.

### 2.5 The dark "data stage"
`--ink #0e1216` (stage bg) · `--ink-raised #161c22` · `--ink-line #2a323a` · `--sentinel #1a1a1a` (the **no-data / absent-pixel** colour — must always read as distinct from colormap-low).

### 2.6 Semantic
| Role | Text | Background / extra |
|---|---|---|
| Info | `--info #3b54da` | `--info-bg #f2f4fe` |
| Success | `--success #2e9e5b` | soft `#43a047` |
| Warning | `--warning #8a6d00` | `--warning-bg #fff8e1`; selection band `rgba(255,200,0,0.25)` |
| Danger | `--danger #c62828` | soft `#ef9a9a`, bg `#fce4ec` |

RGB false-colour channels (multi-channel overlays): R `#e53935` · G `#43a047` · B `#1e88e5`.
Secondary indigo (dense data tables): `--indigo-500 #3949ab`, `--indigo-50 #e8eaf6`.

### 2.7 Semantic aliases (use these)
`--bg-app: gray-50` · `--surface: #fff` · `--surface-stage: ink` · `--text-strong: gray-900` · `--text-body: gray-700` · `--text-muted: gray-500` · `--text-faint: gray-400` · `--border-hairline: gray-200` · `--border-soft: gray-150` · `--border-strong: gray-300` · `--accent: blue-600` · `--accent-hover: blue-700` · `--accent-active: blue-800` · `--accent-subtle: blue-50` · `--signal: red-600` · `--spectrum-line: blue-600` · `--spectrum-fill: rgba(59,84,218,0.09)` · `--focus-ring: 0 0 0 3px rgba(59,84,218,0.28)`.

---

## 3. Colormaps (the hero visual)

Perceptually-uniform, exact matplotlib anchors ‹`tokens/colormaps.css`›. **These are data, never brand colour — never recolour them.** Always pair a rendered map with a legend (low/high ticks). Absent pixels → `--sentinel #1a1a1a`.

- **viridis** (default): `#440154 #482878 #3e4a89 #31688e #26828e #1f9e89 #35b779 #6ece58 #fde725`
- **inferno** (high-contrast alt): `#000004 #280b54 #65156e #9f2a63 #d44842 #f57d15 #fac127 #f9c934 #fcffa4`
- **gray**: `#000000 → #ffffff`
- **base-peak hue cycle**: `#ff0000 #ffff00 #00ff00 #00ffff #0000ff #ff00ff` (violet→red, stops short of wrap)

Each is exposed as a CSS gradient (`--gradient-viridis`, etc.). The data canvas uses `image-rendering: pixelated` (one device pixel per data cell — honest, not smoothed) and a `crosshair` cursor.

---

## 4. Typography

‹`tokens/typography.css`›. **IBM Plex Sans** for chrome; **IBM Plex Mono** (tabular figures) for *every measured value* — numbers, IDs, coordinates, units. Loaded via Google Fonts ‹`tokens/fonts.css`›; self-host for production.

```css
--font-sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

Compact, data-dense scale: `2xs 10.5` · `xs 11.5` · **`sm 12.5` (base UI)** · `base 13` · `md 14` · `lg 16` · `xl 20` · `2xl 26` · `display 34` (px). Weights 400/500/600/700. Line-heights: tight 1.15, snug 1.3, normal 1.45. Section labels are **uppercase overlines**: 10.5px, 600, letter-spacing `0.06em`, `--text-muted`. Any figure that must align uses `font-variant-numeric: tabular-nums`.

---

## 5. Spacing, radii, elevation, motion

‹`tokens/spacing.css`›. **2px base scale:** `1=2 2=4 3=6 4=8 5=12 6=16 7=20 8=24 9=32 10=40 12=48 16=64` (px).

Radii: `xs 3` (buttons/inputs) · `sm 4` (tab groups/chips) · `md 6` (cards/dropzone) · `lg 8` (panels/dialogs) · `pill 999`.
Borders: hairline **1px**, colour `--gray-200`. No heavy borders; no coloured left-border accent cards.
Elevation (restrained): `--shadow-1 0 1px 2px rgba(16,22,30,.06)`+hairline ring · `--shadow-2` · `--shadow-3 0 6px 18px rgba(16,22,30,.12)` · `--shadow-pop 0 12px 32px rgba(16,22,30,.18)`.
Motion: `--ease-standard cubic-bezier(.2,0,0,1)`; durations `fast 120ms / base 180ms / slow 260ms`. Subtle fades and slides only — no bounces, no infinite decorative loops; respect `prefers-reduced-motion`.

---

## 6. Components

Class-based, token-driven ‹`components/components.css`›; React wrappers in ‹`components/<group>/`›. Reuse the class contract even outside React.

| Component | Class | Key variants / states |
|---|---|---|
| **Button** | `.mz-btn` | `--secondary` (outline) · `--ghost` · `--danger` · `--sm` · `--icon` · `--block`. Hover→`accent-hover`, active→`accent-active`, disabled→`gray-200`. |
| **SegmentedControl** | `.mz-seg` / `.mz-seg__item` | connected tab/toggle; active item = filled `--accent`, white text, `aria-selected="true"`. `--sm`. Use for view/colormap/scale switching. |
| **NumberField** | `.mz-input` (+`.mz-input__unit`) | monospace numeric input with a trailing unit chip (Da, µm, ppm). `--sm`. |
| **Select** | `.mz-select` | styled native dropdown + chevron. `--sm`. |
| **Checkbox** | `.mz-check` (+`.mz-check__box`) | 15px box, checks to `--accent`. |
| **Badge** | `.mz-badge` | tones `--neutral/accent/info/success/warning/danger`; `__dot`; `--mono`. |
| **StatRow** | `.mz-statrow` | key (muted) / value (mono, tabular, right-aligned). Wrap units in `<em>` to dim. |
| **ColormapScale** | `.mz-cmap` | the signature legend bar; `--viridis/inferno/gray/basepeak`, `--vertical`, `--stage`. |
| **Panel** | `.mz-panel` | collapsible inspector section; title is an uppercase overline + optional count chip. |

Controls are **28px** tall (`--control-h`; small **22px**). Focus = `--focus-ring`.

---

## 7. Layout — the persistent app shell

The defining structural pattern: **one frame that never moves while the central view swaps.** Replicate this for a related app.

```
┌───────────────────── top bar (44px, light) ─────────────────────┐
│  [OpenMS logo] │ ‹Product name›   ‹file/context›   actions · ⛭ ? │
├───────────┬──────────────────────────────────────────────────────┤
│ Inspector │  Toolbar (52px): [view switch] · view-specific ctrls  │
│  rail     ├──────────────────────────────────────────────────────┤
│ (272px,   │             ◗ DARK DATA STAGE (--ink) ◗                │
│  persist) │        the visualization + floating overlays          │
│  Panels…  ├──────────────────────────────────────────────────────┤
│           │  Dock (188px): secondary linked view (e.g. spectrum)  │
├───────────┴──────────────────────────────────────────────────────┤
│  status bar (26px, mono): mode · dimensions · counts · zoom       │
└───────────────────────────────────────────────────────────────────┘
```

Rails (fixed): top bar **44px**, status bar **26px**, inspector rail **272px**, dock **188px**.
- **Only** the toolbar's view-specific controls and the stage content change between views; the shell is invariant.
- **Stage** = `--ink` with a faint dot-grid texture (`radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px)` at 22px). Content sits in a framed canvas with `--shadow` lift.
- **Stage overlays** (legend, hover readout, scale bar) float on `rgba(14,18,22,0.72)` + `backdrop-filter: blur(8px)` + 10%-white hairline. This translucent treatment is reserved for the dark stage; chrome is always opaque.
- **Responsive:** below **1040px** the inspector becomes a fixed left overlay with a backdrop (toggled from a top-bar panel button); the toolbar scrolls horizontally; the shell otherwise holds. ⚠️ Implementation note: avoid CSS `transform`-based slide-in (a quirk surfaced in our preview engine) — position the overlay with `left` + conditional mount instead.

---

## 8. Content & tone

Terse, technical, precise — **lab-instrument copy, not marketing**.
- Domain-literal, **lowercase** technical terms; never "correct" their casing (`m/z`, `TIC`, `viridis`, `centroid`).
- **Always carry units** (`799.95 Da`, `260 × 134 px`, `50 µm`, `99th pct`).
- **Imperative, verb-first** actions ("Show Ion Image", "Render", "Load URL").
- **Honest** empty/again states — em-dash `—` or a plain statement ("no data", "no pixel selected"). Never invent a value.
- Address the user sparingly ("Click a pixel…"); **never first person**. **No emoji, no exclamation.** Functional glyphs only (`⌀` mean, `±` tolerance, `–` range, `↓` download).
- Numbers formatted for reading: thousands separators (`1,684`), scientific notation for large intensities (`1.4e6`), fixed precision for m/z (`740.5063`).

---

## 9. Iconography

- **[Lucide](https://lucide.dev)** line icons: thin (**2px** stroke), rounded, 24×24. A small hand-built subset ships in ‹`ui_kits/mzpeak-iv/icons.js`›. Extend only with matching Lucide glyphs — don't mix in a heavier or filled family.
- **No emoji.** Status uses coloured dots (`Badge` `__dot`) + semantic colour.
- First-class "data glyphs": channel swatches (R/G/B squares), the colormap legend bar, the selection ring.

---

## 10. How to consume

- Link **one** file: `styles.css` (it `@import`s every token + font + `components/components.css`). All tokens and component classes become available.
- React components are exposed on a global namespace from a compiled bundle: `const { Button } = window.MzPeakDesignSystem_<id>`. If you cannot build/serve that bundle, a plain-JS fallback shim re-creates the same components against the same classnames ‹`ds-runtime-fallback.js`›.
- Reference implementation of a full screen: ‹`ui_kits/mzpeak-iv/`› (engine + icons + panels + stage + app). Foundation specimens live in ‹`guidelines/`›; the full design guide is ‹`readme.md`›.

### One-line summary for a sibling app
> Light hairline chrome + a dark data stage; IBM Plex Sans/Mono with tabular numerics and ever-present units; OpenMS **electric blue `#3B54DA`** as the sole accent, signal red `#C00000` as a sparing flourish; perceptually-uniform colormaps as the hero data visual; a fixed top-bar / inspector / stage / dock / status-bar shell where only the center view swaps; terse lowercase-technical copy.
