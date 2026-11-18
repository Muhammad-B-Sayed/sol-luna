// Seeds tools/acts/.botcache from other checkouts' caches (entries whose levelHash matches this
// checkout's levels and PHYS), so the playtest replays the bot without fresh searches.
//   node tools/playtest/merge-cache.mjs /path/to/checkout ...
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LEVELS } from '../../shared/levels.js';
import { PHYS } from '../../shared/sim.js';
const sha = (s) => createHash('sha1').update(s).digest('hex');
const dir = new URL('../acts/.botcache/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
for (let n = 1; n <= LEVELS.length; n++) {
  const levelHash = sha(JSON.stringify(LEVELS[n - 1]) + JSON.stringify(PHYS));
  const out = { levelHash, entries: {} };
  let from = 0;
  for (const root of [dir.replace(/tools\/acts\/\.botcache\/$/, ''), ...process.argv.slice(2)]) {
    const f = `${root}/tools/acts/.botcache/level-${n}.json`;
    if (!existsSync(f)) continue;
    try { const d = JSON.parse(readFileSync(f, 'utf8')); if (d.levelHash === levelHash) { Object.assign(out.entries, d.entries); from++; } } catch {}
  }
  writeFileSync(`${dir}level-${n}.json`, JSON.stringify(out));
  console.log(`level ${n}: ${Object.keys(out.entries).length} entries from ${from} cache(s)`);
}
