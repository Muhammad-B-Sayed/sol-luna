// Sol & Luna — Runner 3D debug view: a plain 2D-canvas perspective sketch of the course.
// Same API as the WebGL renderer (public/js/r3d/renderer.js), so the app can fall back to it
// when that file or WebGL is missing, and force it with ?r3ddebug=1.
//   new Runner3DDebugRenderer(canvas); reset(L); resize(cssW, cssH, dpr); dispose();
//   draw(L, S, view, time, { split, me, paused })
// It draws each object's footprint as a box (top and front faces), the players as boxes,
// and the dusk wall. Nothing here touches the sim.

const PITCH = 0.32, CS = Math.cos(PITCH), SN = Math.sin(PITCH);
const BACK = 7.5, UP = 3.4, NEAR = 0.4, FAR = 95;
const KIND = {
  floor: ['#4a3f6b', '#2e2648'], pool: null, spikes: ['#d65a7a', '#8a2a4a'],
};
const POOL = [['#ffb238', '#c0601c'], ['#6cc8ff', '#2f6fd8'], ['#4fbf7a', '#1d4030']];
const PLAYER = [['#ffd27a', '#e08a1c'], ['#bfe8ff', '#4f9fe0']];

export class Runner3DDebugRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.w = 1; this.h = 1; this.dpr = 1;
    this.kind = 'debug';
  }
  reset(L) { this.L = L; }
  resize(w, h, dpr) {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.dpr = dpr || 1;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
  }
  dispose() { this.L = null; }

  draw(L, S, view, time, opts = {}) {
    const g = this.g, W = this.w, H = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (opts.split) {
      this.viewport(L, S, view, 0, 0, 0, W / 2, H);
      this.viewport(L, S, view, 1, W / 2, 0, W / 2, H);
      g.fillStyle = 'rgba(214,196,255,0.5)'; g.fillRect(W / 2 - 1, 0, 2, H);
    } else this.viewport(L, S, view, opts.me | 0, 0, 0, W, H);
    g.font = '600 11px Nunito, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(240,230,255,0.45)';
    g.fillText('debug view', 10, H - 10);
  }

  viewport(L, S, view, who, vx, vy, vw, vh) {
    const g = this.g;
    g.save();
    g.beginPath(); g.rect(vx, vy, vw, vh); g.clip();
    const sky = g.createLinearGradient(0, vy, 0, vy + vh);
    sky.addColorStop(0, '#1b1433'); sky.addColorStop(0.55, '#3a2a5a'); sky.addColorStop(1, '#120e1d');
    g.fillStyle = sky; g.fillRect(vx, vy, vw, vh);

    const me = view.p[who];
    const cx = me.x * 0.5, cy = me.y + UP, cz = me.z - BACK;
    const f = vh * 0.95, ox = vx + vw / 2, oy = vy + vh * 0.42;
    const P = (x, y, z) => {
      const X = x - cx, Y = y - cy, Z = z - cz;
      const zc = -Y * SN + Z * CS, yc = Y * CS + Z * SN;
      return zc < NEAR ? null : [ox + X * f / zc, oy - yc * f / zc];
    };
    const zmin = cz + 2.2;
    const items = [];
    for (let i = S.lo; i < S.hi; i++) {
      const o = L.objs[i];
      if (o.z1 < zmin || o.z0 > cz + FAR) continue;
      items.push({ d: o.z1, o });   // far edge: a floor is drawn before whoever stands on it
    }
    S.p.forEach((p, i) => { if (view.p[i].z > zmin) items.push({ d: view.p[i].z, p: i }); });
    items.sort((a, b) => b.d - a.d);

    // dusk wall: drawn as a band across the course if it is ahead of the camera
    const poly = (pts, fill, stroke) => {
      if (pts.some(q => !q)) return;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.closePath(); g.fillStyle = fill; g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    };
    for (const it of items) {
      if (it.o) {
        const o = it.o, z0 = Math.max(o.z0, zmin), top = o.y + (o.k === 'spikes' ? 0.3 : 0), bot = o.y - (o.h || 0.4);
        const col = o.k === 'pool' ? POOL[o.el | 0] || POOL[2] : KIND[o.k] || ['#8a6fb0', '#5a4880'];
        if (o.z0 >= zmin) poly([P(o.x0, top, z0), P(o.x1, top, z0), P(o.x1, bot, z0), P(o.x0, bot, z0)], col[1]);
        if (cx < o.x0) poly([P(o.x0, top, z0), P(o.x0, top, o.z1), P(o.x0, bot, o.z1), P(o.x0, bot, z0)], col[1]);
        if (cx > o.x1) poly([P(o.x1, top, z0), P(o.x1, top, o.z1), P(o.x1, bot, o.z1), P(o.x1, bot, z0)], col[1]);
        poly([P(o.x0, top, z0), P(o.x1, top, z0), P(o.x1, top, o.z1), P(o.x0, top, o.z1)], col[0], 'rgba(255,255,255,0.08)');
      } else {
        const i = it.p, q = view.p[i], hw = 0.36, hh = 1.4, c = PLAYER[i];
        const alpha = S.p[i].alive ? 1 : 0.35;
        g.globalAlpha = alpha;
        poly([P(q.x - hw, q.y, q.z - hw), P(q.x + hw, q.y, q.z - hw), P(q.x + hw, q.y + hh, q.z - hw), P(q.x - hw, q.y + hh, q.z - hw)], c[1]);
        poly([P(q.x - hw, q.y + hh, q.z - hw), P(q.x + hw, q.y + hh, q.z - hw), P(q.x + hw, q.y + hh, q.z + hw), P(q.x - hw, q.y + hh, q.z + hw)], c[0]);
        g.globalAlpha = 1;
      }
    }
    if (view.zone > zmin) {
      g.globalAlpha = 0.55;
      poly([P(-14, -14, view.zone), P(14, -14, view.zone), P(14, 12, view.zone), P(-14, 12, view.zone)], '#2a0f3a');
      g.globalAlpha = 1;
    }
    // the dusk behind: a violet fog rising from the bottom edge as it closes in
    const gap = me.z - view.zone;
    const k = Math.max(0, Math.min(1, (12 - gap) / 12));
    if (k > 0) {
      const fog = g.createLinearGradient(0, vy + vh, 0, vy + vh * (1 - 0.6 * k));
      fog.addColorStop(0, `rgba(60,10,80,${0.85 * k})`); fog.addColorStop(1, 'rgba(60,10,80,0)');
      g.fillStyle = fog; g.fillRect(vx, vy, vw, vh);
    }
    g.restore();
  }
}
