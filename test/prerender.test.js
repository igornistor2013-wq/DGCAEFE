'use strict';
// Părțile din HTML scrise înainte ca JavaScript să pornească (titlul paginii, prezentarea, metadatele), pagina „404”, robots.txt
// și politica de securitate din versiunea publicată. Rulează cu: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-prerender-'));
process.env.DATA_DIR = tmp;
process.env.ENV_FILE = path.join(tmp, 'nu-exista.env');
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'Test-Parola-123!';
process.env.BCRYPT_COST = '4';
delete process.env.SITE_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const cfg = require('../lib/config');
const store = require('../lib/store');
const prerender = require('../lib/prerender');
const staticSite = require('../lib/static-site');
const { buildPublic } = require('../lib/public');
const { createApp } = require('../server');

const read = (...p) => fs.readFileSync(path.join(cfg.WEB_DIR, ...p), 'utf8');
const template = read('index.html');
const seedData = () => buildPublic(staticSite.diskReader(cfg.SEED_DIR, cfg.SEED_DIR));
const textOf = e => (e.text !== undefined ? e.text : fs.readFileSync(e.file, 'utf8'));
const build = opts => new Map(staticSite.entries(staticSite.diskReader(cfg.SEED_DIR, cfg.SEED_DIR), cfg.SEED_DIR, opts).map(e => [e.name, e]));
const inner = (html, id) => {
  const m = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  assert.ok(m, `elementul #${id} există`);
  return m[2];
};

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('titlul de pe prima pagină se scrie la fel în HTML și în site.js', () => {
  // funcțiile se citesc din scripturile paginii, fără să pornească pagina
  const common = read('assets', 'js', 'common.js');
  const siteJs = read('assets', 'js', 'site.js');
  const esc = /function esc\(s\) \{[\s\S]*?\n  \}/.exec(common);
  const hero = /function heroTitleHtml\(t\) \{[\s\S]*?\n  \}/.exec(siteJs);
  assert.ok(esc && hero, 'funcțiile există în scripturi');
  const ctx = vm.createContext({});
  vm.runInContext(`${esc[0]}\n${hero[0]}`, ctx);
  for (const t of ['', '   ', 'Doar', 'Două cuvinte', 'Trei cuvinte aici', 'Direcția Generală Coordonare Asistență Externă și Fonduri Europene', 'Titlu <b>cu</b> „semne” & \'ghilimele\' "duble" aici', '  spații   multe   între   cuvinte  ']) {
    assert.equal(prerender.heroTitleHtml(t), ctx.heroTitleHtml(t), `titlul „${t}”`);
  }
  assert.equal(prerender.heroTitleHtml('Direcția Generală Fonduri Europene'), 'Direcția Generală <span class="h1-b">Fonduri Europene</span>');
});

test('șablonul paginii are deja textele din conținutul de pornire: completarea nu schimbă nimic în aspect', () => {
  const filled = prerender.fillIndex(template, seedData());
  const title = h => /<title>([\s\S]*?)<\/title>/.exec(h)[1];
  assert.equal(title(filled), title(template));
  for (const id of ['introTitle', 'introLead', 'brandName', 'brandParent']) assert.equal(inner(filled, id), inner(template, id), `#${id}`);
  // metadatele cu text se completează din setări, deci nu se pot abate de la ele
  for (const key of ['og:title', 'og:description', 'og:site_name', 'author', 'DC.title', 'DC.creator', 'DC.publisher', 'DC.rights']) {
    const re = new RegExp(`<meta\\s+(?:name|property)="${key.replace('.', '\\.')}"\\s+content="([^"]*)"`);
    assert.equal(re.exec(filled)[1], re.exec(template)[1], key);
  }
});

test('fillIndex: textele din setări ajung în HTML, cu semnele speciale scrise corect', () => {
  const data = {
    lastUpdated: '2026-03-04T10:00:00.000Z',
    settings: { orgName: 'Direcția <A> & "B"', parentName: "Cancelaria 'Test'", heroTitle: 'Primul cuvânt și altele două cuvinte', heroLead: 'Prezentare <script>alert(1)</script> & altele', footerNote: 'Licență "X"' }
  };
  const html = prerender.fillIndex(template, data);
  assert.match(html, /<title>Direcția &lt;A&gt; &amp; &quot;B&quot; \| Cancelaria &#39;Test&#39;<\/title>/);
  assert.equal(inner(html, 'introTitle'), 'Primul cuvânt și altele <span class="h1-b">două cuvinte</span>');
  assert.equal(inner(html, 'introLead'), 'Prezentare &lt;script&gt;alert(1)&lt;/script&gt; &amp; altele');
  assert.equal(inner(html, 'brandName'), 'Direcția &lt;A&gt; &amp; &quot;B&quot;');
  assert.match(html, /<meta name="author" content="Cancelaria &#39;Test&#39;">/);
  assert.match(html, /<meta name="DC\.date" content="2026-03-04">/);
  assert.match(html, /<meta name="DC\.rights" content="Licență &quot;X&quot;">/);
  assert.ok(!/<script>alert/.test(html), 'textul nu poate deveni cod');
  // fără setări, șablonul rămâne neschimbat
  assert.equal(prerender.fillIndex(template, {}), template);
  assert.equal(prerender.fillIndex(template, null), template);
  // titlul gol folosește denumirea direcției
  assert.equal(inner(prerender.fillIndex(template, { settings: { orgName: 'Una Două Trei Patru' } }), 'introTitle'), 'Una Două <span class="h1-b">Trei Patru</span>');
});

test('adresa paginii: se curăță, iar ce nu este adresă este respins', () => {
  const n = prerender.normalizeSiteUrl;
  assert.equal(n('https://utilizator.github.io/depozit'), 'https://utilizator.github.io/depozit');
  assert.equal(n(' https://utilizator.github.io/depozit/// '), 'https://utilizator.github.io/depozit');
  assert.equal(n('https://dgaefe.gov.md/'), 'https://dgaefe.gov.md');
  assert.equal(n('https://dgaefe.gov.md/?a=1#x'), 'https://dgaefe.gov.md');
  assert.equal(n('http://localhost:8801/'), 'http://localhost:8801');
  assert.equal(n(''), '');
  assert.equal(n(undefined), '');
  assert.throws(() => n('dgaefe.gov.md'), /nu este validă/);
  assert.throws(() => n('ftp://dgaefe.gov.md'), /http:\/\/ sau https:\/\//);
  assert.throws(() => n('javascript:alert(1)'), /http:\/\/ sau https:\/\//);
});

test('adresa canonică și politica de securitate apar doar când sunt cerute', () => {
  const data = seedData();
  const plain = prerender.fillIndex(template, data);
  assert.doesNotMatch(plain, /rel="canonical"|Content-Security-Policy|og:url|DC\.identifier/);

  const html = prerender.fillIndex(template, data, { siteUrl: 'https://utilizator.github.io/depozit/', csp: true });
  assert.match(html, /<link rel="canonical" href="https:\/\/utilizator\.github\.io\/depozit\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/utilizator\.github\.io\/depozit\/">/);
  assert.match(html, /<meta name="DC\.identifier" content="https:\/\/utilizator\.github\.io\/depozit\/">/);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(csp, 'politica este în pagină');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<title>'), 'politica precede restul paginii');
  const policy = csp[1].replace(/&#39;/g, "'");
  assert.equal(policy, prerender.CSP);
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-src https:\/\/www\.google\.com/);
  // adresa greșită nu trece neobservată
  assert.throws(() => prerender.fillIndex(template, data, { siteUrl: 'nu e adresă' }), /nu este validă/);

  // completarea doar adaugă etichete în antet: nu pierde nimic din șablon și nu lasă resturi de text care ar încheia antetul mai devreme
  const head = h => /<head>([\s\S]*?)<\/head>/.exec(h)[1];
  const tags = h => (head(h).match(/<(?:meta|link|title)\b/g) || []).length;
  assert.equal(tags(html), tags(template) + 3 + 1, 'adresa canonică, DC.identifier, og:url și politica de securitate');
  assert.doesNotMatch(html, /\$[0-9&`']/, 'niciun semn de înlocuire rămas în text');
  assert.doesNotMatch(head(html).replace(/<title>[\s\S]*?<\/title>/, '').replace(/<[^>]*>/g, ''), /\S/, 'în antet nu rămâne text în afara etichetelor');
  assert.match(html, /<link rel="icon" href="assets\/img\/gov-logo\.svg" type="image\/svg\+xml">/);
});

test('pagina nu folosește nimic ce politica de securitate ar bloca', () => {
  // scripturi doar din fișiere ale paginii (cele inline sunt blocate): singurul script încorporat este blocul de date, care nu se execută
  const html = prerender.fillIndex(template, seedData(), { siteUrl: 'https://x.github.io/depozit', csp: true });
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 2);
  for (const attrs of scripts) assert.match(attrs, /\bsrc="assets\/js\/[\w.-]+\.js(\?v=[0-9a-f]+)?"/, `script: ${attrs}`);
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, 'fără atribute onclick etc.');
  assert.doesNotMatch(html, /javascript:/i);
  // nimic nu se încarcă de pe alt site (adresa canonică și legăturile pe care apeși nu se încarcă singure)
  for (const m of html.matchAll(/<(?:link\b[^>]*\brel="(?:stylesheet|preload|icon|modulepreload)"|img\b|script\b|iframe\b)[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]+"/g)) {
    assert.fail(`resursă încărcată de pe alt site: ${m[0]}`);
  }
  // scriptul paginii nu cheamă alte site-uri: singurele cereri de rețea merg la /api/ (același server)
  const siteJs = read('assets', 'js', 'site.js');
  const calls = [...siteJs.matchAll(/fetch\(\s*(['"`])([^'"`]*)\1/g)];
  assert.ok(calls.length >= 2);
  for (const m of calls) assert.match(m[2], /^\/api\//, `cerere către ${m[2]}`);
});

test('pagina „404”: adresa de bază, textele din setări și politica de securitate', () => {
  const tpl = read('404.html');
  assert.match(tpl, /\{\{BASE\}\}assets\/css\/site\.css/);
  const html = prerender.fillNotFound(tpl, { settings: { orgName: 'Direcția X', parentName: 'Cancelaria Y', contact: { mailTo: 'contact@exemplu.md' } } }, 'https://u.github.io/depozit/', { csp: true });
  assert.ok(!html.includes('{{BASE}}'), 'nu rămâne niciun semn de înlocuit');
  assert.match(html, /<link rel="stylesheet" href="https:\/\/u\.github\.io\/depozit\/assets\/css\/site\.css">/);
  assert.match(html, /<a class="brand" href="https:\/\/u\.github\.io\/depozit\/">/);
  assert.match(html, /<a href="https:\/\/u\.github\.io\/depozit\/#contacte">/);
  assert.match(html, /<title>Pagina nu a fost găsită \| Cancelaria Y<\/title>/);
  assert.equal(inner(html, 'brandName'), 'Direcția X');
  assert.match(html, /<a id="nfMail" href="mailto:contact@exemplu\.md">contact@exemplu\.md<\/a>/);
  assert.equal(inner(html, 'nfCopy'), '© Cancelaria Y');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(prerender.fillNotFound(tpl, {}, '/'), /Content-Security-Policy/);
  assert.match(prerender.fillNotFound(tpl, {}, '/'), /href="\/assets\/css\/site\.css"/);
  // fără script și fără stiluri încorporate: pagina funcționează sub politica de securitate
  assert.doesNotMatch(tpl, /<script|<style|\son[a-z]+=/i);
});

test('robots.txt: administrarea nu se indexează, nici într-un subdosar', () => {
  assert.equal(prerender.robotsTxt(''), 'User-agent: *\nAllow: /\nDisallow: /admin/\n');
  assert.equal(prerender.robotsTxt('https://dgaefe.gov.md'), 'User-agent: *\nAllow: /\nDisallow: /admin/\n');
  assert.equal(prerender.robotsTxt('https://u.github.io/depozit'), 'User-agent: *\nAllow: /\nDisallow: /depozit/admin/\n');
});

test('versiunea statică fără adresă: se poate deschide din calculator (fără politică, fără 404.html)', () => {
  const files = build();
  const index = textOf(files.get('index.html'));
  assert.ok(!files.has('404.html'));
  assert.doesNotMatch(index, /Content-Security-Policy|rel="canonical"/);
  assert.equal(textOf(files.get('robots.txt')), prerender.robotsTxt(''));
  // titlul și prezentarea sunt în HTML și fără JavaScript
  assert.match(index, /<h1 id="introTitle">Direcția Generală Coordonare Asistență Externă și <span class="h1-b">Fonduri Europene<\/span><\/h1>/);
  assert.match(index, /<p class="lead" id="introLead">Asigurăm rolul Cancelariei de Stat/);
  assert.match(index, /<html data-static="true" lang="ro">/);
});

test('versiunea statică cu adresa paginii: 404.html, adresa canonică, politica de securitate, robots.txt', () => {
  const site = 'https://igornistor2013-wq.github.io/DGCAEFE';
  const files = build({ siteUrl: `${site}/`, github: { repo: 'igornistor2013-wq/DGCAEFE', branch: 'main' } });
  const index = textOf(files.get('index.html'));
  assert.match(index, /<link rel="canonical" href="https:\/\/igornistor2013-wq\.github\.io\/DGCAEFE\/">/);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /<html data-static="true" data-github="igornistor2013-wq\/DGCAEFE" lang="ro">/);

  const nf = textOf(files.get('404.html'));
  assert.ok(!nf.includes('{{BASE}}'));
  // stilurile primesc amprenta de conținut, ca în prima pagină, și se încarcă de oriunde (adresă completă)
  assert.match(nf, new RegExp(`<link rel="stylesheet" href="${site.replace(/[.]/g, '\\.')}/assets/css/site\\.css\\?v=[0-9a-f]{10}">`));
  const refs = [...nf.matchAll(/(?:src|href)="(https:\/\/igornistor2013-wq\.github\.io\/DGCAEFE\/(assets\/[^"#?]+))(?:\?[^"]*)?"/g)].map(m => m[2]);
  assert.ok(refs.length >= 4);
  for (const r of refs) assert.ok(files.has(r), `${r} există în versiunea construită`);
  assert.match(nf, /Content-Security-Policy/);

  assert.equal(textOf(files.get('robots.txt')), 'User-agent: *\nAllow: /\nDisallow: /DGCAEFE/admin/\n');
  assert.ok(files.has('admin/index.html'));
});

test('adresa paginii greșită oprește construirea, cu mesaj clar', () => {
  assert.throws(() => build({ siteUrl: 'github.io/depozit' }), /Adresa paginii nu este validă/);
});

test('scriptul de construire: --site-url și SITE_URL', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-site-url-'));
  const dist = path.join(out, 'dist');
  try {
    const run = (args, env = {}) => execFileSync(process.execPath, [path.join(cfg.ROOT, 'scripts', 'build-static.js'), '--data', cfg.SEED_DIR, '--out', dist, ...args], { env: { ...process.env, ...env, SITE_URL: env.SITE_URL || '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.ok(!/pagina 404\.html/.test(run([])));
    assert.ok(!fs.existsSync(path.join(dist, '404.html')));

    assert.match(run(['--site-url', 'https://u.github.io/depozit']), /pagina 404\.html/);
    assert.match(fs.readFileSync(path.join(dist, '404.html'), 'utf8'), /https:\/\/u\.github\.io\/depozit\/assets\/css\/site\.css/);

    // fluxul de publicare dă o adresă goală când nu o cunoaște: construirea merge mai departe, fără 404.html
    run(['--site-url', '']);
    assert.ok(!fs.existsSync(path.join(dist, '404.html')));

    run([], { SITE_URL: 'https://dgaefe.gov.md' });
    assert.match(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), /rel="canonical" href="https:\/\/dgaefe\.gov\.md\/"/);
    assert.equal(fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8'), prerender.robotsTxt('https://dgaefe.gov.md'));

    assert.throws(() => run(['--site-url', 'nu e adresă']), /Adresa paginii nu este validă/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('fluxul de publicare pe GitHub Pages află adresa paginii înainte de construire și o dă mai departe', () => {
  const wf = fs.readFileSync(path.join(cfg.ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  const cfgAt = wf.indexOf('actions/configure-pages@v5');
  const buildAt = wf.indexOf('scripts/build-static.js');
  assert.ok(cfgAt > -1 && buildAt > cfgAt, 'configure-pages rulează înaintea construirii');
  assert.match(wf, /- id: pages\s+uses: actions\/configure-pages@v5/);
  assert.match(wf, /--site-url "\$\{\{ steps\.pages\.outputs\.base_url \}\}"/);
});

test('serverul: prima pagină cu titlul gata scris, robots.txt și pagina „404” cu denumirea instituției', async () => {
  cfg.SITE_URL = 'https://dgaefe.exemplu.md/';
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async p => {
    const r = await fetch(base + p);
    return { status: r.status, headers: r.headers, text: await r.text() };
  };
  try {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(home.headers.get('cache-control'), /no-cache/);
    assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(home.text, /<h1 id="introTitle">Direcția Generală Coordonare Asistență Externă și <span class="h1-b">Fonduri Europene<\/span><\/h1>/);
    assert.match(home.text, /<link rel="canonical" href="https:\/\/dgaefe\.exemplu\.md\/">/);
    assert.doesNotMatch(home.text, /<meta http-equiv="Content-Security-Policy"/, 'pe server politica este în antet, nu în pagină');

    // politica din versiunea statică spune același lucru ca antetul trimis de server (în afară de frame-ancestors, care nu se poate pune în pagină)
    const header = home.headers.get('content-security-policy').split(';').map(x => x.trim()).filter(x => x && !x.startsWith('frame-ancestors'));
    assert.deepEqual(header.sort(), prerender.CSP.split('; ').sort());

    // o modificare din administrare se vede imediat în titlul de pe prima pagină
    await store.setSettings({ ...store.getSettings(), heroTitle: 'Un titlu nou pentru direcție', heroLead: 'Prezentare nouă & scurtă' });
    const changed = await get('/');
    assert.match(changed.text, /<h1 id="introTitle">Un titlu nou <span class="h1-b">pentru direcție<\/span><\/h1>/);
    assert.match(changed.text, /<p class="lead" id="introLead">Prezentare nouă &amp; scurtă<\/p>/);

    const robots = await get('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type'), /text\/plain/);
    assert.equal(robots.text, 'User-agent: *\nAllow: /\nDisallow: /admin/\n');

    for (const p of ['/nu-exista', '/admin/nu-exista', '/assets/nu-exista.css', '/index.php']) {
      const nf = await get(p);
      assert.equal(nf.status, 404, p);
      assert.match(nf.headers.get('content-type'), /text\/html/);
      assert.match(nf.text, /<h1>Pagina nu a fost găsită<\/h1>/);
      assert.match(nf.text, /<a class="btn btn-primary" href="\/">/);
      assert.match(nf.text, /href="\/assets\/css\/site\.css/);
      assert.doesNotMatch(nf.text, /\{\{BASE\}\}/);
    }
    const api = await get('/api/nu-exista');
    assert.equal(api.status, 404);
    assert.match(api.headers.get('content-type'), /application\/json/);

    // stilurile și fonturile din pagina 404 există pe server
    assert.equal((await get('/assets/css/site.css')).status, 200);
    assert.equal((await fetch(base + '/assets/fonts/onest-latin.woff2')).status, 200);
  } finally {
    server.close();
    cfg.SITE_URL = '';
  }
});

test('serverul refuză să pornească cu o adresă a paginii greșită', () => {
  cfg.SITE_URL = 'nu e adresă';
  try {
    assert.throws(() => createApp(), /Adresa paginii nu este validă/);
  } finally {
    cfg.SITE_URL = '';
  }
});
