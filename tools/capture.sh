#!/usr/bin/env bash
# Renders docs/img/level-N.jpg (the room at its start, with any LABELS from
# tools/capture/index.html) for the rooms in tools/capture/record-states.js, and
# level-N-steps.jpg for rooms that list solution states there (none do now), using the real renderer
# in headless Chrome. macOS: needs Google Chrome and `sips`. Elsewhere: set CHROME (for example
# CHROME=/usr/bin/chromium) and have ImageMagick's `magick`; CHROME_FLAGS adds flags such as
# --user-data-dir=/tmp/some-profile so a running browser profile is left alone.
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
tojpg() { if command -v sips >/dev/null; then sips -s format jpeg -s formatOptions 82 ${2:+--resampleWidth $2} "$1.png" --out "$1.jpg" >/dev/null
  else magick "$1.png" ${2:+-resize $2x} -quality 82 "$1.jpg"; fi && rm "$1.png"; }
shot() { "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=960,720 --virtual-time-budget=4000 ${CHROME_FLAGS:-} \
  --screenshot="$PWD/docs/img/$1.png" "http://localhost:$PORT/_cap/index.html?$2" >/dev/null 2>&1
  tojpg "docs/img/$1" "$3"; }
ONLY=${ONLY:-}   # e.g. ONLY="1 2 3" to re-render just those rooms
for n in $(node -e "const s=JSON.parse(require('fs').readFileSync('public/_cap/states.json','utf8'));console.log(Object.keys(s).filter(k=>!process.argv[1]||process.argv[1].split(' ').includes(k)).map(k=>k+':'+s[k].length).join(' '))" "$ONLY"); do
  steps=${n#*:}; n=${n%%:*}
  if [ "$steps" = 0 ]; then
    shot "level-$n" "level=$n&labels" 640; echo "docs/img/level-$n.jpg"
  else
    shot "level-$n" "level=$n&labels"
    shot "level-$n-steps" "level=$n&grid"
    echo "docs/img/level-$n.jpg, docs/img/level-$n-steps.jpg"
  fi
done
