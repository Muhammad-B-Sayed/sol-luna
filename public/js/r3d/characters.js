// Sol and Luna as procedural chibi characters (about 1.4 units tall on a 0.72 footprint), with
// procedural animation: idle, run (tied to speed), jump, fall, land squash, death dissolves, victory.
// Built facing three-space -z (sim +z, down the course). The camera mostly sees their backs, so the
// back silhouette carries each one's motif: Sol's ring of sun rays, Luna's crescent halo.
import * as THREE from './three.js';
import { patchWorld, col } from './kit.js';

const SOL = 0;

const LOOK = [
  { // Sol
    head: [0xfff6c2, 0xffc93c, 0xf08a1c], body: [0xffcf4a, 0xf07a1f], limb: 0x7a2e12, eye: 0x5a1d05, cheek: 0xff6e3c,
    rim: col(0xff9a40).multiplyScalar(0.9), core: 0xfff0b0, glow: col(0xffa040), light: 0xffa850,
    emissive: col(0x5a2400),
  },
  { // Luna
    head: [0xf4fbff, 0xb8dcff, 0x6c9ee6], body: [0x8cc4ff, 0x2f5fb8], limb: 0x1a2f5c, eye: 0x14284d, cheek: 0x96aaff,
    rim: col(0x7fc8ff).multiplyScalar(0.55), core: 0xe8f8ff, glow: col(0x6ec0ff), light: 0x80c8ff,
    emissive: col(0x081a38),
  },
];

// Vertex-colour gradient along y, from colour a (at y0) to colour b (at y1), optional mid c.
function grad(geo, y0, y1, a, b, c = null) {
  const pos = geo.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
  const A = col(a), Bc = col(b), C = c != null ? col(c) : null, t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    if (C) { if (k < 0.5) t.copy(A).lerp(Bc, k * 2); else t.copy(Bc).lerp(C, (k - 0.5) * 2); } else t.copy(A).lerp(Bc, k);
    arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export class Character {
  constructor(who) {
    this.who = who;
    const P = LOOK[who];
    this.P = P;
    this.dis = { uDissolve: { value: 0 }, uDissolveCol: { value: col(0xffffff) }, uDark: { value: 0 } };
    const mk = (opts) => patchWorld(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0, ...opts }),
      { rim: P.rim, dissolve: this.dis, key: 'ch' + who });
    this.mats = {
      skin: mk({ vertexColors: true, emissive: P.emissive, emissiveIntensity: 1 }),
      limb: mk({ color: P.limb, emissive: P.emissive, emissiveIntensity: 0.4 }),
      eye: mk({ color: P.eye, roughness: 0.25 }),
      white: mk({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }),
      cheek: mk({ color: P.cheek, transparent: true, opacity: 0.55, emissive: P.cheek, emissiveIntensity: 0.25 }),
      core: mk({ color: P.core, emissive: P.core, emissiveIntensity: 2.4 }),
      ray: mk({ vertexColors: true, emissive: who === SOL ? 0xff7a10 : 0x6ab8ff, emissiveIntensity: who === SOL ? 1.3 : 1.1 }),
    };
    const M = this.mats;
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); root.add(body);       // bob / lean / squash pivot at the feet

    // torso: an egg lathe, wider at the hips
    const prof = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, y = 0.27 + t * 0.47;
      prof.push(new THREE.Vector2(0.215 * Math.sin(Math.PI * (0.08 + t * 0.92)) ** 0.7 + 0.03 * (1 - t), y));
    }
    const torsoG = grad(new THREE.LatheGeometry(prof, 14), 0.27, 0.74, P.body[1], P.body[0]);
    body.add(new THREE.Mesh(torsoG, M.skin));
    // glowing core emblem on the chest and a matching one on the back
    for (const zz of [-1, 1]) {
      const em = this.makeEmblem(who, M);
      em.position.set(0, 0.5, zz * 0.205); if (zz > 0) em.rotation.y = Math.PI;
      body.add(em);
    }

    // head
    const head = this.head = new THREE.Group(); head.position.y = 1.0; body.add(head);
    const headG = grad(new THREE.SphereGeometry(0.36, 22, 16), -0.36, 0.36, P.head[2], P.head[1], P.head[0]);
    head.add(new THREE.Mesh(headG, M.skin));
    // eyes and cheeks, on the front (-z)
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), M.eye);
      e.scale.set(0.85, 1.35, 0.5); e.position.set(sx * 0.125, 0.0, -0.33);
      e.lookAt(sx * 0.125 * 3, 0, -1.5);
      head.add(e); this.eyes.push(e);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), M.white);
      hl.position.set(sx * 0.125 + 0.02, 0.035, -0.358); head.add(hl);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.cheek);
      ch.scale.set(1.2, 0.7, 0.35); ch.position.set(sx * 0.21, -0.09, -0.28); ch.lookAt(sx * 0.6, -0.25, -0.8);
      head.add(ch);
    }

    if (who === SOL) this.buildCorona(head, M); else this.buildCrescent(head, M);

    // arms (pivots at the shoulders) and legs (pivots at the hips)
    const armG = grad(new THREE.CapsuleGeometry(0.055, 0.16, 3, 8).translate(0, -0.11, 0), -0.22, 0, P.body[1], P.body[0]);
    this.arms = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.position.set(sx * 0.2, 0.64, 0); body.add(piv);
      const a = new THREE.Mesh(armG, M.skin); a.rotation.z = sx * 0.25; piv.add(a);
      return piv;
    });
    const legG = new THREE.CapsuleGeometry(0.07, 0.12, 3, 8).translate(0, -0.13, 0);
    const footG = new THREE.SphereGeometry(0.085, 10, 6).scale(1, 0.6, 1.35).translate(0, -0.26, -0.03);
    this.legs = [-1, 1].map((sx) => {
      const piv = new THREE.Group(); piv.position.set(sx * 0.105, 0.31, 0); root.add(piv);
      piv.add(new THREE.Mesh(legG, M.limb));
      piv.add(new THREE.Mesh(footG, M.limb));
      return piv;
    });

    root.traverse((o) => { if (o.isMesh) o.castShadow = false; });

    // animation state
    this.yaw = 0; this.runPh = 0; this.squash = 0; this.squashV = 0; this.lean = 0; this.roll = 0; this.air = 0;
    this.blinkT = 2 + who;
  }

  makeEmblem(who, M) {
    const g = new THREE.Group();
    if (who === SOL) {   // one merged geometry: a disc and eight rays
      const parts = [new THREE.CircleGeometry(0.06, 14)];
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        parts.push(new THREE.PlaneGeometry(0.022, 0.05).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0));
      }
      g.add(new THREE.Mesh(THREE.mergeGeometries(parts), M.core));
    } else {
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.085, Math.PI * 0.3, Math.PI * 1.7, false);
      s.absarc(0.04, 0.005, 0.07, Math.PI * 1.55, Math.PI * 0.45, true);
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(s, 10), M.core));
    }
    g.rotation.y = Math.PI;   // face -z (front)
    return g;
  }

  // Sol: a ring of flickering sun rays around the head (reads as a sun from behind) and a flame tuft.
  buildCorona(head, M) {
    this.rays = [];
    const rayG = grad(new THREE.ConeGeometry(0.075, 1, 4).translate(0, 0.5, 0), 0, 1, 0xff7a1a, 0xffe27a);
    const n = 13;
    // all rays in one instanced mesh; each frame sets every ray's length
    this.rayIM = new THREE.InstancedMesh(rayG, M.ray, n); this.rayIM.frustumCulled = false; head.add(this.rayIM);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * 0.62 + (k / (n - 1)) * Math.PI * 1.24;   // fan over the top, from left side to right side
      // lean back a little (x 0.22) so the ring frames the head from behind
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -a));
      this.rays.push({ q, p: new THREE.Vector3(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0.06), a, base: k % 2 ? 0.17 : 0.24, ph: k * 1.9 });
    }
    this._rm = new THREE.Matrix4(); this._rs = new THREE.Vector3();
    // flame tuft
    const tuftG = grad(new THREE.ConeGeometry(0.11, 0.34, 7).translate(0, 0.17, 0), 0, 0.34, 0xff8a2a, 0xfff2b0);
    this.tuft = new THREE.Mesh(tuftG, M.ray); this.tuft.position.set(0, 0.31, -0.04); this.tuft.rotation.x = 0.35;
    head.add(this.tuft);
  }

  // Luna: a deep-blue hood open at the face, its soft point drooping back to a little star, a
  // glowing crescent on the back of the hood (what the camera behind her sees) and a short cape.
  buildCrescent(head, M) {
    const P = this.P;
    const hoodMat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
      emissive: 0x0a1c48, emissiveIntensity: 1 }), { rim: col(0x6fb8ff).multiplyScalar(0.6), dissolve: this.dis, key: 'hood' });
    this.mats.hood = hoodMat;
    const open = 1.7;   // opening at the face (-z), radians
    const hoodG = new THREE.SphereGeometry(0.405, 24, 14, Math.PI * 1.5 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.68);
    grad(hoodG, -0.2, 0.4, 0x1b2f6e, 0x3f6fd0);
    const hood = new THREE.Mesh(hoodG, hoodMat); hood.position.set(0, 0.02, 0.02); head.add(hood);
    // drooping point: a bent cone of three segments
    const tip = this.tip = new THREE.Group(); tip.position.set(0, 0.3, 0.16); tip.rotation.x = 1.0; head.add(tip);
    let parent = tip, r = 0.17;
    this.tipSegs = [];
    for (let k = 0; k < 3; k++) {
      const len = 0.17;
      const g = grad(new THREE.CylinderGeometry(r * 0.62, r, len, 10, 1).translate(0, len / 2, 0), 0, len, k ? 0x3f6fd0 : 0x2a4fa8, 0x5f8fe8);
      const seg = new THREE.Mesh(g, hoodMat); parent.add(seg);
      const joint = new THREE.Group(); joint.position.y = len; joint.rotation.x = 0.35; seg.add(joint);
      this.tipSegs.push(joint);
      parent = joint; r *= 0.62;
    }
    const star = this.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), M.core);
    star.position.y = 0.05; parent.add(star);
    // crescent on the back of the hood, facing the camera behind her
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.17, Math.PI * 0.3, Math.PI * 1.7, false);
    s.absarc(0.075, 0.0, 0.135, Math.PI * 1.55, Math.PI * 0.45, true);
    const cg = new THREE.ShapeGeometry(s, 16);
    const cres = this.cres = new THREE.Mesh(cg, M.core);
    cres.position.set(0, 0.06, 0.43); cres.rotation.z = -0.5; head.add(cres);
    // cape from the shoulders, hanging down the back
    const capeG = new THREE.PlaneGeometry(0.46, 0.52, 4, 6).translate(0, -0.26, 0);
    const pos = capeG.attributes.position;
    for (let k = 0; k < pos.count; k++) { const x = pos.getX(k), y = pos.getY(k); pos.setZ(k, 0.09 * Math.cos(x / 0.23 * 1.3) * (1 + y)); pos.setX(k, x * (1 - y * 0.55)); }
    capeG.computeVertexNormals();
    grad(capeG, -0.52, 0, 0x2a4fa8, 0x14245a);
    const cape = this.cape = new THREE.Mesh(capeG, hoodMat);
    cape.position.set(0, 0.74, 0.17);
    this.body.add(cape);
    void P;
  }

  // pose: { x,y,z (sim, feet), vx, vy, vz (sim units/tick), gr, alive, deadT (s since death or -1), why, win (bool),
  //         over (bool), landK (0..1 squash impulse this frame), speed01 }
  update(pose, time, dt) {
    const P = this.P, root = this.root, body = this.body;
    root.position.set(pose.x, pose.y, -pose.z);
    const sp = Math.hypot(pose.vx, pose.vz), sp01 = Math.min(1, sp / 0.135);
    // facing: toward travel, smoothly; victory faces the camera
    let target = this.yaw;
    if (pose.win) target = Math.PI;
    else if (sp > 0.03 && pose.alive) target = Math.atan2(-pose.vx, pose.vz);
    let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
    root.rotation.y = this.yaw;

    // landing squash: a damped spring
    if (pose.landK > 0) this.squashV -= pose.landK * 5.5;
    this.squashV += (-this.squash * 170 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const air = !pose.gr;
    this.air += ((air ? 1 : 0) - this.air) * Math.min(1, dt * 14);

    // run cycle advances with distance covered
    if (pose.gr && pose.alive) this.runPh += sp * 60 * dt * 2.6;
    const runK = pose.gr ? sp01 : 0;
    const ph = this.runPh;
    const swing = Math.sin(ph) * 0.95 * runK;
    const bob = Math.abs(Math.cos(ph)) * 0.06 * runK;
    const breathe = Math.sin(time * 2.4 + this.who) * 0.015 * (1 - runK);

    // lean forward with speed, roll into strafes (in local space: lateral speed relative to facing)
    const fwd = sp01 * 0.22;
    this.lean += (fwd - this.lean) * Math.min(1, dt * 8);
    const latV = pose.vx * Math.cos(this.yaw) + pose.vz * Math.sin(this.yaw) * 0;   // world lateral for roll
    this.roll += (-pose.vx / 0.135 * 0.12 * (Math.abs(Math.cos(this.yaw)) ** 2) - this.roll) * Math.min(1, dt * 8);
    void latV;

    const sq = Math.max(-0.35, Math.min(0.3, this.squash));
    const stretch = air ? Math.max(-0.12, Math.min(0.14, pose.vy / 0.34 * 0.12)) : 0;
    const sy = 1 + sq + stretch + breathe, sxz = 1 - sq * 0.6 - stretch * 0.5 - breathe * 0.5;
    body.scale.set(sxz, sy, sxz);
    body.position.y = bob;
    body.rotation.x = -this.lean - (air ? 0.05 : 0);
    body.rotation.z = this.roll;

    // limbs
    const up = pose.vy > 0;
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1;
      const leg = this.legs[s], arm = this.arms[s];
      const legRun = swing * sg;
      const legAir = up ? (s ? 0.9 : -0.3) : (s ? 0.35 : -0.25) + Math.sin(time * 18 + s * 3) * 0.12;
      leg.rotation.x = legRun * (1 - this.air) + legAir * this.air;
      leg.position.y = 0.31 + bob * 0.6;
      const armRun = -swing * sg * 0.85;
      const armAir = up ? -2.4 : -1.7 + Math.sin(time * 16 + s * 2) * 0.35;   // arms up when jumping, flail falling
      arm.rotation.x = armRun * (1 - this.air) + armAir * this.air * 0.8;
      arm.rotation.z = sg * (0.15 + this.air * 0.55 + (1 - runK) * 0.05 * Math.sin(time * 2 + s));
    }
    this.head.rotation.x = this.lean * 0.4 - (air && !up ? 0.12 : 0);
    this.head.rotation.z = -this.roll * 0.5 + Math.sin(time * 1.7 + this.who) * 0.03 * (1 - runK);

    // motif animation
    if (this.rays) {
      this.rays.forEach((r, k) => {
        const L = r.base * (1 + 0.28 * Math.sin(time * 9 + r.ph) + 0.12 * Math.sin(time * 23 + r.ph * 2)) * (1 + sp01 * 0.25);
        this.rayIM.setMatrixAt(k, this._rm.compose(r.p, r.q, this._rs.set(1, L, 1)));
      });
      this.rayIM.instanceMatrix.needsUpdate = true;
      this.tuft.scale.set(1, 1 + 0.25 * Math.sin(time * 12), 1);
      this.tuft.rotation.x = 0.35 + this.lean * 1.5 + Math.sin(time * 7) * 0.08;
    } else {
      const tw = 1 + 0.35 * Math.sin(time * 5.2);
      this.star.scale.set(0.6 * tw, 1.2 * tw, 0.6 * tw); this.star.rotation.y = time * 2;
      // the hood point swings with motion; the cape lifts with speed and in the air
      const flow = sp01 * 0.5 + this.air * 0.4;
      this.tipSegs.forEach((j, k) => { j.rotation.x = 0.35 + flow * 0.25 + Math.sin(time * 6 - k * 0.8) * 0.07 * (0.3 + sp01); j.rotation.z = Math.sin(time * 2.1 + k) * 0.05 - this.roll * 0.6; });
      this.cape.rotation.x = 0.12 + flow * 0.9 + Math.sin(time * 9) * 0.05 * sp01 - (pose.vy > 0 && !pose.gr ? 0 : this.air * 0.2);
    }
    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2.5 + ((Math.sin(time * 13.7 + this.who) + 1) * 1.5);
    for (const e of this.eyes) e.scale.y = 1.35 * blink;

    // victory: hop, arms up
    if (pose.win) {
      const hop = Math.abs(Math.sin(time * 5)) * 0.35;
      body.position.y = hop;
      for (let s = 0; s < 2; s++) { this.arms[s].rotation.x = -2.6; this.arms[s].rotation.z = (s ? -1 : 1) * (0.5 + Math.sin(time * 10) * 0.2); }
      for (const l of this.legs) { l.rotation.x = 0; l.position.y = 0.31 + hop; }
    }

    // death dissolves by cause
    const dT = pose.deadT;
    const D = this.dis;
    root.visible = true;
    if (dT >= 0) {
      const why = pose.why;
      let k;
      if (why === 'spike' || why === 'sweep' || why === 'gate') {
        k = Math.min(1, dT / 0.45);
        D.uDissolveCol.value.setHex(0xff8ae0).multiplyScalar(3);
        body.scale.multiplyScalar(1 + k * 0.25);
        D.uDark.value = 0;
      } else if (why === 'orb' || why === 'shard') {   // flattened, then shatters
        k = Math.min(1, dT / 0.6);
        D.uDissolveCol.value.copy(P.glow).multiplyScalar(3);
        const f = Math.min(1, dT / 0.08);
        body.scale.set(1 + f * 0.5, 1 - f * 0.7, 1 + f * 0.5);
        D.uDark.value = 0;
      } else if (why === 'blade') {   // knocked sideways, spinning
        k = Math.min(1, dT / 0.55);
        D.uDissolveCol.value.copy(P.glow).multiplyScalar(3);
        body.rotation.z += dT * 9; root.position.y += Math.min(dT, 0.3) * 1.5;
        D.uDark.value = 0;
      } else if (why === 'pool') {
        k = Math.min(1, dT / 0.9);
        D.uDissolveCol.value.copy(pose.poolCol || P.glow).multiplyScalar(3);
        root.position.y -= k * 0.7;
        D.uDark.value = 0;
      } else if (why === 'zone') {
        k = Math.min(1, dT / 1.3);
        D.uDark.value = Math.min(1, dT / 0.5);
        D.uDissolveCol.value.setHex(0x5dff9a).multiplyScalar(2.5);
        root.position.z += k * 1.2;
        body.rotation.x += k * 0.5;
      } else {   // fall
        k = Math.min(1, dT / 1.0);
        D.uDissolveCol.value.copy(P.glow).multiplyScalar(2);
        D.uDark.value = 0;
      }
      D.uDissolve.value = k * 1.05;
      if (k >= 1) root.visible = false;
      for (let s = 0; s < 2; s++) this.arms[s].rotation.x = -2.2;
    } else { D.uDissolve.value = 0; D.uDark.value = 0; }
  }
}
