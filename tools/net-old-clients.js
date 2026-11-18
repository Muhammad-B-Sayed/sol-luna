// The Runner clients as they were at d52cb57 (before the netcode fix), copied from
// public/js/runner-app.js and public/js/runner3d-app.js with the drawing and the DOM left out.
// tools/check-netcode.js runs them with SCHEME=old to measure the baseline. They predict the
// whole sim with the other player's last known keys, take deaths and the end of the match from
// that prediction, and draw the other player from it with an easing offset.
import * as R2 from '../shared/runner.js';
import * as R3 from '../shared/runner3d.js';

const DT = 1000 / 60;
const RESULT_DELAY = 70;

class OldBase {
  constructor(L, st, me, send) {
    this.L = L; this.me = me; this.send = send;
    this.S = this.clone(st);
    this.prev = this.capture(this.S);
    this.pending = []; this.seq = 0; this.remoteBits = 0; this.acc = 0; this.results = false;
    this.corr = [];   // own-player corrections: [error, backward along the run]
  }
  // main.js frame(): dt over 250 ms counts as one tick; then the mode's own frame()
  frame(dt, readBits) {
    if (dt > 250) dt = DT;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) { this.acc -= DT; n++; this.tick(readBits()); }
    if (n === 8) this.acc = 0;
    return n;
  }
  predTick() { return this.S.tick; }
  tick(bits) {
    if (this.results) return;
    this.seq++;
    this.send({ t: 'i', s: this.seq, b: bits });
    this.pending.push([this.seq, bits]);
    if (this.pending.length > 240) this.pending.shift();
    const inp = [0, 0];
    inp[this.me] = bits; inp[1 - this.me] = this.remoteBits;
    this.prev = this.capture(this.S);
    this.step(this.L, this.S, inp);
    this.decay();
    if (this.S.phase === 2 && this.S.phaseT >= RESULT_DELAY) this.results = true;
  }
  onSnapshot(m) {
    if (m.st.mode !== this.mode || m.st.seed !== this.S.seed) return;
    const before = this.capture(this.S);
    const ns = m.st, me = this.me;
    this.cover(ns);
    this.remoteBits = m.inp[1 - me] | 0;
    this.pending = this.pending.filter(([s]) => s > (m.ack[me] | 0));
    const inp = [0, 0];
    for (const [, b] of this.pending) { inp[me] = b; inp[1 - me] = this.remoteBits; this.step(this.L, ns, inp); }
    const after = this.capture(ns);
    this.reconcile(before, after);
    this.S = ns;
    if (ns.phase === 2 && ns.phaseT >= RESULT_DELAY) this.results = true;
  }
  cover() {}
  // what this client shows: the state (alive, phase, winner) and the drawn positions
  draw() { const alpha = Math.min(1, this.acc / DT); return { S: this.S, v: this.view(alpha), T: this.S.tick - 1 + alpha, alpha, results: this.results, me: this.rawMe(alpha) }; }
  rawMe(alpha) { const a = this.prev.p[this.me], b = this.S.p[this.me], o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * alpha; return o; }
}

export class Old2D extends OldBase {
  get mode() { return 'runner'; }
  clone(s) { return R2.cloneRunner(s); }
  step(L, S, i) { R2.stepRunner(L, S, i); }
  capture(S) { return { cam: S.cam, p: S.p.map(p => ({ x: p.x, y: p.y })) }; }
  constructor(...a) { super(...a); this.off = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; }
  decay() {
    this.off.forEach((v, i) => {
      if (i !== this.me) { const m = Math.hypot(v.x, v.y), k = m < 0.05 ? 0 : Math.max(0.8, (m - 6) / m); v.x *= k; v.y *= k; return; }
      v.x *= 0.8; v.y *= 0.8; if (Math.abs(v.x) < 0.05) v.x = 0; if (Math.abs(v.y) < 0.05) v.y = 0;
    });
  }
  reconcile(before, after) {
    const me = this.me;
    before.p.forEach((v, i) => {
      const o = this.off[i];
      o.x += v.x - after.p[i].x; o.y += v.y - after.p[i].y;
      if (Math.hypot(o.x, o.y) > (i === me ? 64 : 240)) { o.x = 0; o.y = 0; }
      this.prev.p[i].x += after.p[i].x - v.x; this.prev.p[i].y += after.p[i].y - v.y;
    });
    this.prev.cam += after.cam - before.cam;
    const b = before.p[me], a = after.p[me];
    this.corr.push([Math.hypot(b.x - a.x, b.y - a.y), b.x - a.x]);
  }
  view(alpha) {
    const S = this.S, P = this.prev, O = this.off;
    return {
      cam: P.cam + (S.cam - P.cam) * alpha,
      p: S.p.map((p, i) => {
        const a = P.p[i];
        if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 40) return { x: p.x, y: p.y };
        return { x: a.x + (p.x - a.x) * alpha + O[i].x, y: a.y + (p.y - a.y) * alpha + O[i].y };
      }),
    };
  }
}

export class Old3D extends OldBase {
  get mode() { return 'runner3d'; }
  clone(s) { return R3.cloneRunner3d(s); }
  step(L, S, i) { R3.stepRunner3d(L, S, i); }
  capture(S) { return { zone: S.zone, p: S.p.map(p => ({ x: p.x, y: p.y, z: p.z })) }; }
  constructor(...a) { super(...a); this.off = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]; this.cover(this.S); }
  cover(S) { while (this.L.objs.length < S.hi) R3.ensureGenerated(this.L, this.L.z + 1); }
  decay() {
    this.off.forEach((v, i) => {
      const d = { x: v.x * 0.2, y: v.y * 0.2, z: v.z * 0.2 };
      if (i === this.me) { const vz = this.S.p[i].vz; if (d.z > 0 && vz > 0.02) d.z = Math.min(d.z, 0.6 * vz); }
      else { const m = Math.hypot(d.x, d.y, d.z); if (m > 0.3) { d.x *= 0.3 / m; d.y *= 0.3 / m; d.z *= 0.3 / m; } }
      for (const k of ['x', 'y', 'z']) { v[k] -= d[k]; if (Math.abs(v[k]) < 0.002) v[k] = 0; }
    });
  }
  reconcile(before, after) {
    const me = this.me;
    before.p.forEach((v, i) => {
      const o = this.off[i], a = after.p[i];
      o.x += v.x - a.x; o.y += v.y - a.y; o.z += v.z - a.z;
      if (Math.hypot(o.x, o.y, o.z) > (i === me ? 3 : 8)) { o.x = 0; o.y = 0; o.z = 0; }
      this.prev.p[i].x += a.x - v.x; this.prev.p[i].y += a.y - v.y; this.prev.p[i].z += a.z - v.z;
    });
    this.prev.zone += after.zone - before.zone;
    const b = before.p[me], a = after.p[me];
    this.corr.push([Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), b.z - a.z]);
  }
  view(alpha) {
    const S = this.S, P = this.prev, O = this.off;
    return {
      zone: P.zone + (S.zone - P.zone) * alpha,
      p: S.p.map((p, i) => {
        const a = P.p[i];
        if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) + Math.abs(a.z - p.z) > 2) return { x: p.x, y: p.y, z: p.z };
        return { x: a.x + (p.x - a.x) * alpha + O[i].x, y: a.y + (p.y - a.y) * alpha + O[i].y, z: a.z + (p.z - a.z) * alpha + O[i].z };
      }),
    };
  }
}

// Online co-op, the state part of public/js/main.js tickOnline / onSnapshot (offsets and
// drawing left out). neverKill: the fix (main.js predictStep), where the prediction never
// enters the death or win phase by itself; without it, the pre-fix client.
import { step, cloneState, PH_PLAY, PH_DEAD, PH_WON } from '../shared/sim.js';
export class Coop {
  constructor(L, st, me, send, { neverKill = false } = {}) {
    this.L = L; this.me = me; this.send = send; this.neverKill = neverKill;
    this.S = cloneState(st); this.pending = []; this.seq = 0; this.remoteBits = 0; this.acc = 0; this.corr = [];
  }
  predictStep(S, inp) {
    if (!this.neverKill) { step(this.L, S, inp); return; }
    const ph = S.phase, phT = S.phaseT, who = S.deadWho;
    step(this.L, S, inp);
    if (ph === PH_PLAY && S.phase === PH_DEAD) { S.p[S.deadWho].alive = true; S.phase = ph; S.phaseT = phT; S.deadWho = who; }
    else if (ph === PH_PLAY && S.phase === PH_WON) { S.phase = ph; S.phaseT = phT; }
  }
  frame(dt, readBits) {
    if (dt > 250) dt = DT;
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 8) { this.acc -= DT; n++; this.tick(readBits()); }
    if (n === 8) this.acc = 0;
    return n;
  }
  predTick() { return this.S.tick; }
  tick(bits) {
    this.seq++;
    this.send({ t: 'i', s: this.seq, b: bits });
    this.pending.push([this.seq, bits]);
    if (this.pending.length > 240) this.pending.shift();
    const inp = [0, 0]; inp[this.me] = bits; inp[1 - this.me] = this.remoteBits;
    this.predictStep(this.S, inp);
  }
  onSnapshot(m) {
    if (!m.st || m.st.mode) return;   // co-op states have no mode
    const ns = m.st, me = this.me;
    this.remoteBits = m.inp[1 - me] | 0;
    this.pending = this.pending.filter(([s]) => s > (m.ack[me] | 0));
    const inp = [0, 0];
    for (const [, b] of this.pending) { inp[me] = b; inp[1 - me] = this.remoteBits; this.predictStep(ns, inp); }
    this.S = ns;
  }
  draw() { return { S: this.S, v: null, T: this.S.tick, alpha: 1, results: false }; }
}
