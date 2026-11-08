import { World } from './world.js';
import { loadContent, isPreview } from './content.js';
import { sfx } from './sfx.js';
import { icon, hydrateIcons } from './icons.js';

hydrateIcons();

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

const params = new URLSearchParams(location.search);
const content = await loadContent();
const S = content.settings;
const code = (c) => (c.code || c.name.slice(0, 3)).toUpperCase();

document.title = `For ${S.herName}`;
if (isPreview()) document.body.insertAdjacentHTML('beforeend', '<div class="preview-badge">PREVIEW · not published</div>');

const world = new World($('#scene'), content);
await Promise.race([world.landReady, sleep(2500)]);
$('#loading').classList.add('done');

// unlock audio on the very first interaction anywhere
window.addEventListener('pointerdown', () => sfx.ensure(), { once: true });
window.addEventListener('keydown', () => sfx.ensure(), { once: true });

// ---------- music + mute ----------
const music = $('#music');
let soundOn = true;
function startMusic() {
  if (!S.music) return;
  music.src = S.music; music.volume = 0.5; music.muted = !soundOn;
  music.play().catch(() => {});
}
$('#mute-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  soundOn = !soundOn; music.muted = !soundOn; sfx.muted = !soundOn;
  $('#mute-btn').innerHTML = icon(soundOn ? 'volume' : 'mute');
  if (soundOn) sfx.play('tap');
});

function show(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); }

function rubberStamp(text, color = 'red', extra = '') {
  return `<div class="rubber-stamp ${color} ${extra}">${esc(text)}</div>`;
}

// ---------- 1. gate (envelope) ----------
$('#gate-to').textContent = S.herName;
$('#gate-from').textContent = `from: ${S.yourName}, ${S.cityB.name}`;
$('#gate-hint').textContent = `${S.gateQuestion} · ${S.gateHint}`;

function normalizeDate(v) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, kas: 11 };
  const low = String(v).toLowerCase();
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
  const allowed = (S.passwords || []).map(normalizeDate);
  if (!allowed.length) return true;
  return n.length >= 4 && allowed.some((p) => p === n || p.slice(0, 4) === n.slice(0, 4));
}

$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfx.ensure();
  const v = $('#gate-input').value.trim();
  const err = $('#gate-error');
  if (checkPassword(v)) {
    err.classList.add('hidden');
    sfx.play('rustle');
    sessionStorage.setItem('unlocked', '1');
    runIntro();
  } else {
    const msgs = ['RETURN TO SENDER', 'WRONG POSTCODE', 'SALAK', 'TRY AGAIN', 'dkdldk NO'];
    err.textContent = msgs[(Math.random() * msgs.length) | 0];
    err.classList.remove('hidden'); err.style.animation = 'none'; void err.offsetWidth; err.style.animation = '';
    sfx.play('stamp');
    const env = $('.envelope-front'); env.classList.remove('shake'); void env.offsetWidth; env.classList.add('shake');
  }
});

// ---------- 2. intro: telegram → boarding pass ----------
async function typeInto(el, text) {
  const caret = document.createElement('span'); caret.className = 'caret';
  el.appendChild(caret);
  for (let i = 0; i < text.length; i++) {
    caret.before(text[i]);
    if (i % 2 === 0 && text[i] !== ' ') sfx.play('type', { jitter: 0.25 });
    await sleep(text[i] === ' ' ? 30 : 38);
  }
  caret.remove();
}

let introRunning = false;
async function runIntro() {
  if (introRunning) return; introRunning = true;
  show('intro');
  $('#telegram').classList.remove('hidden');
  $('#boarding').classList.add('hidden');
  const box = $('#tg-lines'); box.innerHTML = '';
  const lines = [...content.intro.lines];
  const first = lines[0] && !/^[^:]{1,30}:/.test(lines[0]) ? lines.shift() : '';
  $('#tg-meta').textContent = `No. 0001 · ${first || ''} · ${code(S.cityA)} – ${code(S.cityB)}`;
  await sleep(700);
  for (const line of lines) {
    const m = line.match(/^([^:]{1,30}):\s*(.*)$/);
    const row = document.createElement('div'); row.className = 'tg-line';
    box.appendChild(row);
    if (!m) { row.classList.add('date'); await typeInto(row, line); await sleep(250); continue; }
    const who = m[1].trim();
    if (who.toLowerCase() === S.yourName.toLowerCase()) row.classList.add('mine');
    row.innerHTML = `<b>${esc(who.toUpperCase())}:</b> `;
    await typeInto(row, m[2]);
    await sleep(420);
  }
  await sleep(600);
  $('#intro-title').textContent = content.intro.title;
  $('#intro-subtitle').textContent = content.intro.subtitle.replace('9,571', fmt(world.distanceKm));
  $('#intro-howto').textContent = content.intro.howTo;
  $('#bp-from-code').textContent = code(S.cityA); $('#bp-from').textContent = S.cityA.name;
  $('#bp-to-code').textContent = code(S.cityB); $('#bp-to').textContent = S.cityB.name;
  $('#bp-km').textContent = `${fmt(world.distanceKm)} km`;
  $('#telegram').classList.add('hidden');
  $('#boarding').classList.remove('hidden');
  sfx.play('paper');
  introRunning = false;
}

$('#start-btn').addEventListener('click', () => { sfx.ensure(); sfx.play('board'); startMusic(); beginGame(); });

// ---------- 3. game ----------
function beginGame() {
  show(null);
  $('#hud-from').textContent = code(S.cityA); $('#hud-to').textContent = code(S.cityB);
  $('#hud-stars').textContent = '0';
  world.startGame();
}
world.on('gameStarted', () => { $('#hud').classList.remove('hidden'); $('#touch-hint').classList.remove('hidden'); });
world.on('firstInput', () => $('#touch-hint').classList.add('hidden'));
world.on('stars', (n) => { $('#hud-stars').textContent = String(n); });

let lastKm = -1;
(function hudLoop() {
  const p = world.progress;
  $('#progress-bar').style.width = `${p * 100}%`;
  $('#progress-plane').style.left = `${p * 100}%`;
  const km = Math.round(world.distanceKm * (1 - p));
  if (km !== lastKm) { lastKm = km; $('#hud-km').textContent = km > 0 ? `${fmt(km)} km to go` : 'arrived'; }
  requestAnimationFrame(hudLoop);
})();

world.on('checkpoint', (i) => {
  world.pause(true);
  $('#touch-hint').classList.add('hidden');
  openCheckpoint(content.checkpoints[i], i, () => { sfx.play('place'); closeModal(); world.pause(false); });
});
world.on('arrived', () => {
  $('#hud').classList.add('hidden'); $('#touch-hint').classList.add('hidden');
  setTimeout(() => world.toFinale(), 400);
  setTimeout(showFinale, 2800);
});

// ---------- checkpoint cards ----------
const modal = $('#modal'), card = $('#modal-card');
function closeModal() { modal.classList.add('hidden'); card.innerHTML = ''; stopClip(); }
function openModal(html) { card.innerHTML = html; modal.classList.remove('hidden'); card.scrollTop = 0; }
const whoName = (q) => (q === 'me' ? S.yourName : q === 'you' ? S.herName : q || '');
const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function postmarkDate(d = '') {
  let m = d.match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/i);
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); if (mi >= 0) return `${pad2(m[1])}·${pad2(mi + 1)}·${m[3].slice(2)}`; }
  m = d.match(/([a-z]+)\s+(\d{4})/i);
  if (m) return `${m[1].slice(0, 3).toUpperCase()}·${m[2].slice(2)}`;
  return '';
}
const continueBtn = `<div class="card-actions"><button class="btn-red" data-continue>${icon('mail')}<span>Keep going</span></button></div>`;
function bindContinue(done) { const b = card.querySelector('[data-continue]'); b.onclick = () => { sfx.play('tap'); done(); }; return b; }

function openCheckpoint(cp, i, done) {
  if (cp.type === 'memory') return openMemory(cp, i, done);
  if (cp.type === 'number') return openNumber(cp, i, done);
  if (cp.type === 'song' || cp.type === 'choice') return openSong(cp, i, done);
  done();
}

function openMemory(cp, i, done) {
  const city = cp.quoteBy === 'me' ? S.cityB : S.cityA;
  const pic = cp.image
    ? `<img src="${esc(cp.image)}" alt="" />`
    : `${icon('image', { size: '34px', stroke: 1.5 })}<small>photo goes here</small>`;
  openModal(`
    <div class="postcard airmail">
      <div class="postmark pc-postmark"><span>${esc(city.name.toUpperCase())}</span><b>${esc(postmarkDate(cp.date))}</b><span>· · ·</span></div>
      <div class="pc-no">No. ${pad2(i + 1)} — ${esc(cp.date || '')}</div>
      <h2 class="pc-title">${esc(cp.title)}</h2>
      <div class="polaroid"><div class="tape"></div><div class="pic">${pic}</div><div class="caption">${esc(cp.caption || '')}</div></div>
      ${cp.quote ? `<p class="pc-quote">“${esc(cp.quote)}”</p><p class="pc-by">— ${esc(whoName(cp.quoteBy))}</p>` : ''}
      <p class="pc-text">${esc(cp.text)}</p>
      ${continueBtn}
    </div>`);
  sfx.play('paper');
  bindContinue(done);
}

function openNumber(cp, i, done) {
  openModal(`
    <div class="telegram-card">
      <div class="tg-head"><span>TELEGRAM</span><span>No. ${pad2(i + 1)}</span></div>
      <p class="tq-q">${esc(cp.question)}</p>
      ${cp.hint ? `<p class="tq-hint">${esc(cp.hint)}</p>` : ''}
      <form data-form>
        <input class="num-input" inputmode="numeric" placeholder="your guess" aria-label="your guess" />
        <div class="card-actions"><button class="btn-red" type="submit">${icon('send')}<span>Send</span></button></div>
      </form>
      <div data-result></div>
    </div>`);
  sfx.play('paper');
  const form = card.querySelector('[data-form]'), input = card.querySelector('input');
  setTimeout(() => input.focus(), 350);
  form.onsubmit = (e) => {
    e.preventDefault();
    const g = Number(input.value.replace(/[^\d.]/g, ''));
    if (!input.value.trim() || Number.isNaN(g)) { input.focus(); return; }
    const a = Number(cp.answer), off = Math.abs(g - a) / Math.max(1, a);
    const [label, color, good] = off === 0 ? ['EXACTLY?!', 'blue', true]
      : off <= 0.05 ? ['SO CLOSE', 'blue', true]
      : off <= 0.25 ? ['WARM', 'blue', true]
      : off <= 0.6 ? ['NOT QUITE', 'red', false]
      : [g > a ? 'WAY TOO HIGH' : 'WAY TOO LOW', 'red', false];
    form.remove();
    card.querySelector('[data-result]').innerHTML = `
      <div class="tq-reveal">
        <p class="tq-you">you said ${fmt(g)}</p>
        <div class="tq-number" data-count>0</div>
        <p class="tq-unit">${esc(cp.unit || '')}</p>
        <div data-stamp></div>
        <p class="tq-text">${esc(cp.reveal || '')}</p>
      </div>
      ${continueBtn}`;
    const countEl = card.querySelector('[data-count]'), stampEl = card.querySelector('[data-stamp]');
    countUp(countEl, a, () => {
      if (!stampEl.isConnected) return; // card already closed
      stampEl.innerHTML = rubberStamp(label, color);
      sfx.play('stamp'); setTimeout(() => sfx.play(good ? 'correct' : 'wrong'), 180);
    });
    bindContinue(done);
  };
}

function countUp(el, target, then) {
  const start = performance.now(), dur = 1300;
  let lastTick = 0;
  (function step(now) {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(target * e));
    if (now - lastTick > 70 && p < 1) { lastTick = now; sfx.play('type', { vol: 0.7, jitter: 0.3 }); }
    if (!el.isConnected) return;
    if (p < 1) requestAnimationFrame(step); else then?.();
  })(start);
}

let clip = null;
function stopClip() { if (clip) { clip.pause(); clip = null; } if (S.music && soundOn) music.play().catch(() => {}); }

function openSong(cp, i, done) {
  const opts = (cp.options || []).map((o, k) => `<button class="option" data-i="${k}">${esc(o || '…')}</button>`).join('');
  const isSong = cp.type === 'song';
  openModal(`
    <div class="tape-card">
      <div class="pc-no">No. ${pad2(i + 1)} — ${isSong ? 'guess the song' : 'quick question'}</div>
      <h2 class="pc-title" style="margin-right:0">${esc(cp.question)}</h2>
      ${cp.hint ? `<p class="tq-hint">${esc(cp.hint)}</p>` : ''}
      ${isSong ? `<div class="cassette" data-cassette>
        <div class="label"><span>mixtape for ${esc(S.herName)}</span></div>
        <div class="window"><div class="reel"></div><div class="reel"></div></div>
        <div class="bottom"></div>
        ${cp.audio ? `<button class="play-btn" data-play aria-label="play">${icon('play')}</button>` : ''}
      </div>` : ''}
      <div class="options">${opts}</div>
      <div data-result></div>
    </div>`);
  sfx.play('paper');
  const play = card.querySelector('[data-play]'), cas = card.querySelector('[data-cassette]');
  if (play) {
    play.onclick = () => {
      if (clip && !clip.paused) { clip.pause(); play.innerHTML = icon('play'); cas.classList.remove('playing'); return; }
      if (S.music) music.pause();
      clip = clip || new Audio(cp.audio); clip.muted = !soundOn;
      clip.play().catch(() => {}); play.innerHTML = icon('pause'); cas.classList.add('playing');
      clip.onended = () => { play.innerHTML = icon('play'); cas.classList.remove('playing'); };
    };
  }
  card.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      const k = Number(b.dataset.i), right = k === Number(cp.answer);
      card.querySelectorAll('.option').forEach((x) => { x.disabled = true; if (Number(x.dataset.i) === Number(cp.answer)) x.classList.add('correct'); });
      if (!right) b.classList.add('wrong');
      sfx.play('stamp'); setTimeout(() => sfx.play(right ? 'correct' : 'wrong'), 180);
      card.querySelector('[data-result]').innerHTML = `
        <div class="tq-reveal">${rubberStamp(right ? 'YOU KNOW US' : 'NOPE', right ? 'blue' : 'red')}</div>
        <p class="tq-text">${esc(cp.reveal || '')}</p>
        ${continueBtn}`;
      bindContinue(done).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });
}

// ---------- 4. finale ----------
function clockHTML() {
  return [S.cityA, S.cityB].map((c) => {
    let t = '';
    try { t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: c.timeZone }).format(new Date()); } catch { /* ignore */ }
    return `<div class="stamp clock"><div class="clock-in"><small>${esc(c.name.toUpperCase())}</small><b>${t}</b><span>${esc(c.who === 'me' ? S.yourName : S.herName)}</span></div></div>`;
  }).join('');
}

function videoHTML(src) {
  const note = esc(content.finale.videoNote || '');
  let inner;
  const yt = src && src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  const drive = src && src.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (!src) inner = `<div class="video-placeholder">${icon('film', { size: '36px', stroke: 1.5 })}<span>video goes here</span></div>`;
  else if (yt) inner = `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="video"></iframe>`;
  else if (drive) inner = `<iframe src="https://drive.google.com/file/d/${drive[1]}/preview" allow="autoplay; fullscreen" allowfullscreen title="video"></iframe>`;
  else inner = `<video src="${esc(src)}" controls playsinline preload="metadata"></video>`;
  return `<div class="video-frame"><div class="tape"></div>${inner}<div class="caption">${note}</div></div>`;
}

function showFinale() {
  const f = content.finale;
  $('#delivered-stamp').textContent = f.delivered;
  $('#finale-line').textContent = f.line.replace('9,571', fmt(world.distanceKm));
  $('#clocks').innerHTML = clockHTML();
  $('#letter-title').textContent = f.letterTitle;
  $('#letter-body').innerHTML = (f.letter || []).map((p) => `<p>${esc(p)}</p>`).join('');
  $('#letter-sign').textContent = f.signature;
  $('#video-wrap').innerHTML = videoHTML(f.video);
  $('#closing').innerHTML = `${esc(f.closing)} ${icon('heart', { cls: 'closing-heart' })}`;
  const n = world.starsCollected;
  $('#finale-stats').innerHTML = n ? `${icon('star')} ${n} stars caught = ${n} I-love-yous I owe you` : '';
  $('#letter').classList.add('hidden');
  $('#env').classList.remove('open');
  $('#env-wrap').classList.remove('hidden');
  const st = $('#delivered-stamp'); st.style.animation = 'none'; void st.offsetWidth; st.style.animation = '';
  show('finale');
  setTimeout(() => sfx.play('stamp'), 250);
}

$('#letter-btn').addEventListener('click', async () => {
  sfx.ensure(); sfx.play('open');
  $('#env').classList.add('open');
  setTimeout(() => sfx.play('rustle'), 450);
  await sleep(1500);
  $('#env-wrap').classList.add('hidden');
  $('#letter').classList.remove('hidden');
  sfx.play('paper');
  setTimeout(() => $('#finale').scrollTo({ top: Math.max(0, $('#letter').offsetTop - 24), behavior: 'smooth' }), 60);
});

$('#replay-btn').addEventListener('click', () => {
  sfx.play('tap');
  document.querySelector('#video-wrap video')?.pause();
  $('#video-wrap').innerHTML = '';
  $('#finale').scrollTop = 0;
  beginGame();
});

// ---------- shortcuts for the editor preview: ?jump=intro | game | finale ----------
const jump = params.get('jump');
if (jump === 'finale') { world.showFinaleDirect(); showFinale(); }
else if (jump === 'game') beginGame();
else if (jump === 'intro') runIntro();
