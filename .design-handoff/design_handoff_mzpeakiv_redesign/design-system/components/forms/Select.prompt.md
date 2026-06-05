**Select** — styled native dropdown; use for compact, mutually-exclusive option lists too long for a SegmentedControl (percentile, contrast mode, export format).

```jsx
<Select value={pct} onChange={setPct} ariaLabel="Percentile clip"
  options={[{value:"0.99",label:"99th pct"},{value:"0.999",label:"99.9th pct"}]} />
```

Sizes `sm`/`md`.
