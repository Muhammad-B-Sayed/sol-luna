#!/usr/bin/env bash
# Run the reachability checker for every level in parallel, plus the scripted
# co-op playthroughs. Crate levels with a co-op script are verified by the bot.
cd "$(dirname "$0")/.."
N=$(node -e "import('./shared/levels.js').then(m=>console.log(m.LEVELS.length))")
BOT=$(node -e "import('./tools/coop-bot.js').then(m=>console.log(Object.keys(m.SCRIPTS).join(' ')))")
# Parallel jobs: JOBS env var, else CPU count (nproc on Linux, sysctl on macOS).
JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)}
T=$(mktemp -d)
for i in $(seq 1 "$N"); do
  case " $BOT " in *" $i "*) continue;; esac
  echo "$i"
done | xargs -P "$JOBS" -I{} sh -c "node tools/check-levels.js {} > $T/{}.txt 2>&1"
for i in $(seq 1 "$N"); do [ -f "$T/$i.txt" ] && grep -v "problem\|All levels" "$T/$i.txt" | sed '/^$/d'; done
rm -rf "$T"
echo "--- co-op bot ---"
node tools/coop-bot.js
