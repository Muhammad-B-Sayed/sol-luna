# Dodgeball online latency study (work log)

Goal: measure how much harder dodging is online, prototype two fixes
(A: per-room ball speed from measured ping, B: server-side rewind), compare.

Branches: `dodge-latency-study` (from `low-gravity`), `dodge-fix-a-ballspeed`, `dodge-fix-b-rewind`
(both from the study branch). Nothing is merged.

## Harness

`node tools/dodge-latency.js` (about 6 min for all latencies). It starts the real server
(`server/index.js`) once per latency with `LAG_MS` set, so every message is delayed that much in
each direction (round trip = 2 x LAG). Each trial is a fresh room with two Node `ws` clients that
predict and reconcile like `public/js/main.js` and step the real `shared/dodge.js`. Scripted
players: the thrower walks to a spot and taps a flat throw; the defender walks to their back
wall (or stays on the spawn) and jumps r ticks after the ball first shows on their own screen.
The raw server snapshot decides hit or dodge. Local play is the same bots on one state.

Columns: `seen` = ticks the defender sees the ball fly before contact; `late` = ticks of flight
already gone when it first shows; `dodge r` = reactions (ticks after first sight) that still
dodge; `latest` = the latest as ms; `thr seen` = ticks the thrower sees their own ball fly
before contact; `thr gap` = on the thrower's screen, ticks from release to seeing the defender
jump, for the latest dodge; `phantom` = dodges the thrower first saw as a hit.

Spots: `back wall` = both at their back walls (35-tick flight); `mid (spawn)` = thrower on the
spawn, defender at the back wall (24); `near net` = thrower at the veil, defender at the back
wall (19, the 457 px case in HANDOFF); `spawn to spawn` (13-14).

## Baseline (dodge-latency-study, one-way latency)

```
latency  spot            seen  late  dodge r          latest    thr seen thr gap phantom
local    back wall       35    0     r 1-33           550 ms    35       33      0/33
local    mid (spawn)     24    0     r 1-21           350 ms    24       21      0/21
local    near net        17    0     r 1-14           233 ms    17       14      0/14
local    spawn to spawn  13    0     r 1-10           167 ms    13       10      0/10
0 ms     back wall       35    1     r 1-33           550 ms    35       34      0/33
0 ms     mid (spawn)     23    1     r 1-21           350 ms    24       22      0/21
0 ms     near net        16    1     r 1-13           217 ms    17       15      0/13
0 ms     spawn to spawn  12    1     r 1-9            150 ms    13       11      0/9
20 ms    back wall       32    4     r 1-29           483 ms    35       36      2/29
20 ms    mid (spawn)     20    4     r 1-17           283 ms    24       23      0/17
20 ms    near net        13    4     r 1-10           167 ms    17       18      1/10
20 ms    spawn to spawn  9     4     r 1-6            100 ms    13       14      1/6
40 ms    back wall       30    5     r 1-28           467 ms    35       39      3/28
40 ms    mid (spawn)     19    5     r 1-16           267 ms    24       27      3/16
40 ms    near net        11    6     r 1-8            133 ms    17       20      2/8
40 ms    spawn to spawn  8     5     r 1-5            83 ms     13       15      2/5
75 ms    back wall       26    9     r 1-24           400 ms    35       43      9/24
75 ms    mid (spawn)     15    9     r 1-12           200 ms    24       31      7/12
75 ms    near net        8     9     r 1-5            83 ms     17       23      5/5
75 ms    spawn to spawn  4     9     r 1-1            17 ms     13       19      1/1
100 ms   back wall       22    13    r 1-20           333 ms    35       44      10/20
100 ms   mid (spawn)     12    12    r 1-9            150 ms    24       34      9/9
100 ms   near net        5     12    r 1-2            33 ms     17       26      2/2
100 ms   spawn to spawn  1     12    none             0 ms      13       -       0/0
150 ms   back wall       16    19    r 1-14           233 ms    35       51      14/14
150 ms   mid (spawn)     5     19    r 1-2            33 ms     24       39      2/2
150 ms   near net        -     -     none             0 ms      17       -       0/0
150 ms   spawn to spawn  -     -     none             0 ms      13       -       0/0
```

Reading it: the defender loses `late` = about 1.1 round trips of every throw (3 ticks at
20 ms one-way, 9 at 75, 12-13 at 100, 19 at 150), whatever the distance. The thrower loses
nothing (`thr seen` = local). At 100 ms one-way a spawn-to-spawn throw is never on screen
before it hits. The thrower also sees the defender's jump about one round trip late (`thr gap`
grows), and at 75 ms and up most dodges first look like hits on the thrower's screen.

## Local browser check (tools/check-dodge-browser.cjs local)

Broken test, not a game bug. The match play-out loop had a fixed budget of 600 passes, about
52 ms each, so about 31 s of play. A 9-point match takes about 28 s, and every missed ball that
comes to rest where the bots can't reach (they never jump) costs a 6 s shot clock before the
turnover. When the budget ran out at 4-3 the script waited 5 s for the winner card and failed.
Reproduced by resetting the score before the play-out: `FAILED page.waitForSelector: Timeout
5000ms exceeded`, score 4-3, 2 turnovers. Fix: the budget is now progress (a point in the last
30 s, 4 min in all) and the card wait is 15 s. Side finding: some of those misses are taps that
became aimed throws (vy -2.4) because a stalled frame ran catch-up ticks with the key still
down; real but minor, not fixed here.

## Work log

- Branch created, code read.
- Harness written. First run was noisy: it judged trials on a client state after the client's
  own replay (the thrower's prediction). Fixed: judged on the raw server snapshot.
- Baseline done (above).
- Local browser check: cause found and fixed (above).
- Fix A and fix B code written on their branches (WIP). Next: checks in tools/check-dodge.js,
  harness tables for both, browser checks, comparison.
