// Movement calibration with the real simulation.
// Builds tiny test rooms in memory and measures what a player can actually do:
// jump arc, the widest gap that can be cleared for each height difference, the
// tallest ledge that can be climbed, stopping distance, and lift boarding.
//
//   node tools/calibrate.js          print the movement envelope
//   JSON=1 node tools/calibrate.js   same numbers as JSON
//
// Units: px (world), tiles (TS=24) and H (player height = 34 px).
import { buildLevel, createState, step, PHYS, TS, COLS, ROWS, TICK_RATE } from '../shared/sim.js';

const R_ = 2, U_ = 4;
const H = PHYS.h;
const FLOOR = 20; // row of the take-off surface

function room(build) {
  const g = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? '#' : '.')));
  const fill = (x0, y0, x1, y1, c = '#') => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1) g[y][x] = c;
  };
  build(g, fill);
  return buildLevel({ name: 'calibration', map: g.map(r => r.join('')) });
}

// One measured jump: Sol starts `runup` tiles before the edge of a ledge whose
// last column is `edge`, holds right, and presses jump once at tick `jt`.
function tryJump(L, jt, maxTicks = 400) {
  const S = createState(L);
  const p = S.p[0];
  let peak = p.y, t = 0;
  for (; t < maxTicks; t++) {
    const bits = R_ | (t === jt ? U_ : 0);
    step(L, S, [bits, 0]);
    peak = Math.min(peak, p.y);
    if (t > jt + 2 && p.gr) break;
  }
  return { p, peak, t };
}

// Widest flat-floor gap (in whole tiles) Sol can clear when the landing is
// `dh` tiles higher (negative = lower) than take-off, after a run-up.
function maxGap(dh, runup) {
  let best = 0;
  const edge = 14;
  for (let gap = 1; gap <= 12; gap++) {
    const land = edge + gap + 1;
    const L = room((g, fill) => {
      fill(1, FLOOR, edge, ROWS - 2);
      fill(land, FLOOR - dh, COLS - 2, ROWS - 2);
      g[FLOOR - 1][edge - runup] = 'a';
      g[FLOOR - 1][2] = 'b';
      g[FLOOR - 1][1] = 'A'; g[FLOOR - 1][3] = 'B';
    });
    let ok = false;
    for (let jt = 0; jt < 160 && !ok; jt++) {
      const { p } = tryJump(L, jt);
      const top = (FLOOR - dh) * TS;
      if (p.gr && Math.abs(p.y + p.h - top) < 1 && p.x >= land * TS - p.w) ok = true;
    }
    if (ok) best = gap; else break;
  }
  return best;
}

// Tallest wall (whole tiles) Sol can climb onto from a standing or running start.
function maxClimb(runup) {
  let best = 0;
  for (let h = 1; h <= 6; h++) {
    const wallX = 16;
    const L = room((g, fill) => {
      fill(1, FLOOR, COLS - 2, ROWS - 2);
      fill(wallX, FLOOR - h, COLS - 2, FLOOR - 1);
      g[FLOOR - 1][wallX - 1 - runup] = 'a';
      g[FLOOR - 1][2] = 'b';
      g[FLOOR - 1][1] = 'A'; g[FLOOR - 1][3] = 'B';
    });
    let ok = false;
    for (let jt = 0; jt < 80 && !ok; jt++) {
      const { p } = tryJump(L, jt);
      if (p.gr && Math.abs(p.y + p.h - (FLOOR - h) * TS) < 1) ok = true;
    }
    if (ok) best = h; else break;
  }
  return best;
}

// Jump arc on open floor (no run-up and full run-up).
function arc(runup) {
  const L = room((g, fill) => {
    fill(1, FLOOR, COLS - 2, ROWS - 2);
    g[FLOOR - 1][3] = 'a'; g[FLOOR - 1][1] = 'b'; g[FLOOR - 1][36] = 'A'; g[FLOOR - 1][37] = 'B';
  });
  const S = createState(L);
  const p = S.p[0];
  for (let k = 0; k < 4; k++) step(L, S, [0, 0]); // land on the floor first
  const y0 = p.y;
  let t = 0, apexT = 0, peak = y0, x0 = 0, xs = 0;
  for (; t < runup; t++) step(L, S, [R_, 0]);
  x0 = p.x; xs = p.vx;
  let air = 0;
  for (let k = 0; k < 200; k++) {
    step(L, S, [R_ | (k === 0 ? U_ : 0), 0]);
    air++;
    if (p.y < peak) { peak = p.y; apexT = k + 1; }
    if (k > 2 && p.gr) break;
  }
  return { height: y0 - peak, apexTicks: apexT, airTicks: air, dist: p.x - x0, speedAtTakeoff: xs };
}

function stopping() {
  const L = room((g, fill) => {
    fill(1, FLOOR, COLS - 2, ROWS - 2);
    g[FLOOR - 1][2] = 'a'; g[FLOOR - 1][1] = 'b'; g[FLOOR - 1][36] = 'A'; g[FLOOR - 1][37] = 'B';
  });
  const S = createState(L);
  const p = S.p[0];
  let t = 0;
  while (p.vx < PHYS.maxSpeed - 1e-6 && t < 200) { step(L, S, [R_, 0]); t++; }
  const accelTicks = t;
  const x0 = p.x;
  let s = 0;
  while (Math.abs(p.vx) > 1e-6 && s < 200) { step(L, S, [0, 0]); s++; }
  return { accelTicks, stopTicks: s, stopDist: p.x - x0 };
}

const f = (px) => `${px.toFixed(1)} px = ${(px / TS).toFixed(2)} tiles = ${(px / H).toFixed(2)} H`;
const sec = (t) => `${t} ticks = ${(t / TICK_RATE).toFixed(3)} s`;

const standArc = arc(0), runArc = arc(40);
const stop = stopping();
const gaps = {};
for (const dh of [3, 2, 1, 0, -1, -2, -3, -4]) gaps[dh] = { run: maxGap(dh, 8), short: maxGap(dh, 1) };
const climb = { standing: maxClimb(0), running: maxClimb(6) };

const out = {
  player: { w: PHYS.w, h: PHYS.h, tile: TS },
  runSpeed: { pxPerTick: PHYS.maxSpeed, HperSec: +(PHYS.maxSpeed * TICK_RATE / H).toFixed(2), ticksToFull: stop.accelTicks },
  stop: { ticks: stop.stopTicks, px: +stop.stopDist.toFixed(1) },
  jump: {
    heightPx: +standArc.height.toFixed(1), heightTiles: +(standArc.height / TS).toFixed(2), heightH: +(standArc.height / H).toFixed(2),
    apexTicks: standArc.apexTicks, airTicks: runArc.airTicks, runningDistPx: +runArc.dist.toFixed(1),
  },
  coyoteTicks: PHYS.coyote, stepUpPx: PHYS.stepUp,
  liftSpeed: { pxPerTick: PHYS.platSpeed, HperSec: +(PHYS.platSpeed * TICK_RATE / H).toFixed(2), secPerTile: +(TS / PHYS.platSpeed / TICK_RATE).toFixed(2) },
  maxGapTiles: gaps,
  maxClimbTiles: climb,
};

if (process.env.JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

console.log('Movement envelope (real simulation)\n');
console.log(`Player box        ${PHYS.w} x ${PHYS.h} px (H = ${H} px, tile = ${TS} px)`);
console.log(`Run speed         ${PHYS.maxSpeed} px/tick = ${out.runSpeed.HperSec} H/s, full speed after ${sec(stop.accelTicks)}`);
console.log(`Stopping          ${sec(stop.stopTicks)}, slides ${f(stop.stopDist)}`);
console.log(`Jump height       ${f(standArc.height)}`);
console.log(`Time to apex      ${sec(standArc.apexTicks)}`);
console.log(`Running jump      ${sec(runArc.airTicks)} in the air, travels ${f(runArc.dist)}`);
console.log(`Coyote time       ${sec(PHYS.coyote)}; step-up ${PHYS.stepUp} px`);
console.log(`Lift speed        ${PHYS.platSpeed} px/tick = ${out.liftSpeed.HperSec} H/s (${out.liftSpeed.secPerTile} s per tile)`);
console.log(`\nWidest gap cleared (whole empty tiles between ledges)`);
console.log('  landing vs take-off   full run-up   1-tile run-up');
for (const dh of Object.keys(gaps).map(Number).sort((a, b) => b - a)) {
  const lbl = dh > 0 ? `${dh} tile${dh > 1 ? 's' : ''} higher` : dh < 0 ? `${-dh} tile${dh < -1 ? 's' : ''} lower` : 'same height';
  console.log(`  ${lbl.padEnd(20)}  ${String(gaps[dh].run).padStart(6)}        ${String(gaps[dh].short).padStart(6)}`);
}
console.log(`\nTallest ledge climbed: ${climb.standing} tiles from standing, ${climb.running} tiles running`);
