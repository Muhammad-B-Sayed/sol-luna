// Frame times of the Runner 3D renderer on this machine's GPU (headless Chromium, vsync and the
// frame-rate limit off, so each frame's interval is what it really costs). The demo page runs its
// bots in real time (they respawn when lost) and records every frame (?perf=1).
//   PORT=3470 node tools/r3d-perf.js                     single and split, 1280x720 and 1920x1080, z 0 / 600 / 1300, 30 s each
//   SECS=10 SIZES=1280x720 ZS=600 VIEWS=split Q=high node tools/r3d-perf.js
// Prints the median and 99th percentile frame interval, the median JS draw time, draw calls and
// triangles per view, and the quality level auto chose. Needs a server on PORT.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/usr/bin/chromium';
const BASE = `http://localhost:${process.env.PORT || 3470}`;
const SECS = +(process.env.SECS || 30);
const SIZES = (process.env.SIZES || '1280x720,1920x1080').split(',').map(s => s.split('x').map(Number));
const ZS = (process.env.ZS || '0,600,1300').split(',').map(Number);
const VIEWS = (process.env.VIEWS || 'single,split').split(',');
const Q = process.env.Q || '';   // force a quality level (default: auto, like the game)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync('/tmp/sl-r3dpolish-perf-');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--mute-audio', ...(process.env.GL_FLAGS ?? '--enable-gpu').split(' ').filter(Boolean), '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1920,1080', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('chrome did not start')), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.on('open', r));
let id = 0;
const waiting = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; waiting.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await cmd('Target.attachToTarget', { targetId, flatten: true });
await cmd('Page.enable', {}, s); await cmd('Runtime.enable', {}, s);
const ev = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const gpu = [];
const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
console.log('view    size        z     frames  median  p99    js-med  calls/view  tris/view  level');
for (const view of VIEWS) for (const [W, H] of SIZES) for (const z of ZS) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, s);
  await cmd('Page.navigate', { url: `${BASE}/r3d-demo.html?hud=0&perf=1&seed=7&z=${z}${view === 'split' ? '&split=1' : ''}${Q ? '&q=' + Q : ''}` }, s);
  for (let k = 0; k < 200; k++) { await sleep(100); if (await ev('!!(window.__r3d && __r3d.ready)').catch(() => false)) break; }
  if (!gpu.length) gpu.push(await ev(`(() => { const gl = __r3d.r.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' })()`));
  await sleep(2000);   // warm up: shaders compile, auto quality takes its first look
  await ev('(() => { const p = __r3d.perf; for (const k in p) p[k].length = 0; })()');
  await sleep(SECS * 1000);
  const p = await ev('__r3d.perf');
  const nv = view === 'split' ? 2 : 1;
  const lv = {}; for (const l of p.level) lv[l] = (lv[l] || 0) + 1;
  console.log(`${view.padEnd(7)} ${(W + 'x' + H).padEnd(10)} ${String(z).padStart(5)}  ${String(p.dt.length).padStart(6)}  ${pct(p.dt, 0.5).toFixed(2).padStart(6)}  ${pct(p.dt, 0.99).toFixed(2).padStart(5)}  ${pct(p.js, 0.5).toFixed(2).padStart(6)}  ${String(Math.round(pct(p.calls, 0.5) / nv)).padStart(10)}  ${String(Math.round(pct(p.tris, 0.5) / nv / 1000) + 'k').padStart(9)}  ${Object.entries(lv).map(([k, v]) => k + ' ' + Math.round(v / p.level.length * 100) + '%').join(' ')}`);
}
console.log('GPU:', gpu[0]);
ws.close();
process.exit(0);
