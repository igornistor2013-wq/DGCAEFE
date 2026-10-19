'use strict';
// Adresa vizitatorului în spatele unui proxy (Render + Cloudflare) și marcarea cookie-ului „Secure”.
// Rulează cu: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-proxy-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'Test-Parola-123!';
process.env.BCRYPT_COST = '4';
process.env.TRUST_PROXY = 'render';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server');
const { trustProxySetting, CLOUDFLARE } = require('../lib/proxy');

test('TRUST_PROXY: valorile acceptate', () => {
  assert.equal(trustProxySetting(''), false);
  assert.equal(trustProxySetting(undefined), false);
  assert.equal(trustProxySetting('0'), false);
  assert.equal(trustProxySetting('false'), false);
  assert.equal(trustProxySetting('1'), 1);
  assert.equal(trustProxySetting('3'), 3);
  assert.equal(trustProxySetting('true'), 1);
  assert.equal(trustProxySetting('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
  for (const name of ['render', 'Render', 'cloudflare']) {
    const list = trustProxySetting(name);
    assert.ok(Array.isArray(list));
    for (const x of ['loopback', 'uniquelocal', ...CLOUDFLARE]) assert.ok(list.includes(x), x);
  }
  assert.ok(CLOUDFLARE.length >= 20);
});

test('în spatele Render adresa vizitatorului este cea reală, nu cea a proxy-urilor sau cea trimisă de client', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (body, headers) =>
      fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    // Lanțul de adrese, de la stânga la dreapta: o adresă falsă trimisă chiar de vizitator, vizitatorul real,
    // un server Cloudflare și un proxy intern Render. Conexiunea vine de la proxy-ul local (127.0.0.1).
    const chain = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 172.68.147.142, 10.1.2.3', 'x-forwarded-proto': 'https' };

    const bad = await post({ username: 'admin', password: 'parola-gresita' }, chain);
    assert.equal(bad.status, 401);

    const good = await post({ username: 'admin', password: process.env.ADMIN_PASSWORD }, chain);
    assert.equal(good.status, 200);
    const cookie = good.headers.get('set-cookie');
    assert.match(cookie, /; Secure/, 'cookie-ul trebuie să fie „Secure” când proxy-ul spune că vizitatorul folosește HTTPS');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);

    const log = await fetch(`${base}/api/admin/audit`, { headers: { cookie: cookie.split(';')[0] } });
    const entries = await log.json();
    const failed = entries.find(e => e.a === 'login-failed');
    assert.ok(failed, 'încercarea eșuată trebuie să apară în jurnal');
    assert.equal(failed.d, '203.0.113.9');

    // Fără proxy HTTPS, cookie-ul nu se marchează „Secure” (altfel nu ar funcționa pe http://localhost).
    const plain = await post({ username: 'admin', password: process.env.ADMIN_PASSWORD }, {});
    assert.equal(plain.status, 200);
    assert.ok(!/; Secure/.test(plain.headers.get('set-cookie')));
  } finally {
    server.close();
  }
});
