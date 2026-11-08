// Sound effects: Kenney CC0 packs (assets/sfx/LICENSE-kenney-CC0.txt), played through Web Audio.
const NAMES = ['tap', 'type', 'star', 'bump', 'ring', 'paper', 'correct', 'wrong', 'stamp', 'rustle', 'open', 'board', 'place'];
const VOLUME = { tap: 0.45, type: 0.22, star: 0.4, bump: 0.6, ring: 0.45, paper: 0.8, correct: 0.55, wrong: 0.45, stamp: 0.85, rustle: 0.6, open: 0.8, board: 0.55, place: 0.6 };

class Sfx {
  constructor() { this.ctx = null; this.buffers = {}; this.muted = false; }

  // Must be called from a user gesture (tap / click / key) the first time.
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      NAMES.forEach((n) => fetch(`assets/sfx/${n}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { this.buffers[n] = buf; })
        .catch(() => {}));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name, { vol = 1, rate = 1, jitter = 0.06 } = {}) {
    if (this.muted || !this.ctx || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource(), gain = this.ctx.createGain();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * jitter);
    gain.gain.value = (VOLUME[name] ?? 0.6) * vol;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}

export const sfx = new Sfx();
