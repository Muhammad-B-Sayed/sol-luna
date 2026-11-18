// Debug overlay (demo ?boxes=1, or renderer.setDebugBoxes(true)): the sim's own solid and hazard
// shapes drawn as lines over the art, so a view can be checked against what really collides.
// Every shape is the "touch" shape: the player's full box (drawn too) touching it means landing on
// it or dying, so the sim's insets are already applied here (spikes 0.08, pools 0.18, gate 0.06...).
//   green  floors, ramps (solid stone)     cyan  tilt slab, carousel stones   orange  ember halves (solid)
//   grey   ember halves while not solid    gold/blue eclipse stones           red  hazards
//   pools: the hostile area at the depth where they kill, coloured by who dies (sun pool kills Luna...)
import * as THREE from './three.js';
import * as R3 from '/shared/runner3d.js';

const HW = R3.P3.hw, PH = R3.P3.h;
const C = {
  floor: [0.2, 1, 0.35], move: [0.2, 0.95, 1], ember: [1, 0.55, 0.1], off: [0.45, 0.45, 0.5],
  sun: [1, 0.75, 0.2], moon: [0.45, 0.75, 1], haz: [1, 0.15, 0.25], sol: [1, 0.9, 0.3], luna: [0.6, 0.85, 1], shade: [0.3, 1, 0.55],
};

export class SimBoxes {
  constructor(max = 60000) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('color', this.aC);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 200;
    this.n = 0;
  }
  // a segment between two sim-space points
  seg(a, b, c) {
    if (this.n + 2 > this.max) return;
    for (const p of [a, b]) {
      const i = this.n++ * 3;
      this.pos[i] = p[0]; this.pos[i + 1] = p[1]; this.pos[i + 2] = -p[2];
      this.col[i] = c[0]; this.col[i + 1] = c[1]; this.col[i + 2] = c[2];
    }
  }
  // axis-aligned box in sim space
  box(x0, x1, y0, y1, z0, z1, c) {
    const P = (x, y, z) => [x, y, z];
    for (const y of [y0, y1]) {
      this.seg(P(x0, y, z0), P(x1, y, z0), c); this.seg(P(x1, y, z0), P(x1, y, z1), c);
      this.seg(P(x1, y, z1), P(x0, y, z1), c); this.seg(P(x0, y, z1), P(x0, y, z0), c);
    }
    if (y1 > y0) for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) this.seg(P(x, y0, z), P(x, y1, z), c);
  }
  // a quad given by a height function over a rectangle (tilt, ramp tops)
  surf(x0, x1, z0, z1, h, c, n = 4) {
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      this.seg([x, h(x, z0), z0], [x, h(x, z1), z1], c);
      this.seg([x0, h(x0, z), z], [x1, h(x1, z), z], c);
    }
  }
  circle(cx, cy, cz, r, plane, c, n = 24) {
    let a = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n * Math.PI * 2, s = Math.sin(t) * r, q = Math.cos(t) * r;
      const p = plane === 'xy' ? [cx + s, cy + q, cz] : plane === 'xz' ? [cx + s, cy, cz + q] : [cx, cy + s, cz + q];
      if (a) this.seg(a, p, c);
      a = p;
    }
  }

  update(L, S, tick) {
    this.n = 0;
    const zA = Math.min(S.p[0].z, S.p[1].z) - 6, zB = Math.max(S.p[0].z, S.p[1].z) + 40;
    for (let i = S.lo; i < S.hi; i++) {
      const o = L.objs[i];
      if (o.z0 > zB) break;
      if (o.z1 < zA) continue;
      this.obj(L, S, i, o, tick);
    }
    S.p.forEach((p, i) => { if (p.alive) this.box(p.x - HW, p.x + HW, p.y, p.y + PH, p.z - HW, p.z + HW, i ? C.luna : C.sol); });
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n);
    this.aP.needsUpdate = true; this.aC.needsUpdate = true;
  }

  obj(L, S, i, o, tick) {
    const st = S.o[i];
    switch (o.k) {
      case 'floor': this.box(o.x0, o.x1, o.y - Math.min(o.h, 0.3), o.y, o.z0, o.z1, C.floor); break;
      case 'ramp': this.surf(o.x0, o.x1, o.z0, o.z1, (x, z) => o.y + (o.y1 - o.y) * (z - o.z0) / (o.z1 - o.z0), C.floor, 2); break;
      case 'pool': {   // hostile area (inset 0.18) at the depth where feet die; bottom stone is solid
        const c = o.el === 2 ? C.shade : o.el === 0 ? C.luna : C.sol;   // colour of the one who dies there
        this.box(o.x0 + 0.18, o.x1 - 0.18, o.y - 0.12, o.y - 0.12, o.z0 + 0.18, o.z1 - 0.18, c);
        this.box(o.x0, o.x1, o.y - R3.POOL_DEP, o.y - R3.POOL_DEP, o.z0, o.z1, C.floor);
        break;
      }
      case 'spikes': this.box(o.x0 + 0.08, o.x1 - 0.08, o.y, o.y + o.th, o.z0 + 0.08, o.z1 - 0.08, C.haz); break;
      case 'tilt': {
        const a = st ? st.a : 0, b = st ? st.b : 0;
        this.surf(o.x0, o.x1, o.z0, o.z1, (x, z) => o.y + a * (x - o.cx) + b * (z - o.cz), C.move, 4);
        break;
      }
      case 'crumble': this.box(o.x0, o.x1, o.y, o.y, o.z0, o.z1, st && st.st > 1 ? C.off : C.ember); break;
      case 'eclipse': this.box(o.x0, o.x1, o.y - 0.5, o.y, o.z0, o.z1, o.el ? C.moon : C.sun); break;
      case 'carousel': {
        const pose = R3.objPose(L, S, i, tick);
        for (const s of pose.stones) this.box(s.x - o.s, s.x + o.s, o.y, o.y, s.z - o.s, s.z + o.s, C.move);
        break;
      }
      case 'sweeper': {   // arm: the sim tests the player's centre against radius 0.15 + 0.8 * HW; the arm itself is 0.15
        const pose = R3.objPose(L, S, i, tick), s = Math.sin(pose.rot), c = Math.cos(pose.rot), r = 0.15;
        const t0 = o.arms === 2 ? -o.R : 0, t1 = o.R;
        for (const y of [o.y, o.y + o.bar]) for (const d of [-r, r]) {
          this.seg([o.cx + s * t0 + c * d, y, o.cz + c * t0 - s * d], [o.cx + s * t1 + c * d, y, o.cz + c * t1 - s * d], C.haz);
        }
        this.circle(o.cx + s * t1, o.y + o.bar, o.cz + c * t1, r, 'xz', C.haz, 8);
        break;
      }
      case 'pendulum': {   // blade: a disc of radius rb against the player box shrunk 0.06; half thickness 0.2 - 0.06
        const pose = R3.objPose(L, S, i, tick), r = o.rb - 0.06, hz = 0.14;
        for (const dz of [-hz, hz]) this.circle(pose.x, pose.y, o.pz + dz, r, 'xy', C.haz, 28);
        break;
      }
      case 'gate': {
        const pose = R3.objPose(L, S, i, tick), e = pose.gw + 0.06, z0 = o.z0 + 0.05, z1 = o.z1 - 0.05;
        if (pose.x - e > o.x0) this.box(o.x0, pose.x - e, o.y, o.y + o.th, z0, z1, C.haz);
        if (pose.x + e < o.x1) this.box(pose.x + e, o.x1, o.y, o.y + o.th, z0, z1, C.haz);
        break;
      }
      case 'orb': {   // sphere of radius r - 0.05 against the player box shrunk 0.05 sideways
        const pose = R3.objPose(L, S, i, tick), r = o.r - 0.1;
        for (const b of pose.balls) { this.circle(b.x, b.y, b.z, r, 'xy', C.haz, 20); this.circle(b.x, b.y, b.z, r, 'yz', C.haz, 20); this.circle(b.x, b.y, b.z, r, 'xz', C.haz, 20); }
        break;
      }
    }
  }
  dispose() { this.lines.geometry.dispose(); this.lines.material.dispose(); }
}
