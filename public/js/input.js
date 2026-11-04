// Keyboard + gamepad input. Bits: 1 = left, 2 = right, 4 = jump.
const SOL_KEYS = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 4 };
const LUNA_KEYS = { KeyA: 1, KeyD: 2, KeyW: 4 };

export class Input {
  constructor() {
    this.down = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.code in SOL_KEYS || e.code in LUNA_KEYS || e.code === 'Space') {
        if (!e.target.closest || !e.target.closest('input')) e.preventDefault();
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.down.clear(); });
    this.touch = 0;
  }
  keys(map) {
    let b = 0;
    for (const k in map) if (this.down.has(k)) b |= map[k];
    return b;
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
    return b;
  }
  // Local co-op: arrows (or pad 0) drive Sol, WASD (or pad 1) drive Luna.
  local() {
    return [this.keys(SOL_KEYS) | this.pad(0), this.keys(LUNA_KEYS) | this.pad(1)];
  }
  // Online: any of the control sets drives your own character.
  any() {
    return this.keys(SOL_KEYS) | this.keys(LUNA_KEYS) | this.pad(0) | this.pad(1) | this.touch;
  }
}
