import React from "react";

/**
 * Button — the primary action control for mzPeak interfaces.
 * Variants: primary (default), secondary (outline), ghost, danger.
 */
export function Button({
  variant = "primary",
  size = "md",
  iconLeft = null,
  iconRight = null,
  block = false,
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "mz-btn",
    variant !== "primary" ? `mz-btn--${variant}` : "",
    size === "sm" ? "mz-btn--sm" : "",
    !children ? "mz-btn--icon" : "",
    block ? "mz-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {iconLeft ? <span className="mz-ic" aria-hidden="true">{iconLeft}</span> : null}
      {children}
      {iconRight ? <span className="mz-ic" aria-hidden="true">{iconRight}</span> : null}
    </button>
  );
}
