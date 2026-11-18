// One view per object kind: VIEWS[kind] = { make(o, L) -> Object3D, update(view, o, st, pose, ctx) }.
// make() builds the object at its rest footprint in three space; update() runs every frame with the
// object's state from S.o (st, may be undefined), the sim's pose for it (pose, may be null) and ctx:
// { time, dt, S, L, fx, glow, idx }. An unknown kind falls back to a glowing box over its footprint.
import * as THREE from './three.js';
import {
  PAL, col, hash, materials, patchWorld, slabGeometry, inlayMesh, runeBand, crystalGeometry, liquidMaterial, LIQ3,
} from './kit.js';

export const VIEWS = {};

const mid = (o) => [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2, o.x1 - o.x0, o.z1 - o.z0];

// Skins tint the stone: a few variants keep long runs from looking cloned.
const SKINS = {
  default: [PAL.stoneTop, PAL.stoneSide],
  sun: [0xb39a9a, 0x6a4a5c], moon: [0x8ea0cc, 0x48507e], dark: [0x6e6290, 0x3a3058], gold: [0xc0a070, 0x6a5040],
};
function skinCols(o, idx) {
  const s = SKINS[o.skin] || SKINS.default;
  const v = 0.94 + hash(idx, 3) * 0.1;
  return [col(s[0]).multiplyScalar(v), col(s[1]).multiplyScalar(v)];
}

// A stone slab group positioned at the footprint centre, top at o.y. Adds inlay and front rune band.
export function stoneSlab(o, idx, { h = o.h ?? 1, inlay = true, runes = true, glow = 0.55, top = null, side = null } = {}) {
  const [cx, cz, w, d] = mid(o);
  const [t, s] = skinCols(o, idx);
  const S = 0.25;
  const geo = slabGeometry(w, d, h, { top: top || t, side: side || s, glow, frontGlow: 0, uvOff: [cx * S, cz * S] });
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(geo, materials().stone);
  grp.add(mesh);
  grp.position.set(cx, o.y, -cz);
  grp.userData.geos = [geo];
  if (inlay && d >= 6 && w >= 3.5) {
    const el = hash(idx, 11) > 0.5 ? 1 : 0;
    const size = Math.min(3.4, Math.min(w, d) * 0.6);
    const m = inlayMesh(el, size); m.rotation.y = hash(idx, 5) * 6.28;
    grp.add(m); grp.userData.geos.push(m.geometry);
  }
  if (runes && w >= 1.5 && h >= 0.4) {
    const r = runeBand(w * 0.86, Math.min(0.3, h * 0.4));
    r.position.set(0, -Math.min(0.3, h * 0.35) - 0.05, d / 2 + 0.012);
    grp.add(r); grp.userData.geos.push(r.geometry);
  }
  return grp;
}

VIEWS.floor = {
  make(o, L, idx) { return stoneSlab(o, idx); },
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
    m.position.y = 0.012;
    grp.add(m);
    // basin lip: four thin bevelled rails just around the edge
    const lip = 0.12, geos = [surf];
    const rail = (rw, rd, x, z) => {
      const g = slabGeometry(rw, rd, 0.3, { glow: 0.25, top: col(0x7d6fa8), side: col(0x3e335e) });
      const r = new THREE.Mesh(g, materials().stone); r.position.set(x, 0.03, z); grp.add(r); geos.push(g);
    };
    rail(w + lip * 2, lip, 0, -d / 2 - lip / 2); rail(w + lip * 2, lip, 0, d / 2 + lip / 2);
    rail(lip, d, -w / 2 - lip / 2, 0); rail(lip, d, w / 2 + lip / 2, 0);
    grp.userData = { geos, el, w, d, bub: 0 };
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData, L3 = LIQ3[u.el] || LIQ3[0];
    const c = col(L3.glow);
    const n = Math.max(1, Math.round(u.w * u.d / 6));
    for (let k = 0; k < n; k++) {
      const gx = v.position.x + (hash(ctx.idx, k) - 0.5) * u.w * 0.8, gz = v.position.z + (hash(k, ctx.idx) - 0.5) * u.d * 0.8;
      ctx.glow.add(gx, v.position.y + 0.25, gz, Math.min(4, Math.max(u.w, u.d)) * 1.1, c, 0.32 + 0.08 * Math.sin(ctx.time * 2 + k));
    }
    u.bub -= ctx.dt;
    if (u.bub < 0 && ctx.fx) {
      u.bub = 0.08 + Math.random() * 0.25;
      const bc = col(L3.hi).multiplyScalar(u.el === 2 ? 1.2 : 2);
      ctx.fx.add.spawn(v.position.x + (Math.random() - 0.5) * u.w, v.position.y + 0.05, v.position.z + (Math.random() - 0.5) * u.d,
        0, 0.4 + Math.random() * 0.5, 0, 0.9, 0.07, 0.02, bc, 0.9, -0.1, 0.5);
    }
  },
};

// Thorns: a bed of crystal spikes, deadly to both. Top of the thorns at y + 0.3.
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
VIEWS.spikes = {
  make(o, L, idx) {
    thornAssets();
    const [cx, cz, w, d] = mid(o);
    const grp = new THREE.Group(); grp.position.set(cx, o.y, -cz);
    const sp = 0.3, nx = Math.max(1, Math.round(w / sp)), nz = Math.max(1, Math.round(d / sp));
    const im = new THREE.InstancedMesh(_thornGeo, _thornMat, nx * nz);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const r = (k) => hash(idx * 31 + i * 7 + k, j * 13 + k);
      p.set(-w / 2 + (i + 0.5) * w / nx + (r(1) - 0.5) * 0.1, 0, -d / 2 + (j + 0.5) * d / nz + (r(2) - 0.5) * 0.1);
      const hh = 0.2 + r(3) * 0.1 + (r(6) > 0.85 ? 0.05 : 0);   // top of the tallest ~ y + 0.3 (+ a few points of flair)
      e.set((r(4) - 0.5) * 0.35, r(5) * 6.28, (r(7) - 0.5) * 0.35); q.setFromEuler(e);
      const rad = 0.075 + r(8) * 0.05; s.set(rad, hh, rad);
      m.compose(p, q, s); im.setMatrixAt(n++, m);
    }
    im.count = n;
    grp.add(im);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), _bedMat); bed.position.y = 0.0; grp.add(bed);
    grp.userData = { geos: [bed.geometry], w, d, insts: [im] };
    return grp;
  },
  update(v, o, st, pose, ctx) {
    const u = v.userData;
    const tw = 0.5 + 0.5 * Math.sin(ctx.time * 3 + ctx.idx);
    ctx.glow.add(v.position.x, v.position.y + 0.25, v.position.z, Math.max(u.w, u.d) * 0.9 + 0.8, 0xff5ad0, 0.22 + 0.1 * tw);
    if (Math.random() < ctx.dt * 1.5) {
      ctx.glow.add(v.position.x + (Math.random() - 0.5) * u.w, v.position.y + 0.35, v.position.z + (Math.random() - 0.5) * u.d, 0.6, 0xffffff, 0.9);
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
    grp.userData = { geos: [g, eg], unknown: true };
    return grp;
  },
  update(v, o, st, pose) {
    if (pose && pose.x != null) v.position.set(pose.x, pose.y - (v.children[0].geometry.parameters.height / 2), -pose.z);
  },
};

export function viewFor(kind) { return VIEWS[kind] || FALLBACK; }

export function disposeView(v) {
  for (const g of v.userData.geos || []) g.dispose();
  for (const im of v.userData.insts || []) im.dispose();
}
