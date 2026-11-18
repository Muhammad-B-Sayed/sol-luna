// For every level: does the start hint (shown for the first 6 s, bottom centre) cover a player,
// a door, a gem, a plate or a lever at the start? Measured at 1280x800 and 1920x1080.
//   PORT=3455 node tools/playtest/hint-overlap.mjs   -> tools/playtest/out/hint-overlap.json
import { writeFileSync } from 'node:fs';
import { launch, startServer } from './cdp.mjs';

const PORT = +(process.env.PORT || 3455);
const server = await startServer(PORT);
const B = await launch({ name: 'hint' });
const out = {};
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  const P = await B.page(`http://localhost:${PORT}/?unlock`, { clock: true, w, h });
  await P.eval('window.__pt.start()'); await P.frames(3);
  for (let n = 1; n <= 32; n++) {
    await P.eval(`(() => { if (window.__app.L) document.querySelector('#pQuit').click(); })()`); await P.frames(2);
    await P.click('#btnLocal'); await P.frames(2);
    await P.click(`#levelGrid .lvl:nth-child(${n})`); await P.frames(2);
    const r = await P.eval(`(() => {
      const A = window.__app, L = A.L, S = A.S;
      const hint = document.querySelector('#hint').getBoundingClientRect();
      const cv = document.querySelector('#game').getBoundingClientRect();
      const s = cv.width / 960;
      const box = (x, y, w, h) => ({ l: cv.left + x * s, t: cv.top + y * s, r: cv.left + (x + w) * s, b: cv.top + (y + h) * s });
      const hit = (q) => { const ix = Math.min(q.r, hint.right) - Math.max(q.l, hint.left), iy = Math.min(q.b, hint.bottom) - Math.max(q.t, hint.top); return ix > 0 && iy > 0 ? Math.round(100 * ix * iy / ((q.r - q.l) * (q.b - q.t))) : 0; };
      const res = { hint: L.hint, players: S.p.map((p, i) => [i ? 'Luna' : 'Sol', hit(box(p.x, p.y, p.w, p.h))]).filter(v => v[1] > 0) };
      res.doors = L.doors.map((d, i) => [i ? 'Luna door' : 'Sol door', hit(box(d.cx - 16, d.bottom - 48, 32, 48))]).filter(v => v[1] > 0);
      res.gems = L.gems.filter(g => hit(box(g.x - 8, g.y - 8, 16, 16)) > 0).length;
      res.plates = L.buttons.filter(b => hit(box(b.x, b.floor - 6, 32, 6)) > 0).length;
      res.levers = L.levers.filter(v => hit(box(v.x, v.y, 24, 24)) > 0).length;
      res.crates = S.b.filter(c => hit(box(c.x, c.y, c.w || 26, c.h || 26)) > 0).length;
      res.hintBox = [Math.round(hint.left), Math.round(hint.top), Math.round(hint.width), Math.round(hint.height)];
      return res;
    })()`);
    (out[`${w}x${h}`] ||= {})[n] = r;
    if (w === 1280) console.log(`${String(n).padStart(2)} players ${JSON.stringify(r.players)} doors ${JSON.stringify(r.doors)} gems ${r.gems} plates ${r.plates} levers ${r.levers} crates ${r.crates}`);
  }
  await P.close();
}
const big = out['1920x1080'];
console.log('1920x1080 levels with a player under the hint:', Object.entries(big).filter(([, r]) => r.players.length).map(([n, r]) => n + ' ' + r.players.map(p => p.join(' ')).join('/')).join(', '));
writeFileSync('tools/playtest/out/hint-overlap.json', JSON.stringify(out, null, 1));
B.close(); server.stop(); process.exit(0);
