// Real-browser check of Runner mode: local play and an online room with two clients.
// Drives headless Google Chrome over the DevTools protocol (no extra packages: uses `ws`),
// takes screenshots, and cleans up its temporary profile.
//
//   PORT=3217 node server/index.js &      (any port)
//   PORT=3217 OUT=docs/img/runner node tools/runner-browser.js
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://localhost:${process.env.PORT || 3217}`;
const OUT = process.env.OUT || 'docs/img/runner';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'sl-runner-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,800', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('chrome did not start')), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.on('open', r));
let id = 0;
const waiting = new Map();
const pageErrors = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; waiting.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});

async function page(url) {
  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
  const P = {
    s: sessionId,
    send: (m, p) => cmd(m, p, sessionId),
    async eval(expr) {
      const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async key(code, type) {
      const keys = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, KeyA: 65, KeyD: 68, KeyW: 87, Escape: 27, Enter: 13 };
      await cmd('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: keys[code] || 0 }, sessionId);
    },
    async shot(name) {
      const r = await cmd('Page.captureScreenshot', { format: 'png' }, sessionId);
      writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
      console.log('  screenshot', join(OUT, name + '.png'));
    },
    close: () => cmd('Target.closeTarget', { targetId }),
  };
  await P.send('Page.enable');
  await P.send('Runtime.enable');
  await P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await P.send('Page.navigate', { url });
  for (let k = 0; k < 50; k++) { await sleep(200); if (await P.eval('!!window.__runner').catch(() => false)) break; }
  await sleep(600);
  return P;
}

const errors = [];
const results = {};
function check(name, ok, info = '') { results[name] = ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!ok) errors.push(name); }

// jump to a point far along a course: fast-forward the sim headlessly, then drop both players
// on a chunk's start ledge (used for the high-difficulty screenshots)
const SKIP = (seed, tiles, kind) => `(async () => {
  const R = await import('/shared/runner.js');
  const run = window.__runner;
  run.startLocal(${seed});
  const L = run.L, S = run.S;
  R.ensureGenerated(L, (${tiles} + 900) * 24);
  const c = L.chunks.find(c => c.x0 >= ${tiles} && (${kind ? `c.kind === '${kind}'` : 'true'}));
  S.sb = 1; S.p.forEach(p => { p.alive = false; p.x = -1e5; });
  while (S.cam < c.x0 * 24 - 230) R.stepRunner(L, S, [0, 0]);
  S.p.forEach((p, i) => Object.assign(p, { alive: true, x: c.x0 * 24 + 4 + i * 30, y: c.h0 * 24 - p.h, vx: 0, vy: 0, gr: true, gref: -1 }));
  S.best = S.p.map(p => p.x); S.sb = 0; S.phase = 0; S.phaseT = 0;
  run.prev = run.capture(S); run.heard = null;
  return { kind: c.kind, x0: c.x0, d: c.d, v: R.speedAt(S.cam) };
})()`;

try {
  // ---------------------------------------------------------------- local play
  console.log('Local play');
  const A = await page(BASE + '/');
  await A.shot('runner-menu');
  await A.eval(`document.querySelector('#btnRunner').click()`);
  await sleep(700);
  await A.shot('runner-countdown');
  let st = await A.eval(`(() => { const S = window.__runner.S; return { active: window.__runner.active, phase: S.phase, mode: S.mode } })()`);
  check('local: Runner starts from the title menu', st.active && st.mode === 'runner' && st.phase === 0);
  await sleep(3200);
  // hold right for both, jump every so often
  await A.key('ArrowRight', 'keyDown'); await A.key('KeyD', 'keyDown');
  for (let k = 0; k < 10; k++) {
    await sleep(380);
    await A.key('ArrowUp', 'keyDown'); await A.key('KeyW', 'keyDown');
    await sleep(60);
    await A.key('ArrowUp', 'keyUp'); await A.key('KeyW', 'keyUp');
    if (k === 3) await A.shot('runner-low-difficulty');
  }
  st = await A.eval(`(() => { const S = window.__runner.S; return { phase: S.phase, cam: S.cam, x: S.p.map(p => p.x), alive: S.p.map(p => p.alive) } })()`);
  check('local: scrolling and both players moved', st.cam > 100 && st.x.every(x => x > 300), JSON.stringify(st));
  // Luna stops; Sol keeps running and hopping until Luna is caught
  await A.key('KeyD', 'keyUp');
  for (let k = 0; k < 40 && !(await A.eval('window.__runner.S.phase === 2')); k++) {
    await sleep(300);
    await A.key('ArrowUp', 'keyDown'); await sleep(60); await A.key('ArrowUp', 'keyUp');
  }
  await A.key('ArrowRight', 'keyUp');
  // let them be caught: wait for the results card
  for (let k = 0; k < 60; k++) { await sleep(500); if (await A.eval(`document.body.dataset.screen === 'runnerResults'`)) break; }
  const res = await A.eval(`(() => ({ title: document.querySelector('#rrTitle').textContent, sol: document.querySelector('#rrSolTime').textContent + ' ' + document.querySelector('#rrSolDist').textContent + ' ' + document.querySelector('#rrSolWhy').textContent, luna: document.querySelector('#rrLunaTime').textContent + ' ' + document.querySelector('#rrLunaDist').textContent + ' ' + document.querySelector('#rrLunaWhy').textContent }))()`);
  check('local: results card with winner, time and distance', /wins|draw/i.test(res.title) && /\d+ m/.test(res.sol), JSON.stringify(res));
  await A.shot('runner-results');
  const seedBefore = await A.eval('window.__runner.S.seed');
  await A.eval(`document.querySelector('#rrAgain').click()`);
  await sleep(500);
  const seedAfter = await A.eval('window.__runner.S.seed');
  check('local: rematch starts a new course', seedAfter !== seedBefore && await A.eval('window.__runner.S.phase === 0'), `${seedBefore} -> ${seedAfter}`);

  // high difficulty screenshots, one per late obstacle
  for (const [kind, tiles] of [['plank', 900], ['shards', 900], ['swing', 900], ['eclipse', 800], ['crumble', 900], ['vent', 700], ['twin', 950]]) {
    const info = await A.eval(SKIP(5, tiles, kind));
    await sleep(3300);   // countdown
    await A.key('ArrowRight', 'keyDown'); await A.key('KeyD', 'keyDown');
    await sleep(kind === 'vent' ? 500 : 650);
    await A.key('ArrowRight', 'keyUp'); await A.key('KeyD', 'keyUp');
    await A.shot(`runner-high-${kind}`);
    console.log(`    ${kind} at ${info.x0} tiles, difficulty ${info.d.toFixed(2)}, scroll ${info.v.toFixed(2)} px/tick`);
  }
  const quit = await A.eval(`(() => { window.__runner.stop(); window.__runner.quit(); return document.body.dataset.screen })()`);
  check('local: quit returns to the title', quit === 'menu');
  await A.close();

  // ---------------------------------------------------------------- online room
  console.log('Online room (two clients)');
  const H = await page(BASE + '/');
  await H.eval(`document.querySelector('#btnHost').click()`);
  let code = '';
  for (let k = 0; k < 30 && !code; k++) { await sleep(200); code = await H.eval(`window.__app.room?.code || ''`); }
  check('online: host made a room', code.length === 5, code);
  const G = await page(BASE + '/' + code);
  for (let k = 0; k < 30; k++) { await sleep(200); if (!(await H.eval(`document.querySelector('#lobbyRunner').disabled`))) break; }
  check('online: guest joined; Runner button enabled', !(await H.eval(`document.querySelector('#lobbyRunner').disabled`)));
  await H.shot('runner-lobby');
  await G.eval(`document.querySelector('#lobbyRunner').click()`);
  await sleep(1200);
  const s1 = await Promise.all([H, G].map(P => P.eval(`(() => { const r = window.__runner; return { active: r.active, online: r.online, seed: r.S?.seed, me: window.__app.me } })()`)));
  check('online: both clients in the same runner match', s1.every(s => s.active && s.online) && s1[0].seed === s1[1].seed && s1[0].me !== s1[1].me, JSON.stringify(s1));
  await sleep(2600);
  // host holds right and jumps; guest runs too, a bit later
  await H.key('ArrowRight', 'keyDown'); await G.key('KeyD', 'keyDown');
  for (let k = 0; k < 6; k++) {
    await sleep(420);
    await H.key('ArrowUp', 'keyDown'); await G.key('KeyW', 'keyDown');
    await sleep(70);
    await H.key('ArrowUp', 'keyUp'); await G.key('KeyW', 'keyUp');
  }
  await G.key('KeyD', 'keyUp');   // the guest stops; the host keeps going
  await sleep(300);
  const pos = await Promise.all([H, G].map(P => P.eval(`(() => { const S = window.__runner.S; return { tick: S.tick, cam: S.cam, p: S.p.map(p => [Math.round(p.x), Math.round(p.y), p.alive]) } })()`)));
  const dx = Math.max(...pos[0].p.map((q, i) => Math.abs(q[0] - pos[1].p[i][0]) + Math.abs(q[1] - pos[1].p[i][1])));
  check('online: clients agree on positions (both players moved)', pos[0].p.every(q => q[0] > 280) && dx < 40 && Math.abs(pos[0].tick - pos[1].tick) < 40, JSON.stringify(pos));
  await H.shot('runner-online-host');
  await G.shot('runner-online-guest');
  for (let k = 0; k < 80; k++) {
    await sleep(500);
    await H.key('ArrowUp', 'keyDown'); await sleep(60); await H.key('ArrowUp', 'keyUp');
    const both = await Promise.all([H, G].map(P => P.eval(`document.body.dataset.screen`)));
    if (both.every(s => s === 'runnerResults')) break;
  }
  const w = await Promise.all([H, G].map(P => P.eval(`document.querySelector('#rrTitle').textContent`)));
  await H.key('ArrowRight', 'keyUp');
  check('online: both see the same result', w[0] && w[0] === w[1], JSON.stringify(w));
  await G.shot('runner-online-results');
  const seedA = s1[0].seed;
  await H.eval(`document.querySelector('#rrAgain').click()`);
  await sleep(1200);
  const s2 = await Promise.all([H, G].map(P => P.eval(`(() => ({ seed: window.__runner.S?.seed, phase: window.__runner.S?.phase, screen: document.body.dataset.screen }))()`)));
  check('online: rematch gives both a new course', s2[0].seed === s2[1].seed && s2[0].seed !== seedA && s2.every(s => s.phase === 0 && s.screen === 'game'), JSON.stringify(s2));
  await G.eval(`document.querySelector('#rrMenu') && null`);
  await H.eval(`window.__runner.net.send({ t: 'menu' })`);
  await sleep(800);
  const back = await Promise.all([H, G].map(P => P.eval(`document.body.dataset.screen`)));
  check('online: back to the room lobby', back.every(s => s === 'lobby'), JSON.stringify(back));
  await H.close(); await G.close();
} catch (e) {
  console.error(e); errors.push(String(e));
}
check('no uncaught page errors', !pageErrors.length, pageErrors.slice(0, 3).join(' | '));
ws.close();
cleanup();
console.log(errors.length ? `\n${errors.length} problem(s)` : '\nall browser checks passed');
process.exit(errors.length ? 1 : 0);
