// Dependency checks for the co-op rooms: proves that each character really needs
// the partner, and needs exactly the help the room's solution describes.
// Each line says: with the partner able to flip only these groups, can this
// character reach their door? "n" proves the missing help is required.
//
//   node tools/check-deps.js          all rooms below
//   node tools/check-deps.js 14,26    selected levels
//
// Groups are the mechanism colours (0-3). See docs/levels.md for each room's map.
import { LEVELS } from '../shared/levels.js';
import { buildLevel } from '../shared/sim.js';
import { explore } from './check-levels.js';

const EXPECT = {
  // Helper's Way Out: 0 = P1 lifts E1, 1 = L1 lifts S1, 2 = P2/L2 open G2 + bridge
  14: [['sol', 'none', 'n'], ['luna', 'none', 'n'], ['sol', '0', 'n'], ['sol', '2', 'n'], ['sol', '0,1', 'n'],
       ['sol', '0,2', 'Y'], ['luna', '1', 'n'], ['luna', '2', 'n'], ['luna', '0,1', 'n'], ['luna', '1,2', 'Y']],
  // Carry the Weight: 0 = P0/P0b lift E0, 1 = P1/P2 open G1 + G2 (crate on P2 holds them)
  19: [['sol', 'none', 'n'], ['sol', '0', 'n'], ['sol', '0,1', 'Y'], ['luna', '0', 'n'], ['luna', '1', 'n'],
       ['luna', '0,1', 'Y']],
  // Operator: 0 = lever A swaps the bridges, 1 = lever B moves E, 2 = PF opens GW, 3 = LR opens GX
  26: [['sol', 'none', 'n'], ['luna', 'none', 'n'], ['luna', '2', 'Y'], ['sol', '0,1', 'n'], ['sol', '1,3', 'n'],
       ['sol', '0,3', 'n'], ['sol', '0,1,2', 'n'], ['sol', '0,1,3', 'Y']],
};

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
let bad = 0, unsure = 0;
for (const [n, cases] of Object.entries(EXPECT)) {
  if (only && !only.includes(+n)) continue;
  const L = buildLevel(LEVELS[n - 1], n - 1);
  console.log(`${String(n).padStart(2)} ${L.name}`);
  const limit = L.boxes.length ? 1500000 : 400000;
  for (const [who, help, want] of cases) {
    const r = explore(L, who === 'sol' ? 0 : 1, { help, limit, stopAtDoor: true });
    const got = r.door ? 'Y' : 'n';
    const ok = got === want;
    const note = ok ? (got === 'n' && r.truncated ? 'ok (search truncated)' : 'ok') : 'WRONG';
    if (!ok) bad++;
    if (ok && got === 'n' && r.truncated) unsure++;
    console.log(`   ${who.padEnd(4)} help=${help.padEnd(6)} door ${got} (want ${want})  ${String(r.states).padStart(7)} states  ${note}`);
  }
}
console.log(bad ? `\n${bad} dependency check(s) failed.` : `\nAll dependency checks pass${unsure ? ` (${unsure} "n" result(s) hit the search limit)` : ''}.`);
process.exit(bad ? 1 : 0);
