// Real-browser check of Runner 3D: local split screen and an online room with two clients,
// driven with real mouse and key events over the DevTools protocol (uses only `ws`).
// Also starts a co-op level, Dodgeball and the 2D Runner to show the shell still works.
//
//   PORT=3420 node server/index.js &                       (LAG_MS=80 to test prediction)
//   PORT=3420 CHROME=/usr/bin/chromium node tools/runner3d-browser.js
// The play checks run on the 2D debug view (?r3ddebug=1), so they pass on a machine without a GPU.
// A second pass then plays with the real renderer: Chromium gets the GPU with --enable-gpu (the
// default GL_FLAGS; tools/r3d-glprobe.js shows what a set of flags gets). It plays a local split-screen
// match and an online match in real time, takes the screenshots mid-match, and checks that both
// online clients agree and how far prediction corrects (run the server with LAG_MS=80 for that).
// On software GL (SwiftShader) the real renderer is too slow to play, so that pass fast-forwards the
// local sim inside the page and takes the online shots during the countdown.
// Env: OUT (screenshots, default docs/img/runner3d), ONLY=local|online|webgl, RENDER=debug|webgl|both
// (default both), GL_FLAGS (Chromium GL flags, default --enable-gpu), MAX_VIEW_BACK (units the drawn
// local player may move backwards, default 0.05), MAX_REMOTE_STEP (units the drawn remote player may move in one frame, default 1: running and
// jumping move it up to about 0.4 a tick, and a correction eases out at 0.3 more).
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync) || 'chromium');
const BASE = `http://localhost:${process.env.PORT || 3420}`;
const OUT = process.env.OUT || 'docs/img/runner3d';
const ONLY = process.env.ONLY || '';
const RENDER = process.env.RENDER || 'both';
const QS = RENDER === 'webgl' ? '' : '?r3ddebug=1';
const FP = RENDER === 'both' ? 'debug-' : '';   // screenshot prefix of the play checks when the WebGL pass also runs
const MAX_VIEW_BACK = +(process.env.MAX_VIEW_BACK || 0.05);
const MAX_REMOTE_STEP = +(process.env.MAX_REMOTE_STEP || 1);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// a run killed with SIGKILL leaves its browser behind: sweep orphans of earlier runs (parent is init)
try {
  for (const line of execSync('ps -eo pid=,ppid=,args=', { encoding: 'utf8' }).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+1\s+(.*)$/);
    if (m && m[2].includes(`--user-data-dir=${join(tmpdir(), 'sl-r3d-')}`)) { try { process.kill(+m[1], 'SIGKILL'); } catch {} }
  }
} catch {}
const profile = mkdtempSync(join(tmpdir(), process.env.PROFILE_PREFIX || 'sl-r3d-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,720',
  ...(process.env.GL_FLAGS ?? '--enable-gpu').split(' ').filter(Boolean), 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('chrome did not start: ' + buf.slice(-400))), 20000);
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
  const i = ++id;
  const t = setTimeout(() => { waiting.delete(i); rej(new Error(method + ': no reply in 20 s')); }, 20000);
  waiting.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); });
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});

const KEYS = {
  ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'],
  KeyA: [65, 'a'], KeyD: [68, 'd'], KeyW: [87, 'w'], KeyS: [83, 's'], KeyR: [82, 'r'], KeyP: [80, 'p'],
  Space: [32, ' '], ShiftLeft: [16, 'Shift', 1], ShiftRight: [16, 'Shift', 2], Slash: [191, '/'], Numpad0: [96, '0', 3], ControlRight: [17, 'Control', 2],
  Escape: [27, 'Escape'], Enter: [13, 'Enter'],
};

async function page(url) {
  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
  const P = {
    send: (m, p) => cmd(m, p, sessionId),
    async eval(expr) {
      const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async key(code, type) {
      const [vk, key, location = 0] = KEYS[code] || [0, code];
      await cmd('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, location, ...(type === 'keyDown' && (key.length === 1 || key === 'Enter') ? { text: key === 'Enter' ? '\r' : key } : {}) }, sessionId);
    },
    async tap(code, ms = 70) { await P.key(code, 'keyDown'); await sleep(ms); await P.key(code, 'keyUp'); },
    async hold(codes, ms) { for (const c of codes) await P.key(c, 'keyDown'); await sleep(ms); for (const c of codes) await P.key(c, 'keyUp'); },
    async click(sel) {
      const r = await P.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, dis: e.disabled } })()`);
      if (!r) throw new Error('no element ' + sel);
      await cmd('Page.bringToFront', {}, sessionId);   // mouse input to a background tab can stall
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 }, sessionId);
      return r;
    },
    async mouse(type, x, y) { await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId); },
    async shot(name) {
      let r;   // a background tab's capture sometimes fails in headless: bring it forward and retry
      for (let k = 0; ; k++) {
        try { await cmd('Page.bringToFront', {}, sessionId); r = await cmd('Page.captureScreenshot', { format: 'png' }, sessionId); break; }
        catch (e) { if (k >= 3) throw e; await sleep(300); }
      }
      writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
      console.log('  screenshot', join(OUT, name + '.png'));
    },
    // hold keys until a sim condition holds (wall-clock holds drift when the machine is busy)
    async holdUntil(codes, expr, ms = 8000) { for (const c of codes) await P.key(c, 'keyDown'); const ok = await P.waitFor(expr, ms, 30); for (const c of codes) await P.key(c, 'keyUp'); await sleep(60); return ok; },
    async waitFor(expr, ms = 10000, step = 100) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await P.eval(expr).catch(() => false)) return true; await sleep(step); } return false; },
    close: () => cmd('Target.closeTarget', { targetId }),
  };
  await P.send('Page.enable');
  await P.send('Runtime.enable');
  await P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await P.send('Page.navigate', { url });
  await P.waitFor('!!window.__runner3d', 10000);
  await sleep(600);
  return P;
}

const errors = [];
function check(name, ok, info = '') { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!ok) errors.push(name); }
const ST = `(() => { const r = window.__runner3d, S = r.S; if (!S) return null; return { active: r.active, online: r.online, rend: r.rendKind, seed: S.seed, tick: S.tick, phase: S.phase, zone: S.zone, win: S.win,
  p: S.p.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), alive: p.alive, jumpN: p.jumpN })), screen: document.body.dataset.screen, corr: r.corr, rerr: r.renderErrors.length } })()`;
const screen = (P) => P.eval('document.body.dataset.screen');
// is a keydown with this code default-prevented when it starts on the given element?
const BLOCKED = (code, on = 'document.body') => `(() => { const e = new KeyboardEvent('keydown', { code: '${code}', bubbles: true, cancelable: true }); (${on}).dispatchEvent(e);
  (${on}).dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', bubbles: true })); return e.defaultPrevented })()`;   // release it: the game tracks held keys

try {
  if (ONLY !== 'online' && ONLY !== 'webgl') {
    // ---------------------------------------------------------------- local split screen
    console.log('Local split screen');
    const A = await page(BASE + '/' + QS);
    await A.shot(FP + 'menu');
    await A.click('#btnRunner3d');
    await A.waitFor('window.__runner3d.rendKind !== ""', 8000);
    await sleep(300);
    let s = await A.eval(ST);
    check('local: Runner 3D starts from the title menu button', s && s.active && !s.online && s.phase === 0 && s.screen === 'game', JSON.stringify({ phase: s?.phase, screen: s?.screen }));
    console.log('    renderer:', s.rend);
    const vis = await A.eval(`(() => ({ g2: getComputedStyle(document.querySelector('#game')).display, g3: getComputedStyle(document.querySelector('#game3d')).display, hud: getComputedStyle(document.querySelector('#r3Hud')).display }))()`);
    const blk = await A.eval(`[${['Enter', 'Slash', 'ShiftRight', 'Space', 'ArrowDown'].map(c => BLOCKED(c)).join(',')}, ${BLOCKED('Slash', "document.querySelector('#joinCode')")}]`);
    check('local: Enter / Shift Space arrows are kept from the page while playing, not in a text field', blk.slice(0, 5).every(Boolean) && !blk[5], JSON.stringify(blk));
    // the countdown shows each player's keys on their own half, and a jump reminder in their box
    const CARDS = `[...document.querySelectorAll('.r3-keys')].map(e => ({ op: +getComputedStyle(e).opacity, vis: getComputedStyle(e).display !== 'none', text: e.textContent, x: e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2 }))`;
    const JK = `[...document.querySelectorAll('.r3-jk')].map(e => getComputedStyle(e).display !== 'none' && e.offsetParent ? e.textContent : '')`;
    const cards = await A.eval(CARDS), jk0 = await A.eval(JK), W = await A.eval('innerWidth');
    check('local: the countdown shows Sol\'s keys (arrows, Enter) on the left half and Luna\'s (WASD, Space) on the right',
      cards[0].op > 0.9 && cards[1].op > 0.9 && /Sol/.test(cards[0].text) && /Enter/.test(cards[0].text) && /←/.test(cards[0].text) && /Luna/.test(cards[1].text) && /Space/.test(cards[1].text) && /W/.test(cards[1].text)
      && cards[0].x < W / 2 && cards[1].x > W / 2, JSON.stringify(cards.map(c => [c.op, c.text, Math.round(c.x)])));
    check('local: each box shows its jump key until that player jumps', /Enter/.test(jk0[0]) && /Space/.test(jk0[1]), JSON.stringify(jk0));
    check('local: 3D canvas and HUD shown, 2D canvas hidden', vis.g2 === 'none' && vis.g3 === 'block' && vis.hud === 'block', JSON.stringify(vis));
    await sleep(1200);
    await A.shot(FP + 'local-countdown');
    await A.waitFor('window.__runner3d.S.phase === 1', 5000);
    const s0 = await A.eval(ST);
    // Sol forward (arrow up) only
    const Z = (i) => `window.__runner3d.S.p[${i}].z`, X = (i) => `window.__runner3d.S.p[${i}].x`;
    await A.holdUntil(['ArrowUp'], `${Z(0)} > ${s0.p[0].z + 3}`);
    const s1 = await A.eval(ST);
    check('local: ArrowUp moves Sol forward, not Luna', s1.p[0].z > s0.p[0].z + 2 && Math.abs(s1.p[1].z - s0.p[1].z) < 0.01, `Sol z ${s0.p[0].z}→${s1.p[0].z}, Luna z ${s0.p[1].z}→${s1.p[1].z}`);
    await A.holdUntil(['KeyW'], `${Z(1)} > ${s1.p[1].z + 3}`);
    const s2 = await A.eval(ST);
    check('local: W moves Luna forward, not Sol', s2.p[1].z > s1.p[1].z + 2 && Math.abs(s2.p[0].z - s1.p[0].z) < 0.3, `Luna z ${s1.p[1].z}→${s2.p[1].z}`);
    await A.holdUntil(['ArrowLeft', 'KeyD'], `${X(0)} < ${s2.p[0].x - 1} && ${X(1)} > ${s2.p[1].x + 1}`);
    const s3 = await A.eval(ST);
    check('local: ArrowLeft / D move Sol left and Luna right', s3.p[0].x < s2.p[0].x - 0.5 && s3.p[1].x > s2.p[1].x + 0.5, `Sol x ${s2.p[0].x}→${s3.p[0].x}, Luna x ${s2.p[1].x}→${s3.p[1].x}`);
    await A.holdUntil(['ArrowDown', 'KeyS'], `${Z(0)} < ${s3.p[0].z - 0.6} && ${Z(1)} < ${s3.p[1].z - 0.6}`);
    const s3b = await A.eval(ST);
    check('local: ArrowDown / S move back', s3b.p[0].z < s3.p[0].z - 0.3 && s3b.p[1].z < s3.p[1].z - 0.3);
    await A.holdUntil(['ArrowUp', 'KeyW'], `${Z(0)} > 8 && ${Z(1)} > 8`);   // well ahead of the dusk for the jump checks
    // each round taps its keys together; a Sol key must not make Luna jump and the other way round
    for (const codes of [['Enter', 'Space'], ['ShiftRight', 'ShiftLeft'], ['Slash'], ['ControlRight'], ['Numpad0']]) {
      await A.waitFor('window.__runner3d.S.p.every(p => p.gr)', 5000, 30);   // land first
      const a = await A.eval(ST);
      for (const c of codes) await A.key(c, 'keyDown');
      await sleep(80);
      for (const c of codes) await A.key(c, 'keyUp');
      await sleep(150);
      const b = await A.eval(ST);
      for (const [who, code] of codes.map(c => [/Space|ShiftLeft/.test(c) ? 1 : 0, c])) {
        const other = 1 - who, otherPressed = codes.some(c => (/Space|ShiftLeft/.test(c) ? 1 : 0) === other);
        check(`local: ${code} makes ${who ? 'Luna' : 'Sol'} jump`, b.p[who].jumpN === a.p[who].jumpN + 1 && b.p[who].y > a.p[who].y
          && (otherPressed || b.p[other].jumpN === a.p[other].jumpN), `jumps ${a.p[who].jumpN}→${b.p[who].jumpN}, y ${b.p[who].y}`);
      }
    }
    const jk1 = await A.eval(JK), cards1 = await A.eval(CARDS);
    check('local: after the countdown the cards are gone, and after a jump the reminders too', jk1.every(t => !t) && cards1.every(c => c.op < 0.05), JSON.stringify({ jk1, op: cards1.map(c => c.op) }));
    await A.shot(FP + 'local-split');
    // pause and resume
    await A.tap('Escape');
    await sleep(200);
    const pz = await A.eval(ST);
    await sleep(400);
    const pz2 = await A.eval(ST);
    check('local: Esc pauses (sim frozen, pause card shown)', pz.screen === 'r3Pause' && pz2.tick === pz.tick, `${pz.screen} ticks ${pz.tick}/${pz2.tick}`);
    await A.tap('Escape');
    await sleep(200);
    const rs = await screen(A);
    check('local: Esc resumes', rs === 'game', rs);
    const s4 = await A.eval(ST);
    check('local: the dusk zone advances', s4.zone > s0.zone + 1, `zone ${s0.zone.toFixed(2)}→${s4.zone.toFixed(2)}`);
    // Sol runs ahead; Luna stands still and is caught
    await A.holdUntil(['ArrowUp'], `${Z(0)} > ${Z(1)} + 4`);
    let gotOver = await A.waitFor('window.__runner3d.S.phase === 2', 40000);
    const s5 = await A.eval(ST);
    check('local: the player who stands still loses, the other wins', gotOver && s5.win === 0 && s5.p[0].alive && !s5.p[1].alive, JSON.stringify({ win: s5.win, alive: s5.p.map(p => p.alive) }));
    await sleep(500);
    await A.shot(FP + 'local-over');
    await A.waitFor(`document.body.dataset.screen === 'r3Results'`, 5000);
    const res = await A.eval(`[...document.querySelectorAll('#r3Title, #r3Sol, #r3Luna')].map(e => e.textContent.trim()).join(' | ')`);
    check('local: results card shows the winner, times and distances', /Sol wins/.test(res) && /\d+ m/.test(res) && /dusk/.test(res), res);
    await A.shot(FP + 'results');
    const seedBefore = s5.seed;
    await A.tap('Enter');   // the rematch button has focus
    await sleep(500);
    const s6 = await A.eval(ST);
    check('local: rematch starts a new course', s6.seed !== seedBefore && s6.phase === 0 && s6.screen === 'game', `${seedBefore} -> ${s6.seed}`);
    await A.tap('KeyP'); await sleep(200);
    await A.click('#r3pQuit'); await sleep(400);
    const q = await A.eval(`({ screen: document.body.dataset.screen, active: window.__runner3d.active, r3d: document.body.classList.contains('r3d'), g2: getComputedStyle(document.querySelector('#game')).display })`);
    check('local: / is left alone again on the title screen', !(await A.eval(BLOCKED('Slash'))));
    check('local: quit returns to the title and restores the 2D canvas', q.screen === 'menu' && !q.active && !q.r3d && q.g2 !== 'none', JSON.stringify(q));
    check('local: no renderer errors', s6.rerr === 0);

    // ---------------------------------------------------------------- other modes still work
    console.log('Other modes');
    await A.click('#btnLocal'); await sleep(300);
    await A.click('#levelGrid .lvl'); await sleep(600);
    const t0 = await A.eval('window.__app.S?.tick'); await A.hold(['ArrowRight'], 400);
    const co = await A.eval(`({ t: window.__app.S?.tick, name: window.__app.L?.name, x: window.__app.S?.p[0].x, screen: document.body.dataset.screen })`);
    check('co-op: level 1 runs on the 2D canvas', co.screen === 'game' && co.t > t0 && !!co.name, JSON.stringify(co));
    await A.shot(FP + 'coop-after-runner3d');
    await A.tap('Escape'); await sleep(200); await A.click('#pQuit'); await sleep(300);
    await A.click('#btnDodge'); await sleep(600);
    const dg = await A.eval(`({ dodge: !!window.__app.L?.dodge, t: window.__app.S?.tick })`);
    await sleep(300);
    check('dodgeball: starts and ticks', dg.dodge && (await A.eval('window.__app.S.tick')) > dg.t);
    await A.tap('Escape'); await sleep(200); await A.click('#pQuit'); await sleep(300);
    await A.click('#btnRunner'); await sleep(600);
    const r2 = await A.eval(`({ active: window.__runner.active, mode: window.__runner.S?.mode, r3: window.__runner3d.active })`);
    check('2D runner: starts from the title', r2.active && r2.mode === 'runner' && !r2.r3, JSON.stringify(r2));
    await A.eval(`(() => { window.__runner.stop(); window.__runner.quit(); })()`);
    await sleep(200);
    check('back on the title screen', (await screen(A)) === 'menu');
    await A.close();
  }

  if (ONLY !== 'local' && ONLY !== 'webgl') {
    // ---------------------------------------------------------------- online room
    console.log('Online room (two clients)');
    const H = await page(BASE + '/' + QS);
    await H.click('#btnHost');
    let code = '';
    for (let k = 0; k < 40 && !code; k++) { await sleep(200); code = await H.eval(`window.__app.room?.code || ''`); }
    check('online: host made a room', code.length === 5, code);
    const before = await H.eval(`document.querySelector('#lobbyRunner3d').disabled`);
    const G = await page(BASE + '/' + code + QS);
    await H.waitFor(`!document.querySelector('#lobbyRunner3d').disabled`, 8000);
    check('online: Runner 3D button disabled alone, enabled with two players', before && !(await H.eval(`document.querySelector('#lobbyRunner3d').disabled`)));
    await H.shot(FP + 'lobby');
    await G.click('#lobbyRunner3d');
    await H.waitFor('window.__runner3d.active && window.__runner3d.rendKind !== ""', 8000);
    await G.waitFor('window.__runner3d.active && window.__runner3d.rendKind !== ""', 8000);
    const o1 = await Promise.all([H, G].map(P => P.eval(`(() => ({ ...${ST}, me: window.__app.me }))()`)));
    check('online: both clients in the same Runner 3D match', o1.every(s => s.active && s.online) && o1[0].seed === o1[1].seed && o1[0].me !== o1[1].me, JSON.stringify(o1.map(s => ({ seed: s.seed, me: s.me, rend: s.rend }))));
    const hostMe = o1[0].me, guestMe = o1[1].me;
    // the countdown shows each client its own card only: either set of move keys, Space to jump
    const OCARDS = `[...document.querySelectorAll('.r3-keys')].map(e => getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0.9 ? e.textContent : '')`;
    const oc = await Promise.all([H, G].map(P => P.eval(OCARDS)));
    check('online: the countdown shows only your own card, with Space to jump and no Enter',
      [hostMe, guestMe].every((m, k) => oc[k][m] && !oc[k][1 - m] && /Space/.test(oc[k][m]) && !/Enter/.test(oc[k][m]) && /\(you\)/.test(oc[k][m])), JSON.stringify(oc));
    await H.shot(FP + 'online-countdown-host'); await G.shot(FP + 'online-countdown-guest');
    await H.waitFor('window.__runner3d.S.phase === 1', 6000);
    await sleep(200);
    const a0 = await H.eval(ST);
    // the host uses the arrows, the guest WASD; both run forward, then jump with Space
    const OZ = (i) => `window.__runner3d.S.p[${i}].z`;
    await H.key('ArrowUp', 'keyDown'); await G.key('KeyW', 'keyDown');
    await H.waitFor(`${OZ(hostMe)} > 6 && ${OZ(guestMe)} > 6`, 8000, 30);
    await H.shot(FP + 'online-host'); await G.shot(FP + 'online-guest');
    await H.key('ArrowUp', 'keyUp'); await G.key('KeyW', 'keyUp');
    for (let k = 0; k < 2; k++) {
      await H.waitFor('window.__runner3d.S.p.every(p => p.gr)', 5000, 30);
      await H.tap('Space', 70); await G.tap('Space', 70);
      await sleep(300);
    }
    await H.waitFor('window.__runner3d.S.p.every(p => p.gr && Math.abs(p.vz) < 1e-9)', 5000, 30);
    await sleep(500);   // both stand still: the clients must settle on the same state
    const o2 = await Promise.all([H, G].map(P => P.eval(ST)));
    const moved = [hostMe, guestMe].every(i => o2[0].p[i].z > a0.p[i].z + 2);
    const jumped = [hostMe, guestMe].every(i => o2[0].p[i].jumpN >= a0.p[i].jumpN + 2);
    const diff = Math.max(...o2[0].p.map((q, i) => Math.abs(q.x - o2[1].p[i].x) + Math.abs(q.y - o2[1].p[i].y) + Math.abs(q.z - o2[1].p[i].z)));
    check('online: both players moved and jumped', moved && jumped, JSON.stringify(o2[0].p));
    // online Enter is the chat key, not a jump
    const e0 = await H.eval(ST);
    await H.tap('Enter'); await sleep(250);
    const e1 = await H.eval(`({ ...${ST}, chat: !document.querySelector('#chatPanel').hidden })`);
    check('online: Enter opens the chat and does not jump', e1.chat && e1.p[hostMe].jumpN === e0.p[hostMe].jumpN, JSON.stringify({ chat: e1.chat, jumps: [e0.p[hostMe].jumpN, e1.p[hostMe].jumpN] }));
    await H.tap('Escape'); await sleep(200);
    check('online: Esc closes the chat and play goes on', !(await H.eval(`!document.querySelector('#chatPanel').hidden`)) && (await screen(H)) === 'game');
    check('online: both clients agree on positions and jumps', diff < 0.02 && o2[0].p.every((q, i) => q.jumpN === o2[1].p[i].jumpN) && Math.abs(o2[0].tick - o2[1].tick) < 40, `max diff ${diff.toFixed(4)}, ticks ${o2[0].tick}/${o2[1].tick}`);
    // the guest stands still; the host runs on until the guest is caught
    await H.holdUntil(['ArrowUp'], `${OZ(hostMe)} > ${OZ(guestMe)} + 4`);   // a short lead keeps the host on the start floor
    await H.waitFor(`document.body.dataset.screen === 'r3Results'`, 40000);
    await G.waitFor(`document.body.dataset.screen === 'r3Results'`, 3000);
    const w = await Promise.all([H, G].map(P => P.eval(`[...document.querySelectorAll('#r3Title, #r3Sol, #r3Luna')].map(e => e.textContent.trim()).join(' | ')`)));
    const hostName = hostMe ? 'Luna' : 'Sol';
    check('online: both see the same result, the host wins', w[0] && w[0] === w[1] && w[0].startsWith(hostName + ' wins'), JSON.stringify(w));
    await G.shot(FP + 'online-results');
    const corr = await Promise.all([H, G].map(P => P.eval('window.__runner3d.corr')));
    console.log('    prediction corrections of the own player (units): ' + corr.map((c, i) => `${i ? 'guest' : 'host'} max ${c.max.toFixed(4)} back ${c.back.toFixed(4)} drawn-back ${c.viewBack.toFixed(4)} over ${c.n} snapshots`).join('; '));
    check('online: the local player is never drawn moving backwards', corr.every(c => c.viewBack <= MAX_VIEW_BACK), corr.map(c => c.viewBack.toFixed(4)).join(', '));
    await H.click('#r3Again');
    await H.waitFor(`window.__runner3d.S && window.__runner3d.S.seed !== ${o1[0].seed} && document.body.dataset.screen === 'game'`, 4000);
    await G.waitFor(`window.__runner3d.S && window.__runner3d.S.seed !== ${o1[0].seed} && document.body.dataset.screen === 'game'`, 4000);
    const o3 = await Promise.all([H, G].map(P => P.eval(ST)));
    check('online: rematch gives both a new course from the server', o3[0].seed === o3[1].seed && o3[0].seed !== o1[0].seed && o3.every(s => s.phase === 0 && s.screen === 'game'), JSON.stringify(o3.map(s => s.seed)));
    // touch: the guest pretends to be a touch device and runs with the thumb pad, then jumps
    await G.eval(`document.body.classList.add('touch')`);
    const pad = await G.eval(`(() => { const s = document.querySelector('#r3Touch .r3-stick').getBoundingClientRect(), j = document.querySelector('#r3Touch .r3-jump').getBoundingClientRect();
      return { vis: getComputedStyle(document.querySelector('#r3Touch')).display, sx: s.x + s.width / 2, sy: s.y + 6, jx: j.x + j.width / 2, jy: j.y + j.height / 2 } })()`);
    await G.waitFor('window.__runner3d.S.phase === 1', 8000);
    const t0 = await G.eval(ST);
    await G.send('Page.bringToFront');
    await G.mouse('mouseMoved', pad.sx, pad.sy); await G.mouse('mousePressed', pad.sx, pad.sy);
    const ran = await G.waitFor(`window.__runner3d.S.p[${guestMe}].z > ${t0.p[guestMe].z + 2}`, 8000, 30);
    await G.mouse('mouseReleased', pad.sx, pad.sy);
    await G.waitFor(`window.__runner3d.S.p[${guestMe}].gr`, 5000, 30);
    const j0 = await G.eval(`window.__runner3d.S.p[${guestMe}].jumpN`);
    await G.mouse('mouseMoved', pad.jx, pad.jy); await G.mouse('mousePressed', pad.jx, pad.jy); await sleep(100); await G.mouse('mouseReleased', pad.jx, pad.jy);
    const jumpedT = await G.waitFor(`window.__runner3d.S.p[${guestMe}].jumpN > ${j0}`, 3000, 30);
    check('online: touch pad shows on a touch device; the stick runs forward and the button jumps', pad.vis === 'flex' && ran && jumpedT, JSON.stringify({ vis: pad.vis, ran, jumpedT }));
    await G.tap('Escape'); await sleep(200);
    check('online: guest pause card offers "Back to room"', (await screen(G)) === 'r3Pause' && !(await G.eval(`document.querySelector('#r3pRoom').hidden`)));
    await G.click('#r3pRoom');
    await sleep(800);
    const back = await Promise.all([H, G].map(P => P.eval(`({ screen: document.body.dataset.screen, active: window.__runner3d.active, r3d: document.body.classList.contains('r3d') })`)));
    check('online: back to the room lobby on both', back.every(b => b.screen === 'lobby' && !b.active && !b.r3d), JSON.stringify(back));
    const rerr = await Promise.all([H, G].map(P => P.eval('window.__runner3d.renderErrors')));
    check('online: no renderer errors', rerr.every(e => !e.length), rerr.flat().slice(0, 2).join(' | '));
    await H.close(); await G.close();
  }

  if (RENDER !== 'debug' && (!ONLY || ONLY === 'webgl')) {
    // ---------------------------------------------------------------- the real renderer
    console.log('WebGL renderer (screenshots)');
    const slow = 60000;
    let fast = false;
    const FF = (n, bits, toEnd = false) => `(async () => {   // fast-forward the local sim n ticks
      const R = await import('/shared/runner3d.js'); const r = window.__runner3d, f = (${bits});
      for (let k = 0; k < ${n} && (${toEnd} || r.S.phase !== 2); k++) { r.S = R.stepRunner3d(r.L, r.S, f(r.S.tick)); }
      r.prev = r.capture(r.S); r.heard = null; return r.S.phase;
    })()`;
    const A = await page(BASE + '/');
    await A.shot('menu');
    await A.click('#btnRunner3d');
    const loaded = await A.waitFor('window.__runner3d.rendKind !== ""', slow);
    const kind = await A.eval('window.__runner3d.rendKind');
    check('webgl: the title button loads the real renderer', loaded && kind === 'webgl', kind);
    const gl = await A.eval(`(() => { const c = document.createElement('canvas').getContext('webgl2'), e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' })()`);
    if ((await A.eval('window.__runner3d.S.phase')) === 0) {
      await A.waitFor('(window.__runner3d.frames || 0) > 20', 4000);
      await A.shot('countdown-split');
    }
    // a real GPU draws in real time: then the matches below are played, not fast-forwarded
    await A.waitFor('window.__runner3d.S.phase === 1', 8000);
    const fr0 = await A.eval('window.__runner3d.frames || 0'); await sleep(1000);
    const localFps = (await A.eval('window.__runner3d.frames || 0')) - fr0;
    fast = localFps >= 30 && !/SwiftShader/i.test(gl);
    console.log(`    GL: ${gl}; local split screen draws ${localFps} frames a second${fast ? ' (playing in real time)' : ' (fast-forwarding)'}`);
    if (fast) {
      await A.hold(['ArrowUp', 'KeyW'], 2500);
      await A.holdUntil(['ArrowUp', 'KeyW'], 'window.__runner3d.S.p.every(p => p.z > 22)', 6000);
      await A.shot('local-split');
      const sp = await A.eval(ST);
      check('webgl: local split screen plays in real time', sp.p.every(p => p.z > 10), JSON.stringify(sp.p.map(p => p.z)));
      const tips = await A.eval(`[...document.querySelectorAll('.r3-tip')].map(e => getComputedStyle(e).opacity > 0.5 ? e.textContent : '')`);
      check('webgl: each player sees a tip as the first obstacle comes up', tips.every(Boolean), JSON.stringify(tips));
      await A.eval(`(() => { window.__runner3d.prev = window.__runner3d.capture(window.__runner3d.S); })()`);
    } else {
      // Sol runs and hops, Luna runs a little slower
      await A.eval(FF(330, `(t) => [8 | (t % 70 === 0 ? 4 : 0), t % 3 ? 8 : 0]`));
      const f0 = await A.eval('window.__runner3d.frames || 0');
      await A.waitFor(`(window.__runner3d.frames || 0) > ${f0 + 2}`, slow);
      await A.shot('local-split');
    }
    // Sol keeps running, Luna stops: Luna is caught
    await A.eval(FF(4000, `(t) => [8 | (t % 70 === 0 ? 4 : 0), 0]`));
    await A.eval(FF(68, `() => [0, 0]`, true));   // the results card opens 70 ticks after the end
    const res = await A.waitFor(`document.body.dataset.screen === 'r3Results'`, slow);
    await A.waitFor(`(window.__runner3d.frames || 0) > ${(await A.eval('window.__runner3d.frames || 0')) + 1}`, slow);
    check('webgl: the results card shows over the 3D view', res);
    await A.shot('results');
    const le = await A.eval('window.__runner3d.renderErrors');
    check('webgl: local split screen draws without renderer errors', !le.length, le.slice(0, 2).join(' | '));
    await A.click('#r3Menu');
    await A.close();

    const H = await page(BASE + '/');
    await H.click('#btnHost');
    let code = '';
    for (let k = 0; k < 60 && !code; k++) { await sleep(250); code = await H.eval(`window.__app.room?.code || ''`); }
    const G = await page(BASE + '/' + code);
    await H.waitFor(`!document.querySelector('#lobbyRunner3d').disabled`, slow);
    await H.shot('lobby');
    await Promise.all([H, G].map(P => P.eval('window.__runner3d.loadRenderer().then(() => window.__runner3d.rendKind)')));
    await H.click('#lobbyRunner3d');
    const ok = await H.waitFor('window.__runner3d.rendKind === "webgl" && window.__runner3d.S', slow) && await G.waitFor('window.__runner3d.rendKind === "webgl" && window.__runner3d.S', slow);
    check('webgl: both online clients load the real renderer', ok);
    if ((await H.eval('window.__runner3d.S.phase')) === 0) {
      await Promise.all([H, G].map(P => P.waitFor('(window.__runner3d.frames || 0) > 20', 4000)));
      await H.shot('countdown-online-host'); await G.shot('countdown-online-guest');
    }
    if (fast) {
      // real time: both run forward through the start, and the shots are taken mid-match
      const me = await Promise.all([H, G].map(P => P.eval('window.__app.me')));
      const OZ = (i) => `window.__runner3d.S.p[${i}].z`;
      await H.waitFor('window.__runner3d.S.phase === 1', 8000);
      const f0 = await Promise.all([H, G].map(P => P.eval('window.__runner3d.frames || 0')));
      const t0 = Date.now();
      await H.key('ArrowUp', 'keyDown'); await G.key('KeyW', 'keyDown');
      const ran = await H.waitFor(`${OZ(me[0])} > 16 && ${OZ(me[1])} > 16`, 10000, 30);
      await H.shot('online-host'); await G.shot('online-guest');
      const fps = (await Promise.all([H, G].map(P => P.eval('window.__runner3d.frames || 0')))).map((f, i) => (f - f0[i]) / ((Date.now() - t0) / 1000));
      await H.key('ArrowUp', 'keyUp'); await G.key('KeyW', 'keyUp');
      console.log(`    online frame rate while running (each client, both on this GPU): ${fps.map(f => f.toFixed(0)).join(' / ')} fps`);
      check('webgl: both online players ran through the start in real time', ran);
      for (let k = 0; k < 2; k++) {
        await H.waitFor('window.__runner3d.S.p.every(p => p.gr)', 5000, 30);
        await H.tap('Space', 70); await G.tap('Space', 70);
        await sleep(300);
      }
      await H.waitFor('window.__runner3d.S.p.every(p => p.gr && Math.abs(p.vz) < 1e-9)', 5000, 30);
      await sleep(500);
      const o2 = await Promise.all([H, G].map(P => P.eval(ST)));
      const diff = Math.max(...o2[0].p.map((q, i) => Math.abs(q.x - o2[1].p[i].x) + Math.abs(q.y - o2[1].p[i].y) + Math.abs(q.z - o2[1].p[i].z)));
      check('webgl: both online clients agree on positions and jumps', diff < 0.02 && o2[0].p.every((q, i) => q.jumpN === o2[1].p[i].jumpN), `max diff ${diff.toFixed(4)}, ticks ${o2[0].tick}/${o2[1].tick}`);
      // the guest runs on alone (its prediction is what we measure), the host stands still and is caught
      await G.holdUntil(['KeyW'], `${OZ(me[1])} > ${OZ(me[0])} + 4`);
      await G.waitFor(`document.body.dataset.screen === 'r3Results'`, 40000);
      await G.shot('online-results');
      const corr = await Promise.all([H, G].map(P => P.eval('window.__runner3d.corr')));
      console.log('    prediction (real renderer): ' + corr.map((c, i) => `${i ? 'guest' : 'host'}: own player max correction ${c.max.toFixed(4)}, back ${c.back.toFixed(4)}, drawn back ${c.viewBack.toFixed(4)}; other player's largest drawn step ${c.remoteStep.toFixed(3)}, drawn back ${c.remoteBack.toFixed(4)} over ${c.n} snapshots`).join('\n    '));
      check('webgl: the local player is never drawn moving backwards', corr.every(c => c.viewBack <= MAX_VIEW_BACK), corr.map(c => c.viewBack.toFixed(4)).join(', '));
      check('webgl: the other player\'s drawn motion is continuous (no pops)', corr.every(c => c.remoteStep <= MAX_REMOTE_STEP), corr.map(c => c.remoteStep.toFixed(3)).join(', '));
    } else {
      // software GL: the clients draw far slower than the server's real-time 60 Hz, so the match
      // can't be played here; the shots show both views during the server's countdown
      await Promise.all([H, G].map(P => P.waitFor('(window.__runner3d.frames || 0) > 1', slow)));
      await H.shot('online-host'); await G.shot('online-guest');
      console.log('    online shots taken at server tick', await H.eval('window.__runner3d.S?.tick'), '(the countdown is 180)');
    }
    const oe = await Promise.all([H, G].map(P => P.eval('window.__runner3d.renderErrors')));
    check('webgl: online views draw without renderer errors', oe.every(e => !e.length), oe.flat().slice(0, 2).join(' | '));
    await H.eval(`window.__runner3d.net.send({ t: 'menu' })`);
    await sleep(500);
    await H.close(); await G.close();

    // players far apart (there is no lead cap): each drawn camera keeps its own surroundings
    for (const [name, qs, drawn] of [['far-split', 'split=1', [0, 1]], ['far-single', 'me=1', [1]]]) {
      const D = await page(BASE + `/r3d-demo.html?seed=7&bot=0&hud=0&auto=0&${qs}`);
      await D.waitFor('window.__r3d && window.__r3d.ready', slow);
      const far = await D.eval(`(() => { const d = window.__r3d, L = d.L, S = d.S, R3 = d.R3;
        R3.ensureGenerated(L, 700);
        const runup = (z) => L.objs.find(o => o.k === 'floor' && o.skin === 1 && o.z0 >= z);
        [runup(60), runup(420)].forEach((o, i) => Object.assign(S.p[i], { x: (o.x0 + o.x1) / 2, z: o.z0 + 1, y: o.y, fy: o.y, vx: 0, vy: 0, vz: 0, gr: true, alive: true }));
        S.zone = S.p[0].z - 10;
        d.step(2); for (let k = 0; k < 40; k++) d.render();
        const zs = [...d.r.views.keys()].map(i => L.objs[i]);
        return S.p.map(p => ({ z: +p.z.toFixed(1), around: zs.filter(o => o.z1 > p.z - 5 && o.z0 < p.z + 60).length, ahead: zs.some(o => o.z0 > p.z + 50) })); })()`);
      await D.shot(name);
      check(`webgl: ${name}: players ${Math.round(far[1].z - far[0].z)} units apart, each drawn camera has its surroundings`,
        drawn.every(i => far[i].around >= 8 && far[i].ahead), JSON.stringify(far));
      const de = await D.eval('window.__r3d.r.stats()');
      console.log(`    ${name}: ${de.views} object views kept`);
      await D.close();
    }
  }
} catch (e) {
  console.error(e); errors.push(String(e));
}
check('no uncaught page errors', !pageErrors.length, pageErrors.slice(0, 3).join(' | '));
ws.close();
cleanup();
console.log(errors.length ? `\n${errors.length} problem(s)` : '\nall browser checks passed');
process.exit(errors.length ? 1 : 0);
