**StatRow** — key/value row for the inspector; value is mono + tabular. Stack several inside a `Panel`.

```jsx
<StatRow label="Dimensions" value={<>260 × 134 <em>px</em></>} />
<StatRow label="m/z range" value="85.81 – 799.95 Da" />
<StatRow label="Spectra" value="1,684" />
```

Wrap units in `<em>` to dim them. Omit `value` to show an em-dash placeholder.
