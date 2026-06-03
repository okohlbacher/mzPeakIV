// buildImagingGrid — the pure geometry + presence + diagnostics transform (IMG-02, IMG-03).
//
// Mirrors src/reader/arrays.ts: a named pure export, no side effects (beyond one
// console.warn on the DoS cap), importing ONLY from ./types. It NEVER touches Arrow,
// bigint, or mzpeakts — it receives plain `{x,y}[]` coords from the reader boundary
// (02-CONTEXT D-08). The boundary is one-way: imaging/ does not import reader/.
import type {
  ImagingGrid,
  GridGeometry,
  GridDiagnostics,
  CoordSourceStrategy,
} from "./types";

/**
 * DoS cap (T-02-02-OOM): refuse to allocate a presence mask larger than this many
 * cells. Map lookup is O(filled); only the mask is dense, so this bounds the single
 * dense allocation. 50M cells ≈ 50 MB Uint8Array — well beyond any real MSI grid.
 */
const MAX_CELLS = 50_000_000;

/** A plain (Arrow-free) coordinate pair. */
export interface Coord {
  x: number;
  y: number;
}

/**
 * Build a sparse, diagnosable `ImagingGrid` from plain coordinates.
 *
 * @param coords           per-spectrum {x,y} (1-based by spec, but base is READ from geometry)
 * @param spectrumIndices  parallel array: spectrumIndices[i] is the spectrum index for coords[i]
 * @param geometry         declared extent / pixel size / coordinate base (declared extent WINS)
 * @param coordSourceStrategy which CoordSource won (surfaced in diagnostics, D-16)
 * @returns the grid, or `null` when coords is empty (non-imaging is a valid null state, D-04)
 *          or when the declared/observed extent exceeds the DoS cap.
 */
export function buildImagingGrid(
  coords: Coord[],
  spectrumIndices: number[],
  geometry: GridGeometry | null,
  coordSourceStrategy: CoordSourceStrategy,
): ImagingGrid | null {
  // Non-imaging / empty: a valid null state, not an error (D-04).
  if (coords.length === 0) {
    return null;
  }

  // Read the base from geometry — NEVER hard-code −1 (D-10/C3).
  const coordinateBase = geometry?.coordinateBase ?? 1;

  // Observed extent from the coords themselves (1-based → +1 to count cells).
  let observedMaxX = 0;
  let observedMaxY = 0;
  for (const c of coords) {
    const x0 = c.x - coordinateBase;
    const y0 = c.y - coordinateBase;
    if (x0 + 1 > observedMaxX) observedMaxX = x0 + 1;
    if (y0 + 1 > observedMaxY) observedMaxY = y0 + 1;
  }

  // Declared extent WINS over observed max (D-11/C4); fall back to observed otherwise.
  const declared = geometry?.pixelCount ?? null;
  const width = declared?.x ?? observedMaxX;
  const height = declared?.y ?? observedMaxY;
  const extentSource: GridDiagnostics["extentSource"] = declared
    ? "declared"
    : "max-coord";

  // Guard against degenerate / over-large allocations.
  if (width <= 0 || height <= 0) {
    return null;
  }
  const totalCells = width * height;
  if (totalCells > MAX_CELLS) {
    console.warn(
      `buildImagingGrid: refusing ${width}×${height} = ${totalCells} cells ` +
        `(exceeds DoS cap of ${MAX_CELLS}); returning null.`,
    );
    return null;
  }

  // Sparse model: a Map lookup + a dense boolean presence mask (D-14/C8).
  const coordToSpectrumIndex = new Map<number, number>();
  const presenceMask = new Uint8Array(totalCells);

  let duplicateCount = 0;
  const n = Math.min(coords.length, spectrumIndices.length);
  if (coords.length !== spectrumIndices.length) {
    // Mismatch is a caller bug; surface it in diagnostics rather than silently truncating.
    console.warn(
      `buildImagingGrid: coords.length (${coords.length}) !== spectrumIndices.length (${spectrumIndices.length}); processing ${n} pairs`,
    );
  }
  for (let i = 0; i < n; i++) {
    const x0 = coords[i].x - coordinateBase;
    const y0 = coords[i].y - coordinateBase;
    // Bounds-check BEFORE indexing (T-02-02-OOB): out-of-range coords are skipped
    // and counted only as "not filled", never written.
    if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) {
      continue;
    }
    const key = y0 * width + x0; // row-major: row=y, col=x (C2: col=position_x, row=position_y)
    if (coordToSpectrumIndex.has(key)) {
      // Keep the first writer; do not silently overwrite (Pattern 2).
      duplicateCount++;
      continue;
    }
    coordToSpectrumIndex.set(key, spectrumIndices[i]);
    presenceMask[key] = 1;
  }

  const filledCount = coordToSpectrumIndex.size;
  const missingCount = totalCells - filledCount;

  // Declared-vs-observed disagreement note (C1/C4): flag when a declared extent is
  // present AND coords reach beyond it on either axis.
  let discoveryDisagreement: string | null = null;
  if (
    declared &&
    (declared.x < observedMaxX || declared.y < observedMaxY)
  ) {
    discoveryDisagreement =
      `Declared extent ${declared.x}×${declared.y} is smaller than the ` +
      `observed coordinate span ${observedMaxX}×${observedMaxY}; ` +
      `declared extent wins (C4) and out-of-range coordinates were skipped.`;
  }

  const diagnostics: GridDiagnostics = {
    spectrumCount: coords.length,
    uniqueCoordCount: filledCount,
    duplicateCount,
    missingCount,
    extentSource,
    geometrySource: geometry?.geometrySource ?? "derived",
    discoveryDisagreement,
  };

  return {
    width,
    height,
    coordinateBase,
    pixelSizeUm: geometry?.pixelSizeUm ?? null,
    coordToSpectrumIndex,
    presenceMask,
    filledCount,
    totalCells,
    coordSourceStrategy,
    diagnostics,
  };
}
