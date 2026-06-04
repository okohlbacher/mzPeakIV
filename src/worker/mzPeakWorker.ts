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
import { ParquetFile } from "parquet-wasm";
import { tableFromIPC } from "apache-arrow";
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
    // Non-imaging: send lightweight noImaging immediately (no Parquet touched yet).
    send({ type: "noImaging", result: { manifest, fileMeta: null, stats: null, capabilities } });
    // Background: read stats columns (~450 KB) so Image Info + spectrum browser populate.
    computeFastOverview(false).catch((e) => console.warn("[mzPeakWorker] fast overview failed (non-fatal):", e));
    return;
  }

  // Imaging: send lightweight loadResult first (no Parquet touched yet).
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

  // Background: column-projected read (~760 KB) builds grid + TIC + base-peak map.
  computeFastOverview(true).catch((e) => console.warn("[mzPeakWorker] fast overview failed (non-fatal):", e));
}

// ---------------------------------------------------------------------------
// Fast overview — Option A (TIC) + Option C (base-peak m/z map)
// ---------------------------------------------------------------------------

/**
 * Column-projected read of spectra_metadata.parquet.
 *
 * Fetches only 5 of the hundreds of column chunks:
 *   scan.IMS_1000050_position_x     ~2 KB  (X coordinates)
 *   scan.IMS_1000051_position_y     ~0.5 KB (Y coordinates)
 *   spectrum.MS_1000285_total_ion_current    ~185 KB (pre-computed TIC)
 *   spectrum.MS_1000504_base_peak_mz        ~120 KB (dominant m/z per pixel)
 *   spectrum.MS_1000527/28 highest/lowest mz ~450 KB (global m/z range)
 *
 * Total: ~760 KB vs 553 MB for a full read — a 700× savings.
 * Parquet-wasm uses RemoteBlob.slice() under the hood so only the needed
 * column chunks are fetched via HTTP range requests.
 *
 * Sends a second loadResult with:
 *   - grid built from promoted IMS:1000050/51 columns (C2 correct)
 *   - tic Float32Array (pre-computed TIC per pixel)
 *   - basePeakMz Float32Array (base-peak m/z per pixel, for false-color)
 *   - stats populated (numSpectra, m/z range)
 */
/**
 * Column-projected fast read of spectra_metadata.parquet.
 *
 * Works for both imaging and non-imaging files:
 * - Imaging: builds ImagingGrid + TIC + base-peak m/z map, sends second loadResult
 * - Non-imaging: reads numSpectra + m/z range, sends updated noImaging with stats
 *
 * Uses row-by-row Arrow iteration (same pattern as mzpeakts/metadata.ts) to
 * avoid Apache Arrow version-specific getChild() quirks on struct columns.
 *
 * Data fetched via HTTP range requests (parquet-wasm + RemoteBlob.slice):
 *   scan.IMS_1000050_position_x        ~2 KB   (x coords, imaging only)
 *   scan.IMS_1000051_position_y        ~0.5 KB (y coords, imaging only)
 *   spectrum.MS_1000285_total_ion_current  ~185 KB (pre-computed TIC)
 *   spectrum.MS_1000504_base_peak_mz       ~120 KB (dominant m/z per pixel)
 *   spectrum.MS_1000527/28 mz range        ~450 KB (global m/z range)
 * Total: ~760 KB vs 553 MB for full read.
 */
async function computeFastOverview(isImaging: boolean): Promise<void> {
  if (!activeZipStorage) return;

  // Only show progress for imaging files (non-imaging has no TIC stage).
  // Also wrap everything in try/catch — fast overview is best-effort; errors
  // here must never surface to the user (the file already loaded successfully).
  try {
  if (isImaging) {
    postProgress("tic");
    await yieldFrame();
  }

  const metaBlob = await activeZipStorage.spectrumMetadata();
  if (!metaBlob) return;

  // Columns to request — always include spectrum fields; conditionally include
  // scan coords (only exist/matter for imaging files).
  const columns = [
    "spectrum.MS_1000285_total_ion_current_unit_MS_1000131",
    "spectrum.MS_1000504_base_peak_mz_unit_MS_1000040",
    "spectrum.MS_1000527_highest_observed_mz_unit_MS_1000040",
    "spectrum.MS_1000528_lowest_observed_mz_unit_MS_1000040",
    ...(isImaging
      ? ["scan.IMS_1000050_position_x", "scan.IMS_1000051_position_y"]
      : []),
  ];

  const pf = await ParquetFile.fromFile(metaBlob as unknown as Blob);
  const rawTable = await pf.read({ columns });
  const table = tableFromIPC(rawTable.intoIPCStream());

  const nRows = table.numRows;
  if (nRows === 0) return;

  // Row-by-row extraction — works reliably across Arrow 21.x struct layouts.
  // Each row is a StructRowProxy; access nested fields via dotted property access.
  const coords: Array<{ x: number; y: number }> = isImaging ? new Array(nRows) : [];
  const spectrumIndices: number[] = isImaging ? new Array(nRows) : [];
  const ticValues = new Float32Array(nRows);
  const bpMzValues = new Float32Array(nRows);
  let globalMinMz = Infinity;
  let globalMaxMz = -Infinity;

  for (let i = 0; i < nRows; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = table.get(i) as any;
    const spec = row?.spectrum ?? row;
    const scan = row?.scan;

    const tic = Number(spec?.MS_1000285_total_ion_current_unit_MS_1000131 ?? 0);
    const bpMz = Number(spec?.MS_1000504_base_peak_mz_unit_MS_1000040 ?? 0);
    const loMz = Number(spec?.MS_1000528_lowest_observed_mz_unit_MS_1000040 ?? 0);
    const hiMz = Number(spec?.MS_1000527_highest_observed_mz_unit_MS_1000040 ?? 0);

    ticValues[i] = tic;
    bpMzValues[i] = bpMz;
    if (loMz > 0 && loMz < globalMinMz) globalMinMz = loMz;
    if (hiMz > globalMaxMz) globalMaxMz = hiMz;

    if (isImaging && scan) {
      coords[i] = { x: Number(scan.IMS_1000050_position_x ?? 0), y: Number(scan.IMS_1000051_position_y ?? 0) };
      spectrumIndices[i] = i;
    }
  }

  const stats: FileStats = {
    numSpectra: nRows,
    numEntities: nRows,
    mzRange: Number.isFinite(globalMinMz) && Number.isFinite(globalMaxMz)
      ? [globalMinMz, globalMaxMz] : null,
    msLevels: [1],
    representationCounts: { profile: 0, centroid: nRows },
  };

  const manifest = manifestFromStore(activeZipStorage);
  const capabilities = {
    isImaging,
    layout: "point" as const,
    encodings: [] as string[],
    unsupported: [] as { code: string; label: string }[],
  };

  if (!isImaging) {
    // Non-imaging: just send stats update via noImaging
    send({
      type: "noImaging",
      result: { manifest, fileMeta: null, stats, capabilities },
    });
    // Also auto-select the first spectrum so the browser is usable immediately
    if (nRows > 0) {
      // Lazily init reader on demand via the existing selectSpectrum path
      // (avoids triggering the full 553 MB read here)
    }
    return;
  }

  // Imaging path: build grid, TIC image, and base-peak m/z overview.
  const grid = buildImagingGrid(coords, spectrumIndices, null, "promoted-columns");
  if (!grid) return;

  const base = grid.coordinateBase ?? 1;

  // Option A: TIC image
  const tic = new Float32Array(grid.width * grid.height);
  for (let i = 0; i < nRows; i++) {
    const x0 = coords[i].x - base;
    const y0 = coords[i].y - base;
    const key = y0 * grid.width + x0;
    if (key >= 0 && key < tic.length) tic[key] = ticValues[i];
  }

  // Option C: Base-peak m/z false-color map
  const basePeakMz = new Float32Array(grid.width * grid.height);
  for (let i = 0; i < nRows; i++) {
    const x0 = coords[i].x - base;
    const y0 = coords[i].y - base;
    const key = y0 * grid.width + x0;
    if (key >= 0 && key < basePeakMz.length) basePeakMz[key] = bpMzValues[i];
  }

  // Cache grid so renderIonImage skips the slow initReaderAndGrid for coordinates.
  // activeReader remains null; extractXIC still triggers full init on first call.
  activeGrid = grid;

  const transferList: Transferable[] = [tic.buffer, basePeakMz.buffer];

  sendTransfer(
    {
      type: "loadResult",
      result: {
        manifest,
        fileMeta: null,
        stats,
        capabilities,
        grid,
        tic,
        mixedRepresentationWarning: null,
        basePeakMz,
      },
    },
    transferList,
  );
  } catch (e) {
    // Fast overview is best-effort — silently skip if column projection fails
    // (e.g. file schema differs, RemoteBlob range issue, or parquet-wasm error).
    console.warn("[mzPeakWorker] computeFastOverview failed (non-fatal):", e);
  }
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

        // LAZY INIT: the full MzPeakReader is needed for extractXIC.
        // activeGrid may already be set by computeFastOverview (fast column projection),
        // but activeReader is still null until the first renderIonImage.
        if (!activeReader) {
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
