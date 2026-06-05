import { useStore } from "../state/store";
import { Panel, StatRow, Badge } from "./ds";

/**
 * Inspector "Image Info" panel: dimensions (from grid), spectra count, m/z
 * range, MS levels, profile/centroid mode. Reskinned to Panel + StatRow + Badge.
 * Renders when a file is open (capabilities set). Missing fields show an em-dash
 * via StatRow's null fallback — grid/stats arrive lazily.
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

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

  return (
    <Panel title="Image Info" testid="stats-panel">
      <div data-testid="stats-table">
        {capabilities.isImaging && (
          <StatRow
            label="Dimensions"
            testid="stat-dimensions"
            value={
              grid ? (
                <>
                  {grid.width.toLocaleString()} × {grid.height.toLocaleString()}{" "}
                  <em>px</em>
                </>
              ) : null
            }
          />
        )}

        <StatRow
          label="Spectra"
          testid="stat-spectra"
          value={numSpectra !== null ? numSpectra.toLocaleString() : null}
        />

        <StatRow
          label="m/z range"
          testid="stat-mz-range"
          value={
            mzRange !== null ? (
              <>
                {fmt(mzRange[0])} – {fmt(mzRange[1])} <em>Da</em>
              </>
            ) : (
              // Non-empty even when absent — e2e asserts this cell is never blank.
              "not available"
            )
          }
        />

        {msLevels.length > 0 && (
          <StatRow label="MS levels" testid="stat-ms-levels" value={msLevels.join(", ")} />
        )}

        {repr && (repr.profile > 0 || repr.centroid > 0) && (
          <StatRow
            label="Mode"
            testid="stat-representation"
            value={
              <span style={{ display: "inline-flex", gap: "var(--space-3)" }}>
                {repr.profile > 0 && (
                  <Badge tone="info" mono>
                    <span data-testid="repr-profile">
                      {repr.profile.toLocaleString()} profile
                    </span>
                  </Badge>
                )}
                {repr.centroid > 0 && (
                  <Badge tone="accent" mono>
                    <span data-testid="repr-centroid">
                      {repr.centroid.toLocaleString()} centroid
                    </span>
                  </Badge>
                )}
              </span>
            }
          />
        )}
      </div>

      {capabilities.isImaging && !grid && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-faint)",
            marginTop: "var(--space-3)",
            marginBottom: 0,
          }}
        >
          Dimensions and counts appear after the first ion image loads.
        </p>
      )}
    </Panel>
  );
}
