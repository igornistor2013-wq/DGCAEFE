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
  assert.match(site, /shortName\(k\) \|\| fullName\(k\) \|\| k/);
  // căutarea găsește proiectele și după denumirea scurtă („sănătate” nu este în „Ministerul Sănătății”)
  assert.match(site, /fullName\(mk\), shortName\(mk\)/);
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
