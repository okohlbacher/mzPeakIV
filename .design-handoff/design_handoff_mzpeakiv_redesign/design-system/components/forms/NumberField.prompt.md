**NumberField** — monospace numeric entry with an optional unit chip; use for m/z, tolerance, sigma and any measured value.

```jsx
<NumberField value={mz} onChange={setMz} unit="Da" width="96px" ariaLabel="m/z start" step="any" min="0" />
```

Sizes `sm`/`md`. Pair two NumberFields with an en-dash for a range. Always carry the unit when the value has one.
