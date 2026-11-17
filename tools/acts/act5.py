"""Act 5: levels 29-31 (round 3, builder B). See docs/level-plan.md for the brief of each level.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js <n>`.
"""
from lvdsl import Lv, level, W, H

# ---------------------------------------------------------------------------
# Helpers for this file only.


def rock(L):
    """Start from solid rock; rooms are carved out of it."""
    return L.r(1, 1, W, H)


def vdoor(L, x, y0, g, inv=False, travel=2):
    """A 2-high gate in cells (x, y0..y0+1) that rises `travel` cells into a slot above it.
    Normal: shut at rest, open while group g is active. inv: the reverse.
    The caller keeps stone on both sides of the slot."""
    L.clear(x, y0 - travel, x, y0 + 1)
    L.plat(x, y0, 1, 2, 0, -travel, g, inv)
    return L


def lift(L, x, y, w, rise, g, inv=False):
    """A w-wide lift whose top rests in row y and rises `rise` rows while g is active.
    Clears its shaft (rows y-rise..y, columns x..x+w-1)."""
    L.clear(x, y - rise, x + w - 1, y)
    L.plat(x, y, w, 1, 0, -rise, g, inv)
    return L


def hatch(L, x, y, w, dx, g, inv=False):
    """A w-wide hatch in floor row y at x..x+w-1 that slides dx cells sideways into a slot in the
    same row while g is active (inv: the reverse). The caller puts stone under the slot."""
    L.clear(x, y, x + w - 1, y)
    L.clear(x + dx, y, x + dx + w - 1, y)
    L.plat(x, y, w, 1, dx, 0, g, inv)
    return L


def gems(L, sun, moon):
    for x, y in sun:
        L.p(x, y, 's')
    for x, y in moon:
        L.p(x, y, 'm')
    return L


@level(29)
def sunken_halls():
    """Sunken Halls. Four flooded halls stacked from the top of the screen to the bottom, joined
    only by holes in their floors: a chute over the lake, a well, the shafts of two rescue lifts,
    a chute at the end of a ferry, a hatch and a chute into the bottom hall. Every drop is one
    way. The crates go down ahead of the players. K1 is a stepping stone in the second hall's
    shade lake, then rides a rescue lift down and becomes a step up a wall in the third. K2
    travels all the way down to a socket in the bottom hall. Colours keep one job each: white
    plates drive lifts, orange plates hold a gate for the partner, and a green and a pink lever,
    each one hall below what it opens, are why somebody always has to go down first.

    Every hall has six free rows over the floors people jump from (seven over the lake and
    under the wall, where the jumps start from a crate). The top hall is a low gallery where
    nobody needs to climb.

    1. Sol holds orange plate PG: gate G0 opens and Luna wades the moon tunnel into the west
       room. She pushes K1 into chute C1, where it rests on hatch HK. Sol holds PG again to let
       her out.
    2. Sol drops down the well (the first early drop). He jumps R2's open shaft and stands on
       purple plate PK: HK slides away and K1 falls into the middle of the shade lake. He
       crosses the lake on K1 and walks back through the green lever on its far shore: the east
       rooms up in the first hall open.
    3. Rescue one. Lift R1 waits up in the first hall. Luna holds white plate PR1 and it comes
       down to Sol; he steps on, she lets go, and it carries him up.
    4. Luna holds PG: the inner gate of the east rooms opens. Sol jumps over K2 in there and
       pushes it out west onto R1. Luna holds PR1 again and R1 carries the crate down.
    5. Sol drops down the open shaft after it and pushes K2 off the lift, against the ferry
       room's gate, before she lets go. Luna drops down the well.
    6. Luna drops down R2's shaft (the second early drop). In the third hall she wades a moon
       tunnel and walks through the pink lever and back: the ferry gate rises and the lake drains.
    7. Rescue two. Sol crosses the lake on K1 again and holds white plate PR2 on its far shore:
       R2 brings Luna up. While he holds it, Luna pushes K1 out of the drained lake onto R2. Sol
       lets go: K1 rides down.
    8. Luna pushes K2 onto the ferry and climbs on behind it. Sol holds purple plate PF: the
       ferry carries them under the low ceiling. Luna pushes K2 off the end down chute C2 and
       drops after it. Sol cannot follow.
    9. Hall three is a relay. Sol drops down R2's shaft onto K1. Gate GP stands between it and
       a wall five tiles high: Luna holds orange plate P8 on her side and he pushes K1 through
       to the foot of the wall. From the crate he just reaches the ledge, and drops into the
       west end to hold orange plate P5.
    10. G5 opens. Luna pushes K2 through it into chute C3, where it rests on hatch HC, and
        follows it through G5 onto P7.
    11. P7 holds Sol's hatch HW open and he drops into the bottom hall. There he stands on purple
        plate P9: HC slides away under the crate and it falls into the bottom hall, and Luna drops
        after it while he holds. She pushes K2 west into the yellow socket: the bridge rises
        out of the shade.
    12. Luna crosses the bridge and holds orange plate P6: Sol comes through gate G6.
    13. Sol's door is on a shelf four rows up. Luna holds white plate PR3 and lift L4 takes him up.
        He holds orange P6b on the shelf: G6 opens again and Luna walks back west to her door,
        in the corner Sol dropped into.
    """
    L = Lv('Sunken Halls', 95, 'Every drop is one way. Whoever goes down first needs a white plate held to come back up.')
    rock(L)
    # ---- hall 1 (rows 1-5): the west room, G0, the moon tunnel, the start, the east rooms
    L.clear(1, 1, 11, 4).clear(12, 3, 12, 4)              # the west room (floor rows 5-6, over the lake)
    L.clear(7, 5, 8, 5)                                   # chute C1
    hatch(L, 7, 6, 2, -2, 0)                              # HK (purple), its slot hidden in the floor
    L.p(10, 4, 'k')                                       # K1
    vdoor(L, 13, 3, 2)                                    # G0 (orange)
    L.clear(14, 3, 17, 4).pool(14, 5, 3, 'M')             # the moon tunnel: Luna only
    L.p(17, 5, '\\')                                     # up into it from the hall
    L.clear(18, 1, 38, 5)                                 # the hall, floor row 6
    L.plate(18, 5, 3)                                     # PR1 (white)
    L.p(19, 5, 'a').p(20, 5, 'b')
    L.plate(21, 5, 2)                                     # PG (orange), eight tiles from G0
    L.clear(22, 6, 23, 6)                                 # the well
    lift(L, 24, 13, 3, 7, 3, inv=True)                    # R1: waits up here until a white plate calls it down (stops flush with hall 2's floor)
    L.r(30, 1, 30, 3).floorgate(30, 4, 2, 1)              # G1 (green): sinks into the ferry room's ceiling
    L.r(33, 1, 33, 3).floorgate(33, 4, 2, 2)              # G2 (orange)
    L.p(36, 5, 'k')                                       # K2
    # ---- hall 2 (rows 7-12, floor 13): far shore, the lake, R2, the well's foot, R1, the ferry
    L.clear(1, 7, 12, 12).clear(4, 13, 11, 13)
    L.plate(1, 12, 3)                                     # PR2 (white)
    L.lever(2, 12, 1)                                     # L1 (green) on the far shore
    L.plate(3, 12, 0)                                     # PF (purple)
    L.pool(4, 14, 8, 'X')                                 # the shade lake, eight wide (one more than a jump), sunk one row
    L.clear(4, 15, 11, 15).plat(4, 15, 8, 1, 0, -2, 4, True)   # its floor rises to the shore once pink is off
    L.clear(13, 7, 27, 12).clear(28, 7, 28, 8).clear(28, 11, 28, 12)
    L.r(14, 7, 16, 8)                                     # an overhang over the near shore
    L.plate(16, 12, 0)                                    # PK (purple): drops K1 into the lake
    lift(L, 18, 21, 3, 8, 3)                              # R2: hall 3 up to hall 2, flush with both floors
    vdoor(L, 29, 11, 4, inv=True)                         # G3 (pink): open once the pink lever is off
    L.clear(30, 11, 35, 12).pool(30, 13, 6, 'X')          # the ferry room: a low tunnel over shade
    L.plat(30, 13, 3, 1, 3, 0, 0)                         # the ferry (purple)
    L.clear(36, 7, 38, 12).clear(36, 13, 37, 13)          # chute C2
    # ---- hall 3: Sol's west end (floor 22), the ledge, the wall's foot, R2, the moon tunnel, Luna's east end
    L.clear(1, 14, 3, 21).clear(4, 16, 12, 21)
    L.plate(2, 21, 2)                                     # P5 (orange)
    hatch(L, 7, 22, 2, 2, 2)                              # HW (orange): Sol's hatch down, five tiles from P5
    L.clear(12, 14, 14, 15)                               # the ledge on top of the wall (rows 16-22)
    L.clear(15, 14, 16, 20)                               # the wall's foot, seven rows high
    L.clear(17, 19, 17, 20).floorgate(17, 19, 2, 2)       # GP (orange), under a lintel
    L.clear(21, 14, 21, 20).clear(22, 19, 28, 20).pool(22, 21, 3, 'M')   # the moon tunnel
    L.lever(27, 20, 4, on=True)                           # L2 (pink), starts on
    L.clear(31, 14, 38, 20)                               # Luna's east end
    L.clear(31, 21, 32, 21)                               # chute C3, floored by a hatch
    L.plat(31, 22, 2, 1, -2, 0, 0)                        # HC (purple): drops the crate from below
    L.plate(33, 20, 2)                                    # P7 (orange): Luna holds Sol's hatch
    vdoor(L, 34, 19, 2)                                   # G5 (orange)
    L.r(33, 17, 33, 18).r(35, 17, 35, 18).r(34, 14, 34, 16)
    L.plate(38, 20, 2)                                    # P8 (orange): Luna holds GP for Sol
    # ---- hall 4: Sol's corner (floor 29), G6, the bridge, the socket, L4 and the door shelf
    L.clear(1, 23, 8, 28)
    L.clear(9, 27, 9, 28)
    vdoor(L, 10, 27, 2)                                   # G6 (orange)
    L.clear(11, 27, 11, 28).clear(12, 23, 12, 28)
    L.clear(13, 23, 14, 27).clear(15, 22, 15, 27).clear(16, 23, 18, 27).clear(19, 22, 36, 27)
    L.plate(15, 27, 2)                                    # P6 (orange), five tiles from G6
    L.r(17, 22, 23, 24).p(17, 27, '/').p(23, 27, '\\')    # shade under a low ceiling
    L.pool(18, 27, 5, 'X')
    L.clear(18, 28, 22, 28).plat(18, 28, 5, 1, 0, -1, 5)  # B4 (yellow): rises while K2 is in its socket
    L.clear(25, 28, 26, 28).plate(25, 28, 5).plate(26, 28, 5)   # the socket (yellow)
    L.plate(33, 27, 3)                                    # PR3 (white)
    lift(L, 34, 28, 3, 4, 3)                              # L4 (white): up to the door shelf
    L.clear(37, 22, 38, 23).plate(38, 23, 2)              # the shelf, P6b (orange)
    L.p(37, 23, 'A').p(5, 28, 'B')
    L.plate(3, 28, 0)                                     # P9 (purple): Sol opens HC from below
    gems(L, sun=((38, 2), (1, 8), (14, 14), (1, 16), (1, 24)),
         moon=((11, 2), (22, 8), (25, 20), (38, 15), (30, 23)))
    return L


def airlock(L, xa, xb, y0, g, travel=4):
    """Two gates side by side in a 2-high doorway at rows y0..y0+1. The gate at xa opens while g
    is active; the gate at xb is open at rest and shuts slowly while g is active (it falls
    `travel` cells). Nobody passes while the control rests, nor while it is held: the runner
    must go the moment the partner steps on. The caller keeps stone around both slots."""
    vdoor(L, xa, y0, g)
    vdoor(L, xb, y0, g, inv=True, travel=travel)
    return L


@level(30)
def twilight_spiral():
    """Twilight Spiral. Two spirals wound into one another: an outer ring of corridors around an
    inner ring around the sanctum. Sol winds inward clockwise, Luna counter-clockwise, so the
    two paths are mirror images that cross four times. Each side of each ring is climbed by
    one of them and dropped down by the other, and every climb is a lift driven from the far
    side of the screen. Sol's door is in the west of the sanctum and Luna's in the east, so
    they finish on the side they did not enter.

    The rings are stacked as five bands: the outer top and bottom corridors have six free rows
    (the full jump), the inner corridors three and the sanctum five. Nobody needs to jump in
    the three low bands; they are for walking, wading and running gates.

    1. Both start in the bottom corridor and part: Sol west, Luna east. Sol's way west is moon
       water under a low ceiling; Luna holds green plate PGb by the start and his bridge rises.
       Hers is sun water: he holds green PGw at the west end and she crosses east.
       Sol stands on the first left lift and Luna, at the far right, holds white plate PLs: he
       rises to the first landing. She lets go, he steps onto the second lift, she holds it
       again; and once more for the third: a pump of three presses to the top.
    2. Sol holds white plate PRl at the top left three times, and Luna rides the three right
       lifts up. On the way west she wades the moon water on the top corridor's east stretch.
    3. Crossing one, top centre. Luna holds orange plate P1: gate G1 opens and Sol comes
       through east. He walks right through the orange lever: G1 stays open and the doorways
       from the outer columns into the inner ring open. Luna goes on west.
    3b. Sol cannot wade the moon water, nor Luna the sun water he waded on the west stretch.
       Luna stops on green plate PGr: his bridge rises and he crosses. He stands on green PGe
       beyond it: hers rises and she crosses. Each drops down the far column.
    4. Each drops down the side the other climbed and goes into the inner ring's bottom
       corridor at the far end from where they will next climb.
    5. Crossing two, inner bottom. Each meets the other's water first: Luna holds green PIw at
       the west end and Sol crosses the moon water; he holds green PIe and she crosses the sun
       water. Then Sol holds purple plate P2 and Luna comes through G2 east; she takes over P2
       and he goes through west.
    6. The inner lifts wait at the top. Luna holds white plate PIL to call the left one down,
       Sol steps on, and she lets go to send him up. He does the same for her with white PIR
       up there and the right lift. (A plug in the floor under each inner lift sinks while the
       lift is down, so the inner bottom corridor has no pit when the lifts are up.)
    7. Crossing three, inner top: an airlock (pink). Luna holds P3 and Sol runs through east the
       moment she steps on. She steps off, he takes the plate, and she runs through west.
    8. Luna wades into the moon bay at the far west of the inner top and walks back out through
       the yellow lever: Sol's hatch into the east of the sanctum opens and he drops in. He holds
       green plate PGc inside, and Luna's hatch into the west opens for her. Each is now on the
       far side from their own door.
    9. Crossing four, the sanctum: another airlock (pink). Sol holds P4 and Luna runs east; she
       takes the plate and Sol runs west. Each walks to their door.
    """
    L = Lv('Twilight Spiral', 95, 'Your paths cross four times. At each crossing one of you holds the way for the other. In an airlock, run the moment your partner steps on.')
    rock(L)
    # ---- the outer top corridor T (rows 1-6, floor 7)
    L.clear(1, 1, 38, 6)
    L.plate(5, 6, 3)                                      # PRl (white): Luna's lifts
    L.r(7, 1, 11, 4).pool(8, 7, 3, 'S')                   # sun water under a low ceiling: Sol wades it
    L.clear(8, 8, 10, 8).plat(8, 8, 3, 1, 0, -1, 1)       # Luna's bridge over it (green)
    L.plate(12, 6, 1)                                     # PGr (green): Luna holds Sol's bridge from here
    L.r(14, 1, 16, 4)
    vdoor(L, 15, 5, 2)                                    # G1 (orange)
    L.plate(19, 6, 2)                                     # P1 (orange), four tiles from G1
    L.rampR(20, 6, 3).r(23, 4, 24, 6).rampL(27, 6, 3)     # a hump over the inner airlock's tall slot
    L.lever(28, 6, 2)                                     # L1 (orange)
    L.p(29, 6, '/').r(30, 6, 33, 6).p(34, 6, '\\')       # the raised east stretch
    L.r(29, 1, 34, 3).pool(30, 6, 3, 'M')                 # moon water under a low ceiling: Luna wades it
    L.clear(30, 7, 32, 7).plat(30, 7, 3, 1, 0, -1, 1)     # BG (green): Sol's bridge over it
    L.plate(33, 5, 1)                                     # PGe (green): Sol holds it from the east stretch
    # ---- the outer bottom corridor B (rows 22-27, floor 28)
    L.clear(1, 22, 38, 27)
    L.p(6, 27, '/').r(7, 27, 10, 27).p(11, 27, '\\')     # a raised stretch west of the start
    L.r(6, 22, 10, 24).pool(7, 27, 3, 'M')                # with moon water under a low ceiling
    L.clear(7, 28, 9, 28).plat(7, 28, 3, 1, 0, -1, 1)     # BB (green): Sol's first bridge
    L.r(14, 22, 28, 22)                                   # the middle's lower roof
    L.plate(27, 27, 1)                                    # PGb (green): Luna holds it from beside her own water
    L.p(18, 27, 'a').p(20, 27, 'b')
    L.p(28, 27, '/').r(29, 27, 32, 27).p(33, 27, '\\')   # the same east of the start, with sun water
    L.r(29, 22, 33, 24).pool(29, 27, 3, 'S')
    L.clear(29, 28, 31, 28).plat(29, 28, 3, 1, 0, -1, 1)  # Luna's first bridge (green)
    L.plate(4, 27, 1)                                     # PGw (green): Sol holds it from the west
    L.plate(34, 27, 3)                                    # PLs (white): Sol's lifts
    # ---- the outer columns: three lifts each side, landings at rows 21 and 14
    L.clear(1, 8, 5, 21).r(3, 14, 3, 14).r(3, 21, 3, 21)
    lift(L, 1, 28, 2, 7, 3).r(1, 22, 2, 22).clear(1, 22, 2, 27)
    lift(L, 4, 21, 2, 7, 3)
    lift(L, 1, 14, 2, 7, 3)
    vdoor(L, 6, 19, 2)                                    # GLd (orange): into the inner bottom
    L.clear(34, 8, 38, 21).r(36, 14, 36, 14).r(36, 21, 36, 21)
    lift(L, 37, 28, 2, 7, 3)
    lift(L, 34, 21, 2, 7, 3)
    lift(L, 37, 14, 2, 7, 3)
    vdoor(L, 33, 19, 2)                                   # GRd (orange)
    # ---- the inner top IT (rows 8-10, floor 11)
    L.clear(7, 8, 32, 10)
    L.r(7, 8, 7, 8).pool(8, 11, 3, 'M')                   # the moon bay at the west end, under Luna's bridge
    L.lever(7, 10, 5)                                     # LY (yellow)
    lift(L, 11, 21, 3, 10, 3, inv=True)                   # IL: waits at the top until called down
    L.plate(14, 10, 3)                                    # PIR (white): Luna's inner lift
    L.plat(15, 11, 2, 1, 0, 5, 1)                         # HW (green): the hatch into the west sanctum, held from inside
    L.clear(15, 11, 16, 11)
    L.p(17, 10, '/').r(18, 10, 20, 10).p(21, 10, '\\')   # a hump over the sanctum airlock's slot
    L.r(22, 8, 25, 8)
    airlock(L, 23, 24, 9, 4, travel=4)                    # crossing three (pink)
    L.plat(25, 11, 2, 1, 0, 5, 5).clear(25, 11, 26, 11)   # HE (yellow): the hatch into the east sanctum
    L.plate(27, 10, 4)                                    # P3 (pink)
    lift(L, 29, 21, 3, 10, 3, inv=True)                   # IR, the same
    # ---- the sanctum (rows 12-16, floor 17, x 15-27)
    L.clear(15, 12, 27, 16)
    L.r(17, 12, 20, 14)
    airlock(L, 18, 19, 15, 4)                             # crossing four (pink)
    L.plate(24, 16, 4)                                    # P4 (pink)
    L.plate(22, 16, 1)                                    # PGc (green): Sol holds Luna's hatch
    L.p(17, 16, 'A').p(27, 16, 'B')
    # ---- the inner bottom IB (rows 18-20, floor 21)
    L.clear(7, 18, 32, 20).r(7, 18, 7, 18)
    L.plate(9, 20, 1)                                     # PIw (green)
    L.plat(11, 21, 3, 1, 0, 1, 3).clear(11, 22, 13, 22)   # IL's plug (white): sinks while the lift is down
    L.r(14, 18, 16, 18).pool(14, 21, 3, 'S')              # sun water on the inner bottom's west half
    L.clear(14, 22, 16, 22).plat(14, 22, 3, 1, 0, -1, 1)  # Luna's bridge (green)
    L.clear(19, 19, 19, 20).floorgate(19, 19, 2, 0)       # G2 (purple), under a lintel
    L.plate(22, 20, 1)                                    # PIe (green)
    L.plate(24, 20, 0)                                    # P2 (purple)
    L.r(25, 18, 27, 18).pool(25, 21, 3, 'M')              # moon water on its east half
    L.clear(25, 22, 27, 22).plat(25, 22, 3, 1, 0, -1, 1)  # Sol's bridge (green)
    L.plate(28, 20, 3)                                    # PIL (white): Sol's inner lift
    L.plat(29, 21, 3, 1, 0, 1, 3).clear(29, 22, 31, 22)   # IR's plug (white)
    L.r(32, 11, 32, 18)                                   # the wall between IR's shaft and GRd's slot
    gems(L, sun=((1, 3), (3, 24), (32, 19), (12, 8), (26, 13)),
         moon=((38, 3), (36, 24), (8, 19), (9, 10), (15, 13), (28, 8)))
    return L


@level(31)
def sanctum_approach():
    """Sanctum Approach. Three stages stacked bottom, middle and top, each its own small puzzle,
    joined by one double shaft on the east side: lift S1 runs from the bottom stage to the middle,
    lift S2 from the middle to the top, side by side. The bottom stage is a corridor over a
    tunnel, the middle a crate hall, the top the sanctum with both doors behind two gates.

    The catch: the yellow lever in the bottom corridor raises the bridge over its shade pit, and
    the same colour holds the sanctum's inner door gate shut. Crossing the pit needs it on;
    finishing needs it off.

    1. Bottom. Luna holds purple plate P1: gate G1 opens and Sol walks east, right through the
       yellow lever (the bridge rises) and over the pit to the shaft. He holds purple P1b there
       and Luna follows.
    2. Luna holds white plate PS1: S1 lifts Sol to the middle. He holds white PS1b there and she
       rides up after him.
    3. Middle (roles swap). Sol holds orange plate P2: gate G2 opens and the bridge over the
       shade gap beyond it rises. Luna goes into the crate hall, jumps the crate K, pushes it east
       through G2 and over the bridge onto S2, and climbs on behind it.
    4. Sol jumps up to green plate PS2 on its ledge: S2 carries Luna and the crate to the top.
       She pushes the crate off the lift before he lets go (or it rides back down), then holds
       green PS2b up there and Sol rides up.
    5. Top. Luna pushes K west until it drops off the sanctum's step straight into the pink
       socket: the outer door gate opens. The inner one is yellow, shut while the lever far
       below is on.
    6. Sol goes back down: into S2's empty shaft, across to S1's, all the way to the bottom. He
       walks west over the bridge and left through the yellow lever. The bridge drops behind
       him, so he is stuck between the pit and G1, but the sanctum's inner gate opens.
    7. Roles swap again: Luna is the operator. She crosses to orange plate PR by the door gates:
       the hatch at Sol's feet slides open and he drops into the tunnel under the corridor. Its
       sun water is his to wade, and it leads him back to the shaft.
    8. Luna runs back to white PS1c and then green PS2b by the shaft: S1 and S2 bring Sol up.
       Both walk in to the doors.
    """
    L = Lv('Sanctum Approach', 95, 'One lever below changes the room above. You may have to go back down and set it right.')
    rock(L)
    # ---- the double shaft: S2 (x 33-35) middle to top, S1 (x 36-38) bottom to middle
    lift(L, 33, 18, 3, 9, 1)                              # S2 (green)
    lift(L, 36, 28, 3, 10, 3)                             # S1 (white)
    L.clear(33, 19, 35, 27)                               # the shaft's foot under S2
    L.r(35, 26, 35, 27)                                   # a step up from the foot towards the corridor
    # ---- bottom stage: start room, corridor (rows 20-23, floor 24-25), tunnel (rows 26-27)
    L.clear(1, 20, 9, 23).r(1, 22, 4, 23)                 # the start room, with a shelf
    L.plate(3, 21, 0)                                     # P1 (purple)
    L.p(6, 23, 'a').p(8, 23, 'b')
    L.r(9, 20, 11, 21)
    vdoor(L, 10, 22, 0)                                   # G1 (purple)
    L.clear(11, 22, 32, 23).clear(12, 20, 18, 21).clear(24, 20, 32, 21)
    L.clear(13, 24, 14, 24)
    hatch(L, 13, 25, 2, 2, 2)                             # GR (orange): the hatch into the tunnel
    L.lever(17, 23, 5)                                    # L* (yellow)
    L.pool(20, 24, 3, 'X').clear(20, 25, 22, 25).plat(20, 25, 3, 1, 0, -1, 5)   # the pit and its bridge (yellow)
    L.p(26, 23, '/').r(27, 23, 32, 23)                    # the corridor's east end, a step up
    L.plate(28, 22, 3)                                    # PS1 (white)
    L.plate(31, 22, 0)                                    # P1b (purple)
    L.clear(13, 26, 32, 27).pool(22, 28, 3, 'S')          # the tunnel, with sun water Luna cannot cross
    L.r(35, 21, 35, 21)                                   # a ledge in the shaft's foot
    # ---- middle stage: the crate hall (rows 11-17, floor 18)
    L.clear(1, 11, 38, 17)
    L.r(1, 16, 11, 17).p(13, 17, 'k')                     # the hall's raised west end, the crate
    L.r(12, 11, 13, 12).r(25, 11, 27, 13).r(36, 11, 38, 12).r(14, 11, 17, 11)   # hanging blocks
    L.pool(24, 18, 2, 'X').clear(24, 19, 25, 19).plat(24, 19, 2, 1, 0, -1, 2)   # a shade gap, bridged while orange is held
    L.r(21, 11, 23, 15)
    vdoor(L, 22, 16, 2)                                   # G2 (orange)
    L.plate(26, 17, 3)                                    # PS1b (white)
    L.plate(28, 17, 2)                                    # P2 (orange)
    L.r(29, 15, 30, 15).plate(30, 14, 1)                  # PS2 (green) on a ledge over the crate's way
    # ---- top stage: the sanctum (rows 2-8, floor 9)
    L.clear(1, 2, 38, 8)
    L.clear(1, 9, 16, 9)                                  # the west half one row lower
    L.r(1, 2, 11, 4).r(1, 7, 1, 7)                        # the door room's low roof, a perch inside
    L.r(6, 6, 10, 7)
    vdoor(L, 7, 8, 5, inv=True)                           # GD (yellow, inverted): shut while L* is on
    vdoor(L, 9, 8, 4)                                     # GD2 (pink)
    L.p(2, 9, 'A').p(4, 9, 'B')
    L.clear(15, 10, 16, 10).plate(15, 10, 4).plate(16, 10, 4)   # the socket (pink), at the foot of the step
    L.plate(12, 9, 2)                                     # PR (orange), by the door gates
    L.plate(36, 8, 3).plate(38, 8, 1)                     # PS1c (white), PS2b (green)
    L.r(20, 2, 22, 4).r(29, 2, 30, 3).r(25, 2, 26, 6)     # hanging blocks
    L.r(12, 7, 13, 7).r(18, 6, 19, 6).r(23, 6, 23, 6).r(27, 6, 28, 6).r(34, 5, 35, 5)   # perches up in the sanctum
    gems(L, sun=((1, 20), (24, 20), (30, 26), (31, 11), (21, 5)),
         moon=((18, 20), (31, 20), (5, 12), (19, 13), (28, 4), (1, 13)))
    return L
