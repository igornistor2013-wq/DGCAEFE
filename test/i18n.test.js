'use strict';
// Versiunile în rusă și în engleză: dicționare, localizare a datelor, traduceri din administrare, pagini generate, rute.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-i18n-'));
process.env.DATA_DIR = tmp;
process.env.ENV_FILE = path.join(tmp, 'nu-exista.env');
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'Test-Parola-123!';
process.env.BCRYPT_COST = '4';
delete process.env.SITE_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const cfg = require('../lib/config');
const prerender = require('../lib/prerender');
const staticSite = require('../lib/static-site');
const { buildPublic } = require('../lib/public');
const I18n = require('../web/assets/js/i18n.js');
const i18nData = require('../lib/i18n-data');
const AdminSchemas = require('../web/assets/js/admin-schemas.js');
const { missing } = require('../scripts/i18n-check.js');
const { createApp } = require('../server');

const reader = () => staticSite.diskReader(cfg.SEED_DIR, cfg.SEED_DIR);
const textOf = e => (e.text !== undefined ? e.text : fs.readFileSync(e.file, 'utf8'));
const template = fs.readFileSync(path.join(cfg.WEB_DIR, 'index.html'), 'utf8');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('limbile: română implicită, rusă și engleză, fiecare cu fișierul și adresa ei', () => {
  assert.deepEqual(I18n.LANGS, ['ro', 'ru', 'en']);
  assert.equal(I18n.DEFAULT, 'ro');
  assert.equal(I18n.META.ru.file, 'ru.html');
  assert.equal(I18n.META.en.path, '/en');
  assert.ok(I18n.isLang('ru') && !I18n.isLang('de') && !I18n.isLang(undefined));
});

test('data și numerele se scriu după regulile fiecărei limbi', () => {
  assert.equal(I18n.fmtDate('ro', '2026-10-20'), '20 octombrie 2026');
  assert.equal(I18n.fmtDate('ru', '2026-10-20'), '20 октября 2026 г.');
  assert.match(I18n.fmtDate('en', '2026-10-20'), /^20 October 2026$/);
  assert.equal(I18n.num('en', 1234.5), '1234.5');
  assert.equal(I18n.num('ro', 1234.5), '1234,5');
  assert.match(I18n.num('ru', 62.87), /62,87/);
  assert.match(I18n.num('en', 62.87), /62\.87/);
});

test('plural în rusă: trei forme după numeral', () => {
  const f = ['проект', 'проекта', 'проектов'];
  const pick = n => I18n.plural('ru', n, f);
  assert.deepEqual([1, 2, 4, 5, 11, 12, 19, 21, 22, 25, 100, 101].map(pick), ['проект', 'проекта', 'проекта', 'проектов', 'проектов', 'проектов', 'проектов', 'проект', 'проекта', 'проектов', 'проектов', 'проект']);
});

test('dicționarele conțin traduceri pentru tot conținutul de pornire', () => {
  for (const lang of ['ru', 'en']) {
    const m = missing(lang);
    // singurele texte rămase la fel sunt nume proprii sau titluri deja scrise în engleză
    assert.ok(m.every(([, s]) => /^(?:EU City Lab|urbact\.eu|Online|Bălți|R7:)/.test(s)), `${lang}: ${m.map(x => x[1]).join(' | ')}`);
    const ui = i18nData.uiDict(lang);
    assert.ok(Object.keys(ui).length > 300, `${lang}: dicționarul paginii`);
    for (const [k, v] of Object.entries(ui)) assert.ok(typeof v === 'string' && v.trim(), `${lang}: valoare goală pentru „${k}”`);
  }
});

test('traducerile din dicționar păstrează marcajele %1 %2 %3', () => {
  const marks = s => (s.match(/%\d/g) || []).sort().join('');
  for (const lang of ['ru', 'en']) {
    for (const [k, v] of Object.entries(i18nData.uiDict(lang))) {
      // (excepție: „Participă la %1 Interreg %2” primește și numărul programelor, ca al treilea argument)
      if (/%\d/.test(k) && !k.startsWith('Participă la')) assert.equal(marks(v), marks(k), `${lang}: ${k}`);
    }
  }
});

test('localize: traducerea din administrare (tr) are prioritate, tr nu ajunge în pagină, restul trece prin dicționar', () => {
  const data = {
    settings: { orgName: 'Cancelaria de Stat', tr: { en: { orgName: 'Our own name' } } },
    news: [{ id: 'a', title: 'Titlu nou', tag: 'Anunț', tr: { ru: { title: 'Новый заголовок' } } }]
  };
  const dict = { 'Anunț': 'Объявление', 'Cancelaria de Stat': 'Государственная канцелярия' };
  const ru = I18n.localize(data, 'ru', dict);
  assert.equal(ru.news[0].title, 'Новый заголовок');
  assert.equal(ru.news[0].tag, 'Объявление');
  assert.equal(ru.news[0].id, 'a');
  assert.equal(ru.settings.orgName, 'Государственная канцелярия');
  assert.ok(!('tr' in ru.news[0]) && !('tr' in ru.settings));
  const en = I18n.localize(data, 'en', {});
  assert.equal(en.settings.orgName, 'Our own name');
  assert.equal(en.news[0].title, 'Titlu nou', 'fără traducere rămâne în română');
  const ro = I18n.localize(data, 'ro', dict);
  assert.equal(ro.news[0].title, 'Titlu nou');
  assert.ok(!('tr' in ro.news[0]) && !('tr' in ro.settings));
  assert.equal(data.news[0].tr.ru.title, 'Новый заголовок', 'datele originale nu se modifică');
});

test('buildPublic: aceleași date, în fiecare limbă; câmpurile de logică rămân în română', () => {
  const ro = buildPublic(reader());
  const ru = buildPublic(reader(), 'ru');
  const en = buildPublic(reader(), 'en');
  assert.equal(ro.investments.length, ru.investments.length);
  assert.equal(ro.news.length, en.news.length);
  assert.notEqual(ru.settings.orgName, ro.settings.orgName);
  assert.match(ru.settings.orgName, /[А-Яа-я]/);
  assert.match(en.settings.orgName, /^General Directorate/);
  assert.deepEqual(ru.investments.map(p => p.id), ro.investments.map(p => p.id));
  assert.deepEqual(ru.investments.map(p => p.ministry), ro.investments.map(p => p.ministry));
  assert.deepEqual(en.documents.map(d => d.section), ro.documents.map(d => d.section));
  assert.deepEqual(ru.news.map(n => n.date), ro.news.map(n => n.date));
});

test('translateHtml: textele și atributele se traduc, marcajul rămâne neatins', () => {
  I18n.setUi('ru', { 'Contacte': 'Контакты', 'Căutare': 'Поиск' });
  const html = '<nav aria-label="Căutare"><a href="#contacte" class="x">Contacte</a><b>Necunoscut</b></nav>';
  assert.equal(I18n.translateHtml(html, 'ru'), '<nav aria-label="Поиск"><a href="#contacte" class="x">Контакты</a><b>Necunoscut</b></nav>');
  assert.equal(I18n.translateHtml(html, 'ro'), html);
});

test('traducerile din administrare: validare, limite și ștergere', () => {
  const sc = AdminSchemas.create({ programs: () => [] });
  const base = { title: 'Titlu', date: '2026-01-02' };
  const clean = (b, ex) => sc.news.clean({ ...base, ...b }, ex || null);
  assert.ok(!('tr' in clean({})), 'fără traduceri nu apare tr');
  const out = clean({ tr: { ru: { title: '  Заголовок  ', summary: '', bogus: 'x' }, en: { title: 'Title' }, de: { title: 'Titel' } } });
  assert.deepEqual(out.tr, { ru: { title: 'Заголовок' }, en: { title: 'Title' } });
  assert.throws(() => clean({ tr: { ru: { title: 'x'.repeat(201) } } }), /Titlu \(RU\)/);
  // ștergerea tuturor traducerilor suprascrie valoarea veche
  const cleared = clean({}, { id: 'a', tr: { ru: { title: 'x' } } });
  assert.ok('tr' in cleared && cleared.tr === undefined);
  assert.deepEqual({ ...{ tr: { ru: {} } }, ...cleared }.tr, undefined);
  // listele și câmpurile imbricate
  const ev = sc.events.clean({ title: 'T', start: '2026-02-01', summary: 'S', tr: { en: { details: 'a\n b\n\n', summary: 'Summary' } } }, null);
  assert.deepEqual(ev.tr, { en: { summary: 'Summary', details: ['a', 'b'] } });
  const st = sc.cleanSettings({ orgName: 'Org', tr: { ru: { 'growth': { intro: 'Введение' }, contact: { address: 'Адрес' } } } });
  assert.deepEqual(st.tr, { ru: { growth: { intro: 'Введение' }, contact: { address: 'Адрес' } } });
});

test('rubrica „Cooperare externă” se editează din administrare, cu traduceri', () => {
  const sc = AdminSchemas.create({ programs: () => [] });
  const st = sc.cleanSettings({ orgName: 'Org', coop: { title: ' Cooperare ', ampUrl: 'https://amp.gov.md/portal/', ampChips: 'A\nB\n', ampText: 'Text' }, tr: { ru: { coop: { ampTitle: 'Платформа', ampChips: ['А'] } } } });
  assert.equal(st.coop.title, 'Cooperare');
  assert.deepEqual(st.coop.ampChips, ['A', 'B']);
  assert.equal(st.coop.ampUrl, 'https://amp.gov.md/portal/');
  assert.deepEqual(st.tr.ru.coop, { ampTitle: 'Платформа', ampChips: ['А'] });
  assert.throws(() => sc.cleanSettings({ orgName: 'Org', coop: { ampUrl: 'javascript:alert(1)' } }));
  assert.throws(() => sc.cleanSettings({ orgName: 'Org', coop: { acordAmount: 'x'.repeat(61) } }));
});

test('pagina statică are trei versiuni, cu limba, canonicul și legăturile hreflang corecte', () => {
  const files = new Map(staticSite.entries(reader(), cfg.SEED_DIR, { siteUrl: 'https://exemplu.github.io/depozit/' }).map(e => [e.name, e]));
  for (const [file, lang] of [['index.html', 'ro'], ['ru.html', 'ru'], ['en.html', 'en']]) {
    assert.ok(files.has(file), file);
    const html = textOf(files.get(file));
    assert.match(html, new RegExp(`<html[^>]* lang="${lang}"`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="ru" href="https://exemplu\\.github\\.io/depozit/ru\\.html"`));
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, new RegExp(`<a [^>]*hreflang="${lang}"[^>]*aria-current="true"|<a [^>]*aria-current="true"[^>]*hreflang="${lang}"`));
    const emb = /<script type="application\/json" id="seed-data">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(emb, 'date încorporate');
    assert.ok(!/"tr":/.test(emb[1]), 'câmpul tr nu ajunge în pagină');
    assert.equal(/id="i18n-ui"/.test(html), lang !== 'ro');
  }
  assert.match(textOf(files.get('ru.html')), /og:locale" content="ru_RU"/);
  assert.match(textOf(files.get('en.html')), /<title>General Directorate/);
  assert.match(textOf(files.get('ru.html')), /<title>Генеральная дирекция/);
});

test('fonturile: pagina în rusă cere din timp și literele chirilice; română și engleză, numai pe cele latine', () => {
  const files = new Map(staticSite.entries(reader(), cfg.SEED_DIR, { siteUrl: 'https://exemplu.github.io/depozit/' }).map(e => [e.name, e]));
  const pre = f => [...textOf(files.get(f)).matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(m => m[1]);
  const latin = ['assets/fonts/onest-latin-400.woff2', 'assets/fonts/onest-latin-700.woff2'];
  assert.deepEqual(pre('index.html'), latin);
  assert.deepEqual(pre('en.html'), latin);
  assert.deepEqual(pre('ru.html'), ['assets/fonts/onest-latin-400.woff2', 'assets/fonts/onest-cyrillic-400.woff2', 'assets/fonts/onest-latin-700.woff2', 'assets/fonts/onest-cyrillic-700.woff2']);
  for (const n of ['onest-latin-400', 'onest-latin-700', 'onest-cyrillic-400', 'onest-cyrillic-700', 'jetbrains-mono-latin-500', 'jetbrains-mono-cyrillic-500']) assert.ok(files.has(`assets/fonts/${n}.woff2`), `lipsește ${n}.woff2 din pagina statică`);
  assert.ok(![...files.keys()].some(n => /sourceserif|source-serif|robotocondensed|raleway/i.test(n)), 'niciun font vechi în pagina statică');
});

test('serverul: /, /ru și /en (cu și fără .html) și /api/public?lang=', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [p, lang] of [['/', 'ro'], ['/index.html', 'ro'], ['/ru', 'ru'], ['/ru.html', 'ru'], ['/en', 'en'], ['/en.html', 'en']]) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, p);
      assert.match(await r.text(), new RegExp(`<html[^>]* lang="${lang}"`), p);
    }
    const ru = await (await fetch(base + '/api/public?lang=ru')).json();
    assert.match(ru.settings.orgName, /[А-Яа-я]/);
    const bad = await (await fetch(base + '/api/public?lang=zz')).json();
    assert.ok(!/[А-Яа-я]/.test(bad.settings.orgName), 'o limbă necunoscută dă română');
  } finally {
    server.close();
  }
});

test('administrare: formularele au câmpurile de traducere pentru fiecare colecție', () => {
  for (const k of ['news', 'documents', 'events', 'legal', 'gallery', 'programs', 'investments', 'settings']) {
    assert.ok(AdminSchemas.TR[k] && Object.keys(AdminSchemas.TR[k]).length, k);
  }
});
