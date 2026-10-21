'use strict';
// Părțile paginii care trebuie să fie în HTML încă din prima clipă, înainte ca JavaScript să construiască restul:
// titlul paginii, numele instituției, prezentarea din partea de sus și datele de identificare (metadate).
// Se folosește la construirea versiunii statice (GitHub Pages) și, în varianta cu server, la fiecare cerere a primei pagini.
// Beneficii: titlul (h1) și textul de prezentare apar imediat, cititoarele de ecran și motoarele de căutare le găsesc și fără
// JavaScript, iar pagina nu „sare” când se încarcă datele. JavaScript rescrie aceleași texte, deci rezultatul trebuie să fie identic.

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Ultimele două cuvinte ale titlului se scriu cu galben; un titlu foarte scurt rămâne alb.
// Aceeași regulă ca în web/assets/js/site.js (heroTitleHtml); un test verifică să rămână identice.
function heroTitleHtml(t) {
  const w = String(t || '').trim().split(/\s+/).filter(Boolean);
  if (w.length < 4) return esc(w.join(' '));
  return esc(w.slice(0, -2).join(' ')) + ' <span class="h1-b">' + esc(w.slice(-2).join(' ')) + '</span>';
}

const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Înlocuiește conținutul elementului cu id-ul dat (<h1 id="x">…</h1>). Un element care lipsește rămâne cum era.
function setInner(html, id, inner) {
  const re = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bid="${reEscape(id)}"[^>]*>)[\\s\\S]*?(</\\2>)`, 'i');
  return html.replace(re, (m, open, tag, close) => open + inner + close);
}

// Înlocuiește valoarea unei etichete <meta name|property="cheie" content="…">.
function setMeta(html, key, value) {
  const re = new RegExp(`(<meta\\s+(?:name|property)="${reEscape(key)}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(re, (m, a, b) => a + esc(value) + b);
}

// Adresa publică a paginii: fără parametri și fără bară la sfârșit (https://utilizator.github.io/depozit). Gol = necunoscută.
function normalizeSiteUrl(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    throw new Error(`Adresa paginii nu este validă: „${s}”. Exemplu: https://utilizator.github.io/depozit`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`Adresa paginii trebuie să înceapă cu http:// sau https:// (primit: „${s}”).`);
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

// Politica de securitate a conținutului pentru versiunea statică (pe GitHub Pages nu se pot trimite antete HTTP, deci se pune în pagină).
// Aceleași reguli ca antetul trimis de server (server.js): scripturi, stiluri, fonturi și imagini doar de pe aceeași adresă, hărți doar Google.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://www.google.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const cspMeta = () => `<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">`;

function lastDate(data) {
  const d = String((data && (data.lastUpdated || data.generatedAt)) || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

// Prima pagină: textele din setări se scriu în HTML. `opts.siteUrl` (adresa publică) adaugă adresa canonică și identificatorul paginii,
// iar `opts.csp` adaugă politica de securitate (doar pentru versiunea publicată, nu pentru fișierul deschis direct din calculator).
function fillIndex(html, data, opts = {}) {
  const s = (data && data.settings) || {};
  const org = String(s.orgName || '').trim();
  const parent = String(s.parentName || '').trim();
  if (org) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(parent ? `${org} | ${parent}` : org)}</title>`);
    html = setInner(html, 'brandName', esc(org));
    html = setMeta(html, 'og:title', org);
    html = setMeta(html, 'DC.title', org);
  }
  if (parent) {
    html = setInner(html, 'brandParent', esc(parent));
    html = setMeta(html, 'og:description', parent);
    html = setMeta(html, 'og:site_name', parent);
    html = setMeta(html, 'author', parent);
    html = setMeta(html, 'DC.creator', parent);
    html = setMeta(html, 'DC.publisher', parent);
  }
  const title = String(s.heroTitle || org).trim();
  if (title) html = setInner(html, 'introTitle', heroTitleHtml(title));
  if (s.heroLead) html = setInner(html, 'introLead', esc(s.heroLead));
  if (s.footerNote) html = setMeta(html, 'DC.rights', s.footerNote);
  const date = lastDate(data);
  if (date) html = setMeta(html, 'DC.date', date);

  const site = normalizeSiteUrl(opts.siteUrl);
  if (site) {
    html = html.replace(/(<link rel="icon")/, (m, tag) => `<link rel="canonical" href="${esc(site)}/">\n${tag}`);
    html = html.replace(/(<meta name="DC\.date"[^>]*>)/, (m, tag) => `${tag}\n<meta name="DC.identifier" content="${esc(site)}/">`);
    html = html.replace(/(<meta property="og:type"[^>]*>)/, (m, tag) => `${tag}\n<meta property="og:url" content="${esc(site)}/">`);
  }
  if (opts.csp) html = html.replace(/<meta charset="utf-8">/, m => `${m}\n${cspMeta()}`);
  return html;
}

// Pagina „404”: {{BASE}} din șablon devine adresa de bază (/ pe server, adresa publică în versiunea statică).
function fillNotFound(html, data, base, opts = {}) {
  const s = (data && data.settings) || {};
  const parent = String(s.parentName || '').trim();
  if (s.orgName) html = setInner(html, 'brandName', esc(String(s.orgName).trim()));
  if (parent) {
    html = setInner(html, 'brandParent', esc(parent));
    html = setInner(html, 'nfCopy', `© ${esc(parent)}`);
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>Pagina nu a fost găsită | ${esc(parent)}</title>`);
  }
  const c = s.contact || {};
  const mail = c.mailTo || (c.emails && c.emails[0] && c.emails[0].addr) || '';
  html = html.replace(/<a id="nfMail"[^>]*>[\s\S]*?<\/a>/, m => (mail ? `<a id="nfMail" href="mailto:${esc(mail)}">${esc(mail)}</a>` : m));
  if (opts.csp) html = html.replace(/<meta charset="utf-8">/, m => `${m}\n${cspMeta()}`);
  return html.split('{{BASE}}').join(base);
}

// robots.txt: administrarea nu trebuie să apară în căutări. `site` = adresa publică (poate lipsi).
function robotsTxt(site) {
  let base = '/';
  if (site) {
    try {
      base = new URL(site).pathname.replace(/\/*$/, '/');
    } catch (e) { /* rămâne / */ }
  }
  return `User-agent: *\nAllow: /\nDisallow: ${base}admin/\n`;
}

module.exports = { esc, heroTitleHtml, setInner, setMeta, normalizeSiteUrl, fillIndex, fillNotFound, robotsTxt, CSP };
