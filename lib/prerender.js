'use strict';
// Părțile paginii care trebuie să fie în HTML încă din prima clipă, înainte ca JavaScript să construiască restul:
// titlul paginii, numele instituției, prezentarea din partea de sus și datele de identificare (metadate).
// Se folosește la construirea versiunii statice (GitHub Pages) și, în varianta cu server, la fiecare cerere a primei pagini.
// Beneficii: titlul (h1) și textul de prezentare apar imediat, cititoarele de ecran și motoarele de căutare le găsesc și fără
// JavaScript, iar pagina nu „sare” când se încarcă datele. JavaScript rescrie aceleași texte, deci rezultatul trebuie să fie identic.

// Noutățile din partea de sus se scriu cu același cod ca în browser (web/assets/js/hero-news.js), cu aceleași funcții de scriere (common.js).
const HeroNews = require('../web/assets/js/hero-news.js');
const DG = require('../web/assets/js/common.js');
const I18n = require('../web/assets/js/i18n.js');
const i18nData = require('./i18n-data');

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

// Partea de sus a primei pagini: ultimele noutăți în locul textului de prezentare (acesta rămâne în HTML, dar ascuns). Fără nicio noutate,
// textul de prezentare rămâne la vedere. Browserul rescrie aceleași diapozitive; derularea la 10 secunde o pornește JavaScript.
function fillHeroNews(html, data, lang = I18n.DEFAULT) {
  const list = HeroNews.pick(data && data.news);
  if (!list.length) return html;
  // datele și textele interfeței se scriu în limba paginii
  const t = (key, ...a) => I18n.t(lang, key).replace(/%(\d)/g, (m, i) => (a[Number(i) - 1] === undefined ? m : a[Number(i) - 1]));
  const h = { esc: DG.esc, icon: DG.icon, dateText: n => DG.dateText(n, lang), t };
  html = html.replace('<!--hero-news-->', () => HeroNews.slidesHtml(list, h));
  html = html.replace('<!--hero-dots-->', () => HeroNews.dotsHtml(list, h, 0));
  html = html.replace(/(<div class="hero-news[^"]*" id="heroNews"[^>]*?) hidden>/, (m, open) => `${open}>`);
  if (list.length < 2) html = html.replace('<div class="hn-bar" role="group"', () => '<div class="hn-bar" hidden role="group"'); // o singură noutate: fără săgeți și puncte
  return html;
}

// Linkurile „Acces rapid” de sub căutare. Aceleași ca în web/assets/js/site.js (renderIntro): scrise în HTML, prima afișare nu se mai mută
// atunci când se încarcă scripturile (iar linkurile se văd și fără JavaScript).
function quickLinksHtml(list) {
  return list.map((l, i) => DG.quickLinkHtml(l, i)).join('');
}

function lastDate(data) {
  const d = String((data && (data.lastUpdated || data.generatedAt)) || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

// Prima pagină: textele din setări se scriu în HTML. `opts.siteUrl` (adresa publică) adaugă adresa canonică și identificatorul paginii,
// iar `opts.csp` adaugă politica de securitate (doar pentru versiunea publicată, nu pentru fișierul deschis direct din calculator).
function fillIndex(html, data, opts = {}) {
  const lang = opts.lang || I18n.DEFAULT;
  if (lang !== I18n.DEFAULT) {
    // textele fixe ale șablonului (meniuri, butoane, titluri de secțiuni) se traduc cu dicționarul interfeței; datele sunt deja traduse
    i18nData.loadUi(lang);
    html = I18n.translateHtml(html, lang);
    html = html.replace('<html lang="ro">', () => `<html lang="${lang}">`);
    html = setMeta(html, 'og:locale', I18n.META[lang].locale);
    html = setMeta(html, 'DC.language', lang);
    // textul rusesc se scrie cu literele chirilice ale fonturilor: fișierele lor se cer din timp, ca și cele cu litere latine
    if (lang === 'ru') {
      for (const w of [400, 700]) html = html.replace(new RegExp(`(<link rel="preload" href="assets/fonts/onest-latin-${w}\\.woff2"[^>]*>)`), (m, tag) => `${tag}\n<link rel="preload" href="assets/fonts/onest-cyrillic-${w}.woff2" as="font" type="font/woff2" crossorigin>`);
    }
  }
  html = markLang(html, lang);
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
    html = setInner(html, 'topParent', esc(parent));
    html = setMeta(html, 'og:description', parent);
    html = setMeta(html, 'og:site_name', parent);
    html = setMeta(html, 'author', parent);
    html = setMeta(html, 'DC.creator', parent);
    html = setMeta(html, 'DC.publisher', parent);
  }
  const title = String(s.heroTitle || org).trim();
  if (title) html = setInner(html, 'introTitle', heroTitleHtml(title));
  if (s.heroLead) html = setInner(html, 'introLead', esc(s.heroLead));
  html = fillHeroNews(html, data, lang);
  if (Array.isArray(s.quickLinks)) {
    if (s.quickLinks.length) html = setInner(html, 'quickLinks', quickLinksHtml(s.quickLinks));
    else html = html.replace('<nav class="quick"', () => '<nav class="quick" hidden'); // ca în site.js: fără linkuri nu se arată nici titlul „Acces rapid”
  }
  if (s.footerNote) html = setMeta(html, 'DC.rights', s.footerNote);
  const date = lastDate(data);
  if (date) html = setMeta(html, 'DC.date', date);

  const site = normalizeSiteUrl(opts.siteUrl);
  if (site) {
    const own = pageUrl(site, lang);
    const alts = I18n.LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(pageUrl(site, l))}">`).concat(`<link rel="alternate" hreflang="x-default" href="${esc(pageUrl(site, I18n.DEFAULT))}">`).join('\n');
    html = html.replace(/(<link rel="icon")/, (m, tag) => `<link rel="canonical" href="${esc(own)}">\n${alts}\n${tag}`);
    html = html.replace(/(<meta name="DC\.date"[^>]*>)/, (m, tag) => `${tag}\n<meta name="DC.identifier" content="${esc(own)}">`);
    html = html.replace(/(<meta property="og:type"[^>]*>)/, (m, tag) => `${tag}\n<meta property="og:url" content="${esc(own)}">`);
  }
  if (lang !== I18n.DEFAULT) {
    // dicționarul interfeței, pentru textele pe care le scrie JavaScript (vezi web/assets/js/i18n.js)
    const json = JSON.stringify(i18nData.uiDict(lang)).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
    html = html.replace('</body>', () => `<script type="application/json" id="i18n-ui">${json}</script>\n</body>`);
  }
  if (opts.csp) html = html.replace(/<meta charset="utf-8">/, m => `${m}\n${cspMeta()}`);
  return html;
}

// Adresa paginii într-o limbă: română la rădăcină, celelalte în ru.html și en.html (alături de index.html).
function pageUrl(site, lang) {
  return lang === I18n.DEFAULT ? `${site}/` : `${site}/${I18n.META[lang].file}`;
}

// În comutatorul de limbă, doar limba paginii are aria-current.
function markLang(html, lang) {
  return html.replace(/<nav class="lang"[\s\S]*?<\/nav>/, nav => nav.replace(/ aria-current="true"/g, '').replace(new RegExp(`(<a href="[^"]*" lang="${lang}" hreflang="${lang}")`), '$1 aria-current="true"'));
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

module.exports = { pageUrl, esc, heroTitleHtml, quickLinksHtml, setInner, setMeta, normalizeSiteUrl, fillIndex, fillNotFound, robotsTxt, CSP };
