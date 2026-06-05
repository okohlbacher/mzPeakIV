import React from "react";

/**
 * NumberField — a monospace numeric input with an optional unit suffix (Da, µm,
 * ppm). Used for m/z ranges, tolerances and smoothing parameters.
 */
export function NumberField({
  value,
  onChange = () => {},
  unit = null,
  size = "md",
  placeholder = "",
  width,
  className = "",
  ariaLabel,
  ...rest
}) {
  const cls = ["mz-input", size === "sm" ? "mz-input--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={width ? { width } : undefined}>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value, e)}
        {...rest}
      />
      {unit ? <span className="mz-input__unit">{unit}</span> : null}
    </span>
  );
}
