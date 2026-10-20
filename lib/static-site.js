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

const attr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Administrarea direct pe GitHub: `github` = { repo: 'proprietar/depozit', branch: 'main', api: 'https://api.github.com' }.
function checkGithub(g) {
  if (!g) return null;
  const repo = String(g.repo || '');
  const branch = String(g.branch || 'main');
  const api = String(g.api || 'https://api.github.com').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.split('/').some(x => /^\.+$/.test(x))) throw new Error(`Depozitul GitHub trebuie scris proprietar/depozit (primit: „${repo}”).`);
  if (!/^[\w./-]+$/.test(branch) || branch.includes('..')) throw new Error(`Numele ramurii nu este valid: „${branch}”.`);
  let origin;
  try {
    origin = new URL(api);
  } catch (e) {
    throw new Error(`Adresa API-ului GitHub nu este validă: „${api}”.`);
  }
  if (!/^https?:$/.test(origin.protocol)) throw new Error(`Adresa API-ului GitHub trebuie să înceapă cu http:// sau https:// (primit: „${api}”).`);
  return { repo, branch, api, origin: origin.origin };
}

function indexHtml(data, gh) {
  let html = fs.readFileSync(path.join(cfg.WEB_DIR, 'index.html'), 'utf8');
  // Caracterele < și separatoarele de linie U+2028/U+2029 sunt scrise ca secvențe de evadare, ca să nu poată închide scriptul sau rupe JSON-ul.
  const json = JSON.stringify(relativize(data))
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  if (!/<html\s/.test(html) || !html.includes('</body>')) throw new Error('web/index.html are o structură neașteptată.');
  html = html.replace(/<html\s/, `<html data-static="true"${gh ? ` data-github="${attr(gh.repo)}"` : ''} `);
  return html.replace('</body>', () => `<script type="application/json" id="seed-data">${json}</script>\n</body>`);
}

// Pagina de administrare din versiunea publicată pe GitHub Pages: aceeași ca pe server, plus fișierele care o fac să lucreze direct cu GitHub.
const GH_SCRIPTS = ['admin-schemas.js', 'admin-github-core.js', 'admin-github.js'];

function adminHtml(gh) {
  let html = fs.readFileSync(path.join(cfg.WEB_DIR, 'admin', 'index.html'), 'utf8');
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", `connect-src 'self' ${gh.origin}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  const head = `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">\n<meta name="dgaefe-github" content="${attr(gh.repo)}" data-branch="${attr(gh.branch)}" data-api="${attr(gh.api)}">`;
  const last = '<script src="../assets/js/admin.js" defer></script>';
  if (!html.includes('<meta charset="utf-8">') || !html.includes(last)) throw new Error('web/admin/index.html are o structură neașteptată.');
  const scripts = GH_SCRIPTS.map(f => `<script src="../assets/js/${f}" defer></script>`).join('\n');
  return html.replace('<meta charset="utf-8">', () => head).replace(last, () => `${scripts}\n${last}`);
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

const README_GITHUB = `Versiunea publicată pe GitHub Pages
===================================

Acest folder este creat automat de GitHub Actions din depozitul GitHub, la fiecare modificare.
Nu îl editați de mână: orice schimbare se pierde la următoarea publicare.

Pagina de administrare este la adresa admin/ (de exemplu https://utilizator.github.io/depozit/admin/).
Conectarea se face cu un jeton de acces GitHub, iar modificările se salvează în folderul storage/
al depozitului. Pagina publică se reconstruiește singură în 1-2 minute.
`;

// Lista fișierelor din versiunea statică: { name, text } sau { name, file }.
// `opts.github` (vezi `checkGithub`) adaugă panoul de administrare care lucrează direct cu depozitul GitHub;
// `opts.commit` este versiunea (commit-ul) din care se construiește pagina, scrisă în version.json.
function entries(get, dataDir, opts = {}) {
  const gh = checkGithub(opts.github);
  const data = buildPublic(get);
  const list = [
    { name: 'index.html', text: indexHtml(data, gh) },
    { name: '.nojekyll', text: '' },
    { name: 'README.txt', text: gh ? README_GITHUB : README },
    ...walk(path.join(cfg.WEB_DIR, 'assets'))
      .filter(f => gh || !ADMIN_ASSET.test(f.rel)) // fără administrare pe GitHub, panoul nu face parte din versiunea statică
      .map(f => ({ name: `assets/${f.rel}`, file: f.abs }))
  ];
  if (gh) {
    const commit = /^[0-9a-f]{7,64}$/i.test(String(opts.commit || '')) ? String(opts.commit).toLowerCase() : null;
    list.push({ name: 'admin/index.html', text: adminHtml(gh) });
    list.push({ name: 'version.json', text: JSON.stringify({ commit, builtAt: new Date().toISOString(), repo: gh.repo, branch: gh.branch }) + '\n' });
  }
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
