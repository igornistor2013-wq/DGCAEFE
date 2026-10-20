/* Validarea și curățarea datelor din panoul de administrare.
   Același cod rulează pe server (Node) și în browser (administrarea direct pe GitHub), ca regulile să fie identice.
   Nimic din ce vine de la client nu este salvat fără să treacă pe aici. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminSchemas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SECTIONS = ['rapoarte', 'acord-ro', 'program', 'auditori', 'plan-crestere', 'general'];
  const GROUPS = ['', 'buletin', 'oficial', 'stiri'];
  const LEVELS = ['cross', 'trans', 'inter'];
  const LEGAL_TYPES = ['Lege', 'HG', 'Ordin', 'Altele'];
  // Proiectele investiționale din Planul de creștere: cele cinci obiective economice în care sunt grupate.
  const INV_THEMES = ['export', 'energie', 'agricultura', 'cunoastere', 'social'];
  const CURRENCIES = ['EUR', 'USD', 'MDL'];
  const AMOUNT_QUAL = ['', 'max.', 'circa'];

  const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'zip'];

  // Calea unui fișier încărcat, așa cum apare în datele salvate.
  const UPLOAD_RE = /\/uploads\/(?:img|docs)\/[\w.-]+/g;
  const UP_RE = { img: /^\/uploads\/img\/[\w.-]+$/, docs: /^\/uploads\/docs\/[\w.-]+$/ };

  // Toate fișierele încărcate la care se referă o structură de date.
  const filesIn = obj => new Set(JSON.stringify(obj === undefined ? null : obj).match(UPLOAD_RE) || []);

  /* ---------- verificarea conținutului fișierelor (nu doar a extensiei) ---------- */
  const OLE = [0xd0, 0xcf, 0x11, 0xe0];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function ascii(b, from, to) {
    let s = '';
    for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i]);
    return s;
  }
  const startsWith = (b, sig) => sig.every((x, i) => b[i] === x);
  const isZip = b => b[0] === 0x50 && b[1] === 0x4b;

  // `b` este un Uint8Array (sau un Buffer din Node).
  function sniff(ext, b) {
    if (!b || !b.length) return false;
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return b[0] === 0xff && b[1] === 0xd8;
      case 'png':
        return startsWith(b, PNG);
      case 'gif':
        return ascii(b, 0, 3) === 'GIF';
      case 'webp':
        return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP';
      case 'pdf':
        return ascii(b, 0, 1024).includes('%PDF-');
      case 'docx':
      case 'xlsx':
      case 'pptx':
      case 'odt':
      case 'ods':
      case 'odp':
      case 'zip':
        return isZip(b);
      case 'doc':
      case 'xls':
      case 'ppt':
        return startsWith(b, OLE) || isZip(b) || ascii(b, 0, 5) === '{\\rtf';
      case 'rtf':
        return ascii(b, 0, 5) === '{\\rtf';
      case 'txt':
      case 'csv': {
        const n = Math.min(b.length, 4096);
        for (let i = 0; i < n; i++) if (b[i] === 0) return false;
        return true;
      }
      default:
        return false;
    }
  }

  function slug(name) {
    const base = name.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return base || 'fisier';
  }

  /* ---------- reguli de validare ----------
     env.bad(mesaj)       creează eroarea de validare (implicit: Error cu status 400)
     env.fileExists(cale) spune dacă fișierul încărcat există
     env.programs()       lista programelor (pentru documentele unui program) */
  function create(env) {
    const bad =
      env.bad ||
      (message => {
        const e = new Error(message);
        e.status = 400;
        return e;
      });

    /* --- elemente de bază --- */
    function str(v, label, { max = 200, req = false } = {}) {
      if (v === undefined || v === null) v = '';
      if (typeof v === 'object') throw bad(`Câmpul „${label}” este invalid.`);
      v = String(v).replace(/\r\n?/g, '\n').trim();
      if (req && !v) throw bad(`Câmpul „${label}” este obligatoriu.`);
      if (v.length > max) throw bad(`Câmpul „${label}” este prea lung (maximum ${max} de caractere).`);
      return v;
    }

    function date(v, label, { req = false } = {}) {
      v = str(v, label, { max: 10, req });
      if (!v) return '';
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(`Data din câmpul „${label}” este invalidă.`);
      return v;
    }

    function url(v, label, { req = false, anchor = false } = {}) {
      v = str(v, label, { max: 1000, req });
      if (!v) return '';
      if (/^https?:\/\/[^\s<>"']+$/i.test(v)) return v;
      if (/^\/uploads\/(?:img|docs)\/[\w.-]+$/.test(v)) return v;
      if (anchor && /^#[\w-]+$/.test(v)) return v;
      throw bad(`Câmpul „${label}” trebuie să fie o adresă web care începe cu http:// sau https://.`);
    }

    function int(v, label, { min = -1e9, max = 1e9 } = {}) {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw bad(`Câmpul „${label}” trebuie să fie un număr întreg între ${min} și ${max}.`);
      return n;
    }

    // Număr cu zecimale; acceptă și virgula („151,5”). Gol înseamnă „necompletat”.
    function num(v, label, { min = -1e12, max = 1e12, dec = 2 } = {}) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') throw bad(`Câmpul „${label}” este invalid.`);
      if (typeof v === 'string') {
        v = v.trim().replace(/\s+/g, '').replace(',', '.');
        if (v === '') return null;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) throw bad(`Câmpul „${label}” trebuie să fie un număr între ${min} și ${max}.`);
      const f = 10 ** dec;
      return Math.round(n * f) / f;
    }

    const bool = v => v === true || v === 'true' || v === 1 || v === '1';

    function oneOf(v, label, list, def) {
      v = str(v, label, { max: 60 });
      if (!v) return def === undefined ? list[0] : def;
      if (!list.includes(v)) throw bad(`Valoare invalidă pentru „${label}”.`);
      return v;
    }

    function strList(v, label, { max = 20, item = 300 } = {}) {
      const arr = Array.isArray(v) ? v : String(v || '').split('\n');
      if (arr.length > max * 4) throw bad(`Câmpul „${label}” are prea multe rânduri.`);
      const out = arr.map(x => String(x === null || x === undefined ? '' : x).trim()).filter(Boolean);
      if (out.length > max) throw bad(`Câmpul „${label}” poate avea cel mult ${max} de rânduri.`);
      for (const x of out) if (x.length > item) throw bad(`Un rând din „${label}” este prea lung (maximum ${item} de caractere).`);
      return out;
    }

    function objList(v, label, max, mapper) {
      if (v === undefined || v === null || v === '') return [];
      if (!Array.isArray(v)) throw bad(`Câmpul „${label}” este invalid.`);
      if (v.length > max * 2) throw bad(`Câmpul „${label}” are prea multe elemente.`);
      const out = v.map(mapper).filter(Boolean);
      if (out.length > max) throw bad(`Câmpul „${label}” poate avea cel mult ${max} de elemente.`);
      return out;
    }

    function uploadPath(p, kind, label) {
      p = String(p || '');
      if (!UP_RE[kind].test(p) || p.includes('..')) throw bad(`Fișierul din „${label}” este invalid.`);
      if (!env.fileExists(p)) throw bad(`Fișierul din „${label}” nu mai există. Încărcați-l din nou.`);
      return p;
    }

    function file(v, label, kind) {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v !== 'object' || Array.isArray(v)) throw bad(`Câmpul „${label}” este invalid.`);
      const p = uploadPath(v.path, kind, label);
      const out = { path: p, name: str(v.name, label, { max: 200 }) || p.slice(p.lastIndexOf('/') + 1), size: int(v.size, label, { min: 0, max: 2e9 }) || 0 };
      if (kind === 'img' && v.thumb) out.thumb = uploadPath(v.thumb, 'img', label);
      return out;
    }

    function pairLink(l, tLabel, uLabel, opts) {
      const t = str(l && l.t, tLabel, { max: 160 });
      const u = url(l && l.u, uLabel, opts);
      if (!t && !u) return null;
      if (!t || !u) throw bad(`Fiecare legătură are nevoie atât de text, cât și de adresă (${tLabel} / ${uLabel}).`);
      return { t, u };
    }

    /* --- colecții --- */
    const news = {
      label: i => i.title,
      clean(b) {
        return {
          title: str(b.title, 'Titlu', { max: 200, req: true }),
          date: date(b.date, 'Data', { req: true }),
          dateLabel: str(b.dateLabel, 'Etichetă pentru dată', { max: 60 }),
          tag: str(b.tag, 'Etichetă', { max: 60 }),
          summary: str(b.summary, 'Rezumat', { max: 500 }),
          body: str(b.body, 'Textul știrii', { max: 20000 }),
          image: file(b.image, 'Imagine', 'img'),
          imageAlt: str(b.imageAlt, 'Descrierea imaginii', { max: 200 }),
          attachment: file(b.attachment, 'Document atașat', 'docs'),
          linkUrl: url(b.linkUrl, 'Legătură externă'),
          linkLabel: str(b.linkLabel, 'Textul legăturii', { max: 80 }),
          published: b.published === undefined ? true : bool(b.published)
        };
      }
    };

    const documents = {
      label: i => i.title,
      clean(b) {
        const section = oneOf(b.section, 'Secțiunea', SECTIONS, 'general');
        let program = str(b.program, 'Programul', { max: 40 });
        if (section === 'program') {
          if (!env.programs().some(p => p.id === program)) throw bad('Alegeți programul căruia îi aparține documentul.');
        } else program = '';
        const out = {
          title: str(b.title, 'Titlu', { max: 300, req: true }),
          section,
          program,
          group: section === 'program' ? oneOf(b.group, 'Grupa', GROUPS, '') : '',
          kind: str(b.kind, 'Tipul documentului', { max: 80 }),
          date: date(b.date, 'Data'),
          dateLabel: str(b.dateLabel, 'Etichetă pentru dată', { max: 60 }),
          year: int(b.year, 'Anul', { min: 1990, max: 2100 }),
          en: bool(b.en),
          order: int(b.order, 'Ordinea', { min: -9999, max: 9999 }) || 0,
          file: file(b.file, 'Fișier', 'docs'),
          url: url(b.url, 'Adresa documentului'),
          description: str(b.description, 'Descriere', { max: 600 })
        };
        if (!out.file && !out.url) throw bad('Încărcați un fișier sau introduceți o adresă web (link) pentru document.');
        if (out.url && !/^https?:\/\//i.test(out.url) && !out.url.startsWith('/uploads/')) throw bad('Adresa documentului este invalidă.');
        if (section === 'rapoarte' && !out.year) {
          if (out.date) out.year = Number(out.date.slice(0, 4));
          else throw bad('Pentru un raport anual indicați anul.');
        }
        return out;
      }
    };

    const events = {
      label: i => i.title,
      clean(b) {
        const out = {
          title: str(b.title, 'Titlu', { max: 300, req: true }),
          prog: str(b.prog, 'Programul', { max: 80 }),
          start: date(b.start, 'Data de început'),
          end: date(b.end, 'Data de sfârșit'),
          pub: date(b.pub, 'Data publicării'),
          time: str(b.time, 'Ora', { max: 30 }),
          place: str(b.place, 'Locul', { max: 200 }),
          summary: str(b.summary, 'Descriere', { max: 800, req: true }),
          details: strList(b.details, 'Detalii', { max: 20, item: 800 }),
          links: objList(b.links, 'Legături', 10, l => pairLink(l, 'Text legătură', 'Adresa legăturii'))
        };
        if (!out.start && !out.pub) throw bad('Indicați data evenimentului sau data publicării.');
        if (out.start && out.end && out.end < out.start) throw bad('Data de sfârșit nu poate fi înaintea celei de început.');
        return out;
      }
    };

    const legal = {
      label: i => `${i.type} ${i.nr}/${i.year}`,
      clean(b) {
        const out = {
          type: oneOf(b.type, 'Tipul actului', LEGAL_TYPES, 'HG'),
          nr: str(b.nr, 'Numărul', { max: 20, req: true }),
          year: int(b.year, 'Anul', { min: 1900, max: 2100 }),
          title: str(b.title, 'Denumirea', { max: 700, req: true }),
          topic: str(b.topic, 'Domeniul', { max: 100 }),
          url: url(b.url, 'Adresa actului'),
          file: file(b.file, 'Fișier', 'docs')
        };
        if (out.year === null) throw bad('Câmpul „Anul” este obligatoriu.');
        return out;
      }
    };

    const gallery = {
      label: i => i.title || 'Fotografie',
      clean(b, ex) {
        const f = file(b.file, 'Fotografia', 'img');
        if (!f) throw bad('Alegeți o fotografie.');
        return {
          title: str(b.title, 'Titlu', { max: 200 }),
          album: str(b.album, 'Albumul', { max: 80 }),
          date: date(b.date, 'Data'),
          alt: str(b.alt, 'Descrierea imaginii', { max: 200 }),
          sample: !!(ex && ex.sample && ex.file && ex.file.path === f.path),
          file: f
        };
      }
    };

    const programs = {
      label: i => i.name,
      clean(b, ex) {
        return {
          order: ex.order,
          level: oneOf(b.level, 'Nivelul', LEVELS, ex.level),
          strand: str(b.strand, 'Componenta', { max: 40 }),
          name: str(b.name, 'Denumirea', { max: 200, req: true }),
          short: str(b.short, 'Denumirea scurtă', { max: 40 }),
          site: url(b.site, 'Site-ul programului'),
          desc: str(b.desc, 'Descrierea', { max: 1500 }),
          facts: objList(b.facts, 'Cifre-cheie', 6, f => {
            const bb = str(f && f.b, 'Cifră', { max: 40 });
            const t = str(f && f.t, 'Explicație', { max: 200 });
            return bb || t ? { b: bb, t } : null;
          })
        };
      }
    };

    // Proiectele investiționale: numai date generale (cine, cu cine, cât, când, unde, ce se face). Starea, progresul și
    // întârzierile nu se păstrează aici; câmpurile vechi pe care le mai trimite un client sunt ignorate.
    const investments = {
      label: i => i.name,
      clean(b) {
        const amount = num(b.amount, 'Valoarea indicativă (milioane)', { min: 0, max: 1e6, dec: 2 });
        return {
          order: int(b.order, 'Numărul de ordine', { min: 0, max: 9999 }) || 0,
          name: str(b.name, 'Denumirea proiectului', { max: 300, req: true }),
          theme: oneOf(b.theme, 'Obiectivul economic', ['', ...INV_THEMES], ''),
          ministry: str(b.ministry, 'Ministerul responsabil', { max: 100 }),
          implementer: str(b.implementer, 'Instituția de implementare', { max: 300 }),
          financier: str(b.financier, 'Partenerul de finanțare', { max: 300 }),
          amount,
          currency: oneOf(b.currency, 'Moneda', CURRENCIES, 'EUR'),
          amountQual: amount === null ? '' : oneOf(b.amountQual, 'Precizarea valorii', AMOUNT_QUAL, ''),
          financing: str(b.financing, 'Structura finanțării', { max: 1500 }),
          period: str(b.period, 'Perioada de implementare', { max: 200 }),
          location: str(b.location, 'Localizarea', { max: 500 }),
          text: str(b.text, 'Obiectivul și descrierea proiectului', { max: 5000 }),
          results: strList(b.results, 'Rezultate preconizate', { max: 12, item: 500 }),
          beneficiaries: str(b.beneficiaries, 'Beneficiarii', { max: 800 }),
          links: objList(b.links, 'Legături utile', 6, l => pairLink(l, 'Text legătură', 'Adresa legăturii')),
          published: b.published === undefined ? true : bool(b.published)
        };
      }
    };

    function cleanSettings(b) {
      b = b && typeof b === 'object' ? b : {};
      const c = b.contact && typeof b.contact === 'object' ? b.contact : {};
      const g = b.growth && typeof b.growth === 'object' ? b.growth : {};
      const mapEmbed = str(c.mapEmbed, 'Harta (adresa de încorporare)', { max: 1500 });
      if (mapEmbed && !/^https:\/\/www\.google\.com\/maps\/embed\?[^\s"'<>]+$/.test(mapEmbed)) {
        throw bad('Adresa hărții trebuie să înceapă cu https://www.google.com/maps/embed?');
      }
      const mailTo = str(c.mailTo, 'E-mail pentru formularul de contact', { max: 120 });
      if (mailTo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mailTo)) throw bad('Adresa de e-mail pentru formularul de contact este invalidă.');
      return {
        orgName: str(b.orgName, 'Denumirea direcției', { max: 200, req: true }),
        parentName: str(b.parentName, 'Instituția-părinte', { max: 200 }),
        heroTitle: str(b.heroTitle, 'Titlul din prima pagină', { max: 160 }),
        heroLead: str(b.heroLead, 'Text de prezentare', { max: 800 }),
        quickLinks: objList(b.quickLinks, 'Acces rapid', 8, l => pairLink(l, 'Text', 'Adresa', { anchor: true })),
        aboutP1: str(b.aboutP1, 'Despre direcție, primul paragraf', { max: 1200 }),
        aboutP2: str(b.aboutP2, 'Despre direcție, al doilea paragraf', { max: 1200 }),
        aboutNote: str(b.aboutNote, 'Despre direcție, sursa informațiilor', { max: 800 }),
        principles: strList(b.principles, 'Principiile de activitate', { max: 10, item: 160 }),
        duties: objList(b.duties, 'Funcțiile de bază', 12, d => {
          const title = str(d && d.title, 'Titlul funcției', { max: 140 });
          const text = str(d && d.text, 'Descrierea funcției', { max: 800 });
          const items = strList(d && d.items, 'Atribuțiile funcției', { max: 20, item: 700 });
          return title || text || items.length ? { title, text, items } : null;
        }),
        structure: objList(b.structure, 'Structura direcției', 12, r => {
          const title = str(r && r.title, 'Funcția din structură', { max: 100 });
          if (!title) return null;
          const count = int(r && r.count, 'Numărul de unități', { min: 0, max: 999 });
          return { title, count: count === null ? 1 : count };
        }),
        rights: strList(b.rights, 'Drepturile direcției', { max: 20, item: 700 }),
        responsibilities: strList(b.responsibilities, 'Responsabilitățile direcției', { max: 25, item: 700 }),
        growth: {
          asOf: date(g.asOf, 'Datele proiectelor sunt actualizate la data de'),
          intro: str(g.intro, 'Proiecte investiționale, introducere', { max: 1200 }),
          note: str(g.note, 'Proiecte investiționale, notă explicativă', { max: 1500 }),
          sources: objList(g.sources, 'Proiecte investiționale, surse de date', 6, l => pairLink(l, 'Text', 'Adresa'))
        },
        contact: {
          address: str(c.address, 'Adresa', { max: 300 }),
          phones: strList(c.phones, 'Telefoane', { max: 12, item: 40 }),
          emails: objList(c.emails, 'Adrese de e-mail', 6, e => {
            const addr = str(e && e.addr, 'Adresa de e-mail', { max: 120 });
            if (!addr) return null;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) throw bad(`Adresa de e-mail „${addr}” este invalidă.`);
            return { addr, note: str(e && e.note, 'Nota la e-mail', { max: 120 }) };
          }),
          hotlinePhone: str(c.hotlinePhone, 'Linia anticorupție, telefon', { max: 40 }),
          hotlineHours: str(c.hotlineHours, 'Linia anticorupție, program', { max: 100 }),
          mailTo,
          mapEmbed,
          mapLink: url(c.mapLink, 'Legătura către hartă')
        },
        footerNote: str(b.footerNote, 'Nota din subsol', { max: 400 })
      };
    }

    return { news, documents, events, legal, gallery, programs, investments, cleanSettings };
  }

  return { create, sniff, slug, filesIn, SECTIONS, GROUPS, LEVELS, LEGAL_TYPES, INV_THEMES, CURRENCIES, AMOUNT_QUAL, IMG_EXT, DOC_EXT, UPLOAD_RE };
});
