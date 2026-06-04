// mzPeakWorker.ts — Worker entry point for the mzPeak read-and-compute pipeline.
//
// All mzpeakts/reader imports live HERE only — the Worker boundary is the new
// encapsulation wall. The existing "no mzpeakts outside src/reader/" rule still
// applies; the Worker is part of src/reader's execution context.
//
// The main thread is left stateless with respect to file I/O. The Reader handle
// lives here, never crosses to the main thread.
//
// DO NOT: import from ../state/store, instantiate `new Worker(...)` in this file.

import { openUrl as readerOpenUrl, openBlob, type Reader } from "../reader/openUrl";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
  spectrumMeta,
} from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
import { getSpectrumArraysFor } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
import { buildTic } from "../compute/tic";
import { buildIonImage, computeIonImageStats } from "../compute/ionImage";
import { UnsupportedEncodingError } from "../reader/errors";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { FileStats, LoadStage } from "../reader/types";
import type { ImagingGrid } from "../imaging/types";

// ---------------------------------------------------------------------------
// postMessage helpers
//
// In this tsconfig the DOM lib types `self` as `Window & typeof globalThis`.
// The DOM lib's postMessage overloads are:
//   (message, targetOrigin, transfer?)  ← the "window cross-frame" overload
//   (message, options?)                 ← WindowPostMessageOptions
// Neither matches the Worker's actual runtime signature:
//   (message, transfer: Transferable[]) ← DedicatedWorkerGlobalScope
// We cast through `unknown` to avoid the mismatch without pulling in the
// WebWorker lib (which conflicts with DOM in this single-tsconfig setup).
// ---------------------------------------------------------------------------

type WorkerSelf = { postMessage(message: unknown, transfer?: Transferable[]): void };
const workerSelf = self as unknown as WorkerSelf;

function send(message: WorkerResponse): void {
  workerSelf.postMessage(message);
}

function sendTransfer(message: WorkerResponse, transfer: Transferable[]): void {
  workerSelf.postMessage(message, transfer);
}

// ---------------------------------------------------------------------------
// Module-scope Worker state (Pitfall 5 — NEVER reinitialize inside onmessage)
// These persist across calls so renderIonImage and selectSpectrum can access
// the live Reader handle without the main thread holding any reference to it.
// ---------------------------------------------------------------------------
let activeReader: Reader | null = null;
let activeStats: FileStats | null = null;
let activeGrid: ImagingGrid | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Small await so staged-progress transitions are observable in the UI rather
 * than collapsing into a single synchronous frame (LOAD-03).
 * setTimeout is available in Workers; requestAnimationFrame is NOT.
 */
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Emit a progress stage tick to the main thread.
 * The main thread onmessage handler routes this to useStore.setState({ stage }).
 */
function postProgress(stage: LoadStage): void {
  send({ type: "progress", stage });
}

/**
 * Serialize the thrown error and send it to the main thread.
 * Error instances cannot cross the Worker boundary via structured clone with
 * reliable instanceof checks — emit a plain discriminated object instead.
 * Replicates the classifyError logic from store.ts lines 49-61.
 */
function postError(err: unknown): void {
  if (err instanceof UnsupportedEncodingError) {
    send({
      type: "error",
      class: "unsupported-encoding",
      message: err.message,
      findings: err.findings,
    });
  } else {
    send({
      type: "error",
      class: "corrupt",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Load pipeline — relocated from store.ts runLoad (lines 119-231)
// ---------------------------------------------------------------------------

/**
 * Run the staged load pipeline for a newly opened Reader. This is the exact
 * logic from store.ts::runLoad with these substitutions:
 *   - set({ stage: X })            →  postProgress(X)
 *   - set({ stage: 'error', ... }) →  postError(err); return
 *   - set({ stage: 'ready', ... }) →  sendTransfer({ type: 'loadResult', ... }, transferList)
 *   - non-imaging terminal state   →  send({ type: 'noImaging', ... })
 *
 * Also stores the resolved reader/stats/grid in module scope so subsequent
 * renderIonImage / selectSpectrum messages can access the live handles.
 */
async function runLoadInWorker(reader: Reader): Promise<void> {
  postProgress("manifest");
  await yieldFrame();
  const manifest = readManifest(reader);

  postProgress("metadata");
  await yieldFrame();
  const fileMeta = readFileMeta(reader);
  const stats = computeStats(reader, manifest);
  const capabilities = computeCapabilities(reader, manifest);

  // Eager 'grid' stage (D-05): reconstruct the imaging pixel grid only when this
  // is an imaging file. A non-imaging file leaves grid: null and routes to the
  // noImaging message — not an error (D-06).
  postProgress("grid");
  await yieldFrame();
  let grid: ImagingGrid | null = null;
  if (capabilities.isImaging) {
    const cr = extractCoords(reader);
    const geometry = readGridGeometry(reader);
    grid = cr
      ? buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy)
      : null;

    // Surface a named error when an imaging file's grid could not be built —
    // a silent grid:null on an imaging file is a failure, not a valid state.
    // D-06 only applies to non-imaging files.
    if (grid === null) {
      postError(
        new Error(
          "Imaging file detected but spatial pixel grid could not be reconstructed. " +
            "The coordinate columns may be empty or malformed.",
        ),
      );
      return;
    }
  }

  // Non-imaging branch (D-04/D-06): a valid mzPeak file with no spatial
  // coordinates is not an error — it routes to the 'no-imaging' LoadStage.
  // Metadata panel, manifest, and spectrum browser remain accessible (D-05).
  if (!capabilities.isImaging) {
    // Store reader/stats for selectSpectrum; no grid for renderIonImage.
    activeReader = reader;
    activeStats = stats;
    activeGrid = null;

    send({
      type: "noImaging",
      result: { manifest, fileMeta, stats, capabilities },
    });

    // Auto-select first spectrum so spectrum browser is immediately usable.
    if (stats.numSpectra > 0) {
      await runSelectSpectrum(0);
    }
    return;
  }

  // Eager 'tic' stage (D-02): compute the TIC raster the moment the grid exists.
  // Only runs for imaging files (grid !== null). Non-imaging files skipped above.
  let tic: Float32Array | null = null;
  let mixedRepresentationWarning: string | null = null;

  postProgress("tic");
  await yieldFrame();

  // D-08 majority-source rule: use profile when profile spectra are at least as
  // numerous as centroid (profile is the tiebreaker). Verbatim from store.ts:186-195.
  const { profile, centroid } = stats.representationCounts;
  const useProfile = profile >= centroid;
  const mixed = profile > 0 && centroid > 0;
  if (mixed) {
    const usedSource = useProfile ? "profile" : "centroid";
    const usedCount = useProfile ? profile : centroid;
    mixedRepresentationWarning =
      `Mixed profile/centroid spectra — TIC computed from ${usedSource} ` +
      `(${usedCount} of ${profile + centroid}); per-pixel spectra route individually`;
  }

  try {
    // extractXIC(null, null, useProfile) → one XICPoint per spectrum carrying
    // its full intensity array; buildTic sums each onto its grid cell (IMAGE-01).
    const xic = await reader.extractXIC(null, null, useProfile);
    // A null XIC is NOT an error (D-06): it yields tic: null.
    tic = xic ? buildTic(xic, grid!) : null;
  } catch (err) {
    // A genuine throw during TIC compute IS an error — route it loudly.
    postError(err);
    return;
  }

  // Store module-scope state BEFORE postMessage so renderIonImage/selectSpectrum
  // are ready the moment the main thread acknowledges the result.
  activeReader = reader;
  activeStats = stats;
  activeGrid = grid;

  // Build the transfer list: transfer tic.buffer zero-copy (Pattern 3 / Pitfall 2).
  // CRITICAL: always [float32Array.buffer] not [float32Array].
  // Also transfer presenceMask.buffer from grid (ImagingGrid note in protocol.ts).
  const transferList: Transferable[] = [];
  if (tic) transferList.push(tic.buffer);
  if (grid!.presenceMask) transferList.push(grid!.presenceMask.buffer);

  sendTransfer(
    {
      type: "loadResult",
      result: {
        manifest,
        fileMeta,
        stats,
        capabilities,
        grid: grid!,
        tic,
        mixedRepresentationWarning,
      },
    },
    transferList,
  );
  // WARNING: tic and presenceMask are now detached — do not use after postMessage.

  // Auto-select first spectrum (verbatim from store.ts lines 228-230).
  if (stats.numSpectra > 0) {
    await runSelectSpectrum(0);
  }
}

// ---------------------------------------------------------------------------
// selectSpectrum helper — shared by both load path and explicit selectSpectrum msg
// ---------------------------------------------------------------------------

async function runSelectSpectrum(index: number): Promise<void> {
  if (!activeReader) return;
  try {
    const meta = spectrumMeta(activeReader, index);
    const spectrum = await getSpectrumArraysFor(
      activeReader,
      index,
      meta.representation,
    );
    // Transfer mz.buffer and intensity.buffer zero-copy.
    const transferList: Transferable[] = [
      spectrum.mz.buffer,
      spectrum.intensity.buffer,
    ];
    sendTransfer({ type: "spectrumResult", spectrum }, transferList);
  } catch (err) {
    postError(err);
  }
}

// ---------------------------------------------------------------------------
// Main Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "loadUrl": {
        // Reset module-scope state before each new file load (Pitfall 5).
        activeReader = null;
        activeStats = null;
        activeGrid = null;

        const reader = await readerOpenUrl(msg.url);
        await runLoadInWorker(reader);
        break;
      }

      case "loadFile": {
        // Reset module-scope state before each new file load (Pitfall 5).
        activeReader = null;
        activeStats = null;
        activeGrid = null;

        // File objects cannot cross the Worker boundary (Pitfall 3 / Pattern 4).
        // The main thread transfers the ArrayBuffer; reconstruct a Blob here.
        const blob = new Blob([msg.bytes]);
        const reader = await openBlob(blob);
        await runLoadInWorker(reader);
        break;
      }

      case "renderIonImage": {
        // V5 input validation guard (ASVS L1) — defense-in-depth: validate at
        // the processing site, not only at the dispatch site (T-05-02).
        // Replicates store.ts lines 283-285 verbatim.
        const { mz, tolDa, requestId } = msg;
        if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
        if (mz - tolDa < 0) return; // non-physical negative mz start (T-04-05)

        if (!activeReader || !activeGrid || !activeStats) {
          // No file loaded yet — silently ignore.
          return;
        }

        // D-08 majority rule — verbatim from store.ts:288.
        const { profile, centroid } = activeStats.representationCounts;
        const useProfile = profile >= centroid;

        // Span1D shape {start, end} — NOT [min, max] tuple (Pitfall 3 / T-04-07).
        const mzRange = { start: mz - tolDa, end: mz + tolDa };
        const xic = await activeReader.extractXIC(null, mzRange, useProfile);
        const ionImage = xic ? buildIonImage(xic, activeGrid) : null;
        const ionImageStats = ionImage ? computeIonImageStats(ionImage, activeGrid) : null;

        // Transfer ionImage.buffer zero-copy (Pattern 3 / T-05-04).
        const transferList: Transferable[] = [];
        if (ionImage) transferList.push(ionImage.buffer);

        sendTransfer(
          {
            type: "renderResult",
            ionImage,
            stats: ionImageStats,
            requestId,
          },
          transferList,
        );
        // WARNING: ionImage is now detached — do not use after postMessage.
        break;
      }

      case "selectSpectrum": {
        await runSelectSpectrum(msg.index);
        break;
      }
    }
  } catch (err) {
    // Outer catch serializes any unexpected error through the error boundary.
    // Worker isolates WASM crashes to its thread; main thread stays alive (T-05-03).
    postError(err);
  }
};
