import { useState } from "react";

import { useStore } from "../state/store";
import { MetadataPanel } from "./MetadataPanel";
import { SpectrumPanel } from "./SpectrumPanel";

// Default to the bundled demo so the happy path is one click. Resolved against
// Vite's BASE_URL so it works under the GitHub-Pages subpath too.
const DEFAULT_DEMO_URL = `${import.meta.env.BASE_URL}static/small.mzpeak`;

const STAGE_LABEL: Record<string, string> = {
  idle: "Idle",
  "zip-index": "Reading ZIP index…",
  manifest: "Parsing manifest…",
  metadata: "Loading metadata…",
  ready: "Ready",
  error: "Error",
};

export function App() {
  const stage = useStore((s) => s.stage);
  const error = useStore((s) => s.error);
  const openUrl = useStore((s) => s.openUrl);

  const [url, setUrl] = useState(DEFAULT_DEMO_URL);
  const loading =
    stage === "zip-index" || stage === "manifest" || stage === "metadata";

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <header style={{ padding: "0.75rem", borderBottom: "1px solid #ddd" }}>
        <h1 style={{ margin: "0 0 0.5rem" }}>mzPeakIV</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void openUrl(url);
          }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            data-testid="url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1, padding: "0.35rem" }}
            aria-label="mzpeak-url"
          />
          <button data-testid="load-button" type="submit" disabled={loading}>
            {loading ? "Loading…" : "Load"}
          </button>
          <span data-testid="stage" style={{ color: "#666" }}>
            {STAGE_LABEL[stage] ?? stage}
          </span>
        </form>
      </header>

      {stage === "error" && (
        <div
          data-testid="error-banner"
          role="alert"
          style={{
            background: "#fdecea",
            color: "#611a15",
            border: "1px solid #f5c6cb",
            padding: "0.75rem 1rem",
            margin: "0.5rem",
            fontWeight: 600,
          }}
        >
          Failed to load file: {error}
        </div>
      )}

      {stage === "ready" && (
        <main style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <MetadataPanel />
          <SpectrumPanel />
        </main>
      )}
    </div>
  );
}
