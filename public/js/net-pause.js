// Sol & Luna — the online pause, the client side. Used by every online mode (main.js for co-op
// and Dodgeball, runner-app.js and runner3d-app.js through runner-sync.js) and by the harness
// clients (tools/check-netcode.js, tools/check-pause.js). No DOM. docs/netcode.md, "Pause".
//
// The server owns the pause. Either player sends {t:'pause', on: true} or {t:'pause', on: false}.
// The room then stops stepping (no ticks, no snapshots, nothing owed for the frozen time) and
// tells both clients:
//   {t:'pause', st:'paused', by}               frozen; `by` is the character who asked
//   {t:'pause', st:'count', by, ms, frozen}    `by` asked to resume: the room steps again
//                                              RESUME_MS after it sent this. This client starts its
//                                              own ticks `ms` after it arrives (the server sets ms
//                                              per client, so its inputs reach the room on time),
//                                              and by then the room will have stood still for
//                                              `frozen` ms in this match, all pauses together;
//                                              tick: the server's tick while frozen
//   {t:'pause', st:'run'}                      not paused (the request came after the end of the match)
// A player who asks to pause stops at once, before the server answers: their ticks and inputs
// stop on the key, so nothing moves on their screen after it.

export const RESUME_MS = 2000;   // the countdown: 3, 2, 1

export class RoomPause {
  constructor() { this.reset(); }
  // a new match, the lobby, or a partner who left: not paused
  reset() { this.st = 'run'; this.by = -1; this.goAt = 0; this.ms = 0; this.frozen = 0; this.tick = -1; }
  // does this client tick now? A countdown that has run out turns into play here.
  running(now) {
    if (this.st === 'count' && now >= this.goAt) this.st = 'run';
    return this.st === 'run';
  }
  paused() { return this.st === 'paused'; }
  // the local player asks to pause (on) or resume. Returns the message to send, or null.
  ask(on, me) {
    if (on) {
      if (this.st === 'paused') return null;
      this.st = 'paused'; this.by = me;
      return { t: 'pause', on: true };
    }
    return this.st === 'paused' ? { t: 'pause', on: false } : null;
  }
  onMsg(m, now) {
    if (m.st === 'paused') { this.st = 'paused'; this.by = m.by; this.tick = m.tick; }
    else if (m.st === 'count') { this.st = 'count'; this.by = m.by; this.ms = Math.max(0, m.ms | 0); this.goAt = now + this.ms; this.frozen = m.frozen || 0; this.tick = m.tick; }
    else this.st = 'run';
  }
  // for the screens: the state, who asked, and the countdown's number (3, 2, 1)
  view(now) {
    this.running(now);
    const n = this.st === 'count' ? Math.min(3, Math.max(1, Math.ceil((3 * (this.goAt - now)) / Math.max(1, this.ms)))) : 0;
    return { st: this.st, by: this.by, n };
  }
}
