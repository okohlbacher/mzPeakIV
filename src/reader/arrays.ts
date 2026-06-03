// Reconstruct one spectrum's signal as plain typed arrays.
//
// Keeps m/z at float64 precision (PITFALLS 9) and intensity at float32. Returns
// `Float64Array`/`Float32Array` only — no Arrow Vectors leak upward.
import type { Reader } from "./openUrl";
import type { SpectrumArrays } from "./types";

// mzpeakts names the reconstructed columns by their human-readable CV name.
const MZ_KEY = "m/z array";
const INTENSITY_KEY = "intensity array";

/**
 * Read + reconstruct spectrum `index` into `{ mz, intensity }`.
 *
 * For profile/point spectra mzpeakts populates `spectrum.dataArrays`; for
 * centroid spectra it populates `spectrum.centroids` ({mz,intensity}[]). 01-01's
 * demo is point layout (DATA-01); the centroid branch keeps the boundary honest
 * for later plans without precluding them.
 */
export async function getSpectrumArrays(
  reader: Reader,
  index: number,
): Promise<SpectrumArrays> {
  const spectrum = await reader.getSpectrum(index);
  if (!spectrum) {
    throw new Error(`No spectrum at index ${index}`);
  }
  const id = String(spectrum.id);

  const da = spectrum.dataArrays;
  if (da && da[MZ_KEY] && da[INTENSITY_KEY]) {
    const rawMz = da[MZ_KEY] as ArrayLike<number>;
    const rawIntensity = da[INTENSITY_KEY] as ArrayLike<number>;
    // Copy into the canonical dtypes (preserve f64 m/z precision).
    const mz = Float64Array.from(rawMz);
    const intensity = Float32Array.from(rawIntensity);
    if (mz.length !== intensity.length) {
      throw new Error(
        `Spectrum ${index}: m/z (${mz.length}) and intensity ` +
          `(${intensity.length}) length mismatch`,
      );
    }
    return { index, id, mz, intensity };
  }

  // Centroid fallback (spectra_peaks).
  const centroids = spectrum.centroids;
  if (centroids && centroids.length > 0) {
    const n = centroids.length;
    const mz = new Float64Array(n);
    const intensity = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mz[i] = centroids[i].mz;
      intensity[i] = centroids[i].intensity;
    }
    return { index, id, mz, intensity };
  }

  // No decodable signal arrays — fail loud rather than render silent zeros.
  throw new Error(
    `Spectrum ${index} has no reconstructable m/z + intensity arrays`,
  );
}
