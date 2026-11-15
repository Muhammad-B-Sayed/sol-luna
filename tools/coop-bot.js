// Runs the two-player bot scripts. Every level has one, in tools/acts/actN.bot.js.
//   node tools/coop-bot.js            all scripted levels
//   node tools/coop-bot.js 5,6        selected levels
//   V=1 node tools/coop-bot.js 5      print every phase
//   NOCACHE=1 ...                     ignore cached search results
// The phase builders live in tools/botlib.js.
import { readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../shared/levels.js';
import { runScript } from './botlib.js';

// One broken act file must not stop the others from running.
export async function loadScripts() {
  const SCRIPTS = {}, errors = [];
  const dir = fileURLToPath(new URL('./acts/', import.meta.url));
  for (const f of readdirSync(dir).filter(f => /^act.*\.bot\.js$/.test(f)).sort()) {
    try { Object.assign(SCRIPTS, (await import(`./acts/${f}`)).SCRIPTS); }
    catch (e) { errors.push(`${f} failed to load: ${e.message}`); }
  }
  return { SCRIPTS, errors };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) {
  const { SCRIPTS, errors } = await loadScripts();
  errors.forEach(e => console.error(e));
  const which = process.argv[2] ? process.argv[2].split(',').map(Number) : Object.keys(SCRIPTS).map(Number);
  let fail = 0;
  for (const n of which) {
    if (!SCRIPTS[n]) { console.log(`${String(n).padStart(2)} ${LEVELS[n - 1].name}: NO SCRIPT`); fail++; continue; }
    const r = runScript(n, SCRIPTS[n], { verbose: !!process.env.V });
    const st = r.stats;
    console.log(`${String(n).padStart(2)} ${LEVELS[n - 1].name}: ${r.ok ? 'OK' : 'FAIL'} — ${r.msg}${st ? `  [screen ${st.cover}/${st.sectors}, sol ${st.coverSol}, luna ${st.coverLuna}, switch-ons ${st.edges}]` : ''}`);
    if (!r.ok) fail++;
  }
  process.exitCode = fail ? 1 : 0;
}
