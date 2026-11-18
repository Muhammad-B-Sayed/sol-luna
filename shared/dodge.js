// Sol & Luna — Dodgeball, a two-player versus mode.
// Deterministic like shared/sim.js and shared by the browser (local play, online prediction)
// and the server (authoritative rooms). Player movement is the normal sim physics; this file
// adds the court, the ball and the rules. Only + - * / and sqrt are used on the ball, so every
// JS engine gets bit-identical results.
//
// Rules
//   - The court is split at the middle by a veil that players can't cross. Sol plays left.
//   - A random player (seeded RNG) serves first. The ball can only be thrown by the player
//     holding it, and only toward the other side.
//   - Hold the action button to aim: the throw starts flat, and after a short moment the aim
//     arrow swings up and down. Release to throw. A quick tap is a flat throw.
//   - A thrown ball is live until it bounces off the floor or the top of a platform, or
//     touches a wall or ceiling for the second time. One bank shot off a wall or ceiling
//     still counts. A live ball that touches the other player scores a point for the thrower.
//   - A dead ball bounces, rolls and stops. Whoever's side it is on may pick it up by touching
//     it (even mid-bounce). It always settles within REST_MAX ticks.
//   - Two clocks stop a player hogging the ball. Each possession (the ball is yours from the
//     moment it is served to you, handed to you, or comes down on your side, until it is the
//     other player's) starts with one of them:
//       * Pickup clock (pickClock, 10 s): the ball is loose on your side and you have not
//         held it yet this possession. Pick it up in time.
//       * Shot clock (shotClock, 20 s): starts the moment you hold the ball (a serve and a
//         handover put it in your hand, so it starts there). From then on it runs until the
//         ball is the other player's: while you hold it, while it is loose on your side after
//         your own throw, and while that throw is in the air. A throw that stays on your own
//         side does not reset it and does not bring back the pickup clock. It only starts
//         again in full after the other player has held the ball. If the ball rolls or
//         bounces to their side, they get their pickup clock, and yours keeps running in the
//         background until they hold it; if it comes back untouched, yours goes on.
//     If the running clock reaches 0 the ball jumps the veil into the other player's hand. It
//     cannot run out while a throw is winding up or in the air; it hands over as soon as the
//     ball is down on your side. So one possession lasts at most pickClock + shotClock plus
//     one throw's flight.
//   - After a hit, everyone resets to their spawns and the player who was hit serves.
//   - First to TO_WIN hits wins the match.

import { buildLevel, createState, stepPlayersOnly, tileAt, IN_ACT, SOL, LUNA, TS, WORLD_W, T_SOLID } from './sim.js';

export const DODGE = {
  toWin: 5,
  r: 10,              // ball radius (px); also its hit radius
  speed: 36,          // throw speed (px/tick), as COURT_SPEC.speed. See tools/check-dodge.js for why.
  liveGrav: 0.015,    // a live ball flies almost straight (drops 10 px over the whole court)
  deadGrav: 0.35,     // a dead ball drops like a ball
  floorBounce: 0.45,  // vertical speed kept on a floor bounce
  wallBounce: 0.3,    // horizontal speed kept off a side wall (low, so a miss stays on the far side)
  ceilBounce: 0.6,    // vertical speed kept off the ceiling or a platform's underside
  bounceFric: 0.8,    // horizontal speed kept on each floor bounce
  roll: 0.9,          // horizontal speed kept per tick while rolling
  aimDwell: 10,       // ticks the aim stays flat before it starts swinging (so a tap is flat)
  aimPeriod: 90,      // one full swing up, down and back (ticks)
  aimMax: 0.75,       // steepest aim, as a slope (about 37 degrees)
  pickClock: 600,     // 10 s to reach a loose ball on your side (before you first hold it)
  shotClock: 1200,    // 20 s from the moment you hold it until it is over the veil
  clockWarn: 300,     // the clocks show (and tick) only in their last 5 s
  ready: 50,          // freeze on throwing at the start of a point
  pointTicks: 100,    // pause after a hit
  liveMax: 75,        // a live ball that somehow never bounces dies after this
  restMax: 150,       // a dead ball is forced to settle after this
  // Online wind-up (fix C). A player with a round trip sees a remote throw about 1.1 round
  // trips late. So a throw at them stays in the thrower's hand that many ticks after the
  // release (the wind-up), then flies at full speed. The release reaches their screen during
  // the wind-up, and they see the launch on time and the whole flight, as in local play.
  windMax: 12,        // 200 ms: the longest wind-up (covers a 75 ms one-way link at 36 px/tick)
};

// Wind-up for throws at a player: how late their screen shows a remote throw, capped at
// windMax ticks. That is about 1.1 round trips (rttMs, plus the 2-tick snapshot interval; the
// latency harness measures it) plus `queue`, the inputs of theirs the server holds in its
// queue: a browser that started a few ticks ahead of the server stays that far ahead (3-5 ticks
// in tools/dodge-filmstrip.cjs runs), and sees the other player that much later. 0 when local.
export function windupFor(rttMs, queue = 0) {
  const t = Math.round(1.1 * Math.max(0, +rttMs || 0) / (1000 / 60) + Math.max(0, +queue || 0));
  return Math.min(DODGE.windMax, t);
}

export const NET = WORLD_W / 2;
export const DP_READY = 0, DP_PLAY = 1, DP_POINT = 2, DP_OVER = 3;
export const B_HELD = 0, B_LIVE = 1, B_DEAD = 2, B_REST = 3;
export const CLOCK_PICK = 0, CLOCK_SHOT = 1;   // which clock D.clock is (D.clockKind)

// ---------------------------------------------------------------------------
// Court: one screen, mirrored halves. Built from a spec so tools can rebuild the old court
// (tools/check-dodge.js compares them):
//   inset  extra wall columns on each side (0: walls at columns 0 and 39 only)
//   plats  [row, firstCol, lastCol] on Sol's half; Luna's are mirrored
//   spawn  Sol's spawn column (Luna's is mirrored)
//   defl   deflectors, or none: {k, yB, steep} puts a bronze mirror bracket on each back wall.
//          It is a triangle with its upright side on the wall, ending at y = yB. Its lower face
//          is the mirror, with a 3-4-5 normal: steep, (0.8, 0.6) toward the court, the point 3k
//          out at y = yB - 4k and the wall side 8k tall; otherwise (0.6, 0.8), 4k out, 6k tall.
//          A ball thrown up at it from the other side comes back down onto the platform. Its
//          upper face slants the other way so nothing can rest on it.
//   speed  throw speed (px/tick)

export const OLD_COURT_SPEC = {
  inset: 0, spawn: 12, defl: null, speed: 24,
  plats: [[25, 7, 10], [22, 2, 5], [22, 13, 16], [19, 8, 11], [16, 2, 4], [16, 15, 17], [13, 8, 11]],
};
export const COURT_SPEC = {
  inset: 3, spawn: 7, speed: 36,  // court 32 tiles wide (was 38); spawns behind the platforms
  plats: [[24, 10, 13]],          // one platform per side, centred on the half (cols 4..19), 4 tiles up
  defl: { k: 20, yB: 408, steep: true },
};

function courtMap(spec) {
  const g = [], k = spec.inset;
  for (let y = 0; y < 30; y++) g.push(new Array(40).fill(y === 0 || y >= 28 ? '#' : '.'));
  for (let y = 0; y < 30; y++) for (let x = 0; x <= k; x++) { g[y][x] = '#'; g[y][39 - x] = '#'; }
  for (const [row, a, b] of spec.plats) for (let x = a; x <= b; x++) { g[row][x] = '#'; g[row][39 - x] = '#'; }
  g[27][spec.spawn] = 'a'; g[27][39 - spec.spawn] = 'b';
  g[27][k + 1] = 'A'; g[27][38 - k] = 'B';   // the level format needs doors; the court hides them
  return g.map(r => r.join(''));
}

// A deflector as two faces, each {x, y, nx, ny}: a point on the face and its outward normal
// (3-4-5, so every number is plain arithmetic). `side` is the half it hangs in.
function deflectors(spec) {
  if (!spec.defl) return [];
  const { k, yB } = spec.defl, out = [];
  for (const side of [SOL, LUNA]) {
    const xw = side === LUNA ? (39 - spec.inset) * TS : (spec.inset + 1) * TS;   // the back wall's face
    const s = side === LUNA ? -1 : 1;                                               // toward the net
    // shallow: mirror normal (0.6, 0.8), the point 4k out and the wall side 6k tall;
    // steep: normal (0.8, 0.6), the point 3k out and the wall side 8k tall
    const [px, py] = spec.defl.steep ? [3, 4] : [4, 3], [nx, ny] = spec.defl.steep ? [0.8, 0.6] : [0.6, 0.8];
    out.push({ side, xw, s, k, yB, yC: yB - 2 * py * k, ax: xw + s * px * k, ay: yB - py * k,
      faces: [{ x: xw, y: yB, nx: s * nx, ny, mirror: true }, { x: xw, y: yB - 2 * py * k, nx: s * nx, ny: -ny }] });
  }
  return out;
}

export function buildCourt(spec = COURT_SPEC) {
  const L = buildLevel({ name: 'Dodgeball', par: 0, map: courtMap(spec),
    hint: 'Sol: hold ↓ to aim, release to throw · Luna: hold S · Don\'t get hit!' }, -1);
  L.dodge = true;
  L.doors = [];       // nothing to exit through
  L.spec = spec;
  L.speed = spec.speed;
  L.defl = deflectors(spec);
  L.wallL = (spec.inset + 1) * TS; L.wallR = (39 - spec.inset) * TS;   // inner faces of the side walls
  return L;
}

export const COURT = buildCourt();

// ---------------------------------------------------------------------------
// helpers

// Deterministic 32-bit RNG (mulberry32). The state lives in S.d.rng so it is part of the
// snapshot and replays identically.
function rand(D) {
  D.rng = (D.rng + 0x6D2B79F5) | 0;
  let t = D.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// What a server snapshot should show `viewer` online: the other player's aim is withheld
// while they hold the button (their aim counter, and the action bit of their input, from which
// the counter could be rebuilt), so a client can't draw or read the angle before the release.
// The release itself (D.wind, D.windSlope, or a live ball) is not withheld, so the flight is
// drawn on time. Returns { st, inp }; the inputs are left as they are for the viewer's own side.
// Not wired into server/index.js yet (see HANDOFF.md, Dodgeball).
export function dodgeViewFor(S, inp, viewer) {
  const other = 1 - viewer, D = S.d;
  if (!D || (D.aim[other] < 0 && !(inp[other] & IN_ACT))) return { st: S, inp };
  const aim = D.aim.slice(); aim[other] = -1;
  const inp2 = inp.slice(); inp2[other] &= ~IN_ACT;
  return { st: { ...S, d: { ...D, aim } }, inp: inp2 };
}

export const sideOf = (x) => (x < NET ? SOL : LUNA);
export const towardNet = (who) => (who === SOL ? 1 : -1);

// Aim slope (positive = upward) after holding the button for t ticks.
export function aimSlope(t) {
  const k = t - DODGE.aimDwell;
  if (k <= 0) return 0;
  const P = DODGE.aimPeriod, q = P / 4, A = DODGE.aimMax, ph = k % P;
  if (ph < q) return A * ph / q;
  if (ph < 3 * q) return A * (2 * q - ph) / q;
  return A * (ph - 4 * q) / q;
}

// Where a held ball sits (and where a throw starts): in front of the chest, toward the net.
export function handPos(p, who) {
  return { x: p.x + p.w / 2 + towardNet(who) * 13, y: p.y + 12 };
}

function solidTile(L, tx, ty) {
  const t = tileAt(L, tx, ty);
  return t === T_SOLID || t >= 4;
}
function boxHits(L, x, y, r) {
  const x0 = Math.floor((x - r) / TS), x1 = Math.floor((x + r - 0.001) / TS);
  const y0 = Math.floor((y - r) / TS), y1 = Math.floor((y + r - 0.001) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidTile(L, tx, ty)) return true;
  return false;
}
function circleHitsBox(cx, cy, r, x, y, w, h) {
  const nx = cx < x ? x : cx > x + w ? x + w : cx;
  const ny = cy < y ? y : cy > y + h ? y + h : cy;
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// ---------------------------------------------------------------------------
// state

// pv: prediction only, the player this ball touched while the screen waits for the server's word
// lb: the tick (b.t) of the last bank, so a corner (two surfaces in one tick) counts once
function freshBall() { return { x: 0, y: 0, vx: 0, vy: 0, st: B_HELD, by: -1, t: 0, bank: 0, lb: -1, pv: -1 }; }

export function createDodge(seed = 1, L = COURT) {
  const S = createState(L);
  const D = {
    phase: DP_READY, t: 0, score: [0, 0], rng: seed | 0, winner: -1,
    holder: -1, ball: freshBall(), aim: [-1, -1],
    clockOwner: -1, clockKind: CLOCK_SHOT, clock: DODGE.shotClock,
    lastHolder: -1, saved: 0,   // who held the ball last, and their shot clock when it left their side
    serve: -1, lastHit: null,
    throwN: 0, hitN: 0, pickN: 0, turnN: 0, point: 0,
    lag: [0, 0],     // wind-up (ticks) for throws at each player; online the server sets it between points
    wind: 0, windN: 0, windSlope: 0,   // a throw winding up: ticks left, its full length, its aim
    wait: -1,        // prediction only: a hit on this player waits for the server (online, the other player)
  };
  S.d = D;
  D.serve = rand(D) < 0.5 ? SOL : LUNA;
  givePoint(L, S, D.serve);
  return S;
}

// Start a point: players at their spawns, `who` holding the ball, a short freeze on throws.
function givePoint(L, S, who) {
  const D = S.d;
  const fresh = createState(L);
  fresh.p.forEach((p, i) => { p.jumpN = S.p[i].jumpN; });   // keeps jump sounds counting forward
  S.p = fresh.p;
  D.phase = DP_READY; D.t = 0;
  D.aim = [-1, -1];
  D.wind = 0;
  D.serve = who;
  hold(S, who);
  D.clockOwner = who; D.clockKind = CLOCK_SHOT; D.clock = DODGE.shotClock;   // served in hand
}

function hold(S, who) {
  const D = S.d, b = D.ball;
  D.holder = who; D.lastHolder = who;
  b.st = B_HELD; b.by = who; b.vx = 0; b.vy = 0; b.t = 0; b.pv = -1;
  const h = handPos(S.p[who], who);
  b.x = h.x; b.y = h.y;
}

export function ownerOf(D) {
  if (D.holder >= 0) return D.holder;
  if (D.ball.st === B_LIVE) return -1;
  return sideOf(D.ball.x);
}

// ---------------------------------------------------------------------------
// step

export function stepDodge(L, S, inputs) {
  S.tick++;
  const D = S.d;
  D.t++;
  const play = D.phase === DP_PLAY || D.phase === DP_READY;
  const inp = play ? inputs.slice() : [0, 0];
  // during a wind-up the thrower is planted: their keys do nothing, so where the ball leaves
  // from follows from the state at the release, which the other screen already knows
  if (D.wind > 0) inp[D.holder] = 0;
  stepPlayersOnly(L, S, inp);
  keepToHalves(S);

  if (D.phase === DP_READY && D.t >= DODGE.ready) { D.phase = DP_PLAY; D.t = 0; }

  // the wind-up ends: the ball leaves the hand with the aim it was released with
  if (D.wind > 0 && --D.wind === 0) throwBall(L, S, D.holder, D.windSlope);

  // aiming and throwing
  for (const who of [SOL, LUNA]) {
    const down = (inp[who] & IN_ACT) !== 0;
    if (D.holder !== who || D.phase !== DP_PLAY) { if (D.holder !== who) D.aim[who] = -1; continue; }
    if (D.wind > 0) continue;
    if (down) D.aim[who] = D.aim[who] < 0 ? 0 : D.aim[who] + 1;
    else if (D.aim[who] >= 0) {
      const slope = aimSlope(D.aim[who]), w = D.lag ? D.lag[1 - who] | 0 : 0;
      D.aim[who] = -1;
      if (w > 0) { D.wind = w; D.windN = w; D.windSlope = slope; } else throwBall(L, S, who, slope);
    }
  }

  stepBall(L, S);
  if (D.phase === DP_PLAY) { pickUp(S); shotClock(S); }

  if (D.phase === DP_POINT && D.t >= DODGE.pointTicks) {
    if (D.winner >= 0) { D.phase = DP_OVER; D.t = 0; }
    else givePoint(L, S, 1 - D.lastHit.by);
  }
  return S;
}

function keepToHalves(S) {
  const a = S.p[SOL], b = S.p[LUNA];
  if (a.x + a.w > NET - 1) { a.x = NET - 1 - a.w; if (a.vx > 0) a.vx = 0; }
  if (b.x < NET + 1) { b.x = NET + 1; if (b.vx < 0) b.vx = 0; }
}

function throwBall(L, S, who, slope) {
  const D = S.d, b = D.ball, p = S.p[who];
  const k = L.speed / Math.sqrt(1 + slope * slope);
  const h = handPos(p, who);
  b.x = h.x; b.y = h.y;
  b.vx = towardNet(who) * k; b.vy = -slope * k;
  b.st = B_LIVE; b.by = who; b.t = 0; b.bank = 0; b.lb = -1; b.pv = -1;
  D.holder = -1;
  D.throwN++;
}

function stepBall(L, S) {
  const D = S.d, b = D.ball, r = DODGE.r;
  if (b.st === B_HELD) {
    const h = handPos(S.p[D.holder], D.holder);
    b.x = h.x; b.y = h.y;
    return;
  }
  if (b.st === B_REST) return;
  if (b.pv >= 0) return;   // stopped in the other player until the server says hit or dodge
  b.t++;
  if (b.st === B_LIVE && b.t > DODGE.liveMax) die(b);
  const forced = b.st === B_DEAD && b.t > DODGE.restMax;
  if (forced) b.vx = 0;
  b.vy += b.st === B_LIVE ? DODGE.liveGrav : DODGE.deadGrav;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 5));
  for (let i = 0; i < n; i++) {
    // x
    const dx = b.vx / n;
    if (dx) {
      b.x += dx;
      if (boxHits(L, b.x, b.y, r)) {
        b.x = dx > 0 ? Math.floor((b.x + r) / TS) * TS - r - 0.01 : (Math.floor((b.x - r) / TS) + 1) * TS + r + 0.01;
        b.vx = -b.vx * DODGE.wallBounce;
        bank(b);
      }
    }
    // y
    const dy = b.vy / n;
    if (dy) {
      b.y += dy;
      if (boxHits(L, b.x, b.y, r)) {
        if (dy > 0) {
          b.y = Math.floor((b.y + r) / TS) * TS - r - 0.01;
          if (b.st === B_LIVE) die(b);
          b.vy = forced || b.vy < 1.2 ? 0 : -b.vy * DODGE.floorBounce;
          b.vx *= DODGE.bounceFric;
        } else {
          b.y = (Math.floor((b.y - r) / TS) + 1) * TS + r + 0.01;
          b.vy = -b.vy * DODGE.ceilBounce;
          bank(b);
        }
        break;   // the rest of this tick's motion was spent in the bounce
      }
    }
    if (L.defl.length) deflect(L, b);
    if (b.st === B_LIVE && D.phase === DP_PLAY) {
      const vi = 1 - b.by, v = S.p[vi];
      if (circleHitsBox(b.x, b.y, r - 1, v.x, v.y, v.w, v.h)) {
        // Online, the thrower sees the other player about a round trip late, so a jump may
        // already have saved them. The thrower's screen waits for the server instead of
        // showing a hit it might take back.
        if (D.wait === vi) { b.pv = vi; return; }
        scoreHit(S, vi); return;
      }
    }
  }
  if (b.st === B_DEAD) {
    const grounded = b.vy === 0 && boxHits(L, b.x, b.y + 1, r);
    if (grounded) {
      b.vx *= DODGE.roll;
      if (Math.abs(b.vx) < 0.25 || forced) { b.vx = 0; b.st = B_REST; }
    }
  }
}

// The mirror brackets on the back walls. Inside the bracket (grown by the ball's radius) the
// ball is pushed out through the nearer face and its velocity reflected off that face's fixed
// normal: v' = v - e (v.n) n, with e = 2 for a live ball (a mirror) and 1 + wallBounce for a dead
// one (like a wall). Plain arithmetic, so every engine agrees. A bounce counts as a bank.
function deflect(L, b) {
  const r = DODGE.r;
  for (const q of L.defl) {
    if (q.s > 0 ? b.x - r > q.ax : b.x + r < q.ax) continue;
    if (b.y + r < q.yC || b.y - r > q.yB) continue;
    const [f1, f2] = q.faces;
    const d1 = (b.x - f1.x) * f1.nx + (b.y - f1.y) * f1.ny, d2 = (b.x - f2.x) * f2.nx + (b.y - f2.y) * f2.ny;
    if (d1 >= r || d2 >= r) continue;
    const f = d1 >= d2 ? f1 : f2, d = d1 >= d2 ? d1 : d2;
    b.x += (r + 0.01 - d) * f.nx; b.y += (r + 0.01 - d) * f.ny;
    const vn = b.vx * f.nx + b.vy * f.ny;
    if (vn < 0) {
      const e = b.st === B_LIVE ? 2 : 1 + DODGE.wallBounce;
      b.vx -= e * vn * f.nx; b.vy -= e * vn * f.ny;
      bank(b);
    }
  }
}

function die(b) { b.st = B_DEAD; b.t = 0; b.pv = -1; }
function bank(b) {
  if (b.st !== B_LIVE || b.lb === b.t) return;
  b.lb = b.t;
  if (++b.bank > 1) die(b);
}

function scoreHit(S, victim) {
  const D = S.d, b = D.ball, by = b.by, v = S.p[victim];
  D.score[by]++;
  D.hitN++;
  D.point++;
  D.lastHit = { by, x: b.x, y: b.y };
  if (D.score[by] >= DODGE.toWin) D.winner = by;
  D.phase = DP_POINT; D.t = 0;
  // the victim is knocked back and the ball rebounds off them
  const dir = b.vx > 0 ? 1 : -1;
  v.vx = dir * 3; v.vy = -4.5; v.gr = false;
  b.vx = -b.vx * 0.25; b.vy = -4; die(b);
}

function pickUp(S) {
  const D = S.d, b = D.ball;
  if (b.st !== B_DEAD && b.st !== B_REST) return;
  const who = sideOf(b.x), p = S.p[who];
  if (circleHitsBox(b.x, b.y, DODGE.r + 3, p.x, p.y, p.w, p.h)) { hold(S, who); D.pickN++; }
}

// The pickup and shot clocks (rules at the top of this file).
function shotClock(S) {
  const D = S.d;
  const own = ownerOf(D);
  // the last holder's shot clock keeps running while the ball is on the other side untouched
  if (own >= 0 && own !== D.lastHolder && D.lastHolder === 1 - own && D.saved > 0) D.saved--;
  // a throw winding up or in the air: the thrower's shot clock keeps running (a throw to your
  // own side buys no time) but can't run out until the ball is down
  if (D.wind > 0 || own < 0) {
    if (D.clockKind === CLOCK_SHOT && D.ball.by === D.clockOwner && D.clock > 0) D.clock--;
    return;
  }
  if (own !== D.clockOwner) {   // the ball changed sides
    if (D.clockOwner === D.lastHolder && D.clockKind === CLOCK_SHOT) D.saved = D.clock;
    D.clockOwner = own;
    if (D.lastHolder === own) { D.clockKind = CLOCK_SHOT; D.clock = D.saved; return; }   // back untouched: your clock goes on
    // a new possession: in hand, the shot clock; loose, the pickup clock
    D.clockKind = D.holder === own ? CLOCK_SHOT : CLOCK_PICK;
    D.clock = D.clockKind === CLOCK_SHOT ? DODGE.shotClock : DODGE.pickClock;
    return;
  }
  if (D.clockKind === CLOCK_PICK && D.holder === own) { D.clockKind = CLOCK_SHOT; D.clock = DODGE.shotClock; return; }
  if (D.clock > 0 && --D.clock > 0) return;
  // too slow: the ball jumps the veil to the other player
  const other = 1 - own;
  hold(S, other);
  D.aim[own] = -1;
  D.turnN++;
  D.clockOwner = other; D.clockKind = CLOCK_SHOT; D.clock = DODGE.shotClock;
}
