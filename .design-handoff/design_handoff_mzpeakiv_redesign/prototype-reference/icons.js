/* mzPeak IV — icon set (Lucide-style line icons, MIT). Exposed on window.Icons. */
(function () {
  const S = (paths, extra) =>
    function Icon(props) {
      const { size = 16, ...rest } = props || {};
      return React.createElement(
        "svg",
        Object.assign({ width: size, height: size, viewBox: "0 0 24 24", fill: "none",
          stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, rest),
        paths.map((d, i) => React.createElement(d[0], Object.assign({ key: i }, d[1])))
      );
    };
  const P = (d) => ["path", { d }];
  const C = (cx, cy, r) => ["circle", { cx, cy, r }];
  const R = (x, y, w, h, rx) => ["rect", { x, y, width: w, height: h, rx }];
  const L = (x1, y1, x2, y2) => ["line", { x1, y1, x2, y2 }];

  window.Icons = {
    Upload: S([P("M12 3v12"), P("m7 8 5-5 5 5"), P("M5 21h14")]),
    Image: S([R(3,3,18,18,2), C(8.5,8.5,1.5), P("m21 15-5-5L5 21")]),
    Layers: S([P("m12 2 9 5-9 5-9-5 9-5Z"), P("m3 12 9 5 9-5"), P("m3 17 9 5 9-5")]),
    Grid: S([R(3,3,7,7,1), R(14,3,7,7,1), R(14,14,7,7,1), R(3,14,7,7,1)]),
    Crosshair: S([C(12,12,9), L(12,2,12,5), L(12,19,12,22), L(2,12,5,12), L(19,12,22,12)]),
    Download: S([P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), P("M12 3v12"), P("m7 10 5 5 5-5")]),
    ChevDown: S([P("m6 9 6 6 6-6")]),
    ChevRight: S([P("m9 6 6 6-6 6")]),
    PanelLeft: S([R(3,3,18,18,2), L(9,3,9,21)]),
    Search: S([C(11,11,8), L(21,21,16.65,16.65)]),
    Info: S([C(12,12,10), L(12,16,12,12), L(12,8,12.01,8)]),
    X: S([P("M18 6 6 18"), P("m6 6 12 12")]),
    Check: S([P("M20 6 9 17l-5-5")]),
    Sliders: S([L(4,21,4,14), L(4,10,4,3), L(12,21,12,12), L(12,8,12,3), L(20,21,20,16), L(20,12,20,3), L(1,14,7,14), L(9,8,15,8), L(17,16,23,16)]),
    Sigma: S([P("M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8L12 12l-5.9 7.2a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2")]),
    Maximize: S([P("M8 3H5a2 2 0 0 0-2 2v3"), P("M21 8V5a2 2 0 0 0-2-2h-3"), P("M3 16v3a2 2 0 0 0 2 2h3"), P("M16 21h3a2 2 0 0 0 2-2v-3")]),
    Flask: S([P("M9 3h6"), P("M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3"), L(8,14,16,14)]),
    Link: S([P("M9 17H7A5 5 0 0 1 7 7h2"), P("M15 7h2a5 5 0 0 1 0 10h-2"), L(8,12,16,12)]),
    Dot: S([C(12,12,3)]),
    Eye: S([P("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"), C(12,12,3)]),
    Ruler: S([P("M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z"), L(14,7,16,9), L(11,10,13,12), L(8,13,10,15)]),
  };
})();
