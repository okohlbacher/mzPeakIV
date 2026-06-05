import React from "react";

/**
 * StatRow — a key/value row for the inspector. The value renders in mono,
 * tabular numerals. Pass a string or rich nodes; use <em> inside the value to
 * dim units (handled by the stylesheet).
 */
export function StatRow({ label, value, className = "" }) {
  return (
    <div className={["mz-statrow", className].filter(Boolean).join(" ")}>
      <span className="mz-statrow__key">{label}</span>
      <span className="mz-statrow__val">{value ?? <em>—</em>}</span>
    </div>
  );
}
