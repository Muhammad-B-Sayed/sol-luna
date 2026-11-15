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
    only by holes in their floors: a chute in the west, a well in the middle, the shafts of two
    rescue lifts, a chute at the end of a ferry, and two more holes into the bottom hall. Every
    drop is one way. The crates go down ahead of the players. K1 is a stepping stone twice: in
    the second hall's shade lake, and after riding a rescue lift down, in a shade pool in the
    third. K2 travels all the way down to a socket in the bottom hall. Colours keep one job each:
    white plates drive lifts, orange plates hold a gate for the partner, and a green and a pink
    lever, each one hall below what it opens, are why somebody always has to go down first.

    1. Sol holds orange plate PG: gate G0 opens and Luna wades the moon tunnel into the west
       room. She pushes K1 into chute C1, where it rests on hatch HK. Sol holds PG again to let
       her out.
    2. Sol drops down the well (the first early drop). He stands on purple plate PK below the
       chute: HK slides away and K1 falls into the shade lake. He crosses the lake on K1 and walks back
       through the green lever on its far shore: the east room up in the first hall opens.
    3. Rescue one. Lift R1 waits up in the first hall. Luna holds white plate PR1 and it comes
       down to Sol; he steps on, she lets go, and it carries him up.
    4. Luna holds PG: the inner gate of the east room opens. Sol jumps over K2 in there and
       pushes it out west onto R1. Luna holds PR1 again and R1 carries the crate down.
    5. Sol drops down the open shaft after it and pushes K2 off the lift, against the ferry
       room's gate, before she lets go. Luna drops down the well.
    6. Luna drops down R2's shaft (the second early drop). In the third hall she walks through
       the pink lever and back: the ferry room's gate rises and the shade lake drains.
    7. Rescue two. Sol holds white plate PR2 and R2 brings Luna up. While he still holds it,
       Luna pushes K1 out of the drained lake onto R2. Sol lets go: K1 rides down.
    8. Luna pushes K2 onto the ferry and climbs on behind it. Sol holds purple plate PF: the
       ferry carries them under the low ceiling. Luna pushes K2 off the end down chute C2 and
       drops after it. Sol cannot follow.
    9. Hall three is a relay. Sol drops down R2's shaft onto K1. Gate GP stands between it and
       the shade pool: Luna holds orange plate P8 on her side and he pushes K1 through into the
       pool, a stepping stone again. Over it, he holds orange plate P5.
    10. G5 opens. Luna pushes K2 through it into chute C3, where it rests on hatch HC, and
        follows it through G5 onto P7.
    11. P7 holds Sol's hatch open and he drops into the bottom hall. There he stands on purple
        plate P9: HC slides away under the crate and it falls into the bottom hall, and Luna drops
        after it while he holds. She pushes K2 west into the yellow socket: the bottom hall's
        bridge rises out of the shade.
    12. Luna crosses the bridge and holds orange plate P6: Sol comes through gate G6.
    13. Sol's door is on a shelf four rows up. Luna holds white plate PR3 and lift L4 takes him up.
        He holds orange P6b on the shelf: G6 opens again and Luna walks back west to her door,
        in the corner Sol dropped into.
    """
    L = Lv('Sunken Halls', 95, 'Every drop is one way. Whoever goes down first needs a white plate held to come back up.')
    rock(L)
    # ---- hall 1 (rows 2-6): the west room (raised), the moon tunnel, the start, the east rooms
    L.clear(1, 2, 38, 6)
    L.r(1, 6, 9, 6).p(10, 6, '\\')                      # the west room's floor, one step up
    L.clear(5, 6, 6, 6).clear(5, 8, 6, 8)                 # chute C1, floored by a hatch
    hatch(L, 5, 7, 2, -2, 0)                              # HK (purple): opened from the hall below
    L.r(1, 4, 2, 4)                                       # a perch in the west room
    L.p(7, 5, 'k')                                        # K1
    L.r(8, 2, 8, 3).r(10, 2, 10, 3)
    vdoor(L, 9, 4, 2)                                     # G0 (orange): the west room
    L.r(11, 2, 15, 4).pool(12, 7, 3, 'M')                 # the moon tunnel
    L.plate(16, 6, 2)                                     # PG (orange)
    L.p(17, 6, 'a').p(18, 6, 'b')
    L.clear(19, 7, 20, 8)                                 # the well
    L.plate(21, 6, 3)                                     # PR1 (white)
    L.r(26, 2, 28, 4)
    vdoor(L, 27, 5, 1)                                    # G1 (green): the east room
    L.r(30, 2, 32, 4)
    vdoor(L, 31, 5, 2)                                    # G2 (orange): the inner room
    L.r(35, 6, 38, 6)                                     # the inner room's raised end
    L.p(36, 5, 'k')                                       # K2
    # ---- hall 2 (rows 9-13): the lake in the west, a raised middle, the ferry room in the east
    L.clear(1, 9, 38, 13)
    L.lever(2, 13, 1)                                     # L1 (green) at the lake's far shore
    L.pool(4, 14, 7, 'X')                                 # the shade lake
    L.clear(4, 15, 10, 15).plat(4, 15, 7, 1, 0, -1, 4, True)   # its floor rises once pink is off
    L.plate(12, 13, 3)                                    # PR2 (white)
    L.plate(14, 13, 0)                                    # PK (purple): drops K1 into the lake
    L.r(13, 9, 16, 9)                                     # a lintel over R2's shaft
    L.r(18, 13, 21, 13).r(25, 13, 38, 13)                 # the raised middle and the ferry room
    lift(L, 22, 13, 3, 6, 3, inv=True)                    # R1: waits up in hall 1 until a white plate calls it down
    lift(L, 15, 21, 3, 7, 3)                              # R2: hall 3 to hall 2
    L.plate(3, 13, 0)                                     # PF (purple), across the drained lake
    L.r(26, 9, 26, 10).r(28, 9, 28, 10)
    vdoor(L, 27, 11, 4, inv=True)                         # G3 (pink): open once the pink lever is off
    L.pool(29, 13, 6, 'X')
    L.plat(29, 13, 3, 1, 3, 0, 0)                         # the ferry (purple)
    L.clear(35, 13, 36, 15)                               # chute C2
    L.r(29, 9, 34, 10)                                    # a low ceiling over the ferry: nobody jumps it
    # ---- hall 3 (rows 16-20, a thin floor at row 21): Sol's west end, the moon tunnel, Luna's east
    L.clear(1, 16, 38, 20)
    hatch(L, 2, 21, 2, 2, 2)                              # HW (orange): Sol's hatch down
    L.plate(7, 20, 2)                                     # P5 (orange)
    L.r(7, 16, 14, 17).pool(8, 21, 4, 'X')                # a shade pool under a low ceiling
    L.r(12, 18, 12, 18).r(14, 18, 14, 18)
    vdoor(L, 13, 19, 2)                                   # GP (orange): between R2 and the pool
    L.r(18, 16, 24, 18).pool(20, 21, 3, 'M')              # the moon tunnel
    L.lever(23, 20, 4, on=True)                           # L2 (pink), starts on
    L.r(25, 16, 25, 20)
    L.r(26, 20, 38, 20)                                   # Luna's east end, one step up
    L.clear(26, 20, 27, 20)                               # chute C3, floored by a hatch
    hatch(L, 26, 21, 2, 2, 0)                             # HC (purple): drops the crate from below
    L.plate(38, 19, 2)                                    # P8 (orange): Luna holds GP for Sol
    L.plate(28, 19, 2)                                    # P7 (orange): Luna holds Sol's hatch
    L.r(28, 16, 28, 17).r(30, 16, 30, 17)
    vdoor(L, 29, 18, 2)                                   # G5 (orange)
    # ---- hall 4 (rows 22-27): Sol's west end, the bridge, the socket, the lift to the door shelf
    L.clear(1, 22, 38, 27)
    L.r(7, 22, 9, 24).p(7, 27, '/')
    L.plate(3, 27, 0)                                     # P9 (purple): Sol opens HC from below
    vdoor(L, 8, 25, 2)                                    # G6 (orange)
    L.r(9, 27, 16, 27).plate(15, 26, 2)                   # P6 (orange)
    L.r(16, 22, 22, 24).pool(17, 27, 5, 'X')              # shade under a low ceiling
    L.clear(17, 28, 21, 28).plat(17, 28, 5, 1, 0, -1, 5)  # B4 (yellow): rises while K2 is in its socket
    L.r(22, 27, 30, 27)
    L.clear(22, 27, 23, 27).plate(22, 27, 5).plate(23, 27, 5)   # the socket (yellow), west of where K2 lands
    L.plate(30, 26, 3)                                    # PR3 (white)
    lift(L, 31, 28, 3, 4, 3)                              # L4 (white): up to the door shelf
    L.r(34, 24, 38, 24).plate(38, 23, 2)                  # the shelf, P6b (orange)
    L.p(35, 23, 'A').p(5, 27, 'B')
    L.r(4, 22, 5, 22)                                     # under the hatch's slot
    L.r(1, 25, 2, 25)                                     # a ledge in Sol's corner
    gems(L, sun=((38, 2), (1, 10), (14, 11), (1, 24), (1, 16), (37, 27)),
         moon=((1, 3), (21, 20), (38, 11), (35, 16), (24, 23), (22, 10)))
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

    1. Both start in the bottom corridor and part: Sol west, Luna east. Sol's way west is moon
       water under a low ceiling; Luna holds green plate PGb by the start and his bridge rises.
       Hers is sun water: he holds green PGw at the west end and she crosses east.
       Sol stands on the first
       left lift and Luna, at the far right, holds white plate PLs: he rises to the first
       landing. She lets go, he steps onto the second lift, she holds it again; and once more
       for the third: a pump of three presses to the top.
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
       up there and the right lift.
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
    # ---- the outer ring: top corridor T (rows 2-5), bottom corridor B (rows 24-27), side columns
    L.clear(1, 2, 38, 5)
    L.r(1, 5, 3, 5).r(36, 5, 38, 5)                      # raised pockets at both ends of T
    L.r(15, 2, 17, 3)
    vdoor(L, 16, 4, 2)                                    # G1 (orange)
    L.plate(21, 5, 2)                                     # P1 (orange), five tiles from G1
    L.p(22, 5, '/').p(23, 4, '/').r(23, 5, 25, 5).r(24, 4, 24, 4).p(25, 4, '\\').p(26, 5, '\\')   # a hump over the airlock's deep slot
    L.lever(27, 5, 2)                                     # L1 (orange)
    L.p(28, 5, '/').r(29, 5, 32, 5).p(33, 5, '\\')      # the raised east stretch of T
    L.r(28, 2, 33, 2).pool(29, 5, 3, 'M')                 # moon water under a low ceiling: Luna wades it
    L.clear(29, 6, 31, 6).plat(29, 6, 3, 1, 0, -1, 1)     # BG (green): Sol's bridge over it
    L.plate(8, 5, 3)                                      # PRl (white): Luna's lifts
    L.plate(12, 5, 1)                                     # PGr (green): Luna holds Sol's bridge from here
    L.r(8, 2, 12, 3).pool(9, 6, 3, 'S')                   # sun water on the west stretch: Sol wades it
    L.clear(9, 7, 11, 7).plat(9, 7, 3, 1, 0, -1, 1)       # Luna's bridge over it (green)
    L.plate(32, 4, 1)                                     # PGe (green): Sol holds it from the east stretch
    L.clear(1, 24, 38, 27)
    L.p(6, 27, '/').r(7, 27, 10, 27).p(11, 27, '\\')      # a raised stretch west of the start
    L.r(6, 24, 10, 24).pool(7, 27, 3, 'M')                # with moon water under a low ceiling
    L.clear(7, 28, 9, 28).plat(7, 28, 3, 1, 0, -1, 1)     # BB (green): Sol's first bridge
    L.plate(27, 27, 1)                                    # PGb (green): Luna holds it from beside her own water
    L.p(14, 27, '/').r(15, 27, 23, 27).p(24, 27, '\\')  # the start, a step up in the middle
    L.p(28, 27, '/').r(29, 27, 32, 27).p(33, 27, '\\')      # the same east of the start, with sun water
    L.r(28, 24, 32, 24).pool(29, 27, 3, 'S')
    L.clear(29, 28, 31, 28).plat(29, 28, 3, 1, 0, -1, 1)  # Luna's first bridge (green)
    L.plate(4, 27, 1)                                     # PGw (green): Sol holds it from the west
    L.r(26, 24, 27, 24).r(18, 24, 20, 24)
    L.p(18, 26, 'a').p(20, 26, 'b')
    L.plate(34, 27, 3)                                    # PLs (white): Sol's lifts
    # left column: three lifts in turn, L1 (x 1-2), L2 (x 4-5), L3 (x 1-2), with steps at x 3
    lift(L, 1, 28, 2, 6, 3)
    L.clear(1, 20, 3, 21)
    lift(L, 4, 22, 2, 8, 3).clear(4, 6, 5, 13)
    L.clear(1, 12, 3, 13)
    lift(L, 1, 14, 2, 9, 3)
    vdoor(L, 6, 20, 2)                                    # GLd (orange): into the inner bottom
    # right column, mirrored
    lift(L, 37, 28, 2, 6, 3)
    L.clear(36, 20, 38, 21)
    lift(L, 34, 22, 2, 8, 3).clear(34, 6, 35, 13)
    L.clear(36, 12, 38, 13)
    lift(L, 37, 14, 2, 9, 3)
    vdoor(L, 33, 20, 2)                                   # GRd (orange)
    # ---- the inner ring: inner top IT (rows 8-11), inner bottom IB (rows 18-21)
    L.clear(7, 8, 32, 11)
    L.r(7, 8, 10, 9).pool(8, 12, 3, 'M')                  # the moon bay at the west end
    L.lever(7, 11, 5)                                     # LY (yellow)
    L.plate(14, 11, 3)                                    # PIR (white): Luna's inner lift
    L.clear(15, 12, 16, 12).plat(15, 12, 2, 1, 0, 4, 1)   # HW (green): the hatch into the west sanctum, held from inside
    L.p(17, 11, '/').p(18, 10, '/').r(18, 11, 20, 11).r(19, 10, 19, 10).p(20, 10, '\\').p(21, 11, '\\')   # a hump over the sanctum airlock's slot
    L.r(22, 8, 25, 9)
    airlock(L, 23, 24, 10, 4, travel=5)                   # crossing three (pink)
    L.clear(26, 12, 27, 12).plat(26, 12, 2, 1, 0, 4, 5)   # HE (yellow): the hatch into the east sanctum
    L.plate(28, 11, 4)                                    # P3 (pink)
    L.clear(7, 18, 32, 21).r(7, 18, 7, 19)
    L.r(18, 18, 20, 19)
    vdoor(L, 19, 20, 0)                                   # G2 (purple)
    L.plate(24, 21, 0)                                    # P2 (purple)
    L.plate(28, 21, 3)                                    # PIL (white): Sol's inner lift
    L.r(14, 18, 16, 19).pool(14, 22, 3, 'S')              # sun water on the inner bottom's west half
    L.clear(14, 23, 16, 23).plat(14, 23, 3, 1, 0, -1, 1)  # Luna's bridge (green)
    L.r(25, 18, 27, 19).pool(25, 22, 3, 'M')              # moon water on its east half
    L.clear(25, 23, 27, 23).plat(25, 23, 3, 1, 0, -1, 1)  # Sol's bridge (green)
    L.plate(9, 21, 1).plate(22, 21, 1)                    # PIw, PIe (green): each holds the other's
    lift(L, 11, 22, 3, 10, 3, inv=True)                   # IL: waits at the top until called down
    lift(L, 30, 22, 3, 10, 3, inv=True)                   # IR, the same
    # ---- the sanctum (rows 13-16, x 15-28)
    L.clear(15, 13, 28, 16)
    L.r(18, 13, 20, 14)
    airlock(L, 18, 19, 15, 4)                             # crossing four (pink)
    L.plate(24, 16, 4)                                    # P4 (pink)
    L.plate(22, 16, 1)                                    # PGc (green): Sol holds Luna's hatch
    L.p(17, 16, 'A').p(28, 16, 'B')
    gems(L, sun=((1, 3), (3, 24), (29, 18), (12, 8), (27, 13)),
         moon=((38, 3), (36, 24), (8, 18), (9, 10), (15, 13), (29, 8)))
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
