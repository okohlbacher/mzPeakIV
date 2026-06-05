import React from "react";

const Chevron = (
  <svg className="mz-select__chev" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Select — a styled native dropdown for compact option sets (contrast mode,
 * percentile clip, export format).
 *
 * @param {{value:string,label:string}[]} options
 */
export function Select({
  value,
  onChange = () => {},
  options = [],
  size = "md",
  ariaLabel,
  className = "",
  ...rest
}) {
  const cls = ["mz-select", size === "sm" ? "mz-select--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value, e)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {Chevron}
    </span>
  );
}
