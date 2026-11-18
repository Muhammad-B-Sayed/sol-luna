# Level redesign plan (Nov 2026)

All 32 levels are being rebuilt from nothing. This file is the brief for whoever builds them.

## Why

The owner rejected the old levels. In their words, the level design is "atrocious", levels
have "almost no verticality", they "barely change", there is "no creativity", and the
difficulty steps are "abysmally small". The numbers agree:

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

Look at `docs/img/level-1.jpg` (level 1, the pilot) and at the reference frames named
in the briefs below. Those show the density to aim for. The pictures in `docs/img` were taken
before the Nov 17 re-spacing, so their layouts are out of date. Compare with any old screenshot in
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
- The machine is shared. Run at most two gate processes at once, and never run
  `tools/check-all.sh` (it is stale anyway). The solo check on a crate level can take 800 MB,
  so run the full gate on crate levels one at a time, and use `FAST=1` while iterating.
- Each bot search stops after 90 s of wall-clock time. On a loaded machine a gate can fail with
  "gave up after the time limit". Re-run that level alone before changing anything.

### What the gate checks

| Group | Check |
| --- | --- |
| LAYOUT | Stone fills 25-65% of the screen. No empty block over 120 cells (floors 7 rows apart leave 6-high spaces). Enough distinct floor heights (6 to 8, by tier) spanning 20+ rows. No flat stone floor longer than 18 cells. At most one floor that runs nearly the full width. 21+ of 24 screen sectors have floor. |
| ROUTE | In the bot's winning run the players visit 21-23 of the 24 screen sectors between them, and each player visits 12-16 alone. |
| DEPTH | Bot time, number of plate presses and lever flips, number of controls and gems all meet the tier's minimum. Par is set from the bot's time. |
| CO-OP | The bot wins and collects every gem. Neither player can reach their door alone (the solo check; `FAST=1` skips it). |
| ROOF | No climb or crossing on the bot's route hits a roof. `node tools/check-headroom.js <n>` lists the ones that do. |

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
   is a zigzag of four floors. No other level may reuse that skeleton.
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
| Jump height | 4.1 tiles (gravity 0.33, Nov 2026). Design climbs of 2 to 3. A 4-tile climb only with nothing overhead. A climb of 5+ blocks. |
| Gap at the same height | 7 tiles at most. Design 1 to 4. 9+ blocks. |
| Gap landing 2 higher | 6 at most. Design 1 to 3. |
| Gap landing 2+ lower | 8 (2 lower) or 9 (3+ lower) at most. |
| Headroom | At least 2 free cells to walk. **A full jump needs 6 free rows above the take-off and along the arc**; with 5 it hits the roof after 3.6 tiles, with 4 after 2.6. `node tools/check-headroom.js` lists route jumps that hit a roof, and the gate fails any level that has them. |
| Step-up without jumping | 14 px, so only pool rims and ramp tops. A 1-tile step needs a jump. |
| Run speed | 8 tiles per second. Platforms move 4 tiles per second. |

Things that bite:

- **A ceiling over the take-off kills the jump.** Standing on a floor with only 3 free rows
  above, you cannot climb 2. Every climb and crossing on the route needs 6 free rows above it,
  so floors stacked straight on top of each other must be 7 rows apart: four bands on floors
  28, 21, 14 and 7, or two staggered columns on 28/21/14/7 and 25/18/11/4. Open the ceiling
  above the take-off cell as well as above the landing. Level 1 hit this. Rows where nobody
  jumps (walk-only corridors, wading tunnels) can stay 2 or 3 rows high.
- **Slot stones take headroom.** `gate()` builds a 3-wide stone pillar around the gate's slot,
  so it covers the cells on both sides of the gate. Next to a ledge, that pillar is the ledge's roof. Use a
  `floorgate()` there, which sinks into the floor instead.
- **Ramps and pools.** Leave one flat tile between a ramp and a pool.
- **Flush bridges** (a platform that rises 1 tile out of a pool) must sit level with the floor on
  both sides, so players walk across it. A bridge a tile above or below a bank is a step that
  needs a jump.
- **One-way pits.** A pit is one way only if it is 5 rows deep. At 4 rows a player climbs back out.
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
  exactly 2 free rows: nobody can jump it. In the open a pool must be 9+ wide to stop a
  jump (10+ if the far side is lower). Plates must sit on stone, not on a pool.
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
  touch a ramp** (they fall through it). A crate pushed against a stone wall can be
  freed with a corner kick: lean on it for a third of a second, then jump into its upper
  corner, and it slides 28 px clear of the wall. A quick hop or running jump climbs it as
  before, and a crate resting on a plate is never kicked, so sockets still hold. Lifts and
  other crates don't count as walls.
  A 2-wide, 1-deep socket with the plate at the bottom keeps a crate on its plate. In a 2-wide
  socket against a wall, put the plate on the wall side: the crate settles against the wall.
  A crate is 26 px, a step of 1.08 tiles. Stood on it, a player climbs 4 more tiles, so a ledge
  5 above the floor can be reached only from a crate. Levels 28 and 29 use this.
- **Six groups** (0-5), colours purple, green, orange, white, pink, yellow. Players match
  controls to effects by colour, so do not reuse one group for unrelated things.
- **Bot search phases** move one player while the other stands still. That is how most
  co-op steps work anyway (one holds, one moves). For moves that need both at once, use the
  hand phases. A failed search prints how close it got, which usually points at the broken
  jump. Searches are cached, so re-running a script is instant until the level or `PHYS`
  changes. `seek()` finds its cache entry by the goal function's source text, so a helper that
  builds goals from its arguments must pass `{ args: [...] }` (or `{ key }`); otherwise two
  different goals share one entry and the second replays the first's inputs.

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

1. **First Light.** Built (pilot). A zigzag of four floors stacked seven rows apart, the west
   part one row lower than the east, so every floor has two heights. Each floor ends in a
   two-block stair of 3-tile climbs. Doors top right. Sol wades his channel to a plate so Luna
   can pass a gate and set the lever that keeps it open; one floor up the roles swap. 4 beats.
2. **Parting Ways.** Shape: a thick central wall splits the room into two towers. Sol climbs
   the left, Luna the right, and they can see each other through windows. Each side has the
   lever or plate that opens the other side's next floor. They meet at the top over the
   wall, doors side by side on a roof in the middle. Teaches: you help someone you cannot
   reach. 5 beats.
3. **Shade Well.** Shape: a descent. Both start on the roof of a deep well in the middle of the
   screen whose floor is a shade pool. A beam splits the well's mouth into two one-tile slots.
   Doors are in the two bottom corners, Sol's on the left and Luna's on the right. Two upper
   rooms, two lower rooms and the door rooms sit seven rows apart. Every drop is one way, and
   each gate on one side is opened by a plate or lever on the other. 5 beats.
4. **The Lift.** Shape: a lift shaft up the middle (x 17-22) with ribs on alternating sides,
   seven rows apart. Three lifts take turns in the two halves of the shaft, each rising six to
   eight rows. Introduces lifts and "riders can't drive": every lift's plate is somewhere else,
   and each rider opens a gate for the partner from the rib above. Both start at the bottom.
   Sol's door is on rib 2 on the east side, Luna's on rib 3 on the west, where her lever keeps
   the last lift up. 6 beats.
5. **The Long Way Round.** Shape: a ring of corridors around a solid core. The players start in
   a split chamber at the foot of the core, each beside the other's door. The west exit is a
   sun channel and the east exit a moon channel, so Sol goes round clockwise and Luna
   counter-clockwise, up tall stairwell shafts. They cross on the roof and again at the bottom.
   Introduces bridges that rise out of pools while their plate is held. 6 beats.
6. **Crate Cellar.** Shape: a cascade of ledges seven rows apart, falling from top left to bottom
   right, then a chimney lift back up to the doors in the top right. Introduces the crate: it
   rides the cascade down when pushed off each ledge, and it is wider than a one-tile hole, so it
   rolls over holes a player falls through. Sol drops into a sun-pool pocket to hold a gate for
   Luna, and she frees him from the ledge below. The crate ends on a plate against the chimney
   wall, where it holds the door gate open and is the step onto the lift. The hint teaches the
   corner kick. 6 beats.
7. **Twin Towers.** Shape: two towers with a chasm between them and a shade pool at the
   bottom of it. Introduces the ferry, a platform that moves sideways across the chasm at
   mid height, and a second one higher up. Players start in different towers and must end
   in the other one. 7 beats.
8. **Dawn Gate.** Chapter exam. Shape: an S from bottom left to the doors in the top right,
   folded into four bands seven rows apart. The west half is one row higher than the east so the
   crate steps down on its way east, and the top band holds two low galleries joined by one open
   climb. Uses a pool route, a held plate made permanent by a lever, a bridge out of a moon
   channel, a vault opened by a lever, a crate on a lift's plate (it holds the lift up and both
   ride it) and one gate held open for each other from two floors, each once. 8 beats.

### Chapter II. Noon

9. **Counterweights.** Homage (see `06-40-coupled-platforms-before.jpg` and `07-00-...-after.jpg`).
   Shape: twin shafts, west and east, with three low landing decks between them and a full-height
   floor and top gallery. Each colour drives a pair of lifts in opposite directions: purple the
   bottom pair, green the top pair and the bridge over the shade at the top. The players pump
   each other upward; the plates past the east wing's sun channel make Sol the operator in the
   middle. Then a crate pushed onto the top east lift presses a green pad there and holds the
   pair down, which keeps Sol up and the bridge raised. 8 beats.
10. **Stone Raft.** Shape: a deep shade lake across the middle with an island in it. The dock,
    island and shelf are a low deck; the rooms above each shore and the long gallery underneath
    have full headroom. Sol starts at the bottom of a 1-wide, 3-deep well at the west end of the
    dock, so his first jump rises the full height; Luna starts in the room above. The west stretch
    is crossed on a ferry that carries Sol and the crate. The east stretch can be crossed only on
    the crate, pushed off the island's overhanging shelf so it lands in the middle. Then a gallery
    gate, two lift rides and two door gates, each worked for the partner. 8 beats.
11. **Helper's Way Out.** Shape: a three-floor hub between a west wing of sun channels (a shaft on
    the outer wall, climbed by 3- and 4-tile jumps) and an east wing of moon channels. The hub has
    two pits whose floors are lifts. Luna starts shut in a cell and Sol lets her out. Then, twice
    over, one player stands on a pit's plate to hold a wing open, and the runner reaches the lever
    that lifts the pit floor with the holder on it. Roles swap the second time. The last helper is
    stranded on a lift they can't drive, so the partner lifts them out. Doors on the top floor,
    Sol's just west of the hub and Luna's at its east end. 9 beats.
12. **The Drop.** Homage to object-routing rooms (see `05-22-ball-routing-before.jpg` to
    `05-40-...-after.jpg`). Shape: a U. Start top left, doors top right, and the only way is
    down, across the cellar and up. Crates are dropped down chutes onto plates they can
    never be taken off. Which chute matters. 8 beats.
13. **Switchback.** Shape: a figure of eight. Two loops through the left and right halves meet
    at a tower in the centre, the only way up. The tower's four floors are seven rows apart,
    joined by stairs under three hatches the players leapfrog past. The idea is the lever itself:
    walking back through one switches it off. On each top arc a pool under a low ceiling keeps the
    loop to one player, then a lever. Turning back or going round decides how the lever ends.
    Luna's door is in a pit under a purple hatch on the top-left arc; Sol's is at the end of a low
    sun tunnel at the bottom left. The players start apart. The hint says how levers work. 8 beats.
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

17. **Shade Garden.** A moving room after a thinking chapter. Shape: a braid in four bands seven
    rows apart. The two strands cross at two lifts in the centre, and each crossing sends Sol out
    through a sun channel and Luna through a moon channel. Every run is broken by shade tunnels on
    low mounds, four shade cells under a 2-row roof that no jump clears. Each tunnel has a stepping
    stone that only the partner can raise, so the two leapfrog up the braid. Two levers near the
    top raise their stones for good. 8 beats.
18. **Closing Time.** Shape: a 3x3 honeycomb of chamfered cells with a doorway in each wall.
    Sol starts in a pocket in the bottom left (its roof starts at row 21, leaving 6 free rows),
    Luna in the bottom right. Each player snakes through eight of the nine cells: they swap bottom
    corners, climb each other's columns and swap again through the centre. Colours are columns,
    so each climb is opened by the partner in the other column. Controls open one doorway and
    close another (`inv`), and the bottom doorway is an airlock run the moment the partner steps
    on. Sol's door is in the top right behind a gate, Luna's on a block in the top left. 10 beats.
19. **Crate Relay.** Shape: two wings and a central chasm. Two crates, two sockets. Neither
    player can carry a crate all the way: it must be handed over, on a ferry and by a
    platform that shoves it across. 10 beats.
20. **Undertow.** Shape: an interleaved maze of low pool tunnels. Sol's sun tunnels and
    Luna's moon tunnels cross at shared junction chambers. Start in opposite corners, doors
    in the centre. Each junction needs the other player to have done something in their own
    tunnels first. 10 beats.
21. **Pendulum.** The one open room. Shape: a tall atrium with a shade floor, split by a
    shade-topped pillar, between two side walls of rooms on floors 28, 21, 14 and 7. Three ferries
    hang at three heights and swing from wall to wall while their plate is held. Each ferry rests
    on the far side from whoever rides it first, so it must be called over before anyone can
    board. Each wall's stairs climb one storey through a hatch opened from the other wall. The
    players zigzag to the top, trading sides on every ferry, to door lofts over the top rooms:
    Sol's on the right, Luna's on the left. 10 beats.
22. **The Operator.** Shape: a comb. The control deck runs along the top as one flat floor on
    row 7, with a trough and a low booth by the door. The runner's course hangs under it as five
    shafts, A to E, and an outer gallery runs down the right side. Shaft B and the gallery are
    staggered ladders of 3- and 4-tile climbs on 7-row bands. One lever swaps two bridges, one
    moves a lift, three plates open the deck's door, and a rescue lever frees the runner from the
    end cell. The players start apart: Luna runs first, Sol operates. Then the roles swap, with
    one thing different: Sol can't wade the moon pool, so the bridges must be switched twice.
    Sol's shelf sits seven rows above the end cell and is reached only by falling onto it. Luna
    finishes with a six-wide leap over the well mouth into her alcove. 11 beats.
23. **Eclipse.** Shape: a butterfly. The left wing (sun pools) is Sol's and mirrors Luna's
    right wing (moon pools), down to the levers: Sol's switches when he walks east through it,
    Luna's when she walks west. A body splits them, with a locked tunnel through its middle band. The wings fold into
    bands seven rows apart, and each wing tip has a yellow lift; the two lifts are a
    counterweight pair. What each player does on their side changes the other side. Halfway they
    cross through the tunnel and finish at the top of each other's wing, where the mirror is no
    longer exact: Sol's wing has a socket that needs the crate. 11 beats.
24. **Dusk Gate.** Chapter exam. Shape: a spiral that winds inward from the outer wall to a
    door chamber in the centre. Uses an inverted pair, a timed gate, a crate handover and an
    operator stretch. 12 beats.

### Chapter IV. Midnight

25. **Two Keys.** Shape: a tower over a basement. Two crates and four places that want one.
    One crate must be a step first and a weight later, and the order is the puzzle. 12 beats.
26. **Tidelock.** Shape: four quadrant basins ring a cross-shaped control room. Two levers on
    the control room floor give four states, and each state opens one crossing; every basin has
    two locks with different codes, so a runner is shut in until the operator changes the state.
    The west basins sit on floors 28, 21, 14 and 7. The control room is 6 rows tall, so the
    operator can jump the levers. The top band's crossing is a shade pit crossed stone to stone,
    then off the green stone down a hole into the NE basin. Luna's NE gem is the room's one 6-tile
    jump. Luna operates while Sol runs the ring, then they swap. The doors are in the control
    room's two arms, behind gates opened from the latch hall. 13 beats.
27. **Leapfrog Spire.** Two 6-row lift stairs around a hollow core, worked in leapfrog: Sol
    climbs floors 28/22/16/10/4 on the west, Luna 27/21/15/9/4 on the east, and every lift's plate
    is on the other side. The crate rides Luna's 4-wide lifts and goes down a chute onto the socket
    that holds Sol's last lift. The pair then go down the core on a lift and a counterweight to the
    doors at its foot. The landings have 5 free rows, so they are walked. The new jump appears in
    the column (ledge climbs of 4 and 3), in a climb of 4 up Luna's open shaft, and in crate hops
    where the shaft overhead is open. 13 beats.
28. **The Vault.** Shape: a vault in the centre with three hatches sealing the shaft above it,
    and a small room in three corners; the fourth corner, bottom left, is the start. Each corner
    room opens one hatch for good. The players go into the vault from the sides, through gates
    only the crates open. Each player holds plates in one corner for the other in the diagonal
    corner. Two crates with two jobs each: crate A is a step in the top-left room, crate B a
    weight in the top-right room, then both stack in one deep socket. The two top rooms need both
    players; the bottom-right one Sol does alone while Luna is busy. Every climb is 3 rows, and
    the two high ledges sit 5 above their floor, so only a crate is a step up to them. 13 beats.
29. **Sunken Halls.** Shape: four flooded halls on 7-row bands, from the top of the screen to
    the bottom, joined only by holes: chutes, a well, two rescue-lift shafts and a hatch. Start at
    the top, doors at the bottom. Every drop is one way. Crates go down chutes ahead of the
    players: one is a stepping stone in a shade lake, then rides a rescue lift down and becomes a
    step up a 5-tile wall; the other travels all the way to a socket that raises the last bridge.
    Twice a player who dropped first is brought back up by a rescue lift. 14 beats.
30. **Twilight Spiral.** Shape: a double spiral in five bands. Sol winds inward clockwise and
    Luna counter-clockwise through an outer ring and an inner ring to the sanctum, and the two
    paths cross four times. Every climb is a lift driven from the far side of the screen. At each
    crossing the helper and the helped swap. The last two crossings are airlocks of three gates
    (shut, slow-closing, shut), so a runner more than about 10 ticks late is shut out, in either
    direction. Luna's sanctum hatch sinks flush with the floor. Each finishes on the side they did
    not enter. 15 beats.
31. **Sanctum Approach.** Shape: three stages stacked bottom, middle and top, on bands at rows
    7/8, 15, 22 and 28, joined by a double lift shaft on the east side. The bottom has a corridor
    over a sun-water tunnel, the middle a crate hall with an operator's ledge, the top the sanctum
    with both doors behind two gates. A corridor lever raises the bridge over the pit but locks
    the sanctum's inner gate, so once the crate is in its socket Sol goes back down to reset it.
    Luna opens a hatch from the top, Sol wades out through the sun-water tunnel, and she brings
    him up on both lifts. Operator and runner swap twice, with a crate. 16 beats.
32. **Heart of Twilight.** The finale. Shape: two wings of four bands seven rows apart, a start
    hall under the heart, and a top floor that spans the room with a ferry over a shade pit. The
    heart in the middle holds both doors behind four floor gates: two open while a crate sits in
    each socket, one while the pink lever is on, one while the yellow lever is off. Each wing's
    climb is worked from the other wing. Two crates and all six groups. 18+ beats.

## Who builds what

| Builder | Levels |
| --- | --- |
| Planner | 1 (pilot), tooling, review, pictures, docs |
| Round 1 | A built 2-8 (`act1`), B built 12-15 (`act2`), C built 23 (`act3`) |
| Round 2 | A: 9-11 (`act1`), 16-17 (`act4`). B: 18-22 (`act2`). C: 24-27 (`act3`). Each also trims gems on their file's round-1 rooms. |
| Round 3 | A: 11 fix, 16, 17, 28 (`act1`, `act4`). B: 22 rebuilt, 29-31 (`act2`, `act5`). C: 26, 27 (`act3`), 32 (`act6`). |

## Status and thin margins (Nov 17, 2026)

Gravity dropped to 0.33 on Nov 17 and every level was re-spaced for the higher jump. On the
evening of Nov 17 the full gate, solo check included, passed all 32 levels with a fresh bot cache,
with 0 roof hits on every bot route. The solo search hit its state limit without a solo finish in
12, 14, 15, 19 and 25, so those five passes are bounded, not proofs. 27 Leapfrog Spire was the
last to land: bot 78.3 s against a 76 s floor (after the spawn headroom fix), Sol at exactly 16 sectors, stone 26%.
The pictures in `docs/img/level-N.jpg` predate the re-spacing.

These margins sit at or near a gate limit. They come from `FAST=1 node tools/gate.js` on Nov 17,
replaying cached bot runs. A level change, a `PHYS` change or a `NOCACHE=1` run re-searches and
can move them.

| Level | What is close | Value / limit |
| --- | --- | --- |
| 2 Parting Ways | bot time; sectors each player visits | 32.6 s / 30 s; Sol 12, Luna 12 / 12 |
| 3 Shade Well | stone fill; largest empty block | 25% / 25%; 119 / 120 cells |
| 4 The Lift | largest empty block; sectors visited; sectors with floor | 120 / 120; 21 / 21; 21 / 21 |
| 6 Crate Cellar, 8 Dawn Gate | longest flat stone floor | 18 / 18 |
| 11 Helper's Way Out | bot time | 46.9 s / 45 s |
| 12 The Drop | largest empty block | 120 / 120 |
| 15 Clockwork | plates and levers | 6 / 6 |
| 17 Shade Garden | bot time; sectors Luna visits | 60.2 s / 60 s; 15 / 15 |
| 18 Closing Time | bot time | 60.0 s / 60 s |
| 22 The Operator | bot time; plates and levers | 69.5 s / 68 s; 7 / 7 |
| 26 Tidelock | largest empty block; plates and levers | 120 / 120; 8 / 8 |
| 29 Sunken Halls | sectors visited | 23 / 23 |
| 32 Heart of Twilight | bot time; sectors visited; sectors Sol visits; stone fill | 86.6 s / 85 s; 23 / 23; 16 / 16; 25% / 25% |

Also at the minimum for sectors visited: 5, 6 and 10 (22 / 22), 19, 20 and 25 (23 / 23).
Stone fill is 26% in 6, 8, 11, 12, 19 and 31. Plates and levers are used 13 times in 19
(need 12) and 19 times in 25 (need 17).

Known follow-ups:

- **Chapter II curve.** Bot times now run 68-71 s for 12-14 and 87 s for 15 Clockwork, against
  60-79 s for 16-24. Only 15 still stands out.
- **Unrecoverable mistakes left in on purpose.** (A crate pinned on a floor against a wall
  can be kicked free.) Crate B into 28's empty east shaft; falling down a crate chute in 32;
  dropping out of 26's control room while the runner is shut in a basin; dropping in 29 before
  the hall above is done. These were listed before the re-spacing and have not been re-checked.

## What to hand back

For every level: the gate result, the bot's time, one sentence on the room's shape and one
on its idea, anything you changed from the brief and why, and any weakness you know about
(a jump that is tighter than you'd like, a state that can't be recovered, a search that hit
its limit). Say plainly which levels pass the full gate and which don't. A level that fails
honestly is more useful than one reported as done.
