/* Pagina publică: preia datele (de la server sau încorporate în versiunea statică) și construiește secțiunile. */
(function () {
  'use strict';

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

  // Proiecte investiționale: ministerele (prescurtare → denumire completă) și abrevierile folosite în texte.
  var MINISTRY = {
    MEC: 'Ministerul Educației și Cercetării',
    MAIA: 'Ministerul Agriculturii și Industriei Alimentare',
    MIDR: 'Ministerul Infrastructurii și Dezvoltării Regionale',
    MDED: 'Ministerul Dezvoltării Economice și Digitalizării',
    MS: 'Ministerul Sănătății',
    MEN: 'Ministerul Energiei',
    MM: 'Ministerul Mediului',
    MC: 'Ministerul Culturii',
    MF: 'Ministerul Finanțelor',
    MJ: 'Ministerul Justiției'
  };
  // Pe cardurile din secțiunea „Proiecte investiționale” ministerul apare doar cu domeniul lui („Ministerul Energiei” → „Energie”).
  var MINISTRY_SHORT = {
    MEC: 'Educație',
    MAIA: 'Agricultură',
    MIDR: 'Infrastructură',
    MDED: 'Economie',
    MS: 'Sănătate',
    MEN: 'Energie',
    MM: 'Mediu',
    MC: 'Cultură',
    MF: 'Finanțe',
    MJ: 'Justiție'
  };
  // Abrevieri explicate sub lista de proiecte; se afișează numai cele care apar în textele proiectelor publicate (plus ministerele folosite).
  var ABBR = [
    ['AFD', 'Agenția Franceză de Dezvoltare'], ['AND', 'Administrația Națională a Drumurilor'], ['BEI', 'Banca Europeană de Investiții'],
    ['BERD', 'Banca Europeană pentru Reconstrucție și Dezvoltare'], ['CEB', 'Banca de Dezvoltare a Consiliului Europei'],
    ['CEF', 'Mecanismul pentru Interconectarea Europei'], ['EFSD+', 'Fondul european pentru dezvoltare durabilă Plus'], ['EUR', 'euro'],
    ['GEF', 'Fondul Global pentru Mediu'], ['IFAD', 'Fondul Internațional pentru Dezvoltare Agricolă'], ['MDL', 'leul moldovenesc'],
    ['MW', 'megawatt'], ['NIP', 'Platforma de Investiții pentru Vecinătate'],
    ['ONDIMP', 'Oficiul Național pentru Dezvoltarea Infrastructurii „Moldova-Proiect”'], ['PEEB', 'Programul Eficiența Energetică în Clădiri'],
    ['SACET', 'sistemul de alimentare centralizată cu energie termică'], ['TEN-T', 'rețeaua transeuropeană de transport'],
    ['TIC', 'tehnologia informației și comunicațiilor'], ['TVA', 'taxa pe valoarea adăugată'],
    ['UCIMPRSVV', 'Unitatea Consolidată pentru Implementarea și Monitorizarea Programului de Restructurare a Sectorului Vitivinicol'],
    ['UE', 'Uniunea Europeană'], ['USD', 'dolarul american'], ['USMF', 'Universitatea de Stat de Medicină și Farmacie „Nicolae Testemițanu”'],
    ['UTA', 'unitatea teritorială autonomă'], ['UTM', 'Universitatea Tehnică a Moldovei'], ['ÎPT', 'învățământul profesional tehnic']
  ];

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
    $('#introTitle').innerHTML = heroTitleHtml(s.heroTitle || s.orgName);
    $('#introLead').textContent = s.heroLead || '';
    // în locul textului de prezentare se derulează ultimele 10 noutăți (fără noutăți rămâne textul de prezentare)
    if (window.HeroNews) window.HeroNews.render($('#heroNews'), $('#introLead'), D.news, DG);
    document.title = s.orgName + ' | ' + s.parentName;
    var q = s.quickLinks || [];
    $('.quick').hidden = !q.length;
    $('#quickLinks').innerHTML = q.map(function (l) {
      var ext = isExternal(l.u);
      return '<li><a href="' + esc(l.u) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span>' + esc(l.t) + '</span>' + ico(ext ? 'ext' : 'arrow-r') + '</a></li>';
    }).join('');
  }

  /* ================= Diagrama nivelurilor de cooperare ================= */
  // Trei cadre încuibate în jurul Republicii Moldova: cu cât cadrul este mai larg, cu atât aria cooperării este mai mare.
  // Cadrele sunt straturi decorative (aria-hidden) așezate în aceeași grilă cu textele; pe ecrane late grila are patru coloane
  // (Republica Moldova, apoi cele trei niveluri, de la stânga la dreapta), pe ecrane înguste are un singur rând pe nivel.
  // Fiecare nivel își poartă propriul titlu și butoanele programelor, în aceeași ordine ca în secțiunea „Programe”.
  var ALIAS = { drp: 'Dunărea Dunăre Danube', bsb: 'Marea Neagră Black Sea' }; // forme pe care le caută oamenii și care nu apar în nume

  function shortName(p) { return p.short || p.name.replace(/^Interreg\s+(NEXT\s+)?/i, '').replace(/\s+20\d\d.*$/, ''); }
  function levelOf(p) { return LEVELS[p.level] ? p.level : 'inter'; }
  // „1 program”, „5 programe”, „20 de programe”
  function countRo(n, one, many) {
    if (LANG !== 'ro') return n + ' ' + plural(n, one, many);
    return n === 1 ? '1 ' + one : n + (n > 19 && (n % 100 === 0 || n % 100 > 19) ? ' de ' : ' ') + many;
  }

  function levelCaption(lv) {
    var list = D.programs.filter(function (p) { return levelOf(p) === lv; });
    var strands = [];
    list.forEach(function (p) { if (p.strand && strands.indexOf(p.strand) < 0) strands.push(p.strand); });
    return '<div class="lv-cap lv-cap-' + lv + '"><div class="lv-head"><h3 class="lv-name" id="lvh-' + lv + '">' + LEVELS[lv].name + '</h3>' +
      (strands.length ? '<span class="lv-strand">' + esc(strands.join(', ')) + '</span>' : '') + '</div>' +
      '<p class="lv-scope">' + LEVELS[lv].desc + '</p>' +
      (list.length ? '<ul class="lv-progs" aria-labelledby="lvh-' + lv + '">' + list.map(function (p) {
        return '<li><a class="lv-chip" href="#program/' + esc(p.id) + '" data-prog="' + esc(p.id) + '" title="' + esc(p.name) + '">' + esc(shortName(p)) + '<span class="sr">, vezi documentele</span></a></li>';
      }).join('') + '</ul>' : '') + '</div>';
  }

  function renderLevels() {
    var n = D.programs.length;
    $('#levels').innerHTML = '<div class="lvg">' +
      '<span class="lv lv-inter" aria-hidden="true"></span><span class="lv lv-trans" aria-hidden="true"></span><span class="lv lv-cross" aria-hidden="true"></span>' +
      '<div class="lv-core"><p class="lv-core-name">Republica Moldova</p>' +
      (n ? '<p class="lv-core-sub">' + T('Participă la %1 Interreg %2', countRo(n, 'program', 'programe'), '<span class="nb">2021–2027</span>', n) + '</p>' : '') + '</div>' +
      levelCaption('cross') + levelCaption('trans') + levelCaption('inter') + '</div>';
  }

  // Butonul unui program deschide secțiunea „Programe”; adresa #program/… rămâne bună de copiat sau de deschis într-o filă nouă.
  function onLevelClick(e) {
    var a = e.target.closest('[data-prog]');
    if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    var id = a.getAttribute('data-prog');
    if (location.hash === '#program/' + id) goProgram(id); else location.hash = '#program/' + id;
  }

  /* ================= Noutăți ================= */
  var newsShown = 6;

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

  function renderNews() {
    var list = D.news;
    var grid = $('#newsGrid');
    grid.innerHTML = list.length ? list.slice(0, newsShown).map(newsCard).join('') : '<p class="empty">Nu există noutăți publicate.' + (admin.on ? ' <a href="' + ADMIN + '#/news/new">Adăugați prima știre</a>.' : '') + '</p>';
    $('#newsMore').hidden = list.length <= newsShown;
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

  function syncFnToggle() {
    var btns = $$('#dutiesList .fn-btn');
    var all = btns.length > 0 && btns.every(function (b) { return b.getAttribute('aria-expanded') === 'true'; });
    var t = $('#fnToggle');
    t.hidden = !btns.length;
    t.textContent = all ? T('Închide toate') : T('Deschide toate');
    t.setAttribute('aria-pressed', String(all));
  }

  function renderAbout() {
    var s = D.settings;
    var duties = s.duties || [];
    var staff = s.structure || [];
    var total = staffTotal(staff);

    $('#aboutText').innerHTML = (s.aboutP1 ? '<p class="about-lead">' + esc(s.aboutP1) + '</p>' : '') + (s.aboutP2 ? '<p>' + esc(s.aboutP2) + '</p>' : '') +
      '<div class="about-cta"><a class="btn btn-primary" href="#cadrul-legal">Vezi cadrul legal</a><a class="btn btn-line" href="https://amp.gov.md/portal/" target="_blank" rel="noopener">Platforma AMP ' + ico('ext') + '</a></div>';

    var pr = s.principles || [];
    $('#aboutPrinc').hidden = !pr.length;
    $('#aboutPrinc').innerHTML = pr.length ? '<h3 id="h-princ">Principii de activitate</h3><ul>' + pr.map(function (x) { return '<li>' + ico('check-circle') + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' : '';

    // câteva cifre, calculate din datele paginii, ca să nu rămână în urmă când acestea se schimbă
    var stats = [];
    if (duties.length) stats.push(['#functii', duties.length, plural(duties.length, 'funcție de bază', 'funcții de bază')]);
    if (total) stats.push(['#structura', total, plural(total, 'unitate în structură', 'unități în structură')]);
    if (D.programs.length) stats.push(['#programe', D.programs.length, plural(D.programs.length, 'program de cooperare', 'programe de cooperare')]);
    if (D.investments.length) stats.push(['#plan-crestere', D.investments.length, plural(D.investments.length, 'proiect din Planul de creștere', 'proiecte din Planul de creștere')]);
    $('#aboutStats').hidden = !stats.length;
    $('#aboutStats').innerHTML = stats.map(function (x) { return '<li><a href="' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></a></li>'; }).join('');

    // funcțiile de bază: fiecare se deschide și arată textul funcției și atribuțiile (a, b, c …) prin care se realizează
    $('#functii').hidden = !duties.length;
    $('#dutiesList').innerHTML = duties.map(function (d, i) {
      var items = d.items || [];
      var key = 'fn:' + i;
      var open = !!accState[key];
      var has = !!(d.text || items.length);
      var head = '<span class="fn-no" aria-hidden="true">' + (i + 1) + '</span><span class="fn-t">' + esc(d.title) + '</span>' +
        '<span class="fn-n">' + (items.length ? countRo(items.length, 'atribuție', 'atribuții') : '') + '</span>';
      return '<li class="fn" data-open="' + open + '"><h4 class="fn-h">' + (has ?
          '<button class="fn-btn" type="button" id="fn-b-' + i + '" data-acc="' + key + '" aria-expanded="' + open + '" aria-controls="fn-p-' + i + '">' + head + '<span class="fn-chev">' + ico('chev-d') + '</span></button>' :
          '<span class="fn-btn fn-static">' + head + '<span></span></span>') + '</h4>' +
        (has ? '<div class="fn-panel" id="fn-p-' + i + '" role="region" aria-labelledby="fn-b-' + i + '">' +
          (d.text ? '<p class="fn-text">' + esc(d.text) + '</p>' : '') +
          (items.length ? '<p class="fn-sub">Atribuții</p><ol class="fn-items">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') + '</div>' : '') + '</li>';
    }).join('');
    syncFnToggle();

    // structura: câte un pătrat pentru fiecare unitate din statul de personal
    $('#structura').hidden = !staff.length;
    $('#orgChart').innerHTML = staff.length ? '<ul class="org">' + staff.map(function (r) {
      var n = parseInt(r.count, 10);
      var sq = '';
      if (n > 0 && n <= 40) for (var k = 0; k < n; k++) sq += '<i></i>';
      return '<li class="org-row"><span class="org-t">' + esc(r.title) + '</span><span class="org-sq" aria-hidden="true">' + sq + '</span><span class="org-n">' + esc(r.count) + '</span></li>';
    }).join('') + '</ul>' + (total ? '<p class="org-total">Efectivul direcției: <b>' + countRo(total, 'unitate', 'unități') + '</b></p>' : '') : '';

    var roles = [['Drepturile direcției', s.rights], ['Responsabilitățile direcției', s.responsibilities]].filter(function (r) { return r[1] && r[1].length; });
    $('#drepturi-responsabilitati').hidden = !roles.length;
    $('#rolesList').innerHTML = roles.map(function (r, i) {
      var key = 'role:' + i;
      var open = !!accState[key];
      return '<div class="acc" data-open="' + open + '"><h4 class="acc-h"><button class="acc-btn" type="button" id="role-b-' + i + '" data-acc="' + key + '" aria-expanded="' + open + '" aria-controls="role-p-' + i + '">' +
        '<span class="acc-t">' + r[0] + '</span><span class="fn-n">' + r[1].length + '</span><span class="fn-chev">' + ico('chev-d') + '</span></button></h4>' +
        '<div class="acc-panel" id="role-p-' + i + '" role="region" aria-labelledby="role-b-' + i + '"><ol class="num-list">' + r[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div></div>';
    }).join('');
  }

  function goFunction(i) {
    var b = document.getElementById('fn-b-' + i);
    if (!b) return;
    accToggle(b, true);
    syncFnToggle();
    scrollToEl(b.closest('.fn'));
    setTimeout(function () { b.focus({ preventScroll: true }); }, reduceMotion() ? 0 : 450);
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
    $('#lawBody').innerHTML = items.length ? items.map(function (l) {
      var open = '';
      if (l.url) open += '<a class="btn btn-primary btn-sm" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + (/legis\.md/.test(l.url) ? 'Deschide pe legis.md' : 'Deschide') + ' ' + ico('ext') + '</a>';
      if (l.file) open += '<a class="btn btn-line btn-sm" href="' + esc(l.file.path) + '" ' + (/\.pdf$/i.test(l.file.path) ? 'target="_blank" rel="noopener"' : 'download="' + esc(l.file.name || '') + '"') + '>' + ico('down') + ' Fișier</a>';
      return '<tr class="law-row"><td class="law-no"><span class="type">' + T((LAW_TYPE[l.type] || LAW_TYPE.Altele).one) + '</span><strong>' + T('nr.') + ' ' + esc(l.nr) + '/' + l.year + '</strong></td>' +
        '<td class="law-title">' + esc(l.title) + '</td><td class="law-topic">' + esc(l.topic || '') + '</td>' +
        '<td class="law-act"><button class="btn btn-line btn-sm" type="button" data-copy="' + esc(lawName(l) + ' „' + l.title + '”') + '">' + ico('copy') + ' Copiază</button> ' + open + editLink('legal', l.id) + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="4">' + T('Niciun act nu corespunde căutării%1. Încercați numărul actului (de exemplu 377) sau un cuvânt din titlu.', law.q ? ' „' + esc(law.q) + '”' : '') + ' <button class="btn btn-line btn-sm" type="button" id="lawReset">Arată toate actele</button></td></tr>';
  }

  /* ================= Proiecte investiționale ================= */
  // Proiectele din Planul de creștere, cu datele lor generale: ministerul responsabil, partenerul de finanțare, valoarea, perioada,
  // localizarea, obiectivul și rezultatele. Proiectele se grupează după ministerele care le promovează (un clic pe un minister
  // filtrează lista); numerele de sinteză se calculează din proiectele publicate, nu se scriu de mână.
  var inv = { min: 'all', q: '', sort: 'nr' };
  var NO_MIN = '-'; // grupa proiectelor fără minister

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  var MINISTRY_LC = Object.create(null);
  Object.keys(MINISTRY).forEach(function (k) { MINISTRY_LC[k.toLowerCase()] = k; MINISTRY_LC[MINISTRY[k].toLowerCase()] = k; });
  // Ministerul unui proiect, în forma din lista cunoscută (MIDR, chiar dacă s-a scris „midr” sau denumirea întreagă); unul necunoscut rămâne cum a fost scris.
  function minKey(p) {
    var m = String(p.ministry || '').trim().replace(/\s+/g, ' ');
    return m ? MINISTRY_LC[m.toLowerCase()] || m : NO_MIN;
  }
  function fullName(k) { return hasOwn(MINISTRY, k) ? MINISTRY[k] : ''; }
  function ministryShort(k) { return hasOwn(MINISTRY_SHORT, k) ? MINISTRY_SHORT[k] : ''; }
  // Numele de pe card: cel scurt („Energie”); un minister care nu este în listă rămâne așa cum a fost scris.
  function minName(k) { return k === NO_MIN ? 'Minister nespecificat' : ministryShort(k) || fullName(k) || k; }
  // Ministerele care promovează proiecte, cu numărul de proiecte al fiecăruia: cele cu mai multe proiecte primele.
  function ministries() {
    var by = Object.create(null);
    var out = [];
    D.investments.forEach(function (p) {
      var k = minKey(p);
      if (!by[k]) { by[k] = { k: k, name: minName(k), n: 0 }; out.push(by[k]); }
      by[k].n++;
    });
    return out.sort(function (a, b) { return (a.k === NO_MIN) - (b.k === NO_MIN) || b.n - a.n || a.name.localeCompare(b.name, LANG); });
  }
  function moneyParts(p) {
    if (p.amount === null || p.amount === undefined || p.amount === '') return null;
    return { qual: T(p.amountQual || ''), num: numRo(p.amount), unit: T('mil.') + ' ' + (p.currency || 'EUR') };
  }
  function moneyText(p) {
    var m = moneyParts(p);
    return m ? [m.qual, m.num, m.unit].filter(Boolean).join(' ') : '';
  }
  // „Banca Europeană de Investiții (BEI)” apare în listă ca „BEI”, cu denumirea întreagă în titlu; un text fără abreviere rămâne întreg.
  function finParts(f) {
    f = String(f || '').trim();
    var m = /^(.*\S)\s*\(([^()]{2,12})\)$/.exec(f);
    return m ? { short: m[2], full: m[1] } : { short: f, full: '' };
  }
  function invCmpOrder(a, b) { return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), LANG); }

  // Ministerele care promovează proiectele: câte proiecte are fiecare, iar un clic le filtrează în listă.
  function renderGpOverview() {
    var total = D.investments.length;
    var box = $('#gpOverview');
    var groups = ministries();
    if (inv.min !== 'all' && !groups.some(function (g) { return g.k === inv.min; })) inv.min = 'all';
    var card = function (key, n, name, abbr, full) {
      return '<li><button class="mn-card' + (key === 'all' ? ' mn-all' : '') + '" type="button" data-min="' + esc(key) + '"' + (full ? ' title="' + esc(full) + '"' : '') + ' aria-pressed="' + (inv.min === key) + '">' +
        '<span class="mn-num"><b>' + n + '</b><small>' + plural(n, 'proiect', 'proiecte') + '</small></span>' +
        '<span class="mn-name">' + esc(name) + '</span>' + (abbr ? '<span class="mn-abbr">' + esc(abbr) + '</span>' : '') + '</button></li>';
    };
    box.hidden = !total;
    box.innerHTML = !total ? '' :
      '<ol class="mn-cards" aria-labelledby="h-plan">' + card('all', total, 'Total', '', '') +
      groups.map(function (g) { return card(g.k, g.n, g.name, g.k !== NO_MIN && fullName(g.k) ? g.k : '', fullName(g.k)); }).join('') + '</ol>';
  }

  // Pe ecrane înguste filtrul se strânge sub butonul „Filtre”, care arată dacă este activ.
  function syncInvFilterBtn() {
    var active = inv.min !== 'all' ? 1 : 0;
    var b = $('#invFToggle');
    b.innerHTML = T('Filtre') + (active ? '<span class="n">' + active + '</span>' : '');
    b.setAttribute('aria-label', active ? T('Filtre, %1 activ', active) : T('Filtre'));
  }

  // „Deschide toate detaliile” / „Închide toate detaliile”, după starea proiectelor afișate acum.
  function syncInvToggle() {
    var btns = $$('#invList .inv-btn');
    var all = btns.length > 0 && btns.every(function (b) { return b.getAttribute('aria-expanded') === 'true'; });
    var t = $('#invToggle');
    t.hidden = !btns.length;
    t.textContent = all ? T('Închide toate detaliile') : T('Deschide toate detaliile');
    t.setAttribute('aria-pressed', String(all));
  }

  function invMatches(p) {
    var mk = minKey(p);
    if (inv.min !== 'all' && mk !== inv.min) return false;
    return DG.matches([p.name, p.ministry, fullName(mk), ministryShort(mk), p.financier, p.implementer, p.location].join(' '), inv.q);
  }

  function invSorted(items) {
    var out = items.slice();
    var amt = function (p) { return typeof p.amount === 'number' ? p.amount : -1; };
    if (inv.sort === 'valoare') out.sort(function (a, b) { return amt(b) - amt(a) || invCmpOrder(a, b); });
    else if (inv.sort === 'minister') {
      // în aceeași ordine ca în cardurile de deasupra listei
      var rank = Object.create(null);
      ministries().forEach(function (g, i) { rank[g.k] = i; });
      out.sort(function (a, b) { return rank[minKey(a)] - rank[minKey(b)] || invCmpOrder(a, b); });
    } else out.sort(invCmpOrder);
    return out;
  }

  function invBlock(title, text) {
    return text ? '<section class="inv-col"><h4>' + esc(title) + '</h4><div class="prose">' + DG.rich(text) + '</div></section>' : '';
  }

  function invPanel(p) {
    var mk = minKey(p);
    var money = moneyText(p);
    var facts = [];
    if (mk !== NO_MIN) facts.push(['Ministerul responsabil', fullName(mk) ? esc(T(fullName(mk))) + ' (' + esc(mk) + ')' : esc(mk)]);
    if (p.implementer) facts.push(['Instituția de implementare', esc(p.implementer)]);
    if (p.financier) facts.push(['Partenerul de finanțare', esc(p.financier)]);
    if (money) facts.push(['Valoarea indicativă', esc(money)]);
    if (p.period) facts.push(['Perioada de implementare', esc(p.period)]);
    if (p.location) facts.push(['Localizarea', esc(p.location)]);
    if (p.beneficiaries) facts.push(['Beneficiarii', esc(p.beneficiaries)]);
    var res = (p.results || []).filter(Boolean);
    var text = invBlock('Obiectivul și descrierea proiectului', p.text) +
      (res.length ? '<section class="inv-col"><h4>Rezultate preconizate</h4><ul class="inv-res">' + res.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></section>' : '') +
      invBlock('Structura finanțării', p.financing);
    var links = (p.links || []).map(function (l) { return '<a class="btn btn-line btn-sm" href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.t) + ' ' + ico('ext') + '</a>'; }).join('');
    return '<div class="inv-panel" id="invp-' + esc(p.id) + '" role="region" aria-labelledby="invb-' + esc(p.id) + '">' +
      (text || facts.length ? '<div class="inv-body' + (text && facts.length ? '' : ' inv-solo') + '">' +
        (text ? '<div class="inv-text">' + text + '</div>' : '') +
        (facts.length ? '<dl class="inv-facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>' : '') +
      '</div>' : '') +
      '<div class="inv-act"><button class="btn btn-line btn-sm" type="button" data-copy-inv="' + esc(p.id) + '">' + ico('link') + ' Copiază adresa proiectului</button>' + links + editLink('investments', p.id) + '</div></div>';
  }

  function invItem(p) {
    var mk = minKey(p);
    var fin = finParts(p.financier);
    var m = moneyParts(p);
    var key = 'inv:' + p.id;
    var open = !!accState[key];
    var finHtml = !fin.short ? '' : fin.full ? '<abbr title="' + esc(fin.full) + '">' + esc(fin.short) + '</abbr>' : esc(fin.short);
    return '<li class="inv" id="proiect-' + esc(p.id) + '" data-open="' + open + '"><h3 class="inv-h">' +
      '<button class="inv-btn' + (fin.short.length > 6 ? ' fl' : '') + '" type="button" id="invb-' + esc(p.id) + '" data-acc="' + key + '" aria-expanded="' + open + '" aria-controls="invp-' + esc(p.id) + '">' +
      '<span class="inv-no">' + (p.order || '') + '</span>' +
      '<span class="inv-main"><span class="inv-name">' + esc(p.name) + '</span><span class="inv-sub">' +
        (mk !== NO_MIN ? '<span class="inv-min">' + esc(mk) + '</span>' + (fullName(mk) ? '<span class="inv-minname">' + esc(fullName(mk)) + '</span>' : '') : '') + '</span></span>' +
      '<span class="inv-fin">' + (finHtml ? '<span class="lbl">Partener: </span>' + finHtml : '') + '</span>' +
      '<span class="inv-val">' + (m ? '<span class="sr">Valoare: </span>' + (m.qual ? '<small>' + esc(m.qual) + '</small> ' : '') + '<b>' + esc(m.num) + '</b> <small>' + esc(m.unit) + '</small>' : '') + '</span>' +
      '<span class="inv-chev">' + ico('chev-d') + '</span></button></h3>' + invPanel(p) + '</li>';
  }

  function renderInvList() {
    var all = D.investments;
    var items = invSorted(all.filter(invMatches));
    $('#invCount').textContent = items.length === all.length ? all.length + ' ' + plural(all.length, 'proiect', 'proiecte') : T('%1 din %2', items.length, all.length) + ' ' + plural(all.length, 'proiect', 'proiecte');
    $('#invHead').hidden = !items.length;
    $('#invList').innerHTML = items.length ? items.map(invItem).join('') :
      '<li class="empty">' + (all.length ? 'Niciun proiect nu corespunde filtrelor alese. <button class="btn btn-line btn-sm" type="button" id="invReset">Arată toate proiectele</button>' :
        'Nu există proiecte publicate.' + (admin.on ? ' <a href="' + ADMIN + '#/investments/new">Adăugați primul proiect</a>.' : '')) + '</li>';
    syncInvToggle();
  }

  // Cuvântul întreg (abrevierile se scriu cu majuscule): „AND” nu se caută în „CANDID”.
  function hasWord(text, w) {
    var letter = /[0-9A-Za-z\u0400-\u04FFĂÂÎȘȚŞŢăâîșțşţ]/;
    var i = text.indexOf(w);
    while (i >= 0) {
      if (!letter.test(i === 0 ? '' : text.charAt(i - 1)) && !letter.test(text.charAt(i + w.length))) return true;
      i = text.indexOf(w, i + 1);
    }
    return false;
  }
  function abbrList() {
    var text = D.investments.map(function (p) {
      return [p.name, p.implementer, p.financier, p.financing, p.period, p.location, p.beneficiaries, p.text].concat(p.results || []).join(' \n ');
    }).join(' \n ');
    var list = ABBR.map(function (a) { return [T(a[0]), T(a[1])]; }).filter(function (a) { return hasWord(text, a[0]); });
    Object.keys(MINISTRY).forEach(function (m) {
      if (D.investments.some(function (p) { return minKey(p) === m; })) list.push([T(m), T(MINISTRY[m])]);
    });
    return list.sort(function (a, b) { return a[0].localeCompare(b[0], LANG); });
  }

  function renderGpFoot() {
    var g = D.settings.growth || {};
    var src = (g.sources || []).filter(function (x) { return x && x.u; });
    var abbr = abbrList();
    $('#gpFoot').innerHTML =
      (g.note ? '<div class="gp-note">' + ico('info') + '<p>' + esc(g.note) + '</p></div>' : '') +
      (src.length ? '<p class="gp-src">Surse: ' + src.map(function (x) { return '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.t || x.u) + '</a>'; }).join(', ') + '</p>' : '') +
      (abbr.length ? '<details class="fold"><summary>Abrevieri folosite în descrierile proiectelor</summary><dl class="abbr-list">' + abbr.map(function (a) {
        return '<div><dt>' + esc(a[0]) + '</dt><dd>' + esc(a[1]) + '</dd></div>';
      }).join('') + '</dl></details>' : '');
  }

  function renderInvestments() {
    var show = D.investments.length > 0 || admin.on;
    $('#plan-crestere').hidden = !show;
    $$('a[href="#plan-crestere"]', $('#navList')).concat($$('.foot a[href="#plan-crestere"]')).forEach(function (a) { if (a.parentNode.tagName === 'LI') a.parentNode.hidden = !show; });
    if (!show) return;
    var g = D.settings.growth || {};
    $('#growthAsOf').textContent = g.asOf ? T('Date actualizate la %1.', DG.fmtDate(g.asOf)) : '';
    $('#growthAsOf').hidden = !g.asOf;
    $('#invQ').value = inv.q;
    $('#invSort').value = inv.sort;
    renderGpOverview();
    syncInvFilterBtn();
    renderInvList();
    renderGpFoot();
  }

  // Filtrul se schimbă fără a redesena tot: se actualizează cifrele, lista și starea butonului.
  function refreshInv() {
    renderGpOverview();
    syncInvFilterBtn();
    renderInvList();
  }

  // Filtrul ascuns (pe ecrane înguste) se deschide din butonul „Filtre”.
  function setInvFilters(open) {
    $('#invCtl').setAttribute('data-open', String(open));
    $('#invFToggle').setAttribute('aria-expanded', String(open));
  }

  function goInvestment(id) {
    var p = byId(D.investments, id);
    if (!p) return;
    if (!invMatches(p)) { inv.min = 'all'; inv.q = ''; $('#invQ').value = ''; refreshInv(); }
    accState['inv:' + id] = true;
    refreshInv();
    var li = document.getElementById('proiect-' + id);
    if (!li) return;
    scrollToEl(li);
    li.classList.add('flash');
    setTimeout(function () { li.classList.remove('flash'); }, 1800);
    var b = $('.inv-btn', li);
    if (b) setTimeout(function () { b.focus({ preventScroll: true }); }, reduceMotion() ? 0 : 450);
  }

  /* ================= Cooperare externă ================= */
  var rep = { year: null };

  function renderCoop() {
    var reports = docsOf('rapoarte');
    var years = [];
    reports.forEach(function (d) { var y = docYear(d); if (y && years.indexOf(y) < 0) years.push(y); });
    years.sort(function (a, b) { return b - a; });
    if (!rep.year || years.indexOf(rep.year) < 0) rep.year = years[0] || null;

    $('#years').hidden = !years.length;
    $('#years').innerHTML = years.map(function (y) {
      var on = y === rep.year;
      return '<button class="year" type="button" role="tab" id="tab-' + y + '" aria-controls="reportPanel" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-y="' + y + '">' + y + '</button>';
    }).join('');

    var panel = $('#reportPanel');
    if (!rep.year) {
      panel.removeAttribute('aria-labelledby');
      panel.innerHTML = '<p class="empty">Nu există rapoarte publicate.</p>';
    } else {
      panel.setAttribute('aria-labelledby', 'tab-' + rep.year);
      var items = reports.filter(function (d) { return docYear(d) === rep.year; });
      panel.innerHTML = '<div class="rp-year">' + rep.year + '</div><div>' + items.map(function (d, i) {
        return '<div class="rp-item"><h4>' + titleHtml(d) + '</h4><p>' + esc([i === 0 && rep.year === years[0] ? T('Cel mai recent raport publicat') : '', docMeta(d)].filter(Boolean).join('. ') || T('Document publicat')) + '</p>' +
          '<div class="rp-docs"><a class="btn btn-primary"' + docAttrs(d) + '>' + ico(d.file ? 'down' : 'ext') + ' Deschide documentul</a>' + editLink('documents', d.id) + '</div></div>';
      }).join('') + '</div>';
    }

    var acord = docsOf('acord-ro').sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    $('#acordBox').innerHTML = '<h3>Acordul cu Guvernul României</h3><p class="amount">100 mil. EUR</p>' +
      '<p class="panel-intro">Program de asistență tehnică și financiară, în baza unui ajutor financiar nerambursabil acordat de România Republicii Moldova. Documentele sunt ordonate după etapele de implementare.</p>' +
      (acord.length ? '<ol class="steps">' + acord.map(function (d) {
        return '<li><a' + docAttrs(d) + '><span>' + titleHtml(d) + '</span>' + ico(d.file ? 'down' : 'ext') + '</a></li>';
      }).join('') + '</ol>' : '<p class="empty">Nu există documente publicate.</p>');
  }

  /* ================= Programe ================= */
  var prog = { id: null, group: 'all' };

  function progDocs(p) { return D.documents.filter(function (d) { return d.section === 'program' && d.program === p.id; }).sort(cmpDocs); }

  // Pictograma nivelului: aceleași cadre încuibate ca în diagrama de pe prima pagină; cadrul nivelului programului este desenat apăsat.
  function levelGlyph(lv, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 44 44" aria-hidden="true" class="lglyph">' +
      [['inter', 3, 38, 3], ['trans', 10, 24, 2.5], ['cross', 17, 10, 2]].map(function (f) {
        var on = f[0] === lv;
        return '<rect x="' + f[1] + '" y="' + f[1] + '" width="' + f[2] + '" height="' + f[2] + '" rx="' + f[3] + '" fill="none" stroke="currentColor" stroke-width="' + (on ? 3 : 1.4) + '" opacity="' + (on ? 1 : 0.45) + '"/>';
      }).join('') + '<rect x="20" y="20" width="4" height="4" rx="1" fill="currentColor"/></svg>';
  }

  function renderProgNav() {
    // câte o listă de file (role="tablist") pentru fiecare nivel, cu titlul nivelului drept nume; un titlu nu poate sta direct într-o listă de file
    $('#progNav').innerHTML = LEVEL_ORDER.map(function (lv) {
      var list = D.programs.filter(function (p) { return p.level === lv; });
      if (!list.length) return '';
      return '<div class="prog-lv"><h4 id="pgh-' + lv + '">' + LEVELS[lv].name + '</h4><div class="prog-tabs" role="tablist" aria-labelledby="pgh-' + lv + '" aria-orientation="vertical">' + list.map(function (p) {
        var on = p.id === prog.id;
        var n = progDocs(p).length;
        return '<button class="prog-btn" type="button" role="tab" id="ptab-' + esc(p.id) + '" aria-controls="progPanel" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-id="' + esc(p.id) + '"><span>' + esc(shortName(p)) + '</span><span class="pcount">' + n + '<span class="sr"> ' + plural(n, 'document', 'documente') + '</span></span></button>';
      }).join('') + '</div></div>';
    }).join('');
  }

  function renderProg() {
    var p = progOf(prog.id);
    var panel = $('#progPanel');
    if (!p) { panel.innerHTML = '<p class="empty">Nu există programe.</p>'; return; }
    panel.setAttribute('aria-labelledby', 'ptab-' + p.id);
    var all = progDocs(p);
    var groups = [];
    all.forEach(function (d) { if (groups.indexOf(d.group) < 0) groups.push(d.group); });
    var docs = all;
    var chips = '';
    if (groups.length > 1) {
      var order = ['buletin', 'oficial', 'stiri', ''].filter(function (g) { return groups.indexOf(g) > -1; });
      var active = prog.group === '_' ? '' : prog.group;
      if (prog.group !== 'all' && groups.indexOf(active) < 0) prog.group = 'all';
      chips = '<div class="chips" role="group" aria-label="Tipul documentului">' + chipsHtml([{ v: 'all', l: 'Toate', n: all.length }].concat(order.map(function (g) {
        return { v: g || '_', l: GROUP_LABEL[g], n: all.filter(function (d) { return d.group === g; }).length };
      })), prog.group, 'data-g') + '</div>';
      if (prog.group !== 'all') docs = all.filter(function (d) { return d.group === (prog.group === '_' ? '' : prog.group); });
    }
    panel.innerHTML =
      '<div class="prog-top">' + levelGlyph(p.level, 60) + '<div><h3 tabindex="-1" id="progTitle">' + esc(p.name) + '</h3><div class="meta"><span class="tag">' + (LEVELS[p.level] || LEVELS.inter).name + '</span>' +
      (p.strand ? '<span class="tag">' + esc(p.strand) + '</span>' : '') + (p.site ? '<a href="' + esc(p.site) + '" target="_blank" rel="noopener">Site-ul oficial ' + ico('ext') + '</a>' : '') + '</div></div></div>' +
      '<div class="prog-body"><p class="prog-desc">' + esc(p.desc || '') + '</p>' +
      ((p.facts && p.facts.length) ? '<div class="facts">' + p.facts.map(function (f) { return '<div class="fact"><b>' + esc(f.b) + '</b>' + esc(f.t) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="docs-head"><h4>' + T('Documente (%1)', all.length) + '</h4>' + chips + '</div>' +
      (docs.length ? '<ul class="docs">' + docs.map(function (d) { return docItem(d, false); }).join('') + '</ul>' : '<p class="empty">Nu există documente publicate pentru acest program.</p>') + '</div>';
  }

  function docItem(d, showSection) {
    var sec = '';
    if (showSection) {
      var p = d.section === 'program' ? progOf(d.program) : null;
      sec = '<span class="doc-sec">' + esc(p ? shortName(p) : SECTION_LABEL[d.section] || '') + '</span>';
    }
    return '<li class="doc-item"><a class="doc"' + docAttrs(d) + '>' + ftBadge(d) + '<span class="doc-t">' + titleHtml(d) + '<small>' + esc(docMeta(d)) + '</small></span>' +
      (showSection ? sec : '') + ico(d.file ? 'down' : 'ext') + '</a>' + editLink('documents', d.id) + '</li>';
  }

  function renderPrograms() {
    if (!prog.id || !progOf(prog.id)) prog.id = D.programs.length ? D.programs[0].id : null;
    renderProgNav();
    renderProg();
    var aud = docsOf('auditori');
    $('#auditBox').innerHTML = aud.map(function (d) {
      return '<div class="callout callout-amber"><p><strong>Verificarea cheltuielilor.</strong> ' + esc(d.title) + (docMeta(d) ? '<small>' + esc(docMeta(d)) + '</small>' : '') + '</p><div class="btns"><a class="btn btn-primary"' + docAttrs(d) + '>' + ico(d.file ? 'down' : 'ext') + ' ' + (d.file ? 'Descarcă' : 'Deschide') + '</a>' + editLink('documents', d.id) + '</div></div>';
    }).join('');
  }

  function selectProgram(id) { prog.id = id; prog.group = 'all'; renderProgNav(); renderProg(); }
  function goProgram(id) {
    if (!progOf(id)) return;
    selectProgram(id);
    // Schema „pe niveluri” și lista de programe sunt în aceeași secțiune: se derulează la programul ales, nu la începutul secțiunii.
    scrollToEl($('.prog') || $('#programe'));
    setTimeout(function () { var t = $('#progTitle'); if (t) t.focus({ preventScroll: true }); }, reduceMotion() ? 0 : 450);
  }

  /* ================= Biblioteca de documente ================= */
  var docs = { q: '', section: 'all', year: 'all', shown: 15 };

  function renderDocFilters() {
    var secs = Object.keys(SECTION_LABEL).filter(function (k) { return D.documents.some(function (d) { return d.section === k; }); });
    $('#docSection').innerHTML = '<option value="all">Toate secțiunile</option>' + secs.map(function (k) {
      return '<option value="' + k + '"' + (docs.section === k ? ' selected' : '') + '>' + SECTION_LABEL[k] + '</option>';
    }).join('');
    var years = [];
    D.documents.forEach(function (d) { var y = docYear(d); if (y && years.indexOf(y) < 0) years.push(y); });
    years.sort(function (a, b) { return b - a; });
    $('#docYear').innerHTML = '<option value="all">Toți anii</option>' + years.map(function (y) {
      return '<option value="' + y + '"' + (String(docs.year) === String(y) ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
  }

  function renderDocs() {
    renderDocFilters();
    var items = D.documents.filter(function (d) {
      if (docs.section !== 'all' && d.section !== docs.section) return false;
      if (docs.year !== 'all' && String(docYear(d)) !== String(docs.year)) return false;
      var p = d.section === 'program' ? progOf(d.program) : null;
      return DG.matches([d.title, d.kind, d.description, SECTION_LABEL[d.section], p ? p.name : '', DG.dateText(d), docYear(d) || '', d.en ? 'engleza english' : ''].join(' '), docs.q);
    }).sort(cmpDocs);
    $('#docCount').textContent = T('%1 din %2 documente', items.length, D.documents.length);
    $('#docList').innerHTML = items.length ? items.slice(0, docs.shown).map(function (d) { return docItem(d, true); }).join('') :
      '<li class="empty">Niciun document nu corespunde filtrelor alese. <button class="btn btn-line btn-sm" type="button" id="docReset">Arată toate documentele</button></li>';
    $('#docMore').hidden = items.length <= docs.shown;
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
    $('.ev-filters').hidden = !D.events.length;
  }

  function renderEvents() {
    renderEvFilters();
    var list = D.events.filter(function (e) {
      return (evs.year === 'all' || evDate(e).indexOf(evs.year) === 0) && (evs.prog === 'all' || e.prog === evs.prog);
    }).sort(function (a, b) { return evDate(b).localeCompare(evDate(a)); });
    $('#timeline').innerHTML = list.length ? list.map(function (e) {
      var d = evDate(e).split('-').map(Number);
      var st = evStatus(e);
      var range = e.end ? T('până la %1', DG.fmtDate(e.end)) : !e.start ? T('data publicării') : e.time ? T('ora %1', e.time) : '';
      var more = (e.details && e.details.length) || (e.links && e.links.length);
      return '<li class="event" id="' + esc(e.id) + '"><div class="ev-date"><div class="d">' + String(d[2]).padStart(2, '0') + '</div><div class="m">' + I18n.MONTHS[LANG][d[1] - 1] + ' ' + d[0] + '</div>' + (range ? '<div class="r">' + esc(range) + '</div>' : '') + '</div>' +
        '<div><div class="ev-meta"><span class="status ' + st[0] + '">' + st[1] + '</span>' + (e.prog ? '<span class="tag">' + esc(e.prog) + '</span>' : '') + (e.place ? '<span>' + esc(e.place) + '</span>' : '') + '</div>' +
        '<h3>' + esc(e.title) + '</h3><p>' + esc(e.summary) + '</p>' +
        (more ? '<details class="ev-more"><summary>Detalii</summary>' +
          (e.details && e.details.length ? '<ul>' + e.details.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          (e.links && e.links.length ? '<div class="ev-links">' + e.links.map(function (l) { return '<a class="btn btn-line btn-sm" href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.t) + ' ' + ico('ext') + '</a>'; }).join('') + '</div>' : '') + '</details>' : '') +
        editLink('events', e.id) + '</div></li>';
    }).join('') : '<li class="empty">' + (D.events.length ? 'Nu există evenimente pentru filtrele alese. <button class="btn btn-line btn-sm" type="button" id="evReset">Arată toate evenimentele</button>' : 'Nu există evenimente publicate.') + '</li>';
  }

  function goEvent(id) {
    evs.year = 'all';
    evs.prog = 'all';
    renderEvents();
    var li = document.getElementById(id);
    if (!li) return;
    var det = $('details', li);
    if (det) det.open = true;
    scrollToEl(li);
    li.classList.add('flash');
    setTimeout(function () { li.classList.remove('flash'); }, 1800);
  }

  /* ================= Galerie foto ================= */
  var gal = { album: 'all', shown: 12 };

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
    $('#galGrid').innerHTML = items.length ? items.slice(0, gal.shown).map(function (g, i) {
      var label = g.title || T('Fotografie');
      return '<li class="g-item"><button class="g-btn" type="button" data-g="' + i + '"><span class="sr">Deschide fotografia: </span><span class="g-img"><img src="' + esc(g.file.thumb || g.file.path) + '" alt="" width="466" height="350" loading="lazy"></span>' +
        '<span class="g-cap"><strong>' + esc(label) + '</strong><span>' + esc([DG.fmtDate(g.date), g.album].filter(Boolean).join(' · ')) + '</span></span></button>' +
        (g.sample ? '<span class="g-sample">Imagine de exemplu</span>' : '') + editLink('gallery', g.id) + '</li>';
    }).join('') : '<li class="empty">Nu există fotografii publicate.' + (admin.on ? ' <a href="' + ADMIN + '#/gallery">Încărcați fotografii</a>.' : '') + '</li>';
    $('#galMore').hidden = items.length <= gal.shown;
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
    // Fiecare rând: pătrat albastru cu pictogramă, titlu și text (ca pe ie.mf.gov.md).
    function item(icon, title, body) {
      return '<div class="ci"><span class="ci-ico">' + ico(icon) + '</span><div class="ci-body"><p class="ci-t">' + title + '</p>' + body + '</div></div>';
    }
    $('#contactInfo').innerHTML =
      (c.address ? item('pin', 'Adresa', '<p>' + esc(c.address) + '</p>' + (c.mapLink ? '<p><a class="maplink" href="' + esc(c.mapLink) + '" target="_blank" rel="noopener">Deschide în Google Maps ' + ico('ext') + '</a></p>' : '')) : '') +
      ((c.phones && c.phones.length) ? item('phone', 'Telefon', '<p class="phones">' + c.phones.map(function (p) { return '<a href="' + esc(telHref(p)) + '">' + esc(p) + '</a>'; }).join('') + '</p>') : '') +
      (emails.length ? item('mail', 'E-mail', '<p>' + emails.map(function (m) { return '<a href="mailto:' + esc(m.addr) + '">' + esc(m.addr) + '</a>' + (m.note ? ' (' + esc(m.note) + ')' : ''); }).join('<br>') + '</p>') : '') +
      (c.hotlinePhone ? item('shield', 'Linia anticorupție', '<p><a href="' + esc(telHref(c.hotlinePhone)) + '">' + esc(c.hotlinePhone) + '</a>' + (c.hotlineHours ? ', ' + esc(c.hotlineHours) : '') + '</p>') : '');
    var map = $('#contactMap');
    map.hidden = !c.mapEmbed;
    map.innerHTML = c.mapEmbed ? (mapOn ? mapFrame(c.mapEmbed) : mapGate(c)) : '';
    $('#toAddr').textContent = contactTo;
    $('#contactForm').hidden = !contactTo;
  }

  function setupForm() {
    var form = $('#contactForm');
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
    D.investments.forEach(function (p) {
      var mk = minKey(p);
      idx.push({ cat: 'Investiții', t: p.name, s: [mk !== NO_MIN && mk, moneyText(p), finParts(p.financier).short].filter(Boolean).join(' · '), k: [fullName(mk), ministryShort(mk), p.financier, p.implementer, p.location, p.text, (p.results || []).join(' ')].join(' '), go: function () { goInvestment(p.id); } });
    });
    (D.settings.duties || []).forEach(function (d, i) {
      if (d.text || (d.items && d.items.length)) idx.push({ cat: 'Despre direcție', t: d.title, s: T('Funcție de bază. Deschide atribuțiile'), k: (d.text || '') + ' ' + (d.items || []).join(' '), go: function () { goFunction(i); } });
    });
    D.events.forEach(function (e) { idx.push({ cat: 'Evenimente', t: e.title, s: [DG.fmtDate(evDate(e)), e.place].filter(Boolean).join(', '), k: (e.prog || '') + ' ' + e.summary, go: function () { goEvent(e.id); } }); });
    D.gallery.forEach(function (g) { idx.push({ cat: 'Galerie foto', t: g.title || T('Fotografie'), s: [DG.fmtDate(g.date), g.album].filter(Boolean).join(' · '), k: g.alt || '', go: function () { gal.album = 'all'; renderGallery(); var i = D.gallery.indexOf(g); gal.shown = Math.max(gal.shown, i + 1); renderGallery(); openLightbox(i); } }); });
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
    var list = $('#navList');
    var toggle = $('#navToggle');
    toggle.addEventListener('click', function () {
      var open = list.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', list).forEach(function (a) {
      a.addEventListener('click', function () { list.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
    // Esc închide meniul deschis și readuce cursorul pe butonul „Meniu”
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !list.classList.contains('open') || document.querySelector('dialog[open]')) return;
      list.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });

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

    // la tipărire, secțiunile pliate trebuie să apară deschise (stilurile de tipărire afișează și acordeoanele)
    var folded = [];
    window.addEventListener('beforeprint', function () {
      folded = $$('details:not([open])');
      folded.forEach(function (d) { d.open = true; });
    });
    window.addEventListener('afterprint', function () { folded.forEach(function (d) { d.open = false; }); folded = []; });

    var toTop = $('#toTop');
    window.addEventListener('scroll', function () { toTop.classList.toggle('show', window.scrollY > 900); }, { passive: true });
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); });
  }

  /* ================= Evenimente de interfață ================= */
  function setupEvents() {
    // diagrama nivelurilor
    $('#levels').addEventListener('click', onLevelClick);

    // noutăți
    $('#newsGrid').addEventListener('click', function (e) {
      var a = e.target.closest('[data-news]');
      if (!a) return;
      e.preventDefault();
      location.hash = '#stire/' + a.getAttribute('data-news');
    });
    $('#newsMore').addEventListener('click', function () { newsShown += 6; renderNews(); });
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

    // secțiuni care se deschid: funcții, drepturi și responsabilități, proiecte
    $('#main').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-acc]');
      if (!b) return;
      accToggle(b);
      if (b.classList.contains('fn-btn')) syncFnToggle();
      if (b.classList.contains('inv-btn')) syncInvToggle();
    });
    $('#fnToggle').addEventListener('click', function () {
      var btns = $$('#dutiesList .fn-btn');
      var open = !btns.every(function (b) { return b.getAttribute('aria-expanded') === 'true'; });
      btns.forEach(function (b) { accToggle(b, open); });
      syncFnToggle();
    });

    // investiții: proiectele din Planul de creștere
    $('#invFToggle').addEventListener('click', function () { setInvFilters($('#invCtl').getAttribute('data-open') !== 'true'); });
    $('#invToggle').addEventListener('click', function () {
      var btns = $$('#invList .inv-btn');
      var open = !btns.every(function (b) { return b.getAttribute('aria-expanded') === 'true'; });
      btns.forEach(function (b) { accToggle(b, open); });
      syncInvToggle();
    });
    $('#gpOverview').addEventListener('click', function (e) {
      var b = e.target.closest('[data-min]');
      if (!b) return;
      var v = b.getAttribute('data-min');
      inv.min = inv.min === v ? 'all' : v;
      refreshInv();
      var again = $$('#gpOverview [data-min]').filter(function (x) { return x.getAttribute('data-min') === v; })[0];
      if (again) again.focus();
    });
    $('#invQ').addEventListener('input', DG.debounce(function (e) { inv.q = e.target.value; renderInvList(); }, 80));
    $('#invSort').addEventListener('change', function (e) { inv.sort = e.target.value; renderInvList(); });
    $('#invList').addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy-inv]');
      if (c) DG.copyText(location.href.split('#')[0] + '#proiect/' + c.getAttribute('data-copy-inv'), T('Adresa proiectului a fost copiată'));
      if (e.target.id === 'invReset') {
        inv.min = 'all'; inv.q = ''; $('#invQ').value = '';
        refreshInv();
        $('#invQ').focus();
      }
    });

    // acte
    $('#lawChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      law.type = b.getAttribute('data-v');
      renderLegal();
      var again = $('#lawChips [data-v="' + law.type + '"]');
      if (again) again.focus();
    });
    $('#lawQ').addEventListener('input', DG.debounce(function (e) { law.q = e.target.value; renderLegal(); }, 80));
    $('#lawSort').addEventListener('change', function (e) { law.sort = e.target.value; renderLegal(); });
    $('#lawBody').addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy]');
      if (c) DG.copyText(c.getAttribute('data-copy'), T('Referința a fost copiată'));
      if (e.target.id === 'lawReset') {
        law.type = 'all'; law.q = ''; $('#lawQ').value = '';
        renderLegal();
        $('#lawQ').focus();
      }
    });

    // rapoarte
    var years = $('#years');
    years.addEventListener('click', function (e) {
      var b = e.target.closest('.year');
      if (!b) return;
      rep.year = Number(b.getAttribute('data-y'));
      renderCoop();
      $('#tab-' + rep.year).focus();
    });
    years.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
      e.preventDefault();
      var tabs = $$('.year', years);
      var i = tabs.map(function (t) { return Number(t.getAttribute('data-y')); }).indexOf(rep.year);
      var j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      rep.year = Number(tabs[j].getAttribute('data-y'));
      renderCoop();
      $('#tab-' + rep.year).focus();
    });

    // programe
    var nav = $('#progNav');
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('.prog-btn');
      if (b) { selectProgram(b.getAttribute('data-id')); $('#ptab-' + b.getAttribute('data-id')).focus(); }
    });
    nav.addEventListener('keydown', function (e) {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
      e.preventDefault();
      var order = [];
      LEVEL_ORDER.forEach(function (lv) { D.programs.forEach(function (p) { if (p.level === lv) order.push(p.id); }); });
      var i = order.indexOf(prog.id);
      var fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      var id = e.key === 'Home' ? order[0] : e.key === 'End' ? order[order.length - 1] : order[(i + (fwd ? 1 : -1) + order.length) % order.length];
      selectProgram(id);
      $('#ptab-' + id).focus();
    });
    $('#progPanel').addEventListener('click', function (e) {
      var c = e.target.closest('[data-g]');
      if (!c) return;
      prog.group = c.getAttribute('data-g');
      renderProg();
      var again = $('#progPanel [data-g="' + c.getAttribute('data-g') + '"]');
      if (again) again.focus();
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
    $('#docQ').addEventListener('input', DG.debounce(function (e) { docs.q = e.target.value; docs.shown = 15; renderDocs(); }, 80));
    $('#docSection').addEventListener('change', function (e) { docs.section = e.target.value; docs.shown = 15; renderDocs(); });
    $('#docYear').addEventListener('change', function (e) { docs.year = e.target.value; docs.shown = 15; renderDocs(); });
    $('#docMore').addEventListener('click', function () { docs.shown += 15; renderDocs(); });
    $('#docList').addEventListener('click', function (e) {
      if (e.target.id === 'docReset') {
        docs = { q: '', section: 'all', year: 'all', shown: 15 };
        $('#docQ').value = '';
        renderDocs();
      }
    });

    // evenimente
    $('.ev-filters').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      if (b.hasAttribute('data-year')) evs.year = b.getAttribute('data-year'); else evs.prog = b.getAttribute('data-prog-f');
      renderEvents();
      var sel = b.hasAttribute('data-year') ? '[data-year="' + evs.year + '"]' : '[data-prog-f="' + evs.prog + '"]';
      var again = $('.ev-filters ' + sel);
      if (again) again.focus();
    });
    $('#timeline').addEventListener('click', function (e) {
      if (e.target.id === 'evReset') { evs.year = 'all'; evs.prog = 'all'; renderEvents(); }
    });

    // galerie
    $('#galChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      gal.album = b.getAttribute('data-album');
      gal.shown = 12;
      renderGallery();
      var again = $('#galChips [data-album="' + gal.album + '"]');
      if (again) again.focus();
    });
    $('#galMore').addEventListener('click', function () { gal.shown += 12; renderGallery(); });
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
    m = /^#eveniment\/([\w-]+)$/.exec(h);
    if (m) goEvent(m[1]);
    m = /^#program\/([\w-]+)$/.exec(h);
    if (m) goProgram(m[1]);
    m = /^#proiect\/([\w-]+)$/.exec(h);
    if (m) goInvestment(m[1]);
  }

  /* ================= Pornire ================= */
  function renderAll() {
    renderIntro();
    renderLevels();
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
  loadData().then(init).catch(function (err) {
    if (window.console) console.error(err);
    showError();
  });
})();
