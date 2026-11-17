// Sol & Luna — Runner 3D: a third-person, seeded, endless versus course.
// Deterministic 60 Hz sim shared by the browser (local play, online prediction) and the server.
// No DOM, no Math.sin/cos/random in the step (prediction must match the server bit for bit).
//
// ===== CONTRACT (renderer, app shell and tools build against this; keep it stable) =====
// Space: x = lateral (+x is the player's right), y = up, z = forward along the course.
//        1 unit = one 2D tile (24 px). The course is centred on x = 0, about 2*HALF_W wide.
// Input bits: IN_L 1, IN_R 2, IN_J 4 (jump), IN_F 8 (forward, +z), IN_B 16 (back).
// L = buildRunner3d(seed): the course. Generated lazily, section by section.
//   L.objs[]  every piece of the world, sorted by activation z. Common fields:
//             { k, x0, x1, z0, z1, y }  rest footprint (min/max) and top surface height,
//             plus per-kind fields. Kinds in this file's KIND_DOC table.
//   L.secs[]  sections { i, kind, intro, z0, z1, d, o0, o1 } (o0..o1 = its objects).
//   L.spawn   [{x,y,z},{x,y,z}] for Sol and Luna.
// S = createRunner3dState(L): plain JSON (it is sent over the wire as is).
//   { mode:'runner3d', seed, tick, phase, phaseT, zone, v, lo, hi, o, p, best, dead, why, win, sb }
//   zone  z of the dusk wall behind the players; a player with p.z < zone is lost ('zone').
//   v     current zone speed (units/tick).  lo..hi = active object index window.
//   o     { [objIndex]: state } for stateful objects in the window only.
//   p[i]  { x, y, z, vx, vy, vz, gr, gref, alive, jumpN, coy, jh }  x,z = centre, y = feet.
//   dead[i] tick of death or -1, why[i] a key of WHY3, win = SOL | LUNA | DRAW | -1.
// stepRunner3d(L, S, [bitsSol, bitsLuna]) advances one tick and returns S.
// =======================================================================================

export const SOL = 0, LUNA = 1, DRAW = 2;
export const IN_L = 1, IN_R = 2, IN_J = 4, IN_F = 8, IN_B = 16;
export const R3_COUNT = 0, R3_PLAY = 1, R3_OVER = 2;
export const COUNT_TICKS = 180;
export const TICK_RATE = 60;
export const HALF_W = 5;          // nominal half width of the course (units)
export const FALL_Y = -14;        // below this a player is lost ('fall')
export const LEAD_MAX = 46;       // a player this far ahead of the zone cannot gain more ground

// Player box and movement: the 2D game's PHYS divided by the tile size, so the jump feels the same.
export const P3 = {
  hw: 0.36, h: 1.4,
  maxSpeed: 3.25 / 24, accel: 0.55 / 24, decel: 0.62 / 24, airAccel: 0.4 / 24, airDecel: 0.1 / 24,
  gravity: 0.33 / 24, jumpVel: 8.25 / 24, maxFall: 8.5 / 24, coyote: 5, stepUp: 0.5,
};

// Text for each cause of loss (the app shows these on the results card).
export const WHY3 = {
  zone: 'caught by the dusk', fall: 'fell into the abyss', pool: 'touched a hostile pool', spike: 'ran into thorns',
};

// Object kinds. Each sim author keeps this table current; the renderer has one view per kind
// and draws an unknown kind as a plain box over its footprint.
export const KIND_DOC = {
  floor: 'static slab. { h } thickness below y. Optional { skin }.',
  pool: 'liquid set into the floor. { el: 0 sun | 1 moon | 2 shade }. Surface y, deadly to the other element (shade: both).',
  spikes: 'crystal thorns on a floor, deadly to both. Top of thorns at y + 0.3.',
};

// Zone speed (units/tick) by distance travelled (units). Players run P3.maxSpeed = 0.135.
const SPEED = [[0, 1.0 / 24], [120, 1.45 / 24], [350, 1.95 / 24], [700, 2.35 / 24], [1100, 2.6 / 24], [1600, 2.75 / 24]];
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
// Generation (placeholder course: floors and gaps; the real generator replaces this)

function genSection(L) {
  const r = L.rnd, i = L.secs.length, z0 = L.z, o0 = L.objs.length;
  const floor = (len, w = HALF_W) => { L.objs.push({ k: 'floor', x0: -w, x1: w, z0: L.z, z1: L.z + len, y: L.y, h: 1 }); L.z += len; };
  let kind = 'start';
  if (!i) { L.z = -20; floor(46); } else {
    kind = 'gaps';
    const d = diffAt(z0);
    L.z += 2 + Math.floor(r() * (2 + 2 * d));
    floor(8 + Math.floor(r() * 6), HALF_W - Math.floor(r() * 3));
  }
  L.secs.push({ i, kind, intro: false, z0, z1: L.z, d: diffAt(z0), o0, o1: L.objs.length });
}
export function ensureGenerated(L, z) { while (L.z < z) genSection(L); }

export function buildRunner3d(seed) {
  const L = {
    runner3d: true, seed: seed >>> 0, objs: [], secs: [], z: 0, y: 0, rnd: mulberry32((seed >>> 0) ^ 0x3D51),
    spawn: [{ x: -1.2, y: 0, z: 0 }, { x: 1.2, y: 0, z: 0 }],
  };
  genSection(L);
  return L;
}

// ---------------------------------------------------------------------------
// State

const mkPlayer = (s) => ({ x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, gr: true, gref: -1, alive: true, jumpN: 0, coy: 0, jh: 0 });

function activate(L, S) {
  const far = Math.max(S.zone + LEAD_MAX, S.p[0].z, S.p[1].z) + 70;
  ensureGenerated(L, far + 40);
  while (S.hi < L.objs.length && L.objs[S.hi].z0 < far) S.hi++;
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
// Step

const approach = (v, target, a) => (v < target ? Math.min(target, v + a) : Math.max(target, v - a));

function solidAt(L, S, x, y, z) {   // highest floor top under a player box whose feet are at y
  let top = -Infinity;
  for (let i = S.lo; i < S.hi; i++) {
    const o = L.objs[i];
    if (o.k !== 'floor') continue;
    if (x + P3.hw <= o.x0 || x - P3.hw >= o.x1 || z + P3.hw <= o.z0 || z - P3.hw >= o.z1) continue;
    if (o.y <= y + P3.stepUp && o.y > top) top = o.y;
  }
  return top;
}

function stepPlayer(L, S, p, bits) {
  const dx = (bits & IN_R ? 1 : 0) - (bits & IN_L ? 1 : 0), dz = (bits & IN_F ? 1 : 0) - (bits & IN_B ? 1 : 0);
  const n = dx && dz ? 0.7071 : 1, acc = p.gr ? P3.accel : P3.airAccel, dec = p.gr ? P3.decel : P3.airDecel;
  p.vx = approach(p.vx, dx * n * P3.maxSpeed, dx ? acc : dec);
  let tz = dz * n * P3.maxSpeed;
  if (p.z > S.zone + LEAD_MAX && tz > S.v) tz = S.v;
  p.vz = approach(p.vz, tz, dz ? acc : dec);
  if (p.gr) p.coy = P3.coyote; else if (p.coy > 0) p.coy--;
  const jump = bits & IN_J;
  if (jump && p.coy > 0 && (!p.jh || p.gr)) { p.vy = P3.jumpVel; p.gr = false; p.coy = 0; p.jumpN++; }
  p.jh = jump ? 1 : 0;
  p.vy = Math.max(-P3.maxFall, p.vy - P3.gravity);
  p.x += p.vx; p.z += p.vz;
  const ny = p.y + p.vy, top = solidAt(L, S, p.x, p.y, p.z);
  if (p.vy <= 0 && top > -Infinity && ny <= top) { p.y = top; p.vy = 0; p.gr = true; } else { p.y = ny; p.gr = false; }
}

export function stepRunner3d(L, S, inputs) {
  S.tick++; S.phaseT++;
  if (S.phase === R3_OVER) return S;
  const counting = S.phase === R3_COUNT;
  if (counting) { if (S.phaseT >= COUNT_TICKS) { S.phase = R3_PLAY; S.phaseT = 0; } }
  else { S.v = speedAt(S.zone - ZONE_START); S.zone += S.v; }
  activate(L, S);
  let died = false;
  for (let i = 0; i < 2; i++) {
    const p = S.p[i];
    if (!p.alive) continue;
    stepPlayer(L, S, p, counting ? 0 : inputs[i] | 0);
    if (p.z > S.best[i]) S.best[i] = p.z;
    const why = counting ? '' : p.y < FALL_Y ? 'fall' : p.z < S.zone ? 'zone' : '';
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
