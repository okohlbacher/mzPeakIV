// resolveLoadUrl — normalize a user-entered dataset URL before it reaches the
// reader (BL-S3).
//
// A browser `fetch()` only speaks http(s), so an `s3://bucket/key` address cannot
// be loaded directly. We rewrite it to the configured S3 HTTPS endpoint, keeping
// the app's client-side, no-credentials posture (anonymous public-read objects
// only — NO request signing in the browser). http(s) URLs pass through unchanged.

/**
 * Default S3 HTTPS endpoint used to resolve `s3://` URLs (StackIT object storage).
 * `s3://<bucket>/<key>` → `<endpoint>/<bucket>/<key>` (path-style addressing).
 */
export const DEFAULT_S3_HTTPS_ENDPOINT =
  "https://object.storage.eu01.onstackit.cloud";

/**
 * Resolve a load URL: rewrite `s3://bucket/key` to the configured HTTPS endpoint;
 * return any other URL (http/https/relative) unchanged. Trims surrounding space.
 *
 * @param input   the raw URL string from the loader.
 * @param endpoint optional override of the S3 HTTPS endpoint (no trailing slash).
 */
export function resolveLoadUrl(
  input: string,
  endpoint: string = DEFAULT_S3_HTTPS_ENDPOINT,
): string {
  const url = input.trim();
  const m = /^s3:\/\/(.+)$/i.exec(url);
  if (!m) return url;
  const path = m[1].replace(/^\/+/, ""); // strip leading slashes → "bucket/key"
  if (!path) return url; // malformed (s3:// with no bucket) — let the reader error
  return `${endpoint.replace(/\/+$/, "")}/${path}`;
}
