// Sol & Luna — app shell: menus, local co-op loop, online prediction/reconciliation.
import { buildLevel, createState, step, cloneState, PH_PLAY, PH_DEAD, PH_WON, SOL, LUNA, TICK_RATE, WORLD_W, WORLD_H, rankFor } from '/shared/sim.js';
import { LEVELS } from '/shared/levels.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { sfx } from './audio.js';

const BUILT = LEVELS.map((raw, i) => buildLevel(raw, i));
const DT = 1000 / TICK_RATE;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------------------------------------------------------------------------
// progress

const PKEY = 'sl.progress.v1';
let progress = { unlocked: 0, best: {} };
try { Object.assign(progress, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch {}
if (new URLSearchParams(location.search).has('unlock')) progress.unlocked = BUILT.length - 1;
const saveProgress = () => { try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch {} };
const RANK_ORDER = { A: 3, B: 2, C: 1 };
function record(level, secs, gems, total) {
  const rank = rankFor(BUILT[level], secs, gems, total);
  const prev = progress.best[level];
  if (!prev || RANK_ORDER[rank] > RANK_ORDER[prev.rank] || (rank === prev.rank && secs < prev.t)) progress.best[level] = { t: secs, gems, rank };
  progress.unlocked = Math.max(progress.unlocked, Math.min(BUILT.length - 1, level + 1));
  saveProgress();
  return rank;
}

// ---------------------------------------------------------------------------
// state

const cv = $('#game');
const R = new Renderer(cv);
const input = new Input();
const net = new Net();

const app = {
  mode: 'menu',          // 'menu' | 'local' | 'online'
  level: 0, L: null, S: null,
  paused: false,
  prev: null,            // positions before the latest tick (for interpolation)
  off: null,             // visual correction offsets (online)
  results: false,
  // online
  room: null, me: SOL, host: false,
  seq: 0, pending: [], remoteBits: 0, inGame: false,
  heard: null,
};

function fit() {
  const wrap = $('#stage');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const s = Math.min(W / WORLD_W, H / WORLD_H);
  R.resize(Math.floor(WORLD_W * s), Math.floor(WORLD_H * s));
}
window.addEventListener('resize', fit);

// ---------------------------------------------------------------------------
// screens

function show(id) {
  $$('.screen').forEach(el => el.classList.toggle('on', el.id === id));
  document.body.dataset.screen = id || 'game';
}
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms);
}

function buildLevelGrid(onPick, highlight = -1) {
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  BUILT.forEach((L, i) => {
    const b = document.createElement('button');
    const best = progress.best[i];
    const locked = i > progress.unlocked;
    b.className = 'lvl' + (locked ? ' locked' : '') + (best ? ' done rank-' + best.rank : '') + (i === highlight ? ' current' : '');
    b.innerHTML = `<span class="n">${i + 1}</span><span class="nm">${L.name}</span>${best ? `<span class="rk">${best.rank}</span>` : ''}`;
    b.disabled = locked;
    b.title = locked ? 'Locked' : L.name + (best ? ` — best ${best.t.toFixed(1)}s` : '');
    b.onclick = () => { sfx.ui(); onPick(i); };
    grid.appendChild(b);
  });
}

function openLevels() {
  if (app.mode === 'online') {
    $('#levelsTitle').textContent = `Choose a level · Room ${app.room?.code || ''}`;
    buildLevelGrid((i) => net.send({ t: 'start', level: i }), app.level);
  } else {
    $('#levelsTitle').textContent = 'Choose a level';
    buildLevelGrid((i) => startLocal(i), app.level);
  }
  show('levels');
  const cur = $('#levelGrid .current') || $('#levelGrid .lvl:not(.locked):last-of-type');
  cur?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// game setup

function capture(S) {
  return { p: S.p.map(p => ({ x: p.x, y: p.y })), b: S.b.map(b => ({ x: b.x, y: b.y })), pl: S.pl.map(q => ({ x: q.x, y: q.y })) };
}
function zeroOff(S) {
  return { p: S.p.map(() => ({ x: 0, y: 0 })), b: S.b.map(() => ({ x: 0, y: 0 })), pl: S.pl.map(() => ({ x: 0, y: 0 })) };
}

function beginLevel(level, st) {
  app.level = level;
  app.L = BUILT[level];
  app.S = st ? cloneState(st) : createState(app.L);
  app.prev = capture(app.S);
  app.off = zeroOff(app.S);
  app.paused = false;
  app.results = false;
  app.pending = []; app.remoteBits = 0;
  app.heard = hearState(app.S);
  R.setLevel(app.L);
  show(null);
  $('#hint').textContent = app.L.hint || '';
  $('#hint').classList.toggle('on', !!app.L.hint);
  clearTimeout(beginLevel.h);
  beginLevel.h = setTimeout(() => $('#hint').classList.remove('on'), 6000);
}

function startLocal(level) {
  app.mode = 'local';
  beginLevel(level);
}

// ---------------------------------------------------------------------------
// sounds from state changes (robust to rollback: only plays on forward progress)

function hearState(S) {
  return { tries: S.tries, jump: S.p.map(p => p.jumpN), gm: S.gm.slice(), btn: S.btn.slice(), lv: S.lv.map(v => v > 0), dead: S.phase === PH_DEAD, won: S.phase === PH_WON, door: S.p.map(p => p.atDoor) };
}
function listen(S) {
  const h = app.heard;
  if (S.tries !== h.tries) { app.heard = hearState(S); return; }
  S.p.forEach((p, i) => { if (p.jumpN > h.jump[i]) { sfx.jump(i); h.jump[i] = p.jumpN; } });
  S.gm.forEach((v, i) => { if (v && !h.gm[i]) { sfx.gem(app.L.gems[i].kind); h.gm[i] = 1; } });
  S.btn.forEach((v, i) => { if (v && !h.btn[i]) sfx.click(); h.btn[i] = v; });
  S.lv.forEach((v, i) => { const on = v > 0; if (on !== h.lv[i]) sfx.lever(); h.lv[i] = on; });
  S.p.forEach((p, i) => { if (p.atDoor && !h.door[i]) sfx.door(); h.door[i] = p.atDoor; });
  if (S.phase === PH_DEAD && !h.dead) sfx.die();
  h.dead = S.phase === PH_DEAD;
  if (S.phase === PH_WON && !h.won) sfx.win();
  h.won = S.phase === PH_WON;
}

// ---------------------------------------------------------------------------
// loop

function tickLocal() {
  if (app.paused || app.results) return;
  const inp = input.local();
  app.prev = capture(app.S);
  step(app.L, app.S, inp);
  listen(app.S);
  if (app.S.phase === PH_WON && app.S.phaseT >= 45) showResults();
}

function tickOnline() {
  if (!app.inGame || app.results) return;
  const overlay = app.paused;
  const bits = overlay ? 0 : input.any();
  app.seq++;
  net.send({ t: 'i', s: app.seq, b: bits });
  app.pending.push([app.seq, bits]);
  if (app.pending.length > 240) app.pending.shift();
  const inp = [0, 0];
  inp[app.me] = bits; inp[1 - app.me] = app.remoteBits;
  app.prev = capture(app.S);
  step(app.L, app.S, inp);
  listen(app.S);
  decayOff();
}

function decayOff() {
  const o = app.off;
  for (const arr of [o.p, o.b, o.pl]) for (const v of arr) { v.x *= 0.8; v.y *= 0.8; if (Math.abs(v.x) < 0.05) v.x = 0; if (Math.abs(v.y) < 0.05) v.y = 0; }
}

function onSnapshot(m) {
  if (!app.inGame || !app.L) return;
  const before = capture(app.S);
  const ns = m.st;
  app.remoteBits = m.inp[1 - app.me] | 0;
  const myAck = m.ack[app.me] | 0;
  app.pending = app.pending.filter(([s]) => s > myAck);
  const inp = [0, 0];
  for (const [, b] of app.pending) {
    inp[app.me] = b; inp[1 - app.me] = app.remoteBits;
    step(app.L, ns, inp);
  }
  const after = capture(ns);
  // keep visuals continuous: carry the correction as a decaying offset
  if (ns.p.length === app.off.p.length && ns.tries === app.S.tries) {
    const add = (o, a, b) => { o.x += a.x - b.x; o.y += a.y - b.y; if (Math.hypot(o.x, o.y) > 64) { o.x = 0; o.y = 0; } };
    before.p.forEach((v, i) => add(app.off.p[i], v, after.p[i]));
    before.b.forEach((v, i) => add(app.off.b[i], v, after.b[i]));
    before.pl.forEach((v, i) => add(app.off.pl[i], v, after.pl[i]));
    // prev positions shift with the state so interpolation doesn't double-count
    app.prev.p.forEach((v, i) => { v.x += after.p[i].x - before.p[i].x; v.y += after.p[i].y - before.p[i].y; });
    app.prev.b.forEach((v, i) => { v.x += after.b[i].x - before.b[i].x; v.y += after.b[i].y - before.b[i].y; });
    app.prev.pl.forEach((v, i) => { v.x += after.pl[i].x - before.pl[i].x; v.y += after.pl[i].y - before.pl[i].y; });
  } else {
    app.off = zeroOff(ns);
    app.prev = capture(ns);
  }
  app.S = ns;
  if (m.st.phase === PH_WON && m.st.phaseT >= 45 && !app.results) showResults();
}

function view(alpha) {
  const S = app.S, P = app.prev, O = app.off;
  const lerp = (a, b, o) => ({ x: a.x + (b.x - a.x) * alpha + (o ? o.x : 0), y: a.y + (b.y - a.y) * alpha + (o ? o.y : 0) });
  const ok = P && P.p.length === S.p.length && P.b.length === S.b.length;
  if (!ok) return null;
  // don't interpolate across teleports (respawn)
  const tp = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 40;
  return {
    p: S.p.map((p, i) => tp(P.p[i], p) ? { x: p.x, y: p.y } : lerp(P.p[i], p, O?.p[i])),
    b: S.b.map((b, i) => tp(P.b[i], b) ? { x: b.x, y: b.y } : lerp(P.b[i], b, O?.b[i])),
    pl: S.pl.map((q, i) => lerp(P.pl[i], q, O?.pl[i])),
  };
}

let last = performance.now(), acc = 0, fpsT = 0, frames = 0, fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = DT;
  frames++; fpsT += dt; if (fpsT > 1000) { fps = Math.round(frames * 1000 / fpsT); frames = 0; fpsT = 0; }
  const playing = app.L && (app.mode === 'local' || (app.mode === 'online' && app.inGame));
  if (playing) {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 8) {
      acc -= DT; n++;
      if (app.mode === 'local') tickLocal(); else tickOnline();
    }
    if (n === 8) acc = 0;
  }
  if (app.L) {
    const alpha = playing && !app.paused ? Math.min(1, acc / DT) : 1;
    R.draw(app.L, app.S, view(alpha), now / 1000);
    drawHud(now / 1000);
  } else {
    drawAttract(now / 1000);
  }
}

// HUD drawn into the canvas in world units (crisp at any resolution)
function drawHud(time) {
  const g = R.ctx, S = app.S, L = app.L;
  g.setTransform(R.scale, 0, 0, R.scale, 0, 0);
  const secs = S.tick / TICK_RATE;
  const w = 150, x = WORLD_W / 2 - w / 2, y = 4;
  g.fillStyle = 'rgba(18,12,30,0.72)';
  plaque(g, x, y, w, 34, 10); g.fill();
  g.strokeStyle = 'rgba(214,196,255,0.35)'; g.lineWidth = 1.5; g.stroke();
  g.font = '600 20px "Cinzel", Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = secs > L.par ? '#ffb4a8' : '#f4ecff';
  g.fillText(fmtTime(secs), WORLD_W / 2, y + 18);
  // gem tallies
  const tally = (kind) => { let got = 0, tot = 0; L.gems.forEach((gm, i) => { if (gm.kind === kind) { tot++; if (S.gm[i]) got++; } }); return [got, tot]; };
  const [sg, st] = tally(SOL), [mg, mt] = tally(LUNA);
  g.font = '600 15px "Cinzel", Georgia, serif';
  g.textAlign = 'right'; g.fillStyle = '#ffd27a';
  g.fillText(`${sg}/${st}`, x - 10, y + 18);
  g.textAlign = 'left'; g.fillStyle = '#a9e3ff';
  g.fillText(`${mg}/${mt}`, x + w + 10, y + 18);
  gemIcon(g, x - 58, y + 18, SOL); gemIcon(g, x + w + 52, y + 18, LUNA);
  // level label
  g.font = '500 13px "Cinzel", Georgia, serif';
  g.textAlign = 'left'; g.fillStyle = 'rgba(240,230,255,0.75)';
  g.fillText(`${app.level + 1}. ${L.name}`, 14, 19);
  if (app.mode === 'online') {
    g.textAlign = 'right';
    g.fillStyle = 'rgba(240,230,255,0.6)';
    g.fillText(`${app.me === SOL ? 'You are Sol' : 'You are Luna'} · ${Math.round(net.rtt)} ms`, WORLD_W - 14, 19);
  }
  if (S.phase === PH_DEAD) {
    g.font = '700 30px "Cinzel", Georgia, serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,240,250,' + Math.min(1, S.phaseT / 20) + ')';
    g.fillText(S.deadWho === SOL ? 'Sol was lost…' : 'Luna was lost…', WORLD_W / 2, WORLD_H / 2);
  }
}
function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
function plaque(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.closePath(); }
function gemIcon(g, x, y, kind) {
  g.fillStyle = kind === SOL ? '#ffb238' : '#5cc6ff';
  g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y - 1); g.lineTo(x, y + 7); g.lineTo(x - 6, y - 1); g.closePath(); g.fill();
}

// Title-screen backdrop: a live demo level behind the menu.
let attract = null;
function drawAttract(time) {
  if (!attract) {
    attract = { L: BUILT[0], S: createState(BUILT[0]) };
    R.setLevel(attract.L);
  }
  if (Math.floor(time * 60) % 1 === 0) {
    const t = attract.S.tick;
    const bits = [(t % 240 < 120 ? 2 : 1) | (t % 90 === 0 ? 4 : 0), (t % 200 < 100 ? 1 : 2) | (t % 70 === 0 ? 4 : 0)];
    step(attract.L, attract.S, bits);
    if (attract.S.phase !== PH_PLAY || t > 1200) attract.S = createState(attract.L);
  }
  R.draw(attract.L, attract.S, null, time);
}

// ---------------------------------------------------------------------------
// results / pause

function showResults() {
  app.results = true;
  const S = app.S, L = app.L;
  const secs = S.tick / TICK_RATE;
  const got = S.gm.reduce((a, b) => a + b, 0), tot = L.gems.length;
  const rank = record(app.level, secs, got, tot);
  $('#resName').textContent = `${app.level + 1}. ${L.name}`;
  $('#resTime').textContent = fmtTime(secs);
  $('#resPar').textContent = `par ${fmtTime(L.par)}`;
  $('#resGems').textContent = `${got} / ${tot}`;
  $('#resRank').textContent = rank;
  $('#resRank').className = 'rank rank-' + rank;
  const last = app.level >= BUILT.length - 1;
  const canDrive = app.mode === 'local' || app.host;
  $('#resNext').hidden = !canDrive || last;
  $('#resRetry').hidden = !canDrive;
  $('#resLevels').hidden = !canDrive;
  $('#resWait').hidden = canDrive;
  $('#resFinale').hidden = !last;
  show('results');
  $('#resNext').hidden ? $('#resRetry').focus() : $('#resNext').focus();
}

function pause(on) {
  if (!app.L || app.results) return;
  app.paused = on;
  if (on) {
    $('#pauseOnline').hidden = app.mode !== 'online';
    $('#pRestart').hidden = false;
    $('#pLevels').hidden = app.mode === 'online' && !app.host;
    show('pause');
    $('#pResume').focus();
  } else show(null);
}

function quitToMenu() {
  if (app.mode === 'online') { net.send({ t: 'leave' }); net.close(); }
  app.mode = 'menu'; app.L = null; app.S = null; app.inGame = false; app.room = null;
  attract = null;
  show('menu');
  history.replaceState(null, '', '/');
}

// ---------------------------------------------------------------------------
// online

net.on('room', (m) => {
  app.room = m; app.me = m.you; app.host = m.host;
  history.replaceState(null, '', '/' + m.code);
  if (!app.inGame) renderLobby();
});
net.on('start', (m) => {
  app.inGame = true;
  app.seq = 0;
  beginLevel(m.level, m.st);
});
net.on('s', onSnapshot);
net.on('menu', () => {
  app.inGame = false; app.L = null; attract = null;
  renderLobby();
});
net.on('peer-left', () => {
  toast('Your partner left the room.');
  app.inGame = false; app.L = null; attract = null;
  renderLobby();
});
net.on('err', (m) => { toast(m.msg); if (!app.room) show('menu'); });
net.on('close', () => {
  if (app.mode === 'online') { toast('Disconnected from server.'); quitToMenu(); }
});

function renderLobby() {
  const r = app.room;
  if (!r) return;
  show('lobby');
  $('#lobbyCode').textContent = r.code;
  const two = r.players.length === 2;
  const slots = [SOL, LUNA].map(ch => r.players.find(p => p.char === ch));
  $('#slotSol').textContent = slots[0] ? (slots[0].char === app.me ? 'You' : 'Partner') : 'Waiting…';
  $('#slotLuna').textContent = slots[1] ? (slots[1].char === app.me ? 'You' : 'Partner') : 'Waiting…';
  $('#slotSol').parentElement.classList.toggle('me', app.me === SOL);
  $('#slotLuna').parentElement.classList.toggle('me', app.me === LUNA);
  $('#lobbyStatus').textContent = two
    ? (app.host ? 'Both here! Pick a level to begin.' : 'Both here! Waiting for the host to pick a level…')
    : 'Share the code (or link) with a friend so they can join.';
  $('#lobbyPick').hidden = !app.host;
  $('#lobbyPick').disabled = !two;
}

async function hostOnline() {
  app.mode = 'online';
  show('connecting');
  try { await net.connect(); } catch (e) { toast(e.message); show('menu'); app.mode = 'menu'; return; }
  net.send({ t: 'create' });
}
async function joinOnline(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { toast('Room codes are 5 characters.'); return; }
  app.mode = 'online';
  show('connecting');
  try { await net.connect(); } catch (e) { toast(e.message); show('menu'); app.mode = 'menu'; return; }
  net.send({ t: 'join', code });
}

// ---------------------------------------------------------------------------
// wiring

$('#btnLocal').onclick = () => { sfx.unlock(); sfx.ui(); app.mode = 'local'; openLevels(); };
$('#btnHost').onclick = () => { sfx.unlock(); sfx.ui(); hostOnline(); };
$('#joinForm').onsubmit = (e) => { e.preventDefault(); sfx.unlock(); sfx.ui(); joinOnline($('#joinCode').value); };
$('#btnHow').onclick = () => { sfx.ui(); show('how'); };
$$('[data-back]').forEach(b => b.onclick = () => {
  sfx.ui();
  if (app.mode === 'online' && app.room) renderLobby();
  else { app.mode = 'menu'; show('menu'); }
});
$('#btnMute').onclick = () => { const m = sfx.toggle(); $('#btnMute').textContent = m ? 'Sound: off' : 'Sound: on'; };
$('#btnMute').textContent = sfx.muted ? 'Sound: off' : 'Sound: on';

$('#lobbySwap').onclick = () => { sfx.ui(); net.send({ t: 'swap' }); };
$('#lobbyPick').onclick = () => { sfx.ui(); openLevels(); };
$('#lobbyLeave').onclick = () => { sfx.ui(); quitToMenu(); };
$('#lobbyCopy').onclick = async () => {
  const link = `${location.origin}/${app.room.code}`;
  try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); } catch { toast(link, 6000); }
};

$('#pResume').onclick = () => pause(false);
$('#pRestart').onclick = () => {
  if (app.mode === 'online') { net.send({ t: 'restart' }); pause(false); }
  else { beginLevel(app.level); }
};
$('#pLevels').onclick = () => {
  if (app.mode === 'online') { net.send({ t: 'menu' }); }
  else { app.L = null; attract = null; openLevels(); }
};
$('#pQuit').onclick = () => quitToMenu();

$('#resNext').onclick = () => {
  const n = app.level + 1;
  if (app.mode === 'online') net.send({ t: 'start', level: n }); else startLocal(n);
};
$('#resRetry').onclick = () => {
  if (app.mode === 'online') net.send({ t: 'start', level: app.level }); else startLocal(app.level);
};
$('#resLevels').onclick = () => {
  if (app.mode === 'online') { net.send({ t: 'menu' }); }
  else { app.L = null; attract = null; openLevels(); }
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (app.L && !app.results) { pause(!app.paused); e.preventDefault(); }
  }
  if (e.code === 'KeyR' && app.L && !app.results && document.activeElement?.tagName !== 'INPUT') {
    if (app.mode === 'local') beginLevel(app.level);
    else net.send({ t: 'restart' });
  }
});

// touch controls (online play on phones/tablets)
function bindTouch(id, bit) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); input.touch |= bit; el.classList.add('down'); };
  const off = (e) => { e.preventDefault(); input.touch &= ~bit; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
bindTouch('#tLeft', 1); bindTouch('#tRight', 2); bindTouch('#tJump', 4);
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// boot
window.__app = app;
fit();
show('menu');
requestAnimationFrame(frame);
const deep = location.pathname.slice(1).toUpperCase();
if (/^[A-Z0-9]{5}$/.test(deep)) { $('#joinCode').value = deep; joinOnline(deep); }
