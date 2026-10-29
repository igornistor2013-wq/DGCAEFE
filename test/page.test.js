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

test('programele de cooperare: file pe niveluri (transfrontalier, transnațional, interregional) și fișe cu nume, descriere, parteneri și legătură', () => {
  const programe = sectionOf('programe');
  assert.match(programe, /role="tablist"[^>]*id="progTabs"/, 'filele pe niveluri');
  assert.match(programe, /id="progGroups"/, 'fișele sunt în #programe');
  assert.ok(programe.indexOf('id="progTabs"') < programe.indexOf('id="progGroups"') && programe.indexOf('id="progGroups"') < programe.indexOf('id="auditBox"'));
  assert.doesNotMatch(html, /id="levels"|levels-box|id="progNav"|id="progPanel"|levels-sec|intro-levels/, 'diagrama cu cadre și lista veche cu file au dispărut');
  assert.match(site, /function progCard\(/);
  assert.match(site, /role="tab"[^;]*data-level/, 'file cu ARIA');
  assert.match(site, /data-prog-docs/, 'fișa duce la documentele programului');
  assert.match(site, /function showProgramDocs\(/);
  assert.match(site, /progLevel = levelOf\(pr\)/, 'legăturile directe către un program deschid fila lui');
  assert.match(css, /\.seg\{[^}]*background:#fff[^}]*border-radius:999px/, 'filele sunt un grup de pastile albe');
  assert.match(css, /\.prog-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,21\.25rem\)/);
});

test('„Despre direcție”: titlul și prezentarea, apoi trei file (funcții, structură, drepturi și responsabilități) cu un singur panou vizibil', () => {
  const despre = sectionOf('despre');
  assert.match(despre, /<h2 id="h-despre">Autoritatea națională de coordonare a asistenței externe<\/h2>/);
  const order = ['id="aboutText"', 'id="aboutPrinc"', 'id="aboutTabs"', 'id="functii"', 'id="structura"', 'id="drepturi-responsabilitati"'].map(k => despre.indexOf(k));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'ordinea: text, principii, file, panouri');
  assert.equal((despre.match(/role="tab"/g) || []).length, 3);
  assert.equal((despre.match(/role="tabpanel"/g) || []).length, 3);
  assert.match(despre, /id="structura" role="tabpanel"[^>]* hidden/);
  assert.match(despre, /aria-controls="drepturi-responsabilitati"/);
  assert.match(site, /function aboutTab\(/);
  assert.match(site, /ArrowRight[\s\S]{0,400}aboutTab\(/, 'săgețile mută între file');
  assert.match(site, /function goFunction\(i\) \{\s*aboutTab\('functii'\)/, 'căutarea deschide fila funcțiilor');
  assert.doesNotMatch(html, /aboutNote|about-note|id="aboutStats"/);
  assert.match(css, /\.pills\{display:flex;flex-wrap:wrap/, 'principiile sunt etichete rotunjite');
  assert.match(css, /\.tab\[aria-selected="true"\]\{background:var\(--blue\)/);
});

test('„Asistență externă”: carduri pentru rapoartele anuale (ultimul evidențiat) și banda Platformei AMP', () => {
  const coop = sectionOf('cooperare-externa');
  assert.ok(coop.indexOf('id="reportGrid"') > 0 && coop.indexOf('id="reportGrid"') < coop.indexOf('id="ampCard"') && coop.indexOf('id="ampCard"') < coop.indexOf('id="acordBox"'));
  assert.match(coop, /<a class="amp" id="ampCard" href="https:\/\/amp\.gov\.md\/portal\/"/);
  assert.doesNotMatch(html, /id="years"|id="reportPanel"/);
  assert.match(site, /rep-card' \+ \(isNew \? ' is-new' : ''\)/);
  assert.match(css, /\.rep-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,10\.5rem\)/);
  assert.match(css, /\.amp\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto/);
});

test('documente: listă cu pictograme, etichete și buton de descărcare; evenimente: rânduri cu pătrat de dată și săgeată pentru detalii', () => {
  assert.match(site, /class="doc-ico"[^;]*docIcon\(d\)/);
  assert.match(site, /class="doc-go"/);
  assert.match(css, /\.doc\{display:grid;grid-template-columns:3\.25rem minmax\(0,1fr\) auto/);
  assert.match(css, /\.doc-card\{[^}]*background:#fff[^}]*border-radius:1\.75rem/, 'documentele sunt într-un card alb cu căutare și filtre');
  assert.match(css, /\.doc-go\{[^}]*border-radius:50%[^}]*background:var\(--blue\)/, 'butonul rotund de descărcare');
  const ev = sectionOf('evenimente');
  assert.match(ev, /<fieldset class="ev-year" id="evYearBox">/, 'filtrul de an este lângă titlu');
  assert.match(ev, /<ol class="events" id="timeline" aria-label="Evenimente în ordine cronologică">/);
  // fiecare eveniment: pătrat închis la culoare cu ziua și luna, titlul, locul și o săgeată care deschide detaliile
  assert.match(css, /\.event\{display:grid;grid-template-columns:5\.25rem minmax\(0,1fr\) auto/);
  assert.match(css, /\.ev-date\{[^}]*width:5\.25rem;height:5\.25rem[^}]*background:var\(--navy\)/);
  assert.match(css, /\.event\[data-open="false"\] \.ev-more\{display:none\}/, 'detaliile sunt ascunse până se apasă săgeata');
  assert.match(css, /\.ev-go\{/);
  // construirea: starea pe fiecare eveniment, data într-un element <time>, detaliile într-o regiune cu denumire legată de buton
  assert.match(site, /'<li class="event ' \+ st\[0\]\.replace\('st-', 'is-'\)/);
  assert.match(site, /<time class="ev-date" datetime="/);
  assert.match(site, /<button class="ev-go" type="button" aria-expanded="false" aria-controls="/);
  assert.match(site, /<div class="ev-more" id="[^"]*" role="region" aria-label="/);
  assert.match(site, /function evToggle\(/);
});

// Sub listele lungi se văd întâi primele elemente (5), iar butonul „Vezi mai mult” le adaugă pe următoarele.
test('liste lungi: maximum 5 elemente, apoi butonul „Vezi mai mult” (documente, acte, evenimente, rapoarte, acord); noutăți și fotografii păstrează 6 / 12', () => {
  const m = /var MORE = \{([\s\S]*?)\n  \};/.exec(site);
  assert.ok(m, 'MORE există în site.js');
  const cfg = {};
  for (const r of m[1].matchAll(/(\w+): \{ box: '(\w+)', list: '([^']+)', ctl: '(\w+)', head: '([\w-]+)', noun: '([^']+)', first: (\d+), step: (\d+)/g)) {
    cfg[r[1]] = { box: r[2], ctl: r[4], head: r[5], noun: r[6], first: Number(r[7]), step: Number(r[8]) };
  }
  assert.deepEqual(Object.keys(cfg).sort(), ['docs', 'events', 'gal', 'law', 'news', 'reports', 'steps']);
  for (const k of ['docs', 'law', 'events', 'reports', 'steps']) assert.equal(cfg[k].first, 5, `${k}: primele 5`);
  // lângă buton, ca în design: „5 din 52 documente”, „5 din 19 proiecte”… (tradus în ru și en)
  const ruUi = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'seed', 'i18n', 'ui.ru.json'), 'utf8'));
  const enUi = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'seed', 'i18n', 'ui.en.json'), 'utf8'));
  for (const [k, c] of Object.entries(cfg)) {
    assert.match(c.noun, /^%1 din %2 \S+$/, `${k}: textul de lângă buton`);
    assert.ok(ruUi[c.noun] && enUi[c.noun], `${k}: „${c.noun}” are traducere în ru și en`);
  }
  assert.doesNotMatch(site, /Afișate %1 din %2/);
  assert.equal(cfg.news.first, 6);
  assert.equal(cfg.gal.first, 12);
  for (const [k, c] of Object.entries(cfg)) {
    // fiecare listă își are locul pentru buton și titlul la care se referă butonul
    if (k !== 'steps') {
      assert.match(html, new RegExp(`<div class="more-row[^"]*" id="${c.box}" hidden></div>`), `${k}: ${c.box} în pagină`);
      assert.match(html, new RegExp(`id="${c.ctl}"`), `${k}: lista ${c.ctl}`);
    }
    assert.match(html + site, new RegExp(`id="${c.head}"`), `${k}: titlul ${c.head}`);
    assert.match(site, new RegExp(`moreSlice\\('${k}'`), `${k}: lista se taie la primele elemente`);
    assert.match(site, new RegExp(`moreBox\\('${k}'\\)`), `${k}: butonul se actualizează la fiecare desenare`);
  }
  assert.match(site, /id="stepMoreBox" hidden/, 'pașii acordului au butonul lor în card');
  // vechile butoane „Arată mai multe…” au dispărut
  assert.doesNotMatch(html, /id="(docMore|newsMore|galMore)"|class="more"/);
  assert.doesNotMatch(site, /docs\.shown|gal\.shown|newsShown/);
  // eticheta se schimbă, iar starea o citesc și cititoarele de ecran
  assert.match(site, /T\(all \? 'Vezi mai puțin' : 'Vezi mai mult'\)/);
  assert.match(site, /T\('încă %1', total - shown\)/);
  assert.match(site, /btn\.setAttribute\('aria-expanded', String\(all\)\)/);
  assert.match(css, /\.more-btn\{[^}]*min-height:3\.25rem[^}]*border-radius:999px/);
  // orice căutare, filtru sau ordonare readuce lista la primele elemente
  for (const k of ['docs', 'law', 'events', 'gal']) assert.match(site, new RegExp(`limReset\\('${k}'\\)`), `${k}: limReset`);
  // căutarea din pagină și adresele #eveniment/…, #proiect/… arată elementul căutat chiar dacă era după primele 5
  assert.match(site, /limShow\('events', eventList\(\)/);
  assert.match(site, /limShow\('gal', i\)/);
  // la tipărire se scot limitele
  assert.match(site, /addEventListener\('beforeprint'[\s\S]*PRINT_ALL\.forEach[\s\S]*addEventListener\('afterprint'/);
});

test('proiectele investiționale: doar un card către site-ul dedicat, fără listă în pagină', () => {
  const plan = sectionOf('plan-crestere');
  assert.match(plan, /<a class="amp ext-card" id="projectsCard" href="https:\/\/proiecte\.pages\.dev\/" target="_blank" rel="noopener">/);
  assert.doesNotMatch(plan, /invList|invQ|gpOverview|invStat/);
  assert.doesNotMatch(site, /invList|gpOverview|renderInvList|#proiect\//);
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

test('fonturile: Onest pentru tot textul (cel cerut de HG 728/2023, pct. 26) (un singur font), găzduit local, cu licențele alăturate; panoul de administrare rămâne cu Golos Text', () => {
  const FONTS = path.join(WEB, 'assets', 'fonts');
  const adm = read('assets', 'css', 'admin.css');
  // pagina publică: Onest 400/500/600/700 fiecare cu litere latine (română) și chirilice (rusă)
  const faces = [...css.matchAll(/@font-face\{font-family:"([^"]+)";src:url\("\.\.\/fonts\/([\w.-]+\.woff2)"\) format\("woff2"\);font-weight:(\d+);font-style:normal;font-display:swap;unicode-range:[^}]+\}/g)];
  assert.equal((css.match(/@font-face/g) || []).length, faces.length, 'toate regulile @font-face au forma așteptată');
  assert.deepEqual(faces.map(m => `${m[1]} ${m[2]}`), [
    ...[400, 500, 600, 700].map(w => `Onest onest-latin-${w}.woff2`),
    ...[400, 500, 600, 700].map(w => `Onest onest-cyrillic-${w}.woff2`)
  ]);
  assert.match(css, /--sans:"Onest",system-ui/);
  assert.match(css, /--mono:var\(--sans\)/, 'și etichetele mici sunt tot în Onest');
  assert.doesNotMatch(css, /Golos|Source Serif|Raleway|fonts\.googleapis|fonts\.gstatic/i, 'fără alte fonturi');
  assert.doesNotMatch(css, /url\(["']?https?:/i, 'fără adrese externe');
  const other = [...css.matchAll(/font-family:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^(?:"Onest"|var\(--(?:sans|mono)\)|inherit)$/.test(v));
  assert.deepEqual(other, [], 'orice text din pagina publică folosește unul din cele două fonturi');
  assert.match(css, /body\{margin:0;font-family:var\(--sans\)/, 'textul paginii este în Onest');
  assert.match(css, /h1,h2,h3,h4\{font-family:var\(--sans\)/, 'titlurile sunt tot în Onest, fără cursive (HG 728/2023, pct. 33)');
  assert.doesNotMatch(css, /font-style:\s*italic/, 'fără cursive în titluri');
  // fișierele și licențele (SIL Open Font License) alăturate; Golos Text rămâne pentru panoul de administrare
  for (const f of faces.map(m => m[2])) {
    const b = fs.readFileSync(path.join(FONTS, f));
    assert.equal(b.subarray(0, 4).toString('latin1'), 'wOF2', `${f}: fișier woff2`);
    assert.ok(b.length > 5000 && b.length < 40000, `${f}: dimensiune rezonabilă`);
  }
  const golos = [...adm.matchAll(/golos-text-[\w-]+\.woff2/g)].map(m => m[0]);
  assert.deepEqual(fs.readdirSync(FONTS).sort(), [...new Set([...faces.map(m => m[2]), ...golos]), 'LICENSE-golos-text.txt', 'LICENSE-onest.txt'].sort(), 'în dosarul fonturilor sunt numai fișierele folosite');
  for (const l of ['golos-text', 'onest']) assert.match(fs.readFileSync(path.join(FONTS, `LICENSE-${l}.txt`), 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.equal((adm.match(/@font-face/g) || []).length, 8, 'administrare: Golos Text latin și chirilic, 4 greutăți');
  assert.match(adm, /--sans:"Golos Text",system-ui/);
  // doar fișierele cu litere latine se cer din timp; cele chirilice se cer numai pe pagina în rusă (vezi i18n.test.js)
  assert.match(html, /<link rel="preload" href="assets\/fonts\/onest-latin-400\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.match(html, /<link rel="preload" href="assets\/fonts\/onest-latin-700\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.equal((html.match(/rel="preload"[^>]*as="font"/g) || []).length, 2, 'două încărcări anticipate de font');
});

test('cardul „Platforma AMP”: sigla (PNG) există, iar dimensiunile din pagină și din site.js sunt cele reale ale fișierului', () => {
  const buf = fs.readFileSync(path.join(WEB, 'assets', 'img', 'amp-logo.png'));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'fișier PNG');
  const tag = `<img class="plat-logo" src="assets/img/amp-logo.png" alt="" width="${buf.readUInt32BE(16)}" height="${buf.readUInt32BE(20)}">`;
  assert.ok(html.includes(tag), 'în pagină');
  assert.ok(read('assets', 'js', 'site.js').includes(tag), 'în site.js, la redarea din setări');
  assert.ok(!fs.existsSync(path.join(WEB, 'assets', 'img', 'amp-logo.svg')), 'sigla provizorie a fost înlocuită');
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
  for (const m of html.matchAll(/<nav\b([^>]*)>/g)) assert.match(m[1], /aria-label=|aria-labelledby=/, `nav fără denumire: ${m[0]}`);
  assert.match(html, /<nav class="quick" aria-labelledby="quickTitle">\s*<h2 class="sr" id="quickTitle">/, 'accesul rapid are un titlu pentru cititoarele de ecran');
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

test('subsolul păstrează portalurile oficiale și legăturile utile', () => {
  const foot = /<footer class="foot">[\s\S]*<\/footer>/.exec(html)[0];
  for (const host of ['gov.md/ro"', 'servicii.gov.md', 'particip.gov.md', 'mtender.gov.md', 'cariere.gov.md', 'date.gov.md', 'statistica.gov.md', 'statbank.statistica.md', 'amp.gov.md']) assert.ok(foot.includes(host), `subsol: ${host}`);
  assert.match(foot, /Petiții, cereri și audiențe/);
  assert.match(foot, /href="#contacte"/);
  assert.match(foot, /<p id="footNote"><\/p>/, 'nota de licență din setări rămâne');
});

test('secțiunea „Informații despre acest site” și linia „Pagina a fost actualizată… Administrare” din subsol au fost scoase, cu tot ce ducea la ele', () => {
  const foot = /<footer class="foot">[\s\S]*<\/footer>/.exec(html)[0];
  // secțiunea cu cele trei casete (declarația de accesibilitate, protecția datelor, harta site-ului)
  assert.doesNotMatch(html, /\bid="(informatii|accesibilitate|date-personale|harta-site|siteMap)"/);
  assert.doesNotMatch(html, /href="#(informatii|accesibilitate|date-personale|harta-site)"/, 'nicio legătură nu mai duce la ea (nici din meniul de sus, nici din subsol)');
  assert.doesNotMatch(html, /INFORMAȚII DESPRE SITE|Informații despre acest site|Declarația de accesibilitate|Harta site-ului/);
  // linia de jos din subsol: fără data actualizării și fără legătura către administrare; rămâne doar nota de licență
  assert.doesNotMatch(foot, /id="updated"|footAdmin|foot-admin|Pagina a fost actualizată|Administrare/);
  assert.match(foot, /<div class="foot-bottom">\s*<p id="footNote"><\/p>\s*<\/div>/);
  // codul paginii nu mai are nimic din ele
  for (const re of [/INFO_IDS/, /goInfo/, /renderSiteMap/, /siteMap/, /harta-site/, /date-personale/, /accesibilitate/, /informatii/, /#updated/, /footAdmin/, /Pagina a fost actualizată/]) assert.doesNotMatch(site, re, String(re));
  assert.doesNotMatch(css, /\.sm-|\.sm\{|\.info-date|\.foot-admin/);
  // pagina „404” nu trimite nici ea acolo
  assert.doesNotMatch(read('404.html'), /harta-site|accesibilitate|date-personale|informatii/);
});

test('rubrica „Noutăți” vine imediat înainte de „Galerie foto”: în pagină, în meniul principal, în subsol, la urmărirea derulării și în pagina „404”', () => {
  const order = ['despre', 'plan-crestere', 'cadrul-legal', 'cooperare-externa', 'programe', 'documente', 'evenimente', 'noutati', 'galerie', 'contacte'];
  const main = [...html.matchAll(/<section class="(sec[^"]*)" id="([^"]+)"/g)];
  // „Platforma AMP” este o bandă albastră de sine stătătoare, imediat după proiectele investiționale; nu e în meniu
  assert.deepEqual(main.map(m => m[2]), order, 'ordinea secțiunilor în pagină');
  // în noul design toate secțiunile stau pe același fond gri-albăstrui (fără benzi alternante); fiecare are eticheta numerotată
  main.forEach(m => assert.doesNotMatch(m[1], /\bsec-alt\b/, `secțiunea #${m[2]} nu mai are fond propriu`));
  const nav = /<ul id="navList">([\s\S]*?)<\/ul>/.exec(html)[1];
  assert.deepEqual([...nav.matchAll(/href="#([^"]+)"/g)].map(m => m[1]), order, 'meniul principal');
  const foot = /<h2 class="foot-h">Pe această pagină<\/h2>\s*<ul>([\s\S]*?)<\/ul>/.exec(html)[1];
  const footIds = [...foot.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(footIds, order.filter(x => footIds.includes(x)), 'subsolul păstrează aceeași ordine');
  assert.ok(footIds.indexOf('noutati') > -1 && footIds.indexOf('noutati') + 1 === footIds.indexOf('galerie'), 'în subsol, Noutăți înaintea Galeriei');
  const spy = /var ids = \[([^\]]*)\];/.exec(site)[1];
  assert.deepEqual([...spy.matchAll(/'([^']+)'/g)].map(m => m[1]), order, 'urmărirea derulării (meniul evidențiază rubrica curentă)');
  const nf = [...read('404.html').matchAll(/href="\{\{BASE\}\}#([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(nf, order, 'pagina „404”');
});

test('partea de sus: card bleumarin cu prezentarea în stânga și fotografia ultimei noutăți în dreapta, cu un card sticlos peste ea; carusel cu săgeți, puncte și anunț pentru cititoarele de ecran', () => {
  const hero = /<div class="hero-news" id="heroNews"[\s\S]*?<p class="sr" id="hnLive"[^>]*><\/p>\s*<\/div>/.exec(html);
  assert.ok(hero, 'blocul cu noutăți există');
  const h = hero[0];
  assert.ok(html.indexOf('id="introMain"') < html.indexOf('id="heroNews"'), 'prezentarea rămâne mereu la vedere, înaintea fotografiei');
  assert.match(h, /^<div class="hero-news" id="heroNews" role="region" aria-roledescription="carusel" aria-label="Ultimele noutăți" hidden>/, 'ascuns până sunt noutăți');
  assert.match(h, /<!--hero-news-->/, 'locul diapozitivelor, completat la construirea paginii și în browser');
  assert.match(h, /<!--hero-dots-->/, 'locul punctelor');
  assert.match(h, /<div class="hn-bar" role="group" aria-label="[^"]{8,}">/, 'săgețile, punctele și pauza sunt un grup cu denumire');
  // butoanele au denumiri; pictogramele sunt ascunse cititoarelor de ecran
  for (const [id, cls] of [['hnPrev', 'hn-arrow hn-prev'], ['hnNext', 'hn-arrow hn-next'], ['hnPlay', 'hn-btn']]) assert.match(h, new RegExp(`<button class="${cls}" id="${id}" type="button" aria-label="[^"]{8,}"><svg class="ico" aria-hidden="true"`), id);
  assert.match(h, /id="hnLive" aria-live="polite" aria-atomic="true"/);
  // fără JavaScript butoanele n-ar face nimic, deci nu se arată
  assert.match(html, /<noscript><style>\.hn-arrow,\.hn-bar,\.hn-progress\{display:none\}<\/style><\/noscript>/);
  // fiecare element căutat de script există în pagină
  const js = read('assets', 'js', 'hero-news.js');
  for (const m of js.matchAll(/querySelector\('#([A-Za-z]+)'\)/g)) assert.ok(h.includes(`id="${m[1]}"`), `#${m[1]} din hero-news.js există în pagină`);
  for (const m of js.matchAll(/querySelector\('\.([a-z-]+)'\)/g)) assert.ok(h.includes(m[1]), `.${m[1]} din hero-news.js există în pagină`);
  // scriptul se încarcă înaintea celui principal, iar acesta îl cheamă cu noutățile publice (deja ordonate: cele mai noi primele)
  assert.ok(html.indexOf('assets/js/hero-news.js') > html.indexOf('assets/js/common.js') && html.indexOf('assets/js/hero-news.js') < html.indexOf('assets/js/site.js'));
  assert.match(html, /<script src="assets\/js\/hero-news\.js" defer><\/script>/);
  assert.match(site, /window\.HeroNews\.render\(\$\('#heroNews'\), D\.news, DG, \$\('#top \.hero'\)\)/);
  // o știre deschisă din partea de sus sau din „Ultimele noutăți”: la închidere adresa revine sus (#top), nu la rubrica Noutăți
  assert.match(site, /newsBack = a\.closest\('#heroNews'\) \? '#top' : '#noutati'/);
  assert.match(site, /location\.search \+ newsBack\)/);
  assert.match(html, /<section class="intro" id="top"/);
  // stiluri: schimbare lină, dar fără animații pentru cine a cerut mișcare redusă; contrast ridicat și tipărire tratate
  assert.match(css, /\.hn-slide\{[^}]*opacity:0;[^}]*visibility:hidden/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^@]*transition-duration:\.01ms!important[^@]*\.hn-progress\{display:none\}/);
  assert.match(css, /@media \(forced-colors:active\)/);
});

test('rubrica Noutăți: una mare și trei mici, apoi restul în carduri; blocul nu mai e sub accesul rapid', () => {
  assert.doesNotMatch(html, /id="latest"/);
  assert.match(html, /id="h-noutati"[\s\S]*<div class="latest-grid" id="latestGrid">[\s\S]*<div class="news-grid" id="newsGrid">/);
  assert.match(site, /moreSlice\('news', all\.slice\(4\)\)/);
  assert.match(site, /function renderLatest\(/);
  assert.match(site, /\(D\.news \|\| \[\]\)\.slice\(0, 4\)/);
  assert.match(css, /\.latest-grid\{display:grid/);
  assert.match(css, /\.lt-item\{display:grid;grid-template-columns:6\.5rem minmax\(0,1fr\)/);
});

test('partea de sus se potrivește ecranului: pe computer prezentarea și fotografia stau alături, pe tabletă și telefon fotografia vine sub text; înălțimea și literele cresc cu fereastra', () => {
  // telefon și tabletă: fotografia sub text, cu înălțime proporțională cu lățimea
  assert.match(css, /\.hero-news\{position:relative;z-index:1;min-height:clamp\(16rem,58vw,22rem\)/);
  // computer (de la 64 rem): text 56 %, fotografie 52 % (se suprapun puțin, cu degrade), înălțime între 30 și 39 rem după lățime
  const at = css.indexOf('@media (min-width:64rem){\n  .hero:has(.hero-news:not([hidden]))');
  assert.ok(at > 0, 'blocul pentru computer există');
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /\.hero:has\(\.hero-news:not\(\[hidden\]\)\)\{min-height:clamp\(30rem,40vw,39rem\)\}/);
  assert.match(block, /\.hero-text\{width:56%/);
  assert.match(block, /\.hero-news\{position:absolute;top:0;right:0;bottom:0;width:52%/);
  assert.match(css, /\.hero h1\{[^}]*font-size:clamp\(2rem,\.9rem \+ 2\.7vw,3\.25rem\)/, 'titlul crește odată cu ecranul');
  // literele cresc ușor abia peste 1920 px (cel mult 22 px), deci tot ce este în rem crește odată cu ele
  assert.match(css, /html\{font-size:clamp\(100%,calc\(100% \+ \(100vw - 120rem\)\*\.003125\),1\.375rem\)/);
  const root = w => Math.min(22, Math.max(16, 16 + 0.003125 * (w - 1920)));
  const height = w => Math.min(39 * root(w), Math.max(30 * root(w), 0.4 * w));
  assert.equal(root(1905), 16);
  assert.ok(height(1440) >= 480 && height(1440) <= 624, 'pe 1440 px cardul are între 480 și 624 px');
  assert.ok(height(2560) > height(1920), 'pe ecran foarte mare cardul crește');
});

test('fără ferestre de dialog ale browserului', () => {
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

test('administrare: fereastra de editare nu se poate derula singură (altfel, după alegerea unei fotografii rămâne o fereastră albă)', () => {
  const css = fs.readFileSync(path.join(WEB, 'assets', 'css', 'admin.css'), 'utf8');
  assert.match(/dialog\.dlg\{[^}]*\}/.exec(css)[0], /overflow:clip/);
  const forms = fs.readFileSync(path.join(WEB, 'assets', 'js', 'admin-forms.js'), 'utf8');
  assert.match(forms, /addEventListener\('scroll', \(\) => \{ if \(d\.scrollTop/);
});

test('contacte, cadrul legal, galerie: pictograme în casete, subiectul ca pastile cu un singur răspuns, buton de mărire pe fotografii', () => {
  assert.match(html, /role="radiogroup"[^>]*id="fTopicBox"|id="fTopicBox"[^>]*role="radiogroup"/);
  assert.match(html, /<input type="hidden" id="fTopic" name="topic" value="Asistență externă">/);
  assert.equal((html.match(/data-topic="/g) || []).length, 6, 'aceleași 6 subiecte ca înainte');
  assert.match(site, /\$\('#fTopic'\)\.value/, 'subiectul ajunge în mesaj');
  assert.match(site, /class="ci-ico"/);
  assert.match(site, /class="law-ico"/);
  assert.match(site, /class="g-zoom"/);
  assert.match(css, /\.pill\[aria-checked="true"\]\{background:var\(--ink\)/);
});

// Aspectul din Claude Design (propunerea a doua): dimensiunile și structura de pe computer și de pe telefon.
test('aliniere la design: titluri, filtre-pastile, rânduri de listă și varianta de telefon', () => {
  // titlurile secțiunilor groase și strânse; deasupra, eticheta numerotată în font monospațiat („01 · DESPRE DIRECȚIE”)
  assert.match(css, /\.sec-head h2\{font-size:clamp\(2rem,1\.1rem \+ 2\.4vw,2\.875rem\)/);
  assert.doesNotMatch(html, /class="eyebrow"/, 'fără etichete numerotate deasupra titlurilor');
  assert.doesNotMatch(css, /\.eyebrow|counter\(sec/);
  // secțiuni: spațiu mare deasupra, mic dedesubt (fondul este același, fără benzi)
  assert.match(css, /--sec-pt:clamp\(2\.5rem,[^;]*5rem\)/);
  // filtre: pastile de 44 px, fără chenar, cea aleasă este neagră; numărul din ele mai subțire
  assert.match(css, /\.chip\{[^}]*min-height:2\.75rem[^}]*border-radius:999px/);
  assert.match(css, /\.chip\[aria-pressed="true"\]\{background:var\(--ink\)/);
  assert.match(css, /\.chip \.n\{font-weight:500;color:var\(--muted\)\}/);
  // câmpurile de căutare: 52 px, colțuri rotunjite
  assert.match(css, /\.input,\.select,[^{]*\{[^}]*min-height:3\.25rem[^}]*border-radius:1rem/);
  // rândurile: document (48 px pictogramă), act normativ (4 coloane), proiect (5 coloane, 56 / 190 / 170 / 28 px)
  assert.match(css, /--inv-cols:3\.5rem minmax\(0,1fr\) 11\.875rem 10\.625rem 1\.75rem/);
  assert.match(css, /\.law-a\{[^}]*grid-template-columns:3rem 11\.5rem minmax\(0,1fr\) auto/);
  // telefon: filtrele pe un singur rând care alunecă, până la marginea ecranului; pictograma actelor rămâne vizibilă
  const mobile = /@media \(max-width:47\.99rem\)\{([\s\S]*?)\n\}\n@media \(max-width:30rem\)/.exec(css);
  assert.ok(mobile, 'blocul pentru telefon există');
  assert.match(mobile[1], /\.chips\{flex-wrap:nowrap;overflow-x:auto;margin:-\.375rem calc\(-1\*var\(--gutter\)\)/);
  assert.match(mobile[1], /\.chips>\.chip\{flex:none\}/);
  assert.match(mobile[1], /\.law-ico\{width:2\.5rem;height:2\.5rem/);
  assert.doesNotMatch(mobile[1], /\.law-ico\{display:none/);
  assert.doesNotMatch(css, /\.law-ico\{display:none/);
  // filtrul focalizat cu tastatura alunecă în vedere
  assert.match(site, /function setupChipRows\(\)/);
  assert.match(site, /addEventListener\('focusin'/);
  assert.match(site, /\n    setupChipRows\(\);/);
  // accesibilitate: banda „Site oficial” e o regiune cu nume; fișele de program sunt titluri h3 (după h2)
  assert.match(html, /<section class="topbar" aria-label="Site oficial">/);
  assert.match(site, /<h3 class="pc-name"/);
  assert.doesNotMatch(site, /<h4 class="pc-name"/);
});

// Textul și titlurile folosesc toată lățimea (nu coloane înguste cu spațiu gol alături), iar pagina se potrivește ecranului.
test('text pe toată lățimea: „Despre direcție” pe o coloană, introducerile și titlurile fără limite de lățime, scalare pe ecran mare și mic', () => {
  const despre = sectionOf('despre');
  // ordinea: text, principii (pe un rând), butoane, file
  const order = ['id="aboutText"', 'id="aboutPrinc"', 'id="aboutCta"', 'id="aboutTabs"'].map(k => despre.indexOf(k));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'ordinea: text, principii, butoane, file');
  assert.match(css, /\.about-top\{display:grid;grid-template-columns:minmax\(0,1fr\);/, 'o singură coloană');
  assert.match(css, /\.about-princ\{display:flex;flex-wrap:wrap;align-items:center;/, 'principiile: eticheta și pastilele pe un rând');
  assert.doesNotMatch(css, /\.about-head h2\{max-width/);
  assert.match(site, /\$\('#aboutCta'\)\.innerHTML = /);
  // titlurile și introducerile de secțiune nu mai au lățime maximă
  assert.doesNotMatch(css, /\.sec-head-narrow/);
  assert.doesNotMatch(html, /sec-head-narrow/);
  assert.doesNotMatch(css, /\.sec-head p:not\(\.eyebrow\)\{[^}]*max-width/);
  assert.doesNotMatch(css, /\.amp-desc\{[^}]*max-width/);
  assert.match(css, /\.sec-head-inv\{display:grid;grid-template-columns:minmax\(0,1fr\)/, 'investiții: introducerea pe toată lățimea, cifrele dedesubt');
  // conținutul se lărgește cu ecranul (72 % din lățime, între 77 rem și 120 rem), iar pe tabletă tabelele își strâng coloanele
  assert.match(css, /--wrap:min\(max\(77rem,72vw\),120rem,100% - 2\*var\(--gutter\)\)/);
  assert.match(css, /@media \(min-width:48rem\) and \(max-width:63\.99rem\)\{[^@]*--inv-cols:2\.5rem minmax\(0,1fr\) 6\.5rem 8rem 1\.5rem/);
  assert.match(css, /@media \(min-width:48rem\) and \(max-width:63\.99rem\)\{[^@]*\.toolbar>\.tools\{flex:1 1 100%\}/);
});

test('la reîncărcare (F5) pagina revine la început; linkurile directe rămân neschimbate', () => {
  assert.match(site, /history\.scrollRestoration = 'manual'/);
  assert.match(site, /navEntry\.type === 'reload'/);
  assert.match(site, /window\.scrollTo\(0, 0\)/);
});
