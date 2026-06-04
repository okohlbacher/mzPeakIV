import type React from "react";
import { useStore } from "../state/store";

const MUTED_STYLE: React.CSSProperties = { color: "#888", fontStyle: "italic" };

function Dash() {
  return <span style={MUTED_STYLE}>—</span>;
}

/**
 * Left-panel summary: image dimensions (from grid), spectra count, m/z range,
 * MS levels, and profile/centroid breakdown.
 *
 * Always renders when a file is open (capabilities set). Shows "—" for fields
 * not yet available — grid and stats arrive lazily after first "Show Ion Image".
 */
export function StatsPanel() {
  const stats = useStore((s) => s.stats);
  const grid = useStore((s) => s.grid);
  const capabilities = useStore((s) => s.capabilities);

  if (!capabilities) return null;

  const mzRange = stats?.mzRange ?? null;
  const numSpectra = stats?.numSpectra ?? null;
  const msLevels = stats?.msLevels ?? [];
  const repr = stats?.representationCounts;

  return (
    <section
      aria-label="stats-panel"
      data-testid="stats-panel"
      style={{ padding: "0.5rem", borderTop: "1px solid #eee" }}
    >
      <h3 style={{ margin: "0 0 0.4rem" }}>Image Info</h3>

      <table
        data-testid="stats-table"
        style={{ fontSize: "0.8rem", borderCollapse: "collapse", width: "100%" }}
      >
        <tbody>
          {/* Image dimensions — available once grid is built */}
          {capabilities.isImaging && (
            <tr>
              <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
                Dimensions
              </th>
              <td data-testid="stat-dimensions">
                {grid ? (
                  <>
                    {grid.width.toLocaleString()} × {grid.height.toLocaleString()}
                    <span style={{ color: "#888" }}> px</span>
                  </>
                ) : (
                  <Dash />
                )}
              </td>
            </tr>
          )}

          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              Spectra
            </th>
            <td data-testid="stat-spectra">
              {numSpectra !== null ? numSpectra.toLocaleString() : <Dash />}
            </td>
          </tr>

          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              m/z range
            </th>
            <td data-testid="stat-mz-range">
              {mzRange !== null ? (
                <>
                  {mzRange[0].toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}
                  {" – "}
                  {mzRange[1].toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}
                  {" Da"}
                </>
              ) : (
                <Dash />
              )}
            </td>
          </tr>

          {msLevels.length > 0 && (
            <tr>
              <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
                MS levels
              </th>
              <td data-testid="stat-ms-levels">{msLevels.join(", ")}</td>
            </tr>
          )}

          {repr && (repr.profile > 0 || repr.centroid > 0) && (
            <tr>
              <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
                Mode
              </th>
              <td data-testid="stat-representation">
                {repr.profile > 0 && (
                  <span data-testid="repr-profile">
                    {repr.profile.toLocaleString()} profile
                  </span>
                )}
                {repr.profile > 0 && repr.centroid > 0 && " · "}
                {repr.centroid > 0 && (
                  <span data-testid="repr-centroid">
                    {repr.centroid.toLocaleString()} centroid
                  </span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {capabilities.isImaging && !grid && (
        <p style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.4rem", marginBottom: 0 }}>
          Dimensions and counts will appear after the first ion image loads.
        </p>
      )}
    </section>
  );
}
