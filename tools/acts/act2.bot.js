// Bot scripts for this act. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

// Wrap a search phase so it only succeeds while the player stands inside cells x0..x1, y0..y1.
const within = (ph, x0, y0, x1, y1) => ({
  ...ph, name: `${ph.name} in ${x0},${y0}-${x1},${y1}`, sig: `${ph.sig}|in${x0},${y0},${x1},${y1}`,
  goal: (S, p) => ph.goal(S, p) && cx(p) >= x0 && cx(p) <= x1 + 1 && bot(p) - 1 >= y0 - 0.5 && bot(p) - 1 <= y1 + 0.5,
});

export const SCRIPTS = {
  // The Drop
  12: () => [
    within(grab(SOL, 11, 2), 1, 1, 20, 6),
    within(pushTo(SOL, 0, 8, { y: 28, tol: 0.6 }), 1, 1, 20, 6),   // K1 left into C0: purple bridge
    within(goto(LUNA, 18, 6), 1, 1, 20, 6),
    within(pushTo(LUNA, 1, 13, { y: 14, tol: 0.6 }), 1, 1, 20, 6), // K2 left into C1: green bridge
    within(goto(LUNA, 11, 6), 1, 1, 20, 6),
    press(SOL, 1, 6),                                // Sol holds P4 at the start: G4 opens
    grab(LUNA, 21, 9),
    press(LUNA, 2, 13),                              // Luna in the west room holds P2: G2 opens
    grab(SOL, 21, 13), grab(SOL, 1, 16),
    flip(SOL, 23, 27),                               // Sol through G2, sets L2
    flip(SOL, 2, 27),                                // back west (L2 flips off): L4 opens G4 for good
    flip(SOL, 23, 27),                               // east again: L2 back on, so Luna may leave P2
    grab(LUNA, 5, 17), grab(LUNA, 1, 23),            // Luna out of the room: gallery B, then the cellar
    grab(LUNA, 38, 24), grab(LUNA, 28, 20),
    goto(LUNA, 25, 27),                              // Luna on the lift
    grab(SOL, 38, 17), grab(SOL, 37, 13),
    press(SOL, 29, 13), waitPlat(25, 28),            // Sol holds P5 up in the gallery: lift up
    press(LUNA, 32, 6),                              // Luna crosses B0 and holds P5b
    goto(SOL, 28, 27),
    goto(LUNA, 30, 6), waitPlat(25, 28, false),      // lift comes back down
    goto(SOL, 25, 27),
    press(LUNA, 32, 6), waitPlat(25, 28),            // and brings Sol up
    door(SOL), door(LUNA), win(),
  ],

  // Switchback
  13: () => {
    // leapfrog up the tower: the first player holds the plate below a hatch, the other climbs
    // past it and holds the plate above, and so on through the pink, white and yellow hatches
    const climb = (a, b) => [
      press(a, 14, 27), press(b, 21, 20),            // pink H1
      press(a, 19, 20), press(b, 18, 13),            // white H0
      press(a, 20, 13), press(b, 20, 6),             // yellow H2
      goto(a, 17, 6),
    ];
    return [
      // the players start apart, at the tops of the legs, and walk down
      flip(SOL, 3, 13), within(grab(SOL, 7, 9), 4, 8, 7, 13), grab(SOL, 2, 16), grab(SOL, 11, 23),
      within(grab(LUNA, 33, 9), 30, 8, 38, 13), grab(LUNA, 31, 16), grab(LUNA, 33, 23), goto(LUNA, 21, 27),
      grab(SOL, 19, 23),
      ...climb(LUNA, SOL),
      grab(LUNA, 24, 2),
      within(grab(SOL, 2, 2), 1, 1, 13, 6),
      flip(SOL, 3, 6), within(goto(SOL, 19, 6), 14, 1, 25, 6),   // turn back through LP: purple on
      // Luna goes round the right loop: green on, then down to GP
      within(flip(LUNA, 35, 5), 26, 1, 38, 5), within(grab(LUNA, 36, 2), 26, 1, 38, 5), goto(LUNA, 34, 20),
      // Sol goes round the left loop: purple off
      flip(SOL, 3, 6, false), goto(SOL, 19, 27),
      // Luna on through GP, home
      goto(LUNA, 21, 27),
      ...climb(SOL, LUNA),
      flip(SOL, 3, 6), within(goto(SOL, 13, 6), 11, 1, 25, 6),   // west past LP and back east: purple on
      door(LUNA),                                    // Luna drops into her pit
      flip(SOL, 3, 6, false),                        // Sol round the left loop once more
      door(SOL), win(),
    ];
  },

  // Carry the Weight
  14: () => [
    pushTo(SOL, 0, 12, { y: 27 }), goto(SOL, 11, 27),   // crate and Sol onto purple lift L1
    grab(LUNA, 37, 2), grab(LUNA, 33, 9), grab(LUNA, 26, 10),
    press(LUNA, 34, 27), waitPlat(12, 28),           // Luna drops to the gallery foot and holds P1
    pushTo(SOL, 0, 16, { y: 20, tol: 0.2 }),         // onto P7: the tunnel opens
    grab(LUNA, 19, 24), grab(LUNA, 5, 17),
    press(LUNA, 6, 6),                               // Luna runs west and up the tower to P2: G2 opens
    seek(SOL, 'crate through G2 onto the east half of L3', (S) => S.b[0].gr && cx(S.b[0]) >= 23.6 && cx(S.b[0]) <= 24.3 && Math.abs(bot(S.b[0]) - 21) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 24) * 13 + Math.abs(cx(p) - cx(S.b[0])) * 3 }),
    seek(LUNA, 'Luna on L3 beside the crate', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= 22.45 && cx(p) <= 23.0 && Math.abs(bot(p) - 21) < 0.3 && cx(S.b[0]) >= 23.6,
      { h: (S, p) => Math.abs(cx(p) - 22.7) * 8 + Math.abs(bot(p) - 21) * 4 }),
    grab(SOL, 6, 9), grab(SOL, 9, 2), grab(SOL, 15, 2),
    press(SOL, 9, 6), waitPlat(23, 21),              // Sol runs up the tower to P3: up to the shelf
    seek(LUNA, 'crate and Luna off L3 onto the shelf', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= 25.0 && Math.abs(bot(p) - 14) < 0.3 && cx(S.b[0]) <= 27.4 && cx(S.b[0]) >= 26.4 && Math.abs(bot(S.b[0]) - 14) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 26.9) * 13 + Math.abs(cx(p) - 25.7) * 4 }),
    grab(SOL, 26, 17), goto(SOL, 31, 27), grab(SOL, 36, 23),
    press(SOL, 34, 27),                              // Sol runs down to P1: G8 sinks
    seek(LUNA, 'crate and Luna on the ferry', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && Math.abs(bot(p) - 14) < 0.3 && cx(p) >= 29.45 && cx(p) <= 30.2 && S.b[0].gr && cx(S.b[0]) >= 30.6 && cx(S.b[0]) <= 31.4 && Math.abs(bot(S.b[0]) - 14) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 31) * 13 + Math.abs(cx(p) - 29.8) * 4 }),
    goto(SOL, 21, 20), goto(SOL, 6, 20), goto(SOL, 6, 13),
    press(SOL, 19, 6), waitPlat(30, 14),             // Sol runs back up to P4: across the gap
    pushTo(LUNA, 0, 36, { y: 14, tol: 0.6 }),        // into the socket: B5 comes down
    press(SOL, 38, 9),                               // Sol climbs to the shelf and holds P6a: G6 opens
    goto(LUNA, 36, 9), goto(LUNA, 34, 6),
    press(LUNA, 24, 6),                              // Luna passes G6, crosses B5, holds P6b
    door(SOL),                                       // Sol passes G6 and crosses B5
    door(LUNA), win(),
  ],

  // Closing Time
  18: () => [
    grab(LUNA, 28, 22), mv(LUNA, 32.5),              // walk out from under the ledge
    press(LUNA, 38, 27),                             // PO1: Sol's pocket opens
    grab(SOL, 8, 21),
    press(SOL, 10, 27),                              // PB: Luna's gate opens
    grab(LUNA, 18, 22),
    goto(SOL, 11, 27),                               // Sol waits at airlock X
    press(LUNA, 23, 27),                             // P0: the airlock swaps
    goto(SOL, 17, 27),                               // Sol runs under the closing gate
    within(grab(SOL, 20, 22), 14, 20, 21, 27), goto(SOL, 21, 27),
    goto(LUNA, 14, 27),                              // Luna waits at the airlock
    press(SOL, 23, 27),                              // P0 again
    press(LUNA, 10, 27),                             // Luna runs it the other way and holds PB: GB opens
    press(SOL, 36, 27),                              // Sol into Luna's cell, holds PG: HB opens
    within(grab(LUNA, 11, 12), 1, 10, 11, 18),
    press(LUNA, 7, 18),                              // Luna climbs west and holds PW: HC opens
    goto(SOL, 32, 18),                               // Sol climbs east
    grab(SOL, 38, 13),
    grab(LUNA, 21, 13),
    press(LUNA, 17, 18),                             // Luna into the centre, holds P5: DR opens
    grab(SOL, 19, 11), press(SOL, 17, 18),           // Sol in, takes over P5
    goto(LUNA, 28, 16),                              // Luna out east
    goto(SOL, 10, 16),                               // Sol steps off: DL opens, he goes west
    press(LUNA, 38, 18),                             // PG2: HL opens
    goto(SOL, 9, 8), press(SOL, 1, 6),               // Sol climbs, holds PW2: HR opens
    goto(LUNA, 35, 8), grab(LUNA, 35, 4),            // Luna climbs
    press(SOL, 10, 8),                               // PP: ZR opens, ZL shuts
    goto(LUNA, 18, 6),                               // Luna into the top centre
    goto(SOL, 8, 8),                                 // Sol steps off: ZL opens
    goto(LUNA, 11, 8), goto(SOL, 16, 8),             // they pass in the doorway
    press(LUNA, 10, 8),                              // PP: ZR opens
    grab(SOL, 20, 2), goto(SOL, 35, 8),              // Sol into the top right
    press(LUNA, 1, 6),                               // PW2: his door chamber opens
    door(SOL), door(LUNA), win(),
  ],

  // Crate Relay (crate 0 is K2, east; crate 1 is K1, west)
  19: () => {
    const onLift = (who, x0, x1, y, crate, name) => seek(who, name, (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= x0 && cx(p) <= x1 && Math.abs(bot(p) - (y + 1)) < 0.3 && S.b[crate].gr,
      { h: (S, p) => Math.abs(cx(p) - (x0 + x1) / 2) * 8 + Math.abs(bot(p) - (y + 1)) * 4 });
    return [
      grab(SOL, 35, 17), goto(SOL, 33, 26), mv(SOL, 37.5),   // down off the terrace, and in under it
      press(LUNA, 5, 26), waitPlat(14, 27),            // PF: the ferry slides east to Sol
      goto(SOL, 25, 26),
      goto(LUNA, 7, 26), waitPlat(14, 27, false),      // she steps off: it brings him west
      goto(SOL, 11, 26), goto(LUNA, 14, 26),
      press(SOL, 5, 26),                               // Sol holds PF: Luna rides east
      grab(LUNA, 19, 22), goto(LUNA, 28, 26),          // and jumps for a gem on the way
      goto(SOL, 7, 26), waitPlat(14, 27, false),
      pushTo(SOL, 1, 14, { y: 26 }),                   // K1 onto the ferry
      press(SOL, 5, 26), waitPlat(14, 27),             // and across
      pushTo(LUNA, 1, 32, { y: 26 }),                  // Luna pushes K1 onto L2
      onLift(LUNA, 30.6, 31.5, 26, 1, 'Luna on L2 behind K1, clear of the wall'),
      press(SOL, 8, 26), waitPlat(31, 27),             // PG: L2 lifts Luna and K1
      pushTo(LUNA, 1, 38, { y: 14 }),                  // K1 into S1, against the wall
      within(pushTo(LUNA, 0, 25, { y: 16, tol: 0.8 }), 25, 8, 38, 13),   // K2 down the chute into the tunnel
      grab(LUNA, 24, 10), grab(LUNA, 36, 11),
      goto(SOL, 1, 22), goto(SOL, 3, 19),              // Sol climbs to the west middle room
      within(flip(SOL, 11, 19), 1, 14, 11, 19), grab(SOL, 20, 19, { keep: true }),   // LO; Sol waits under the tunnel
      wait('K2 is shoved into the west room', (S) => S.b[0].gr && cx(S.b[0]) < 13 && bot(S.b[0]) > 19.8, 600),
      press(SOL, 16, 19),                              // PW2: HW opens for Luna
      goto(LUNA, 29, 10), goto(LUNA, 31, 6),
      goto(SOL, 14, 19), waitPlat(4, 20, false),       // Sol steps off: L1 comes back down
      pushTo(SOL, 0, 4, { y: 19 }),                    // K2 onto L1
      onLift(SOL, 5.4, 6.4, 19, 0, 'Sol on L1 behind K2, clear of the wall'),
      grab(LUNA, 27, 3), press(LUNA, 34, 6), waitPlat(4, 20),   // PW: L1 lifts Sol and K2
      pushTo(SOL, 0, 1, { y: 7, tol: 0.6 }),           // K2 into S2
      grab(SOL, 37, 2), door(SOL), grab(LUNA, 2, 3), door(LUNA), win(),
    ];
  },

  // Undertow
  20: () => [
    press(LUNA, 37, 3),                              // PW0: Sol's gate opens
    grab(SOL, 4, 22), press(SOL, 9, 27),             // Sol out, holds PG0: Luna's gate opens
    press(LUNA, 23, 3),                              // PK1 in the top crossing: Sol's bottom gate opens
    press(SOL, 25, 27),                              // Sol through it, holds PY1: Luna's top gate opens
    mv(LUNA, 21.5), grab(LUNA, 1, 3), goto(LUNA, 5, 9),              // Luna on to the NW chamber, waits on the hatch
    press(SOL, 37, 27),                              // PG: NW hatch opens
    grab(LUNA, 5, 12), goto(LUNA, 7, 17),            // Luna drops to W-mid
    grab(SOL, 38, 25), goto(SOL, 34, 27),            // Sol onto the purple lift
    press(LUNA, 1, 17), waitPlat(34, 28),            // PP: it carries him up
    goto(SOL, 36, 17, { tol: 0.1 }),                 // off the purple lift, clear of the orange one
    press(LUNA, 3, 17), waitPlat(37, 10),            // PO1: the orange lift comes down
    goto(SOL, 37, 17),
    goto(LUNA, 7, 17), waitPlat(37, 10, false),      // she steps off: it carries him to NE
    mv(SOL, 36.5), within(grab(SOL, 36, 6), 36, 9, 36, 9), mv(SOL, 35.5), press(SOL, 35, 9),             // PW1: W-mid hatch opens
    goto(LUNA, 6, 23),                               // Luna drops to SW
    press(LUNA, 1, 27),                              // PG1: Sol's gate into the upper sun tunnel opens
    mv(SOL, 33.5), goto(SOL, 29, 9),
    grab(SOL, 21, 3), goto(SOL, 18, 9),              // Sol west through the upper sun tunnel to JT
    grab(LUNA, 21, 19), press(LUNA, 17, 23),         // Luna east to JB, holds PK2: Sol's top gate opens
    press(SOL, 9, 9),                                // Sol through it, holds PY2: Luna's bottom gate opens
    goto(LUNA, 31, 24), mv(LUNA, 33.5), grab(LUNA, 38, 22), press(LUNA, 37, 27),         // Luna on to SE, holds PG: NW hatch opens
    goto(SOL, 7, 17),                                // Sol drops to W-mid
    goto(LUNA, 34, 27),                              // Luna onto the purple lift
    press(SOL, 1, 17), waitPlat(34, 28),             // PP: it carries her up
    grab(LUNA, 38, 13), goto(LUNA, 36, 17),
    press(SOL, 3, 17), waitPlat(37, 10),             // PO1 again: the orange lift comes down for Luna
    goto(LUNA, 37, 17),
    goto(SOL, 7, 17), waitPlat(37, 10, false),       // he steps off: it takes her up
    press(LUNA, 35, 9),                              // PW1: Sol's gate into the centre opens
    goto(SOL, 17, 17),                               // Sol into the centre
    goto(LUNA, 37, 9),                               // Luna onto the lift
    press(SOL, 19, 16), waitPlat(37, 10),            // PO2: the lift brings her down, and her gate opens
    goto(LUNA, 24, 14),                              // Luna in onto the east ledge
    grab(SOL, 16, 12), goto(SOL, 22, 17),            // Sol up for a gem, then east
    press(LUNA, 14, 13),                             // Luna crosses to PK3: Sol's door gate sinks
    door(SOL), door(LUNA), win(),
  ],

  // Pendulum
  21: () => [
    grab(SOL, 14, 27), grab(SOL, 3, 27), grab(LUNA, 25, 27), grab(LUNA, 36, 27),   // the islands and the nooks
    press(LUNA, 32, 27),                             // white: Sol climbs the left wall
    press(SOL, 7, 20),                               // pink: Luna climbs the right wall
    grab(LUNA, 36, 20), goto(LUNA, 33, 20),
    // crossing 1, purple: Luna calls it over, it carries Sol right, then Sol sends her left
    press(LUNA, 32, 20), waitPlat(27, 21),
    goto(SOL, 11, 20),                               // Sol onto the ferry
    goto(LUNA, 33, 20), waitPlat(27, 21, false),     // she lets go: it swings him over
    goto(SOL, 33, 20), goto(LUNA, 28, 20),           // he steps off, she steps on
    press(SOL, 34, 20), waitPlat(27, 21),            // he holds purple: it swings her left
    goto(LUNA, 7, 20), goto(SOL, 33, 20),
    grab(LUNA, 3, 20),
    press(LUNA, 5, 20),                              // white: Sol climbs the right wall
    goto(SOL, 33, 13), press(SOL, 32, 13),           // pink: Luna climbs the left wall
    goto(LUNA, 6, 13), grab(SOL, 36, 13),
    // crossing 2, green: Luna calls it over, it carries Sol left, then Sol sends her right
    press(LUNA, 7, 13), waitPlat(11, 14),
    goto(SOL, 28, 13),
    goto(LUNA, 6, 13), waitPlat(11, 14, false),
    goto(SOL, 6, 13), goto(LUNA, 11, 13),
    press(SOL, 5, 13), waitPlat(11, 14),
    goto(LUNA, 33, 13), goto(SOL, 6, 13),
    grab(SOL, 3, 13),
    press(LUNA, 34, 13),                             // white: Sol climbs the left wall
    press(SOL, 7, 6),                                // pink: Luna climbs the right wall
    goto(LUNA, 33, 6),
    // crossing 3, orange: the same dance at the top
    press(LUNA, 32, 6), waitPlat(27, 7),
    goto(SOL, 11, 6),
    goto(LUNA, 33, 6), waitPlat(27, 7, false),
    goto(SOL, 33, 6), goto(LUNA, 28, 6),
    press(SOL, 34, 6), waitPlat(27, 7),
    goto(LUNA, 6, 6), goto(SOL, 33, 6),
    press(LUNA, 5, 6),                               // white: Sol jumps up into his loft
    press(SOL, 32, 3),                               // pink, inside his loft: Luna jumps up into hers
    grab(LUNA, 7, 3), door(LUNA),
    grab(SOL, 34, 3), door(SOL), win(),
  ],

  // The Operator
  22: () => [
    // round 1: Sol works the deck, Luna runs the course
    flip(SOL, 7, 5),                                 // P on: B1 out over the shade
    grab(SOL, 10, 2, { keep: true }),
    grab(LUNA, 2, 13), goto(LUNA, 10, 26),           // Luna down A and over B1
    grab(LUNA, 14, 20), goto(LUNA, 12, 8),           // up the ladder in B
    grab(LUNA, 17, 19), goto(LUNA, 23, 26),          // through the moon pool, down C, onto the lift
    flip(SOL, 16, 5), waitPlat(23, 27),              // G on: the lift takes her up
    grab(LUNA, 29, 11),
    flip(LUNA, 28, 27),                              // yellow: her alcove unlocks
    press(LUNA, 30, 27),                             // PE: the deck's door opens
    goto(SOL, 33, 4, { keep: true }),                // Sol out onto the landing
    grab(SOL, 38, 18, { keep: true }),
    flip(SOL, 35, 27),                               // the rescue lever: the end cell opens
    goto(LUNA, 37, 26, { keep: true }),              // Luna out into the foot room
    press(SOL, 38, 26),                              // PT: Sol holds the deck's door open
    grab(LUNA, 33, 8, { keep: true }), goto(LUNA, 30, 4, { keep: true }),
    press(LUNA, 25, 4),                              // PD: Luna holds it for him
    goto(SOL, 29, 4, { keep: true }),
    // round 2: Luna works the deck, Sol runs
    grab(LUNA, 12, 2, { keep: true }),
    grab(SOL, 2, 22),                                // Sol west along the deck (G and P go off) and down A
    flip(LUNA, 7, 5),                                // P on: B1 out
    goto(SOL, 10, 26), grab(SOL, 8, 18), goto(SOL, 12, 8),
    within(flip(LUNA, 7, 5, false), 1, 2, 31, 5),    // P off: B2 out over the moon pool
    grab(SOL, 20, 14), goto(SOL, 23, 26),            // over B2, down C, onto the lift
    flip(LUNA, 16, 5), waitPlat(23, 27),             // G on: up he goes
    grab(SOL, 30, 11), door(SOL),                    // he falls onto his shelf
    door(LUNA), win(),
  ],

  // Clockwork
  15: () => {
    // lever indices in map order: 0 K (the landing), 1 purple, 2 green, 3 orange
    const set = (who, want, name) => seek(who, name, (S, p) => p.gr && Math.abs(p.vx) < 0.3 && bot(p) > 17 && bot(p) < 21.5 && cx(p) > 16 && cx(p) < 25 &&
      Object.entries(want).every(([i, v]) => S.lv[i] === v), { key: JSON.stringify(want), h: (S, p) => Object.entries(want).filter(([i, v]) => S.lv[i] !== v).length * 30 });
    return [
      press(SOL, 24, 20, { keep: true }),            // Sol holds PC (jumping the levers): the door opens
      within(goto(LUNA, 7, 27), 4, 22, 12, 28), goto(SOL, 21, 20),   // Luna walks out; the door shuts on Sol
      set(SOL, { 1: 1, 2: -1, 3: -1 }, 'Sol: purple on'), waitPlat(2, 8),
      within(grab(SOL, 17, 16), 16, 15, 24, 20),
      goto(LUNA, 2, 27),                             // Luna onto the left lift
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: purple off'), waitPlat(2, 8, false),
      grab(LUNA, 11, 9), goto(LUNA, 11, 6),
      set(SOL, { 1: -1, 2: 1, 3: -1 }, 'Sol: green on'),
      grab(LUNA, 23, 9), goto(LUNA, 24, 6),
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: green off'),
      grab(LUNA, 29, 10), grab(LUNA, 37, 2), goto(LUNA, 37, 7),
      set(SOL, { 1: -1, 2: -1, 3: 1 }, 'Sol: orange on'), waitPlat(37, 8),
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: orange off'),
      goto(LUNA, 27, 27), press(SOL, 16, 20),        // Sol holds PY: GY opens
      flip(LUNA, 12, 20),                            // K on: the door stays open
      seek(SOL, 'Sol out past K, leaving it on', (S, p) => p.gr && cx(p) < 10 && bot(p) > 22.5 && S.lv[0] === 1, { key: 'out' }),
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: -1 }, 'Luna in, levers untouched'),   // swap
      seek(LUNA, 'Luna holds PY', (S, p) => p.gr && Math.abs(p.vx) < 0.05 && Math.abs(cx(p) - 16.5) < 0.3 && Math.abs(bot(p) - 21) < 0.3 && S.lv[0] === 1 && S.lv[1] === -1 && S.lv[2] === -1 && S.lv[3] === -1, { key: 'py' }),
      goto(SOL, 18, 27), goto(SOL, 33, 27),
      within(grab(LUNA, 21, 16), 16, 15, 24, 20),
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: 1 }, 'Luna: orange on'), waitPlat(37, 8),
      goto(SOL, 37, 27),                             // onto the right lift
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: -1 }, 'Luna: orange off'), waitPlat(37, 8, false),
      grab(SOL, 27, 9), goto(SOL, 25, 6), grab(SOL, 15, 9), goto(SOL, 16, 6),
      set(LUNA, { 0: 1, 1: -1, 2: 1, 3: -1 }, 'Luna: green on'),
      grab(SOL, 5, 10), grab(SOL, 2, 2), goto(SOL, 2, 7),
      set(LUNA, { 0: 1, 1: 1, 2: 1, 3: -1 }, 'Luna: purple on'), waitPlat(2, 8),
      door(SOL), door(LUNA), win(),
    ];
  },
};
