// Tiny procedural sound effects (WebAudio) — no audio files needed.
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('sl.muted') === '1'; } catch {}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.4, slide = 0, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, freq = 800) {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t);
}

export const sfx = {
  unlock() { ac(); },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('sl.muted', muted ? '1' : '0'); } catch {}
    if (master) master.gain.value = muted ? 0 : 0.35;
    return muted;
  },
  jump(who) { tone(who ? 520 : 400, 0.12, { type: 'triangle', vol: 0.18, slide: 1.6 }); },
  land() { noise(0.05, 0.08, 500); },
  gem(who) { const b = who ? 880 : 660; [0, 0.06, 0.12].forEach((d, i) => tone(b * [1, 1.25, 1.5][i], 0.18, { type: 'sine', vol: 0.22, delay: d })); },
  die() { noise(0.5, 0.35, 1200); tone(220, 0.5, { type: 'sawtooth', vol: 0.15, slide: 0.3 }); },
  click() { tone(300, 0.05, { type: 'square', vol: 0.08 }); },
  lever() { tone(180, 0.08, { type: 'square', vol: 0.1, slide: 1.5 }); },
  door() { tone(392, 0.25, { vol: 0.15 }); tone(523, 0.3, { vol: 0.12, delay: 0.08 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: i * 0.11 })); },
  ui() { tone(700, 0.04, { type: 'triangle', vol: 0.08 }); },
  // Dodgeball
  throwBall(who) {
    noise(0.16, 0.28, who ? 3200 : 1600);
    if (who) { tone(1400, 0.16, { type: 'sine', vol: 0.12, slide: 0.45 }); tone(2100, 0.12, { type: 'sine', vol: 0.06, slide: 0.5, delay: 0.02 }); }
    else { tone(260, 0.18, { type: 'sawtooth', vol: 0.1, slide: 0.45 }); tone(520, 0.1, { type: 'triangle', vol: 0.08, slide: 0.6 }); }
  },
  hit() { noise(0.35, 0.45, 2200); tone(130, 0.4, { type: 'square', vol: 0.18, slide: 0.35 }); tone(80, 0.5, { type: 'sine', vol: 0.3, slide: 0.5 }); },
  pickup(who) { const b = who ? 880 : 587; tone(b, 0.07, { type: 'triangle', vol: 0.12 }); tone(b * 1.5, 0.1, { type: 'triangle', vol: 0.1, delay: 0.05 }); },
  turnover() { tone(330, 0.18, { type: 'square', vol: 0.08, slide: 0.5 }); tone(220, 0.22, { type: 'square', vol: 0.07, slide: 0.5, delay: 0.1 }); },
  tock() { tone(1000, 0.05, { type: 'square', vol: 0.07 }); },
  go() { tone(660, 0.08, { type: 'triangle', vol: 0.14 }); tone(990, 0.14, { type: 'triangle', vol: 0.12, delay: 0.07 }); },
};
