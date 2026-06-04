---
status: complete
phase: 04-ion-image-intensity-scaling
source: [04-VERIFICATION.md]
started: 2026-06-04T01:20:00Z
updated: 2026-06-04T01:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Show Ion Image renders correctly

Run the app, open a `.mzpeak` imaging file, enter a valid m/z and Da tolerance, click **Show Ion Image**.
expected: Ion image canvas appears below TIC canvas with viridis colormap applied; stats line shows pixel count and value range
result: pass

### 2. Colormap change does not re-query

With an ion image displayed, change the colormap to inferno or gray.
expected: Canvas recolors immediately with no loading indicator; browser DevTools shows zero new network requests (no re-call to extractXIC)
result: pass

### 3. SPEC-02 amber band on spectrum

Click a pixel on the ion image canvas — check the spectrum panel.
expected: uPlot spectrum redraws with a translucent amber band over [mz-tolDa, mz+tolDa]; band is absent before Show Ion Image is first clicked
result: pass

### 4. Log scale on high-dynamic-range file

Load a file, enable log scale, click Show Ion Image.
expected: Log scaling reveals low-intensity signal — image is not entirely blank; distinct spatial structure visible vs linear scale
result: pass

### 5. ppm tolerance unit conversion

Set tolerance unit to ppm, enter an m/z and ppm tolerance, click Show Ion Image.
expected: Ion image renders the correct m/z window (ppmToDa conversion applied before query — confirm by comparing with Da mode at equivalent window)
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
