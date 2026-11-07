// Co-op gate: every level must be impossible for either character alone.
// For each level and character, explores with HELP=none (plates, levers and
// crates work for real, but only that character can use them) and fails if the
// character can reach their own door. Run: node tools/check-solo.js [1,2,3]
import { LEVELS } from '../shared/levels.js';
import { buildLevel } from '../shared/sim.js';
import { explore } from './check-levels.js';

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
// Crate levels have far more states; 400k missed a solo route in the old level 17.
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : null;
let bad = 0;
LEVELS.forEach((raw, idx) => {
  if (only && !only.includes(idx + 1)) return;
  const L = buildLevel(raw, idx);
  const cols = [];
  for (const who of [0, 1]) {
    const limit = LIMIT || (L.boxes.length ? 1500000 : 400000);
    const r = explore(L, who, { help: 'none', limit, stopAtDoor: true });
    if (r.door) bad++;
    cols.push(`${who ? 'luna' : 'sol '} ${r.door ? 'ALONE' : 'needs partner'}${r.truncated ? ' (truncated)' : ''}`);
  }
  console.log(`${String(idx + 1).padStart(2)} ${L.name.padEnd(22)} ${cols.join('   ')}`);
});
console.log(bad ? `\n${bad} solo finish(es). Every level must need both players.` : '\nNo level can be finished alone.');
process.exit(bad ? 1 : 0);
