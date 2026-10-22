#!/usr/bin/env node
'use strict';
// Construiește versiunea statică a site-ului în folderul dist/ (pentru GitHub Pages).
//   node scripts/build-static.js [--data <folder>] [--out <folder>]
//                                [--site-url https://utilizator.github.io/depozit]
//                                [--github-repo proprietar/depozit [--github-branch main] [--github-api <adresa>] [--commit <sha>]]
// Implicit: datele din storage/ (dacă există), altfel conținutul de pornire din seed/. Conținutul nou din seed/ (colecții noi, texte
// actualizate) se adaugă peste storage/ fără să șteargă modificările făcute din administrare (vezi web/assets/js/content-overlay.js).
// Cu --github-repo, versiunea construită include și pagina de administrare (admin/), care salvează direct în depozitul GitHub.
// Cu --site-url (adresa publică a paginii; poate fi dată și prin variabila SITE_URL), versiunea construită primește și pagina 404.html,
// adresa canonică și politica de securitate a conținutului. Fără adresă, pagina se poate deschide direct din calculator.
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const staticSite = require('../lib/static-site');
const { optimize } = require('../lib/optimize');

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
const repo = arg('github-repo');
const github = repo ? { repo, branch: arg('github-branch') || 'main', api: arg('github-api') } : null;
(async () => {
try {
  const list = staticSite.entries(staticSite.diskReader(dataDir, cfg.SEED_DIR), dataDir, { github, siteUrl: arg('site-url') || process.env.SITE_URL, commit: arg('commit') || process.env.GITHUB_SHA, seedDir: cfg.SEED_DIR });
  staticSite.writeTo(out, list, [cfg.ROOT, dataDir]);
  const opt = process.argv.includes('--no-optimize') ? null : await optimize(out);
  const bytes = require('./dir-size')(out);
  console.log(`Versiunea statică a fost creată în ${out}`);
  console.log(`  date din: ${dataDir}`);
  if (github) console.log(`  administrare pe GitHub: ${github.repo} (ramura ${github.branch}) la adresa admin/`);
  if (list.some(e => e.name === '404.html')) console.log('  pagina 404.html, adresa canonică și politica de securitate: da');
  console.log(`  ${list.length} fișiere, ${(bytes / 1048576).toFixed(1)} MB`);
  if (opt && opt.tools.length) console.log(`  comprimat (${opt.tools.join(', ')}): ${opt.js} scripturi, ${opt.css} stiluri, ${opt.img} fotografii, ${(opt.saved / 1024).toFixed(0)} KB economisiți`);
  else if (!opt) console.log('  fără comprimare (--no-optimize)');
  else console.log('  comprimare sărită: pachetele esbuild și sharp nu sunt instalate');
} catch (e) {
  console.error(`Eroare: ${e.message}`);
  process.exit(1);
}
})();
