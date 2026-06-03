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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* ── Drag-and-drop zone ── */}
      <div
        data-testid="drop-zone"
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
        style={{
          border: `2px dashed ${dragOver ? "#1565c0" : "#bbb"}`,
          borderRadius: "6px",
          padding: "1rem",
          textAlign: "center",
          background: dragOver ? "#e3f2fd" : "#fafafa",
          color: dragOver ? "#1565c0" : "#888",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "border-color 0.15s, background 0.15s",
          fontSize: "0.85rem",
        }}
      >
        Drop a <strong>.mzpeak</strong> file here, or{" "}
        <span style={{ textDecoration: "underline" }}>browse</span>
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

      {/* ── URL input ── */}
      <form
        onSubmit={onUrlSubmit}
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <input
          data-testid="url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/file.mzpeak"
          disabled={loading}
          style={{ flex: 1, padding: "0.35rem" }}
          aria-label="mzpeak-url"
        />
        <button
          data-testid="load-button"
          type="submit"
          disabled={loading || !url.trim()}
        >
          {loading ? "Loading…" : "Load URL"}
        </button>
      </form>
    </div>
  );
}
