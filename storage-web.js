// Repertoire — web / iPhone depolama adaptörü (Google Drive + çevrimdışı önbellek)
// Masaüstünde (Electron) preload zaten window.storage sağladığı için bu dosya devre dışı kalır.
(() => {
  if (window.storage) return;

  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const SONG_EXT = /\.(pro|cho|chopro|chordpro|crd|chord|txt)$/i;
  const LS = { settings: 'rp.settings', token: 'rp.token', clientId: 'rp.clientId', lastSync: 'rp.lastSync', pendingPick: 'rp.pendingPick', state: 'rp.oauthState' };

  const listeners = { changed: [], status: [] };
  const emit = (k, v) => listeners[k].forEach(f => { try { f(v); } catch (e) { console.error(e); } });
  const status = t => emit('status', t);

  // ---------- yapılandırma ----------
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const clientId = () => localStorage.getItem(LS.clientId) || (window.REPERTOIRE_CONFIG || {}).clientId || '';

  // ---------- OAuth (yönlendirmeli akış: iPhone ana ekran uygulamasında güvenilir çalışır) ----------
  function readTokenFromHash() {
    if (!location.hash.includes('access_token')) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const expected = localStorage.getItem(LS.state);
    if (expected && p.get('state') !== expected) { console.warn('OAuth state uyuşmadı'); return; }
    const exp = Date.now() + (parseInt(p.get('expires_in'), 10) || 3600) * 1000;
    localStorage.setItem(LS.token, JSON.stringify({ t: p.get('access_token'), exp }));
    localStorage.removeItem(LS.state);
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (location.hash.includes('error=')) {
    const p = new URLSearchParams(location.hash.slice(1));
    setTimeout(() => alert('Google girişi tamamlanamadı: ' + p.get('error')), 500);
    history.replaceState(null, '', location.pathname + location.search);
  }
  readTokenFromHash();

  function token() {
    try { const t = JSON.parse(localStorage.getItem(LS.token)); return t && t.exp > Date.now() + 60000 ? t.t : null; } catch { return null; }
  }
  function connect() {
    const id = clientId();
    if (!id) { alert('Önce Ayarlar → Google Drive bölümüne Google Client ID gir.'); return; }
    const state = Math.random().toString(36).slice(2);
    localStorage.setItem(LS.state, state);
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({
      client_id: id, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE,
      include_granted_scopes: 'true', state, prompt: localStorage.getItem('rp.consented') ? '' : 'consent',
    }).toString();
    localStorage.setItem('rp.consented', '1');
    location.href = u.toString();
  }
  function disconnect() { localStorage.removeItem(LS.token); status('Drive bağlantısı kesildi'); }

  class AuthError extends Error {}
  async function api(url, opts = {}) {
    const t = token();
    if (!t) throw new AuthError('Giriş gerekli');
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (res.status === 401) { localStorage.removeItem(LS.token); throw new AuthError('Oturum süresi doldu'); }
    if (!res.ok) throw new Error(`Drive hatası ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }
  const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  async function listChildren(folderId, onlyFolders) {
    const out = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: `'${q(folderId)}' in parents and trashed = false` + (onlyFolders ? " and mimeType = 'application/vnd.google-apps.folder'" : ''),
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum)',
        pageSize: '1000', orderBy: 'name', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const r = await (await api(`${API}/files?${params}`)).json();
      out.push(...r.files);
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }

  function decode(buf) {
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) { try { text = new TextDecoder('windows-1254').decode(buf); } catch {} }
    return text.replace(/^﻿/, '');
  }
  async function download(id) {
    const r = await api(`${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
    return decode(await r.arrayBuffer());
  }

  // ---------- IndexedDB önbellek ----------
  let dbp;
  function db() {
    return dbp = dbp || new Promise((res, rej) => {
      const r = indexedDB.open('repertoire', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('files', { keyPath: 'id' });
        r.result.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const allFiles = () => tx('files', 'readonly', s => reqP(s.getAll()));
  const getFile = id => tx('files', 'readonly', s => reqP(s.get(id)));
  const putFiles = list => tx('files', 'readwrite', s => { list.forEach(f => s.put(f)); });
  const delFiles = ids => tx('files', 'readwrite', s => { ids.forEach(id => s.delete(id)); });
  const allQueue = () => tx('queue', 'readonly', s => reqP(s.getAll()));
  const pushQueue = item => tx('queue', 'readwrite', s => { s.put(item); });
  const delQueue = qid => tx('queue', 'readwrite', s => { s.delete(qid); });

  // ---------- klasör tanımı: "gdrive:<id>:<ad>" ----------
  const parseFolder = f => { const m = /^gdrive:([^:]+):(.*)$/.exec(f || ''); return m ? { id: m[1], name: m[2] } : null; };

  // ---------- senkronizasyon ----------
  let syncing = false;
  async function sync(folders, force) {
    if (syncing) return;
    if (!token()) { status(navigator.onLine ? 'Drive\'a bağlı değil' : 'Çevrimdışı'); return; }
    const last = +localStorage.getItem(LS.lastSync) || 0;
    if (!force && Date.now() - last < 30000) return;
    syncing = true;
    let changed = false;
    try {
      changed = await flushQueue() || changed;
      const cached = await allFiles();
      const byId = new Map(cached.map(f => [f.id, f]));
      const seen = new Set();
      for (const fs of folders || []) {
        const root = parseFolder(fs);
        if (!root) continue;
        status('Drive taranıyor…');
        // Klasör ağacını gez
        const remote = [];
        const stack = [{ id: root.id, path: '' }];
        while (stack.length) {
          const cur = stack.pop();
          const kids = await listChildren(cur.id);
          for (const k of kids) {
            if (k.mimeType === 'application/vnd.google-apps.folder') stack.push({ id: k.id, path: cur.path + k.name + '/' });
            else if (SONG_EXT.test(k.name)) remote.push({ ...k, rel: cur.path + k.name });
          }
        }
        const toFetch = remote.filter(r => {
          seen.add(r.id);
          const c = byId.get(r.id);
          return !c || c.dirty ? !c : (c.md5 !== r.md5Checksum || c.rel !== r.rel || c.root !== fs);
        });
        let done = 0;
        const results = [];
        const worker = async () => {
          while (toFetch.length) {
            const r = toFetch.shift();
            const c = byId.get(r.id);
            const text = c && c.md5 === r.md5Checksum ? c.text : await download(r.id);
            results.push({ id: r.id, root: fs, rel: r.rel, name: r.name, text, mtime: Date.parse(r.modifiedTime) || Date.now(), md5: r.md5Checksum });
            done++;
            if (done % 10 === 0 || !toFetch.length) status(`İndiriliyor ${done}/${done + toFetch.length}`);
            if (results.length >= 50) { await putFiles(results.splice(0)); }
            if (done % 200 === 0) emit('changed'); // şarkılar indikçe listede görünsün
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        if (results.length) await putFiles(results);
        if (done) changed = true;
      }
      // Drive'dan silinenleri önbellekten kaldır (bekleyen yerel değişiklik yoksa)
      const roots = new Set(folders || []);
      const gone = cached.filter(c => (!roots.has(c.root) || !seen.has(c.id)) && !c.dirty && !String(c.id).startsWith('local-')).map(c => c.id);
      if (gone.length) { await delFiles(gone); changed = true; }
      localStorage.setItem(LS.lastSync, Date.now());
      const pending = (await allQueue()).length;
      status(pending ? `${pending} değişiklik yüklenmeyi bekliyor` : 'Senkronize ✓');
    } catch (e) {
      console.error(e);
      status(e instanceof AuthError ? 'Drive oturumu doldu — dokun, yeniden bağlan' : 'Senkron hatası: ' + e.message);
    } finally {
      syncing = false;
    }
    if (changed) emit('changed');
  }

  async function flushQueue() {
    const items = await allQueue();
    if (!items.length || !token()) return false;
    for (const it of items) {
      if (it.op === 'update') {
        const r = await (await api(`${UPLOAD}/files/${encodeURIComponent(it.id)}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime,md5Checksum`, {
          method: 'PATCH', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: it.text,
        })).json();
        const f = await getFile(it.id);
        if (f) await putFiles([{ ...f, md5: r.md5Checksum, mtime: Date.parse(r.modifiedTime) || f.mtime, dirty: false }]);
      } else if (it.op === 'create') {
        const r = await createRemote(it.parentId, it.name, it.text);
        const f = await getFile(it.tempId);
        await delFiles([it.tempId]);
        if (f) await putFiles([{ ...f, id: r.id, md5: r.md5Checksum, mtime: Date.parse(r.modifiedTime) || f.mtime, dirty: false }]);
      }
      await delQueue(it.qid);
    }
    return true;
  }

  async function createRemote(parentId, name, text) {
    const boundary = 'rp' + Math.random().toString(36).slice(2);
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [parentId], mimeType: 'text/plain' }) +
      `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
    return (await api(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,modifiedTime,md5Checksum`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body,
    })).json();
  }

  // ---------- Drive klasör seçici ----------
  function pickFolder() {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'picker';
      wrap.innerHTML = `<div class="picker-box"><div class="picker-head"><strong>Şarkı klasörünü seç</strong><button class="icon sm" data-x>✕</button></div>
        <div class="picker-crumbs"></div><div class="picker-list"><div class="hint">Yükleniyor…</div></div>
        <div class="picker-foot"><button class="primary" data-ok>Bu klasörü seç</button></div></div>`;
      document.body.appendChild(wrap);
      const trail = [{ id: 'root', name: 'Drive\'ım' }];
      const close = v => { wrap.remove(); resolve(v); };
      const show = async () => {
        wrap.querySelector('.picker-crumbs').innerHTML = trail.map((t, i) => `<button class="link" data-crumb="${i}">${t.name.replace(/</g, '&lt;')}</button>`).join(' › ');
        const list = wrap.querySelector('.picker-list');
        list.innerHTML = '<div class="hint">Yükleniyor…</div>';
        try {
          const kids = await listChildren(trail[trail.length - 1].id, true);
          list.innerHTML = kids.map(k => `<div class="picker-item" data-id="${k.id}" data-name="${k.name.replace(/"/g, '&quot;')}">📁 ${k.name.replace(/</g, '&lt;')}</div>`).join('') || '<div class="hint">Alt klasör yok. Bu klasörü seçebilirsin.</div>';
        } catch (e) {
          list.innerHTML = `<div class="hint">${e instanceof AuthError ? 'Oturum süresi doldu, yeniden bağlanılıyor…' : e.message}</div>`;
          if (e instanceof AuthError) { localStorage.setItem(LS.pendingPick, '1'); setTimeout(connect, 800); }
        }
      };
      wrap.addEventListener('click', e => {
        if (e.target.closest('[data-x]') || e.target === wrap) return close(null);
        const it = e.target.closest('.picker-item');
        if (it) { trail.push({ id: it.dataset.id, name: it.dataset.name }); return show(); }
        const cr = e.target.closest('[data-crumb]');
        if (cr) { trail.splice(+cr.dataset.crumb + 1); return show(); }
        if (e.target.closest('[data-ok]')) {
          const t = trail[trail.length - 1];
          close(`gdrive:${t.id}:${trail.map(x => x.name).join(' › ')}`);
        }
      });
      show();
    });
  }

  // ---------- app.js'in kullandığı arayüz ----------
  window.storage = {
    platform: 'web',
    async getSettings() { try { return JSON.parse(localStorage.getItem(LS.settings)) || {}; } catch { return {}; } },
    async setSettings(patch) {
      const s = { ...(await this.getSettings()), ...patch };
      localStorage.setItem(LS.settings, JSON.stringify(s));
      return s;
    },
    async chooseFolder() {
      if (!token()) { localStorage.setItem(LS.pendingPick, '1'); connect(); return null; }
      return pickFolder();
    },
    consumePendingPick() { const v = localStorage.getItem(LS.pendingPick); localStorage.removeItem(LS.pendingPick); return !!v && !!token(); },
    async scan(folders) {
      const roots = new Set(folders || []);
      const files = (await allFiles()).filter(f => roots.has(f.root));
      setTimeout(() => sync(folders, false), 50);
      return files.map(f => ({ path: 'gdrive://' + f.id, root: f.root, rel: f.rel, name: f.name, text: f.text, mtime: f.mtime }));
    },
    async read(p) { const f = await getFile(p.replace('gdrive://', '')); return f ? f.text : ''; },
    async write(p, text) {
      const id = p.replace('gdrive://', '');
      const f = await getFile(id);
      const mtime = Date.now();
      if (f) await putFiles([{ ...f, text, mtime, dirty: true }]);
      const q2 = await allQueue();
      const existing = q2.find(x => (x.op === 'update' && x.id === id) || (x.op === 'create' && x.tempId === id));
      if (existing) await pushQueue({ ...existing, text });
      else await pushQueue({ op: 'update', id, text });
      if (token()) flushQueue().then(() => status('Drive\'a kaydedildi ✓')).catch(e => status(e instanceof AuthError ? 'Kaydedildi — Drive\'a yüklemek için dokun, bağlan' : 'Yükleme hatası: ' + e.message));
      else status('Telefona kaydedildi — Drive\'a bağlanınca yüklenecek');
      return mtime;
    },
    async create(folder, name, text) {
      const root = parseFolder(folder);
      const safe = (name || 'Yeni Şarkı').replace(/[\\/:*?"<>|]/g, '').trim() || 'Yeni Şarkı';
      const fname = safe + '.pro';
      const tempId = 'local-' + Date.now();
      await putFiles([{ id: tempId, root: folder, rel: fname, name: fname, text, mtime: Date.now(), dirty: true }]);
      await pushQueue({ op: 'create', tempId, parentId: root.id, name: fname, text });
      if (token()) {
        try { await flushQueue(); } catch (e) { console.error(e); }
        const all = await allFiles();
        const created = all.find(f => f.root === folder && f.name === fname && !String(f.id).startsWith('local-'));
        if (created) return 'gdrive://' + created.id;
      }
      return 'gdrive://' + tempId;
    },
    reveal(p) { const id = p.replace('gdrive://', ''); if (!id.startsWith('local-')) window.open('https://drive.google.com/file/d/' + id + '/view', '_blank'); },
    async toggleFullscreen() {
      const d = document;
      if (d.fullscreenElement) await d.exitFullscreen?.();
      else await d.documentElement.requestFullscreen?.().catch(() => {});
      return !!d.fullscreenElement;
    },
    onFolderChanged(cb) { listeners.changed.push(cb); },
    onStatus(cb) { listeners.status.push(cb); },
    // web'e özel
    connect, disconnect,
    isConnected: () => !!token(),
    getClientId: clientId,
    setClientId: v => localStorage.setItem(LS.clientId, (v || '').trim()),
    syncNow: folders => token() ? sync(folders, true) : connect(),
    async clearCache() { await tx('files', 'readwrite', s => s.clear()); localStorage.removeItem(LS.lastSync); },
  };

  window.addEventListener('online', () => status('Çevrimiçi'));
  window.addEventListener('offline', () => status('Çevrimdışı — telefondaki şarkılar kullanılıyor'));

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
})();
