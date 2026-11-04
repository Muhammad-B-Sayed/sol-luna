// Scripted two-player playthroughs for levels whose solution needs real
// cooperation (crates, held plates). Each script is a list of phases; each phase
// holds inputs for both players until a condition is met (or times out).
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON, PH_DEAD } from '../shared/sim.js';

const L_ = 1, R_ = 2, U_ = 4;
const TS = 24;
const cx = (e) => (e.x + e.w / 2) / TS;      // centre in tiles
const bot = (e) => (e.y + e.h) / TS;

// steer: hold left/right towards a target tile x (stops within tol)
const toward = (e, x, tol = 0.15) => (cx(e) < x - tol ? R_ : cx(e) > x + tol ? L_ : 0);

export function run(levelNo, phases, { verbose = false } = {}) {
  const L = buildLevel(LEVELS[levelNo - 1], levelNo - 1);
  const S = createState(L);
  for (const [name, ctl, done, max = 900] of phases) {
    let t = 0;
    for (; t < max; t++) {
      const [a, b] = ctl(S);
      step(L, S, [a, b]);
      if (S.phase === PH_DEAD) return { ok: false, msg: `${name}: ${S.deadWho ? 'Luna' : 'Sol'} died at tick ${S.tick}`, S };
      if (done(S)) break;
    }
    if (verbose) console.log(`  ${name.padEnd(28)} t=${t}  sol(${cx(S.p[0]).toFixed(2)},${bot(S.p[0]).toFixed(2)}) luna(${cx(S.p[1]).toFixed(2)},${bot(S.p[1]).toFixed(2)}) boxes ${S.b.map(b => cx(b).toFixed(2)).join(',')}`);
    if (t >= max) return { ok: false, msg: `${name}: timed out`, S };
    if (S.phase === PH_WON) break;
  }
  for (let i = 0; i < 120 && S.phase !== PH_WON; i++) step(L, S, [0, 0]);
  const gems = S.gm.reduce((a, b) => a + b, 0);
  return { ok: S.phase === PH_WON, msg: S.phase === PH_WON ? `won in ${(S.tick / 60).toFixed(1)}s, gems ${gems}/${L.gems.length}` : 'did not finish', S };
}

export { L_, R_, U_, toward, cx, bot };

const SCRIPTS = {
  13: [
    ['sol pushes crate into pool', (S) => [R_, 0], (S) => cx(S.b[0]) >= 14.6],
    ['sol hops over crate', (S) => [R_ | U_, 0], (S) => cx(S.p[0]) > cx(S.b[0]) + 1.2 && S.p[0].gr],
    ['sol wades out', (S) => [toward(S.p[0], 21), 0], (S) => Math.abs(cx(S.p[0]) - 21) < 0.2],
    ['luna to pool edge', (S) => [0, toward(S.p[1], 9.3)], (S) => Math.abs(cx(S.p[1]) - 9.3) < 0.2],
    ['luna jumps to crate', (S) => [0, R_ | (S.p[1].gr && cx(S.p[1]) < 10 ? U_ : 0)], (S) => S.p[1].gr && S.p[1].gref === 100],
    ['luna centres on crate', (S) => [0, toward(S.p[1], cx(S.b[0]) - 0.2)], (S) => Math.abs(cx(S.p[1]) - cx(S.b[0]) + 0.2) < 0.2, 120],
    ['luna jumps to far floor', (S) => [0, R_ | (S.p[1].gref === 100 ? U_ : 0)], (S) => S.p[1].gr && cx(S.p[1]) > 20],
    ['luna to crate 2', (S) => [toward(S.p[0], 20.5), toward(S.p[1], 21)], (S) => Math.abs(cx(S.p[1]) - 21) < 0.2],
    ['luna pushes crate 2', (S) => [toward(S.p[0], 20.5), R_], (S) => cx(S.b[1]) >= 28.3],
    ['luna hops over crate 2', (S) => [0, R_ | U_], (S) => cx(S.p[1]) > cx(S.b[1]) + 1.2 && S.p[1].gr],
    ['luna to door', (S) => [0, R_ | (cx(S.p[1]) > 33 && cx(S.p[1]) < 34.5 ? U_ : 0)], (S) => cx(S.p[1]) > 37.3 || (S.p[1].gr && bot(S.p[1]) < 25.1 && cx(S.p[1]) > 37)],
    ['luna settles at door', (S) => [0, toward(S.p[1], 37.5, 0.1)], (S) => S.p[1].atDoor, 120],
    ['sol to M pool edge', (S) => [toward(S.p[0], 23.3), 0], (S) => Math.abs(cx(S.p[0]) - 23.3) < 0.2],
    ['sol jumps to crate 2', (S) => [R_ | (S.p[0].gr && cx(S.p[0]) < 24 ? U_ : 0), 0], (S) => S.p[0].gr && S.p[0].gref === 101],
    ['sol centres', (S) => [toward(S.p[0], cx(S.b[1]) - 0.2), 0], (S) => Math.abs(cx(S.p[0]) - cx(S.b[1]) + 0.2) < 0.2, 120],
    ['sol jumps to far floor', (S) => [R_ | (S.p[0].gref === 101 ? U_ : 0), 0], (S) => S.p[0].gr && cx(S.p[0]) > 32.5],
    ['sol climbs to door', (S) => [R_ | (cx(S.p[0]) > 33 && cx(S.p[0]) < 34.5 ? U_ : 0), 0], (S) => S.p[0].gr && bot(S.p[0]) < 25.1],
    ['sol settles at door', (S) => [toward(S.p[0], 35.5, 0.1), 0], (S) => S.phase === PH_WON, 200],
  ],
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] ? process.argv[2].split(',').map(Number) : Object.keys(SCRIPTS).map(Number);
  let fail = 0;
  for (const n of which) {
    const r = run(n, SCRIPTS[n], { verbose: !!process.env.V });
    console.log(`${String(n).padStart(2)} ${LEVELS[n - 1].name}: ${r.ok ? 'OK' : 'FAIL'} — ${r.msg}`);
    if (!r.ok) fail++;
  }
  process.exit(fail ? 1 : 0);
}
