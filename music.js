// Repertoire — müzik motoru: ayrıştırma, transpoze, akor şekilleri
(function (root) {
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const LATIN = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  const LATIN_FLAT = ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
  // Bemol yazımı tercih edilen tonlar (majör/minör)
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

  const NOTE_RE = '([A-H])([#b♯♭]?)';
  const SUFFIX_RE = "((?:maj|min|dim|aug|sus|add|m|M|Δ|°|ø|\\+|-|[0-9]|b|#|♯|♭|\\(|\\)|,|alt|no)*)";
  const CHORD_RE = new RegExp('^' + NOTE_RE + SUFFIX_RE + '(?:/' + NOTE_RE + ')?$');

  function noteIndex(letter, acc) {
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 }[letter];
    if (base === undefined) return -1;
    let n = base;
    if (acc === '#' || acc === '♯') n++;
    if (acc === 'b' || acc === '♭') n--;
    return (n + 12) % 12;
  }

  function parseChord(str) {
    const s = (str || '').trim();
    const m = s.match(CHORD_RE);
    if (!m) return null;
    // "Bb" gibi durumlarda "b" eki nota işaretidir; ek kısmı ayrıca tutulur
    return {
      root: noteIndex(m[1], m[2]),
      suffix: m[3] || '',
      bass: m[4] ? noteIndex(m[4], m[5]) : null,
    };
  }

  function isChord(str) { return !!parseChord(str); }

  function noteName(idx, opts) {
    const i = ((idx % 12) + 12) % 12;
    const flat = opts && opts.flat;
    if (opts && opts.latin) return (flat ? LATIN_FLAT : LATIN)[i];
    return (flat ? FLAT : SHARP)[i];
  }

  // Hedef tonuna göre diyez/bemol seçimi
  function prefersFlat(keyStr, shift, notation) {
    if (notation === 'sharp') return false;
    if (notation === 'flat') return true;
    const k = parseChord(keyStr || '');
    if (!k) return false;
    const minor = /^m(?!aj)/.test(k.suffix);
    const name = FLAT[((k.root + shift) % 12 + 12) % 12] + (minor ? 'm' : '');
    return FLAT_KEYS.has(name);
  }

  function transposeChord(str, shift, opts) {
    const c = parseChord(str);
    if (!c) return str;
    let out = noteName(c.root + shift, opts) + c.suffix;
    if (c.bass !== null) out += '/' + noteName(c.bass + shift, opts);
    return out;
  }

  // ---------- Akor-satırı algılama (akor üstte, söz altta formatı) ----------
  const CHORD_LINE_TOKEN = /^(\||\|\||-+|\/+|\.+|x\d+|\(x?\d+x?\)|%|N\.?C\.?|\(|\))$/i;
  function isChordLine(line) {
    if (!line.trim()) return false;
    const tokens = line.trim().split(/\s+/);
    let chords = 0;
    for (let t of tokens) {
      const bare = t.replace(/^\(|\)$/g, '');
      if (isChord(bare)) { chords++; continue; }
      if (CHORD_LINE_TOKEN.test(t)) continue;
      return false;
    }
    return chords > 0;
  }

  const NC_RE = /^N\.?C\.?$/i;
  function chordLineToTokens(line) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line))) out.push({ col: m.index, text: m[0] });
    return out;
  }

  // Akor satırı + söz satırını [Am]söz biçimine birleştir
  function mergeChordLyric(chordLine, lyric) {
    const tokens = chordLineToTokens(chordLine).filter(t => isChord(t.text.replace(/^\(|\)$/g, '')) || NC_RE.test(t.text));
    if (!tokens.length) return [{ chord: '', text: lyric }];
    const segs = [];
    const lyr = lyric.padEnd(tokens[tokens.length - 1].col, ' ');
    if (tokens[0].col > 0) segs.push({ chord: '', text: lyr.slice(0, tokens[0].col) });
    tokens.forEach((t, i) => {
      const end = i + 1 < tokens.length ? tokens[i + 1].col : lyr.length;
      segs.push({ chord: t.text.replace(/^\(|\)$/g, ''), text: lyr.slice(t.col, end) });
    });
    return segs;
  }

  // ---------- Ayrıştırıcı ----------
  const SECTION_START = {
    start_of_chorus: 'Nakarat', soc: 'Nakarat',
    start_of_verse: 'Kıta', sov: 'Kıta',
    start_of_bridge: 'Köprü', sob: 'Köprü',
    start_of_tab: 'Tab', sot: 'Tab',
    start_of_grid: 'Grid', sog: 'Grid',
    start_of_intro: 'Giriş', start_of_outro: 'Bitiş',
  };
  const SECTION_END = /^(end_of_\w+|eoc|eov|eob|eot|eog)$/;
  const META_ALIASES = {
    t: 'title', title: 'title', st: 'artist', subtitle: 'artist', artist: 'artist',
    key: 'key', capo: 'capo', tempo: 'tempo', time: 'time', album: 'album',
    year: 'year', composer: 'composer', lyricist: 'lyricist', duration: 'duration',
    keywords: 'keywords', copyright: 'copyright',
  };
  const LABEL_WORDS = '(?:verse|chorus|pre-?chorus|bridge|intro|outro|solo|interlude|instrumental|ending|coda|tag|riff|refrain|nakarat|kıta|kita|giriş|giris|bitiş|bitis|köprü|kopru|ara|ara nağme|final|son)';
  const LABEL_ONLY_RE = new RegExp('^\\s*' + LABEL_WORDS + '(?:\\s*\\d+)?(?:\\s*\\(?x?\\d+x?\\)?)?\\s*:?\\s*$', 'i');
  const SECTION_LABEL_RE = new RegExp('^\\s*(?:\\[([^\\]]+)\\]|(' + LABEL_WORDS + '(?:\\s*\\d+)?(?:\\s*\\(?x?\\d+x?\\)?)?)\\s*:?)\\s*$', 'i');

  function parseInline(line) {
    const segs = [];
    const re = /\[([^\]]*)\]/g;
    let last = 0, m, pendingChord = '';
    while ((m = re.exec(line))) {
      const before = line.slice(last, m.index);
      if (before || pendingChord) segs.push({ chord: pendingChord, text: before });
      pendingChord = m[1];
      last = re.lastIndex;
    }
    const rest = line.slice(last);
    if (rest || pendingChord) segs.push({ chord: pendingChord, text: rest });
    return segs;
  }

  function parse(text) {
    const song = { meta: {}, sections: [] };
    const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
    let cur = null;
    const newSection = (type, label, explicit) => { cur = { type, label, lines: [], explicit }; song.sections.push(cur); return cur; };
    const ensure = () => cur || newSection('verse', '');
    // Bölüm etiketi: açık bir {soc} bloğunun başındaysak onun adını değiştir, değilse yeni bölüm başlat
    const startLabel = (label) => {
      if (cur && cur.explicit && !cur.lines.length) { cur.label = label; return; }
      const t = /nakarat|chorus|refrain/i.test(label) ? 'chorus' : /köprü|kopru|bridge/i.test(label) ? 'bridge' : 'verse';
      newSection(t, label, false);
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      let line = raw.replace(/\s+$/, '');

      if (/^#/.test(line)) continue; // yorum satırı

      // {soh}Intro:{eoh} — tek başına ise bölüm etiketi, satır içindeyse vurgusu kaldırılmış metin
      const hl = line.match(/^\s*\{soh\}(.*?)\{eoh\}\s*$/i);
      if (hl) { startLabel(hl[1].replace(/:\s*$/, '').trim()); continue; }
      if (/\{soh\}|\{eoh\}/i.test(line)) line = line.replace(/\{(soh|eoh)\}/gi, '');

      const dir = line.match(/^\s*\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}\s*$/);
      if (dir) {
        const name = dir[1].toLowerCase();
        const val = (dir[2] || '').trim();
        if (META_ALIASES[name]) { if (!song.meta[META_ALIASES[name]]) song.meta[META_ALIASES[name]] = val; continue; }
        if (SECTION_START[name] !== undefined) {
          const type = name.includes('chorus') || name === 'soc' ? 'chorus'
            : name.includes('tab') || name === 'sot' ? 'tab'
            : name.includes('grid') || name === 'sog' ? 'grid'
            : name.includes('bridge') || name === 'sob' ? 'bridge' : 'verse';
          newSection(type, val || (type === 'verse' ? '' : SECTION_START[name]), true);
          continue;
        }
        if (SECTION_END.test(name)) { cur = null; continue; }
        if (['c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight'].includes(name)) {
          if (LABEL_ONLY_RE.test(val)) { startLabel(val.replace(/:\s*$/, '')); continue; }
          ensure().lines.push({ type: 'comment', text: val, style: name });
          continue;
        }
        if (name === 'chorus') { ensure().lines.push({ type: 'chorusref', text: val || 'Nakarat' }); continue; }
        if (['np', 'new_page', 'colb', 'column_break', 'npp'].includes(name)) { ensure().lines.push({ type: 'break' }); continue; }
        if (name === 'section' || name === 'label') { newSection(/nakarat|chorus/i.test(val) ? 'chorus' : 'verse', val); continue; }
        continue; // bilinmeyen yönerge: sessizce atla
      }

      if (cur && (cur.type === 'tab' || cur.type === 'grid')) { cur.lines.push({ type: 'pre', text: raw }); continue; }

      if (!line.trim()) {
        // Boş satır: bölüm içinde değilsek yeni paragraf
        if (cur && cur.explicit && cur.lines.length) cur.lines.push({ type: 'space' });
        else if (cur && cur.lines.length) cur = null;
        continue;
      }

      // "Nakarat:" / "[Verse 2]" gibi tek başına bölüm etiketleri
      const lab = line.match(SECTION_LABEL_RE);
      if (lab) {
        const label = (lab[1] || lab[2]).trim();
        if (!(lab[1] && isChord(label))) {
          const t = /nakarat|chorus|refrain/i.test(label) ? 'chorus' : /köprü|bridge/i.test(label) ? 'bridge' : 'verse';
          newSection(t, label, false);
          continue;
        }
      }

      if (isChordLine(line)) {
        const next = (lines[i + 1] || '').replace(/\s+$/, '');
        const nextUsable = next.trim() && !/^\s*[{#]/.test(next) && !isChordLine(next) && !SECTION_LABEL_RE.test(next) && !/\[[^\]]+\]/.test(next);
        if (nextUsable) {
          ensure().lines.push({ type: 'line', segs: mergeChordLyric(line, next) });
          i++;
        } else {
          ensure().lines.push({ type: 'line', segs: chordLineToTokens(line).map(t => ({ chord: isChord(t.text.replace(/^\(|\)$/g, '')) ? t.text.replace(/^\(|\)$/g, '') : '', text: isChord(t.text.replace(/^\(|\)$/g, '')) ? '' : t.text + ' ' })), chordsOnly: true });
        }
        continue;
      }

      const segs = parseInline(line);
      const chordsOnly = segs.every(s => !s.text.trim());
      ensure().lines.push({ type: 'line', segs, chordsOnly });
    }

    if (!song.meta.title) {
      // Başlık yönergesi yoksa ilk satırı başlık say (düz metin dosyaları için)
      const first = song.sections[0] && song.sections[0].lines[0];
      if (first && first.type === 'line' && !first.segs.some(s => s.chord)) {
        song.meta.title = first.segs.map(s => s.text).join('').trim();
        song.sections[0].lines.shift();
        const sec0 = song.sections[0].lines;
        const second = sec0[0];
        if (!song.meta.artist && sec0.length === 1 && second.type === 'line' && !second.segs.some(s => s.chord)) {
          const t = second.segs.map(s => s.text).join('').trim();
          if (t.length < 60) { song.meta.artist = t; sec0.shift(); }
        }
      }
    }
    // İçi boş "Chorus" etiketleri = nakarat tekrarı
    const hasChorus = song.sections.some(s => s.type === 'chorus' && s.lines.length);
    for (const sec of song.sections) {
      if (!sec.lines.length && sec.type === 'chorus' && hasChorus) {
        sec.lines.push({ type: 'chorusref', text: sec.label || 'Nakarat' });
        sec.type = 'verse'; sec.label = '';
      }
    }
    song.sections = song.sections.filter(s => s.lines.length || s.label);
    return song;
  }

  function songChords(song) {
    const set = [];
    for (const s of song.sections) for (const l of s.lines) if (l.segs) for (const g of l.segs)
      if (g.chord && isChord(g.chord) && !set.includes(g.chord)) set.push(g.chord);
    return set;
  }

  // Dosya metnindeki tüm akorları kalıcı olarak transpoze et (biçimi koruyarak)
  function transposeText(text, shift, opts) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    return lines.map(line => {
      const dir = line.match(/^(\s*\{\s*key\s*:\s*)(.*?)(\s*\}\s*)$/i);
      if (dir) return dir[1] + transposeChord(dir[2], shift, opts) + dir[3];
      if (/^\s*[{#]/.test(line)) return line;
      if (isChordLine(line)) {
        // Sütun hizasını korumaya çalış
        let out = '';
        for (const t of chordLineToTokens(line)) {
          const bare = t.text.replace(/^\(|\)$/g, '');
          const nt = isChord(bare) ? t.text.replace(bare, transposeChord(bare, shift, opts)) : t.text;
          const col = Math.max(t.col, out.length ? out.length + 1 : 0);
          out = out.padEnd(col, ' ') + nt;
        }
        return out;
      }
      return line.replace(/\[([^\]]+)\]/g, (m, c) => isChord(c) ? '[' + transposeChord(c, shift, opts) + ']' : m);
    }).join('\n');
  }

  // Üstte akor / altta söz satırlarını [Am]söz biçimine çevir
  function toInline(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\s*[{#]/.test(line) && isChordLine(line)) {
        const next = lines[i + 1] || '';
        if (next.trim() && !/^\s*[{#]/.test(next) && !isChordLine(next) && !/\[[^\]]+\]/.test(next)) {
          out.push(mergeChordLyric(line, next).map(g => (g.chord ? '[' + g.chord + ']' : '') + g.text).join('').replace(/\s+$/, ''));
          i++; continue;
        }
        out.push(chordLineToTokens(line).map(t => isChord(t.text.replace(/^\(|\)$/g, '')) ? '[' + t.text.replace(/^\(|\)$/g, '') + ']' : t.text).join(' '));
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  // ---------- Akor şekilleri (gitar, standart akort) ----------
  // Diziler kalın E telinden ince e teline: x = çalınmaz
  const OPEN = {
    'C': 'x32010', 'C7': 'x32310', 'Cmaj7': 'x32000', 'Cadd9': 'x32030', 'Csus4': 'x33011', 'Csus2': 'x30013', 'C6': 'x32210',
    'D': 'xx0232', 'Dm': 'xx0231', 'D7': 'xx0212', 'Dm7': 'xx0211', 'Dmaj7': 'xx0222', 'Dsus2': 'xx0230', 'Dsus4': 'xx0233', 'D6': 'xx0202', 'D5': 'xx023x',
    'G': '320003', 'G7': '320001', 'Gmaj7': '320002', 'G6': '320000', 'Gsus4': '3x0013', 'Gadd9': '300203', 'G5': '355xxx',
    'F': '133211', 'Fmaj7': 'xx3210', 'Fsus2': 'xx3011', 'Fadd9': 'xx3213',
    'B7': 'x21202', 'Bm': 'x24432', 'Bm7': 'x20202',
    'E5': '022xxx', 'A5': 'x022xx',
  };
  // Hareketli kalıplar: kök fret r'ye göre göreli değerler
  const E_SHAPE = {
    '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], 'm7': [0, 2, 0, 0, 0, 0],
    'maj7': [0, 'x', 1, 1, 0, 'x'], 'sus4': [0, 2, 2, 2, 0, 0], '7sus4': [0, 2, 0, 2, 0, 0], 'aug': [0, 3, 2, 1, 1, 0],
    '6': [0, 2, 2, 1, 2, 0], 'm6': [0, 2, 2, 0, 2, 0], '5': [0, 2, 2, 'x', 'x', 'x'], '9': [0, 2, 0, 1, 0, 2],
  };
  const A_SHAPE = {
    '': ['x', 0, 2, 2, 2, 0], 'm': ['x', 0, 2, 2, 1, 0], '7': ['x', 0, 2, 0, 2, 0], 'm7': ['x', 0, 2, 0, 1, 0],
    'maj7': ['x', 0, 2, 1, 2, 0], 'sus2': ['x', 0, 2, 2, 0, 0], 'sus4': ['x', 0, 2, 2, 3, 0], '7sus4': ['x', 0, 2, 0, 3, 0],
    'dim': ['x', 0, 1, 2, 1, 'x'], 'dim7': ['x', 0, 1, 2, 1, 2], 'm7b5': ['x', 0, 1, 0, 1, 'x'], 'aug': ['x', 0, 3, 2, 2, 1],
    '6': ['x', 0, 2, 2, 2, 2], 'm6': ['x', 0, 2, 2, 1, 2], '9': ['x', 0, -1, 0, 0, 0],
    'add9': ['x', 0, 2, 4, 2, 0], '5': ['x', 0, 2, 2, 'x', 'x'], 'm9': ['x', 0, -2, 0, 0, 0],
    'maj9': ['x', 0, -1, 1, 0, 'x'],
  };

  function normalizeQuality(suffix) {
    let s = (suffix || '').replace(/[()]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b');
    s = s.replace(/^min/, 'm').replace(/^-(?!\d)/, 'm').replace(/^M(?=7|9|aj)/, 'maj').replace(/^M$/, '')
      .replace(/^Δ7?/, 'maj7').replace(/^°7/, 'dim7').replace(/^°/, 'dim').replace(/^ø7?/, 'm7b5')
      .replace(/^\+/, 'aug').replace(/^maj$/, '').replace(/^2$/, 'sus2').replace(/^sus$/, 'sus4')
      .replace(/^m7-5$/, 'm7b5').replace(/^7\+5$/, 'aug').replace(/^add2$/, 'add9');
    return s;
  }
  // Bilinmeyen nitelikleri bilinen en yakın akora indir
  function fallbackQuality(q) {
    const chain = [q];
    const rules = [
      [/^maj(9|11|13)$/, 'maj7'], [/^m(11|13)$/, 'm7'], [/^m9$/, 'm7'], [/^(11|13)$/, '7'], [/^7(b|#)\d+$/, '7'],
      [/^9sus4$/, '7sus4'], [/^add(11|4)$/, ''], [/^madd9$/, 'm'], [/^m(maj7|M7)$/, 'm'], [/^7sus2$/, 'sus2'],
      [/^sus2sus4$/, 'sus4'], [/^6\/?9$/, '6'], [/^m6\/?9$/, 'm6'], [/^dim7$/, 'dim'],
    ];
    let cur = q;
    for (let n = 0; n < 4; n++) {
      const r = rules.find(([re]) => re.test(cur));
      if (!r) break;
      cur = r[1]; chain.push(cur);
    }
    if (/^m/.test(q) && !/^maj/.test(q)) chain.push('m');
    chain.push('');
    return chain;
  }

  function fromTemplate(tpl, r) {
    const frets = tpl.map(v => v === 'x' ? 'x' : v + r);
    if (frets.some(f => f !== 'x' && f < 0)) return null;
    return frets;
  }

  // Bir akor için olası basış şekillerini döndür (ilk = önerilen)
  function chordShapes(chordStr) {
    const c = parseChord(chordStr);
    if (!c) return [];
    const q = normalizeQuality(c.suffix);
    const shapes = [];
    const seen = new Set();
    const add = (frets, label) => {
      if (!frets) return;
      const key = frets.join(',');
      if (seen.has(key)) return;
      seen.add(key); shapes.push({ frets, label });
    };
    const quals = fallbackQuality(q);
    for (const qq of quals) {
      const name = SHARP[c.root] + qq, nameF = FLAT[c.root] + qq;
      const open = OPEN[name] || OPEN[nameF];
      if (open) add(open.split('').map(ch => ch === 'x' ? 'x' : parseInt(ch, 10)), 'Açık');
      const rE = (c.root - 4 + 12) % 12, rA = (c.root - 9 + 12) % 12;
      if (E_SHAPE[qq]) { add(fromTemplate(E_SHAPE[qq], rE), rE === 0 ? 'Açık' : 'E kalıbı'); add(fromTemplate(E_SHAPE[qq], rE + 12), 'E kalıbı'); }
      if (A_SHAPE[qq]) { add(fromTemplate(A_SHAPE[qq], rA), rA === 0 ? 'Açık' : 'A kalıbı'); add(fromTemplate(A_SHAPE[qq], rA + 12), 'A kalıbı'); }
      if (shapes.length) {
        // Düşük pozisyonlu şekiller önce
        shapes.sort((a, b) => minFret(a.frets) - minFret(b.frets));
        let res = shapes.filter(s => maxFret(s.frets) <= 15);
        if (c.bass !== null && c.bass !== c.root) res = withBass(res, c.bass).concat(res);
        res = dedupe(res);
        res.approx = qq !== q ? SHARP[c.root] + qq : null;
        return res;
      }
    }
    return shapes;
  }
  // Slash akor: bas notasını 6. veya 5. tele yerleştirmeye çalış
  function withBass(shapes, bass) {
    const out = [];
    for (const sh of shapes) {
      const f = sh.frets.slice();
      const played = f.filter(v => v !== 'x' && v > 0);
      const lo = played.length ? Math.min(...played) : 0, hi = played.length ? Math.max(...played) : 0;
      const fits = fr => fr === 0 || (fr >= Math.max(1, hi - 3) && fr <= lo + 3);
      for (const [str, open] of [[0, 4], [1, 9]]) {
        let fr = (bass - open + 12) % 12;
        if (!fits(fr) && fits(fr + 12)) fr += 12;
        if (!fits(fr)) continue;
        const g = f.slice();
        g[str] = fr;
        for (let k = 0; k < str; k++) g[k] = 'x';
        out.push({ frets: g, label: sh.label + ' + bas' });
        break;
      }
    }
    return out;
  }
  function dedupe(list) {
    const seen = new Set();
    return list.filter(s => { const k = s.frets.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function minFret(f) { const n = f.filter(v => v !== 'x' && v > 0); return n.length ? Math.min(...n) : 0; }
  function maxFret(f) { const n = f.filter(v => v !== 'x'); return n.length ? Math.max(...n) : 0; }

  // SVG akor diyagramı
  function chordSVG(frets, opts = {}) {
    const W = 120, H = 150, left = 22, top = 30, sw = 76 / 5, fh = 22, nFrets = 5;
    const fg = opts.color || 'currentColor';
    const played = frets.filter(f => f !== 'x' && f > 0);
    const maxF = played.length ? Math.max(...played) : 0;
    const minF = played.length ? Math.min(...played) : 0;
    const base = maxF <= 5 ? 1 : minF;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${opts.size || 120}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">`;
    if (base === 1) s += `<rect x="${left - 1}" y="${top - 4}" width="${sw * 5 + 2}" height="4" fill="${fg}"/>`;
    else s += `<text x="${left - 6}" y="${top + fh / 2 + 4}" font-size="11" text-anchor="end" fill="${fg}">${base}</text>`;
    for (let i = 0; i <= nFrets; i++) s += `<line x1="${left}" y1="${top + i * fh}" x2="${left + sw * 5}" y2="${top + i * fh}" stroke="${fg}" stroke-width="1" opacity=".6"/>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${left + i * sw}" y1="${top}" x2="${left + i * sw}" y2="${top + nFrets * fh}" stroke="${fg}" stroke-width="${1.6 - i * 0.15}" opacity=".85"/>`;
    // Barre algıla
    const fretted = frets.map((f, i) => ({ f, i })).filter(o => o.f !== 'x' && o.f > 0);
    if (fretted.length >= 4) {
      const lowest = Math.min(...fretted.map(o => o.f));
      const atLow = fretted.filter(o => o.f === lowest);
      const firstIdx = atLow[0].i;
      if (atLow.length >= 2 && frets[5] === lowest && frets.slice(firstIdx).every(f => f !== 'x' && f >= lowest)) {
        const y = top + (lowest - base + 0.5) * fh;
        s += `<rect x="${left + firstIdx * sw - 6}" y="${y - 6}" width="${(5 - firstIdx) * sw + 12}" height="12" rx="6" fill="${opts.accent || fg}"/>`;
      }
    }
    frets.forEach((f, i) => {
      const x = left + i * sw;
      if (f === 'x') s += `<text x="${x}" y="${top - 10}" font-size="12" text-anchor="middle" fill="${fg}" opacity=".8">×</text>`;
      else if (f === 0) s += `<circle cx="${x}" cy="${top - 14}" r="4" fill="none" stroke="${fg}" stroke-width="1.4"/>`;
      else {
        const y = top + (f - base + 0.5) * fh;
        s += `<circle cx="${x}" cy="${y}" r="6.5" fill="${opts.accent || fg}"/>`;
      }
    });
    s += '</svg>';
    return s;
  }

  const api = { toInline, parse, parseChord, isChord, isChordLine, transposeChord, transposeText, noteName, prefersFlat, songChords, chordShapes, chordSVG, normalizeQuality };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof window !== 'undefined' ? window : globalThis);
