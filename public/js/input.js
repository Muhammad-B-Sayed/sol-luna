// Keyboard + gamepad input. Bits: 1 = left, 2 = right, 4 = jump, 8 = action (throw in Dodgeball).
const SOL_KEYS = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 4, ArrowDown: 8 };
const LUNA_KEYS = { KeyA: 1, KeyD: 2, KeyW: 4, KeyS: 8 };
// Runner 3D: world-axis movement. Bits: 1 left, 2 right, 4 jump, 8 forward, 16 back.
const SOL_3D = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 8, ArrowDown: 16, ShiftRight: 4, Slash: 4, Numpad0: 4 };
const LUNA_3D = { KeyA: 1, KeyD: 2, KeyW: 8, KeyS: 16, Space: 4, ShiftLeft: 4 };

export class Input {
  constructor() {
    this.down = new Set();
    window.addEventListener('keydown', (e) => {
      // typing in a text field (room code, chat) never moves a character
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.code in SOL_KEYS || e.code in LUNA_KEYS || e.code === 'Space') {
        if (!e.target.closest || !e.target.closest('input')) e.preventDefault();
      }
      if (this.mode3d && (e.code in SOL_3D || e.code in LUNA_3D)) e.preventDefault();   // Runner 3D only
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.down.clear(); });
    this.touch = 0;
    this.mode3d = false; this.touch3 = 0;   // Runner 3D (runner3d-app.js sets these)
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
    if (p.buttons[2]?.pressed || p.buttons[1]?.pressed || p.buttons[7]?.pressed) b |= 8;   // X / B / right trigger
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
  // Runner 3D: stick or d-pad moves on the ground plane, A jumps.
  pad3(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[i];
    if (!p) return 0;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, B = (k) => p.buttons[k]?.pressed;
    return (ax < -0.35 || B(14) ? 1 : 0) | (ax > 0.35 || B(15) ? 2 : 0) | (B(0) ? 4 : 0) | (ay < -0.35 || B(12) ? 8 : 0) | (ay > 0.35 || B(13) ? 16 : 0);
  }
  local3d() { return [this.keys(SOL_3D) | this.pad3(0), this.keys(LUNA_3D) | this.pad3(1)]; }
  any3d() { return this.keys(SOL_3D) | this.keys(LUNA_3D) | this.pad3(0) | this.pad3(1) | this.pad3(2) | this.pad3(3) | this.touch3; }
}
