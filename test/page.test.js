'use strict';
// Structura paginii publice (web/index.html, site.js, site.css): ce a fost mutat sau scos trebuie să rămână așa. Rulează cu: npm test
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const WEB = path.resolve(__dirname, '..', 'web');
const read = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');
const html = read('index.html');
const site = read('assets', 'js', 'site.js');
const css = read('assets', 'css', 'site.css');

// Conținutul unei secțiuni principale: de la <section … id="x"> până la </section> care o închide (secțiunile din interior se numără).
function sectionOf(id) {
  const start = html.indexOf(`<section class="sec`);
  const re = new RegExp(`<section[^>]*\\bid="${id}"`);
  const m = re.exec(html);
  assert.ok(m, `secțiunea #${id} există`);
  let depth = 0;
  const tag = /<(\/?)section\b/g;
  tag.lastIndex = m.index;
  for (let t = tag.exec(html); t; t = tag.exec(html)) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index, tag.lastIndex + '>'.length + 8);
  }
  assert.fail(`secțiunea #${id} nu se închide`);
  return start;
}

test('„Programe de cooperare, pe niveluri” este în secțiunea Programe, nu sub prima pagină', () => {
  const programe = sectionOf('programe');
  assert.match(programe, /id="levels"/, 'blocul pe niveluri este în #programe');
  assert.match(programe, /<h3[^>]*id="levelsTitle"[^>]*>Programe de cooperare, pe niveluri<\/h3>/);
  assert.ok(programe.indexOf('id="levels"') < programe.indexOf('id="auditBox"'), 'blocul pe niveluri vine înaintea listei de programe');
  assert.equal(html.split('id="levels"').length - 1, 1, 'blocul nu apare și în altă parte');
  assert.doesNotMatch(html, /levels-sec|intro-levels/, 'fosta zonă de sub prima pagină a dispărut');
});

test('„Despre direcție”: textul și principiile sunt pe toată lățimea, fără nota despre Regulament', () => {
  const despre = sectionOf('despre');
  assert.match(despre, /id="aboutText"/);
  assert.match(despre, /id="aboutPrinc"/);
  assert.ok(despre.indexOf('id="aboutText"') < despre.indexOf('id="aboutPrinc"'), 'principiile vin după text, pe un rând separat');
  assert.doesNotMatch(despre, /class="about"/, 'fără grila cu două coloane (text la stânga, principii la dreapta)');
  assert.doesNotMatch(html, /aboutNote|about-note/);
  assert.doesNotMatch(site, /aboutNote/);
  assert.doesNotMatch(css, /about-note/);
  // principiile sunt un singur rând (coloane egale, care se așază pe lățime)
  assert.match(css, /\.about-princ ul\{display:grid;grid-template-columns:repeat\(auto-fit/);
});

test('proiectele investiționale: grupate după minister, fără obiective economice și fără lista „Beneficiari finali”', () => {
  const plan = sectionOf('plan-crestere');
  assert.match(plan, /id="gpOverview"/);
  assert.doesNotMatch(html, /planBox/, 'lista „Beneficiari finali” a fost scoasă de sub proiecte');
  assert.doesNotMatch(site, /planBox/);
  assert.doesNotMatch(css, /#planBox/);
  assert.doesNotMatch(plan, /Obiectiv|obiectiv/);
  assert.match(plan, /<option value="minister">/, 'ordonare după minister');
  assert.doesNotMatch(plan, /value="obiectiv"|value="tema"|value="theme"/);
  // codul paginii nu mai cunoaște obiectivele economice
  assert.doesNotMatch(site, /THEMES|\.theme\b|data-theme|Obiectivul economic|Obiective economice/);
  assert.doesNotMatch(css, /--t-|\.tm-|\.inv-theme/);
  // cardurile ministerelor
  assert.match(site, /mn-card/);
  assert.match(site, /grupate după ministerele care le promovează/);
  assert.match(css, /\.mn-cards\{display:grid/);
});

// Obiectele cu ministere din site.js (prescurtare → denumire), citite din cod fără să pornească pagina.
function objectFrom(name) {
  const m = new RegExp(`var ${name} = (\\{[^}]*\\});`).exec(site);
  assert.ok(m, `${name} există în site.js`);
  return new Function(`return ${m[1]}`)(); // eslint-disable-line no-new-func
}

test('cardurile ministerelor: rubrici dintr-un cuvânt („Energie”, „Sănătate”), iar primul card este „Total”', () => {
  const full = objectFrom('MINISTRY');
  const short = objectFrom('MINISTRY_SHORT');
  assert.deepEqual(Object.keys(short).sort(), Object.keys(full).sort(), 'fiecare minister are și denumirea scurtă');
  assert.deepEqual([short.MEN, short.MM, short.MS, short.MEC, short.MIDR, short.MAIA, short.MDED], ['Energie', 'Mediu', 'Sănătate', 'Educație', 'Infrastructură', 'Agricultură', 'Economie']);
  for (const [k, v] of Object.entries(short)) {
    assert.ok(v && !/^Ministerul\b/.test(v), `${k}: denumirea scurtă nu începe cu „Ministerul”`);
    assert.doesNotMatch(v, /\s/, `${k}: denumirea scurtă este un singur cuvânt, ca o rubrică („${v}”)`);
    assert.ok(v.length < full[k].length, `${k}: denumirea scurtă este mai scurtă decât cea întreagă`);
  }
  // toate ministerele proiectelor livrate au denumire scurtă
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'content', 'investments.json'), 'utf8'));
  for (const p of seed) assert.ok(short[p.ministry], `proiectul ${p.order}: ministerul „${p.ministry}” are denumire scurtă`);
  // primul card este „Total”, iar cardul ministerului arată denumirea scurtă și abrevierea
  assert.match(site, /card\('all', total, 'Total'/);
  assert.doesNotMatch(site, /Toate ministerele/);
  assert.match(site, /ministryShort\(k\) \|\| fullName\(k\) \|\| k/);
  // căutarea găsește proiectele și după denumirea scurtă („sănătate” nu este în „Ministerul Sănătății”)
  assert.match(site, /fullName\(mk\), ministryShort\(mk\)/);
});

test('textul nu mai este strâns în partea stângă: nicio limită de lățime pe textele secțiunilor', () => {
  for (const sel of ['.sec-head p', '.prose', '.about-sub', '.fn-text', '.fn-items', '.num-list', '#growthIntro', '.gp-note p', '.callout p', '.prog-desc', '.event h3', '.event p']) {
    const esc = sel.replace(/[.#]/g, c => '\\' + c);
    const m = new RegExp(`(^|[},\\s])${esc}\\s*(,[^{]*)?\\{([^}]*)\\}`, 'g');
    for (let r = m.exec(css); r; r = m.exec(css)) {
      assert.doesNotMatch(r[3], /max-width:\s*(?!none)[\d.]+(ch|rem|em|px)/, `${sel}: ${r[0].slice(0, 100)}`);
    }
  }
});

// O a doua funcție cu același nume, în același nivel, o înlocuiește în tăcere pe prima (așa au dispărut odată denumirile programelor din listă,
// după ce a fost adăugată o altă funcție „shortName”). Se verifică nivelul de sus al fiecărui script, unde funcțiile se văd între ele.
test('scripturile paginii nu declară de două ori aceeași funcție la nivelul de sus', () => {
  const dir = path.join(WEB, 'assets', 'js');
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.js'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const seen = new Map();
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const m = /^(\s*)function\s+(\w+)\s*\(/.exec(line);
      if (!m || m[1].length > 2) return;
      assert.ok(!seen.has(m[2]), `${f}: funcția ${m[2]} este declarată la liniile ${seen.get(m[2])} și ${i + 1}; a doua o înlocuiește pe prima`);
      seen.set(m[2], i + 1);
    });
  }
});

/* ---------- cerințe pentru o pagină de administrație publică (HG nr. 728/2023 și accesibilitate) ---------- */

const stripTags = h => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

test('fontul este ONEST (HG 728/2023, pct. 26), încărcat de pe aceeași adresă, cu licența alăturată', () => {
  for (const [name, text] of [['site.css', css], ['admin.css', read('assets', 'css', 'admin.css')]]) {
    assert.match(text, /@font-face\{font-family:"Onest";src:url\("\.\.\/fonts\/onest-latin\.woff2"\) format\("woff2"\);font-weight:100 900;[^}]*font-display:swap/, `${name}: Onest variabil, cu afișare imediată a textului`);
    assert.match(text, /--sans:"Onest",Arial/, `${name}: Onest este fontul de bază, Arial este rezerva`);
    assert.doesNotMatch(text, /Raleway|Roboto|fonts\.googleapis|fonts\.gstatic/i, `${name}: fără alte fonturi`);
  }
  for (const f of ['onest-latin.woff2', 'onest-latin-ext.woff2', 'LICENSE-onest.txt']) assert.ok(fs.existsSync(path.join(WEB, 'assets', 'fonts', f)), f);
  assert.match(fs.readFileSync(path.join(WEB, 'assets', 'fonts', 'LICENSE-onest.txt'), 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.match(html, /<link rel="preload" href="assets\/fonts\/onest-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
});

test('datele de identificare ale paginii: limbă, titlu, descriere, autor, cuvinte-cheie, tip, format, drepturi (HG 728/2023, pct. 38–40)', () => {
  assert.match(html, /^<!doctype html>\s*<html lang="ro">/i);
  const meta = {};
  for (const m of html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"/g)) meta[m[1]] = m[2];
  for (const k of ['description', 'keywords', 'author', 'DC.title', 'DC.creator', 'DC.publisher', 'DC.subject', 'DC.description', 'DC.date', 'DC.type', 'DC.format', 'DC.language', 'DC.relation', 'DC.rights', 'og:title', 'og:locale', 'og:site_name']) {
    assert.ok(meta[k] && meta[k].trim(), `lipsește sau este goală: ${k}`);
  }
  assert.equal(meta['DC.language'], 'ro');
  assert.equal(meta['DC.format'], 'text/html');
  assert.match(meta['DC.date'], /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(meta.description.length >= 80 && meta.description.length <= 320, 'descrierea are lungime potrivită');
  assert.match(html, /<title>[^<]{20,}<\/title>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'un singur titlu principal');
});

test('structura: legătură „Salt la conținut”, repere (antet, meniu, conținut, subsol), identificatori unici, titluri fără salturi', () => {
  assert.match(html, /<a class="skip" href="#main">Salt la conținut<\/a>/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<header class="masthead"/);
  assert.match(html, /<nav class="mainnav" id="mainnav" aria-label="Meniu principal">/);
  assert.match(html, /<footer class="foot">/);
  // fiecare „nav” are o denumire, ca să se deosebească între ele
  for (const m of html.matchAll(/<nav\b([^>]*)>/g)) assert.match(m[1], /aria-label=/, `nav fără denumire: ${m[0]}`);
  // identificatori unici
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, [], 'identificatori repetați');
  // titlurile nu sar peste niveluri (h1 → h2 → h3 …), în ordinea din pagină
  let prev = 0;
  for (const m of html.matchAll(/<h([1-6])\b/g)) {
    const lv = Number(m[1]);
    assert.ok(prev === 0 ? lv === 1 : lv <= prev + 1, `titlul h${lv} vine după h${prev}`);
    prev = lv;
  }
  // legăturile către locuri din pagină duc undeva
  for (const m of html.matchAll(/<a\b[^>]*\shref="#([^"/]+)"/g)) assert.ok(ids.includes(m[1]), `legătura #${m[1]} nu duce nicăieri`);
});

test('imaginile au text alternativ și dimensiuni; butoanele și câmpurile au denumire pentru cititoarele de ecran', () => {
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(m[0], /\salt="/, `imagine fără alt: ${m[0]}`);
    assert.match(m[0], /\swidth="\d+"/, `imagine fără lățime: ${m[0]}`);
    assert.match(m[0], /\sheight="\d+"/, `imagine fără înălțime: ${m[0]}`);
  }
  assert.match(html, /<img class="brand-logo"[^>]*alt="Stema Guvernului Republicii Moldova"/);
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    assert.ok(/aria-label="[^"]+"/.test(m[1]) || stripTags(m[2]), `buton fără denumire: ${m[0].slice(0, 120)}`);
  }
  for (const m of html.matchAll(/<(?:input|select|textarea)\b([^>]*)>/g)) {
    if (/type="(hidden|submit|button)"/.test(m[1])) continue;
    const id = (/\sid="([^"]+)"/.exec(m[1]) || [])[1];
    assert.ok(/aria-label="[^"]+"/.test(m[1]) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `câmp fără etichetă: ${m[0]}`);
  }
});

test('legăturile care deschid o fereastră nouă au rel="noopener", în pagină și în site.js', () => {
  for (const [name, text] of [['index.html', html], ['site.js', site]]) {
    for (const m of text.matchAll(/target="_blank"[^>'`]*/g)) assert.match(m[0], /rel="noopener/, `${name}: ${m[0]}`);
  }
  // vizitatorul este anunțat că legătura se deschide într-o fereastră nouă
  assert.match(css, /a\[target="_blank"\]::after/);
});

test('informațiile obligatorii pe pagina unei autorități: declarația de accesibilitate, protecția datelor, harta site-ului, portaluri oficiale', () => {
  const info = sectionOf('informatii');
  for (const id of ['accesibilitate', 'date-personale', 'harta-site']) {
    assert.match(info, new RegExp(`class="acc" id="${id}"`), `#${id} este în secțiunea de informații`);
    assert.match(html, new RegExp(`href="#${id}"`), `există legătură către #${id}`);
  }
  assert.match(info, /id="siteMap"/);
  assert.match(site, /function renderSiteMap\(/);
  assert.match(site, /renderSiteMap\(\);/, 'harta site-ului se construiește la încărcarea datelor');
  // declarația de accesibilitate: standardul, starea de conformitate, modul de sesizare, data
  const acc = /id="accesibilitate"[\s\S]*?id="date-personale"/.exec(info)[0];
  for (const re of [/WCAG/, /conformitate/i, /Limitări cunoscute/, /Sesizări/, /Edge[\s\S]*Firefox[\s\S]*Chrome[\s\S]*Opera[\s\S]*Safari/, /2026/]) assert.match(acc, re, String(re));
  // protecția datelor: temeiul legal, drepturile, autoritatea de control
  const pd = /id="date-personale"[\s\S]*?id="harta-site"/.exec(info)[0];
  for (const re of [/195\/2024/, /accesul la date/, /datepersonale\.md/, /cookie/i, /Google/]) assert.match(pd, re, String(re));
  // portalurile oficiale din subsol
  const foot = /<footer class="foot">[\s\S]*<\/footer>/.exec(html)[0];
  for (const host of ['gov.md/ro"', 'servicii.gov.md', 'particip.gov.md', 'mtender.gov.md', 'cariere.gov.md', 'date.gov.md', 'statistica.gov.md', 'statbank.statistica.md', 'amp.gov.md']) assert.ok(foot.includes(host), `subsol: ${host}`);
  assert.match(foot, /href="#accesibilitate"/);
  assert.match(foot, /href="#date-personale"/);
  assert.match(foot, /href="#harta-site"/);
  // „Harta site-ului” este și în partea de sus, la îndemână
  assert.match(/class="utility"[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0], /href="#harta-site"/);
});

test('mărirea textului și contrastul ridicat: butoane cu denumiri clare și starea ținută minte', () => {
  const bar = /<div class="a11y"[\s\S]*?<\/div>/.exec(html)[0];
  for (const n of ['-1', '0', '1']) assert.match(bar, new RegExp(`data-fs="${n}"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*data-fs="${n}"`));
  assert.match(bar, /id="contrastBtn" aria-pressed="false"/);
  assert.match(css, /html\[data-fs=/);
  assert.match(css, /html\[data-contrast="high"\]|\[data-contrast=high\]|\[data-contrast="1"\]|data-contrast/);
  assert.doesNotMatch(site, /\balert\(|\bconfirm\(|\bprompt\(/, 'fără ferestre de dialog ale browserului');
});

test('harta Google nu se încarcă până nu o cere vizitatorul', () => {
  assert.match(site, /function mapGate\(/);
  assert.match(site, /id="mapLoad"/);
  assert.match(html, /id="contactMap"|id="contactBox"|id="contacte"/);
  // singurul iframe creat de script este harta, iar el apare doar prin mapFrame (după click)
  assert.equal((site.match(/<iframe/g) || []).length, 1);
  assert.doesNotMatch(html, /<iframe/i, 'fără cadre încorporate în pagina de pornire');
  assert.match(site, /mapOn = true/);
});

test('descrierea imaginilor (text alternativ) are cel mult 100 de caractere, în validare și în formulare (HG 728/2023, pct. 33)', () => {
  const schemas = require('../lib/schemas');
  assert.throws(() => schemas.news.clean({ title: 'T', date: '2026-01-01', imageAlt: 'x'.repeat(101) }), /Descrierea imaginii.*prea lung \(maximum 100/);
  assert.equal(schemas.news.clean({ title: 'T', date: '2026-01-01', imageAlt: 'x'.repeat(100) }).imageAlt.length, 100);
  const forms = fs.readFileSync(path.join(WEB, 'assets', 'js', 'admin-pages.js'), 'utf8');
  for (const name of ['imageAlt', 'alt']) assert.match(forms, new RegExp(`name: '${name}', label: 'Descrierea imaginii', type: 'text', max: 100\\b`), `formularul: ${name}`);
  assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'assets', 'js', 'admin-schemas.js'), 'utf8'), /Descrierea imaginii', \{ max: 200/);
});
