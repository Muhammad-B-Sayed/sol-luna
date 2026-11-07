#!/usr/bin/env bash
# Renders docs/img/level-N.jpg (labelled start) and level-N-steps.jpg (four solution
# moments) for the rooms in tools/capture/record-states.js, using the real renderer
# in headless Chrome. macOS: needs Google Chrome and `sips`.
#   ./tools/capture.sh
set -e
cd "$(dirname "$0")/.."
CH=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-3199}
mkdir -p public/_cap docs/img
trap 'rm -rf public/_cap; [ -n "$SRV" ] && kill $SRV 2>/dev/null' EXIT
cp tools/capture/index.html public/_cap/index.html
node tools/capture/record-states.js public/_cap/states.json
PORT=$PORT node server/index.js >/dev/null 2>&1 & SRV=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf "localhost:$PORT/healthz" >/dev/null && break; node -e "setTimeout(()=>{},300)"; done
shot() { "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=960,720 --virtual-time-budget=4000 \
  --screenshot="$PWD/docs/img/$1.png" "http://localhost:$PORT/_cap/index.html?$2" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 82 "docs/img/$1.png" --out "docs/img/$1.jpg" >/dev/null && rm "docs/img/$1.png"; }
for n in $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('public/_cap/states.json','utf8'))).join(' '))"); do
  shot "level-$n" "level=$n&labels"
  shot "level-$n-steps" "level=$n&grid"
  echo "docs/img/level-$n.jpg, docs/img/level-$n-steps.jpg"
done
