// Sol & Luna — Runner 3D mode in the browser: local split screen on one keyboard, and online
// rooms with client prediction against the authoritative server. It mirrors runner-app.js
// (the 2D runner): same lifecycle, fixed 60 Hz ticks, pending inputs, decaying visual offsets.
// main.js creates one Runner3DMode and hands it the frame loop while it is active.
//
// Drawing goes to its own canvas (#game3d). The WebGL renderer (public/js/r3d/renderer.js) is
// loaded on first use; without it, or with ?r3ddebug=1, the 2D debug view draws instead.
// The HUD is DOM over that canvas.
import {
  buildRunner3d, createRunner3dState, stepRunner3d, cloneRunner3d, ensureGenerated, newSeed, survival, distance, speedAt, sectionAt,
  WHY3, R3_COUNT, R3_PLAY, R3_OVER, COUNT_TICKS, DRAW, LEAD_MAX,
} from '/shared/runner3d.js';
import { Runner3DDebugRenderer } from './runner3d-debug.js';

const SOL = 0, LUNA = 1;
const DT = 1000 / 60;
const $ = (s) => document.querySelector(s);
const NAME = ['Sol', 'Luna'];
const RESULT_DELAY = 70;   // ticks of the final moment before the results card
const TELEPORT = 2;        // units: don't interpolate across a jump this big
const OFF_MAX = 3;         // units: drop a visual correction bigger than this
const URGENT = 8, CRITICAL = 4;   // units between a player and the dusk
// read once at load: joining a room rewrites the URL to /CODE and drops the query
const DEBUG_VIEW = new URLSearchParams(location.search).has('r3ddebug');
// one line the first time each obstacle kind comes up, per player: [Sol's, Luna's] or one for both
const TIPS = {
  gaps: 'Gaps ahead. Run and jump across.',
  steps: 'Stairs. Low steps you walk, tall ones you jump.',
  thorns: 'Thorns! Slip through the opening, or jump the low ones.',
  pools: ['Sun pools are safe for you. Moon and shade pools are not.', 'Moon pools are safe for you. Sun and shade pools are not.'],
  tilt: 'Chained slabs tip toward your weight. Keep to the middle.',
  stones: 'Stepping stones. Pick a lane and keep hopping.',
  crumble: 'Ember slabs crack under your feet. Keep moving!',
  sweeper: 'A thorn arm sweeps the floor. Jump it, or slip in behind it.',
  eclipse: ['Only the gold stones hold you. The blue ones are Luna\'s.', 'Only the blue stones hold you. The gold ones are Sol\'s.'],
  beams: 'Narrow beams over the abyss. Steady now.',
  pendulum: 'Blades swing across the bridge. Time your run.',
  carousel: 'Stones circle the pillar. Hop on as one passes, off on the far side.',
  gate: 'The gap in the thorn curtain slides. Run through the gap.',
  orbs: 'Orbs roll your way. Step into another lane, or jump them.',
};
const TIP_AHEAD = 9;      // units: a section's tip shows when its start is this close ahead
const TIP_TICKS = 240;    // how long a tip stays up
const HELD_TIP = 'Too far ahead. The twilight holds you until the dusk comes closer.';

export class Runner3DMode {
  // ctx: { input, net, sfx, show(id), toast(msg), app, quit() }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.active = false;
    this.online = false;
    this.L = null; this.S = null;
    this.acc = 0;
    this.RR = null; this.rendKind = '';
    this.renderErrors = [];
    this.corr = { max: 0, back: 0, viewBack: 0, n: 0 };   // prediction corrections of your own player (units)
    this.canvas = $('#game3d');
    this.buildHud();
    this.buildTouch();
    this.wire();
    window.addEventListener('resize', () => { if (this.active) this.fit(); });
    window.__runner3d = this;   // for the browser check (tools/runner3d-browser.js)
  }

  // -------------------------------------------------------------------------
  // lifecycle

  startLocal(seed = newSeed()) {
    this.online = false;
    this.app.mode = 'local';
    this.begin(seed, null);
  }

  begin(seed, st) {
    this.L = buildRunner3d(seed);
    this.S = st ? cloneRunner3d(st) : createRunner3dState(this.L);
    this.cover(this.S);
    this.prev = this.capture(this.S);
    this.off = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    this.results = false; this.paused = false; this.acc = 0;
    this.pending = []; this.seq = 0; this.remoteBits = 0;
    this.heard = null; this.lastDrawn = null;
    this.tipSeen = [{}, {}]; this.tipShown = [null, null];
    this.corr = { max: 0, back: 0, viewBack: 0, n: 0 };
    this.active = true;
    this.input.mode3d = true;
    document.body.classList.add('r3d');
    this.hudEl.hidden = false;
    this.hudEl.classList.toggle('split', !this.online);
    this.hudEl.classList.toggle('single', this.online);
    this.hudEl.dataset.me = this.online ? String(this.app.me) : '';
    this.touchEl.hidden = !this.online;   // touch drives your own character online, like the other modes
    this.show(null);
    this.fit();
    this.loadRenderer();
    if (this.RR) this.RR.reset(this.L);
    const h = $('#hint');
    h.textContent = this.online
      ? `Run forward and stay ahead of the dusk. Last one standing wins. You are ${NAME[this.app.me]}: arrows or WASD, jump with Space.`
      : 'Run forward, stay ahead of the dusk. Sol: arrows, jump Right Shift or / · Luna: WASD, jump Space';
    h.classList.add('on');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), 5000);
  }

  stop() {
    if (!this.active && !this.L) return;
    this.active = false;
    this.L = null; this.S = null;
    this.results = false; this.paused = false;
    this.input.mode3d = false; this.input.touch3 = 0;
    document.body.classList.remove('r3d');
    this.hudEl.hidden = true;
    if (this.online) this.app.inGame = false;
  }

  // the server started a Runner 3D match (also used for rematches)
  onStart(m) {
    this.online = true;
    this.app.mode = 'online';
    this.app.inGame = true;
    this.begin(m.seed, m.st);
  }

  fit() {
    const c = this.canvas;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.size = [w, h];
    if (this.RR) this.RR.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
  }

  // The WebGL renderer is another agent's file and loads lazily; any failure (missing file,
  // no WebGL) falls back to the debug view on a fresh canvas.
  loadRenderer() {
    if (this.rendP) return this.rendP;
    const force = DEBUG_VIEW;
    this.rendP = (async () => {
      let R = null;
      if (!force) {
        try {
          const { Runner3DRenderer } = await import('/js/r3d/renderer.js');
          this.rendKind = 'webgl';   // set first: a constructor that throws may still have taken the canvas
          R = new Runner3DRenderer(this.canvas);
        } catch (e) {
          console.warn('Runner 3D: WebGL renderer unavailable, using the debug view.', e?.message || e);
          R = null;
        }
      }
      if (!R) this.useDebug();
      else this.RR = R;
      this.fit();
      if (this.L) this.RR.reset(this.L);
    })();
    return this.rendP;
  }

  // warm the module cache before a match so the countdown isn't spent downloading three.js
  prefetch() {
    if (this.pre || DEBUG_VIEW) return;
    this.pre = import('/js/r3d/renderer.js').catch(() => {});
  }

  useDebug() {
    // a canvas that already holds a WebGL context cannot give a 2D one: swap in a fresh one
    if (this.RR) { try { this.RR.dispose(); } catch {} }
    if (this.rendKind) { const c = this.canvas.cloneNode(false); this.canvas.replaceWith(c); this.canvas = c; }
    this.RR = new Runner3DDebugRenderer(this.canvas); this.rendKind = 'debug';
  }

  // -------------------------------------------------------------------------
  // simulation

  // A server state can name objects (up to S.hi) that this client's lazily generated course
  // doesn't have yet: generate up to them before stepping or drawing.
  cover(S) { while (this.L.objs.length < S.hi) ensureGenerated(this.L, this.L.z + 1); }

  capture(S) { return { zone: S.zone, p: S.p.map(p => ({ x: p.x, y: p.y, z: p.z })) }; }

  tickLocal() {
    if (this.paused || this.results) return;
    this.prev = this.capture(this.S);
    stepRunner3d(this.L, this.S, this.input.local3d());
    this.listen();
    if (this.S.phase === R3_OVER && this.S.phaseT >= RESULT_DELAY) this.showResults();
  }

  tickOnline() {
    if (this.results) return;
    const bits = this.paused ? 0 : this.input.any3d();
    this.seq++;
    this.net.send({ t: 'i', s: this.seq, b: bits });
    this.pending.push([this.seq, bits]);
    if (this.pending.length > 240) this.pending.shift();
    const inp = [0, 0];
    inp[this.app.me] = bits; inp[1 - this.app.me] = this.remoteBits;
    this.prev = this.capture(this.S);
    stepRunner3d(this.L, this.S, inp);
    this.listen();
    this.off.forEach((v, i) => {
      for (const k of ['x', 'y', 'z']) {
        let d = v[k] * 0.2;
        // drawn ahead of the corrected state while running forward: pay the difference off
        // slower than the run itself, so a late correction slows you instead of pulling you back
        const vz = this.S.p[i].vz;
        if (k === 'z' && d > 0 && vz > 0.02) d = Math.min(d, 0.6 * vz);
        v[k] -= d;
        if (Math.abs(v[k]) < 0.002) v[k] = 0;
      }
    });
  }

  onSnapshot(m) {
    if (!this.active || !this.online || !m.st || m.st.mode !== 'runner3d' || m.st.seed !== this.S.seed) return;
    const before = this.capture(this.S);
    const ns = m.st, me = this.app.me;
    this.cover(ns);
    this.remoteBits = m.inp[1 - me] | 0;
    this.pending = this.pending.filter(([s]) => s > (m.ack[me] | 0));
    const inp = [0, 0];
    for (const [, b] of this.pending) { inp[me] = b; inp[1 - me] = this.remoteBits; stepRunner3d(this.L, ns, inp); }
    const after = this.capture(ns);
    before.p.forEach((v, i) => {
      const o = this.off[i], a = after.p[i];
      o.x += v.x - a.x; o.y += v.y - a.y; o.z += v.z - a.z;
      if (Math.hypot(o.x, o.y, o.z) > OFF_MAX) { o.x = 0; o.y = 0; o.z = 0; }
      this.prev.p[i].x += a.x - v.x; this.prev.p[i].y += a.y - v.y; this.prev.p[i].z += a.z - v.z;
    });
    const mb = before.p[me], ma = after.p[me], err = Math.hypot(mb.x - ma.x, mb.y - ma.y, mb.z - ma.z);
    this.corr.n++;
    if (err > this.corr.max) this.corr.max = err;
    if (mb.z - ma.z > this.corr.back) this.corr.back = mb.z - ma.z;
    this.prev.zone += after.zone - before.zone;
    this.S = ns;
    if (ns.phase === R3_OVER && ns.phaseT >= RESULT_DELAY && !this.results) this.showResults();
  }

  view(alpha) {
    const S = this.S, P = this.prev, O = this.off, on = this.online;
    return {
      zone: P.zone + (S.zone - P.zone) * alpha,
      p: S.p.map((p, i) => {
        const a = P.p[i];
        if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) + Math.abs(a.z - p.z) > TELEPORT) return { x: p.x, y: p.y, z: p.z };
        return {
          x: a.x + (p.x - a.x) * alpha + (on ? O[i].x : 0),
          y: a.y + (p.y - a.y) * alpha + (on ? O[i].y : 0),
          z: a.z + (p.z - a.z) * alpha + (on ? O[i].z : 0),
        };
      }),
    };
  }

  // fixed 60 Hz ticks and a frame; called by main.js instead of its own loop
  frame(dt, now) {
    if (!this.S) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.acc -= DT; n++;
      if (this.online) this.tickOnline(); else this.tickLocal();
    }
    if (n === 8) this.acc = 0;
    if (!this.S) return;   // a tick can end the match (results → menu)
    const alpha = this.paused && !this.online ? 1 : Math.min(1, this.acc / DT);
    const v = this.view(alpha);
    if (this.online && this.S.phase === R3_PLAY && this.lastDrawn !== null && this.S.p[this.app.me].alive) {
      const back = this.lastDrawn - v.p[this.app.me].z;
      if (back > this.corr.viewBack && (this.input.any3d() & 8)) this.corr.viewBack = back;   // drawn backwards while holding forward
    }
    this.lastDrawn = v.p[this.app.me]?.z ?? null;
    this.hud(v);
    if (this.RR) {
      try { this.RR.draw(this.L, this.S, v, now / 1000, { split: !this.online, me: this.online ? this.app.me : 0, paused: this.paused }); this.frames = (this.frames || 0) + 1; }
      catch (e) {
        this.renderErrors.push(String(e?.stack || e));
        console.error('Runner 3D: renderer failed, switching to the debug view.', e);
        if (this.rendKind !== 'debug') { this.useDebug(); this.fit(); this.RR.reset(this.L); }
      }
    }
  }

  // sounds from state changes; only forward progress plays anything, so rollback is silent
  listen() {
    const S = this.S, sfx = this.sfx;
    const cur = { tick: S.tick, jump: S.p.map(p => p.jumpN), alive: S.p.map(p => p.alive), phase: S.phase, cd: S.phase === R3_COUNT ? Math.ceil((COUNT_TICKS - S.phaseT) / 60) : 0 };
    const h = this.heard;
    this.heard = cur;
    if (!h || cur.tick < h.tick) return;
    S.p.forEach((p, i) => { if (p.jumpN > h.jump[i]) sfx.jump(i); });
    if (cur.cd && cur.cd !== h.cd) sfx.click();
    if (cur.phase === R3_PLAY && h.phase === R3_COUNT) sfx.door();
    if (cur.alive.some((a, i) => !a && h.alive[i])) sfx.die();
    if (cur.phase === R3_PLAY) {
      const mine = this.online ? [this.app.me] : [0, 1];
      // the dusk closing in: a tick that quickens as it nears your player
      const gap = Math.min(...mine.map(i => (S.p[i].alive ? S.p[i].z - S.zone : 1e9)));
      if (gap < URGENT) {
        const every = Math.round(12 + (gap / URGENT) * 30);
        if (!this.duskT || cur.tick - this.duskT >= every || cur.tick < this.duskT) { this.duskT = cur.tick; sfx.tock(); }
      }
      // an ember slab cracking under one of your players
      for (const i of mine) {
        const p = S.p[i], o = p.alive && p.gr && p.gref >= 0 ? S.o[p.gref] : null;
        if (o && o.st === 1 && o.t === 0) sfx.lever();
        const held = this.isHeld(i);
        if (held && !this.wasHeld?.[i]) sfx.click();
        (this.wasHeld ||= [false, false])[i] = held;
      }
    }
    if (cur.phase === R3_OVER && h.phase !== R3_OVER) setTimeout(() => (S.win === DRAW ? sfx.door() : sfx.win()), 500);
  }

  // -------------------------------------------------------------------------
  // HUD (DOM over the 3D canvas)

  buildHud() {
    const el = document.createElement('div');
    el.id = 'r3Hud'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    const pl = (k) => `<div class="r3-pl ${k}"><div class="r3-name"></div><div class="r3-dist"></div>`
      + `<div class="r3-meter"><i></i><span></span></div><div class="r3-held">held by the twilight</div></div><div class="r3-edge ${k}"></div><div class="r3-tip ${k}"></div>`;
    el.innerHTML = `<div class="r3-split"></div><div class="r3-top"><b class="r3-time"></b><span class="r3-pace"></span><span class="r3-ping"></span></div>`
      + pl('sol') + pl('luna') + '<div class="r3-count"></div><div class="r3-banner"></div>';
    this.canvas.after(el);
    this.hudEl = el;
    const q = (s) => el.querySelector(s);
    this.h = {
      time: q('.r3-time'), pace: q('.r3-pace'), ping: q('.r3-ping'), count: q('.r3-count'), banner: q('.r3-banner'),
      pl: ['sol', 'luna'].map(k => ({
        box: q(`.r3-pl.${k}`), name: q(`.r3-pl.${k} .r3-name`), dist: q(`.r3-pl.${k} .r3-dist`),
        meter: q(`.r3-pl.${k} .r3-meter`), fill: q(`.r3-pl.${k} .r3-meter i`), gap: q(`.r3-pl.${k} .r3-meter span`), edge: q(`.r3-edge.${k}`),
        tip: q(`.r3-tip.${k}`), held: q(`.r3-pl.${k} .r3-held`),
      })),
    };
    this.hudCache = new Map();
  }

  // set a property only when it changes (the HUD updates every frame)
  set(el, key, val) {
    const c = this.hudCache.get(el) || {};
    if (c[key] === val) return;
    c[key] = val; this.hudCache.set(el, c);
    if (key === 'text') el.textContent = val;
    else if (key === 'class') el.className = val;
    else if (key[0] === '-') el.style.setProperty(key, val);
    else el.style[key] = val;
  }

  hud(v) {
    const S = this.S, L = this.L, H = this.h;
    const end = S.phase === R3_OVER ? Math.max(S.dead[0], S.dead[1], 0) : S.tick;
    this.set(H.time, 'text', fmtTime(Math.max(0, end - COUNT_TICKS) / 60));
    const pace = S.phase === R3_COUNT ? 1 : S.v / speedAt(0);
    this.set(H.pace, 'text', `pace ×${pace.toFixed(2)}`);
    this.set(H.ping, 'text', this.online ? `${Math.round(this.net.rtt)} ms` : '');
    for (const i of [SOL, LUNA]) {
      const p = S.p[i], e = H.pl[i];
      const mine = !this.online || this.app.me === i;
      this.set(e.name, 'text', NAME[i] + (this.online && this.app.me === i ? ' (you)' : ''));
      const d = Math.floor(distance(L, S, i));
      this.set(e.dist, 'text', p.alive ? `${d} m` : `lost · ${d} m`);
      const gap = Math.max(0, v.p[i].z - v.zone);
      const lvl = !p.alive ? 'lost' : gap < CRITICAL ? 'critical' : gap < URGENT ? 'urgent' : '';
      this.set(e.box, 'class', `r3-pl ${i ? 'luna' : 'sol'} ${lvl}`);
      this.set(e.fill, 'width', `${Math.min(100, (gap / LEAD_MAX) * 100).toFixed(1)}%`);
      this.set(e.gap, 'text', p.alive ? `dusk ${gap.toFixed(gap < 10 ? 1 : 0)} m behind` : WHY3[S.why[i]] || 'lost');
      const warn = p.alive && mine && S.phase === R3_PLAY ? Math.max(0, Math.min(1, (URGENT + 2 - gap) / (URGENT + 2 - CRITICAL / 2))) : 0;
      this.set(e.edge, 'opacity', warn.toFixed(2));
      this.set(e.edge, 'class', `r3-edge ${i ? 'luna' : 'sol'}${warn > 0.6 ? ' pulse' : ''}`);
      // held by the lead cap: standing on a run-up more than LEAD_MAX ahead of the dusk
      const held = this.isHeld(i);
      this.set(e.held, 'opacity', held ? '1' : '0');
      // a one-line tip the first time each obstacle kind comes up
      const tip = mine && p.alive && S.phase === R3_PLAY ? this.tipFor(i) : null;
      this.set(e.tip, 'text', tip || '');
      this.set(e.tip, 'opacity', tip ? '1' : '0');
    }
    // countdown, then "Run!"
    let txt = '', op = 0, sc = 1;
    if (S.phase === R3_COUNT || (S.phase === R3_PLAY && S.phaseT < 45)) {
      const counting = S.phase === R3_COUNT;
      const f = counting ? 1 - ((COUNT_TICKS - S.phaseT) % 60) / 60 : S.phaseT / 45;
      txt = counting ? String(Math.ceil((COUNT_TICKS - S.phaseT) / 60)) : 'Run!';
      op = counting ? 1 : 1 - f;
      sc = 1 + 0.35 * (1 - Math.min(1, f * 3));
    }
    this.set(H.count, 'text', txt);
    this.set(H.count, 'opacity', op.toFixed(2));
    this.set(H.count, 'transform', `translate(-50%, -50%) scale(${sc.toFixed(3)})`);
    const over = S.phase === R3_OVER;
    this.set(H.banner, 'text', over ? (S.win === DRAW ? 'A draw!' : `${NAME[S.win]} wins!`) : '');
    this.set(H.banner, 'class', `r3-banner ${S.win === SOL ? 'solc' : S.win === LUNA ? 'lunac' : ''}`);
    this.set(H.banner, 'opacity', over ? Math.min(1, S.phaseT / 20).toFixed(2) : '0');
  }

  isHeld(i) {
    const S = this.S, p = S.p[i], o = p.alive && p.gr && p.gref >= 0 ? this.L.objs[p.gref] : null;
    return !!o && o.skin === 1 && p.z - S.zone > LEAD_MAX - 0.3 && S.phase === R3_PLAY;
  }

  // the tip player i should see now (or null): the next section's kind the first time it comes up,
  // or the lead-cap note the first time the cap holds them
  tipFor(i) {
    const S = this.S, p = S.p[i], seen = this.tipSeen[i], cur = this.tipShown[i];
    if (cur && S.tick < cur.until && S.tick >= cur.from) return cur.text;
    const sec = sectionAt(this.L, p.z + TIP_AHEAD);
    let text = null, key = null;
    if (this.isHeld(i) && !seen.held) { key = 'held'; text = HELD_TIP; }
    else if (sec && TIPS[sec.kind] && !seen[sec.kind] && sec.z0 > p.z - 2) { key = sec.kind; const t = TIPS[sec.kind]; text = Array.isArray(t) ? t[i] : t; }
    if (!key) return null;
    seen[key] = 1;
    this.tipShown[i] = { text, from: S.tick, until: S.tick + TIP_TICKS };
    return text;
  }

  // touch: a left-thumb pad for 8-way movement and a jump button (touch devices only)
  buildTouch() {
    const el = document.createElement('div');
    el.id = 'r3Touch'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="r3-stick"><i></i></div><button class="r3-jump" type="button">▲</button>';
    document.querySelector('#stage').append(el);
    this.touchEl = el;
    const stick = el.querySelector('.r3-stick'), knob = stick.querySelector('i'), jump = el.querySelector('.r3-jump');
    let pid = null;
    const move = (e) => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
      const t = 0.38;
      this.input.touch3 = (this.input.touch3 & 4) | (dx < -t ? 1 : 0) | (dx > t ? 2 : 0) | (dy < -t ? 8 : 0) | (dy > t ? 16 : 0);
    };
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null; knob.style.transform = ''; this.input.touch3 &= 4;
    };
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; stick.setPointerCapture(pid); move(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jOn = (e) => { e.preventDefault(); this.input.touch3 |= 4; jump.classList.add('down'); };
    const jOff = (e) => { e.preventDefault(); this.input.touch3 &= ~4; jump.classList.remove('down'); };
    jump.addEventListener('pointerdown', jOn); jump.addEventListener('pointerup', jOff);
    jump.addEventListener('pointercancel', jOff); jump.addEventListener('pointerleave', jOff);
  }

  // -------------------------------------------------------------------------
  // screens

  showResults() {
    this.results = true;
    const S = this.S, L = this.L;
    $('#r3Title').textContent = S.win === DRAW ? 'A draw!' : `${NAME[S.win]} wins!`;
    $('#r3Title').className = S.win === SOL ? 'solc' : S.win === LUNA ? 'lunac' : '';
    $('#r3Sub').textContent = S.win === DRAW ? 'Both fell on the very same moment.' : `${NAME[S.win]} outlasted ${NAME[1 - S.win]}.`;
    for (const i of [SOL, LUNA]) {
      const k = NAME[i];
      // a winner still running stops the clock when the match ends, so both clients show the same time
      const end = Math.max(S.dead[0], S.dead[1]);
      $(`#r3${k}Time`).textContent = fmtTime(S.p[i].alive && end >= 0 ? Math.max(0, end - COUNT_TICKS) / 60 : survival(S, i));
      $(`#r3${k}Dist`).textContent = `${Math.floor(distance(L, S, i))} m`;
      $(`#r3${k}Why`).textContent = S.p[i].alive ? 'still running' : WHY3[S.why[i]] || 'lost';
      $(`#r3${k}`).classList.toggle('won', S.win === i);
    }
    $('#r3Menu').textContent = this.online ? 'Back to room' : 'Main menu';
    this.show('r3Results');
    $('#r3Again').focus();
  }

  pause(on) {
    if (!this.active || this.results) return;
    this.paused = on;
    if (on) {
      $('#r3pOnline').hidden = !this.online;
      $('#r3pRestart').textContent = this.online ? 'New course (restarts for both)' : 'New course';
      $('#r3pRoom').hidden = !this.online;
      this.show('r3Pause');
      $('#r3pResume').focus();
    } else this.show(null);
  }

  rematch() {
    this.sfx.ui();
    if (this.online) this.net.send({ t: 'start', mode: 'runner3d' });
    else this.startLocal();
  }

  wire() {
    $('#btnRunner3d').onclick = () => { this.sfx.unlock(); this.sfx.ui(); this.startLocal(); };
    $('#lobbyRunner3d').onclick = () => { this.sfx.ui(); this.net.send({ t: 'start', mode: 'runner3d' }); };
    this.net.on('room', (m) => { $('#lobbyRunner3d').disabled = m.players.length < 2; if (m.players.length === 2) this.prefetch(); });
    for (const ev of ['pointerenter', 'focus']) $('#btnRunner3d').addEventListener(ev, () => this.prefetch());
    this.net.on('s', (m) => this.onSnapshot(m));
    this.net.on('start', (m) => { if (m.mode !== 'runner3d') this.stop(); });
    this.net.on('menu', () => this.stop());
    this.net.on('peer-left', () => this.stop());
    $('#r3Again').onclick = () => this.rematch();
    $('#r3Menu').onclick = () => {
      this.sfx.ui();
      if (this.online) this.net.send({ t: 'menu' });
      else { this.stop(); this.quit(); }
    };
    $('#r3pResume').onclick = () => this.pause(false);
    $('#r3pRestart').onclick = () => { this.paused = false; this.rematch(); };
    $('#r3pRoom').onclick = () => { this.sfx.ui(); this.net.send({ t: 'menu' }); };
    $('#r3pQuit').onclick = () => { this.stop(); this.quit(); };
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target.closest && e.target.closest('input, textarea'))) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!this.results) { this.pause(!this.paused); e.preventDefault(); } }
      else if (e.code === 'KeyR' && !this.results && !this.paused) this.rematch();
    });
  }
}

function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; }
