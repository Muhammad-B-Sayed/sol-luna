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

- Views written for every current kind (ramp, tilt, crumble, eclipse, sweeper, pendulum, carousel, gate, orb). Eclipse uses camera layers: solid on its own player's camera, ghost on the other.
- groundAt (blob shadows) is per kind: carousel stones from objPose, eclipse only for its player, crumble only while solid.
- Default headless Chromium's GPU process runs `--use-angle=swiftshader-webgl` by itself. A 75-step shot run timed out at 400 s with no output: added progress logs, render every 3rd step.

- Shots run (when the host is not overloaded, about 5-10 s each). Reviewed and fixed: washed-out lighting (darker
  hemisphere, smaller sun glare, darker stone), bubble-like glow sprites (smaller; glows fade within 4.5 units of the camera),
  letter-like runes (now sun, moon and star marks), flat abyss (darker), cardboard silhouettes (hazed),
  split-screen white stripe (bloom picked up the uncleared gap between viewports; now the whole buffer is cleared),
  black posts and legs (`stoneFlat` needs vertex colours; added `stonePlain`), crumble cracks invisible (texture not repeating),
  blown-out pools, Luna's look (hood with a drooping star-tipped point, crescent on the back of the hood, cape).
- Perf: Sol's emblem parts merged, sun rays in one InstancedMesh; streaming window pz+125 with fog to 125.
  Typical single view 190-255 draw calls, 30-50k triangles; split 500 calls total (about 250 per view).
- Demo: `?cam=dx,dy,dz` debug close-up camera; `?kind=` starts on that section's run-up.

## How to look

- `PORT=3410 node server/index.js`, open `http://localhost:3410/r3d-demo.html?seed=7&split=1` (bots run; arrows+Enter
  or WASD+Space take over a player). `?kind=gate`, `?z=400`, `?q=low`, `?count=1`.
- `node tools/r3d-shots.js death victory kind-` (names are substrings), output in docs/img/runner3d/render-*.png.
- If a run hangs, the host is overloaded: the tool now times out each page call (EVAL_MS) and moves on.

Next: effects review (deaths, landing), quality=low check, more character polish.
