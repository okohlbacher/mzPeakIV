**Button** — primary action control; use for any committed action (Load, Show Ion Image, Render, Export).

```jsx
<Button variant="primary" onClick={run}>Show Ion Image</Button>
<Button variant="secondary" size="sm" iconLeft={<DownloadIcon/>}>TIFF</Button>
<Button variant="ghost" size="sm">Reset</Button>
```

Variants: `primary` (filled blue), `secondary` (outline blue), `ghost` (quiet), `danger` (red). Sizes: `sm`, `md`. Omit children for a square icon button. Use `block` to fill width.
