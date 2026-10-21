'use strict';
// Conținutul de pornire (seed/) peste conținutul salvat (storage/): regulile de îmbinare din web/assets/js/content-overlay.js
// și coerența conținutului livrat (Regulamentul și Raportul „Priorități DCAEPI”). Rulează cu: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../web/assets/js/content-overlay.js');
const AdminSchemas = require('../web/assets/js/admin-schemas.js');
const { buildPublic, LEGACY_INVESTMENT_FIELDS, LEGACY_SETTINGS_KEYS } = require('../lib/public');
const { seedContent, seedUpgrades, oldContent, rev3Content, rev4Content, REV4_ABOUT_NOTE } = require('../test-support/old-content');

const clone = v => JSON.parse(JSON.stringify(v));
const names = set => [...set].sort();
const seedDefs = () => ({ seed: seedContent(), upgrades: seedUpgrades() });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/* ---------- regulile de îmbinare ---------- */
test('prima pornire: tot ce lipsește se ia din conținutul de pornire', () => {
  const { seed, upgrades } = seedDefs();
  const r = overlay.apply({}, seed, upgrades);
  assert.deepEqual(names(r.changed), names(new Set(overlay.NAMES)));
  assert.deepEqual(r.content, seed);
  // rezultatul este o copie: modificarea lui nu atinge conținutul de pornire
  r.content.legal[0].title = 'schimbat';
  r.content.settings.contact.phones.push('x');
  assert.notEqual(seed.legal[0].title, 'schimbat');
  assert.ok(!seed.settings.contact.phones.includes('x'));
});

test('aceeași versiune a conținutului de pornire: nu se schimbă nimic', () => {
  const { seed, upgrades } = seedDefs();
  const stored = clone(seed);
  stored.settings.heroLead = 'Text scris de administrator.';
  stored.news = stored.news.slice(1);
  const r = overlay.apply(stored, seed, upgrades);
  assert.equal(r.changed.size, 0);
  assert.deepEqual(r.content, stored);
});

test('conținut salvat de versiunea 1: textele schimbate de om rămân, cele implicite se înlocuiesc, ce lipsește se adaugă', () => {
  const { seed, upgrades } = seedDefs();
  const mine = { heroLead: 'Text scris de administrator.', footerNote: 'Nota mea.', contact: { ...seed.settings.contact, phones: ['022 111 222'] } };
  const stored = oldContent(mine);
  assert.equal(stored.settings.seedRev, undefined);
  assert.equal(stored.legal.length, 8);
  assert.equal(stored.investments, undefined);

  const r = overlay.apply(stored, seed, upgrades);
  assert.deepEqual(names(r.changed), ['investments', 'legal', 'settings']);
  const s = r.content.settings;
  // textele rămase la valoarea implicită veche au primit textul nou
  for (const k of ['orgName', 'heroTitle', 'quickLinks', 'aboutP1', 'aboutP2', 'duties']) assert.deepEqual(s[k], seed.settings[k], k);
  // ce a scris administratorul nu se atinge
  assert.equal(s.heroLead, 'Text scris de administrator.');
  assert.equal(s.footerNote, 'Nota mea.');
  assert.deepEqual(s.contact.phones, ['022 111 222']);
  // cheile care nu existau se completează
  for (const k of ['principles', 'structure', 'rights', 'responsibilities', 'growth']) assert.deepEqual(s[k], seed.settings[k], k);
  assert.ok(!('aboutNote' in s), 'nota despre Regulament nu mai există');
  assert.equal(s.seedRev, seed.settings.seedRev);
  assert.ok(s.updatedAt >= stored.settings.updatedAt);
  // colecțiile
  assert.equal(r.content.investments.length, 19);
  assert.deepEqual(r.content.legal.slice(0, 8), stored.legal, 'actele existente rămân la locul lor');
  assert.deepEqual(r.content.legal.slice(8).map(x => x.id), upgrades[0].add.legal);
  for (const name of ['news', 'documents', 'events', 'programs', 'gallery']) assert.deepEqual(r.content[name], stored[name], `${name} rămâne neatins`);
});

test('o a doua aplicare nu mai schimbă nimic', () => {
  const { seed, upgrades } = seedDefs();
  const first = overlay.apply(oldContent({ heroLead: 'Textul meu.' }), seed, upgrades);
  const again = overlay.apply(first.content, seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.deepEqual(again.content, first.content);
});

test('textul vechi de pe prima pagină este înlocuit oricare ar fi fost varianta lui implicită', () => {
  const { seed, upgrades } = seedDefs();
  const olds = upgrades[0].settings.heroTitle;
  assert.ok(olds.length >= 2);
  for (const old of olds) {
    const r = overlay.apply(oldContent({ heroTitle: old }), seed, upgrades);
    assert.equal(r.content.settings.heroTitle, seed.settings.heroTitle);
  }
  const custom = overlay.apply(oldContent({ heroTitle: 'Titlul ales de administrator' }), seed, upgrades);
  assert.equal(custom.content.settings.heroTitle, 'Titlul ales de administrator');
});

test('un act introdus de mână, cu același număr, nu se dublează; actele șterse de om nu revin', () => {
  const { seed, upgrades } = seedDefs();
  const added = seed.legal.find(x => x.id === upgrades[0].add.legal[0]);
  const stored = oldContent();
  stored.legal.push({ id: 'introdus-de-mana', type: added.type, nr: String(added.nr), year: added.year, title: 'Același act, scris de mână', url: 'https://legis.md/x' });
  const deletedByUser = stored.legal.shift();

  const r = overlay.apply(stored, seed, upgrades);
  const same = r.content.legal.filter(x => x.type === added.type && String(x.nr) === String(added.nr) && x.year === added.year);
  assert.equal(same.length, 1, 'actul nu apare de două ori');
  assert.equal(same[0].id, 'introdus-de-mana', 'rămâne cel introdus de om');
  assert.ok(!r.content.legal.some(x => x.id === deletedByUser.id), 'un act vechi șters de om nu este readus');
  assert.equal(r.content.legal.length, 8 - 1 + 1 + upgrades[0].add.legal.length - 1);

  // după actualizare, ștergerea unui act nou rămâne definitivă
  const afterUpgrade = r.content;
  afterUpgrade.legal = afterUpgrade.legal.filter(x => x.id !== upgrades[0].add.legal[1]);
  const again = overlay.apply(afterUpgrade, seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.ok(!again.content.legal.some(x => x.id === upgrades[0].add.legal[1]));
});

test('proiectele de investiții șterse sau modificate de om nu revin după ce au fost adăugate', () => {
  const { seed, upgrades } = seedDefs();
  const first = overlay.apply(oldContent(), seed, upgrades).content;
  first.investments = first.investments.filter(p => p.order !== 3);
  first.investments.find(p => p.order === 5).beneficiaries = 'Beneficiari scriși de om.';
  const again = overlay.apply(first, seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.equal(again.content.investments.length, 18);
  assert.equal(again.content.investments.find(p => p.order === 5).beneficiaries, 'Beneficiari scriși de om.');
});

test('mai multe versiuni: se aplică doar cele mai noi decât cea salvată și nu se coboară niciodată', () => {
  const seed = { settings: { seedRev: 3, orgName: 'Nou', a: 'a3', b: 'b3', updatedAt: '2026-12-01T00:00:00.000Z' }, news: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] };
  const upgrades = [
    { rev: 3, settings: { b: ['b2'] }, add: { news: ['n3'] } },
    { rev: 2, settings: { a: ['a1'] }, add: { news: ['n2'] } }
  ];
  const empty = Object.fromEntries(overlay.COLLECTIONS.map(n => [n, []]));
  const run = settings => overlay.apply({ ...empty, settings, news: [{ id: 'n1' }] }, seed, upgrades);

  const from1 = run({ orgName: 'Al meu', a: 'a1', b: 'b2' });
  assert.deepEqual(from1.content.news.map(n => n.id), ['n1', 'n2', 'n3']);
  assert.deepEqual([from1.content.settings.a, from1.content.settings.b, from1.content.settings.orgName, from1.content.settings.seedRev], ['a3', 'b3', 'Al meu', 3]);

  const from2 = run({ seedRev: 2, orgName: 'Al meu', a: 'a1', b: 'b2' });
  assert.deepEqual(from2.content.news.map(n => n.id), ['n1', 'n3'], 'pasul 2 nu se mai aplică');
  assert.deepEqual([from2.content.settings.a, from2.content.settings.b], ['a1', 'b3'], 'pasul 2 nu mai înlocuiește a');

  const from3 = run({ seedRev: 3, a: 'a1', b: 'b2' });
  assert.equal(from3.changed.size, 0);
  assert.deepEqual([from3.content.settings.a, from3.content.settings.b], ['a1', 'b2']);

  const newer = run({ seedRev: 9, a: 'a1' });
  assert.equal(newer.changed.size, 0, 'conținut salvat de o versiune mai nouă nu este atins');
  assert.equal(newer.content.settings.seedRev, 9);
});

test('descrieri de actualizare greșite sau incomplete sunt ignorate fără erori', () => {
  const seed = { settings: { seedRev: 2, a: 'nou' }, legal: [{ id: 'l1', type: 'Lege', nr: '1', year: 2020 }] };
  const stored = { settings: { a: 'vechi' }, legal: [] };
  for (const upgrades of [undefined, null, 'x', {}, [null, 5, { rev: 'doi' }, { rev: 2 }], [{ rev: 2, settings: { a: 'nu-este-lista' }, add: { legal: 'l1', necunoscut: ['x'], news: ['x'] } }]]) {
    const r = overlay.apply(clone(stored), clone(seed), upgrades);
    assert.equal(r.content.settings.a, 'vechi', JSON.stringify(upgrades));
    assert.equal(r.content.legal.length, 0, JSON.stringify(upgrades));
    assert.equal(r.content.settings.seedRev, 2);
  }
  // un identificator care nu există în conținutul de pornire nu strică nimic
  const r = overlay.apply(clone(stored), clone(seed), [{ rev: 2, add: { legal: ['nu-exista', 'l1'] } }]);
  assert.deepEqual(r.content.legal.map(x => x.id), ['l1']);
});

test('datele de intrare nu sunt modificate', () => {
  const { seed, upgrades } = seedDefs();
  const stored = oldContent({ heroLead: 'Textul meu.' });
  const before = JSON.stringify([stored, seed, upgrades]);
  overlay.apply(deepFreeze(stored), deepFreeze(seed), deepFreeze(upgrades));
  assert.equal(JSON.stringify([stored, seed, upgrades]), before);
});

test('versiunile 3 și 4: introducerea și nota secțiunii „Investiții” se înlocuiesc doar dacă nu au fost modificate de om', () => {
  const { seed, upgrades } = seedDefs();
  const step3 = upgrades.find(u => u.rev === 3);
  const step4 = upgrades.find(u => u.rev === 4);
  assert.ok(step3 && step3.settings.growth.length === 1, 'versiunea 3 descrie vechiul text implicit');
  assert.ok(step4 && step4.settings.growth.length === 2, 'versiunea 4 descrie ambele texte implicite vechi');
  const [rev2, rev3] = step4.settings.growth;
  assert.match(rev2.intro, /grupate după gradul de maturitate/);
  assert.doesNotMatch(rev3.intro, /grupate după gradul de maturitate/);
  for (const old of [rev2, rev3]) {
    assert.match(old.note, /Bara de progres/);
    assert.doesNotMatch(seed.settings.growth.note, /progres/i);
  }
  assert.doesNotMatch(seed.settings.growth.intro, /maturitate|stare|progres/i);
  const stored = (growth, rev) => ({ ...clone(seed), settings: { ...clone(seed.settings), seedRev: rev, growth: clone(growth) } });

  // textele implicite ale oricărei versiuni vechi primesc textul nou
  for (const [old, rev] of [[rev2, 2], [rev3, 3]]) {
    const r = overlay.apply(stored(old, rev), seed, upgrades);
    assert.deepEqual(r.content.settings.growth, seed.settings.growth, `de la versiunea ${rev}`);
    assert.equal(r.content.settings.seedRev, seed.settings.seedRev);
    assert.ok(r.changed.has('settings'));
  }

  // textul scris de om rămâne, iar cel implicit din aceeași secțiune se înlocuiește (data sau sursele modificate nu opresc actualizarea)
  const edited = [
    [{ ...rev3, asOf: '2026-11-02' }, { asOf: '2026-11-02', intro: seed.settings.growth.intro, note: seed.settings.growth.note, sources: [] }],
    [{ ...rev3, intro: 'Introducerea mea.' }, { asOf: rev3.asOf, intro: 'Introducerea mea.', note: seed.settings.growth.note, sources: [] }],
    [{ ...rev3, note: 'Nota mea.' }, { asOf: rev3.asOf, intro: seed.settings.growth.intro, note: 'Nota mea.', sources: [] }],
    [{ ...rev3, sources: [{ t: 'Sursa mea', u: 'https://exemplu.md' }] }, { asOf: rev3.asOf, intro: seed.settings.growth.intro, note: seed.settings.growth.note, sources: [{ t: 'Sursa mea', u: 'https://exemplu.md' }] }]
  ];
  for (const [mine, expected] of edited) {
    const r = overlay.apply(stored(mine, 3), seed, upgrades);
    assert.deepEqual(r.content.settings.growth, expected, JSON.stringify(mine).slice(0, 80));
    assert.equal(r.content.settings.seedRev, seed.settings.seedRev);
  }
});

test('chei cu punct în upgrades.json („grup.text”): se înlocuiește doar textul din grup, iar grupul nepotrivit nu se atinge', () => {
  const seed = { settings: { seedRev: 2, orgName: 'Nou', g: { a: 'a nou', b: 'b nou', n: { c: 'c nou' } } } };
  const upgrades = [{ rev: 2, settings: { 'g.a': ['a vechi'], 'g.b': ['b vechi'], 'g.n.c': ['c vechi'], 'g.lipsa': ['x'], 'h.a': ['x'] } }];
  const run = g => overlay.apply({ settings: { orgName: 'Al meu', g } }, clone(seed), upgrades).content.settings.g;
  assert.deepEqual(run({ a: 'a vechi', b: 'scris de om', n: { c: 'c vechi' } }), { a: 'a nou', b: 'scris de om', n: { c: 'c nou' } });
  assert.deepEqual(run({ a: 'scris de om', b: 'b vechi', n: { c: 'scris de om' } }), { a: 'scris de om', b: 'b nou', n: { c: 'scris de om' } });
  assert.deepEqual(run('nu este grup'), 'nu este grup');
  assert.deepEqual(run(undefined), seed.settings.g, 'grupul care lipsește cu totul se ia din conținutul de pornire');
});

/* ---------- versiunea 4: proiecte numai cu date generale; versiunea 5: grupate după minister ---------- */
const LEGACY_V3 = ['cluster', 'status', 'progress', 'stage', 'refStage', 'totalStages', 'delays', 'next']; // câmpurile din versiunea 3
const LEGACY = LEGACY_V3.concat('theme'); // plus „obiectivul economic” din versiunea 4
const NEW_FIELDS = ['implementer', 'financier', 'financing', 'period', 'location', 'results', 'beneficiaries'];

test('versiunea 4: proiectele salvate cu stare și progres trec la date generale, fără să se piardă ce a scris omul', () => {
  const { seed, upgrades } = seedDefs();
  const stored = rev3Content();
  assert.ok(stored.investments.every(p => LEGACY_V3.every(k => k in p)), 'conținutul de pornire al versiunii 3 are câmpurile vechi');

  const mine = stored.investments.find(p => p.order === 3);
  mine.name = 'Denumirea scrisă de mine';
  mine.amount = 250;
  mine.published = false;
  const deleted = stored.investments.splice(stored.investments.findIndex(p => p.order === 7), 1)[0];
  stored.investments.push({
    id: 'adaugat-de-om', order: 20, name: 'Proiect adăugat de mine', ministry: 'MF', amount: 10, currency: 'EUR', amountQual: '', cluster: 'initiere', status: 'termen', progress: 10, stage: 8,
    refStage: 8, totalStages: 77, text: 'Textul meu despre stadiu.', delays: 'Întârzieri.', next: 'Pasul meu.', links: [{ t: 'Sursa', u: 'https://exemplu.md' }], published: true,
    createdAt: '2026-10-21T08:00:00.000Z', updatedAt: '2026-10-21T08:00:00.000Z'
  });

  const r = overlay.apply(clone(stored), seed, upgrades);
  assert.ok(r.changed.has('investments') && r.changed.has('settings'));
  assert.equal(r.content.investments.length, 19, '18 din listă + 1 adăugat de om');
  for (const p of r.content.investments) for (const k of LEGACY) assert.ok(!(k in p), `proiectul ${p.order}: „${k}” a fost șters`);

  // un proiect din listă: textul și datele generale vin din conținutul de pornire, ce a scris omul rămâne
  const p3 = r.content.investments.find(p => p.id === mine.id);
  const s3 = seed.investments.find(p => p.id === mine.id);
  assert.equal(p3.name, 'Denumirea scrisă de mine');
  assert.equal(p3.amount, 250);
  assert.equal(p3.published, false);
  for (const k of ['text', ...NEW_FIELDS]) assert.deepEqual(p3[k], s3[k], k);
  assert.doesNotMatch(p3.text, /Stadiul actual/);

  // proiectul șters de om nu revine
  assert.ok(!r.content.investments.some(p => p.id === deleted.id));

  // proiectul adăugat de om: pierde numai câmpurile vechi, își păstrează textul
  const added = r.content.investments.find(p => p.id === 'adaugat-de-om');
  assert.equal(added.text, 'Textul meu despre stadiu.');
  assert.deepEqual(added.links, [{ t: 'Sursa', u: 'https://exemplu.md' }]);
  assert.equal(added.name, 'Proiect adăugat de mine');
  for (const k of NEW_FIELDS) assert.ok(!(k in added), `„${k}” nu se inventează pentru un proiect care nu există în conținutul de pornire`);

  // restul conținutului nu se atinge
  for (const name of ['news', 'documents', 'events', 'legal', 'programs', 'gallery']) assert.deepEqual(r.content[name], stored[name], name);
  assert.deepEqual(r.content.settings.growth, seed.settings.growth);
  assert.equal(r.content.settings.seedRev, seed.settings.seedRev);

  // a doua aplicare nu mai schimbă nimic
  const again = overlay.apply(clone(r.content), seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.deepEqual(again.content, r.content);
});

test('versiunea 4: de la oricare versiune mai veche se ajunge la același rezultat, iar proiectele deja noi nu se ating', () => {
  const { seed, upgrades } = seedDefs();
  const fromV1 = overlay.apply(oldContent(), seed, upgrades).content;
  assert.deepEqual(fromV1.investments, seed.investments, 'conținutul versiunii 1 primește direct proiectele noi');

  const fromV3 = overlay.apply(rev3Content(), seed, upgrades).content;
  assert.equal(fromV3.investments.length, 19);
  for (const p of fromV3.investments) {
    const s = seed.investments.find(x => x.id === p.id);
    for (const k of ['text', ...NEW_FIELDS]) assert.deepEqual(p[k], s[k], `proiectul ${p.order}: „${k}” vine din conținutul de pornire`);
    for (const k of LEGACY) assert.ok(!(k in p), `proiectul ${p.order}: „${k}” a fost șters`);
  }

  // proiectele care au deja forma nouă nu se ating, nici dacă „seedRev” este vechi
  const stored = rev3Content();
  stored.investments = clone(seed.investments);
  stored.investments[0].beneficiaries = 'Beneficiari scriși de om.';
  const r = overlay.apply(stored, seed, upgrades);
  assert.equal(r.content.investments[0].beneficiaries, 'Beneficiari scriși de om.');
  assert.deepEqual(r.content.investments.slice(1), seed.investments.slice(1));
  assert.ok(!r.changed.has('investments'));
});

test('versiunea 5: proiectele salvate cu „obiectiv economic” îl pierd, iar ce a scris omul rămâne', () => {
  const { seed, upgrades } = seedDefs();
  const stored = rev4Content();
  assert.equal(stored.settings.seedRev, 4);
  assert.ok(stored.investments.every(p => typeof p.theme === 'string' && p.theme), 'conținutul versiunii 4 are „obiectivul economic”');

  const mine = stored.investments.find(p => p.order === 3);
  Object.assign(mine, { name: 'Denumirea scrisă de mine', ministry: 'MF', beneficiaries: 'Beneficiari scriși de om.', published: false });
  const deleted = stored.investments.splice(stored.investments.findIndex(p => p.order === 7), 1)[0];
  stored.investments.push({
    id: 'adaugat-de-om', order: 20, name: 'Proiect adăugat de mine', ministry: 'MM', theme: 'social', amount: 10, currency: 'EUR', amountQual: '', text: 'Textul meu.',
    links: [{ t: 'Sursa', u: 'https://exemplu.md' }], published: true, createdAt: '2026-10-21T08:00:00.000Z', updatedAt: '2026-10-21T08:00:00.000Z'
  });

  const r = overlay.apply(clone(stored), seed, upgrades);
  assert.ok(r.changed.has('investments') && r.changed.has('settings'));
  assert.equal(r.content.investments.length, 19, '18 din listă + 1 adăugat de om');
  // fiecare proiect pierde numai „theme”; tot ce a scris omul (denumire, minister, beneficiari, ascundere) rămâne
  for (const p of stored.investments) {
    const { theme, ...rest } = p; // eslint-disable-line no-unused-vars
    assert.deepEqual(r.content.investments.find(x => x.id === p.id), rest, `proiectul ${p.order}`);
  }
  const p3 = r.content.investments.find(p => p.id === mine.id);
  assert.deepEqual([p3.name, p3.ministry, p3.beneficiaries, p3.published], ['Denumirea scrisă de mine', 'MF', 'Beneficiari scriși de om.', false]);
  assert.ok(!r.content.investments.some(p => p.id === deleted.id), 'proiectul șters de om nu revine');
  assert.equal(r.content.investments.find(p => p.id === 'adaugat-de-om').ministry, 'MM');

  // introducerea secțiunii primește textul nou, iar restul conținutului nu se atinge
  assert.deepEqual(r.content.settings.growth, seed.settings.growth);
  assert.equal(r.content.settings.seedRev, seed.settings.seedRev);
  for (const name of ['news', 'documents', 'events', 'legal', 'programs', 'gallery']) assert.deepEqual(r.content[name], stored[name], name);

  // a doua aplicare nu mai schimbă nimic
  const again = overlay.apply(clone(r.content), seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.deepEqual(again.content, r.content);
});

test('versiunea 5: introducerea secțiunii „Investiții” se înlocuiește doar dacă nu a fost modificată de om; nota veche nu se publică', () => {
  const { seed, upgrades } = seedDefs();
  const step5 = upgrades.find(u => u.rev === 5);
  const old = step5.settings.growth[0];
  assert.match(old.intro, /cinci obiective economice/);
  assert.doesNotMatch(seed.settings.growth.intro, /obiective economice/);
  assert.equal(old.note, seed.settings.growth.note, 'nota de la finalul secțiunii nu s-a schimbat');
  assert.deepEqual(step5.settings['growth.intro'], [old.intro]);

  // textul implicit al versiunii 4 primește textul nou
  const r = overlay.apply(rev4Content(), seed, upgrades);
  assert.deepEqual(r.content.settings.growth, seed.settings.growth);

  // textul scris de om rămâne, iar introducerea implicită se înlocuiește (data sau nota modificate nu opresc actualizarea)
  const edited = [
    [{ ...old, asOf: '2026-11-02' }, { asOf: '2026-11-02', intro: seed.settings.growth.intro, note: old.note, sources: [] }],
    [{ ...old, intro: 'Introducerea mea.' }, { asOf: old.asOf, intro: 'Introducerea mea.', note: old.note, sources: [] }],
    [{ ...old, note: 'Nota mea.' }, { asOf: old.asOf, intro: seed.settings.growth.intro, note: 'Nota mea.', sources: [] }]
  ];
  for (const [mine, expected] of edited) {
    const out = overlay.apply(rev4Content({ growth: mine }), seed, upgrades);
    assert.deepEqual(out.content.settings.growth, expected, JSON.stringify(mine).slice(0, 80));
    assert.equal(out.content.settings.seedRev, seed.settings.seedRev);
  }

  // nota despre Regulament mai rămâne în fișierul salvat (se pierde la prima salvare a textelor), dar nu se publică
  assert.equal(r.content.settings.aboutNote, REV4_ABOUT_NOTE);
  assert.deepEqual(LEGACY_SETTINGS_KEYS, ['aboutNote']);
  const pub = buildPublic(name => r.content[name]);
  assert.ok(!('aboutNote' in pub.settings), 'nota veche nu iese în pagina publică');
  assert.ok(!JSON.stringify(pub).includes('provin din Regulamentul de activitate'));
});

test('migrările din upgrades.json: descrieri greșite sunt ignorate fără erori, iar o înregistrare fără câmpuri vechi nu se atinge', () => {
  const seed = { settings: { seedRev: 2 }, investments: [{ id: 'a', text: 'nou', cheie: 'export' }] };
  const stored = { settings: {}, investments: [{ id: 'a', text: 'vechi', status: 'termen' }, { id: 'b', text: 'al omului' }, null, 5] };
  for (const migrate of [undefined, null, 'x', [], { investments: 'x' }, { investments: null }, { necunoscut: { drop: ['status'] } }, { investments: { drop: 'status' } }]) {
    const r = overlay.apply(clone(stored), clone(seed), [{ rev: 2, migrate }]);
    assert.equal(r.content.investments[0].status, 'termen', JSON.stringify(migrate));
    assert.equal(r.content.investments[1].text, 'al omului', JSON.stringify(migrate));
  }
  const r = overlay.apply(clone(stored), clone(seed), [{ rev: 2, migrate: { investments: { drop: ['status'], replace: ['text'], fill: ['cheie', 'lipsa'] } } }]);
  assert.deepEqual(r.content.investments.slice(0, 2), [{ id: 'a', text: 'nou', cheie: 'export' }, { id: 'b', text: 'al omului' }]);
  assert.deepEqual(r.content.investments.slice(2), [null, 5], 'valorile care nu sunt înregistrări rămân cum erau');
});

/* ---------- coerența conținutului livrat ---------- */
test('conținutul de pornire: versiunea, lista de actualizare și identificatorii se potrivesc', () => {
  const { seed, upgrades } = seedDefs();
  assert.equal(seed.settings.seedRev, Math.max(...upgrades.map(u => u.rev)), '„seedRev” este cea mai nouă versiune descrisă în upgrades.json');
  assert.equal(new Set(upgrades.map(u => u.rev)).size, upgrades.length, 'fiecare versiune este descrisă o singură dată');
  for (const name of overlay.COLLECTIONS) {
    const ids = seed[name].map(x => x.id);
    assert.ok(ids.every(id => typeof id === 'string' && id), `${name}: toate au identificator`);
    assert.equal(new Set(ids).size, ids.length, `${name}: identificatori unici`);
  }
  for (const u of upgrades) {
    for (const [name, ids] of Object.entries(u.add || {})) {
      assert.ok(overlay.COLLECTIONS.includes(name), `colecție necunoscută: ${name}`);
      const have = new Set(seed[name].map(x => x.id));
      for (const id of ids) assert.ok(have.has(id), `${name}: ${id} nu există în conținutul de pornire`);
    }
    for (const [key, olds] of Object.entries(u.settings || {})) {
      const now = key.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), seed.settings);
      assert.ok(now !== undefined, `settings: ${key} nu există în conținutul de pornire`);
      assert.ok(Array.isArray(olds) && olds.length, `settings.${key}: lista valorilor vechi`);
      assert.ok(!olds.some(o => JSON.stringify(o) === JSON.stringify(now)), `settings.${key}: valoarea nouă nu poate fi și una veche`);
    }
    for (const [name, spec] of Object.entries(u.migrate || {})) {
      assert.ok(overlay.COLLECTIONS.includes(name), `migrate: colecție necunoscută: ${name}`);
      for (const rec of seed[name]) for (const k of spec.drop || []) assert.ok(!(k in rec), `${name}: conținutul de pornire nu mai poate avea câmpul „${k}”`);
      for (const k of [...(spec.replace || []), ...(spec.fill || [])]) assert.ok(seed[name].every(rec => k in rec), `${name}: câmpul „${k}” trebuie să existe în tot conținutul de pornire`);
    }
  }
  const legal = seed.legal.map(x => `${x.type}|${x.nr}|${x.year}`);
  assert.equal(new Set(legal).size, legal.length, 'niciun act normativ nu apare de două ori');
});

test('proiectele din Planul de creștere: trec prin aceleași reguli ca la salvarea din administrare și au numai date generale', () => {
  const { seed } = seedDefs();
  const { investments } = AdminSchemas.create({ bad: msg => Object.assign(new Error(msg), { status: 400 }), fileExists: () => true, programs: () => seed.programs });
  assert.equal(seed.investments.length, 19);
  const allowed = new Set(['id', 'createdAt', 'updatedAt', 'order', 'name', 'ministry', 'implementer', 'financier', 'amount', 'currency', 'amountQual', 'financing', 'period', 'location', 'text', 'results', 'beneficiaries', 'links', 'published']);
  for (const p of seed.investments) {
    const c = investments.clean(p);
    for (const k of ['order', 'name', 'ministry', 'implementer', 'financier', 'amount', 'currency', 'amountQual', 'financing', 'period', 'location', 'text', 'results', 'beneficiaries', 'links', 'published']) {
      assert.deepEqual(c[k], p[k], `proiectul ${p.order}: „${k}” se schimbă la validare`);
    }
    assert.deepEqual(Object.keys(p).filter(k => !allowed.has(k)), [], `proiectul ${p.order}: câmpuri care nu mai există`);
    for (const k of LEGACY) assert.ok(!(k in p), `proiectul ${p.order}: fără „${k}”`);
    // datele generale pe care le are fiecare proiect din listă
    for (const k of ['name', 'ministry', 'financier', 'text']) assert.ok(String(p[k] || '').trim(), `proiectul ${p.order}: lipsește „${k}”`);
    assert.ok(typeof p.amount === 'number' && p.amount > 0, `proiectul ${p.order}: valoarea`);
    assert.ok(p.results.length >= 1, `proiectul ${p.order}: rezultatele preconizate`);
    assert.match(p.financier, /\(([^()]{2,12})\)$|^BEI și BERD$|^BERD \/ BEI$|^Urmează a fi stabilit$/, `proiectul ${p.order}: partenerul de finanțare (denumire completă urmată de abreviere)`);
  }
  assert.deepEqual(seed.investments.map(p => p.order).sort((a, b) => a - b), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.equal(new Set(seed.investments.map(p => p.name)).size, 19, 'denumiri diferite');
});

test('textele și actele din conținutul de pornire sunt exact în forma în care le salvează panoul', () => {
  const { seed } = seedDefs();
  const { cleanSettings, legal } = AdminSchemas.create({ bad: msg => Object.assign(new Error(msg), { status: 400 }), fileExists: () => true, programs: () => seed.programs });
  const { seedRev, updatedAt, ...texts } = seed.settings; // eslint-disable-line no-unused-vars
  assert.deepEqual(cleanSettings(seed.settings), texts, 'o salvare fără modificări nu trebuie să schimbe nimic (de exemplu numerele scrise ca text)');
  for (const act of seed.legal) {
    const { id, createdAt, updatedAt: u, ...rest } = act; // eslint-disable-line no-unused-vars
    assert.deepEqual(legal.clean(act, act), rest, `actul ${act.type} ${act.nr}/${act.year}`);
  }
});

test('proiectele sunt grupate după ministerele care le promovează: fiecare aparține unui minister, iar împărțirea corespunde listei oficiale', () => {
  const { seed } = seedDefs();
  const byMinistry = m => seed.investments.filter(p => p.ministry === m).map(p => p.order).sort((a, b) => a - b);
  assert.deepEqual(byMinistry('MIDR'), [3, 7, 8, 9, 18]);
  assert.deepEqual(byMinistry('MEN'), [12, 13, 14, 16]);
  assert.deepEqual(byMinistry('MAIA'), [2, 4, 17]);
  assert.deepEqual(byMinistry('MEC'), [1, 5, 11]);
  assert.deepEqual(byMinistry('MS'), [10, 19]);
  assert.deepEqual(byMinistry('MDED'), [6]);
  assert.deepEqual(byMinistry('MM'), [15]);
  const all = ['MIDR', 'MEN', 'MAIA', 'MEC', 'MS', 'MDED', 'MM'].flatMap(byMinistry);
  assert.equal(all.length, 19, 'niciun proiect nu rămâne fără minister');
  assert.equal(new Set(all).size, 19, 'niciun proiect nu apare la două ministere');
  assert.ok(seed.investments.every(p => !('theme' in p)), 'nu mai există „obiectivul economic”');
  assert.ok(!('aboutNote' in seed.settings), 'nu mai există nota despre Regulament în „Despre direcție”');
  assert.doesNotMatch(seed.settings.growth.intro, /obiective economice/);
  assert.equal(AdminSchemas.INV_THEMES, undefined, 'lista obiectivelor economice a fost scoasă din reguli');
});

test('conținutul livrat nu poartă legături către rapoarte interne', () => {
  const { seed } = seedDefs();
  assert.ok(!/powerbi/i.test(JSON.stringify(seed)), 'fără legături Power BI');
  for (const p of seed.investments) assert.deepEqual(p.links, [], `proiectul ${p.order}`);
});

/* ---------- ce se publică ---------- */
test('conținutul public: proiectele ascunse nu se publică, ordinea este cea din Raport, „seedRev” nu iese din sistem', () => {
  const { seed } = seedDefs();
  const data = clone(seed);
  data.investments[4].published = false;
  data.investments.reverse();
  const get = name => data[name];
  const pub = buildPublic(get);
  assert.equal(pub.investments.length, 18);
  assert.deepEqual(pub.investments.map(p => p.order), pub.investments.map(p => p.order).slice().sort((a, b) => a - b));
  assert.ok(!pub.investments.some(p => p.id === seed.investments[4].id));
  assert.ok(!('seedRev' in pub.settings));
  assert.equal(data.settings.seedRev, seed.settings.seedRev, 'conținutul intern își păstrează „seedRev”');
  assert.ok(pub.lastUpdated >= seed.settings.updatedAt);
});

test('conținutul public nu trimite câmpuri de stare, de progres sau „obiectivul economic”, nici dacă au rămas într-un fișier salvat de o versiune anterioară', () => {
  const { seed } = seedDefs();
  const data = clone(seed);
  Object.assign(data.investments[0], { cluster: 'semnat', status: 'termen', progress: 50, stage: 1, refStage: 2, totalStages: 77, delays: 'Întârzieri.', next: 'Pasul următor.', theme: 'export' });
  const pub = buildPublic(name => data[name]);
  assert.equal(pub.investments.length, 19);
  for (const p of pub.investments) for (const k of LEGACY_INVESTMENT_FIELDS) assert.ok(!(k in p), `„${k}” nu iese în pagina publică`);
  assert.deepEqual(LEGACY_INVESTMENT_FIELDS.slice().sort(), LEGACY.slice().sort());
  const first = pub.investments.find(p => p.id === data.investments[0].id);
  for (const k of ['name', 'ministry', 'financier', 'amount', 'text', 'results']) assert.deepEqual(first[k], data.investments[0][k], k);
  assert.equal(data.investments[0].status, 'termen', 'conținutul intern nu este modificat de publicare');
});
