// Online Runner over a realistic network: the real server, two clients running the real client
// sync code (public/js/runner-sync.js; SCHEME=old runs the pre-fix copies in net-old-clients.js),
// driven by bot input tracks that survive together for about 90 s (tools/net-bots.js).
//
//   node tools/check-netcode.js                       2D and 3D, 3 seeds each, pass or fail
//   KIND=3d SEEDS=1 node tools/check-netcode.js       one runner, one seed
//   SCHEME=old node tools/check-netcode.js            the baseline (no pass or fail)
//   CPU=10 node tools/check-netcode.js                server under a 10% CPU quota (systemd-run)
//   SERVER_ROOT=dir ...                                run the server from another checkout (the baseline)
//   JSON=out.json ...                                  also write every match as JSON
//   KIND=coop SEEDS=1,2 node tools/check-netcode.js   online co-op levels 1 and 2 with the recorded bot
//                                                     inputs (node tools/playtest/record-bot.mjs 1,2):
//                                                     counts deaths and wins shown and then taken back
//
// Network model, per client link (both directions): one-way delay BASE ms (40) plus uniform
// jitter of +-JIT ms (15) per message, delivered in order (TCP). Spikes: on average every SPIKE
// seconds (8) the link stalls for SPIKE_MIN..SPIKE_MAX ms (150..300): whatever is sent in that
// time arrives together at the end. Client stalls (a tab hiccup): on average every STALL seconds
// (20) the client's main thread stops for STALL_MIN..STALL_MAX ms (80..250): no frames, and
// messages wait. Frames run at 60 Hz on vsync like a browser. Protocol pings are answered by the
// client over the same delayed link, so the server measures the real round trip.
//
// Measured per client, over the whole match:
//   false deaths  times the client showed a player dead, or the match over, when the server had
//                 not (or not yet, at the moment shown). "undo" = it was shown and then taken back.
//   remote        the other player as drawn, each frame, against the server's own path at the
//                 tick the drawing stands for: largest step per frame (per 1/60 s), largest step
//                 beyond the server's own step over that frame ("pop", per 1/60 s), backward steps
//                 (per 1/60 s) while the
//                 server's player moved forward, share of frames more than OFF off the path, and
//                 how far behind your own present the other player is drawn.
//   local         corrections of your own player at each snapshot (largest, largest backward
//                 along the run), and backward steps of your drawn player while holding forward.
//   end           both clients show the server's winner and deaths.
//   server        snapshots per second, the longest gap between two, deaths the bot plan did not
//                 have (the server applied inputs differently from the client's prediction).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as R2 from '../shared/runner.js';
import * as R3 from '../shared/runner3d.js';
import { pairTracks } from './net-bots.js';
import { Old2D, Old3D, Coop } from './net-old-clients.js';
import { LEVELS } from '../shared/levels.js';
import { buildLevel } from '../shared/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const KINDS = (env.KIND || '2d,3d').split(',');
const SEEDS = (env.SEEDS || '1,2,3').split(',').map(Number);
const SCHEME = env.SCHEME || 'new';
const SECS = +(env.SECS || 90);
const NET = {
  base: +(env.BASE ?? 40), jit: +(env.JIT ?? 15),
  spike: +(env.SPIKE ?? 8), spikeMin: +(env.SPIKE_MIN ?? 150), spikeMax: +(env.SPIKE_MAX ?? 300),
  stall: +(env.STALL ?? 20), stallMin: +(env.STALL_MIN ?? 80), stallMax: +(env.STALL_MAX ?? 250),
};
const CPU = +(env.CPU || 0);
const PORT = +(env.PORT || 3500);
const CONC = +(env.CONC || 3);
const JSON_OUT = env.JSON || '';
const DT = 1000 / 60;
const V = !!env.V;
const PH_DEAD_ = 1;   // co-op death phase (shared/sim.js PH_DEAD)

// thresholds (2D in px, 3D in units; 1 unit = 24 px)
const TH = {
  '2d': { off: 4, back: 0.5, pop: 6, corrBack: 0.5, fwd: 'x', mode: 'runner', unit: 'px' },
  '3d': { off: 0.15, back: 0.02, pop: 0.25, corrBack: 0.02, fwd: 'z', mode: 'runner3d', unit: 'u' },
};
const SIM = {
  '2d': { build: R2.buildRunner, F: 2 /* IN_RIGHT */ },
  '3d': { build: R3.buildRunner3d, F: 8 /* IN_F */ },
};

// seeded random numbers, so a run can be repeated
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const expo = (r, mean) => -Math.log(1 - r()) * mean;
const uni = (r, a, b) => a + (b - a) * r();

// ---------------------------------------------------------------------------
// network

// In-order delivery: one queue per direction, drained by a single timer.
function pipe() {
  const q = []; let timer = null;
  const pump = () => {
    timer = null;
    while (q.length && q[0][0] <= performance.now() + 0.25) q.shift()[1]();
    if (q.length) timer = setTimeout(pump, Math.max(0, q[0][0] - performance.now()));
  };
  return (t, fn) => { q.push([t, fn]); if (!timer) timer = setTimeout(pump, Math.max(0, t - performance.now())); };
}

function link(r, cfg) {
  const L = { last: [0, 0], stallUntil: 0, spikes: 0, nextSpike: cfg.spike ? performance.now() + expo(r, cfg.spike * 1000) : Infinity, pipes: [pipe(), pipe()] };
  // dir 0 = client to server, 1 = server to client
  L.send = (dir, fn) => {
    const now = performance.now();
    while (now >= L.nextSpike) { L.stallUntil = Math.max(L.stallUntil, L.nextSpike + uni(r, cfg.spikeMin, cfg.spikeMax)); L.spikes++; L.nextSpike += expo(r, cfg.spike * 1000); }
    let t = now + cfg.base + (r() * 2 - 1) * cfg.jit;
    if (now < L.stallUntil) t = Math.max(t, L.stallUntil + cfg.base * (0.8 + 0.4 * r()));
    t = Math.max(t, L.last[dir]); L.last[dir] = t;
    L.pipes[dir](t, fn);
  };
  return L;
}

// ---------------------------------------------------------------------------
// server

function startServer(port) {
  const args = ['server/index.js'];
  const cmd = CPU ? 'systemd-run' : process.execPath;
  const argv = CPU ? ['--user', '--scope', '-q', '-p', `CPUQuota=${CPU}%`, '-p', 'CPUWeight=10000', process.execPath, ...args] : args;
  const p = spawn(cmd, argv, { cwd: env.SERVER_ROOT || ROOT, env: { ...env, PORT: String(port), LAG_MS: env.SERVER_LAG || '0', TEST_SEED: '1', NET_LOG: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d; if (buf.includes('listening')) resolve(p);
      for (const ln of String(d).split('\n')) if (ln.startsWith('net ')) serverLog.push(ln);
    });
    p.on('exit', (c) => reject(new Error('server exited ' + c)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
}

// ---------------------------------------------------------------------------
// one client: socket over the modelled link, a 60 Hz frame loop, the sync code, a meter

const serverLog = [];   // the server's NET_LOG lines (input holds, skips, late keys per match)
let Sync = null;   // public/js/runner-sync.js, loaded for SCHEME=new
async function loadSync() {
  if (SCHEME === 'old' || Sync) return;
  Sync = await import('../public/js/runner-sync.js');
}

function makeClient(kind, port, seed, idx, track, meter) {
  const r = rng(seed * 7919 + idx * 104729 + 13);
  const ln = link(r, NET);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { autoPong: false });
  const c = { kind, ws, ln, me: -1, sync: null, inbox: [], stallUntil: 0, stalls: 0, handlers: {}, closed: false, meter, track };
  c.nextStall = NET.stall ? performance.now() + expo(r, NET.stall * 1000) : Infinity;
  c.send = (m) => { const s = JSON.stringify(m); ln.send(0, () => { if (ws.readyState === 1) ws.send(s); }); };
  const deliver = (fn) => ln.send(1, () => { if (performance.now() < c.stallUntil) c.inbox.push(fn); else fn(); });
  ws.on('ping', (d) => deliver(() => { if (ws.readyState === 1) ws.pong(d); }));
  ws.on('message', (data) => deliver(() => {
    const m = JSON.parse(data);
    if (m.t === 'room') c.me = m.you;
    if (m.t === 'start') c.begin(m);
    else if (m.t === 's' && c.sync) { meter.snap(m, performance.now()); c.sync.onSnapshot(m, performance.now()); }
    (c.handlers[m.t] || []).forEach(f => f(m));
  }));
  c.on = (t, f) => (c.handlers[t] ||= []).push(f);
  c.open = new Promise((res) => ws.on('open', res));
  c.begin = (m) => {
    if (kind === 'coop') {
      c.sync = new Coop(buildLevel(LEVELS[m.level], m.level), m.st, c.me, c.send, { neverKill: SCHEME !== 'old' });
      meter.begin(c.me);
      c.loop();
      return;
    }
    const L = SIM[kind].build(m.seed);
    if (SCHEME === 'old') c.sync = new (kind === '2d' ? Old2D : Old3D)(L, m.st, c.me, c.send);
    else { c.sync = Sync.createSync(kind === '2d' ? Sync.SIM2D : Sync.SIM3D, { L, st: m.st, me: c.me, send: c.send, now: performance.now() }); c.sync.debug = V; }
    meter.begin(c.me);
    c.loop();
  };
  // vsync frames at 60 Hz; a stall stops frames and holds messages
  c.loop = () => {
    const t0 = performance.now();
    let last = t0;
    const go = () => {
      if (c.closed) return;
      let now = performance.now();
      if (now >= c.nextStall) { c.stallUntil = now + uni(r, NET.stallMin, NET.stallMax); c.nextStall = now + expo(r, NET.stall * 1000); c.stalls++; }
      if (now < c.stallUntil) { setTimeout(go, c.stallUntil - now); return; }
      while (c.inbox.length) c.inbox.shift()();
      now = performance.now();
      const dt = now - last; last = now;
      const readBits = () => track[c.sync.predTick()] ?? 0;
      const n = c.sync.frame(dt, readBits, now);
      meter.frame(c.sync.draw(now), n, now, readBits());
      const next = t0 + Math.ceil((performance.now() - t0 + 0.5) / DT) * DT;
      setTimeout(go, Math.max(0, next - performance.now()));
    };
    setTimeout(go, DT);
  };
  c.close = () => { c.closed = true; try { ws.close(); } catch {} };
  return c;
}

// ---------------------------------------------------------------------------
// measuring

function vec(kind, p) { return kind === '2d' ? [p.x, p.y] : [p.x, p.y, p.z]; }
const sub = (a, b) => a.map((v, i) => v - b[i]);
const len = (a) => Math.hypot(...a);

function makeMeter(kind) {
  const th = TH[kind], fi = kind === '2d' ? 0 : 2;
  const M = {
    kind, me: -1, path: new Map(), srv: null, frames: 0, ticks: 0, snaps: 0, firstSnap: null, lastSnapT: 0, maxGap: 0,
    shown: { dead: [false, false], over: false }, falseEp: { dead: [0, 0], over: 0, results: 0 }, undo: { dead: [0, 0], over: 0 },
    deathShows: [0, 0], wasFalse: { dead: [false, false], over: false, results: false },
    samples: [], local: [], frameLog: [],
  };
  M.begin = (me) => { M.me = me; };
  M.snap = (m, now) => {
    const st = m.st;
    M.snaps++;
    if (!M.firstSnap) M.firstSnap = { tick: st.tick, t: now };
    if (M.lastSnapT) M.maxGap = Math.max(M.maxGap, now - M.lastSnapT);
    M.lastSnapT = now;
    M.path.set(st.tick, { p: st.p.map(p => vec(kind, p)), alive: st.p.map(p => p.alive), phase: st.phase });
    M.srv = { tick: st.tick, phase: st.phase, dead: st.dead.slice(), win: st.win, t: now };
  };
  M.frame = (d, n, now, bits) => {
    M.frames++; M.ticks += n;
    const S = d.S, me = M.me, o = 1 - me;
    // what is shown: dead players and the end of the match
    for (const i of [0, 1]) {
      const dead = !S.p[i].alive;
      if (dead && !M.shown.dead[i]) M.deathShows[i]++;
      if (!dead && M.shown.dead[i]) M.undo.dead[i]++;
      M.shown.dead[i] = dead;
    }
    const over = S.phase === 2;
    if (!over && M.shown.over) M.undo.over++;
    M.shown.over = over;
    M.frameLog.push({ t: now, tick: S.tick, dead: [!S.p[0].alive, !S.p[1].alive], over, results: !!d.results });
    // the other player as drawn
    if (S.p[o].alive && S.phase === 1 && d.v) M.samples.push({ t: now, T: d.T, pos: vec(kind, d.v.p[o]), now: S.tick - 1 + (d.alpha ?? 1), dbg: d.dbg });
    else M.samples.push(null);
    // your own player as drawn, while holding forward
    if (S.p[me].alive && S.phase === 1 && d.v) M.local.push({ pos: vec(kind, d.v.p[me]), raw: vec(kind, d.me || S.p[me]), fwd: !!(bits & SIM[kind].F) });
    else M.local.push(null);
  };
  // the server's position of player i at a (fractional) tick, from the snapshots
  M.at = (i, T) => {
    const a = Math.floor(T);
    let lo = null, hi = null;
    for (let k = a; k >= a - 6; k--) if (M.path.has(k)) { lo = k; break; }
    for (let k = a + 1; k <= a + 7; k++) if (M.path.has(k)) { hi = k; break; }
    if (lo === null || hi === null) return null;
    const A = M.path.get(lo), B = M.path.get(hi);
    if (!A.alive[i] || !B.alive[i]) return null;
    const f = (T - lo) / (hi - lo);
    return A.p[i].map((v, j) => v + (B.p[i][j] - v) * f);
  };
  M.report = (final, corr) => {
    const me = M.me, o = 1 - me;
    // false deaths: shown dead (or over) at a moment the server had not reached that death
    const sDead = final.dead, sOver = final.phase === 2 ? Math.max(...final.dead.filter(t => t >= 0)) : -1;
    const fe = { dead: [0, 0], over: 0, results: 0 };
    const was = { dead: [false, false], over: false, results: false };
    for (const f of M.frameLog) {
      for (const i of [0, 1]) {
        const bad = f.dead[i] && (sDead[i] < 0 || sDead[i] > f.tick);
        if (bad && !was.dead[i]) fe.dead[i]++;
        was.dead[i] = bad;
      }
      const bo = f.over && (sOver < 0 || sOver > f.tick);
      if (bo && !was.over) fe.over++;
      was.over = bo;
      const br = f.results && final.phase !== 2;
      if (br && !was.results) fe.results++;
      was.results = br;
    }
    // the other player's drawn motion against the server's path
    let maxStep = 0, maxPop = 0, back = 0, maxBack = 0, off = 0, n = 0, maxOff = 0, lag = 0, lagN = 0;
    for (let k = 1; k < M.samples.length; k++) {
      const a = M.samples[k - 1], b = M.samples[k];
      if (!a || !b) continue;
      const sa = M.at(o, a.T), sb = M.at(o, b.T);
      if (!sa || !sb) continue;
      n++;
      const dd = sub(b.pos, a.pos), ds = sub(sb, sa);
      const w = Math.max(1, (b.t - a.t) / DT);
      maxStep = Math.max(maxStep, len(dd) / w);
      // a pop: the drawing moved further in one frame than the server's player did (a missed
      // jump while extending is an error of place, counted in "off", not a jolt)
      const pop = Math.max(0, len(dd) - len(ds)) / w;
      maxPop = Math.max(maxPop, pop);
      if (V && pop > th.pop) console.log(`  pop ${pop.toFixed(2)} at T ${b.T.toFixed(1)} dd ${dd.map(v => v.toFixed(2))} ds ${ds.map(v => v.toFixed(2))} ${JSON.stringify(b.dbg)} prev ${JSON.stringify(a.dbg)}`);
      if (dd[fi] / w < -th.back && ds[fi] >= -0.01) { back++; maxBack = Math.max(maxBack, -dd[fi]); if (V) console.log(`  back ${(-dd[fi]).toFixed(2)} at T ${b.T.toFixed(1)} ds ${ds[fi].toFixed(2)} ${JSON.stringify(b.dbg)}`); }
      const e = len(sub(b.pos, sb));
      maxOff = Math.max(maxOff, e);
      if (e > th.off) off++;
      lag += b.now - b.T; lagN++;
    }
    // your own player
    let lback = 0, lmax = 0;
    for (let k = 1; k < M.local.length; k++) {
      const a = M.local[k - 1], b = M.local[k];
      if (!a || !b || !b.fwd) continue;
      // backward on screen, more than the predicted player itself moved back (a tilt, a wall)
      const d = b.pos[fi] - a.pos[fi], dr = b.raw[fi] - a.raw[fi];
      if (d < -th.back && d - dr < -th.back) { lback++; lmax = Math.max(lmax, -d); if (V) console.log(`  own back ${(-d).toFixed(2)} (prediction ${dr.toFixed(2)}) at frame ${k}`); }
    }
    const cmax = corr.reduce((m, c) => Math.max(m, c[0]), 0), cback = corr.reduce((m, c) => Math.max(m, c[1]), 0);
    const cn = corr.filter(c => c[0] > th.corrBack).length;
    const secs = M.srv && M.firstSnap ? (M.srv.t - M.firstSnap.t) / 1000 : 0;
    return {
      falseDeaths: fe.dead[0] + fe.dead[1] + fe.over, falseDead: fe.dead, falseOver: fe.over, falseResults: fe.results,
      undo: { dead: M.undo.dead, over: M.undo.over }, deathShows: M.deathShows,
      remote: { frames: n, maxStep: +maxStep.toFixed(2), maxPop: +maxPop.toFixed(2), back, maxBack: +maxBack.toFixed(2), offPct: n ? +(100 * off / n).toFixed(1) : 0, maxOff: +maxOff.toFixed(2), lagMs: lagN ? Math.round(lag / lagN * DT) : 0 },
      local: { corrMax: +cmax.toFixed(2), corrBackMax: +Math.max(0, cback).toFixed(2), corrN: cn, drawnBack: lback, drawnBackMax: +lmax.toFixed(2) },
      clientTicksPerSec: secs ? +(M.ticks / secs).toFixed(1) : 0,
      snaps: { perSec: secs ? +(M.snaps / secs).toFixed(1) : 0, maxGapMs: Math.round(M.maxGap), ticksPerSec: secs ? +((M.srv.tick - M.firstSnap.tick) / secs).toFixed(1) : 0 },
      frames: M.frames,
    };
  };
  return M;
}

// ---------------------------------------------------------------------------
// one match

// co-op: the recorded bot inputs of one level; count deaths and wins shown and then taken back
// (the death or win phase, then play again on the same attempt)
async function coopMatch(level, port) {
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, `tools/playtest/inputs/level-${level}.json`), 'utf8'));
  const bits = [];
  for (const [a, b, k] of rec.rle) for (let i = 0; i < k; i++) bits.push([a, b]);
  const tracks = [bits.map(x => x[0]), bits.map(x => x[1])];
  const meters = [0, 1].map(() => {
    const M = { undoDead: 0, undoWon: 0, deadShown: 0, prev: null, srv: null, snap() {}, begin() {} };
    M.frame = (d) => {
      const S = d.S, cur = { ph: S.phase, tries: S.tries };
      if (M.prev && M.prev.tries === cur.tries) {
        if (M.prev.ph === PH_DEAD_ && cur.ph === 0) M.undoDead++;
        if (M.prev.ph === 2 && cur.ph === 0) M.undoWon++;
      }
      if (cur.ph === PH_DEAD_ && (!M.prev || M.prev.ph !== PH_DEAD_)) M.deadShown++;
      M.prev = cur;
    };
    M.snap = (m) => { M.srv = { phase: m.st.phase, tries: m.st.tries, tick: m.st.tick }; };
    return M;
  });
  const A = makeClient('coop', port, level, 0, tracks[0], meters[0]);
  const B = makeClient('coop', port, level, 1, tracks[1], meters[1]);
  await Promise.all([A.open, B.open]);
  const room = new Promise((res) => A.on('room', (m) => { if (m.players.length === 1) res(m.code); }));
  A.send({ t: 'create', name: 'A' });
  const code = await room;
  const both = new Promise((res) => A.on('room', (m) => { if (m.players.length === 2) res(); }));
  B.send({ t: 'join', code, name: 'B' });
  await both;
  A.send({ t: 'start', level: level - 1 });
  const t0 = performance.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      const s = meters[0].srv, el = performance.now() - t0;
      if ((s && s.phase === 2 && el > 3000) || el > (bits.length / 60 + 20) * 1000) { clearInterval(iv); setTimeout(res, 1500); }
    }, 100);
  });
  A.close(); B.close();
  return { kind: 'coop', seed: level, scheme: SCHEME, server: meters[0].srv, clients: [A, B].map((c, i) => ({ who: c.me ? 'Luna' : 'Sol', undoDead: meters[i].undoDead, undoWon: meters[i].undoWon, deathsShown: meters[i].deadShown, stalls: c.stalls, spikes: c.ln.spikes })) };
}

async function match(kind, seed, port) {
  if (kind === 'coop') return coopMatch(seed, port);
  const tEnd = 180 + SECS * 60;
  const plan = pairTracks(kind, seed, tEnd);
  const meters = [makeMeter(kind), makeMeter(kind)];
  // the host is Sol (track 0), the guest Luna (track 1)
  const A = makeClient(kind, port, seed, 0, plan.tracks[0], meters[0]);
  const B = makeClient(kind, port, seed, 1, plan.tracks[1], meters[1]);
  await Promise.all([A.open, B.open]);
  const room = new Promise((res) => A.on('room', (m) => { if (m.players.length === 1) res(m.code); }));
  A.send({ t: 'create', name: 'A' });
  const code = await room;
  const both = new Promise((res) => A.on('room', (m) => { if (m.players.length === 2) res(); }));
  B.send({ t: 'join', code, name: 'B' });
  await both;
  A.send({ t: 'start', mode: TH[kind].mode, seed });
  // run until the server ends the match (or the plan runs out), then 2.5 s more
  const t0 = performance.now();
  let endAt = 0;
  await new Promise((res) => {
    const iv = setInterval(() => {
      const s = meters[0].srv;
      if (!endAt && s && (s.phase === 2 || s.tick > plan.end + 90)) endAt = performance.now() + 2500;
      if ((endAt && performance.now() > endAt) || performance.now() - t0 > (SECS + 40) * 1000) { clearInterval(iv); res(); }
    }, 100);
  });
  const final = meters[0].srv;
  A.close(); B.close();
  const res = [A, B].map((c, i) => ({ who: c.me ? 'Luna' : 'Sol', ...meters[i].report(final, c.sync.corr || c.sync.stats?.corr || []), stalls: c.stalls, spikes: c.ln.spikes,
    endOk: !!c.sync && c.sync.draw(performance.now()).S.win === final.win }));
  return { kind, seed, scheme: SCHEME, planEnd: plan.end, server: { tick: final.tick, phase: final.phase, dead: final.dead, win: final.win, lostEarly: final.phase === 2 && final.tick < plan.end }, clients: res };
}

// ---------------------------------------------------------------------------

function line(r) {
  if (r.kind === 'coop') return `coop level ${r.seed} [${r.scheme}]: server ${r.server?.phase === 2 ? 'won' : 'not won'} (attempt ${r.server?.tries}, tick ${r.server?.tick})\n` +
    r.clients.map(c => `    ${c.who.padEnd(4)}: deaths shown ${c.deathsShown}, of them taken back ${c.undoDead}; wins taken back ${c.undoWon}; stalls ${c.stalls} spikes ${c.spikes}`).join('\n');
  const s = r.server;
  const head = `${r.kind} seed ${r.seed} [${r.scheme}]: server ${s.phase === 2 ? `over at ${s.tick} (${['Sol', 'Luna', 'draw'][s.win] || '?'} wins${s.lostEarly ? `, ${s.dead.map((d, i) => d >= 0 ? ['Sol', 'Luna'][i] : null).filter(Boolean).join('+')} died before the plan's end ${r.planEnd}` : ''})` : `still running at ${s.tick}`}`;
  const u = TH[r.kind].unit;
  const rows = r.clients.map(c => `    ${c.who.padEnd(4)}: false deaths ${c.falseDeaths} (undone ${c.undo.dead[0] + c.undo.dead[1] + c.undo.over}, false cards ${c.falseResults}); remote step ${c.remote.maxStep}${u}/f pop ${c.remote.maxPop}${u} back ${c.remote.back}x max ${c.remote.maxBack}${u} off>${TH[r.kind].off} ${c.remote.offPct}% (max ${c.remote.maxOff}) drawn ${c.remote.lagMs} ms behind; ` +
    `local corr max ${c.local.corrMax}${u} back ${c.local.corrBackMax}${u} (${c.local.corrN} over ${TH[r.kind].corrBack}), drawn back ${c.local.drawnBack}x; snaps ${c.snaps.perSec}/s gap ${c.snaps.maxGapMs} ms, server ${c.snaps.ticksPerSec} ticks/s, client ${c.clientTicksPerSec}; stalls ${c.stalls} spikes ${c.spikes}; end ${c.endOk ? 'ok' : 'DIFFERS'}`);
  return [head, ...rows].join('\n');
}

// pass or fail (SCHEME=new)
function verdict(r) {
  if (r.kind === 'coop') return r.clients.flatMap(c => (c.undoDead || c.undoWon ? [`${c.who}: a death or win shown and taken back`] : []));
  const th = TH[r.kind], bad = [];
  if (r.server.lostEarly) bad.push(`server: a player died before the plan's end (inputs applied off their tick)`);
  for (const c of r.clients) {
    if (c.falseDeaths || c.falseResults || c.undo.dead[0] || c.undo.dead[1] || c.undo.over) bad.push(`${c.who}: false deaths`);
    if (c.remote.maxPop > th.pop) bad.push(`${c.who}: remote pop ${c.remote.maxPop}`);
    if (c.remote.back > 0) bad.push(`${c.who}: remote stepped back ${c.remote.back}x`);
    if (c.local.drawnBack > 0) bad.push(`${c.who}: own player drawn backward ${c.local.drawnBack}x`);
    if (!c.endOk) bad.push(`${c.who}: end differs from server`);
  }
  return bad;
}

await loadSync();
// event-loop lag of this process (a blocked harness would look like network trouble)
const loopLag = { max: 0, over50: 0 };
{ let t = performance.now(); setInterval(() => { const n = performance.now(), d = n - t - 5; t = n; if (d > loopLag.max) loopLag.max = d; if (d > 50) { loopLag.over50++; if (env.LAGLOG) console.log(`loop lag ${Math.round(d)} ms at ${Math.round(n)}`); } }, 5).unref(); }
const srv = await startServer(PORT);
const tStart = performance.now();
const results = [];
const jobs = [];
for (const kind of KINDS) for (const seed of SEEDS) jobs.push([kind, seed]);
// plan first (cached), so planning never stalls a running match
for (const [kind, seed] of jobs) if (kind !== 'coop') pairTracks(kind, seed, 180 + SECS * 60, { log: V ? console.log : () => {} });
console.log(`check-netcode: scheme ${SCHEME}, one-way ${NET.base}±${NET.jit} ms, spikes every ~${NET.spike} s of ${NET.spikeMin}-${NET.spikeMax} ms, client stalls every ~${NET.stall} s of ${NET.stallMin}-${NET.stallMax} ms${CPU ? `, server CPU quota ${CPU}%` : ''}, ${SECS} s matches`);
let next = 0, fails = 0;
await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, async () => {
  while (next < jobs.length) {
    const [kind, seed] = jobs[next++];
    const r = await match(kind, seed, PORT);
    results.push(r);
    console.log(line(r));
    if (SCHEME !== 'old') {
      const bad = verdict(r);
      if (bad.length) { fails++; console.log(`FAIL ${bad.join('; ')}`); } else console.log('ok');
    }
  }
}));
// the server process's CPU time (it runs one room per match, CONC at a time)
try {
  const f = fs.readFileSync(`/proc/${srv.pid}/stat`, 'utf8').split(') ')[1].split(' ');
  const cpu = (+f[11] + +f[12]) / 100, wall = (performance.now() - tStart) / 1000;
  console.log(`server CPU: ${cpu.toFixed(1)} s in ${wall.toFixed(0)} s (${(100 * cpu / wall).toFixed(1)}% of one core) for ${jobs.length} matches, ${Math.min(CONC, jobs.length)} at a time`);
} catch {}
srv.kill();
if (V || env.NETLOG) for (const l of serverLog) console.log(l);
console.log(`harness event loop: longest delay ${Math.round(loopLag.max)} ms, ${loopLag.over50} over 50 ms`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
if (SCHEME !== 'old') console.log(fails ? `${fails} of ${jobs.length} matches FAILED` : `All ${jobs.length} matches passed.`);
process.exit(SCHEME !== 'old' && fails ? 1 : 0);
