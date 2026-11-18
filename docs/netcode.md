# Netcode of the Runner modes (and what changed in co-op)

Nov 2026, branch `runner-netcode`. This covers online play of the 2D Runner and Runner 3D:
what went wrong, how it works now, the numbers before and after, and how to run the checks.

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

### The server (`server/index.js`, runner rooms only)

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

**Co-op had the same bug.** `main.js` predicts the partner from their last keys, so a jump heard
late walked them into a pool in the prediction: "Luna was lost…", the death sound, then the next
snapshot undid it. A predicted arrival at the doors could show the win the same way. Fixed with
`predictStep` in `main.js` (online only): the prediction never enters the death or the win
phase by itself; a death the prediction runs into is undone for that tick, so the character
keeps sinking into the pool until the server says. Measured with `KIND=coop` (section 5).

**Dodgeball:** hits on the other player already wait for the server (`D.wait`, an impact flare).
A hit on yourself is shown from your own prediction. It can only disagree with the server when
the server applied your inputs on other ticks than you predicted. Dodge rooms keep the old
input queue (hold 10 ticks, cut a queue over 12 to 4), so a cut after a spike can apply your
jump earlier than you pressed it. Then your screen can show you hit and the server not. This is
rare, and the code (`shared/dodge.js` and the dodge input queue) was left alone. The fix, if it
shows up: give dodge rooms the runner input rules (hold and skip, no cut).

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

Co-op (`KIND=coop`, levels 1 and 2 with the recorded bot inputs, same network model): before,
Luna's client showed a death and took it back once in level 2; after, nothing was taken back.
The bots still die for real in co-op under spikes, because co-op rooms keep the old input queue
(see section 4: the runner rules would fix it there too).

`tools/playtest/online-browser.mjs` (co-op, lockstep clock) fails its level-1 and level-10
results checks on this machine with the old code too (17 checks pass on this branch, 15 on
d52cb57): its driver runs well under 60 frames per real second here, so the bot routes fall
apart against the real-time server.

Real browsers (`tools/playtest/runner-lag.mjs`, two headless Chromium pages at 59 fps, server
lag 60 ms ±20 ms with a spike about every 6 s, final run): nothing shown and taken back,
matching results cards, the other player's largest pop 4.3 px (2D) and 0.21 units (3D), no
backward steps, your own player never drawn backward, no own correction at all. An earlier run
with the pages at only 11 to 13 fps (a loaded machine) passed too.

## 6. Running the checks

```bash
node tools/check-netcode.js                   # 2D and 3D, seeds 1-3, 90 s each, pass or fail (~2 min)
SEEDS=1,2,3,4,5 CONC=10 node tools/check-netcode.js
CPU=10 node tools/check-netcode.js            # the server under a 10% CPU quota (systemd-run)
KIND=coop SEEDS=1,2 node tools/check-netcode.js   # co-op (run node tools/playtest/record-bot.mjs 1,2 first)
SCHEME=old SERVER_ROOT=/path/to/d52cb57 node tools/check-netcode.js   # the baseline (no pass or fail)
JSON=out.json ... ; node tools/net-summary.js out.json   # the table above
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
| `public/js/main.js` | `predictStep` (co-op prediction never kills or wins); the real frame time for online runners. |
| `shared/runner.js`, `shared/runner3d.js` | `predictedDeath` and one line in the step: a state with `pred` set never kills. |
| `server/index.js` | Runner rooms: hold and skip, wait for late inputs, 60 Hz snapshots, `NET_LOG`, `TEST_SEED`, `LAG_JITTER`, `LAG_SPIKE`. |
| `tools/check-netcode.js` | The harness and the permanent check. |
| `tools/net-bots.js` | Bot routes for two players on one course (cached in `tools/playtest/out/net-tracks/`). |
| `tools/net-old-clients.js` | The pre-fix clients, for the baseline. |
| `tools/net-summary.js` | Tables from the harness's JSON. |
| `tools/playtest/runner-lag.mjs` | The real-browser check. |
