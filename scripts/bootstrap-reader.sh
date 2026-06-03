#!/usr/bin/env bash
#
# Bootstrap the vendored mzpeakts reader.
#
# This MUST run BEFORE the app's `npm install`, because the app depends on the
# reader via `"mzpeakts": "file:vendor/mzpeakts/lib"`, and that file: dependency
# resolves against `vendor/mzpeakts/lib/dist/`, which only exists after the
# vendored lib has been built.
#
# Steps:
#   1. Init/update the git submodule (pinned to a specific upstream commit).
#   2. Install the vendored lib's own deps (incl. the committed parquet-wasm tgz).
#   3. Build the lib so `dist/mzpeakts.js` + `dist/mzpeakts.d.ts` exist.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[bootstrap] root = $ROOT"

echo "[bootstrap] updating git submodules (recursive) ..."
git submodule update --init --recursive

LIB_DIR="$ROOT/vendor/mzpeakts/lib"
if [ ! -d "$LIB_DIR" ]; then
  echo "[bootstrap] ERROR: $LIB_DIR not found. Is the submodule registered?" >&2
  exit 1
fi

echo "[bootstrap] installing vendored reader deps ..."
# Upstream commits a package-lock.json but its parquet-wasm is a local file: tgz;
# `npm ci` is preferred for reproducibility but falls back to `npm install` if the
# lockfile and the local tgz drift.
( cd "$LIB_DIR" && (npm ci || npm install) )

echo "[bootstrap] building vendored reader (tsc && vite build) ..."
( cd "$LIB_DIR" && npm run build )

if [ ! -f "$LIB_DIR/dist/mzpeakts.js" ]; then
  echo "[bootstrap] ERROR: dist/mzpeakts.js was not produced." >&2
  exit 1
fi

echo "[bootstrap] OK: $LIB_DIR/dist/mzpeakts.js exists."
