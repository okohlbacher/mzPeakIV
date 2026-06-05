import React, { useState } from "react";

const Chev = (
  <svg className="mz-panel__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Panel — a collapsible titled section for the inspector rail. Uncontrolled by
 * default (defaultOpen); pass `open` + `onToggle` to control it.
 */
export function Panel({ title, count = null, defaultOpen = true, open, onToggle, className = "", children }) {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const toggle = () => (onToggle ? onToggle(!isOpen) : setInternal((v) => !v));
  return (
    <section className={["mz-panel", className].filter(Boolean).join(" ")} data-open={isOpen}>
      <button className="mz-panel__head" onClick={toggle} aria-expanded={isOpen}>
        {Chev}
        <span className="mz-panel__title">{title}</span>
        {count != null ? <span className="mz-panel__count">{count}</span> : null}
      </button>
      <div className="mz-panel__body">{children}</div>
    </section>
  );
}
