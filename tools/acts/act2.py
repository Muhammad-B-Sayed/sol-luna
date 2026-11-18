"""Act 2: levels 12-22. See docs/level-plan.md for the brief of each level.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js <n>`.
"""
from lvdsl import Lv, level

# Define helpers that only this act needs here, not in tools/lvdsl.py.


def solid(L):
    """Start from solid rock; rooms are carved out of it."""
    return L.r(1, 1, 38, 28)


def vgate(L, x, y0, y1, g, slot_top):
    """Vertical gate cells at column x rows y0..y1 rising into an empty slot ending at slot_top.
    Like Lv.gate, but leaves the surrounding stone to the caller (the room is carved from rock)."""
    from lvdsl import PLAT_CH
    h = y1 - y0 + 1
    assert y0 - slot_top >= h, 'slot too short'
    L.clear(x, slot_top, x, y0 - 1)
    L.r(x, y0, x, y1, PLAT_CH[g])
    L.mv(g, 0, -h)
    return L


@level(12)
def the_drop():
    """The Drop. A U: start top left, doors top right. The way is down three chutes through two
    galleries to the cellar, across it, and up the east lift.

    Chain:
    1. On the top shelf two crates sit between three chutes, and each chute ends in a bin with
       a plate at a different depth: C0 in the cellar, purple (bridge B0 in the top corridor);
       C1 in gallery A, green (bridge B1); C2 in gallery B, orange (gate G2 in the cellar).
       Pushing right, the easy way, drops K1 into C1 and K2 into C2. That is the trap: the
       corridor needs both bridges, so each crate must be jumped and pushed left.
    2. G2 bars the cellar and its plate P2 is in the west room of gallery A, behind white gate
       G4. Sol holds white plate P4 back at the start; Luna drops down C1 and walks into the
       room and holds P2. (A crate in C2 would open G2 for good, but then a bridge is missing.)
    3. Sol drops down C2 and on into the cellar, runs east through G2 and lever L2 (on).
    4. Luna is shut in. Sol runs back west to lever L4 at the far end of the cellar, which
       opens G4 for good. Walking back through L2 switched it off, so Luna keeps holding P2
       until Sol has crossed L2 eastward again. Then she leaves and drops down C0.
    5. The east lift rises while a yellow plate is pressed. Its lower plate P5 is at the top of
       the east gallery, its upper plate P5b out along the corridor past bridge B0. Luna stands
       on the lift; Sol climbs the gallery and holds P5; she rides up and holds P5b, so the
       lift stays up when Sol leaves; he climbs down, she steps off, it comes down for him, she
       steps back on and it brings him up.
    6. The crate bridges carry both along the low corridor to the doors.
    """
    L = Lv('The Drop', 110, 'A crate down a chute stays on its plate for good. Read the colours before you push.')
    solid(L)
    # Four bands, seven rows apart (floors 7, 14, 21, 28) so every jump gets its full arc.
    # ---- top shelf (rows 1-6, floor 7) with three chute mouths; crates between them
    L.clear(1, 1, 20, 6)
    L.p(2, 6, 'a').p(4, 6, 'b')
    L.plate(1, 6, 3)                                       # P4 opens the west room, far below
    L.p(10, 6, 'k').p(16, 6, 'k')
    L.p(11, 2, 's')                                        # high over the first crate
    # ---- gallery A (rows 8-13, floor 14). C1 ends here in a bin. The west room behind G4 holds P2
    L.clear(1, 8, 21, 13)
    L.r(1, 8, 6, 11)                                       # the room's roof, up to the shelf
    L.clear(1, 12, 4, 13)
    vgate(L, 5, 12, 13, 3, 10)                             # G4 (white)
    L.plate(2, 13, 2)                                      # P2 (orange) holds G2 open
    L.plate(13, 14, 1).clear(14, 14, 14, 14)               # C1 bin: green
    L.p(21, 13, 's').p(21, 9, 'm')
    L.clear(16, 14, 17, 14)                                # drop into gallery B
    # ---- gallery B (rows 15-20, floor 21). C2 ends here in a bin
    L.clear(1, 15, 20, 20)
    L.plate(19, 21, 2).clear(20, 21, 20, 21)               # C2 bin: orange (the decoy)
    L.r(13, 15, 14, 15)                                    # the floor of the C1 bin
    L.p(1, 16, 's').p(5, 17, 'm')
    L.clear(10, 21, 11, 21)                                # drop into the cellar
    # ---- west cellar (rows 22-27, floor 28). C0 ends here in a bin; L4 frees the west room
    L.clear(1, 22, 17, 27).clear(18, 26, 21, 27)
    L.p(13, 27, '/##\\')                                   # a ramped hump on the way to G2
    L.plate(7, 28, 0).clear(8, 28, 8, 28)                  # C0 bin: purple
    L.lever(2, 27, 3)                                      # L4 keeps G4 open
    L.p(1, 23, 'm')
    # chutes: C0 to the cellar, C1 to gallery A, C2 to gallery B
    L.clear(7, 7, 8, 27).clear(13, 7, 14, 13).clear(19, 7, 20, 20)
    # ---- G2 and the east cellar
    vgate(L, 22, 26, 27, 2, 24)
    L.clear(23, 26, 23, 27).lever(23, 27, 2)               # L2 keeps G2 open
    L.clear(24, 22, 38, 27)
    # ---- lift shaft (x 24-26) and the low corridor (rows 5-6)
    L.clear(24, 7, 26, 27)
    L.cells(24, 28, 26, 28, 5).mv(5, 0, -21)
    L.clear(24, 5, 38, 6)
    L.plate(32, 6, 5)                                      # P5b, past the purple bridge
    L.clear(29, 7, 31, 7).clear(34, 7, 36, 7)              # bridge holes drop to the gallery
    L.clear(29, 3, 31, 4).cells(29, 3, 31, 3, 0).mv(0, 0, 4)    # B0 comes down from the ceiling
    L.clear(34, 3, 36, 4).cells(34, 3, 36, 3, 1).mv(1, 0, 4)    # B1
    L.clear(37, 2, 38, 6)
    L.p(37, 6, 'A').p(38, 6, 'B')
    # ---- east gallery (x 28-38, rows 8-27): a zigzag climb from the cellar, each side's ledges
    # seven rows apart so every take-off has its full arc. Falling through a hole lands here.
    L.clear(28, 8, 38, 21)
    L.r(35, 25, 38, 27)                                    # S1 (stand 24)
    L.r(28, 21, 30, 21)                                    # S2 (stand 20)
    L.r(35, 18, 38, 18)                                    # S3 (stand 17)
    L.r(28, 14, 30, 14)                                    # S4 (stand 13), P5 drives the lift
    L.plate(29, 13, 5)
    L.p(37, 13, 's').p(28, 20, 'm').p(38, 17, 's').p(38, 24, 'm')
    return L


@level(13)
def switchback():
    """Switchback. A figure of eight: two loops through the left and right halves that meet at
    the tower in the centre. The tower is the only way up. Each loop goes one way round: up the
    tower, out along the top arc, down the shaft and two legs beside the core, home along the
    bottom. On a top arc you choose: turn back, so the lever ends the way you last walked, or
    go round.

    Walking right through a lever turns it on, walking left turns it off.
    Luna's door sits in a pit on the top-left arc under a purple hatch. Sol's door is at the end
    of a low sun tunnel at the bottom left, behind green gate GD. Out on each top arc a pool
    under a low ceiling keeps the loop to one player (sun on the left, moon on the right), then
    the lever: purple LP on the left, green LG on the right, both off.

    Every floor is seven rows above the next, so each climb gets the full jump: the tower's four
    floors are joined by two-step stairs under its hatches.

    Chain:
    1. The players start apart, at the tops of the two pairs of legs. Sol walks down the left
       legs, through orange lever LO (on). Luna walks down the right legs; orange gate GO waits
       for Sol's LO, purple-inverse gate GP is open while purple is off.
    2. The tower has three hatches (pink, white, yellow), each open while a plate of its colour
       is pressed, one below it and one above. The players leapfrog up past all three.
    3. Purple gate GT shuts the top-right arc. Sol walks west past LP and turns back east:
       purple on, GT open (and Luna's hatch opens; GP shuts).
    4. Luna goes round the right loop: east through GT and LG (green on: GD opens), down the
       legs. On the last leg GO has opened for her, but GP stops her.
    5. Sol goes round the left loop: west through LP (purple off: GP opens, GT and Luna's hatch
       shut), down the legs, home. Luna goes on through GP, home.
    6. The same leapfrog up the tower. Sol turns back through LP once more: purple on, and
       Luna drops into her pit. Then Sol goes round the left loop a last time (her hatch shuts
       over her) and down to his door through GD.
    """
    L = Lv('Switchback', 105, 'Walk right through a lever to switch it on, left to switch it off. Which way you go round decides how it ends.')
    solid(L)
    # ---- top band. The left arc and the tower top share floor 7; the right arc is one higher
    # (floor 6), so the yellow hatch's slot runs under it.
    L.clear(1, 1, 25, 6).clear(26, 1, 38, 5)
    # left arc: shaft x1, turn x2, LP x3, sun pool x4-6 under a low ceiling, Luna's pit x9-10
    L.r(3, 1, 6, 4)                                        # low ceiling: a 2-high tunnel over the pool
    L.pool(4, 7, 3, 'S')
    L.lever(3, 6, 0)                                       # LP
    L.clear(1, 7, 1, 7)                                    # the shaft
    L.clear(9, 8, 10, 8).p(9, 8, 'B')                      # Luna's door pit
    L.cells(9, 7, 10, 7, 0).mv(0, 2, 0).clear(11, 7, 12, 7)   # purple hatch over it, slot beside
    # right arc: GT (purple) in a low tunnel over the moon pool, LG, the shaft
    L.r(30, 1, 35, 3)
    L.clear(31, 2, 31, 3).plat(31, 4, 1, 2, 0, -2, 0)      # GT
    L.pool(32, 6, 3, 'M')
    L.lever(35, 5, 1)                                      # LG
    L.clear(37, 6, 38, 7)                                  # the shaft
    # ---- the tower (x 14-25): floors 28, 21, 14 and 7, each with a hatch and stairs under it
    L.clear(14, 8, 25, 13).clear(14, 15, 25, 20).clear(14, 22, 25, 27)
    hatch(L, 22, 21, 4, 4, 4)                              # H1 (pink) slides east under the right legs
    hatch(L, 14, 14, 4, -4, 3)                             # H0 (white) slides west under the left legs
    hatch(L, 22, 7, 4, 4, 5)                               # H2 (yellow) slides east under the right arc
    L.r(22, 24, 24, 24)                                    # a ledge under H1; the way in from the east runs beneath it
    L.r(16, 19, 17, 20).r(14, 17, 15, 20)                  # stairs under H0
    L.r(22, 12, 23, 13).r(24, 10, 25, 13)                  # stairs under H2
    L.plate(14, 27, 4)                                     # P1 (pink), below H1 and far from it
    L.plate(21, 20, 4)                                     # P2 (pink), above H1
    L.plate(19, 20, 3)                                     # P5 (white), below H0
    L.plate(18, 13, 3)                                     # P6 (white), above H0
    L.plate(20, 13, 5)                                     # P3 (yellow), below H2
    L.plate(20, 6, 5)                                      # P4 (yellow), above H2
    # ---- left half: leg A east (LO), leg B east, the bottom arc with Sol's sun tunnel
    L.clear(1, 8, 7, 13)
    L.lever(3, 13, 2)                                      # LO (orange)
    L.clear(5, 14, 6, 14)
    L.clear(1, 15, 9, 20)
    L.clear(8, 21, 9, 21)
    L.clear(1, 22, 13, 27).r(1, 22, 7, 25).pool(2, 28, 3, 'S')
    vgate(L, 6, 26, 27, 1, 24)                             # GD (green) shuts the tunnel
    L.pool(11, 28, 2, 'S')                                 # sun water where Sol lands
    L.p(1, 27, 'A')
    # ---- right half: leg A' west, leg B' east through GO and GP, the bottom arc
    L.clear(30, 8, 38, 13)
    L.clear(30, 14, 31, 14)
    L.clear(30, 15, 38, 20)
    L.r(32, 15, 34, 18)
    vgate(L, 33, 19, 20, 2, 17)                            # GO (orange)
    L.r(35, 15, 37, 18).clear(36, 17, 36, 18)
    L.plat(36, 19, 1, 2, 0, -2, 0, inv=True)               # GP: open only while purple is off
    L.clear(37, 21, 38, 21)
    L.clear(26, 23, 38, 27).clear(30, 22, 38, 22)
    L.p(26, 27, '/##\\')                                   # a hump into the tower's foot
    L.p(1, 13, 'a').p(38, 13, 'b')
    # gems: corners of the arcs and the legs' dead ends, jumps in the tower
    L.p(2, 2, 's').p(7, 9, 's').p(2, 16, 's').p(11, 23, 's').p(19, 23, 's')
    L.p(36, 2, 'm').p(33, 9, 'm').p(31, 16, 'm').p(33, 23, 'm').p(24, 2, 'm')
    return L


@level(14)
def carry_the_weight():
    """Carry the Weight. A diagonal climb from bottom left to top right. The crate rides the
    diagonal; the players climb their own routes beside it (a stair tower at the top left, a
    gallery and a column at the bottom right). Crates can't climb, so every rise is a lift,
    and riders can't drive, so every ride needs the partner on a plate.

    The plates are far from what they drive, at the top of the tower and the bottom of the
    gallery, so the operator crosses the room for every ride. Luna starts high in the top
    corridor, cut off from the doors by the gap; Sol starts at the bottom with the crate.

    Chain:
    1. Luna drops down to the bottom of the gallery and holds purple plate P1; Sol and the
       crate ride purple lift L1 up to the middle floor.
    2. Pink gate G7 shuts the bottom tunnel; its plate P7 is on the middle floor. Sol leaves
       the crate on P7 as a weight, and Luna runs west through the tunnel and up the tower.
    3. Green gate G2 bars the middle floor. Luna holds its plate P2 at the top of the tower;
       Sol pushes the crate off P7, over lever L2 (which keeps G2 open) and through G2 onto
       white lift L3.
    4. Roles swap. Luna comes down and stands on L3 with the crate. Sol runs back west and up
       the tower to white plate P3; Luna and the crate ride up to the shelf.
    5. Purple floor gate G8 bars the shelf. Its plate is P1 again, at the bottom of the
       gallery: Sol runs down to it (L1 rises empty), and Luna pushes the crate through onto
       the orange ferry and stands behind it.
    6. Sol runs back up the tower to orange plate P4 in the pocket off its top; the ferry
       carries Luna and the crate over the gap.
    7. Luna pushes the crate into the socket: yellow plate P5 lowers bridge B5 over the gap
       in the top corridor, and keeps it down.
    8. Pink gate G6 bars the corridor. Sol climbs to the shelf and holds pink plate P6a; Luna
       passes G6 and holds P6b; Sol passes. Both cross B5 to the doors.
    """
    L = Lv('Carry the Weight', 105, 'A crate cannot climb, and a lift needs someone on its plate. Take the crate all the way up.')
    solid(L)
    # Four bands seven rows apart: stage A and the gallery foot on floor 28, the middle floor on
    # 21, the shelf on 14, the corridor and the tower top on 7. Each lift climbs one band.
    # ---- the tower (x 1-10): floors 28, 21, 14, 7 with a hole in each and stairs under it
    L.clear(1, 1, 10, 6).clear(1, 8, 6, 13).clear(7, 8, 10, 13)
    L.clear(1, 15, 10, 20).clear(1, 22, 13, 27)
    L.clear(1, 7, 4, 7)                                    # hole into the tower top
    L.clear(7, 14, 10, 14)                                 # hole into band 2
    L.clear(1, 21, 4, 21)                                  # hole into band 3
    L.r(4, 26, 4, 27).r(1, 24, 3, 27)                      # stairs in stage A
    L.r(7, 19, 7, 20).r(8, 17, 10, 20)                     # stairs on floor 21
    L.r(4, 12, 4, 13).r(1, 10, 3, 13)                      # stairs on floor 14
    L.plate(6, 6, 1)                                       # P2 (green), top of the tower
    L.plate(9, 6, 3)                                       # P3 (white), top of the tower
    # the pocket off the tower top, with P4 at its far end
    L.clear(11, 1, 19, 6)
    L.plate(19, 6, 2)                                      # P4 drives the ferry
    # ---- stage A (bottom left) and purple lift L1 in the floor at x 11-13
    L.p(6, 27, 'a').p(9, 27, 'k')
    L.clear(11, 21, 13, 27).cells(11, 28, 13, 28, 0).mv(0, 0, -7)
    # ---- the bottom tunnel under the middle floor, to the gallery foot; G7 (pink) shuts it
    L.clear(14, 22, 24, 27)
    L.r(21, 22, 23, 25)
    vgate(L, 22, 26, 27, 4, 24)
    # ---- stage B, the middle floor (rows 15-20): P7, lever L2 and gate G2, then white lift L3
    L.clear(11, 15, 24, 20)
    L.plate(16, 20, 4)                                     # P7: a weight here opens the tunnel
    L.lever(18, 20, 1)                                     # L2, just before G2
    L.r(19, 15, 21, 18)
    vgate(L, 20, 19, 20, 1, 17)                            # G2 (green)
    L.clear(22, 14, 24, 20).cells(22, 21, 24, 21, 3).mv(3, 0, -7)   # L3 (white)
    # ---- the gallery (x 25-38): its middle band joins stage B; a hole by L3 leads down
    L.clear(25, 15, 34, 20).clear(25, 22, 38, 27)
    L.r(31, 18, 33, 20)                                    # a block under the ferry gap: the way up to the shelf
    L.clear(26, 21, 29, 21)
    L.r(26, 24, 27, 27).r(28, 26, 29, 27)                  # stairs under the hole
    L.plate(34, 27, 0)                                     # P1 drives L1 and G8, far from both
    # ---- the shelf (rows 8-13, floor 14): G8, the ferry over a gap, the socket, a step up
    L.clear(22, 8, 38, 13)
    L.floorgate(28, 12, 2, 0)                              # G8 (purple): sinks while P1 is held
    L.cells(29, 14, 31, 14, 2).mv(2, 3, 0)                 # the ferry
    L.clear(32, 14, 34, 14)
    L.clear(35, 14, 36, 14).plate(36, 14, 5)              # the socket: P5
    L.r(37, 10, 38, 13).plate(38, 9, 4)                    # the step to the corridor, P6a on it
    # ---- the corridor (rows 1-6, floor 7): doors at the west end, B5 under a low ceiling, G6
    L.clear(24, 1, 38, 6)
    L.clear(36, 7, 38, 7)                                  # the way down to the shelf
    L.r(27, 1, 33, 4)
    L.clear(29, 7, 32, 7).cells(29, 4, 32, 4, 5).mv(5, 0, 3)   # B5 comes down into the gap
    vgate(L, 28, 5, 6, 4, 3)                               # G6 (pink) at the tunnel's west end
    L.plate(24, 6, 4)                                      # P6b, past G6 and the gap
    L.p(26, 6, 'A').p(25, 6, 'B').p(35, 6, 'b')
    # gems
    L.p(15, 2, 's').p(9, 2, 's').p(6, 9, 's').p(36, 23, 's').p(26, 17, 's')
    L.p(37, 2, 'm').p(19, 24, 'm').p(5, 17, 'm').p(26, 10, 'm').p(33, 9, 'm')
    return L


@level(15)
def clockwork():
    """Clockwork. A control room in the centre with three levers, and a ring around it: the
    bottom band, a purple lift in the left shaft, the top band, an orange lift in the right
    shaft. Both lifts rest at the top and go down while their colour is on. Everything on the
    ring is worked from the control room. Walking through a lever flips it; jumping over it
    leaves it alone.

    Chain:
    1. Both start in the control room. Its door GC (pink) opens while pink plate PC, at the room's
       far end from the door, is held. Sol holds it; Luna walks out.
    Yellow gate GY on the bottom band opens only while the operator stands on yellow plate PY at
    the west end of the control room, so the operator must leave the levers to let a runner by.

    2. Luna runs the ring clockwise while Sol works the levers: purple on brings the left lift
       down to her and purple off takes her up; green on opens gate GG1 on the top band and
       green off opens the green-inverse gate GG2 after it; orange on takes her down the right
       shaft and orange off sends the lift back up, which opens the orange-inverse gate GO on
       her way home along the bottom (the purple-inverse gate GP is already open); Sol stands
       on PY to let her through GY.
    3. Halfway: Luna walks through pink lever K on the landing, which keeps GC open. Sol comes
       out (jumping over K, or he shuts the door again) and Luna goes in. They swap.
    4. Sol runs the ring the other way while Luna works the levers: orange on brings the right
       lift down for him and orange off takes him up; GG2 is open, green on opens GG1; purple
       on takes him down the left shaft; home up the stairs. Luna stood on PY early on, to let
       him east through GY.
    5. Both to the doors on the landing.
    """
    L = Lv('Clockwork', 135, 'One of you works the levers, the other runs. Walk through a lever to flip it, jump over it to leave it alone.')
    solid(L)
    # Four bands, seven rows apart: the top of the ring (floor 7), three galleries (14), the
    # control room and landing (21), the bottom of the ring (28). The lifts run the full height.
    # ---- top band (rows 1-7 over the lifts, floor 7 between them): GG1 and GG2 in 2-high doorways,
    # and a hole down into each gallery
    L.clear(1, 1, 38, 6).clear(1, 7, 3, 7).clear(36, 7, 38, 7)
    L.r(12, 1, 14, 4)
    vgate(L, 13, 5, 6, 1, 3)                               # GG1 (green)
    L.r(25, 1, 27, 4).clear(26, 3, 26, 4)
    L.plat(26, 5, 1, 2, 0, -2, 1, inv=True)               # GG2 (green-inverse)
    L.clear(6, 7, 9, 7).clear(17, 7, 20, 7).clear(30, 7, 34, 7)
    # ---- the two lifts: purple on the left (x 1-3), orange on the right (x 36-38); both rest at
    # the top, capping their shafts, and go down while their colour is on
    L.clear(1, 9, 3, 28).cells(1, 8, 3, 8, 0).mv(0, 0, 20)
    L.clear(36, 9, 38, 28).cells(36, 8, 38, 8, 2).mv(2, 0, 20)
    # ---- galleries under the top band, each with two steps back up under its hole
    L.clear(5, 8, 11, 13).r(8, 12, 9, 13).r(6, 10, 7, 13)
    L.clear(15, 8, 24, 13).r(17, 12, 18, 13).r(19, 10, 20, 13)
    L.clear(27, 8, 34, 13).r(31, 12, 32, 13).r(33, 10, 34, 13)
    # ---- bottom band (rows 22-27, floor 28) with three gates and three pools
    L.clear(4, 22, 35, 27)
    L.r(19, 22, 21, 25).clear(20, 24, 20, 25)
    L.plat(20, 26, 1, 2, 0, -2, 2, inv=True)              # GO (orange-inverse)
    L.r(24, 22, 26, 25)
    vgate(L, 25, 26, 27, 5, 24)                            # GY (yellow), held from the control room
    L.r(30, 22, 32, 25).clear(31, 24, 31, 25)
    L.plat(31, 26, 1, 2, 0, -2, 0, inv=True)              # GP (purple-inverse)
    L.pool(14, 28, 2, 'S').pool(27, 28, 2, 'M').pool(34, 28, 1, 'S')
    # ---- stairs from the bottom band up to the landing: two floating steps under an opening
    L.clear(5, 15, 9, 21)
    L.r(5, 25, 6, 25).r(8, 23, 9, 23)
    # ---- landing (x 10-12, floor 21) with the doors and lever K
    L.clear(10, 15, 12, 20)
    L.p(10, 20, 'A').p(11, 20, 'B')
    L.lever(12, 20, 4)                                     # K keeps GC open
    # ---- control room (x 16-24, rows 15-20, floor 21) behind the door GC
    L.clear(13, 19, 15, 20)
    vgate(L, 14, 19, 20, 4, 17)                            # GC (pink), the door
    L.clear(16, 15, 24, 20)
    L.lever(17, 20, 0).lever(19, 20, 1).lever(21, 20, 2)   # purple, green, orange
    L.plate(24, 20, 4)                                     # PC, at the far end from the door
    L.plate(16, 20, 5)                                     # PY holds GY open
    L.p(18, 20, 'a').p(20, 20, 'b')
    # gems
    L.p(2, 2, 's').p(17, 16, 's').p(15, 9, 's').p(5, 10, 's').p(27, 9, 's')
    L.p(37, 2, 'm').p(21, 16, 'm').p(23, 9, 'm').p(11, 9, 'm').p(29, 10, 'm')
    return L


# ---- helpers for rooms 18-22 -------------------------------------------------------------

def vdoor(L, x, y0, g, inv=False, travel=2):
    """A 2-high gate in cells (x, y0..y0+1) that rises `travel` cells into a slot above it.
    Normal: shut at rest, open while group g is active. inv: open at rest, shuts while g is active.
    The caller keeps stone on both sides of the slot."""
    L.clear(x, y0 - travel, x, y0 + 1)
    L.plat(x, y0, 1, 2, 0, -travel, g, inv)
    return L


def airlock(L, xa, xb, y0, g, travel=6):
    """Two gates side by side in a 2-high doorway at rows y0..y0+1, with no room to stand between.
    The gate at xa opens while g is active; the gate at xb is open at rest and shuts while g is
    active, slowly (it falls `travel` cells). Nobody can pass while the control rests either way.
    The only way through is to run the moment the partner switches g on, before xb comes down."""
    vdoor(L, xa, y0, g)
    vdoor(L, xb, y0, g, inv=True, travel=travel)
    return L


def hatch(L, x, y, w, dx, g, inv=False):
    """A w-wide hatch in floor row y at x..x+w-1 that slides dx cells sideways into a pit in the
    same row. Normal: shut at rest, open while g is active; inv: the reverse. The caller puts stone
    under the pit."""
    L.clear(x, y, x + w - 1, y)
    L.clear(x + dx, y, x + dx + w - 1, y)
    L.plat(x, y, w, 1, dx, 0, g, inv)
    return L


@level(18)
def closing_time():
    """Closing Time. A 3x3 honeycomb of chamfered cells with a doorway in the walls between them.
    Sol starts in a pocket in the bottom left, Luna in the bottom right; both doors stand on a dais
    in the top centre. Each player snakes through eight of the nine cells: they swap bottom
    corners, climb each other's columns, swap again through the centre, and come together at the
    top. Colours are columns: green works the left hatches, white the right ones, so each climb is
    opened by the partner standing in the other column. Several controls open one doorway and shut
    another, and the bottom doorway is an airlock: two gates with no room between them, passed
    only by running the moment the partner steps on purple.

    Chain:
    1. Luna holds orange plate PO1 at the far end of her cell: Sol's pocket gate GS opens.
    2. Sol holds orange plate PB: gate GB opens and Luna walks into the bottom centre.
    3. Luna holds purple plate P0: airlock X swaps and Sol runs under the closing gate.
    4. Sol holds P0 and Luna runs the airlock the other way, into Sol's old cell.
    5. Luna holds PB: GB opens and Sol walks on into Luna's old cell.
    6. Sol holds green plate PG: hatch HB opens and Luna climbs into the west cell.
    7. Luna holds white plate PW: hatch HC opens and Sol climbs into the east cell.
    8. Luna walks into the centre and holds yellow plate P5: DR opens and Sol comes in. The same
       plate shuts DL, the west doorway, behind her.
    9. Sol takes over P5 and Luna goes out east through DR. When Sol steps off, DR shuts and DL
       opens, and he goes west.
    10. Luna holds green plate PG2 in the east cell: hatch HL opens and Sol climbs to the top left.
    11. Sol holds white plate PW2 there: hatch HR opens and Luna climbs to the top right.
    12. The top row is the last swap. Pink plate PP in the top left opens ZR (top right to top
        centre) and shuts ZL (top left to top centre). Sol holds it and Luna comes into the top
        centre.
    13. Sol steps off: ZR shuts, ZL opens, and they pass each other in the doorway.
    14. Luna holds PP and Sol goes on through ZR into the top right.
    15. His door is in a chamber behind white gate GW. Luna steps across to PW2: GW opens and
        Sol goes in. She steps off to her door beside it on the block in the top left.
    """
    L = Lv('Closing Time', 90, 'Several controls open one door and shut another. Where two gates stand together, run the moment your partner moves.')
    solid(L)
    # cells: columns x 1-11, 14-24, 27-38; rows 1-8, 10-18, 20-27; walls 2 thick, slabs 1 thick.
    # Every climb to a hatch is a low step (with the cell's full headroom over it) and then a
    # ledge right under the hatch hole, so each take-off has six free rows above it.
    for x0, x1 in ((1, 11), (14, 24), (27, 38)):
        L.clear(x0, 1, x1, 8).clear(x0, 10, x1, 18).clear(x0, 20, x1, 27)

    # ---- bottom left: Sol's pocket, PB, a step and a ledge under HB, airlock X
    L.r(1, 20, 3, 21).r(3, 22, 3, 25).r(4, 23, 6, 25)    # the pocket's roof (6 free rows over the spawn); its top under HB is the ledge
    L.p(2, 27, 'a')
    vdoor(L, 4, 26, 2)                                    # GS (orange)
    L.plate(10, 27, 2)                                    # PB
    L.r(8, 26, 9, 27)                                     # a low step (stand 25)
    hatch(L, 4, 19, 3, -3, 1)                             # HB (green) slides west into a closed slot
    L.r(1, 18, 3, 18)
    L.r(11, 20, 11, 25)
    L.clear(12, 26, 14, 27)
    L.r(14, 20, 14, 25)
    airlock(L, 12, 13, 26, 0)                             # X (purple)

    # ---- bottom centre: P0, gate GB
    L.plate(23, 27, 0)                                    # P0
    L.p(15, 27, '/#\\')                                   # a hump
    L.r(18, 26, 20, 27)                                   # a block in the middle (stand 25)
    L.r(15, 20, 16, 20).r(23, 20, 24, 20)
    L.clear(25, 26, 26, 27)
    vdoor(L, 25, 26, 2)                                   # GB (orange)

    # ---- bottom right: Luna's start, PO1, PG, a step and a floating ledge under HC
    L.p(32, 27, 'b')
    L.plate(38, 27, 2)                                    # PO1
    L.plate(36, 27, 1)                                    # PG
    L.r(34, 26, 35, 27)                                   # a low step (stand 25)
    L.r(29, 23, 31, 23)                                   # the ledge under HC (stand 22)
    hatch(L, 29, 19, 3, -3, 3)                            # HC (white) slides west into a closed slot
    L.r(27, 20, 28, 20)

    # ---- west: PW, a step and a ledge under HL, DL
    L.r(10, 17, 11, 18)                                   # block up to the doorway (stand 16)
    L.r(8, 16, 9, 18)                                     # a step (stand 15)
    L.r(5, 12, 7, 12)                                     # the ledge under HL (stand 11)
    L.plate(7, 18, 3)                                     # PW
    hatch(L, 5, 9, 3, -3, 1)                              # HL (green)
    L.r(2, 10, 4, 10)
    L.clear(12, 15, 13, 16)
    vdoor(L, 13, 15, 5, inv=True)                         # DL (yellow-inverse)

    # ---- centre: P5 between DL and DR
    L.r(14, 17, 15, 18).r(23, 17, 24, 18)                 # blocks up to the doorways (stand 16)
    L.plate(17, 18, 5)                                    # P5
    L.r(18, 16, 20, 16)                                   # a shelf (stand 15)
    L.clear(25, 15, 26, 16)
    vdoor(L, 25, 15, 5)                                   # DR (yellow)

    # ---- east: PG2, a step and a ledge under HR
    L.r(27, 17, 28, 18)                                   # block up to the doorway (stand 16)
    L.r(35, 16, 36, 18)                                   # a step (stand 15)
    L.r(32, 12, 34, 12)                                   # the ledge under HR (stand 11)
    L.plate(38, 18, 1)                                    # PG2
    hatch(L, 32, 9, 3, -3, 3)                             # HR (white) slides west under the top right's block
    L.r(29, 10, 31, 10)

    # ---- top left: PW2, Luna's door, PP, gate ZL
    L.r(11, 1, 11, 6)
    L.r(1, 7, 4, 8).plate(1, 6, 3)                        # PW2 on a block (stand 6) over HL's slot
    L.p(4, 6, 'B')                                        # Luna's door on the block
    L.plate(10, 8, 4)                                     # PP
    L.clear(12, 7, 14, 8).r(12, 1, 14, 6)
    vdoor(L, 13, 7, 4, inv=True)                          # ZL (pink-inverse)

    # ---- top centre: the crossing room
    L.r(17, 7, 24, 8)                                     # dais (stand 6)
    L.r(15, 1, 16, 1)
    L.r(25, 1, 26, 8).clear(25, 5, 26, 6)
    vdoor(L, 26, 5, 4)                                    # ZR (pink)

    # ---- top right: a block up to ZR over HR's slot, the hole from HR, Sol's door chamber
    L.r(27, 7, 31, 8).r(27, 1, 27, 4)                     # block (stand 6)
    L.p(38, 8, 'A')
    L.r(36, 5, 36, 6).r(37, 1, 38, 4).r(38, 5, 38, 6)
    vdoor(L, 37, 7, 3)                                    # GW (white): Sol's door chamber
    # gems: jumps from the steps and blocks, and the cells' far corners
    L.p(8, 21, 's').p(20, 22, 's').p(19, 11, 's').p(38, 13, 's').p(20, 2, 's')
    L.p(28, 22, 'm').p(18, 22, 'm').p(11, 12, 'm').p(21, 13, 'm').p(35, 4, 'm')
    return L


@level(19)
def crate_relay():
    """Crate Relay. Two wings, each three rooms high, either side of a central chasm with a shade
    pool at the bottom. Low down a ferry crosses the chasm; halfway up a shade-floored tunnel runs
    through a slab, with a pusher at its east end; at the top a bridge in two halves can come down.
    Each crate starts in the wrong wing and its socket is high in the other one. Nobody can carry a
    crate across: it goes over on the ferry or is shoved through the tunnel, and every lift ride
    needs the partner on its plate in the other wing.

    Chain:
    1. They start on the wrong sides. Luna holds purple plate PF: the ferry slides east to Sol, and
       when she steps off it brings him back west.
    2. Sol holds PF and Luna rides the ferry east.
    3. Sol pushes crate K1 onto the ferry and holds PF again: K1 crosses. Luna pushes it off and
       onto green lift L2.
    4. Sol holds green plate PG in the west: L2 lifts Luna and K1 to the east middle room.
    5. Luna pushes K1 into socket S1 (yellow): the east half of the bridge comes down.
    6. Luna pushes crate K2 off the west edge of her room: it drops into the tunnel.
    7. Sol climbs to the west middle room and walks through orange lever LO: the pusher shoves K2
       through the tunnel, and it drops into his room.
    8. White is the upper ways. Sol holds white plate PW2 under the tunnel's end: hatch HW opens (and L1 rises empty) and
       Luna climbs to the east top room.
    9. Sol steps off, pushes K2 onto white lift L1 and stands behind it. Luna holds white plate PW:
       L1 lifts Sol and K2 to the west top room.
    10. Sol pushes K2 into socket S2 (pink): the west half of the bridge comes down.
    11. They cross the bridge to their doors, Sol east, Luna west.
    """
    L = Lv('Crate Relay', 110, 'A crate cannot cross on its own legs. Send it over, then go round to meet it.')
    solid(L)
    # Every room has six rows of air: bottom rooms on floor 27, the west middle room on 20, the
    # east middle room on 14, the top rooms on 7. The bridge runs in a 2-high tunnel, so nobody
    # can jump the half that is still up.
    # ---- west wing
    L.clear(1, 21, 12, 26)                                # bottom room (floor 27)
    L.p(6, 26, 'b').p(10, 26, 'k')
    L.plate(5, 26, 0)                                     # PF
    L.plate(8, 26, 1)                                     # PG
    L.r(1, 23, 2, 23)                                     # a ledge under the hole (stand 22)
    L.clear(1, 14, 11, 19).clear(12, 15, 12, 19).clear(13, 18, 20, 19)   # middle room (floor 20), reaching under the tunnel
    L.clear(1, 20, 2, 20)                                 # hole up from the bottom room
    L.plate(16, 19, 3)                                    # PW2, in the nook under the tunnel: opens HW (and lifts L1)
    L.lever(11, 19, 2)                                    # LO
    L.clear(3, 7, 6, 19).cells(3, 20, 6, 20, 3).mv(3, 0, -13)   # L1 (white)
    L.clear(1, 1, 12, 6)                                  # top room (floor 7)
    L.clear(1, 7, 2, 7).plate(1, 7, 4)                    # S2 (pink)
    L.clear(8, 7, 11, 8).p(9, 8, 'B')                     # Luna's door down in a dip
    # ---- chasm: the bridge tunnel on top, a shade-floored void under it, the slab with the crate
    # tunnel through it, and the ferry's run underneath
    L.clear(13, 5, 24, 6)                                 # the bridge tunnel (2 high)
    L.cells(13, 4, 18, 4, 4).mv(4, 0, 3)                  # bridge, west half (pink)
    L.cells(19, 4, 24, 4, 5).mv(5, 0, 3)                  # bridge, east half (yellow)
    L.clear(13, 7, 23, 13).clear(24, 7, 24, 7).pool(13, 14, 11, 'X')   # the void under the bridge, shade at its foot
    L.clear(24, 8, 24, 13)                                # a perch on the void's lip, over the chute
    L.clear(13, 15, 27, 16).pool(13, 17, 14, 'X')         # the crate tunnel and the pusher's pocket
    L.clear(25, 14, 26, 14)                               # the chute
    L.plat(27, 15, 1, 2, -14, 0, 2)                       # the pusher (orange)
    L.clear(13, 21, 26, 27)                               # under the slab: the ferry's run
    L.pool(13, 28, 14, 'X')
    L.cells(13, 27, 15, 27, 0).mv(0, 11, 0)               # the ferry
    L.r(16, 21, 17, 23).r(22, 21, 23, 23)                 # two stalactites over the run
    # ---- east wing
    L.clear(27, 21, 38, 26)                               # bottom room (floor 27)
    L.clear(34, 15, 36, 21).clear(37, 16, 38, 21)        # a tall alcove over the east end
    L.r(35, 22, 38, 22)                                   # Sol starts on a terrace in it (stand 21)
    L.p(36, 21, 'a')
    L.clear(30, 14, 33, 26).cells(30, 27, 33, 27, 1).mv(1, 0, -13)   # L2 (green)
    L.clear(25, 8, 38, 13)                                # middle room (floor 14)
    L.p(28, 13, 'k')
    L.clear(37, 14, 38, 14).plate(38, 14, 5)              # S1 (yellow), on the wall side
    L.r(28, 11, 30, 11)                                   # the ledge under HW (stand 10)
    L.clear(25, 1, 38, 6)                                 # top room (floor 7)
    L.r(36, 6, 38, 6).p(37, 5, 'A')                       # Sol's door on a dais (stand 5)
    L.plate(34, 6, 3)                                     # PW
    hatch(L, 28, 7, 3, 3, 3)                              # HW (white): the way up from the middle room
    L.r(31, 8, 33, 8)
    # gems
    L.p(37, 26, 's').p(20, 19, 's').p(35, 17, 's').p(37, 2, 's')
    L.p(19, 22, 'm').p(24, 10, 'm').p(36, 11, 'm').p(27, 3, 'm').p(2, 3, 'm')
    return L


@level(20)
def undertow():
    """Undertow. Solid rock threaded with low tunnels that jog up and down through chimneys. Each
    tunnel is two cells high and floored in places with sun or moon water, so only one of them
    can use it: sun tunnels are Sol's, moon tunnels Luna's. The tunnels run between six chambers
    down the two side walls, and in the middle the upper two and the lower two cross in two
    shared chambers. The doors are in the centre room. Sol starts shut in the bottom left, Luna
    shut in an alcove top right, and both go round the screen the same way, half a lap apart, so
    every gate one of them meets is opened by the other, far away.

    Chain:
    1. Luna holds white plate PW0 in her alcove: Sol's gate opens. Just outside it he holds green
       plate PG0: Luna's gate opens.
    2. Luna takes the top moon tunnel west and Sol the bottom sun tunnel east, each to a
       crossing chamber.
    3. Luna holds pink plate PK1 in the top crossing: Sol's gate in the bottom crossing opens.
    4. Sol, through it, holds yellow plate PY1: Luna's gate in the top crossing opens.
    5. Sol holds green plate PG in the bottom right chamber: the hatch in the top left chamber
       opens and Luna drops to the west middle chamber.
    6. Luna holds purple plate PP: the purple lift carries Sol up to the east middle chamber.
    7. Luna holds orange plate PO1: the orange lift comes down from the top right; Sol steps on
       and when she steps off it carries him up.
    8. Sol holds white plate PW1: the hatch in the west middle chamber opens and Luna drops to
       the bottom left.
    9. Now they swap halves. Sol's way into the upper sun tunnel is shut by a green gate: Luna
       holds green plate PG1 in the bottom left and he goes in. Then Sol takes the upper sun
       tunnel west and Luna the lower moon tunnel east.
    10. Luna holds pink plate PK2 in the bottom crossing: Sol's gate in the top crossing opens.
    11. Sol, through it, holds yellow plate PY2: Luna's gate in the bottom crossing opens.
    12. Luna holds PG: Sol drops to the west middle chamber.
    13. Sol holds PP: the purple lift carries Luna to the east middle chamber.
    14. Sol's gate into the centre is white, and the only white plate left is up in NE. Sol holds
        PO1 again: the orange lift comes down for Luna, and when he steps off it takes her up.
    15. Luna holds PW1: Sol goes through his gate into the centre.
    16. Luna steps onto the lift and Sol holds orange plate PO2 in the centre: the lift brings
        her down, and the same orange opens her gate into the centre.
    17. Sol's door is in an alcove under the east ledge, behind a pink gate, and its plate PK3
        is on the west ledge. Luna crosses the room to hold it while Sol goes in, then crosses
        back to her own door on the east ledge.
    """
    L = Lv('Undertow', 110, 'Sun water is safe for Sol and moon water for Luna. Every gate you meet is opened by your partner, far away.')
    solid(L)
    # ---- top band: NW chamber, M1W/S2W tunnels, top crossing JT, M1E/S2E tunnels, NE alcove and chamber
    L.clear(1, 1, 7, 9)                                   # NW (seven rows: full headroom off the tunnel ledge)
    L.r(6, 7, 7, 7)                                       # ledge where the moon tunnel comes in (stand 6)
    hatch(L, 4, 10, 3, -3, 1)                             # hatch (green): NW down to the west middle
    L.r(1, 11, 3, 11)
    L.clear(12, 4, 15, 5).pool(12, 6, 3, 'M')             # M1W, upper part
    L.clear(11, 4, 11, 6).clear(8, 5, 10, 6)              # M1W, lower part (a step down going west)
    L.clear(8, 8, 15, 9).pool(10, 10, 3, 'S')             # S2W
    L.plate(9, 9, 5)                                      # PY2
    L.clear(16, 1, 23, 9)                                 # JT
    L.r(20, 9, 21, 9)                                     # a low step in its floor
    L.floorgate(15, 4, 2, 5)                              # Luna's gate out of JT (yellow), sinks into the floor
    L.r(16, 6, 17, 7)                                     # west ledge (stand 5), open to the roof
    L.r(22, 4, 23, 4).plate(23, 3, 4)                     # PK1 where the moon tunnel comes in (stand 3), out of Sol's reach
    L.r(22, 7, 23, 7)                                     # where the sun tunnel comes in (stand 6)
    L.floorgate(14, 8, 2, 4)                              # Sol's gate out of JT (pink), sinks into the floor
    L.clear(24, 2, 32, 3).pool(26, 4, 4, 'M')             # M1E
    L.floorgate(31, 2, 2, 1)                              # Luna's gate out of her alcove (green)
    L.clear(29, 8, 32, 9).pool(29, 10, 3, 'S')            # S2E, east part, level with NE's floor
    L.floorgate(32, 8, 2, 1)                              # Sol's gate into it (green), sinks into the floor
    L.clear(26, 5, 28, 8).clear(24, 5, 25, 6)             # S2E, west part: a ramp up going west
    L.set(28, 9, '\\'); L.set(27, 8, '\\'); L.set(26, 7, '\\')
    L.clear(33, 1, 38, 3)                                 # Luna's alcove, up to the roof
    L.plate(37, 3, 3)                                     # PW0
    L.clear(33, 5, 38, 9)                                 # NE
    L.r(33, 5, 35, 7).clear(33, 4, 34, 6).p(33, 6, 'b')   # Luna starts in a pit in the alcove's floor: six rows over her
    L.plate(35, 9, 3)                                     # PW1
    L.clear(37, 11, 38, 11).clear(37, 18, 38, 18).cells(37, 10, 38, 10, 2).mv(2, 0, 8)   # lift (orange): hangs in NE's floor, comes down into E-mid's
    # ---- middle band: W-mid, T_S3, centre C, T_M3, E-mid
    L.clear(1, 12, 7, 17)                                 # W-mid
    L.plate(1, 17, 0).plate(3, 17, 2)                     # PP and PO1 in the far corner
    hatch(L, 5, 18, 2, -2, 3)                             # hatch (white): W-mid down to SW
    L.r(3, 19, 4, 19)
    L.clear(8, 16, 13, 17).pool(9, 18, 3, 'S')            # T_S3
    L.r(12, 14, 14, 15)
    vdoor(L, 13, 16, 3)                                   # Sol's gate into the centre (white)
    L.clear(14, 11, 25, 17)                               # C
    L.r(18, 17, 21, 17)                                   # a low dais (stand 16)
    L.plate(19, 16, 2)                                    # PO2, on the dais
    L.r(23, 15, 25, 15).p(24, 14, 'B')                    # east ledge with Luna's door (stand 14)
    L.floorgate(23, 16, 2, 4).p(25, 17, 'A')              # Sol's door in an alcove under the ledge, behind a pink gate
    L.r(25, 11, 25, 12)
    L.r(14, 14, 16, 14).plate(14, 13, 4)                  # west ledge with PK3 (stand 13)
    L.clear(26, 13, 32, 14).pool(28, 15, 3, 'M')          # T_M3
    L.r(25, 11, 27, 12)
    vdoor(L, 26, 13, 2)                                   # Luna's gate into the centre (orange)
    L.clear(33, 12, 38, 17)                               # E-mid
    L.r(33, 15, 34, 15)                                   # ledge where T_M3 comes in (stand 14)
    L.clear(33, 18, 35, 27).cells(33, 28, 35, 28, 0).mv(0, 0, -10)   # lift (purple): SE up to E-mid
    # ---- bottom band: SW, M2W/S1W tunnels, bottom crossing JB, M2E/S1E tunnels, SE
    L.clear(1, 20, 7, 27)                                 # SW
    L.p(2, 27, 'a')
    L.r(6, 24, 7, 24)                                     # ledge where the moon tunnel leaves (stand 23)
    L.plate(1, 27, 1)                                     # PG1: opens Sol's way into the upper sun tunnel
    L.clear(8, 22, 15, 23).pool(10, 24, 3, 'M')           # M2W
    L.clear(8, 26, 12, 27).pool(10, 28, 3, 'S')           # S1W, lower part
    vdoor(L, 8, 26, 3)                                    # Sol's gate out of his corner (white)
    L.plate(9, 27, 1)                                     # PG0, just outside it
    L.clear(13, 26, 15, 27)                               # S1W runs straight into JB
    L.clear(16, 19, 23, 27)                               # JB
    L.r(16, 24, 17, 24).plate(17, 23, 4)                  # west ledge with PK2 (stand 23)
    L.r(21, 25, 21, 25)                                   # a step (stand 24)
    L.r(18, 19, 19, 21)                                   # a stone hanging between the two ledges; the way east is under it
    L.r(22, 23, 23, 25).r(23, 19, 23, 20)                 # east ledge (stand 22)
    vdoor(L, 24, 21, 5)                                   # Luna's gate out of JB (yellow)
    vdoor(L, 24, 26, 4)                                   # Sol's gate out of JB (pink)
    L.clear(25, 21, 28, 22).pool(26, 23, 3, 'M')          # M2E, west part
    L.clear(29, 21, 29, 24).clear(30, 23, 32, 24)         # M2E, east part (a step down going east)
    L.clear(25, 26, 32, 27).pool(27, 28, 4, 'S')          # S1E
    L.plate(25, 27, 5)                                    # PY1
    L.clear(33, 20, 38, 27)                               # SE
    L.plate(37, 27, 1)                                    # PG
    L.clear(4, 11, 6, 11).clear(5, 19, 6, 19)             # under the hatches
    # gems: corners and high spots in the chambers
    L.p(4, 22, 's').p(21, 3, 's').p(36, 6, 's').p(16, 12, 's')
    L.p(21, 19, 'm').p(5, 12, 'm').p(38, 22, 'm').p(38, 13, 'm').p(1, 3, 'm')
    L.p(38, 25, 's')
    return L


def wall_room(L, x0, x1, f, inner):
    """A room in one of the atrium's side walls: cells x0..x1, rows f-5..f-1 above floor row f.
    inner is the column on the atrium side, which stays open so a ferry can dock."""
    L.clear(x0, f - 5, x1, f - 1)
    return L


@level(21)
def pendulum():
    """Pendulum. The one open room: a tall atrium with a shade pool for a floor, between two side
    walls of stacked rooms seven rows apart (floors 28, 21, 14, 7), so every climb gets its full
    jump. Three ferries hang across the atrium at three heights and swing from wall to wall:
    hold the plate and the ferry swings over, let go and it swings back. Each ferry hangs on the
    far side from whoever rides it first, so it has to be called over before anyone can board.
    Each wall's stairs (a ledge, then a full jump up through a hatch) only go up one storey, and
    every hatch is opened from the other wall. Over each top room is a door loft, reached
    through one more hatch. Both players zigzag to the top, trading sides on every ferry: Sol's
    door is in the right loft, Luna's in the left.

    Chain (white plates open Sol's hatches, pink plates Luna's):
    1. Luna holds white in her start room: Sol climbs the left wall to the first dock.
    2. Sol holds pink there: Luna climbs the right wall to her first dock.
    3. The purple ferry hangs on Luna's side. She holds purple: it swings over to Sol. He steps
       on, she lets go, and it swings him back across.
    4. She steps on where it hangs, he holds his own purple plate beside hers, and it swings her
       to the left.
    5. Now on the wrong sides, each needs the other's hatch: Luna holds white, Sol climbs the
       right wall; Sol holds pink, Luna climbs the left wall.
    6. The green ferry hangs on Luna's side: she calls it over, it brings Sol left when she lets
       go, and he sends her right on his plate.
    7. White and pink again, up to the top rooms.
    8. The orange ferry: called left by Luna, Sol rides it right, she rides it back left.
    9. White and pink a last time, up into the door lofts: Luna holds white for Sol's loft, and
       Sol holds pink inside his loft for hers.
    """
    L = Lv('Pendulum', 120, "Hold a ferry's plate and it swings across; let go and it swings back. You cannot ride the ferry you are holding.")
    solid(L)
    # wall rooms (x3-7 and x32-36): floors at rows 28, 21, 14, 7, each room six rows high
    for x0, x1 in ((3, 7), (32, 36)):
        for f in (28, 21, 14, 7):
            L.clear(x0, f - 6, x1, f - 1)
    # the atrium (x10-29) behind inner walls two thick; each storey opens on it through a dock
    # tunnel two rows high, and the start rooms open on it fully
    L.clear(10, 5, 29, 27).pool(10, 28, 20, 'X')
    for x in (8, 30):
        L.clear(x, 22, x + 1, 27)
        for f in (21, 14, 7):
            L.clear(x, f - 2, x + 1, f - 1)
    # the door lofts over the top rooms (rows 1-3, floor 4)
    L.clear(3, 1, 7, 3).clear(32, 1, 36, 3).r(5, 4, 7, 4).r(32, 4, 34, 4)
    # stairs in each wall: a ledge 3 up under the hatch, then a full jump up through the hatch,
    # which slides into a slot in the outer wall. Left wall: slot x1-2, hatch and ledge x3-4,
    # floor x5-7 (dock x7). The right wall mirrors it.
    # Sol climbs left, right, left, then his right loft (white); Luna the other way (pink).
    for k, n in enumerate((21, 14, 7, 4)):
        gl, gr = (3, 4) if k % 2 == 0 else (4, 3)
        hatch(L, 3, n, 2, -2, gl)
        hatch(L, 35, n, 2, 2, gr)
        if n != 4:
            L.r(3, n + 4, 4, n + 4).r(35, n + 4, 36, n + 4)
    L.p(6, 27, 'a').p(33, 27, 'b')
    # ferries, each hanging on the far side from its first rider: purple (row 21) and orange
    # (row 7) hang right, green (row 14) hangs left
    L.cells(26, 21, 29, 21, 0).mv(0, -16, 0)
    L.cells(10, 14, 13, 14, 1).mv(1, 16, 0)
    L.cells(26, 7, 29, 7, 2).mv(2, -16, 0)
    # plates. Storey 1: white (Luna) in her start room, pink (Sol) at left dock 1
    L.plate(32, 27, 3).plate(7, 20, 4)
    # crossing 1: purple, hers at the right dock, his further in
    L.plate(32, 20, 0).plate(34, 20, 0)
    # storey 2: white (Luna) left room 1, pink (Sol) right dock 2
    L.plate(5, 20, 3).plate(32, 13, 4)
    # crossing 2: green, hers at the left dock, his further in
    L.plate(7, 13, 1).plate(5, 13, 1)
    # storey 3: white (Luna) right room 2, pink (Sol) left top room
    L.plate(34, 13, 3).plate(7, 6, 4)
    # crossing 3: orange, hers at the right dock, his further in
    L.plate(32, 6, 2).plate(34, 6, 2)
    # the lofts: white (Luna) in the left top room, pink (Sol) inside his loft
    L.plate(5, 6, 3).plate(32, 3, 4)
    L.p(6, 3, 'B').p(33, 3, 'A')
    # the atrium: a shade-topped pillar splits it down the middle, broken where the ferries
    # swing through, and flush islands stand in the shade pool
    for y0, y1 in ((8, 11), (15, 18), (22, 27)):
        L.r(19, y0, 20, y1).pool(19, y0, 2, 'X')
    L.r(14, 28, 15, 28).r(24, 28, 25, 28)
    # gems: the islands, the nooks under the ledges, the lofts
    L.p(14, 27, 's').p(25, 27, 'm')
    L.p(3, 27, 's').p(36, 27, 'm').p(3, 20, 'm').p(36, 20, 'm').p(3, 13, 's').p(36, 13, 's')
    L.p(34, 3, 's').p(7, 3, 'm')
    return L



@level(22)
def the_operator():
    """The Operator. A comb: the control deck runs along the top of the screen, and the runner's
    course hangs under it as five teeth, shafts A to E, joined alternately at the bottom and the
    top. Down the right side is the outer gallery, a ladder of ledges from the deck's door to its
    foot. Everything a player climbs is on seven-row bands: the deck floor is row 7, and the two
    ladders (shaft B and the gallery) are staggered columns, so every climb (3 or 4 tiles) gets
    its full jump. Luna's door is in an alcove at the deck's far west end, behind a six-wide well
    mouth over shaft A; Sol's door is on a shelf half way down shaft E, seven rows above the end
    cell, so it can only be reached by falling onto it from the course. So the runner of round two
    must be Sol, and the operator Luna.

    Deck controls: purple lever P swaps the two bridges (B1 over the shade under the A-B link is
    out while purple is on; B2 over the moon pool in the B-C link is out while it is off), green
    lever G raises the lift in shaft D. Orange opens the deck's door to the gallery: plate PE at
    the end of the course, plate PT at the gallery's foot, plate PD on the deck by the door's booth.

    Chain:
    1. Sol walks right through P: B1 comes out. Luna drops down the well into A and crosses it.
    2. Luna climbs the ladder in B and wades the moon pool (B2 is in; it does not matter to her),
       drops down C, crosses to D and stands on the lift.
    3. Sol walks right through G: the lift carries her to the top. She crosses into E and falls
       past Sol's shelf into the end cell. She turns the yellow lever there (her alcove's floor
       gate sinks) and stands on PE: the deck's door opens. Sol leaves the deck and climbs down
       the gallery.
    4. At the gallery's foot Sol walks right through the white rescue lever: the end cell's floor
       gate sinks and Luna comes out.
    5. Sol holds PT; Luna climbs the whole gallery (six jumps) and goes into the deck.
    6. Luna holds PD; Sol climbs the gallery after her. Walking west along the deck to the well
       he pushes G and P back off, so the lift sinks and the bridges reset.
    7. Roles swap, and the one thing different: Sol cannot wade the moon pool. Luna walks right
       through P (B1 out), and once he is up the ladder, left through it again (B2 out).
    8. Sol stands on the lift and Luna raises it. He falls onto his shelf in E while she leaps the
       six-wide well mouth (the signature jump, with a gem over its middle) into her alcove.
    """
    L = Lv('The Operator', 105, 'One of you works the deck, the other runs the course. Then swap: it will not go the same way twice.')
    solid(L)
    # ---- the deck (rows 1-6 over floor row 7): the alcove, the well mouth, a trough, the booth
    L.clear(1, 1, 31, 6)
    L.r(1, 1, 2, 4)                                       # the alcove's roof
    L.floorgate(2, 5, 2, 5)                               # Y (yellow): sinks to open Luna's alcove
    L.p(1, 6, 'B')
    L.clear(4, 7, 9, 7)                                   # the well mouth over A, six wide
    L.p(10, 6, 'b').p(30, 6, 'a')                         # Luna by the well, Sol in the booth
    L.lever(13, 6, 0)                                     # P (purple)
    L.p(15, 7, '\\').clear(16, 7, 19, 7).p(20, 7, '/')  # a trough over the B-C wall (floor row 8)
    L.lever(22, 6, 1)                                     # G (green)
    L.plate(24, 6, 2)                                     # PD, eight tiles from the door
    L.r(21, 1, 31, 4)                                     # the booth: a low passage to the door
    L.clear(29, 1, 30, 4)                                 # a skylight over Sol's start: a full jump
    vdoor(L, 32, 5, 2)                                    # the deck's door (orange)
    # ---- shaft A (x 4-7): a drop with catch shelves, and a pocket under the well mouth
    L.clear(4, 8, 7, 26).clear(8, 8, 9, 9)
    L.r(4, 14, 5, 14).r(6, 21, 7, 21)
    # ---- A-B link at the bottom: a low tunnel over shade, bridge B1 (out while purple is on)
    L.clear(8, 25, 10, 26).pool(8, 27, 3, 'X').clear(8, 28, 10, 28)
    L.plat(8, 28, 3, 1, 0, -1, 0)
    # ---- shaft B (x 11-14): a staggered ladder, left ledges on rows 24 and 17, right on 20 and 13
    L.clear(11, 8, 14, 26)
    L.r(11, 24, 12, 24).r(13, 20, 14, 20).r(11, 17, 12, 17).r(13, 13, 14, 13)
    L.clear(15, 18, 15, 19)                               # a niche off the ladder
    # ---- B-C link at the top: a low tunnel over a moon pool, bridge B2 (out while purple is off)
    L.clear(15, 11, 17, 12).pool(15, 13, 3, 'M').clear(15, 14, 17, 14)
    L.plat(15, 14, 3, 1, 0, -1, 0, True)
    # ---- shaft C (x 18-20): a drop with shelves
    L.clear(18, 11, 20, 26)
    L.r(19, 17, 20, 17).r(18, 22, 19, 22)
    # ---- C-D link at the bottom, and the lift in D (x 22-24, green)
    L.clear(21, 25, 21, 26)
    L.clear(22, 8, 24, 27).plat(22, 27, 3, 1, 0, -17, 1)
    # ---- D-E link at the top, shaft E (x 27-30), Sol's shelf, the end cell
    L.clear(25, 8, 26, 9)
    L.clear(27, 8, 30, 26)
    L.r(29, 14, 30, 14)                                   # gem shelf
    L.r(27, 20, 28, 20).p(28, 19, 'A')                   # Sol's shelf, seven rows over the end cell
    L.lever(28, 26, 5)                                    # yellow lever: Luna's alcove
    L.plate(30, 26, 2)                                    # PE
    L.clear(31, 25, 32, 26).floorgate(31, 25, 2, 3)       # the end cell's floor gate (white)
    # ---- the gallery (x 33-38): staggered ledges, left on rows 7, 14, 21, right on 10, 17, 24
    L.clear(34, 1, 38, 27).clear(33, 5, 33, 27)
    for y in (7, 14, 21):
        L.r(33, y, 35, y)
    for y in (10, 17, 24):
        L.r(36, y, 38, y)
    L.lever(34, 27, 3)                                    # the rescue lever (white)
    L.plate(38, 27, 2)                                    # PT
    # gems: the shelves and niches of the teeth, the gallery's corners, the deck's trough, and one
    # over the middle of the well mouth for Luna's last leap
    for x, y in ((17, 3), (4, 13), (15, 19), (20, 16), (30, 13), (38, 16)):
        L.p(x, y, 's')
    for x, y in ((6, 2), (7, 20), (37, 3), (18, 21), (29, 13), (12, 10)):
        L.p(x, y, 'm')
    return L
