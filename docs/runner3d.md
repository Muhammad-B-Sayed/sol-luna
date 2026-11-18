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

Play it from the title menu (**Versus, same keyboard: Runner 3D**) or from an online room
(**Versus: Runner 3D**, once both players are in). Rematch always starts a new course. Online,
the server picks the seed.

Contents: 1 rules and controls, 2 speed and difficulty, 3 obstacles and fairness, 4 the checker
and its numbers, 5 determinism and netcode, 6 files and hooks, 7 rendering, 8 readability cues,
9 how to run each tool, 10 known issues, 11 work log.

## 1. Rules and controls

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
- Lead cap: a player standing on a run-up (the plain stone before each feature) more than
  `LEAD_MAX` = 32 units ahead of the dusk can't walk forward until it closes in (sideways and
  back still work). Nobody is ever held in the air or inside a feature, so a jump is never cut
  short and nobody is frozen on a crumbling slab, in a blade's path or among thorns. A
  standing jump from the very edge of a run-up still clears every gap (air control), so the
  cap only ever costs time. At top speed 32 units is about 4.6 s of lead. This keeps the dusk
  a live threat and the active object window small (12 units behind the dusk to 76 ahead of
  it, or 30 past the leading player).

| | Move (the camera never turns, so up is always forward) | Jump |
| --- | --- | --- |
| Sol, local | arrow keys | Right Shift, `/`, Numpad 0 |
| Luna, local | W A S D | Space, Left Shift |
| Online | either set drives your own character | any of the above, Space included |
| Gamepad | left stick or d-pad (pad 0 is Sol, pad 1 is Luna locally; any pad online) | A |
| Touch (online only) | left thumb pad, 8 directions | the round button |

`Esc` or `P` pauses, and `R` starts a new course, the same as the 2D runner.

## 2. Speed and difficulty

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

## 3. Obstacles and the four fairness rules

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
| Ember slabs | Floating slabs, each split into two halves side by side, that crack once stood on, fall away and re-form | Crack time 40 to 26 ticks is plenty to land and jump; gaps ≤ limit | A player cracks only the half they stand on, so one pass always leaves a half for the player behind; a broken half is gone 30 ticks and back 12 later once nobody is in its space | Fixed timers | Same for both |
| Eclipse stones (new) | Two lanes of stones; in every row one is sun (only Sol stands on it) and one is moon (only Luna) | Every row-to-row jump ≤ limit; a lane switch (a diagonal jump from a small stone, with no room to turn) gets a shorter row gap | Stateless | Stateless | Sol's route is Luna's reflected left-right |
| Thorn sweeper | A low thorn arm (or bar) turning over a round floor around a post | The bar is 0.55 high: a jump is above it for 46 ticks | Fixed clock, players don't move it | Clock only | Same for both |
| Pendulums | Blades swinging sideways across a narrow bridge | The swing carries the blade fully clear of the bridge at each end; the blades of one bridge share a clock, each phased by the running time from the first, so timing the first is enough | Fixed clock | Clock only | Same for both |
| Orbiting stones (new, 3D) | Four stones circling a pillar over a pit; step on as one passes the ledge, ride or hop between stones, step off on the far side | A stone passes the ledge every quarter turn; hops between neighbouring stones are short | Fixed clock | Clock only | Same for both |
| Thorn curtain (new, 3D) | A thorn curtain across the course, too tall to jump, with an opening that slides from side to side | Opening ≥ 2.0 wide; it crosses every point of the course twice a period; curtains in one section share a clock phased by running time, so following the opening through one lines you up with the next | Fixed clock | Clock only | Same for both |
| Rolling orbs | Orbs rolling down lanes toward the players on fixed clocks | Dodge between lanes, or jump (an orb is 1.4 tall) | Fixed clock | Clock only | Same for both |

## 4. The checker and its final numbers

```bash
node tools/check-runner3d.js                  # 50 seeds, course to z 1700
QUICK=1 node tools/check-runner3d.js          # 4 seeds, for iteration
SEED=7 V=1 Z=600 node tools/check-runner3d.js # one seed, every section printed
```

`check-runner3d.js` uses the real sim, in parallel worker threads (`JOBS`, default 6). It runs every seed far enough to reach full difficulty (z 1100) and the top zone speed (the
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

### What the checker found

The first full runs failed, and each failure was traced to either the course or the bot:

- **Course: ember slabs.** A player arriving 25 ticks behind could find every slab broken, and
  the wait for them to re-form ate a 12-unit lead at top speed. Slabs now come as two halves
  (one pass leaves a half whole) and re-form faster.
- **Course: lead cap.** Holding a player at the cap anywhere could freeze them on a crumbling
  slab or among thorns. The cap now holds only on run-ups.
- **Course: eclipse lane switches.** Diagonal jumps from small stones with full-length row gaps
  were barely possible. Lane switches now get shorter gaps.
- **Course: thorn curtains and pendulum rows.** Several curtains or blades on unrelated clocks
  drained the lead at top speed (one row of curtains cost 6.5 units of a 20-unit lead). They
  now share a clock phased by running time.
- **Bot.** Braking and steering jumps never braked (an early macro step that ended in the air
  kept its bits until landing). Its section goal accepted doomed states (full speed just in
  front of thorns past a short run-up, or a buffered jump at a run-up's edge). It now has
  retry rungs with other time weights and with a sideways or backward start.

### Final numbers

`node tools/check-runner3d.js` (50 seeds, z 1700, `JOBS=6`), at commit `4c0c574`: **PASS** in 146 s.

| Test | Result |
| --- | --- |
| Whole course | 100/100 runs (Sol and Luna, every seed) reached z 1700, 317 s of play, past full difficulty (z 1100) and at top zone speed (6.9 u/s). Smallest lead at a section start 4.8 units, median of per-run minimums 13.1 |
| Single section | 9722/9722 cleared alive from a 12-unit lead (4861 sections); 1027 slower than the zone, repaid by later sections |
| Second arrival | 10668/10668 cleared. Time lost against the deadline: median -25 ticks (still early), 95% 6, worst 51 |
| Parked partner | 7364/7364 cleared |
| Back to rest | Chain slabs: 1868 after runs and abuse, slowest 99 ticks (bound 150). Ember slabs: 2638, slowest 83 ticks (bound crack + 46). None over |
| Equal difficulty | Sol and Luna average clear times match to 0.01 s in every kind; the largest single-section gap is 49 ticks (eclipse, mirrored routes found differently by the bot) |
| Determinism | 50/50 seeds identical on replay, from a fresh course and through JSON every 250 ticks |

Average clear time per section at full speed ranges from 1.8 s (curtains, pendulums,
sweepers) to 3.7 s (stepping stones).

The sim is unchanged on the polish branch (`r3d-polish`), so these numbers still hold.

## 5. Determinism and netcode

- Fixed 60 Hz. The step and the generator use only + - * /, `Math.sqrt`, `Math.floor` and
  comparisons. Rotation and swinging go through `trig()` (Taylor polynomials around the middle
  of each quadrant, error below 1e-13) and `wave()` (a smooth back-and-forth polynomial). The
  server (Node) and every browser compute the same numbers.
- The course is generated section by section from the seed, on demand.
- `S` is plain JSON. Only stateful objects in the active window (from 12 units behind the dusk
  to 30 units past `LEAD_HARD`) have state in `S.o`.

Online play uses the same scheme as the 2D runner. The client predicts with its own input and
the last known remote input. On each snapshot it replays its unacknowledged inputs and carries
the difference as a decaying visual offset. Two additions:

- When the drawn position is ahead of the corrected one and the player is running forward, the
  offset shrinks by at most 60% of their forward speed each tick. The player slows down for a
  moment instead of sliding backwards. This matters when the server trims a long input queue
  after a stall (`q.length > 12`), which drops up to 12 ticks of running.
- A snapshot can name objects (up to `S.hi`) that the client's lazily generated course doesn't
  have yet. `cover()` generates up to them before the state is stepped or drawn. The renderer
  only draws objects from `L.objs`, and `L` is always generated at least as far as `S.hi`, so the
  real renderer is safe too.

`window.__runner3d.corr` records the largest correction of your own player (`max` overall, `back`
backwards in z, `viewBack` the most the drawn player moved backwards in one frame while forward
was held) and the other player's drawn motion (`remoteStep`, the largest move between two frames,
and `remoteBack`, the most it moved backwards in one frame while running forward).

PERF_ONLINE

## 6. Files and the hooks in the shell files

| File | What |
| --- | --- |
| `shared/runner3d.js` | The sim: course generator, obstacles, `stepRunner3d`, `objPose`. Runs in the browser and on the server. The CONTRACT header is the interface for the renderer and the app. |
| `tools/runner3d-bot.js` | Search bot over the real sim. `node tools/runner3d-bot.js 1,2,3 1700` runs it down whole courses. |
| `tools/check-runner3d.js` | The fairness checker (section 4). |
| `public/js/runner3d-app.js` | `Runner3DMode`: local loop, online prediction, DOM HUD (tips, held note), sounds, touch pad, pause and results. |
| `public/js/runner3d-debug.js` | A 2D-canvas debug view with the renderer's API (`?r3ddebug=1`, or when WebGL fails). |
| `public/js/r3d/renderer.js` | `Runner3DRenderer`, the entry the app imports: cameras, streaming of object views, blob shadows, death effects, lead veil, bloom, auto quality, shader warm-up. |
| `public/js/r3d/views.js` | One view per object kind: `VIEWS[kind] = { make, update }`. |
| `public/js/r3d/kit.js` | Sim-to-three mapping (`toV`: z is negated, only here), palette, shared uniforms, textures, `patchWorld` (dusk, creeping shadow, glow, rim, dissolve), slabs, chains, `GlowField`. |
| `public/js/r3d/characters.js` | Sol and Luna, procedural, with their animation and death effects. |
| `public/js/r3d/world.js` | Sky, abyss, mist, motes, pillars, arches, lanterns, distant silhouettes. |
| `public/js/r3d/zone.js` | The dusk wall, tendrils, floor glow, vignette, and the lead-cap veil. |
| `public/js/r3d/fx.js` | Particles. |
| `public/js/r3d/boxes.js` | Debug overlay of the sim's collision shapes (`?boxes=1`). |
| `public/r3d-demo.html` | The renderer on its own, with bots (section 9). |
| `tools/runner3d-browser.js`, `tools/r3d-shots.js`, `tools/r3d-perf.js`, `tools/r3d-eval.js`, `tools/r3d-glprobe.js` | Browser checks and look and speed tools (section 9). |

Hooks in the shared shell files. Each is a few lines next to the matching 2D runner hook.

- `public/index.html:18` `<canvas id="game3d">`; `:34` the title button `btnRunner3d`; `:66` the
  "How to play" line; `:101` the lobby button `lobbyRunner3d`; `:184-211` the `#r3Pause` and
  `#r3Results` cards.
- `public/js/main.js:12` import; `:49` and `:64` create `Runner3DMode`; `:268` hands it the frame
  loop while active; `:413` stops it in `quitToMenu`; `:434` routes `start{mode:'runner3d'}` to it.
- `public/js/input.js:5-6` the `SOL_3D` and `LUNA_3D` key maps; `:17` `preventDefault` for the
  extra keys only while `mode3d` is on and never in a text field; `:24` the `mode3d` and `touch3`
  fields; `:52-60` `pad3()`, `local3d()`, `any3d()`.
- `server/index.js:11` import; `:115` `Room.startRunner3d()`; `:123`, `:125`, `:142`, `:221` the
  `runner3d` branches in `restartGame()`, `startMsg()`, `tick()` and the `start` message; `:170`
  the input mask `& 31` (bit 16 is "back"; the co-op sim and the 2D runner read only bits 1, 2
  and 4, and Dodgeball reads 8).
- `public/style.css:145-195` one block for the canvas, HUD, tips, held note and touch pad.

## 7. Rendering

Three.js r170, vendored in `public/vendor/three/`. The mode draws to `#game3d`, which fills the
stage while the mode is active; `body.r3d` hides the 2D canvas. On the first match the app imports
`/js/r3d/renderer.js` (it starts that download earlier when the lobby fills or the Runner 3D button
is hovered). If the import or the WebGL constructor fails, or the page was opened with
`?r3ddebug=1`, the debug view draws instead. A renderer that throws while drawing is replaced by
the debug view, and the error is kept in `renderErrors`.

`draw(L, S, view, time, { split, me, paused })` gets `split: true` locally (Sol left, Luna right)
and `split: false, me` online. Everything drawn comes from `L`, `S` and changes between frames, so
it stays right under rollback. Moving parts are posed with `objPose(L, S, i, S.tick - 1 + alpha)`,
the same fractional tick as the interpolated players.

### Art against collision

`/r3d-demo.html?boxes=1` draws the sim's own shapes as lines over the art: floors green, moving
platforms cyan, ember halves orange (grey while not solid), eclipse stones gold or blue, hazards
red, pools as the hostile area at the depth where they kill, and both players' boxes. Every shape
already has the sim's insets applied, so the player's box touching a red line means death. I
checked every kind this way at an easy and a hard instance, and the moving ones at several ticks.

| Kind | Before | Now |
| --- | --- | --- |
| Gaps, steps, beams, stones | Matched | Matched (slab edges are the sim's edges) |
| Thorns | Matched | Matched (thorn field fills the box, tips at `th`) |
| Pools | Matched | Matched; plus a per-player danger rim |
| Chain slab (tilt) | Matched (exact shear of the sim's plane) | Matched |
| Ember slabs | Halves matched, but a re-forming half looked solid while it held nobody | Re-forming halves are a see-through outline until they are solid |
| Eclipse stones | Matched (solid for its own player's camera, ghost for the other) | Matched |
| Thorn sweeper | Thorns reached 0.56 from the arm's line and 0.8 high; the sim's arm is 0.15 and 0.55 high | Beam and thorns stay within 0.15 and below the bar |
| Pendulum | A crescent: the top half of the deadly disc was empty | A full disc blade, radius `rb - 0.06`, 0.28 thick at the hub |
| Orbiting stones | Matched | Matched |
| Thorn curtain | Loose floating crystals | A bramble wall from `x0` to the opening's edge (`gw + 0.06`), thorns inside the 0.4 deep deadly slab |
| Rolling orbs | Drawn at a quarter of their size at both ends of the lane while deadly at full size | Always full size; they come out of an archway and drop into a socket |

### Rendering notes

- Quality: `setQuality('auto' | 'high' | 'low')`, default auto. High has bloom through
  `EffectComposer` and pixel ratio up to 1.5; low draws straight to the screen at pixel ratio 1.
  Auto steps down to low when the median frame over 3 s is longer than 24 ms.
- The first `reset()` builds one view of every kind on a throwaway course and compiles their
  shaders, so the first curtain or orb of a match does not stall a frame.
- Per-frame updates reuse scratch vectors and matrices (no garbage every frame).
- A NaN from a shader spreads over the whole frame through bloom. Every `pow()` in a shader takes
  a clamped value.
- Thorn curtains a camera's player has passed are hidden for that camera, so they never stand
  between the camera and the player.
- The glow sprite texture is opaque grey on black. A transparent canvas uploads its near-zero
  alpha pixels as white, which showed the sprite's square edge.
- Luna's hood has a dark lining on its inside face. Her own light used to make it read pale from
  the front.

### Adding a view for a new kind

1. Read its `KIND_DOC` line and `objPose` case in `shared/runner3d.js`.
2. Add `VIEWS.<kind>` in `views.js`. Build at rest in `make` (sim to three: `x, y, -z`), move it in
   `update` from `pose`. Put every geometry, InstancedMesh and per-view material in
   `userData.geos / insts / mats` so `disposeView` frees it.
3. Add its collision shape to `boxes.js` and compare with `?boxes=1`.
4. If players can stand on it, add a case to `groundAt` in `renderer.js` (blob shadows).
5. If it brings a new cause of death (`WHY3`), add a branch in `onDeath` and in `Character.update`.
6. Add a tip in `TIPS` in `runner3d-app.js`.

PERF_SECTION

## 8. Readability cues

- **Which pools kill you.** Each player's camera shows a pulsing pink rim around the pools that
  kill that player (camera layers: sun pools on Luna's camera, moon pools on Sol's, shade on both).
  The first pools section also shows a tip.
- **Which eclipse stones are yours.** Your own stones are solid stone in your colour; the other
  player's are see-through ghosts on your camera. The first eclipse section shows a tip in each
  player's own words.
- **Ember slabs about to fall.** A whole half glows softly. Once stood on it shakes harder and
  harder, its cracks flare and sparks rise; a crack sound plays for your own player. A fallen half
  drops and fades; a re-forming half is a see-through outline until it is solid again.
- **The dusk.** A wavering shadow creeps over the floor ahead of the wall (4 units plus 40 times
  the zone speed per tick, so about 6 to 8.6 units), with a faint ember line at its front. It
  enters the frame before the wall does. The screen vignette closes in from 12 units, the HUD
  meter and edge glow turn red from 8, and a tick sound quickens as the dusk nears your player.
- **The lead cap.** A shimmering violet veil rises across the run-up just past where the cap
  stops a player, fading in from 3 units before it and brightening while they are held. The
  player's HUD box shows "held by the twilight", a click plays, and the first time it happens a
  tip explains it.
- **First-time tips.** Each player gets one line the first time each obstacle kind comes up,
  shown 9 units before its run-up in that player's half of the screen (bottom, clear of the
  action) for 4 s.
- **Causes of loss.** The results card shows each player's cause from `WHY3`. Each cause has its
  own death effect: thorns, thorn arm and curtain burst into pink shards; a blade knocks the
  player spinning; an orb flattens them; a pool sinks them with a splash in its colour; the dusk
  darkens and swallows them; a fall dissolves them.

## 9. How to run each tool

```bash
PORT=3470 node server/index.js &                     # LAG_MS=80 to test prediction
PORT=3470 node tools/runner3d-browser.js             # local, online, other modes, WebGL pass, screenshots
JOBS=8 node tools/check-runner3d.js                  # fairness proof (about 2 minutes); QUICK=1 for 4 seeds
NOSERVER=1 PORT=3470 node tools/r3d-shots.js [names] # renderer screenshots (docs/img/runner3d/render-*.png)
PORT=3470 node tools/r3d-perf.js                     # frame times; SECS, SIZES, ZS, VIEWS, Q
PORT=3470 node tools/r3d-eval.js "seed=7&kind=gate" "__r3d.S.tick"   # run expressions in the demo
node tools/r3d-glprobe.js                            # which WebGL renderer each set of Chromium flags gets
```

- **Browser test.** `ONLY=local|online|webgl`, `RENDER=debug|webgl|both`, `OUT`, `GL_FLAGS`
  (default `--enable-gpu`), `MAX_VIEW_BACK`, `MAX_REMOTE_STEP`. The play checks run on the debug
  view so they pass without a GPU. The WebGL pass then plays a local split-screen match and an
  online match in real time with the real renderer when it gets a GPU, and fast-forwards on
  software GL.
- **Demo.** `/r3d-demo.html?seed=7&split=1`. Bots run both players; arrows and Enter, or WASD and
  Space, take one over. Parameters: `seed`, `split=1`, `me=1`, `z=`, `kind=` (a section kind such
  as `gate`, or an object kind such as `orb`) with `after=Z` for a later, harder one, `q=high|low`,
  `count=1`, `bot=0`, `hud=0`, `auto=0`, `cam=dx,dy,dz[,ahead[,side]]`, `boxes=1`, `perf=1`.
  `__r3d.aim(__r3d.obj('gate'), [0, 2, -6], [0, 1.8, 0])` fixes the cameras on an object.
- **Shots.** Names are substrings: `kind-` (easy instance of every kind), `hard-` (past z 900),
  `death-` (one per cause), `split`, `chars`. `ADHOC='[["name", "query", steps, "setup"]]'` adds
  your own.
- **Headless GPU.** Plain `--enable-gpu` gives headless Chromium the real GPU here (AMD Radeon 780M
  through ANGLE on OpenGL ES). Without flags it uses SwiftShader. `--use-angle=vulkan
  --enable-features=Vulkan` and `--use-gl=angle --use-angle=gl-egl` also reach the GPU.

## 10. Known issues

KNOWN

## 11. Work log

WORKLOG
