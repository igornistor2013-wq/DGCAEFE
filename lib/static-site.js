'use strict';
// Versiunea statică (doar citire) a site-ului: un index.html cu datele încorporate, resursele și fișierele încărcate.
// Funcționează pe GitHub Pages sau pe orice găzduire de fișiere, fără server.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { buildPublic } = require('./public');
const overlay = require('../web/assets/js/content-overlay.js');
const prerender = require('./prerender');
const I18n = require('../web/assets/js/i18n.js');

const UPLOAD_RE = /\/uploads\/(?:img|docs)\/[\w.-]+/g;
const ADMIN_ASSET = /^(?:js\/(?:admin[\w-]*|content-overlay)\.js|css\/admin\.css)$/;

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

// Scripturile și stilurile primesc în adresă o amprentă a conținutului lor („site.js?v=3f9a1c07d2”). GitHub Pages lasă fișierele în memoria
// browserului până la 10 minute; fără amprentă, după o publicare pagina nouă ar putea porni cu scripturile vechi și ar părea neschimbată.
// Amprenta se schimbă doar când se schimbă fișierul, deci ce nu s-a modificat rămâne în memorie.
const FINGERPRINTED = /^(?:js|css)\/[\w.-]+\.(?:js|css)$/;
function assetSums() {
  const sums = new Map();
  for (const f of walk(path.join(cfg.WEB_DIR, 'assets'))) {
    if (FINGERPRINTED.test(f.rel)) sums.set(`assets/${f.rel}`, crypto.createHash('sha1').update(fs.readFileSync(f.abs)).digest('hex').slice(0, 10));
  }
  return sums;
}
function stamp(html, sums) {
  return html.replace(/\b(src|href)="((?:\.\.\/|\{\{BASE\}\})?)(assets\/(?:js|css)\/[\w.-]+\.(?:js|css))"/g, (m, a, up, name) => (sums.has(name) ? `${a}="${up}${name}?v=${sums.get(name)}"` : m));
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

// `site` = adresa publică a paginii (https://utilizator.github.io/depozit), dacă se cunoaște: atunci se adaugă adresa canonică și politica de
// securitate a conținutului (aceasta nu se pune în fișierul deschis direct din calculator, unde „'self'” nu ar mai însemna nimic).
function indexHtml(data, gh, sums, site, lang = I18n.DEFAULT) {
  let html = stamp(prerender.fillIndex(fs.readFileSync(path.join(cfg.WEB_DIR, 'index.html'), 'utf8'), data, { siteUrl: site, csp: !!site, lang }), sums);
  // Caracterele < și separatoarele de linie U+2028/U+2029 sunt scrise ca secvențe de evadare, ca să nu poată închide scriptul sau rupe JSON-ul.
  const json = JSON.stringify(relativize(data))
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  if (!/<html\s/.test(html) || !html.includes('</body>')) throw new Error('web/index.html are o structură neașteptată.');
  html = html.replace(/<html\s/, `<html data-static="true"${gh ? ` data-github="${attr(gh.repo)}"` : ''} `);
  return html.replace('</body>', () => `<script type="application/json" id="seed-data">${json}</script>\n</body>`);
}

// Pagina de administrare din versiunea publicată pe GitHub Pages: aceeași ca pe server, plus fișierele care o fac să lucreze direct cu GitHub.
const GH_SCRIPTS = ['admin-schemas.js', 'content-overlay.js', 'admin-github-core.js', 'admin-github.js'];

function adminHtml(gh, sums) {
  let html = fs.readFileSync(path.join(cfg.WEB_DIR, 'admin', 'index.html'), 'utf8');
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", `connect-src 'self' ${gh.origin}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  const head = `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">\n<meta name="dgaefe-github" content="${attr(gh.repo)}" data-branch="${attr(gh.branch)}" data-api="${attr(gh.api)}">`;
  const last = '<script src="../assets/js/admin.js" defer></script>';
  if (!html.includes('<meta charset="utf-8">') || !html.includes(last)) throw new Error('web/admin/index.html are o structură neașteptată.');
  const scripts = GH_SCRIPTS.filter(f => !html.includes(`/assets/js/${f}"`)).map(f => `<script src="../assets/js/${f}" defer></script>`).join('\n');
  return stamp(html.replace('<meta charset="utf-8">', () => head).replace(last, () => `${scripts}\n${last}`), sums);
}

// Pagina „404” din șablonul web/404.html, cu adresa de bază a paginii publicate.
function notFoundHtml(data, site, sums) {
  return prerender.fillNotFound(stamp(fs.readFileSync(path.join(cfg.WEB_DIR, '404.html'), 'utf8'), sums), data, `${site}/`, { csp: true });
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
  const site = prerender.normalizeSiteUrl(opts.siteUrl);
  // O pagină pentru fiecare limbă: index.html (română), ru.html și en.html; aceleași resurse, aceleași adrese relative.
  const perLang = I18n.LANGS.map(lang => ({ lang, data: buildPublic(get, lang) }));
  const data = perLang[0].data;
  const sums = assetSums();
  const list = [
    ...perLang.map(x => ({ name: I18n.META[x.lang].file, text: indexHtml(x.data, gh, sums, site, x.lang) })),
    { name: '.nojekyll', text: '' },
    { name: 'robots.txt', text: prerender.robotsTxt(site) },
    // GitHub Pages arată fișierul 404.html pentru orice adresă care nu există; are nevoie de adresa completă a paginii, ca stilurile să se încarce de oriunde
    ...(site ? [{ name: '404.html', text: notFoundHtml(data, site, sums) }] : []),
    { name: 'README.txt', text: gh ? README_GITHUB : README },
    ...walk(path.join(cfg.WEB_DIR, 'assets'))
      .filter(f => gh || !ADMIN_ASSET.test(f.rel)) // fără administrare pe GitHub, panoul nu face parte din versiunea statică
      .map(f => ({ name: `assets/${f.rel}`, file: f.abs }))
  ];
  if (gh) {
    const commit = /^[0-9a-f]{7,64}$/i.test(String(opts.commit || '')) ? String(opts.commit).toLowerCase() : null;
    list.push({ name: 'admin/index.html', text: adminHtml(gh, sums) });
    list.push({ name: 'version.json', text: JSON.stringify({ commit, builtAt: new Date().toISOString(), repo: gh.repo, branch: gh.branch }) + '\n' });
  }
  // Fișierele încărcate la care se referă conținutul: din folderul de date, iar ce lipsește de acolo (imaginile de exemplu, de pildă) din conținutul de pornire.
  const roots = [dataDir, opts.seedDir].filter(Boolean).map(d => ({ dir: d, up: path.join(d, 'uploads') + path.sep }));
  for (const p of new Set(perLang.flatMap(x => JSON.stringify(x.data).match(UPLOAD_RE) || []))) {
    const hit = roots.map(r => ({ abs: path.join(r.dir, p), up: r.up })).find(r => r.abs.startsWith(r.up) && fs.existsSync(r.abs));
    if (hit) list.push({ name: p.slice(1), file: hit.abs });
  }
  return list;
}

// Citește colecțiile direct de pe disc (pentru scriptul din linia de comandă).
// `seedDir`: conținutul de pornire; din el se completează ce lipsește sau ce nu a fost modificat (vezi content-overlay.js).
function diskReader(dir, seedDir) {
  const read = (base, name) => {
    const f = path.join(base, 'content', `${name}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined;
  };
  const stored = {};
  const seed = {};
  for (const name of overlay.NAMES) {
    stored[name] = read(dir, name);
    if (seedDir) seed[name] = read(seedDir, name);
  }
  const upFile = seedDir && path.join(seedDir, 'upgrades.json');
  const upgrades = upFile && fs.existsSync(upFile) ? JSON.parse(fs.readFileSync(upFile, 'utf8')) : [];
  const { content } = overlay.apply(stored, seed, upgrades);
  return name => (content[name] !== undefined ? content[name] : overlay.SINGLES.includes(name) ? {} : []);
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
