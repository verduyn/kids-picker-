'use strict';
const APP_VERSION = '1.0.0';
const MEDIA = 'bv-media';
const HOLD_EXIT_MS = 3000, HOLD_GEAR_MS = 2000, CORNER = 110;
const PALETTE = ['#FF6B6B', '#FF9F43', '#1DD1A1', '#54A0FF', '#A55EEA', '#F368E0', '#10AC84', '#2E86DE', '#EE5253', '#5F27CD'];
const $ = id => document.getElementById(id);
const base = new URL('./', location.href);
const mediaUrl = (num, file) => new URL(`media/${num}/${encodeURIComponent(file)}`, base).href;
const thumbUrl = (num, file) => mediaUrl(num, file) + '.jpg';

// ---------- library (stories known to this iPad) ----------
// local = { stories: {num: story}, meta: {"num/file": {hue}} } kept in localStorage (small).
let local = JSON.parse(localStorage.getItem('bv-lib') || 'null') || { stories: {}, meta: {} };
let remote = null;       // library.json from the web host, if one was published
let have = new Set();    // "num/file" keys present in Cache Storage
const saveLocal = () => localStorage.setItem('bv-lib', JSON.stringify(local));
const key = (num, file) => num + '/' + file;

function allStories() {
  const map = {};
  if (remote) for (const s of remote.stories) map[s.num] = s;
  for (const n in local.stories) {
    const l = local.stories[n], r = map[n];
    if (!r) { map[n] = l; continue; }
    const vids = r.videos.slice();
    for (const v of l.videos) if (!vids.find(x => x.file === v.file)) vids.push(v);
    map[n] = Object.assign({}, r, { videos: vids.sort((a, b) => Intro.numericOrder(a.file, b.file)) });
  }
  return Object.values(map).sort((a, b) => a.num - b.num);
}
const ready = s => s.videos.filter(v => have.has(key(s.num, v.file)));

async function refreshHave() {
  const c = await caches.open(MEDIA);
  have = new Set();
  for (const r of await c.keys()) {
    const p = new URL(r.url).pathname, i = p.indexOf('/media/');
    if (i < 0 || p.endsWith('.jpg')) continue;
    const [num, f] = p.slice(i + 7).split('/');
    have.add(key(num, decodeURIComponent(f)));
  }
}

// ---------- kid screens ----------
let view = { story: null };
function tile(label, img, color, badge, onTap) {
  const b = document.createElement('button');
  b.className = 'tile'; b.style.background = color;
  b.innerHTML = `<div class="pic"></div><div class="label"></div>`;
  if (img) b.querySelector('.pic').style.backgroundImage = `url("${img}")`;
  if (badge != null) { const s = document.createElement('span'); s.className = 'badge'; s.textContent = badge; b.querySelector('.pic').appendChild(s); }
  b.querySelector('.label').textContent = label;
  b.addEventListener('click', onTap);
  return b;
}
function hueColor(h, i) { return h == null || h < 0 ? PALETTE[i % PALETTE.length] : `hsl(${Math.round(h)}, 70%, 55%)`; }

function render() {
  const grid = $('grid'), empty = $('empty');
  grid.innerHTML = '';
  const stories = allStories().filter(s => ready(s).length);
  if (view.story != null && !stories.find(s => s.num === view.story)) view.story = null;
  $('back').hidden = view.story == null;
  if (!stories.length) {
    $('title').textContent = 'Bible Videos';
    empty.hidden = false;
    empty.innerHTML = 'No videos on this iPad yet.<br><br>Grown-ups: press and hold &#x2699; for 2 seconds to add stories.';
    return;
  }
  empty.hidden = true;
  if (view.story == null) {
    $('title').textContent = 'Bible Videos';
    stories.forEach((s, i) => {
      const first = ready(s)[0], m = local.meta[key(s.num, first.file)] || {};
      grid.appendChild(tile(s.title, thumbUrl(s.num, first.file), hueColor(m.hue, i), s.num, () => { view.story = s.num; render(); window.scrollTo(0, 0); }));
    });
  } else {
    const s = stories.find(x => x.num === view.story);
    $('title').textContent = s.title;
    ready(s).forEach((v, i) => {
      const m = local.meta[key(s.num, v.file)] || {};
      grid.appendChild(tile(v.style, thumbUrl(s.num, v.file), hueColor(m.hue, i + s.num), null, () => play(s, v)));
    });
  }
}
$('back').addEventListener('click', () => { view.story = null; render(); });

// ---------- player: full screen, no controls, taps ignored, hidden 3 s corner hold to exit ----------
const video = $('video'), shield = $('shield'), ring = $('ring'), ringfg = $('ringfg');
let holdTimer = null, holdStart = 0, holdId = null;
function play(s, v) {
  $('player').hidden = false;
  video.controls = false;
  video.src = mediaUrl(s.num, v.file);
  const p = video.play(); // inside the tap, so sound is allowed
  if (p) p.catch(() => { video.muted = true; video.play().catch(() => {}); });
  const el = document.documentElement;
  if (!isStandalone() && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  window.__lastPlayed = mediaUrl(s.num, v.file);
}
function closePlayer() {
  cancelHold(); video.pause(); video.removeAttribute('src'); video.load(); video.muted = false;
  $('player').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
video.addEventListener('ended', closePlayer);
video.addEventListener('pause', () => { if (!$('player').hidden && !video.ended && video.src) video.play().catch(() => {}); }); // kids can't pause
function startHold(id) {
  holdId = id; holdStart = performance.now(); ring.hidden = false;
  const tick = () => {
    const f = Math.min(1, (performance.now() - holdStart) / HOLD_EXIT_MS);
    ringfg.style.strokeDashoffset = String(251.3 * (1 - f));
    if (f >= 1) { closePlayer(); return; }
    holdTimer = requestAnimationFrame(tick);
  };
  holdTimer = requestAnimationFrame(tick);
}
function cancelHold() { if (holdTimer) cancelAnimationFrame(holdTimer); holdTimer = null; holdId = null; ring.hidden = true; ringfg.style.strokeDashoffset = '251.3'; }
shield.addEventListener('pointerdown', e => { e.preventDefault(); if (holdId == null && e.clientX < CORNER && e.clientY < CORNER) startHold(e.pointerId); });
shield.addEventListener('pointermove', e => { if (e.pointerId === holdId && (e.clientX > CORNER * 1.5 || e.clientY > CORNER * 1.5)) cancelHold(); });
for (const t of ['pointerup', 'pointercancel']) shield.addEventListener(t, e => { if (e.pointerId === holdId) cancelHold(); });
for (const t of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'])
  $('player').addEventListener(t, e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- hidden grown-up button: hold the gear for 2 s ----------
let gearT = null;
const gear = $('gear');
gear.addEventListener('pointerdown', () => { gearT = setTimeout(openParent, HOLD_GEAR_MS); });
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(t, () => clearTimeout(gearT));
gear.addEventListener('click', () => toast('Grown-ups: press and hold for 2 seconds'));
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- grown-ups screen ----------
const fmt = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.round(b / 1e6) + ' MB';
let job = null; // { stop:boolean }
function openParent() { $('parent').hidden = false; renderParent(); }
$('pclose').addEventListener('click', () => { if (job) { toast('Downloading… keep this screen open'); return; } $('parent').hidden = true; render(); });

async function renderParent() {
  $('ver').textContent = 'Bible Videos ' + APP_VERSION + (isStandalone() ? ' · Home Screen app' : ' · in Safari (add to Home Screen first!)');
  let st = '';
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    st = `Using ${fmt(e.usage || 0)} of about ${fmt(e.quota || 0)} allowed. `;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    st += persisted ? 'Videos are protected from automatic clean-up.' : 'iPad may remove videos if it runs very low on space.';
  }
  if (!isStandalone()) st = '⚠️ Open this from the Home Screen icon before adding videos. Videos added in Safari are not shared with the Home Screen app. ' + st;
  $('storage').textContent = st;
  const list = $('plist'); list.innerHTML = '';
  const stories = allStories();
  $('dlSel').hidden = !stories.some(s => s.videos.some(v => v.url)) || !!job;
  $('stopBtn').hidden = !job;
  if (!stories.length) list.innerHTML = '<p class="note">No stories yet. Tap “Add a story from Files…”.</p>';
  for (const s of stories) {
    const total = s.videos.length, got = ready(s).length;
    const size = s.videos.reduce((a, v) => a + (v.size || 0), 0);
    const row = document.createElement('div'); row.className = 'pstory'; row.dataset.num = s.num;
    const canDl = s.videos.some(v => v.url);
    row.innerHTML = `${canDl ? `<input type="checkbox" ${got < total ? '' : 'disabled'}>` : ''}<div class="info"><div class="name"></div>
      <div class="sub">${got} of ${total} videos on this iPad${size ? ' · ' + fmt(size) + ' total' : ''}</div><div class="bar"><i style="width:${total ? 100 * got / total : 0}%"></i></div></div>`;
    row.querySelector('.name').textContent = s.num + '. ' + s.title;
    if (got) { const b = document.createElement('button'); b.className = 'btn small red'; b.textContent = 'Remove'; b.onclick = () => removeStory(s); row.appendChild(b); }
    list.appendChild(row);
  }
}

async function removeStory(s) {
  if (job || !confirm(`Remove “${s.title}” from this iPad? You can add it again later.`)) return;
  const c = await caches.open(MEDIA);
  for (const v of s.videos) { await c.delete(mediaUrl(s.num, v.file)); await c.delete(thumbUrl(s.num, v.file)); delete local.meta[key(s.num, v.file)]; }
  if (local.stories[s.num] && !(remote && remote.stories.find(r => r.num === s.num))) delete local.stories[s.num];
  saveLocal(); await refreshHave(); renderParent();
}

async function askPersist() { try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {} }
async function wakeLock() { try { return await navigator.wakeLock.request('screen'); } catch (e) { return null; } }
function status(msg) { $('dlstatus').textContent = msg; }

async function storeBlob(num, file, blob) {
  const c = await caches.open(MEDIA);
  await c.put(mediaUrl(num, file), new Response(blob, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(blob.size) } }));
  have.add(key(num, file));
  try { await makeThumb(num, file); } catch (e) { console.warn('thumb', e); }
}

// Download checked stories from the URLs in library.json, one file at a time, with retries.
$('dlSel').addEventListener('click', async () => {
  const nums = [...document.querySelectorAll('.pstory')].filter(r => r.querySelector('input:checked')).map(r => +r.dataset.num);
  if (!nums.length) { toast('Tick the stories to download first'); return; }
  await askPersist();
  const todo = [];
  for (const s of allStories()) if (nums.includes(s.num)) for (const v of s.videos) if (v.url && !have.has(key(s.num, v.file))) todo.push([s, v]);
  const totalBytes = todo.reduce((a, [, v]) => a + (v.size || 0), 0);
  job = { stop: false }; renderParent();
  const lock = await wakeLock();
  let doneBytes = 0, failed = 0;
  for (let i = 0; i < todo.length && !job.stop; i++) {
    const [s, v] = todo[i];
    let ok = false;
    for (let attempt = 1; attempt <= 5 && !ok && !job.stop; attempt++) {
      try {
        const blob = await fetchWithProgress(new URL(v.url, base).href, got => status(
          `Downloading ${i + 1} of ${todo.length}: ${s.title} – ${v.style}  (${fmt(doneBytes + got)} of ${fmt(totalBytes)})` + (attempt > 1 ? ` · try ${attempt}` : '')));
        await storeBlob(s.num, v.file, blob); ok = true;
      } catch (e) {
        if (e && e.name === 'QuotaExceededError') { job.stop = true; alert('The iPad has no more room for videos. Remove a story or free up space.'); break; }
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    if (!ok) failed++;
    doneBytes += v.size || 0;
    saveLocal(); renderParent();
  }
  if (lock) lock.release().catch(() => {});
  const stopped = job.stop; job = null;
  status(stopped ? 'Stopped.' : failed ? `Finished, but ${failed} video(s) could not be downloaded. Tap Download again to retry.` : 'All done! The videos now work without WiFi.');
  render(); renderParent();
});
$('stopBtn').addEventListener('click', () => { if (job) job.stop = true; });

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body || !res.body.getReader) return await res.blob();
  const reader = res.body.getReader(), parts = []; let got = 0, last = 0;
  for (;;) {
    if (job && job.stop) { reader.cancel(); throw new Error('stopped'); }
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (performance.now() - last > 250) { last = performance.now(); onProgress(got); }
  }
  const len = +res.headers.get('content-length');
  if (len && got !== len) throw new Error('short read');
  return new Blob(parts, { type: 'video/mp4' });
}

// Add a story from the Files app: pick the story folder's mp4s (and intro.md).
$('importBtn').addEventListener('click', () => { if (!job) $('picker').click(); });
$('picker').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (files.length) await importFiles(files);
});
async function importFiles(files, numAnswer) {
  const md = files.find(f => /\.md$/i.test(f.name));
  const vids = files.filter(f => Intro.isVideo(f.name));
  if (!vids.length) { alert('No videos were chosen. Open the story folder, tap Select, and choose all its videos (and intro.md).'); return; }
  const introText = md ? await md.text() : '';
  const title = Intro.parse(introText).title;
  // Which story number? Match a known story by title, else ask (suggest the next free number).
  const known = allStories();
  let num = (known.find(s => title && s.title === title) || {}).num;
  if (num == null) {
    const next = known.reduce((a, s) => Math.max(a, s.num), 0) + 1;
    const ans = numAnswer != null ? String(numAnswer) : prompt(`Story number for “${title || 'these videos'}”? (the number at the start of the folder name)`, String(next));
    if (ans == null) return;
    num = parseInt(ans, 10); if (!(num > 0)) { alert('Please type a number like 7.'); return; }
  }
  const prev = local.stories[num];
  const story = Intro.buildStory(num, title || (prev && prev.title) || ('Story ' + num), vids.map(f => ({ name: f.name, size: f.size })), introText);
  if (!md && prev) { story.title = prev.title; story.blurb = prev.blurb; }
  if (prev) for (const v of prev.videos) if (!story.videos.find(x => x.file === v.file)) story.videos.push(v);
  story.videos.sort((a, b) => Intro.numericOrder(a.file, b.file));
  local.stories[num] = story; saveLocal();
  await askPersist();
  job = { stop: false }; renderParent();
  let i = 0;
  try {
    for (const f of vids.sort((a, b) => Intro.numericOrder(a.name, b.name))) {
      if (job.stop) break;
      status(`Copying ${++i} of ${vids.length}: ${Intro.styleName(f.name)}`);
      await storeBlob(num, f.name, f);
      saveLocal();
    }
    status(job.stop ? 'Stopped.' : `Added ${i} video(s) to “${story.title}”. They work without WiFi.`);
  } catch (e) {
    status(e && e.name === 'QuotaExceededError' ? 'The iPad has no more room. Remove a story or free up space.' : 'Something went wrong: ' + e);
  }
  job = null; render(); renderParent();
}
window.__importFiles = importFiles; // used by the automated test

// Make a preview picture from the stored video (a frame ~30% in) and remember its main colour.
function makeThumb(num, file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
    const done = setTimeout(() => { cleanup(); reject(new Error('thumb timeout')); }, 20000);
    const cleanup = () => { clearTimeout(done); v.removeAttribute('src'); v.load(); };
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(Math.max(1, v.duration * 0.3), Math.max(0, v.duration - 0.5)); }, { once: true });
    v.addEventListener('seeked', async () => {
      try {
        const w = 480, h = Math.round(480 * (v.videoHeight || 270) / (v.videoWidth || 480));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d'); cx.drawImage(v, 0, 0, w, h);
        local.meta[key(num, file)] = { hue: mainHue(cx.getImageData(0, 0, w, h).data) };
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
        const c = await caches.open(MEDIA);
        await c.put(thumbUrl(num, file), new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
        cleanup(); resolve();
      } catch (e) { cleanup(); reject(e); }
    }, { once: true });
    v.addEventListener('error', () => { cleanup(); reject(new Error('video error')); }, { once: true });
    v.src = mediaUrl(num, file);
  });
}
function mainHue(px) {
  const bins = new Array(24).fill(0), xs = new Array(24).fill(0), ys = new Array(24).fill(0);
  for (let i = 0; i < px.length; i += 16) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d || mx < .15) continue;
    let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); if (h < 0) h += 360;
    const wgt = (d / mx) * mx, k = Math.floor(h / 15) % 24;
    bins[k] += wgt; xs[k] += wgt * Math.cos(h * Math.PI / 180); ys[k] += wgt * Math.sin(h * Math.PI / 180);
  }
  let best = -1, bw = 0;
  for (let k = 0; k < 24; k++) { const w = bins[k] + bins[(k + 1) % 24]; if (w > bw) { bw = w; best = k; } }
  if (best < 0 || bw < 1) return -1;
  const n = (best + 1) % 24, a = Math.atan2(ys[best] + ys[n], xs[best] + xs[n]) * 180 / Math.PI;
  return (a + 360) % 360;
}

// ---------- start ----------
(async function start() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 3000); });
  }
  try { const r = await fetch('library.json', { cache: 'no-store' }); if (r.ok) remote = await r.json(); } catch (e) {}
  await refreshHave();
  render();
  window.__ready = true;
})();
