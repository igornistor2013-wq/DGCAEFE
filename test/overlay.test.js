'use strict';
// Conținutul de pornire (seed/) peste conținutul salvat (storage/): regulile de îmbinare din web/assets/js/content-overlay.js
// și coerența conținutului livrat (Regulamentul și Raportul „Priorități DCAEPI”). Rulează cu: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../web/assets/js/content-overlay.js');
const AdminSchemas = require('../web/assets/js/admin-schemas.js');
const { buildPublic } = require('../lib/public');
const { seedContent, seedUpgrades, oldContent } = require('../test-support/old-content');

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
  for (const k of ['principles', 'structure', 'rights', 'responsibilities', 'growth', 'aboutNote']) assert.deepEqual(s[k], seed.settings[k], k);
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
  first.investments.find(p => p.order === 5).status = 'blocat';
  const again = overlay.apply(first, seed, upgrades);
  assert.equal(again.changed.size, 0);
  assert.equal(again.content.investments.length, 18);
  assert.equal(again.content.investments.find(p => p.order === 5).status, 'blocat');
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

test('versiunea 3: introducerea secțiunii „Investiții” se înlocuiește doar dacă nu a fost modificată de om', () => {
  const { seed, upgrades } = seedDefs();
  const step = upgrades.find(u => u.rev === 3);
  assert.ok(step && step.settings.growth.length === 1, 'versiunea 3 descrie vechiul text implicit');
  const oldGrowth = step.settings.growth[0];
  assert.match(oldGrowth.intro, /grupate după gradul de maturitate/);
  assert.doesNotMatch(seed.settings.growth.intro, /grupate după gradul de maturitate/);
  const stored = growth => ({ ...clone(seed), settings: { ...clone(seed.settings), seedRev: 2, growth: clone(growth) } });

  const untouched = overlay.apply(stored(oldGrowth), seed, upgrades);
  assert.deepEqual(untouched.content.settings.growth, seed.settings.growth, 'textul implicit vechi primește textul nou');
  assert.equal(untouched.content.settings.seedRev, seed.settings.seedRev);
  assert.ok(untouched.changed.has('settings'));

  for (const mine of [{ ...oldGrowth, asOf: '2026-11-02' }, { ...oldGrowth, intro: 'Introducerea mea.' }, { ...oldGrowth, note: 'Nota mea.' }]) {
    const r = overlay.apply(stored(mine), seed, upgrades);
    assert.deepEqual(r.content.settings.growth, mine, 'ce a modificat omul rămâne');
    assert.equal(r.content.settings.seedRev, seed.settings.seedRev);
  }
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
      assert.ok(key in seed.settings, `settings: ${key} nu există în conținutul de pornire`);
      assert.ok(Array.isArray(olds) && olds.length, `settings.${key}: lista valorilor vechi`);
      assert.ok(!olds.some(o => JSON.stringify(o) === JSON.stringify(seed.settings[key])), `settings.${key}: valoarea nouă nu poate fi și una veche`);
    }
  }
  const legal = seed.legal.map(x => `${x.type}|${x.nr}|${x.year}`);
  assert.equal(new Set(legal).size, legal.length, 'niciun act normativ nu apare de două ori');
});

test('proiectele din Planul de creștere: trec prin aceleași reguli ca la salvarea din administrare', () => {
  const { seed } = seedDefs();
  const { investments } = AdminSchemas.create({ bad: msg => Object.assign(new Error(msg), { status: 400 }), fileExists: () => true, programs: () => seed.programs });
  assert.equal(seed.investments.length, 19);
  for (const p of seed.investments) {
    const c = investments.clean(p);
    for (const k of ['name', 'ministry', 'amount', 'currency', 'amountQual', 'cluster', 'status', 'progress', 'stage', 'refStage', 'totalStages', 'text', 'delays', 'next', 'published']) {
      assert.deepEqual(c[k], p[k], `proiectul ${p.order}: „${k}” se schimbă la validare`);
    }
    assert.ok(p.progress >= 0 && p.progress <= 100 && p.stage <= p.totalStages && p.refStage <= p.totalStages, `proiectul ${p.order}`);
  }
  assert.deepEqual(seed.investments.map(p => p.order).sort((a, b) => a - b), Array.from({ length: 19 }, (_, i) => i + 1));
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

test('cifrele din pagină se calculează din proiecte și corespund Raportului', () => {
  const { seed } = seedDefs();
  const count = key => seed.investments.reduce((m, p) => ({ ...m, [p[key]]: (m[p[key]] || 0) + 1 }), {});
  assert.deepEqual(count('cluster'), { initiere: 5, fezabilitate: 6, maturitate: 1, negociere: 2, semnat: 5 });
  assert.deepEqual(count('status'), { intarziere: 16, termen: 1, blocat: 1, implementare: 1 });
  // proiectele la care se referă fiecare etapă de maturitate (după numărul din Raport)
  const byCluster = c => seed.investments.filter(p => p.cluster === c).map(p => p.order).sort((a, b) => a - b);
  assert.deepEqual(byCluster('initiere'), [9, 12, 13, 14, 18]);
  assert.deepEqual(byCluster('fezabilitate'), [6, 7, 8, 10, 11, 15]);
  assert.deepEqual(byCluster('maturitate'), [17]);
  assert.deepEqual(byCluster('negociere'), [5, 16]);
  assert.deepEqual(byCluster('semnat'), [1, 2, 3, 4, 19]);
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
