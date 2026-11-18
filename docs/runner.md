# Runner (versus mode)

An endless side-scroller for two. The view scrolls right on its own and slowly speeds up. Both
players run right to stay on screen. You lose when the dusk at the left edge catches you, when
you fall into a pit, or when you touch thorns, a falling shard or a pool hostile to your element.
When one player is lost the other wins; if both are lost on the same tick it is a draw.

Play it from the title menu (**Versus · same keyboard → Runner**) or from an online room
(**Versus → Runner**, once both players are in). Sol uses the arrows, Luna uses WASD.
Rematch always starts a new course (a new seed).

## Files

| File | What |
| --- | --- |
| `shared/runner.js` | Seeded course generator, obstacles, `stepRunner`. Runs in the browser and on the server. Reuses the player physics from `shared/sim.js`. |
| `public/js/runner-app.js` | Local loop, HUD, results and pause screens. Online sync is `runner-sync.js` (`docs/netcode.md`). |
| `public/js/runner-render.js` | Scrolling renderer: cached stone pages, parallax back wall, obstacles, the dusk edge. |
| `tools/runner-bot.js` | Search bot over the real runner sim (macro actions, best-first). |
| `tools/check-runner.js` | The fairness checker (below). |
| `tools/runner-browser.js` | Real-browser check of local play and an online room, with screenshots. |
| `tools/plank-predict.js` | Offline check that a client predicts the chain plank it stands on. |
| `tools/playtest/runner-plank-shots.mjs` | Staged screenshots of the plank and the distance milestones. |

Hooks in shared shell files are small: `sim.js` gained a `tileFn` lookup in `tileAt` and exports
of `mkPlayer`, `moveY`, `moveEnt`, `stepPlayer` and `checkHazards` (no behaviour change for the
co-op levels). `render.js` exports a few drawing helpers. `main.js` creates the `RunnerMode`,
hands it the frame loop while it is active, routes `start{mode:'runner'}` to it, and stops it
in `quitToMenu`. `server/index.js` has `Room.startRunner()`, `restartGame()` and `startMsg()`,
and steps `stepRunner` for runner rooms. `index.html` has a `.modes` row on the title card and in
the lobby (other versus modes can add a button there), plus the runner pause and results cards.

## World and determinism

- 30 rows high, endless to the right. The course is generated chunk by chunk from the seed, on
  demand, so the client and the server build the same course. All obstacle motion is plain
  arithmetic (no `Math.sin` in the sim), so prediction matches the server.
- Each chunk is a flat run-up of at least 3 tiles followed by one feature. The feature's landing
  is the next chunk's run-up.
- Moving parts are defined in `L.objs`; their changing state is in `S.o`, only for parts near the
  screen. Snapshots stay small.
- Players start on the same tile, pass through each other, and are frozen during the 3-2-1.
- The right edge of the view is not a wall (a wall there could stop a jump over a pit). Past it a
  player can't speed up, keeps a jump's momentum, and stops on landing until the view catches up.
  An arrow on the right edge shows where they are. A hard limit sits 10 tiles beyond the edge.

## Difficulty ramp

Scroll speed depends on distance scrolled (players run at 3.25 px/tick = 8.1 tiles/s). The table
in `shared/runner.js` is `SPEED = [[0, 1.35], [100, 1.67], [350, 1.95], [700, 2.35], [1100, 2.6],
[1600, 2.75]]` (tiles, px/tick):

| Time | Distance | Scroll | Difficulty |
| --- | --- | --- | --- |
| 0:00 | 0 tiles | 1.35 px/tick (3.4 tiles/s) | 0.00 |
| 0:15 | 54 | 1.52 | 0.05 |
| 0:30 | 114 | 1.69 | 0.10 |
| 0:45 | 179 | 1.76 | 0.16 |
| 1:00 | 246 | 1.83 | 0.22 |
| 1:30 | 390 | 2.00 | 0.35 |
| 2:00 | 546 | 2.17 | 0.50 |
| 2:30 | 716 | 2.36 | 0.65 |
| 3:00 | 897 | 2.47 | 0.82 |
| 4:00 | 1284 | 2.66 | 1.00 |
| 5:00+ | 1600+ | 2.75 (85% of run speed, the cap) | 1.00 |

The opening was changed in Nov 2026 after play: the old start, `[0, 1.0], [120, 1.45]`, took
about 1:30 to get going (1.00 at 0:00, 1.32 at 0:30, 1.62 at 1:00, 1.91 at 1:30). Now the first
100 tiles (about 30 s) climb from 1.35 to 1.67, then the climb slows to the old curve's
steepness and meets it at 350 tiles (1.95). From 350 tiles on the table is unchanged; the course
gets there about 10 s sooner than before. Difficulty and the obstacle introductions are still by
distance, so they also come a little sooner in time (thorns 3 s sooner, shards 12 s sooner).

Difficulty (0 to 1 over the first 1100 tiles) sets the safety margin kept below the measured jump
limits: 4 tiles at the start, 1 tile at full difficulty, never less. It also lengthens features
(more gaps, slabs, stones and shards per chunk), allows bigger height changes, shortens run-ups,
shortens shard warnings and slab crack time, and widens lantern swings.

Obstacles are introduced one at a time, each first appearing as an easy "intro" instance:
gaps and steps (start), thorns (30 tiles), shade pool (60), twin pools (90), chain plank (120),
ember slabs (170), eclipse stones (220), star well (280), swinging lantern (340), falling
shards (400). After that each chunk is a weighted random pick (never the same kind twice in a row).
The scroll reaches those distances at 0:09 (thorns), 0:17, 0:24, 0:31, 0:43, 0:54, 1:07, 1:20 and
1:32 (shards); with the old, slower opening it was 0:11, 0:22, 0:31, 0:40, 0:53, 1:05, 1:19, 1:32
and 1:44. Each new kind still arrives 7 to 13 s after the one before, so the intro distances were
left as they were.

## Obstacles and the four fairness rules

Rules: (1) every jump possible, (2) arriving second never makes it impossible, (3) moving parts
return to rest and can't be wedged, (4) both characters face equal difficulty.

| Obstacle | What it is | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Pits, steps | Gaps and height changes | Gap ≤ measured limit for that rise minus the margin | Stateless | Stateless | Same for both |
| Thorns | Crystal spikes on the floor, deadly to both | ≤ 4 wide, landing islands 5-7 tiles so a running player can land and jump again | Stateless | Stateless | Same for both |
| Shade pool | Deadly to both | Width ≤ gap limit | Stateless | Stateless | Same for both |
| Twin pools | A sun pool and a moon pool of the same width | Width ≤ gap limit | Stateless | Stateless | Each wades one and jumps the other |
| Chain plank | Beam on an axle at its middle, hung from a chain. The middle rocks; past it the beam tips you off; a touch on a tip spins it three times (below) | The gap before it (2 to 4 tiles) puts its middle where a full-speed jump from the ledge's edge comes down; between two planks 1 tile, off 1 or 2. Jumps are sized from the safe zone, never from the tip | Checked with the other player parked in the safe zone and abusing it (landing on each tip, hopping in the middle) at 7 delays. The run-up is 2 tiles longer (4 with two planks), so a second arrival can wait for it to settle | Always ends exactly level, within 106 ticks of a tip touch. Only its top face is solid, and only near level, so it is never a wall and can't hold anyone | Same for both |
| Ember slabs (new) | Floating stones that crack under a standing player, fall, and re-form | Gaps sized by the margin | The slab is back within about 1.4 s; checked for second arrivals | Fixed timers; re-forms as soon as no one is inside its space | Same for both |
| Eclipse stones (new) | Alternating sun and moon stones over a pit; you stand only on your colour | Every jump ≤ gap limit | Stateless | Stateless | Mirrored layout: both get the same set of jumps, in reverse order |
| Star well (new) | Updraft up the face of a cliff too tall to climb | The lift always carries you over the top | Stateless | Stateless | Same for both |
| Swinging lantern (new) | Platform on a long chain swinging on a fixed clock | Gaps sized for both the nearest and the farthest point of the swing | Players don't move it | Driven by the clock only | Same for both |
| Falling shards (new) | Crystals in a low gallery; a shard shakes and glows on the floor below, then drops, shatters and regrows | A full-speed runner passes under before it lands | A shard someone else triggered is falling or gone when you get there | Fixed timers | Neutral (deadly to both) |

## The chain plank (Nov 2026)

The owner, after playing: the planks' tip-over was "way, way too slow"; in the game they had in
mind, touching the tip of one spins it about three times, the first two fast and the last a bit
slower. The old plank was a slow damped spring capped at a small tilt. It is now a beam that
turns freely on an axle at its middle.

The rule, in plain words:

- **Near the middle it rocks.** Each player standing on it pushes with a torque that grows with
  their distance from the middle: gently inside the safe zone (about 30 px each side, 36 on the
  intro plank, marked by the glowing runes and the bronze bands), 12.5 times as hard beyond it. A
  stiff, well damped spring holds it toward level, so in the safe zone it leans at most about
  5 degrees and holds you. Up to about 7 px past the marked zone it still holds you, leaning up
  to 17 degrees.
- **Past the safe zone it tips you off.** It leans past the stand limit within a few ticks and
  drops you, then swings back and settles (about 0.4 s). It does not catch you again on the way
  back: once it is "loose" it carries no one until it is nearly level and slow.
- **A touch on the tip spins it.** A player on the last 18 px of either end (the ember-tinted caps)
  sets it turning at 0.36 rad/tick. It spins three turns, slowing down, and comes to rest
  exactly level. A player on a tip has 5 ticks of coyote time to jump off.
- **It is never a wall.** Only its top face is solid, and only while it is near level and slow.
  A player beside it or under it passes through, and it never pushes anyone sideways.
- **Rest is exactly level.** The beam looks the same upside down, so a half turn is level too.
  It snaps to exactly 0 when unloaded, within 0.005 of level and slower than 0.002 rad/tick.

Measured in the real sim (`tools/check-runner.js` and a drop test, every plank length):

| Touch | What happens | Turns | Times |
| --- | --- | --- | --- |
| Landing on a tip | Spins, slowing, and stops level | 3.0 (2.98 to 3.00 in the checker) | turns of 21, 27 to 28 and 43 ticks (0.35 s, 0.46 s, 0.72 s); at rest 105 to 106 ticks (1.75 s) after the touch |
| Landing past the safe zone, short of the tip | Tips the player off, swings back, settles | 0.00 to 0.01 | at rest 22 to 29 ticks after the landing |
| Landing in the middle | Rocks a little and holds the player | 0 | leans 0 to 5 degrees with the player standing |

State per plank (sent 60 times a second): `s`, the sine of its angle with the cosine kept
non-negative; `w`, its turn rate; `f`, 1 while it is loose. The step is plain arithmetic and
`Math.sqrt`: the turn is a rotation by `w` with polynomial sine and cosine, renormalised. No trig,
so the server and every browser compute the same bits.

The constants are `PLANK` in `shared/runner.js`:

| Constant | Value | What |
| --- | --- | --- |
| `near`, `far` | 0.0004, 0.005 | torque per px from the middle, inside and beyond the safe zone |
| `kick` | 0.36 rad/tick | turn rate a touch on the tip gives it |
| `tip` | 18 px | the tip, at each end |
| `hold`, `holdDamp` | 0.15, 0.35 | spring toward level and damping while it can't pass upright (it rocks) |
| `spin`, `spinDamp` | 0.06, 0.008 | the same while it can (it spins); the switch is "enough speed to pass upright" |
| `land`, `hop` | 0.00015, 0.0003 | the push of a landing (per px from the middle, per px/tick of fall) and of a jump off |
| `stand`, `standW` | 0.3, 0.1 | beyond this sine or turn rate it is loose and carries no one |
| `firmS`, `firmW` | 0.08, 0.05 | once loose, it carries people again only this close to level and this slow |

The time to rest was tuned for the worst case: a touch while the beam is still rocking gives
2.98 to 3.02 turns and rest within 110 ticks.

The generator: one plank of 6 to 8 tiles (two of 6 tiles, 1 tile apart, at difficulty over
0.55), sometimes a tile below the ledge. A full-speed jump taken at the ledge's edge comes down
about 134 to 157 px out (144 to 166 px onto a plank a tile lower), so the gap before the first
plank is round((150 + 10 * drop - 12 * len) / 24) tiles, which puts its middle there: 2 to 4
tiles. The natural jump lands in the safe zone; only a jump taken well before the edge reaches
the near tip, and the whole crossing (10 tiles or more) can't be jumped without the plank. Tried
on every plank of seeds 1-30 (365 planks): a full-speed jump taken 0 to 36 px before the edge,
holding right until it lands, lands 38 px left to 15 px right of the middle and stays on, every
time. The gap off is 1 or 2 tiles. The run-up before it is 2 tiles longer (4 with two planks):
someone may have just set it spinning, and a second arrival needs room to wait about 1.75 s.
The intro plank (at 120 tiles) is 6 tiles with a 3-tile gap on, a 1-tile gap off, and a wider
safe zone (36 px).

The art (`drawPlank` in `public/js/runner-render.js`): the chain ends in a hanger that holds the
axle; the hub glows with the speed of the turn; after-images and a faint arc trail the tips
while it spins. The rune inlay dims while the plank is loose. Screenshots:
`docs/img/runner/runner-plank-*.png` (at rest, a player in the middle, tipping, mid-spin, the
slow last turn, a crossing), taken with `tools/playtest/runner-plank-shots.mjs`.

## Distance milestones

Signs every 50 m (tiles from the spawn column) on the back wall. They used to be drawn into the
cached stone pages, by the page that owned their column, 66 px above the first filled tile from
the top of the column. That failed three ways: a sign whose column starts a page (150, 550, 950,
1350 m on every course) was cut in half at the page edge; over a pit it sat at the bottom of the
screen, in the fog; in a shard gallery it sat above the ceiling. Now they are drawn every frame,
after the stone, on the floor nearest their distance (up to 12 columns away) whose ground has
three clear rows above the whole plate. Before and after, on the same course (seed 1, the old
generator): `docs/img/runner/runner-milestone-{150,200,600}-{before,after}-{1280,1920}.png`.

## Checks

```bash
node tools/check-runner.js                           # 50 seeds, course to 1700 tiles (8 to 16 min with 6 jobs)
JOBS=6 PARTS=4 node tools/check-runner.js            # the same, explicit
SEEDS=11-20 node tools/check-runner.js               # a range of seeds (SEEDS=10 means 1-10)
SEED=7 V=1 TILES=600 node tools/check-runner.js      # one seed, every chunk printed
PARTS=0 node tools/check-runner.js                   # whole-course runs only (about 1 min for 50 seeds)
SEED=20 COURSE=0 CHUNKS=80-82 V=1 node tools/check-runner.js   # chunk tests for a few chunks
DUMP=/tmp/runner-dumps node tools/check-runner.js    # write the state at each whole-course failure
PORT=3217 node server/index.js &                     # then:
PORT=3217 OUT=docs/img/runner node tools/runner-browser.js
node tools/plank-predict.js                          # does a client predict the plank it stands on? (10 s)
PORT=3550 node tools/playtest/runner-plank-shots.mjs # plank and milestone screenshots
```

`tools/plank-predict.js` replays every plank chunk of seeds 1-10 the way an online client
predicts: from a server state 6 ticks old, its own keys, the other player's keys held. Result:
riding and rocking a plank, and tipping it yourself, are predicted exactly (0.00 px). When the
other player lands on the tip and throws you off, also 0.00 px (their jump is already in flight
in the snapshot). When they hop on the plank beside you, up to 2.97 px, which the next snapshot
corrects.

The checker runs work units in worker threads: per seed, the two whole-course runs (Sol, Luna)
and the chunk tests split into `PARTS` ranges (default 3). `JOBS` caps the threads (default: CPU
cores minus one, at most 8). Late chunks cost the most, so more parts balance the load better.
Two machines can share the 50 seeds with `SEEDS=1-25` and `SEEDS=26-50`; the summaries add up.

`check-runner.js` uses the real sim:

1. **Whole course**, per seed, for Sol and for Luna: the bot runs the course chunk by chunk at the
   real scroll speed, waiting on a start ledge only when more than 20 tiles ahead of the left
   edge. It must reach the end alive.
2. **Single chunk**: each chunk from its start ledge, 12 tiles ahead of the left edge, must be
   cleared alive. Chunks slower than the scroll are counted (the whole-course run shows the lead
   is made up again).
3. **Second arrival**: for chunks with planks, slabs or shards, the other character runs the
   chunk 10 to 130 ticks earlier; the tested one arrives with a 12-tile lead into whatever state
   the parts were left in, and must clear the chunk alive. The time lost is reported.
4. **Parked partner**: the other character stands still in each plank's safe zone (its near
   edge, the middle, its far edge) while the tested one crosses. Farther out the plank throws
   them off, so they can't park there; those cases are the abuse below.
5. **Plank abuse**: the other character lands on the near tip, lands on the far tip, or lands in
   the middle and hops there, starting 10 to 150 ticks before the tested one arrives. The tested
   one must clear the chunk alive.
6. **Tip touch**: every tip landing from test 5 must spin the plank 2.5 to 3.5 turns and leave it
   exactly level (`s === 0`).
7. **Back to rest**: after every run and after random abuse (hopping, standing on ends, falling
   off), every plank, slab and shard must be back at rest within a bound (planks: 120 ticks,
   exactly level and still).
8. **Equal difficulty**: average clear time per kind for Sol and for Luna.

Only "cleared alive" counts as a pass. Whether a chunk is cleared before the scroll catches up is
a statistic (one search at the normal budget, no retry); the whole-course run shows that the lead
lost on slow chunks is made up again.

### The bot

`runner-bot.js` is a best-first search over macro actions (run, wait, brake, and jumps that hold
or let go of right at set times), all in the real sim. A macro's steps run as written, and only
the last one is stretched until the player stands. With a deadline, it drops any node that could
not reach the goal in time even at full running speed (not on swing chunks, where riding the
lantern can be faster than running). One macro stands still until every plank in the chunk
carries people again (at most 150 ticks), so it can wait out a plank the other player set
spinning. For the abuse setups the search heads for a given x
(`toward`) instead of as far right as it can.

### Latest result (Nov 2026, the new chain plank)

```
Runner check: 50 seeds, 5585 chunks to 1700 tiles (full difficulty at 1100), top scroll speed 2.75 px/tick, 301 s in. 964 s.
  whole course    100/100 runs (Sol and Luna, every seed) reached 1700 tiles; smallest lead over the left edge at a chunk start: 6.1 tiles (median of per-run minimums 15.8)
  single chunk    11170/11170 cleared alive from a 12-tile lead; 146 of them slower than the scroll (repaid by later chunks)
  second arrival  17208/17208 cleared
  parked partner  4482/4482 cleared (partner standing still in the plank's safe zone: near edge, middle, far edge; still on it when the tested one arrived: 3304; could not be set up: 0)
  plank abuse     31374/31374 cleared (the other lands on the near tip, the far tip, or hops in the middle, 10/25/40/60/90/130/150 ticks earlier; could not be set up: 0)
  tip touch       2658 touches: 2.98 to 3.00 turns (allowed 2.5 to 3.5), turns took 21-21, 27-28, 43-43 ticks, at rest (angle exactly 0) at most 105 ticks after the touch; bad: 0, no spin: 0, touched again first: 330
  spare time at a chunk's exit vs. the scroll (ticks): min -84, median 22
  time lost by second arrivals vs the deadline (ticks, + = later): median -15, 95% 65, max 180
  kind      chunks  sol avg  luna avg  max |sol-luna|  min spare  top speed
  start         50    6.25s     6.25s           0 t       50 t  1.43
  gaps         899    2.15s     2.15s           0 t        0 t  2.75
  steps        434    2.07s     2.07s           2 t       -8 t  2.75
  flat         213    2.37s     2.37s           0 t        0 t  2.75
  thorns       528    1.92s     1.92s           0 t      -84 t  2.75
  shade        361    1.37s     1.37s           0 t       -5 t  2.75
  twin         512    1.96s     1.97s          40 t        0 t  2.75
  plank        606    2.63s     2.63s           2 t       -1 t  2.75
  crumble      492    2.17s     2.17s           0 t      -11 t  2.75
  eclipse      407    2.64s     2.66s          49 t       -5 t  2.75
  vent         315    2.00s     2.00s           0 t      -29 t  2.75
  swing        429    1.80s     1.80s           0 t      -48 t  2.75
  shards       339    2.73s     2.73s           2 t        0 t  2.75
  rest after a run  plank  1494 objects, slowest 106 ticks after the last touch, over bound: 0
  rest after a run  shard  576 objects, slowest 223 ticks after the last touch, over bound: 0, 924 scrolled away first
  rest after a run  slab   1336 objects, slowest 95 ticks after the last touch, over bound: 0
  rest after abuse  plank  1382 objects, slowest 107 ticks after the last touch, over bound: 0, 12 scrolled away first
  rest after abuse  slab   799 objects, slowest 98 ticks after the last touch, over bound: 0, 12 scrolled away first
  rest after abuse  shard  356 objects, slowest 251 ticks after the last touch, over bound: 0, 1592 scrolled away first

PASS
```

That run took 964 s with 6 jobs on a shared 16-core Linux machine with a load average of 25 to
30 (467 s for the same run at a load of about 12). Compared with the run before the new plank:

- Plank chunks take longer to clear (2.63 s on average, was 2.40 s): the jump lands in the safe
  zone and then goes on, instead of running along a tilting beam.
- Second arrivals can lose more time (95% 65 ticks late against the deadline, worst 180 ticks,
  was 24 and 132): a tip touch just ahead of them means waiting about 1.75 s for the plank to
  settle. Every one of them cleared the chunk alive.
- The smallest lead over the left edge at a chunk start in the whole-course runs fell from 10.8
  to 6.1 tiles (median of the per-run minimums 15.8, was 17.3). The courses differ after the
  first plank, so this compares different chunks; all 100 runs reached 1700 tiles.
- New: 4482 parked-partner runs (the partner in the safe zone; in 3304 of them still standing
  there when the tested one arrived, the rest had stepped or been tipped off), 31374 abuse runs,
  2658 tip touches (2.98 to 3.00 turns, exactly level at most 105 ticks after the touch).

### The 1700-tile failures, and why they were the bot

When the course was first extended to 1700 tiles, 10 whole-course runs over 7 seeds (4, 7, 8, 14,
18, 19, 20) failed on a crumble, eclipse, gaps or thorns chunk. The single-chunk tests on the same
chunks passed. In every failure the player began the chunk at the last pixel of its run-up, at
full speed: the jump before had landed late, which is normal at full difficulty, because a running
jump carries about 6.75 tiles and run-ups are 3 to 4 tiles. From there the next jump has to be
shortened in the air. The bot could not do that. A timed macro step that ended in the air was held
until landing, so "jump, then let go of right" really held right for the whole jump. Sol and Luna
take the same line on most chunks, which is why both failed the same crumble chunk.

With that fixed, the bot clears all ten states. A person can too, with room to spare. From each
state, jumping on tick d and then letting go of right after n ticks clears the chunk for these
pairs:

| Failure | Jump on tick | Let go after | Narrowest let-go window, any jump tick |
| --- | --- | --- | --- |
| seed 20 crumble (2-wide slab) | 0-4 (coyote time) | 0-22 ticks | 18 ticks (0.30 s) |
| seed 18 crumble | 0-5 | 0-40 | 27 |
| seed 19 crumble | 0-4 | 0-37 | 28 |
| seed 4 gaps | 0-4 | 3-35 | 24 |
| seed 14 eclipse | 0-4 | 4-32 | 22 |
| seed 7 eclipse | 0-4 | 3-31 | 23 |
| seed 8 thorns (thorn at the run-up's edge) | 0-1 | 0-28 | 28 |

The thorn case leaves only 2 ticks to jump, because the bot had run right up to a thorn. That
is a situation the player creates, like any thorn they run into. Nothing in the generator was
changed.
