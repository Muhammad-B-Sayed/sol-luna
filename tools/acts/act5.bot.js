// Bot scripts for this act file. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, toward, cx, bot, L_, R_, U_ } from '../botlib.js';

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
    // the outer bottom corridor: each holds the other's bridge
    press(LUNA, 27, 27),                             // PGb: Sol's bridge over the moon water
    mv(SOL, 5.5), grab(SOL, 3, 24), press(SOL, 4, 27),   // PGw: Luna's bridge over the sun water
    mv(LUNA, 35.5), grab(LUNA, 36, 24),
    // Sol pumps up the left column on three lifts, Luna holding white PLs
    mv(SOL, 2.0, 0.1), mv(LUNA, 33.2),
    press(LUNA, 34, 27), waitPlat(1, 28),            // L1 up
    mv(SOL, 3.5, 0.1),
    mv(LUNA, 33.2), waitPlat(4, 21, false),          // she lets go: L1 down, L2 back
    mv(SOL, 5.0, 0.1),
    press(LUNA, 34, 27), waitPlat(4, 21),            // L2 up
    mv(SOL, 3.5, 0.1),
    mv(LUNA, 33.2), waitPlat(1, 14, false),
    mv(SOL, 2.0, 0.1),
    press(LUNA, 34, 27), waitPlat(1, 14),            // L3 up into the top corridor
    grab(SOL, 1, 3), mv(SOL, 4.0), mv(LUNA, 33.2), waitPlat(37, 28, false),
    // Luna pumps up the right column, Sol holding white PRl
    mv(LUNA, 38.0, 0.1),
    press(SOL, 5, 6), waitPlat(37, 28),
    mv(LUNA, 36.5, 0.1),
    mv(SOL, 4.0), waitPlat(34, 21, false),
    mv(LUNA, 35.0, 0.1),
    press(SOL, 5, 6), waitPlat(34, 21),
    mv(LUNA, 36.5, 0.1),
    mv(SOL, 4.0), waitPlat(37, 14, false),
    mv(LUNA, 38.0, 0.1),
    press(SOL, 5, 6), waitPlat(37, 14),
    grab(LUNA, 38, 3), mv(LUNA, 35.5),
    mv(SOL, 4.0),
    // west along the top: she wades her moon water under the low roof
    mv(LUNA, 26.5), mv(LUNA, 19.5),
    // crossing one: Luna holds orange P1, Sol through G1 and right through the orange lever
    press(LUNA, 19, 6),
    mv(SOL, 13.5), flip(SOL, 28, 6),
    // crossing one and a half: each holds the other's bridge
    mv(LUNA, 12.5), press(LUNA, 12, 6),
    mv(SOL, 33.5), press(SOL, 33, 5),
    mv(LUNA, 4.5),
    // down the far columns into the inner bottom corridor
    goto(LUNA, 4, 20), mv(LUNA, 7.5), grab(LUNA, 8, 19), press(LUNA, 9, 20),
    mv(SOL, 36.5), goto(SOL, 36, 20), mv(SOL, 32.5), grab(SOL, 32, 19),
    // crossing two: bridges, then the purple gate both ways
    mv(SOL, 22.5), press(SOL, 22, 20),               // over the moon water on his bridge; PIe
    mv(LUNA, 17.5),                                  // she crosses the sun water on hers
    press(SOL, 24, 20),                              // P2: G2 sinks
    mv(LUNA, 24.5), press(LUNA, 24, 20),             // she comes through and takes over the plate
    mv(SOL, 17.5),
    // the inner lifts: each calls the other's lift down and sends it up
    mv(SOL, 10.4),
    mv(LUNA, 28.5), press(LUNA, 28, 20), waitPlat(11, 11),   // PIL: IL comes down
    mv(SOL, 12.5, 0.1),
    mv(LUNA, 26.5), waitPlat(11, 11, false),         // she lets go: up he goes
    hopUp(SOL, 'Sol hops for the gem'),
    press(SOL, 14, 10), waitPlat(29, 11),            // PIR: IR comes down
    mv(LUNA, 30.0, 0.1),
    mv(SOL, 12.5), waitPlat(29, 11, false),          // he lets go: up she goes
    mv(LUNA, 28.5), hopUp(LUNA, 'Luna hops for the gem'),
    // crossing three: the airlock. Luna steps on P3 and Sol runs east at once
    mv(LUNA, 28.6), mv(SOL, 21.9),
    both('Luna steps on P3, Sol runs east', (S) => (cx(S.p[0]) < 26.2 ? R_ : 0), (S) => toward(S.p[1], 27.5, 0.1),
      (S) => cx(S.p[0]) > 25.9 && S.p[0].gr && Math.abs(S.p[0].vx) < 0.6 && cx(S.p[1]) < 27.8, 200),
    mv(SOL, 29.4),
    mv(LUNA, 26.3), waitPlat(24, 5, false),          // she steps off: the airlock resets
    both('Sol steps on P3, Luna runs west', (S) => toward(S.p[0], 27.5, 0.1), (S) => (cx(S.p[1]) > 22.4 ? L_ : 0),
      (S) => cx(S.p[1]) < 22.6 && S.p[1].gr && Math.abs(S.p[1].vx) < 0.6, 200),
    mv(SOL, 26.0),                                   // Sol waits on his hatch
    // Luna through the moon bay, back out through the yellow lever: Sol's hatch opens
    mv(LUNA, 7.5), flip(LUNA, 7, 10),
    waitPlat(25, 11), grab(SOL, 26, 13),
    mv(LUNA, 16.0, 0.1),
    mv(SOL, 22.5, 0.1), press(SOL, 22, 16), waitPlat(15, 11),   // PGc: Luna's hatch lowers her into the west
    grab(LUNA, 15, 13), mv(LUNA, 17.4),
    mv(SOL, 23.5, 0.1), waitPlat(15, 11, false),     // he steps off between the plates; her hatch rises
    // crossing four: the sanctum airlock, Luna east, then Sol west
    both('Sol steps on P4, Luna runs east', (S) => toward(S.p[0], 24.5, 0.1), (S) => (cx(S.p[1]) < 21.9 ? R_ : 0),
      (S) => cx(S.p[1]) > 21.7 && S.p[1].gr && Math.abs(S.p[1].vx) < 0.6, 200),
    mv(SOL, 23.5, 0.1), waitPlat(19, 11, false),     // he steps off: the airlock resets
    both('Luna steps on P4, Sol runs west', (S) => (cx(S.p[0]) > 17.6 ? L_ : 0), (S) => toward(S.p[1], 24.5, 0.1),
      (S) => cx(S.p[0]) < 17.8 && S.p[0].gr && Math.abs(S.p[0].vx) < 0.6, 200),
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
