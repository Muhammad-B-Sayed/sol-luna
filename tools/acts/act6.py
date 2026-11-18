"""Act 6: level 32, the finale. See docs/level-plan.md for the brief.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js 32`.
"""
from lvdsl import Lv, level, W, H

# Painting helpers (rooms painted onto solid rock with exact coordinates).


def canvas():
    return [['#'] * (W + 1) for _ in range(H + 1)]      # C[y][x], 1-based


def paint(C, x0, y0, x1, y1, ch='.'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            C[y][x] = ch


def put(C, x, y, s):
    for i, ch in enumerate(s):
        C[y][x + i] = ch


def flush(L, C):
    for y in range(1, H + 1):
        for x in range(1, W + 1):
            L.set(x, y, C[y][x])
    return L


def gate_plat(L, x, y0, y1, g, inv=False):
    """Gate cells at column x rows y0..y1 that rise into an already-painted slot above."""
    h = y1 - y0 + 1
    return L.plat(x, y0, 1, h, 0, -h, g, inv)


@level(32)
def heart_of_twilight():
    """Heart of Twilight, the finale. Each wing is four bands seven rows apart (floors 28, 21, 14, 7),
    so every jump in the room has its full arc. The start hall sits under the heart; Sol's wing
    is west, Luna's east, the top floor spans the room with a ferry over a shade pit, and the
    heart in the middle holds both doors behind four floor gates in a row: orange and white open
    while a crate sits in each socket, pink while the pink lever is on, yellow while the yellow
    lever is off. Each wing's climb is four steps, and each is worked from the other wing: a lift
    up to band 1, a gate across band 1, a lift to band 2 and a lift to the top.

    1. Both start in the hall. Sol holds orange at its west end: Luna's gate opens and she wades
       her moon channel into the east wing. She holds white there: Sol wades his sun channel west.
    2. Each pushes their crate onto their wing's first lift. Sol holds green: Luna and crate 1 rise.
       She parks the crate at her band-1 gate and holds purple: Sol and crate 0 rise.
    3. Sol parks his crate at his gate and holds orange: Luna's gate opens, her crate goes through
       onto her next lift, and she holds white: Sol's gate opens and his crate reaches his lift.
    4. Sol holds purple: Luna and crate 1 rise to band 2. She loads the crate on her top lift and
       holds green: Sol and crate 0 rise. He loads his crate and holds orange: Luna rides to the
       top and pushes crate 1 down chute B into the white socket. She holds purple on the top
       floor: Sol rides up and pushes crate 0 down chute A into the orange socket.
    5. Luna holds pink: the ferry carries Sol east, where he turns the yellow lever off at the far
       end. She lets go and he rides back. He holds pink: the ferry fetches Luna, and she turns the
       pink lever on at the far west end.
    6. Both drop back into band 2, walk east over crate 0 through the four open gates into the
       heart, take a gem from its sunken point and one from the opposite lobe, and make the full
       4-tile jump up into their own lobe to stand at their doors.

    Signature jumps: the 4-tile climbs to the corner shelves in band 0 and into the lobes, and
    the 4-wide leaps over the lift holes on the top floor."""
    L = Lv('Heart of Twilight', 130, 'The heart opens only when both crates sit in their sockets and both levers are set.')
    C = canvas()
    # ---- the top floor (stand 6): the ferry runs over a shade pit, a step up from either landing
    paint(C, 1, 1, 38, 6)
    paint(C, 19, 1, 20, 3, '#')                              # a stone hanging over the pit
    paint(C, 1, 1, 2, 2, '#'); paint(C, 37, 1, 38, 2, '#')
    put(C, 13, 6, '#'); put(C, 26, 6, '#')                   # the ferry landings
    put(C, 14, 7, 'X' * 12)                                  # the pit
    paint(C, 5, 7, 7, 7); paint(C, 10, 7, 11, 7)             # WT's hole, chute A
    paint(C, 28, 7, 29, 7); paint(C, 32, 7, 34, 7)           # chute B, ET's hole
    put(C, 2, 6, '^'); put(C, 12, 6, '5'); put(C, 27, 6, '5'); put(C, 35, 6, '1'); put(C, 37, 6, '&')
    # ---- band 2 (stand 13): rows 8-13; each wing's socket is a dip beside the middle
    paint(C, 1, 8, 12, 13); paint(C, 28, 8, 38, 13)
    paint(C, 1, 14, 3, 14); paint(C, 5, 14, 7, 14)           # WU's hole, WT at rest
    paint(C, 10, 14, 11, 14); put(C, 10, 14, '3')            # socket A (orange)
    paint(C, 36, 14, 38, 14); paint(C, 32, 14, 34, 14)
    paint(C, 28, 14, 29, 14); put(C, 29, 14, '4')            # socket B (white)
    put(C, 4, 13, '3'); put(C, 35, 13, '2')                  # Sol's orange (ET), Luna's green (WU)
    # the four locks: full-height floor gates in x13-16 that sink into rows 14-19
    paint(C, 13, 8, 16, 19)
    # the heart: two lobes in the outer walls hold the doors; the point sinks between them
    paint(C, 17, 8, 25, 13)
    paint(C, 17, 10, 18, 10, '#'); paint(C, 24, 10, 25, 10, '#')   # lobe floors (stand 9): a full jump up
    paint(C, 20, 14, 22, 16)                                 # the point, three deep (stand 16)
    put(C, 17, 9, 'B'); put(C, 25, 9, 'A')                   # Luna's door left, Sol's right
    # ---- band 1 (stand 20): rows 15-20; a gate wall splits each wing
    paint(C, 1, 15, 11, 20); paint(C, 28, 15, 38, 20)
    paint(C, 1, 21, 3, 21); paint(C, 9, 21, 11, 21)          # WU at rest, WL's hole
    paint(C, 36, 21, 38, 21); paint(C, 28, 21, 30, 21)
    paint(C, 5, 15, 6, 16, '#'); paint(C, 6, 17, 6, 18, '#') # Sol's gate wall (white gate x5)
    paint(C, 33, 15, 34, 16, '#'); paint(C, 33, 17, 33, 18, '#')   # Luna's (orange gate x34)
    paint(C, 10, 15, 11, 15, '#'); paint(C, 28, 15, 29, 15, '#')   # under the sockets
    put(C, 4, 20, '1'); put(C, 8, 20, '3'); put(C, 31, 20, '1'); put(C, 35, 20, '4')
    # ---- band 0 (stand 27): rows 22-27; a high corner shelf in each wing
    paint(C, 1, 22, 12, 27); paint(C, 27, 22, 38, 27)
    paint(C, 1, 24, 3, 27, '#'); paint(C, 36, 24, 38, 27, '#')
    paint(C, 9, 28, 11, 28); paint(C, 28, 28, 30, 28)        # WL and EL at rest
    put(C, 12, 27, '2'); put(C, 27, 27, '4')                 # Sol's green (EL), Luna's white (his hall gate)
    # the hall and the two personal channels out of it
    paint(C, 17, 21, 22, 27); paint(C, 13, 26, 26, 27)
    put(C, 13, 28, 'SSS'); put(C, 24, 28, 'MMM')
    paint(C, 16, 24, 16, 25); paint(C, 23, 24, 23, 25)       # the hall gates' slots
    paint(C, 18, 27, 21, 27, '#')                            # a dais
    put(C, 17, 27, '3')                                      # Sol's orange: Luna's way out
    put(C, 19, 26, 'a'); put(C, 20, 26, 'b')
    put(C, 8, 27, 'k'); put(C, 31, 27, 'k')
    for x, y in ((18, 21), (20, 16), (2, 23), (9, 9), (18, 9), (38, 6)):
        put(C, x, y, 's')
    for x, y in ((21, 21), (22, 16), (37, 23), (30, 9), (24, 9), (1, 6)):
        put(C, x, y, 'm')
    flush(L, C)
    L.plat(9, 28, 3, 1, 0, -7, 0)          # WL (purple): band 0 -> 1, Sol and crate 0
    L.plat(1, 21, 3, 1, 0, -7, 1)          # WU (green): band 1 -> 2
    L.plat(5, 14, 3, 1, 0, -7, 0)          # WT (purple): band 2 -> top
    L.plat(28, 28, 3, 1, 0, -7, 1)         # EL (green): Luna and crate 1
    L.plat(36, 21, 3, 1, 0, -7, 0)         # EU (purple)
    L.plat(32, 14, 3, 1, 0, -7, 2)         # ET (orange)
    L.plat(14, 6, 3, 1, 9, 0, 4)           # the ferry (pink)
    gate_plat(L, 5, 19, 20, 3)             # Sol's band-1 gate (white)
    gate_plat(L, 34, 19, 20, 2)            # Luna's band-1 gate (orange)
    for x, g, inv in ((13, 2, False), (14, 3, False), (15, 4, False), (16, 5, True)):
        L.plat(x, 8, 1, 6, 0, 6, g, 1 if inv else 0)    # the locks sink to open; yellow is inverted
    L.leverOn.append(5)
    gate_plat(L, 16, 26, 27, 3)            # Sol's way out of the hall (white)
    gate_plat(L, 23, 26, 27, 2)            # Luna's (orange)
    return L
