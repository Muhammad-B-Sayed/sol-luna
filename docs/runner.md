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
| `public/js/runner-app.js` | Local loop, online prediction and reconciliation, HUD, results and pause screens. |
| `public/js/runner-render.js` | Scrolling renderer: cached stone pages, parallax back wall, obstacles, the dusk edge. |
| `tools/runner-bot.js` | Search bot over the real runner sim (macro actions, best-first). |
| `tools/check-runner.js` | The fairness checker (below). |
| `tools/runner-browser.js` | Real-browser check of local play and an online room, with screenshots. |

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

Scroll speed depends on distance scrolled (players run at 3.25 px/tick = 8.1 tiles/s):

| Time | Distance | Scroll | Difficulty |
| --- | --- | --- | --- |
| 0:00 | 0 tiles | 1.00 px/tick (2.5 tiles/s) | 0.00 |
| 0:30 | 87 | 1.32 | 0.08 |
| 1:00 | 198 | 1.62 | 0.18 |
| 1:30 | 330 | 1.91 | 0.30 |
| 2:00 | 481 | 2.10 | 0.44 |
| 2:30 | 645 | 2.29 | 0.59 |
| 3:00 | 823 | 2.43 | 0.75 |
| 4:00 | 1204 | 2.63 | 1.00 |
| 5:00+ | 1600+ | 2.75 (85% of run speed, the cap) | 1.00 |

Difficulty (0 to 1 over the first 1100 tiles) sets the safety margin kept below the measured jump
limits: 4 tiles at the start, 1 tile at full difficulty, never less. It also lengthens features
(more gaps, slabs, stones and shards per chunk), allows bigger height changes, shortens run-ups,
shortens shard warnings and slab crack time, and widens lantern swings.

Obstacles are introduced one at a time, each first appearing as an easy "intro" instance:
gaps and steps (start), thorns (30 tiles), shade pool (60), twin pools (90), chain plank (120),
ember slabs (170), eclipse stones (220), star well (280), swinging lantern (340), falling
shards (400). After that each chunk is a weighted random pick (never the same kind twice in a row).

## Obstacles and the four fairness rules

Rules: (1) every jump possible, (2) arriving second never makes it impossible, (3) moving parts
return to rest and can't be wedged, (4) both characters face equal difficulty.

| Obstacle | What it is | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Pits, steps | Gaps and height changes | Gap ≤ measured limit for that rise minus the margin | Stateless | Stateless | Same for both |
| Thorns | Crystal spikes on the floor, deadly to both | ≤ 4 wide, landing islands 5-7 tiles so a running player can land and jump again | Stateless | Stateless | Same for both |
| Shade pool | Deadly to both | Width ≤ gap limit | Stateless | Stateless | Same for both |
| Twin pools | A sun pool and a moon pool of the same width | Width ≤ gap limit | Stateless | Stateless | Each wades one and jumps the other |
| Chain plank | Beam on a chain at its middle; tilts toward the weight on it | Short gaps on and off; the far end at full tilt is still well within the jump limit | Checked with the other player parked on the near end, the middle and the far end | Damped spring back to level (about 100 ticks); motion is never blocked, so nothing can wedge it | Same for both |
| Ember slabs (new) | Floating stones that crack under a standing player, fall, and re-form | Gaps sized by the margin | The slab is back within about 1.4 s; checked for second arrivals | Fixed timers; re-forms as soon as no one is inside its space | Same for both |
| Eclipse stones (new) | Alternating sun and moon stones over a pit; you stand only on your colour | Every jump ≤ gap limit | Stateless | Stateless | Mirrored layout: both get the same set of jumps, in reverse order |
| Star well (new) | Updraft up the face of a cliff too tall to climb | The lift always carries you over the top | Stateless | Stateless | Same for both |
| Swinging lantern (new) | Platform on a long chain swinging on a fixed clock | Gaps sized for both the nearest and the farthest point of the swing | Players don't move it | Driven by the clock only | Same for both |
| Falling shards (new) | Crystals in a low gallery; a shard shakes and glows on the floor below, then drops, shatters and regrows | A full-speed runner passes under before it lands | A shard someone else triggered is falling or gone when you get there | Fixed timers | Neutral (deadly to both) |

## Checks

```bash
node tools/check-runner.js                        # 50 seeds, course to 1700 tiles (~20 min, JOBS=3)
SEED=7 V=1 TILES=600 node tools/check-runner.js   # one seed, every chunk printed
PORT=3217 node server/index.js &                  # then:
PORT=3217 OUT=docs/img/runner node tools/runner-browser.js
```

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
4. **Parked partner**: the other character stands on each plank's near end, middle and far end.
5. **Back to rest**: after every run and after random abuse (hopping, standing on ends, falling
   off), every plank, slab and shard must be back at rest within a bound.
6. **Equal difficulty**: average clear time per kind for Sol and for Luna.
