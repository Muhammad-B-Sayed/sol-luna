// Plays co-op levels in a real (headless) Chromium with real key events: Sol on the arrows,
// Luna on WASD, one keyboard, local mode, entered through the title menu and level select.
// The inputs are the headless bot's winning inputs (record-bot.mjs), sent tick-aligned through
// the clock control in cdp.mjs. Checks that the browser reaches the results card with the
// same tick, time and gems as the headless bot, compares positions every 30 ticks, and
// screenshots the start, the route's biggest jumps and the results card.
//
//   node tools/playtest/record-bot.mjs                  (once: writes tools/playtest/inputs/)
//   PORT=3450 node tools/playtest/coop-browser.mjs 1,2,5   -> docs/img/playtest/coop/, tools/playtest/out/coop.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { launch, startServer, setBits, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3450);
const BASE = `http://localhost:${PORT}`;
const IMG = process.env.IMG || 'docs/img/playtest/coop';
const OUTF = 'tools/playtest/out/coop.json';
mkdirSync(IMG, { recursive: true }); mkdirSync('tools/playtest/out', { recursive: true });
const which = (process.argv[2] || '1,2,5,8,9,10,11,14,18,22,23,26,27,29,30,32').split(',').map(Number);

const server = process.env.NOSERVER ? null : await startServer(PORT);
const B = await launch({ name: 'coop' });
const all = existsSync(OUTF) ? JSON.parse(readFileSync(OUTF, 'utf8')) : {};
const pad = (n) => String(n).padStart(2, '0');

// pick screenshot moments: the biggest climbs and longest crossings on the route (at the apex),
// then fill to 4 moments spread over the run
function moments(rec) {
  const J = rec.jumps.map(j => ({ ...j, climb: j.y0 - j.y1, dist: Math.abs(j.x1 - j.x0) }))
    .filter(j => j.t1 - j.t0 > 12);
  const picks = [];
  const add = (j, why) => { if (j && !picks.some(p => Math.abs(p.t - j.t0) < 150)) picks.push({ t: j.t0 + Math.min(26, Math.round((j.t1 - j.t0) / 2)), why: `${why}: ${j.who ? 'Luna' : 'Sol'} (${j.x0.toFixed(1)},${(j.y0 - 1).toFixed(0)}) -> (${j.x1.toFixed(1)},${(j.y1 - 1).toFixed(0)}), climb ${j.climb.toFixed(1)}, cross ${j.dist.toFixed(1)}, rise ${j.rise.toFixed(1)} tiles` }); };
  [...J].sort((a, b) => b.climb - a.climb).slice(0, 3).forEach(j => add(j, 'biggest climb'));
  [...J].sort((a, b) => b.dist - a.dist).slice(0, 3).forEach(j => add(j, 'longest crossing'));
  picks.splice(3);
  for (const f of [0.3, 0.55, 0.8]) if (picks.length < 4) { const t = Math.round(rec.wonTick * f); if (!picks.some(p => Math.abs(p.t - t) < 150)) picks.push({ t, why: `${Math.round(f * 100)}% of the route` }); }
  return picks.sort((a, b) => a.t - b.t);
}

const STATE = `(() => { const S = window.__app.S; return { tick: S.tick, phase: S.phase, tries: S.tries, gm: S.gm.reduce((a, b) => a + b, 0), p: S.p.map(p => [p.x, p.y, p.alive]), screen: document.body.dataset.screen }; })()`;

for (const n of which) {
  const rec = JSON.parse(readFileSync(`tools/playtest/inputs/level-${n}.json`, 'utf8'));
  const t0 = Date.now();
  const P = await B.page(BASE + '/?unlock', { clock: true });
  const shots = [];
  const res = { n, name: rec.name, bot: { wonTick: rec.wonTick, secs: rec.wonTick / 60, gems: rec.gems, total: rec.gemsTotal } };
  try {
    await P.eval('window.__pt.start()');
    await P.frames(3);
    await P.click('#btnLocal');
    await P.frames(2);
    if (n === which[0]) shots.push(await P.shot(`${IMG}/level-select.jpg`));
    await P.click(`#levelGrid .lvl:nth-child(${n})`);
    let st = await P.eval(STATE);
    if (st.tick !== 0 || st.screen !== 'game') throw new Error('level did not start at tick 0: ' + JSON.stringify(st));
    const want = moments(rec);
    const stops = new Set([...want.map(m => m.t), 1, 360]);
    for (const tr of rec.trace) stops.add(tr[0]);
    const traceAt = new Map(rec.trace.map(tr => [tr[0], tr]));
    let tick = 0, held = [0, 0], maxDev = 0, firstDiv = null, keyEvents = 0;
    const runs = rec.rle.map(r => r.slice());
    for (const r of runs) {
      const [a, b] = r;
      if (a !== held[0]) { await setBits(P, 0, held[0], a); keyEvents++; }
      if (b !== held[1]) { await setBits(P, 1, held[1], b); keyEvents++; }
      if (a !== held[0] || b !== held[1]) {
        // the game's keydown listener runs in the same dispatch as ours: check it saw the keys
        const down = await P.eval('[...window.__pt.down]');
        const bits = (codes, map) => map.reduce((s, [c, v]) => s | (codes.includes(c) ? v : 0), 0);
        const sb = bits(down, [['ArrowLeft', 1], ['ArrowRight', 2], ['ArrowUp', 4]]), lb = bits(down, [['KeyA', 1], ['KeyD', 2], ['KeyW', 4]]);
        if (sb !== a || lb !== b) throw new Error(`keys not seen at tick ${tick}: want ${a},${b} got ${sb},${lb}`);
        held = [a, b];
      }
      let left = r[2];
      while (left > 0) {
        // run to the next stop inside this run
        let k = left;
        for (const s of stops) if (s > tick && s - tick < k) k = s - tick;
        await P.frames(k);
        tick += k; left -= k;
        if (traceAt.has(tick)) {
          const tr = traceAt.get(tick);
          st = await P.eval(STATE);
          if (st.tick !== tick) throw new Error(`browser tick ${st.tick}, expected ${tick}`);
          const dev = Math.max(Math.abs(st.p[0][0] - tr[1]), Math.abs(st.p[0][1] - tr[2]), Math.abs(st.p[1][0] - tr[3]), Math.abs(st.p[1][1] - tr[4]));
          if (dev > 0.051 || st.gm !== tr[5]) { if (!firstDiv) firstDiv = { tick, browser: st, bot: tr }; }
          maxDev = Math.max(maxDev, dev);
        }
        if (tick === 1) {
          // the hint is up for its full fade-in at the start of real play
          await P.eval(`document.querySelector('#hint').style.transition = 'none'`);
          shots.push(await P.shot(`${IMG}/level-${pad(n)}-0-start.jpg`));
          await P.eval(`document.querySelector('#hint').style.transition = ''`);
        }
        // the game hides the hint after 6 s of wall-clock time; replays run faster than real time,
        // so stop the stops-list at tick 360 too and hide it then, as a real 6 s would have
        if (tick === 360) await P.eval(`document.querySelector('#hint').classList.remove('on')`);
        const m = want.find(m => m.t === tick);
        if (m) { m.file = await P.shot(`${IMG}/level-${pad(n)}-${want.indexOf(m) + 1}-t${tick}.jpg`); shots.push(m.file); }
      }
    }
    await setBits(P, 0, held[0], 0); await setBits(P, 1, held[1], 0);
    const extra = await P.frames(400, `document.body.dataset.screen === 'results'`);
    st = await P.eval(STATE);
    const card = await P.eval(`({ name: resName.textContent, time: resTime.textContent, par: resPar.textContent, gems: resGems.textContent, rank: resRank.textContent, focus: document.activeElement?.id })`);
    shots.push(await P.shot(`${IMG}/level-${pad(n)}-9-results.jpg`));
    const wonAt = st.screen === 'results' ? st.tick - 45 : null;
    Object.assign(res, {
      ok: st.screen === 'results' && wonAt === rec.wonTick && st.gm === rec.gems && !firstDiv,
      browser: { resultsTick: st.tick, wonTick: wonAt, tries: st.tries, gems: st.gm, card }, extraFrames: extra,
      maxDev, firstDiv, keyEvents, moments: want, shots, wall: ((Date.now() - t0) / 1000).toFixed(1),
    });
  } catch (e) {
    res.ok = false; res.error = String(e.stack || e);
    try { shots.push(await P.shot(`${IMG}/level-${pad(n)}-error.jpg`)); res.state = await P.eval(STATE); } catch {}
  }
  all[n] = res;
  writeFileSync(OUTF, JSON.stringify(all, null, 1));
  console.log(`${pad(n)} ${rec.name}: ${res.ok ? 'MATCH' : 'MISMATCH'} · bot won at tick ${rec.wonTick} (${(rec.wonTick / 60).toFixed(2)}s, gems ${rec.gems}/${rec.gemsTotal}) · browser ${res.browser ? `won at ${res.browser.wonTick}, card ${res.browser.card.time} gems ${res.browser.card.gems} rank ${res.browser.card.rank}` : 'n/a'} · max dev ${res.maxDev ?? '-'} px${res.firstDiv ? ' · DIVERGED at tick ' + res.firstDiv.tick : ''}${res.error ? ' · ' + res.error.split('\n')[0] : ''} (${res.wall}s)`);
  await P.close();
}
if (B.pageErrors.length) console.log('page errors:', B.pageErrors.slice(0, 5));
if (B.consoleErrors.length) console.log('console errors:', B.consoleErrors.slice(0, 5));
B.close();
server?.stop();
process.exit(0);
