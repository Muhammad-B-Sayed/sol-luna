// WebSocket client wrapper with tiny event bus.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.rtt = 0;
    this.open = false;
  }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  emit(t, m) { (this.handlers[t] || []).forEach(fn => fn(m)); }
  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return this.ready;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => { this.open = true; resolve(); };
      this.ws.onerror = () => reject(new Error('Could not reach the game server.'));
    });
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
      this.emit(m.t, m);
    };
    this.ws.onclose = () => { this.open = false; this.emit('close', {}); };
    clearInterval(this.pinger);
    this.pinger = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    return this.ready;
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { clearInterval(this.pinger); if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; this.open = false; }
}
