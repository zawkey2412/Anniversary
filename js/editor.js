// Editor for content.json: edit texts, attach media, preview, publish to GitHub in one commit.
import { PREVIEW_KEY } from './content.js';

const DRAFT_KEY = 'anniversary-editor-draft';
const GH_KEY = 'anniversary-editor-github';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let data;
const pending = new Map(); // repo path -> { blob, url }

// ---------- load ----------
async function loadSite() {
  const r = await fetch(`content.json?v=${Date.now()}`, { cache: 'no-store' });
  return r.json();
}
const draft = localStorage.getItem(DRAFT_KEY);
data = draft ? JSON.parse(draft) : await loadSite();
if (draft) console.info('Loaded draft from this browser');

function save() { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); updatePending(); }

// ---------- small form builders ----------
function field(label, obj, key, opts = {}) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const el = document.createElement(opts.textarea ? 'textarea' : 'input');
  if (!opts.textarea) el.type = opts.type || 'text';
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.rows) el.rows = opts.rows;
  const toText = opts.toText || ((v) => (v ?? ''));
  const fromText = opts.fromText || ((v) => (opts.type === 'number' ? Number(v) : v));
  el.value = toText(obj[key]);
  el.addEventListener('input', () => { obj[key] = fromText(el.value); save(); });
  wrap.appendChild(el);
  if (opts.tip) wrap.insertAdjacentHTML('beforeend', `<div class="tip">${opts.tip}</div>`);
  return wrap;
}

const linesField = (label, obj, key, tip) => field(label, obj, key, {
  textarea: true, rows: 6, tip,
  toText: (v) => (v || []).join('\n'), fromText: (v) => v.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim()),
});
const paragraphsField = (label, obj, key, tip) => field(label, obj, key, {
  textarea: true, rows: 10, tip,
  toText: (v) => (v || []).join('\n\n'), fromText: (v) => v.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
});

function panel(title, sub) {
  const p = document.createElement('section'); p.className = 'panel';
  p.innerHTML = `<h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}`;
  return p;
}

function slug(s) { return (s || 'file').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'file'; }

async function compressImage(file) {
  if (/gif|svg/.test(file.type)) return { blob: file, ext: file.name.split('.').pop() };
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return { blob, ext: 'jpg' };
  } catch {
    return { blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }
}

const mediaUrl = (path) => (path ? pending.get(path)?.url || path : '');

function mediaField(label, obj, key, kind, nameHint) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<label>${label}</label>`;
  const box = document.createElement('div'); box.className = 'media'; wrap.appendChild(box);
  const draw = () => {
    const v = obj[key] || '', url = mediaUrl(v), isLink = /^https?:/.test(v);
    let preview;
    if (!v) preview = `<div class="thumb">${kind === 'image' ? '📷' : kind === 'audio' ? '🎵' : '🎬'}<br>placeholder</div>`;
    else if (kind === 'image') preview = `<div class="thumb"><img src="${esc(url)}" alt="" /></div>`;
    else if (kind === 'audio') preview = `<audio controls src="${esc(url)}"></audio>`;
    else preview = isLink ? `<div class="thumb">🔗 link</div>` : `<video controls src="${esc(url)}"></video>`;
    const accept = kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : 'video/mp4,video/webm,video/quicktime,video/*';
    box.innerHTML = `${preview}
      <div>
        <span class="btn small file-btn">${v ? 'Replace' : 'Upload'} ${kind}<input type="file" accept="${accept}" /></span>
        ${v ? '<button class="btn small danger" data-rm>Remove</button>' : ''}
        <div class="path">${esc(v)} ${pending.has(v) ? '<span class="pending">• not published yet</span>' : ''}</div>
      </div>`;
    $('input[type=file]', box).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      let blob = file, ext = (file.name.split('.').pop() || '').toLowerCase();
      if (kind === 'image') ({ blob, ext } = await compressImage(file));
      const mb = blob.size / 1048576;
      if (mb > 95) { alert(`This file is ${mb.toFixed(0)} MB. GitHub only accepts files under 100 MB.\n\nUpload the video to YouTube as "Unlisted" (or Google Drive, "anyone with the link") and paste the link instead.`); return; }
      if (mb > 40) alert(`Heads up: ${mb.toFixed(0)} MB is big. It will work, but it may load slowly on her phone. A YouTube "Unlisted" link is lighter.`);
      if (kind === 'video' && /mov|quicktime/.test(file.type + ext)) alert('Tip: .mov videos do not play on some Android phones / Chrome. Export as .mp4 if you can.');
      const folder = kind === 'image' ? 'photos' : kind === 'audio' ? 'audio' : 'video';
      const path = `media/${folder}/${slug(nameHint())}-${Date.now().toString(36)}.${ext || 'bin'}`;
      if (pending.has(obj[key])) { URL.revokeObjectURL(pending.get(obj[key]).url); pending.delete(obj[key]); }
      pending.set(path, { blob, url: URL.createObjectURL(blob) });
      obj[key] = path; save(); draw();
    });
    $('[data-rm]', box)?.addEventListener('click', () => { if (pending.has(obj[key])) pending.delete(obj[key]); obj[key] = ''; save(); draw(); });
  };
  draw();
  if (kind === 'video') {
    const link = field('…or paste a YouTube / Google Drive link instead', obj, key, { placeholder: 'https://youtu.be/…', tip: 'YouTube: upload as <b>Unlisted</b>. Google Drive: share as <b>Anyone with the link</b>. Leave empty to use the uploaded file.' });
    $('input', link).addEventListener('change', draw);
    wrap.appendChild(link);
  }
  return wrap;
}

// ---------- render ----------
function render() {
  const app = $('#app'); app.innerHTML = '';
  const S = data.settings;

  const basics = panel('💜 Basics');
  const g = document.createElement('div'); g.className = 'grid2';
  g.append(field('Her name / nickname', S, 'herName'), field('Your name', S, 'yourName'));
  basics.append(g,
    field('Envelope hint (what the postcode is)', S, 'gateQuestion'),
    field('Postcode format hint', S, 'gateHint'),
    field('Accepted passwords (comma separated)', S, 'passwords', {
      toText: (v) => (v || []).join(', '), fromText: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      tip: 'Dots, slashes and spaces are ignored, so "08.11", "8/11" and "0811" all work. This is just a cute lock, not real security.',
    }),
    mediaField('Background music (optional, starts when she presses Start)', S, 'music', 'audio', () => 'music'));
  app.appendChild(basics);

  const intro = panel('💬 Intro chat', 'Shown like WhatsApp bubbles before the game. Write <code>Name: message</code> per line. A line without a colon is shown as a date chip.');
  intro.append(linesField('Chat lines', data.intro, 'lines'), field('Game title', data.intro, 'title'), field('Subtitle', data.intro, 'subtitle', { textarea: true, rows: 2 }), field('How to play', data.intro, 'howTo'));
  app.appendChild(intro);

  const cps = panel('✨ Checkpoints', 'She flies through a glowing ring for each one, in this order. Mix memories with guessing games.');
  data.checkpoints.forEach((cp, i) => cps.appendChild(renderCheckpoint(cp, i)));
  const add = document.createElement('div'); add.className = 'add-row';
  add.innerHTML = '<button class="btn small" data-add="memory">+ Memory 📷</button><button class="btn small" data-add="number">+ Guess the number 🔢</button><button class="btn small" data-add="song">+ Guess the song 🎧</button><button class="btn small" data-add="choice">+ Multiple choice ❓</button>';
  add.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.add;
    data.checkpoints.push(t === 'memory' ? { type: 'memory', date: '', title: 'New memory', quote: '', quoteBy: 'you', text: '', image: '', caption: '♥' }
      : t === 'number' ? { type: 'number', question: 'New question?', hint: '', answer: 0, unit: '', reveal: '' }
      : { type: t, question: t === 'song' ? 'Guess the song' : 'New question?', hint: '', ...(t === 'song' ? { audio: '' } : {}), options: ['', '', '', ''], answer: 0, reveal: '' });
    save(); render();
  }));
  cps.appendChild(add);
  app.appendChild(cps);

  const F = data.finale;
  const fin = panel('💌 Finale', 'After she lands in Bandung: the line, the clocks, then your letter and the video.');
  fin.append(field('Top label', F, 'delivered'), field('Big line', F, 'line', { textarea: true, rows: 2 }), field('Letter title', F, 'letterTitle'),
    paragraphsField('Letter', F, 'letter', 'Leave an empty line between paragraphs.'), field('Signature', F, 'signature'),
    field('Text above the video', F, 'videoNote'), mediaField('Video', F, 'video', 'video', () => 'anniversary-video'), field('Closing line', F, 'closing'));
  app.appendChild(fin);
  updatePending();
}

function renderCheckpoint(cp, i) {
  const box = document.createElement('div'); box.className = 'cp';
  const label = { memory: '📷 Memory', number: '🔢 Guess the number', song: '🎧 Guess the song', choice: '❓ Multiple choice' }[cp.type] || cp.type;
  box.innerHTML = `<div class="cp-head"><h3><span class="tag">#${i + 1}</span>${label}</h3>
    <div class="tools"><button class="btn small ghost" data-up title="move up">↑</button><button class="btn small ghost" data-down title="move down">↓</button><button class="btn small danger" data-del>Delete</button></div></div>`;
  const move = (d) => { const j = i + d; if (j < 0 || j >= data.checkpoints.length) return; [data.checkpoints[i], data.checkpoints[j]] = [data.checkpoints[j], data.checkpoints[i]]; save(); render(); };
  $('[data-up]', box).onclick = () => move(-1);
  $('[data-down]', box).onclick = () => move(1);
  $('[data-del]', box).onclick = () => { if (confirm('Delete this checkpoint?')) { data.checkpoints.splice(i, 1); save(); render(); } };

  if (cp.type === 'memory') {
    const g = document.createElement('div'); g.className = 'grid2';
    g.append(field('Date', cp, 'date'), field('Title', cp, 'title'));
    const by = document.createElement('label'); by.textContent = 'Quote said by';
    by.innerHTML += `<select><option value="you">her</option><option value="me">me</option><option value="">nobody (no name)</option></select>`;
    const sel = $('select', by); sel.value = cp.quoteBy ?? 'you'; sel.onchange = () => { cp.quoteBy = sel.value; save(); };
    box.append(g, mediaField('Photo', cp, 'image', 'image', () => cp.title), field('Polaroid caption (handwritten under the photo)', cp, 'caption'), field('Quote (from your chat)', cp, 'quote', { textarea: true, rows: 2 }), by, field('Your words', cp, 'text', { textarea: true, rows: 3 }));
  } else if (cp.type === 'number') {
    const g = document.createElement('div'); g.className = 'grid2';
    g.append(field('Correct answer', cp, 'answer', { type: 'number' }), field('Unit (shown under the number)', cp, 'unit'));
    box.append(field('Question', cp, 'question'), field('Hint', cp, 'hint'), g, field('Shown after she guesses', cp, 'reveal', { textarea: true, rows: 2 }));
  } else {
    box.append(field(cp.type === 'song' ? 'Title' : 'Question', cp, 'question'), field('Hint', cp, 'hint'));
    if (cp.type === 'song') box.append(
      mediaField('Song (upload the whole song: the game plays short clips from the start, then the full song once she answers)', cp, 'audio', 'audio', () => cp.question),
      field('Start at (seconds, optional)', cp, 'start', { type: 'number', placeholder: 'auto: skips the silence at the beginning',
        toText: (v) => (v === undefined || v === null || v === '' ? '' : v), fromText: (v) => (v.trim() === '' ? '' : Number(v)),
        tip: 'Leave empty to start where the music begins. Put e.g. 42 to start the clips at the chorus.' }));
    const opts = document.createElement('div'); opts.innerHTML = '<label>Answer options (pick the correct one with the circle)</label>';
    cp.options ||= ['', '', '', ''];
    cp.options.forEach((o, k) => {
      const row = document.createElement('div'); row.className = 'opt-row';
      row.innerHTML = `<input type="radio" name="ans-${i}" ${Number(cp.answer) === k ? 'checked' : ''} /><input type="text" placeholder="Song – Artist" />`;
      const [radio, text] = row.querySelectorAll('input');
      text.value = o; text.oninput = () => { cp.options[k] = text.value; save(); };
      radio.onchange = () => { cp.answer = k; save(); };
      opts.appendChild(row);
    });
    box.append(opts, field('Shown after she answers', cp, 'reveal', { textarea: true, rows: 2 }));
  }
  return box;
}

// ---------- referenced media ----------
function referencedPaths() {
  const out = new Set();
  const walk = (v) => { if (typeof v === 'string') { if (pending.has(v)) out.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(data); return [...out];
}
function updatePending() {
  const n = referencedPaths().length;
  $('#pending-count').textContent = n ? `${n} new file${n > 1 ? 's' : ''} + text changes waiting to publish` : 'text changes will be published';
}
window.addEventListener('beforeunload', (e) => { if (referencedPaths().length) { e.preventDefault(); e.returnValue = ''; } });

// ---------- preview / download ----------
$('#preview-btn').addEventListener('click', () => {
  const swap = (v) => (typeof v === 'string' ? mediaUrl(v) : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(swap(data)));
  const jump = $('#preview-from').value;
  window.open(`index.html?preview=1${jump ? `&jump=${jump}` : ''}`, '_blank');
});
$('#download-btn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'content.json'; a.click();
});
$('#reset-btn').addEventListener('click', async () => {
  if (!confirm('Throw away your unpublished edits and reload what is on the site?')) return;
  localStorage.removeItem(DRAFT_KEY); pending.clear(); data = await loadSite(); render();
});

// ---------- GitHub publish (single commit via the Git Data API) ----------
const ghSaved = JSON.parse(localStorage.getItem(GH_KEY) || '{}');
const guessOwner = location.hostname.endsWith('github.io') ? location.hostname.split('.')[0] : '';
const guessRepo = location.hostname.endsWith('github.io') ? location.pathname.split('/').filter(Boolean)[0] || '' : '';
$('#gh-owner').value = ghSaved.owner || guessOwner || 'zawkey2412';
$('#gh-repo').value = ghSaved.repo || guessRepo || 'Anniversary';
$('#gh-branch').value = ghSaved.branch || 'ccr-c9b17aac-mqjumn';
$('#gh-token').value = ghSaved.token || '';
$('#gh-remember').checked = !!ghSaved.token;

const log = (msg) => { const el = $('#log'); el.classList.remove('hidden'); el.textContent += msg + '\n'; el.scrollTop = el.scrollHeight; };

function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
}

$('#publish-btn').addEventListener('click', async () => {
  const owner = $('#gh-owner').value.trim(), repo = $('#gh-repo').value.trim(), branch = $('#gh-branch').value.trim() || 'main', token = $('#gh-token').value.trim();
  if (!owner || !repo || !token) { alert('Fill in owner, repository and token first.'); return; }
  localStorage.setItem(GH_KEY, JSON.stringify({ owner, repo, branch, token: $('#gh-remember').checked ? token : '' }));

  const api = async (method, path, body) => {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) { const t = await r.text(); throw new Error(`${method} ${path} → ${r.status}: ${t.slice(0, 300)}`); }
    return r.json();
  };

  const btn = $('#publish-btn'); btn.disabled = true; $('#log').textContent = '';
  try {
    log(`Connecting to ${owner}/${repo} (${branch})…`);
    const ref = await api('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
    const parent = ref.object.sha;
    const baseTree = (await api('GET', `/git/commits/${parent}`)).tree.sha;

    const tree = [];
    for (const path of referencedPaths()) {
      const { blob } = pending.get(path);
      log(`Uploading ${path} (${(blob.size / 1048576).toFixed(1)} MB)…`);
      const b = await api('POST', '/git/blobs', { content: await blobToBase64(blob), encoding: 'base64' });
      tree.push({ path, mode: '100644', type: 'blob', sha: b.sha });
    }
    log('Saving content.json…');
    tree.push({ path: 'content.json', mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' });

    const newTree = await api('POST', '/git/trees', { base_tree: baseTree, tree });
    const commit = await api('POST', '/git/commits', { message: 'Update anniversary content from editor', tree: newTree.sha, parents: [parent] });
    await api('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });

    referencedPaths().forEach((p) => { pending.get(p) && URL.revokeObjectURL(pending.get(p).url); pending.delete(p); });
    pending.clear();
    localStorage.removeItem(DRAFT_KEY);
    log(`✅ Published! Commit ${commit.sha.slice(0, 7)}. GitHub Pages will update in about a minute.`);
    render();
  } catch (err) {
    log(`❌ ${err.message}`);
    if (/401|403/.test(err.message)) log('→ Check the token: it needs "Contents: Read and write" on this repository.');
    if (/404/.test(err.message)) log('→ Check owner / repo / branch spelling.');
  } finally { btn.disabled = false; }
});

render();
