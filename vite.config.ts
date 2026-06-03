import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { fileURLToPath } from "node:url";

// GitHub Pages project-page base. This is a PLACEHOLDER — the final repo path is
// finalized/hardened in Phase 5 (see SKELETON.md "Deployment"). For local dev /
// preview / CI it does not matter; for a project page it must be `/<repo>/`.
const BASE = process.env.VITE_BASE ?? "/mzPeakIV/";

// The vendored reader's PUBLISHED bundle (dist/mzpeakts.js) inlines the
// parquet-wasm binary as a base64 data URL (vite-plugin-wasm lib mode). To ship
// the WASM as a SEPARATE hashed asset (STACK.md: never inline the ~6.5 MB wasm),
// we point the bundler at the reader's TypeScript SOURCE instead of its dist, so
// THIS app's vite-plugin-wasm processes parquet-wasm and emits a hashed .wasm.
// The `mzpeakts` file: dependency still provides the package + its .d.ts types;
// this alias only redirects module resolution for bundling/test.
const mzpeaktsSrc = fileURLToPath(
  new URL("./vendor/mzpeakts/lib/src/index.ts", import.meta.url),
);

// NOTE: intentionally NO COOP/COEP headers, NO coi-serviceworker, NO
// vite-plugin-singlefile. parquet-wasm 0.7.1 is single-threaded ESM and needs no
// cross-origin isolation (STACK.md).
export default defineConfig({
  base: BASE,
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      mzpeakts: mzpeaktsSrc,
    },
  },
  build: {
    target: "es2022",
    // Never inline the wasm — keep it a hashed asset for caching.
    assetsInlineLimit: 0,
  },
});
