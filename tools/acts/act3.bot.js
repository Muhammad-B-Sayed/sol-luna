// Bot scripts for this act. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

const K = { keep: true };   // a route that may not undo any lever

export const SCRIPTS = {
  // Eclipse
  23: () => [
    // 0. both drop down their own wing to the bottom
    goto(SOL, 16, 9), goto(SOL, 13, 13), goto(SOL, 5, 20), goto(SOL, 4, 28), grab(SOL, 3, 23),
    grab(LUNA, 23, 9), goto(LUNA, 24, 13), goto(LUNA, 28, 20), goto(LUNA, 34, 20), goto(LUNA, 35, 27), grab(LUNA, 36, 23),
    press(SOL, 9, 27),                       // 1. purple plate: Luna's gate G opens
    flip(LUNA, 27, 27, false),               // 2. Luna through G and west through her green lever
    grab(LUNA, 26, 22, K), goto(LUNA, 24, 24, K), goto(LUNA, 22, 21, K), goto(LUNA, 21, 20, K),   // up her riser
    goto(SOL, 11, 27), flip(SOL, 12, 27),    // 3. Sol through H and east through his purple lever
    grab(SOL, 13, 22, K), goto(SOL, 15, 24, K), goto(SOL, 17, 21, K), goto(SOL, 18, 20, K),   // up his riser
    goto(SOL, 30, 20, K), grab(SOL, 30, 16, K),   // 4. through the tunnel
    goto(LUNA, 9, 20, K), grab(LUNA, 9, 16, K),
    goto(SOL, 26, 27, K), goto(SOL, 34, 27, K), goto(SOL, 36, 27, K),   // 5. down Luna's floors to her lift
    flip(LUNA, 12, 27, false),   // Luna turns purple off on the way down
    press(LUNA, 5, 27, K), waitPlat(35, 28),   // 6. Luna holds yellow: Sol's lift rises, hers sinks
    seek(SOL, 'crate in the socket, Sol east of it', (S, p) => S.b[0].gr && Math.abs(cx(S.b[0]) - 30.6) < 0.5 && bot(S.b[0]) > 14.5 && p.gr && cx(p) > 32.2 && bot(p) < 14.5,
      { key: 'socket23', keep: true, h: (S, p) => Math.abs(cx(S.b[0]) - 30.6) * 13 + Math.abs(cx(p) - cx(S.b[0])) * 3 }),   // the crate into the white socket
    goto(SOL, 38, 11, K), grab(SOL, 37, 6, K), goto(SOL, 34, 9, K), press(SOL, 34, 9, K),   // up to his top corridor
    goto(LUNA, 3, 27, K),                    // 7. Luna steps onto her sunken lift
    goto(SOL, 30, 9, K), waitPlat(2, 14, false),   // Sol lets go: she rides up
    goto(LUNA, 1, 11, K), grab(LUNA, 2, 6, K), goto(LUNA, 5, 9, K),
    flip(LUNA, 9, 9),                        // 8. through her moon pocket to the orange lever
    goto(SOL, 26, 9, K), goto(SOL, 24, 9, K), grab(SOL, 16, 9, K), goto(SOL, 23, 13, K), goto(SOL, 26, 20, K),   // 9. over the orange bridge and down
    flip(SOL, 27, 27, true),                 // east through the green lever: Luna's door lock opens; G is shut
    goto(SOL, 24, 24, K), goto(SOL, 22, 21, K), goto(SOL, 30, 20, K), goto(SOL, 36, 27, K),   // back up, and down the shaft to his lift
    goto(LUNA, 5, 9, K), goto(LUNA, 7, 13, K), goto(LUNA, 5, 20, K),   // 10. Luna back down
    press(LUNA, 5, 27, K), waitPlat(35, 28),   // pump two: she sends him up
    goto(SOL, 38, 11, K), goto(SOL, 34, 9, K), press(SOL, 34, 9, K),
    goto(LUNA, 3, 27, K),
    goto(SOL, 30, 9, K), waitPlat(2, 14, false),   // he sends her up
    goto(SOL, 26, 9, K), press(SOL, 23, 6, K),   // 11. Sol up through the drop hole onto the pink plate
    goto(LUNA, 1, 11, K), goto(LUNA, 5, 9, K), goto(LUNA, 13, 9, K), press(LUNA, 12, 6, K),   // through K and up to the roof
    door(SOL, K),                            // 12. Luna holds purple: Sol's door lock opens
    door(LUNA, K), win(),
  ],
};

const K2W = { keep: [3] };   // only the white lever may change
// Walk along a low corridor in steps of 2 cells, so the bot never makes a long hop under its roof.
const walk = (who, x0, x1, y, o) => { const out = [], d = x1 > x0 ? 2 : -2; for (let x = x0; d > 0 ? x <= x1 : x >= x1; x += d) out.push(goto(who, x, y, o)); return out; };
SCRIPTS[24] = () => [
  // lever indexes in map order: 0 G (green), 1 P (purple), 2 W (white)
  grab(LUNA, 4, 13), goto(LUNA, 11, 6),             // Luna's look down the ladder, back to the deck
  grab(SOL, 2, 2), grab(SOL, 1, 11), grab(SOL, 1, 26), goto(SOL, 5, 26), goto(SOL, 7, 27),
  flip(LUNA, 9, 6, false),                          // P off: GA opens
  goto(SOL, 12, 26),
  flip(LUNA, 7, 6, true, { keep: [0] }),            // G on: first bridge
  goto(SOL, 17, 26),
  flip(LUNA, 7, 6, false, { keep: [0] }),           // G off: second bridge
  goto(SOL, 26, 26), goto(SOL, 28, 27, K),
  grab(SOL, 29, 24, K), press(SOL, 30, 28, K),      // Sol stands in the orange socket: GB opens
  goto(LUNA, 17, 5), grab(LUNA, 17, 2),             // Luna leaves the deck (G and P go back on behind her)
  flip(SOL, 33, 27, true, K2W),                     // out of the socket and right through W: first white bridge
  goto(LUNA, 24, 5),
  flip(SOL, 33, 27, false),                         // W off: the second bridge
  goto(LUNA, 30, 5),
  seek(LUNA, 'crate down the shaft onto the lift, Luna stays up', (S, p) => S.b[0].gr && cx(S.b[0]) > 36.3 && cx(S.b[0]) < 37.7 && bot(S.b[0]) > 27.5 && p.gr && bot(p) < 7,
    { key: 'crate24', h: (S, p) => Math.abs(cx(S.b[0]) - 37) * 13 + Math.abs(cx(p) - cx(S.b[0])) * 3 }),   // the crate goes down the shaft onto the lift
  pushTo(SOL, 0, 30, { y: 28, tol: 1 }),            // into the orange socket: the entry gate opens
  press(SOL, 27, 27), waitPlat(36, 28),             // the lift rises
  goto(LUNA, 34, 11), grab(LUNA, 34, 7), goto(LUNA, 33, 11),   // Luna rides it up (she followed the crate down) and steps onto the landing
  goto(SOL, 32, 27), waitPlat(36, 28, false), goto(SOL, 37, 27),
  press(LUNA, 35, 11), waitPlat(36, 28),            // Luna sends Sol up
  goto(SOL, 30, 11), goto(LUNA, 28, 11),
  ...walk(SOL, 28, 23, 11), ...walk(SOL, 18, 12, 11), grab(SOL, 13, 7), goto(SOL, 11, 18), goto(SOL, 9, 21),               // west along the inner top band and down the ladder
  ...walk(LUNA, 26, 23, 11), ...walk(LUNA, 18, 12, 11), goto(LUNA, 11, 18), grab(LUNA, 10, 18), grab(LUNA, 8, 15), goto(LUNA, 11, 21),
  press(LUNA, 12, 21),                              // airlock: Luna holds the near plate
  goto(SOL, 18, 21),
  goto(LUNA, 10, 21),                               // she lets go: gate one shuts, gate two opens
  press(SOL, 25, 20),                               // Sol holds the far plate
  goto(LUNA, 18, 21),
  goto(SOL, 28, 20),                                // he lets go: Luna walks out
  goto(LUNA, 23, 21), press(LUNA, 25, 20),          // Luna holds the far plate: the chamber door opens
  grab(SOL, 31, 15), goto(SOL, 24, 16), goto(SOL, 22, 16), goto(SOL, 20, 16), goto(SOL, 18, 16), goto(SOL, 16, 16), goto(SOL, 15, 16), goto(SOL, 13, 16),
  flip(SOL, 14, 16, true),                          // the pink lever keeps it open
  goto(LUNA, 28, 20), grab(LUNA, 24, 13),
  goto(SOL, 16, 16), door(SOL), goto(LUNA, 22, 16), door(LUNA), win(),
];

SCRIPTS[25] = () => [
  // crates in map order: 0 by the lift, 1 further east
  grab(SOL, 8, 23),
  pushTo(SOL, 0, 5, { y: 27 }), goto(SOL, 6, 27, { tol: 0.15 }),   // first crate onto the lift, Sol with it
  press(LUNA, 16, 27), waitPlat(4, 28),             // Luna sends them up
  pushTo(SOL, 0, 11, { y: 20 }), grab(SOL, 3, 16), goto(SOL, 10, 20),
  goto(LUNA, 30, 27), ...walk(LUNA, 32, 36, 26), grab(LUNA, 36, 25), ...walk(LUNA, 34, 32, 26), goto(LUNA, 30, 27), waitPlat(4, 28, false),       // she steps off: the lift sinks
  pushTo(LUNA, 1, 5, { y: 27 }), goto(LUNA, 6, 27, { tol: 0.15 }),
  press(SOL, 9, 20), waitPlat(4, 28),               // Sol brings her and the second crate up
  pushTo(LUNA, 1, 1, { y: 21, tol: 0.8 }), goto(LUNA, 3, 20),   // west off the lift into the socket over hatch B
  goto(SOL, 10, 20),
  press(LUNA, 13, 20),                              // airlock: Luna holds the near plate
  pushTo(SOL, 0, 18, { y: 20 }),
  goto(LUNA, 11, 20),                               // she lets go: gate two opens
  pushTo(SOL, 0, 29, { y: 20, tol: 0.6 }),          // against the high ledge, onto hatch A
  press(SOL, 27, 20),                               // Sol holds the far plate
  goto(LUNA, 18, 20), grab(LUNA, 18, 16),
  goto(SOL, 26, 20),                                // he lets go: gate two opens
  goto(SOL, 29, 19), goto(SOL, 31, 15), goto(SOL, 28, 13),   // up the crate (a climb of 4), the ledge, into the upper hall
  goto(LUNA, 29, 19), goto(LUNA, 31, 15), goto(LUNA, 28, 13),
  goto(LUNA, 35, 13), goto(LUNA, 36, 10), grab(LUNA, 37, 5),   // a leap of 5 over the hole to the east gallery, its perch
  goto(SOL, 15, 13), grab(SOL, 14, 9), goto(SOL, 8, 13), goto(SOL, 6, 12), grab(SOL, 6, 10), goto(SOL, 4, 12),
  flip(SOL, 2, 12), goto(SOL, 6, 12, K), goto(SOL, 8, 13, K),                                 // green: both hatches sink, the keys drop onto their plates
  goto(LUNA, 10, 13, K), grab(LUNA, 8, 9, K),
  press(LUNA, 35, 13, K),                           // Luna holds purple out on the gallery: ledge B rises
  goto(SOL, 17, 13, K), goto(SOL, 18, 11, K), goto(SOL, 21, 8, K), goto(SOL, 17, 6, K),
  flip(SOL, 5, 6, true),                            // out to the crown's west end and back: B stays up
  goto(LUNA, 28, 13), ...walk(LUNA, 26, 22, 13), goto(LUNA, 21, 13), goto(LUNA, 19, 13), goto(LUNA, 18, 11), goto(LUNA, 21, 8), goto(LUNA, 22, 6), goto(LUNA, 23, 6),
  grab(LUNA, 5, 2), grab(SOL, 27, 2),
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

// Leapfrog Spire. Two lift stairs (Sol west, Luna east), each lift worked from the other side;
// the crate rides Luna's lifts and ends in the green socket under the chute; then the core descent.
const onLift = (p, x0, f, w = 3) => p.gr && cx(p) > x0 + 0.45 && cx(p) < x0 + w - 0.45 && Math.abs(bot(p) - f) < 0.3;
const board = (who, x0, f, w = 3) => seek(who, `${who ? 'luna' : 'sol'} onto lift ${x0},${f}`, (S, p) => onLift(p, x0, f, w),
  { key: `lf${x0},${f},${w}`, h: (S, p) => Math.abs(cx(p) - (x0 + w / 2)) * 7 + Math.abs(bot(p) - f) * 4 });
// Luna on a 4-wide lift with the crate on it, crate centre at cc, Luna on the side `side` (-1 west, 1 east) of it.
const rideWithCrate = (x0, f, cc, side) => seek(LUNA, `luna and crate on lift ${x0},${f}`,
  (S, p) => onLift(p, x0, f, 4) && S.b[0].gr && Math.abs(cx(S.b[0]) - cc) < 0.3 && Math.abs(bot(S.b[0]) - f) < 0.3 && (cx(p) - cx(S.b[0])) * side > 0.9,
  { key: `lfc${x0},${f},${cc},${side}`, h: (S, p) => Math.abs(cx(S.b[0]) - cc) * 13 + Math.abs(cx(p) - (cc + side * 1.2)) * 5 });
SCRIPTS[27] = () => [
  // 0. split start: yellow gates, each opened from the other side
  press(SOL, 4, 27), pushTo(LUNA, 0, 32, { y: 26, tol: 0.25 }), press(LUNA, 30, 26),   // she shoves the crate through her gate
  goto(SOL, 12, 27), board(SOL, 13, 28),
  // 1. Luna: crate onto E1, hop over it in the open shaft, purple for Sol's W1
  rideWithCrate(33, 27, 35.5, -1), grab(LUNA, 37, 26), press(LUNA, 38, 26), waitPlat(13, 28),
  goto(SOL, 12, 21),
  rideWithCrate(33, 27, 34.0, 1),
  // 2. Sol holds orange: E1 takes Luna and the crate up to floor 21
  press(SOL, 11, 21), waitPlat(33, 27),
  rideWithCrate(27, 21, 28.0, 1),                    // the crate west onto E2
  goto(SOL, 12, 21), waitPlat(33, 27, false),        // Sol lets go: E1 sinks
  // 3. green twice: Sol's gate, then W2
  press(LUNA, 32, 20), ...walk(SOL, 10, 6, 21), goto(LUNA, 31, 20), goto(LUNA, 30, 20),   // low rooms: walk, never hop
  ...walk(SOL, 4, 2, 21), grab(SOL, 1, 21), goto(SOL, 3, 21), goto(SOL, 4, 21), press(LUNA, 32, 20), waitPlat(3, 22),
  goto(SOL, 3, 15), goto(SOL, 2, 15), grab(SOL, 1, 15), ...walk(SOL, 3, 5, 15), goto(SOL, 6, 15), rideWithCrate(27, 21, 28.0, 1),
  // 4. Sol holds white: E2 takes Luna and the crate to floor 15; she hops west over it and pushes it to E3
  press(SOL, 7, 15), waitPlat(27, 21),
  grab(LUNA, 25, 14), pushTo(LUNA, 0, 36, { y: 14, tol: 0.5 }), goto(LUNA, 34, 14),
  goto(SOL, 8, 15), waitPlat(27, 21, false),
  // 5. purple twice: Sol's gate, then W3
  press(LUNA, 31, 14), ...walk(SOL, 10, 12, 15), goto(LUNA, 33, 14), waitPlat(13, 16, false),
  goto(SOL, 13, 15), goto(SOL, 14, 15), press(LUNA, 31, 14), waitPlat(13, 16), goto(SOL, 11, 9), goto(LUNA, 34, 14),
  // 6. Sol locks E3 up with the orange lever and steps onto W4
  flip(SOL, 2, 9, true), board(SOL, 3, 10), waitPlat(33, 15),
  // 7. the crate down the chute onto the green socket: W4 takes Sol up
  seek(LUNA, 'crate down the chute onto the socket', (S, p) => S.b[0].gr && cx(S.b[0]) > 37 && Math.abs(bot(S.b[0]) - 14) < 0.3 && p.gr && bot(p) < 9.5,
    { key: 'chute27b', h: (S, p) => Math.abs(cx(S.b[0]) - 38) * 13 + Math.abs(bot(S.b[0]) - 14) * 3 + Math.abs(cx(p) - cx(S.b[0])) * 3 }),
  press(LUNA, 31, 8, K), waitPlat(3, 10),             // Luna holds yellow on floor 9: Sol's floor gate on the top sinks
  // 8. Sol holds white at the top: E4 brings Luna up
  goto(SOL, 2, 3, K), grab(SOL, 1, 3, K), ...walk(SOL, 3, 13, 3, K), board(LUNA, 27, 9, 4), ...walk(SOL, 15, 25, 3, K), press(SOL, 25, 3, K), waitPlat(27, 9),
  ...walk(LUNA, 30, 36, 3, K), grab(LUNA, 38, 3, K), ...walk(LUNA, 36, 24, 3, K), goto(LUNA, 23, 3, K),   // back west over E4 while Sol still holds it up
  // 9. the core: Luna holds pink, Sol rides D1 down, gem, onto the counterweight D2
  ...walk(SOL, 23, 19, 3, K), goto(SOL, 18, 3, K), ...walk(LUNA, 21, 15, 3, K), press(LUNA, 13, 3, K), waitPlat(17, 4),
  grab(SOL, 23, 11, K), board(SOL, 21, 16), goto(LUNA, 15, 3, K), grab(SOL, 19, 19, K), waitPlat(21, 28, false),   // step off the sinking counterweight into a niche
  press(SOL, 20, 27, K), waitPlat(21, 28),
  goto(LUNA, 18, 15, K), grab(LUNA, 20, 8, K), board(LUNA, 21, 16),
  goto(SOL, 19, 27, K), door(SOL, K), grab(LUNA, 19, 22, K), door(LUNA, K), win(),
];
