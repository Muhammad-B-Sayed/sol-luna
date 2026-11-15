// Bot scripts for this act. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

const K = { keep: true };   // a route that may not undo any lever

export const SCRIPTS = {
  // Eclipse
  23: () => [
    goto(SOL, 15, 9), goto(SOL, 18, 13), goto(SOL, 11, 13), grab(SOL, 2, 13), goto(SOL, 11, 13), goto(SOL, 9, 17), goto(SOL, 3, 28), grab(SOL, 1, 24), goto(SOL, 8, 27),   // both drop down their own wing
    goto(LUNA, 24, 9), goto(LUNA, 22, 13), grab(LUNA, 27, 12), goto(LUNA, 24, 17), goto(LUNA, 30, 17), goto(LUNA, 34, 17), goto(LUNA, 36, 27), grab(LUNA, 38, 24), goto(LUNA, 31, 27),
    press(SOL, 12, 27),                      // purple plate: Luna's floor-2 gate opens
    flip(LUNA, 30, 22),                      // green lever: Sol's gate and the green lock
    goto(LUNA, 29, 17, K),
    goto(SOL, 9, 22), grab(SOL, 8, 20),
    flip(SOL, 10, 17),                       // purple lever: purple lock
    goto(SOL, 23, 17),                       // through the tunnel
    goto(LUNA, 16, 17),
    goto(SOL, 30, 17), goto(SOL, 31, 22), goto(SOL, 25, 22), goto(SOL, 25, 27), goto(SOL, 34, 27), goto(SOL, 36, 27),   // down through Luna's floors to the yellow lift
    goto(LUNA, 9, 17), goto(LUNA, 9, 22), grab(LUNA, 10, 20), goto(LUNA, 14, 22), grab(LUNA, 16, 23), goto(LUNA, 12, 27), goto(LUNA, 3, 28),
    press(LUNA, 1, 27),                      // Luna holds yellow: Sol's lift rises, hers sinks
    waitPlat(36, 28),
    pushTo(SOL, 0, 30),                      // crate into the white socket
    goto(SOL, 36, 13), goto(SOL, 38, 11), goto(SOL, 35, 9),   // up to the top corridor while the lift is up
    press(SOL, 35, 9),                       // Sol holds yellow from above
    goto(LUNA, 3, 27),                       // Luna steps onto her sunken lift
    goto(SOL, 32, 9),                        // Sol lets go: her lift carries her up
    waitPlat(2, 14, false),
    goto(LUNA, 1, 11), grab(LUNA, 3, 7),
    flip(LUNA, 8, 9),                        // orange lever: Sol's bridge
    goto(SOL, 24, 9), goto(SOL, 22, 13),     // over the orange bridge and down the drop
    goto(SOL, 29, 17),
    flip(SOL, 30, 22, false),                // green off: Luna's door lock opens (and his way back up is gone)
    goto(SOL, 33, 17), grab(SOL, 38, 16), goto(SOL, 36, 27),    // back down the shaft
    grab(SOL, 21, 19), goto(SOL, 36, 27),    // the west end of Luna's floor 2, then onto the lift
    goto(LUNA, 2, 13), goto(LUNA, 9, 17), goto(LUNA, 9, 22), goto(LUNA, 14, 22), goto(LUNA, 12, 27), goto(LUNA, 3, 28),
    press(LUNA, 1, 27),                      // second pump: Luna sends Sol up again
    waitPlat(36, 28),
    goto(SOL, 38, 11), goto(SOL, 35, 9), press(SOL, 35, 9),
    goto(LUNA, 3, 27),
    goto(SOL, 32, 9),
    waitPlat(2, 14, false),
    goto(LUNA, 13, 17),
    flip(LUNA, 10, 17),                      // purple back on: Sol's door lock opens (his doorway below shuts)
    goto(LUNA, 14, 15), goto(LUNA, 8, 13),
    goto(LUNA, 1, 11), goto(LUNA, 8, 9),
    goto(SOL, 24, 9), goto(SOL, 25, 7),
    press(SOL, 23, 5),                       // pink plate: Luna's gate
    goto(LUNA, 17, 5), goto(LUNA, 12, 6), grab(LUNA, 4, 4),
    door(LUNA),
    goto(SOL, 28, 6), grab(SOL, 35, 4),
    door(SOL), win(),
  ],
};

SCRIPTS[24] = () => [
  // lever indexes in map order: 0 G (green), 1 P (purple), 2 W (white)
  grab(LUNA, 4, 13), goto(LUNA, 11, 4),             // Luna's look down the ladder, back to the deck
  grab(SOL, 2, 2), grab(SOL, 1, 11), grab(SOL, 1, 26), goto(SOL, 7, 27),
  flip(LUNA, 9, 4, false),                          // P off: GA opens
  goto(SOL, 12, 26),
  flip(LUNA, 7, 4, true, { keep: [0] }),            // G on: first bridge
  goto(SOL, 17, 26),
  flip(LUNA, 7, 4, false, { keep: [0] }),           // G off: second bridge
  goto(SOL, 26, 26),
  grab(SOL, 29, 24, K), press(SOL, 30, 28, K),      // Sol stands in the orange socket: GB opens
  goto(LUNA, 17, 5), grab(LUNA, 17, 2),             // Luna leaves the deck (G and P go back on behind her)
  goto(SOL, 34, 27),                                // out of the socket and right through W: first white bridge
  goto(LUNA, 24, 4),
  flip(SOL, 33, 27, false),                         // W off: the second bridge
  goto(LUNA, 30, 5),
  pushTo(LUNA, 0, 36, { y: 27, tol: 0.6 }),         // the crate goes down the shaft onto the lift
  pushTo(SOL, 0, 30, { y: 28, tol: 1 }),            // into the orange socket: the entry gate opens
  press(SOL, 27, 27), waitPlat(36, 28),             // the lift rises
  goto(LUNA, 34, 11), grab(LUNA, 34, 7), goto(LUNA, 33, 11),   // Luna rides it up (she followed the crate down) and steps onto the landing
  goto(SOL, 32, 27), waitPlat(36, 28, false), goto(SOL, 37, 27),
  press(LUNA, 35, 11), waitPlat(36, 28),            // Luna sends Sol up
  goto(SOL, 30, 11), goto(LUNA, 28, 11),
  grab(SOL, 13, 9), goto(SOL, 9, 21),               // west along the inner top band and down the ladder
  grab(LUNA, 8, 15), grab(LUNA, 7, 19), goto(LUNA, 11, 21),
  press(LUNA, 12, 21),                              // airlock: Luna holds the near plate
  goto(SOL, 18, 21),
  goto(LUNA, 10, 21),                               // she lets go: gate one shuts, gate two opens
  press(SOL, 25, 20),                               // Sol holds the far plate
  goto(LUNA, 18, 21),
  goto(SOL, 28, 20),                                // he lets go: Luna walks out
  goto(LUNA, 23, 21), press(LUNA, 25, 20),          // Luna holds the far plate: the chamber door opens
  grab(SOL, 31, 15), goto(SOL, 24, 16),
  flip(SOL, 14, 16, true),                          // the pink lever keeps it open
  goto(LUNA, 28, 20), grab(LUNA, 24, 13),
  door(SOL), door(LUNA), win(),
];

SCRIPTS[25] = () => [
  // crates in map order: 0 on the raised floor, 1 by the lift
  grab(SOL, 1, 24),
  pushTo(SOL, 1, 5, { y: 27 }), goto(SOL, 7, 27),   // first crate onto the lift, Sol with it
  press(LUNA, 16, 26), waitPlat(4, 28),             // Luna sends them up
  pushTo(SOL, 1, 11, { y: 20 }), grab(SOL, 3, 17), goto(SOL, 10, 20),
  grab(LUNA, 36, 23), waitPlat(4, 28, false),       // she steps off: the lift sinks
  pushTo(LUNA, 0, 5, { y: 27 }), goto(LUNA, 7, 27),
  press(SOL, 9, 20), waitPlat(4, 28),               // Sol brings her and the second crate up
  pushTo(LUNA, 0, 1, { y: 21, tol: 0.8 }), goto(LUNA, 3, 20),   // west off the lift into the socket over hatch B
  goto(SOL, 10, 20),
  press(LUNA, 13, 20),                              // airlock: Luna holds the near plate
  pushTo(SOL, 1, 18, { y: 20 }),
  goto(LUNA, 11, 20),                               // she lets go: gate two opens
  pushTo(SOL, 1, 29, { y: 20, tol: 0.6 }),          // against the high ledge, onto hatch A
  press(SOL, 27, 20),                               // Sol holds the far plate
  goto(LUNA, 18, 20), grab(LUNA, 18, 16),
  goto(SOL, 26, 20),                                // he lets go: gate two opens
  goto(SOL, 31, 16), goto(SOL, 32, 14), grab(SOL, 37, 15), goto(SOL, 32, 14), goto(SOL, 29, 12),   // up the crate, the ledge, into the upper hall
  goto(LUNA, 31, 16), goto(LUNA, 32, 14), goto(LUNA, 28, 12),
  grab(LUNA, 37, 9), grab(LUNA, 37, 6),
  grab(SOL, 14, 9), grab(SOL, 6, 9),
  flip(SOL, 2, 11),                                 // green: both hatches sink, the keys drop onto their plates
  grab(LUNA, 8, 9, K),
  press(LUNA, 35, 10, K),                           // Luna holds purple out on the gallery: ledge B rises
  goto(SOL, 19, 10, K), goto(SOL, 22, 8, K), goto(SOL, 17, 6, K),
  flip(SOL, 5, 6, true),                            // out to the crown's west end and back: B stays up
  goto(LUNA, 19, 10), goto(LUNA, 22, 8), goto(LUNA, 23, 6),
  grab(LUNA, 5, 4), grab(SOL, 27, 3),
  door(LUNA), door(SOL), win(),
];

// Tidelock. Levers in map order: 0 purple (W arm), 1 green (E arm), 2 white latch, 3 pink latch.
// Lock codes: S both off, W both on, N purple off + green on, E purple on + green off.
const A0 = { keep: [0] }, B1 = { keep: [1] };
// An operator phase that must also end up standing in the control room (not down the lift shaft).
const inHub = (ph) => { const g = ph.goal; ph.goal = (S, p) => g(S, p) && bot(p) < 18.5 && cx(p) > 9 && cx(p) < 30; ph.sig += '|hub'; return ph; };
const opFlip = (O, x, on, o) => inHub(flip(O, x, 17, on, o));
const ring = (R, O, latch, g) => [
  goto(R, 12, 27), ...g.sw, goto(R, 3, 16, K),       // into the SW basin (S open) and up to the W lock
  opFlip(O, 14, true, A0), opFlip(O, 25, true, B1),       // W: both on
  goto(R, 8, 16, K),                                  // through the W lock onto the tide lift
  press(O, 24, 17, K), waitPlat(7, 17),               // the operator raises the tide
  goto(R, 4, 11, K), inHub(grab(O, ...g.perch, K)), goto(O, 21, 17, K),
  ...g.nw, goto(R, 11, 2, K),                         // up the NW basin to the top corridor
  opFlip(O, 14, false, A0),                           // N: the bridge over the top
  goto(R, 30, 3, K), ...g.ne, goto(R, 31, 16, K),     // across, down the NE basin
  opFlip(O, 14, true, A0), opFlip(O, 25, false, B1),      // E
  goto(R, 37, 16, K), ...g.se, goto(R, 34, 20, K),    // through the E lock, through the SE basin
  opFlip(O, 14, false, A0),                           // S again
  goto(R, 27, 20, K), latch, goto(R, 27, 27),         // latch hall, latch, chute
];
SCRIPTS[26] = () => [
  goto(LUNA, 17, 27), press(SOL, 25, 27), waitPlat(16, 28), goto(LUNA, 20, 17),   // Sol sends Luna up
  ring(SOL, LUNA, flip(SOL, 21, 20, true), { sw: [grab(SOL, 11, 20, K)], nw: [grab(SOL, 11, 11, K), grab(SOL, 1, 2, K)], ne: [], se: [grab(SOL, 32, 26, K)], perch: [21, 9] }),
  goto(SOL, 17, 27), press(LUNA, 22, 17, K), waitPlat(16, 28), goto(SOL, 20, 17, K),     // Luna lifts Sol up
  mv(LUNA, 17.5), waitPlat(16, 28, false), goto(LUNA, 21, 27),                     // and drops down the shaft
  ring(LUNA, SOL, flip(LUNA, 21, 23, true), { sw: [grab(LUNA, 3, 26, K)], nw: [], ne: [grab(LUNA, 38, 2, K), grab(LUNA, 28, 11, K)], se: [grab(LUNA, 30, 26, K)], perch: [18, 9] }),
  goto(LUNA, 17, 27), press(SOL, 22, 17, K), waitPlat(16, 28), goto(LUNA, 20, 17),
  door(SOL), door(LUNA), win(),
];

// Leapfrog Spire. Sol's lifts [x0, rest floor] and the plate on Luna's side that works each one;
// Luna's lifts and the plate on Sol's side.
const SOLL = [[13, 28, 30, 26], [1, 24, 31, 22], [13, 20, 31, 18], [1, 16, 29, 14], [13, 12, 29, 10]];
const LUNL = [[24, 26, 8, 23], [35, 22, 8, 19], [24, 18, 8, 15], [31, 14, 8, 11], [24, 10, 8, 7]];
const onLift = (p, x0, f, w = 3) => p.gr && cx(p) > x0 + 0.45 && cx(p) < x0 + w - 0.45 && Math.abs(bot(p) - f) < 0.3;
const boardWithCrate = (x0, f) => seek(LUNA, `luna and crate onto lift ${x0},${f}`,
  (S, p) => onLift(p, x0, f, 4) && S.b[0].gr && cx(S.b[0]) > x0 + 1.65 && cx(S.b[0]) < x0 + 2.35 && Math.abs(bot(S.b[0]) - f) < 0.3,
  { key: `w4c${x0},${f}`, h: (S, p) => Math.abs(cx(S.b[0]) - (x0 + 2)) * 13 + Math.abs(cx(p) - (x0 + 2)) * 7 + Math.abs(bot(p) - f) * 4 });
const board = (who, x0, f) => seek(who, `${who ? 'luna' : 'sol'} onto lift ${x0},${f}`, (S, p) => onLift(p, x0, f),
  { key: `${x0},${f}`, h: (S, p) => Math.abs(cx(p) - (x0 + 1.5)) * 7 + Math.abs(bot(p) - f) * 4 });
// per climb step, gems each player takes while the other holds a plate or waits
const K2 = { keep: [1] };   // only the yellow lever may change
const SOLGEMS = [[[1, 25]], [[12, 21]], [], [[4, 13]], [], []];
const LUNGEMS = [[[26, 19]], [], [[38, 12]], [], []];
SCRIPTS[27] = () => {
  const crateTo = (j) => { const [lx, lf] = LUNL[j]; return pushTo(LUNA, 0, lx + 1.5, { y: lf - 1, tol: 0.3 }); };
  const ph = [grab(SOL, 1, 25), grab(LUNA, 38, 24), crateTo(0)];
  for (let i = 0; i < 5; i++) {
    const [sx, sf, px, py] = SOLL[i];
    ph.push(board(SOL, sx, sf), mv(LUNA, px + 0.5, 0.1), press(LUNA, px, py), waitPlat(sx + 1, sf), board(SOL, 10, sf - 4));
    for (const [x, y] of SOLGEMS[i + 1]) ph.push(grab(SOL, x, y));
    const [lx, lf, qx, qy] = LUNL[i];
    ph.push(boardWithCrate(lx, lf), press(SOL, qx, qy), waitPlat(lx + 1, lf));
    for (const [x, y] of LUNGEMS[i]) ph.push(grab(LUNA, x, y));
    if (i < 4) ph.push(crateTo(i + 1));
  }
  ph.push(pushTo(LUNA, 0, 30, { y: 5, tol: 1.5 }), grab(SOL, 5, 5), board(SOL, 1, 8),
    seek(LUNA, 'luna sends the crate down the chute', (S, p) => bot(S.b[0]) > 10.5 && cx(S.b[0]) > 37 && bot(p) < 6.5,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 37.9) * 13 + Math.abs(bot(S.b[0]) - 11) * 3 }),
    waitPlat(2, 8), grab(LUNA, 11, 2), flip(LUNA, 37, 2, true),
    flip(SOL, 2, 3, true, K2), grab(SOL, 35, 4, K), waitPlat(19, 5), waitPlat(19, 16),
    grab(LUNA, 18, 8, K), grab(LUNA, 18, 22, K), grab(SOL, 22, 14, K), door(SOL, K), door(LUNA, K), win());
  return ph;
};
