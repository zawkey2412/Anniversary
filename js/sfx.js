// Sound effects: Kenney CC0 packs (assets/sfx/LICENSE-kenney-CC0.txt), played through Web Audio.
// Each sound is loudness-normalised when it loads; then everything goes through a soft "room":
// a warm low-pass, a tiny fade-in (no clicks), a light reverb and a leveller (compressor) so nothing jumps out.
const NAMES = ['tap', 'type', 'star', 'bump', 'ring', 'paper', 'correct', 'wrong', 'stamp', 'rustle', 'open', 'board', 'place'];
// relative mix after normalisation (1 = the common level)
const VOLUME = { tap: 0.55, type: 0.3, star: 0.65, bump: 1, ring: 0.75, paper: 0.7, correct: 0.75, wrong: 0.55, stamp: 0.8, rustle: 0.7, open: 0.8, board: 0.7, place: 0.6 };
const TARGET_RMS = 0.05;   // common level for every effect, kept well under the music
const MASTER = 0.7;
// a few sounds get an extra-soft filter on top (the harsh ones)
const EXTRA_SOFT = { wrong: 2000, stamp: 2400, type: 2800 };

class Sfx {
  constructor() { this.ctx = null; this.buffers = {}; this.norm = {}; this.muted = false; this.bus = null; }

  // Must be called from a user gesture (tap / click / key) the first time.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.buildBus();
      NAMES.forEach((n) => fetch(`assets/sfx/${n}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { this.buffers[n] = buf; this.norm[n] = normGain(buf); })
        .catch(() => {}));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  buildBus() {
    const ctx = this.ctx;
    const input = ctx.createGain(); input.gain.value = MASTER;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3600; warm.Q.value = 0.5;
    const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 250; body.gain.value = 2;
    const dry = ctx.createGain(); dry.gain.value = 0.9;
    const wet = ctx.createGain(); wet.gain.value = 0.16;
    // small soft room: decaying noise impulse
    const len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const room = ctx.createConvolver(); room.buffer = ir;
    const level = ctx.createDynamicsCompressor();          // leveller: evens out loud vs soft effects
    level.threshold.value = -30; level.knee.value = 10; level.ratio.value = 4; level.attack.value = 0.004; level.release.value = 0.2;
    const out = ctx.createGain(); out.gain.value = 1;
    input.connect(warm).connect(body);
    body.connect(dry).connect(level);
    body.connect(room).connect(wet).connect(level);
    level.connect(out).connect(ctx.destination);
    this.bus = input;
  }

  play(name, { vol = 1, rate = 1, jitter = 0.06 } = {}) {
    if (this.muted || !this.ctx || !this.buffers[name] || !this.bus) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * jitter);
    const level = (VOLUME[name] ?? 0.6) * (this.norm[name] ?? 0.3) * vol;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.012); // soft attack, no click
    let node = src.connect(gain);
    if (EXTRA_SOFT[name]) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = EXTRA_SOFT[name]; f.Q.value = 0.4;
      node = node.connect(f);
    }
    node.connect(this.bus);
    src.start(t);
  }
}

// gain that brings a short sound to TARGET_RMS (measured over its non-silent part)
function normGain(buf) {
  const ch = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const gate = peak * 0.1; let sum = 0, n = 0;
  for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > gate) { sum += ch[i] * ch[i]; n++; }
  const rms = Math.sqrt(sum / Math.max(1, n));
  return Math.min(4, Math.max(0.1, TARGET_RMS / Math.max(rms, 1e-4)));
}

export const sfx = new Sfx();
