// Sol & Luna — Runner 3D renderer (three.js r170, vendored). Third-person view of shared/runner3d.js.
//
//   const r = new Runner3DRenderer(canvas);
//   r.reset(L); r.resize(cssW, cssH, dpr);
//   r.draw(L, S, view, time, { split, me, paused });   // view = { zone, p: [{x,y,z},{x,y,z}] } interpolated
//   r.dispose();
//
// Everything visual is derived from L, S and changes between frames (never mutated), so it stays
// correct under network rollback. Quality: r.setQuality('auto' | 'high' | 'low') (default auto).
import * as THREE from './three.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { Pass } from '../../vendor/three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';
import { U, PAL, col, GlowField, textures, LIQ3 } from './kit.js';
import { Character } from './characters.js';
import { makeSky, makeAbyss, makeMotes, WorldDeco } from './world.js';
import { DuskZone, makeVignette, BEND } from './zone.js';
import { FX } from './fx.js';
import { viewFor, disposeView, VIEWS } from './views.js';
import * as R3 from '/shared/runner3d.js';

export { VIEWS };

const MAX_SPEED = R3.P3?.maxSpeed ?? 0.135;
const ZONE_CLOSE = 12;   // the vignette starts growing when the wall is this close to a player

// Renders the scene into the composer's buffer once per viewport (split screen shares one bloom pass).
class ViewportsPass extends Pass {
  constructor(owner) { super(); this.owner = owner; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const o = this.owner, pr = renderer.getPixelRatio();
    renderer.setRenderTarget(readBuffer);
    renderer.setClearColor(0x000000, 1);
    readBuffer.scissorTest = true;
    for (const vp of o.viewports) {
      readBuffer.viewport.set(vp.x * pr, vp.y * pr, vp.w * pr, vp.h * pr);
      readBuffer.scissor.set(vp.x * pr, vp.y * pr, vp.w * pr, vp.h * pr);
      renderer.setRenderTarget(readBuffer);
      renderer.clear();
      o.renderView(vp, vp.h * pr);
    }
    readBuffer.scissorTest = false;
    readBuffer.viewport.set(0, 0, readBuffer.width, readBuffer.height);
    readBuffer.scissor.set(0, 0, readBuffer.width, readBuffer.height);
  }
}

class CamRig {
  constructor(i) {
    this.i = i;
    this.cam = new THREE.PerspectiveCamera(58, 1, 0.1, 700);
    this.cam.layers.enable(1 + i);
    this.pos = null; this.look = new THREE.Vector3(); this.fov = 58; this.shake = 0; this.y = 0; this.x = 0;
  }
  // p: interpolated sim position of the followed player; vz sim forward speed; split: tall viewport
  update(p, vz, alive, dt, split, aspect, intro, time) {
    const back = split ? 6.6 : 6.0, up = split ? 3.7 : 3.2, ahead = split ? 6.5 : 5.5;
    const kAhead = Math.max(0, vz / MAX_SPEED);
    if (alive || this.pos == null) {
      const ty = p.y;
      this.y = this.pos == null ? ty : this.y + (ty - this.y) * Math.min(1, dt * 3.2);
      this.x = this.pos == null ? p.x : this.x + (p.x * 0.72 - this.x) * Math.min(1, dt * 4.5);
    }
    const target = new THREE.Vector3(this.x, this.y + up, -(p.z - back));
    const look = new THREE.Vector3(this.x + (p.x - this.x) * 0.6, this.y + 0.7, -(p.z + ahead + kAhead * 1.5));
    if (intro > 0) {   // countdown: an establishing shot from higher up and to the side, easing in
      const e = intro * intro * (3 - 2 * intro);
      target.x += Math.sin(time * 0.3) * 0 + (this.i ? 1 : -1) * 4.5 * e; target.y += 4 * e; target.z += 5 * e;
    }
    if (!alive) { target.y += 1.2; look.set(p.x, Math.max(p.y, this.y - 4), -p.z); }
    if (this.pos == null) { this.pos = target.clone(); this.look.copy(look); }
    const kp = Math.min(1, dt * (alive ? 9 : 2)), kl = Math.min(1, dt * (alive ? 10 : 3));
    this.pos.x += (target.x - this.pos.x) * kp;
    this.pos.y += (target.y - this.pos.y) * kp;
    this.pos.z += (target.z - this.pos.z) * Math.min(1, dt * 14);
    this.look.lerp(look, kl);
    const fovT = (split ? 64 : 56) + kAhead * 6;
    this.fov += (fovT - this.fov) * Math.min(1, dt * 3);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.35;
    this.cam.position.set(this.pos.x + Math.sin(time * 61) * s, this.pos.y + Math.sin(time * 53 + 1) * s, this.pos.z);
    this.cam.lookAt(this.look.x, this.look.y + Math.sin(time * 47) * s * 0.5, this.look.z);
    if (this.cam.fov !== this.fov || this.cam.aspect !== aspect) { this.cam.fov = this.fov; this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
  }
}

export class Runner3DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;
    this.quality = 'auto'; this.level = 'high';
    this.cssW = canvas.clientWidth || 960; this.cssH = canvas.clientHeight || 540; this.dpr = 1;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(PAL.fog, 38, 150);
    textures();

    // lights: soft key from behind the camera, warm (sun) and cool (moon) rims from ahead
    scene.add(new THREE.HemisphereLight(0x8f7cc8, 0x1a1028, 1.1));
    const key = new THREE.DirectionalLight(0xe8dcff, 1.5); key.position.set(-3, 10, 8); scene.add(key); scene.add(key.target);
    const warm = new THREE.DirectionalLight(0xffa860, 1.6); warm.position.set(-8, 3, -6); scene.add(warm);
    const cool = new THREE.DirectionalLight(0x70b8ff, 1.5); cool.position.set(8, 4, -6); scene.add(cool);
    this.dirLights = [key, warm, cool];

    this.sky = makeSky(); scene.add(this.sky);
    this.abyss = makeAbyss(); scene.add(this.abyss);
    this.motes = makeMotes(); scene.add(this.motes);
    this.deco = new WorldDeco(scene);
    this.zoneFx = new DuskZone(); scene.add(this.zoneFx.group);
    this.glow = new GlowField(700); scene.add(this.glow.mesh);
    this.fx = new FX(scene);
    this.objRoot = new THREE.Group(); scene.add(this.objRoot);

    // characters, their lights and blob shadows
    this.chars = [0, 1].map((i) => { const c = new Character(i); scene.add(c.root); return c; });
    this.plights = [0xffa850, 0x80c8ff].map((c) => { const l = new THREE.PointLight(c, 6, 7, 1.6); scene.add(l); return l; });
    const shMat = new THREE.MeshBasicMaterial({ map: textures().shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.shadows = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shMat); m.renderOrder = 2; scene.add(m); return m; });

    this.rigs = [new CamRig(0), new CamRig(1)];
    this.vign = this.rigs.map((rg, i) => { const v = makeVignette(1 + i); scene.add(v); return v; });

    this.views = new Map();
    this.viewports = [];
    this.lastTime = null;
    this.prev = null;
    this.ft = []; this.ftAcc = 0;
    this.buildComposer();
    this.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
  }

  setQuality(q) {
    this.quality = q;
    const lvl = q === 'auto' ? this.level : q;
    if (lvl !== this.appliedLevel) { this.level = lvl; this.resize(this.cssW, this.cssH, this.dpr); }
  }

  buildComposer() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new ViewportsPass(this));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  reset(L) {
    this.L = L;
    for (const [, v] of this.views) { this.objRoot.remove(v.obj); disposeView(v.obj); }
    this.views.clear();
    this.lo = 0;
    this.fx.clear();
    this.prev = null;
    for (const rg of this.rigs) rg.pos = null;
    this.deathInfo = [null, null];
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW | 0); this.cssH = Math.max(1, cssH | 0); this.dpr = dpr || 1;
    const high = this.level === 'high';
    const pr = Math.min(this.dpr, high ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.cssW, this.cssH);
    this.bloom.resolution.set(this.cssW * pr / 2, this.cssH * pr / 2);
    this.appliedLevel = this.level;
  }

  // the highest surface top under (x, z) at or below feet height + margin; null over a gap
  groundAt(x, z, yMax, who = -1, S = this.S, tick = S ? S.tick : 0) {
    const L = this.L; let best = null;
    const inside = (x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    for (const [i] of this.views) {
      const o = L.objs[i];
      if (o.x1 < x || o.x0 > x || o.z1 < z || o.z0 > z) continue;
      let y = null;
      switch (o.k) {
        case 'floor': case 'pool': y = o.y; break;
        case 'ramp': y = o.y + (o.y1 - o.y) * Math.max(0, Math.min(1, (z - o.z0) / (o.z1 - o.z0))); break;
        case 'eclipse': if (who < 0 || (o.el ? 1 : 0) === who) y = o.y; break;
        case 'tilt': { const st = S && S.o[i]; y = o.y + (st ? st.a * (x - o.cx) + st.b * (z - o.cz) : 0); break; }
        case 'crumble': { const st = S && S.o[i]; if (!st || st.st <= 1) y = o.y; break; }
        case 'carousel': {
          let pose = null; try { pose = R3.objPose(L, S, i, tick); } catch {}
          if (pose) for (const s of pose.stones) if (inside(s.x - o.s, s.x + o.s, s.z - o.s, s.z + o.s)) y = o.y;
          break;
        }
        default: break;
      }
      if (y == null || y > yMax) continue;
      if (best == null || y > best.y) best = { y, o };
    }
    return best;
  }

  // course height near sim z (for side decoration and the zone)
  courseY(z) {
    const L = this.L; let best = null, bd = 1e9;
    for (let i = Math.max(0, this.lo - 4); i < L.objs.length; i++) {
      const o = L.objs[i];
      if (o.z0 > z + 40) break;
      if (o.k !== 'floor') continue;
      const d = z < o.z0 ? o.z0 - z : z > o.z1 ? z - o.z1 : 0;
      if (d < bd) { bd = d; best = o.y; }
    }
    if (best != null) this.lastCourseY = best;
    return this.lastCourseY ?? 0;
  }

  streamViews(S, zMin, zMax, ctx) {
    const L = this.L, objs = L.objs;
    while (this.lo < objs.length && objs[this.lo].z1 < zMin && objs[this.lo].z0 < zMin - 80) this.lo++;
    const seen = new Set();
    const poseFn = R3.objPose || R3.poseOf || R3.pose3 || null;
    for (let i = this.lo; i < objs.length; i++) {
      const o = objs[i];
      if (o.z0 > zMax) break;
      if (o.z1 < zMin) continue;
      seen.add(i);
      let v = this.views.get(i);
      if (!v) {
        const def = viewFor(o.k);
        const obj = def.make(o, L, i);
        this.objRoot.add(obj);
        v = { obj, def, ground: null };
        this.views.set(i, v);
      }
      ctx.idx = i;
      let pose = null;
      if (poseFn) { try { pose = poseFn(L, S, i, ctx.tick); } catch { pose = null; } }
      v.def.update(v.obj, o, S.o ? S.o[i] : undefined, pose, ctx, v);
    }
    for (const [i, v] of this.views) if (!seen.has(i)) { this.objRoot.remove(v.obj); disposeView(v.obj); this.views.delete(i); }
  }

  observe(L, S, view) {
    const prev = this.prev;
    const cur = { tick: S.tick, alive: S.p.map(p => p.alive), gr: S.p.map(p => p.gr), vy: S.p.map(p => p.vy), jn: S.p.map(p => p.jumpN) };
    const land = [0, 0];
    if (prev && prev.tick < S.tick) {
      for (let i = 0; i < 2; i++) {
        const p = S.p[i], q = view.p[i];
        if (p.alive && p.jumpN > prev.jn[i]) this.fx.dust(q.x, q.y, -q.z, 6, i, 0.7);
        if (p.alive && p.gr && !prev.gr[i]) {
          const k = Math.min(1, -prev.vy[i] / 0.34);
          land[i] = 0.2 + k * 0.8;
          this.fx.dust(q.x, q.y, -q.z, Math.round(4 + k * 10), k > 0.6 ? i : -1, 0.6 + k * 0.8);
          if (k > 0.85) this.rigs[i].shake = Math.max(this.rigs[i].shake, 0.35);
        }
        if (!p.alive && prev.alive[i]) this.onDeath(L, S, i, q);
      }
    } else if (prev && prev.tick > S.tick) {
      // rollback: forget death info for players alive again
      for (let i = 0; i < 2; i++) if (S.p[i].alive) this.deathInfo[i] = null;
    }
    this.prev = cur;
    return land;
  }

  onDeath(L, S, i, q) {
    const why = S.why[i], x = q.x, y = q.y, z = -q.z, fx = this.fx;
    const info = { why };
    if (why === 'spike') {
      fx.burst(x, y + 0.6, z, fx.cols.thorn, 50, 4.5, 0.9, 0.11, 6);
      fx.burst(x, y + 0.6, z, i ? fx.cols.moon : fx.cols.sun, 24, 3, 0.8, 0.08, 4);
    } else if (why === 'pool') {
      const g = this.groundAt(q.x, q.z, q.y + 0.6, i, S);
      const el = g && g.o.k === 'pool' ? (g.o.el ?? 0) : (i ? 0 : 1);
      info.poolCol = col((LIQ3[el] || LIQ3[0]).glow);
      fx.splash(x, y, z, col(LIQ3[el].hi).multiplyScalar(2), 40);
      fx.smoke(x, y + 0.2, z, 10);
    } else if (why === 'zone') {
      fx.smoke(x, y, z, 24);
      for (let k = 0; k < 30; k++) fx.ember(x + (Math.random() - 0.5), y + Math.random() * 1.4, z + (Math.random() - 0.5));
    } else {
      fx.burst(x, y + 0.6, z, i ? fx.cols.moon : fx.cols.sun, 30, 2.5, 1.2, 0.1, -1);
    }
    this.deathInfo[i] = info;
    for (const rg of this.rigs) rg.shake = Math.max(rg.shake, rg.i === i ? 1 : 0.45);
  }

  draw(L, S, view, time, opts = {}) {
    if (L !== this.L) this.reset(L);
    const split = !!opts.split, me = opts.me ? 1 : 0, paused = !!opts.paused;
    let dt = this.lastTime == null ? 1 / 60 : Math.min(0.1, Math.max(0, time - this.lastTime));
    const realDt = dt;
    this.lastTime = time;
    if (paused) dt = 0;
    this.autoQuality(realDt);

    U.uTime.value = time;
    U.uZone.value = -view.zone;
    const land = this.observe(L, S, view);

    const pz = Math.max(view.p[0].z, view.p[1].z);
    const zMin = view.zone - 30, zMax = pz + 160;
    this.glow.begin();
    // fractional tick of this frame: the view's zone lags S.zone by (1 - alpha) ticks of zone travel
    const alpha = S.v > 1e-6 ? Math.max(0, Math.min(1, 1 - (S.zone - view.zone) / S.v)) : 1;
    const ctx = { time, dt, S, L, fx: this.fx, glow: this.glow, idx: 0, alpha, tick: S.tick - 1 + alpha };
    this.S = S; this.tick = ctx.tick;
    this.streamViews(S, zMin, zMax, ctx);

    // characters
    const over = S.phase === (R3.R3_OVER ?? 2);
    for (let i = 0; i < 2; i++) {
      const p = S.p[i], q = view.p[i], c = this.chars[i];
      const deadT = S.dead[i] >= 0 && !p.alive ? (S.tick - S.dead[i]) / 60 : -1;
      const info = this.deathInfo[i];
      c.update({
        x: q.x, y: q.y, z: q.z, vx: p.vx, vy: p.vy, vz: p.vz, gr: p.gr, alive: p.alive, deadT, why: S.why[i],
        win: over && S.win === i && p.alive, landK: land[i], poolCol: info && info.poolCol,
      }, time, dt);
      const vis = c.root.visible && deadT < 0.6;
      // glow and light
      const gk = deadT >= 0 ? Math.max(0, 1 - deadT * 1.5) : 1;
      const gc = i ? col(0x6ec0ff) : col(0xffa040);
      if (gk > 0) {
        this.glow.add(q.x, q.y + 0.75, -q.z, 2.6, gc, (0.33 + 0.05 * Math.sin(time * 3 + i)) * gk);
        this.glow.add(q.x, q.y + 1.05, -q.z, 1.1, i ? col(0xd8f4ff) : col(0xfff0a0), 0.3 * gk);
      }
      this.plights[i].position.set(q.x, q.y + 0.9, -q.z);
      this.plights[i].intensity = 6 * gk;
      // blob shadow on the surface below; none over a gap, which shows the gap
      const g = p.alive || deadT < 0.4 ? this.groundAt(q.x, q.z, q.y + 0.3, i, S, this.tick) : null;
      const sh = this.shadows[i];
      if (g && vis) {
        const hgt = Math.max(0, q.y - g.y), k = Math.max(0, 1 - hgt / 7);
        sh.visible = k > 0.02;
        sh.position.set(q.x, g.y + 0.02, -q.z);
        const s = 0.95 * (0.55 + 0.45 * k); sh.scale.set(s, 1, s);
        sh.material.opacity = 0.75 * k;
      } else sh.visible = false;
      // trail motes
      const sp = Math.hypot(p.vx, p.vz);
      if (p.alive && dt > 0 && Math.random() < dt * (14 + sp / MAX_SPEED * 30)) this.fx.trail(i, q.x, q.y, -q.z, p.vx * 60, -p.vz * 60);
    }

    // lanterns and keystones glow
    for (const l of this.deco.lanterns) this.glow.add(l.x, l.y, l.z, 2.2, l.c, 0.55 + 0.08 * Math.sin(time * 4 + l.z));

    // dusk zone
    const zy = this.courseY(view.zone + 2);
    this.zoneFx.update(view.zone, zy);
    if (dt > 0) {
      const ne = Math.random() < (dt * 60) % 1 ? Math.ceil(dt * 60) : Math.floor(dt * 60);
      for (let k = 0; k < ne * 2; k++) {
        const ex = (Math.random() - 0.5) * 16;
        this.fx.ember(ex, zy + Math.random() * 5, -(view.zone + BEND * ex * ex + Math.random() * 0.8));
      }
    }

    // world deco
    this.deco.update(view.zone - 30, pz + 170, (z) => this.courseY(z), time);
    this.glow.end();
    if (dt > 0) this.fx.update(dt);

    // cameras
    const intro = S.phase === (R3.R3_COUNT ?? 0) ? Math.max(0, 1 - S.phaseT / ((R3.COUNT_TICKS ?? 180) * 0.85)) : 0;
    const W = this.cssW, H = this.cssH;
    this.viewports = split
      ? [{ x: 0, y: 0, w: Math.floor(W / 2) - 1, h: H, i: 0 }, { x: Math.floor(W / 2) + 1, y: 0, w: W - Math.floor(W / 2) - 1, h: H, i: 1 }]
      : [{ x: 0, y: 0, w: W, h: H, i: me }];
    for (const vp of this.viewports) {
      const i = vp.i, p = S.p[i], q = view.p[i];
      this.rigs[i].update(q, p.vz, p.alive, realDt, split, vp.w / vp.h, intro, time);
      const k = p.alive ? Math.max(0, Math.min(1, 1 - (q.z - view.zone - 1.5) / ZONE_CLOSE)) : 0;
      const u = this.vign[i].material.uniforms;
      u.uK.value += (k - u.uK.value) * Math.min(1, realDt * 6);
      u.uAspect.value = vp.w / vp.h;
      u.uDeath.value = p.alive ? 0 : Math.min(1, ((S.tick - S.dead[i]) / 60) * 2);
    }
    this.render(split);
  }

  // called per viewport (by the pass, or directly without bloom)
  renderView(vp, pxH) {
    const rg = this.rigs[vp.i], cam = rg.cam;
    this.sky.position.copy(cam.position);
    this.abyss.position.set(cam.position.x, this.lastCourseY - 34, cam.position.z - 150);
    this.motes.material.uniforms.uCenter.value.set(cam.position.x, cam.position.y - 2, cam.position.z - 30);
    U.uPtScale.value = pxH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    this.renderer.render(this.scene, cam);
  }

  render(split) {
    const r = this.renderer;
    if (this.level === 'high') {
      this.composer.render();
    } else {
      r.setRenderTarget(null);
      r.setScissorTest(true);
      r.setClearColor(0x000000, 1);
      for (const vp of this.viewports) {
        r.setViewport(vp.x, vp.y, vp.w, vp.h); r.setScissor(vp.x, vp.y, vp.w, vp.h);
        r.clear();
        this.renderView(vp, vp.h * r.getPixelRatio());
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, this.cssW, this.cssH);
    }
    if (split) {   // thin divider between the halves
      r.setRenderTarget(null);
      r.setScissorTest(true);
      const x = Math.floor(this.cssW / 2) - 1;
      r.setScissor(x, 0, 2, this.cssH); r.setClearColor(0x6a5a96, 1); r.clear(true, false, false);
      r.setScissorTest(false);
    }
  }

  autoQuality(dt) {
    if (this.quality !== 'auto' || dt <= 0) return;
    this.ft.push(dt);
    this.ftAcc += dt;
    if (this.ftAcc < 3) return;
    const sorted = this.ft.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1];
    this.ft = []; this.ftAcc = 0;
    if (this.level === 'high' && med > 1 / 42) { this.level = 'low'; this.resize(this.cssW, this.cssH, this.dpr); }
  }

  // per-frame renderer counters for the perf report (draw calls and triangles of the last frame)
  stats() { const i = this.renderer.info.render; return { calls: i.calls, triangles: i.triangles, level: this.level, views: this.views.size }; }

  dispose() {
    for (const [, v] of this.views) disposeView(v.obj);
    this.views.clear();
    this.deco.dispose();
    this.fx.dispose();
    this.glow.dispose();
    this.composer.dispose?.();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
    this.renderer.dispose();
  }
}
