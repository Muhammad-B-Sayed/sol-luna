// Feel measurements from real key events in the browser.
//   PORT=3451 node tools/playtest/feel-browser.mjs [levels]   -> tools/playtest/out/feel.json
//
// 1. Spawn headroom: on every level, each player (the other idle) taps jump once from where
//    they spawn. Records the rise (px), apex tick and air time, and whether the head hit
//    anything (vy cut to 0 while still rising).
// 2. Jump envelope on level 1 with the clock control: height, time to apex, air time,
//    frames from key down to first movement (run and jump), and whether holding jump
//    re-jumps on landing (and how often).
// 3. Latency in real time (no clock control): ms from the key event reaching the page to the
//    first drawn frame in which the character moved. Headless frame pacing, so a rough number.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { launch, startServer, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3451);
const BASE = `http://localhost:${PORT}`;
mkdirSync('tools/playtest/out', { recursive: true });
const which = (process.argv[2] || Array.from({ length: 32 }, (_, i) => i + 1).join(',')).split(',').map(Number);
const server = process.env.NOSERVER ? null : await startServer(PORT);
const B = await launch({ name: 'feel' });
const out = { spawn: {}, envelope: null, latency: null };

const P = await B.page(BASE + '/?unlock', { clock: true });
await P.eval('window.__pt.start()');
await P.frames(3);

async function startLevel(n) {
  await P.eval(`(() => { const b = document.querySelector('#pQuit'); window.__app.L && window.__app.mode === 'local' && b.click(); })()`);
  await P.frames(2);
  await P.click('#btnLocal');
  await P.frames(2);
  await P.click(`#levelGrid .lvl:nth-child(${n})`);
  const st = await P.eval(`window.__app.S.tick`);
  if (st !== 0) throw new Error('level did not start');
}
const PST = (i) => `(() => { const p = window.__app.S.p[${i}]; return { x: p.x, y: p.y, h: p.h, vy: p.vy, gr: p.gr, jumpN: p.jumpN, alive: p.alive, phase: window.__app.S.phase, tick: window.__app.S.tick }; })()`;

// tap jump for player i (key held for `hold` frames) and follow the arc until landing
async function measureJump(i, { hold = 2, maxFrames = 120 } = {}) {
  const key = i ? 'KeyW' : 'ArrowUp';
  const s0 = await P.eval(PST(i));
  const feet0 = s0.y + s0.h;
  await P.key(key, 'keyDown');
  let top = feet0, apexT = null, bonk = null, landT = null, prevVy = 0, f = 0, left = false, moveT = null;
  for (f = 1; f <= maxFrames; f++) {
    await P.frames(1);
    if (f === hold) await P.key(key, 'keyUp');
    const s = await P.eval(PST(i));
    const feet = s.y + s.h;
    if (moveT == null && feet !== feet0) moveT = f;
    if (!s.gr) left = true;
    if (feet < top) { top = feet; apexT = f; }
    if (left && !bonk && prevVy < -0.5 && s.vy >= 0 && s.vy < 0.5 && !s.gr) bonk = { frame: f, rise: feet0 - feet };
    prevVy = s.vy;
    if (left && s.gr) { landT = f; break; }
    if (s.phase !== 0) break;
  }
  if (f < hold) await P.key(key, 'keyUp');
  return { rise: +(feet0 - top).toFixed(1), apexT, airT: landT, bonk, moveFrames: moveT, landedDelta: +(((await P.eval(PST(i))).y + s0.h) - feet0).toFixed(1) };
}

for (const n of which) {
  await startLevel(n);
  await P.frames(20);   // settle on the spawn floor
  const r = {};
  const ok = await P.eval(`window.__app.S.p.map(p => p.gr)`);
  r.grounded = ok;
  r.sol = await measureJump(0);
  await P.frames(30);
  r.luna = await measureJump(1);
  out.spawn[n] = r;
  const flag = (j) => (j.bonk ? `BONK at ${j.bonk.rise.toFixed(0)}px` : j.rise < 97 ? 'LOW' : 'full');
  console.log(`${String(n).padStart(2)} sol rise ${r.sol.rise}px (${flag(r.sol)}, apex f${r.sol.apexT}, air ${r.sol.airT}f)  luna rise ${r.luna.rise}px (${flag(r.luna)}, apex f${r.luna.apexT}, air ${r.luna.airT}f)`);
}

// ---- envelope on level 1
await startLevel(1);
await P.frames(20);
const env = {};
env.standingJump = await measureJump(0);
await P.frames(30);
// running jump: hold right 20 frames, then jump while holding right; measure horizontal distance in the air
{
  await P.key('ArrowLeft', 'keyDown'); await P.frames(30); await P.key('ArrowLeft', 'keyUp'); await P.frames(20);
  const s0 = await P.eval(PST(0));
  await P.key('ArrowRight', 'keyDown');
  let f = 0, runMove = null;
  for (f = 1; f <= 20; f++) { await P.frames(1); const s = await P.eval(PST(0)); if (runMove == null && s.x !== s0.x) runMove = f; }
  env.runFirstMoveFrame = runMove;
  const sr = await P.eval(PST(0));
  await P.key('ArrowUp', 'keyDown'); await P.frames(1); await P.key('ArrowUp', 'keyUp');
  let land = null, top = sr.y;
  for (f = 1; f <= 90; f++) { await P.frames(1); const s = await P.eval(PST(0)); top = Math.min(top, s.y); if (f > 2 && s.gr) { land = s; break; } }
  await P.key('ArrowRight', 'keyUp');
  env.runningJump = { airFrames: f, dx: land ? +((land.x - sr.x) / 24).toFixed(2) : null, rise: +(sr.y - top).toFixed(1), note: 'may be cut short by terrain on level 1' };
}
await P.frames(40);
// hold jump: count re-jumps over 3 s
{
  const j0 = (await P.eval(PST(0))).jumpN;
  await P.key('ArrowUp', 'keyDown');
  const lands = [];
  let prevGr = true;
  for (let f = 1; f <= 180; f++) { await P.frames(1); const s = await P.eval(PST(0)); if (s.gr && !prevGr) lands.push(f); prevGr = s.gr; }
  await P.key('ArrowUp', 'keyUp');
  const j1 = (await P.eval(PST(0))).jumpN;
  env.holdJump = { jumpsIn3s: j1 - j0, landings: lands };
}
out.envelope = env;
console.log('envelope', JSON.stringify(env));
await P.close();

// ---- real-time latency (no clock control)
{
  const Q = await B.page(BASE + '/?unlock');
  await Q.click('#btnLocal'); await sleep(300);
  await Q.click('#levelGrid .lvl:nth-child(1)'); await sleep(1500);
  await Q.eval(`(() => {
    const L = window.__lat = { t0: 0, res: [], watch: null };
    addEventListener('keydown', (e) => { if (!e.repeat && (e.code === 'ArrowRight' || e.code === 'ArrowUp')) { L.t0 = performance.now(); const p = window.__app.S.p[0]; L.watch = { x: p.x, y: p.y, code: e.code }; } }, true);
    const f = (t) => { requestAnimationFrame(f); if (L.watch) { const p = window.__app.S.p[0]; if (p.x !== L.watch.x || p.y !== L.watch.y) { L.res.push([L.watch.code, performance.now() - L.t0]); L.watch = null; } } };
    requestAnimationFrame(f);
    let n = 0, last = performance.now(); const g = (t) => { n++; if (n < 120) requestAnimationFrame(g); else L.fps = 120000 / (performance.now() - last); }; requestAnimationFrame(g);
  })()`);
  for (let k = 0; k < 16; k++) {
    const code = k % 2 ? 'ArrowUp' : 'ArrowRight';
    await Q.key(code, 'keyDown'); await sleep(code === 'ArrowUp' ? 40 : 90 + (k * 7) % 30); await Q.key(code, 'keyUp');
    await sleep(code === 'ArrowUp' ? 1000 : 250 + (k * 13) % 40);
    if (k % 4 === 3) { await Q.key('ArrowLeft', 'keyDown'); await sleep(200); await Q.key('ArrowLeft', 'keyUp'); await sleep(250); }
  }
  const lat = await Q.eval('({ res: window.__lat.res, fps: window.__lat.fps })');
  const ms = (c) => lat.res.filter(r => r[0] === c).map(r => r[1]).sort((a, b) => a - b);
  const sum = (a) => a.length ? { n: a.length, min: +a[0].toFixed(1), median: +a[a.length >> 1].toFixed(1), max: +a[a.length - 1].toFixed(1) } : null;
  out.latency = { fps: lat.fps && +lat.fps.toFixed(1), run: sum(ms('ArrowRight')), jump: sum(ms('ArrowUp')) };
  console.log('latency', JSON.stringify(out.latency));
  await Q.close();
}
writeFileSync('tools/playtest/out/feel.json', JSON.stringify(out, null, 1));
if (B.pageErrors.length) console.log('page errors:', B.pageErrors.slice(0, 5));
B.close();
server?.stop();
process.exit(0);
