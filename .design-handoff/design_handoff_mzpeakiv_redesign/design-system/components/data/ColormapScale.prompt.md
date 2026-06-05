**ColormapScale** — the signature ion-image legend; always pair it with any rendered ion image so intensity is readable.

```jsx
<ColormapScale colormap="viridis" low="0" high="1.4e6" />
<ColormapScale colormap="inferno" orientation="vertical" onStage high="max" />
```

Colormaps: `viridis` (default), `inferno`, `gray`, `basepeak`. Use `orientation="vertical"` + `onStage` for a rail beside the dark canvas. Never recolour the gradient.
