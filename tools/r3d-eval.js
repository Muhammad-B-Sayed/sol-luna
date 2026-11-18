// Open the Runner 3D demo in headless Chromium (GPU), run page-side expressions, print the results.
//   PORT=3470 node tools/r3d-eval.js "seed=7&kind=pools" "__r3d.step(10); __r3d.render(); __r3d.S.tick" ["more"...]
// Each expression is awaited; its JSON result is printed. Needs a server on PORT (node server/index.js).
// Env: W, H (viewport, default 1280x720), GL_FLAGS (default --enable-gpu), CHROME.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/usr/bin/chromium';
const BASE = `http://localhost:${process.env.PORT || 3470}`;
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const [query, ...exprs] = process.argv.slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync('/tmp/sl-r3dpolish-eval-');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--mute-audio', ...(process.env.GL_FLAGS ?? '--enable-gpu').split(' ').filter(Boolean), '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${H}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) console.log(m.params.type, m.params.args.map(a => a.value ?? a.description).join(' '));
});
const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; waiting.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await cmd('Target.attachToTarget', { targetId, flatten: true });
await cmd('Page.enable', {}, s); await cmd('Runtime.enable', {}, s);
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, s);
await cmd('Page.navigate', { url: `${BASE}/r3d-demo.html?hud=0&auto=0&${query}` }, s);
const ev = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
for (let k = 0; k < 200; k++) { await sleep(100); if (await ev('!!(window.__r3d && __r3d.ready)').catch(() => false)) break; }
await ev('__r3d.freeze(true)');
for (const e of exprs) console.log(JSON.stringify(await ev(`(async () => (${e}))()`)));
ws.close();
process.exit(0);
