---
phase: "04-ion-image-intensity-scaling"
plan: 4
subsystem: "ui/SpectrumPanel"
tags: ["spectrum", "uplot", "SPEC-02", "band-overlay", "hooks-draw"]
dependency_graph:
  requires:
    - "04-03 (mzWindow state field in store — { mz: number; tolDa: number } | null)"
  provides:
    - "SPEC-02 translucent amber band over [mz-tolDa, mz+tolDa] in SpectrumPanel via uPlot hooks.draw"
  affects:
    - "src/ui/App.tsx (SpectrumPanel caller — no prop change needed; already passes no props)"
tech_stack:
  added: []
  patterns:
    - "uPlot hooks.draw for canvas annotation — reads ref, not closure variable (Pitfall 5 / zoom-safe)"
    - "useRef for mutable draw-hook state (mzWindowRef) to avoid plot destroy/recreate on update"
    - "Second useEffect with mzWindow dep array syncing ref + calling plot.redraw()"
    - "ctx.save()/ctx.restore() pair to isolate fillStyle from subsequent uPlot draws"
    - "valToPos(..., 'x', true) for device-pixel coords matching canvas ctx"
key_files:
  modified:
    - src/ui/SpectrumPanel.tsx
decisions:
  - "Removed Phase 3 MzWindow type + SpectrumPanelProps interface — mzWindow authority is the store, not props"
  - "Band reads mzWindowRef.current inside hooks.draw so valToPos executes on every redraw (zoom/pan safe)"
  - "SpectrumPanel() now takes no props — callers in App.tsx already pass none"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-04T00:39:51Z"
  tasks: 1
  files: 1
---

# Phase 4 Plan 4: SPEC-02 Band in SpectrumPanel via uPlot hooks.draw Summary

**One-liner:** Wired SPEC-02 by adding a uPlot hooks.draw callback that draws a translucent amber band over [mz-tolDa, mz+tolDa] on every spectrum redraw, reading mzWindow from the store via a ref to avoid plot destruction on update.

## What Was Built

### Task 1 — Activate SPEC-02 band in SpectrumPanel.tsx (commit 9b94c0c)

Edited `src/ui/SpectrumPanel.tsx`:

**Removed Phase 3 no-ops:**
- `export type MzWindow = { center: number; lo: number; hi: number }` — Phase 3 placeholder type, no longer needed
- `interface SpectrumPanelProps` and `mzWindow?: MzWindow | null` prop — mzWindow comes from the store directly
- `void _props.mzWindow` — the intentionally-unused no-op line
- `_props: SpectrumPanelProps = {}` function parameter — component now takes no props

**Added (Step 1) mzWindowRef:**
```typescript
const mzWindowRef = useRef<{ mz: number; tolDa: number } | null>(null);
```
The ref stores the latest mzWindow value so the draw hook reads it without needing to be recreated on every state change.

**Added (Step 2) store subscription:**
```typescript
const mzWindow = useStore((s) => s.mzWindow);
```
Reads `mzWindow: { mz: number; tolDa: number } | null` from the Phase 4 store slice (Plan 04-03).

**Added (Step 3) hooks.draw in uPlot opts:**
```typescript
hooks: {
  draw: [
    (u: uPlot) => {
      const w = mzWindowRef.current;
      if (!w) return;
      const xLo = u.valToPos(w.mz - w.tolDa, "x", true);
      const xHi = u.valToPos(w.mz + w.tolDa, "x", true);
      const { ctx } = u;
      ctx.save();
      ctx.fillStyle = "rgba(255,200,0,0.25)";
      ctx.fillRect(xLo, u.bbox.top, xHi - xLo, u.bbox.height);
      ctx.restore();
    },
  ],
},
```
- `valToPos(..., "x", true)` → device-pixel coords matching the canvas `ctx` (canvasPixels=true)
- `u.bbox.top` / `u.bbox.height` → plot area bounds (verified uPlot.d.ts:25)
- `ctx.save()` / `ctx.restore()` → isolates fillStyle from subsequent uPlot draw operations
- `if (!w) return` → no band when mzWindow is null (TIC-only state)

**Added (Step 4) mzWindow sync effect:**
```typescript
useEffect(() => {
  mzWindowRef.current = mzWindow;
  plotRef.current?.redraw();
}, [mzWindow]);
```
Syncs the ref on every mzWindow change and triggers uPlot redraw so hooks.draw fires with the updated value. The plot instance is not destroyed or recreated (Pitfall 5 avoided).

## Verification Evidence

```
npm run build: ✓ built in 967ms (zero TypeScript errors)
grep mzWindowRef/hooks/valToPos: all three present at correct lines
grep innerHTML: empty (no XSS risk confirmed)
No file deletions in commit diff.
```

## Acceptance Criteria Verification

- `mzWindowRef = useRef` present: line 30 — PASS
- `useStore((s) => s.mzWindow)` present: line 18 — PASS
- opts contains `hooks: { draw: [` wired in opts before `new uPlot(...)`: lines 78-92 — PASS
- draw hook contains `u.valToPos(w.mz - w.tolDa, "x", true)`: line 83 — PASS
- draw hook contains `ctx.fillStyle = "rgba(255,200,0,0.25)"`: line 87 — PASS
- draw hook contains `ctx.save()` and `ctx.restore()`: lines 86, 89 — PASS
- Second `useEffect` with `mzWindow` in deps and `plotRef.current?.redraw()`: lines 133-136 — PASS
- Old `void _props.mzWindow` no-op GONE: PASS
- npm run build exits 0: PASS
- No innerHTML in SpectrumPanel.tsx: PASS (grep returns empty)

## Deviations from Plan

None — plan executed exactly as written.

All `must_haves.truths` verified:
- `SPEC-02 m/z window band renders on the spectrum chart when mzWindow !== null` — hooks.draw fires with ref value on every redraw
- `Band drawn via uPlot hooks.draw using valToPos — never a DOM overlay` — implemented as specified
- `Band recomputes on every redraw (correct after zoom/pan — Pitfall 5)` — valToPos inside draw hook, not cached pixel coords
- `mzWindow changes trigger plot.redraw() so the band appears without destroying the plot` — sync effect calls `plotRef.current?.redraw()`
- `Band does NOT render when mzWindow is null (TIC-only state)` — `if (!w) return` guard at top of draw callback

## Known Stubs

None — the SPEC-02 band is fully implemented. When mzWindow is non-null (set by `renderIonImage` in Plan 04-03), the band renders automatically on every spectrum redraw including after zoom and pan operations.

## Threat Flags

None — this plan adds only canvas 2D draw operations:
- T-04-08: `valToPos` with extreme mz/tolDa → `fillRect` with off-canvas coords is a no-op (no crash risk)
- T-04-09: No innerHTML — draw hook uses `ctx.fillRect` only (Canvas 2D, no DOM injection)
- T-04-SC: Zero new packages installed

## Self-Check: PASSED

- `src/ui/SpectrumPanel.tsx`: FOUND at correct worktree path, contains all required patterns
- Commit `9b94c0c`: FOUND (`feat(04-04): wire SPEC-02 m/z band in SpectrumPanel via uPlot hooks.draw`)
- Build exits 0: CONFIRMED (✓ built in 967ms)
- No unexpected file deletions: CONFIRMED
