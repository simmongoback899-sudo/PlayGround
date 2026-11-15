// Tiny synthesized combat audio — no external assets.
let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 5;
  master.connect(comp).connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function noise(dur, gain, filterType, freq, q = 1, decay = 1) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  const t = ctx.currentTime + when;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  shoot(kind = 'rifle') {
    if (!ctx) return;
    if (kind === 'rifle') { noise(0.16, 0.55, 'bandpass', 1300, 0.8); tone(150, 0.13, 0.32, 'sawtooth', 60); }
    else if (kind === 'pistol') { noise(0.12, 0.4, 'bandpass', 2300, 1.2); tone(320, 0.1, 0.22, 'square', 120); }
    else { noise(0.09, 0.34, 'highpass', 1700, 0.8); tone(240, 0.07, 0.16, 'sawtooth', 90); }
  },
  hit(head) {
    tone(head ? 1700 : 1080, 0.06, head ? 0.3 : 0.2, 'triangle', head ? 900 : 620);
    noise(0.05, 0.12, 'highpass', 3000);
  },
  kill() {
    tone(660, 0.16, 0.2, 'triangle', 990);
    tone(990, 0.24, 0.16, 'sine', 1320, 0.07);
    noise(0.4, 0.2, 'bandpass', 800, 0.5);
  },
  hurt() {
    noise(0.28, 0.45, 'lowpass', 500);
    tone(90, 0.24, 0.28, 'sawtooth', 45);
  },
  reload() {
    tone(220, 0.05, 0.14, 'square');
    tone(160, 0.06, 0.12, 'square', null, 0.18);
    tone(320, 0.05, 0.1, 'square', null, 0.4);
  },
  dash() {
    noise(0.35, 0.3, 'bandpass', 900, 2, 1);
    tone(420, 0.35, 0.16, 'sine', 1400);
  },
  pulse() {
    tone(300, 0.9, 0.17, 'sine', 1500);
    tone(600, 1.1, 0.1, 'triangle', 2400, 0.05);
    noise(0.7, 0.12, 'bandpass', 2400, 3);
  },
  ult() {
    tone(70, 1.6, 0.34, 'sawtooth', 42);
    tone(280, 1.2, 0.16, 'sine', 1120);
    tone(560, 1.4, 0.12, 'triangle', 2240, 0.1);
    noise(1.6, 0.3, 'lowpass', 1800, 0.7, 1);
  },
  enemyShot(dist = 10) {
    const g = Math.max(0.03, 0.22 - dist * 0.008);
    tone(180, 0.09, g, 'sawtooth', 70);
    noise(0.09, g * 0.6, 'bandpass', 1500);
  },
  step() { noise(0.07, 0.06, 'lowpass', 320); },
  empty() { tone(900, 0.04, 0.12, 'square'); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 0.15, 'triangle', f * 1.01, i * 0.13)); },
  lose() { [330, 262, 196].forEach((f, i) => tone(f, 0.7, 0.18, 'sine', f * 0.7, i * 0.2)); },
  start() { tone(180, 0.5, 0.2, 'sine', 700); tone(360, 0.6, 0.12, 'triangle', 1400, 0.15); }
};
