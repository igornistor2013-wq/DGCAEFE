'use strict';
// Versiunea statică (doar citire) a site-ului: un index.html cu datele încorporate, resursele și fișierele încărcate.
// Funcționează pe GitHub Pages sau pe orice găzduire de fișiere, fără server.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { buildPublic } = require('./public');

const UPLOAD_RE = /\/uploads\/(?:img|docs)\/[\w.-]+/g;
const ADMIN_ASSET = /^(?:js\/admin[\w-]*\.js|css\/admin\.css)$/;

// În versiunea statică fișierele sunt referite relativ, ca să funcționeze și într-un subdosar (ex.: user.github.io/depozit/).
function relativize(v) {
  if (typeof v === 'string') return v.replace(/(^|[\s(\[])\/uploads\/(img|docs)\//g, '$1uploads/$2/');
  if (Array.isArray(v)) return v.map(relativize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relativize(x)]));
  return v;
}

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile()) out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') });
  }
  return out;
}

function indexHtml(data) {
  let html = fs.readFileSync(path.join(cfg.WEB_DIR, 'index.html'), 'utf8');
  // Caracterele < și separatoarele de linie U+2028/U+2029 sunt scrise ca secvențe de evadare, ca să nu poată închide scriptul sau rupe JSON-ul.
  const json = JSON.stringify(relativize(data))
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  if (!/<html\s/.test(html) || !html.includes('</body>')) throw new Error('web/index.html are o structură neașteptată.');
  html = html.replace(/<html\s/, '<html data-static="true" ');
  return html.replace('</body>', () => `<script type="application/json" id="seed-data">${json}</script>\n</body>`);
}

const README = `Versiunea statică a site-ului (doar citire)
===========================================

Acest folder conține un site complet, fără server: deschideți index.html în browser
sau încărcați tot conținutul folderului pe GitHub Pages / orice găzduire de fișiere.

GitHub Pages: încărcați conținutul în depozit (rădăcina sau folderul /docs), apoi
Settings > Pages > Source. Fișierul .nojekyll trebuie păstrat.

Atenție: în această versiune nu există autentificare și administrare. Conținutul se
modifică în aplicația cu server (npm start, adresa /admin/), apoi se exportă din nou.
`;

// Lista fișierelor din versiunea statică: { name, text } sau { name, file }.
function entries(get, dataDir) {
  const data = buildPublic(get);
  const list = [
    { name: 'index.html', text: indexHtml(data) },
    { name: '.nojekyll', text: '' },
    { name: 'README.txt', text: README },
    ...walk(path.join(cfg.WEB_DIR, 'assets'))
      .filter(f => !ADMIN_ASSET.test(f.rel)) // panoul de administrare nu face parte din versiunea statică
      .map(f => ({ name: `assets/${f.rel}`, file: f.abs }))
  ];
  const root = path.join(dataDir, 'uploads') + path.sep;
  for (const p of new Set(JSON.stringify(data).match(UPLOAD_RE) || [])) {
    const abs = path.join(dataDir, p);
    if (abs.startsWith(root) && fs.existsSync(abs)) list.push({ name: p.slice(1), file: abs });
  }
  return list;
}

// Citește colecțiile direct de pe disc (pentru scriptul din linia de comandă).
function diskReader(dir) {
  return name => {
    const f = path.join(dir, 'content', `${name}.json`);
    if (!fs.existsSync(f)) return name === 'settings' ? {} : [];
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  };
}

// Golește folderul de ieșire înainte de scriere, deci refuză folderele care nu par o versiune statică anterioară.
function checkOutDir(outDir, protect) {
  const out = path.resolve(outDir);
  if (path.parse(out).root === out) throw new Error('Folderul de ieșire nu poate fi rădăcina sistemului de fișiere.');
  for (const dir of protect.filter(Boolean)) {
    const rel = path.relative(out, path.resolve(dir));
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      throw new Error(`Folderul de ieșire (${out}) conține sau este chiar ${path.resolve(dir)}. Alegeți alt folder, de exemplu dist/.`);
    }
  }
  if (fs.existsSync(out)) {
    if (!fs.statSync(out).isDirectory()) throw new Error(`${out} este un fișier, nu un folder.`);
    const names = fs.readdirSync(out);
    if (names.length && !names.includes('.nojekyll')) {
      throw new Error(`Folderul ${out} nu este gol și nu pare o versiune statică creată anterior. Alegeți alt folder sau goliți-l.`);
    }
  }
  return out;
}

function writeTo(outDir, list, protect = []) {
  outDir = checkOutDir(outDir, protect);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const e of list) {
    const dest = path.join(outDir, e.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (e.file) fs.copyFileSync(e.file, dest);
    else fs.writeFileSync(dest, e.text);
  }
}

module.exports = { entries, diskReader, writeTo, relativize };
