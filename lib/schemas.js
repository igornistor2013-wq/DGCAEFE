'use strict';
// Validare și curățare a datelor primite de la panoul de administrare.
// Nimic din ce vine de la client nu este salvat fără să treacă pe aici.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const store = require('./store');
const { bad } = require('./errors');

const SECTIONS = ['rapoarte', 'acord-ro', 'program', 'auditori', 'plan-crestere', 'general'];
const GROUPS = ['', 'buletin', 'oficial', 'stiri'];
const LEVELS = ['cross', 'trans', 'inter'];
const LEGAL_TYPES = ['Lege', 'HG', 'Ordin', 'Altele'];

/* ---------- elemente de bază ---------- */
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

const UP_RE = { img: /^\/uploads\/img\/[\w.-]+$/, docs: /^\/uploads\/docs\/[\w.-]+$/ };

function uploadPath(p, kind, label) {
  p = String(p || '');
  if (!UP_RE[kind].test(p) || p.includes('..')) throw bad(`Fișierul din „${label}” este invalid.`);
  if (!fs.existsSync(path.join(cfg.DATA_DIR, p))) throw bad(`Fișierul din „${label}” nu mai există pe server. Încărcați-l din nou.`);
  return p;
}

function file(v, label, kind) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw bad(`Câmpul „${label}” este invalid.`);
  const p = uploadPath(v.path, kind, label);
  const out = { path: p, name: str(v.name, label, { max: 200 }) || path.basename(p), size: int(v.size, label, { min: 0, max: 2e9 }) || 0 };
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

/* ---------- colecții ---------- */
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
      if (!store.list('programs').some(p => p.id === program)) throw bad('Alegeți programul căruia îi aparține documentul.');
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

function cleanSettings(b) {
  b = b && typeof b === 'object' ? b : {};
  const c = b.contact && typeof b.contact === 'object' ? b.contact : {};
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
    duties: objList(b.duties, 'Atribuții', 8, d => {
      const title = str(d && d.title, 'Titlul atribuției', { max: 120 });
      const text = str(d && d.text, 'Descrierea atribuției', { max: 500 });
      return title || text ? { title, text } : null;
    }),
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

module.exports = { news, documents, events, legal, gallery, programs, cleanSettings, SECTIONS, GROUPS, LEVELS, LEGAL_TYPES };
