/*
 * claude-shim.js
 * Lokal ersättning för claude.ai:s artifact-runtime (window.claude.use).
 * Gör att apparna går att köra direkt i webbläsaren utan claude.ai.
 * Data sparas i localStorage, en webbläsare = en användare. Endast för utveckling och demo.
 * I produktion ersätts detta av ett riktigt API (se CLAUDE.md, steg 2).
 */
(function () {
  if (window.claude && window.claude.use) return; // kör inne i claude.ai, rör inget

  const PREFIX = 'shim:';
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const norm = p => String(p).replace(/^\/+|\/+$/g, '');
  const read = p => { try { const s = localStorage.getItem(PREFIX + p); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } };
  const write = (p, v) => { try { localStorage.setItem(PREFIX + p, JSON.stringify(v)); } catch (e) { console.warn('[shim] kunde inte spara', p, e); } };
  const remove = p => { try { localStorage.removeItem(PREFIX + p); } catch (e) {} };

  const listeners = new Set(); // {kind:'doc'|'col', path, cb}
  const notify = changed => {
    for (const l of listeners) {
      const hit = l.kind === 'doc' ? l.path === changed : changed.startsWith(l.path + '/') && !changed.slice(l.path.length + 1).includes('/');
      if (hit) setTimeout(() => l.cb(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)), 0);
    }
  };
  const docSnap = path => {
    const v = read(path);
    return { id: path.split('/').pop(), exists: v !== undefined, data: () => clone(v), ref: docRef(path) };
  };
  const colSnap = path => {
    const pre = PREFIX + path + '/';
    const docs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(pre) && !k.slice(pre.length).includes('/')) docs.push(docSnap(k.slice(PREFIX.length)));
    }
    docs.sort((a, b) => a.id.localeCompare(b.id));
    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
  };
  function docRef(p) {
    const path = norm(p);
    return {
      id: path.split('/').pop(), path,
      async get() { return docSnap(path); },
      async set(v, opt) { write(path, opt && opt.merge ? { ...(read(path) || {}), ...clone(v) } : clone(v)); notify(path); },
      async update(v) { write(path, { ...(read(path) || {}), ...clone(v) }); notify(path); },
      async delete() { remove(path); notify(path); },
      collection: c => colRef(path + '/' + c),
      onSnapshot(cb, err) { const l = { kind: 'doc', path, cb }; listeners.add(l); setTimeout(() => cb(docSnap(path)), 0); return () => listeners.delete(l); }
    };
  }
  function colRef(p) {
    const path = norm(p);
    return {
      path,
      doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
      async get() { return colSnap(path); },
      async add(v) { const r = docRef(path + '/' + Math.random().toString(36).slice(2, 12)); await r.set(v); return r; },
      onSnapshot(cb, err) { const l = { kind: 'col', path, cb }; listeners.add(l); setTimeout(() => cb(colSnap(path)), 0); return () => listeners.delete(l); }
    };
  }
  const db = { doc: docRef, collection: colRef };

  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename || 'fil';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return { ok: true };
    }
  };

  const user = { async id() { return 'lokal-anvandare'; }, async name() { return 'Lokal användare'; }, async profile() { return { id: 'lokal-anvandare', name: 'Lokal användare' }; } };

  const caps = { db, downloads, user };
  window.claude = {
    shim: true,
    // 'sample' (AI-anrop) finns inte lokalt: returnerar null så att apparna visar sina exempelsvar.
    use: async name => (name in caps ? caps[name] : null)
  };
  console.info('[shim] claude-runtime ersatt lokalt (localStorage).');
})();
