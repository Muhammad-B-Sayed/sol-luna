// Search bot for Runner 3D, using the real sim (shared/runner3d.js).
// search() finds inputs that take one player from where it stands to a goal (standing at or
// past goal z, at or above goalY) without dying, optionally before a deadline tick. The other
// player plays a fixed input track meanwhile. Macro actions always end with the player standing.
import { cloneRunner3d, stepRunner3d, STATEFUL, IN_L, IN_R, IN_J, IN_F, IN_B } from '../shared/runner3d.js';

const L_ = IN_L, R_ = IN_R, J_ = IN_J, F_ = IN_F, B_ = IN_B;
export { L_, R_, J_, F_, B_ };
// [bits, ticks]; ticks -1 = hold until standing. A timed step that ends in the air keeps
// holding its bits until the player stands (or dies).
const FL = F_ | L_, FR = F_ | R_;
export const MACROS = [
  [[F_, 6]], [[F_, 16]], [[F_, 2]], [[0, 5]], [[0, 18]], [[B_, 5]],
  [[FL, 6]], [[FR, 6]], [[FL, 14]], [[FR, 14]], [[L_, 6]], [[R_, 6]], [[L_, 14]], [[R_, 14]],
  [[F_ | J_, 1], [F_, -1]],
  [[F_ | J_, 1], [F_, 4], [0, -1]],
  [[F_ | J_, 1], [F_, 11], [0, -1]],
  [[F_ | J_, 1], [F_, 20], [0, -1]],
  [[F_ | J_, 1], [F_, 7], [B_, -1]],
  [[F_ | J_, 1], [F_, 16], [B_, -1]],
  [[F_ | J_, 1], [0, -1]],
  [[F_ | J_, 1], [B_, -1]],
  [[J_, 1], [0, -1]],
  [[J_, 1], [F_, -1]],
  [[J_, 1], [0, 8], [F_, -1]],
  [[FL | J_, 1], [FL, -1]], [[FR | J_, 1], [FR, -1]],
  [[F_ | J_, 1], [FL, -1]], [[F_ | J_, 1], [FR, -1]],
  [[FL | J_, 1], [F_, -1]], [[FR | J_, 1], [F_, -1]],
  [[FL | J_, 1], [FL, 10], [0, -1]], [[FR | J_, 1], [FR, 10], [0, -1]],
  [[F_ | J_, 1], [F_, 12], [FL, -1]], [[F_ | J_, 1], [F_, 12], [FR, -1]],
  [[L_ | J_, 1], [L_, -1]], [[R_ | J_, 1], [R_, -1]],
];

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j].pr >= a[i].pr) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].pr > a[m].pr) m = l;
        if (r < a.length && a[r].pr > a[m].pr) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function objKey(L, S, o0, o1) {
  let k = '';
  for (let i = Math.max(o0, S.lo); i < Math.min(o1, S.hi); i++) {
    const st = S.o[i];
    if (!st) continue;
    const kind = L.objs[i].k;
    if (kind === 'tilt') k += '|' + Math.round(st.a * 30) + ',' + Math.round(st.b * 30);
    else k += '|' + st.st;
  }
  return k;
}

// One tick with `bits` for `who`; the other player's input comes from other(tick).
// hook(S), if given, runs after the step (the checker uses it to pin a parked partner).
export function tick(L, S, who, bits, other, hook) {
  const inp = [0, 0];
  inp[who] = bits; inp[1 - who] = other ? other(S.tick) : 0;
  stepRunner3d(L, S, inp);
  if (hook) hook(S);
}

// opts: goalObj (stand on this object index or any later one: the next section's run-up or
// beyond), or goal (z) and goalY (feet at least this high), deadline (tick, inclusive), other(tick) -> bits,
// budget (expansions), o0/o1 (object range whose state matters), until(S, p) custom goal test.
export function search(L, S0, who, opts) {
  const { goal = -Infinity, goalObj = -1, goalY = -Infinity, deadline = Infinity, other = null, hook = null, budget = 3000, o0 = 0, o1 = 0, until = null, tw = 0.0013 } = opts;
  const t0 = S0.tick;
  const done = until || (goalObj >= 0 ? (S, p) => p.gr && p.gref >= goalObj : (S, p) => p.gr && p.z >= goal && p.y >= goalY - 0.05);
  const heap = new Heap();
  const seen = new Set();
  heap.push({ S: S0, parent: null, runs: null, pr: 0 });
  let exp = 0;
  while (heap.size && exp < budget) {
    const node = heap.pop(); exp++;
    for (const m of MACROS) {
      const S = cloneRunner3d(node.S);
      const p = S.p[who];
      const runs = [];
      let res = 0;   // 0 running, 1 goal, -1 dead/late
      const one = (bits) => {
        tick(L, S, who, bits, other, hook);
        const r = runs[runs.length - 1];
        if (r && r[0] === bits) r[1]++; else runs.push([bits, 1]);
        if (!p.alive || S.tick > deadline) res = -1;
        else if (done(S, p)) res = 1;
      };
      for (const [bits, n] of m) {
        if (n > 0) for (let k = 0; k < n && !res; k++) one(bits);
        if (n < 0 || !p.gr) for (let k = 0; k < 240 && !res; k++) { one(bits); if (p.gr) break; }
        if (res) break;
      }
      if (res === 1) return { ok: true, plan: unroll(node, runs), tick: S.tick, S, exp };
      if (res === -1 || !p.gr) continue;
      const key = `${Math.round(p.x * 3)},${Math.round(p.z * 3)},${Math.round(p.y * 4)},${Math.round(p.vx * 20)},${Math.round(p.vz * 20)},${(S.tick - t0) >> 2}${objKey(L, S, o0, o1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      heap.push({ S, parent: node, runs, pr: p.z - tw * (S.tick - t0) });
    }
  }
  return { ok: false, exp };
}

// search() with a ladder of fallbacks: best-first by progress can sink its whole budget into a
// doomed branch (standing on slabs that are about to crumble), so a failed attempt is retried
// with a stronger time weight, then from a start nudged by a few ticks of waiting or stepping
// back. Returns the first success (plans include the nudge).
export function solve(L, S, who, opts) {
  const B = opts.budget || 1500;
  const tries = [
    { tw: 0.0013, budget: B }, { tw: 0.03, budget: B }, { tw: 0.01, budget: 2 * B },
    { tw: 0.0013, budget: B, pre: [0, 0, 0, 0, 0, 0] }, { tw: 0.03, budget: B, pre: [B_, B_, B_, B_, B_, B_, B_, B_] },
    { tw: 0.004, budget: 4 * B },
  ];
  let exp = 0;
  for (const t of tries.slice(0, opts.rungs || tries.length)) {
    let S0 = cloneRunner3d(S);
    const pre = t.pre || [];
    for (const b of pre) tick(L, S0, who, b, opts.other || null, opts.hook || null);
    if (!S0.p[who].alive || (opts.deadline !== undefined && S0.tick > opts.deadline)) continue;
    const r = search(L, S0, who, { ...opts, tw: t.tw, budget: t.budget });
    exp += r.exp;
    if (r.ok) return { ...r, plan: pre.concat(r.plan), exp };
  }
  return { ok: false, exp };
}

function unroll(node, last) {
  const seq = [last];
  for (let n = node; n && n.runs; n = n.parent) seq.push(n.runs);
  const bits = [];
  for (let i = seq.length - 1; i >= 0; i--) for (const [b, n] of seq[i]) for (let k = 0; k < n; k++) bits.push(b);
  return bits;
}

export { STATEFUL };

// Goal test for "made it into section k": standing on its run-up with room to stop (at least
// 1 unit before the run-up's end), or already standing on something past the run-up.
export function sectionGoal(L, k) {
  const sec = L.secs[k];
  let first = sec.o0;
  const run = [];
  for (let i = sec.o0; i < sec.o1; i++) if (L.objs[i].k === 'floor' && L.objs[i].skin === 1) run.push(i);
  for (let i = sec.o0; i < sec.o1; i++) if (!run.includes(i)) { first = i; break; }
  if (first === sec.o0 && run.length) first = sec.o1;
  return (S, p) => {
    if (!p.gr) return false;
    if (run.includes(p.gref)) return p.z <= L.objs[p.gref].z1 - 1 || p.gref !== run[run.length - 1];
    return p.gref >= first;
  };
}
// Standing on the run-up of section k (a safe place to wait)?
export function onRunup(L, k, p) {
  if (!p.gr || p.gref < 0) return false;
  const o = L.objs[p.gref];
  return o.k === 'floor' && o.skin === 1 && p.gref >= L.secs[k].o0 && p.gref < L.secs[k].o1 && p.z <= o.z1 - 1;
}

// CLI: run the bot down one course for a few seeds and report how far it gets.
//   node tools/runner3d-bot.js [seeds=1,2,3] [z=600]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { buildRunner3d, createRunner3dState, ensureGenerated } = await import('../shared/runner3d.js');
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number), Z = +(process.argv[3] || 600);
  for (const seed of seeds) {
    const L = buildRunner3d(seed);
    ensureGenerated(L, Z + 100);
    let S = createRunner3dState(L, { sandbox: true });
    const t = Date.now();
    let k = 1, ok = true;
    S.p[1].alive = false; S.p[1].z = -1e5;
    while (S.phase === 0) stepRunner3d(L, S, [0, 0]);
    for (; L.secs[k].z0 < Z; k++) {
      const c = L.secs[k - 1], nx = L.secs[k];
      if (onRunup(L, k - 1, S.p[0])) while (S.p[0].z - S.zone > 20) stepRunner3d(L, S, [0, 0]);   // wait on the run-up when far ahead
      const r = solve(L, S, 0, { until: sectionGoal(L, k), budget: 1500, o0: c.o0, o1: c.o1 });
      if (!r.ok) { ok = false; console.log(`seed ${seed}: stuck in #${k - 1} ${c.kind} z${c.z0.toFixed(1)} (exp ${r.exp}) lead ${(S.p[0].z - S.zone).toFixed(1)}`); break; }
      S = r.S;
    }
    console.log(`seed ${seed}: ${ok ? 'reached' : 'stopped at'} z ${S.p[0].z.toFixed(1)} tick ${S.tick} lead ${(S.p[0].z - S.zone).toFixed(1)} in ${Date.now() - t} ms`);
  }
}
