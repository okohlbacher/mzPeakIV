import { create } from "zustand";

import { type Colormap } from "../ui/rasterize";
import type { ImagingGrid } from "../imaging/types";
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
import type {
  WorkerRequest,
  WorkerResponse,
  LoadResult,
  NonImagingResult,
} from "../worker/protocol";

/** Structured store error (R-03b). */
export type StoreError = {
  class: ReaderErrorClass;
  message: string;
  findings?: UnsupportedFinding[];
};

type State = {
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
  // Phase 4 additions — ion image, colormap, and scale state (IMAGE-02/IMAGE-03).
  mzWindow: { mz: number; tolDa: number } | null;
  ionImage: Float32Array | null;
  ionImageStats: { nonzeroCount: number; min: number; max: number } | null;
  colormap: Colormap;
  scale: "linear" | "log";
  percentile: number;
  /** Phase 5: true while a Worker renderIonImage request is in flight (D-02/D-03). */
  isRendering: boolean;
};

type Actions = {
  openUrl: (url: string) => void;
  openFile: (file: File) => Promise<void>;
  selectSpectrum: (index: number) => void;
  // Phase 4 actions (IMAGE-02/IMAGE-03).
  renderIonImage: (mz: number, tolDa: number) => void;
  setColormapSettings: (colormap: Colormap, scale: "linear" | "log", percentile: number) => void;
};

const initialState: State = {
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
  // Phase 4 defaults (D-08: Viridis default, D-10: linear default, D-09: 99th pct default).
  mzWindow: null,
  ionImage: null,
  ionImageStats: null,
  colormap: "viridis",
  scale: "linear",
  percentile: 0.99,
  // Phase 5 default.
  isRendering: false,
};

// ---------------------------------------------------------------------------
// Worker instantiation — module scope (Pitfall 5: NEVER inside an action body)
// The same Worker instance handles all load and render requests for the page's
// lifetime. Multiple calls to openUrl/openFile reuse the same Worker thread.
// ---------------------------------------------------------------------------
const worker = new Worker(
  new URL("../worker/mzPeakWorker.ts", import.meta.url),
  { type: "module" },
);

// Generation counter for stale renderResult responses (Pattern 5 / T-05-05).
// Incremented on each renderIonImage call; Worker echoes requestId in the
// response; mismatched IDs are silently discarded on the main thread.
let currentRequestId = 0;

export const useStore = create<State & Actions>((set, get) => ({
  ...initialState,

  openUrl(url: string) {
    set({ ...initialState, stage: "zip-index" });
    worker.postMessage({ type: "loadUrl", url } satisfies WorkerRequest);
  },

  async openFile(file: File) {
    set({ ...initialState, stage: "zip-index" });
    const buffer = await file.arrayBuffer();
    // Transfer ownership of the ArrayBuffer to the Worker (Pattern 4 / Pitfall 3).
    // File objects cannot cross the Worker boundary reliably — convert to ArrayBuffer
    // on the main thread first, then transfer the buffer zero-copy.
    worker.postMessage(
      { type: "loadFile", bytes: buffer, name: file.name } satisfies WorkerRequest,
      [buffer],
    );
  },

  selectSpectrum(index: number) {
    // Optimistic UI update — actual spectrum data arrives via 'spectrumResult'.
    // The Worker holds the active Reader; it performs the Parquet read.
    set({ selectedIndex: index });
    worker.postMessage({ type: "selectSpectrum", index } satisfies WorkerRequest);
  },

  // Phase 4: render an m/z-windowed ion image (IMAGE-02).
  // This action now dispatches to the Worker instead of running inline.
  // setColormapSettings MUST NOT call extractXIC or reader (D-02/SC-5).
  renderIonImage(mz: number, tolDa: number) {
    const { grid, stats } = get();
    if (!grid || !stats) return;
    // V5 input validation (ASVS L1): reject non-finite, non-positive, or negative-window inputs.
    // This is defense-in-depth — the Worker also validates (T-05-02).
    if (!Number.isFinite(mz) || mz <= 0 || !Number.isFinite(tolDa) || tolDa <= 0) return;
    if (mz - tolDa < 0) return; // guard: negative mz start is non-physical (T-04-05)
    const rid = ++currentRequestId;
    // Optimistic mzWindow update for spectrum band highlighting (SPEC-02).
    // The ion image itself arrives via 'renderResult' when the Worker is done.
    set({ isRendering: true, mzWindow: { mz, tolDa } });
    worker.postMessage(
      { type: "renderIonImage", mz, tolDa, requestId: rid } satisfies WorkerRequest,
    );
  },

  // Phase 4: update colormap/scale/percentile settings (IMAGE-03).
  // Pure state mutation — no file I/O, no Worker message. The render effect in
  // ImagingPanel re-rasterizes the cached ionImage on colormap/scale change (D-02/SC-5).
  setColormapSettings(colormap: Colormap, scale: "linear" | "log", percentile: number) {
    set({ colormap, scale, percentile });
  },
}));

// ---------------------------------------------------------------------------
// Worker onmessage handler — single source of truth for all state updates
// driven by Worker responses. Must be wired AFTER useStore is created so
// useStore.setState() is available.
//
// Zustand exposes setState on the store object itself — calling useStore.setState
// from outside create() is the idiomatic pattern for external event sources.
// ---------------------------------------------------------------------------
worker.onmessage = (e: MessageEvent<WorkerResponse>): void => {
  const msg = e.data;
  switch (msg.type) {
    case "progress":
      useStore.setState({ stage: msg.stage });
      break;

    case "loadResult": {
      // Spread LoadResult fields into state; store no longer holds reader handle.
      // Worker is the sole owner of the live Reader after Plan 05-03.
      const r = msg.result as LoadResult;
      useStore.setState({
        manifest: r.manifest,
        fileMeta: r.fileMeta,
        stats: r.stats,
        capabilities: r.capabilities,
        grid: r.grid ?? null,
        tic: r.tic ?? null,
        mixedRepresentationWarning: r.mixedRepresentationWarning,
        stage: "ready",
        error: null,
        selectedIndex: null,
        selectedSpectrum: null,
      });
      break;
    }

    case "noImaging": {
      // D-04/D-06: valid non-imaging file — not an error. Set 'no-imaging' stage
      // so the UI shows the informational notice instead of ImagingPanel.
      const r = msg.result as NonImagingResult;
      useStore.setState({
        manifest: r.manifest,
        fileMeta: r.fileMeta,
        stats: r.stats,
        capabilities: r.capabilities,
        grid: null,
        tic: null,
        stage: "no-imaging",
        error: null,
        selectedIndex: null,
        selectedSpectrum: null,
      });
      break;
    }

    case "renderResult":
      // Stale response guard (Pattern 5 / T-05-05): if the Worker echoes a
      // requestId that no longer matches the latest request, discard silently.
      if (msg.requestId !== currentRequestId) break;
      useStore.setState({
        ionImage: msg.ionImage ?? null,
        ionImageStats: msg.stats ?? null,
        isRendering: false,
      });
      break;

    case "spectrumResult":
      useStore.setState({
        selectedIndex: msg.spectrum.index,
        selectedSpectrum: msg.spectrum,
      });
      break;

    case "error":
      // CRITICAL (Pitfall 7 / T-05-06): isRendering MUST be cleared on error,
      // or the 'Show Ion Image' button is permanently disabled after any Worker error.
      useStore.setState({
        stage: "error",
        error: {
          class: msg.class,
          message: msg.message,
          findings: msg.findings,
        },
        isRendering: false,
      });
      break;
  }
};
