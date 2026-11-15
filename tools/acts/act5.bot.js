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

export const SCRIPTS = {
  // Sunken Halls
  29: () => [
    // hall 1
    press(SOL, 16, 6),                               // PG: G0 opens
    within(goto(LUNA, 8, 5), 7, 2, 9, 6),            // Luna through the moon tunnel into the west room
    goto(SOL, 17, 6),                                // Sol steps off: G0 shuts behind her
    dropped(LUNA, 0, 6.2, 6, 'Luna pushes K1 onto the hatch in C1'),
    grab(LUNA, 1, 3), goto(LUNA, 8, 5),
    press(SOL, 16, 6),                               // PG again: she comes out
    goto(LUNA, 18, 6),
    goto(SOL, 20, 12), grab(SOL, 14, 11),            // Sol down the well
    press(SOL, 14, 13), wait('K1 falls into the lake', (S) => S.b[0].gr && bot(S.b[0]) > 14, 300),   // PK: HK slides away
    grab(SOL, 1, 10), flip(SOL, 2, 13),              // over the lake on K1: L1 on, the east room opens
    goto(SOL, 20, 12, { tol: 0.1 }),                 // beside R1's empty berth
    press(LUNA, 21, 6), waitPlat(23, 7),             // rescue one: PR1 calls R1 down
    goto(SOL, 23, 12),
    goto(LUNA, 18, 6), waitPlat(23, 7, false),       // she lets go: it carries him up
    goto(SOL, 29, 6),
    press(LUNA, 16, 6),                              // PG: the inner gate opens
    grab(SOL, 38, 2),
    pushTo(SOL, 1, 23, { tol: 0.4 }),                // K2 out onto R1
    goto(SOL, 26, 6),
    press(LUNA, 21, 6), waitPlat(23, 7),             // PR1: R1 carries the crate down
    // hall 2
    goto(SOL, 21, 12),                               // Sol drops in after it
    pushTo(SOL, 1, 26, { tol: 0.6 }),                // K2 off the lift, against the pink gate
    goto(LUNA, 18, 6), waitPlat(23, 7, false),       // she lets go; R1 goes back up
    goto(SOL, 20, 12), grab(LUNA, 22, 10), goto(LUNA, 19, 12),
    goto(LUNA, 16, 20),                              // Luna down R2's shaft
    flip(LUNA, 23, 20, false), grab(LUNA, 21, 20),   // the pink lever: the ferry room opens, the lake drains
    goto(LUNA, 16, 20),
    press(SOL, 12, 13), waitPlat(16, 21),            // rescue two
    pushTo(LUNA, 0, 16, { tol: 0.8 }),               // K1 out of the drained lake onto R2
    goto(SOL, 13, 13), waitPlat(16, 21, false),      // Sol lets go: K1 rides down
    pushTo(LUNA, 1, 31, { tol: 0.3 }),               // K2 onto the ferry
    within(goto(LUNA, 29, 12, { tol: 0.6 }), 29, 12, 30, 12),
    press(SOL, 3, 13), waitPlat(30, 13),            // PF: the ferry crosses
    within(dropped(LUNA, 1, 19, 35, 'Luna pushes K2 down C2'), 29, 12, 38, 12), grab(LUNA, 38, 11), goto(LUNA, 36, 19),
    grab(LUNA, 35, 16),
    // hall 3
    goto(SOL, 18, 20),                               // Sol down R2's shaft onto K1, and off it east
    press(LUNA, 38, 19),                             // P8: GP opens
    dropped(SOL, 0, 20.7, 10, 'Sol pushes K1 through GP into the shade pool'),
    press(SOL, 7, 20),                               // over it to P5: G5 opens
    within(dropped(LUNA, 1, 20.3, 27, 'Luna pushes K2 onto the hatch in C3'), 28, 16, 38, 19),
    press(LUNA, 28, 19),                             // she follows it through G5, onto P7
    grab(SOL, 1, 16), goto(SOL, 3, 20, { tol: 0.4 }),   // P7 holds Sol's hatch open: he drops
    grab(SOL, 1, 24),
    press(SOL, 3, 27), wait('the crate falls into the bottom hall', (S) => S.b[1].gr && bot(S.b[1]) > 26.5, 300),   // P9: HC slides away under it
    goto(LUNA, 28, 26),                              // she drops after it while he holds
    dropped(LUNA, 1, 26.6, 23, 'Luna pushes K2 into the socket'),
    // hall 4
    goto(LUNA, 29, 26), grab(LUNA, 24, 23), press(LUNA, 15, 26),   // over the bridge to P6: G6 opens
    grab(SOL, 37, 27), goto(SOL, 32, 27),            // Sol through G6, over the bridge, onto L4
    press(LUNA, 30, 26), waitPlat(32, 28),           // PR3: up he goes
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
