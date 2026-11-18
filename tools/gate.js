// The level gate. A level is done when every line here passes.
//
//   node tools/gate.js 5          one level
//   node tools/gate.js 1,2,3      several
//   node tools/gate.js            every built level
//   FAST=1 node tools/gate.js 5   skip the slow solo check while iterating
//
// It measures the things the redesign is about (docs/level-plan.md):
//   LAYOUT  the room fills the 38x28 screen with stacked, broken-up terrain
//   ROUTE   the winning route takes both players over most of the screen
//   DEPTH   the level is as long and as busy as its place in the campaign needs
//   CO-OP   the bot wins with every gem, and neither player can finish alone
//   ROOF    no climb or crossing on the bot's route hits the roof (the jump gets its full arc)
import { LEVELS } from '../shared/levels.js';
import { buildLevel, PLAT_CH } from '../shared/sim.js';
import { runScript, roofWatcher } from './botlib.js';
import { loadScripts } from './coop-bot.js';
import { explore } from './check-levels.js';

// Requirements by tier. Tier = levels 1-4, 5-8, ... 29-32.
const TIERS = {
  // Bot time is a weak measure (the bot is fast and never thinks), so these floors are low on
  // purpose. Depth comes from the chain: control uses, role swaps, objects. Never pad with gems.
  minSecs:     [30, 38, 45, 52, 60, 68, 76, 85],      // bot time, players taking turns, all gems
  minEdges:    [4, 6, 8, 10, 12, 14, 17, 20],         // plate presses + lever flips in the bot run
  minControls: [3, 4, 5, 6, 6, 7, 8, 8],              // plates + levers
  minGems:     [4, 4, 6, 6, 6, 8, 8, 8],
  maxGems:     [8, 8, 10, 10, 10, 12, 12, 12],        // gems are for detours, not for filling time
  minCover:    [21, 22, 22, 22, 23, 23, 23, 23],      // of 24 screen sectors visited by either player
  minCoverEach:[12, 13, 14, 14, 15, 15, 16, 16],      // sectors visited by each player
  minFloorRows:[6, 6, 7, 7, 8, 8, 8, 8],              // distinct floor heights
};
export const tierOf = (n) => Math.min(7, Math.floor((n - 1) / 4));
export const need = (n, k) => TIERS[k][tierOf(n)];

const SOLID = new Set(['#', '/', '\\', 'S', 'M', 'X', ...PLAT_CH]);

export function layout(raw) {
  const M = raw.map;
  const solid = (x, y) => SOLID.has(M[y][x]);
  let nSolid = 0;
  for (let y = 1; y <= 28; y++) for (let x = 1; x <= 38; x++) if (solid(x, y)) nSolid++;
  // standable: a solid cell with two free cells above it
  const stand = (x, y) => y >= 3 && solid(x, y) && !solid(x, y - 1) && !solid(x, y - 2);
  const stone = (x, y) => M[y][x] === '#';   // pools, ramps and platforms break a flat run
  const rows = [], wide = [];
  let longest = 0, longestAt = null;
  const sectors = new Set();
  for (let y = 3; y <= 29; y++) {
    let n = 0, runLen = 0;
    for (let x = 1; x <= 38; x++) {
      if (stand(x, y) && stone(x, y)) { runLen++; if (runLen > longest) { longest = runLen; longestAt = [x - runLen + 1, y]; } } else runLen = 0;
      if (stand(x, y)) {
        n++;
        sectors.add(Math.min(3, Math.floor((y - 2) / 28 * 4)) * 6 + Math.min(5, Math.floor((x - 1) / 38 * 6)));
      }
    }
    if (n >= 3) rows.push(y);
    if (n >= 24) wide.push(y);
  }
  // largest all-empty rectangle (histogram method)
  const hgt = new Array(40).fill(0);
  let maxRect = 0, rectAt = null;
  for (let y = 1; y <= 28; y++) {
    for (let x = 1; x <= 38; x++) hgt[x] = solid(x, y) ? 0 : hgt[x] + 1;
    for (let x = 1; x <= 38; x++) {
      let h = hgt[x];
      for (let x2 = x; x2 <= 38 && hgt[x2] > 0; x2++) {
        h = Math.min(h, hgt[x2]);
        const a = h * (x2 - x + 1);
        if (a > maxRect) { maxRect = a; rectAt = `${x2 - x + 1}x${h} at (${x},${y - h + 1})`; }
      }
    }
  }
  const flat = M.join('');
  const count = (re) => (flat.match(re) || []).length;
  return {
    solidPct: Math.round(nSolid / 1064 * 100), rows, span: rows.length ? rows[rows.length - 1] - rows[0] : 0,
    longest, longestAt, wide, maxRect, rectAt, floorSectors: sectors.size,
    controls: count(/[1-6!@$%^&]/g) + (raw.buttons || []).length + (raw.levers || []).length,
    crates: count(/k/g), sunGems: count(/s/g), moonGems: count(/m/g),
  };
}

export function gate(n, SCRIPTS, { fast = false } = {}) {
  const raw = LEVELS[n - 1];
  const out = [];
  let ok = true;
  const line = (pass, group, text) => { if (!pass) ok = false; out.push(`  ${pass ? 'ok  ' : 'FAIL'} ${group.padEnd(7)} ${text}`); };
  if (raw.stub) return { ok: false, text: `${n} not built yet` };
  const lay = layout(raw);

  line(lay.solidPct >= 25 && lay.solidPct <= 65, 'LAYOUT', `stone fills ${lay.solidPct}% of the screen (need 25-65%)`);
  line(lay.maxRect <= 120, 'LAYOUT', `largest empty block is ${lay.maxRect} cells, ${lay.rectAt} (max 120: floors 7 rows apart leave 6-high spaces)`);
  line(lay.rows.length >= need(n, 'minFloorRows') && lay.span >= 20, 'LAYOUT', `${lay.rows.length} floor heights spanning ${lay.span} rows (need ${need(n, 'minFloorRows')}+ heights, 20+ rows): rows ${lay.rows.join(',')}`);
  line(lay.longest <= 18, 'LAYOUT', `longest unbroken flat stone floor is ${lay.longest} cells${lay.longestAt ? ` at (${lay.longestAt})` : ''} (max 18)`);
  line(lay.wide.length <= 1, 'LAYOUT', `${lay.wide.length} floor(s) run nearly the full width${lay.wide.length ? ' (rows ' + lay.wide.join(',') + ')' : ''} (max 1: stacked full-width slabs are what this redesign removes)`);
  line(lay.floorSectors >= 21, 'LAYOUT', `${lay.floorSectors}/24 screen sectors have floor to stand on (need 21+)`);
  line(lay.controls >= need(n, 'minControls'), 'DEPTH', `${lay.controls} plates and levers (need ${need(n, 'minControls')}+)`);
  { const g = lay.sunGems + lay.moonGems;
    line(lay.sunGems >= 2 && lay.moonGems >= 2 && g >= need(n, 'minGems') && g <= need(n, 'maxGems') && Math.abs(lay.sunGems - lay.moonGems) <= 1, 'DEPTH', `${lay.sunGems} sun and ${lay.moonGems} moon gems (need ${need(n, 'minGems')}-${need(n, 'maxGems')} total, the two counts within 1 of each other)`); }

  if (!SCRIPTS[n]) line(false, 'CO-OP', 'no bot script for this level');
  else {
    const roof = roofWatcher();
    const r = runScript(n, SCRIPTS[n], { onTick: roof.onTick });
    line(r.ok, 'CO-OP', `bot: ${r.msg}`);
    { const h = [...roof.hits.keys()];
      line(!r.ok || h.length === 0, 'ROOF', `${h.length} climb(s) or crossing(s) on the route hit the roof (need 0; a full jump needs 6 free rows)${h.length ? '\n' + h.slice(0, 6).map(k => '         ' + k).join('\n') + (h.length > 6 ? `\n         ... ${h.length - 6} more (node tools/check-headroom.js ${n})` : '') : ''}`); }
    const st = r.stats;
    if (r.ok && st) {
      line(st.gems === st.gemsTotal, 'CO-OP', `bot collects ${st.gems}/${st.gemsTotal} gems (need all)`);
      line(st.cover >= need(n, 'minCover'), 'ROUTE', `players visit ${st.cover}/24 screen sectors (need ${need(n, 'minCover')}+)`);
      line(st.coverSol >= need(n, 'minCoverEach') && st.coverLuna >= need(n, 'minCoverEach'), 'ROUTE', `Sol visits ${st.coverSol}, Luna ${st.coverLuna} (need ${need(n, 'minCoverEach')}+ each)`);
      line(st.secs >= need(n, 'minSecs'), 'DEPTH', `bot needs ${st.secs.toFixed(0)}s (need ${need(n, 'minSecs')}s+)`);
      line(st.edges >= need(n, 'minEdges'), 'DEPTH', `plates and levers are used ${st.edges} times (need ${need(n, 'minEdges')}+)`);
      const lo = Math.round(st.secs * 1.3), hi = Math.round(st.secs * 1.8);   // rank A must be within a human pair's reach: about 1.5 times the bot
      line(raw.par >= lo && raw.par <= hi, 'DEPTH', `par ${raw.par}s against bot ${st.secs.toFixed(0)}s (set par between ${lo} and ${hi})`);
    }
  }
  if (fast) out.push('  skip CO-OP   solo check skipped (FAST=1)');
  else {
    const L = buildLevel(raw, n - 1);
    const limit = +(process.env.LIMIT || (L.boxes.length ? 500000 : 300000));   // bounded so three gates fit in 8 GB
    for (const who of [0, 1]) {
      const r = explore(L, who, { help: 'none', limit, stopAtDoor: true });
      line(!r.door, 'CO-OP', `${who ? 'Luna' : 'Sol'} alone: ${r.door ? 'reaches the door, the level does not need both players' : 'cannot finish'} (${r.states} states${r.truncated ? ', search limit hit' : ''})`);
    }
  }
  return { ok, text: `${n} ${raw.name}: ${ok ? 'PASS' : 'FAIL'}\n${out.join('\n')}` };
}

const { SCRIPTS, errors } = await loadScripts();
errors.forEach(e => console.error(e));
const which = process.argv[2] ? process.argv[2].split(',').map(Number) : LEVELS.map((l, i) => i + 1).filter(n => !LEVELS[n - 1].stub);
let bad = 0;
for (const n of which) {
  const r = gate(n, SCRIPTS, { fast: !!process.env.FAST });
  console.log(r.text);
  if (!r.ok) bad++;
}
console.log(bad ? `\n${bad} level(s) fail the gate.` : `\n${which.length} level(s) pass the gate.`);
process.exitCode = bad ? 1 : 0;   // not process.exit(): that drops output when stdout is a pipe
