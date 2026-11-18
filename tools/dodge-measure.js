// Dodgeball measurements with the real sim, for any court built by buildCourt(spec).
// Used by tools/check-dodge.js (the "no safe spot" and dodging checks) and for tuning.
//
// Sol always throws, Luna defends. The court is mirrored, so the other way round is the same.
// Reaction rho: the defender's input changes rho ticks after the release tick (rho = 0: on the
// very tick the thrower lets go).
import { DODGE, NET, createDodge, stepDodge, aimSlope, CLOCK_SHOT, DP_PLAY, B_HELD, B_LIVE } from '../shared/dodge.js';
import { SOL, LUNA, TS, PHYS, IN_ACT, T_SOLID, COLS } from '../shared/sim.js';

export const ACT = IN_ACT, JUMP = 4, LEFT = 1, RIGHT = 2;
export const MAXHOLD = DODGE.aimDwell + DODGE.aimPeriod;
const H = PHYS.h, W = PHYS.w;
const ESCAPES = [JUMP, JUMP | LEFT, JUMP | RIGHT, LEFT, RIGHT];

// standing surfaces on one half: [{ y (player top), lo, hi (player x range) }]
export function surfaces(L, who) {
  const out = [];
  for (let ty = 1; ty < 30; ty++) {
    let run = null;
    for (let tx = 1; tx < COLS - 1; tx++) {
      const top = L.tiles[ty * COLS + tx] === T_SOLID && L.tiles[(ty - 1) * COLS + tx] === 0;
      const mine = (tx * TS + TS / 2 < NET) === (who === SOL);
      if (top && mine) { if (!run) run = [ty * TS, tx * TS, tx * TS]; run[2] = tx * TS + TS; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out.map(([y, a, b]) => {
    let lo = a, hi = b - W;
    if (who === SOL) hi = Math.min(hi, NET - 1 - W); else lo = Math.max(lo, NET + 1);
    return { y: y - H, lo, hi };
  }).filter(s => s.hi >= s.lo);
}
const floorOf = (L, who) => surfaces(L, who).find(s => s.y === 28 * TS - H);

// Places a player: {x, y} standing, or a full body state {x, y, vx, vy, gr}.
function put(p, q) {
  Object.assign(p, { x: q.x, y: q.y, vx: q.vx || 0, vy: q.vy || 0, gr: q.gr ?? true, gref: -1, coy: q.gr === false ? 0 : PHYS.coyote });
}

// One throw. Sol stands at tp and holds the button `hold` ticks; Luna is held in state vp
// (re-placed every tick) until the release. Then `victim(t)` gives Luna's input t ticks after
// the release tick (t = 0 is the release tick). `pin`: Luna is put back at vp every tick (a
// stationary body even in mid-air). Returns { hit, t, banks: [...], S }.
export function shot(L, tp, vp, hold, victim = () => 0, { pin = false, maxT = 120 } = {}) {
  const S = createDodge(1, L), D = S.d;
  put(S.p[SOL], tp); put(S.p[LUNA], vp);
  D.phase = DP_PLAY; D.t = 0;
  D.holder = SOL; Object.assign(D.ball, { st: B_HELD, by: SOL, vx: 0, vy: 0, t: 0 });
  D.clockOwner = SOL; D.clockKind = CLOCK_SHOT; D.clock = DODGE.shotClock; D.lastHolder = SOL;
  for (let k = 0; k <= hold; k++) { stepDodge(L, S, [ACT, 0]); put(S.p[LUNA], vp); put(S.p[SOL], tp); }
  const banks = [];
  for (let t = 0; t <= maxT; t++) {
    const b0 = D.ball.bank;
    stepDodge(L, S, [0, victim(t)]);
    if (pin) put(S.p[LUNA], vp);
    if (D.ball.bank > b0) banks.push(bankKind(L, D.ball));
    if (D.hitN) return { hit: true, t, banks, S };
    if (D.holder === SOL) return { hit: false, t, banks, S };   // never released (re-caught)
    if (D.ball.st !== B_LIVE && D.ball.st !== B_HELD) return { hit: false, t, banks, S };
  }
  return { hit: false, t: maxT, banks, S };
}
function bankKind(L, b) {
  for (const q of L.defl) {
    if (b.y < q.yC - DODGE.r - 2 || b.y > q.yB + DODGE.r + 2) continue;
    if (q.s > 0 ? b.x - DODGE.r > q.ax + 2 : b.x + DODGE.r < q.ax - 2) continue;
    for (const f of q.faces) if (Math.abs((b.x - f.x) * f.nx + (b.y - f.y) * f.ny - DODGE.r) < 2) return f.mirror ? 'mirror' : 'bracket top';
  }
  if (b.y < TS + DODGE.r + 2) return 'ceiling';
  return 'wall';
}
export const kindOf = (r) => (r.banks.length ? r.banks[0] : 'direct');

// The latest reaction that escapes this throw (it must hit a defender who stays put): the
// largest rho for which one of the escapes (jump, jump left/right, run left/right) started at
// rho makes it miss. -1 if none does. Also whether rho = 0 and rho = 1 escape.
export function latestEscape(L, tp, vp, hold, flight) {
  const esc = (rho) => ESCAPES.some(m => !shot(L, tp, vp, hold, (t) => (t >= rho ? m : 0)).hit);
  let latest = -1;
  for (let rho = flight + 1; rho >= 0; rho--) if (esc(rho)) { latest = rho; break; }
  return { latest, at0: latest >= 0 && esc(0), at1: latest >= 1 && esc(1) };
}

// Defender spots on Luna's half: floor across its width (every 2 tiles), each platform's ends
// and middle, the floor under each platform, both corners.
export function defenderSpots(L) {
  const F = floorOf(L, LUNA), out = [];
  out.push({ name: 'net corner', x: F.lo, y: F.y });
  for (let x = F.lo + 48; x < F.hi - 24; x += 48) out.push({ name: `floor ${Math.round(x - NET)} px from net`, x, y: F.y });
  out.push({ name: 'back corner', x: F.hi, y: F.y });
  for (const sf of surfaces(L, LUNA)) {
    if (sf === F || sf.y === F.y) continue;
    out.push({ name: 'platform, net end', x: sf.lo, y: sf.y }, { name: 'platform, middle', x: Math.round((sf.lo + sf.hi) / 2), y: sf.y }, { name: 'platform, back end', x: sf.hi, y: sf.y });
    out.push({ name: 'under the platform', x: Math.round((sf.lo + sf.hi) / 2), y: F.y });
  }
  return out;
}
// Throwing spots on Sol's half: the floor every tile, every platform every tile.
export function throwerSpots(L, step = 24) {
  const out = [];
  for (const sf of surfaces(L, SOL)) for (let x = sf.hi; x >= sf.lo; x -= step) out.push({ x, y: sf.y, plat: sf.y !== 28 * TS - H });
  return out;
}

// Every hitting throw at a stationary defender at vp: [{ tp, hold, t, kind }].
export function hitsOn(L, vp, T, { pin = false, holds = MAXHOLD } = {}) {
  const out = [];
  for (const tp of T) for (let h = 0; h < holds; h++) {
    const r = shot(L, tp, vp, h, () => 0, { pin });
    if (r.hit) out.push({ tp, hold: h, t: r.t, kind: kindOf(r) });
  }
  return out;
}

// For each defender spot: which kinds of throw hit it, and against the best direct throws
// (thrower anywhere on their half), the latest reaction that escapes. Per throwing spot the
// best aim (smallest latest); then over spots. `zone`: the largest gap at which even rho 0/1
// fails against the best aim from that spot.
export function spotTable(L, { T = throwerSpots(L), V = defenderSpots(L) } = {}) {
  const rows = [];
  for (const vp of V) {
    const hits = hitsOn(L, vp, T);
    const kinds = [...new Set(hits.map(h => h.kind))];
    // best direct throw per throwing spot (fewest ticks of flight is the hardest to escape;
    // check the three fastest aims from each spot)
    const per = new Map();
    for (const h of hits) if (h.kind === 'direct') { const k = `${h.tp.x},${h.tp.y}`; (per.get(k) || per.set(k, []).get(k)).push(h); }
    let best = null, zone = 0; const pairs = [];
    for (const list of per.values()) {
      list.sort((a, b) => a.t - b.t);
      let pb = null;
      for (const h of list.slice(0, 3)) {
        const e = latestEscape(L, h.tp, vp, h.hold, h.t);
        if (!pb || e.latest < pb.latest) pb = { ...e, ...h };
      }
      const gap = Math.abs(vp.x - pb.tp.x);
      pairs.push({ gap, ...pb });
      if (!best || pb.latest < best.latest) best = { gap, ...pb };
      if (pb.latest < 1) zone = Math.max(zone, gap);
    }
    rows.push({ ...vp, kinds, nHits: hits.length, best, zone, pairs });
  }
  return rows;
}

// Motion beats aim: the defender is moving at the release. `aimed`: the throws that would hit a
// body standing still where the defender was at the release; `lead`: throws that hit the moving
// defender. Returns how many of the aimed throws miss, and whether some throw leads them.
export function motionCase(L, T, vp, move) {
  const aimed = hitsOn(L, vp, T, { pin: true }).filter(h => h.kind === 'direct');
  let missed = 0;
  for (const h of aimed) if (!shot(L, h.tp, vp, h.hold, () => move).hit) missed++;
  let lead = null;
  for (const tp of T) { for (let h = 0; h < MAXHOLD && !lead; h++) { const r = shot(L, tp, vp, h, () => move); if (r.hit && !r.banks.length) lead = { tp, hold: h }; } if (lead) break; }
  return { aimed: aimed.length, missed, lead };
}

// A body state partway through a move, from rest at `from` with input `bits` held for `ticks`.
export function bodyAfter(L, from, bits, ticks) {
  const S = createDodge(1, L);
  put(S.p[LUNA], from);
  S.p[SOL].x = 9999; S.d.phase = DP_PLAY; S.d.holder = -1; S.d.ball.st = 3; S.d.ball.x = -999;
  for (let i = 0; i < ticks; i++) stepDodge(L, S, [0, bits]);
  const p = S.p[LUNA];
  return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, gr: p.gr };
}

// A floor spot on Luna's half at least `from` px from the net with open air above it (no
// platform within a full jump of a player standing there, 30 px to either side).
export function openFloorX(L, from = 240) {
  const F = floorOf(L, LUNA);
  const covered = (x) => surfaces(L, LUNA).some(sf => sf.y !== F.y && sf.y > F.y - 140 && x + W + 30 > sf.lo && x - 30 < sf.hi + W);
  for (let x = NET + from; x <= F.hi - 40; x += 6) if (!covered(x)) return x;
  return F.hi - 40;
}

export { floorOf, aimSlope };
