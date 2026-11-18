// Particles: a ring buffer of point sprites updated on the CPU, one draw call per blend mode.
// Positions are three space. Effects: dust, sparks, splashes, embers, shards, motes trails.
import * as THREE from './three.js';
import { U } from './kit.js';

class Pool {
  constructor(max, blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 4); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    const add = blending === THREE.AdditiveBlending;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPtScale: U.uPtScale },
      vertexShader: `attribute vec4 color; attribute float size; uniform float uPtScale; varying vec4 vC;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size <= 0.0 ? 0.0 : max(1.5, size * uPtScale / -mv.z); vC = color; }`,
      fragmentShader: `varying vec4 vC;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vC.a;
          ${add ? 'gl_FragColor = vec4(vC.rgb * a, a);' : 'gl_FragColor = vec4(vC.rgb, a);'}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = add ? 9 : 4;
  }
  spawn(x, y, z, vx, vy, vz, life, size0, size1, c, a = 1, grav = 0, drag = 0) {
    const i = this.next; this.next = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size0; this.s1[i] = size1;
    this.base[i * 4] = c.r; this.base[i * 4 + 1] = c.g; this.base[i * 4 + 2] = c.b; this.base[i * 4 + 3] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.life[i] > 0 ? this.s1[i] + (this.s0[i] - this.s1[i]) * k : 0;
      const fade = Math.min(1, k * 3) * Math.min(1, (1 - k) * 12 + 0.2);
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * fade;
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.size.fill(0); this.aSize.needsUpdate = true; }
  dispose() { this.points.geometry.dispose(); this.points.material.dispose(); }
}

const R = () => Math.random() - 0.5;
const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export class FX {
  constructor(scene) {
    this.add = new Pool(1600, THREE.AdditiveBlending);
    this.norm = new Pool(500, THREE.NormalBlending);
    scene.add(this.add.points); scene.add(this.norm.points);
    this.cols = {
      sun: [C(0xffd166, 1.6), C(0xff7b3a, 1.6), C(0xfff1a8, 1.8)],
      moon: [C(0xcfefff, 1.5), C(0x7fd6ff, 1.5), C(0xffffff, 1.6)],
      ember: [C(0x5dff9a, 1.8), C(0xa070ff, 1.4)],
      dust: C(0x8a7cae), smoke: C(0x1b0f2a), thorn: [C(0xff8ae0, 2), C(0xffc2ec, 2.2)],
    };
  }
  update(dt) { this.add.update(dt); this.norm.update(dt); }
  clear() { this.add.clear(); this.norm.clear(); }

  // trail motes behind a running character
  trail(who, x, y, z, vx, vz) {
    const cs = who ? this.cols.moon : this.cols.sun;
    const c = cs[Math.floor(Math.random() * cs.length)];
    if (who) this.add.spawn(x + R() * 0.4, y + 0.4 + Math.random() * 0.6, z + R() * 0.3, -vx * 0.3 + R() * 0.3, 0.15 + Math.random() * 0.2, vz * 0.3 + R() * 0.2, 0.9, 0.07, 0.01, c, 0.9, -0.05, 1.5);
    else this.add.spawn(x + R() * 0.35, y + 0.5 + Math.random() * 0.5, z + R() * 0.3, -vx * 0.3 + R() * 0.4, 0.6 + Math.random() * 0.6, vz * 0.3 + R() * 0.3, 0.6, 0.08, 0.02, c, 1, 0.4, 2);
  }
  dust(x, y, z, n = 10, who = -1, strength = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 1.4) * strength;
      this.norm.spawn(x + Math.cos(a) * 0.25, y + 0.05, z + Math.sin(a) * 0.25, Math.cos(a) * s, 0.3 + Math.random() * 0.5, Math.sin(a) * s, 0.55 + Math.random() * 0.3, 0.16, 0.38, this.cols.dust, 0.45, 0.6, 4);
    }
    if (who >= 0) for (let k = 0; k < n / 2; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.5;
      const cs = who ? this.cols.moon : this.cols.sun;
      this.add.spawn(x, y + 0.08, z, Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s, 0.4, 0.06, 0.0, cs[k % cs.length], 1, 3, 3);
    }
  }
  burst(x, y, z, colors, n = 30, speed = 3, life = 0.9, size = 0.09, grav = 2) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.4 + Math.random() * 0.6);
      this.add.spawn(x, y, z, Math.cos(a) * r * s, u * s + speed * 0.3, Math.sin(a) * r * s, life * (0.6 + Math.random() * 0.6), size, size * 0.2, colors[k % colors.length], 1, grav, 1.2);
    }
  }
  smoke(x, y, z, n = 18) {
    for (let k = 0; k < n; k++) this.norm.spawn(x + R() * 0.6, y + Math.random() * 1.2, z + R() * 0.6, R() * 1.2, 0.4 + Math.random() * 0.8, R() * 1.2, 1.2 + Math.random() * 0.6, 0.35, 0.9, this.cols.smoke, 0.75, -0.2, 1);
  }
  splash(x, y, z, c, n = 26) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.6;
      this.add.spawn(x + R() * 0.3, y + 0.05, z + R() * 0.3, Math.cos(a) * s, 2.5 + Math.random() * 3, Math.sin(a) * s, 0.8, 0.1, 0.03, c, 1, 9, 0.5);
    }
  }
  ember(x, y, z) {
    const c = this.cols.ember[Math.random() < 0.65 ? 0 : 1];
    this.add.spawn(x, y, z, R() * 0.6, 0.4 + Math.random() * 1.2, -(0.6 + Math.random() * 1.6), 1.6 + Math.random(), 0.08, 0.02, c, 0.9, -0.1, 0.4);
  }
  dispose() { this.add.dispose(); this.norm.dispose(); }
}
