// Checks for public/js/input.js key latching, with a fake window (no browser needed).
//   node tools/check-input.js
// A tap or a release that falls between two reads must still be seen once; held keys read as
// before; keys(map) alone is unchanged; old edges (keys pressed in a menu) don't replay.
const L = {}, D = {};
let clock = 1000;
globalThis.window = { addEventListener: (t, f) => { L[t] = f; } };
globalThis.document = { addEventListener: (t, f) => { D[t] = f; }, hidden: false };
globalThis.performance = { now: () => clock };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
const { Input } = await import('../public/js/input.js');

let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };
const ev = (code) => ({ code, target: { closest: () => null }, preventDefault() {} });
const down = (c) => L.keydown(ev(c)), up = (c) => L.keyup(ev(c));
const ACT = 8, JUMP = 4, RIGHT = 2;

console.log('Input latching');
{
  const I = new Input();
  ok(I.any() === 0, 'nothing pressed reads 0');
  down('ArrowRight'); ok(I.any() === RIGHT && I.any() === RIGHT, 'a held key reads down on every read');
  up('ArrowRight'); ok(I.any() === 0, 'and up after it is released');
  down('ArrowDown'); up('ArrowDown');
  ok(I.any() === ACT, 'a tap between two reads reads as down once');
  ok(I.any() === 0, 'and up on the next read');
  down('KeyW'); ok(I.any() === JUMP, 'held');
  up('KeyW'); down('KeyW');
  ok(I.any() === 0, 'a release and press again between two reads reads as up once');
  ok(I.any() === JUMP, 'then down again');
  up('KeyW');
  ok(I.any() === 0, 'released');
  down('ArrowDown'); up('ArrowDown'); clock += 1000;
  ok(I.any() === 0, 'a tap older than the latch (a key pressed in a menu) does not replay');
  down('KeyS'); up('KeyS');
  ok(I.keys({ KeyS: 8 }) === 0, 'keys(map) alone reads only held keys, as before');
  const [sol, luna] = I.local();
  ok(sol === 0 && luna === ACT, 'local() latches per player (Luna\'s S tap)');
  for (let i = 0; i < 5; i++) { down('ArrowLeft'); }
  ok(I.local()[0] === 1 && I.local()[0] === 1, 'key repeat while held is still one hold');
  up('ArrowLeft'); I.any();
  I.touch |= 4; I.touch &= ~4;
  ok(I.any() === JUMP && I.any() === 0, 'a touch-button tap between two reads reads as down once');
  I.touch |= 8; ok(I.any() === ACT, 'a held touch button reads down'); I.touch &= ~8; ok(I.any() === 0, 'and up after release');
  down('ArrowUp'); L.blur();
  ok(I.any() === 0, 'losing focus lets go of everything');
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll input checks passed.');
process.exit(failed ? 1 : 0);
