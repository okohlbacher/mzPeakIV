import React from "react";

/**
 * ColormapScale — the signature legend / scale bar for ion images. Renders the
 * perceptually-uniform gradient (viridis / inferno / gray / basepeak) with
 * low/high tick labels. Horizontal by default; vertical for a canvas-side rail.
 */
export function ColormapScale({
  colormap = "viridis",
  low = "0",
  high = "max",
  orientation = "horizontal",
  onStage = false,
  className = "",
}) {
  const cls = [
    "mz-cmap",
    orientation === "vertical" ? "mz-cmap--vertical" : "",
    onStage ? "mz-cmap--stage" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className={`mz-cmap__bar mz-cmap__bar--${colormap}`} />
      <div className="mz-cmap__ticks">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
