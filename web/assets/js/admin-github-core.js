/* Administrare fără server: citește și scrie conținutul direct în depozitul GitHub, prin API-ul Git Data.
   Fiecare salvare devine un „commit” în ramura publicată; GitHub Actions reconstruiește apoi pagina publică.
   Fișierul nu atinge pagina (DOM): rulează la fel în browser și în Node, ca să poată fi testat automat.
   Partea de interfață este în admin-github.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./admin-schemas.js'), require('./content-overlay.js'));
  else root.AdminGitHub = factory(root.AdminSchemas, root.ContentOverlay);
})(typeof self !== 'undefined' ? self : this, function (S, OV) {
  'use strict';

  const { COLLECTIONS, SINGLES, NAMES } = OV;
  const MARK = '[dgaefe-admin]';

  class GhError extends Error {
    constructor(status, message, extra) {
      super(message);
      this.name = 'GhError';
      this.status = status;
      if (extra) Object.assign(this, extra);
    }
  }

  /* ---------- unelte ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = v => JSON.parse(JSON.stringify(v));
  const contentPath = name => 'storage/content/' + name + '.json';
  const toJson = v => JSON.stringify(v, null, 2) + '\n'; // același format ca la salvarea pe server

  function hex(n) {
    const a = new Uint8Array(n);
    globalThis.crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function timeout(ms) {
    return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  }

  // Rulează `fn` pentru fiecare element, cel mult `limit` deodată.
  async function pool(items, limit, fn) {
    const queue = items.slice();
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift());
    });
    await Promise.all(workers);
  }

  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
  const extOf = name => {
    const m = /\.([^.\\/]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  };

  /* ---------- texte pentru mesajul „commit” și jurnal ---------- */
  const WHAT = {
    news: { create: 'Știre adăugată', update: 'Știre modificată', delete: 'Știre ștearsă' },
    documents: { create: 'Document adăugat', update: 'Document modificat', delete: 'Document șters' },
    events: { create: 'Eveniment adăugat', update: 'Eveniment modificat', delete: 'Eveniment șters' },
    legal: { create: 'Act normativ adăugat', update: 'Act normativ modificat', delete: 'Act normativ șters' },
    gallery: { create: 'Fotografie adăugată', update: 'Fotografie modificată', delete: 'Fotografie ștearsă' },
    investments: { create: 'Proiect investițional adăugat', update: 'Proiect investițional modificat', delete: 'Proiect investițional șters' },
    programs: { update: 'Program modificat' },
    settings: { update: 'Texte pagină modificate' }
  };
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const noteLine = n => {
    const base = (WHAT[n.c] && WHAT[n.c][n.a]) || n.a + ' ' + n.c;
    return n.d && n.c !== 'settings' ? base + ': ' + n.d : base;
  };

  function buildMessage(notes) {
    const first = notes.length === 1 ? cut(noteLine(notes[0]), 100) : `Modificări multiple (${notes.length})`;
    const lines = notes.length > 1 ? notes.slice(0, 30).map(n => '- ' + cut(noteLine(n), 140)) : [];
    if (notes.length > 30) lines.push(`- … și încă ${notes.length - 30}`);
    const trailer = notes.slice(0, 50).map(n => ({ a: n.a, c: n.c, d: n.d }));
    return [first, lines.join('\n'), MARK + ' ' + JSON.stringify(notes.length === 1 ? trailer[0] : trailer)].filter(Boolean).join('\n\n');
  }

  function parseAuditCommit(c) {
    const msg = (c.commit && c.commit.message) || '';
    const t = (c.commit && c.commit.author && c.commit.author.date) || '';
    const u = (c.author && c.author.login) || (c.commit && c.commit.author && c.commit.author.name) || '';
    const at = msg.lastIndexOf(MARK + ' ');
    if (at > -1) {
      try {
        const v = JSON.parse(msg.slice(at + MARK.length + 1).trim());
        const arr = Array.isArray(v) ? v : [v];
        return arr.filter(x => x && typeof x.a === 'string' && typeof x.c === 'string').map(x => ({ t, u, a: x.a, c: x.c, d: String(x.d || '') }));
      } catch (e) {
        /* mesaj modificat de mână: îl afișăm ca pe un commit obișnuit */
      }
    }
    return [{ t, u, a: 'commit', c: 'repo', d: cut(msg.split('\n')[0], 120) }];
  }

  /* ================= serviciul ================= */
  function createBackend(opts) {
    const o = Object.assign({ api: 'https://api.github.com', branch: 'main', linger: 250, ttl: 15000, fetch: null, maxImageMb: 15, maxDocMb: 25, conflictRetries: 6 }, opts);
    if (!o.owner || !o.repo) throw new Error('Lipsește depozitul GitHub (owner/repo).');
    const repoPath = `/repos/${o.owner}/${o.repo}`;
    const branchRef = o.branch.split('/').map(encodeURIComponent).join('/');
    const where = `${o.owner}/${o.repo}`;

    let token = null;
    let user = null; // { login, id, name }
    let cache = null; // ultima stare cunoscută a depozitului
    let inflight = null;
    const blobCache = new Map(); // sha -> JSON deja citit
    const staged = new Map(); // cale (/uploads/img/x.jpg) -> { bytes, type, name, size } încărcate dar încă nesalvate
    const listeners = {};
    const on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), () => (listeners[ev] = listeners[ev].filter(f => f !== fn)));
    const emit = (ev, data) => (listeners[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { /* un ascultător greșit nu oprește salvarea */ } });

    /* ---------- cereri către GitHub ---------- */
    async function gh(method, path, body, ropts) {
      ropts = ropts || {};
      const url = /^https?:/.test(path) ? path : o.api + path;
      // Doar antetele pe care GitHub le acceptă în cererile din browser (CORS): Accept, Authorization, Content-Type.
      // „X-GitHub-Api-Version” nu este în lista lor, deci nu se trimite; GitHub folosește atunci versiunea implicită (2022-11-28).
      const headers = { Accept: ropts.accept || 'application/vnd.github+json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      let payload;
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      const doFetch = o.fetch || globalThis.fetch.bind(globalThis);
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          res = await doFetch(url, { method, headers, body: payload, cache: 'no-store', signal: timeout(ropts.timeout || 60000) });
        } catch (e) {
          if (attempt < 2 && ropts.retry !== false) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          throw new GhError(0, 'Nu se poate contacta GitHub. Verificați conexiunea la internet și încercați din nou.');
        }
        if (res.ok) {
          if (ropts.as === 'text') return res.text();
          if (ropts.as === 'blob') return res.blob();
          if (res.status === 204) return null;
          return res.json();
        }
        let data = null;
        try {
          data = await res.json();
        } catch (e) {
          /* fără corp JSON */
        }
        const msg = data && data.message ? String(data.message) : '';

        // limitarea numărului de cereri: așteptăm puțin și reluăm
        if (res.status === 429 || res.status === 403) {
          const remaining = res.headers.get('x-ratelimit-remaining');
          const retryAfter = res.headers.get('retry-after');
          const reset = res.headers.get('x-ratelimit-reset');
          const limited = res.status === 429 || retryAfter || remaining === '0' || /rate limit|abuse|secondary/i.test(msg);
          if (limited) {
            let wait = 30000;
            if (retryAfter) wait = Math.max(1, Number(retryAfter) || 1) * 1000;
            else if (remaining === '0' && reset) wait = Math.max(1000, Number(reset) * 1000 - Date.now() + 1000);
            if (attempt < 3 && wait <= 90000) {
              emit('wait', { seconds: Math.ceil(wait / 1000) });
              await sleep(wait);
              continue;
            }
            throw new GhError(429, `GitHub a limitat temporar numărul de cereri. Încercați din nou peste ${Math.max(1, Math.ceil(wait / 60000))} min.`);
          }
        }
        if (res.status >= 500 && attempt < 2 && ropts.retry !== false) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw httpError(res, msg);
      }
    }

    function httpError(res, msg) {
      const extra = { github: msg };
      switch (res.status) {
        case 401:
          return new GhError(401, 'Jetonul GitHub nu este valabil (este greșit, a expirat sau a fost revocat). Introduceți un jeton nou.', extra);
        case 403:
          if (res.headers.get('x-github-sso')) return new GhError(403, 'Organizația cere autorizarea jetonului pentru conectarea unică (SSO). Autorizați jetonul în GitHub, la Settings › Developer settings › Personal access tokens.', extra);
          if (/protected branch|pull request|rule/i.test(msg)) return new GhError(403, `Ramura „${o.branch}” este protejată și nu permite modificări directe. Dezactivați protecția pentru administratori sau folosiți altă ramură.`, extra);
          if (/not accessible|permission|forbidden|must have/i.test(msg) || !msg) {
            return new GhError(403, 'Jetonul nu are voie să modifice depozitul. Creați un jeton nou și alegeți la permisiuni „Contents: Read and write”, iar la depozite alegeți ' + where + '.', extra);
          }
          return new GhError(403, 'GitHub a refuzat cererea: ' + msg, extra);
        case 404:
          return new GhError(404, `Nu am găsit pe GitHub depozitul ${where} (sau jetonul nu are acces la el). Verificați că ați ales depozitul corect când ați creat jetonul.`, extra);
        case 409:
          return new GhError(409, /empty/i.test(msg) ? 'Depozitul este gol: faceți mai întâi o primă încărcare a proiectului.' : 'GitHub a respins cererea: ' + msg, extra);
        case 413:
          return new GhError(413, 'Fișierul este prea mare pentru a fi trimis către GitHub.', extra);
        case 422:
          return new GhError(422, 'GitHub a respins modificarea: ' + msg, extra);
        default:
          return new GhError(res.status >= 500 ? 502 : res.status, res.status >= 500 ? `GitHub nu răspunde momentan (eroare ${res.status}). Încercați din nou peste câteva minute.` : `GitHub a răspuns cu eroarea ${res.status}${msg ? ': ' + msg : '.'}`, extra);
      }
    }

    /* ---------- autentificare ---------- */
    function setToken(t) {
      token = t || null;
      if (!token) user = null;
    }

    function userFrom(u) {
      return { login: u.login, id: u.id, name: u.name || u.login };
    }

    // Verifică doar că jetonul este valabil (la redeschiderea panoului).
    async function verify() {
      const u = await gh('GET', '/user');
      user = userFrom(u);
      return user;
    }

    // Verifică jetonul, accesul la depozit și dreptul de scriere, apoi îl păstrează pentru restul sesiunii.
    async function login(tok) {
      tok = String(tok || '').trim();
      if (!tok) throw new GhError(400, 'Introduceți jetonul GitHub.');
      if (/\s/.test(tok)) throw new GhError(400, 'Jetonul nu trebuie să conțină spații. Copiați-l din nou, în întregime.');
      const prev = token;
      token = tok;
      try {
        const u = await gh('GET', '/user');
        const repo = await gh('GET', repoPath);
        if (repo.archived) throw new GhError(403, `Depozitul ${where} este arhivat și nu mai poate fi modificat.`);
        if (repo.permissions && repo.permissions.push === false) throw new GhError(403, `Contul ${u.login} nu are drept de scriere în depozitul ${where}.`);
        try {
          await gh('GET', `${repoPath}/git/ref/heads/${branchRef}`);
        } catch (e) {
          if (e.status === 404) throw new GhError(404, `Ramura „${o.branch}” nu există în depozitul ${where}.`);
          throw e;
        }
        // Dreptul de scriere se verifică în practică: un obiect nefolosit (blob) se creează doar cu permisiunea „Contents: write”.
        await gh('POST', `${repoPath}/git/blobs`, { content: 'dgaefe-admin', encoding: 'utf-8' });
        const next = userFrom(u);
        if (user && user.login !== next.login) reset();
        user = next;
        return user;
      } catch (e) {
        token = prev;
        throw e;
      }
    }

    function reset() {
      cache = null;
      inflight = null;
      staged.clear();
      queue.splice(0).forEach(op => op.reject(new GhError(401, 'Sesiunea s-a încheiat înainte ca modificarea să fie salvată.')));
    }

    function logout() {
      token = null;
      user = null;
      reset();
    }

    /* ---------- starea depozitului ---------- */
    async function getHead() {
      const r = await gh('GET', `${repoPath}/git/ref/heads/${branchRef}`);
      return r.object.sha;
    }

    async function loadTree(treeSha) {
      const t = await gh('GET', `${repoPath}/git/trees/${treeSha}?recursive=1`);
      if (t.truncated) throw new GhError(507, 'Depozitul are prea multe fișiere ca să fie citit dintr-o singură cerere.');
      const m = new Map();
      for (const e of t.tree) if (e.type === 'blob') m.set(e.path, { sha: e.sha, size: e.size || 0, mode: e.mode });
      return m;
    }

    async function readJson(entry, path) {
      if (!blobCache.has(entry.sha)) {
        const text = await gh('GET', `${repoPath}/git/blobs/${entry.sha}`, undefined, { accept: 'application/vnd.github.raw+json', as: 'text' });
        try {
          blobCache.set(entry.sha, JSON.parse(text));
        } catch (e) {
          throw new GhError(422, `Fișierul ${path} din depozit nu este valid (${e.message}). Corectați-l în GitHub sau ștergeți-l ca să revină conținutul de pornire.`);
        }
      }
      return clone(blobCache.get(entry.sha));
    }

    // Conținutul salvat în storage/, completat din conținutul de pornire (seed/) acolo unde acesta a adus ceva nou:
    // aceleași reguli ca pe server și la construirea paginii (vezi content-overlay.js).
    async function loadContent(entries) {
      const upFile = entries.get('seed/upgrades.json');
      const upgrades = upFile ? await readJson(upFile, 'seed/upgrades.json') : [];
      if (!Array.isArray(upgrades)) throw new GhError(422, 'Fișierul seed/upgrades.json din depozit are o structură neașteptată.');
      // Din seed se citesc doar fișierele de care e nevoie: textele paginii, colecțiile care lipsesc din storage și cele care primesc înregistrări noi.
      const needSeed = new Set(['settings']);
      for (const u of upgrades) for (const n of Object.keys((u && u.add) || {})) needSeed.add(n);
      for (const n of NAMES) if (!entries.has(contentPath(n))) needSeed.add(n);
      const stored = {};
      const seed = {};
      const check = (name, v, path) => {
        const ok = SINGLES.includes(name) ? v && typeof v === 'object' && !Array.isArray(v) : Array.isArray(v);
        if (!ok) throw new GhError(422, `Fișierul ${path} din depozit are o structură neașteptată.`);
      };
      await Promise.all(
        NAMES.map(async name => {
          const sp = contentPath(name);
          const dp = 'seed/content/' + name + '.json';
          if (entries.has(sp)) {
            stored[name] = await readJson(entries.get(sp), sp);
            check(name, stored[name], sp);
          }
          if (needSeed.has(name) && entries.has(dp)) {
            seed[name] = await readJson(entries.get(dp), dp);
            check(name, seed[name], dp);
          }
        })
      );
      return OV.apply(stored, seed, upgrades);
    }

    async function load() {
      const head = await getHead();
      if (cache && cache.head === head) {
        cache.checkedAt = Date.now();
        return cache;
      }
      const commit = await gh('GET', `${repoPath}/git/commits/${head}`);
      const entries = await loadTree(commit.tree.sha);
      const { content, changed } = await loadContent(entries);
      // `pending`: fișierele din storage/ care diferă de ce se vede (conținut nou din seed/), scrise la următoarea salvare.
      cache = { head, treeSha: commit.tree.sha, entries, content, checkedAt: Date.now(), bootstrapped: entries.has(contentPath('settings')), pending: changed };
      return cache;
    }

    // `fresh`: verifică în depozit dacă a apărut ceva nou; altfel se folosește starea de acum cel mult `ttl` milisecunde.
    function snapshot(sopts) {
      if (!(sopts && sopts.fresh) && cache && Date.now() - cache.checkedAt < o.ttl) return Promise.resolve(cache);
      if (!inflight) {
        inflight = load().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    }

    async function withEntries(snap) {
      if (!snap.entries) snap.entries = await loadTree(snap.treeSha);
      return snap;
    }

    /* ---------- schimbări în așteptare ---------- */
    const allReferenced = content => {
      const used = new Set();
      for (const n of NAMES) for (const f of S.filesIn(content[n])) used.add(f);
      return used;
    };

    function makeDraft(snap) {
      const d = { content: clone(snap.content), touched: new Set(), notes: [], candidates: new Set() };
      d.exists = p => staged.has(p) || snap.entries.has('storage' + p) || snap.entries.has('seed' + p);
      d.schemas = S.create({ bad: m => new GhError(400, m), fileExists: d.exists, programs: () => d.content.programs });
      d.find = (name, id) => d.content[name].find(x => x.id === id);
      d.create = (name, item) => {
        const now = new Date().toISOString();
        const rec = { id: hex(6), ...item, createdAt: now, updatedAt: now };
        d.content[name].unshift(rec);
        d.touched.add(name);
        return rec;
      };
      d.update = (name, id, patch) => {
        const list = d.content[name];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return null;
        const old = list[i];
        const rec = { ...old, ...patch, id: old.id, createdAt: old.createdAt, updatedAt: new Date().toISOString() };
        list[i] = rec;
        d.touched.add(name);
        return rec;
      };
      d.remove = (name, id) => {
        const list = d.content[name];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return false;
        list.splice(i, 1);
        d.touched.add(name);
        return true;
      };
      d.setSettings = obj => {
        // „seedRev” nu vine de la formular: arată de la ce versiune a conținutului de pornire provin textele salvate.
        const prev = d.content.settings || {};
        d.content.settings = { ...obj, ...(prev.seedRev !== undefined ? { seedRev: prev.seedRev } : {}), updatedAt: new Date().toISOString() };
        d.touched.add('settings');
        return d.content.settings;
      };
      d.prune = files => files.forEach(f => d.candidates.add(f));
      d.note = (a, c, detail) => d.notes.push({ a, c, d: cut(String(detail || ''), 100) });
      d.checkpoint = () => ({ content: JSON.stringify(d.content), touched: [...d.touched], notes: d.notes.length, candidates: [...d.candidates] });
      d.restore = cp => {
        d.content = JSON.parse(cp.content);
        d.touched = new Set(cp.touched);
        d.notes.length = cp.notes;
        d.candidates = new Set(cp.candidates);
      };
      return d;
    }

    // Aceleași reguli ca ale serverului (lib/api.js), aplicate pe starea din depozit.
    function applyOp(d, method, path, body) {
      let m = /^\/api\/admin\/(news|documents|events|legal|gallery|investments)(?:\/([\w-]+))?$/.exec(path);
      if (m) {
        const col = m[1];
        const id = m[2];
        const sc = d.schemas[col];
        if (method === 'POST' && !id) {
          const rec = d.create(col, sc.clean(body || {}, null));
          d.note('create', col, sc.label(rec));
          return rec;
        }
        if (method === 'PUT' && id) {
          const ex = d.find(col, id);
          if (!ex) throw new GhError(404, 'Elementul nu a fost găsit.');
          const before = S.filesIn(ex);
          const rec = d.update(col, ex.id, sc.clean(body || {}, ex));
          d.prune([...before]);
          d.note('update', col, sc.label(rec));
          return rec;
        }
        if (method === 'DELETE' && id) {
          const ex = d.find(col, id);
          if (!ex) throw new GhError(404, 'Elementul nu a fost găsit.');
          d.remove(col, ex.id);
          d.prune([...S.filesIn(ex)]);
          d.note('delete', col, sc.label(ex));
          return { ok: true };
        }
      }
      m = /^\/api\/admin\/programs\/([\w-]+)$/.exec(path);
      if (m && method === 'PUT') {
        const ex = d.find('programs', m[1]);
        if (!ex) throw new GhError(404, 'Programul nu a fost găsit.');
        const rec = d.update('programs', ex.id, d.schemas.programs.clean(body || {}, ex));
        d.note('update', 'programs', rec.name);
        return rec;
      }
      if (path === '/api/admin/settings' && method === 'PUT') {
        const saved = d.setSettings(d.schemas.cleanSettings(body));
        d.note('update', 'settings', 'Texte pagină');
        return saved;
      }
      throw new GhError(404, 'Resursa nu există.');
    }

    /* ---------- salvarea în depozit ---------- */
    const queue = [];
    let busy = false;

    function mutate(run) {
      return new Promise((resolve, reject) => {
        queue.push({ run, resolve, reject, failed: false });
        pump();
      });
    }

    async function pump() {
      if (busy) return;
      busy = true;
      try {
        await sleep(o.linger); // cererile care sosesc deodată se salvează într-un singur commit
        while (queue.length) {
          const batch = queue.splice(0);
          try {
            await commitBatch(batch);
          } catch (e) {
            batch.forEach(op => op.reject(e));
          }
        }
      } finally {
        busy = false;
      }
    }

    function fail(op, e) {
      op.failed = true;
      op.reject(e instanceof GhError ? e : new GhError((e && e.status) || 500, (e && e.message) || 'Eroare neașteptată.'));
    }

    async function commitBatch(batch) {
      for (let attempt = 0; attempt < o.conflictRetries; attempt++) {
        if (attempt) await sleep(200 * attempt + Math.random() * 300);
        let snap;
        try {
          snap = await withEntries(await snapshot({ fresh: true }));
        } catch (e) {
          batch.forEach(op => fail(op, e));
          return;
        }
        const d = makeDraft(snap);
        const done = [];
        for (const op of batch) {
          if (op.failed) continue;
          const cp = d.checkpoint();
          try {
            done.push({ op, result: op.run(d) });
          } catch (e) {
            d.restore(cp);
            fail(op, e);
          }
        }
        if (!done.length) return;
        emit('saving', true);
        try {
          const sha = await writeCommit(snap, d);
          emit('committed', { sha, notes: d.notes.length });
          done.forEach(x => x.op.resolve(x.result));
          return;
        } catch (e) {
          if (e && e.conflict) {
            cache = null;
            continue;
          }
          done.forEach(x => fail(x.op, e));
          return;
        } finally {
          emit('saving', false);
        }
      }
      const err = new GhError(409, 'Depozitul a fost modificat în același timp de altcineva și salvarea nu a reușit după mai multe încercări. Reîncercați peste câteva secunde.');
      batch.forEach(op => !op.failed && op.reject(err));
    }

    function authorInfo() {
      if (!user || !user.id) return undefined;
      return { name: user.name, email: `${user.id}+${user.login}@users.noreply.github.com`, date: new Date().toISOString() };
    }

    async function moveRef(sha) {
      try {
        await gh('PATCH', `${repoPath}/git/refs/heads/${branchRef}`, { sha, force: false }, { retry: false });
      } catch (e) {
        if (e.status === 422 && /fast.?forward/i.test(e.github || e.message)) throw Object.assign(new GhError(409, 'conflict'), { conflict: true });
        if (e.status === 0) {
          // Răspunsul s-a pierdut: poate că ramura a fost totuși mutată.
          const head = await getHead().catch(() => null);
          if (head === sha) return;
        }
        throw e;
      }
    }

    async function writeCommit(snap, d) {
      const used = allReferenced(d.content);
      const plan = new Map(); // calea în depozit -> intrare pentru arborele nou
      const entry = (path, extra) => plan.set(path, Object.assign({ path, mode: '100644', type: 'blob' }, extra));

      // 1. fișierele cu conținut; la prima salvare se creează toate, plecând de la conținutul de pornire,
      //    iar mai târziu se adaugă și ce a adus din nou conținutul de pornire (ca să nu depindă de el la următoarea actualizare)
      const names = snap.bootstrapped ? [...new Set([...d.touched, ...(snap.pending || [])])] : NAMES;
      for (const name of names) entry(contentPath(name), { content: toJson(d.content[name]) });

      // 2. fișierele încărcate la care se referă conținutul: cele noi se trimit, cele de pornire se copiază
      const toSend = [];
      for (const p of used) {
        const sp = 'storage' + p;
        if (snap.entries.has(sp)) continue;
        if (staged.has(p)) toSend.push(p);
        else if (snap.entries.has('seed' + p)) entry(sp, { sha: snap.entries.get('seed' + p).sha });
      }
      const sent = [];
      await pool(toSend, 3, async p => {
        const f = staged.get(p);
        const r = await gh('POST', `${repoPath}/git/blobs`, { content: toBase64(f.bytes), encoding: 'base64' }, { timeout: 180000 });
        entry('storage' + p, { sha: r.sha });
        sent.push(p);
      });

      // 3. fișierele care nu mai sunt folosite nicăieri se șterg
      for (const p of d.candidates) {
        const sp = 'storage' + p;
        if (!used.has(p) && snap.entries.has(sp) && !plan.has(sp)) entry(sp, { sha: null });
      }

      if (!plan.size) return snap.head;
      const tree = await gh('POST', `${repoPath}/git/trees`, { base_tree: snap.treeSha, tree: [...plan.values()] });
      const commit = await gh('POST', `${repoPath}/git/commits`, { message: buildMessage(d.notes), tree: tree.sha, parents: [snap.head], author: authorInfo() });
      await moveRef(commit.sha);

      sent.forEach(p => staged.delete(p));
      cache = { head: commit.sha, treeSha: tree.sha, entries: null, content: d.content, checkedAt: Date.now(), bootstrapped: true, pending: new Set() };
      return commit.sha;
    }

    /* ---------- cereri în stilul serverului (/api/...) ---------- */
    async function request(method, url, body) {
      const path = String(url).split('?')[0];
      if (method === 'GET') {
        const m = /^\/api\/admin\/(news|documents|events|legal|gallery|investments|programs)$/.exec(path);
        if (m) return clone((await snapshot()).content[m[1]]);
        if (path === '/api/admin/settings') return clone((await snapshot()).content.settings);
        if (path === '/api/admin/audit') return audit();
        throw new GhError(404, 'Resursa nu există.');
      }
      if (path === '/api/admin/batch' && method === 'POST') {
        const ops = body && Array.isArray(body.ops) ? body.ops : null;
        if (!ops || !ops.length) throw new GhError(400, 'Nu există nicio operațiune de executat.');
        if (ops.length > 500) throw new GhError(400, 'Prea multe operațiuni deodată (maximum 500).');
        return mutate(d => ops.map(x => applyOp(d, String(x.method || '').toUpperCase(), String(x.url || ''), x.body)));
      }
      if (path === '/api/admin/password') throw new GhError(404, 'Parola nu se schimbă aici: autentificarea se face prin jetonul GitHub.');
      return mutate(d => applyOp(d, method, path, body));
    }

    /* ---------- fișiere încărcate ---------- */
    function stage(kind, file) {
      const ext = extOf(file.name);
      const allowed = kind === 'image' ? S.IMG_EXT : S.DOC_EXT;
      if (!allowed.includes(ext)) throw new GhError(400, `Format neacceptat (.${ext || '?'}). Formate permise: ${allowed.join(', ')}.`);
      const max = kind === 'image' ? o.maxImageMb : o.maxDocMb;
      const bytes = file.bytes;
      if (!bytes || !bytes.length) throw new GhError(400, 'Nu a fost trimis niciun fișier.');
      if (bytes.length > max * 1048576) throw new GhError(413, `Fișierul depășește dimensiunea maximă permisă (${max} MB).`);
      if (!S.sniff(ext, bytes)) throw new GhError(400, 'Conținutul fișierului nu corespunde formatului indicat de extensie.');
      const sub = kind === 'image' ? 'img' : 'docs';
      const name = `${Date.now().toString(36)}${hex(3)}-${S.slug(file.name)}.${ext === 'jpeg' ? 'jpg' : ext}`;
      const path = `/uploads/${sub}/${name}`;
      staged.set(path, { bytes, type: file.type || MIME[ext] || 'application/octet-stream', name: file.name, size: bytes.length });
      return { path, name: file.name, size: bytes.length };
    }

    // Un fișier deja salvat în depozit, dar neajuns încă pe pagina publică (se publică în 1–2 minute).
    async function readUpload(path) {
      if (staged.has(path)) return staged.get(path);
      const snap = await withEntries(await snapshot());
      const e = snap.entries.get('storage' + path) || snap.entries.get('seed' + path);
      if (!e) return null;
      return gh('GET', `${repoPath}/git/blobs/${e.sha}`, undefined, { accept: 'application/vnd.github.raw+json', as: 'blob' });
    }

    /* ---------- jurnal și publicare ---------- */
    async function audit() {
      const list = await gh('GET', `${repoPath}/commits?sha=${encodeURIComponent(o.branch)}&path=storage&per_page=60`);
      const out = [];
      for (const c of list) out.push(...parseAuditCommit(c));
      return out.slice(0, 100);
    }

    // Spune dacă versiunea publicată (`deployed`) include modificarea `mine`.
    async function contains(deployed, mine) {
      if (!deployed || !mine) return false;
      if (deployed === mine) return true;
      try {
        const r = await gh('GET', `${repoPath}/compare/${mine}...${deployed}`);
        return r.status === 'ahead' || r.status === 'identical';
      } catch (e) {
        return false;
      }
    }

    // Republicare fără modificări de conținut: un commit gol pornește din nou construirea paginii.
    async function republish() {
      for (let attempt = 0; attempt < o.conflictRetries; attempt++) {
        const snap = await snapshot({ fresh: true });
        const commit = await gh('POST', `${repoPath}/git/commits`, {
          message: `Republicare pagină\n\n${MARK} ${JSON.stringify({ a: 'republish', c: 'system', d: '' })}`,
          tree: snap.treeSha,
          parents: [snap.head],
          author: authorInfo()
        });
        try {
          await moveRef(commit.sha);
        } catch (e) {
          if (e.conflict) {
            cache = null;
            await sleep(300 * (attempt + 1));
            continue;
          }
          throw e;
        }
        cache = { ...snap, head: commit.sha, checkedAt: Date.now() };
        emit('committed', { sha: commit.sha, notes: 0 });
        return commit.sha;
      }
      throw new GhError(409, 'Depozitul se modifică în continuu; reîncercați peste câteva secunde.');
    }

    return {
      on,
      gh,
      setToken,
      login,
      verify,
      logout,
      request,
      stage,
      readUpload,
      audit,
      contains,
      republish,
      refresh: () => snapshot({ fresh: true }),
      head: () => cache && cache.head,
      pending: () => busy || queue.length > 0,
      user: () => user,
      hasToken: () => !!token,
      staged,
      repo: { owner: o.owner, repo: o.repo, branch: o.branch },
      limits: { imageMb: o.maxImageMb, docMb: o.maxDocMb }
    };
  }

  return { createBackend, GhError, buildMessage, parseAuditCommit, MARK };
});
