"""Act 3: levels 23-32. See docs/level-plan.md for the brief of each level.

Run `python3 tools/levelgen.py` after every edit, then `node tools/gate.js <n>`.
"""
from lvdsl import Lv, level, W, H

# ---------------------------------------------------------------------------
# Helpers for this act only.
#
# art(L, rows, plats): paint a 38x28 map from strings. Besides the DSL legend,
# upper-case letters other than A B S M X are moving platforms: each letter is
# one rectangle, and plats[letter] = (group, dx, dy) or (group, dx, dy, inv).
# Lower-case letters c d e f g h i j l n o p q r t u v w x y z are free for
# notes and are painted as air.

FREE = set('cdefghijlnopqrtuvwxyz')


def art(L, rows, plats=None):
    plats = plats or {}
    rows = [r for r in rows if r is not None]
    assert len(rows) == H, (L.name, len(rows))
    cells = {}
    for y, row in enumerate(rows, 1):
        assert len(row) == W, (L.name, y, len(row), row)
        for x, c in enumerate(row, 1):
            if c in plats:
                cells.setdefault(c, []).append((x, y))
                L.set(x, y, '.')
            elif c in FREE:
                L.set(x, y, '.')
            else:
                L.set(x, y, c)
    for c, spec in plats.items():
        pts = cells.get(c)
        assert pts, (L.name, 'platform letter not drawn', c)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        assert len(pts) == (x1 - x0 + 1) * (y1 - y0 + 1), (L.name, 'platform not a rectangle', c)
        g, dx, dy = spec[0], spec[1], spec[2]
        inv = len(spec) > 3 and spec[3]
        L.plat(x0, y0, x1 - x0 + 1, y1 - y0 + 1, dx, dy, g, inv)
    return L


MIRROR = {'/': '\\', '\\': '/', 'S': 'M', 'M': 'S', 's': 'm', 'm': 's'}


def mirror_half(right, swap=None):
    """right: 28 strings for x=20..38 (19 chars). Returns 28 full rows, left half mirrored."""
    swap = dict(MIRROR, **(swap or {}))
    out = []
    for r in right:
        assert len(r) == 19, (len(r), r)
        left = ''.join(swap.get(c, c) for c in reversed(r))
        out.append(left + r)
    return out


def patch(rows, x, y, s):
    """Overwrite text s into the full rows at (x, y) (1-based)."""
    r = rows[y - 1]
    rows[y - 1] = r[:x - 1] + s + r[x - 1 + len(s):]
    assert len(rows[y - 1]) == W


@level(23)
def eclipse():
    """Eclipse. A butterfly: the left wing (sun pools) is Sol's and mirrors Luna's right wing
    (moon pools). A body splits them, with a locked tunnel through its middle band. Each wing has
    a wing-tip shaft with a yellow lift; the two lifts are a counterweight pair. Both start at the
    top of their own wing and finish at the top of the other's, where the mirror breaks.
    The wings fold into bands 7 rows apart (re-spaced Nov 2026 for the higher jump): the top band,
    two low corridors where nobody needs to jump, the middle band with the tunnel, the bottom band.
    Each wing climbs from the bottom to the middle band on a riser of two 3-row steps under a
    5-wide hole. Even the levers mirror: Sol's purple lever is switched by walking east through it,
    Luna's green lever (drawn pushed) by walking west.

    0. Each drops down their own wing to the bottom: through the floor holes, then the shaft
       doorway into the wing-tip shaft.
    1. Sol stands on the purple plate: Luna's purple gate G opens.
    2. Luna passes G and walks west through the green lever: Sol's green gate H and the green
       tunnel lock open for good. That also shuts Sol's shaft doorway J and Luna's door lock F.
    3. Sol passes H and walks east through the purple lever: the purple lock opens (and his door
       lock E, while purple is on). Both climb their risers to the middle band.
    4. Both cross through the tunnel into the other's wing.
    5. Sol walks down Luna's floors to her lift, jumping over her lever. Luna walks down Sol's and
       turns purple off on the way (Luna's shaft doorway N opens again).
    6. Luna holds the yellow plate by her lift: Sol's lift rises, hers sinks. Sol pushes the crate
       into the white socket (the white bridge on the left rises for good) and climbs out.
    7. Sol holds the yellow plate in his top corridor, Luna steps onto her sunken lift, Sol lets
       go: she rides up. Pump one.
    8. Luna wades her moon pocket and sets the orange lever: Sol's orange bridge rises.
    9. Sol crosses it, drops down to the bottom and walks east through the green lever: Luna's
       door lock F and Sol's doorway J open, and he is stranded behind G. He climbs back up and
       takes the shaft down to his lift.
    10. Luna drops down through the hole where Sol's wing has its socket and takes the shaft down.
        Pump two: she sends him up, he sends her up.
    11. Sol stands on the pink plate; Luna passes the pink gate K (pink and white are needed at
        once, which is why the crate holds white) and climbs to the roofs.
    12. Luna holds the purple plate on the roof: Sol's door lock opens and he walks to his door.
        She walks to hers."""
    L = Lv('Eclipse', 90, 'Each wing mirrors the other, even the levers. What you do on your side changes theirs. The two yellow lifts balance each other.')
    R = [['#'] * 19 for _ in range(28)]          # R[y-1][x-20], the right half (x 20..38)

    def cut(x0, y0, x1, y1, ch='.'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                R[y - 1][x - 20] = ch

    # top band (rows 1-6, floor 7): Luna's start, the pink plate, Sol's door behind lock E
    cut(21, 1, 33, 6); cut(35, 1, 38, 6)        # the top band, walled off from the wing-tip well
    cut(29, 2, 31, 2, '#'); cut(29, 3, 29, 4, '#'); cut(31, 3, 31, 4, '#'); cut(30, 5, 30, 6, 'E')
    cut(24, 7, 26, 7); cut(35, 7, 38, 7)        # the drop hole, and the wing-tip well
    # top corridor (rows 8-9, floor 10): moon pool on the orange bridge, sun pool, yellow plate
    cut(21, 8, 24, 9); cut(26, 8, 34, 9); cut(35, 8, 38, 11)
    cut(21, 10, 23, 11)                          # the drop column to the low corridor
    cut(27, 10, 29, 10, 'M'); cut(27, 11, 29, 11, 'O'); cut(31, 10, 33, 10, 'S')
    # low corridor (rows 12-13, floor 14): west part with a hole down, the crate room east
    cut(21, 12, 28, 13); cut(30, 12, 37, 13)
    cut(27, 14, 28, 14); cut(30, 14, 31, 14); cut(35, 14, 37, 14)   # a hole down at the west part's end
    # middle band (rows 15-20, floor 21): the tunnel's mouth, the shaft doorway N
    cut(21, 15, 29, 15); cut(32, 15, 33, 15); cut(21, 16, 33, 20); cut(35, 15, 37, 27)
    cut(34, 17, 34, 18, 'N'); cut(34, 19, 34, 20)
    cut(22, 21, 26, 21)                          # the riser's hole
    # bottom band (rows 22-27, floor 28): riser steps, the lever, gate G, moon pool, the lift
    cut(22, 22, 34, 27)
    cut(22, 22, 23, 27, '#')                     # riser step B (stand on row 21), then
    cut(24, 25, 25, 27, '#')                     # step A (row 24), climbed from the floor under the hole
    cut(29, 22, 29, 23, '#'); cut(29, 26, 29, 27, 'G')
    cut(31, 28, 33, 28, 'M'); cut(35, 28, 37, 28, 'Y')
    rows = mirror_half([''.join(r) for r in R], {'O': 'W', 'G': 'H', 'Y': 'Z', 'E': 'F', 'N': 'J'})
    # the body's tunnel (rows 19-20) with two locks that sink into slots in the body (rows 21-22)
    for y in (21, 22):
        patch(rows, 19, y, '..')
    for y in (19, 20):
        patch(rows, 19, y, 'QP')
    # the mirror breaks: Sol's wing has a hole where Luna's has the white socket, a pink gate K
    # sinks into its top corridor before the climb to the roofs, and a plate sits by Luna's lift
    patch(rows, 8, 14, '..'); patch(rows, 8, 15, '..')
    patch(rows, 13, 10, '.'); patch(rows, 13, 11, '.')
    art(L, rows, {
        'G': (0, 0, -2), 'P': (0, 0, 2),       # purple: Luna's gate, tunnel lock
        'H': (1, 0, -2, True), 'Q': (1, 0, 2, True),    # green (lever starts on): Sol's gate, tunnel lock, open while green is off
        'O': (2, 0, -1),                       # orange: bridge out of the moon pool (right top corridor)
        'W': (3, 0, -1),                       # white: bridge out of the sun pool (left top corridor)
        'Y': (5, 0, -14),                      # yellow: right wing-tip lift, bottom to low corridor
        'Z': (5, 0, -14, True),                # yellow, counterweight: left lift rests up
        'E': (0, 0, -2),                       # Sol's door lock: open while purple is on
        'F': (1, 0, -2),                       # Luna's door lock: open while green is on
        'J': (1, 0, 2, True),                  # Sol's shaft doorway: shut while green is off
        'N': (0, 0, 2),                        # Luna's shaft doorway: shut while purple is on
    })
    L.plat(13, 8, 1, 2, 0, 2, 4)               # K (pink): sinks into the floor while pink is on
    L.p(18, 6, 'a').p(21, 6, 'b')
    L.p(33, 6, 'A').p(6, 6, 'B')
    L.plate(9, 27, 0)                          # purple plate, Sol's, by his gate H
    L.lever(27, 27, 1, on=True)                # green lever, Luna's, drawn pushed: walk west through it
    L.lever(12, 27, 0)                         # purple lever, Sol's: walk east through it
    L.lever(9, 9, 2)                           # orange lever, past Luna's moon pocket (left top corridor)
    L.p(33, 13, 'k').plate(30, 14, 3)          # crate and the white socket (right low corridor)
    L.plate(23, 6, 4)                          # pink plate, Sol's, on the right roof
    L.plate(12, 6, 0)                          # purple plate, Luna's, on the left roof
    L.plate(5, 27, 5).plate(34, 9, 5)          # yellow plates: beside Luna's lift (left bottom), Sol's top corridor (right)
    for x, y in ((3, 23), (13, 22), (16, 9), (30, 16), (37, 6)):
        L.p(x, y, 's')
    for x, y in ((36, 23), (26, 22), (23, 9), (9, 16), (2, 6)):
        L.p(x, y, 'm')
    return L


# ---------------------------------------------------------------------------
# Carving helpers (rooms cut out of solid rock).

def rock(L):
    return L.r(1, 1, W, H)


def pgate(L, x, y0, y1, g, inv=False):
    """A one-wide gate at column x, rows y0..y1, that rises into an empty slot of the same
    height right above it while group g is active (inv: rises while g is NOT active).
    The caller leaves stone on both sides of the slot."""
    h = y1 - y0 + 1
    L.clear(x, y0 - h, x, y1)
    return L.plat(x, y0, 1, h, 0, -h, g, inv)


def bridge(L, x, y, w, g, inv=False, kind='X'):
    """A pool of `kind` w wide in row y, with a bridge under it (row y+1) that rises into the
    pool while g is active (inv: while g is NOT active)."""
    L.pool(x, y, w, kind)
    L.clear(x, y + 1, x + w - 1, y + 1)
    return L.plat(x, y + 1, w, 1, 0, -1, g, inv)


def ladder(L, x, rows):
    """Two-wide ledges alternating between columns x..x+1 and x+3..x+4, one per floor row."""
    for i, y in enumerate(rows):
        xx = x if i % 2 == 0 else x + 3
        L.r(xx, y, xx + 1, y)
    return L


@level(24)
def dusk_gate():
    """Dusk Gate. Chapter exam. A spiral: the outer ring (left shaft, bottom band, right shaft,
    top band) winds round an inner ring (a C of corridors) that wraps the door chamber in the
    centre. Both start on a deck in the top-left corner where the spiral begins. Sol takes the
    outer ring the long way, Luna the short way along the top; they meet at the lift on the
    right and wind inward together.

    1. Sol climbs down the left shaft. Luna stays on the deck: she is the operator.
    2. Purple lever P starts on and keeps gate GA on the bottom band shut. Luna walks left
       through it: GA opens and Sol passes.
    3. Inverted pair, green: two shade pits under low ceilings on the bottom band. Lever G
       raises the first pit's bridge and sinks the second's. Luna walks right through G: Sol
       crosses pit one. She walks left through G again: Sol crosses pit two to the booth at the
       bottom of the lift.
    4. Operator swap. Gate GB bars the top band just outside the deck. Sol stands in the orange
       socket in the booth, far below: GB opens and Luna leaves the deck. (Orange also opens
       the entry gate into the inner ring, but nobody can reach it yet.)
    5. Inverted pair, white: the top band has two more pits. Sol walks right through white
       lever W: the first bridge rises and Luna crosses. He walks left through W: the second
       bridge rises, the first sinks, and Luna crosses.
    6. Handover: Luna pushes the crate off the end of the top band down the lift shaft. It
       lands on the lift in the booth, and Sol pushes it into the socket he stood in. The crate
       replaces him: the entry gate is open for good.
    7. The lift pump. Sol stands on the booth's yellow plate: the lift rises, and Luna (who
       drops onto it, or rode it up from the booth if she followed the crate down) steps onto
       the landing. Sol steps off; the lift sinks. Sol steps on; Luna stands on the landing's
       yellow plate and sends him up.
    8. Both walk through the entry gate, west along the inner top band and down the ladder.
    9. Airlock on the inner bottom band (pink): a plate before the first gate opens it and
       shuts the second. Luna holds hers, Sol steps in, she lets go and he walks out to the
       far plate; he holds it, she steps in, he lets go and she walks out.
    10. The chamber door is pink too. Luna stands on the far airlock plate again: the door
        opens and Sol climbs the inner right shaft into the chamber. He walks to its west end
        and back through the pink lever, which keeps the door open (and the airlock's second
        gate shut, which no longer matters), and Luna climbs in.
    Re-spaced Nov 2026 for the higher jump: the deck is 6 rows high, the corridors where nobody
    needs to jump have ramps for their steps, the booth is 6 rows high, and the climb into the
    door chamber is two steps of 2 with full headroom."""
    L = Lv('Dusk Gate', 92, 'The spiral winds in to the doors. One of you works the levers while the other runs; then swap.')
    rock(L)
    # deck (top left): x 1-5 on floor 6 with the shaft hole, x 6-11 on floor 5
    L.clear(1, 1, 11, 6).clear(1, 7, 3, 7)                 # the deck: 6 rows high, the shaft's mouth at its west end
    L.clear(12, 4, 12, 5).set(12, 6, '/')                  # doorway to the top band, a ramp up
    L.p(5, 6, 'a').p(11, 6, 'b')
    L.lever(7, 6, 1)                                       # G (green): OB bridges
    L.lever(9, 6, 0, on=True)                              # P (purple): GA / GB
    # outer left shaft: a ladder of ledges
    # outer bottom band (rows 23-27) and the booth (x 27-38, floor 28)
    L.clear(1, 8, 5, 22)
    L.clear(1, 23, 26, 26).clear(6, 27, 11, 27).clear(18, 27, 19, 27)
    L.set(6, 27, '\\'); L.set(11, 27, '/')                  # ramps in and out of GA's dip
    L.set(18, 27, '\\'); L.set(19, 27, '/'); L.set(26, 27, '\\')   # and the dip between the pits, the step down to the booth
    ladder(L, 1, [24, 22, 20, 18, 16, 14, 12, 10, 8])
    L.r(8, 23, 10, 25)
    pgate(L, 9, 26, 27, 0, inv=True)                       # GA: open while purple is off
    L.r(13, 23, 17, 24)                                    # low ceiling over pit one
    bridge(L, 14, 27, 3, 1)                                # pit one: bridge while green is on
    L.r(21, 23, 25, 24)                                    # low ceiling over pit two
    bridge(L, 22, 27, 3, 1, inv=True)                      # pit two: bridge while green is off
    L.clear(27, 22, 35, 22).clear(27, 23, 38, 27)          # the booth: 6 rows high
    L.plate(27, 27, 5)                                     # booth yellow plate
    L.clear(30, 28, 31, 28).plate(30, 28, 2).plate(31, 28, 2)   # orange socket
    L.lever(33, 27, 3)                                     # W (white): the top band's pits
    # right shaft: lift (x 36-38) from the booth to the landing (x 33-35, floor 12)
    L.clear(36, 6, 38, 28)
    L.plat(36, 28, 3, 1, 0, -16, 5)
    L.clear(33, 10, 35, 11).clear(34, 7, 35, 9)
    L.plate(35, 11, 5)                                     # landing yellow plate
    pgate(L, 32, 10, 11, 2)                                # entry gate: open while orange is on
    # outer top band (rows 1-5)
    L.clear(13, 1, 38, 5)
    L.r(14, 1, 16, 3)
    pgate(L, 15, 4, 5, 2)                                  # GB: open while orange is on
    L.r(19, 1, 23, 3)                                      # a low ceiling: nobody jumps pit one
    L.set(17, 5, '/'); L.set(18, 5, '\\')                    # a hump of two ramps before it
    bridge(L, 20, 6, 3, 3)                                 # pit one: bridge while white is on
    L.r(26, 1, 30, 3)
    bridge(L, 27, 6, 3, 3, inv=True)                       # pit two: bridge while white is off
    L.p(31, 5, 'k')
    # inner top band (rows 8-11) from the entry gate west to the inner left shaft
    L.clear(13, 8, 31, 11).r(31, 8, 31, 9)                 # a corridor to walk: nobody jumps in it
    L.set(20, 11, '/'); L.set(21, 11, '\\')                  # a hump of two ramps
    L.clear(12, 8, 12, 11)
    L.clear(13, 7, 13, 7)                                  # a pocket in the corridor's roof
    # inner left shaft (x 7-11), a ladder down to the inner bottom band
    L.clear(7, 8, 11, 21)
    L.r(7, 16, 8, 16).r(10, 19, 11, 19)                    # two ledges, staggered so each has clear air above
    # inner bottom band (rows 18-21) with the pink airlock; raised east end
    L.clear(12, 18, 31, 21).r(25, 21, 31, 21).set(24, 21, '/')   # raised east end, a ramp up
    L.r(14, 17, 16, 19).r(20, 17, 22, 19)
    pgate(L, 15, 20, 21, 4)                                # airlock gate one: open while pink is on
    pgate(L, 21, 20, 21, 4, inv=True)                      # gate two: open while pink is off
    L.plate(12, 21, 4).plate(25, 20, 4)
    # inner right shaft (x 27-31) up to the door chamber
    L.clear(27, 13, 31, 20).r(30, 19, 31, 20).r(27, 17, 28, 17)   # two climbs of 2, each with 6 rows of air
    L.clear(26, 14, 26, 16)
    # the door chamber (x 13-25, rows 13-16)
    L.clear(13, 13, 25, 16)
    L.r(25, 13, 25, 14)
    pgate(L, 26, 15, 16, 4)                                # chamber door: open while pink is on
    L.lever(14, 16, 4)                                     # pink lever at the chamber's west end
    L.p(18, 16, 'A').p(20, 16, 'B')
    L.r(37, 1, 38, 2)                                      # hanging block over the shaft
    # gems: ledges off the ladders, nooks and corners
    for x, y in ((2, 2), (1, 11), (1, 26), (29, 24), (13, 7), (31, 15)):
        L.p(x, y, 's')
    for x, y in ((4, 13), (17, 2), (34, 7), (8, 15), (10, 18), (24, 13)):
        L.p(x, y, 'm')
    return L


@level(25)
def two_keys():
    """Two Keys. A stepped tower over a basement that runs the full width: the ground hall
    (rows 14-20), the narrower upper hall (rows 8-12) with galleries at both ends, and the
    crown on top with the two doors, each behind its own gate. The keys are the two crates:
    orange keyhole KA opens Sol's gate, white keyhole KB opens Luna's. Both keyholes are in the
    basement, under two green hatches in the ground hall's floor. Crates can't climb, so they
    go up on the lift and come down through the hatches. Four places want a crate: the two
    hatches, the foot of the high ledge (a step), and the two yellow plates (a weight that
    would strand the lift).

    1. Both start in the basement beside the lift with one crate; the other is on the raised
       floor. Luna stands on the basement yellow plate: Sol rides up with the first crate.
    2. Pump: Luna steps off and the lift sinks; she rolls the second crate on and rides it; Sol
       stands on the hall's yellow plate and brings her up. She pushes her crate west off the
       lift into the socket over hatch B (the key for her own gate).
    3. The pink airlock: Luna holds the near plate (gate one opens, gate two shuts), Sol pushes
       the first crate in, she lets go (gate two opens) and he pushes it on against the face of
       the high ledge, onto hatch A.
    4. Sol holds the far plate; Luna walks into the airlock; he lets go and she walks out.
    5. The ledge is four tiles high: the crate is the step. Both climb it, then the upper step,
       into the upper hall.
    6. Sol walks out to the dead end of the west gallery and back through the green lever: both
       hatches sink 6 rows and set the keys down on KA and KB. Both gates open. The order is the
       puzzle: the crate on hatch A has to be the step before it is a key, and the lever is only
       reachable once it has been.
    7. The crown climb: ledge B only rises while purple is on. Luna holds the purple plate out
       on the east gallery, past the hole in the upper hall's floor; Sol climbs into the crown,
       walks to its west dead end and back through the purple lever, which keeps B up. Luna
       climbs after him.
    8. Each walks out to their door."""
    L = Lv('Two Keys', 100, 'The crates are your keys, and a crate never climbs. One of them has to be a step before it is a key.')
    rock(L)
    # Re-spaced Nov 2026 for the higher jump: crown floor 7, upper hall 14, ground hall 21, basement
    # 28, each with 6 free rows. The high ledge is 5 above the hall floor (only a crate is a step up)
    # and the crown is 5 above the block (only ledge B, on purple, is a step up).
    # basement (rows 22-27, floor 28)
    L.clear(1, 22, 38, 27)
    L.r(19, 22, 20, 25)                                    # a pillar with a low way under it: walk, don't jump
    L.set(23, 27, '/'); L.set(24, 27, '\\')                  # a hump east of the crates' path
    L.r(32, 27, 38, 27).set(31, 27, '/')                   # the far end is a step higher
    L.clear(4, 28, 7, 28).plat(4, 28, 4, 1, 0, -7, 5)      # the lift, basement to the ground hall
    L.plate(16, 27, 5)                                     # basement yellow plate
    L.clear(28, 28, 29, 28).plate(28, 27, 2).plate(29, 27, 2)   # KA (orange keyhole): hatch A lands here
    L.clear(1, 28, 2, 28).plate(1, 27, 3).plate(2, 27, 3)  # KB (white keyhole): hatch B lands here
    L.r(3, 27, 3, 27)                                      # a kerb: crates can't slide past the lift
    L.p(9, 27, 'k').p(17, 27, 'k')
    L.p(12, 27, 'a').p(13, 27, 'b')
    # ground hall (rows 15-20, floor 21)
    L.clear(1, 15, 33, 20).clear(4, 21, 7, 21)
    L.clear(1, 21, 2, 21).plat(1, 22, 2, 1, 0, 6, 1)       # socket over hatch B at the west end: sinks while green is on
    L.plate(9, 20, 5)                                      # hall yellow plate
    L.clear(12, 21, 12, 21)                                # a one-wide dip: crates roll over it
    L.plate(13, 20, 4)                                     # airlock, near plate
    L.r(14, 15, 16, 18)
    pgate(L, 15, 19, 20, 4)                                # gate one: open while pink is on
    L.r(21, 15, 23, 18)
    pgate(L, 22, 19, 20, 4, inv=True)                      # gate two: open while pink is off
    L.plate(27, 20, 4)                                     # airlock, far plate
    L.clear(28, 21, 29, 21).plat(28, 21, 2, 1, 0, 7, 1)    # hatch A over KA: sinks while green is on
    L.r(30, 16, 33, 20)                                    # the high ledge: 5 up, 4 from a crate on hatch A
    # upper hall (rows 8-13, floor 14), a hole over the crate and the ledge, galleries at both ends
    L.clear(7, 8, 33, 13).clear(29, 14, 33, 15)
    L.clear(2, 10, 6, 12).set(7, 13, '\\')                 # the west gallery, a ramp up into it
    L.clear(34, 5, 37, 13).r(36, 11, 37, 11)               # the east gallery, with a perch
    L.r(18, 12, 18, 13)                                    # climb to the crown: a block, then
    L.plat(20, 12, 2, 1, 0, -3, 0)                         # ledge B, which rises while purple is on
    L.plate(35, 13, 0)                                     # purple plate, out on the east gallery past the hole
    L.lever(2, 12, 1)                                      # green lever at the west gallery's dead end: the hatches
    # crown (rows 1-6, floor 7) with the doors at its ends
    L.clear(5, 1, 27, 6).clear(18, 7, 21, 7)
    L.r(14, 1, 16, 4)
    pgate(L, 15, 5, 6, 2)                                  # Sol's gate (orange)
    L.r(23, 1, 25, 4)
    pgate(L, 24, 5, 6, 3)                                  # Luna's gate (white)
    L.p(7, 6, 'A').p(26, 6, 'B')
    L.lever(5, 6, 0)                                       # purple lever at the crown's west dead end: B stays up
    # gems: the galleries, the basement's far end, the crown's corners, high in the halls
    for x, y in ((6, 10), (8, 23), (27, 2), (3, 16), (14, 9)):
        L.p(x, y, 's')
    for x, y in ((37, 5), (36, 25), (5, 2), (18, 16), (8, 9)):
        L.p(x, y, 'm')
    return L


# ---------------------------------------------------------------------------
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


def lock_bridge(L, x, y, code):
    """A lock over a six-wide shade pit drawn in row y at cols x..x+5: a purple half then a green
    half, each rising out of the row below. code = (purple on?, green on?) that raises it."""
    L.plat(x, y + 1, 3, 1, 0, -1, 0, not code[0])
    L.plat(x + 3, y + 1, 3, 1, 0, -1, 1, not code[1])


def lock_stones(L, x, y, code):
    """A lock over a sixteen-wide shade pit drawn in row y at cols x..x+15: a purple stepping stone
    (x+4..x+5) and a green one (x+10..x+11), each rising out of the row below, with four-wide gaps
    between them. Both up: long jumps of 4 from stone to stone. One down: a gap of 10, which nobody
    can jump."""
    L.plat(x + 4, y + 1, 2, 1, 0, -1, 0, not code[0])
    L.plat(x + 10, y + 1, 2, 1, 0, -1, 1, not code[1])


def lock_gates(L, x, y0, code):
    """A lock of two two-high gates, purple at col x and green at x+1, rows y0..y0+1."""
    gate_plat(L, x, y0, y0 + 1, 0, not code[0])
    gate_plat(L, x + 1, y0, y0 + 1, 1, not code[1])


# lock codes (purple lever on?, green lever on?)
TL_S, TL_W, TL_N, TL_E = (0, 0), (1, 1), (0, 1), (1, 0)


@level(26)
def tidelock():
    """Tidelock. Four quadrant basins ring a cross-shaped control room. The purple lever and the
    green lever, both on the control room floor, give four states, and each state opens one
    crossing: S (both off) lets you from the start hall into the SW basin and from the SE basin
    into the latch hall, W (both on) from SW to the NW tide lift, N (purple off, green on) raises
    the stepping stones over the top from NW to NE, E (purple on, green off) from NE to SE. Every
    basin has two locks with different codes, so a runner inside one is shut in until the operator
    changes the state. The doors are in the two arms of the control room, behind gates that only
    the latch hall opens.
    Re-spaced Nov 2026 for the higher jump: the west basins are four bands with floors 7 rows apart
    (28, 21, 14, 7), each band climbed on two 3-row steps under a hole in the floor above; the
    control room stands 6 rows tall on floor 17 between them, so the operator can jump the levers;
    the bridge over the top is a 16-wide shade pit crossed by two long jumps of 4 on two stepping
    stones, and a third jump off the green stone drops into the hole down to the NE basin. Luna's
    gem in the NE corner needs the longest jump in the room: 6 tiles from the green stone, over the
    pit's last gap and the hole. The latch hall's lanes, the start hall and the south bridge are low
    corridors that are only walked. The start plate is on the hall's raised east end, off the path
    from the chute to the lift.

    1. Sol stands on the orange plate in the start hall; Luna rides the lift up into the control
       room. She is the operator.
    2. Sol walks west into the SW basin (S is open) and climbs its two steps. Luna walks east
       through both levers (W): the S lock behind him shuts, the W lock opens.
    3. Luna holds the yellow tide plate: the tide lift raises Sol into the NW basin. He climbs its
       steps to the top band.
    4. Luna walks west through purple (N): the stepping stones rise; Sol jumps the pit stone to
       stone and off the green stone down the hole into the NE basin.
    5. Luna turns purple on and green off (E): Sol passes the east lock and drops to the SE.
    6. Luna turns purple off (S): Sol crosses the south bridge into the latch hall, wades his sun
       lane to the white latch (Luna's door gate opens for good) and drops down the chute into the
       start hall.
    7. Luna holds the orange plate in the control room: the lift brings Sol up. Roles swap: Luna
       drops down the shaft and runs the same ring while Sol works the levers and the tide.
    8. In the latch hall Luna drops to her moon lane and the pink latch (Sol's door gate opens) and
       takes the chute. Sol lifts her up with the orange plate; he jumps the lift hole into the
       west arm, and both walk to their doors at the ends of the two arms."""
    L = Lv('Tidelock', 115, 'Purple and green make four codes; each code opens one crossing. '
           'Walk right through a lever to turn it on, left to turn it off, and jump over it to leave it.')
    C = canvas()
    # top band (rows 1-6, floor 7): NW top, the stepping-stone pit, NE top
    paint(C, 1, 1, 38, 6)
    paint(C, 1, 7, 4, 7)                              # the hole the NW steps climb through
    put(C, 13, 7, 'X' * 16)                           # the N pit; stones rise from row 8
    paint(C, 17, 8, 18, 8); paint(C, 23, 8, 24, 8)
    paint(C, 29, 7, 30, 7)                            # the drop into the NE basin, right after the pit
    paint(C, 7, 1, 10, 3, '#'); paint(C, 34, 1, 38, 3, '#')   # roof rocks over floor that is only walked
    paint(C, 31, 1, 33, 1, '#')                       # and a one-row lip past the pit (keeps the band's air <= 120)
    # NW basin (rows 8-13, floor 14): the tide lift arrives at the east, steps climb at the west
    paint(C, 1, 8, 11, 13)
    paint(C, 1, 8, 2, 13, '#'); paint(C, 3, 11, 4, 13, '#')    # step two (top 8), step one (top 11)
    paint(C, 10, 14, 11, 21)                          # the tide lift's shaft and its rest
    # SW upper (rows 15-20, floor 21): steps arrive at the west, the W lock, the tide lift
    paint(C, 1, 15, 9, 20)
    paint(C, 1, 21, 4, 21)                            # the hole the SW steps climb through
    paint(C, 7, 15, 9, 16, '#'); paint(C, 7, 17, 7, 18, '#')   # W lock pillar (slots x8-9, rows 17-18)
    # SW lower (rows 22-27, floor 28), entered from the start hall through the S lock
    paint(C, 1, 22, 11, 27)
    paint(C, 1, 22, 2, 27, '#'); paint(C, 3, 25, 4, 27, '#')   # step two (top 22), step one (top 25)
    paint(C, 12, 26, 14, 27); paint(C, 13, 24, 14, 25)         # S lock doorway, gates x13-14, slots
    # the control room (rows 11-16, floor 17): W arm, hub, N arm, E arm
    paint(C, 13, 15, 14, 16)                          # Sol's door and his gate, under a low roof
    paint(C, 15, 11, 25, 16)                          # the hub
    paint(C, 19, 9, 22, 10)                           # N arm
    paint(C, 26, 15, 28, 16); paint(C, 27, 13, 27, 14)   # E arm: Luna's gate (slot above) and door
    put(C, 13, 16, 'A'); put(C, 28, 16, 'B')
    put(C, 15, 16, '6'); put(C, 19, 16, '3'); put(C, 21, 16, '!'); put(C, 23, 16, '6'); put(C, 24, 16, '@')
    # S arm: the lift shaft from the start hall up into the hub
    paint(C, 16, 17, 18, 28)
    # latch hall: Sol's sun lane (rows 18-19) over Luna's moon lane (rows 21-22), the junction,
    # the south bridge under a low roof, the SE basin
    paint(C, 21, 18, 28, 19); put(C, 22, 19, '%'); put(C, 24, 20, 'SSS')
    paint(C, 21, 21, 28, 22); put(C, 22, 22, '^'); put(C, 24, 23, 'MMM')
    paint(C, 27, 20, 27, 20)                          # junction: the drop to the moon lane
    paint(C, 28, 23, 28, 23)                          # and the chute down to the start hall
    paint(C, 29, 18, 34, 19); put(C, 29, 20, 'X' * 6); paint(C, 29, 21, 34, 21)
    paint(C, 35, 15, 38, 20); put(C, 35, 20, '\\')
    # NE basin (rows 8-13, floor 14) with the E lock and the drop to the SE basin
    paint(C, 29, 8, 38, 13)
    paint(C, 34, 8, 37, 9, '#'); paint(C, 34, 10, 34, 11, '#'); paint(C, 37, 10, 37, 11, '#')
    paint(C, 37, 14, 38, 14)
    # start hall (rows 24-27, floor 28)
    paint(C, 15, 26, 15, 27); paint(C, 19, 24, 38, 27); paint(C, 16, 24, 18, 27)
    put(C, 31, 27, '/'); paint(C, 32, 27, 38, 27, '#')   # the hall's east end is a step higher
    put(C, 34, 26, '3'); put(C, 28, 27, 'a'); put(C, 17, 27, 'b')   # Luna starts on the lift, Sol under the chute: both have a full jump's headroom
    for x, y in ((1, 2), (33, 8), (38, 15), (22, 11), (11, 22)):
        put(C, x, y, 's')
    for x, y in ((6, 15), (8, 8), (37, 6), (19, 11), (38, 24)):
        put(C, x, y, 'm')
    flush(L, C)
    L.plat(10, 21, 2, 1, 0, -7, 5)                    # tide lift (yellow), SW upper to NW basin
    L.plat(16, 28, 3, 1, 0, -11, 2)                   # start lift (orange)
    lock_gates(L, 8, 19, TL_W); lock_gates(L, 35, 12, TL_E); lock_gates(L, 13, 26, TL_S)
    lock_stones(L, 13, 7, TL_N); lock_bridge(L, 29, 20, TL_S)
    L.floorgate(14, 15, 2, 4)                         # Sol's door gate (pink: Luna's latch) sinks
    gate_plat(L, 27, 15, 16, 3)                       # Luna's door gate (white: Sol's latch) rises
    return L


@level(27)
def leapfrog_spire():
    """Leapfrog Spire. A spire: a solid central column with a staircase of lifts on each side and a
    hollow core. Sol's west landings are floors 28/22/16/10/4, Luna's east landings 27/21/15/9/4, so
    the two climbs interleave like a helix up the whole screen (re-spaced Nov 2026 for the higher
    jump: each lift rises 6 rows, landings are walked, never jumped). Every lift's plate is on the
    other side, so whoever is lower holds the plate while the other rides, then they swap. Lifts
    pair up by colour: W1+W3 purple, W2+W4 green, E1+E3 orange, E2+E4 white. Luna's lifts are 4 wide
    and carry the crate. Because E1 and E3 share a colour (and E2 and E4), the shaft over the lift
    she rides is open while it is up: that is where she hops over the crate to turn it round.

    0. Split start: Sol stands on his yellow plate, Luna shoves the crate through her yellow gate
       and stands on her own plate beyond it, so Sol's gate opens. He steps onto W1.
    1. Luna pushes the crate onto E1, hops over it (the shaft above is open), climbs 4 up the shaft
       to a moon gem and holds purple: Sol rides W1 to floor 22. She pushes the crate back west.
    2. Sol holds orange: E1 carries Luna and the crate to floor 21. She pushes it west onto E2.
    3. Luna holds green: Sol's green gate opens, but W2 rises empty. She lets go, Sol steps on,
       she holds it again: Sol rides W2 to floor 16.
    4. Sol holds white: E2 carries Luna and the crate to floor 15. She hops west over the crate
       (E4 is up too, so that shaft is open) and pushes it east onto E3 against the socket block.
    5. Luna holds purple twice the same way (gate, then W3): Sol rides to floor 10.
    6. Sol walks west through the orange lever and back onto W4: E3 locks up with Luna and the crate.
    7. Luna pushes the crate off E3 down the chute: it lands on the green socket and holds W4 up,
       so Sol rides to the top. (Without the crate whoever holds W4's plate is stranded below.)
    8. Luna holds yellow on floor 9: Sol's floor gate on the top sinks. Sol holds white at the
       middle of the top: E4 brings Luna up; she fetches the gem at the east end.
    9. Luna holds pink: Sol rides the core lift D1 down while the counterweight D2 rises to meet
       it. Core gems: a climb of 4 to a ledge, then 3 (moon). Luna lets go: D2 sinks with Sol, and
       he steps off into a niche for a gem on the way. He holds pink at the foot: Luna walks off
       the top into the core, D2 comes up for her, and she steps off into the lower niche.
       Both walk to the doors at the foot of the column.

    Unrecoverable on purpose: a crate pushed past E1 or E2 into a hole, or anyone who falls down
    the chute after the crate."""
    # PLAN AND PROGRESS (successor: read this first)
    # - v2 map (Nov 17 2026). FULL gate passes: bot 79 s (floor 76), 22 uses, 11/11 gems, ROOF 0,
    #   neither player can finish alone.
    # - The map strings below were painted by a scratch script; edit them directly now.
    # - Bot script: SCRIPTS[27] in act3.bot.js. Low rooms (5 free rows) are walked, never hopped.
    # - Done. Thin margins: bot time 79 s against 76 s; Sol visits 16 sectors (needs 16); stone 26%.
    L = Lv('Leapfrog Spire', 90, 'Each lift is worked from the other side. Same colour, same moment: '
           'when your partner presses, everything of that colour moves. The crate must reach the chute.')
    art(L, [
        '######################################',   # 1
        '.........T............................',   # 2
        's........T..5...........4............m',   # 3
        '##...####.######DDD#######....########',   # 4
        '......###.#....#.......#.......######.',   # 5
        '...............#.......#..............',   # 6
        '...............#.......#..............',   # 7
        '...............#...m...#......6.......',   # 8
        '.$.............#...#...#..VVVV##......',   # 9
        '##HHH#######...#.......#......##......',   # 10
        '.....##.###....#......s#......##......',   # 11
        '........#.#....#.....###..............',   # 12
        '........#.#....#.......#............22',   # 13
        '.........K.....#.......#m.....1.....##',   # 14
        's.....4..K.....#.......###....##RRRR##',   # 15
        '##...#######QQQ#...#EEE#......##......',   # 16
        '......###.##...#####...#..............',   # 17
        '......#.#......###.....#..............',   # 18
        '......#.#......###s....#..............',   # 19
        '.......J.......#####...#.......2......',   # 20
        's......J..3....###.....###WWWW##......',   # 21
        '##GGG#######...###m....#..######.....m',   # 22
        '....###.###....#####...#..#.#........#',   # 23
        '........#.#....#.......#..#.#.........',   # 24
        '........#.#....#.......#...Z..........',   # 25
        '.........Y.....#.......#bk.Z.6......m1',   # 26
        '.a.6.....Y.....#AB.5...#########OOOO##',   # 27
        '############PPP#####...###############',   # 28
    ], {
        'P': (0, 0, -6), 'Q': (0, 0, -6), 'K': (0, 0, -2),     # purple: W1, W3, Sol's gate on 16
        'G': (1, 0, -6), 'H': (1, 0, -6), 'J': (1, 0, -2),     # green: W2, W4, Sol's gate on 22
        'O': (2, 0, -6), 'R': (2, 0, -6),                      # orange: E1, E3
        'W': (3, 0, -6), 'V': (3, 0, -5),                      # white: E2, E4
        'D': (4, 0, 12), 'E': (4, 0, 12, True),                # pink: core lift D1 and counterweight D2
        'Y': (5, 0, -2), 'Z': (5, 0, -2), 'T': (5, 0, 2),      # yellow: the two start gates, the floor gate on top
    })
    return L
