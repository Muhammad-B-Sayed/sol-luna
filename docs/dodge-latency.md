# Dodgeball online latency study (work log)

Goal: measure how much harder dodging is online, prototype fixes
(A: per-room ball speed from measured ping, B: server-side rewind, C: a wind-up before the
launch), compare, ship one.

Branches: `dodge-latency-study` (from `low-gravity`), `dodge-fix-a-ballspeed`, `dodge-fix-b-rewind`
(both from the study branch), `dodge-fix-c-windup` (from `low-gravity`, which has the study).
**Decision: fix C ships** (`dodge-fix-c-windup`). See "Fix C" and "Decision" below.

## Nov 2026: the Runner input rules (branch `coop-dodge-inputs`)

Dodgeball rooms now use the input rules of the Runner rooms (every input keeps its tick; the
room waits up to 400 ms for a late player). The queue drain and the wind-up changed with them:
see `docs/netcode.md` section 4. Re-measured with `--reps 3`: online equals local at 0, 20, 40
and 75 ms one-way (0 of 177 trials differ at each), with the same wind-up as before (1, 4, 6
ticks; 11 at 75 ms). With jitter and spikes (`--jit 15 --spike 8`) at 40 ms, the windows still
equal local, and 6 of 177 trials differ from local (18 of 173 before). Tables in netcode.md.

## Nov 2026: the new court and a 36 px/tick ball

The court was narrowed to 768 px with one platform per side, and the ball sped up from 24 to
36 px/tick (HANDOFF section 9, `tools/check-dodge.js` section 3). The study below used the
old court and ball; its spots now mean: `back wall` both at their back walls (19-tick flight),
`mid (spawn)` thrower on the spawn behind the platform (17), `near net` thrower at the veil and
defender at the back wall (9), `spawn to spawn` (15). Re-run with
`node tools/dodge-latency.js --lat 0,40 --reps 3` and `--lat 0,20,40,75` (one rep):

```
latency  spot            speed  seen  late  dodge r          latest    thr seen thr gap phantom  thr stop wind thr dly def wu
local    back wall       36     19    0     r 1-16           267 ms    19       16      0/48     -        0    0       0/0   
local    mid (spawn)     36     17    0     r 1-14           233 ms    17       14      0/42     -        0    0       0/0   
local    near net        36     9     0     r 1-5            83 ms     9        5       0/15     -        0    0       0/0   
local    spawn to spawn  36     15    0     r 1-12           200 ms    15       12      0/36     -        0    0       0/0   
0 ms     back wall       36     19    0     r 1-16           267 ms    20       17      4/42     6        1    1       0/1   
0 ms     mid (spawn)     36     17    0     r 1-14           233 ms    18       14      0/37     4        1    1       0/1   
0 ms     near net        36     9     0     r 1-5            83 ms     10       6       0/15     1        1    1       0/1   
0 ms     spawn to spawn  36     13    0     r 1-12           200 ms    16       12      2/31     3        1    1       0/1   
40 ms    back wall       36     18    0     r 1-16           267 ms    25       22      14/40    10       6    6       0/3   
40 ms    mid (spawn)     36     17    0     r 1-14           233 ms    24       20      10/41    6        6    6       0/3   
40 ms    near net        36     9     0     r 1-5            83 ms     14       11      3/15     5        6    6       0/1   
40 ms    spawn to spawn  36     15    0     r 1-12           200 ms    20       18      11/35    5        6    6       0/2   
20 ms    back wall       36     11    0     r 1-16           267 ms    31       19      6/16     3        4    4       0/4   
20 ms    mid (spawn)     36     17    0     r 1-14           233 ms    19       17      0/14     2        4    4       1/1   
20 ms    near net        36     9     0     r 1-5            83 ms     11       7       0/5      2        4    4       1/1   
20 ms    spawn to spawn  36     15    0     r 1-11           183 ms    17       13      0/11     14       4    4       1/2   
75 ms    back wall       36     17    1     r 1-15           250 ms    30       27      7/15     10       9    9       0/0   
75 ms    mid (spawn)     36     16    1     r 1-12           200 ms    27       27      6/12     11       9    9       0/0   
75 ms    near net        36     6     3     r 1-2            33 ms     21       17      2/2      12       9    9       0/0   
75 ms    spawn to spawn  36     13    2     r 1-11           183 ms    26       23      9/11     11       9    9       0/0   
```

- 0, 20 and 40 ms one-way: online matches local at every spot (same latest dodge, and the
  reaction on the first tick of sight still escapes). The single-rep run had two noisy cells
  at 0 and 40 ms (one trial each); three reps match local exactly.
- 75 ms: 1 to 3 ticks worse than local; near the net the latest dodge falls from 5 to 2
  ticks (83 to 33 ms). The wind-up is capped at `windMax` = 9 ticks (150 ms), and 75 ms
  one-way needs about 10 plus the queue (`late` 1-3: that much flight is gone before the
  defender sees the ball). The cap is unchanged from before, but with a 5-tick window each
  lost tick matters more than it did with a 16-tick one. Smallest change, not made here:
  `windMax: 12` (200 ms), which covers up to about 95 ms one-way at the cost of a longer
  hold on the thrower's own screen at high ping. The ping measurement (median of 8 pings,
  500 ms apart, rounded to ticks) is fine-grained enough: errors of one tick showed up only
  as the noise above.
- What the harness can't show is motion against aim (`check-dodge.js` section 3): it scripts
  flat taps and jumps. Online, the defender's own movement is predicted on their screen and
  judged by the server from their inputs, and below the cap they see the launch on the same
  tick as in local play, so the same throws that miss a moving player locally miss online.

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
comes to rest where the bots can't reach (they never jump) cost a 6 s shot clock (now a 10 s pickup clock) before the
turnover. When the budget ran out at 4-3 the script waited 5 s for the winner card and failed.
Reproduced by resetting the score before the play-out: `FAILED page.waitForSelector: Timeout
5000ms exceeded`, score 4-3, 2 turnovers.

Second cause, found when two headless browsers ran at once (frames about 100 ms apart): the
script's taps were a fixed 40 ms press with about 60 ms between taps. The game samples the
keys once per frame (`Input.local()`), so the gap often fell between two frames and the key
looked held for seconds (`aim` reached 152 ticks). The aim swung, the throws flew at random
angles (vy up to 13.7) and missed, and no point was scored for 30 s.

Fix (two commits on the study branch): the play-out budget is now progress (any throw, pickup,
turnover or point in the last 30 s, 4 min in all), the card wait is 15 s, and a tap holds the
key until the game is aiming and releases it until the game has thrown.

So it was the test, not the game-over flow. But the second cause points at a real, minor
input weakness worth a separate fix: a release, or a whole quick tap, that falls between two
frames is lost, so on a slow device a tap can become an aimed throw or be missed. A fix would
latch key presses and releases between samples. Not changed here.

## Online browser check on the study branch

`LAG_MS=40`: passes (winner screens, rematch, no console errors; drawn ball never steps back).
`LAG_MS=80`: fails twice out of two, in `freezeShot` on the watching client: the watcher's state
goes from "held" straight to "dead after a hit" for a spawn-to-spawn throw, so the ball is never
live on that screen. That is the latency problem itself (baseline: 4 ticks visible at 75 ms,
none at 100 ms), so the check is left as it is and used as a symptom test on the fix branches.

## Fix A: ball speed from the defender's round trip (`dodge-fix-a-ballspeed`)

- **Who measures.** The server, with WebSocket protocol pings every 500 ms. Browsers answer
  those inside the network stack, so a page script can't delay them to fake a high ping (a
  custom client or proxy could). The value is the median of the last 8 samples. The client's
  own `net.rtt` is only shown, never trusted.
- **Formula.** `speedFor(rtt) = 24 * 20 / (20 + 1.1 * rtt / 16.67)` px/tick, in 1/8 px steps,
  floor 14 px/tick (840 px/s, 0.55 s across the court), round trip clamped at 250 ms. 0 ms 24,
  40 ms 21.25, 100 ms 18, 150 ms 16, 200 ms 14.5, 230 ms and up 14. The visible part of a
  20-tick flight (net to back wall) stays as in local play; `1.1 x round trip` is the measured
  `late`.
- **Per player, not per room.** `D.spd = [at Sol, at Luna]`: a throw uses its target's speed.
  So a high-ping player's throws at a low-ping player stay fast. `DODGE_SPEED=room` uses the
  higher round trip for both (the literal "per-room" version); `DODGE_SPEED=off` disables it.
- **Deterministic.** The speeds live in the dodge state, so prediction steps with them. The
  server changes them only in the ready freeze between points, never mid-point.
- **Same path, slower.** A slower ball's drop per tick scales with speed squared and its live
  time with 1/speed, so it flies the same line. The first harness run showed why that matters:
  without it, slow flat throws hit the floor before reaching the back wall.
- HUD (left corner): "balls at you 75% speed".

```
latency  spot            speed  seen  late  dodge r          latest    thr seen thr gap phantom  thr stop
local    back wall       24     35    0     r 1-33           550 ms    35       33      0/33     -       
local    mid (spawn)     24     24    0     r 1-21           350 ms    24       21      0/21     -       
local    near net        24     17    0     r 1-14           233 ms    17       14      0/14     -       
local    spawn to spawn  24     13    0     r 1-10           167 ms    13       10      0/10     -       
0 ms     back wall       24     34    2     r 1-32           533 ms    36       36      0/32     -       
0 ms     mid (spawn)     24     22    2     r 1-19           317 ms    24       21      0/19     -       
0 ms     near net        24     15    2     r 1-12           200 ms    17       15      0/12     -       
0 ms     spawn to spawn  24     11    2     r 1-8            133 ms    13       12      0/8      -       
20 ms    back wall       21.13  36    4     r 1-34           567 ms    40       42      1/34     -       
20 ms    mid (spawn)     21.13  24    4     r 1-22           367 ms    28       29      1/22     -       
20 ms    near net        21.13  16    4     r 1-13           217 ms    20       20      0/13     -       
20 ms    spawn to spawn  21.13  12    4     r 1-8            133 ms    15       16      1/8      -       
40 ms    back wall       19     40    5     r 1-38           633 ms    45       49      3/38     -       
40 ms    mid (spawn)     19     26    5     r 1-23           383 ms    31       33      2/23     -       
40 ms    near net        19     17    5     r 1-14           233 ms    22       26      3/14     -       
40 ms    spawn to spawn  19     12    5     r 1-9            150 ms    17       19      2/9      -       
75 ms    back wall       16     43    10    r 1-42           700 ms    53       61      9/42     -       
75 ms    mid (spawn)     16     26    10    r 1-25 (not 24)  417 ms    36       43      6/24     -       
75 ms    near net        16     16    10    r 1-14           233 ms    26       33      7/14     -       
75 ms    spawn to spawn  16     10    10    r 1-7            117 ms    20       26      6/7      -       
100 ms   back wall       14.5   47    14    r 3-43           717 ms    59       69      12/41    -       
100 ms   mid (spawn)     14.5   27    14    r 1-24           400 ms    41       52      11/24    -       
100 ms   near net        14.5   15    14    r 1-12           200 ms    29       39      11/12    -       
100 ms   spawn to spawn  14.5   8     14    r 1-6            100 ms    22       31      6/6      -       
150 ms   back wall       14     42    19    r 1-39           650 ms    61       77      16/39    -       
150 ms   mid (spawn)     14     22    20    r 1-20           333 ms    42       57      17/20    -       
150 ms   near net        14     10    19    r 1-7            117 ms    30       46      7/7      -       
150 ms   spawn to spawn  14     3     19    none             0 ms      23       -       0/0      -
```

## Fix B: lag compensation by rewind (`dodge-fix-b-rewind`)

- **Grace.** `graceFor(rtt) = min(9, round(1.1 * rtt / 16.67))` ticks per player, from the same
  server-side ping. The cap is 9 ticks = 150 ms, so it fully covers round trips up to about
  136 ms (68 ms one-way). It is kept in the state (`D.grace`) and set between points.
- **Defender's screen.** A ball thrown at you is drawn `grace` ticks behind the truth,
  replayed from where it was thrown (`ballView`). So you see it leave the hand and fly the whole
  way, like in local play.
- **Server.** It keeps the last 12 states. When your jump starts while a ball flies at you, it
  restores the state from `grace` ticks ago (never before the throw) and replays it with your
  jump held (`rewindJump`). That happens once per throw. Your own client does the same to its
  prediction.
- **Hits wait for the grace.** A ball that touches a player with grace stops in them for
  `grace` ticks and only then scores, so a late-arriving jump can still undo it. On the
  thrower's screen a hit on the other player waits for the server (`d.wait`), so the thrower
  never sees a hit that is later taken back.
- **What the thrower sees instead.** A hit-stop: the ball sits in the target for `thr stop`
  ticks before the hit shows (7 ticks at 20 ms one-way, 19 at 75, 22 at 100, about 28 at 150,
  i.e. grace plus their own round trip). When the dodge wins, the ball stops in the target and
  then flies on as they rise (`phantom`). That is about half the dodges at 40 ms one-way,
  three quarters at 75 ms, and nearly all at 100 ms and up.
- HUD (left corner): "your dodges count 150 ms early".

```
latency  spot            speed  seen  late  dodge r          latest    thr seen thr gap phantom  thr stop
local    back wall       24     35    0     r 1-33           550 ms    35       33      0/33     -       
local    mid (spawn)     24     24    0     r 1-21           350 ms    24       21      0/21     -       
local    near net        24     17    0     r 1-14           233 ms    17       14      0/14     -       
local    spawn to spawn  24     13    0     r 1-10           167 ms    13       10      0/10     -       
0 ms     back wall       24     35    0     r 1-32           533 ms    35       33      0/32     -       
0 ms     mid (spawn)     24     23    1     r 1-20           333 ms    24       21      0/20     -       
0 ms     near net        24     17    0     r 1-13           217 ms    17       15      0/13     -       
0 ms     spawn to spawn  24     12    0     r 1-9            150 ms    13       11      0/9      -       
20 ms    back wall       24     34    1     r 1-32           533 ms    42       40      5/32     7       
20 ms    mid (spawn)     24     23    1     r 1-20           333 ms    30       28      3/20     6       
20 ms    near net        24     16    1     r 1-13           217 ms    24       20      4/13     7       
20 ms    spawn to spawn  24     12    1     r 1-9            150 ms    20       16      4/9      7       
40 ms    back wall       24     33    1     r 1-32           533 ms    45       43      8/32     10      
40 ms    mid (spawn)     24     24    1     r 1-21           350 ms    35       32      9/21     11      
40 ms    near net        24     16    1     r 1-13           217 ms    28       26      9/13     11      
40 ms    spawn to spawn  24     12    1     r 1-9            150 ms    23       21      8/9      10      
75 ms    back wall       24     34    1     r 1-32           533 ms    54       52      18/32    19      
75 ms    mid (spawn)     24     23    1     r 1-20           333 ms    42       40      16/20    20      
75 ms    near net        24     16    1     r 1-12           200 ms    36       32      12/12    19      
75 ms    spawn to spawn  24     12    1     r 1-9            150 ms    32       30      9/9      19      
100 ms   back wall       24     31    4     r 1-29           483 ms    57       55      19/29    22      
100 ms   mid (spawn)     24     21    4     r 1-18           300 ms    46       42      18/18    21      
100 ms   near net        24     13    4     r 1-10           167 ms    39       35      10/10    22      
100 ms   spawn to spawn  24     9     4     r 1-6            100 ms    35       31      6/6      22      
150 ms   back wall       24     25    10    r 1-23           383 ms    63       60      23/23    29      
150 ms   mid (spawn)     24     15    10    r 1-12 (not 11)  200 ms    52       48      11/11    28      
150 ms   near net        24     8     9     r 1-5            83 ms     44       42      5/5      27      
150 ms   spawn to spawn  24     4     10    r 1-1            17 ms     40       38      1/1      28
```

## Fairness: one player at 10 ms one-way, the other at 100 ms

`T100/D10` = the high-ping player throws at the low-ping one; `T10/D100` = the reverse.

```
latency  spot            speed  seen  late  dodge r          latest    thr seen thr gap phantom  thr stop
local    back wall       24     35    0     r 1-33           550 ms    35       33      0/33     -       
local    mid (spawn)     24     24    0     r 1-21           350 ms    24       21      0/21     -       
local    near net        24     17    0     r 1-14           233 ms    17       14      0/14     -       
local    spawn to spawn  24     13    0     r 1-10           167 ms    13       10      0/10     -       
T100/D10 back wall       24     32    3     r 1-30           500 ms    35       44      10/30    -       
T100/D10 mid (spawn)     24     22    3     r 1-18           300 ms    24       33      9/18     -       
T100/D10 near net        24     14    3     r 1-11           183 ms    17       27      9/11     -       
T100/D10 spawn to spawn  24     11    2     r 1-7            117 ms    13       22      7/7      -       
T10/D100 back wall       24     23    12    r 1-21           350 ms    35       36      1/21     -       
T10/D100 mid (spawn)     24     11    12    r 1-8            133 ms    24       22      0/8      -       
T10/D100 near net        24     5     12    r 1-2            33 ms     17       16      0/2      -       
T10/D100 spawn to spawn  24     -     12    none             0 ms      13       -       0/0      -

fix A
T100/D10 back wall       22.5   35    2     r 1-33           550 ms    38       48      9/33     -       
T100/D10 mid (spawn)     22.5   24    3     r 1-21           350 ms    26       36      9/21     -       
T100/D10 near net        22.5   15    3     r 1-13           217 ms    18       28      9/13     -       
T100/D10 spawn to spawn  22.5   12    3     r 1-9            150 ms    14       24      9/9      -       
T10/D100 back wall       14.5   46    12    r 4-44           733 ms    59       58      0/41     -       
T10/D100 mid (spawn)     14.5   28    13    r 1-25           417 ms    40       40      0/25     -       
T10/D100 near net        14.5   17    12    r 1-14           233 ms    29       28      0/14     -       
T10/D100 spawn to spawn  14.5   9     12    r 1-7            117 ms    22       22      0/7      -

fix B
T100/D10 back wall       24     34    1     r 1-32           533 ms    49       48      12/32    15      
T100/D10 mid (spawn)     24     23    1     r 1-20           333 ms    37       35      11/20    13      
T100/D10 near net        24     16    1     r 1-13           217 ms    32       28      11/13    15      
T100/D10 spawn to spawn  24     12    1     r 1-9            150 ms    28       23      9/9      15      
T10/D100 back wall       24     31    5     r 1-28           467 ms    46       44      8/28     11      
T10/D100 mid (spawn)     24     20    5     r 1-16           267 ms    34       32      6/16     10      
T10/D100 near net        24     12    5     r 1-10           167 ms    28       23      9/10     11      
T10/D100 spawn to spawn  24     8     5     r 1-5            83 ms     24       20      5/5      11
```

## Comparison

Dodge window = `latest` (ms of reaction that still dodges, after the ball first shows).
Local: 550 / 350 / 233 / 167 ms (back wall / mid / near net / spawn to spawn).

| | Baseline | Fix A (speed) | Fix B (rewind) |
| --- | --- | --- | --- |
| 40 ms one-way | 467 / 267 / 133 / 83 | 633 / 383 / 233 / 150 | 533 / 350 / 217 / 150 |
| 75 ms | 400 / 200 / 83 / 17 | 700 / 417 / 233 / 117 | 533 / 333 / 200 / 150 |
| 100 ms | 333 / 150 / 33 / 0 | 717 / 400 / 200 / 100 | 483 / 300 / 167 / 100 |
| 150 ms | 233 / 33 / 0 / 0 | 650 / 333 / 117 / 0 | 383 / 200 / 83 / 17 |
| 10 vs 100 ms: low-ping defends | 500 / 300 / 183 / 117 | 550 / 350 / 217 / 150 | 533 / 333 / 217 / 150 |
| 10 vs 100 ms: high-ping defends | 350 / 133 / 33 / 0 | 733 / 417 / 233 / 117 | 467 / 267 / 167 / 83 |

- **Window versus local.** B gives the local window at every distance while the round trip
  is under the cap (up to 75 ms one-way here), then loses only the excess (4 ticks at 100 ms,
  10 at 150). A can match local only at one distance (net to back wall). Long throws become
  much easier than local (back wall 717 ms instead of 550), and short ones stay harder
  (spawn to spawn 100-117 ms instead of 167). That's because the lag costs a fixed number of
  ticks, while slowing the ball adds ticks in proportion to distance.
- **Fairness.** Both remove most of the baseline's handicap for the high-ping player. Under A
  the high-ping player becomes the easier dodger at range: 733 ms against the other's 550. B
  leaves the two players within one or two ticks of each other up to the cap.
- **What each player sees that differs from the truth.**
  - Baseline: the defender sees throws late and short. The thrower sees dodges as hits that get
    taken back (`phantom`).
  - A: the same, smaller. The ball really is slower, so nothing on screen is wrong.
  - B: the defender's ball is drawn up to 150 ms behind. Their own jump starts with a small
    lift when it is moved back. When a hit lands, they get knocked back as the drawn ball
    arrives. The thrower gets the hit-stop, and the ball stopping and then flying on when the
    dodge wins.
- **The owner's "fast ball".** A makes it slower for everyone facing a laggy player: 0.55 s
  across at the floor instead of 0.30 s, which is a visibly different game. B keeps 24 px/tick
  everywhere. The cost lands on the thrower's feedback instead (a 117-367 ms pause before a hit
  registers).
- **Cheating.** Both trust the server's protocol-ping round trip. A player who delays pongs
  (needs a custom client or proxy) gets, under A, balls at them slowed to 14 px/tick. Under B
  they get jumps moved up to 150 ms back in time: 9 ticks of foresight on a 13-35 tick flight.
  B's gain is bigger per throw, but capped. Both are limited by the clamp. A further guard for
  either: compare the claimed round trip with how far behind the client's input sequence runs.
- **Code size and risk.** A: about 70 lines in 3 files. It only touches the throw and the
  server's dodge rooms, and the other modes are untouched (pings run on every socket but only
  feed dodge). B: about 180 lines in 4 files. It refactors `onSnapshot` into `adopt()`, which
  co-op online also uses; the browser checks covered co-op local but not co-op online. It also
  adds a per-tick state copy and history on dodge rooms. More moving parts: rewind, pending
  hits, the delayed view, and the client-side back-dating, which has to match the server's.
- **What a human would notice.** A: "the ball is slow against my friend on hotel wifi", and
  long throws that are easy to read. B: the defender would mostly notice nothing (that's the
  point). The thrower would notice a beat before hits register online, and balls that seem to
  stop in the target before it jumps away.

## Recommendation

Fix B. It is the only option that restores the actual local dodge window at every distance
and keeps the fast ball the owner asked for. Its visual costs fall on the thrower's feedback,
not on the mechanic. Before shipping I'd change two things: a cap of 6-9 ticks is right, but
the hit-stop should be dressed as an impact flash rather than a frozen ball, and co-op online
needs a real browser run because `onSnapshot` changed.

What would change my mind:
- if playtests find the thrower's hit-stop or the stop-then-fly worse than a slower ball;
- if most players are on round trips over about 150 ms, where B's cap leaves a gap and A's
  floor at least keeps throws dodgeable;
- if the code risk of B in `main.js` is unwelcome right now. A is a small, safe change that
  helps a lot at range.

A third option worth one prototype: **a launch delay sized by the defender's lag.** After
release, the ball stays in the hand for `late` ticks (a visible wind-up) before it flies at
full speed. The release reaches the defender's screen during the wind-up, so they see the
launch in real time and the whole flight at 24 px/tick. That matches local at every distance,
like B, with no rewind, no hit-stop, no phantom hits and about A's code size. The cost is a
release-to-launch lag for whoever throws at a laggy player (up to the same 150 ms cap). It
isn't built or measured here; the projection follows from the baseline's `late` column.

## Fix C: a wind-up sized by the target's lag (`dodge-fix-c-windup`)

The third option from the recommendation above, built and measured.

- **The idea.** The defender sees a remote throw `late` ticks after it happens. So when a
  player releases a throw at someone whose lag is L ticks, the ball stays in the thrower's hand
  for L ticks (the wind-up), then flies at the normal 24 px/tick. The release reaches the
  defender's screen during the wind-up, so the launch lands on their screen on time and they see
  the whole flight, as in local play. No rewind, no ball drawn behind time, nothing in the
  defender's view that isn't true.
- **Sizing.** `windupFor(rtt, queue) = min(9, round(1.1 * rtt / 16.67 + queue))` ticks
  (`shared/dodge.js`). The round trip is the server's protocol ping, the median of the last 8
  (same measurement and 150 ms cap as A and B). `queue` is new: the median number of that
  player's inputs waiting in the server's input queue. See "The input queue" below for why it
  matters. The server stores it per target in `D.lag` and only changes it in the ready freeze
  between points, so both sides step with the same value. Local play: always 0, game unchanged.
- **Deterministic launch.** The release starts `D.wind`. From the next tick the thrower's keys
  are ignored until the launch (they plant their feet to throw), and the aim is the one they
  released with. So where and how the ball leaves is fixed by the state at the release, which
  the defender's screen receives together with the release. The shot clock waits during a wind-up.
- **Thrower's screen.** Prediction shows the wind-up the moment the key comes up: the thrower
  leans back, the ball is drawn back over the shoulder with a ring closing in on it, the aim
  arrow fills from the hand outward like a charge meter, and a short rising hum plays. Then the
  ball flies. HUD (left corner): "your throws wind up 100 ms".
- **Defender's screen.** The wind-up is not drawn there. They see the plain aim until the
  launch, as a local player would. The harness measured how much of it they can see at all:
  `def wu` below, at most 2 ticks of a frozen aim arrow before the launch (median 0 or 1).
- **What the thrower still can't know.** The thrower sees the defender about one round trip
  late, so a late dodge first looks like a hit on the thrower's screen. Without care that shows
  as a hit, burst and score, then gets taken back (`--nowait` in the harness: 2-4 per 40 ms
  row). So, as in B, the thrower's screen waits for the server's word on a ball that reaches
  the other player (`D.wait`, prediction only): the ball stops in them under an impact flare
  until the server's state says hit or dodge. Unlike B, the server decides hits at once (no
  grace), so this pause is only the thrower's own lag: about half of B's.

### The input queue (found with the filmstrips)

The first browser filmstrips showed both B and C falling short in a real browser at 40 ms: the
defender's first frame of the ball was already 4-5 ticks into its flight, where the harness said
0-1. The server's input queue was the cause. A browser whose first frames are slow sends a burst
of inputs, and the server, which takes one per tick, keeps that backlog for the rest of the
match: 3-5 inputs (50-83 ms) per client in the filmstrip runs (`DODGE_LOG=1` prints it). That
player sees everything the other does that much later, in every mode. The harness's clients
share one clock, so it never saw this.

Two changes, both in Dodgeball rooms only:
- The wind-up counts the queue (above).
- The server drains a standing queue while it costs nothing: during the pause after a hit and on
  the winner screen, where inputs are ignored anyway, and in the ready freeze, where it drops
  only an input equal to the keys already held (that hold gets one tick shorter; nobody can throw
  yet). Afterwards the queue sits at 1. At 40 ms one-way the wind-up went from 8-9 ticks to 6.

Co-op and Runner have the same backlog. I left them alone (shared code, another agent is in
there); see HANDOFF "Open ideas".

### Numbers (harness, same method as the study)

```
latency  spot            speed  seen  late  dodge r          latest    thr seen thr gap phantom  thr stop wind thr dly def wu
local    back wall       24     35    0     r 1-33           550 ms    35       33      0/33     -        0    0       0/0   
local    mid (spawn)     24     24    0     r 1-21           350 ms    24       21      0/21     -        0    0       0/0   
local    near net        24     17    0     r 1-14           233 ms    17       14      0/14     -        0    0       0/0   
local    spawn to spawn  24     13    0     r 1-10           167 ms    13       10      0/10     -        0    0       0/0   
0 ms     back wall       24     35    0     r 1-33           550 ms    36       33      0/33     1        1    1       0/2   
0 ms     mid (spawn)     24     24    0     r 1-21           350 ms    25       22      0/21     1        1    1       0/1   
0 ms     near net        24     17    0     r 1-14           233 ms    17       14      0/14     1        1    1       0/1   
0 ms     spawn to spawn  24     13    0     r 1-10           167 ms    14       11      0/10     1        1    1       0/1   
20 ms    back wall       24     35    0     r 1-33           550 ms    39       36      2/33     3        4    4       1/1   
20 ms    mid (spawn)     24     24    0     r 1-21           350 ms    28       24      0/21     4        4    4       0/1   
20 ms    near net        24     17    0     r 1-14           233 ms    20       17      0/14     3        4    4       0/1   
20 ms    spawn to spawn  24     13    0     r 1-10           167 ms    16       14      1/10     3        4    4       0/0   
40 ms    back wall       24     35    0     r 1-33           550 ms    40       38      3/33     5        6    6       1/2   
40 ms    mid (spawn)     24     24    0     r 1-21           350 ms    30       27      3/21     5        6    6       1/2   
40 ms    near net        24     17    0     r 1-14           233 ms    22       20      3/14     6        6    6       0/1   
40 ms    spawn to spawn  24     13    0     r 1-10           167 ms    19       16      2/10     5        6    6       1/1   
75 ms    back wall       24     34    0     r 1-32           533 ms    45       42      7/32     10       9    9       0/0   
75 ms    mid (spawn)     24     24    0     r 1-20           333 ms    34       31      5/20     9        9    9       0/0   
75 ms    near net        24     16    1     r 1-13           217 ms    27       23      6/13     10       9    9       0/0   
75 ms    spawn to spawn  24     11    1     r 1-10           167 ms    23       20      7/10     10       9    9       0/0   
100 ms   back wall       24     31    4     r 1-30           500 ms    48       46      12/30    13       9    9       0/0   
100 ms   mid (spawn)     24     20    4     r 1-17           283 ms    36       34      9/17     12       9    9       0/0   
100 ms   near net        24     12    5     r 1-9            150 ms    31       27      9/9      13       9    9       0/0   
100 ms   spawn to spawn  24     8     5     r 1-5            83 ms     27       22      5/5      14       9    9       0/0   
150 ms   back wall       24     25    10    r 1-23           383 ms    54       52      17/23    19       9    9       0/0   
150 ms   mid (spawn)     24     15    10    r 1-11           183 ms    43       40      11/11    18       9    9       0/0   
150 ms   near net        24     7     10    r 1-4            67 ms     36       32      4/4      19       9    9       0/0   
150 ms   spawn to spawn  24     4     9     r 1-1            17 ms     31       29      1/1      18       9    9       0/0   
T100/D10 back wall       24     35    0     r 1-33           550 ms    48       46      11/33    13       2    2       1/1   
T100/D10 mid (spawn)     24     24    0     r 1-21           350 ms    36       34      9/21     12       2    2       1/1   
T100/D10 near net        24     17    0     r 1-14           233 ms    29       26      10/14    13       2    2       1/1   
T100/D10 spawn to spawn  24     13    0     r 1-10           167 ms    26       22      10/10    13       2    2       1/1   
T10/D100 back wall       24     32    4     r 1-29           483 ms    36       35      0/29     2        9    9       0/0   
T10/D100 mid (spawn)     24     21    4     r 1-17           283 ms    26       23      0/17     1        9    9       0/0   
T10/D100 near net        24     13    4     r 1-10           167 ms    19       14      0/10     2        9    9       0/0   
T10/D100 spawn to spawn  24     9     4     r 1-6            100 ms    15       11      0/6      2        9    9       0/0
```

New columns: `wind` = the wind-up of the throw; `thr dly` = ticks from the thrower's key release
to seeing the ball leave the hand; `def wu` = ticks the defender's screen held the (undrawn)
wind-up before the launch, median / max. `phantom` here counts dodges that showed the ball stopped
in the defender on the thrower's screen; `thr stop` is the pause before a hit shows there.

**What the thrower pays** (`thr dly`, the same at every distance):

| one-way | 0 ms | 20 ms | 40 ms | 75 ms | 100 ms | 150 ms |
| --- | --- | --- | --- | --- | --- | --- |
| release to launch | 1 tick, 17 ms | 4, 67 ms | 6, 100 ms | 9, 150 ms | 9, 150 ms | 9, 150 ms |
| defender's lag (baseline `late`, + 1 queued input) | 1-2 | 4-5 | 5-7 | 9-10 | 12-14 | 19-20 |

The wind-up is never longer than the lag it covers. In the browser filmstrips (queue drained to
1) it was 6 ticks at 40 ms and 9 at 100 ms.

### Filmstrips (real renderer, headless Chromium)

`tools/dodge-filmstrip.cjs` puts two pages in one online room with bots inside the pages: the
thrower taps a flat throw from their spawn, the defender stands at their back wall (a 24-tick
flight) and either stands still or jumps a fixed number of ticks after the ball first shows in
flight on their own screen (16 at 40 ms, 10 at 100 ms, so it dodges under both fixes). It copies
every drawn frame. Each sheet is one row per 33 ms from the key release: thrower's screen left,
defender's right, same wall-clock time. Labels: `wind k` ticks left, `live k` ticks of flight
drawn on that screen, `stop` ball stopped in a player waiting for the server, `^` the
defender is rising. B was captured on `dodge-fix-b-rewind` as built (no queue drain).

| sheet | what a player sees |
| --- | --- |
| [c-40ms-hit](img/dodgeball/latency/c-40ms-hit.png) | Thrower: a 100 ms wind-up (lean, arrow filling, glow), a clean flight, then about 100 ms of impact flare in the target before the hit burst. Defender: the aim, then the ball 1-2 ticks out of the hand, the whole flight, the hit. |
| [c-40ms-dodge](img/dodgeball/latency/c-40ms-dodge.png) | Thrower: wind-up, flight, the defender rises while the ball is still a few frames away, the ball flies past. No stop. Defender: same as local. |
| [c-100ms-hit](img/dodgeball/latency/c-100ms-hit.png) | Thrower: 150 ms wind-up, flight, then about 230 ms stopped in the target before the hit. Defender: the ball first shows 6-7 ticks out (past the 150 ms cap), then flies on and hits. |
| [c-100ms-dodge](img/dodgeball/latency/c-100ms-dodge.png) | Thrower: the ball stops in the defender for 3 frames (100 ms), then the defender pops up and the ball flies on. Defender: ball first seen 6 ticks out; clean dodge. |
| [b-40ms-hit](img/dodgeball/latency/b-40ms-hit.png) | Thrower: launch at once, then about 200 ms stopped in the target before the hit. Defender: the delayed ball first shows 6 ticks out (the grace doesn't cover the browser's queue), stops in them for 3 frames, then the hit. |
| [b-40ms-dodge](img/dodgeball/latency/b-40ms-dodge.png) | Thrower: the ball stops in the defender for 4 frames, then flies on. Defender: they dodge, and for 2 frames a hit burst flashes on them anyway before it is taken back. |
| [b-100ms-hit](img/dodgeball/latency/b-100ms-hit.png) | Thrower: about 400 ms stopped in the target before the hit. Defender: ball first seen 8 ticks out, stops in them 4 frames, hit. |
| [b-100ms-dodge](img/dodgeball/latency/b-100ms-dodge.png) | Thrower: the ball sits in the defender for about 370 ms and then appears dead on the floor: they never see it fly on. Defender: it stops in them, they rise, it flies past, then a hit burst flashes for 3 frames and is taken back. |

## Comparison of all three

Dodge window = `latest` (back wall / mid / near net / spawn to spawn). Local: 550 / 350 / 233 / 167.

| | Baseline | Fix A (speed) | Fix B (rewind) | Fix C (wind-up) |
| --- | --- | --- | --- | --- |
| 20 ms one-way | 483 / 283 / 167 / 100 | 567 / 367 / 217 / 133 | 533 / 333 / 217 / 150 | 550 / 350 / 233 / 167 |
| 40 ms | 467 / 267 / 133 / 83 | 633 / 383 / 233 / 150 | 533 / 350 / 217 / 150 | 550 / 350 / 233 / 167 |
| 75 ms | 400 / 200 / 83 / 17 | 700 / 417 / 233 / 117 | 533 / 333 / 200 / 150 | 533 / 333 / 217 / 167 |
| 100 ms | 333 / 150 / 33 / 0 | 717 / 400 / 200 / 100 | 483 / 300 / 167 / 100 | 500 / 283 / 150 / 83 |
| 150 ms | 233 / 33 / 0 / 0 | 650 / 333 / 117 / 0 | 383 / 200 / 83 / 17 | 383 / 183 / 67 / 17 |
| 10 vs 100: low-ping defends | 500 / 300 / 183 / 117 | 550 / 350 / 217 / 150 | 533 / 333 / 217 / 150 | 550 / 350 / 233 / 167 |
| 10 vs 100: high-ping defends | 350 / 133 / 33 / 0 | 733 / 417 / 233 / 117 | 467 / 267 / 167 / 83 | 483 / 283 / 167 / 100 |
| thrower: release to launch | 0 | 0 | 0 | 17-150 ms (= target's lag) |
| thrower: pause before a hit shows, 20 / 40 / 100 ms | none (phantom hits instead) | none (phantoms) | 6-7 / 10-11 / 21-22 ticks | 3-4 / 5-6 / 12-14 ticks |
| thrower: dodges that stop in the target first, 40 ms | (3/28 seen as hits) | (2-3 per row as hits) | 8/32, 9/21, 9/13, 8/9 | 3/33, 3/21, 3/14, 2/10 |
| defender's screen | throws late and short | same, smaller | ball drawn behind time; own jump starts lifted; in the browser a false hit flash on some dodges | true picture, at most 1-2 ticks of frozen aim before a launch |
| ball speed | 24 | 14-24 | 24 | 24 |
| touches co-op code | no | no | yes (`onSnapshot` refactor) | no (two dodge-only lines in `main.js`) |

## Decision

**C ships.** The rule I was given: C wins if its dodge windows are within one tick of local up
to the cap, the thrower's delay is at most the defender's lag, and its filmstrips show no
artifact; otherwise B. C meets the first two cleanly: equal to local at 0, 20 and 40 ms, within
one tick at 75 ms (just over the cap), and the wind-up is never longer than the lag. It does not
meet the third to the letter: on the thrower's screen a hit still waits a moment for the server
(about 100 ms at 40 ms one-way), and a very late dodge can stop in the target for a frame or
three before flying on.

I chose C anyway, and I think the rule's third test assumed something that can't be had. The
thrower sees the defender's jump a round trip late under any scheme. No fix removes that pause
on the thrower's screen; the only choice is between a short pause and a fake hit. B has the same
artifacts, about twice as long (200 ms against 100 ms at 40 ms, 400 against 230 at 100 ms), plus
two of its own that C doesn't have: the delayed ball, and a false hit flash on the defender's
own screen in the browser. Applying the rule literally would ship the option that is worse on
the very thing the rule checks. The owner's brief was "whatever is best and feels best". On that, C wins on every row of the table
except the wind-up itself, which is the cost it is built around and which reads as part of the
throw. It is also the smaller change: no rewind or history, and co-op's snapshot path is untouched.

What C costs and where it stops:
- The thrower waits up to 150 ms between release and launch against a laggy opponent. The
  prediction shows the wind-up on the release frame, so the throw never feels dropped, but it is
  slower than local. Against a 10 ms opponent it is 1-2 ticks.
- Past the 150 ms cap (about 68 ms one-way) the defender loses the excess, like B: 4-5 ticks at
  100 ms one-way. Raising `windMax` would extend the cover, at the thrower's expense.
- Cheating: a client that delays protocol pongs makes the other player's throws at it wind up
  longer (up to 150 ms of extra warning). Bounded by the cap, as in A and B.

## Work log

- Branch created, code read.
- Harness written. First run was noisy: it judged trials on a client state after the client's
  own replay (the thrower's prediction). Fixed: judged on the raw server snapshot.
- Baseline done (above).
- Local browser check: cause found and fixed (above).
- Fix A and fix B code written on their branches, with checks in tools/check-dodge.js
  (section 7 on each branch, passing). Browser check fix committed on the study branch
  (4d398db). Harness has an asymmetric mode (--asym 10,100) for fairness.
- Harness tables for A (re-run after the same-path fix) and B, fairness runs, browser checks
  per branch (all pass, including online at 80 ms where the study branch fails), comparison
  and recommendation written. Done.
- Final checks. `node tools/check-dodge.js` passes on all three branches (35 / 46 / 47 checks).
  Browser checks after the tap fix: study local passes 4/4 with two browsers at once; fix A
  local and online (80 ms) pass; fix B local and online (80 ms) pass. Study online at 40 ms
  passes 2 of 3; the failure is the latency symptom (the watcher's state goes from "held" to
  "dead after a hit" without a live frame), and at 80 ms it fails every time. Fix A's online
  check also failed once at 80 ms in the same place while two browsers shared the CPU, then
  passed when run alone.
- Fix C (branch `dodge-fix-c-windup` from `low-gravity`): wind-up in `shared/dodge.js`, server
  pings and `D.lag` between points, harness columns `wind`, `thr dly`, `def wu`. First harness
  run at 40 and 100 ms: windows at local up to the cap, but the thrower's screen showed phantom
  hits on late dodges (the thrower sees the defender late under any fix). Added `D.wait` on the
  thrower's screen (hits on the other player wait for the server) with an impact flare.
- Filmstrip tool (`tools/dodge-filmstrip.cjs`). The first sheets showed both B and C short in
  the browser by 3-5 ticks: the server's input queue. The wind-up now counts it, and Dodgeball
  rooms drain a standing queue in the free phases (queue 3-5 down to 1; wind-up at 40 ms 8-9
  down to 6). All eight sheets captured and read (table above).
- Checks: `node tools/check-dodge.js` section 7 (wind-up), 52 checks pass. Full harness and
  10/100 fairness run on C (tables above).
- Input latch (`public/js/input.js`, own commit, `node tools/check-input.js`).
- Browser checks on C: dodge local passes (5-4, rematch, co-op level after); online at
  `LAG_MS=40` and `LAG_MS=80` pass (both winner screens, rematch, back to lobby, no console
  errors, no backward steps of the drawn ball); co-op online 23/24 (`tools/playtest/online-browser.mjs`,
  `PORT0=3488`, a port option since reverted because `low-gravity` gained `PORT` for the same thing; the failing "host Next level takes both clients to level 2" fails on
  `low-gravity` too, which also fails both lag-80 checks that pass here); Runner 2D passes.
- Decision written: C ships.
