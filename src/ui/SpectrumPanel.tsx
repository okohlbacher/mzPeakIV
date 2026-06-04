import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { useStore } from "../state/store";

/**
 * Compact spectrum panel — sits at the top of the right column.
 * Low vertical profile (~160 px chart) so imaging canvases get most of the space.
 *
 * SPEC-02: draws a translucent amber band over [mz−tolDa, mz+tolDa] when
 * mzWindow is set (hooks.draw, Pitfall 5 safe — reads ref, not state).
 */
export function SpectrumPanel() {
  const mzWindow = useStore((s) => s.mzWindow);
  const stats = useStore((s) => s.stats);
  const grid = useStore((s) => s.grid);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedSpectrum = useStore((s) => s.selectedSpectrum);
  const selectSpectrum = useStore((s) => s.selectSpectrum);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const mzWindowRef = useRef<{ mz: number; tolDa: number } | null>(null);

  const numSpectra = stats?.numSpectra ?? 0;

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

  // Format large intensity values (e.g. 1.2e6 instead of 1200000)
  function fmtIntensity(val: number | null | undefined): string {
    if (val == null) return "";
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(2) + "M";
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "k";
    return val.toFixed(0);
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

    // Initialize with two dummy points so uPlot has valid scale ranges and
    // can compute axis ticks without crashing (null ticks → forEach error).
    const plot = new uPlot(opts, [
      Float64Array.from([0, 1]),
      Float64Array.from([0, 0]),
    ], el);
    plotRef.current = plot;

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
  }, []);

  // Update data when spectrum changes
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    if (!selectedSpectrum) {
      plot.setData([new Float64Array(0), new Float64Array(0)]);
      return;
    }
    plot.setData([
      selectedSpectrum.mz,
      selectedSpectrum.intensity as unknown as number[],
    ]);
  }, [selectedSpectrum]);

  // Sync mzWindow band
  useEffect(() => {
    mzWindowRef.current = mzWindow;
    plotRef.current?.redraw();
  }, [mzWindow]);

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
      {/* Compact header row: heading + index picker + peak count */}
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

        {selectedSpectrum && (
          <span style={{ color: "#555", fontSize: "0.75rem", marginLeft: "auto" }}>
            {selectedSpectrum.mz.length.toLocaleString()} peaks · {selectedSpectrum.id}
          </span>
        )}

        {!selectedSpectrum && numSpectra > 0 && (
          <span style={{ color: "#aaa", fontSize: "0.75rem" }}>
            Click a pixel or enter an index
          </span>
        )}
      </div>

      {/* uPlot chart */}
      <div ref={containerRef} data-testid="spectrum-plot" />
    </section>
  );
}
