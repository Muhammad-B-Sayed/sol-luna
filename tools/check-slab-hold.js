// Runner 3D spinning slab: one player must never be able to throw the other off.
// With a player standing in the slab's centre band, the other player lands on each outer band
// (both sides, near end, middle and far end), stands there, hops, and walks off. The player in
// the centre must stay on, alive, on a slab that stays on its latch. Control: with nobody in the
// centre, the same landing on an outer band does flip the slab.
//   node tools/check-slab-hold.js            20 seeds, the first 6 slabs of each
import { buildRunner3d, createRunner3dState, stepRunner3d, ensureGenerated, R3_PLAY, TILT, IN_J, IN_L, IN_R } from '../shared/runner3d.js';

let fails = 0, cases = 0, spins = 0;
const fail = (msg) => { fails++; if (fails <= 10) console.log('FAIL ' + msg); };
const put = (p, x, y, z) => { p.x = x; p.y = y; p.z = z; p.vx = 0; p.vy = 0; p.vz = 0; p.gr = false; p.gref = -1; p.alive = true; p.fy = y; };

function setup(L, k) {
  const o = L.objs[k];
  const S = createRunner3dState(L, { sandbox: true });
  S.phase = R3_PLAY; S.phaseT = 0; S.zone = o.z0 - 60;   // the dusk stays well behind for the whole test
  return { o, S };
}
const away = (o) => [o.cx, o.y + 30, o.z0 - 30];           // parked in the air, far from the slab

for (let seed = 1; seed <= 20; seed++) {
  const L = buildRunner3d(seed);
  ensureGenerated(L, 1400);
  const slabs = [];
  for (let k = 0; k < L.objs.length && slabs.length < 6; k++) if (L.objs[k].k === 'tilt') slabs.push(k);
  for (const k of slabs) {
    for (const side of [-1, 1]) for (const along of [0.15, 0.5, 0.85]) for (const act of ['stand', 'hop', 'leave']) {
      cases++;
      const { o, S } = setup(L, k);
      const A = S.p[0], B = S.p[1];
      const az = o.z0 + (o.z1 - o.z0) * 0.5;
      put(A, o.cx, o.y + 0.3, az);                                        // A comes down onto the centre line
      for (let t = 0; t < 50; t++) { put(B, ...away(o)); stepRunner3d(L, S, [0, 0]); }
      if (!(A.alive && A.gr && A.gref === k)) { fail(`seed ${seed} slab ${k}: setup, A is not standing on the centre`); continue; }
      const bx = o.cx + side * o.hx * 0.85, bz = o.z0 + (o.z1 - o.z0) * along;
      put(B, bx, o.y + 0.6, bz);                                          // B drops onto an outer band
      let bad = '', maxA = 0;
      for (let t = 0; t < 260 && !bad; t++) {
        let b = 0;
        if (act === 'hop' && t % 30 === 20) b = IN_J;
        if (act === 'leave' && t >= 60) b = side > 0 ? IN_R : IN_L;       // B walks off the edge
        stepRunner3d(L, S, [0, b]);
        if (act !== 'leave' && !B.alive) put(B, bx, o.y + 0.6, bz);       // B fell: drop in again
        const st = S.o[k];
        if (st) { maxA = Math.max(maxA, Math.abs(st.a)); if (st.s) bad = `the slab spun free at tick ${t}`; }
        if (!A.alive) bad = `A died (${S.why[0]}) at tick ${t}`;
        else if (!(A.gr && A.gref === k)) bad = bad || `A was thrown off at tick ${t}`;
      }
      if (!bad && maxA > TILT.SLIP) bad = `the slab leaned to ${maxA.toFixed(2)} rad under A`;
      if (bad) fail(`seed ${seed} slab ${k} side ${side} along ${along}, B ${act}s: ${bad}`);
    }
    // control: nobody in the centre, a landing on an outer band flips the slab
    const { o, S } = setup(L, k);
    put(S.p[1], o.cx + o.hx * 0.85, o.y + 0.6, o.z0 + (o.z1 - o.z0) * 0.5);
    let spun = false;
    for (let t = 0; t < 80; t++) { put(S.p[0], ...away(o)); stepRunner3d(L, S, [0, 0]); if (S.o[k] && S.o[k].s) spun = true; }
    if (spun) spins++; else fail(`seed ${seed} slab ${k}: control, a landing on the outer band of an empty slab did not flip it`);
  }
}
console.log(`slab hold: ${cases - Math.min(fails, cases)} of ${cases} cases kept the player in the centre on a latched slab; control flips ${spins}`);
console.log(fails ? `${fails} FAILED` : 'PASS');
process.exit(fails ? 1 : 0);
