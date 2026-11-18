// Which WebGL renderer does headless Chromium get with a given set of flags?
//   node tools/r3d-glprobe.js                         try a list of flag sets
//   GL_FLAGS="--use-angle=vulkan" node tools/r3d-glprobe.js one
// Prints UNMASKED_RENDERER_WEBGL for each set (SwiftShader = software, anything else = the GPU).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || '/usr/bin/chromium';
const SETS = process.argv[2] === 'one' ? [process.env.GL_FLAGS || ''] : [
  '',
  '--enable-gpu',
  '--use-angle=vulkan --enable-features=Vulkan',
  '--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu --ignore-gpu-blocklist',
  '--use-gl=angle --use-angle=gl-egl',
  '--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist',
  '--use-angle=gl --ignore-gpu-blocklist',
  '--ozone-platform=headless --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist',
  'NOHEADLESS --ozone-platform=headless --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist',
  'NOHEADLESS --ozone-platform=headless --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist',
  'NOHEADLESS --ozone-platform=wayland --ignore-gpu-blocklist',
  'NOHEADLESS --ozone-platform=x11 --ignore-gpu-blocklist',
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function probe(flags) {
  const head = !flags.includes('NOHEADLESS');
  const fl = flags.replace('NOHEADLESS', '').split(' ').filter(Boolean);
  const profile = mkdtempSync('/tmp/sl-r3dpolish-probe-');
  const chrome = spawn(CHROME, [...(head ? ['--headless=new'] : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=640,360', ...fl, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
      chrome.on('exit', (c) => rej(new Error('exited ' + c + ' ' + buf.slice(-200))));
      setTimeout(() => rej(new Error('no start')), 15000);
    });
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));
    let id = 0; const wait = new Map();
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
    const cmd = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { result: { targetId } } = await cmd('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await cmd('Target.attachToTarget', { targetId, flatten: true });
    await sleep(300);
    const r = await cmd('Runtime.evaluate', { expression: `(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'no webgl'; const e = gl.getExtension('WEBGL_debug_renderer_info'); return (c.getContext('webgl2') ? 'webgl2 ' : 'webgl1 ') + (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); })()`, returnByValue: true }, sessionId);
    ws.close();
    return r.result?.result?.value ?? JSON.stringify(r).slice(0, 200);
  } catch (e) { return 'ERROR ' + e.message; }
  finally { try { chrome.kill('SIGKILL'); } catch {} await sleep(200); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
}

for (const f of SETS) console.log((f || '(default)').padEnd(100), '->', await probe(f));
process.exit(0);
