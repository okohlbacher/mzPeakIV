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

  it("sets stage=error and an error message on failure", async () => {
    const { openUrl } = await import("../reader/openUrl");
    (openUrl as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );

    await useStore.getState().openUrl("http://example/bad.mzpeak");
    const state = useStore.getState();
    expect(state.stage).toBe("error");
    expect(state.error).toContain("boom");
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
});
