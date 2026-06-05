import { useStore } from "../state/store";
import type { CoordSourceStrategy } from "../imaging/types";
import { Panel, StatRow, Badge } from "./ds";

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
 * Grid diagnostics readout (IMG-03), reskinned to Panel + StatRow + Badge.
 *  - capabilities not set → null.
 *  - imaging file, grid present → collapsible Panel of diagnostic StatRows; an
 *    anomaly (sparse fill / duplicates / discovery disagreement) shows a warning
 *    Badge in the title.
 *  - non-imaging file (grid === null, isImaging false) → calm muted notice (D-04).
 */
export function GridDiagnosticsPanel() {
  const grid = useStore((s) => s.grid);
  const capabilities = useStore((s) => s.capabilities);

  if (!capabilities) return null;

  if (grid === null && capabilities.isImaging === false) {
    return (
      <Panel title="Grid" testid="grid-panel">
        <span
          data-testid="grid-not-imaging-notice"
          style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}
        >
          Not imaging data — no spatial coordinates found
        </span>
      </Panel>
    );
  }

  if (grid === null) return null;

  const { width, height, filledCount, totalCells, pixelSizeUm, diagnostics } = grid;
  const { uniqueCoordCount, spectrumCount, missingCount, duplicateCount } = diagnostics;

  const pct = Math.round((filledCount / totalCells) * 100);
  const anomaly =
    filledCount < totalCells * 0.95 ||
    duplicateCount > 0 ||
    diagnostics.discoveryDisagreement != null;

  return (
    <Panel
      title="Grid"
      testid="grid-panel"
      count={
        anomaly ? (
          <span data-testid="grid-anomaly-warning">
            <Badge tone="warning" dot>
              {pct}%
            </Badge>
          </span>
        ) : (
          `${pct}%`
        )
      }
    >
      <div data-testid="grid-diagnostics-table">
        <StatRow
          label="Dimensions"
          testid="grid-row-dimensions"
          value={
            <>
              {width.toLocaleString()} × {height.toLocaleString()} <em>px</em>
            </>
          }
        />
        <StatRow
          label="Fill"
          testid="grid-row-fill"
          value={
            <>
              {filledCount.toLocaleString()} / {totalCells.toLocaleString()}{" "}
              <em>px ({pct}%)</em>
            </>
          }
        />
        <StatRow
          label="Spectra"
          testid="grid-row-spectra"
          value={
            <>
              {uniqueCoordCount.toLocaleString()} <em>uniq /</em>{" "}
              {spectrumCount.toLocaleString()}
            </>
          }
        />
        <StatRow
          label="Missing"
          testid="grid-row-missing"
          value={
            <>
              {missingCount.toLocaleString()} <em>px</em>
            </>
          }
        />
        <StatRow
          label="Duplicates"
          testid="grid-row-duplicates"
          value={
            duplicateCount > 0 ? (
              <Badge tone="warning">{duplicateCount.toLocaleString()} px</Badge>
            ) : (
              <>
                {duplicateCount.toLocaleString()} <em>px</em>
              </>
            )
          }
        />
        <StatRow
          label="Pixel size"
          testid="grid-row-pixel-size"
          value={
            pixelSizeUm ? (
              <>
                {pixelSizeUm.x.toLocaleString()} × {pixelSizeUm.y.toLocaleString()}{" "}
                <em>µm</em>
              </>
            ) : (
              "1:1 (assumed)"
            )
          }
        />
        <StatRow
          label="Coord source"
          testid="grid-row-coord-source"
          value={coordSourceLabel(grid.coordSourceStrategy)}
        />
        <StatRow
          label="Discovery"
          testid="grid-row-discovery"
          value={
            diagnostics.discoveryDisagreement ? (
              <Badge tone="warning">disagree</Badge>
            ) : (
              "agrees"
            )
          }
        />
      </div>
    </Panel>
  );
}
