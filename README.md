# Sol & Luna — Temple of Twilight

A two-player co-op elemental puzzle platformer for the browser.
**Sol** (sun) and **Luna** (moon) work together through 32 temple levels:
sun pools burn Luna, moon pools drown Sol, shade pools swallow anyone.
Plates, levers, lifts, ferries, drawbridges and crates join the mix as you go.

- **Same keyboard:** Sol uses the arrow keys, Luna uses `W` `A` `D`. Gamepads also work.
- **Online:** one player hosts and gets a 5-letter room code (or an invite link like
  `https://your-app.onrender.com/ABCDE`). Their friend types the code or opens the link.
  Each player controls one character with arrows, WASD or a gamepad. Phones get touch buttons.

## How it works

| Path | What |
| --- | --- |
| `shared/sim.js` | Deterministic 60 Hz simulation (physics, collisions, mechanisms). Runs on both server and client. |
| `shared/levels.js` | The 32 levels as ASCII maps (generated). |
| `shared/dodge.js`, `shared/runner.js` | The two versus modes, Dodgeball and Runner. |
| `tools/acts/act*.py` | The levels, one Python function each, written with the DSL in `tools/lvdsl.py`. |
| `tools/levelgen.py` | Builds `shared/levels.js` from the act files: `python3 tools/levelgen.py`. |
| `tools/gate.js` | The level gate: layout, route, depth, bot win, headroom and the solo check. |
| `tools/coop-bot.js` | Scripted two-player playthroughs, one per level (`tools/acts/act*.bot.js`). |
| `tools/check-levels.js` | Brute-force reachability checker that uses the real physics. |
| `tools/calibrate.js` | Measures jump height, gap and climb limits with the real physics. |
| `server/index.js` | Static file server plus WebSocket rooms with an authoritative simulation. |
| `public/` | Client: renderer, input, audio, menus. |

**Netcode.** The server runs the authoritative simulation for each room at 60 Hz and
broadcasts snapshots at 30 Hz. Each client predicts its own character immediately.
When a snapshot arrives, the client rewinds to it, replays its own unacknowledged inputs,
and smooths away any visual correction. Your own movement feels instant even with
100+ ms of latency.

**Rendering.** Everything is drawn with vector paths at the device's native pixel ratio,
so it stays sharp at any size. The static temple is cached once per level and resize.
Frames interpolate between simulation ticks, so motion is smooth on 120/144 Hz displays.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
```

Add `?unlock` to the URL to unlock every level.

## Deploy on Render

The repo includes a `render.yaml` Blueprint for a single free Node web service.
In Render, create a Blueprint from this repository, or create a Web Service with:

- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check path: `/healthz`

Free instances sleep after about 15 minutes without traffic. The first visit after that
takes up to a minute while the instance wakes up.

## Level tools

```bash
python3 tools/levelgen.py        # regenerate shared/levels.js from tools/acts/
node tools/gate.js 5             # the full level gate (FAST=1 skips the slow solo check)
node tools/coop-bot.js 5,6       # run scripted co-op playthroughs
node tools/check-solo.js         # fail if any level can be finished by one player alone
node tools/check-dodge.js        # Dodgeball rules
node tools/check-runner.js       # Runner fairness proof (about 5 minutes)
```

`docs/level-plan.md` is the level brief and design rules; `HANDOFF.md` covers everything else.
