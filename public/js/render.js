// Sol & Luna — resolution-independent canvas renderer.
// Everything is drawn with vector paths at the device's native pixel density;
// the static temple (background + stone) is cached once per level/resize.
import {
  TS, COLS, ROWS, WORLD_W, WORLD_H, POOL_DEPTH, T_SOLID, T_SLOPE_R, T_SLOPE_L, T_SUN, T_MOON, T_SHADE,
  tileAt, PH_DEAD, PH_WON, SOL, LUNA, PHYS,
} from '/shared/sim.js';

export const GROUP_COLORS = ['#b98cff', '#5fd39a', '#ff9f5a', '#e8eef7'];

const LIQ = {
  [T_SUN]: { top: '#fff1a8', a: '#ffb02e', b: '#e2531c', glow: 'rgba(255,170,40,0.55)' },
  [T_MOON]: { top: '#eaffff', a: '#7fd6ff', b: '#2f6fd8', glow: 'rgba(120,200,255,0.5)' },
  [T_SHADE]: { top: '#9dffb9', a: '#3a7d55', b: '#1d1530', glow: 'rgba(110,255,160,0.35)' },
};

// deterministic hash for texture variety
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.L = null;
    this.bg = null;
    this.particles = [];
    this.prevDraw = null;
    this.shake = 0;
  }

  resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.scale = this.cv.width / WORLD_W;
    if (this.L) this.buildStatic();
  }

  setLevel(L) {
    this.L = L;
    this.particles = [];
    this.prevDraw = null;
    this.buildStatic();
  }

  // -------------------------------------------------------------------------
  // static layer

  buildStatic() {
    const L = this.L;
    const c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d');
    g.scale(this.scale, this.scale);
    this.drawBackground(g);
    this.drawStone(g, L);
    this.bg = c;
  }

  drawBackground(g) {
    const grd = g.createLinearGradient(0, 0, 0, WORLD_H);
    grd.addColorStop(0, '#2a2342');
    grd.addColorStop(0.55, '#231d36');
    grd.addColorStop(1, '#1b1729');
    g.fillStyle = grd;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // recessed back-wall blocks (two tiles wide, offset rows)
    for (let y = 0; y < ROWS; y++) {
      for (let x = -1; x < COLS; x += 2) {
        const ox = (y % 2) ? 0 : 1;
        const bx = (x + ox) * TS, by = y * TS;
        const v = hash(x + ox, y);
        g.fillStyle = `rgba(${60 + v * 18},${52 + v * 14},${92 + v * 20},0.55)`;
        g.fillRect(bx + 1.5, by + 1.5, TS * 2 - 3, TS - 3);
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.fillRect(bx + 1.5, by + 1.5, TS * 2 - 3, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(bx + 1.5, by + TS - 3, TS * 2 - 3, 1.5);
      }
    }
    // faint carved celestial glyphs
    g.save();
    g.globalAlpha = 0.07;
    g.strokeStyle = '#e8dcff';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x = 80 + hash(i, 7) * 800, y = 70 + hash(7, i) * 560, r = 26 + hash(i, i) * 30;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      if (i % 2) { g.beginPath(); g.arc(x + r * 0.35, y - r * 0.1, r * 0.8, 0, Math.PI * 2); g.stroke(); }
      else for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
        g.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45); g.stroke();
      }
    }
    g.restore();
    // vignette
    const v = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 200, WORLD_W / 2, WORLD_H / 2, 700);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  drawStone(g, L) {
    const solid = (x, y) => { const t = tileAt(L, x, y); return t === T_SOLID || t >= T_SUN; };
    const filled = (x, y) => tileAt(L, x, y) !== 0;
    // drop shadow cast by stone onto the back wall
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (filled(x, y) && !filled(x + 1, y + 1)) {
        const t = tileAt(L, x, y);
        if (t === T_SOLID || t >= T_SUN) g.fillRect(x * TS + 5, y * TS + 5, TS, TS);
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = tileAt(L, x, y);
      const px = x * TS, py = y * TS;
      if (t === T_SOLID || t >= T_SUN) {
        const v = hash(x, y);
        const top = t >= T_SUN ? py + POOL_DEPTH + 6 : py;
        const base = g.createLinearGradient(0, py, 0, py + TS);
        base.addColorStop(0, `hsl(${262 + v * 10}, 16%, ${38 + v * 5}%)`);
        base.addColorStop(1, `hsl(${258 + v * 10}, 18%, ${31 + v * 4}%)`);
        g.fillStyle = base;
        g.fillRect(px, top, TS, py + TS - top);
        // brick seams: running bond every row
        g.fillStyle = 'rgba(20,14,34,0.35)';
        g.fillRect(px, py + TS - 1, TS, 1);
        if ((x + y) % 2 === 0) g.fillRect(px + TS - 1, top, 1, py + TS - top);
        // speckle
        for (let k = 0; k < 3; k++) {
          const sx = px + hash(x * 3 + k, y) * TS, sy = top + hash(x, y * 3 + k) * (py + TS - top);
          g.fillStyle = k ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
          g.fillRect(sx, sy, 2, 2);
        }
        // exposed edges: bright lip on top, dark underside, soft sides
        const open = (dx, dy) => !filled(x + dx, y + dy) || (dy === -1 && tileAt(L, x, y - 1) >= T_SUN);
        if (t < T_SUN && open(0, -1)) {
          g.fillStyle = '#a99bd0'; g.fillRect(px, py, TS, 3);
          g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(px, py, TS, 1);
          // moss-like twilight lichen
          if (hash(x, y + 99) > 0.55) { g.fillStyle = 'rgba(140,220,200,0.28)'; g.fillRect(px + hash(x, 5) * 14, py + 3, 6 + hash(5, x) * 8, 2); }
        }
        if (open(0, 1)) { g.fillStyle = 'rgba(10,6,20,0.45)'; g.fillRect(px, py + TS - 3, TS, 3); }
        if (open(-1, 0) && tileAt(L, x - 1, y) !== T_SLOPE_R) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px, top, 2, py + TS - top); }
        if (open(1, 0) && tileAt(L, x + 1, y) !== T_SLOPE_L) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + TS - 2, top, 2, py + TS - top); }
        if (t >= T_SUN) {
          // basin lip
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(px, top, TS, 2);
        }
      } else if (t === T_SLOPE_R || t === T_SLOPE_L) {
        const v = hash(x, y);
        g.beginPath();
        if (t === T_SLOPE_R) { g.moveTo(px, py + TS); g.lineTo(px + TS, py); g.lineTo(px + TS, py + TS); }
        else { g.moveTo(px, py); g.lineTo(px + TS, py + TS); g.lineTo(px, py + TS); }
        g.closePath();
        g.fillStyle = `hsl(${262 + v * 10}, 16%, ${36 + v * 5}%)`;
        g.fill();
        g.strokeStyle = '#a99bd0'; g.lineWidth = 3;
        g.beginPath();
        if (t === T_SLOPE_R) { g.moveTo(px, py + TS - 1); g.lineTo(px + TS, py + 1); }
        else { g.moveTo(px, py + 1); g.lineTo(px + TS, py + TS - 1); }
        g.stroke();
      }
    }
  }

  // -------------------------------------------------------------------------
  // frame

  draw(L, S, view, time) {
    const g = this.ctx, sc = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bg && this.bg.width && this.bg.height) g.drawImage(this.bg, 0, 0);   // a 0x0 window (hidden tab) leaves bg empty
    let shx = 0, shy = 0;
    if (this.shake > 0) { shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; this.shake *= 0.86; if (this.shake < 0.3) this.shake = 0; }
    g.setTransform(sc, 0, 0, sc, shx * sc, shy * sc);

    this.observe(L, S, time);

    this.drawDoors(g, L, S, time);
    this.drawLevers(g, L, S);
    this.drawButtons(g, L, S);
    this.drawPlats(g, L, S, view);
    this.drawBoxes(g, S, view);
    this.drawGems(g, L, S, time);
    for (const i of [LUNA, SOL]) this.drawPlayer(g, S, i, view, time);
    this.drawLiquids(g, L, time);
    this.drawParticles(g);

    if (S.phase === PH_DEAD) {
      const k = Math.min(1, S.phaseT / 50);
      g.fillStyle = `rgba(10,6,20,${0.35 * k})`;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  // spawn particles / shake from observed state transitions
  observe(L, S, time) {
    const prev = this.prevDraw;
    const cur = { gm: S.gm.slice(), phase: S.phase, tick: S.tick, alive: S.p.map(p => p.alive), jump: S.p.map(p => p.jumpN), gr: S.p.map(p => p.gr), vy: S.p.map(p => p.vy) };
    if (prev && prev.tick <= S.tick) {
      S.gm.forEach((v, i) => { if (v && !prev.gm[i]) this.burst(L.gems[i].x, L.gems[i].y, L.gems[i].kind === SOL ? '#ffd166' : '#9fe7ff', 18, 2.6); });
      S.p.forEach((p, i) => {
        if (!p.alive && prev.alive[i]) { this.smoke(p.x + p.w / 2, p.y + p.h / 2); this.shake = 9; }
        if (p.gr && !prev.gr[i] && prev.vy[i] > 5) this.dust(p.x + p.w / 2, p.y + p.h, i);
      });
    }
    // ambient emitters
    for (const i of [SOL, LUNA]) {
      const p = S.p[i];
      if (!p.alive || S.phase === PH_WON) continue;
      if (Math.random() < (i === SOL ? 0.5 : 0.25)) {
        this.particles.push(i === SOL
          ? { x: p.x + p.w / 2 + (Math.random() - 0.5) * 12, y: p.y + 4, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8, life: 26, max: 26, r: 2.2, c: Math.random() < 0.5 ? '#ffd166' : '#ff7b3a', add: true }
          : { x: p.x + p.w / 2 + (Math.random() - 0.5) * 16, y: p.y + 6 + Math.random() * 10, vx: (Math.random() - 0.5) * 0.3, vy: -0.25, life: 40, max: 40, r: 1.6, c: '#cfefff', add: true, star: true });
      }
    }
    this.prevDraw = cur;
  }

  burst(x, y, c, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.4 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30, max: 30, r: 2.4, c, add: true, star: i % 3 === 0 });
    }
  }
  smoke(x, y) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 1.6;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.9, life: 70, max: 70, r: 6 + Math.random() * 6, c: '#3b3350', grow: 0.12 });
    }
  }
  dust(x, y, who) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 16, y: y - 2, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 0.8, life: 22, max: 22, r: 2.5, c: who === SOL ? 'rgba(255,200,140,0.7)' : 'rgba(190,230,255,0.7)' });
    }
  }

  drawParticles(g) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grow ? -0.01 : 0.02; p.life--;
      if (p.grow) p.r += p.grow;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      const a = p.life / p.max;
      g.globalAlpha = a * (p.grow ? 0.5 : 1);
      g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      g.fillStyle = p.c;
      if (p.star) {
        const r = p.r * 1.6;
        g.beginPath(); g.moveTo(p.x, p.y - r); g.lineTo(p.x + r * 0.3, p.y); g.lineTo(p.x, p.y + r); g.lineTo(p.x - r * 0.3, p.y); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(p.x - r, p.y); g.lineTo(p.x, p.y + r * 0.3); g.lineTo(p.x + r, p.y); g.lineTo(p.x, p.y - r * 0.3); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (ps.length > 600) ps.splice(0, ps.length - 600);
  }

  drawLiquids(g, L, time) {
    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        const t = tileAt(L, x, y);
        if (t < T_SUN) { x++; continue; }
        let x1 = x;
        while (x1 + 1 < COLS && tileAt(L, x1 + 1, y) === t) x1++;
        const c = LIQ[t];
        const px0 = x * TS, px1 = (x1 + 1) * TS, py = y * TS;
        const surf = (px) => py + 4 + Math.sin(px * 0.09 + time * 3.1 + y) * 1.3 + Math.sin(px * 0.21 - time * 2.3) * 0.7;
        const bottom = py + POOL_DEPTH + 7;
        // glow
        g.globalCompositeOperation = 'lighter';
        const glow = g.createLinearGradient(0, py - 18, 0, py + 6);
        glow.addColorStop(0, 'rgba(0,0,0,0)');
        glow.addColorStop(1, c.glow);
        g.fillStyle = glow;
        g.fillRect(px0, py - 18, px1 - px0, 24);
        g.globalCompositeOperation = 'source-over';
        // body
        g.beginPath();
        g.moveTo(px0, bottom);
        for (let px = px0; px <= px1; px += 4) g.lineTo(px, surf(px));
        g.lineTo(px1, surf(px1));
        g.lineTo(px1, bottom);
        g.closePath();
        const body = g.createLinearGradient(0, py, 0, bottom);
        body.addColorStop(0, c.a); body.addColorStop(1, c.b);
        g.fillStyle = body;
        g.fill();
        // bright surface line
        g.beginPath();
        for (let px = px0; px <= px1; px += 4) { const sy = surf(px); px === px0 ? g.moveTo(px, sy) : g.lineTo(px, sy); }
        g.strokeStyle = c.top; g.lineWidth = 2; g.stroke();
        // bubbles / motes
        for (let k = 0; k < (x1 - x + 1); k++) {
          const ph = (time * (0.6 + hash(k, y) * 0.5) + hash(y, k + x)) % 1;
          const bx = px0 + (k + hash(k + x, y)) * TS, by = bottom - ph * (bottom - py - 4);
          g.globalAlpha = 0.5 * (1 - ph);
          g.fillStyle = c.top;
          g.beginPath(); g.arc(bx, by, 1.4, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        x = x1 + 1;
      }
    }
  }

  drawGems(g, L, S, time) {
    L.gems.forEach((gm, i) => {
      if (S.gm[i]) return;
      const bob = Math.sin(time * 2.6 + i) * 2.5;
      const x = gm.x, y = gm.y + bob;
      const sun = gm.kind === SOL;
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(x, y, 1, x, y, 18);
      halo.addColorStop(0, sun ? 'rgba(255,190,70,0.55)' : 'rgba(120,210,255,0.55)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo;
      g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      const w = 9, h = 11;
      const grd = g.createLinearGradient(x - w, y - h, x + w, y + h);
      grd.addColorStop(0, sun ? '#fff3b0' : '#e6fbff');
      grd.addColorStop(0.5, sun ? '#ffb238' : '#5cc6ff');
      grd.addColorStop(1, sun ? '#d9480f' : '#2453c9');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w, y - 2); g.lineTo(x, y + h); g.lineTo(x - w, y - 2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w * 0.45, y - 2); g.lineTo(x, y - 1); g.lineTo(x - w * 0.45, y - 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
      const tw = (Math.sin(time * 5 + i * 1.7) + 1) / 2;
      if (tw > 0.75) {
        g.fillStyle = '#fff';
        const r = 3 * (tw - 0.75) * 4;
        g.fillRect(x + 4 - r / 2, y - 6 - 0.5, r, 1); g.fillRect(x + 4 - 0.5, y - 6 - r / 2, 1, r);
      }
    });
  }

  drawDoors(g, L, S, time) {
    L.doors.forEach((d, i) => {
      const sun = i === SOL;
      const w = 36, h = 52, x = d.cx - w / 2, y = d.bottom - h;
      const open = S.dr[i];
      // frame
      g.fillStyle = '#4b4266';
      roundTop(g, x - 5, y - 5, w + 10, h + 5, 20); g.fill();
      g.fillStyle = sun ? '#d9a441' : '#8fb6e6';
      roundTop(g, x - 3, y - 3, w + 6, h + 3, 18); g.fill();
      // interior
      g.fillStyle = '#120d1f';
      roundTop(g, x, y, w, h, 16); g.fill();
      g.save();
      roundTop(g, x, y, w, h, 16); g.clip();
      const inner = g.createRadialGradient(d.cx, d.bottom - 18, 2, d.cx, d.bottom - 18, 40);
      inner.addColorStop(0, sun ? 'rgba(255,190,90,0.9)' : 'rgba(140,210,255,0.9)');
      inner.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = inner;
      g.globalAlpha = 0.25 + 0.75 * open;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      // sliding panel
      const py = y - open * (h - 4);
      const pg = g.createLinearGradient(x, py, x + w, py);
      pg.addColorStop(0, sun ? '#8c5a1c' : '#2c4f86');
      pg.addColorStop(0.5, sun ? '#b9792a' : '#3d69ad');
      pg.addColorStop(1, sun ? '#7a4c16' : '#26467a');
      g.fillStyle = pg;
      g.fillRect(x, py, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 1; k < 4; k++) g.fillRect(x, py + k * 13, w, 1.5);
      // emblem
      const ex = d.cx, ey = py + 22;
      const pulse = S.p[i].atDoor ? 1 : 0.55 + 0.15 * Math.sin(time * 2);
      g.globalAlpha = pulse;
      if (sun) {
        g.fillStyle = '#ffe28a';
        g.beginPath(); g.arc(ex, ey, 6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffe28a'; g.lineWidth = 2;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + time * 0.5; g.beginPath(); g.moveTo(ex + Math.cos(a) * 8.5, ey + Math.sin(a) * 8.5); g.lineTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 12); g.stroke(); }
      } else {
        g.fillStyle = '#d8f1ff';
        crescent(g, ex, ey, 10);
        g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
    });
  }

  drawButtons(g, L, S) {
    L.buttons.forEach((b, i) => {
      const c = GROUP_COLORS[b.g % 4];
      const down = S.btn[i];
      const h = down ? 2 : 5;
      g.fillStyle = '#2b2440';
      g.fillRect(b.x + 1, b.floor - 3, b.w - 2, 3);
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(b.x + 4, b.floor - 1); g.lineTo(b.x + 7, b.floor - h); g.lineTo(b.x + b.w - 7, b.floor - h); g.lineTo(b.x + b.w - 4, b.floor - 1);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(b.x + 8, b.floor - h, b.w - 16, 1);
      if (down) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = hexA(c, 0.25);
        g.fillRect(b.x, b.floor - 10, b.w, 9);
        g.globalCompositeOperation = 'source-over';
      }
    });
  }

  drawLevers(g, L, S) {
    L.levers.forEach((lv, i) => {
      const c = GROUP_COLORS[lv.g % 4];
      const px = lv.x + TS / 2, py = lv.floor - 3;
      const ang = S.lv[i] * 0.7;
      g.strokeStyle = '#d7d0e6'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(ang) * 22, py - Math.cos(ang) * 22); g.stroke();
      g.fillStyle = c;
      g.beginPath(); g.arc(px + Math.sin(ang) * 22, py - Math.cos(ang) * 22, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4f78';
      g.beginPath(); g.arc(px, lv.floor, 10, Math.PI, 0); g.fill();
      g.fillStyle = c;
      g.fillRect(px - 6, lv.floor - 4, 12, 2);
      g.lineCap = 'butt';
    });
  }

  drawPlats(g, L, S, view) {
    L.plats.forEach((P, i) => {
      const st = S.pl[i];
      const o = view?.pl?.[i];
      const x = o ? o.x : st.x, y = o ? o.y : st.y;
      const c = GROUP_COLORS[P.g % 4];
      const grd = g.createLinearGradient(0, y, 0, y + P.h);
      grd.addColorStop(0, '#8d84ad'); grd.addColorStop(1, '#5d5480');
      g.fillStyle = grd;
      g.fillRect(x, y, P.w, P.h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, P.w, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x, y + P.h - 2, P.w, 2);
      // group glyph stripe
      g.fillStyle = c;
      if (P.w >= P.h) g.fillRect(x + 6, y + P.h / 2 - 1.5, P.w - 12, 3);
      else g.fillRect(x + P.w / 2 - 1.5, y + 6, 3, P.h - 12);
      g.strokeStyle = 'rgba(20,12,36,0.6)'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, P.w - 1, P.h - 1);
    });
  }

  drawBoxes(g, S, view) {
    S.b.forEach((b, i) => {
      const o = view?.b?.[i];
      const x = o ? o.x : b.x, y = o ? o.y : b.y;
      const s = b.w;
      g.fillStyle = '#7a6a52';
      g.fillRect(x, y, s, s);
      g.fillStyle = '#a08b6a';
      g.fillRect(x + 3, y + 3, s - 6, s - 6);
      g.strokeStyle = '#5b4d39'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + s - 4, y + s - 4); g.moveTo(x + s - 4, y + 4); g.lineTo(x + 4, y + s - 4); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, y, s, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + s - 2, s, 2);
    });
  }

  drawPlayer(g, S, i, view, time) {
    const p = S.p[i];
    if (!p.alive) return;
    const o = view?.p?.[i];
    const x = (o ? o.x : p.x) + p.w / 2;
    const yb = (o ? o.y : p.y) + p.h;
    const won = S.phase === PH_WON;
    const fade = won ? Math.max(0, 1 - S.phaseT / 30) : 1;
    if (fade <= 0) return;
    g.save();
    g.globalAlpha = fade;
    const moving = Math.abs(p.vx) > 0.4 && p.gr;
    const runPh = moving ? (time * 14 + i) : 0;
    // squash & stretch
    let sx = 1, sy = 1;
    if (!p.gr) { const k = Math.max(-1, Math.min(1, -p.vy / 8)); sy = 1 + k * 0.12; sx = 1 - k * 0.08; }
    g.translate(x, yb);
    g.scale(p.face * sx, sy);
    // soft glow
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(0, -20, 2, 0, -20, 32);
    halo.addColorStop(0, i === SOL ? 'rgba(255,150,40,0.35)' : 'rgba(110,190,255,0.32)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, -20, 32, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    // legs
    const legA = Math.sin(runPh) * 4, legB = -legA;
    g.strokeStyle = i === SOL ? '#7a2e12' : '#1d3a6b'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4, -9); g.lineTo(-4 + legA, -2); g.moveTo(4, -9); g.lineTo(4 + legB, -2); g.stroke();
    // body
    const bodyC = i === SOL ? ['#ffcf4a', '#f07a1f'] : ['#bfe9ff', '#4c8fe0'];
    const bg = g.createLinearGradient(0, -20, 0, -6);
    bg.addColorStop(0, bodyC[0]); bg.addColorStop(1, bodyC[1]);
    g.fillStyle = bg;
    rrect(g, -7, -19, 14, 12, 5); g.fill();
    // head
    const hy = -25;
    if (i === SOL) {
      // corona of flickering rays
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.36;
        const len = 7 + Math.sin(time * 11 + k * 1.9) * 2.2 + (k === 4 ? 3 : 0);
        g.fillStyle = k % 2 ? '#ff8a2a' : '#ffc23d';
        g.beginPath();
        g.moveTo(Math.cos(a - 0.17) * 9, hy + Math.sin(a - 0.17) * 9);
        g.lineTo(Math.cos(a) * (9 + len), hy + Math.sin(a) * (9 + len) - (k === 4 ? 0 : 0));
        g.lineTo(Math.cos(a + 0.17) * 9, hy + Math.sin(a + 0.17) * 9);
        g.closePath(); g.fill();
      }
      const hg = g.createRadialGradient(-3, hy - 3, 1, 0, hy, 11);
      hg.addColorStop(0, '#fff6c2'); hg.addColorStop(0.6, '#ffc93c'); hg.addColorStop(1, '#f08a1c');
      g.fillStyle = hg;
      g.beginPath(); g.arc(0, hy, 10, 0, Math.PI * 2); g.fill();
    } else {
      const hg = g.createRadialGradient(-3, hy - 3, 1, 0, hy, 11);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.6, '#cdeeff'); hg.addColorStop(1, '#7fb4ef');
      g.fillStyle = hg;
      g.beginPath(); g.arc(0, hy, 10, 0, Math.PI * 2); g.fill();
      // crescent crest sweeping back over the head
      g.fillStyle = '#8fc3ff';
      g.beginPath();
      g.arc(-2, hy - 4, 11, Math.PI * 1.05, Math.PI * 1.95);
      g.arc(-6, hy - 1, 9, Math.PI * 1.85, Math.PI * 1.1, true);
      g.closePath(); g.fill();
      g.fillStyle = '#e9f7ff';
      const tw = 1 + Math.sin(time * 4) * 0.3;
      star(g, -12, hy - 11, 2.4 * tw);
    }
    // face
    const blink = (Math.sin(time * 1.3 + i * 2) > 0.985) ? 0.2 : 1;
    g.fillStyle = i === SOL ? '#5a1d05' : '#14284d';
    g.beginPath(); g.ellipse(3, hy - 1, 1.8, 2.6 * blink, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(8, hy - 1, 1.6, 2.4 * blink, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(3.3, hy - 2.8, 1, 1); g.fillRect(8.2, hy - 2.6, 1, 1);
    g.fillStyle = i === SOL ? 'rgba(255,110,60,0.5)' : 'rgba(150,170,255,0.5)';
    g.beginPath(); g.arc(1, hy + 3, 1.8, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function roundTop(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x, y + h); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h); g.closePath();
}
function crescent(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.3, Math.PI * 1.7);
  g.arc(x + r * 0.55, y - r * 0.05, r * 0.82, Math.PI * 1.55, Math.PI * 0.45, true);
  g.closePath();
}
function star(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
