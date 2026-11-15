# Level redesign plan (Nov 2026)

All 32 levels are being rebuilt from nothing. This file is the brief for whoever builds them.

## Why

The owner rejected the old levels. His words: the level design is "atrocious", levels have
"almost no verticality", they "barely change", there is "no creativity", and the difficulty
steps are "abysmally small". He is right, and the numbers say so:

- 28 of the 32 old levels were 80% or more empty air. Level 1 used only the bottom row.
- Levels 1 to 13 all had two controls. Par time crept from 30 s to 45 s over those 13 levels.
- The bot finished the old level 31 in 21 seconds.
- Even the old finale was three flat corridors stacked on top of each other.

The earlier pass proved that no level can be finished alone. That rule stays. But a flat
corridor that needs two people is still a flat corridor.

**The standard now:** in this genre the whole screen is the puzzle. A room is a folded maze
that fills the 38x28 screen. You climb through stacked, broken-up floors. You can see the
doors long before you can reach them. A plate on one floor moves a lift two floors away.
Every room has its own shape and its own idea, and each one asks more than the one before.

Look at `docs/img/level-1.jpg` (the new level 1, the pilot) and at the reference frames named
in the briefs below. Those show the density to aim for. Compare with any old screenshot in
`git show HEAD:docs/img/level-4.jpg` to see what we are leaving behind.

## Originality

This is an original game in a known genre. Use the reference frames to learn how dense a room
should be and what kind of idea drives it. Design every layout yourself. Do not trace or
rebuild a room from the reference game, and do not copy its names or art. A few briefs are
marked "homage": they borrow the idea of a famous kind of room, with a layout of our own.

## How to build a level

```bash
python3 tools/levelgen.py --show 7     # rebuild shared/levels.js and print level 7 with rulers
V=1 node tools/coop-bot.js 7           # play it with the bot, printing every phase
FAST=1 node tools/gate.js 7            # the gate without the slow solo check
node tools/gate.js 7                   # the full gate. A level is done when this says PASS
```

- Levels: `tools/acts/act*.py`, one file per builder (see "Who builds what"). Register
  each with `@level(n)`. The DSL is `tools/lvdsl.py`; read it first. Level 1 in `act1.py` is
  the worked example.
- Bot scripts: `tools/acts/actN.bot.js`, one function per level. Read the top of
  `tools/botlib.js`. You mostly say what each player should do next (`grab`, `press`, `flip`,
  `goto`, `pushTo`, `door`) and the bot searches for the inputs with the real physics. Level
  1's script is twelve lines.
- Edit only your own act's two files. `lvdsl.py`, `botlib.js`, `gate.js`, `levelgen.py`,
  `shared/sim.js` and the renderer are shared with two other people working at the same
  time. If you need a helper, define it in your own act file. If you think a shared file has
  a bug, work around it and say so in your report.
- Do not run git commands that change anything, and do not commit. Do not start the game
  server, Chrome or `tools/capture.sh`. The planner takes the pictures afterwards.
- This machine has 8 GB of RAM and three of you share it. Run one node process at a time.
  Never run `tools/check-all.sh`. The solo check on a crate level can take 800 MB, so run
  the full gate on crate levels one at a time, and use `FAST=1` while iterating.

### What the gate checks

| Group | Check |
| --- | --- |
| LAYOUT | Stone fills 25-65% of the screen. No empty block over 80 cells. Enough distinct floor heights (6 to 8, by tier) spanning 20+ rows. No flat stone floor longer than 18 cells. At most one floor that runs nearly the full width. 21+ of 24 screen sectors have floor. |
| ROUTE | In the bot's winning run the players visit 21-23 of the 24 screen sectors between them, and each player visits 12-16 alone. |
| DEPTH | Bot time, number of plate presses and lever flips, number of controls and gems all meet the tier's minimum. Par is set from the bot's time. |
| CO-OP | The bot wins and collects every gem. Neither player can reach their door alone. |

Tiers are four levels each. Minimum bot time by tier: 30, 38, 45, 52, 60, 68, 76, 85 s.
Minimum control uses: 4, 6, 8, 10, 12, 14, 17, 20. Gems: 4-8, 4-8, 6-10, 6-10, 6-10, 8-12,
8-12, 8-12, split evenly between sun and moon. The exact table is at the top of
`tools/gate.js`.

**Never pad a room with gems or empty walking to reach a number.** Round one of this build
set the time floors too high, and rooms came back with 18 to 31 gems. The floors are now
low and the gem cap is enforced. The bot is fast: it clears a dense room's whole chain in
25 to 40 seconds. Depth comes from the chain (more cooperative steps, role swaps, objects
with a second job), which the control-use count measures better than the clock.

**The gate is the floor, not the goal.** A room can pass every check and still be dull. The
gate cannot see whether a room has an idea, whether it looks different from its neighbours,
or whether it is fair. Those are your job, and the planner will review each map for them.

## What makes a room good

1. **Write the solution first.** One sentence per step: who goes where, what that changes,
   what it opens for the other player. Then build terrain that makes each sentence true and
   every shortcut false. Put that chain in the level function's docstring.
2. **Each player changes what the other can do next.** "Both walk right" is not a puzzle.
   Good shapes: temporary help then permanent rescue, operator and runner, split and
   reunite, swap roles halfway, replace the helper with a crate, reuse a crate (step first,
   weight later), revisit a place that a lever has changed.
3. **Design the helper's way out.** Whoever holds a plate must be freed by something the
   other player does: a lever, a crate, a second route.
4. **Give each floor a job, and make floors talk to each other.** The control and the thing
   it moves should usually be on different floors, both visible.
5. **Give the room a silhouette.** Each brief names a shape. Build that shape, with chunky
   irregular stone: split-height floors, ramps, ledges, pockets, pillars, shafts. Level 1
   is a zigzag of five floors. No other level may reuse that skeleton.
6. **Vary where things start and end.** Doors at the top, in the middle, at the bottom, far
   apart, side by side. Players starting together, apart, on different floors.
7. **Gems pull players into corners.** Put them on detours and in pockets, never on the
   main path. A few should need a small trick.
8. **Ramp difficulty on purpose.** Longer chains, more role swaps, objects that must be
   planned, routes that commit you, tighter movement. Raise one or two of these per level,
   not all at once. Follow a thinking room with a moving room.
9. **Be fair.** Dying restarts the whole level, so long rooms should keep deadly jumps few
   and near the start, or give a safe floor under them. Avoid states that cannot be
   recovered. Where one is unavoidable it must be obvious, not a trap.
10. **Hints teach, they don't solve.** One or two short sentences.

## Rules of this engine (measured)

Movement, with the current physics. Do not change physics.

| Move | Limit |
| --- | --- |
| Jump height | 3.2 tiles. Design climbs of 2. A 3-tile climb only with nothing overhead. |
| Gap at the same height | 6 tiles at most. Design 1 to 3. |
| Gap landing 2 higher | 5 at most. Design 1 to 2. |
| Gap landing 2+ lower | 7 at most. |
| Headroom | At least 2 free cells to walk. A jump needs free cells above the take-off too. |
| Step-up without jumping | 14 px, so only pool rims and ramp tops. A 1-tile step needs a jump. |
| Run speed | 8 tiles per second. Platforms move 4 tiles per second. |

Things that bite:

- **A ceiling over the take-off kills the jump.** Standing on a floor with only 3 free rows
  above, you cannot climb 2. Open the ceiling above the take-off cell as well as above the
  landing. Level 1 hit this.
- **Levers work by walking through them.** Walking right through a lever turns it on.
  Walking left turns it off. Place levers where the route passes them once, to the right,
  or at a dead end on the left (arrive going left, leave going right). A lever needs open
  floor on both sides. A lever that players re-cross the wrong way undoes itself, which is a
  bug unless it is the puzzle. `L.lever(x, y, g, on=True)` starts a lever on.
- **Plates work while a player or crate stands on them.** A group is active if any of its
  plates is pressed or any of its levers is on. That OR is useful: hold a plate, then make
  it permanent with a lever in the same group.
- **Pools.** Sun kills Luna, moon kills Sol, shade kills both. A pool is a floor tile sunk
  10 px. To make a route for one character only, put a pool 3+ wide under a ceiling with
  exactly 2 free rows: nobody can jump it. In the open a pool must be 8+ wide to stop a
  jump. Plates must sit on stone, not on a pool.
- **Gates.** `L.gate(x, y0, y1, ch, g, slot_top)` builds a gate that rises into a pillar.
  The slot needs as many cells as the gate is tall. In a 4-high corridor, build a wall with
  a 2-high doorway and put a 2-high gate in it. A closing gate takes 0.25 s per tile and
  players are fast, so a held plate should be far from its gate, or the puzzle leaks.
- **Platforms.** Drawn cells (`= - _ + ~ :` for groups 0-5) move by `mv(g, dx, dy)`.
  `L.plat(x, y, w, h, dx, dy, g, inv)` adds one explicitly, so one group can move several
  things, in opposite senses with `inv`. A platform that would crush something stops.
  Riders can't drive: a lift moved by a plate that is not on the lift needs the partner.
  Lifts that fill a hole in a floor should be 3 wide. Keep lift stops 5+ tiles apart or a
  sinking lift becomes a step.
- **Crates** are 26 px, fall, and can be pushed (not pulled) by either player. They press
  plates, work as a 1-tile step, sit in pools as stepping stones, ride lifts and ferries,
  and can be pushed off ledges. They cannot climb anything, even 1 px, and **must never
  touch a ramp** (they fall through it). A crate against a wall is stuck there for good.
  A 2-wide, 1-deep socket with the plate at the bottom keeps a crate on its plate.
- **Six groups** (0-5), colours purple, green, orange, white, pink, yellow. Players match
  controls to effects by colour, so do not reuse one group for unrelated things.
- **Bot search phases** move one player while the other stands still. That is how most
  co-op steps work anyway (one holds, one moves). For moves that need both at once, use the
  hand phases. A failed search prints how close it got, which usually points at the broken
  jump. Searches are cached, so re-running a script is instant until the level changes.

## The campaign

Four chapters of eight. The level-select screen shows them as four rows.

| Chapter | Levels | What it is about |
| --- | --- | --- |
| I. Dawn | 1-8 | The basics, one at a time, in full rooms: pools, plates, levers, shade, lifts, bridges, crates, ferries. |
| II. Noon | 9-16 | Machines. One control moves several things. Crates as tools. The helper's way out. |
| III. Dusk | 17-24 | Harder movement, timing, two crates, operator rooms, mirrored rooms. |
| IV. Midnight | 25-32 | Long rooms with planning. Objects with two jobs. States that must be set in order. |

"Beats" below is the rough number of cooperative steps in the intended solution. It should
rise steadily. The names and ideas are fixed unless a brief proves unbuildable; if you
change one, keep the room's shape and its place on the difficulty curve, and say why.

### Chapter I. Dawn

1. **First Light.** Built (pilot). Zigzag of five split-height floors, doors top left. Pools,
   plate then lever, twice with roles swapped. 4 beats.
2. **Parting Ways.** Shape: a thick central wall splits the room into two towers. Sol climbs
   the left, Luna the right, and they can see each other through windows. Each side has the
   lever or plate that opens the other side's next floor. They meet at the top over the
   wall, doors side by side on a roof in the middle. Teaches: you help someone you cannot
   reach. 5 beats.
3. **Shade Well.** Shape: a descent. Both start at the top centre and drop down a well in
   the middle of the screen, landing on ledges left and right. Doors are in the two bottom
   corners. Introduces shade pools at the bottom of the well and on the ledges (jump them).
   Drops are one-way, so who drops where matters. 5 beats.
4. **The Lift.** Shape: a tall lift shaft up the middle with landings on alternating sides,
   like a spine with ribs. Introduces lifts and "riders can't drive". The plate for each
   ride is on the landing below. Start at the bottom, doors on the top two ribs, one each
   side. 6 beats.
5. **The Long Way Round.** Shape: a ring. A solid core sits in the middle of the screen with
   the two doors in a chamber inside it. Sol must go clockwise around the ring and Luna
   counter-clockwise, because of whose pools lie which way. They cross at the top and at the
   bottom. Introduces bridges that rise out of pools. 6 beats.
6. **Crate Cellar.** Shape: a cascade of ledges falling from top left to bottom right, then a
   chimney back up. Introduces the crate: push it off ledges to bring it down, use it as a
   step, then leave it on a plate. Start top left, doors top right. 6 beats.
7. **Twin Towers.** Shape: two towers with a chasm between them and a shade pool at the
   bottom of it. Introduces the ferry, a platform that moves sideways across the chasm at
   mid height, and a second one higher up. Players start in different towers and must end
   in the other one. 7 beats.
8. **Dawn Gate.** Chapter exam. Shape: an S through five or six floors, bottom left to top
   right, with a vault near the middle. Uses a pool route, a held plate made permanent, a
   lift, a crate on a plate and a bridge, each once. 8 beats.

### Chapter II. Noon

9. **Counterweights.** Homage (see `06-40-coupled-platforms-before.jpg` and `07-00-...-after.jpg`).
   Shape: twin shafts side by side with landings between them. One control moves two lifts
   in opposite directions (`inv`). The players pump each other upward, taking turns to stand
   on the plates. Later a crate must be left on a lift as the weight. 8 beats.
10. **Stone Raft.** Shape: a wide shade lake across the middle band with an island in it, and
    galleries above and below. A crate pushed into the lake is a stepping stone. A second
    stretch needs the crate carried over on a ferry. 8 beats.
11. **Helper's Way Out.** Shape: a west wing of sun channels, an east wing of moon channels
    and a three-floor hub between. Twice over, one player holds a plate so the other can
    reach a lever that frees the holder, with roles swapped the second time. Doors at the
    top of the hub. 9 beats.
12. **The Drop.** Homage to object-routing rooms (see `05-22-ball-routing-before.jpg` to
    `05-40-...-after.jpg`). Shape: a U. Start top left, doors top right, and the only way is
    down, across the cellar and up. Crates are dropped down chutes onto plates they can
    never be taken off. Which chute matters. 8 beats.
13. **Switchback.** Shape: a figure of eight, two loops that share a crossing in the centre.
    The idea is the lever itself: walking back through one switches it off. The players must
    choose which way round each loop to walk, and who walks it, so that the right levers are
    on at the end. Mark it clearly; the hint should say how levers work. 8 beats.
14. **Carry the Weight.** Shape: a diagonal climb from bottom left to top right, with the
    crate carried the whole way: up a lift, through a gate held by the partner, across a gap,
    into a socket that holds the last bridge open. The crate is the only way both can leave.
    9 beats.
15. **Clockwork.** Homage to control rooms (see `28-08-control-room-before.jpg`,
    `28-35-...-mid.jpg`, `29-00-...-finished.jpg`). Shape: a control room in the centre of
    the screen with three levers, and a ring of corridors around it. One player operates,
    the other runs the ring while it changes. Halfway the runner frees the operator and
    they swap. 10 beats.
16. **High Noon.** Chapter exam. Shape: a cross. Four arms meet at a central hub; the
    players start in the hub and the doors are at the ends of the top arm's two branches.
    Each arm holds one machine from this chapter. Arms must be done in an order the players
    work out. 11 beats.

### Chapter III. Dusk

17. **Shade Garden.** A moving room after a thinking chapter. Shape: two routes that weave
    over and under each other like a braid across five floors, with shade pools under most
    of it. Each player's levers raise stepping stones on the other's route. Tighter jumps
    than before, but every deadly stretch has a safe ledge before and after. 8 beats.
18. **Closing Time.** Shape: a 3x3 honeycomb of cells with a doorway in each wall. Controls
    open one doorway and close another (`inv`). Players leapfrog through the cells on
    different diagonals, and twice someone must run under a closing gate. 10 beats.
19. **Crate Relay.** Shape: two wings and a central chasm. Two crates, two sockets. Neither
    player can carry a crate all the way: it must be handed over, on a ferry and by a
    platform that shoves it across. 10 beats.
20. **Undertow.** Shape: an interleaved maze of low pool tunnels. Sol's sun tunnels and
    Luna's moon tunnels cross at shared junction chambers. Start in opposite corners, doors
    in the centre. Each junction needs the other player to have done something in their own
    tunnels first. 10 beats.
21. **Pendulum.** The one open room. Shape: a tall atrium filled with ferries at three
    heights, each driven by a lever somewhere on the walls. Players set ferries for each
    other and step from one to the next to climb. Shade pool floor, but ledges catch most
    falls. 10 beats.
22. **The Operator.** Shape: an upper control deck and a folded runner's course below it,
    with an outer gallery down the right side. One lever swaps two bridges, one moves a
    lift, a plate opens the operator's escape, and a rescue lever frees the runner. Then the
    same course again with the roles swapped and one thing different. 11 beats.
23. **Eclipse.** Shape: a butterfly, the left half a mirror of the right. What each player
    does on their side changes the other side. Halfway they cross over through the middle
    and finish on each other's side, where the mirror is no longer exact: one side now
    needs the crate. 11 beats.
24. **Dusk Gate.** Chapter exam. Shape: a spiral that winds inward from the outer wall to a
    door chamber in the centre. Uses an inverted pair, a timed gate, a crate handover and an
    operator stretch. 12 beats.

### Chapter IV. Midnight

25. **Two Keys.** Shape: a tower over a basement. Two crates and four places that want one.
    One crate must be a step first and a weight later, and the order is the puzzle. 12 beats.
26. **Tidelock.** Shape: four quadrants around a cross-shaped control room. Two levers give
    four states, and each state extends a different pair of bridges. Both players must get
    through all four quadrants, so the levers must be set in an order, with someone at the
    controls each time. 13 beats.
27. **Leapfrog Spire.** Shape: a helix around a central column, the tallest climb in the
    game, bottom to top and back down the inside of the column to doors at its foot. Every
    lift's plate is on the landing before it, and a crate has to come along to hold the last
    one. 13 beats.
28. **The Vault.** Shape: a vault in the centre with three locks, and a different small room
    in three corners; the fourth corner is the start. Each corner room sets one lock for
    good. Two of the rooms need both players, one can be done while the other is busy, and
    the vault needs both crates. 13 beats.
29. **Sunken Halls.** Shape: a descent through flooded halls, start at the top and doors at
    the bottom. Every drop commits you. Crates go down chutes. Twice a player who dropped
    too early must be brought back up by a rescue lift. 14 beats.
30. **Twilight Spiral.** Shape: a double spiral. Sol winds inward clockwise and Luna
    counter-clockwise, and the two paths cross four times. At each crossing the helper and
    the helped swap, and the last two crossings are timed gates. 15 beats.
31. **Sanctum Approach.** Shape: three stages stacked bottom, middle, top, each a small
    puzzle of its own, joined by one shaft. A lever set in stage one changes stage three, so
    the players must come back down and reset it before the end. Operator and runner swap
    twice, with a crate. 16 beats.
32. **Heart of Twilight.** The finale. Shape: seven or eight floors wrapped around a
    heart-shaped chamber in the centre that holds both doors. Two crates, all six groups,
    every sector of the screen. It ends with both crates in sockets and two levers set on
    opposite sides of the room, after which both players walk into the heart. 18+ beats.

## Who builds what

| Builder | Levels |
| --- | --- |
| Planner | 1 (pilot), tooling, review, pictures, docs |
| Round 1 | A built 2-8 (`act1`), B built 12-15 (`act2`), C built 23 (`act3`) |
| Round 2 | A: 9-11 (`act1`), 16-17 (`act4`). B: 18-22 (`act2`). C: 24-27 (`act3`). Each also trims gems on their file's round-1 rooms. |
| Round 3 | A: 11 fix, 16, 17, 28 (`act1`, `act4`). B: 22 rebuilt, 29-31 (`act2`, `act5`). C: 26, 27 (`act3`), 32 (`act6`). |

## Status (Nov 14, 2026)

All 32 levels are built and pass the full gate, including the solo check. Pictures are in
`docs/img/level-N.jpg`.

Known follow-ups:

- **Curve bump in chapter II.** Levels 12-15 were built in round 1 against the old high time
  floors and run 72-92 s, longer than 16-22 (54-74 s). Eclipse (23) at 112 s is the same
  leftover. Trim them toward 60-70 s with real cuts, not by stretching their neighbours.
- **Thin margins.** 11, 16, 17, 27, 30 and 32 clear their time floor by 2 s or less. A fresh
  `NOCACHE` bot run could dip under.
- **Unrecoverable mistakes left in on purpose.** Crate B into 28's empty east shaft; falling
  down a crate chute in 27 and 32; dropping out of 26's control room while the runner is shut
  in a basin; dropping in 29 before the hall above is done.

## What to hand back

For every level: the gate result, the bot's time, one sentence on the room's shape and one
on its idea, anything you changed from the brief and why, and any weakness you know about
(a jump that is tighter than you'd like, a state that can't be recovered, a search that hit
its limit). Say plainly which levels pass the full gate and which don't. A level that fails
honestly is more useful than one reported as done.
