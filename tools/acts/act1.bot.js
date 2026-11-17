// Bot scripts for this act. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

export const SCRIPTS = {
  // First Light (pilot, written by the planner as the worked example).
  1: () => [
    grab(SOL, 36, 24), press(SOL, 37, 27),          // Sol jumps the moon pool, wades his channel and holds P1: G1 opens
    grab(LUNA, 2, 21), flip(LUNA, 20, 20),          // Luna climbs the west stair, passes G1, sets L1: G1 stays open
    grab(LUNA, 37, 13),                             // up the east stair
    press(LUNA, 2, 14),                             // floor 2: Luna wades her channel and holds P2: G2 opens
    grab(SOL, 23, 17), grab(SOL, 5, 7),             // Sol follows through G1, up the east stair and the middle stair
    flip(SOL, 28, 6),                               // floor 3: Sol passes G2, sets L2: G2 stays open
    grab(SOL, 31, 2), door(SOL),
    grab(LUNA, 8, 7), grab(LUNA, 33, 3), door(LUNA), win(),
  ],

  // Parting Ways: two towers, each opens the other's way.
  2: () => [
    grab(SOL, 17, 26), flip(SOL, 12, 28, false),    // Sol runs to the window and back: L5 off, G5 opens
    press(LUNA, 21, 21),                            // Luna runs to the window, climbs and holds P0: G0 opens
    grab(SOL, 13, 18), flip(SOL, 11, 14, false),    // Sol passes G0, climbs, walks left through L1: G1 opens
    goto(SOL, 10, 14),                              // and waits at G2
    grab(LUNA, 37, 25), grab(LUNA, 32, 17), press(LUNA, 30, 13),   // Luna climbs through G1 and holds P2: G2 opens
    grab(SOL, 1, 7), grab(SOL, 8, 4), flip(SOL, 10, 7), goto(SOL, 15, 7),   // Sol passes G2, sets L3: G3 opens
    grab(LUNA, 22, 6), grab(LUNA, 34, 3), press(LUNA, 37, 6),   // Luna climbs through G3 and holds P4: G4 lets Sol out
    door(SOL), door(LUNA), win(),
  ],
  // Shade Well: a one-way descent down both sides of a deadly well.
  3: () => [
    grab(LUNA, 1, 4), press(LUNA, 37, 6),           // Luna fetches her gem from Sol's end, then holds P0: G0 opens
    grab(SOL, 38, 3), goto(SOL, 16, 7), goto(SOL, 17, 14), grab(SOL, 7, 11),   // Sol drops into the left slot and goes through G0
    flip(SOL, 2, 14), flip(SOL, 4, 14),             // Sol inside: L0 keeps G0 open, L1 opens G1 for Luna
    goto(SOL, 18, 21),                              // Sol walks back out and drops to ledge LB
    goto(LUNA, 22, 13), grab(LUNA, 36, 10), press(LUNA, 38, 13),   // Luna drops, passes G1, holds P2: G2 opens
    flip(SOL, 2, 21), grab(SOL, 8, 25), door(SOL), // Sol passes G2, sets L3: G3 opens; he drops to his door
    goto(LUNA, 29, 20), grab(LUNA, 27, 25), door(LUNA), win(),
  ],
  // The Lift: riders can't drive; the partner's plate moves the lift.
  4: () => [
    grab(SOL, 35, 25), press(SOL, 37, 28),          // Sol holds P0: lift 1 carries Luna up to rib 1
    waitPlat(18, 28),
    goto(LUNA, 16, 20), press(LUNA, 8, 21),         // Luna holds P0b: G0b opens at the foot of the west stair
    grab(SOL, 2, 20), grab(SOL, 10, 18), goto(SOL, 21, 20),   // Sol climbs to rib 1 and leaps onto lift 2
    grab(LUNA, 14, 17), press(LUNA, 15, 20),        // Luna holds P1: lift 2 carries Sol up to rib 2
    waitPlat(21, 21),
    goto(SOL, 23, 13), grab(SOL, 29, 10), press(SOL, 29, 13),   // Sol holds P1b: G1b opens
    goto(LUNA, 21, 20), grab(LUNA, 32, 19), goto(LUNA, 34, 13), goto(LUNA, 18, 13),   // Luna climbs to rib 2, onto lift 3
    press(SOL, 26, 13),                             // Sol holds P2: lift 3 carries Luna up to rib 3
    waitPlat(18, 14),
    grab(LUNA, 10, 3), flip(LUNA, 12, 7),           // Luna latches lift 3 up with L2
    door(SOL),                                      // so Sol can let go
    grab(LUNA, 33, 5), door(LUNA), win(),           // from the top of lift 3 she leaps to the gallery and back
  ],
  // The Long Way Round: a ring; Sol clockwise, Luna anticlockwise; bridges rise out of pools.
  5: () => [
    goto(SOL, 10, 14),                              // Sol wades west, climbs to his vault corridor
    press(LUNA, 29, 13),                            // Luna climbs to hers and holds P4: Sol's vault opens
    grab(SOL, 17, 14), press(SOL, 10, 14),          // Sol takes his gem, holds P5: Luna's vault opens
    grab(LUNA, 23, 13), goto(LUNA, 30, 13),         // she walks back out while Sol still holds P5
    goto(SOL, 13, 7),
    press(LUNA, 29, 6),                             // Luna holds P1: bridge over the moon pool
    grab(SOL, 19, 3), press(SOL, 19, 7),            // Sol crosses, holds P2: bridge over the sun pool
    grab(LUNA, 20, 4), goto(LUNA, 12, 7), grab(LUNA, 2, 6), goto(LUNA, 10, 14),   // Luna crosses, takes the far corner gem, goes down the left
    mv(SOL, 24), goto(SOL, 27, 6), grab(SOL, 37, 5), press(SOL, 29, 13),       // Sol wades east, goes down the right, holds P4
    grab(LUNA, 16, 14), press(LUNA, 10, 14),                                     // Luna's second gem; she holds P5
    grab(SOL, 24, 13), goto(SOL, 30, 13),
    press(LUNA, 5, 27),                                                          // Luna holds P3 at the bottom left
    goto(SOL, 24, 25), press(SOL, 23, 25),                                       // Sol crosses the moon channel, holds P6
    door(LUNA), door(SOL), win(),
  ],
  // Crate Cellar: bring the crate down the cascade, then it is the step and the weight at the chimney foot.
  6: () => [
    grab(LUNA, 10, 3),
    pushTo(SOL, 0, 13, { y: 13 }), goto(LUNA, 12, 13),   // off the starting ledge onto the second; Luna gets behind it
    grab(SOL, 3, 16), press(SOL, 1, 17),           // Sol drops into his pocket, holds P1: G1 opens
    pushTo(LUNA, 0, 23, { y: 20 }),                 // Luna pushes the crate through G1 and off the ledge
    pushTo(LUNA, 0, 30, { y: 20 }), grab(LUNA, 30, 14),   // the crate as a step up to a high gem
    press(LUNA, 16, 20),                            // Luna holds P2: G2 opens and Sol gets out
    grab(SOL, 20, 17), pushTo(SOL, 0, 15, { y: 20 }),
    pushTo(SOL, 0, 13, { y: 27 }),                  // west along the third ledge and down the gap
    goto(SOL, 11, 27),
    pushTo(SOL, 0, 32, { y: 28 }),                  // east along the fourth ledge, down onto P3 at the chimney foot
    grab(SOL, 26, 24),
    goto(LUNA, 36, 23),                             // Luna climbs the crate and steps onto the lift
    press(SOL, 30, 28),                             // Sol holds P4: the lift carries Luna up
    waitPlat(36, 24), goto(LUNA, 34, 6),            // Luna steps off at the top
    mv(SOL, 31.6), waitPlat(36, 24, false),         // Sol lets go; the empty lift comes down
    goto(SOL, 36, 23),                              // and he boards it
    press(LUNA, 32, 6),                             // Luna holds the top plate: the lift brings Sol up
    door(SOL),
    grab(LUNA, 33, 3), door(LUNA), win(),
  ],
  // Twin Towers: each crosses the chasm on a ferry the other drives.
  7: () => [
    grab(LUNA, 32, 10), press(LUNA, 30, 20),        // Luna climbs down to her first floor, holds P_A: G_A opens
    grab(SOL, 12, 18), flip(SOL, 9, 7),             // Sol climbs his tower, sets L_B: G_B opens
    goto(SOL, 16, 21),                              // down through the hole, back to the low ferry's dock
    press(LUNA, 27, 27),                            // Luna drops to the ground, holds P_F1: the low ferry comes over
    goto(SOL, 18, 21),                              // Sol steps on
    goto(LUNA, 25, 27),                             // Luna steps off: the ferry carries Sol back across
    waitPlat(21, 22, false), goto(SOL, 24, 21),
    goto(LUNA, 23, 14),                             // Luna climbs through G_B to the high dock
    press(SOL, 31, 27),                             // Sol holds P_F2: the high ferry comes over
    goto(LUNA, 21, 14),                             // Luna steps on
    goto(SOL, 33, 27),                              // Sol steps off: the ferry carries Luna back across
    waitPlat(18, 15, false), goto(LUNA, 15, 14), grab(LUNA, 8, 11),
    grab(SOL, 34, 3), flip(SOL, 29, 6, false), goto(SOL, 27, 6),   // Sol climbs, wades, turns L_C off
    press(LUNA, 6, 28),                             // Luna goes down to P_D: the gate before Sol's door opens
    grab(SOL, 22, 6), door(SOL),
    grab(LUNA, 17, 6), door(LUNA), win(),
  ],
  // Dawn Gate: the chapter's tools once each, up an S of five floors.
  8: () => [
    press(SOL, 22, 28),                             // pool route: Sol wades the sun tunnel and holds P0
    grab(LUNA, 1, 25), flip(LUNA, 19, 24),          // Luna crosses the ledge through G0, L0 keeps it open
    grab(SOL, 37, 19), goto(SOL, 33, 21),           // up the east stair
    goto(LUNA, 32, 21), press(LUNA, 23, 21),        // bridge: Luna wades the moon channel, holds P1
    goto(SOL, 21, 21), flip(SOL, 6, 13),            // Sol crosses, climbs, unlocks the vault
    goto(SOL, 10, 13), pushTo(SOL, 0, 29, { y: 14 }),   // out of the vault, east along the floor
    grab(LUNA, 11, 10), goto(LUNA, 24, 14), ...leap(LUNA, 24, 27.4, 32),   // Luna follows and jumps the crate
    goto(LUNA, 34, 14), grab(SOL, 26, 11),          // and steps onto the lift
    seek(SOL, 'sol pushes the crate into the socket and stays on the lift', (S, p) => S.b[0].gr && cx(S.b[0]) > 37 && bot(S.b[0]) > 15.5 && cx(p) > 33.2 && cx(p) < 36.8 && bot(p) < 15.2, { key: 'socket' }),   // crate on a plate: the lift carries them both up
    waitPlat(34, 15), mv(SOL, 31.6),
    press(SOL, 30, 7),                              // Sol holds P3: G3 opens
    goto(LUNA, 6, 6), goto(LUNA, 6, 2), press(LUNA, 24, 3),   // Luna goes through, climbs, holds the other plate: G3 opens again
    goto(SOL, 6, 6), grab(SOL, 2, 2), door(SOL),
    grab(LUNA, 30, 2), door(LUNA), win(),
  ],
  // Counterweights: one colour sends one lift up and the other down; the crate is the last weight.
  9: () => [
    grab(SOL, 6, 25), goto(SOL, 11, 27),            // Sol onto W0
    mv(LUNA, 27), grab(LUNA, 24, 25), grab(LUNA, 37, 25), press(LUNA, 33, 27),   // Luna drops down, holds P0a: W0 up, E0 down
    waitPlat(11, 28),
    flip(SOL, 23, 21), mv(SOL, 27),           // Sol crosses F1 through L2 onto E0
    goto(LUNA, 31, 27),                             // Luna lets go: E0 carries Sol to F2
    goto(LUNA, 11, 27),                             // Luna through G2 onto W0
    waitPlat(27, 17, false), mv(SOL, 30), mv(SOL, 35),   // Sol walks into the wing, wades to P0b: W0 lifts Luna, E0 sinks
    waitPlat(11, 28), waitPlat(27, 17), mv(LUNA, 27),     // Luna onto E0
    mv(SOL, 36.6),                                  // Sol steps off P0b: E0 carries Luna to F2
    waitPlat(27, 17, false), mv(LUNA, 11),                                   // Luna onto W1
    press(SOL, 38, 16),                             // Sol holds P1a: W1 lifts Luna, E1 sinks
    waitPlat(11, 17), waitPlat(27, 7), mv(LUNA, 26.6),                                 // Luna onto E1 (off its weight pad)
    mv(SOL, 36.6), waitPlat(27, 7, false),          // Sol lets go: E1 carries Luna to the top
    ...leap(LUNA, 27.4, 28.2, 30.5), mv(LUNA, 35), mv(LUNA, 29.6),       // a hop up onto the east gallery for its gem
    grab(LUNA, 24, 2), pushTo(LUNA, 0, 28, { y: 6 }),   // the crate onto E1's far end
    grab(SOL, 30, 16), mv(SOL, 11),                 // Sol back west onto W1
    press(LUNA, 21, 5), waitPlat(27, 7),            // Luna holds P1b until E1 has sunk: the crate holds it there for good
    press(LUNA, 12, 6),                             // over the bridge to P3: G3 opens
    mv(SOL, 24), grab(SOL, 1, 9), flip(SOL, 2, 11), door(SOL),   // Sol into the west wing, through L4: G4 opens; out onto the gallery
    door(LUNA), win(),
  ],
  // Stone Raft: the crate rides the ferry, then drops off the shelf into the middle of the east stretch.
  10: () => [
    grab(SOL, 10, 8), goto(SOL, 5, 10),
    press(LUNA, 8, 6),                              // Luna holds P_G: the ferry comes to the dock
    pushTo(SOL, 0, 14, { y: 10 }), goto(SOL, 12, 10),   // Sol pushes the crate onto it and steps on
    goto(LUNA, 4, 6), grab(LUNA, 14, 4),            // Luna steps off: the ferry carries Sol and the crate over
    flip(SOL, 23, 10), grab(SOL, 23, 8),            // L5 opens G5 for Luna
    pushTo(SOL, 0, 30, { y: 15 }),                  // off the shelf: a stepping stone
    goto(SOL, 35, 15), goto(SOL, 37, 26),           // across, and down the lift shaft
    grab(LUNA, 2, 20), goto(LUNA, 5, 26),           // Luna down the west shaft to G1
    grab(SOL, 34, 23), press(SOL, 16, 20),          // Sol holds P1 at the far end of the middle: G1 opens
    flip(LUNA, 9, 26),                              // Luna through G1 and L1: it stays open
    flip(SOL, 27, 20), goto(SOL, 37, 26),           // Sol back east through L3 (G3 opens) onto the lift
    grab(LUNA, 18, 18), press(LUNA, 22, 20),        // Luna holds P4: the lift carries Sol up
    waitPlat(36, 27), grab(SOL, 37, 3), goto(SOL, 35, 6),
    goto(LUNA, 26, 20), waitPlat(36, 27, false), goto(LUNA, 37, 26),   // Luna down the east ramp onto the lift
    press(SOL, 34, 6), waitPlat(36, 27),            // Sol holds P4b: the lift brings Luna up
    goto(LUNA, 35, 6),
    press(SOL, 29, 6),                              // Sol through G3 to P6: G6 opens
    grab(LUNA, 30, 3), door(LUNA),
    door(SOL), win(),
  ],
  // Helper's Way Out: drop into a pit to hold a wing open; the runner's lever lifts the pit floor.
  11: () => [
    press(SOL, 15, 24),                             // Sol holds P0: G0 lets Luna out of her cell
    goto(LUNA, 21, 24), goto(SOL, 19, 24),
    press(LUNA, 17, 27),                            // Luna drops into pit A onto P1: G1 opens
    grab(SOL, 24, 20),
    grab(SOL, 6, 18), grab(SOL, 7, 16), grab(SOL, 6, 8), grab(SOL, 12, 3),           // Sol climbs the west wing
    flip(SOL, 7, 4),                                // the dead end: L2 opens the hatch and G2
    flip(SOL, 12, 26, false),                       // back down into the pocket, left through L3: pit A's floor rises
    waitPlat(16, 28),
    goto(SOL, 13, 14),                              // Sol back down to the F2 exit
    press(LUNA, 24, 14),                            // Luna holds P7: G7 opens
    press(SOL, 22, 18),                             // Sol drops into pit B onto P4: G4 opens
    grab(LUNA, 33, 12), grab(LUNA, 32, 18), grab(LUNA, 29, 18), grab(LUNA, 26, 22),   // Luna down through the east wing
    seek(LUNA, 'luna through L5 onto the east lift', (S, p) => S.lv[1] === 1 && cx(p) > 35.3 && cx(p) < 37.7 && p.gr, { key: 'L5lift' }),   // both white floors rise
    waitPlat(21, 19),                               // pit B carries Sol to F3; Luna waits on the east lift
    press(SOL, 15, 4), waitPlat(35, 25),            // Sol holds P8: the east lift brings Luna up and G8 opens
    grab(LUNA, 27, 3), goto(LUNA, 17, 4),           // Luna comes out
    goto(SOL, 17, 4), press(LUNA, 15, 4),           // Luna holds P8: G9 opens
    door(SOL), door(LUNA), win(),
  ],
};
