// Summarize JSON files written by tools/check-netcode.js (JSON=file): one row per runner, and
// one per file for co-op and Dodgeball.
//   node tools/net-summary.js before.json after.json ...
import fs from 'node:fs';

const rows = [], coopRows = [], dodgeRows = [];
for (const f of process.argv.slice(2)) {
  const runs = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const kind of ['2d', '3d']) {
    const rs = runs.filter(r => r.kind === kind);
    if (!rs.length) continue;
    const cs = rs.flatMap(r => r.clients);
    const sum = (g) => cs.reduce((a, c) => a + g(c), 0), max = (g) => cs.reduce((a, c) => Math.max(a, g(c)), 0);
    const secs = rs.reduce((a, r) => a + Math.max(0, (r.server.tick - 180) / 60), 0);
    rows.push({
      file: f.split('/').pop(), kind, matches: rs.length, playSecs: Math.round(secs),
      killedByNet: rs.filter(r => r.server.lostEarly).length,
      falseDeaths: sum(c => c.falseDead[0] + c.falseDead[1]), falseWins: sum(c => c.falseOver), undone: sum(c => c.undo.dead[0] + c.undo.dead[1] + c.undo.over),
      remotePop: max(c => c.remote.maxPop), remoteBack: sum(c => c.remote.back), remoteMaxBack: max(c => c.remote.maxBack),
      offPct: +(cs.reduce((a, c) => a + c.remote.offPct, 0) / cs.length).toFixed(1), remoteMaxOff: max(c => c.remote.maxOff),
      lagMs: Math.round(cs.reduce((a, c) => a + c.remote.lagMs, 0) / cs.length),
      corrMax: max(c => c.local.corrMax), corrBackMax: max(c => c.local.corrBackMax), corrN: sum(c => c.local.corrN), ownDrawnBack: sum(c => c.local.drawnBack),
      snapsPerSec: +(cs.reduce((a, c) => a + c.snaps.perSec, 0) / cs.length).toFixed(1), maxGapMs: max(c => c.snaps.maxGapMs),
      serverTicksPerSec: +(cs.reduce((a, c) => a + c.snaps.ticksPerSec, 0) / cs.length).toFixed(1),
      endOk: cs.every(c => c.endOk),
    });
  }
}
// co-op and Dodgeball: one row per file
for (const f of process.argv.slice(2)) {
  const runs = JSON.parse(fs.readFileSync(f, 'utf8'));
  const co = runs.filter(r => r.kind === 'coop'), dg = runs.filter(r => r.kind === 'dodge');
  const tot = (rs, g) => rs.reduce((a, r) => a + g(r), 0);
  const cl = (rs) => rs.flatMap(r => r.clients);
  if (co.length) {
    const cs = cl(co), mx = (g) => cs.reduce((a, c) => Math.max(a, g(c)), 0);
    coopRows.push({ file: f.split('/').pop(), levels: co.length, won: co.filter(r => r.server.won).length, withDeaths: co.filter(r => r.server.deaths).length, deaths: tot(co, r => r.server.deaths),
      released: tot(co, r => r.server.input.released), trimmed: tot(co, r => r.server.input.trimmed), held: tot(co, r => r.server.input.held), late: tot(co, r => r.server.input.late), waits: tot(co, r => r.server.input.waits), waitMax: Math.max(...co.map(r => r.server.input.waitMax)),
      keyChanges: cs.reduce((a, c) => a + c.ticks.changes, 0), offTick: cs.reduce((a, c) => a + c.ticks.moved, 0), dropped: cs.reduce((a, c) => a + c.ticks.dropped, 0),
      ownCorrMax: mx(c => c.corrMax), ownCorrN: cs.reduce((a, c) => a + c.corrN, 0),
      partnerPop: mx(c => c.maxPop), pops: cs.reduce((a, c) => a + c.pops, 0), pops12: cs.reduce((a, c) => a + (c.pops12 || 0), 0),
      ridePct: cs[0].ride ? +(cs.reduce((a, c) => a + c.ride.pct, 0) / cs.length).toFixed(1) : '-', rideGapP95: cs[0].ride ? mx(c => c.ride.p95) : '-', rideGapMax: cs[0].ride ? mx(c => c.ride.max) : '-', frames: cs.reduce((a, c) => a + c.frames, 0),
      offPct: +(cs.reduce((a, c) => a + c.offPct * c.frames, 0) / Math.max(1, cs.reduce((a, c) => a + c.frames, 0))).toFixed(1), maxOff: mx(c => c.maxOff),
      undone: cs.reduce((a, c) => a + c.undoDead + c.undoWon, 0) });
  }
  if (dg.length) {
    const cs = cl(dg);
    dodgeRows.push({ file: f.split('/').pop(), runs: dg.length, throws: tot(dg, r => r.clients[0].throws), hits: tot(dg, r => r.clients[0].hits),
      ownHitUndone: cs.reduce((a, c) => a + c.ownHitUndone, 0), ownDodgeUndone: cs.reduce((a, c) => a + c.ownDodgeUndone, 0), thrMissThenHit: cs.reduce((a, c) => a + c.thrDodgeUndone, 0), ownThrowMoved: cs.reduce((a, c) => a + (c.ownThrowMoved || 0), 0),
      keyChanges: cs.reduce((a, c) => a + c.ticks.changes, 0), offTick: cs.reduce((a, c) => a + c.ticks.moved, 0), jumpsOff: cs.reduce((a, c) => a + c.ticks.jumpsMoved, 0), throwsOff: cs.reduce((a, c) => a + c.ticks.actsMoved, 0), dropped: cs.reduce((a, c) => a + c.ticks.dropped, 0),
      released: tot(dg, r => r.server.input.released), trimmed: tot(dg, r => r.server.input.trimmed), held: tot(dg, r => r.server.input.held), drained: tot(dg, r => r.server.input.drained),
      ownCorrMax: cs.reduce((a, c) => Math.max(a, c.corrMax), 0) });
  }
}
if (rows.length) console.table(rows);
if (coopRows.length) console.table(coopRows);
if (dodgeRows.length) console.table(dodgeRows);
if (process.env.MD) for (const rows of [rows, coopRows, dodgeRows].filter(r => r.length)) {
  const keys = Object.keys(rows[0]);
  console.log('| ' + keys.join(' | ') + ' |\n|' + keys.map(() => ' --- ').join('|') + '|');
  for (const r of rows) console.log('| ' + keys.map(k => r[k]).join(' | ') + ' |');
}
