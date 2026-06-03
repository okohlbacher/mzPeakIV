---
status: partial
phase: 03-tic-image-pixel-spectrum-round-trip
source: [03-VERIFICATION.md]
started: 2026-06-03T00:00:00Z
updated: 2026-06-03T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. TIC heatmap renders on load
expected: After opening an imaging .mzpeak file, the ImagingPanel canvas shows a colored TIC heatmap. Absent pixels render as near-black (#1a1a1a sentinel), present zero-intensity pixels render at colormap bottom (dark viridis blue), non-zero pixels in the viridis gradient. The image appears immediately after the progress bar reaches "Ready".
result: [pending]

### 2. Hover readout behavior
expected: Moving the mouse over the canvas shows a text label below it: "x: N, y: N · TIC: N.Ne6" (1-based coords). Moving to an absent pixel shows "x: N, y: N — no data". Moving the mouse off the canvas clears the label.
result: [pending]

### 3. Pixel click → spectrum + selection ring
expected: Clicking a present pixel calls selectSpectrum, the SpectrumPanel uPlot chart updates to show that pixel's spectrum, the chart heading changes to "Spectrum — pixel (x, y)", and a 1px contrast ring appears on the clicked canvas pixel. Clicking an absent pixel does nothing.
result: [pending]

### 4. Non-imaging file layout
expected: Opening a non-imaging .mzpeak file (e.g. small.mzpeak from the upstream demo) shows no ImagingPanel — only the left sidebar and SpectrumPanel. The SpectrumPanel heading remains "Spectrum" (not "Spectrum — pixel (x, y)").
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
