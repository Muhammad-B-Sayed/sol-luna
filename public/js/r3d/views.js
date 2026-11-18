// One view per object kind: VIEWS[kind] = { make(o, L, idx) -> Object3D, update(view, o, st, pose, ctx) }.
// make() builds the object at its rest footprint in three space; update() runs every frame with the
// object's state from S.o (st, may be undefined), the sim's pose for it (pose, may be null) and ctx:
// { time, dt, tick, S, L, fx, glow, idx }. An unknown kind falls back to a glowing box over its footprint.
// Every mesh or geometry a view owns goes in userData.geos / mats / insts so disposeView frees it.
import * as THREE from './three.js';
import {
  PAL, col, hash, materials, patchWorld, slabGeometry, inlayMesh, runeBand, crystalGeometry, liquidMaterial, LIQ3, chainMesh, aimChain, GeoBuilder,
} from './kit.js';
import { TILT } from '/shared/runner3d.js';

export const VIEWS = {};

// scratch objects for per-frame updates (no garbage every frame)
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const mid = (o) => [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, o.x1 - o.x0, o.z1 - o.z0];
const _c = new THREE.Color();

// Floor skins: 0 plain, 1 run-up (a section's start), 2 landing, 5 post or pillar (a small tall box).
function skinCols(o, idx) {
  const v = 0.92 + hash(idx, 3) * 0.12;
  const tint = o.skin === 1 ? 0xa595c8 : o.skin === 2 ? 0x9d90c4 : o.skin === 5 ? 0x8f80bb : PAL.stoneTop;
  return [col(tint).multiplyScalar(v), col(PAL.stoneSide).multiplyScalar(v)];
}

// A stone slab group positioned at the footprint centre, top at o.y. Adds an inlay and a front rune band.
export function stoneSlab(o, idx, { h = o.h ?? 1, inlay = true, runes = true, glow = 0.55, top = null, side = null, mat = null } = {}) {
  const [cx, cz, w, d] = mid(o);
  const [t, s] = skinCols(o, idx);
  const S = 0.25;
  const geo = slabGeometry(w, d, h, { top: top || t, side: side || s, glow, frontGlow: 0, uvOff: [cx * S, cz * S] });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, mat || materials().stone));
  grp.position.set(cx, o.y, -cz);
  grp.userData.geos = [geo];
  if (inlay && d >= 5 && w >= 3) {
    const el = hash(idx, 11) > 0.5 ? 1 : 0;
    const size = Math.min(3.4, Math.min(w, d) * 0.62);
    const m = inlayMesh(el, size); m.rotation.y = Math.floor(hash(idx, 5) * 4) * Math.PI / 2;
    m.position.z = (hash(idx, 9) - 0.5) * Math.max(0, d - size - 1);
    grp.add(m); grp.userData.geos.push(m.geometry);
  }
  if (runes && w >= 2 && d >= 2.5 && h >= 0.4) {
    const rh = Math.min(0.3, h * 0.4);
    const r = runeBand(w * 0.86, rh);
    r.position.set(0, -rh - 0.08, d / 2 + 0.012);
    grp.add(r); grp.userData.geos.push(r.geometry);
  }
  return grp;
}

// A carved pillar or post for floor skin 5: fluted shaft, a capital, a glowing sun ring on top.
let _postMat = null;
function postView(o, idx) {
  const [cx, cz, w, d] = mid(o), h = o.h ?? 1;
  const grp = stoneSlab(o, idx, { h: Math.min(h, 0.35), inlay: false, runes: false, glow: 0.9 });
  if (!_postMat) _postMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), { key: 'post' });
  const r = Math.min(w, d) * 0.42;
  const shaft = new THREE.CylinderGeometry(r, r * 1.06, Math.max(0.1, h - 0.35), 10, 1).translate(0, -0.35 - (h - 0.35) / 2, 0);
  const pos = shaft.attributes.position, cc = new Float32Array(pos.count * 3), a = col(0x7e70a8), b = col(0x1e1634);
  for (let i = 0; i < pos.count; i++) { _c.copy(b).lerp(a, Math.max(0, Math.min(1, 1 + pos.getY(i) / Math.min(h, 6)))); cc.set([_c.r, _c.g, _c.b], i * 3); }
  shaft.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  grp.add(new THREE.Mesh(shaft, _postMat));
  const ring = new THREE.TorusGeometry(Math.min(w, d) * 0.3, 0.035, 4, 20).rotateX(Math.PI / 2).translate(0, 0.012, 0);
  grp.add(new THREE.Mesh(ring, glowMat(0xffb860, 1.6)));
  grp.userData.geos.push(shaft, ring);
  void cx; void cz;
  return grp;
}

VIEWS.floor = {
  make(o, L, idx) { return o.skin === 5 ? postView(o, idx) : stoneSlab(o, idx); },
  update() {},
};

// Unlit glowing materials, shared by colour.
const _glowMats = new Map();
export function glowMat(hex, k = 1, opts = {}) {
  const key = hex + ':' + k + ':' + (opts.additive ? 1 : 0) + ':' + (opts.opacity ?? 1);
  let m = _glowMats.get(key);
  if (!m) {
    m = patchWorld(new THREE.MeshBasicMaterial({ color: col(hex).multiplyScalar(k), transparent: !!opts.additive || opts.opacity != null,
      opacity: opts.opacity ?? 1, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive, side: opts.side ?? THREE.FrontSide }),
    { additive: !!opts.additive, key: 'gm' + (opts.additive ? 'a' : '') });
    _glowMats.set(key, m);
  }
  return m;
}

// Matrix that places a slab (top centred at the origin) at (cx, y, cz) sim with its top surface
// sheared to height y + ax*(X-cx) + az*(Z-cz): exact for the sim's planar surface.
const _sh = new THREE.Matrix4();
function shearTo(obj, cx, y, cz, ax, az) {
  _sh.set(1, 0, 0, cx, ax, 1, -az, y, 0, 0, 1, -cz, 0, 0, 0, 1);
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(_sh);
  obj.matrixWorldNeedsUpdate = true;
}

// Ramps: a slab whose top rises from y at z0 to y1 at z1, with glowing chevrons pointing up the slope.
VIEWS.ramp = {
  make(o, L, idx) {
    const [cx, cz, w, d] = mid(o);
    const grp = stoneSlab(o, idx, { inlay: false });
    const slope = (o.y1 - o.y) / Math.max(0.01, o.z1 - o.z0);
    shearTo(grp, cx, (o.y + o.y1) / 2, cz, 0, slope);
    // chevrons along the centre line
    const n = Math.max(1, Math.floor(d / 1.6));
    const chev = new THREE.BufferGeometry();
    const pts = [];
    for (let k = 0; k < n; k++) {
      const z = -d / 2 + (k + 0.5) * d / n, s = Math.min(0.5, w * 0.15);
      const dir = slope >= 0 ? -1 : 1;
      for (const sx of [-1, 1]) {
        const a = [sx * s, 0.01, z - dir * s * 0.5], b = [0, 0.01, z + dir * s * 0.5];
        const nx = 0.06;
        pts.push(a[0], a[1], a[2] - nx, b[0], b[1], b[2] - nx, b[0], b[1], b[2] + nx, a[0], a[1], a[2] - nx, b[0], b[1], b[2] + nx, a[0], a[1], a[2] + nx);
      }
    }
    chev.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const cm = new THREE.Mesh(chev, glowMat(0xc8b4ff, 1.1, { additive: true, side: THREE.DoubleSide }));
    grp.add(cm); grp.userData.geos.push(chev);
    return grp;
  },
  update() {},
};

// A flat frame just inside a w x d rectangle (three space, centred, in the x-z plane), band width b.
function frameGeometry(w, d, b) {
  const g = [];
  const q = (x0, z0, x1, z1) => g.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2));
  const X = w / 2, Z = d / 2;
  q(-X, -Z, X, -Z + b); q(-X, Z - b, X, Z); q(-X, -Z + b, -X + b, Z - b); q(X - b, -Z + b, X, Z - b);
  return THREE.mergeGeometries(g);
}
let _hostile = null, _hostileT = -1;
function hostileMat() {
  if (!_hostile) _hostile = patchWorld(new THREE.MeshBasicMaterial({ color: 0xff4070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3 }), { additive: true, key: 'host' });
  return _hostile;
}

// Pools: animated glowing liquid in a shallow stone basin, with glow and the odd bubble.
VIEWS.pool = {
  make(o, L, idx) {
    const [cx, cz, w, d] = mid(o);
    const el = o.el ?? 0;
    const grp = new THREE.Group();
    grp.position.set(cx, o.y, -cz);
    const surf = new THREE.PlaneGeometry(w, d, Math.max(2, Math.round(w * 2)), Math.max(2, Math.round(d * 2))).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(surf, liquidMaterial(el));
    m.position.y = -0.06;
    grp.add(m);
    // basin: dark stone walls down to the bottom, so the liquid reads as set into the floor
    const geos = [surf];
    const basin = slabGeometry(w, d, 0.6, { top: col(0x3a2f58), side: col(0x3a2f58), deep: col(0x150f24), glow: 0, bevel: 0.02, ring: 0.02 });
    const bm = new THREE.Mesh(basin, materials().stone); bm.position.y = -0.4; grp.add(bm); geos.push(basin);
    // a pulsing rim seen only by the player this pool kills (camera layer 1 = Sol, 2 = Luna):
    // sun pools kill Luna, moon pools kill Sol, shade kills both
    const rimG = frameGeometry(w - 0.06, d - 0.06, 0.13);
    for (const who of el === 2 ? [0, 1] : [el === 0 ? 1 : 0]) {
      const r = new THREE.Mesh(rimG, hostileMat()); r.position.y = 0.03; r.layers.set(1 + who); grp.add(r);
    }
    geos.push(rimG);
    grp.userData = { geos, el, w, d, bub: 0 };
    void idx;
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, L3 = LIQ3[u.el] || LIQ3[0];
    if (_hostileT !== ctx.time) { _hostileT = ctx.time; _hostile.color.setHex(0xff3a8a).multiplyScalar(1.3 + 1.2 * (0.5 + 0.5 * Math.sin(ctx.time * 5))); }
    const c = _c.setHex(L3.glow);
    const n = Math.max(1, Math.min(3, Math.round(u.w * u.d / 10)));
    for (let k = 0; k < n; k++) {
      const gx = v.position.x + (hash(ctx.idx, k) - 0.5) * u.w * 0.6, gz = v.position.z + (hash(k, ctx.idx) - 0.5) * u.d * 0.6;
      ctx.glow.add(gx, v.position.y + 0.7, gz, Math.min(2.4, Math.min(u.w, u.d) + 0.6), c, (u.el === 2 ? 0.1 : 0.13) + 0.03 * Math.sin(ctx.time * 2 + k));
    }
    u.bub -= ctx.dt;
    if (u.bub < 0 && ctx.fx) {
      u.bub = 0.1 + Math.random() * 0.3;
      const bc = col(L3.hi).multiplyScalar(u.el === 2 ? 1.2 : 2);
      ctx.fx.add.spawn(v.position.x + (Math.random() - 0.5) * u.w * 0.9, v.position.y, v.position.z + (Math.random() - 0.5) * u.d * 0.9,
        0, 0.4 + Math.random() * 0.5, 0, 0.9, 0.07, 0.02, bc, 0.9, -0.1, 0.5);
    }
  },
};

// Thorns: crystal spikes, deadly to both. Tips at y + th.
let _thornMat = null, _thornGeo = null, _bedMat = null;
function thornAssets() {
  if (_thornMat) return;
  _thornGeo = crystalGeometry(5);
  const pos = _thornGeo.attributes.position, c = new Float32Array(pos.count * 3), a = col(PAL.thornDeep), b = col(PAL.thorn), h = col(PAL.thornHi), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); if (y < 0.6) t.copy(a).lerp(b, y / 0.6); else t.copy(b).lerp(h, (y - 0.6) / 0.4);
    c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
  }
  _thornGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  _thornGeo.computeVertexNormals();
  _thornMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, flatShading: true,
    emissive: 0x7a2070, emissiveIntensity: 0.9 }), { rim: col(0xff9ae8).multiplyScalar(0.8), key: 'thorn' });
  _bedMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0x2a1838, roughness: 0.9, emissive: 0x3a0f3a, emissiveIntensity: 0.6 }), { key: 'bed' });
}
// fill a box (local, three space, base at y=0) with thorns of height about th
function thornField(w, d, th, seed, spacing = 0.3) {
  thornAssets();
  const nx = Math.max(1, Math.round(w / spacing)), nz = Math.max(1, Math.round(d / spacing));
  const im = new THREE.InstancedMesh(_thornGeo, _thornMat, nx * nz);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const r = (k) => hash(seed * 31 + i * 7 + k, j * 13 + k);
    p.set(-w / 2 + (i + 0.5) * w / nx + (r(1) - 0.5) * 0.1, 0, -d / 2 + (j + 0.5) * d / nz + (r(2) - 0.5) * 0.1);
    const hh = th * (0.62 + r(3) * 0.38);
    e.set((r(4) - 0.5) * 0.35, r(5) * 6.28, (r(7) - 0.5) * 0.35); q.setFromEuler(e);
    const rad = (0.07 + r(8) * 0.05) * Math.min(1.6, 0.75 + th * 0.4); s.set(rad, hh, rad);
    m.compose(p, q, s); im.setMatrixAt(n++, m);
  }
  im.count = n;
  return im;
}
VIEWS.spikes = {
  make(o, L, idx) {
    const [cx, cz, w, d] = mid(o);
    const th = o.th ?? 0.35;
    const grp = new THREE.Group(); grp.position.set(cx, o.y, -cz);
    const im = thornField(w, d, th, idx, th > 0.7 ? 0.36 : 0.3);
    grp.add(im);
    thornAssets();
    const bed = new THREE.BoxGeometry(w, 0.05, d); grp.add(new THREE.Mesh(bed, _bedMat));
    grp.userData = { geos: [bed], w, d, th, insts: [im] };
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    const tw = 0.5 + 0.5 * Math.sin(ctx.time * 3 + ctx.idx);
    ctx.glow.add(v.position.x, v.position.y + u.th * 0.5, v.position.z, Math.min(2.2, Math.min(u.w, u.d) + 0.6), 0xff5ad0, 0.08 + 0.04 * tw);
    if (Math.random() < ctx.dt * 1.5) {
      ctx.glow.add(v.position.x + (Math.random() - 0.5) * u.w, v.position.y + u.th, v.position.z + (Math.random() - 0.5) * u.d, 0.6, 0xffffff, 0.9);
    }
  },
};

// Spinning slab: a two-faced stone slab (sun inlay on face 0, moon on face 1) on an axle along the
// course. Its pins turn in bronze hubs on a crossbar across a big bronze ring at each end; each ring
// hangs by two chains from a stone lintel on two columns. Both faces mark the centre band (a pale
// line, the band's edges) and glow warm toward the outer bands that flip it. Only the slab and its
// pin bosses turn; the frame is static. At speed: two faint after-images, sparks at the pins, and
// the ring shudders; the latch catching it throws a spray of sparks.
function tiltFaceBands(hx, hz, h) {
  const B = new GeoBuilder();
  const lineC = col(0xd8ccff).multiplyScalar(0.55), edgeC = col(0xa898ff).multiplyScalar(0.35);
  const warm0 = col(0xff9a3a).multiplyScalar(0.12), warm1 = col(0xff7a2a).multiplyScalar(0.42), warm2 = col(0xff5a28).multiplyScalar(0.6);
  const z0 = -hz + 0.18, z1 = hz - 0.18, uc = TILT.UC * hx, ue = TILT.UE * hx, xe = hx - 0.12;
  for (const fy of [1, -1]) {
    const y = fy * (h + 0.004), out = [0, fy, 0];
    const strip = (xa, xb, ca, cb) => B.quad([xa, y, z1], [xb, y, z1], [xb, y, z0], [xa, y, z0], out, [ca, cb, cb, ca], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    strip(-0.06, 0.06, lineC, lineC);                    // the centre line
    for (const sx of [-1, 1]) {
      strip(sx * uc - 0.035, sx * uc + 0.035, edgeC, edgeC);   // where the centre band ends
      // the outer band: warm from where the kick starts, hottest past where it is full
      if (sx < 0) { strip(-xe, -ue, warm2, warm1); strip(-ue, -uc - 0.04, warm1, warm0); }
      else { strip(uc + 0.04, ue, warm0, warm1); strip(ue, xe, warm1, warm2); }
    }
  }
  return B.build();
}
// a static InstancedMesh of chain links along several segments [a, b] (three space)
function chainLinks(segs, s = 0.22) {
  const per = segs.map(([a, b]) => Math.max(1, Math.round(a.distanceTo(b) / (s * 0.82))));
  const im = new THREE.InstancedMesh(new THREE.TorusGeometry(s * 0.5, s * 0.14, 4, 8), materials().metal, per.reduce((x, y) => x + y, 0));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), d = new THREE.Vector3();
  let k = 0;
  segs.forEach(([a, b], j) => {
    d.subVectors(b, a).normalize(); qa.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
    for (let n = 0; n < per[j]; n++) {
      e.set(0, n % 2 ? Math.PI / 2 : 0, Math.PI / 2); q.setFromEuler(e).premultiply(qa);
      p.copy(a).lerp(b, (n + 0.5) / per[j]); m.compose(p, q, one); im.setMatrixAt(k++, m);
    }
  });
  return im;
}
VIEWS.tilt = {
  make(o, L, idx) {
    const M = materials(), h = o.T / 2, py = o.y - h, R = Math.sqrt(o.hx * o.hx + h * h);
    const root = new THREE.Group(), geos = [], mats = [];
    // the turning part, about the axle (three z = -sim z)
    const spin = new THREE.Group(); spin.position.set(o.cx, py, -o.cz);
    const half = slabGeometry(2 * o.hx, 2 * o.hz, h, { glow: 0.8, uvOff: [o.cx * 0.25, o.cz * 0.25] });
    half.translate(0, h, 0);
    const under = half.clone().scale(1, -1, 1);
    { const ix = under.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } }
    const slabG = THREE.mergeGeometries([half, under]); half.dispose(); under.dispose();
    const slab = new THREE.Mesh(slabG, M.stone); spin.add(slab);
    const size = Math.min(o.hx, o.hz) * 1.25;
    const sun = inlayMesh(0, size); sun.position.y = h + 0.006;
    const moon = inlayMesh(1, size); moon.rotation.x = Math.PI; moon.position.y = -h - 0.006;
    const bandG = tiltFaceBands(o.hx, o.hz, h);
    const bands = new THREE.Mesh(bandG, glowBandMat());
    // pin bosses on both end faces, with four bolt studs so the turning shows
    const boss = [];
    for (const zs of [-1, 1]) {
      boss.push(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12).rotateX(Math.PI / 2).translate(0, 0, zs * (o.hz + 0.07)));
      for (let b = 0; b < 4; b++) boss.push(new THREE.BoxGeometry(0.08, 0.08, 0.06).translate(Math.cos(b * Math.PI / 2) * 0.2, Math.sin(b * Math.PI / 2) * 0.2, zs * (o.hz + 0.16)));
    }
    const bossG = THREE.mergeGeometries(boss.map(g => g.toNonIndexed())); boss.forEach(g => g.dispose());
    spin.add(sun, moon, bands, new THREE.Mesh(bossG, M.gold));
    // after-images, drawn behind the slab's motion while it spins fast
    const ghosts = [0, 1].map(() => {
      const m = patchWorld(new THREE.MeshBasicMaterial({ color: col(0xb9a8ff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), { additive: true, key: 'tg' });
      mats.push(m);
      const g = new THREE.Mesh(slabG, m); g.visible = false; g.position.copy(spin.position); root.add(g); return g;
    });
    // the static frame: a bronze ring at each end with a crossbar and hub at the axle
    const Rr = Math.max(R + 1.6, 4.2), zr = o.hz + 0.22, top = o.chain ?? 7;
    const bronze = [];
    for (const zs of [-1, 1]) {
      bronze.push(new THREE.TorusGeometry(Rr, 0.13, 6, 56).translate(0, 0, zs * zr));
      bronze.push(new THREE.CylinderGeometry(0.11, 0.11, 2 * Rr, 8).rotateZ(Math.PI / 2).translate(0, 0, zs * zr));
      bronze.push(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12).rotateX(Math.PI / 2).translate(0, 0, zs * zr));
      bronze.push(new THREE.CylinderGeometry(0.09, 0.09, zr - o.hz + 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, zs * (o.hz + zr) / 2));
    }
    const frameG = THREE.mergeGeometries(bronze.map(g => g.toNonIndexed())); bronze.forEach(g => g.dispose());
    const frame = new THREE.Mesh(frameG, M.gold); frame.position.copy(spin.position);
    // lintels above the rings on four columns rising from the abyss; two chains hang each ring
    const ly = o.y + top + 0.6, colX = Rr + 0.9, segs = [], beams = [], cols = [];
    for (const zs of [-1, 1]) {
      const zw = -o.cz + zs * zr;
      const bg = slabGeometry(2 * colX + 1.2, 0.8, 0.7, { glow: 0.35, top: col(0x8a7cb6), side: col(0x4a3f6e) }); bg.translate(o.cx, ly, zw); beams.push(bg);
      for (const sx of [-1, 1]) {
        const ang = 0.72, ax = o.cx + sx * Rr * Math.sin(ang), ay = py + Rr * Math.cos(ang);
        segs.push([new THREE.Vector3(o.cx + sx * (Rr * Math.sin(ang) + 0.5), ly - 0.7, zw), new THREE.Vector3(ax, ay + 0.1, zw)]);
        const cg = new THREE.CylinderGeometry(0.34, 0.4, top + 24, 8).translate(o.cx + sx * colX, ly - (top + 24) / 2, zw);
        const pos = cg.attributes.position, cc = new Float32Array(pos.count * 3), a = col(0x6a5d92), b = col(0x120c20);
        for (let i = 0; i < pos.count; i++) { _c.copy(b).lerp(a, Math.max(0, Math.min(1, (pos.getY(i) - ly + top * 1.6) / (top * 1.6)))); cc.set([_c.r, _c.g, _c.b], i * 3); }
        cg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); cols.push(cg);
      }
    }
    const beamG = THREE.mergeGeometries(beams); beams.forEach(g => g.dispose());
    const colG = THREE.mergeGeometries(cols); cols.forEach(g => g.dispose());
    const chains = chainLinks(segs);
    root.add(spin, frame, new THREE.Mesh(beamG, M.stone), new THREE.Mesh(colG, postMatOf()), chains);
    geos.push(slabG, bandG, bossG, frameG, beamG, colG, chains.geometry, sun.geometry, moon.geometry);
    root.userData = { geos, mats, insts: [chains], spin, frame, ghosts, py, Rr, zr, lastS: 0, lastRot: 0, base: frame.position.clone() };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    const rot = pose ? pose.rot : 0, w = pose ? pose.w : 0, s = pose ? pose.s : 0;
    u.spin.rotation.z = -rot;
    const sp = Math.min(1, Math.abs(w) / TILT.W0);
    // after-images trail the turn (earlier angles), fading with speed
    u.ghosts.forEach((g, k) => {
      g.visible = sp > 0.2;
      if (!g.visible) return;
      g.rotation.z = -(rot - w * (0.45 + 0.45 * k));
      g.material.opacity = (k ? 0.07 : 0.12) * sp;
    });
    // the ring shudders while the slab turns hard
    const sh = 0.012 * sp * Math.sin(ctx.time * 47 + ctx.idx);
    u.frame.position.set(u.base.x + sh, u.base.y + sh * 0.5, u.base.z);
    const zf = -o.cz + u.zr, zb = -o.cz - u.zr;
    if (ctx.fx && ctx.dt > 0) {
      if (sp > 0.25 && Math.random() < ctx.dt * 40 * sp) {   // sparks off the pins
        const zz = Math.random() < 0.5 ? zf : zb, a = Math.random() * Math.PI * 2;
        ctx.fx.add.spawn(o.cx + Math.cos(a) * 0.3, u.py + Math.sin(a) * 0.3, zz, Math.cos(a) * 2 - w * 8 * Math.sin(a), 1 + Math.random() * 1.5, (zz > -o.cz ? 1 : -1) * Math.random(), 0.45, 0.07, 0.01, ctx.fx.cols.sun[Math.random() < 0.5 ? 0 : 1], 1, 6, 1);
      }
      if (u.lastS && !s) for (const zz of [zf, zb]) ctx.fx.burst(o.cx, u.py, zz, ctx.fx.cols.sun, 12, 1.8, 0.5, 0.07, 5);   // the latch catches it
      if (!u.lastS && s) ctx.fx.dust(o.cx + (w > 0 ? 1 : -1) * o.hx * 0.8, o.y, -o.cz, 12, -1, 1.2);   // kicked off its latch
    }
    u.lastS = s;
    ctx.glow.add(o.cx, u.py, zf + 0.25, 1.1 + sp, 0xffc070, 0.25 + 0.5 * sp);
    ctx.glow.add(o.cx, u.py, zb - 0.25, 1.1 + sp, 0xffc070, 0.25 + 0.5 * sp);
  },
};
let _bandMat = null;
function glowBandMat() {
  if (!_bandMat) _bandMat = patchWorld(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }), { additive: true, key: 'tb' });
  return _bandMat;
}
function postMatOf() {
  if (!_postMat) _postMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), { key: 'post' });
  return _postMat;
}

// Crumbling ember slab: cracks glow hotter as it shakes, it drops away in pieces, then re-forms.
let _crumbleTex = null;
function crumbleTex() {
  if (_crumbleTex) return _crumbleTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let x = hash(k, 1) * 256, y = hash(k, 2) * 256; g.lineWidth = 2 + hash(k, 3) * 3; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (hash(k, s + 4) - 0.5) * 70; y += (hash(s, k + 9) - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  _crumbleTex = new THREE.CanvasTexture(c);
  _crumbleTex.wrapS = _crumbleTex.wrapT = THREE.RepeatWrapping;
  return _crumbleTex;
}
// Each half: a dark ember stone with glowing cracks. States from the sim's pose: 0 whole (a slow
// ember pulse), 1 cracking (shakes, the cracks flare and sparks rise: it is about to drop), 2 fallen
// (drops away and fades), 3 re-forming (NOT solid yet: drawn as a see-through outline that fills in).
let _emberGhost = null;
VIEWS.crumble = {
  make(o, L, idx) {
    const [cx, cz, w, d] = mid(o);
    const mat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, map: materials().stone.map, roughness: 0.9,
      emissive: 0xff5a14, emissiveMap: crumbleTex(), emissiveIntensity: 1.1 }), { glow: true, key: 'crum' });
    const grp = stoneSlab(o, idx, { h: 0.5, inlay: false, runes: false, glow: 0.25, top: col(0x5a3440), side: col(0x341a26), mat });
    const solid = new THREE.Group(); solid.add(...grp.children); grp.add(solid);
    if (!_emberGhost) _emberGhost = patchWorld(new THREE.MeshBasicMaterial({ color: col(0xff8a3a).multiplyScalar(0.7), transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false }), { additive: true, key: 'eg' });
    const gG = new THREE.BoxGeometry(w * 0.98, 0.48, d * 0.98).translate(0, -0.24, 0), eG = new THREE.EdgesGeometry(gG);
    const ghost = new THREE.Group(); ghost.add(new THREE.Mesh(gG, _emberGhost));
    const eMat = new THREE.LineBasicMaterial({ color: col(0xffb070).multiplyScalar(1.4), transparent: true, opacity: 0.8 });
    ghost.add(new THREE.LineSegments(eG, eMat)); ghost.visible = false; grp.add(ghost);
    grp.userData.geos.push(gG, eG);
    grp.userData.mats = [mat, eMat];
    grp.userData.base = grp.position.clone();
    Object.assign(grp.userData, { w, d, lastSt: 0, solid, ghost, cx, cz });
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, p = pose || { st: 0, t: 0, dy: 0, shake: 0 };
    const m = u.mats[0];
    let sx = 0, sz = 0, vis = true, gk = 0;
    if (p.st === 1) {
      const k = p.shake;
      sx = Math.sin(ctx.time * 61 + ctx.idx) * 0.06 * k; sz = Math.sin(ctx.time * 53) * 0.06 * k;
      m.emissiveIntensity = 1.4 + k * 5;
      if (ctx.fx && Math.random() < ctx.dt * (6 + 30 * k)) ctx.fx.add.spawn(u.base.x + (Math.random() - 0.5) * u.w, u.base.y + 0.05, u.base.z + (Math.random() - 0.5) * u.d,
        0, 0.6 + Math.random(), 0, 0.6, 0.07, 0.02, ctx.fx.cols.sun[1], 1, -0.5, 1);
    } else if (p.st === 2) {
      m.emissiveIntensity = Math.max(0, 4 - p.t * 0.15);
      vis = p.dy < 5.9;
    } else if (p.st === 3) {
      gk = Math.min(1, (p.t + 1) / 12);
      m.emissiveIntensity = 1.1;
    } else m.emissiveIntensity = 1.0 + 0.25 * Math.sin(ctx.time * 2.2 + ctx.idx);
    u.solid.visible = vis && p.st !== 3;
    u.ghost.visible = p.st === 3;
    if (p.st === 3) { u.ghost.children[0].material.opacity = 0.12 + 0.2 * gk; u.mats[1].opacity = 0.35 + 0.5 * gk * (0.7 + 0.3 * Math.sin(ctx.time * 14)); }
    v.position.set(u.base.x + sx, u.base.y - p.dy, u.base.z + sz);
    if (u.lastSt !== p.st && ctx.fx) {
      if (p.st === 2) ctx.fx.burst(u.base.x, u.base.y, u.base.z, ctx.fx.cols.sun, 26, 2.5, 0.9, 0.09, 6);
      if (p.st === 0 && u.lastSt === 3) ctx.fx.burst(u.base.x, u.base.y + 0.1, u.base.z, ctx.fx.cols.sun, 10, 1.2, 0.5, 0.07, -1);
    }
    u.lastSt = p.st;
    if (u.solid.visible) ctx.glow.add(v.position.x, v.position.y + 0.1, v.position.z, Math.max(u.w, u.d) * 1.2, 0xff6a20, Math.min(0.55, 0.1 + m.emissiveIntensity * 0.06));
  },
};

// Eclipse stones: solid for one element, a ghost for the other. Each player's camera sees its own
// version (layer 1 = Sol's camera, layer 2 = Luna's), so in split screen Sol sees sun stones solid
// and moon stones as ghosts, and Luna the other way round.
let _ghostMats = null;
function ghostMats() {
  if (_ghostMats) return _ghostMats;
  _ghostMats = [0, 1].map((el) => patchWorld(new THREE.MeshBasicMaterial({ color: col(el ? 0x7fd6ff : 0xffb02e).multiplyScalar(0.55),
    transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), { additive: true, key: 'gh' + el }));
  return _ghostMats;
}
VIEWS.eclipse = {
  make(o, L, idx) {
    const el = o.el ? 1 : 0, [cx, cz, w, d] = mid(o);
    const tint = el ? [0x8fb6ee, 0x2f4f8a] : [0xe6b86a, 0x7a4a2a];
    const solid = stoneSlab(o, idx, { h: 0.5, inlay: false, runes: false, glow: 0.9, top: col(tint[0]), side: col(tint[1]) });
    const em = inlayMesh(el, Math.min(w, d) * 0.9); solid.add(em); solid.userData.geos.push(em.geometry);
    solid.traverse((c) => c.layers.set(1 + el));
    const ghostG = new THREE.BoxGeometry(w * 0.96, 0.46, d * 0.96).translate(0, -0.23, 0);
    const edge = new THREE.EdgesGeometry(ghostG);
    const ghost = new THREE.Group();
    ghost.add(new THREE.Mesh(ghostG, ghostMats()[el]));
    ghost.add(new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: col(el ? 0x9fe4ff : 0xffc860).multiplyScalar(0.9), transparent: true, opacity: 0.6 })));
    ghost.position.set(cx, o.y, -cz);
    ghost.traverse((c) => c.layers.set(2 - el));
    const root = new THREE.Group(); root.add(solid, ghost);
    root.userData = { geos: [...solid.userData.geos, ghostG, edge], mats: [ghost.children[1].material], el, cx, cz, w, d };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    ctx.glow.add(u.cx, o.y + 0.05, -u.cz, Math.max(u.w, u.d) * 1.05, u.el ? 0x70c8ff : 0xffa040, 0.12 + 0.03 * Math.sin(ctx.time * 2.5 + ctx.idx));
    v.children[1].children[0].material.opacity = 0.22 + 0.1 * Math.sin(ctx.time * 3 + ctx.idx);
  },
};

// Sweeper: a thorn-studded arm (or bar) turning about a post. Arm 0 points along (sin rot, cos rot) in sim (x, z).
VIEWS.sweeper = {
  make(o, L, idx) {
    thornAssets();
    const root = new THREE.Group(); root.position.set(o.cx, o.y, -o.cz);
    const rot = new THREE.Group(); root.add(rot);
    const bar = o.bar ?? 0.55, R = o.R, arms = o.arms === 2 ? 2 : 1;
    const len = arms === 2 ? 2 * R : R, off = arms === 2 ? 0 : -R / 2;   // local -z = arm 0
    // The sim's arm is 0.15 thick on each side of its line and deadly from the floor up to y + bar,
    // so the art stays inside that: a beam 0.26 wide from 0.06 to 0.4 high, thorn tips no higher
    // than the bar and no further out than 0.17 from the line.
    const beamG = new THREE.BoxGeometry(0.26, 0.34, len).translate(0, 0.23, off);
    rot.add(new THREE.Mesh(beamG, materials().gold));
    const spineG = new THREE.BoxGeometry(0.1, 0.05, len).translate(0, 0.41, off);
    rot.add(new THREE.Mesh(spineG, glowMat(0xff6ad0, 1.6)));
    const n = Math.round(len / 0.22) * 3;
    const im = new THREE.InstancedMesh(_thornGeo, _thornMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0;
    for (let j = 0; j < n / 3; j++) {
      const z = off - len / 2 + (j + 0.5) * len / (n / 3);
      if (Math.abs(z) < 0.5) continue;
      for (const a of [-0.55, 0, 0.55]) {
        const r = hash(idx * 5 + j, a + 3);
        e.set(0, 0, -a + (r - 0.5) * 0.2); q.setFromEuler(e);
        p.set(Math.sin(a) * 0.1, 0.38, z); s.set(0.06, bar - 0.38 - (a ? 0.02 : 0) - r * 0.04, 0.06);
        m.compose(p, q, s); im.setMatrixAt(k++, m);
      }
    }
    im.count = k;
    rot.add(im);
    // hub
    const hubG = new THREE.CylinderGeometry(0.5, 0.6, 0.5, 10).translate(0, bar * 0.55, 0);
    rot.add(new THREE.Mesh(hubG, materials().gold));
    // a faint circle on the floor showing the swept area
    const ringG = new THREE.RingGeometry(R - 0.06, R, 48).rotateX(-Math.PI / 2).translate(0, 0.015, 0);
    root.add(new THREE.Mesh(ringG, glowMat(0xff6ad0, 0.5, { additive: true })));
    root.userData = { geos: [beamG, spineG, hubG, ringG], insts: [im], rot, R, arms, off };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, r = pose ? pose.rot : 0;
    u.rot.rotation.y = -r;
    const [s, c] = [Math.sin(r), Math.cos(r)];
    for (let k = 1; k <= 3; k++) {
      const t = (k / 3) * u.R;
      ctx.glow.add(o.cx + s * t, o.y + 0.4, -(o.cz + c * t), 1.0, 0xff5ad0, 0.22);
      if (u.arms === 2) ctx.glow.add(o.cx - s * t, o.y + 0.4, -(o.cz - c * t), 1.0, 0xff5ad0, 0.22);
    }
  },
};

// Pendulum: a disc blade on a rod, swinging in the x-y plane from a pivot on a stone yoke.
let _bladeMat = null;
function bladeMat() {
  if (!_bladeMat) _bladeMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0x9a8cc4, roughness: 0.3, metalness: 0.85, flatShading: true,
    emissive: 0x501844, emissiveIntensity: 0.9 }), { rim: col(0xff9ae8).multiplyScalar(0.9), key: 'blade' });
  return _bladeMat;
}
VIEWS.pendulum = {
  make(o, L, idx) {
    const root = new THREE.Group();
    const piv = new THREE.Group(); piv.position.set(o.px, o.py, -o.pz); root.add(piv);
    const rodG = new THREE.CylinderGeometry(0.05, 0.05, o.R, 6).translate(0, -o.R / 2, 0);
    piv.add(new THREE.Mesh(rodG, materials().metal));
    // blade: a round disc, as deadly all the way round as the sim's (radius rb against the player
    // box shrunk 0.06, so rb - 0.06 against the drawn character; 0.14 deep on each side of its plane).
    // A lens: 0.28 thick at the hub, thinning to a glowing edge.
    const rb = o.rb - 0.06;
    const prof = [new THREE.Vector2(0, -0.14), new THREE.Vector2(0.16, -0.14), new THREE.Vector2(rb * 0.82, -0.07), new THREE.Vector2(rb, -0.015),
      new THREE.Vector2(rb, 0.015), new THREE.Vector2(rb * 0.82, 0.07), new THREE.Vector2(0.16, 0.14), new THREE.Vector2(0, 0.14)];
    const bladeG = new THREE.LatheGeometry(prof, 24).rotateX(Math.PI / 2);   // disc in the x-y plane, thickness along z
    const blade = new THREE.Mesh(bladeG, bladeMat()); blade.position.y = -o.R; piv.add(blade);
    const edgeG = new THREE.TorusGeometry(rb - 0.015, 0.03, 4, 32);
    const edge = new THREE.Mesh(edgeG, glowMat(0xff8ae0, 2.2)); edge.position.y = -o.R; piv.add(edge);
    const hubG = new THREE.SphereGeometry(0.16, 10, 8);
    const hub = new THREE.Mesh(hubG, materials().gold); hub.position.y = -o.R; piv.add(hub);
    // yoke: a stone lintel over the path with two legs on the floor edges
    const span = (o.x1 - o.x0) + 1.6;   // legs stand outside the whole swing
    const lintG = slabGeometry(span, 0.6, 0.5, { glow: 0.35 });
    const lint = new THREE.Mesh(lintG, materials().stone); lint.position.set(o.px, o.py + 0.45, -o.pz);
    root.add(lint);
    const capG = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8).rotateX(Math.PI / 2);
    const cap = new THREE.Mesh(capG, materials().gold); cap.position.set(o.px, o.py, -o.pz); root.add(cap);
    const legH = o.py + 0.45 + 30;
    const legG = new THREE.CylinderGeometry(0.22, 0.28, legH, 8).translate(0, -legH / 2, 0);
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(legG, materials().stonePlain); l.position.set(o.px + sx * span / 2, o.py + 0.3, -o.pz); root.add(l); }
    root.userData = { geos: [rodG, bladeG, edgeG, hubG, lintG, capG, legG], piv };
    void idx;
    return root;
  },
  update(v, o, st, pose, ctx) {
    const th = pose ? pose.th : 0;
    v.userData.piv.rotation.z = th;
    if (pose) ctx.glow.add(pose.x, pose.y, -pose.z, 1.6, 0xff6ad0, 0.3);
  },
};

// Carousel: square stones orbiting a pillar, each hung from the pillar's top on a chain.
VIEWS.carousel = {
  make(o, L, idx) {
    const root = new THREE.Group();
    const stones = [], geos = [], insts = [];
    for (let j = 0; j < o.n; j++) {
      const sl = stoneSlab({ x0: -o.s, x1: o.s, z0: -o.s, z1: o.s, y: 0, skin: 0 }, idx * 7 + j, { h: 0.5, inlay: false, runes: false, glow: 0.9 });
      const em = inlayMesh(j % 2, o.s * 1.5); sl.add(em); sl.userData.geos.push(em.geometry);
      root.add(sl); stones.push(sl); geos.push(...sl.userData.geos);
      const ch = chainMesh(3, 0.16); root.add(ch); insts.push(ch);
    }
    // orbit ring of runes on the abyss side: a faint path
    const ringG = new THREE.RingGeometry(o.R - 0.05, o.R + 0.05, 64).rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringG, glowMat(0xc9b6ff, 0.6, { additive: true })); ring.position.set(o.cx, o.y - 0.55, -o.cz);
    root.add(ring); geos.push(ringG);
    root.userData = { geos, insts, stones, chains: insts };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    const a = _va.set(o.cx, o.y + 2.5, -o.cz), b = _vb;
    for (let j = 0; j < u.stones.length; j++) {
      const s = pose && pose.stones[j]; if (!s) continue;
      u.stones[j].position.set(s.x, o.y, -s.z);
      const dx = s.x - o.cx, dz = s.z - o.cz, l = Math.hypot(dx, dz) || 1;
      b.set(s.x - dx / l * o.s * 0.7, o.y + 0.02, -(s.z - dz / l * o.s * 0.7));
      aimChain(u.chains[j], a, b);
      ctx.glow.add(s.x, o.y + 0.1, -s.z, 2.4, j % 2 ? 0x70c8ff : 0xffa040, 0.22);
    }
  },
};

// Gate: a bramble curtain between two stone posts with a lintel; the opening slides along it.
// The sim kills a player whose box (shrunk 0.06) leaves [gx - gw, gx + gw] inside the curtain's
// depth (0.5, shrunk 0.05 each side), so the wall is drawn from x0 to gx - gw - 0.06 and from
// gx + gw + 0.06 to x1, 0.4 deep with its thorns: fixed 0.5-wide tiles, re-laid every frame.
const GATE_TILE = 0.5;
let _brambleMat = null, _brambleGeo = null;
function brambleTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1c0c26'; g.fillRect(0, 0, 64, 512);
  // vines that wrap left-right, so tiles join without seams
  for (let k = 0; k < 14; k++) {
    const y0 = hash(k, 21) * 512, amp = 20 + hash(k, 22) * 40, ph = hash(k, 23) * 6.28, lw = 3 + hash(k, 24) * 5;
    g.strokeStyle = k % 3 ? '#3e1c4e' : '#5a2a66'; g.lineWidth = lw; g.beginPath();
    for (let x = -4; x <= 68; x += 4) { const y = y0 + Math.sin(x / 64 * Math.PI * 2 + ph) * amp; x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 40; k++) {   // glowing thorn buds
    const x = hash(k, 31) * 64, y = hash(k, 32) * 512;
    g.fillStyle = k % 4 ? 'rgba(255,120,220,0.9)' : 'rgba(255,220,250,1)';
    g.beginPath(); g.arc(x, y, 1.5 + hash(k, 33) * 2, 0, 6.29); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
VIEWS.gate = {
  make(o, L, idx) {
    thornAssets();
    if (!_brambleMat) {
      const tex = brambleTex();
      _brambleMat = patchWorld(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xff70d0, emissiveMap: tex, emissiveIntensity: 0.35 }), { key: 'bramble' });
      _brambleGeo = new THREE.BoxGeometry(GATE_TILE, 1, 0.24).translate(GATE_TILE / 2, 0.5, 0);
    }
    const root = new THREE.Group();
    const [, cz, w] = mid(o), zc = -cz, th = o.th ?? 4.6;
    const maxTiles = Math.ceil((o.x1 - o.x0) / GATE_TILE) + 4;
    // the wall itself sits in its own group: the renderer hides it for a camera whose player has
    // passed it, so it never stands between that camera and its player
    const wall = new THREE.Group(); root.add(wall);
    const tiles = new THREE.InstancedMesh(_brambleGeo, _brambleMat, maxTiles); tiles.frustumCulled = false; wall.add(tiles);
    const rows = Math.round(th / 0.42);
    const im = new THREE.InstancedMesh(_thornGeo, _thornMat, maxTiles * rows * 2 * 2); im.frustumCulled = false; wall.add(im);
    const postG = new THREE.BoxGeometry(0.7, th + 0.8, 0.9).translate(0, (th + 0.8) / 2 - 0.4, 0);
    for (const x of [o.x0 - 0.35, o.x1 + 0.35]) { const p = new THREE.Mesh(postG, materials().stonePlain); p.position.set(x, o.y, zc); root.add(p); }
    const lintG = slabGeometry(w + 1.6, 0.9, 0.6, { glow: 0.5 });
    const lint = new THREE.Mesh(lintG, materials().stone); lint.position.set((o.x0 + o.x1) / 2, o.y + th + 0.6, zc); root.add(lint);
    // glowing edges of the opening, and a pale strip on the floor through it (the safe way)
    const edgeG = new THREE.BoxGeometry(0.07, th, 0.42).translate(0, th / 2, 0);
    const edges = [0, 1].map(() => { const m = new THREE.Mesh(edgeG, glowMat(0x9dffb9, 1.5)); m.position.set(0, o.y, zc); wall.add(m); return m; });
    const laneG = new THREE.PlaneGeometry(1, 2.4).rotateX(-Math.PI / 2);
    const lane = new THREE.Mesh(laneG, glowMat(0x60ff9a, 0.16, { additive: true })); lane.position.set(0, o.y + 0.02, zc); wall.add(lane);
    root.userData = { geos: [postG, lintG, edgeG, laneG], insts: [tiles, im], tiles, im, edges, lane, zc, th, rows, seed: idx, occ: { z: cz, wall } };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, gx = pose ? pose.x : o.cx, gw = (pose ? pose.gw : o.gw) + 0.06;
    const segs = [[o.x0, gx - gw], [gx + gw, o.x1]];
    const m = _m4, q = _q, e = _e, p = _p3, s = _s3;
    let nt = 0, k = 0;
    segs.forEach(([a, b], si) => {
      const len = b - a;
      if (len < 0.01) return;
      const n = Math.ceil(len / GATE_TILE - 1e-6);
      for (let c = 0; c < n; c++) {
        // tiles are laid from the opening outwards, so the ones that move with it keep their look
        const x0 = si ? a + c * GATE_TILE : b - (c + 1) * GATE_TILE, wx = Math.min(GATE_TILE, si ? b - x0 : x0 + GATE_TILE - a);
        const xs = si ? x0 : Math.max(a, x0);
        p.set(xs, o.y, u.zc); q.identity(); s.set(wx / GATE_TILE, u.th, 1);
        m.compose(p, q, s); u.tiles.setMatrixAt(nt++, m);
        // thorns on both faces, pointing out of the wall; tips stay within 0.2 of its middle
        for (let r = 0; r < u.rows; r++) for (const side of [-1, 1]) {
          const hr = hash(u.seed * 3 + c * 11 + si * 5, r * 7 + side);
          if (hr < 0.25) continue;
          // lying along the face (so they can be long and still stay inside the deadly depth),
          // tipped a little outwards
          const tx = xs + wx * (0.2 + 0.6 * hash(c + si * 9, r + side * 3 + u.seed));
          p.set(tx, o.y + (r + 0.5) * u.th / u.rows, u.zc + side * 0.135);
          const ang = (hr < 0.62 ? 1 : -1) * (0.7 + hr * 1.6);
          e.set(side * 0.25, 0, ang); q.setFromEuler(e);
          s.set(0.06, 0.3, 0.06);
          m.compose(p, q, s); u.im.setMatrixAt(k++, m);
        }
      }
    });
    u.tiles.count = nt; u.tiles.instanceMatrix.needsUpdate = true;
    u.im.count = k; u.im.instanceMatrix.needsUpdate = true;
    u.edges[0].position.x = gx - gw; u.edges[1].position.x = gx + gw;
    u.lane.position.x = gx; u.lane.scale.x = 2 * gw;
    for (const x of [gx - gw, gx + gw]) for (const h of [0.6, 1.8, 3.0]) ctx.glow.add(x, o.y + h, u.zc, 0.7, 0x60ff9a, 0.25);
  },
};

// Orbs: rolling stone spheres with glowing bands, along a carved lane. The sim's orb is full size
// from the moment it appears at zs until it vanishes at ze, and it touches the player box (shrunk
// 0.05) within r - 0.05: drawn at r - 0.08 (flat faces, the bands stand out to r - 0.03). Orbs roll
// out of a dark archway at the far end and drop into a socket at the near end.
let _orbGeo = null, _orbMat = null, _sockMat = null;
VIEWS.orb = {
  make(o, L, idx) {
    if (!_orbGeo) {
      _orbGeo = new THREE.IcosahedronGeometry(1, 2);
      _orbMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0x8a78c0, roughness: 0.7, flatShading: true, emissive: 0x2c1446 }), { rim: col(0xc8acff).multiplyScalar(0.7), key: 'orb' });
      _sockMat = patchWorld(new THREE.MeshBasicMaterial({ color: 0x1e0e30 }), { key: 'sock' });
    }
    const root = new THREE.Group();
    const R = o.r - 0.08;
    const maxN = Math.ceil((o.zs - o.ze) / Math.max(0.01, o.vo * o.P)) + 1;
    const bandG = new THREE.TorusGeometry(1.0, 0.05, 4, 28).rotateY(Math.PI / 2);
    const balls = [];
    for (let k = 0; k < maxN; k++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(_orbGeo, _orbMat));
      const band = new THREE.Mesh(bandG, glowMat(0xff9ae8, 1.8)); b.add(band);
      const band2 = new THREE.Mesh(bandG, glowMat(0xff9ae8, 1.8)); band2.rotation.z = Math.PI / 2; b.add(band2);
      b.scale.setScalar(R); b.visible = false; root.add(b); balls.push(b);
    }
    // lane groove on the floor
    const laneG = new THREE.PlaneGeometry(o.r * 1.3, o.zs - o.ze).rotateX(-Math.PI / 2);
    const lane = new THREE.Mesh(laneG, glowMat(0x2a1640, 1, { opacity: 0.65 })); lane.position.set(o.lx, o.y + 0.012, -(o.zs + o.ze) / 2); root.add(lane);
    const lineG = new THREE.PlaneGeometry(0.05, o.zs - o.ze).rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(lineG, glowMat(0xc070ff, 1.2, { additive: true })); l.position.set(o.lx + sx * o.r * 0.65, o.y + 0.016, -(o.zs + o.ze) / 2); root.add(l); }
    // socket where they drop away (near end) and an archway where they come from (far end)
    const sockG = new THREE.CircleGeometry(o.r * 0.75, 20).rotateX(-Math.PI / 2);
    const sock = new THREE.Mesh(sockG, _sockMat); sock.position.set(o.lx, o.y + 0.018, -(o.ze - o.r * 0.4)); root.add(sock);
    const rimG = new THREE.RingGeometry(o.r * 0.75, o.r * 0.85, 20).rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(rimG, glowMat(0xc070ff, 1.2, { additive: true })); rim.position.copy(sock.position); rim.position.y += 0.002; root.add(rim);
    const archG = new THREE.TorusGeometry(o.r + 0.25, 0.22, 6, 16, Math.PI);
    const arch = new THREE.Mesh(archG, materials().stonePlain); arch.position.set(o.lx, o.y, -(o.zs + o.r * 0.6)); root.add(arch);
    const voidG = new THREE.CircleGeometry(o.r + 0.05, 16, 0, Math.PI);
    const vd = new THREE.Mesh(voidG, _sockMat); vd.position.set(o.lx, o.y + 0.01, -(o.zs + o.r * 0.6) - 0.05); root.add(vd);
    root.userData = { geos: [bandG, laneG, lineG, sockG, rimG, archG, voidG], balls, R, n: 0 };
    void idx;
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, list = pose ? pose.balls : [];
    // an orb reached the socket: a puff where it dropped
    if (list.length < u.n && ctx.fx && ctx.dt > 0) ctx.fx.burst(o.lx, o.y + 0.2, -o.ze, ctx.fx.cols.thorn, 14, 2, 0.5, 0.07, 3);
    u.n = list.length;
    for (let k = 0; k < u.balls.length; k++) {
      const b = u.balls[k], q = list[k];
      b.visible = !!q;
      if (!q) continue;
      b.position.set(q.x, q.y, -q.z);
      b.rotation.set(q.roll, 0, 0);   // rolling toward three +z
      ctx.glow.add(q.x, o.y + 0.05, -q.z, o.r * 2.6, 0xff6ad0, 0.18);
    }
  },
};

// Unknown kinds: a clearly visible glowing box over the footprint, so nothing is ever invisible.
let _unkMat = null, _unkEdge = null;
export const FALLBACK = {
  make(o) {
    if (!_unkMat) {
      _unkMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0xff40c0, emissive: 0xff40c0, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }), { key: 'unk' });
      _unkEdge = new THREE.LineBasicMaterial({ color: col(0xffb0f0).multiplyScalar(2) });
    }
    const [cx, cz, w, d] = mid(o);
    const h = Math.max(0.2, Math.min(o.h ?? 0.5, 1.5));
    const g = new THREE.BoxGeometry(Math.max(0.1, w), h, Math.max(0.1, d));
    const grp = new THREE.Group(); grp.position.set(cx, o.y - h / 2, -cz);
    grp.add(new THREE.Mesh(g, _unkMat));
    const eg = new THREE.EdgesGeometry(g); grp.add(new THREE.LineSegments(eg, _unkEdge));
    grp.userData = { geos: [g, eg], unknown: true, h };
    return grp;
  },
  update(v, o, st, pose) {
    if (pose && pose.x != null && pose.z != null) v.position.set(pose.x, (pose.y ?? o.y) - v.userData.h / 2, -pose.z);
  },
};

export function viewFor(kind) { return VIEWS[kind] || FALLBACK; }

export function disposeView(v) {
  const u = v.userData || {};
  for (const g of u.geos || []) g.dispose();
  for (const im of u.insts || []) im.dispose();
  for (const m of u.mats || []) m.dispose();
}
