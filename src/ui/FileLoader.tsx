import { useState, useRef } from "react";
import { useStore } from "../state/store";

// Default demo URL — a small file bundled SAME-ORIGIN under the app's own base
// path (mirrors how the upstream mzpeakts demo loads `static/small.mzpeak`).
// Same-origin requests never hit CORS, so this loads instantly and offline. The
// BASE_URL prefix keeps it correct under the GitHub-Pages project sub-path.
const DEFAULT_DEMO_URL = `${import.meta.env.BASE_URL}static/small.mzpeak`;

// Optional remote example: the full PXD001283 HR2MSI imaging dataset on object
// storage. The browser streams it via HTTP Range, so the bucket must serve it
// with public read, byte-range support, and CORS allowing this origin
// (GET + Range; expose Content-Range / Accept-Ranges) — see BL-CORS. Until then
// this example surfaces a clear network/CORS error rather than loading.
const REMOTE_EXAMPLE = {
  label: "HR2MSI imaging example",
  url: "https://object.storage.eu01.onstackit.cloud/v09/demo/PXD001283-HR2MSI-urinary-bladder_HR2MSImouseurinarybladderS096.mzpeak",
};

interface Props {
  /** Whether a load is already in progress (disables inputs). */
  loading: boolean;
}

/**
 * Unified loader zone: file picker + drag-and-drop zone + URL input.
 *
 * - `<input type=file>` — standard file picker (used by the Playwright test via
 *   `page.setInputFiles`; also satisfies R-02a / LOAD-01).
 * - Drag-and-drop zone — accepts the first `.mzpeak` file dropped.
 * - URL `<input>` — loads from a remote URL (the original walking-skeleton path).
 *
 * Calls `store.openFile` for local files and `store.openUrl` for URL loads.
 */
export function FileLoader({ loading }: Props) {
  const openFile = useStore((s) => s.openFile);
  const openUrl = useStore((s) => s.openUrl);

  // Start empty (paste your own URL); the demos load via the chips below. A
  // pre-filled long URL just rendered as a confusing truncated path in the box.
  const [url, setUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File picker / drag-drop shared handler ──────────────────────────────
  function handleFile(file: File) {
    if (!file.name.endsWith(".mzpeak")) {
      alert("Please select a .mzpeak file.");
      return;
    }
    void openFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset value so picking the same file again still triggers onChange.
    e.target.value = "";
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── URL submit ─────────────────────────────────────────────────────────
  function onUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim()) void openUrl(url.trim());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", width: "100%" }}>
      {/* ── Drag-and-drop zone ── */}
      <div
        className="drop"
        data-testid="drop-zone"
        data-over={dragOver || undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !loading && fileInputRef.current?.click()}
        role="button"
        aria-label="Drop a .mzpeak file here or click to browse"
        tabIndex={loading ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !loading)
            fileInputRef.current?.click();
        }}
        style={loading ? { cursor: "not-allowed", opacity: 0.6 } : undefined}
      >
        <span>
          Drop a <strong>.mzpeak</strong> file here, or <strong>browse</strong>
        </span>
      </div>

      {/* Hidden file input — activated by the drop zone click handler above.
          Playwright uses page.setInputFiles() on this element (R-02a). */}
      <input
        ref={fileInputRef}
        data-testid="file-input"
        type="file"
        accept=".mzpeak"
        onChange={onFileChange}
        disabled={loading}
        style={{ display: "none" }}
        aria-label="mzpeak-file"
      />

      {/* ── URL row ── */}
      <form className="loader__url" onSubmit={onUrlSubmit}>
        <span className="mz-input">
          <input
            data-testid="url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… or s3://bucket/key.mzpeak"
            disabled={loading}
            aria-label="mzpeak-url"
          />
        </span>
        <button
          data-testid="load-button"
          type="submit"
          className="mz-btn mz-btn--secondary"
          disabled={loading || !url.trim()}
        >
          {loading ? "Loading…" : "Load URL"}
        </button>
      </form>

      {/* One-click example datasets. */}
      <div className="loader__demos">
        <button
          type="button"
          className="chip"
          data-testid="example-small"
          disabled={loading}
          title="Small bundled demo (non-imaging, loads instantly)"
          onClick={() => !loading && void openUrl(DEFAULT_DEMO_URL)}
        >
          Small demo
        </button>
        <button
          type="button"
          className="chip"
          data-testid="example-remote"
          disabled={loading}
          title={REMOTE_EXAMPLE.url}
          onClick={() => {
            setUrl(REMOTE_EXAMPLE.url);
            if (!loading) void openUrl(REMOTE_EXAMPLE.url);
          }}
        >
          {REMOTE_EXAMPLE.label}
        </button>
      </div>

      {/* The imaging example streams a ~294 MB file over the network; downloading
          it once and opening it locally renders ion images far faster. */}
      <a
        className="loader__download"
        data-testid="download-demo"
        href={REMOTE_EXAMPLE.url}
        download
      >
        ↓ Download demo data for faster access
      </a>
    </div>
  );
}
