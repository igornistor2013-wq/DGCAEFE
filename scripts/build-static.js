#!/usr/bin/env node
'use strict';
// Construiește versiunea statică a site-ului în folderul dist/ (pentru GitHub Pages).
//   node scripts/build-static.js [--data <folder>] [--out <folder>]
// Implicit: datele din storage/ (dacă există), altfel conținutul de pornire din seed/.
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const staticSite = require('../lib/static-site');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const hasContent = dir => fs.existsSync(path.join(dir, 'content', 'settings.json'));
const explicit = arg('data') || process.env.DATA_DIR;
const candidates = explicit ? [path.resolve(explicit)] : [path.join(cfg.ROOT, 'storage'), cfg.SEED_DIR];
const dataDir = candidates.find(hasContent);
if (!dataDir) {
  console.error(`Nu am găsit date de publicat. Căutat în: ${candidates.join(', ')}`);
  process.exit(1);
}

const out = path.resolve(arg('out') || path.join(cfg.ROOT, 'dist'));
try {
  const list = staticSite.entries(staticSite.diskReader(dataDir), dataDir);
  staticSite.writeTo(out, list, [cfg.ROOT, dataDir]);
  const bytes = list.reduce((n, e) => n + (e.file ? fs.statSync(e.file).size : Buffer.byteLength(e.text)), 0);
  console.log(`Versiunea statică a fost creată în ${out}`);
  console.log(`  date din: ${dataDir}`);
  console.log(`  ${list.length} fișiere, ${(bytes / 1048576).toFixed(1)} MB`);
} catch (e) {
  console.error(`Eroare: ${e.message}`);
  process.exit(1);
}
