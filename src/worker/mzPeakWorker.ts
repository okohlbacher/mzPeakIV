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

import { ZipStorage } from "mzpeakts";
import { openReaderFromStore, type Reader } from "../reader/openUrl";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
  spectrumMeta,
} from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
import { getSpectrumArraysFor } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
import { buildIonImage, computeIonImageStats } from "../compute/ionImage";
import { UnsupportedEncodingError } from "../reader/errors";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { FileStats, LoadStage, ManifestEntry } from "../reader/types";
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
//
// Two-phase lazy loading:
//   Phase 1 (loadUrl/loadFile): ZipStorage only — reads mzpeak_index.json (fast)
//   Phase 2 (first renderIonImage): full MzPeakReader init + grid (user-triggered)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeZipStorage: ZipStorage<any> | null = null;
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
// Fast-path load — reads ONLY mzpeak_index.json (606 bytes)
// ---------------------------------------------------------------------------

/**
 * Extract a ManifestEntry array from ZipStorage.fileIndex.
 * The fileIndex is populated by ZipStorage.fromUrl/fromBlob (fast path — no
 * Parquet data read). entityType and dataKind are enum strings, compatible
 * with our plain-string ManifestEntry type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function manifestFromStore(store: ZipStorage<any>): ManifestEntry[] {
  return store.fileIndex.files.map(
    (f: { name: string; entityType: string; dataKind: string }) => ({
      name: f.name,
      entityType: f.entityType,
      dataKind: f.dataKind,
    }),
  );
}

/**
 * Fast load: opens the ZIP and reads ONLY mzpeak_index.json (~600 bytes).
 * No Parquet data is read. Emits loadResult immediately with manifest +
 * capabilities.isImaging; fileMeta/stats/grid/tic are all null (lazy).
 *
 * For imaging files: the main thread shows the controls panel and waits for
 * the user to click "Show Ion Image" before any heavy Parquet work happens.
 *
 * For non-imaging files: emits noImaging immediately so the user sees the
 * metadata/spectrum browser; the full reader is initialized lazily on the
 * first selectSpectrum call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFastLoad(store: ZipStorage<any>): Promise<void> {
  const manifest = manifestFromStore(store);
  const isImaging = store.fileIndex.metadata?.imaging?.is_imaging === true;

  // Minimal capabilities from the manifest — layout/encodings unknown until
  // full reader init, which is deferred to the first renderIonImage call.
  const capabilities = {
    isImaging,
    layout: "point" as const,  // assume point; corrected on full init
    encodings: [] as string[],
    unsupported: [] as { code: string; label: string }[],
  };

  postProgress("manifest");
  await yieldFrame();
  postProgress("metadata");
  await yieldFrame();

  if (!isImaging) {
    // Non-imaging: send noImaging immediately. The full reader is initialized
    // lazily on the first selectSpectrum message.
    send({ type: "noImaging", result: { manifest, fileMeta: null, stats: null, capabilities } });
    return;
  }

  // Imaging: send loadResult with grid:null/tic:null — no Parquet touched yet.
  // ImagingPanel renders with empty state; grid+XIC computed on first
  // "Show Ion Image" click (renderIonImage message).
  send({
    type: "loadResult",
    result: {
      manifest,
      fileMeta: null,
      stats: null,
      capabilities,
      grid: null,
      tic: null,
      mixedRepresentationWarning: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Lazy full-reader init — triggered by first renderIonImage / selectSpectrum
// ---------------------------------------------------------------------------

/**
 * Initialize the full MzPeakReader from the cached ZipStorage and build the
 * imaging grid. This is the slow step (reads spectra_metadata.parquet).
 * Called lazily on the first renderIonImage message.
 *
 * Posts a 'grid' progress tick so the UI shows a loading state.
 * Returns false and posts an error if initialization fails.
 */
async function initReaderAndGrid(): Promise<boolean> {
  if (!activeZipStorage) return false;

  postProgress("grid");
  await yieldFrame();

  try {
    // This reads spectra_metadata.parquet fully — the slow step (~553 MB for HR2MSI).
    const reader = await openReaderFromStore(activeZipStorage);
    const manifestEntries = readManifest(reader);
    const fileMeta = readFileMeta(reader);
    const stats = computeStats(reader, manifestEntries);
    const capabilities = computeCapabilities(reader, manifestEntries);

    const cr = extractCoords(reader);
    const geometry = readGridGeometry(reader);
    const grid = cr
      ? buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy)
      : null;

    if (grid === null) {
      postError(
        new Error(
          "Imaging file detected but spatial pixel grid could not be reconstructed. " +
            "The coordinate columns may be empty or malformed.",
        ),
      );
      return false;
    }

    activeReader = reader;
    activeStats = stats;
    activeGrid = grid;

    // Send updated metadata/stats now that the full reader is ready.
    send({
      type: "loadResult",
      result: {
        manifest: manifestEntries,
        fileMeta,
        stats,
        capabilities,
        grid,
        tic: null,
        mixedRepresentationWarning: null,
      },
    });

    return true;
  } catch (err) {
    postError(err);
    return false;
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
        // Reset ALL module-scope state before each new file load (Pitfall 5).
        activeZipStorage = null;
        activeReader = null;
        activeStats = null;
        activeGrid = null;

        // FAST PATH: read only mzpeak_index.json (~600 bytes) via range request.
        // No Parquet data read here. Full reader init is deferred to first
        // renderIonImage / selectSpectrum call.
        activeZipStorage = await ZipStorage.fromUrl(msg.url);
        await runFastLoad(activeZipStorage);
        break;
      }

      case "loadFile": {
        // Reset ALL module-scope state before each new file load (Pitfall 5).
        activeZipStorage = null;
        activeReader = null;
        activeStats = null;
        activeGrid = null;

        // File objects cannot cross the Worker boundary (Pitfall 3 / Pattern 4).
        // The main thread transfers the ArrayBuffer; reconstruct a Blob here.
        const blob = new Blob([msg.bytes]);

        // FAST PATH: BlobReader reads mzpeak_index.json only.
        activeZipStorage = await ZipStorage.fromBlob(blob);
        await runFastLoad(activeZipStorage);
        break;
      }

      case "renderIonImage": {
        // V5 input validation guard (ASVS L1) — defense-in-depth.
        const { mz, tolDa, requestId } = msg;
        if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
        if (mz - tolDa < 0) return;

        // LAZY INIT: on the first renderIonImage after a fast-path load, initialize
        // the full reader and build the imaging grid. This reads spectra_metadata.parquet
        // (~553 MB for HR2MSI) — intentionally deferred to the first user request.
        if (!activeReader || !activeGrid) {
          const ok = await initReaderAndGrid();
          if (!ok) return;
        }

        if (!activeReader || !activeGrid || !activeStats) return;

        // D-08 majority rule.
        const { profile, centroid } = activeStats.representationCounts;
        const useProfile = profile >= centroid;

        // Span1D shape {start, end} — NOT [min, max] tuple (T-04-07).
        const mzRange = { start: mz - tolDa, end: mz + tolDa };
        const xic = await activeReader.extractXIC(null, mzRange, useProfile);
        const ionImage = xic ? buildIonImage(xic, activeGrid) : null;
        const ionImageStats = ionImage ? computeIonImageStats(ionImage, activeGrid) : null;

        const transferList: Transferable[] = [];
        if (ionImage) transferList.push(ionImage.buffer);

        sendTransfer(
          { type: "renderResult", ionImage, stats: ionImageStats, requestId },
          transferList,
        );
        break;
      }

      case "selectSpectrum": {
        // For non-imaging files: lazily init the full reader on first spectrum select.
        if (!activeReader && activeZipStorage) {
          try {
            const reader = await openReaderFromStore(activeZipStorage);
            activeReader = reader;
            activeStats = computeStats(reader, readManifest(reader));
          } catch (err) {
            postError(err);
            return;
          }
        }
        await runSelectSpectrum(msg.index);
        break;
      }
    }
  } catch (err) {
    postError(err);
  }
};
