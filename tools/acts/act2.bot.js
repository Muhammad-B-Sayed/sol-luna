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
    within(grab(SOL, 11, 3), 1, 2, 21, 7),
    within(pushTo(SOL, 0, 8, { y: 28, tol: 0.6 }), 1, 2, 21, 7),   // K1 left into C0: purple bridge
    within(pushTo(LUNA, 1, 13, { y: 14, tol: 0.6 }), 1, 2, 21, 7), // K2 left into C1: green bridge
    press(SOL, 1, 6),                                // Sol holds P4 at the start: G4 opens
    grab(LUNA, 21, 10),
    press(LUNA, 2, 13),                              // Luna in the west room holds P2: G2 opens
    grab(SOL, 21, 13), grab(SOL, 2, 18),
    flip(SOL, 23, 27),                               // Sol through G2, sets L2
    flip(SOL, 2, 27),                                // back west (L2 flips off): L4 opens G4 for good
    flip(SOL, 23, 27),                               // east again: L2 back on, so Luna may leave P2
    grab(LUNA, 4, 16), grab(LUNA, 1, 25),            // Luna out of the room: gallery B, then the cellar
    goto(LUNA, 30, 27), grab(LUNA, 38, 24), goto(LUNA, 34, 18), grab(LUNA, 31, 14),
    goto(LUNA, 25, 27),                              // Luna on the lift
    grab(SOL, 38, 22), goto(SOL, 33, 23), grab(SOL, 38, 14),
    press(SOL, 29, 12), waitPlat(25, 28),            // Sol holds P5 up in the gallery: lift up
    press(LUNA, 32, 6),                              // Luna crosses B0 and holds P5b
    goto(SOL, 28, 27),
    goto(LUNA, 30, 6), waitPlat(25, 28, false),      // lift comes back down
    goto(SOL, 25, 27),
    press(LUNA, 32, 6), waitPlat(25, 28),            // and brings Sol up
    door(LUNA), door(SOL), win(),
  ],

  // Switchback
  13: () => {
    // leapfrog up the tower: the first player holds the plate below a hatch, the other climbs
    // past it and holds the plate above, and so on through the pink, white and yellow hatches
    const climb = (a, b) => [
      press(a, 14, 27), press(b, 20, 17),            // pink H1
      press(a, 18, 17), press(b, 21, 12),            // white H0
      press(a, 18, 12), press(b, 25, 7),             // yellow H2
      goto(a, 22, 7),
    ];
    return [
      // the players start apart, at the tops of the legs, and walk down
      grab(SOL, 12, 10), goto(SOL, 1, 21), flip(SOL, 6, 21), grab(SOL, 12, 24),
      grab(SOL, 30, 24),
      goto(LUNA, 27, 11), goto(LUNA, 37, 16), goto(LUNA, 27, 21), grab(LUNA, 28, 24),
      grab(LUNA, 1, 26),
      grab(SOL, 19, 21),
      ...climb(LUNA, SOL),
      grab(LUNA, 23, 11), grab(LUNA, 24, 2),
      within(grab(SOL, 2, 3), 1, 2, 13, 5),
      flip(SOL, 3, 5), within(goto(SOL, 20, 7), 13, 2, 25, 7),   // turn back through LP: purple on
      // Luna goes round the right loop: green on, then down to GP
      within(flip(LUNA, 36, 5), 26, 2, 38, 5), grab(LUNA, 38, 3), goto(LUNA, 27, 16),
      // Sol goes round the left loop: purple off
      flip(SOL, 3, 5, false), goto(SOL, 19, 27),
      // Luna on through GP, home
      goto(LUNA, 20, 27),
      ...climb(SOL, LUNA),
      flip(SOL, 3, 5), within(goto(SOL, 12, 5), 9, 2, 25, 5),   // west past LP and back east: purple on
      door(LUNA),                                    // Luna drops into her pit
      flip(SOL, 3, 5, false),                        // Sol round the left loop once more
      door(SOL), win(),
    ];
  },

  // Carry the Weight
  14: () => [
    pushTo(SOL, 0, 11, { y: 27 }), goto(SOL, 10, 27),   // crate and Sol onto purple lift L1
    grab(LUNA, 38, 2), grab(LUNA, 36, 24),
    press(LUNA, 33, 27), waitPlat(11, 28),           // Luna drops to the gallery floor and holds P1
    pushTo(SOL, 0, 15, { y: 16, tol: 0.2 }),         // onto P7: the tunnel opens
    grab(LUNA, 1, 11),
    press(LUNA, 1, 6),                               // Luna runs west and up the tower to P2: G2 opens
    seek(SOL, 'crate through G2 onto the east half of L3', (S) => S.b[0].gr && cx(S.b[0]) >= 23.95 && cx(S.b[0]) <= 24.3 && Math.abs(bot(S.b[0]) - 17) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 24.1) * 13 + Math.abs(cx(p) - cx(S.b[0])) * 3 }),
    seek(LUNA, 'Luna on L3 beside the crate', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= 22.45 && cx(p) <= 23.1 && Math.abs(bot(p) - 17) < 0.3 && cx(S.b[0]) >= 23.95,
      { h: (S, p) => Math.abs(cx(p) - 22.7) * 8 + Math.abs(bot(p) - 17) * 4 }),
    grab(SOL, 5, 18), grab(SOL, 14, 4), grab(SOL, 1, 3),
    press(SOL, 3, 6), waitPlat(23, 17),              // Sol runs up the tower to P3: up to the shelf
    seek(LUNA, 'crate and Luna off L3 onto the shelf', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= 25.45 && Math.abs(bot(p) - 10) < 0.3 && cx(S.b[0]) <= 27.4 && cx(S.b[0]) >= 26.4 && Math.abs(bot(S.b[0]) - 10) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 26.9) * 13 + Math.abs(cx(p) - 25.7) * 4 }),
    grab(SOL, 31, 15),
    press(SOL, 33, 27),                              // Sol runs down to P1: G8 sinks
    seek(LUNA, 'crate and Luna on the ferry', (S, p) => p.gr && Math.abs(p.vx) < 0.3 && Math.abs(bot(p) - 10) < 0.3 && cx(p) >= 29.45 && cx(p) <= 30.2 && S.b[0].gr && cx(S.b[0]) >= 30.6 && cx(S.b[0]) <= 31.4 && Math.abs(bot(S.b[0]) - 10) < 0.3,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 31) * 13 + Math.abs(cx(p) - 29.8) * 4 }),
    goto(SOL, 5, 27), goto(SOL, 9, 7), press(SOL, 19, 5), waitPlat(30, 10),             // Sol runs back up to P4: across the gap
    pushTo(LUNA, 0, 35, { y: 10, tol: 0.6 }),        // into the socket: B5 comes down
    grab(LUNA, 27, 19), grab(LUNA, 38, 11),
    grab(SOL, 38, 21),
    press(SOL, 38, 7),                               // Sol climbs to the shelf and holds P6a: G6 opens
    press(LUNA, 24, 5),                              // Luna passes G6, crosses B5, holds P6b
    door(SOL),                     // Sol passes G6 and crosses B5
    door(LUNA), win(),
  ],

  // Closing Time
  18: () => [
    grab(LUNA, 27, 23),
    press(LUNA, 38, 27),                             // PO1: Sol's pocket opens
    grab(SOL, 2, 23),
    press(SOL, 9, 27),                               // PB: Luna's gate opens
    grab(LUNA, 18, 23),
    goto(SOL, 11, 27),                               // Sol waits at airlock X
    press(LUNA, 23, 27),                             // P0: the airlock swaps
    goto(SOL, 18, 27),                               // Sol runs under the closing gate
    grab(SOL, 19, 23),
    goto(LUNA, 14, 27),                              // Luna waits at the airlock
    press(SOL, 23, 27),                              // P0 again
    goto(LUNA, 9, 27),                               // Luna runs it the other way
    press(LUNA, 9, 27),                              // PB: GB opens
    press(SOL, 33, 27),                              // Sol into Luna's cell, holds PG: HB opens
    within(grab(LUNA, 1, 13), 1, 10, 11, 18),
    press(LUNA, 8, 18),                              // Luna climbs west and holds PW: HC opens
    goto(SOL, 32, 18),                               // Sol climbs east
    grab(SOL, 38, 13),
    grab(LUNA, 21, 13),
    press(LUNA, 17, 18),                             // Luna into the centre, holds P5: DR opens
    grab(SOL, 19, 12), press(SOL, 17, 18),           // Sol in, takes over P5
    goto(LUNA, 28, 16),                              // Luna out east
    goto(SOL, 10, 16),                               // Sol steps off: DL opens, he goes west
    press(LUNA, 35, 18),                             // PG2: HL opens
    goto(SOL, 9, 8), press(SOL, 1, 6),               // Sol climbs, holds PW2: HR opens
    goto(LUNA, 31, 8), grab(LUNA, 35, 4),            // Luna climbs
    press(SOL, 9, 8),                                // PP: ZR opens, ZL shuts
    goto(LUNA, 18, 6),                               // Luna into the top centre
    goto(SOL, 6, 8),                                 // Sol steps off: ZL opens
    goto(LUNA, 10, 8), goto(SOL, 16, 8),             // they pass in the doorway
    press(LUNA, 9, 8),                               // PP: ZR opens
    grab(SOL, 20, 2), goto(SOL, 35, 8),              // Sol into the top right
    press(LUNA, 1, 6),                               // PW2: his door chamber opens
    door(SOL), door(LUNA), win(),
  ],

  // Crate Relay (crate 0 is K2, east; crate 1 is K1, west)
  19: () => {
    const onLift = (who, x0, x1, y, crate, name) => seek(who, name, (S, p) => p.gr && Math.abs(p.vx) < 0.3 && cx(p) >= x0 && cx(p) <= x1 && Math.abs(bot(p) - (y + 1)) < 0.3 && S.b[crate].gr,
      { h: (S, p) => Math.abs(cx(p) - (x0 + x1) / 2) * 8 + Math.abs(bot(p) - (y + 1)) * 4 });
    return [
      grab(SOL, 28, 19),
      press(LUNA, 2, 23), waitPlat(14, 24),            // PF: the ferry slides east to Sol
      goto(SOL, 25, 23),
      goto(LUNA, 4, 23), waitPlat(14, 24, false),      // she steps off: it brings him west
      goto(SOL, 12, 23), goto(LUNA, 14, 23),
      press(SOL, 2, 23),                               // Sol holds PF: Luna rides east
      grab(LUNA, 22, 20), goto(LUNA, 28, 23),          // and hops onto the island on the way
      goto(SOL, 4, 23), waitPlat(14, 24, false),
      pushTo(SOL, 1, 14, { y: 23 }),                   // K1 onto the ferry
      press(SOL, 2, 23), waitPlat(14, 24),             // and across
      pushTo(LUNA, 1, 35, { y: 23 }),                  // Luna pushes K1 onto L2
      onLift(LUNA, 33.3, 34.5, 23, 1, 'Luna on L2 behind K1'),
      press(SOL, 5, 23), waitPlat(34, 24),             // PG: L2 lifts Luna and K1
      pushTo(LUNA, 1, 38, { y: 12 }),                  // K1 into S1, against the wall
      within(pushTo(LUNA, 0, 25, { y: 14, tol: 0.8 }), 27, 7, 38, 11),   // K2 down the chute into the tunnel
      grab(LUNA, 25, 8),
      within(flip(SOL, 9, 17), 1, 11, 14, 17), goto(SOL, 14, 17),   // LO: the pusher shoves K2 through
      wait('K2 drops into the west room', (S) => S.b[0].gr && cx(S.b[0]) < 13 && bot(S.b[0]) > 17.5, 600),
      grab(SOL, 1, 13), grab(SOL, 9, 13), press(SOL, 10, 14),            // PW2: HW opens for Luna
      goto(LUNA, 29, 8), goto(LUNA, 27, 5),
      goto(SOL, 14, 17), waitPlat(6, 18, false),       // Sol steps off: L1 comes back down
      pushTo(SOL, 0, 6, { y: 17 }),                    // K2 onto L1
      onLift(SOL, 7.5, 8.6, 17, 0, 'Sol on L1 behind K2'),
      grab(LUNA, 27, 3), press(LUNA, 34, 3), waitPlat(6, 18),   // PW: L1 lifts Sol and K2
      pushTo(SOL, 0, 2, { y: 6, tol: 0.6 }),           // K2 into S2
      grab(SOL, 1, 3), door(SOL), door(LUNA), win(),
    ];
  },

  // Undertow
  20: () => [
    press(LUNA, 37, 3),                              // PW0: Sol's gate opens
    grab(SOL, 1, 20), press(SOL, 9, 27),             // Sol out, holds PG0: Luna's gate opens
    press(LUNA, 19, 6),                              // PK1 in the top crossing: Sol's bottom gate opens
    press(SOL, 25, 27),                              // Sol through it, holds PY1: Luna's top gate opens
    grab(LUNA, 1, 3), goto(LUNA, 7, 9),              // Luna on to the NW chamber
    press(SOL, 37, 27),                              // PG: NW hatch opens
    grab(LUNA, 5, 12), goto(LUNA, 7, 17),            // Luna drops to W-mid
    grab(SOL, 38, 25), goto(SOL, 34, 27),            // Sol onto the purple lift
    press(LUNA, 1, 15), waitPlat(34, 28),            // PP: it carries him up
    goto(SOL, 36, 17),
    press(LUNA, 3, 15), waitPlat(37, 10),            // PO1: the orange lift comes down
    goto(SOL, 37, 16),
    goto(LUNA, 7, 17), waitPlat(37, 10, false),      // she steps off: it carries him to NE
    grab(SOL, 36, 6), press(SOL, 35, 9),             // PW1: W-mid hatch opens
    goto(LUNA, 6, 22),                               // Luna drops to SW
    press(LUNA, 1, 27),                              // PG1: Sol's gate into the upper sun tunnel opens
    goto(SOL, 29, 8),
    grab(SOL, 21, 3), goto(SOL, 18, 9),              // Sol west through the upper sun tunnel to JT
    grab(LUNA, 21, 19), press(LUNA, 17, 22),         // Luna east to JB, holds PK2: Sol's top gate opens
    press(SOL, 9, 9),                                // Sol through it, holds PY2: Luna's bottom gate opens
    grab(LUNA, 38, 22), press(LUNA, 37, 27),         // Luna on to SE, holds PG: NW hatch opens
    goto(SOL, 7, 17),                                // Sol drops to W-mid
    goto(LUNA, 34, 27),                              // Luna onto the purple lift
    press(SOL, 1, 15), waitPlat(34, 28),             // PP: it carries her up
    grab(LUNA, 38, 13), goto(LUNA, 36, 17),
    press(SOL, 3, 15), waitPlat(37, 10),             // PO1 again: the orange lift comes down for Luna
    goto(LUNA, 37, 16),
    goto(SOL, 7, 17), waitPlat(37, 10, false),       // he steps off: it takes her up
    press(LUNA, 35, 9),                              // PW1: Sol's gate into the centre opens
    goto(SOL, 17, 17),                               // Sol into the centre
    goto(LUNA, 37, 9),                               // Luna onto the lift
    press(SOL, 19, 15), waitPlat(37, 10),            // PO2: the lift brings her down, and her gate opens
    goto(LUNA, 24, 14),                              // Luna in onto the east ledge
    grab(SOL, 16, 12), goto(SOL, 22, 17),            // Sol up for a gem, then east
    press(LUNA, 14, 13),                             // Luna crosses to PK3: Sol's door gate sinks
    door(SOL), door(LUNA), win(),
  ],

  // Pendulum
  21: () => [
    grab(SOL, 14, 25), grab(LUNA, 25, 25), grab(LUNA, 38, 25),   // the low islands and a corner
    press(LUNA, 31, 27),                             // white: Sol climbs the left wall
    press(SOL, 8, 21),                               // pink: Luna climbs the right wall
    grab(LUNA, 38, 19), goto(LUNA, 32, 21),
    goto(SOL, 11, 21),                               // Sol onto the purple ferry
    press(LUNA, 31, 21), waitPlat(10, 22),           // she holds purple: it swings him over
    press(SOL, 34, 21),                              // he takes over on his own plate
    goto(LUNA, 29, 21),                              // she steps onto the ferry
    goto(SOL, 32, 21), waitPlat(10, 22, false),      // he lets go: it swings her back
    press(LUNA, 5, 21),                              // white: Sol climbs the right wall
    press(SOL, 31, 15),                              // pink: Luna climbs the left wall
    goto(LUNA, 7, 15),
    goto(SOL, 28, 15),                               // Sol onto the green ferry
    press(LUNA, 8, 15), waitPlat(28, 16),            // green: it swings him left
    press(SOL, 5, 15),                               // he takes over
    goto(LUNA, 10, 15),
    goto(SOL, 6, 15), waitPlat(28, 16, false),       // it swings her right
    grab(SOL, 1, 13),
    press(LUNA, 34, 15),                             // white: Sol climbs the left wall
    press(SOL, 8, 9),                                // pink: Luna climbs the right wall
    goto(LUNA, 32, 9),
    goto(SOL, 11, 9),                                // Sol onto the orange ferry
    press(LUNA, 31, 9), waitPlat(10, 10),            // orange: it swings him right
    press(SOL, 34, 9),                               // he takes over
    goto(LUNA, 29, 9),
    goto(SOL, 32, 9), waitPlat(10, 10, false),       // it swings her left
    grab(SOL, 38, 7),
    press(LUNA, 5, 9),                               // white: Sol climbs to the top right
    press(SOL, 31, 3),                               // pink: Luna climbs to the top left
    grab(LUNA, 12, 5), grab(LUNA, 19, 4), door(LUNA),   // out along the broken bridge and back
    grab(SOL, 27, 5), grab(SOL, 20, 4), door(SOL), win(),
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
    const set = (who, want, name) => seek(who, name, (S, p) => p.gr && Math.abs(p.vx) < 0.3 && bot(p) > 16 && bot(p) < 21 && cx(p) > 15 && cx(p) < 25 &&
      Object.entries(want).every(([i, v]) => S.lv[i] === v), { key: JSON.stringify(want), h: (S, p) => Object.entries(want).filter(([i, v]) => S.lv[i] !== v).length * 30 });
    return [
      press(SOL, 23, 16),                            // Sol holds PC: the door opens
      within(goto(LUNA, 9, 22), 4, 18, 10, 23), goto(SOL, 21, 19),   // Luna walks out; the door shuts on Sol
      set(SOL, { 1: 1, 2: -1, 3: -1 }, 'Sol: purple on'), waitPlat(2, 8),
      within(grab(SOL, 16, 15), 15, 15, 24, 20),
      goto(LUNA, 2, 27),   // Luna onto the left lift
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: purple off'), waitPlat(2, 8, false),
      grab(LUNA, 10, 12), goto(LUNA, 14, 7),
      set(SOL, { 1: -1, 2: 1, 3: -1 }, 'Sol: green on'),
      grab(LUNA, 20, 10), goto(LUNA, 28, 7),
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: green off'),
      grab(LUNA, 27, 11), grab(LUNA, 37, 3), goto(LUNA, 37, 7),
      set(SOL, { 1: -1, 2: -1, 3: 1 }, 'Sol: orange on'), waitPlat(37, 8),
      set(SOL, { 1: -1, 2: -1, 3: -1 }, 'Sol: orange off'),
      goto(LUNA, 26, 27), press(SOL, 15, 19),        // Sol holds PY: GY opens
      flip(LUNA, 12, 19),                            // K on: the door stays open
      seek(SOL, 'Sol out past K, leaving it on', (S, p) => p.gr && cx(p) < 10 && bot(p) > 21.5 && S.lv[0] === 1, { key: 'out' }),
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: -1 }, 'Luna in, levers untouched'),   // swap
      seek(LUNA, 'Luna holds PY', (S, p) => p.gr && Math.abs(p.vx) < 0.05 && Math.abs(cx(p) - 15.5) < 0.3 && Math.abs(bot(p) - 20) < 0.3 && S.lv[0] === 1 && S.lv[1] === -1 && S.lv[2] === -1 && S.lv[3] === -1, { key: 'py' }),
      goto(SOL, 17, 27), goto(SOL, 33, 27),
      within(grab(LUNA, 21, 15), 15, 15, 24, 20),
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: 1 }, 'Luna: orange on'), waitPlat(37, 8),
      goto(SOL, 37, 27),                             // onto the right lift
      set(LUNA, { 0: 1, 1: -1, 2: -1, 3: -1 }, 'Luna: orange off'), waitPlat(37, 8, false),
      grab(SOL, 30, 12), grab(SOL, 24, 11), goto(SOL, 18, 7),
      set(LUNA, { 0: 1, 1: -1, 2: 1, 3: -1 }, 'Luna: green on'),
      grab(SOL, 12, 11), grab(SOL, 2, 3), goto(SOL, 2, 7),
      set(LUNA, { 0: 1, 1: 1, 2: 1, 3: -1 }, 'Luna: purple on'), waitPlat(2, 8),
      door(SOL), door(LUNA), win(),
    ];
  },
};
