// The temple world around the course: twilight sky dome (sun left, moon right), stars, the abyss glow,
// drifting motes, side architecture (pillars, arches, hanging lanterns) and distant temple silhouettes.
// Everything streams in cells along z and is rebuilt deterministically from the cell index.
import * as THREE from './three.js';
import { U, PAL, col, hash, materials, patchWorld, GeoBuilder, textures } from './kit.js';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.1, -0.78).normalize();
export const MOON_DIR = new THREE.Vector3(0.55, 0.3, -0.78).normalize();

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uSun: { value: SUN_DIR }, uMoon: { value: MOON_DIR } },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime; uniform vec3 uSun; uniform vec3 uMoon;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        // base twilight gradient
        vec3 zen = vec3(0.022, 0.016, 0.07), mid = vec3(0.07, 0.045, 0.16), hor = vec3(0.2, 0.11, 0.26);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, e));
        c = mix(c, zen, smoothstep(0.2, 0.75, e));
        // warm sun side, cool moon side
        float side = d.x;
        vec3 warm = vec3(0.75, 0.28, 0.2), cool = vec3(0.12, 0.25, 0.55);
        float band = exp(-max(e, 0.0) * 5.5);
        c += warm * band * smoothstep(0.1, -0.9, side) * 0.38;
        c += cool * band * smoothstep(-0.1, 0.9, side) * 0.45;
        float sd = max(dot(d, uSun), 0.0), md = max(dot(d, uMoon), 0.0);
        c += vec3(1.0, 0.45, 0.2) * pow(sd, 16.0) * 0.45 + vec3(1.0, 0.6, 0.3) * pow(sd, 220.0) * 1.1;
        c += vec3(0.35, 0.6, 1.0) * pow(md, 30.0) * 0.35;
        // soft drifting cloud bands
        vec2 q = vec2(atan(d.x, -d.z) * 3.0, e * 9.0);
        float cl = vn(q * vec2(1.3, 0.8) + vec2(uTime * 0.01, 0.0)) * 0.6 + vn(q * 3.1 - vec2(uTime * 0.02, 0.0)) * 0.4;
        cl = smoothstep(0.5, 0.9, cl) * exp(-abs(e - 0.12) * 9.0);
        c = mix(c, mix(vec3(0.45, 0.2, 0.35), vec3(0.2, 0.25, 0.45), smoothstep(-0.5, 0.5, side)), cl * 0.45);
        // sun disc (setting, half-veiled)
        float sun = smoothstep(0.9985, 0.9992, sd);
        c = mix(c, vec3(4.0, 2.3, 0.9), sun);
        // crescent moon
        float m1 = smoothstep(0.99935, 0.9996, md);
        vec3 mo = normalize(uMoon + vec3(0.013, 0.008, 0.0));
        float m2 = smoothstep(0.99925, 0.9995, max(dot(d, mo), 0.0));
        c = mix(c, vec3(2.6, 2.9, 3.2), clamp(m1 - m2, 0.0, 1.0));
        // stars, more toward the moon side and higher up
        vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(e, -1.0, 1.0))) * 120.0;
        vec2 cell = floor(sp); vec2 f = fract(sp) - 0.5;
        float r = h21(cell);
        float star = step(0.985 - 0.012 * smoothstep(-0.3, 0.8, side), r) * smoothstep(0.06, 0.0, length(f - (vec2(h21(cell + 7.0), h21(cell + 3.0)) - 0.5) * 0.6) - 0.0);
        float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
        c += vec3(0.9, 0.95, 1.0) * star * tw * smoothstep(0.02, 0.25, e) * 1.6;
        // below the horizon: the abyss haze
        c = mix(c, vec3(0.06, 0.035, 0.11), smoothstep(0.0, -0.25, e));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// The abyss far below: a soft violet glow with slow veins. Follows the camera in x/z.
export function makeAbyss() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; uniform float uTime;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vW.xz * 0.06;
        float n = vn(p + uTime * 0.03) * 0.6 + vn(p * 2.3 - uTime * 0.05) * 0.4;
        float vein = smoothstep(0.47, 0.5, n) * smoothstep(0.53, 0.5, n);
        float cx = exp(-abs(vW.x) * 0.05);
        vec3 c = vec3(0.03, 0.016, 0.06) * (0.7 + 0.9 * cx) + vec3(0.32, 0.12, 0.5) * vein * 0.45 * cx;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), mat);
  m.renderOrder = -9; m.frustumCulled = false;
  return m;
}

// Mist below the course: a slow-drifting cloud layer the course seems to float over. Follows the camera.
export function makeMist(layer = 0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uLayer: { value: layer } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uCam; uniform float uLayer;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vW.xz * (0.045 + uLayer * 0.02) + vec2(uTime * 0.012, uTime * (0.02 + uLayer * 0.01));
        float n = vn(p) * 0.55 + vn(p * 2.3 + 7.0) * 0.3 + vn(p * 5.1 - 3.0) * 0.15;
        float d = length(vW.xz - uCam.xz);
        float a = smoothstep(0.35, 0.8, n) * (1.0 - smoothstep(60.0, 150.0, d)) * smoothstep(3.0, 14.0, d) * (0.42 - uLayer * 0.14);
        vec3 c = mix(vec3(0.2, 0.12, 0.34), vec3(0.42, 0.28, 0.58), n);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(320, 320).rotateX(-Math.PI / 2), mat);
  m.frustumCulled = false; m.renderOrder = 3 - layer;
  return m;
}

// Drifting motes: static random points wrapped around the camera in a box, in the shader.
export function makeMotes(n = 360) {
  const pos = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
  const cols = [col(0xffc070), col(0x8fdcff), col(0xc9a6ff), col(0x9dffb9)];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = hash(i, 1); pos[i * 3 + 1] = hash(i, 2); pos[i * 3 + 2] = hash(i, 3);
    const cc = cols[Math.floor(hash(i, 4) * 3.4) % 4]; c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    s[i] = 0.04 + hash(i, 5) * 0.07;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPtScale: U.uPtScale, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(36, 18, 70) }, uZone: U.uZone },
    vertexShader: `attribute vec3 color; attribute float size; uniform float uTime; uniform float uPtScale; uniform vec3 uCenter; uniform vec3 uBox; uniform float uZone;
      varying vec3 vC; varying float vA;
      void main() {
        vec3 r = position + vec3(sin(uTime * 0.2 + position.y * 20.0) * 0.02, uTime * 0.012, -uTime * 0.004);
        vec3 w = uCenter + (fract(r - uCenter / uBox) - 0.5) * uBox;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, size * uPtScale / -mv.z);
        float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(fract(r.x - uCenter.x / uBox.x) - 0.5), abs(fract(r.z - uCenter.z / uBox.z) - 0.5)));
        vA = edge * (0.55 + 0.45 * sin(uTime * 2.0 + position.x * 40.0)) * (1.0 - smoothstep(-0.5, 3.0, w.z - uZone));
        vC = color;
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)) * vA; gl_FragColor = vec4(vC * a * 1.6, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false; p.renderOrder = 6;
  return p;
}

// ---------------------------------------------------------------------------
// Side architecture, streamed in cells of CELL units along z.

const CELL = 12, SIDE_X = 9.2;

function pillarGeometry() {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.62, 0.68, 40, 8, 1); shaft.translate(0, -20, 0); parts.push(shaft);
  for (const [y, r, h] of [[0.25, 0.95, 0.5], [0.75, 1.15, 0.5], [-1.2, 0.8, 0.3], [-3.4, 0.78, 0.25]]) {
    const ring = new THREE.CylinderGeometry(r, r, h, 8, 1); ring.translate(0, y, 0); parts.push(ring);
  }
  const g = THREE.mergeGeometries(parts.map(p => p.toNonIndexed()));
  // gradient: lighter near the top, sinking into the dark
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3), a = col(0x6e6296), b = col(0x150f26), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { t.copy(b).lerp(a, Math.max(0, Math.min(1, (pos.getY(i) + 18) / 19))); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function archGeometry(span, rise) {
  // a pointed-ish arch spanning x in [-span, span], springing at y=0, made of a thick ribbon of blocks
  const B = new GeoBuilder(), seg = 22, th = 0.9, dep = 0.9;
  const c1 = col(0x7a6ca3), c2 = col(0x4b4070);
  const pt = (t, off) => { // t in [0,1] along the arch, off radial
    const a = Math.PI * t; const x = -Math.cos(a) * (span + off), y = Math.sin(a) * (rise + off * 1.1);
    return [x, y];
  };
  for (let k = 0; k < seg; k++) {
    const t0 = k / seg, t1 = (k + 1) / seg;
    const [ax, ay] = pt(t0, 0), [bx, by] = pt(t1, 0), [cx, cy] = pt(t1, th), [dx, dy] = pt(t0, th);
    const cc = k % 2 ? c1 : c2;
    const Z0 = -dep / 2, Z1 = dep / 2;
    B.quad([ax, ay, Z1], [bx, by, Z1], [cx, cy, Z1], [dx, dy, Z1], [0, 0, 1], [cc], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    B.quad([ax, ay, Z0], [bx, by, Z0], [cx, cy, Z0], [dx, dy, Z0], [0, 0, -1], [cc], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    B.quad([ax, ay, Z0], [bx, by, Z0], [bx, by, Z1], [ax, ay, Z1], [-(ax + bx), -(ay + by), 0], [c2], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    B.quad([dx, dy, Z0], [cx, cy, Z0], [cx, cy, Z1], [dx, dy, Z1], [(dx + cx), (dy + cy), 0], [c1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  return B.build();
}

function silhouetteChunk(ci, side) {
  // a few distant temple structures: towers, domes, stepped ziggurats, with lit windows
  const parts = [], wins = [];
  const n = 2 + Math.floor(hash(ci, side + 3) * 3);
  for (let k = 0; k < n; k++) {
    const r = (s) => hash(ci * 7 + k, s + side * 13);
    const x = side * (36 + r(1) * 70), z = -(ci * 60 + r(2) * 60), base = -30;
    const type = Math.floor(r(3) * 4), w = 4 + r(4) * 7, h = 18 + r(5) * 38;
    let top = base + h;
    if (type === 0) { // tower with spire
      parts.push(new THREE.BoxGeometry(w, h, w).translate(x, base + h / 2, z));
      parts.push(new THREE.ConeGeometry(w * 0.75, w * 2.2, 4).rotateY(Math.PI / 4).translate(x, top + w * 1.1, z));
    } else if (type === 1) { // drum and dome
      parts.push(new THREE.CylinderGeometry(w * 0.8, w * 0.9, h, 10).translate(x, base + h / 2, z));
      parts.push(new THREE.SphereGeometry(w * 0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, top, z));
      parts.push(new THREE.ConeGeometry(0.4, w * 0.9, 4).translate(x, top + w * 0.8 + w * 0.45, z));
    } else if (type === 2) { // stepped ziggurat
      let y = base, ww = w * 2.2;
      for (let s = 0; s < 5; s++) { const hh = h / 5; parts.push(new THREE.BoxGeometry(ww, hh, ww).translate(x, y + hh / 2, z)); y += hh; ww *= 0.78; }
      top = y;
    } else { // twin obelisks
      for (const o of [-1, 1]) { parts.push(new THREE.BoxGeometry(w * 0.4, h, w * 0.4).translate(x + o * w * 0.7, base + h / 2, z)); parts.push(new THREE.ConeGeometry(w * 0.3, w * 0.6, 4).rotateY(Math.PI / 4).translate(x + o * w * 0.7, top + w * 0.3, z)); }
    }
    // windows
    const nw = 2 + Math.floor(r(6) * 5);
    for (let q = 0; q < nw; q++) {
      const wy = base + h * (0.45 + r(10 + q) * 0.5);
      wins.push(new THREE.PlaneGeometry(0.7, 1.3).translate(x - side * (w * 0.5 + 0.05) * 0 + (r(20 + q) - 0.5) * w * 0.6, wy, z + w * 0.51));
    }
  }
  const g = THREE.mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)).map(p => { p.deleteAttribute('uv'); p.deleteAttribute('normal'); return p; }));
  {
    const pos = g.attributes.position, c = new Float32Array(pos.count * 3), lo = col(0x4a3870), hi = col(0x150e28), t = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { t.copy(lo).lerp(hi, Math.max(0, Math.min(1, (pos.getY(i) + 26) / 55))); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const wg = wins.length ? THREE.mergeGeometries(wins.map(p => { p.deleteAttribute('uv'); p.deleteAttribute('normal'); return p; })) : null;
  return { g, wg };
}

export class WorldDeco {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    const M = materials();
    this.pillarMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), { key: 'pil' });
    this.archMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, map: null }), { key: 'arc' });
    this.silMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.silMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n float ff = 0.2 + smoothstep(fogNear, fogFar * 1.6, vFogDepth) * 0.5;\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.16, 0.1, 0.25), ff);\n#endif'); };
    this.silMat.customProgramCacheKey = () => 'sil';
    this.winMats = [new THREE.MeshBasicMaterial({ color: col(0xffb860).multiplyScalar(1.6), fog: false }), new THREE.MeshBasicMaterial({ color: col(0x8fd0ff).multiplyScalar(1.4), fog: false })];
    this.pillarG = pillarGeometry();
    this.archG = archGeometry(SIDE_X, 6.5);
    this.keyG = new THREE.CircleGeometry(0.55, 16);
    // instanced near deco
    this.maxCells = 24;
    this.pillars = new THREE.InstancedMesh(this.pillarG, this.pillarMat, this.maxCells * 2);
    this.arches = new THREE.InstancedMesh(this.archG, this.archMat, this.maxCells);
    this.keys = new THREE.InstancedMesh(this.keyG, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.maxCells * 2);
    this.chainsG = new THREE.CylinderGeometry(0.035, 0.035, 1, 4).translate(0, -0.5, 0);
    this.chains = new THREE.InstancedMesh(this.chainsG, M.metal, this.maxCells * 2);
    this.lanternCaps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 0.26, 6).translate(0, -0.13, 0), M.gold, this.maxCells * 2);
    this.lanternCores = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.46, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.maxCells * 2);
    this.lanternBases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 6).translate(0, -0.78, 0), M.gold, this.maxCells * 2);
    for (const im of [this.pillars, this.arches, this.keys, this.chains, this.lanternCaps, this.lanternCores, this.lanternBases]) {
      im.count = 0; im.frustumCulled = false; this.group.add(im);
    }
    this.sil = new Map();   // chunk key -> meshes
    this.lanterns = [];     // for glow sprites: {x,y,z,c}
    this.cellKey = '';
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
  }

  // camZ0..camZ1: the sim z range to cover; yAt(z): course height near z
  update(z0, z1, yAt, time) {
    const c0 = Math.floor(z0 / CELL), c1 = Math.min(c0 + this.maxCells - 1, Math.ceil(z1 / CELL));
    const key = c0 + ':' + c1;
    if (key !== this.cellKey) {
      this.cellKey = key;
      const m = this._m, q = this._q, v = this._v, s = this._s;
      let np = 0, na = 0, nk = 0, nl = 0;
      this.lanterns = [];
      for (let ci = c0; ci <= c1; ci++) {
        const z = ci * CELL + 4, y = yAt(z), arch = ((ci % 3) + 3) % 3 === 0;
        for (const side of [-1, 1]) {
          v.set(side * SIDE_X, y + 2.2, -z); q.identity(); s.set(1, 1, 1);
          m.compose(v, q, s); this.pillars.setMatrixAt(np++, m);
          if (!arch) {
            // lantern hanging from a bracket on the pillar's inner face
            const lx = side * (SIDE_X - 1.1), ly = y + 4.6, chainL = 1.1;
            m.compose(v.set(lx, ly + chainL, -z), q.identity(), s.set(1, chainL, 1)); this.chains.setMatrixAt(nl, m);
            m.compose(v.set(lx, ly, -z), q, s.set(1, 1, 1)); this.lanternCaps.setMatrixAt(nl, m); this.lanternCores.setMatrixAt(nl, m); this.lanternBases.setMatrixAt(nl, m);
            const lc = side < 0 ? 0xffb050 : 0x7cc8ff;
            this.lanternCores.setColorAt(nl, this._c.setHex(lc).multiplyScalar(2.4));
            this.lanterns.push({ x: lx, y: ly - 0.5, z: -z, c: lc });
            nl++;
          }
        }
        if (arch) {
          m.compose(v.set(0, y + 3.2, -z), q.identity(), s.set(1, 1, 1)); this.arches.setMatrixAt(na++, m);
          // keystone emblems: sun facing the players, moon on the far side
          m.compose(v.set(0, y + 3.2 + 6.5 + 0.45, -z + 0.47), q.identity(), s.set(1, 1, 1)); this.keys.setMatrixAt(nk, m);
          this.keys.setColorAt(nk++, this._c.setHex((ci & 1) ? 0xffb050 : 0x8fd8ff).multiplyScalar(2.2));
        }
      }
      this.pillars.count = np; this.arches.count = na; this.keys.count = nk;
      this.chains.count = this.lanternCaps.count = this.lanternCores.count = this.lanternBases.count = nl;
      for (const im of [this.pillars, this.arches, this.keys, this.chains, this.lanternCaps, this.lanternCores, this.lanternBases]) {
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    // distant silhouettes in 60-unit chunks
    const s0 = Math.floor((z0 - 30) / 60), s1 = Math.ceil((z1 + 60) / 60);
    const want = new Set();
    for (let ci = s0; ci <= s1; ci++) for (const side of [-1, 1]) {
      const k = ci * 2 + (side > 0 ? 1 : 0); want.add(k);
      if (!this.sil.has(k)) {
        const { g, wg } = silhouetteChunk(ci, side);
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(g, this.silMat));
        if (wg) grp.add(new THREE.Mesh(wg, this.winMats[side > 0 ? 1 : 0]));
        grp.position.y = yAt(ci * 60);
        this.group.add(grp); this.sil.set(k, grp);
      }
    }
    for (const [k, grp] of this.sil) if (!want.has(k)) { this.group.remove(grp); grp.children.forEach(c => c.geometry.dispose()); this.sil.delete(k); }
  }

  dispose() {
    for (const [, grp] of this.sil) grp.children.forEach(c => c.geometry.dispose());
    this.sil.clear();
    this.scene.remove(this.group);
    for (const im of [this.pillars, this.arches, this.keys, this.chains, this.lanternCaps, this.lanternCores, this.lanternBases]) im.dispose();
    this.pillarG.dispose(); this.archG.dispose();
  }
}
void textures; void PAL;
