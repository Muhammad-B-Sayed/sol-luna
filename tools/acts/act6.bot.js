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
const atTop = (ph) => { const g = ph.goal; ph.goal = (S, p) => g(S, p) && bot(p) < 6.5; ph.sig += '|top'; return ph; };

export const SCRIPTS = {
  // crate 0 is Sol's (west), crate 1 Luna's (east). Each lift is worked from the other side.
  32: () => [
    grab(SOL, 15, 24), grab(LUNA, 24, 24),                 // the hall's far corners
    press(SOL, 16, 27),                                    // Sol holds orange, far from Luna's gate
    goto(LUNA, 30, 27), press(LUNA, 32, 26),               // through her moon channel; she holds white: Sol's gate
    goto(SOL, 9, 27), pushTo(SOL, 0, 2.2, { y: 27, tol: 0.5 }),                   // through his sun channel; crate 0 off the ledge onto WL
    grab(SOL, 1, 24),
    pushTo(LUNA, 1, 36.3, { y: 27, tol: 0.5 }), grab(LUNA, 38, 24), boardWith(LUNA, 1, 35, 28, 4, -1),   // crate 1 onto EL
    // 1. green (Sol, W0): EL carries Luna and crate 1 to E1
    press(SOL, 7, 26), waitPlat(36, 28),
    pushTo(LUNA, 1, 29.7, { y: 19, tol: 0.3 }), stepTo(LUNA, 33, 19, 1, 29.6, 31.4),
    // 2. purple (Luna, E1): WL carries Sol and crate 0 to W1
    boardWith(SOL, 0, 1, 28, 4, 1), pressKeep(LUNA, 28, 19, 1, 29.6, 31.4), waitPlat(2, 28),
    pushTo(SOL, 0, 8.7, { y: 19, tol: 0.3 }), stepTo(SOL, 6, 19, 0, 8.6, 10.4),
    // 3. orange (Sol, W1): EM to E1.5
    boardWith(LUNA, 1, 29, 20, 3, 1), pressKeep(SOL, 11, 19, 0, 8.6, 10.4), waitPlat(30, 20),
    pushTo(LUNA, 1, 32.7, { y: 15, tol: 0.3 }), stepTo(LUNA, 28, 15, 1, 32.6, 34.4), keepCrate(grab(LUNA, 36, 13), 1, 32.6, 34.4), keepCrate(goto(LUNA, 28, 15), 1, 32.6, 34.4),
    // 4. white (Luna, E1.5): WM to W1.5
    boardWith(SOL, 0, 8, 20, 3, -1), pressKeep(LUNA, 37, 15, 1, 32.6, 34.4), waitPlat(9, 20),
    pushTo(SOL, 0, 5.3, { y: 15, tol: 0.3 }), stepTo(SOL, 11, 15, 0, 5.6, 7.4), keepCrate(grab(SOL, 3, 13), 0, 5.6, 7.4), keepCrate(goto(SOL, 11, 15), 0, 5.6, 7.4),
    // 5. purple (Sol, W1.5): EU to E2
    boardWith(LUNA, 1, 32, 16, 3, -1), pressKeep(SOL, 2, 15, 0, 5.6, 7.4), waitPlat(33, 16),
    grab(LUNA, 35, 9), pushTo(LUNA, 1, 30.4, { y: 11, tol: 0.3 }), stepTo(LUNA, 34.8, 11, 1, 30.3, 31.4),
    // 6. green (Luna, E2): WU to W2
    boardWith(SOL, 0, 5, 16, 3, 1), pressKeep(LUNA, 36, 11, 1, 30.3, 31.4), waitPlat(6, 16),
    grab(SOL, 4, 9), pushTo(SOL, 0, 8.3, { y: 11, tol: 0.3 }), stepTo(SOL, 4.2, 11, 0, 8.6, 10.4),
    // 7. orange (Sol, W2): ET to the top; crate 1 down chute B into the white socket
    boardWith(LUNA, 1, 29, 12, 3, 1), pressKeep(SOL, 3, 11, 0, 8.6, 10.4), waitPlat(30, 12),
    pushTo(LUNA, 1, 36, { y: 5, tol: 0.4 }),
    seek(LUNA, 'luna sends crate 1 down chute B', (S, p) => bot(S.b[1]) > 12.5 && cx(S.b[1]) > 37 && bot(p) < 6.5,
      { h: (S, p) => Math.abs(cx(S.b[1]) - 37.9) * 13 + Math.abs(bot(S.b[1]) - 13) * 3 + (bot(p) > 6.5 ? 50 : 0) }),
    // 8. purple (Luna, top): WT to the top; crate 0 down chute A into the orange socket
    boardWith(SOL, 0, 8, 12, 3, -1), press(LUNA, 28, 4), waitPlat(9, 12),
    pushTo(SOL, 0, 3, { y: 5, tol: 0.4 }),
    seek(SOL, 'sol sends crate 0 down chute A', (S, p) => bot(S.b[0]) > 12.5 && cx(S.b[0]) < 3 && bot(p) < 6.5,
      { h: (S, p) => Math.abs(cx(S.b[0]) - 1.9) * 13 + Math.abs(bot(S.b[0]) - 13) * 3 + (bot(p) > 6.5 ? 50 : 0) }),
    // the ferry over the heart: each sets the lever on the other's side
    goto(SOL, 15, 5, K), press(LUNA, 32, 5, K), waitPlat(15, 6),
    goto(SOL, 28, 4, K), grab(SOL, 29, 3, K), goto(SOL, 33, 5, K), goto(SOL, 36, 5), atTop(flip(SOL, 35, 5, false)),
    goto(SOL, 32, 5, K), goto(SOL, 26, 5, K),
    goto(LUNA, 34, 5, K), waitPlat(15, 6, false),        // Luna steps off pink: the ferry brings Sol back
    press(SOL, 12, 4, K), waitPlat(15, 6), goto(LUNA, 26, 5, K),
    goto(SOL, 10.6, 4, K), waitPlat(15, 6, false), grab(LUNA, 10, 3, K),   // and Sol brings Luna across
    atTop(flip(LUNA, 4, 5, true)),                         // the pink lever on: pink gate open
    goto(SOL, 3, 5, K), goto(SOL, 10, 11, K), goto(SOL, 16, 11, K), grab(SOL, 19, 8, K),
    goto(LUNA, 3, 5, K), goto(LUNA, 10, 11, K), goto(LUNA, 16, 11, K), grab(LUNA, 24, 8, K),
    door(SOL, K), door(LUNA, K), win(),
  ],
};
