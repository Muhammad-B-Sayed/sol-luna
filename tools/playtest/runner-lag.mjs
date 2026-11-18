// Online Runner (2D and 3D) in two real browser pages over a laggy, jittery, spiky link: watches
// the other player and the "X wins" banner every frame. Pass or fail.
//   node tools/playtest/runner-lag.mjs                      both runners, 60 ms +-20 ms, a spike every ~6 s
//   MODES=runner3d PORT=3466 LAG=80 JITTER=25 SPIKE=4 node tools/playtest/runner-lag.mjs
//
// The server adds the lag (LAG_MS, LAG_JITTER, LAG_SPIKE in server/index.js: in order, like
// TCP). The pages run on their own real frames (no clock control: a driver that falls behind
// real time would starve a real-time server of inputs), and a recorder inside each page reads
// every frame. Each player holds forward and jumps on its own rhythm with real key events until
// somebody falls. Checks:
//   - a death is never shown and then taken back, the banner never shows and then goes away,
//     and the results cards match on both pages;
//   - the other player, as drawn, never steps back along the run more than BACK (per 1/60 s)
//     unless the server's own path did, and never pops: no frame moves it more than POP
//     beyond the server's own motion over that frame (window.__runner.sync / __runner3d.sync);
//   - your own player is never drawn moving backward while you hold forward (beyond what
//     the prediction itself did).
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, startServer, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3466);
const MODES = (process.env.MODES || 'runner,runner3d').split(',');
const LAG = process.env.LAG || '60', JITTER = process.env.JITTER || '20', SPIKE = process.env.SPIKE || '6';
mkdirSync('tools/playtest/out', { recursive: true });
const TH = { runner: { back: 0.5, pop: 6, unit: 'px' }, runner3d: { back: 0.02, pop: 0.25, unit: 'u' } };
const B = await launch({ name: 'runner-lag', width: 640, height: 400 });   // small: software canvas keeps up
const waitFor = async (P, expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await P.eval(expr).catch(() => false)) return true; await sleep(50); } return false; };
const out = [];
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); };

for (const [j, mode] of MODES.entries()) {
  const R = mode === 'runner3d' ? 'window.__runner3d' : 'window.__runner', th = TH[mode];
  const srv = await startServer(PORT + j, { LAG_MS: LAG, LAG_JITTER: JITTER, LAG_SPIKE: SPIKE, NET_LOG: '1' });
  const H = await B.page(`http://localhost:${PORT + j}/${mode === 'runner3d' ? '?r3ddebug=1' : ''}`);
  await H.click('#btnHost');
  await waitFor(H, `!!window.__app.room?.code`);
  const code = await H.eval('window.__app.room.code');
  const G = await B.page(`http://localhost:${PORT + j}/${code}${mode === 'runner3d' ? '?r3ddebug=1' : ''}`);
  await waitFor(H, `window.__app.room?.players.length === 2`);
  const C = [H, G];
  // per frame, in the page: what is shown (deaths, banner), the other player drawn against the
  // server's path on the newest data, and your own player
  const REC = `(() => {
    const r = ${R}, s = r.sync, S = r.S, me = window.__app.me, o = 1 - me, R = window.__rec;
    if (!s || !S || !s.last) return;
    const d = s.last, f = s.sim.fwd, T = d.T, q = d.v.p[o], m = d.v.p[me];
    const banner = ${mode === 'runner3d' ? `document.querySelector('.r3-banner')?.textContent || ''` : `S.phase === 2 ? (S.win === 2 ? 'A draw!' : ['Sol', 'Luna'][S.win] + ' wins!') : ''`};
    for (const i of [0, 1]) { if (S.p[i].alive && R.dead[i]) R.undo.push(['alive again', i, S.tick]); if (!S.p[i].alive) R.dead[i] = true; }
    if (R.banner && !banner) R.undo.push(['banner gone', R.banner, S.tick]);
    if (banner) R.banner = banner;
    if (S.phase === 1 && S.p[o].alive && R.prev && R.prev.T !== undefined) {
      // the server's motion over this frame: the snapshots at both ticks on the newest data, plus
      // the moving part they ride (the sync's own measure, d.moved, when it has one)
      const raw = s.remoteRaw(T), rp = s.remoteRaw(R.prev.T), w = Math.max(1, (performance.now() - R.prev.t) / (1000 / 60));
      const mv = d.moved || Object.fromEntries(s.sim.dims.map(k => [k, raw[k] - rp[k]]));
      let moved = 0, dd = 0;
      for (const k of s.sim.dims) { moved += mv[k] ** 2; dd += (q[k] - R.prev.q[k]) ** 2; }
      const pop = Math.max(0, Math.sqrt(dd) - Math.sqrt(moved)) / w;
      if (pop > R.pop) R.pop = pop;
      const back = -(q[f] - R.prev.q[f]) / w, srvBack = -mv[f] / w;
      if (back > ${th.back} && back > srvBack + ${th.back}) { R.back++; R.maxBack = Math.max(R.maxBack, back); }
      const step = Math.sqrt(dd) / w; if (step > R.step) R.step = step;
    }
    if (S.phase === 1 && S.p[me].alive && R.prev && R.fwd) {
      const b = -(m[f] - R.prev.m[f]) + (d.me[f] - R.prev.me[f]);
      if (-(m[f] - R.prev.m[f]) > ${th.back} && b > ${th.back}) R.ownBack++;
    }
    R.prev = { T, q: { ...q }, m: { ...m }, me: { ...d.me }, t: performance.now() };
    R.frames++;
  })()`;
  for (const P of C) await P.eval(`(() => {
    window.__rec = { dead: [false, false], undo: [], banner: '', pop: 0, back: 0, maxBack: 0, step: 0, ownBack: 0, frames: 0, fwd: false, t0: performance.now() };
    // runs after the game's own frame callback, every frame
    const loop = () => { try { ${REC.replace(/`/g, '\`').replace(/\$\{/g, '\${')}; } catch (e) { window.__rec.err = String(e); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  await H.eval(`document.querySelector('${mode === 'runner3d' ? '#lobbyRunner3d' : '#lobbyRunner'}').click()`);
  for (const P of C) await waitFor(P, `${R}.active && ${R}.online && !!${R}.sync`, 6000);
  const me = await Promise.all(C.map(P => P.eval('window.__app.me')));
  // 2D: Sol arrows, Luna WASD; 3D: forward is up, jump is Space for either
  const keys = (who) => (mode === 'runner3d' ? [who ? 'KeyW' : 'ArrowUp', 'Space'] : who ? ['KeyD', 'KeyW'] : ['ArrowRight', 'ArrowUp']);
  const period = [29, 37];
  const results = mode === 'runner3d' ? 'r3Results' : 'runnerResults';
  const t0 = Date.now();
  let f = 0, done = false;
  const held = [false, false];
  // the key rhythm runs on real time (f counts 1/60 s since the start)
  while (!done && f < 60 * 75) {
    f = Math.floor((Date.now() - t0) / (1000 / 60));
    for (let c = 0; c < 2; c++) {
      const [run, jump] = keys(me[c]);
      if (f >= 200 && !held[2 + c]) { await C[c].key(run, 'keyDown'); held[2 + c] = true; await C[c].eval('window.__rec.fwd = true'); }
      const ph = f % period[c];
      if (f > 200 && ph < 8 && !held[c]) { await C[c].key(jump, 'keyDown'); held[c] = true; }
      if (held[c] && ph >= 8) { await C[c].key(jump, 'keyUp'); held[c] = false; }
    }
    if (f % 30 === 0) done = (await Promise.all(C.map(P => P.eval('document.body.dataset.screen')))).every(s => s === results);
    await sleep(8);
  }
  for (let i = 0; i < 100 && !done; i++) {
    await sleep(100);
    done = (await Promise.all(C.map(P => P.eval('document.body.dataset.screen')))).every(s => s === results);
  }
  const card = mode === 'runner3d' ? '#r3Title, #r3Sol, #r3Luna' : '#rrTitle, #rrSol, #rrLuna';
  const res = await Promise.all(C.map(P => P.eval(`(() => ({ screen: document.body.dataset.screen, card: [...document.querySelectorAll('${card}')].map(e => e.textContent.trim().replace(/\\s+/g, ' ')).join(' | '), rec: window.__rec, fps: window.__rec.frames / ((performance.now() - window.__rec.t0) / 1000), corr: ${R}.sync?.stats.corr.reduce((m, c) => Math.max(m, c[1]), 0) }))()`)));
  const r = { mode, lag: `${LAG}±${JITTER} ms, spikes ~${SPIKE} s`, frames: f, secs: +((Date.now() - t0) / 1000).toFixed(1), clients: res.map((x, i) => ({ who: me[i] ? 'Luna' : 'Sol', card: x.card, undo: x.rec.undo, pop: +x.rec.pop.toFixed(3), back: x.rec.back, maxBack: +x.rec.maxBack.toFixed(3), step: +x.rec.step.toFixed(3), ownBack: x.rec.ownBack, fps: Math.round(x.fps), err: x.rec.err, corrBack: +(x.corr || 0).toFixed(3), frames: x.rec.frames })) };
  out.push(r);
  console.log(`${mode}, one-way ${r.lag}: ${f} frames (${r.secs} s)`);
  for (const c of r.clients) console.log(`    ${c.who} (${c.fps} fps${c.err ? ', recorder error ' + c.err : ''}): other player largest step ${c.step}${th.unit}/frame, pop ${c.pop}${th.unit}, backward ${c.back}x (max ${c.maxBack}); own drawn backward ${c.ownBack}x, largest backward correction ${c.corrBack}${th.unit}; shown and taken back: ${c.undo.length ? JSON.stringify(c.undo.slice(0, 3)) : 'nothing'}`);
  check(`${mode}: both reached the results card`, done, res.map(x => x.screen).join(', '));
  check(`${mode}: no death or banner shown and then taken back`, r.clients.every(c => !c.undo.length));
  check(`${mode}: both results cards match`, res[0].card && res[0].card === res[1].card, JSON.stringify(res.map(x => x.card)));
  check(`${mode}: the other player never pops (≤ ${th.pop}${th.unit} beyond the server's motion per frame)`, r.clients.every(c => c.pop <= th.pop), r.clients.map(c => c.pop).join(', '));
  check(`${mode}: the other player never steps back (more than ${th.back}${th.unit} per 1/60 s)`, r.clients.every(c => c.back === 0), r.clients.map(c => c.back).join(', '));
  check(`${mode}: your own player is never drawn moving backward`, r.clients.every(c => c.ownBack === 0), r.clients.map(c => c.ownBack).join(', '));
  await H.close(); await G.close();
  await sleep(300);
  for (const l of srv.log().split('\n')) if (l.startsWith('net ')) console.log('    server: ' + l.slice(4));
  srv.stop();
}
writeFileSync('tools/playtest/out/runner-lag.json', JSON.stringify(out, null, 1));
B.close();
console.log(fails ? `${fails} check(s) FAILED` : 'all runner lag checks passed');
process.exit(fails ? 1 : 0);
