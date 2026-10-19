'use strict';
// Jurnal de activitate: o linie JSON pentru fiecare acțiune a administratorilor.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const file = () => path.join(cfg.DATA_DIR, 'private', 'audit.log');

function log(user, action, target, detail) {
  const line = JSON.stringify({ t: new Date().toISOString(), u: user, a: action, c: target, d: detail || '' }) + '\n';
  fs.appendFile(file(), line, err => {
    if (err) console.error('Jurnal de activitate:', err.message);
  });
}

function recent(n = 100) {
  try {
    const stat = fs.statSync(file());
    const size = Math.min(stat.size, 256 * 1024);
    const fd = fs.openSync(file(), 'r');
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
      try {
        out.push(JSON.parse(lines[i]));
      } catch {
        /* prima linie poate fi tăiată */
      }
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = { log, recent };
