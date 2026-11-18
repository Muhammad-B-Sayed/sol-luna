# Runner 3D: the app shell

How the third-person versus runner is wired into the game: menus, local split screen, online
rooms, HUD, pause and results, input, and the browser check. The sim is described in
`docs/runner3d.md` and the renderer in `docs/runner3d-render.md`.

Play it from the title menu (**Versus · same keyboard → Runner 3D**) or from an online room
(**Versus → Runner 3D**, once both players are in). Rematch always starts a new course; online
the server picks the seed.

## Files

| File | What |
| --- | --- |
| `public/js/runner3d-app.js` | `Runner3DMode`: local loop, online prediction and reconciliation, DOM HUD, touch pad, pause and results. A close copy of the 2D runner's `runner-app.js`. |
| `public/js/runner3d-debug.js` | A 2D-canvas debug view with the renderer's API: object footprints as boxes, players, the dusk. |
| `tools/runner3d-browser.js` | Real-browser check of local and online play, plus a WebGL screenshot pass. |

## Hooks in shared shell files

Each is a few lines next to the matching 2D runner hook.

- `public/index.html`: `<canvas id="game3d">` after `#game`; "Runner 3D" buttons in `#menuModes`
  (`btnRunner3d`) and `#lobbyModes` (`lobbyRunner3d`); one "How to play" line; the `#r3Pause`
  and `#r3Results` cards.
- `public/js/main.js`: imports and creates `Runner3DMode`, hands it the frame loop while it is
  active, routes `start{mode:'runner3d'}` to it, and stops it in `quitToMenu`.
- `public/js/input.js`: the `SOL_3D` and `LUNA_3D` key maps, `pad3()`, `local3d()`, `any3d()`,
  and the `mode3d` and `touch3` fields. `preventDefault` for the extra keys (`/`, Shift,
  Numpad 0) only applies while `mode3d` is on, and never in a text field. The older methods are
  unchanged.
- `server/index.js`: `Room.startRunner3d()`, the `runner3d` branches in `restartGame()`,
  `startMsg()`, `tick()` and the `start` message, and the input mask raised from `& 15` to
  `& 31` (bit 16 is "back"). The co-op sim and the 2D runner read only bits 1, 2 and 4, and
  Dodgeball reads 8, so none of them sees bit 16.
- `public/style.css`: one block at the end for the canvas, HUD and touch pad.

## Controls

| | Move (the camera never turns, so up is always forward) | Jump |
| --- | --- | --- |
| Sol, local | arrow keys | Right Shift, `/`, Numpad 0 |
| Luna, local | W A S D | Space, Left Shift |
| Online | either set drives your own character | any of the above, Space included |
| Gamepad | left stick or d-pad (pad 0 is Sol, pad 1 is Luna locally; any pad online) | A |
| Touch (online only) | left thumb pad, 8 directions | the round button |

`Esc` or `P` pauses, and `R` starts a new course, the same as the 2D runner.

## Rendering

The mode draws to `#game3d`, which fills the stage while the mode is active. `body.r3d` hides
the 2D canvas, and `stop()` restores it. On the first match the app imports
`/js/r3d/renderer.js`, and it starts that download earlier when the lobby fills or the Runner 3D
button is hovered. If the import or the WebGL constructor fails, or the page was opened with
`?r3ddebug=1`, the debug view draws instead on a fresh canvas. The flag is read once at load
because joining a room rewrites the URL to `/CODE`. A renderer that throws while drawing is
replaced by the debug view, and the error is kept in `renderErrors` for the browser check.

`draw(L, S, view, time, { split, me, paused })` gets `split: true` locally (Sol left, Luna
right) and `split: false, me` online.

## Netcode

This uses the same scheme as the 2D runner. The client predicts with its own input and the last
known remote input. On each snapshot it replays its unacknowledged inputs and carries the
difference as a decaying visual offset.

Two additions:

- When the drawn position is ahead of the corrected one and the player is running forward, the
  offset shrinks by at most 60% of their forward speed each tick. The player slows down for a
  moment instead of sliding backwards. This matters when the server trims a long input queue
  after a stall (`q.length > 12`), which drops up to 12 ticks of running.
- A snapshot can name objects (up to `S.hi`) that the client's lazily generated course doesn't
  have yet. `cover()` generates up to them before the state is stepped or drawn.

`window.__runner3d.corr` records the largest correction of your own player: `max` overall,
`back` backwards in z, and `viewBack` as the most the drawn player moved backwards in one frame
while forward was held.

## Checks

```bash
PORT=3420 node server/index.js &              # LAG_MS=80 for the prediction test
PORT=3420 node tools/runner3d-browser.js       # CHROME defaults to /usr/bin/chromium on Linux
```

The play checks run on the debug view. Headless WebGL here is SwiftShader, and the real
renderer draws about 0.5 frames a second at 1280x720, far too slow to play a match. A second
pass loads the real renderer, checks that it draws without errors, and takes the screenshots in
`docs/img/runner3d/`: `menu`, `lobby`, `local-split`, `results`, `online-host` and
`online-guest`. The `debug-*` shots come from the play checks. The WebGL pass fast-forwards the
local sim inside the page. Online it can't, so its shots show whatever the server has reached
by the time the slow clients draw.

Options: `ONLY=local|online|webgl`, `RENDER=debug|webgl|both`, `OUT`, `GL_FLAGS`, and
`MAX_VIEW_BACK` (default 0.05 units).
