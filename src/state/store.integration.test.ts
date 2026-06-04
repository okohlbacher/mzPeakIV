/**
 * Real-reader integration tests for the store's non-imaging path.
 *
 * Unlike store.test.ts (which mocks the reader boundary), these tests use the
 * actual vendored mzpeakts reader against the bundled small.mzpeak fixture —
 * the same file used by the Phase-1 e2e tests. This proves the non-imaging
 * branch in the real reader path (not just the mocked branch).
 *
 * Separate file so vi.mock() in store.test.ts doesn't interfere.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import { useStore } from "./store";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../../test/data/small.mzpeak");

describe("store integration — real small.mzpeak (non-imaging fixture)", () => {
  beforeEach(() => {
    useStore.setState({
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

  it("loads small.mzpeak: stage=ready, grid=null, error=null, isImaging=false (D-06)", async () => {
    const bytes = readFileSync(FIXTURE);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const file = new File([blob], "small.mzpeak");

    await useStore.getState().openFile(file);

    const state = useStore.getState();
    expect(state.stage).toBe("ready");
    expect(state.error).toBeNull();
    expect(state.grid).toBeNull();
    // small.mzpeak has no IMS_1000050/51 columns — correctly detected as non-imaging
    expect(state.capabilities?.isImaging).toBe(false);
    // Non-null manifest and metadata prove the file was fully parsed
    expect(state.manifest.length).toBeGreaterThan(0);
    expect(state.stats?.numSpectra).toBeGreaterThan(0);
  });
});
