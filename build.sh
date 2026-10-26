#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/engine"

echo "==> Compiling minimalmaze_engine to wasm32-unknown-unknown (release)..."
cargo build --target wasm32-unknown-unknown --release

echo "==> Updating engine.wasm..."
cp target/wasm32-unknown-unknown/release/minimalmaze_engine.wasm ../engine.wasm

echo "==> Generating embedded base64 fallback in wasm_embedded.js..."
node -e '
const fs = require("fs");
const b64 = fs.readFileSync("../engine.wasm").toString("base64");
fs.writeFileSync("../wasm_embedded.js", `window.__EMBEDDED_WASM_BASE64__ = "${b64}";\n`);
'

echo "==> Build complete. engine.wasm ($(wc -c < ../engine.wasm) bytes)"
