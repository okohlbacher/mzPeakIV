import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { useStore } from "../state/store";

/**
 * Right-hand spectrum panel: a numeric spectrum-index selector wired to
 * `selectSpectrum` -> `getSpectrumArrays`, and a uPlot chart mounted imperatively
 * via `useRef` (no React wrapper) plotting m/z vs intensity.
 */
export function SpectrumPanel() {
  const stats = useStore((s) => s.stats);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedSpectrum = useStore((s) => s.selectedSpectrum);
  const selectSpectrum = useStore((s) => s.selectSpectrum);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  const numSpectra = stats?.numSpectra ?? 0;

  // Create the uPlot instance once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const opts: uPlot.Options = {
      width: el.clientWidth || 640,
      height: 360,
      title: "Spectrum",
      scales: { x: { time: false } },
      series: [
        { label: "m/z" },
        {
          label: "intensity",
          stroke: "#1565c0",
          width: 1,
          points: { show: false },
        },
      ],
      axes: [{ label: "m/z" }, { label: "intensity" }],
    };

    const plot = new uPlot(opts, [new Float64Array(0), new Float64Array(0)], el);
    plotRef.current = plot;

    const onResize = () => {
      if (containerRef.current) {
        plot.setSize({
          width: containerRef.current.clientWidth || 640,
          height: 360,
        });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      plot.destroy();
      plotRef.current = null;
    };
  }, []);

  // Feed new data whenever the selected spectrum changes.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    if (!selectedSpectrum) {
      plot.setData([new Float64Array(0), new Float64Array(0)]);
      return;
    }
    // uPlot expects number[]/TypedArray series aligned by x.
    plot.setData([
      selectedSpectrum.mz,
      selectedSpectrum.intensity as unknown as number[],
    ]);
  }, [selectedSpectrum]);

  return (
    <section
      aria-label="spectrum-panel"
      style={{ flex: 1, minWidth: 0, padding: "0.5rem" }}
    >
      <h2>Spectrum</h2>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="spectrum-index">
          Spectrum index (0–{Math.max(numSpectra - 1, 0)}):{" "}
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
            if (Number.isFinite(v) && v >= 0 && v < numSpectra) {
              void selectSpectrum(v);
            }
          }}
        />
        {selectedSpectrum && (
          <span style={{ marginLeft: "0.75rem", color: "#555" }}>
            id: {selectedSpectrum.id} · {selectedSpectrum.mz.length} points
          </span>
        )}
      </div>
      <div ref={containerRef} data-testid="spectrum-plot" />
    </section>
  );
}
