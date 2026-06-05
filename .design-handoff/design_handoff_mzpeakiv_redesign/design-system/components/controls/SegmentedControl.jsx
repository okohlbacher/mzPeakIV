import React from "react";

/**
 * SegmentedControl — the connected tab/toggle group used throughout mzPeakIV
 * for view switching (Overview / Ion Image / Multi-channel), colormap and
 * scale selection. Single-select.
 *
 * @param {{value:string,label?:string,icon?:any}[]} options
 */
export function SegmentedControl({
  options = [],
  value,
  onChange = () => {},
  size = "md",
  ariaLabel = "View",
  className = "",
}) {
  const cls = ["mz-seg", size === "sm" ? "mz-seg--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          type="button"
          aria-selected={opt.value === value}
          className="mz-seg__item"
          onClick={() => onChange(opt.value)}
        >
          {opt.icon ? <span className="mz-ic" aria-hidden="true">{opt.icon}</span> : null}
          {opt.label ?? opt.value}
        </button>
      ))}
    </div>
  );
}
