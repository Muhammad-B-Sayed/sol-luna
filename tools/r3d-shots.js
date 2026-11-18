// Screenshots of the Runner 3D renderer, through public/r3d-demo.html in headless Chromium (DevTools protocol).
// Starts its own server on PORT (default 3410) unless NOSERVER=1, writes PNGs to OUT (docs/img/runner3d),
// prints draw calls and triangles per shot, then kills the browser and the server.
//
//   node tools/r3d-shots.js                 all shots
//   node tools/r3d-shots.js start split     only shots whose name contains one of the words
//   CHROME=/path/to/chrome W=1280 H=720 node tools/r3d-shots.js
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/usr/bin/chromium';
const PORT = process.env.PORT || 3410;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT || 'docs/img/runner3d';
const W = +(process.env.W || 960), H = +(process.env.H || 540);
// Extra Chromium flags. Default headless Chromium here already has WebGL2; swiftshader flags make it slower.
const GL_FLAGS = (process.env.GL_FLAGS || '').split(' ').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.error(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// name, demo query, sim steps before the shot, optional page-side setup run before stepping
const SHOTS = [
  ['start', 'seed=7', 75],
  ['run', 'seed=7&z=140', 150],
  ['jump', 'seed=7&z=60', 0, `__r3d.step(200); for (let k = 0; k < 400; k++) { const p = __r3d.S.p[0]; if (!p.gr && p.vy > 0 && p.vy < 0.1) break; __r3d.step(1); }`],
  ['split', 'seed=11&split=1&z=90', 140],
  ['zone-close', 'seed=7&z=40', 90, `__r3d.S.zone = __r3d.S.p[0].z - 2.2;`],
  ['far', 'seed=3&z=900', 140],
  ['luna', 'seed=5&z=30&me=1', 120],
  ['countdown', 'seed=7&count=1', 40],
  ['pool', 'seed=7&kind=pool', 60],
  ['spikes', 'seed=7&kind=spikes', 60],
  ['low', 'seed=7&z=140&q=low', 150],
  ['chars-front', 'seed=7&count=1&cam=0.9,1.1,3.4', 30],
  ['chars-run', 'seed=7&z=20&cam=2.6,1.0,1.2', 60],
  ['chars-luna', 'seed=7&count=1&me=1&cam=-0.9,1.1,3.4', 30],
];
// one shot per obstacle kind (the demo starts a few units before the first object of that kind)
for (const k of ['ramp', 'tilt', 'crumble', 'eclipse', 'sweeper', 'pendulum', 'carousel', 'gate', 'orb']) SHOTS.push(['kind-' + k, `seed=7&kind=${k}`, 60]);
const want = process.argv.slice(2);
const list = want.length ? SHOTS.filter(s => want.some(w => s[0].includes(w))) : SHOTS;
const extraKinds = (process.env.KINDS || '').split(',').filter(Boolean);
for (const k of extraKinds) list.push(['kind-' + k, `seed=7&kind=${k}`, 60]);

let server = null;
if (process.env.NOSERVER !== '1') {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
}
const profile = mkdtempSync('/tmp/sl-r3dshots-');
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--mute-audio', ...GL_FLAGS,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { server?.kill('SIGKILL'); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(1));

log('chrome started, pid', chrome.pid);
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('chrome did not start')), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.on('open', r));
let id = 0;
const waiting = new Map(), logs = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' '));
});
const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; waiting.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});

let targetId, s;
const send = (m, p) => cmd(m, p, s);
async function openPage() {   // a fresh tab (also after a page that stopped answering)
  if (targetId) await cmd('Target.closeTarget', { targetId }).catch(() => {});
  ({ targetId } = await cmd('Target.createTarget', { url: 'about:blank' }));
  ({ sessionId: s } = await cmd('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
}
const ev = async (expr, ms = +(process.env.EVAL_MS || 90000)) => {
  let tm;
  const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('page did not answer in ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(tm));
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
await openPage();
log('page ready');

let failed = 0;
try {
  for (const [name, q, steps, setup] of list) {
   try {
    logs.length = 0;
    await send('Page.navigate', { url: `${BASE}/r3d-demo.html?hud=0&auto=0&${q}` });
    let ok = false;
    for (let k = 0; k < 400; k++) { await sleep(150); if (await ev('!!(window.__r3d && __r3d.ready)').catch(() => false)) { ok = true; break; } }
    if (!ok) { console.log(name, 'demo did not load', logs.join(' | ')); failed++; continue; }
    await ev('__r3d.freeze(true)');
    if (setup) await ev(setup);
    // step the sim and render every frame so cameras, animation and particles settle like live play
    const t0 = Date.now();
    // render every EVERY-th step (cameras ease by sim time, so they settle the same)
    const EVERY = +(process.env.EVERY || 3);
    log(name, 'loaded, stepping', steps);
    for (let k = 0; k < steps; k += 12) {
      if (k % 36 === 0) log(name, 'step', k);
      await ev(`for (let j = 0; j < ${Math.min(12, steps - k)}; j++) { __r3d.step(1); if ((${k} + j) % ${EVERY} === 0) __r3d.render(); }`);
    }
    const st = await ev('__r3d.render()');
    const ms = steps ? (Date.now() - t0) / steps : 0;
    await sleep(50);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `render-${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`${name.padEnd(12)} ${String(st.calls).padStart(4)} calls ${String(Math.round(st.triangles / 1000)).padStart(5)}k tris  ${st.views} views  ${st.level}  ~${ms.toFixed(0)} ms/frame (software GL)  -> ${join(OUT, `render-${name}.png`)}`);
    if (logs.length) console.log('   ', logs.slice(0, 6).join('\n    '));
   } catch (e) { console.log(name, 'FAILED', e.message, logs.slice(0, 6).join(' | ')); failed++; await openPage().catch(() => {}); }
  }
} catch (e) { console.error(e); failed++; }
await cmd('Target.closeTarget', { targetId }).catch(() => {});
cleanup();
process.exit(failed ? 1 : 0);
