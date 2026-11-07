// Scripted two-player playthroughs for levels whose solution needs real
// cooperation (crates, held plates). Each script is a list of phases; each phase
// holds inputs for both players until a condition is met (or times out).
import { LEVELS } from '../shared/levels.js';
import { buildLevel, createState, step, PH_WON, PH_DEAD } from '../shared/sim.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const L_ = 1, R_ = 2, U_ = 4;
const TS = 24;
const cx = (e) => (e.x + e.w / 2) / TS;      // centre in tiles
const bot = (e) => (e.y + e.h) / TS;

// steer: hold left/right towards a target tile x (stops within tol)
const toward = (e, x, tol = 0.15) => (cx(e) < x - tol ? R_ : cx(e) > x + tol ? L_ : 0);

export function run(levelNo, phases, { verbose = false, onPhase = null } = {}) {
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
    if (onPhase) onPhase(name, S);
    if (verbose) console.log(`  ${name.padEnd(28)} t=${t}  sol(${cx(S.p[0]).toFixed(2)},${bot(S.p[0]).toFixed(2)}) luna(${cx(S.p[1]).toFixed(2)},${bot(S.p[1]).toFixed(2)}) boxes ${S.b.map(b => cx(b).toFixed(2)).join(',')}`);
    if (t >= max) return { ok: false, msg: `${name}: timed out  lv=${JSON.stringify(S.lv)} act=${JSON.stringify(S.act)} btn=${JSON.stringify(S.btn)} pl=${JSON.stringify(S.pl.map(q => +q.t.toFixed(2)))}`, S };
    if (S.phase === PH_WON) break;
  }
  for (let i = 0; i < 120 && S.phase !== PH_WON; i++) step(L, S, [0, 0]);
  const gems = S.gm.reduce((a, b) => a + b, 0);
  return { ok: S.phase === PH_WON, msg: S.phase === PH_WON ? `won in ${(S.tick / 60).toFixed(1)}s, gems ${gems}/${L.gems.length}` : 'did not finish', S };
}

export { L_, R_, U_, toward, cx, bot, SCRIPTS };

// ---- phase builders --------------------------------------------------------
const settled = (p) => p.gr && Math.abs(p.vx) < 0.6;
const ctl = (who, bits) => (who === 0 ? [bits, 0] : [0, bits]);
// walk to x
const mv = (who, x, tol = 0.2, max = 900) => [`${who ? 'luna' : 'sol'} -> ${x}`, (S) => ctl(who, toward(S.p[who], x, tol)), (S) => Math.abs(cx(S.p[who]) - x) <= tol + 0.05 && settled(S.p[who]), max];
// push crate b until its centre reaches x
const push = (who, b, x) => [`${who ? 'luna' : 'sol'} pushes crate ${b} -> ${x}`, (S) => ctl(who, cx(S.b[b]) < x ? R_ : L_), (S) => Math.abs(cx(S.b[b]) - x) < 0.25, 900];
// run in direction with jump held until predicate
const hop = (who, dir, until, max = 300) => [`${who ? 'luna' : 'sol'} hops ${dir === R_ ? 'right' : 'left'}`, (S) => ctl(who, dir | (S.p[who].gr ? U_ : 0)), until, max];
const jumpWhen = (who, dir, at, until, max = 300) => [`${who ? 'luna' : 'sol'} jump ${dir === R_ ? 'right' : 'left'} at ${at}`, (S) => { const x = cx(S.p[who]); const past = dir === R_ ? x >= at : x <= at; return ctl(who, dir | (past && S.p[who].gr ? U_ : 0)); }, until, max];
// hop onto a target spot (steers toward x while jumping when grounded and still far)
const hopTo = (who, x, until, max = 300) => [`${who ? 'luna' : 'sol'} hops to ${x}`, (S) => { const p = S.p[who]; return ctl(who, toward(p, x, 0.1) | (p.gr && Math.abs(cx(p) - x) > 0.6 ? U_ : 0)); }, until, max];
const wait = (name, cond, max = 600) => [name, () => [0, 0], cond, max];
// walk to `from`, run on and jump once past `at`, then steer in the air and land on `to`
const leap = (who, from, at, to) => {
  let jumped = false;
  const dir = to > from ? R_ : L_;
  const walk = mv(who, from, 0.1);
  return [
    [walk[0], walk[1], (S) => { jumped = false; return walk[2](S); }, walk[3]],
    [`${who ? 'luna' : 'sol'} leaps to ${to}`, (S) => {
      const p = S.p[who];
      if (jumped) return ctl(who, toward(p, to, 0.1));
      const past = dir === R_ ? cx(p) >= at : cx(p) <= at;
      if (past && p.gr) { jumped = true; return ctl(who, dir | U_); }
      return ctl(who, dir);
    }, (S) => jumped && S.p[who].gr && Math.abs(cx(S.p[who]) - to) < 0.55 && Math.abs(S.p[who].vx) < 1, 300],
  ];
};
const both = (name, fa, fb, cond, max = 900) => [name, (S) => [fa(S), fb(S)], cond, max];

const SCRIPTS = {
  // Crate Lift: Luna sends Sol and the crate up, the crate holds the exit gate, Sol sends Luna up.
  17: [
    push(0, 0, 18.6), mv(0, 17.6, 0.15),
    mv(1, 2.5, 0.12), wait('lift E up', (S) => S.pl[1].t === 1, 300),
    push(0, 0, 23.0), wait('exit gate open', (S) => S.pl[0].t === 1, 200),
    jumpWhen(0, R_, 21.5, (S) => cx(S.p[0]) > 25 && S.p[0].gr), mv(0, 26.5, 0.15),
    mv(1, 32.0, 0.1), mv(0, 28.5, 0.12), wait('lift F up', (S) => S.pl[2].t === 1, 300),
    mv(1, 38.4, 0.12),
    ...leap(0, 28.5, 30.6, 34.5), mv(0, 37.4, 0.12),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Crate Ferry: Luna ferries Sol and the crate over; the crate holds the gate; Sol ferries Luna.
  22: [
    push(0, 0, 10.4), mv(0, 9.4, 0.15),
    mv(1, 1.5, 0.15), wait('ferry across', (S) => S.pl[0].t === 1, 400),
    push(0, 0, 30.5), wait('gate open', (S) => S.pl[1].t === 1, 200),
    jumpWhen(0, R_, 29.0, (S) => cx(S.p[0]) > 31.6 && S.p[0].gr), mv(0, 34.5, 0.15),
    mv(1, 4.0, 0.2), wait('ferry back', (S) => S.pl[0].t === 0, 400),
    mv(1, 9.5, 0.15), mv(0, 32.5, 0.15), wait('ferry across with luna', (S) => S.pl[0].t === 1, 400),
    jumpWhen(1, R_, 28.6, (S) => cx(S.p[1]) > 31.4 && S.p[1].gr), mv(1, 38.4, 0.12),
    mv(0, 37.4, 0.12),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Shade Garden: each lever raises the missing stone on the other row.
  23: [
    mv(1, 3.5, 0.15), ...leap(1, 3.45, 4.55, 7.0), ...leap(1, 6.45, 7.55, 11.8),
    ...leap(1, 11.6, 13.55, 18.0),                                       // passes her lever on the run-up
    wait('luna lever', (S) => S.lv[0] > 0, 60),
    ...leap(0, 3.45, 4.55, 8.0), ...leap(0, 7.45, 8.55, 13.8),
    ...leap(0, 13.6, 15.55, 20.0),                                       // passes his lever on the run-up
    wait('sol lever', (S) => S.lv[1] > 0, 60),
    ...leap(0, 19.45, 20.55, 25.0),
    wait('purple stone up', (S) => S.pl[0].t === 1, 120),
    ...leap(0, 24.45, 25.55, 30.0), ...leap(0, 29.45, 30.55, 35.5), mv(0, 37.5, 0.15),
    ...leap(1, 17.45, 18.55, 23.0),
    wait('green stone up', (S) => S.pl[1].t === 1, 120),
    ...leap(1, 22.45, 23.55, 28.0), ...leap(1, 27.45, 28.55, 33.0), ...leap(1, 32.45, 33.55, 36.0), mv(1, 37.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Drawbridge: swap sides over the bridge, then Luna lifts Sol and Sol's lever lifts Luna.
  25: [
    mv(1, 36.5, 0.15), wait('bridge up', (S) => S.pl[2].t === 1, 120),
    mv(0, 27.5, 0.15), mv(1, 33.0, 0.2),
    mv(0, 36.5, 0.15), wait('bridge up again', (S) => S.pl[2].t === 1, 120),
    mv(1, 12.2, 0.15), mv(0, 30.0, 0.15),
    mv(1, 10.5, 0.15), wait("Sol's lift up", (S) => S.pl[1].t === 1, 300),
    mv(0, 33.2, 0.15), mv(1, 8.0, 0.15),
    mv(0, 37.5, 0.15), wait("Luna's lift up", (S) => S.pl[0].t === 1, 300),
    mv(1, 2.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Twilight Spiral: ferry relay, leapfrog lifts, then Luna holds the gate and Sol sets the corner lever.
  30: [
    mv(0, 9.5, 0.15), mv(1, 1.5, 0.15), wait('ferry across', (S) => S.pl[1].t === 1, 400),
    mv(0, 31.5, 0.12), mv(1, 4.0, 0.2), wait('ferry back', (S) => S.pl[1].t === 0, 400),
    mv(1, 9.5, 0.15), mv(0, 30.5, 0.15), wait('ferry across with luna', (S) => S.pl[1].t === 1, 400),
    mv(1, 31.5, 0.12), mv(0, 37.9, 0.15),
    mv(1, 35.5, 0.12), wait('lift A up', (S) => S.pl[3].t === 1, 300),
    mv(0, 36.5, 0.15), mv(1, 33.0, 0.1),
    jumpWhen(0, L_, 35.2, (S) => cx(S.p[0]) < 31.4 && S.p[0].gr),
    mv(0, 28.5, 0.15), wait('lift B up', (S) => S.pl[2].t === 1, 300),
    mv(1, 30.5, 0.15), wait('gate open', (S) => S.pl[0].t === 1, 200),
    ...leap(0, 28.5, 27.4, 24.0), ...leap(0, 24.55, 23.45, 20.0), ...leap(0, 20.55, 19.45, 15.5),
    mv(0, 1.5, 0.15), mv(0, 4.5, 0.15), wait('corner lever on', (S) => S.lv[0] > 0, 60),
    ...leap(1, 28.5, 27.4, 24.0), ...leap(1, 24.55, 23.45, 20.0), ...leap(1, 20.55, 19.45, 15.5),
    mv(1, 6.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Sanctum Approach: bridge, then the balance lifts, then the crate holds the final gate.
  31: [
    mv(1, 1.5, 0.15), wait('bridge up', (S) => S.pl[2].t === 1, 120),
    mv(0, 22.8, 0.15), wait('lever on', (S) => S.lv[0] > 0, 60),
    mv(0, 25.0, 0.15),
    mv(1, 29.5, 0.15), wait('lift U up', (S) => S.pl[1].t === 1, 300),
    mv(0, 31.5, 0.15), mv(1, 37.0, 0.15),
    jumpWhen(0, L_, 27.4, (S) => cx(S.p[0]) < 23.4 && S.p[0].gr),
    wait('lift D up', (S) => S.pl[3].t === 1, 300),
    push(0, 0, 13.0), wait('final gate open', (S) => S.pl[0].t === 1, 200),
    jumpWhen(1, L_, 27.4, (S) => cx(S.p[1]) < 23.4 && S.p[1].gr),
    mv(1, 15.5, 0.2), jumpWhen(1, L_, 15.0, (S) => cx(S.p[1]) < 11.6 && S.p[1].gr),   // over the socket
    mv(1, 4.5, 0.15),
    jumpWhen(0, L_, 15.0, (S) => cx(S.p[0]) < 11.6 && S.p[0].gr), mv(0, 2.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Stepping Stones: Luna's plate holds up Sol's stones, then Sol's plate holds up hers.
  9: [
    mv(1, 2.5, 0.15), wait('purple stones up', (S) => [0, 1, 2, 3, 4].every((i) => S.pl[i].t === 1), 200),
    ...leap(0, 1.5, 5.2, 9.0), ...leap(0, 8.45, 9.55, 14.0), ...leap(0, 13.45, 14.55, 19.0),
    ...leap(0, 18.45, 19.55, 24.0), ...leap(0, 23.45, 24.55, 29.0), ...leap(0, 28.45, 29.55, 34.5),
    wait('green stones up', (S) => [5, 6, 7, 8, 9].every((i) => S.pl[i].t === 1), 200),
    ...leap(1, 2.5, 5.2, 11.0), ...leap(1, 10.45, 11.55, 16.0), ...leap(1, 15.45, 16.55, 21.0),
    ...leap(1, 20.45, 21.55, 26.0), ...leap(1, 25.45, 26.55, 31.0), ...leap(1, 30.45, 31.55, 37.0),
    mv(1, 38.4, 0.12), mv(0, 36.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Basins: Sol's plate raises Luna's bridge, Luna's lever raises Sol's.
  11: [
    mv(0, 16.5, 0.15), wait('bridge over the sun basin', (S) => S.pl[0].t === 1, 120),
    mv(1, 30.6, 0.15), wait('bridge over the moon basin', (S) => S.pl[1].t === 1, 120),
    mv(0, 35.5, 0.15), mv(1, 37.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // The Climb: four lifts, each driven by a plate the rider can't stand on.
  16: [
    mv(0, 5.0, 0.15), mv(1, 12.5, 0.15), wait('lift A up', (S) => S.pl[2].t === 1, 300),
    jumpWhen(0, R_, 12.6, (S) => cx(S.p[0]) > 16.4 && S.p[0].gr), mv(0, 24.0, 0.2),
    jumpWhen(1, R_, 20.6, (S) => cx(S.p[1]) > 25.4 && S.p[1].gr), mv(1, 34.0, 0.15),
    mv(0, 27.5, 0.15), wait('lift B up', (S) => S.pl[3].t === 1, 300),
    mv(1, 30.0, 0.2), mv(0, 19.0, 0.15), mv(1, 13.5, 0.15), wait('lift C up', (S) => S.pl[1].t === 1, 300),
    mv(0, 24.0, 0.2), mv(1, 9.0, 0.15), mv(0, 26.5, 0.15), wait('lift D up', (S) => S.pl[0].t === 1, 300),
    mv(1, 4.5, 0.15),
    jumpWhen(0, L_, 21.4, (S) => cx(S.p[0]) < 17.4 && S.p[0].gr),
    jumpWhen(0, L_, 11.4, (S) => cx(S.p[0]) < 7.4 && S.p[0].gr),
    mv(0, 2.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Ferryman: whoever stays behind stands on the plate; the other holds the far plate to send it back.
  18: [
    mv(0, 9.5, 0.15), mv(1, 2.5, 0.15), wait('ferry across', (S) => S.pl[0].t === 1, 400),
    mv(0, 35.5, 0.15),
    mv(1, 5.0, 0.2), wait('ferry back', (S) => S.pl[0].t === 0, 400),
    mv(1, 9.5, 0.15), mv(0, 33.5, 0.15), wait('ferry across with luna', (S) => S.pl[0].t === 1, 400),
    mv(1, 37.5, 0.15), mv(0, 35.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // First Light: Sol's plate opens Luna's gate, Luna's plate opens Sol's.
  1: [
    mv(0, 33.5, 0.15), wait('GL open', (S) => S.pl[0].t === 1, 200),
    mv(1, 3.5, 0.15), wait('GS open', (S) => S.pl[1].t === 1, 200),
    mv(0, 38.3, 0.15), mv(1, 1.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Two Roads: each flips the lever on their own road, which opens the other road's gate.
  2: [
    mv(0, 19.5, 0.2), mv(1, 19.5, 0.2),
    wait('gates open', (S) => S.pl[0].t === 1 && S.pl[1].t === 1, 300),
    mv(0, 36.5, 0.15), mv(1, 36.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Shade Moat: Luna's lever raises Sol's bridge, Sol's lever raises Luna's.
  3: [
    jumpWhen(1, R_, 5.2, (S) => cx(S.p[1]) > 9.5 && S.p[1].gr),
    jumpWhen(1, R_, 11.2, (S) => cx(S.p[1]) > 15 && S.p[1].gr),
    mv(1, 27.5, 0.15), wait('bridge 1 up', (S) => S.pl[0].t === 1, 200),
    jumpWhen(0, R_, 5.2, (S) => cx(S.p[0]) > 9.5 && S.p[0].gr),
    jumpWhen(0, R_, 11.2, (S) => cx(S.p[0]) > 15 && S.p[0].gr),
    mv(0, 37.5, 0.15), wait('bridge 2 up', (S) => S.pl[1].t === 1, 200),
    mv(1, 38.4, 0.12),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Hold the Gate: Luna holds the plate, Sol passes and sets the lever, Luna follows.
  4: [
    mv(1, 2.5, 0.15), wait('gate open', (S) => S.pl[0].t === 1, 200),
    mv(0, 25.5, 0.15), wait('lever on', (S) => S.lv[0] > 0, 120),
    mv(1, 26.5, 0.15),
    jumpWhen(1, R_, 26.5, (S) => cx(S.p[1]) > 31.2 && S.p[1].gr),
    mv(1, 37.5, 0.15), mv(0, 35.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Lever Lift: Luna's plate lifts Sol, then Sol works the lever like a lift operator.
  5: [
    mv(0, 18.5, 0.15), mv(1, 2.5, 0.15), wait('lift up', (S) => S.pl[0].t === 1, 400),
    mv(0, 25.5, 0.15), wait('lever on', (S) => S.lv[0] > 0, 120),
    mv(1, 14.0, 0.2),
    mv(0, 22.0, 0.15), wait('lift down', (S) => S.pl[0].t === 0, 400),
    mv(1, 18.5, 0.15),
    mv(0, 25.5, 0.15), wait('lift up with luna', (S) => S.pl[0].t === 1, 400),
    jumpWhen(1, R_, 25.6, (S) => cx(S.p[1]) > 30.5 && S.p[1].gr),
    mv(1, 37.5, 0.15),
    mv(0, 30.4, 0.12),
    jumpWhen(0, R_, 30.4, (S) => cx(S.p[0]) > 34.2 && S.p[0].gr),
    mv(0, 35.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // First Crate: Luna opens the pen, Sol climbs the crate and sets the lever, Luna follows.
  6: [
    mv(1, 2.5, 0.15), wait('pen open', (S) => S.pl[0].t === 1, 200),
    mv(0, 19.0, 0.15), push(0, 0, 21.4),
    hop(0, R_, (S) => S.p[0].gr && bot(S.p[0]) < 24.1),
    mv(0, 26.0, 0.15), wait('lever on', (S) => S.lv[0] > 0, 120),
    mv(1, 15.0, 0.2),
    hop(1, R_, (S) => S.p[1].gr && bot(S.p[1]) < 24.1),
    jumpWhen(1, R_, 26.6, (S) => cx(S.p[1]) > 31.2 && S.p[1].gr),
    mv(1, 38.3, 0.15),
    mv(0, 31.4, 0.12),
    jumpWhen(0, R_, 31.4, (S) => cx(S.p[0]) > 35.2 && S.p[0].gr),
    mv(0, 36.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Crate on the Plate: Luna opens the gate, Sol parks the crate on the inner plate.
  7: [
    mv(1, 2.5, 0.15), wait('gate open', (S) => S.pl[0].t === 1, 200),
    mv(0, 20.0, 0.15), push(0, 0, 28.5),
    mv(1, 14.0, 0.2), wait('crate holds the gate', (S) => S.pl[0].t === 1, 60),
    mv(1, 26.0, 0.15),
    jumpWhen(1, R_, 26.0, (S) => cx(S.p[1]) > 30 && S.p[1].gr),
    mv(1, 37.5, 0.15),
    jumpWhen(0, R_, 27.0, (S) => cx(S.p[0]) > 30 && S.p[0].gr),
    mv(0, 35.5, 0.15),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Helper's Way Out: Luna holds P1 so Sol can ride E1; Sol's lever L1 lifts Luna out.
  // Then Sol holds P2 so Luna can pass G2; Luna's lever L2 frees Sol for good.
  14: [
    mv(0, 8.5, 0.1),                                                     // sol boards E1
    mv(1, 26.5, 0.1),                                                    // luna wades the channel to P1
    wait('E1 up', (S) => S.pl[1].t === 1, 400),
    mv(0, 3.5, 0.2),                                                     // sol: gem above the start
    mv(0, 22.6, 0.15),                                                   // sol wades the sun corridor (over P2)
    mv(1, 36.5, 0.1),                                                    // luna leaves P1, boards S1
    jumpWhen(0, R_, 23.2, (S) => S.p[0].gr && bot(S.p[0]) < 16.1),       // sol up onto step T1
    mv(0, 27.5, 0.15),                                                   // ... pushing L1 to the right
    wait('S1 up', (S) => S.pl[2].t === 1, 400),
    mv(1, 32.0, 0.15),                                                   // luna steps off S1 onto T2
    mv(0, 16.5, 0.1),                                                    // sol goes back and holds P2
    wait('G2 open', (S) => S.pl[0].t === 1, 200),
    jumpWhen(1, L_, 30.6, (S) => S.p[1].gr && bot(S.p[1]) < 12.1),       // luna T2 -> T3
    jumpWhen(1, L_, 26.6, (S) => S.p[1].gr && bot(S.p[1]) < 10.1 && cx(S.p[1]) < 25.8), // T3 -> landing
    mv(1, 1.6, 0.15),                                                    // through G2, over the bridge, to the corner
    mv(1, 8.5, 0.1),                                                     // push L2 right, stop at her door
    wait('L2 set', (S) => S.lv[0] > 0, 120),
    mv(0, 22.6, 0.15),                                                   // sol leaves P2
    jumpWhen(0, R_, 23.2, (S) => S.p[0].gr && bot(S.p[0]) < 16.1),
    mv(0, 29.5, 0.1),
    jumpWhen(0, R_, 29.4, (S) => S.p[0].gr && bot(S.p[0]) < 14.1),       // T1 -> T2
    mv(0, 31.0, 0.15),
    jumpWhen(0, L_, 30.6, (S) => S.p[0].gr && bot(S.p[0]) < 12.1),       // T2 -> T3
    jumpWhen(0, L_, 26.6, (S) => S.p[0].gr && bot(S.p[0]) < 10.1 && cx(S.p[0]) < 25.8),
    mv(0, 6.5, 0.1),                                                     // over the bridge to his door
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Carry the Weight: Luna lifts Sol and the crate, opens the gates while Sol delivers
  // the crate to the socket plate, then Sol lifts Luna. The crate holds the gates open.
  19: [
    push(0, 0, 3.6),                                                     // crate onto E0
    mv(0, 5.0, 0.15),
    mv(1, 25.5, 0.1),                                                    // luna holds P0
    wait('E0 up', (S) => S.pl[2].t === 1, 400),
    hopTo(0, 1.6, (S) => S.p[0].gr && cx(S.p[0]) < 2.3 && bot(S.p[0]) < 18.1), // hop over the crate
    push(0, 0, 9.0),                                                     // crate off the lift
    hopTo(0, 9.0, (S) => S.p[0].gr && S.p[0].gref === 100),              // stand on the crate ...
    jumpWhen(0, R_, 8.9, (S) => S.p[0].gr && bot(S.p[0]) < 14.1),        // ... to reach the ledge gem
    mv(0, 11.5, 0.2), mv(0, 7.6, 0.1),                                  // back over the crate to its left side
    mv(1, 28.5, 0.1),                                                    // luna leaves P0, holds P1
    wait('G1 open', (S) => S.pl[0].t === 1, 200),
    push(0, 0, 25.0),                                                    // crate into the socket
    wait('crate settles', (S) => S.b[0].gr && S.btn[1] === 1, 200),
    mv(1, 4.5, 0.1),                                                     // luna back to E0 (it is down)
    hopTo(0, 22.0, (S) => S.p[0].gr && cx(S.p[0]) < 22.5 && bot(S.p[0]) < 18.1),
    mv(0, 7.5, 0.1),                                                     // sol holds P0b
    wait('E0 up with luna', (S) => S.pl[2].t === 1, 400),
    jumpWhen(1, R_, 23.0, (S) => S.p[1].gr && cx(S.p[1]) > 26.5),        // luna hops the socket
    mv(1, 36.5, 0.1),                                                    // ... to her door
    jumpWhen(0, R_, 23.0, (S) => S.p[0].gr && cx(S.p[0]) > 26.5),
    mv(0, 34.5, 0.1),                                                    // sol to his
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  // Operator: Luna works levers A and B so Sol can cross two pits via the refuge and ride E,
  // Sol holds PF so Luna can pass GW, and Luna's rescue lever LR opens Sol's exit gate.
  26: [
    mv(1, 19.0, 0.15),                                                   // A on: bridge 1 out, bridge 2 in
    wait('bridge 1 out', (S) => S.pl[3].t === 1 && S.pl[4].t === 1, 300),
    mv(0, 17.5, 0.15),                                                   // sol to the refuge
    mv(1, 15.5, 0.15),                                                   // A off: bridge 2 out
    wait('bridge 2 out', (S) => S.pl[5].t === 1 && S.pl[6].t === 1, 300),
    mv(0, 32.0, 0.15),                                                   // sol onto lift E
    mv(1, 9.6, 0.15), mv(1, 13.0, 0.15),                                 // B on: E rises
    wait('E up', (S) => S.pl[2].t === 1, 400),
    mv(0, 27.5, 0.1),                                                    // sol holds PF
    wait('GW open', (S) => S.pl[0].t === 1, 200),
    mv(1, 36.3, 0.15),                                                   // luna: GW, gallery, LR
    wait('GX open', (S) => S.pl[1].t === 1, 200),
    mv(1, 38.4, 0.12),                                                   // drop to her door
    mv(0, 36.5, 0.1),                                                    // sol through GX
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
  28: [
    jumpWhen(1, R_, 3.0, (S) => cx(S.p[1]) > 6 && S.p[1].gr),
    mv(1, 13.5, 0.08),
    push(0, 0, 10.9), mv(0, 9.9, 0.1),
    mv(1, 15.6, 0.3), wait('lift up', (S) => S.pl[2].t === 1),
    push(0, 0, 19.4),
    mv(0, 1.45, 0.08),
    mv(1, 13.5, 0.08), wait('lift down', (S) => S.pl[2].t === 0),
    mv(1, 11.0),
    mv(0, 3.4, 0.2), wait('lift up with luna', (S) => S.pl[2].t === 1),
    mv(0, 17.9, 0.1), wait('ferry home', (S) => S.pl[1].t === 0, 300), mv(0, 17.9, 0.1),
    mv(1, 5.5, 0.15), wait('ferry across', (S) => S.pl[1].t === 1, 700),
    push(0, 0, 33.46), wait('gate open', (S) => S.pl[0].t === 1, 200),
    mv(0, 31.6, 0.1),
    mv(1, 7.5, 0.2), wait('ferry back', (S) => S.pl[1].t === 0, 700),
    mv(1, 18.5),
    mv(0, 30.5, 0.1), wait('ferry across with luna', (S) => S.pl[1].t === 1, 700),
    jumpWhen(1, R_, 32.0, (S) => cx(S.p[1]) > 34.6 && S.p[1].gr),
    mv(1, 37.5, 0.1),
    jumpWhen(0, R_, 32.0, (S) => cx(S.p[0]) > 34.6 && S.p[0].gr),
    mv(0, 35.5, 0.1),
    wait('both at doors', (S) => S.phase === 2, 200),
  ],
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

// Compare real file paths, not URL strings: import.meta.url percent-encodes
// spaces and other characters, so a string match fails in paths like
// "Application Support" and the bot would exit 0 without running anything.
const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isMain) {
  const which = process.argv[2] ? process.argv[2].split(',').map(Number) : Object.keys(SCRIPTS).map(Number);
  let fail = 0;
  for (const n of which) {
    const r = run(n, SCRIPTS[n], { verbose: !!process.env.V });
    console.log(`${String(n).padStart(2)} ${LEVELS[n - 1].name}: ${r.ok ? 'OK' : 'FAIL'} — ${r.msg}`);
    if (!r.ok) fail++;
  }
  process.exit(fail ? 1 : 0);
}
