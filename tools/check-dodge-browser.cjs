// Real-browser checks for Dodgeball: local play, or an online room with two clients.
// Start a server first (LAG_MS adds latency for the online run), then:
//   node tools/check-dodge-browser.cjs <port> <outDir> local|online
// PLAYWRIGHT=/path/to/node_modules/playwright if it isn't installed here; CHROME_CHANNEL=chrome
// (default) drives the installed Google Chrome; CHROME=/usr/bin/chromium uses that binary instead.
// It saves screenshots of both balls mid-flight.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const [port, out, which] = process.argv.slice(2);
const URL = `http://localhost:${port}`;
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(...a);
const LAUNCH = { headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: process.env.CHROME_CHANNEL || 'chrome' }) };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const KEY = [{ act: 'ArrowDown', jump: 'ArrowUp' }, { act: 'KeyS', jump: 'KeyW' }];

async function errorsOf(page, bag) {
  page.on('console', m => { if (m.type() === 'error') bag.push(m.text()); });
  page.on('pageerror', e => bag.push(String(e)));
}
const D = (page) => page.evaluate(() => { const d = window.__app.S && window.__app.S.d; return d && JSON.parse(JSON.stringify({ phase: d.phase, t: d.t, holder: d.holder, score: d.score, ball: d.ball, throwN: d.throwN, hitN: d.hitN, winner: d.winner, serve: d.serve, aim: d.aim })); });
const waitPlay = (page) => page.waitForFunction(() => { const d = window.__app.S?.d; return d && d.phase === 1 && d.holder >= 0; }, null, { timeout: 15000, polling: 'raf' });

// freeze the frame the moment the ball is `past` px beyond the veil, then screenshot
async function freezeShot(page, file, { past = 140, freeze, unfreeze, clip = true }) {
  await page.evaluate(() => { window.__fl = []; const f = () => { const d = window.__app.S.d; window.__fl.push([d.ball.st, d.ball.by, Math.round(d.ball.x), Math.round(d.ball.y), d.holder, d.phase]); if (window.__fl.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForFunction(({ past, freeze }) => {
    const d = window.__app.S?.d; if (!d) return false;
    if (d.ball.st === 1 && Math.abs(d.ball.x - 480) > past && (d.ball.by === 0 ? d.ball.x > 480 : d.ball.x < 480)) { new Function(freeze)(); return true; }
    return false;
  }, { past, freeze }, { timeout: 8000, polling: 'raf' }).catch(async (e) => { console.log(JSON.stringify((await page.evaluate(() => window.__fl)).filter((v, i, a) => i === 0 || JSON.stringify(v) !== JSON.stringify(a[i - 1])).slice(0, 60))); throw e; });
  await sleep(120);   // a few rendered frames with the ball frozen
  const d = await D(page);
  await page.screenshot({ path: `${out}/${file}.png` });
  if (clip) {
    const box = await page.evaluate(() => { const r = document.querySelector('#game').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
    const s = box.w / 960, bx = d.ball.x, by = d.ball.y;
    const w = 420, h = 200, left = d.ball.by === 0 ? bx - w + 70 : bx - 70;
    await page.screenshot({ path: `${out}/${file}-close.png`, clip: { x: box.x + Math.max(0, left) * s, y: box.y + Math.max(0, by - h / 2) * s, width: w * s, height: h * s } });
  }
  await page.evaluate(unfreeze);
  return d;
}

async function tapAct(page, who, ms = 40) {
  await page.keyboard.down(KEY[who].act); await sleep(ms); await page.keyboard.up(KEY[who].act);
}

async function local() {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 825 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; await errorsOf(page, errs);
  await page.goto(URL + '/');
  await page.screenshot({ path: `${out}/local-0-menu.png` });
  await page.click('#btnDodge');
  await page.waitForFunction(() => window.__app.L?.dodge);
  log('local: court loaded, serve =', (await D(page)).serve === 0 ? 'Sol' : 'Luna', '| hint:', await page.textContent('#hint'));
  await waitPlay(page);
  // frame rate over 2 s of play
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  log('local: frame rate during play', fps.toFixed(1), 'fps');

  const shots = {};
  const fetchBall = async () => {   // walk the owner of a loose ball onto it
    for (let i = 0; i < 300; i++) {
      const d = await D(page);
      if (d.phase !== 1 || d.holder >= 0) return;
      if (d.ball.st < 2) { await sleep(30); continue; }
      const owner = d.ball.x < 480 ? 0 : 1;
      const px = await page.evaluate((o) => window.__app.S.p[o].x + 10, owner);
      const key = owner === 0 ? (d.ball.x < px ? 'ArrowLeft' : 'ArrowRight') : (d.ball.x < px ? 'KeyA' : 'KeyD');
      await page.keyboard.down(key); await sleep(60); await page.keyboard.up(key);
    }
  };
  for (let k = 0; k < 8 && !(shots.fireball && shots.moonball); k++) {
    await fetchBall();
    await waitPlay(page);
    const d0 = await D(page), who = d0.holder, name = who === 0 ? 'fireball' : 'moonball';
    if (shots[name]) { await tapAct(page, who); await sleep(600); continue; }   // already have this one
    // the target backs off toward its back wall, so the throw crosses most of the court
    const away = who === 0 ? 'KeyD' : 'ArrowLeft';
    await page.keyboard.down(away); await sleep(450); await page.keyboard.up(away);
    // hold the button for a moment to show the aim arrow, screenshot, then let go (tap = flat)
    await page.keyboard.down(KEY[who].act);
    await sleep(500);
    await page.evaluate(() => { window.__app.paused = true; });
    await sleep(100);
    await page.screenshot({ path: `${out}/local-${name}-aiming.png` });
    await page.evaluate(() => { window.__app.paused = false; });
    // release when the swing is back near flat: a full swing is 90 ticks after a 10-tick dwell
    await page.waitForFunction((who) => { const a = window.__app.S.d.aim[who]; return a < 0 || (a > 20 && (a - 10) % 90 >= 1 && (a - 10) % 90 <= 4); }, who, { polling: 'raf', timeout: 4000 });
    await page.keyboard.up(KEY[who].act);
    shots[name] = await freezeShot(page, `local-${name}-flight`, { past: 30, freeze: 'window.__app.paused = true', unfreeze: () => { window.__app.paused = false; } });
    log(`local: ${name} thrown by ${who ? 'Luna' : 'Sol'}, frozen at x=${shots[name].ball.x.toFixed(0)} vx=${shots[name].ball.vx.toFixed(1)}`);
    // capture the hit burst if it hits
    try {
      await page.waitForFunction((h) => window.__app.S.d.hitN > h, d0.hitN, { timeout: 1500, polling: 'raf' });
      await sleep(60);
      await page.evaluate(() => { window.__app.paused = true; }); await sleep(80);
      await page.screenshot({ path: `${out}/local-${name}-hit.png` });
      await page.evaluate(() => { window.__app.paused = false; });
      log(`local: ${name} hit, score`, (await D(page)).score.join('-'));
    } catch { log(`local: ${name} missed`); }
  }
  // play the rest of the match: whoever holds the ball taps a flat throw
  for (let i = 0; i < 600; i++) {
    const d = await D(page);
    if (d.phase === 3) break;
    if (d.phase === 1 && d.holder >= 0) await tapAct(page, d.holder);
    else if (d.phase === 1 && d.holder < 0 && d.ball.st >= 2) {
      // walk the owner to a loose ball
      const owner = d.ball.x < 480 ? 0 : 1;
      const px = await page.evaluate((o) => window.__app.S.p[o].x + 10, owner);
      const key = owner === 0 ? (d.ball.x < px ? 'ArrowLeft' : 'ArrowRight') : (d.ball.x < px ? 'KeyA' : 'KeyD');
      await page.keyboard.down(key); await sleep(80); await page.keyboard.up(key);
    } else await sleep(50);
  }
  await page.waitForSelector('#dodgeOver.on', { timeout: 5000 });
  const over = { title: await page.textContent('#dgWinner'), sol: await page.textContent('#dgSol'), luna: await page.textContent('#dgLuna') };
  log('local: winner screen:', over.title, over.sol + '-' + over.luna);
  await page.screenshot({ path: `${out}/local-winner.png` });
  await page.click('#dgRematch');
  await sleep(300);
  const re = await D(page);
  log('local: rematch ->', re.score.join('-'), 'phase', re.phase, '| screen', await page.evaluate(() => document.body.dataset.screen));
  // co-op still works: a level starts and steps
  await page.keyboard.press('Escape'); await sleep(100);
  await page.click('#pQuit'); await sleep(200);
  await page.click('#btnLocal'); await sleep(200);
  await page.click('#levelGrid .lvl'); await sleep(500);
  const coop = await page.evaluate(() => ({ dodge: !!window.__app.L.dodge, name: window.__app.L.name, tick: window.__app.S.tick, doors: window.__app.L.doors.length }));
  log('local: co-op level after dodge:', JSON.stringify(coop));
  log('local: console errors:', errs.length ? errs : 'none');
  await browser.close();
}

async function online() {
  const browser = await chromium.launch(LAUNCH);
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 1100, height: 825 }, deviceScaleFactor: 2 }); const p = await c.newPage(); p.errs = []; await errorsOf(p, p.errs); return p; };
  const A = await mk(), B = await mk();
  await A.goto(URL + '/');
  await A.click('#btnHost');
  await A.waitForFunction(() => window.__app.room?.code);
  const code = await A.evaluate(() => window.__app.room.code);
  await B.goto(`${URL}/${code}`);
  await A.waitForFunction(() => window.__app.room?.players.length === 2);
  await sleep(200);
  await A.screenshot({ path: `${out}/online-lobby.png` });
  log('online: room', code, 'lobby dodge button enabled:', await A.evaluate(() => !document.querySelector('#lobbyDodge').disabled));
  await A.click('#lobbyDodge');
  await A.waitForFunction(() => window.__app.L?.dodge); await B.waitForFunction(() => window.__app.L?.dodge);
  const me = { A: await A.evaluate(() => window.__app.me), B: await B.evaluate(() => window.__app.me) };
  log('online: A is', me.A ? 'Luna' : 'Sol', '| B is', me.B ? 'Luna' : 'Sol');
  const pageOf = (who) => (me.A === who ? A : B);
  // record, on both pages, the drawn ball position every frame (state + correction offset)
  for (const p of [A, B]) await p.evaluate(() => {
    window.__trace = [];
    const f = () => { const a = window.__app; if (a.S?.d) { const b = a.S.d.ball; window.__trace.push([b.st, b.x + (a.off?.ball?.x || 0), b.y + (a.off?.ball?.y || 0), a.S.d.throwN]); } requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const shots = {};
  for (let k = 0; k < 2; k++) {
    await waitPlay(A); await waitPlay(B);
    const d0 = await D(A), who = d0.holder, thrower = pageOf(who), watcher = pageOf(1 - who);
    const name = who === 0 ? 'fireball' : 'moonball';
    await thrower.keyboard.down('ArrowDown'); await sleep(40); await thrower.keyboard.up('ArrowDown');   // either key set works online
    shots[name] = await freezeShot(watcher, `online-${name}-flight-watcher`, { past: 0, freeze: 'window.__app.inGame = false', unfreeze: () => { window.__app.inGame = true; } });
    log(`online: ${name} by ${who ? 'Luna' : 'Sol'} seen on the other client mid-flight at x=${shots[name].ball.x.toFixed(0)}`);
    await A.waitForFunction((h) => { const d = window.__app.S.d; return d.hitN > h || (d.ball.st !== 1 && d.holder >= 0) || d.phase === 2; }, d0.hitN, { timeout: 5000 }).catch(() => {});
    await sleep(2300);
  }
  // smoothness: on the watching client, the drawn ball must move steadily during flight (no backward snaps)
  for (const [nm, p] of [['A', A], ['B', B]]) {
    const tr = await p.evaluate(() => window.__trace);
    let worstBack = 0, worstJump = 0, n = 0;
    for (let i = 1; i < tr.length; i++) {
      const [st, x, , th] = tr[i], [pst, px, , pth] = tr[i - 1];
      if (st !== 1 || pst !== 1 || th !== pth) continue;
      const dx = x - px; n++;
      const dir = tr.slice(Math.max(0, i - 3), i + 1).reduce((s, q, j, arr) => j ? s + (q[1] - arr[j - 1][1]) : s, 0) > 0 ? 1 : -1;
      worstBack = Math.max(worstBack, -dx * dir);
      worstJump = Math.max(worstJump, Math.abs(dx));
    }
    log(`online: client ${nm} drew ${n} in-flight frames; biggest backward step ${worstBack.toFixed(1)} px, biggest forward step ${worstJump.toFixed(1)} px (state moves 24 px/tick)`);
  }
  // play out the match: the holder taps
  for (let i = 0; i < 800; i++) {
    const d = await D(A);
    if (d.phase === 3) break;
    if (d.phase === 1 && d.holder >= 0) { const p = pageOf(d.holder); await p.keyboard.down('KeyS'); await sleep(50); await p.keyboard.up('KeyS'); await sleep(80); }
    else if (d.phase === 1 && d.holder < 0 && d.ball.st >= 2) {
      const owner = d.ball.x < 480 ? 0 : 1, p = pageOf(owner);
      const px = await p.evaluate((o) => window.__app.S.p[o].x + 10, owner);
      const key = d.ball.x < px ? 'ArrowLeft' : 'ArrowRight';
      await p.keyboard.down(key); await sleep(90); await p.keyboard.up(key);
    } else await sleep(60);
  }
  await A.waitForSelector('#dodgeOver.on', { timeout: 6000 }); await B.waitForSelector('#dodgeOver.on', { timeout: 6000 });
  const res = async (p) => `${await p.textContent('#dgWinner')} ${await p.textContent('#dgSol')}-${await p.textContent('#dgLuna')}`;
  log('online: winner screens: A:', await res(A), '| B:', await res(B));
  await B.screenshot({ path: `${out}/online-winner.png` });
  await B.click('#dgRematch');
  await A.waitForFunction(() => document.body.dataset.screen === 'game' && window.__app.S.d.score[0] + window.__app.S.d.score[1] === 0, null, { timeout: 4000 });
  log('online: rematch from the guest restarted both clients:', await A.evaluate(() => window.__app.S.d.score.join('-')), await B.evaluate(() => window.__app.S.d.score.join('-')));
  await A.keyboard.press('Escape'); await sleep(100);
  await A.click('#pLevels'); await sleep(400);
  log('online: back to lobby:', await A.evaluate(() => document.body.dataset.screen), await B.evaluate(() => document.body.dataset.screen));
  log('online: console errors:', A.errs.concat(B.errs).length ? A.errs.concat(B.errs) : 'none');
  await browser.close();
}

(which === 'online' ? online() : local()).catch(e => { console.error('FAILED', e); process.exit(1); });
