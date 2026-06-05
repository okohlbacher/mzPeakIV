/* mzPeak IV — app orchestrator + per-view toolbar. Mounts into #root. */
const DSx = window.MzPeakDesignSystem_019e25;
const { Button: B3, SegmentedControl: Seg3, NumberField: NF3 } = DSx;
const MZ = window.MZ;

function Toolbar(props) {
  const { view, setView, ovMode, setOvMode, s, mzStart, setMzStart, mzEnd, setMzEnd,
    onShowIon, mc, setMc, onRenderMulti, setColormap, onExport } = props;
  const I = window.Icons;
  return (
    <div className="toolbar">
      <Seg3 ariaLabel="View" value={view} onChange={setView} options={[
        { value: "overview", label: "Overview", icon: <I.Grid size={13} /> },
        { value: "ion", label: "Ion Image", icon: <I.Image size={13} /> },
        { value: "multi", label: "Multi-channel", icon: <I.Layers size={13} /> },
      ]} />
      <div className="toolbar__sep" />

      {view === "overview" && (
        <Seg3 size="sm" ariaLabel="Overview mode" value={ovMode} onChange={setOvMode} options={[
          { value: "tic", label: "TIC" }, { value: "basepeak", label: "Base-peak m/z" }]} />
      )}

      {view === "ion" && (
        <div className="toolbar__group">
          <span className="toolbar__lbl">m/z</span>
          <NF3 size="sm" width="84px" value={mzStart} onChange={setMzStart} ariaLabel="m/z start" />
          <span style={{ color: "var(--text-faint)" }}>–</span>
          <NF3 size="sm" width="84px" value={mzEnd} onChange={setMzEnd} unit="Da" ariaLabel="m/z end" />
          <B3 size="sm" iconLeft={<I.Image size={14} />} onClick={onShowIon}>Show Ion Image</B3>
        </div>
      )}

      {view === "multi" && (
        <div className="toolbar__group">
          {["r", "g", "b"].map((c) => (
            <span key={c} className="mc-row">
              <span className="mc-sw" style={{ background: c === "r" ? "var(--channel-r)" : c === "g" ? "var(--channel-g)" : "var(--channel-b)" }} />
              <NF3 size="sm" width="78px" value={mc[c]} onChange={(v) => setMc({ ...mc, [c]: v })} ariaLabel={c + " m/z"} />
            </span>
          ))}
          <B3 size="sm" iconLeft={<I.Layers size={14} />} onClick={onRenderMulti}>Render</B3>
        </div>
      )}

      <div className="toolbar__spacer" />

      {(view === "overview" && ovMode === "tic") || view === "ion" ? (
        <Seg3 size="sm" ariaLabel="Colormap" value={s.colormap} onChange={setColormap} options={[
          { value: "viridis", label: "viridis" }, { value: "inferno", label: "inferno" }, { value: "gray", label: "gray" }]} />
      ) : null}

      {(view === "ion" || view === "multi") && (
        <>
          <div className="toolbar__sep" />
          <B3 variant="secondary" size="sm" iconLeft={<I.Download size={14} />} onClick={onExport}>TIFF</B3>
        </>
      )}
    </div>
  );
}

function App() {
  const [loaded, setLoaded] = React.useState(false);
  const [view, setView] = React.useState("overview");
  const [ovMode, setOvMode] = React.useState("tic");
  const [s, setS] = React.useState({ colormap: "viridis", scale: "linear", percentile: 0.99, contrast: "none", ticNorm: false, smooth: "0" });
  const set = (p) => setS((o) => ({ ...o, ...p }));
  const [mzStart, setMzStart] = React.useState("740.00");
  const [mzEnd, setMzEnd] = React.useState("742.00");
  const [ion, setIon] = React.useState({ field: MZ.ION["740.50"], key: "ion740", center: 741, tol: 1 });
  const [mc, setMc] = React.useState({ r: "772.52", g: "740.50", b: "798.54" });
  const [mcFields, setMcFields] = React.useState({ r: MZ.ION["772.52"], g: MZ.ION["740.50"], b: MZ.ION["798.54"] });
  const [mcKey, setMcKey] = React.useState("mc0");
  const [sel, setSel] = React.useState(null);
  const [meanActive, setMean] = React.useState(false);
  const [settingsOpen, setSettings] = React.useState(false);
  const [railOpen, setRail] = React.useState(typeof window !== "undefined" && window.innerWidth > 1040);
  const [isWide, setIsWide] = React.useState(typeof window !== "undefined" && window.innerWidth > 1040);
  React.useEffect(() => {
    const f = () => setIsWide(window.innerWidth > 1040);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const showRail = loaded && (isWide || railOpen);

  const opt = { colormap: s.colormap, scale: s.scale, percentile: s.percentile };

  // Build the painter for the current view
  const painter = React.useMemo(() => {
    if (view === "overview" && ovMode === "basepeak") {
      const lo = Math.min(...MZ.MZS), hi = Math.max(...MZ.MZS);
      return { paint: (c) => MZ.paintBasePeak(c), field: MZ.BASEPEAK, colormap: "basepeak",
        low: String(lo.toFixed(0)), high: String(hi.toFixed(0)),
        key: "bp" };
    }
    if (view === "ion") {
      return { paint: (c) => MZ.paint(c, ion.field, opt), field: ion.field, colormap: s.colormap,
        low: "0", high: "max", key: "ion|" + ion.key + "|" + JSON.stringify(opt) };
    }
    if (view === "multi") {
      return { paint: (c) => MZ.paintMulti(c, mcFields), field: mcFields.g, colormap: null,
        low: null, high: null, key: "multi|" + mcKey };
    }
    // overview TIC
    return { paint: (c) => MZ.paint(c, MZ.TIC, opt), field: MZ.TIC, colormap: s.colormap,
      low: "0", high: "max", key: "tic|" + JSON.stringify(opt) };
  }, [view, ovMode, s, ion, mcFields, mcKey]);

  React.useEffect(() => { window.setCurrentField(painter.field); }, [painter]);

  function onShowIon() {
    const a = parseFloat(mzStart), b = parseFloat(mzEnd);
    if (!isFinite(a) || !isFinite(b) || b <= a) return;
    const c = (a + b) / 2, tol = (b - a) / 2;
    let best = MZ.MZS[0];
    MZ.MZS.forEach((m) => { if (Math.abs(m - c) < Math.abs(best - c)) best = m; });
    setIon({ field: MZ.ION[best.toFixed(2)], key: "i" + c.toFixed(2), center: c, tol: Math.max(tol, 0.25) });
  }
  function onRenderMulti() {
    const pick = (v) => { let best = MZ.MZS[0]; MZ.MZS.forEach((m) => { if (Math.abs(m - parseFloat(v)) < Math.abs(best - parseFloat(v))) best = m; }); return MZ.ION[best.toFixed(2)]; };
    setMcFields({ r: pick(mc.r), g: pick(mc.g), b: pick(mc.b) }); setMcKey("mc" + Date.now());
  }
  function onExport() {
    const c = document.querySelector(".imgframe canvas"); if (!c) return;
    const a = document.createElement("a"); a.download = "ion-image.png"; a.href = c.toDataURL("image/png"); a.click();
  }
  function onPick(cell) { setSel(cell); setMean(false); }

  const spec = React.useMemo(() => {
    if (sel) return MZ.spectrumAt(sel.x, sel.y);
    if (meanActive) return MZ.spectrumAt(104, 75);
    return null;
  }, [sel, meanActive]);

  const heading = sel ? `Pixel (${sel.x + 1}, ${sel.y + 1})` : meanActive ? "Mean spectrum" : "Spectrum";
  const sub = spec ? `${spec.mz.length.toLocaleString()} points · MS¹ · profile` : "no pixel selected";
  const mzWindow = view === "ion" ? { mz: ion.center, tol: ion.tol } : null;
  const hint = view === "ion" && !ion ? "Enter an m/z range and click Show Ion Image" : null;

  return (
    <div className="app">
      <div className="shell">
        <TopBar fileName={loaded ? MZ.META.file : null} railOpen={railOpen}
          onToggleRail={() => setRail((v) => !v)} onReset={() => { setLoaded(false); setSel(null); }}
          tweaksOpen={settingsOpen} onTweaks={() => setSettings((v) => !v)} />

        <div className="body" style={{ gridTemplateColumns: showRail && isWide ? "var(--shell-rail-w) 1fr" : "1fr" }}>
          {showRail && <Rail meta={MZ.META} grid={true} view={view} />}
          {loaded && !isWide && railOpen && <div className="rail-backdrop" onClick={() => setRail(false)} />}
          <div className="center">
            {loaded ? (
              <>
                <Toolbar view={view} setView={setView} ovMode={ovMode} setOvMode={setOvMode}
                  s={s} mzStart={mzStart} setMzStart={setMzStart} mzEnd={mzEnd} setMzEnd={setMzEnd}
                  onShowIon={onShowIon} mc={mc} setMc={setMc} onRenderMulti={onRenderMulti}
                  setColormap={(v) => set({ colormap: v })} onExport={onExport} />
                <IonStage paint={painter.paint} paintKey={painter.key} colormap={painter.colormap}
                  low={painter.low} high={painter.high} selected={sel} onPick={onPick} hint={hint} />
                <SpectrumDock spec={spec} heading={heading} sub={sub} mzWindow={mzWindow}
                  meanActive={meanActive && !sel} onMean={() => { setMean((v) => !v); setSel(null); }} />
              </>
            ) : (
              <div className="stage" style={{ display: "block", position: "relative", background: "var(--bg-app)", backgroundImage: "none" }}>
                <Loader onOpen={() => setLoaded(true)} />
              </div>
            )}
          </div>
        </div>

        <StatusBar meta={MZ.META} view={loaded ? (view === "overview" ? ovMode === "basepeak" ? "basepeak" : "overview" : view) : "overview"} zoom={1} />
      </div>
      {settingsOpen && <SettingsPopover s={s} set={set} onClose={() => setSettings(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
