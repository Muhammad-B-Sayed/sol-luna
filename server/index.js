// Sol & Luna — static file server + authoritative multiplayer rooms (WebSocket).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON } from '../shared/sim.js';
import { COURT, DODGE, createDodge, stepDodge, windupFor, DP_READY, DP_POINT, DP_OVER, dodgeViewFor } from '../shared/dodge.js';
import { buildRunner, createRunnerState, stepRunner, newSeed } from '../shared/runner.js';
import { buildRunner3d, createRunner3dState, stepRunner3d } from '../shared/runner3d.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const PORT = process.env.PORT || 3000;

const BUILT = LEVELS.map((raw, i) => buildLevel(raw, i));

// ---------------------------------------------------------------------------
// Static files

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (p === '/' || /^\/[A-Z0-9]{5}$/i.test(p)) p = '/index.html'; // /CODE deep links open the game
  let base = PUBLIC;
  if (p.startsWith('/shared/')) { base = SHARED; p = p.slice('/shared'.length); }
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  serveFile(res, file);
});

// ---------------------------------------------------------------------------
// Rooms

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

// Optional artificial one-way latency for testing netcode: LAG_MS=80 npm start. LAG_JITTER=15
// adds up to +-15 ms per message, and LAG_SPIKE=8 stalls a socket for 150-300 ms about every
// 8 s (both directions). Messages stay in order, as over TCP (docs/netcode.md).
const LAG = +(process.env.LAG_MS || 0), LAG_JITTER = +(process.env.LAG_JITTER || 0), LAG_SPIKE = +(process.env.LAG_SPIKE || 0);
const raw = (ws, s) => { if (ws.readyState === 1) ws.send(s); };
function lagged(ws, dir, fn) {
  const now = performance.now();
  if (LAG_SPIKE) {
    ws.spikeNext ??= now - Math.log(1 - Math.random()) * LAG_SPIKE * 1000;
    if (now >= ws.spikeNext) { ws.spikeUntil = now + 150 + Math.random() * 150; ws.spikeNext = now - Math.log(1 - Math.random()) * LAG_SPIKE * 1000; }
  }
  let t = now + LAG + (Math.random() * 2 - 1) * LAG_JITTER;
  if (ws.spikeUntil > now) t = Math.max(t, ws.spikeUntil + LAG);
  const q = (ws.lagQ ||= [[], []])[dir];
  t = Math.max(t, q.length ? q[q.length - 1][0] : 0);
  q.push([t, fn]);
  if (q.length === 1) {
    const pump = () => {
      while (q.length && q[0][0] <= performance.now() + 0.25) q.shift()[1]();
      if (q.length) setTimeout(pump, Math.max(0, q[0][0] - performance.now()));
    };
    setTimeout(pump, Math.max(0, t - now));
  }
}
const out = LAG ? (ws, s) => lagged(ws, 1, () => raw(ws, s)) : raw;

function send(ws, msg) {
  out(ws, JSON.stringify(msg));
}

// Round-trip time, measured by the server with WebSocket protocol pings. Browsers answer these
// inside the network stack, so page scripts can't delay them to fake a high ping. The median of
// the last 8 samples (one every 500 ms) ignores single spikes. Dodgeball sizes the throw wind-up
// at each player from it (windupFor in shared/dodge.js). DODGE_WINDUP=off turns that off.
const WINDUP = process.env.DODGE_WINDUP !== 'off';
const TRACE = !!process.env.NET_TRACE;   // testing aid: print every key change a co-op or dodge room applies, with its tick
function rttPing(ws) {
  const b = Buffer.alloc(8); b.writeDoubleLE(performance.now());
  const go = () => { if (ws.readyState === 1) ws.ping(b); };
  LAG ? lagged(ws, 1, go) : go();   // the stamp is taken before the test lag
}
function rttPong(ws, data) {
  if (!data || data.length !== 8) return;
  ws.rttS.push(performance.now() - data.readDoubleLE(0));
  if (ws.rttS.length > 8) ws.rttS.shift();
}
function rttOf(ws) {
  const a = ws.rttS.slice().sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : 0;
}

const RUN_HOLD = 30;     // ticks the last keys are held while no input arrives (0.5 s)
const RUN_QMAX = 120;    // longest input queue kept
const RUN_WAIT = 24;     // ticks the room waits for a late player's inputs before it holds their keys (400 ms)
const BACK_TICKS = 60;   // co-op and dodge: after an absence, ticks during which a long queue is cut to BACK_KEEP
const BACK_KEEP = 2;
const DRAIN_STOP = 35;   // dodge: no queue drain and no new wind-up in the last 35 ticks (583 ms) of the ready freeze
const RESUME_MS = 2000;  // pause: from a resume request to the first tick again (public/js/net-pause.js)

class Room {
  constructor(code) {
    this.code = code;
    this.clients = [];       // { ws, char, name }
    this.level = -1;
    this.mode = 'coop';      // 'coop' (a level index) or a versus mode such as 'dodge'
    this.L = null; this.S = null; this.seed = 0;
    this.resetInputs();
    this.qDepth = [[], []];  // dodge: each player's input queue length over the last half second
    this.lastActive = Date.now();
  }
  get host() { return this.clients[0]; }
  resetInputs() {
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.debt = [0, 0]; this.held = [0, 0]; this.qlog = [[], []]; this.due = 0; this.waits = 0; this.waitMax = 0; this.waiting = false;
    this.nst = [0, 1].map(() => ({ held: 0, skipped: 0, late: 0, released: 0, trimmed: 0, drained: 0, dropped: 0 }));   // NET_LOG=1 prints these
    // co-op and dodge: ticks left of a return from an absence, queue length before the input of
    // the last tick, ticks stepped and the step of the last snapshot sent, key changes applied
    this.back = [0, 0]; this.qPre = [0, 0]; this.steps = 0; this.sentAt = -2; this.lastB = [-1, -1];
    this.round = (this.round || 0) + 1; this.logged = false;
    this.pz = null; this.frozenMs = 0;   // the pause (pauseReq): a new match is not paused
  }
  netLog() {
    if (!process.env.NET_LOG || !this.nst) return;
    if (!this.runner) {   // co-op and dodge: once per level or match
      if (this.logged || !this.S) return;
      this.logged = true;
      console.log(`net ${this.code} ${this.mode === 'dodge' ? 'dodge' : 'coop'} tick ${this.S.tick}: waited for late inputs ${this.waits} times (longest ${this.waitMax} ticks); ` + this.nst.map((n, i) => `${['Sol', 'Luna'][i]} held ${n.held} skipped ${n.skipped} late ${n.late} released ${n.released} trimmed ${n.trimmed} drained ${n.drained} dropped ${n.dropped}`).join(' | '));
      return;
    }
    const u = process.cpuUsage(), secs = process.uptime();
    console.log(`net cpu: the server used ${((u.user + u.system) / 1e4 / secs).toFixed(1)}% of one core over ${secs.toFixed(0)} s, ${rooms.size} rooms`);
    console.log(`net ${this.code} ${this.mode} tick ${this.S?.tick}: waited for late inputs ${this.waits} times (longest ${this.waitMax} ticks); ` + this.nst.map((n, i) => `${['Sol', 'Luna'][i]} held ${n.held} skipped ${n.skipped} late ${n.late} released ${n.released} trimmed ${n.trimmed}`).join(' | '));
  }
  get runner() { return this.mode === 'runner' || this.mode === 'runner3d'; }
  // Runner rooms (docs/netcode.md). Each client predicts its own player from its own inputs, one
  // per tick, so the server must apply every input on the tick the client meant, or the client's
  // own player gets corrected. When the queue runs dry (a late packet, a Wi-Fi spike, a stalled
  // tab) the last keys are held, as before, and every held tick is counted. When the late
  // inputs arrive, the ones equal to the held keys were already applied by the hold, so they are
  // skipped: the player's path is exactly what the client predicted. Only keys that changed
  // during the gap are applied late. After RUN_HOLD ticks without input the keys are let go.
  // The smallest queue length of the last second goes to the client (qm), which runs slightly
  // slower or faster to keep a small cushion here (public/js/runner-sync.js).
  runnerInput(ch) {
    const q = this.q[ch], h = this.qlog[ch];
    h.push(q.length); if (h.length > 60) h.shift();
    const n = this.nst[ch];
    while (this.debt[ch] > 0 && q.length && q[0][1] === this.held[ch]) { this.ack[ch] = q.shift()[0]; this.debt[ch]--; n.skipped++; }
    if (this.debt[ch] > 0 && q.length) { this.debt[ch] = 0; n.late++; }   // the keys changed during the gap: that input is late
    if (q.length > RUN_QMAX) { n.trimmed += q.length - RUN_QMAX / 2; q.splice(0, q.length - RUN_QMAX / 2); }   // a client far ahead (should not happen)
    if (q.length) {
      const [s, b] = q.shift();
      this.cur[ch] = b; this.ack[ch] = s; this.starve[ch] = 0;
    } else if (++this.starve[ch] > RUN_HOLD) { if (this.cur[ch]) n.released++; this.cur[ch] = 0; }
    else { if (!this.debt[ch]) this.held[ch] = this.cur[ch]; this.debt[ch]++; n.held++; }
  }
  // Co-op and Dodgeball rooms take the Runner rooms' rules (runnerInput, advance, inputsReady):
  // every input keeps its tick, so a jump off a moving lift, a plate held for the partner, a
  // throw's release and a dodge's jump all happen on the tick the player pressed them, as their
  // own screen showed. Two additions. A player whose keys were let go (no input for about a
  // second: a hidden tab) is not waited for (inputsReady), so their partner's game is not held
  // back; when they come back, their queue is kept short for a second (BACK_TICKS), so the
  // backlog a stalled tab sends doesn't stay as a long delay. Dodgeball also drains a standing
  // queue in its free phases (dodgeQueue).
  sharedInput(ch) {
    const q = this.q[ch], h = this.qlog[ch], n = this.nst[ch];
    if (this.starve[ch] > RUN_HOLD && q.length) { this.back[ch] = BACK_TICKS; this.debt[ch] = 0; }   // back after an absence
    if (this.back[ch] > 0) { this.back[ch]--; if (q.length > BACK_KEEP) { n.dropped += q.length - BACK_KEEP; this.ack[ch] = q[q.length - BACK_KEEP - 1][0]; q.splice(0, q.length - BACK_KEEP); } }
    // the queue report for pacing counts the ticks the room still owes (due): a room that is behind
    // real time and steps the moment the late input arrives has no cushion, though the queue
    // holds that one input, so the clients speed up until the room is back on time and the whole
    // RUN_WAIT is left for the next spike
    h.push(q.length - this.due); if (h.length > 60) h.shift();
    while (this.debt[ch] > 0 && q.length && q[0][1] === this.held[ch]) { this.ack[ch] = q.shift()[0]; this.debt[ch]--; n.skipped++; }
    if (this.debt[ch] > 0 && q.length) { this.debt[ch] = 0; n.late++; }
    if (q.length > RUN_QMAX) { n.trimmed += q.length - RUN_QMAX / 2; q.splice(0, q.length - RUN_QMAX / 2); }
    if (this.L.dodge) this.dodgeQueue(ch);
    this.qPre[ch] = q.length;
    if (q.length) {
      const [s, b] = q.shift();
      if (TRACE && b !== this.lastB[ch]) console.log(`net trace ${this.code} ${this.round} ${ch} ${s} ${this.S.tick} ${b}`);
      this.lastB[ch] = b;
      this.cur[ch] = b; this.ack[ch] = s; this.starve[ch] = 0;
    } else if (++this.starve[ch] > RUN_HOLD) { if (this.cur[ch]) n.released++; this.cur[ch] = 0; }
    else { if (!this.debt[ch]) this.held[ch] = this.cur[ch]; this.debt[ch]++; n.held++; }
  }
  info() {
    return { code: this.code, level: this.level, mode: this.mode, players: this.clients.map(c => ({ char: c.char, name: c.name })) };
  }
  broadcastRoom() {
    this.clients.forEach((c, i) => send(c.ws, { t: 'room', ...this.info(), you: c.char, host: i === 0 }));
  }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const c of this.clients) out(c.ws, s);
  }
  start(level, mode = 'coop', seed = 0) {
    this.level = level; this.mode = mode;
    if (mode === 'dodge') { this.L = COURT; this.S = createDodge(seed || (Math.random() * 2 ** 31) | 0); }   // seeded first serve (TEST_SEED: the client's)
    else { this.L = BUILT[level]; this.S = createState(this.L); }
    this.resetInputs();
    this.broadcast(this.startMsg());
  }
  // versus Runner: a fresh seeded course every time (rematches included)
  startRunner(seed) {
    this.mode = 'runner'; this.level = -1;
    this.seed = seed || newSeed();
    this.L = buildRunner(this.seed);
    this.S = createRunnerState(this.L);
    this.resetInputs();
    this.broadcast(this.startMsg());
  }
  // versus Runner 3D: same scheme, its own sim
  startRunner3d(seed) {
    this.mode = 'runner3d'; this.level = -1;
    this.seed = seed || newSeed();
    this.L = buildRunner3d(this.seed);
    this.S = createRunner3dState(this.L);
    this.resetInputs();
    this.broadcast(this.startMsg());
  }
  restartGame() { if (this.mode === 'runner') this.startRunner(); else if (this.mode === 'runner3d') this.startRunner3d(); else this.start(this.level, this.mode); }
  startMsg() {
    if (this.mode === 'runner3d') return { t: 'start', mode: 'runner3d', seed: this.seed, st: this.S };
    return this.mode === 'runner' ? { t: 'start', mode: 'runner', seed: this.seed, st: this.S } : { t: 'start', level: this.level, mode: this.mode, st: this.S };
  }
  stop() {
    this.level = -1; this.L = null; this.S = null; this.pz = null;
    this.broadcast({ t: 'menu' });
  }
  // Dodgeball. A browser that starts a few ticks ahead of the server (a slow first frame sends a
  // burst of inputs) keeps that many inputs waiting here for the rest of the match, and the other
  // player sees it that much later. Drain the queue while it costs nothing: after a hit, when
  // inputs are ignored, and in the ready freeze, where an input the same as the keys already
  // held only makes that hold one tick shorter (nobody can throw yet). Only a standing queue is
  // drained: one that never fell below 2 over the last second (qlog). Draining the cushion that
  // jitter needs would leave that player's inputs late, and the room waiting for them. Not in the
  // last DRAIN_STOP ticks of the freeze either: a drain moves every input after it one tick
  // earlier, and the client, a round trip ahead, has already sent the first inputs of play. The
  // depth that is left is recorded once per advance() for the wind-up.
  dodgeQueue(ch) {
    const q = this.q[ch], ph = this.S.d.phase, h = this.qlog[ch];
    if (q.length > 1 && h.length >= 30 && Math.min(...h) >= 2 && (ph === DP_POINT || ph === DP_OVER || (ph === DP_READY && this.S.d.t < DODGE.ready - DRAIN_STOP && q[0][1] === this.cur[ch]))) { this.ack[ch] = q.shift()[0]; this.nst[ch].drained++; }
  }
  // n ticks of wall-clock time have passed. Every room waits up to RUN_WAIT ticks for a player
  // whose inputs are late (a Wi-Fi spike, a stalled tab) instead of guessing their keys, then
  // catches up as soon as the inputs arrive. Only past RUN_WAIT does it step with the held keys.
  // So a key pressed during a spike is still applied on its tick and nobody dies of their own
  // late packet. The whole room waits: in co-op the lifts, crates and gates wait with it, so a
  // partner standing on a lift is still on it, at the same spot, when the late jump off it is
  // applied. The price is that the other player's view of the late one is late (their own
  // screen keeps going on its prediction).
  advance(n) {
    if (!this.S) return;
    if (this.pz) {
      // paused, or counting down to the resume: nothing steps and nothing is owed for this time
      // (due keeps only what was owed before the freeze), so the room does not catch up after it
      const pz = this.pz;
      if (!pz.goAt || performance.now() < pz.goAt) return;
      this.frozenMs += pz.goAt - pz.since;
      this.pz = null;
      if (process.env.NET_LOG) console.log(`net ${this.code} resume at tick ${this.S.tick} after ${Math.round(pz.goAt - pz.since)} ms frozen`);
    }
    this.due = Math.min((this.due || 0) + n, RUN_WAIT + 60);   // at most a second behind
    let stepped = 0;
    while (this.due > 0 && this.S) {
      if (this.due <= RUN_WAIT && !this.inputsReady()) {
        if (!this.waiting) { this.waiting = true; this.waits++; }
        this.waitMax = Math.max(this.waitMax, this.due);
        break;
      }
      this.waiting = false;
      this.due--;
      this.tick();
      stepped++;
    }
    if (!this.runner && stepped && this.S) this.afterSteps(stepped);
  }
  // co-op and dodge, after the ticks of one advance(): the queue depth for the wind-up (once per
  // call, so a catch-up after a wait counts once, as what is left), and a snapshot every 2 ticks,
  // or one at the end of a catch-up (only the newest matters)
  afterSteps(stepped) {
    if (this.L.dodge) for (let ch = 0; ch < 2; ch++) { const h = this.qDepth[ch]; h.push(this.qPre[ch]); if (h.length > 30) h.shift(); }
    if (this.steps - this.sentAt < 2 && stepped < 2) return;
    this.sentAt = this.steps;
    const qm = this.qlog.map(h => (h.length ? Math.min(...h) : 0));
    // Dodgeball: each player's snapshot withholds the other player's aim while they hold the
    // button, so a modified client cannot read the angle before the release.
    if (this.L.dodge) this.clients.forEach(c => send(c.ws, { t: 's', ack: this.ack, d: this.debt, qm, ...dodgeViewFor(this.S, this.cur, c.char) }));
    else this.broadcast({ t: 's', ack: this.ack, inp: this.cur, d: this.debt, qm, st: this.S });
  }
  // both players have an input for the next tick (past the late ones a hold already covered).
  // Co-op and dodge don't wait for a player whose keys were let go (absent).
  inputsReady() {
    for (let ch = 0; ch < 2; ch++) {
      if (!this.runner && this.starve[ch] > RUN_HOLD) continue;
      const q = this.q[ch];
      let k = 0;
      while (k < this.debt[ch] && k < q.length && q[k][1] === this.held[ch]) k++;
      if (q.length <= k) return false;
    }
    return true;
  }
  // The pause (docs/netcode.md, "Pause"). Either player may pause and either may resume. Paused,
  // the room steps nothing: no ticks, no snapshots, no starve or hold counters, no time owed.
  // Inputs keep arriving (each client is a round trip ahead, and the other player keeps playing
  // until they hear of the pause); they stay queued and are applied after the resume on the
  // ticks they were meant for, so the match is the same as without the pause. A resume waits
  // RESUME_MS, counted down on both screens. Pausing again in the countdown cancels it.
  over() {
    const S = this.S;
    return this.runner ? S.phase === 2 : this.L.dodge ? S.d.phase === DP_OVER : S.phase === PH_WON;
  }
  pauseReq(c, on) {
    if (!this.S || this.over()) { send(c.ws, { t: 'pause', st: 'run' }); return; }   // no match, or its end: no pause
    const now = performance.now(), S = this.S;
    if (on) {
      if (this.pz && !this.pz.goAt) { send(c.ws, { t: 'pause', st: 'paused', by: this.pz.by, tick: S.tick }); return; }   // already paused
      if (!this.pz) this.pz = { since: now };   // a pause in the countdown keeps the freeze it cancels
      this.pz.by = c.char; this.pz.goAt = 0;
      this.broadcast({ t: 'pause', st: 'paused', by: c.char, tick: S.tick });
      if (process.env.NET_LOG) console.log(`net ${this.code} pause by ${['Sol', 'Luna'][c.char]} at tick ${S.tick}`);
      return;
    }
    if (!this.pz || this.pz.goAt) return;   // not paused, or already counting down
    const pz = this.pz;
    pz.goAt = now + RESUME_MS; pz.by = c.char;
    const frozen = Math.round(this.frozenMs + pz.goAt - pz.since);
    for (const k of this.clients) send(k.ws, { t: 'pause', st: 'count', by: c.char, ms: this.startIn(k), frozen, tick: S.tick });
  }
  // When a client should start its own ticks again, counted from the arrival of the countdown
  // message: so that its next input reaches the room when about 2 of its inputs are still queued
  // there, as in play. RESUME_MS less its round trip, plus the inputs it has queued here beyond
  // those 2 (the other player kept playing until they heard of the pause, so they have more).
  startIn(k) {
    const ch = k.char, q = this.q[ch];
    let skip = 0;   // inputs the hold already covered
    while (skip < this.debt[ch] && skip < q.length && q[skip][1] === this.held[ch]) skip++;
    const ms = RESUME_MS + (q.length - skip - 2) * (1000 / 60) - rttOf(k.ws);
    return Math.round(Math.max(RESUME_MS - 500, Math.min(RESUME_MS + 1000, ms)));
  }
  tick() {
    if (!this.S) return;
    for (let ch = 0; ch < 2; ch++) {
      if (this.runner) this.runnerInput(ch); else this.sharedInput(ch);
    }
    this.steps++;
    // Dodgeball: the wind-up for throws at each player follows their round trip. It changes
    // only in the ready freeze at the start of a point, when nobody can throw, and not in its last
    // DRAIN_STOP ticks: a client a round trip ahead is already playing the point, and its throws
    // must wind up as long on its screen as on the server.
    if (this.L.dodge && this.S.d.phase === DP_READY && this.S.d.t < DODGE.ready - DRAIN_STOP) {
      const lag = [0, 0];
      const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
      if (WINDUP) for (const c of this.clients) lag[c.char] = windupFor(rttOf(c.ws), med(this.qDepth[c.char]));
      if (process.env.DODGE_LOG && this.S.d.t === DODGE.ready - DRAIN_STOP - 1) console.log(`dodge ${this.code}: rtt ${this.clients.map(c => Math.round(rttOf(c.ws))).join('/')} ms, queue ${this.qDepth.map(med).join('/')}, wind-up at Sol/Luna ${lag.join('/')}`);
      this.S.d.lag = lag;
    }
    const wasOver = this.S.phase === 2;
    (this.mode === 'runner' ? stepRunner : this.mode === 'runner3d' ? stepRunner3d : this.L.dodge ? stepDodge : step)(this.L, this.S, this.cur);
    if (this.runner && !wasOver && this.S.phase === 2) this.netLog();
    if (!this.runner && (this.L.dodge ? this.S.d.phase === DP_OVER : this.S.phase === PH_WON)) this.netLog();
    if (this.runner) {
      // runner snapshots are small (about 700 bytes): every tick, with the queue lengths
      const qm = this.qlog.map(h => (h.length ? Math.min(...h) : 0));
      // d: ticks held for each player whose inputs have not arrived yet (the client skips
      // that many of its inputs equal to the held keys when it replays, as the server will)
      this.broadcast({ t: 's', ack: this.ack, inp: this.cur, d: this.debt, q: this.q.map(q => q.length), qm, st: this.S });
    }
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.isAlive = true;
  ws.rttS = [];
  ws.on('pong', (data) => { ws.isAlive = true; LAG ? lagged(ws, 0, () => rttPong(ws, data)) : rttPong(ws, data); });
  rttPing(ws);
  ws.rttT = setInterval(() => rttPing(ws), 500);

  ws.on('message', (data) => (LAG ? lagged(ws, 0, () => onMessage(ws, data)) : onMessage(ws, data)));
  ws.on('close', () => { clearInterval(ws.rttT); leave(ws); });
});

// TEST_SEED=1 lets a client pick the Runner course seed and the Dodgeball first serve (tools/check-netcode.js
// and tools/check-pause.js play planned bot routes and fixed input tracks)
const testSeed = (m) => (process.env.TEST_SEED && m.seed > 0 ? m.seed >>> 0 : 0);

function onMessage(ws, data) {
  {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const room = ws.room;
    switch (m.t) {
      case 'i': {
        if (!room || !room.S) return;
        const me = room.clients.find(c => c.ws === ws);
        if (!me) return;
        if (room.pz && room.q[me.char].length >= RUN_QMAX) return;   // paused: a client that kept sending (it should not) is not stored
        room.q[me.char].push([m.s | 0, m.b & 31]);   // bit 16 is Runner 3D's "back"; other sims ignore it
        return;
      }
      case 'ping': send(ws, { t: 'pong', c: m.c }); return;
      case 'pause': {
        if (!room) return;
        const me = room.clients.find(c => c.ws === ws);
        if (me) room.pauseReq(me, !!m.on);
        return;
      }
      case 'create': {
        if (room) leave(ws);
        const code = newCode();
        const r = new Room(code);
        rooms.set(code, r);
        r.clients.push({ ws, char: 0, name: String(m.name || 'Player').slice(0, 16) });
        ws.room = r;
        r.broadcastRoom();
        return;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) { send(ws, { t: 'err', msg: 'No room with that code.' }); return; }
        if (r.clients.length >= 2) { send(ws, { t: 'err', msg: 'That room is full.' }); return; }
        if (room) leave(ws);
        const taken = r.clients[0]?.char ?? 1;
        r.clients.push({ ws, char: 1 - taken, name: String(m.name || 'Player').slice(0, 16) });
        ws.room = r;
        r.broadcastRoom();
        if (r.S) send(ws, r.startMsg());
        return;
      }
      case 'swap': {
        // Either player may swap at any time. { char } picks a character; without it, swap.
        if (!room) return;
        const me = room.clients.find(c => c.ws === ws);
        if (!me) return;
        const want = m.char === 0 || m.char === 1 ? m.char : 1 - me.char;
        if (want === me.char) return;
        for (const c of room.clients) c.char = 1 - c.char;
        room.broadcastRoom();
        if (room.S) room.restartGame();   // mid-game: restart with the new roles
        return;
      }
      case 'start': {
        if (!room) return;
        if (m.mode === 'dodge') {
          if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
          room.start(-1, 'dodge', testSeed(m));
          return;
        }
        if (m.mode === 'runner') {
          if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
          room.startRunner(testSeed(m));
          return;
        }
        if (m.mode === 'runner3d') {
          if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
          room.startRunner3d(testSeed(m));
          return;
        }
        const lv = m.level | 0;
        if (lv < 0 || lv >= BUILT.length) return;
        if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
        room.start(lv);
        return;
      }
      case 'restart': {
        if (!room || !room.S) return;
        room.restartGame();
        return;
      }
      case 'menu': {
        if (!room) return;
        room.stop();
        room.broadcastRoom();
        return;
      }
      case 'chat': {
        if (!room) return;
        const me = room.clients.find(c => c.ws === ws);
        if (!me) return;
        // at most 5 messages in any 4 seconds per player
        const now = Date.now();
        ws.chatTimes = (ws.chatTimes || []).filter(t => now - t < 4000);
        if (ws.chatTimes.length >= 5) { send(ws, { t: 'err', msg: 'Slow down a little.' }); return; }
        const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
        if (!text) return;
        ws.chatTimes.push(now);
        room.broadcast({ t: 'chat', char: me.char, text });
        return;
      }
      case 'leave': leave(ws); return;
    }
  }
}

function leave(ws) {
  const r = ws.room;
  if (!r) return;
  if (r.S && (!r.runner || r.S.phase !== 2)) r.netLog();
  ws.room = null;
  r.clients = r.clients.filter(c => c.ws !== ws);
  if (!r.clients.length) { rooms.delete(r.code); return; }
  if (r.S) { r.level = -1; r.L = null; r.S = null; }
  r.pz = null;   // a pause ends with the match: the one left is back in the room
  r.broadcast({ t: 'peer-left' });
  r.broadcastRoom();
}

// Fixed 60 Hz simulation for every active room.
const DT = 1000 / 60;
let last = performance.now(), acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last; last = now;
  if (acc > 250) acc = 250;
  let n = 0;
  while (acc >= DT) { acc -= DT; n++; }
  if (n) for (const r of rooms.values()) r.advance(n);
}, 4);

// Heartbeats keep proxies from dropping idle sockets and clean up dead ones.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`Sol & Luna listening on :${PORT}`));
