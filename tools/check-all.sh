#!/usr/bin/env bash
# Full verification of the current game:
#   1. the level gate on every level (layout, route, depth, gems, bot win, roof, solo check),
#   2. the Dodgeball rules check (tools/check-dodge.js, about 5 s),
#   3. the Runner fairness proof (tools/check-runner.js, about 5 min on 6 jobs).
# LEVELS=1,5,9 limits the gate to those levels. FAST=1 skips the gate's solo check (it is
# passed straight to gate.js). The full gate is slow: level 29's solo check alone takes about
# 27 minutes, and a crate level's solo search can take 800 MB.
cd "$(dirname "$0")/.."
fail=0
echo "--- level gate ---"
node tools/gate.js ${LEVELS:-} || fail=1
echo "--- dodgeball ---"
node tools/check-dodge.js || fail=1
echo "--- runner ---"
node tools/check-runner.js || fail=1
[ $fail = 0 ] && echo "All checks passed." || echo "Some checks failed."
exit $fail
