#!/usr/bin/env bash
# Run the level checker for every level in parallel (one process per level).
cd "$(dirname "$0")/.."
N=$(node -e "import('./shared/levels.js').then(m=>console.log(m.LEVELS.length))")
T=$(mktemp -d)
seq 1 "$N" | xargs -P "$(nproc)" -I{} sh -c "node tools/check-levels.js {} > $T/{}.txt 2>&1"
for i in $(seq 1 "$N"); do grep -v "problem\|All levels" "$T/$i.txt" | sed '/^$/d'; done
rm -rf "$T"
