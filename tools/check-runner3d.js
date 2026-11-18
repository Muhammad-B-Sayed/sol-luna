// Runner 3D fairness checker: proves with the real sim that every generated section can be
// cleared, by both characters, at the zone speed that section actually has, to full
// difficulty and top zone speed.
//
//   node tools/check-runner3d.js               50 seeds, course to z 1700 (full difficulty at 1100, top speed at 1600)
//   SEEDS=10 Z=600 JOBS=4 node tools/check-runner3d.js
//   SEED=17 V=1 node tools/check-runner3d.js   one seed, print every section
//   QUICK=1 node tools/check-runner3d.js       4 seeds, for iteration
//
// Tests, for every section k of every seed (T_k = the tick the zone is BUF behind its start):
//  1. Whole course, for Sol and for Luna, at the real zone speed: the bot runs section after
//     section, waiting on a run-up only when more than BUF_MAX ahead. It must reach the end alive.
//  2. Single section: from its start at T_k (BUF ahead of the zone), it must be cleared alive;
//     clearing it before T_{k+1} keeps the same lead, which proves the course by induction.
//  3. Second arrival (sections with tilting slabs or ember slabs): the other character runs its
//     own route DELTA ticks earlier, or abuses the parts (hopping, standing on edges, falling
//     off) from 130 ticks earlier; the tested one arrives at T_k into whatever state the parts
//     are in and must clear the section alive. The time lost against T_{k+1} is reported.
//  4. Parked partner (tilting slabs): the other character is held on the near edge, the
//     middle, the far edge or a corner of each slab (full tilt) while the tested one crosses.
//  5. Back to rest: after every run and after random abuse, every stateful object is back at
//     exact rest within restBound(o) ticks of its last touch.
//  6. Equal difficulty: clear times per kind for Sol and for Luna.
//  7. Determinism: both course routes played together twice give the same state; the same run
//     with the state sent through JSON.parse(JSON.stringify(S)) every 250 ticks matches too.
//  8. Flow: a never-stop bot (runner3d-bot.js FLOW: it owes a quarter of run speed in forward
//     progress every tick and may never be more than 15 ticks of standing still behind on that;
//     it may slow, steer, strafe and jump, but never wait) arrives at the
//     section's start at full speed and must clear it. Kinds without a clock are tried once (at
//     T_k); clocked kinds (sweeper, pendulum, carousel, gate, orbs) are tried at 12 arrival times,
//     T_k - 0, 25, ..., 275 ticks, so every phase of their clocks is met. A failed try is retried
//     with a bigger debt allowed (30, 60, 120, 240 ticks) to report how long a wait it needed.
//     Thorn curtains also get a reactive runner, with no foresight: always forward, steering
//     toward where the opening is right now (keeping to the floor underfoot), at the same 12
//     arrival times. It must clear every curtain, as a player who follows the gap would.
//     FLOW_ONLY=1 runs only this test; KIND=gate (with FLOW_ONLY) only that kind's sections.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
  buildRunner3d, createRunner3dState, stepRunner3d, cloneRunner3d, ensureGenerated, STATEFUL, atRest, restBound,
  COUNT_TICKS, speedAt, ZONE_START, objPose, IN_F, IN_B, IN_L, IN_R, IN_J, TILT, tiltTop,
} from '../shared/runner3d.js';
import { solve as solve0, tick, sectionGoal, onRunup, FLOW } from './runner3d-bot.js';
import { P3 } from '../shared/runner3d.js';

// solve() with time and effort accounting per test (PROF=1 prints it per section)
const PROF = !!process.env.PROF, prof = {};
let tag = '';
function solve(L, S, who, opts) {
  const t = Date.now(), r = solve0(L, S, who, opts);
  const e = prof[tag] ||= { n: 0, ms: 0, exp: 0, fail: 0 };
  e.n++; e.ms += Date.now() - t; e.exp += r.exp; if (!r.ok) e.fail++;
  return r;
}

const QUICK = !!process.env.QUICK;
const SEEDS = +(process.env.SEEDS || (QUICK ? 4 : 50));
const ZMAX = +(process.env.Z || 1700);
const JOBS = +(process.env.JOBS || 6);
const BUF = 12, BUF_MAX = 20;
const DELTAS = [10, 25, 40, 60, 90, 130];
const BUDGET = +(process.env.BUDGET || 1500);
const V = !!process.env.V;
const FLOW_ONLY = !!process.env.FLOW_ONLY, FLOW_KIND = FLOW_ONLY ? process.env.KIND || '' : '';
const CLOCKED = { sweeper: 1, pendulum: 1, carousel: 1, gate: 1, orbs: 1 };
const FLOW_STARTS = Array.from({ length: 12 }, (_, i) => i * 25);
const FLOW_WAITS = [30, 60, 120, 240];

function park(S, who) { const p = S.p[who]; p.alive = false; p.x = 0; p.z = -1e5; p.y = -1e5; p.gr = false; p.gref = -1; }
function place(S, who, c) {
  Object.assign(S.p[who], { x: c.sx, y: c.y, z: c.sz, vx: 0, vy: 0, vz: 0, gr: true, gref: c.o0, gs: 0, coy: 0, jh: 0, jb: 0, alive: true, fy: c.y });
  S.best[who] = c.sz; S.dead[who] = -1; S.why[who] = '';
}
// a spinning slab at rest must be exactly level: angle and speed exactly 0, drawn at 0 or pi
function exactRest(L, S, out) {
  for (const k in S.o) {
    const o = L.objs[k];
    if (o.k !== 'tilt' || !atRest(L, S, k)) continue;
    const st = S.o[k], pose = objPose(L, S, +k);
    out.n++;
    if (st.a !== 0 || st.w !== 0 || st.s !== 0 || (pose.rot !== 0 && pose.rot !== Math.PI)) out.fail.push({ test: 'level', obj: +k, st: { ...st } });
  }
}
const statefulIn = (L, c) => { const a = []; for (let i = c.o0; i < c.o1; i++) if (STATEFUL[L.objs[i].k]) a.push(i); return a; };
const loaded = (S, i) => S.p.some(p => p.alive && p.gr && p.gref === i);

// Replay a track, then remove the players and measure how long each stateful object of the
// section takes to come back to rest after it was last loaded.
function restCheck(L, S, objs, removeAt, inputs, out) {
  if (!objs.length) return;
  const last = new Map(), restAt = new Map(), offAt = new Map();
  for (let t = 0; t < removeAt + 900; t++) {
    if (t === removeAt) { park(S, 0); park(S, 1); }
    stepRunner3d(L, S, t < removeAt ? inputs(S.tick) : [0, 0]);
    for (const i of objs) {
      if (i < S.lo && !offAt.has(i)) offAt.set(i, S.tick);
      if (i < S.lo || i >= S.hi) continue;
      if (loaded(S, i)) { last.set(i, S.tick); restAt.delete(i); continue; }
      if (atRest(L, S, i)) { if (!restAt.has(i)) restAt.set(i, S.tick); } else restAt.delete(i);
    }
    if (t > removeAt && objs.every(i => restAt.has(i) || i < S.lo || i >= S.hi)) break;
  }
  exactRest(L, S, out.level ||= { n: 0, fail: [] });
  for (const i of objs) {
    const o = L.objs[i];
    if (!last.has(i)) continue;
    const rec = out[o.k] ||= { n: 0, max: 0, fail: 0, off: 0 };
    if (!restAt.has(i) && offAt.has(i) && offAt.get(i) - last.get(i) < restBound(o)) { rec.off++; continue; }
    const r = restAt.has(i) ? restAt.get(i) - last.get(i) : Infinity;
    rec.n++; rec.max = Math.max(rec.max, r);
    if (r > restBound(o)) { rec.fail++; (out.fails ||= []).push({ obj: i, kind: o.k, ticks: r }); }
  }
}

// seeded random input track: running, hopping, strafing, backing up, standing still
function abuseTrack(seed, n) {
  let rs = seed >>> 0;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const opts = [IN_F, IN_F | IN_J, 0, IN_B, IN_J, IN_L | IN_J, IN_R | IN_J, IN_F | IN_L, IN_F | IN_R, IN_B | IN_J, IN_L, IN_R];
  const track = [];
  let bits = IN_F, hold = 0;
  for (let t = 0; t < n; t++) {
    if (--hold <= 0) { bits = opts[Math.floor(rnd() * opts.length)]; hold = 3 + Math.floor(rnd() * 30); }
    track.push(bits);
  }
  return track;
}

function hashState(S) {
  const s = JSON.stringify(S);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + ':' + s.length;
}

function checkSeed(seed) {
  const L = buildRunner3d(seed);
  ensureGenerated(L, ZMAX + 120);
  const secs = L.secs.filter(c => c.z1 <= ZMAX);
  const K = secs.length;
  const ghost = createRunner3dState(L, { sandbox: true });
  park(ghost, 0); park(ghost, 1);
  // T[k]: the zone is BUF behind section k's start (section 0 starts when the countdown ends)
  const T = [], zoneAt = [];   // zoneAt[t]: the zone's z at tick t (it does not depend on the players)
  {
    const S = cloneRunner3d(ghost);
    let k = 0;
    while (k <= K || S.zone < ZMAX + 60) {
      zoneAt[S.tick] = S.zone;
      if (k <= K && S.tick >= COUNT_TICKS && S.zone >= L.secs[k].sz - BUF) { T[k++] = S.tick; continue; }
      stepRunner3d(L, S, [0, 0]);
    }
  }
  // last tick at which the zone is still at least `lead` behind z
  const byLead = (z, lead) => { let lo = 0, hi = zoneAt.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (zoneAt[m] <= z - lead) lo = m; else hi = m - 1; } return lo; };
  const need = new Set();
  for (let k = 0; k <= K; k++) {
    need.add(T[k]);
    for (const d of [...DELTAS, 150]) if (T[k] - d >= COUNT_TICKS) need.add(T[k] - d);
    if (k < K && CLOCKED[secs[k].kind]) for (const d of FLOW_STARTS) if (T[k] - d >= COUNT_TICKS) need.add(T[k] - d);
  }
  const snap = new Map();
  {
    const S = cloneRunner3d(ghost);
    const last = Math.max(...need);
    while (S.tick <= last) { if (need.has(S.tick)) snap.set(S.tick, cloneRunner3d(S)); stepRunner3d(L, S, [0, 0]); }
  }
  const snapAt = (t) => cloneRunner3d(snap.get(t));

  // 8. flow: the never-stop bot, arriving at full speed
  tag = 'flow';
  const flow = { kinds: {}, fails: [] };
  for (let k = 0; k < K; k++) {
    const c = secs[k], goal = sectionGoal(L, k + 1);
    if (FLOW_KIND && c.kind !== FLOW_KIND) continue;
    const fk = flow.kinds[c.kind] ||= { n: 0, fail: 0, waits: [], slow: 0 };
    const starts = CLOCKED[c.kind] ? FLOW_STARTS.map(d => T[k] - d).filter(t => snap.has(t)) : [T[k]];
    for (const who of [0, 1]) for (const t0 of starts) {
      const go = (stop) => {
        const S = snapAt(t0); place(S, who, c); park(S, 1 - who); S.p[who].vz = P3.maxSpeed;
        return solve(L, S, who, { until: goal, budget: BUDGET, o0: c.o0, o1: c.o1, flow: { ...FLOW, stop }, rungs: stop === FLOW.stop ? 5 : 2 });
      };
      fk.n++;
      const r = go(FLOW.stop);
      if (r.ok) { fk.slow = Math.max(fk.slow, r.maxSlow); continue; }
      fk.fail++;
      let wait = Infinity;
      for (const w of FLOW_WAITS) if (go(w).ok) { wait = w; break; }
      fk.waits.push(wait);
      flow.fails.push({ test: 'flow', seed, k, kind: c.kind, z: +c.z0.toFixed(1), who, arrive: T[k] - t0, wait: wait === Infinity ? 'none' : wait });
    }
  }
  // reactive runner through the thorn curtains
  flow.reactive = { n: 0, fail: 0 };
  for (let k = 0; k < K; k++) {
    const c = secs[k];
    if (c.kind !== 'gate' || (FLOW_KIND && FLOW_KIND !== 'gate')) continue;
    const gates = [];
    for (let i = c.o0; i < c.o1; i++) if (L.objs[i].k === 'gate') gates.push(i);
    const end = L.secs[k + 1].sz;
    for (const who of [0, 1]) for (const t0 of FLOW_STARTS.map(d => T[k] - d).filter(t => snap.has(t))) {
      const S = snapAt(t0); place(S, who, c); park(S, 1 - who);
      const p = S.p[who];
      p.vz = P3.maxSpeed;
      for (let t = 0; p.alive && p.z < end && t < 900; t++) {
        let b = IN_F;
        const gi = gates.find(i => L.objs[i].z1 > p.z - 0.4);
        if (gi != null) {
          let gx = objPose(L, S, gi).x;
          const f = p.gref >= 0 ? L.objs[p.gref] : null;
          if (f && f.k === 'floor') gx = Math.max(f.x0 + 0.45, Math.min(f.x1 - 0.45, gx));
          if (gx > p.x + 0.12) b |= IN_R; else if (gx < p.x - 0.12) b |= IN_L;
        }
        tick(L, S, who, b, null);
      }
      flow.reactive.n++;
      if (!(p.alive && p.z >= end)) { flow.reactive.fail++; flow.fails.push({ test: 'curtain', seed, k, z: +c.z0.toFixed(1), who, arrive: T[k] - t0, why: S.why[who] || 'slow' }); }
    }
  }
  if (FLOW_ONLY) return { seed, secs: K, flowOnly: true, flow, course: [], courseFail: [], first: 0, firstFail: [], second: 0, secondFail: [], parked: 0, parkedFail: [], lost: [], slack: [], kinds: {}, rest: {}, abuse: {}, restFail: [], speed: 0, zEnd: 0, tMax: T[K], det: null, lostTilt: {}, spins: [], spinFail: [], edgeMiss: [], level: { n: 0, fail: [] } };

  // 1. the whole course, per character
  tag = 'course';
  const course = [], plans = [];
  for (const who of [0, 1]) {
    let S = createRunner3dState(L, { sandbox: true });
    park(S, 1 - who);
    const plan = [];
    while (S.tick < COUNT_TICKS) { stepRunner3d(L, S, [0, 0]); plan.push(0); }
    const run = { who, minLead: Infinity, fails: [] };
    let clean = true;
    for (let k = 0; k < K; k++) {
      const c = secs[k], p = S.p[who];
      if (onRunup(L, k, p)) while (p.z - S.zone > BUF_MAX) { tick(L, S, who, 0, null); plan.push(0); }
      const lead = p.z - S.zone;
      if (k > 0) run.minLead = Math.min(run.minLead, lead);
      // first try to keep the lead (or rebuild it to BUF), then settle for any safe route
      const opt = { until: sectionGoal(L, k + 1), budget: BUDGET, o0: c.o0, o1: c.o1 };
      let r = solve(L, S, who, { ...opt, deadline: byLead(L.secs[k + 1].sz, Math.min(BUF, lead)), rungs: 4, rungBudget: BUDGET / 3 });
      if (!r.ok) r = solve(L, S, who, opt);
      if (r.ok) { S = r.S; plan.push(...r.plan); continue; }
      run.fails.push({ test: 'course', seed, k, kind: c.kind, z: +c.z0.toFixed(1), who, lead: +lead.toFixed(1) });
      clean = false;
      S = snapAt(T[k + 1]); park(S, 1 - who); place(S, who, L.secs[k + 1]);   // carry on from the next section
    }
    course.push(run);
    plans.push(clean ? plan : null);
  }

  const res = {
    seed, secs: K, flow, first: 0, firstFail: [], second: 0, secondFail: [], parked: 0, parkedFail: [], lost: [], slack: [], kinds: {},
    lostTilt: {}, spins: [], spinFail: [], edgeMiss: [], level: { n: 0, fail: [] },
    course: course.map(r => ({ who: r.who, minLead: r.minLead })), courseFail: course.flatMap(r => r.fails), rest: {}, abuse: {},
    speed: speedAt(secs[K - 1].z0 - ZONE_START), zEnd: secs[K - 1].z1, tMax: T[K], det: null,
  };

  for (let k = 0; k < K; k++) {
    const c = secs[k], Tk = T[k], Tn = T[k + 1], goal = sectionGoal(L, k + 1);
    const kinfo = res.kinds[c.kind] ||= { n: 0, time: [0, 0], both: 0, maxDiff: 0, minSlack: Infinity, v: 0 };
    kinfo.n++; kinfo.v = Math.max(kinfo.v, speedAt(c.z1 - ZONE_START));
    const objs = statefulIn(L, c);
    const firstPlans = [], times = [];
    // 2. single section, per character
    tag = 'section';
    for (const who of [0, 1]) {
      const S = snapAt(Tk); place(S, who, c); park(S, 1 - who);
      let r = solve(L, S, who, { until: goal, deadline: Tn, budget: BUDGET / 3, o0: c.o0, o1: c.o1, rungs: 1 });
      if (!r.ok) { const S2 = snapAt(Tk); place(S2, who, c); park(S2, 1 - who); r = solve(L, S2, who, { until: goal, budget: BUDGET, o0: c.o0, o1: c.o1 }); }
      res.first++;
      if (!r.ok) { res.firstFail.push({ test: 'section', seed, k, kind: c.kind, z: +c.z0.toFixed(1), who }); firstPlans.push(null); times.push(null); continue; }
      firstPlans.push(r.plan); times.push(r.tick - Tk);
      res.slack.push(Tn - r.tick);
      kinfo.minSlack = Math.min(kinfo.minSlack, Tn - r.tick);
      if (objs.length) {   // 5. back to rest after this run
        const S3 = snapAt(Tk); place(S3, who, c); park(S3, 1 - who);
        restCheck(L, S3, objs, r.plan.length, (t) => { const a = [0, 0]; a[who] = r.plan[t - Tk] ?? 0; return a; }, res.rest);
      }
    }
    if (times[0] != null && times[1] != null) {
      kinfo.time[0] += times[0]; kinfo.time[1] += times[1]; kinfo.both++;
      kinfo.maxDiff = Math.max(kinfo.maxDiff, Math.abs(times[0] - times[1]));
    }
    if (V) console.log(`seed ${seed} #${k} ${c.kind}${c.intro ? '*' : ''} z${c.z0.toFixed(1)}-${c.z1.toFixed(1)} d${c.d.toFixed(2)} v${speedAt(c.z1 - ZONE_START).toFixed(3)}  sol ${times[0] ?? 'FAIL'}  luna ${times[1] ?? 'FAIL'}  (allowed ${Tn - Tk})`);
    if (!objs.length) continue;

    // 3. second arrival: `a` ran (or abused) the section earlier, `b` arrives at T_k
    // setup(S, a), if given, puts the partner somewhere else than the section's start at t0
    const second = (a, t0, otherTrack, label, setup) => {
      const b = 1 - a;
      if (!snap.has(t0)) return;
      const S = snapAt(t0); place(S, a, c); park(S, b);
      if (setup) setup(S, a);
      const other = (t) => otherTrack[t - t0] ?? 0;
      while (S.tick < Tk) { tick(L, S, b, 0, other); }
      place(S, b, c);
      const r = solve(L, S, b, { until: goal, other, budget: BUDGET, o0: c.o0, o1: c.o1 });
      const parked = label.startsWith('parked');
      if (parked) res.parked++; else res.second++;
      const f = { seed, k, kind: c.kind, z: +c.z0.toFixed(1), who: b, by: label };
      if (!r.ok) (parked ? res.parkedFail : res.secondFail).push(f);
      else { res.lost.push(r.tick - Tn); if (c.kind === 'tilt') (res.lostTilt[label.split(' ')[0]] ||= []).push(r.tick - Tn); }
    };
    // an abuse track: follow a's own route until it first stands on a stateful part, then
    // random hopping, strafing, backing up and standing about from there
    const abusePlan = (a, salt, n) => {
      const rand = abuseTrack(seed * 7919 + k * 104729 + a * 13 + salt, n);
      const plan = firstPlans[a];
      if (!plan) return rand;
      const S = snapAt(Tk); place(S, a, c); park(S, 1 - a);
      for (let t = 0; t < plan.length; t++) {
        tick(L, S, a, plan[t], null);
        if (objs.some(i => loaded(S, i))) return plan.slice(0, t + 1).concat(rand);
      }
      return rand;
    };
    for (const a of [0, 1]) {
      tag = 'second';
      if (firstPlans[a]) for (const d of DELTAS) second(a, Tk - d, firstPlans[a], 'delta ' + d);
      tag = 'abuse2';
      second(a, Tk - 130, abusePlan(a, 1, 600), 'abuse');
      // 4. parked partner on each spinning slab. A partner on an outer band flips it and falls
      // (that is the edge abuse below), so "parked" means standing still where the slab holds
      // them: on the centre line and at the side limits of the centre band (u = +-0.4), at its
      // near end, middle and far end. The partner is set there at Tk - 150 and then lets go of
      // the keys: the sim decides where they go (a second load on the same side can tip it).
      tag = 'parked';
      for (const i of objs) {
        const o = L.objs[i];
        if (o.k !== 'tilt') continue;
        const spots = [];
        for (const u of [0, -0.4, 0.4]) for (const tz of [o.z0 + 0.5, o.cz, o.z1 - 0.5]) spots.push([o.cx + u * o.hx, tz, u]);
        for (const [tx, tz, u] of QUICK ? spots.slice(0, 3) : spots) {
          second(a, Tk - 150, [], `parked u${u} z${(tz - o.z0).toFixed(1)}`, (S2, w) => {
            const y = tiltTop(o, S2.o[i], tx);
            Object.assign(S2.p[w], { x: tx, z: tz, y, vx: 0, vz: 0, vy: 0, gr: true, gref: i, fy: y });
          });
        }
        // edge and corner abuse: the partner jumps or steps onto the outer band of this slab
        // (left or right, near end, middle or far end) or lands on its centre line, then hops
        // about; the tested one arrives 40, 80 or 130 ticks after the partner set off. The spin
        // an edge touch starts is measured on its own: turns, turn times, ticks to rest.
        tag = 'edge';
        const third = (o.z1 - o.z0) / 3;
        const targets = [[0, 0], [0, 1], [0, 2], [-1, 0], [-1, 1], [-1, 2], [1, 0], [1, 1], [1, 2]].filter(([sd, zt]) => !QUICK || zt === 0);
        for (const [sd, zt] of targets) {
          const want = (S2, p) => {
            if (!(p.gr && p.gref === i)) return false;
            const u = (p.x - o.cx) / o.hx;
            const inZ = p.z >= o.z0 + zt * third - 0.4 && p.z <= o.z0 + (zt + 1) * third + 0.4;
            return inZ && (sd === 0 ? Math.abs(u) < 0.2 : sd * u >= TILT.UE);
          };
          const S0 = snapAt(Tk - 150); place(S0, a, c); park(S0, 1 - a);
          const r = solve(L, S0, a, { until: want, budget: BUDGET, o0: c.o0, o1: c.o1, rungs: 5 });
          const name = `edge ${sd ? (sd < 0 ? 'left' : 'right') : 'centre'} ${['near', 'mid', 'far'][zt]}`;
          if (!r.ok) { res.edgeMiss.push({ seed, k, obj: i, by: name, who: a }); continue; }
          const hops = []; for (let t = 0; t < 400; t++) hops.push(t % 40 < 2 ? IN_J : t % 80 < 40 ? IN_L : IN_R);
          const track = r.plan.concat(hops);
          for (const D of [40, 80, 130]) second(a, Tk - D, track, name + ' ' + D);
          if (sd) {   // the spin itself, with nobody else about
            const S1 = snapAt(Tk - 150); place(S1, a, c); park(S1, 1 - a);
            for (const bits of r.plan) tick(L, S1, a, bits, null);
            park(S1, a);
            const st = S1.o[i];
            let turn = 0, last = 0, t = 0;
            const times = [];
            for (; t < 600 && !(st.s === 0 && st.a === 0 && st.w === 0 && t > 0); t++) {
              stepRunner3d(L, S1, [0, 0]); turn += st.w;
              if (Math.abs(turn) >= 2 * Math.PI * (times.length + 1)) { times.push(t + 1 - last); last = t + 1; }
            }
            const n = Math.abs(turn) / (2 * Math.PI);
            res.spins.push({ n, times, rest: t });
            if (n < 2.5 || n > 3.5) res.spinFail.push({ test: 'spin', seed, k, obj: i, by: name, turns: +n.toFixed(2) });
          }
          restCheck(L, (() => { const S2 = snapAt(Tk - 150); place(S2, a, c); park(S2, 1 - a); return S2; })(), objs, track.length,
            (t) => { const x = [0, 0]; x[a] = track[t - (Tk - 150)] ?? 0; return x; }, res.abuse);
        }
      }
      // 5. back to rest after random abuse
      const track = abusePlan(a, 2, 360);
      const S = snapAt(Tk); place(S, a, c); park(S, 1 - a);
      restCheck(L, S, objs, track.length, (t) => { const x = [0, 0]; x[a] = track[t - Tk] ?? 0; return x; }, res.abuse);
    }
  }

  res.restFail = [...(res.rest.fails || []), ...(res.abuse.fails || [])].map(f => ({ test: 'rest', seed, ...f }));
  for (const key of ['rest', 'abuse']) {
    const lv = res[key].level;
    if (lv) { res.level.n += lv.n; res.level.fail.push(...lv.fail.map(f => ({ seed, ...f }))); }
    delete res[key].fails; delete res[key].level;
  }

  // 7. determinism: both course routes at once, plain, again, and through JSON every 250 ticks
  if (plans[0] && plans[1]) {
    const n = Math.min(plans[0].length, plans[1].length, QUICK ? 6000 : 20000);
    const play = (json) => {
      let S = createRunner3dState(L, { sandbox: true });
      for (let t = 0; t < n; t++) {
        if (json && t % 250 === 125) S = JSON.parse(JSON.stringify(S));
        stepRunner3d(L, S, [plans[0][t], plans[1][t]]);
      }
      return hashState(S);
    };
    const L2 = buildRunner3d(seed);   // a fresh course generated lazily from the seed, as a client does
    const fresh = (() => { let S = createRunner3dState(L2, { sandbox: true }); for (let t = 0; t < n; t++) stepRunner3d(L2, S, [plans[0][t], plans[1][t]]); return hashState(S); })();
    const h1 = play(false), h2 = play(false), h3 = play(true);
    res.det = { n, ok: h1 === h2 && h1 === h3 && h1 === fresh };
  }
  return res;
}

function merge(all) {
  const tot = { lostTilt: {}, spins: [], spinFail: [], edgeMiss: [], level: { n: 0, fail: [] }, flow: { kinds: {}, fails: [], reactive: { n: 0, fail: 0 } }, flowOnly: all.some(r => r.flowOnly), restFail: [], course: [], courseFail: [], seeds: all.length, secs: 0, first: 0, firstFail: [], second: 0, secondFail: [], parked: 0, parkedFail: [], lost: [], slack: [], kinds: {}, rest: {}, abuse: {}, speed: 0, zEnd: 0, tMax: 0, det: [] };
  for (const r of all) {
    for (const [k, v] of Object.entries(r.flow.kinds)) {
      const t = tot.flow.kinds[k] ||= { n: 0, fail: 0, waits: [], slow: 0 };
      t.n += v.n; t.fail += v.fail; t.waits.push(...v.waits); t.slow = Math.max(t.slow, v.slow);
    }
    tot.flow.fails.push(...r.flow.fails);
    for (const [k, v] of Object.entries(r.lostTilt)) (tot.lostTilt[k] ||= []).push(...v);
    tot.spins.push(...r.spins); tot.spinFail.push(...r.spinFail); tot.edgeMiss.push(...r.edgeMiss);
    tot.level.n += r.level.n; tot.level.fail.push(...r.level.fail);
    tot.flow.reactive.n += r.flow.reactive.n; tot.flow.reactive.fail += r.flow.reactive.fail;
    tot.secs += r.secs; tot.first += r.first; tot.second += r.second; tot.parked += r.parked;
    tot.firstFail.push(...r.firstFail); tot.secondFail.push(...r.secondFail); tot.parkedFail.push(...r.parkedFail);
    tot.lost.push(...r.lost); tot.slack.push(...r.slack);
    tot.course.push(...r.course); tot.courseFail.push(...r.courseFail); tot.restFail.push(...r.restFail);
    tot.speed = Math.max(tot.speed, r.speed); tot.zEnd = Math.max(tot.zEnd, r.zEnd); tot.tMax = Math.max(tot.tMax, r.tMax);
    tot.det.push(r.det ? { seed: r.seed, ...r.det } : { seed: r.seed, n: 0, ok: null });
    for (const [k, v] of Object.entries(r.kinds)) {
      const t = tot.kinds[k] ||= { n: 0, time: [0, 0], both: 0, maxDiff: 0, minSlack: Infinity, v: 0 };
      t.n += v.n; t.both += v.both; t.time[0] += v.time[0]; t.time[1] += v.time[1]; t.maxDiff = Math.max(t.maxDiff, v.maxDiff);
      t.minSlack = Math.min(t.minSlack, v.minSlack); t.v = Math.max(t.v, v.v);
    }
    for (const key of ['rest', 'abuse']) for (const [k, v] of Object.entries(r[key])) {
      const t = tot[key][k] ||= { n: 0, max: 0, fail: 0, off: 0 };
      t.n += v.n; t.max = Math.max(t.max, v.max); t.fail += v.fail; t.off += v.off;
    }
  }
  return tot;
}

const pct = (arr, q) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };

function flowReport(t) {
  const F = t.flow, n = Object.values(F.kinds).reduce((a, v) => a + v.n, 0), bad = F.fails.filter(f => f.test === 'flow').length;
  console.log(`  flow            ${n - bad}/${n} tries cleared by the never-stop bot (owes ${(FLOW.min * 60).toFixed(1)} u/s of forward progress, at most ${FLOW.stop} ticks of standing still behind), arriving at full speed`);
  console.log('    kind      tries  forced waits  largest debt  waits needed (ticks)');
  for (const [k, v] of Object.entries(F.kinds)) {
    const w = {}; for (const x of v.waits) w[x] = (w[x] || 0) + 1;
    console.log(`    ${k.padEnd(9)} ${String(v.n).padStart(5)}  ${String(v.fail).padStart(5)} (${(100 * v.fail / Math.max(1, v.n)).toFixed(1).padStart(4)}%)  ${v.slow.toFixed(1).padStart(8)} t    ${Object.entries(w).map(([a, b]) => `<=${a}: ${b}`).join(', ')}`);
  }
  console.log(`    thorn curtains, reactive runner (steers toward the opening as it is now): ${F.reactive.n - F.reactive.fail}/${F.reactive.n} cleared`);
  for (const f of F.fails.slice(0, 30)) console.log('  FAIL', JSON.stringify(f));
  return !F.fails.length;
}

function report(t, secs) {
  if (t.flowOnly) {
    console.log(`\nRunner 3D flow check: ${t.seeds} seeds, ${t.secs} sections to z ${ZMAX}. ${secs.toFixed(0)} s.`);
    const ok = flowReport(t);
    console.log(ok ? '\nPASS' : '\nFAIL');
    return ok;
  }
  const detBad = t.det.filter(d => d.ok === false), detSkip = t.det.filter(d => d.ok === null);
  const ok = !t.spinFail.length && !t.level.fail.length && !t.flow.fails.length && !t.courseFail.length && !t.firstFail.length && !t.secondFail.length && !t.parkedFail.length && !detBad.length && !detSkip.length &&
    Object.values(t.rest).every(v => !v.fail) && Object.values(t.abuse).every(v => !v.fail);
  console.log(`\nRunner 3D check: ${t.seeds} seeds, ${t.secs} sections to z ${ZMAX} (full difficulty at 1100, top zone speed from 1600), top zone speed ${t.speed.toFixed(4)} u/tick, ${(t.tMax / 60).toFixed(0)} s in. ${secs.toFixed(0)} s.`);
  const leads = t.course.map(r => r.minLead);
  console.log(`  whole course    ${t.course.length - new Set(t.courseFail.map(f => f.seed * 2 + f.who)).size}/${t.course.length} runs (Sol and Luna, every seed) reached z ${ZMAX}; smallest lead over the zone at a section start: ${Math.min(...leads).toFixed(1)} (median of per-run minimums ${pct(leads, 0.5).toFixed(1)})`);
  console.log(`  single section  ${t.first - t.firstFail.length}/${t.first} cleared alive from a ${BUF}-unit lead; ${t.slack.filter(x => x < 0).length} of them slower than the zone (repaid by later sections)`);
  console.log(`  second arrival  ${t.second - t.secondFail.length}/${t.second} cleared (after the other's route ${DELTAS.join('/')} ticks earlier, or after its abuse)`);
  console.log(`  parked partner  ${t.parked - t.parkedFail.length}/${t.parked} cleared`);
  {
    const L_ = t.lostTilt, all = Object.values(L_).flat();
    const line = (a) => `median ${pct(a, 0.5)}, 95% ${pct(a, 0.95)}, max ${a.length ? Math.max(...a) : 0}`;
    console.log(`  spinning slabs, time lost by the second arrival (ticks, + = later than the deadline): all ${all.length}: ${line(all)}`);
    for (const [k, v] of Object.entries(L_)) console.log(`    after the partner's ${k.padEnd(7)} ${String(v.length).padStart(5)}: ${line(v)}`);
    const sp = t.spins, tt = (j) => sp.map(s => s.times[j]).filter(x => x != null);
    const rng = (a) => a.length ? `${Math.min(...a)}-${Math.max(...a)}` : '-';
    console.log(`  edge touches    ${sp.length - t.spinFail.length}/${sp.length} spun 2.5 to 3.5 turns (turns ${rng(sp.map(s => +s.n.toFixed(2)))}); turn 1 ${rng(tt(0))} ticks, turn 2 ${rng(tt(1))}, turn 3 ${rng(tt(2))}; level and still ${rng(sp.map(s => s.rest))} ticks after the touch`);
    console.log(`  exact rest      ${t.level.n - t.level.fail.length}/${t.level.n} slabs at rest had angle and speed exactly 0; ${t.edgeMiss.length} edge targets the bot could not reach (skipped)`);
  }
  console.log(`  determinism     ${t.det.filter(d => d.ok).length}/${t.det.length} seeds identical on replay, from a fresh course and through JSON (${detSkip.length} skipped: course run failed)`);
  console.log(`  spare time at a section's exit vs the zone (ticks): min ${Math.min(...t.slack)}, median ${pct(t.slack, 0.5)}`);
  console.log(`  time lost by second arrivals vs the deadline (ticks, + = later): median ${pct(t.lost, 0.5)}, 95% ${pct(t.lost, 0.95)}, max ${t.lost.length ? Math.max(...t.lost) : 0}`);
  console.log('  kind      sections  sol avg  luna avg  max |sol-luna|  min spare  top zone speed');
  for (const [k, v] of Object.entries(t.kinds)) {
    const b = Math.max(1, v.both);
    console.log(`  ${k.padEnd(9)} ${String(v.n).padStart(8)}  ${(v.time[0] / b / 60).toFixed(2).padStart(6)}s  ${(v.time[1] / b / 60).toFixed(2).padStart(7)}s  ${String(v.maxDiff).padStart(10)} t  ${String(v.minSlack).padStart(7)} t  ${v.v.toFixed(4)}`);
  }
  flowReport(t);
  for (const key of ['rest', 'abuse']) for (const [k, v] of Object.entries(t[key])) {
    console.log(`  ${key === 'rest' ? 'rest after a run ' : 'rest after abuse '} ${k.padEnd(8)} ${v.n} objects, slowest ${v.max} ticks after the last touch, over bound: ${v.fail}${v.off ? `, ${v.off} left the window first` : ''}`);
  }
  for (const f of [...t.spinFail, ...t.level.fail, ...t.courseFail, ...t.firstFail, ...t.secondFail, ...t.parkedFail, ...t.restFail, ...detBad].slice(0, 40)) console.log('  FAIL', JSON.stringify(f));
  console.log(ok ? '\nPASS' : '\nFAIL');
  return ok;
}

if (isMainThread && JOBS === 1 && process.env.SEED && !process.env.SEED.includes(',')) {
  const t0 = Date.now();   // one seed, inline: logs appear as they happen
  const ok = report(merge([checkSeed(+process.env.SEED)]), (Date.now() - t0) / 1000);
  if (PROF) console.log(JSON.stringify(prof));
  process.exit(ok ? 0 : 1);
} else if (isMainThread) {
  const t0 = Date.now();
  const seeds = process.env.SEED ? process.env.SEED.split(',').map(Number) : Array.from({ length: SEEDS }, (_, i) => i + 1);
  const results = [];
  let next = 0, running = 0, crashed = 0;
  await new Promise((resolve) => {
    const spawn = () => {
      while (running < JOBS && next < seeds.length) {
        const seed = seeds[next++];
        running++;
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed } });
        const ts = Date.now();
        w.on('message', (r) => {
          results.push(r);
          const bad = r.spinFail.length + r.level.fail.length + r.flow.fails.length + r.courseFail.length + r.firstFail.length + r.secondFail.length + r.parkedFail.length + (r.det && !r.det.ok ? 1 : 0);
          console.log(`seed ${String(r.seed).padStart(3)}: ${r.secs} sections, ${r.first + r.second + r.parked} runs, ${bad ? bad + ' FAILED' : 'ok'} (${((Date.now() - ts) / 1000).toFixed(0)} s)`);
          for (const f of [...r.spinFail, ...r.level.fail, ...r.flow.fails, ...r.courseFail, ...r.firstFail, ...r.secondFail, ...r.parkedFail]) console.log('    fail', JSON.stringify(f));
        });
        w.on('error', (e) => { crashed++; console.error('seed', seed, e); });
        w.on('exit', () => { running--; if (next >= seeds.length && !running) resolve(); else spawn(); });
      }
    };
    spawn();
  });
  const ok = report(merge(results), (Date.now() - t0) / 1000) && !crashed;
  process.exit(ok ? 0 : 1);
} else {
  parentPort.postMessage(checkSeed(workerData.seed));
}
