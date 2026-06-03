// The ONE module that imports `mzpeakts`.
//
// Everything else in the app depends on the opaque `Reader` handle re-exported
// here, never on `mzpeakts` directly. `grep -rl "from 'mzpeakts'" src/` must
// return only this file (acceptance criterion, R-03c).
import { MzPeakReader } from "mzpeakts";
import { detectUnsupported } from "./capability";
import { UnsupportedEncodingError } from "./errors";

/**
 * Opaque reader handle. The concrete type is mzpeakts' `MzPeakReader`, but
 * callers should treat it as a black box and go through the helpers in
 * fileMeta.ts / arrays.ts. Typed via `InstanceType` so no `mzpeakts` types leak
 * into the rest of the app's surface beyond this alias.
 */
export type Reader = InstanceType<typeof MzPeakReader>;

/**
 * Run the capability gate after a reader has been opened + initialized.
 * Eagerly triggers spectrumData() so the arrayIndex is populated for detection.
 * Throws UnsupportedEncodingError if any unsupported encodings are found (DATA-02).
 */
async function capabilityGate(reader: Reader): Promise<Reader> {
  // Eagerly load the spectrum data reader so the arrayIndex is populated.
  // This is required for Numpress detection from static Parquet metadata.
  await reader.spectrumData();
  const findings = detectUnsupported(reader, []);
  if (findings.length > 0) {
    throw new UnsupportedEncodingError(findings);
  }
  return reader;
}

/**
 * Open a `.mzpeak` from a URL (HTTP range requests via zip.js). Eagerly loads
 * metadata; signal arrays are read lazily on demand. The boundary into the
 * vendored WASM reader. Runs the capability gate before returning.
 */
export async function openUrl(url: string | URL): Promise<Reader> {
  // boundary: mzpeakts/parquet-wasm — opening untrusted file bytes over HTTP.
  const reader = await MzPeakReader.fromUrl(url);
  return capabilityGate(reader);
}

/**
 * Open a `.mzpeak` from a local File/Blob (no createObjectURL hack needed —
 * mzpeakts has a first-class `fromBlob`). Runs the capability gate before returning.
 */
export async function openBlob(blob: Blob): Promise<Reader> {
  // boundary: mzpeakts/parquet-wasm — opening untrusted local file bytes.
  const reader = await MzPeakReader.fromBlob(blob);
  return capabilityGate(reader);
}
