**SegmentedControl** — connected single-select group; use for switching views or picking among a few mutually-exclusive options (colormap, scale, percentile).

```jsx
<SegmentedControl
  ariaLabel="View"
  value={view}
  onChange={setView}
  options={[
    { value: "overview", label: "Overview" },
    { value: "ion", label: "Ion Image" },
    { value: "multi", label: "Multi-channel" },
  ]}
/>
```

Sizes: `sm`, `md`. Options accept an optional `icon`. For 4+ long options prefer a `Select`.
