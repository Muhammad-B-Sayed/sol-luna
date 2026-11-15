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


# the heart: (row, first x, last x) of air, two lobes over a point
HEART = [(8, 18, 20), (8, 23, 25), (9, 17, 26), (10, 16, 27), (11, 16, 27), (12, 17, 26),
         (13, 18, 25), (14, 19, 24), (15, 20, 23), (16, 21, 22)]


@level(32)
def heart_of_twilight():
    """Heart of Twilight, the finale. Eight floors wrap a heart-shaped chamber in the middle of the
    screen: the start hall under its point, four stacked floors in each wing (Sol's west, Luna's
    east), and the top floor over its lobes with a ferry across a shade pit. The heart holds both
    doors, one in each lobe, behind four gates in a row: orange and white open while a crate sits
    in each socket, pink while the pink lever is on, and yellow while the yellow lever is off.
    Every colour has two jobs, so the colours on the lifts are chosen so that no press ever moves
    a lift someone has just loaded.

    1. Both start in the hall. Sol holds orange at its west end: Luna's gate opens and she wades
       her moon channel into the east wing.
    2. Luna holds white there: Sol's gate opens and he wades his sun channel into the west wing.
    3. Each pushes their crate off a ledge onto the first lift and gets behind it.
    4. The climb, eight lifts, each worked from the other wing: Sol green (Luna and crate 1 up),
       Luna purple (Sol and crate 0 up), Sol orange, Luna white, Sol purple, Luna green, Sol
       orange (Luna reaches the top). On every floor the rider pushes the crate across to the
       next lift, jumping over it when it has to go the other way, and steps clear before the
       partner lets go.
    5. Luna pushes crate 1 east along the top and down chute B into the white socket.
    6. Luna holds purple on the top floor: the last lift brings Sol up. He pushes crate 0 west down
       chute A into the orange socket.
    7. Sol rides the ferry east while Luna holds pink, turns the yellow lever off at the far east
       end, and rides back when she steps off.
    8. Sol holds pink on the west landing: Luna rides the ferry west. She turns the pink lever on
       at the far west end (the ferry now stays east, which no longer matters).
    9. Both drop down chute A onto crate 0, walk east through the four open gates into the heart,
       climb into the opposite lobe for a gem, and stand at their doors."""
    L = Lv('Heart of Twilight', 105, 'The heart opens only when both crates sit in their sockets and both levers are set.')
    C = canvas()
    # --- the heart, its ramped floor, and the doors at its point
    for (y, x0, x1) in HEART:
        paint(C, x0, y, x1, y)
    for (x, y) in ((16, 12), (17, 13), (18, 14), (19, 15), (20, 16)):
        C[y][x] = '\\'
    for (x, y) in ((27, 12), (26, 13), (25, 14), (24, 15), (23, 16)):
        C[y][x] = '/'
    paint(C, 18, 11, 20, 11, '#'); paint(C, 23, 11, 25, 11, '#')   # a ledge under each lobe
    put(C, 19, 10, 'B'); put(C, 24, 10, 'A')                   # Luna's door in the left lobe, Sol's in the right
    # the four locks into the heart (gates x12-15) and their slots
    paint(C, 11, 10, 15, 11); paint(C, 12, 8, 15, 9)
    # --- the top floor: pink lever L1 (west end), yellow lever L2 (east end), the ferry pit
    paint(C, 1, 2, 38, 5)
    paint(C, 11, 5, 13, 5, '#'); paint(C, 28, 5, 28, 5, '#')    # raised landings either side of the pit
    for x in (14, 20, 25):
        put(C, x, 2, '#')                                    # hanging stones
    paint(C, 1, 6, 2, 6); put(C, 4, 5, '^')                  # chute A, L1
    paint(C, 8, 6, 10, 6)                                    # WT arrival hole
    paint(C, 14, 6, 27, 6); put(C, 14, 7, 'XXXXXXXXXXXXXX')      # the pit the ferry crosses
    paint(C, 29, 6, 31, 6); put(C, 35, 5, '&'); paint(C, 37, 6, 38, 6)   # ET hole, L2, chute B
    put(C, 12, 4, '5'); put(C, 28, 4, '1'); put(C, 32, 5, '5')   # pink ferry plates; purple plate for WT
    # --- west wing (Sol): W2 rows 9-11, W1.5 rows 13-15, W1 rows 17-19, W0 rows 22-27
    paint(C, 1, 9, 10, 11); paint(C, 1, 7, 2, 8); paint(C, 8, 7, 10, 8)
    paint(C, 1, 12, 2, 12); put(C, 1, 12, '3')               # socket A (orange)
    paint(C, 3, 13, 11, 15); paint(C, 1, 14, 2, 15)          # W1.5
    paint(C, 5, 12, 7, 16); paint(C, 8, 12, 10, 12); paint(C, 8, 16, 10, 20)   # WU, WT rest, WM
    paint(C, 1, 17, 11, 19); paint(C, 1, 20, 4, 27)          # W1, WL shaft
    paint(C, 1, 22, 9, 27); paint(C, 1, 28, 4, 28)
    # --- east wing (Luna): the mirror image
    paint(C, 29, 9, 38, 11); paint(C, 37, 7, 38, 8); paint(C, 29, 7, 31, 8)
    paint(C, 37, 12, 38, 12); put(C, 38, 12, '4')            # socket B (white)
    paint(C, 28, 13, 36, 15); paint(C, 37, 14, 38, 15)       # E1.5
    paint(C, 32, 12, 34, 16); paint(C, 29, 12, 31, 12); paint(C, 29, 16, 31, 20)
    paint(C, 28, 17, 38, 19); paint(C, 35, 20, 38, 27)
    paint(C, 30, 22, 38, 27); paint(C, 35, 28, 38, 28)
    # --- the start hall under the heart, and the two personal channels out of it
    paint(C, 13, 22, 26, 27); paint(C, 17, 20, 22, 21); paint(C, 19, 26, 20, 27, '#'); paint(C, 22, 22, 24, 23, '#')
    paint(C, 13, 22, 14, 25, '#'); paint(C, 25, 22, 26, 25, '#')     # the hall is narrower; channel mouths
    paint(C, 10, 26, 14, 27); put(C, 10, 28, 'SSS'); paint(C, 13, 24, 13, 25)
    paint(C, 25, 26, 29, 27); put(C, 27, 28, 'MMM'); paint(C, 26, 24, 26, 25)
    paint(C, 5, 27, 8, 27, '#'); paint(C, 31, 27, 34, 27, '#')    # raised floors in the bottom wings
    paint(C, 17, 22, 18, 22, '#')                                  # a ledge under the hall's alcove
    # plates. Sol's side works Luna's lifts: green W0 (EL), orange W1 (EM), purple W1.5 (EU), orange W2 (ET).
    # Luna's side works Sol's: purple E1 (WL), white E1.5 (WM), green E2 (WU), purple top (WT).
    put(C, 7, 26, '2'); put(C, 11, 19, '3'); put(C, 2, 15, '1'); put(C, 3, 11, '3')
    put(C, 28, 19, '1'); put(C, 37, 15, '4'); put(C, 36, 11, '2')
    put(C, 16, 27, '3'); put(C, 32, 26, '4')                      # the hall gates' plates, far from their gates
    for x, y in ((1, 24), (3, 13), (4, 9), (15, 24), (19, 8), (29, 3)):
        put(C, x, y, 's')
    for x, y in ((38, 24), (36, 13), (35, 9), (24, 24), (24, 8), (10, 3)):
        put(C, x, y, 'm')
    put(C, 15, 27, 'a'); put(C, 24, 27, 'b'); put(C, 5, 26, 'k'); put(C, 34, 26, 'k')
    flush(L, C)
    L.plat(1, 28, 4, 1, 0, -8, 0)          # WL (purple): W0 -> W1, crate 0 rides on it
    L.plat(8, 20, 3, 1, 0, -4, 3)          # WM (white): W1 -> W1.5
    L.plat(5, 16, 3, 1, 0, -4, 1)          # WU (green): W1.5 -> W2
    L.plat(8, 12, 3, 1, 0, -6, 0)          # WT (purple): W2 -> top
    L.plat(35, 28, 4, 1, 0, -8, 1)         # EL (green): E0 -> E1, crate 1 rides on it
    L.plat(29, 20, 3, 1, 0, -4, 2)         # EM (orange): E1 -> E1.5
    L.plat(32, 16, 3, 1, 0, -4, 0)         # EU (purple): E1.5 -> E2
    L.plat(29, 12, 3, 1, 0, -6, 2)         # ET (orange): E2 -> top
    L.plat(14, 6, 3, 1, 11, 0, 4)          # the ferry (pink)
    for x, g, inv in ((12, 2, False), (13, 3, False), (14, 4, False), (15, 5, True)):
        gate_plat(L, x, 10, 11, g, inv)    # yellow is inverted: L2 starts on, and must be turned off
    L.leverOn.append(5)
    gate_plat(L, 13, 26, 27, 3)            # Sol's way out of the hall: white, opened from Luna's wing
    gate_plat(L, 26, 26, 27, 2)            # Luna's: orange, opened from the hall
    return L
