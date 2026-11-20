// The online pause (docs/netcode.md, "Pause") in all four online modes: the real server and two
// clients running the real client code (runner-sync.js, the main.js model in net-coop.js, and
// net-pause.js), over the network model of tools/check-netcode.js. Pass or fail, exit 1 on a fail.
//
//   node tools/check-pause.js                 co-op, Dodgeball, 2D and 3D Runner (~2 min)
//   MODES=3d,coop PORT=3740 node tools/check-pause.js
//   NOPAUSE=1 MODES=2d ...                    the jittery Runner match without its pauses, to compare
//
// Per mode, one match on a clean link (40 ms each way, no jitter) with a fixed input track and
// two pauses: the host pauses and the guest resumes, then the guest pauses and the host resumes,
// each held for PAUSE_MS (3.2 s) of wall clock. It checks:
//   - the pause reaches both clients with who asked, and the server sends no snapshot and
//     steps no tick until the countdown ends (the tick in the countdown message is the
//     paused one, and the server's own log says it resumed on that tick);
//   - the first new tick comes RESUME_MS after the countdown began, not sooner;
//   - no catch-up: the ticks from just before the pause to 3 s after it match the wall clock
//     with the frozen time taken out (within 6 ticks), and the first second after the resume
//     has at most 64 ticks;
//   - determinism: every snapshot either client got equals, tick for tick, the same track
//     played straight through the sim with no pause and no network (co-op: a recorded bot
//     route; Runners: the planned bot routes of tools/net-bots.js; Dodgeball: a bot route
//     made here, still outside play so the server's queue drain between points moves
//     nothing). Dodgeball runs with DODGE_WINDUP=off: the wind-up follows the measured round
//     trip, which would make the state depend on the network.
// Runners, also over the jittery model of check-netcode.js (40 +-15 ms, spikes, client stalls):
// a match with two pauses passes check-netcode.js's own verdict (no false death, no "wins" taken
// back, the other player's pop and backward steps within its limits, your own player never
// drawn backward, nobody dies before the plan's end, both clients end as the server).
// Per mode, a player leaves while the room is paused: the other gets the peer-left message,
// a new player joins, and a new match runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { makeClient, makeMeter, startServer, serverLog, loadSync, verdict, line, TH, rng } from './check-netcode.js';
import { pairTracks } from './net-bots.js';
import { RESUME_MS } from '../public/js/net-pause.js';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, IN_LEFT, IN_RIGHT, IN_UP, IN_ACT, SOL } from '../shared/sim.js';
import { COURT, createDodge, stepDodge, dodgeViewFor, DP_PLAY, B_LIVE, B_DEAD, B_REST, sideOf } from '../shared/dodge.js';
import * as R2 from '../shared/runner.js';
import * as R3 from '../shared/runner3d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const MODES = (env.MODES || 'coop,dodge,2d,3d').split(',');
const PORT = +(env.PORT || 3741);
const PAUSE_MS = +(env.PAUSE_MS || 3200);
const DT = 1000 / 60;
const CLEAN = { base: 40, jit: 0, spike: 0, spikeMin: 0, spikeMax: 0, stall: 0, stallMin: 0, stallMax: 0 };
const NAME = ['Sol', 'Luna'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(cond, ms, what) {
  const t0 = performance.now();
  while (!cond()) { if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(5); }
}

let fails = 0, passes = 0;
function check(mode, name, ok, detail = '') {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'pass' : 'FAIL'} ${mode}: ${name}${detail ? ` (${detail})` : ''}`);
}

// ---------------------------------------------------------------------------
// fixed tracks and the reference: the same inputs played straight through the sim, no pause

const SEED = 1;
const PLAN = {   // server ticks: first pause, second pause, end of the match
  coop: [240, 600, 960], dodge: [300, 700, 1100], '2d': [420, 840, 1260], '3d': [420, 840, 1260],
};

// Dodgeball: the bot of check-netcode.js, reading the state itself. Zero outside play, so a
// drained input between points is one that changes nothing.
function dodgeBot(r, me) {
  const st = { plan: null, react: null };
  const back = me === SOL ? IN_LEFT : IN_RIGHT, fwd = me === SOL ? IN_RIGHT : IN_LEFT;
  return (S) => {
    const D = S.d;
    if (D.phase !== DP_PLAY) { st.plan = null; st.react = null; return 0; }
    const p = S.p[me], ball = D.ball;
    if (D.holder === me && D.wind === 0) {
      if (!st.plan) st.plan = { walk: r() < 0.5 ? back : fwd, wt: Math.floor(r() * 30), hold: r() < 0.3 ? 0 : Math.floor(r() * 80), t: 0 };
      const P = st.plan;
      P.t++;
      if (P.t <= P.wt) return P.walk;
      if (P.t <= P.wt + P.hold + 1) return IN_ACT;
      if (P.t > P.wt + P.hold + 60) st.plan = null;
      return 0;
    }
    if (D.holder !== me) st.plan = null;
    if (ball.st === B_LIVE && ball.by !== me) {
      if (!st.react || st.react.n !== D.throwN) st.react = { n: D.throwN, at: Math.floor(r() * 12), kind: Math.floor(r() * 4), t: 0 };
      const R = st.react;
      R.t++;
      return R.t > R.at ? [IN_UP, IN_UP | back, back, 0][R.kind] : 0;
    }
    if ((ball.st === B_DEAD || ball.st === B_REST) && sideOf(ball.x) === me) {
      const cx = p.x + p.w / 2, up = ball.y < p.y - 8 ? IN_UP : 0;
      return (ball.x < cx - 4 ? IN_LEFT : ball.x > cx + 4 ? IN_RIGHT : 0) | up;
    }
    return 0;
  };
}

// { tracks, start (the start message), ref: tick -> JSON of the state (dodge: [JSON, inputs]) }
function setup(kind, end) {
  const ref = new Map(), n = end + 120;
  if (kind === 'coop') {
    const lv = [1, 2, 3, 4, 5].find(k => JSON.parse(fs.readFileSync(path.join(ROOT, `tools/playtest/inputs/level-${k}.json`), 'utf8')).wonTick > n);
    const rec = JSON.parse(fs.readFileSync(path.join(ROOT, `tools/playtest/inputs/level-${lv}.json`), 'utf8'));
    const tracks = [[], []];
    for (const [a, b, k] of rec.rle) for (let i = 0; i < k; i++) { tracks[0].push(a); tracks[1].push(b); }
    const L = buildLevel(LEVELS[lv - 1], lv - 1), S = createState(L);
    ref.set(S.tick, JSON.stringify(S));
    for (let t = 0; t < n; t++) { step(L, S, [tracks[0][t] | 0, tracks[1][t] | 0]); ref.set(S.tick, JSON.stringify(S)); }
    return { tracks, start: { t: 'start', level: lv - 1 }, ref, what: `level ${lv}` };
  }
  if (kind === 'dodge') {
    const S = createDodge(SEED), bots = [dodgeBot(rng(101), 0), dodgeBot(rng(202), 1)], tracks = [[], []];
    for (let t = 0; t < n; t++) {
      const inp = [bots[0](S), bots[1](S)];
      tracks[0].push(inp[0]); tracks[1].push(inp[1]);
      stepDodge(COURT, S, inp);
      ref.set(S.tick, [JSON.stringify(S), inp]);
    }
    return { tracks, start: { t: 'start', mode: 'dodge', seed: SEED }, ref, what: `seed ${SEED}, ${S.d.throwN} throws, score ${S.d.score.join('-')}` };
  }
  const R = kind === '2d' ? R2 : R3;
  const plan = pairTracks(kind, SEED, 180 + 90 * 60);
  const L = (kind === '2d' ? R.buildRunner : R.buildRunner3d)(SEED), S = (kind === '2d' ? R.createRunnerState : R.createRunner3dState)(L);
  const stepR = kind === '2d' ? R.stepRunner : R.stepRunner3d;
  for (let t = 0; t < n; t++) { stepR(L, S, [plan.tracks[0][t] | 0, plan.tracks[1][t] | 0]); ref.set(S.tick, JSON.stringify(S)); }
  return { tracks: plan.tracks, start: { t: 'start', mode: TH[kind].mode, seed: SEED }, ref, what: `seed ${SEED}` };
}

// what a client got: snapshots (tick, arrival, the state as sent) and pause messages
function recorder() {
  const R = { me: -1, snaps: [], pauses: [], srv: null };
  R.begin = (me) => { R.me = me; };
  R.snap = (m, now) => { R.snaps.push({ t: now, tick: m.st.tick, st: JSON.stringify(m.st), inp: m.inp }); R.srv = { tick: m.st.tick, t: now }; };
  R.frame = () => {};
  R.state = () => {};
  return R;
}
const lastTick = (R) => (R.srv ? R.srv.tick : -1);

async function room(kind, cfgs, meters, tracks) {
  const A = makeClient(kind, PORT, SEED, 0, tracks[0], meters[0], cfgs[0]);
  const B = makeClient(kind, PORT, SEED, 1, tracks[1], meters[1], cfgs[1]);
  for (const [c, R] of [[A, meters[0]], [B, meters[1]]]) c.on('pause', (m) => (R.pauses ||= []).push({ ...m, t: performance.now() }));
  await Promise.all([A.open, B.open]);
  const made = new Promise((res) => A.on('room', (m) => { if (m.players.length === 1) res(m.code); }));
  A.send({ t: 'create', name: 'A' });
  const code = await made;
  const both = new Promise((res) => A.on('room', (m) => { if (m.players.length === 2) res(); }));
  B.send({ t: 'join', code, name: 'B' });
  await both;
  return { A, B, code };
}

// One pause: `who` pauses at server tick `at`, the other resumes PAUSE_MS later. Checks the
// freeze, the countdown and the catch-up, and returns what it measured.
async function onePause(mode, rec, P, R, at, label) {
  const [asker, resumer] = P, [Ra, Rb] = R;
  await waitFor(() => lastTick(Ra) >= at && lastTick(Rb) >= at, 60000, `tick ${at}`);
  const n0 = [Ra.pauses.length, Rb.pauses.length];
  const t0 = performance.now();
  const before = Ra.snaps[Ra.snaps.length - 1];
  asker.askPause(true);
  await waitFor(() => Ra.pauses.length > n0[0] && Rb.pauses.length > n0[1], 5000, 'the pause on both');
  const pa = [Ra.pauses[n0[0]], Rb.pauses[n0[1]]];
  check(mode, `${label}: the pause reaches both clients with who asked`, pa.every(p => p.st === 'paused' && p.by === asker.me),
    pa.map(p => `${p.st} by ${NAME[p.by]} at tick ${p.tick}`).join(', '));
  const Tf = pa[0].tick;
  await sleep(Math.max(0, PAUSE_MS - (performance.now() - t0)));
  const n1 = [Ra.pauses.length, Rb.pauses.length];
  resumer.askPause(false);
  await waitFor(() => Ra.pauses.length > n1[0] && Rb.pauses.length > n1[1], 5000, 'the countdown on both');
  const co = [Ra.pauses[n1[0]], Rb.pauses[n1[1]]];
  check(mode, `${label}: the other player resumes, the countdown reaches both`, co.every(c => c.st === 'count' && c.by === resumer.me && c.tick === Tf),
    co.map(c => `${c.st} by ${NAME[c.by]} at tick ${c.tick}, starts in ${c.ms} ms`).join(', '));
  // on each client, the first snapshot after the pause message is the first new tick
  await waitFor(() => [Ra, Rb].every((r, i) => r.snaps.some(x => x.t > co[i].t)), RESUME_MS + 5000, 'ticks after the resume');
  const firsts = [Ra, Rb].map((r, i) => r.snaps.find(x => x.t > pa[i].t));
  const quiet = firsts.map((x, i) => ({ frozenFor: x.t - pa[i].t, afterCount: x.t - co[i].t, first: x.tick }));
  check(mode, `${label}: no tick and no snapshot for at least 3 s of pause, on both`, quiet.every(q => q.frozenFor >= 3000 && q.first > Tf && q.first <= Tf + 2),
    quiet.map((q, i) => `${NAME[R[i].me]}: still for ${(q.frozenFor / 1000).toFixed(2)} s, next tick ${q.first}`).join('; '));
  check(mode, `${label}: the first new tick comes after the ${RESUME_MS} ms countdown`, quiet.every(q => q.afterCount >= RESUME_MS - 15),
    quiet.map((q, i) => `${NAME[R[i].me]} ${Math.round(q.afterCount)} ms`).join(', '));
  // the server's own account
  const log = serverLog.filter(l => l.startsWith(`net ${rec.code} `));
  const ps = log.filter(l => / pause by /.test(l)), rs = log.filter(l => / resume at /.test(l));
  const lp = ps[ps.length - 1] || '', lr = rs[rs.length - 1] || '';
  const mr = / resume at tick (\d+) after (\d+) ms frozen/.exec(lr);
  check(mode, `${label}: the server resumed on the tick it paused`, lp.includes(`by ${NAME[asker.me]} at tick ${Tf}`) && mr && +mr[1] === Tf && +mr[2] >= PAUSE_MS + RESUME_MS - 300,
    `${lp.slice(lp.indexOf('pause'))}; ${lr.slice(lr.indexOf('resume'))}`);
  // catch-up: from just before the pause to 3 s after the resume, against the wall clock
  await sleep(3100);
  const after = Ra.snaps.find(s => s.t >= firsts[0].t + 3000) || Ra.snaps[Ra.snaps.length - 1];
  const frozen = co[0].frozen - (rec.lastFrozen || 0); rec.lastFrozen = co[0].frozen;
  const expect = (after.t - before.t - frozen) / DT, got = after.tick - before.tick;
  const oneSec = (Ra.snaps.filter(s => s.t <= firsts[0].t + 1000).pop()?.tick ?? 0) - firsts[0].tick;
  check(mode, `${label}: no catch-up after the resume`, Math.abs(got - expect) <= 6 && oneSec <= 64,
    `${got} ticks in ${((after.t - before.t) / 1000).toFixed(2)} s with ${(frozen / 1000).toFixed(2)} s frozen, wall clock says ${expect.toFixed(1)}; first second after the resume ${oneSec} ticks`);
}

// a match with a fixed track and two pauses, compared with the reference tick for tick
async function pauseMatch(mode) {
  const [p1, p2, end] = PLAN[mode];
  const { tracks, start, ref, what } = setup(mode, end);
  const R = [recorder(), recorder()];
  const rec = await room(mode, [CLEAN, CLEAN], R, tracks);
  const { A, B } = rec;
  A.send(start);
  await onePause(mode, rec, [A, B], [R[0], R[1]], p1, 'host pauses');
  await onePause(mode, rec, [B, A], [R[1], R[0]], p2, 'guest pauses');
  await waitFor(() => lastTick(R[0]) >= end && lastTick(R[1]) >= end, 60000, `tick ${end}`);
  A.close(); B.close();
  // determinism: every snapshot against the same track with no pause
  let n = 0, bad = null, last = 0;
  for (const r of R) for (const s of r.snaps) {
    const want = ref.get(s.tick);
    if (want === undefined) continue;
    let w = want;
    if (mode === 'dodge') w = JSON.stringify(dodgeViewFor(JSON.parse(want[0]), want[1], r.me).st);
    n++; last = Math.max(last, s.tick);
    if (s.st !== w && !bad) bad = { who: NAME[r.me], tick: s.tick, diff: firstDiff(JSON.parse(s.st), JSON.parse(w)) };
  }
  check(mode, `the match with two pauses equals the same track with no pause, tick for tick (${what})`, !bad && n > 0 && last >= end,
    bad ? `${bad.who} differs first at tick ${bad.tick}: ${bad.diff}` : `${n} snapshots compared, to tick ${last}`);
}

function firstDiff(a, b, p = '') {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b ? null : `${p || 'state'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p ? `${p}.${k}` : k); if (d) return d; }
  return null;
}

// Runners over the jittery network model: two pauses mid-match, check-netcode.js's verdict
async function jitterMatch(kind) {
  const seed = 2, plan = pairTracks(kind, seed, 180 + 90 * 60);
  const meters = [makeMeter(kind), makeMeter(kind)];
  const A = makeClient(kind, PORT, seed, 0, plan.tracks[0], meters[0]);
  const B = makeClient(kind, PORT, seed, 1, plan.tracks[1], meters[1]);
  const pz = [[], []];
  A.on('pause', (m) => pz[0].push({ ...m, t: performance.now() })); B.on('pause', (m) => pz[1].push({ ...m, t: performance.now() }));
  await Promise.all([A.open, B.open]);
  const made = new Promise((res) => A.on('room', (m) => { if (m.players.length === 1) res(m.code); }));
  A.send({ t: 'create', name: 'A' });
  const code = await made;
  const both = new Promise((res) => A.on('room', (m) => { if (m.players.length === 2) res(); }));
  B.send({ t: 'join', code, name: 'B' });
  await both;
  A.send({ t: 'start', mode: TH[kind].mode, seed });
  const tick = () => meters[0].srv?.tick ?? -1;
  for (const [who, other, at] of env.NOPAUSE ? [] : [[A, B, 600], [B, A, 1200]]) {
    await waitFor(() => tick() >= at, 60000, `tick ${at}`);
    const k = [pz[0].length, pz[1].length];
    who.askPause(true);
    await waitFor(() => pz[0].length > k[0] && pz[1].length > k[1], 8000, 'the pause');
    await sleep(PAUSE_MS);
    other.askPause(false);
    await waitFor(() => pz[0].some(m => m.st === 'count') && pz[1].some(m => m.st === 'count'), 8000, 'the countdown');
  }
  await waitFor(() => tick() >= 1800, 60000, 'tick 1800');
  await sleep(2500);
  const final = meters[0].srv;
  A.close(); B.close();
  const r = { kind, seed, scheme: 'new', planEnd: plan.end, server: { tick: final.tick, phase: final.phase, dead: final.dead, win: final.win, lostEarly: final.phase === 2 && final.tick < plan.end },
    clients: [A, B].map((c, i) => ({ who: c.me ? 'Luna' : 'Sol', ...meters[i].report(final, c.sync.stats?.corr || []), stalls: c.stalls, spikes: c.ln.spikes,
      endOk: c.sync.draw(performance.now()).S.win === final.win })) };
  console.log(line(r).split('\n').map(l => '  ' + l).join('\n'));
  const bad = verdict(r);
  // the other player's playback tick per 1/60 s of frame time, from each pause to 3 s after
  // its countdown: it may run up to 10% fast to follow its clock, never jump (a jump moves the
  // drawing along the server's own path, which the pop count above can't see)
  const jumps = meters.map((M, i) => {
    const win = [];
    for (const m of pz[i]) if (m.st === 'paused') win.push([m.t, Infinity]); else if (m.st === 'count' && win.length) win[win.length - 1][1] = m.t + m.ms + 3000;
    let inW = 0, outW = 0, prev = null;
    const off = { in: [0, 0], out: [0, 0] }, o = 1 - M.me;   // frames over TH.off off the server's path, and frames
    for (const x of M.samples) {
      if (!x) continue;
      const at = M.at(o, x.T);
      if (at) { const k = win.some(([a, b]) => x.t >= a && x.t <= b) ? 'in' : 'out'; off[k][1]++; if (Math.hypot(...x.pos.map((v, j) => v - at[j])) > TH[kind].off) off[k][0]++; }
      if (prev && x.T !== undefined && prev.T !== undefined) {
        const r = (x.T - prev.T) / Math.max(1, (x.t - prev.t) / DT);
        if (win.some(([a, b]) => x.t >= a && x.t <= b)) inW = Math.max(inW, r); else outW = Math.max(outW, r);
      }
      prev = x;
    }
    return { inW, outW, off };
  });
  check(kind, 'the other player\'s playback goes on across each pause, no faster than its clock allows', jumps.every(j => j.inW <= 1.5),
    jumps.map((j, i) => `${r.clients[i].who}: at most ${j.inW.toFixed(2)} ticks per 1/60 s around the pauses, ${j.outW.toFixed(2)} elsewhere; drawn off the path ${pct(j.off.in)} of frames around the pauses, ${pct(j.off.out)} elsewhere`).join('; '));
  check(kind, 'two pauses mid-match over the jittery network: no false death, nothing taken back, no pop past check-netcode.js\'s limits', !bad.length && pz.every(p => p.filter(m => m.st === 'paused').length === 2 && p.filter(m => m.st === 'count').length === 2),
    bad.join('; ') || `pop ${r.clients.map(c => c.remote.maxPop).join(' / ')} ${TH[kind].unit} (limit ${TH[kind].pop}), ${r.clients.map(c => c.stalls + ' stalls ' + c.spikes + ' spikes').join(', ')}`);
}

const pct = ([a, n]) => `${n ? ((100 * a) / n).toFixed(1) : 0}%`;

// a player leaves while the room is paused; the other gets the peer-left message and can play on
async function leaveTest(mode, leaver) {
  const [p1] = PLAN[mode];
  const { tracks, start } = setup(mode, p1);
  const R = [recorder(), recorder()];
  const { A, B, code } = await room(mode, [CLEAN, CLEAN], R, tracks);
  const left = [false, false];
  A.on('peer-left', () => { left[0] = true; }); B.on('peer-left', () => { left[1] = true; });
  A.send(start);
  await waitFor(() => lastTick(R[0]) >= p1 / 2, 30000, 'play');
  const [X, Y] = leaver ? [B, A] : [A, B], Ry = leaver ? R[0] : R[1], iy = leaver ? 0 : 1;
  const k = Ry.pauses.length;
  X.askPause(true);
  await waitFor(() => Ry.pauses.length > k, 5000, 'the pause');
  X.close();
  let ok = true;
  try { await waitFor(() => left[iy], 5000, 'peer-left'); } catch { ok = false; }
  // a new player joins, the one left starts a new match, and it runs
  const C = makeClient(mode, PORT, SEED + 7, 2, tracks[1 - (Y === A ? 0 : 1)], recorder(), CLEAN);
  await C.open;
  const joined = new Promise((res) => Y.on('room', (m) => { if (m.players.length === 2) res(); }));
  C.send({ t: 'join', code, name: 'C' });
  await joined;
  const n0 = Ry.snaps.length;
  Y.send(start);
  await waitFor(() => Ry.snaps.length > n0, 5000, 'the new match');
  const t0 = performance.now(), s0 = Ry.snaps[Ry.snaps.length - 1].tick;
  await sleep(1500);
  const ran = lastTick(Ry) - s0, secs = (performance.now() - t0) / 1000;
  check(mode, `the ${leaver ? 'guest' : 'host'} leaves while paused: the other gets peer-left, a new player joins and the new match runs`, ok && Y.pz.st === 'run' && ran >= 60 * secs - 12,
    `peer-left ${left[iy] ? 'yes' : 'no'}, ${ran} ticks in ${secs.toFixed(2)} s`);
  Y.close(); C.close();
}

// ---------------------------------------------------------------------------

await loadSync();
console.log(`check-pause: port ${PORT}, modes ${MODES.join(',')}, pauses of ${PAUSE_MS} ms, countdown ${RESUME_MS} ms; load ${fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ')}`);
const srv = await startServer(PORT, { DODGE_WINDUP: 'off' });
const t0 = performance.now();
try {
  await Promise.all(MODES.map(m => pauseMatch(m).catch(e => check(m, 'pause match', false, e.message))));
  await Promise.all(MODES.filter(m => m === '2d' || m === '3d').map(m => jitterMatch(m).catch(e => check(m, 'jitter match', false, e.message))));
  await Promise.all(MODES.map((m, i) => leaveTest(m, i % 2).catch(e => check(m, 'leave while paused', false, e.message))));
} finally { srv.kill(); }
console.log(`${passes} passed, ${fails} failed in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails ? 1 : 0);
