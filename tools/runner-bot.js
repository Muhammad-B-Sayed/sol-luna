// Search bot for Runner mode, using the real runner sim (shared/runner.js).
// search() finds inputs that take one player from where it stands to a goal (standing at or
// past goalX) without dying, optionally before a deadline tick. The other player plays a
// fixed input track meanwhile. Macro actions always end with the player standing again.
import { cloneRunner, stepRunner, STATEFUL, oidObj } from '../shared/runner.js';

export const L_ = 1, R_ = 2, U_ = 4;
// [bits, ticks]; ticks -1 = hold until standing. If the last step is timed and ends in the
// air, its bits are held until the player stands (or dies). Earlier steps are never stretched,
// so [[R|U, 1], [0, -1]] is a jump that lets go of right straight away.
export const MACROS = [
  [[R_, 6]], [[R_, 16]], [[R_, 2]], [[0, 5]], [[0, 18]], [[L_, 5]],
  [[R_ | U_, 1], [R_, -1]],
  [[R_ | U_, 1], [R_, 4], [0, -1]],
  [[R_ | U_, 1], [R_, 11], [0, -1]],
  [[R_ | U_, 1], [R_, 20], [0, -1]],
  [[R_ | U_, 1], [R_, 7], [L_, -1]],
  [[R_ | U_, 1], [R_, 16], [L_, -1]],
  [[U_, 1], [0, -1]],
  [[U_, 1], [0, 8], [R_, -1]],
  [[U_, 1], [R_, -1]],
  [[R_ | U_, 1], [0, 10], [R_, -1]],
  // braking jumps, for arriving at full speed just before a short landing
  [[R_ | U_, 1], [0, -1]],
  [[R_ | U_, 1], [L_, -1]],
  [[R_ | U_, 1], [R_, 3], [L_, -1]],
  [[L_, 4]],
  // ride an updraft up a cliff face, then let go so the landing is short
  [[R_, 45], [0, -1]], [[R_, 60], [0, -1]],
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
    k += kind === 'plank' ? '|' + Math.round(st.s * 20) : '|' + st.st;
  }
  return k;
}

// One tick with `bits` for `who`; the other player's input comes from other(tick).
export function tick(L, S, who, bits, other) {
  const inp = [0, 0];
  inp[who] = bits; inp[1 - who] = other ? other(S.tick) : 0;
  stepRunner(L, S, inp);
}

// opts: goal (px), deadline (tick, inclusive), other(tick) -> bits, budget (expansions),
// o0/o1 (object index range that matters for state keys), until(S, p) custom goal test.
export function search(L, S0, who, opts) {
  const { goal, deadline = Infinity, other = null, budget = 3000, o0 = 0, o1 = 0, until = null } = opts;
  const t0 = S0.tick;
  const done = until || ((S, p) => p.gr && p.x >= goal);
  const heap = new Heap();
  const seen = new Set();
  heap.push({ S: S0, parent: null, runs: null, pr: 0 });
  let exp = 0;
  while (heap.size && exp < budget) {
    const node = heap.pop(); exp++;
    for (const m of MACROS) {
      const S = cloneRunner(node.S);
      const p = S.p[who];
      const runs = [];
      let res = 0;   // 0 running, 1 goal, -1 dead/late
      const one = (bits) => {
        tick(L, S, who, bits, other);
        const r = runs[runs.length - 1];
        if (r && r[0] === bits) r[1]++; else runs.push([bits, 1]);
        if (!p.alive || S.tick > deadline) res = -1;
        else if (done(S, p)) res = 1;
      };
      for (let j = 0; j < m.length; j++) {
        const [bits, n] = m[j];
        if (n > 0) for (let k = 0; k < n && !res; k++) one(bits);
        if (n < 0 || (!p.gr && j === m.length - 1)) for (let k = 0; k < 220 && !res; k++) { one(bits); if (p.gr) break; }
        if (res) break;
      }
      if (res === 1) return { ok: true, plan: unroll(node, runs), tick: S.tick, S, exp };
      if (res === -1 || !p.gr) continue;
      const key = `${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.vx)},${(S.tick - t0) >> 2}${objKey(L, S, o0, o1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      heap.push({ S, parent: node, runs, pr: p.x - 0.03 * (S.tick - t0) });
    }
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

// Which stateful objects a player stands on or triggers, with tick ranges.
export function touches(L, S, who, log) {
  const p = S.p[who];
  if (!p.alive) return;
  const i = p.gr ? oidObj(p.gref) : -1;
  if (i >= 0 && STATEFUL[L.objs[i].k]) {
    const e = log.get(i) || { first: S.tick, last: S.tick };
    e.last = S.tick; log.set(i, e);
  }
}
