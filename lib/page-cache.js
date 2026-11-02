'use strict';
// Paginile publice gata construite, păstrate în memorie: datele (/api/public), prima pagină și pagina „404”, pentru fiecare limbă.
// Fără ele, fiecare vizită ar reconstrui toate datele și pagina (câteva milisecunde de procesor pentru fiecare cerere), iar
// un val de vizitatori ar ocupa tot procesorul serverului. Se refac singure la prima cerere după o salvare din panou
// (store.version() se schimbă) sau după modificarea unui șablon din web/ (se schimbă data fișierului).
const fs = require('fs');
const store = require('./store');

let ver = -1;
const memo = new Map();

// `files`: șabloanele de care depinde rezultatul; o modificare a lor (în timpul dezvoltării) reface pagina fără repornire.
function get(key, files, make) {
  if (store.version() !== ver) {
    memo.clear();
    ver = store.version();
  }
  const stamp = files.map(f => {
    try {
      return fs.statSync(f).mtimeMs;
    } catch {
      return 0;
    }
  }).join(',');
  const hit = memo.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = make();
  memo.set(key, { stamp, value });
  return value;
}

module.exports = { get };
