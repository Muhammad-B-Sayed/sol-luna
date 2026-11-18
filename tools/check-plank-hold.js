// Runner chain plank: one player must never be able to throw the other off.
// With a player standing in the plank's safe middle, the other player lands on each tip, hops on
// an end, and jumps off it. The player in the middle must stay on, alive, on a beam that only
// rocks. Control: with nobody in the middle, the same tip landing does spin the beam.
//   node tools/check-plank-hold.js            20 seeds, the first 6 planks of each
import { buildRunner, createRunnerState, stepRunner, ensureGenerated, oid, oidObj, RPH_PLAY, PLANK } from '../shared/runner.js';
import { TS } from '../shared/sim.js';

let fails = 0, cases = 0, spins = 0;
const fail = (msg) => { fails++; if (fails <= 10) console.log('FAIL ' + msg); };

function setup(L, k) {
  const o = L.objs[k];
  const S = createRunnerState(L, { sandbox: true });
  S.phase = RPH_PLAY; S.phaseT = 0; S.cam = o.px - 900;   // far enough back that the scroll does not reach the plank during the test
  for (const p of S.p) { p.x = o.px - p.w / 2 - 400; p.y = o.y - p.h - 200; p.vx = 0; p.vy = 0; p.gr = false; p.gref = -1; }
  stepRunner(L, S, [0, 0]);   // activate the objects around the camera
  return { o, S };
}
const put = (p, x, y, vy) => { p.x = x - p.w / 2; p.y = y - p.h; p.vx = 0; p.vy = vy; p.gr = false; p.gref = -1; p.alive = true; };

for (let seed = 1; seed <= 20; seed++) {
  const L = buildRunner(seed);
  ensureGenerated(L, 1200 * TS);
  const planks = [];
  for (let k = 0; k < L.objs.length && planks.length < 6; k++) if (L.objs[k].k === 'plank') planks.push(k);
  for (const k of planks) {
    for (const side of [-1, 1]) for (const act of ['land', 'hop', 'stand']) {
      cases++;
      const { o, S } = setup(L, k);
      const A = S.p[0], B = S.p[1];
      put(A, o.px, o.y - 1, 1);                                // A comes down onto the middle
      put(B, o.px - 300, o.y - 300, 0);
      for (let t = 0; t < 40; t++) { put(B, o.px - 300, o.y - 300, 0); stepRunner(L, S, [0, 0]); }
      if (!(A.alive && A.gr && oidObj(A.gref) === k)) { fail(`seed ${seed} plank ${k}: setup, A is not standing on the middle`); continue; }
      const tipX = o.px + side * (o.H - 6);
      put(B, tipX, o.y - 60, 6);                               // B drops onto the tip
      let maxS = 0, bad = '';
      for (let t = 0; t < 260 && !bad; t++) {
        let b = 0;
        if (act === 'hop' && t % 30 === 20) b = 4;             // B keeps hopping on the end
        if (act === 'stand' && t === 60) b = 4 | (side > 0 ? 2 : 1);   // B jumps off outward
        stepRunner(L, S, [0, b]);
        if (act !== 'stand' && !B.alive) put(B, tipX, o.y - 60, 6);     // B fell: drop in again
        const st = S.o[k];
        if (st) maxS = Math.max(maxS, Math.abs(st.s));
        if (!A.alive) bad = `A died (${S.why[0]}) at tick ${t}`;
        else if (!(A.gr && oidObj(A.gref) === k)) bad = `A was thrown off at tick ${t}`;
      }
      if (!bad && maxS > PLANK.stand) bad = `the beam leaned to sine ${maxS.toFixed(2)} under A`;
      if (bad) fail(`seed ${seed} plank ${k} ${side > 0 ? 'far' : 'near'} tip, B ${act}s: ${bad}`);
    }
    // control: nobody in the middle, a tip landing spins the beam
    const { o, S } = setup(L, k);
    put(S.p[0], o.px - 300, o.y - 300, 0);
    put(S.p[1], o.px + (o.H - 6), o.y - 60, 6);
    let maxW = 0;
    for (let t = 0; t < 60; t++) { put(S.p[0], o.px - 300, o.y - 300, 0); stepRunner(L, S, [0, 0]); if (S.o[k]) maxW = Math.max(maxW, Math.abs(S.o[k].w)); }
    if (maxW >= PLANK.kick * 0.8) spins++; else fail(`seed ${seed} plank ${k}: control, a tip landing on an empty plank did not spin it (max turn rate ${maxW.toFixed(3)})`);
  }
}
console.log(`plank hold: ${cases - Math.min(fails, cases)} of ${cases} cases kept the player in the middle on a steady beam; control spins ${spins}`);
console.log(fails ? `${fails} FAILED` : 'PASS');
process.exit(fails ? 1 : 0);
