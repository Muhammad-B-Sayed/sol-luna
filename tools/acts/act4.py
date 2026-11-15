"""Act 4 (round 2): levels 16, 17 and 28. See docs/level-plan.md for the brief of each level.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js <n>`.
"""
from lvdsl import Lv, level

# Define helpers that only this file needs here, not in tools/lvdsl.py.


def solid(L):
    """Start from solid rock; rooms are carved out of it."""
    return L.r(1, 1, 38, 28)


@level(16)
def high_noon():
    """High Noon, the chapter II exam. A cross: four arms meet at a hub in the middle of the screen.
    The west arm is a counterweight pair, the bottom arm a pit you are lifted out of, the east arm a
    shade lake crossed on a crate, and the top arm a lift whose plate is far away in the east arm. The
    doors are at the ends of the two branches of the top arm. Each arm opens the next, so the order is
    west, bottom, east, top.
    Both start on the hub floor. The pit under the hub is sealed by an orange hatch, and the east arm
    is shut by pink gate GE.
    1. Sol holds P1 (purple) at the east end of the hub: gate GW opens and Luna runs into the west arm.
    2. Luna runs to the far end of the west floor and back east through lever L1 (purple): GW stays open.
    3. Luna stands on lift WA. Sol holds P2a (green) in the hub: WA lifts her to the mid ledge, and the
       other green lift WB comes down to the floor.
    4. Luna holds P2b (green) on the mid ledge. Sol runs into the west arm onto WB. Luna steps off: WB
       carries Sol up the west wall into the attic, and WA sinks.
    5. Sol crawls east along the attic through lever L6 (orange) and drops into the hub: the hatch
       swings up into a ledge and the pit is open.
    6. Luna drops into the pit and stands on P3 (pink), which sits on the pit's floor, a lift (yellow):
       GE opens. Sol walks in through lever L3 (pink), so GE stays open from now on.
    7. Sol pushes the crate along the low corridor and off its end. It lands in the middle of the shade
       lake. Under the corridor's low roof nobody can jump, so the crate is the only way across.
    8. Sol drops onto the crate, hops to the far shore and climbs the east tower to the upper floor, a
       crawlway too low to jump in. He passes P4 (white) and walks left through lever L5 (yellow, on at
       the start): the pit floor rises and carries Luna up. He can't get back past L5 without switching it
       on again, so he drops into the hub at the crawlway's end and stands on the top lift T.
    9. Swap. Luna goes through GE, crosses the lake on the crate, climbs the tower and holds P4: T carries
       Sol to the junction at the top.
    10. Luna crawls left (L5 stays off) and drops into the hub onto T, which came back down. Sol holds
       P4b (white) at the junction: T carries her up.
    11. Sol walks the west branch to his door, Luna the east branch to hers."""
    L = Lv('High Noon', 65, 'Every arm holds a machine you have met. Each one opens the next: find the order.')
    solid(L)
    # ---- top arm: the junction and two branches, doors at the far ends
    L.clear(2, 2, 9, 3).clear(10, 2, 16, 4).clear(17, 2, 23, 5).clear(24, 2, 29, 4).clear(30, 2, 37, 3)
    L.p(3, 3, 'A').p(36, 3, 'B')
    L.clear(6, 4, 7, 5)                                    # a pocket under the west branch
    L.clear(32, 1, 33, 1)                                  # a pocket in the east branch roof
    L.r(13, 2, 14, 2).r(26, 2, 27, 2)                      # roof rocks
    L.plate(17, 5, 3)                                      # P4b (white)
    L.clear(19, 6, 21, 21)                                 # the top lift's shaft; T rests in the hub floor
    L.plat(19, 21, 3, 1, 0, -15, 3)                        # T (white)
    # ---- west arm: attic (rows 10-11), mid ledge, floor (row 21); WB on the west wall, WA by the gate
    L.clear(2, 10, 16, 11)                                 # the attic
    L.clear(2, 12, 4, 21)                                  # WB's shaft, from the attic floor to the west floor
    L.plat(2, 12, 3, 1, 0, 9, 1)                           # WB (green): rests in the attic floor, comes down on green
    L.clear(5, 13, 12, 20)
    L.r(5, 16, 8, 16)                                      # the mid ledge
    L.plate(6, 15, 1)                                      # P2b
    L.clear(9, 13, 11, 21)
    L.plat(9, 21, 3, 1, 0, -5, 1)                          # WA (green): rests in the floor, rises to the mid ledge
    L.lever(5, 20, 0)                                      # L1 keeps GW open
    L.gate(13, 19, 20, '=', 0, 17)                         # GW (purple)
    L.lever(14, 11, 2)                                     # L6 (orange) opens the pit
    # ---- hub (x 14-25, rows 13-20, floor 21)
    L.clear(14, 13, 25, 20)
    L.r(14, 13, 15, 14)                                    # a rock under the attic's end
    L.clear(16, 12, 16, 12)                                # the attic's way down into the hub
    L.r(14, 16, 14, 18)                                    # GW's pillar, hub side
    L.plate(23, 20, 1)                                     # P2a: far from WA, so nobody can work it alone
    L.plate(24, 20, 0)                                     # P1: far from GW
    L.p(22, 20, 'a').p(18, 20, 'b')
    L.clear(15, 21, 17, 26)                                # the pit, under the hatch
    L.plat(15, 21, 3, 1, 0, -4, 2)                         # hatch (orange): swings up into a ledge
    # ---- bottom arm: galleries either side of the pit bottom (rows 23-26, floor 27)
    L.clear(8, 23, 25, 26)
    L.clear(15, 27, 17, 27)
    L.plat(15, 27, 3, 1, 0, -6, 5, inv=True)               # the pit floor (yellow): rises while L5 is off
    L.plate(16, 26, 4)                                     # P3 (pink), on the pit floor
    L.clear(5, 25, 7, 26)                                  # a notch at the west end
    L.r(10, 26, 11, 26)                                    # a step in the west gallery
    L.pool(20, 27, 2, 'M')
    L.r(23, 25, 25, 26)                                    # a block in the east gallery
    L.r(19, 23, 20, 23)                                    # a hanging rock
    # ---- east arm: GE, the low corridor with the crate, the shade lake, the tower, the upper floor
    L.gate(26, 19, 20, '~', 4, 17)                         # GE (pink)
    L.clear(27, 19, 30, 20)                                # the low corridor: roof row 18, floor row 21
    L.lever(27, 20, 4)                                     # L3 (pink): once someone walks in, GE stays open
    L.p(29, 20, 'k')
    L.clear(31, 16, 38, 23).clear(27, 22, 30, 23)
    L.r(31, 18, 31, 18)                                    # the roof reaches one past the corridor's end
    L.pool(27, 24, 8, 'X')                                 # the lake, x 27-34
    L.r(35, 21, 38, 23)                                    # the far shore, as high as the corridor: a fall can't reach it
    L.r(37, 19, 38, 19)                                    # tower step B
    L.r(34, 17, 35, 17)                                    # tower step C
    L.clear(22, 13, 38, 14).clear(34, 15, 38, 16)          # the upper floor's low room (rows 13-14: no jumping) and the tower top
    L.r(24, 15, 33, 15)                                    # the upper floor
    L.lever(28, 14, 5, on=True)                            # L5 (yellow, on): walking left through it frees the pit
    L.plate(32, 14, 3)                                     # P4 (white) drives T, beyond L5: whoever frees the pit can't hold it
    L.clear(16, 1, 16, 1)                                  # a pocket in the west branch roof
    # ---- gems
    L.p(6, 5, 's').p(16, 15, 's').p(38, 16, 's').p(16, 1, 's')
    L.p(7, 13, 'm').p(6, 25, 'm').p(24, 23, 'm').p(32, 1, 'm')
    return L


def stone_pool(L, x, y, w, sx, g):
    """A shade pool w wide in row y from column x, with one stepping stone at column sx that rises
    out of the stone below into the pool while group g is active."""
    L.pool(x, y, w, 'X')
    L.clear(sx, y + 1, sx, y + 1)
    return L.plat(sx, y + 1, 1, 1, 0, -1, g)


@level(17)
def shade_garden():
    """Shade Garden. A braid: two strands that cross twice in a central column (crossing C1 low, C2
    high) and bulge out into lobes on alternate sides, then weave once more at the end. Sol's strand
    runs bottom left, right lobe, top left; Luna's runs bottom right, left lobe, top right. Every run
    is a low terrace over shade pools, and each pool has one stepping stone that only the partner can
    raise, so the two leapfrog up the braid, one hopping while the other works the stones. Low roofs
    cap every jump: a five-wide pool can't be jumped, a stone in its middle makes two tight hops, and
    most plates sit on one-tile perches between pools. Each colour raises stones in two places far
    apart: a plate low down, and a lever or plate high up. Riders can't drive any of the four lifts.
    1. Bottom. Luna holds P0 by her start: stone S1 rises. Sol hops S1 and holds P1: L1 rises.
       Luna hops L1 and holds P2: S2 rises. Sol hops S2 and holds P3 at C1: L2 rises, Luna hops it.
    2. C1, the first crossing. Luna stands on its lift; Sol holds its floor plate and she rides up.
       She holds the plate on the left ledge and he rides up. Sol leaves right through a sun channel,
       Luna left through a moon channel.
    3. Middle, lower runs. Sol holds P4 at the start of his lower run: L3 rises. Luna hops L3 and holds
       P5: S3 rises. Sol hops S3 onto the east lift.
    4. Luna holds Q1 at the foot of her shaft: the east lift carries Sol up. Luna stands on the west
       lift; Sol holds Q2 up on his side: it carries her up.
    5. Middle, upper runs. Sol holds P6: L4 rises. Luna hops L4 and walks through lever K7 (green):
       S4 rises for good. Sol hops S4.
    6. C2, the second crossing, like C1: Luna rides up while Sol holds the floor plate, then holds the
       ledge plate for him. Sol leaves left, Luna right.
    7. Top. Luna walks through lever K8 (orange): S5 rises. Sol hops S5 and holds P9: L5 rises. Luna
       hops L5 and walks through lever K10 (pink): S6 rises. Sol hops S6 and holds P11: L6 rises.
    8. The last weave. Luna hops L6 and drops down Sol's shaft onto the east lift; Sol drops down
       hers and holds Q1: she rides up to her door. He stands on the west lift and she holds Q2: he
       rides up to his door."""
    L = Lv('Shade Garden', 75, 'Your partner raises your stepping stones. Low roofs: no big jumps here.')
    solid(L)
    # ---- bottom: Sol's run on the left (floor 27), Luna's on the right (floor 26)
    L.clear(1, 23, 15, 26)
    L.p(2, 26, 'a')
    stone_pool(L, 3, 27, 5, 5, 0)                          # S1 (purple): P0
    L.r(8, 26, 8, 26).plate(8, 25, 1)                      # P1 (green) raises L1, on a perch
    stone_pool(L, 10, 27, 5, 12, 2)                        # S2 (orange): P2
    L.plate(15, 26, 3)                                     # P3 (white) raises L2
    L.clear(24, 22, 38, 25)
    L.p(38, 25, 'b').r(36, 25, 36, 25).plate(36, 24, 0)    # P0 (purple) raises S1, on a perch
    stone_pool(L, 31, 26, 5, 33, 1)                        # L1 (green): P1
    L.r(30, 25, 30, 25).plate(30, 24, 2)                   # P2 (orange) raises S2, on a perch
    stone_pool(L, 24, 26, 5, 26, 3)                        # L2 (white): P3
    # ---- C1, the low crossing (x 16-23, rows 17-25, floor 26)
    L.clear(16, 17, 23, 25)
    L.r(16, 21, 17, 23).r(22, 21, 23, 21)                  # side ledges at the two exits
    L.clear(19, 26, 21, 26).plat(19, 26, 3, 1, 0, -5, 0)   # lift C1 (purple) up to the ledges
    L.plate(17, 25, 0)                                     # its plate on the floor
    L.plate(16, 20, 0)                                     # and on the left ledge
    # ---- middle, left lobe (Luna): lower run floor 21 going west, stair, upper run floor 15 going east
    L.clear(1, 17, 15, 20)
    L.r(13, 17, 15, 18).pool(14, 21, 2, 'M')               # moon channel under a low roof: Luna only
    stone_pool(L, 8, 21, 5, 10, 4)                         # L3 (pink): P4
    L.r(7, 20, 7, 20).plate(7, 19, 5)                      # P5 (yellow) raises S3, on a perch
    L.clear(1, 11, 6, 16)                                  # the lift shaft at the west wall
    L.clear(4, 21, 6, 21).plat(4, 21, 3, 1, 0, -6, 3)      # west lift (white): Luna rides, Sol drives
    L.plate(2, 20, 3)                                      # Q1 (white): Luna drives Sol's lift from here
    L.clear(7, 11, 15, 14)
    stone_pool(L, 9, 15, 5, 11, 0)                         # L4 (purple): P6
    L.lever(14, 14, 1)                                     # K7 (green) raises S4 for good
    # ---- middle, right lobe (Sol): lower run floor 20 going east, stair, upper run floor 14 going west
    L.clear(24, 16, 38, 19)
    L.r(24, 16, 25, 17).pool(24, 20, 2, 'S')               # sun channel under a low roof: Sol only
    L.plate(26, 19, 4)                                     # P4 (pink) raises L3
    stone_pool(L, 27, 20, 5, 29, 5)                        # S3 (yellow): P5
    L.clear(31, 10, 38, 15)                                # the lift shaft at the east wall
    L.clear(33, 20, 35, 20).plat(33, 20, 3, 1, 0, -6, 3)   # east lift (white): Sol rides, Luna drives
    L.r(36, 14, 37, 14).plate(36, 13, 3)                   # Q2 (white): Sol drives Luna's lift from here
    L.clear(24, 10, 30, 13)
    L.r(30, 14, 32, 14)                                    # the top of the stair
    L.r(31, 13, 31, 13).plate(31, 12, 0)                   # P6 (purple) raises L4, on a perch
    stone_pool(L, 25, 14, 5, 27, 1)                        # S4 (green): K7
    # ---- C2, the high crossing (x 16-23, rows 2-14)
    L.clear(16, 2, 23, 14)
    L.r(20, 14, 23, 14)                                    # the right half of its floor is a step higher
    L.clear(16, 15, 18, 15).plat(16, 15, 3, 1, 0, -8, 5)   # lift C2 (yellow) up to the top runs
    L.plate(22, 13, 5)                                     # its plate on the floor
    L.r(20, 6, 23, 6).plate(21, 5, 5)                      # a ledge to Luna's exit, with its plate
    L.r(20, 9, 21, 9).r(19, 10, 20, 11)                    # a hanging rock
    # ---- top: Sol's run on the left (floor 7) going west, Luna's on the right (floor 6) going east
    L.clear(1, 3, 15, 6)
    L.r(15, 3, 15, 4).pool(15, 7, 1, 'S')                  # sun channel under a low roof
    stone_pool(L, 9, 7, 5, 11, 2)                          # S5 (orange): K8
    L.r(8, 6, 8, 6).plate(8, 5, 3)                         # P9 (white) raises L5, on a perch
    stone_pool(L, 3, 7, 5, 5, 4)                           # S6 (pink): K10
    L.r(2, 6, 2, 6).plate(2, 5, 5)                         # P11 (yellow) raises L6, on a perch
    L.clear(1, 7, 1, 10)                                   # a drop into Luna's shaft
    L.clear(24, 2, 38, 5)
    L.r(24, 2, 24, 3).pool(24, 6, 1, 'M')                  # moon channel under a low roof
    L.lever(25, 5, 2)                                      # K8 (orange) raises S5
    stone_pool(L, 26, 6, 5, 28, 3)                         # L5 (white): P9
    L.lever(32, 5, 4)                                      # K10 (pink) raises S6
    stone_pool(L, 33, 6, 5, 35, 5)                         # L6 (yellow): P11
    L.clear(38, 6, 38, 9)                                  # a drop into Sol's shaft
    L.p(7, 14, 'A')                                        # Sol's door, at the top of Luna's lift
    L.p(37, 13, 'B')                                       # Luna's door, at the top of Sol's lift
    # ---- gems, in pockets off the runs
    L.clear(5, 22, 5, 22).p(5, 22, 's')                    # over S1: jump from its stone
    L.p(20, 18, 's')                                       # high in C1, off the lift
    L.p(37, 10, 's')                                       # over the high ledge in the east shaft
    L.p(23, 4, 's')                                        # C2's high ledge
    L.clear(4, 2, 4, 2).p(4, 2, 's')                       # over S6
    L.clear(33, 21, 33, 21).p(33, 21, 'm')                 # over L1
    L.p(5, 11, 'm')                                        # over the west lift's top stop
    L.p(23, 17, 'm')                                       # high in C1
    L.p(23, 12, 'm')                                       # C2's raised floor
    L.clear(35, 1, 35, 1).p(35, 1, 'm')                    # over L6
    return L


def door_gate(L, x, y0, h, g, inv=False):
    """A one-wide gate at column x, rows y0..y0+h-1, that rises into an empty slot right above it
    while group g is active. The caller leaves stone around the slot."""
    L.clear(x, y0 - h, x, y0 + h - 1)
    return L.plat(x, y0, 1, h, 0, -h, g, inv)


@level(28)
def the_vault():
    """The Vault. A ring of four corner rooms around a vault in the middle of the screen. The crates
    go into the vault from the top, down a shaft sealed by three hatches, and each corner room that is
    not the start opens one hatch for good. The players go in from the sides, through gates that only
    the crates open. Each player holds plates in one corner for the other in the diagonal corner.
    Two crates, each with two jobs: crate A is a step in the top-left room, crate B is carried up the
    east lift and is a weight in the top-right room. Then both stack in one deep socket in the vault.
    The top-left and top-right rooms need both players; the bottom-right one Sol does alone while
    Luna is busy above. Both lifts rest at the top and come down while a white plate is held.
    Both start in the bottom-left room.
    1. Sol holds P_W (white): the west lift W comes down. Luna steps on, Sol lets go, and W carries her
       up the west shaft into a cell in the top-left room, beside crate A.
    2. Luna holds P_Bot (yellow) in the cell: gate G_Bot opens and Sol runs the bottom band under the
       vault to the bottom-right room, a tower of ledges with his three plates on it.
    3. Sol holds P_A (purple) on its floor: gate G_A opens and Luna pushes crate A out of the cell.
    4. Luna hops from crate A up to a high ledge and walks through lever L1 (purple): hatch H1 opens.
    5. Sol climbs to P_Top (yellow): gate G_Top opens and Luna pushes crate A along the top band into
       the shaft, where it rests on hatch H2.
    6. Sol climbs to P_TR (pink): gate G_TR opens and Luna walks into the top-right room.
    7. Alone, Sol climbs to the top of his tower and walks through lever L3 (orange): H3 opens.
    8. Luna holds P_R (white): the east lift R comes down. Sol pushes crate B onto it and steps on
       behind it; she lets go and R carries them both up.
    9. Sol pushes crate B under the ledge onto P_G (green), which holds gate G_G open. Luna climbs
       through G_G and walks through lever L2 (green) on the ledge: H2 opens and crate A drops all the
       way into the vault's socket. Pink is on for good: G_TR and the vault's west gate GX stay open.
    10. Sol pushes crate B off P_G, out through G_TR and down the shaft onto crate A. Yellow is on for
        good: G_Top, G_Bot and the vault's east gate GY stay open.
    A player who drops down the shaft lands in the sealed crate chamber; the partner lets them out
    into the bottom band by holding any white plate, which opens a hatch too narrow for a crate.
    11. Luna stands on R and Sol holds P_R: it carries her down. Sol walks back across the top band to
        the west room and stands on W.
    12. Luna runs the bottom band home and holds P_W: W carries Sol down.
    13. Luna climbs the start room into the vault through GX to her door. Sol runs the bottom band,
        climbs his tower and goes in through GY to his."""
    L = Lv('The Vault', 95, 'Every corner opens one lock. Use each crate before you send it down to the vault.')
    solid(L)
    # ---- bottom-left: the start (rows 15-26, floor 27), the west lift W in x 1-3
    L.clear(1, 15, 12, 26)
    L.clear(1, 9, 3, 27).plat(1, 9, 3, 1, 0, 18, 3)        # W (white): rests at the top, comes down while white is on
    L.r(4, 10, 12, 14)                                     # rock between the shaft and the vault's corner
    L.r(9, 25, 10, 26).r(6, 23, 7, 23).r(9, 21, 12, 21)    # a climb to a ledge
    L.r(12, 22, 12, 24)                                    # G_Bot's slot closed on the room side
    L.r(4, 15, 6, 17)
    L.plate(8, 26, 3)                                      # P_W (white), far from W
    L.p(5, 26, 'a').p(4, 26, 'b')
    door_gate(L, 13, 25, 2, 5)                             # G_Bot (yellow) into the bottom band
    # ---- bottom band, under the vault (x 14-26, rows 23-27, floor 28)
    L.clear(14, 23, 26, 27)                                # a step lower than the corner rooms
    L.pool(18, 28, 2, 'X').r(22, 27, 23, 27).r(15, 23, 16, 23)
    # ---- bottom-right (x 27-38, rows 15-26, floor 27): Sol's plates, G_O and L3, the east lift R
    L.clear(27, 15, 38, 26)
    L.r(28, 25, 29, 26).r(31, 23, 32, 23).r(28, 21, 29, 21).r(31, 19, 32, 19)   # Sol's control tower
    L.plate(30, 26, 0)                                     # P_A (purple) on the floor opens G_A, up in the far corner
    L.plate(31, 22, 5)                                     # P_Top (yellow) on the first ledge opens G_Top
    L.plate(28, 20, 4)                                     # P_TR (pink) on the second ledge opens G_TR
    L.lever(32, 18, 2)                                     # L3 (orange) on top of the tower: hatch H3
    L.p(34, 26, 'k')                                       # crate B, beside the east lift
    L.clear(36, 9, 38, 27).plat(36, 9, 3, 1, 0, 18, 3)     # R (white): rests at the top, comes down while white is on
    # ---- top-left (x 1-12, rows 2-8, floor 9): the cell with crate A, the high ledge with L1
    L.clear(1, 2, 12, 8)
    L.r(4, 2, 6, 6)                                        # the cell's roof
    L.p(5, 8, 'k').plate(4, 8, 5)                          # crate A; P_Bot (yellow) in the cell
    door_gate(L, 7, 7, 2, 0)                               # G_A (purple)
    L.r(7, 2, 7, 4)
    L.r(10, 5, 11, 5)                                      # the high ledge: only from a crate
    L.lever(10, 4, 0)                                      # L1 (purple): hatch H1
    door_gate(L, 13, 7, 2, 5)                              # G_Top (yellow)
    L.r(13, 2, 13, 4).r(12, 5, 12, 6)
    # ---- top band (x 14-26, rows 2-8, floor 9) and the vault shaft (x 19-20)
    L.clear(14, 2, 26, 8)
    L.r(16, 2, 17, 4).r(23, 2, 24, 3)                      # hanging rocks
    L.r(14, 5, 14, 6).r(26, 5, 26, 6)                      # G_Top's and G_TR's slots are closed on the band side
    L.clear(19, 9, 20, 12)
    L.clear(17, 10, 18, 10).plat(19, 10, 2, 1, -2, 0, 0)   # H1 (purple) slides west
    L.clear(21, 11, 22, 11).plat(19, 11, 2, 1, 2, 0, 1)    # H2 (green) slides east
    L.clear(17, 12, 18, 12).plat(19, 12, 2, 1, -2, 0, 2)   # H3 (orange) slides west
    # ---- top-right (x 28-38, rows 2-8, floor 9): crate B, P_G, G_G, L2, Luna's plates for Sol
    door_gate(L, 27, 7, 2, 4)                              # G_TR (pink)
    L.r(27, 2, 27, 4)
    L.clear(28, 2, 38, 8)
    L.r(28, 5, 28, 6)                                      # G_TR's slot closed on the room side
    L.plate(28, 8, 3)                                      # P_R (white) brings R down
    L.plate(31, 8, 1)                                      # P_G (green): a weight holds G_G open
    L.r(34, 6, 35, 6)                                      # a ledge no crate can climb; the floor runs under it
    door_gate(L, 34, 4, 2, 1)                              # G_G (green), on the ledge's west end
    L.r(33, 2, 33, 3)                                      # G_G's slot, closed on the west
    L.lever(35, 5, 1)                                      # L2 (green): hatch H2. Leave by dropping off the east end
    # ---- the vault (x 15-24, rows 13-19, floor 20). The shaft drops into a sealed crate chamber
    # (x 18-22) where both crates stack in one deep socket: the bottom one opens GX on the west wall,
    # the top one GY on the east wall. Each door has its own side room behind its gate.
    L.clear(15, 13, 24, 19)
    L.r(17, 13, 17, 19).r(23, 13, 23, 19)                  # the crate chamber's walls
    L.clear(19, 20, 20, 21)
    L.plate(19, 21, 4).plate(20, 21, 4)                    # socket X (pink): the first crate
    L.plate(19, 20, 5).plate(20, 20, 5)                    # socket Y (yellow): the second, on top of it
    # A way out for a player who drops down the shaft too early: a one-wide hatch (too narrow for a
    # crate) that opens while a white plate is held, so only the partner can let them out.
    L.clear(22, 20, 22, 22).clear(23, 21, 23, 21).plat(22, 21, 1, 1, 1, 0, 3)
    L.r(15, 16, 15, 17).r(24, 16, 24, 17)                  # the two gates' slots, closed on the inside
    door_gate(L, 14, 18, 2, 4)                             # GX (pink), Luna's way in, from the start room
    L.clear(13, 18, 13, 19)
    door_gate(L, 25, 18, 2, 5)                             # GY (yellow), Sol's way in, from his tower
    L.clear(26, 18, 27, 19).r(27, 20, 27, 20)
    L.p(24, 19, 'A').p(16, 19, 'B')
    # ---- gems, on detours
    L.p(12, 20, 's')                                       # top of the start room's climb
    L.clear(25, 22, 26, 22).p(26, 22, 's')                 # a pocket in the bottom band's roof
    L.p(28, 17, 's')                                       # over the tower's second ledge
    L.p(37, 2, 's')                                        # top corner of the east room
    L.p(12, 2, 'm')                                        # over the high ledge in the west room
    L.p(1, 5, 'm')                                         # over the west lift's top stop
    L.p(22, 4, 'm')                                        # under the top band's hanging rock
    L.p(35, 2, 'm')                                        # over L2's ledge
    L.p(16, 16, 'm')                                       # high in the vault, by Luna's door
    L.p(5, 7, 's')                                         # in crate A's empty cell, on Sol's way home
    L.p(34, 22, 'm')                                       # over the foot of the east lift
    return L
