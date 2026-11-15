#!/usr/bin/env bash
# Deploy to maze.oiupoyt.space (served by ~/services/minimalmaze/server.js behind a Cloudflare tunnel).
# Stamps asset URLs with a content hash because Cloudflare caches .js/.css/.wasm for 4h.
set -euo pipefail
cd "$(dirname "$0")"
HOST=${DEPLOY_HOST:-oiupoyt@130.61.117.228}
DEST=${DEPLOY_DIR:-/home/oiupoyt/services/minimalmaze}
SITE=${DEPLOY_URL:-https://maze.oiupoyt.space}
FILES="index.html app.js core_logic.js style.css engine.wasm wasm_embedded.js preview.png"

STAMP=$(cat app.js core_logic.js style.css engine.wasm wasm_embedded.js | sha256sum | cut -c1-10)
sed -i -E "s/((src|href)=\"(style\.css|wasm_embedded\.js|core_logic\.js|app\.js))(\?v=[^\"]*)?\"/\1?v=$STAMP\"/" index.html
echo "==> stamp $STAMP"

echo "==> tests"
node --test tests/game_logic.test.js >/dev/null
cargo test --quiet --manifest-path engine/Cargo.toml >/dev/null

echo "==> backup + sync $HOST:$DEST"
ssh -o BatchMode=yes "$HOST" "cp -a $DEST $DEST.bak-\$(date +%Y%m%d-%H%M%S)"
rsync -a --checksum -e "ssh -o BatchMode=yes" $FILES "$HOST:$DEST/"

echo "==> verify $SITE"
fail=0
for f in index.html app.js core_logic.js style.css engine.wasm wasm_embedded.js; do
  q=""; [ "$f" != index.html ] && q="?v=$STAMP"
  live=$(curl -fsS -m 15 "$SITE/$f$q" | sha256sum | cut -c1-12); local_=$(sha256sum < $f | cut -c1-12)
  [ "$live" = "$local_" ] && echo "  ok   $f" || { echo "  DIFF $f"; fail=1; }
done
curl -fsSI -m 15 "$SITE/engine.wasm?v=$STAMP" | grep -qi "content-type: application/wasm" && echo "  ok   wasm mime" || { echo "  BAD wasm mime"; fail=1; }
exit $fail
