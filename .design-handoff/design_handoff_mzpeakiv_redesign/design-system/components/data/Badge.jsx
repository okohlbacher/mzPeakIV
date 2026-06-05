import React from "react";

/**
 * Badge — compact status / metadata pill (mode, MS level, peak counts).
 */
export function Badge({ tone = "neutral", dot = false, mono = false, className = "", children }) {
  const cls = ["mz-badge", `mz-badge--${tone}`, mono ? "mz-badge--mono" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {dot ? <span className="mz-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
