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
    is shut by pink gate GE. Floors are 7 rows apart wherever anyone jumps (re-spaced Nov 2026 for the
    higher jump); the crate drops five rows into the lake, so the climb of 3 out of it has full headroom.
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
    # Floors sit 7 rows apart wherever someone jumps: top corridor 4, attic 8, mid ledge 13,
    # crawlway 15, hub and west floor 20, shore 21, gallery 27.
    # ---- top arm: a low corridor (rows 2-3) with the junction over T, doors at the far ends
    L.clear(2, 2, 37, 3)
    L.p(3, 3, 'A').p(36, 3, 'B')
    L.clear(11, 1, 11, 1).clear(33, 1, 33, 1)              # pockets in the roof
    L.plate(17, 3, 3)                                      # P4b (white)
    L.clear(19, 4, 21, 20)                                 # the top lift's shaft; T rests in the hub floor
    L.plat(19, 20, 3, 1, 0, -16, 3)                        # T (white)
    # ---- west arm: attic (rows 6-7, floor 8), mid ledge (row 13), floor (row 20)
    L.clear(2, 6, 16, 7)                                   # the attic
    L.lever(14, 7, 2)                                      # L6 (orange) opens the pit
    L.clear(16, 8, 16, 12)                                 # the attic's way down into the hub
    L.clear(2, 8, 4, 20)                                   # WB's shaft, from the attic floor to the west floor
    L.plat(2, 8, 3, 1, 0, 12, 1)                           # WB (green): rests in the attic floor, comes down on green
    L.clear(5, 9, 11, 19)
    L.r(5, 13, 8, 13)                                      # the mid ledge: 7 above the floor, 5 below the attic
    L.plate(6, 12, 1)                                      # P2b
    L.clear(9, 20, 11, 20)
    L.plat(9, 20, 3, 1, 0, -7, 1)                          # WA (green): rests in the floor, rises to the mid ledge
    L.lever(5, 19, 0)                                      # L1 keeps GW open
    L.clear(12, 18, 12, 19)
    L.gate(13, 18, 19, '=', 0, 16)                         # GW (purple)
    # ---- hub (x 14-25, rows 13-19, floor 20)
    L.clear(15, 13, 22, 19).clear(14, 18, 14, 19)
    L.clear(22, 13, 33, 14)                                # the crawlway (rows 13-14, floor 15) leaves the hub's top
    L.clear(23, 16, 25, 19)                                # a nook under the crawlway's west end
    L.clear(22, 9, 24, 12)                                 # headroom where the crawlway drops into the hub
    L.plate(23, 19, 1)                                     # P2a: far from WA, so nobody can work it alone
    L.plate(24, 19, 0)                                     # P1: far from GW
    L.p(22, 19, 'a').p(18, 19, 'b')
    L.clear(15, 20, 17, 26)                                # the pit, under the hatch
    L.plat(15, 20, 3, 1, 0, -3, 2)                         # hatch (orange): swings up into a ledge
    # ---- bottom arm: the gallery under the hub (rows 21-26, floor 27)
    L.clear(7, 21, 25, 26)
    L.clear(15, 27, 17, 27)
    L.plat(15, 27, 3, 1, 0, -7, 5, inv=True)               # the pit floor (yellow): rises while L5 is off
    L.plate(16, 26, 4)                                     # P3 (pink), on the pit floor
    L.clear(5, 21, 6, 23)                                  # a pocket in the west wall, 3 up from the floor
    L.pool(19, 27, 2, 'M')
    L.r(22, 24, 25, 26)                                    # a block in the east gallery
    # ---- east arm: GE, the low corridor with the crate, the shade lake, the tower, the crawlway
    L.gate(26, 18, 19, '~', 4, 16)                         # GE (pink)
    L.clear(27, 18, 30, 19)                                # the low corridor: roof row 17, floor row 20
    L.lever(27, 19, 4)                                     # L3 (pink): once someone walks in, GE stays open
    L.p(29, 19, 'k')
    L.clear(31, 18, 34, 24).clear(32, 16, 33, 17)          # the lake's air; the roof reaches one past the corridor
    L.pool(31, 25, 4, 'X')                                 # the lake: five rows under the corridor, so the crate lands
                                                           # in it with room to jump out
    L.clear(34, 9, 38, 20)                                 # the tower
    L.r(37, 18, 38, 20)                                    # tower step B, on the shore's east end
    L.r(34, 15, 34, 15)                                    # the landing at the crawlway's mouth
    L.lever(28, 14, 5, on=True)                            # L5 (yellow, on): walking left through it frees the pit
    L.plate(32, 14, 3)                                     # P4 (white) drives T, beyond L5: whoever frees the pit can't hold it
    # ---- gems
    L.p(17, 16, 's').p(38, 12, 's').p(11, 1, 's').p(24, 16, 's')
    L.p(5, 12, 'm').p(5, 23, 'm').p(25, 23, 'm').p(33, 1, 'm')
    return L


def stone_pool(L, x, y, w, sx, g):
    """A shade pool w wide in row y from column x, with one stepping stone at column sx that rises
    out of the stone below into the pool while group g is active."""
    L.pool(x, y, w, 'X')
    L.clear(sx, y + 1, sx, y + 1)
    return L.plat(sx, y + 1, 1, 1, 0, -1, g)


def mound(L, x, f, g, east=True):
    """A shade tunnel on a low mound in a band whose floor is row f, x..x+5: a 4-wide shade pool
    (x+1..x+4) in row f-1 under a roof with exactly 2 free rows. A 2-wide stone rises out of the floor
    into the pool's middle while group g is active. Nobody can jump four shade cells under a 2-row
    roof; with the stone up it is two short hops. The side you enter from is a ramp and the side you
    leave by is a flat step, so the hop out lands level (east=True: crossed from west to east)."""
    L.set(x, f - 1, '/' if east else '#')
    L.set(x + 5, f - 1, '#' if east else '\\')
    L.pool(x + 1, f - 1, 4, 'X')
    L.r(x + 1, f - 6, x + 4, f - 4)
    L.clear(x + 2, f, x + 3, f)
    return L.plat(x + 2, f, 2, 1, 0, -1, g)


def channel(L, x, f, w, kind):
    """A character-only channel: a pool w wide in the band floor (row f) under a roof with 2 free rows."""
    L.pool(x, f, w, kind)
    return L.r(x, f - 6, x + w - 1, f - 3)


@level(17)
def shade_garden():
    """Shade Garden. A braid in four bands 7 rows apart (floors 28, 21, 14, 7). Sol's strand runs
    bottom left, lower right, upper right, top left; Luna's bottom right, lower left, upper left, top
    right. The strands cross at two lifts in the centre (C1 bottom to lower, C2 upper to top), and each
    crossing sends Sol out through a sun channel and Luna through a moon channel. Every run is
    broken by shade tunnels on low mounds: four shade cells under a roof two rows high, which no
    jump can clear. Each tunnel has a stepping stone that only the partner can raise, so the two
    leapfrog up the braid. Outside the tunnels every band has full headroom for the climbs and the
    high gems. Each colour raises stones in places far apart, and riders can't drive any lift.
    1. Bottom. Luna holds P0 by her start: S1 rises. Sol hops S1 and holds P1: L1 rises. Luna hops
       L1 and holds P2: S2 rises. Sol hops S2 and holds P3 by C1: L2 rises (and C1 with it).
    2. C1. Sol steps off; Luna boards C1 and Sol holds P3 again: she rides up and leaves west
       through the moon channel. Sol steps off, the lift comes down, he boards, and Luna holds P5
       (yellow, like C1): he rides up and leaves east through the sun channel.
    3. Lower runs. P5 also raises S3: Sol hops S3 and holds P4 by the east lift: L3 rises. Luna hops
       L3. Sol boards the east lift and Luna holds Q1: it carries him up.
    4. Luna boards the west lift and Sol holds Q2 on his upper run: it carries her up.
    5. Upper runs. Sol holds P6: L4 rises. Luna hops L4 and walks through lever K7: S4 rises for
       good. Sol hops S4 into the C2 room.
    6. C2. Luna rides up while Sol holds the floor plate, then holds the top plate for him. Sol
       leaves west through a sun channel, Luna east through a moon channel.
    7. Top. Luna walks through lever K8: S5 rises for good. Sol hops S5 and holds P9: L5 rises.
       Luna hops L5 to her door; Sol walks back to his."""
    L = Lv('Shade Garden', 72, 'Your partner raises your stepping stones. The tunnels are too low to jump: wait for the stone.')
    solid(L)
    for f in (7, 14, 21, 28):
        L.clear(1, f - 6, 38, f - 1)
    # lifts: C1 (bottom to lower) and C2 (upper to top) in the centre, W and E at the walls
    L.clear(18, 28, 20, 28).clear(18, 21, 20, 21).plat(18, 28, 3, 1, 0, -7, 5)    # C1 (yellow)
    L.clear(18, 14, 20, 14).clear(18, 7, 20, 7).plat(18, 14, 3, 1, 0, -7, 2)      # C2 (orange)
    L.clear(1, 21, 3, 21).clear(1, 14, 3, 14).plat(1, 21, 3, 1, 0, -7, 3)         # W (white): Luna rides
    L.clear(36, 21, 38, 21).clear(36, 14, 38, 14).plat(36, 21, 3, 1, 0, -7, 3)    # E (white): Sol rides
    # ---- bottom (floor 28): Sol from the west, Luna from the east, C1 between them
    L.p(1, 27, 'a').p(37, 27, 'b')
    mound(L, 3, 28, 0)                                     # S1 (purple)
    L.plate(9, 27, 1)                                      # P1 (green) raises L1
    mound(L, 10, 28, 2)                                    # S2 (orange)
    L.plate(16, 27, 5)                                     # P3 (yellow) raises L2 and works C1
    mound(L, 22, 28, 5, east=False)                                    # L2 (yellow)
    L.plate(28, 27, 2)                                     # P2 (orange) raises S2
    mound(L, 29, 28, 1, east=False)                                    # L1 (green)
    L.plate(38, 27, 0)                                     # P0 (purple) raises S1
    # ---- lower (floor 21): Luna west to the W lift, Sol east to the E lift
    L.plate(5, 20, 3)                                      # Q1 (white): Luna sends Sol up
    mound(L, 7, 21, 4, east=False)                                     # L3 (pink)
    L.plate(13, 20, 5)                                     # P5 (yellow): works C1 from the top, raises S3
    channel(L, 14, 21, 4, 'M')                             # moon channel: Luna only
    channel(L, 22, 21, 4, 'S')                             # sun channel: Sol only
    mound(L, 27, 21, 5)                                    # S3 (yellow)
    L.plate(33, 20, 4)                                     # P4 (pink) raises L3
    # ---- upper (floor 14): Luna east from the W lift, Sol west from the E lift, C2 between
    mound(L, 5, 14, 0)                                     # L4 (purple)
    L.lever(12, 13, 1)                                     # K7 (green) raises S4 for good
    L.plate(22, 13, 2)                                     # C2's floor plate (orange)
    mound(L, 24, 14, 1, east=False)                                    # S4 (green)
    L.plate(31, 13, 0)                                     # P6 (purple) raises L4
    L.plate(33, 13, 3)                                     # Q2 (white): Sol sends Luna up
    # ---- top (floor 7): Sol west to his door, Luna east to hers
    L.p(2, 6, 'A').p(37, 6, 'B')
    L.plate(4, 6, 4)                                       # P9 (pink) raises L5
    mound(L, 6, 7, 0, east=False)                                      # S5 (purple)
    channel(L, 13, 7, 4, 'S')                              # sun channel
    L.plate(22, 6, 2)                                      # C2's top plate (orange)
    channel(L, 23, 7, 4, 'M')                              # moon channel
    L.lever(28, 6, 0)                                      # K8 (purple) raises S5 for good
    mound(L, 30, 7, 4)                                     # L5 (pink)
    # ---- gems: high in the bands, a full jump up from the floor
    for x, y in ((2, 22), (21, 22), (38, 15), (32, 8), (21, 2)):
        L.p(x, y, 's')
    for x, y in ((36, 22), (1, 15), (20, 16), (14, 8), (38, 1)):
        L.p(x, y, 'm')
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
