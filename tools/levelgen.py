"""Level authoring DSL for Sol & Luna.

Run:  python3 tools/levelgen.py   -> writes shared/levels.js

Coordinates are tile coordinates: x 1..38, y 1..28 (the outer ring is wall).
Legend in the emitted ASCII maps:
  #  stone        /  ramp rising right      \\  ramp rising left
  S  sun pool (deadly to Luna)   M  moon pool (deadly to Sol)   X  shade pool (deadly to both)
  a/b  Sol / Luna spawn      A/B  Sol / Luna exit door
  s/m  sun / moon gem        k    crate
  1-4  pressure plate for group 0-3      ! @ $ %  lever for group 0-3
  = - _ +  moving-platform cells of group 0-3 (movement given in `moves`)
"""
import json, os

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
        Builds a stone pillar around the slot."""
        h = y1 - y0 + 1
        self.r(x - 1, slot_top - 1, x + 1, y0 - 1)
        self.clear(x, slot_top, x, y0 - 1)
        self.r(x, y0, x, y1, ch)
        assert y0 - slot_top >= h, 'slot too short'
        self.mv(g, 0, -h)
        return self

    def plat(self, x, y, w, h, dx, dy, g, inv=False):
        """Explicit platform (lets one group drive several platforms in different directions)."""
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


LEVELS = []


def level(fn):
    LEVELS.append(fn)
    return fn

# ---------------------------------------------------------------------------


@level
def l01():
    L = Lv('First Light', 25, 'Arrows move Sol, WASD moves Luna. Each can wade through their own pool.')
    L.floor().pool(9, 28, 3, 'S').pool(15, 28, 3, 'M')
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.rampR(22, 27, 4).r(26, 24, 38, 27)
    L.r(33, 21, 38, 23)
    L.p(34, 20, 'A').p(37, 20, 'B')
    L.p(10, 25, 's').p(16, 25, 'm').p(28, 22, 's').p(30, 22, 'm')
    return L


@level
def l02():
    L = Lv('Two Roads', 30, 'Sun pools are safe for Sol, moon pools for Luna.')
    L.floor().pool(10, 28, 6, 'M').pool(21, 28, 6, 'M')
    L.r(1, 22, 33, 22).pool(9, 22, 6, 'S').pool(19, 22, 6, 'S')
    L.r(35, 25, 38, 27)
    L.r(34, 19, 38, 19)
    L.p(2, 21, 'a').p(2, 27, 'b')
    L.p(35, 18, 'A').p(37, 18, 'B')
    L.p(11, 19, 's').p(21, 19, 's').p(12, 25, 'm').p(23, 25, 'm')
    return L


@level
def l03():
    L = Lv('Shade Moat', 30, 'Shade pools swallow everyone. Jump!')
    L.floor().pool(8, 28, 3, 'X').pool(15, 28, 3, 'X').pool(22, 28, 3, 'S').pool(25, 28, 3, 'M')
    L.rampR(31, 27, 3).r(34, 25, 38, 27)
    L.r(12, 22, 34, 22).pool(24, 22, 3, 'X')
    L.r(1, 19, 11, 19)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(5, 18, 'A').p(8, 18, 'B')
    L.p(9, 25, 's').p(16, 25, 'm').p(23, 26, 's').p(26, 26, 'm').p(25, 19, 's').p(20, 20, 'm')
    return L


@level
def l04():
    L = Lv('Hold the Gate', 35, 'Pressure plates work only while something stands on them.')
    L.floor()
    L.r(1, 21, 31, 21)
    L.r(1, 15, 10, 20)
    L.gate(12, 22, 27, '=', 0, 16)
    L.set(12, 21, '.')
    L.p(6, 27, '1').p(17, 27, '1')
    L.pool(21, 28, 3, 'S').pool(25, 28, 3, 'M')
    L.rampR(30, 27, 4).r(34, 24, 38, 27)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(18, 20, 'A').p(21, 20, 'B')
    L.p(22, 25, 's').p(26, 25, 'm').p(25, 19, 's').p(27, 19, 'm')
    return L


@level
def l05():
    L = Lv('Lever Lift', 30, 'Walk into a lever to flip it. Levers stay where you leave them.')
    L.floor()
    L.r(1, 21, 16, 21).r(21, 21, 38, 21)
    L.r(17, 27, 20, 27, '=').mv(0, 0, -6)
    L.p(13, 27, '!')
    L.pool(26, 21, 3, 'S').pool(30, 21, 3, 'M')
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(3, 20, 'A').p(6, 20, 'B')
    L.p(27, 18, 's').p(31, 18, 'm').p(9, 25, 's').p(10, 25, 'm')
    return L


@level
def l06():
    L = Lv('First Crate', 25, 'Push the crate against the wall to climb.')
    L.floor()
    L.r(16, 24, 38, 27)
    L.p(8, 27, 'k')
    L.pool(22, 24, 3, 'S').pool(25, 24, 3, 'M')
    L.r(32, 21, 38, 23)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(34, 20, 'A').p(37, 20, 'B')
    L.p(10, 24, 's').p(11, 24, 'm').p(23, 21, 's').p(26, 21, 'm')
    return L


@level
def l07():
    L = Lv('Crate on the Plate', 30, 'A crate can hold a plate down for you.')
    L.floor()
    L.r(1, 22, 33, 22)
    L.gate(20, 23, 27, '=', 0, 18)
    L.set(20, 22, '.')
    L.p(9, 27, 'k').p(19, 27, '1')
    L.pool(24, 28, 3, 'M').pool(28, 28, 3, 'S')
    L.r(34, 25, 38, 27)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(24, 21, 'A').p(27, 21, 'B')
    L.p(6, 24, 's').p(12, 24, 'm').p(29, 19, 's').p(31, 19, 'm')
    return L


@level
def l08():
    L = Lv('Up and Over', 40, 'Each plate raises the other lift.')
    L.floor().pool(14, 28, 3, 'S').pool(20, 28, 3, 'M')
    L.r(1, 16, 38, 16).clear(8, 16, 10, 16).clear(28, 16, 30, 16)
    L.r(8, 27, 10, 27, '=').mv(0, 0, -11)
    L.r(28, 27, 30, 27, '-').mv(1, 0, -11)
    L.p(24, 27, '1').p(14, 15, '2')
    L.r(2, 13, 5, 13).r(33, 13, 36, 13)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(18, 15, 'A').p(21, 15, 'B')
    L.p(3, 12, 's').p(35, 12, 'm').p(15, 25, 's').p(21, 25, 'm')
    return L


@level
def l09():
    L = Lv('Stepping Stones', 40, 'Hold the jump key to keep hopping.')
    L.floor().pool(6, 28, 27, 'X')
    L.r(9, 26, 10, 27).r(14, 25, 15, 27).r(19, 26, 20, 27).r(24, 24, 25, 27).r(29, 25, 30, 27)
    L.r(36, 25, 38, 27).r(37, 22, 38, 24)
    L.r(8, 19, 35, 19).pool(28, 19, 3, 'S').pool(24, 19, 3, 'M').pool(17, 19, 3, 'X')
    L.r(1, 16, 7, 16)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(3, 15, 'A').p(6, 15, 'B')
    L.p(12, 24, 's').p(17, 23, 'm').p(22, 23, 's').p(27, 23, 'm').p(25, 16, 's').p(29, 16, 'm')
    return L


@level
def l10():
    L = Lv('Twin Levers', 40, "Your lever moves your partner's lift.")
    L.floor()
    L.r(19, 17, 20, 27)
    L.pool(5, 28, 3, 'M').pool(31, 28, 3, 'S')
    L.p(10, 27, '!').p(27, 27, '@')
    L.r(14, 27, 17, 27, '-').mv(1, 0, -11)
    L.r(22, 27, 25, 27, '=').mv(0, 0, -11)
    L.r(1, 16, 38, 16).clear(14, 16, 17, 16).clear(22, 16, 25, 16)
    L.r(3, 13, 6, 13).r(32, 13, 35, 13)
    L.p(2, 27, 'a').p(37, 27, 'b')
    L.p(18, 15, 'A').p(21, 15, 'B')
    L.p(6, 25, 's').p(32, 25, 'm').p(5, 12, 's').p(33, 12, 'm')
    return L


@level
def l11():
    L = Lv('Basins', 40, 'Ramps lead down into sunken pools.')
    L.r(1, 27, 38, 28)
    L.basin(6, 28, 3, 'S').basin(13, 28, 3, 'M').basin(20, 28, 4, 'X')
    L.rampR(30, 26, 3).r(33, 24, 38, 26)
    L.r(36, 21, 38, 23)
    L.r(6, 19, 34, 20)
    L.basin(26, 20, 3, 'M').basin(18, 20, 3, 'S').basin(11, 20, 2, 'X')
    L.r(1, 16, 5, 16)
    L.p(2, 26, 'a').p(4, 26, 'b')
    L.p(2, 15, 'A').p(4, 15, 'B')
    L.p(15, 23, 's').p(8, 23, 'm').p(22, 23, 's').p(23, 23, 'm')
    L.p(28, 16, 's').p(20, 16, 'm')
    return L


@level
def l12():
    L = Lv('Counterweight', 45, 'One plate, two lifts: as one rises, the other sinks.')
    L.floor().pool(15, 28, 3, 'S').pool(20, 28, 3, 'M')
    L.r(1, 18, 10, 18).r(15, 18, 24, 18).r(29, 18, 38, 18)
    L.plat(11, 27, 4, 1, 0, -9, 0)
    L.plat(25, 18, 4, 1, 0, 9, 0)
    L.p(6, 27, '1').p(16, 17, '1')
    L.p(3, 27, 'a').p(1, 27, 'b')
    L.p(20, 17, 'A').p(23, 17, 'B')
    L.p(16, 25, 's').p(21, 25, 'm').p(3, 16, 's').p(6, 16, 'm').p(33, 16, 'm').p(36, 16, 's')
    return L


@level
def l13():
    L = Lv('Crate Bridge', 45, 'Wade a crate into your own pool to make a stepping stone for your partner.')
    L.floor().pool(10, 28, 10, 'S').pool(24, 28, 9, 'M')
    L.p(7, 27, 'k').p(22, 27, 'k')
    L.r(35, 25, 38, 27)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(35, 24, 'A').p(37, 24, 'B')
    L.p(12, 24, 's').p(16, 24, 'm').p(26, 24, 'm').p(30, 24, 's')
    return L


@level
def l14():
    L = Lv("Helper's Way Out", 90, 'Whoever holds the plate needs a way out. Leave each other a lever.')
    # Bands: bottom floor row 28, middle floor row 18, top floor row 10. Every climb is 2 tiles.
    L.floor(28)
    L.r(1, 18, 34, 18)                     # middle floor (sun corridor + hub)
    L.r(1, 10, 25, 10)                     # top floor (exits, moon alcove, landing)
    L.r(38, 11, 38, 27)                    # right wall of Luna's lift shaft
    # bottom band: start, Sol's lift E1, Luna's low moon channel, plate P1, Luna's lift S1
    L.r(7, 28, 9, 28, '=').mv(0, 0, -10)   # E1 rises flush into the middle floor while P1 is held
    L.clear(7, 18, 9, 18)
    L.r(11, 19, 22, 25)                    # low ceiling: Sol cannot jump the channel
    L.pool(12, 28, 10, 'M')
    L.p(26, 27, '1')                       # P1, only Luna can reach it
    L.r(35, 28, 37, 28, '-').mv(1, 0, -14) # S1 carries Luna up to the hub steps; set by L1
    # middle band: sun corridor with plate P2 on an islet, then the hub stair
    L.r(11, 11, 22, 15)                    # low ceiling over the sun corridor
    L.pool(12, 18, 3, 'S').pool(18, 18, 4, 'S')
    L.p(16, 17, '3')                       # P2, only Sol can reach it
    L.r(24, 16, 29, 17).p(25, 15, '@')     # step T1 with lever L1 (push right: S1 rises)
    L.r(30, 14, 34, 17)                    # step T2, level with S1's top stop
    L.r(26, 12, 27, 12)                    # step T3, then up to the landing
    # top band: landing, gate G2, low-ceiling moon pool with a bridge, exits, lever L2
    L.gate(21, 7, 9, '_', 2, 3)            # G2 opens while group 2 is on
    L.r(20, 1, 22, 1)
    L.r(10, 1, 19, 7)                      # low ceiling over the moon pool
    L.pool(11, 10, 8, 'M')
    L.plat(11, 11, 8, 1, 0, -1, 2)         # bridge rises flush over the moon pool (group 2)
    L.p(3, 9, '$')                         # L2 in the far corner, past both exits
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(6, 9, 'A').p(8, 9, 'B')
    L.p(16, 16, 's').p(3, 16, 's').p(17, 27, 'm').p(14, 9, 'm')
    return L


@level
def l15():
    L = Lv('Separate Ways', 50, "Your lever lowers the bridge on your partner's path.")
    L.floor().pool(15, 28, 6, 'X').pool(11, 28, 3, 'M')
    L.r(1, 21, 33, 21).pool(20, 21, 6, 'X').pool(12, 21, 3, 'S')
    L.r(1, 14, 33, 14)
    L.r(15, 22, 20, 22, '-').mv(1, 0, 6)
    L.r(20, 15, 25, 15, '=').mv(0, 0, 6)
    L.p(8, 27, '!').p(9, 20, '@')
    # shared zigzag shaft on the right
    L.r(36, 25, 38, 25).r(34, 22, 35, 22).r(36, 18, 38, 18).r(34, 15, 35, 15)
    L.p(2, 20, 'a').p(2, 27, 'b')
    L.p(6, 13, 'A').p(9, 13, 'B')
    L.p(13, 18, 's').p(12, 25, 'm').p(14, 10, 's').p(18, 10, 'm')
    return L


@level
def l16():
    L = Lv('The Climb', 50, 'Up, up, up.')
    L.floor().pool(10, 28, 3, 'S').pool(16, 28, 3, 'M')
    L.r(30, 25, 38, 25)
    L.r(19, 22, 27, 22).pool(21, 22, 3, 'S')
    L.r(8, 19, 16, 19).pool(11, 19, 3, 'M')
    L.r(1, 16, 5, 16)
    L.r(8, 13, 16, 13).pool(11, 13, 2, 'X')
    L.r(19, 10, 27, 10).pool(21, 10, 2, 'S').pool(24, 10, 2, 'M')
    L.r(30, 7, 38, 7)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(33, 6, 'A').p(36, 6, 'B')
    L.p(11, 25, 's').p(17, 25, 'm').p(22, 19, 's').p(12, 16, 'm').p(11, 10, 's').p(12, 10, 'm')
    L.p(22, 7, 's').p(25, 7, 'm')
    return L


@level
def l17():
    L = Lv('Crate Lift', 50, 'The plate upstairs needs something heavy.')
    L.floor().clear(16, 28, 19, 28)
    L.r(16, 28, 19, 28, '=').mv(0, 0, -8)
    L.r(1, 20, 38, 20).clear(16, 20, 19, 20)
    L.r(1, 14, 38, 14)
    L.r(1, 1, 38, 13)
    L.gate(26, 15, 19, '-', 1, 10)
    L.p(21, 27, '!').p(13, 19, '!')
    L.p(7, 27, 'k')
    L.p(22, 19, '2')
    L.pool(24, 28, 3, 'S').pool(29, 28, 3, 'M')
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(31, 19, 'A').p(35, 19, 'B')
    L.p(25, 25, 's').p(30, 25, 'm').p(9, 17, 's').p(11, 17, 'm')
    return L


@level
def l18():
    L = Lv('Ferryman', 50, 'Levers on either shore call the ferry.')
    L.floor().pool(8, 28, 24, 'X')
    L.r(1, 25, 7, 27).r(32, 25, 38, 27)
    L.r(18, 27, 21, 27)
    L.r(8, 25, 11, 25, '=').mv(0, 20, 0)
    L.p(3, 24, '!').p(32, 24, '!')
    L.r(33, 22, 38, 24)
    L.p(2, 24, 'a').p(5, 24, 'b')
    L.p(34, 21, 'A').p(37, 21, 'B')
    L.p(19, 26, 's').p(20, 26, 'm').p(14, 21, 's').p(24, 21, 'm')
    return L


@level
def l19():
    L = Lv('Carry the Weight', 80, 'The crate can stand where neither of you can stay.')
    # Bands: bottom floor row 28, upper floor row 18 (rows 1-10 are solid rock).
    L.floor(28)
    L.r(1, 1, 38, 10)                      # rock above the upper band
    L.r(1, 18, 38, 18)                     # upper floor
    L.r(1, 19, 2, 27)                      # E0 stands against this wall
    L.r(31, 19, 38, 27)                    # rock under the gate room
    # bottom band: start with the crate, lift E0, Luna's moon tunnel, plates P0 and P1
    L.r(3, 28, 6, 28, '=').mv(0, 0, -10)   # E0, wide enough for Sol and the crate
    L.clear(3, 18, 6, 18)
    L.r(13, 19, 22, 25)                    # low ceiling over the moon tunnel
    L.pool(14, 28, 8, 'M')
    L.p(25, 27, '1')                       # P0 (Luna) raises E0
    L.p(28, 27, '2')                       # P1 (Luna) opens both gates
    L.r(23, 19, 26, 19)                    # socket floor (seen from below)
    # upper band: plate P0b, mastery ledge, gate G1, socket plate P2, gate G2, exits
    L.p(7, 17, '1')                        # P0b beside the shaft: whoever is up top raises E0
    L.r(10, 14, 12, 14)                    # ledge only reachable from the crate (gem)
    L.gate(18, 15, 17, '-', 1, 11)         # G1
    L.clear(24, 18, 25, 18).p(24, 18, '2') # P2 at the bottom of a socket: a crate stays put
    L.gate(31, 15, 17, '-', 1, 11)         # G2, in front of the exits
    L.p(9, 27, 'k')
    L.p(11, 27, 'a').p(12, 27, 'b')
    L.p(34, 17, 'A').p(36, 17, 'B')
    L.p(11, 13, 's').p(15, 16, 's').p(18, 27, 'm').p(27, 25, 'm')
    return L


@level
def l20():
    L = Lv('Galleries', 60, 'A gallery of fire below, a gallery of moonlight above.')
    L.floor().pool(6, 28, 6, 'S').pool(13, 28, 6, 'S').pool(20, 28, 6, 'S').pool(27, 28, 6, 'X')
    L.r(1, 21, 33, 21).pool(8, 21, 6, 'M').pool(15, 21, 6, 'M').pool(22, 21, 6, 'M').pool(28, 21, 6, 'X')
    L.r(1, 14, 33, 14)
    L.r(27, 22, 32, 22, '-').mv(1, 0, 6)
    L.r(28, 15, 33, 15, '=').mv(0, 0, 6)
    L.p(12, 27, '!').p(14, 20, '@')
    L.r(36, 25, 38, 25).r(34, 22, 35, 22).r(36, 18, 38, 18).r(34, 15, 35, 15)
    L.p(2, 27, 'a').p(2, 20, 'b')
    L.p(5, 13, 'A').p(8, 13, 'B')
    L.p(9, 24, 's').p(16, 24, 's').p(23, 24, 's').p(11, 17, 'm').p(18, 17, 'm').p(25, 17, 'm')
    return L


@level
def l21():
    L = Lv('Moonrise', 55, 'The lift sinks while the plate is pressed. The lever upstairs lowers a stair.')
    L.floor().pool(20, 28, 3, 'S').pool(25, 28, 3, 'M')
    L.r(19, 16, 38, 16)
    L.r(1, 1, 13, 8)
    L.plat(15, 16, 4, 1, 0, 11, 0)
    L.plat(9, 10, 3, 1, 0, 15, 1)
    L.plat(4, 9, 3, 1, 0, 13, 1)
    L.plat(9, 9, 3, 1, 0, 10, 1)
    L.p(8, 27, '1').p(30, 15, '@')
    L.pool(23, 16, 3, 'X')
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(34, 15, 'A').p(37, 15, 'B')
    L.p(21, 25, 's').p(26, 25, 'm').p(24, 13, 's').p(25, 13, 'm')
    return L


@level
def l22():
    L = Lv('Crate Ferry', 60, 'Ship the crate across to hold the far plate.')
    L.floor().pool(8, 28, 22, 'X')
    L.r(1, 25, 7, 27).r(30, 25, 38, 27)
    L.r(18, 27, 19, 27)
    L.r(8, 25, 11, 25, '=').mv(0, 18, 0)
    L.p(5, 24, '!').p(31, 24, '!')
    L.p(10, 24, 'k')
    L.r(32, 20, 38, 21)
    L.floorgate(33, 22, 3, 1)
    L.p(32, 24, '2')
    L.p(2, 24, 'a').p(3, 24, 'b')
    L.p(35, 24, 'A').p(37, 24, 'B')
    L.p(18, 25, 's').p(19, 25, 'm').p(13, 21, 's').p(24, 21, 'm')
    return L


@level
def l23():
    L = Lv('Shade Garden', 55, 'Stepping stones over shade. Some stones belong to one of you.')
    L.floor().pool(5, 28, 30, 'X')
    L.r(1, 25, 4, 27)
    L.r(7, 24, 8, 24)
    L.r(11, 22, 12, 22)
    L.r(14, 19, 15, 19).pool(16, 24, 2, 'S')
    L.r(20, 22, 21, 22)
    L.pool(24, 24, 2, 'M').r(23, 19, 24, 19)
    L.r(27, 22, 28, 22)
    L.r(31, 20, 32, 20)
    L.r(35, 22, 38, 27)
    L.p(2, 24, 'a').p(3, 24, 'b')
    L.p(35, 21, 'A').p(37, 21, 'B')
    L.p(16, 21, 's').p(24, 21, 'm').p(10, 19, 's').p(19, 17, 'm').p(28, 17, 's').p(30, 17, 'm')
    return L


@level
def l24():
    L = Lv('Clockwork', 55, 'One lever turns every gear.')
    L.floor().pool(12, 28, 8, 'X')
    L.plat(12, 28, 4, 1, 4, 0, 0)
    L.plat(20, 21, 2, 1, 0, 6, 0)
    L.r(22, 21, 38, 27)
    L.p(5, 27, '!').p(32, 20, '!')
    L.pool(26, 21, 3, 'S').pool(30, 21, 2, 'M')
    L.p(2, 27, 'a').p(3, 27, 'b')
    L.p(35, 20, 'A').p(37, 20, 'B')
    L.p(14, 24, 's').p(17, 24, 'm').p(27, 18, 's').p(31, 18, 'm')
    return L


@level
def l25():
    L = Lv('Drawbridge', 60, 'Hold the plate and the bridge comes down.')
    L.floor().pool(13, 28, 12, 'X')
    L.r(13, 22, 24, 22, '=').mv(0, 0, 6)
    L.p(9, 27, '1').p(28, 27, '1')
    L.clear(31, 28, 34, 28).r(31, 28, 34, 28, '-').mv(1, 0, -8)
    L.r(1, 20, 30, 20).r(35, 20, 38, 20)
    L.p(36, 27, '@').p(29, 19, '@')
    L.pool(22, 20, 3, 'S').pool(17, 20, 3, 'M').pool(10, 20, 3, 'X')
    L.r(1, 17, 5, 17)
    L.p(2, 27, 'a').p(4, 27, 'b')
    L.p(2, 16, 'A').p(4, 16, 'B')
    L.p(16, 24, 's').p(21, 24, 'm').p(18, 17, 's').p(23, 17, 'm')
    return L


@level
def l26():
    L = Lv('Operator', 85, 'One of you runs, the other changes the room. Lever A swaps the bridges.')
    # Sol runs along row 22 (bottom); Luna operates from the deck on row 9 (top).
    L.floor(28)
    # runner route: start block, pit 1, refuge, pit 2, lower landing, lift E, exit block
    L.r(1, 22, 8, 27).r(16, 22, 19, 27).r(27, 22, 30, 27)
    L.r(31, 23, 33, 27)                    # under lift E: no well to fall into
    L.r(34, 15, 38, 27)                    # exit block
    L.r(9, 24, 9, 27).r(10, 26, 11, 27)    # stair out of pit 1, back to the start
    L.r(20, 24, 20, 27).r(21, 26, 22, 27)  # stair out of pit 2, back to the refuge
    # lever A (group 0): bridge 1 out and bridge 2 in, or the reverse. Halves slide into the blocks.
    L.plat(5, 22, 4, 1, 4, 0, 0).plat(16, 22, 3, 1, -3, 0, 0)               # bridge 1 (out when A is on)
    L.plat(16, 22, 4, 1, 4, 0, 0, inv=True).plat(27, 22, 3, 1, -3, 0, 0, inv=True)  # bridge 2 (out when A is off)
    # lever B (group 1): lift E from the lower landing up to the plate landing
    L.r(31, 22, 33, 22, '-').mv(1, 0, -7)
    L.r(25, 15, 30, 15)                    # plate landing
    L.p(27, 14, '3')                       # PF (group 2) opens GW for Luna
    L.gate(34, 13, 14, '+', 3, 11)         # GX (group 3) in front of the exits, opened by LR
    # Luna's deck, gate GW, moon gallery, rescue lever LR, drop to the exits
    L.r(1, 1, 8, 8)
    L.r(1, 9, 36, 9)                       # deck + gallery floor (hole over the exits at 37-38)
    L.p(11, 8, '@').p(17, 8, '!')          # B (group 1) and A (group 0)
    L.gate(21, 6, 8, '_', 2, 2)            # GW
    L.r(23, 1, 30, 6)                      # low ceiling over the gallery pool
    L.pool(24, 9, 6, 'M')
    L.p(33, 8, '%')                        # LR (group 3): push right, then drop to the exits
    L.p(3, 21, 'a').p(14, 8, 'b')
    L.p(36, 14, 'A').p(38, 14, 'B')
    L.p(18, 20, 's').p(29, 13, 's').p(10, 6, 'm').p(27, 8, 'm')
    return L


@level
def l27():
    L = Lv('Eclipse', 70, 'Meet in the middle. Each plate lifts the other.')
    L.floor().pool(4, 28, 3, 'S').pool(9, 28, 3, 'M').pool(29, 28, 3, 'S').pool(34, 28, 3, 'M')
    L.r(16, 12, 23, 27)
    L.r(13, 27, 15, 27, '=').mv(0, 0, -15)
    L.r(24, 27, 26, 27, '-').mv(1, 0, -15)
    L.p(33, 27, '1').p(8, 27, '2').p(16, 11, '2').p(23, 11, '1')
    L.r(2, 25, 5, 25).r(34, 25, 37, 25)
    L.p(2, 27, 'a').p(37, 27, 'b')
    L.p(18, 11, 'A').p(21, 11, 'B')
    L.p(3, 23, 's').p(36, 23, 'm').p(10, 25, 's').p(30, 25, 'm')
    return L


@level
def l28():
    L = Lv('Crate Relay', 80, 'Up the lift, over the lake, onto the plate.')
    L.floor().pool(20, 28, 3, 'S').pool(26, 28, 3, 'M')
    L.clear(9, 28, 12, 28).r(9, 28, 12, 28, '=').mv(0, 0, -8)
    L.r(1, 20, 38, 20).clear(9, 20, 12, 20).pool(17, 20, 13, 'X')
    L.r(17, 20, 20, 20, '-').mv(1, 9, 0)
    L.p(14, 27, '!').p(2, 19, '!')
    L.p(5, 19, '2').p(30, 19, '2')
    L.p(4, 27, 'k')
    L.r(31, 14, 38, 14)
    L.gate(34, 15, 19, '_', 2, 10)
    L.p(33, 19, '3')
    L.p(2, 27, 'a').p(3, 27, 'b')
    L.p(35, 19, 'A').p(37, 19, 'B')
    L.p(21, 25, 's').p(27, 25, 'm').p(22, 17, 's').p(26, 17, 'm')
    return L


@level
def l29():
    L = Lv('Sunken Halls', 70, 'Two lifts, two levers each.')
    L.r(1, 27, 38, 28)
    L.basin(5, 28, 3, 'M').basin(12, 28, 4, 'X').basin(20, 28, 3, 'S')
    L.r(1, 20, 30, 21)
    L.basin(8, 21, 3, 'S').basin(16, 21, 3, 'M').basin(24, 21, 3, 'X')
    L.r(33, 26, 36, 26, '=').mv(0, 0, -6)
    L.p(28, 26, '!').p(29, 19, '!')
    L.r(1, 13, 12, 14)
    L.r(13, 19, 16, 19, '-').mv(1, 0, -6)
    L.p(22, 19, '@').p(10, 12, '@')
    L.p(2, 26, 'a').p(3, 26, 'b')
    L.p(3, 12, 'A').p(6, 12, 'B')
    L.p(7, 23, 's').p(22, 23, 'm').p(10, 16, 'm').p(18, 16, 's')
    return L


@level
def l30():
    L = Lv('Twilight Spiral', 80, 'Stones, a ferry, then the long climb.')
    L.floor().pool(6, 28, 26, 'X')
    L.r(1, 25, 5, 27)
    L.r(8, 24, 9, 24).r(12, 23, 13, 23).r(16, 24, 17, 24).r(20, 22, 21, 22).r(24, 24, 25, 24).r(28, 23, 29, 23)
    L.r(32, 24, 38, 27)
    L.r(36, 21, 38, 23)
    L.r(1, 18, 34, 18).pool(12, 18, 19, 'X')
    L.r(27, 18, 30, 18, '=').mv(0, -15, 0)
    L.p(32, 17, '!').p(9, 17, '!')
    L.r(6, 15, 9, 15).r(1, 12, 3, 12).r(6, 9, 9, 9)
    L.r(12, 6, 38, 6).pool(18, 6, 3, 'S').pool(23, 6, 3, 'M')
    L.p(2, 24, 'a').p(4, 24, 'b')
    L.p(31, 5, 'A').p(35, 5, 'B')
    L.p(14, 20, 's').p(26, 20, 'm').p(18, 15, 's').p(22, 15, 'm').p(19, 3, 's').p(24, 3, 'm')
    return L


@level
def l31():
    L = Lv('Sanctum Approach', 85, 'Bridge, balance, and a crate for the final gate.')
    L.floor().pool(9, 28, 10, 'X')
    L.r(9, 22, 18, 22, '=').mv(0, 0, 6)
    L.p(5, 27, '1').p(21, 27, '1')
    L.plat(24, 27, 3, 1, 0, -10, 1)
    L.plat(33, 17, 3, 1, 0, 10, 1)
    L.r(1, 17, 23, 17).r(27, 17, 32, 17).r(36, 17, 38, 17)
    L.p(30, 27, '2').p(29, 16, '2')
    L.gate(5, 13, 16, '_', 2, 9)
    L.p(6, 16, '3')
    L.p(20, 16, 'k')
    L.pool(36, 28, 1, 'S').pool(37, 28, 1, 'M')
    L.p(2, 27, 'a').p(3, 27, 'b')
    L.p(2, 16, 'A').p(4, 16, 'B')
    L.p(13, 24, 's').p(15, 24, 'm').p(13, 14, 's').p(16, 14, 'm').p(37, 15, 's').p(28, 14, 'm')
    return L


@level
def l32():
    L = Lv('Heart of Twilight', 120, 'Everything you have learned. Together.')
    L.floor().pool(4, 28, 9, 'S').pool(27, 28, 9, 'M')
    L.p(2, 27, '!').p(37, 27, '@')
    L.r(15, 27, 17, 27, '-').mv(1, 0, -7)
    L.r(22, 27, 24, 27, '=').mv(0, 0, -7)
    L.r(1, 20, 38, 20).clear(15, 20, 17, 20).clear(22, 20, 24, 20)
    L.p(26, 19, '@').p(13, 19, '!')
    L.pool(4, 20, 9, 'X')
    L.r(4, 14, 12, 14, '_').mv(2, 0, 6)
    L.p(14, 19, '3').p(2, 19, '3')
    L.r(1, 13, 38, 13).clear(1, 13, 4, 13)
    L.r(3, 17, 4, 17).r(1, 14, 2, 14)
    L.pool(8, 13, 3, 'S').pool(12, 13, 3, 'M').pool(16, 13, 3, 'X')
    L.r(26, 10, 31, 12)
    L.r(30, 17, 33, 17)
    L.p(19, 27, 'a').p(20, 27, 'b')
    L.p(27, 9, 'A').p(30, 9, 'B')
    L.p(8, 25, 's').p(31, 25, 'm').p(9, 10, 's').p(13, 10, 'm').p(31, 15, 's').p(32, 15, 'm')
    L.p(35, 11, 's').p(36, 11, 'm')
    return L


# ---------------------------------------------------------------------------

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'shared', 'levels.js')
    datas = [fn().data() for fn in LEVELS]
    lines = ['// Generated by tools/levelgen.py — edit there, then run `python3 tools/levelgen.py`.',
             '// See the legend at the top of tools/levelgen.py.', 'export const LEVELS = [']
    for d in datas:
        lines.append('  {')
        lines.append(f'    name: {json.dumps(d["name"])}, par: {d["par"]},')
        if 'hint' in d: lines.append(f'    hint: {json.dumps(d["hint"])},')
        for k in ('moves', 'inv', 'leverOn', 'plats'):
            if k in d: lines.append(f'    {k}: {json.dumps(d[k])},')
        lines.append('    map: [')
        for row in d['map']:
            lines.append('      ' + json.dumps(row) + ',')
        lines.append('    ],')
        lines.append('  },')
    lines.append('];')
    with open(out, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'wrote {len(datas)} levels to shared/levels.js')


if __name__ == '__main__':
    main()
