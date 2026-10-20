'use strict';
// Administrarea direct pe GitHub (fără server): logica din web/assets/js/admin-github-core.js, încercată pe un
// simulator al API-ului GitHub (test-support/mock-github.js). Rulează cu: npm test
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockGitHub } = require('../test-support/mock-github');
const { createBackend, parseAuditCommit } = require('../web/assets/js/admin-github-core.js');
const { oldContent, seedContent } = require('../test-support/old-content');

const ROOT = path.resolve(__dirname, '..');
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

function projectFiles() {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, rel + e.name + '/');
      else out[rel + e.name] = fs.readFileSync(abs);
    }
  };
  walk(path.join(ROOT, 'seed'), 'seed/');
  out['README.md'] = 'Proiect';
  out['web/index.html'] = '<!doctype html>';
  return out;
}

// Un depozit simulat + un serviciu conectat cu jetonul bun.
async function setup(t, { login = true, ttl = 0, linger = 5, ...rest } = {}) {
  const mock = createMockGitHub();
  mock.init(projectFiles());
  const { url } = await mock.listen();
  t.after(() => mock.close());
  const gh = createBackend({ api: url, owner: 'org', repo: 'site', branch: 'main', linger, ttl, ...rest });
  gh.setToken('tok-ok');
  if (login) await gh.login('tok-ok');
  return { mock, gh, url };
}

const news = (over = {}) => ({ title: 'Titlu de test', date: '2026-10-05', summary: 'Rezumat', ...over });
const fileObj = f => ({ path: f.path, name: f.name, size: f.size });
const seedNews = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/content/news.json'), 'utf8'));

async function rejects(promise, status, re) {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.status, status, `stare așteptată ${status}, primită ${e.status}: ${e.message}`);
    if (re) assert.match(e.message, re);
    return e;
  }
  assert.fail('cererea trebuia să eșueze');
}

/* ---------- conectare ---------- */
test('conectare: jeton greșit, fără drept de scriere, fără acces la depozit, ramură lipsă', async t => {
  const { mock, url } = await setup(t, { login: false });
  const make = (extra = {}) => createBackend({ api: url, owner: 'org', repo: 'site', branch: 'main', linger: 5, ...extra });

  await rejects(make().login('nu-exista'), 401, /nu este valabil/);
  await rejects(make().login('   '), 400, /Introduceți jetonul/);
  await rejects(make().login('doua cuvinte'), 400, /spații/);
  await rejects(make().login('tok-read'), 403, /Contul cititor nu are drept de scriere în depozitul org\/site/);
  const ro = await rejects(make().login('tok-fine-ro'), 403, /Contents: Read and write/);
  assert.ok(ro.message.includes('org/site'));
  await rejects(make().login('tok-other'), 404, /org\/site/);
  await rejects(make({ branch: 'lipsa' }).login('tok-ok'), 404, /Ramura „lipsa”/);
  mock.state.archived = true;
  await rejects(make().login('tok-ok'), 403, /arhivat/);
  mock.state.archived = false;

  const gh = make();
  const user = await gh.login('tok-ok');
  assert.deepEqual(user, { login: 'editor', id: 4242, name: 'Ana Editor' });
  assert.equal(gh.hasToken(), true);
  // verificarea dreptului de scriere nu modifică depozitul
  assert.equal(mock.count('PATCH'), 0);
  assert.equal(mock.files('storage/').length, 0);
});

test('un jeton greșit nu înlocuiește jetonul bun deja folosit', async t => {
  const { gh } = await setup(t);
  await rejects(gh.login('altul-gresit'), 401);
  assert.equal(gh.hasToken(), true);
  const list = await gh.request('GET', '/api/admin/news');
  assert.ok(Array.isArray(list));
});

/* ---------- citire și prima salvare ---------- */
test('înainte de prima salvare, conținutul se citește din „seed” și nu se scrie nimic', async t => {
  const { mock, gh } = await setup(t);
  mock.resetLog();
  const list = await gh.request('GET', '/api/admin/news');
  assert.deepEqual(list, seedNews());
  const settings = await gh.request('GET', '/api/admin/settings');
  assert.equal(typeof settings.orgName, 'string');
  const programs = await gh.request('GET', '/api/admin/programs');
  assert.ok(programs.length >= 5);
  assert.equal(mock.count('POST'), 0);
  assert.equal(mock.count('PATCH'), 0);
});

test('prima salvare creează „storage” din conținutul de pornire, fără să copieze ce nu e folosit', async t => {
  const { mock, gh } = await setup(t);
  const before = mock.commits().size;
  const rec = await gh.request('POST', '/api/admin/news', news());
  assert.match(rec.id, /^[0-9a-f]{12}$/);
  assert.equal(rec.title, 'Titlu de test');
  assert.equal(rec.published, true);
  assert.equal(mock.commits().size, before + 1);

  const content = mock.files('storage/content/');
  assert.deepEqual(content, ['documents', 'events', 'gallery', 'investments', 'legal', 'news', 'programs', 'settings'].map(n => `storage/content/${n}.json`));
  const saved = JSON.parse(mock.fileText('storage/content/news.json'));
  assert.equal(saved.length, seedNews().length + 1);
  assert.equal(saved[0].id, rec.id, 'elementul nou apare primul, ca pe server');
  assert.ok(mock.fileText('storage/content/news.json').endsWith('}\n]\n'), 'același format ca pe server');
  // celelalte colecții sunt cele din seed
  assert.equal(mock.fileText('storage/content/events.json'), fs.readFileSync(path.join(ROOT, 'seed/content/events.json'), 'utf8').trimEnd() + '\n');
  // imaginile de exemplu din galerie sunt copiate (aceleași blob-uri, nu se retrimit)
  assert.ok(mock.files('storage/uploads/img/').length >= 6);
  assert.deepEqual(mock.fileBuf('storage/uploads/img/sample-1.jpg'), mock.fileBuf('seed/uploads/img/sample-1.jpg'));
  assert.equal(mock.count('POST', '/git/blobs'), 1, 'doar sonda de la conectare a creat un blob');

  const head = mock.commits().get(mock.head());
  assert.match(head.message, /^Știre adăugată: Titlu de test\n\n\[dgaefe-admin\] \{"a":"create","c":"news","d":"Titlu de test"\}$/);
  assert.equal(head.author.name, 'Ana Editor');
  assert.equal(head.author.email, '4242+editor@users.noreply.github.com');
});

const asFile = v => JSON.stringify(v, null, 2) + '\n';
const oldStorage = edits => Object.fromEntries(Object.entries(oldContent(edits)).map(([n, v]) => [`storage/content/${n}.json`, asFile(v)]));

test('prima acțiune poate fi modificarea unui proiect din conținutul de pornire: se salvează tot conținutul, cu proiectul modificat', async t => {
  const { mock, gh } = await setup(t);
  const list = await gh.request('GET', '/api/admin/investments');
  assert.equal(list.length, 19);
  assert.equal(mock.files('storage/').length, 0, 'citirea nu scrie nimic');
  const p = list.find(x => x.order === 5);
  const before = mock.commits().size;
  const upd = await gh.request('PUT', `/api/admin/investments/${p.id}`, { ...p, period: '2027–2033', beneficiaries: 'Beneficiari noi.' });
  assert.equal(upd.id, p.id);
  assert.equal(upd.period, '2027–2033');
  assert.equal(mock.commits().size, before + 1);
  const saved = JSON.parse(mock.fileText('storage/content/investments.json'));
  assert.equal(saved.length, 19);
  assert.deepEqual(saved.find(x => x.id === p.id).beneficiaries, 'Beneficiari noi.');
  assert.equal(saved.filter(x => x.beneficiaries === 'Beneficiari noi.').length, 1, 'celelalte proiecte rămân cum erau');
  assert.equal(saved.filter(x => x.period === '2027–2033').length, 1, 'celelalte proiecte rămân cum erau');
  assert.ok(saved.every(x => !('status' in x) && !('progress' in x) && !('cluster' in x)), 'fără stare, progres sau etapă');
  assert.deepEqual(JSON.parse(mock.fileText('storage/content/legal.json')).length, 16);
  assert.match(mock.commits().get(mock.head()).message, /^Proiect investițional modificat: .+\n\n\[dgaefe-admin\] \{"a":"update","c":"investments"/);
});

test('conținut mai vechi în depozit: la citire se completează din „seed”, iar prima salvare scrie completările fără să piardă modificările', async t => {
  const { mock, gh, url } = await setup(t);
  const mine = { heroLead: 'Textul meu de prezentare.', footerNote: 'Nota mea.' };
  const old = oldStorage(mine);
  mock.commitFiles(old, 'Conținut salvat de versiunea anterioară');
  mock.resetLog();
  const base = mock.commits().size;

  const investments = await gh.request('GET', '/api/admin/investments');
  assert.equal(investments.length, 19);
  assert.equal((await gh.request('GET', '/api/admin/legal')).length, 16);
  const settings = await gh.request('GET', '/api/admin/settings');
  assert.equal(settings.heroLead, mine.heroLead, 'textul scris de administrator rămâne');
  assert.match(settings.orgName, /Coordonare/, 'textul implicit vechi este înlocuit');
  assert.equal(settings.seedRev, seedContent().settings.seedRev);
  assert.equal(mock.count('POST'), 0);
  assert.equal(mock.count('PATCH'), 0);
  assert.equal(mock.commits().size, base, 'citirea nu scrie nimic');
  assert.equal(mock.fileText('storage/content/investments.json'), null);

  const rec = await gh.request('POST', '/api/admin/news', news({ title: 'După actualizare' }));
  assert.equal(mock.commits().size, base + 1, 'completările se scriu odată cu prima salvare, într-un singur commit');
  assert.equal(JSON.parse(mock.fileText('storage/content/investments.json')).length, 19);
  assert.equal(JSON.parse(mock.fileText('storage/content/legal.json')).length, 16);
  const saved = JSON.parse(mock.fileText('storage/content/settings.json'));
  assert.deepEqual([saved.heroLead, saved.footerNote, saved.seedRev], [mine.heroLead, mine.footerNote, seedContent().settings.seedRev]);
  assert.deepEqual(JSON.parse(mock.fileText('storage/content/news.json')).map(x => x.id).slice(0, 1), [rec.id]);
  for (const n of ['documents', 'events', 'programs', 'gallery']) assert.equal(mock.fileText(`storage/content/${n}.json`), old[`storage/content/${n}.json`], `${n} rămâne neschimbat`);

  // o sesiune nouă citește același conținut, iar o salvare ulterioară nu mai rescrie ce nu s-a schimbat
  const gh2 = createBackend({ api: url, owner: 'org', repo: 'site', branch: 'main', linger: 5, ttl: 0 });
  await gh2.login('tok-ok');
  assert.equal((await gh2.request('GET', '/api/admin/investments')).length, 19);
  const sha = n => mock.headTree().get(`storage/content/${n}.json`).sha;
  const [invSha, legalSha, setSha] = [sha('investments'), sha('legal'), sha('settings')];
  await gh2.request('POST', '/api/admin/news', news({ title: 'A doua după actualizare' }));
  assert.equal(mock.commits().size, base + 2);
  assert.deepEqual([sha('investments'), sha('legal'), sha('settings')], [invSha, legalSha, setSha]);
});

test('regulile de validare sunt cele ale serverului și o cerere greșită nu face niciun commit', async t => {
  const { mock, gh } = await setup(t);
  const before = mock.commits().size;
  await rejects(gh.request('POST', '/api/admin/news', news({ title: '' })), 400, /„Titlu” este obligatoriu/);
  await rejects(gh.request('POST', '/api/admin/news', news({ date: '2026-02-30' })), 400, /Data/);
  await rejects(gh.request('POST', '/api/admin/documents', { title: 'x', section: 'general' }), 400, /fișier sau introduceți o adresă/);
  await rejects(gh.request('POST', '/api/admin/documents', { title: 'x', section: 'program', url: 'https://example.org/a.pdf' }), 400, /programul/);
  await rejects(gh.request('POST', '/api/admin/news', news({ image: { path: '/uploads/img/nu-exista.jpg' } })), 400, /nu mai există/);
  await rejects(gh.request('PUT', '/api/admin/news/inexistent', news()), 404, /nu a fost găsit/);
  await rejects(gh.request('DELETE', '/api/admin/news/inexistent'), 404);
  await rejects(gh.request('GET', '/api/admin/nimic'), 404);
  await rejects(gh.request('POST', '/api/admin/password', {}), 404);
  assert.equal(mock.commits().size, before);
});

test('modificare și ștergere păstrează id-ul și data creării', async t => {
  const { mock, gh } = await setup(t);
  const a = await gh.request('POST', '/api/admin/news', news({ title: 'Prima' }));
  const b = await gh.request('POST', '/api/admin/news', news({ title: 'A doua' }));
  let list = await gh.request('GET', '/api/admin/news');
  assert.deepEqual(list.slice(0, 2).map(x => x.title), ['A doua', 'Prima']);

  await new Promise(r => setTimeout(r, 15));
  const upd = await gh.request('PUT', `/api/admin/news/${a.id}`, news({ title: 'Prima, modificată', published: false }));
  assert.equal(upd.id, a.id);
  assert.equal(upd.createdAt, a.createdAt);
  assert.ok(upd.updatedAt > a.updatedAt);
  assert.equal(upd.published, false);

  assert.deepEqual(await gh.request('DELETE', `/api/admin/news/${b.id}`), { ok: true });
  list = await gh.request('GET', '/api/admin/news');
  assert.ok(!list.some(x => x.id === b.id));
  assert.ok(list.some(x => x.id === a.id && x.title === 'Prima, modificată'));
  const saved = JSON.parse(mock.fileText('storage/content/news.json'));
  assert.deepEqual(saved.map(x => x.id), list.map(x => x.id));
});

test('textele paginii și programele', async t => {
  const { mock, gh } = await setup(t);
  const settings = await gh.request('GET', '/api/admin/settings');
  const saved = await gh.request('PUT', '/api/admin/settings', { ...settings, footerNote: 'Notă nouă' });
  assert.equal(saved.footerNote, 'Notă nouă');
  assert.ok(saved.updatedAt);
  await rejects(gh.request('PUT', '/api/admin/settings', { ...settings, orgName: '' }), 400, /„Denumirea direcției”/);
  await rejects(gh.request('PUT', '/api/admin/settings', { ...settings, contact: { ...settings.contact, mapEmbed: 'https://exemplu.md/harta' } }), 400, /google\.com\/maps\/embed/);
  assert.equal(JSON.parse(mock.fileText('storage/content/settings.json')).footerNote, 'Notă nouă');

  const [p] = await gh.request('GET', '/api/admin/programs');
  const up = await gh.request('PUT', `/api/admin/programs/${p.id}`, { ...p, desc: 'Descriere nouă' });
  assert.equal(up.desc, 'Descriere nouă');
  assert.equal(up.order, p.order);
  await rejects(gh.request('PUT', `/api/admin/programs/${p.id}`, { ...p, name: '' }), 400, /Denumirea/);
});

/* ---------- fișiere ---------- */
test('fișierele încărcate: verificări, trimitere odată cu înregistrarea și ștergere când nu mai sunt folosite', async t => {
  const { mock, gh } = await setup(t);

  assert.throws(() => gh.stage('image', { name: 'virus.exe', bytes: PNG_1PX }), e => e.status === 400 && /Format neacceptat/.test(e.message));
  assert.throws(() => gh.stage('image', { name: 'fals.png', bytes: Buffer.from('nu sunt o imagine') }), e => e.status === 400 && /nu corespunde/.test(e.message));
  assert.throws(() => gh.stage('doc', { name: 'gol.pdf', bytes: Buffer.alloc(0) }), e => e.status === 400);
  assert.throws(() => gh.stage('doc', { name: 'mare.pdf', bytes: Buffer.concat([PDF, Buffer.alloc(26 * 1048576)]) }), e => e.status === 413);

  const img = gh.stage('image', { name: 'Fotografie Ștefan.PNG', bytes: PNG_1PX });
  assert.match(img.path, /^\/uploads\/img\/[0-9a-z]+-fotografie-stefan\.png$/);
  assert.equal(img.name, 'Fotografie Ștefan.PNG');
  const thumb = gh.stage('image', { name: 'mica.jpeg', bytes: JPEG });
  assert.match(thumb.path, /\.jpg$/);
  const doc = gh.stage('doc', { name: 'Raport.pdf', bytes: PDF });
  const lost = gh.stage('doc', { name: 'abandonat.pdf', bytes: PDF });

  const rec = await gh.request('POST', '/api/admin/news', news({ image: { ...fileObj(img), thumb: thumb.path }, attachment: fileObj(doc) }));
  assert.equal(rec.image.path, img.path);
  assert.equal(rec.image.thumb, thumb.path);
  assert.deepEqual(mock.fileBuf('storage' + img.path), PNG_1PX);
  assert.deepEqual(mock.fileBuf('storage' + thumb.path), JPEG);
  assert.deepEqual(mock.fileBuf('storage' + doc.path), PDF);
  assert.equal(mock.fileBuf('storage' + lost.path), null, 'un fișier nefolosit de nicio înregistrare nu ajunge în depozit');
  assert.ok(gh.staged.has(lost.path) && !gh.staged.has(img.path));

  // înlocuirea imaginii șterge fișierele vechi
  const img2 = gh.stage('image', { name: 'noua.png', bytes: PNG_1PX });
  await gh.request('PUT', `/api/admin/news/${rec.id}`, news({ image: fileObj(img2), attachment: fileObj(doc) }));
  assert.equal(mock.fileBuf('storage' + img.path), null);
  assert.equal(mock.fileBuf('storage' + thumb.path), null);
  assert.ok(mock.fileBuf('storage' + img2.path));
  assert.ok(mock.fileBuf('storage' + doc.path), 'documentul rămas în uz nu se șterge');

  // ștergerea înregistrării șterge tot ce îi aparține
  await gh.request('DELETE', `/api/admin/news/${rec.id}`);
  assert.equal(mock.fileBuf('storage' + img2.path), null);
  assert.equal(mock.fileBuf('storage' + doc.path), null);
  // fișierele de exemplu, încă folosite de galerie, rămân
  assert.ok(mock.fileBuf('storage/uploads/img/sample-1.jpg'));
});

test('ștergerea imaginilor de exemplu ca prima acțiune nu le mai copiază în „storage”', async t => {
  const { mock, gh } = await setup(t);
  const gallery = await gh.request('GET', '/api/admin/gallery');
  const samples = gallery.filter(g => g.sample);
  assert.ok(samples.length >= 3);
  await gh.request('POST', '/api/admin/batch', { ops: samples.map(g => ({ method: 'DELETE', url: `/api/admin/gallery/${g.id}` })) });
  assert.deepEqual(mock.files('storage/uploads/'), []);
  const left = JSON.parse(mock.fileText('storage/content/gallery.json'));
  assert.equal(left.length, gallery.length - samples.length);
});

/* ---------- operațiuni multiple ---------- */
test('mutarea mai multor fotografii se salvează într-un singur commit', async t => {
  const { mock, gh } = await setup(t);
  const gallery = await gh.request('GET', '/api/admin/gallery');
  const before = mock.commits().size;
  const ops = gallery.slice(0, 4).map(g => ({ method: 'PUT', url: `/api/admin/gallery/${g.id}`, body: { title: g.title, album: 'Album nou', date: g.date, alt: g.alt, file: g.file } }));
  const out = await gh.request('POST', '/api/admin/batch', { ops });
  assert.equal(out.length, 4);
  assert.ok(out.every(r => r.album === 'Album nou'));
  assert.equal(mock.commits().size, before + 1);
  const head = mock.commits().get(mock.head());
  assert.match(head.message, /^Modificări multiple \(4\)/);
  const saved = JSON.parse(mock.fileText('storage/content/gallery.json'));
  assert.equal(saved.filter(g => g.album === 'Album nou').length, 4);
});

test('o operațiune greșită dintr-un lot oprește tot lotul, fără modificări parțiale', async t => {
  const { mock, gh } = await setup(t);
  const gallery = await gh.request('GET', '/api/admin/gallery');
  const before = mock.commits().size;
  const ok = g => ({ method: 'PUT', url: `/api/admin/gallery/${g.id}`, body: { title: 'Nou', album: 'X', date: g.date, alt: g.alt, file: g.file } });
  await rejects(
    gh.request('POST', '/api/admin/batch', { ops: [ok(gallery[0]), { method: 'PUT', url: '/api/admin/gallery/inexistent', body: {} }] }),
    404
  );
  assert.equal(mock.commits().size, before);
  const again = await gh.request('GET', '/api/admin/gallery');
  assert.equal(again[0].title, gallery[0].title, 'prima operațiune nu a rămas aplicată');
  await rejects(gh.request('POST', '/api/admin/batch', { ops: [] }), 400);
});

test('cererile simultane se salvează împreună, iar cele greșite nu le strică pe cele bune', async t => {
  const { mock, gh } = await setup(t, { linger: 40 });
  const before = mock.commits().size;
  const results = await Promise.allSettled([
    gh.request('POST', '/api/admin/news', news({ title: 'Unu' })),
    gh.request('POST', '/api/admin/news', news({ title: '' })),
    gh.request('POST', '/api/admin/news', news({ title: 'Doi' })),
    gh.request('POST', '/api/admin/news', news({ title: 'Trei' }))
  ]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  assert.equal(results[1].reason.status, 400);
  assert.equal(mock.commits().size, before + 1, 'un singur commit pentru toate');
  const saved = JSON.parse(mock.fileText('storage/content/news.json'));
  assert.deepEqual(saved.slice(0, 3).map(x => x.title), ['Trei', 'Doi', 'Unu']);
  assert.equal(new Set(saved.map(x => x.id)).size, saved.length);
});

/* ---------- conflicte și erori ---------- */
test('dacă altcineva modifică depozitul în același timp, salvarea se reia și păstrează ambele modificări', async t => {
  const { mock, gh } = await setup(t);
  await gh.request('POST', '/api/admin/news', news({ title: 'Prima' })); // creează „storage”
  let once = true;
  mock.state.hooks.beforePatch = async () => {
    if (!once) return;
    once = false;
    const list = JSON.parse(mock.fileText('storage/content/news.json'));
    list.unshift({ id: 'extern000001', title: 'Adăugată de altcineva', date: '2026-10-06', published: true });
    mock.commitFiles({ 'storage/content/news.json': JSON.stringify(list, null, 2) + '\n', 'README.md': 'schimbat' }, 'Modificare de pe alt calculator');
  };
  const rec = await gh.request('POST', '/api/admin/news', news({ title: 'A mea' }));
  const saved = JSON.parse(mock.fileText('storage/content/news.json'));
  assert.deepEqual(saved.slice(0, 3).map(x => x.title), ['A mea', 'Adăugată de altcineva', 'Prima']);
  assert.equal(saved[0].id, rec.id);
  assert.equal(mock.fileText('README.md'), 'schimbat', 'restul depozitului nu este atins');
  // istoricul rămâne liniar: modificarea externă este strămoșul commit-ului nostru
  const head = mock.commits().get(mock.head());
  assert.match(mock.commits().get(head.parents[0]).message, /alt calculator/);
  assert.equal(once, false, 'modificarea externă a fost într-adevăr simulată');
});

test('după prea multe conflicte salvarea eșuează cu un mesaj clar', async t => {
  const { mock, gh } = await setup(t, { conflictRetries: 3 });
  mock.state.hooks.beforePatch = async () => {
    mock.commitFiles({ 'README.md': 'x' + Math.random() }, 'Altă modificare');
  };
  await rejects(gh.request('POST', '/api/admin/news', news()), 409, /în același timp de altcineva/);
});

test('răspuns pierdut după mutarea ramurii: modificarea nu se dublează', async t => {
  const { mock, gh } = await setup(t);
  mock.state.hooks.dropAfterPatch = true;
  const before = mock.commits().size;
  const rec = await gh.request('POST', '/api/admin/news', news({ title: 'Doar o dată' }));
  assert.equal(mock.commits().size, before + 1);
  const saved = JSON.parse(mock.fileText('storage/content/news.json'));
  assert.equal(saved.filter(x => x.title === 'Doar o dată').length, 1);
  assert.equal(saved[0].id, rec.id);
});

test('limitarea cererilor: se așteaptă și se reia; erorile trecătoare ale GitHub se reiau', async t => {
  const { mock, gh } = await setup(t);
  mock.failNext('POST', '/git/trees', 403, { body: { message: 'You have exceeded a secondary rate limit.' }, headers: { 'Retry-After': '1' } });
  const waits = [];
  gh.on('wait', w => waits.push(w.seconds));
  const t0 = Date.now();
  await gh.request('POST', '/api/admin/news', news({ title: 'După așteptare' }));
  assert.ok(Date.now() - t0 >= 900, 'a așteptat cât a cerut GitHub');
  assert.deepEqual(waits, [1]);

  mock.failNext('GET', '/git/ref/heads', 502, { times: 2 });
  const list = await gh.request('GET', '/api/admin/news');
  assert.equal(list[0].title, 'După așteptare');

  mock.failNext('GET', '/git/ref/heads', 403, { body: { message: 'API rate limit exceeded' }, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 4000) } });
  await rejects(gh.request('GET', '/api/admin/news'), 429, /limitat temporar/);
});

test('jeton expirat sau drept de scriere retras în timpul lucrului', async t => {
  const { mock, gh } = await setup(t);
  mock.failNext('GET', '/git/ref/heads', 401, { body: { message: 'Bad credentials' } });
  await rejects(gh.request('GET', '/api/admin/news'), 401, /nu este valabil/);

  mock.state.tokens['tok-ok'].write = false;
  const before = mock.commits().size;
  await rejects(gh.request('POST', '/api/admin/news', news()), 403, /Contents: Read and write/);
  assert.equal(mock.commits().size, before);
  mock.state.tokens['tok-ok'].write = true;
  await gh.request('POST', '/api/admin/news', news({ title: 'Din nou' })); // fără reconectare, după ce jetonul a fost reparat
});

test('fără rețea: mesaj clar, fără blocaje', async t => {
  const { mock, gh } = await setup(t);
  mock.failNext('GET', '/git/ref/heads', 0, { times: 5, drop: true });
  await rejects(gh.request('GET', '/api/admin/news'), 0, /Nu se poate contacta GitHub/);
});

test('conținut corupt în depozit: mesaj care spune ce fișier este greșit', async t => {
  const { mock, gh } = await setup(t);
  mock.commitFiles({ 'storage/content/settings.json': '{ nu este json' });
  await rejects(gh.request('GET', '/api/admin/settings'), 422, /storage\/content\/settings\.json/);
});

/* ---------- jurnal, publicare ---------- */
test('jurnalul de activitate se citește din istoricul commit-urilor', async t => {
  const { mock, gh } = await setup(t);
  const a = await gh.request('POST', '/api/admin/news', news({ title: 'Din jurnal' }));
  await gh.request('PUT', `/api/admin/news/${a.id}`, news({ title: 'Din jurnal 2' }));
  const gallery = await gh.request('GET', '/api/admin/gallery');
  await gh.request('POST', '/api/admin/batch', { ops: gallery.slice(0, 2).map(g => ({ method: 'DELETE', url: `/api/admin/gallery/${g.id}` })) });
  mock.commitFiles({ 'storage/content/legal.json': mock.fileText('storage/content/legal.json') + ' ' }, 'Modificare făcută cu GitHub Desktop');

  const log = await gh.request('GET', '/api/admin/audit');
  assert.deepEqual(log.slice(0, 5).map(e => [e.a, e.c]), [['commit', 'repo'], ['delete', 'gallery'], ['delete', 'gallery'], ['update', 'news'], ['create', 'news']]);
  assert.equal(log[0].d, 'Modificare făcută cu GitHub Desktop');
  assert.equal(log[1].u, 'editor');
  assert.equal(log[4].d, 'Din jurnal');
  assert.ok(log.every(e => e.t));

  assert.deepEqual(parseAuditCommit({ commit: { message: 'Mesaj scris de mână\n\n[dgaefe-admin] {rupt', author: { date: 'D', name: 'N' } } }), [{ t: 'D', u: 'N', a: 'commit', c: 'repo', d: 'Mesaj scris de mână' }]);
});

test('„contains” spune dacă versiunea publicată include modificarea mea; „republish” pornește din nou construirea', async t => {
  const { mock, gh } = await setup(t);
  await gh.request('POST', '/api/admin/news', news({ title: 'Prima' }));
  const mine = gh.head();
  assert.equal(await gh.contains(mine, mine), true);
  assert.equal(await gh.contains(null, mine), false);
  const external = mock.commitFiles({ 'README.md': 'x' });
  assert.equal(await gh.contains(external, mine), true, 'versiunea mai nouă include modificarea mea');
  const old = [...mock.commits().values()][0].sha;
  assert.equal(await gh.contains(old, mine), false, 'versiunea mai veche nu o include');

  const before = mock.commits().size;
  const sha = await gh.republish();
  assert.equal(mock.commits().size, before + 1);
  assert.equal(mock.head(), sha);
  assert.deepEqual(mock.commits().get(sha).parents, [external]);
  assert.equal(mock.commits().get(sha).tree, mock.commits().get(external).tree, 'același conținut, doar un commit nou');
});

test('citirile folosesc memoria timp de „ttl” și nu încarcă din nou fișierele neschimbate', async t => {
  const { mock, gh } = await setup(t, { ttl: 60000 });
  await gh.request('GET', '/api/admin/news');
  mock.resetLog();
  await Promise.all([gh.request('GET', '/api/admin/news'), gh.request('GET', '/api/admin/gallery'), gh.request('GET', '/api/admin/settings')]);
  assert.equal(mock.count(), 0, 'nicio cerere în intervalul de memorare');

  const { mock: m2, gh: g2 } = await setup(t, { ttl: 0 });
  await g2.request('GET', '/api/admin/news');
  m2.resetLog();
  await g2.request('GET', '/api/admin/news');
  assert.equal(m2.count(), 1, 'doar verificarea ramurii, dacă nu s-a schimbat nimic');
});

test('modificările făcute de altcineva apar la următoarea citire', async t => {
  const { mock, gh } = await setup(t);
  await gh.request('POST', '/api/admin/news', news({ title: 'A mea' }));
  const list = JSON.parse(mock.fileText('storage/content/news.json'));
  list.unshift({ id: 'extern000002', title: 'De pe alt calculator', date: '2026-10-07', published: true });
  mock.commitFiles({ 'storage/content/news.json': JSON.stringify(list, null, 2) + '\n' });
  const seen = await gh.request('GET', '/api/admin/news');
  assert.equal(seen[0].title, 'De pe alt calculator');
});

test('citirea unui fișier din depozit, înainte să fie publicat', async t => {
  const { gh } = await setup(t);
  const img = gh.stage('image', { name: 'p.png', bytes: PNG_1PX });
  assert.equal((await gh.readUpload(img.path)).bytes, PNG_1PX);
  await gh.request('POST', '/api/admin/gallery', { title: 'x', file: fileObj(img) });
  const blob = await gh.readUpload(img.path);
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), PNG_1PX);
  assert.equal(await gh.readUpload('/uploads/img/nu-exista.png'), null);
});

test('cererile din browser folosesc doar anteturile pe care GitHub le acceptă prin CORS', async t => {
  const { mock, gh } = await setup(t, { login: false });
  await gh.login('tok-ok');
  const img = gh.stage('image', { name: 'p.png', bytes: PNG_1PX });
  await gh.request('POST', '/api/admin/gallery', { title: 'x', file: fileObj(img) });
  await gh.request('POST', '/api/admin/news', news());
  await gh.audit();
  await gh.republish();
  await gh.readUpload('/uploads/img/nu-exista.png');
  // în browser, un antet personalizat în afara listei GitHub (de exemplu X-GitHub-Api-Version) oprește cererea la „preflight”
  const browserSetsItself = /^(host|connection|content-length|user-agent|accept-encoding|accept-language|origin|referer|sec-.+|priority|cache-control|pragma)$/;
  const allowedByGitHub = /^(accept|authorization|content-type|if-match|if-modified-since|if-none-match|if-unmodified-since|x-requested-with)$/;
  const seen = new Set();
  for (const r of mock.state.requests) for (const h of r.headers) if (!browserSetsItself.test(h)) seen.add(h);
  assert.ok(seen.size > 0);
  for (const h of seen) assert.match(h, allowedByGitHub, `antet nepermis de GitHub în cererile din browser: ${h}`);
});
