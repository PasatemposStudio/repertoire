// Repertoire — arayüz mantığı
(() => {
  const $ = s => document.querySelector(s);
  const M = window.Music;
  const S = window.storage;
  const WEB = S.platform === 'web';

  const THEMES = {
    'Koyu': { bg: '#1b1d22', text: '#e9e6df', chord: '#f5b84a', title: '#ffffff', section: '#8fb8ff', chorusBg: '#232a36', accent: '#f5b84a', sideBg: '#14161a', sideText: '#d6d3cc', barBg: '#202329' },
    'Açık': { bg: '#fbfaf7', text: '#1f1f1f', chord: '#c2410c', title: '#111111', section: '#2563eb', chorusBg: '#eef3fc', accent: '#c2410c', sideBg: '#f0eee9', sideText: '#2a2a2a', barBg: '#f4f2ed' },
    'Sepya': { bg: '#f4ecd8', text: '#3b2f22', chord: '#9a3412', title: '#2a1f14', section: '#7c5c2e', chorusBg: '#ebdfc3', accent: '#9a3412', sideBg: '#e9dfc6', sideText: '#3b2f22', barBg: '#ede3cb' },
    'Sahne': { bg: '#000000', text: '#ffffff', chord: '#ffd400', title: '#ffffff', section: '#00d1ff', chorusBg: '#0c1418', accent: '#ffd400', sideBg: '#0a0a0a', sideText: '#e6e6e6', barBg: '#111111' },
    'Okyanus': { bg: '#0f1b26', text: '#dfe9f1', chord: '#5eead4', title: '#ffffff', section: '#fca5a5', chorusBg: '#15283a', accent: '#5eead4', sideBg: '#0a141d', sideText: '#c9d6e0', barBg: '#132231' },
    'Kâğıt': { bg: '#ffffff', text: '#000000', chord: '#0000cc', title: '#000000', section: '#555555', chorusBg: '#f3f3f3', accent: '#0000cc', sideBg: '#f5f5f5', sideText: '#111111', barBg: '#fafafa' },
  };
  const DEFAULTS = {
    folders: [], theme: 'Koyu', colors: { ...THEMES['Koyu'] },
    fonts: { lyric: 'Segoe UI', chord: 'Segoe UI', title: 'Georgia', ui: 'Segoe UI' },
    size: 20, chordScale: 0.9, titleScale: 1.8, lineHeight: 1.2, lineGap: 0.35, chordBold: true, chordItalic: false,
    notation: 'auto', latin: false, chordPos: 'above', columns: 1, showDiagrams: false, expandChorus: false,
    showMeta: true, sidebarWidth: 300, sidebarOpen: true, sort: 'lang-artist', scrollSpeed: 30, songState: {}, lastSong: null, langFilter: '', artistFilter: '', groupState: {},
  };
  const FONT_SUGGEST = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Times New Roman', 'Palatino Linotype', 'Bahnschrift', 'Consolas', 'Courier New', 'Candara', 'Constantia', 'Corbel', 'Franklin Gothic Medium', 'Gill Sans MT', 'Lucida Sans Unicode', 'Segoe Print', 'Comic Sans MS', 'Helvetica', 'Inter', 'Roboto', 'Open Sans'];

  let settings = structuredClone(DEFAULTS);
  let library = [];         // {path, root, rel, name, text, mtime, meta, search}
  let filtered = [];
  let current = null;        // seçili şarkı
  let parsed = null;
  let editingPath = null;
  let scrolling = false, scrollAcc = 0, lastTs = 0;
  let pop = { chord: null, shapes: [], idx: 0 };

  // ---------- yardımcılar ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fold = s => (s || '').toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let saveTimer;
  const save = (patch) => { Object.assign(settings, patch || {}); clearTimeout(saveTimer); saveTimer = setTimeout(() => S.setSettings(settings), 250); };
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 1800); };
  const fontStack = f => f ? `"${f}", system-ui, sans-serif` : 'system-ui, sans-serif';

  // ---------- görünüm ayarlarını uygula ----------
  function applyLook() {
    const r = document.documentElement.style, c = settings.colors;
    r.setProperty('--bg', c.bg); r.setProperty('--text', c.text); r.setProperty('--chord', c.chord);
    r.setProperty('--title', c.title); r.setProperty('--section', c.section); r.setProperty('--chorus-bg', c.chorusBg);
    r.setProperty('--accent', c.accent); r.setProperty('--side-bg', c.sideBg); r.setProperty('--side-text', c.sideText);
    r.setProperty('--bar-bg', c.barBg);
    const light = luminance(c.bg) > 0.5;
    r.setProperty('--line', light ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.08)');
    r.setProperty('--muted', light ? '#6b6b6b' : '#8a8f99');
    r.setProperty('--lyric-font', fontStack(settings.fonts.lyric));
    r.setProperty('--chord-font', fontStack(settings.fonts.chord));
    r.setProperty('--title-font', fontStack(settings.fonts.title));
    r.setProperty('--ui-font', fontStack(settings.fonts.ui));
    r.setProperty('--size', settings.size + 'px');
    r.setProperty('--chord-scale', settings.chordScale);
    r.setProperty('--title-scale', settings.titleScale);
    r.setProperty('--lh', settings.lineHeight);
    r.setProperty('--line-gap', settings.lineGap + 'em');
    r.setProperty('--chord-weight', settings.chordBold ? 700 : 400);
    r.setProperty('--chord-style', settings.chordItalic ? 'italic' : 'normal');
    r.setProperty('--side-w', settings.sidebarWidth + 'px');
    r.setProperty('--columns', settings.columns);
    $('#app').classList.toggle('no-side', !settings.sidebarOpen);
    $('#btnDiagrams').classList.toggle('on', settings.showDiagrams);
  }
  function luminance(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '#000');
    if (!m) return 0;
    const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // ---------- kütüphane ----------
  async function scan() {
    if (!settings.folders.length) { library = []; fillFilters(); renderList(); showEmpty(true); return; }
    const files = await S.scan(settings.folders);
    library = files.map(f => {
      const p = M.parse(f.text);
      const title = p.meta.title || f.name.replace(/\.[^.]+$/, '');
      return { ...f, title, artist: p.meta.artist || '', key: p.meta.key || '', fTitle: fold(title + ' ' + (p.meta.artist || '')), fBody: null };
    });
    fillFilters();
    renderList();
    if (!current && settings.lastSong) {
      const s = library.find(x => x.path === settings.lastSong);
      if (s) openSong(s, true);
    } else if (current) {
      const s = library.find(x => x.path === current.path);
      if (s && s.mtime !== current.mtime && !editingPath) { current = s; render(); }
    }
    showEmpty(!current);
  }

  // Dil = şarkının bulunduğu ilk alt klasör (English, Turkish…)
  const langOf = s => { const parts = s.rel.split(/[\\/]/); return parts.length > 1 ? parts[0] : 'Diğer'; };
  const artistOf = s => s.artist.trim() || 'Sanatçı belirtilmemiş';
  const coll = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
  // Grup başlıkları: dil modlarında varsayılan kapalı, diğerlerinde açık
  const groupOpen = (key) => {
    if ($('#search').value.trim() || settings.artistFilter) return true;
    if (settings.langFilter && !key.includes('›')) return true;
    const st = (settings.groupState[settings.sort] || {})[key];
    if (st !== undefined) return st;
    return !/^lang/.test(settings.sort);
  };
  function setGroup(key, open) {
    const m = settings.groupState[settings.sort] = settings.groupState[settings.sort] || {};
    m[key] = open; save();
  }

  function fillFilters() {
    const lf = $('#langFilter'), af = $('#artistFilter');
    const langs = {};
    library.forEach(s => { const l = langOf(s); langs[l] = (langs[l] || 0) + 1; });
    const langNames = Object.keys(langs).sort(coll.compare);
    if (settings.langFilter && !langs[settings.langFilter]) settings.langFilter = '';
    lf.innerHTML = `<option value="">Tüm diller (${library.length})</option>` + langNames.map(l => `<option value="${esc(l)}">${esc(l)} (${langs[l]})</option>`).join('');
    lf.value = settings.langFilter || '';

    const artists = {};
    library.filter(s => !settings.langFilter || langOf(s) === settings.langFilter).forEach(s => {
      const k = fold(artistOf(s));
      artists[k] = artists[k] || { name: artistOf(s), n: 0 }; artists[k].n++;
    });
    const list = Object.entries(artists).sort((a, b) => coll.compare(a[1].name, b[1].name));
    if (settings.artistFilter && !artists[settings.artistFilter]) settings.artistFilter = '';
    af.innerHTML = `<option value="">Tüm sanatçılar (${list.length})</option>` + list.map(([k, v]) => `<option value="${esc(k)}">${esc(v.name)} (${v.n})</option>`).join('');
    af.value = settings.artistFilter || '';
  }

  function renderList() {
    const q = fold($('#search').value.trim());
    const inLyrics = $('#searchLyrics').checked;
    const lf = settings.langFilter, af = settings.artistFilter;
    filtered = library.filter(s => {
      if (lf && langOf(s) !== lf) return false;
      if (af && fold(artistOf(s)) !== af) return false;
      if (!q) return true;
      if (q.split(/\s+/).every(w => s.fTitle.includes(w))) return true;
      if (inLyrics) { s.fBody = s.fBody || fold(s.text.replace(/\[[^\]]*\]/g, '')); return s.fBody.includes(q); }
      return false;
    });
    const sort = settings.sort;
    const byTitle = (a, b) => coll.compare(a.title, b.title);
    const byArtist = (a, b) => coll.compare(artistOf(a), artistOf(b));
    const byLang = (a, b) => coll.compare(langOf(a), langOf(b));
    if (sort === 'artist') filtered.sort((a, b) => byArtist(a, b) || byTitle(a, b));
    else if (sort === 'lang') filtered.sort((a, b) => byLang(a, b) || byTitle(a, b));
    else if (sort === 'lang-artist') filtered.sort((a, b) => byLang(a, b) || byArtist(a, b) || byTitle(a, b));
    else if (sort === 'recent') filtered.sort((a, b) => b.mtime - a.mtime);
    else filtered.sort(byTitle);

    // Grup sayıları
    const g1 = s => sort === 'artist' ? artistOf(s) : /^lang/.test(sort) ? langOf(s) : (s.title[0] || '#').toLocaleUpperCase('tr');
    const counts = {};
    filtered.forEach(s => { const a = g1(s); counts[a] = (counts[a] || 0) + 1; if (sort === 'lang-artist') { const b = a + '›' + fold(artistOf(s)); counts[b] = (counts[b] || 0) + 1; } });

    let html = '', last1 = null, last2 = null, open1 = true, open2 = true;
    filtered.forEach((s, i) => {
      let depth = 0;
      if (sort !== 'recent') {
        const a = g1(s);
        if (a !== last1) {
          open1 = groupOpen(a); last1 = a; last2 = null;
          html += `<div class="grp${open1 ? ' open' : ''}" data-g="${esc(a)}"><span class="caret">▸</span><span class="gname">${esc(a)}</span><span class="gn">${counts[a]}</span></div>`;
        }
        depth = 1;
        if (!open1) return;
        if (sort === 'lang-artist') {
          const b = a + '›' + fold(artistOf(s));
          if (b !== last2) {
            open2 = groupOpen(b); last2 = b;
            html += `<div class="grp grp2${open2 ? ' open' : ''}" data-g="${esc(b)}"><span class="caret">▸</span><span class="gname">${esc(artistOf(s))}</span><span class="gn">${counts[b]}</span></div>`;
          }
          depth = 2;
          if (!open2) return;
        }
      }
      const sub = sort === 'artist' ? [lf ? '' : langOf(s), s.key]
        : sort === 'lang' ? [s.artist, s.key]
        : sort === 'lang-artist' ? [s.key]
        : [s.artist, lf ? '' : langOf(s), s.key];
      const subTxt = sub.filter(Boolean).join(' · ');
      html += `<div class="item d${depth}${current && current.path === s.path ? ' active' : ''}" data-i="${i}"><span class="t">${esc(s.title)}</span>${subTxt ? `<span class="sub">${esc(subTxt)}</span>` : ''}</div>`;
    });
    $('#songList').innerHTML = html || `<div class="hint" style="padding:12px">${library.length ? 'Sonuç yok.' : 'Henüz şarkı yok.'}</div>`;
    $('#count').textContent = `${filtered.length} / ${library.length} şarkı`;
  }

  // Açılan şarkının grubu kapalıysa aç
  function revealInList(s) {
    if (settings.sort === 'recent' || !filtered.includes(s)) return;
    const sort = settings.sort;
    const a = sort === 'artist' ? artistOf(s) : /^lang/.test(sort) ? langOf(s) : (s.title[0] || '#').toLocaleUpperCase('tr');
    let changed = false;
    if (!groupOpen(a)) { setGroup(a, true); changed = true; }
    if (sort === 'lang-artist') { const b = a + '›' + fold(artistOf(s)); if (!groupOpen(b)) { setGroup(b, true); changed = true; } }
    if (changed) renderList();
  }

  function showEmpty(on) { $('#empty').hidden = !on; $('#song').hidden = on; }

  function openSong(s, keepScroll) {
    current = s;
    if (isMobile()) setDrawer(false);
    save({ lastSong: s.path });
    stopScroll();
    render();
    if (!keepScroll) $('#songWrap').scrollTop = 0;
    revealInList(s);
    document.querySelectorAll('.item.active').forEach(e => e.classList.remove('active'));
    const idx = filtered.indexOf(s);
    const el = document.querySelector(`.item[data-i="${idx}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    showEmpty(false);
  }

  // ---------- şarkı durumu (transpoze / capo / zoom) ----------
  function state() {
    if (!current) return { transpose: 0, capo: 0, fileCapo: 0, zoom: 1 };
    const st = settings.songState[current.path] || {};
    const fileCapo = parseInt(M.parse(current.text).meta.capo, 10) || 0;
    return { transpose: st.transpose || 0, capo: st.capo ?? fileCapo, fileCapo, zoom: st.zoom || 1 };
  }
  function setState(patch) {
    if (!current) return;
    const { fileCapo, ...st } = { ...state(), ...patch };
    settings.songState[current.path] = st;
    save();
    render();
  }

  // ---------- çizim ----------
  function chordOpts(st, key) {
    // Dosyadaki akorlar, dosyadaki capo ile çalınan şekillerdir.
    // Capo artınca aynı sesi korumak için şekiller aşağı kayar.
    const shift = st.transpose - (st.capo - (st.fileCapo || 0));
    return { shift, opts: { flat: M.prefersFlat(key, shift, settings.notation), latin: settings.latin } };
  }

  function renderSong(song, st, target, interactive) {
    const key = song.meta.key || guessKey(song);
    const { shift, opts } = chordOpts(st, key);
    const tc = c => M.isChord(c) ? M.transposeChord(c, shift, opts) : c;
    let h = '';
    h += '<div class="song-head">';
    h += `<h1 class="song-title">${esc(song.meta.title || '')}</h1>`;
    if (song.meta.artist) h += `<div class="song-artist">${esc(song.meta.artist)}</div>`;
    if (settings.showMeta) {
      const chips = [];
      if (key) {
        const sShift = st.transpose + (st.fileCapo || 0);
        const sounding = M.transposeChord(key, sShift, { flat: M.prefersFlat(key, sShift, settings.notation), latin: settings.latin });
        const orig = M.transposeChord(key, st.fileCapo || 0, { flat: M.prefersFlat(key, st.fileCapo || 0, settings.notation), latin: settings.latin });
        chips.push(`Ton <b>${esc(sounding)}</b>${st.transpose ? ` <span>(orijinal ${esc(orig)})</span>` : ''}${song.meta.key ? '' : ' <span>(tahmini)</span>'}`);
        if (st.capo) chips.push(`Capo <b>${st.capo}</b> · şekil <b>${esc(M.transposeChord(key, shift, opts))}</b>`);
      } else if (st.capo) chips.push(`Capo <b>${st.capo}</b>`);
      if (song.meta.tempo) chips.push(`Tempo <b>${esc(song.meta.tempo)}</b>`);
      if (song.meta.time) chips.push(`Ölçü <b>${esc(song.meta.time)}</b>`);
      if (chips.length) h += `<div class="chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>`;
    }
    h += '</div>';

    if (settings.showDiagrams && interactive) {
      const chords = M.songChords(song).map(tc).filter((c, i, a) => a.indexOf(c) === i);
      h += '<div class="diagrams">' + chords.map(c => {
        const sh = M.chordShapes(latinToStd(c));
        return sh.length ? `<div class="diagram" data-chord="${esc(c)}">${M.chordSVG(sh[0].frets, { size: 64, accent: 'var(--chord)' })}<span>${esc(c)}</span></div>` : '';
      }).join('') + '</div>';
    }

    const chorus = song.sections.find(s => s.type === 'chorus');
    h += '<div class="body">';
    for (const sec of song.sections) h += renderSection(sec, tc, chorus);
    h += '</div>';
    target.innerHTML = h;
    target.classList.toggle('chords-hidden', settings.chordPos === 'hidden');
    target.classList.toggle('inline-mode', settings.chordPos === 'inline');
    target.style.setProperty('--zoom', interactive ? st.zoom : 0.8);
  }

  function renderSection(sec, tc, chorus) {
    let h = `<section class="sec ${sec.type}">`;
    if (sec.label) h += `<div class="sec-label">${esc(sec.label)}</div>`;
    for (const l of sec.lines) {
      if (l.type === 'line') h += renderLine(l, tc);
      else if (l.type === 'comment') h += `<div class="comment ${l.style === 'cb' || l.style === 'comment_box' ? 'cb' : ''}">${esc(l.text)}</div>`;
      else if (l.type === 'pre') h += `<pre class="tab">${esc(l.text)}</pre>`;
      else if (l.type === 'space') h += '<div class="space"></div>';
      else if (l.type === 'break') h += '<div class="colbreak"></div>';
      else if (l.type === 'chorusref') {
        if (settings.expandChorus && chorus) h += '</section>' + renderSection({ ...chorus, label: l.text || chorus.label }, tc, null) + `<section class="sec ${sec.type}">`;
        else h += `<div class="chorusref">↻ ${esc(l.text)}</div>`;
      }
    }
    return h + '</section>';
  }

  function renderLine(l, tc) {
    const hasChord = l.segs.some(s => s.chord);
    const cls = 'line' + (hasChord ? '' : ' nochords') + (l.chordsOnly ? ' chordsonly' : '');
    let h = `<div class="${cls}">`;
    for (const seg of l.segs) {
      const chordHtml = seg.chord
        ? (M.isChord(seg.chord) ? `<span class="ch" data-chord="${esc(tc(seg.chord))}">${esc(tc(seg.chord))}</span>` : `<span class="ch sym">${esc(seg.chord)}</span>`)
        : '<span class="ch empty"></span>';
      if (l.chordsOnly) {
        h += `<span class="w">${seg.chord ? chordHtml : `<span class="ch sym">${esc(seg.text.trim())}</span>`}</span>`;
        continue;
      }
      // İlk kelime akorla birlikte, kalanlar ayrı kelimeler: uzun satırlar kelime arasından kırılır
      const words = seg.text.match(/\S*\s*/g).filter(Boolean);
      if (!words.length) words.push('');
      words.forEach((w, i) => {
        h += `<span class="w">${i === 0 ? chordHtml : '<span class="ch empty"></span>'}<span class="ly">${esc(w) || (i === 0 && seg.chord ? '&nbsp;' : '')}</span></span>`;
      });
    }
    return h + '</div>';
  }

  // Ton yönergesi yoksa ilk/son akordan tahmin et
  function guessKey(song) {
    const ch = M.songChords(song);
    if (!ch.length) return '';
    const c = M.parseChord(ch[0]);
    if (!c) return '';
    return M.noteName(c.root, {}) + (/^m(?!aj)/.test(c.suffix) ? 'm' : '');
  }
  // Latin (Do Re Mi) gösterimden diyagram için standart isme çevir
  function latinToStd(c) {
    if (!settings.latin) return c;
    const map = [['Sol', 'G'], ['Do', 'C'], ['Re', 'D'], ['Mi', 'E'], ['Fa', 'F'], ['La', 'A'], ['Si', 'B']];
    return c.split('/').map(part => { for (const [l, s] of map) if (part.startsWith(l)) return s + part.slice(l.length); return part; }).join('/');
  }

  function render() {
    if (!current) return;
    parsed = M.parse(current.text);
    const st = state();
    renderSong(parsed, st, $('#song'), true);
    $('#song').classList.add('song-render');
    $('#trVal').textContent = (st.transpose > 0 ? '+' : '') + st.transpose;
    $('#capoVal').textContent = st.capo;
    $('#zoomVal').textContent = Math.round(st.zoom * 100) + '%';
    document.title = `${parsed.meta.title || current.name} — Repertoire`;
  }

  // ---------- akor penceresi ----------
  function showChord(chord, anchor) {
    const shapes = M.chordShapes(latinToStd(chord));
    pop = { chord, shapes, idx: 0 };
    $('#cpName').textContent = chord;
    drawPop();
    const p = $('#chordPop');
    p.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight;
    let x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 10) y = r.top - h - 8;
    p.style.left = x + 'px'; p.style.top = Math.max(10, y) + 'px';
  }
  function drawPop() {
    const { shapes, idx } = pop;
    if (!shapes.length) { $('#cpSvg').innerHTML = '<div class="hint" style="padding:30px 0">Bu akor için şekil bulunamadı</div>'; $('#cpIdx').textContent = ''; $('#cpNote').textContent = ''; return; }
    const s = shapes[idx];
    $('#cpSvg').innerHTML = M.chordSVG(s.frets, { size: 140, accent: 'var(--chord)' });
    $('#cpIdx').textContent = `${idx + 1} / ${shapes.length}`;
    const tab = s.frets.map(f => f === 'x' ? 'x' : f).join(' ');
    $('#cpNote').textContent = (shapes.approx ? `≈ ${shapes.approx} · ` : '') + `${s.label} · ${tab}`;
  }

  // ---------- otomatik kaydırma ----------
  function tick(ts) {
    if (!scrolling) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    const wrap = $('#songWrap');
    scrollAcc += settings.scrollSpeed * dt * 0.6;
    if (scrollAcc >= 1) { const px = Math.floor(scrollAcc); wrap.scrollTop += px; scrollAcc -= px; }
    if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 2) { stopScroll(); return; }
    requestAnimationFrame(tick);
  }
  function toggleScroll() { scrolling ? stopScroll() : startScroll(); }
  function startScroll() { if (!current) return; scrolling = true; lastTs = 0; $('#btnScroll').textContent = '❚❚ Durdur'; $('#btnScroll').classList.add('on'); requestAnimationFrame(tick); }
  function stopScroll() { scrolling = false; $('#btnScroll').textContent = '▶ Kaydır'; $('#btnScroll').classList.remove('on'); }

  // ---------- düzenleyici ----------
  function openEditor(s) {
    if (!s) return;
    editingPath = s.path;
    stopScroll();
    $('#edTitle').textContent = s.name;
    $('#edText').value = s.text;
    $('#editor').hidden = false;
    updatePreview();
    $('#edText').focus();
  }
  function updatePreview() {
    const song = M.parse($('#edText').value);
    const fc = parseInt(song.meta.capo, 10) || 0;
    renderSong(song, { transpose: 0, capo: fc, fileCapo: fc, zoom: 1 }, $('#edPreview'), false);
  }
  async function saveEditor() {
    const text = $('#edText').value;
    try {
      const mtime = await S.write(editingPath, text);
      const s = library.find(x => x.path === editingPath);
      if (s) {
        const p = M.parse(text);
        Object.assign(s, { text, mtime, title: p.meta.title || s.name.replace(/\.[^.]+$/, ''), artist: p.meta.artist || '', key: p.meta.key || '' });
        s.fTitle = fold(s.title + ' ' + s.artist); s.fBody = null;
        current = s;
      }
      closeEditor();
      renderList(); render();
      toast('Kaydedildi');
    } catch (e) { alert('Kaydedilemedi: ' + e.message); }
  }
  function closeEditor() { $('#editor').hidden = true; editingPath = null; }
  function insertAtCursor(before, after = '') {
    const ta = $('#edText');
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const lineStart = value.lastIndexOf('\n', a - 1) + 1;
    if (!after) {
      // Yönergeyi kendi satırına ekle, imleci ":" sonrasına koy
      const ins = before + '\n';
      ta.setRangeText(ins, lineStart, lineStart, 'end');
      const pos = lineStart + before.length - 1;
      ta.setSelectionRange(pos, pos);
    } else {
      const sel = value.slice(a, b);
      ta.setRangeText(`${before}\n${sel}${sel.endsWith('\n') ? '' : '\n'}${after}\n`, lineStart === a ? a : a, b, 'end');
    }
    ta.focus(); updatePreview();
  }

  async function newSong() {
    if (!settings.folders.length) { toast('Önce bir klasör ekle'); openSettings(); return; }
    const name = prompt('Şarkı adı:', '');
    if (name === null) return;
    const folder = settings.folders[0];
    const tpl = `{title: ${name || 'Yeni Şarkı'}}\n{artist: }\n{key: }\n\n[C]Söz satırı [G]buraya\n\n{soc}\n[Am]Nakarat [F]satırı\n{eoc}\n`;
    const p = await S.create(folder, name || 'Yeni Şarkı', tpl);
    await scan();
    const s = library.find(x => x.path === p);
    if (s) { openSong(s); openEditor(s); }
  }

  // ---------- ayarlar paneli ----------
  function openSettings() { buildSettings(); $('#settings').hidden = false; }
  function buildSettings() {
    const c = settings.colors;
    const color = (k, label) => `<div class="st-row"><label>${label}</label><input type="color" data-color="${k}" value="${c[k]}"></div>`;
    const range = (k, label, min, max, step, fmt = v => v) => `<div class="st-row"><label>${label}</label><input type="range" data-num="${k}" min="${min}" max="${max}" step="${step}" value="${settings[k]}"><span class="num" data-numval="${k}">${fmt(settings[k])}</span></div>`;
    const font = (k, label) => `<div class="st-row"><label>${label}</label><input type="text" list="fontList" data-font="${k}" value="${esc(settings.fonts[k])}"></div>`;
    const check = (k, label) => `<div class="st-row"><label for="ck_${k}">${label}</label><input id="ck_${k}" type="checkbox" data-bool="${k}" ${settings[k] ? 'checked' : ''}></div>`;
    const select = (k, label, opts) => `<div class="st-row"><label>${label}</label><select data-sel="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(settings[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;

    $('#stBody').innerHTML = `
      <div class="st-sec">Şarkı klasörleri</div>
      ${settings.folders.map((f, i) => `<div class="folder"><span>${esc(folderLabel(f))}</span><button class="icon sm" data-rmfolder="${i}" title="Listeden çıkar (dosyalar silinmez)">✕</button></div>`).join('') || '<div class="hint">Henüz klasör yok.</div>'}
      <div class="st-row"><button id="stAddFolder">+ Klasör ekle</button></div>
      ${WEB ? `
      <div class="st-sec">Google Drive</div>
      <div class="st-row"><label>Durum</label><span>${S.isConnected() ? 'Bağlı ✓' : 'Bağlı değil'}</span></div>
      <div class="st-row"><button id="stConnect">${S.isConnected() ? 'Yeniden bağlan' : 'Google ile bağlan'}</button><button id="stSync">Şimdi senkronize et</button></div>
      <div class="st-row"><label>Google Client ID</label><input type="text" id="stClientId" value="${esc(S.getClientId())}" placeholder="…apps.googleusercontent.com"></div>
      <div class="st-row"><button id="stClearCache">Telefondaki önbelleği sıfırla</button></div>
      <div class="hint">Şarkılar telefona kaydedilir; internet yokken de açılır. Düzenlemeler Drive'a bağlanınca yüklenir.</div>`
      : `<div class="hint">Google Drive senkronu için: bilgisayarına <b>Google Drive for Desktop</b> kur ve şarkıların bulunduğu Drive klasörünü (ör. <i>G:\\Drive'ım\\Şarkılar</i>) buradan ekle. Repertoire o klasördeki değişiklikleri anında görür; senin kaydettiklerin de Drive'a otomatik yüklenir.</div>`}

      <div class="st-sec">Tema</div>
      <div class="themes">${Object.entries(THEMES).map(([n, t]) => `<button class="theme-btn ${settings.theme === n ? 'on' : ''}" data-theme="${n}" style="background:${t.bg};color:${t.text}"><span style="color:${t.chord};font-weight:700">Am</span> ${n}</button>`).join('')}</div>

      <div class="st-sec">Renkler</div>
      ${color('bg', 'Arka plan')}${color('text', 'Söz')}${color('chord', 'Akor')}${color('title', 'Başlık')}${color('section', 'Bölüm etiketi')}${color('chorusBg', 'Nakarat zemini')}${color('accent', 'Vurgu rengi')}${color('sideBg', 'Kütüphane zemini')}${color('sideText', 'Kütüphane yazısı')}${color('barBg', 'Araç çubuğu')}

      <div class="st-sec">Yazı tipleri</div>
      ${font('lyric', 'Söz')}${font('chord', 'Akor')}${font('title', 'Başlık')}${font('ui', 'Arayüz')}
      <datalist id="fontList">${FONT_SUGGEST.map(f => `<option value="${f}">`).join('')}</datalist>
      <div class="hint">Bilgisayarında kurulu herhangi bir fontun adını yazabilirsin.</div>

      <div class="st-sec">Boyut ve aralık</div>
      ${range('size', 'Söz boyutu', 12, 44, 1, v => v + 'px')}
      ${range('chordScale', 'Akor boyutu', 0.6, 1.5, 0.05, v => Math.round(v * 100) + '%')}
      ${range('titleScale', 'Başlık boyutu', 1, 3, 0.1, v => Math.round(v * 100) + '%')}
      ${range('lineHeight', 'Satır yüksekliği', 1, 2, 0.05)}
      ${range('lineGap', 'Satır arası boşluk', 0, 1.5, 0.05)}
      ${select('columns', 'Sütun', [[1, '1 sütun'], [2, '2 sütun'], [3, '3 sütun']])}

      <div class="st-sec">Akorlar</div>
      ${select('chordPos', 'Akor konumu', [['above', 'Sözün üstünde'], ['inline', 'Satır içinde'], ['hidden', 'Gizli (sadece söz)']])}
      ${select('notation', 'Diyez / bemol', [['auto', 'Tona göre otomatik'], ['sharp', 'Hep diyez (#)'], ['flat', 'Hep bemol (b)']])}
      ${check('latin', 'Do-Re-Mi gösterimi')}
      ${check('chordBold', 'Akorlar kalın')}
      ${check('chordItalic', 'Akorlar italik')}
      ${check('showDiagrams', 'Şarkı başında akor diyagramları')}
      ${check('expandChorus', 'Nakarat tekrarlarını tam göster')}
      ${check('showMeta', 'Ton / capo / tempo bilgisini göster')}

      <div class="st-sec">Mevcut şarkı</div>
      <div class="st-row"><button id="stApplyTr">Transpozu dosyaya yaz</button><button id="stReveal">Klasörde göster</button></div>
      <div class="hint">"Transpozu dosyaya yaz" akorları dosyada kalıcı olarak değiştirir (eski hali .bak olarak saklanır).</div>

      <div class="st-sec">Kısayollar</div>
      <div class="hint"><kbd>[</kbd> <kbd>]</kbd> transpoze · <kbd>Ctrl</kbd>+<kbd>+</kbd>/<kbd>−</kbd> boyut · <kbd>Boşluk</kbd> kaydır · <kbd>E</kbd> düzenle · <kbd>Ctrl</kbd>+<kbd>F</kbd> ara · <kbd>Ctrl</kbd>+<kbd>B</kbd> kütüphane · <kbd>Alt</kbd>+<kbd>↑↓</kbd> önceki/sonraki şarkı · <kbd>F11</kbd> tam ekran</div>
      <div class="st-row" style="margin-top:16px"><button id="stReset">Görünümü varsayılana döndür</button></div>
    `;
  }

  function onSettingsInput(e) {
    const t = e.target;
    if (t.id === 'stClientId') return;
    if (t.dataset.color) { settings.colors[t.dataset.color] = t.value; settings.theme = null; }
    else if (t.dataset.num) { settings[t.dataset.num] = parseFloat(t.value); const n = $(`[data-numval="${t.dataset.num}"]`); if (n) n.textContent = formatNum(t.dataset.num, t.value); }
    else if (t.dataset.font) settings.fonts[t.dataset.font] = t.value.trim();
    else if (t.dataset.bool) settings[t.dataset.bool] = t.checked;
    else if (t.dataset.sel) settings[t.dataset.sel] = t.dataset.sel === 'columns' ? parseInt(t.value, 10) : t.value;
    else return;
    save(); applyLook(); render();
  }
  function formatNum(k, v) {
    v = parseFloat(v);
    if (k === 'size') return v + 'px';
    if (k === 'chordScale' || k === 'titleScale') return Math.round(v * 100) + '%';
    return v;
  }

  async function addFolder() {
    const f = await S.chooseFolder();
    if (!f) return;
    if (!settings.folders.includes(f)) settings.folders.push(f);
    save(); buildSettings(); await scan();
    toast('Klasör eklendi');
  }

  // ---------- olaylar ----------
  function bind() {
    $('#search').addEventListener('input', renderList);
    $('#searchLyrics').addEventListener('change', renderList);
    $('#sortBy').addEventListener('change', e => { save({ sort: e.target.value }); renderList(); });
    $('#songList').addEventListener('click', e => {
      const g = e.target.closest('.grp');
      if (g) { setGroup(g.dataset.g, !g.classList.contains('open')); renderList(); return; }
      const it = e.target.closest('.item'); if (it) openSong(filtered[+it.dataset.i]);
    });
    $('#langFilter').addEventListener('change', e => { settings.langFilter = e.target.value; settings.artistFilter = ''; save(); fillFilters(); renderList(); });
    $('#artistFilter').addEventListener('change', e => { save({ artistFilter: e.target.value }); renderList(); });
    $('#btnExpand').onclick = () => {
      // Görünen tüm grupları aç ya da kapat
      const keys = [...document.querySelectorAll('#songList .grp')].map(g => g.dataset.g);
      const anyClosed = [...document.querySelectorAll('#songList .grp')].some(g => !g.classList.contains('open'));
      if (!anyClosed) { settings.groupState[settings.sort] = {}; if (!/^lang/.test(settings.sort)) keys.forEach(k => settings.groupState[settings.sort][k] = false); }
      else {
        // Tüm grupları (ikinci seviye dahil) aç
        const m = settings.groupState[settings.sort] = {};
        filtered.forEach(s => {
          const sort = settings.sort;
          const a = sort === 'artist' ? artistOf(s) : /^lang/.test(sort) ? langOf(s) : (s.title[0] || '#').toLocaleUpperCase('tr');
          m[a] = true; if (sort === 'lang-artist') m[a + '›' + fold(artistOf(s))] = true;
        });
      }
      save(); renderList();
    };
    $('#btnRescan').onclick = () => WEB ? S.syncNow(settings.folders) : scan().then(() => toast('Yenilendi'));
    if (S.onStatus) S.onStatus(t => { $('#syncStatus').textContent = t; });
    $('#syncStatus').onclick = () => { if (WEB) S.isConnected() ? S.syncNow(settings.folders) : S.connect(); };
    $('#scrim').onclick = () => setDrawer(false);
    $('#btnNew').onclick = newSong;
    $('#btnAddFolderEmpty').onclick = addFolder;

    const st = () => state();
    $('#trUp').onclick = () => setState({ transpose: wrapT(st().transpose + 1) });
    $('#trDown').onclick = () => setState({ transpose: wrapT(st().transpose - 1) });
    $('#trVal').ondblclick = () => setState({ transpose: 0 });
    $('#capoUp').onclick = () => setState({ capo: Math.min(11, st().capo + 1) });
    $('#capoDown').onclick = () => setState({ capo: Math.max(0, st().capo - 1) });
    $('#zoomUp').onclick = () => setState({ zoom: Math.min(3, +(st().zoom + 0.1).toFixed(2)) });
    $('#zoomDown').onclick = () => setState({ zoom: Math.max(0.4, +(st().zoom - 0.1).toFixed(2)) });
    $('#zoomVal').ondblclick = () => setState({ zoom: 1 });
    $('#btnScroll').onclick = toggleScroll;
    $('#scrollSpeed').value = settings.scrollSpeed;
    $('#scrollSpeed').oninput = e => save({ scrollSpeed: +e.target.value });
    $('#btnSidebar').onclick = () => {
      if (isMobile()) { setDrawer(!document.body.classList.contains('drawer')); return; }
      save({ sidebarOpen: !settings.sidebarOpen }); applyLook();
    };
    $('#btnCols').onclick = () => { save({ columns: settings.columns % 3 + 1 }); applyLook(); toast(settings.columns + ' sütun'); };
    $('#btnDiagrams').onclick = () => { save({ showDiagrams: !settings.showDiagrams }); applyLook(); render(); };
    $('#btnEdit').onclick = () => openEditor(current);
    $('#btnFull').onclick = () => S.toggleFullscreen();
    $('#btnSettings').onclick = () => $('#settings').hidden ? openSettings() : ($('#settings').hidden = true);

    // Akor tıklama
    document.addEventListener('click', e => {
      const ch = e.target.closest('#song .ch[data-chord], #song .diagram[data-chord]');
      if (ch) { showChord(ch.dataset.chord, ch); e.stopPropagation(); return; }
      if (!e.target.closest('#chordPop')) $('#chordPop').hidden = true;
    });
    $('#cpClose').onclick = () => $('#chordPop').hidden = true;
    $('#cpPrev').onclick = () => { if (pop.shapes.length) { pop.idx = (pop.idx - 1 + pop.shapes.length) % pop.shapes.length; drawPop(); } };
    $('#cpNext').onclick = () => { if (pop.shapes.length) { pop.idx = (pop.idx + 1) % pop.shapes.length; drawPop(); } };

    // Ctrl + tekerlek ile yakınlaştır
    $('#songWrap').addEventListener('wheel', e => {
      if (!e.ctrlKey) { if (scrolling) { /* kullanıcı elle kaydırıyor */ } return; }
      e.preventDefault();
      const z = state().zoom + (e.deltaY < 0 ? 0.05 : -0.05);
      setState({ zoom: Math.min(3, Math.max(0.4, +z.toFixed(2))) });
    }, { passive: false });

    // Düzenleyici
    let prevTimer;
    $('#edText').addEventListener('input', () => { clearTimeout(prevTimer); prevTimer = setTimeout(updatePreview, 150); });
    $('#edText').addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); e.target.setRangeText('    ', e.target.selectionStart, e.target.selectionEnd, 'end'); }
    });
    $('#edSave').onclick = saveEditor;
    $('#edCancel').onclick = () => { if (current && $('#edText').value !== current.text && !confirm('Değişiklikler kaydedilmedi. Çıkılsın mı?')) return; closeEditor(); };
    document.querySelectorAll('.ed-tools [data-ins]').forEach(b => b.onclick = () => insertAtCursor(b.dataset.ins));
    document.querySelectorAll('.ed-tools [data-wrap]').forEach(b => b.onclick = () => { const [a, z] = b.dataset.wrap.split('|'); insertAtCursor(a, z); });
    $('#edToInline').onclick = () => { $('#edText').value = M.toInline($('#edText').value); updatePreview(); toast('Akorlar satıra gömüldü'); };

    // Ayarlar
    $('#stClose').onclick = () => $('#settings').hidden = true;
    $('#stBody').addEventListener('input', onSettingsInput);
    $('#stBody').addEventListener('change', e => { if (e.target.id === 'stClientId') { S.setClientId(e.target.value); toast('Client ID kaydedildi'); return; } onSettingsInput(e); });
    $('#stBody').addEventListener('click', async e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'stAddFolder') addFolder();
      else if (t.id === 'stConnect') S.connect();
      else if (t.id === 'stSync') { if (!settings.folders.length) toast('Önce klasör ekle'); else S.syncNow(settings.folders); }
      else if (t.id === 'stClearCache') { if (confirm('Telefondaki şarkı önbelleği silinip Drive\'dan yeniden indirilecek. Devam?')) { await S.clearCache(); current = null; await scan(); S.syncNow(settings.folders); } }
      else if (t.dataset.rmfolder !== undefined) { settings.folders.splice(+t.dataset.rmfolder, 1); save(); buildSettings(); scan(); }
      else if (t.dataset.theme) { settings.theme = t.dataset.theme; settings.colors = { ...THEMES[t.dataset.theme] }; save(); applyLook(); buildSettings(); render(); }
      else if (t.id === 'stReset') {
        const keep = { folders: settings.folders, songState: settings.songState, lastSong: settings.lastSong };
        settings = { ...structuredClone(DEFAULTS), ...keep }; save(); applyLook(); buildSettings(); render();
      }
      else if (t.id === 'stApplyTr' && current) {
        const stt = state();
        if (!stt.transpose) { toast('Transpoze 0 — değişecek bir şey yok'); return; }
        if (!confirm(`Akorlar dosyada ${stt.transpose > 0 ? '+' : ''}${stt.transpose} yarım ton kaydırılacak. Devam?`)) return;
        const key = M.parse(current.text).meta.key || guessKey(parsed);
        const text = M.transposeText(current.text, stt.transpose, { flat: M.prefersFlat(key, stt.transpose, settings.notation) });
        current.mtime = await S.write(current.path, text);
        current.text = text; current.fBody = null;
        current.key = M.parse(text).meta.key || '';
        const { fileCapo: _fc, ...rest } = stt;
        settings.songState[current.path] = { ...rest, transpose: 0 };
        save(); render(); renderList(); toast('Dosyaya yazıldı');
      }
      else if (t.id === 'stReveal' && current) S.reveal(current.path);
    });

    // Kenar çubuğu genişliği
    let drag = false;
    $('#resizer').addEventListener('mousedown', () => { drag = true; document.body.style.cursor = 'col-resize'; });
    window.addEventListener('mousemove', e => { if (!drag) return; settings.sidebarWidth = Math.min(600, Math.max(200, e.clientX)); applyLook(); });
    window.addEventListener('mouseup', () => { if (drag) { drag = false; document.body.style.cursor = ''; save(); } });

    // Klavye
    window.addEventListener('keydown', e => {
      const inEditor = !$('#editor').hidden;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (inEditor) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveEditor(); }
        if (e.key === 'Escape') $('#edCancel').click();
        return;
      }
      if (e.key === 'F11') { e.preventDefault(); S.toggleFullscreen(); return; }
      if (e.key === 'Escape') { $('#chordPop').hidden = true; $('#settings').hidden = true; if (typing) document.activeElement.blur(); return; }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
        else if (k === 'b') { e.preventDefault(); $('#btnSidebar').click(); }
        else if (k === 'n') { e.preventDefault(); newSong(); }
        else if (k === '=' || k === '+') { e.preventDefault(); $('#zoomUp').click(); }
        else if (k === '-') { e.preventDefault(); $('#zoomDown').click(); }
        else if (k === '0') { e.preventDefault(); setState({ zoom: 1 }); }
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const i = filtered.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1);
        if (filtered[i]) openSong(filtered[i]);
        return;
      }
      if (typing) {
        if (document.activeElement.id === 'search' && e.key === 'Enter' && filtered[0]) { openSong(filtered[0]); document.activeElement.blur(); }
        if (document.activeElement.id === 'search' && e.key === 'ArrowDown') { e.preventDefault(); $('#songList').focus(); if (filtered[0]) openSong(filtered[0]); }
        return;
      }
      if (document.activeElement.id === 'songList' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const i = filtered.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1);
        if (filtered[i]) openSong(filtered[i]);
        return;
      }
      if (e.key === ' ') { e.preventDefault(); toggleScroll(); }
      else if (e.key === ']') $('#trUp').click();
      else if (e.key === '[') $('#trDown').click();
      else if (e.key.toLowerCase() === 'e') openEditor(current);
    });

    S.onFolderChanged(() => scan());
    // Drive sanal sürücüsünde izleme olayları gecikebilir: pencereye dönünce yeniden tara
    let lastFocusScan = Date.now();
    window.addEventListener('focus', () => { if (Date.now() - lastFocusScan > 10000 && !editingPath) { lastFocusScan = Date.now(); scan(); } });
    window.addEventListener('resize', () => { $('#chordPop').hidden = true; });
  }
  const folderLabel = f => { const m = /^gdrive:[^:]+:(.*)$/.exec(f); return m ? 'Google Drive › ' + m[1] : f; };
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const setDrawer = open => document.body.classList.toggle('drawer', !!open);
  const wrapT = n => (n > 11 ? n - 12 : n < -11 ? n + 12 : n);

  // ---------- başlat ----------
  async function init() {
    const stored = await S.getSettings();
    settings = { ...structuredClone(DEFAULTS), ...stored };
    settings.colors = { ...DEFAULTS.colors, ...(stored.colors || {}) };
    settings.fonts = { ...DEFAULTS.fonts, ...(stored.fonts || {}) };
    settings.songState = stored.songState || {};
    settings.groupState = stored.groupState || {};
    $('#sortBy').value = settings.sort;
    applyLook();
    bind();
    if (WEB) {
      $('#empty p').innerHTML = 'Başlamak için Google Drive\'daki şarkı klasörünü seç.<br>Şarkılar telefona da kaydedilir; internet olmadan da açılır.';
      $('#btnAddFolderEmpty').textContent = 'Drive klasörü seç';
    }
    await scan();
    if (isMobile() && !current) setDrawer(true);
    if (WEB && S.consumePendingPick()) addFolder();
    else if (WEB && settings.folders.length && S.isConnected()) S.syncNow(settings.folders);
  }
  init();
})();
