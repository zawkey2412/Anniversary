// Sound effects: Kenney CC0 packs (assets/sfx/LICENSE-kenney-CC0.txt), played through Web Audio.
// Everything goes through a soft "room": a warm low-pass, a tiny fade-in (no clicks) and a light reverb.
const NAMES = ['tap', 'type', 'star', 'bump', 'ring', 'paper', 'correct', 'wrong', 'stamp', 'rustle', 'open', 'board', 'place'];
const VOLUME = { tap: 0.28, type: 0.1, star: 0.26, bump: 0.32, ring: 0.3, paper: 0.5, correct: 0.36, wrong: 0.22, stamp: 0.42, rustle: 0.38, open: 0.55, board: 0.32, place: 0.38 };
// a few sounds get an extra-soft filter on top (the harsh ones)
const EXTRA_SOFT = { bump: 1400, wrong: 1800, stamp: 2200, type: 2600 };

class Sfx {
  constructor() { this.ctx = null; this.buffers = {}; this.muted = false; this.bus = null; }

  // Must be called from a user gesture (tap / click / key) the first time.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.buildBus();
      NAMES.forEach((n) => fetch(`assets/sfx/${n}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { this.buffers[n] = buf; })
        .catch(() => {}));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  buildBus() {
    const ctx = this.ctx;
    const input = ctx.createGain(); input.gain.value = 0.85;
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
    input.connect(warm).connect(body);
    body.connect(dry).connect(ctx.destination);
    body.connect(room).connect(wet).connect(ctx.destination);
    this.bus = input;
  }

  play(name, { vol = 1, rate = 1, jitter = 0.06 } = {}) {
    if (this.muted || !this.ctx || !this.buffers[name] || !this.bus) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * jitter);
    const level = (VOLUME[name] ?? 0.4) * vol;
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

export const sfx = new Sfx();
