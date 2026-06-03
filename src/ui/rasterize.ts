// rasterizeTic — the pure TIC → RGBA render transform (IMAGE-04).
//
// A pure, DOM-free helper (RESEARCH Pitfall 4; UI-SPEC permits the pure split):
// NO `react`, NO `uplot`, NO canvas/DOM API. It carries grid.ts's Number.isFinite
// guard discipline. Two correctness invariants live here:
//   - D-09 / C8: absent pixels (presenceMask[k]===0) render to a fixed SENTINEL,
//     NEVER colormap-bottom — absent must be visually distinct from zero-intensity.
//   - The 99th-percentile clip ceiling is computed from PRESENT cells only, so a
//     stray value in an absent cell can never blow out the normalization.
// Orientation is already correct upstream (buildTic): output offset k*4 maps to
// input tic[k] — NO transpose/reorder here (IMAGE-04).
import type { ImagingGrid } from "../imaging/types";

/**
 * Sparse / absent-pixel sentinel (UI-SPEC: #1a1a1a, RGBA 26,26,26,255). Near-black
 * is visually distinct from viridis's dark-purple bottom (~#440154). D-09 MANDATORY.
 */
const SENTINEL: readonly [number, number, number] = [0x1a, 0x1a, 0x1a];

/**
 * Viridis-like perceptually-uniform LUT (UI-SPEC default colormap). Implemented as
 * fixed RGB anchor stops with linear interpolation — ONE swappable pure function so
 * Phase 4 (IMAGE-03) can add a selector without a refactor. Anchors are the standard
 * matplotlib viridis at 9 evenly-spaced stops (0, 0.125, …, 1).
 */
const VIRIDIS_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84], // 0.000  dark purple (bottom, distinct from near-black sentinel)
  [72, 40, 120], // 0.125
  [62, 74, 137], // 0.250
  [49, 104, 142], // 0.375
  [38, 130, 142], // 0.500
  [31, 158, 137], // 0.625
  [53, 183, 121], // 0.750
  [110, 206, 88], // 0.875
  [253, 231, 37], // 1.000  yellow (top)
];

/**
 * Map a normalized intensity `norm ∈ [0,1]` to an integer `[r,g,b]` viridis triple.
 * Out-of-range inputs are clamped so the function is total.
 */
export function viridis(norm: number): [number, number, number] {
  const t = Number.isFinite(norm) ? Math.min(Math.max(norm, 0), 1) : 0;
  const segments = VIRIDIS_STOPS.length - 1;
  const scaled = t * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const frac = scaled - i;
  const a = VIRIDIS_STOPS[i];
  const b = VIRIDIS_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

/**
 * 99th-percentile clip ceiling over PRESENT cells only (presenceMask[k] !== 0).
 * Absent and non-finite values are excluded. Returns 0 when no present finite
 * value exists (caller then renders everything at colormap-bottom).
 */
function percentile99(tic: Float32Array, presenceMask: Uint8Array): number {
  const present: number[] = [];
  const n = Math.min(tic.length, presenceMask.length);
  for (let k = 0; k < n; k++) {
    if (presenceMask[k] === 0) continue;
    const v = tic[k];
    if (Number.isFinite(v)) present.push(v);
  }
  if (present.length === 0) return 0;
  present.sort((p, q) => p - q);
  const idx = Math.min(present.length - 1, Math.floor(0.99 * (present.length - 1)));
  const ceil = present[idx];
  return Number.isFinite(ceil) && ceil > 0 ? ceil : 0;
}

/**
 * Render a TIC raster to RGBA bytes (length `width*height*4`, row-major).
 *
 * - Absent cells (presenceMask[k]===0) → SENTINEL RGBA, alpha 255 (D-09).
 * - Present cells → viridis(clamp(tic[k] / clipMax)), alpha 255, where `clipMax`
 *   is the present-only 99th percentile. Non-finite/negative normalize to 0.
 * - No cell reorder: out[k*4..] derives from tic[k] (orientation owned upstream).
 */
export function rasterizeTic(tic: Float32Array, grid: ImagingGrid): Uint8ClampedArray {
  const total = grid.width * grid.height;
  const out = new Uint8ClampedArray(total * 4);
  const { presenceMask } = grid;
  const clipMax = percentile99(tic, presenceMask);

  for (let k = 0; k < total; k++) {
    const o = k * 4;
    if (presenceMask[k] === 0) {
      out[o] = SENTINEL[0];
      out[o + 1] = SENTINEL[1];
      out[o + 2] = SENTINEL[2];
      out[o + 3] = 255;
      continue;
    }
    const raw = tic[k];
    const norm =
      clipMax > 0 && Number.isFinite(raw) ? Math.min(Math.max(raw / clipMax, 0), 1) : 0;
    const [r, g, b] = viridis(norm);
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }

  return out;
}
