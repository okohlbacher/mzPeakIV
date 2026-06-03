# Stack Research

**Domain:** Fully client-side, static-hosted (GitHub Pages) browser app for exploring mass-spectrometry-imaging (MSI) data in the mzPeak format — Parquet/Arrow read in-browser, Canvas 2D ion-image heatmaps, uPlot spectra.
**Researched:** 2026-06-03
**Confidence:** HIGH

> The pre-made decisions (Vite + React + TS, Canvas 2D, uPlot, vendor `mzpeakts`) are **validated as sound** — see "Decisions Validated" below. This document is mostly about pinning *exact current versions* and answering the WASM/COOP-COEP/vendoring/CI questions prescriptively.

---

## Decisions Validated (do not relitigate)

| Pre-made decision | Verdict | Evidence |
|-------------------|---------|----------|
| Vite + React + TypeScript | ✅ Correct | Standard 2026 SPA stack; Vite 8 + React 19 + plugin-react 6 are mutually compatible (verified peer deps). |
| Canvas 2D for ion-image heatmap | ✅ Correct | A few-thousand-pixel grid painted via one `ImageData`/`putImageData` is trivial for Canvas 2D; WebGL would be over-engineering at this scale. |
| uPlot for spectra | ✅ Correct | uPlot is the fastest mainstream JS line-charting lib for large 1D series (10k–1M points), ~40 KB, zero deps — exactly the spectrum-plotting use case. |
| Reuse/vendor `mzpeakts` (parquet-wasm + apache-arrow + zip.js) | ✅ Correct | Upstream already implements ZIP+Parquet+Arrow + point/chunked/delta layouts; its live demo runs on GitHub Pages, proving the whole chain is statically hostable. |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Vite** | **8.0.16** | Dev server + build/bundler | De-facto SPA build tool in 2026; first-class `base` config for GitHub Pages project pages; `vite-plugin-wasm` officially supports Vite `^8`. |
| **React** | **19.2.7** | UI component model for multi-panel layout | Current stable. Note: upstream `mzpeakts` *app* uses React 18, but the **reader lib is framework-agnostic**, so React 19 in this project is safe. |
| **react-dom** | **19.2.7** | React DOM renderer | Must match `react` major. |
| **TypeScript** | **5.9.x** (recommend pinning `~5.9`) | Type-checked source | ⚠️ npm `latest` is **6.0.3**, but TS 6.0 is brand-new (Nov–Dec 2025) and `typescript-eslint` / many toolchains still target the 5.x line. Upstream `mzpeakts` pins `~5.6.2`. Pin `~5.9` for ecosystem stability now; bump to 6.x only after `typescript-eslint` and `vite-plugin-dts` confirm support. |
| **uPlot** | **1.6.32** | Spectrum (m/z vs intensity) plotting | Tiny, fast, canvas-based. No React wrapper needed — mount into a `useRef` div and feed typed arrays directly. |

### The Reader (vendored, not on npm)

| Component | Version / Source | Purpose |
|-----------|------------------|---------|
| **mzpeakts** | `HUPO-PSI/mzpeakts` `main` (lib at `/lib`, package name `mzpeakts@0.1.0`, license MIT OR Apache-2.0) | Browser mzPeak reader: `MzPeakReader.fromUrl()` → `getSpectrum(i)`. **Vendor it** (see "Vendoring mzpeakts"). |
| **parquet-wasm** | **0.7.1** (released 2025-10-03) | WASM Parquet reader. ⚠️ Upstream pins it as a **vendored `.tgz`** (`file:vendor/parquet-wasm/pkg/parquet-wasm-0.7.1.tgz`), but `parquet-wasm@0.7.1` on npm is identical — use the npm package directly. |
| **apache-arrow** | **21.1.0** | In-memory columnar tables produced from Parquet. ⚠️ **Version must match what parquet-wasm/arrow-js-ffi expect** — upstream pins `^21.1.0`. Do NOT float to a different major. |
| **arrow-js-ffi** | **0.4.3** | Zero-copy bridge from parquet-wasm's WASM Arrow buffers into JS `apache-arrow` Tables. Transitive dep of mzpeakts; pin to match (`^0.4.3`). |
| **@zip.js/zip.js** | **2.8.26** (upstream pins `^2.8.23`) | Reads the uncompressed-ZIP container; supports HTTP-range reads for URL loading. |

### Build Plugins (required for the WASM reader to work)

| Plugin | Version | Purpose | Why mandatory |
|--------|---------|---------|---------------|
| **@vitejs/plugin-react** | **6.0.2** | React Fast Refresh + JSX transform | Requires Vite `^8` (verified) — pairs with the chosen Vite. |
| **vite-plugin-wasm** | **3.6.0** | Lets Vite import `.wasm` as ESM | parquet-wasm ships `.wasm`; this plugin handles import + emit. Peer `vite: ^2…^8` (Vite 8 confirmed). |
| **vite-plugin-top-level-await** | **1.6.0** | Transforms top-level `await` (used by WASM init) | parquet-wasm/mzpeakts initialize WASM with top-level await; required for older browser targets. Peer `vite >=2.8`. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **Vitest** | **4.1.8** | Unit tests (coordinate-grid math, m/z-window selection, colormap scaling) | Same Vite pipeline → WASM/Arrow imports resolve in tests. Upstream already uses Vitest 4. |
| **@playwright/test** | **1.60.0** | End-to-end browser test of the critical round-trip (file → ion image → click pixel → spectrum) | The only way to validate the real WASM+Canvas path; run against `vite preview` of the built site. Use a small fixture `.mzpeak`. |
| **ESLint** | **9.x** (recommend `~9`, not 10) | Lint | ⚠️ npm `latest` is **10.4.1**, but `typescript-eslint@8` and `eslint-plugin-react-hooks` target ESLint 9 flat config; upstream uses ESLint 9. Pin `~9` until the plugin ecosystem confirms ESLint 10. |
| **typescript-eslint** | **8.60.1** | TS-aware lint rules (flat config) | Matches ESLint 9. |
| **eslint-plugin-react-hooks** | **7.1.1** | Hooks rules | — |
| **Prettier** | **3.8.3** | Formatting | See Biome note below — Prettier is the conservative default and matches upstream's React tooling familiarity. |

---

## Installation

```bash
# Core app
npm install react@19.2.7 react-dom@19.2.7 uplot@1.6.32

# Reader chain (if NOT consuming via mzpeakts' own deps — see vendoring options)
npm install parquet-wasm@0.7.1 apache-arrow@21.1.0 arrow-js-ffi@0.4.3 @zip.js/zip.js@2.8.26

# Build toolchain + WASM plugins
npm install -D vite@8.0.16 @vitejs/plugin-react@6.0.2 typescript@~5.9 \
  vite-plugin-wasm@3.6.0 vite-plugin-top-level-await@1.6.0 \
  @types/react@19.2.16 @types/react-dom@19.2.3

# Test + lint/format
npm install -D vitest@4.1.8 @playwright/test@1.60.0 \
  eslint@~9 typescript-eslint@8.60.1 eslint-plugin-react-hooks@7.1.1 prettier@3.8.3
```

---

## Vendoring `mzpeakts` (it is NOT published to npm)

The reader lives at `HUPO-PSI/mzpeakts` under `/lib` (package `mzpeakts@0.1.0`, `type: module`, builds to `dist/mzpeakts.js` + `.d.ts` via `tsc && vite build`). It depends on parquet-wasm (vendored `.tgz`), apache-arrow, arrow-js-ffi, zip.js. **Recommendation, in priority order:**

### ✅ Option A — Git submodule + build-and-link (RECOMMENDED)
Add `mzpeakts` as a git submodule, build its `/lib` to `dist/`, and reference it via `"mzpeakts": "file:vendor/mzpeakts/lib"` in your `package.json`.

- **Why:** Preserves upstream provenance + clean `git pull` updates; you can pin to a specific commit (format is unstable, so pinning matters); you build the same artifact the maintainer ships. The lib's `package.json` already exposes `exports["."]` → `dist/mzpeakts.js`, so a `file:` install Just Works after `npm run build` in the submodule.
- **Caveat:** parquet-wasm inside the submodule is a `file:vendor/.../parquet-wasm-0.7.1.tgz`. Either keep that vendored tgz in the submodule (it's committed upstream) or override to `parquet-wasm@0.7.1` from npm (identical bits). A small bootstrap script (`git submodule update --init && cd vendor/mzpeakts/lib && npm ci && npm run build`) makes CI reproducible.

### ⚠️ Option B — In-tree copy of `lib/src/*.ts` (use only if you must patch heavily)
Copy `lib/src/*.ts` (9 files: `reader.ts`, `data.ts`, `metadata.ts`, `array_index.ts`, `record.ts`, `store.ts`, `numpress.ts`, `utils.ts`, `index.ts`) into `src/mzpeak/` and compile them as part of your app.

- **Why you'd do this:** The project's central risk is the **imaging coordinate layer**, which likely needs changes *inside* the reader (e.g. exposing scan/spectrum cvParams `IMS:1000050/51`). In-tree source makes that trivial and gives you source-mapped debugging.
- **Cost:** You lose easy upstream sync (manual diff/merge); you must still `npm install parquet-wasm@0.7.1 apache-arrow@21.1.0 arrow-js-ffi@0.4.3 @zip.js/zip.js@2.8.26` yourself.
- **Verdict:** Reasonable as a *fallback* if the imaging layer requires deep edits. Prefer A first; drop to B only when patching pressure is real.

### ❌ Option C — npm git-dependency (`"mzpeakts": "github:HUPO-PSI/mzpeakts"`)
**Do not use.** The repo root has no `package.json`; the publishable package is the subdir `/lib`, and it requires a build step (`tsc && vite build`) plus a vendored parquet-wasm `.tgz`. npm git-deps don't run nested builds reliably, can't target a subdirectory cleanly, and won't produce `dist/`. This will fail or install unbuilt source.

**Bottom line:** Git submodule (A) for normal use; in-tree copy (B) the moment you need to modify the reader for imaging coordinates. Pin to a specific upstream commit either way — the format has no stability guarantee.

---

## WASM-in-Browser: parquet-wasm concerns (the critical question)

### Cross-origin isolation / COOP / COEP / SharedArrayBuffer — **NOT required** ✅
- **`parquet-wasm@0.7.1` ships a single-threaded ESM build** — no `SharedArrayBuffer`, no WASM threads, therefore **no cross-origin isolation needed.**
- **Proof:** the upstream `mzpeakts` demo (https://hupo-psi.github.io/mzpeakts/app.html) runs on **GitHub Pages**, which cannot set COOP/COEP response headers. If the reader needed cross-origin isolation, that demo could not work.
- **Implication:** You do **NOT** need the `coi-serviceworker` workaround. Keep it that way — do not adopt any parquet-wasm build flag or feature that enables threads, or you'd be forced into the service-worker hack on GitHub Pages.

### Bundle size — the real cost to plan for ⚠️
- The full `parquet_wasm_bg.wasm` is **~6.5 MB uncompressed** (measured from the 0.7.1 tarball), **~1.2 MB brotli-compressed** (per docs). GitHub Pages serves gzip (not brotli) for static assets, so expect the wire cost closer to the gzip size (~1.5–2 MB) on first load.
- This is the single largest asset. Mitigations:
  - It's loaded **once** and cached; acceptable for a research/orientation tool.
  - parquet-wasm offers a **read-only, no-compression build (~456 KB brotli)**. Since mzPeak files in this app are *uncompressed* ZIP of Parquet and the explorer is read-only, a slimmer build *may* be viable later — but only if mzPeak Parquet columns don't use Parquet-internal compression codecs (snappy/zstd). **Default to the full build first**; investigate the minimal build as an optimization once a real file confirms which codecs appear. (Confidence: MEDIUM — depends on the operator's actual file.)

### How to serve the `.wasm` on Vite + GitHub Pages
- Use **`vite-plugin-wasm` + `vite-plugin-top-level-await`** (exactly as upstream does). Vite emits the `.wasm` as a hashed asset under `assets/` and rewrites the import URL to respect `base`. No manual copy needed.
- Set `base: '/<REPO>/'` so the WASM asset URL is correct on the project page. (If you publish to `<user>.github.io` root or a custom domain, `base: '/'`.)
- Vite serves `.wasm` with `Content-Type: application/wasm` automatically; GitHub Pages also serves `.wasm` with the correct MIME type. No `_headers` file or COOP/COEP config required.
- Do **not** use `vite-plugin-singlefile` (upstream uses it for a one-file demo) — inlining a 6.5 MB WASM as base64 would bloat HTML and break GitHub Pages caching. Ship the WASM as a separate hashed asset.

---

## GitHub Pages deploy (Vite SPA via GitHub Actions)

1. **`vite.config.ts`:** `base: '/<REPO>/'` (project page) — required so JS/CSS/WASM asset URLs resolve under the repo subpath.
2. **SPA routing:** keep routing hash-based or trivial (single page). If you ever add path routing, add a `404.html` copy of `index.html` (GitHub Pages SPA fallback). For this explorer, a single page is enough.
3. **Actions workflow** (official Vite-recommended pattern): trigger on push to `main` → `actions/checkout` → `setup-node` → `npm ci` (incl. submodule build for mzpeakts) → `npm run build` → `actions/upload-pages-artifact` (`dist/`) → `actions/deploy-pages`. Set **Settings → Pages → Source = GitHub Actions**.
4. **Submodule in CI:** `actions/checkout` with `submodules: recursive`, then build the vendored `mzpeakts/lib` before `npm run build` (or commit its prebuilt `dist/`). Otherwise `file:vendor/mzpeakts/lib` resolves to an unbuilt package.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Canvas 2D heatmap | WebGL / regl / deck.gl | Only if ion images grow to >~1M pixels or need GPU-side colormap remapping at interactive rates. Not needed for v1 single 2D run. |
| uPlot | Plotly.js / Chart.js / ECharts | If you need rich built-in interactions, legends, exports out-of-the-box and don't care about bundle size. uPlot wins on speed + size for dense spectra. |
| parquet-wasm (full build) | parquet-wasm read-only minimal build (~456 KB brotli) | Once a real mzPeak file confirms no internal Parquet compression codecs are used → big bundle-size win. |
| Prettier | **Biome** (`@biomejs/biome@2.4.16`) | If you want one fast Rust tool for lint+format and are willing to diverge from upstream's ESLint config. Biome is a legitimate 2026 choice; chose Prettier+ESLint here for ecosystem parity with `mzpeakts` and mature TS/React rule coverage. |
| Git submodule for mzpeakts | In-tree source copy | When the imaging coordinate layer requires deep edits inside the reader. |
| TypeScript ~5.9 | TypeScript 6.0.3 | Once `typescript-eslint` and `vite-plugin-dts` confirm TS 6 support. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **npm git-dependency for mzpeakts** (`github:HUPO-PSI/mzpeakts`) | No root `package.json`; publishable pkg is the `/lib` subdir and needs a build + vendored parquet-wasm tgz. Git-deps don't build nested subdirs reliably. | Git submodule + `file:` install, or in-tree copy. |
| **coi-serviceworker / COOP-COEP setup** | parquet-wasm 0.7.1 is single-threaded; cross-origin isolation is unnecessary and the service-worker hack adds a forced reload + fragility. | Nothing — the ESM build needs no isolation. |
| **vite-plugin-singlefile** for production | Would inline the ~6.5 MB WASM as base64 → huge HTML, no caching, slow first paint. | Default Vite multi-asset build with hashed `.wasm`. |
| **Floating apache-arrow to a different major than 21.x** | parquet-wasm + arrow-js-ffi expect Arrow 21's memory layout; a mismatch causes silent zero-copy corruption or runtime errors. | Pin `apache-arrow@21.1.0` to match upstream. |
| **A React wrapper lib for uPlot** | Adds a dependency and re-render overhead for a chart that's simpler to mount via `useRef` + imperative `new uPlot(...)`. | Mount uPlot directly into a ref'd div; update via `setData`. |
| **TypeScript 6.0 right now** (despite being npm `latest`) | Too new for `typescript-eslint`/`vite-plugin-dts`; upstream pins 5.6. | `typescript@~5.9`. |
| **ESLint 10 right now** | Plugin ecosystem (typescript-eslint 8, react-hooks) still targets ESLint 9 flat config. | `eslint@~9`. |
| **asyncio/web-workers for parsing in v1** | Premature; parquet-wasm calls are async and fast enough for orientation use. A worker can come later if a huge file blocks the main thread. | Main-thread async reads first; profile before adding a worker. |
| **Reimplementing ZIP/Parquet/Arrow** | Explicitly out of scope; large and error-prone. | Vendor `mzpeakts`. |

---

## Stack Patterns by Variant

**If the operator's real `.mzpeak` uses Parquet-internal compression (snappy/zstd):**
- Keep the **full parquet-wasm build** (you need the codecs). Accept the ~6.5 MB WASM.

**If the file's Parquet columns are uncompressed/plain:**
- Investigate the **read-only minimal parquet-wasm build** (~456 KB brotli) for a large bundle-size cut.

**If the imaging coordinate layer needs reader-internal changes:**
- Switch from git-submodule consumption to **in-tree copy of `lib/src/*.ts`** so you can edit `metadata.ts` / `reader.ts` to expose `IMS:1000050/51` position cvParams.

**If you later need to parse very large files without UI jank:**
- Move `MzPeakReader` calls into a **Web Worker** (no SharedArrayBuffer needed — pass results via structured clone / transferable typed arrays). Still no COOP/COEP requirement.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| vite@8.0.16 | @vitejs/plugin-react@6.0.2 | plugin-react 6 peer = `vite ^8.0.0` ✅ |
| vite@8.0.16 | vite-plugin-wasm@3.6.0 | peer `vite ^2…^8` — Vite 8 explicitly supported ✅ |
| vite@8.0.16 | vite-plugin-top-level-await@1.6.0 | peer `vite >=2.8` ✅ |
| react@19.2.7 | @types/react@19.2.16, @types/react-dom@19.2.3 | match major ✅ |
| parquet-wasm@0.7.1 | apache-arrow@21.1.0 + arrow-js-ffi@0.4.3 | the trio mzpeakts pins; do not split majors ⚠️ |
| mzpeakts (lib) | @zip.js/zip.js ^2.8.23 (use 2.8.26) | minor bump safe ✅ |
| eslint@~9 | typescript-eslint@8.60.1, eslint-plugin-react-hooks@7.1.1 | ESLint 9 flat config ✅ (avoid ESLint 10) |
| typescript@~5.9 | typescript-eslint@8.x | TS 6.0 is `latest` on npm but ahead of the lint toolchain ⚠️ |

---

## Sources

- npm registry (`npm view`) — exact current versions of vite (8.0.16), react/react-dom (19.2.7), typescript (latest 6.0.3, recommend ~5.9), uplot (1.6.32), parquet-wasm (0.7.1, released 2025-10-03), apache-arrow (21.1.0), arrow-js-ffi (0.4.3), @zip.js/zip.js (2.8.26), vitest (4.1.8), @playwright/test (1.60.0), eslint (latest 10.4.1, recommend ~9), prettier (3.8.3), @biomejs/biome (2.4.16), vite-plugin-wasm (3.6.0), vite-plugin-top-level-await (1.6.0), @vitejs/plugin-react (6.0.2), typescript-eslint (8.60.1). — HIGH
- GitHub API `HUPO-PSI/mzpeakts` (default branch `main`, pushed 2026-05-30) — repo layout (`lib/` is the package, no root package.json), `lib/package.json` (deps incl. `parquet-wasm: file:vendor/.../parquet-wasm-0.7.1.tgz`, apache-arrow ^21.1.0, arrow-js-ffi ^0.4.3, zip.js ^2.8.23; build `tsc && vite build`; exports → dist), `lib/vite.config.js` (wasm + top-level-await + dts plugins), README (single-threaded browser reader, demo on GitHub Pages), app/package.json (React 18, vite-plugin-singlefile). — HIGH
- parquet-wasm 0.7.1 published tarball (downloaded + extracted) — measured `parquet_wasm_bg.wasm` ≈ 6.5 MB uncompressed; three bundles (bundler/esm/node); exports map. — HIGH
- kylebarron/parquet-wasm README (WebFetch) — no SharedArrayBuffer/COOP-COEP/threads mention; ESM build needs no isolation; brotli 1.2 MB full / 456 KB minimal read-only. — HIGH
- web.dev COOP/COEP article + GitHub community discussion #13309 + gzuidhof/coi-serviceworker — cross-origin isolation is required for SharedArrayBuffer; GitHub Pages cannot set those headers (so the single-threaded path matters). — HIGH
- vite.dev/guide/static-deploy (WebFetch) — `base: '/<REPO>/'` for project pages; official GitHub Actions deploy workflow (build → upload-pages-artifact → deploy-pages). — HIGH

---
*Stack research for: client-side mzPeak MSI explorer (Vite/React/TS, in-browser Parquet/Arrow WASM, Canvas heatmaps, uPlot spectra, GitHub Pages)*
*Researched: 2026-06-03*
