// Bot scripts for this act file. One per level: a function that returns the phases.
// Read the top of tools/botlib.js for the builders.
import { SOL, LUNA, goto, grab, flip, press, door, pushTo, seek, wait, waitPlat, platAt, win, mv, push, hop, hopTo, jumpWhen, leap, both, cx, bot, L_, R_, U_ } from '../botlib.js';

const K = { keep: true };
const onLift = (p, x0, f, w) => p.gr && cx(p) > x0 + 0.45 && cx(p) < x0 + w - 0.45 && Math.abs(bot(p) - f) < 0.3;
// rider and crate both on a lift (crate i), crate kept clear of the far edge
const boardWith = (who, i, x0, f, w, side) => seek(who, `${who ? 'luna' : 'sol'} and crate ${i} onto lift ${x0},${f}`,
  (S, p) => onLift(p, x0, f, w) && S.b[i].gr && Math.abs(bot(S.b[i]) - f) < 0.3 && (side > 0 ? cx(S.b[i]) > cx(p) : cx(S.b[i]) < cx(p)) &&
    cx(S.b[i]) > x0 + 0.5 && cx(S.b[i]) < x0 + w - 0.5,
  { key: `bw${i},${x0},${f},${side}`, h: (S, p) => Math.abs(cx(S.b[i]) - (x0 + w / 2)) * 13 + Math.abs(cx(p) - (x0 + w / 2)) * 7 + Math.abs(bot(p) - f) * 4 });

// stand in cell (x, y) without moving crate i out of columns lo..hi
const stepTo = (who, x, y, i, lo, hi) => seek(who, `${who ? 'luna' : 'sol'} -> (${x},${y}) leaving crate ${i}`,
  (S, p) => p.gr && Math.abs(p.vx) < 0.6 && Math.abs(cx(p) - (x + 0.5)) <= 0.2 && Math.abs(bot(p) - (y + 1)) < 0.5 &&
    S.b[i].gr && cx(S.b[i]) >= lo && cx(S.b[i]) <= hi,
  { key: `st2${x},${y},${i},${lo},${hi}`, h: (S, p) => Math.abs(cx(p) - (x + 0.5)) * 7 + Math.abs(bot(p) - (y + 1)) * 4 });

// any phase, but crate i must stay in columns lo..hi
const keepCrate = (ph, i, lo, hi) => { const g = ph.goal;
  ph.goal = (S, p) => g(S, p) && S.b[i].gr && cx(S.b[i]) >= lo && cx(S.b[i]) <= hi; ph.sig += `|kc${i},${lo},${hi}`; return ph; };
// press a plate without moving crate i out of columns lo..hi
const pressKeep = (who, x, y, i, lo, hi) => { const ph = press(who, x, y); const g = ph.goal;
  ph.goal = (S, p) => g(S, p) && S.b[i].gr && cx(S.b[i]) >= lo && cx(S.b[i]) <= hi; ph.sig += `|keep${i},${lo},${hi}`; return ph; };
// a phase that must also end on the top floor
const atTop = (ph) => { const g = ph.goal; ph.goal = (S, p) => g(S, p) && bot(p) < 7.5; ph.sig += '|top'; return ph; };

export const SCRIPTS = {
  // crate 0 is Sol's (west), crate 1 Luna's (east). Each step of a wing's climb is worked from the other wing.
  32: () => [
    grab(SOL, 18, 21), grab(LUNA, 21, 21),                 // the hall's high corners, a full jump from the dais
    press(SOL, 17, 27),                                    // Sol holds orange: Luna's gate
    press(LUNA, 27, 27),                                   // through the moon channel; she holds white: Sol's gate
    goto(SOL, 12, 27), grab(SOL, 2, 23),                   // through the sun channel; the high corner shelf
    grab(LUNA, 37, 23), pushTo(LUNA, 1, 29, { y: 27, tol: 0.4 }), boardWith(LUNA, 1, 28, 28, 3, 1),  // her shelf, then her crate onto EL
    // 1. green (Sol, band 0): EL carries Luna and crate 1 up; she parks it at her gate
    pushTo(SOL, 0, 10, { y: 27, tol: 0.4 }), press(SOL, 12, 27), waitPlat(29, 28),
    pushTo(LUNA, 1, 33, { y: 20, tol: 0.3 }), stepTo(LUNA, 32, 20, 1, 33.2, 33.8),
    // 2. purple (Luna, band 1): WL carries Sol and crate 0 up; he parks it at his gate
    boardWith(SOL, 0, 9, 28, 3, -1), waitPlat(29, 28, false),
    pressKeep(LUNA, 31, 20, 1, 33.2, 33.8), waitPlat(10, 28),
    pushTo(SOL, 0, 6, { y: 20, tol: 0.3 }),
    // 3. orange (Sol): Luna's gate opens and her crate goes onto EU; white (Luna): his crate onto WU
    pressKeep(SOL, 8, 20, 0, 6.2, 6.8),
    keepCrate(goto(LUNA, 32, 20), 1, 33.2, 33.8), waitPlat(37, 21, false),   // EU rode up empty on her purple: let it settle
    pushTo(LUNA, 1, 36.9, { y: 20, tol: 0.2 }), pressKeep(LUNA, 35, 20, 1, 37.1, 37.7),
    pushTo(SOL, 0, 2.1, { y: 20, tol: 0.2 }),
    boardWith(LUNA, 1, 36, 21, 3, -1),
    // 4. purple (Sol): EU to band 2; Luna loads ET. Green (Luna): WU to band 2; Sol loads WT
    pressKeep(SOL, 4, 20, 0, 2.3, 2.9), waitPlat(37, 21),
    waitPlat(33, 14, false), pushTo(LUNA, 1, 32.8, { y: 13, tol: 0.2 }), keepCrate(goto(LUNA, 33.9, 13, { tol: 0.15 }), 1, 33.0, 33.6),
    waitPlat(2, 21, false), boardWith(SOL, 0, 1, 21, 3, 1),
    pressKeep(LUNA, 35, 13, 1, 33.0, 33.6), waitPlat(2, 21),
    waitPlat(6, 14, false),
    pushTo(SOL, 0, 6.3, { y: 13, tol: 0.15 }), keepCrate(grab(SOL, 9, 9), 0, 6.6, 7.0), stepTo(SOL, 5.1, 13, 0, 6.6, 7.0),
    keepCrate(grab(LUNA, 30, 9), 1, 33.0, 33.6), boardWith(LUNA, 1, 32, 14, 3, -1),
    // orange (Sol): ET to the top; crate 1 down chute B into the white socket
    pressKeep(SOL, 4, 13, 0, 6.6, 7.0), waitPlat(33, 14),
    seek(LUNA, 'luna sends crate 1 down chute B', (S, p) => bot(S.b[1]) > 14.5 && cx(S.b[1]) > 28 && cx(S.b[1]) < 30 && bot(p) < 7.5 && cx(p) < 31.8,
      { h: (S, p) => Math.abs(cx(S.b[1]) - 29) * 13 + Math.abs(bot(S.b[1]) - 15) * 3 + (bot(p) > 7.5 ? 50 : 0) }),
    // purple (Luna, top): WT to the top; crate 0 down chute A into the orange socket
    boardWith(SOL, 0, 5, 14, 3, 1), atTop(press(LUNA, 35, 6)), waitPlat(6, 14),
    seek(SOL, 'sol sends crate 0 down chute A', (S, p) => bot(S.b[0]) > 14.5 && cx(S.b[0]) > 10 && cx(S.b[0]) < 12 && bot(p) < 7.5 && cx(p) > 8.2,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 11) * 13 + Math.abs(bot(S.b[0]) - 15) * 3 + (bot(p) > 7.5 ? 50 : 0) }),
    // 5. the ferry over the heart: each sets the lever on the other's side
    atTop(goto(SOL, 15, 5, K)), atTop(press(LUNA, 27, 6, K)), waitPlat(15, 6),
    atTop(goto(SOL, 26, 5, K)), atTop(goto(SOL, 27, 6, K)), atTop(goto(SOL, 33, 6, K)), atTop(grab(SOL, 38, 6, K)), atTop(flip(SOL, 37, 6, false)), atTop(goto(SOL, 27, 6, K)), atTop(goto(SOL, 24, 5, K)),
    atTop(goto(LUNA, 30, 6, K)), waitPlat(15, 6, false),     // Luna steps off pink: the ferry brings Sol back
    atTop(goto(SOL, 13, 5, K)), atTop(press(SOL, 12, 6, K)), waitPlat(15, 6), atTop(goto(LUNA, 26, 5, K)), atTop(goto(LUNA, 24, 5, K)),
    atTop(goto(SOL, 8, 6, K)), waitPlat(15, 6, false),       // and Sol brings Luna across
    atTop(goto(LUNA, 13, 5, K)), atTop(goto(LUNA, 12, 6, K)), atTop(grab(LUNA, 1, 6, K)), atTop(flip(LUNA, 2, 6, true)), // the pink lever on: pink gate open
    // 6. into the heart: the point's gems, a gem in the other's lobe, then the doors
    goto(SOL, 19, 13, K), grab(SOL, 18, 9, K), goto(SOL, 19, 13, K), grab(SOL, 20, 16, K), goto(SOL, 23, 13, K), door(SOL, K),
    goto(LUNA, 23, 13, K), grab(LUNA, 24, 9, K), goto(LUNA, 23, 13, K), grab(LUNA, 22, 16, K), goto(LUNA, 19, 13, K), door(LUNA, K), win(),
  ],
};
