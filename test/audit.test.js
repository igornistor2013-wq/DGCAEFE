'use strict';
// Jurnalul de activitate: se mută într-un fișier nou când devine prea mare, iar panoul vede mereu ultimele acțiuni. Rulează cu: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgaefe-audit-'));
process.env.DATA_DIR = tmp;
process.env.ENV_FILE = path.join(tmp, 'nu-exista.env');
fs.mkdirSync(path.join(tmp, 'private'));
const audit = require('../lib/audit');

test('jurnalul de activitate nu crește la nesfârșit: peste 5 MB se mută, păstrând cel mult 4 fișiere vechi', () => {
  const detail = 'd'.repeat(2000);
  const per = Buffer.byteLength(JSON.stringify({ t: new Date().toISOString(), u: 'admin', a: 'update', c: 'news', d: '000000-' + detail }) + '\n');
  const lines = Math.ceil((audit.MAX_BYTES * 5.5) / per);
  for (let i = 0; i < lines; i++) audit.log('admin', 'update', 'news', String(i).padStart(6, '0') + '-' + detail);
  const files = fs.readdirSync(path.join(tmp, 'private')).sort();
  assert.deepEqual(files, ['audit.log', 'audit.log.1', 'audit.log.2', 'audit.log.3', 'audit.log.4']);
  for (const f of files) assert.ok(fs.statSync(path.join(tmp, 'private', f)).size <= audit.MAX_BYTES + per, f);
  // ultimele 100 de acțiuni, cele mai noi primele, chiar dacă o parte sunt deja în fișierul mutat
  const r = audit.recent(100);
  assert.equal(r.length, 100);
  assert.equal(r[0].d.slice(0, 6), String(lines - 1).padStart(6, '0'), 'cea mai nouă acțiune este prima');
  const nums = r.map(x => Number(x.d.slice(0, x.d.indexOf('-'))));
  assert.deepEqual(nums, nums.slice().sort((a, b) => b - a), 'în ordine, fără goluri');
  assert.equal(nums[0] - nums[99], 99);
});
