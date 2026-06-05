import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { useStore } from "../state/store";

/**
 * Compact spectrum panel — sits at the top of the right column.
 * Low vertical profile (~160 px chart) so imaging canvases get most of the space.
 *
 * SPEC-02: draws a translucent amber band over [mz−tolDa, mz+tolDa] when
 * mzWindow is set (hooks.draw, Pitfall 5 safe — reads ref, not state).
 *
 * BL-03: Mean spectrum button — shows the file-wide mean spectrum when no
 * pixel is selected (or explicitly requested). Pixel spectrum takes priority.
 *
 * BL-08: Peak table for centroid spectra — shown below the chart with top-20
 * peaks, sorted by intensity descending.
 *
 * BL-09: Clicking the uPlot chart area fires renderIonImage for the clicked m/z.
 */
export function SpectrumPanel() {
  const mzWindow = useStore((s) => s.mzWindow);
  const stats = useStore((s) => s.stats);
  const grid = useStore((s) => s.grid);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedSpectrum = useStore((s) => s.selectedSpectrum);
  const selectSpectrum = useStore((s) => s.selectSpectrum);
  const meanSpectrum = useStore((s) => s.meanSpectrum);
  const requestMeanSpectrum = useStore((s) => s.requestMeanSpectrum);
  const renderIonImage = useStore((s) => s.renderIonImage);

  // BL-03: whether the user has explicitly dismissed the mean spectrum display
  const [showMean, setShowMean] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const mzWindowRef = useRef<{ mz: number; tolDa: number } | null>(null);

  const numSpectra = stats?.numSpectra ?? 0;

  // Determine which spectrum data to show in the chart:
  // 1. selectedSpectrum (pixel) takes priority
  // 2. meanSpectrum if showMean is true and no pixel selected
  // 3. null → placeholder zeros
  const activeSpectrum =
    selectedSpectrum ?? (showMean && meanSpectrum ? meanSpectrum : null);
  const isMeanActive = !selectedSpectrum && showMean && meanSpectrum !== null;

  // BL-08: detect centroid mode
  const isCentroid =
    (stats?.representationCounts?.centroid ?? 0) > 0 &&
    activeSpectrum !== null;

  // Pixel coordinates heading for imaging mode
  let heading = "Spectrum";
  if (grid !== null && selectedIndex != null) {
    for (const [k, sIdx] of grid.coordToSpectrumIndex) {
      if (sIdx === selectedIndex) {
        const x1 = (k % grid.width) + grid.coordinateBase;
        const y1 = Math.floor(k / grid.width) + grid.coordinateBase;
        heading = `Pixel (${x1}, ${y1})`;
        break;
      }
    }
  }
  if (isMeanActive) {
    heading = "Mean spectrum";
  }

  // Format large intensity values (e.g. 1.2e6 instead of 1200000)
  function fmtIntensity(val: number | null | undefined): string {
    if (val == null) return "";
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + "M";
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "k";
    return val.toFixed(0);
  }

  // BL-03: handle mean spectrum button click
  function handleMeanClick() {
    if (!meanSpectrum) {
      // Kick off the request; show once it arrives
      requestMeanSpectrum();
    }
    setShowMean(true);
  }

  // BL-03: dismiss mean spectrum — revert to pixel spectrum
  function handleDismissMean() {
    setShowMean(false);
  }

  // Create uPlot once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height: 150,
      title: undefined, // title shown in the section heading instead
      scales: { x: { time: false } },
      series: [
        {
          label: "m/z",
          value: (_u, v) => (v == null ? "" : v.toFixed(4)),
        },
        {
          label: "Intensity",
          stroke: "#1565c0",
          fill: "rgba(21,101,192,0.08)",
          width: 1.5,
          points: { show: false },
          value: (_u, v) => fmtIntensity(v),
        },
      ],
      axes: [
        {
          label: "m/z",
          labelFont: "11px system-ui",
          font: "10px system-ui",
          labelSize: 18,
          size: 38,
          values: (_u, ticks) =>
            (ticks ?? []).map((t) => (t >= 1000 ? t.toFixed(1) : t.toFixed(2))),
        },
        {
          label: "Intensity",
          labelFont: "11px system-ui",
          font: "10px system-ui",
          labelSize: 18,
          size: 52,
          values: (_u, ticks) => (ticks ?? []).map((t) => fmtIntensity(t)),
        },
      ],
      padding: [4, 8, 0, 0],
      cursor: { show: true },
      hooks: {
        draw: [
          (u: uPlot) => {
            const w = mzWindowRef.current;
            if (!w) return;
            const xLo = u.valToPos(w.mz - w.tolDa, "x", true);
            const xHi = u.valToPos(w.mz + w.tolDa, "x", true);
            const { ctx } = u;
            ctx.save();
            ctx.fillStyle = "rgba(255,200,0,0.25)";
            ctx.fillRect(xLo, u.bbox.top, xHi - xLo, u.bbox.height);
            ctx.restore();
          },
        ],
      },
    };

    // Use (0,0)→(1500,0) as placeholder: valid x-range, zero intensities.
    const plot = new uPlot(opts, [
      Float64Array.from([0, 1500]),
      Float64Array.from([0, 0]),
    ], el);
    plotRef.current = plot;

    // BL-09: clicking the chart fires renderIonImage for the clicked m/z.
    // `plot.over` is the transparent overlay element uPlot renders on top of
    // the canvas — it handles cursor/selection events and accepts our click.
    plot.over.addEventListener("click", (e: MouseEvent) => {
      const mz = plot.posToVal(e.offsetX, "x");
      if (Number.isFinite(mz) && mz > 0) {
        const tolDa = mzWindowRef.current?.tolDa ?? 0.3;
        renderIonImage(mz, tolDa);
      }
    });

    const onResize = () => {
      if (containerRef.current) {
        plot.setSize({ width: containerRef.current.clientWidth || 600, height: 150 });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      plot.destroy();
      plotRef.current = null;
    };
    // renderIonImage is stable (Zustand action ref never changes), but we can't
    // list it as a dep without recreating the plot on every render.  Use a ref
    // to keep the closure fresh without triggering recreations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep renderIonImage accessible inside the click handler via a ref so the
  // uPlot closure created in the one-time effect always calls the latest version.
  const renderIonImageRef = useRef(renderIonImage);
  useEffect(() => {
    renderIonImageRef.current = renderIonImage;
  }, [renderIonImage]);

  // Also keep mzWindowRef up to date (already synced below) — no extra work needed.

  // Update data when active spectrum changes (BL-03: also updates on meanSpectrum)
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    if (!activeSpectrum) {
      plot.setData([Float64Array.from([0, 1500]), Float64Array.from([0, 0])]);
      return;
    }
    plot.setData([
      activeSpectrum.mz,
      activeSpectrum.intensity as unknown as number[],
    ]);
  }, [activeSpectrum]);

  // Sync mzWindow band
  useEffect(() => {
    mzWindowRef.current = mzWindow;
    plotRef.current?.redraw();
  }, [mzWindow]);

  // BL-08: build peak table data from activeSpectrum in centroid mode
  const peakRows: { mz: number; intensity: number; rel: number }[] = [];
  let extraPeakCount = 0;
  if (isCentroid && activeSpectrum) {
    const mzArr = activeSpectrum.mz;
    const intArr = activeSpectrum.intensity;
    const maxInt = Math.max(...Array.from(intArr));
    // Build index array sorted by intensity descending
    const indices = Array.from({ length: mzArr.length }, (_, i) => i);
    indices.sort((a, b) => intArr[b] - intArr[a]);
    const topN = 20;
    const shown = indices.slice(0, topN);
    extraPeakCount = Math.max(0, indices.length - topN);
    for (const i of shown) {
      peakRows.push({
        mz: mzArr[i],
        intensity: intArr[i],
        rel: maxInt > 0 ? (intArr[i] / maxInt) * 100 : 0,
      });
    }
  }

  // BL-08: copy CSV to clipboard
  function handleCopyCSV() {
    if (!activeSpectrum) return;
    const lines = ["mz,intensity"];
    for (let i = 0; i < activeSpectrum.mz.length; i++) {
      lines.push(`${activeSpectrum.mz[i].toFixed(4)},${activeSpectrum.intensity[i]}`);
    }
    void navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <section
      aria-label="spectrum-panel"
      data-testid="spectrum-panel"
      style={{
        flexShrink: 0,
        padding: "0.4rem 0.5rem 0.2rem",
        borderBottom: "1px solid #ddd",
        background: "#fafafa",
      }}
    >
      {/* Compact header row: heading + index picker + mean button + peak count */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.85rem", color: "#333" }}>{heading}</strong>

        {numSpectra > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
            <label htmlFor="spectrum-index" style={{ color: "#666" }}>
              index
            </label>
            <input
              id="spectrum-index"
              data-testid="spectrum-index"
              type="number"
              min={0}
              max={Math.max(numSpectra - 1, 0)}
              value={selectedIndex ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v < numSpectra)
                  void selectSpectrum(v);
              }}
              style={{ width: "60px", padding: "0.1rem 0.25rem", fontSize: "0.8rem" }}
            />
            <span style={{ color: "#888", fontSize: "0.75rem" }}>
              / {numSpectra.toLocaleString()}
            </span>
          </span>
        )}

        {/* BL-03: Mean spectrum button */}
        {numSpectra > 0 && (
          <button
            data-testid="mean-spectrum-btn"
            onClick={handleMeanClick}
            title="Compute and display mean spectrum across all pixels"
            style={{
              fontSize: "0.75rem",
              padding: "0.1rem 0.45rem",
              cursor: "pointer",
              background: isMeanActive ? "#1565c0" : "#e8eaf6",
              color: isMeanActive ? "#fff" : "#333",
              border: "1px solid " + (isMeanActive ? "#1565c0" : "#9fa8da"),
              borderRadius: "3px",
              lineHeight: "1.4",
            }}
          >
            ⌀ Mean
          </button>
        )}

        {/* BL-03: Dismiss mean spectrum */}
        {isMeanActive && (
          <button
            data-testid="mean-spectrum-dismiss"
            onClick={handleDismissMean}
            title="Dismiss mean spectrum"
            style={{
              fontSize: "0.75rem",
              padding: "0.1rem 0.35rem",
              cursor: "pointer",
              background: "#fce4ec",
              color: "#c62828",
              border: "1px solid #ef9a9a",
              borderRadius: "3px",
              lineHeight: "1.4",
            }}
          >
            ×
          </button>
        )}

        {activeSpectrum && (
          <span style={{ color: "#555", fontSize: "0.75rem", marginLeft: "auto" }}>
            {activeSpectrum.mz.length.toLocaleString()} peaks · {activeSpectrum.id}
          </span>
        )}

        {!activeSpectrum && numSpectra > 0 && (
          <span style={{ color: "#aaa", fontSize: "0.75rem" }}>
            Click a pixel or enter an index
          </span>
        )}
      </div>

      {/* uPlot chart */}
      <div ref={containerRef} data-testid="spectrum-plot" />

      {/* BL-08: Peak table (centroid mode only) */}
      {isCentroid && peakRows.length > 0 && (
        <div style={{ marginTop: "0.4rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555", fontWeight: 600 }}>
              Top peaks
            </span>
            <button
              data-testid="copy-csv-btn"
              onClick={handleCopyCSV}
              title="Copy all peaks as CSV"
              style={{
                fontSize: "0.7rem",
                padding: "0.05rem 0.3rem",
                cursor: "pointer",
                background: "#f5f5f5",
                color: "#555",
                border: "1px solid #ccc",
                borderRadius: "3px",
              }}
            >
              Copy CSV
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              data-testid="peak-table"
              style={{
                borderCollapse: "collapse",
                fontSize: "0.72rem",
                width: "100%",
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr style={{ background: "#e8eaf6" }}>
                  <th style={thStyle}>m/z</th>
                  <th style={thStyle}>Intensity</th>
                  <th style={thStyle}>Rel%</th>
                </tr>
              </thead>
              <tbody>
                {peakRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "#fff" : "#f9f9fb" }}
                  >
                    <td style={tdStyle}>{row.mz.toFixed(4)}</td>
                    <td style={tdStyle}>{fmtIntensity(row.intensity)}</td>
                    <td style={tdStyle}>{row.rel.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {extraPeakCount > 0 && (
            <div style={{ fontSize: "0.7rem", color: "#888", marginTop: "0.15rem", textAlign: "right" }}>
              ... {extraPeakCount.toLocaleString()} more peaks
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "0.1rem 0.35rem",
  fontWeight: 600,
  color: "#3949ab",
  borderBottom: "1px solid #c5cae9",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "0.07rem 0.35rem",
  fontVariantNumeric: "tabular-nums",
  color: "#333",
};
