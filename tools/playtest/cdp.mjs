// Small DevTools-protocol helper for the playtest: launches headless Chromium, opens pages,
// sends real key events (Input.dispatchKeyEvent, the same path a keyboard takes) and takes
// screenshots. Uses only the `ws` package, like tools/runner-browser.js.
//
// Clock control. A page opened with { clock: true } gets a script, before any game code runs,
// that lets the driver own requestAnimationFrame and performance.now once __pt.manual is set.
// Then P.frames(k) runs k display frames of exactly 1/60 s each, so the game's own loop
// (frame -> tickLocal -> input.local() -> step) advances exactly one tick per frame and a key
// event sent between two frames lands on a known tick. Nothing in the game is changed.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CLOCK = `(() => {
  const DT = 1000 / 60 + 1e-4;
  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let now = 0, q = [];
  const pt = window.__pt = { manual: false, down: new Set(), frameN: 0 };
  performance.now = () => (pt.manual ? now : realNow());
  window.requestAnimationFrame = (cb) => {
    if (pt.manual) { q.push(cb); return 1; }
    return realRAF((t) => (pt.manual ? q.push(cb) : cb(t)));
  };
  pt.start = () => { if (!pt.manual) { now = realNow(); pt.manual = true; } return now; };
  pt.stop = () => { pt.manual = false; const cbs = q.splice(0); cbs.forEach(cb => realRAF(cb)); };
  pt.frames = (k, stopIf) => {
    for (let i = 0; i < k; i++) {
      now += DT; pt.frameN++;
      const cbs = q.splice(0);
      for (const cb of cbs) cb(now);
      if (stopIf && stopIf()) return i + 1;
    }
    return k;
  };
  addEventListener('keydown', (e) => pt.down.add(e.code), true);
  addEventListener('keyup', (e) => pt.down.delete(e.code), true);
})();`;

const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, KeyA: 65, KeyD: 68, KeyW: 87, KeyS: 83, KeyP: 80, KeyR: 82,
  Escape: 27, Enter: 13, Tab: 9, Space: 32 };
const KEYNAME = { KeyA: 'a', KeyD: 'd', KeyW: 'w', KeyS: 's', KeyP: 'p', KeyR: 'r', Space: ' ' };

export async function launch({ name = 'main', width = 1280, height = 800 } = {}) {
  const CHROME = process.env.CHROME || '/usr/bin/chromium';
  const profile = mkdtempSync(`/tmp/sl-playtest-${name}-`);
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  process.on('exit', cleanup);
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
    setTimeout(() => rej(new Error('chromium did not start')), 20000);
  });
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0;
  const waiting = new Map();
  const pageErrors = [];
  const consoleErrors = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  const cmd = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; waiting.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

  async function page(url, { clock = false, w = width, h = height, scale = 1, ready = '!!window.__app' } = {}) {
    const { targetId } = await cmd('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cmd(m, p, sessionId);
    const P = {
      targetId, sessionId, send,
      async eval(expr) {
        const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
        if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      },
      async key(code, type) {
        const key = KEYNAME[code] || code;
        await cmd('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: VK[code] || 0, nativeVirtualKeyCode: VK[code] || 0 }, sessionId);
      },
      async tap(code, ms = 60) { await P.key(code, 'keyDown'); await sleep(ms); await P.key(code, 'keyUp'); },
      async click(sel) {
        const r = await P.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
        if (!r) throw new Error('no element ' + sel);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
      },
      async type(text) { await send('Input.insertText', { text }); },
      async shot(file, { quality = 78 } = {}) {
        mkdirSync(dirname(file), { recursive: true });
        const png = file.endsWith('.png');
        const r = await send('Page.captureScreenshot', png ? { format: 'png' } : { format: 'jpeg', quality });
        writeFileSync(file, Buffer.from(r.data, 'base64'));
        return file;
      },
      frames: (k, stopIf) => P.eval(`window.__pt.frames(${k}${stopIf ? `, () => (${stopIf})` : ''})`),
      close: () => cmd('Target.closeTarget', { targetId }).catch(() => {}),
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    if (clock) await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
    await send('Page.navigate', { url });
    for (let k = 0; k < 60; k++) { await sleep(150); if (await P.eval(ready).catch(() => false)) break; }
    await sleep(300);
    return P;
  }
  return { page, cmd, pageErrors, consoleErrors, close: () => { try { ws.close(); } catch {} cleanup(); } };
}

export async function startServer(port, env = {}) {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {} });
  for (let k = 0; k < 50; k++) {
    await sleep(150);
    try { const r = await fetch(`http://localhost:${port}/healthz`); if (r.ok) return { srv, log: () => log, stop: () => srv.kill('SIGTERM') }; } catch {}
  }
  throw new Error('server did not start: ' + log);
}

export const SOL_KEYS = [['ArrowLeft', 1], ['ArrowRight', 2], ['ArrowUp', 4]];
export const LUNA_KEYS = [['KeyA', 1], ['KeyD', 2], ['KeyW', 4]];
export const keysFor = (who) => (who ? LUNA_KEYS : SOL_KEYS);

// Moves the keyboard from bits `from` to bits `to` for player `who` with real key events.
export async function setBits(P, who, from, to) {
  for (const [code, bit] of keysFor(who)) {
    if ((from & bit) && !(to & bit)) await P.key(code, 'keyUp');
    if (!(from & bit) && (to & bit)) await P.key(code, 'keyDown');
  }
}
