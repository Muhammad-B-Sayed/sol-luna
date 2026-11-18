Three.js r170 (0.170.0), vendored from https://cdn.jsdelivr.net/npm/three@0.170.0/ (MIT, see LICENSE).

- `three.module.min.js` is `build/three.module.min.js`.
- `addons/` holds only the `examples/jsm` files the Runner 3D renderer uses. Their `from 'three'`
  imports are patched to relative paths, so the browser loads them without an import map.
