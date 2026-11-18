// How far each character's drawn position moves in one frame, in local play: replays the bot's
// inputs for a level as real keys (like coop-browser.mjs), one tick per frame, and reads the
// view the renderer drew (window.__app.drawn) every frame. Finds the step-up pops (climbing out
// of a pool or onto a step), which used to move a character 10-18 px up in one frame.
//   PORT=3468 node tools/playtest/pop-browser.mjs 1,3      -> prints the largest upward steps
import { readFileSync } from 'node:fs';
import { launch, startServer, setBits } from './cdp.mjs';

const PORT = +(process.env.PORT || 3468);
const which = (process.argv[2] || '1').split(',').map(Number);
const server = await startServer(PORT);
const B = await launch({ name: 'pop' });
for (const n of which) {
  const rec = JSON.parse(readFileSync(`tools/playtest/inputs/level-${n}.json`, 'utf8'));
  const P = await B.page(`http://localhost:${PORT}/?unlock`, { clock: true });
  await P.eval('window.__pt.start()'); await P.frames(3);
  await P.click('#btnLocal'); await P.frames(2);
  await P.click(`#levelGrid .lvl:nth-child(${n})`);
  await P.eval(`window.__pop = { prev: null, up: [], tries: 0, sim: [] }`);
  // one frame, then record the drawn step and the sim step for each player
  const sample = `(() => { const A = window.__app, R = window.__pop, V = A.drawn, S = A.S;
    if (!V) return;
    const cur = V.p.map(q => q.y), sim = S.p.map(p => p.y);
    if (R.prev && R.tries === S.tries) cur.forEach((y, i) => { const d = R.prev[i] - y; if (d > 6) R.up.push([S.tick, i, +d.toFixed(1), +(R.sim[i] - sim[i]).toFixed(1)]); });
    R.prev = cur; R.sim = sim; R.tries = S.tries; })()`;
  let held = [0, 0], tick = 0;
  for (const [a, b, k] of rec.rle) {
    if (a !== held[0]) await setBits(P, 0, held[0], a);
    if (b !== held[1]) await setBits(P, 1, held[1], b);
    held = [a, b];
    for (let j = 0; j < k; j++) { await P.frames(1); await P.eval(sample); tick++; }
  }
  await setBits(P, 0, held[0], 0); await setBits(P, 1, held[1], 0);
  const r = await P.eval(`(() => { const S = window.__app.S; return { up: window.__pop.up, tick: S.tick, phase: S.phase, gems: S.gm.reduce((a, b) => a + b, 0) }; })()`);
  const top = r.up.slice().sort((x, y) => y[2] - x[2]);
  const max = top[0] ? top[0][2] : 0;
  console.log(`level ${n}: ${tick} ticks replayed, won ${r.phase === 2} gems ${r.gems}; largest upward step of a drawn character in one frame ${max} px; frames over 9 px: ${r.up.filter(u => u[2] > 9).length}`);
  console.log(`    top [tick, who, drawn px, sim px]: ${JSON.stringify(top.slice(0, 8))}`);
  await P.close();
}
B.close(); server.stop(); process.exit(0);
