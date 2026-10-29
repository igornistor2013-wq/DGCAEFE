/* Pagina publică: preia datele (de la server sau încorporate în versiunea statică) și construiește secțiunile. */
(function () {
  'use strict';

  // La reîncărcarea paginii (F5) se revine mereu la început, oriunde ai fi fost; linkurile directe (de ex. către o știre) rămân neschimbate.
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var navEntry = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (navEntry && navEntry.type === 'reload') {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      window.scrollTo(0, 0);
    }
  } catch (e) { /* fără această funcție pagina merge la fel */ }

  var DG = window.DG;
  var I18n = window.I18n;
  var LANG = DG.lang; // limba paginii: ro, ru sau en (vezi i18n.js)
  var esc = DG.esc;
  var ico = DG.icon;
  var STATIC = document.documentElement.getAttribute('data-static') === 'true';
  // Versiunea publicată pe GitHub Pages cu administrare directă în depozit (data-github="proprietar/depozit"):
  // panoul este la adresa relativă admin/, iar „sesiunea” este jetonul păstrat de browser după conectare.
  var GH = document.documentElement.getAttribute('data-github') || '';
  var ADMIN = GH ? 'admin/' : '/admin/';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function byId(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }
  function pref(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, val);
    } catch (e) { /* stocarea poate fi blocată; pagina funcționează și fără ea */ }
    return null;
  }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var T = DG.t; // text din interfață în limba paginii (vezi common.js)

  var D = null; // datele publice
  var admin = { on: false, user: '', csrf: '' };

  var LEVELS = {
    cross: { name: 'Transfrontalier', desc: 'Cooperare între regiuni vecine, de o parte și de alta a frontierei.' },
    trans: { name: 'Transnațional', desc: 'Cooperare între mai multe state dintr-un spațiu larg, cu provocări comune: bazinul Mării Negre și regiunea Dunării.' },
    inter: { name: 'Interregional', desc: 'Schimb de experiență și de bune practici între autorități regionale și orașe din toată Europa.' }
  };
  var LEVEL_ORDER = ['cross', 'trans', 'inter'];
  var SECTION_LABEL = {
    rapoarte: 'Rapoarte anuale',
    'acord-ro': 'Acordul cu România',
    program: 'Programe de cooperare',
    auditori: 'Verificarea cheltuielilor',
    'plan-crestere': 'Planul de creștere',
    general: 'Alte documente'
  };
  var GROUP_LABEL = { buletin: 'Buletine informative', oficial: 'Documente oficiale', stiri: 'Știri și materiale', '': 'Alte documente' };
  var LAW_TYPE = {
    Lege: { chip: 'Legi', one: 'Lege', name: 'Legea' },
    HG: { chip: 'Hotărâri de Guvern', one: 'Hotărâre de Guvern', name: 'Hotărârea Guvernului' },
    Ordin: { chip: 'Ordine', one: 'Ordin', name: 'Ordinul' },
    Altele: { chip: 'Alte acte', one: 'Act normativ', name: 'Actul' }
  };

  /* ---------- funcții de ajutor ---------- */
  function isExternal(h) { return /^https?:/i.test(h); }
  function docHref(d) { return (d.file && d.file.path) || d.url || '#'; }
  function docAttrs(d) {
    var a = ' href="' + esc(docHref(d)) + '"';
    if (d.file) {
      if (/\.pdf$/i.test(d.file.path)) a += ' target="_blank" rel="noopener"';
      else a += ' download="' + esc(d.file.name || '') + '"';
    } else a += ' target="_blank" rel="noopener"';
    return a;
  }
  function kindOf(d) { return DG.fileKind(d.file ? d.file.path : d.url); }
  // Titlul unui document în limba engleză este marcat ca atare (cititoarele de ecran îl pronunță corect).
  function titleHtml(d) { return d.en ? '<span lang="en">' + esc(d.title) + '</span>' : esc(d.title); }
  function docIcon(d) {
    var k = kindOf(d).cls;
    if (d.section === 'ghiduri' || /ghid|metodolog/i.test(d.title || '')) return 'book';
    return k === 'pdf' ? 'pdf' : k === 'xls' ? 'table' : k === 'web' ? 'link' : 'file';
  }
  function ftBadge(d) { var k = kindOf(d); return '<span class="ft ft-' + k.cls + '" aria-hidden="true">' + k.label + '</span>'; }
  function docMeta(d) {
    return [d.kind, DG.dateText(d) || (d.section === 'rapoarte' && d.year ? String(d.year) : ''), d.en ? T('în limba engleză') : '', d.file && d.file.size ? DG.formatSize(d.file.size) : ''].filter(Boolean).join(', ');
  }
  function docYear(d) {
    if (d.year) return d.year;
    if (d.date) return Number(d.date.slice(0, 4));
    var m = /(20\d\d)/.exec(d.dateLabel || '');
    return m ? Number(m[1]) : null;
  }
  function cmpDocs(a, b) {
    return (a.order || 0) - (b.order || 0) || (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  }
  function docsOf(section) { return D.documents.filter(function (d) { return d.section === section; }).sort(cmpDocs); }
  function editLink(coll, id) {
    return admin.on ? '<a class="edit-link" href="' + ADMIN + '#/' + coll + '/' + esc(id) + '">Editează</a>' : '';
  }
  function lawName(l) { return T((LAW_TYPE[l.type] || LAW_TYPE.Altele).name) + ' ' + T('nr.') + ' ' + l.nr + '/' + l.year; }
  function progOf(id) { return byId(D.programs, id); }
  function telHref(p) {
    var d = String(p).replace(/[^\d+]/g, '');
    if (d.charAt(0) === '+') return 'tel:' + d;
    if (d.charAt(0) === '0') return 'tel:+373' + d.slice(1);
    return 'tel:' + d;
  }
  function chipsHtml(items, active, attr) {
    return items.map(function (c) {
      return '<button class="chip" type="button" ' + attr + '="' + esc(c.v) + '" aria-pressed="' + (c.v === active) + '">' + esc(c.l) + (c.n !== undefined ? '<span class="n">' + c.n + '</span>' : '') + '</button>';
    }).join('');
  }
  // Închide fereastra doar dacă s-a făcut clic pe fundalul din afara ei (nu pe bara de derulare).
  function isBackdropClick(dlg, e) {
    if (e.target !== dlg) return false;
    var r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }
  function scrollToEl(el) { el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }
  // numere în scriere românească: 151.5 → „151,5”
  function numRo(n) { return I18n.num(LANG, n); }
  // Forma după număr. În rusă dicționarul are, la cheia „one”, cele trei forme despărțite prin „|” (unu | câțiva | mulți).
  function plural(n, one, many) {
    if (LANG === 'ro') return n === 1 ? one : many;
    if (LANG === 'ru') {
      var f = T(one).split('|');
      return f.length === 3 ? I18n.plural('ru', n, f) : T(many);
    }
    return n === 1 ? T(one) : T(many);
  }

  // Secțiuni care se deschid și se închid (funcții, drepturi, proiecte): butonul poartă starea în aria-expanded, iar elementul-gazdă
  // în data-open (pe el se sprijină și stilurile). Starea se păstrează în `accState`, ca să nu se piardă la o nouă desenare.
  var accState = {};
  function accToggle(btn, force) {
    var host = btn.closest('[data-open]');
    var open = force === undefined ? host.getAttribute('data-open') !== 'true' : !!force;
    host.setAttribute('data-open', String(open));
    btn.setAttribute('aria-expanded', String(open));
    if (btn.getAttribute('data-acc')) accState[btn.getAttribute('data-acc')] = open;
    return open;
  }

  /* ---------- Liste lungi: primele elemente și butonul „Vezi mai mult” ---------- */
  // Fiecare listă arată întâi primele elemente (5; noutățile 6, fotografiile 12). Butonul de sub ea spune câte mai sunt, le adaugă pe următoarele
  // și, când s-au afișat toate, devine „Vezi mai puțin”. La orice căutare, filtru sau ordonare lista revine la primele elemente.
  var MORE = {
    docs: { box: 'docMoreBox', list: '#docList > li', ctl: 'docList', head: 'h-doc', noun: '%1 din %2 documente', first: 5, step: 10, draw: function () { renderDocs(); } },
    law: { box: 'lawMoreBox', list: '#lawBody > li', ctl: 'lawBody', head: 'h-legal', noun: '%1 din %2 acte', first: 5, step: 10, draw: function () { renderLegal(); } },
    events: { box: 'evMoreBox', list: '#timeline .ev-body', ctl: 'timeline', head: 'h-ev', noun: '%1 din %2 evenimente', first: 5, step: 10, draw: function () { renderEvents(); } },
    reports: { box: 'repMoreBox', list: '#reportGrid > .rep-wrap', ctl: 'reportGrid', head: 'h-rapoarte', noun: '%1 din %2 rapoarte', first: 5, step: 10, draw: function () { renderReports(); } },
    steps: { box: 'stepMoreBox', list: '#stepList > li', ctl: 'stepList', head: 'h-acord', noun: '%1 din %2 pași', first: 5, step: 10, draw: function () { renderSteps(); } },
    news: { box: 'newsMoreBox', list: '#newsGrid > .news-card', ctl: 'newsGrid', head: 'h-noutati', noun: '%1 din %2 noutăți', first: 6, step: 6, draw: function () { renderNews(); } },
    gal: { box: 'galMoreBox', list: '#galGrid > li', ctl: 'galGrid', head: 'h-gal', noun: '%1 din %2 fotografii', first: 12, step: 12, draw: function () { renderGallery(); } }
  };
  var PRINT_ALL = ['docs', 'law', 'events', 'reports', 'steps']; // listele care se tipăresc întregi
  var lim = {}; // câte elemente se văd din fiecare listă (lipsește = primele)
  var limTotal = {}; // câte elemente are fiecare listă după filtre
  function limOf(k) { return lim[k] || MORE[k].first; }
  function limReset(k) { delete lim[k]; }
  // lista trebuie să arate și elementul cu numărul `i` (de exemplu când căutarea din pagină duce la el)
  function limShow(k, i) { if (i >= limOf(k)) lim[k] = i + 1; }
  // elementele care se văd acum din lista `k`
  function moreSlice(k, items) {
    limTotal[k] = items.length;
    return items.slice(0, limOf(k));
  }
  // butonul de sub listă: se actualizează pe loc (cursorul rămâne pe el), iar fără elemente în plus dispare
  function moreBox(k) {
    var c = MORE[k];
    var box = document.getElementById(c.box);
    if (!box) return;
    var total = limTotal[k] || 0;
    if (total <= c.first) { box.hidden = true; box.innerHTML = ''; return; }
    var shown = Math.min(limOf(k), total);
    var all = shown >= total;
    var btn = $('.more-btn', box);
    if (!btn) {
      box.innerHTML = '<button class="more-btn" type="button" data-more="' + k + '" aria-controls="' + c.ctl + '" aria-describedby="' + c.head + '"><span class="more-t"></span><span class="more-n"></span>' + ico('chev-d') + '</button><span class="more-info"></span>';
      btn = $('.more-btn', box);
    }
    btn.setAttribute('aria-expanded', String(all));
    $('.more-t', box).textContent = T(all ? 'Vezi mai puțin' : 'Vezi mai mult');
    var n = $('.more-n', box);
    n.textContent = all ? '' : T('încă %1', total - shown);
    n.hidden = all;
    $('.more-info', box).textContent = T(c.noun, shown, total);
    box.hidden = false;
  }
  // după „Vezi mai mult” cursorul trece pe primul element nou (cititoarele de ecran continuă de acolo)
  function focusNew(el) {
    if (!el) return;
    var f = $('summary, a[href]:not([tabindex="-1"]), button', el) || el;
    if (f === el) el.setAttribute('tabindex', '-1');
    f.focus();
  }
  function setupMore() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.more-btn[data-more]');
      if (!b) return;
      var k = b.getAttribute('data-more');
      var c = MORE[k];
      var total = limTotal[k] || 0;
      var cur = Math.min(limOf(k), total);
      var grow = cur < total;
      lim[k] = grow ? Math.min(cur + c.step, total) : c.first;
      c.draw();
      if (grow) { focusNew($$(c.list)[cur]); return; }
      // „Vezi mai puțin”: lista se scurtează, iar butonul trebuie să rămână la vedere
      var nb = $('.more-btn[data-more="' + k + '"]');
      if (!nb) return;
      var r = nb.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) nb.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
  }

  // Pe telefon filtrele stau pe un singur rând care alunecă pe orizontală; filtrul la care ajunge tastatura (sau un cititor de ecran) se vede întreg.
  function setupChipRows() {
    document.addEventListener('focusin', function (e) {
      var el = e.target, row = el.closest && el.closest('.chips');
      if (!row || row.scrollWidth <= row.clientWidth + 1) return;
      var r = el.getBoundingClientRect(), rr = row.getBoundingClientRect(), pad = 16, d = 0;
      if (r.left < rr.left + pad) d = r.left - rr.left - pad;
      else if (r.right > rr.right - pad) d = r.right - rr.right + pad;
      if (d) row.scrollBy({ left: d, behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
  }

  /* ---------- încărcarea datelor ---------- */
  function loadData() {
    var seed = document.getElementById('seed-data');
    if (seed) {
      try { return Promise.resolve(JSON.parse(seed.textContent)); } catch (e) { return Promise.reject(e); }
    }
    return fetch('/api/public' + (LANG === 'ro' ? '' : '?lang=' + LANG), { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function showError() {
    var box = $('#loadError');
    box.hidden = false;
    box.innerHTML = '<p class="notice"><strong>' + T('Conținutul nu a putut fi încărcat.') + '</strong> ' + T('Dacă ați deschis acest fișier direct din calculator, folosiți serverul (%1) sau versiunea statică exportată din panoul de administrare. Dacă problema persistă, reîncărcați pagina peste câteva minute.', '<code>npm start</code>') + '</p>';
  }

  /* ================= Prezentare ================= */
  // Ultimele două cuvinte ale titlului se scriu cu galben (ca pe ie.mf.gov.md); un titlu foarte scurt rămâne alb.
  function heroTitleHtml(t) {
    var w = String(t || '').trim().split(/\s+/).filter(Boolean);
    if (w.length < 4) return esc(w.join(' '));
    return esc(w.slice(0, -2).join(' ')) + ' <span class="h1-b">' + esc(w.slice(-2).join(' ')) + '</span>';
  }

  function renderIntro() {
    var s = D.settings;
    $('#brandName').textContent = s.orgName;
    $('#brandParent').textContent = s.parentName;
    $('#topParent').textContent = s.parentName;
    $('#introTitle').innerHTML = heroTitleHtml(s.heroTitle || s.orgName);
    $('#introLead').textContent = s.heroLead || '';
    // în locul textului de prezentare se derulează ultimele 10 noutăți (fără noutăți rămâne textul de prezentare)
    if (window.HeroNews) window.HeroNews.render($('#heroNews'), D.news, DG, $('#top .hero'));
    document.title = s.orgName + ' | ' + s.parentName;
    var q = s.quickLinks || [];
    $('.quick').hidden = !q.length;
    $('#quickLinks').innerHTML = q.map(DG.quickLinkHtml).join('');
  }

  var ALIAS = { drp: 'Dunărea Dunăre Danube', bsb: 'Marea Neagră Black Sea' }; // forme pe care le caută oamenii și care nu apar în nume

  function shortName(p) { return p.short || p.name.replace(/^Interreg\s+(NEXT\s+)?/i, '').replace(/\s+20\d\d.*$/, ''); }
  function levelOf(p) { return LEVELS[p.level] ? p.level : 'inter'; }
  // „1 program”, „5 programe”, „20 de programe”
  function countRo(n, one, many) {
    if (LANG !== 'ro') return n + ' ' + plural(n, one, many);
    return n === 1 ? '1 ' + one : n + (n > 19 && (n % 100 === 0 || n % 100 > 19) ? ' de ' : ' ') + many;
  }

  /* ================= Noutăți ================= */
  function newsCard(n) {
    var href = '#stire/' + n.id;
    var thumb = n.image && (n.image.thumb || n.image.path);
    return '<article class="news-card">' +
      (thumb ? '<a class="news-media" href="' + href + '" data-news="' + esc(n.id) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(thumb) + '" alt="" width="480" height="270" loading="lazy"></a>' : '') +
      '<div class="news-body"><p class="card-meta">' + (n.tag ? '<span class="tag">' + esc(n.tag) + '</span>' : '') +
      '<time datetime="' + esc(n.date) + '">' + esc(DG.dateText(n)) + '</time></p>' +
      '<h3><a href="' + href + '" data-news="' + esc(n.id) + '">' + esc(n.title) + '</a></h3>' +
      (n.summary ? '<p>' + esc(n.summary) + '</p>' : '') +
      '<a class="more-link" href="' + href + '" data-news="' + esc(n.id) + '">Citește mai departe<span class="sr">: ' + esc(n.title) + '</span> ' + ico('arrow-r') + '</a>' +
      editLink('news', n.id) + '</div></article>';
  }

  // rubrica Noutăți: ultima noutate, mare, și următoarele trei, mici; restul — în carduri, dedesubt
  function latestMain(n) {
    var href = '#stire/' + n.id;
    var pic = n.image && (n.image.path || n.image.thumb);
    return '<article class="lt-main">' +
      (pic ? '<a class="lt-pic" href="' + href + '" data-news="' + esc(n.id) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(pic) + '" alt="" width="800" height="560" loading="lazy" decoding="async"></a>' : '') +
      '<div class="lt-body"><p class="lt-meta">' + (n.tag ? '<span class="lt-tag">' + esc(n.tag) + '</span>' : '') + '<time datetime="' + esc(n.date) + '">' + esc(DG.dateText(n)) + '</time></p>' +
      '<h3><a href="' + href + '" data-news="' + esc(n.id) + '">' + esc(n.title) + '</a></h3>' +
      (n.summary ? '<p class="lt-sum">' + esc(n.summary) + '</p>' : '') +
      '<a class="lt-more" href="' + href + '" data-news="' + esc(n.id) + '">Citește mai departe<span class="sr">: ' + esc(n.title) + '</span> ' + ico('arrow-r') + '</a></div></article>';
  }
  function latestItem(n) {
    var href = '#stire/' + n.id;
    var thumb = n.image && (n.image.thumb || n.image.path);
    return '<article class="lt-item">' +
      (thumb ? '<a class="lt-thumb" href="' + href + '" data-news="' + esc(n.id) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(thumb) + '" alt="" width="208" height="208" loading="lazy"></a>' : '<span class="lt-thumb" aria-hidden="true"></span>') +
      '<div><time datetime="' + esc(n.date) + '">' + esc(DG.dateText(n)) + '</time><h3><a href="' + href + '" data-news="' + esc(n.id) + '">' + esc(n.title) + '</a></h3></div></article>';
  }
  function renderLatest() {
    var list = (D.news || []).slice(0, 4);
    $('#latestGrid').innerHTML = list.length ? latestMain(list[0]) + (list.length > 1 ? '<div class="lt-side">' + list.slice(1).map(latestItem).join('') + '</div>' : '') : '';
  }

  function renderNews() {
    var all = D.news || [];
    var list = moreSlice('news', all.slice(4));
    var g = $('#newsGrid');
    g.hidden = !list.length && all.length > 0;
    g.innerHTML = all.length ? list.map(newsCard).join('') : '<p class="empty">Nu există noutăți publicate.' + (admin.on ? ' <a href="' + ADMIN + '#/news/new">Adăugați prima știre</a>.' : '') + '</p>';
    moreBox('news');
  }

  var newsDlg;
  function openNews(id) {
    var n = byId(D.news, id);
    if (!n) return false;
    var body = n.body ? DG.rich(n.body) : DG.rich(n.summary);
    var actions = '';
    if (n.attachment) actions += '<a class="btn btn-primary" href="' + esc(n.attachment.path) + '" ' + (/\.pdf$/i.test(n.attachment.path) ? 'target="_blank" rel="noopener"' : 'download="' + esc(n.attachment.name || '') + '"') + '>' + ico('down') + ' Descarcă documentul' + (n.attachment.size ? ' (' + DG.formatSize(n.attachment.size) + ')' : '') + '</a>';
    if (n.linkUrl) actions += '<a class="btn btn-line" href="' + esc(n.linkUrl) + '" target="_blank" rel="noopener">' + esc(n.linkLabel || 'Deschide legătura') + ' ' + ico('ext') + '</a>';
    actions += '<button class="btn btn-line" type="button" data-copy-news="' + esc(n.id) + '">' + ico('link') + ' Copiază adresa știrii</button>';
    newsDlg.innerHTML =
      '<div class="dlg-head"><p class="card-meta">' + (n.tag ? '<span class="tag">' + esc(n.tag) + '</span>' : '') + '<time datetime="' + esc(n.date) + '">' + esc(DG.dateText(n)) + '</time></p>' +
      '<span>' + editLink('news', n.id) + ' <button class="icon-btn" type="button" data-close aria-label="Închide fereastra">' + ico('close') + '</button></span></div>' +
      '<article><h2 id="newsDlgTitle">' + esc(n.title) + '</h2>' +
      (n.image ? '<figure><img src="' + esc(n.image.path) + '" alt="' + esc(n.imageAlt || '') + '"></figure>' : '') +
      '<div class="prose">' + body + '</div><div class="news-actions">' + actions + '</div></article>';
    if (!newsDlg.open) newsDlg.showModal();
    newsDlg.scrollTop = 0;
    return true;
  }

  /* ================= Despre ================= */
  // Prezentarea, principiile, funcțiile, structura, drepturile și responsabilitățile provin din Regulamentul de activitate al
  // direcției; toate textele se editează în panoul de administrare, la „Texte pagină”.
  function staffTotal(rows) {
    var t = 0;
    (rows || []).forEach(function (r) { var n = parseInt(r.count, 10); if (n > 0) t += n; });
    return t;
  }

  function renderAbout() {
    var s = D.settings;
    var duties = s.duties || [];
    var staff = s.structure || [];
    var total = staffTotal(staff);

    $('#aboutText').innerHTML = (s.aboutP1 ? '<p>' + esc(s.aboutP1) + '</p>' : '') + (s.aboutP2 ? '<p>' + esc(s.aboutP2) + '</p>' : '');
    $('#aboutCta').innerHTML = '<a class="btn btn-primary" href="#cadrul-legal">Vezi cadrul legal</a><a class="btn btn-line" href="https://amp.gov.md/portal/" target="_blank" rel="noopener">Platforma AMP ' + ico('ext') + '</a>';

    var pr = s.principles || [];
    $('#aboutPrinc').hidden = !pr.length;
    $('#aboutPrinc').innerHTML = pr.length ? '<h3 id="h-princ">Principii de activitate</h3><ul class="pills">' + pr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';

    // funcțiile de bază: carduri numerotate; fiecare se deschide într-o fereastră (ca știrile), cu textul funcției și atribuțiile (a, b, c …)
    $('#fnCount').textContent = duties.length ? countRo(duties.length, 'funcție', 'funcții') : '';
    $('#dutiesList').innerHTML = duties.map(function (d, i) {
      var items = d.items || [];
      var has = !!(d.text || items.length);
      var head = '<span class="fn-no" aria-hidden="true">' + (i < 9 ? '0' : '') + (i + 1) + '</span><span class="fn-t">' + esc(d.title) + '</span>' +
        '<span class="fn-n">' + (items.length ? countRo(items.length, 'atribuție', 'atribuții') : '') + '</span>';
      return '<li class="fn">' + (has ?
        '<a class="fn-btn" href="#functie/' + (i + 1) + '">' + head + '<span class="fn-go" aria-hidden="true">' + ico('arrow-r') + '</span></a>' :
        '<span class="fn-btn fn-static">' + head + '</span>') + '</li>';
    }).join('');

    // structura: unitățile din statul de personal și numărul de posturi
    $('#orgTotal').textContent = total ? countRo(total, 'unitate', 'unități') : '';
    $('#orgChart').innerHTML = staff.length ? '<ul class="org">' + staff.map(function (r) {
      return '<li class="org-row"><span class="org-t">' + esc(r.title) + '</span><span class="org-n">' + esc(r.count) + '</span></li>';
    }).join('') + '</ul>' : '';

    var roles = [['Drepturile direcției', s.rights], ['Responsabilitățile direcției', s.responsibilities]].filter(function (r) { return r[1] && r[1].length; });
    // filele fără conținut dispar; prima rămasă se deschide
    var has = { 'functii': duties.length, 'structura': staff.length, 'drepturi-responsabilitati': roles.length };
    $$('#aboutTabs [data-tab]').forEach(function (t) { t.hidden = !has[t.getAttribute('data-tab')]; });
    var cur = aboutTab.current;
    if (!has[cur]) cur = Object.keys(has).filter(function (k) { return has[k]; })[0] || 'functii';
    $('#aboutTabs').hidden = !Object.keys(has).some(function (k) { return has[k]; });
    aboutTab(cur);
    $('#rolesList').innerHTML = roles.map(function (r, i) {
      var key = 'role:' + i;
      var open = !!accState[key];
      return '<div class="acc" data-open="' + open + '"><h4 class="acc-h"><button class="acc-btn" type="button" id="role-b-' + i + '" data-acc="' + key + '" aria-expanded="' + open + '" aria-controls="role-p-' + i + '">' +
        '<span class="acc-t">' + r[0] + '</span><span class="fn-n">' + r[1].length + '</span><span class="fn-chev">' + ico('chev-d') + '</span></button></h4>' +
        '<div class="acc-panel" id="role-p-' + i + '" role="region" aria-labelledby="role-b-' + i + '"><ol class="num-list">' + r[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div></div>';
    }).join('');
  }

  // Filele din „Despre direcție”: Funcții / Structură / Drepturi. Se vede un singur panou; săgețile mută între file.
  function aboutTab(name, focus) {
    aboutTab.current = name;
    $$('#aboutTabs [data-tab]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('data-tab'));
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    });
  }
  aboutTab.current = 'functii';

  function goFunction(i) {
    aboutTab('functii');
    location.hash = '#functie/' + (i + 1);
  }

  // fereastra unei funcții (ca la știri): numărul, titlul, textul și atribuțiile; săgețile duc la funcția de dinainte / de după
  var fnDlg;
  function openFn(n) {
    var duties = D.settings.duties || [];
    var i = n - 1;
    var d = duties[i];
    if (!d || !(d.text || (d.items && d.items.length))) return false;
    var items = d.items || [];
    var prev = i > 0 ? i : 0;
    var next = i < duties.length - 1 ? i + 2 : 0;
    fnDlg.innerHTML =
      '<div class="dlg-head"><p class="card-meta"><span class="tag">Funcție de bază</span></p>' +
      '<span><button class="icon-btn" type="button" data-close aria-label="Închide fereastra">' + ico('close') + '</button></span></div>' +
      '<article><p class="fn-dno" aria-hidden="true">' + (i < 9 ? '0' : '') + (i + 1) + '</p><h2 id="fnDlgTitle">' + esc(d.title) + '</h2>' +
      (d.text ? '<p class="fn-text">' + esc(d.text) + '</p>' : '') +
      (items.length ? '<h3 class="fn-sub">Atribuții</h3><ol class="fn-items">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
      '<div class="news-actions">' +
      (prev ? '<a class="btn btn-line" href="#functie/' + prev + '">' + ico('arrow-l') + ' Funcția anterioară</a>' : '') +
      (next ? '<a class="btn btn-line" href="#functie/' + next + '">Funcția următoare ' + ico('arrow-r') + '</a>' : '') +
      '</div></article>';
    if (!fnDlg.open) fnDlg.showModal();
    fnDlg.scrollTop = 0;
    return true;
  }

  /* ================= Cadrul legal ================= */
  var law = { type: 'all', q: '', sort: 'year-desc' };

  function renderLegalChips() {
    var types = ['Lege', 'HG', 'Ordin', 'Altele'].filter(function (t) { return D.legal.some(function (l) { return l.type === t; }); });
    var chips = [{ v: 'all', l: 'Toate', n: D.legal.length }].concat(types.map(function (t) {
      return { v: t, l: LAW_TYPE[t].chip, n: D.legal.filter(function (l) { return l.type === t; }).length };
    }));
    if (law.type !== 'all' && types.indexOf(law.type) < 0) law.type = 'all';
    $('#lawChips').innerHTML = chipsHtml(chips, law.type, 'data-v');
  }

  function renderLegal() {
    renderLegalChips();
    var items = D.legal.filter(function (l) {
      return (law.type === 'all' || l.type === law.type) && DG.matches(lawName(l) + ' ' + l.type + ' ' + l.nr + ' ' + l.nr + '/' + l.year + ' ' + l.title + ' ' + (l.topic || ''), law.q);
    });
    items.sort(function (a, b) {
      if (law.sort === 'year-asc') return a.year - b.year;
      if (law.sort === 'type') return a.type.localeCompare(b.type) || b.year - a.year;
      return b.year - a.year;
    });
    $('#lawCount').textContent = T('%1 din %2 acte', items.length, D.legal.length);
    // Un rând pe act: tipul și numărul, denumirea și legătura către legis.md (sau către fișierul actului, dacă nu are link).
    var shown = moreSlice('law', items);
    $('#lawBody').innerHTML = shown.length ? shown.map(function (l) {
      var href = l.url || (l.file && l.file.path) || '';
      var inner = '<span class="law-ico" aria-hidden="true">' + ico('gavel') + '</span><span class="law-no"><span class="type">' + T((LAW_TYPE[l.type] || LAW_TYPE.Altele).one) + '</span><strong>' + T('nr.') + ' ' + esc(l.nr) + '/' + l.year + '</strong></span>' +
        '<span class="law-title"><span>' + esc(l.title) + '</span>' + (l.topic ? '<span class="law-topic">' + esc(l.topic) + '</span>' : '') + '</span>' +
        (href ? '<span class="law-open">' + T(/legis\.md/.test(href) ? 'legis.md' : 'Deschide') + ' ' + ico('ext') + '</span>' : '');
      return '<li class="law-row">' + (href ? '<a class="law-a" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(T(/legis\.md/.test(href) ? 'Deschide pe legis.md' : 'Deschide')) + '">' + inner + '</a>' : '<div class="law-a">' + inner + '</div>') + editLink('legal', l.id) + '</li>';
    }).join('') : '<li class="empty-row">' + T('Niciun act nu corespunde căutării%1. Încercați numărul actului (de exemplu 377) sau un cuvânt din titlu.', law.q ? ' „' + esc(law.q) + '”' : '') + ' <button class="btn btn-line btn-sm" type="button" id="lawReset">Arată toate actele</button></li>';
    moreBox('law');
  }

  /* ================= Proiecte investiționale ================= */
  // Rubrica este un card care duce la site-ul separat cu proiectele (nu mai există listă în această pagină).
  function renderInvestments() {}

  // Bannerele animate de sub card: fiecare pornește doar dacă vizitatorul nu a cerut mai puțină mișcare, se oprește cât timp nu se vede
  // și are buton de pauză propriu (animațiile automate mai lungi de 5 secunde trebuie să poată fi oprite).
  function setupProjectsFilm() {
    $$('.inv-film').forEach(setupFilm);
  }
  function setupFilm(box) {
    var v = box.querySelector('.inv-film-v');
    var btn = box.querySelector('.inv-film-btn');
    if (!v || !btn || typeof v.play !== 'function') return;
    var user = reduceMotion(); // true = oprit (de vizitator sau de setarea sistemului)
    var seen = true;
    function sync() {
      var label = user ? T('Pornește animația') : T('Oprește animația');
      if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
      var use = btn.querySelector('use');
      var icon = user ? '#i-play' : '#i-pause';
      if (use && use.getAttribute('href') !== icon) use.setAttribute('href', icon);
      if (!user && seen && !document.hidden) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    }
    btn.hidden = false;
    btn.addEventListener('click', function () { user = !user; sync(); });
    v.addEventListener('error', function () { btn.hidden = true; }, true);
    document.addEventListener('visibilitychange', sync);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; sync(); }, { rootMargin: '200px 0px' }).observe(box);
    }
    sync();
  }

  /* ================= Cooperare externă ================= */

  // un card pentru fiecare raport, cel mai recent evidențiat; cardul duce direct la document
  function renderReports() {
    var reports = docsOf('rapoarte');
    var years = [];
    reports.forEach(function (d) { var y = docYear(d); if (y && years.indexOf(y) < 0) years.push(y); });
    years.sort(function (a, b) { return b - a; });
    var latest = years[0];
    $('#h-rapoarte').parentNode.hidden = !reports.length;
    var shown = moreSlice('reports', reports.slice().sort(function (x, y) { return (docYear(y) || 0) - (docYear(x) || 0); }));
    $('#reportGrid').innerHTML = shown.map(function (d, i) {
      var y = docYear(d);
      var isNew = i === 0 && y === latest;
      return '<div class="rep-wrap"><a class="rep-card' + (isNew ? ' is-new' : '') + '"' + docAttrs(d) + ' title="' + esc(d.title) + '">' +
        '<span class="rep-top">' + ico('pdf') + '<span class="rep-tag">' + (isNew ? T('NOU') : kindOf(d).label) + '</span></span>' +
        '<span class="rep-bot"><span class="rep-year">' + (y || '') + '</span><span class="rep-lbl">' + T('Raport anual') + '</span></span></a>' + editLink('documents', d.id) + '</div>';
    }).join('') || '<p class="empty">Nu există rapoarte publicate.</p>';
    moreBox('reports');
  }

  // documentele Acordului cu România, în ordinea etapelor
  function renderSteps() {
    var list = $('#stepList');
    if (!list) return;
    var acord = docsOf('acord-ro').sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    list.innerHTML = moreSlice('steps', acord).map(function (d) {
      return '<li><a' + docAttrs(d) + '><span>' + titleHtml(d) + '</span>' + ico(d.file ? 'down' : 'ext') + '</a></li>';
    }).join('');
    moreBox('steps');
  }

  function renderCoop() {
    renderReports();

    // textele secțiunii se editează din administrare (settings.coop); ce lipsește rămâne cum este în șablon
    var co = D.settings.coop || {};
    var safe = function (u) { return /^https?:\/\//i.test(u || '') ? u : ''; };
    if (co.title) $('#h-coop').textContent = co.title;
    $('#acordBox').innerHTML = '<div class="card-head"><h3 class="card-h" id="h-acord">' + (co.acordTitle ? esc(co.acordTitle) : 'Acordul cu Guvernul României') + '</h3>' +
      (co.acordAmount === '' ? '' : '<span class="amount">' + esc(co.acordAmount || '100 mil. EUR') + '</span>') + '</div>' +
      '<p class="panel-intro">' + (co.acordIntro ? esc(co.acordIntro) : 'Program de asistență tehnică și financiară, în baza unui ajutor financiar nerambursabil acordat de România Republicii Moldova. Documentele sunt ordonate după etapele de implementare.') + '</p>' +
      (docsOf('acord-ro').length ? '<ol class="steps" id="stepList"></ol><div class="more-row" id="stepMoreBox" hidden></div>' : '<p class="empty">Nu există documente publicate.</p>');
    renderSteps();

    // cardul Platformei AMP: textul, butonul și informațiile centralizate de platformă (se editează în administrare, la „Cooperare”)
    var amp = $('#ampCard');
    if (amp && (co.ampTitle || co.ampText || co.ampUrl || (co.ampChips || []).length)) {
      var url = safe(co.ampUrl);
      var chips = (co.ampChips || []).filter(Boolean);
      amp.hidden = false;
      if (url) amp.setAttribute('href', url);
      amp.innerHTML = '<span class="amp-logo"><img class="plat-logo" src="assets/img/amp-logo.png" alt="" width="61" height="60"></span>' +
        '<span class="amp-main"><span class="amp-t">' + esc(co.ampTitle || '') + '</span>' +
        (co.ampText ? '<span class="amp-desc">' + esc(co.ampText) + '</span>' : '') +
        (chips.length ? '<span class="amp-chips" aria-label="Informațiile centralizate de platformă">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</span>' : '') + '</span>' +
        '<span class="amp-go" aria-hidden="true">' + ico('ext') + '</span>';
    } else if (amp) amp.hidden = true;
  }

  /* ================= Programe ================= */
  function progDocs(p) { return D.documents.filter(function (d) { return d.section === 'program' && d.program === p.id; }).sort(cmpDocs); }

  // Programele de cooperare, grupate pe niveluri (transfrontalier, transnațional, interregional): o fișă pentru fiecare program,
  // cu descrierea, cifrele-cheie, legătura către site-ul programului și scurtătura către documentele lui.
  var LEVEL_ICON = { cross: 'compare', trans: 'globe', inter: 'hub' };
  var progLevel = 'cross';

  function progCard(p) {
    var n = progDocs(p).length;
    var money = (p.facts || []).filter(function (f) { return /€|eur|mil/i.test(f.b || ''); })[0];
    return '<article class="prog-card" id="prog-' + esc(p.id) + '">' +
      '<div class="pc-top"><span class="pc-ico">' + ico(LEVEL_ICON[levelOf(p)] || 'hub') + '</span>' + (money ? '<span class="pc-money">' + esc(money.b) + '</span>' : '') + '</div>' +
      '<h3 class="pc-name" tabindex="-1">' + (p.site ? '<a class="pc-link" href="' + esc(p.site) + '" target="_blank" rel="noopener">' + esc(p.name) + '</a>' : esc(p.name)) + '</h3>' +
      (p.desc ? '<p class="prog-desc">' + esc(p.desc) + '</p>' : '') +
      (p.facts || []).map(function (f) { return '<div class="fact"><b>' + esc(f.b) + '</b> ' + esc(f.t) + '</div>'; }).join('') +
      '<div class="pc-foot"><span class="pc-strand">' + ico('flag') + '<span>' + esc(p.strand || '') + '</span></span>' +
      (n ? '<button type="button" class="pc-docs" data-prog-docs="' + esc(p.id) + '">' + T('Documente (%1)', n) + '</button>' : '') +
      (p.site ? '<span class="pc-more" aria-hidden="true">' + T('Detalii') + ' →</span>' : '') + editLink('programs', p.id) + '</div></article>';
  }

  function renderPrograms() {
    var levels = LEVEL_ORDER.filter(function (lv) { return D.programs.some(function (p) { return levelOf(p) === lv; }); });
    if (levels.indexOf(progLevel) < 0) progLevel = levels[0] || 'cross';
    $('#progTabs').hidden = levels.length < 2;
    $('#progTabs').innerHTML = levels.map(function (lv) {
      var n = D.programs.filter(function (p) { return levelOf(p) === lv; }).length;
      var on = lv === progLevel;
      return '<button type="button" class="seg-btn" role="tab" id="ptab-' + lv + '" data-level="' + lv + '" aria-selected="' + on + '" aria-controls="progGroups" tabindex="' + (on ? 0 : -1) + '">' +
        ico(LEVEL_ICON[lv]) + '<span>' + esc(T(LEVELS[lv].name)) + '</span><span class="seg-n">' + n + '</span></button>';
    }).join('');
    var list = D.programs.filter(function (p) { return levelOf(p) === progLevel; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    $('#progGroups').setAttribute('aria-labelledby', 'ptab-' + progLevel);
    $('#progGroups').innerHTML = list.map(progCard).join('') || '<p class="empty">Nu există programe.</p>';
    var aud = docsOf('auditori');
    $('#auditBox').innerHTML = aud.map(function (d) {
      return '<div class="callout"><p><strong>Verificarea cheltuielilor.</strong> ' + esc(d.title) + (docMeta(d) ? '<small>' + esc(docMeta(d)) + '</small>' : '') + '</p><div class="btns"><a class="btn btn-primary"' + docAttrs(d) + '>' + ico(d.file ? 'down' : 'ext') + ' ' + (d.file ? 'Descarcă' : 'Deschide') + '</a>' + editLink('documents', d.id) + '</div></div>';
    }).join('');
  }

  function goProgram(id) {
    var pr = progOf(id);
    if (pr && levelOf(pr) !== progLevel) { progLevel = levelOf(pr); renderPrograms(); }
    var card = document.getElementById('prog-' + id);
    if (!card) return;
    scrollToEl(card);
    card.classList.add('flash');
    setTimeout(function () { card.classList.remove('flash'); }, 1800);
    setTimeout(function () { var t = $('.pc-name', card); if (t) t.focus({ preventScroll: true }); }, reduceMotion() ? 0 : 450);
  }

  // „Documente (n)” de pe fișa unui program: biblioteca de documente, filtrată pe programul ales.
  function showProgramDocs(id) {
    docs.section = 'program';
    docs.program = id;
    limReset('docs');
    renderDocs();
    scrollToEl($('#documente'));
  }

  // un document: pictograma tipului, titlul, etichete mici (secțiunea, data, tipul și mărimea fișierului) și butonul rotund de descărcare / deschidere
  function docItem(d, showSection) {
    var parts = [];
    if (showSection) {
      var p = d.section === 'program' ? progOf(d.program) : null;
      parts.push(p ? shortName(p) : T(SECTION_LABEL[d.section] || ''));
    }
    parts.push(DG.dateText(d) || (d.section === 'rapoarte' && d.year ? String(d.year) : ''));
    parts.push([d.kind, d.en ? T('în limba engleză') : '', d.file && d.file.size ? DG.formatSize(d.file.size) : ''].filter(Boolean).join(', '));
    parts = parts.filter(Boolean);
    return '<li class="doc-item"><a class="doc"' + docAttrs(d) + '><span class="doc-ico" aria-hidden="true">' + ico(docIcon(d)) + '</span><span class="doc-body"><span class="doc-t">' + titleHtml(d) + '</span>' +
      (parts.length ? '<span class="doc-m">' + parts.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</span>' : '') +
      '</span><span class="doc-go" aria-hidden="true">' + ico(d.file ? 'down' : 'ext') + '</span></a>' + editLink('documents', d.id) + '</li>';
  }

  /* ================= Biblioteca de documente ================= */
  var docs = { q: '', section: 'all', year: 'all', program: 'all' };

  function renderDocFilters() {
    var secs = Object.keys(SECTION_LABEL).filter(function (k) { return D.documents.some(function (d) { return d.section === k; }); });
    if (docs.section !== 'all' && secs.indexOf(docs.section) < 0) docs.section = 'all';
    $('#docTabs').innerHTML = chipsHtml([{ v: 'all', l: T('Toate'), n: D.documents.length }].concat(secs.map(function (k) {
      return { v: k, l: T(SECTION_LABEL[k]), n: D.documents.filter(function (d) { return d.section === k; }).length };
    })), docs.section, 'data-sec');
    var years = [];
    D.documents.forEach(function (d) { var y = docYear(d); if (y && years.indexOf(y) < 0) years.push(y); });
    years.sort(function (a, b) { return b - a; });
    $('#docYear').innerHTML = '<option value="all">Toți anii</option>' + years.map(function (y) {
      return '<option value="' + y + '"' + (String(docs.year) === String(y) ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
    // alegerea programului apare numai în rubrica „Programe de cooperare”
    var progs = D.programs.filter(function (p) { return progDocs(p).length; });
    if (docs.program !== 'all' && !progs.some(function (p) { return p.id === docs.program; })) docs.program = 'all';
    var sel = $('#docProgram');
    sel.hidden = docs.section !== 'program' || !progs.length;
    sel.innerHTML = '<option value="all">Toate programele</option>' + progs.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (docs.program === p.id ? ' selected' : '') + '>' + esc(shortName(p)) + '</option>';
    }).join('');
  }

  function renderDocs() {
    renderDocFilters();
    var items = D.documents.filter(function (d) {
      if (docs.section !== 'all' && d.section !== docs.section) return false;
      if (docs.section === 'program' && docs.program !== 'all' && d.program !== docs.program) return false;
      if (docs.year !== 'all' && String(docYear(d)) !== String(docs.year)) return false;
      var p = d.section === 'program' ? progOf(d.program) : null;
      return DG.matches([d.title, d.kind, d.description, SECTION_LABEL[d.section], p ? p.name : '', DG.dateText(d), docYear(d) || '', d.en ? 'engleza english' : ''].join(' '), docs.q);
    }).sort(cmpDocs);
    $('#docCount').textContent = T('%1 din %2 documente', items.length, D.documents.length);
    var shown = moreSlice('docs', items);
    $('#docList').innerHTML = shown.length ? shown.map(function (d) { return docItem(d, true); }).join('') :
      '<li class="empty">Niciun document nu corespunde filtrelor alese. <button class="btn btn-line btn-sm" type="button" id="docReset">Arată toate documentele</button></li>';
    moreBox('docs');
  }

  /* ================= Evenimente ================= */
  var evs = { year: 'all', prog: 'all' };
  var evDate = function (e) { return e.start || e.pub; };

  function evStatus(e) {
    var t = DG.today();
    var s = evDate(e);
    var en = e.end || s;
    if (en < t) return ['st-past', 'Încheiat'];
    if (s <= t) return ['st-now', 'În desfășurare'];
    return ['st-next', 'Urmează'];
  }

  function renderEvFilters() {
    var years = [];
    var progs = [];
    D.events.forEach(function (e) {
      var y = evDate(e).slice(0, 4);
      if (years.indexOf(y) < 0) years.push(y);
      if (e.prog && progs.indexOf(e.prog) < 0) progs.push(e.prog);
    });
    years.sort().reverse();
    $('#evYear').innerHTML = chipsHtml([{ v: 'all', l: 'Toți' }].concat(years.map(function (y) { return { v: y, l: y }; })), evs.year, 'data-year');
    $('#evProg').innerHTML = chipsHtml([{ v: 'all', l: 'Toate' }].concat(progs.map(function (p) { return { v: p, l: p }; })), evs.prog, 'data-prog-f');
    $('.ev-filters').hidden = !progs.length;
    $('#evYearBox').hidden = !D.events.length;
  }

  // evenimentele care corespund filtrelor, cele mai noi întâi
  function eventList() {
    return D.events.filter(function (e) {
      return (evs.year === 'all' || evDate(e).indexOf(evs.year) === 0) && (evs.prog === 'all' || e.prog === evs.prog);
    }).sort(function (a, b) { return evDate(b).localeCompare(evDate(a)); });
  }

  // un eveniment: data într-un pătrat bleumarin, apoi programul, locul, titlul și rezumatul; cu detalii sau legături, săgeata din dreapta le deschide pe loc
  function eventItem(e) {
    var iso = evDate(e);
    var d = iso.split('-').map(Number);
    var st = evStatus(e);
    var range = e.end ? T('până la %1', DG.fmtDate(e.end)) : !e.start ? T('data publicării') : e.time ? T('ora %1', e.time) : '';
    var more = (e.details && e.details.length) || (e.links && e.links.length);
    var mon = (I18n.MONTHS[LANG][d[1] - 1] || '').slice(0, 3);
    var mid = 'evm-' + e.id;
    return '<li class="event ' + st[0].replace('st-', 'is-') + '" id="' + esc(e.id) + '" data-open="false">' +
      '<time class="ev-date" datetime="' + esc(iso) + '"><span class="sr">' + esc(DG.fmtDate(iso)) + '</span><span class="d" aria-hidden="true">' + String(d[2]).padStart(2, '0') + '</span>' +
      '<span class="my" aria-hidden="true"><span class="m">' + esc(mon) + '</span> <span class="y">' + d[0] + '</span></span></time>' +
      '<div class="ev-body"><div class="ev-meta">' + (e.prog ? '<span class="prog">' + esc(e.prog) + '</span>' : '') + '<span class="status ' + st[0] + '">' + st[1] + '</span>' + (range ? '<span class="ev-range">' + esc(range) + '</span>' : '') + '</div>' +
      '<h3>' + esc(e.title) + '</h3>' + (e.place ? '<p class="ev-place">' + ico('pin') + '<span>' + esc(e.place) + '</span></p>' : '') + (e.summary ? '<p class="ev-sum">' + esc(e.summary) + '</p>' : '') +
      (more ? '<div class="ev-more" id="' + esc(mid) + '" role="region" aria-label="' + esc(T('Detalii')) + ': ' + esc(e.title) + '"><div class="ev-extra">' +
        (e.details && e.details.length ? '<ul>' + e.details.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        (e.links && e.links.length ? '<div class="ev-links">' + e.links.map(function (l) { return '<a class="btn btn-line btn-sm" href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.t) + ' ' + ico('ext') + '</a>'; }).join('') + '</div>' : '') + '</div></div>' : '') +
      editLink('events', e.id) + '</div>' +
      (more ? '<button class="ev-go" type="button" aria-expanded="false" aria-controls="' + esc(mid) + '" aria-label="' + esc(T('Detalii')) + ': ' + esc(e.title) + '">' + ico('arrow-r') + '</button>' : '') + '</li>';
  }

  function evToggle(li, force) {
    var b = $('.ev-go', li);
    if (!b) return;
    var open = force === undefined ? li.getAttribute('data-open') !== 'true' : !!force;
    li.setAttribute('data-open', String(open));
    b.setAttribute('aria-expanded', String(open));
  }

  function renderEvents() {
    renderEvFilters();
    var list = eventList();
    var shown = moreSlice('events', list);
    var tl = $('#timeline');
    tl.setAttribute('data-more', String(list.length > MORE.events.first));
    var html = '';
    var yr = '';
    shown.forEach(function (e) {
      var y = evDate(e).slice(0, 4);
      // anii se despart între ei doar când sunt afișați toți; cu un an ales, anul se vede deja în filtru
      if (y !== yr && evs.year === 'all') { yr = y; html += '<li class="tl-year" aria-hidden="true"><span class="tl-chip">' + esc(y) + '</span></li>'; }
      html += eventItem(e);
    });
    tl.innerHTML = html || '<li class="empty">' + (D.events.length ? 'Nu există evenimente pentru filtrele alese. <button class="btn btn-line btn-sm" type="button" id="evReset">Arată toate evenimentele</button>' : 'Nu există evenimente publicate.') + '</li>';
    moreBox('events');
  }

  function goEvent(id) {
    evs.year = 'all';
    evs.prog = 'all';
    limShow('events', eventList().map(function (e) { return e.id; }).indexOf(id));
    renderEvents();
    var li = document.getElementById(id);
    if (!li) return;
    evToggle(li, true);
    scrollToEl(li);
    li.classList.add('flash');
    setTimeout(function () { li.classList.remove('flash'); }, 1800);
  }

  /* ================= Galerie foto ================= */
  var gal = { album: 'all' };

  function galleryItems() {
    return D.gallery.filter(function (g) { return gal.album === 'all' || (g.album || '_') === gal.album; });
  }

  function renderGallery() {
    var albums = [];
    D.gallery.forEach(function (g) { var a = g.album || '_'; if (albums.indexOf(a) < 0) albums.push(a); });
    if (gal.album !== 'all' && albums.indexOf(gal.album) < 0) gal.album = 'all';
    $('#galChips').hidden = albums.length < 2;
    $('#galChips').innerHTML = chipsHtml([{ v: 'all', l: 'Toate', n: D.gallery.length }].concat(albums.map(function (a) {
      return { v: a, l: a === '_' ? 'Fără album' : a, n: D.gallery.filter(function (g) { return (g.album || '_') === a; }).length };
    })), gal.album, 'data-album');
    var items = galleryItems();
    var shown = moreSlice('gal', items);
    $('#galGrid').innerHTML = shown.length ? shown.map(function (g, i) {
      var label = g.title || T('Fotografie');
      return '<li class="g-item"><button class="g-btn" type="button" data-g="' + i + '"><span class="sr">Deschide fotografia: </span><span class="g-img"><img src="' + esc(g.file.thumb || g.file.path) + '" alt="" width="466" height="350" loading="lazy"></span>' +
        '<span class="g-zoom" aria-hidden="true">' + ico('zoom') + '</span><span class="g-cap"><strong>' + esc(label) + '</strong><span>' + esc([DG.fmtDate(g.date), g.album].filter(Boolean).join(' · ')) + '</span></span></button>' +
        (g.sample ? '<span class="g-sample">Imagine de exemplu</span>' : '') + editLink('gallery', g.id) + '</li>';
    }).join('') : '<li class="empty">Nu există fotografii publicate.' + (admin.on ? ' <a href="' + ADMIN + '#/gallery">Încărcați fotografii</a>.' : '') + '</li>';
    moreBox('gal');
  }

  var lb = { items: [], i: 0, el: null };

  function openLightbox(i) {
    lb.items = galleryItems();
    lb.i = i;
    var d = $('#lightbox');
    d.innerHTML = '<div class="lb"><div class="lb-top"><span id="lbCount" aria-live="polite"></span><button class="icon-btn" type="button" data-close aria-label="Închide">' + ico('close') + '</button></div>' +
      '<div class="lb-stage"><button class="lb-nav lb-prev" type="button" data-lb="-1" aria-label="Fotografia anterioară">' + ico('chev-l') + '</button><img id="lbImg" alt="">' +
      '<button class="lb-nav lb-next" type="button" data-lb="1" aria-label="Fotografia următoare">' + ico('chev-r') + '</button></div>' +
      '<div class="lb-cap"><strong id="lbTitle"></strong><span id="lbMeta"></span><a id="lbOpen" target="_blank" rel="noopener">Deschide imaginea originală</a></div></div>';
    lb.el = d;
    if (!d.open) d.showModal();
    showPhoto(0);
    $$('.lb-nav', d).forEach(function (b) { b.hidden = lb.items.length < 2; });
    var close = $('[data-close]', d);
    if (close) close.focus();
  }

  function showPhoto(step) {
    if (!lb.items.length) return;
    lb.i = (lb.i + step + lb.items.length) % lb.items.length;
    var g = lb.items[lb.i];
    var img = $('#lbImg');
    img.src = g.file.path;
    img.alt = g.alt || g.title || T('Fotografie din galerie');
    $('#lbCount').textContent = (lb.i + 1) + ' / ' + lb.items.length;
    $('#lbTitle').textContent = g.title || T('Fotografie');
    $('#lbTitle').hidden = !g.title;
    $('#lbMeta').textContent = [DG.fmtDate(g.date), g.album].filter(Boolean).join(' · ');
    $('#lbOpen').href = g.file.path;
    [1, -1].forEach(function (s) {
      var n = lb.items[(lb.i + s + lb.items.length) % lb.items.length];
      if (n) new Image().src = n.file.path;
    });
  }

  /* ================= Contacte ================= */
  var contactTo = '';
  var mapOn = false; // harta Google se încarcă doar după ce vizitatorul o cere (Google primește atunci adresa IP a vizitatorului)

  function mapFrame(src) {
    return '<iframe class="map" title="Harta: sediul Cancelariei de Stat, Chișinău" tabindex="-1" referrerpolicy="no-referrer-when-downgrade" src="' + esc(src) + '"></iframe>';
  }
  function mapGate(c) {
    return '<div class="map-gate"><span class="map-gate-ico">' + ico('pin') + '</span><div class="map-gate-body"><p class="map-gate-t">Harta sediului</p>' +
      '<p>Harta este furnizată de Google. Dacă o afișați, browserul dvs. se conectează la serverele Google, care primesc adresa IP și date tehnice despre dispozitiv. Până atunci nu se transmite nimic. Adresa sediului este scrisă mai jos, în text.</p>' +
      '<p class="map-gate-btns"><button class="btn btn-primary" type="button" id="mapLoad">Afișează harta</button>' +
      (c.mapLink ? '<a class="btn btn-line" href="' + esc(c.mapLink) + '" target="_blank" rel="noopener">Deschide în Google Maps ' + ico('ext') + '</a>' : '') + '</p></div></div>';
  }

  function renderContact() {
    var c = D.settings.contact || {};
    var emails = c.emails || [];
    contactTo = c.mailTo || (emails[0] && emails[0].addr) || '';
    // Fiecare bloc: eticheta (Adresa, Telefon …) și datele de contact.
    function item(title, body, icon) {
      return '<div class="ci"><span class="ci-ico" aria-hidden="true">' + ico(icon) + '</span><div><p class="ci-t">' + title + '</p><div class="ci-body">' + body + '</div></div></div>';
    }
    $('#contactInfo').innerHTML =
      (c.address ? item('Adresa', '<p>' + esc(c.address) + '</p>' + (c.mapLink ? '<p><a class="maplink" href="' + esc(c.mapLink) + '" target="_blank" rel="noopener">Deschide în Google Maps ' + ico('ext') + '</a></p>' : ''), 'pin') : '') +
      ((c.phones && c.phones.length) ? item('Telefon', '<p class="phones">' + c.phones.map(function (p) { return '<a href="' + esc(telHref(p)) + '">' + esc(p) + '</a>'; }).join('') + '</p>', 'phone') : '') +
      (emails.length ? item('E-mail', emails.map(function (m) { return '<p><a href="mailto:' + esc(m.addr) + '">' + esc(m.addr) + '</a>' + (m.note ? ' (' + esc(m.note) + ')' : '') + '</p>'; }).join(''), 'mail') : '') +
      (c.hotlinePhone ? item('Linia anticorupție', '<p><a href="' + esc(telHref(c.hotlinePhone)) + '">' + esc(c.hotlinePhone) + '</a>' + (c.hotlineHours ? ', ' + esc(c.hotlineHours) : '') + '</p>', 'phone') : '');
    var map = $('#contactMap');
    map.hidden = !c.mapEmbed;
    map.innerHTML = c.mapEmbed ? (mapOn ? mapFrame(c.mapEmbed) : mapGate(c)) : '';
    $('#toAddr').textContent = contactTo;
    $('#contactForm').hidden = !contactTo;
  }

  function setupForm() {
    var form = $('#contactForm');
    // „Subiect”: pastile cu o singură alegere; valoarea se păstrează în câmpul ascuns #fTopic
    $('#fTopicBox').addEventListener('click', function (e) {
      var b = e.target.closest('[data-topic]');
      if (!b) return;
      $('#fTopic').value = b.getAttribute('data-topic');
      $$('#fTopicBox [data-topic]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
    });
    $('#fTopicBox').addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var all = $$('#fTopicBox [data-topic]');
      var i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = all[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      n.focus();
      n.click();
    });
    function setErr(input, id, msg) {
      input.setAttribute('aria-invalid', String(!!msg));
      $('#' + id).textContent = msg || '';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#fName');
      var email = $('#fEmail');
      var msg = $('#fMsg');
      var ok = true;
      var bad = null;
      function check(el, err, cond, text) {
        if (!cond) { setErr(el, err, text); ok = false; bad = bad || el; } else setErr(el, err, '');
      }
      check(name, 'eName', name.value.trim().length >= 2, T('Introduceți numele și prenumele.'));
      check(email, 'eEmail', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()), T('Introduceți o adresă de e-mail validă, de forma nume@exemplu.md.'));
      check(msg, 'eMsg', msg.value.trim().length >= 10, T('Scrieți un mesaj de cel puțin 10 caractere.'));
      if (!ok) { bad.focus(); return; }
      var subject = '[' + $('#fTopic').value + '] ' + T('Mesaj de la %1', name.value.trim());
      var body = msg.value.trim() + '\n\n' + name.value.trim() + '\n' + email.value.trim();
      window.location.href = 'mailto:' + contactTo + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      var okEl = $('#formOk');
      okEl.hidden = false;
      okEl.textContent = T('Mesajul a fost deschis în aplicația de e-mail, adresat către %1. Trimiteți-l de acolo. Dacă nu s-a deschis nimic, scrieți direct la această adresă.', contactTo);
    });
  }

  /* ================= Subsol ================= */
  function renderFooter() {
    var s = D.settings;
    var c = s.contact || {};
    $('#footName').textContent = s.orgName;
    $('#footParent').textContent = s.parentName;
    $('#footAddress').textContent = c.address || '';
    $('#footNote').textContent = '© ' + new Date().getFullYear() + ' ' + (s.parentName || s.orgName || '') + (s.footerNote ? '. ' + s.footerNote : '');
  }

  /* ================= Căutare globală ================= */
  var INDEX = [];
  var sd = { items: [], sel: 0 };

  function buildIndex() {
    var idx = [];
    D.news.forEach(function (n) { idx.push({ cat: 'Noutăți', t: n.title, s: [DG.dateText(n), n.tag].filter(Boolean).join(' · '), k: (n.summary || '') + ' ' + (n.body || ''), go: function () { location.hash = '#stire/' + n.id; } }); });
    D.legal.forEach(function (l) { idx.push({ cat: 'Cadrul legal', t: lawName(l), s: l.title, k: 'HG lege ' + l.nr + ' ' + (l.topic || ''), u: l.url || (l.file && l.file.path) }); });
    D.documents.forEach(function (d) {
      var p = d.section === 'program' ? progOf(d.program) : null;
      idx.push({ cat: SECTION_LABEL[d.section] || 'Documente', t: d.title, s: [p ? p.name : '', docMeta(d)].filter(Boolean).join(', '), k: (d.description || '') + ' ' + (d.kind || ''), u: docHref(d) });
    });
    D.programs.forEach(function (p) { idx.push({ cat: 'Programe de cooperare', t: p.name, s: T((LEVELS[p.level] || LEVELS.inter).name) + ', ' + (p.strand || '') + '. ' + T('Deschide pagina programului'), k: 'interreg program ' + (p.desc || '') + ' ' + (ALIAS[p.id] || ''), go: function () { goProgram(p.id); } }); });
    (D.settings.duties || []).forEach(function (d, i) {
      if (d.text || (d.items && d.items.length)) idx.push({ cat: 'Despre direcție', t: d.title, s: T('Funcție de bază. Deschide atribuțiile'), k: (d.text || '') + ' ' + (d.items || []).join(' '), go: function () { goFunction(i); } });
    });
    D.events.forEach(function (e) { idx.push({ cat: 'Evenimente', t: e.title, s: [DG.fmtDate(evDate(e)), e.place].filter(Boolean).join(', '), k: (e.prog || '') + ' ' + e.summary, go: function () { goEvent(e.id); } }); });
    D.gallery.forEach(function (g) { idx.push({ cat: 'Galerie foto', t: g.title || T('Fotografie'), s: [DG.fmtDate(g.date), g.album].filter(Boolean).join(' · '), k: g.alt || '', go: function () { gal.album = 'all'; var i = D.gallery.indexOf(g); limShow('gal', i); renderGallery(); openLightbox(i); } }); });
    idx.push({ cat: 'Platforme', t: T('Platforma pentru gestionarea asistenței externe (AMP)'), s: 'amp.gov.md', k: 'aid management platform proiecte donatori', u: 'https://amp.gov.md/portal/' });
    [['Servicii publice', 'servicii.gov.md', 'portalul serviciilor publice servicii electronice'], ['Consultări publice', 'particip.gov.md', 'participare proiecte de acte normative'],
      ['Achiziții publice (MTender)', 'mtender.gov.md', 'licitații tenders contracte'], ['Cariere în sectorul public', 'cariere.gov.md', 'posturi vacante concursuri angajare'],
      ['Date deschise', 'date.gov.md', 'open data seturi de date'], ['Statistică', 'statistica.gov.md', 'Biroul Național de Statistică'],
      ['Baza de date statistice (Statbank)', 'statbank.statistica.md', 'statistici indicatori statbank Biroul Național de Statistică']].forEach(function (x) {
      idx.push({ cat: 'Portaluri oficiale', t: T(x[0]), s: x[1], k: x[2], u: 'https://' + x[1] });
    });
    idx.push({ cat: 'Contacte', t: T('Date de contact ale Cancelariei de Stat'), s: T('Adresă, telefon, e-mail, harta sediului'), k: 'contact adresa telefon e-mail program de lucru audiențe Piața Marii Adunări Naționale Chișinău', go: function () { location.hash = '#contacte'; } });
    idx.push({ cat: 'Portaluri oficiale', t: T('Petiții, cereri și audiențe'), s: 'gov.md', k: 'petiție cerere audiență plângere sesizare adresare', u: 'https://gov.md/ro/node/1030' });
    INDEX = idx;
  }

  function suggestions() {
    var out = [];
    var rep0 = docsOf('rapoarte')[0];
    if (rep0) out.push(INDEX.filter(function (x) { return x.t === rep0.title; })[0]);
    out.push(INDEX.filter(function (x) { return x.cat === 'Cadrul legal' && / 377\//.test(x.t); })[0]);
    out.push(INDEX.filter(function (x) { return x.cat === 'Programe de cooperare'; })[0]);
    out.push(INDEX.filter(function (x) { return x.cat === 'Verificarea cheltuielilor'; })[0]);
    out.push(INDEX.filter(function (x) { return x.cat === 'Platforme'; })[0]);
    return out.filter(Boolean);
  }

  function highlight(text, q) {
    var ts = DG.terms(q);
    if (!ts.length) return esc(text);
    var n = DG.norm(text);
    if (n.length !== text.length) return esc(text);
    var marks = new Array(text.length);
    ts.forEach(function (t) {
      var i = n.indexOf(t);
      while (i > -1) {
        for (var j = i; j < i + t.length; j++) marks[j] = true;
        i = n.indexOf(t, i + t.length);
      }
    });
    var out = '';
    var open = false;
    for (var k = 0; k < text.length; k++) {
      if (marks[k] && !open) { out += '<mark>'; open = true; }
      if (!marks[k] && open) { out += '</mark>'; open = false; }
      out += esc(text.charAt(k));
    }
    return out + (open ? '</mark>' : '');
  }

  // Rezultatele aceleiași categorii sunt aduse împreună, în ordinea în care apar categoriile.
  function groupByCategory(list) {
    var cats = [];
    list.forEach(function (x) { if (cats.indexOf(x.cat) < 0) cats.push(x.cat); });
    return cats.reduce(function (out, c) { return out.concat(list.filter(function (x) { return x.cat === c; })); }, []);
  }

  function runSearch() {
    var q = $('#sq').value.trim();
    sd.items = q ? groupByCategory(INDEX.filter(function (x) { return DG.matches(x.t + ' ' + x.s + ' ' + x.k + ' ' + x.cat, q); })).slice(0, 40) : suggestions();
    sd.sel = 0;
    var res = $('#sres');
    if (!sd.items.length) {
      res.innerHTML = '<div class="sd-empty">' + T('Niciun rezultat pentru „%1”. Încercați un număr de act (377), un program (URBACT, Dunărea) sau un an (2024).', esc(q)) + '</div>';
      $('#sq').removeAttribute('aria-activedescendant');
      return;
    }
    var html = q ? '' : '<div class="sd-group">Sugestii</div>';
    var cat = null;
    sd.items.forEach(function (x, i) {
      if (q && x.cat !== cat) { cat = x.cat; html += '<div class="sd-group">' + esc(cat) + '</div>'; }
      html += '<a class="sd-item' + (i === 0 ? ' sel' : '') + '" id="si-' + i + '" role="option" aria-selected="' + (i === 0) + '" data-i="' + i + '" href="' + (x.u ? esc(x.u) : '#') + '"' + (x.u ? ' target="_blank" rel="noopener"' : '') + '>' + highlight(x.t, q) + '<small>' + highlight(x.s || '', q) + '</small></a>';
    });
    res.innerHTML = html;
    $('#sq').setAttribute('aria-activedescendant', 'si-0');
  }

  function setSel(i) {
    if (!sd.items.length) return;
    sd.sel = (i + sd.items.length) % sd.items.length;
    $$('#sres .sd-item').forEach(function (a) {
      var on = Number(a.getAttribute('data-i')) === sd.sel;
      a.classList.toggle('sel', on);
      a.setAttribute('aria-selected', String(on));
    });
    var el = $('#si-' + sd.sel);
    el.scrollIntoView({ block: 'nearest' });
    $('#sq').setAttribute('aria-activedescendant', el.id);
  }

  function activate(i) {
    var x = sd.items[i];
    if (!x) return;
    if (x.u) window.open(x.u, '_blank', 'noopener');
    else {
      $('#searchDlg').close();
      x.go();
    }
  }

  function openSearch(q) {
    var d = $('#searchDlg');
    if (!d.open) d.showModal();
    $('#sq').value = q || '';
    runSearch();
    $('#sq').focus();
  }

  function setupSearch() {
    var d = $('#searchDlg');
    $('#sq').addEventListener('input', DG.debounce(runSearch, 60));
    $('#sq').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(sd.sel + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(sd.sel - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(sd.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); d.close(); } // în câmpurile de căutare, Esc ar șterge doar textul
    });
    $('#sres').addEventListener('click', function (e) {
      var a = e.target.closest('.sd-item');
      if (!a) return;
      var x = sd.items[Number(a.getAttribute('data-i'))];
      if (!x.u) { e.preventDefault(); activate(Number(a.getAttribute('data-i'))); }
    });
    $('#sres').addEventListener('mousemove', function (e) {
      var a = e.target.closest('.sd-item');
      if (a && Number(a.getAttribute('data-i')) !== sd.sel) setSel(Number(a.getAttribute('data-i')));
    });
    d.addEventListener('click', function (e) { if (isBackdropClick(d, e) || e.target.closest('[data-close]')) d.close(); });
    $('#openSearch').addEventListener('click', function () { openSearch(''); });
    $('#heroSearch').addEventListener('submit', function (e) { e.preventDefault(); openSearch($('#heroQ').value); });
    $('#kbdHint').textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K';
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = /INPUT|TEXTAREA|SELECT/.test(tag);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (d.open) d.close(); else openSearch('');
      } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        openSearch('');
      }
    });
  }

  /* ================= Bara administratorului ================= */
  function renderAdminBar() {
    var bar = $('#adminbar');
    if (!admin.on) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = '<div class="wrap adminbar-in"><strong>Mod administrator</strong><span>' + T('Conectat ca %1', esc(admin.user)) + '</span>' +
      '<a href="' + ADMIN + '">Panou de administrare</a><a href="' + ADMIN + '#/news/new">Adaugă știre</a><a href="' + ADMIN + '#/gallery">Adaugă fotografii</a><a href="' + ADMIN + '#/documents/new">Adaugă document</a>' +
      '<button class="sp" type="button" id="adminLogout">Ieșire</button></div>';
    $('#adminLogout').addEventListener('click', function () {
      if (GH) {
        ghForget();
        window.location.reload();
        return;
      }
      fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' }).then(function () { window.location.reload(); });
    });
  }

  // GitHub Pages nu are sesiune pe server: administratorul este cel care s-a conectat în panou cu jetonul GitHub,
  // păstrat de browser (doar numele contului este citit aici, nu și jetonul).
  var GH_STORES = ['localStorage', 'sessionStorage'];
  function ghKey() { return 'dgaefe.gh:' + GH; }
  function ghStored() {
    for (var i = 0; i < GH_STORES.length; i++) {
      try {
        var raw = window[GH_STORES[i]].getItem(ghKey());
        var v = raw && JSON.parse(raw);
        if (v && v.token) return { user: String(v.login || 'GitHub') };
      } catch (e) { /* stocarea poate fi blocată sau goală */ }
    }
    return null;
  }
  function ghForget() {
    for (var i = 0; i < GH_STORES.length; i++) {
      try { window[GH_STORES[i]].removeItem(ghKey()); } catch (e) { /* nimic de șters */ }
    }
  }

  function checkAdmin() {
    if (GH) {
      var st = ghStored();
      if (st) {
        admin = { on: true, user: st.user, csrf: '' };
        renderAdminBar();
        renderAll();
      }
      return;
    }
    if (STATIC || !window.fetch) return;
    fetch('/api/session', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
      if (s && s.authenticated) {
        admin = { on: true, user: s.user, csrf: s.csrf };
        renderAdminBar();
        renderAll();
      }
    }).catch(function () { /* vizitatorii obișnuiți nu au nevoie de sesiune */ });
  }

  /* ================= Accesibilitate, meniu, derulare ================= */
  function setupChrome() {
    var nav = $('#mainnav');
    var list = $('#navList');
    var toggle = $('#navToggle');
    var ov = $('#navOv');
    // Pe ecrane înguste meniul este un panou care se deschide din dreapta; pe computer este un rând sub antet.
    function setNav(open, back) {
      nav.classList.toggle('open', open);
      ov.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-lock', open);
      if (open) { var c = $('#navClose'); if (c) setTimeout(function () { c.focus(); }, 30); } else if (back) toggle.focus();
    }
    toggle.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    $('#navClose').addEventListener('click', function () { setNav(false, true); });
    ov.addEventListener('click', function () { setNav(false, true); });
    $$('a', list).forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
    // Esc închide meniul deschis și readuce cursorul pe butonul „Meniu”
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !nav.classList.contains('open') || document.querySelector('dialog[open]')) return;
      setNav(false, true);
    });
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 70rem)');
      var onWide = function () { if (wide.matches && nav.classList.contains('open')) setNav(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    }

    var ids = ['despre', 'plan-crestere', 'cadrul-legal', 'cooperare-externa', 'programe', 'documente', 'evenimente', 'noutati', 'galerie', 'contacte'];
    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) $$('a', list).forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-35% 0px -60% 0px' });
      ids.forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) $$('a', list).forEach(function (a) { a.classList.remove('on'); });
      }, { rootMargin: '-35% 0px -60% 0px' }).observe($('#top'));
    }

    // la tipărire (sau salvare PDF) listele cuprind toate elementele, nu doar primele, iar secțiunile pliate apar deschise
    var folded = [];
    var kept = null;
    window.addEventListener('beforeprint', function () {
      if (kept) return;
      kept = {};
      PRINT_ALL.forEach(function (k) { kept[k] = lim[k]; lim[k] = 1e9; MORE[k].draw(); });
      folded = $$('details:not([open])');
      folded.forEach(function (d) { d.open = true; });
    });
    window.addEventListener('afterprint', function () {
      folded.forEach(function (d) { d.open = false; });
      folded = [];
      if (!kept) return;
      PRINT_ALL.forEach(function (k) { if (kept[k] === undefined) delete lim[k]; else lim[k] = kept[k]; MORE[k].draw(); });
      kept = null;
    });

    var toTop = $('#toTop');
    window.addEventListener('scroll', function () { toTop.classList.toggle('show', window.scrollY > 900); }, { passive: true });
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); });
  }

  /* ================= Evenimente de interfață ================= */
  function setupEvents() {
    // noutăți
    ['#newsGrid', '#latestGrid'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var a = e.target.closest('[data-news]');
        if (!a) return;
        e.preventDefault();
        location.hash = '#stire/' + a.getAttribute('data-news');
      });
    });
    newsDlg = $('#newsDlg');
    newsDlg.addEventListener('click', function (e) {
      if (isBackdropClick(newsDlg, e) || e.target.closest('[data-close]')) { newsDlg.close(); return; }
      var c = e.target.closest('[data-copy-news]');
      if (c) DG.copyText(location.href.split('#')[0] + '#stire/' + c.getAttribute('data-copy-news'), T('Adresa știrii a fost copiată'));
    });
    // după închiderea unei știri, adresa revine la locul de unde s-a deschis: partea de sus (noutățile din prezentare) sau rubrica Noutăți
    var newsBack = '#noutati';
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#stire/"]');
      if (a) newsBack = a.closest('#heroNews') ? '#top' : '#noutati';
    }, true);
    newsDlg.addEventListener('close', function () {
      if (location.hash.indexOf('#stire/') === 0) history.replaceState(null, '', location.pathname + location.search + newsBack);
    });
    fnDlg = $('#fnDlg');
    fnDlg.addEventListener('click', function (e) {
      if (isBackdropClick(fnDlg, e) || e.target.closest('[data-close]')) fnDlg.close();
    });
    fnDlg.addEventListener('close', function () {
      if (location.hash.indexOf('#functie/') === 0) history.replaceState(null, '', location.pathname + location.search + '#despre');
    });

    // secțiuni care se deschid: funcții, drepturi și responsabilități, proiecte
    $('#main').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-acc]');
      if (!b) return;
      accToggle(b);
    });
    $('#aboutTabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) aboutTab(t.getAttribute('data-tab'));
    });
    $('#aboutTabs').addEventListener('keydown', function (e) {
      var k = e.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
      var tabs = $$('#aboutTabs [data-tab]').filter(function (t) { return !t.hidden; });
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      i = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      aboutTab(tabs[i].getAttribute('data-tab'), true);
    });
    // acte
    $('#lawChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      law.type = b.getAttribute('data-v');
      limReset('law');
      renderLegal();
      var again = $('#lawChips [data-v="' + law.type + '"]');
      if (again) again.focus();
    });
    $('#lawQ').addEventListener('input', DG.debounce(function (e) { law.q = e.target.value; limReset('law'); renderLegal(); }, 80));
    $('#lawSort').addEventListener('change', function (e) { law.sort = e.target.value; limReset('law'); renderLegal(); });
    $('#lawBody').addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy]');
      if (c) DG.copyText(c.getAttribute('data-copy'), T('Referința a fost copiată'));
      if (e.target.id === 'lawReset') {
        law.type = 'all'; law.q = ''; $('#lawQ').value = '';
        limReset('law');
        renderLegal();
        $('#lawQ').focus();
      }
    });

    // programe: filele pe niveluri
    var pt = $('#progTabs');
    function setLevel(lv) { progLevel = lv; renderPrograms(); var t = document.getElementById('ptab-' + lv); if (t) t.focus(); }
    pt.addEventListener('click', function (e) { var b = e.target.closest('[data-level]'); if (b) setLevel(b.getAttribute('data-level')); });
    pt.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
      var tabs = $$('[data-level]', pt);
      var i = tabs.map(function (t) { return t.getAttribute('data-level'); }).indexOf(progLevel);
      if (i < 0) return;
      e.preventDefault();
      var j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setLevel(tabs[j].getAttribute('data-level'));
    });

    // programe: scurtătura către documentele unui program
    $('#progGroups').addEventListener('click', function (e) {
      var b = e.target.closest('[data-prog-docs]');
      if (b) showProgramDocs(b.getAttribute('data-prog-docs'));
    });

    // harta Google (se încarcă doar la cerere)
    $('#contactMap').addEventListener('click', function (e) {
      if (!e.target.closest('#mapLoad')) return;
      var c = (D.settings && D.settings.contact) || {};
      if (!c.mapEmbed) return;
      mapOn = true;
      $('#contactMap').innerHTML = mapFrame(c.mapEmbed);
      var f = $('#contactMap iframe');
      if (f) f.focus();
    });

    // documente
    $('#docQ').addEventListener('input', DG.debounce(function (e) { docs.q = e.target.value; limReset('docs'); renderDocs(); }, 80));
    $('#docTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      docs.section = b.getAttribute('data-sec');
      limReset('docs');
      renderDocs();
      var again = $('#docTabs [data-sec="' + docs.section + '"]');
      if (again) again.focus();
    });
    $('#docProgram').addEventListener('change', function (e) { docs.program = e.target.value; limReset('docs'); renderDocs(); });
    $('#docYear').addEventListener('change', function (e) { docs.year = e.target.value; limReset('docs'); renderDocs(); });
    $('#docList').addEventListener('click', function (e) {
      if (e.target.id === 'docReset') {
        docs = { q: '', section: 'all', year: 'all', program: 'all' };
        limReset('docs');
        $('#docQ').value = '';
        renderDocs();
      }
    });

    // evenimente
    $('#evYearBox').parentNode.parentNode.addEventListener('click', function (e) {
      var b = e.target.closest('#evYear .chip, .ev-filters .chip');
      if (!b) return;
      if (b.hasAttribute('data-year')) evs.year = b.getAttribute('data-year'); else evs.prog = b.getAttribute('data-prog-f');
      limReset('events');
      renderEvents();
      var sel = b.hasAttribute('data-year') ? '[data-year="' + evs.year + '"]' : '[data-prog-f="' + evs.prog + '"]';
      var again = $('#evYear ' + sel + ', .ev-filters ' + sel);
      if (again) again.focus();
    });
    $('#timeline').addEventListener('click', function (e) {
      if (e.target.id === 'evReset') { evs.year = 'all'; evs.prog = 'all'; limReset('events'); renderEvents(); return; }
      var g = e.target.closest('.ev-go');
      if (g) evToggle(g.closest('.event'));
    });

    // galerie
    $('#galChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      gal.album = b.getAttribute('data-album');
      limReset('gal');
      renderGallery();
      var again = $('#galChips [data-album="' + gal.album + '"]');
      if (again) again.focus();
    });
    $('#galGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.g-btn');
      if (b) openLightbox(Number(b.getAttribute('data-g')));
    });
    var box = $('#lightbox');
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { box.close(); return; }
      var n = e.target.closest('[data-lb]');
      if (n) showPhoto(Number(n.getAttribute('data-lb')));
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(1); }
    });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) showPhoto(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ================= Adrese (#stire/…, #eveniment/…) ================= */
  function route() {
    var h = location.hash;
    var m = /^#stire\/([\w-]+)$/.exec(h);
    if (m) { openNews(m[1]); return; }
    if (newsDlg && newsDlg.open) newsDlg.close();
    m = /^#functie\/(\d+)$/.exec(h);
    if (m) { openFn(parseInt(m[1], 10)); return; }
    if (fnDlg && fnDlg.open) fnDlg.close();
    m = /^#eveniment\/([\w-]+)$/.exec(h);
    if (m) goEvent(m[1]);
    m = /^#program\/([\w-]+)$/.exec(h);
    if (m) goProgram(m[1]);
  }

  /* ================= Pornire ================= */
  function renderAll() {
    renderIntro();
    renderLatest();
    renderNews();
    renderInvestments();
    renderAbout();
    renderLegal();
    renderCoop();
    renderPrograms();
    renderDocs();
    renderEvents();
    renderGallery();
    renderContact();
    renderFooter();
    buildIndex();
  }

  // Textele puse în pagină de JavaScript (sau schimbate de el) se traduc pe loc, cu dicționarul interfeței; fără traducere rămân în română.
  function watchTranslations() {
    if (LANG === 'ro' || !I18n.hasUi(LANG) || !window.MutationObserver) return;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'characterData') I18n.translateDom(m.target, LANG);
        else Array.prototype.forEach.call(m.addedNodes, function (n) { I18n.translateDom(n, LANG); });
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // Comutatorul de limbă păstrează locul din pagină (#stire/…, #program/…): aceeași adresă, în altă limbă.
  function syncLangLinks() {
    $$('.lang a').forEach(function (a) {
      var base = a.getAttribute('data-base');
      if (base === null) { base = a.getAttribute('href').split('#')[0]; a.setAttribute('data-base', base); }
      a.setAttribute('href', base + location.hash);
    });
  }

  function init(data) {
    D = data;
    watchTranslations();
    syncLangLinks();
    window.addEventListener('hashchange', syncLangLinks);
    D.investments = D.investments || [];
    setupChrome();
    setupEvents();
    setupMore();
    setupChipRows();
    setupSearch();
    setupForm();
    renderAll();
    window.addEventListener('hashchange', route);
    route();
    // dacă adresa conține un ancoraj (#programe etc.), îl recalculăm după ce s-a construit conținutul
    if (location.hash && /^#[a-z-]+$/.test(location.hash) && document.getElementById(location.hash.slice(1))) {
      document.getElementById(location.hash.slice(1)).scrollIntoView();
    }
    checkAdmin();
  }

  // Înainte de date există doar structura; panourile de filtrare nu au sens fără conținut.
  setupProjectsFilm();
  loadData().then(init).catch(function (err) {
    if (window.console) console.error(err);
    showError();
  });
})();
