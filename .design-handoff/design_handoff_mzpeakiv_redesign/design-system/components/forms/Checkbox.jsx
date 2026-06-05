import React from "react";

const Check = (
  <svg className="mz-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Checkbox — compact labelled toggle (TIC normalisation, overlay flags).
 */
export function Checkbox({ checked, onChange = () => {}, label, className = "", ...rest }) {
  return (
    <label className={["mz-check", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked, e)}
        {...rest}
      />
      <span className="mz-check__box">{Check}</span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
