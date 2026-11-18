// Walks the low decks (3-4 free rows: walk-only) and the 2-row tunnels with real key events,
// jumping inside them, and reports bonks, stalls, deaths and unintended exits.
//   PORT=3452 node tools/playtest/deck-browser.mjs 8,9,10,11 [tunnels=all]   -> tools/playtest/out/decks.json
//
// Setup shortcut: the tested player is placed at the left end of the run by writing its
// position into window.__app.S (getting there through the level would take the whole route).
// Everything after that is real key events through the game's own loop.
//   pass 1: hold right across the run, tapping jump every 14 frames
//   pass 2: hold left back across, holding jump the whole way (re-jumps on every landing)
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, startServer } from './cdp.mjs';
import { LEVELS } from '../../shared/levels.js';
import { PLAT_CH } from '../../shared/sim.js';

const PORT = +(process.env.PORT || 3452);
const BASE = `http://localhost:${PORT}`;
const IMG = 'docs/img/playtest/decks';
mkdirSync('tools/playtest/out', { recursive: true }); mkdirSync(IMG, { recursive: true });
const deckLevels = (process.argv[2] || '8,9,10,11').split(',').map(Number);
const tunnelLevels = process.argv[3] === 'none' ? [] : Array.from({ length: 32 }, (_, i) => i + 1);
const SOLID = new Set(['#', '/', '\\', 'S', 'M', 'X', ...PLAT_CH]);

function runs(n, kinds) {
  const M = LEVELS[n - 1].map;
  const solid = (x, y) => y < 0 || y > 29 || SOLID.has(M[y][x]);
  const out = [];
  for (let y = 3; y <= 29; y++) {
    let cur = null;
    for (let x = 1; x <= 39; x++) {
      let k = 0;
      const stand = x <= 38 && solid(x, y) && !'/\\'.includes(M[y][x]) && !PLAT_CH.includes(M[y][x]);
      if (stand) while (!solid(x, y - 1 - k)) k++;
      const kind = stand && kinds.includes(k) ? (k === 2 ? 'tunnel' : 'deck') : null;
      if (kind && cur && cur.kind === kind && cur.k === k) { cur.x1 = x; cur.cells.push(M[y][x]); }
      else {
        if (cur && cur.x1 - cur.x0 >= 2) out.push(cur);
        cur = kind ? { n, kind, k, y, x0: x, x1: x, cells: [M[y][x]] } : null;
      }
    }
  }
  return out;
}
const safeFor = (cells, who) => cells.every(c => c !== 'X' && c !== (who ? 'S' : 'M'));

const server = process.env.NOSERVER ? null : await startServer(PORT);
const B = await launch({ name: 'deck' });
const P = await B.page(BASE + '/?unlock', { clock: true });
await P.eval('window.__pt.start()');
await P.frames(3);
let curLevel = 0;
async function startLevel(n) {
  await P.eval(`(() => { if (window.__app.L) document.querySelector('#pQuit').click(); })()`);
  await P.frames(2);
  await P.click('#btnLocal'); await P.frames(2);
  await P.click(`#levelGrid .lvl:nth-child(${n})`);
  curLevel = n;
}
const ST = (i) => `(() => { const S = window.__app.S, p = S.p[${i}]; return { x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy, gr: p.gr, alive: p.alive, phase: S.phase, jumpN: p.jumpN }; })()`;

const results = [];
const todo = [];
for (const n of deckLevels) for (const r of runs(n, [3, 4])) todo.push(r);
for (const n of tunnelLevels) for (const r of runs(n, [2])) todo.push(r);
console.log(`${todo.length} runs to walk`);
for (const r of todo) {
  for (const who of [0, 1]) {
    if (!safeFor(r.cells, who)) continue;
    if (curLevel !== r.n) await startLevel(r.n); else { await P.eval(`document.querySelector('#pRestart').click()`); }
    await P.frames(2);
    // place the player on the left end of the run
    const sunk = 'SMX'.includes(r.cells[0]) ? 10 : 0;
    await P.eval(`(() => { const S = window.__app.S, p = S.p[${who}]; p.x = ${r.x0 * 24 + 2}; p.y = ${r.y * 24 + sunk} - p.h; p.vx = 0; p.vy = 0; p.gr = true; p.gref = -1; window.__app.prev = null; })()`);
    await P.frames(6);
    const s0 = await P.eval(ST(who));
    const rowOf = (s) => Math.round((s.y + s.h) / 24);
    const rec = { level: r.n, kind: r.kind, freeRows: r.k, row: r.y, x0: r.x0, x1: r.x1, who: who ? 'Luna' : 'Sol', bonks: 0, maxRise: 0, deaths: 0, exits: [], stalls: 0, framesRight: 0, framesLeft: 0 };
    if (!s0.gr || rowOf(s0) !== r.y) { rec.note = `could not place: feet row ${rowOf(s0)}`; results.push(rec); continue; }
    const side = (dir, jumpMode) => async () => {
      const keyDir = who ? (dir > 0 ? 'KeyD' : 'KeyA') : (dir > 0 ? 'ArrowRight' : 'ArrowLeft');
      const keyUp = who ? 'KeyW' : 'ArrowUp';
      await P.key(keyDir, 'keyDown');
      if (jumpMode === 'hold') await P.key(keyUp, 'keyDown');
      let prev = await P.eval(ST(who)), floor = prev.y + prev.h, still = 0, f = 0;
      const goal = dir > 0 ? r.x1 * 24 + 4 : r.x0 * 24 + 4;
      for (f = 1; f < (r.x1 - r.x0 + 2) * 24 / 3.25 * 3 + 60; f++) {
        if (jumpMode === 'tap' && f % 14 === 1) await P.key(keyUp, 'keyDown');
        if (jumpMode === 'tap' && f % 14 === 3) await P.key(keyUp, 'keyUp');
        await P.frames(1);
        const s = await P.eval(ST(who));
        if (s.phase !== 0 || !s.alive) { rec.deaths++; break; }
        if (prev.vy < -0.5 && s.vy >= 0 && s.vy < 0.5 && !s.gr) rec.bonks++;
        rec.maxRise = Math.max(rec.maxRise, floor - (s.y + s.h));
        // an exit is standing a full tile or more above the run's floor while still over the run
        // (a step onto a pool rim or onto the next ledge past the run's end does not count)
        const cxT = (s.x + s.w / 2) / 24;
        if (s.gr && (s.y + s.h) < r.y * 24 - 20 && cxT >= r.x0 && cxT <= r.x1 + 1) { rec.exits.push({ dir, at: [+cxT.toFixed(1), rowOf(s) - 1] }); break; }
        if (s.gr && (s.y + s.h) > r.y * 24 + 16) { rec.left = 'dropped off the run'; break; }
        if (Math.abs(s.x - prev.x) < 0.01 && s.gr) still++; else still = 0;
        const reached = dir > 0 ? s.x + s.w >= goal + 14 : s.x <= goal;
        prev = s;
        if (reached || still > 30) { if (still > 30 && !reached) rec.stalls++; break; }
      }
      await P.key(keyDir, 'keyUp');
      if (jumpMode === 'hold' || jumpMode === 'tap') await P.key(keyUp, 'keyUp');
      return f;
    };
    rec.framesRight = await side(1, 'tap')();
    if (!rec.deaths && !rec.exits.length) {
      await P.frames(40);
      const s = await P.eval(ST(who));
      if (s.gr) rec.framesLeft = await side(-1, 'hold')();
    }
    rec.maxRise = +rec.maxRise.toFixed(1);
    rec.walkFrames = Math.round((r.x1 - r.x0 + 1) * 24 / 3.25);
    if (rec.exits.length || rec.deaths || rec.stalls) {
      rec.shot = await P.shot(`${IMG}/level-${String(r.n).padStart(2, '0')}-${r.kind}-r${r.y}-x${r.x0}-${rec.who}.jpg`);
    }
    results.push(rec);
    console.log(`${String(r.n).padStart(2)} ${r.kind} (${r.x0}-${r.x1}, row ${r.y}, ${r.k} free) ${rec.who}: bonks ${rec.bonks}, max rise ${rec.maxRise}px, right ${rec.framesRight}f / walk ${rec.walkFrames}f, left ${rec.framesLeft}f${rec.stalls ? ', STALL' : ''}${rec.deaths ? ', DIED' : ''}${rec.exits.length ? ', EXIT ' + JSON.stringify(rec.exits) : ''}${rec.note ? ', ' + rec.note : ''}`);
  }
}
writeFileSync('tools/playtest/out/decks.json', JSON.stringify(results, null, 1));
if (B.pageErrors.length) console.log('page errors:', B.pageErrors.slice(0, 5));
B.close();
server?.stop();
process.exit(0);
