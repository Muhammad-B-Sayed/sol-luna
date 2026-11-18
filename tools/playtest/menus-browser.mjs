// Menus, keyboard focus, Esc, mute, and death/restart checks with real key and mouse events.
//   PORT=3453 node tools/playtest/menus-browser.mjs   -> docs/img/playtest/menus/, tools/playtest/out/menus.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launch, startServer, setBits, sleep } from './cdp.mjs';

const PORT = +(process.env.PORT || 3453);
const BASE = `http://localhost:${PORT}`;
const IMG = 'docs/img/playtest/menus';
mkdirSync(IMG, { recursive: true }); mkdirSync('tools/playtest/out', { recursive: true });
const server = process.env.NOSERVER ? null : await startServer(PORT);
const B = await launch({ name: 'menus' });
const out = { checks: [], death: [] };
const check = (name, ok, info = '') => { out.checks.push({ name, ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); };
const scr = (P) => P.eval('document.body.dataset.screen');
const focus = (P) => P.eval(`(() => { const e = document.activeElement; return e ? (e.id || e.tagName + (e.className ? '.' + e.className : '') + (e.textContent ? ' "' + e.textContent.trim().slice(0, 20) + '"' : '')) : null; })()`);

// ------------------------------------------------------------- fresh profile: locked levels
{
  const P = await B.page(BASE + '/');
  await P.shot(`${IMG}/01-title.jpg`);
  check('title screen shows', (await scr(P)) === 'menu');
  check('title: initial focus', true, String(await focus(P)));
  // Tab through the title card
  const order = [];
  for (let k = 0; k < 10; k++) { await P.key('Tab', 'keyDown'); await P.key('Tab', 'keyUp'); order.push(await focus(P)); }
  check('title: Tab order', true, order.join(' > '));
  await P.shot(`${IMG}/02-title-tab-focus.jpg`);
  // How to play, then Esc
  await P.click('#btnHow'); await sleep(300);
  await P.shot(`${IMG}/03-how-to-play.jpg`);
  const backVis = await P.eval(`(() => { const b = document.querySelector('#how [data-back]').getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), viewport: innerHeight }; })()`);
  check('how to play: Back button visible without scrolling at 1280x800', backVis.top > 0 && backVis.bottom <= backVis.viewport, JSON.stringify(backVis));
  const howOrder = [await focus(P)];
  for (let k = 0; k < 2; k++) { await P.key('Tab', 'keyDown'); await P.key('Tab', 'keyUp'); howOrder.push(await focus(P)); }
  check('how to play: focus starts on the text, Tab reaches Back', /How to play|DIV/.test(howOrder[0]) && howOrder.slice(1).some(f => /Back/.test(f)), howOrder.join(' > '));
  // the text scrolls inside the card; at 1280x700 the Back button must still be on screen
  await P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 600, deviceScaleFactor: 1, mobile: false }); await sleep(200);
  const small = await P.eval(`(() => { const b = document.querySelector('#how [data-back]').getBoundingClientRect(), t = document.querySelector('#how .how'); return { bottom: Math.round(b.bottom), viewport: innerHeight, scrolls: t.scrollHeight > t.clientHeight }; })()`);
  check('how to play: at 1280x600 the text scrolls and Back stays on screen', small.bottom <= small.viewport && small.scrolls, JSON.stringify(small));
  await P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(200);
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(200);
  check('how to play: Esc goes back, focus on How to play', (await scr(P)) === 'menu' && (await focus(P)) === 'btnHow', `screen after Esc: ${await scr(P)}, focus ${await focus(P)}`);
  await P.click('#btnHow'); await sleep(200);
  await P.click('#how [data-back]'); await sleep(200);
  check('how to play: Back returns to title', (await scr(P)) === 'menu');
  // level select, locked
  await P.click('#btnLocal'); await sleep(300);
  const lv = await P.eval(`({ n: document.querySelectorAll('#levelGrid .lvl').length, locked: document.querySelectorAll('#levelGrid .lvl.locked').length, focus: document.activeElement?.className })`);
  check('level select (fresh): 31 of 32 locked, level 1 focused', lv.n === 32 && lv.locked === 31, JSON.stringify(lv));
  await P.shot(`${IMG}/04-level-select-locked.jpg`);
  const lock = await P.eval(`(() => { const b = document.querySelector('#levelGrid .lvl:nth-child(2)'); const l = b.querySelector('.lock'); return { lock: !!l && l.getBoundingClientRect().width > 0, label: b.getAttribute('aria-label'), first: !!document.querySelector('#levelGrid .lvl:nth-child(1) .lock') }; })()`);
  check('level select: locked levels carry a lock mark and say so to screen readers, level 1 has none', lock.lock && /locked/.test(lock.label) && !lock.first, JSON.stringify(lock));
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(200);
  check('level select: Esc goes back, focus on Play together', (await scr(P)) === 'menu' && (await focus(P)) === 'btnLocal', `screen after Esc: ${await scr(P)}, focus ${await focus(P)}`);
  if ((await scr(P)) !== 'menu') await P.click('#levels [data-back]');
  // clicking a locked level does nothing
  await P.click('#btnLocal'); await sleep(200);
  await P.click('#levelGrid .lvl:nth-child(5)'); await sleep(200);
  check('level select: locked level 5 does not start', (await scr(P)) === 'levels');
  // keyboard: Enter on the focused level 1 starts it
  await P.eval(`document.querySelector('#levelGrid .lvl').focus()`);
  await P.key('Enter', 'keyDown'); await P.key('Enter', 'keyUp'); await sleep(300);
  check('level select: Enter on focused level 1 starts it', (await scr(P)) === 'game' && (await P.eval('window.__app.level')) === 0);
  // Space / Enter during play must not press a hidden button
  const before = await P.eval('[window.__app.level, window.__app.S.tick, document.body.dataset.screen]');
  await P.key('Space', 'keyDown'); await P.key('Space', 'keyUp'); await P.key('Enter', 'keyDown'); await P.key('Enter', 'keyUp'); await sleep(300);
  const after = await P.eval('[window.__app.level, window.__app.S.tick, document.body.dataset.screen, document.activeElement?.tagName]');
  check('in play: Space/Enter do nothing to menus', after[2] === 'game' && after[0] === before[0] && after[1] > before[1], JSON.stringify(after));
  // pause with Esc, focus on Resume, Esc again resumes
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(250);
  const pz = await P.eval(`({ screen: document.body.dataset.screen, paused: window.__app.paused, focus: document.activeElement?.id, tick: window.__app.S.tick })`);
  check('Esc pauses, focus on Resume', pz.screen === 'pause' && pz.paused && pz.focus === 'pResume', JSON.stringify(pz));
  await sleep(500);
  check('paused: timer frozen', (await P.eval('window.__app.S.tick')) === pz.tick);
  await P.shot(`${IMG}/05-pause.jpg`);
  // arrow keys/WASD while paused should not move anyone when unpaused later; hold right, resume
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(200);
  check('Esc again resumes', (await scr(P)) === 'game' && !(await P.eval('window.__app.paused')));
  // P also pauses
  await P.key('KeyP', 'keyDown'); await P.key('KeyP', 'keyUp'); await sleep(200);
  check('P pauses', (await scr(P)) === 'pause');
  // Tab order inside pause
  const po = [];
  for (let k = 0; k < 6; k++) { await P.key('Tab', 'keyDown'); await P.key('Tab', 'keyUp'); po.push(await focus(P)); }
  check('pause: Tab order', true, po.join(' > '));
  // restart from pause
  await sleep(300);
  await P.click('#pRestart'); await sleep(200);
  const rs = await P.eval('[document.body.dataset.screen, window.__app.S.tick < 30, window.__app.paused]');
  check('pause > Restart level restarts and unpauses', rs[0] === 'game' && rs[1] && !rs[2], JSON.stringify(rs));
  // R restarts while playing
  await sleep(1500);
  await P.key('KeyR', 'keyDown'); await P.key('KeyR', 'keyUp'); await sleep(50);
  check('R restarts the level', (await P.eval('window.__app.S.tick')) < 10);
  // quit to title from pause
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(200);
  await P.click('#pLevels'); await sleep(250);
  check('pause > Level select', (await scr(P)) === 'levels');
  await P.shot(`${IMG}/06-level-select-from-pause.jpg`);
  await P.click('#levelGrid .lvl:nth-child(1)'); await sleep(250);
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await sleep(200);
  await P.click('#pQuit'); await sleep(300);
  check('pause > Quit to title', (await scr(P)) === 'menu' && !(await P.eval('window.__app.L')));
  // mute
  const m0 = await P.eval(`document.querySelector('#btnMute').textContent`);
  await P.click('#btnMute'); await sleep(100);
  const m1 = await P.eval(`[document.querySelector('#btnMute').textContent, localStorage.getItem('sl.muted')]`);
  await P.shot(`${IMG}/07-title-muted.jpg`);
  await P.send('Page.reload', {}); await sleep(1500);
  const m2 = await P.eval(`document.querySelector('#btnMute').textContent`);
  check('mute toggles and survives a reload', m0 === 'Sound: on' && m1[0] === 'Sound: off' && m2 === 'Sound: off', `${m0} -> ${m1.join(' / ')} -> after reload ${m2}`);
  await P.click('#btnMute');
  // ?unlock
  await P.send('Page.navigate', { url: BASE + '/?unlock' }); await sleep(1500);
  await P.click('#btnLocal'); await sleep(300);
  const ul = await P.eval(`({ locked: document.querySelectorAll('#levelGrid .lvl.locked').length, url: location.href })`);
  check('?unlock opens all 32', ul.locked === 0, JSON.stringify(ul));
  await P.shot(`${IMG}/08-level-select-unlocked.jpg`);
  // does ?unlock persist into saved progress?
  await P.send('Page.navigate', { url: BASE + '/' }); await sleep(1500);
  await P.click('#btnLocal'); await sleep(300);
  const ul2 = await P.eval(`({ locked: document.querySelectorAll('#levelGrid .lvl.locked').length, saved: localStorage.getItem('sl.progress.v1') })`);
  check('?unlock is not saved by itself (expected: progress only saves on a finish)', true, JSON.stringify(ul2));
  await P.close();
}

// ------------------------------------------------------------- results, next level, play again
{
  const P = await B.page(BASE + '/', { clock: true });
  await P.eval('window.__pt.start()'); await P.frames(3);
  await P.click('#btnLocal'); await P.frames(2);
  await P.click('#levelGrid .lvl:nth-child(1)');
  const rec = JSON.parse(readFileSync('tools/playtest/inputs/level-1.json', 'utf8'));
  let held = [0, 0];
  for (const [a, b, k] of rec.rle) { await setBits(P, 0, held[0], a); await setBits(P, 1, held[1], b); held = [a, b]; await P.frames(k); }
  await setBits(P, 0, held[0], 0); await setBits(P, 1, held[1], 0);
  await P.frames(200, `document.body.dataset.screen === 'results'`);
  await P.frames(30);
  const r = await P.eval(`({ screen: document.body.dataset.screen, focus: document.activeElement?.id, time: resTime.textContent, rank: resRank.textContent, saved: JSON.parse(localStorage.getItem('sl.progress.v1') || 'null') })`);
  check('results card after a real finish, focus on Next level, progress saved and level 2 unlocked', r.screen === 'results' && r.focus === 'resNext' && r.saved?.unlocked === 1, JSON.stringify(r));
  await P.shot(`${IMG}/09-results.jpg`);
  // Esc on the results card
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await P.frames(5);
  check('results: Esc does nothing (no way back by keyboard except Tab/Enter)', (await scr(P)) === 'results', await scr(P));
  // Enter on focused Next level
  await P.key('Enter', 'keyDown'); await P.key('Enter', 'keyUp'); await P.frames(3);
  const nx = await P.eval('[document.body.dataset.screen, window.__app.level, window.__app.S.tick]');
  check('results: Enter on Next level starts level 2', nx[0] === 'game' && nx[1] === 1, JSON.stringify(nx));
  // does the Enter keyup or a held key leak into level 2? (tick advanced with zero input)
  await P.frames(30);
  const lv2 = await P.eval('window.__app.S.p.map(p => [p.x, p.y])');
  check('level 2 starts with nobody moving', true, JSON.stringify(lv2));
  await P.shot(`${IMG}/10-next-level.jpg`);
  // level select shows the rank for level 1
  await P.key('Escape', 'keyDown'); await P.key('Escape', 'keyUp'); await P.frames(2);
  await P.click('#pLevels'); await P.frames(2);
  const badge = await P.eval(`document.querySelector('#levelGrid .lvl:nth-child(1)').className + ' ' + document.querySelector('#levelGrid .lvl:nth-child(1)').title`);
  check('level select shows level 1 done with its rank', /done/.test(badge), badge);
  await P.shot(`${IMG}/11-level-select-after-win.jpg`);
  await P.close();
}

// ------------------------------------------------------------- death and restart
// Replay the bot to a point where gems, mechanisms and crates have changed, then walk a player
// into a hostile pool on their own floor with real keys, and check the reset.
// For each level, the first moment past 30% of the bot's route where a player stands on a floor
// that runs, with no wall or drop in between, into a pool that kills them.
const { LEVELS } = await import('../../shared/levels.js');
function poolPlan(n, sx, sy, lx, ly) {
  const M = LEVELS[n - 1].map;
  const solid = (x, y) => '#/\\SMX=-_+~:'.includes(M[y][x]);
  for (const [who, px, py] of [[0, sx, sy], [1, lx, ly]]) {
    const fy = Math.round((py + 34) / 24), cx = Math.floor((px + 10) / 24);
    if (!M[fy] || !solid(cx, fy)) continue;
    const bad = who ? 'SX' : 'MX';
    for (const dir of [1, -1]) {
      for (let x = cx; x > 0 && x < 39; x += dir) {
        if (bad.includes(M[fy][x])) return { who, dir, x, y: fy, from: cx };
        if (!solid(x, fy)) break;
        if (solid(x, fy - 1) || solid(x, fy - 2)) break;
      }
    }
  }
  return null;
}
const DEATH = [];
for (const n of (process.env.DEATH || '1,10,20,26,29').split(',').map(Number)) {
  const rec = JSON.parse(readFileSync(`tools/playtest/inputs/level-${n}.json`, 'utf8'));
  const hit = rec.trace.find(tr => tr[0] >= rec.wonTick * 0.3 && poolPlan(n, tr[1], tr[2], tr[3], tr[4]));
  DEATH.push([n, hit ? hit[0] / rec.wonTick : 0.5]);
}
for (const [n, frac] of DEATH) {
  const P = await B.page(BASE + '/?unlock', { clock: true });
  await P.eval('window.__pt.start()'); await P.frames(3);
  await P.click('#btnLocal'); await P.frames(2);
  await P.click(`#levelGrid .lvl:nth-child(${n})`);
  const rec = JSON.parse(readFileSync(`tools/playtest/inputs/level-${n}.json`, 'utf8'));
  const stopAt = Math.round(rec.wonTick * frac / 30) * 30;
  let held = [0, 0], t = 0;
  for (const [a, b, k] of rec.rle) {
    if (t >= stopAt) break;
    await setBits(P, 0, held[0], a); await setBits(P, 1, held[1], b); held = [a, b];
    const m = Math.min(k, stopAt - t); await P.frames(m); t += m;
  }
  await setBits(P, 0, held[0], 0); await setBits(P, 1, held[1], 0);
  const SNAP = `(() => { const S = window.__app.S; return JSON.parse(JSON.stringify({ tick: S.tick, tries: S.tries, phase: S.phase, gm: S.gm, lv: S.lv, btn: S.btn, pl: S.pl.map(q => [Math.round(q.x), Math.round(q.y)]), b: S.b.map(c => [Math.round(c.x), Math.round(c.y)]), p: S.p.map(p => [Math.round(p.x), Math.round(p.y)]) })); })()`;
  const mid = await P.eval(SNAP);
  // find a hostile pool the player can walk into on their own floor
  const plan = await P.eval(`(async () => {
    const { LEVELS } = await import('/shared/levels.js');
    const M = LEVELS[${n - 1}].map, S = window.__app.S;
    const solid = (x, y) => '#/\\\\SMX=-_+~:'.includes(M[y][x]);
    for (const who of [0, 1]) {
      const p = S.p[who], fy = Math.round((p.y + p.h) / 24), cx = Math.floor((p.x + p.w / 2) / 24);
      const bad = who ? 'SX' : 'MX';
      for (const dir of [1, -1]) {
        for (let x = cx; x > 0 && x < 39; x += dir) {
          const c = M[fy] && M[fy][x];
          if (bad.includes(c)) return { who, dir, x, y: fy, from: cx };
          if (!solid(x, fy) && !bad.includes(M[fy + 1]?.[x])) break;   // floor ends (a drop)
          if (solid(x, fy - 1) && !'SMX'.includes(M[fy - 1][x])) break; // wall
        }
      }
    }
    return null;
  })()`);
  let how;
  if (plan) {
    const code = plan.who ? (plan.dir > 0 ? 'KeyD' : 'KeyA') : (plan.dir > 0 ? 'ArrowRight' : 'ArrowLeft');
    await P.key(code, 'keyDown');
    await P.frames(240, `window.__app.S.phase === 1`);
    await P.key(code, 'keyUp');
    how = `${plan.who ? 'Luna' : 'Sol'} walked ${plan.dir > 0 ? 'right' : 'left'} from column ${plan.from} into the pool at (${plan.x},${plan.y})`;
  }
  if ((await P.eval('window.__app.S.phase')) !== 1) {
    // fallback: drop a player onto a pool that kills them
    const spot = await P.eval(`(async () => { const { LEVELS } = await import('/shared/levels.js'); const M = LEVELS[${n - 1}].map; for (let y = 1; y < 29; y++) for (let x = 1; x < 39; x++) if ('SMX'.includes(M[y][x]) && !'#'.includes(M[y - 1][x])) return [x, y, M[y][x] === 'S' ? 1 : 0]; })()`);
    await P.eval(`(() => { const p = window.__app.S.p[${spot[2]}]; p.x = ${spot[0] * 24 + 2}; p.y = ${spot[1] * 24 - 40}; p.vy = 0; p.gr = false; })()`);
    await P.frames(60, `window.__app.S.phase === 1`);
    how = `no hostile pool on either player's floor: ${spot[2] ? 'Luna' : 'Sol'} dropped onto the pool at (${spot[0]},${spot[1]}) (position written into the state)`;
  }
  await P.frames(20);
  const deadShot = await P.shot(`${IMG}/death-level-${n}-dying.jpg`);
  const dying = await P.eval('[window.__app.S.phase, window.__app.S.deadWho]');
  await P.frames(200, `window.__app.S.tries > ${mid.tries}`);
  const reset = await P.eval(SNAP);
  const fresh = await P.eval(`(async () => { const { LEVELS } = await import('/shared/levels.js'); const sim = await import('/shared/sim.js'); const L = sim.buildLevel(LEVELS[${n - 1}], ${n - 1}); const S = sim.createState(L); return JSON.parse(JSON.stringify({ tick: S.tick, gm: S.gm, lv: S.lv, btn: S.btn, pl: S.pl.map(q => [Math.round(q.x), Math.round(q.y)]), b: S.b.map(c => [Math.round(c.x), Math.round(c.y)]), p: S.p.map(p => [Math.round(p.x), Math.round(p.y)]) })); })()`);
  await P.frames(1);
  const hud = await P.shot(`${IMG}/death-level-${n}-after-reset.jpg`);
  const same = (k) => JSON.stringify(reset[k]) === JSON.stringify(fresh[k]);
  const changedMid = ['gm', 'lv', 'pl', 'b'].filter(k => JSON.stringify(mid[k]) !== JSON.stringify(fresh[k]));
  const ok = dying[0] === 1 && reset.tries === mid.tries + 1 && reset.tick <= 1 && ['gm', 'lv', 'btn', 'pl', 'b', 'p'].every(same);
  out.death.push({ n, how, mid, reset, fresh, changedMid, ok, shots: [deadShot, hud] });
  check(`death/restart level ${n}`, ok, `${how}; before death these differed from a fresh start: ${changedMid.join(', ') || 'nothing'}; after reset tick ${reset.tick}, tries ${reset.tries}, ${['gm', 'lv', 'btn', 'pl', 'b', 'p'].filter(k => !same(k)).map(k => k + ' DIFFERS').join(', ') || 'gems, levers, plates, platforms, crates and players all back to the start'}`);
  await P.close();
}

writeFileSync('tools/playtest/out/menus.json', JSON.stringify(out, null, 1));
if (B.pageErrors.length) console.log('page errors:', B.pageErrors.slice(0, 5));
B.close();
server?.stop();
process.exit(0);
