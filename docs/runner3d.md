# Runner 3D (versus mode)

A third-person race for two through an endless twilight temple. It is not a scroller. A wall
of dusk (the zone) follows the players down the course and slowly speeds up. Both run forward
to stay ahead of it. You lose when the dusk catches you, when you fall (into a pit or off the
side of the course), when you touch thorns, a thorn arm, a blade, a rolling orb or a thorn
curtain, or when you sink into a pool hostile to your element: sun pools kill Luna, moon pools
kill Sol, shade kills both. When one player is lost the other wins; if both are lost on the
same tick it is a draw.

Each player has their own camera behind them, looking down +z. It never turns, so the
controls are world directions.

## Files

| File | What |
| --- | --- |
| `shared/runner3d.js` | The sim: course generator, obstacles, `stepRunner3d`, `objPose`. Runs in the browser and on the server. The CONTRACT header at the top is the interface for the renderer and the app shell. |
| `tools/runner3d-bot.js` | Search bot over the real sim (macro actions, best-first, retry ladder). `node tools/runner3d-bot.js 1,2,3 1700` runs it down whole courses. |
| `tools/check-runner3d.js` | The fairness checker (below). |

## Space, controls and movement

- x is lateral (+x is the player's right), y is up, z is forward. 1 unit = one 2D tile.
- Input bits: `IN_L 1`, `IN_R 2`, `IN_J 4`, `IN_F 8`, `IN_B 16`. Forward and sideways together
  move diagonally at the same total speed.
- Movement is the 2D game's physics divided by 24 (`P3`): run 8.1 units/s, a running jump
  rises about 4.1 units and stays in the air 0.8 s. Coyote time 5 ticks, a 6-tick jump buffer,
  and holding jump jumps again on landing. Step-up 0.5 units (low steps are walked, higher
  ones jumped).
- The player is a box 0.72 wide and 1.4 tall. Players pass through each other.
- Static stone is solid on every side. Moving and tilting parts are solid from above only, so
  nothing can ever pin or wedge a player.
- A player stood on an orbiting stone is carried with it. A tilted slab slides what stands on
  it slowly downhill (5% of the slope per tick), so it is felt, but a player can always walk
  against it.
- Falling: a player more than 9 units below the last ground they stood on is lost.
- Lead cap: a standing player more than `LEAD_MAX` = 32 units ahead of the dusk can't walk
  forward until it closes in (sideways and back still work). In the air nothing is taken away,
  so a jump over a pit is never cut short; you just can't speed up. A standing jump still
  clears every gap thanks to air control, so the cap only ever costs time. A hard stop sits at
  `LEAD_HARD` = 46, out of reach (a full jump from the cap lands well short of it). This keeps
  the dusk a live threat and the active object window small.

## Determinism and the wire

- Fixed 60 Hz. The step and the generator use only + - * /, `Math.sqrt`, `Math.floor` and
  comparisons. Rotation and swinging go through `trig()` (Taylor polynomials around the middle
  of each quadrant, error below 1e-13) and `wave()` (a smooth back-and-forth polynomial). The
  server (Node) and every browser compute the same numbers.
- The course is generated section by section from the seed, on demand.
- `S` is plain JSON. Only stateful objects in the active window (from 12 units behind the dusk
  to 30 units past `LEAD_HARD`) have state in `S.o`.

## Difficulty ramp

Zone speed by distance it has travelled, and difficulty (0 to 1 over the first 1100 units):

| Time | Distance | Zone speed | of run speed | Difficulty | Margin | Widest flat gap |
| --- | --- | --- | --- | --- | --- | --- |
| 0:00 | 0 | 2.5 u/s | 31% | 0.00 | 4.00 | 3.3 |
| 0:30 | 87 | 3.3 | 41% | 0.07 | 3.82 | 3.4 |
| 1:00 | 198 | 4.1 | 50% | 0.17 | 3.54 | 3.7 |
| 1:30 | 330 | 4.8 | 59% | 0.29 | 3.21 | 4.1 |
| 2:00 | 481 | 5.3 | 65% | 0.42 | 2.83 | 4.4 |
| 2:30 | 645 | 5.7 | 70% | 0.57 | 2.42 | 4.8 |
| 3:00 | 823 | 6.1 | 75% | 0.74 | 1.98 | 5.3 |
| 4:00 | 1204 | 6.6 | 81% | 1.00 | 1.25 | 6.0 |
| 5:00+ | 1600+ | 6.9 | 85% (the cap) | 1.00 | 1.25 | 6.0 |

The margin is how many units every gap stays below the measured jump envelope `env(rise)`
(the gap a full-speed running jump clears for a given rise): 4 units at the start, 1.25 at
full difficulty, never less. Difficulty also lengthens features (more gaps, rows, slabs,
blades, curtains), allows bigger height changes, narrows landings, beams and openings,
shortens run-ups and crack times, speeds up clocks and adds lanes.

Each section is a run-up (3 to 9 units, shorter with difficulty, sometimes changing width
halfway) followed by one feature. Kinds are introduced one at a time, each first as an easy
"intro" instance: gaps and steps (start), thorns (30), pools (70), chain slab (110), stepping
stones (150), ember slabs (190), thorn sweeper (240), eclipse stones (290), twin beams (340),
pendulums (390), orbiting stones (440), thorn curtain (500), rolling orbs (560). After that
each section is a weighted random pick, never the same kind twice in a row.

## Obstacles and the four fairness rules

Rules: (1) every jump is possible, (2) arriving second never makes a section impossible,
(3) moving parts return to rest and can't be wedged, (4) both characters face equal
difficulty.

| Obstacle | What it is | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Gaps | Pits with landings offset sideways, higher or lower, narrower | Gap ≤ envelope for that rise minus the margin; landings overlap the take-off sideways by at least 1.2 units | Stateless | Stateless | Same for both |
| Steps | Stairs up or down, ramps, drops, width changes | Rises ≤ 1.5 per step (0.5 is walked), ramps at most 1:2 | Stateless | Stateless | Same for both |
| Thorns | Hedges blocking part of the width (dodge through the opening, or jump them) and low strips across the whole width (jump) | Openings ≥ 1.6 wide; rows spaced so a diagonal run reaches the next opening; strips ≤ 2.5 deep | Stateless | Stateless | Same for both |
| Pools | Twin channels: a sun channel and a moon channel side by side with a neutral strip, swapping sides at higher difficulty, shade bars across them; shade ponds; a sun/moon checkerboard | Every hostile stretch is either walkable around (the strip) or ≤ the gap limit | Stateless | Stateless | Mirrored: Sol's channel is Luna's channel reflected, and the checkerboard has an even column count so its mirror swaps the colours |
| Chain slab | Slab hung on chains over a pit, tilting on two axes toward the weight on it | Gaps on and off sized for the slab at full tilt | Checked with the other player arriving earlier, abusing it, and parked on its edges, middle and corners | Damped spring back to exactly level (snaps to 0 below 2e-4), bounded 150 ticks; solid from above only, so it can't wedge | Same for both |
| Stepping stones | Three lanes of stones over a pit with some missing | Every stone reachable from a stone in the row before (lanes at most one apart), gaps ≤ limit | Stateless | Stateless | Same for both |
| Twin beams | Two narrow beams side by side, breaking into pieces with jogs at higher difficulty | Beam gaps ≤ limit minus 2 | Stateless | Stateless | Same for both (both beams open to both) |
| Ember slabs | Floating slabs that crack once stood on, fall away and re-form | Crack time 40 to 26 ticks is plenty to land and jump; gaps ≤ limit | Gone for 40 ticks, back after 20 more once nobody is in its space; checked for second arrivals and abuse | Fixed timers | Same for both |
| Eclipse stones (new) | Two lanes of stones; in every row one is sun (only Sol stands on it) and one is moon (only Luna) | Every row-to-row jump, straight or across lanes, ≤ limit | Stateless | Stateless | Sol's route is Luna's reflected left-right |
| Thorn sweeper | A low thorn arm (or bar) turning over a round floor around a post | The bar is 0.55 high: a jump is above it for 46 ticks | Fixed clock, players don't move it | Clock only | Same for both |
| Pendulums | Blades swinging sideways across a narrow bridge | The swing carries the blade fully clear of the bridge at each end | Fixed clock | Clock only | Same for both |
| Orbiting stones (new, 3D) | Four stones circling a pillar over a pit; step on as one passes the ledge, ride or hop between stones, step off on the far side | A stone passes the ledge every quarter turn; hops between neighbouring stones are short | Fixed clock | Clock only | Same for both |
| Thorn curtain (new, 3D) | A thorn curtain across the course, too tall to jump, with an opening that slides from side to side | Opening ≥ 1.8 wide; it crosses every point of the course twice a period | Fixed clock | Clock only | Same for both |
| Rolling orbs | Orbs rolling down lanes toward the players on fixed clocks | Dodge between lanes, or jump (an orb is 1.4 tall) | Fixed clock | Clock only | Same for both |

## Checks

```bash
node tools/check-runner3d.js                  # 50 seeds, course to z 1700
QUICK=1 node tools/check-runner3d.js          # 4 seeds, for iteration
SEED=7 V=1 Z=600 node tools/check-runner3d.js # one seed, every section printed
```

`check-runner3d.js` uses the real sim, in parallel worker threads (`JOBS`, default 6). It
runs every seed far enough to reach full difficulty (z 1100) and the top zone speed (the
zone reaches it at z 1600 travelled). It tests, for every section:

1. **Whole course**, per seed, for Sol and for Luna: the bot runs section after section at
   the real zone speed, waiting on a run-up only when more than 20 units ahead. It must reach
   the end alive.
2. **Single section**: each section from its start with a 12-unit lead on the zone must be
   cleared alive. Sections slower than the zone are counted (the whole-course run shows the
   lead is made up again).
3. **Second arrival** (chain slabs and ember slabs): the other character runs the section 10
   to 130 ticks earlier, or abuses the parts (hops, stands on edges, falls off) from 130
   ticks earlier; the tested one arrives into whatever state the parts are in and must clear
   it. The time lost is reported.
4. **Parked partner** (chain slabs): the other character is held on the near edge, the
   middle, the far edge and the corners of each slab (full tilt) while the tested one crosses.
5. **Back to rest**: after every run and after random abuse, every stateful object must be
   back at exact rest within its bound.
6. **Equal difficulty**: average clear time per kind for Sol and for Luna.
7. **Determinism**: both course routes played together give the same state hash twice, from
   a freshly generated course, and with the state sent through `JSON.parse(JSON.stringify(S))`
   every 250 ticks.

RESULTS_PLACEHOLDER
