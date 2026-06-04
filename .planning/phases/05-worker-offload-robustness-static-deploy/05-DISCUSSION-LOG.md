# Phase 5: Worker Offload, Robustness & Static Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 5-Worker Offload, Robustness & Static Deploy
**Areas discussed:** Live m/z input vs button, "Not-imaging" error UX

---

## Live m/z input vs button

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the button | Explicit user intent. No spurious renders while typing. Simpler Worker message flow — one request per click. | ✓ |
| Live with debounce | Renders as-you-type after ~300–500ms pause. Requires debounce + cancel/abort signal. | |

**User's choice:** Keep the "Show Ion Image" button  
**Notes:** Worker removes the main-thread blocking constraint from Phase 4, but the button is kept for explicit intent and to avoid spurious Worker round-trips.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner / "Computing…" on button | Clear feedback; button disabled during compute to prevent double-submits. | ✓ |
| Canvas loading placeholder | Button stays normal; canvas shows spinner. | |

**User's choice:** Spinner / "Computing…" text on the button  
**Notes:** Button disabled during in-flight Worker request.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Full pipeline in Worker | All blocking I/O and compute moves off main thread. One Worker owns all file interaction. | ✓ |
| Ion-image only in Worker | Load pipeline stays on main thread; only extractXIC + buildIonImage offloaded. | |

**User's choice:** Full pipeline in Worker  
**Notes:** Consistent architecture — single Worker for all file operations.

---

## "Not-imaging" error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Clear informational message — not an error | "This file contains mass spectra but no spatial imaging coordinates." Friendly, not alarming. | ✓ |
| Dedicated error panel | Same error-state UI as unsupported/corrupt, distinct icon/color. | |

**User's choice:** Friendly informational message in the imaging section  
**Notes:** Non-imaging file is a valid successful read, not a failure.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Partial app — metadata + spectrum accessible | Only imaging section shows notice; rest of app works normally. | ✓ |
| Full-screen notice | Focused "not an imaging file" screen, no other panels. | |

**User's choice:** Partial app — metadata + spectrum still accessible  
**Notes:** Non-imaging files are still useful for spectrum inspection.

---

| Option | Description | Selected |
|--------|-------------|----------|
| New LoadStage 'no-imaging' | Separates valid reads from failures. Correct semantics. | ✓ |
| 3rd ReaderErrorClass variant | Consistent with classifyError() pattern but semantically wrong. | |

**User's choice:** New LoadStage `'no-imaging'`  
**Notes:** Keeps the error taxonomy clean for actual failures only.

---

## Claude's Discretion

- Worker API technology (Comlink vs raw postMessage vs custom protocol)
- Abort/cancel signal design for in-flight Worker requests
- GitHub Pages deploy trigger (push-to-main CI or manual)

## Deferred Ideas

- Live m/z scrubbing / debounced auto-trigger — deferred, button stays
- In-memory full-column Worker cache for instant m/z scrubbing — explicitly deferred (v2)
- Lazy Parquet row-group projection for multi-GB files — v2
