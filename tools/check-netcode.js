// Online play over a realistic network: the real server, two clients running the real client
// sync code (public/js/runner-sync.js; SCHEME=old runs the pre-fix copies in net-old-clients.js),
// driven by bot input tracks that survive together for about 90 s (tools/net-bots.js).
//
//   node tools/check-netcode.js                       2D and 3D (3 seeds each), co-op (levels 1, 4, 10,
//                                                     22) and Dodgeball (3 seeds), pass or fail
//   KIND=3d SEEDS=1 node tools/check-netcode.js       one runner, one seed
//   SCHEME=old node tools/check-netcode.js            the baseline (no pass or fail)
//   CPU=10 node tools/check-netcode.js                server under a 10% CPU quota (systemd-run)
//   SERVER_ROOT=dir ...                                run the server from another checkout (the baseline)
//   JSON=out.json ...                                  also write every match as JSON
//   KIND=coop SEEDS=1,2 node tools/check-netcode.js   online co-op levels 1 and 2 with the recorded bot
//                                                     inputs (node tools/playtest/record-bot.mjs 1,2),
//                                                     pass or fail (see coopVerdict)
//   KIND=dodge SEEDS=1,2,3 node tools/check-netcode.js  Dodgeball, bots that throw and dodge, pass or fail
//   SCHEME=base ...                                    co-op and Dodgeball: the 4be5032 client (net-coop.js),
//                                                     with SERVER_ROOT set to a 4be5032 server for the baseline
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
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as R2 from '../shared/runner.js';
import * as R3 from '../shared/runner3d.js';
import { pairTracks } from './net-bots.js';
import { Old2D, Old3D, Coop } from './net-old-clients.js';
import { CoopClient } from './net-coop.js';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, IN_LEFT, IN_RIGHT, IN_UP, IN_ACT, SOL } from '../shared/sim.js';
import { COURT, DODGE, DP_PLAY, DP_OVER, B_LIVE, B_DEAD, B_REST, sideOf } from '../shared/dodge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const KINDS = (env.KIND || '2d,3d,coop,dodge').split(',');
const SEEDS = (env.SEEDS || '1,2,3').split(',').map(Number);
const COOP_LEVELS = (env.SEEDS || '1,4,10,22').split(',').map(Number);   // co-op: level numbers
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
  const p = spawn(cmd, argv, { cwd: env.SERVER_ROOT || ROOT, env: { ...env, PORT: String(port), LAG_MS: env.SERVER_LAG || '0', TEST_SEED: '1', NET_LOG: '1', NET_TRACE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d; if (buf.includes('listening')) resolve(p);
      for (const ln of String(d).split('\n')) if (ln.startsWith('net trace ')) addTrace(ln); else if (ln.startsWith('net ')) serverLog.push(ln);
    });
    p.on('exit', (c) => reject(new Error('server exited ' + c)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
}

// ---------------------------------------------------------------------------
// one client: socket over the modelled link, a 60 Hz frame loop, the sync code, a meter

const serverLog = [];   // the server's NET_LOG lines (input holds, skips, late keys per match)
// NET_TRACE: every key change the server applied, by room code: "round ch seq" -> the tick it was applied to
const traces = new Map();
function addTrace(ln) {
  const [, , code, round, ch, s, tick] = ln.trim().split(/\s+/);
  if (!traces.has(code)) traces.set(code, new Map());
  traces.get(code).set(`${round} ${ch} ${s}`, +tick);
}
// the server's input counters for a room: summed over its NET_LOG lines (one per level or match)
function roomStats(code) {
  const out = { waits: 0, waitMax: 0, held: 0, skipped: 0, late: 0, released: 0, trimmed: 0, drained: 0, dropped: 0 };
  for (const ln of serverLog) {
    if (!ln.startsWith(`net ${code} `)) continue;
    const w = /waited for late inputs (\d+) times \(longest (\d+) ticks\)/.exec(ln);
    if (w) { out.waits += +w[1]; out.waitMax = Math.max(out.waitMax, +w[2]); }
    for (const k of ['held', 'skipped', 'late', 'released', 'trimmed', 'drained', 'dropped']) for (const m of ln.matchAll(new RegExp(`${k} (\\d+)`, 'g'))) out[k] += +m[1];
  }
  return out;
}
// key changes the client sent against the ticks the server applied them to (after the first second;
// Dodgeball: only during play). moved: applied on another tick than the prediction did; dropped:
// never applied though the server went past them
function inputTicks(c, code) {
  const tr = traces.get(code) || new Map(), out = { changes: 0, moved: 0, dropped: 0, jumpsMoved: 0, actsMoved: 0 };
  for (const [round, intended, ack] of c.rounds) {
    let prev = 0;
    for (const [s, [tick, b, ph]] of intended) {
      const ch = b ^ prev; prev = b;
      if (!ch || tick < 60 || s > ack || (c.kind === 'dodge' && ph !== DP_PLAY)) continue;
      out.changes++;
      const at = tr.get(`${round} ${c.me} ${s}`);
      if (at === undefined) out.dropped++;
      else if (at !== tick) { out.moved++; if (ch & IN_UP) out.jumpsMoved++; if (ch & IN_ACT) out.actsMoved++; }
    }
  }
  return out;
}
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
    else if (m.t === 's' && c.sync) {
      meter.snap(m, performance.now());
      if (c.rounds.length) c.rounds[c.rounds.length - 1][2] = m.ack[c.me] | 0;
      c.sync.onSnapshot(m, performance.now());
    }
    (c.handlers[m.t] || []).forEach(f => f(m));
  }));
  c.on = (t, f) => (c.handlers[t] ||= []).push(f);
  c.open = new Promise((res) => ws.on('open', res));
  c.rounds = [];   // [server input round, intended ticks, last ack] per start (co-op and Dodgeball)
  c.begin = (m) => {
    if (kind === 'coop' || kind === 'dodge') {
      const L = kind === 'dodge' ? COURT : buildLevel(LEVELS[m.level], m.level);
      if (SCHEME === 'old') c.sync = new Coop(L, m.st, c.me, c.send, { neverKill: false });
      else c.sync = new CoopClient(L, m.st, c.me, c.send, { scheme: SCHEME === 'base' ? 'base' : 'new', onState: meter.state });
      c.rounds.push([c.rounds.length + 2, c.sync.intended || new Map(), 0]);
      meter.begin(c.me);
      if (!c.looping) { c.looping = true; c.loop(); }
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
      const bot = typeof c.track === 'function';   // Dodgeball: a bot that reads the screen, once per tick
      const readBits = bot ? () => c.track(c) : () => c.track[c.sync.predTick()] ?? 0;
      const n = c.sync.frame(dt, readBits, now);
      meter.frame(c.sync.draw(now), n, now, bot ? 0 : readBits());
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

// co-op: the recorded bot inputs of one level (they win it locally with no death), played by
// world tick: any input the server applies on another tick than the client meant shifts the
// plan. Measured per client: deaths and wins shown and then taken back (the death or win phase,
// then play again on the same attempt), own corrections, and the partner as drawn against the
// server's path (main.js draws them from the prediction, in the present). The server: won or
// not, deaths (attempts), its input counters, and key changes applied off their tick.
function coopMeter() {
  const M = { undoDead: 0, undoWon: 0, deadShown: 0, prev: null, srv: null, path: new Map(), samples: [], me: -1 };
  M.begin = (me) => { M.me = me; };
  M.state = null;
  M.frame = (d, n, now) => {
    const S = d.S, cur = { ph: S.phase, tries: S.tries };
    if (M.prev && M.prev.tries === cur.tries) {
      if (M.prev.ph === PH_DEAD_ && cur.ph === 0) M.undoDead++;
      if (M.prev.ph === 2 && cur.ph === 0) M.undoWon++;
    }
    if (cur.ph === PH_DEAD_ && (!M.prev || M.prev.ph !== PH_DEAD_)) M.deadShown++;
    M.prev = cur;
    const o = 1 - M.me;
    M.samples.push(d.v && S.phase === 0 && S.p[o].alive ? { t: now, T: d.T, tries: S.tries, pos: [d.v.p[o].x, d.v.p[o].y] } : null);
  };
  M.snap = (m) => {
    const st = m.st;
    M.srv = { phase: st.phase, tries: st.tries, tick: st.tick };
    M.path.set(st.tick, { tries: st.tries, ok: st.phase === 0, p: st.p.map(p => [p.x, p.y]), alive: st.p.map(p => p.alive),
      gref: st.p.map(p => (p.gr ? p.gref : -1)), push: st.p.map(p => p.push), pl: st.pl.map(q => [q.x, q.y]), b: st.b.map(q => [q.x, q.y]) });
  };
  M.at = (i, T, tries) => {
    const a = Math.floor(T);
    let lo = null, hi = null;
    for (let k = a; k >= a - 6; k--) if (M.path.has(k)) { lo = k; break; }
    for (let k = a + 1; k <= a + 7; k++) if (M.path.has(k)) { hi = k; break; }
    if (lo === null || hi === null) return null;
    const A = M.path.get(lo), B = M.path.get(hi);
    if (A.tries !== tries || B.tries !== tries || !A.ok || !B.ok || !A.alive[i] || !B.alive[i]) return null;
    const f = (T - lo) / (hi - lo);
    return A.p[i].map((v, j) => v + (B.p[i][j] - v) * f);
  };
  M.report = (corr) => {
    const o = 1 - M.me;
    let maxPop = 0, off = 0, n = 0, maxOff = 0, pops = 0, pops12 = 0;
    for (let k = 1; k < M.samples.length; k++) {
      const a = M.samples[k - 1], b = M.samples[k];
      if (!a || !b || a.tries !== b.tries) continue;
      const sa = M.at(o, a.T, a.tries), sb = M.at(o, b.T, b.tries);
      if (!sa || !sb) continue;
      if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) > 40) continue;   // a respawn or teleport
      n++;
      const w = Math.max(1, (b.t - a.t) / DT);
      const pop = Math.max(0, Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]) - Math.hypot(sb[0] - sa[0], sb[1] - sa[1])) / w;
      maxPop = Math.max(maxPop, pop);
      if (pop > 6) pops++;
      if (pop > 12) pops12++;
      const e = Math.hypot(b.pos[0] - sb[0], b.pos[1] - sb[1]);
      maxOff = Math.max(maxOff, e);
      if (e > 4) off++;
    }
    // what drawing the partner from snapshots about 150 ms in the past would cost: how often the
    // server has them standing on a lift, a crate or the other player that moves, or pushing a
    // crate, and how far that thing moves in 9 ticks (the gap between them and it on a screen
    // that draws the world in the present)
    const objAt = (E, ref) => (ref < 0 ? null : ref < 100 ? E.pl[ref] : ref < 200 ? E.b[ref - 100] : E.p[ref - 200]);
    let rideN = 0, ticksN = 0; const gaps = [];
    for (const [t, E] of M.path) {
      const F = M.path.get(t - 9) || M.path.get(t - 10) || M.path.get(t - 8);
      if (!F || !E.ok || !E.alive[o] || F.tries !== E.tries) continue;
      ticksN++;
      const ref = E.gref[o];
      const a = objAt(E, ref), b = objAt(F, ref);
      let gap = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
      if (E.push[o]) gap = Math.max(gap, Math.hypot(E.p[o][0] - F.p[o][0], E.p[o][1] - F.p[o][1]));   // the crate moves with them
      if (gap > 0.5) { rideN++; gaps.push(gap); }
    }
    gaps.sort((x, y) => x - y);
    const ride = { pct: ticksN ? +(100 * rideN / ticksN).toFixed(1) : 0, p50: +(gaps[gaps.length >> 1] || 0).toFixed(1), p95: +(gaps[Math.floor(gaps.length * 0.95)] || 0).toFixed(1), max: +(gaps[gaps.length - 1] || 0).toFixed(1) };
    return { frames: n, maxPop: +maxPop.toFixed(2), pops, pops12, ride, offPct: n ? +(100 * off / n).toFixed(1) : 0, maxOff: +maxOff.toFixed(1),
      corrMax: +corr.reduce((m, c) => Math.max(m, c[0]), 0).toFixed(2), corrN: corr.filter(c => c[0] > 0.5).length };
  };
  return M;
}

async function coopMatch(level, port) {
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, `tools/playtest/inputs/level-${level}.json`), 'utf8'));
  const bits = [];
  for (const [a, b, k] of rec.rle) for (let i = 0; i < k; i++) bits.push([a, b]);
  const tracks = [bits.map(x => x[0]), bits.map(x => x[1])];
  const meters = [coopMeter(), coopMeter()];
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
  await new Promise(r => setTimeout(r, 300));   // the server's NET_LOG line for a level not won comes on leave
  const srv = meters[0].srv;
  return { kind: 'coop', seed: level, scheme: SCHEME, wonLocal: rec.wonTick, server: { ...srv, won: srv?.phase === 2, deaths: srv?.tries ?? 0, input: roomStats(code) },
    clients: [A, B].map((c, i) => ({ who: c.me ? 'Luna' : 'Sol', undoDead: meters[i].undoDead, undoWon: meters[i].undoWon, deathsShown: meters[i].deadShown,
      ...meters[i].report(c.sync.corr || []), ticks: inputTicks(c, code), stalls: c.stalls, spikes: c.ln.spikes })) };
}

// Dodgeball: bots that read their own screen (the client's prediction). Holding the ball they
// walk a little, aim for a random time (or tap) and release; a live ball at them gets a random
// reaction (a jump, a jump back, a run back, or nothing) a random 0-11 ticks after they first
// see it; a ball loose on their side is fetched. The host sends a rematch after each match.
function dodgeBot(r, me) {
  const st = { plan: null, react: null };
  const back = me === SOL ? IN_LEFT : IN_RIGHT, fwd = me === SOL ? IN_RIGHT : IN_LEFT;
  return (c) => {
    const S = c.sync.S, D = S.d;
    if (!D || D.phase !== DP_PLAY) { st.plan = null; st.react = null; return 0; }
    const p = S.p[me], ball = D.ball;
    if (D.holder === me && D.wind === 0) {
      if (!st.plan) st.plan = { walk: r() < 0.5 ? back : fwd, wt: Math.floor(r() * 30), hold: r() < 0.3 ? 0 : Math.floor(r() * 80), t: 0 };
      const P = st.plan;
      P.t++;
      if (P.t <= P.wt) return P.walk;
      if (P.t <= P.wt + P.hold + 1) return IN_ACT;
      if (P.t > P.wt + P.hold + 60) st.plan = null;   // still holding long after the release: try again
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
      const cx = p.x + p.w / 2, up = ball.y < p.y - 8 ? IN_UP : 0;   // up on the platform: jump for it
      return (ball.x < cx - 4 ? IN_LEFT : ball.x > cx + 4 ? IN_RIGHT : 0) | up;
    }
    return 0;
  };
}

// The outcome of every throw: on the server (raw snapshots) and as first shown on each screen.
// A throw is settled when its ball is no longer live (and, on the thrower's screen, not stopped in
// the other player waiting for the server's word): a hit if the hit count went up since the throw.
function dodgeMeter() {
  const M = { me: -1, round: -1, srv: [], shown: [], srvD: null };
  const settle = (T, S) => {
    const D = S.d, n = D.throwN;
    if (!n) return;
    const e = T[n] ||= { hb: D.hitN, by: D.ball.by, hitN: null, launch: null };
    // where the throw left: its launch tick and its slope (the same on every screen that knows it)
    // (the slope at the launch: the ball gains DODGE.liveGrav of fall speed per tick of flight)
    if (!e.launch && D.ball.st === B_LIVE && !D.ball.bank) e.launch = `${S.tick - D.ball.t} ${(Math.round(1000 * (D.ball.vy - DODGE.liveGrav * D.ball.t) / D.ball.vx) / 1000 + 0).toFixed(3)}`;   // + 0: no -0
    if (e.hitN !== null) return;
    if (D.hitN > e.hb || (D.ball.st !== B_LIVE && D.ball.pv < 0 && D.wind === 0)) e.hitN = D.hitN;
  };
  M.begin = (me) => { M.me = me; M.round++; M.srv.push({}); M.shown.push({}); };
  M.snap = (m) => { M.srvD = { phase: m.st.d.phase, t: m.st.d.t, score: m.st.d.score.slice(), round: M.round, holder: m.st.d.holder, ball: [m.st.d.ball.st, Math.round(m.st.d.ball.x), Math.round(m.st.d.ball.y)], clock: m.st.d.clock, p: m.st.p.map(p => [Math.round(p.x), Math.round(p.y)]) }; settle(M.srv[M.round], m.st); };
  M.state = (S) => { if (M.round >= 0 && S.d) settle(M.shown[M.round], S); };
  M.frame = () => {};
  M.report = () => {
    const out = { throws: 0, hits: 0, ownHitUndone: 0, ownDodgeUndone: 0, thrDodgeUndone: 0, ownThrowMoved: 0 };
    M.srv.forEach((T, k) => {
      for (const [n, e] of Object.entries(T)) {
        if (e.hitN === null) continue;
        const hit = e.hitN > e.hb, sh = M.shown[k][n];
        out.throws++; if (hit) out.hits++;
        // the thrower's own screen launched it from another tick or at another angle than the server
        if (e.by === M.me && sh && sh.launch && e.launch && sh.launch !== e.launch) { out.ownThrowMoved++; if (V) console.log(`  throw ${k}/${n} by ${M.me}: shown ${sh.launch}, server ${e.launch}`); }
        if (!sh || sh.hitN === null) continue;
        const shownHit = sh.hitN > e.hb;
        if (shownHit === hit) continue;
        if (e.by !== M.me) { if (shownHit) out.ownHitUndone++; else out.ownDodgeUndone++; }
        else if (!shownHit) out.thrDodgeUndone++;
      }
    });
    return out;
  };
  return M;
}

async function dodgeMatch(seed, port) {
  const meters = [dodgeMeter(), dodgeMeter()];
  const A = makeClient('dodge', port, seed, 0, null, meters[0]);
  const B = makeClient('dodge', port, seed, 1, null, meters[1]);
  await Promise.all([A.open, B.open]);
  const room = new Promise((res) => A.on('room', (m) => { if (m.players.length === 1) res(m.code); }));
  A.send({ t: 'create', name: 'A' });
  const code = await room;
  const both = new Promise((res) => A.on('room', (m) => { if (m.players.length === 2) res(); }));
  B.send({ t: 'join', code, name: 'B' });
  await both;
  // each bot learns its character on its first tick (the guest's 'room' message can come late)
  const lazy = (c, k) => { let bot = null; return () => (bot ||= dodgeBot(rng(seed * 31 + k), c.me))(c); };
  A.track = lazy(A, 1); B.track = lazy(B, 2);
  A.send({ t: 'start', mode: 'dodge' });
  const t0 = performance.now();
  let asked = -1, matches = 0;
  await new Promise((res) => {
    const iv = setInterval(() => {
      const d = meters[0].srvD;
      if (d && d.phase === DP_OVER && d.t > 90 && asked !== d.round) { asked = d.round; matches++; A.send({ t: 'restart' }); }
      if (V && Math.round(performance.now() - t0) % 3000 < 100) console.log(`  dodge ${seed}: ${JSON.stringify(meters[0].srvD)}`);
      if (performance.now() - t0 > SECS * 1000) { clearInterval(iv); res(); }
    }, 100);
  });
  A.close(); B.close();
  await new Promise(r => setTimeout(r, 300));
  return { kind: 'dodge', seed, scheme: SCHEME, server: { matches, input: roomStats(code) },
    clients: [A, B].map((c, i) => ({ who: c.me ? 'Luna' : 'Sol', ...meters[i].report(), ticks: inputTicks(c, code), corrMax: +(c.sync.corr || []).reduce((m, x) => Math.max(m, x[0]), 0).toFixed(1), stalls: c.stalls, spikes: c.ln.spikes })) };
}

async function match(kind, seed, port) {
  if (kind === 'coop') return coopMatch(seed, port);
  if (kind === 'dodge') return dodgeMatch(seed, port);
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
  const inl = (i) => `server waited ${i.waits}x (longest ${i.waitMax} ticks), held ${i.held}, skipped ${i.skipped}, late ${i.late}, released ${i.released}, trimmed ${i.trimmed}, drained ${i.drained}, dropped ${i.dropped}`;
  const tk = (t) => `key changes ${t.changes}, off their tick ${t.moved} (jumps ${t.jumpsMoved}, throws ${t.actsMoved}), dropped ${t.dropped}`;
  if (r.kind === 'coop') return `coop level ${r.seed} [${r.scheme}]: server ${r.server.won ? 'won' : 'NOT won'}, ${r.server.deaths} deaths (tick ${r.server.tick}); ${inl(r.server.input)}\n` +
    r.clients.map(c => `    ${c.who.padEnd(4)}: deaths shown ${c.deathsShown}, taken back ${c.undoDead}; wins taken back ${c.undoWon}; ${tk(c.ticks)}; own corr max ${c.corrMax} px (${c.corrN} over 0.5); partner pop max ${c.maxPop} px/f (${c.pops} over 6), off>4 ${c.offPct}% (max ${c.maxOff}); stalls ${c.stalls} spikes ${c.spikes}`).join('\n');
  if (r.kind === 'dodge') return `dodge seed ${r.seed} [${r.scheme}]: ${r.server.matches} matches; ${inl(r.server.input)}\n` +
    r.clients.map(c => `    ${c.who.padEnd(4)}: throws ${c.throws} (hits ${c.hits}); on own screen: hit shown then undone ${c.ownHitUndone}, dodge shown then hit ${c.ownDodgeUndone}, own throw launched otherwise ${c.ownThrowMoved}; as thrower: miss shown then hit ${c.thrDodgeUndone}; ${tk(c.ticks)}; own corr max ${c.corrMax} px; stalls ${c.stalls} spikes ${c.spikes}`).join('\n');
  const s = r.server;
  const head = `${r.kind} seed ${r.seed} [${r.scheme}]: server ${s.phase === 2 ? `over at ${s.tick} (${['Sol', 'Luna', 'draw'][s.win] || '?'} wins${s.lostEarly ? `, ${s.dead.map((d, i) => d >= 0 ? ['Sol', 'Luna'][i] : null).filter(Boolean).join('+')} died before the plan's end ${r.planEnd}` : ''})` : `still running at ${s.tick}`}`;
  const u = TH[r.kind].unit;
  const rows = r.clients.map(c => `    ${c.who.padEnd(4)}: false deaths ${c.falseDeaths} (undone ${c.undo.dead[0] + c.undo.dead[1] + c.undo.over}, false cards ${c.falseResults}); remote step ${c.remote.maxStep}${u}/f pop ${c.remote.maxPop}${u} back ${c.remote.back}x max ${c.remote.maxBack}${u} off>${TH[r.kind].off} ${c.remote.offPct}% (max ${c.remote.maxOff}) drawn ${c.remote.lagMs} ms behind; ` +
    `local corr max ${c.local.corrMax}${u} back ${c.local.corrBackMax}${u} (${c.local.corrN} over ${TH[r.kind].corrBack}), drawn back ${c.local.drawnBack}x; snaps ${c.snaps.perSec}/s gap ${c.snaps.maxGapMs} ms, server ${c.snaps.ticksPerSec} ticks/s, client ${c.clientTicksPerSec}; stalls ${c.stalls} spikes ${c.spikes}; end ${c.endOk ? 'ok' : 'DIFFERS'}`);
  return [head, ...rows].join('\n');
}

// pass or fail (SCHEME=new)
function verdict(r) {
  if (r.kind === 'coop') {
    // co-op: the bots win as they do locally, no death, no input released, trimmed, dropped or
    // applied off its tick, nothing shown and taken back
    const bad = [], i = r.server.input;
    if (!r.server.won) bad.push('server: not won');
    if (r.server.deaths) bad.push(`server: ${r.server.deaths} deaths`);
    if (i.released || i.trimmed || i.dropped) bad.push(`server: inputs released ${i.released}, trimmed ${i.trimmed}, dropped ${i.dropped}`);
    for (const c of r.clients) {
      if (c.undoDead || c.undoWon) bad.push(`${c.who}: a death or win shown and taken back`);
      if (c.ticks.moved || c.ticks.dropped) bad.push(`${c.who}: ${c.ticks.moved} key changes off their tick, ${c.ticks.dropped} dropped`);
    }
    return bad;
  }
  if (r.kind === 'dodge') {
    // Dodgeball: nobody's own screen shows a hit or a dodge the server then contradicts; every
    // jump and throw lands on its tick
    const bad = [], i = r.server.input;
    if (i.released || i.trimmed || i.dropped) bad.push(`server: inputs released ${i.released}, trimmed ${i.trimmed}, dropped ${i.dropped}`);
    for (const c of r.clients) {
      if (c.ownHitUndone || c.ownDodgeUndone) bad.push(`${c.who}: own screen contradicted ${c.ownHitUndone + c.ownDodgeUndone}x`);
      // printed, not a failure: a throw's angle also counts from when you got the ball, which can
      // hang on the other player's late inputs (0 in about 1,500 throws with a clean harness, 1 in a
      // run with harness stalls; docs/netcode.md section 5)
      if (c.ownThrowMoved) console.log(`  note ${c.who}: ${c.ownThrowMoved} own throws launched on another tick or angle than shown`);
      if (c.ticks.moved || c.ticks.dropped) bad.push(`${c.who}: ${c.ticks.moved} key changes off their tick, ${c.ticks.dropped} dropped`);
      if (c.throws < 5) bad.push(`${c.who}: only ${c.throws} throws`);
    }
    return bad;
  }
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
for (const kind of KINDS) for (const seed of kind === 'coop' ? COOP_LEVELS : SEEDS) jobs.push([kind, seed]);
// co-op plays the recorded bot inputs: record the missing ones first
{
  const miss = [...new Set(jobs.filter(([k, n]) => k === 'coop' && !fs.existsSync(path.join(ROOT, `tools/playtest/inputs/level-${n}.json`))).map(([, n]) => n))];
  if (miss.length) { console.log(`recording bot inputs for levels ${miss.join(',')}`); execFileSync(process.execPath, ['tools/playtest/record-bot.mjs', miss.join(',')], { cwd: ROOT, stdio: 'ignore' }); }
}
// plan first (cached), so planning never stalls a running match
for (const [kind, seed] of jobs) if (kind !== 'coop' && kind !== 'dodge') pairTracks(kind, seed, 180 + SECS * 60, { log: V ? console.log : () => {} });
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
