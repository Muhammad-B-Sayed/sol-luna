// Lists the rooms for tools/capture.sh to picture. Every built level is pictured at its start.
// Usage: node tools/capture/record-states.js <out.json>
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../../shared/levels.js';

const out = {};
LEVELS.forEach((l, i) => { if (!l.stub) out[i + 1] = []; });
writeFileSync(process.argv[2], JSON.stringify(out));
