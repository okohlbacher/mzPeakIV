import { useState, useRef } from "react";
import { useStore } from "../state/store";

// Default demo URL: resolved against Vite's BASE_URL so it works under any
// deployment sub-path (including the GitHub-Pages project page).
const DEFAULT_DEMO_URL = `${import.meta.env.BASE_URL}static/small.mzpeak`;

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

  const [url, setUrl] = useState(DEFAULT_DEMO_URL);
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
            placeholder="https://…/file.mzpeak"
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
    </div>
  );
}
