#!/usr/bin/env bash
# Full verification:
#   1. the reachability checker on every level (crate levels with a co-op script
#      are covered by the bot instead, because their search is slow),
#   2. the scripted two-player playthroughs,
#   3. the dependency checks for the co-op rooms (each player really needs the other).
# JOBS=<n> caps parallel checker runs (default: CPU count).
cd "$(dirname "$0")/.."
N=$(node -e "import('./shared/levels.js').then(m=>console.log(m.LEVELS.length))")
SKIP=$(node --input-type=module -e "
import { LEVELS } from './shared/levels.js';
import { SCRIPTS } from './tools/coop-bot.js';
console.log(Object.keys(SCRIPTS).filter(n => LEVELS[n - 1].map.some(r => r.includes('k'))).join(' '));")
# Parallel jobs: JOBS env var, else CPU count (nproc on Linux, sysctl on macOS).
JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)}
T=$(mktemp -d)
for i in $(seq 1 "$N"); do
  case " $SKIP " in *" $i "*) continue;; esac
  echo "$i"
done | xargs -P "$JOBS" -I{} sh -c "node tools/check-levels.js {} > $T/{}.txt 2>&1"
fail=0
for i in $(seq 1 "$N"); do [ -f "$T/$i.txt" ] && grep -v "problem\|All levels" "$T/$i.txt" | sed '/^$/d'; done
grep -l "CHECK" "$T"/*.txt >/dev/null 2>&1 && fail=1
rm -rf "$T"
echo "--- co-op bot ---"
node tools/coop-bot.js || fail=1
echo "--- dependency checks ---"
node tools/check-deps.js || fail=1
exit $fail
