# Runner 3D renderer

Three.js r170 (vendored in `public/vendor/three/`) renderer for the 3D runner versus mode.
Code: `public/js/r3d/` (`renderer.js` is the entry the app imports). Demo: `/r3d-demo.html`.
Screenshots: `node tools/r3d-shots.js [names...]` writes `docs/img/runner3d/render-*.png`.

## Files

- `renderer.js`: `Runner3DRenderer` (the API the app uses), camera rigs, streaming of object views, blob shadows,
  death and landing effects derived from changes in `S`, bloom through `EffectComposer` (quality `high`), plain
  rendering at `low`. `setQuality('auto' | 'high' | 'low')`; auto drops to low if the median frame is over 24 ms.
- `kit.js`: the sim-to-three mapping (`toV`: z is negated, only here), palette, shared uniforms, generated textures,
  `patchWorld` (dusk swallowing everything behind the wall, vertex glow, rim, dissolve), slab geometry, chains,
  crystals, lanterns, liquid material, `GlowField` (all glow sprites in one draw call).
- `views.js`: `VIEWS[kind] = { make(o, L, idx), update(view, o, st, pose, ctx) }` and the glowing-box `FALLBACK`.
- `characters.js`: Sol and Luna, procedural, with all their animation.
- `world.js`: sky dome, abyss, two mist layers, motes, pillars, arches, lanterns, distant silhouettes.
- `zone.js`: the dusk wall, tendrils, floor glow, per-camera vignette. `fx.js`: particles.

## Adding a view for a new kind

1. Read its `KIND_DOC` line and `objPose` case in `shared/runner3d.js`.
2. Add `VIEWS.<kind>` in `views.js`. Build at rest in `make` (sim -> three: `x, y, -z`), move it in `update` from
   `pose` (the renderer passes `objPose(L, S, i, S.tick - 1 + alpha)`, so it matches the interpolated players).
   Put every geometry, InstancedMesh and per-view material in `userData.geos / insts / mats` so `disposeView` frees it.
3. If players can stand on it, add a case to `groundAt` in `renderer.js` (blob shadows).
4. If it brings a new cause of death (`WHY3`), add a branch in `onDeath` (renderer) and in `Character.update`.
5. Add the kind to the per-kind shot list in `tools/r3d-shots.js` and look at the screenshot.

## Numbers (headless, 960x540, last full run)

Single view 150-255 draw calls and 25-50k triangles; split screen about 370-500 calls in total (185-250 per view)
and about 100k triangles. Software GL here manages 60-250 ms per frame, so real fps cannot be measured headless.
Reset leak check (`node tools/r3d-shots.js leak`): GPU geometries 176 -> 178 -> 178 over six resets, textures 19.

## How to look

- `PORT=3410 node server/index.js`, open `http://localhost:3410/r3d-demo.html?seed=7&split=1` (bots run; arrows+Enter
  or WASD+Space take over a player). Parameters: `?seed= ?split=1 ?me=1 ?z= ?kind=gate ?q=high|low ?count=1 ?bot=0
  ?hud=0 ?auto=0 ?cam=dx,dy,dz` (`cam` is a debug close-up camera, offset from the player in sim units).
- `node tools/r3d-shots.js death victory kind-` (names are substrings).

## Known issues

- Real frame rate on an integrated GPU is untested (only software GL here). Bloom is the first thing to drop
  (`setQuality('low')`), and auto quality does it by itself.
- The dusk wall is mostly behind the camera; the danger reads through the vignette, the darkening and the embers,
  and the wall itself only when the camera looks back (countdown, deaths).
- Luna's hood reads lighter than intended from the front (her own point light); from behind it is fine.
- Demo bots are simple and die often on hard sections; they are for looking, not testing.

## Work log

- First draft (commit 1474df5): kit, characters, world, zone, fx, views for floor/pool/spikes, demo, shot tool. Never run.
- Merged runner-3d and r3d-sim (sim then had crumble, eclipse, sweeper, pendulum, carousel, gate, orb).
- Fixed: objPose got tick = 1. Now tick = S.tick - 1 + alpha, with alpha recovered from how far view.zone lags S.zone.
- Shot tool: 960x540 default, profile in /tmp/sl-r3dshots-*, names render-*, demo `?auto=0` (no rAF loop; the tool
  steps and renders every 3rd step), progress logs, a timeout per page call (EVAL_MS) with a fresh tab after a failure.
- Headless WebGL: default `--headless=new` Chromium has WebGL2 here; its GPU process runs `--use-angle=swiftshader-webgl`
  by itself. Extra swiftshader flags only make it slower. No GL flags by default (GL_FLAGS env to add). When the host
  is overloaded a run can stall for minutes; when it is not, a shot takes 5-10 s.
- Views for every kind. Eclipse uses camera layers: solid on its own player's camera, ghost on the other.
- groundAt (blob shadows) is per kind: carousel stones from objPose, eclipse only for its player, crumble only while solid.
- Art pass from screenshots: darker twilight lighting, smaller sun, smaller glow sprites that fade near the camera,
  glyph runes, darker abyss with two mist layers, hazy silhouettes with a vertical gradient, split-screen gap cleared
  (bloom used to pick it up as a white stripe), `stonePlain` for posts (stoneFlat needs vertex colours), ember cracks
  on crumble slabs, calmer pools, Luna's hood, star-tipped point and cape, distinct gaits (Sol bouncy, Luna floaty),
  stronger blob shadows with one material each.
- Perf: Sol's emblem merged, sun rays in one InstancedMesh, streaming window pz+125 with fog to 125.
- Demo: `?kind=` starts on that section's run-up (`L.secs[].sx, sz`), ground probe counts only floors and ramps.
- Real app check (shell's `tools/runner3d-browser.js`, ONLY=local, port 3410): the WebGL renderer loads and draws,
  "no renderer errors". Its gameplay steps failed on this branch's older copy of that test (Sol steered off the course).
