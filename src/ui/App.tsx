import { useStore } from "../state/store";
import { FileLoader } from "./FileLoader";
import { ProgressBar } from "./ProgressBar";
import { MetadataPanel } from "./MetadataPanel";
import { StatsPanel } from "./StatsPanel";
import { CapabilitiesPanel } from "./CapabilitiesPanel";
import { SpectrumPanel } from "./SpectrumPanel";

export function App() {
  const stage = useStore((s) => s.stage);
  const error = useStore((s) => s.error);

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
        <FileLoader loading={loading} />
      </header>

      <ProgressBar stage={stage} />

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
          {/* Left inspection column */}
          <aside
            style={{
              width: 400,
              flexShrink: 0,
              overflow: "auto",
              borderRight: "1px solid #ddd",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <MetadataPanel />
            <StatsPanel />
            <CapabilitiesPanel />
          </aside>

          {/* Right spectrum panel */}
          <SpectrumPanel />
        </main>
      )}
    </div>
  );
}
