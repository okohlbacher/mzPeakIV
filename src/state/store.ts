import { create } from "zustand";

import { openUrl as readerOpenUrl, type Reader } from "../reader/openUrl";
import { openFile as readerOpenFile } from "../reader/openFile";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
  spectrumMeta,
} from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
// selectSpectrum routes by representation via getSpectrumArraysFor; the legacy
// try-order getSpectrumArrays export remains available for non-imaging callers.
import { getSpectrumArraysFor } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
import { buildTic } from "../compute/tic";
import type { ImagingGrid } from "../imaging/types";
import { UnsupportedEncodingError } from "../reader/errors";
import type { ReaderErrorClass } from "../reader/errors";
import type {
  Capabilities,
  FileMeta,
  FileStats,
  LoadStage,
  ManifestEntry,
  SpectrumArrays,
  UnsupportedFinding,
} from "../reader/types";

/** Structured store error (R-03b). */
export type StoreError = {
  class: ReaderErrorClass;
  message: string;
  findings?: UnsupportedFinding[];
};

// Small await so the staged-progress transitions are observable in the UI rather
// than collapsing into a single synchronous frame (LOAD-03).
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Classify a caught error into a structured StoreError (R-03b).
 * UnsupportedEncodingError → class: 'unsupported-encoding' with findings.
 * Anything else            → class: 'corrupt'.
 */
function classifyError(err: unknown): StoreError {
  if (err instanceof UnsupportedEncodingError) {
    return {
      class: "unsupported-encoding",
      message: err.message,
      findings: err.findings,
    };
  }
  return {
    class: "corrupt",
    message: err instanceof Error ? err.message : String(err),
  };
}

type State = {
  reader: Reader | null;
  fileMeta: FileMeta | null;
  manifest: ManifestEntry[];
  stats: FileStats | null;
  capabilities: Capabilities | null;
  grid: ImagingGrid | null;
  /** TIC raster (length width*height) for the imaging grid; null when non-imaging or uncomputable (D-02). */
  tic: Float32Array | null;
  /** D-08 named warning: set only when a file mixes profile + centroid spectra. */
  mixedRepresentationWarning: string | null;
  stage: LoadStage;
  error: StoreError | null;
  selectedIndex: number | null;
  selectedSpectrum: SpectrumArrays | null;
};

type Actions = {
  openUrl: (url: string) => Promise<void>;
  openFile: (file: File) => Promise<void>;
  selectSpectrum: (index: number) => Promise<void>;
};

const initialState: State = {
  reader: null,
  fileMeta: null,
  manifest: [],
  stats: null,
  capabilities: null,
  grid: null,
  tic: null,
  mixedRepresentationWarning: null,
  stage: "idle",
  error: null,
  selectedIndex: null,
  selectedSpectrum: null,
};

/** Shared load logic — runs the staged transitions after a reader is obtained. */
async function runLoad(
  reader: Reader,
  set: (partial: Partial<State & Actions>) => void,
  get: () => State & Actions,
) {
  set({ stage: "manifest" });
  await yieldFrame();
  const manifest = readManifest(reader);

  set({ stage: "metadata" });
  await yieldFrame();
  const fileMeta = readFileMeta(reader);
  const stats = computeStats(reader, manifest);
  const capabilities = computeCapabilities(reader, manifest);

  // Eager 'grid' stage (D-05): reconstruct the imaging pixel grid only when this
  // is an imaging file. A non-imaging file leaves grid: null and proceeds to
  // ready with NO error (D-06) — non-imaging is a valid, expected outcome.
  set({ stage: "grid" });
  await yieldFrame();
  let grid: ImagingGrid | null = null;
  if (capabilities.isImaging) {
    const cr = extractCoords(reader);
    const geometry = readGridGeometry(reader);
    grid = cr
      ? buildImagingGrid(cr.coords, cr.spectrumIndices, geometry, cr.strategy)
      : null;
    // Surface a named error when an imaging file's grid could not be built —
    // a silent grid:null on an imaging file is a failure, not a valid state (D-06
    // only applies to non-imaging files). The error is 'corrupt' class (best fit
    // until a dedicated 'grid-build-failed' class is added in Phase 5).
    if (grid === null) {
      set({
        reader,
        manifest,
        fileMeta,
        stats,
        capabilities,
        grid: null,
        stage: "error",
        error: {
          class: "corrupt",
          message:
            "Imaging file detected but spatial pixel grid could not be reconstructed. " +
            "The coordinate columns may be empty or malformed.",
        },
        selectedIndex: null,
        selectedSpectrum: null,
      });
      return;
    }
  }

  // Eager 'tic' stage (D-02): compute the TIC raster the moment the grid exists,
  // via the SAME extractXIC(null, null, useProfile) primitive Phase 4 will reuse
  // for m/z-windowed ion images. Only runs for imaging files (grid !== null) —
  // a non-imaging file skips TIC entirely → tic: null, no error (D-06).
  let tic: Float32Array | null = null;
  let mixedRepresentationWarning: string | null = null;
  if (grid) {
    set({ stage: "tic" });
    await yieldFrame();

    // D-08 source selection: majority-source rule. Use profile when profile
    // spectra are at least as numerous as centroid (profile is the spec's
    // primary and the tiebreaker when counts are equal). A minority of profile
    // spectra (e.g. 1 profile + 999 centroid) correctly routes to centroid.
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
      // A null XIC is NOT an error (D-06): it yields tic: null, which the UI
      // renders as "Could not compute TIC for this file" — not an ErrorBanner.
      tic = xic ? buildTic(xic, grid) : null;
    } catch (err) {
      // A genuine throw during TIC compute IS an error — route it loudly rather
      // than crashing the whole load silently.
      set({ stage: "error", error: classifyError(err) });
      return;
    }
  }

  set({
    reader,
    manifest,
    fileMeta,
    stats,
    capabilities,
    grid,
    tic,
    mixedRepresentationWarning,
    stage: "ready",
    error: null,
    selectedIndex: null,
    selectedSpectrum: null,
  });

  // Auto-select the first spectrum so the happy path is one click.
  if (stats.numSpectra > 0) {
    await get().selectSpectrum(0);
  }
}

export const useStore = create<State & Actions>((set, get) => ({
  ...initialState,

  async openUrl(url: string) {
    set({ ...initialState, stage: "zip-index" });
    try {
      await yieldFrame();
      const reader = await readerOpenUrl(url);
      await runLoad(reader, set, get);
    } catch (err) {
      set({ stage: "error", error: classifyError(err) });
    }
  },

  async openFile(file: File) {
    set({ ...initialState, stage: "zip-index" });
    try {
      await yieldFrame();
      const reader = await readerOpenFile(file);
      await runLoad(reader, set, get);
    } catch (err) {
      set({ stage: "error", error: classifyError(err) });
    }
  },

  async selectSpectrum(index: number) {
    const reader = get().reader;
    if (!reader) return;
    try {
      // Route the read by MS:1000525 representation (DATA-03): one action serves
      // both the numeric index input and (plan 03-03) the pixel-click.
      const meta = spectrumMeta(reader, index);
      const selectedSpectrum = await getSpectrumArraysFor(
        reader,
        index,
        meta.representation,
      );
      set({ selectedIndex: index, selectedSpectrum });
    } catch (err) {
      set({ stage: "error", error: classifyError(err) });
    }
  },
}));
