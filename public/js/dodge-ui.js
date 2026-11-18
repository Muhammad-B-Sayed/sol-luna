// Sol & Luna — Dodgeball HUD (drawn on the canvas in world units) and sounds from state changes.
import { DODGE, ownerOf, DP_READY, DP_PLAY, DP_POINT, DP_OVER } from '/shared/dodge.js';
import { WORLD_W, WORLD_H, SOL, LUNA } from '/shared/sim.js';

const NAME = ['Sol', 'Luna'];
const INK = ['#ffd27a', '#a9e3ff'];
const FONT = '"Cinzel", Georgia, serif';

export function dodgeHint(online) {
  return online
    ? 'Hold ↓ or S to aim, release to throw. Dodge everything thrown at you.'
    : 'Sol: hold ↓ to aim, release to throw · Luna: hold S · Don\'t get hit!';
}

export function drawDodgeHud(g, S, { online = false, me = SOL, rtt = 0 } = {}) {
  const D = S.d;
  const cx = WORLD_W / 2, y = 4, w = 300, h = 40;
  // score plaque
  g.fillStyle = 'rgba(18,12,30,0.74)';
  plaque(g, cx - w / 2, y, w, h, 12); g.fill();
  g.strokeStyle = 'rgba(214,196,255,0.35)'; g.lineWidth = 1.5; g.stroke();
  g.textBaseline = 'middle';
  g.font = `700 24px ${FONT}`;
  g.textAlign = 'right'; g.fillStyle = INK[SOL]; g.fillText(String(D.score[SOL]), cx - 14, y + 21);
  g.textAlign = 'left'; g.fillStyle = INK[LUNA]; g.fillText(String(D.score[LUNA]), cx + 14, y + 21);
  g.textAlign = 'center'; g.fillStyle = 'rgba(240,230,255,0.6)'; g.font = `600 16px ${FONT}`; g.fillText(':', cx, y + 20);
  g.font = `600 12px ${FONT}`;
  g.textAlign = 'left'; g.fillStyle = INK[SOL]; g.fillText(online && me === SOL ? 'SOL (YOU)' : 'SOL', cx - w / 2 + 12, y + 13);
  g.textAlign = 'right'; g.fillStyle = INK[LUNA]; g.fillText(online && me === LUNA ? '(YOU) LUNA' : 'LUNA', cx + w / 2 - 12, y + 13);
  // pips: hits needed to win
  for (let i = 0; i < DODGE.toWin; i++) {
    pip(g, cx - w / 2 + 16 + i * 12, y + 28, i < D.score[SOL], SOL);
    pip(g, cx + w / 2 - 16 - i * 12, y + 28, i < D.score[LUNA], LUNA);
  }
  // whose ball, and the shot clock
  const own = ownerOf(D);
  if ((D.phase === DP_PLAY || D.phase === DP_READY) && own >= 0) {
    const secs = Math.ceil(D.clock / 60);
    const urgent = D.phase === DP_PLAY && D.clock <= 180;
    g.font = `600 13px ${FONT}`; g.textAlign = 'center';
    g.fillStyle = INK[own];
    const who = online ? (own === me ? 'Your ball' : `${NAME[own]}'s ball`) : `${NAME[own]}'s ball`;
    g.fillText(urgent ? `${who} · throw! ${secs}` : who, own === SOL ? cx - 90 : cx + 90, y + h + 14);
  }
  // corners
  g.font = `500 13px ${FONT}`;
  g.textAlign = 'left'; g.fillStyle = 'rgba(240,230,255,0.75)';
  // fix C: how long your throws wind up against the other player's lag (left corner: the right one sits under the chat button)
  const wu = online && D.lag && D.lag[1 - me] > 0 ? ` · your throws wind up ${Math.round(D.lag[1 - me] * 1000 / 60)} ms` : '';
  g.fillText(`Dodgeball · first to ${DODGE.toWin}${wu}`, 14, 19);
  if (online) {
    g.textAlign = 'right'; g.fillStyle = 'rgba(240,230,255,0.6)';
    g.fillText(`${me === SOL ? 'You are Sol' : 'You are Luna'} · ${Math.round(rtt)} ms`, WORLD_W - 14, 19);
  }
  // banners
  if (D.phase === DP_READY) {
    const a = Math.min(1, D.t / 8);
    const serve = online ? (D.serve === me ? 'You serve' : `${NAME[D.serve]} serves`) : `${NAME[D.serve]} serves`;
    banner(g, serve, 'Ready…', INK[D.serve], a);
  } else if (D.phase === DP_PLAY && D.t < 30) {
    banner(g, 'Throw!', '', '#f4ecff', 1 - D.t / 30);
  } else if (D.phase === DP_POINT || D.phase === DP_OVER) {
    const by = D.lastHit ? D.lastHit.by : D.winner;
    const a = Math.min(1, D.t / 10);
    if (D.winner >= 0 && (D.phase === DP_OVER || D.t > 45)) {
      banner(g, `${NAME[D.winner]} wins!`, `${D.score[SOL]} – ${D.score[LUNA]}`, INK[D.winner], a);
    } else {
      banner(g, `${NAME[by]} hits ${NAME[1 - by]}!`, `${D.score[SOL]} – ${D.score[LUNA]}`, INK[by], a);
    }
  }
}

function banner(g, big, small, color, a) {
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, a));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 40px ${FONT}`;
  g.lineWidth = 6; g.strokeStyle = 'rgba(14,8,26,0.75)';
  g.strokeText(big, WORLD_W / 2, WORLD_H * 0.36);
  g.fillStyle = color; g.fillText(big, WORLD_W / 2, WORLD_H * 0.36);
  if (small) {
    g.font = `600 20px ${FONT}`;
    g.strokeText(small, WORLD_W / 2, WORLD_H * 0.36 + 38);
    g.fillStyle = 'rgba(244,236,255,0.9)'; g.fillText(small, WORLD_W / 2, WORLD_H * 0.36 + 38);
  }
  g.restore();
}
function pip(g, x, y, on, who) {
  g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2);
  if (on) { g.fillStyle = INK[who]; g.fill(); }
  else { g.strokeStyle = 'rgba(240,230,255,0.35)'; g.lineWidth = 1.2; g.stroke(); }
}
function plaque(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.closePath();
}

// ---------------------------------------------------------------------------
// sounds: compare counters against what was last heard; only forward changes make noise

let H = null, ME = -1;   // ME: the viewer online (only they hear their own wind-up), -1 local
const hearOf = (D) => ({ throwN: D.throwN, hitN: D.hitN, pickN: D.pickN, turnN: D.turnN, phase: D.phase, sec: -1, wind: D.wind > 0 });
export function dodgeHearReset(S, me = -1) { H = S && S.d ? hearOf(S.d) : null; ME = me; }
export function dodgeListen(S, sfx) {
  const D = S.d;
  if (!H) H = hearOf(D);
  if (D.wind > 0 && !H.wind && (ME < 0 || ME === D.holder)) sfx.charge(D.holder, D.wind / 60);
  if (D.throwN > H.throwN) sfx.throwBall(D.ball.by);
  if (D.hitN > H.hitN) sfx.hit();
  if (D.pickN > H.pickN) sfx.pickup(D.holder);
  if (D.turnN > H.turnN) sfx.turnover();
  if (D.phase === DP_PLAY && H.phase === DP_READY) sfx.go();
  if (D.phase === DP_OVER && H.phase !== DP_OVER) sfx.win();
  const own = ownerOf(D), sec = Math.ceil(D.clock / 60);
  if (D.phase === DP_PLAY && own >= 0 && D.clock <= 180 && sec !== H.sec) sfx.tock();
  H = { ...hearOf(D), sec: D.phase === DP_PLAY && own >= 0 && D.clock <= 180 ? sec : -1 };
}
