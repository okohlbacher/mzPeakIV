import { useStore } from "../state/store";

/**
 * Displays per-file aggregate stats: spectrum/entity counts, m/z range (or
 * "not available" — R-02d), MS levels present, and profile/centroid breakdown
 * (R-02b).
 */
export function StatsPanel() {
  const stats = useStore((s) => s.stats);

  if (!stats) return null;

  const { numSpectra, numEntities, mzRange, msLevels, representationCounts } =
    stats;

  return (
    <section
      aria-label="stats-panel"
      data-testid="stats-panel"
      style={{
        padding: "0.5rem",
        borderTop: "1px solid #eee",
      }}
    >
      <h3 style={{ margin: "0 0 0.4rem" }}>Stats</h3>

      <table
        data-testid="stats-table"
        style={{ fontSize: "0.8rem", borderCollapse: "collapse", width: "100%" }}
      >
        <tbody>
          <tr>
            <th
              style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}
            >
              Spectra
            </th>
            <td data-testid="stat-spectra">{numSpectra.toLocaleString()}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              Entities
            </th>
            <td data-testid="stat-entities">{numEntities.toLocaleString()}</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              MS levels
            </th>
            <td data-testid="stat-ms-levels">
              {msLevels.length > 0 ? msLevels.join(", ") : "—"}
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
                  })}{" "}
                  –{" "}
                  {mzRange[1].toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}{" "}
                  m/z
                </>
              ) : (
                <span
                  data-testid="mz-range-unavailable"
                  style={{ color: "#888", fontStyle: "italic" }}
                >
                  m/z range: not available
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "0.75rem", fontWeight: 600 }}>
              Representation
            </th>
            <td data-testid="stat-representation">
              {representationCounts.profile > 0 && (
                <span data-testid="repr-profile">
                  {representationCounts.profile.toLocaleString()} profile
                </span>
              )}
              {representationCounts.profile > 0 &&
                representationCounts.centroid > 0 && " · "}
              {representationCounts.centroid > 0 && (
                <span data-testid="repr-centroid">
                  {representationCounts.centroid.toLocaleString()} centroid
                </span>
              )}
              {representationCounts.profile === 0 &&
                representationCounts.centroid === 0 && (
                  <span style={{ color: "#888", fontStyle: "italic" }}>
                    unknown
                  </span>
                )}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
