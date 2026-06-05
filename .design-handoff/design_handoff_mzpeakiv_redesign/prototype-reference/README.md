# mzPeak IV — Imaging Viewer (UI kit)

A modern, slim, compact **redesign** of the mzPeakIV mass-spectrometry-imaging explorer, aligned to the OpenMS brand. It composes the design-system primitives and demonstrates the full client-side workflow with mocked data.

## The persistent shell
The defining idea: **one layout frame that never moves while the central view swaps.**

```
┌──────────────────────────────────────────────── top bar (44px) ──┐
│  [OpenMS] │ mzPeak IV   file.mzpeak            open · settings · ? │
├───────────┬───────────────────────────────────────────────────────┤
│ Inspector │  Toolbar:  [Overview│Ion│Multi]  · view controls · ⛭   │
│  rail     ├───────────────────────────────────────────────────────┤
│ (272px)   │                                                        │
│  Image    │            ◗ DATA STAGE (dark) ◗                        │
│  Info     │            ion image · legend · readout                │
│  Acq.     │                                                        │
│  Caps     ├───────────────────────────────────────────────────────┤
│  Grid     │  Spectrum dock (188px) — m/z vs intensity + band       │
├───────────┴───────────────────────────────────────────────────────┤
│  status bar (26px): mode · dimensions · spectra · zoom             │
└────────────────────────────────────────────────────────────────────┘
```

Only the **stage** and the **toolbar's view-specific controls** change between Overview (TIC / Base-peak m/z), Ion Image, and Multi-channel. The inspector, spectrum dock, top bar and status bar are constant — so navigation never relayouts.

## Interactions (all client-side, mocked)
- **Load** — drop zone / URL / demo chips → enters the explorer.
- **Overview** — TIC heatmap or base-peak-m/z false-colour; hover for `x · y · intensity`.
- **Ion Image** — enter an m/z range → *Show Ion Image*; pick colormap; open the **⛭ settings popover** for scale (linear/log), percentile clip, contrast (none/equalize/CLAHE), TIC-normalize and Gaussian σ.
- **Multi-channel** — assign m/z to R/G/B → *Render* an overlay.
- **Pick a pixel** (click) → selection ring + the **spectrum dock** updates to that pixel; the active m/z window draws as an amber band. **⌀ Mean spectrum** toggles the file-wide mean.
- **Export** — *TIFF* downloads the current canvas (PNG in this mock).
- **Responsive** — under 1040px the inspector becomes a slide-in overlay (top-bar menu button); the toolbar scrolls horizontally; the shell stays intact.

## Files
| File | Role |
|---|---|
| `index.html` | Entry — loads React, the DS bundle, engine, icons, and JSX layers. |
| `kit.css` | The shell layout (top bar, rail, stage, dock, status bar) — tokens only. |
| `engine.js` | Plain-JS rendering engine: mock MSI fields, viridis/inferno LUTs, canvas painters, mock spectra. `window.MZ`. |
| `icons.js` | Lucide-style line-icon subset. `window.Icons`. |
| `panels.jsx` | `TopBar`, `Rail`, `SpectrumDock`, `StatusBar`. |
| `stage.jsx` | `IonStage` (canvas + hover/select + overlays), `SettingsPopover`, `Loader`. |
| `app.jsx` | State orchestrator + per-view `Toolbar`; mounts `#root`. |

Components are read from `window.MzPeakDesignSystem_019e25` (the compiled `_ds_bundle.js`); styling from the global `styles.css` + this `kit.css`.

> Data is generated, not read from a real `.mzpeak` (no Parquet/WASM). The imagery is representative MSI (an organic tissue silhouette with ion hotspots) so the colormaps, readouts and spectrum behave realistically.
