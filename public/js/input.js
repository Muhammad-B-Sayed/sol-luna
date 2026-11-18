// Keyboard + gamepad input. Bits: 1 = left, 2 = right, 4 = jump, 8 = action (throw in Dodgeball).
const SOL_KEYS = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 4, ArrowDown: 8 };
const LUNA_KEYS = { KeyA: 1, KeyD: 2, KeyW: 4, KeyS: 8 };

// The game reads the keys once per tick, at most a few times a frame, so a whole tap, or a
// release and a press again, could fall between two reads and be lost: on a slow device a quick
// tap was never seen, or a release was missed and two taps became one long hold (an aimed throw
// in Dodgeball). local() and any() now latch these edges until a read has seen them:
//   - a key pressed and released since the last read reads as down once;
//   - a key the last read saw down, released and pressed again since, reads as up once.
// Held keys read exactly as before. keys(map) on its own is unchanged and latches nothing.
// An edge older than LATCH_MS is dropped, so keys pressed in a menu (no reads) don't replay
// as a press when play starts.
const LATCH_MS = 250;
const now = () => performance.now();

export class Input {
  constructor() {
    this.down = new Set();
    this.seen = new Set();      // what the last local()/any() read reported as down
    this.pulse = new Map();     // code -> time: pressed and released without a read seeing it
    this.gap = new Map();       // code -> time: seen down, released and pressed again since
    this.rel = new Set();       // seen down, released since the last read
    window.addEventListener('keydown', (e) => {
      // typing in a text field (room code, chat) never moves a character
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.code in SOL_KEYS || e.code in LUNA_KEYS || e.code === 'Space') {
        if (!e.target.closest || !e.target.closest('input')) e.preventDefault();
      }
      if (!this.down.has(e.code) && this.rel.has(e.code)) this.gap.set(e.code, now());
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (this.down.has(e.code)) {
        if (this.seen.has(e.code)) this.rel.add(e.code);
        else this.pulse.set(e.code, now());
      }
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    this._touch = 0; this.touchSeen = 0; this.touchPulse = 0; this.touchT = 0;
  }
  clear() { this.down.clear(); this.pulse.clear(); this.gap.clear(); this.rel.clear(); this.touchPulse = 0; }
  // touch buttons (main.js bindTouch) set and clear bits here; a tap between two reads is latched
  get touch() { return this._touch; }
  set touch(v) {
    const up = this._touch & ~v & ~this.touchSeen;   // released before any read saw it
    if (up) { this.touchPulse |= up; this.touchT = now(); }
    this._touch = v;
  }
  keys(map, set = this.down) {
    let b = 0;
    for (const k in map) if (set.has(k)) b |= map[k];
    return b;
  }
  // One read: the held keys plus the latched edges, which this read then uses up.
  read() {
    const t = now(), s = new Set(this.down);
    for (const [k, at] of this.pulse) if (t - at <= LATCH_MS) s.add(k);
    for (const [k, at] of this.gap) if (t - at <= LATCH_MS) s.delete(k);
    this.pulse.clear(); this.gap.clear(); this.rel.clear();
    this.seen = s;
    const touch = this._touch | (t - this.touchT <= LATCH_MS ? this.touchPulse : 0);
    this.touchPulse = 0; this.touchSeen = touch;
    return { s, touch };
  }
  pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[i];
    if (!p) return 0;
    let b = 0;
    const ax = p.axes[0] || 0;
    if (ax < -0.35 || p.buttons[14]?.pressed) b |= 1;
    if (ax > 0.35 || p.buttons[15]?.pressed) b |= 2;
    if (p.buttons[0]?.pressed || p.buttons[12]?.pressed || (p.axes[1] || 0) < -0.6) b |= 4;
    if (p.buttons[2]?.pressed || p.buttons[1]?.pressed || p.buttons[7]?.pressed) b |= 8;   // X / B / right trigger
    return b;
  }
  // Local co-op: arrows (or pad 0) drive Sol, WASD (or pad 1) drive Luna.
  local() {
    const { s } = this.read();
    return [this.keys(SOL_KEYS, s) | this.pad(0), this.keys(LUNA_KEYS, s) | this.pad(1)];
  }
  // Online: any of the control sets drives your own character.
  any() {
    const { s, touch } = this.read();
    return this.keys(SOL_KEYS, s) | this.keys(LUNA_KEYS, s) | this.pad(0) | this.pad(1) | touch;
  }
}
