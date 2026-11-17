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
    goto(SOL, 14, 16),                       // Sol wades west, climbs to his vault
    press(LUNA, 24, 16),                    // Luna climbs to hers and holds P4: Sol's vault opens
    grab(SOL, 18, 16), press(SOL, 15, 16),                      // Sol takes his gem, holds P5: Luna's vault opens
    grab(LUNA, 21, 16), goto(LUNA, 25, 16),         // she walks back out while Sol still holds P5
    goto(SOL, 13, 7),
    press(LUNA, 37, 6),                             // Luna holds P1: bridge over the moon pool
    grab(SOL, 19, 4), press(SOL, 19, 7),                        // Sol crosses, holds P2: bridge over the sun pool
    grab(LUNA, 20, 5), goto(LUNA, 12, 7), grab(LUNA, 4, 3), goto(LUNA, 14, 16),   // Luna crosses, takes the far corner gem, goes down the left
    goto(SOL, 27, 7), grab(SOL, 35, 3), press(SOL, 24, 16),                       // Sol goes down the right, holds P4
    grab(LUNA, 17, 16), press(LUNA, 15, 16),                                      // Luna's second gem; she holds P5
    grab(SOL, 22, 16), goto(SOL, 25, 16),
    press(LUNA, 7, 26),                                                           // Luna holds P3 at the bottom left
    goto(SOL, 33, 26), press(SOL, 24, 26),                                        // Sol crosses the moon channel, holds P6
    door(LUNA), door(SOL), win(),
  ],
  // Crate Cellar: bring the crate down the cascade, then it is the step and the weight at the chimney foot.
  6: () => [
    grab(LUNA, 9, 4),
    pushTo(SOL, 0, 9, { y: 8 }), goto(LUNA, 6, 8),  // off the top ledge onto the second; Luna gets behind it
    grab(SOL, 6, 11), press(SOL, 2, 13),   // Sol drops into his pocket, holds P1: G1 opens
    pushTo(LUNA, 0, 22, { y: 17 }),                 // Luna pushes the crate through G1 and off the ledge
    pushTo(LUNA, 0, 23, { y: 17 }), grab(LUNA, 29, 12),   // the crate as a step into the niche
    press(LUNA, 14, 17),        // Luna holds P2: G2 opens and Sol gets out
    goto(SOL, 25, 17), pushTo(SOL, 0, 14, { y: 17 }),
    pushTo(SOL, 0, 3, { y: 22 }),                   // west along the third ledge and down the shaft
    goto(SOL, 1, 22),
    pushTo(SOL, 0, 32, { y: 26 }),                  // east down the fourth ledge, onto P3 at the chimney foot
    goto(LUNA, 36, 22),         // Luna climbs the crate and steps onto the lift
    press(SOL, 21, 25),                             // Sol holds P4: the lift carries Luna up
    goto(LUNA, 33, 6),                              // Luna steps off at the top
    grab(SOL, 37, 20), goto(SOL, 36, 22),           // Sol lets go; the empty lift comes down and he boards it
    press(LUNA, 38, 6),                             // Luna holds the top plate: the lift brings Sol up
    door(SOL), grab(LUNA, 37, 3), door(LUNA), win(),
  ],
  // Twin Towers: each crosses the chasm on a ferry the other drives.
  7: () => [
    press(LUNA, 31, 20),                            // Luna drops to her first landing, holds P_A: G_A opens
    flip(SOL, 1, 6),   // Sol climbs his tower, sets L_B: G_B opens
    goto(SOL, 14, 21),   // back down to the low ferry's dock
    press(LUNA, 34, 25),        // Luna drops to the ground, holds P_F1: the low ferry comes over
    goto(SOL, 17, 21),                              // Sol steps on
    goto(LUNA, 35, 25),                             // Luna steps off: the ferry carries Sol back across
    grab(SOL, 20, 19), goto(SOL, 25, 21),
    goto(LUNA, 25, 11),   // Luna climbs through G_B to the high dock
    press(SOL, 38, 25),          // Sol holds P_F2: the high ferry comes over
    goto(LUNA, 22, 11),                             // Luna steps on
    goto(SOL, 37, 25),                              // Sol steps off: the ferry carries Luna back across
    grab(LUNA, 19, 9), goto(LUNA, 14, 11),
    grab(SOL, 37, 3), flip(SOL, 37, 6, false), goto(SOL, 32, 5),   // Sol climbs, wades, turns L_C off
    press(LUNA, 9, 25),         // Luna goes down to P_D: the gate before Sol's door opens
    grab(SOL, 22, 4), door(SOL),
    grab(LUNA, 2, 3), grab(LUNA, 17, 4), door(LUNA), win(),
  ],
  // Dawn Gate: the chapter's tools once each, up an S of five floors.
  8: () => [
    press(SOL, 28, 25),          // pool route: Sol wades the sun tunnel and holds P0
    grab(LUNA, 1, 22), flip(LUNA, 26, 25),   // Luna crosses the ledge through G0, L0 keeps it open
    goto(SOL, 28, 19), grab(SOL, 38, 17),           // up the ramp tunnel
    goto(LUNA, 27, 19), press(LUNA, 14, 18),        // bridge: Luna wades the moon channel, holds P1
    goto(SOL, 9, 19), flip(SOL, 1, 15),             // Sol crosses, climbs, unlocks the vault
    goto(SOL, 18, 13),            // into the vault, behind the crate
    goto(LUNA, 9, 19), grab(LUNA, 19, 11), goto(LUNA, 34, 14),   // Luna follows and steps onto the lift
    pushTo(SOL, 0, 37, { y: 14 }),                  // crate on a plate: the lift carries them both up
    press(SOL, 30, 9),            // Sol holds P3: G3 opens
    grab(LUNA, 12, 2), press(LUNA, 20, 3),   // Luna climbs, holds P4: G3 opens again
    grab(SOL, 2, 2), grab(SOL, 33, 2), door(SOL), door(LUNA), win(),
  ],
  // Counterweights: one colour sends one lift up and the other down; the crate is the last weight.
  9: () => [
    grab(SOL, 16, 24), goto(SOL, 11, 26),           // Sol onto W0
    grab(LUNA, 24, 24), grab(LUNA, 37, 24), press(LUNA, 33, 26),   // Luna drops down, holds P0a: W0 up, E0 down
    grab(SOL, 6, 21), flip(SOL, 23, 20), goto(SOL, 27, 21),   // Sol crosses F1 through L2 onto E0
    goto(LUNA, 31, 26),                             // Luna lets go: E0 carries Sol to F2
    goto(LUNA, 11, 26),                             // Luna through G2 onto W0
    grab(SOL, 30, 11), press(SOL, 35, 13),          // Sol wades to P0b: W0 lifts Luna, E0 sinks
    goto(LUNA, 27, 21),                             // Luna onto E0
    goto(SOL, 37, 13),                              // Sol steps off P0b: E0 carries Luna to F2
    goto(LUNA, 11, 15),                             // Luna onto W1
    press(SOL, 38, 13),                             // Sol holds P1a: W1 lifts Luna, E1 sinks
    grab(LUNA, 3, 10), goto(LUNA, 27, 9),           // Luna onto E1 (off its weight pad)
    goto(SOL, 37, 13),                              // Sol lets go: E1 carries Luna to the top
    grab(LUNA, 24, 1), pushTo(LUNA, 0, 28, { y: 3 }),   // the crate onto E1's far end
    goto(SOL, 11, 15),                              // Sol onto W1
    press(LUNA, 20, 2), waitPlat(26, 4),            // Luna holds P1b until E1 has sunk: the crate holds it there for good
    press(LUNA, 10, 3),                             // over the bridge to P3: G3 opens
    grab(SOL, 7, 9), grab(SOL, 31, 5), flip(SOL, 37, 7), door(SOL),  // Sol into the east wing, through L4: G4 sinks
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
