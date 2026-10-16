// Port of IntroParser / NameUtil from the Android picker (shared by app and build tool).
(function (root) {
  const NUM_PREFIX = /^\s*\d+\s*[.)\-_:]*\s*/;
  function leadingNumber(s, def) { const m = /^\s*(\d+)/.exec(s || ''); return m ? parseInt(m[1], 10) : def; }
  function stripNumber(s) { const r = (s || '').replace(NUM_PREFIX, '').trim(); return r || (s || '').trim(); }
  function stripExt(n) { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; }
  function styleName(file) { return stripNumber(stripExt(file)); }
  function isVideo(n) { const l = (n || '').toLowerCase(); return !!n && !n.startsWith('.') && !l.endsWith(' - highlight.mp4') && /\.(mp4|m4v)$/.test(l); }
  function isSkippedDir(n) { const t = (n || '').trim().toLowerCase(); return t === 'old' || t.startsWith('.') || t === 'video picker'; }
  function isStoryFolder(n) { return !isSkippedDir(n) && /^\s*\d+\s*[.)\-_:]*\s*\S/.test(n || ''); }
  function matchKey(t) {
    let s = (t || '').split(/[\\/]/).pop();
    s = s.replace(/\.(mp4|m4v|mov|mkv|avi|wmv|webm)$/i, '').replace(NUM_PREFIX, '');
    return s.toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, '');
  }
  function numericOrder(a, b) {
    const na = leadingNumber(a, 1e9), nb = leadingNumber(b, 1e9);
    return na !== nb ? na - nb : a.localeCompare(b);
  }
  function cleanInline(s) {
    return (s || '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '')
      .replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1$2').trim();
  }
  function parse(text) {
    const res = { title: null, blurb: null, sections: [] };
    if (!text) return res;
    text = text.replace(/^\uFEFF/, '');
    let mode = 'pre', cur = null, para = [], fence = false;
    const flush = () => {
      if (!para.length) return;
      const t = cleanInline(para.join(' ').replace(/\s+/g, ' ').trim()); para = [];
      if (!t) return;
      if (mode === 'intro' && !res.blurb) res.blurb = t;
      else if (mode === 'section' && cur && !cur.description) cur.description = t;
    };
    for (const raw of text.split(/\r?\n/)) {
      const t = raw.trim(); let m;
      if (t.startsWith('```') || t.startsWith('~~~')) { fence = !fence; flush(); continue; }
      if (fence) continue;
      if ((m = /^#(?!#)\s*(.+)$/.exec(t))) { flush(); if (!res.title) res.title = cleanInline(m[1].replace(/\s+#+\s*$/, '')); if (mode === 'pre') mode = 'intro'; continue; }
      if ((m = /^##(?!#)\s*(.+)$/.exec(t))) {
        flush(); let h = m[1].trim().replace(/\s+#+\s*$/, ''); cur = { name: h, link: null, file: null, description: null };
        const lm = /^\[(.+?)\]\(\s*<?([^)>]*?)>?\s*\)/.exec(h);
        if (lm) { cur.name = lm[1]; let l = lm[2].trim(); try { l = decodeURIComponent(l); } catch (e) {} cur.link = l || null; }
        cur.name = cur.name.replace(/[`*]/g, '').trim(); res.sections.push(cur); mode = 'section'; continue;
      }
      if (/^#{3,}\s/.test(t)) { flush(); continue; }
      if ((m = /^\*\*\s*File\s*:?\s*\*\*\s*:?\s*(.+)$/.exec(t))) { flush(); if (mode === 'section' && cur && !cur.file) cur.file = m[1].replace(/`/g, '').trim(); continue; }
      if (!t || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); continue; }
      if (mode === 'pre') mode = 'intro';
      para.push(t);
    }
    flush();
    return res;
  }
  function match(intro, files) {
    const out = {}, used = new Set();
    for (const sec of intro.sections) {
      const cands = [sec.file, sec.link].filter(Boolean); let f = null;
      for (const c of cands) { const leaf = c.replace(/\\/g, '/').split('/').pop().trim().toLowerCase();
        f = files.find(x => !used.has(x) && (x.toLowerCase() === leaf || x.toLowerCase() === leaf + '.mp4')); if (f) break; }
      const keys = cands.map(matchKey).concat([matchKey(sec.name)]).filter(Boolean);
      if (!f) for (const k of keys) { f = files.find(x => !used.has(x) && matchKey(x) === k); if (f) break; }
      if (!f) for (const k of keys) { if (k.length < 4) continue; f = files.find(x => { const fk = matchKey(x); return !used.has(x) && fk.length >= 4 && (fk.startsWith(k) || k.startsWith(fk)); }); if (f) break; }
      if (f) { used.add(f); out[f] = sec; }
    }
    return out;
  }
  /** Build a story record from a folder name (or number), file list [{name,size}], and intro text. */
  function buildStory(num, folderName, files, introText, urlFor) {
    const intro = parse(introText || '');
    const names = files.map(f => f.name).filter(isVideo).sort(numericOrder);
    const m = match(intro, names);
    return {
      num, title: intro.title || stripNumber(folderName || ('Story ' + num)), blurb: intro.blurb || '',
      videos: names.map(n => {
        const f = files.find(x => x.name === n), sec = m[n];
        const v = { file: n, style: styleName(n), desc: sec && sec.description || '', size: f.size || 0 };
        if (urlFor) v.url = urlFor(n);
        return v;
      })
    };
  }
  const api = { parse, match, buildStory, isVideo, isStoryFolder, isSkippedDir, leadingNumber, stripNumber, styleName, matchKey, numericOrder };
  if (typeof module !== 'undefined') module.exports = api; else root.Intro = api;
})(this);
