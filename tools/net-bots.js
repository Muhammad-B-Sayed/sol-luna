// Bot input tracks for two players who run one Runner course together, for the netcode checks
// (tools/check-netcode.js). Each track is the input bits per tick (track[t] is applied on the
// step from tick t to t+1), planned with the real sims and the search bots.
//
//   node tools/net-bots.js 2d 5 [ticks]     plan (or load) seed 5 and print how long both survive
//
// How: plan Sol over the whole course alone, then Luna with Sol playing his track (so she meets
// the planks, slabs and shards in the state he leaves them). Then replay both together. If one
// of them dies (the other changed a part under them), replan that one from the start of the
// chunk where it happened, with the other's track playing, and replay again. Tracks are cached
// in tools/playtest/out/net-tracks/, keyed by the seed and a hash of the sim files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TS } from '../shared/sim.js';
import * as R2 from '../shared/runner.js';
import * as R3 from '../shared/runner3d.js';
import { search as search2 } from './runner-bot.js';
import { solve as solve3, sectionGoal, onRunup } from './runner3d-bot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools/playtest/out/net-tracks');

const park2 = (S, who) => { const p = S.p[who]; p.alive = false; p.x = -1e5; p.y = -1e5; p.gr = false; p.gref = -1; };
const park3 = (S, who) => { const p = S.p[who]; p.alive = false; p.z = -1e5; p.y = -1e5; p.gr = false; p.gref = -1; };

// One adapter per sim: what the planner needs to know about it.
export const SIMS = {
  '2d': {
    files: ['shared/sim.js', 'shared/runner.js', 'tools/runner-bot.js'],
    build: (seed) => R2.buildRunner(seed),
    create: (L) => R2.createRunnerState(L, { sandbox: true }),
    clone: R2.cloneRunner, step: R2.stepRunner, park: park2, count: R2.COUNT_TICKS,
    // chunk k is done when the player stands at or past the next chunk's start
    nChunks: (L, S) => { R2.ensureGenerated(L, S.cam + 4000); return L.chunks.length - 1; },
    wait: (L, S, who, k) => { const p = S.p[who], c = L.chunks[k]; return p.gr && p.x + p.w < (c.x0 + c.run - 1) * TS && p.x + p.w / 2 - S.cam > 18 * TS; },
    plan: (L, S, who, k, other) => {
      const c = L.chunks[k], goal = L.chunks[k + 1].x0 * TS;
      const o = { goal, other, budget: 2500, o0: c.o0, o1: c.o1 };
      let r = search2(L, R2.cloneRunner(S), who, o);
      if (!r.ok) r = search2(L, R2.cloneRunner(S), who, { ...o, budget: 10000 });
      return r;
    },
  },
  '3d': {
    files: ['shared/runner3d.js', 'tools/runner3d-bot.js'],
    build: (seed) => R3.buildRunner3d(seed),
    create: (L) => R3.createRunner3dState(L, { sandbox: true }),
    clone: R3.cloneRunner3d, step: R3.stepRunner3d, park: park3, count: R3.COUNT_TICKS,
    nChunks: (L, S) => { R3.ensureGenerated(L, S.zone + 200); return L.secs.length - 1; },
    wait: (L, S, who, k) => onRunup(L, k, S.p[who]) && S.p[who].z - S.zone > 18,
    plan: (L, S, who, k, other) => {
      const c = L.secs[k];
      return solve3(L, R3.cloneRunner3d(S), who, { until: sectionGoal(L, k + 1), other, budget: 1500, o0: c.o0, o1: c.o1 });
    },
  },
};

// Which chunk a player is in: the last one whose start is at or behind them.
function chunkOf(kind, L, p) {
  if (kind === '2d') { let k = 0; while (L.chunks[k + 1] && L.chunks[k + 1].x0 * TS <= p.x + 1) k++; return k; }
  let k = 0; while (L.secs[k + 1] && L.secs[k + 1].z0 <= p.z + 0.01) k++; return k;
}

// Plan `who` from state S (at tick S.tick) to tick tEnd, with the other player playing
// otherTrack (or parked if null). Returns { track (absolute ticks, earlier entries copied from
// base), starts: [[k, tick]], end: last planned tick }.
function planOne(kind, L, S0, who, otherTrack, base, tEnd) {
  const A = SIMS[kind];
  const S = A.clone(S0);
  const track = base.slice(0, S.tick);
  const starts = [];
  const other = otherTrack ? (t) => otherTrack[t] ?? 0 : null;
  const stepOne = (bits) => { const inp = [0, 0]; inp[who] = bits; inp[1 - who] = other ? other(S.tick) : 0; track[S.tick] = bits; A.step(L, S, inp); };
  while (S.tick < A.count) stepOne(0);
  let k = chunkOf(kind, L, S.p[who]);
  let cur = S;
  while (cur.tick < tEnd && cur.p[who].alive) {
    A.nChunks(L, cur);
    starts.push([k, cur.tick]);
    let w = 0;
    while (A.wait(L, cur, who, k) && w++ < 600) stepOne.call(null, 0);
    const r = A.plan(L, cur, who, k, other);
    if (!r.ok) break;
    for (let i = 0; i < r.plan.length; i++) track[cur.tick + i] = r.plan[i];
    // carry on from the end of the plan (replayed so `cur` stays the one state we step)
    const S2 = r.S;
    Object.keys(cur).forEach(key => delete cur[key]);
    Object.assign(cur, S2);
    k++;
  }
  return { track, starts, end: cur.tick };
}

// Replay both tracks together (sandbox: a death does not end it). First death: [who, tick] or null.
function replay(kind, L, tracks, tEnd, stopAt = Infinity) {
  const A = SIMS[kind];
  const S = A.create(L);
  while (S.tick < Math.min(tEnd, stopAt)) {
    A.step(L, S, [tracks[0][S.tick] ?? 0, tracks[1][S.tick] ?? 0]);
    for (const i of [0, 1]) if (!S.p[i].alive) return { S, death: [i, S.tick] };
  }
  return { S, death: null };
}

function hashFiles(files) {
  const h = crypto.createHash('sha1');
  for (const f of files) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 12);
}

// Two tracks that survive together to tEnd (or as far as the bots got): { tracks, end }.
export function pairTracks(kind, seed, tEnd, { log = () => {} } = {}) {
  const A = SIMS[kind];
  const key = `${kind}-${seed}-${tEnd}-${hashFiles(A.files)}`;
  const file = path.join(CACHE, key + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const L = A.build(seed);
  const S0 = A.create(L);
  const solo = A.clone(S0); A.park(solo, 1);
  const a = planOne(kind, L, solo, 0, null, [], tEnd);
  log(`  ${kind} seed ${seed}: Sol alone to tick ${a.end}`);
  const b = planOne(kind, L, S0, 1, a.track, [], Math.min(tEnd, a.end));
  log(`  ${kind} seed ${seed}: Luna with Sol to tick ${b.end}`);
  const plans = [a, b];
  let end = Math.min(a.end, b.end);
  for (let it = 0; it < 10; it++) {
    const { death } = replay(kind, L, [plans[0].track, plans[1].track], end);
    if (!death) break;
    const [who, td] = death;
    // replan the one who died from the last chunk start at least 30 ticks before the death
    const st = plans[who].starts.filter(([, t]) => t <= td - 30).pop() || plans[who].starts[0];
    log(`  ${kind} seed ${seed}: ${who ? 'Luna' : 'Sol'} dies at ${td} together; replanning from chunk ${st[0]} (tick ${st[1]})`);
    const { S } = replay(kind, L, [plans[0].track, plans[1].track], end, st[1]);
    const r = planOne(kind, L, S, who, plans[1 - who].track, plans[who].track, end);
    r.starts = plans[who].starts.filter(([, t]) => t < st[1]).concat(r.starts);
    plans[who] = r;
    end = Math.min(end, r.end);
  }
  const { death } = replay(kind, L, [plans[0].track, plans[1].track], end);
  if (death) end = death[1] - 1;
  const out = { kind, seed, end, tracks: plans.map(p => p.track.slice(0, end + 1).map(b => b | 0)) };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const kind = process.argv[2] || '2d', seed = +(process.argv[3] || 1), tEnd = +(process.argv[4] || 5580);
  const t = Date.now();
  const r = pairTracks(kind, seed, tEnd, { log: console.log });
  console.log(`${kind} seed ${seed}: both survive together to tick ${r.end} (${((r.end - 180) / 60).toFixed(1)} s of play) in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
