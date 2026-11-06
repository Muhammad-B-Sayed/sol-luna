# Handoff: Sol & Luna — Temple of Twilight

Read this before you change anything. It covers what exists, why it's built this way,
how it's verified, what's deployed, and the traps the last session hit.

Owner: **Muhammad-B-Sayed** (GitHub). Commit identity must be theirs (see "Git and attribution").

---

## 1. What this is, and the one hard constraint

A browser-based, two-player co-op elemental puzzle platformer:

- **Sol** (sun) and **Luna** (moon).
- Sun pools kill Luna, moon pools kill Sol, shade pools kill both.
- Each player collects their own gems and stands at their own door to finish a level.
- **Local mode:** both players on one keyboard. Sol uses arrows, Luna uses WASD. Gamepads work.
- **Online mode:** a host creates a room and gets a 5-letter code or a `/<CODE>` invite link. A friend joins in the browser.

The user originally asked for a faithful clone of *Fireboy and Watergirl 1*. That was declined.
The game is proprietary (not open source, despite the user's claim), and the session's rules
forbid recreating a specific existing game's name, characters, art, levels or look.

The user accepted an **original game "heavily inspired by" the genre**. Their stated requirements:

- Sun & Moon theme.
- Online play plus in-person (same keyboard) play.
- Render free tier.
- New GitHub repo.
- The same number of levels as the original (32).

**Keep it original.** Do not add assets, level layouts, names or characters copied from FBWG.
Genre mechanics (elemental pools, plates, levers, lifts, crates) are fine.

---

## 2. Where things are

| Thing | Value |
| --- | --- |
| Repo | https://github.com/Muhammad-B-Sayed/sol-luna (public, branch `main`) |
| Live site | https://sol-luna.onrender.com |
| Render workspace | "FBWG game", id `tea-dblq33om7kps73bvk5bg` |
| Render service | `sol-luna`, id `srv-dblr54mi0phs7385vh80`, free plan, Oregon, Node 22 (`NODE_VERSION=22`) |
| Render dashboard | https://dashboard.render.com/web/srv-dblr54mi0phs7385vh80 |
| Build / start | `npm ci --omit=dev` / `npm start` |
| Auto-deploy | On every push to `main`. |

Render deploy settings:
- No health check path is set: the Render MCP tool couldn't set one. The server does expose `/healthz`.
- `render.yaml` (a Blueprint) is in the repo, but the live service was created directly with the
  Render MCP tool, not from the Blueprint.
- Free instances sleep after about 15 minutes idle. The first load after that takes up to a minute
  (the UI has a "Connecting…" screen that mentions this).

---

## 3. Architecture

```
shared/sim.js        Deterministic 60 Hz simulation (physics, collisions, mechanisms, level parsing).
                     Imported by BOTH the browser and the server. Pure JS, no DOM.
shared/levels.js     GENERATED. 32 levels as 40x30 ASCII maps + metadata. Do not hand-edit.
tools/levelgen.py    Level authoring DSL (Python). Source of truth for levels.
tools/check-levels.js  Solo reachability checker (real physics, BFS over macro-actions).
tools/coop-bot.js    Scripted two-player playthroughs for crate levels (13,17,22,28,31).
tools/check-all.sh   Runs the checker on all non-bot levels in parallel, then the co-op bot.
server/index.js      Node http static server + `ws` WebSocket rooms, authoritative sim per room.
public/index.html    Menus (DOM overlays) + canvas.
public/style.css
public/js/main.js    App shell: menus, local loop, online prediction/reconciliation, HUD, progress.
public/js/render.js  Canvas renderer (vector, DPR-aware, cached static layer, particles).
public/js/input.js   Keyboard/gamepad/touch → input bits (1=left, 2=right, 4=jump).
public/js/net.js     WebSocket client wrapper.
public/js/audio.js   Procedural WebAudio SFX (no audio files).
render.yaml          Render Blueprint (alternative way to deploy).
```

No build step and no bundler. The browser loads ES modules directly, and `/shared/*` is served by
the Node server from the `shared/` folder. The only dependency is `ws`.

### Simulation (`shared/sim.js`)

- **World size:** tile `TS=24`, grid `40x30`, world `960x720` logical px. Fixed tick at 60 Hz.
- **Tile codes:** `0` empty, `1` solid, `2` `/` ramp up-right, `3` `\` ramp up-left,
  `4/5/6` sun/moon/shade pool.
- **Pools** are solid tiles whose top is sunk by `POOL_DEPTH=10`.
- **Death check** (`checkHazards`): the player's feet (inset 5px each side) are over a hostile pool
  and the bottom has sunk at least 3px.
- **Physics constants** live in `PHYS` (top of file). The user wanted the original game's feel.
  The playthrough video couldn't be watched (YouTube is blocked in the sandbox), so these were
  tuned by genre knowledge:
  - Jump about 3.2 tiles high, about 4.8 tiles long at full speed.
  - Holding jump re-jumps on landing.
  - Coyote time 5 ticks.
  - `stepUp` 14px, which lets players climb out of pools and onto slope tops.
  - Downhill snap 8px.
- **Collisions:**
  - Players and crates are AABBs.
  - The X pass resolves the leading tile column with step-up, then slopes under the entity's
    centre, then dynamic solids. Crates get pushed, recursively up to depth 3.
  - The Y pass is crossing-based: it only collides when the previous bottom was above the
    surface, so an entity that is already overlapping is ignored.
  - Slopes are sampled at the entity's centre column with a 6px tolerance.
  - Players pass through each other.
- **Moving platforms:** each has two positions (`x0,y0` "off" and `x1,y1` "on") and moves at
  `platSpeed` px/tick.
  - Riders are carried through `gref` (the id of what an entity stands on). Platform ids are
    their index; crates are `100+i`; players are `200+i`.
  - If a platform would crush something, it reverts its move that tick ("blocked").
  - Initial position accounts for `inv` and for levers that start on.
- **Mechanism groups** (0–3), each with a colour:
  - A group is active if ANY plate in it is pressed OR ANY lever in it is on (OR logic).
  - Plates are pressed by any living player or crate whose bottom is on the floor and which
    overlaps the plate's inner area.
  - Levers are pushed by entities moving faster than 0.3px/tick through the lever's tile. They
    move 0.22 per tick and **spring to whichever side they were pushed past centre**.
  - `on = angle > 0`, meaning pushed to the right.
- **Phases:** `PH_PLAY`, `PH_DEAD` (auto-resets the whole level after `DEATH_TICKS=80`, timer
  included, and increments `tries`), `PH_WON` (both doors fully open).
- **`rankFor`:** A = all gems and under par; B = one of the two; C = neither.

### Netcode

- **Server** (`server/index.js`):
  - Each room runs `step()` at 60 Hz using queued inputs per character.
  - It broadcasts `{t:'s', ack:[seqSol,seqLuna], inp:[bitsSol,bitsLuna], st:<full state>}` every
    2 ticks (30 Hz).
  - If a player's input queue runs dry, their last input is held for 10 ticks, then released.
  - A queue longer than 12 is trimmed.
- **Client** (`main.js`):
  - Predicts every tick with its own input and the last known remote input, and sends `{t:'i', s, b}`.
  - On each snapshot it takes the server state, replays its own unacked inputs, and carries the
    visual difference as a decaying offset (`app.off`), so there's no visible snap.
  - It interpolates between ticks for high-refresh displays.
- **Messages:**

  | Direction | Messages |
  | --- | --- |
  | Client → server | `create`, `join{code}`, `swap`, `start{level}` (host only), `restart`, `menu` (host only), `leave`, `ping` |
  | Server → client | `room`, `start{level, st}`, `s`, `menu`, `peer-left`, `err`, `pong` |
- **Characters:** the host starts as Sol, and "Swap characters" in the lobby swaps them.
- **Testing aids:**
  - `LAG_MS=80 npm start` adds artificial one-way latency on the server.
  - `window.__app` is exposed in the browser for Playwright tests (harmless; keep or remove).

### Rendering

- Everything is drawn as vector shapes at `devicePixelRatio`, so it stays sharp at any size.
- The background and stone are cached once per level/resize in `buildStatic()`. Liquids, gems,
  doors, mechanisms, characters and particles draw every frame.
- Sound and particles are triggered by observing state changes, which keeps them robust to rollback.
- The HUD is drawn on the canvas; the menus are DOM.
- The title screen runs a demo of level 1 behind the menu.

### Progress

- Saved in `localStorage` under `sl.progress.v1` as `{unlocked, best: {levelIdx: {t, gems, rank}}}`.
- `?unlock` in the URL unlocks all levels.
- Online, the host's progress decides which levels can be picked.

---

## 4. Levels

Edit `tools/levelgen.py`, then run `python3 tools/levelgen.py`, which writes `shared/levels.js`.
Coordinates are tiles, x 1..38, y 1..28. The outer ring is always wall.

**Map legend:** `#` stone, `/` `\` ramps, `S` `M` `X` sun/moon/shade pools, `a`/`b` spawns,
`A`/`B` doors, `s`/`m` gems, `k` crate, `1-4` plate for group 0-3, `! @ $ %` lever for group 0-3,
`= - _ +` platform cells for group 0-3 (moves given via `mv(g, dx, dy)`).

**DSL helpers:**

| Helper | What it does |
| --- | --- |
| `r` | Fill a rectangle. |
| `clear` | Empty a rectangle. |
| `floor` | Solid floor row. |
| `pool` | Row of pool tiles. |
| `rampR` / `rampL` | Ramp with stone filled underneath. |
| `basin` | Pool sunk one tile, with ramps in and out. |
| `p` | Write a string of map characters. |
| `mv` | Set a group's platform movement. |
| `gate(x, y0, y1, ch, g, slot_top)` | Vertical gate that rises into a stone pillar slot. |
| `floorgate(x, ytop, h, g)` | Gate that sinks into a slot in a thick floor. |
| `plat(x, y, w, h, dx, dy, g, inv)` | Explicit platform, for several directions per group. |

**Platform index order matters** (scripts reference `S.pl[i]`): drawn platform cells come first,
in row-major scan order of their top-left cell, then explicit `plat()` / `floorgate()` entries.

**Level list:**

1. First Light
2. Two Roads
3. Shade Moat
4. Hold the Gate
5. Lever Lift
6. First Crate
7. Crate on the Plate
8. Up and Over
9. Stepping Stones
10. Twin Levers
11. Basins
12. Counterweight
13. Crate Bridge
14. Lift Relay
15. Separate Ways
16. The Climb
17. Crate Lift
18. Ferryman
19. Gatekeepers
20. Galleries
21. Moonrise
22. Crate Ferry
23. Shade Garden
24. Clockwork
25. Drawbridge
26. Pressure Points
27. Eclipse
28. Crate Relay
29. Sunken Halls
30. Twilight Spiral
31. Sanctum Approach
32. Heart of Twilight

**Design rules that keep levels solvable with the current `PHYS`:**
- Vertical steps of 3 tiles or less.
- Flat gaps of 4 tiles or less.
- At least 2 tiles of headroom.
- No ceiling directly over a 3-tile jump (bonking costs height).
- A tall step must be climbable from the side the player arrives from.
- Pools a crate travels through trap the crate at the far edge (crates can't step up).
- A lever must have open floor on both sides. Against a wall it can't be pushed past centre and springs back.
- Never put a lever or plate where a crate or a player's normal route would trip it by accident.
  Several earlier bugs were exactly this.
- Plates must sit on solid floor, not on a pool.
- A crate plate placed directly in front of its gate means the gate stops the crate on the plate.
- Players standing at equal height on a ferry and a shore tile are supported by the tile, not
  carried. They must stand fully on the ferry to ride it.

---

## 5. Verification (all passing at handoff)

```bash
python3 tools/levelgen.py            # regenerate levels
./tools/check-all.sh                 # ~5-10 min on 4 cores: checker on 27 levels + co-op bot on 5
node tools/check-levels.js 12,15     # specific levels; TRACE=1 prints a path to the door
LIMIT=1500000 node tools/check-levels.js 7   # crate levels need a higher state limit
V=1 node tools/coop-bot.js 28        # verbose scripted co-op run
```

- **`check-levels.js`** explores one character with the real physics using macro-actions (walks,
  jumps with air control). The absent partner may flip any mechanism group at any time.
  - Results at handoff: every non-bot level reports `door Y` and all of its own gems for both characters.
  - A pass is necessary but not sufficient: it doesn't model who must stand where.
- **`coop-bot.js`** plays levels 13, 17, 22, 28 and 31 with two scripted players, all winning.
  - Phase builders: `mv`, `push`, `hop`, `hopTo`, `jumpWhen`, `wait`.
  - Gotchas: when walking through a lever, the target must be past the lever tile, or the bot
    overshoots, walks back and reverts the lever. Also keep players out from under descending lifts.
- **Online:** tested with two Playwright contexts: host, join by code, play, compare positions.
  - Prediction tested at 160 ms round-trip with `LAG_MS=80`: no backward snaps on the local player.
- **Playwright:** pre-installed in the sandbox (`require('playwright')`, `chromium.launch()`).
  Start a server on any port, e.g. `PORT=3123 node server/index.js`.

**Not verified:**
- Human playtesting.
- The co-op bot doesn't collect gems: gem reachability comes only from the solo checker.
- Mobile touch UI on real devices.
- Real-world latency on Render.

---

## 6. Git and attribution (user cares about this)

- The user wants commits to appear **only from their account, with no Claude co-author or committer**.
- Local repo config is already set:
  ```
  user/author/committer: Muhammad-B-Sayed <muh.b.sayed@icloud.com>
  ```
- **Do not add `Co-Authored-By: Claude` or `Claude-Session` trailers.** The user explicitly removed
  them, and their instruction overrides the default attribution reminder.
- A session **stop hook** may demand a Claude committer for "Verified" signatures. The user
  rejected that. Leave the commits as theirs; the trade-off is that they show as "Unverified".
- History was force-pushed once, with the user's explicit approval, to rewrite authorship.
  - GitHub's contributors API shows only Muhammad-B-Sayed.
  - The repo sidebar may still show "claude" until GitHub's cache refreshes.
- Don't force-push again without explicit approval (the session's safety rules block it anyway).

---

## 7. Environment limits seen in the cloud sandbox

- Sites blocked by the egress proxy:
  - YouTube, so the gameplay video couldn't be watched.
  - `*.onrender.com`, so the live site can't be curled from the sandbox. Use the Render MCP tools
    (`get_deploy`, `list_logs`) to check deploys.
- The Render connector (`mcp__Render__*`) works, but its tools may only appear partway through a
  session. Always pass `workspaceId`.
- `gh` works only for repo-scoped REST endpoints of attached repos. It can't create repos, and
  GraphQL is blocked.
- The design-plugin MCP servers (Figma, Notion and others) and Discord fail to connect. They
  aren't needed for this project.

---

## 8. Open ideas / next steps (none started)

- **Human playtest** and tuning of `PHYS` to taste. The user's top priority was the original
  game's physics feel. Ask them for feedback on jump height, speed and air control.
- **Level select:** a nicer level map (currently an 8x4 grid). Per-level gem and time stats are
  already stored.
- **Music:** none yet (procedural SFX only).
- **Render:** set the health check path to `/healthz` in the dashboard; the MCP tool lacked the field.
- **Polish:**
  - Remove `window.__app` if you don't want it exposed.
  - Add a `LICENSE` file (`package.json` says MIT, but no file exists).
- **Online robustness:**
  - Reconnect after a socket drop. Currently it returns to the title screen.
  - Spectators or rooms with more than 2 people (not requested).
- **CI:** none. If added, run `node tools/coop-bot.js` and a subset of `check-levels.js`.
  The full set is slow.
