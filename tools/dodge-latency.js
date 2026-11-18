// How much harder is dodging online? Measures the dodge window of Dodgeball over a real network.
//
//   node tools/dodge-latency.js                       local + every latency (0 20 40 75 100 150 ms)
//   node tools/dodge-latency.js --lat 0,100 --conc 8  chosen one-way latencies, 8 rooms at a time
//   node tools/dodge-latency.js --local               the local (no network) numbers only
//   --port 3441   first port for the servers this starts (one per latency, port + i)
//   --out f.json  also write every trial as JSON
//   --maxr 30     sweep reactions up to 30 ticks online (default: local latest + 2)
//   --reps 3      repeat every trial (network timing jitters)
//
// Method (real server, modelled clients):
//   - For each latency it starts the real server (`node server/index.js`) with LAG_MS set, so the
//     server adds that one-way delay to every message in both directions.
//   - Each trial is a fresh room with two Node `ws` clients. The clients run the same prediction
//     and reconciliation as public/js/main.js (tickOnline / onSnapshot) at 60 Hz, stepping the
//     real shared/dodge.js. Only the drawing is left out.
//   - Scripted players: the thrower walks to a spot (their back wall, their spawn, or the net),
//     the defender walks to their back wall (or stays on their spawn), and the thrower taps a
//     flat throw. The defender jumps r ticks after the ball first shows up in flight on their
//     own client. The server's snapshots say whether it hit.
//   - Local play is the same scripted players on one shared state with no network.
//
// Reported per latency and spot:
//   seen      defender: ticks the ball is in flight on their screen before it reaches them
//             (first sight to contact, no dodge). Local: release to contact.
//   late      defender: ticks of flight already gone when the ball first appears
//   dodge     defender: the reactions that still dodge (r ticks after first sight), and the
//             latest as ms. A jump too early lands before the ball arrives, so it is a range.
//   thr seen  thrower: ticks they see their own ball fly before it reaches the defender
//   thr gap   thrower: on the thrower's screen, ticks from release to the defender's jump, for
//             the latest dodge (what the thrower sees as the defender's reaction)
//   phantom   thrower: dodges the thrower first saw as a hit (out of all dodges)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { COURT, createDodge, stepDodge, DP_PLAY, B_LIVE } from '../shared/dodge.js';
import { SOL, LUNA, IN_ACT } from '../shared/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const LATS = String(arg('lat', '0,20,40,75,100,150')).split(',').map(Number);
const CONC = +arg('conc', 8);
const PORT0 = +arg('port', 3441);
const OUT = arg('out', null);
const ONLY_LOCAL = process.argv.includes('--local');
const REPS = +arg('reps', 1);
const LEFT = 1, RIGHT = 2, JUMP = 4, DT = 1000 / 60;
const MS = (t) => Math.round(t * DT);

// spots: [name, thrower move, defender move]. 'back' = toward their own back wall, 'net' =
// toward the veil, '' = stay on the spawn.
const SPOTS = [
  ['back wall', 'back', 'back'],
  ['mid (spawn)', '', 'back'],
  ['near net', 'net', 'back'],
  ['spawn to spawn', '', ''],
];
const moveBits = (who, where) => (where === 'back' ? (who === SOL ? LEFT : RIGHT) : where === 'net' ? (who === SOL ? RIGHT : LEFT) : 0);

// A scripted player. decide(S, n) is called once per tick with the state the player sees.
function bot(me, role, spot, react) {
  const [, tMove, dMove] = spot;
  const st = { n: 0, fs: -1, fsT: 0, hitSeen: -1, rel: -1, jumpSeen: -1, sawHit: false, jump0: -1 };
  st.decide = (S) => {
    const n = st.n++, D = S.d, other = 1 - me;
    if (st.jump0 < 0) st.jump0 = S.p[other].jumpN;
    if (role === 'T') {
      if (st.rel >= 0 && D.hitN > 0) { st.sawHit = true; if (st.hitSeen < 0) st.hitSeen = n; }
      if (st.rel >= 0 && st.jumpSeen < 0 && S.p[other].jumpN > st.jump0) st.jumpSeen = n;
      if (st.rel < 0 && D.throwN > 0) st.rel = n;     // first tick that sees its own ball in flight
      if (n < 100) return moveBits(me, tMove);
      if (n >= 130 && D.phase === DP_PLAY && D.holder === me && D.throwN === 0 && !st.tapped) { st.tapped = true; return IN_ACT; }
      return 0;
    }
    // defender
    const live = D.ball.st === B_LIVE && D.ball.by === other;
    if (st.fs < 0 && live) { st.fs = n; st.fsT = D.ball.t; }
    if (st.fs >= 0 && D.hitN > 0 && st.hitSeen < 0) st.hitSeen = n;
    if (st.fs >= 0 && react > 0 && n >= st.fs + react - 1) return JUMP;
    return n < 100 ? moveBits(me, dMove) : 0;
  };
  return st;
}

// ---------------------------------------------------------------------------
// local: both players on one state

function localTrial(spot, react, serve) {
  // pick a seed whose first serve is `serve`
  let seed = 1; while (createDodge(seed).d.serve !== serve) seed++;
  const S = createDodge(seed);
  const T = bot(serve, 'T', spot, 0), Dd = bot(1 - serve, 'D', spot, react);
  for (let i = 0; i < 600; i++) {
    const inp = [0, 0];
    inp[serve] = T.decide(S); inp[1 - serve] = Dd.decide(S);
    stepDodge(COURT, S, inp);
    if (S.d.throwN > 0 && (S.d.ball.st !== B_LIVE || S.d.phase !== DP_PLAY)) {
      T.decide(S); Dd.decide(S);   // let both see the outcome
      return summarize(T, Dd, S.d.hitN > 0);
    }
  }
  return null;
}

function summarize(T, Dd, hit) {
  return {
    hit,
    seen: Dd.fs >= 0 && Dd.hitSeen >= 0 ? Dd.hitSeen - Dd.fs : null,
    late: Dd.fs >= 0 ? Dd.fsT - 1 : null,
    thrSeen: T.rel >= 0 && T.hitSeen >= 0 ? T.hitSeen - T.rel : null,
    thrGap: T.rel >= 0 && T.jumpSeen >= 0 ? T.jumpSeen - T.rel : null,
    phantom: !hit && T.sawHit,
  };
}

// ---------------------------------------------------------------------------
// online: two ws clients that predict like main.js

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, me: -1, S: null, seq: 0, pending: [], remoteBits: 0, snap: null, lastSnap: 0, handlers: {} };
  c.send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    if (m.t === 'room') c.me = m.you;
    if (m.t === 'start') { c.S = m.st; c.seq = 0; c.pending = []; c.remoteBits = 0; }
    if (m.t === 's' && c.S) onSnapshot(c, m);
    (c.handlers[m.t] || []).forEach(f => f(m));
  });
  c.open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  c.once = (t) => new Promise(res => { (c.handlers[t] ||= []).push(res); });
  return c;
}

function onSnapshot(c, m) {   // public/js/main.js onSnapshot, state part only
  const ns = m.st;
  c.remoteBits = m.inp[1 - c.me] | 0;
  const myAck = m.ack[c.me] | 0;
  c.pending = c.pending.filter(([s]) => s > myAck);
  const inp = [0, 0];
  for (const [, b] of c.pending) { inp[c.me] = b; inp[1 - c.me] = c.remoteBits; stepDodge(COURT, ns, inp); }
  c.S = ns;
  c.snap = m.st.d; c.lastSnap = m.st.tick;
}

function tickClient(c) {      // public/js/main.js tickOnline
  const bits = c.bot.decide(c.S);
  c.seq++;
  c.send({ t: 'i', s: c.seq, b: bits });
  c.pending.push([c.seq, bits]);
  if (c.pending.length > 240) c.pending.shift();
  const inp = [0, 0];
  inp[c.me] = bits; inp[1 - c.me] = c.remoteBits;
  stepDodge(COURT, c.S, inp);
}

// one global 60 Hz clock for every client (like requestAnimationFrame on a 60 Hz screen)
const live = new Set();
let last = performance.now(), acc = 0;
const clock = setInterval(() => {
  const now = performance.now();
  acc += now - last; last = now;
  if (acc > 250) acc = DT;
  while (acc >= DT) { acc -= DT; for (const c of live) if (c.S && c.bot) tickClient(c); }
}, 1);
clock.unref();

async function onlineTrial(port, spot, react) {
  const A = client(port), B = client(port);
  await A.open; await B.open;
  A.send({ t: 'create', name: 'A' });
  const room = await A.once('room');
  B.send({ t: 'join', code: room.code, name: 'B' });
  await A.once('room');
  const started = Promise.all([A.once('start'), B.once('start')]);
  A.send({ t: 'start', mode: 'dodge' });
  const [m] = await started;
  const serve = m.st.d.serve;
  const [T, Dd] = A.me === serve ? [A, B] : [B, A];
  T.bot = bot(T.me, 'T', spot, 0); Dd.bot = bot(Dd.me, 'D', spot, react);
  live.add(T); live.add(Dd);
  const t0 = Date.now();
  let res = null;
  while (Date.now() - t0 < 8000) {
    await new Promise(r => setTimeout(r, 20));
    const d = A.snap;
    if (d && d.throwN > 0 && (d.ball.st !== B_LIVE || d.phase !== DP_PLAY)) {
      await new Promise(r => setTimeout(r, 200));    // let both clients see the outcome
      res = summarize(T.bot, Dd.bot, d.hitN > 0);
      break;
    }
  }
  live.delete(T); live.delete(Dd);
  A.send({ t: 'leave' }); B.send({ t: 'leave' });
  A.ws.close(); B.ws.close();
  return res;
}

// ---------------------------------------------------------------------------

async function runServer(port, lag) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(port), LAG_MS: String(lag) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => {
    p.stdout.on('data', (b) => { if (String(b).includes('listening')) res(); });
    p.on('exit', (code) => rej(new Error('server exited ' + code)));
  });
  return p;
}

async function pool(jobs, n) {
  const out = new Array(jobs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } }));
  return out;
}

// Sweep reactions 1..maxR (plus a no-dodge run) for every spot; returns rows.
async function measure(label, trial, maxR) {
  const rows = [];
  for (const spot of SPOTS) {
    const jobs = [];
    for (let rep = 0; rep < REPS; rep++) for (let r = 0; r <= maxR[spot[0]]; r++) jobs.push(async () => ({ r, rep, ...(await trial(spot, r)) }));
    rows.push({ spot: spot[0], trials: await pool(jobs, CONC) });
  }
  return { label, rows };
}

function report({ label, rows }) {
  const lines = [];
  for (const { spot, trials } of rows) {
    const ok = trials.filter(t => t && t.hit != null);
    const base = ok.filter(t => t.r === 0);
    const med = (a) => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const seen = med(base.map(t => t.seen)), late = med(ok.map(t => t.late)), thrSeen = med(base.map(t => t.thrSeen));
    const dodges = ok.filter(t => t.r > 0 && !t.hit);
    const rs = [...new Set(dodges.map(t => t.r))].sort((a, b) => a - b);
    const maxR = rs.length ? rs[rs.length - 1] : 0;
    const latest = dodges.filter(t => t.r === maxR);
    const gap = med(latest.map(t => t.thrGap));
    const phantom = dodges.filter(t => t.phantom).length;
    const holes = rs.length ? Array.from({ length: maxR - rs[0] + 1 }, (_, i) => rs[0] + i).filter(r => !rs.includes(r)) : [];
    lines.push({ label, spot, seen, late, dodge: rs.length ? `r ${rs[0]}-${maxR}${holes.length ? ` (not ${holes.join(',')})` : ''}` : 'none', latestMs: rs.length ? MS(maxR) : 0,
      thrSeen, thrGap: gap, phantom: `${phantom}/${dodges.length}`, failed: trials.length - ok.length });
  }
  return lines;
}

function printTable(lines) {
  const cols = [['label', 8], ['spot', 15], ['seen', 5], ['late', 5], ['dodge', 16], ['latestMs', 9], ['thrSeen', 8], ['thrGap', 7], ['phantom', 8]];
  const head = { label: 'latency', spot: 'spot', seen: 'seen', late: 'late', dodge: 'dodge r', latestMs: 'latest', thrSeen: 'thr seen', thrGap: 'thr gap', phantom: 'phantom' };
  const fmt = (o) => cols.map(([k, w]) => String(o[k] ?? '-').padEnd(w)).join(' ');
  console.log(fmt(head));
  for (const l of lines) console.log(fmt({ ...l, latestMs: l.latestMs + ' ms' }) + (l.failed ? `  (${l.failed} trials failed)` : ''));
}

const all = [];
// local first: it also sets how far each spot's online sweep needs to go
const local = await measure('local', async (spot, r) => localTrial(spot, r, SOL), Object.fromEntries(SPOTS.map(s => [s[0], 45])));
const localLines = report(local);
all.push(...localLines);
const MAXR = arg('maxr', null);   // default: the local latest dodge + 2 (online never beats local)
const maxR = Object.fromEntries(localLines.map(l => [l.spot, MAXR ? +MAXR : Math.min(45, Math.round(l.latestMs / DT) + 2)]));
if (!ONLY_LOCAL) {
  for (const [i, lag] of LATS.entries()) {
    const port = PORT0 + i;
    const srv = await runServer(port, lag);
    try {
      const res = await measure(`${lag} ms`, (spot, r) => onlineTrial(port, spot, r), maxR);
      const lines = report(res);
      all.push(...lines);
      if (OUT) fs.writeFileSync(OUT, JSON.stringify({ lines: all, raw: res }, null, 1));
      console.error(`done ${lag} ms`);
    } finally { srv.kill(); }
  }
}
printTable(all);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ lines: all }, null, 1));
process.exit(0);
