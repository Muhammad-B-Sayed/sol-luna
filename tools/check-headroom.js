// Lists the jumps on each level's bot route that hit a roof on the way up (see roofWatcher in
// botlib.js). A full jump rises 4.1 tiles, so it needs 6 free rows above the take-off and along
// the arc. The gate fails a level with any of these.
//
//   node tools/check-headroom.js          every level
//   node tools/check-headroom.js 3,8      some levels
//   ALL=1 ...                             list every bonk, corridor hops included
// Run the gate first: the bot replays from its cache, so this is fast.
import { LEVELS } from '../shared/levels.js';
import { runScript, roofWatcher } from './botlib.js';
import { loadScripts } from './coop-bot.js';

const { SCRIPTS } = await loadScripts();
const which = process.argv[2] ? process.argv[2].split(',').map(Number) : LEVELS.map((l, i) => i + 1);
let total = 0;
for (const n of which) {
  if (!SCRIPTS[n]) continue;
  const w = roofWatcher({ all: !!process.env.ALL });
  const r = runScript(n, SCRIPTS[n], { onTick: w.onTick });
  total += w.hits.size;
  console.log(`${n} ${LEVELS[n - 1].name}: ${w.hits.size}${r.ok ? '' : ` (bot failed: ${r.msg})`}`);
  for (const [k, c] of w.hits) console.log(`   ${k}${c > 1 ? ` x${c}` : ''}`);
}
console.log(`\n${total} route jump(s) hit a roof.`);
