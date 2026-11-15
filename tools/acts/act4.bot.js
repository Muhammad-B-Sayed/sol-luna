// Bot scripts for this act file. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

export const SCRIPTS = {
  // High Noon: west (counterweights), bottom (the pit), east (the lake), top (the far plate).
  16: () => [
    press(SOL, 24, 20),                             // P1: GW opens
    goto(LUNA, 3, 21),                              // Luna runs to the far end of the west floor
    flip(LUNA, 5, 20),                              // and back east through L1: GW stays open
    goto(LUNA, 10, 20),                             // onto WA
    press(SOL, 23, 20), waitPlat(9, 21),            // Sol holds P2a: WA lifts Luna, WB comes down
    grab(LUNA, 7, 13), press(LUNA, 6, 15),          // Luna holds P2b on the mid ledge
    goto(SOL, 3, 20, { keep: true }),               // Sol runs onto WB
    goto(LUNA, 8, 15), waitPlat(2, 12, false),      // Luna steps off: WB carries Sol into the attic
    flip(SOL, 14, 11),                              // L6: the hatch swings up, the pit is open
    grab(SOL, 16, 15),
    grab(LUNA, 6, 25, { keep: true }), grab(LUNA, 24, 23, { keep: true }),
    press(LUNA, 16, 26),                            // Luna holds P3 on the pit floor: GE opens
    flip(SOL, 27, 20),                              // Sol walks in through L3: GE stays open
    pushTo(SOL, 0, 31, { y: 23, tol: 0.6 }),        // the crate off the corridor's end, into the lake
    goto(SOL, 36, 20),                              // over the crate to the far shore
    grab(SOL, 38, 16),
    flip(SOL, 28, 14, false),                       // up the tower, over P4, left through L5: the pit floor rises
    waitPlat(15, 27),
    goto(SOL, 20, 20, { keep: true }),              // Sol drops into the hub onto T
    goto(LUNA, 27, 20, { keep: true }),             // swap: Luna through GE
    goto(LUNA, 36, 20, { keep: true }),             // over the crate
    press(LUNA, 32, 14, { keep: true }), waitPlat(19, 21),   // up the tower to P4: T carries Sol to the junction
    goto(SOL, 18, 5),
    goto(LUNA, 30, 14, { keep: true }), waitPlat(19, 21, false),   // Luna steps off P4: T comes back down
    goto(LUNA, 20, 20, { keep: true }),             // she crawls left over L5 (it stays off) and drops onto T
    press(SOL, 17, 5), waitPlat(19, 21),            // Sol holds P4b: T carries Luna up
    goto(LUNA, 24, 4),
    grab(SOL, 16, 1), grab(SOL, 6, 5), door(SOL),
    grab(LUNA, 32, 1), door(LUNA), win(),
  ],
  // Shade Garden: leapfrog up the braid, one hopping while the other raises the stones.
  17: () => [
    press(LUNA, 36, 24),                            // P0: S1 rises
    grab(SOL, 5, 22), press(SOL, 8, 25),            // Sol hops S1, holds P1: L1 rises
    grab(LUNA, 33, 21), press(LUNA, 30, 24),        // Luna hops L1, holds P2: S2 rises
    press(SOL, 15, 26),                             // Sol hops S2, holds P3: L2 rises
    goto(LUNA, 20, 25),                             // Luna hops L2 into C1, onto its lift
    press(SOL, 17, 25), waitPlat(19, 26),           // Sol holds the C1 plate: the lift carries Luna up
    grab(LUNA, 23, 17), goto(LUNA, 17, 20, { tol: 0.1 }),
    goto(SOL, 16, 25, { tol: 0.1 }), waitPlat(19, 26, false),     // Sol steps off: the lift comes back down
    goto(SOL, 20, 25), press(LUNA, 16, 20), waitPlat(19, 26),   // Sol onto the lift, Luna holds the top plate: up
    grab(SOL, 20, 18),
    press(SOL, 26, 19),                             // out right through the sun channel; P4: L3 rises
    press(LUNA, 7, 19),                             // out left through the moon channel, hop L3; P5: S3 rises
    goto(SOL, 34, 19),                              // Sol hops S3 onto the east lift
    press(LUNA, 2, 20), waitPlat(33, 20),           // Luna holds Q1: it carries him up
    goto(SOL, 37, 13, { tol: 0.1 }),                // he steps off onto the high ledge; the lift goes back down
    goto(LUNA, 1, 20, { tol: 0.2 }), waitPlat(4, 21, false), waitPlat(33, 20, false),   // Luna steps off Q1: both lifts come down
    goto(LUNA, 5, 20),                              // Luna onto the west lift
    grab(SOL, 37, 10),
    press(SOL, 36, 13), waitPlat(4, 21),            // Sol holds Q2: it carries her up
    grab(LUNA, 5, 11), goto(LUNA, 8, 14),
    press(SOL, 31, 12),                             // P6: L4 rises
    flip(LUNA, 14, 14),                             // Luna hops L4, K7: S4 rises for good
    grab(LUNA, 23, 12), goto(LUNA, 17, 14),         // onto C2's lift
    press(SOL, 22, 13), waitPlat(16, 15),           // Sol hops S4 into C2 and holds its plate: Luna rides up
    goto(LUNA, 22, 5),
    goto(SOL, 17, 14), press(LUNA, 21, 5), waitPlat(16, 15),    // Sol onto the lift, Luna holds the top plate: up
    grab(SOL, 23, 4), goto(SOL, 15, 6),             // a hop to the high ledge for a gem, then out left into the sun channel
    flip(LUNA, 25, 5),                              // out right through the moon channel; K8: S5 rises
    press(SOL, 8, 5),                               // hop S5, P9: L5 rises
    flip(LUNA, 32, 5),                              // hop L5, K10: S6 rises
    grab(SOL, 4, 2), press(SOL, 2, 5),              // hop S6, P11: L6 rises
    grab(LUNA, 35, 1), goto(LUNA, 34, 19),          // Luna hops L6 and drops down Sol's shaft onto the east lift
    press(SOL, 2, 20), waitPlat(33, 20),            // Sol drops down Luna's shaft and holds Q1: she rides up
    goto(LUNA, 37, 13, { tol: 0.6 }),               // to her door on the high ledge
    goto(SOL, 5, 20), waitPlat(33, 20, false),      // Sol onto the west lift
    press(LUNA, 36, 13), waitPlat(4, 21),           // Luna holds Q2: he rides up
    door(SOL), door(LUNA), win(),
  ],
  // The Vault: three corner rooms each open one hatch over the vault; each crate has two jobs.
  28: () => [
    press(SOL, 8, 26), waitPlat(1, 9),              // Sol holds P_W: W comes down
    goto(LUNA, 2, 26),                              // Luna onto W
    goto(SOL, 6, 26), waitPlat(1, 9, false),        // Sol lets go: W carries her up into the cell
    grab(LUNA, 1, 5),
    press(LUNA, 4, 8),                              // P_Bot: G_Bot opens
    grab(SOL, 12, 20), grab(SOL, 26, 22),
    press(SOL, 30, 26),                             // Sol runs the bottom band and holds P_A: G_A opens
    pushTo(LUNA, 0, 9, { y: 8 }),                   // crate A out of the cell
    flip(LUNA, 10, 4),                              // from the crate to the high ledge, through L1: H1 opens
    grab(LUNA, 12, 2),
    pushTo(LUNA, 0, 12, { y: 8 }),                  // crate A to G_Top
    press(SOL, 31, 22),                             // up to the first ledge, P_Top: G_Top opens
    pushTo(LUNA, 0, 19, { y: 10, tol: 0.6 }),       // crate A into the shaft, onto H2
    grab(LUNA, 22, 4),
    press(SOL, 28, 20),                             // up to the second ledge, P_TR: G_TR opens
    goto(LUNA, 29, 8),
    grab(SOL, 28, 17), flip(SOL, 32, 18),           // to the top of the tower, through L3: H3 opens
    press(LUNA, 28, 8), waitPlat(36, 9),            // Luna holds P_R: R comes down
    seek(SOL, 'crate B wholly on R', (S, p) => S.b[1].gr && cx(S.b[1]) > 36.6 && cx(S.b[1]) < 37.0 && bot(S.b[1]) > 26.5, { key: 'crateOnR', h: (S, p) => Math.abs(cx(S.b[1]) - 36.8) * 13 + Math.abs(cx(p) - cx(S.b[1])) * 3 }),   // Sol pushes crate B onto R
    seek(SOL, 'sol on R east of the crate', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) > 37.4 && bot(p) > 26.5, { key: 'eastR' }),
    goto(LUNA, 30, 8), waitPlat(36, 9, false),      // Luna steps off: R carries Sol and the crate up
    grab(SOL, 37, 2),
    pushTo(SOL, 1, 31, { y: 8, tol: 0.25 }),        // crate B west under the ledge onto P_G: G_G opens
    grab(LUNA, 35, 2), flip(LUNA, 35, 5),           // Luna climbs through G_G, L2: H2 opens, crate A drops into socket X
    seek(SOL, 'crate B into the shaft, Sol stays up', (S, p) => p.gr && bot(p) < 9.5 && S.b[1].gr && bot(S.b[1]) > 20.5, { key: 'Bdown', h: (S, p) => Math.abs(cx(S.b[1]) - 20) * 13 + Math.abs(cx(p) - cx(S.b[1])) * 3 + Math.abs(bot(S.b[1]) - 21) * 4 }),   // crate B off P_G, through G_TR and down the shaft onto crate A
    goto(LUNA, 37, 8),                              // Luna onto R
    press(SOL, 28, 8), waitPlat(36, 9),             // Sol holds P_R: R carries her down
    goto(LUNA, 33, 26), grab(LUNA, 34, 22),         // she steps off
    goto(SOL, 30, 8), waitPlat(36, 9, false),       // Sol lets go: R goes back up
    goto(SOL, 12, 8), grab(SOL, 5, 7),              // Sol back along the top band into the west room
    goto(SOL, 2, 8),                                // onto W, at the top of the west shaft
    press(LUNA, 8, 26), waitPlat(1, 9),             // Luna runs the bottom band home and holds P_W: W brings Sol down
    goto(SOL, 5, 26),                               // he steps off
    goto(LUNA, 12, 20), grab(LUNA, 16, 16), door(LUNA),   // Luna up the start room's climb and in through GX
    goto(SOL, 27, 19), door(SOL), win(),   // Sol along the bottom band, up his tower and in through GY
  ],
};
