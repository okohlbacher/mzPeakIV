import { useEffect, useRef } from "react";

import { useStore } from "../state/store";
import { SegmentedControl, Select, Checkbox, NumberField } from "./ds";
import type { Colormap } from "./rasterize";
import type { HistogramMode } from "../compute/histogram";

/**
 * Display-settings popover (Phase 4): the controls lifted out of ImagingPanel's
 * toolbar — scale, percentile clip, TIC normalize, smooth σ, contrast. Reads and
 * writes the store directly. Closes on Escape or an outside click.
 */
export function SettingsPopover({ onClose }: { onClose: () => void }) {
  const colormap = useStore((s) => s.colormap);
  const scale = useStore((s) => s.scale);
  const percentile = useStore((s) => s.percentile);
  const setColormapSettings = useStore((s) => s.setColormapSettings);

  const ticNorm = useStore((s) => s.ticNorm);
  const setTicNorm = useStore((s) => s.setTicNorm);

  const smoothSigma = useStore((s) => s.smoothSigma);
  const setSmoothSigma = useStore((s) => s.setSmoothSigma);

  const histogramMode = useStore((s) => s.histogramMode);
  const setHistogramMode = useStore((s) => s.setHistogramMode);

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div className="popover" ref={ref} role="dialog" aria-label="Display settings">
      <div className="popover__row">
        <span className="popover__lbl">Scale</span>
        <SegmentedControl
          size="sm"
          ariaLabel="scale"
          value={scale}
          onChange={(v) =>
            setColormapSettings(colormap as Colormap, v as "linear" | "log", percentile)
          }
          options={[
            { value: "linear", label: "linear" },
            { value: "log", label: "log" },
          ]}
        />
      </div>

      <div className="popover__row">
        <span className="popover__lbl">Percentile clip</span>
        <Select
          size="sm"
          ariaLabel="percentile clip"
          value={String(percentile)}
          onChange={(v) =>
            setColormapSettings(colormap as Colormap, scale, Number(v))
          }
          options={[
            { value: "0.9", label: "90th" },
            { value: "0.95", label: "95th" },
            { value: "0.99", label: "99th" },
            { value: "0.999", label: "99.9th" },
          ]}
        />
      </div>

      <div className="popover__row">
        <span className="popover__lbl">TIC normalize</span>
        <Checkbox
          checked={ticNorm}
          onChange={setTicNorm}
          ariaLabel="TIC norm"
        />
      </div>

      <div className="popover__row">
        <span className="popover__lbl">Smooth σ</span>
        <NumberField
          size="sm"
          type="number"
          width="64px"
          value={String(smoothSigma)}
          onChange={(v) => setSmoothSigma(Number(v) || 0)}
          ariaLabel="smooth sigma"
        />
      </div>

      <div className="popover__row">
        <span className="popover__lbl">Contrast</span>
        <Select
          size="sm"
          ariaLabel="contrast mode"
          value={histogramMode}
          onChange={(v) => setHistogramMode(v as HistogramMode)}
          options={[
            { value: "none", label: "None" },
            { value: "equalize", label: "Equalize" },
            { value: "clahe", label: "CLAHE" },
          ]}
        />
      </div>
    </div>
  );
}
