// Runner 3D with the players far apart: sim tick time and the size of the state sent over the wire.
//   node tools/r3d-far.js [seeds=1,2,3] [gaps=0,100,400]
// For each gap, Sol is put on 40 run-ups along the course (z 40 to 1000) and Luna on the run-up
// `gap` units further on, with the dusk 12 units behind Sol. Both hold forward-and-jump into
// whatever is ahead for 30 ticks (the sim does all its collision and object work), then the next
// spot. Reports the mean and 99th-percentile tick time, and the mean and largest JSON.stringify(S).
import { buildRunner3d, createRunner3dState, stepRunner3d, ensureGenerated, R3_PLAY, IN_F, IN_J } from '../shared/runner3d.js';

const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
const gaps = (process.argv[3] || '0,100,400').split(',').map(Number);

function runupAt(L, z) {
  for (const o of L.objs) if (o.k === 'floor' && o.skin === 1 && o.z1 > z + 1.5) return o;
  return null;
}
function stand(p, o) {
  Object.assign(p, { x: (o.x0 + o.x1) / 2, z: o.z0 + 0.5, y: o.y, fy: o.y, vx: 0, vy: 0, vz: 0, gr: true, gref: -1, alive: true, jb: 0, jh: 0, coy: 0 });
}

for (const [gap, warm] of [[gaps[gaps.length - 1], true], ...gaps.map(g => [g, false])]) {   // one silent pass first warms up the JIT
  let n = 0, us = 0, all = [], bytes = 0, maxBytes = 0, maxO = 0;
  for (const seed of seeds) {
    const L = buildRunner3d(seed);
    ensureGenerated(L, 1000 + gap + 200);
    for (let k = 0; k < 40; k++) {
      const z = 40 + k * 24;
      const a = runupAt(L, z), b = runupAt(L, z + gap);
      const S = createRunner3dState(L, { sandbox: true });
      S.phase = R3_PLAY;
      stand(S.p[0], a); stand(S.p[1], b);
      S.zone = S.p[0].z - 12;
      for (let t = 0; t < 30; t++) {
        const t0 = process.hrtime.bigint();
        stepRunner3d(L, S, [IN_F | IN_J, IN_F | IN_J]);
        const d = Number(process.hrtime.bigint() - t0) / 1000;
        if (t >= 5) { us += d; n++; all.push(d); }
        if (t % 10 === 9) {
          const sz = JSON.stringify(S).length;
          bytes += sz; maxBytes = Math.max(maxBytes, sz); maxO = Math.max(maxO, Object.keys(S.o).length);
        }
      }
    }
  }
  if (!warm) console.log(`players ${String(gap).padStart(3)} apart: tick mean ${(us / n).toFixed(1)} us, 99th percentile ${all.sort((x, y) => x - y)[Math.floor(all.length * 0.99)].toFixed(0)} us; state mean ${Math.round(bytes / (n / 25 * 3))} bytes, largest ${maxBytes} bytes, at most ${maxO} objects with state`);
}
