import { useState } from "react";

import { useStore } from "../state/store";
import type { CoordSourceStrategy } from "../imaging/types";

// Warning amber (caution, NOT error). Reserved by the UI-SPEC for anomalies:
// sparse fill, duplicates, or a discovery-vs-observed disagreement.
const WARNING = "#8a6d00";
const MUTED = "#888";

/** Human-readable label for the winning CoordSource strategy (UI-SPEC copy). */
function coordSourceLabel(strategy: CoordSourceStrategy): string {
  switch (strategy) {
    case "promoted-columns":
      return "promoted scan columns";
    case "cv-params":
      return "scan.parameters cvParams";
    case "id-parse":
      return "spectrum id parse";
  }
}

/**
 * Grid diagnostics readout (IMG-03). Inline expandable section cloned from
 * CapabilitiesPanel: a compact summary line that toggles a diagnostics table.
 *
 * Three render states:
 *  - `capabilities` not yet set → null (identical to sibling panels).
 *  - imaging file, grid present → compact line + expandable table.
 *  - non-imaging file (grid === null) → single muted notice, NO expand, NO table,
 *    NEVER the ErrorBanner (D-04/D-06). A non-imaging file is a valid outcome.
 */
export function GridDiagnosticsPanel() {
  const grid = useStore((s) => s.grid);
  const capabilities = useStore((s) => s.capabilities);
  const [expanded, setExpanded] = useState(false);

  if (!capabilities) return null;

  // Non-imaging branch: calm muted notice when the file has no spatial coordinates (D-04).
  // Guard on capabilities.isImaging === false to distinguish "not imaging data" from
  // "imaging file where grid building failed" (the latter shows nothing until an error surfaces).
  if (grid === null && capabilities.isImaging === false) {
    return (
      <section
        aria-label="grid-panel"
        data-testid="grid-panel"
        style={{ padding: "0.5rem", borderTop: "1px solid #eee" }}
      >
        <h3 style={{ margin: "0 0 0.4rem" }}>Grid</h3>
        <span data-testid="grid-not-imaging-notice" style={{ color: MUTED }}>
          Not imaging data — no spatial coordinates found
        </span>
      </section>
    );
  }

  // Grid is null but file is (or may be) imaging — building may still be in progress or failed.
  // Return null to avoid a misleading "not imaging" notice; store.error surfaces failures.
  if (grid === null) return null;

  const { width, height, filledCount, totalCells, pixelSizeUm, diagnostics } =
    grid;
  const { uniqueCoordCount, spectrumCount, missingCount, duplicateCount } =
    diagnostics;

  const pct = Math.round((filledCount / totalCells) * 100);
  const anomaly =
    filledCount < totalCells * 0.95 ||
    duplicateCount > 0 ||
    diagnostics.discoveryDisagreement != null;

  const summaryColor = anomaly ? WARNING : undefined;

  return (
    <section
      aria-label="grid-panel"
      data-testid="grid-panel"
      style={{ padding: "0.5rem", borderTop: "1px solid #eee" }}
    >
      <h3 style={{ margin: "0 0 0.4rem" }}>Grid</h3>

      <div
        data-testid="grid-summary-line"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            setExpanded((e) => !e);
          }
        }}
        style={{
          cursor: "pointer",
          fontSize: "0.8rem",
          color: summaryColor,
        }}
      >
        <span data-testid="grid-expand-toggle" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>{" "}
        {anomaly && (
          <span data-testid="grid-anomaly-warning" style={{ color: WARNING }}>
            ⚠{" "}
          </span>
        )}
        Grid: {width.toLocaleString()}×{height.toLocaleString()} —{" "}
        {filledCount.toLocaleString()}/{totalCells.toLocaleString()} px filled (
        {pct}%)
      </div>

      {expanded && (
        <table
          data-testid="grid-diagnostics-table"
          style={{
            fontSize: "0.8rem",
            borderCollapse: "collapse",
            width: "100%",
            marginTop: "0.4rem",
          }}
        >
          <tbody>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Dimensions
              </th>
              <td data-testid="grid-row-dimensions">
                {width.toLocaleString()} × {height.toLocaleString()} px
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Fill
              </th>
              <td data-testid="grid-row-fill">
                {filledCount.toLocaleString()} / {totalCells.toLocaleString()}{" "}
                pixels ({pct}% filled)
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Spectra
              </th>
              <td data-testid="grid-row-spectra">
                {uniqueCoordCount.toLocaleString()} unique coords /{" "}
                {spectrumCount.toLocaleString()} spectra
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Missing
              </th>
              <td data-testid="grid-row-missing">
                {missingCount.toLocaleString()} pixels
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Duplicates
              </th>
              <td
                data-testid="grid-row-duplicates"
                style={duplicateCount > 0 ? { color: WARNING } : undefined}
              >
                {duplicateCount.toLocaleString()} pixels
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Pixel size
              </th>
              <td data-testid="grid-row-pixel-size">
                {pixelSizeUm ? (
                  `${pixelSizeUm.x.toLocaleString()} × ${pixelSizeUm.y.toLocaleString()} µm`
                ) : (
                  <span style={{ color: MUTED }}>
                    1:1 (assumed — no IMS:1000046/47)
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Coord source
              </th>
              <td data-testid="grid-row-coord-source">
                {coordSourceLabel(grid.coordSourceStrategy)}
              </td>
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Discovery check
              </th>
              <td data-testid="grid-row-discovery">
                {diagnostics.discoveryDisagreement ? (
                  <span style={{ color: WARNING }}>
                    {diagnostics.discoveryDisagreement}
                  </span>
                ) : (
                  <span style={{ color: MUTED }}>agrees</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
