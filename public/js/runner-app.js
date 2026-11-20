// Sol & Luna — Runner mode in the browser: local versus on one keyboard, and online rooms
// against the authoritative server. Online sync (your prediction, the other player drawn from
// snapshots, deaths only from the server) is runner-sync.js; see docs/netcode.md.
// main.js creates one RunnerMode and hands it the shared canvas, input, network and screens.
import { TS, WORLD_W, WORLD_H, TICK_RATE, SOL, LUNA } from '/shared/sim.js';
import {
  buildRunner, createRunnerState, stepRunner, cloneRunner, newSeed, survival, distance, speedAt,
  RPH_COUNT, RPH_PLAY, RPH_OVER, COUNT_TICKS, DRAW,
} from '/shared/runner.js';
import { RunnerRenderer } from './runner-render.js';
import { createSync, SIM2D } from './runner-sync.js';

const DT = 1000 / TICK_RATE;
const $ = (s) => document.querySelector(s);
const NAME = ['Sol', 'Luna'];
const WHY = {
  edge: 'caught by the dusk', fall: 'fell into the abyss', pool: 'touched a hostile pool',
  thorn: 'ran into thorns', shard: 'hit by a falling shard',
};
const RESULT_DELAY = 70;   // ticks of the final moment before the results card

export class RunnerMode {
  // ctx: { R, input, net, sfx, show(id), toast(msg), app, quit() }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.RR = new RunnerRenderer(ctx.R);
    this.active = false;
    this.online = false;
    this.L = null; this.S = null;
    this.acc = 0;
    this.wire();
    window.__runner = this;   // for the browser checks (tools/runner-browser.js), like window.__app
  }

  // -------------------------------------------------------------------------
  // lifecycle

  startLocal(seed = newSeed()) {
    this.online = false;
    this.app.mode = 'local';
    this.begin(seed, null);
  }

  begin(seed, st) {
    this.L = buildRunner(seed);
    this.S = st ? cloneRunner(st) : createRunnerState(this.L);
    this.prev = this.capture(this.S);
    this.results = false; this.paused = false; this.acc = 0;
    this.heard = null;
    // online: the sync owns the prediction; this.S becomes the state it shows, each frame
    this.sync = this.online ? createSync(SIM2D, { L: this.L, st: this.S, me: this.app.me, send: (m) => this.net.send(m), now: performance.now() }) : null;
    this.RR.reset(this.L);
    this.active = true;
    this.show(null);
    const h = $('#hint');
    h.removeAttribute('style');   // co-op levels place the hint per room (main.js); the runner keeps the default
    h.textContent = this.online
      ? `Run right and stay ahead of the dusk. Last one standing wins. You are ${NAME[this.app.me]}.`
      : 'Run right and stay ahead of the dusk. Last one standing wins. Sol: arrows · Luna: WASD';
    h.classList.add('on');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), 5000);
  }

  stop() {
    this.active = false;
    this.L = null; this.S = null;
    this.results = false; this.paused = false;
    this.R.particles = [];
    if (this.online) this.app.inGame = false;
  }

  // the server started a runner match (also used for rematches)
  onStart(m) {
    this.online = true;
    this.app.mode = 'online';
    this.app.inGame = true;
    this.begin(m.seed, m.st);
  }

  // -------------------------------------------------------------------------
  // simulation

  capture(S) { return { cam: S.cam, p: S.p.map(p => ({ x: p.x, y: p.y })) }; }

  tickLocal() {
    if (this.paused || this.results) return;
    this.prev = this.capture(this.S);
    stepRunner(this.L, this.S, this.input.local());
    this.listen();
    if (this.S.phase === RPH_OVER && this.S.phaseT >= RESULT_DELAY) this.showResults();
  }

  onSnapshot(m) {
    if (!this.active || !this.online || !this.sync || this.results) return;
    this.sync.onSnapshot(m, performance.now());
  }

  view(alpha) {
    if (this.online) return this.drawn;
    const S = this.S, P = this.prev;
    return {
      cam: P.cam + (S.cam - P.cam) * alpha,
      p: S.p.map((p, i) => {
        const a = P.p[i];
        if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 40) return { x: p.x, y: p.y };
        return { x: a.x + (p.x - a.x) * alpha, y: a.y + (p.y - a.y) * alpha };
      }),
    };
  }

  // fixed 60 Hz ticks and a frame; called by main.js instead of its own loop
  frame(dt, now) {
    if (!this.S) return;
    if (this.online) {
      // ticks, the other player's clock and what to draw all come from the sync
      // a paused room (net-pause.js) runs no ticks and sends no inputs
      this.paused = !this.pz.running(now);
      if (!this.results) this.sync.frame(dt, () => this.input.any(), now, this.pz);
      const d = this.sync.draw();
      this.S = d.S;
      this.drawn = d.v;
      this.listen();
      if (this.S.phase === RPH_OVER && this.S.phaseT >= RESULT_DELAY && !this.results) this.showResults();
      this.RR.draw(this.L, this.S, this.drawn, now / 1000);
      this.hud(now / 1000);
      return;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.acc -= DT; n++;
      this.tickLocal();
    }
    if (n === 8) this.acc = 0;
    const alpha = this.paused ? 1 : Math.min(1, this.acc / DT);
    const v = this.drawn = this.view(alpha);   // what was drawn, for the browser checks
    this.RR.draw(this.L, this.S, v, now / 1000);
    this.hud(now / 1000);
  }

  // sounds from state changes; only forward progress plays anything, so rollback is silent
  listen() {
    const S = this.S, sfx = this.sfx;
    const cur = { tick: S.tick, jump: S.p.map(p => p.jumpN), alive: S.p.map(p => p.alive), phase: S.phase, cd: S.phase === RPH_COUNT ? Math.ceil((COUNT_TICKS - S.phaseT) / 60) : 0, o: {} };
    for (let i = S.lo; i < S.hi; i++) if (S.o[i]) cur.o[i] = S.o[i].st;
    const h = this.heard;
    this.heard = cur;
    if (!h || cur.tick < h.tick) return;
    S.p.forEach((p, i) => { if (p.jumpN > h.jump[i]) sfx.jump(i); });
    if (cur.cd && cur.cd !== h.cd) sfx.click();
    if (cur.phase === RPH_PLAY && h.phase === RPH_COUNT) sfx.door();
    if (cur.alive.some((a, i) => !a && h.alive[i])) sfx.die();
    if (cur.phase === RPH_OVER && h.phase !== RPH_OVER) setTimeout(() => (S.win === DRAW ? sfx.door() : sfx.win()), 500);
    for (const k in cur.o) {
      const o = this.L.objs[k];
      if (h.o[k] === undefined || h.o[k] === cur.o[k]) continue;
      if (o.k === 'slab' && cur.o[k] === 1) sfx.click();
      if (o.k === 'shard' && cur.o[k] === 2) sfx.lever();
    }
  }

  // -------------------------------------------------------------------------
  // HUD (canvas, world units)

  hud(time) {
    const R = this.R, g = R.ctx, S = this.S, L = this.L;
    g.setTransform(R.scale, 0, 0, R.scale, 0, 0);
    const end = S.phase === RPH_OVER ? Math.max(S.dead[0], S.dead[1]) : S.tick;
    const secs = Math.max(0, end - COUNT_TICKS) / 60;
    const w = 150, x = WORLD_W / 2 - w / 2, y = 4;
    g.fillStyle = 'rgba(18,12,30,0.72)'; plaque(g, x, y, w, 34, 10); g.fill();
    g.strokeStyle = 'rgba(214,196,255,0.35)'; g.lineWidth = 1.5; g.stroke();
    g.font = '600 20px "Cinzel", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4ecff'; g.fillText(fmtTime(secs), WORLD_W / 2, y + 18);
    g.font = '600 11px Nunito, system-ui, sans-serif'; g.fillStyle = 'rgba(240,230,255,0.6)';
    const pace = S.phase === RPH_COUNT ? 1 : speedAt(S.cam) / speedAt(0);
    g.fillText(`pace ×${pace.toFixed(2)}`, WORLD_W / 2, y + 46);
    // players
    for (const i of [SOL, LUNA]) {
      const p = S.p[i], left = i === SOL;
      const px = left ? 14 : WORLD_W - 14;
      g.textAlign = left ? 'left' : 'right';
      g.font = '700 16px "Cinzel", Georgia, serif';
      g.fillStyle = p.alive ? (left ? '#ffd27a' : '#a9e3ff') : 'rgba(240,230,255,0.4)';
      const you = this.online && this.app.me === i ? ' (you)' : '';
      g.fillText(NAME[i] + you, px, 19);
      g.font = '600 13px Nunito, system-ui, sans-serif';
      g.fillStyle = p.alive ? 'rgba(240,230,255,0.8)' : 'rgba(240,230,255,0.4)';
      g.fillText(p.alive ? `${Math.floor(distance(L, S, i))} m` : `lost · ${Math.floor(distance(L, S, i))} m`, px, 38);
    }
    // a player ahead of the view: an arrow on the right edge at their height
    const v = this.view(1);
    for (const i of [SOL, LUNA]) {
      const p = S.p[i];
      const ahead = (v.p[i].x - v.cam - WORLD_W + p.w / 2) / TS;
      if (!p.alive || ahead < -0.3) continue;
      const y = Math.max(70, Math.min(WORLD_H - 30, v.p[i].y + p.h / 2));
      g.fillStyle = i === SOL ? '#ffb238' : '#6cc8ff';
      g.beginPath(); g.moveTo(WORLD_W - 4, y); g.lineTo(WORLD_W - 18, y - 10); g.lineTo(WORLD_W - 18, y + 10); g.closePath(); g.fill();
      g.font = '700 12px Nunito, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(`+${Math.max(0, ahead).toFixed(0)}`, WORLD_W - 22, y + 4);
    }
    if (this.online) {
      g.textAlign = 'right'; g.font = '500 12px Nunito, system-ui, sans-serif'; g.fillStyle = 'rgba(240,230,255,0.5)';
      g.fillText(`${Math.round(this.net.rtt)} ms`, WORLD_W - 14, 56);
    }
    // countdown
    if (S.phase === RPH_COUNT || (S.phase === RPH_PLAY && S.phaseT < 45)) {
      const counting = S.phase === RPH_COUNT;
      const n = counting ? Math.ceil((COUNT_TICKS - S.phaseT) / 60) : 0;
      const f = counting ? 1 - ((COUNT_TICKS - S.phaseT) % 60) / 60 : S.phaseT / 45;
      const sc = 1 + 0.35 * (1 - Math.min(1, f * 3));
      g.save(); g.translate(WORLD_W / 2, WORLD_H * 0.36); g.scale(sc, sc);
      g.globalAlpha = counting ? 1 : 1 - f;
      g.font = '700 84px "Cinzel", Georgia, serif'; g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = 'rgba(18,12,30,0.8)';
      const txt = counting ? String(n) : 'Run!';
      g.strokeText(txt, 0, 0);
      const grd = g.createLinearGradient(-90, 0, 90, 0);
      grd.addColorStop(0, '#ffd27a'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#a9e3ff');
      g.fillStyle = grd; g.fillText(txt, 0, 0);
      g.restore();
    }
    if (S.phase === RPH_OVER) {
      const k = Math.min(1, S.phaseT / 20);
      g.globalAlpha = k;
      g.font = '700 44px "Cinzel", Georgia, serif'; g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = 'rgba(18,12,30,0.8)';
      const txt = S.win === DRAW ? 'A draw!' : `${NAME[S.win]} wins!`;
      g.strokeText(txt, WORLD_W / 2, WORLD_H * 0.4);
      g.fillStyle = S.win === SOL ? '#ffd27a' : S.win === LUNA ? '#a9e3ff' : '#f4ecff';
      g.fillText(txt, WORLD_W / 2, WORLD_H * 0.4);
      g.globalAlpha = 1;
    }
  }

  // -------------------------------------------------------------------------
  // screens

  showResults() {
    this.results = true;
    const S = this.S, L = this.L;
    $('#rrTitle').textContent = S.win === DRAW ? 'A draw!' : `${NAME[S.win]} wins!`;
    $('#rrTitle').className = S.win === SOL ? 'solc' : S.win === LUNA ? 'lunac' : '';
    $('#rrSub').textContent = S.win === DRAW ? 'Both fell on the very same moment.' : `${NAME[S.win]} outlasted ${NAME[1 - S.win]}.`;
    for (const i of [SOL, LUNA]) {
      const k = i === SOL ? 'Sol' : 'Luna';
      // a winner still running is timed to the server's end of the match (the last death),
      // not to when this client shows the card, so both clients show the same time
      const end = Math.max(S.dead[0], S.dead[1]);
      const secs = S.p[i].alive ? Math.max(0, (end >= 0 ? end : S.tick - S.phaseT) - COUNT_TICKS) / 60 : survival(S, i);
      $(`#rr${k}Time`).textContent = fmtTime(secs);
      $(`#rr${k}Dist`).textContent = `${Math.floor(distance(L, S, i))} m`;
      $(`#rr${k}Why`).textContent = S.p[i].alive ? 'still running' : WHY[S.why[i]] || 'lost';
      $(`#rr${k}`).classList.toggle('won', S.win === i);
    }
    $('#rrMenu').textContent = this.online ? 'Back to room' : 'Main menu';
    this.show('runnerResults');
    $('#rrAgain').focus();
  }

  pause(on) {
    if (!this.active || this.results) return;
    if (this.online) {
      // the room's pause, for both players (main.js pauseFrame shows it); none in the 3-2-1 before the start
      if (on && this.S.phase === RPH_COUNT) return;
      this.askPause(on);
      return;
    }
    this.paused = on;
    if (on) this.openPause();
    else this.show(null);
  }

  openPause() {
    $('#rpOnline').hidden = !this.online;
    $('#rpRestart').textContent = this.online ? 'New course (restarts for both)' : 'New course';
    $('#rpRoom').hidden = !this.online;
    this.show('runnerPause');
    $('#rpResume').focus();
  }
  get pauseSpec() { return { screen: 'runnerPause', note: '#rpOnline', open: () => this.openPause() }; }

  rematch() {
    this.sfx.ui();
    if (this.online) this.net.send({ t: 'start', mode: 'runner' });
    else this.startLocal();
  }

  wire() {
    $('#btnRunner').onclick = () => { this.sfx.unlock(); this.sfx.ui(); this.startLocal(); };
    $('#lobbyRunner').onclick = () => { this.sfx.ui(); this.net.send({ t: 'start', mode: 'runner' }); };
    this.net.on('room', (m) => { $('#lobbyRunner').disabled = m.players.length < 2; });
    this.net.on('s', (m) => this.onSnapshot(m));
    this.net.on('menu', () => this.stop());
    this.net.on('peer-left', () => this.stop());
    $('#rrAgain').onclick = () => this.rematch();
    $('#rrMenu').onclick = () => {
      this.sfx.ui();
      if (this.online) this.net.send({ t: 'menu' });
      else { this.stop(); this.quit(); }
    };
    $('#rpResume').onclick = () => this.pause(false);
    $('#rpRestart').onclick = () => { this.paused = false; this.rematch(); };
    $('#rpRoom').onclick = () => { this.sfx.ui(); this.net.send({ t: 'menu' }); };
    $('#rpQuit').onclick = () => { this.stop(); this.quit(); };
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target.closest && e.target.closest('input, textarea'))) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!this.results) { this.pause(this.online ? !this.pz.paused() : !this.paused); e.preventDefault(); } }
      else if (e.code === 'KeyR' && !this.results && !this.paused) this.rematch();
    });
  }
}

function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
function plaque(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.closePath(); }
