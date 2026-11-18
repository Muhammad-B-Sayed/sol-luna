// Runner 3D kit: the coordinate mapping, palette, shared uniforms, generated textures and
// reusable parts (stone slab, chain, crystal, liquid, lantern, glow billboards, rune decals).
import * as THREE from './three.js';

// ---------------------------------------------------------------------------
// Sim space -> three space. Sim: x right, y up, z forward. Three: right-handed, camera looks down -z.
// This is the only place the mapping lives.
export const tx = (x) => x;
export const tz = (z) => -z;
export const toV = (x, y, z, v = new THREE.Vector3()) => v.set(x, y, -z);

// ---------------------------------------------------------------------------
// Palette (from the 2D game: render.js, runner-render.js)
export const PAL = {
  stoneTop: 0x7a6ca6, stoneTop2: 0x6c5f98, stoneSide: 0x463a68, stoneDeep: 0x1a1230, trim: 0xd8ccff,
  sunHi: 0xfff1a8, sun: 0xffb02e, sunDeep: 0xe2531c, moonHi: 0xeaffff, moon: 0x7fd6ff, moonDeep: 0x2f6fd8,
  shadeHi: 0x9dffb9, shade: 0x3a7d55, shadeDeep: 0x1d1530, thorn: 0xb04fa8, thornHi: 0xffc2ec, thornDeep: 0x3b2a5c,
  fog: 0x2e2348, dusk: 0x0d0818, ember: 0x5dff9a, duskViolet: 0x3b1a5c,
};
export const col = (hex) => new THREE.Color(hex);

// Uniforms shared by every patched material: one update per frame reaches all of them.
export const U = {
  uTime: { value: 0 },
  uZone: { value: 1e6 },           // three-space z of the dusk wall (= -S.zone)
  uDuskCol: { value: col(PAL.dusk) },
  uEmberCol: { value: col(PAL.ember).multiplyScalar(1.4) },
  uGlowCol: { value: col(PAL.trim) },
  uPtScale: { value: 400 },        // point-sprite scale: viewport height / (2 tan(fov/2))
  uCreep: { value: 6 },            // how far the dusk's shadow creeps over the floor ahead of the wall (units)
};

// ---------------------------------------------------------------------------
// Material patching: world position varying, the dusk swallowing everything behind the wall,
// an optional per-vertex glow (aGlow) and an optional fresnel rim.
export function patchWorld(mat, { glow = false, rim = null, additive = false, dissolve = null, key = '', creep = true } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (rim) sh.uniforms.uRim = { value: rim };
    if (dissolve) Object.assign(sh.uniforms, dissolve);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${glow ? 'attribute float aGlow; varying float vGlow;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpp = instanceMatrix * wpp;
        #endif
        vWPos = (modelMatrix * wpp).xyz;
        ${glow ? 'vGlow = aGlow;' : ''}`);
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos;
      uniform float uTime; uniform float uZone; uniform vec3 uDuskCol; uniform vec3 uEmberCol; uniform vec3 uGlowCol; uniform float uCreep;
      ${glow ? 'varying float vGlow;' : ''}
      ${rim ? 'uniform vec3 uRim;' : ''}
      ${dissolve ? 'uniform float uDissolve; uniform vec3 uDissolveCol; uniform float uDark;' : ''}
      float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`);
    if (dissolve) {
      fs = fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dn = h31(floor(vWPos * 14.0)) * 0.6 + h31(floor(vWPos * 5.0)) * 0.4;
        if (dn < uDissolve) discard;`);
    }
    if (glow || rim || dissolve) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${glow ? 'totalEmissiveRadiance += uGlowCol * vGlow * (0.8 + 0.2 * sin(uTime * 2.0 + vWPos.z * 0.35));' : ''}
        ${rim ? 'totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);' : ''}
        ${dissolve ? `totalEmissiveRadiance += uDissolveCol * smoothstep(uDissolve + 0.12, uDissolve, dn) * step(0.001, uDissolve);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.01, 0.06), uDark); totalEmissiveRadiance *= 1.0 - uDark * 0.8;` : ''}`);
    }
    // behind the wall everything sinks into the dusk; ahead of it a wavering shadow creeps over
    // the floor (uCreep units), with a faint ember line at its front, so the dusk shows up in the
    // frame before the wall itself does
    fs = fs.replace('#include <tonemapping_fragment>', `
      float dzw = vWPos.z - uZone;
      float behind = smoothstep(-0.5, 5.0, dzw);
      float edgeE = exp(-abs(dzw - 0.3) * 2.2) * (0.6 + 0.4 * sin(uTime * 5.0 + vWPos.x * 2.0));
      float wob = sin(vWPos.x * 1.3 + uTime * 1.1) * 0.7 + sin(vWPos.x * 0.47 - uTime * 0.6) * 1.1 + sin(vWPos.x * 3.1 + uTime * 2.3) * 0.25;
      float front = -uCreep + wob;
      float creep = ${creep ? 'smoothstep(front - 0.4, front + 3.5, dzw)' : '0.0'};
      float frontE = exp(-abs(dzw - front) * 3.0) * step(dzw, 0.0);
      ${additive
        ? 'gl_FragColor.rgb *= (1.0 - behind) * (1.0 - creep * 0.5);'
        : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uDuskCol, max(behind * 0.92, creep * 0.62)) + uEmberCol * (edgeE * 0.35 + frontE * 0.22);'}
      #include <tonemapping_fragment>`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `pw${glow ? 1 : 0}${rim ? 1 : 0}${additive ? 1 : 0}${dissolve ? 1 : 0}${creep ? 1 : 0}${key}`;
  return mat;
}

// ---------------------------------------------------------------------------
// Generated textures

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export { hash };

function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let _tex = null;
export function textures() {
  if (_tex) return _tex;
  _tex = {};
  // Stone blocks: 4 x 4 world units per tile, 2x1 blocks in offset rows. Near-white so vertex colours tint it.
  _tex.stone = canvasTex(512, 512, (g, W) => {
    const u = W / 4;
    g.fillStyle = '#5c5670'; g.fillRect(0, 0, W, W);
    for (let r = 0; r < 4; r++) {
      for (let c = -1; c < 3; c++) {
        const x = (c * 2 + (r % 2)) * u, y = r * u, v = hash(c + 5, r + 9);
        const l = 205 + v * 40;
        g.fillStyle = `rgb(${l},${l - 6},${l + 8})`;
        g.fillRect(x + 3, y + 3, 2 * u - 6, u - 6);
        if (x < 0) g.fillRect(x + 3 + W, y + 3, 2 * u - 6, u - 6);
        // worn speckle and light top / dark bottom edges
        for (let k = 0; k < 90; k++) {
          const px = x + 4 + hash(k, c * 7 + r) * (2 * u - 8), py = y + 4 + hash(r * 3 + c, k) * (u - 8);
          g.fillStyle = `rgba(${hash(k, 1) > 0.5 ? '255,255,255' : '40,30,60'},${0.04 + hash(k, 2) * 0.08})`;
          const wx = ((px % W) + W) % W; g.fillRect(wx, py, 2 + hash(k, 3) * 5, 2 + hash(k, 4) * 4);
        }
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(((x + 3) % W + W) % W, y + 3, 2 * u - 6, 3);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(((x + 3) % W + W) % W, y + u - 7, 2 * u - 6, 4);
        if (hash(c, r * 5) > 0.7) {   // a crack
          g.strokeStyle = 'rgba(30,20,50,0.45)'; g.lineWidth = 1.5; g.beginPath();
          let cx = x + u * (0.4 + hash(r, c) * 1.2), cy = y + 6; g.moveTo(cx, cy);
          for (let s = 0; s < 4; s++) { cx += (hash(s, c + r) - 0.5) * 22; cy += u / 5; g.lineTo(cx, cy); }
          g.stroke();
        }
      }
    }
  }, { repeat: true });
  // Soft round glow for the additive sprites (read from the red channel). Opaque grey on black:
  // a transparent canvas uploads its near-zero-alpha pixels as full white in rgb, which showed the
  // sprite's square edge. The falloff reaches exactly 0 a few pixels inside the edge.
  _tex.glow = canvasTex(128, 128, (g, W) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    const img = g.getImageData(0, 0, W, W), d = img.data;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const r = Math.hypot(x + 0.5 - W / 2, y + 0.5 - W / 2) / (W / 2 - 3);
      const v = r >= 1 ? 0 : Math.pow(1 - r, 2.2) * 0.75 + Math.pow(1 - r, 8) * 0.25;
      const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.round(255 * v); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  _tex.shadow = canvasTex(128, 128, (g, W) => {
    const r = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.55, 'rgba(0,0,0,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, W);
  }, { srgb: false });
  // Engraved inlays: sun (left half) and moon (right half), white on transparent.
  _tex.inlay = canvasTex(512, 256, (g) => {
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
    // sun
    g.save(); g.translate(128, 128);
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, r0 = 56, r1 = k % 2 ? 78 : 92;
      g.lineWidth = k % 2 ? 4 : 6; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
    }
    g.restore();
    // moon
    g.save(); g.translate(384, 128);
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 70, Math.PI * 0.32, Math.PI * 1.68); g.arc(30, -4, 58, Math.PI * 1.52, Math.PI * 0.48, true); g.closePath();
    g.lineWidth = 6; g.stroke();
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6; g.beginPath(); g.arc(Math.cos(a) * 86, Math.sin(a) * 86, k % 3 ? 3 : 6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }, { srgb: false });
  // A strip of glowing runes (repeats along u): sun, moon and star marks, no letter shapes.
  _tex.runes = canvasTex(512, 64, (g) => {
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 3.5; g.lineCap = 'round'; g.lineJoin = 'round';
    const TAU = Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const x = k * 64 + 32, y = 32, s = 15, t = k % 8;
      g.beginPath();
      if (t === 0) { g.arc(x, y, s * 0.45, 0, TAU); for (let a = 0; a < 8; a++) { const c = Math.cos(a * TAU / 8), d = Math.sin(a * TAU / 8); g.moveTo(x + c * s * 0.7, y + d * s * 0.7); g.lineTo(x + c * s, y + d * s); } }
      else if (t === 1) { g.arc(x, y, s * 0.85, Math.PI * 0.35, Math.PI * 1.65); g.arc(x + s * 0.4, y, s * 0.62, Math.PI * 1.45, Math.PI * 0.55, true); g.closePath(); }
      else if (t === 2) { g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath(); g.stroke(); g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); g.beginPath(); }
      else if (t === 3) { g.arc(x, y, s * 0.9, 0, TAU); g.moveTo(x + s * 0.4, y); g.arc(x, y, s * 0.4, 0, TAU); }
      else if (t === 4) { for (let a = 0; a < 4; a++) { const c = Math.cos(a * TAU / 4), d = Math.sin(a * TAU / 4); g.moveTo(x, y); g.quadraticCurveTo(x + (c - d) * s * 0.25, y + (d + c) * s * 0.25, x + c * s, y + d * s); g.quadraticCurveTo(x + (c + d) * s * 0.25, y + (d - c) * s * 0.25, x, y); } }
      else if (t === 5) { g.arc(x - s * 0.3, y, s * 0.6, Math.PI * 0.5, Math.PI * 1.5); g.moveTo(x + s * 0.3, y - s * 0.6); g.arc(x + s * 0.3, y, s * 0.6, -Math.PI * 0.5, Math.PI * 0.5); g.moveTo(x, y - s); g.lineTo(x, y + s); }
      else if (t === 6) { g.arc(x, y - s * 0.35, s * 0.5, Math.PI, 0); g.moveTo(x - s, y + s * 0.3); g.lineTo(x + s, y + s * 0.3); g.moveTo(x - s * 0.5, y + s * 0.75); g.lineTo(x + s * 0.5, y + s * 0.75); }
      else { g.arc(x, y, s * 0.8, Math.PI * 0.2, Math.PI * 1.8); g.stroke(); g.beginPath(); g.arc(x + s * 0.2, y, 3.2, 0, TAU); g.fill(); g.beginPath(); }
      g.stroke();
      g.beginPath(); g.arc(k * 64, y, 2.2, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 5, 512, 2); g.fillRect(0, 57, 512, 2);
  }, { repeat: true, srgb: false });
  return _tex;
}

// ---------------------------------------------------------------------------
// Geometry builder: quads with per-vertex colour, glow and world-space UVs.

export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.g = []; this.idx = []; }
  // a, b, c, d: [x,y,z] three-space corners in order around the quad; out: outward direction [x,y,z]
  quad(a, b, c, d, out, cols, uvs, glows = [0, 0, 0, 0]) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const base = this.p.length / 3;
    [a, b, c, d].forEach((v, k) => {
      this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz);
      const cc = cols[k] || cols[0]; this.c.push(cc.r, cc.g, cc.b);
      this.uv.push(uvs[k][0], uvs[k][1]); this.g.push(glows[k]);
    });
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.g, 1));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

// A bevelled stone slab with a glowing trim ring on its top. Sim footprint x0..x1, z0..z1, top y, thickness h.
// Returned geometry is in three space, centred on the footprint centre at the top (so moving parts rotate about it).
export function slabGeometry(w, d, h, { top = col(PAL.stoneTop), side = col(PAL.stoneSide), deep = col(PAL.stoneDeep),
  bevel = 0.09, ring = 0.16, glow = 0.55, frontGlow = 0, uvOff = [0, 0] } = {}) {
  const B = new GeoBuilder();
  const X0 = -w / 2, X1 = w / 2, Z0 = -d / 2, Z1 = d / 2;   // three-space z: Z0 is the far (forward) end
  const b = Math.min(bevel, w / 4, d / 4), r = Math.min(ring, w / 4, d / 4);
  const S = 0.25, U0 = uvOff[0], V0 = uvOff[1];
  const uvTop = (x, z) => [U0 + x * S, V0 - z * S];
  const y0 = 0, yb = -b, yh = -h;
  const top2 = top.clone().multiplyScalar(0.93);
  // top centre
  const iX0 = X0 + b + r, iX1 = X1 - b - r, iZ0 = Z0 + b + r, iZ1 = Z1 - b - r;
  const oX0 = X0 + b, oX1 = X1 - b, oZ0 = Z0 + b, oZ1 = Z1 - b;
  const P = (x, z, y = y0) => [x, y, z];
  B.quad(P(iX0, iZ1), P(iX1, iZ1), P(iX1, iZ0), P(iX0, iZ0), [0, 1, 0], [top], [uvTop(iX0, iZ1), uvTop(iX1, iZ1), uvTop(iX1, iZ0), uvTop(iX0, iZ0)]);
  // trim ring (glows toward the outer edge)
  const ringQ = (a, b2, c, d2) => B.quad(P(...a), P(...b2), P(...c), P(...d2), [0, 1, 0], [top2],
    [uvTop(...a), uvTop(...b2), uvTop(...c), uvTop(...d2)], [glow, glow, 0, 0]);
  ringQ([oX0, oZ1], [oX1, oZ1], [iX1, iZ1], [iX0, iZ1]);   // near edge
  ringQ([oX1, oZ0], [oX0, oZ0], [iX0, iZ0], [iX1, iZ0]);   // far edge
  ringQ([oX0, oZ0], [oX0, oZ1], [iX0, iZ1], [iX0, iZ0]);   // left
  ringQ([oX1, oZ1], [oX1, oZ0], [iX1, iZ0], [iX1, iZ1]);   // right
  // bevel (chamfer) catching the light
  const bev = col(PAL.trim).lerp(top, 0.45);
  const bevQ = (a, b2, c, d2, out, gl) => B.quad(a, b2, c, d2, out, [bev], [[a[0] * S, a[1] * S + a[2] * S], [b2[0] * S, b2[1] * S + b2[2] * S], [c[0] * S, c[1] * S + c[2] * S], [d2[0] * S, d2[1] * S + d2[2] * S]], [gl, gl, gl, gl]);
  bevQ(P(oX0, oZ1), P(oX1, oZ1), P(X1, Z1, yb), P(X0, Z1, yb), [0, 1, 1], glow * 0.7);
  bevQ(P(oX1, oZ0), P(oX0, oZ0), P(X0, Z0, yb), P(X1, Z0, yb), [0, 1, -1], glow * 0.7);
  bevQ(P(oX0, oZ0), P(oX0, oZ1), P(X0, Z1, yb), P(X0, Z0, yb), [-1, 1, 0], glow * 0.5);
  bevQ(P(oX1, oZ1), P(oX1, oZ0), P(X1, Z0, yb), P(X1, Z1, yb), [1, 1, 0], glow * 0.5);
  // sides, fading into the dark below
  const sideQ = (xa, za, xb, zb, out, u0, u1, fg = 0) => B.quad(P(xa, za, yb), P(xb, zb, yb), P(xb, zb, yh), P(xa, za, yh), out,
    [side, side, deep, deep], [[u0 * S, yb * S], [u1 * S, yb * S], [u1 * S, yh * S], [u0 * S, yh * S]], [fg, fg, 0, 0]);
  sideQ(X0, Z1, X1, Z1, [0, 0, 1], X0, X1, frontGlow);   // near face (faces the players coming)
  sideQ(X1, Z0, X0, Z0, [0, 0, -1], X1, X0);
  sideQ(X0, Z0, X0, Z1, [-1, 0, 0], Z0, Z1);
  sideQ(X1, Z1, X1, Z0, [1, 0, 0], Z1, Z0);
  B.quad(P(X0, Z0, yh), P(X1, Z0, yh), P(X1, Z1, yh), P(X0, Z1, yh), [0, -1, 0], [deep], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return B.build();
}

let _mats = null;
export function materials() {
  if (_mats) return _mats;
  const T = textures();
  _mats = {};
  _mats.stone = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, map: T.stone, roughness: 0.82, metalness: 0.05 }), { glow: true });
  _mats.stoneFlat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, flatShading: true }), {});
  _mats.inlaySun = patchWorld(new THREE.MeshBasicMaterial({ map: T.inlay, color: col(0xffb860).multiplyScalar(0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { additive: true, key: 'is' });
  _mats.inlayMoon = patchWorld(new THREE.MeshBasicMaterial({ map: T.inlay, color: col(0x8fdcff).multiplyScalar(0.5), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { additive: true, key: 'im' });
  _mats.runes = patchWorld(new THREE.MeshBasicMaterial({ map: T.runes, color: col(0xc9b6ff).multiplyScalar(1.3), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { additive: true, key: 'ru' });
  _mats.stonePlain = patchWorld(new THREE.MeshStandardMaterial({ color: 0x5c5084, roughness: 0.85, metalness: 0.05, flatShading: true }), { key: 'sp' });
  _mats.metal = patchWorld(new THREE.MeshStandardMaterial({ color: 0x6e6390, roughness: 0.45, metalness: 0.7 }), { key: 'me' });
  _mats.gold = patchWorld(new THREE.MeshStandardMaterial({ color: 0xc89a4a, roughness: 0.35, metalness: 0.8, emissive: 0x2a1500 }), { key: 'go' });
  return _mats;
}

// Inlay decal on a slab top: el 0 sun, 1 moon. size in units.
export function inlayMesh(el, size) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (el ? 0.5 : 0));
  const m = new THREE.Mesh(g, el ? materials().inlayMoon : materials().inlaySun);
  m.position.y = 0.006;
  return m;
}

// A rune band on a vertical face: width w, height hh, facing +z (three). Repeats one glyph per 0.6 units.
export function runeBand(w, hh = 0.32) {
  const g = new THREE.PlaneGeometry(w, hh);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 4.8);
  return new THREE.Mesh(g, materials().runes);
}

// ---------------------------------------------------------------------------
// Chain: links along -y from the origin, total length len. Orient with lookAt-style helpers.
const _linkGeo = {};
function linkGeo(s) {
  return _linkGeo[s] || (_linkGeo[s] = new THREE.TorusGeometry(s * 0.5, s * 0.14, 4, 8));
}
export function chainMesh(len, s = 0.22) {
  const n = Math.max(1, Math.round(len / (s * 0.82)));
  const im = new THREE.InstancedMesh(linkGeo(s), materials().metal, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < n; k++) {
    e.set(0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2);
    q.setFromEuler(e); p.set(0, -(k + 0.5) * len / n, 0);
    m.compose(p, q, one); im.setMatrixAt(k, m);
  }
  im.userData.len = len;
  return im;
}
// Point a chain from world point a (three space) to b: the chain hangs from a and reaches b.
const _up = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3();
export function aimChain(chain, a, b) {
  chain.position.copy(a);
  _d.subVectors(b, a); const l = _d.length() || 1;
  chain.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / l));
  chain.scale.set(1, l / chain.userData.len, 1);
}

// Crystal: a faceted thorn, base at y=0, tip at y=1, radius 1 (scale to taste).
export function crystalGeometry(sides = 5) {
  const g = new THREE.CylinderGeometry(0, 1, 1, sides, 1, false);
  g.translate(0, 0.5, 0);
  return g.toNonIndexed();
}

// Lantern: cage + cap + glowing core. Origin at the hanging hook.
export function lanternMesh(color = 0xffc070) {
  const grp = new THREE.Group();
  const M = materials();
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 6), M.gold); cap.position.y = -0.14; grp.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 6), M.gold); base.position.y = -0.72; grp.add(base);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 6), new THREE.MeshBasicMaterial({ color: col(color).multiplyScalar(2.2) }));
  core.position.y = -0.46; grp.add(core);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.46, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2a20, wireframe: true }));
  bars.position.y = -0.46; grp.add(bars);
  return grp;
}

// ---------------------------------------------------------------------------
// GlowField: camera-facing additive billboards, all in one draw call. Rebuilt every frame.
export class GlowField {
  constructor(max = 600) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // xyz, size
    this.colr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);  // rgb, alpha
    this.off.setUsage(THREE.DynamicDrawUsage); this.colr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOff', this.off); g.setAttribute('aCol', this.colr);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: textures().glow }, ...U },
      vertexShader: `attribute vec4 aOff; attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; varying float vB;
        uniform float uZone;
        void main() {
          vUv = position.xy + 0.5; vCol = aCol;
          vB = 1.0 - smoothstep(-0.5, 4.0, aOff.z - uZone);
          vec4 mv = viewMatrix * vec4(aOff.xyz, 1.0);
          vB *= smoothstep(1.0, 4.5, -mv.z);   // fade glows that come right up to the camera
          mv.xy += position.xy * aOff.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol; varying float vB;
        void main() { float a = texture2D(map, vUv).r * vCol.a * vB; gl_FragColor = vec4(vCol.rgb * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.n = 0;
    this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  // position in three space; color a THREE.Color or hex; size in units
  add(x, y, z, size, color, alpha = 1) {
    if (this.n >= this.max) return;
    const c = typeof color === 'number' ? this._c.setHex(color) : color;
    const i = this.n++ * 4;
    this.off.array[i] = x; this.off.array[i + 1] = y; this.off.array[i + 2] = z; this.off.array[i + 3] = size;
    this.colr.array[i] = c.r; this.colr.array[i + 1] = c.g; this.colr.array[i + 2] = c.b; this.colr.array[i + 3] = alpha;
  }
  end() {
    this.mesh.geometry.instanceCount = this.n;
    this.off.needsUpdate = true; this.colr.needsUpdate = true;
    this.off.addUpdateRange?.(0, this.n * 4); this.colr.addUpdateRange?.(0, this.n * 4);
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Liquid surface material for pools: el 0 sun, 1 moon, 2 shade.
export const LIQ3 = [
  { hi: 0xfff1a8, a: 0xffb02e, b: 0xe2531c, glow: 0xffa040 },
  { hi: 0xeaffff, a: 0x7fd6ff, b: 0x2f6fd8, glow: 0x70c8ff },
  { hi: 0x9dffb9, a: 0x3a7d55, b: 0x1d1530, glow: 0x60ff9a },
];
const _liqMats = [];
export function liquidMaterial(el) {
  if (_liqMats[el]) return _liqMats[el];
  const L = LIQ3[el] || LIQ3[0];
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, cHi: { value: col(L.hi) }, cA: { value: col(L.a) }, cB: { value: col(L.b) }, uEl: { value: el },
      ...THREE.UniformsLib.fog },
    vertexShader: `varying vec3 vW; uniform float uTime;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 2.1 + uTime * 2.3) * 0.025 + sin(w.z * 1.7 - uTime * 1.9) * 0.025;
        vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 cHi; uniform vec3 cA; uniform vec3 cB; uniform float uEl;
      uniform float uZone; uniform vec3 uDuskCol;
      #include <fog_pars_fragment>
      float n2(vec2 p) { return sin(p.x) * sin(p.y); }
      void main() {
        vec2 p = vW.xz * 1.4;
        float t = uTime * (uEl > 1.5 ? 0.6 : 1.0);
        float w = n2(p + vec2(t * 0.9, t * 0.7)) + 0.6 * n2(p * 1.9 - vec2(t * 1.3, -t * 0.4)) + 0.35 * n2(p * 3.7 + vec2(-t, t * 1.7));
        w = w * 0.5 + 0.5;
        vec3 c = mix(cB, cA, smoothstep(0.15, 0.75, w));
        c = mix(c, cHi, smoothstep(0.78, 0.98, w));
        float glowK = uEl > 1.5 ? 0.85 : 0.95;
        gl_FragColor = vec4(c * glowK, 0.92);
        float behind = smoothstep(-0.5, 5.0, vW.z - uZone);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uDuskCol, behind * 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true, transparent: false,
  });
  _liqMats[el] = m;
  return m;
}
