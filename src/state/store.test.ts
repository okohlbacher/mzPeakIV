import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the reader boundary so the store test is deterministic and offline.
vi.mock("../reader/openUrl", () => ({
  openUrl: vi.fn(async () => ({ __fakeReader: true })),
}));
vi.mock("../reader/openFile", () => ({
  openFile: vi.fn(async () => ({ __fakeReader: true })),
}));
vi.mock("../reader/fileMeta", () => ({
  manifest: vi.fn(() => [{ name: "x", entityType: "spectrum", dataKind: "data arrays" }]),
  fileMeta: vi.fn(() => ({
    fileDescription: { contents: [{ name: "a" }] },
    instrumentConfigurations: [],
    software: [],
    run: null,
    samples: [],
  })),
  // selectSpectrum now derives representation via spectrumMeta (DATA-03 routing).
  spectrumMeta: vi.fn((_reader: unknown, index: number) => ({
    index,
    id: `id-${index}`,
    msLevel: 1,
    representation: "profile" as const,
  })),
}));
vi.mock("../reader/stats", () => ({
  computeStats: vi.fn(() => ({
    numSpectra: 3,
    numEntities: 1,
    mzRange: null,
    msLevels: [1],
    representationCounts: { profile: 2, centroid: 1 },
  })),
  computeCapabilities: vi.fn(() => ({
    layout: "point",
    encodings: ["MS:1000514"],
    isImaging: false,
    unsupported: [],
  })),
}));
vi.mock("../reader/arrays", () => ({
  getSpectrumArrays: vi.fn(async (_reader: unknown, index: number) => ({
    index,
    id: `id-${index}`,
    mz: Float64Array.from([100, 200, 300]),
    intensity: Float32Array.from([1, 2, 3]),
  })),
  // Representation-routed variant the rewired selectSpectrum calls (DATA-03).
  getSpectrumArraysFor: vi.fn(
    async (_reader: unknown, index: number, _representation: unknown) => ({
      index,
      id: `id-${index}`,
      mz: Float64Array.from([100, 200, 300]),
      intensity: Float32Array.from([1, 2, 3]),
    }),
  ),
}));
vi.mock("../reader/scanCoords", () => ({
  extractCoords: vi.fn(() => ({
    coords: [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    spectrumIndices: [0, 1],
    strategy: "promoted-columns",
  })),
  readGridGeometry: vi.fn(() => null),
}));
vi.mock("../imaging/grid", () => ({
  buildImagingGrid: vi.fn(() => ({
    width: 2,
    height: 1,
    coordinateBase: 1,
    pixelSizeUm: null,
    coordToSpectrumIndex: new Map([
      [0, 0],
      [1, 1],
    ]),
    presenceMask: Uint8Array.from([1, 1]),
    filledCount: 2,
    totalCells: 2,
    coordSourceStrategy: "promoted-columns",
    diagnostics: {
      spectrumCount: 2,
      uniqueCoordCount: 2,
      duplicateCount: 0,
      missingCount: 0,
      extentSource: "max-coord",
      geometrySource: "derived",
      discoveryDisagreement: null,
    },
  })),
}));

import { useStore } from "./store";

describe("store.openUrl staged progress (LOAD-03)", () => {
  beforeEach(() => {
    useStore.setState({
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
    });
  });

  it("transitions zip-index -> manifest -> metadata -> ready in order", async () => {
    const seen: string[] = [];
    const unsub = useStore.subscribe((s) => {
      const last = seen[seen.length - 1];
      if (s.stage !== last) seen.push(s.stage);
    });

    await useStore.getState().openUrl("http://example/demo.mzpeak");
    unsub();

    // Filter to the staged-load markers and assert ordering.
    const staged = seen.filter((s) =>
      ["zip-index", "manifest", "metadata", "ready"].includes(s),
    );
    expect(staged).toEqual(["zip-index", "manifest", "metadata", "ready"]);

    const state = useStore.getState();
    expect(state.stage).toBe("ready");
    expect(state.stats?.numSpectra).toBe(3);
    expect(state.manifest.length).toBe(1);
    // Auto-selected first spectrum.
    expect(state.selectedIndex).toBe(0);
    expect(state.selectedSpectrum?.mz).toBeInstanceOf(Float64Array);
  });

  it("sets stage=error and a structured StoreError on failure", async () => {
    const { openUrl } = await import("../reader/openUrl");
    (openUrl as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );

    await useStore.getState().openUrl("http://example/bad.mzpeak");
    const state = useStore.getState();
    expect(state.stage).toBe("error");
    // error is now a structured StoreError (class + message), not a bare string.
    expect(state.error).not.toBeNull();
    expect(state.error?.class).toBe("corrupt");
    expect(state.error?.message).toContain("boom");
  });

  it("store.openFile transitions zip-index -> manifest -> metadata -> ready", async () => {
    const seen: string[] = [];
    const unsub = useStore.subscribe((s) => {
      const last = seen[seen.length - 1];
      if (s.stage !== last) seen.push(s.stage);
    });

    const fakeFile = new File(["fake"], "demo.mzpeak", { type: "application/octet-stream" });
    await useStore.getState().openFile(fakeFile);
    unsub();

    const staged = seen.filter((s) =>
      ["zip-index", "manifest", "metadata", "ready"].includes(s),
    );
    expect(staged).toEqual(["zip-index", "manifest", "metadata", "ready"]);

    const state = useStore.getState();
    expect(state.stage).toBe("ready");
    expect(state.stats?.numSpectra).toBe(3);
    expect(state.capabilities?.isImaging).toBe(false);
    expect(state.capabilities?.layout).toBe("point");
  });

  it("imaging file passes through the 'grid' stage and produces a non-null grid (IMG-01/02)", async () => {
    // Override capabilities for this one load so the grid stage runs.
    const { computeCapabilities } = await import("../reader/stats");
    (
      computeCapabilities as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      layout: "point",
      encodings: ["MS:1000514"],
      isImaging: true,
      unsupported: [],
    });

    const seen: string[] = [];
    const unsub = useStore.subscribe((s) => {
      const last = seen[seen.length - 1];
      if (s.stage !== last) seen.push(s.stage);
    });

    await useStore.getState().openUrl("http://example/imaging.mzpeak");
    unsub();

    // The 'grid' stage is reached between metadata and ready.
    const staged = seen.filter((s) =>
      ["zip-index", "manifest", "metadata", "grid", "ready"].includes(s),
    );
    expect(staged).toEqual([
      "zip-index",
      "manifest",
      "metadata",
      "grid",
      "ready",
    ]);

    const state = useStore.getState();
    expect(state.stage).toBe("ready");
    expect(state.error).toBeNull();
    expect(state.grid).not.toBeNull();
    expect(state.grid?.width).toBe(2);
    expect(state.grid?.height).toBe(1);
    // filledCount === unique coord count for the dense fixture.
    expect(state.grid?.filledCount).toBe(state.grid?.diagnostics.uniqueCoordCount);
  });

  it("non-imaging file → grid === null, stage === 'ready', error === null (D-06)", async () => {
    // Default computeCapabilities mock returns isImaging: false → grid stage no-ops.
    await useStore.getState().openUrl("http://example/non-imaging.mzpeak");

    const state = useStore.getState();
    expect(state.stage).toBe("ready");
    expect(state.grid).toBeNull();
    expect(state.error).toBeNull();
  });
});
