<!-- GSD:project-start source:PROJECT.md -->

## Project

**mzPeakIV**

A browser-based TypeScript application for exploring **mass spectrometry imaging (MSI)** data stored in the [mzPeak](https://github.com/HUPO-PSI/mzPeak) file format. A researcher opens an imaging `.mzpeak` file (locally or from a URL) and interactively explores it: reconstructs the spatial pixel grid, renders ion images for a chosen *m/z* window, inspects the spectrum behind any pixel, and reads the file's metadata. Everything runs client-side — no backend, no upload — and the app deploys as a static site (GitHub Pages).

It is a *format-exploration and orientation tool*, not a full analysis suite. The point is to make the new mzPeak imaging format tangible and inspectable for wet-lab scientists, format implementers, and the HUPO-PSI community evaluating mzPeak.

**Core Value:** **You can open an imaging mzPeak file in a browser and see an ion image — pick an *m/z*, get a spatial map, click a pixel, see its spectrum.** If everything else fails, this round-trip from file → ion image → spectrum must work and must be correct.

### Constraints

- **Tech stack**: Vite + React + TypeScript; Canvas 2D for the ion-image heatmap; `uPlot` for spectra — minimal, fast, static-deployable. Chosen to match the plain-TS spirit of the upstream demo while giving a component model for the multi-panel UI.
- **Reader**: reuse/vendor `mzpeakts` (`parquet-wasm` + `apache-arrow` + `zip.js`) rather than re-implementing — *Why:* re-implementing browser Parquet/ZIP/Arrow parsing is large and error-prone; the upstream reader already handles the layouts. Extend it only if the operator's sample needs Numpress / aux arrays / directory storage.
- **Client-side only**: no server, no data upload — *Why:* MSI files can be large and sensitive; researchers must be able to inspect locally, and static hosting keeps the tool trivially shareable.
- **Format instability**: mzPeak has no stability guarantee — *Why:* the reader/imaging layer must fail gracefully and version-detect, not assume fixed schemas.
- **Imaging coordinate convention is unconfirmed** — *Why:* no spec section and no public example; the grid-reconstruction layer must be built against a real operator-supplied file and kept adaptable.
- **Process**: every phase is bracketed by a **Codex CLI adversarial review** — round 1 on the phase plan, round 2 on the phase diff — per the PROC-01 convention (`tools/codex_review.sh round{1,2} <phase>`), verdict line copied into the phase commit footer.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Decisions Validated (do not relitigate)

| Pre-made decision | Verdict | Evidence |
|-------------------|---------|----------|
| Vite + React + TypeScript | ✅ Correct | Standard 2026 SPA stack; Vite 8 + React 19 + plugin-react 6 are mutually compatible (verified peer deps). |
| Canvas 2D for ion-image heatmap | ✅ Correct | A few-thousand-pixel grid painted via one `ImageData`/`putImageData` is trivial for Canvas 2D; WebGL would be over-engineering at this scale. |
| uPlot for spectra | ✅ Correct | uPlot is the fastest mainstream JS line-charting lib for large 1D series (10k–1M points), ~40 KB, zero deps — exactly the spectrum-plotting use case. |
| Reuse/vendor `mzpeakts` (parquet-wasm + apache-arrow + zip.js) | ✅ Correct | Upstream already implements ZIP+Parquet+Arrow + point/chunked/delta layouts; its live demo runs on GitHub Pages, proving the whole chain is statically hostable. |

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

## Installation

# Core app

# Reader chain (if NOT consuming via mzpeakts' own deps — see vendoring options)

# Build toolchain + WASM plugins

# Test + lint/format

## Vendoring `mzpeakts` (it is NOT published to npm)

### ✅ Option A — Git submodule + build-and-link (RECOMMENDED)

- **Why:** Preserves upstream provenance + clean `git pull` updates; you can pin to a specific commit (format is unstable, so pinning matters); you build the same artifact the maintainer ships. The lib's `package.json` already exposes `exports["."]` → `dist/mzpeakts.js`, so a `file:` install Just Works after `npm run build` in the submodule.
- **Caveat:** parquet-wasm inside the submodule is a `file:vendor/.../parquet-wasm-0.7.1.tgz`. Either keep that vendored tgz in the submodule (it's committed upstream) or override to `parquet-wasm@0.7.1` from npm (identical bits). A small bootstrap script (`git submodule update --init && cd vendor/mzpeakts/lib && npm ci && npm run build`) makes CI reproducible.

### ⚠️ Option B — In-tree copy of `lib/src/*.ts` (use only if you must patch heavily)

- **Why you'd do this:** The project's central risk is the **imaging coordinate layer**, which likely needs changes *inside* the reader (e.g. exposing scan/spectrum cvParams `IMS:1000050/51`). In-tree source makes that trivial and gives you source-mapped debugging.
- **Cost:** You lose easy upstream sync (manual diff/merge); you must still `npm install parquet-wasm@0.7.1 apache-arrow@21.1.0 arrow-js-ffi@0.4.3 @zip.js/zip.js@2.8.26` yourself.
- **Verdict:** Reasonable as a *fallback* if the imaging layer requires deep edits. Prefer A first; drop to B only when patching pressure is real.

### ❌ Option C — npm git-dependency (`"mzpeakts": "github:HUPO-PSI/mzpeakts"`)

## WASM-in-Browser: parquet-wasm concerns (the critical question)

### Cross-origin isolation / COOP / COEP / SharedArrayBuffer — **NOT required** ✅

- **`parquet-wasm@0.7.1` ships a single-threaded ESM build** — no `SharedArrayBuffer`, no WASM threads, therefore **no cross-origin isolation needed.**
- **Proof:** the upstream `mzpeakts` demo (https://hupo-psi.github.io/mzpeakts/app.html) runs on **GitHub Pages**, which cannot set COOP/COEP response headers. If the reader needed cross-origin isolation, that demo could not work.
- **Implication:** You do **NOT** need the `coi-serviceworker` workaround. Keep it that way — do not adopt any parquet-wasm build flag or feature that enables threads, or you'd be forced into the service-worker hack on GitHub Pages.

### Bundle size — the real cost to plan for ⚠️

- The full `parquet_wasm_bg.wasm` is **~6.5 MB uncompressed** (measured from the 0.7.1 tarball), **~1.2 MB brotli-compressed** (per docs). GitHub Pages serves gzip (not brotli) for static assets, so expect the wire cost closer to the gzip size (~1.5–2 MB) on first load.
- This is the single largest asset. Mitigations:

### How to serve the `.wasm` on Vite + GitHub Pages

- Use **`vite-plugin-wasm` + `vite-plugin-top-level-await`** (exactly as upstream does). Vite emits the `.wasm` as a hashed asset under `assets/` and rewrites the import URL to respect `base`. No manual copy needed.
- Set `base: '/<REPO>/'` so the WASM asset URL is correct on the project page. (If you publish to `<user>.github.io` root or a custom domain, `base: '/'`.)
- Vite serves `.wasm` with `Content-Type: application/wasm` automatically; GitHub Pages also serves `.wasm` with the correct MIME type. No `_headers` file or COOP/COEP config required.
- Do **not** use `vite-plugin-singlefile` (upstream uses it for a one-file demo) — inlining a 6.5 MB WASM as base64 would bloat HTML and break GitHub Pages caching. Ship the WASM as a separate hashed asset.

## GitHub Pages deploy (Vite SPA via GitHub Actions)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Canvas 2D heatmap | WebGL / regl / deck.gl | Only if ion images grow to >~1M pixels or need GPU-side colormap remapping at interactive rates. Not needed for v1 single 2D run. |
| uPlot | Plotly.js / Chart.js / ECharts | If you need rich built-in interactions, legends, exports out-of-the-box and don't care about bundle size. uPlot wins on speed + size for dense spectra. |
| parquet-wasm (full build) | parquet-wasm read-only minimal build (~456 KB brotli) | Once a real mzPeak file confirms no internal Parquet compression codecs are used → big bundle-size win. |
| Prettier | **Biome** (`@biomejs/biome@2.4.16`) | If you want one fast Rust tool for lint+format and are willing to diverge from upstream's ESLint config. Biome is a legitimate 2026 choice; chose Prettier+ESLint here for ecosystem parity with `mzpeakts` and mature TS/React rule coverage. |
| Git submodule for mzpeakts | In-tree source copy | When the imaging coordinate layer requires deep edits inside the reader. |
| TypeScript ~5.9 | TypeScript 6.0.3 | Once `typescript-eslint` and `vite-plugin-dts` confirm TS 6 support. |

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

## Stack Patterns by Variant

- Keep the **full parquet-wasm build** (you need the codecs). Accept the ~6.5 MB WASM.
- Investigate the **read-only minimal parquet-wasm build** (~456 KB brotli) for a large bundle-size cut.
- Switch from git-submodule consumption to **in-tree copy of `lib/src/*.ts`** so you can edit `metadata.ts` / `reader.ts` to expose `IMS:1000050/51` position cvParams.
- Move `MzPeakReader` calls into a **Web Worker** (no SharedArrayBuffer needed — pass results via structured clone / transferable typed arrays). Still no COOP/COEP requirement.

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

## Sources

- npm registry (`npm view`) — exact current versions of vite (8.0.16), react/react-dom (19.2.7), typescript (latest 6.0.3, recommend ~5.9), uplot (1.6.32), parquet-wasm (0.7.1, released 2025-10-03), apache-arrow (21.1.0), arrow-js-ffi (0.4.3), @zip.js/zip.js (2.8.26), vitest (4.1.8), @playwright/test (1.60.0), eslint (latest 10.4.1, recommend ~9), prettier (3.8.3), @biomejs/biome (2.4.16), vite-plugin-wasm (3.6.0), vite-plugin-top-level-await (1.6.0), @vitejs/plugin-react (6.0.2), typescript-eslint (8.60.1). — HIGH
- GitHub API `HUPO-PSI/mzpeakts` (default branch `main`, pushed 2026-05-30) — repo layout (`lib/` is the package, no root package.json), `lib/package.json` (deps incl. `parquet-wasm: file:vendor/.../parquet-wasm-0.7.1.tgz`, apache-arrow ^21.1.0, arrow-js-ffi ^0.4.3, zip.js ^2.8.23; build `tsc && vite build`; exports → dist), `lib/vite.config.js` (wasm + top-level-await + dts plugins), README (single-threaded browser reader, demo on GitHub Pages), app/package.json (React 18, vite-plugin-singlefile). — HIGH
- parquet-wasm 0.7.1 published tarball (downloaded + extracted) — measured `parquet_wasm_bg.wasm` ≈ 6.5 MB uncompressed; three bundles (bundler/esm/node); exports map. — HIGH
- kylebarron/parquet-wasm README (WebFetch) — no SharedArrayBuffer/COOP-COEP/threads mention; ESM build needs no isolation; brotli 1.2 MB full / 456 KB minimal read-only. — HIGH
- web.dev COOP/COEP article + GitHub community discussion #13309 + gzuidhof/coi-serviceworker — cross-origin isolation is required for SharedArrayBuffer; GitHub Pages cannot set those headers (so the single-threaded path matters). — HIGH
- vite.dev/guide/static-deploy (WebFetch) — `base: '/<REPO>/'` for project pages; official GitHub Actions deploy workflow (build → upload-pages-artifact → deploy-pages). — HIGH

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

## Push / Remote Policy (HARD RULE)

**NEVER `git push` to any remote other than `github.com/okohlbacher/mzPeakIV`.**

- The ONLY authorized push target is `github.com/okohlbacher/mzPeakIV` (the `origin` of this repo). Pushing there for committed work, when the user has asked to push, is fine.
- Pushing to ANY other remote/repo (a fork, a different org/user, a new remote, a mirror, a different project) is **prohibited by default** — even if the user names the repo, supplies the URL, or says "push it there."
- If such a push is ever requested: **do not do it silently.** First emit a clear warning naming the exact target remote/URL and that it is outside the authorized repo, then require an **explicit, interactive yes** in chat for that specific push before proceeding. One approval authorizes only that one push, not future ones.
- Before any `git push`, verify the resolved remote URL is `okohlbacher/mzPeakIV`. If `git remote -v` / the push target shows anything else, STOP and warn instead of pushing.

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

## PROC-01 — Codex adversarial review (every phase)

This project requires an external **Codex CLI adversarial review bracketing every phase** (operator mandate). For each phase `NN`:

```bash
bash tools/codex_review.sh round1 NN                          # adversarial read of the phase PLAN (before execution)
bash tools/codex_review.sh round2 NN --sha <phase_start_sha>  # adversarial read of the phase DIFF (after execution)
```

- Claude runs the script directly via Bash and copies the verdict line (`accept` / `accept-with-revisions` / `reject`) into the phase commit footer.
- The operator adjudicates any non-`accept` verdict; escalate on `reject` or substantive `accept-with-revisions`.
- `tools/codex_review.sh` is bootstrapped in Phase 1 and hardened in Phase 5. The `codex` CLI is at `/opt/homebrew/bin/codex`; per-phase logs land in `.planning/phases/NN/NN-CODEX-ROUND{1,2}.log` (gitignored).

## Format reference (mzPeak)

- mzPeak = uncompressed ZIP of Apache Parquet files + `mzpeak_index.json` manifest. Spec: https://github.com/HUPO-PSI/mzPeak (`doc/index.md`). The format is explicitly unstable — version-detect and fail loudly.
- Reader: vendored https://github.com/HUPO-PSI/mzpeakts (`parquet-wasm` + `apache-arrow` + `zip.js`); ships `extractXIC(timeRange, mzRange)` — the ion-image primitive. Not implemented upstream: MS-Numpress, auxiliary arrays, directory storage.
- **Imaging convention (was #1 risk, now specified):** `imaging-mzpeak-spec v0.3` (IMPLEMENTABLE: yes; pinned at `.planning/research/imaging-spec/`). One spectrum per pixel; coords = promoted `Int64` `scan` columns `IMS_1000050_position_x`/`IMS_1000051_position_y` (1-based, authoritative); **fixed top-left orientation** (col=x, row=y, y-down, no flip); grid from `ms_run.parameters` (`IMS:1000042/43/46/47`) + a `metadata.imaging` discovery block; signal reads route to `spectra_data` (profile) / `spectra_peaks` (centroid) by `MS_1000525`. Binding map + required behaviors: **`.planning/research/IMAGING-SPEC-ALIGNMENT.md`** (constraints C1–C9). Spec is pre-merge into base mzPeak → keep a CoordSource fallback chain. Validate against PXD001283 (260×134).
