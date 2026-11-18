// Runner fairness checker: proves with the real sim that every generated chunk can be cleared,
// by both characters, at the scroll speed that chunk actually has.
//
//   node tools/check-runner.js                 50 seeds, course to 1700 tiles (full difficulty and top speed)
//   SEEDS=11-20 TILES=600 JOBS=4 node tools/check-runner.js
//   SEED=17 V=1 node tools/check-runner.js     one seed, print every chunk
//   SEED=20 CHUNKS=80-82 COURSE=0 V=1 node tools/check-runner.js   chunk tests for a few chunks
//
// Tests, for every chunk k of every seed:
//  1. First arrival. The bot stands on the chunk's start ledge at tick T_k, when the left edge
//     of the view is BUF behind it, and must stand on the next chunk's start ledge by T_k+1
//     (so it again has BUF to spare). A player who gets there early can wait on the flat
//     ledge, so passing every chunk this way proves the whole course can be run, by
//     induction. Done for Sol and for Luna.
//  2. Second arrival (chunks with planks, ember slabs or shards). The other character runs its
//     own first-arrival route DELTA ticks earlier, and the tested one arrives at T_k with BUF,
//     right behind it, into whatever state the parts were left in. It must clear the chunk
//     alive. The time it loses compared with the deadline is reported.
//  3. Parked partner (planks). The other character stands still on the near end, the middle
//     or the far end of a plank, holding it at full tilt, while the tested one crosses.
//  4. Back to rest. After the last touch, every plank must be level and still, every slab
//     solid again and every shard regrown within a bounded time, including after random
//     abuse (a player hopping about on it, standing on the ends, falling off).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { TS } from '../shared/sim.js';
import {
  buildRunner, createRunnerState, stepRunner, cloneRunner, ensureGenerated, STATEFUL, oidObj,
  COUNT_TICKS, SLAB_GONE, SLAB_REFORM, SHARD_GONE, SHARD_REGROW, speedAt, diffAt,
} from '../shared/runner.js';
import { search as search1, tick, L_, R_, U_ } from './runner-bot.js';

// a failed search is retried once with four times the budget before it counts as a failure
function search(L, S, who, opts) {
  const r = search1(L, cloneRunner(S), who, opts);
  return r.ok ? r : search1(L, S, who, { ...opts, budget: (opts.budget || BUDGET) * 4 });
}

// SEEDS=50 (1..50) or SEEDS=11-20; SEED=4,7 picks seeds; JOBS worker threads (default: cores - 1,
// at most 8); PARTS splits each seed's chunk tests into that many work units; CHUNKS=80-82 runs
// the chunk tests for those chunks only; COURSE=0 skips the whole-course runs; DUMP=dir writes
// the state at each whole-course failure there (JSON, for tools that replay it).
const env = process.env;
const range = (v) => { const [a, b] = String(v).split('-').map(Number); return b === undefined ? [1, a] : [a, b]; };
const SEED_RANGE = range(env.SEEDS || 50);
const TILES = +(env.TILES || 1700);
const JOBS = +(env.JOBS || Math.max(1, Math.min(8, availableParallelism() - 1)));
const PARTS = +(env.PARTS || 3);
const CHUNKS = env.CHUNKS ? range(env.CHUNKS) : null;
const COURSE = env.COURSE !== '0';
const DUMP = env.DUMP || '';
const BUF = 12 * TS;
const BUF_MAX = 20 * TS;
const DELTAS = [10, 25, 40, 60, 90, 130];
const BUDGET = +(process.env.BUDGET || 2500);
const V = !!process.env.V;

function park(S, who) { const p = S.p[who]; p.alive = false; p.x = -1e5; p.y = -1e5; p.gr = false; p.gref = -1; }
function place(S, who, c) {
  const p = S.p[who];
  Object.assign(p, { x: c.x0 * TS + 4, y: c.h0 * TS - p.h, vx: 0, vy: 0, gr: true, gref: -1, coy: 0, alive: true, push: 0, strain: 0 });
  S.best[who] = p.x; S.dead[who] = -1; S.why[who] = '';
}

function loaded(L, S, i) {
  const o = L.objs[i];
  for (const p of S.p) {
    if (!p.alive) continue;
    if (o.k === 'shard') { if (p.x + p.w >= o.x - o.trig && p.x <= o.x + o.w) return true; }
    else if (p.gr && oidObj(p.gref) === i) return true;
  }
  return false;
}
function atRest(st, k) { return k === 'plank' ? st.s === 0 && st.w === 0 : st.st === 0; }
const REST_BOUND = { plank: 150, slab: 0, shard: 0 };   // slab/shard bounds depend on the object
function restBound(o) {
  if (o.k === 'plank') return REST_BOUND.plank;
  if (o.k === 'slab') return o.crack + SLAB_GONE + SLAB_REFORM + 4;
  return o.tell + 40 + SHARD_GONE + SHARD_REGROW + 4;
}

// Replay a track, then remove the players and measure how long each stateful object of the
// chunk takes to come back to rest after it was last loaded.
function restCheck(L, S, c, removeAt, inputs, out) {
  const objs = [];
  for (let i = c.o0; i < c.o1; i++) if (STATEFUL[L.objs[i].k]) objs.push(i);
  if (!objs.length) return;
  const last = new Map(), restAt = new Map(), offAt = new Map();
  for (let t = 0; t < removeAt + 900; t++) {
    if (t === removeAt) { park(S, 0); park(S, 1); }
    const inp = t < removeAt ? inputs(S.tick) : [0, 0];
    stepRunner(L, S, inp);
    for (const i of objs) {
      if (i < S.lo && !offAt.has(i)) offAt.set(i, S.tick);
      if (i < S.lo || i >= S.hi) continue;
      if (loaded(L, S, i)) { last.set(i, S.tick); restAt.delete(i); continue; }
      if (atRest(S.o[i], L.objs[i].k)) { if (!restAt.has(i)) restAt.set(i, S.tick); }
      else restAt.delete(i);
    }
    if (t > removeAt && objs.every(i => restAt.has(i) || i < S.lo || i >= S.hi)) break;
  }
  for (const i of objs) {
    const o = L.objs[i];
    if (!last.has(i)) continue;
    const rec = out[o.k] ||= { n: 0, max: 0, fail: 0, off: 0 };
    // scrolled off the left of the screen (and dropped from the state) while still moving
    if (!restAt.has(i) && offAt.has(i) && offAt.get(i) - last.get(i) < restBound(o)) { rec.off++; continue; }
    const r = restAt.has(i) ? restAt.get(i) - last.get(i) : Infinity;
    rec.n++; rec.max = Math.max(rec.max, r);
    if (r > restBound(o)) rec.fail++;
  }
}

// Everything a work unit of one seed needs: the course, chunk entry ticks and ghost snapshots.
function prepSeed(seed) {
  const L = buildRunner(seed);
  ensureGenerated(L, (TILES + 60) * TS);
  const chunks = L.chunks.filter(c => c.x1 <= TILES);
  // entry tick of each chunk: the view's left edge is BUF behind the start ledge
  const ghost = createRunnerState(L, { sandbox: true });
  park(ghost, 0); park(ghost, 1);
  const T = [];
  {
    const S = cloneRunner(ghost);
    let k = 0;
    while (k <= chunks.length) {
      const c = L.chunks[k];
      if (S.cam >= c.x0 * TS - BUF) { T[k] = S.tick; k++; continue; }
      stepRunner(L, S, [0, 0]);
    }
  }
  const need = new Set();
  for (let k = 0; k < chunks.length; k++) {
    need.add(T[k]);
    for (const d of [...DELTAS, 150]) if (T[k] - d >= COUNT_TICKS) need.add(T[k] - d);
  }
  const snap = new Map();
  {
    const S = cloneRunner(ghost);
    const last = Math.max(...need);
    while (S.tick <= last) { if (need.has(S.tick)) snap.set(S.tick, cloneRunner(S)); stepRunner(L, S, [0, 0]); }
  }
  return { L, chunks, ghost, T, snap };
}

function emptyRes(seed, chunks) {
  return { seed, chunks: 0, nChunks: chunks.length, first: 0, firstFail: [], second: 0, secondFail: [], parked: 0, parkedFail: [],
    lost: [], slack: [], kinds: {}, course: [], courseFail: [], rest: {}, abuse: {}, speed: 0, tMax: 0 };
}

// The whole course in one go, for one character: wait on a start ledge only when more than
// BUF_MAX ahead of the left edge, otherwise go straight on with whatever lead is left.
function checkCourse(seed, who) {
  const { L, chunks, ghost, T, snap } = prepSeed(seed);
  const capT = [];
  {
    const S = cloneRunner(ghost);
    let k = 0;
    while (k < chunks.length) {
      if (S.cam >= chunks[k].x0 * TS - BUF_MAX) { capT[k] = S.tick; k++; continue; }
      stepRunner(L, S, [0, 0]);
    }
  }
  const res = emptyRes(seed, chunks);
  {
    let S = createRunnerState(L, { sandbox: true });
    park(S, 1 - who);
    const run = { who, minLead: Infinity, fails: [] };
    for (let k = 0; k < chunks.length; k++) {
      const c = chunks[k], goal = L.chunks[k + 1].x0 * TS;
      const p = S.p[who];
      if (p.x + p.w < (c.x0 + c.run - 1) * TS) while (S.tick < capT[k]) tick(L, S, who, 0, null);
      const lead = p.x + p.w / 2 - S.cam;
      if (k > 0) run.minLead = Math.min(run.minLead, lead);
      const r = search(L, S, who, { goal, budget: BUDGET, o0: c.o0, o1: c.o1 });
      if (r.ok) { S = r.S; continue; }
      run.fails.push({ test: 'course', seed, k, kind: c.kind, x0: c.x0, who, lead: +(lead / TS).toFixed(1) });
      if (DUMP) writeFileSync(`${DUMP}/course-${seed}-${k}-${who}.json`, JSON.stringify(S));
      S = cloneRunner(snap.get(T[k + 1]) || snap.get(T[k]));   // carry on from the next chunk
      park(S, 1 - who);
      place(S, who, L.chunks[k + 1]);
    }
    res.course = [{ who, minLead: run.minLead }];
    res.courseFail = run.fails;
  }
  return res;
}

// Tests 2 to 6 for chunks [ka, kb) of one seed.
function checkChunks(seed, ka, kb) {
  const { L, chunks, T, snap } = prepSeed(seed);
  const res = emptyRes(seed, chunks);
  kb = Math.min(kb, chunks.length);
  res.chunks = Math.max(0, kb - ka);
  res.speed = speedAt(chunks[chunks.length - 1].x0 * TS); res.tMax = T[chunks.length - 1];
  for (let k = ka; k < kb; k++) {
    const c = chunks[k], next = L.chunks[k + 1];
    const goal = next.x0 * TS, Tk = T[k], Tn = T[k + 1];
    const kinfo = res.kinds[c.kind] ||= { n: 0, time: [0, 0], maxDiff: 0, minSlack: Infinity, v: 0 };
    kinfo.n++; kinfo.v = Math.max(kinfo.v, speedAt(next.x0 * TS));
    const plans = [];
    const times = [];
    for (const who of [0, 1]) {
      const S = cloneRunner(snap.get(Tk));
      place(S, who, c); park(S, 1 - who);
      let r = search(L, S, who, { goal, deadline: Tn, budget: BUDGET, o0: c.o0, o1: c.o1 });
      if (!r.ok) {   // slower than the scroll here: it must still be clearable alive
        const S2 = cloneRunner(snap.get(Tk)); place(S2, who, c); park(S2, 1 - who);
        r = search(L, S2, who, { goal, budget: BUDGET, o0: c.o0, o1: c.o1 });
      }
      res.first++;
      if (!r.ok) {
        res.firstFail.push({ test: 'chunk', seed, k, kind: c.kind, x0: c.x0, who, exp: r.exp });
        plans.push(null); times.push(null);
        continue;
      }
      plans.push(r.plan); times.push(r.tick - Tk);
      res.slack.push(Tn - r.tick);
      kinfo.minSlack = Math.min(kinfo.minSlack, Tn - r.tick);
      // back to rest after this run
      const S3 = cloneRunner(snap.get(Tk)); place(S3, who, c); park(S3, 1 - who);
      restCheck(L, S3, c, r.plan.length, (t) => { const a = [0, 0]; a[who] = r.plan[t - Tk] ?? 0; return a; }, res.rest);
    }
    if (times[0] != null && times[1] != null) {
      kinfo.time[0] += times[0]; kinfo.time[1] += times[1];
      kinfo.maxDiff = Math.max(kinfo.maxDiff, Math.abs(times[0] - times[1]));
    }
    if (V) console.log(`seed ${seed} #${k} ${c.kind}${c.intro ? '*' : ''} x${c.x0}-${c.x1} d${c.d.toFixed(2)} v${speedAt(goal).toFixed(2)}  sol ${times[0] ?? 'FAIL'}  luna ${times[1] ?? 'FAIL'}  (allowed ${Tn - Tk})`);

    let stateful = false;
    for (let i = c.o0; i < c.o1; i++) if (STATEFUL[L.objs[i].k]) stateful = true;
    if (!stateful) continue;

    // second arrival: `a` ran the chunk DELTA ticks earlier, `b` arrives at T_k with BUF
    for (const a of [0, 1]) {
      const b = 1 - a, planA = plans[a];
      if (!planA) continue;
      for (const d of DELTAS) {
        const t0 = Tk - d;
        if (!snap.has(t0)) continue;
        const S = cloneRunner(snap.get(t0));
        place(S, a, c); park(S, b);
        const other = (t) => planA[t - t0] ?? 0;
        while (S.tick < Tk) tick(L, S, b, 0, (t) => other(t));
        const touched = Array.from({ length: c.o1 - c.o0 }, (_, j) => c.o0 + j).some(i => STATEFUL[L.objs[i].k] && S.o[i] && !atRest(S.o[i], L.objs[i].k));
        place(S, b, c);
        const r = search(L, S, b, { goal, other, budget: BUDGET, o0: c.o0, o1: c.o1 });
        res.second++;
        if (!r.ok) res.secondFail.push({ seed, k, kind: c.kind, x0: c.x0, who: b, delta: d, touched });
        else res.lost.push(r.tick - Tn);
      }
      // parked partner on each plank: near end, middle, far end
      for (let i = c.o0; i < c.o1; i++) {
        const o = L.objs[i];
        if (o.k !== 'plank') continue;
        for (const tgt of [o.x + 14, o.px, o.x + o.w - 14]) {
          const t0 = Tk - 150;
          if (!snap.has(t0)) continue;
          const S = cloneRunner(snap.get(t0));
          place(S, a, c); park(S, b);
          const pa = search(L, S, a, { budget: BUDGET, o0: c.o0, o1: c.o1, until: (S2, p) => p.gr && oidObj(p.gref) === i && Math.abs(p.x + p.w / 2 - tgt) < 16 });
          if (!pa.ok) continue;
          const S2 = cloneRunner(snap.get(t0));
          place(S2, a, c); park(S2, b);
          const other = (t) => pa.plan[t - t0] ?? 0;
          while (S2.tick < Tk) tick(L, S2, b, 0, other);
          place(S2, b, c);
          const r = search(L, S2, b, { goal, other, budget: BUDGET, o0: c.o0, o1: c.o1 });
          res.parked++;
          if (!r.ok) res.parkedFail.push({ seed, k, kind: c.kind, x0: c.x0, who: b, at: Math.round((tgt - o.x) / TS) });
          else res.lost.push(r.tick - Tn);
        }
      }
    }
    // random abuse, then rest
    let rs = (seed * 7919 + k * 104729) >>> 0;
    const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
    for (let trial = 0; trial < 4; trial++) {
      const who = trial & 1;
      const S = cloneRunner(snap.get(Tk));
      place(S, who, c); park(S, 1 - who);
      const track = [];
      let bits = R_, hold = 0;
      for (let t = 0; t < 360; t++) {
        if (--hold <= 0) {
          const r = rnd();
          bits = r < 0.45 ? R_ : r < 0.6 ? R_ | U_ : r < 0.75 ? 0 : r < 0.85 ? L_ : r < 0.93 ? U_ : L_ | U_;
          hold = 3 + Math.floor(rnd() * 30);
        }
        track.push(bits);
      }
      restCheck(L, S, c, track.length, (t) => { const a = [0, 0]; a[who] = track[t - Tk] ?? 0; return a; }, res.abuse);
    }
  }
  return res;
}

function merge(all) {
  const tot = { course: [], courseFail: [], seeds: new Set(all.map(r => r.seed)).size, chunks: 0, first: 0, firstFail: [], second: 0, secondFail: [], parked: 0, parkedFail: [], lost: [], slack: [], kinds: {}, rest: {}, abuse: {}, speed: 0, tMax: 0 };
  for (const r of all) {
    tot.chunks += r.chunks; tot.first += r.first; tot.second += r.second; tot.parked += r.parked;
    tot.firstFail.push(...r.firstFail); tot.secondFail.push(...r.secondFail); tot.parkedFail.push(...r.parkedFail);
    tot.lost.push(...r.lost); tot.slack.push(...r.slack);
    tot.course.push(...r.course); tot.courseFail.push(...r.courseFail);
    tot.speed = Math.max(tot.speed, r.speed); tot.tMax = Math.max(tot.tMax, r.tMax);
    for (const [k, v] of Object.entries(r.kinds)) {
      const t = tot.kinds[k] ||= { n: 0, time: [0, 0], maxDiff: 0, minSlack: Infinity, v: 0 };
      t.n += v.n; t.time[0] += v.time[0]; t.time[1] += v.time[1]; t.maxDiff = Math.max(t.maxDiff, v.maxDiff);
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

function report(t, secs) {
  const ok = !t.courseFail.length && !t.firstFail.length && !t.secondFail.length && !t.parkedFail.length &&
    Object.values(t.rest).every(v => !v.fail) && Object.values(t.abuse).every(v => !v.fail);
  console.log(`\nRunner check: ${t.seeds} seeds, ${t.chunks} chunks to ${TILES} tiles (full difficulty at ${1100}), top scroll speed ${t.speed.toFixed(2)} px/tick, ${(t.tMax / 60).toFixed(0)} s in. ${secs.toFixed(0)} s.`);
  const leads = t.course.map(r => r.minLead / TS);
  console.log(`  whole course    ${t.course.length - new Set(t.courseFail.map(f => f.seed * 2 + f.who)).size}/${t.course.length} runs (Sol and Luna, every seed) reached ${TILES} tiles; smallest lead over the left edge at a chunk start: ${Math.min(...leads).toFixed(1)} tiles (median of per-run minimums ${pct(leads, 0.5).toFixed(1)})`);
  console.log(`  single chunk    ${t.first - t.firstFail.length}/${t.first} cleared alive from a ${BUF / TS}-tile lead; ${t.slack.filter(x => x < 0).length} of them slower than the scroll (repaid by later chunks)`);
  console.log(`  second arrival  ${t.second - t.secondFail.length}/${t.second} cleared`);
  console.log(`  parked partner  ${t.parked - t.parkedFail.length}/${t.parked} cleared`);
  console.log(`  spare time at a chunk's exit vs. the scroll (ticks): min ${Math.min(...t.slack)}, median ${pct(t.slack, 0.5)}`);
  console.log(`  time lost by second arrivals vs the deadline (ticks, + = later): median ${pct(t.lost, 0.5)}, 95% ${pct(t.lost, 0.95)}, max ${t.lost.length ? Math.max(...t.lost) : 0}`);
  console.log('  kind      chunks  sol avg  luna avg  max |sol-luna|  min spare  top speed');
  for (const [k, v] of Object.entries(t.kinds)) {
    console.log(`  ${k.padEnd(9)} ${String(v.n).padStart(6)}  ${(v.time[0] / v.n / 60).toFixed(2).padStart(6)}s  ${(v.time[1] / v.n / 60).toFixed(2).padStart(7)}s  ${String(v.maxDiff).padStart(10)} t  ${String(v.minSlack).padStart(7)} t  ${v.v.toFixed(2)}`);
  }
  for (const key of ['rest', 'abuse']) for (const [k, v] of Object.entries(t[key])) {
    console.log(`  ${key === 'rest' ? 'rest after a run' : 'rest after abuse'}  ${k.padEnd(6)} ${v.n} objects, slowest ${v.max} ticks after the last touch, over bound: ${v.fail}${v.off ? `, ${v.off} scrolled away first` : ''}`);
  }
  for (const f of [...t.courseFail, ...t.firstFail, ...t.secondFail, ...t.parkedFail].slice(0, 40)) console.log('  FAIL', JSON.stringify(f));
  console.log(ok ? '\nPASS' : '\nFAIL');
  return ok;
}

if (isMainThread) {
  const t0 = Date.now();
  const seeds = env.SEED ? env.SEED.split(',').map(Number)
    : Array.from({ length: SEED_RANGE[1] - SEED_RANGE[0] + 1 }, (_, i) => SEED_RANGE[0] + i);
  // work units: per seed, the two whole-course runs (the longest units, so they go first) and
  // the chunk tests split into PARTS ranges
  const units = [];
  if (COURSE) for (const seed of seeds) for (const who of [0, 1]) units.push({ seed, who });
  for (const seed of seeds) {
    if (CHUNKS) { units.push({ seed, ka: CHUNKS[0], kb: CHUNKS[1] + 1 }); continue; }
    for (let j = 0; j < PARTS; j++) units.push({ seed, part: j });
  }
  const results = [], bySeed = new Map();
  let next = 0, running = 0;
  await new Promise((resolve) => {
    const spawn = () => {
      while (running < JOBS && next < units.length) {
        const u = units[next++];
        running++;
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: u });
        const tu = Date.now();
        w.on('message', (r) => {
          results.push(r);
          const bad = [...r.courseFail, ...r.firstFail, ...r.secondFail, ...r.parkedFail];
          const what = u.who !== undefined ? `course ${u.who ? 'luna' : 'sol '}` : `chunks ${r.ka}-${r.kb - 1}`;
          console.log(`seed ${String(r.seed).padStart(3)} ${what}: ${r.chunks ? r.chunks + ' chunks, ' : ''}${r.first + r.second + r.parked} runs, ${bad.length ? bad.length + ' FAILED' : 'ok'}  (${((Date.now() - tu) / 1000).toFixed(0)} s)`);
          for (const f of bad) console.log('    fail', JSON.stringify(f));
          const n = (bySeed.get(r.seed) || 0) + 1; bySeed.set(r.seed, n);
        });
        w.on('error', (e) => { console.error('unit', JSON.stringify(u), e); results.push({ ...emptyRes(u.seed, []), crashed: true }); });
        w.on('exit', () => { running--; if (next >= units.length && !running) resolve(); else spawn(); });
      }
    };
    spawn();
  });
  const ok = report(merge(results), (Date.now() - t0) / 1000) && !results.some(r => r.crashed);
  process.exit(ok ? 0 : 1);
} else {
  const u = workerData;
  let r;
  if (u.who !== undefined) r = checkCourse(u.seed, u.who);
  else {
    let { ka, kb } = u;
    if (ka === undefined) {
      const L = buildRunner(u.seed);
      ensureGenerated(L, (TILES + 60) * TS);
      const n = L.chunks.filter(c => c.x1 <= TILES).length;
      ka = Math.floor(n * u.part / PARTS); kb = Math.floor(n * (u.part + 1) / PARTS);
    }
    r = checkChunks(u.seed, ka, kb);
    r.ka = ka; r.kb = Math.min(kb, ka + r.chunks);
  }
  parentPort.postMessage(r);
}
