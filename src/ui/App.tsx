import { useStore } from "../state/store";
import { FileLoader } from "./FileLoader";
import { ProgressBar } from "./ProgressBar";
import { ErrorBanner } from "./ErrorBanner";
import { MetadataPanel } from "./MetadataPanel";
import { StatsPanel } from "./StatsPanel";
import { CapabilitiesPanel } from "./CapabilitiesPanel";
import { GridDiagnosticsPanel } from "./GridDiagnosticsPanel";
import { SpectrumPanel } from "./SpectrumPanel";
import { ImagingPanel } from "./ImagingPanel";

export function App() {
  const stage = useStore((s) => s.stage);
  const error = useStore((s) => s.error);
  const isImaging = useStore((s) => s.capabilities?.isImaging ?? false);

  const loading =
    stage === "zip-index" ||
    stage === "manifest" ||
    stage === "metadata" ||
    stage === "grid" ||
    stage === "tic";

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
        {/* Hidden stage sentinel — keeps the skeleton + local-file e2e tests working.
            The visible stage readout is provided by ProgressBar. */}
        <span
          data-testid="stage"
          aria-hidden="true"
          style={{ display: "none" }}
        >
          {stage === "zip-index"
            ? "Reading ZIP index…"
            : stage === "manifest"
              ? "Parsing manifest…"
              : stage === "metadata"
                ? "Loading metadata…"
                : stage === "grid"
                  ? "Building imaging grid…"
                  : stage === "tic"
                    ? "Building TIC image…"
                    : stage === "no-imaging"
                      ? "No Imaging Data"
                      : stage === "ready"
                        ? "Ready"
                        : stage === "error"
                          ? "Error"
                          : "Idle"}
        </span>
      </header>

      <ProgressBar stage={stage} />

      {stage === "error" && error && <ErrorBanner error={error} />}

      {stage === "no-imaging" && (
        <main style={{ display: "flex", flex: 1, minHeight: 0 }}>
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
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
            <SpectrumPanel />
            <div style={{ padding: "1rem", color: "#888", fontSize: "0.85rem" }}>
              No spatial imaging coordinates — spectrum browser only.
            </div>
          </div>
        </main>
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
            <GridDiagnosticsPanel />
          </aside>

          {/* Right pane: spectrum always at TOP (compact), imaging panels below */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {/* Compact spectrum panel — low vertical profile, always visible */}
            <SpectrumPanel />

            {/* Imaging canvases fill remaining space */}
            {isImaging ? (
              <div style={{ flex: 1, overflow: "auto" }}>
                <ImagingPanel />
              </div>
            ) : (
              /* Non-imaging: extra padding/info where imaging panel would be */
              <div style={{ flex: 1, padding: "1rem", color: "#888", fontSize: "0.85rem" }}>
                This file contains mass spectra but no spatial imaging coordinates.
                <br />Open an imaging file to explore ion images.
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
