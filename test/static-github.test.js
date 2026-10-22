'use strict';
// Construirea versiunii pentru GitHub Pages cu administrare directă în depozit: ce fișiere conține și cum e configurată.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cfg = require('../lib/config');
const staticSite = require('../lib/static-site');

const SHA = 'ABCDEF0123456789abcdef0123456789ABCDEF01';
const build = opts => {
  const list = staticSite.entries(staticSite.diskReader(cfg.SEED_DIR), cfg.SEED_DIR, opts);
  return new Map(list.map(e => [e.name, e]));
};
const textOf = e => (e.text !== undefined ? e.text : fs.readFileSync(e.file, 'utf8'));

test('fără opțiunea GitHub versiunea statică rămâne doar pentru citire', () => {
  const files = build();
  assert.ok(!files.has('admin/index.html'));
  assert.ok(!files.has('version.json'));
  assert.ok(![...files.keys()].some(n => /^assets\/js\/admin/.test(n) || n === 'assets/css/admin.css'));
  assert.ok(!/data-github/.test(textOf(files.get('index.html'))));
  assert.match(textOf(files.get('index.html')), /<html data-static="true" lang="ro">/);
});

test('cu opțiunea GitHub: pagina de administrare, scripturile, version.json și marcajul din pagina publică', () => {
  const files = build({ github: { repo: 'igornistor2013-wq/DGCAEFE', branch: 'main' }, commit: SHA });

  const index = textOf(files.get('index.html'));
  assert.match(index, /<html data-static="true" data-github="igornistor2013-wq\/DGCAEFE" lang="ro">/);

  const admin = textOf(files.get('admin/index.html'));
  assert.match(admin, /<meta name="dgaefe-github" content="igornistor2013-wq\/DGCAEFE" data-branch="main" data-api="https:\/\/api\.github\.com">/);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(admin);
  assert.ok(csp, 'există o politică de securitate a conținutului');
  assert.match(csp[1], /script-src 'self'(;|$)/);
  assert.match(csp[1], /connect-src 'self' https:\/\/api\.github\.com(;|$)/);
  assert.match(csp[1], /object-src 'none'/);
  assert.ok(admin.indexOf('Content-Security-Policy') < admin.indexOf('<script'), 'politica precede scripturile');

  const scripts = [...admin.matchAll(/<script src="\.\.\/assets\/js\/([\w-]+\.js)(?:\?v=[0-9a-f]{10})?" defer><\/script>/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['common.js', 'admin-schemas.js', 'admin-core.js', 'admin-forms.js', 'admin-pages.js', 'admin-system.js', 'content-overlay.js', 'admin-github-core.js', 'admin-github.js', 'admin.js']);

  const v = JSON.parse(textOf(files.get('version.json')));
  assert.equal(v.commit, SHA.toLowerCase());
  assert.equal(v.repo, 'igornistor2013-wq/DGCAEFE');
  assert.equal(v.branch, 'main');
  assert.ok(!isNaN(Date.parse(v.builtAt)));

  assert.match(textOf(files.get('README.txt')), /admin\//);
});

test('tot ce referă pagina de administrare există în versiunea construită', () => {
  const files = build({ github: { repo: 'org/site' }, commit: SHA });
  const admin = textOf(files.get('admin/index.html'));
  const refs = [...admin.matchAll(/(?:src|href)="\.\.\/(assets\/[^"#?]+)(?:\?[^"#]*)?"/g)].map(m => m[1]);
  assert.ok(refs.length > 10);
  for (const r of refs) assert.ok(files.has(r), `lipsește ${r}`);
  // și fișierele de care depind scripturile publice
  for (const n of ['assets/js/site.js', 'assets/js/common.js', 'assets/css/site.css']) assert.ok(files.has(n), n);
});

// GitHub Pages lasă fișierele în memoria browserului până la 10 minute. Fără amprentă în adresă, după o publicare pagina nouă ar putea porni cu
// scripturile vechi și ar părea neschimbată („nu s-a schimbat nimic”).
test('scripturile și stilurile au în adresă amprenta conținutului lor, în pagina publică și în cea de administrare', () => {
  const sum = file => crypto.createHash('sha1').update(fs.readFileSync(path.join(cfg.WEB_DIR, 'assets', file))).digest('hex').slice(0, 10);
  const seen = new Map();
  for (const [opts, pages] of [[undefined, ['index.html']], [{ github: { repo: 'org/site' }, commit: SHA }, ['index.html', 'admin/index.html']]]) {
    const files = build(opts);
    for (const page of pages) {
      const html = textOf(files.get(page));
      const refs = [...html.matchAll(/(?:src|href)="(?:\.\.\/)?assets\/((?:js|css)\/[\w.-]+\.(?:js|css))([^"]*)"/g)];
      assert.ok(refs.length >= 3, `${page}: scripturile și stilurile sunt referite`);
      for (const [, file, query] of refs) {
        assert.equal(query, `?v=${sum(file)}`, `${page}: ${file} are amprenta corectă`);
        seen.set(file, query);
      }
    }
  }
  assert.ok(seen.has('js/site.js') && seen.has('js/common.js') && seen.has('css/site.css') && seen.has('js/admin-github.js'));
  assert.notEqual(seen.get('js/site.js'), seen.get('js/common.js'), 'fișiere diferite, amprente diferite');
  // fișierele în sine rămân la aceleași adrese (fără amprentă în numele lor), deci adresele relative din CSS și din alte scripturi nu se strică
  const files = build({ github: { repo: 'org/site' } });
  for (const n of ['assets/js/site.js', 'assets/css/site.css', 'assets/js/admin-github.js']) assert.ok(files.has(n), n);
  assert.doesNotMatch(textOf(files.get('assets/css/site.css')), /\?v=[0-9a-f]{10}/);
});

test('scripturile și stilurile de administrare sunt valide', () => {
  const files = build({ github: { repo: 'org/site' } });
  let n = 0;
  for (const [name, e] of files) {
    if (/^assets\/js\/.+\.js$/.test(name)) {
      assert.doesNotThrow(() => new vm.Script(textOf(e), { filename: name }), name);
      n++;
    }
  }
  assert.ok(n >= 9);
});

test('commit-ul necunoscut sau greșit nu ajunge în version.json', () => {
  for (const commit of [undefined, '', 'nu-este-sha', 'xyz', '12345', 'g'.repeat(40)]) {
    const files = build({ github: { repo: 'org/site' }, commit });
    assert.equal(JSON.parse(textOf(files.get('version.json'))).commit, null, String(commit));
  }
});

test('ramura și adresa API-ului se pot schimba (de exemplu pentru teste)', () => {
  const files = build({ github: { repo: 'org/site', branch: 'master', api: 'http://127.0.0.1:3201/' } });
  const admin = textOf(files.get('admin/index.html'));
  assert.match(admin, /data-branch="master" data-api="http:\/\/127\.0\.0\.1:3201"/);
  assert.match(admin, /connect-src 'self' http:\/\/127\.0\.0\.1:3201;/);
});

test('valorile nepotrivite sunt respinse înainte de a ajunge în pagină', () => {
  const bad = [
    [{ repo: 'fara-proprietar' }, /proprietar\/depozit/],
    [{ repo: 'a/b/c' }, /proprietar\/depozit/],
    [{ repo: '../..' }, /proprietar\/depozit/],
    [{ repo: 'a/"><script>' }, /proprietar\/depozit/],
    [{ repo: 'org/site', branch: 'a b' }, /ramurii/],
    [{ repo: 'org/site', branch: '../x' }, /ramurii/],
    [{ repo: 'org/site', api: 'javascript:alert(1)' }, /http/],
    [{ repo: 'org/site', api: 'nu este adresa' }, /nu este validă/]
  ];
  for (const [github, re] of bad) assert.throws(() => build({ github }), re, JSON.stringify(github));
});

test('scriptul de construire: --github-repo, --github-branch, --commit și GITHUB_SHA', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-gh-build-'));
  const dist = path.join(out, 'dist');
  try {
    const run = (args, env = {}) => execFileSync(process.execPath, [path.join(cfg.ROOT, 'scripts', 'build-static.js'), '--data', cfg.SEED_DIR, '--out', dist, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });

    const plain = run([]);
    assert.ok(!fs.existsSync(path.join(dist, 'admin')), 'fără opțiuni nu se creează administrarea');
    assert.ok(!/administrare pe GitHub/.test(plain));

    const text = run(['--github-repo', 'org/site', '--github-branch', 'dev', '--commit', SHA]);
    assert.match(text, /administrare pe GitHub: org\/site \(ramura dev\)/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8')).commit, SHA.toLowerCase());
    assert.ok(fs.existsSync(path.join(dist, 'admin', 'index.html')));
    assert.ok(fs.existsSync(path.join(dist, '.nojekyll')));

    // în GitHub Actions versiunea se ia din GITHUB_SHA
    run(['--github-repo', 'org/site'], { GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8')).commit, '0123456789abcdef0123456789abcdef01234567');
    assert.match(fs.readFileSync(path.join(dist, 'admin', 'index.html'), 'utf8'), /data-branch="main"/);

    assert.throws(() => run(['--github-repo', 'greșit']), /proprietar\/depozit/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('fluxul de publicare pe GitHub Pages construiește cu administrare pentru depozitul curent', () => {
  const wf = fs.readFileSync(path.join(cfg.ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.match(wf, /--github-repo "\$GITHUB_REPOSITORY"/);
  assert.match(wf, /--github-branch "\$GITHUB_REF_NAME"/);
  const ci = fs.readFileSync(path.join(cfg.ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /paths-ignore:\s*\['storage\/\*\*'\]/);
});
