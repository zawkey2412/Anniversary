// Song player for "guess the song" checkpoints.
// Streams the uploaded file through an <audio> element routed into Web Audio (so fades and mute work on iPhone too),
// skips leading silence automatically, and plays Heardle-style snippets or the full song.
import { sfx } from './sfx.js';

export const SNIPPET_STEPS = [1, 2, 4, 7, 11, 16]; // seconds, like the song-guessing games

const startCache = new Map();

// Find where the music actually starts by decoding only the first ~400 KB of the file.
export function detectStart(url) {
  if (startCache.has(url)) return startCache.get(url);
  const job = (async () => {
    try {
      sfx.ensure();
      const res = await fetch(url, { headers: { Range: 'bytes=0-399999' } });
      const buf = (await res.arrayBuffer()).slice(0, 400000);
      const audio = await new Promise((ok, fail) => sfx.ctx.decodeAudioData(buf, ok, fail));
      const ch = audio.getChannelData(0), threshold = 0.02;
      for (let i = 0; i < ch.length; i += 32) {
        if (Math.abs(ch[i]) > threshold) return Math.max(0, i / audio.sampleRate - 0.05);
      }
      return 0;
    } catch {
      return 0; // can't analyse (format/browser): just start at 0
    }
  })();
  startCache.set(url, job);
  return job;
}

export class SongPlayer {
  constructor(url) {
    this.url = url;
    this.el = new Audio(url);
    this.el.preload = 'auto';
    this.el.playsInline = true;
    this.gain = null;
    this.muted = false;
    this.endAt = null;
    this.raf = 0;
    this.onEnd = null;
    try {
      sfx.ensure();
      const src = sfx.ctx.createMediaElementSource(this.el);
      this.gain = sfx.ctx.createGain();
      this.gain.gain.value = 0;
      src.connect(this.gain).connect(sfx.ctx.destination);
    } catch { /* no Web Audio: fall back to the element's own output */ }
  }

  get playing() { return !this.el.paused; }

  setMuted(m) {
    this.muted = m;
    if (this.gain) this.gain.gain.value = m ? 0 : this.gain.gain.value || 1;
    else this.el.muted = m;
  }

  fadeTo(v, secs) {
    if (!this.gain) return;
    const t = sfx.ctx.currentTime, g = this.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.muted ? 0 : v, t + secs);
  }

  // Play from `offset` for `duration` seconds (or to the end if duration is null).
  async play(offset, duration = null, onEnd = null) {
    cancelAnimationFrame(this.raf);
    this.onEnd = onEnd;
    this.endAt = duration ? offset + duration : null;
    try { this.el.currentTime = offset; } catch { /* not seekable yet */ }
    if (this.gain) { this.gain.gain.cancelScheduledValues(sfx.ctx.currentTime); this.gain.gain.value = 0; }
    try { await this.el.play(); } catch { return; }
    this.fadeTo(0.95, 0.06);
    const tick = () => {
      if (this.el.paused) return;
      if (this.endAt !== null && this.el.currentTime >= this.endAt - 0.08) { this.stop(0.08); return; }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.el.onended = () => { cancelAnimationFrame(this.raf); this.onEnd?.(); };
  }

  stop(fade = 0.5) {
    cancelAnimationFrame(this.raf);
    const done = () => { this.el.pause(); const cb = this.onEnd; this.onEnd = null; cb?.(); };
    if (this.gain && !this.el.paused) { this.fadeTo(0, fade); setTimeout(done, fade * 1000 + 20); }
    else done();
  }

  pause() { cancelAnimationFrame(this.raf); this.el.pause(); }

  resume() {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : 0.95;
    this.el.play().catch(() => {});
  }

  destroy() { this.onEnd = null; this.stop(0.6); setTimeout(() => { this.el.removeAttribute('src'); this.el.load(); }, 700); }
}
