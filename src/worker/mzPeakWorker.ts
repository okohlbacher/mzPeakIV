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
import { Uint8ArrayWriter } from "@zip.js/zip.js";
import { ParquetFile, readParquet } from "parquet-wasm";
import { tableFromIPC } from "apache-arrow";
import { buildMiniParquet, type ColChunk } from "./parquetMini";
import { decodeFooter, readParquetFooter } from "./parquetFooter";
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
import { parseOpticalImages, decodeTiff } from "../imaging/optical";
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
    // Send the manifest immediately (fast — index only) so the UI is responsive,
    // then background-init the full reader to populate fileMeta + stats +
    // capabilities. For a non-imaging file there is no deferred "render ion
    // image" trigger, so the inspection panels would otherwise stay empty — the
    // user just wants to browse metadata + spectra right away. The store's
    // noImaging handler MERGES, so this second message fills in the details.
    send({ type: "noImaging", result: { manifest, fileMeta: null, stats: null, capabilities } });
    void (async () => {
      if (!activeZipStorage) return;
      try {
        const reader = await openReaderFromStore(activeZipStorage);
        const manifestEntries = readManifest(reader);
        const fileMeta = readFileMeta(reader);
        const stats = computeStats(reader, manifestEntries);
        const fullCaps = computeCapabilities(reader, manifestEntries);
        activeReader = reader;
        activeStats = stats;
        send({
          type: "noImaging",
          result: {
            manifest: manifestEntries,
            fileMeta,
            stats,
            capabilities: { ...fullCaps, isImaging: false },
          },
        });
      } catch (e) {
        console.warn("[runFastLoad] non-imaging full metadata load failed:", e);
      }
    })();
    return;
  }

  // ADD-01: parse embedded optical-image metadata from the index JSON (cheap —
  // already in memory). Pixel data is decoded lazily via getOpticalImage.
  const opticalImages = parseOpticalImages(store.fileIndex.metadata?.imaging);

  // Imaging: send lightweight loadResult immediately, then kick off buildGridFast
  // in the background to populate grid+TIC+stats without waiting for user click.
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
      opticalImages,
    },
  });

  // Background: build grid + TIC from metadata Parquet column chunks (~650 KB fetch).
  // When complete, sends a second loadResult with grid+tic+stats so the TIC
  // image appears automatically without the user clicking "Show Ion Image".
  buildGridFast().then((result) => {
    if (!result || !activeZipStorage) return;
    const tic: Float32Array | null = result.tic ?? null;
    const transferList: Transferable[] = [];
    if (tic) transferList.push(tic.buffer);
    sendTransfer({
      type: "loadResult",
      result: {
        manifest: manifestFromStore(activeZipStorage),
        fileMeta: null,
        stats: result.stats,
        capabilities,
        grid: result.grid,
        tic,
        mixedRepresentationWarning: null,
      },
    }, transferList);
  }).catch((e) => console.warn("[runFastLoad] background buildGridFast failed:", e));
}

// ---------------------------------------------------------------------------
// Fast grid build — direct Parquet column chunk reads (~188 KB total)
// ---------------------------------------------------------------------------

async function buildGridFast(): Promise<{ grid: ImagingGrid; stats: FileStats; tic: Float32Array | null } | null> {
  if (!activeZipStorage) { console.log("[BGF] no ZipStorage"); return null; }
  const T = () => Date.now();
  const t0 = T();
  const dt = (label: string) => console.log(`[BGF +${T()-t0}ms] ${label}`);
  try {
    dt("start");
    // BUG FIX: spectrumMetadata() returns ParquetFile (not RemoteBlob).
    // Use open(name) to get the actual RemoteBlob with .start/.size properties.
    const metaEntry = activeZipStorage.fileIndex.files.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.entityType === "spectrum" && f.dataKind === "metadata",
    );
    if (!metaEntry) { dt("no metadata entry in fileIndex"); return null; }
    dt(`metadata file: ${(metaEntry as any).name}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaBlob = await activeZipStorage.open((metaEntry as any).name);
    if (!metaBlob) { dt("open() returned null"); return null; }
    dt(`metaBlob: start=${(metaBlob as any).start} size=${(metaBlob as any).size}`);

    // Use RemoteBlob.slice().arrayBuffer() directly — works for both URL and
    // local file loads (HttpRangeReader and BlobReader respectively).
    const blobLike = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      size: (metaBlob as any).size as number,
      slice: (s: number, e: number) => ({
        arrayBuffer: async () => {
          const t1 = T();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const slice = (metaBlob as any).slice(s, e);
          const buf = await slice.arrayBuffer() as ArrayBuffer;
          dt(`  slice(${s},${e}) → ${buf.byteLength}B in ${T()-t1}ms`);
          return buf;
        },
      }),
    };

    dt("reading footer...");
    const footerBytes = await readParquetFooter(blobLike);
    dt(`footer ${footerBytes.byteLength}B read, parsing...`);
    const colInfoMap = decodeFooter(footerBytes);
    dt(`decoded footer, ${colInfoMap.size} columns found`);

    const targetPaths = [
      ["scan", "IMS_1000050_position_x"],
      ["scan", "IMS_1000051_position_y"],
      ["spectrum", "MS_1000285_total_ion_current_unit_MS_1000131"],
      ["spectrum", "MS_1000527_highest_observed_mz_unit_MS_1000040"],
      ["spectrum", "MS_1000528_lowest_observed_mz_unit_MS_1000040"],
    ];
    const pathTypes: Record<string, number> = {
      "scan.IMS_1000050_position_x": 2,
      "scan.IMS_1000051_position_y": 2,
      "spectrum.MS_1000285_total_ion_current_unit_MS_1000131": 4,
      "spectrum.MS_1000527_highest_observed_mz_unit_MS_1000040": 5,
      "spectrum.MS_1000528_lowest_observed_mz_unit_MS_1000040": 5,
    };

    const chunks: ColChunk[] = [];
    for (const path of targetPaths) {
      const dotPath = path.join(".");
      const colInfo = colInfoMap.get(dotPath);
      if (!colInfo) { dt(`MISSING col: ${dotPath}`); continue; }
      dt(`fetching ${dotPath}: dp=${colInfo.dataPageOffset} dict=${colInfo.dictPageOffset} size=${colInfo.compressedSize}`);
      const fetchStart = colInfo.dictPageOffset > 0
        ? Math.min(colInfo.dictPageOffset, colInfo.dataPageOffset)
        : colInfo.dataPageOffset;
      const dataPageOffsetInChunk = colInfo.dataPageOffset - fetchStart;
      const buf = await blobLike.slice(fetchStart, fetchStart + colInfo.compressedSize).arrayBuffer();
      dt(`  got ${buf.byteLength}B`);
      // Use type/codec/encodings from footer — don't hardcode.
      const enc = colInfo.encodings.length > 0
        ? colInfo.encodings
        : (colInfo.dictPageOffset > 0 ? [0, 3, 8] : [0, 3]);
      chunks.push({
        path,
        parquetType: colInfo.parquetType > 0 ? colInfo.parquetType : (pathTypes[dotPath] ?? 5),
        codec: colInfo.codec,
        encodings: enc,
        data: new Uint8Array(buf),
        numValues: colInfo.numValues || 0,
        uncompressedSize: colInfo.uncompressedSize,
        dataPageOffsetInChunk,
      });
    }
    if (chunks.length < 2) { dt(`not enough cols: ${chunks.length}`); return null; }

    const totalRows = chunks[0].numValues;
    const totalKB = (chunks.reduce((s,c)=>s+c.data.length,0)/1024).toFixed(1);
    dt(`building mini-Parquet: ${chunks.length} cols, ${totalKB}KB, ${totalRows} rows`);

    const miniParquet = buildMiniParquet(chunks, totalRows);
    dt(`mini-Parquet built: ${miniParquet.byteLength}B — calling readParquet...`);
    const rawTable = readParquet(miniParquet);
    dt("readParquet done — converting to Arrow...");
    const table = tableFromIPC(rawTable.intoIPCStream());
    dt(`Arrow table: ${table.numRows} rows`);

    const nRows = table.numRows;
    if (nRows === 0) { dt("0 rows!"); return null; }

    dt(`row iteration (${nRows} rows)...`);
    const xArr: number[] = new Array(nRows);
    const yArr: number[] = new Array(nRows);
    const ticArr: number[] = new Array(nRows);
    let globalMinMz = Infinity, globalMaxMz = -Infinity;
    for (let r = 0; r < nRows; r++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = table.get(r) as any;
      const scan = row?.scan; const spec = row?.spectrum;
      xArr[r] = Number(scan?.IMS_1000050_position_x ?? 0);
      yArr[r] = Number(scan?.IMS_1000051_position_y ?? 0);
      ticArr[r] = Number(spec?.MS_1000285_total_ion_current_unit_MS_1000131 ?? 0);
      const lo = Number(spec?.MS_1000528_lowest_observed_mz_unit_MS_1000040 ?? 0);
      const hi = Number(spec?.MS_1000527_highest_observed_mz_unit_MS_1000040 ?? 0);
      if (lo > 0 && lo < globalMinMz) globalMinMz = lo;
      if (hi > globalMaxMz) globalMaxMz = hi;
    }
    dt(`row iteration done — building grid...`);

    const coords = xArr.map((x, i) => ({ x, y: yArr[i] }));
    const spectrumIndices = Array.from({ length: nRows }, (_, i) => i);
    // Read geometry from fileIndex.metadata.imaging (coordinate_base, pixel counts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgMeta = (activeZipStorage?.fileIndex?.metadata?.imaging ?? {}) as any;
    const geometry = imgMeta ? {
      pixelCount: (imgMeta.pixel_count_x && imgMeta.pixel_count_y)
        ? { x: imgMeta.pixel_count_x as number, y: imgMeta.pixel_count_y as number }
        : null,
      pixelSizeUm: null,
      coordinateBase: (imgMeta.coordinate_base as number) ?? 1,
      geometrySource: "discovery-block" as const,
    } : null;
    const grid = buildImagingGrid(coords, spectrumIndices, geometry, "promoted-columns");
    if (!grid) { dt("buildImagingGrid returned null"); return null; }
    dt(`grid ${grid.width}x${grid.height} — building TIC...`);

    const base = grid.coordinateBase ?? 1;
    const tic = new Float32Array(grid.width * grid.height);
    for (let i = 0; i < nRows; i++) {
      const x0 = xArr[i] - base, y0 = yArr[i] - base;
      const key = y0 * grid.width + x0;
      if (key >= 0 && key < tic.length) tic[key] = ticArr[i];
    }

    const stats: FileStats = {
      numSpectra: nRows, numEntities: nRows,
      mzRange: Number.isFinite(globalMinMz) ? [globalMinMz, globalMaxMz] : null,
      msLevels: [1],
      representationCounts: { profile: 0, centroid: nRows },
    };

    activeGrid = grid;
    activeStats = stats;  // set so fast render path has access to representationCounts
    dt(`DONE ✓ grid=${grid.width}x${grid.height} tic.length=${tic.length} mzRange=[${globalMinMz.toFixed(1)},${globalMaxMz.toFixed(1)}]`);
    return { grid, stats, tic };
  } catch (e) {
    const errMsg = e instanceof Error ? `${e.name}: ${e.message}
${(e as Error).stack?.split("\n").slice(0,3).join(" | ")}` : String(e);
    console.error("[BGF] EXCEPTION:", errMsg);
    send({ type: "error", class: "corrupt", message: `[buildGridFast] ${errMsg}` });
    return null;
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
// Fast XIC — compute ion image directly from spectra_data.parquet
// ---------------------------------------------------------------------------

/**
 * Compute an XIC ion image from spectra_data.parquet WITHOUT reading the
 * 553 MB spectra_metadata.parquet or initializing the full MzPeakReader.
 *
 * spectra_data.parquet is only 208 KB compressed (39 row groups, ~5 KB each).
 * Each row: point.spectrum_index, point.mz, point.intensity.
 *
 * Algorithm:
 *   For each row group (processed one at a time, ~20 MB uncompressed):
 *     - Filter rows where mzStart ≤ mz ≤ mzEnd
 *     - Accumulate intensity per spectrum_index into a Float32Array
 *   Map spectrum_index → grid cell via activeGrid.coordToSpectrumIndex
 *   Return the ion image Float32Array.
 *
 * Total data read: 208 KB (vs 553 MB for full reader init). ~10-30× faster.
 */
async function computeIonImageFast(
  mzStart: number,
  mzEnd: number,
): Promise<Float32Array | null> {
  if (!activeZipStorage || !activeGrid) return null;

  // spectrumData() returns ParquetFile not RemoteBlob; use open() for the RemoteBlob
  const dataEntry2 = activeZipStorage.fileIndex.files.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => f.entityType === "spectrum" && f.dataKind === "data arrays",
  );
  if (!dataEntry2) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataBlob = await activeZipStorage.open((dataEntry2 as any).name);
  if (!dataBlob) return null;

  const pf = await ParquetFile.fromFile(dataBlob as unknown as Blob);
  const nRG = pf.metadata().numRowGroups();

  // Accumulate intensity sums per spectrum_index across all row groups.
  // Use a Map for sparse accumulation (most spectra may have 0 signal in range).
  const intensitySum = new Map<number, number>();

  for (let rg = 0; rg < nRG; rg++) {
    const rawTable = await pf.read({ rowGroups: [rg] });
    const table = tableFromIPC(rawTable.intoIPCStream());

    // Column-based extraction — 75x faster than row.get(r) for 1M-row tables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pointCol: any = table.getChild("point");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siVec: any = pointCol?.getChild("spectrum_index");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mzVec: any = pointCol?.getChild("mz");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intensVec: any = pointCol?.getChild("intensity");

    if (!siVec || !mzVec || !intensVec) continue; // skip malformed row groups

    const nRows = table.numRows;
    for (let r = 0; r < nRows; r++) {
      const mz = Number(mzVec.get(r));
      if (mz < mzStart || mz > mzEnd) continue;
      const si = Number(siVec.get(r));
      const inten = Number(intensVec.get(r));
      intensitySum.set(si, (intensitySum.get(si) ?? 0) + inten);
    }
  }

  // coordToSpectrumIndex maps gridKey → spectrumIndex.
  // We have intensitySum keyed by spectrumIndex → map into grid image.
  const img = new Float32Array(activeGrid.width * activeGrid.height);
  for (const [gridKey, spectrumIdx] of activeGrid.coordToSpectrumIndex) {
    const val = intensitySum.get(spectrumIdx) ?? 0;
    if (gridKey >= 0 && gridKey < img.length) img[gridKey] = val;
  }

  return img;
}

/**
 * Multi-channel ion images in a SINGLE pass over spectra_data.parquet.
 *
 * computeIonImageFast reads the whole file once per channel; doing that 3× for an
 * RGB overlay triples the (large, possibly network) read and made the overlay
 * appear to hang. This reads each row group ONCE and accumulates every channel's
 * windowed intensity together. Returns one image per input window, position-
 * aligned with `windows` (null in → null out), so an empty channel maps to null.
 */
async function computeMultiIonImagesFast(
  windows: ({ start: number; end: number } | null)[],
): Promise<(Float32Array | null)[]> {
  const nullResult = () => windows.map(() => null);
  if (!activeZipStorage || !activeGrid) return nullResult();

  const dataEntry = activeZipStorage.fileIndex.files.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any) => f.entityType === "spectrum" && f.dataKind === "data arrays",
  );
  if (!dataEntry) return nullResult();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataBlob = await activeZipStorage.open((dataEntry as any).name);
  if (!dataBlob) return nullResult();

  const pf = await ParquetFile.fromFile(dataBlob as unknown as Blob);
  const nRG = pf.metadata().numRowGroups();

  // One sparse accumulator per non-null window.
  const sums = windows.map((w) => (w ? new Map<number, number>() : null));

  for (let rg = 0; rg < nRG; rg++) {
    const rawTable = await pf.read({ rowGroups: [rg] });
    const table = tableFromIPC(rawTable.intoIPCStream());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pointCol: any = table.getChild("point");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siVec: any = pointCol?.getChild("spectrum_index");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mzVec: any = pointCol?.getChild("mz");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intensVec: any = pointCol?.getChild("intensity");
    if (!siVec || !mzVec || !intensVec) continue;

    const nRows = table.numRows;
    for (let r = 0; r < nRows; r++) {
      const mz = Number(mzVec.get(r));
      let si = -1;
      let inten = 0;
      for (let c = 0; c < windows.length; c++) {
        const w = windows[c];
        if (!w || mz < w.start || mz > w.end) continue;
        if (si < 0) {
          si = Number(siVec.get(r)); // resolve once, only if a window matched
          inten = Number(intensVec.get(r));
        }
        const m = sums[c]!;
        m.set(si, (m.get(si) ?? 0) + inten);
      }
    }
  }

  const grid = activeGrid;
  return windows.map((w, c) => {
    const m = sums[c];
    if (!w || !m) return null;
    const img = new Float32Array(grid.width * grid.height);
    for (const [gridKey, spectrumIdx] of grid.coordToSpectrumIndex) {
      const v = m.get(spectrumIdx) ?? 0;
      if (gridKey >= 0 && gridKey < img.length) img[gridKey] = v;
    }
    return img;
  });
}

// ---------------------------------------------------------------------------
// Fast spectrum read — row-group skipping in spectra_data.parquet
// ---------------------------------------------------------------------------

/**
 * Read one spectrum directly from spectra_data.parquet using Parquet
 * row-group min/max statistics to skip irrelevant row groups.
 *
 * spectra_data.parquet has 39 row groups, each covering ~900 spectra with
 * spectrum_index min/max statistics. To read spectrum N:
 *   1. Read Parquet footer (~few KB range request) — get row group stats
 *   2. Find the row group where min ≤ N ≤ max  — O(39) linear search
 *   3. Read only that row group  (~12 MB) — 39× less than full file read
 *   4. Filter rows for spectrum_index == N, extract mz + intensity
 *
 * This is used when activeReader is null (before the full 553 MB metadata
 * read has been triggered) so pixel clicks are responsive from the start.
 */
async function readFastSpectrum(index: number): Promise<boolean> {
  if (!activeZipStorage) return false;
  const T0 = Date.now();
  const rlog = (msg: string) => console.log(`[RFS idx=${index} +${Date.now()-T0}ms] ${msg}`);
  rlog("start");
  try {
    // spectrumData() returns ParquetFile (wrong type for fromFile).
    // Use open() to get the actual RemoteBlob, same approach as buildGridFast.
    const dataEntry = activeZipStorage.fileIndex.files.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.entityType === "spectrum" && f.dataKind === "data arrays",
    );
    if (!dataEntry) { rlog("NO dataEntry in fileIndex"); return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rlog(`dataEntry=${(dataEntry as any).name}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataBlob = await activeZipStorage.open((dataEntry as any).name);
    if (!dataBlob) { rlog("open() returned null"); return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rlog(`blob size=${(dataBlob as any).size}`);

    const pf = await ParquetFile.fromFile(dataBlob as unknown as Blob);
    const meta = pf.metadata();
    const nRG = meta.numRowGroups();
    rlog(`fromFile ok, nRG=${nRG}`);

    // Find row group containing this spectrum_index via min/max statistics.
    // statistics() returns `any` from parquet-wasm — access properties safely.
    let targetRG = -1;
    for (let rg = 0; rg < nRG; rg++) {
      const rgMeta = meta.rowGroup(rg);
      for (let col = 0; col < rgMeta.numColumns(); col++) {
        const colMeta = rgMeta.column(col);
        if (!colMeta.columnPath().join(".").includes("spectrum_index")) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats = colMeta.statistics() as any;
        if (!stats) {
          // No stats — fall back to linear scan: assume ~893 spectra per row group
          targetRG = Math.min(Math.floor(index / 900), nRG - 1);
          rlog(`RG${rg}: no stats, fallback targetRG=${targetRG}`);
          break;
        }
        const minVal = Number(stats.minValue ?? stats.min_value ?? -Infinity);
        const maxVal = Number(stats.maxValue ?? stats.max_value ?? Infinity);
        rlog(`RG${rg}: si_min=${minVal} si_max=${maxVal} → ${index >= minVal && index <= maxVal ? "MATCH" : "skip"}`);
        if (index >= minVal && index <= maxVal) targetRG = rg;
        break;
      }
      if (targetRG >= 0) break;
    }

    if (targetRG < 0) {
      // Final fallback: try the last row group
      targetRG = nRG - 1;
      rlog(`no RG matched, fallback to last RG=${targetRG}`);
    }
    rlog(`targetRG=${targetRG}`);

    // Read only the target row group.
    const rawTable = await pf.read({ rowGroups: [targetRG] });
    rlog(`pf.read done`);
    const table = tableFromIPC(rawTable.intoIPCStream());
    rlog(`Arrow table: ${table.numRows} rows`);

    // Column-based extraction — 75x faster than row.get(r) for 1M-row tables.
    // Arrow struct column → child columns accessed as typed vectors.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pointCol: any = table.getChild("point");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siVec: any = pointCol?.getChild("spectrum_index");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mzVec: any = pointCol?.getChild("mz");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intensVec: any = pointCol?.getChild("intensity");

    if (!siVec || !mzVec || !intensVec) {
      // Column structure doesn't match — fall through to slow row iteration as fallback
      rlog(`missing columns: si=${!!siVec} mz=${!!mzVec} inten=${!!intensVec}`);
      rlog(`table schema: ${JSON.stringify(table.schema?.fields?.map((f: any) => f.name))}`);
      return false;
    }

    const n = table.numRows;
    const mzValues: number[] = [];
    const intensityValues: number[] = [];

    for (let r = 0; r < n; r++) {
      // spectrum_index is Uint64 in Arrow (INT64 Parquet) → Number() safe for < 2^53
      const si = Number(siVec.get(r));
      if (si !== index) continue;
      mzValues.push(Number(mzVec.get(r)));
      intensityValues.push(Number(intensVec.get(r)));
    }

    rlog(`found ${mzValues.length} peaks`);
    if (mzValues.length === 0) {
      rlog(`first row si=${Number(siVec.get(0))} mz=${Number(mzVec.get(0))}`);
      return false;
    }

    const mzArr = new Float64Array(mzValues);
    const intArr = new Float32Array(intensityValues);

    const spectrum = {
      index,
      id: `scan=${index + 1}`,
      mz: mzArr,
      intensity: intArr,
    };

    sendTransfer(
      { type: "spectrumResult", spectrum },
      [mzArr.buffer, intArr.buffer],
    );
    rlog(`spectrumResult sent ✓`);
    return true;
  } catch (e) {
    console.warn("[mzPeakWorker] readFastSpectrum FAILED:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mean spectrum helpers — BL-03 and BL-06
// ---------------------------------------------------------------------------

/**
 * Import SpectrumArrays type locally (already in scope via reader/types import path).
 * We read spectra_data.parquet row groups and average across a sample of spectra.
 *
 * Strategy:
 *  - Open spectra_data.parquet (the same 208 KB file used by XIC and fast-spectrum).
 *  - Walk ALL row groups, collecting mz/intensity pairs into a per-bin map.
 *  - Use the first spectrum's mz values as a reference grid (centroid data only).
 *  - For each subsequent spectrum, bin each (mz, intensity) pair into the closest
 *    reference mz bin (within ±0.5 Da).
 *  - Return the mean intensity per bin across all sampled spectra.
 *
 * To keep this fast (no full 553 MB metadata read), we sample uniformly from the
 * spectra present in spectra_data.parquet (up to MAX_SAMPLES).
 */
async function computeMeanSpectrum(): Promise<{ index: number; id: string; mz: Float64Array; intensity: Float32Array } | null> {
  if (!activeZipStorage || !activeGrid) return null;
  return _computeMeanSpectrumFrom(null);
}

/**
 * Compute the mean spectrum for a specified subset of spectrum indices (BL-06).
 * Caps at 100 indices for performance; sorted to minimize row-group jumps.
 */
async function computeRoiMeanSpectrum(
  indices: number[],
): Promise<{ index: number; id: string; mz: Float64Array; intensity: Float32Array } | null> {
  if (!activeZipStorage) return null;
  const capped = indices.slice(0, 100).sort((a, b) => a - b);
  return _computeMeanSpectrumFrom(new Set(capped));
}

/**
 * Shared implementation: if `filterSet` is null → average all spectra (sampled);
 * if `filterSet` is a Set → average only those spectrum indices.
 */
async function _computeMeanSpectrumFrom(
  filterSet: Set<number> | null,
): Promise<{ index: number; id: string; mz: Float64Array; intensity: Float32Array } | null> {
  const MAX_SAMPLES = 300;
  try {
    const dataEntry = activeZipStorage!.fileIndex.files.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.entityType === "spectrum" && f.dataKind === "data arrays",
    );
    if (!dataEntry) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataBlob = await activeZipStorage!.open((dataEntry as any).name);
    if (!dataBlob) return null;

    const pf = await ParquetFile.fromFile(dataBlob as unknown as Blob);
    const meta = pf.metadata();
    const nRG = meta.numRowGroups();

    // For an ROI (filterSet), the selected spectrum indices span a bounded range;
    // skip row groups whose spectrum_index min/max lies entirely outside it so we
    // don't read the whole file (big win over the network).
    let fMin = Infinity;
    let fMax = -Infinity;
    if (filterSet) {
      for (const v of filterSet) {
        if (v < fMin) fMin = v;
        if (v > fMax) fMax = v;
      }
    }
    const rgInRange = (rg: number): boolean => {
      if (!filterSet) return true;
      try {
        const rgMeta = meta.rowGroup(rg);
        for (let col = 0; col < rgMeta.numColumns(); col++) {
          const cm = rgMeta.column(col);
          if (!cm.columnPath().join(".").includes("spectrum_index")) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const st = cm.statistics() as any;
          if (!st) return true; // no stats → cannot skip safely
          const mn = Number(st.minValue ?? st.min_value ?? -Infinity);
          const mx = Number(st.maxValue ?? st.max_value ?? Infinity);
          return mx >= fMin && mn <= fMax; // overlaps the ROI index range?
        }
      } catch {
        /* fall through → read it */
      }
      return true;
    };

    // Accumulate: mzBins (reference axis built from first spectrum seen),
    // intensitySum (sum per bin), countPerBin (number of spectra contributing).
    let refMz: Float64Array | null = null;
    const intensitySum: Map<number, number> = new Map(); // binIdx → sum
    const countPerBin: Map<number, number> = new Map();  // binIdx → count
    let sampledSpectra = 0;

    // Determine which spectrum_indices to include when filterSet is non-null.
    // For the global mean (filterSet === null), we'll subsample uniformly below.
    const filterArray = filterSet ? Array.from(filterSet).sort((a, b) => a - b) : null;

    for (let rg = 0; rg < nRG; rg++) {
      if (!rgInRange(rg)) continue; // ROI: skip row groups outside the index range
      const rawTable = await pf.read({ rowGroups: [rg] });
      const table = tableFromIPC(rawTable.intoIPCStream());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pointCol: any = table.getChild("point");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siVec: any = pointCol?.getChild("spectrum_index");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mzVec: any = pointCol?.getChild("mz");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intensVec: any = pointCol?.getChild("intensity");

      if (!siVec || !mzVec || !intensVec) continue;

      const nRows = table.numRows;

      // Group rows by spectrum_index within this row group.
      const spectrumRows = new Map<number, { mzs: number[]; ins: number[] }>();
      for (let r = 0; r < nRows; r++) {
        const si = Number(siVec.get(r));
        // Filter check.
        if (filterArray !== null) {
          // Only include if in the filter set.
          if (!filterSet!.has(si)) continue;
        }
        if (!spectrumRows.has(si)) spectrumRows.set(si, { mzs: [], ins: [] });
        const entry = spectrumRows.get(si)!;
        entry.mzs.push(Number(mzVec.get(r)));
        entry.ins.push(Number(intensVec.get(r)));
      }

      // For global mean: subsample spectrum indices uniformly.
      let siList = Array.from(spectrumRows.keys());
      if (filterArray === null && siList.length > 0) {
        const remaining = MAX_SAMPLES - sampledSpectra;
        if (remaining <= 0) break;
        if (siList.length > remaining) {
          // Take evenly spaced subset.
          const step = siList.length / remaining;
          siList = Array.from({ length: remaining }, (_, i) => siList[Math.floor(i * step)]);
        }
      }

      for (const si of siList) {
        const entry = spectrumRows.get(si);
        if (!entry) continue;
        const { mzs, ins } = entry;
        if (mzs.length === 0) continue;

        // Build reference mz axis from the first spectrum encountered.
        if (refMz === null) {
          const sorted = mzs.map((m, i) => ({ m, v: ins[i] })).sort((a, b) => a.m - b.m);
          refMz = new Float64Array(sorted.map((s) => s.m));
          for (let bi = 0; bi < refMz.length; bi++) {
            intensitySum.set(bi, sorted[bi].v);
            countPerBin.set(bi, 1);
          }
          sampledSpectra++;
          continue;
        }

        // Bin each (mz, intensity) pair into the closest reference bin (±0.5 Da).
        for (let j = 0; j < mzs.length; j++) {
          const mzVal = mzs[j];
          const intVal = ins[j];
          // Binary search for the closest reference mz.
          let lo = 0;
          let hi = refMz.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (refMz[mid] < mzVal) lo = mid + 1;
            else hi = mid;
          }
          // lo is the first index with refMz[lo] >= mzVal; check lo-1 too.
          const bestIdx =
            lo > 0 && Math.abs(refMz[lo - 1] - mzVal) < Math.abs(refMz[lo] - mzVal)
              ? lo - 1
              : lo;
          if (Math.abs(refMz[bestIdx] - mzVal) <= 0.5) {
            intensitySum.set(bestIdx, (intensitySum.get(bestIdx) ?? 0) + intVal);
            countPerBin.set(bestIdx, (countPerBin.get(bestIdx) ?? 0) + 1);
          }
        }
        sampledSpectra++;
        if (filterArray === null && sampledSpectra >= MAX_SAMPLES) break;
      }
      if (filterArray === null && sampledSpectra >= MAX_SAMPLES) break;
    }

    if (refMz === null || sampledSpectra === 0) return null;

    // Build output: mean intensity per reference mz bin.
    const outIntensity = new Float32Array(refMz.length);
    for (let bi = 0; bi < refMz.length; bi++) {
      const cnt = countPerBin.get(bi) ?? 0;
      outIntensity[bi] = cnt > 0 ? (intensitySum.get(bi) ?? 0) / cnt : 0;
    }

    return {
      index: -1,
      id: filterSet ? `roi-mean(${filterSet.size})` : "mean",
      mz: refMz,
      intensity: outIntensity,
    };
  } catch (e) {
    console.warn("[mzPeakWorker] _computeMeanSpectrumFrom FAILED:", e);
    return null;
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
        const { mz, tolDa, requestId } = msg;
        if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
        if (mz - tolDa < 0) return;

        const mzStart = mz - tolDa;
        const mzEnd = mz + tolDa;

        // FAST PATH: fetch only 5 column chunks (~650 KB) via targeted range requests,
        // decode with parquet-wasm, build grid + TIC from the decoded data.
        // No 553 MB download — only the needed leaf column bytes are fetched.
        if (!activeGrid) {
          const result = await buildGridFast();
          if (result) {
            const manifest = activeZipStorage ? manifestFromStore(activeZipStorage) : [];
            const tic: Float32Array | null = result.tic ?? null;
            const transferList: Transferable[] = [];
            if (tic) transferList.push(tic.buffer);
            // Send grid + TIC + stats — Image Info and TIC canvas populate immediately.
            sendTransfer({
              type: "loadResult",
              result: {
                manifest,
                fileMeta: null,
                stats: result.stats,
                capabilities: { isImaging: true, layout: "point" as const, encodings: [], unsupported: [] },
                grid: result.grid,
                tic,
                mixedRepresentationWarning: null,
              },
            }, transferList);
          }
        }

        if (activeGrid && !activeReader) {
          const ionImage = await computeIonImageFast(mzStart, mzEnd);
          const ionImageStats = ionImage ? computeIonImageStats(ionImage, activeGrid) : null;
          const transferList: Transferable[] = [];
          if (ionImage) transferList.push(ionImage.buffer);
          sendTransfer({ type: "renderResult", ionImage, stats: ionImageStats, requestId }, transferList);
          // TIC is already sent via buildGridFast's loadResult — no recompute needed.
          break;
        }

        // FALLBACK: full reader (553 MB) — only if fast path unavailable.
        if (!activeReader) {
          const ok = await initReaderAndGrid();
          if (!ok) return;
        }

        if (!activeReader || !activeGrid || !activeStats) return;

        const { profile, centroid } = activeStats.representationCounts;
        const useProfile = profile >= centroid;
        const mzRange = { start: mzStart, end: mzEnd };
        const xic = await activeReader.extractXIC(null, mzRange, useProfile);
        const ionImage = xic ? buildIonImage(xic, activeGrid) : null;
        const ionImageStats = ionImage ? computeIonImageStats(ionImage, activeGrid) : null;

        const transferList: Transferable[] = [];
        if (ionImage) transferList.push(ionImage.buffer);
        sendTransfer({ type: "renderResult", ionImage, stats: ionImageStats, requestId }, transferList);
        break;
      }

      case "selectSpectrum": {
        if (!activeReader) {
          // Fast path: read from spectra_data.parquet using row-group skipping.
          // ~12 MB per spectrum vs 553 MB for full reader init. Works immediately
          // after the fast overview builds the grid.
          const ok = await readFastSpectrum(msg.index);
          if (ok) break; // spectrum sent — skip full reader init for now
          // Fast path failed — fall through to full reader init (slow but reliable)
          if (activeZipStorage) {
            try {
              const reader = await openReaderFromStore(activeZipStorage);
              activeReader = reader;
              activeStats = computeStats(reader, readManifest(reader));
            } catch (err) {
              postError(err);
              return;
            }
          }
        }
        await runSelectSpectrum(msg.index);
        break;
      }

      case "renderMultiChannel": {
        const { channels, requestId } = msg;
        // SINGLE pass over the file for all channels (was 3× full reads → slow).
        // Position-aligned with the (possibly null-containing) channels array.
        const windows = channels.map((ch) =>
          ch ? { start: ch.mz - ch.tolDa, end: ch.mz + ch.tolDa } : null,
        );
        const results = await computeMultiIonImagesFast(windows);
        const transferList: Transferable[] = results.flatMap((r) =>
          r ? [r.buffer] : [],
        );
        sendTransfer(
          { type: "multiChannelResult", channels: results, requestId },
          transferList,
        );
        break;
      }

      case "meanSpectrum": {
        const result = await computeMeanSpectrum();
        if (result) {
          sendTransfer(
            { type: "meanSpectrumResult", spectrum: result },
            [result.mz.buffer, result.intensity.buffer],
          );
        }
        break;
      }

      case "roiSpectrum": {
        const { spectrumIndices } = msg;
        const result = await computeRoiMeanSpectrum(spectrumIndices);
        if (result) {
          sendTransfer(
            { type: "meanSpectrumResult", spectrum: result },
            [result.mz.buffer, result.intensity.buffer],
          );
        }
        break;
      }

      case "getOpticalImage": {
        // ADD-01: read the optical TIFF ZIP member by name, decode to RGBA, and
        // transfer the pixel buffer back. Optical images are auxiliary — a missing
        // member or undecodable blob is a soft error, never fatal to the load.
        const { archivePath } = msg;
        try {
          const store = activeZipStorage;
          if (!store) throw new Error("no archive open");
          // zip.js Entry is FileEntry | DirectoryEntry; only file entries have
          // getData. Narrow to a file entry exposing getData(writer).
          const entry = store.entries.find((e) => e.filename === archivePath) as
            | { directory?: boolean; getData?: (w: unknown) => Promise<Uint8Array> }
            | undefined;
          if (!entry || entry.directory || typeof entry.getData !== "function")
            throw new Error(`ZIP member not found: ${archivePath}`);
          const bytes: Uint8Array = await entry.getData(new Uint8ArrayWriter());
          const decoded = decodeTiff(bytes);
          sendTransfer(
            {
              type: "opticalImageResult",
              archivePath,
              width: decoded.width,
              height: decoded.height,
              rgba: decoded.rgba,
            },
            [decoded.rgba.buffer],
          );
        } catch (err) {
          send({
            type: "opticalImageError",
            archivePath,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }
    }
  } catch (err) {
    postError(err);
  }
};

// Ready handshake. With vite-plugin-top-level-await, this module's top-level code
// (including the `self.onmessage = …` assignment above) runs INSIDE an async
// wrapper that first awaits the WASM top-level-await imports. A load message
// posted by the main thread before that wrapper resolves arrives before
// `onmessage` is registered and is dropped — a race that deterministically hangs
// fast programmatic loads (e.g. setInputFiles immediately after page open). By
// posting `ready` here — AFTER onmessage is registered — the main thread can
// buffer load requests until the worker is provably listening. (See store.ts.)
send({ type: "ready" });
