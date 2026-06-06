# Design Handoff v2 — reconciliation deltas

This file records where the **OpenMS / mzPeak Design Handoff (v2)** diverges from
the shipped `mzPeakIV` code, after syncing the handoff into the app. The handoff
claims to be *"Synced to okohlbacher/mzPeakIV @ HEAD f3e4f7d"*, but several
sections document state that was explicitly changed during UAT (all landed
**before** f3e4f7d). The items below are **corrections the design team should
apply to the handoff** so the sibling-app spec stays accurate and does not drift
back into this app.

## Applied from the handoff

- **§7 — "Image Info" panel `defaultOpen`.** Adopted: the *MS Image* panel now
  opens on load (alongside *Sample & Run*). Note the panel is named **"MS Image"**,
  not "Image Info" (see delta D2).
- **§7 — status bar `mode · dimensions · counts · zoom`.** The status bar now also
  shows the acquisition **mode** (profile/centroid) and the **live zoom %**.
- **§1/§9 — brand device in empty states.** The dark-stage empty states now carry a
  faint OpenMS stick-spectrum watermark above their copy.

## Deltas — handoff is STALE; the app is correct (do NOT change the app)

| # | Handoff section | Handoff says | App (operator's UAT decision) | Correct the handoff to |
|---|---|---|---|---|
| D1 | §3 colormaps, §6 ColormapScale `--basepeak`, §7 Views | **base-peak** hue-cycle colormap; Overview = "TIC / base-peak m/z" | base-peak **removed** entirely (operator: "Remove it") | drop all base-peak references; Overview is **TIC only** |
| D2 | §7 rail panel #2 | **"Image Info"** | **"MS Image"** (renamed to distinguish from optical images) | rename to **"MS Image"** |
| D3 | §7 rail order | omits a **Settings** panel | *Settings* lives **in the rail** (operator: "settings in the left sidebar") | add **Settings** to the rail order (after Optical, before Format details) |
| D4 | §7 Views list | Overview / Optical / Ion Image / Multi-channel (**no Blend**) | a **Blend** view exists (opacity overlay of TIC / Ion / RGB / Optical) | add **Blend** to the Views list |

## Not adopted (operator choice)

- **§9 — optical-view icon `Eye`.** Kept Lucide **`Microscope`** — more literally
  "optical microscopy" for the embedded-image overlay.

## Net rail order (current, authoritative)

`Sample & Run` (open) · `MS Image` (open) · `Optical` (when present) ·
`Settings` (collapsed) · `Format details` (collapsed).
