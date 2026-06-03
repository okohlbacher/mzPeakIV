# Phase 4: Ion Image + Intensity Scaling — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 4-ion-image-intensity-scaling
**Areas discussed:** m/z query trigger, Canvas / display mode, Controls layout, Blank-prevention readout

---

## m/z Query Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Render button | Explicit "Show Ion Image" button; no surprises during typing; best before Phase 5 Worker arrives | ✓ |
| Enter key | Pressing Enter triggers compute; deliberate but fires on keystroke | |
| Debounced live (500ms) | Image updates after typing pauses; blocks main thread repeatedly | |

**User's choice:** Explicit "Show Ion Image" button

---

| Option | Description | Selected |
|--------|-------------|----------|
| "Render" | Clear, direct action label | |
| "Show Ion Image" | More descriptive, consistent with the domain | ✓ |
| You decide | Claude picks the label | |

**User's choice:** "Show Ion Image"

---

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-update for colormap/scale only | Colormap and scale changes re-rasterize cached Float32Array instantly; only m/z/tol changes require the button | ✓ |
| Button required for all changes | Consistent but slower feel for free recoloring | |

**User's choice:** Auto-update for colormap/scale only

---

## Canvas / Display Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Single canvas, mode-switch | Same canvas shows TIC by default, switches to ion image when m/z entered | |
| Two separate canvases | TIC always visible above; ion image canvas appears below when rendered | ✓ |
| Toggle tabs | Tab bar switches between TIC and ion image views | |

**User's choice:** Two separate canvases

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show placeholder | Muted text placeholder before ion image is rendered | |
| Hide until rendered | Ion image canvas area not rendered until "Show Ion Image" is clicked | ✓ |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Hide until rendered (no placeholder)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — both canvases wire to selectSpectrum | Clicking ion image pixel shows its spectrum + SPEC-02 band | ✓ |
| TIC canvas only for pixel selection | Ion image is read-only display | |

**User's choice:** Both canvases wire to selectSpectrum

---

## Controls Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Above the TIC canvas | m/z form sits at the top of ImagingPanel, above TIC canvas | ✓ |
| Between TIC and ion image | m/z form sandwiched between the two canvases | |
| Below both canvases | All controls at the bottom | |

**User's choice:** Above the TIC canvas

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same compact row as m/z controls | All controls in one row: m/z, tol, unit, button, colormap, scale, percentile | ✓ |
| Below the ion image canvas | Colormap/scale appear below ion image after rendering | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Same compact row as m/z controls

---

| Option | Description | Selected |
|--------|-------------|----------|
| Viridis + Inferno + Grayscale | Three options covering perceptual, warm-contrast, and publication use cases | ✓ |
| Viridis + Grayscale only | Minimal — two options | |
| Viridis + Inferno + Hot + Grayscale | Four options including classic MSI "Hot" colormap | |

**User's choice:** Viridis + Inferno + Grayscale

---

## Blank-Prevention Readout

| Option | Description | Selected |
|--------|-------------|----------|
| Text stats below ion image | Single line: "N / total pixels · range min–max · scale: linear (99th pct)" | ✓ |
| Labeled colorbar strip | Horizontal gradient strip with tick marks | |
| Both: colorbar + text stats | Maximum information but most UI complexity | |

**User's choice:** Text stats below ion image

---

| Option | Description | Selected |
|--------|-------------|----------|
| Preset dropdown (90/95/99/99.9) | Select from fixed percentile levels | ✓ |
| Numeric input (free text) | Maximum flexibility but no validation guard | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Preset dropdown (90 / 95 / 99 / 99.9)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Shaded band | Translucent filled rectangle over m/z ± tol range on uPlot spectrum | ✓ |
| Two vertical dashed lines | Left/right edge lines at m/z ± tol | |
| You decide | Claude picks based on uPlot's API | |

**User's choice:** Shaded band (translucent filled rectangle)

---

## Claude's Discretion

None — all areas had explicit user choices.

## Deferred Ideas

- **Debounced live updates** — better after Phase 5 adds the Worker
- **Histogram** for blank-prevention — text stats cover the requirement; histogram for later polish
- **Web Worker offload** for ion-image compute — Phase 5
- **Mean/sum/max aggregation toggle** — v2/deferred
- **Shareable deep-link URL** — v2/deferred
