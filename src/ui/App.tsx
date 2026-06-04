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
  const grid = useStore((s) => s.grid);

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
            {/* GridDiagnosticsPanel omitted — no grid for non-imaging files */}
          </aside>
          <div style={{ padding: "1.5rem", color: "#555", flex: 1, overflow: "auto" }}>
            <p>This file contains mass spectra but no spatial imaging coordinates.</p>
            <p>Open an imaging file to explore ion images.</p>
            <SpectrumPanel />
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

          {/* Right pane: imaging files stack the TIC ImagingPanel over the
              SpectrumPanel; non-imaging files (grid === null) render the bare
              SpectrumPanel only — no empty canvas (D-06 / UI-SPEC layout). */}
          {grid !== null ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
                overflow: "auto",
              }}
            >
              <ImagingPanel />
              <SpectrumPanel />
            </div>
          ) : (
            <SpectrumPanel />
          )}
        </main>
      )}
    </div>
  );
}
