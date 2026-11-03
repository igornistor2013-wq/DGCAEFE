/* Panou de administrare — panoul de control, textele paginii, secțiunea „Proiecte investiționale”, jurnalul, contul și publicarea. */
(function () {
  'use strict';

  const DG = window.DG;
  const ADM = window.ADM;
  const esc = DG.esc;
  const ico = DG.icon;
  const $ = ADM.$;
  const pages = (ADM.pages = ADM.pages || {});

  /* ---------- jurnal de activitate ---------- */
  const ACT = {
    create: 'a adăugat',
    update: 'a modificat',
    delete: 'a șters',
    login: 's-a autentificat',
    'login-failed': 'încercare de autentificare eșuată',
    logout: 'a ieșit din cont',
    password: 'a schimbat parola',
    backup: 'a descărcat o copie de siguranță',
    export: 'a exportat versiunea statică a site-ului',
    republish: 'a republicat pagina',
    commit: 'a trimis o modificare în depozit'
  };
  const TGT = { news: 'știrea', documents: 'documentul', events: 'evenimentul', legal: 'actul normativ', gallery: 'fotografia', programs: 'programul', investments: 'proiectul investițional', settings: 'textele paginii' };

  function describe(e) {
    const act = ACT[e.a] || e.a;
    if ((e.a === 'create' || e.a === 'update' || e.a === 'delete') && TGT[e.c]) {
      return esc(act + ' ' + TGT[e.c]) + (e.c === 'settings' || !e.d ? '' : ' „' + esc(e.d) + '”');
    }
    if (e.a === 'commit' && e.d) return esc(act) + ' „' + esc(e.d) + '”';
    return esc(act);
  }

  function auditList(list) {
    if (!list.length) return '<p class="empty">Nu există încă activitate înregistrată.</p>';
    return '<ul class="act-list">' + list.map(e => '<li><time datetime="' + esc(e.t) + '">' + esc(ADM.fmtDateTime(e.t)) + '</time><span class="who">' + esc(e.u || '—') + '</span><span class="what">' + describe(e) + '</span></li>').join('') + '</ul>';
  }

  /* ---------- panoul de control ---------- */
  pages[''] = {
    title: 'Panou de control',
    async render(root) {
      const [, audit, settings] = await Promise.all([ADM.load('news', 'documents', 'gallery', 'events', 'legal', 'programs'), ADM.get('/api/admin/audit').catch(() => []), ADM.get('/api/admin/settings').catch(() => ADM.settings || {})]);
      const d = ADM.data;
      const pr = (settings && settings.projects) || {};
      const panels = (pr.video !== false ? 1 : 0) + (pr.pano !== false ? 1 : 0);
      const panelNote = panels === 2 ? 'video și panoramă, cu legătura către site-ul cu proiecte' : panels ? (pr.video !== false ? 'doar panoul video' : 'doar panorama') : 'secțiunea este ascunsă';
      const drafts = d.news.filter(n => n.published === false).length;
      const sample = d.gallery.filter(g => g.sample).length;
      const stat = (href, n, label, note) => '<a class="stat" href="' + href + '"><span class="n">' + n + '</span><span class="l">' + label + '</span><span class="d">' + note + '</span></a>';
      root.innerHTML =
        '<div class="page-head"><div><h1>Panou de control</h1><p class="sub">Bun venit, ' + esc(ADM.user) + '. De aici administrați conținutul paginii publice: știri, documente, fotografii, evenimente, panourile „Proiecte investiționale” și textele paginii.</p></div>' +
        '<div class="acts"><a class="btn btn-line" href="../" target="_blank" rel="noopener">' + ico('ext') + 'Deschide pagina publică</a></div></div>' +
        (sample ? '<div class="alert alert-warn">' + ico('alert') + '<div><strong>Galeria conține ' + ADM.plural(sample, 'imagine de exemplu', 'imagini de exemplu') + '.</strong> Ștergeți-le după ce încărcați fotografiile reale, ca să nu apară vizitatorilor.</div><a class="btn btn-line btn-sm" href="#/gallery">Deschide galeria</a></div>' : '') +
        '<div class="stats">' +
        stat('#/news', d.news.length, 'Știri', drafts ? ADM.plural(drafts, 'ciornă', 'ciorne') : 'toate publicate') +
        stat('#/documents', d.documents.length, 'Documente', 'rapoarte, ghiduri, buletine') +
        stat('#/gallery', d.gallery.length, 'Fotografii', 'în galeria foto') +
        stat('#/events', d.events.length, 'Evenimente', 'anunțate pe pagină') +
        stat('#/legal', d.legal.length, 'Acte normative', 'în cadrul legal') +
        stat('#/investments', panels, 'Panouri „Proiecte investiționale”', panelNote) +
        '</div><div class="two"><div>' +
        '<section class="panel"><div class="panel-h"><h2>Acțiuni rapide</h2></div><div class="panel-b"><div class="quick-acts">' +
        '<a class="btn btn-primary" href="#/news/new">' + ico('plus') + 'Adaugă știre</a>' +
        '<a class="btn btn-line" href="#/documents/new">' + ico('file') + 'Adaugă document</a>' +
        '<a class="btn btn-line" href="#/gallery">' + ico('image') + 'Încarcă fotografii</a>' +
        '<a class="btn btn-line" href="#/events/new">' + ico('calendar') + 'Adaugă eveniment</a>' +
        '<a class="btn btn-line" href="#/texts">' + ico('sliders') + 'Editează textele paginii</a>' +
        '<a class="btn btn-line" href="#/export">' + ico('database') + 'Publicare și copii</a></div></div></section>' +
        '<section class="panel"><div class="panel-h"><h2>Activitate recentă</h2><a href="#/audit">Tot jurnalul</a></div><div class="panel-b">' + auditList(audit.slice(0, 8)) + '</div></section>' +
        '</div><div>' +
        (ADM.gh
          ? ADM.gh.publishPanel()
          : '<section class="panel"><div class="panel-h"><h2>Cum ajunge conținutul pe GitHub</h2></div><div class="panel-b">' +
            '<p>Modificările făcute aici sunt vizibile imediat pe pagina publică, dacă aplicația rulează pe un server. GitHub Pages poate găzdui doar o copie statică, fără administrare.</p>' +
            '<ol class="steps-ol"><li><p>Faceți modificările în acest panou.</p></li><li><p>Descărcați <strong>exportul static</strong> din secțiunea „Publicare și copii”.</p></li><li><p>Încărcați conținutul arhivei în depozitul GitHub și activați GitHub Pages.</p></li></ol>' +
            '<p style="margin-top:1rem"><a class="btn btn-line btn-sm" href="#/export">Deschide „Publicare și copii”</a></p></div></section>') +
        '</div></div>';
    }
  };

  /* ---------- pagini cu texte din „settings” ---------- */
  // Textele paginii sunt un singur document (settings). Fiecare pagină de aici editează doar o parte din el; la salvare,
  // partea editată se pune peste varianta salvată, ca restul textelor (și cele vechi, păstrate pentru actualizări) să rămână neatinse.
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  function mergeSettings(base, over) {
    const out = Object.assign({}, base);
    Object.keys(over).forEach(k => {
      out[k] = isObj(base && base[k]) && isObj(over[k]) ? mergeSettings(base[k], over[k]) : over[k];
    });
    return out;
  }

  // o: { key, title, sub(s), fields(s), toast, acts?, top(s)?, values(s)?, wire(form, root)? }
  function settingsPage(o) {
    let form = null;
    const guard = () => !!form && form.dirty();
    const page = {
      title: o.title,
      leave() {
        const i = ADM.guards.indexOf(guard);
        if (i > -1) ADM.guards.splice(i, 1);
        form = null;
      },
      async render(root) {
        const s = await ADM.get('/api/admin/settings');
        ADM.settings = s;
        form = ADM.buildForm(o.fields(s), o.values ? o.values(s) : s);
        if (ADM.guards.indexOf(guard) < 0) ADM.guards.push(guard);
        const id = o.key;
        root.innerHTML =
          '<div class="page-head"><div><h1>' + esc(o.title) + '</h1><p class="sub">' + o.sub(s) + '</p></div>' + (o.acts ? '<div class="acts">' + o.acts + '</div>' : '') + '</div>' +
          (o.top ? o.top(s) : '') +
          '<form class="panel" id="' + id + 'Form" novalidate><div class="panel-b"><div class="alert alert-error" id="' + id + 'Err" role="alert" hidden></div><div id="' + id + 'Body"></div></div>' +
          '<div class="savebar"><span class="muted" id="' + id + 'State">Nicio modificare nesalvată.</span><span class="grow"></span><button type="button" class="btn btn-line" id="' + id + 'Revert">Renunță la modificări</button><button type="submit" class="btn btn-primary" id="' + id + 'Save">Salvează modificările</button></div></form>';
        $('#' + id + 'Body', root).appendChild(form.el);
        const err = $('#' + id + 'Err', root);
        const state = $('#' + id + 'State', root);
        const save = $('#' + id + 'Save', root);
        const mark = () => {
          const d = form.dirty();
          state.textContent = d ? 'Aveți modificări nesalvate.' : 'Nicio modificare nesalvată.';
          state.style.color = d ? 'var(--orange)' : '';
          state.style.fontWeight = d ? '700' : '';
        };
        form.el.addEventListener('input', mark);
        form.el.addEventListener('change', mark);
        if (o.wire) o.wire(form, root);
        $('#' + id + 'Revert', root).addEventListener('click', async () => {
          if (form.dirty() && !(await ADM.confirm({ title: 'Renunțați la modificări?', message: 'Textele revin la ultima variantă salvată.', ok: 'Renunță la modificări', danger: true }))) return;
          form.markClean();
          page.render(root);
        });
        $('#' + id + 'Form', root).addEventListener('submit', async e => {
          e.preventDefault();
          err.hidden = true;
          if (!form.validate()) return;
          save.disabled = true;
          save.textContent = 'Se salvează…';
          try {
            const saved = await ADM.api('PUT', '/api/admin/settings', mergeSettings(ADM.settings, form.read()));
            ADM.settings = saved;
            form.markClean();
            mark();
            ADM.refreshOrg();
            DG.toast(o.toast);
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
            err.scrollIntoView({ block: 'center' });
            form.markServerError(ex.message);
          } finally {
            save.disabled = false;
            save.textContent = 'Salvează modificările';
          }
        });
        root.addEventListener('keydown', e => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            $('#' + id + 'Form', root).requestSubmit();
          }
        });
      }
    };
    return page;
  }

  /* ---------- texte pagină ---------- */
  pages.texts = settingsPage({
    key: 'txt',
    title: 'Texte pagină',
    toast: 'Textele paginii au fost salvate.',
    sub: () => 'Textele care nu fac parte din știri sau documente: antetul, prezentarea, atribuțiile, cooperarea externă și datele de contact. Secțiunea „Proiecte investiționale” are pagina ei în meniu. Modificările apar pe pagina publică imediat după salvare.',
    fields: () => [
          { type: 'heading', label: 'Identitate', hint: 'Apar în antet, în subsol și în titlul filei din browser.' },
          { name: 'orgName', label: 'Denumirea direcției', type: 'text', required: true, max: 200 },
          { name: 'parentName', label: 'Instituția-părinte', type: 'text', max: 200 },
          { type: 'heading', label: 'Prima pagină' },
          { name: 'heroTitle', label: 'Titlul din prima pagină', type: 'text', max: 160 },
          { name: 'heroLead', label: 'Text de prezentare', type: 'textarea', max: 800, rows: 4, hint: 'Se vede în partea de sus a paginii doar cât timp nu există nicio noutate publicată; altfel, în locul lui se derulează ultimele 10 noutăți.' },
          {
            name: 'quickLinks', label: 'Acces rapid', type: 'repeater', max: 8, addLabel: 'Adaugă legătură', emptyText: 'Nicio legătură adăugată.',
            hint: 'Adresa poate fi o pagină web (https://…) sau o secțiune a paginii, de exemplu #programe.',
            sub: [{ name: 't', label: 'Text', w: 'half', max: 160 }, { name: 'u', label: 'Adresa', w: 'half', max: 1000, placeholder: 'https://… sau #programe' }]
          },
          { type: 'heading', label: 'Despre direcție', hint: 'Secțiunea „Despre direcție” a paginii: statutul, misiunea, funcțiile de bază, structura, drepturile și responsabilitățile, după Regulamentul de activitate.' },
          { name: 'aboutP1', label: 'Primul paragraf', type: 'textarea', max: 1200, rows: 5 },
          { name: 'aboutP2', label: 'Al doilea paragraf', type: 'textarea', max: 1200, rows: 5 },
          { name: 'principles', label: 'Principiile de activitate', type: 'lines', rows: 5, hint: 'Câte un principiu pe rând.' },
          {
            name: 'duties', label: 'Funcțiile de bază', type: 'repeater', max: 12, addLabel: 'Adaugă funcție', emptyText: 'Nicio funcție adăugată.',
            hint: 'Fiecare funcție are un titlu scurt, descrierea ei și lista atribuțiilor concrete (care se deschide pe pagină la apăsarea titlului).',
            sub: [
              { name: 'title', label: 'Titlu', max: 140 },
              { name: 'text', label: 'Descrierea funcției', type: 'textarea', rows: 3, max: 800 },
              { name: 'items', label: 'Atribuțiile funcției (câte una pe rând)', type: 'textarea', rows: 7 }
            ]
          },
          {
            name: 'structure', label: 'Structura direcției', type: 'repeater', max: 12, addLabel: 'Adaugă funcție din structură', emptyText: 'Nicio funcție adăugată.',
            hint: 'Funcțiile din statul de personal și numărul de unități pentru fiecare. Pe pagină se afișează și totalul.',
            sub: [{ name: 'title', label: 'Funcția', w: 'twothirds', max: 100 }, { name: 'count', label: 'Unități', w: 'third', max: 3 }]
          },
          { name: 'rights', label: 'Drepturile direcției', type: 'lines', rows: 9, hint: 'Câte un drept pe rând.' },
          { name: 'responsibilities', label: 'Responsabilitățile direcției', type: 'lines', rows: 12, hint: 'Câte o responsabilitate pe rând.' },
          { type: 'heading', label: 'Secțiunea „Cooperare externă”', hint: 'Rapoartele anuale și documentele Acordului cu România se administrează în meniul „Documente” (secțiunile „Raport anual” și „Acordul cu Guvernul României”). Aici se editează textele și cardul Platformei AMP.' },
          { name: 'coop.title', label: 'Titlul secțiunii', type: 'text', max: 120 },
          { name: 'coop.acordTitle', label: 'Acordul cu România: titlul cardului', type: 'text', max: 160, w: 'twothirds' },
          { name: 'coop.acordAmount', label: 'Acordul cu România: suma', type: 'text', max: 60, w: 'third', placeholder: '100 mil. EUR' },
          { name: 'coop.acordIntro', label: 'Acordul cu România: descrierea', type: 'textarea', max: 800, rows: 3 },
          { name: 'coop.ampTitle', label: 'Platforma AMP: titlul cardului', type: 'text', max: 200 },
          { name: 'coop.ampText', label: 'Platforma AMP: descrierea', type: 'textarea', max: 1200, rows: 4 },
          { name: 'coop.ampUrl', label: 'Platforma AMP: adresa site-ului', type: 'url', max: 1000, placeholder: 'https://amp.gov.md/portal/' },
          { name: 'coop.ampChips', label: 'Platforma AMP: etichetele cardului', type: 'lines', rows: 6, hint: 'Câte o etichetă pe rând (informațiile pe care le centralizează platforma). Maximum 10.' },
          { type: 'heading', label: 'Contacte' },
          { name: 'contact.address', label: 'Adresa', type: 'textarea', rows: 2, max: 300 },
          { name: 'contact.phones', label: 'Telefoane', type: 'lines', rows: 8, w: 'half', hint: 'Câte un număr pe rând.' },
          {
            name: 'contact.emails', label: 'Adrese de e-mail', type: 'repeater', max: 6, addLabel: 'Adaugă e-mail', emptyText: 'Nicio adresă adăugată.', w: 'half',
            sub: [{ name: 'addr', label: 'Adresa de e-mail', max: 120 }, { name: 'note', label: 'Nota (opțional)', max: 120, placeholder: 'ex.: petiții și audiențe' }]
          },
          { name: 'contact.hotlinePhone', label: 'Linia anticorupție: telefon', type: 'text', max: 40, w: 'half' },
          { name: 'contact.hotlineHours', label: 'Linia anticorupție: program', type: 'text', max: 100, w: 'half' },
          {
            name: 'contact.mailTo', label: 'E-mail la care se trimit mesajele din formular', type: 'text', max: 120, hint: 'Formularul de contact deschide programul de e-mail al vizitatorului cu mesajul completat.',
            check: v => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Adresa de e-mail este invalidă.')
          },
          {
            name: 'contact.mapEmbed', label: 'Harta: adresa de încorporare', type: 'text', max: 1500,
            hint: 'În Google Maps: Distribuie → Încorporează o hartă → copiați doar adresa din src="…". Trebuie să înceapă cu https://www.google.com/maps/embed?',
            check: v => (!v || /^https:\/\/www\.google\.com\/maps\/embed\?[^\s"'<>]+$/.test(v) ? '' : 'Adresa hărții trebuie să înceapă cu https://www.google.com/maps/embed?')
          },
          { name: 'contact.mapLink', label: 'Harta: legătura „Deschide în Google Maps”', type: 'url', max: 1000, placeholder: 'https://…' },
          { type: 'heading', label: 'Subsol' },
          { name: 'footerNote', label: 'Nota din subsol', type: 'textarea', max: 400, rows: 2 }
    ].concat(ADM.trFields('settings', k => k.indexOf('projects.') !== 0))
  });

  /* ---------- proiecte investiționale ---------- */
  // Secțiunea de pe pagina publică (meniul „Investiții”) are două panouri late: animația video și panorama. Pe fiecare, titlul din
  // colțul din stânga jos duce la site-ul separat cu proiectele. Aici se aleg panourile afișate, titlurile și adresa acelui site.
  // Imaginile de mai jos sunt aceleași fișiere ca pe pagina publică (web/index.html); un test verifică să existe.
  const PROJ_PANELS = [
    { name: 'video', img: '../assets/img/proiecte-investitionale-fae8ecde.jpg', t: 'Panoul animat (video)', d: 'Filmare cu proiectele de-a lungul autostrăzii; pornește singură și are buton de pauză.' },
    { name: 'pano', img: '../assets/img/proiecte-panorama-1600-7224854b.jpg', t: 'Panorama (imagine)', d: 'Imagine lată, sub panoul animat; pe telefon se derulează lent stânga-dreapta.' }
  ];
  const PROJ_URL = 'https://proiecte.pages.dev/';
  pages.investments = settingsPage({
    key: 'prj',
    title: 'Proiecte investiționale',
    toast: 'Secțiunea „Proiecte investiționale” a fost salvată.',
    sub: () => 'Secțiunea „Proiecte investiționale” a paginii publice (meniul „Investiții”): un panou animat și o panoramă, fiecare cu titlul în colțul din stânga jos. Apăsarea titlului deschide site-ul cu proiectele investiționale într-o filă nouă. Lista proiectelor nu se mai afișează în această pagină; ea este pe site-ul cu proiecte.',
    acts: '<a class="btn btn-line" href="../#plan-crestere" target="_blank" rel="noopener">' + ico('ext') + 'Vezi secțiunea pe pagină</a>',
    top: s => {
      const pr = s.projects || {};
      return '<section class="panel"><div class="panel-h"><h2>Panourile de pe pagină</h2></div><div class="panel-b"><div class="proj-prev">' +
        PROJ_PANELS.map(p => {
          const on = pr[p.name] !== false;
          return '<figure class="proj-card' + (on ? '' : ' is-off') + '" data-panel="' + p.name + '"><img src="' + p.img + '" alt="" loading="lazy" decoding="async">' +
            '<figcaption><strong>' + esc(p.t) + '</strong> <span class="badge ' + (on ? 'badge-ok">Afișat' : 'badge-draft">Ascuns') + '</span><span class="muted">' + esc(p.d) + '</span></figcaption></figure>';
        }).join('') + '</div></div></section>';
    },
    // panourile lipsă din textele salvate înseamnă „afișat” (ca pe pagina publică)
    values: s => mergeSettings(s, { projects: { video: (s.projects || {}).video !== false, pano: (s.projects || {}).pano !== false } }),
    fields: () => [
      { type: 'heading', label: 'Panourile afișate', hint: 'Dacă debifați ambele panouri, secțiunea dispare de pe pagină, împreună cu legăturile „Investiții” din meniu și din subsol.' },
      { name: 'projects.video', label: 'Afișează panoul animat (video)', type: 'checkbox', w: 'half' },
      { name: 'projects.pano', label: 'Afișează panorama (imaginea)', type: 'checkbox', w: 'half' },
      { type: 'heading', label: 'Texte și legătură' },
      { name: 'projects.title', label: 'Titlul secțiunii', type: 'text', max: 120, w: 'half', placeholder: 'Proiecte investiționale', hint: 'Titlul de deasupra panourilor. Gol = „Proiecte investiționale”.' },
      { name: 'projects.label', label: 'Textul de pe panouri', type: 'text', max: 60, w: 'half', placeholder: 'Proiecte investiționale', hint: 'Apare în colțul din stânga jos al fiecărui panou. Gol = „Proiecte investiționale”.' },
      { name: 'projects.url', label: 'Adresa site-ului cu proiectele', type: 'url', max: 1000, placeholder: PROJ_URL, hint: 'Se deschide la apăsarea textului de pe panouri. Gol = ' + PROJ_URL }
    ].concat(ADM.trFields('settings', k => k.indexOf('projects.') === 0)),
    // previzualizarea arată imediat ce panouri rămân pe pagină
    wire: (form, root) => form.el.addEventListener('change', () => {
      const v = (form.read().projects) || {};
      PROJ_PANELS.forEach(p => {
        const card = root.querySelector('.proj-card[data-panel="' + p.name + '"]');
        if (!card) return;
        const on = v[p.name] !== false;
        card.classList.toggle('is-off', !on);
        const b = card.querySelector('.badge');
        b.className = 'badge ' + (on ? 'badge-ok' : 'badge-draft');
        b.textContent = on ? 'Afișat' : (form.dirty() ? 'Ascuns după salvare' : 'Ascuns');
      });
    })
  });

  /* ---------- jurnal ---------- */
  pages.audit = {
    title: 'Jurnal de activitate',
    async render(root) {
      const list = await ADM.get('/api/admin/audit');
      root.innerHTML =
        '<div class="page-head"><div><h1>Jurnal de activitate</h1><p class="sub">' + (ADM.gh ? 'Ultimele modificări salvate în depozitul GitHub: adăugări, modificări și ștergeri. Istoricul complet este în GitHub, la „Commits”.' : 'Ultimele 100 de acțiuni ale administratorilor: autentificări, adăugări, modificări și ștergeri.') + '</p></div></div>' +
        '<section class="panel"><div class="panel-b">' + auditList(list) + '</div></section>';
    }
  };

  /* ---------- cont și parolă ---------- */
  pages.account = {
    title: 'Cont și parolă',
    render(root) {
      const min = ADM.minPassword;
      root.innerHTML =
        '<div class="page-head"><div><h1>Cont și parolă</h1><p class="sub">Contul de administrator și schimbarea parolei.</p></div></div>' +
        '<section class="panel" style="max-width:36rem"><div class="panel-h"><h2>Schimbarea parolei</h2></div><div class="panel-b">' +
        '<p>Utilizator: <strong>' + esc(ADM.user) + '</strong></p>' +
        '<form id="pwForm" novalidate>' +
        '<div class="alert alert-error" id="pwErr" role="alert" hidden></div>' +
        '<div class="form-grid">' +
        '<div class="fld"><label for="pwCur">Parola curentă</label><input type="password" id="pwCur" autocomplete="current-password" required></div>' +
        '<div class="fld"><label for="pwNew">Parola nouă</label><input type="password" id="pwNew" autocomplete="new-password" required aria-describedby="pwNewH"><p class="hint" id="pwNewH">Cel puțin ' + min + ' caractere. O frază lungă, ușor de ținut minte, este mai sigură decât o parolă scurtă și complicată.</p></div>' +
        '<div class="fld"><label for="pwRep">Repetați parola nouă</label><input type="password" id="pwRep" autocomplete="new-password" required></div>' +
        '<div class="fld"><label class="check" style="font-weight:400"><input type="checkbox" id="pwShow"><span>Arată parolele</span></label></div>' +
        '</div><p class="hint" style="margin:1rem 0">După schimbare, sesiunile deschise pe alte dispozitive se închid.</p>' +
        '<button type="submit" class="btn btn-primary" id="pwBtn">Schimbă parola</button></form></div></section>';
      const f = $('#pwForm', root);
      const err = $('#pwErr', root);
      const inputs = ['#pwCur', '#pwNew', '#pwRep'].map(s => $(s, root));
      $('#pwShow', root).addEventListener('change', e => inputs.forEach(i => (i.type = e.target.checked ? 'text' : 'password')));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const [cur, next, rep] = inputs.map(i => i.value);
        const fail = (m, i) => {
          err.textContent = m;
          err.hidden = false;
          inputs[i].focus();
        };
        err.hidden = true;
        if (!cur) return fail('Introduceți parola curentă.', 0);
        if (next.length < min) return fail('Parola nouă trebuie să aibă cel puțin ' + min + ' caractere.', 1);
        if (next === cur) return fail('Parola nouă trebuie să fie diferită de cea curentă.', 1);
        if (next !== rep) return fail('Cele două parole noi nu coincid.', 2);
        const btn = $('#pwBtn', root);
        btn.disabled = true;
        try {
          const r = await ADM.api('POST', '/api/admin/password', { current: cur, next });
          if (r && r.csrf) ADM.csrf = r.csrf;
          inputs.forEach(i => (i.value = ''));
          DG.toast('Parola a fost schimbată.');
        } catch (ex) {
          fail(ex.message, ex.message.indexOf('curentă') > -1 ? 0 : 1);
        } finally {
          btn.disabled = false;
        }
      });
    }
  };

  /* ---------- publicare și copii ---------- */
  pages.export = {
    title: 'Publicare și copii',
    render(root) {
      root.innerHTML =
        '<div class="page-head"><div><h1>Publicare și copii</h1><p class="sub">Descărcați conținutul ca să-l publicați pe GitHub Pages sau ca să păstrați o copie de siguranță.</p></div></div>' +
        '<div class="alert alert-info">' + ico('info') + '<div><strong>GitHub Pages găzduiește doar fișiere statice.</strong> Panoul de administrare are nevoie de un server (Node.js), deci nu poate rula pe GitHub Pages. Administrați conținutul aici, apoi exportați o copie statică (doar pentru citire) și publicați-o pe GitHub.</div></div>' +
        '<div class="two"><section class="panel"><div class="panel-h"><h2>Export pentru GitHub Pages</h2></div><div class="panel-b">' +
        '<p>Arhiva ZIP conține pagina publică completă, cu toate știrile publicate, documentele, fotografiile și textele de acum. Ciornele nu sunt incluse.</p>' +
        '<p><a class="btn btn-primary" href="/api/admin/export-static" download>' + ico('down') + 'Descarcă exportul static (ZIP)</a></p>' +
        '<h3 style="font-size:1.05rem;margin:1.25rem 0 .6rem">Cum se publică</h3>' +
        '<ol class="steps-ol"><li><p>Dezarhivați fișierul ZIP.</p></li>' +
        '<li><p>Încărcați tot conținutul în rădăcina unui depozit GitHub destinat doar paginii publice (nu în cel cu codul aplicației), apoi faceți <span class="code">commit</span> și <span class="code">push</span>.</p></li>' +
        '<li><p>În GitHub: <strong>Settings → Pages</strong>, la „Source” alegeți <strong>Deploy from a branch</strong>, ramura <span class="code">main</span> și folderul <span class="code">/ (root)</span>, apoi salvați. Adresa paginii apare după câteva minute.</p></li></ol>' +
        '<p class="hint" style="margin-top:1rem">Dacă întregul proiect este pe GitHub, pagina se poate publica automat (GitHub Actions), fără acest export. Detalii în fișierul README din arhiva proiectului.</p></div></section>' +
        '<section class="panel"><div class="panel-h"><h2>Copie de siguranță</h2></div><div class="panel-b">' +
        '<p>Arhiva ZIP conține tot ce s-a introdus din panou, inclusiv ciornele: conținutul (<span class="code">content</span>) și fișierele încărcate (<span class="code">uploads</span>). Parolele nu sunt incluse.</p>' +
        '<p><a class="btn btn-line" href="/api/admin/backup" download>' + ico('down') + 'Descarcă copia de siguranță (ZIP)</a></p>' +
        '<h3 style="font-size:1.05rem;margin:1.25rem 0 .6rem">Cum se restaurează</h3>' +
        '<p>Opriți aplicația, dezarhivați copia peste folderul de date al aplicației (<span class="code">storage</span> sau valoarea variabilei <span class="code">DATA_DIR</span>), apoi porniți din nou aplicația.</p>' +
        '<p class="hint">Faceți o copie periodic, mai ales înainte de modificări mari.</p></div></section></div>';
    }
  };
})();
