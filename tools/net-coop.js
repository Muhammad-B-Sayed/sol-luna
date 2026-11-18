// The online co-op and Dodgeball client of public/js/main.js (tickOnline, onSnapshot, the view
// offsets), with the drawing and the DOM left out, for tools/check-netcode.js. Keep it in step
// with main.js. Two schemes:
//   base  main.js at 4be5032: a frame over 250 ms is one tick, at most 8 ticks per frame and the
//         rest dropped, no pacing, every unacked input replayed
//   new   the stalled tab catches up, pacing from the server's qm, the replay skips inputs the
//         server's hold already covered (public/js/net-pace.js)
import { cloneState, step, PH_PLAY, PH_DEAD, PH_WON } from '../shared/sim.js';
import { stepDodge } from '../shared/dodge.js';
import { paceRate, unapplied, MAX_TICKS_PER_FRAME, MAX_BACKLOG } from '../public/js/net-pace.js';

const DT = 1000 / 60;
const REMOTE_CAP = 240, REMOTE_EASE = 6;

// main.js predictStep: online, the prediction never kills anyone and never wins the level
function predictStep(L, S, inp) {
  if (L.dodge) { stepDodge(L, S, inp); return; }
  const ph = S.phase, phT = S.phaseT, who = S.deadWho;
  step(L, S, inp);
  if (ph === PH_PLAY && S.phase === PH_DEAD) { S.p[S.deadWho].alive = true; S.phase = ph; S.phaseT = phT; S.deadWho = who; }
  else if (ph === PH_PLAY && S.phase === PH_WON) { S.phase = ph; S.phaseT = phT; }
}

function capture(S) {
  return { p: S.p.map(p => ({ x: p.x, y: p.y })), b: S.b.map(b => ({ x: b.x, y: b.y })), pl: S.pl.map(q => ({ x: q.x, y: q.y })),
    ball: S.d ? { x: S.d.ball.x, y: S.d.ball.y } : null };
}
function zeroOff(S) {
  return { p: S.p.map(() => ({ x: 0, y: 0 })), b: S.b.map(() => ({ x: 0, y: 0 })), pl: S.pl.map(() => ({ x: 0, y: 0 })), ball: { x: 0, y: 0 } };
}
function easeOff(v) {
  const m = Math.hypot(v.x, v.y);
  if (m < 0.05) { v.x = 0; v.y = 0; return; }
  const k = Math.max(0.8, (m - REMOTE_EASE) / m);
  v.x *= k; v.y *= k;
}

export class CoopClient {
  // hooks: onState(S, src) after every predicted tick ('tick') and every snapshot replay ('snap')
  constructor(L, st, me, send, { scheme = 'new', onState = null } = {}) {
    this.L = L; this.me = me; this.send = send; this.scheme = scheme; this.onState = onState;
    this.S = cloneState(st);
    this.prev = capture(this.S); this.off = zeroOff(this.S);
    this.pending = []; this.seq = 0; this.remoteBits = 0; this.acc = 0; this.alpha = 1; this.qm = null;
    this.corr = [];                 // own-player corrections at each snapshot (px)
    this.intended = new Map();      // seq -> [tick the prediction applied it to, bits, dodge phase]
  }
  frame(dt, readBits) {
    let n = 0;
    if (this.scheme === 'base') {
      if (dt > 250) dt = DT;
      this.acc += dt;
      while (this.acc >= DT && n < 8) { this.acc -= DT; n++; this.tick(readBits()); }
      if (n === 8) this.acc = 0;
    } else {
      this.acc = Math.min(this.acc + dt * paceRate(this.qm), MAX_BACKLOG);
      while (this.acc >= DT && n < MAX_TICKS_PER_FRAME) { this.acc -= DT; n++; this.tick(readBits()); }
    }
    this.alpha = Math.min(1, this.acc / DT);
    return n;
  }
  predTick() { return this.S.tick; }
  tick(bits) {
    if (this.results) return;   // main.js: the results card or the winner screen is up
    const me = this.me;
    this.seq++;
    this.send({ t: 'i', s: this.seq, b: bits });
    this.pending.push([this.seq, bits]);
    if (this.pending.length > 240) this.pending.shift();
    this.intended.set(this.seq, [this.S.tick, bits, this.S.d ? this.S.d.phase : -1]);
    const inp = [0, 0];
    inp[me] = bits; inp[1 - me] = this.remoteBits;
    this.prev = capture(this.S);
    predictStep(this.L, this.S, inp);
    this.decayOff();
    if (this.onState) this.onState(this.S, 'tick');
  }
  decayOff() {
    const o = this.off;
    o.p.forEach((v, i) => { if (i !== this.me) { easeOff(v); return; } v.x *= 0.8; v.y *= 0.8; if (Math.abs(v.x) < 0.05) v.x = 0; if (Math.abs(v.y) < 0.05) v.y = 0; });
    for (const arr of [o.b, o.pl]) for (const v of arr) { v.x *= 0.8; v.y *= 0.8; if (Math.abs(v.x) < 0.05) v.x = 0; if (Math.abs(v.y) < 0.05) v.y = 0; }
    const v = o.ball; v.x *= 0.75; v.y *= 0.75; if (Math.abs(v.x) < 0.05) v.x = 0; if (Math.abs(v.y) < 0.05) v.y = 0;
  }
  onSnapshot(m) {
    if (!m.st || m.st.mode) return;   // co-op and dodge states have no mode
    const me = this.me, before = capture(this.S), ns = m.st;
    this.remoteBits = m.inp[1 - me] | 0;
    this.pending = this.pending.filter(([s]) => s > (m.ack[me] | 0));
    if (ns.d) ns.d.wait = 1 - me;
    const list = this.scheme === 'base' ? this.pending : unapplied(this.pending, m, me);
    if (this.scheme !== 'base' && m.qm) this.qm = m.qm[me];
    const inp = [0, 0];
    for (const [, b] of list) { inp[me] = b; inp[1 - me] = this.remoteBits; predictStep(this.L, ns, inp); }
    const after = capture(ns);
    if (ns.p.length === this.off.p.length && ns.tries === this.S.tries) {
      const add = (o, a, b, cap = 64) => { o.x += a.x - b.x; o.y += a.y - b.y; if (Math.hypot(o.x, o.y) > cap) { o.x = 0; o.y = 0; } };
      before.p.forEach((v, i) => add(this.off.p[i], v, after.p[i], i === me ? 64 : REMOTE_CAP));
      before.b.forEach((v, i) => add(this.off.b[i], v, after.b[i]));
      before.pl.forEach((v, i) => add(this.off.pl[i], v, after.pl[i]));
      if (before.ball) {
        const o = this.off.ball; o.x += before.ball.x - after.ball.x; o.y += before.ball.y - after.ball.y;
        if (Math.hypot(o.x, o.y) > 400) { o.x = 0; o.y = 0; }
        this.prev.ball.x += after.ball.x - before.ball.x; this.prev.ball.y += after.ball.y - before.ball.y;
      }
      this.prev.p.forEach((v, i) => { v.x += after.p[i].x - before.p[i].x; v.y += after.p[i].y - before.p[i].y; });
      this.prev.b.forEach((v, i) => { v.x += after.b[i].x - before.b[i].x; v.y += after.b[i].y - before.b[i].y; });
      this.prev.pl.forEach((v, i) => { v.x += after.pl[i].x - before.pl[i].x; v.y += after.pl[i].y - before.pl[i].y; });
      if (this.S.p[me].alive && ns.p[me].alive) this.corr.push([Math.hypot(before.p[me].x - after.p[me].x, before.p[me].y - after.p[me].y), 0]);
    } else {
      this.off = zeroOff(ns);
      this.prev = capture(ns);
    }
    this.S = ns;
    if ((m.st.phase === PH_WON && m.st.phaseT >= 45) || (ns.d && ns.d.phase === 3 /* DP_OVER */ && ns.d.t >= 40)) this.results = true;
    if (this.onState) this.onState(this.S, 'snap');
  }
  // main.js view(alpha): the players as drawn (step-up lift left out)
  view() {
    const S = this.S, P = this.prev, O = this.off, a = this.alpha;
    if (!P || P.p.length !== S.p.length) return null;
    const tp = (u, w) => Math.abs(u.x - w.x) + Math.abs(u.y - w.y) > 40;
    return { p: S.p.map((p, i) => tp(P.p[i], p) ? { x: p.x, y: p.y } : { x: P.p[i].x + (p.x - P.p[i].x) * a + O.p[i].x, y: P.p[i].y + (p.y - P.p[i].y) * a + O.p[i].y }) };
  }
  draw() { return { S: this.S, v: this.view(), T: this.S.tick - 1 + this.alpha, alpha: this.alpha, results: false }; }
}
