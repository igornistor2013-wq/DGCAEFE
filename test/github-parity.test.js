'use strict';
// Aceeași succesiune de operațiuni, o dată pe serverul real și o dată prin administrarea directă pe GitHub:
// rezultatele și conținutul salvat trebuie să fie la fel (cu excepția id-urilor, orelor și numelor fișierelor).
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-parity-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'Test-Parola-123!';
process.env.BCRYPT_COST = '4';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server');
const { createMockGitHub } = require('../test-support/mock-github');
const { createBackend } = require('../web/assets/js/admin-github-core.js');

const ROOT = path.resolve(__dirname, '..');
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

function seedFiles() {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, rel + e.name + '/');
      else out[rel + e.name] = fs.readFileSync(abs);
    }
  };
  walk(path.join(ROOT, 'seed'), 'seed/');
  return out;
}

// Adaptor pentru server: aceleași apeluri ca ale panoului, prin HTTP.
async function serverDriver() {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { csrf } = await login.json();
  const call = async (method, url, body) => {
    const headers = { cookie };
    if (method !== 'GET') headers['x-csrf-token'] = csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  };
  const upload = async (kind, name, bytes) => {
    const fd = new FormData();
    fd.append('file', new Blob([bytes]), name);
    const r = await fetch(`${base}/api/admin/upload/${kind}`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, body: fd });
    return r.json();
  };
  return {
    call,
    upload,
    close: () => server.close(),
    content: name => JSON.parse(fs.readFileSync(path.join(tmp, 'content', name + '.json'), 'utf8')),
    uploads: () =>
      ['img', 'docs'].flatMap(sub =>
        fs.readdirSync(path.join(tmp, 'uploads', sub)).map(n => ({ path: `/uploads/${sub}/${n}`, bytes: fs.readFileSync(path.join(tmp, 'uploads', sub, n)) }))
      )
  };
}

// Adaptor pentru administrarea pe GitHub.
async function githubDriver() {
  const mock = createMockGitHub();
  mock.init(seedFiles());
  const { url } = await mock.listen();
  const gh = createBackend({ api: url, owner: 'org', repo: 'site', branch: 'main', linger: 1, ttl: 0 });
  await gh.login('tok-ok');
  return {
    call: async (method, u, body) => {
      try {
        return { status: method === 'POST' ? 201 : 200, data: await gh.request(method, u, body) };
      } catch (e) {
        return { status: e.status, data: { error: e.message } };
      }
    },
    upload: async (kind, name, bytes) => gh.stage(kind, { name, bytes: new Uint8Array(bytes) }),
    close: () => mock.close(),
    content: name => JSON.parse(mock.fileText(`storage/content/${name}.json`)),
    uploads: () => mock.files('storage/uploads/').map(p => ({ path: p.slice('storage'.length), bytes: mock.fileBuf(p) }))
  };
}

// Fără valorile care diferă de la o rulare la alta.
const FILE_NAME = /(\/uploads\/(?:img|docs)\/)[0-9a-z]+-/g;
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'id' && typeof x === 'string' && /^[0-9a-f]{12}$/.test(x)) out[k] = '#';
      else if (k === 'createdAt' || k === 'updatedAt') out[k] = x ? 'T' : x;
      else out[k] = normalize(x);
    }
    return out;
  }
  return typeof v === 'string' ? v.replace(FILE_NAME, '$1X-') : v;
}

async function scenario(d) {
  const log = [];
  const run = async (label, method, url, body) => {
    const r = await d.call(method, url, body);
    log.push([label, r.status, normalize(r.data)]);
    return r.data;
  };

  const img = await d.upload('image', 'Fotografie 1.png', PNG_1PX);
  const thumb = await d.upload('image', 'Fotografie 1-t.png', PNG_1PX);
  const doc = await d.upload('doc', 'Raport anual.pdf', PDF);
  const f = x => ({ path: x.path, name: x.name, size: x.size });

  const n1 = await run('știre nouă', 'POST', '/api/admin/news', { title: 'Prima știre', date: '2026-10-05', tag: 'Anunț', summary: 'Rezumat', body: 'Text **îngroșat**.', image: { ...f(img), thumb: thumb.path }, imageAlt: 'O fotografie', attachment: f(doc), linkUrl: 'https://exemplu.md', linkLabel: 'Citește' });
  await run('știre greșită', 'POST', '/api/admin/news', { title: '', date: '2026-10-05' });
  await run('știre cu dată greșită', 'POST', '/api/admin/news', { title: 'X', date: '31.12.2026' });
  await run('modificare știre', 'PUT', `/api/admin/news/${n1.id}`, { title: 'Prima știre, modificată', date: '2026-10-06', published: false });
  await run('modificare inexistentă', 'PUT', '/api/admin/news/inexistent', { title: 'X', date: '2026-10-06' });

  const programs = await d.call('GET', '/api/admin/programs');
  await run('document al unui program', 'POST', '/api/admin/documents', { title: 'Ghid', section: 'program', program: programs.data[0].id, group: 'oficial', kind: 'Ghid', year: 2026, file: f(doc), description: 'Descriere' });
  await run('document fără program', 'POST', '/api/admin/documents', { title: 'Ghid', section: 'program', url: 'https://exemplu.md/a.pdf' });
  await run('raport fără an', 'POST', '/api/admin/documents', { title: 'Raport', section: 'rapoarte', url: 'https://exemplu.md/r.pdf' });
  await run('raport cu dată', 'POST', '/api/admin/documents', { title: 'Raport 2025', section: 'rapoarte', url: 'https://exemplu.md/r.pdf', date: '2026-03-01' });

  await run('eveniment', 'POST', '/api/admin/events', { title: 'Sesiune', start: '2026-11-02', end: '2026-11-03', place: 'Chișinău', summary: 'Descriere', details: 'Rând 1\nRând 2', links: [{ t: 'Înscriere', u: 'https://exemplu.md/inscriere' }] });
  await run('eveniment cu sfârșit înainte de început', 'POST', '/api/admin/events', { title: 'Sesiune', start: '2026-11-03', end: '2026-11-02', summary: 'Descriere' });
  await run('act normativ', 'POST', '/api/admin/legal', { type: 'Lege', nr: '12', year: 2026, title: 'Privind ceva', topic: 'Ceva', url: 'https://legis.md/12' });
  await run('act fără an', 'POST', '/api/admin/legal', { type: 'HG', nr: '1', title: 'Fără an' });

  const invs = (await d.call('GET', '/api/admin/investments')).data;
  const p1 = await run('proiect nou', 'POST', '/api/admin/investments', { name: 'Proiect de test', ministry: 'MF', amount: '12,5', currency: 'MDL', amountQual: 'circa', cluster: 'fezabilitate', status: 'intarziere', stage: 10, refStage: 12, totalStages: 40, text: 'Stadiu.', delays: 'Etape în întârziere:\n1. Ceva', next: 'Pasul următor.', links: [{ t: 'Sursa', u: 'https://exemplu.md' }, { t: '', u: '' }], published: false });
  await run('proiect fără denumire', 'POST', '/api/admin/investments', { name: '' });
  await run('proiect cu etapa peste total', 'POST', '/api/admin/investments', { name: 'X', stage: 50, totalStages: 40 });
  await run('proiect cu stare necunoscută', 'POST', '/api/admin/investments', { name: 'X', status: 'gata' });
  await run('proiect publicat', 'PUT', `/api/admin/investments/${p1.id}`, { ...p1, published: true, amount: '', amountQual: 'max.', order: 20 });
  await run('proiect din Raport modificat', 'PUT', `/api/admin/investments/${invs[3].id}`, { ...invs[3], status: 'blocat', next: 'Pas nou.' });
  await run('proiect inexistent', 'PUT', '/api/admin/investments/inexistent', { name: 'x' });
  await run('proiect șters', 'DELETE', `/api/admin/investments/${p1.id}`);

  const g1 = await run('fotografie', 'POST', '/api/admin/gallery', { title: 'Poză', album: 'Album', date: '2026-10-01', alt: 'Descriere', file: { ...f(img), thumb: thumb.path } });
  const gallery = (await d.call('GET', '/api/admin/gallery')).data;
  await run('mutare în album', 'PUT', `/api/admin/gallery/${gallery[1].id}`, { title: gallery[1].title, album: 'Mutat', date: gallery[1].date, alt: gallery[1].alt, file: gallery[1].file });
  await run('fotografie de exemplu modificată (rămâne „sample”)', 'PUT', `/api/admin/gallery/${gallery.find(g => g.sample).id}`, { title: 'Alt titlu', album: '', date: '2026-01-01', alt: 'Alt', file: gallery.find(g => g.sample).file });
  await run('fotografie ștearsă', 'DELETE', `/api/admin/gallery/${g1.id}`);

  await run('program', 'PUT', `/api/admin/programs/${programs.data[1].id}`, { ...programs.data[1], desc: 'Descriere nouă', facts: [{ b: '1 mil. EUR', t: 'buget' }, { b: '', t: '' }] });
  const settings = (await d.call('GET', '/api/admin/settings')).data;
  await run('texte', 'PUT', '/api/admin/settings', { ...settings, heroTitle: 'Titlu nou', quickLinks: [{ t: 'Programe', u: '#programe' }], contact: { ...settings.contact, phones: 'a\nb\n\nc' } });
  await run('texte greșite', 'PUT', '/api/admin/settings', { ...settings, contact: { ...settings.contact, mailTo: 'nu-este-email' } });

  await run('ștergere știre', 'DELETE', `/api/admin/news/${n1.id}`);
  await run('ștergere repetată', 'DELETE', `/api/admin/news/${n1.id}`);
  return log;
}

test('serverul și administrarea pe GitHub dau aceleași rezultate și același conținut', async () => {
  const a = await serverDriver();
  const b = await githubDriver();
  try {
    const logA = await scenario(a);
    const logB = await scenario(b);
    assert.equal(logA.length, logB.length);
    for (let i = 0; i < logA.length; i++) {
      // serverul răspunde „201” la creare, iar adaptorul GitHub nu cunoaște codul exact: contează doar reușita sau eșecul și mesajul
      const [labelA, statusA, bodyA] = logA[i];
      const [, statusB, bodyB] = logB[i];
      assert.equal(statusB >= 400 ? statusB : 'ok', statusA >= 400 ? statusA : 'ok', `${labelA}: stare`);
      assert.deepEqual(bodyB, bodyA, `${labelA}: răspuns`);
    }

    for (const name of ['news', 'documents', 'events', 'legal', 'programs', 'gallery', 'investments', 'settings']) {
      assert.deepEqual(normalize(b.content(name)), normalize(a.content(name)), `conținut: ${name}`);
    }
    // fișierele încărcate (fără cele de exemplu, pe care serverul le copiază toate)
    const files = d => d.uploads().filter(f => !/\/sample-/.test(f.path)).map(f => [f.path.replace(FILE_NAME, '$1X-'), f.bytes.length]).sort();
    assert.deepEqual(files(b), files(a));
    const used = new Set(b.uploads().map(f => f.path));
    for (const g of b.content('gallery')) assert.ok(used.has(g.file.path), 'fiecare fotografie din galerie are fișierul ei');
  } finally {
    a.close();
    await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
