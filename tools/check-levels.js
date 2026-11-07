// Brute-force reachability checker using the real physics.
// For each level and character it explores inputs, crate pushes, and lets the
// (absent) partner flip any mechanism group at any time. It reports whether the
// character can reach its door and its gems. Co-op constraints (who is standing
// where) are NOT modelled, so a pass is necessary-but-not-sufficient.
//
// HELP controls what the absent partner may do (dependency checks):
//   HELP=all   (default) the partner may flip any group at any time.
//   HELP=none  the character is alone. Plates, levers and crates work for real,
//              but only this character can operate them. Use it to prove that a
//              room needs the partner: a co-op room should report "door n".
//   HELP=0,2   the partner may flip only groups 0 and 2; the rest are real.
// WHO=sol or WHO=luna checks one character only.
// tools/check-deps.js imports explore() to assert each co-op room's dependencies.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, stepSoloForced, stepSoloMixed } from '../shared/sim.js';

const LIMIT = +(process.env.LIMIT || 400000);
const HELP = (process.env.HELP || 'all').trim();
const LEGACY = HELP === 'all';
const helpMask = (help, groups) => help === 'all' ? (1 << groups) - 1
  : help === 'none' ? 0 : help.split(',').reduce((m, g) => m | (1 << +g), 0) & ((1 << groups) - 1);
const WHO = process.env.WHO ? [process.env.WHO.toLowerCase().startsWith('l') ? 1 : 0] : [0, 1];

function snap(S, who) {
  const p = S.p[who];
  return {
    p: { ...p },
    b: S.b.map(b => ({ ...b })),
    pl: S.pl.map(q => ({ ...q })),
    lv: S.lv.slice(),
  };
}
function load(S, who, st) {
  S.p[who] = { ...st.p };
  S.b = st.b.map(b => ({ ...b }));
  S.pl = st.pl.map(q => ({ ...q }));
  S.lv = st.lv.slice();
}
function key(st, act, legacy) {
  const p = st.p;
  let k = `${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.vx)}|${act}`;
  for (const b of st.b) k += `|${Math.round(b.x / 4)},${Math.round(b.y / 8)}`;
  for (const q of st.pl) k += `|${Math.round(q.t * 8)}`;
  if (!legacy) for (const v of st.lv) k += v > 0 ? '+' : '-';
  return k;
}

// Macro actions: sequences of [inputBits, ticks]; a final step with ticks=-1
// holds that input until the player is grounded again.
const L_ = 1, R_ = 2, U_ = 4;
const MACROS = [];
for (const d of [0, L_, R_]) MACROS.push([[d, 6], [d, -1]]);
for (const d of [0, L_, R_]) MACROS.push([[d | U_, 1], [d, -1]]);
for (const d of [L_, R_]) {
  const o = d === L_ ? R_ : L_;
  for (const k of [3, 8, 14]) MACROS.push([[U_, 1], [0, k], [d, -1]]);
  for (const k of [4, 10, 18]) MACROS.push([[d | U_, 1], [d, k], [0, -1]]);
  for (const k of [6, 14]) MACROS.push([[d | U_, 1], [d, k], [o, -1]]);
  MACROS.push([[d, 2], [d, -1]]);
}

let curNode = null, curMacro = null;
// help: 'all' | 'none' | '0,2' (see the header). stopAtDoor ends the search once the door is reached.
export function explore(L, who, { help = HELP, limit = LIMIT, stopAtDoor = false } = {}) {
  const legacy = help === 'all';
  const S = createState(L);
  const groups = L.groups;
  const mask = helpMask(help, groups);
  const hasMech = L.plats.length > 0 && mask !== 0;
  const stepOne = legacy ? (inp, act) => stepSoloForced(L, S, who, inp, act)
    : (inp, act) => stepSoloMixed(L, S, who, inp, mask, act);
  const d = L.doors[who];
  const reach = { door: false, gems: new Set() };
  // settle
  for (let i = 0; i < 5; i++) stepOne(0, 0);
  const q = [[snap(S, who), 0, null]];
  const seen = new Set([key(q[0][0], 0, legacy)]);
  let head = 0;
  const probe = (p) => {
    const cx = p.x + p.w / 2, bot = p.y + p.h;
    if (p.gr && Math.abs(cx - d.cx) < 11 && Math.abs(bot - d.bottom) < 4 && !reach.door) { reach.door = true; reach.doorNode = curNode; reach.doorMacro = curMacro; }
    L.gems.forEach((g, i) => {
      if (g.kind !== who) return;
      const nx = Math.max(p.x, Math.min(g.x, p.x + p.w)), ny = Math.max(p.y, Math.min(g.y, p.y + p.h));
      if ((nx - g.x) ** 2 + (ny - g.y) ** 2 < 121) reach.gems.add(i);
    });
  };
  const settled = (nact) => {
    const a = legacy ? nact : S.act.reduce((m, v, g) => m | (v << g), 0);
    return S.pl.every((pl, i) => pl.t === (((a >> L.plats[i].g) & 1) ^ (L.plats[i].inv ? 1 : 0)));
  };
  while (head < q.length && seen.size < limit && !(stopAtDoor && reach.door)) {
    const node = q[head++]; const [st, act] = node;
    const options = MACROS.map(m => [m, act]);
    if (hasMech) for (let g = 0; g < groups; g++) if ((mask >> g) & 1) options.push([null, act ^ (1 << g)]);
    for (const [m, nact] of options) {
      curNode = node; curMacro = m ? JSON.stringify(m) : 'toggle->' + nact;
      load(S, who, st);
      let dead = false, ticks = 0;
      const tick = (inp) => { dead = stepOne(inp, nact); ticks++; if (!dead) probe(S.p[who]); };
      if (!m) {
        for (let k = 0; k < 400 && !dead; k++) { tick(0); if (k > 4 && settled(nact) && S.p[who].gr) break; }
      } else {
        for (const [inp, n] of m) {
          if (n >= 0) { for (let k = 0; k < n && !dead; k++) tick(inp); }
          else { for (let k = 0; k < 240 && !dead; k++) { tick(inp); if (S.p[who].gr) break; } }
          if (dead) break;
        }
        // let crates/platforms settle a little
        for (let k = 0; k < 3 && !dead; k++) tick(0);
      }
      if (dead || !S.p[who].gr) continue;
      const ns = snap(S, who);
      const k = key(ns, nact, legacy);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([ns, nact, node, curMacro]);
    }
  }
  return { ...reach, states: seen.size, truncated: seen.size >= limit };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) main();

function main() {
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
let problems = 0;
LEVELS.forEach((raw, idx) => {
  if (only && !only.includes(idx + 1)) return;
  const L = buildLevel(raw, idx);
  const out = [];
  for (const who of WHO) {
    const myGems = L.gems.filter(g => g.kind === who).length;
    const r = explore(L, who);
    const bad = !r.door || r.gems.size < myGems;
    if (process.env.TRACE && r.doorNode) {
      const path = []; let n = r.doorNode;
      while (n) { path.unshift(`${n[3] || 'start'} -> (${Math.round(n[0].p.x/24*10)/10},${Math.round((n[0].p.y+34)/24*10)/10}) boxes ${n[0].b.map(b=>`(${(b.x/24).toFixed(1)},${((b.y+26)/24).toFixed(1)})`).join(' ')}`); n = n[2]; }
      console.log((who ? 'Luna' : 'Sol') + ' path:\n  ' + path.join('\n  ') + '\n  ' + r.doorMacro);
    }
    if (bad && LEGACY) problems++;
    out.push(`  ${who ? 'Luna' : 'Sol '} door ${r.door ? 'Y' : 'n'}  gems ${r.gems.size}/${myGems}  (${r.states} states${r.truncated ? ', TRUNCATED' : ''})${LEGACY ? (bad ? '   <-- CHECK' : '') : (HELP === 'none' ? (r.door ? '   <-- finishes ALONE' : '   needs partner') : (r.door ? '   reaches door with this help' : '   needs more help'))}`);
  }
  console.log(`${String(idx + 1).padStart(2)} ${L.name}  [boxes ${L.boxes.length}, plats ${L.plats.length}, groups ${L.groups}]\n${out.join('\n')}`);
});
if (!LEGACY) console.log(`\n(HELP=${HELP}: "door n" is expected for rooms that need the partner.)`);
console.log(problems ? `\n${problems} problem(s).` : '\nAll levels pass.');
process.exit(problems ? 1 : 0);
}
