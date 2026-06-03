import { create } from "zustand";

import { openUrl as readerOpenUrl, type Reader } from "../reader/openUrl";
import {
  fileMeta as readFileMeta,
  manifest as readManifest,
  fileStats as readFileStats,
} from "../reader/fileMeta";
import { getSpectrumArrays } from "../reader/arrays";
import type {
  Capabilities,
  FileMeta,
  FileStats,
  LoadStage,
  ManifestEntry,
  SpectrumArrays,
} from "../reader/types";

// Small await so the staged-progress transitions are observable in the UI rather
// than collapsing into a single synchronous frame (LOAD-03). Coarse staging here;
// refined in plan 01-02.
const yieldFrame = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

type State = {
  reader: Reader | null;
  fileMeta: FileMeta | null;
  manifest: ManifestEntry[];
  stats: FileStats | null;
  // Declared in the 01-01 reader interface; populated by 01-02 (layout/encodings/
  // imaging-detected) and 01-03 (unsupported findings). Null until then.
  capabilities: Capabilities | null;
  stage: LoadStage;
  error: string | null;
  selectedIndex: number | null;
  selectedSpectrum: SpectrumArrays | null;
};

type Actions = {
  openUrl: (url: string) => Promise<void>;
  selectSpectrum: (index: number) => Promise<void>;
};

const initialState: State = {
  reader: null,
  fileMeta: null,
  manifest: [],
  stats: null,
  capabilities: null,
  stage: "idle",
  error: null,
  selectedIndex: null,
  selectedSpectrum: null,
};

export const useStore = create<State & Actions>((set, get) => ({
  ...initialState,

  async openUrl(url: string) {
    // Reset to a clean load.
    set({ ...initialState, stage: "zip-index" });
    try {
      await yieldFrame();
      // ZIP index + manifest are read eagerly inside fromUrl(); we surface the
      // coarse stages around it so there is never a silent long pause.
      const reader = await readerOpenUrl(url);

      set({ stage: "manifest" });
      await yieldFrame();
      const manifest = readManifest(reader);

      set({ stage: "metadata" });
      await yieldFrame();
      const fileMeta = readFileMeta(reader);
      const stats = readFileStats(reader);

      set({
        reader,
        manifest,
        fileMeta,
        stats,
        stage: "ready",
        error: null,
        selectedIndex: null,
        selectedSpectrum: null,
      });

      // Auto-select the first spectrum so the happy path is one click.
      if (stats.numSpectra > 0) {
        await get().selectSpectrum(0);
      }
    } catch (err) {
      set({
        stage: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async selectSpectrum(index: number) {
    const reader = get().reader;
    if (!reader) return;
    try {
      const selectedSpectrum = await getSpectrumArrays(reader, index);
      set({ selectedIndex: index, selectedSpectrum });
    } catch (err) {
      set({
        stage: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
