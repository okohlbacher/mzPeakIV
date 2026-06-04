// rasterize.ts — pure render transforms for TIC and ion images (IMAGE-03, IMAGE-04).
//
// A pure, DOM-free helper (RESEARCH Pitfall 4; UI-SPEC permits the pure split):
// NO `react`, NO `uplot`, NO canvas/DOM API. It carries grid.ts's Number.isFinite
// guard discipline. Two correctness invariants live here:
//   - D-09 / C8: absent pixels (presenceMask[k]===0) render to a fixed SENTINEL,
//     NEVER colormap-bottom — absent must be visually distinct from zero-intensity.
//   - The percentile clip ceiling is computed from PRESENT cells only, so a
//     stray value in an absent cell can never blow out the normalization.
// Orientation is already correct upstream (buildTic/buildIonImage): output offset k*4
// maps to input values[k] — NO transpose/reorder here (C2 MANDATORY).
import type { ImagingGrid } from "../imaging/types";

/**
 * Sparse / absent-pixel sentinel (UI-SPEC: #1a1a1a, RGBA 26,26,26,255). Near-black
 * is visually distinct from viridis's dark-purple bottom (~#440154). D-09 MANDATORY.
 */
const SENTINEL: readonly [number, number, number] = [0x1a, 0x1a, 0x1a];

// ── Colormap type ─────────────────────────────────────────────────────────────

/** Available colormaps for rasterizeImage (IMAGE-03). */
export type Colormap = "viridis" | "inferno" | "gray";

/** Options for rasterizeImage (IMAGE-03). */
export interface RasterizeOpts {
  colormap: Colormap;
  /** Percentile for clip ceiling (present cells only). e.g. 0.99 for 99th. */
  percentile: number;
  /** If true, apply Math.log1p scaling before normalization. */
  logScale: boolean;
}

// ── LUT stop tables ───────────────────────────────────────────────────────────

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
 * Standard matplotlib inferno LUT at 9 evenly-spaced stops (0, 0.125, …, 1).
 * [ASSUMED] cosmetic anchor values — chosen to match matplotlib inferno palette.
 */
const INFERNO_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 4], // 0.000  near-black (distinct from sentinel #1a1a1a)
  [40, 11, 84], // 0.125  dark purple
  [101, 21, 110], // 0.250  purple
  [159, 42, 99], // 0.375  magenta-red
  [212, 72, 66], // 0.500  orange-red
  [245, 125, 21], // 0.625  orange
  [250, 193, 39], // 0.750  gold
  [252, 255, 164], // 0.875  pale yellow
  [252, 255, 164], // 1.000  pale yellow (top — 9th stop, 8 segments)
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
 * Map a normalized intensity `norm ∈ [0,1]` to an integer `[r,g,b]` inferno triple.
 * Out-of-range inputs are clamped so the function is total.
 */
export function inferno(norm: number): [number, number, number] {
  const t = Number.isFinite(norm) ? Math.min(Math.max(norm, 0), 1) : 0;
  const segments = INFERNO_STOPS.length - 1;
  const scaled = t * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const frac = scaled - i;
  const a = INFERNO_STOPS[i];
  const b = INFERNO_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

// ── Percentile clip ───────────────────────────────────────────────────────────

/**
 * p-th percentile clip ceiling over PRESENT cells only (presenceMask[k] !== 0).
 * Absent and non-finite values are excluded. Returns 0 when no present finite
 * value exists (caller then renders everything at colormap-bottom).
 *
 * @param p  Percentile fraction, e.g. 0.99 for the 99th percentile.
 */
function percentileClip(values: Float32Array, presenceMask: Uint8Array, p: number): number {
  const present: number[] = [];
  const n = Math.min(values.length, presenceMask.length);
  for (let k = 0; k < n; k++) {
    if (presenceMask[k] === 0) continue;
    const v = values[k];
    if (Number.isFinite(v)) present.push(v);
  }
  if (present.length === 0) return 0;
  present.sort((a, b) => a - b);
  const idx = Math.min(present.length - 1, Math.floor(p * (present.length - 1)));
  const ceil = present[idx];
  return Number.isFinite(ceil) && ceil > 0 ? ceil : 0;
}

/**
 * Generalized raster render: Float32Array → RGBA bytes (length `width*height*4`, row-major).
 *
 * Correctness invariants (IMAGE-03):
 * - Absent cells (presenceMask[k]===0) → SENTINEL RGBA [0x1a,0x1a,0x1a,255] (D-09 / C8).
 * - Log scale uses Math.log1p: raw=0 → norm=0 exactly (never NaN or negative).
 * - Percentile clip is computed from PRESENT cells only.
 * - No cell reorder: out[k*4..] derives from values[k] (C2 MANDATORY — no flip/transpose).
 */
export function rasterizeImage(
  values: Float32Array,
  grid: ImagingGrid,
  opts: RasterizeOpts,
): Uint8ClampedArray {
  const total = grid.width * grid.height;
  const out = new Uint8ClampedArray(total * 4);
  const { presenceMask } = grid;
  const clipMax = percentileClip(values, presenceMask, opts.percentile);

  // For log scale, pre-compute the denominator so we only call log1p(clipMax) once.
  const denom = opts.logScale ? Math.log1p(clipMax) : clipMax;

  for (let k = 0; k < total; k++) {
    const o = k * 4;
    if (presenceMask[k] === 0) {
      out[o] = SENTINEL[0];
      out[o + 1] = SENTINEL[1];
      out[o + 2] = SENTINEL[2];
      out[o + 3] = 255;
      continue;
    }
    const raw = values[k];
    let norm: number;
    if (opts.logScale) {
      // Math.log1p is safe: log1p(0)===0 exactly; never negative for non-negative input.
      norm = denom > 0 && raw > 0 ? Math.min(Math.log1p(raw) / denom, 1) : 0;
    } else {
      norm =
        denom > 0 && Number.isFinite(raw) ? Math.min(Math.max(raw / denom, 0), 1) : 0;
    }

    let r: number, g: number, b: number;
    switch (opts.colormap) {
      case "inferno": {
        [r, g, b] = inferno(norm);
        break;
      }
      case "gray": {
        const gv = Math.round(Math.min(Math.max(norm, 0), 1) * 255);
        [r, g, b] = [gv, gv, gv];
        break;
      }
      default: {
        [r, g, b] = viridis(norm);
        break;
      }
    }

    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }

  return out;
}

/**
 * Render a TIC raster to RGBA bytes (length `width*height*4`, row-major).
 *
 * Thin wrapper around rasterizeImage with Phase 3 defaults (viridis, 99th percentile,
 * linear scale). All Phase 3 callers continue to work with the same two-arg signature.
 *
 * - Absent cells (presenceMask[k]===0) → SENTINEL RGBA, alpha 255 (D-09).
 * - Present cells → viridis(clamp(tic[k] / clipMax)), alpha 255, where `clipMax`
 *   is the present-only 99th percentile. Non-finite/negative normalize to 0.
 * - No cell reorder: out[k*4..] derives from tic[k] (orientation owned upstream).
 */
export function rasterizeTic(tic: Float32Array, grid: ImagingGrid): Uint8ClampedArray {
  return rasterizeImage(tic, grid, { colormap: "viridis", percentile: 0.99, logScale: false });
}
