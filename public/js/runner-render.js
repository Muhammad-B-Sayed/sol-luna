// Sol & Luna — Runner renderer: the endless, scrolling version of render.js.
// Stone is cached in pages of PAGE columns as they scroll in; the back wall scrolls at half
// speed for depth. Liquids, obstacles, players and particles draw every frame.
import { TS, ROWS, WORLD_W, WORLD_H, POOL_DEPTH, T_SOLID, T_SUN, tileAt, SOL, LUNA } from '/shared/sim.js';
import {
  swingPos, RPH_COUNT, RPH_PLAY, RPH_OVER, SLAB_GONE, SLAB_REFORM, SHARD_REGROW,
} from '/shared/runner.js';
import { LIQ, hash, rrect, crescent, star, hexA } from './render.js';

const PAGE = 16;

export class RunnerRenderer {
  constructor(R) {
    this.R = R;           // the main Renderer: canvas, scale, particles, player drawing
    this.pages = new Map();
    this.sc = 0;
    this.prev = null;
    this.shake = 0;
  }

  reset(L) {
    this.L = L;
    this.pages.clear();
    this.R.particles = [];
    this.prev = null;
    this.shake = 0;
  }

  // -------------------------------------------------------------------------
  // cached layers

  buildBack() {
    const sc = this.sc;
    // back wall: one screen wide, drawn twice side by side
    const c = document.createElement('canvas');
    c.width = Math.ceil(WORLD_W * sc); c.height = Math.ceil(WORLD_H * sc);
    const g = c.getContext('2d');
    g.scale(sc, sc);
    const grd = g.createLinearGradient(0, 0, 0, WORLD_H);
    grd.addColorStop(0, '#2a2342'); grd.addColorStop(0.55, '#231d36'); grd.addColorStop(1, '#1b1729');
    g.fillStyle = grd; g.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = -1; x < 40; x += 2) {
        const ox = (y % 2) ? 0 : 1;
        const bx = (x + ox) * TS, by = y * TS;
        const v = hash((x + ox + 40) % 40, y);
        g.fillStyle = `rgba(${60 + v * 18},${52 + v * 14},${92 + v * 20},0.55)`;
        g.fillRect(bx + 1.5, by + 1.5, TS * 2 - 3, TS - 3);
        g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(bx + 1.5, by + 1.5, TS * 2 - 3, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(bx + 1.5, by + TS - 3, TS * 2 - 3, 1.5);
      }
    }
    // tall arched windows onto the twilight sky, one sun-side and one moon-side
    for (const [ax, sun] of [[200, true], [680, false]]) {
      const w = 120, top = 110, bot = 420;
      g.save();
      g.beginPath(); g.moveTo(ax - w / 2, bot); g.lineTo(ax - w / 2, top + w / 2); g.arc(ax, top + w / 2, w / 2, Math.PI, 0); g.lineTo(ax + w / 2, bot); g.closePath();
      const sky = g.createLinearGradient(0, top, 0, bot);
      sky.addColorStop(0, sun ? '#3b2a55' : '#1f2a52'); sky.addColorStop(1, sun ? '#a2577a' : '#3a5f9a');
      g.fillStyle = sky; g.fill();
      g.clip();
      g.globalAlpha = 0.9;
      if (sun) {
        const s = g.createRadialGradient(ax + 18, bot - 60, 2, ax + 18, bot - 60, 60);
        s.addColorStop(0, 'rgba(255,214,120,0.95)'); s.addColorStop(0.35, 'rgba(255,150,70,0.5)'); s.addColorStop(1, 'rgba(255,120,60,0)');
        g.fillStyle = s; g.fillRect(ax - w, top, w * 2, bot - top);
      } else {
        g.fillStyle = '#e8f6ff'; crescent(g, ax - 14, top + 90, 18); g.fill();
        g.fillStyle = '#ffffff';
        for (let k = 0; k < 14; k++) { const sx = ax - w / 2 + hash(k, 3) * w, sy = top + hash(3, k) * (bot - top) * 0.8; g.globalAlpha = 0.4 + hash(k, k) * 0.5; g.fillRect(sx, sy, 1.6, 1.6); }
      }
      g.restore();
      g.strokeStyle = '#4b4266'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(ax - w / 2, bot); g.lineTo(ax - w / 2, top + w / 2); g.arc(ax, top + w / 2, w / 2, Math.PI, 0); g.lineTo(ax + w / 2, bot); g.stroke();
      g.strokeStyle = 'rgba(214,196,255,0.25)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#4b4266'; g.fillRect(ax - 3, top + 10, 6, bot - top - 10); g.fillRect(ax - w / 2, top + 150, w, 5);
    }
    // faint carved glyphs
    g.save(); g.globalAlpha = 0.07; g.strokeStyle = '#e8dcff'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = 420 + hash(i, 7) * 160, y = 80 + hash(7, i) * 520, r = 22 + hash(i, i) * 24;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      if (i % 2) { g.beginPath(); g.arc(x + r * 0.35, y - r * 0.1, r * 0.8, 0, Math.PI * 2); g.stroke(); }
      else for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); g.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45); g.stroke(); }
    }
    g.restore();
    this.back = c;

    // fixed overlay: abyss fog along the bottom and the vignette
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    const h = o.getContext('2d');
    h.scale(sc, sc);
    const fog = h.createLinearGradient(0, WORLD_H - 150, 0, WORLD_H);
    fog.addColorStop(0, 'rgba(12,8,22,0)'); fog.addColorStop(1, 'rgba(12,8,22,0.85)');
    h.fillStyle = fog; h.fillRect(0, WORLD_H - 150, WORLD_W, 150);
    const v = h.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 200, WORLD_W / 2, WORLD_H / 2, 700);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    h.fillStyle = v; h.fillRect(0, 0, WORLD_W, WORLD_H);
    this.over = o;
  }

  page(n) {
    let pg = this.pages.get(n);
    if (pg) return pg;
    const L = this.L, sc = this.sc, x0 = n * PAGE;
    pg = document.createElement('canvas');
    pg.width = Math.ceil(PAGE * TS * sc); pg.height = Math.ceil(WORLD_H * sc);
    const g = pg.getContext('2d');
    g.setTransform(sc, 0, 0, sc, -x0 * TS * sc, 0);
    const filled = (x, y) => tileAt(L, x, y) !== 0;
    // milestones carved into the back wall every 50 tiles from the start
    for (let x = x0; x < x0 + PAGE; x++) {
      const m = x - 10;
      if (m <= 0 || m % 50) continue;
      let gy = 0; while (gy < ROWS && !filled(x, gy)) gy++;
      const py = Math.min(gy, ROWS) * TS - 66;
      g.fillStyle = 'rgba(20,14,34,0.55)'; rrect(g, x * TS - 20, py, 40, 54, 6); g.fill();
      g.strokeStyle = 'rgba(214,196,255,0.3)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(240,230,255,0.55)'; g.font = '600 15px "Cinzel", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(m), x * TS, py + 20);
      g.font = '600 9px "Cinzel", Georgia, serif'; g.fillText('M', x * TS, py + 38);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < ROWS; y++) for (let x = x0 - 1; x < x0 + PAGE; x++) {
      if (filled(x, y) && !filled(x + 1, y + 1)) g.fillRect(x * TS + 5, y * TS + 5, TS, TS);
    }
    for (let y = 0; y < ROWS; y++) for (let x = x0; x < x0 + PAGE; x++) {
      const t = tileAt(L, x, y);
      if (!t) continue;
      const px = x * TS, py = y * TS, v = hash(x, y);
      const top = t >= T_SUN ? py + POOL_DEPTH + 6 : py;
      const base = g.createLinearGradient(0, py, 0, py + TS);
      base.addColorStop(0, `hsl(${262 + v * 10}, 16%, ${38 + v * 5}%)`);
      base.addColorStop(1, `hsl(${258 + v * 10}, 18%, ${31 + v * 4}%)`);
      g.fillStyle = base; g.fillRect(px, top, TS, py + TS - top);
      g.fillStyle = 'rgba(20,14,34,0.35)';
      g.fillRect(px, py + TS - 1, TS, 1);
      if ((x + y) % 2 === 0) g.fillRect(px + TS - 1, top, 1, py + TS - top);
      for (let k = 0; k < 3; k++) {
        const sx = px + hash(x * 3 + k, y) * TS, sy = top + hash(x, y * 3 + k) * (py + TS - top);
        g.fillStyle = k ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(sx, sy, 2, 2);
      }
      const open = (dx, dy) => !filled(x + dx, y + dy) || (dy === -1 && tileAt(L, x, y - 1) >= T_SUN);
      if (t < T_SUN && open(0, -1)) {
        g.fillStyle = '#a99bd0'; g.fillRect(px, py, TS, 3);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(px, py, TS, 1);
        if (hash(x, y + 99) > 0.55) { g.fillStyle = 'rgba(140,220,200,0.28)'; g.fillRect(px + hash(x, 5) * 14, py + 3, 6 + hash(5, x) * 8, 2); }
      }
      if (open(0, 1)) { g.fillStyle = 'rgba(10,6,20,0.45)'; g.fillRect(px, py + TS - 3, TS, 3); }
      if (open(-1, 0)) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px, top, 2, py + TS - top); }
      if (open(1, 0)) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + TS - 2, top, 2, py + TS - top); }
      if (t >= T_SUN) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, top, TS, 2); }
    }
    this.pages.set(n, pg);
    return pg;
  }

  // -------------------------------------------------------------------------
  // frame

  draw(L, S, view, time) {
    const R = this.R, g = R.ctx;
    if (R.scale !== this.sc || !this.back) { this.sc = R.scale; this.pages.clear(); this.buildBack(); }
    const sc = this.sc;
    const cam = Math.round((view ? view.cam : S.cam) * sc) / sc;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const off = ((cam * 0.5) % WORLD_W + WORLD_W) % WORLD_W;
    const bx = Math.round(-off * sc);
    g.drawImage(this.back, bx, 0);
    g.drawImage(this.back, bx + this.back.width - 1, 0);

    let shx = 0, shy = 0;
    if (this.shake > 0) { shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; this.shake *= 0.86; if (this.shake < 0.3) this.shake = 0; }
    this.observe(L, S, view, time);

    // stone pages (integer device pixels, so no seams)
    const n0 = Math.floor(cam / (PAGE * TS)), n1 = Math.floor((cam + WORLD_W) / (PAGE * TS)) + 1;
    for (const k of this.pages.keys()) if (k < n0 - 1 || k > n1 + 1) this.pages.delete(k);
    for (let n = n0; n <= n1; n++) {
      const pg = this.page(n);
      g.drawImage(pg, Math.round((n * PAGE * TS - cam + shx) * sc), Math.round(shy * sc));
    }
    g.setTransform(sc, 0, 0, sc, (-cam + shx) * sc, shy * sc);

    const x0 = cam - 2 * TS, x1 = cam + WORLD_W + 2 * TS;
    for (let i = S.lo; i < S.hi; i++) {
      const o = L.objs[i];
      if (o.ax1 < x0 || o.ax0 > x1) continue;
      const st = S.o[i];
      switch (o.k) {
        case 'vent': this.drawVent(g, o, time); break;
        case 'thorn': this.drawThorns(g, o, time); break;
        case 'stone': this.drawStone(g, o, time); break;
        case 'slab': this.drawSlab(g, o, st, time); break;
        case 'plank': this.drawPlank(g, o, st, time); break;
        case 'swing': this.drawSwing(g, o, S, view, time); break;
        case 'shard': this.drawShard(g, o, st, time); break;
      }
    }
    const fake = { p: S.p, phase: -1, phaseT: 0 };
    for (const i of [LUNA, SOL]) R.drawPlayer(g, fake, i, view, time);
    this.drawLiquids(g, L, cam, time);
    R.drawParticles(g);
    // the dusk wall closing in from the left
    this.drawDusk(g, S, cam, view, time);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.over, 0, 0);
    if (S.phase === RPH_OVER) {
      g.setTransform(sc, 0, 0, sc, 0, 0);
      g.fillStyle = `rgba(10,6,20,${0.3 * Math.min(1, S.phaseT / 40)})`;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  observe(L, S, view, time) {
    const R = this.R, prev = this.prev;
    const cur = { tick: S.tick, alive: S.p.map(p => p.alive), gr: S.p.map(p => p.gr), vy: S.p.map(p => p.vy), o: {} };
    for (let i = S.lo; i < S.hi; i++) if (S.o[i]) cur.o[i] = S.o[i].st;
    if (prev && prev.tick <= S.tick) {
      S.p.forEach((p, i) => {
        if (!p.alive && prev.alive[i]) { R.smoke(p.x + p.w / 2, Math.min(p.y + p.h / 2, WORLD_H - 20)); this.shake = 9; }
        if (p.alive && p.gr && !prev.gr[i] && prev.vy[i] > 5) R.dust(p.x + p.w / 2, p.y + p.h, i);
      });
      for (const k in cur.o) {
        const o = L.objs[k], was = prev.o[k], now = cur.o[k];
        if (was === undefined || was === now) continue;
        if (o.k === 'shard' && now === 3) { this.shatter(o.x + o.w / 2, o.floor); this.shake = Math.max(this.shake, 3); }
        if (o.k === 'slab' && now === 2) this.crumble(o);
        if (o.k === 'slab' && now === 0) R.burst(o.x + o.w / 2, o.y + 4, '#ffb46a', 10, 1.4);
      }
    }
    // ambient: Sol's sparks and Luna's stardust, star-well motes, embers on cracking slabs
    for (const i of [SOL, LUNA]) {
      const p = S.p[i];
      if (!p.alive || S.phase === RPH_OVER) continue;
      if (Math.random() < (i === SOL ? 0.5 : 0.25)) {
        R.particles.push(i === SOL
          ? { x: p.x + p.w / 2 + (Math.random() - 0.5) * 12, y: p.y + 4, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8, life: 26, max: 26, r: 2.2, c: Math.random() < 0.5 ? '#ffd166' : '#ff7b3a', add: true }
          : { x: p.x + p.w / 2 + (Math.random() - 0.5) * 16, y: p.y + 6 + Math.random() * 10, vx: (Math.random() - 0.5) * 0.3, vy: -0.25, life: 40, max: 40, r: 1.6, c: '#cfefff', add: true, star: true });
      }
    }
    for (let i = S.lo; i < S.hi; i++) {
      const o = L.objs[i];
      if (o.k === 'vent' && Math.random() < 0.7) {
        R.particles.push({ x: o.x + Math.random() * o.w, y: WORLD_H - 10, vx: (Math.random() - 0.5) * 0.3, vy: -3 - Math.random() * 2.5, life: 70, max: 70, r: 1.5, c: Math.random() < 0.5 ? '#d8ecff' : '#ffe6a8', add: true, star: Math.random() < 0.3 });
      } else if (o.k === 'slab' && S.o[i].st === 1 && Math.random() < 0.5) {
        R.particles.push({ x: o.x + Math.random() * o.w, y: o.y + 8, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random(), life: 30, max: 30, r: 1.6, c: '#ff9a3c', add: true });
      }
    }
    this.prev = cur;
  }

  shatter(x, y) {
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8), s = 1 + Math.random() * 2.6;
      this.R.particles.push({ x, y: y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 34, max: 34, r: 2, c: i % 2 ? '#d9c7ff' : '#9fe7ff', add: true, star: i % 3 === 0 });
    }
  }
  crumble(o) {
    for (let i = 0; i < 14; i++) this.R.particles.push({ x: o.x + Math.random() * o.w, y: o.y + 5, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.5, life: 40, max: 40, r: 2.5 + Math.random() * 2, c: i % 3 ? '#4a3d5e' : '#ff9a3c' });
  }

  drawLiquids(g, L, cam, time) {
    const c0 = Math.floor(cam / TS) - 1, c1 = Math.ceil((cam + WORLD_W) / TS) + 1;
    for (let y = 0; y < ROWS; y++) {
      let x = c0;
      while (x < c1) {
        const t = tileAt(L, x, y);
        if (t < T_SUN) { x++; continue; }
        let x1 = x;
        while (x1 + 1 < c1 && tileAt(L, x1 + 1, y) === t) x1++;
        const c = LIQ[t];
        const px0 = x * TS, px1 = (x1 + 1) * TS, py = y * TS;
        const surf = (px) => py + 4 + Math.sin(px * 0.09 + time * 3.1 + y) * 1.3 + Math.sin(px * 0.21 - time * 2.3) * 0.7;
        const bottom = py + POOL_DEPTH + 7;
        g.globalCompositeOperation = 'lighter';
        const glow = g.createLinearGradient(0, py - 18, 0, py + 6);
        glow.addColorStop(0, 'rgba(0,0,0,0)'); glow.addColorStop(1, c.glow);
        g.fillStyle = glow; g.fillRect(px0, py - 18, px1 - px0, 24);
        g.globalCompositeOperation = 'source-over';
        g.beginPath(); g.moveTo(px0, bottom);
        for (let px = px0; px <= px1; px += 4) g.lineTo(px, surf(px));
        g.lineTo(px1, surf(px1)); g.lineTo(px1, bottom); g.closePath();
        const body = g.createLinearGradient(0, py, 0, bottom);
        body.addColorStop(0, c.a); body.addColorStop(1, c.b);
        g.fillStyle = body; g.fill();
        g.beginPath();
        for (let px = px0; px <= px1; px += 4) { const sy = surf(px); px === px0 ? g.moveTo(px, sy) : g.lineTo(px, sy); }
        g.strokeStyle = c.top; g.lineWidth = 2; g.stroke();
        for (let k = 0; k < (x1 - x + 1); k++) {
          const ph = (time * (0.6 + hash(k, y) * 0.5) + hash(y, k + x)) % 1;
          const bx = px0 + (k + hash(k + x, y)) * TS, by = bottom - ph * (bottom - py - 4);
          g.globalAlpha = 0.5 * (1 - ph); g.fillStyle = c.top;
          g.beginPath(); g.arc(bx, by, 1.4, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
        x = x1 + 1;
      }
    }
  }

  // dusk thorns: crystal spikes, deadly to both
  drawThorns(g, o, time) {
    const n = Math.round(o.w / 8);
    g.globalCompositeOperation = 'lighter';
    const glow = g.createLinearGradient(0, o.y - 16, 0, o.y);
    glow.addColorStop(0, 'rgba(0,0,0,0)'); glow.addColorStop(1, 'rgba(255,110,200,0.22)');
    g.fillStyle = glow; g.fillRect(o.x, o.y - 16, o.w, 16);
    g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < n; k++) {
      const x = o.x + (k + 0.5) * (o.w / n), hgt = 9 + hash(k, o.x) * 5, lean = (hash(o.x, k) - 0.5) * 3;
      const grd = g.createLinearGradient(0, o.y, 0, o.y - hgt);
      grd.addColorStop(0, '#3b2a5c'); grd.addColorStop(0.6, '#b04fa8'); grd.addColorStop(1, '#ffc2ec');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x - 4, o.y); g.lineTo(x + lean, o.y - hgt); g.lineTo(x + 4, o.y); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(x - 1, o.y - 1); g.lineTo(x + lean, o.y - hgt); g.lineTo(x + 0.5, o.y - 1); g.closePath(); g.fill();
    }
    const tw = (Math.sin(time * 4 + o.x) + 1) / 2;
    if (tw > 0.8) { g.fillStyle = '#fff'; const cx = o.x + o.w * hash(o.x, 3); g.fillRect(cx - 3, o.y - 11, 6, 1); g.fillRect(cx - 0.5, o.y - 14, 1, 6); }
  }

  // eclipse stones: light-forged discs, sun-gold for Sol and moon-silver for Luna
  drawStone(g, o, time) {
    const sun = o.el === SOL;
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.4 + o.x * 0.05);
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(o.x + o.w / 2, o.y + 6, 2, o.x + o.w / 2, o.y + 6, o.w * 0.8);
    halo.addColorStop(0, sun ? `rgba(255,180,60,${0.4 * pulse})` : `rgba(110,190,255,${0.4 * pulse})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(o.x - o.w * 0.3, o.y - o.w * 0.5, o.w * 1.6, o.w);
    g.globalCompositeOperation = 'source-over';
    const grd = g.createLinearGradient(0, o.y, 0, o.y + o.h);
    grd.addColorStop(0, sun ? '#fff1b0' : '#eefaff'); grd.addColorStop(0.45, sun ? '#ffb238' : '#7fc6ff'); grd.addColorStop(1, sun ? '#c2561a' : '#2f5fb8');
    g.fillStyle = grd;
    rrect(g, o.x + 1, o.y, o.w - 2, o.h, 5); g.fill();
    g.strokeStyle = sun ? 'rgba(255,240,200,0.7)' : 'rgba(230,248,255,0.7)'; g.lineWidth = 1; g.stroke();
    // emblem
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    g.fillStyle = sun ? '#fff6d0' : '#ffffff';
    if (sun) {
      g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff6d0'; g.lineWidth = 1.2;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + time; g.beginPath(); g.moveTo(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4.5); g.lineTo(cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5); g.stroke(); }
    } else { crescent(g, cx, cy, 5); g.fill(); }
    // tiny drips of light below
    g.globalAlpha = 0.6;
    for (let k = 0; k < 3; k++) {
      const ph = (time * 0.8 + hash(k, o.x)) % 1;
      g.fillStyle = sun ? '#ffd27a' : '#bfe6ff';
      g.fillRect(o.x + 8 + k * (o.w - 16) / 2, o.y + o.h + ph * 14, 1.5, 3);
    }
    g.globalAlpha = 1;
  }

  // ember slab: basalt with ember veins; cracks, shakes, falls away, re-forms
  drawSlab(g, o, st, time) {
    const veins = (alpha) => {
      g.strokeStyle = `rgba(255,154,60,${alpha})`; g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        let x = o.x + 6 + k * (o.w - 12) / 3 + hash(k, o.x) * 8, y = o.y + 3;
        g.moveTo(x, y);
        for (let j = 0; j < 3; j++) { x += 3 + hash(j, k + o.x) * 5; y += 2; g.lineTo(x, y); }
      }
      g.stroke();
    };
    const body = (x, y, w, a) => {
      g.globalAlpha = a;
      const grd = g.createLinearGradient(0, y, 0, y + o.h);
      grd.addColorStop(0, '#5a4a70'); grd.addColorStop(1, '#2c2340');
      g.fillStyle = grd; g.fillRect(x, y, w, o.h);
      g.fillStyle = '#a99bd0'; g.fillRect(x, y, w, 2);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + o.h - 2, w, 2);
      g.globalAlpha = 1;
    };
    if (st.st === 0 || st.st === 1) {
      const k = st.st === 1 ? st.t / o.crack : 0;
      const sx = st.st === 1 ? Math.sin(time * 70) * 1.4 * k : 0;
      g.save(); g.translate(sx, 0);
      g.globalCompositeOperation = 'lighter';
      const glow = g.createLinearGradient(0, o.y + o.h, 0, o.y + o.h + 14);
      glow.addColorStop(0, `rgba(255,140,50,${0.4 + 0.45 * k})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.fillRect(o.x + 2, o.y + o.h, o.w - 4, 14);
      g.globalCompositeOperation = 'source-over';
      body(o.x, o.y, o.w, 1);
      veins(0.6 + 0.4 * k);
      g.fillStyle = `rgba(255,170,90,${0.5 + 0.5 * k})`; g.fillRect(o.x + 3, o.y + o.h - 2, o.w - 6, 1.5);
      g.restore();
    } else if (st.st === 2) {
      // fragments falling away
      const t = st.t, n = Math.max(2, Math.round(o.w / 16));
      for (let j = 0; j < n; j++) {
        const w = o.w / n, dy = 0.25 * t * t * (0.8 + hash(j, o.x) * 0.4);
        if (dy > 200) continue;
        body(o.x + j * w + 1, o.y + dy, w - 2, Math.max(0, 1 - t / (SLAB_GONE * 0.8)));
      }
    } else {
      const a = Math.min(1, st.t / SLAB_REFORM);
      g.setLineDash([4, 3]); g.strokeStyle = `rgba(255,180,110,${0.25 + 0.5 * a})`; g.lineWidth = 1;
      g.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1); g.setLineDash([]);
      body(o.x, o.y, o.w, 0.5 * a);
    }
  }

  chain(g, x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(len / 7));
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const ax = x0 + ux * k * 7, ay = y0 + uy * k * 7;
      g.strokeStyle = k % 2 ? '#8a6a3a' : '#c79a55'; g.lineWidth = k % 2 ? 2.2 : 3;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + ux * 6, ay + uy * 6); g.stroke();
    }
    g.lineCap = 'butt';
  }

  // chain plank: a beam hung at its middle that tilts toward the weight on it
  drawPlank(g, o, st, time) {
    const s = st.s, half = o.w / 2;
    const yl = o.y - half * s, yr = o.y + half * s;
    const ring = { x: o.px, y: o.y - 22 };
    this.chain(g, o.px, -6, ring.x, ring.y);
    // yoke rods to the beam
    const rod = (dx) => { const x = o.px + dx, y = o.y + dx * s; g.strokeStyle = '#c79a55'; g.lineWidth = 2; g.beginPath(); g.moveTo(ring.x, ring.y); g.lineTo(x, y); g.stroke(); };
    rod(-18); rod(18);
    g.fillStyle = '#e0b56a'; g.beginPath(); g.arc(ring.x, ring.y, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b4f2a'; g.beginPath(); g.arc(ring.x, ring.y, 1.8, 0, Math.PI * 2); g.fill();
    // beam
    const poly = () => { g.beginPath(); g.moveTo(o.x, yl); g.lineTo(o.x + o.w, yr); g.lineTo(o.x + o.w, yr + o.h); g.lineTo(o.x, yl + o.h); g.closePath(); };
    const grd = g.createLinearGradient(0, Math.min(yl, yr), 0, Math.max(yl, yr) + o.h);
    grd.addColorStop(0, '#8d84ad'); grd.addColorStop(1, '#5d5480');
    g.fillStyle = grd; poly(); g.fill();
    g.strokeStyle = 'rgba(20,12,36,0.6)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(o.x + 1, yl + 1); g.lineTo(o.x + o.w - 1, yr + 1); g.stroke();
    // bronze bands and rivets
    for (let k = 0; k <= o.w; k += 48) {
      const x = o.x + Math.min(o.w - 4, Math.max(0, k - 2)), y = o.y + (x + 2 - o.px) * s;
      g.fillStyle = '#b08a4a'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 4 * s); g.lineTo(x + 4, y + 4 * s + o.h); g.lineTo(x, y + o.h); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(30,20,50,0.55)';
    for (let k = 12; k < o.w; k += 24) { const x = o.x + k, y = o.y + (x - o.px) * s; g.beginPath(); g.arc(x, y + o.h / 2, 1.3, 0, Math.PI * 2); g.fill(); }
    // tilt gauge glow on the hub
    const tilt = Math.min(1, Math.abs(s) / o.smax);
    if (tilt > 0.05) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,210,140,${0.35 * tilt})`;
      g.beginPath(); g.arc(ring.x, ring.y, 7, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }

  // swinging lantern: a platform on a long chain with a lamp beneath it
  drawSwing(g, o, S, view, time) {
    const q = swingPos(o, S.tick);
    const x = q.x, y = q.y, cx = x + o.w / 2;
    if (o.ay > -8) {
      g.fillStyle = '#4b4266'; rrect(g, o.ax - 12, o.ay - 8, 24, 10, 3); g.fill();
      g.fillStyle = '#e0b56a'; g.beginPath(); g.arc(o.ax, o.ay, 3.5, 0, Math.PI * 2); g.fill();
    }
    const top = { x: cx, y: y - 16 };
    this.chain(g, o.ax, o.ay, top.x, top.y);
    g.strokeStyle = '#c79a55'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(x + 6, y); g.moveTo(top.x, top.y); g.lineTo(x + o.w - 6, y); g.stroke();
    // lamp below
    const lx = cx, ly = y + o.h + 9;
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(lx, ly, 1, lx, ly, 34);
    const fl = 0.8 + 0.2 * Math.sin(time * 9 + o.ax);
    halo.addColorStop(0, `rgba(220,190,255,${0.55 * fl})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, 34, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(lx, y + o.h); g.lineTo(lx, ly - 5); g.stroke();
    g.fillStyle = '#efe2ff'; rrect(g, lx - 4, ly - 5, 8, 10, 3); g.fill();
    g.fillStyle = '#b08a4a'; g.fillRect(lx - 5, ly - 6, 10, 2); g.fillRect(lx - 5, ly + 4, 10, 2);
    // platform
    const grd = g.createLinearGradient(0, y, 0, y + o.h);
    grd.addColorStop(0, '#8d84ad'); grd.addColorStop(1, '#5d5480');
    g.fillStyle = grd; g.fillRect(x, y, o.w, o.h);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, o.w, 2);
    g.fillStyle = '#b08a4a'; g.fillRect(x, y, 4, o.h); g.fillRect(x + o.w - 4, y, 4, o.h);
    g.strokeStyle = 'rgba(20,12,36,0.6)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, o.w - 1, o.h - 1);
  }

  // star well: an updraft rising from a grate at the bottom of the pit
  drawVent(g, o, time) {
    const h = WORLD_H - o.top;
    g.globalCompositeOperation = 'lighter';
    const col = g.createLinearGradient(0, WORLD_H, 0, o.top - 30);
    col.addColorStop(0, 'rgba(170,215,255,0.34)'); col.addColorStop(0.75, 'rgba(200,180,255,0.16)'); col.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = col; g.fillRect(o.x + 2, o.top - 30, o.w - 4, h + 30);
    g.strokeStyle = 'rgba(230,240,255,0.35)'; g.lineWidth = 2; g.lineJoin = 'round';
    const cx = o.x + o.w / 2;
    for (let k = 0; k < 4; k++) {
      const ph = (time * 0.7 + k / 4) % 1, y = WORLD_H - 20 - ph * (h - 10);
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      g.beginPath(); g.moveTo(cx - 8, y + 6); g.lineTo(cx, y); g.lineTo(cx + 8, y + 6); g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(220,235,255,0.22)'; g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      const ph = (time * 0.9 + k / 5) % 1;
      const y = WORLD_H - ph * (h + 30), x = o.x + 6 + (k * 0.21 % 1) * (o.w - 12);
      g.globalAlpha = Math.sin(ph * Math.PI);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 5 * Math.sin(time * 3 + k), y - 16, x, y - 32); g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // grate
    g.fillStyle = '#3e3556'; rrect(g, o.x - 4, WORLD_H - 14, o.w + 8, 14, 4); g.fill();
    g.fillStyle = '#a99bd0'; g.fillRect(o.x - 4, WORLD_H - 14, o.w + 8, 2);
    g.fillStyle = '#1b1530';
    for (let x = o.x + 4; x < o.x + o.w - 4; x += 8) g.fillRect(x, WORLD_H - 10, 4, 10);
    g.fillStyle = 'rgba(255,230,170,0.8)'; star(g, o.x + o.w / 2, WORLD_H - 7, 3 + Math.sin(time * 5) * 0.8);
  }

  // falling shard: a crystal under the gallery ceiling; shakes and glows before it drops
  drawShard(g, o, st, time) {
    const cx = o.x + o.w / 2;
    let y = o.y + st.dy, len = o.len, alpha = 1, sx = 0, glowK = 0.25;
    if (st.st === 3) return;
    if (st.st === 4) { len = o.len * (st.t / SHARD_REGROW); alpha = 0.6; }
    if (st.st === 1) {
      const k = st.t / o.tell;
      sx = Math.sin(time * 80) * (0.8 + 1.4 * k);
      glowK = 0.4 + 0.6 * k;
      // the tell on the floor: a widening glint where it will land
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(200,160,255,${0.15 + 0.35 * k})`;
      g.beginPath(); g.ellipse(cx, o.floor - 1, 6 + 10 * k, 2.5, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    if (st.st === 2) {
      glowK = 0.9;
      g.fillStyle = 'rgba(200,170,255,0.18)';
      g.fillRect(o.x + 2, o.y, o.w - 4, st.dy);
    }
    g.save(); g.translate(sx, 0); g.globalAlpha = alpha;
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(cx, y + len * 0.4, 1, cx, y + len * 0.4, 22);
    halo.addColorStop(0, `rgba(190,150,255,${0.45 * glowK})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(cx, y + len * 0.4, 22, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    const grd = g.createLinearGradient(o.x, y, o.x + o.w, y + len);
    grd.addColorStop(0, '#f2eaff'); grd.addColorStop(0.5, '#a98bf0'); grd.addColorStop(1, '#4b2f9a');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(o.x, y); g.lineTo(o.x + o.w, y); g.lineTo(cx + 1, y + len); g.lineTo(cx - 1, y + len); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.moveTo(o.x + 2, y); g.lineTo(cx - 1, y); g.lineTo(cx - 0.5, y + len * 0.8); g.closePath(); g.fill();
    // mount
    g.fillStyle = '#4b4266'; g.fillRect(o.x - 2, o.y - 2, o.w + 4, 3);
    g.restore();
  }

  drawDusk(g, S, cam, view, time) {
    // closest player to the edge sets how alarmed it looks
    let near = 99;
    S.p.forEach((p, i) => { if (p.alive) near = Math.min(near, ((view?.p?.[i]?.x ?? p.x) + p.w / 2 - cam) / TS); });
    const alarm = S.phase === RPH_PLAY ? Math.max(0, Math.min(1, (6 - near) / 5)) : 0;
    const w = 64 + 40 * alarm;
    const grd = g.createLinearGradient(cam, 0, cam + w, 0);
    grd.addColorStop(0, 'rgba(6,3,14,0.96)'); grd.addColorStop(0.3, `rgba(30,8,48,${0.75 + 0.15 * alarm})`); grd.addColorStop(1, 'rgba(40,10,60,0)');
    g.fillStyle = grd; g.fillRect(cam, 0, w, WORLD_H);
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(time * (4 + 6 * alarm));
    for (const [dx, a, lw] of [[14, 0.45, 3], [22, 0.18, 6]]) {
      g.strokeStyle = `rgba(200,110,255,${a + 0.4 * alarm * pulse})`; g.lineWidth = lw;
      g.beginPath();
      for (let y = 0; y <= WORLD_H; y += 10) { const x = cam + dx + Math.sin(y * 0.045 + time * 3) * 4 + Math.sin(y * 0.13 - time * 5) * 1.5; y ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.3 + 0.5 * alarm) {
      this.R.particles.push({ x: cam + 4 + Math.random() * 16, y: Math.random() * WORLD_H, vx: 0.6 + Math.random(), vy: (Math.random() - 0.5) * 0.4, life: 30, max: 30, r: 1.4, c: '#c58aff', add: true });
    }
  }
}
