// Summarize JSON files written by tools/check-netcode.js (JSON=file), one table row per runner.
//   node tools/net-summary.js before.json after.json ...
import fs from 'node:fs';

const rows = [];
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
console.table(rows);
if (process.env.MD) {
  const keys = Object.keys(rows[0]);
  console.log('| ' + keys.join(' | ') + ' |\n|' + keys.map(() => ' --- ').join('|') + '|');
  for (const r of rows) console.log('| ' + keys.map(k => r[k]).join(' | ') + ' |');
}
