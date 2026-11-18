// Plays levels with the headless bot and records, per tick, the inputs both players held,
// plus a position trace and the route's jumps. The browser driver replays these as key events.
//   node tools/playtest/record-bot.mjs 1,2,5     -> tools/playtest/inputs/level-N.json
import { register } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
register('./rec-hooks.mjs', import.meta.url);
const { LEVELS } = await import('../../shared/levels.js');
const { PH_WON, PH_DEAD } = await import('../../shared/sim.js');
const { runScript } = await import('../botlib.js');
const { loadScripts } = await import('../coop-bot.js');
const { SCRIPTS } = await loadScripts();
const OUT = new URL('./inputs/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const which = process.argv[2] ? process.argv[2].split(',').map(Number) : LEVELS.map((_, i) => i + 1);
const TS = 24;
for (const n of which) {
  const t0 = Date.now();
  const bits = [];          // [sol, luna] per tick, tick k = inputs of the k-th step
  const trace = [];         // every 30 ticks: tick, positions
  const jumps = [];         // takeoff/landing per player
  const air = [null, null];
  let wonTick = -1, prev = null;
  globalThis.__rec = (a, b, S) => {
    // called before step: S is the state the inputs apply to
    if (prev) post(prev, S);
    bits.push([a | 0, b | 0]);
    prev = true;
  };
  const post = (_, S) => {
    const t = S.tick;
    if (S.phase === PH_WON && wonTick < 0) wonTick = t;
    if (t % 30 === 0) trace.push([t, ...S.p.flatMap(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]), S.gm.reduce((a, c) => a + c, 0)]);
    S.p.forEach((p, i) => {
      const j = air[i];
      if (!p.gr && !j) air[i] = { i, t0: t, x0: p.x + p.w / 2, y0: p.y + p.h, top: p.y + p.h };
      else if (j && !p.gr) j.top = Math.min(j.top, p.y + p.h);
      else if (j && p.gr) {
        jumps.push({ who: i, t0: j.t0, t1: t, x0: j.x0 / TS, y0: j.y0 / TS, x1: (p.x + p.w / 2) / TS, y1: (p.y + p.h) / TS, rise: (j.y0 - j.top) / TS });
        air[i] = null;
      }
    });
  };
  let lastS = null;
  const r = runScript(n, SCRIPTS[n], { onTick: (S) => { lastS = S; } });
  if (lastS) post(null, lastS);
  const st = r.stats || {};
  // run-length encode
  const rle = [];
  for (const [a, b] of bits) { const l = rle[rle.length - 1]; if (l && l[0] === a && l[1] === b) l[2]++; else rle.push([a, b, 1]); }
  const out = { n, name: LEVELS[n - 1].name, ok: r.ok, msg: r.msg, ticks: bits.length, wonTick, secs: st.secs, gems: st.gems, gemsTotal: st.gemsTotal,
    finalTick: r.S?.tick, final: r.S ? { p: r.S.p.map(p => ({ x: p.x, y: p.y })), gm: r.S.gm, phase: r.S.phase } : null,
    rle, trace, jumps };
  writeFileSync(`${OUT}level-${n}.json`, JSON.stringify(out));
  console.log(`${String(n).padStart(2)} ${LEVELS[n - 1].name}: ${r.ok ? 'OK' : 'FAIL'} ${r.msg} · ${bits.length} ticks, won at ${wonTick}, ${rle.length} input runs, ${jumps.length} jumps (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
