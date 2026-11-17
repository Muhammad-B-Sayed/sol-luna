// Bot scripts for this act file. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

// Wrap a search phase so it only succeeds while the player stands inside cells x0..x1, y0..y1.
const within = (ph, x0, y0, x1, y1) => ({
  ...ph, name: `${ph.name} in ${x0},${y0}-${x1},${y1}`, sig: `${ph.sig}|in${x0},${y0},${x1},${y1}`,
  goal: (S, p) => ph.goal(S, p) && cx(p) >= x0 && cx(p) <= x1 + 1 && bot(p) - 1 >= y0 - 0.5 && bot(p) - 1 <= y1 + 0.5,
});
// Crate i has come to rest with its bottom below row y (it fell down a chute).
const dropped = (who, i, y, x, name) => seek(who, name, (S) => S.b[i].gr && bot(S.b[i]) > y + 0.5,
  { key: `drop${i},${y}`, h: (S, p) => Math.abs(cx(S.b[i]) - x) * 13 + Math.abs(cx(p) - cx(S.b[i])) * 4 });

// Gems collected so far.
const gemCount = (S) => S.gm.reduce((a, b) => a + b, 0);
// Jump straight up until a gem is collected (for gems over a low roof, where a search might
// pick a sideways jump that hits the ceiling).
const hopUp = (who, name) => {
  let n0 = null;
  return [name, (S) => {
    if (n0 === null) n0 = gemCount(S);
    const b = S.p[who].gr && gemCount(S) === n0 ? U_ : 0;
    return who ? [0, b] : [b, 0];
  }, (S) => n0 !== null && gemCount(S) > n0 && S.p[who].gr, 200];
};

// A timed jump: jump toward dir, hold it for `hold` ticks, then brake until landing.
// For hops under a low roof, where the landing cell has to be exact.
const timedHop = (who, dir, hold, name) => {
  let t = -1, air = false;
  const back = dir === R_ ? L_ : R_;
  return [name, (S) => {
    t++;
    const p = S.p[who];
    if (!p.gr) air = true;
    const b = t === 0 ? dir | U_ : air && p.gr ? 0 : t < hold ? dir : back;
    return who ? [0, b] : [b, 0];
  }, (S) => air && S.p[who].gr && Math.abs(S.p[who].vx) < 0.6, 200];
};

export const SCRIPTS = {
  // Sunken Halls
  29: () => [
    // hall 1 is a low gallery: walk it, don't jump
    press(SOL, 21, 5),                               // PG: G0 opens
    mv(LUNA, 12.5),                                  // Luna through the moon tunnel into the west room
    mv(SOL, 19.5),                                   // Sol steps off: G0 shuts behind her
    ['Luna pushes K1 into C1', (S) => [0, bot(S.b[0]) > 5.05 ? 0 : L_], (S) => S.b[0].gr && bot(S.b[0]) > 5.9 && S.p[1].gr, 400],
    mv(LUNA, 11.2, 0.1), hopUp(LUNA, 'Luna hops for the gem'),
    mv(SOL, 21.5),                                   // PG again: she comes out
    mv(LUNA, 20.5),
    // hall 2
    goto(SOL, 22, 12),                               // Sol down the well
    press(SOL, 16, 12), wait('K1 falls into the lake', (S) => S.b[0].gr && bot(S.b[0]) > 14, 300),   // PK: HK slides away
    mv(SOL, 13.5),
    grab(SOL, 1, 8), flip(SOL, 2, 12),               // over the lake on K1: L1 on, the east rooms open
    goto(SOL, 13, 12), mv(SOL, 17.5),
    goto(SOL, 23, 12, { tol: 0.1 }),                 // over R2's shaft to R1's berth
    press(LUNA, 18, 5), waitPlat(24, 6),             // rescue one: PR1 calls R1 down
    goto(SOL, 25, 12),
    mv(LUNA, 20.5), waitPlat(24, 6, false),          // she lets go: it carries him up
    press(LUNA, 21, 5),                              // PG: the inner gate opens
    mv(SOL, 35.45, 0.02), timedHop(SOL, R_, 30, 'Sol hops over K2'),   // a short hop: two cells, under the low roof
    grab(SOL, 38, 2),                                // taken in the air on the way over
    push(SOL, 1, 31.5),                              // K2 out through G2
    mv(LUNA, 20.5),
    push(SOL, 1, 25.5), mv(SOL, 28.5),               // and onto R1
    press(LUNA, 18, 5), waitPlat(24, 6),             // PR1: R1 carries the crate down
    mv(SOL, 26.2), goto(SOL, 23, 12),                // Sol drops in after it and steps off west
    pushTo(SOL, 1, 28, { tol: 0.6 }),                // K2 off the lift, against the pink gate
    goto(SOL, 23, 12),
    mv(LUNA, 20.5), waitPlat(24, 6, false),          // she lets go; R1 goes back up
    mv(LUNA, 22.6), grab(LUNA, 22, 8),               // Luna down the well
    goto(LUNA, 19, 20),                              // and down R2's shaft
    flip(LUNA, 27, 20, false), grab(LUNA, 25, 20),   // the pink lever: the ferry gate opens, the lake drains
    goto(LUNA, 19, 20),
    goto(SOL, 17, 12), mv(SOL, 13.5),
    press(SOL, 1, 12), waitPlat(18, 21),             // rescue two: PR2 on the far shore
    mv(LUNA, 14.5), leap(LUNA, 11, 10.5, 5.5),       // over K1 in the drained lake
    push(LUNA, 0, 19.5), mv(LUNA, 16.5),             // K1 out onto R2
    mv(SOL, 5.5), waitPlat(18, 21, false),           // Sol lets go: K1 rides down
    pushTo(LUNA, 1, 31, { tol: 0.4 }),               // K2 through G3 onto the ferry
    within(goto(LUNA, 30, 12, { tol: 0.45 }), 30, 12, 30, 12),
    press(SOL, 3, 12), waitPlat(30, 13),             // PF: the ferry crosses
    within(dropped(LUNA, 1, 19, 36.5, 'Luna pushes K2 down C2'), 30, 12, 38, 12),
    mv(LUNA, 36.6), goto(LUNA, 38, 20), grab(LUNA, 38, 15),
    // hall 3
    mv(SOL, 17.5), mv(SOL, 19.4), goto(SOL, 21, 20), // Sol down R2's shaft onto K1, and off it east
    press(LUNA, 38, 20),                             // P8: GP opens
    pushTo(SOL, 0, 15, { tol: 0.3 }),                // K1 through GP to the foot of the wall
    grab(SOL, 14, 14),                               // up from the crate onto the ledge
    grab(SOL, 1, 16), press(SOL, 2, 21),             // down into the west end: P5, G5 opens
    within(dropped(LUNA, 1, 21.3, 31.5, 'Luna pushes K2 onto the hatch in C3'), 31, 14, 38, 20),
    press(LUNA, 33, 20),                             // P7: Sol's hatch opens
    goto(SOL, 7, 28, { tol: 0.5 }), grab(SOL, 1, 24),
    press(SOL, 3, 28), wait('the crate falls into the bottom hall', (S) => S.b[1].gr && bot(S.b[1]) > 27.5, 300),   // P9: HC slides away
    mv(LUNA, 31.9),                                  // she drops after it while he holds
    mv(SOL, 4.6),                                    // he lets go: HC slides back
    dropped(LUNA, 1, 28.2, 25.5, 'Luna pushes K2 into the socket'),
    // hall 4
    grab(LUNA, 30, 23), press(LUNA, 15, 27),         // over the bridge to P6: G6 opens
    goto(SOL, 35, 27),                               // Sol through G6, over the bridge, onto L4
    press(LUNA, 33, 27), waitPlat(34, 28),           // PR3: up he goes
    press(SOL, 38, 23),                              // P6b on the shelf: G6 opens for Luna
    door(LUNA), door(SOL), win(),
  ],

  // Twilight Spiral
  30: () => [
    // the outer ring: three-stage lift pumps driven from the far side
    press(LUNA, 27, 27),                             // PGb: Sol's bridge over the moon water
    grab(SOL, 3, 24), press(SOL, 4, 27),             // over it; PGw: Luna's bridge over the sun water
    grab(LUNA, 36, 24), goto(LUNA, 35, 27, { tol: 0.1 }),
    goto(SOL, 1, 27, { tol: 0.1 }),                  // Sol onto L1
    press(LUNA, 34, 27), waitPlat(1, 28),   // PLs: L1 up
    goto(SOL, 3, 21, { tol: 0.1 }),                  // onto the first step
    goto(LUNA, 33, 27), waitPlat(4, 22, false),      // she lets go: L2 comes down
    goto(SOL, 5, 21, { tol: 0.1 }),
    press(LUNA, 34, 27), waitPlat(4, 22),            // PLs again: L2 up
    goto(SOL, 3, 13, { tol: 0.1 }),                  // onto the second step
    goto(LUNA, 33, 27), waitPlat(1, 14, false),      // she lets go: L3 comes down
    goto(SOL, 1, 13, { tol: 0.1 }),
    press(LUNA, 34, 27), waitPlat(1, 14),            // PLs a third time: L3 to the top
    grab(SOL, 1, 3), goto(SOL, 7, 5),
    goto(LUNA, 38, 27, { tol: 0.1 }),                // Luna onto R1
    press(SOL, 8, 5), waitPlat(38, 28),              // PRl: R1 up
    goto(LUNA, 36, 21, { tol: 0.1 }),
    goto(SOL, 7, 5, { tol: 0.1 }), waitPlat(34, 22, false),
    goto(LUNA, 34, 21, { tol: 0.1 }),
    press(SOL, 8, 5), waitPlat(34, 22),              // PRl again: R2 up
    goto(LUNA, 36, 13, { tol: 0.1 }),
    goto(SOL, 7, 5, { tol: 0.1 }), waitPlat(37, 14, false),
    goto(LUNA, 38, 13, { tol: 0.1 }),
    press(SOL, 8, 5), waitPlat(37, 14),              // PRl a third time: R3 to the top
    grab(LUNA, 38, 3),
    // crossing one
    press(LUNA, 21, 5),                              // P1: G1 opens
    flip(SOL, 27, 5),                                // Sol through, and through L1: G1 stays open
    press(LUNA, 12, 5),                              // PGr: his bridge over the moon water rises
    goto(SOL, 32, 4),                                // he crosses and holds PGe: hers rises
    within(goto(LUNA, 7, 5), 6, 2, 8, 5),
    // down the far sides into the inner bottom
    grab(LUNA, 8, 18), press(LUNA, 9, 21),           // Luna west, down the left column, in; PIw
    goto(SOL, 33, 21), grab(SOL, 29, 18),            // Sol east, down the right column, in
    press(SOL, 22, 21),                              // over the moon water on her bridge; PIe
    goto(LUNA, 18, 21),                              // she crosses the sun water on his
    // crossing two
    press(SOL, 24, 21),                              // P2: G2 opens
    goto(LUNA, 22, 21),
    press(LUNA, 24, 21),
    goto(SOL, 15, 21),
    // the inner lifts
    press(LUNA, 28, 21), waitPlat(12, 12),           // PIL: IL comes down
    goto(SOL, 12, 21),
    goto(LUNA, 29, 21), waitPlat(12, 12, false),     // she lets go: up he goes
    grab(SOL, 12, 8),
    press(SOL, 14, 11), waitPlat(31, 12),            // PIR: IR comes down
    goto(LUNA, 31, 21),
    goto(SOL, 17, 11), waitPlat(31, 12, false),      // he lets go: up she goes
    grab(LUNA, 29, 8), goto(LUNA, 26, 11),
    // crossing three: the airlock
    goto(SOL, 22, 11),
    press(LUNA, 28, 11),                             // P3
    goto(SOL, 26, 11),                               // he runs through as she steps on
    goto(LUNA, 25, 11), waitPlat(24, 6, false),     // she steps off; the slow gate rises again
    press(SOL, 28, 11),
    goto(LUNA, 19, 9),                               // she runs through west
    grab(LUNA, 9, 10), flip(LUNA, 7, 11),            // the moon bay: the hatches open
    // into the sanctum
    goto(SOL, 25, 16), grab(SOL, 27, 13),            // Sol drops in through his hatch
    goto(LUNA, 15, 11),
    press(SOL, 22, 16),                              // PGc: her hatch opens
    grab(LUNA, 15, 13), goto(LUNA, 17, 16),
    goto(SOL, 25, 16),
    // crossing four: the airlock
    press(SOL, 24, 16),
    goto(LUNA, 21, 16),
    goto(SOL, 20, 16, { tol: 0.4 }), waitPlat(19, 11, false),
    press(LUNA, 24, 16),
    door(SOL),
    door(LUNA), win(),
  ],

  // Sanctum Approach
  31: () => [
    // bottom stage
    grab(SOL, 1, 20),
    press(LUNA, 3, 21),                              // P1: G1 opens
    flip(SOL, 17, 23),                               // Sol through, right through the yellow lever: the bridge rises
    grab(SOL, 24, 20), goto(SOL, 30, 22),
    press(SOL, 31, 22),                              // P1b: Luna follows
    grab(LUNA, 18, 20), goto(LUNA, 27, 22, { keep: true }),
    goto(SOL, 37, 27, { keep: true }),               // Sol down onto S1
    press(LUNA, 28, 22), waitPlat(37, 28),           // PS1: up to the middle
    goto(SOL, 31, 17),
    grab(LUNA, 31, 20), goto(LUNA, 37, 27, { keep: true }), waitPlat(37, 28, false),
    press(SOL, 26, 17), waitPlat(37, 28),            // PS1b: Luna up
    // middle stage
    goto(LUNA, 32, 17),
    press(SOL, 28, 17),                              // P2: G2 opens
    grab(LUNA, 19, 13), grab(LUNA, 5, 12), grab(LUNA, 1, 13),
    pushTo(LUNA, 0, 34, { tol: 0.4 }),               // the crate east through G2 onto S2
    within(goto(LUNA, 33, 17, { tol: 0.5 }), 33, 17, 35, 17),
    press(SOL, 30, 14), waitPlat(34, 18),   // PS2: S2 to the top
    goto(LUNA, 37, 8),
    pushTo(LUNA, 0, 31, { tol: 0.6 }),               // she pushes the crate off the lift while he still holds it
    within(grab(SOL, 31, 11), 24, 11, 32, 17), goto(SOL, 31, 17), waitPlat(34, 18, false), goto(SOL, 34, 17),
    press(LUNA, 38, 8), waitPlat(34, 18),            // PS2b: Sol up
    // top stage
    goto(SOL, 31, 8),
    goto(LUNA, 37, 8), waitPlat(34, 18, false),
    dropped(LUNA, 0, 9.6, 16, 'Luna pushes K off the step into the socket'),
    within(grab(LUNA, 28, 4), 1, 2, 32, 8),
    // back down
    goto(SOL, 34, 17), goto(SOL, 37, 27),            // down S2's shaft, across, down S1's
    flip(SOL, 17, 23, false),                        // west over the bridge and back through the lever
    goto(SOL, 13, 24, { tol: 0.5 }),
    press(LUNA, 12, 9),                              // PR: the hatch opens
    goto(SOL, 20, 27), grab(SOL, 30, 26),
    goto(SOL, 37, 27),
    press(LUNA, 36, 8), waitPlat(37, 28),            // PS1c: S1 up
    goto(SOL, 34, 17),
    press(LUNA, 38, 8), waitPlat(34, 18),            // PS2b: S2 up
    grab(SOL, 21, 5),
    door(SOL), door(LUNA), win(),
  ],
};
