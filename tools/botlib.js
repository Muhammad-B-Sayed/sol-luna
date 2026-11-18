// Two-player bot for Sol & Luna. A script is a list of phases that plays a whole
// level with the real simulation. Every level has one script in
// tools/acts/actN.bot.js, and the script is the proof that the level can be won.
//
// Two kinds of phase:
//
// 1. SEARCH phases (use these by default). You say what one player should achieve
//    and the bot finds the inputs itself with a search over the real physics.
//    The other player stands still (or holds `hold` bits) while it runs.
//    All coordinates are map cells, the same (x, y) the level DSL uses.
//
//      goto(who, x, y)        stand in cell (x, y)
//      grab(who, x, y)        collect the gem drawn in cell (x, y)
//      flip(who, x, y, on)    leave the lever in cell (x, y) on (default) or off
//      press(who, x, y)       stand on the plate in cell (x, y)
//      door(who)              stand at your own door
//      pushTo(who, i, x)      push crate i until it rests in column x
//      seek(who, name, goal)  anything else: goal(S, p) is tested when p is standing
//                             (a helper that builds goals from its arguments passes { args }: see seek)
//      walk(who, x0, x1, y)   goto() every 2 cells along a floor, ending at x1 ({ step } changes it)
//      waitPlat(x, y, moved)  both idle until the platform resting on cell (x, y) finishes moving
//
//    Every search builder takes a last options object:
//      { keep: true }     levers must end on the side they started on (stops a route undoing a setting)
//      { hold: R_ }       input the other player holds meanwhile (default: stands still)
//      { limit, seconds } search budget (default 60000 states, 90 s). A search that fails this
//                         fast usually means the move is impossible, not that it needs more budget.
//
//    who is SOL (0) or LUNA (1). Search results are cached per level in
//    tools/acts/.botcache, so a script that already passed replays instantly.
//
// 2. HAND phases, for moments a search can't express (both players moving at
//    once, exact timing): [name, ctl(S) -> [solBits, lunaBits], done(S), maxTicks].
//    Builders: wait, mv, push, hop, hopTo, jumpWhen, leap, both.
//
// run() also measures what the level gate needs: time, gems, which parts of the
// screen the players visited, and how many times a mechanism group switched on.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON, PH_DEAD, PHYS } from '../shared/sim.js';

export const L_ = 1, R_ = 2, U_ = 4;
export const SOL = 0, LUNA = 1;
const TS = 24;
export const cx = (e) => (e.x + e.w / 2) / TS;      // centre, in tiles
export const bot = (e) => (e.y + e.h) / TS;         // feet, in tiles (standing in row y => bot = y + 1)
const nm = (who) => (who ? 'luna' : 'sol');

// Screen sectors for the coverage measure: the 38x28 interior as a 6x4 grid.
export const SEC_X = 6, SEC_Y = 4;
const sectorOf = (p) => {
  const sx = Math.min(SEC_X - 1, Math.max(0, Math.floor((cx(p) - 1) / 38 * SEC_X)));
  const sy = Math.min(SEC_Y - 1, Math.max(0, Math.floor(((p.y + p.h / 2) / TS - 1) / 28 * SEC_Y)));
  return sy * SEC_X + sx;
};

// ---------------------------------------------------------------------------
// Search

const MACROS = [];
for (const d of [0, L_, R_]) MACROS.push([[d, 6], [d, -1]]);
for (const d of [0, L_, R_]) MACROS.push([[d | U_, 1], [d, -1]]);
for (const d of [L_, R_]) {
  const o = d === L_ ? R_ : L_;
  for (const k of [3, 8, 14]) MACROS.push([[U_, 1], [0, k], [d, -1]]);
  for (const k of [4, 10, 18]) MACROS.push([[d | U_, 1], [d, k], [0, -1]]);
  for (const k of [6, 14]) MACROS.push([[d | U_, 1], [d, k], [o, -1]]);
  MACROS.push([[d, 2], [d, -1]]);
  MACROS.push([[d, 16], [d, -1]]);
  MACROS.push([[d, 40], [d, -1]]);
}
MACROS.push([[0, 30], [0, -1]]);

function keyOf(L, S, who) {
  const p = S.p[who], o = S.p[1 - who];
  let k = `${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.vx)}|${Math.round(o.x / 6)},${Math.round(o.y / 6)}`;
  for (const b of S.b) k += `|${Math.round(b.x / 4)},${Math.round(b.y / 8)}`;
  k += '|';
  for (let i = 0; i < S.pl.length; i++) k += Math.round(S.pl[i].t * L.plats[i].len / 4) + ',';
  k += '|';
  for (const v of S.lv) k += v > 0 ? '+' : '-';
  k += '|' + S.gm.join('');
  return k;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j].f <= a[i].f) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}

// Finds inputs for `who` so that goal(S, p) holds while p stands on the ground.
// Returns { ok, bits: [seekerBits per tick], states, near } (near = closest approach, for error messages).
function search(L, S0, who, goal0, { h = null, hold = 0, limit = 60000, weight = 1.3, keep = false, seconds = 90 } = {}) {
  // keep: true = every lever must end on the side it started on (so a route may not undo a setting).
  // keep: [i, ...] = only those lever indexes are free to change.
  const lv0 = S0.lv.map(v => v > 0);
  const goal = !keep ? goal0 : (S, p) => goal0(S, p) && S.lv.every((v, i) => (v > 0) === lv0[i] || (Array.isArray(keep) && keep.includes(i)));
  const t0 = Date.now();
  const inputs = (bits) => (who === 0 ? [bits, hold] : [hold, bits]);
  const start = JSON.stringify(S0);
  const hOf = (S) => (h ? h(S, S.p[who]) : 0);
  const open = new Heap();
  open.push({ f: 0, g: 0, snap: start, parent: null, run: null });
  const seen = new Set([keyOf(L, S0, who)]);
  let best = Infinity, near = null, expanded = 0;
  if (S0.p[who].gr && goal(S0, S0.p[who])) return { ok: true, bits: [], states: 1 };
  while (open.size && seen.size < limit) {
    if ((expanded & 255) === 0 && Date.now() - t0 > seconds * 1000) return { ok: false, states: seen.size, exhausted: false, near, timedOut: true };
    const node = open.pop(); expanded++;
    for (const m of MACROS) {
      const S = JSON.parse(node.snap);
      const p = S.p[who];
      const runBits = [];
      let dead = false;
      const tick = (b) => { step(L, S, inputs(b)); runBits.push(b); if (S.phase === PH_DEAD) dead = true; };
      for (const [b, n] of m) {
        if (n >= 0) { for (let k = 0; k < n && !dead && S.phase !== PH_WON; k++) tick(b); }
        else { for (let k = 0; k < 240 && !dead && S.phase !== PH_WON; k++) { tick(b); if (p.gr) break; } }
        if (dead) break;
      }
      for (let k = 0; k < 3 && !dead && S.phase !== PH_WON; k++) tick(0);
      if (dead) continue;
      if (S.phase !== PH_WON && !p.gr) continue;
      const g = node.g + runBits.length;
      const child = { f: 0, g, snap: null, parent: node, run: runBits };
      if (goal(S, p)) {
        const out = [];
        for (let n = child; n.parent; n = n.parent) out.unshift(n.run);
        return { ok: true, bits: out.flat(), states: seen.size };
      }
      if (S.phase === PH_WON) continue;
      const k = keyOf(L, S, who);
      if (seen.has(k)) continue;
      seen.add(k);
      const hv = hOf(S);
      if (hv < best) { best = hv; near = [cx(p).toFixed(1), (bot(p) - 1).toFixed(1)]; }
      child.snap = JSON.stringify(S);
      child.f = g + weight * hv;
      open.push(child);
    }
    node.snap = null;
  }
  return { ok: false, states: seen.size, exhausted: !open.size, near };
}

// ---------------------------------------------------------------------------
// Cache (per level): phase signature + exact start state -> run-length inputs

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'acts', '.botcache');
const sha = (s) => createHash('sha1').update(s).digest('hex');
const rle = (bits) => { const o = []; for (const b of bits) { if (o.length && o[o.length - 2] === b) o[o.length - 1]++; else o.push(b, 1); } return o; };
const unrle = (o) => { const bits = []; for (let i = 0; i < o.length; i += 2) for (let k = 0; k < o[i + 1]; k++) bits.push(o[i]); return bits; };

function loadCache(levelNo, raw) {
  const file = join(CACHE_DIR, `level-${levelNo}.json`);
  const levelHash = sha(JSON.stringify(raw) + JSON.stringify(PHYS));   // physics changes invalidate recorded inputs
  let data = { levelHash, entries: {} };
  if (!process.env.NOCACHE && existsSync(file)) {
    try { const d = JSON.parse(readFileSync(file, 'utf8')); if (d.levelHash === levelHash) data = d; } catch { /* rebuilt below */ }
  }
  return { file, data, dirty: false };
}
function saveCache(c) {
  if (!c.dirty) return;
  mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = c.file + '.' + process.pid + '.tmp';
  writeFileSync(tmp, JSON.stringify(c.data));
  renameSync(tmp, c.file);
}

// ---------------------------------------------------------------------------
// Runner

const flatten = (phases) => {
  const out = [];
  for (const ph of phases) {
    if (Array.isArray(ph) && typeof ph[0] !== 'string') out.push(...flatten(ph));
    else out.push(ph);
  }
  return out;
};

export function run(levelNo, phases, { verbose = false, onPhase = null, onTick = null } = {}) {
  const raw = LEVELS[levelNo - 1];
  const L = buildLevel(raw, levelNo - 1);
  const S = createState(L);
  const cache = loadCache(levelNo, raw);
  const seen = [new Set(), new Set()];
  // "edges" counts control uses: a plate going down, or a lever changing side
  let edges = 0, prevBtn = S.btn.slice(), prevLv = S.lv.map(v => v > 0);
  const stats = () => {
    const all = new Set([...seen[0], ...seen[1]]);
    return { secs: S.tick / 60, gems: S.gm.reduce((a, b) => a + b, 0), gemsTotal: L.gems.length,
      cover: all.size, coverSol: seen[0].size, coverLuna: seen[1].size, sectors: SEC_X * SEC_Y, edges };
  };
  const advance = (a, b) => {
    step(L, S, [a, b]);
    if (onTick) onTick(S, L);
    for (let i = 0; i < 2; i++) if (S.p[i].alive) seen[i].add(sectorOf(S.p[i]));
    for (let i = 0; i < S.btn.length; i++) { if (S.btn[i] && !prevBtn[i]) edges++; prevBtn[i] = S.btn[i]; }
    for (let i = 0; i < S.lv.length; i++) { const on = S.lv[i] > 0; if (on !== prevLv[i]) edges++; prevLv[i] = on; }
  };
  const fail = (msg) => { saveCache(cache); return { ok: false, msg, S, stats: stats() }; };
  const say = (name, t) => { if (verbose) console.log(`  ${name.padEnd(34)} ${String(t).padStart(4)} ticks  sol(${cx(S.p[0]).toFixed(1)},${(bot(S.p[0]) - 1).toFixed(1)}) luna(${cx(S.p[1]).toFixed(1)},${(bot(S.p[1]) - 1).toFixed(1)})${S.b.length ? ' crates ' + S.b.map(b => `(${cx(b).toFixed(1)},${(bot(b) - 1).toFixed(1)})`).join(' ') : ''}`); };

  for (const ph of flatten(phases)) {
    if (S.phase === PH_WON) break;
    if (!Array.isArray(ph)) {
      // search phase
      const sig = sha(ph.sig + '|' + JSON.stringify(S));
      let enc = cache.data.entries[sig];
      if (!enc) {
        const r = search(L, S, ph.who, ph.goal, ph.opts);
        if (!r.ok) return fail(`${ph.name}: no route found (${r.states} states${r.exhausted ? ', every reachable state tried' : r.timedOut ? ', gave up after the time limit' : ', search limit hit'}${r.near ? `, closest approach cell ${r.near[0]},${r.near[1]}` : ''}). ${nm(ph.who)} is at cell ${cx(S.p[ph.who]).toFixed(1)},${(bot(S.p[ph.who]) - 1).toFixed(1)}.`);
        enc = rle(r.bits); cache.data.entries[sig] = enc; cache.dirty = true;
      }
      const bits = unrle(enc), hold = ph.opts.hold || 0;
      for (const b of bits) {
        if (ph.who === 0) advance(b, hold); else advance(hold, b);
        if (S.phase === PH_DEAD) return fail(`${ph.name}: ${S.deadWho ? 'Luna' : 'Sol'} died (stale cache? run with NOCACHE=1)`);
      }
      if (onPhase) onPhase(ph.name, S);
      say(ph.name, bits.length);
      continue;
    }
    const [name, ctl, done, max = 900] = ph;
    let t = 0;
    for (; t < max; t++) {
      const [a, b] = ctl(S);
      advance(a, b);
      if (S.phase === PH_DEAD) return fail(`${name}: ${S.deadWho ? 'Luna' : 'Sol'} died at tick ${S.tick}`);
      if (done(S)) break;
    }
    if (onPhase) onPhase(name, S);
    say(name, t);
    if (t >= max) return fail(`${name}: timed out  sol(${cx(S.p[0]).toFixed(1)},${(bot(S.p[0]) - 1).toFixed(1)}) luna(${cx(S.p[1]).toFixed(1)},${(bot(S.p[1]) - 1).toFixed(1)}) lv=${JSON.stringify(S.lv)} act=${JSON.stringify(S.act)} btn=${JSON.stringify(S.btn)} pl=${JSON.stringify(S.pl.map(q => +q.t.toFixed(2)))}`);
  }
  for (let i = 0; i < 120 && S.phase !== PH_WON; i++) advance(0, 0);
  saveCache(cache);
  const st = stats();
  return { ok: S.phase === PH_WON, msg: S.phase === PH_WON ? `won in ${st.secs.toFixed(1)}s, gems ${st.gems}/${st.gemsTotal}` : 'script ended before both doors opened', S, stats: st };
}

// ---------------------------------------------------------------------------
// Search phase builders

const settledP = (p) => p.gr && Math.abs(p.vx) < 0.6;
const mk = (who, name, sigArgs, goal, opts = {}) => ({ who, name, goal, opts, sig: name + '|' + JSON.stringify(sigArgs) + '|' + (opts.hold || 0) + '|' + (opts.limit || 0) + (opts.keep ? '|keep' + JSON.stringify(opts.keep) : '') });
const distH = (tx, ty) => (S, p) => Math.max(Math.abs(cx(p) - tx) * TS / PHYS.maxSpeed, Math.abs(bot(p) - ty) * TS / 6);

// The level being scripted is only known inside run(), so builders that need map
// lookups (gems, levers, plates) resolve them lazily from the state shapes.
const levelFor = (() => { const m = new Map(); return (n) => { if (!m.has(n)) m.set(n, buildLevel(LEVELS[n - 1], n - 1)); return m.get(n); }; })();
let CUR = 0;                       // level number the current script is written for
const LV = () => { if (!CUR) throw new Error('scripts must be functions: SCRIPTS = { 5: () => [ ...phases ] }'); return levelFor(CUR); };
// A script is a function returning phases, so its builders can look up the level's gems, levers and plates.
export function runScript(n, fn, opts) {
  CUR = n;
  let phases;
  try { phases = fn(); } catch (e) { return { ok: false, msg: 'script error: ' + e.message, stats: null }; }
  return run(n, phases, opts);
}

export const goto = (who, x, y, o = {}) => {
  const tol = o.tol ?? 0.3;
  return mk(who, `${nm(who)} -> (${x},${y})`, ['goto', x, y, tol],
    (S, p) => settledP(p) && Math.abs(cx(p) - (x + 0.5)) <= tol && Math.abs(bot(p) - (y + 1)) <= 0.5,
    { h: distH(x + 0.5, y + 1), ...o });
};
export const grab = (who, x, y, o = {}) => {
  const L = LV();
  const i = L.gems.findIndex(g => g.kind === who && Math.abs(g.x / TS - (x + 0.5)) < 0.01 && Math.abs(g.y / TS - (y + 0.5)) < 0.01);
  if (i < 0) throw new Error(`level ${CUR}: no ${who ? 'moon' : 'sun'} gem at (${x},${y})`);
  return mk(who, `${nm(who)} grabs gem (${x},${y})`, ['grab', x, y], (S) => S.gm[i] === 1, { h: distH(x + 0.5, y + 1), ...o });
};
export const flip = (who, x, y, on = true, o = {}) => {
  const L = LV();
  const i = L.levers.findIndex(l => l.x === x * TS && l.y === y * TS);
  if (i < 0) throw new Error(`level ${CUR}: no lever at (${x},${y})`);
  return mk(who, `${nm(who)} sets lever (${x},${y}) ${on ? 'on' : 'off'}`, ['flip', x, y, on],
    (S) => S.lv[i] === (on ? 1 : -1), { h: distH(x + 0.5, y + 1), ...o });
};
export const press = (who, x, y, o = {}) => {
  const L = LV();
  const i = L.buttons.findIndex(b => b.x === x * TS - 4 && b.floor === (y + 1) * TS);
  if (i < 0) throw new Error(`level ${CUR}: no plate at (${x},${y})`);
  return mk(who, `${nm(who)} stands on plate (${x},${y})`, ['press', x, y],
    (S, p) => S.btn[i] === 1 && settledP(p) && Math.abs(p.vx) < 0.05 && Math.abs(cx(p) - (x + 0.5)) <= 0.3 && Math.abs(bot(p) - (y + 1)) <= 0.5,
    { h: distH(x + 0.5, y + 1), ...o });
};
export const door = (who, o = {}) => {
  const L = LV(), d = L.doors[who];
  return mk(who, `${nm(who)} to door`, ['door'], (S, p) => S.phase === PH_WON || (p.atDoor && Math.abs(p.vx) < 0.05),
    { h: distH(d.cx / TS, d.bottom / TS), ...o });
};
// Push crate i until its centre rests in column x (cell centre x + 0.5). Give y to also require the row.
export const pushTo = (who, i, x, o = {}) => {
  const tol = o.tol ?? 0.3;
  return mk(who, `${nm(who)} pushes crate ${i} -> ${x}${o.y != null ? ',' + o.y : ''}`, ['pushTo', i, x, o.y ?? null, tol],
    (S) => { const b = S.b[i]; return b.gr && Math.abs(cx(b) - (x + 0.5)) <= tol && (o.y == null || Math.abs(bot(b) - (o.y + 1)) <= 0.5); },
    { h: (S, p) => { const b = S.b[i]; return Math.abs(cx(b) - (x + 0.5)) * TS / PHYS.pushSpeed + Math.abs(cx(p) - cx(b)) * TS / PHYS.maxSpeed * 0.5; }, ...o });
};
// Index of the moving platform whose resting position covers cell (x, y), for S.pl[i] in hand phases.
export const platAt = (x, y) => {
  const L = LV();
  const i = L.plats.findIndex(P => { const st = createState(L).pl[L.plats.indexOf(P)]; return x * TS >= st.x && x * TS < st.x + P.w && y * TS >= st.y && y * TS < st.y + P.h; });
  if (i < 0) throw new Error(`level ${CUR}: no platform rests on cell (${x},${y})`);
  return i;
};
// Wait until the platform that rests on cell (x, y) has finished moving: moved=true means away from rest.
export const waitPlat = (x, y, moved = true, max = 600) => {
  const L = LV(), i = platAt(x, y), rest = createState(L).pl[i].t;
  return wait(`platform (${x},${y}) ${moved ? 'moved' : 'back at rest'}`, (S) => S.pl[i].t === (moved ? 1 - rest : rest), max);
};
// Generic: goal(S, p) is tested whenever the seeker is standing after a move.
// o.h(S, p) may estimate the remaining ticks to speed the search up; o.key distinguishes cached results.
//
// Cache key rule. A cached search is found again by name + goal.toString() + o.key + o.args, together
// with the exact state the phase starts from. goal.toString() is only the function's source text: it
// cannot see the values a closure captured. So a helper that builds goals from its own arguments, like
//   const board = (who, x0, f) => seek(who, `onto lift`, (S, p) => onLift(p, x0, f))
// gives every call the same key unless something else tells them apart. Put those arguments in the
// name, in o.key, or (simplest) in o.args:
//   seek(who, 'onto lift', (S, p) => onLift(p, x0, f), { args: [x0, f] })
// A goal function may carry them itself as goal.args. o.args and goal.args are added to the key only
// when they are given, so every key that was already correct stays the same and its cache entry stays valid.
export const seek = (who, name, goal, o = {}) => {
  const args = o.args ?? goal.args;
  const sig = ['seek', goal.toString(), o.key ?? ''];
  if (args !== undefined) sig.push(args);
  return mk(who, name, sig, goal, o);
};

// Walk along a floor in steps of `step` cells (default 2): a goto() for each stop, ending exactly at x1.
// Use it where one long goto() would make the search wander (a long corridor, a band under a low roof).
// Returns a list of phases; spread it into the script or leave it nested (run() flattens lists).
export const walk = (who, x0, x1, y, o = {}) => {
  const { step = 2, ...go } = o, d = x1 >= x0 ? Math.abs(step) : -Math.abs(step), out = [];
  for (let x = x0; d > 0 ? x < x1 : x > x1; x += d) out.push(goto(who, x, y, go));
  out.push(goto(who, x1, y, go));
  return out;
};

// ---------------------------------------------------------------------------
// Hand phase builders

const toward = (e, x, tol = 0.15) => (cx(e) < x - tol ? R_ : cx(e) > x + tol ? L_ : 0);
export { toward };
const ctl = (who, bits) => (who === 0 ? [bits, 0] : [0, bits]);
// Hold still until cond(S). Both players idle.
export const wait = (name, cond, max = 600) => [name, () => [0, 0], cond, max];
export const win = () => wait('both doors open', (S) => S.phase === PH_WON, 240);
// Walk to tile centre-x `x` (a float: 8.5 is the middle of column 8).
export const mv = (who, x, tol = 0.2, max = 900) => [`${nm(who)} walks to x=${x}`, (S) => ctl(who, toward(S.p[who], x, tol)), (S) => Math.abs(cx(S.p[who]) - x) <= tol + 0.05 && settledP(S.p[who]), max];
export const push = (who, b, x) => [`${nm(who)} pushes crate ${b} to x=${x}`, (S) => ctl(who, cx(S.b[b]) < x ? R_ : L_), (S) => Math.abs(cx(S.b[b]) - x) < 0.25, 900];
export const hop = (who, dir, until, max = 300) => [`${nm(who)} hops ${dir === R_ ? 'right' : 'left'}`, (S) => ctl(who, dir | (S.p[who].gr ? U_ : 0)), until, max];
export const jumpWhen = (who, dir, at, until, max = 300) => [`${nm(who)} jumps ${dir === R_ ? 'right' : 'left'} at x=${at}`, (S) => { const x = cx(S.p[who]); const past = dir === R_ ? x >= at : x <= at; return ctl(who, dir | (past && S.p[who].gr ? U_ : 0)); }, until, max];
export const hopTo = (who, x, until, max = 300) => [`${nm(who)} hops to x=${x}`, (S) => { const p = S.p[who]; return ctl(who, toward(p, x, 0.1) | (p.gr && Math.abs(cx(p) - x) > 0.6 ? U_ : 0)); }, until, max];
export const leap = (who, from, at, to) => {
  let jumped = false;
  const dir = to > from ? R_ : L_;
  const walk = mv(who, from, 0.1);
  return [
    [walk[0], walk[1], (S) => { jumped = false; return walk[2](S); }, walk[3]],
    [`${nm(who)} leaps to x=${to}`, (S) => {
      const p = S.p[who];
      if (jumped) return ctl(who, toward(p, to, 0.1));
      const past = dir === R_ ? cx(p) >= at : cx(p) <= at;
      if (past && p.gr) { jumped = true; return ctl(who, dir | U_); }
      return ctl(who, dir);
    }, (S) => jumped && S.p[who].gr && Math.abs(cx(S.p[who]) - to) < 0.55 && Math.abs(S.p[who].vx) < 1, 300],
  ];
};
// Both players act at once: fa(S) and fb(S) return input bits for Sol and Luna.
export const both = (name, fa, fb, cond, max = 900) => [name, (S) => [fa(S), fb(S)], cond, max];

// Watches a run for jumps that hit a roof on the way up. Pass `w.onTick` to run()/runScript().
// Only jumps that matter are kept: climbs (landing a tile or more higher) and crossings (landing
// 3+ tiles away). Hops the search makes in corridors are skipped unless `all` is set.
// A full jump rises 4.1 tiles, so it needs 6 free rows above the take-off and along the arc.
export function roofWatcher({ all = false } = {}) {
  const cell = (p) => [Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h) / TS) - 1];
  const prev = [null, null], jump = [null, null];
  const hits = new Map();
  const onTick = (S) => S.p.forEach((p, i) => {
    const q = prev[i];
    if (q && q.gr && !p.gr && p.vy < 0) jump[i] = { from: cell(q), bonk: null };
    const j = jump[i];
    if (j && q && !p.gr && q.vy < -0.5 && p.vy === 0 && !j.bonk) j.bonk = { at: cell(p), rise: (j.from[1] + 1) - (p.y + p.h) / TS };
    if (j && q && p.gr && !q.gr) {
      const to = cell(p), climb = j.from[1] - to[1], dist = Math.abs(to[0] - j.from[0]);
      if (j.bonk && (all || climb >= 1 || dist >= 3)) {
        const k = `${i ? 'Luna' : 'Sol '} (${j.from}) -> (${to}) ${climb >= 1 ? `climb ${climb}` : `cross ${dist}`}: head hits the roof at (${j.bonk.at}) after ${j.bonk.rise.toFixed(1)} tiles`;
        hits.set(k, (hits.get(k) || 0) + 1);
      }
      jump[i] = null;
    }
    if (!p.alive) jump[i] = null;
    prev[i] = { gr: p.gr, vy: p.vy, x: p.x, y: p.y, w: p.w, h: p.h };
  });
  return { onTick, hits };
}
