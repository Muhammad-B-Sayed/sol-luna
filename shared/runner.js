// Sol & Luna — Runner: an endless, seeded versus mode.
// The view scrolls right at a speed that slowly rises; both players run to stay on screen.
// Whoever survives longer wins. Runs on the browser (local play, online prediction) and the
// server (authoritative rooms), like shared/sim.js, whose player physics it reuses unchanged.
//
// World: 30 rows high, endless to the right. Columns are generated chunk by chunk from the
// seed, on demand, so every machine builds the exact same course. Each chunk is a flat run-up
// ("start ledge", at least 3 tiles) followed by one feature; the next chunk's run-up is the
// feature's landing. Moving parts live in L.objs (static definitions); their changing state
// lives in S.o, only for the objects near the screen.
import {
  TS, ROWS, WORLD_W, WORLD_H, PHYS, T_EMPTY, T_SOLID, T_SUN, T_MOON, T_SHADE, SOL, LUNA, IN_RIGHT,
  mkPlayer, stepPlayer, moveEnt, moveY, checkHazards,
} from './sim.js';

export const COUNT_TICKS = 180;                  // 3-2-1 before the scroll starts
export const RPH_COUNT = 0, RPH_PLAY = 1, RPH_OVER = 2;
export const DRAW = 2;
export const START_H = 21;                       // ground row of the start area
export const SPAWN_TX = 10;                      // spawn column (both players, same spot)
const HMIN = 10, HMAX = 24;                      // ground rows the course stays between
const SEG = 12;                                  // plank collision segment width (px)
const OID0 = 10000;                              // solid ids: OID0 + objIndex * 64 + segment
const oid = (i, j = 0) => OID0 + i * 64 + j;
const oidObj = (id) => (id >= OID0 ? Math.floor((id - OID0) / 64) : -1);
const EPS = 0.001;
// The right edge of the view is not a wall: a wall there could stop a jump mid-air over a pit.
// Past it a player can't speed up, keeps the momentum of a jump, and stops on landing until
// the view catches up. A hard limit sits AHEAD px further on, out of normal reach.
export const AHEAD = 10 * TS;

// Scroll speed (px/tick) by distance scrolled, in tiles. The players run 3.25 px/tick.
// A quicker first 100 tiles (about 30 s), then the slower climb, joining the old curve at 350.
const SPEED = [[0, 1.35], [100, 1.67], [350, 1.95], [700, 2.35], [1100, 2.6], [1600, 2.75]];
export function speedAt(cam) {
  const t = cam / TS;
  for (let k = 1; k < SPEED.length; k++) {
    const [t1, v1] = SPEED[k];
    if (t <= t1) { const [t0, v0] = SPEED[k - 1]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
  }
  return SPEED[SPEED.length - 1][1];
}
export const SPEED_TABLE = SPEED;
// Difficulty 0..1 by distance (tiles): margins tighten and features get longer.
export const MAX_DIFF_AT = 1100;
export const diffAt = (tx) => Math.max(0, Math.min(1, tx / MAX_DIFF_AT));

// Obstacle timings (ticks)
export const SLAB_GONE = 40, SLAB_REFORM = 20;
export const SHARD_G = 0.45, SHARD_GONE = 150, SHARD_REGROW = 40;
export const PLANK = { load: 0.0035, spring: 0.006, damp: 0.14 };
export const VENT = { drag: 0.88, lift: 0.85 };   // rises at about 4.3 px/tick

// Widest gap (whole tiles) the sim clears, by rise of the landing in tiles (tools/calibrate.js).
const ENV = { '-4': 9, '-3': 9, '-2': 8, '-1': 8, 0: 7, 1: 7, 2: 6, 3: 6 };
const env = (rise) => ENV[Math.max(-4, Math.min(3, rise))];
// Tiles kept below that limit: 4 at the start, 1 at full difficulty. Never below 1.
export const margin = (d) => Math.max(1, 4 - 3 * d);
const maxGap = (rise, d) => Math.max(1, Math.floor(env(rise) - margin(d)));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Seeded generation

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundCol(h, top = T_SOLID) {
  const c = new Uint8Array(ROWS);
  for (let y = h; y < ROWS; y++) c[y] = T_SOLID;
  if (top !== T_SOLID) c[h] = top;
  return c;
}

// Kinds, the distance (tiles) where each first appears, and its weight once unlocked.
export const KINDS = [
  ['gaps', 0, 3], ['steps', 0, 1.2], ['flat', 0, 0.8], ['thorns', 30, 1.4], ['shade', 60, 1],
  ['twin', 90, 1.4], ['plank', 120, 2], ['crumble', 170, 1.5], ['eclipse', 220, 1.5],
  ['vent', 280, 1], ['swing', 340, 1.5], ['shards', 400, 1.3],
];

class Gen {
  constructor(L) { this.L = L; this.h = L.h; this.r = L.rnd; }
  get x() { return this.L.cols.length; }
  rand() { return this.r(); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }   // integer in [a, b]
  ground(n, top = T_SOLID) { for (let k = 0; k < n; k++) this.L.cols.push(groundCol(this.h, top)); }
  pit(n) { for (let k = 0; k < n; k++) this.L.cols.push(new Uint8Array(ROWS)); }
  obj(o) { this.L.objs.push(o); return o; }
  // landing height after a jump that rises `r` tiles, kept inside the band
  rise(d) {
    const up = d < 0.15 ? 1 : d < 0.5 ? 2 : 3, down = up;
    let r = this.ri(-down, up);
    if (this.h < 15 && r > 0 && this.rand() < 0.6) r = -r;
    if (this.h > 21 && r < 0 && this.rand() < 0.6) r = -r;
    if (this.h - r < HMIN) r = -Math.abs(r);
    if (this.h - r > HMAX) r = Math.abs(r);
    return r;
  }
}

const FEAT = {
  flat(g, d) {
    g.ground(g.ri(5, 9));
    const r = g.ri(-1, 1);
    if (g.h - r >= HMIN && g.h - r <= HMAX) g.h -= r;
    g.ground(g.ri(4, 6));
  },
  gaps(g, d) {
    const n = 1 + (d > 0.3 ? g.ri(0, 1) : 0) + (d > 0.65 ? g.ri(0, 1) : 0);
    for (let k = 0; k < n; k++) {
      const r = g.rise(d), mx = maxGap(r, d);
      g.pit(g.ri(Math.max(2, mx - 2 - Math.round(1 - d)), mx));
      g.h -= r;
      if (k < n - 1) g.ground(g.ri(Math.max(2, Math.round(4 - 2 * d)), 5));
    }
  },
  steps(g, d) {
    const n = g.ri(2, 3 + Math.round(2 * d));
    let dir = g.rand() < 0.5 ? 1 : -1;
    if (g.h - 2 * n < HMIN) dir = -1;
    if (g.h + 2 * n > HMAX) dir = 1;
    for (let k = 0; k < n; k++) {
      const r = g.ri(1, d < 0.3 ? 1 : 2) * dir;
      if (g.h - r < HMIN || g.h - r > HMAX) break;
      g.h -= r;
      g.ground(g.ri(Math.abs(r) > 1 ? 3 : 2, 4));
    }
  },
  thorns(g, d, intro) {
    const n = intro ? 1 : 1 + (d > 0.4 ? g.ri(0, 2) : 0);
    for (let k = 0; k < n; k++) {
      const w = intro ? 1 : g.ri(1, Math.min(4, 1 + Math.round(3 * d)));
      g.obj({ k: 'thorn', x: g.x * TS, w: w * TS, y: g.h * TS });
      g.ground(w);
      if (k < n - 1) g.ground(g.ri(5, 7));
    }
  },
  shade(g, d, intro) {
    g.ground(intro ? 0 : g.ri(0, 2));
    g.ground(intro ? 2 : g.ri(2, Math.min(5, maxGap(0, d))), T_SHADE);
  },
  // Twin pools: one sun, one moon, the same width. Each player wades one and jumps the other.
  twin(g, d, intro) {
    const w = intro ? 2 : g.ri(2, Math.min(5, maxGap(0, d)));
    const first = g.rand() < 0.5 ? T_SUN : T_MOON;
    g.ground(w, first);
    g.ground(g.ri(2, 4));
    g.ground(w, first === T_SUN ? T_MOON : T_SUN);
  },
  // Chain plank: a beam hung from a chain at its middle. It tilts toward the weight on it and
  // springs back to level with damping. The jumps on and off are short enough for any tilt.
  plank(g, d, intro) {
    const count = !intro && d > 0.55 && g.rand() < 0.4 ? 2 : 1;
    const drop = !intro && d > 0.4 && g.rand() < 0.5 ? 1 : 0;    // plank a tile below the ledge
    const smax = lerp(0.24, 0.34, intro ? 0 : d);
    let gap = intro ? 1 : g.ri(1, 2);
    const top = (g.h + drop) * TS;
    for (let k = 0; k < count; k++) {
      const len = intro ? 6 : g.ri(6, 8);
      g.pit(gap);
      const x = g.x * TS, w = len * TS;
      g.obj({ k: 'plank', x, y: top, w, h: 12, px: x + w / 2, smax, n: w / SEG, ax0: x, ax1: x + w });
      g.pit(len);
      gap = g.ri(1, 2);
    }
    g.pit(intro ? 1 : g.ri(1, d > 0.5 ? 2 : 1));
    const r = intro || d < 0.3 ? 0 : g.ri(-1, 1);
    g.h = Math.max(HMIN, Math.min(HMAX, g.h + drop - r));
  },
  // Ember slabs: floating stones that crack under a standing player, fall away, then re-form.
  crumble(g, d, intro) {
    const n = intro ? 1 : 1 + (d > 0.4 ? 1 : 0) + (d > 0.75 && g.rand() < 0.5 ? 1 : 0);
    const crack = Math.round(lerp(34, 24, intro ? 0 : d));
    let h = g.h;
    for (let k = 0; k < n; k++) {
      const r = intro || d < 0.3 ? 0 : g.ri(-1, 1);
      if (h - r < HMIN || h - r > HMAX) continue;
      g.pit(intro ? 1 : g.ri(1, Math.min(3, maxGap(r, d))));
      h -= r;
      const w = intro ? 3 : g.ri(2, 3);
      g.obj({ k: 'slab', x: g.x * TS, y: h * TS, w: w * TS, h: 10, crack });
      g.pit(w);
    }
    const r = intro || d < 0.3 ? 0 : g.ri(-1, 1);
    g.pit(intro ? 1 : g.ri(1, Math.min(3, maxGap(r, d))));
    g.h = Math.max(HMIN, Math.min(HMAX, h - r));
  },
  // Eclipse stones: alternating sun and moon stones over a pit. Each player stands only on
  // their own colour and drops through the other's. The layout is mirrored so both players
  // face the same set of jumps (first, middle and last swapped).
  eclipse(g, d, intro) {
    const w = 2, s = !intro && d > 0.55 ? g.ri(0, 1) : 0;
    let a = intro ? 1 : g.ri(1, 2);
    const mg = maxGap(0, d);
    while (a > 1 && a + w + s > mg) a--;
    const m = intro ? 2 : g.ri(2, 3);
    const first = g.rand() < 0.5 ? SOL : LUNA;
    const x0 = g.x;
    for (let k = 0; k < 2 * m; k++) {
      const tx = x0 + a + k * (w + s);
      g.obj({ k: 'stone', el: k % 2 ? 1 - first : first, x: tx * TS, y: g.h * TS, w: w * TS, h: 12 });
    }
    g.pit(2 * a + (2 * m - 1) * (w + s) + w);
  },
  // Star well: a cliff too tall to climb, with an updraft blowing up its face from the pit.
  vent(g, d, intro) {
    const H = intro ? 5 : g.ri(5, d > 0.6 ? 7 : 6);
    while (g.h - H < HMIN) { g.h += g.ri(1, 2); g.ground(g.ri(2, 3)); }
    const w = intro ? 3 : g.ri(2, 3);
    g.obj({ k: 'vent', x: g.x * TS, w: w * TS, top: (g.h - H) * TS - 8 });
    g.pit(w);
    g.h -= H;
    g.ground(4);   // the lift throws you over the top at speed: room to land before the next thing
  },
  // Swinging lantern: a platform on a long chain, swinging on a fixed clock (players don't
  // move it). Gaps are sized for the platform's nearest and farthest point.
  swing(g, d, intro) {
    const R = g.ri(4, 6) * TS, w = 60;
    const drop = !intro && d > 0.4 && g.rand() < 0.5 ? 1 : 0;
    const mgPx = maxGap(-drop, d) * TS;
    let A = lerp(0.16, 0.3, intro ? 0 : d);
    const amp = () => R * A;                                     // sin A ~ A (A <= 0.3)
    while (18 + 2 * amp() + TS > mgPx && A > 0.06) A -= 0.02;
    const P = g.ri(140, 180) - Math.round(30 * (intro ? 0 : d));
    const ph = g.ri(0, P - 1);
    const count = !intro && d > 0.6 && g.rand() < 0.35 ? 2 : 1;
    const edge = g.x * TS;
    let cx = edge + 18 + amp() + w / 2;
    const top = (g.h + drop) * TS;
    for (let k = 0; k < count; k++) {
      g.obj({ k: 'swing', ax: cx, ay: top - R, R, A, P, ph, w, h: 12, ax0: cx - amp() - w / 2, ax1: cx + amp() + w / 2 });
      if (k < count - 1) cx += w + g.ri(1, 2) * TS;   // in phase: the gap between them is constant
    }
    const land = Math.ceil((cx + amp() + w / 2 + 18) / TS);
    g.pit(land - g.x);
    g.h = Math.max(HMIN, Math.min(HMAX, g.h + drop));
  },
  // Falling shards: a low gallery whose ceiling drops crystal shards. A shard shakes and
  // glows for a moment when someone comes near, falls, shatters, and grows back.
  shards(g, d, intro) {
    const len = intro ? 14 : g.ri(14, 18), h = g.h;
    const x0 = g.x;
    for (let k = 0; k < len; k++) {
      const c = groundCol(h);
      if (k > 0 && k < len - 1) for (let y = h - 9; y <= h - 7; y++) c[y] = T_SOLID;
      g.L.cols.push(c);
    }
    const trig = lerp(3.5, 4.5, intro ? 0 : d) * TS, tell = Math.round(lerp(42, 28, intro ? 0 : d));
    for (let c = 4; c < len - 3; c += intro ? 6 : g.ri(4, 6)) {
      g.obj({ k: 'shard', x: (x0 + c) * TS + 6, w: 12, y: (h - 6) * TS, len: 30, floor: h * TS, trig, tell });
    }
  },
};

function pickKind(L, tx) {
  for (const [k, at] of KINDS) if (tx >= at && !L.seen.has(k)) { L.seen.add(k); return [k, true]; }
  const d = diffAt(tx);
  const pool = KINDS.filter(([k, at]) => tx >= at && k !== L.last);
  let tot = 0;
  const wts = pool.map(([k, , w]) => (k === 'flat' ? w * (1 - 0.6 * d) : w));
  for (const w of wts) tot += w;
  let r = L.rnd() * tot;
  for (let i = 0; i < pool.length; i++) { r -= wts[i]; if (r <= 0) return [pool[i][0], false]; }
  return [pool[pool.length - 1][0], false];
}

function genChunk(L) {
  const g = new Gen(L);
  const x0 = g.x, h0 = g.h, nObj = L.objs.length;
  let kind = 'start', intro = false, run = 26;
  if (!L.chunks.length) {
    g.ground(run);
  } else {
    [kind, intro] = pickKind(L, x0);
    const d = diffAt(x0);
    run = g.ri(Math.max(3, Math.round(6 - 3 * d)), Math.max(3, Math.round(9 - 5 * d)));
    g.ground(run);
    FEAT[kind](g, d, intro);
  }
  // activation extents (px) and a stable order for the objects of this chunk
  const added = L.objs.splice(nObj);
  for (const o of added) { if (o.ax0 === undefined) { o.ax0 = o.x; o.ax1 = o.x + o.w; } }
  added.sort((a, b) => a.ax0 - b.ax0);
  L.objs.push(...added);
  L.h = g.h;
  L.last = kind;
  L.chunks.push({ i: L.chunks.length, kind, intro, x0, x1: g.x, run, h0, h1: g.h, d: diffAt(x0), o0: nObj, o1: L.objs.length });
}

export function ensureGenerated(L, px) {
  while (L.cols.length * TS < px) genChunk(L);
}

export function buildRunner(seed) {
  const L = {
    runner: true, seed: seed >>> 0, cols: [], objs: [], chunks: [], h: START_H,
    rnd: mulberry32((seed >>> 0) ^ 0x51A7), seen: new Set(), last: '',
    spawn: { x: SPAWN_TX * TS + TS / 2 - PHYS.w / 2, y: START_H * TS - PHYS.h },
  };
  L.tileFn = (tx, ty) => {
    if (ty < 0 || ty >= ROWS) return T_EMPTY;      // open sky above, bottomless pits below
    if (tx < 0) return T_SOLID;
    while (tx >= L.cols.length) genChunk(L);
    return L.cols[tx][ty];
  };
  genChunk(L);
  return L;
}

export const newSeed = () => (Math.random() * 0x7fffffff) >>> 0 || 1;

// ---------------------------------------------------------------------------
// State

export const STATEFUL = { plank: 1, slab: 1, shard: 1 };

function initObj(o) {
  if (o.k === 'plank') return { s: 0, w: 0 };
  if (o.k === 'slab') return { st: 0, t: 0 };
  if (o.k === 'shard') return { st: 0, t: 0, dy: 0, vy: 0 };
  return null;
}

export function createRunnerState(L, { sandbox = false } = {}) {
  const p = [mkPlayer(L.spawn, 0), mkPlayer(L.spawn, 1)];
  p[1].face = 1;
  const S = {
    mode: 'runner', seed: L.seed, tick: 0, phase: RPH_COUNT, phaseT: 0, cam: 0, v: 0,
    lo: 0, hi: 0, o: {}, p, best: [L.spawn.x, L.spawn.x], dead: [-1, -1], why: ['', ''], win: -1,
    sb: sandbox ? 1 : 0,
  };
  activate(L, S);
  return S;
}

// Fast deep copy (prediction replays and the checker's search clone states a lot).
export function cloneRunner(S) {
  const o = {};
  for (const k in S.o) o[k] = { ...S.o[k] };
  return { ...S, o, p: S.p.map(q => ({ ...q })), best: S.best.slice(), dead: S.dead.slice(), why: S.why.slice() };
}

function activate(L, S) {
  const lim = S.cam + WORLD_W + AHEAD + 6 * TS;
  ensureGenerated(L, lim + 48 * TS);
  while (S.hi < L.objs.length && L.objs[S.hi].ax0 < lim) {
    const st = initObj(L.objs[S.hi]);
    if (st) S.o[S.hi] = st;
    S.hi++;
  }
  while (S.lo < S.hi && L.objs[S.lo].ax1 < S.cam - 6 * TS) { delete S.o[S.lo]; S.lo++; }
}

// ---------------------------------------------------------------------------
// Object geometry

export function swingPos(o, tick) {
  // smooth back-and-forth without trig, so every machine computes the same numbers
  const u = ((tick + o.ph) % o.P) / o.P;
  const v = u < 0.5 ? 4 * u - 1 : 3 - 4 * u;
  const th = o.A * v * (3 - v * v) / 2;
  const t2 = th * th;
  const sn = th - th * t2 / 6, cs = 1 - t2 / 2 + t2 * t2 / 24;
  return { x: o.ax + o.R * sn - o.w / 2, y: o.ay + o.R * cs, th };
}
export const plankSegY = (o, s, j) => o.y + (o.x + (j + 0.5) * SEG - o.px) * s;
export const plankEndY = (o, s, side) => o.y + (side > 0 ? o.w / 2 : -o.w / 2) * s;

// The solids player `who` collides with (eclipse stones are per element).
function solidsFor(L, S, who) {
  const out = [];
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    switch (o.k) {
      case 'stone':
        if (o.el === who) out.push({ o: { x: o.x, y: o.y }, id: oid(i), w: o.w, h: o.h, box: false });
        break;
      case 'slab':
        if (S.o[i].st <= 1) out.push({ o: { x: o.x, y: o.y }, id: oid(i), w: o.w, h: o.h, box: false });
        break;
      case 'swing': {
        const q = swingPos(o, S.tick);
        out.push({ o: { x: q.x, y: q.y }, id: oid(i), w: o.w, h: o.h, box: false });
        break;
      }
      case 'plank': {
        const s = S.o[i].s;
        for (let j = 0; j < o.n; j++) out.push({ o: { x: o.x + j * SEG, y: plankSegY(o, s, j) }, id: oid(i, j), w: SEG, h: o.h, box: false });
        break;
      }
    }
  }
  return out;
}

// Both players' solids in one pass (the hot path of the checker's search). Same entries in
// the same order as solidsFor(L, S, 0) and solidsFor(L, S, 1); shared entries are read-only.
function worldsFor(L, S) {
  const a = [], b = [];
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    switch (o.k) {
      case 'stone':
        (o.el === 0 ? a : b).push({ o: { x: o.x, y: o.y }, id: oid(i), w: o.w, h: o.h, box: false });
        break;
      case 'slab':
        if (S.o[i].st <= 1) { const e = { o: { x: o.x, y: o.y }, id: oid(i), w: o.w, h: o.h, box: false }; a.push(e); b.push(e); }
        break;
      case 'swing': {
        const q = swingPos(o, S.tick);
        const e = { o: { x: q.x, y: q.y }, id: oid(i), w: o.w, h: o.h, box: false };
        a.push(e); b.push(e);
        break;
      }
      case 'plank': {
        const s = S.o[i].s;
        for (let j = 0; j < o.n; j++) {
          const e = { o: { x: o.x + j * SEG, y: plankSegY(o, s, j) }, id: oid(i, j), w: SEG, h: o.h, box: false };
          a.push(e); b.push(e);
        }
        break;
      }
    }
  }
  return [{ L, S, solids: a, ents: S.p, pinned: false }, { L, S, solids: b, ents: S.p, pinned: false }];
}
// The one solid with this id that player `who` collides with, or null (as findSolid on its list).
function solidById(L, S, who, id) {
  const i = oidObj(id);
  if (i < S.lo || i >= S.hi) return null;
  const o = L.objs[i], j = id - oid(i);
  switch (o.k) {
    case 'stone': return o.el === who && !j ? { o: { x: o.x, y: o.y } } : null;
    case 'slab': return S.o[i].st <= 1 && !j ? { o: { x: o.x, y: o.y } } : null;
    case 'swing': { if (j) return null; const q = swingPos(o, S.tick); return { o: { x: q.x, y: q.y } }; }
    case 'plank': return j < o.n ? { o: { x: o.x + j * SEG, y: plankSegY(o, S.o[i].s, j) } } : null;
  }
  return null;
}
const findSolid = (W, id) => W.solids.find(s => s.id === id) || null;

// Stand a player on the highest solid their feet are level with (within `depth` px).
function seat(W, p, depth) {
  let best = null;
  for (const s of W.solids) {
    if (!(p.x < s.o.x + s.w - EPS && p.x + p.w > s.o.x + EPS)) continue;
    const pen = p.y + p.h - s.o.y;
    if (pen < -0.5 || pen > depth) continue;
    if (!best || s.o.y < best.o.y) best = s;
  }
  if (!best) return false;
  p.y = best.o.y - p.h; p.gref = best.id; p.gr = true; if (p.vy > 0) p.vy = 0;
  return true;
}

const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw - EPS && ax + aw > bx + EPS && ay < by + bh - EPS && ay + ah > by + EPS;

// ---------------------------------------------------------------------------
// Step

function updateObjects(L, S) {
  const live = S.p.filter(p => p.alive);
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i], st = S.o[i];
    if (o.k === 'plank') {
      let tq = 0;
      for (const p of live) if (p.gr && oidObj(p.gref) === i) tq += Math.max(-1, Math.min(1, (p.x + p.w / 2 - o.px) / (o.w / 2)));
      st.w = st.w * (1 - PLANK.damp) + tq * PLANK.load - st.s * PLANK.spring;
      st.s += st.w;
      if (st.s > o.smax) { st.s = o.smax; if (st.w > 0) st.w = 0; }
      else if (st.s < -o.smax) { st.s = -o.smax; if (st.w < 0) st.w = 0; }
      if (!tq && Math.abs(st.s) < 2e-4 && Math.abs(st.w) < 1e-4) { st.s = 0; st.w = 0; }
    } else if (o.k === 'slab') {
      if (st.st === 0) {
        if (live.some(p => p.gr && p.gref === oid(i))) { st.st = 1; st.t = 0; }
      } else {
        st.t++;
        if (st.st === 1 && st.t >= o.crack) { st.st = 2; st.t = 0; }
        else if (st.st === 2 && st.t >= SLAB_GONE) { st.st = 3; st.t = 0; }
        else if (st.st === 3 && st.t >= SLAB_REFORM && !live.some(p => overlaps(p.x, p.y, p.w, p.h, o.x, o.y, o.w, o.h))) { st.st = 0; st.t = 0; }
      }
    } else if (o.k === 'shard') {
      if (st.st === 0) {
        if (live.some(p => p.x + p.w >= o.x - o.trig && p.x <= o.x + o.w)) { st.st = 1; st.t = 0; }
      } else if (st.st === 1) {
        if (++st.t >= o.tell) { st.st = 2; st.t = 0; st.vy = 0; }
      } else if (st.st === 2) {
        const rest = o.floor - o.len - o.y;
        if (st.dy >= rest) { st.st = 3; st.t = 0; st.dy = 0; st.vy = 0; }
        else { st.vy += SHARD_G; st.dy = Math.min(rest, st.dy + st.vy); }
      } else if (st.st === 3) {
        if (++st.t >= SHARD_GONE) { st.st = 4; st.t = 0; }
      } else if (++st.t >= SHARD_REGROW) { st.st = 0; st.t = 0; }
    }
  }
}

function kill(S, i, why) {
  const p = S.p[i];
  if (!p.alive) return;
  p.alive = false; S.dead[i] = S.tick; S.why[i] = why;
}

function hazards(L, S, W, i) {
  const p = S.p[i];
  if (checkHazards(W, p, i)) return 'pool';
  if (p.y > WORLD_H) return 'fall';
  if (p.x + p.w / 2 < S.cam) return 'edge';
  for (let k = S.lo; k < S.hi; k++) {
    const o = L.objs[k];
    if (o.k === 'thorn') {
      if (overlaps(p.x + 4, p.y, p.w - 8, p.h, o.x, o.y - 7, o.w, 7)) return 'thorn';
    } else if (o.k === 'shard') {
      const st = S.o[k];
      if (st.st <= 2 && overlaps(p.x + 3, p.y + 3, p.w - 6, p.h - 3, o.x, o.y + st.dy, o.w, o.len)) return 'shard';
    }
  }
  return '';
}

export function stepRunner(L, S, inputs) {
  if (S.phase === RPH_OVER) { S.tick++; S.phaseT++; return S; }
  // remember where the part each player stands on is, before anything moves
  const ride = S.p.map((p, i) => {
    if (!p.alive || !p.gr || p.gref < OID0) return null;
    const s = solidById(L, S, i, p.gref);
    return s && { x: s.o.x, y: s.o.y };
  });
  S.tick++;
  S.phaseT++;
  const counting = S.phase === RPH_COUNT;
  if (counting) {
    if (S.phaseT >= COUNT_TICKS) { S.phase = RPH_PLAY; S.phaseT = 0; }
  } else {
    S.v = speedAt(S.cam);
    S.cam += S.v;
  }
  activate(L, S);
  updateObjects(L, S);
  const W = worldsFor(L, S);
  for (let i = 0; i < 2; i++) {
    const p = S.p[i];
    if (!p.alive) continue;
    if (ride[i]) {
      const ns = findSolid(W[i], p.gref);
      if (!ns) { p.gr = false; p.gref = -1; }      // crumbled away under them
      else {
        const dx = ns.o.x - ride[i].x, dy = ns.o.y - ride[i].y;
        if (dx) moveEnt(W[i], p, dx, 0, p.gref);
        if (dy > 0) p.y += dy; else if (dy < 0) moveY(W[i], p, dy, p.gref);
        seat(W[i], p, 16);
      }
    } else if (p.vy >= 0) seat(W[i], p, 10);         // a rising part catches a falling player
  }

  for (let i = 0; i < 2; i++) {
    const p = S.p[i];
    if (!p.alive) continue;
    // star wells: drag and lift while the player's centre is in the column
    if (!p.gr) {
      const cx = p.x + p.w / 2;
      for (let k = S.lo; k < S.hi; k++) {
        const o = L.objs[k];
        if (o.k === 'vent' && cx >= o.x && cx <= o.x + o.w && p.y + p.h > o.top) { p.vy = p.vy * VENT.drag - VENT.lift; break; }
      }
    }
    let bits = counting ? 0 : inputs[i] | 0;
    const beyond = p.x + p.w > S.cam + WORLD_W - 4, vx0 = Math.max(0, p.vx);
    if (beyond && p.gr) bits &= ~IN_RIGHT;
    stepPlayer(W[i], p, bits);
    if (beyond && p.vx > vx0) p.vx = vx0;
    const far = S.cam + WORLD_W + AHEAD;
    if (p.x + p.w > far) { moveEnt(W[i], p, far - (p.x + p.w), 0, -999); if (p.vx > 0) p.vx = 0; }
    if (p.x > S.best[i]) S.best[i] = p.x;
  }
  if (counting) return S;

  let died = false;
  for (let i = 0; i < 2; i++) {
    if (!S.p[i].alive) continue;
    const why = hazards(L, S, W[i], i);
    if (why && S.pred) predictedDeath(S, i, why);   // client prediction: see predictedDeath below
    else if (why) { kill(S, i, why); died = true; }
  }
  if (died && !S.sb) {
    const a = S.p[0].alive, b = S.p[1].alive;
    S.win = !a && !b ? DRAW : a ? SOL : LUNA;
    S.phase = RPH_OVER; S.phaseT = 0;
  }
  return S;
}

// Seconds survived (counted from the start of the scroll) and distance run (tiles).
export function survival(S, i) {
  const end = S.dead[i] >= 0 ? S.dead[i] : S.tick;
  return Math.max(0, end - COUNT_TICKS) / 60;
}
export const distance = (L, S, i) => Math.max(0, (S.best[i] - L.spawn.x) / TS);
export const chunkAt = (L, px) => {
  const tx = px / TS;
  let lo = 0, hi = L.chunks.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L.chunks[m].x0 <= tx) lo = m; else hi = m - 1; }
  return L.chunks[lo];
};
export { SEG, oid, oidObj, OID0, solidsFor };

// ---------------------------------------------------------------------------
// Client prediction (public/js/runner-sync.js, docs/netcode.md). A state with S.pred set never
// kills anyone and never ends the match: deaths and the end of the match are the server's alone.
// A death the prediction runs into is only noted, the first one per player, in
// S.pk[i] = { tick, why, x, y }. The array is copied on write, so cloned states never share it.
export function predictedDeath(S, i, why) {
  if (S.pk && S.pk[i]) return;
  const p = S.p[i];
  S.pk = S.pk ? S.pk.slice() : [null, null];
  S.pk[i] = { tick: S.tick, why, x: p.x, y: p.y };
}
