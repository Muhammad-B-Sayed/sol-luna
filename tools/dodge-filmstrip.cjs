// Filmstrips of one online Dodgeball throw, from both screens, with the real renderer.
//   node tools/dodge-filmstrip.cjs <port> <out.png> hit|dodge [label]
// Start a server first (LAG_MS sets the one-way latency). PLAYWRIGHT=/path/to/playwright if it
// isn't installed here, CHROME=/usr/bin/chromium for the browser (tools/playtest/pw-shim.cjs).
//
// Two headless pages join one room. Bots run inside the pages, once per drawn frame:
//   - the thrower stays on their spawn and taps a flat throw once play starts;
//   - the defender walks to their back wall (a 24-tick flight, "mid" in tools/dodge-latency.js)
//     and, for "dodge", jumps REACT ticks after the ball first shows in flight on their screen
//     (default 16 = 267 ms, inside every fix's window at 100 ms one-way); for "hit" never.
// Every frame both pages draw is copied (the court's lower part, half size) with the wall-clock
// time and a few state fields. The sheet has one row per 2 frames (33 ms) from just before the
// thrower's key release to after the outcome: thrower's screen left, defender's screen right,
// both at the same wall-clock time. Labels: held / aim / wind k (fix C wind-up, ticks left) /
// live / stop (ball stopped in a player waiting for the server) / HIT / dead.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const path = require('path');
const [port, outFile, outcome = 'hit', label = ''] = process.argv.slice(2);
const URL = `http://localhost:${port}`;
const REACT = +(process.env.REACT || 16);
const STEP = +(process.env.STEP || 2);   // frames per sheet row
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LAUNCH = { headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) };

// Runs in the page. Hooks requestAnimationFrame so the bot and the frame copy run right after
// each game frame has drawn.
const HOOK = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { cb(t); try { window.__after && window.__after(t); } catch (e) { console.error(e); } });
})();`;

function botSetup({ role, react }) {
  const a = window.__app, me = a.me, other = 1 - me;
  const KEY = { act: 'ArrowDown', jump: 'ArrowUp', away: me === 0 ? 'ArrowLeft' : 'ArrowRight' };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const cv = document.querySelector('#game');
  const st = window.__fs = { frames: [], rel: -1, sight: -1, jumped: false, done: false, walk: 0, tapped: 0 };
  const W = 960, Y0 = 470, Y1 = 700, K = 0.5;   // world rows copied: platforms above the floor down to it
  window.__after = () => {
    const S = a.S; if (!S || !S.d) return;
    const D = S.d, b = D.ball, now = performance.timeOrigin + performance.now();
    // bot
    if (role === 'D') {
      if (D.phase === 0 && st.walk < 70) { if (!st.walk) key('keydown', KEY.away); if (++st.walk === 70) key('keyup', KEY.away); }
      const age = a.bv ? a.bv.age : b.t;   // fix B draws a ball thrown at you behind time (app.bv)
      if (st.sight < 0 && b.st === 1 && b.by === other && age >= 1) st.sight = S.tick;
      if (react > 0 && st.sight >= 0 && !st.jumped && S.tick - st.sight >= react - 1) { st.jumped = true; key('keydown', KEY.jump); setTimeout(() => key('keyup', KEY.jump), 120); }
    } else if (D.phase === 1 && D.holder === me && D.t > 30 && !st.tapped) { st.tapped = 1; key('keydown', KEY.act); }
    else if (st.tapped === 1 && (D.aim[me] >= 0 || D.wind > 0 || D.holder !== me)) { st.tapped = 2; key('keyup', KEY.act); st.rel = now; }
    // frame copy
    if (D.phase >= 1 && st.frames.length < 400 && !st.done) {
      const s = cv.width / W, c = document.createElement('canvas');
      c.width = W * K; c.height = (Y1 - Y0) * K;
      c.getContext('2d').drawImage(cv, 0, Y0 * s, W * s, (Y1 - Y0) * s, 0, 0, c.width, c.height);
      const tag = D.phase === 2 ? (D.hitN ? 'HIT' : 'point') : b.st === 0 ? (D.wind > 0 ? 'wind ' + D.wind : D.aim[D.holder] >= 0 ? 'aim' : 'held') : b.st === 1 ? (b.pv >= 0 ? 'stop' : 'live ' + Math.max(0, a.bv ? a.bv.age : b.t)) : 'dead';
      st.frames.push({ t: now, tick: S.tick, tag, c, jump: S.p[role === 'D' ? me : other].vy < -1 });
    }
  };
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 980, height: 760 }, deviceScaleFactor: 1 }); await c.addInitScript(HOOK); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); return p; };
  try {
    const A = await mk(), B = await mk();
    await A.goto(URL + '/');
    await A.click('#btnHost');
    await A.waitForFunction(() => window.__app.room?.code);
    const code = await A.evaluate(() => window.__app.room.code);
    await B.goto(`${URL}/${code}`);
    await A.waitForFunction(() => window.__app.room?.players.length === 2);
    await sleep(1200);   // let the server collect a few round-trip samples
    await A.click('#lobbyDodge');
    await A.waitForFunction(() => window.__app.L?.dodge); await B.waitForFunction(() => window.__app.L?.dodge);
    await sleep(100);
    const serve = await A.evaluate(() => window.__app.S.d.serve);
    const meA = await A.evaluate(() => window.__app.me);
    const [T, Dp] = meA === serve ? [A, B] : [B, A];
    await T.evaluate(botSetup, { role: 'T', react: 0 });
    await Dp.evaluate(botSetup, { role: 'D', react: outcome === 'dodge' ? REACT : 0 });
    // wait for the outcome on the defender's screen (point, or the ball dead), then a bit more
    await Dp.waitForFunction(() => { const d = window.__app.S.d; return d.throwN > 0 && (d.phase === 2 || d.ball.st >= 2); }, null, { timeout: 20000, polling: 100 });
    await sleep(500);
    for (const p of [T, Dp]) await p.evaluate(() => { window.__fs.done = true; });
    const info = async (p) => p.evaluate(() => ({ rel: window.__fs.rel, n: window.__fs.frames.length, hit: window.__app.S.d.hitN > 0, wind: window.__app.S.d.windN || 0, grace: window.__app.S.d.grace || null, rtt: Math.round(window.__app.S && 0) }));
    const ti = await info(T), di = await info(Dp);
    const rel = ti.rel;
    // pull the frames out as data URLs, then compose the sheet in the thrower's page
    const grab = (p) => p.evaluate((rel) => window.__fs.frames.filter(f => f.t >= rel - 120 && f.t <= rel + 1600).map(f => ({ t: f.t - rel, tick: f.tick, tag: f.tag, jump: f.jump, url: f.c.toDataURL('image/png') })), rel);
    const tf = await grab(T), df = await grab(Dp);
    // rows: every STEP-th thrower frame from 2 frames before the release until both screens settle
    const settled = (fr) => { const i = fr.findIndex(f => f.tag === 'HIT' || f.tag === 'dead' || f.tag === 'point'); return i < 0 ? fr.length - 1 : Math.min(fr.length - 1, i + 6); };
    const tEnd = Math.max(tf[settled(tf)]?.t ?? 0, df[settled(df)]?.t ?? 0);
    const start = Math.max(0, tf.findIndex(f => f.t >= -40));
    const rows = [];
    for (let i = start; i < tf.length && tf[i].t <= tEnd + 1; i += STEP) {
      const t = tf[i].t, d = [...df].reverse().find(f => f.t <= t + 8) || df[0];
      rows.push({ t, a: tf[i], b: d });
    }
    const title = `${label || 'online'} · ${outcome === 'dodge' ? `defender jumps ${REACT} ticks (${Math.round(REACT * 1000 / 60)} ms) after first sight` : 'defender stands still'} · result: ${di.hit ? 'HIT' : 'dodged'}${ti.wind ? ` · wind-up ${ti.wind} ticks` : ''}${ti.grace ? ` · grace ${ti.grace.join('/')}` : ''}`;
    const png = await T.evaluate(async ({ rows, title }) => {
      const load = (u) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = u; });
      const w = 480, h = 115, lab = 64, gap = 8, head = 44;
      const c = document.createElement('canvas');
      c.width = lab + 2 * w + gap; c.height = head + rows.length * (h + 4);
      const g = c.getContext('2d');
      g.fillStyle = '#0d0a16'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#f2eaff'; g.font = '600 13px sans-serif'; g.textBaseline = 'middle';
      g.fillText(title, 8, 13);
      g.fillStyle = '#c9bce6'; g.font = '600 12px sans-serif';
      g.fillText("THROWER'S SCREEN", lab, 33); g.fillText("DEFENDER'S SCREEN", lab + w + gap, 33);
      for (const [k, r] of rows.entries()) {
        const y = head + k * (h + 4);
        g.fillStyle = '#f2eaff'; g.font = '600 12px monospace';
        g.fillText(`${r.t >= 0 ? '+' : ''}${Math.round(r.t)}`, 4, y + 14); g.fillText('ms', 4, y + 28);
        for (const [j, f] of [r.a, r.b].entries()) {
          const x = lab + j * (w + gap);
          g.drawImage(await load(f.url), x, y, w, h);
          g.fillStyle = 'rgba(10,6,20,0.7)'; g.fillRect(x, y, 92, 18);
          g.fillStyle = f.tag === 'stop' ? '#ff9a6a' : f.tag.startsWith('wind') ? '#ffe38a' : f.tag === 'HIT' ? '#ff6a8a' : '#e6ddff';
          g.font = '600 12px monospace'; g.fillText(f.tag + (f.jump ? ' ^' : ''), x + 4, y + 9);
        }
      }
      return c.toDataURL('image/png');
    }, { rows, title });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from(png.split(',')[1], 'base64'));
    console.log(JSON.stringify({ out: outFile, rows: rows.length, hit: di.hit, wind: ti.wind, grace: ti.grace,
      thrower: tf.map(f => `${Math.round(f.t)}:${f.tag}`).join(' '), defender: df.map(f => `${Math.round(f.t)}:${f.tag}`).join(' '), errors: T.errs.concat(Dp.errs) }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error('FAILED', e); process.exit(1); });
