// Sol & Luna — online sync for the two Runner modes (runner-app.js, runner3d-app.js), and the
// client model of tools/check-netcode.js. No DOM. See docs/netcode.md.
//
// The scheme:
//  - Your own player is predicted: every tick steps a copy of the sim (P) with your keys, and
//    each server snapshot is replayed forward with the inputs the server hasn't applied yet.
//    A correction is carried as a short decaying offset, so it never snaps.
//  - That prediction never kills anyone and never ends the match (P.pred, see predictedDeath in
//    shared/runner.js and shared/runner3d.js). Deaths and the end of the match come only from
//    the server. If the prediction runs you into a hazard, your player is held still where it
//    happened (no death shown, no sound) until the server's snapshot says you died. If the
//    server says otherwise, you carry on.
//  - The other player is drawn from the server's snapshots, a short, measured time in the past
//    (about 1 to 2 snapshot gaps plus the jitter seen lately), interpolated between snapshots.
//    If snapshots are late, they are extended for a few ticks along the prediction, then held.
//    Their death shows when the drawing reaches the tick they died, and "X wins" with it.
//  - The world (scroll, swinging and stateful parts) is drawn from the prediction, which is
//    where you stand. A remote player standing on a part that moves (a swing, a plank or a
//    tilting slab, a carousel stone) is drawn on that part where it is now.
//  - After a stall (a tab hiccup) the missed ticks are run, a few per frame, instead of being
//    dropped, so your inputs keep their place in the server's queue.
import * as R2 from '../../shared/runner.js';
import * as R3 from '../../shared/runner3d.js';

const DT = 1000 / 60;
const MAX_TICKS_PER_FRAME = 8;
const MAX_BACKLOG = 1000;        // ms of missed ticks a client catches up after a stall
const EXTRAP = 8;                // ticks the other player may be drawn past the newest snapshot
const KEEP = 150;                // snapshots kept (2.5 s at 60 Hz)
const CLOCK_WIN = 3000;          // ms of snapshot arrivals used to place the playback clock

// ---------------------------------------------------------------------------
// The two sims, as the sync code sees them.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SIM2D = {
  mode: 'runner', OVER: R2.RPH_OVER, PLAY: R2.RPH_PLAY,
  step: R2.stepRunner, clone: R2.cloneRunner,
  dims: ['x', 'y'], fwd: 'x', teleport: 40, offMax: 64, ease: 4, creep: 0.2, cover() {},
  scroll: (S) => S.cam,
  // a rider on a swing or a plank, drawn on it where it is now (Sn at tn) rather than then (Sp at tp)
  ride(L, Sn, tn, Sp, tp, p) {
    if (!p.gr || p.gref < R2.OID0) return null;
    const i = R2.oidObj(p.gref), o = L.objs[i];
    if (!o) return null;
    if (o.k === 'swing') { const a = R2.swingPos(o, tp), b = R2.swingPos(o, tn); return { x: b.x - a.x, y: b.y - a.y }; }
    if (o.k === 'plank') {
      const j = p.gref - R2.oid(i), sn = Sn.o[i]?.s ?? 0, sp = Sp.o[i]?.s ?? 0;
      return { x: 0, y: R2.plankSegY(o, sn, j) - R2.plankSegY(o, sp, j) };
    }
    return null;
  },
  // keep a living player in front of the dusk where it is drawn now
  front(p, v, scroll) { const min = scroll - p.w / 2 + 1; if (v.x < min) v.x = min; },
};

export const SIM3D = {
  mode: 'runner3d', OVER: R3.R3_OVER, PLAY: R3.R3_PLAY,
  step: R3.stepRunner3d, clone: R3.cloneRunner3d,
  dims: ['x', 'y', 'z'], fwd: 'z', teleport: 2, offMax: 3, ease: 0.16, creep: 0.008,
  cover(L, S) { while (L.objs.length < S.hi) R3.ensureGenerated(L, L.z + 1); },
  scroll: (S) => S.zone,
  ride(L, Sn, tn, Sp, tp, p) {
    if (!p.gr || p.gref < 0) return null;
    const o = L.objs[p.gref];
    if (!o) return null;
    if (o.k === 'carousel') {
      const a = R3.objPose(L, Sp, p.gref, tp).stones[p.gs], b = R3.objPose(L, Sn, p.gref, tn).stones[p.gs];
      return a && b ? { x: b.x - a.x, y: 0, z: b.z - a.z } : null;
    }
    if (o.k === 'tilt') {
      const n = Sn.o[p.gref], q = Sp.o[p.gref];
      if (!n || !q) return null;
      const dx = clamp(p.x, o.x0, o.x1) - o.cx, dz = clamp(p.z, o.z0, o.z1) - o.cz;
      return { x: 0, y: (n.a - q.a) * dx + (n.b - q.b) * dz, z: 0 };
    }
    return null;
  },
  front(p, v, scroll) { if (v.z < scroll + 0.05) v.z = scroll + 0.05; },
};

// ---------------------------------------------------------------------------

export function createSync(sim, opts) { return new RunnerSync(sim, opts); }

export class RunnerSync {
  // opts: { L, st (the start state), me, send(msg), now }
  constructor(sim, { L, st, me, send, now = 0 }) {
    this.sim = sim; this.L = L; this.me = me; this.send = send;
    sim.cover(L, st);
    this.auth = st;                     // the newest server state (never stepped)
    this.snaps = [{ tick: st.tick, t: now, st }];
    this.arr = [];                      // [arrival ms, arrival - tick * DT] for the playback clock
    this.P = this.predictFrom(st);
    this.pending = []; this.seq = 0; this.remoteBits = 0; this.qm = null;
    this.acc = 0; this.alpha = 1;
    this.prev = this.capture();
    this.off = this.zero();             // your own player's visual correction
    this.roff = this.zero();            // the other player's, when late snapshots replace an extension
    this.predR = new Map();             // the other player in the prediction, by tick (to extend late snapshots)
    this.pb = null;                     // playback tick of the other player (fractional)
    this.lastR = null;                  // { T } the other player's playback tick last frame
    this.lastRide = null;               // { key, v } the moving part they stood on last frame, and its offset
    this.overAt = -1; this.frozen = null;
    this.stats = { corr: [], held: 0, released: 0, extrap: 0, delay: 0 };
  }

  zero() { const o = {}; for (const k of this.sim.dims) o[k] = 0; return o; }
  pos(p) { const o = {}; for (const k of this.sim.dims) o[k] = p[k]; return o; }
  capture() { return { scroll: this.sim.scroll(this.P), p: this.pos(this.P.p[this.me]) }; }

  predictFrom(st) {
    const P = this.sim.clone(st);
    // keep the prediction running past the server's end of the match until it is shown here
    if (P.phase === this.sim.OVER) P.phase = this.sim.PLAY;
    P.pred = 1;
    return P;
  }

  // the tick the next input will be applied to (the bots in tools/check-netcode.js read it)
  predTick() { return this.P.tick; }

  // -------------------------------------------------------------------------
  // ticks

  frame(dt, readBits, now) {
    // pacing: the server reports the smallest length of your input queue over the last second
    // (qm). Keep it between 1 and 3 ticks by running 3% slower or faster: enough cushion that
    // jitter never starves it, and no more delay than that.
    const rate = this.qm === null ? 1 : this.qm > 3 ? 0.97 : this.qm < 1 ? 1.03 : 1;
    this.acc = Math.min(this.acc + dt * rate, MAX_BACKLOG);
    let n = 0;
    while (this.acc >= DT && n < MAX_TICKS_PER_FRAME) { this.acc -= DT; n++; this.tick(readBits()); }
    this.alpha = Math.min(1, this.acc / DT);
    this.frameDt = dt;
    this.clock(now, dt);
    this.ease(dt);
    return n;
  }

  tick(bits) {
    const me = this.me, o = 1 - me;
    this.seq++;
    this.send({ t: 'i', s: this.seq, b: bits });
    this.pending.push([this.seq, bits]);
    if (this.pending.length > 240) this.pending.shift();
    this.prev = this.capture();
    const inp = [0, 0];
    inp[me] = bits; inp[o] = this.remoteBits;
    this.sim.step(this.L, this.P, inp);
    this.predR.set(this.P.tick, this.pos(this.P.p[o]));
    this.decay();
  }

  decay() {
    const v = this.off, p = this.P.p[this.me], f = this.sim.fwd, vf = p['v' + f] || 0;
    for (const k of this.sim.dims) {
      let d = v[k] * 0.2;
      // drawn ahead of the corrected state while running forward: pay it off slower than the
      // run itself, so a late correction slows you down instead of pulling you back
      if (k === f && d > 0 && vf > 0) d = Math.min(d, 0.6 * vf);
      v[k] -= d; if (Math.abs(v[k]) < 0.002) v[k] = 0;
    }
  }

  // the other player's offset, eased on frame time (they are drawn on real time, and catch-up
  // ticks after a stall must not speed it up): a fifth per 1/60 s, at most sim.ease; drawn
  // ahead along the run (an extension past late snapshots overshot) it is paid off no faster
  // than they run, so they slow down on screen instead of stepping back (sim.creep when they
  // stand still)
  ease(dt) {
    const w = Math.min(2, dt / DT), f = this.sim.fwd;
    const r = this.roff, q = this.snapAt(this.pb ?? this.auth.tick).st.p[1 - this.me], vq = Math.max(0, q['v' + f] || 0);
    const k = 1 - Math.pow(0.8, w);
    for (const d0 of this.sim.dims) {
      let d = clamp(r[d0] * k, -this.sim.ease * w, this.sim.ease * w);
      if (d0 === f && d > 0) d = Math.min(d, Math.max(0.6 * vq, this.sim.creep) * w);
      r[d0] -= d; if (Math.abs(r[d0]) < 0.002) r[d0] = 0;
    }
  }

  onSnapshot(m, now) {
    const st = m.st, sim = this.sim, me = this.me, o = 1 - me;
    if (!st || st.mode !== sim.mode || st.seed !== this.P.seed) return;
    if (st.tick <= this.auth.tick && this.snaps.length > 1) return;   // old or repeated
    sim.cover(this.L, st);
    // the other player's drawn position before this snapshot, to keep it continuous
    const beforeR = this.lastR ? this.remoteRaw(this.lastR.T) : null;
    this.auth = st;
    this.snaps.push({ tick: st.tick, t: now, st });
    if (this.snaps.length > KEEP) this.snaps.shift();
    this.arr.push([now, now - st.tick * DT]);
    while (this.arr.length && this.arr[0][0] < now - CLOCK_WIN) this.arr.shift();
    // the server ended the match: keep running your prediction until the end is shown here
    // (the server's players stand still from now on; replaying would only pull yours back)
    if (st.phase === sim.OVER && this.P.phase !== sim.OVER && this.overSeen) return;
    if (st.phase === sim.OVER) this.overSeen = true;
    // replay your unapplied inputs on the server's state
    const before = this.pos(this.P.p[me]), scroll0 = sim.scroll(this.P);
    this.remoteBits = m.inp[o] | 0;
    if (m.qm) this.qm = m.qm[me];
    this.pending = this.pending.filter(([s]) => s > (m.ack[me] | 0));
    const P = this.predictFrom(st);
    this.predR = new Map();
    // the server held your last keys for m.d[me] ticks while your inputs were late: it will skip
    // the ones equal to those keys (the hold already applied them), so the replay does too
    let k = 0;
    const held = m.d ? m.d[me] | 0 : 0, hv = m.inp[me] | 0;
    while (k < held && k < this.pending.length && this.pending[k][1] === hv) k++;
    const inp = [0, 0];
    for (let j = k; j < this.pending.length; j++) {
      const b = this.pending[j][1];
      inp[me] = b; inp[o] = this.remoteBits;
      sim.step(this.L, P, inp);
      this.predR.set(P.tick, this.pos(P.p[o]));
    }
    this.P = P;
    const after = this.pos(P.p[me]);
    let err = 0;
    for (const k of sim.dims) { this.off[k] += before[k] - after[k]; this.prev.p[k] += after[k] - before[k]; err += (before[k] - after[k]) ** 2; }
    if (Math.hypot(...sim.dims.map(k => this.off[k])) > sim.offMax) this.off = this.zero();
    this.prev.scroll += sim.scroll(P) - scroll0;
    if (st.p[me].alive) this.stats.corr.push([Math.sqrt(err), before[sim.fwd] - after[sim.fwd]]);
    // the other player: a late snapshot replaces an extension; carry the difference as an offset
    if (beforeR && this.lastR) {
      const nowR = this.remoteRaw(this.lastR.T);
      if (nowR) for (const k of sim.dims) this.roff[k] += beforeR[k] - nowR[k];
      if (Math.hypot(...sim.dims.map(k => this.roff[k])) > sim.offMax * 2) this.roff = this.zero();
    }
  }

  // -------------------------------------------------------------------------
  // the other player's playback clock

  clock(now, dt) {
    if (this.arr.length === 0) return;
    // base: the least delayed arrival lately; jitter: how much later the 90th percentile came
    let base = Infinity;
    for (const [, e] of this.arr) if (e < base) base = e;
    const lat = this.arr.map(([, e]) => e - base).sort((a, b) => a - b);
    const jit = lat[Math.floor(lat.length * 0.9)] || 0;
    const delay = clamp(jit / DT + 1.5, 3, 9);
    this.stats.delay = delay;
    const target = (now - base) / DT - delay;
    const newest = this.auth.tick;
    if (this.pb === null || Math.abs(target - this.pb) > 40) this.pb = Math.min(target, newest);
    else {
      const err = target - this.pb;
      this.pb += (dt / DT) * (1 + clamp(err * 0.03, -0.1, 0.1));
    }
    if (this.pb > newest + EXTRAP) this.pb = newest + EXTRAP;
    if (this.pb > newest) this.stats.extrap++;
  }

  // the other player's position at playback tick T, from the snapshots (or the prediction past them)
  remoteRaw(T) {
    const o = 1 - this.me, s = this.snaps;
    let j = s.length - 1;
    while (j > 0 && s[j].tick > T) j--;
    const a = s[j];
    if (T <= a.tick) return this.pos(a.st.p[o]);
    const b = s[j + 1];
    const A = this.pos(a.st.p[o]);
    let B, tb;
    if (b) { B = this.pos(b.st.p[o]); tb = b.tick; }
    else {
      // past the newest snapshot: follow the prediction of the other player for a few ticks
      const k = Math.min(Math.ceil(T), this.P.tick);
      const q = this.predR.get(k);
      if (!q || k <= a.tick || !a.st.p[o].alive) return A;
      // half the predicted motion: if they stopped or turned, a short extension stays behind
      // them (made up forward at once) rather than ahead (which could only be paid back slowly)
      B = {}; for (const d of this.sim.dims) B[d] = A[d] + (q[d] - A[d]) * 0.5;
      tb = k;
      const f = this.sim.fwd;
      if (B[f] < A[f]) B[f] = A[f];   // an extension never moves them back along the run
    }
    const f = Math.min(1, (T - a.tick) / (tb - a.tick));
    const out = {};
    for (const k of this.sim.dims) out[k] = A[k] + (B[k] - A[k]) * f;
    return out;
  }

  snapAt(T) {
    const s = this.snaps;
    let j = s.length - 1;
    while (j > 0 && s[j].tick > T) j--;
    return s[j];
  }

  // -------------------------------------------------------------------------
  // what to draw: { S (the state to show), v (drawn positions), T (the other player's tick) }

  draw() {
    const sim = this.sim, P = this.P, A = this.auth, me = this.me, o = 1 - me, alpha = this.alpha;
    const T = this.pb ?? A.tick;
    const tNow = P.tick - 1 + alpha;
    // deaths: yours when the server says so; theirs when the drawing reaches that tick
    const shownDead = [false, false];
    shownDead[me] = A.dead[me] >= 0 && !A.p[me].alive;
    shownDead[o] = A.dead[o] >= 0 && !A.p[o].alive && T >= A.dead[o];
    const over = A.phase === sim.OVER && [0, 1].every(i => A.dead[i] < 0 || shownDead[i]);
    if (over && this.overAt < 0) this.overAt = P.tick;
    // the world now
    const scroll = this.prev.scroll + (sim.scroll(P) - this.prev.scroll) * alpha;
    // you
    let mine;
    const pk = P.pk && P.pk[me];
    const raw = {};   // your predicted position between ticks, without the correction offset
    for (const k of sim.dims) raw[k] = this.prev.p[k] + (P.p[me][k] - this.prev.p[k]) * alpha;
    if (shownDead[me]) mine = this.pos(A.p[me]);
    else if (pk && A.p[me].alive) {
      mine = this.pos(pk);
      if (!this.heldOn) { this.heldOn = true; this.stats.held++; }
    } else {
      if (this.heldOn) { this.heldOn = false; this.stats.released++; }
      const cur = this.pos(P.p[me]), pr = this.prev.p;
      const far = sim.dims.reduce((s, k) => s + Math.abs(cur[k] - pr[k]), 0) > sim.teleport;
      mine = {};
      for (const k of sim.dims) mine[k] = far ? cur[k] : pr[k] + (cur[k] - pr[k]) * alpha + this.off[k];
    }
    // the other player, as the server had them at T
    const sa = this.snapAt(T);
    let theirs = this.remoteRaw(T);
    if (!shownDead[o]) {
      const ride = sim.ride(this.L, P, tNow, sa.st, T, sa.st.p[o]) || this.zero();
      // stepping on or off a moving part: carry the change as an easing offset, not a pop
      const key = sa.st.p[o].gr ? sa.st.p[o].gref : -1;
      const rv = this.lastRide && this.lastRide.key === key ? this.lastRide.v : ride;   // its offset last frame, same part
      if (this.lastRide && this.lastRide.key !== key) for (const k of sim.dims) this.roff[k] += this.lastRide.v[k] - ride[k];
      this.lastRide = { key, v: ride };
      for (const k of sim.dims) theirs[k] += ride[k] + this.roff[k];
      // Continuity: from one frame to the next the drawing may differ from "last frame plus the
      // server's own motion" (both measured on the newest data, so a late snapshot replacing an
      // extension is not motion) by at most sim.ease; along the run it never goes back faster
      // than the server's path did (plus the slow pay-back, sim.creep). What is held back stays
      // in the offset and eases out, so no source of error can make a pop.
      if (this.lastTheirs && this.lastT !== undefined) {
        const w = Math.min(2, Math.max(1, (this.frameDt || DT) / DT)), f = sim.fwd;
        const rNow = this.remoteRaw(T), rPrev = this.remoteRaw(this.lastT);
        for (const k of sim.dims) {
          const moved = rNow[k] + ride[k] - (rPrev[k] + rv[k]);
          const exp = this.lastTheirs[k] + moved, lim = sim.ease * w;
          let lo = exp - lim;
          const hi = exp + lim;
          if (k === f) lo = Math.max(lo, this.lastTheirs[f] + Math.min(0, moved) - sim.creep * w);
          if (theirs[k] < lo) { this.roff[k] += lo - theirs[k]; theirs[k] = lo; }
          else if (theirs[k] > hi) { this.roff[k] -= theirs[k] - hi; theirs[k] = hi; }
        }
      }
      this.lastT = T;
      if (A.p[o].alive || T < A.dead[o]) sim.front(sa.st.p[o], theirs, scroll);
    } else this.lastT = undefined;
    this.lastTheirs = theirs;
    this.lastR = { T };
    // once the end is shown, everyone stays where they were drawn
    if (over) {
      if (!this.frozen) this.frozen = [null, null];
      if (!this.frozen[me]) this.frozen[me] = mine;
      mine = this.frozen[me];
    }
    // the state to show: the prediction's world, with each player's own story
    const S = Object.assign({}, P);
    const pm = Object.assign({}, P.p[me], mine);
    if (shownDead[me]) Object.assign(pm, A.p[me], mine);
    else if (pk) { pm.vx = 0; pm.vy = 0; if ('vz' in pm) pm.vz = 0; pm.alive = true; }
    const po = Object.assign({}, sa.st.p[o], theirs);
    if (!shownDead[o]) po.alive = true;
    else { Object.assign(po, A.p[o], theirs); po.alive = false; }
    S.p = me === 0 ? [pm, po] : [po, pm];
    S.dead = [shownDead[0] ? A.dead[0] : -1, shownDead[1] ? A.dead[1] : -1];
    S.why = [shownDead[0] ? A.why[0] : '', shownDead[1] ? A.why[1] : ''];
    S.best = [Math.max(P.best[0], A.best[0]), Math.max(P.best[1], A.best[1])];
    S.best[o] = Math.min(S.best[o], Math.max(A.best[o], theirs[sim.fwd]));
    if (over) { S.phase = sim.OVER; S.win = A.win; S.phaseT = P.tick - this.overAt; S.best = A.best.slice(); }
    else { S.win = -1; if (S.phase === sim.OVER) S.phase = sim.PLAY; }
    delete S.pk; delete S.pred;
    const v = { p: me === 0 ? [mine, theirs] : [theirs, mine] };
    v[sim === SIM2D ? 'cam' : 'zone'] = scroll;
    const r2 = (o) => sim.dims.map(k => +o[k].toFixed(2));
    const dbg = this.debug && { ex: +(T - A.tick).toFixed(1), roff: +Math.hypot(...sim.dims.map(k => this.roff[k])).toFixed(2), ride: this.lastRide?.key ?? -1,
      T: +T.toFixed(2), newest: A.tick, theirs: r2(theirs), ro: r2(this.roff), sa: sa.tick };
    return { S, v, T, alpha, results: false, me: raw, dbg };
  }
}
