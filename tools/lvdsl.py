"""Level authoring DSL for Sol & Luna. Shared by every act file in tools/acts/.

Coordinates are tile coordinates: x 1..38, y 1..28 (the outer ring is wall).
Row 1 is the top of the screen, row 28 the bottom. A character "at (x, y)" stands
in cell (x, y), so the floor under it is row y+1.

Map legend:
  #  stone        /  ramp rising right      \\  ramp rising left
  S  sun pool (deadly to Luna)   M  moon pool (deadly to Sol)   X  shade pool (deadly to both)
  a/b  Sol / Luna spawn      A/B  Sol / Luna exit door
  s/m  sun / moon gem        k    crate
  1-6  pressure plate for group 0-5        ! @ $ % ^ &  lever for group 0-5
  = - _ + ~ :  moving-platform cells of group 0-5 (movement given with mv())
"""

import sys

PLATE_CH, LEVER_CH, PLAT_CH = '123456', '!@$%^&', '=-_+~:'

W, H = 38, 28


class Lv:
    def __init__(self, name, par, hint=''):
        self.name, self.par, self.hint = name, par, hint
        self.g = [['.'] * (W + 2) for _ in range(H + 2)]
        self.moves, self.inv, self.leverOn = {}, [], []
        self.plats = []

    def set(self, x, y, c):
        assert 1 <= x <= W and 1 <= y <= H, (self.name, x, y, c)
        self.g[y][x] = c
        return self

    def r(self, x0, y0, x1, y1, c='#'):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.set(x, y, c)
        return self

    def clear(self, x0, y0, x1, y1):
        return self.r(x0, y0, x1, y1, '.')

    def floor(self, y=28):
        return self.r(1, y, W, y)

    def pool(self, x, y, w, kind):
        return self.r(x, y, x + w - 1, y, kind)

    def rampR(self, x, y, n, base=None):
        """Ramp rising to the right; low tile at (x, y). Fills stone beneath down to `base`."""
        base = y if base is None else base
        for i in range(n):
            self.set(x + i, y - i, '/')
            for yy in range(y - i + 1, base + 1):
                self.set(x + i, yy, '#')
        return self

    def rampL(self, x, y, n, base=None):
        """Ramp rising to the left; low tile at (x, y)."""
        base = y if base is None else base
        for i in range(n):
            self.set(x - i, y - i, '\\')
            for yy in range(y - i + 1, base + 1):
                self.set(x - i, yy, '#')
        return self

    def basin(self, x, y, w, kind):
        """A pool sunk one tile into a floor whose surface row is y-1 (floor slab at row y-1 and y).
        Ramps lead down at x and back up at x+w+1."""
        self.set(x, y - 1, '\\')
        self.set(x + w + 1, y - 1, '/')
        for i in range(w):
            self.set(x + 1 + i, y - 1, '.')
            self.set(x + 1 + i, y, kind)
        self.set(x, y, '#'); self.set(x + w + 1, y, '#')
        return self

    def p(self, x, y, s):
        for i, c in enumerate(s):
            self.set(x + i, y, c)
        return self

    def mv(self, g, dx, dy):
        self.moves[g] = [dx, dy]
        return self

    def gate(self, x, y0, y1, ch, g, slot_top):
        """Vertical gate cells at column x rows y0..y1 that rise into a slot whose top is slot_top.
        Builds a stone pillar around the slot.
        This sets the whole group's movement to (0, -h). If the group already moves some other way
        (an earlier mv() or a gate of another height), that is overwritten and a warning is printed."""
        h = y1 - y0 + 1
        self.r(x - 1, slot_top - 1, x + 1, y0 - 1)
        self.clear(x, slot_top, x, y0 - 1)
        self.r(x, y0, x, y1, ch)
        assert y0 - slot_top >= h, 'slot too short'
        if g in self.moves and self.moves[g] != [0, -h]:
            print(f'warning: {self.name}: gate({x}, {y0}, {y1}) sets group {g} to move (0, {-h}), '
                  f'overwriting its earlier move {tuple(self.moves[g])}', file=sys.stderr)
        self.mv(g, 0, -h)
        return self

    def plat(self, x, y, w, h, dx, dy, g, inv=False):
        """Explicit platform (lets one group drive several platforms in different directions).
        It only records the platform: it does not clear the map cells it covers or the cells it moves
        through, and stone left there stays solid. Clear them yourself (floorgate() clears its slot)."""
        self.plats.append([x, y, w, h, dx, dy, g, 1 if inv else 0])
        return self

    def floorgate(self, x, ytop, h, g):
        """Gate standing on a thick floor that sinks into a slot below it when group g is active."""
        self.clear(x, ytop + h, x, ytop + 2 * h - 1)
        return self.plat(x, ytop, 1, h, 0, h, g)

    def rows(self):
        out = []
        for y in range(H + 2):
            row = ''
            for x in range(W + 2):
                row += '#' if (x == 0 or y == 0 or x == W + 1 or y == H + 1) else self.g[y][x]
            out.append(row)
        return out

    def data(self):
        d = {'name': self.name, 'par': self.par, 'map': self.rows()}
        if self.hint: d['hint'] = self.hint
        if self.moves: d['moves'] = [self.moves.get(i, [0, 0]) for i in range(max(self.moves) + 1)]
        if self.inv: d['inv'] = self.inv
        if self.leverOn: d['leverOn'] = self.leverOn
        if self.plats: d['plats'] = self.plats
        return d

    # ---- helpers for six groups (added for the full-screen redesign) ----
    def plate(self, x, y, g):
        """Pressure plate for group g (0-5). Stands in cell (x, y); needs solid floor at y+1."""
        return self.set(x, y, PLATE_CH[g]) or self

    def lever(self, x, y, g, on=False):
        """Lever for group g (0-5) in cell (x, y). on=True starts it switched on."""
        self.set(x, y, LEVER_CH[g])
        if on and g not in self.leverOn: self.leverOn.append(g)
        return self

    def cells(self, x0, y0, x1, y1, g):
        """Drawn platform cells for group g. Give the movement with mv(g, dx, dy)."""
        return self.r(x0, y0, x1, y1, PLAT_CH[g])

    def invert(self, g):
        """Drawn platforms of group g rest at their moved position and return while g is active."""
        if g not in self.inv: self.inv.append(g)
        return self


# ---------------------------------------------------------------------------
# Registry. Each act file registers its levels by number:
#
#     @level(7)
#     def crate_cellar():
#         L = Lv('Crate Cellar', 60, 'hint text')
#         ...
#         return L

REGISTRY = {}


def level(n):
    def deco(fn):
        assert n not in REGISTRY, f'level {n} is defined twice'
        REGISTRY[n] = fn
        return fn
    return deco
