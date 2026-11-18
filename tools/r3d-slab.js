// The spinning slab (kind 'tilt') measured with the real sim, and its client prediction.
//
//   node tools/r3d-slab.js            touches, a centre crossing, prediction at 6 and 12 ticks of lag
//
// 1. Touches: a player drops onto the slab at u = (x - cx) / hx and stays until it throws them.
//    Prints the turns, the ticks each full turn took, and the ticks from the touch until the slab
//    is level and still (exact rest).
// 2. Centre crossing: a player runs over the slab at full speed along x = cx + offset.
// 3. Prediction: a server steps the real sim with the client's inputs D ticks late and sends
//    snapshots back D ticks late to the real client sync (public/js/runner-sync.js). The local
//    player lands on the centre, stands, edges out to the rim of the centre band, waits while the
//    slab leans, then steps onto the outer band (it flips and they fall). Prints the largest
//    correction of the local player in each phase while alive.
import * as R from '../shared/runner3d.js';
import * as Sync from '../public/js/runner-sync.js';

const TAU = 2 * Math.PI;
const slabOf = (L, sec) => { let i = sec.o0; while (L.objs[i].k !== 'tilt') i++; return i; };

// 1. touches
{
  const L = R.buildRunner3d(7); R.ensureGenerated(L, 400);
  const i = slabOf(L, L.secs.find(c => c.kind === 'tilt')), o = L.objs[i];
  console.log(`touches (seed 7, intro slab, hx ${o.hx}; centre band |u| < ${R.TILT.UC}, full kick from ${R.TILT.UE})`);
  for (const u of [0, 0.2, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.85, 1]) {
    const S = R.createRunner3dState(L, { sandbox: true }); S.phase = R.R3_PLAY;
    S.p[1].alive = false; S.p[1].z = -1e5;
    const p = S.p[0];
    Object.assign(p, { x: o.cx + u * o.hx, z: o.cz, y: o.y + 0.3, vx: 0, vy: -0.1, vz: 0, gr: false, gref: -1, fy: o.y });
    let acc = 0, last = -1, t0 = -1, rest = -1, held = 0, on = 0;
    const turns = [];
    for (let t = 0; t < 400; t++) {
      R.stepRunner3d(L, S, [0, 0]); S.zone = -1e4;
      const st = S.o[i];
      if (t0 < 0 && p.gref === i) t0 = t;
      if (p.gref === i) on++;
      if (t0 < 0) continue;
      acc += st.w;
      if (!st.s) held = Math.max(held, Math.abs(st.a));
      if (Math.abs(acc) >= TAU * (turns.length + 1)) { turns.push(t - (last < 0 ? t0 : last)); last = t; }
      if (p.gref !== i && R.atRest(L, S, i)) { rest = t - t0; break; }
    }
    console.log(`  u ${u.toFixed(2)}: ${(Math.abs(acc) / TAU).toFixed(2)} turns, turn ticks [${turns}], ` +
      (rest < 0 ? 'still in use (they stand on it)' : `at rest ${rest} ticks after the touch`) + `, stood on it ${on} ticks, largest tilt while held ${held.toFixed(3)} rad`);
  }
}

// 2. centre crossing
{
  console.log('centre crossing at full speed (largest tilt while crossing)');
  for (const seed of [7, 2, 4]) {
    const L = R.buildRunner3d(seed); R.ensureGenerated(L, 1700);
    for (const sec of L.secs.filter(c => c.kind === 'tilt').slice(0, 2)) {
      const i = slabOf(L, sec), o = L.objs[i], lip = L.objs[i - 1];
      const out = [];
      for (const off of [0, 0.3, 0.6]) {
        const S = R.createRunner3dState(L, { sandbox: true }); S.phase = R.R3_PLAY; S.p[1].alive = false; S.p[1].z = -1e5;
        const p = S.p[0];
        Object.assign(p, { x: o.cx + off, z: lip.z0 + 0.1, y: lip.y, vz: R.P3.maxSpeed, gr: true, gref: i - 1, fy: lip.y });
        let maxA = 0, turn = 0, on = 0;
        for (let t = 0; t < 160; t++) {
          let b = R.IN_F;
          if (!p.gr && p.z > o.z0 + 0.6 && p.z < o.z1 - 1.5) b = 0;   // ease off in the air so a short slab is not overshot
          if (p.gr && p.gref === i - 1 && p.z > lip.z1 - 0.5) b |= R.IN_J;
          R.stepRunner3d(L, S, [b, 0]); S.zone = -1e4;
          if (p.gref === i) on++;
          const st = S.o[i]; if (st) { maxA = Math.max(maxA, Math.abs(st.a)); turn += st.w; }
        }
        out.push(`offset ${off}: ${on ? `${maxA.toFixed(3)} rad, ${(Math.abs(turn) / TAU).toFixed(2)} turns` : 'missed the slab'}`);
      }
      console.log(`  seed ${seed} z ${o.z0.toFixed(0)} hx ${o.hx}: ${out.join('; ')}`);
    }
  }
}

// 3. prediction
console.log('client prediction of the slab the local player stands on (largest correction while alive, units)');
for (const D of [6, 12]) for (const seed of [7, 2, 4]) for (const me of [0, 1]) {
  const L = R.buildRunner3d(seed); R.ensureGenerated(L, 600);
  const sec = L.secs.find(c => c.kind === 'tilt' && !c.intro);
  const i = slabOf(L, sec), o = L.objs[i], lip = L.objs[i - 1];
  const S = R.createRunner3dState(L, { sandbox: true }); S.phase = R.R3_PLAY; S.phaseT = 0; S.zone = lip.z0 - 20;
  const p = S.p[me], q = S.p[1 - me];
  Object.assign(p, { x: o.cx, z: lip.z0 + 0.1, y: lip.y, fy: lip.y, gref: i - 1, vz: R.P3.maxSpeed });
  Object.assign(q, { x: o.cx + 2, z: lip.z0 - 6, y: L.objs[i - 2].y, fy: L.objs[i - 2].y, gref: -1, gr: false });
  R.stepRunner3d(L, S, [0, 0]);
  const toServer = [], toClient = [];
  let frame = 0;
  const sync = Sync.createSync(Sync.SIM3D, { L: R.buildRunner3d(seed), st: JSON.parse(JSON.stringify(S)), me, send: (m) => toServer.push([frame + D, m]), now: 0 });
  let phase = 0, hold = 0;
  const bitsFor = () => {
    const pp = sync.P.p[me], u = (pp.x - o.cx) / o.hx;
    if (phase === 0) {
      if (pp.gr && pp.gref === i) { phase = 1; hold = 0; }
      if (!pp.gr && pp.z > o.z0 + 0.6) return R.IN_B;
      return pp.gr && pp.gref === i - 1 && pp.z > lip.z1 - 0.6 ? R.IN_F | R.IN_J : R.IN_F;
    }
    if (phase === 1) { if (++hold > 30) phase = 2; return pp.vz > 0.01 ? R.IN_B : 0; }
    if (phase === 2) { if (u > 0.42) { phase = 3; hold = 0; } return R.IN_R; }
    if (phase === 3) { if (++hold > 50) phase = 4; return pp.vx > 0.01 ? R.IN_L : 0; }
    return R.IN_R;
  };
  const srv = { q: [], ack: 0, cur: 0 }, corr = { ride: 0, lean: 0, flip: 0 };
  let n0 = 0, maxA = 0, spun = 0;
  for (frame = 0; frame < 420; frame++) {
    for (let k = toServer.length - 1; k >= 0; k--) if (toServer[k][0] <= frame) { srv.q.push(toServer[k][1]); toServer.splice(k, 1); }
    srv.q.sort((a, b) => a.s - b.s);
    if (frame >= 2 * D + 2) {   // the server starts once inputs have a cushion
      const m = srv.q.shift(); if (m) { srv.cur = m.b; srv.ack = m.s; }
      const inp = [0, 0]; inp[me] = srv.cur;
      R.stepRunner3d(L, S, inp);
      const st = S.o[i]; if (st) { if (st.s) spun = 1; else maxA = Math.max(maxA, Math.abs(st.a)); }
      const ack = [0, 0]; ack[me] = srv.ack;
      toClient.push([frame + D, { t: 's', ack, inp: inp.slice(), d: [0, 0], st: JSON.parse(JSON.stringify(S)) }]);
    }
    while (toClient.length && toClient[0][0] <= frame) sync.onSnapshot(toClient.shift()[1], frame * 1000 / 60);
    sync.frame(1000 / 60, bitsFor, frame * 1000 / 60);
    for (const c = sync.stats.corr; n0 < c.length; n0++) {
      const key = phase < 3 ? 'ride' : phase === 3 ? 'lean' : 'flip';
      if (sync.P.p[me].alive) corr[key] = Math.max(corr[key], c[n0][0]);
    }
  }
  console.log(`  lag ${D} ticks each way, seed ${seed}, ${me ? 'Luna' : 'Sol '}: riding ${corr.ride.toFixed(4)}, leaning ${corr.lean.toFixed(4)}, flipping ${corr.flip.toFixed(4)}` +
    `  (reached step ${phase} of 4; slab leaned to ${maxA.toFixed(2)} rad${spun ? ' and spun' : ''})`);
}
