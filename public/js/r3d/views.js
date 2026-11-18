// One view per object kind: VIEWS[kind] = { make(o, L, idx) -> Object3D, update(view, o, st, pose, ctx) }.
// make() builds the object at its rest footprint in three space; update() runs every frame with the
// object's state from S.o (st, may be undefined), the sim's pose for it (pose, may be null) and ctx:
// { time, dt, tick, S, L, fx, glow, idx }. An unknown kind falls back to a glowing box over its footprint.
// Every mesh or geometry a view owns goes in userData.geos / mats / insts so disposeView frees it.
import * as THREE from './three.js';
import {
  PAL, col, hash, materials, patchWorld, slabGeometry, inlayMesh, runeBand, crystalGeometry, liquidMaterial, LIQ3, chainMesh, aimChain,
} from './kit.js';

export const VIEWS = {};

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
  if (runes && w >= 1.5 && h >= 0.4) {
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
    grp.userData = { geos, el, w, d, bub: 0 };
    void idx;
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, L3 = LIQ3[u.el] || LIQ3[0];
    const c = _c.setHex(L3.glow);
    const n = Math.max(1, Math.min(4, Math.round(u.w * u.d / 8)));
    for (let k = 0; k < n; k++) {
      const gx = v.position.x + (hash(ctx.idx, k) - 0.5) * u.w * 0.7, gz = v.position.z + (hash(k, ctx.idx) - 0.5) * u.d * 0.7;
      ctx.glow.add(gx, v.position.y + 0.2, gz, Math.min(4.5, Math.max(u.w, u.d)) * 1.2, c, (u.el === 2 ? 0.2 : 0.28) + 0.06 * Math.sin(ctx.time * 2 + k));
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

// A thick slab hung from four chains up to a stone crossbeam held by two columns rising from the abyss.
VIEWS.tilt = {
  make(o, L, idx) {
    const grp = new THREE.Group();
    const slab = stoneSlab({ ...o, x0: -o.hx, x1: o.hx, z0: -o.hz, z1: o.hz, y: 0 }, idx, { h: 0.6, inlay: false, glow: 0.8 });
    slab.position.set(0, 0, 0);
    // a moon-and-sun balance emblem on the top
    const em = inlayMesh(hash(idx, 2) > 0.5 ? 1 : 0, Math.min(o.hx, o.hz) * 1.3); slab.add(em); slab.userData.geos.push(em.geometry);
    grp.add(slab);
    // fixed frame: crossbeam above the slab, columns at its sides
    const top = o.chain ?? 7, M = materials();
    const bw = 2 * o.hx + 2.6;
    const beamG = slabGeometry(bw, 0.7, 0.6, { glow: 0.35, top: col(0x8a7cb6), side: col(0x4a3f6e) });
    const beam = new THREE.Mesh(beamG, M.stone); beam.position.set(o.cx, o.y + top + 0.6, -o.cz);
    const colG = new THREE.CylinderGeometry(0.32, 0.38, top + 22, 8).translate(0, -(top + 22) / 2 + 0.6, 0);
    const pos = colG.attributes.position, cc = new Float32Array(pos.count * 3), a = col(0x6a5d92), b = col(0x120c20);
    for (let i = 0; i < pos.count; i++) { _c.copy(b).lerp(a, Math.max(0, Math.min(1, (pos.getY(i) + top * 1.6) / (top * 1.6)))); cc.set([_c.r, _c.g, _c.b], i * 3); }
    colG.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const cols = [-1, 1].map((sx) => { const m = new THREE.Mesh(colG, postMatOf()); m.position.set(o.cx + sx * (bw / 2 - 0.3), o.y + top + 0.3, -o.cz); return m; });
    const frame = new THREE.Group(); frame.add(beam, ...cols);
    // the beam's lantern glow points
    const chains = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ch = chainMesh(top, 0.2); frame.add(ch); chains.push({ ch, sx, sz });
    }
    grp.userData = { geos: [...slab.userData.geos, beamG, colG], insts: chains.map(c => c.ch), slab, chains, frame, top };
    const root = new THREE.Group(); root.add(grp, frame);
    root.userData = grp.userData;
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    const ax = pose ? pose.ax : 0, az = pose ? pose.az : 0;
    shearTo(u.slab, o.cx, o.y, o.cz, ax, az);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const c of u.chains) {
      const X = o.cx + c.sx * (o.hx - 0.25), Z = o.cz + c.sz * (o.hz - 0.25);
      const Y = o.y + ax * (X - o.cx) + az * (Z - o.cz);
      a.set(X, o.y + u.top + 0.3, -Z); b.set(X, Y + 0.02, -Z);
      aimChain(c.ch, a, b);
    }
    ctx.glow.add(o.cx, o.y + u.top + 0.6, -o.cz - 0.4, 1.6, 0xffc070, 0.35);
  },
};
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
VIEWS.crumble = {
  make(o, L, idx) {
    const [, , w, d] = mid(o);
    const mat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, map: materials().stone.map, roughness: 0.85,
      emissive: 0xff6a20, emissiveMap: crumbleTex(), emissiveIntensity: 0.6 }), { glow: true, key: 'crum' });
    const grp = stoneSlab(o, idx, { h: 0.5, inlay: false, runes: false, glow: 0.4, top: col(0x7a5a6e), side: col(0x3e2238), mat });
    grp.userData.mats = [mat];
    grp.userData.base = grp.position.clone();
    grp.userData.w = w; grp.userData.d = d; grp.userData.lastSt = 0;
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, p = pose || { st: 0, t: 0, dy: 0, shake: 0 };
    const m = u.mats[0];
    let sx = 0, sz = 0, scale = 1, vis = true;
    if (p.st === 1) {
      const k = p.shake;
      sx = Math.sin(ctx.time * 61 + ctx.idx) * 0.05 * k; sz = Math.sin(ctx.time * 53) * 0.05 * k;
      m.emissiveIntensity = 0.8 + k * 3.5;
    } else if (p.st === 2) {
      m.emissiveIntensity = Math.max(0, 3 - p.t * 0.12);
      vis = p.dy < 5.9;
    } else if (p.st === 3) {
      const k = Math.min(1, p.t / 20);
      scale = 0.4 + 0.6 * k * k * (3 - 2 * k);
      m.emissiveIntensity = 2.5 * (1 - k) + 0.6;
    } else m.emissiveIntensity = 0.6 + 0.15 * Math.sin(ctx.time * 2 + ctx.idx);
    v.visible = vis;
    v.position.set(u.base.x + sx, u.base.y - p.dy, u.base.z + sz);
    v.scale.set(scale, scale, scale);
    if (u.lastSt !== p.st && ctx.fx) {
      if (p.st === 2) ctx.fx.burst(u.base.x, u.base.y, u.base.z, ctx.fx.cols.sun, 26, 2.5, 0.9, 0.09, 6);
      if (p.st === 3) ctx.fx.burst(u.base.x, u.base.y + 0.2, u.base.z, ctx.fx.cols.sun, 12, 1.2, 0.6, 0.07, -1);
    }
    u.lastSt = p.st;
    if (vis) ctx.glow.add(v.position.x, v.position.y + 0.1, v.position.z, Math.max(u.w, u.d) * 1.1, 0xff7a30, Math.min(0.5, m.emissiveIntensity * 0.12));
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
    const beamG = new THREE.BoxGeometry(0.34, 0.3, len).translate(0, bar * 0.55, off);
    rot.add(new THREE.Mesh(beamG, materials().gold));
    // thorns along the beam, pointing out both sides and up
    const n = Math.round(len / 0.26) * 3;
    const im = new THREE.InstancedMesh(_thornGeo, _thornMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0;
    for (let j = 0; j < n / 3; j++) {
      const z = off - len / 2 + (j + 0.5) * len / (n / 3);
      void 0;
      if (Math.abs(z) < 0.5) continue;
      for (const a of [-1.35, 0, 1.35]) {
        const r = hash(idx * 5 + j, a + 3);
        e.set(0, 0, -a + (r - 0.5) * 0.3); q.setFromEuler(e);
        p.set(0, bar * 0.55, z); s.set(0.1, 0.34 + r * 0.16, 0.1);
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
    root.userData = { geos: [beamG, hubG, ringG], insts: [im], rot, R, arms, off };
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

// Pendulum: a crescent blade on a rod, swinging in the x-y plane from a pivot on a stone yoke.
VIEWS.pendulum = {
  make(o, L, idx) {
    const root = new THREE.Group();
    const piv = new THREE.Group(); piv.position.set(o.px, o.py, -o.pz); root.add(piv);
    const rodG = new THREE.CylinderGeometry(0.05, 0.05, o.R, 6).translate(0, -o.R / 2, 0);
    piv.add(new THREE.Mesh(rodG, materials().metal));
    // blade: a crescent disc with a sharp glowing edge
    const sh = new THREE.Shape();
    const rb = o.rb;
    sh.absarc(0, 0, rb, Math.PI * 0.05, Math.PI * 0.95, true);
    sh.absarc(0, rb * 0.55, rb * 0.72, Math.PI * 0.98, Math.PI * 0.02, false);
    const bladeG = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1, curveSegments: 18 }).translate(0, 0, -0.04);
    const blade = new THREE.Mesh(bladeG, materials().metal); blade.position.y = -o.R; piv.add(blade);
    const edgeG = new THREE.TorusGeometry(rb + 0.02, 0.03, 4, 28, Math.PI * 0.9).rotateZ(Math.PI * 1.05);
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
    const a = new THREE.Vector3(o.cx, o.y + 2.5, -o.cz), b = new THREE.Vector3();
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

// Gate: a thorn curtain between two stone posts with a lintel; the opening slides along it.
// Thorn columns are re-spaced every frame to fill [x0, gap left] and [gap right, x1].
const GATE_COLS = 9, GATE_ROWS = 7;
VIEWS.gate = {
  make(o, L, idx) {
    thornAssets();
    const root = new THREE.Group();
    const [, cz, w] = mid(o), zc = -cz, th = o.th ?? 4.6;
    const im = new THREE.InstancedMesh(_thornGeo, _thornMat, 2 * GATE_COLS * GATE_ROWS * 2);
    im.frustumCulled = false;
    root.add(im);
    // vines: two thin dark bars per side that stretch with the curtain
    const vineG = new THREE.BoxGeometry(1, th, 0.12).translate(0.5, th / 2, 0);
    const vineMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0x2a1238, emissive: 0x4a1048, emissiveIntensity: 0.8, roughness: 0.7, transparent: true, opacity: 0.75 }), { key: 'vine' });
    const vines = [0, 1].map(() => { const m = new THREE.Mesh(vineG, vineMat); m.position.set(0, o.y, zc); root.add(m); return m; });
    const postG = new THREE.BoxGeometry(0.7, th + 0.8, 0.9).translate(0, (th + 0.8) / 2 - 0.4, 0);
    for (const x of [o.x0 - 0.35, o.x1 + 0.35]) { const p = new THREE.Mesh(postG, materials().stonePlain); p.position.set(x, o.y, zc); root.add(p); }
    const lintG = slabGeometry(w + 1.6, 0.9, 0.6, { glow: 0.5 });
    const lint = new THREE.Mesh(lintG, materials().stone); lint.position.set((o.x0 + o.x1) / 2, o.y + th + 0.6, zc); root.add(lint);
    // glowing edges of the opening
    const edgeG = new THREE.BoxGeometry(0.06, th, 0.06).translate(0, th / 2, 0);
    const edges = [0, 1].map(() => { const m = new THREE.Mesh(edgeG, glowMat(0x9dffb9, 1.6)); m.position.set(0, o.y, zc); root.add(m); return m; });
    root.userData = { geos: [vineG, postG, lintG, edgeG], mats: [vineMat], insts: [im], im, vines, edges, zc, th, seed: idx };
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, gx = pose ? pose.x : o.cx, gw = pose ? pose.gw : o.gw;
    const segs = [[o.x0, gx - gw], [gx + gw, o.x1]];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0;
    segs.forEach(([a, b], si) => {
      const len = Math.max(0, b - a);
      u.vines[si].visible = len > 0.02;
      u.vines[si].position.x = a; u.vines[si].scale.x = Math.max(0.001, len);
      if (len < 0.05) return;
      const nc = Math.max(1, Math.min(GATE_COLS, Math.round(len / 0.45)));
      for (let c = 0; c < nc; c++) for (let r = 0; r < GATE_ROWS; r++) for (const side of [-1, 1]) {
        const hr = hash(u.seed * 3 + c * 11 + si, r * 7 + side);
        p.set(a + (c + 0.5) * len / nc, o.y + (r + 0.5) * u.th / GATE_ROWS, u.zc + side * 0.06);
        e.set(side * (1.2 + hr * 0.4), 0, (hr - 0.5) * 0.8); q.setFromEuler(e);
        s.set(0.08, 0.28 + hr * 0.16, 0.08);
        m.compose(p, q, s); u.im.setMatrixAt(k++, m);
      }
    });
    u.im.count = k; u.im.instanceMatrix.needsUpdate = true;
    u.edges[0].position.x = gx - gw; u.edges[1].position.x = gx + gw;
    for (const x of [gx - gw, gx + gw]) for (const h of [0.6, 1.8, 3.0]) ctx.glow.add(x, o.y + h, u.zc, 0.7, 0x60ff9a, 0.25);
  },
};

// Orbs: rolling stone spheres with a glowing band, along a carved lane.
let _orbGeo = null, _orbMat = null;
VIEWS.orb = {
  make(o, L, idx) {
    if (!_orbGeo) {
      _orbGeo = new THREE.IcosahedronGeometry(1, 2);
      _orbMat = patchWorld(new THREE.MeshStandardMaterial({ color: 0x6e5f96, roughness: 0.75, flatShading: true, emissive: 0x1a0c2a }), { rim: col(0xb89cff).multiplyScalar(0.6), key: 'orb' });
    }
    const root = new THREE.Group();
    const maxN = Math.ceil((o.zs - o.ze) / Math.max(0.01, o.vo * o.P)) + 1;
    const bandG = new THREE.TorusGeometry(1.0, 0.07, 4, 24).rotateY(Math.PI / 2);
    const balls = [];
    for (let k = 0; k < maxN; k++) {
      const b = new THREE.Group();
      const s = new THREE.Mesh(_orbGeo, _orbMat); b.add(s);
      const band = new THREE.Mesh(bandG, glowMat(0xff9ae8, 1.8)); b.add(band);
      const band2 = new THREE.Mesh(bandG, glowMat(0xff9ae8, 1.8)); band2.rotation.z = Math.PI / 2; b.add(band2);
      b.scale.setScalar(o.r); b.visible = false; root.add(b); balls.push(b);
    }
    // lane groove on the floor and a launch arch at the far end
    const laneG = new THREE.PlaneGeometry(o.r * 1.3, o.zs - o.ze + 2 * o.r).rotateX(-Math.PI / 2);
    const lane = new THREE.Mesh(laneG, glowMat(0x2a1640, 1, { opacity: 0.65 })); lane.position.set(o.lx, o.y + 0.012, -(o.zs + o.ze) / 2); root.add(lane);
    const lineG = new THREE.PlaneGeometry(0.05, o.zs - o.ze + 2 * o.r).rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(lineG, glowMat(0xc070ff, 1.2, { additive: true })); l.position.set(o.lx + sx * o.r * 0.65, o.y + 0.016, -(o.zs + o.ze) / 2); root.add(l); }
    root.userData = { geos: [bandG, laneG, lineG], balls };
    void idx;
    return root;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, list = pose ? pose.balls : [];
    for (let k = 0; k < u.balls.length; k++) {
      const b = u.balls[k], q = list[k];
      b.visible = !!q;
      if (!q) continue;
      // grow in at the launch end, sink out at the near end
      const g = Math.min(1, (o.zs - q.z) / (o.r * 1.5) + 0.25, (q.z - o.ze) / (o.r * 1.5) + 0.25);
      b.scale.setScalar(o.r * Math.max(0.05, g));
      b.position.set(q.x, o.y + o.r * Math.max(0.05, g), -q.z);
      b.rotation.set(q.roll, 0, 0);
      ctx.glow.add(q.x, o.y + 0.05, -q.z, o.r * 2.6, 0xff6ad0, 0.18 * g);
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
