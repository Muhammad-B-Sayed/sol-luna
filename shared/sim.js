// Sol & Luna — deterministic shared simulation.
// The exact same code runs in the browser (prediction / local co-op) and on the
// server (authoritative online play). Everything advances in fixed 60 Hz ticks.

export const TS = 24;            // logical tile size (px)
export const COLS = 40;
export const ROWS = 30;
export const WORLD_W = COLS * TS; // 960
export const WORLD_H = ROWS * TS; // 720
export const TICK_RATE = 60;

export const T_EMPTY = 0, T_SOLID = 1, T_SLOPE_R = 2, T_SLOPE_L = 3,
  T_SUN = 4, T_MOON = 5, T_SHADE = 6;
export const POOL_DEPTH = 10;    // pools are floor tiles whose surface is sunk this much

export const IN_LEFT = 1, IN_RIGHT = 2, IN_UP = 4;
export const SOL = 0, LUNA = 1;
export const PH_PLAY = 0, PH_DEAD = 1, PH_WON = 2;

export const PHYS = {
  w: 20, h: 34,
  maxSpeed: 3.25,
  groundAccel: 0.55,
  groundDecel: 0.62,
  turnBoost: 1.7,
  airAccel: 0.4,
  airDecel: 0.1,
  gravity: 0.42,
  jumpVel: 8.25,
  maxFall: 9.5,
  coyote: 5,
  stepUp: 14,
  snap: 8,
  pushSpeed: 1.85,
  boxSize: 26,
  platSpeed: 1.6,
};

export const DEATH_TICKS = 80;
const EPS = 0.001;

const isBlock = (t) => t === T_SOLID || t >= T_SUN;
const isSlope = (t) => t === T_SLOPE_R || t === T_SLOPE_L;
const blockTop = (t, ty) => ty * TS + (t >= T_SUN ? POOL_DEPTH : 0);

export function tileAt(L, tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return T_SOLID;
  return L.tiles[ty * COLS + tx];
}

function slopeY(t, tx, ty, cx) {
  let lx = cx - tx * TS;
  lx = lx < 0 ? 0 : lx > TS ? TS : lx;
  return t === T_SLOPE_R ? ty * TS + TS - lx : ty * TS + lx;
}

// ---------------------------------------------------------------------------
// Level parsing

const CH = {
  '#': T_SOLID, '/': T_SLOPE_R, '\\': T_SLOPE_L,
  'S': T_SUN, 'M': T_MOON, 'X': T_SHADE,
};

export function buildLevel(raw, index = 0) {
  const rows = raw.map;
  if (rows.length !== ROWS) throw new Error(`Level ${index + 1} "${raw.name}": expected ${ROWS} rows, got ${rows.length}`);
  const tiles = new Uint8Array(COLS * ROWS);
  const L = {
    index, name: raw.name, par: raw.par || 60, hint: raw.hint || '',
    tiles, spawns: [null, null], doors: [null, null], gems: [], buttons: [], levers: [], plats: [], boxes: [],
  };
  const platCells = [];
  for (let y = 0; y < ROWS; y++) {
    const row = rows[y];
    if (row.length !== COLS) throw new Error(`Level ${index + 1} "${raw.name}": row ${y} has ${row.length} cols`);
    for (let x = 0; x < COLS; x++) {
      const c = row[x];
      if (CH[c] !== undefined) { tiles[y * COLS + x] = CH[c]; continue; }
      const cx = (x + 0.5) * TS, floor = (y + 1) * TS;
      switch (c) {
        case 'a': L.spawns[SOL] = { x: cx - PHYS.w / 2, y: floor - PHYS.h }; break;
        case 'b': L.spawns[LUNA] = { x: cx - PHYS.w / 2, y: floor - PHYS.h }; break;
        case 'A': L.doors[SOL] = { cx, bottom: floor }; break;
        case 'B': L.doors[LUNA] = { cx, bottom: floor }; break;
        case 's': L.gems.push({ x: cx, y: (y + 0.5) * TS, kind: SOL }); break;
        case 'm': L.gems.push({ x: cx, y: (y + 0.5) * TS, kind: LUNA }); break;
        case 'k': L.boxes.push({ x: cx - PHYS.boxSize / 2, y: floor - PHYS.boxSize }); break;
        case '1': case '2': case '3': case '4':
          L.buttons.push({ x: x * TS - 4, w: TS + 8, floor, g: c.charCodeAt(0) - 49 }); break;
        case '!': case '@': case '$': case '%': {
          const g = '!@$%'.indexOf(c);
          L.levers.push({ x: x * TS, y: y * TS, floor, g, on0: !!(raw.leverOn && raw.leverOn.includes(g)) }); break;
        }
        case '=': case '-': case '_': case '+': platCells.push([x, y, '=-_+'.indexOf(c)]); break;
        case '.': case ' ': break;
        default: throw new Error(`Level ${index + 1}: unknown char '${c}' at ${x},${y}`);
      }
    }
  }
  // group drawn platform cells into rectangles (connected components → bounding box)
  const seen = new Set();
  for (const [x, y, g] of platCells) {
    const k0 = `${x},${y}`;
    if (seen.has(k0)) continue;
    let minX = x, maxX = x, minY = y, maxY = y;
    const stack = [[x, y]]; seen.add(k0);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        if (platCells.some(([px, py, pg]) => px === nx && py === ny && pg === g)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    const mv = (raw.moves && raw.moves[g]) || [0, 0];
    const inv = !!(raw.inv && raw.inv.includes(g));
    const w = (maxX - minX + 1), h = (maxY - minY + 1);
    const dx = mv[0], dy = mv[1];
    L.plats.push({ x0: minX * TS, y0: minY * TS, x1: (minX + dx) * TS, y1: (minY + dy) * TS, w: w * TS, h: h * TS, g, inv,
      len: Math.hypot(dx * TS, dy * TS) || 1 });
  }
  for (const [x, y, g] of raw.buttons || []) L.buttons.push({ x: x * TS - 4, w: TS + 8, floor: (y + 1) * TS, g });
  for (const [x, y, g, on] of raw.levers || []) L.levers.push({ x: x * TS, y: y * TS, floor: (y + 1) * TS, g, on0: !!on });
  for (const [x, y, w, h, dx, dy, g, inv] of raw.plats || []) {
    L.plats.push({ x0: x * TS, y0: y * TS, x1: (x + dx) * TS, y1: (y + dy) * TS, w: w * TS, h: h * TS, g, inv: !!inv,
      len: Math.hypot(dx * TS, dy * TS) || 1 });
  }
  if (!L.spawns[0] || !L.spawns[1] || !L.doors[0] || !L.doors[1]) throw new Error(`Level ${index + 1}: missing spawn or door`);
  L.groups = 1 + Math.max(0, ...L.buttons.map(b => b.g), ...L.levers.map(l => l.g), ...L.plats.map(p => p.g));
  return L;
}

// ---------------------------------------------------------------------------
// State

function mkPlayer(sp, i) {
  return { id: 200 + i, x: sp.x, y: sp.y, w: PHYS.w, h: PHYS.h, vx: 0, vy: 0, gr: false, gref: -1,
    coy: 0, face: i === SOL ? 1 : -1, jumpN: 0, push: 0, atDoor: false, alive: true };
}

export function createState(L) {
  return {
    tick: 0, phase: PH_PLAY, phaseT: 0, deadWho: -1, tries: 0,
    p: [mkPlayer(L.spawns[0], 0), mkPlayer(L.spawns[1], 1)],
    b: L.boxes.map((b, i) => ({ id: 100 + i, x: b.x, y: b.y, w: PHYS.boxSize, h: PHYS.boxSize, vx: 0, vy: 0, gr: false, gref: -1 })),
    pl: L.plats.map(p => {
      // start at rest: account for inverted platforms and levers that begin switched on
      const act = L.levers.some(l => l.on0 && l.g === p.g) ? 1 : 0;
      const t = act ^ (p.inv ? 1 : 0);
      return { t, x: t ? p.x1 : p.x0, y: t ? p.y1 : p.y0 };
    }),
    lv: L.levers.map(l => (l.on0 ? 1 : -1)),
    gm: L.gems.map(() => 0),
    dr: [0, 0],
    btn: L.buttons.map(() => 0),
    act: new Array(L.groups).fill(0),
  };
}

export function cloneState(S) {
  return JSON.parse(JSON.stringify(S));
}

// ---------------------------------------------------------------------------
// Collision world

function makeWorld(L, S) {
  const solids = [];
  S.pl.forEach((p, i) => solids.push({ o: p, id: i, w: L.plats[i].w, h: L.plats[i].h, box: false }));
  S.b.forEach((b) => solids.push({ o: b, id: b.id, w: b.w, h: b.h, box: true }));
  return { L, S, solids, ents: [...S.p, ...S.b] };
}

const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw - EPS && ax + aw > bx + EPS && ay < by + bh - EPS && ay + ah > by + EPS;

function tileFree(L, x, y, w, h) {
  const tx0 = Math.floor((x + EPS) / TS), tx1 = Math.floor((x + w - EPS) / TS);
  const ty0 = Math.floor((y + EPS) / TS), ty1 = Math.floor((y + h - EPS) / TS);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = tileAt(L, tx, ty);
    if (isBlock(t) && y + h > blockTop(t, ty) + EPS) return false;
  }
  return true;
}

function solidsFree(W, x, y, w, h, selfId, ignore) {
  for (const s of W.solids) {
    if (s.id === selfId || s.id === ignore) continue;
    if (overlaps(x, y, w, h, s.o.x, s.o.y, s.w, s.h)) return false;
  }
  return true;
}

// Horizontal move with tile + dynamic-solid resolution, step-ups and box pushing.
function moveX(W, e, dx, ignore, depth) {
  if (!dx) return;
  const L = W.L;
  const ox = e.x;
  e.x += dx;
  const canStep = e.id >= 200 && e.gr;
  // --- tiles: leading column
  {
    const top = e.y, bot = e.y + e.h;
    const tx = dx > 0 ? Math.floor((e.x + e.w - EPS) / TS) : Math.floor((e.x + EPS) / TS);
    const ty0 = Math.floor((top + EPS) / TS), ty1 = Math.floor((bot - EPS) / TS);
    let minTop = Infinity;
    for (let ty = ty0; ty <= ty1; ty++) {
      const t = tileAt(L, tx, ty);
      if (!isBlock(t)) continue;
      const bt = blockTop(t, ty);
      if (bot > bt + EPS) minTop = Math.min(minTop, bt);
    }
    if (minTop < Infinity) {
      const need = bot - minTop;
      if (canStep && need <= PHYS.stepUp && tileFree(L, e.x, minTop - e.h, e.w, e.h) &&
          solidsFree(W, e.x, minTop - e.h, e.w, e.h, e.id, ignore)) {
        e.y = minTop - e.h;
      } else {
        e.x = dx > 0 ? tx * TS - e.w : (tx + 1) * TS;
        e.vx = 0;
      }
    }
  }
  // --- slopes under the centre: walk up onto them (e.g. leaving a pool basin)
  if (canStep) {
    const cx = e.x + e.w / 2, ctx = Math.floor(cx / TS), bot = e.y + e.h;
    for (let ty = Math.floor((bot - TS) / TS); ty <= Math.floor(bot / TS); ty++) {
      const t = tileAt(L, ctx, ty);
      if (!isSlope(t)) continue;
      const sy = slopeY(t, ctx, ty, cx);
      if (bot > sy && bot - sy <= PHYS.stepUp) { e.y = sy - e.h; break; }
    }
  }
  // --- dynamic solids
  for (const s of W.solids) {
    if (s.id === e.id || s.id === ignore) continue;
    const so = s.o;
    if (!overlaps(e.x, e.y, e.w, e.h, so.x, so.y, s.w, s.h)) continue;
    if (overlaps(ox, e.y, e.w, e.h, so.x, so.y, s.w, s.h)) continue; // already inside: don't fight it
    if (s.box && depth < 3) {
      const want = dx > 0 ? e.x + e.w - so.x : e.x - (so.x + s.w);
      moveEnt(W, so, want, 0, e.id, depth + 1);
      if (e.id >= 200) e.push = 2;
      if (!overlaps(e.x, e.y, e.w, e.h, so.x, so.y, s.w, s.h)) continue;
    } else if (!s.box && canStep) {
      const need = e.y + e.h - so.y;
      if (need > 0 && need <= PHYS.stepUp && tileFree(L, e.x, so.y - e.h, e.w, e.h) &&
          solidsFree(W, e.x, so.y - e.h, e.w, e.h, e.id, ignore)) { e.y = so.y - e.h; continue; }
    }
    e.x = dx > 0 ? so.x - e.w : so.x + s.w;
    e.vx = 0;
  }
}

// Vertical move. Returns true if landed on something (sets e.gref).
function moveY(W, e, dy, ignore) {
  if (!dy) return false;
  const L = W.L;
  const prevTop = e.y, prevBot = e.y + e.h;
  e.y += dy;
  if (dy > 0) {
    const bot = e.y + e.h;
    let best = Infinity, ref = -1;
    const tx0 = Math.floor((e.x + EPS) / TS), tx1 = Math.floor((e.x + e.w - EPS) / TS);
    const ty0 = Math.floor((prevBot - TS) / TS), ty1 = Math.floor(bot / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = tileAt(L, tx, ty);
      if (!isBlock(t)) continue;
      const bt = blockTop(t, ty);
      if (prevBot <= bt + EPS && bot > bt && bt < best) { best = bt; ref = -1; }
    }
    // slopes are sampled under the entity's centre
    const cx = e.x + e.w / 2, ctx = Math.floor(cx / TS);
    for (let ty = ty0; ty <= ty1 + 1; ty++) {
      const t = tileAt(L, ctx, ty);
      if (!isSlope(t)) continue;
      const sy = slopeY(t, ctx, ty, cx);
      if (prevBot <= sy + 6 && bot > sy && sy < best) { best = sy; ref = -1; }
    }
    for (const s of W.solids) {
      if (s.id === e.id || s.id === ignore) continue;
      const so = s.o;
      if (!(e.x < so.x + s.w - EPS && e.x + e.w > so.x + EPS)) continue;
      if (prevBot <= so.y + EPS && bot > so.y && so.y < best) { best = so.y; ref = s.id; }
    }
    if (best < Infinity) {
      e.y = best - e.h; e.vy = 0; e.gref = ref;
      return true;
    }
    return false;
  } else {
    const top = e.y;
    let best = -Infinity;
    const tx0 = Math.floor((e.x + EPS) / TS), tx1 = Math.floor((e.x + e.w - EPS) / TS);
    const ty0 = Math.floor(top / TS), ty1 = Math.floor((prevTop - EPS) / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = tileAt(L, tx, ty);
      if (!isBlock(t) && !isSlope(t)) continue;
      const bb = (ty + 1) * TS;
      if (prevTop >= bb - EPS && top < bb && bb > best) best = bb;
    }
    for (const s of W.solids) {
      if (s.id === e.id || s.id === ignore) continue;
      const so = s.o;
      if (!(e.x < so.x + s.w - EPS && e.x + e.w > so.x + EPS)) continue;
      const sb = so.y + s.h;
      if (prevTop >= sb - EPS && top < sb && sb > best) best = sb;
    }
    if (best > -Infinity) { e.y = best; if (e.vy < 0) e.vy = 0; }
    return false;
  }
}

// Move an entity and carry whatever stands on it.
function moveEnt(W, e, dx, dy, ignore, depth = 0) {
  const ox = e.x, oy = e.y;
  if (dx) moveX(W, e, dx, ignore, depth);
  if (dy) moveY(W, e, dy, ignore);
  carryRiders(W, e.id, e.x - ox, e.y - oy, depth);
}

function carryRiders(W, id, ax, ay, depth) {
  if ((!ax && !ay) || depth > 4) return;
  for (const r of W.ents) {
    if (r.gref !== id || r.id === id) continue;
    if (r.id >= 200 && !r.alive) continue;
    if (ax) moveEnt(W, r, ax, 0, id, depth + 1);
    if (ay > 0) { const oy = r.y; r.y += ay; carryRiders(W, r.id, 0, r.y - oy, depth + 1); }
    else if (ay < 0) { const oy = r.y; moveY(W, r, ay, id); carryRiders(W, r.id, 0, r.y - oy, depth + 1); }
  }
}

// ---------------------------------------------------------------------------
// Step

function stepPlats(W) {
  const { L, S } = W;
  for (let i = 0; i < L.plats.length; i++) {
    const P = L.plats[i], st = S.pl[i];
    const on = (S.act[P.g] ? 1 : 0) ^ (P.inv ? 1 : 0);
    const target = on ? 1 : 0;
    if (st.t === target) continue;
    const step = PHYS.platSpeed / P.len;
    const nt = target > st.t ? Math.min(1, st.t + step) : Math.max(0, st.t - step);
    const nx = P.x0 + (P.x1 - P.x0) * nt, ny = P.y0 + (P.y1 - P.y0) * nt;
    const dx = nx - st.x, dy = ny - st.y;
    const ox = st.x, oy = st.y, ot = st.t;
    st.x = nx; st.y = ny; st.t = nt;
    // carry riders first
    carryRiders(W, i, dx, dy, 0);
    // push anything we now overlap
    let blocked = false;
    for (const e of W.ents) {
      if (e.id >= 200 && !e.alive) continue;
      if (!overlaps(e.x, e.y, e.w, e.h, st.x, st.y, P.w, P.h)) continue;
      if (dy < 0) moveEnt(W, e, 0, st.y - (e.y + e.h), i);
      else if (dy > 0) moveEnt(W, e, 0, st.y + P.h - e.y, i);
      if (dx > 0 && overlaps(e.x, e.y, e.w, e.h, st.x, st.y, P.w, P.h)) moveEnt(W, e, st.x + P.w - e.x, 0, i);
      else if (dx < 0 && overlaps(e.x, e.y, e.w, e.h, st.x, st.y, P.w, P.h)) moveEnt(W, e, st.x - (e.x + e.w), 0, i);
      if (overlaps(e.x, e.y, e.w, e.h, st.x, st.y, P.w, P.h)) blocked = true;
    }
    if (blocked) { st.x = ox; st.y = oy; st.t = ot; }
  }
}

function stepBoxes(W) {
  for (const b of W.S.b) {
    const ox = b.x;
    b.vy = Math.min(b.vy + PHYS.gravity, PHYS.maxFall);
    const ref = b.gref;
    b.gr = false;
    const oy = b.y;
    const landed = moveY(W, b, b.vy, -999);
    if (landed) b.gr = true; else b.gref = -1;
    if (!landed && ref !== -1) b.gref = -1;
    carryRiders(W, b.id, 0, b.y - oy, 1);
    b.vx = b.x - (b._px ?? ox);
    b._px = b.x;
  }
}

function stepPlayer(W, p, bits) {
  const { L } = W;
  if (!p.alive) return;
  const dir = ((bits & IN_RIGHT) ? 1 : 0) - ((bits & IN_LEFT) ? 1 : 0);
  if (dir) {
    let a = p.gr ? PHYS.groundAccel : PHYS.airAccel;
    if (p.vx * dir < 0) a *= PHYS.turnBoost;
    p.vx += dir * a;
    const max = p.push > 0 ? PHYS.pushSpeed : PHYS.maxSpeed;
    if (p.vx > max) p.vx = Math.max(max, p.vx - PHYS.groundDecel);
    if (p.vx < -max) p.vx = Math.min(-max, p.vx + PHYS.groundDecel);
    p.face = dir;
  } else {
    const d = p.gr ? PHYS.groundDecel : PHYS.airDecel;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - d) : Math.min(0, p.vx + d);
  }
  if (p.push > 0) p.push--;
  const wasGr = p.gr;
  moveX(W, p, p.vx, -999, 0);

  let jumped = false;
  if ((bits & IN_UP) && (p.gr || p.coy > 0) && p.vy >= 0) {
    p.vy = -PHYS.jumpVel; p.gr = false; p.coy = 0; p.jumpN++; jumped = true; p.gref = -1;
  }
  p.vy = Math.min(p.vy + PHYS.gravity, PHYS.maxFall);
  let landed = moveY(W, p, p.vy, -999);
  if (!landed && wasGr && !jumped && p.vy >= 0) {
    const sy = p.y, svy = p.vy, sref = p.gref;
    if (moveY(W, p, PHYS.snap, -999)) landed = true;
    else { p.y = sy; p.vy = svy; p.gref = sref; }
  }
  p.gr = landed;
  if (landed) p.coy = PHYS.coyote; else { p.gref = -1; if (p.coy > 0) p.coy--; }
}

function hostileTo(t, who) {
  if (t === T_SHADE) return true;
  if (t === T_SUN) return who === LUNA;
  if (t === T_MOON) return who === SOL;
  return false;
}

function checkHazards(W, p, who) {
  const L = W.L;
  const bot = p.y + p.h;
  const tx0 = Math.floor((p.x + 5) / TS), tx1 = Math.floor((p.x + p.w - 5) / TS);
  const ty = Math.floor((bot - 1) / TS);
  for (let tx = tx0; tx <= tx1; tx++) {
    const t = tileAt(L, tx, ty);
    if (t >= T_SUN && hostileTo(t, who) && bot >= ty * TS + 3) return true;
  }
  return false;
}

function updateMechanisms(W) {
  const { L, S } = W;
  // levers (pushed by moving players or boxes)
  for (let i = 0; i < L.levers.length; i++) {
    const lv = L.levers[i];
    let touched = false;
    for (const e of W.ents) {
      if (e.id >= 200 && !e.alive) continue;
      if (!overlaps(e.x, e.y, e.w, e.h, lv.x, lv.y + 2, TS, TS - 2)) continue;
      const vx = e.vx;
      if (vx > 0.3) { S.lv[i] = Math.min(1, S.lv[i] + 0.22); touched = true; }
      else if (vx < -0.3) { S.lv[i] = Math.max(-1, S.lv[i] - 0.22); touched = true; }
    }
    // once pushed past the middle the handle springs the rest of the way
    if (!touched && Math.abs(S.lv[i]) < 1) {
      const v = S.lv[i];
      S.lv[i] = v >= 0 ? Math.min(1, v + 0.12) : Math.max(-1, v - 0.12);
    }
  }
  // buttons
  for (let i = 0; i < L.buttons.length; i++) {
    const bt = L.buttons[i];
    let pressed = 0;
    for (const e of W.ents) {
      if (e.id >= 200 && !e.alive) continue;
      const bot = e.y + e.h;
      if (bot >= bt.floor - 5 && bot <= bt.floor + 1 && e.x < bt.x + bt.w - 6 && e.x + e.w > bt.x + 6) { pressed = 1; break; }
    }
    S.btn[i] = pressed;
  }
  S.act.fill(0);
  L.buttons.forEach((b, i) => { if (S.btn[i]) S.act[b.g] = 1; });
  L.levers.forEach((l, i) => { if (S.lv[i] > 0) S.act[l.g] = 1; });
}

export function step(L, S, inputs) {
  S.tick++;
  if (S.phase === PH_DEAD) {
    S.phaseT++;
    if (S.phaseT >= DEATH_TICKS) {
      const tries = S.tries + 1;
      Object.assign(S, createState(L));
      S.tries = tries;
    }
    return S;
  }
  if (S.phase === PH_WON) { S.phaseT++; return S; }

  const W = makeWorld(L, S);
  updateMechanisms(W);
  stepPlats(W);
  stepBoxes(W);
  stepPlayer(W, S.p[0], inputs[0] | 0);
  stepPlayer(W, S.p[1], inputs[1] | 0);

  // gems
  for (let i = 0; i < L.gems.length; i++) {
    if (S.gm[i]) continue;
    const g = L.gems[i], p = S.p[g.kind];
    const nx = Math.max(p.x, Math.min(g.x, p.x + p.w)), ny = Math.max(p.y, Math.min(g.y, p.y + p.h));
    if ((nx - g.x) ** 2 + (ny - g.y) ** 2 < 11 * 11) S.gm[i] = 1;
  }
  // hazards
  for (let i = 0; i < 2; i++) {
    const p = S.p[i];
    if (p.alive && checkHazards(W, p, i)) {
      p.alive = false; S.phase = PH_DEAD; S.phaseT = 0; S.deadWho = i;
      return S;
    }
  }
  // doors
  let both = true;
  for (let i = 0; i < 2; i++) {
    const p = S.p[i], d = L.doors[i];
    p.atDoor = p.gr && Math.abs(p.x + p.w / 2 - d.cx) < 11 && Math.abs(p.y + p.h - d.bottom) < 4;
    S.dr[i] = p.atDoor ? Math.min(1, S.dr[i] + 0.06) : Math.max(0, S.dr[i] - 0.06);
    if (S.dr[i] < 1) both = false;
  }
  if (both) { S.phase = PH_WON; S.phaseT = 0; }
  return S;
}

// Time in seconds (excludes the current attempt's death animation).
export const timeOf = (S) => S.tick / TICK_RATE;

export function rankFor(L, seconds, gemsTaken, gemsTotal) {
  const allGems = gemsTaken >= gemsTotal;
  const fast = seconds <= L.par;
  if (allGems && fast) return 'A';
  if (allGems || fast) return 'B';
  return 'C';
}

// ---------------------------------------------------------------------------
// Tooling hook (level checker): advance one player with mechanism groups
// forced to `act` (bitmask). The other player is removed. Returns true on death.
export function stepSoloForced(L, S, who, bits, act) {
  const other = S.p[1 - who];
  other.alive = false; other.x = -1000; other.y = -1000;
  for (let g = 0; g < S.act.length; g++) S.act[g] = (act >> g) & 1;
  const W = makeWorld(L, S);
  stepPlats(W);
  stepBoxes(W);
  stepPlayer(W, S.p[who], bits);
  return checkHazards(W, S.p[who], who);
}

// Tooling hook (level checker, dependency mode): advance one player with the
// REAL mechanisms (their own plates, levers and crates count), except that the
// groups in `forceMask` are overridden by the matching bits of `forceAct`,
// standing in for a partner who may only help with those groups.
// forceMask = 0 means the character is completely alone. Returns true on death.
export function stepSoloMixed(L, S, who, bits, forceMask, forceAct) {
  const other = S.p[1 - who];
  other.alive = false; other.x = -1000; other.y = -1000;
  const W = makeWorld(L, S);
  updateMechanisms(W);
  for (let g = 0; g < S.act.length; g++) if ((forceMask >> g) & 1) S.act[g] = (forceAct >> g) & 1;
  stepPlats(W);
  stepBoxes(W);
  stepPlayer(W, S.p[who], bits);
  return checkHazards(W, S.p[who], who);
}
