// Sol & Luna — static file server + authoritative multiplayer rooms (WebSocket).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON } from '../shared/sim.js';

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
    this.L = null; this.S = null;
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.lastActive = Date.now();
  }
  get host() { return this.clients[0]; }
  info() {
    return { code: this.code, level: this.level, players: this.clients.map(c => ({ char: c.char, name: c.name })) };
  }
  broadcastRoom() {
    this.clients.forEach((c, i) => send(c.ws, { t: 'room', ...this.info(), you: c.char, host: i === 0 }));
  }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const c of this.clients) out(c.ws, s);
  }
  start(level) {
    this.level = level;
    this.L = BUILT[level];
    this.S = createState(this.L);
    this.q = [[], []]; this.cur = [0, 0]; this.ack = [0, 0]; this.starve = [0, 0];
    this.broadcast({ t: 'start', level, st: this.S });
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
    step(this.L, this.S, this.cur);
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
        room.q[me.char].push([m.s | 0, m.b & 7]);
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
        if (r.S) send(ws, { t: 'start', level: r.level, st: r.S });
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
        if (room.S) room.start(room.level);   // mid-level: restart with the new roles
        return;
      }
      case 'start': {
        if (!room) return;
        const lv = m.level | 0;
        if (lv < 0 || lv >= BUILT.length) return;
        if (room.clients.length < 2) { send(ws, { t: 'err', msg: 'Waiting for a second player.' }); return; }
        room.start(lv);
        return;
      }
      case 'restart': {
        if (!room || !room.S) return;
        room.start(room.level);
        return;
      }
      case 'menu': {
        if (!room) return;
        room.stop();
        room.broadcastRoom();
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
