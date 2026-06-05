/* mzPeak IV — shell panels: TopBar, Rail, SpectrumDock, StatusBar. → window */
const DS = window.MzPeakDesignSystem_019e25;
const { Button, Badge, Panel, StatRow, SegmentedControl, ColormapScale } = DS;

function TopBar({ fileName, railOpen, onToggleRail, onReset, tweaksOpen, onTweaks }) {
  const I = window.Icons;
  return (
    <header className="topbar">
      <button className="iconbtn topbar__menu" onClick={onToggleRail} aria-pressed={railOpen} title="Toggle inspector">
        <I.PanelLeft size={17} />
      </button>
      <div className="topbar__brand">
        <img src="../../assets/openms-logo.png" alt="OpenMS" />
        <div className="topbar__div" />
        <div className="topbar__prod"><b>mzPeak&nbsp;IV</b><span>Imaging Viewer</span></div>
      </div>
      {fileName && (
        <div className="topbar__file" title={fileName}>
          <I.Flask size={13} /> {fileName}
        </div>
      )}
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        {fileName && <Button variant="ghost" size="sm" iconLeft={<I.Upload size={14} />} onClick={onReset}>Open file</Button>}
        <button className="iconbtn" aria-pressed={tweaksOpen} onClick={onTweaks} title="Display settings"><I.Sliders size={16} /></button>
        <a className="iconbtn" href="https://github.com/okohlbacher/mzPeakIV" target="_blank" rel="noreferrer" title="About"><I.Info size={16} /></a>
      </div>
    </header>
  );
}

function Rail({ meta, grid, view }) {
  const I = window.Icons;
  const dims = grid ? `${meta.dims[0]} × ${meta.dims[1]}` : null;
  return (
    <aside className="rail mz-scroll">
      <div className="rail__head">
        <span className="rail__title">Inspector</span>
        <Badge tone="success" dot>Ready</Badge>
      </div>
      <Panel title="Image Info" count={grid ? "5" : "—"} defaultOpen>
        <StatRow label="Dimensions" value={dims ? <>{dims} <em>px</em></> : null} />
        <StatRow label="Spectra" value={meta.spectra.toLocaleString()} />
        <StatRow label="Pixels with data" value={meta.filled.toLocaleString()} />
        <StatRow label="m/z range" value={<>{meta.mzRange[0]} – {meta.mzRange[1]} <em>Da</em></>} />
        <StatRow label="Pixel size" value={<>{meta.pixelSize} <em>µm</em></>} />
      </Panel>
      <Panel title="Acquisition" defaultOpen>
        <StatRow label="Instrument" value={meta.instrument} />
        <StatRow label="Analyzer" value={meta.analyzer} />
        <StatRow label="MS levels" value={meta.msLevels.join(", ")} />
        <StatRow label="Mode" value={<Badge tone="info">{meta.mode}</Badge>} />
      </Panel>
      <Panel title="Capabilities" defaultOpen={false}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
          <Badge tone="success" dot>Imaging</Badge>
          <Badge tone="success" dot>Coordinates</Badge>
          <Badge tone="success" dot>TIC</Badge>
          <Badge tone="neutral">Numpress n/a</Badge>
        </div>
      </Panel>
      <Panel title="Grid Diagnostics" defaultOpen={false}>
        <StatRow label="Orientation" value="top-left · y-down" />
        <StatRow label="Coordinate base" value="1-based" />
        <StatRow label="Fill" value={<>{Math.round(100 * meta.filled / meta.spectra)}<em>%</em></>} />
      </Panel>
    </aside>
  );
}

/* ── Spectrum canvas drawing ──────────────────────────────────────────────── */
function drawSpectrum(canvas, spec, mzWindow) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 8, padR = 8, padT = 8, padB = 20;
  const cs = getComputedStyle(document.documentElement);
  const line = cs.getPropertyValue("--spectrum-line").trim() || "#3b54da";
  const grid = "#eceff2", axis = "#9aa4ad";
  if (!spec) {
    ctx.fillStyle = "#aab2ba"; ctx.font = "12px 'IBM Plex Sans', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Click a pixel on the ion image to inspect its spectrum", w/2, h/2);
    return;
  }
  const N = spec.mz.length;
  const x0 = spec.mz[0], x1 = spec.mz[N-1];
  let mx = 0; for (let i=0;i<N;i++) if (spec.it[i] > mx) mx = spec.it[i];
  mx = mx || 1;
  const X = (mz) => padL + (mz - x0) / (x1 - x0) * (w - padL - padR);
  const Y = (v) => (h - padB) - v / mx * (h - padT - padB);
  // gridlines
  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let g=0; g<=4; g++){ const yy = padT + g*(h-padT-padB)/4; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w-padR, yy); ctx.stroke(); }
  // selection band
  if (mzWindow) {
    ctx.fillStyle = "rgba(255,200,0,0.25)";
    const bx0 = X(mzWindow.mz - mzWindow.tol), bx1 = X(mzWindow.mz + mzWindow.tol);
    ctx.fillRect(bx0, padT, bx1 - bx0, h - padT - padB);
  }
  // area + line
  ctx.beginPath(); ctx.moveTo(X(x0), Y(0));
  for (let i=0;i<N;i++) ctx.lineTo(X(spec.mz[i]), Y(spec.it[i]));
  ctx.lineTo(X(x1), Y(0)); ctx.closePath();
  ctx.fillStyle = "rgba(59,84,218,0.09)"; ctx.fill();
  ctx.beginPath();
  for (let i=0;i<N;i++){ const px=X(spec.mz[i]), py=Y(spec.it[i]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
  ctx.strokeStyle = line; ctx.lineWidth = 1.4; ctx.stroke();
  // axis labels
  ctx.fillStyle = axis; ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.textAlign = "center";
  for (let t=200; t<=800; t+=200){ if (t<x0||t>x1) continue; ctx.fillText(String(t), X(t), h-6); }
}

function SpectrumDock({ spec, heading, sub, mzWindow, onMean, meanActive }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    drawSpectrum(ref.current, spec, mzWindow);
    const onR = () => drawSpectrum(ref.current, spec, mzWindow);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [spec, mzWindow]);
  return (
    <section className="dock">
      <div className="dock__head">
        <span className="dock__title">{heading}</span>
        {sub && <span className="dock__meta">{sub}</span>}
        <div style={{ flex: 1 }} />
        <Button variant={meanActive ? "primary" : "secondary"} size="sm" onClick={onMean}>⌀ Mean spectrum</Button>
      </div>
      <div className="dock__plot"><canvas ref={ref} /></div>
    </section>
  );
}

function StatusBar({ meta, view, zoom }) {
  const names = { overview: "Overview · TIC", basepeak: "Overview · Base-peak m/z", ion: "Ion Image", multi: "Multi-channel" };
  return (
    <footer className="statusbar">
      <span className="statusbar__dot"><b /> mzPeak v0.3 · client-side</span>
      <span>{names[view] || "Overview"}</span>
      <span className="statusbar__spacer" />
      <span>{meta.dims[0]} × {meta.dims[1]} px</span>
      <span>{meta.filled.toLocaleString()} / {meta.spectra.toLocaleString()} spectra</span>
      <span>{Math.round(zoom * 100)}%</span>
    </footer>
  );
}

Object.assign(window, { TopBar, Rail, SpectrumDock, StatusBar });
