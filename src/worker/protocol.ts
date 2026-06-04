// Typed postMessage protocol for the mzPeakWorker boundary.
//
// CONTRACT: only serializable/transferable types appear here.
// No Reader, no Arrow Table, no mzpeakts internals cross this boundary.
//
// WorkerRequest  — messages posted from the main thread to the Worker.
// WorkerResponse — messages posted from the Worker to the main thread.
//
// All types are pure type/interface declarations — no runtime code in this file.

import type { LoadStage, ManifestEntry, FileMeta, FileStats, Capabilities, UnsupportedFinding, SpectrumArrays } from "../reader/types";
import type { ReaderErrorClass } from "../reader/errors";
import type { ImagingGrid } from "../imaging/types";

// ---------------------------------------------------------------------------
// Inbound (main thread → Worker)
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all messages the main thread sends to the Worker.
 *
 * - loadUrl / loadFile: open a file and run the full load pipeline
 *   (ZIP → manifest → metadata → grid → TIC → result)
 * - renderIonImage: extract XIC for a given m/z window and return a Float32Array
 * - selectSpectrum: retrieve the mz/intensity arrays for one spectrum by index
 *
 * requestId on renderIonImage enables stale-response cancellation on the main
 * thread (Pattern 5 from RESEARCH.md — generation counter).
 */
export type WorkerRequest =
  | { type: "loadUrl"; url: string }
  | { type: "loadFile"; bytes: ArrayBuffer; name: string }
  | { type: "renderIonImage"; mz: number; tolDa: number; requestId: number }
  | { type: "selectSpectrum"; index: number };

// ---------------------------------------------------------------------------
// Outbound (Worker → main thread)
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all messages the Worker sends to the main thread.
 *
 * - progress: intermediate stage tick during the load pipeline
 * - loadResult: successful imaging file load — all fields for imaging mode
 * - noImaging: successful non-imaging file load — metadata only, no grid/tic
 * - renderResult: Float32Array of per-pixel intensity values (or null on error);
 *   stats is null when ionImage is null; requestId echoes the request for stale
 *   response detection
 * - spectrumResult: mz/intensity arrays for one spectrum
 * - error: any failure during load, render, or spectrum fetch — carries the
 *   serialized StoreError shape (classifyError runs inside the Worker)
 */
export type WorkerResponse =
  | { type: "progress"; stage: LoadStage }
  | { type: "loadResult"; result: LoadResult }
  | { type: "noImaging"; result: NonImagingResult }
  | {
      type: "renderResult";
      ionImage: Float32Array | null;
      stats: IonImageStats | null;
      requestId: number;
    }
  | { type: "spectrumResult"; spectrum: SpectrumArrays }
  | {
      type: "error";
      class: ReaderErrorClass;
      message: string;
      findings?: UnsupportedFinding[];
    };

// ---------------------------------------------------------------------------
// Result payloads
// ---------------------------------------------------------------------------

/**
 * Result object emitted on a successful imaging file load.
 *
 * All fields are plain serializable/transferable values:
 * - manifest, fileMeta, stats, capabilities: plain JSON-safe objects
 * - grid: ImagingGrid — SERIALIZATION NOTE: ImagingGrid contains a
 *   Map<number, number> (coordToSpectrumIndex) and a Uint8Array (presenceMask).
 *   Both survive structured clone (Maps are cloneable; TypedArrays are
 *   cloneable). The Map is deep-cloned (not zero-copy); the presenceMask
 *   Uint8Array is structured-cloned (small, ~35 KB). presenceMask.buffer is
 *   intentionally NOT transferred — the Worker retains a valid presenceMask
 *   for subsequent renderIonImage calls.
 * - tic: Float32Array — transfer tic.buffer zero-copy (Pitfall 2 / Pattern 3)
 * - mixedRepresentationWarning: optional human-readable diagnostic string
 */
export type LoadResult = {
  manifest: ManifestEntry[];
  fileMeta: FileMeta;
  stats: FileStats;
  capabilities: Capabilities;
  grid: ImagingGrid | null;
  tic: Float32Array | null;
  mixedRepresentationWarning: string | null;
};

/**
 * Result object emitted on a successful non-imaging file load (D-05 / D-06).
 *
 * No grid, no tic — the file has no spatial coordinates. The main thread sets
 * stage: 'no-imaging' and keeps metadata panel, manifest, and spectrum browser
 * accessible while hiding the TIC/ion-image canvas area.
 */
export type NonImagingResult = {
  manifest: ManifestEntry[];
  fileMeta: FileMeta;
  stats: FileStats;
  capabilities: Capabilities;
};

/**
 * Ion image intensity statistics sent alongside renderResult.
 *
 * Mirrors the ionImageStats field shape in src/state/store.ts so the main
 * thread can spread this directly into the store state update.
 */
export type IonImageStats = {
  nonzeroCount: number;
  min: number;
  max: number;
};
