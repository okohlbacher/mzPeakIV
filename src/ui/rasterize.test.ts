/**
 * Tests for rasterize.ts — rasterizeTic (IMAGE-04 render transform).
 *
 * Pure-transform tests: a synthetic TIC Float32Array + a minimal ImagingGrid
 * (presenceMask/width/height). NO canvas, NO DOM — rasterizeTic is a pure
 * Float32Array -> Uint8ClampedArray function (RESEARCH Pitfall 4).
 *
 * Plan binding: 03-01 Task 2 behavior block, Tests 1–6.
 */
import { describe, it, expect } from "vitest";
import { rasterizeTic, viridis } from "./rasterize";
import type { ImagingGrid } from "../imaging/types";

// ── Fixture helper ────────────────────────────────────────────────────────────

/** Minimal grid: only width/height/presenceMask are read by rasterizeTic. */
function makeGrid(width: number, height: number, absent: number[] = []): ImagingGrid {
  const totalCells = width * height;
  const presenceMask = new Uint8Array(totalCells).fill(1);
  for (const k of absent) presenceMask[k] = 0;
  return {
    width,
    height,
    coordinateBase: 1,
    pixelSizeUm: null,
    coordToSpectrumIndex: new Map(),
    presenceMask,
    filledCount: totalCells - absent.length,
    totalCells,
    coordSourceStrategy: "promoted-columns",
    diagnostics: {
      spectrumCount: 0,
      uniqueCoordCount: 0,
      duplicateCount: 0,
      missingCount: absent.length,
      oobCount: 0,
      extentSource: "declared",
      geometrySource: "run-params",
      discoveryDisagreement: null,
    },
  };
}

const SENTINEL: [number, number, number] = [26, 26, 26];

function rgbaAt(out: Uint8ClampedArray, k: number): [number, number, number, number] {
  return [out[k * 4], out[k * 4 + 1], out[k * 4 + 2], out[k * 4 + 3]];
}

// ── Test 1: shape ─────────────────────────────────────────────────────────────

describe("rasterizeTic — output shape (Test 1)", () => {
  it("returns a Uint8ClampedArray of length width*height*4", () => {
    const grid = makeGrid(3, 2);
    const tic = new Float32Array(6);
    const out = rasterizeTic(tic, grid);
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out.length).toBe(6 * 4);
  });
});

// ── Test 2: absent cell -> sentinel, distinct from zero-intensity ─────────────

describe("rasterizeTic — absent sentinel (Test 2)", () => {
  it("maps presenceMask[k]===0 to the sentinel RGBA, distinct from colormap(0)", () => {
    const grid = makeGrid(2, 1, [0]); // cell 0 absent, cell 1 present
    const tic = new Float32Array([0, 0]); // both zero-intensity
    const out = rasterizeTic(tic, grid);

    expect(rgbaAt(out, 0)).toEqual([...SENTINEL, 255]);
    // present zero-intensity cell uses colormap(0) — must differ from sentinel
    expect(rgbaAt(out, 1)).not.toEqual([...SENTINEL, 255]);
  });
});

// ── Test 3: present zero-intensity -> colormap(0) ─────────────────────────────

describe("rasterizeTic — present zero-intensity (Test 3)", () => {
  it("maps a present zero cell to colormap(0), distinct from the sentinel", () => {
    const grid = makeGrid(1, 1); // present
    const tic = new Float32Array([0]);
    const out = rasterizeTic(tic, grid);

    const expected = viridis(0);
    expect(rgbaAt(out, 0)).toEqual([...expected, 255]);
    expect(rgbaAt(out, 0)).not.toEqual([...SENTINEL, 255]);
  });
});

// ── Test 4: percentile clip ignores absent cells ──────────────────────────────

describe("rasterizeTic — percentile clip ignores absent (Test 4)", () => {
  it("derives the clip ceiling only from present cells; brightest present cell -> LUT top", () => {
    // 3 present cells with values 10,20,30 and one ABSENT cell holding a huge value.
    const grid = makeGrid(2, 2, [3]); // cell 3 absent
    const tic = new Float32Array([10, 20, 30, 1_000_000]);
    const out = rasterizeTic(tic, grid);

    // brightest present value (30) should normalize to 1.0 -> viridis(1) (LUT top)
    const top = viridis(1);
    expect(rgbaAt(out, 2)).toEqual([...top, 255]);
    // absent cell unaffected by its huge value — renders sentinel
    expect(rgbaAt(out, 3)).toEqual([...SENTINEL, 255]);
  });
});

// ── Test 5: non-finite / negative present value clamps ────────────────────────

describe("rasterizeTic — clamp non-finite/negative (Test 5)", () => {
  it("clamps non-finite or negative present values to a valid RGBA (no NaN, no OOB)", () => {
    const grid = makeGrid(3, 1); // all present
    const tic = new Float32Array([NaN, -50, 100]);
    const out = rasterizeTic(tic, grid);

    for (let k = 0; k < 3; k++) {
      const [r, g, b, a] = rgbaAt(out, k);
      for (const c of [r, g, b, a]) {
        expect(Number.isNaN(c)).toBe(false);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
    // negative/NaN normalize to 0 -> colormap(0)
    const zero = viridis(0);
    expect(rgbaAt(out, 0)).toEqual([...zero, 255]); // NaN -> 0
    expect(rgbaAt(out, 1)).toEqual([...zero, 255]); // -50 -> 0
  });
});

// ── Test 6: orientation passthrough — no reorder ──────────────────────────────

describe("rasterizeTic — orientation passthrough (Test 6)", () => {
  it("output cell k derives from input tic[k] (no transpose/reorder)", () => {
    const grid = makeGrid(2, 1); // 2 present cells
    // uniform-value array so the present-only percentile equals that value:
    // a flat bright field maps every cell to LUT top, and cell k tracks tic[k].
    const tic = new Float32Array([100, 100]);
    const out = rasterizeTic(tic, grid);

    const top = viridis(1);
    // both cells bright (norm 1.0); assert offset k*4 corresponds to tic[k]
    expect(rgbaAt(out, 0)).toEqual([...top, 255]);
    expect(rgbaAt(out, 1)).toEqual([...top, 255]);

    // distinct-value gradient over enough cells that the percentile preserves the
    // span: a uniform field of 100 with cell 0 set to 0. percentile99 of the
    // present values (mostly 100) ≈ 100, so the bright cells map to LUT top and the
    // single dim cell at index 0 maps to LUT bottom — order preserved, no reorder.
    const grid2 = makeGrid(4, 1);
    const tic2 = new Float32Array([0, 100, 100, 100]);
    const out2 = rasterizeTic(tic2, grid2);
    const zero = viridis(0);
    expect(rgbaAt(out2, 0)).toEqual([...zero, 255]); // dim cell stays at index 0
    expect(rgbaAt(out2, 3)).toEqual([...top, 255]); // bright cell stays at index 3
  });
});

// ── viridis sanity ────────────────────────────────────────────────────────────

describe("viridis — LUT bounds", () => {
  it("returns in-range RGB triples at the extremes", () => {
    for (const n of [0, 0.5, 1]) {
      const [r, g, b] = viridis(n);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
        expect(Number.isInteger(c)).toBe(true);
      }
    }
  });
});
