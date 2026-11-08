// Music playback for songs and background music.
// Files stream through an <audio> element routed into Web Audio, so fades, mute and levels also work on iPhone.
// Each file is loudness-normalised: we decode a chunk, measure its loudness (RMS of the non-silent part),
// and set a gain that brings it to a common target; a limiter catches any peaks.
import { sfx } from './sfx.js';

export const SNIPPET_STEPS = [1, 2, 4, 7, 11, 16]; // seconds, like the song-guessing games
export const LEVEL = { song: 1, background: 0.55 }; // background sits a little under normal
const TARGET_RMS = 0.12;                            // ≈ -18 dBFS: comfortable "normal" loudness on phones
const CHUNK = 600000;                               // bytes analysed (~35 s of a 128 kbps mp3)

const analysisCache = new Map();

// → { start: seconds where the music begins, gain: normalising factor }
export function analyze(url) {
  if (analysisCache.has(url)) return analysisCache.get(url);
  const job = (async () => {
    try {
      sfx.ensure();
      const res = await fetch(url, { headers: { Range: `bytes=0-${CHUNK - 1}` } });
      const buf = (await res.arrayBuffer()).slice(0, CHUNK);
      const audio = await new Promise((ok, fail) => sfx.ctx.decodeAudioData(buf, ok, fail));
      const ch = audio.getChannelData(0), rate = audio.sampleRate;
      let peak = 0;
      for (let i = 0; i < ch.length; i += 16) peak = Math.max(peak, Math.abs(ch[i]));
      const silence = Math.max(0.002, peak * 0.08);   // "silence" is relative to how loud this file is
      let first = -1;
      for (let i = 0; i < ch.length; i += 32) if (Math.abs(ch[i]) > silence) { first = i; break; }
      if (first < 0) return { start: 0, gain: 1 };
      // loudness of the music part (skip the silence, skip the very end of the chunk)
      let sum = 0, n = 0;
      for (let i = first; i < ch.length - rate * 0.2; i += 8) { sum += ch[i] * ch[i]; n++; }
      const rms = Math.sqrt(sum / Math.max(1, n));
      const gain = Math.min(3, Math.max(0.35, TARGET_RMS / Math.max(rms, 1e-4)));
      return { start: Math.max(0, first / rate - 0.05), gain };
    } catch {
      return { start: 0, gain: 1 }; // can't analyse (format/browser): play as is
    }
  })();
  analysisCache.set(url, job);
  return job;
}

export const detectStart = (url) => analyze(url).then((a) => a.start);

function sameOrigin(url) {
  try { return new URL(url, location.href).origin === location.origin || url.startsWith('blob:'); } catch { return false; }
}

export class SongPlayer {
  constructor(url, { level = LEVEL.song, loop = false } = {}) {
    this.url = url;
    this.level = level;
    this.el = new Audio(url);
    this.el.preload = 'auto';
    this.el.playsInline = true;
    this.el.loop = loop;
    this.gain = null; this.norm = null;
    this.muted = false;
    this.endAt = null;
    this.raf = 0;
    this.onEnd = null;
    if (!sameOrigin(url)) return; // cross-origin audio can't go through Web Audio; plays unprocessed
    try {
      sfx.ensure();
      const ctx = sfx.ctx;
      const src = ctx.createMediaElementSource(this.el);
      this.norm = ctx.createGain(); this.norm.gain.value = 1;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 4; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.2;
      this.gain = ctx.createGain(); this.gain.gain.value = 0;
      src.connect(this.norm).connect(limiter).connect(this.gain).connect(ctx.destination);
      analyze(url).then((a) => { if (this.norm) this.norm.gain.value = a.gain; });
    } catch { this.gain = null; }
  }

  get playing() { return !this.el.paused; }
  get paused() { return this.el.paused; }

  setMuted(m) {
    this.muted = m;
    if (this.gain) { const t = sfx.ctx.currentTime; this.gain.gain.cancelScheduledValues(t); this.gain.gain.setValueAtTime(m ? 0 : this.level, t); }
    else this.el.muted = m;
  }

  fadeTo(v, secs) {
    if (!this.gain) { this.el.volume = Math.min(1, v); return; }
    const t = sfx.ctx.currentTime, g = this.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.muted ? 0 : v, t + secs);
  }

  // Play from `offset` for `duration` seconds (or to the end if duration is null).
  async play(offset = 0, duration = null, onEnd = null, fadeIn = 0.06) {
    cancelAnimationFrame(this.raf);
    this.onEnd = onEnd;
    this.endAt = duration ? offset + duration : null;
    try { this.el.currentTime = offset; } catch { /* not seekable yet */ }
    if (this.gain) { this.gain.gain.cancelScheduledValues(sfx.ctx.currentTime); this.gain.gain.value = 0; }
    try { await this.el.play(); } catch { return; }
    this.fadeTo(this.level, fadeIn);
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

  // gentle pause / resume (used for the background music)
  pause(fade = 0) {
    cancelAnimationFrame(this.raf);
    if (fade && this.gain && !this.el.paused) { this.fadeTo(0, fade); setTimeout(() => this.el.pause(), fade * 1000 + 20); }
    else this.el.pause();
  }

  resume(fade = 0.05) {
    if (this.gain) this.gain.gain.value = 0;
    this.el.play().then(() => this.fadeTo(this.level, fade)).catch(() => {});
  }

  destroy() { this.onEnd = null; this.stop(0.6); setTimeout(() => { this.el.removeAttribute('src'); this.el.load(); }, 700); }
}

// Route a <video> through a gentle leveller so quiet/loud recordings come out at a normal volume.
export function levelVideo(video) {
  if (!video || video.dataset.leveled || !sameOrigin(video.currentSrc || video.src)) return;
  try {
    sfx.ensure();
    const ctx = sfx.ctx, src = ctx.createMediaElementSource(video);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    const makeup = ctx.createGain(); makeup.gain.value = 1.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.15;
    src.connect(comp).connect(makeup).connect(limiter).connect(ctx.destination);
    video.dataset.leveled = '1';
  } catch { /* leave it unprocessed */ }
}
