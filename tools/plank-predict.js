// Does a client predict the chain plank it stands on? Offline, with the real runner sim.
//
//   node tools/plank-predict.js            seeds 1-10, every plank chunk to 1700 tiles
//   SEEDS=3 LAG=10 node tools/plank-predict.js
//
// The "server" steps both players with their real inputs. A client (Sol) predicts like
// public/js/runner-sync.js: from the server's state LAG ticks ago, replay Sol's own inputs and
// hold Luna's last known keys. The error is the distance between Sol as predicted and Sol on
// the server, at the same tick, on every tick Sol stands on a plank or flies off one.
// Cases, per plank chunk:
//   alone      Luna is elsewhere. Sol crosses through the middle zone (riding and rocking it).
//   tip        Luna is elsewhere. Sol lands on the far tip, which spins the plank, and jumps off.
//   shared     Sol stands in the middle for 80 ticks; Luna lands beside him and hops there.
//   kicked     Sol stands in the middle; Luna lands on the near tip, which throws him off.
// "alone" and "tip" must be exact (0 px): nothing the client can't know moves the plank. In
// "shared" and "kicked" Luna's keys reach the client late, so an error is expected while she
// moves the plank under him (it is what the server's snapshot corrects).
import { TS } from '../shared/sim.js';
import * as R from '../shared/runner.js';
import { search } from './runner-bot.js';

const range = (v) => { const [a, b] = String(v).split('-').map(Number); return b === undefined ? [1, a] : [a, b]; };
const [s0, s1] = range(process.env.SEEDS || 10);
const LAG = +(process.env.LAG || 6);
const BUF = 12 * TS;
const park = (S, who) => { const p = S.p[who]; p.alive = false; p.x = -1e5; p.y = -1e5; p.gr = false; p.gref = -1; };
const place = (S, who, c, dx = 0) => { const p = S.p[who]; Object.assign(p, { x: c.x0 * TS + 4 + dx, y: c.h0 * TS - p.h, vx: 0, vy: 0, gr: true, gref: -1, coy: 0, alive: true }); S.dead[who] = -1; };
const out = {};
for (const k of ['alone', 'tip', 'shared', 'kicked']) out[k] = { n: 0, max: 0, runs: 0, both: 0 };

for (let seed = s0; seed <= s1; seed++) {
  const L = R.buildRunner(seed);
  R.ensureGenerated(L, 1800 * TS);
  const ghost = R.createRunnerState(L, { sandbox: true }); park(ghost, 0); park(ghost, 1);
  const S = R.cloneRunner(ghost);
  for (const c of L.chunks.filter(c => c.kind === 'plank' && c.x1 <= 1700)) {
    while (S.cam < c.x0 * TS - BUF) R.stepRunner(L, S, [0, 0]);
    const i = c.o0, o = L.objs[i];
    const onI = (p) => p.gr && R.oidObj(p.gref) === i;
    const goal = L.chunks[c.i + 1].x0 * TS;
    const solo = () => { const T = R.cloneRunner(S); place(T, 0, c); park(T, 1); return T; };
    // Sol's tracks: a crossing, and a landing on the far tip followed by a jump to safety
    const cross = search(L, solo(), 0, { goal, budget: 3000, o0: c.o0, o1: c.o1 });
    const tipT = search(L, solo(), 0, { budget: 800, o0: c.o0, o1: c.o1, toward: o.px + o.H - 8, until: (T, p) => onI(p) && p.x + p.w / 2 - o.px >= o.H - R.PLANK.tip });
    const tracks = [];
    if (cross.ok) tracks.push(['alone', cross.plan, null]);
    if (tipT.ok) tracks.push(['tip', [...tipT.plan, ...Array(4).fill(6), ...Array(60).fill(2)], null]);
    // Sol stands in the middle for 80 ticks, then crosses on; Luna hops beside him or lands on
    // the near tip while he stands there
    const mid = search(L, solo(), 0, { budget: 800, o0: c.o0, o1: c.o1, toward: o.px, until: (T, p) => onI(p) && Math.abs(p.x + p.w / 2 - o.px) < 8 && Math.abs(p.vx) < 1 });
    if (mid.ok) {
      const stay = [...mid.plan, ...Array(80).fill(0), ...Array(3).fill(6), ...Array(60).fill(2)];
      const lunaS = R.cloneRunner(S); place(lunaS, 1, c); park(lunaS, 0);
      const lm = search(L, lunaS, 1, { budget: 800, o0: c.o0, o1: c.o1, toward: o.px - 20, until: (T, p) => onI(p) && Math.abs(p.x + p.w / 2 - (o.px - 20)) < 8 });
      const lt = search(L, lunaS, 1, { budget: 800, o0: c.o0, o1: c.o1, toward: o.px - o.H + 8, until: (T, p) => onI(p) && p.x + p.w / 2 - o.px <= -(o.H - R.PLANK.tip) });
      // start Luna so that she lands about 30 ticks after Sol has stopped in the middle
      const delay = (plan) => [...Array(Math.max(0, mid.plan.length + 30 - plan.length)).fill(0), ...plan];
      if (lm.ok) tracks.push(['shared', stay, [...delay(lm.plan), ...Array(120).fill(0).map((_, t) => (t % 20 === 0 ? 4 : 0))]]);
      if (lt.ok) tracks.push(['kicked', stay, delay(lt.plan)]);
    }
    for (const [name, sol, luna] of tracks) {
      const srv = R.cloneRunner(S); place(srv, 0, c);
      if (luna) place(srv, 1, c); else park(srv, 1);
      const t0 = srv.tick, inp = (t) => [sol[t - t0] ?? 0, luna ? luna[t - t0] ?? 0 : 0];
      const hist = [R.cloneRunner(srv)];
      let rode = false;
      for (let t = t0; t < t0 + sol.length + 40; t++) {
        R.stepRunner(L, srv, inp(t));
        hist.push(R.cloneRunner(srv));
        const k = srv.tick - t0;
        if (k < LAG) continue;
        // the client: the snapshot from LAG ticks ago, its own keys, Luna's keys held from then
        const P = R.cloneRunner(hist[k - LAG]); P.pred = 1;
        const held = luna ? luna[k - LAG - 1] ?? 0 : 0;
        for (let u = k - LAG; u < k; u++) R.stepRunner(L, P, [sol[u] ?? 0, held]);
        const a = P.p[0], b = srv.p[0];
        const near = b.alive && (onI(b) || o.ax0 - 40 < b.x && b.x < o.ax1 + 40);
        if (!near) continue;
        rode ||= onI(b);
        if (luna && onI(b) && srv.p[1].alive && srv.p[1].gr && R.oidObj(srv.p[1].gref) === i) out[name].both++;
        const e = Math.hypot(a.x - b.x, a.y - b.y);
        out[name].n++; out[name].max = Math.max(out[name].max, e);
      }
      if (rode) out[name].runs++;
    }
  }
}
console.log(`Plank prediction, seeds ${s0}-${s1}, snapshot ${LAG} ticks old:`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(7)} ${v.runs} runs that stood on a plank, ${v.n} ticks near it${v.both ? `, ${v.both} with both on it` : ''}, largest error of the predicted player: ${v.max.toFixed(2)} px`);
const ok = out.alone.max === 0 && out.tip.max === 0 && out.alone.runs > 0 && out.tip.runs > 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
