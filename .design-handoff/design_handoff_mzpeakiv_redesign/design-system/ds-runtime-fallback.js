/* ──────────────────────────────────────────────────────────────────────────
   mzPeak DS — runtime fallback shim
   Defines window.MzPeakDesignSystem_019e25 with plain-JS (React.createElement)
   implementations of the 9 primitives, ONLY if the compiled _ds_bundle.js did
   not already provide them. Class names + props match the .jsx sources exactly,
   so cards/kits render identically whether or not the compiled bundle is served.
   Load this AFTER <script src="…/_ds_bundle.js"> and BEFORE any consumer code.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.MzPeakDesignSystem_019e25 && window.MzPeakDesignSystem_019e25.Button) return;
  if (typeof React === "undefined") { console.warn("[mzPeak DS] React not loaded before fallback shim"); return; }
  const h = React.createElement;
  const cx = (...a) => a.filter(Boolean).join(" ");
  const svg = (attrs, d) => h("svg", Object.assign({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, attrs), h("path", { d }));

  function Button({ variant = "primary", size = "md", iconLeft, iconRight, block, className = "", children, ...rest }) {
    const cls = cx("mz-btn", variant !== "primary" && "mz-btn--" + variant, size === "sm" && "mz-btn--sm",
      !children && "mz-btn--icon", block && "mz-btn--block", className);
    return h("button", Object.assign({ className: cls }, rest),
      iconLeft && h("span", { className: "mz-ic", "aria-hidden": true }, iconLeft),
      children,
      iconRight && h("span", { className: "mz-ic", "aria-hidden": true }, iconRight));
  }

  function SegmentedControl({ options = [], value, onChange = () => {}, size = "md", ariaLabel = "View", className = "" }) {
    return h("div", { className: cx("mz-seg", size === "sm" && "mz-seg--sm", className), role: "tablist", "aria-label": ariaLabel },
      options.map((o) => h("button", { key: o.value, role: "tab", type: "button", "aria-selected": o.value === value,
        className: "mz-seg__item", onClick: () => onChange(o.value) },
        o.icon && h("span", { className: "mz-ic", "aria-hidden": true }, o.icon), o.label != null ? o.label : o.value)));
  }

  function NumberField({ value, onChange = () => {}, unit, size = "md", placeholder = "", width, className = "", ariaLabel, ...rest }) {
    return h("span", { className: cx("mz-input", size === "sm" && "mz-input--sm", className), style: width ? { width } : undefined },
      h("input", Object.assign({ type: "number", inputMode: "decimal", value, placeholder, "aria-label": ariaLabel,
        onChange: (e) => onChange(e.target.value, e) }, rest)),
      unit && h("span", { className: "mz-input__unit" }, unit));
  }

  function Select({ value, onChange = () => {}, options = [], size = "md", ariaLabel, className = "", ...rest }) {
    return h("span", { className: cx("mz-select", size === "sm" && "mz-select--sm", className) },
      h("select", Object.assign({ value, "aria-label": ariaLabel, onChange: (e) => onChange(e.target.value, e) }, rest),
        options.map((o) => h("option", { key: o.value, value: o.value }, o.label))),
      svg({ className: "mz-select__chev", strokeWidth: 2.2 }, "m6 9 6 6 6-6"));
  }

  function Checkbox({ checked, onChange = () => {}, label, className = "", ...rest }) {
    return h("label", { className: cx("mz-check", className) },
      h("input", Object.assign({ type: "checkbox", checked, onChange: (e) => onChange(e.target.checked, e) }, rest)),
      h("span", { className: "mz-check__box" }, svg({ className: "mz-ic", strokeWidth: 3 }, "M20 6 9 17l-5-5")),
      label && h("span", null, label));
  }

  function Badge({ tone = "neutral", dot, mono, className = "", children }) {
    return h("span", { className: cx("mz-badge", "mz-badge--" + tone, mono && "mz-badge--mono", className) },
      dot && h("span", { className: "mz-badge__dot", "aria-hidden": true }), children);
  }

  function StatRow({ label, value, className = "" }) {
    return h("div", { className: cx("mz-statrow", className) },
      h("span", { className: "mz-statrow__key" }, label),
      h("span", { className: "mz-statrow__val" }, value != null ? value : h("em", null, "—")));
  }

  function ColormapScale({ colormap = "viridis", low = "0", high = "max", orientation = "horizontal", onStage, className = "" }) {
    return h("div", { className: cx("mz-cmap", orientation === "vertical" && "mz-cmap--vertical", onStage && "mz-cmap--stage", className) },
      h("div", { className: "mz-cmap__bar mz-cmap__bar--" + colormap }),
      h("div", { className: "mz-cmap__ticks" }, h("span", null, low), h("span", null, high)));
  }

  function Panel({ title, count, defaultOpen = true, open, onToggle, className = "", children }) {
    const [internal, setInternal] = React.useState(defaultOpen);
    const isOpen = open != null ? open : internal;
    const toggle = () => (onToggle ? onToggle(!isOpen) : setInternal((v) => !v));
    return h("section", { className: cx("mz-panel", className), "data-open": isOpen },
      h("button", { className: "mz-panel__head", onClick: toggle, "aria-expanded": isOpen },
        svg({ className: "mz-panel__chev", strokeWidth: 2.4 }, "m6 9 6 6 6-6"),
        h("span", { className: "mz-panel__title" }, title),
        count != null && h("span", { className: "mz-panel__count" }, count)),
      h("div", { className: "mz-panel__body" }, children));
  }

  window.MzPeakDesignSystem_019e25 = Object.assign(window.MzPeakDesignSystem_019e25 || {}, {
    Button, SegmentedControl, NumberField, Select, Checkbox, Badge, StatRow, ColormapScale, Panel,
  });
  console.info("[mzPeak DS] using runtime fallback shim (compiled bundle not served)");
})();
