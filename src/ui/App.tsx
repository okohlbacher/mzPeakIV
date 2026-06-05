import { useEffect, useState } from "react";
import { PanelLeft, FolderOpen } from "lucide-react";

import { useStore } from "../state/store";
import { STAGE_LABEL } from "./stageLabels";
import { FileLoader } from "./FileLoader";
import { ProgressBar } from "./ProgressBar";
import { ErrorBanner } from "./ErrorBanner";
import { MetadataPanel } from "./MetadataPanel";
import { StatsPanel } from "./StatsPanel";
import { CapabilitiesPanel } from "./CapabilitiesPanel";
import { GridDiagnosticsPanel } from "./GridDiagnosticsPanel";
import { SpectrumPanel } from "./SpectrumPanel";
import { ImagingPanel } from "./ImagingPanel";
import { SettingsView } from "./SettingsView";
import { Badge } from "./ds";
import type { View } from "./viewTypes";

const LOGO = `${import.meta.env.BASE_URL}openms-logo.png`;
const WIDE_QUERY = "(min-width: 1041px)";

/**
 * Persistent application shell (Phase 2): top bar / inspector rail / center
 * (ImagingPanel stage) / spectrum dock / status bar. The frame is invariant;
 * only the body content swaps by load stage.
 *
 * Phase 2 slots the existing panels UNCHANGED into the rail/dock and keeps
 * ImagingPanel whole in the center. The toolbar + dark-stage split and the
 * settings popover land in Phase 4; the loader card + uPlot dock sizing in P5.
 */
export function App() {
  const stage = useStore((s) => s.stage);
  const error = useStore((s) => s.error);
  const isImaging = useStore((s) => s.capabilities?.isImaging ?? false);
  const grid = useStore((s) => s.grid);
  const stats = useStore((s) => s.stats);

  const loading =
    stage === "zip-index" ||
    stage === "manifest" ||
    stage === "metadata" ||
    stage === "grid" ||
    stage === "tic";
  const ready = stage === "ready";
  const noImaging = stage === "no-imaging";
  const isError = stage === "error";
  const hasShell = ready || noImaging; // full chrome states

  // ── Presentation-only state (never the store) ──────────────────────────────
  const [isWide, setIsWide] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia(WIDE_QUERY).matches
      : true,
  );
  const [railOpen, setRailOpen] = useState(false); // narrow-screen rail overlay
  const [reopen, setReopen] = useState(false); // "Open file" re-shows the loader
  const [view, setView] = useState<View>("overview");
  const [overviewMode, setOverviewMode] = useState<"tic" | "basepeak">("tic");

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Clear the "reopen" overlay once a fresh load actually starts.
  useEffect(() => {
    if (loading || ready || noImaging) setReopen(false);
  }, [loading, ready, noImaging]);

  const showLoaderOverlay = stage === "idle" || reopen;
  const railVisible = hasShell && (isWide || railOpen);

  return (
    <div className="app">
      {/* ALWAYS-MOUNTED hidden stage sentinel — text-only, exact STAGE_LABEL
          string, no sibling content. The e2e suite gates on toHaveText("Ready")
          etc.; this element must never be merged into a visible status node. */}
      <span data-testid="stage" aria-hidden="true" style={{ display: "none" }}>
        {STAGE_LABEL[stage]}
      </span>

      <div className="shell">
        {/* ── Top bar ───────────────────────────────────────────────────── */}
        <header className="topbar">
          {hasShell && !isWide && (
            <button
              className="iconbtn topbar__menu"
              aria-label="Toggle inspector"
              aria-pressed={railOpen}
              onClick={() => setRailOpen((v) => !v)}
            >
              <PanelLeft size={16} />
            </button>
          )}
          <div className="topbar__brand">
            <img src={LOGO} alt="OpenMS" />
          </div>
          <div className="topbar__div" />
          <div className="topbar__prod">
            <b>mzPeak IV</b>
            <span>imaging viewer</span>
          </div>
          {stats && (
            <div className="topbar__file" title="loaded dataset">
              {stats.numSpectra.toLocaleString()} spectra
            </div>
          )}
          <div className="topbar__spacer" />
          <div className="topbar__actions">
            {(hasShell || isError) && (
              <button
                className="iconbtn"
                aria-label="Open file"
                onClick={() => setReopen(true)}
              >
                <FolderOpen size={16} />
              </button>
            )}
          </div>
        </header>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className={`body${railVisible && isWide ? "" : " body--norail"}`}>
          {railVisible && (
            <aside
              className={`rail mz-scroll${!isWide ? " rail--overlay" : ""}`}
              data-testid="inspector-rail"
            >
              <div className="rail__head">
                <span className="rail__title">Inspector</span>
                <Badge tone="success" dot>
                  ready
                </Badge>
              </div>
              <MetadataPanel />
              <StatsPanel />
              <CapabilitiesPanel />
              {ready && <GridDiagnosticsPanel />}
              <SettingsView />
            </aside>
          )}
          {railVisible && !isWide && (
            <div className="rail-backdrop" onClick={() => setRailOpen(false)} />
          )}

          <div className="center">
            {loading && <ProgressBar stage={stage} />}

            {hasShell && (
              <>
                {ready && isImaging ? (
                  <ImagingPanel
                    view={view}
                    setView={setView}
                    overviewMode={overviewMode}
                    setOverviewMode={setOverviewMode}
                  />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      placeItems: "center",
                      padding: "1rem",
                      color: "var(--text-muted)",
                      fontSize: "var(--text-sm)",
                      textAlign: "center",
                    }}
                  >
                    no spatial imaging coordinates — spectrum browser only
                  </div>
                )}
                {/* Spectrum dock — fixed-height frame; SpectrumPanel's uPlot
                    ResizeObserver measures the flex plot area within it. Height
                    grows a little when the centroid peak table is present. */}
                <div
                  className="dock"
                  style={{ height: "auto", minHeight: "var(--shell-spectrum-h)", maxHeight: 320 }}
                >
                  <SpectrumPanel setView={setView} />
                </div>
              </>
            )}

            {isError && error && (
              <div style={{ padding: "1rem", overflow: "auto" }}>
                <ErrorBanner error={error} />
              </div>
            )}
          </div>
        </div>

        {/* ── Status bar ────────────────────────────────────────────────── */}
        <footer className="statusbar">
          <span className="statusbar__dot">
            <b />
            mzPeak v0.3 · client-side
          </span>
          <span>{STAGE_LABEL[stage]}</span>
          <span className="statusbar__spacer" />
          {grid && (
            <span>
              {grid.width} × {grid.height} px
            </span>
          )}
          {grid && (
            <span>
              {grid.filledCount.toLocaleString()} /{" "}
              {grid.totalCells.toLocaleString()} spectra
            </span>
          )}
        </footer>
      </div>

      {/* ── Loader overlay (idle, or "Open file") ─────────────────────────── */}
      {showLoaderOverlay && (
        <div className="loader">
          <div className="loader__card">
            <img className="loader__logo" src={LOGO} alt="OpenMS" />
            <div className="loader__h">Open an imaging mzPeak file</div>
            <div className="loader__p">
              reconstruct the spatial pixel grid, render ion images for an m/z
              window, and inspect the spectrum behind any pixel — entirely in the
              browser.
            </div>
            <FileLoader loading={loading} />
            {loading && <ProgressBar stage={stage} />}
          </div>
        </div>
      )}
    </div>
  );
}
