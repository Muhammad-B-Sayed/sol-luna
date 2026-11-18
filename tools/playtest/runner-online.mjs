// Online 2D Runner with two browser pages: how the partner is drawn, and the results card.
//   PORT=3465 LAGS=0,80,150 node tools/playtest/runner-online.mjs   -> tools/playtest/out/runner-online.json
//
// Both clients run in lockstep at real 60 Hz under the clock control in cdp.mjs. Each holds
// right and jumps on its own rhythm with real key events until somebody falls. Every frame it
// records the drawn position of both players (window.__runner.drawn) and the largest per-frame
// step, then compares the results cards of host and guest.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, startServer, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3465);
const LAGS = (process.env.LAGS || '0,80,150').split(',').map(Number);
mkdirSync('tools/playtest/out', { recursive: true });
const B = await launch({ name: 'runner-online' });
const waitFor = async (P, expr, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await P.eval(expr).catch(() => false)) return true; await sleep(50); } return false; };
const out = [];
for (const [j, lag] of LAGS.entries()) {
  const srv = await startServer(PORT + j, { LAG_MS: String(lag) });
  const H = await B.page(`http://localhost:${PORT + j}/`, { clock: true });
  await H.click('#btnHost');
  await waitFor(H, `!!window.__app.room?.code`);
  const code = await H.eval('window.__app.room.code');
  const G = await B.page(`http://localhost:${PORT + j}/${code}`, { clock: true });
  await waitFor(H, `window.__app.room?.players.length === 2`);
  const C = [H, G];
  for (const P of C) await P.eval(`(() => { window.__pt.start(); window.__rec = { step: [0, 0], big: [[], []], frames: 0 }; })()`);
  await H.eval(`document.querySelector('#lobbyRunner').click()`);
  for (const P of C) await waitFor(P, `window.__runner.active && window.__runner.online`, 4000);
  const me = await Promise.all(C.map(P => P.eval('window.__app.me')));
  const keys = (who) => (who ? ['KeyD', 'KeyW'] : ['ArrowRight', 'ArrowUp']);
  const period = [27, 34];
  const sample = (P) => P.eval(`(() => {
    const r = window.__runner, R = window.__rec, V = r.drawn, me = window.__app.me;
    if (!V || !r.S) return;
    for (const i of [0, 1]) {
      const who = i === me ? 0 : 1, q = V.p[i];
      const k = 'prev' + i;
      if (R[k] && r.S.p[i].alive) { const d = Math.hypot(q.x - R[k].x, q.y - R[k].y); R.step[who] = Math.max(R.step[who], d); if (d > 14) R.big[who].push([r.S.tick, +d.toFixed(1)]); }
      R[k] = { x: q.x, y: q.y };
    }
    R.frames++;
  })()`);
  const t0 = Date.now();
  let f = 0, done = false;
  const held = [false, false];
  while (!done && f < 60 * 60) {
    for (let c = 0; c < 2; c++) {
      const [run, jump] = keys(me[c]);
      if (f === 200) await C[c].key(run, 'keyDown');
      const ph = f % period[c];
      if (f > 200 && ph === 0 && !held[c]) { await C[c].key(jump, 'keyDown'); held[c] = true; }
      if (held[c] && ph === 8) { await C[c].key(jump, 'keyUp'); held[c] = false; }
    }
    await Promise.all(C.map(P => P.frames(1)));
    await Promise.all(C.map(sample));
    f++;
    if (f % 30 === 0) done = (await Promise.all(C.map(P => P.eval('document.body.dataset.screen')))).every(s => s === 'runnerResults');
    const due = t0 + f * (1000 / 60) - Date.now();
    if (due > 0) await sleep(due);
  }
  for (let i = 0; i < 300 && !done; i++) {
    await Promise.all(C.map(P => P.frames(1)));
    done = (await Promise.all(C.map(P => P.eval('document.body.dataset.screen')))).every(s => s === 'runnerResults');
  }
  const res = await Promise.all(C.map(P => P.eval(`(() => ({ screen: document.body.dataset.screen, card: [...document.querySelectorAll('#rrTitle, #rrSol, #rrLuna')].map(e => e.textContent.trim().replace(/\\s+/g, ' ')).join(' | '), rec: { step: window.__rec.step.map(v => +v.toFixed(1)), big: window.__rec.big.map(b => b.length), firstBig: window.__rec.big.map(b => b.slice(0, 6)), frames: window.__rec.frames }, drawn: !!window.__runner.drawn }))()`)));
  const r = { lag, frames: f, host: res[0], guest: res[1], sameCard: res[0].card === res[1].card };
  out.push(r);
  console.log(`LAG_MS=${lag}: ${f} frames; largest per-frame step of the drawn player: host sees itself ${res[0].rec.step[0]}px, partner ${res[0].rec.step[1]}px (${res[0].rec.big[1]} over 14px); guest sees itself ${res[1].rec.step[0]}px, partner ${res[1].rec.step[1]}px (${res[1].rec.big[1]} over 14px); drawn view ${res[0].drawn}`);
  console.log(`    partner steps over 14px: host ${JSON.stringify(res[0].rec.firstBig[1])} guest ${JSON.stringify(res[1].rec.firstBig[1])}`);
  console.log(`${r.sameCard ? 'ok  ' : 'FAIL'} results cards match · host "${res[0].card}" · guest "${res[1].card}"`);
  for (const P of C) await P.eval('window.__pt.stop()');
  await H.close(); await G.close();
  srv.stop();
}
writeFileSync('tools/playtest/out/runner-online.json', JSON.stringify(out, null, 1));
B.close();
process.exit(0);
