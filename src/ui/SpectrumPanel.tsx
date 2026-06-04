import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { useStore } from "../state/store";

/**
 * Right-hand spectrum panel: a numeric spectrum-index selector wired to
 * `selectSpectrum` -> `getSpectrumArrays`, and a uPlot chart mounted imperatively
 * via `useRef` (no React wrapper) plotting m/z vs intensity. In imaging mode the
 * heading reflects the clicked pixel's 1-based coordinates.
 *
 * SPEC-02: reads `mzWindow` from the store and draws a translucent amber band
 * over [mz - tolDa, mz + tolDa] via uPlot hooks.draw. The band is absent when
 * mzWindow is null (TIC-only state) and updates on every redraw (Pitfall 5 safe).
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
  // SPEC-02: ref for the mzWindow so the draw hook always reads the latest value
  // without needing to destroy/recreate the plot (Pitfall 5 — band frozen on zoom).
  const mzWindowRef = useRef<{ mz: number; tolDa: number } | null>(null);

  const numSpectra = stats?.numSpectra ?? 0;

  // Imaging-mode heading: when a pixel is selected on a grid, show its 1-based
  // (x, y). Invert coordToSpectrumIndex to map selectedIndex → grid key. Falls
  // back to the plain "Spectrum" heading for index-driven / non-imaging selection.
  let heading = "Spectrum";
  if (grid !== null && selectedIndex != null) {
    let key: number | null = null;
    for (const [k, sIdx] of grid.coordToSpectrumIndex) {
      if (sIdx === selectedIndex) {
        key = k;
        break;
      }
    }
    if (key != null) {
      const x1 = (key % grid.width) + grid.coordinateBase;
      const y1 = Math.floor(key / grid.width) + grid.coordinateBase;
      heading = `Spectrum — pixel (${x1}, ${y1})`;
    }
  }

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
      // SPEC-02: draw a translucent amber band over [mz - tolDa, mz + tolDa].
      // valToPos(..., "x", true) returns device-pixel coords matching ctx.
      // ctx.save/restore prevents fillStyle from leaking into subsequent draws.
      // The hook reads mzWindowRef.current so it always uses the latest value
      // without destroying/recreating the plot on every mzWindow change (Pitfall 5).
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

  // SPEC-02: sync mzWindow from the store into the ref and trigger a uPlot redraw
  // so hooks.draw fires with the updated band coordinates. The plot is not destroyed
  // or recreated — only redraw() is called (Pitfall 5 avoided).
  useEffect(() => {
    mzWindowRef.current = mzWindow;
    plotRef.current?.redraw();
  }, [mzWindow]);

  return (
    <section
      aria-label="spectrum-panel"
      style={{ flex: 1, minWidth: 0, padding: "0.5rem" }}
    >
      <h2>{heading}</h2>
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
