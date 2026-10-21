'use strict';
// Teste automate pentru server: autentificare, validare, încărcări, permisiuni.
// Rulează cu: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-test-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'Test-Parola-123!';
process.env.BCRYPT_COST = '4';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const zlib = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');
const { createApp } = require('../server');
const { oldContent, writeContent, seedContent } = require('../test-support/old-content');

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

let server;
let base;
let cookie = '';
let csrf = '';

async function call(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie && !opts.anonymous) headers.cookie = cookie;
  if (method !== 'GET' && csrf && !opts.noCsrf && !opts.anonymous) headers['x-csrf-token'] = csrf;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer());
  let data = buf;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    /* nu este JSON */
  }
  return { status: r.status, data, headers: r.headers };
}

const upload = (kind, buf, filename, type) => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), filename);
  return call('POST', `/api/admin/upload/${kind}`, fd);
};

async function login(password = process.env.ADMIN_PASSWORD) {
  const r = await call('POST', '/api/login', { username: 'admin', password }, { anonymous: true });
  if (r.status === 200) {
    cookie = r.headers.get('set-cookie').split(';')[0];
    csrf = r.data.csrf;
  }
  return r;
}

const onDisk = p => fs.existsSync(path.join(tmp, p));

// Cititor minimal de arhive ZIP (suficient pentru verificarea arhivelor generate de server).
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > -1, 'arhiva ZIP este incompletă');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < total; i++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const xlen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    off += 46 + nlen + xlen + clen;
  }
  return files;
}

test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('conținutul public inițial este complet', async () => {
  const r = await call('GET', '/api/public', undefined, { anonymous: true });
  assert.equal(r.status, 200);
  const d = r.data;
  assert.equal(d.programs.length, 5);
  assert.equal(d.legal.length, 16);
  assert.equal(d.investments.length, 19);
  assert.equal(d.events.length, 6);
  assert.equal(d.documents.length, 43);
  assert.equal(d.gallery.length, 6);
  assert.equal(d.news.length, 3);
  assert.match(d.settings.orgName, /Asistență Externă/);
  assert.ok(d.settings.duties.length >= 8 && d.settings.rights.length && d.settings.responsibilities.length, 'funcțiile, drepturile și responsabilitățile din Regulament');
  assert.ok(!('seedRev' in d.settings), 'evidența internă a conținutului de pornire nu este publică');
  assert.ok(onDisk(d.gallery[0].file.path), 'imaginile de exemplu au fost copiate');
  assert.ok(!JSON.stringify(d).includes('hash'), 'nu se scurg date private');
});

test('API-ul de administrare cere autentificare', async () => {
  for (const [m, u] of [['GET', '/api/admin/news'], ['POST', '/api/admin/news'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/backup'], ['POST', '/api/admin/upload/image']]) {
    const r = await call(m, u, m === 'POST' ? {} : undefined, { anonymous: true });
    assert.equal(r.status, 401, `${m} ${u}`);
  }
});

test('parola greșită este respinsă, fără cookie', async () => {
  const r = await login('parola-gresita-123');
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('autentificarea setează un cookie HttpOnly și SameSite=Strict', async () => {
  const r = await call('POST', '/api/login', { username: 'admin', password: process.env.ADMIN_PASSWORD }, { anonymous: true });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
  csrf = r.data.csrf;
  const s = await call('GET', '/api/session');
  assert.deepEqual([s.data.authenticated, s.data.user], [true, 'admin']);
  assert.ok(s.data.limits.imageMb > 0 && s.data.limits.docMb > 0 && s.data.minPassword >= 8, 'sesiunea trimite limitele pentru panoul de administrare');
  assert.equal(r.data.limits.docMb, s.data.limits.docMb);
});

test('modificările cer tokenul CSRF și origine corectă', async () => {
  const noToken = await call('POST', '/api/admin/news', { title: 'x', date: '2026-01-01' }, { noCsrf: true });
  assert.equal(noToken.status, 403);
  const foreign = await call('POST', '/api/admin/news', { title: 'x', date: '2026-01-01' }, { headers: { origin: 'https://site-strain.example' } });
  assert.equal(foreign.status, 403);
});

test('știri: ciorna nu apare public, publicarea o arată, ștergerea o elimină', async () => {
  const c = await call('POST', '/api/admin/news', { title: 'Știre de test', date: '2026-10-19', summary: 'Rezumat', body: 'Text.\n\n- unu\n- doi', tag: 'Test', published: false });
  assert.equal(c.status, 201);
  const id = c.data.id;
  let pub = (await call('GET', '/api/public', undefined, { anonymous: true })).data;
  assert.ok(!pub.news.some(n => n.id === id), 'ciorna nu este publică');

  const u = await call('PUT', `/api/admin/news/${id}`, { ...c.data, published: true });
  assert.equal(u.status, 200);
  pub = (await call('GET', '/api/public', undefined, { anonymous: true })).data;
  assert.equal(pub.news[0].id, id, 'cea mai nouă știre este prima');

  const d = await call('DELETE', `/api/admin/news/${id}`);
  assert.equal(d.status, 200);
  pub = (await call('GET', '/api/public', undefined, { anonymous: true })).data;
  assert.ok(!pub.news.some(n => n.id === id));
});

test('validarea respinge date greșite, cu mesaje în română', async () => {
  const cases = [
    [{ date: '2026-01-01' }, /„Titlu” este obligatoriu/],
    [{ title: 'x', date: '2026-02-30' }, /Data/],
    [{ title: 'x'.repeat(201), date: '2026-01-01' }, /prea lung/],
    [{ title: 'x', date: '2026-01-01', linkUrl: 'javascript:alert(1)' }, /adresă web/]
  ];
  for (const [body, re] of cases) {
    const r = await call('POST', '/api/admin/news', body);
    assert.equal(r.status, 400);
    assert.match(r.data.error, re);
  }
});

test('fotografii: încărcare, galerie, servire și curățarea fișierelor la ștergere', async () => {
  const full = await upload('image', PNG_1PX, 'poză ă.png', 'image/png');
  const thumb = await upload('image', PNG_1PX, 'mica.png', 'image/png');
  assert.equal(full.status, 201);
  assert.equal(full.data.name, 'poză ă.png', 'numele cu diacritice se păstrează');
  assert.match(full.data.path, /^\/uploads\/img\/[\w.-]+\.png$/);

  const g = await call('POST', '/api/admin/gallery', { title: 'Test', album: 'Albumul de test', date: '2026-10-19', file: { ...full.data, thumb: thumb.data.path } });
  assert.equal(g.status, 201);
  const served = await call('GET', full.data.path, undefined, { anonymous: true });
  assert.equal(served.status, 200);
  assert.ok(onDisk(full.data.path) && onDisk(thumb.data.path));

  const del = await call('DELETE', `/api/admin/gallery/${g.data.id}`);
  assert.equal(del.status, 200);
  assert.ok(!onDisk(full.data.path) && !onDisk(thumb.data.path), 'fișierele neutilizate au fost șterse');
});

test('încărcările periculoase sau false sunt respinse', async () => {
  const bad = [
    ['doc', Buffer.from('MZ binar'), 'virus.exe', 'application/octet-stream'],
    ['doc', Buffer.from('nu este pdf'), 'fals.pdf', 'application/pdf'],
    ['image', Buffer.from('nu este png'), 'fals.png', 'image/png'],
    ['image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'],
    ['image', PDF_MIN, 'pdf-ca-imagine.pdf', 'application/pdf'],
    ['doc', Buffer.alloc(0), 'gol.pdf', 'application/pdf']
  ];
  for (const [kind, buf, name, type] of bad) {
    const r = await upload(kind, buf, name, type);
    assert.equal(r.status, 400, name);
  }
  const unknown = await call('POST', '/api/admin/upload/altceva', new FormData());
  assert.equal(unknown.status, 404);
});

test('documente: cer fișier sau link; secțiunea „program” cere programul', async () => {
  const none = await call('POST', '/api/admin/documents', { title: 'Fără fișier', section: 'general' });
  assert.equal(none.status, 400);
  const noProg = await call('POST', '/api/admin/documents', { title: 'Doc', section: 'program', url: 'https://exemplu.md/a.pdf' });
  assert.equal(noProg.status, 400);
  const noYear = await call('POST', '/api/admin/documents', { title: 'Raport', section: 'rapoarte', url: 'https://exemplu.md/r.pdf' });
  assert.equal(noYear.status, 400);

  const up = await upload('doc', PDF_MIN, 'Raport 2026.pdf', 'application/pdf');
  assert.equal(up.status, 201);
  const ok = await call('POST', '/api/admin/documents', { title: 'Raport de test', section: 'rapoarte', year: 2026, file: up.data });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.year, 2026);
  const dl = await call('GET', up.data.path, undefined, { anonymous: true });
  assert.equal(dl.status, 200);
  assert.ok(dl.data.subarray(0, 5).equals(Buffer.from('%PDF-')));

  const withProg = await call('POST', '/api/admin/documents', { title: 'Doc URBACT', section: 'program', program: 'urbact', group: 'buletin', url: 'https://exemplu.md/b.pdf' });
  assert.equal(withProg.status, 201);
  await call('DELETE', `/api/admin/documents/${withProg.data.id}`);
  await call('DELETE', `/api/admin/documents/${ok.data.id}`);
  assert.ok(!onDisk(up.data.path), 'fișierul documentului șters a fost eliminat');
});

test('referințele către fișiere în afara folderului de încărcări sunt respinse', async () => {
  for (const p of ['/uploads/img/../../private/users.json', '/uploads/img/inexistent.png', '/etc/passwd', 'https://exemplu.md/x.png']) {
    const r = await call('POST', '/api/admin/gallery', { title: 'x', file: { path: p, name: 'x' } });
    assert.equal(r.status, 400, p);
  }
});

test('fișierele private nu pot fi descărcate', async () => {
  for (const p of ['/private/users.json', '/uploads/../private/users.json', '/uploads/%2e%2e/private/users.json', '/content/settings.json', '/storage/private/users.json']) {
    const r = await call('GET', p, undefined, { anonymous: true });
    assert.ok([400, 404].includes(r.status), `${p} → ${r.status}`);
    assert.ok(!String(r.data).includes('"hash"'));
  }
});

test('evenimente, acte și programe', async () => {
  const noDate = await call('POST', '/api/admin/events', { title: 'Eveniment', summary: 'Descriere' });
  assert.equal(noDate.status, 400);
  const badRange = await call('POST', '/api/admin/events', { title: 'E', summary: 'D', start: '2026-05-10', end: '2026-05-01' });
  assert.equal(badRange.status, 400);
  const ev = await call('POST', '/api/admin/events', { title: 'Eveniment de test', summary: 'Descriere', start: '2026-12-01', details: 'a\n\nb', links: [{ t: 'Înscriere', u: 'https://exemplu.md' }] });
  assert.equal(ev.status, 201);
  assert.deepEqual(ev.data.details, ['a', 'b']);
  await call('DELETE', `/api/admin/events/${ev.data.id}`);

  const act = await call('POST', '/api/admin/legal', { type: 'HG', nr: '999', year: 2026, title: 'Act de test', url: 'https://legis.md/x' });
  assert.equal(act.status, 201);
  assert.equal((await call('POST', '/api/admin/legal', { type: 'HG', nr: '1', title: 'Fără an' })).status, 400);
  await call('DELETE', `/api/admin/legal/${act.data.id}`);

  const prog = (await call('GET', '/api/admin/programs')).data.find(p => p.id === 'ie');
  const edited = await call('PUT', `/api/admin/programs/${prog.id}`, { ...prog, desc: 'Descriere nouă.', facts: [{ b: '36', t: 'de țări' }, { b: '', t: '' }] });
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.data.facts, [{ b: '36', t: 'de țări' }]);
  assert.equal(edited.data.order, prog.order, 'ordinea nu poate fi schimbată');
});

test('textele paginii: validare și salvare', async () => {
  const cur = (await call('GET', '/api/admin/settings')).data;
  const badMap = await call('PUT', '/api/admin/settings', { ...cur, contact: { ...cur.contact, mapEmbed: 'https://rau.example/harta' } });
  assert.equal(badMap.status, 400);
  const badMail = await call('PUT', '/api/admin/settings', { ...cur, contact: { ...cur.contact, emails: [{ addr: 'nu-e-email', note: '' }] } });
  assert.equal(badMail.status, 400);
  const ok = await call('PUT', '/api/admin/settings', { ...cur, heroLead: 'Text nou de prezentare.' });
  assert.equal(ok.status, 200);
  const pub = (await call('GET', '/api/public', undefined, { anonymous: true })).data;
  assert.equal(pub.settings.heroLead, 'Text nou de prezentare.');
  assert.ok(pub.lastUpdated >= pub.settings.updatedAt);
});

test('textele paginii: versiunea conținutului de pornire se păstrează, nu se publică și nu se schimbă din formular', async () => {
  const seedRev = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'content', 'settings.json'), 'utf8')).seedRev;
  assert.ok(seedRev >= 2);
  const cur = (await call('GET', '/api/admin/settings')).data;
  assert.equal(cur.seedRev, seedRev);
  const r = await call('PUT', '/api/admin/settings', { ...cur, seedRev: 99, heroLead: 'Alt text de prezentare.' });
  assert.equal(r.status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'content', 'settings.json'), 'utf8'));
  assert.equal(saved.seedRev, seedRev, 'formularul nu poate schimba versiunea');
  assert.equal(saved.heroLead, 'Alt text de prezentare.');
  const pub = (await call('GET', '/api/public', undefined, { anonymous: true })).data;
  assert.ok(!('seedRev' in pub.settings));
});

test('proiectele din Planul de creștere: numai date generale, validare, ascunderea și ștergerea', async () => {
  const cases = [
    [{}, /„Denumirea proiectului” este obligatoriu/],
    [{ name: 'P', ministry: 'x'.repeat(101) }, /Ministerul responsabil/],
    [{ name: 'P', currency: 'RON' }, /Moneda/],
    [{ name: 'P', amount: 5, amountQual: 'aproximativ' }, /Precizarea valorii/],
    [{ name: 'P', amount: -1 }, /Valoarea/],
    [{ name: 'P', results: Array.from({ length: 13 }, (_, i) => 'Rezultat ' + i) }, /Rezultate preconizate/],
    [{ name: 'P', results: ['x'.repeat(501)] }, /Rezultate preconizate/],
    [{ name: 'P', financing: 'x'.repeat(1501) }, /prea lung/],
    [{ name: 'P', links: [{ t: 'Text', u: 'javascript:alert(1)' }] }, /adres/i],
    [{ name: 'P', links: [{ t: 'Text', u: '' }] }, /legătură/i],
    [{ name: 'x'.repeat(301) }, /prea lung/]
  ];
  for (const [body, re] of cases) {
    const r = await call('POST', '/api/admin/investments', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 120));
    assert.match(r.data.error, re, JSON.stringify(body).slice(0, 120));
  }
  const publicCount = async () => (await call('GET', '/api/public', undefined, { anonymous: true })).data.investments;
  const before = (await call('GET', '/api/admin/investments')).data;
  assert.equal(before.length, 19);
  assert.equal((await publicCount()).length, 19);

  // ciornă: se salvează, dar nu apare public; câmpurile vechi (etapă, stare, progres, întârzieri, obiectiv economic) trimise de un client vechi sunt ignorate
  const c = await call('POST', '/api/admin/investments', {
    name: 'Proiect de test', ministry: 'MF', theme: 'social', implementer: 'Unitatea de implementare', financier: 'Banca Mondială (BM)', amount: '12,5', currency: 'MDL', amountQual: 'circa',
    financing: 'Împrumut de 10 mil. MDL.', period: '2027–2030', location: 'Chișinău', beneficiaries: 'Locuitorii municipiului', text: 'Descriere.',
    results: ['Primul rezultat', '', '  Al doilea rezultat  '], links: [{ t: 'Sursa', u: 'https://exemplu.md' }, { t: '', u: '' }], published: false,
    cluster: 'fezabilitate', status: 'intarziere', stage: 10, refStage: 12, totalStages: 40, progress: 25, delays: 'Etape în întârziere', next: 'Pasul următor.'
  });
  assert.equal(c.status, 201);
  assert.deepEqual([c.data.ministry, c.data.amount, c.data.currency, c.data.amountQual, c.data.published], ['MF', 12.5, 'MDL', 'circa', false]);
  assert.deepEqual(c.data.results, ['Primul rezultat', 'Al doilea rezultat'], 'rândurile goale se elimină');
  assert.deepEqual(c.data.links, [{ t: 'Sursa', u: 'https://exemplu.md' }], 'rândurile goale se elimină');
  for (const k of ['cluster', 'status', 'stage', 'refStage', 'totalStages', 'progress', 'delays', 'next', 'theme']) assert.ok(!(k in c.data), `„${k}” nu se mai păstrează`);
  assert.equal((await publicCount()).length, 19, 'proiectul ascuns nu este public');
  assert.equal((await call('GET', '/api/admin/investments')).data.length, 20, 'în administrare apare și ciorna');

  // publicare, cu un număr de ordine după celelalte
  const u = await call('PUT', `/api/admin/investments/${c.data.id}`, { ...c.data, published: true, order: 20 });
  assert.equal(u.status, 200);
  assert.equal(u.data.id, c.data.id);
  assert.equal(u.data.createdAt, c.data.createdAt);
  const pub = await publicCount();
  assert.equal(pub.length, 20);
  assert.equal(pub[pub.length - 1].id, c.data.id, 'se afișează după numărul de ordine');
  for (const p of pub) for (const k of ['cluster', 'status', 'stage', 'progress', 'delays', 'next', 'theme']) assert.ok(!(k in p), `pagina publică nu primește „${k}”`);

  // fără valoare, precizarea valorii nu are sens și se șterge
  const noAmount = await call('PUT', `/api/admin/investments/${c.data.id}`, { ...u.data, amount: '', amountQual: 'max.' });
  assert.equal(noAmount.status, 200);
  assert.deepEqual([noAmount.data.amount, noAmount.data.amountQual], [null, '']);

  // proiectele se grupează după minister: se poate schimba, iar câmpul se poate lăsa și necompletat
  const otherMin = await call('PUT', `/api/admin/investments/${c.data.id}`, { ...u.data, ministry: 'MIDR' });
  assert.equal(otherMin.status, 200);
  assert.equal(otherMin.data.ministry, 'MIDR');
  const noMin = await call('PUT', `/api/admin/investments/${c.data.id}`, { ...u.data, ministry: '' });
  assert.equal(noMin.status, 200);
  assert.equal(noMin.data.ministry, '');

  const missing = await call('PUT', '/api/admin/investments/inexistent', { name: 'x' });
  assert.equal(missing.status, 404);
  const del = await call('DELETE', `/api/admin/investments/${c.data.id}`);
  assert.equal(del.status, 200);
  assert.equal((await publicCount()).length, 19);
  assert.equal((await call('DELETE', `/api/admin/investments/${c.data.id}`)).status, 404);

  // un proiect din listă poate fi ascuns și readus fără să se piardă nimic
  const first = before.find(p => p.order === 1);
  const hide = await call('PUT', `/api/admin/investments/${first.id}`, { ...first, published: false });
  assert.equal(hide.status, 200);
  assert.ok(!(await publicCount()).some(p => p.id === first.id));
  const show = await call('PUT', `/api/admin/investments/${first.id}`, { ...first, published: true });
  assert.equal(show.status, 200);
  const { updatedAt, ...a } = show.data; // eslint-disable-line no-unused-vars
  const { updatedAt: u0, ...b } = first; // eslint-disable-line no-unused-vars
  assert.deepEqual(a, b);
});

test('jurnalul de activitate înregistrează acțiunile', async () => {
  await new Promise(r => setTimeout(r, 100));
  const r = await call('GET', '/api/admin/audit');
  assert.equal(r.status, 200);
  const actions = r.data.map(x => `${x.a}:${x.c}`);
  assert.ok(actions.includes('login:auth'));
  assert.ok(actions.includes('create:news'));
  assert.ok(actions.includes('delete:gallery'));
  assert.ok(actions.includes('create:investments') && actions.includes('delete:investments'));
});

test('copia de siguranță este o arhivă ZIP cu conținutul și fișierele', async () => {
  const r = await call('GET', '/api/admin/backup');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /zip/);
  assert.equal(r.data.subarray(0, 2).toString(), 'PK');
  const text = r.data.toString('latin1');
  assert.ok(text.includes('content/news.json') && text.includes('uploads/img/sample-1.jpg'));
  assert.ok(!text.includes('users.json'), 'utilizatorii nu intră în copie');
});

test('pagina de administrare și resursele ei sunt servite, cu antete de securitate', async () => {
  const page = await call('GET', '/admin/', undefined, { anonymous: true });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /html/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp), 'fără scripturi inline sau eval');
  const html = page.data.toString('utf8');
  assert.ok(!/\son\w+=/i.test(html), 'fără atribute de evenimente inline (onclick etc.)');
  for (const f of ['css/admin.css', 'js/admin-core.js', 'js/admin-forms.js', 'js/admin-pages.js', 'js/admin-system.js', 'js/admin.js', 'js/common.js']) {
    assert.equal((await call('GET', `/assets/${f}`, undefined, { anonymous: true })).status, 200, f);
  }
  // fără slash final: redirecționare către /admin/
  const r = await call('GET', '/admin', undefined, { anonymous: true });
  assert.ok([301, 302, 308].includes(r.status), `redirecționare, nu ${r.status}`);
});

test('exportul static: pagina completă, fără ciorne, fără administrare, cu căi relative', async () => {
  const draft = await call('POST', '/api/admin/news', { title: 'Ciornă secretă', date: '2026-10-19', published: false });
  assert.equal(draft.status, 201);
  const img = await upload('image', PNG_1PX, 'poza.png', 'image/png');
  assert.equal(img.status, 201);
  const pub = await call('POST', '/api/admin/news', { title: 'Știre publică cu imagine', date: '2026-10-19', body: 'Vezi [documentul](/uploads/docs/x.pdf).', image: img.data });
  assert.equal(pub.status, 201);
  const pdf = await upload('doc', PDF_MIN, 'Raport export.pdf', 'application/pdf');
  assert.equal(pdf.status, 201);
  const doc = await call('POST', '/api/admin/documents', { title: 'Document încărcat pentru export', section: 'rapoarte', year: 2026, file: pdf.data });
  assert.equal(doc.status, 201);
  const hiddenInv = await call('POST', '/api/admin/investments', { name: 'Proiect ascuns la export', published: false });
  assert.equal(hiddenInv.status, 201);

  const r = await call('GET', '/api/admin/export-static');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /zip/);
  assert.match(r.headers.get('content-disposition'), /dgaefe-site-static-\d{4}-\d{2}-\d{2}\.zip/);
  const files = readZip(r.data);
  const names = Object.keys(files);

  for (const need of ['index.html', '.nojekyll', 'README.txt', 'assets/css/site.css', 'assets/js/site.js', 'assets/js/common.js', 'assets/img/gov-logo.svg', 'assets/fonts/onest-latin.woff2']) {
    assert.ok(names.includes(need), `lipsește ${need}`);
  }
  assert.ok(!names.some(n => /admin/.test(n)), 'panoul de administrare nu intră în versiunea statică');
  assert.ok(!names.some(n => /users\.json|session\.key|audit\.log|private/.test(n)), 'date private în arhivă');

  const html = files['index.html'].toString('utf8');
  assert.match(html, /<html data-static="true" lang="ro">/);
  const m = html.match(/<script type="application\/json" id="seed-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'datele sunt încorporate în pagină');
  assert.ok(!m[1].includes('<'), 'caracterul < este scris ca secvență de evadare');
  const data = JSON.parse(m[1]);
  assert.ok(!data.news.some(n => n.title === 'Ciornă secretă'), 'ciornele nu se exportă');
  const news = data.news.find(n => n.title === 'Știre publică cu imagine');
  assert.ok(news, 'știrea publicată este exportată');
  assert.ok(news.image.path.startsWith('uploads/img/'), `cale relativă: ${news.image.path}`);
  assert.ok(names.includes(news.image.path), 'imaginea știrii este în arhivă');
  assert.ok(news.body.includes('](uploads/docs/x.pdf)'), 'legăturile din text devin relative');
  assert.ok(!JSON.stringify(data).includes('"/uploads/'), 'nicio cale absolută către /uploads/');
  assert.equal(data.programs.length, 5);
  assert.equal(data.investments.length, 19, 'proiectele din Planul de creștere se exportă');
  assert.ok(!data.investments.some(p => p.name === 'Proiect ascuns la export'), 'proiectele ascunse nu se exportă');
  assert.ok(!('seedRev' in data.settings), 'evidența internă nu se exportă');
  const exportedDoc = data.documents.find(d => d.title === 'Document încărcat pentru export');
  assert.ok(exportedDoc, 'documentul încărcat este exportat');
  assert.ok(JSON.stringify(exportedDoc).includes('uploads/docs/'), 'documentul trimite către uploads/docs/ (relativ)');
  const docPath = (JSON.stringify(exportedDoc).match(/uploads\/docs\/[\w.-]+/) || [])[0];
  assert.ok(docPath && names.includes(docPath), `fișierul documentului este în arhivă (${docPath})`);
  assert.ok(files[docPath].subarray(0, 5).equals(Buffer.from('%PDF-')), 'fișierul din arhivă este neschimbat');
  // fiecare fișier referit există în arhivă
  for (const ref of new Set(JSON.stringify(data).match(/uploads\/(?:img|docs)\/[\w.-]+/g) || [])) {
    if (ref.includes('x.pdf')) continue; // legătură de probă, fără fișier real
    assert.ok(names.includes(ref), `lipsește fișierul referit ${ref}`);
  }
  await call('DELETE', `/api/admin/news/${draft.data.id}`);
  await call('DELETE', `/api/admin/news/${pub.data.id}`);
  await call('DELETE', `/api/admin/documents/${doc.data.id}`);
  await call('DELETE', `/api/admin/investments/${hiddenInv.data.id}`);
});

test('scriptul build-static construiește versiunea statică din folderul de date și din seed', async () => {
  const script = path.join(__dirname, '..', 'scripts', 'build-static.js');
  for (const [label, dataDir] of [['datele aplicației', tmp], ['conținutul de pornire', path.join(__dirname, '..', 'seed')]]) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-out-'));
    try {
      const msg = execFileSync(process.execPath, [script, '--data', dataDir, '--out', path.join(out, 'dist')], { encoding: 'utf8', env: { ...process.env, DATA_DIR: '' } });
      assert.match(msg, /Versiunea statică a fost creată/, label);
      for (const f of ['index.html', '.nojekyll', 'assets/js/site.js', 'uploads/img/sample-1.jpg']) {
        assert.ok(fs.existsSync(path.join(out, 'dist', f)), `${label}: lipsește ${f}`);
      }
      assert.ok(!fs.existsSync(path.join(out, 'dist', 'assets', 'js', 'admin.js')), `${label}: fără administrare`);
      assert.ok(fs.readFileSync(path.join(out, 'dist', 'index.html'), 'utf8').includes('id="seed-data"'));
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }
  const none = spawnSync(process.execPath, [script, '--data', path.join(os.tmpdir(), 'nu-exista-dgaefe')], { encoding: 'utf8', env: { ...process.env, DATA_DIR: '' } });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /Nu am găsit date de publicat/);
});

test('build-static nu șterge foldere străine și nu scrie peste proiect sau date', async () => {
  const script = path.join(__dirname, '..', 'scripts', 'build-static.js');
  const seed = path.join(__dirname, '..', 'seed');
  const run = out => spawnSync(process.execPath, [script, '--data', seed, '--out', out], { encoding: 'utf8', env: { ...process.env, DATA_DIR: '' } });
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-foreign-'));
  try {
    fs.writeFileSync(path.join(foreign, 'important.txt'), 'nu se șterge');
    const r1 = run(foreign);
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /nu este gol/);
    assert.equal(fs.readFileSync(path.join(foreign, 'important.txt'), 'utf8'), 'nu se șterge');

    const root = path.join(__dirname, '..');
    for (const bad of [root, path.join(root, 'seed'), path.dirname(root), path.parse(root).root]) {
      const r = run(bad);
      assert.equal(r.status, 1, `ar trebui refuzat: ${bad}`);
      assert.ok(fs.existsSync(path.join(root, 'server.js')), 'proiectul trebuie să rămână intact');
    }

    // un folder gol sau o versiune statică anterioară pot fi rescrise
    const ok = path.join(foreign, 'site');
    assert.equal(run(ok).status, 0);
    fs.writeFileSync(path.join(ok, 'vechi.txt'), 'rămas dintr-o versiune anterioară');
    assert.equal(run(ok).status, 0);
    assert.ok(!fs.existsSync(path.join(ok, 'vechi.txt')), 'versiunea anterioară este înlocuită complet');
  } finally {
    fs.rmSync(foreign, { recursive: true, force: true });
  }
});

const ROOT = path.join(__dirname, '..');
const snapshot = dir => Object.fromEntries(fs.readdirSync(path.join(dir, 'content')).sort().map(n => [n, fs.readFileSync(path.join(dir, 'content', n), 'utf8')]));

test('date salvate de versiunea anterioară: la pornire se adaugă conținutul nou, fără să se piardă modificările, o singură dată', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-old-'));
  const code = `const s = require('./lib/store'); s.init(); console.log(JSON.stringify({ legal: s.list('legal').length, investments: s.list('investments').length, news: s.list('news').length, documents: s.list('documents').length, settings: s.getSettings() }));`;
  const start = () => JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir, ENV_FILE: path.join(dir, 'fara.env') } }));
  try {
    const mine = { heroLead: 'Textul meu de prezentare.', footerNote: 'Nota mea din subsol.' };
    const old = oldContent(mine);
    old.settings.contact.phones = ['022 111 222'];
    writeContent(dir, old);
    const newsBefore = fs.readFileSync(path.join(dir, 'content', 'news.json'), 'utf8');
    assert.ok(!fs.existsSync(path.join(dir, 'content', 'investments.json')));

    const r = start();
    assert.deepEqual([r.legal, r.investments, r.news, r.documents], [16, 19, 3, 43]);
    assert.equal(r.settings.heroLead, mine.heroLead);
    assert.equal(r.settings.footerNote, mine.footerNote);
    assert.deepEqual(r.settings.contact.phones, ['022 111 222']);
    assert.match(r.settings.orgName, /Coordonare/, 'denumirea implicită veche a primit denumirea oficială');
    assert.equal(r.settings.seedRev, seedContent().settings.seedRev);
    assert.ok(r.settings.duties.length >= 8, 'funcțiile din Regulament');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'content', 'investments.json'), 'utf8')).length, 19, 'noile proiecte au fost salvate');
    assert.equal(fs.readFileSync(path.join(dir, 'content', 'news.json'), 'utf8'), newsBefore, 'știrile nu au fost rescrise');
    assert.ok(fs.existsSync(path.join(dir, 'uploads', 'img', 'sample-1.jpg')), 'imaginile din galerie există');

    // a doua pornire nu mai schimbă nimic, nici măcar data
    const files = snapshot(dir);
    const again = start();
    assert.deepEqual(snapshot(dir), files);
    assert.deepEqual(again.settings, r.settings);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('versiunea statică din date salvate de versiunea anterioară conține proiectele și textele noi, iar folderul de date rămâne neatins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-old-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-out-'));
  try {
    writeContent(dir, oldContent({ heroLead: 'Textul meu de prezentare.' }));
    const before = snapshot(dir);
    const script = path.join(ROOT, 'scripts', 'build-static.js');
    const msg = execFileSync(process.execPath, [script, '--data', dir, '--out', path.join(out, 'dist')], { encoding: 'utf8', env: { ...process.env, DATA_DIR: '' } });
    assert.match(msg, /Versiunea statică a fost creată/);
    const html = fs.readFileSync(path.join(out, 'dist', 'index.html'), 'utf8');
    const data = JSON.parse(html.match(/<script type="application\/json" id="seed-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.investments.length, 19);
    assert.equal(data.legal.length, 16);
    assert.equal(data.settings.heroLead, 'Textul meu de prezentare.');
    assert.match(data.settings.orgName, /Coordonare/);
    assert.ok(!('seedRev' in data.settings));
    assert.equal(data.news.length, 3);
    assert.deepEqual(snapshot(dir), before, 'construirea nu scrie în folderul de date');
    assert.ok(!fs.existsSync(path.join(dir, 'content', 'investments.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('scriptul set-password creează și resetează conturi, cu aceleași reguli ca panoul', async () => {
  const bcrypt = require('bcryptjs');
  const script = path.join(__dirname, '..', 'scripts', 'set-password.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-pw-'));
  const run = (pw, user) => spawnSync(process.execPath, user ? [script, user] : [script], { encoding: 'utf8', env: { ...process.env, DATA_DIR: dir, ADMIN_NEW_PASSWORD: pw, BCRYPT_COST: '4' }, input: '' });
  try {
    const short = run('scurta');
    assert.equal(short.status, 1);
    assert.match(short.stderr, /cel puțin/);
    assert.ok(!fs.existsSync(path.join(dir, 'private', 'users.json')), 'o parolă respinsă nu creează cont');

    const first = run('Prima-Parola-Lunga-1', 'maria');
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /„maria”/);
    const file = path.join(dir, 'private', 'users.json');
    let users = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(users.length, 1);
    assert.ok(bcrypt.compareSync('Prima-Parola-Lunga-1', users[0].hash));
    assert.ok(!JSON.stringify(users).includes('Prima-Parola'), 'parola nu se stochează în clar');
    const v1 = users[0].ver;

    assert.equal(run('A-Doua-Parola-Lunga-2', 'maria').status, 0);
    users = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(users.length, 1, 'același utilizator nu se dublează');
    assert.ok(bcrypt.compareSync('A-Doua-Parola-Lunga-2', users[0].hash));
    assert.ok(users[0].ver > v1, 'sesiunile vechi sunt invalidate');
    assert.equal(fs.statSync(file).mode & 0o077, 0, 'fișierul cu parole nu este citibil de alți utilizatori');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fișierul .env este citit, iar variabilele din sistem au prioritate', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-env-'));
  const file = path.join(dir, 'test.env');
  fs.writeFileSync(file, '# comentariu\nPORT=4567\nADMIN_USER="maria"\nSESSION_HOURS=3 # ore\nMAX_DOC_MB=7\n');
  const show = env => JSON.parse(execFileSync(process.execPath, ['-e', "const c=require('./lib/config');console.log(JSON.stringify([c.PORT,c.ADMIN_USER,c.SESSION_HOURS,c.MAX_DOC_MB]))"], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { PATH: process.env.PATH, ENV_FILE: file, ...env }
  }));
  try {
    assert.deepEqual(show({}), [4567, 'maria', 3, 7]);
    assert.deepEqual(show({ PORT: '9999' }), [9999, 'maria', 3, 7], 'variabila din sistem are prioritate');
    const missing = JSON.parse(execFileSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./lib/config').PORT))"], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { PATH: process.env.PATH, ENV_FILE: path.join(dir, 'nu-exista.env') }
    }));
    assert.equal(missing, 3000, 'un fișier .env lipsă nu este o eroare');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schimbarea parolei invalidează sesiunile vechi', async () => {
  const wrong = await call('POST', '/api/admin/password', { current: 'gresita-gresita', next: 'Parola-Noua-456!' });
  assert.equal(wrong.status, 400);
  const weak = await call('POST', '/api/admin/password', { current: process.env.ADMIN_PASSWORD, next: 'scurta' });
  assert.equal(weak.status, 400);

  const oldCookie = cookie;
  const ok = await call('POST', '/api/admin/password', { current: process.env.ADMIN_PASSWORD, next: 'Parola-Noua-456!' });
  assert.equal(ok.status, 200);
  const fresh = ok.headers.get('set-cookie').split(';')[0];

  cookie = oldCookie;
  assert.equal((await call('GET', '/api/admin/news')).status, 401, 'sesiunea veche nu mai este valabilă');
  cookie = fresh;
  csrf = ok.data.csrf;
  assert.equal((await call('GET', '/api/admin/news')).status, 200, 'sesiunea nouă funcționează');

  assert.equal((await login(process.env.ADMIN_PASSWORD)).status, 401);
  assert.equal((await login('Parola-Noua-456!')).status, 200);
});

test('deconectarea șterge sesiunea', async () => {
  const out = await call('POST', '/api/logout', {});
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  cookie = '';
  assert.equal((await call('GET', '/api/admin/news')).status, 401);
});

test('încercările repetate de autentificare sunt limitate', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await login(`gresita-${i}-gresita`);
  assert.equal(last.status, 429);
});

test('căile necunoscute întorc 404', async () => {
  assert.equal((await call('GET', '/nu-exista', undefined, { anonymous: true })).status, 404);
  assert.equal((await call('GET', '/api/nu-exista', undefined, { anonymous: true })).status, 404);
  assert.equal((await call('GET', '/healthz', undefined, { anonymous: true })).status, 200);
});
