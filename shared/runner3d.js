// Sol & Luna — Runner 3D: a third-person, seeded, endless versus course.
// Deterministic 60 Hz sim shared by the browser (local play, online prediction) and the server.
// No DOM, no Math.sin/cos/pow/random in the step or the generator (prediction must match the
// server bit for bit). Rotation and swinging use the polynomial helpers below (plain + - * /).
//
// ===== CONTRACT (renderer, app shell and tools build against this; keep it stable) =====
// Space: x = lateral (+x is the player's right), y = up, z = forward along the course.
//        1 unit = one 2D tile (24 px). The course stays near x = 0, at most about 2*HALF_W wide.
// Input bits: IN_L 1, IN_R 2, IN_J 4 (jump), IN_F 8 (forward, +z), IN_B 16 (back).
// L = buildRunner3d(seed): the course. Generated lazily, section by section (ensureGenerated).
//   L.objs[]  every piece of the world, sorted by activation z (z0). Common fields:
//             { k, x0, x1, z0, z1, y }  footprint (min/max; for moving kinds the whole area the
//             object can occupy) and its base height, plus per-kind fields. See KIND_DOC.
//   L.secs[]  sections { i, kind, intro, z0, z1, d, o0, o1, y, sx, sz }: o0..o1 = its objects,
//             (sx, y, sz) = where a player stands at its start (its run-up), d = difficulty.
//   L.spawn   [{x,y,z},{x,y,z}] for Sol and Luna.
// S = createRunner3dState(L): plain JSON (it is sent over the wire as is).
//   { mode:'runner3d', seed, tick, phase, phaseT, zone, v, lo, hi, o, p, best, dead, why, win, sb }
//   zone  z of the dusk wall behind the players; a player with p.z < zone is lost ('zone').
//   v     current zone speed (units/tick).  lo..hi = active object index window.
//   o     { [objIndex]: state } for stateful objects in the window only.
//   p[i]  { x, y, z, vx, vy, vz, gr, gref, gs, alive, jumpN, coy, jh, jb, fy }
//         x,z = centre, y = feet. gr = standing, gref = index of the object stood on (-1 none),
//         gs = sub-part (stone number on a carousel), jb = jump buffer, fy = last ground height.
//   dead[i] tick of death or -1, why[i] a key of WHY3, win = SOL | LUNA | DRAW | -1.
// stepRunner3d(L, S, [bitsSol, bitsLuna]) advances one tick and returns S.
// objPose(L, S, i, tick = S.tick) -> the current transform of object i, for drawing. Fields
//   per kind are listed in KIND_DOC after "pose:". tick may be fractional (smooth drawing of
//   clocked kinds); stateful kinds read S.o[i] (rest pose when it is not in the window).
// trig(a) -> [sin a, cos a] with the same polynomial the sim uses (any a in radians).
// =======================================================================================

export const SOL = 0, LUNA = 1, DRAW = 2;
export const IN_L = 1, IN_R = 2, IN_J = 4, IN_F = 8, IN_B = 16;
export const R3_COUNT = 0, R3_PLAY = 1, R3_OVER = 2;
export const COUNT_TICKS = 180;
export const TICK_RATE = 60;
export const HALF_W = 5;          // nominal half width of the course (units)
export const FALL_Y = -14;        // below this a player is lost ('fall')
export const FALL_DEPTH = 9;      // ... and also this far below the last ground they stood on
// Lead cap. A standing player more than LEAD_MAX ahead of the zone can only walk forward at
// half the zone's speed, so the lead shrinks again. In the air nothing is taken away (a jump
// over a pit is never cut short); you just can't speed up. LEAD_HARD is a hard stop well out
// of normal reach (a full jump from LEAD_MAX lands well short of it).
export const LEAD_MAX = 32;
export const LEAD_HARD = LEAD_MAX + 14;

// Player box and movement: the 2D game's PHYS divided by the tile size, so the jump feels the same.
export const P3 = {
  hw: 0.36, h: 1.4,
  maxSpeed: 3.25 / 24, accel: 0.55 / 24, decel: 0.62 / 24, airAccel: 0.4 / 24, airDecel: 0.1 / 24, turnBoost: 1.7,
  gravity: 0.33 / 24, jumpVel: 8.25 / 24, maxFall: 8.5 / 24, coyote: 5, stepUp: 0.5, jumpBuf: 6,
};
const HW = P3.hw;
const AIR_TOL = 0.2;      // a falling player whose feet are this far below a top still lands on it
const SNAP_DOWN = 0.3;    // a standing player follows a surface down this far per tick
const DIAG = 0.7071067811865476;
const EPS = 1e-6;
export const POOL_DEP = 0.4;   // pools are sunk this far below their surface y

// Text for each cause of loss (the app shows these on the results card).
export const WHY3 = {
  zone: 'caught by the dusk', fall: 'fell into the abyss', pool: 'touched a hostile pool', spike: 'ran into thorns',
  sweep: 'swept by a thorn arm', blade: 'hit by a pendulum blade', orb: 'flattened by a rolling orb',
  shard: 'struck by a falling shard', gate: 'caught in the thorn curtain',
};

// Object kinds. Each sim author keeps this table current; the renderer has one view per kind
// and draws an unknown kind as a plain box over its footprint.
export const KIND_DOC = {
  floor: 'static stone slab, solid on all sides. Top at y, { h } thickness below y. { skin }: 0 plain, 1 run-up, 2 landing. pose: static.',
  pool: 'liquid set into the floor. { el: 0 sun | 1 moon | 2 shade }. Liquid surface at y; its stone bottom (solid) is POOL_DEP below. Deadly when your feet sink below y - 0.12 over it: sun kills Luna, moon kills Sol, shade both. pose: static.',
  spikes: 'crystal thorns standing on the floor at y, deadly to both. Thorn tips at y + th. pose: static.',
  ramp: 'sloped slab, walkable. Top rises linearly from y at z0 to y1 at z1. { h } thickness. pose: static.',
  tilt: 'chain-hung slab over a pit. Centre (cx, cz), half sizes hx, hz (= the footprint), top y at rest, chains rise to y + chain. Tilts on two axes toward the weight on it and springs back level. { amax } max slope. pose: { x: cx, y, z: cz, ax, az } where the top surface is y + ax*(X-cx) + az*(Z-cz) (ax, az = slopes, |ax|,|az| <= amax).',
};

// Zone speed (units/tick) by distance travelled (units). Players run P3.maxSpeed = 0.135.
const SPEED = [[0, 1.0 / 24], [120, 1.45 / 24], [350, 1.95 / 24], [700, 2.35 / 24], [1100, 2.6 / 24], [1600, 2.75 / 24]];
export const SPEED_TABLE = SPEED;
export function speedAt(z) {
  for (let k = 1; k < SPEED.length; k++) {
    const [t1, v1] = SPEED[k];
    if (z <= t1) { const [t0, v0] = SPEED[k - 1]; return v0 + (v1 - v0) * (z - t0) / (t1 - t0); }
  }
  return SPEED[SPEED.length - 1][1];
}
export const MAX_DIFF_AT = 1100;
export const diffAt = (z) => Math.max(0, Math.min(1, z / MAX_DIFF_AT));
export const ZONE_START = -14;

// ---------------------------------------------------------------------------
// Deterministic maths (plain arithmetic only)

const PI = 3.141592653589793, TAU = 2 * PI, HALF_PI = PI / 2;
// sin and cos of a in [-pi/4, pi/4] (Taylor series: error < 1e-12)
function sinq(a) { const s = a * a; return a * (1 - s / 6 * (1 - s / 20 * (1 - s / 42 * (1 - s / 72 * (1 - s / 110 * (1 - s / 156)))))); }
function cosq(a) { const s = a * a; return 1 - s / 2 * (1 - s / 12 * (1 - s / 30 * (1 - s / 56 * (1 - s / 90 * (1 - s / 132 * (1 - s / 182)))))); }
// [sin a, cos a] for any a
export function trig(a) {
  let u = a / TAU;
  u -= Math.floor(u);                 // turns, [0, 1)
  const q = Math.floor(u * 4) & 3, f = (u * 4 - q) * HALF_PI - PI / 4;   // angle = q*pi/2 + pi/4 + f
  const s = sinq(f), c = cosq(f);
  const r = 0.7071067811865476;
  const sm = (s + c) * r, cm = (c - s) * r;
  switch (q) {
    case 0: return [sm, cm];
    case 1: return [cm, -sm];
    case 2: return [-sm, -cm];
    default: return [-cm, sm];
  }
}
// smooth back-and-forth in [-1, 1] over a period: u in turns
export function wave(u) {
  u -= Math.floor(u);
  const v = u < 0.5 ? 4 * u - 1 : 3 - 4 * u;
  return v * (3 - v * v) / 2;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => (Math.random() * 0x7fffffff) >>> 0 || 1;

// ---------------------------------------------------------------------------
// Jump envelope. A running jump (full speed) that lands `r` units higher (negative = lower)
// covers env(r) units of gap between the take-off edge and the landing edge (tools check it).
const VJ = P3.jumpVel - P3.gravity / 2;
export function env(r) {
  const disc = VJ * VJ - 2 * P3.gravity * r;
  if (disc <= 0) return 0;
  const n = (VJ + Math.sqrt(disc)) / P3.gravity;
  return P3.maxSpeed * n + 2 * HW - 0.1;
}
// Units kept below the envelope: 4 at the start, 1.25 at full difficulty, never less.
export const margin = (d) => Math.max(1.25, 4 - 2.75 * d);
export const maxGap = (r, d) => Math.max(1, env(r) - margin(d));
const Y_MIN = -2, Y_MAX = 8;      // the course height stays in this band

// ---------------------------------------------------------------------------
// Generation

// Kinds, the distance where each first appears (as an easy intro), and its weight after.
export const KINDS = [
  ['gaps', 0, 2.2], ['steps', 0, 1.1], ['thorns', 30, 1.4], ['pools', 70, 1.4], ['tilt', 110, 1.8],
];

class Gen {
  constructor(L) { this.L = L; this.r = L.rnd; }
  get z() { return this.L.z; } set z(v) { this.L.z = v; }
  get y() { return this.L.y; } set y(v) { this.L.y = v; }
  get cx() { return this.L.cx; } set cx(v) { this.L.cx = v; }
  get w() { return this.L.w; } set w(v) { this.L.w = v; }
  rand() { return this.r(); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }       // integer in [a, b]
  rf(a, b, q = 0.25) { return a >= b ? a : Math.round((a + this.r() * (b - a)) / q) * q; } // multiple of q in about [a, b]
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  obj(o) { this.L.objs.push(o); return o; }
  // a static slab from the current z, `len` long, at the current centre/width/height
  floor(len, skin = 0, extra) {
    const o = this.obj({ k: 'floor', x0: this.cx - this.w, x1: this.cx + this.w, z0: this.z, z1: this.z + len, y: this.y, h: 1, skin, ...extra });
    this.z += len;
    return o;
  }
  box(x0, x1, z0, z1, y, h = 1, skin = 0) { return this.obj({ k: 'floor', x0, x1, z0, z1, y, h, skin }); }
  // height change for a landing, kept inside the band
  rise(d, big = 1) {
    const k = d < 0.15 ? 2 : d < 0.5 ? 4 : 6;
    let r = this.ri(-k, k) * 0.5 * big;
    if (this.y + r > Y_MAX || (this.y > 5 && r > 0 && this.rand() < 0.6)) r = -Math.abs(r);
    if (this.y + r < Y_MIN || (this.y < 1 && r < 0 && this.rand() < 0.6)) r = Math.abs(r);
    return r;
  }
  // a new half width and centre for a following piece; its x range overlaps the current one by >= ov
  reshape(d, wmin = 1.5, ov = 1) {
    const w = this.rf(Math.max(wmin, 3.5 - 1.5 * d), Math.max(wmin, 5 - 1.8 * d));
    let cx = this.cx + this.rf(-2, 2) * (d < 0.1 ? 0 : 1);
    cx = clamp(cx, -3, 3);
    const lim = this.w + w - ov;
    cx = clamp(cx, this.cx - lim, this.cx + lim);
    return { w, cx };
  }
}

const FEAT = {
  // Pits with landings that may be offset sideways, higher or lower, and narrower.
  gaps(g, d, intro) {
    const n = intro ? 1 : 1 + (d > 0.3 ? g.ri(0, 1) : 0) + (d > 0.65 ? g.ri(0, 1) : 0);
    for (let k = 0; k < n; k++) {
      const r = intro ? 0 : g.rise(d);
      const mx = maxGap(r, d);
      const G = g.rf(Math.max(1.5, mx - 2 - (1 - d)), mx);
      const sh = intro ? { w: g.w, cx: g.cx } : g.reshape(d, 1.5, 1.2);
      g.z += G; g.y += r; g.w = sh.w; g.cx = sh.cx;
      if (k < n - 1) g.floor(g.rf(Math.max(3, 5 - 2 * d), 6), 2);
    }
  },
  // Stairs up or down (jumped or walked), ramps and drops, with the width changing as you go.
  steps(g, d, intro) {
    const n = intro ? 3 : g.ri(2, 3 + Math.round(2 * d));
    let dir = g.rand() < 0.5 ? 1 : -1;
    if (g.y + 1.5 * n > Y_MAX) dir = -1;
    if (g.y - 1.5 * n < Y_MIN) dir = 1;
    for (let k = 0; k < n; k++) {
      let r = intro ? 0.5 : g.rf(0.5, d < 0.3 ? 1 : 1.5) * dir;
      if (!intro && dir < 0 && k === n - 1 && d > 0.3 && g.rand() < 0.4) r = -g.rf(2, 3.5);   // a drop
      if (g.y + r > Y_MAX || g.y + r < Y_MIN) break;
      if (!intro && d > 0.15 && Math.abs(r) <= 1.5 && g.rand() < 0.25) {
        const R = r * 2, len = g.rf(Math.max(3, Math.abs(R) * 2), Math.abs(R) * 2 + 2);
        if (g.y + R > Y_MAX || g.y + R < Y_MIN) break;
        g.obj({ k: 'ramp', x0: g.cx - g.w, x1: g.cx + g.w, z0: g.z, z1: g.z + len, y: g.y, y1: g.y + R, h: 1 });
        g.z += len; g.y += R;
        continue;
      }
      g.y += r;
      if (!intro && g.rand() < 0.4) { const sh = g.reshape(d, 2, 1.5); g.w = sh.w; g.cx = sh.cx; }
      g.floor(g.rf(Math.abs(r) > 1 ? 2.5 : 2, 4));
    }
  },
  // Thorn hedges blocking part of the width (dodge sideways) and low thorn strips (jump them).
  thorns(g, d, intro) {
    if (g.w < 3) g.w = 3;
    const w = g.w, cx = g.cx, x0 = cx - w, x1 = cx + w;
    const m = intro ? 1 : 1 + g.ri(0, 1 + Math.round(2 * d));
    const zs = g.z;
    let z = g.z + 1, gx = intro ? cx + (g.rand() < 0.5 ? -w / 2 : w / 2) : cx;
    for (let k = 0; k < m; k++) {
      const strip = !intro && d > 0.25 && g.rand() < 0.35;
      if (strip) {
        const dep = g.rf(0.75, 1 + 1.5 * d);
        g.obj({ k: 'spikes', x0, x1, z0: z, z1: z + dep, y: g.y, th: 0.35 });
        z += dep + g.rf(Math.max(2.5, 4 - 1.5 * d), 5);
      } else {
        const ow = intro ? w : g.rf(lerp(2.6, 1.6, d), lerp(3.4, 2.2, d));      // opening width
        const ngx = intro ? gx : g.rf(x0 + ow / 2 + 0.2, x1 - ow / 2 - 0.2);
        // room to move across from the last opening while running diagonally
        z += k ? Math.max(0, Math.abs(ngx - gx) - 1) : 0;
        gx = ngx;
        const dep = 0.7;
        if (gx - ow / 2 > x0 + 0.05) g.obj({ k: 'spikes', x0, x1: gx - ow / 2, z0: z, z1: z + dep, y: g.y, th: 1.1 });
        if (gx + ow / 2 < x1 - 0.05) g.obj({ k: 'spikes', x0: gx + ow / 2, x1, z0: z, z1: z + dep, y: g.y, th: 1.1 });
        z += dep + g.rf(Math.max(2.5, 4.5 - 2 * d), 5.5);
      }
    }
    g.floor(z - zs + 1.5);
  },
  // Element pools in lanes. Twin channels: a sun channel and a moon channel side by side with
  // a neutral strip between them (each player wades their own, the layout is mirrored, so both
  // get the same course); at higher difficulty the channels swap sides and shade bars cross
  // them. Also a shade pond (jump it) and a sun/moon checkerboard (mirrored: hop your colour).
  pools(g, d, intro) {
    const variant = intro ? 'twin' : g.pick(d > 0.45 ? ['twin', 'twin', 'shade', 'checker'] : ['twin', 'shade']);
    if (g.w < 3) g.w = 3;
    const cx = g.cx, w = g.w, x0 = cx - w, x1 = cx + w;
    const row = (z0, z1, cells) => {   // cells: [[xa, xb, el or -1 for stone]]
      for (const [xa, xb, el] of cells) {
        if (xb - xa < 1e-3) continue;
        if (el < 0) g.box(xa, xb, z0, z1, g.y, 1);
        else g.obj({ k: 'pool', x0: xa, x1: xb, z0, z1, y: g.y, el });
      }
    };
    g.floor(1);
    if (variant === 'twin') {
      const sw = intro ? 1.6 : g.rf(lerp(1.4, 0.8, d), lerp(1.6, 1.0, d));   // neutral strip width
      let left = g.rand() < 0.5 ? 0 : 1;
      const segs = intro ? 1 : 1 + (d > 0.35 ? 1 : 0) + (d > 0.7 && g.rand() < 0.5 ? 1 : 0);
      for (let s = 0; s < segs; s++) {
        const len = g.rf(5, 9);
        const z0 = g.z;
        // shade bars across the channels (not the strip) at higher difficulty
        const bars = !intro && d > 0.5 && g.rand() < 0.6;
        const cut = bars ? g.rf(1.5, len - 2.5) : -1, bl = g.rf(1, 1.5 + d);
        const put = (za, zb, l, r) => row(za, zb, [[x0, cx - sw / 2, l], [cx - sw / 2, cx + sw / 2, -1], [cx + sw / 2, x1, r]]);
        if (bars) {
          put(z0, z0 + cut, left, 1 - left);
          put(z0 + cut, z0 + cut + bl, 2, 2);
          put(z0 + cut + bl, z0 + len, left, 1 - left);
        } else put(z0, z0 + len, left, 1 - left);
        g.z += len;
        left = 1 - left;
        if (s < segs - 1) g.floor(g.rf(0.5, 1.5));    // a stone sill where the channels swap
      }
    } else if (variant === 'shade') {
      const len = g.rf(Math.max(1.5, Math.min(4, maxGap(0, d)) - 1), Math.min(5, maxGap(0, d)));
      row(g.z, g.z + len, [[x0, x1, 2]]);
      g.z += len;
    } else {
      const nc = 2 * g.ri(2, 3), cs = (2 * w) / nc, rows = g.ri(3, 5), rl = g.rf(1.75, 2.25);
      for (let r = 0; r < rows; r++) {
        const cells = [];
        for (let c = 0; c < nc; c++) cells.push([x0 + c * cs, x0 + (c + 1) * cs, (c + r) % 2]);
        row(g.z, g.z + rl, cells);
        g.z += rl;
      }
    }
    g.floor(1.5);
  },
  // Chain-hung slabs over a pit. Each tilts on two axes toward the weight on it and springs
  // back to level. The jumps on and off are short enough for any tilt.
  tilt(g, d, intro) {
    const count = intro ? 1 : d > 0.5 && g.rand() < 0.45 ? 2 : 1;
    const drop = !intro && d > 0.4 && g.rand() < 0.5 ? -1 : 0;
    const amax = lerp(0.12, 0.2, intro ? 0 : d);
    let cx = g.cx;
    const y = g.y + drop;
    for (let k = 0; k < count; k++) {
      const hx = intro ? 2.5 : g.rf(1.6, 2.4), hz = intro ? 2.5 : g.rf(1.6, 2.4);
      const gap = intro ? 1.5 : g.rf(1.5, Math.min(3, maxGap(-0.5, d) - 1));
      if (k) cx = clamp(cx + g.rf(-1.5, 1.5), -3, 3);
      g.z += gap;
      const cz = g.z + hz;
      g.obj({ k: 'tilt', x0: cx - hx, x1: cx + hx, z0: g.z, z1: g.z + 2 * hz, y, cx, cz, hx, hz, amax, chain: 7 });
      g.z += 2 * hz;
    }
    const r = intro || d < 0.3 ? 0 : g.rf(-1, 0.5, 0.5);
    g.z += intro ? 1.5 : g.rf(1.5, Math.min(3, maxGap(r + amax * 2.4, d) - 1));
    g.y = clamp(y + r, Y_MIN, Y_MAX);
    g.cx = clamp(cx, -3, 3);
    g.w = g.rf(2.5, 4);
  },
};

function pickKind(L, z) {
  for (const [k, at] of KINDS) if (z >= at && !L.seen[k]) { L.seen[k] = 1; return [k, true]; }
  const pool = KINDS.filter(([k, at]) => z >= at && k !== L.last);
  let tot = 0;
  for (const [, , w] of pool) tot += w;
  let r = L.rnd() * tot;
  for (const [k, , w] of pool) { r -= w; if (r <= 0) return [k, false]; }
  return [pool[pool.length - 1][0], false];
}

function genSection(L) {
  const g = new Gen(L);
  const i = L.secs.length, o0 = L.objs.length;
  let kind = 'start', intro = false, z0 = L.z, sz, sx, y;
  if (!i) {
    L.z = -20; z0 = -20; sz = 0; sx = 0; y = 0;
    g.floor(46, 1);
  } else {
    [kind, intro] = pickKind(L, z0);
    const d = diffAt(z0);
    sx = L.cx; y = L.y; sz = z0 + 0.6;
    const run = g.rf(Math.max(3, 6 - 3 * d), Math.max(3.5, 9 - 5 * d));
    // part of the run-up, then maybe a width change for the rest of it
    if (run >= 5 && !intro && g.rand() < 0.35) {
      const a = g.rf(2.5, run - 2.5);
      g.floor(a, 1);
      const sh = g.reshape(d, 2, 2);
      g.w = sh.w; g.cx = sh.cx;
      g.floor(run - a, 1);
    } else g.floor(run, 1);
    FEAT[kind](g, d, intro);
  }
  const added = L.objs.splice(o0);
  added.sort((a, b) => a.z0 - b.z0);
  L.objs.push(...added);
  L.last = kind;
  L.secs.push({ i, kind, intro, z0, z1: L.z, d: diffAt(Math.max(0, z0)), o0, o1: L.objs.length, y, sx, sz });
}
export function ensureGenerated(L, z) { while (L.z < z) genSection(L); }
export function sectionAt(L, z) {
  let lo = 0, hi = L.secs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L.secs[m].z0 <= z) lo = m; else hi = m - 1; }
  return L.secs[lo];
}

export function buildRunner3d(seed) {
  const L = {
    runner3d: true, seed: seed >>> 0, objs: [], secs: [], z: 0, y: 0, cx: 0, w: HALF_W, last: '', seen: {},
    rnd: mulberry32((seed >>> 0) ^ 0x3D51),
    spawn: [{ x: -1.2, y: 0, z: 0 }, { x: 1.2, y: 0, z: 0 }],
  };
  genSection(L);
  return L;
}

// ---------------------------------------------------------------------------
// Object state and poses

export const STATEFUL = { tilt: 1 };
export const TILT = { load: 0.0035, spring: 0.006, damp: 0.14, slide: 0.05 };
// longest time (ticks) a stateful object may take to come back to rest after its last touch
export const REST_BOUND = { tilt: 150 };

function initObj(o) {
  if (o.k === 'tilt') return { a: 0, b: 0, va: 0, vb: 0 };
  return null;
}
export function atRest(L, S, i) {
  const o = L.objs[i], st = S.o[i];
  if (!st) return true;
  if (o.k === 'tilt') return st.a === 0 && st.b === 0 && st.va === 0 && st.vb === 0;
  return true;
}

export function objPose(L, S, i, tick = S.tick) {
  const o = L.objs[i], st = S.o[i];
  switch (o.k) {
    case 'tilt': return { x: o.cx, y: o.y, z: o.cz, ax: st ? st.a : 0, az: st ? st.b : 0 };
    default: return { x: (o.x0 + o.x1) / 2, y: o.y, z: (o.z0 + o.z1) / 2 };
  }
}

// ---------------------------------------------------------------------------
// State

const mkPlayer = (s) => ({
  x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, gr: true, gref: -1, gs: 0, alive: true, jumpN: 0, coy: 0, jh: 0, jb: 0, fy: s.y,
});

function activate(L, S) {
  let far = S.zone + LEAD_HARD;
  for (const p of S.p) if (p.alive && p.z > far) far = p.z;
  far += 30;
  ensureGenerated(L, far + 40);
  while (S.hi < L.objs.length && L.objs[S.hi].z0 < far) {
    const st = initObj(L.objs[S.hi]);
    if (st) S.o[S.hi] = st;
    S.hi++;
  }
  while (S.lo < S.hi && L.objs[S.lo].z1 < S.zone - 12) { delete S.o[S.lo]; S.lo++; }
}

export function createRunner3dState(L, { sandbox = false } = {}) {
  const S = {
    mode: 'runner3d', seed: L.seed, tick: 0, phase: R3_COUNT, phaseT: 0, zone: ZONE_START, v: 0, lo: 0, hi: 0, o: {},
    p: L.spawn.map(mkPlayer), best: [0, 0], dead: [-1, -1], why: ['', ''], win: -1, sb: sandbox ? 1 : 0,
  };
  activate(L, S);
  return S;
}
export function cloneRunner3d(S) {
  const o = {};
  for (const k in S.o) o[k] = { ...S.o[k] };
  return { ...S, o, p: S.p.map(q => ({ ...q })), best: S.best.slice(), dead: S.dead.slice(), why: S.why.slice() };
}

// ---------------------------------------------------------------------------
// Collision

const approach = (v, target, a) => (v < target ? Math.min(target, v + a) : Math.max(target, v - a));
const near = (o, x, z, m) => !(o.z0 > z + m || o.z1 < z - m || o.x0 > x + m || o.x1 < x - m);
const WALL = { floor: 1, pool: 1 };

// Top of object i under a player centred at (x, z) whose footprint overlaps it, or NaN.
function topAt(L, S, i, who, x, z) {
  const o = L.objs[i];
  switch (o.k) {
    case 'floor': return o.y;
    case 'pool': return o.y - POOL_DEP;
    case 'ramp': return o.y + (o.y1 - o.y) * clamp((z - o.z0) / (o.z1 - o.z0), 0, 1);
    case 'tilt': {
      const st = S.o[i];
      return o.y + st.a * (clamp(x, o.x0, o.x1) - o.cx) + st.b * (clamp(z, o.z0, o.z1) - o.cz);
    }
  }
  return NaN;
}

// Highest surface under the player with its top in [lo, hi]: [top, index, sub] or null.
function support(L, S, who, x, z, lo, hi) {
  let best = -Infinity, bi = -1, bs = 0;
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    if (o.z0 >= z + HW || o.z1 <= z - HW || o.x0 >= x + HW || o.x1 <= x - HW) continue;
    const t = topAt(L, S, i, who, x, z);
    if (t !== t || t < lo || t > hi || t <= best) continue;
    best = t; bi = i; bs = 0;
  }
  return bi < 0 ? null : [best, bi, bs];
}

// Move along one axis and push out of static walls (tops above the step-up height).
function moveAxis(L, S, p, ax, dv) {
  if (ax === 0) p.x += dv; else p.z += dv;
  const tol = p.y + (p.gr ? P3.stepUp : AIR_TOL);
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    if (!WALL[o.k]) continue;
    const top = o.k === 'pool' ? o.y - POOL_DEP : o.y;
    if (top <= tol || top - o.h >= p.y + P3.h) continue;
    if (p.x + HW <= o.x0 || p.x - HW >= o.x1 || p.z + HW <= o.z0 || p.z - HW >= o.z1) continue;
    if (ax === 0) {
      const back = dv > 0 || (dv === 0 && p.x < (o.x0 + o.x1) / 2);
      p.x = back ? o.x0 - HW - EPS : o.x1 + HW + EPS; p.vx = 0;
    } else {
      const back = dv > 0 || (dv === 0 && p.z < (o.z0 + o.z1) / 2);
      p.z = back ? o.z0 - HW - EPS : o.z1 + HW + EPS; p.vz = 0;
    }
  }
}

function stepPlayer(L, S, who, bits) {
  const p = S.p[who];
  const dx = (bits & IN_R ? 1 : 0) - (bits & IN_L ? 1 : 0), dz = (bits & IN_F ? 1 : 0) - (bits & IN_B ? 1 : 0);
  const n = dx && dz ? DIAG : 1;
  const acc = p.gr ? P3.accel : P3.airAccel, dec = p.gr ? P3.decel : P3.airDecel;
  const tx = dx * n * P3.maxSpeed;
  let tz = dz * n * P3.maxSpeed;
  p.vx = approach(p.vx, tx, dx ? (p.vx * tx < 0 ? acc * P3.turnBoost : acc) : dec);
  const lead = p.z - S.zone, vz0 = p.vz;
  if (lead > LEAD_MAX && p.gr && tz > S.v * 0.5) tz = S.v * 0.5;
  p.vz = approach(p.vz, tz, dz ? (p.vz * tz < 0 ? acc * P3.turnBoost : acc) : dec);
  if (lead > LEAD_MAX && !p.gr && p.vz > vz0 && p.vz > 0) p.vz = Math.max(vz0, 0);

  // jump: coyote time, a short buffer for early presses, and holding jump re-jumps on landing
  const jd = bits & IN_J;
  if (jd && !p.jh) p.jb = P3.jumpBuf; else if (p.jb > 0) p.jb--;
  p.jh = jd ? 1 : 0;
  if (p.gr) p.coy = P3.coyote; else if (p.coy > 0) p.coy--;
  if (p.coy > 0 && (p.jb > 0 || (jd && p.gr))) {
    p.vy = P3.jumpVel; p.gr = false; p.coy = 0; p.jb = 0; p.jumpN++; p.gref = -1;
  }
  if (!p.gr) p.vy = Math.max(-P3.maxFall, p.vy - P3.gravity);
  else p.vy = 0;

  moveAxis(L, S, p, 0, p.vx);
  moveAxis(L, S, p, 1, p.vz);
  if (p.z > S.zone + LEAD_HARD) { p.z = S.zone + LEAD_HARD; if (p.vz > 0) p.vz = 0; }

  let ny = p.y + p.vy;
  if (p.vy > 0) {   // head against the underside of a static slab
    for (let i = S.lo; i < S.hi; i++) {
      const o = L.objs[i];
      if (o.k !== 'floor') continue;
      const b = o.y - o.h;
      if (b < p.y + P3.h - EPS || b >= ny + P3.h) continue;
      if (p.x + HW <= o.x0 || p.x - HW >= o.x1 || p.z + HW <= o.z0 || p.z - HW >= o.z1) continue;
      ny = b - P3.h; p.vy = 0;
    }
  }
  let sup = null;
  if (p.gr) sup = support(L, S, who, p.x, p.z, p.y - SNAP_DOWN, p.y + P3.stepUp);
  else if (p.vy <= 0) sup = support(L, S, who, p.x, p.z, ny - EPS, p.y + AIR_TOL);
  if (sup) {
    p.y = sup[0]; p.vy = 0; p.gr = true; p.gref = sup[1]; p.gs = sup[2]; p.fy = sup[0];
  } else {
    p.y = ny; p.gr = false; p.gref = -1; p.gs = 0;
  }
}

// ---------------------------------------------------------------------------
// Objects and hazards

function updateObjects(L, S) {
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    if (o.k !== 'tilt') continue;
    const st = S.o[i];
    let ta = 0, tb = 0, n = 0;
    for (const p of S.p) {
      if (!p.alive || !p.gr || p.gref !== i) continue;
      ta += clamp((p.x - o.cx) / o.hx, -1, 1); tb += clamp((p.z - o.cz) / o.hz, -1, 1); n++;
    }
    // weight on the +x side pushes that side down (negative slope)
    st.va = st.va * (1 - TILT.damp) - ta * TILT.load - st.a * TILT.spring; st.a += st.va;
    st.vb = st.vb * (1 - TILT.damp) - tb * TILT.load - st.b * TILT.spring; st.b += st.vb;
    if (st.a > o.amax) { st.a = o.amax; if (st.va > 0) st.va = 0; } else if (st.a < -o.amax) { st.a = -o.amax; if (st.va < 0) st.va = 0; }
    if (st.b > o.amax) { st.b = o.amax; if (st.vb > 0) st.vb = 0; } else if (st.b < -o.amax) { st.b = -o.amax; if (st.vb < 0) st.vb = 0; }
    if (!n && Math.abs(st.a) < 2e-4 && Math.abs(st.va) < 1e-4 && Math.abs(st.b) < 2e-4 && Math.abs(st.vb) < 1e-4) {
      st.a = 0; st.b = 0; st.va = 0; st.vb = 0;
    }
  }
}

const boxHit = (p, ins, x0, x1, y0, y1, z0, z1) =>
  p.x + HW - ins > x0 && p.x - HW + ins < x1 && p.z + HW - ins > z0 && p.z - HW + ins < z1 && p.y < y1 && p.y + P3.h > y0;

function hazard(L, S, who, p) {
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    if (!near(o, p.x, p.z, 1.5)) continue;
    switch (o.k) {
      case 'spikes':
        if (boxHit(p, 0.08, o.x0, o.x1, o.y, o.y + o.th, o.z0, o.z1)) return 'spike';
        break;
      case 'pool':
        if ((o.el === 2 || o.el !== who) && p.y < o.y - 0.12 &&
          p.x + HW - 0.18 > o.x0 && p.x - HW + 0.18 < o.x1 && p.z + HW - 0.18 > o.z0 && p.z - HW + 0.18 < o.z1) return 'pool';
        break;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Step

export function stepRunner3d(L, S, inputs) {
  S.tick++; S.phaseT++;
  if (S.phase === R3_OVER) return S;
  const counting = S.phase === R3_COUNT;
  if (counting) { if (S.phaseT >= COUNT_TICKS) { S.phase = R3_PLAY; S.phaseT = 0; } }
  else { S.v = speedAt(S.zone - ZONE_START); S.zone += S.v; }
  activate(L, S);
  updateObjects(L, S);
  let died = false;
  for (let i = 0; i < 2; i++) {
    const p = S.p[i];
    if (!p.alive) continue;
    // a tilted slab slowly slides what stands on it downhill
    if (p.gr && p.gref >= 0 && L.objs[p.gref].k === 'tilt') {
      const st = S.o[p.gref];
      p.x -= st.a * TILT.slide; p.z -= st.b * TILT.slide;
    }
    stepPlayer(L, S, i, counting ? 0 : inputs[i] | 0);
    if (p.z > S.best[i]) S.best[i] = p.z;
    if (counting) continue;
    const why = p.y < FALL_Y || p.y < p.fy - FALL_DEPTH ? 'fall' : p.z < S.zone ? 'zone' : hazard(L, S, i, p);
    if (why) { p.alive = false; S.dead[i] = S.tick; S.why[i] = why; died = true; }
  }
  if (died && !S.sb) {
    const a = S.p[0].alive, b = S.p[1].alive;
    S.win = !a && !b ? DRAW : a ? SOL : LUNA;
    S.phase = R3_OVER; S.phaseT = 0;
  }
  return S;
}

export function survival(S, i) {
  const end = S.dead[i] >= 0 ? S.dead[i] : S.tick;
  return Math.max(0, end - COUNT_TICKS) / 60;
}
export const distance = (L, S, i) => Math.max(0, S.best[i] - L.spawn[i].z);
