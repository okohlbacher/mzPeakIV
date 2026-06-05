/* mzPeak IV — stage: Toolbar, SettingsPopover, IonStage, MultiInputs, Loader. → window */
const D2 = window.MzPeakDesignSystem_019e25;
const { Button: Btn, SegmentedControl: Seg, NumberField: NF, Select: Sel, Checkbox: Chk, ColormapScale: CScale, Badge: Bdg } = D2;

const MZW = window.MZ.W, MZH = window.MZ.H;

/* Fit a W:H canvas inside its container (contain), reacting to resize. */
function useFit(ratio, pad) {
  const ref = React.useRef(null);
  const [d, setD] = React.useState({ w: 320, h: 240 });
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const calc = () => {
      const cw = Math.max(40, el.clientWidth - (pad || 0));
      const ch = Math.max(40, el.clientHeight - (pad || 0));
      let w = cw, h = w / ratio;
      if (h > ch) { h = ch; w = h * ratio; }
      setD({ w: Math.floor(w), h: Math.floor(h) });
    };
    const ro = new ResizeObserver(calc); ro.observe(el); calc();
    return () => ro.disconnect();
  }, [ratio, pad]);
  return [ref, d];
}

function IonStage({ paint, paintKey, colormap, low, high, selected, onPick, onHover, hint }) {
  const [stageRef, d] = useFit(MZW / MZH, 56);
  const canRef = React.useRef(null);
  React.useEffect(() => { if (canRef.current && paint) paint(canRef.current); }, [paintKey]);
  const [ro, setRo] = React.useState(null);

  function toCell(e) {
    const r = canRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * MZW);
    const y = Math.floor((e.clientY - r.top) / r.height * MZH);
    if (x < 0 || x >= MZW || y < 0 || y >= MZH) return null;
    return { x, y };
  }
  const cell = MZW ? d.w / MZW : 1;
  return (
    <div className="stage" ref={stageRef}>
      <div className="imgframe" style={{ width: d.w, height: d.h }}>
        <canvas
          ref={canRef}
          className={onPick ? "cross" : ""}
          style={{ width: d.w, height: d.h }}
          onMouseMove={onPick ? (e) => { const c = toCell(e); setRo(c); onHover && onHover(c); } : undefined}
          onMouseLeave={() => { setRo(null); onHover && onHover(null); }}
          onClick={onPick ? (e) => { const c = toCell(e); if (c && window.MZ.MASK[c.y * MZW + c.x]) onPick(c); } : undefined}
        />
        {selected && window.MZ.MASK[selected.y * MZW + selected.x] && (
          <div className="selring" style={{ left: selected.x * cell, top: selected.y * cell, width: cell + 1, height: cell + 1 }} />
        )}
      </div>

      {hint && <div className="stage__readout" style={{ left: "50%", right: "auto", top: "auto", bottom: 24, transform: "translateX(-50%)", textAlign: "center" }}>{hint}</div>}

      {!hint && low != null && (
        <div className="stage__legend">
          <CScale colormap={colormap} low={low} high={high} onStage />
        </div>
      )}
      {!hint && (
        <div className="stage__readout">
          {ro
            ? (window.MZ.MASK[ro.y * MZW + ro.x]
                ? <>x <em>{ro.x + 1}</em> · y <em>{ro.y + 1}</em><br />intensity <em>{fmtCompact(currentVal(paintKey, ro))}</em></>
                : <>x {ro.x + 1} · y {ro.y + 1} — no data</>)
            : <span style={{ color: "#8b95a0" }}>Hover the image…</span>}
        </div>
      )}
      <div className="stage__scalebar"><i />{window.MZ.META.pixelSize * 64} µm</div>
    </div>
  );
}

// value lookup for readout (kept simple — reads the app-provided current field)
let CURRENT_FIELD = null;
function currentVal(_k, ro) { return CURRENT_FIELD ? CURRENT_FIELD[ro.y * MZW + ro.x] : 0; }
function fmtCompact(v) {
  if (!isFinite(v)) return "—"; if (v === 0) return "0";
  const a = Math.abs(v); if (a >= 1e5 || a < 1e-2) return v.toExponential(1);
  return Number(v.toPrecision(3)).toLocaleString();
}

function SettingsPopover({ s, set, onClose }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={onClose} />
      <div style={{ position: "absolute", top: 54, right: 14, zIndex: 31, width: 264,
        background: "var(--surface)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-pop)", padding: "14px 16px" }}>
        <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 10 }}>Display settings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Colormap">
            <Seg size="sm" value={s.colormap} onChange={(v) => set({ colormap: v })}
              options={[{ value: "viridis", label: "viridis" }, { value: "inferno", label: "inferno" }, { value: "gray", label: "gray" }]} />
          </Field>
          <Field label="Scale">
            <Seg size="sm" value={s.scale} onChange={(v) => set({ scale: v })}
              options={[{ value: "linear", label: "linear" }, { value: "log", label: "log" }]} />
          </Field>
          <Field label="Percentile clip">
            <Sel size="sm" value={String(s.percentile)} onChange={(v) => set({ percentile: Number(v) })}
              options={[{ value: "0.9", label: "90th pct" }, { value: "0.95", label: "95th pct" }, { value: "0.99", label: "99th pct" }, { value: "0.999", label: "99.9th pct" }]} />
          </Field>
          <Field label="Contrast">
            <Sel size="sm" value={s.contrast} onChange={(v) => set({ contrast: v })}
              options={[{ value: "none", label: "None" }, { value: "equalize", label: "Equalize" }, { value: "clahe", label: "CLAHE" }]} />
          </Field>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Chk checked={s.ticNorm} onChange={(v) => set({ ticNorm: v })} label="TIC normalize" />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              σ <NF size="sm" width="48px" value={s.smooth} onChange={(v) => set({ smooth: v })} ariaLabel="smooth" />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

function Loader({ onOpen }) {
  const I = window.Icons;
  const [over, setOver] = React.useState(false);
  const [url, setUrl] = React.useState("https://hupo-psi.github.io/…/PXD001283.mzpeak");
  return (
    <div className="loader">
      <div className="loader__card">
        <img className="loader__logo" src="../../assets/openms-logo.png" alt="OpenMS" />
        <div>
          <div className="loader__h">Open an imaging mzPeak file</div>
          <div className="loader__p">Reconstruct the pixel grid, render ion images for any m/z window, and inspect the spectrum behind any pixel — entirely in your browser.</div>
        </div>
        <div className="drop" data-over={over}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onOpen(); }}
          onClick={onOpen}>
          <I.Upload size={22} />
          <div>Drop a <strong>.mzpeak</strong> file here, or <span style={{ color: "var(--accent)", textDecoration: "underline" }}>browse</span></div>
        </div>
        <div className="loader__url">
          <span className="mz-input"><input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="url" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }} /></span>
          <Btn variant="secondary" onClick={onOpen}>Load URL</Btn>
        </div>
        <div className="loader__demos">
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)", alignSelf: "center" }}>Demos:</span>
          <button className="chip" onClick={onOpen}>brain · 208×150</button>
          <button className="chip" onClick={onOpen}>kidney · centroid</button>
          <button className="chip" onClick={onOpen}>small.mzpeak</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { IonStage, SettingsPopover, Loader, setCurrentField: (f) => { CURRENT_FIELD = f; }, fmtCompact });
