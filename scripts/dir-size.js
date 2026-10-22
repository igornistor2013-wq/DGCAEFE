'use strict';
const fs = require('fs');
const path = require('path');
// Dimensiunea totală (în octeți) a fișierelor dintr-un folder.
module.exports = function dirSize(dir) {
  let n = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    n += d.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
};
