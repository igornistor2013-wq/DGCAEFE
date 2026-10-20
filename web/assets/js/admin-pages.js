/* Panou de administrare — paginile de conținut: știri, documente, evenimente, cadrul legal, programe și galeria foto. */
(function () {
  'use strict';

  const DG = window.DG;
  const ADM = window.ADM;
  const esc = DG.esc;
  const ico = DG.icon;
  const $ = ADM.$;
  const pages = (ADM.pages = ADM.pages || {});
  const PAGE_SIZE = 25;

  /* ---------- liste de valori ---------- */
  const SECTIONS = [
    ['rapoarte', 'Raport anual privind asistența externă'],
    ['acord-ro', 'Acordul cu Guvernul României'],
    ['program', 'Document al unui program Interreg'],
    ['auditori', 'Verificarea cheltuielilor (auditori)'],
    ['plan-crestere', 'Planul de creștere'],
    ['general', 'Alt document']
  ];
  const SECTION_LABEL = { rapoarte: 'Rapoarte anuale', 'acord-ro': 'Acordul cu România', program: 'Programe de cooperare', auditori: 'Verificarea cheltuielilor', 'plan-crestere': 'Planul de creștere', general: 'Alte documente' };
  const GROUPS = [['', 'Alte documente'], ['buletin', 'Buletine informative'], ['oficial', 'Documente oficiale'], ['stiri', 'Știri și materiale']];
  const LEVELS = [['cross', 'Transfrontalier'], ['trans', 'Transnațional'], ['inter', 'Interregional']];
  const LEVEL_LABEL = { cross: 'Transfrontalier', trans: 'Transnațional', inter: 'Interregional' };
  const LEGAL_TYPES = [['Lege', 'Lege'], ['HG', 'Hotărâre de Guvern'], ['Ordin', 'Ordin'], ['Altele', 'Alt act normativ']];
  const LEGAL_SHORT = { Lege: 'Legea', HG: 'HG', Ordin: 'Ordinul', Altele: 'Act' };
  // Proiectele investiționale din Planul de creștere
  const CLUSTERS = [
    ['initiere', 'Inițierea studiilor'],
    ['fezabilitate', 'Studiu de fezabilitate'],
    ['maturitate', 'Grad înalt de maturitate'],
    ['negociere', 'Negocierea acordului'],
    ['semnat', 'Acord de finanțare semnat']
  ];
  const CLUSTER_LABEL = Object.fromEntries(CLUSTERS);
  const INV_STATUS = [['termen', 'În termen'], ['intarziere', 'În întârziere'], ['blocat', 'Blocat'], ['implementare', 'În implementare']];
  const INV_STATUS_LABEL = Object.fromEntries(INV_STATUS);
  const INV_BADGE = { termen: 'badge-ok', intarziere: 'badge-warn', blocat: 'badge-bad', implementare: 'badge-info' };
  const money = p => (p.amount == null ? '' : [p.amountQual, String(p.amount).replace('.', ','), 'mil.', p.currency || 'EUR'].filter(Boolean).join(' '));
  const nextOrder = () => (ADM.data.investments || []).reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;

  const programName = id => {
    const p = (ADM.data.programs || []).find(x => x.id === id);
    return p ? p.short || p.name : '';
  };
  const snippet = (s, n) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  };
  const sizeText = f => (f && f.size ? DG.formatSize(f.size) : '');

  ADM.load = async function () {
    await Promise.all(
      Array.prototype.map.call(arguments, async n => {
        ADM.data[n] = await ADM.get('/api/admin/' + n);
      })
    );
  };

  /* ---------- definițiile colecțiilor ---------- */
  const COLL = {
    news: {
      key: 'news',
      title: 'Știri',
      intro: 'Noutățile din secțiunea „Noutăți” a paginii publice. Ciornele nu sunt vizibile vizitatorilor.',
      add: 'Adaugă știre',
      editTitle: it => 'Editare știre',
      count: ['știre', 'știri'],
      names: { saved: 'Știrea a fost salvată.', created: 'Știrea a fost adăugată.', deleted: 'Știrea a fost ștearsă.', delTitle: 'Ștergeți știrea?' },
      emptyTitle: 'Nu există încă nicio știre.',
      emptyText: 'Apăsați „Adaugă știre” pentru a publica prima noutate.',
      load: ['news'],
      defaults: () => ({ date: DG.today(), published: true }),
      sort: ADM.byDateDesc,
      search: n => [n.title, n.tag, n.summary, n.body, n.dateLabel].join(' '),
      filters: [
        {
          key: 'status',
          label: 'Stare',
          options: [['', 'Toate'], ['pub', 'Publicate'], ['draft', 'Ciorne']],
          test: (n, v) => (v === 'pub' ? n.published !== false : n.published === false)
        }
      ],
      columns: [
        {
          label: 'Titlu',
          cell: n => {
            const img = n.image ? '<img class="thumb-sm" src="' + esc(ADM.fileUrl(n.image.thumb || n.image.path)) + '" alt="" loading="lazy">' : '';
            return '<div class="cell-media">' + img + '<div><div class="t"><a href="#/news/' + esc(n.id) + '">' + esc(n.title) + '</a></div><div class="s">' + esc(snippet([n.tag, n.summary].filter(Boolean).join(' · '), 140)) + '</div></div></div>';
          }
        },
        { label: 'Data', cls: 'nowrap', cell: n => esc(DG.dateText(n)) },
        { label: 'Stare', cls: 'nowrap', cell: n => (n.published === false ? '<span class="badge badge-draft">Ciornă</span>' : '<span class="badge badge-ok">Publicată</span>') }
      ],
      view: n => (n.published === false ? '' : ADM.pubUrl('/#stire/' + n.id)),
      fields: () => [
        { name: 'title', label: 'Titlu', type: 'text', required: true, max: 200 },
        { name: 'date', label: 'Data', type: 'date', required: true, w: 'third' },
        { name: 'dateLabel', label: 'Data afișată (opțional)', type: 'text', max: 60, w: 'third', hint: 'Ex.: „iunie 2026”. Dacă rămâne gol, se afișează data exactă.' },
        { name: 'tag', label: 'Etichetă', type: 'text', max: 60, w: 'third', list: ADM.distinct(ADM.data.news || [], 'tag'), hint: 'Ex.: Buletin URBACT, Anunț, Eveniment.' },
        { name: 'summary', label: 'Rezumat', type: 'textarea', max: 500, rows: 3, hint: 'Se afișează pe cardul din lista de noutăți.' },
        { name: 'body', label: 'Textul știrii', type: 'rich', max: 20000, rows: 10 },
        { name: 'image', label: 'Imagine', type: 'image', maxEdge: 1600, thumb: true, hint: 'Opțională. Se afișează pe card și în fereastra știrii.' },
        { name: 'imageAlt', label: 'Descrierea imaginii', type: 'text', max: 200, showIf: v => !!v.image, hint: 'O propoziție scurtă pentru persoanele care nu văd imaginea.' },
        { name: 'attachment', label: 'Document atașat', type: 'doc', hint: 'Opțional: PDF, Word, Excel etc., disponibil pentru descărcare.' },
        { name: 'linkUrl', label: 'Legătură externă', type: 'url', max: 1000, w: 'twothirds', placeholder: 'https://…', hint: 'Opțional: o pagină unde cititorii pot afla mai multe.' },
        { name: 'linkLabel', label: 'Textul legăturii', type: 'text', max: 80, w: 'third', placeholder: 'Citește mai mult' },
        { name: 'published', label: 'Publicată (vizibilă vizitatorilor)', type: 'checkbox', hint: 'Debifați ca să păstrați știrea ca ciornă.' }
      ]
    },

    documents: {
      key: 'documents',
      title: 'Documente',
      intro: 'Rapoarte, acorduri, ghiduri, buletine și alte documente afișate în secțiunile „Cooperare externă”, „Programe” și „Documente”.',
      add: 'Adaugă document',
      editTitle: it => 'Editare document',
      count: ['document', 'documente'],
      names: { saved: 'Documentul a fost salvat.', created: 'Documentul a fost adăugat.', deleted: 'Documentul a fost șters.', delTitle: 'Ștergeți documentul?' },
      emptyTitle: 'Nu există încă niciun document.',
      emptyText: 'Apăsați „Adaugă document” pentru a încărca primul fișier.',
      load: ['documents', 'programs'],
      defaults: () => ({ section: 'general', group: '', date: '', en: false, order: 0 }),
      sort: (a, b) => ADM.byUpdatedDesc(a, b),
      search: d => [d.title, d.kind, d.description, SECTION_LABEL[d.section], programName(d.program), d.year, d.dateLabel].join(' '),
      filters: [
        { key: 'section', label: 'Secțiune', options: () => [['', 'Toate secțiunile']].concat(SECTIONS.map(s => [s[0], SECTION_LABEL[s[0]]])), test: (d, v) => d.section === v },
        { key: 'program', label: 'Program', options: () => [['', 'Toate programele']].concat((ADM.data.programs || []).map(p => [p.id, p.short || p.name])), test: (d, v) => d.program === v }
      ],
      columns: [
        {
          label: 'Titlu',
          cell: d => '<div class="t"><a href="#/documents/' + esc(d.id) + '">' + esc(d.title) + '</a></div><div class="s">' + esc(snippet([d.kind, d.description].filter(Boolean).join(' · '), 130)) + '</div>'
        },
        {
          label: 'Secțiune',
          cell: d =>
            esc(SECTION_LABEL[d.section] || d.section) +
            (d.program ? '<div class="s">' + esc(programName(d.program)) + (d.group ? ' · ' + esc((GROUPS.find(g => g[0] === d.group) || [])[1] || '') : '') + '</div>' : '')
        },
        { label: 'Data', cls: 'nowrap', cell: d => esc(DG.dateText(d) || (d.year ? String(d.year) : '')) },
        {
          label: 'Fișier',
          cls: 'nowrap',
          cell: d => {
            const k = DG.fileKind(d.file ? d.file.name : d.url);
            return '<span class="badge badge-info">' + (d.file ? k.label : k.label === 'LINK' ? 'Adresă web' : k.label) + '</span>' + (d.file ? ' <span class="muted">' + esc(sizeText(d.file)) + '</span>' : '');
          }
        }
      ],
      view: d => (d.file ? ADM.pubUrl(d.file.path) : d.url || ''),
      viewLabel: 'Deschide documentul',
      fields: () => {
        const progs = ADM.data.programs || [];
        const docs = ADM.data.documents || [];
        return [
          { name: 'title', label: 'Titlu', type: 'text', required: true, max: 300 },
          { name: 'section', label: 'Secțiunea', type: 'select', options: SECTIONS, w: 'half', hint: 'Stabilește locul în care apare documentul pe pagina publică.' },
          { name: 'program', label: 'Programul', type: 'select', required: true, options: progs.map(p => [p.id, p.short || p.name]), w: 'half', showIf: v => v.section === 'program' },
          { name: 'group', label: 'Grupa în pagina programului', type: 'select', options: GROUPS, w: 'half', showIf: v => v.section === 'program' },
          { name: 'kind', label: 'Tipul documentului', type: 'text', max: 80, w: 'half', list: ADM.distinct(docs, 'kind'), hint: 'Ex.: Raport anual, Ghid, Buletin informativ.' },
          { name: 'date', label: 'Data', type: 'date', w: 'third' },
          { name: 'dateLabel', label: 'Data afișată (opțional)', type: 'text', max: 60, w: 'third', hint: 'Ex.: „iunie 2026”.' },
          {
            name: 'year', label: 'Anul', type: 'number', min: 1990, maxv: 2100, w: 'third', hint: 'Obligatoriu pentru rapoartele anuale.',
            check: (v, all) => (all.section === 'rapoarte' && !v && !all.date ? 'Pentru un raport anual indicați anul.' : '')
          },
          { name: 'file', label: 'Fișier', type: 'doc', hint: 'Încărcați documentul sau, dacă este publicat deja pe un alt site, indicați adresa lui mai jos.' },
          {
            name: 'url', label: 'Adresa web a documentului', type: 'url', max: 1000, placeholder: 'https://…',
            check: (v, all) => (!v && !all.file ? 'Încărcați un fișier sau introduceți o adresă web (link) pentru document.' : '')
          },
          { name: 'description', label: 'Descriere', type: 'textarea', max: 600, rows: 3 },
          { name: 'en', label: 'Documentul este în limba engleză', type: 'checkbox', w: 'half' },
          { name: 'order', label: 'Ordinea în listă', type: 'number', min: -9999, maxv: 9999, w: 'half', hint: 'Numerele mai mici apar primele.' }
        ];
      }
    },

    events: {
      key: 'events',
      title: 'Evenimente',
      intro: 'Sesiuni de informare, apeluri și alte evenimente afișate în secțiunea „Evenimente”.',
      add: 'Adaugă eveniment',
      editTitle: it => 'Editare eveniment',
      count: ['eveniment', 'evenimente'],
      names: { saved: 'Evenimentul a fost salvat.', created: 'Evenimentul a fost adăugat.', deleted: 'Evenimentul a fost șters.', delTitle: 'Ștergeți evenimentul?' },
      emptyTitle: 'Nu există încă niciun eveniment.',
      emptyText: 'Apăsați „Adaugă eveniment” pentru a anunța primul eveniment.',
      load: ['events'],
      defaults: () => ({ start: DG.today() }),
      sort: (a, b) => (b.start || b.pub || '').localeCompare(a.start || a.pub || ''),
      search: e => [e.title, e.prog, e.place, e.summary, (e.details || []).join(' ')].join(' '),
      filters: [{ key: 'prog', label: 'Program', options: () => [['', 'Toate programele']].concat(ADM.distinct(ADM.data.events || [], 'prog').map(x => [x, x])), test: (e, v) => e.prog === v }],
      columns: [
        { label: 'Titlu', cell: e => '<div class="t"><a href="#/events/' + esc(e.id) + '">' + esc(e.title) + '</a></div><div class="s">' + esc(snippet(e.summary, 100)) + '</div>' },
        { label: 'Program', cls: 'nowrap', cell: e => (e.prog ? '<span class="badge badge-info">' + esc(e.prog) + '</span>' : '') },
        {
          label: 'Data',
          cls: 'nowrap',
          cell: e => (e.start ? esc(DG.fmtDate(e.start)) + (e.end ? ' – ' + esc(DG.fmtDate(e.end)) : '') : '<span class="muted">publicat ' + esc(DG.fmtDate(e.pub)) + '</span>')
        },
        { label: 'Locul', cell: e => esc(e.place || '') }
      ],
      view: e => ADM.pubUrl('/#eveniment/' + e.id),
      fields: () => [
        { name: 'title', label: 'Titlu', type: 'text', required: true, max: 300 },
        { name: 'prog', label: 'Programul sau tema', type: 'text', max: 80, w: 'twothirds', list: ADM.distinct(ADM.data.events || [], 'prog'), hint: 'Se folosește la filtrarea evenimentelor. Ex.: URBACT, Interreg Europe.' },
        { name: 'time', label: 'Ora', type: 'text', max: 30, w: 'third', placeholder: '10:00' },
        {
          name: 'start', label: 'Data evenimentului', type: 'date', w: 'third',
          check: (v, all) => (!v && !all.pub ? 'Indicați data evenimentului sau data publicării.' : '')
        },
        {
          name: 'end', label: 'Până la data', type: 'date', w: 'third', hint: 'Doar dacă evenimentul durează mai multe zile.',
          check: (v, all) => (v && all.start && v < all.start ? 'Data de sfârșit nu poate fi înaintea celei de început.' : '')
        },
        { name: 'pub', label: 'Data publicării anunțului', type: 'date', w: 'third', hint: 'Folosită dacă data evenimentului nu este cunoscută.' },
        { name: 'place', label: 'Locul', type: 'text', max: 200 },
        { name: 'summary', label: 'Descriere scurtă', type: 'textarea', required: true, max: 800, rows: 3 },
        { name: 'details', label: 'Detalii', type: 'lines', rows: 6, hint: 'Câte un paragraf pe rând.' },
        {
          name: 'links', label: 'Legături utile', type: 'repeater', max: 10, addLabel: 'Adaugă legătură', emptyText: 'Nicio legătură adăugată.',
          sub: [{ name: 't', label: 'Text', w: 'half', max: 160 }, { name: 'u', label: 'Adresa', type: 'url', w: 'half', max: 1000, placeholder: 'https://…' }]
        }
      ]
    },

    legal: {
      key: 'legal',
      title: 'Cadrul legal',
      intro: 'Legile, hotărârile și ordinele afișate în tabelul „Cadrul legal”.',
      add: 'Adaugă act normativ',
      editTitle: it => 'Editare act normativ',
      count: ['act normativ', 'acte normative'],
      names: { saved: 'Actul normativ a fost salvat.', created: 'Actul normativ a fost adăugat.', deleted: 'Actul normativ a fost șters.', delTitle: 'Ștergeți actul normativ?' },
      emptyTitle: 'Nu există încă niciun act normativ.',
      emptyText: 'Apăsați „Adaugă act normativ” pentru a-l introduce pe primul.',
      load: ['legal'],
      defaults: () => ({ type: 'HG' }),
      sort: (a, b) => (b.year || 0) - (a.year || 0) || String(b.nr).localeCompare(String(a.nr), 'ro', { numeric: true }),
      search: l => [l.type, l.nr, l.year, l.title, l.topic].join(' '),
      filters: [{ key: 'type', label: 'Tip', options: [['', 'Toate tipurile']].concat(LEGAL_TYPES), test: (l, v) => l.type === v }],
      columns: [
        { label: 'Act', cls: 'nowrap', cell: l => '<div class="t"><a href="#/legal/' + esc(l.id) + '">' + esc((LEGAL_SHORT[l.type] || l.type) + ' nr. ' + l.nr + '/' + l.year) + '</a></div>' },
        { label: 'Denumirea', cell: l => esc(l.title) + (l.topic ? '<div class="s">' + esc(l.topic) + '</div>' : '') },
        { label: 'Sursă', cls: 'nowrap', cell: l => (l.file ? '<span class="badge badge-info">Fișier</span>' : l.url ? '<span class="badge badge-info">Adresă web</span>' : '<span class="muted">—</span>') }
      ],
      view: l => (l.file ? ADM.pubUrl(l.file.path) : l.url || ''),
      viewLabel: 'Deschide actul',
      fields: () => [
        { name: 'type', label: 'Tipul actului', type: 'select', options: LEGAL_TYPES, w: 'third' },
        { name: 'nr', label: 'Numărul', type: 'text', required: true, max: 20, w: 'third' },
        { name: 'year', label: 'Anul', type: 'number', required: true, min: 1900, maxv: 2100, w: 'third' },
        { name: 'title', label: 'Denumirea', type: 'textarea', required: true, max: 700, rows: 3, hint: 'Ex.: Privind tratatele internaționale' },
        { name: 'topic', label: 'Domeniul', type: 'text', max: 100, list: ADM.distinct(ADM.data.legal || [], 'topic'), hint: 'Actele din același domeniu sunt grupate pe pagina publică.' },
        { name: 'url', label: 'Adresa actului (de exemplu pe legis.md)', type: 'url', max: 1000, placeholder: 'https://…' },
        { name: 'file', label: 'Sau fișierul actului', type: 'doc' }
      ]
    },

    investments: {
      key: 'investments',
      title: 'Proiecte investiționale',
      intro: 'Proiectele din Planul de creștere afișate în secțiunea „Planul de creștere” a paginii publice: stadiul, progresul și următorii pași. Un proiect cu „Publicat” debifat rămâne aici, dar nu apare vizitatorilor.',
      add: 'Adaugă proiect',
      editTitle: it => 'Editare proiect investițional',
      count: ['proiect', 'proiecte'],
      names: { saved: 'Proiectul a fost salvat.', created: 'Proiectul a fost adăugat.', deleted: 'Proiectul a fost șters.', delTitle: 'Ștergeți proiectul?' },
      emptyTitle: 'Nu există încă niciun proiect.',
      emptyText: 'Apăsați „Adaugă proiect” pentru a-l introduce pe primul.',
      load: ['investments'],
      defaults: () => ({ order: nextOrder(), currency: 'EUR', cluster: 'initiere', status: 'termen', totalStages: 77, published: true }),
      sort: (a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'ro'),
      search: p => [p.name, p.ministry, CLUSTER_LABEL[p.cluster], INV_STATUS_LABEL[p.status], p.text, p.next].join(' '),
      filters: [
        { key: 'cluster', label: 'Etapa de maturitate', options: [['', 'Toate etapele']].concat(CLUSTERS), test: (p, v) => p.cluster === v },
        { key: 'status', label: 'Starea', options: [['', 'Toate stările']].concat(INV_STATUS), test: (p, v) => p.status === v }
      ],
      columns: [
        { label: 'Nr.', cls: 'nowrap', cell: p => esc(p.order || '') },
        { label: 'Proiect', cell: p => '<div class="t"><a href="#/investments/' + esc(p.id) + '">' + esc(p.name) + '</a></div><div class="s">' + esc([p.ministry, money(p)].filter(Boolean).join(' · ')) + '</div>' },
        { label: 'Etapa de maturitate', cell: p => esc(CLUSTER_LABEL[p.cluster] || '') },
        { label: 'Starea', cls: 'nowrap', cell: p => '<span class="badge ' + (INV_BADGE[p.status] || 'badge-info') + '">' + esc(INV_STATUS_LABEL[p.status] || '') + '</span>' + (p.published === false ? ' <span class="badge badge-draft">Ascuns</span>' : '') },
        { label: 'Progres', cls: 'nowrap', cell: p => (p.progress == null ? '<span class="muted">—</span>' : esc(String(p.progress).replace('.', ',')) + '%' + (p.stage != null && p.totalStages ? '<div class="s">etapa ' + p.stage + ' din ' + p.totalStages + '</div>' : '')) }
      ],
      view: p => (p.published === false ? '' : ADM.pubUrl('/#proiect/' + p.id)),
      fields: () => [
        { name: 'name', label: 'Denumirea proiectului', type: 'text', required: true, max: 300 },
        { name: 'order', label: 'Numărul de ordine', type: 'number', min: 0, maxv: 9999, w: 'third', hint: 'Ordinea în lista de pe pagină: numerele mici apar primele.' },
        { name: 'ministry', label: 'Ministerul responsabil', type: 'text', max: 100, w: 'third', list: ADM.distinct(ADM.data.investments || [], 'ministry'), hint: 'Prescurtarea, de exemplu MEC, MIDR, MEN.' },
        { name: 'published', label: 'Publicat (vizibil vizitatorilor)', type: 'checkbox', w: 'third', hint: 'Debifați ca să ascundeți proiectul de pe pagina publică.' },
        { name: 'amount', label: 'Valoarea estimată (milioane)', type: 'number', step: '0.01', min: 0, w: 'third', hint: 'Ex.: 151,5 pentru 151,5 milioane.' },
        { name: 'currency', label: 'Moneda', type: 'select', options: [['EUR', 'EUR'], ['USD', 'USD'], ['MDL', 'MDL']], w: 'third' },
        { name: 'amountQual', label: 'Precizarea valorii', type: 'select', options: [['', 'Fără precizare'], ['max.', 'maximum (max.)'], ['circa', 'aproximativ (circa)']], w: 'third', showIf: v => v.amount !== '' && v.amount != null },
        { name: 'cluster', label: 'Etapa de maturitate', type: 'select', options: CLUSTERS, w: 'half', hint: 'Cât de avansată este pregătirea proiectului, de la inițierea studiilor până la semnarea acordului.' },
        { name: 'status', label: 'Starea față de calendar', type: 'select', options: INV_STATUS, w: 'half' },
        { type: 'heading', label: 'Progres', hint: 'Poziția proiectului pe scara etapelor și subetapelor (de exemplu 75 din 77). Etapa de referință este cea în care ar fi trebuit să fie proiectul la data raportului.' },
        { name: 'stage', label: 'Etapa curentă', type: 'number', min: 0, maxv: 1000, w: 'third' },
        { name: 'refStage', label: 'Etapa de referință', type: 'number', min: 0, maxv: 1000, w: 'third' },
        {
          name: 'totalStages', label: 'Numărul total de etape', type: 'number', min: 1, maxv: 1000, w: 'third',
          check: (v, all) => (v && all.stage !== '' && Number(all.stage) > Number(v) ? 'Etapa curentă nu poate fi mai mare decât numărul total de etape.' : '')
        },
        { name: 'progress', label: 'Progresul (%)', type: 'number', step: '0.1', min: 0, maxv: 100, w: 'third', hint: 'Dacă rămâne gol, se calculează din etapa curentă și numărul total de etape.' },
        { type: 'heading', label: 'Descriere', hint: 'Textele pot avea liste (rânduri care încep cu „- ” sau „1. ”), **text aldin** și legături scrise direct (https://…).' },
        { name: 'text', label: 'Stadiul curent', type: 'textarea', max: 5000, rows: 8 },
        { name: 'delays', label: 'Întârzieri', type: 'textarea', max: 3000, rows: 4, hint: 'Etapele întârziate sau cauza blocajului. Se afișează pe pagină sub titlul „Întârzieri”.' },
        { name: 'next', label: 'Următorul pas', type: 'textarea', max: 3000, rows: 4 },
        {
          name: 'links', label: 'Legături utile', type: 'repeater', max: 6, addLabel: 'Adaugă legătură', emptyText: 'Nicio legătură adăugată.',
          sub: [{ name: 't', label: 'Text', w: 'half', max: 160 }, { name: 'u', label: 'Adresa', type: 'url', w: 'half', max: 1000, placeholder: 'https://…' }]
        }
      ]
    },

    programs: {
      key: 'programs',
      title: 'Programe de cooperare',
      intro: 'Cele cinci programe Interreg prezentate pe pagina publică. Se pot modifica descrierile, nu se pot adăuga sau șterge programe.',
      editTitle: it => 'Editare program',
      count: ['program', 'programe'],
      names: { saved: 'Programul a fost salvat.' },
      noAdd: true,
      noDelete: true,
      load: ['programs'],
      sort: (a, b) => (a.order || 0) - (b.order || 0),
      search: p => [p.name, p.short, p.strand, p.desc].join(' '),
      filters: [],
      columns: [
        { label: 'Program', cell: p => '<div class="t"><a href="#/programs/' + esc(p.id) + '">' + esc(p.name) + '</a></div><div class="s">' + esc(p.short || '') + '</div>' },
        { label: 'Nivel', cls: 'nowrap', cell: p => esc(LEVEL_LABEL[p.level] || '') },
        { label: 'Componenta', cls: 'nowrap', cell: p => esc(p.strand || '') }
      ],
      view: p => ADM.pubUrl('/#program/' + p.id),
      fields: () => [
        { name: 'name', label: 'Denumirea completă', type: 'text', required: true, max: 200 },
        { name: 'short', label: 'Denumirea scurtă', type: 'text', max: 40, w: 'half', hint: 'Folosită în butoane și în diagramă.' },
        { name: 'level', label: 'Nivelul de cooperare', type: 'select', options: LEVELS, w: 'half' },
        { name: 'strand', label: 'Componenta', type: 'text', max: 40, w: 'half', placeholder: 'Interreg VI-A' },
        { name: 'site', label: 'Site-ul programului', type: 'url', max: 1000, w: 'half', placeholder: 'https://…' },
        { name: 'desc', label: 'Descriere', type: 'textarea', max: 1500, rows: 5 },
        {
          name: 'facts', label: 'Cifre-cheie', type: 'repeater', max: 6, addLabel: 'Adaugă cifră', emptyText: 'Nicio cifră adăugată.',
          sub: [{ name: 'b', label: 'Valoarea', w: 'third', max: 40, placeholder: '750.000 EUR' }, { name: 't', label: 'Explicație', w: 'twothirds', max: 200 }]
        }
      ]
    }
  };

  /* ---------- pagină generică cu listă ---------- */
  function collectionPage(cfg) {
    let main = null;
    let items = [];
    let q = '';
    let fv = {};
    let shown = PAGE_SIZE;
    let el = {};
    const url = '/api/admin/' + cfg.key;

    function visible() {
      const list = items.filter(it => (!q || DG.matches(cfg.search(it), q)) && cfg.filters.every(f => !fv[f.key] || f.test(it, fv[f.key])));
      return list.sort(cfg.sort);
    }

    function row(it) {
      const title = it.title || it.name || (it.nr ? it.type + ' ' + it.nr + '/' + it.year : '');
      const v = cfg.view ? cfg.view(it) : '';
      const cells = cfg.columns
        .map((c, i) => '<td class="' + (i === 0 ? 'main-cell ' : '') + (c.cls || '') + '"' + (i > 0 && c.label ? ' data-label="' + esc(c.label) + '"' : '') + '>' + c.cell(it) + '</td>')
        .join('');
      const view = v ? '<a class="icon-btn sm" href="' + esc(v) + '" target="_blank" rel="noopener" aria-label="' + esc((cfg.viewLabel || 'Vezi pe pagina publică') + ': ' + title) + '" title="' + esc(cfg.viewLabel || 'Vezi pe pagina publică') + '">' + ico('ext') + '</a>' : '';
      const del = cfg.noDelete ? '' : '<button type="button" class="icon-btn sm danger" data-act="del" data-id="' + esc(it.id) + '" aria-label="Șterge: ' + esc(title) + '" title="Șterge">' + ico('trash') + '</button>';
      return (
        '<tr>' + cells + '<td class="acts">' + view +
        '<a class="icon-btn sm" href="#/' + cfg.key + '/' + esc(it.id) + '" aria-label="Editează: ' + esc(title) + '" title="Editează">' + ico('edit') + '</a>' + del + '</td></tr>'
      );
    }

    function draw() {
      const list = visible();
      const part = list.slice(0, shown);
      el.count.textContent = list.length === items.length ? ADM.plural(items.length, cfg.count[0], cfg.count[1]) : list.length + ' din ' + items.length;
      el.body.innerHTML = part.map(row).join('');
      el.wrap.hidden = !part.length;
      el.empty.hidden = !!part.length;
      el.empty.innerHTML = items.length ? '<strong>Niciun rezultat.</strong>Modificați căutarea sau filtrele.' : '<strong>' + esc(cfg.emptyTitle || 'Nu există elemente.') + '</strong>' + esc(cfg.emptyText || '');
      el.more.hidden = list.length <= shown;
      el.moreBtn.textContent = 'Arată încă ' + Math.min(PAGE_SIZE, list.length - shown) + ' (din ' + (list.length - shown) + ' rămase)';
    }

    function upsert(rec) {
      const i = items.findIndex(x => x.id === rec.id);
      if (i > -1) items[i] = rec;
      else items.unshift(rec);
      ADM.data[cfg.key] = items;
    }

    async function remove(it) {
      const ok = await ADM.confirm({
        title: cfg.names.delTitle,
        message: '„' + (it.title || it.name || it.nr) + '” va fi șters definitiv, împreună cu fișierele încărcate pentru el. Acțiunea nu poate fi anulată.',
        ok: 'Șterge definitiv',
        danger: true
      });
      if (!ok) return false;
      await ADM.api('DELETE', url + '/' + it.id);
      items = items.filter(x => x.id !== it.id);
      ADM.data[cfg.key] = items;
      return true;
    }

    async function edit(it) {
      const isNew = !it;
      const formHash = '#/' + cfg.key + '/' + (isNew ? 'new' : it.id);
      const res = await ADM.openForm({
        title: isNew ? cfg.add : cfg.editTitle(it),
        fields: cfg.fields(),
        values: it || (cfg.defaults ? cfg.defaults() : {}),
        saveLabel: isNew ? 'Adaugă' : 'Salvează modificările',
        onSave: data => (isNew ? ADM.api('POST', url, data) : ADM.api('PUT', url + '/' + it.id, data)),
        onDelete: isNew || cfg.noDelete ? null : () => remove(it)
      });
      if (location.hash === formHash) ADM.navigate('#/' + cfg.key);
      if (res && res.deleted) {
        DG.toast(cfg.names.deleted);
        draw();
      } else if (res && res.id) {
        upsert(res);
        DG.toast(isNew ? cfg.names.created : cfg.names.saved);
        draw();
      }
    }

    return {
      title: cfg.title,
      async render(root) {
        main = root;
        q = '';
        fv = {};
        shown = PAGE_SIZE;
        await ADM.load.apply(null, cfg.load);
        items = ADM.data[cfg.key];
        const filters = cfg.filters
          .map(f => {
            const opts = typeof f.options === 'function' ? f.options() : f.options;
            return '<label class="sr" for="flt-' + f.key + '">' + esc(f.label) + '</label><select id="flt-' + f.key + '" data-flt="' + f.key + '">' + opts.map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('') + '</select>';
          })
          .join('');
        root.innerHTML =
          '<div class="page-head"><div><h1>' + esc(cfg.title) + '</h1><p class="sub">' + esc(cfg.intro) + '</p></div>' +
          (cfg.noAdd ? '' : '<div class="acts"><a class="btn btn-primary" href="#/' + cfg.key + '/new">' + ico('plus') + esc(cfg.add) + '</a></div>') + '</div>' +
          '<section class="panel" aria-label="' + esc(cfg.title) + '"><div class="toolbar"><div class="srch"><label class="sr" for="listQ">Caută în listă</label>' + ico('search') +
          '<input id="listQ" type="search" placeholder="Caută…" autocomplete="off"></div>' + filters + '<span class="count" aria-live="polite"></span></div>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cfg.columns.map(c => '<th scope="col">' + esc(c.label) + '</th>').join('') + '<th scope="col" class="acts"><span class="sr">Acțiuni</span></th></tr></thead><tbody></tbody></table></div>' +
          '<div class="empty" hidden></div><div class="more" hidden><button type="button" class="btn btn-line"></button></div></section>';
        el = {
          body: $('tbody', root),
          wrap: $('.tbl-wrap', root),
          empty: $('.empty', root),
          more: $('.more', root),
          moreBtn: $('.more button', root),
          count: $('.count', root)
        };
        $('#listQ', root).addEventListener(
          'input',
          DG.debounce(e => {
            q = e.target.value;
            shown = PAGE_SIZE;
            draw();
          }, 120)
        );
        root.querySelectorAll('[data-flt]').forEach(s =>
          s.addEventListener('change', () => {
            fv[s.dataset.flt] = s.value;
            shown = PAGE_SIZE;
            draw();
          })
        );
        el.moreBtn.addEventListener('click', () => {
          shown += PAGE_SIZE;
          draw();
        });
        el.body.addEventListener('click', async e => {
          const b = e.target.closest('[data-act="del"]');
          if (!b) return;
          const it = items.find(x => x.id === b.dataset.id);
          if (!it) return;
          try {
            if (await remove(it)) {
              DG.toast(cfg.names.deleted);
              draw();
            }
          } catch (ex) {
            DG.toast(ex.message, 'error');
          }
        });
        draw();
      },
      open(arg) {
        if (!arg) return ADM.closeForm();
        if (ADM.formOpen()) return null;
        if (arg === 'new' && !cfg.noAdd) return edit(null);
        const it = items.find(x => x.id === arg);
        if (!it) {
          DG.toast('Elementul căutat nu mai există.', 'error');
          ADM.navigate('#/' + cfg.key);
          return null;
        }
        return edit(it);
      }
    };
  }

  Object.keys(COLL).forEach(k => {
    pages[k] = collectionPage(COLL[k]);
  });

  /* ---------- galeria foto ---------- */
  pages.gallery = (function () {
    const PER = 48;
    let items = [];
    let album = '';
    let q = '';
    let shown = PER;
    let sel = new Set();
    let queue = [];
    let qid = 0;
    let running = 0;
    let root = null;
    let el = {};
    const guard = () => queue.some(x => x.st === 'wait' || x.st === 'prep' || x.st === 'up');

    const sorted = () => items.slice().sort(ADM.byDateDesc);
    const albumsOf = () => ADM.distinct(items, 'album');
    const visible = () => sorted().filter(g => (!album || (album === '_' ? !g.album : g.album === album)) && (!q || DG.matches([g.title, g.album, g.alt, g.date].join(' '), q)));

    function drawAlbumSelect() {
      const albums = albumsOf();
      const hasNone = items.some(g => !g.album);
      el.flt.innerHTML =
        '<option value="">Toate albumele (' + items.length + ')</option>' +
        albums.map(a => '<option value="' + esc(a) + '">' + esc(a) + ' (' + items.filter(g => g.album === a).length + ')</option>').join('') +
        (hasNone ? '<option value="_">Fără album (' + items.filter(g => !g.album).length + ')</option>' : '');
      el.flt.value = album;
      el.dl.innerHTML = albums.map(a => '<option value="' + esc(a) + '">').join('');
    }

    function drawGrid() {
      const list = visible();
      const part = list.slice(0, shown);
      el.grid.innerHTML = part
        .map(g => {
          const t = g.title || 'Fără titlu';
          return (
            '<li class="g-card' + (sel.has(g.id) ? ' sel' : '') + '" data-id="' + esc(g.id) + '">' +
            '<label class="g-pick"><input type="checkbox" data-pick="' + esc(g.id) + '"' + (sel.has(g.id) ? ' checked' : '') + ' aria-label="Selectează: ' + esc(t) + '"></label>' +
            '<a class="g-open" href="#/gallery/' + esc(g.id) + '" aria-label="Editează fotografia: ' + esc(t) + '"><img src="' + esc(ADM.fileUrl(g.file.thumb || g.file.path)) + '" alt="" loading="lazy"></a>' +
            '<div class="g-cap"><b>' + esc(t) + '</b><small>' + esc([g.album, DG.fmtDate(g.date)].filter(Boolean).join(' · ') || ' ') + '</small>' +
            (g.sample ? '<span class="badge badge-warn">Imagine de exemplu</span>' : !g.alt ? '<span class="badge badge-draft" title="Adăugați o descriere pentru persoanele care nu văd imaginea">Fără descriere</span>' : '') + '</div></li>'
          );
        })
        .join('');
      el.empty.hidden = !!part.length;
      el.empty.innerHTML = items.length ? '<strong>Nicio fotografie în această selecție.</strong>Schimbați albumul sau căutarea.' : '<strong>Galeria este goală.</strong>Încărcați primele fotografii cu zona de mai sus.';
      el.more.hidden = list.length <= shown;
      el.moreBtn.textContent = 'Arată încă ' + Math.min(PER, list.length - shown) + ' (din ' + (list.length - shown) + ' rămase)';
      el.count.textContent = list.length === items.length ? ADM.plural(items.length, 'fotografie', 'fotografii') : list.length + ' din ' + items.length;
      drawBulk();
      drawSample();
    }

    function drawBulk() {
      const ids = new Set(items.map(g => g.id));
      sel.forEach(id => {
        if (!ids.has(id)) sel.delete(id);
      });
      const n = sel.size;
      el.selN.textContent = n ? ADM.plural(n, 'fotografie selectată', 'fotografii selectate') : 'Nicio fotografie selectată';
      el.move.disabled = !n;
      el.delSel.disabled = !n;
      const vis = visible().slice(0, shown);
      el.all.checked = !!vis.length && vis.every(g => sel.has(g.id));
      el.all.indeterminate = !el.all.checked && vis.some(g => sel.has(g.id));
    }

    function drawSample() {
      const n = items.filter(g => g.sample).length;
      el.sample.hidden = !n;
      if (n) el.sampleN.textContent = ADM.plural(n, 'imagine de exemplu', 'imagini de exemplu');
    }

    /* --- încărcare --- */
    function qHtml(x) {
      const st =
        x.st === 'wait' ? 'În așteptare…' : x.st === 'prep' ? 'Se pregătește…' : x.st === 'up' ? 'Se încarcă… ' + Math.round(x.p * 100) + '%' : x.st === 'ok' ? 'Încărcată' : esc(x.err || 'Eroare');
      return (
        '<li class="q-item" data-q="' + x.id + '">' + (x.url ? '<img src="' + esc(x.url) + '" alt="">' : '<span class="q-ph">' + ico('image') + '</span>') +
        '<div><div class="q-name">' + esc(x.file.name) + '</div><div class="q-st ' + (x.st === 'ok' ? 'ok' : x.st === 'err' ? 'err' : '') + '">' + st + '</div>' +
        (x.st === 'up' || x.st === 'prep' ? '<div class="up-bar"><i style="width:' + Math.round(x.p * 100) + '%"></i></div>' : '') + '</div>' +
        (x.st === 'err' ? '<button type="button" class="btn btn-line btn-sm" data-retry="' + x.id + '">Reîncearcă</button>' : '<span></span>') + '</li>'
      );
    }
    function drawQueue() {
      el.queue.innerHTML = queue.map(qHtml).join('');
      el.queueBar.hidden = !queue.length;
      el.clear.hidden = !queue.some(x => x.st === 'ok' || x.st === 'err');
    }

    async function runOne(x) {
      try {
        x.st = 'prep';
        x.p = 0;
        drawQueue();
        const pr = await ADM.processImage(x.file, { maxEdge: 2000, thumb: 640 });
        x.url = URL.createObjectURL(pr.thumb || pr.main);
        x.st = 'up';
        const total = pr.thumb ? 2 : 1;
        const tick = () => {
          const li = el.queue.querySelector('[data-q="' + x.id + '"]');
          if (!li) return;
          const bar = li.querySelector('.up-bar i');
          const st = li.querySelector('.q-st');
          if (bar) bar.style.width = Math.round(x.p * 100) + '%';
          if (st) st.textContent = 'Se încarcă… ' + Math.round(x.p * 100) + '%';
        };
        drawQueue();
        const main = await ADM.upload('image', pr.main, p => {
          x.p = p / total;
          tick();
        });
        const file = { path: main.path, name: main.name, size: main.size };
        if (pr.thumb) {
          const th = await ADM.upload('image', pr.thumb, p => {
            x.p = (1 + p) / total;
            tick();
          });
          file.thumb = th.path;
        }
        const rec = await ADM.api('POST', '/api/admin/gallery', { title: '', album: x.album, date: x.date, alt: '', file });
        items.unshift(rec);
        ADM.data.gallery = items;
        x.st = 'ok';
      } catch (e) {
        x.st = 'err';
        x.err = e.message || 'Încărcarea a eșuat.';
      }
    }

    async function pump() {
      while (running < ADM.uploadSlots) {
        const next = queue.find(x => x.st === 'wait');
        if (!next) break;
        running++;
        next.st = 'prep';
        runOne(next).then(() => {
          running--;
          if (el.queue) {
            drawQueue();
            drawAlbumSelect();
            drawGrid();
          }
          // un singur mesaj de rezumat, când s-a terminat și ultima încărcare (mai multe pot ajunge la capăt deodată)
          if (running === 0 && !guard() && el.queue) {
            const ok = queue.filter(x => x.st === 'ok').length;
            const bad = queue.filter(x => x.st === 'err').length;
            if (ok || bad) DG.toast(bad ? ok + ' încărcate, ' + bad + ' cu erori. Verificați lista.' : ADM.plural(ok, 'fotografie încărcată', 'fotografii încărcate') + '.', bad ? 'error' : undefined);
          }
          pump();
        });
      }
    }

    function enqueue(files) {
      const list = Array.from(files);
      if (!list.length) return;
      const album = el.album.value.trim();
      const date = el.date.value;
      list.forEach(f => {
        const x = { id: ++qid, file: f, st: 'wait', p: 0, album, date, err: '', url: '' };
        const bad = ADM.checkFile('image', f);
        if (bad) {
          x.st = 'err';
          x.err = bad;
        }
        queue.push(x);
      });
      drawQueue();
      pump();
    }

    /* --- editare, mutare, ștergere --- */
    async function edit(g) {
      const albums = albumsOf();
      const res = await ADM.openForm({
        title: 'Editare fotografie',
        fields: [
          { name: 'file', label: 'Fotografia', type: 'image', required: true, thumb: true, maxEdge: 2000, hint: 'Pentru a înlocui fotografia, alegeți alt fișier.' },
          { name: 'title', label: 'Titlu', type: 'text', max: 200 },
          { name: 'album', label: 'Album', type: 'text', max: 80, w: 'half', list: albums },
          { name: 'date', label: 'Data', type: 'date', w: 'half' },
          { name: 'alt', label: 'Descrierea imaginii', type: 'text', max: 200, hint: 'O propoziție care spune ce se vede în fotografie. Este citită de cititoarele de ecran.' }
        ],
        values: g,
        saveLabel: 'Salvează modificările',
        onSave: data => ADM.api('PUT', '/api/admin/gallery/' + g.id, data),
        onDelete: async () => {
          const ok = await ADM.confirm({ title: 'Ștergeți fotografia?', message: 'Fotografia va fi ștearsă definitiv ' + ADM.where + ' și din galerie.', ok: 'Șterge definitiv', danger: true });
          if (!ok) return false;
          await ADM.api('DELETE', '/api/admin/gallery/' + g.id);
          items = items.filter(x => x.id !== g.id);
          ADM.data.gallery = items;
          return true;
        }
      });
      if (location.hash === '#/gallery/' + g.id) ADM.navigate('#/gallery');
      if (res && res.deleted) {
        DG.toast('Fotografia a fost ștearsă.');
      } else if (res && res.id) {
        const i = items.findIndex(x => x.id === res.id);
        if (i > -1) items[i] = res;
        DG.toast('Fotografia a fost salvată.');
      }
      drawAlbumSelect();
      drawGrid();
    }

    async function deleteMany(list, message) {
      const ok = await ADM.confirm({ title: 'Ștergeți ' + ADM.plural(list.length, 'fotografie', 'fotografii') + '?', message, ok: 'Șterge definitiv', danger: true });
      if (!ok) return;
      let done = 0;
      let failed = '';
      if (ADM.canBatch) {
        // administrarea pe GitHub: toate ștergerile se salvează într-un singur commit, deci reușesc sau eșuează împreună
        try {
          await ADM.batch(list.map(g => ({ method: 'DELETE', url: '/api/admin/gallery/' + g.id })));
          const gone = new Set(list.map(g => g.id));
          items = items.filter(x => !gone.has(x.id));
          gone.forEach(id => sel.delete(id));
          done = list.length;
        } catch (e) {
          failed = e.message;
        }
      } else {
        for (const g of list) {
          try {
            await ADM.api('DELETE', '/api/admin/gallery/' + g.id);
            items = items.filter(x => x.id !== g.id);
            sel.delete(g.id);
            done++;
          } catch (e) {
            failed = e.message;
            break;
          }
        }
      }
      ADM.data.gallery = items;
      drawAlbumSelect();
      drawGrid();
      if (failed) DG.toast('S-au șters ' + done + ' din ' + list.length + '. ' + failed, 'error');
      else DG.toast(ADM.plural(done, 'fotografie ștearsă', 'fotografii șterse') + '.');
    }

    async function moveSelected() {
      const list = items.filter(g => sel.has(g.id));
      if (!list.length) return;
      const r = await ADM.ask({
        title: 'Mută în album',
        ok: 'Mută',
        intro: 'Se vor muta ' + ADM.plural(list.length, 'fotografie', 'fotografii') + '. Lăsați câmpul gol pentru a le scoate din orice album.',
        fields: [{ name: 'album', label: 'Albumul', type: 'text', max: 80, list: albumsOf() }],
        values: { album: '' }
      });
      if (!r) return;
      let done = 0;
      try {
        const body = g => ({ title: g.title, album: r.album, date: g.date, alt: g.alt, file: g.file });
        if (ADM.canBatch) {
          const recs = await ADM.batch(list.map(g => ({ method: 'PUT', url: '/api/admin/gallery/' + g.id, body: body(g) })));
          recs.forEach(rec => (items[items.findIndex(x => x.id === rec.id)] = rec));
          done = recs.length;
        } else {
          for (const g of list) {
            const rec = await ADM.api('PUT', '/api/admin/gallery/' + g.id, body(g));
            items[items.findIndex(x => x.id === g.id)] = rec;
            done++;
          }
        }
        sel.clear();
        DG.toast(ADM.plural(done, 'fotografie mutată', 'fotografii mutate') + '.');
      } catch (e) {
        DG.toast(e.message, 'error');
      }
      ADM.data.gallery = items;
      drawAlbumSelect();
      drawGrid();
    }

    return {
      title: 'Galerie foto',
      leave() {
        const i = ADM.guards.indexOf(guard);
        if (i > -1) ADM.guards.splice(i, 1);
        queue.forEach(x => x.url && URL.revokeObjectURL(x.url));
        el = {};
      },
      async render(r) {
        root = r;
        await ADM.load('gallery');
        items = ADM.data.gallery;
        album = '';
        q = '';
        shown = PER;
        sel = new Set();
        if (ADM.guards.indexOf(guard) < 0) ADM.guards.push(guard);
        root.innerHTML =
          '<div class="page-head"><div><h1>Galerie foto</h1><p class="sub">Fotografiile din secțiunea „Galerie foto”. Pozele se redimensionează automat, iar datele ascunse (locația, modelul aparatului) se elimină.</p></div></div>' +
          '<div class="alert alert-warn" id="gSample" hidden>' + ico('alert') + '<div><strong>Galeria conține <span id="gSampleN"></span>.</strong> Sunt ilustrații abstracte puse doar pentru a arăta cum arată pagina. Ștergeți-le după ce încărcați fotografiile reale.</div><button type="button" class="btn btn-danger btn-sm" id="gSampleDel">Șterge imaginile de exemplu</button></div>' +
          '<section class="panel" aria-labelledby="gUpT"><div class="panel-h"><h2 id="gUpT">Încărcați fotografii</h2></div><div class="panel-b">' +
          '<div class="up-opts"><div class="fld"><label for="gAlbum">Album (opțional)</label><input type="text" id="gAlbum" maxlength="80" list="gAlbumDl" placeholder="Ex.: Sesiune de informare, 2026"><datalist id="gAlbumDl"></datalist></div>' +
          '<div class="fld"><label for="gDate">Data fotografiilor</label><input type="date" id="gDate" value="' + DG.today() + '"></div></div>' +
          '<label class="drop" id="gDrop">' + ico('upload') + '<strong>Trageți fotografiile aici sau apăsați pentru a le alege</strong><span>JPG, PNG, WebP sau GIF. Puteți alege mai multe fișiere odată.</span><input type="file" id="gFile" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" multiple></label>' +
          '<div id="gQueueBar" hidden><ul class="queue" id="gQueue"></ul><p style="margin:.7rem 0 0"><button type="button" class="btn btn-ghost btn-sm" id="gClear" hidden>Șterge lista de mai sus</button></p></div>' +
          '</div></section>' +
          '<section class="panel" aria-labelledby="gLibT"><h2 class="sr" id="gLibT">Fotografiile din galerie</h2>' +
          '<div class="toolbar"><div class="srch"><label class="sr" for="gQ">Caută</label>' + ico('search') + '<input id="gQ" type="search" placeholder="Caută după titlu sau descriere…" autocomplete="off"></div>' +
          '<label class="sr" for="gFlt">Album</label><select id="gFlt"></select><span class="count" id="gCount" aria-live="polite"></span></div>' +
          '<div class="g-bar"><label class="check" style="font-weight:400"><input type="checkbox" id="gAll"><span>Selectează tot</span></label><span class="sel-n" id="gSelN" aria-live="polite"></span><span class="grow"></span>' +
          '<button type="button" class="btn btn-line btn-sm" id="gMove" disabled>' + ico('folder') + 'Mută în album</button><button type="button" class="btn btn-danger btn-sm" id="gDelSel" disabled>' + ico('trash') + 'Șterge selecția</button></div>' +
          '<ul class="g-grid" id="gGrid"></ul><div class="empty" id="gEmpty" hidden></div><div class="more" id="gMore" hidden><button type="button" class="btn btn-line"></button></div></section>';
        el = {
          album: $('#gAlbum', root),
          date: $('#gDate', root),
          dl: $('#gAlbumDl', root),
          file: $('#gFile', root),
          drop: $('#gDrop', root),
          queue: $('#gQueue', root),
          queueBar: $('#gQueueBar', root),
          clear: $('#gClear', root),
          grid: $('#gGrid', root),
          empty: $('#gEmpty', root),
          more: $('#gMore', root),
          moreBtn: $('#gMore button', root),
          flt: $('#gFlt', root),
          count: $('#gCount', root),
          all: $('#gAll', root),
          selN: $('#gSelN', root),
          move: $('#gMove', root),
          delSel: $('#gDelSel', root),
          sample: $('#gSample', root),
          sampleN: $('#gSampleN', root)
        };
        el.file.addEventListener('change', () => {
          enqueue(el.file.files);
          el.file.value = '';
        });
        ['dragenter', 'dragover'].forEach(t =>
          el.drop.addEventListener(t, e => {
            e.preventDefault();
            el.drop.classList.add('drag');
          })
        );
        ['dragleave', 'drop'].forEach(t =>
          el.drop.addEventListener(t, e => {
            e.preventDefault();
            el.drop.classList.remove('drag');
          })
        );
        el.drop.addEventListener('drop', e => enqueue(e.dataTransfer ? e.dataTransfer.files : []));
        el.queue.addEventListener('click', e => {
          const b = e.target.closest('[data-retry]');
          if (!b) return;
          const x = queue.find(i => String(i.id) === b.dataset.retry);
          if (x) {
            x.st = 'wait';
            x.err = '';
            drawQueue();
            pump();
          }
        });
        el.clear.addEventListener('click', () => {
          queue = queue.filter(x => x.st === 'wait' || x.st === 'prep' || x.st === 'up');
          drawQueue();
        });
        $('#gQ', root).addEventListener(
          'input',
          DG.debounce(e => {
            q = e.target.value;
            shown = PER;
            drawGrid();
          }, 120)
        );
        el.flt.addEventListener('change', () => {
          album = el.flt.value;
          shown = PER;
          drawGrid();
        });
        el.moreBtn.addEventListener('click', () => {
          shown += PER;
          drawGrid();
        });
        el.grid.addEventListener('change', e => {
          const c = e.target.closest('[data-pick]');
          if (!c) return;
          if (c.checked) sel.add(c.dataset.pick);
          else sel.delete(c.dataset.pick);
          c.closest('.g-card').classList.toggle('sel', c.checked);
          drawBulk();
        });
        el.all.addEventListener('change', () => {
          visible().slice(0, shown).forEach(g => (el.all.checked ? sel.add(g.id) : sel.delete(g.id)));
          drawGrid();
        });
        el.move.addEventListener('click', moveSelected);
        el.delSel.addEventListener('click', () => {
          const list = items.filter(g => sel.has(g.id));
          if (list.length) deleteMany(list, 'Fotografiile selectate vor fi șterse definitiv ' + ADM.where + '. Acțiunea nu poate fi anulată.');
        });
        $('#gSampleDel', root).addEventListener('click', () => {
          const list = items.filter(g => g.sample);
          if (list.length) deleteMany(list, 'Se șterg doar imaginile de exemplu. Fotografiile dumneavoastră rămân neschimbate.');
        });
        drawQueue();
        drawAlbumSelect();
        drawGrid();
      },
      open(arg) {
        if (!arg) return ADM.closeForm();
        if (ADM.formOpen()) return null;
        const g = items.find(x => x.id === arg);
        if (!g) {
          DG.toast('Fotografia căutată nu mai există.', 'error');
          ADM.navigate('#/gallery');
          return null;
        }
        return edit(g);
      }
    };
  })();
})();
