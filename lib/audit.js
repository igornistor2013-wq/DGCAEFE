'use strict';
// Jurnal de activitate: o linie JSON pentru fiecare acțiune a administratorilor.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const file = () => path.join(cfg.DATA_DIR, 'private', 'audit.log');
// Când jurnalul trece de 5 MB (zeci de mii de acțiuni), se mută în audit.log.1 (cel mai vechi, audit.log.4, se șterge),
// ca fișierul să nu crească la nesfârșit. Panoul arată ultimele 100 de acțiuni, care sunt mereu în fișierul curent sau în cel mutat recent.
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 4;

function rotate() {
  try {
    if (fs.statSync(file()).size < MAX_BYTES) return;
  } catch {
    return;
  }
  for (let i = KEEP - 1; i >= 1; i--) {
    try {
      fs.renameSync(`${file()}.${i}`, `${file()}.${i + 1}`);
    } catch {
      /* fișierul nu există încă */
    }
  }
  fs.renameSync(file(), `${file()}.1`);
}

function log(user, action, target, detail) {
  const line = JSON.stringify({ t: new Date().toISOString(), u: user, a: action, c: target, d: detail || '' }) + '\n';
  try {
    rotate();
    fs.appendFileSync(file(), line);
  } catch (err) {
    console.error('Jurnal de activitate:', err.message);
  }
}

// Ultimele `n` linii dintr-un fișier de jurnal (se citesc doar ultimii 256 KB), cele mai noi primele.
function tail(f, n) {
  const out = [];
  try {
    const stat = fs.statSync(f);
    const size = Math.min(stat.size, 256 * 1024);
    const fd = fs.openSync(f, 'r');
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, stat.size - size);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
      try {
        out.push(JSON.parse(lines[i]));
      } catch {
        /* prima linie poate fi tăiată */
      }
    }
  } catch {
    /* fișierul nu există încă */
  }
  return out;
}

// Ultimele acțiuni; imediat după mutarea jurnalului, restul se iau din fișierul mutat (audit.log.1).
function recent(n = 100) {
  const out = tail(file(), n);
  return out.length < n ? out.concat(tail(`${file()}.1`, n - out.length)) : out;
}

module.exports = { log, recent, MAX_BYTES };
