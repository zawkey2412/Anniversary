import { World } from './world.js';
import { loadContent, isPreview } from './content.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

const params = new URLSearchParams(location.search);
const content = await loadContent();
const S = content.settings;

document.title = `${S.herName} 🌙`;
if (isPreview()) document.body.insertAdjacentHTML('beforeend', '<div class="preview-badge">PREVIEW (not published)</div>');

const world = new World($('#scene'), content);
await Promise.race([world.landReady, sleep(2500)]);
$('#loading').classList.add('done');

// ---------- music ----------
const music = $('#music');
let musicOn = false;
function startMusic() {
  if (!S.music) return;
  music.src = S.music; music.volume = 0.55;
  music.play().then(() => { musicOn = true; $('#mute-btn').classList.remove('hidden'); }).catch(() => {});
}
$('#mute-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  musicOn = !musicOn; music.muted = !musicOn; world.sfx.muted = !musicOn;
  $('#mute-btn').textContent = musicOn ? '🔊' : '🔇';
});

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

// ---------- 1. gate ----------
$('#gate-question').textContent = S.gateQuestion;
$('#gate-hint').textContent = S.gateHint;

function normalizeDate(v) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, kas: 11, kasım: 11, kasim: 11 };
  const low = v.toLowerCase();
  const parts = low.split(/[^0-9a-zçğıöşü]+/).filter(Boolean);
  if (parts.length >= 2) {
    let [d, m, y] = parts;
    const mk = Object.keys(months).find((k) => m.startsWith(k));
    if (mk) m = String(months[mk]);
    if (/^\d+$/.test(d) && /^\d+$/.test(m)) return d.padStart(2, '0') + m.padStart(2, '0') + (y ? (y.length === 2 ? '20' + y : y) : '');
  }
  return low.replace(/\D/g, '');
}
function checkPassword(v) {
  const n = normalizeDate(v);
  const allowed = (S.passwords || []).map((p) => normalizeDate(p));
  return allowed.some((p) => p === n || p.slice(0, 4) === n.slice(0, 4) && n.length >= 4) || allowed.length === 0;
}

$('#gate-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#gate-input').value.trim();
  if (checkPassword(v)) { sessionStorage.setItem('unlocked', '1'); runIntro(); }
  else {
    const errs = ['Hmm… are you sure? 🤨', 'Salak 😌 try again', 'Think about the night it started 🌙', 'dkdldkdl no 😭'];
    $('#gate-error').textContent = errs[(Math.random() * errs.length) | 0];
    $('#gate-form').classList.remove('shake'); void $('#gate-form').offsetWidth; $('#gate-form').classList.add('shake');
  }
});

// ---------- 2. intro chat ----------
async function runIntro() {
  show('intro');
  const chat = $('#chat'); chat.innerHTML = '';
  for (const line of content.intro.lines) {
    const m = line.match(/^([^:]{1,30}):\s*(.*)$/);
    if (!m) { chat.insertAdjacentHTML('beforeend', `<div class="date">${esc(line)}</div>`); await sleep(500); continue; }
    const who = m[1].trim(), text = m[2];
    const mine = who.toLowerCase() === S.yourName.toLowerCase();
    const typing = document.createElement('div'); typing.className = 'typing'; typing.innerHTML = '<span></span><span></span><span></span>';
    if (mine) typing.style.alignSelf = 'flex-end';
    chat.appendChild(typing); await sleep(650 + Math.min(text.length * 18, 900));
    typing.remove();
    chat.insertAdjacentHTML('beforeend', `<div class="bubble ${mine ? 'me' : 'her'}"><small>${esc(who)}</small>${esc(text)}</div>`);
    await sleep(350);
  }
  await sleep(700);
  $('#intro-title').textContent = content.intro.title;
  $('#intro-subtitle').textContent = content.intro.subtitle.replace('9,571', fmt(world.distanceKm));
  $('#intro-howto').textContent = content.intro.howTo;
  $('#intro-card').classList.remove('hidden');
}

$('#start-btn').addEventListener('click', () => { startMusic(); beginGame(); });

// ---------- 3. game ----------
function beginGame() {
  show(null);
  $('#hud-from').textContent = S.cityA.name; $('#hud-to').textContent = S.cityB.name;
  world.startGame();
}
world.on('gameStarted', () => {
  $('#hud').classList.remove('hidden');
  $('#touch-hint').classList.remove('hidden');
});
world.on('firstInput', () => $('#touch-hint').classList.add('hidden'));
world.on('stars', (n) => { $('#hud-stars').textContent = `⭐ ${n}`; });

let lastKm = -1;
(function hudLoop() {
  const p = world.progress;
  $('#progress-bar').style.width = `${p * 100}%`;
  $('#progress-heart').style.left = `${p * 100}%`;
  const km = Math.round(world.distanceKm * (1 - p));
  if (km !== lastKm) { lastKm = km; $('#hud-km').textContent = km > 0 ? `${fmt(km)} km to go` : 'arrived 💜'; }
  requestAnimationFrame(hudLoop);
})();

world.on('checkpoint', (i) => {
  world.pause(true);
  $('#touch-hint').classList.add('hidden');
  openCheckpoint(content.checkpoints[i], () => { closeModal(); world.pause(false); });
});
world.on('arrived', () => { $('#hud').classList.add('hidden'); $('#touch-hint').classList.add('hidden'); setTimeout(() => world.toFinale(), 400); setTimeout(showFinale, 2600); });

// ---------- checkpoints ----------
const modal = $('#modal'), card = $('#modal-card');
function closeModal() { modal.classList.add('hidden'); card.innerHTML = ''; stopAudio(); }
function openModal(html) { card.innerHTML = html; modal.classList.remove('hidden'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; card.scrollTop = 0; }

function photoHTML(src, label = 'photo') {
  return src
    ? `<div class="photo has-img"><img src="${esc(src)}" alt="" loading="eager" /></div>`
    : `<div class="photo"><div class="ph-icon">📷</div><div>${esc(label)} placeholder</div><div style="opacity:.7">add it in the editor</div></div>`;
}

function whoName(q) { return q === 'me' ? S.yourName : q === 'you' ? S.herName : q || ''; }

function openCheckpoint(cp, done) {
  if (cp.type === 'memory') return openMemory(cp, done);
  if (cp.type === 'number') return openNumber(cp, done);
  if (cp.type === 'song') return openSong(cp, done);
  done();
}

function openMemory(cp, done) {
  openModal(`
    <p class="eyebrow">${esc(cp.date)}</p>
    <h2>${esc(cp.title)}</h2>
    ${photoHTML(cp.image)}
    ${cp.quote ? `<p class="quote">${esc(cp.quote)}</p><p class="quote-by">— ${esc(whoName(cp.quoteBy))}</p>` : ''}
    <p class="memory-text">${esc(cp.text)}</p>
    <button class="btn" data-continue>Keep flying 💜</button>`);
  card.querySelector('[data-continue]').onclick = done;
}

function openNumber(cp, done) {
  openModal(`
    <p class="eyebrow">guess the number</p>
    <h2>${esc(cp.question)}</h2>
    <p class="hint">${esc(cp.hint || '')}</p>
    <form data-form><input class="num-input" inputmode="numeric" placeholder="your guess" aria-label="your guess" />
    <button class="btn" type="submit">Guess 🔮</button></form>
    <div data-result></div>`);
  const form = card.querySelector('[data-form]'), input = card.querySelector('input');
  setTimeout(() => input.focus(), 300);
  form.onsubmit = (e) => {
    e.preventDefault();
    const g = Number(input.value.replace(/[^\d.]/g, ''));
    if (!input.value.trim() || Number.isNaN(g)) { input.focus(); return; }
    const a = Number(cp.answer), off = Math.abs(g - a) / Math.max(1, a);
    const v = off === 0 ? ['🎯 EXACTLY?! how?!', '💜💜💜💜']
      : off <= 0.05 ? ['So close it\'s scary 😳', '💜💜💜']
      : off <= 0.25 ? ['Warm! 🔥', '💜💜']
      : off <= 0.6 ? ['Hmm, not quite 🤏', '💜']
      : [g > a ? 'Way too high 😂' : 'Way too low 🥶', '🙈'];
    world.sfx.chime();
    form.remove();
    card.querySelector('[data-result]').innerHTML = `
      <p class="hint">you said ${fmt(g)}</p>
      <div class="big-number" data-count>0</div>
      <p class="hint" style="margin-top:4px">${esc(cp.unit || '')}</p>
      <p class="verdict">${v[0]}<br>${v[1]}</p>
      <p class="memory-text">${esc(cp.reveal || '')}</p>
      <button class="btn" data-continue>Keep flying 💜</button>`;
    countUp(card.querySelector('[data-count]'), a);
    card.querySelector('[data-continue]').onclick = done;
  };
}

function countUp(el, target) {
  const start = performance.now(), dur = 1400;
  (function step(now) {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(target * e));
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

let clip = null;
function stopAudio() { if (clip) { clip.pause(); clip = null; } if (musicOn) music.play().catch(() => {}); }

function openSong(cp, done) {
  const opts = (cp.options || []).map((o, i) => `<button class="option" data-i="${i}">${esc(o)}</button>`).join('');
  openModal(`
    <p class="eyebrow">guess the song</p>
    <h2>${esc(cp.question)}</h2>
    <p class="hint">${esc(cp.hint || '')}</p>
    ${cp.audio
      ? `<div class="player"><button class="play-btn" data-play aria-label="play clip">▶</button><span class="hint" style="margin:0">tap to listen</span></div>`
      : `<div class="no-audio">🎵 song clip placeholder: upload a short clip in the editor</div>`}
    <div class="options">${opts}</div>
    <div data-result></div>`);
  const play = card.querySelector('[data-play]');
  if (play) {
    play.onclick = () => {
      if (clip && !clip.paused) { clip.pause(); play.textContent = '▶'; play.classList.remove('playing'); return; }
      if (musicOn) music.pause();
      clip = clip || new Audio(cp.audio);
      clip.play().catch(() => {}); play.textContent = '❚❚'; play.classList.add('playing');
      clip.onended = () => { play.textContent = '▶'; play.classList.remove('playing'); };
    };
  }
  card.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.i), right = i === Number(cp.answer);
      card.querySelectorAll('.option').forEach((x) => { x.disabled = true; if (Number(x.dataset.i) === Number(cp.answer)) x.classList.add('correct'); });
      if (!right) b.classList.add('wrong');
      world.sfx.chime();
      card.querySelector('[data-result]').innerHTML = `
        <p class="verdict">${right ? 'YES! You know us too well 🎶💜' : 'Nooo 😭 it was this one!'}</p>
        <p class="memory-text">${esc(cp.reveal || '')}</p>
        <button class="btn" data-continue>Keep flying 💜</button>`;
      card.querySelector('[data-continue]').onclick = done;
      card.querySelector('[data-continue]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });
}

// ---------- 4. finale ----------
function clockHTML() {
  return [S.cityA, S.cityB].map((c) => {
    let t = '';
    try { t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: c.timeZone }).format(new Date()); } catch { /* ignore */ }
    return `<div class="clock"><b>${t}</b><span>${esc(c.name)} · ${esc(c.who === 'me' ? S.yourName : S.herName)}</span></div>`;
  }).join('');
}

function videoHTML(src) {
  if (!src) return `<p class="video-note">${esc(content.finale.videoNote)}</p><div class="video-placeholder"><b>🎬</b><span>video placeholder</span><small>upload it in the editor</small></div>`;
  const yt = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  const drive = src.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  const note = `<p class="video-note">${esc(content.finale.videoNote)}</p>`;
  if (yt) return `${note}<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="video"></iframe>`;
  if (drive) return `${note}<iframe src="https://drive.google.com/file/d/${drive[1]}/preview" allow="autoplay; fullscreen" allowfullscreen title="video"></iframe>`;
  return `${note}<video src="${esc(src)}" controls playsinline preload="metadata"></video>`;
}

function showFinale() {
  const f = content.finale;
  $('#finale-delivered').textContent = f.delivered;
  $('#finale-line').textContent = f.line.replace('9,571', fmt(world.distanceKm));
  $('#clocks').innerHTML = clockHTML();
  $('#letter-title').textContent = f.letterTitle;
  $('#letter-body').innerHTML = (f.letter || []).map((p) => `<p>${esc(p)}</p>`).join('');
  $('#letter-sign').textContent = f.signature;
  $('#video-wrap').innerHTML = videoHTML(f.video);
  $('#closing').textContent = f.closing;
  const n = world.starsCollected;
  $('#finale-stats').textContent = n ? `You caught ${n} stars on the way. Each one is an "I love you" I owe you. ⭐` : '';
  $('#letter').classList.add('hidden');
  $('#letter-btn').classList.remove('hidden');
  show('finale');
}
$('#letter-btn').addEventListener('click', () => {
  $('#letter-btn').classList.add('hidden');
  $('#letter').classList.remove('hidden');
  $('#letter').scrollIntoView({ behavior: 'smooth', block: 'start' });
  world.sfx.chime();
});
$('#replay-btn').addEventListener('click', () => {
  const v = document.querySelector('#video-wrap video'); v?.pause();
  $('#video-wrap').innerHTML = '';
  $('#hud-stars').textContent = '⭐ 0';
  beginGame();
});

// ---------- dev / preview shortcuts: ?jump=game | finale | intro ----------
const jump = params.get('jump');
if (jump === 'finale') { world.showFinaleDirect(); showFinale(); }
else if (jump === 'game') beginGame();
else if (jump === 'intro' || sessionStorage.getItem('unlocked') === '1' && isPreview()) runIntro();
