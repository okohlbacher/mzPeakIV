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
  // Keep renderIonImage reachable from the one-time uPlot click closure without
  // recreating the plot (Zustand action ref is stable; ref keeps it fresh).
  const renderIonImageRef = useRef(renderIonImage);
  renderIonImageRef.current = renderIonImage;

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

    // Measure the plot container so uPlot fills the dock (header above, peak
    // table below for centroid). Falls back to sensible defaults pre-layout.
    const measure = () => ({
      width: el.clientWidth || 600,
      height: Math.max(el.clientHeight || 0, 96),
    });
    const sans = "11px 'IBM Plex Sans', system-ui";
    const mono = "10px 'IBM Plex Mono', ui-monospace, monospace";
    const init = measure();

    const opts: uPlot.Options = {
      width: init.width,
      height: init.height,
      title: undefined, // title shown in the dock heading instead
      scales: { x: { time: false } },
      series: [
        {
          label: "m/z",
          value: (_u, v) => (v == null ? "" : v.toFixed(4)),
        },
        {
          label: "Intensity",
          stroke: "var(--spectrum-line, #3b54da)",
          fill: "var(--spectrum-fill, rgba(59,84,218,0.09))",
          width: 1.4,
          points: { show: false },
          value: (_u, v) => fmtIntensity(v),
        },
      ],
      axes: [
        {
          label: "m/z",
          labelFont: sans,
          font: mono,
          stroke: "var(--text-muted, #6b757e)",
          labelSize: 18,
          size: 38,
          values: (_u, ticks) =>
            (ticks ?? []).map((t) => (t >= 1000 ? t.toFixed(1) : t.toFixed(2))),
        },
        {
          label: "Intensity",
          labelFont: sans,
          font: mono,
          stroke: "var(--text-muted, #6b757e)",
          labelSize: 18,
          size: 52,
          values: (_u, ticks) => (ticks ?? []).map((t) => fmtIntensity(t)),
        },
      ],
      padding: [6, 10, 0, 0],
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
            ctx.fillStyle = "rgba(255,200,0,0.25)"; // --warning-band
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
    // `plot.over` is the transparent overlay uPlot renders over the canvas.
    // Call through the ref so the latest store action is always used.
    plot.over.addEventListener("click", (e: MouseEvent) => {
      const mz = plot.posToVal(e.offsetX, "x");
      if (Number.isFinite(mz) && mz > 0) {
        const tolDa = mzWindowRef.current?.tolDa ?? 0.3;
        renderIonImageRef.current(mz, tolDa);
      }
    });

    // ResizeObserver tracks the dock reflow (rail toggle, responsive, font load)
    // — there was no observer before; window-resize alone missed flex reflows
    // with no viewport change. setSize with measured width AND height.
    const ro = new ResizeObserver(() => {
      const { width, height } = measure();
      if (width > 0 && height > 0) plot.setSize({ width, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // renderIonImage is read via renderIonImageRef; mount-once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      {/* Dock header: heading + sub-meta + index picker + mean toggle */}
      <div className="dock__head">
        <span className="dock__title">{heading}</span>

        {activeSpectrum && (
          <span className="dock__meta">
            {activeSpectrum.mz.length.toLocaleString()} pts · {activeSpectrum.id}
          </span>
        )}
        {!activeSpectrum && numSpectra > 0 && (
          <span className="dock__meta" style={{ color: "var(--text-faint)" }}>
            click a pixel or enter an index
          </span>
        )}

        <span className="dock__spacer" />

        {numSpectra > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}>
            <label htmlFor="spectrum-index" className="dock__meta">index</label>
            <span className="mz-input mz-input--sm" style={{ width: 72 }}>
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
              />
            </span>
            <span className="dock__meta" style={{ color: "var(--text-faint)" }}>
              / {numSpectra.toLocaleString()}
            </span>
          </span>
        )}

        {numSpectra > 0 && (
          <button
            data-testid="mean-spectrum-btn"
            className={`mz-btn mz-btn--sm${isMeanActive ? "" : " mz-btn--secondary"}`}
            onClick={handleMeanClick}
            title="Compute and display the mean spectrum across all pixels"
          >
            ⌀ Mean
          </button>
        )}
        {isMeanActive && (
          <button
            data-testid="mean-spectrum-dismiss"
            className="mz-btn mz-btn--sm mz-btn--ghost"
            onClick={handleDismissMean}
            title="Dismiss mean spectrum"
            aria-label="Dismiss mean spectrum"
          >
            ×
          </button>
        )}
      </div>

      {/* uPlot chart — flex:1 so the ResizeObserver measures a real height. */}
      <div
        ref={containerRef}
        data-testid="spectrum-plot"
        className="dock__plot"
        style={{ minHeight: 110 }}
      />

      {/* BL-08: Peak table (centroid mode only) */}
      {isCentroid && peakRows.length > 0 && (
        <div className="mz-scroll" style={{ flexShrink: 0, maxHeight: 120, overflow: "auto", marginTop: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
            <span className="mz-overline">Top peaks</span>
            <button
              data-testid="copy-csv-btn"
              className="mz-btn mz-btn--ghost mz-btn--sm"
              onClick={handleCopyCSV}
              title="Copy all peaks as CSV"
            >
              Copy CSV
            </button>
          </div>
          <table
            data-testid="peak-table"
            style={{ borderCollapse: "collapse", fontSize: "var(--text-2xs)", width: "100%", tableLayout: "fixed" }}
          >
            <thead>
              <tr>
                <th style={thStyle}>m/z</th>
                <th style={thStyle}>Intensity</th>
                <th style={thStyle}>Rel%</th>
              </tr>
            </thead>
            <tbody>
              {peakRows.map((row, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{row.mz.toFixed(4)}</td>
                  <td style={tdStyle}>{fmtIntensity(row.intensity)}</td>
                  <td style={tdStyle}>{row.rel.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {extraPeakCount > 0 && (
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)", marginTop: "var(--space-1)", textAlign: "right" }}>
              … {extraPeakCount.toLocaleString()} more peaks
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "var(--space-1) var(--space-3)",
  fontWeight: 600,
  fontFamily: "var(--font-mono)",
  color: "var(--indigo-600)",
  borderBottom: "1px solid var(--border-soft)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "var(--space-1) var(--space-3)",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text-body)",
};
