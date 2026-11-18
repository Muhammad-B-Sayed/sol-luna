# Runner 3D renderer

Three.js r170 (vendored in `public/vendor/three/`) renderer for the 3D runner versus mode.
Code: `public/js/r3d/` (`renderer.js` is the entry the app imports). Demo: `/r3d-demo.html`.
Screenshots: `node tools/r3d-shots.js [names...]` writes `docs/img/runner3d/render-*.png`.

## Work log

- First draft (commit 1474df5): kit, characters, world, zone, fx, views for floor/pool/spikes, demo, shot tool. Never run.
- Merged runner-3d and r3d-sim (sim now has crumble, eclipse, sweeper, pendulum, carousel, gate, orb).
- Fixed: objPose got tick = 1. Now tick = S.tick - 1 + alpha, with alpha recovered from how far view.zone lags S.zone.
- Shot tool: 960x540 default, profile in /tmp/sl-r3dshots-*, names render-*, demo `?auto=0` (no rAF loop; the tool steps and renders).
- Headless WebGL: the shell agent found default `--headless=new` Chromium already has WebGL2 here, and
  `--use-angle=swiftshader` makes it slower. The shot tool uses no GL flags by default (GL_FLAGS env to add).
- A first shot run was SIGKILLed by the host (exit 137). Retry with a smaller run.

Next: get one shot rendering, fix errors, then views for tilt/ramp and the new kinds.
