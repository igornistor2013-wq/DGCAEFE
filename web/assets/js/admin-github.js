/* Panou de administrare — varianta fără server, pentru GitHub Pages.
   Se activează doar când pagina de administrare conține <meta name="dgaefe-github">, adăugat la construirea versiunii statice.
   Conectarea se face cu un jeton de acces GitHub; tot ce se salvează devine un „commit” în depozit (admin-github-core.js),
   iar GitHub Actions reconstruiește pagina publică în 1–2 minute. Pe server, fișierul nu face nimic. */
(function () {
  'use strict';

  const meta = document.querySelector('meta[name="dgaefe-github"]');
  if (!meta || !window.AdminGitHub || !window.ADM) return;

  // GitHub Pages nu poate trimite antetul X-Frame-Options, așa că pagina se ascunde singură dacă este încadrată în altă pagină
  // (protecție împotriva păcălirii prin clic, „clickjacking”). Fără jeton citit și fără conectare la GitHub.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    return;
  }

  const DG = window.DG;
  const ADM = window.ADM;
  const esc = DG.esc;
  const ico = DG.icon;
  const $ = ADM.$;

  const full = meta.content;
  const parts = full.split('/');
  const owner = parts[0];
  const repo = parts[1];
  const branch = meta.dataset.branch || 'main';
  const apiBase = meta.dataset.api || 'https://api.github.com';
  const siteBase = new URL('../', location.href).href; // rădăcina paginii publice
  const ghHome = 'https://github.com/' + owner + '/' + repo;
  const backend = window.AdminGitHub.createBackend({ api: apiBase, owner, repo, branch });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- jetonul, păstrat doar în acest browser ---------- */
  const KEY = 'dgaefe.gh:' + full;
  const STORES = ['sessionStorage', 'localStorage'];

  function readStored() {
    for (const st of STORES) {
      try {
        const raw = window[st].getItem(KEY);
        const v = raw && JSON.parse(raw);
        if (v && v.token) return { token: v.token, login: v.login || '', remember: st === 'localStorage' };
      } catch (e) {
        /* stocarea poate fi blocată de browser */
      }
    }
    return null;
  }
  function clearStored() {
    for (const st of STORES) {
      try {
        window[st].removeItem(KEY);
      } catch (e) {
        /* nimic de șters */
      }
    }
  }
  function writeStored(token, login, remember) {
    clearStored();
    try {
      window[remember ? 'localStorage' : 'sessionStorage'].setItem(KEY, JSON.stringify({ token, login }));
    } catch (e) {
      /* fără stocare, jetonul rămâne doar în memorie până la reîncărcarea paginii */
    }
  }

  /* ---------- fișiere încărcate: previzualizări ---------- */
  const previews = new Map(); // cale -> adresă blob:
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
  function remember(path, blob) {
    const url = URL.createObjectURL(blob);
    previews.set(path, url);
    return url;
  }
  function dropPreviews() {
    previews.forEach(u => URL.revokeObjectURL(u));
    previews.clear();
  }

  ADM.fileUrl = function (p) {
    if (!p || p.charAt(0) !== '/') return p || '';
    return previews.get(p) || siteBase + p.slice(1);
  };
  ADM.pubUrl = p => (p && p.charAt(0) === '/' ? siteBase + p.slice(1) : p);

  // Fișierul salvat în depozit se vede pe pagina publică abia după publicare (1–2 minute): până atunci îl aducem direct de la GitHub.
  document.addEventListener(
    'error',
    ev => {
      const img = ev.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.ghFallback) return;
      const m = /\/(uploads\/img\/[\w.-]+)(?:[?#]|$)/.exec(img.src || '');
      if (!m) return;
      img.dataset.ghFallback = '1';
      const path = '/' + m[1];
      backend
        .readUpload(path)
        .then(file => {
          if (!file) return;
          const ext = (/\.([^.]+)$/.exec(path) || [])[1] || '';
          const type = file.type && file.type !== 'application/octet-stream' ? file.type : MIME[ext.toLowerCase()] || 'application/octet-stream';
          const blob = file.bytes ? new Blob([file.bytes], { type }) : new Blob([file], { type });
          img.src = previews.get(path) || remember(path, blob);
        })
        .catch(() => {});
    },
    true
  );

  /* ---------- sesiune ---------- */
  const sessionInfo = u => ({ authenticated: true, user: u.login, csrf: '', limits: backend.limits, minPassword: 10 });
  let verifiedAt = 0;

  async function session() {
    const st = readStored();
    if (!st) return { authenticated: false };
    if (!backend.hasToken()) backend.setToken(st.token);
    if (!backend.user() || Date.now() - verifiedAt > 60000) {
      try {
        await backend.verify();
        verifiedAt = Date.now();
      } catch (e) {
        if (e.status === 401) {
          clearStored();
          backend.logout();
          return { authenticated: false, message: 'Jetonul GitHub salvat în acest browser nu mai este valabil. Introduceți un jeton nou.' };
        }
        throw e;
      }
    }
    return sessionInfo(backend.user());
  }

  async function login(body) {
    const token = String((body && body.password) || '').trim();
    const u = await backend.login(token);
    verifiedAt = Date.now();
    const shown = $('#tbUser');
    if (shown && !$('#app').hidden) shown.textContent = u.login; // jeton schimbat în timpul lucrului, eventual cu alt cont
    const onLoginScreen = !$('#loginView').hidden;
    const prev = readStored();
    const keep = onLoginScreen ? !!($('#lKeep') && $('#lKeep').checked) : !!(prev && prev.remember);
    writeStored(token, u.login, keep);
    return sessionInfo(u);
  }

  function logout() {
    clearStored();
    backend.logout();
    dropPreviews();
    verifiedAt = 0;
    setChip(null);
    return { ok: true };
  }

  ADM.local = {
    async request(method, url, body) {
      if (url === '/api/session') return session();
      if (url === '/api/login') return login(body);
      if (url === '/api/logout') return logout();
      return backend.request(method, url, body);
    },
    async upload(kind, file, onProgress) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = backend.stage(kind, { name: file.name, type: file.type, bytes });
      const ext = (/\.([^.]+)$/.exec(file.name) || [])[1];
      remember(info.path, new Blob([bytes], { type: file.type || MIME[(ext || '').toLowerCase()] || 'application/octet-stream' }));
      if (onProgress) onProgress(1);
      return info;
    },
    batch: ops => backend.request('POST', '/api/admin/batch', { ops })
  };

  ADM.noUsername = true;
  ADM.canBatch = true;
  ADM.uploadSlots = 3;
  ADM.where = 'din depozitul GitHub';
  ADM.limits = backend.limits;

  /* ---------- indicatorul din bara de sus: se salvează / se publică ---------- */
  document.body.classList.add('gh');
  const chip = document.createElement('span');
  chip.id = 'tbPub';
  chip.className = 'tb-pub';
  chip.setAttribute('role', 'status');
  chip.hidden = true;
  const right = $('.tb-right');
  if (right) right.insertBefore(chip, right.firstChild);
  let chipTag = null;
  let chipTimer = 0;

  // Textul din indicator este scurt (încape și pe telefon); explicația completă este în „title” și pentru cititoarele de ecran.
  function setChip(kind, text, detail, hideAfter, tag) {
    clearTimeout(chipTimer);
    chipTag = kind ? tag || kind : null;
    chip.hidden = !kind;
    chip.className = 'tb-pub' + (kind ? ' is-' + kind : '');
    chip.textContent = kind ? text : '';
    chip.title = (kind && detail) || '';
    if (kind && detail) {
      const more = document.createElement('span');
      more.className = 'sr';
      more.textContent = '. ' + detail;
      chip.appendChild(more);
    }
    if (kind && hideAfter) {
      const mine = chipTag;
      chipTimer = setTimeout(() => chipTag === mine && setChip(null), hideAfter);
    }
  }

  let watchId = 0;
  let liveState = { deployed: null, checkedAt: 0, supported: true };
  const memo = new Map();

  async function liveCommit() {
    try {
      const r = await fetch(siteBase + 'version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.status === 404) {
        liveState = { deployed: null, checkedAt: Date.now(), supported: false };
      } else if (r.ok) {
        const j = await r.json();
        liveState = { deployed: j.commit || null, builtAt: j.builtAt, checkedAt: Date.now(), supported: !!j.commit };
      }
    } catch (e) {
      /* fără rețea sau fără fișier: nu schimbăm starea */
    }
    return liveState;
  }

  async function isLive(sha) {
    const live = await liveCommit();
    if (!live.deployed) return false;
    const k = live.deployed + '|' + sha;
    if (!memo.has(k) || memo.get(k) === false) memo.set(k, await backend.contains(live.deployed, sha));
    return memo.get(k);
  }
  ADM.isLive = isLive;

  async function watchPublish(sha) {
    const my = ++watchId;
    const t0 = Date.now();
    setChip('busy', 'Se publică…', 'Modificarea este salvată în GitHub. Pagina publică se reconstruiește singură, în 1–2 minute.', 0, 'publish');
    for (let i = 0; i < 70; i++) {
      await sleep(i === 0 ? 7000 : 6000);
      if (my !== watchId || !backend.hasToken()) return;
      if (await isLive(sha)) {
        setChip('ok', 'Publicat', 'Pagina publică este actualizată: modificările sunt vizibile vizitatorilor.', 12000, 'publish');
        return;
      }
      if (!liveState.supported && Date.now() - t0 > 100000) {
        setChip('soft', 'Se publică…', 'Modificările apar pe pagina publică în câteva minute. Această versiune a paginii nu poate raporta când s-a terminat publicarea.', 20000, 'publish');
        return;
      }
    }
    setChip('warn', 'Publicarea întârzie', 'Publicarea durează mai mult decât de obicei. Verificați în GitHub, la fila „Actions”, dacă construirea paginii a reușit.', 0, 'publish');
  }

  backend.on('saving', on => {
    if (on) setChip('busy', 'Se salvează…', 'Modificarea se trimite în depozitul GitHub.', 0, 'saving');
    else if (chipTag === 'saving' || chipTag === 'wait') setChip(null);
  });
  backend.on('committed', e => {
    if (e.sha) watchPublish(e.sha);
  });
  backend.on('wait', w => setChip('warn', 'Pauză GitHub (' + w.seconds + ' s)', 'GitHub a limitat temporar numărul de cereri; salvarea continuă singură.', 0, 'wait'));

  window.addEventListener('beforeunload', e => {
    if (backend.pending()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- ecranul de conectare ---------- */
  const keepWrap = $('#lKeepWrap');
  const help = $('#lGh');
  const user = $('#lUser');
  if (user) {
    const f = user.closest('.fld');
    if (f) f.hidden = true;
    user.required = false;
    user.removeAttribute('autocomplete');
  }
  const passLabel = $('label[for="lPass"]');
  if (passLabel) passLabel.textContent = 'Jeton de acces GitHub';
  const pass = $('#lPass');
  if (pass) {
    pass.setAttribute('autocomplete', 'off');
    pass.setAttribute('spellcheck', 'false');
    pass.setAttribute('placeholder', 'github_pat_…');
  }
  if (keepWrap) keepWrap.hidden = false;
  if (help) {
    help.hidden = false;
    const link = $('#lTokenLink');
    if (link) {
      link.href =
        'https://github.com/settings/personal-access-tokens/new?' +
        new URLSearchParams({ name: ('Administrare ' + repo).slice(0, 40), description: 'Administrarea paginii publice ' + full + ': modifică conținutul din depozit.', target_name: owner, expires_in: '365', contents: 'write' }).toString();
    }
    const classic = $('#lClassicLink');
    if (classic) classic.href = 'https://github.com/settings/tokens/new?scopes=public_repo&description=' + encodeURIComponent('Administrare ' + repo);
    ADM.$$('[data-gh-repo]', help).forEach(el => (el.textContent = full));
  }
  const note = $('.login-note');
  if (note) note.textContent = 'Modificările se salvează în depozitul GitHub ' + full + ' și apar pe pagina publică în 1–2 minute. Activitatea este înregistrată în istoricul GitHub.';

  // fereastra de reconectare (când jetonul expiră în timpul lucrului)
  const raTitle = $('#raTitle');
  if (raTitle) raTitle.textContent = 'Reconectați-vă la GitHub';
  const raMsg = $('#raMsg');
  if (raMsg) raMsg.textContent = 'Jetonul GitHub nu mai este valabil (a expirat sau a fost revocat). Introduceți un jeton nou ca să continuați — ce ați completat nu se pierde.';
  const raUser = $('#raUser');
  if (raUser && raUser.closest('.fld')) raUser.closest('.fld').hidden = true;
  const raLabel = $('label[for="raPass"]');
  if (raLabel) raLabel.textContent = 'Jeton GitHub nou';
  const raPass = $('#raPass');
  if (raPass) raPass.setAttribute('autocomplete', 'off');

  // meniu
  const accNav = $('.side a[data-page="account"]');
  if (accNav && accNav.lastChild) accNav.lastChild.textContent = 'Cont GitHub';

  /* ---------- panoul de control: cum se publică ---------- */
  ADM.gh = {
    owner,
    repo,
    branch,
    backend,
    siteBase,
    publishPanel() {
      return (
        '<section class="panel"><div class="panel-h"><h2>Cum se publică modificările</h2></div><div class="panel-b">' +
        '<p>Nu este nevoie de server sau de pași în plus. Panoul salvează direct în depozitul <a href="' + esc(ghHome) + '" target="_blank" rel="noopener">' + esc(full) + '</a>.</p>' +
        '<ol class="steps-ol"><li><p>Faceți modificările și apăsați <strong>Salvează</strong>.</p></li>' +
        '<li><p>Modificarea ajunge în GitHub ca o versiune nouă a conținutului.</p></li>' +
        '<li><p>În <strong>1–2 minute</strong> pagina publică se actualizează singură. Starea se vede sus, lângă numele dumneavoastră.</p></li></ol>' +
        '<p style="margin-top:1rem"><a class="btn btn-line btn-sm" href="#/export">Deschide „Publicare și copii”</a></p></div></section>'
      );
    }
  };

  /* ---------- pagini specifice: publicare și cont ---------- */
  const pages = (ADM.pages = ADM.pages || {});
  const short = sha => (sha ? sha.slice(0, 7) : '—');

  pages.export = {
    title: 'Publicare și copii',
    render(root) {
      root.innerHTML =
        '<div class="page-head"><div><h1>Publicare și copii</h1><p class="sub">Cum ajung modificările pe pagina publică și cum păstrați copii de siguranță.</p></div></div>' +
        '<div class="alert alert-info">' + ico('info') + '<div><strong>Modificările se salvează direct în GitHub.</strong> Tot conținutul este în depozitul <a href="' + esc(ghHome) + '" target="_blank" rel="noopener">' + esc(full) + '</a> (ramura <span class="code">' + esc(branch) + '</span>). După fiecare salvare, GitHub reconstruiește pagina publică în 1–2 minute.</div></div>' +
        '<div class="two"><section class="panel"><div class="panel-h"><h2>Starea publicării</h2></div><div class="panel-b">' +
        '<p id="pubState" role="status" aria-live="polite">Se verifică…</p>' +
        '<p class="hint" id="pubDetail"></p>' +
        '<p style="display:flex;gap:.6rem;flex-wrap:wrap"><button type="button" class="btn btn-line" id="pubCheck">Verifică acum</button><button type="button" class="btn btn-line" id="pubRe">Republică pagina</button></p>' +
        '<p class="hint">„Republică pagina” pornește din nou construirea paginii, fără să schimbe conținutul. Folosiți-o dacă pagina publică nu s-a actualizat.</p>' +
        '<p><a class="btn btn-primary btn-sm" href="' + esc(siteBase) + '" target="_blank" rel="noopener">' + ico('ext') + 'Deschide pagina publică</a></p></div></section>' +
        '<section class="panel"><div class="panel-h"><h2>Copii și istoric</h2></div><div class="panel-b">' +
        '<p>GitHub păstrează toate versiunile conținutului: nimic nu se pierde de tot. Puteți descărca oricând o copie a întregului depozit sau puteți vedea cine și când a modificat ceva.</p>' +
        '<p><a class="btn btn-primary" href="' + esc(ghHome + '/archive/refs/heads/' + branch + '.zip') + '">' + ico('down') + 'Descarcă o copie (ZIP)</a></p>' +
        '<p><a class="btn btn-line" href="' + esc(ghHome + '/commits/' + branch + '/storage') + '" target="_blank" rel="noopener">' + ico('history') + 'Istoricul modificărilor în GitHub</a></p>' +
        '<h3 style="font-size:1.05rem;margin:1.25rem 0 .6rem">Dacă ați greșit</h3>' +
        '<p>Versiunile vechi nu dispar. Cu GitHub Desktop, în fila „History”, apăsați clic dreapta pe modificarea greșită și alegeți „Revert Changes in Commit”.</p>' +
        '<p class="hint">Faceți o copie periodic, mai ales înainte de modificări mari.</p></div></section></div>';

      const state = $('#pubState', root);
      const detail = $('#pubDetail', root);
      async function check() {
        state.textContent = 'Se verifică…';
        try {
          const snap = await backend.refresh();
          const live = await liveCommit();
          const mine = snap.head;
          if (!live.supported) {
            state.innerHTML = ico('info') + ' Starea publicării nu este disponibilă pentru această versiune a paginii.';
            detail.textContent = 'Ultima versiune salvată: ' + short(mine) + '. Pagina publică se actualizează în 1–2 minute după fiecare salvare.';
          } else if (live.deployed && (await backend.contains(live.deployed, mine))) {
            state.innerHTML = '<span class="badge badge-ok">Publicat</span> Pagina publică conține ultimele modificări.';
            detail.textContent = 'Versiunea publicată: ' + short(live.deployed) + (live.builtAt ? ', construită la ' + ADM.fmtDateTime(live.builtAt) : '') + '.';
          } else {
            state.innerHTML = '<span class="badge badge-draft">Se publică</span> Ultimele modificări apar pe pagina publică în 1–2 minute.';
            detail.textContent = 'Ultima versiune salvată: ' + short(mine) + '. Versiunea de pe pagina publică: ' + short(live.deployed) + '.';
          }
        } catch (e) {
          state.textContent = e.message;
          detail.textContent = '';
        }
      }
      $('#pubCheck', root).addEventListener('click', check);
      $('#pubRe', root).addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await backend.republish();
          DG.toast('S-a pornit republicarea paginii.');
        } catch (ex) {
          DG.toast(ex.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
      return check();
    }
  };

  pages.account = {
    title: 'Cont GitHub',
    render(root) {
      const st = readStored();
      root.innerHTML =
        '<div class="page-head"><div><h1>Cont GitHub</h1><p class="sub">Conectarea se face cu un jeton de acces personal, nu cu parolă.</p></div></div>' +
        '<section class="panel" style="max-width:40rem"><div class="panel-h"><h2>Conectare</h2></div><div class="panel-b">' +
        '<p>Cont GitHub: <strong>' + esc(ADM.user) + '</strong></p>' +
        '<p>Depozit: <a href="' + esc(ghHome) + '" target="_blank" rel="noopener"><strong>' + esc(full) + '</strong></a>, ramura <span class="code">' + esc(branch) + '</span></p>' +
        '<p>Jetonul este păstrat ' + (st && st.remember ? '<strong>pe acest calculator</strong> (ați ales „Păstrează conectarea”)' : '<strong>doar în această filă</strong> a browserului; se șterge când o închideți') + '.</p>' +
        '<p style="display:flex;gap:.6rem;flex-wrap:wrap"><button type="button" class="btn btn-line" id="ghSwitch">Folosește alt jeton</button></p>' +
        '<h3 style="font-size:1.05rem;margin:1.25rem 0 .6rem">Despre jeton</h3>' +
        '<p>Jetonul se comportă ca o parolă: oricine îl are poate modifica pagina. Nu îl trimiteți nimănui și nu îl scrieți în documente.</p>' +
        '<p>Când expiră, panoul vă cere unul nou; conținutul nu se pierde. Dacă l-ați pierdut sau credeți că a ajuns la altcineva, ștergeți-l în GitHub, la <span class="code">Settings › Developer settings › Personal access tokens</span>.</p></div></section>';
      $('#ghSwitch', root).addEventListener('click', async () => {
        try {
          await ADM.reauth();
          DG.toast('Jetonul a fost schimbat.');
          pages.account.render(root);
        } catch (e) {
          /* a renunțat */
        }
      });
    }
  };
})();
