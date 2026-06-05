/* ──────────────────────────────────────────────────────────────────────────
   mzPeak IV — UI-kit rendering engine (plain JS, no JSX)
   Mock MSI data generation + scientific-colormap canvas painting. This makes
   the recreation look like a real ion-image explorer without a backend.
   Exposes window.MZ.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── Colormap LUTs (matplotlib anchors, matching the design tokens) ───────
  const VIRIDIS = [
    [68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],
    [31,158,137],[53,183,121],[110,206,88],[253,231,37],
  ];
  const INFERNO = [
    [0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],
    [245,125,21],[250,193,39],[249,201,52],[252,255,164],
  ];
  const SENTINEL = [22,28,34]; // matches --ink-raised, reads as empty stage

  function lut(stops, t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const seg = stops.length - 1, x = t * seg;
    const i = Math.min(Math.floor(x), seg - 1), f = x - i;
    const a = stops[i], b = stops[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ];
  }
  function colormap(name, t) {
    if (name === "inferno") return lut(INFERNO, t);
    if (name === "gray") { const v = Math.round((t<0?0:t>1?1:t) * 255); return [v,v,v]; }
    return lut(VIRIDIS, t);
  }
  function hueRGB(t) { // base-peak hue cycle [0,300]deg
    const h = (t<0?0:t>1?1:t) * 300, i = Math.floor(h/60)%6, f = h/60 - Math.floor(h/60);
    const q = 1 - f, tv = f; let r,g,b;
    switch(i){case 0:r=1;g=tv;b=0;break;case 1:r=q;g=1;b=0;break;case 2:r=0;g=1;b=tv;break;
      case 3:r=0;g=q;b=1;break;case 4:r=tv;g=0;b=1;break;default:r=1;g=0;b=q;}
    return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
  }

  // ── Deterministic PRNG ───────────────────────────────────────────────────
  function rng(seed) { let s = seed >>> 0; return () => { s = (s*1664525+1013904223)>>>0; return s/4294967296; }; }

  // ── Sample geometry: an organic tissue-section silhouette + mask ─────────
  const W = 208, H = 150;
  function inMask(x, y) {
    const nx = (x / W) * 2 - 1, ny = (y / H) * 2 - 1;
    // two overlapping lobes (brain-section-like)
    const a = ((nx + 0.26) / 0.62) ** 2 + (ny / 0.78) ** 2;
    const b = ((nx - 0.26) / 0.62) ** 2 + (ny / 0.78) ** 2;
    const wob = 0.06 * Math.sin(ny * 6 + nx * 3);
    return Math.min(a, b) < 1 - wob;
  }
  const MASK = (function () {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y*W+x] = inMask(x,y) ? 1 : 0;
    return m;
  })();

  function gauss(field, cx, cy, sx, sy, amp, rot) {
    rot = rot || 0; const ct = Math.cos(rot), st = Math.sin(rot);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const rx = dx*ct + dy*st, ry = -dx*st + dy*ct;
      field[y*W+x] += amp * Math.exp(-(rx*rx)/(2*sx*sx) - (ry*ry)/(2*sy*sy));
    }
  }

  // Build a named intensity field (Float32) within the mask, normalized 0..~1
  function makeField(spec) {
    const f = new Float32Array(W * H);
    const r = rng(spec.seed);
    (spec.blobs || []).forEach(b => gauss(f, b[0],b[1],b[2],b[3],b[4], b[5]||0));
    // texture
    for (let i = 0; i < W*H; i++) {
      if (!MASK[i]) { f[i] = 0; continue; }
      f[i] = Math.max(0, f[i] * (0.82 + 0.36 * r()) + (spec.base||0) * (0.5 + 0.5*r()));
    }
    return f;
  }

  // Datasets: TIC + a few ion channels with distinct spatial distributions
  const TIC = makeField({ seed: 7, base: 0.18, blobs: [
    [70,70,34,46,0.9,0.3],[150,74,30,50,0.78,-0.2],[104,40,40,18,0.5,0],[104,120,46,16,0.42,0] ] });
  const ION = {
    "740.50": makeField({ seed: 11, base: 0.02, blobs: [[150,70,22,40,1.0,-0.2],[150,108,16,12,0.5,0]] }),
    "772.52": makeField({ seed: 19, base: 0.02, blobs: [[68,66,24,34,1.0,0.3],[60,104,15,12,0.45,0]] }),
    "798.54": makeField({ seed: 23, base: 0.04, blobs: [[104,40,52,14,0.9,0],[104,118,52,12,0.7,0]] }),
    "184.07": makeField({ seed: 31, base: 0.05, blobs: [[104,76,70,60,0.5,0]] }),
  };
  // base-peak: argmax over channels → m/z value per pixel
  const MZS = Object.keys(ION).map(Number);
  const BASEPEAK = (function(){
    const f = new Float32Array(W*H);
    for (let i=0;i<W*H;i++){ if(!MASK[i]){f[i]=0;continue;} let best=-1,bm=MZS[0];
      MZS.forEach(mz=>{ const v=ION[mz.toFixed(2)][i]; if(v>best){best=v;bm=mz;} }); f[i]=bm; }
    return f;
  })();

  function percentile(field, p) {
    const v = []; for (let i=0;i<field.length;i++) if (MASK[i] && field[i]>0) v.push(field[i]);
    if (!v.length) return 1; v.sort((a,b)=>a-b);
    return v[Math.min(v.length-1, Math.floor(p*v.length))] || 1;
  }

  // Paint a field onto a canvas (intrinsic W×H, pixelated upscale by CSS)
  function paint(canvas, field, opts) {
    opts = opts || {};
    const name = opts.colormap || "viridis";
    const log = opts.scale === "log";
    const clip = percentile(field, opts.percentile || 0.99);
    const denom = log ? Math.log1p(clip) : clip;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W*H; i++) {
      const o = i*4;
      if (!MASK[i]) { img.data[o]=SENTINEL[0];img.data[o+1]=SENTINEL[1];img.data[o+2]=SENTINEL[2];img.data[o+3]=255; continue; }
      const raw = field[i];
      let t = denom>0 ? (log ? Math.log1p(raw)/denom : raw/denom) : 0;
      const [r,g,b] = colormap(name, t);
      img.data[o]=r; img.data[o+1]=g; img.data[o+2]=b; img.data[o+3]=255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function paintBasePeak(canvas) {
    const lo = Math.min(...MZS), hi = Math.max(...MZS);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    for (let i=0;i<W*H;i++){ const o=i*4;
      if(!MASK[i]||BASEPEAK[i]===0){img.data[o]=SENTINEL[0];img.data[o+1]=SENTINEL[1];img.data[o+2]=SENTINEL[2];img.data[o+3]=255;continue;}
      const [r,g,b]=hueRGB((BASEPEAK[i]-lo)/(hi-lo||1)); img.data[o]=r;img.data[o+1]=g;img.data[o+2]=b;img.data[o+3]=255; }
    ctx.putImageData(img,0,0);
  }

  function paintMulti(canvas, chans) { // chans: {r:field,g:field,b:field}
    canvas.width=W;canvas.height=H;const ctx=canvas.getContext("2d");const img=ctx.createImageData(W,H);
    const mx={r:percentile(chans.r||new Float32Array(W*H),0.99),g:percentile(chans.g||new Float32Array(W*H),0.99),b:percentile(chans.b||new Float32Array(W*H),0.99)};
    for(let i=0;i<W*H;i++){const o=i*4;
      if(!MASK[i]){img.data[o]=SENTINEL[0];img.data[o+1]=SENTINEL[1];img.data[o+2]=SENTINEL[2];img.data[o+3]=255;continue;}
      const cv=(f,m)=>f?Math.round(Math.min(1,f[i]/(m||1))*255):0;
      img.data[o]=cv(chans.r,mx.r);img.data[o+1]=cv(chans.g,mx.g);img.data[o+2]=cv(chans.b,mx.b);img.data[o+3]=255;}
    ctx.putImageData(img,0,0);
  }

  // ── Mock spectrum behind a pixel ─────────────────────────────────────────
  const PEAKS = [
    [184.07,0.42],[198.05,0.16],[369.35,0.22],[502.30,0.30],[703.50,0.28],
    [722.51,0.5],[740.50,1.0],[758.57,0.34],[772.52,0.7],[782.57,0.20],[798.54,0.46],[810.60,0.14],
  ];
  function spectrumAt(x, y) {
    // profile spectrum: sum of gaussians, intensities modulated by local ion fields
    const i = y*W + x;
    const mod = {
      "740.50": ION["740.50"][i], "772.52": ION["772.52"][i],
      "798.54": ION["798.54"][i], "184.07": ION["184.07"][i],
    };
    const N = 900, mz = new Float64Array(N), it = new Float64Array(N);
    const lo = 150, hi = 850;
    for (let k=0;k<N;k++) mz[k] = lo + (hi-lo)*k/(N-1);
    PEAKS.forEach(([pmz, amp]) => {
      let a = amp;
      const key = pmz.toFixed(2);
      if (mod[key] != null) a = 0.15 + 1.3 * mod[key];
      const w = 0.6 + Math.random()*0.05;
      for (let k=0;k<N;k++){ const d=mz[k]-pmz; it[k]+= a*Math.exp(-(d*d)/(2*w*w)); }
    });
    const peak = PEAKS.map(([pmz])=>{ const key=pmz.toFixed(2); const a = mod[key]!=null?(0.15+1.3*mod[key]):null; return {mz:pmz, base: a}; });
    return { mz, it, peak };
  }

  const META = {
    file: "PXD001283_brain.mzpeak",
    instrument: "LTQ Orbitrap XL",
    analyzer: "Orbitrap",
    dims: [W, H],
    spectra: W*H,
    filled: MASK.reduce((a,b)=>a+b,0),
    mzRange: [85.81, 799.95],
    msLevels: [1],
    mode: "profile",
    pixelSize: 50,
  };

  window.MZ = { W, H, MASK, TIC, ION, MZS, BASEPEAK, META, PEAKS,
    paint, paintBasePeak, paintMulti, spectrumAt, colormap, percentile,
    inMaskIdx: (i)=>!!MASK[i] };
})();
