import { create } from "zustand";

import { openUrl as readerOpenUrl, type Reader } from "../reader/openUrl";
import { openFile as readerOpenFile } from "../reader/openFile";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
} from "../reader/fileMeta";
import { computeStats, computeCapabilities } from "../reader/stats";
import { getSpectrumArrays } from "../reader/arrays";
import { extractCoords, readGridGeometry } from "../reader/scanCoords";
import { buildImagingGrid } from "../imaging/grid";
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
  }

  set({
    reader,
    manifest,
    fileMeta,
    stats,
    capabilities,
    grid,
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
      const selectedSpectrum = await getSpectrumArrays(reader, index);
      set({ selectedIndex: index, selectedSpectrum });
    } catch (err) {
      set({ stage: "error", error: classifyError(err) });
    }
  },
}));
