// Screenshots of the 2D Runner's chain plank and distance milestones, staged in a real browser
// (headless Chromium, clock control: every frame is exactly one tick). Look at each one.
//
//   CHROME=/usr/bin/chromium PORT=3550 node tools/playtest/runner-plank-shots.mjs
//   BEFORE=http://localhost:3551 AFTER=http://localhost:3552 ...   milestones on two other servers:
//     the old code, and the old code with only the milestone fix (the same course, so the two
//     sets show the same ground). Without them the milestones are shot on this build.
//
// Plank: at rest, a player in the safe middle zone, tipping (a player past the safe zone),
// mid-spin after a touch on the tip (with the after-images), settling, and a crossing.
// Milestones: on seed 1's old course, 150 m (a page edge cut the old sign in half), 200 m (over
// a pit: the old sign sat at the bottom of the screen) and 600 m (in a shard gallery: the old
// sign sat above the ceiling), at 1280x800 and 1920x1080.
import { launch, startServer, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3550);
const OUT = process.env.OUT || 'docs/img/runner';
const BEFORE = process.env.BEFORE || '', AFTER = process.env.AFTER || '';
process.env.PROFILE_PREFIX ||= '/tmp/sl-plank2d-shots-';
const srv = process.env.NOSERVER ? null : await startServer(PORT);
const B = await launch({ name: 'plank-shots' });
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); };

// Start a local match on `seed`, fast-forward headlessly until the view's left edge is at `camX`
// (px), and hand the page a sandboxed state in play (nobody dies, nothing ends).
const stage = (seed, camX) => `(async () => {
  const R = await import('/shared/runner.js');
  const run = window.__runner;
  run.startLocal(${seed});
  const L = run.L, S = run.S;
  R.ensureGenerated(L, ${camX} + 3000);
  S.sb = 1; S.p.forEach(p => { p.alive = false; p.x = -1e5; });
  while (S.phase === 0) R.stepRunner(L, S, [0, 0]);
  while (S.cam < ${camX}) R.stepRunner(L, S, [0, 0]);
  // both players standing on the first plain stone floor (no pools) a few tiles into the view
  const top = (x) => { if (!L.cols[x][29]) return -1; let y = 29; while (y > 0 && L.cols[x][y - 1]) y--; return y; };
  const plain = (x) => top(x) >= 0 && L.cols[x][top(x)] === 1 && top(x + 1) === top(x) && L.cols[x + 1][top(x)] === 1;
  let x = Math.floor(S.cam / 24) + 4;
  while (!plain(x)) x++;
  const y = top(x);
  S.p.forEach((p, i) => { Object.assign(p, { alive: true, x: x * 24 + 2 + i * 22, y: y * 24 - p.h, vx: 0, vy: 0, gr: true, gref: -1 }); S.dead[i] = -1; S.best[i] = p.x; });
  run.prev = run.capture(S); run.heard = null;
  window.__R = R; window.__hold = S.cam;
  return { cam: S.cam };
})()`;
const put = (who, x, y, extra = '{}') => `(() => { const S = window.__runner.S, p = S.p[${who}];
  Object.assign(p, { alive: true, x: ${x}, y: ${y}, vx: 0, vy: 0, gr: false, gref: -1, coy: 0 }, ${extra}); S.dead[${who}] = -1; S.best[${who}] = p.x;
  window.__runner.prev = window.__runner.capture(S); })()`;

async function plankShots() {
  const P = await B.page(`http://localhost:${PORT}/`, { clock: true, ready: '!!window.__runner' });
  await P.eval('window.__pt.start()');
  // the first plank past 900 tiles on seed 5 (as in tools/runner-browser.js)
  const info = await P.eval(`(async () => {
    const R = await import('/shared/runner.js');
    const L = R.buildRunner(5); R.ensureGenerated(L, 1400 * 24);
    const c = L.chunks.find(c => c.x0 >= 900 && c.kind === 'plank');
    const o = L.objs[c.o0];
    return { x0: c.x0, h0: c.h0, i: c.o0, px: o.px, py: o.py, y: o.y, H: o.H, safe: o.safe, n: c.o1 - c.o0 };
  })()`);
  console.log('plank', JSON.stringify(info));
  const st = (expr) => P.eval(`(() => { const S = window.__runner.S, st = S.o[${info.i}]; return ${expr}; })()`);
  const shoot = async (name) => { await P.shot(`${OUT}/${name}.png`); console.log('  screenshot', `${OUT}/${name}.png`); };
  const cam = info.px - 640;
  // run k frames with the view held still (staging only: nobody is caught by the dusk)
  const hold = '(window.__runner.S.cam = window.__hold, false)';
  const run = (k, cond = 'false') => P.frames(k, `${hold} || (${cond})`);
  // at rest, players waiting on the run-up
  await P.eval(stage(5, cam));
  await P.eval(put(0, info.x0 * 24 + 30, info.h0 * 24 - 34, '{ gr: true }'));
  await P.eval(put(1, info.x0 * 24 + 70, info.h0 * 24 - 34, '{ gr: true }'));
  await run(3);
  await shoot('runner-plank-rest');
  check('plank at rest is exactly level', await st('st.s === 0 && st.w === 0'));
  // Sol lands in the safe middle zone: it rocks a little and holds him
  await P.eval(stage(5, cam));
  await P.eval(put(0, info.px - 10 + 14, info.y - 34 - 60));
  await run(30);
  await shoot('runner-plank-middle');
  check('a player in the middle zone stays on', await P.eval(`(() => { const p = window.__runner.S.p[0]; return p.gr && window.__R.oidObj(p.gref) === ${info.i}; })()`));
  // Luna lands past the safe zone: it tips and drops her
  await P.eval(stage(5, cam));
  await P.eval(put(1, info.px - 10 - (info.safe + 14), info.y - 34 - 30));
  const tilt = await run(80, `(() => { const p = window.__runner.S.p[1]; return p.gr && window.__R.oidObj(p.gref) === ${info.i}; })()`);
  await run(3);
  await shoot('runner-plank-tipping');
  check('tipping: the plank leans toward her', await st('st.s < -0.1'), JSON.stringify(await st('st')) + ' after ' + tilt);
  // Sol lands on the far tip: three turns
  await P.eval(stage(5, cam));
  await P.eval(put(0, info.px + info.H - 14, info.y - 34 - 30));
  await run(80, `Math.abs(window.__runner.S.o[${info.i}].w) > 0.3`);
  await run(8);
  await shoot('runner-plank-spin');
  check('mid-spin after a tip touch', await st('Math.abs(st.w) > 0.25'), JSON.stringify(await st('st')));
  await run(70);
  await shoot('runner-plank-slowing');
  let n = await run(200, `(() => { const st = window.__runner.S.o[${info.i}]; return st.s === 0 && st.w === 0; })()`);
  check('back to exactly level after the spin', await st('st.s === 0 && st.w === 0'), `${78 + n} ticks after the spin was seen`);
  // a crossing: Luna parked in the middle, Sol jumping across her to the far ledge
  await P.eval(stage(5, cam));
  await P.eval(put(1, info.px - 10 - 6, info.y - 34 - 2));
  await P.eval(put(0, info.px - 10 - 70, info.y - 34 - 70, '{ vx: 3.25, vy: -1 }'));
  await run(14);
  await shoot('runner-plank-crossing');
  await P.close();
}

async function milestoneShots(base, tag) {
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    const P = await B.page(`${base}/`, { clock: true, ready: '!!window.__runner', w, h });
    await P.eval('window.__pt.start()');
    for (const m of [150, 200, 600]) {
      // the milestone column (m + 10) a third of the way across the view
      await P.eval(stage(1, (m + 10) * 24 - 420));
      await P.frames(2);
      const file = `${OUT}/runner-milestone-${m}-${tag}-${w}.png`;
      await P.shot(file);
      console.log('  screenshot', file);
    }
    await P.close();
  }
}

try {
  await plankShots();
  if (BEFORE) await milestoneShots(BEFORE, 'before');
  await milestoneShots(AFTER || `http://localhost:${PORT}`, AFTER ? 'after' : 'build');
} catch (e) { console.error(e); fails++; }
check('no page errors', !B.pageErrors.length, B.pageErrors.slice(0, 3).join(' | '));
B.close();
srv?.stop();
console.log(fails ? `\n${fails} problem(s)` : '\nall done');
process.exit(fails ? 1 : 0);
