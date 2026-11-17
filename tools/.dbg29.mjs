import { runScript } from './botlib.js';
import { SCRIPTS } from './acts/act5.bot.js';
let ph = '', minHead = 99, log = [];
const r = runScript(29, SCRIPTS[29], { onPhase: (n) => { ph = n; }, onTick: (S) => { if (ph === 'sol walks to x=38.2') { const p = S.p[0]; minHead = Math.min(minHead, p.y / 24); if (log.length < 3) log.push([S.gm.join(''), (p.x/24).toFixed(2), (p.y/24).toFixed(2), p.gr, p.vy.toFixed(2)].join(' ')); } } });
console.log(r.msg, minHead); console.log(log.join('\n'));
