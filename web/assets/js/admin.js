/* Panou de administrare — pornire, autentificare, meniu și navigare între pagini. */
(function () {
  'use strict';

  const DG = window.DG;
  const ADM = window.ADM;
  const esc = DG.esc;
  const $ = ADM.$;

  let currentPage = null;
  let seq = 0;
  let appShown = false;

  function show(view) {
    $('#boot').hidden = true;
    $('#loginView').hidden = view !== 'login';
    $('#app').hidden = view !== 'app';
    appShown = view === 'app';
    document.body.classList.remove('side-open');
  }

  /* ---------- autentificare ---------- */
  function loginMessage(text) {
    const err = $('#lErr');
    err.textContent = text || '';
    err.hidden = !text;
  }

  function showLogin(message) {
    show('login');
    document.title = 'Autentificare | Administrare';
    loginMessage(message);
    $('#lPass').value = '';
    ($('#lUser').value ? $('#lPass') : $('#lUser')).focus();
  }

  $('#lShow').addEventListener('click', e => {
    const input = $('#lPass');
    const on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    e.currentTarget.textContent = on ? 'Ascunde' : 'Arată';
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const u = $('#lUser').value.trim();
    const p = $('#lPass').value;
    if (!u || !p) {
      loginMessage('Introduceți utilizatorul și parola.');
      (u ? $('#lPass') : $('#lUser')).focus();
      return;
    }
    const btn = $('#lBtn');
    btn.disabled = true;
    btn.textContent = 'Se verifică…';
    loginMessage('');
    try {
      const s = await ADM.rawPost('/api/login', { username: u, password: p });
      ADM.applySession(s);
      $('#lPass').value = '';
      await startApp();
    } catch (ex) {
      loginMessage(ex.message);
      $('#lPass').select();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Autentificare';
    }
  });

  function sessionEnded(message) {
    if (ADM.abortForm) ADM.abortForm();
    ['askDlg', 'confirmDlg', 'reauthDlg'].forEach(id => {
      const d = $('#' + id);
      if (d && d.open) d.close();
    });
    ADM.guards.length = 0;
    ADM.data = {};
    ADM.settings = null;
    if (currentPage != null && ADM.pages[currentPage] && ADM.pages[currentPage].leave) ADM.pages[currentPage].leave();
    currentPage = null;
    seq++;
    $('#main').innerHTML = '';
    showLogin(message);
  }
  ADM.onSessionLost = () => sessionEnded('Sesiunea a expirat. Autentificați-vă din nou.');

  $('#logoutBtn').addEventListener('click', async () => {
    if (ADM.isDirty() && !(await ADM.confirm({ title: 'Ieșiți din cont?', message: 'Aveți modificări nesalvate sau încărcări în curs. Dacă ieșiți acum, acestea se pierd.', ok: 'Ieșire', danger: true }))) return;
    try {
      await ADM.rawPost('/api/logout', {});
    } catch (e) {
      /* chiar dacă cererea eșuează, închidem sesiunea în browser */
    }
    sessionEnded('Ați ieșit din cont.');
  });

  /* ---------- aplicația ---------- */
  ADM.refreshOrg = function () {
    const n = ADM.settings && ADM.settings.orgName;
    if (n) $('#tbOrg').textContent = n;
  };

  async function startApp() {
    try {
      ADM.settings = await ADM.get('/api/admin/settings');
    } catch (e) {
      ADM.settings = null;
    }
    ADM.refreshOrg();
    $('#tbUser').textContent = ADM.user;
    show('app');
    if (!location.hash || location.hash === '#') ADM.navigate('#/');
    ADM.hash = location.hash;
    await route();
  }

  function parseHash() {
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    return { page: parts[0] || '', arg: parts[1] || '' };
  }

  function setNav(page) {
    ADM.$$('.side a').forEach(a => {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function notFound(main) {
    main.innerHTML = '<div class="page-head"><div><h1>Pagina nu există</h1><p class="sub">Adresa din bara browserului nu corespunde niciunei secțiuni.</p></div></div><p><a class="btn btn-primary" href="#/">Înapoi la panoul de control</a></p>';
    document.title = 'Pagina nu există | Administrare';
    setNav(null);
  }

  async function route() {
    const my = ++seq;
    const r = parseHash();
    const main = $('#main');
    const prevHash = ADM.hash;

    // Un formular deschis sau modificări nesalvate: cerem confirmarea înainte de a pleca.
    if (ADM.formOpen()) {
      if (!(await ADM.closeForm())) {
        ADM.navigate(prevHash);
        return;
      }
    } else if (r.page !== currentPage && currentPage != null && ADM.isDirty()) {
      const ok = await ADM.confirm({ title: 'Părăsiți pagina?', message: 'Aveți modificări nesalvate sau încărcări în curs. Dacă plecați acum, acestea se pierd.', ok: 'Părăsește pagina', danger: true });
      if (!ok) {
        ADM.navigate(prevHash);
        return;
      }
    }
    if (my !== seq) return;
    ADM.hash = location.hash || '#/';
    document.body.classList.remove('side-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#sideShade').hidden = true;

    const def = ADM.pages[r.page];
    if (!def) {
      if (currentPage != null && ADM.pages[currentPage] && ADM.pages[currentPage].leave) ADM.pages[currentPage].leave();
      currentPage = null;
      notFound(main);
      return;
    }

    if (r.page !== currentPage) {
      if (currentPage != null && ADM.pages[currentPage] && ADM.pages[currentPage].leave) ADM.pages[currentPage].leave();
      currentPage = r.page;
      setNav(r.page);
      document.title = def.title + ' | Administrare';
      main.innerHTML = '<p class="muted" role="status">Se încarcă…</p>';
      try {
        await def.render(main, r.arg);
      } catch (e) {
        if (my !== seq) return;
        main.innerHTML = '<div class="alert alert-error" role="alert">' + DG.icon('alert') + '<div><strong>Pagina nu a putut fi încărcată.</strong> ' + esc(e.message) + '</div><button type="button" class="btn btn-line btn-sm" id="retryBtn">Reîncearcă</button></div>';
        $('#retryBtn').addEventListener('click', () => {
          currentPage = null;
          route();
        });
        currentPage = null;
        return;
      }
      if (my !== seq) return;
      if (!r.arg) {
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
      }
    }
    if (def.open) {
      try {
        const p = def.open(r.arg);
        if (p && p.catch) p.catch(e => DG.toast(e.message, 'error'));
      } catch (e) {
        DG.toast(e.message, 'error');
      }
    }
  }

  window.addEventListener('hashchange', () => {
    if (appShown) route();
  });

  /* ---------- meniu pe ecrane mici ---------- */
  const menuBtn = $('#menuBtn');
  const shade = $('#sideShade');
  function toggleMenu(on) {
    document.body.classList.toggle('side-open', on);
    menuBtn.setAttribute('aria-expanded', String(on));
    shade.hidden = !on;
  }
  menuBtn.addEventListener('click', () => toggleMenu(!document.body.classList.contains('side-open')));
  shade.addEventListener('click', () => toggleMenu(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('side-open') && !document.querySelector('dialog[open]')) {
      toggleMenu(false);
      menuBtn.focus();
    }
  });
  $('.skip').addEventListener('click', e => {
    e.preventDefault();
    $('#main').focus();
  });

  /* ---------- pornire ---------- */
  (async function boot() {
    try {
      const s = await ADM.get('/api/session');
      if (s && s.authenticated) {
        ADM.applySession(s);
        await startApp();
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin(e.status === 404 || e.status === 0 ? 'Panoul de administrare funcționează doar când aplicația rulează pe server (npm start). Versiunea statică nu include administrarea.' : e.message);
    }
  })();
})();
