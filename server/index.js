// Sol & Luna — static file server + authoritative multiplayer rooms (WebSocket).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON } from '../shared/sim.js';
import { COURT, createDodge, stepDodge } from '../shared/dodge.js';
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

// Optional artificial one-way latency for testing netcode: LAG_MS=80 npm start
const LAG = +(process.env.LAG_MS || 0);
const raw = (ws, s) => { if (ws.readyState === 1) ws.send(s); };
const out = LAG ? (ws, s) => setTimeout(() => raw(ws, s), LAG) : raw;

function send(ws, msg) {
  out(ws, JSON.stringify(msg));
}

class Room {
  constructor(code) {
    this.code = code;
    this.clients = [];       // { ws, char, name }
    this.level = -1;
    this.mode = 'coop';      // 'coop' (a level index) or a versus mode such as 'dodge'
    this.L = null; this.S = null; this.seed = 0;
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.lastActive = Date.now();
  }
  get host() { return this.clients[0]; }
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
  start(level, mode = 'coop') {
    this.level = level; this.mode = mode;
    if (mode === 'dodge') { this.L = COURT; this.S = createDodge((Math.random() * 2 ** 31) | 0); }   // seeded first serve
    else { this.L = BUILT[level]; this.S = createState(this.L); }
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.broadcast(this.startMsg());
  }
  // versus Runner: a fresh seeded course every time (rematches included)
  startRunner() {
    this.mode = 'runner'; this.level = -1;
    this.seed = newSeed();
    this.L = buildRunner(this.seed);
    this.S = createRunnerState(this.L);
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.broadcast(this.startMsg());
  }
  // versus Runner 3D: same scheme, its own sim
  startRunner3d() {
    this.mode = 'runner3d'; this.level = -1;
    this.seed = newSeed();
    this.L = buildRunner3d(this.seed);
    this.S = createRunner3dState(this.L);
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.broadcast(this.startMsg());
  }
  restartGame() { if (this.mode === 'runner') this.startRunner(); else if (this.mode === 'runner3d') this.startRunner3d(); else this.start(this.level, this.mode); }
  startMsg() {
    if (this.mode === 'runner3d') return { t: 'start', mode: 'runner3d', seed: this.seed, st: this.S };
    return this.mode === 'runner' ? { t: 'start', mode: 'runner', seed: this.seed, st: this.S } : { t: 'start', level: this.level, mode: this.mode, st: this.S };
  }
  stop() {
    this.level = -1; this.L = null; this.S = null;
    this.broadcast({ t: 'menu' });
  }
  tick() {
    if (!this.S) return;
    for (let ch = 0; ch < 2; ch++) {
      const q = this.q[ch];
      if (q.length > 12) q.splice(0, q.length - 4); // client ran far ahead: catch up
      if (q.length) {
        const [s, b] = q.shift();
        this.cur[ch] = b; this.ack[ch] = s; this.starve[ch] = 0;
      } else if (++this.starve[ch] > 10) this.cur[ch] = 0; // no input arriving: let go of the keys
    }
    (this.mode === 'runner' ? stepRunner : this.mode === 'runner3d' ? stepRunner3d : this.L.dodge ? stepDodge : step)(this.L, this.S, this.cur);
    if (this.S.tick % 2 === 0) {
      this.broadcast({ t: 's', ack: this.ack, inp: this.cur, st: this.S });
    }
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => (LAG ? setTimeout(() => onMessage(ws, data), LAG) : onMessage(ws, data)));
  ws.on('close', () => leave(ws));
});

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
        room.q[me.char].push([m.s | 0, m.b & 31]);   // bit 16 is Runner 3D's "back"; other sims ignore it
        return;
      }
      case 'ping': send(ws, { t: 'pong', c: m.c }); return;
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
          room.start(-1, 'dodge');
          return;
        }
        if (m.mode === 'runner') {
          if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
          room.startRunner();
          return;
        }
        if (m.mode === 'runner3d') {
          if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
          room.startRunner3d();
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
  ws.room = null;
  r.clients = r.clients.filter(c => c.ws !== ws);
  if (!r.clients.length) { rooms.delete(r.code); return; }
  if (r.S) { r.level = -1; r.L = null; r.S = null; }
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
  while (acc >= DT) {
    acc -= DT;
    for (const r of rooms.values()) r.tick();
  }
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
