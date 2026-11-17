"""Act 1: levels 1-11. See docs/level-plan.md for the brief of each level.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js <n>`.
"""
from lvdsl import Lv, level

# Define helpers that only this act needs here, not in tools/lvdsl.py.


def step(L, x, y, ch):
    """A one-tile ramp tile ch ('/' or '\\') in cell (x, y), with stone under it in row y+1."""
    L.set(x, y, ch)
    L.set(x, y + 1, '#')
    return L


@level(1)
def first_light():
    """A zigzag of four floors stacked seven rows apart, so every jump gets its full arc. The west part
    of the room sits one row lower than the east (its ground floor is the bottom wall), which splits every
    floor in two heights. Each floor ends in a two-block stair of 3-tile climbs with a leap back over the
    lower block, at alternate ends. Doors top right.
    Sol wades his channel to plate P1 so Luna can pass gate G1 and set lever L1, which keeps it open.
    One floor up the roles swap: Luna wades her channel to P2, Sol passes G2 and sets L2."""
    L = Lv('First Light', 45, 'Arrows move Sol, WASD moves Luna. Your own pool is safe. A plate works while you stand on it. A lever stays put.')
    L.r(1, 1, 15, 1).r(1, 2, 6, 2)         # hanging stone in the top-left corner
    # floor 0 (the bottom wall in the west, row 28 in the east): west stair, start, Sol's channel, P1
    L.r(4, 26, 6, 28).r(1, 23, 3, 28)      # the west stair: two 3-tile steps
    L.p(14, 28, 'a').p(16, 28, 'b')
    L.set(18, 28, '/')
    L.r(19, 28, 38, 28)
    L.pool(20, 28, 2, 'M')                 # Luna wades it, Sol jumps it
    L.r(24, 22, 33, 25).pool(25, 28, 8, 'S')   # low ceiling: only Sol can cross
    L.plate(37, 27, 0)                     # P1 opens G1
    # floor 1 (row 22 west, row 21 east): gate G1, lever L1, a sun pool, the east stair
    L.r(7, 22, 17, 22).r(19, 21, 35, 21); step(L, 18, 21, '/')
    L.gate(12, 20, 21, '=', 0, 18).r(11, 16, 13, 16)
    L.lever(20, 20, 0)                     # L1 keeps G1 open
    L.pool(23, 21, 2, 'S')                 # Sol wades it, Luna jumps it
    L.r(33, 18, 35, 20).r(36, 15, 38, 21)  # the east stair: two 3-tile steps
    # floor 2 (row 15 west, row 14 east): the middle stair, Luna's channel and P2 in the west
    L.r(16, 14, 32, 14).r(1, 15, 15, 15)
    L.r(19, 11, 21, 13).r(16, 8, 18, 13)   # the middle stair: two 3-tile steps
    L.r(14, 12, 15, 14)                    # a step back up out of the channel's mouth
    L.r(1, 9, 10, 12).pool(4, 15, 6, 'M')  # low ceiling: only Luna can cross
    L.plate(2, 14, 1)                      # P2 opens G2
    # floor 3 (row 7; the channel's roof at row 9 is a shelf): gate G2, lever L2, a moon pool, the doors
    L.r(22, 7, 38, 7)
    L.gate(25, 5, 6, '-', 1, 3).r(24, 1, 26, 1)
    L.lever(28, 6, 1)                      # L2 keeps G2 open
    L.pool(30, 7, 2, 'M')
    L.p(37, 6, 'A').p(35, 6, 'B')
    L.p(36, 24, 's').p(23, 17, 's').p(5, 7, 's').p(31, 2, 's')
    L.p(2, 21, 'm').p(37, 13, 'm').p(8, 7, 'm').p(33, 3, 'm')
    return L



def art(L, rows):
    """Paint the map from 28 strings of 38 characters (row 1 first). A row may be given as a
    tuple of pieces that are joined; every row must come out exactly 38 wide."""
    assert len(rows) == 28, (L.name, len(rows))
    for y, row in enumerate(rows, 1):
        if isinstance(row, tuple): row = ''.join(row)
        assert len(row) == 38, (L.name, y, len(row), row)
        for x, c in enumerate(row, 1):
            L.set(x, y, c)
    return L



def stairs(L, x, f, side):
    """Five-row climb from a floor whose stone row is f up to the floor at row f-5, in columns x..x+4.
    side 'L': the tall block is against column x; 'R': the tall block is at x+2..x+4.
    Cuts the five-wide hole in row f-5 above the blocks."""
    if side == 'L':
        L.r(x, f - 4, x + 2, f - 1).r(x + 3, f - 2, x + 4, f - 1)
    else:
        L.r(x, f - 2, x + 1, f - 1).r(x + 2, f - 4, x + 4, f - 1)
    L.clear(x, f - 5, x + 4, f - 5)
    return L


@level(2)
def parting_ways():
    """Two towers split by a thick wall with slit windows. Sol climbs the left tower, Luna the right. Each
    tower has four floors seven rows apart (Sol's one row lower: his ground floor is the bottom wall), and
    every stair is two 2-wide blocks of 3-tile climbs with a leap back over the lower one.
    0. Sol runs to the window end of his ground floor and back. Walking back left through lever L5
       (yellow, starts on) turns it off, and gate G5 in Luna's tower opens.
    1. Luna runs west to the window, climbs her stair and stands on P0 (purple) at its top: gate G0 on
       Sol's first floor opens.
       Sol climbs and goes through G0.
    2. On his second floor Sol walks left through lever L1 (green, starts on): gate G1 on Luna's first
       floor opens for good. He waits at gate G2.
    3. Luna climbs through G1 and stands on P2 (orange) on her second floor: G2 opens; Sol goes through.
    4. Sol walks right through lever L3 (white) on his top floor: gate G3 on Luna's top floor opens for
       good. Sol waits at the tall gate G4 that shuts his tower off from the roof.
    5. Luna climbs through G3 to the far east end of her top floor and stands on P4 (pink): G4 rises
       and Sol steps out onto the roof to his door.
    6. Luna walks all the way back and over her stair's top onto the roof beside him."""
    L = Lv('Parting Ways', 45, 'Your plates and levers open the other tower. A lever turns on when you walk right through it, off when you walk left.')
    L.r(19, 8, 20, 28)                                     # the central wall, its top is the roof
    # ---- Sol's tower (x 1-18): ground on the bottom wall, floors at rows 22, 15, 8
    L.r(1, 23, 2, 28).r(3, 26, 4, 28)                      # west stair up to floor 1
    L.p(8, 28, 'a').lever(12, 28, 5, on=True)              # L5 (starts on)
    L.r(5, 22, 18, 22)
    L.gate(10, 20, 21, '=', 0, 18).r(9, 16, 11, 16)        # G0 (purple)
    L.pool(12, 22, 2, 'M')
    L.r(15, 19, 16, 21).r(17, 16, 18, 21)                  # east stair up to floor 2
    L.r(1, 15, 14, 15)
    L.lever(11, 14, 1, on=True)                            # L1 (starts on)
    L.gate(8, 13, 14, '_', 2, 11).r(7, 9, 9, 9)            # G2 (orange)
    L.r(3, 12, 4, 14).r(1, 9, 2, 14)                       # west stair up to the top floor
    L.r(5, 8, 18, 8)
    L.lever(10, 7, 3)                                      # L3 (white)
    L.gate(17, 6, 7, '~', 4, 4).r(16, 1, 18, 2)            # G4 (pink) between Sol's top floor and the roof
    L.p(19, 7, 'A').p(20, 7, 'B')
    # ---- Luna's tower (x 21-38): floors at rows 28, 21, 14, 7
    L.r(21, 28, 38, 28)
    L.r(21, 22, 22, 27).r(23, 25, 24, 27)                  # west stair up to floor 1
    L.plate(21, 21, 0)                                     # P0, at the window on top of the stair
    L.gate(27, 26, 27, ':', 5, 24).r(26, 22, 28, 22)       # G5 (yellow), shut while L5 is on
    L.p(31, 27, 'b').pool(34, 28, 2, 'S')
    L.r(25, 21, 38, 21)
    L.gate(28, 19, 20, '-', 1, 17).r(27, 15, 29, 15)       # G1 (green), shut while L1 is on
    L.r(35, 18, 36, 20).r(37, 15, 38, 20)                  # east stair up to floor 2
    L.r(21, 14, 34, 14)
    L.plate(30, 13, 2)                                     # P2
    L.pool(26, 14, 2, 'S')
    L.r(23, 11, 24, 13).r(21, 8, 22, 13)                   # west stair up to the top floor (its top is the roof's edge)
    L.r(25, 7, 38, 7)
    L.gate(28, 5, 6, '+', 3, 3).r(27, 1, 29, 1)            # G3 (white)
    L.plate(37, 6, 4)                                      # P4, at the far end of the top floor
    L.clear(19, 26, 24, 26).clear(15, 20, 20, 20).clear(19, 12, 24, 12)   # slit windows through the wall
    for g in (0, 1, 2, 3, 5):
        L.mv(g, 0, -2)
    L.invert(5).invert(1)                                  # G5 and G1 are shut while their lever is on
    L.p(17, 26, 's').p(13, 18, 's').p(1, 7, 's').p(8, 4, 's')
    L.p(37, 25, 'm').p(32, 17, 'm').p(22, 6, 'm').p(34, 3, 'm')
    return L


@level(3)
def shade_well():
    """A descent. Both start on the roof of a deep well in the middle of the screen; its floor is a shade
    pool. Sol's door is in the bottom left corner, Luna's in the bottom right, and every drop is one way.
    The roof, two upper rooms, two lower rooms and the two door rooms sit seven rows apart (the west side
    one row lower than the east), so each room's jumps get their full arc.
    0. The well's beam splits its mouth into two one-tile slots, which you run over and stop on to drop.
       So each can fetch a gem from the other's end of the roof first.
    1. Luna stays up top and stands on P0 (purple) at the east end of the roof. Sol drops into the
       left slot, lands on ledge LA and goes west through gate G0 into the left upper room.
    2. At the room's dead end Sol turns levers L1 (green) and L0 (purple): L0 keeps G0 open so he can get
       back out, L1 opens gate G1 on the right side of the well for good.
    3. Luna drops into the right slot, lands on ledge RB, goes through G1 and stands on P2 (orange) at the
       far end of the right room: gate G2 opens. Sol, who dropped to ledge LB, goes through G2.
    4. Sol turns lever L3 (white) at the dead end of the left lower room and drops through its floor to
       his door. L3 opened gate G3 in the right lower room.
    5. Luna drops through her room's floor, goes through G3 and falls to her door."""
    L = Lv('Shade Well', 45, 'Black pools are shade: they kill you both. Every drop is one way, so look where your door is before you jump.')
    # ---- the roof: west half and the beam on row 8, east half on row 7; one-tile slots either side
    L.r(1, 8, 21, 8).clear(17, 8, 17, 8).pool(7, 8, 2, 'X')   # Sol's slot at x 17
    L.r(18, 1, 20, 5)                                      # a rock hangs over the beam: walk under it
    L.r(23, 7, 38, 7).pool(29, 7, 2, 'X')                  # Luna's slot at x 22
    L.plate(37, 6, 0)                                      # P0
    L.p(9, 7, 'a').p(26, 6, 'b')
    # ---- upper rooms (left floor row 15, right floor row 14)
    L.r(1, 15, 18, 15).pool(8, 15, 2, 'X')                 # left upper room, ledge LA at x 16-18
    L.gate(15, 13, 14, '=', 0, 11).r(14, 9, 16, 9)         # G0
    L.lever(2, 14, 0).lever(4, 14, 1)                      # L0, L1 at the dead end
    L.r(21, 14, 38, 14).pool(33, 14, 2, 'X')               # right upper room, ledge RB at x 21-23
    L.gate(24, 12, 13, '-', 1, 10).r(23, 8, 25, 8)         # G1
    L.clear(28, 14, 29, 14)                                # the hole down to the right lower room
    L.plate(38, 13, 2)                                     # P2
    # ---- lower rooms (left floor row 22, right floor row 21)
    L.r(1, 22, 19, 22).pool(9, 22, 2, 'X')                 # left lower room, ledge LB at x 15-19
    L.gate(14, 20, 21, '_', 2, 18).r(13, 16, 15, 16)       # G2
    L.lever(2, 21, 3)                                      # L3 at the dead end
    L.clear(4, 22, 5, 22)                                  # the hole down to Sol's door
    L.r(23, 15, 26, 20).r(23, 21, 23, 27).r(23, 21, 38, 21).pool(30, 21, 2, 'X')   # right lower room, walled off from the well
    L.gate(34, 19, 20, '+', 3, 17).r(33, 15, 35, 15)       # G3
    L.clear(36, 21, 38, 21)                                # the shaft down to Luna's door
    # ---- the door rooms and the bottom of the well
    L.r(10, 23, 19, 28)                                    # stone under LB and the left lower room
    L.pool(20, 28, 3, 'X')                                 # the shade at the bottom of the well
    L.r(24, 28, 38, 28).pool(31, 28, 2, 'X')
    L.p(2, 28, 'A').p(37, 27, 'B')
    for g in range(4):
        L.mv(g, 0, -2)
    L.p(38, 3, 's').p(7, 11, 's').p(8, 25, 's')
    L.p(1, 4, 'm').p(36, 10, 'm').p(27, 25, 'm')
    return L


@level(4)
def the_lift():
    """A spine and ribs: a lift shaft up the middle (x 17-22), ribs sticking out left and right. Three lifts
    take turns in the two halves of the shaft, each rising six to eight rows so the ribs have full
    headroom. Nobody can drive the lift they ride: its plate is somewhere else.
    1. Luna starts on lift 1 (purple). Sol runs to the far end of the ground floor and stands on P0:
       lift 1 carries Luna up to rib 1.
    2. Luna stands on P0b (white) on rib 1: gate G0b at the foot of the west stair opens, and Sol runs all
       the way back and climbs to rib 1.
    3. Sol leaps over lift 1's lane onto lift 2 (green); Luna stands on P1 beside the shaft and he rides
       up to rib 2.
    4. Sol stands on P1b (pink) on rib 2: gate G1b in the corridor under it opens. Luna crosses the shaft
       on lift 2's empty seat, goes through G1b and climbs the east stair to rib 2.
    5. Luna leaps back over lift 2's lane onto lift 3 (orange); Sol stands on P2 and she rides up to rib 3.
    6. At rib 3's dead end Luna turns lever L2 (orange): lift 3 stays up, so Sol can let go, and from its
       top she can leap to the gallery across the shaft for its gem. She walks back to her door; Sol walks
       to his on rib 2."""
    L = Lv('The Lift', 45, "You cannot drive the lift you stand on. Your partner's plate moves it.")
    # ---- west: ground (bottom wall, then row 28 by the shaft), rib 1 (rows 22/21), a solid mass, rib 3 (row 8)
    L.r(1, 23, 2, 28).r(3, 26, 4, 28)                      # the west stair
    L.gate(7, 27, 28, '+', 3, 25).r(6, 23, 8, 23)          # G0b (white) at its foot
    L.set(11, 28, '/'); L.r(12, 28, 16, 28)
    L.p(14, 27, 'a')
    L.r(5, 22, 10, 22).r(12, 21, 16, 21); step(L, 11, 21, '/')   # rib 1
    L.plate(8, 21, 3).plate(15, 20, 1)                     # P0b, P1
    L.r(1, 1, 8, 8).r(1, 9, 16, 14).r(1, 15, 4, 16)        # the mass between rib 1 and rib 3
    L.r(9, 8, 16, 8)                                       # rib 3
    L.lever(12, 7, 2).p(10, 7, 'B')                        # L2 at the dead end, Luna's door
    # ---- the shaft: lift 1 and lift 3 in the west half, lift 2 in the east half
    L.cells(17, 28, 19, 28, 0).mv(0, 0, -7)                # lift 1: ground -> rib 1
    L.p(18, 27, 'b')
    L.r(20, 28, 22, 28).set(23, 28, '\\')
    L.cells(20, 21, 22, 21, 1).mv(1, 0, -7)                # lift 2: rib 1 -> rib 2
    L.cells(17, 14, 19, 14, 2).mv(2, 0, -6)                # lift 3: rib 2 -> rib 3
    # ---- east: ground (bottom wall), the corridor (row 22), rib 2 (row 14), the gallery (row 7)
    L.plate(37, 28, 0)                                     # P0, at the far end of the ground floor
    L.r(23, 22, 38, 22).r(29, 23, 30, 26)                  # the corridor floor, a pillar under it
    L.gate(26, 20, 21, '~', 4, 18).r(25, 15, 27, 17)       # G1b (pink)
    L.r(35, 19, 36, 21).r(37, 16, 38, 21)                  # the east stair up to rib 2
    L.r(23, 14, 34, 14)                                    # rib 2
    L.plate(26, 13, 2).plate(29, 13, 4).p(33, 13, 'A')     # P2, P1b, Sol's door
    L.r(25, 7, 34, 7).r(31, 8, 31, 11)                     # the gallery, out of reach without lift 3
    L.r(28, 1, 30, 2)                                      # a rock hangs over it
    L.mv(3, 0, -2).mv(4, 0, -2)
    L.p(35, 25, 's').p(10, 18, 's').p(29, 10, 's').p(2, 20, 's')
    L.p(33, 5, 'm').p(32, 19, 'm').p(10, 3, 'm').p(14, 17, 'm')
    return L


@level(5)
def the_long_way_round():
    """A ring of corridors round a solid core. The players start in a split chamber at the foot of the
    core, each standing beside the other's door. The west exit is a sun channel (only Sol), the east exit a
    moon channel (only Luna), so Sol must go round clockwise and Luna anticlockwise to reach their doors.
    Bridges rise out of pools while their plate is held.
    1. Sol wades west and climbs the left stairwell; Luna wades east and climbs the right one.
    2. Halfway up, both duck into vaults cut into the core. Luna stands on P4 (pink): Sol's vault gate opens
       and he takes his gem. Sol stands on P5 (yellow) by his gate: Luna's vault opens and she takes hers,
       walking back out before he lets go.
    3. At the top Luna stands on P1 (purple): a bridge rises out of the moon pool in the top-left channel and
       Sol crosses to the middle of the roof.
    4. Sol stands on P2 (green) there: a bridge rises out of the sun pool in the top-right channel and Luna
       crosses. They pass and each wades on through the other's channel and down the far stairwell.
    4b. Halfway down they meet the vaults again from the other side and swap the same favour the other way
       round: Sol on P4 lets Luna into his vault for her second gem, then Luna on P5 lets Sol into hers.
    5. At the bottom left Luna stands on P3 (orange): a bridge rises over the moon channel and Sol walks into
       the east half of the chamber, where his door is.
    6. Sol stands on P6 (white) there: a bridge rises over the sun channel and Luna walks into the west half
       to her door."""
    L = Lv('The Long Way Round', 50, 'Raised bridges cover a pool while their plate is held. Your pools mark your way round.')
    T = (
        ('#############', '############', '#############'),   # 1
        ('.............', '#####..#####', '.............'),   # 2
        ('...m.........', '#####..#####', '.........s...'),   # 3
        ('.............', '#####s.#####', '.............'),   # 4
        ('.............', '#####.m#####', '.............'),   # 5
        ('.............', '............', '...........1.'),   # 6
        ('########.....', '.....2......', '.....########'),   # 7
        ('..........###', '#MMM####SSS#', '###..........'),   # 8
        ('..........###', '#===####---#', '###..........'),   # 9
        ('........#####', '############', '#####........'),   # 10
        ('........#####', '############', '#####........'),   # 11
        ('.....########', '############', '########.....'),   # 12
        ('###..........', '.#.#.##.#.#.', '..........###'),   # 13
        ('###..........', '.#.#.##.#.#.', '..........###'),   # 14
        ('#####........', '..~..##..:..', '........#####'),   # 15
        ('#####........', '.6~ms##ms:5.', '........#####'),   # 16
        ('########.....', '############', '.....########'),   # 17
        ('..........###', '############', '###..........'),   # 18
        ('..........###', '############', '###..........'),   # 19
        ('........#####', '############', '#####........'),   # 20
        ('........#####', '############', '#####........'),   # 21
        ('.....########', '############', '########.....'),   # 22
        ('###.....#####', '#....##....#', '#####.....###'),   # 23
        ('###.....#####', '#....##....#', '#####.....###'),   # 24
        ('#####........', '.....##.....', '........#####'),   # 25
        ('#####.3......', '.a..B##A..4b', '........#####'),   # 26
        ('#########SSS#', '############', '#MMM#########'),   # 27
        ('#########+++#', '############', '#___#########'),   # 28
    )
    art(L, T)
    for g in range(4):
        L.mv(g, 0, -1)               # bridges rise one tile out of the stone under their pool
    L.mv(4, 0, -2).mv(5, 0, -2)      # the two vault gates in the core
    return L


@level(6)
def crate_cellar():
    """A cascade of ledges that zigzags down from the top left to the bottom right, then a chimney back up
    to the doors in the top right. The crate rides the cascade down: pushed off one ledge, it lands on the
    next. A crate is wider than a one-tile hole, so it rolls over holes a player would fall through.
    1. Both push the crate off the starting ledge onto the second.
    2. Sol drops through the one-tile hole into a sun-pool pocket and stands on P1 (purple): gate G1 on the
       ledge above opens and Luna pushes the crate through it and off the end.
    3. Luna stands on P2 (green) on the third ledge: the pocket's gate G2 opens and Sol gets out.
    3b. Luna parks the crate one tile short of the east wall and uses it as a step into a high niche for a gem.
    4. Together they push the crate west along the third ledge, off its far end, then east along the fourth,
       step by step down to the cellar floor, and against the foot of the chimney wall, onto P3 (white).
       P3 opens the gate in front of the doors for good, and the crate is the step up into the chimney.
    5. Luna steps onto the chimney lift (orange) and Sol stands on P4 beside it: she rides to the top.
    6. Luna stands on the second orange plate at the top: the empty lift comes down for Sol and brings him up."""
    L = Lv('Crate Cellar', 60, 'Push the crate off ledges to bring it down. Stuck against a wall? Lean on it, then jump into its corner.')
    L.r(1, 1, 38, 28)
    L.clear(1, 3, 21, 8).r(2, 6, 8, 6)                                 # top ledge: a thin shelf (row 6) over the second ledge (row 9)
    L.r(17, 4, 19, 6).clear(18, 5, 18, 6).cells(18, 7, 18, 8, 0)        # gate G1 on the second ledge
    L.clear(11, 9, 11, 9)                                              # one-tile hole into Sol's pocket
    L.clear(2, 10, 14, 13).clear(15, 12, 15, 13).pool(10, 14, 3, 'S')
    L.plate(2, 13, 0)                                                  # P1 at the far end of the pocket
    L.clear(16, 10, 16, 11).cells(16, 12, 16, 13, 1)                   # gate G2, the pocket's way out
    L.clear(22, 7, 23, 11).clear(17, 12, 25, 17)                        # the crate's first drop; third ledge, east half
    L.clear(13, 15, 16, 17).clear(1, 15, 12, 18)                        # third ledge, west half one row lower
    L.clear(1, 19, 3, 22)                                              # drop shaft at the west end
    L.plate(14, 17, 1)
    L.clear(1, 20, 10, 22).clear(11, 20, 20, 24).clear(21, 23, 29, 25)  # fourth ledge, stepping down eastwards
    L.clear(30, 20, 32, 26)                                            # cellar floor at the chimney foot
    L.plate(32, 26, 3).plate(21, 25, 2)
    L.clear(34, 8, 38, 22).clear(33, 21, 33, 22)                        # chimney
    L.r(38, 12, 38, 12).r(34, 17, 34, 17)                              # ledges in the chimney wall
    L.clear(25, 11, 30, 13).p(29, 12, 'm')                              # a niche you can only reach from the crate
    L.cells(35, 23, 37, 23, 2).mv(2, 0, -16)                            # the chimney lift
    L.clear(28, 3, 38, 6).clear(35, 7, 37, 7)                           # top landing
    L.r(31, 2, 33, 4).clear(32, 3, 32, 4).cells(32, 5, 32, 6, 3)        # gate G3 in front of the doors
    L.plate(38, 6, 2)
    L.p(29, 6, 'A').p(30, 6, 'B')
    L.p(3, 5, 'a').p(4, 5, 'b').p(6, 5, 'k')
    L.mv(0, 0, -2).mv(1, 0, -2).mv(3, 0, -2)
    L.p(6, 11, 's').p(37, 20, 's')                                     # Sol's pocket; the chimney ledge
    L.p(9, 4, 'm').p(37, 3, 'm')                                       # over the top shelf; the top landing's corner
    return L


@level(7)
def twin_towers():
    """Two towers with a chasm between them; shade at the bottom of the chasm and on a band halfway up.
    Two ferries cross it, each parked on the far side from whoever needs it, and nobody can drive the ferry
    they ride. Sol starts at the foot of the left tower and his door is on top of the right one. Luna starts
    halfway up the right tower, shut in by gate G_B, and her door is on top of the left one.
    1. Luna drops to her first landing and stands on P_A (purple): gate G_A at the foot of Sol's tower opens.
    2. Sol climbs all the way to the top of the left tower's stair and turns lever L_B (green): G_B opens for
       good. He walks back down to the low ferry's dock.
    3. Luna drops to the foot of her tower and stands on P_F1 (orange): the low ferry crosses to Sol. He steps
       on, she steps off, and it carries him back across.
    4. Luna climbs her whole tower through G_B to the high ferry's dock. Sol goes down to the foot of the right
       tower and stands on P_F2 (white): the high ferry comes over. She steps on, he steps off, and it carries
       her across. (A gem hangs over each ferry's lane.)
    5. Sol climbs the whole right tower, wading a sun channel on its third landing that keeps Luna out of its
       top, and on top of the stair walks back left through lever L_C (pink, starts on): the gate in front
       of Luna's door opens.
    6. The gate in front of Sol's door is held by P_D (yellow) at the foot of the left tower. Luna climbs all
       the way down her new tower and stands on it; Sol walks to his door.
    7. Luna climbs the left tower again, through her open gate, to her door."""
    L = Lv('Twin Towers', 52, "Ferries cross the chasm. You can't drive the one you stand on. Don't fall: the chasm is full of shade.")
    L.r(1, 1, 38, 28)
    L.clear(1, 2, 15, 25).clear(24, 2, 38, 25)
    # left tower: floors at rows 26, 21, 16, 11, 6; stairs alternate between the chasm side and the outer wall
    stairs(L, 11, 26, 'R'); L.r(1, 21, 10, 21)
    stairs(L, 1, 21, 'L'); L.r(6, 16, 15, 16)
    stairs(L, 11, 16, 'R'); L.r(1, 11, 10, 11)
    stairs(L, 1, 11, 'L'); L.r(6, 6, 15, 6)
    # right tower, mirrored
    stairs(L, 24, 26, 'L'); L.r(29, 21, 38, 21)
    stairs(L, 34, 21, 'R'); L.r(24, 16, 33, 16)
    stairs(L, 24, 16, 'L'); L.r(29, 11, 38, 11)
    stairs(L, 34, 11, 'R'); L.r(24, 6, 33, 6)
    # tower walls on the chasm side, open only at the two ferry docks and the top
    L.r(15, 7, 15, 8).r(15, 17, 15, 18).r(24, 7, 24, 8).r(24, 17, 24, 18)
    # the chasm: a walkway at the top cut by shade under a low rock, ferry lanes, a shade band, shade at the bottom
    L.clear(16, 2, 23, 5).r(18, 2, 21, 3)
    L.p(16, 6, '##XXXX##')
    L.clear(16, 9, 23, 13).pool(16, 14, 8, 'X')
    L.clear(16, 18, 23, 23).pool(16, 24, 8, 'X')
    L.cells(21, 22, 23, 22, 2).mv(2, -5, 0)           # low ferry, parked on the right: holding its plate calls it over
    L.cells(16, 12, 18, 12, 3).mv(3, 5, 0)            # high ferry, parked on the left: holding its plate calls it over
    # gates and controls
    L.gate(7, 24, 25, '=', 0, 22).plate(31, 20, 0)     # G_A at the foot of Sol's tower; P_A on Luna's first landing
    L.gate(31, 14, 15, '-', 1, 12).lever(1, 6, 1)      # G_B on Luna's second landing; L_B atop Sol's top stair
    L.plate(34, 25, 2).plate(38, 25, 3)                # both ferry plates on the right tower's ground floor
    L.r(30, 7, 32, 8).pool(31, 11, 2, 'S')             # sun channel on the right tower's third landing: only Sol goes higher
    L.gate(10, 4, 5, '~', 4, 2).lever(37, 6, 4, on=True).invert(4)   # G_C before Luna's door; L_C (starts on) atop the right stair
    L.gate(29, 4, 5, ':', 5, 2).plate(9, 25, 5)        # G_D before Sol's door; its plate P_D is at the foot of the left tower
    L.p(13, 5, 'B').p(26, 5, 'A')
    L.p(2, 25, 'a').p(33, 15, 'b')
    L.p(20, 19, 's').p(19, 9, 'm')                    # one over each ferry's lane
    L.p(22, 4, 's').p(17, 4, 'm')                     # on the shade walkway under the top rock
    L.p(37, 3, 's').p(2, 3, 'm')                      # the far top corners
    return L


@level(8)
def dawn_gate():
    """Chapter exam. An S through five floors from the bottom left to the doors in the top right, with a
    vault in the middle of the third floor. Each of the chapter's tools appears once.
    1. Pool route: the ground floor is cut by a sun tunnel. Sol wades it to P0 (purple) at the far side.
    2. Held plate made permanent: P0 lifts gate G0 on the narrow ledge over the tunnel. Luna crosses there
       and walks through lever L0 (purple) beyond it, so G0 stays open. Both walk up the ramp tunnel.
    3. Bridge: on the first floor a moon channel blocks Sol. Luna wades it and stands on P1 (green): a bridge
       rises out of the pool and Sol crosses.
    4. At the floor's dead end, on top of the stair, a lever (orange) unlocks the vault on the next floor.
    5. They go through the vault and push the crate out of it, east along the floor to the lift.
    6. Crate on a plate: Luna steps onto the lift; Sol pushes the crate across it onto the lift's plate (white)
       against the wall. The crate holds the lift up and carries them both to the fourth floor.
    7. Sol stands on P3 (pink) at the east end of the fourth floor: gate G3 at the west end opens and Luna
       climbs to the top floor.
    8. Luna stands on the other pink plate halfway along the top floor: G3 opens again and Sol follows. They
       walk to the doors together."""
    L = Lv('Dawn Gate', 60, 'Everything you learned this chapter, once each.')
    L.r(1, 1, 38, 28)
    # top floor (row 5, raised to row 4 in the middle); hanging rocks
    L.clear(1, 1, 38, 4).r(14, 4, 24, 4).r(9, 1, 10, 2).r(29, 1, 31, 2)
    # fourth floor (row 10, raised to row 9 in the middle)
    L.clear(1, 6, 35, 9).r(18, 9, 26, 9)
    # third floor (row 15) with the vault (floor row 14) in the middle; a hanging rock in the west part
    L.clear(1, 11, 37, 14).r(8, 11, 10, 12)
    L.r(15, 14, 23, 14).r(24, 11, 24, 11)                  # vault floor and the lintel of its east opening
    L.r(15, 9, 17, 11).clear(16, 10, 16, 11).cells(16, 12, 16, 13, 2)   # vault door G_v and its slot
    L.p(20, 13, 'k')
    L.cells(33, 15, 35, 15, 3).mv(3, 0, -5).clear(33, 10, 35, 10)   # the lift and its shaft
    L.plate(37, 14, 3)
    # first floor (row 20; raised to row 19 west of the gate bump)
    L.clear(1, 16, 38, 19).r(12, 19, 17, 19)
    L.r(22, 16, 25, 17).pool(22, 20, 3, 'M')               # moon channel under a low roof
    L.cells(22, 21, 24, 21, 1).mv(1, 0, -1)                # its bridge, hidden in the stone below
    L.plate(14, 18, 1)
    stairs(L, 1, 20, 'L')                                  # up to the third floor at the west end
    L.lever(1, 15, 2)                                      # unlocks the vault
    # ground floor (row 27; the east part raised to row 26): sun tunnel under a ledge, G0 in the ledge
    L.clear(1, 21, 20, 26).clear(21, 22, 28, 26)
    L.r(22, 26, 28, 26)
    L.r(6, 26, 7, 26)                                      # a step up to the ledge
    L.r(10, 24, 20, 24).pool(11, 27, 7, 'S')
    L.r(18, 18, 20, 21).clear(19, 20, 19, 21).cells(19, 22, 19, 23, 0)
    L.lever(26, 25, 0).plate(28, 25, 0)
    L.rampR(29, 25, 6)                                     # ramp tunnel up to the first floor's east end
    for i in range(6):
        L.clear(29 + i, 22 - i, 29 + i, 24 - i)
    L.r(35, 20, 38, 26).clear(31, 20, 33, 21)
    # fourth floor gate G3 at the west end, held by P3 (east end) or P4 (top floor)
    stairs(L, 1, 10, 'L')
    L.gate(12, 8, 9, '~', 4, 6).plate(30, 9, 4).plate(20, 3, 4)
    L.r(36, 6, 38, 10)
    L.mv(0, 0, -2).mv(2, 0, -2)
    L.p(37, 4, 'A').p(38, 4, 'B')
    L.p(2, 26, 'a').p(3, 26, 'b')
    L.p(38, 17, 's').p(33, 2, 's').p(2, 2, 's')       # first floor's east dead end; under the hanging rock; top-left corner
    L.p(1, 22, 'm').p(19, 11, 'm').p(12, 2, 'm')      # start corner; over the crate in the vault; a jump on the top floor
    return L


@level(9)
def counterweights():
    """Twin shafts side by side, west (x 10-12) and east (x 26-28), with landings F1-F3 between them and
    small wings outside them. Each colour drives a pair of lifts that move in opposite senses: while it is
    on, the west lift goes up and the east lift comes down. Purple works the bottom pair (W0 from the
    floor to F1, E0 from F1 to F2), green the top pair (W1 from F2 to F3, E1 from F3 to the top gallery)
    and the bridge over the shade at the top. So one press sends a rider up the west shaft and brings the
    east lift down to meet them; letting go carries them on up the east shaft.
    1. Luna starts up in the pocket off E0's lower stop and drops down the east shaft. She holds P0a (purple): W0 lifts Sol to F1 and E0 sinks to meet him.
    2. Sol walks east over F1 through lever L2 (orange: gate G2 on the floor opens) onto E0. Luna steps
       off: E0 carries him to F2.
    3. Luna walks west through G2 onto W0. Sol climbs into the east wing and wades its sun channel to
       P0b (purple): W0 lifts her, E0 sinks; she crosses F1 onto E0 and Sol steps off, so E0 carries her
       up too. Both plates past the channel are Sol's, so he is the operator up here.
    4. Swap: Luna walks back across F2 onto W1. Sol holds P1a (green) at the end of the wing: W1 lifts
       her to F3, E1 sinks; she crosses onto E1, Sol steps off, and E1 carries her to the top.
    5. The counterweight. The east end of E1's lower stop has a pad (green) that anything resting there
       presses. Luna pushes the crate onto E1, against its far wall. Sol steps onto W1. Luna holds P1b:
       E1 sinks under the crate and stays down, which holds W1 (and Sol) up at F3 and the bridge raised.
    6. Luna crosses the bridge and holds P3 (white): gate G3 in the east wing at F3 opens. Sol walks over
       the sunk E1 into the wing, through G3 and lever L4 (pink), which sinks gate G4 before Luna's door.
    7. Luna steps off P3 and walks through G4 to her door."""
    L = Lv('Counterweights', 55, 'One colour moves two lifts: one goes up as the other comes down. A weight left on the far end of a sunk lift keeps it down.')
    L.r(1, 1, 38, 28)
    # ---- bottom floor (rows 23-26, floor 27), split by gate G2 under F1
    L.clear(1, 23, 38, 26)
    L.r(29, 26, 30, 26)                                    # a bump in the east end
    L.pool(24, 27, 2, 'M')
    L.gate(20, 25, 26, '_', 2, 23)                         # G2 (orange)
    L.p(2, 26, 'a')
    L.plate(33, 26, 0)                                     # P0a
    # ---- the shafts
    L.clear(10, 11, 12, 26).cells(10, 27, 12, 27, 0).mv(0, 0, -5)     # W0: floor -> F1
    L.cells(10, 16, 12, 16, 1).mv(1, 0, -6)                            # W1: F2 -> F3
    L.clear(26, 1, 28, 22).clear(10, 10, 12, 10)
    L.plat(26, 22, 3, 1, 0, -6, 0, inv=True)                           # E0: rests at F2, sinks to F1
    L.plat(26, 10, 3, 1, 0, -6, 1, inv=True)                           # E1: rests at the top, sinks to F3
    # ---- F1 (rows 17-21; floor row 22, raised to row 21 in the east half)
    L.clear(13, 17, 25, 21).r(19, 21, 25, 21).r(14, 17, 16, 18)
    L.lever(23, 20, 2)                                     # L2 opens G2
    L.clear(5, 20, 9, 21)                                  # crawl pocket off W0's top stop
    L.clear(29, 17, 36, 19).p(35, 19, 'b')                 # Luna starts in the pocket off E0's lower stop
    # ---- F2 (rows 11-15, floor 16)
    L.clear(13, 11, 25, 15).r(18, 11, 20, 12)
    L.clear(29, 11, 38, 13).r(31, 11, 35, 11).pool(32, 14, 3, 'S')   # east wing: P0b, sun channel, P1a
    L.plate(35, 13, 0).plate(38, 13, 1)                    # both past the channel: only Sol works them
    # ---- F3 (rows 5-9, floor 10)
    L.clear(10, 5, 25, 9).r(19, 5, 22, 6)
    L.clear(2, 9, 9, 11).clear(8, 7, 9, 8)                 # pocket off W1's top stop (open over its exit)
    L.clear(29, 5, 38, 7)                                  # east wing at F3: Sol's door
    L.gate(35, 6, 7, '+', 3, 4)                            # G3 (white)
    L.lever(37, 7, 4).p(38, 7, 'A')                        # L4 sinks G4
    L.plate(28, 9, 1)                                      # the weight pad on E1's lower stop
    # ---- top gallery (rows 1-3, floor 4)
    L.clear(4, 1, 25, 3)
    L.r(13, 1, 17, 1).pool(14, 4, 4, 'X')                  # shade under a low roof
    L.clear(14, 5, 17, 5).plat(14, 5, 4, 1, 0, -1, 1)      # the bridge rises out of it (green)
    L.r(20, 3, 20, 3).plate(20, 2, 1)                      # P1b on a step the crate can't climb
    L.p(22, 3, 'k')
    L.plate(10, 3, 3)                                      # P3
    L.floorgate(7, 1, 3, 4)                                # G4 (pink) sinks into the floor
    L.p(5, 3, 'B')
    # ---- gems
    L.p(6, 21, 's').p(30, 11, 's').p(31, 5, 's').p(16, 24, 's').p(7, 9, 's')
    L.p(3, 10, 'm').p(24, 1, 'm').p(37, 24, 'm').p(24, 24, 'm')
    return L



@level(10)
def stone_raft():
    """A shade lake across the middle band with an island in it, a gallery above each shore and a long
    gallery underneath. The west stretch is crossed on a ferry; the east stretch only on the crate, which
    must land in the middle of it. A crate falls straight down where it leaves the floor, so it has to be
    carried over the west stretch first and pushed off the island's shelf, which overhangs the east one.
    Sol starts on the dock with the crate, Luna in the room above it.
    1. The ferry waits at the island. Luna holds P_G (green) upstairs: it comes to the dock. Sol pushes the
       crate onto it and steps on; Luna steps off and the ferry carries them to the island.
    2. Sol walks through lever L5 (yellow) on the island: gate G5 opens Luna's way down the west shaft.
    3. Sol pushes the crate along the shelf and off its end: it drops into the middle of the east stretch.
       He hops onto it, over to the far lip, and drops down the lift shaft to the bottom of the room.
    4. Luna drops down the west shaft and finds gate G1 (purple) shut. Sol climbs the east ramp, crosses
       the raised middle of the gallery and holds P1 (purple) at its far end: G1 opens. Luna walks through
       it and through lever L1 (purple), which keeps it open.
    5. Sol walks back east, through lever L3 (pink: gate G3 before his door opens), down onto the lift
       (white). Luna holds P4 (white) in the low tunnel: the lift carries him up to the east gallery.
    6. Luna goes on down the east ramp onto the lift, and Sol holds P4b (white) at the top to bring her up.
    7. Sol walks through G3, past his door, and holds P6 (orange): gate G6 before Luna's door opens.
       She walks in, and he steps back to his door."""
    L = Lv('Stone Raft', 55, 'A crate dropped in a pool is a stepping stone, but it lands right where it falls. Ferries carry crates too.')
    L.r(1, 1, 38, 28)
    # ---- the west room (rows 2-6, floor 7): Luna, the ferry plate, gate G5 over the west shaft
    L.clear(1, 2, 15, 6).r(12, 2, 15, 3)                    # the west room reaches out over the lake
    L.gate(2, 5, 6, ':', 5, 3)                             # G5 (yellow)
    L.clear(1, 7, 1, 21)                                   # the west shaft
    L.p(5, 6, 'b').plate(8, 6, 1)                          # P_G
    # ---- the dock under it (rows 8-10, floor 11): Sol and the crate
    L.clear(3, 8, 11, 10)
    L.p(4, 10, 'a').p(7, 10, 'k')
    # ---- the lake band (rows 8-15, lake row 16)
    L.clear(12, 8, 34, 15)
    L.pool(12, 16, 9, 'X').pool(26, 16, 9, 'X')
    L.cells(18, 11, 20, 11, 1).mv(1, -6, 0)                # the ferry: rests at the island, comes to the dock on green
    L.r(21, 11, 25, 15)                                    # the island
    L.lever(23, 10, 5)                                     # L5
    L.r(26, 11, 29, 11)                                    # the shelf over the east stretch
    L.r(31, 8, 33, 8).r(14, 8, 16, 8)                      # hanging rocks
    L.r(21, 7, 25, 7)                                      # island roof
    # ---- the east lift (white) from the bottom to the east gallery
    L.clear(35, 8, 35, 15)                                 # the far lip, open to the shaft
    L.clear(36, 2, 38, 26).cells(36, 27, 38, 27, 3).mv(3, 0, -20)
    # ---- the east gallery (rows 2-6, floor 7)
    L.clear(24, 2, 35, 6)
    L.plate(34, 6, 3)                                      # P4b
    L.gate(32, 5, 6, '~', 4, 3)                            # G3 (pink)
    L.p(31, 6, 'A')
    L.plate(29, 6, 2)                                      # P6
    L.gate(27, 5, 6, '_', 2, 3)                            # G6 (orange)
    L.p(25, 6, 'B')
    # ---- the gallery underneath: low west part, raised middle, low east part
    L.clear(1, 22, 9, 26).clear(2, 19, 5, 21).r(2, 22, 3, 22)   # a gem ledge in the corner
    L.gate(7, 25, 26, '=', 0, 23)                          # G1 (purple)
    L.lever(9, 26, 0)                                      # L1
    L.clear(10, 18, 15, 26).rampR(10, 26, 6, 27)           # ramp up to the middle
    L.clear(16, 18, 28, 20)
    L.plate(16, 20, 0)                                     # P1, at the far end of the middle from Sol's side
    L.r(20, 18, 25, 18)                                    # a low tunnel
    L.plate(22, 20, 3)                                     # P4, in the tunnel
    L.lever(27, 20, 4)                                     # L3 opens G3
    L.clear(28, 18, 35, 26).rampL(33, 26, 6, 27)           # ramp down to the east
    L.r(34, 18, 35, 21)
    # ---- gems
    L.p(10, 8, 's').p(23, 8, 's').p(34, 23, 's').p(37, 3, 's')
    L.p(14, 4, 'm').p(2, 20, 'm').p(18, 18, 'm').p(30, 3, 'm')
    return L


@level(11)
def helpers_way_out():
    """A three-floor hub (x 15-24) between a west wing of sun channels and an east wing of moon channels.
    The hub has two one-way pits, and the floor of each pit is a lift. Whoever drops into a pit and stands
    on its plate holds a wing open, and stays stuck there until the runner reaches the lever that lifts the
    pit floor, holder and all, to the next floor. Pink plates open every pink exit gate.
    0. Luna starts shut in a cell on F1. Sol holds P0 (purple) at the other end and she comes out.
    1. Luna drops into pit A on F1 and stands on P1 (purple):
       gate G1 into the west wing opens. Only Sol can wade its sun channel.
    2. Sol climbs the west wing's four storeys. At the dead end on top he turns lever L2 (yellow): the hatch
       over a pocket by the wing's entrance drops open (and gate G2 in the east wing opens, for later).
    3. He goes all the way back down, drops into the pocket and walks left through lever L3 (green, on at
       the start, holding pit A's floor down): pit A's floor rises and carries Luna to F2. He climbs two storeys again to the wing's F2 exit, G7 (pink).
       Luna holds P7 (pink) on F2 and he comes out.
    4. Swap. Sol drops into pit B on F2 and stands on P4 (orange): gate G4 into the east wing opens. Only
       Luna can wade its moon channel.
    5. Luna goes through G2 and down two drops to the east wing's flooded bottom, wades its moon channel
       and walks right through lever L5 (white) onto the east lift: pit B's floor rises and carries Sol to
       F3. Luna is now the one stuck: the east lift is pink, and a rider can't drive it.
    6. Sol walks to P8 (pink) on F3 and holds it: the east lift carries Luna up to the wing's top floor,
       the wing's top exit G8 opens, and she comes out.
    7. Luna holds P8 in turn: gates G10 and G9 open, and Sol walks home along the west wing's top floor to
       his door at its far end. Luna goes to hers."""
    L = Lv("Helper's Way Out", 50, 'Drop into a pit to hold a plate, and you stay there until your partner sets you free.')
    L.r(1, 1, 38, 28)
    # ---- west wing (x 1-13): four storeys on floors 25, 20, 15, 10, top floor 5
    L.clear(1, 2, 13, 24)
    for y in (20, 15, 10, 5):
        L.r(1, y, 13, y)
    stairs(L, 1, 25, 'L'); stairs(L, 8, 20, 'R'); stairs(L, 1, 15, 'L'); stairs(L, 8, 10, 'R')
    L.r(7, 21, 10, 22).pool(7, 25, 4, 'S')                 # sun channel at the entrance, under a low roof
    L.gate(14, 23, 24, '=', 0, 21)                         # G1 (purple)
    L.gate(14, 13, 14, '~', 4, 11)                         # G7 (pink), the exit onto F2
    L.lever(7, 4, 5)                                       # L2 (yellow): the top floor is a dead end at G9
    L.p(3, 4, 'A').floorgate(5, 3, 2, 4)                   # Sol's door at the far end, behind G9 (pink)
    L.clear(14, 3, 14, 4).floorgate(14, 3, 2, 4)           # G10 (pink) joins the top floor to the hub's
    L.clear(11, 25, 13, 27).plat(11, 25, 3, 1, 0, 2, 5)    # a yellow hatch over a pocket by the entrance
    L.lever(12, 26, 1, on=True)                            # L3 (green, on), in the pocket: walking left through it frees Luna
    # ---- hub (x 15-24): F1 floor 25, F2 floor 15, F3 floor 5
    L.clear(15, 2, 24, 24)
    L.r(15, 15, 24, 15).r(15, 5, 24, 5)
    L.clear(16, 25, 18, 27).cells(16, 28, 18, 28, 1).mv(1, 0, -13).invert(1)   # pit A's floor: a lift held down while green is on
    L.clear(16, 15, 18, 15)
    L.plate(17, 27, 0)                                     # P1
    L.clear(21, 15, 23, 18).r(20, 16, 20, 19).r(24, 16, 24, 19)
    L.plat(21, 19, 3, 1, 0, -14, 3)                        # pit B, its floor a lift (white)
    L.clear(21, 5, 23, 5)
    L.plate(22, 18, 2)                                     # P4
    L.plate(24, 14, 4)                                     # P7
    L.plate(15, 4, 4)                                      # P8, by G10 at the far end from Luna's exit
    L.r(17, 6, 20, 7)                                      # a hanging rock in F2
    L.p(24, 4, 'B')
    L.gate(22, 23, 24, '=', 0, 21).p(24, 24, 'b')          # Luna starts shut in a cell behind G0 (purple)
    L.plate(15, 24, 0).p(19, 24, 'a')                      # P0 at the far end of F1 opens it
    # ---- east wing (x 26-38): in at F2, down two drops to the flooded bottom, up a lift to the F3 exit
    L.clear(26, 11, 34, 14).clear(26, 16, 34, 19).clear(26, 21, 34, 24).clear(26, 2, 34, 4)
    L.clear(32, 15, 33, 15).clear(26, 20, 27, 20)         # the two drops, at opposite ends
    L.r(34, 11, 34, 14).r(34, 16, 34, 19)                  # the corridors are walled off from the lift shaft
    L.gate(25, 13, 14, '_', 2, 11)                         # G4 (orange)
    L.gate(27, 13, 14, ':', 5, 11)                         # G2 (yellow), just inside G4
    L.r(28, 21, 33, 22).pool(29, 25, 4, 'M')               # moon channel under a low roof
    L.lever(34, 24, 3)                                     # L5: walking right through it lifts both white floors
    L.clear(35, 2, 37, 25).plat(35, 25, 3, 1, 0, -20, 4)   # the east lift (pink), up to the top floor: Luna can't drive it
    L.clear(25, 3, 25, 4).floorgate(25, 3, 2, 4)           # G8 (pink), the exit onto F3
    L.r(29, 16, 30, 17).r(31, 2, 33, 2)                    # hanging rocks
    # ---- gems
    L.p(6, 18, 's').p(6, 8, 's').p(12, 3, 's').p(24, 20, 's').p(7, 16, 's')
    L.p(27, 3, 'm').p(33, 12, 'm').p(32, 18, 'm').p(26, 22, 'm').p(29, 18, 'm')
    return L
