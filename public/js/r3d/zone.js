// The dusk zone: a towering wall of swirling shade behind the players. Its sides curve forward, so
// from a camera behind the player the shade creeps in at the screen edges as it closes in.
// Also: tendrils reaching along the floor, a sickly glow on the floor in front of it, and the
// per-camera screen vignette that grows as the wall nears that camera's player.
import * as THREE from './three.js';
import { U } from './kit.js';

const NOISE = `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export const BEND = 0.02;   // sim z offset of the wall at lateral x: zone + BEND * x^2

export class DuskZone {
  constructor() {
    this.group = new THREE.Group();
    // main curtain: a grid in (x, y), bent forward at the sides in the vertex shader
    const geo = new THREE.PlaneGeometry(80, 60, 48, 24);
    const mkCurtain = (layer) => new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uLayer: { value: layer }, uFloorY: { value: 0 } },
      vertexShader: `uniform float uTime; uniform float uLayer; uniform float uFloorY; varying vec2 vP; varying float vCam; varying float vSide;
        void main() {
          vec3 p = position;
          vec4 w = modelMatrix * vec4(p, 1.0);
          float x = w.x;
          w.z -= ${BEND.toFixed(3)} * x * x + uLayer * 1.6 + sin(w.y * 0.35 + uTime * 0.9 + x * 0.2) * 0.6;
          vP = vec2(w.x, w.y - uFloorY); vSide = abs(x);
          vec4 mv = viewMatrix * w; vCam = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uTime; uniform float uLayer; varying vec2 vP; varying float vCam; varying float vSide;
        ${NOISE}
        void main() {
          vec2 p = vP * 0.18;
          float t = uTime * 0.25;
          vec2 q = vec2(fbm(p + vec2(t, -t * 0.6)), fbm(p * 1.3 + vec2(-t * 0.7, t * 0.4) + 5.2));
          float n = fbm(p * 1.6 + q * 2.4 + vec2(0.0, -uTime * 0.18));
          vec3 deep = vec3(0.025, 0.008, 0.05), vio = vec3(0.24, 0.07, 0.36), em = vec3(0.35, 1.6, 0.7);
          vec3 c = mix(deep, vio, smoothstep(0.35, 0.75, n));
          float veins = smoothstep(0.035, 0.0, abs(n - 0.58)) * smoothstep(0.3, 0.7, q.x);
          c += em * veins * (0.6 + 0.4 * sin(uTime * 3.0 + p.x * 4.0));
          float a = mix(0.92, 0.55, uLayer) * smoothstep(34.0, 18.0, vP.y) * smoothstep(-40.0, -8.0, vP.y);
          a *= smoothstep(0.6, 3.5, vCam);           // thin out right in front of a camera passing through
          a *= 0.75 + 0.25 * smoothstep(0.3, 0.7, n);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.curtains = [0, 1].map((l) => {
      const m = new THREE.Mesh(geo, mkCurtain(l));
      m.frustumCulled = false; m.renderOrder = 8 - l;
      this.group.add(m); return m;
    });

    // tendrils: ribbons reaching forward along the floor and up the sides
    const tg = new THREE.PlaneGeometry(1, 1, 1, 20); tg.translate(0, 0.5, 0);   // y in 0..1 = along the tendril
    this.tendrils = [];
    const tmat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: `attribute float aSeed; uniform float uTime; varying float vT; varying float vU;
        void main() {
          float t = position.y; vT = t; vU = position.x + 0.5;
          vec3 p = vec3(position.x * (1.0 - t) * 0.9, 0.0, 0.0);
          float reach = 3.5 + 2.0 * sin(uTime * 0.7 + aSeed * 6.0);
          p.z = -t * reach;
          p.x += sin(t * 5.0 + uTime * 2.2 + aSeed * 9.0) * 0.45 * t;
          p.y = 0.04 + sin(t * 3.0 + uTime * 1.6 + aSeed) * 0.12 * t;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uTime; varying float vT; varying float vU;
        void main() {
          float a = (1.0 - vT) * smoothstep(0.0, 0.3, vU) * smoothstep(1.0, 0.7, vU);
          vec3 c = mix(vec3(0.05, 0.01, 0.08), vec3(0.2, 0.9, 0.45), smoothstep(0.55, 0.95, vT) * 0.5);
          gl_FragColor = vec4(c, a * 0.85);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let k = 0; k < 9; k++) {
      const g = tg.clone();
      const seed = new Float32Array(g.attributes.position.count).fill(k * 0.37 + 0.1);
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const m = new THREE.Mesh(g, tmat); m.frustumCulled = false; m.renderOrder = 7;
      m.userData.x = -6 + k * 1.5 + Math.sin(k * 7.1) * 0.5; m.userData.w = 0.8 + (k % 3) * 0.35;
      m.scale.x = m.userData.w;
      this.group.add(m); this.tendrils.push(m);
    }

    // floor glow in front of the wall
    const fg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    this.floorGlow = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main() {
          float fy = clamp(1.0 - vUv.y, 0.0, 1.0); float a = fy * fy * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          a *= 0.75 + 0.25 * sin(uTime * 3.0 + vUv.x * 20.0);
          vec3 c = mix(vec3(0.5, 0.15, 0.7), vec3(0.3, 1.4, 0.65), fy * fy * fy);
          gl_FragColor = vec4(c * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.floorGlow.scale.set(16, 1, 7); this.floorGlow.renderOrder = 6;
    this.group.add(this.floorGlow);
  }

  // zone: sim z of the wall; floorY: course height at the wall
  update(zone, floorY) {
    for (const c of this.curtains) { c.position.set(0, floorY + 6, -zone); c.material.uniforms.uFloorY.value = floorY; }
    for (const t of this.tendrils) t.position.set(t.userData.x, floorY, -zone);
    this.floorGlow.position.set(0, floorY + 0.03, -zone);
  }
}

// Screen vignette for one camera: a full-screen quad drawn last, on that camera's own layer.
export function makeVignette(layer) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: U.uTime, uAspect: { value: 1 }, uDeath: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform float uK; uniform float uTime; uniform float uAspect; uniform float uDeath; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 q = vUv - 0.5; q.x *= uAspect;
        float r = length(q * vec2(1.0, 1.25));
        float base = smoothstep(0.45, 0.95, r) * 0.38;                          // gentle always-on vignette
        float n = uK > 0.002 ? fbm(vec2(atan(q.y, q.x) * 3.0, r * 4.0 - uTime * 0.8)) : 0.0;   // no noise while the dusk is far
        float k = uK;
        float reach = mix(0.9, 0.28, k) - n * 0.12 * k;
        float dusk = smoothstep(reach, reach + 0.35, r) * k;
        float rimE = smoothstep(0.05, 0.0, abs(r - reach - 0.06)) * k * (0.5 + 0.5 * sin(uTime * 6.0 + n * 10.0));
        vec3 c = vec3(0.03, 0.005, 0.06);
        float a = clamp(base + dusk * 0.95 + uDeath * 0.35, 0.0, 1.0);
        gl_FragColor = vec4(c + vec3(0.2, 0.9, 0.45) * rimE * 0.5, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  }));
  m.frustumCulled = false; m.renderOrder = 100; m.layers.set(layer);
  return m;
}

// Lead cap: a shimmering twilight veil across a run-up where the lead cap holds a player (the sim
// stops forward walking there while that player is more than LEAD_MAX ahead of the dusk). One per
// player; k (0..1) fades it in as the player nears it, held (0..1) brightens it while they push on it.
export class LeadVeil {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uK: { value: 0 }, uHeld: { value: 0 }, uW: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uK; uniform float uHeld; uniform float uW; varying vec2 vUv;
        void main() {
          float x = vUv.x * uW;
          float streak = 0.55 + 0.45 * sin(x * 9.0 + sin(vUv.y * 6.0 + uTime * 2.0) * 1.5 + uTime * 1.7);
          float a = uK * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * streak * smoothstep(0.0, 0.25, x) * (1.0 - smoothstep(uW - 0.25, uW, x));
          a *= 0.45 + uHeld * (0.35 + 0.25 * sin(uTime * 10.0));
          a += uK * (1.0 - smoothstep(0.0, 0.06, vUv.y)) * (0.6 + uHeld);   // a bright line on the floor
          vec3 c = mix(vec3(0.55, 0.42, 1.0), vec3(0.95, 0.85, 1.0), uHeld * 0.6) * 1.1;
          gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));   // additive blending multiplies by alpha itself
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const g = new THREE.PlaneGeometry(1, 1.9).translate(0.5, 0.95, 0);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
  }
  // x0..x1: the run-up's width, y its top, z the veil's sim z
  set(x0, x1, y, z, k, held) {
    this.mesh.visible = k > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.position.set(x0, y, -z); this.mesh.scale.set(x1 - x0, 1, 1);
    const u = this.mat.uniforms; u.uK.value = k; u.uHeld.value = held; u.uW.value = x1 - x0;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
