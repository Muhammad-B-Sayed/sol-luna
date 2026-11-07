// Records game states at named phases of the co-op bot scripts, for tools/capture.sh.
// Usage: node tools/capture/record-states.js <out.json>
import { writeFileSync } from 'node:fs';
import { run, SCRIPTS } from '../coop-bot.js';
import { cloneState } from '../../shared/sim.js';

// Which bot phases to picture for each documented room (four per room, shown as a 2x2 grid).
const SHOTS = {
  14: ['E1 up', 'S1 up', 'G2 open', 'L2 set'],
  19: ['E0 up', 'G1 open', 'crate settles', 'E0 up with luna'],
  26: ['bridge 1 out', 'bridge 2 out', 'E up', 'GX open'],
};

const out = {};
for (const n of Object.keys(SHOTS)) {
  out[n] = [];
  const r = run(+n, SCRIPTS[n], {
    onPhase: (name, S) => {
      if (SHOTS[n].includes(name) && !out[n].some(x => x.name === name)) out[n].push({ name, S: cloneState(S) });
    },
  });
  if (!r.ok) { console.error(`level ${n}: bot failed (${r.msg})`); process.exit(1); }
}
writeFileSync(process.argv[2], JSON.stringify(out));
