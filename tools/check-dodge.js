// Headless checks for Dodgeball (shared/dodge.js) with the real sim.
//   node tools/check-dodge.js          all checks, prints measurements, exits 1 on a failure
//   N=2000 node tools/check-dodge.js   more random throws in the settle test
//
// What it proves:
//   1. Speed: ticks from release to contact at measured distances (cross-court, net to back).
//   2. A stationary target (zero reaction) is hit: a tap throw hits on the floor at every
//      floor spacing, and some aim hits nearly every spot in the court.
//   3. Dodge window: a target that jumps r ticks after the release. For each distance, the
//      latest reaction that still dodges, and the dodge rate at 0.2 s and 0.25 s.
//      Also that the thrower can punish a jump if they read it.
//   4. Every thrown ball comes to rest within a bounded time, on one side, on a surface the
//      owner can reach (checked with the level checker's search).
//   5. Possession: miss -> the side it stops on; pickup; the pickup clock (10 s, from when the
//      ball comes loose on your side) and the shot clock (20 s, from the moment you hold it;
//      a serve starts it in hand) each hand the ball over; an own-side throw resets neither
//      clock; a player who loops throws to their own side, or leaves their own fumble lying,
//      still loses the ball within one shot clock; hit -> score, victim serves; first to 5 wins.
//   6. Determinism: same seed and inputs give identical states; seeded first serve is ~50/50.
//   7. Online wind-up (fix C): its size from round trip and queue; a throw at a player with
//      wind-up k leaves the hand exactly k ticks after the release, from where the planted
//      thrower stands, with the aim it was released with, and then flies exactly like the local
//      throw; the shot clock can't run out mid wind-up; the dodge window from the launch equals local; a hit on the
//      player the screen waits for stops the ball without scoring; determinism mid wind-up.
import { COURT, DODGE, NET, createDodge, stepDodge, aimSlope, sideOf, ownerOf, windupFor, handPos,
  CLOCK_PICK, CLOCK_SHOT, DP_READY, DP_PLAY, DP_POINT, DP_OVER, B_HELD, B_LIVE, B_DEAD, B_REST } from '../shared/dodge.js';
import { cloneState, SOL, LUNA, TS, PHYS, TICK_RATE, IN_ACT, T_SOLID, COLS } from '../shared/sim.js';
import { explore } from './check-levels.js';

const N = +(process.env.N || 600);
const ACT = IN_ACT, JUMP = 4, LEFT = 1, RIGHT = 2;
let failed = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };
const sec = (t) => (t / TICK_RATE).toFixed(3) + ' s';

// deterministic test RNG
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// standing surfaces: floor and platform tops, per half, as [y, xMin, xMax] for a player's x
const H = PHYS.h, W = PHYS.w;
function surfaces(who) {
  const out = [];
  for (let ty = 1; ty < 30; ty++) {
    let run = null;
    for (let tx = 1; tx < COLS - 1; tx++) {
      const top = COURT.tiles[ty * COLS + tx] === T_SOLID && COURT.tiles[(ty - 1) * COLS + tx] === 0;
      const mine = sideOf(tx * TS + TS / 2) === who;
      if (top && mine) { if (!run) run = [ty * TS, tx * TS, tx * TS]; run[2] = tx * TS + TS; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  // player x range on each surface (fully on it, inside the half)
  return out.map(([y, a, b]) => {
    let lo = a, hi = b - W;
    if (who === SOL) hi = Math.min(hi, NET - 1 - W); else lo = Math.max(lo, NET + 1);
    return { y: y - H, lo, hi };
  }).filter(s => s.hi >= s.lo);
}
const SURF = [surfaces(SOL), surfaces(LUNA)];
const FLOOR = SURF.map(list => list.find(s => s.y === 28 * TS - H));

function place(p, x, y) { Object.assign(p, { x, y, vx: 0, vy: 0, gr: true, gref: -1, coy: PHYS.coyote }); }

// A point in progress: thrower holds the ball, both players placed.
function setup(thrower, tp, vp) {
  const S = createDodge(1);
  const D = S.d;
  place(S.p[thrower], tp.x, tp.y);
  place(S.p[1 - thrower], vp.x, vp.y);
  D.phase = DP_PLAY; D.t = 0;
  D.holder = thrower; Object.assign(D.ball, { st: B_HELD, by: thrower, vx: 0, vy: 0, t: 0 });
  D.clockOwner = thrower; D.clockKind = CLOCK_SHOT; D.clock = DODGE.shotClock;
  stepDodge(COURT, S, [0, 0]);   // snap the ball to the hand
  return S;
}

// Throw after holding the button for `hold` ticks (0 = a one-tick tap). `victim(t)` gives the
// target's input t ticks after the release. Returns { hit, t } where t is ticks after release.
function shot(thrower, tp, vp, hold, victim = () => 0, maxT = 120) {
  const S = setup(thrower, tp, vp);
  const inp = [0, 0];
  for (let k = 0; k <= hold; k++) { inp[thrower] = ACT; inp[1 - thrower] = 0; stepDodge(COURT, S, inp); }
  inp[thrower] = 0;
  const score0 = S.d.score[thrower];
  for (let t = 1; t <= maxT; t++) {
    inp[1 - thrower] = victim(t);
    stepDodge(COURT, S, inp);
    if (S.d.score[thrower] > score0) return { hit: true, t, S };
    if (S.d.ball.st !== B_LIVE) return { hit: false, t, S };
  }
  return { hit: false, t: maxT, S };
}
const MAXHOLD = DODGE.aimDwell + DODGE.aimPeriod;
const hittingHolds = (th, tp, vp, victim) => {
  const hs = [];
  for (let h = 0; h < MAXHOLD; h++) if (shot(th, tp, vp, h, victim).hit) hs.push(h);
  return hs;
};
const jumpAt = (r) => (t) => (t >= r ? JUMP : 0);

// ---------------------------------------------------------------------------
console.log(`Dodgeball checks  (ball ${DODGE.speed} px/tick = ${DODGE.speed * TICK_RATE} px/s, radius ${DODGE.r}, court ${NET * 2} px)\n`);

// 1. speed
console.log('1. Ball speed (Sol taps a flat throw at Luna standing on the floor)');
const solNet = NET - 1 - W, lunaBack = FLOOR[LUNA].hi;
const centres = [[NET / 2 - W / 2, NET * 1.5 - W / 2, 'half-centre to half-centre'],
  [solNet, lunaBack, 'net to the far back wall'],
  [COURT.spawns[SOL].x, COURT.spawns[LUNA].x, 'spawn to spawn'],
  [FLOOR[SOL].lo, lunaBack, 'back wall to back wall']];
const speedRows = [];
for (const [sx, lx, label] of centres) {
  const r = shot(SOL, { x: sx, y: FLOOR[SOL].y }, { x: lx, y: FLOOR[LUNA].y }, 0);
  const dist = lx - sx;
  speedRows.push([label, dist, r.t]);
  console.log(`   ${label.padEnd(28)} ${String(dist).padStart(4)} px between players: ${r.hit ? 'hit' : 'MISS'} after ${r.t} ticks = ${sec(r.t)}`);
  ok(r.hit, `tap throw hits a stationary target, ${label}`);
}

// 2. stationary target
console.log('\n2. Stationary target (zero reaction)');
{
  let pairs = 0, tapHits = 0;
  for (let sx = FLOOR[SOL].lo; sx <= FLOOR[SOL].hi; sx += 24) for (let lx = FLOOR[LUNA].lo; lx <= FLOOR[LUNA].hi; lx += 24) {
    pairs++;
    if (shot(SOL, { x: sx, y: FLOOR[SOL].y }, { x: lx, y: FLOOR[LUNA].y }, 0).hit) tapHits++;
  }
  ok(tapHits === pairs, `floor to floor, a tap throw hits every spacing (${tapHits}/${pairs})`);
  // camping: is any spot safe from every throwing spot? (5 spots per surface, every aim)
  const spots = (list) => list.flatMap(sf => [0, 0.25, 0.5, 0.75, 1].map(f => ({ x: Math.round(sf.lo + (sf.hi - sf.lo) * f), y: sf.y })));
  const T = spots(SURF[SOL]), V = spots(SURF[LUNA]);
  let pairs2 = 0, pairHit = 0; const safe = [];
  for (const vp of V) {
    let any = false;
    for (const tp of T) {
      pairs2++;
      if (hittingHolds(SOL, tp, vp).length) { pairHit++; any = true; }
    }
    if (!any) safe.push(`${vp.x},${vp.y}`);
  }
  console.log(`   thrower spot x target spot: some aim hits in ${pairHit}/${pairs2} pairs (${(100 * pairHit / pairs2).toFixed(0)}%); the rest is platform cover`);
  ok(!safe.length, `no target spot is safe from every throwing spot (${V.length - safe.length}/${V.length} reachable${safe.length ? '; safe: ' + safe.join(' ') : ''})`);
}

// 3. dodge window
console.log('\n3. Dodge window (target jumps r ticks after the release; tap throw, floor to floor)');
const REACT = [0, 3, 6, 9, 12, 15, 18];
{
  console.log('   gap px  flight  ' + REACT.map(r => `r=${r}`.padStart(5)).join(' ') + '   latest dodge');
  const rows = [];
  for (const sx of [solNet, solNet - 120, solNet - 240, FLOOR[SOL].lo]) for (const lx of [lunaBack, lunaBack - 120, lunaBack - 240, NET + 1]) {
    const tp = { x: sx, y: FLOOR[SOL].y }, vp = { x: lx, y: FLOOR[LUNA].y };
    const base = shot(SOL, tp, vp, 0);
    if (!base.hit) continue;
    const res = REACT.map(r => !shot(SOL, tp, vp, 0, jumpAt(r)).hit);
    let latest = -1; for (let r = 0; r < base.t + 2; r++) if (!shot(SOL, tp, vp, 0, jumpAt(r)).hit) latest = r;
    rows.push({ gap: lx - sx, flight: base.t, latest });
  }
  rows.sort((a, b) => a.gap - b.gap);
  for (const r of rows) {
    console.log(`   ${String(r.gap).padStart(6)}  ${String(r.flight).padStart(3)} t   ` +
      REACT.map(k => (k <= r.latest ? 'dodge' : '  hit')).join(' ') + `   ${r.latest < 0 ? 'none' : `r<=${r.latest} (${sec(r.latest)})`}`);
  }
  const far = rows.find(r => r.gap === lunaBack - solNet);
  ok(far.latest >= 12 && far.latest < 18, `thrower at the net, target at the back wall: a 0.2 s jump dodges, a 0.3 s jump is too late (latest r=${far.latest})`);
  const mid = rows.filter(r => r.gap <= 340);
  ok(mid.every(r => r.latest < 12), 'from 340 px or closer even a 0.2 s jump is too late: you have to read the throw');
}
{
  // dodge rate over realistic throws: thrower anywhere on the floor, target anywhere, every aim
  // that hits the target standing still. A dodge = the jump made at reaction r makes it miss.
  let shots = 0; const dodged = { 12: 0, 15: 0 }; let punish = 0, punishable = 0;
  for (let i = 0; i < 160; i++) {
    const sx = FLOOR[SOL].lo + rnd() * (FLOOR[SOL].hi - FLOOR[SOL].lo);
    const lx = FLOOR[LUNA].lo + rnd() * (FLOOR[LUNA].hi - FLOOR[LUNA].lo);
    const tp = { x: sx, y: FLOOR[SOL].y }, vp = { x: lx, y: FLOOR[LUNA].y };
    const hs = hittingHolds(SOL, tp, vp);
    if (!hs.length) continue;
    const h = hs[Math.floor(rnd() * hs.length)];
    shots++;
    for (const r of [12, 15]) if (!shot(SOL, tp, vp, h, jumpAt(r)).hit) dodged[r]++;
    // a jump at 0.2 s that dodged: could the thrower have hit it with another aim?
    if (!shot(SOL, tp, vp, h, jumpAt(12)).hit) { punishable++; if (hittingHolds(SOL, tp, vp, jumpAt(12)).length) punish++; }
  }
  const p12 = dodged[12] / shots, p15 = dodged[15] / shots;
  console.log(`\n   ${shots} random floor-to-floor throws that hit a still target:`);
  console.log(`   jump at 0.20 s dodges ${(100 * p12).toFixed(0)}%, jump at 0.25 s dodges ${(100 * p15).toFixed(0)}%`);
  console.log(`   of the 0.20 s dodges, the thrower had another aim that hits the jumper in ${punish}/${punishable}`);
  ok(p12 > 0.1 && p12 < 0.9, 'a 0.2 s reaction dodges sometimes, not always');
  ok(p15 < p12 && p15 < 0.75, 'a 0.25 s reaction dodges less often');
  ok(punish >= punishable * 0.6, 'jumping is not a free answer: a thrower who reads it can hit the jumper');
}

// 4. every ball settles
console.log(`\n4. Settling (${N} random throws from random spots with random aim; players moved out of reach)`);
{
  let maxT = 0, sumT = 0, bad = 0; const restSpots = [[], []]; let sideCount = [0, 0];
  for (let i = 0; i < N; i++) {
    const th = rnd() < 0.5 ? SOL : LUNA;
    const ts = SURF[th][Math.floor(rnd() * SURF[th].length)], vs = SURF[1 - th][Math.floor(rnd() * SURF[1 - th].length)];
    const tp = { x: ts.lo + rnd() * (ts.hi - ts.lo), y: ts.y }, vp = { x: vs.lo + rnd() * (vs.hi - vs.lo), y: vs.y };
    const S = setup(th, tp, vp);
    const hold = Math.floor(rnd() * MAXHOLD);
    const inp = [0, 0];
    // the thrower may run and jump while aiming
    const mv = [0, LEFT, RIGHT, JUMP, JUMP | LEFT, JUMP | RIGHT][Math.floor(rnd() * 6)];
    for (let k = 0; k <= hold; k++) { inp[th] = ACT | mv; stepDodge(COURT, S, inp); }
    inp[th] = 0; stepDodge(COURT, S, inp);
    if (S.d.ball.st === B_HELD) continue;   // released in a spot where it was re-caught (rare)
    // nobody may touch it: put both players out of the court each tick
    let t = 0;
    for (; t < 1200; t++) {
      S.p[SOL].x = -900; S.p[SOL].y = -900; S.p[LUNA].x = 2900; S.p[LUNA].y = -900;
      stepDodge(COURT, S, [0, 0]);
      if (S.d.ball.st === B_REST) break;
    }
    const b = S.d.ball;
    if (b.st !== B_REST) { bad++; continue; }
    maxT = Math.max(maxT, t); sumT += t;
    const side = sideOf(b.x);
    sideCount[side]++;
    if (b.x === NET || b.x - DODGE.r < TS || b.x + DODGE.r > NET * 2 - TS || b.y + DODGE.r > 28 * TS) bad++;
    if (ownerOf(S.d) !== side) bad++;
    restSpots[side].push([b.x, b.y]);
  }
  console.log(`   settled: max ${maxT} ticks (${sec(maxT)}), mean ${(sumT / N).toFixed(0)} ticks; stopped on Sol's side ${sideCount[0]}, Luna's ${sideCount[1]}`);
  ok(bad === 0, `every throw comes to rest inside the court, off the net line, owned by its side (${bad} bad)`);
    const bound = DODGE.liveMax + DODGE.restMax + 62;   // + a straight drop from the ceiling after the forced stop
  ok(maxT <= bound, `rest time is bounded (max ${maxT} <= ${bound} = ${sec(bound)})`);
  // reachability: every distinct rest spot is a gem the owner must be able to collect
  for (const who of [SOL, LUNA]) {
    const spots = [...new Map(restSpots[who].map(([x, y]) => [`${Math.round(x / 12)},${Math.round(y / 12)}`, [x, y]])).values()];
    const tiles = COURT.tiles.slice();
    const wallCol = who === SOL ? 20 : 19;   // the veil as a wall, so the search stays on its side
    for (let y = 0; y < 30; y++) tiles[y * COLS + wallCol] = T_SOLID;
    // plus the middle of every surface, so the check covers platforms no random ball landed on
    const mids = SURF[who].map(sf => [sf.lo + (sf.hi - sf.lo) / 2 + W / 2, sf.y + H - DODGE.r]);
    const L = { ...COURT, tiles, doors: [{ cx: -999, bottom: -999 }, { cx: -999, bottom: -999 }],
      gems: spots.concat(mids).map(([x, y]) => ({ x, y, kind: who })) };
    const r = explore(L, who, { help: 'none', limit: 200000 });
    const got = [...r.gems], restGot = got.filter(i => i < spots.length).length, midGot = got.length - restGot;
    ok(restGot === spots.length, `${who ? 'Luna' : 'Sol'} can reach every spot a ball stopped on their side (${restGot}/${spots.length}, ${r.states} states)`);
    ok(midGot === mids.length, `${who ? 'Luna' : 'Sol'} can stand on every surface of their half (${midGot}/${mids.length})`);
  }
}

// 5. possession and scoring
console.log('\n5. Possession and scoring');
{
  // miss: Luna jumps over a flat throw; the ball ends on Luna's side and she picks it up
  const tp = { x: solNet, y: FLOOR[SOL].y }, vp = { x: lunaBack, y: FLOOR[LUNA].y };
  const r = shot(SOL, tp, vp, 0, jumpAt(3));
  ok(!r.hit && r.S.d.score[0] === 0, 'a dodged throw scores nothing');
  const S = r.S;
  let t = 0, since = r.t; while (S.d.ball.st !== B_REST && S.d.holder < 0 && t++ < 600) { stepDodge(COURT, S, [0, 0]); since++; }
  ok(ownerOf(S.d) === LUNA, `the missed ball belongs to Luna, whose side it stopped on (x=${S.d.ball.x.toFixed(0)})`);
  const restS = cloneState(S);   // the ball at rest on Luna's side, untouched
  ok(S.d.clockOwner === LUNA && S.d.clockKind === CLOCK_PICK && S.d.clock < DODGE.pickClock && S.d.clock >= DODGE.pickClock - since,
    `while the ball lies on her side, Luna's pickup clock runs (${S.d.clock} of ${DODGE.pickClock} left, ball there ${since} ticks at most)`);
  const pick0 = S.d.pickN;
  for (t = 0; t < 400 && S.d.holder !== LUNA; t++) {
    const p = S.p[LUNA], dx = S.d.ball.x - (p.x + p.w / 2);
    stepDodge(COURT, S, [0, dx < -2 ? LEFT : dx > 2 ? RIGHT : 0]); since++;
  }
  ok(S.d.holder === LUNA && S.d.pickN === pick0 + 1, `Luna walks to it and picks it up (${t} ticks)`);
  ok(S.d.clockOwner === LUNA && S.d.clockKind === CLOCK_SHOT && S.d.clock === DODGE.shotClock,
    `her shot clock starts in full when she picks it up, not when the ball came over (${S.d.clock} = ${DODGE.shotClock})`);
  // pickup clock: Luna leaves it lying
  {
    const S2 = restS, left = S2.d.clock, turn0 = S2.d.turnN;
    let k = 0; while (S2.d.turnN === turn0 && k++ < DODGE.pickClock + 10) stepDodge(COURT, S2, [0, 0]);
    ok(k === left && S2.d.holder === SOL && S2.d.clockKind === CLOCK_SHOT && S2.d.clock === DODGE.shotClock,
      `a ball left lying goes to the other player's hand when the pickup clock runs out (after ${k} more ticks = what was left), and their shot clock starts in full`);
  }
  // Sol can't pick up a ball on Luna's side
  {
    const S2 = setup(SOL, tp, vp);
    Object.assign(S2.d.ball, { st: B_REST, x: NET + 40, y: 28 * TS - DODGE.r - 0.01 }); S2.d.holder = -1;
    S2.p[SOL].x = NET - 1 - W;
    for (let k = 0; k < 30; k++) stepDodge(COURT, S2, [RIGHT, 0]);
    ok(S2.d.holder === -1, 'Sol cannot reach or take a ball on Luna\'s side');
  }
  // shot clock: Luna stalls
  let k = 0; const turn0 = S.d.turnN;
  while (S.d.holder === LUNA && k++ < DODGE.shotClock + 10) stepDodge(COURT, S, [0, 0]);
  ok(S.d.holder === SOL && S.d.turnN === turn0 + 1 && k === DODGE.shotClock, `holding too long hands the ball over (after ${k} ticks, clock ${DODGE.shotClock})`);
  ok(DODGE.pickClock === 600 && DODGE.shotClock === 1200 && DODGE.clockWarn === 300, 'clocks: 10 s to pick up, 20 s to throw, shown in the last 5 s');
  // a serve starts in hand: the shot clock, and it does not run during the ready freeze
  {
    const S5 = createDodge(3);
    ok(S5.d.holder === S5.d.serve && S5.d.clockKind === CLOCK_SHOT && S5.d.clock === DODGE.shotClock, 'the server starts with the ball in hand, so the shot clock applies');
    while (S5.d.phase === DP_READY) stepDodge(COURT, S5, [0, 0]);
    ok(S5.d.clock === DODGE.shotClock - 1, `it starts when play does, after the ${DODGE.ready}-tick ready freeze (${S5.d.clock} left on the first play tick)`);
  }
  // own-side throw: Sol spikes it into his own floor; it stays his and the clock keeps running
  {
    const S3 = setup(SOL, { x: FLOOR[SOL].lo + 40, y: FLOOR[SOL].y }, vp);
    for (let i = 0; i < 100; i++) stepDodge(COURT, S3, [0, 0]);
    const before = S3.d.clock;
    // hold until the aim points steeply down (3/4 of a swing), then release
    const down = DODGE.aimDwell + DODGE.aimPeriod * 0.75;
    for (let i = 0; i <= down; i++) stepDodge(COURT, S3, [ACT, 0]);
    ok(aimSlope(down) < -0.7, `aim after ${down} ticks points down (slope ${aimSlope(down).toFixed(2)})`);
    let i = 0; while (S3.d.ball.st === B_LIVE && i++ < 100) stepDodge(COURT, S3, [0, 0]);
    ok(sideOf(S3.d.ball.x) === SOL, 'a steep throw from the back lands on the thrower\'s own side');
    ok(S3.d.clockOwner === SOL && S3.d.clockKind === CLOCK_SHOT && S3.d.clock < before - down,
      `own-side throw resets nothing: the shot clock ran through the aim and the flight, and no pickup clock (${before} -> ${S3.d.clock})`);
  }
  // a fumble left lying on his own side goes over when his shot clock runs out, not after a fresh pickup clock
  {
    const S7 = setup(SOL, { x: FLOOR[SOL].lo, y: FLOOR[SOL].y }, { x: FLOOR[LUNA].hi, y: FLOOR[LUNA].y });
    S7.d.holder = -1; Object.assign(S7.d.ball, { st: B_REST, x: NET - 60, y: 28 * TS - DODGE.r - 0.01, vx: 0, vy: 0 });
    S7.d.clock = 450;
    const turn0 = S7.d.turnN;
    let k = 0; while (S7.d.turnN === turn0 && k++ < DODGE.shotClock + 10) stepDodge(COURT, S7, [0, 0]);
    ok(S7.d.holder === LUNA && k === 450, `a fumble left lying goes over when the shot clock runs out (${k} ticks, what was left), not after a fresh ${DODGE.pickClock}`);
  }
  // Stalling: Sol loops steep throws into his own floor and picks the ball up again, with the
  // fastest loop (tap-throws as soon as he holds it) and a slow one (full aim swing, waits
  // before walking over). Online too, with the longest wind-up. The ball must still go over
  // within one shot clock plus one last throw's wind-up and flight.
  {
    const bound = DODGE.shotClock + DODGE.windMax + DODGE.liveMax;
    // find throws that come to rest on the thrower's own side: from a spot on the floor, hold h
    const fumbles = [];
    for (let x = FLOOR[SOL].lo; x <= FLOOR[SOL].hi; x += 12) for (let h = 0; h < MAXHOLD; h += 2) {
      const S = setup(SOL, { x, y: FLOOR[SOL].y }, { x: FLOOR[LUNA].hi, y: FLOOR[LUNA].y });
      for (let i = 0; i <= h; i++) stepDodge(COURT, S, [ACT, 0]);
      stepDodge(COURT, S, [0, 0]);
      if (S.d.holder >= 0) continue;
      let i = 0; while (S.d.ball.st !== B_REST && i++ < 400) { S.p[LUNA].x = 2900; stepDodge(COURT, S, [0, 0]); }
      if (S.d.ball.st === B_REST && sideOf(S.d.ball.x) === SOL) fumbles.push({ x, h, rest: i });
    }
    ok(fumbles.length > 0, `there are throws that stay on the thrower's side (${fumbles.length} spot and aim pairs on the floor)`);
    const f = fumbles.reduce((a, b) => (b.rest < a.rest ? b : a), fumbles[0] || { x: FLOOR[SOL].lo, h: 0 });
    // the loop: walk to the spot, aim, release, walk to the ball, pick it up, repeat
    for (const [name, wait, lag] of [['fast loop', 0, 0], ['slow loop (waits 3 s before each pickup)', 180, 0], ['online loop (longest wind-up)', 0, DODGE.windMax]]) {
      const S6 = setup(SOL, { x: f.x, y: FLOOR[SOL].y }, { x: FLOOR[LUNA].hi, y: FLOOR[LUNA].y });
      S6.d.lag = [lag, lag];
      const turn0 = S6.d.turnN;
      let t = 0, held = -1, loose = 0, throws = 0;
      while (S6.d.turnN === turn0 && t++ < 4 * DODGE.shotClock) {
        const D = S6.d, p = S6.p[SOL], inp = [0, 0];
        if (D.holder === SOL && D.wind === 0) {
          loose = 0;
          if (held < 0 && Math.abs(p.x - f.x) > 2) inp[SOL] = p.x < f.x ? RIGHT : LEFT;
          else if (held < 0 && Math.abs(p.vx) > 0.01) inp[SOL] = 0;
          else if (held < f.h) { inp[SOL] = ACT; held++; }
          else { held = -1; throws++; }
        } else if (D.holder < 0 && D.ball.st !== B_LIVE && sideOf(D.ball.x) === SOL && loose++ >= wait) {
          const dx = D.ball.x - (p.x + p.w / 2); inp[SOL] = dx < -2 ? LEFT : dx > 2 ? RIGHT : 0;
        }
        stepDodge(COURT, S6, inp);
      }
      ok(S6.d.turnN === turn0 + 1 && S6.d.holder === LUNA && t <= bound && throws >= 2,
        `stalling, ${name}: ${throws} throws to his own side, the ball still goes over after ${t} ticks (${sec(t)}) <= ${bound} (${sec(bound)})`);
    }
  }
  // hit -> score, pause, victim serves
  {
    const r2 = shot(SOL, { x: solNet, y: FLOOR[SOL].y }, { x: NET + 100, y: FLOOR[LUNA].y }, 0);
    const S4 = r2.S;
    ok(r2.hit && S4.d.score[SOL] === 1 && S4.d.phase === DP_POINT, 'a hit scores a point for the thrower and pauses');
    for (let i = 0; i < DODGE.pointTicks; i++) stepDodge(COURT, S4, [0, 0]);
    ok(S4.d.phase === DP_READY && S4.d.holder === LUNA, 'after the pause the player who was hit serves');
    ok(S4.p[SOL].x === COURT.spawns[SOL].x && S4.p[LUNA].x === COURT.spawns[LUNA].x, 'players are back at their spawns');
    // no throwing during the ready freeze
    for (let i = 0; i < 5; i++) stepDodge(COURT, S4, [0, ACT]);
    stepDodge(COURT, S4, [0, 0]);
    ok(S4.d.holder === LUNA && S4.d.throwN === 1, 'throws are locked during the ready freeze');
    // play out a match: whoever serves throws a tap at the other standing still
    let guard = 0;
    while (S4.d.phase !== DP_OVER && guard++ < 20000) {
      const D = S4.d, inp = [0, 0];
      if (D.phase === DP_PLAY && D.holder >= 0) inp[D.holder] = (D.t % 2) ? ACT : 0;
      stepDodge(COURT, S4, inp);
    }
    const sc = S4.d.score;
    ok(S4.d.phase === DP_OVER && Math.max(...sc) === DODGE.toWin && S4.d.winner === (sc[0] > sc[1] ? SOL : LUNA),
      `first to ${DODGE.toWin} wins (final ${sc[0]}-${sc[1]}, winner ${S4.d.winner ? 'Luna' : 'Sol'})`);
  }
}

// 6. determinism
console.log('\n6. Determinism');
{
  const run = (sd) => {
    const S = createDodge(sd); let s = 99; const r = () => { s = (s * 69069 + 1) >>> 0; return s; };
    const snaps = [];
    for (let t = 0; t < 3000; t++) { stepDodge(COURT, S, [r() & 15, r() & 15]); if (t === 1500) snaps.push(cloneState(S)); }
    return [JSON.stringify(S), snaps[0]];
  };
  const [a, mid] = run(42), [b] = run(42);
  ok(a === b, 'same seed and inputs give identical states');
  // replay from a JSON snapshot (what the server sends) and compare
  const S = JSON.parse(JSON.stringify(mid)); let s = 99; const r = () => { s = (s * 69069 + 1) >>> 0; return s; };
  for (let t = 0; t <= 1500; t++) { r(); r(); }
  for (let t = 1501; t < 3000; t++) stepDodge(COURT, S, [r() & 15, r() & 15]);
  ok(JSON.stringify(S) === a, 'resuming from a JSON snapshot gives the same result');
  let sol = 0; for (let sd = 1; sd <= 1000; sd++) if (createDodge(sd).d.serve === SOL) sol++;
  ok(sol > 430 && sol < 570, `first serve is random by seed (Sol ${sol}/1000)`);
  ok(createDodge(7).d.serve === createDodge(7).d.serve, 'and fixed for a given seed');
}

// 7. online wind-up
console.log('\n7. Online wind-up (fix C)');
{
  ok(windupFor(0) === 0 && windupFor(undefined) === 0 && windupFor(0, 0) === 0, 'no round trip, no wind-up (local play is unchanged)');
  ok(windupFor(40) === 3 && windupFor(80) === 5 && windupFor(80, 1) === 6 && windupFor(150) === 9 && windupFor(400, 5) === DODGE.windMax,
    `wind-up = 1.1 round trips + queue, in ticks, capped at ${DODGE.windMax} (${windupFor(40)}/${windupFor(80)}/${windupFor(80, 1)}/${windupFor(150)}/${windupFor(400, 5)} at 40/80/80+1/150/400+5 ms)`);
  const tp = { x: FLOOR[SOL].lo + 60, y: FLOOR[SOL].y }, vp = { x: FLOOR[LUNA].hi, y: FLOOR[LUNA].y };
  // one throw: hold `hold` ticks, release, then thrower input `tIn(t)` and victim input `vIn(t)` t ticks after the release
  const run = (k, hold, tIn = () => 0, vIn = () => 0, wait = -1) => {
    const S = setup(SOL, tp, vp); S.d.lag = [0, k]; S.d.wait = wait;
    for (let i = 0; i <= hold; i++) stepDodge(COURT, S, [ACT, 0]);
    const rec = [];
    for (let t = 1; t <= 120; t++) {
      const before = { x: S.p[SOL].x, held: S.d.holder === SOL };
      stepDodge(COURT, S, [tIn(t), vIn(t)]);
      const b = S.d.ball;
      rec.push({ t, st: b.st, x: b.x, y: b.y, throwN: S.d.throwN, hitN: S.d.hitN, px: S.p[SOL].x, before, wind: S.d.wind, clock: S.d.clock, pv: b.pv });
      if (S.d.throwN && (b.st !== B_LIVE || S.d.phase !== DP_PLAY || b.pv >= 0) && t > k + 2) break;
    }
    return { S, rec };
  };
  const launchAt = (rec) => rec.find(r => r.throwN > 0).t;
  for (const k of [1, 5, 9]) {
    const { rec } = run(k, 0);
    ok(launchAt(rec) === k + 1, `wind-up ${k}: the ball leaves the hand ${k} ticks after the release (local: on the release tick)`);
  }
  ok(launchAt(run(0, 0).rec) === 1, 'wind-up 0 throws on the release tick, as before');
  // the flight after the wind-up is the local flight, shifted by k ticks
  for (const hold of [0, 30]) {
    const local = run(0, hold).rec.filter(r => r.throwN > 0), wound = run(6, hold).rec.filter(r => r.throwN > 0);
    const same = local.length === wound.length && local.every((r, i) => r.x === wound[i].x && r.y === wound[i].y && r.hitN === wound[i].hitN);
    ok(same, `${hold ? 'an aimed' : 'a flat'} throw after a 6-tick wind-up flies the same path as the local throw (${local.length} ticks, ${local.at(-1).hitN ? 'hit' : 'miss'} both)`);
  }
  // the thrower is planted: running keys during the wind-up (from the tick after the release;
  // the release tick's own keys still count, and the other screen gets them with the release) change nothing
  const still = run(6, 0, (t) => (t >= 2 ? RIGHT : 0)).rec, idle = run(6, 0).rec;
  ok(still.slice(0, 6).every((r, i) => r.px === idle[i].px) && still.find(r => r.throwN).x === idle.find(r => r.throwN).x,
    'during the wind-up the thrower\'s keys are ignored (same position and launch point as standing still)');
  const fire = run(6, 0, (t) => (t >= 2 && t <= 5 ? ACT | JUMP : 0)).rec;
  ok(fire.find(r => r.throwN).y === idle.find(r => r.throwN).y && fire.filter(r => r.throwN > 1).length === 0, 'pressing throw or jump again during the wind-up does nothing');
  // aim locked at the release
  const aimed = run(6, 40).rec.find(r => r.throwN), aimedLocal = run(0, 40).rec.find(r => r.throwN);
  const slope = (q, h) => (q.y - h.y);
  ok(Math.abs(slope(aimed, handPos(setup(SOL, tp, vp).p[SOL], SOL)) - slope(aimedLocal, handPos(setup(SOL, tp, vp).p[SOL], SOL))) < 1e-9, `an aimed throw keeps the aim it was released with (slope ${aimSlope(40).toFixed(2)})`);
  // the shot clock can't run out during a wind-up: a release at the last clock tick still throws
  {
    const S = setup(SOL, tp, vp); S.d.lag = [0, 9]; S.d.clock = 2;
    stepDodge(COURT, S, [ACT, 0]); stepDodge(COURT, S, [0, 0]);
    const c0 = S.d.clock; for (let i = 0; i < 9; i++) stepDodge(COURT, S, [0, 0]);
    ok(S.d.throwN === 1 && S.d.turnN === 0 && c0 === 0, 'the shot clock can\'t run out during a wind-up (it reaches 0 while winding up, and the ball still flies)');
  }
  // dodge window measured from the launch is the local one
  const window = (k) => { const out = []; for (let r = 1; r <= 40; r++) { const { rec } = run(k, 0, () => 0, (t) => (t - k >= r ? JUMP : 0)); if (!rec.at(-1).hitN && rec.some(x => x.throwN)) out.push(r); } return out; };
  const w0 = window(0), w6 = window(6);
  ok(JSON.stringify(w0) === JSON.stringify(w6), `jumping r ticks after the launch dodges for the same r with or without a wind-up (r ${w0[0]}-${w0.at(-1)})`);
  // the screen that waits for the server: a hit on that player stops the ball and scores nothing
  {
    const { S, rec } = run(0, 0, () => 0, () => 0, LUNA);
    const stop = rec.at(-1);
    ok(stop.pv === LUNA && S.d.hitN === 0 && S.d.phase === DP_PLAY, 'with wait set, a ball reaching that player stops in them and scores nothing');
    const x = S.d.ball.x; for (let i = 0; i < 20; i++) stepDodge(COURT, S, [0, 0]);
    ok(S.d.ball.x === x && S.d.hitN === 0, 'and stays there until the server\'s state replaces the prediction');
    const { S: S2 } = run(0, 0);
    ok(S2.d.hitN === 1, 'without wait (the server, local play) the same throw scores');
  }
  // determinism through a wind-up, resumed from JSON mid wind-up
  {
    const a = setup(SOL, tp, vp); a.d.lag = [0, 7];
    stepDodge(COURT, a, [ACT, 0]); stepDodge(COURT, a, [0, 0]); stepDodge(COURT, a, [0, 0]);
    const mid = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 60; i++) { stepDodge(COURT, a, [RIGHT, i === 20 ? JUMP : 0]); stepDodge(COURT, mid, [RIGHT, i === 20 ? JUMP : 0]); }
    ok(JSON.stringify(a) === JSON.stringify(mid) && a.d.throwN === 1, 'a state saved mid wind-up and resumed gives the same result');
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll dodgeball checks passed.');
process.exit(failed ? 1 : 0);
