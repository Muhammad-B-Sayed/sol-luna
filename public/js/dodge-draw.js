// Sol & Luna — Dodgeball visuals: the court veil, the fireball / moonball, trails and effects.
// Called from Renderer.draw() when the level is the dodgeball court. Plain canvas vector
// drawing plus the renderer's particle list; about 60 path fills a frame, so it stays cheap.
import { NET, DODGE, aimSlope, towardNet, sideOf, ownerOf, B_HELD, B_LIVE, B_DEAD, DP_PLAY, DP_POINT } from '/shared/dodge.js';
import { TS, SOL } from '/shared/sim.js';

const TAU = Math.PI * 2;
const FLOOR_Y = 28 * TS;

function fx(R) {
  return R.dodgeFx ||= { trail: [], look: -1, prev: null, rings: [] };
}

// ---------------------------------------------------------------------------
// court: warm and cool halves and the twilight veil down the middle (drawn under everything)

export function drawDodgeCourt(R, g, S, time) {
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,140,40,0.035)'; g.fillRect(TS, TS, NET - TS, FLOOR_Y - TS);
  g.fillStyle = 'rgba(80,140,255,0.04)'; g.fillRect(NET, TS, NET - TS, FLOOR_Y - TS);
  const v = g.createLinearGradient(NET - 16, 0, NET + 16, 0);
  v.addColorStop(0, 'rgba(255,160,70,0)');
  v.addColorStop(0.42, 'rgba(255,180,110,0.14)');
  v.addColorStop(0.5, 'rgba(235,225,255,0.3)');
  v.addColorStop(0.58, 'rgba(130,170,255,0.14)');
  v.addColorStop(1, 'rgba(110,150,255,0)');
  g.fillStyle = v;
  g.fillRect(NET - 16, TS, 32, FLOOR_Y - TS);
  g.fillStyle = `rgba(240,232,255,${0.32 + 0.12 * Math.sin(time * 3.1)})`;
  g.fillRect(NET - 0.75, TS, 1.5, FLOOR_Y - TS);
  // motes drifting up the veil
  for (let k = 0; k < 16; k++) {
    const y = FLOOR_Y - ((time * 36 + k * 41.3) % (FLOOR_Y - TS));
    const x = NET + Math.sin(time * 1.7 + k * 2.1) * 5;
    g.fillStyle = k % 2 ? 'rgba(255,200,120,0.55)' : 'rgba(170,200,255,0.6)';
    g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
// ball, trail, aim and effects (drawn after the players)

export function drawDodge(R, g, S, view, time) {
  const D = S.d, b = D.ball, F = fx(R);
  const bx = view?.ball ? view.ball.x : b.x, by = view?.ball ? view.ball.y : b.y;
  const r = DODGE.r;
  observe(R, F, S, bx, by);

  // which element the ball shows: the holder's, the thrower's while flying, the side's at rest
  const look = D.holder >= 0 ? D.holder : (b.st === B_LIVE || b.st === B_DEAD) ? b.by : sideOf(b.x);
  if (F.look < 0) F.look = look;
  F.look += (look - F.look) * 0.14;
  if (Math.abs(F.look - look) < 0.01) F.look = look;
  const k = b.st === B_LIVE ? 1 : b.st === B_HELD ? 0.85 : b.st === B_DEAD ? 0.6 : 0.7;
  const speed = Math.hypot(b.vx, b.vy);

  // trail: sampled every frame while moving, eaten from the tail when it stops
  const T = F.trail;
  const last = T[T.length - 1];
  if (last && Math.hypot(bx - last.x, by - last.y) > 90) T.length = 0;
  const streaking = b.st === B_LIVE || (b.st === B_DEAD && speed > 2.5);
  if (streaking) { if (!last || last.x !== bx || last.y !== by) T.push({ x: bx, y: by }); }
  else if (T.length) T.splice(0, Math.min(T.length, 2));
  if (T.length > 30) T.splice(0, T.length - 30);
  const maxLen = b.st === B_LIVE ? 280 : 120;
  if (F.look < 0.999) drawTrail(g, T, bx, by, r, maxLen, FIRE_TRAIL, (1 - F.look) * k);
  if (F.look > 0.001) drawTrail(g, T, bx, by, r, maxLen, MOON_TRAIL, F.look * k);

  // aim arrow while the holder charges (both players see it)
  if (D.holder >= 0 && D.aim[D.holder] >= 0) drawAim(g, D, bx, by, time);

  // the ball itself (cross-fades between the two elements)
  if (F.look < 0.999) drawFire(g, bx, by, r, b.vx, b.vy, time, 1 - F.look, k);
  if (F.look > 0.001) drawMoon(g, bx, by, r, b.vx, b.vy, time, F.look, k);
  emit(R, b, bx, by, F.look, speed);

  // shot clock ring for the last three seconds
  const own = ownerOf(D);
  if (D.phase === DP_PLAY && own >= 0 && D.clock <= 180) {
    const f = D.clock / 180;
    const pulse = 0.6 + 0.4 * Math.sin(time * 14);
    g.strokeStyle = `rgba(255,${110 + 80 * f},${120 + 60 * f},${0.55 + 0.35 * pulse})`;
    g.lineWidth = 2.2;
    g.beginPath(); g.arc(bx, by, r * 2.1, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
  }

  // victim flash after a hit
  if (D.phase === DP_POINT && D.lastHit && D.t < 36 && (D.t >> 2) % 2 === 0) {
    const v = S.p[1 - D.lastHit.by], o = view?.p?.[1 - D.lastHit.by];
    const vx = (o ? o.x : v.x) + v.w / 2, vy = (o ? o.y : v.y) + v.h / 2;
    g.globalCompositeOperation = 'lighter';
    const h = g.createRadialGradient(vx, vy, 2, vx, vy, 30);
    h.addColorStop(0, 'rgba(255,255,255,0.8)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h; g.beginPath(); g.arc(vx, vy, 30, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  drawRings(g, F);
}

// spawn bursts and shake from state changes, only on forward progress (rollback safe)
function observe(R, F, S, bx, by) {
  const D = S.d, P = F.prev;
  if (P && S.tick >= P.tick) {
    if (D.throwN > P.throwN) {
      const c = D.ball.by === SOL ? '#ffcf5a' : '#cfe0ff';
      R.burst(bx, by, c, 10, 2.2);
      R.shake = Math.max(R.shake, 2.5);
      F.trail.length = 0;
    }
    if (D.hitN > P.hitN && D.lastHit) {
      const sun = D.lastHit.by === SOL, { x, y } = D.lastHit;
      R.burst(x, y, sun ? '#ffd166' : '#d6e4ff', 26, 4.2);
      R.burst(x, y, sun ? '#ff5a1f' : '#8f7bff', 22, 3);
      R.burst(x, y, '#ffffff', 8, 5);
      F.rings.push({ x, y, age: 0, max: 26, r0: 8, r1: 70, c: sun ? '255,170,60' : '160,170,255' });
      F.rings.push({ x, y, age: -5, max: 22, r0: 4, r1: 44, c: '255,255,255' });
      R.shake = 13;
    }
    if (D.pickN > P.pickN) {
      F.rings.push({ x: bx, y: by, age: 0, max: 16, r0: 6, r1: 26, c: D.holder === SOL ? '255,200,110' : '180,200,255' });
    }
    if (D.turnN > P.turnN) {
      R.smoke(P.bx, P.by);
      F.rings.push({ x: bx, y: by, age: 0, max: 20, r0: 4, r1: 36, c: '255,120,120' });
    }
  }
  if (!P || S.tick >= P.tick || S.tick < P.tick - 600) {
    F.prev = { tick: S.tick, throwN: D.throwN, hitN: D.hitN, pickN: D.pickN, turnN: D.turnN, bx, by };
  }
}

// ---------------------------------------------------------------------------
// fireball

function drawFire(g, x, y, r, vx, vy, time, alpha, k) {
  const sp = Math.hypot(vx, vy);
  const moving = sp > 2;
  const back = moving ? Math.atan2(-vy, -vx) : -Math.PI / 2;   // flames stream behind, or rise
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'lighter';
  // heat glow
  const G = r * (3 + 0.6 * k);
  const glow = g.createRadialGradient(x, y, r * 0.3, x, y, G);
  glow.addColorStop(0, `rgba(255,180,70,${0.6 * k})`);
  glow.addColorStop(0.35, `rgba(255,96,24,${0.28 * k})`);
  glow.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(x, y, G, 0, TAU); g.fill();
  // flame tongues: an outer red-orange layer and an inner gold layer, each flickering
  const stretch = 0.9 + Math.min(1.8, sp / 9);
  const spread = moving ? 1.5 : 2.3;
  const layers = [[7, 1, 'rgba(255,72,18,0.8)', 0.55, 0], [6, 0.68, 'rgba(255,186,60,0.9)', 0.42, 1.3], [4, 0.4, 'rgba(255,246,190,0.9)', 0.3, 2.6]];
  for (const [n, len, col, w, ph] of layers) {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const a = back + u * spread + Math.sin(time * 19 + i * 2.3 + ph) * 0.13;
      const L = r * (0.5 + stretch * len * (0.8 + 0.35 * Math.sin(time * 23 + i * 1.7 + ph))) * (1 - Math.abs(u) * 0.7);
      const ca = Math.cos(a), sa = Math.sin(a);
      const tx = x + ca * (r + L), ty = y + sa * (r + L) - (moving ? 0 : L * 0.15);
      const b1 = a - w, b2 = a + w;
      g.moveTo(x + Math.cos(b1) * r * 0.82, y + Math.sin(b1) * r * 0.82);
      g.quadraticCurveTo(x + Math.cos(a - w * 0.35) * (r + L * 0.55), y + Math.sin(a - w * 0.35) * (r + L * 0.55), tx, ty);
      g.quadraticCurveTo(x + Math.cos(a + w * 0.35) * (r + L * 0.55), y + Math.sin(a + w * 0.35) * (r + L * 0.55),
        x + Math.cos(b2) * r * 0.82, y + Math.sin(b2) * r * 0.82);
      g.closePath();
    }
    g.fill();
  }
  // molten core, hottest at the leading edge
  g.globalCompositeOperation = 'source-over';
  const fl = 1 + 0.06 * Math.sin(time * 37) + 0.04 * Math.sin(time * 53 + 1);
  const fx0 = moving ? -Math.cos(back) * r * 0.3 : 0, fy0 = moving ? -Math.sin(back) * r * 0.3 : -r * 0.2;
  const core = g.createRadialGradient(x + fx0, y + fy0, 0.5, x, y, r * fl);
  core.addColorStop(0, '#fffef2');
  core.addColorStop(0.28, '#fff0a0');
  core.addColorStop(0.62, '#ffa526');
  core.addColorStop(1, '#e2421a');
  g.fillStyle = core;
  g.beginPath(); g.arc(x, y, r * fl, 0, TAU); g.fill();
  // churning swirl
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,245,200,0.55)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(x, y, r * 0.58, time * 9, time * 9 + 1.7); g.stroke();
  g.strokeStyle = 'rgba(255,140,40,0.5)';
  g.beginPath(); g.arc(x, y, r * 0.8, -time * 7, -time * 7 + 1.2); g.stroke();
  g.lineCap = 'butt';
  g.restore();
}

// ---------------------------------------------------------------------------
// moonball

function drawMoon(g, x, y, r, vx, vy, time, alpha, k) {
  const sp = Math.hypot(vx, vy);
  const moving = sp > 2;
  const back = moving ? Math.atan2(-vy, -vx) : time * 0.9;   // shadow trails behind; held, it turns
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'lighter';
  // cold glow
  const G = r * (3 + 0.6 * k);
  const glow = g.createRadialGradient(x, y, r * 0.3, x, y, G);
  glow.addColorStop(0, `rgba(200,215,255,${0.75 * k})`);
  glow.addColorStop(0.4, `rgba(140,110,255,${0.32 * k})`);
  glow.addColorStop(1, 'rgba(90,80,255,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(x, y, G, 0, TAU); g.fill();
  // orbiting halo arcs
  const rot = time * (moving ? 5 : 1.6);
  g.strokeStyle = `rgba(205,220,255,${0.42 * k})`; g.lineWidth = 1.2;
  for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x, y, r * 1.72, rot + j * 2.094, rot + j * 2.094 + 1.1); g.stroke(); }
  g.strokeStyle = `rgba(170,140,255,${0.3 * k})`;
  for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(x, y, r * 2.15, -rot * 0.7 + j * 3.14, -rot * 0.7 + j * 3.14 + 0.8); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  // pale body, lit from the front
  const lx = -Math.cos(back) * r * 0.4, ly = -Math.sin(back) * r * 0.4;
  const body = g.createRadialGradient(x + lx, y + ly, 0.5, x, y, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.35, '#e8eeff');
  body.addColorStop(0.75, '#aebcf0');
  body.addColorStop(1, '#7e7ad8');
  g.fillStyle = body;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  // craters
  const roll = moving ? -time * 6 : time * 0.6;
  g.fillStyle = 'rgba(110,110,190,0.35)';
  for (let j = 0; j < 3; j++) {
    const a = roll + j * 2.2, d = r * (0.25 + 0.2 * j);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.18 - 0.03 * j), 0, TAU); g.fill();
  }
  // crescent: the night side sits behind the motion, leaving a bright crescent in front
  const sx = x + Math.cos(back) * r * 0.92, sy = y + Math.sin(back) * r * 0.92;
  g.fillStyle = 'rgba(60,44,140,0.32)';
  g.beginPath(); g.arc(sx - Math.cos(back) * 1.5, sy - Math.sin(back) * 1.5, r * 1.02, 0, TAU); g.fill();
  g.fillStyle = 'rgba(46,32,120,0.55)';
  g.beginPath(); g.arc(sx, sy, r * 0.95, 0, TAU); g.fill();
  g.restore();
  // rim light on the lit edge
  g.globalCompositeOperation = 'lighter';
  const lit = back + Math.PI;
  g.strokeStyle = 'rgba(245,248,255,0.9)'; g.lineWidth = 1.5; g.lineCap = 'round';
  g.beginPath(); g.arc(x, y, r - 0.7, lit - 1.25, lit + 1.25); g.stroke();
  g.lineCap = 'butt';
  // twinkle
  const tw = (Math.sin(time * 6.3) + 1) / 2;
  if (tw > 0.55) {
    const s = (tw - 0.55) * 14, px = x + Math.cos(lit - 0.6) * r * 0.55, py = y + Math.sin(lit - 0.6) * r * 0.55;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(px - s / 2, py - 0.5, s, 1); g.fillRect(px - 0.5, py - s / 2, 1, s);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// trails

const FIRE_TRAIL = { tail: [255, 50, 14], head: [255, 176, 46], core: '255,244,196' };
const MOON_TRAIL = { tail: [118, 82, 255], head: [140, 205, 255], core: '240,246,255', sparkle: true };

function drawTrail(g, T, bx, by, r, maxLen, C, alpha) {
  if (T.length < 2 || alpha <= 0.01) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'butt';   // round caps overlap under additive blending and leave bright beads
  // walk back from the ball, tapering width and fading out by maxLen
  const pts = [{ x: bx, y: by }];
  let acc = 0;
  for (let i = T.length - 1; i >= 0 && acc < maxLen; i--) {
    const p = T[i], q = pts[pts.length - 1];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < 0.5) continue;
    acc += d; pts.push({ x: p.x, y: p.y, acc });
  }
  pts[0].acc = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const f = Math.max(0, 1 - pts[i].acc / maxLen);
      if (f <= 0) break;
      const a = alpha * Math.pow(f, 1.3) * (pass ? 0.9 : 0.7);
      if (pass === 0) {
        const c0 = C.tail, c1 = C.head;
        g.strokeStyle = `rgba(${c0[0] + (c1[0] - c0[0]) * f | 0},${c0[1] + (c1[1] - c0[1]) * f | 0},${c0[2] + (c1[2] - c0[2]) * f | 0},${a})`;
        g.lineWidth = r * 2 * (0.25 + 0.75 * f);
      } else {
        g.strokeStyle = `rgba(${C.core},${a})`;
        g.lineWidth = r * 0.8 * f;
      }
      g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
  }
  if (C.sparkle) {
    g.fillStyle = `rgba(255,255,255,${0.8 * alpha})`;
    for (let i = 2; i < pts.length; i += 3) {
      const f = 1 - pts[i].acc / maxLen; if (f <= 0) break;
      const s = 3.5 * f, o = ((i * 37) % 11) - 5;
      const px = pts[i].x, py = pts[i].y + o;
      g.fillRect(px - s, py - 0.5, s * 2, 1); g.fillRect(px - 0.5, py - s, 1, s * 2);
    }
  }
  g.restore();
}

// embers for the fireball, stardust for the moonball
function emit(R, b, x, y, look, speed) {
  const rate = b.st === B_LIVE ? 3 : b.st === B_HELD ? 0.9 : b.st === B_DEAD ? 0.7 : 0.4;
  const ps = R.particles;
  const vx = b.st === B_LIVE || b.st === B_DEAD ? b.vx : 0, vy = b.st === B_LIVE || b.st === B_DEAD ? b.vy : 0;
  for (let n = rate; n > 0; n--) {
    if (n < 1 && Math.random() > n) break;
    const moon = Math.random() < look;
    const a = Math.random() * TAU, d = Math.random() * DODGE.r;
    if (!moon) {
      ps.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -vx * 0.12 + (Math.random() - 0.5) * 1.1, vy: -vy * 0.12 - 0.5 - Math.random() * 1.1,
        life: 18 + Math.random() * 16 | 0, max: 34, r: 1.2 + Math.random() * 1.5, c: EMBER[Math.random() * EMBER.length | 0], add: true });
    } else {
      ps.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -vx * 0.08 + (Math.random() - 0.5) * 0.7, vy: -vy * 0.08 + (Math.random() - 0.5) * 0.7 - 0.15,
        life: 28 + Math.random() * 18 | 0, max: 46, r: 0.9 + Math.random() * 0.9, c: DUST[Math.random() * DUST.length | 0], add: true, star: Math.random() < 0.6 });
    }
  }
}
const EMBER = ['#ffd166', '#ff9a2e', '#ff5a1a', '#fff0b0'];
const DUST = ['#eef3ff', '#c3b4ff', '#9fd6ff', '#ffffff'];

// aim: a dotted line along the throw direction, in the holder's colour
function drawAim(g, D, bx, by, time) {
  const who = D.holder, s = aimSlope(D.aim[who]), dir = towardNet(who);
  const n = 1 / Math.sqrt(1 + s * s), ux = dir * n, uy = -s * n;
  const sun = who === SOL;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const d = 22 + i * 13, f = 1 - i / 7;
    g.fillStyle = sun ? `rgba(255,${190 + i * 6},${90 + i * 10},${0.85 * f})` : `rgba(${170 + i * 8},${200 + i * 5},255,${0.85 * f})`;
    g.beginPath(); g.arc(bx + ux * d, by + uy * d, 2.6 * f + 0.8, 0, TAU); g.fill();
  }
  // chevron
  const d = 22 + 7 * 13, cx = bx + ux * d, cy = by + uy * d, px = -uy, py = ux;
  g.strokeStyle = sun ? 'rgba(255,214,120,0.75)' : 'rgba(200,220,255,0.75)';
  g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - ux * 7 + px * 6, cy - uy * 7 + py * 6); g.lineTo(cx, cy); g.lineTo(cx - ux * 7 - px * 6, cy - uy * 7 - py * 6);
  g.stroke();
  g.restore();
}

function drawRings(g, F) {
  g.globalCompositeOperation = 'lighter';
  for (let i = F.rings.length - 1; i >= 0; i--) {
    const q = F.rings[i];
    q.age++;
    if (q.age < 0) continue;
    if (q.age > q.max) { F.rings.splice(i, 1); continue; }
    const f = q.age / q.max, rr = q.r0 + (q.r1 - q.r0) * (1 - (1 - f) * (1 - f));
    g.strokeStyle = `rgba(${q.c},${0.85 * (1 - f)})`;
    g.lineWidth = 4 * (1 - f) + 0.5;
    g.beginPath(); g.arc(q.x, q.y, rr, 0, TAU); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

