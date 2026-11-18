# Netcode: the Runner modes, co-op and Dodgeball

Nov 2026. Sections 1 to 3 and 5 cover the 2D Runner and Runner 3D (branch `runner-netcode`):
what went wrong, how it works now, the numbers before and after. Section 4 covers co-op and
Dodgeball, which got the same input rules on branch `coop-dodge-inputs`, with their own numbers.
Section 6 says how to run the checks.

## 1. The report

Two players on the same good home Wi-Fi, against the hosted server (a free Render instance in
Oregon, the players on the US east coast):

> He would literally die on my screen, and then the game would immediately realize that he
> actually didn't die: it would say "Sol wins", and then immediately continue the game. And his
> character was jittery.

## 2. The cause, as measured

Both runners had copied co-op's client scheme. Every tick the client stepped the whole sim with
its own keys and the other player's last known keys, and on each server snapshot it replayed
from the server's state the same way. The other player's drawing came from that prediction.

In a runner that breaks. The other player runs at full speed and jumps at exact moments. A jump
the client hears about a round trip late (about 100 ms here) means the predicted copy of them
runs into the pit, the thorns or the pool. The client then predicted their death, ended the
match ("Sol wins"), and the next snapshot took it back. Between snapshots the other player was
drawn from that wrong prediction and pulled back to the truth: the jitter.

Three more faults made it worse, all found with the harness in section 5:

- **The server killed players.** When a player's input queue ran dry (a late packet), the server
  held the last keys for 10 ticks and then let go of them, and it cut a queue longer than 12
  down to 4. Either way some inputs were applied on other ticks than the client predicted, or
  not at all (a cut can drop a jump). In the baseline every single match ended early with a
  death the bots' plans did not have: the network killed someone, on the server, for real.
- **Your own player was corrected by up to 90 px (42 px backward)** for the same reason.
- **A stalled tab lost ticks.** `main.js` turned a frame over 250 ms into one tick, and the
  runners dropped whatever was left after 8 ticks in one frame. Those inputs were never sent.

What was not the cause: the server's CPU. A 2D runner tick costs about 0.04 ms and a 3D tick
about 0.007 ms. Under a 10% CPU quota (`systemd-run --user --scope -p CPUQuota=10%`, like the
free instance) with 3 to 6 rooms at once, the server kept 60.0 ticks per second, before and
after. Ten runner rooms at once used 5.9% of one core. The 250 ms backlog clamp in its loop never fired.

Why the old checks missed it: they compared the two clients' final states, and `LAG_MS` was a
fixed delay with no jitter and no spikes, so the server's queue never ran dry.

## 3. How it works now

### The client (`public/js/runner-sync.js`, used by both runner apps)

- **Your own player is predicted**, as before: every tick steps a copy of the sim (`P`) with your
  keys, and each snapshot is replayed forward with the inputs the server hasn't applied yet. A
  correction is carried as a short offset that pays off no faster than you run forward, so it
  slows you down for a moment instead of pulling you back.
- **The prediction never kills anyone and never ends the match.** The state carries `pred: 1`.
  `stepRunner` and `stepRunner3d` then only note a death in `S.pk[i]` (`predictedDeath`, an
  additive function at the end of each sim). Deaths, "X wins", the death sound and the results
  card come only from a server snapshot.
- **Your own death before the server confirms it:** if the prediction runs you into a hazard,
  your player is held still at that spot, with no death shown and no sound, until the
  snapshot says you died (about one round trip later). Then the death plays where you were
  held. If the server says you lived (only possible if it had to guess your keys), you carry
  on. A held death is never shown as a death, so nothing is ever taken back.
- **The other player is drawn from the server's snapshots**, interpolated, a short time in the
  past. The playback clock puts them `delay` ticks behind the newest snapshot. `delay` is 1.5
  ticks plus the 90th percentile of how late snapshots arrived over the last 3 s, between 3 and
  9 ticks. The clock speeds up or slows down by up to 10% to follow it, so it never jumps.
  Measured, they are drawn 135 to 175 ms behind your own present at 40 ms one-way. The players
  pass through each other, so this changes nothing in play.
- **Late snapshots:** the other player is extended past the newest snapshot for at most 8 ticks,
  along half of the predicted motion (if they stopped, the extension stays behind them, which is
  made up forward at once, rather than ahead, which could only be paid back slowly). Then they
  are held.
- **Continuity:** from one frame to the next the other player's drawing may differ from "last
  frame plus the server's own motion over that frame" by at most `ease` (4 px in 2D, 0.16 units
  in 3D, per 1/60 s). Along the run it never goes back faster than the server's own path did,
  except a slow pay-back (`creep`, 0.2 px or 0.008 units per 1/60 s). Whatever is held back
  stays in an offset and eases out. So no source of error can make a pop or a backward step.
- **Their death and "X wins"** show when the drawing reaches the tick they died. Your own death
  shows when the snapshot arrives. When the end is shown, both players stay where they were
  drawn, and the results card uses the server's times and distances.
- **A stalled tab** (a hiccup, a Wi-Fi spike on the page) catches up: the missed ticks run, up to
  8 per frame, with up to 1 s of backlog, so the inputs keep their place in the server's queue.
  `main.js` passes online runners the real frame time.
- **Pacing:** the server reports the smallest length of your input queue over the last second
  (`qm`). The client runs 3% slower above 3 ticks and 3% faster below 1, to keep a small cushion
  that jitter never empties.

### The server (`server/index.js`; co-op and Dodgeball rooms too since `coop-dodge-inputs`, section 4)

- **Snapshots every tick** (60 Hz, about 700 bytes), with `d` (ticks each player's keys were
  held), `q` and `qm` (queue lengths).
- **Hold and skip.** If a player's queue runs dry, their last keys are held and every held tick is
  counted. When the late inputs arrive, the ones equal to the held keys were already applied by
  the hold, so they are skipped. The player's path is then exactly what their client predicted.
  The client replays a snapshot the same way (`m.d`). Only keys that changed during the gap are
  applied late. After 30 ticks (0.5 s) with no input the keys are let go.
- **Wait first.** Before it holds anyone's keys, a runner room waits up to 24 ticks (400 ms) for
  late inputs, then catches up as soon as they arrive. A key pressed during a spike is still
  applied on its tick, so nobody dies of their own late packet. The price: during the wait the
  other player sees them (and the world) pause, then catch up smoothly.
- `NET_LOG=1` prints, per runner match: how often the room waited, holds, skips, late keys,
  releases, and the server's CPU use.
- Testing aids: `TEST_SEED=1` lets a client pick the course seed (the harness plays planned
  routes). `LAG_JITTER` and `LAG_SPIKE` add jitter and spikes to `LAG_MS`, in order, as over TCP.

### Moving and stateful parts

The world is drawn from your prediction, so the parts you stand on (the 2D chain plank,
crumbling slabs, the 3D chain slab and ember slabs) are exactly what your player meets. The
other player's weight on them comes into the prediction from each snapshot (the server's part
state at that tick), and their last keys move it forward from there. A remote player standing
on a part that moves (a 2D swing or plank, a 3D tilting slab or carousel stone) is drawn on the
part where it is now, not where it was at the drawn tick. Stepping on or off eases. A remote
player drawn in the past is also kept in front of the dusk as it is drawn now.

Known limit: clocked hazards (blades, sweepers, shards) are drawn at your present, the other
player about 150 ms in the past. Near a blade that passed them by a hair, they can look a little
closer to it than they were.

## 4. Co-op and Dodgeball

### What was wrong

Co-op and Dodgeball rooms kept the old input queue after the Runner fix: when a player's queue
ran dry the server held their keys for 10 ticks and then let go of them, and it cut a queue
longer than 12 down to 4. On a jittery link with spikes that happens all the time. Measured with
the harness (numbers below):

- **Co-op:** the recorded bot inputs win every level locally with no death. Over the network
  model they won 1 level of 32. 13 levels had deaths on the server (33 in all). The server cut
  5,688 inputs and let go of keys 54 times. 359 key presses landed on another tick than the
  client meant and 157 were never applied. Your own player was corrected by up to 103 px.
- **Dodgeball:** in 389 throws, 11 left the hand on another tick or at another angle than the
  thrower's own screen showed. 225 key presses landed off their tick (38 jumps, 66 throw
  buttons) and 25 were dropped. In another run of 380 throws, a player's own screen once showed
  them hit and the server then said they had dodged. Until now that case was only read in the
  code, never measured.

Even without any jitter the old server shifted co-op inputs: it starts stepping before the
first inputs arrive, so the first ones are applied about 14 ticks late. With a steady 40 ms and
no spikes, 4 of 8 levels still had a death.

### How it works now

**The server** gives co-op and Dodgeball rooms the Runner rooms' rules (`Room.sharedInput`,
`Room.advance`, `Room.inputsReady`):

- **Wait first.** When a player's inputs are late, the whole room waits up to 24 ticks (400 ms),
  then catches up as soon as they arrive. Every key is applied on the tick it was pressed.
- **Hold and skip** past the wait, as in the Runner rooms, with `d` in the snapshot so the client
  replays the same way. No queue is cut below 120.
- **Snapshots** stay at every 2 ticks (co-op states are bigger than runner ones), with `d` and `qm`
  added. After a catch-up only the newest one is sent.
- **Pacing** as in `runner-sync.js`, with one change: the queue report `qm` counts the ticks the
  room still owes. A room that has fallen behind real time steps the moment a late input arrives,
  so the queue always shows that one input, and the clients never learned to run ahead. Then the
  room ran in lockstep a few ticks late and had less of its 400 ms left for the next spike (83,000
  waits per 32 levels, 18 holds). Counting the owed ticks brings it back on time: 6,000 waits,
  no holds.
- **An absent player is not waited for.** After about a second with no input (24 ticks of wait
  and 30 of hold: a hidden tab, a lost connection) the keys are let go and the room stops
  waiting for that player, so the partner's game is not held back. When they come back, their
  queue is kept to 2 inputs for a second, so the backlog a stalled tab sends is dropped instead
  of staying as a long delay. The normal network model never reaches this.

What waiting means when the partner stands on a lift: the whole room waits, lifts, crates, gates
and plates included. On the server the partner is still on the lift, at the same spot, when the
late jump off it is applied. A plate held for the partner is held on the server until the tick
they let go. Nobody's own screen pauses: each client keeps playing its prediction. Only the
other player's view of the late one comes late, and it is corrected when the snapshot arrives.

**Dodgeball keeps what the wind-up fix needs:** the server still measures each player's round
trip and queue for `windupFor`, and still withholds the other player's aim (`dodgeViewFor`). Three
changes keep the wind-up exact:

- The queue drain (`dodgeQueue`) now drops only a standing queue: one that never fell below 2 in
  the last second. Draining the cushion that jitter needs left that player's inputs late and the
  room waiting for them (1,200 holds in a 40 s test). It also stops 35 ticks (583 ms) before
  the ready freeze ends: a drain moves every input after it one tick earlier, and a client a
  round trip ahead has already sent its first inputs of play.
- The wind-up (`D.lag`) is set until 35 ticks before the freeze ends, not until its last tick. A
  client a round trip ahead was already playing the point with the old value, so a throw in the
  first moments of play could wind up longer or shorter on the thrower's screen than on the
  server. 35 ticks covers a round trip plus a 300 ms spike, when a client hears nothing new.
- The queue depth for the wind-up is sampled once per `advance()`, so a catch-up after a wait
  counts once, as what is left, and can't make the wind-up longer.

**The client** (`main.js`, using `public/js/net-pace.js`): online co-op and Dodgeball run every
missed tick after a stall (up to 8 a frame, 1 s of backlog) instead of dropping them, follow the
server's pace report, and skip on replay the inputs the server's hold already covered. Three
small hunks: the frame loop, `onSnapshot`, and a reset in `beginLevel`. Local play is unchanged.

### The partner is still drawn from the prediction

Co-op draws the partner in the present, from the prediction with their last known keys, eased
back to the server's state. I left it that way. Drawing them from snapshots 150 ms in the past,
as the Runners do, would detach them from the world, which is drawn in the present: the harness
finds the partner standing on a moving lift, crate or the other player, or pushing a crate, on
8.8% of frames, and that thing moves up to 31 px (95th percentile) and 72 px at most in 150 ms.
The Runners fix that only for a rider (`ride` in `runner-sync.js`); co-op would need it for
crates pushed, carried and stacked too. The prediction keeps the partner attached to what they
touch, at the cost below.

The cost of exact inputs for the partner's drawing: during a spike the server now applies the
late player's real keys on their ticks, where the old server held their last keys, which is what
the prediction assumes. So the other client learns more motion late. The drawing is a little
more often off the server's path (21.7% of frames over 4 px, from 17.3%), while the jolts stayed
the same or fell: the largest step beyond the server's own is 14.8 px per 1/60 s (14.4 before),
and steps over 6 px fell from 2,191 to 1,681.

## 5. The numbers

Harness: `tools/check-netcode.js`. The real server and two Node clients running the real client
sync code (`runner-sync.js`; the pre-fix logic is copied in `tools/net-old-clients.js`). Each
client's link: 40 ms one way plus up to ±15 ms of jitter per message, in order, a spike of 150
to 300 ms about every 8 s (both directions), and a client stall of 80 to 250 ms about every 20 s.
Frames at 60 Hz on vsync. Both players play bot routes planned with the real sims to survive
together for about 90 s (`tools/net-bots.js`). "Before" is the commit d52cb57 server and client
(plus a hook to pick the seed).

| Runner | | Before | After | Before, 10% CPU | After, 10% CPU |
| --- | --- | --- | --- | --- | --- |
| 2D | matches (seconds played) | 5 (110 s) | 5 (479 s) | 3 (93 s) | 3 (287 s) |
| 2D | matches ended by the network | 5 | 0 | 3 | 0 |
| 2D | false deaths / false "X wins" | 8 / 6 | 0 / 0 | 7 / 7 | 0 / 0 |
| 2D | other player: largest pop (px per 1/60 s) | 11.7 | 5.0 | 11.7 | 5.3 |
| 2D | other player: backward steps | 456 | 0 | 392 | 0 |
| 2D | other player: frames over 4 px off the server's path | 22% | 5.3% | 21% | 4.3% |
| 2D | your player: largest correction (backward) | 90 px (42 px) | 3.4 px (0) | 64 px (36 px) | 3.4 px (0) |
| 2D | your player drawn moving backward | 18 times | 0 | 21 times | 0 |
| 3D | matches (seconds played) | 5 (194 s) | 5 (475 s) | 3 (147 s) | 3 (285 s) |
| 3D | matches ended by the network | 5 | 0 | 2 | 0 |
| 3D | false deaths / false "X wins" | 3 / 3 | 0 / 0 | 8 / 8 | 0 / 0 |
| 3D | other player: largest pop (units per 1/60 s) | 0.58 | 0.21 | 0.58 | 0.20 |
| 3D | other player: backward steps | 696 | 0 | 568 | 0 |
| 3D | other player: frames over 0.15 units off the path | 26% | 5.0% | 28% | 6.6% |
| 3D | your player: largest correction (backward) | 4.3 u (2.0 u) | 0.07 u (0) | 4.8 u (1.8 u) | 0.28 u (0.14 u) |
| 3D | your player drawn moving backward | 10 times | 0 | 0 | 0 |

The one backward correction after the fix (0.14 units, one tick of running, under the CPU
limit) was eased as a slow-down; the player was never drawn moving backward. The other player
is drawn 150 to 155 ms (mean) behind your own present. The server used 5.9% of one core for 10
runner rooms at once (snapshots at 60 Hz), and 4.5% for 6 rooms under the 10% quota.

Both clients showed the server's winner at the end in every match. "Off the path" after the fix
is the extension during spikes (the server waited for the other player), eased back without a
pop. Pass thresholds of the check: no death or end shown when the server had not reached it,
nothing shown and taken back, the other player's pop at most 6 px (0.25 units) per 1/60 s and no
backward step over 0.5 px (0.02 units) per 1/60 s, your own player never drawn backward beyond
what the prediction itself did, nobody killed before the plan's end, and both clients agree
with the server at the end.

Co-op on the `runner-netcode` branch (`KIND=coop`, levels 1 and 2): before, Luna's client
showed a death and took it back once in level 2; after, nothing was taken back. The bots still
died for real; that was fixed later (section 4 and the tables below).

`tools/playtest/online-browser.mjs` (co-op, lockstep clock) fails its level-1 and level-10
results checks on this machine with the old code too (17 checks pass on this branch, 15 on
d52cb57): its driver runs well under 60 frames per real second here, so the bot routes fall
apart against the real-time server.

Real browsers (`tools/playtest/runner-lag.mjs`, two headless Chromium pages at 59 fps, server
lag 60 ms ±20 ms with a spike about every 6 s, final run): nothing shown and taken back,
matching results cards, the other player's largest pop 4.3 px (2D) and 0.21 units (3D), no
backward steps, your own player never drawn backward, no own correction at all. An earlier run
with the pages at only 11 to 13 fps (a loaded machine) passed too.

### Co-op and Dodgeball (`coop-dodge-inputs`)

Same harness and network model. "Before" is the 4be5032 server and client (the client modelled
in `tools/net-coop.js`, `SCHEME=base`), with counters added to the server for the measurement.

Co-op: all 32 levels, both players replaying the recorded bot inputs that win locally with no
death. The inputs are played by world tick, so any input applied on another tick than the
client meant shifts the plan.

| Co-op, 32 levels | Before | After | Before, 10% CPU | After, 10% CPU |
| --- | --- | --- | --- | --- |
| levels won | 1 | 32 | 1 | 32 |
| levels with a death on the server (deaths) | 13 (33) | 0 | 12 (32) | 0 |
| keys let go / inputs cut by the server | 54 / 5,688 | 0 / 0 | 93 / 7,143 | 0 / 0 |
| ticks a player's keys were held (guessed) | 7,015 | 0 | 8,251 | 0 |
| key presses off their tick / never applied (of about 8,000 to 9,000) | 359 / 157 | 0 / 0 | 368 / 208 | 0 / 0 |
| your player: largest correction (count over 0.5 px) | 103 px (1,139) | 22 px (85) | 40 px (1,323) | 34 px (93) |
| partner: largest step beyond the server's (px per 1/60 s) | 14.4 | 14.8 | 24.7 | 35.4 |
| partner: steps over 6 px / over 12 px | 2,191 / - | 1,681 / 7 | 2,090 / 20 | 1,685 / 5 |
| partner: frames over 4 px off the server's path | 17.3% | 21.7% | 16.9% | 22.2% |
| deaths or wins shown and taken back | 0 | 0 | 0 | 0 |
| room waits for late inputs (longest) | - | 6,084 (22 ticks) | - | 6,115 (22 ticks) |

After the fix, your own player's corrections come only from the shared world: a crate, lift or
the partner moved by the partner's keys, which your client learns late. The one 35 px step of
the partner under the CPU limit is a single frame; 5 steps were over 12 px in 32 levels.

With a steady 40 ms and no jitter, spikes or stalls (levels 1, 2, 4, 9, 10, 15, 21, 22): before,
7 won and 4 had a death, from the 14 ticks the old server steps before the first inputs arrive;
after, all 8 won with no death. The room waits about 200 times at the start of each level
(the first 3 s, while pacing brings the clients ahead of it), then not at all.

Dodgeball: 12 runs of 90 s. Bots read their own screen: holding the ball they walk a little, aim
for a random time (or tap) and release; a ball thrown at them gets a random reaction (a jump, a
jump back, a run back, or nothing) 0 to 11 ticks after they first see it.

| Dodgeball, 12 x 90 s | Before | After (2 runs) | Before, 10% CPU | After, 10% CPU |
| --- | --- | --- | --- | --- |
| throws (hits) | 389 (117) | 758 (230) | 371 (99) | 379 (109) |
| your own screen showed you hit, the server said dodge | 0 (1 in another run of 380) | 0 | 0 | 0 |
| your own screen showed you dodge, the server said hit | 0 | 0 | 0 | 0 |
| your own throw left on another tick or angle than shown | 11 | 0 | 14 | 0 |
| thrower's screen showed a miss, the server said hit | 1 | 0 | 0 | 0 |
| key presses off their tick (jumps, throw buttons) / never applied | 225 (38, 66) / 25 of 2,504 | 0 / 0 of 4,817 | 223 (50, 68) / 37 of 2,520 | 0 / 0 of 2,411 |
| keys let go / inputs cut | 37 / 2,222 | 0 / 0 | 30 / 2,257 | 0 / 0 |
| ticks a player's keys were held | 13,237 | 2 | 12,467 | 0 |
| inputs drained between points | 10,778 | 838 | 9,704 | 415 |
| your player: largest correction | 39 px | 34 px | 39 px | 22 px |

"Thrower's screen showed a miss" is about the other player: the thrower sees them a round trip
late, so a run seen as a dodge can turn out a hit. It happened 0 to 4 times in 390 throws over
other runs after the fix, and 1 to 5 before.

The remaining corrections of your own player come from the drain between points (one tick of
walking in the ready freeze).

The dodge windows (`tools/dodge-latency.js`, the latest reaction that still escapes, back wall /
spawn / near net / spawn to spawn; local play 267 / 233 / 83 / 200 ms):

| one-way | wind-up | latest dodge | trials that end differently from local |
| --- | --- | --- | --- |
| 0 ms, steady | 1 tick | 267 / 233 / 83 / 200 ms | 0 of 177 |
| 20 ms, steady | 4 | 267 / 233 / 83 / 200 ms | 0 of 177 |
| 40 ms, steady | 6 | 267 / 233 / 83 / 200 ms | 0 of 177 |
| 75 ms, steady | 11 | 267 / 233 / 83 / 200 ms | 0 of 177 |
| 40 ms ±15 ms, spikes, before | 7 | 267 / 233 / 67 / 200 ms | 18 of 173 (4 trials timed out) |
| 40 ms ±15 ms, spikes, after | 7 | 267 / 233 / 83 / 200 ms | 6 of 177 |

The wind-up is the same as before at the same delay (1, 4, 6 ticks at 0, 20, 40 ms; jitter adds
one). With jitter and spikes the 6 trials left are ones where a spike held back the snapshots on
the defender's link, so the ball first showed late in its flight. No input rule can show a ball
the screen hasn't heard of.

`tools/check-dodge.js` (the sim, unchanged): a player standing still is hit unless they move
within 5 ticks (at most 6 allowed), moving on the release tick or the next escapes from anywhere
outside 237 px, and a jump at the release beats an aimed throw.

## 6. Running the checks

```bash
node tools/check-netcode.js                   # 2D and 3D (seeds 1-3, 90 s each), co-op levels 1, 4, 10,
                                              # 22, Dodgeball seeds 1-3, pass or fail (~4 min)
KIND=2d,3d node tools/check-netcode.js        # only the runners
SEEDS=1,2,3,4,5 CONC=10 node tools/check-netcode.js
CPU=10 node tools/check-netcode.js            # the server under a 10% CPU quota (systemd-run)
KIND=coop SEEDS=1,2 node tools/check-netcode.js   # co-op levels 1 and 2 (records missing bot inputs first)
SCHEME=old SERVER_ROOT=/path/to/d52cb57 node tools/check-netcode.js   # the baseline (no pass or fail)
KIND=coop SEEDS=$(seq -s, 1 32) CONC=8 node tools/check-netcode.js   # co-op, all 32 levels (~6 min)
KIND=dodge SEEDS=$(seq -s, 1 12) CONC=12 node tools/check-netcode.js  # Dodgeball, 12 runs of 90 s
SCHEME=base SERVER_ROOT=/path/to/4be5032 KIND=coop ...   # co-op and dodge baseline (that server needs the
                                              # counters and NET_TRACE added to measure; see section 5)
node tools/dodge-latency.js --lat 40 --jit 15 --spike 8 --reps 3   # dodge windows with jitter and spikes
JSON=out.json ... ; node tools/net-summary.js out.json   # the tables above
V=1 ...                                       # print every pop and backward step with its context
node tools/playtest/runner-lag.mjs            # real browsers over a laggy link, pass or fail
```

On a busy machine, run the harness with a high CPU weight, or the machine's load shows up as
network trouble: `systemd-run --user --scope -q -p CPUWeight=10000 node tools/check-netcode.js`.
The harness prints its own event-loop delays so you can tell.

`tools/playtest/runner-online.mjs` drives the pages in lockstep under clock control. When the
driver falls behind real time (it prints its real frame rate), the pages' clocks run slow
against the real-time server, and its step numbers say nothing about the netcode. Its results
card check still holds.

## 7. Files

| File | What |
| --- | --- |
| `public/js/runner-sync.js` | The client sync for both runners: prediction, playback of the other player, deaths only from the server, catch-up, pacing. No DOM. |
| `public/js/runner-app.js`, `runner3d-app.js` | Online they call the sync each frame; `this.S` is the state it shows. |
| `public/js/main.js` | `predictStep` (co-op prediction never kills or wins); the real frame time for online play; co-op and Dodgeball catch-up, pacing and replay skip. |
| `public/js/net-pace.js` | Co-op and Dodgeball: pacing from `qm`, the replay skip, catch-up limits. No DOM. |
| `shared/runner.js`, `shared/runner3d.js` | `predictedDeath` and one line in the step: a state with `pred` set never kills. |
| `server/index.js` | All rooms: wait for late inputs, hold and skip. Runner rooms: 60 Hz snapshots. Co-op and dodge rooms (`sharedInput`, `afterSteps`): `qm` with the owed ticks, absent players, dodge drain and wind-up timing. `NET_LOG`, `NET_TRACE`, `TEST_SEED`, `LAG_JITTER`, `LAG_SPIKE`. |
| `tools/check-netcode.js` | The harness and the permanent check (runners, co-op, Dodgeball). |
| `tools/net-coop.js` | The co-op and Dodgeball client of `main.js` for the harness, new and 4be5032 (`base`). |
| `tools/net-bots.js` | Bot routes for two players on one course (cached in `tools/playtest/out/net-tracks/`). |
| `tools/net-old-clients.js` | The pre-fix clients, for the baseline. |
| `tools/net-summary.js` | Tables from the harness's JSON. |
| `tools/playtest/runner-lag.mjs` | The real-browser check. |
