// Bot scripts for this act file. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

export const SCRIPTS = {
  // High Noon: west (counterweights), bottom (the pit), east (the lake), top (the far plate).
  16: () => [
    grab(SOL, 24, 16),                              // the nook under the crawlway
    press(SOL, 24, 19),                             // P1: GW opens
    goto(LUNA, 3, 20),                              // Luna runs to the far end of the west floor
    flip(LUNA, 5, 19),                              // and back east through L1: GW stays open
    goto(LUNA, 10, 19),                             // onto WA
    press(SOL, 23, 19), waitPlat(9, 20),            // Sol holds P2a: WA lifts Luna, WB comes down
    grab(LUNA, 5, 12), press(LUNA, 6, 12),          // Luna holds P2b on the mid ledge
    goto(SOL, 3, 19, { keep: true }),               // Sol runs onto WB
    goto(LUNA, 8, 12), waitPlat(2, 8, false),       // Luna steps off: WB carries Sol into the attic
    flip(SOL, 14, 7),                               // L6: the hatch swings up, the pit is open
    grab(SOL, 17, 16),
    grab(LUNA, 5, 23, { keep: true }), grab(LUNA, 25, 23, { keep: true }),
    press(LUNA, 16, 26),                            // Luna holds P3 on the pit floor: GE opens
    flip(SOL, 27, 19),                              // Sol walks in through L3: GE stays open
    pushTo(SOL, 0, 31, { y: 24, tol: 0.6 }),        // the crate off the corridor's end, into the lake
    goto(SOL, 36, 20),                              // down onto the crate, then a climb of 3 to the far shore
    grab(SOL, 38, 12),
    flip(SOL, 28, 14, false),                       // up the tower, over P4, left through L5: the pit floor rises
    waitPlat(15, 27),
    goto(SOL, 20, 19, { keep: true }),              // Sol drops into the hub onto T
    goto(LUNA, 27, 19, { keep: true }),             // swap: Luna through GE
    goto(LUNA, 36, 20, { keep: true }),             // over the crate
    press(LUNA, 32, 14, { keep: true }), waitPlat(19, 20),   // up the tower to P4: T carries Sol to the junction
    goto(SOL, 18, 3),
    goto(LUNA, 30, 14, { keep: true }), waitPlat(19, 20, false),   // Luna steps off P4: T comes back down
    goto(LUNA, 20, 19, { keep: true }),             // she crawls left over L5 (it stays off) and drops onto T
    press(SOL, 17, 3), waitPlat(19, 20),            // Sol holds P4b: T carries Luna up
    goto(LUNA, 24, 3),
    grab(SOL, 11, 1), door(SOL),
    grab(LUNA, 33, 1), door(LUNA), win(),
  ],
  // Shade Garden: leapfrog up the braid, one hopping a tunnel while the other raises its stone.
  17: () => [
    grab(SOL, 2, 22), grab(LUNA, 36, 22),
    press(LUNA, 38, 27),                            // P0: S1 rises
    press(SOL, 9, 27),                              // Sol hops S1 and holds P1: L1 rises
    press(LUNA, 28, 27),                            // Luna hops L1 and holds P2: S2 rises
    goto(SOL, 16, 27),                              // Sol hops S2
    goto(SOL, 17, 27, { tol: 0.08 }),
    press(SOL, 16, 27),                             // and holds P3: L2 rises
    goto(LUNA, 21, 27),                             // Luna hops L2
    goto(SOL, 17, 27, { tol: 0.08 }), waitPlat(18, 28, false),   // Sol steps off: C1 is down
    goto(LUNA, 19, 27),                             // Luna boards C1
    press(SOL, 16, 27), waitPlat(18, 28),           // Sol holds P3: she rides up
    grab(LUNA, 20, 16), goto(LUNA, 15, 20),         // into the moon channel
    goto(SOL, 17, 27, { tol: 0.08 }), waitPlat(18, 28, false),   // Sol steps off, C1 comes down
    grab(SOL, 21, 22), goto(SOL, 21, 27), goto(SOL, 19, 27),
    press(LUNA, 13, 20), waitPlat(18, 28),          // Luna holds P5: Sol rides up; S3 rises too
    press(SOL, 33, 20),                             // Sol hops S3 and holds P4: L3 rises
    goto(LUNA, 6, 20), grab(LUNA, 1, 15),           // Luna hops L3
    grab(SOL, 38, 15), goto(SOL, 37, 20),           // Sol boards the E lift
    press(LUNA, 5, 20), waitPlat(36, 21),           // Luna holds Q1: he rides up
    goto(SOL, 34, 13),
    goto(LUNA, 2, 20), waitPlat(36, 21, false),     // Luna boards the W lift
    press(SOL, 33, 13), waitPlat(1, 21),            // Sol holds Q2: she rides up
    goto(LUNA, 4, 13),
    grab(SOL, 32, 8), press(SOL, 31, 13),           // P6: L4 rises
    goto(LUNA, 11, 13), flip(LUNA, 12, 13),         // Luna hops L4 and walks through K7: S4 up for good
    grab(LUNA, 14, 8),
    goto(SOL, 23, 13), goto(SOL, 21, 13),           // Sol hops S4 into the C2 room
    goto(LUNA, 19, 13),                             // Luna boards C2
    press(SOL, 22, 13), waitPlat(18, 14),           // Sol holds the floor plate: she rides up
    goto(LUNA, 21, 6),
    goto(SOL, 23, 13), waitPlat(18, 14, false),     // Sol steps off, C2 comes down
    goto(SOL, 19, 13),
    press(LUNA, 22, 6), waitPlat(18, 14),           // Luna holds the top plate: he rides up
    goto(SOL, 21, 6), grab(SOL, 21, 2), goto(SOL, 17, 6),
    flip(LUNA, 28, 6),                              // K8: S5 rises for good
    press(SOL, 4, 6),                               // Sol hops S5 and holds P9: L5 rises
    goto(LUNA, 36, 6), grab(LUNA, 38, 1), door(LUNA),   // Luna hops L5 to her door
    door(SOL), win(),
  ],
  // The Vault: three corner rooms each open one hatch over the vault; each crate has two jobs.
  28: () => [
    press(SOL, 8, 26), waitPlat(1, 9),              // Sol holds P_W: W comes down
    goto(LUNA, 2, 26),                              // Luna onto W
    goto(SOL, 5, 26), waitPlat(1, 9, false),        // Sol lets go: W carries her up into the cell
    grab(LUNA, 1, 5),
    press(LUNA, 4, 8),                              // P_Bot: G_Bot opens
    grab(SOL, 12, 20), goto(SOL, 15, 27), grab(SOL, 26, 22),
    press(SOL, 28, 26),                             // Sol runs the bottom band and holds P_A: G_A opens
    pushTo(LUNA, 0, 9, { y: 8 }),                   // crate A out of the cell
    flip(LUNA, 10, 3),                              // from the crate to the high ledge, through L1: H1 opens
    grab(LUNA, 12, 2), goto(LUNA, 10, 3), goto(LUNA, 8, 8),
    pushTo(LUNA, 0, 12, { y: 8 }),                  // crate A to G_Top
    press(SOL, 30, 23),                             // up to the first ledge, P_Top: G_Top opens
    goto(LUNA, 11, 8), pushTo(LUNA, 0, 19, { y: 10, tol: 0.6 }),       // crate A into the shaft, onto H2
    grab(LUNA, 22, 4),
    press(SOL, 32, 20),                             // up to the second ledge, P_TR: G_TR opens
    goto(LUNA, 29, 8),
    grab(SOL, 28, 13), flip(SOL, 28, 17),           // a leap to the top of the tower, through L3: H3 opens
    goto(SOL, 35, 26, { keep: true }),
    press(LUNA, 28, 8), waitPlat(36, 9),            // Luna holds P_R: R comes down
    seek(SOL, 'crate B wholly on R', (S, p) => S.b[1].gr && cx(S.b[1]) > 36.6 && cx(S.b[1]) < 37.0 && bot(S.b[1]) > 26.5, { key: 'crateOnR', h: (S, p) => Math.abs(cx(S.b[1]) - 36.8) * 13 + Math.abs(cx(p) - cx(S.b[1])) * 3 }),   // Sol pushes crate B onto R
    seek(SOL, 'sol on R east of the crate', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) > 37.4 && bot(p) > 26.5, { key: 'eastR' }),
    goto(LUNA, 31, 8), waitPlat(36, 9, false),      // Luna steps off: R carries Sol and the crate up
    grab(SOL, 38, 3),
    pushTo(SOL, 1, 30, { y: 8, tol: 0.25 }),        // crate B west under the ledge onto P_G: H2 opens, crate A drops into socket X
    goto(LUNA, 29, 8), flip(LUNA, 33, 3), grab(LUNA, 34, 2),           // Luna climbs from the crate to the high ledge, through L2: H2 stays open
    goto(LUNA, 35, 8),
    seek(SOL, 'crate B into the shaft, Sol stays up', (S, p) => p.gr && bot(p) < 9.5 && S.b[1].gr && bot(S.b[1]) > 20.5, { key: 'Bdown', h: (S, p) => Math.abs(cx(S.b[1]) - 20) * 13 + Math.abs(cx(p) - cx(S.b[1])) * 3 + Math.abs(bot(S.b[1]) - 21) * 4 }),   // crate B off P_G, through G_TR and down the shaft onto crate A
    goto(LUNA, 37, 8),                              // Luna onto R
    press(SOL, 28, 8), waitPlat(36, 9),             // Sol holds P_R: R carries her down
    goto(LUNA, 33, 26), grab(LUNA, 34, 22),         // she steps off
    goto(SOL, 30, 8), waitPlat(36, 9, false),       // Sol lets go: R goes back up
    goto(SOL, 12, 8), grab(SOL, 5, 7),              // Sol back along the top band into the west room
    goto(SOL, 2, 8),                                // onto W, at the top of the west shaft
    press(LUNA, 8, 26), waitPlat(1, 9),             // Luna runs the bottom band home and holds P_W: W brings Sol down
    goto(SOL, 5, 26),                               // he steps off
    goto(LUNA, 8, 26), goto(LUNA, 12, 20), goto(LUNA, 14, 19), grab(LUNA, 16, 16), door(LUNA),   // Luna up the start room's climb and in through GX
    goto(SOL, 15, 27), goto(SOL, 32, 20), door(SOL), win(),   // Sol along the bottom band, up his tower and in through GY
  ],
};
