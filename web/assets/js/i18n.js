/* Limbile paginii publice: română (implicit), rusă și engleză.
   Același cod rulează în Node (la construirea paginilor) și în browser (textele scrise de JavaScript).

   Două dicționare, ambele „text românesc → text tradus”, potrivire exactă (spațiile multiple se strâng):
     - dicționarul interfeței (butoane, titluri de secțiuni, etichete): se scrie în paginile ru/en la construire și se încarcă în browser
       din <script type="application/json" id="i18n-ui">;
     - dicționarul conținutului (texte din setări, proiecte, acte, programe…): se aplică datelor la construire (localize), nu ajunge în browser.
   Ce nu are traducere rămâne în română (nimic nu dispare). Traducerile din panoul de administrare (câmpul `tr` al fiecărui element) au prioritate. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT = 'ro';
  var LANGS = ['ro', 'ru', 'en'];
  // `file`: numele paginii în versiunea statică; `path`: adresa pe server.
  var META = {
    ro: { code: 'RO', name: 'Română', locale: 'ro_MD', file: 'index.html', path: '/' },
    ru: { code: 'RU', name: 'Русский', locale: 'ru_RU', file: 'ru.html', path: '/ru' },
    en: { code: 'EN', name: 'English', locale: 'en_GB', file: 'en.html', path: '/en' }
  };
  var MONTHS = {
    ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };

  var UI = { ru: null, en: null }; // dicționarele interfeței, normalizate

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }
  function normDict(d) {
    var out = Object.create(null);
    Object.keys(d || {}).forEach(function (k) { if (d[k]) out[norm(k)] = d[k]; });
    return out;
  }
  function isLang(l) { return LANGS.indexOf(l) > -1; }
  function setUi(lang, dict) { UI[lang] = normDict(dict); }
  function hasUi(lang) { return !!UI[lang]; }

  // Textul tradus după dicționarul dat; fără traducere rămâne textul original.
  function lookup(dict, s) {
    if (!dict || typeof s !== 'string' || !s) return s;
    var v = dict[s];
    if (v === undefined) v = dict[norm(s)];
    return v === undefined ? s : v;
  }
  function t(lang, s) { return lang === DEFAULT ? s : lookup(UI[lang], s); }

  /* ---------- date, numere, forme de plural ---------- */
  function fmtDate(lang, iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var months = MONTHS[lang] || MONTHS.ro;
    return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1] + (lang === 'ru' ? ' г.' : '');
  }
  // 151.5 → „151,5” (ro, ru) sau „151.5” (en); în rusă și în română miile se separă cu spațiu
  function num(lang, n) {
    var s = String(n);
    return lang === 'en' ? s : s.replace('.', ',');
  }
  // Forma corectă după număr. ro/en: [unu, mai mulți]; ru: [unu, câțiva (2–4), mulți (5–20…)].
  function plural(lang, n, forms) {
    n = Math.abs(Number(n));
    if (lang === 'ru') {
      var a = n % 10;
      var b = n % 100;
      if (a === 1 && b !== 11) return forms[0];
      if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms[1];
      return forms[2];
    }
    return n === 1 ? forms[0] : forms[forms.length - 1];
  }

  /* ---------- conținutul (date) ---------- */
  // Câmpuri a căror valoare românească este folosită de cod ca să recunoască elementul (identificatori, tipuri, ministerul). Rămân în
  // română în date; la afișare se traduc din dicționarul interfeței.
  var KEEP = { id: 1, section: 1, program: 1, group: 1, type: 1, level: 1, currency: 1, amountQual: 1, ministry: 1 };
  // Câmpuri care nu sunt text pentru public.
  var SKIP = { tr: 1, createdAt: 1, updatedAt: 1, date: 1, start: 1, end: 1, pub: 1, url: 1, site: 1, path: 1, thumb: 1, name_: 1, u: 1 };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function deepMerge(base, over) {
    if (!isObj(base) || !isObj(over)) return over;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over).forEach(function (k) { out[k] = isObj(over[k]) && isObj(base[k]) ? deepMerge(base[k], over[k]) : over[k]; });
    return out;
  }

  function walk(v, dict, key) {
    if (typeof v === 'string') return key && (KEEP[key] || SKIP[key]) ? v : lookup(dict, v);
    if (Array.isArray(v)) return v.map(function (x) { return walk(x, dict, key); });
    if (isObj(v)) {
      var out = {};
      Object.keys(v).forEach(function (k) {
        if (k === 'tr') return;
        // fișierele încărcate: doar descrierea poate fi tradusă, nu numele și calea
        out[k] = k === 'file' || k === 'image' || k === 'attachment' ? v[k] : walk(v[k], dict, k);
      });
      return out;
    }
    return v;
  }

  // Un element al datelor în limba cerută: întâi traducerile scrise în administrare (item.tr[lang]), apoi dicționarul pentru restul textelor.
  function localizeItem(item, lang, dict) {
    if (!isObj(item)) return walk(item, dict);
    var own = item.tr && isObj(item.tr[lang]) ? item.tr[lang] : null;
    var base = own ? deepMerge(item, own) : item;
    var out = walk(base, dict);
    // câmpurile traduse de mână nu mai trec prin dicționar (au fost scrise exact așa), iar cele de „logică” rămân cum sunt
    if (own) {
      Object.keys(own).forEach(function (k) {
        if (own[k] !== '' && own[k] != null) out[k] = base[k];
      });
    }
    return out;
  }

  // `data` = rezultatul buildPublic; `dict` = dicționarul conținutului pentru `lang`.
  function localize(data, lang, dict) {
    if (lang === DEFAULT) {
      return JSON.parse(JSON.stringify(data, function (k, v) { return k === 'tr' ? undefined : v; }));
    }
    var out = {};
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (Array.isArray(v)) out[k] = v.map(function (x) { return localizeItem(x, lang, dict); });
      else if (k === 'settings') out[k] = localizeItem(v, lang, dict);
      else out[k] = v;
    });
    return out;
  }

  /* ---------- HTML (șabloane și fragmente) ---------- */
  var ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  function decode(s) { return s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, function (m) { return ENT[m]; }); }
  function encodeText(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function encodeAttr(s) { return encodeText(s).replace(/"/g, '&quot;'); }

  var ATTRS = /\b(aria-label|title|alt|placeholder|aria-description)="([^"]*)"/g;
  var META_KEYS = /^(description|keywords|author|DC\.title|DC\.description|DC\.subject|DC\.rights|DC\.creator|DC\.publisher|og:title|og:description|og:site_name)$/;

  function translateTag(tag, dict) {
    tag = tag.replace(ATTRS, function (m, name, val) {
      var v = lookup(dict, decode(val));
      return name + '="' + encodeAttr(v) + '"';
    });
    if (/^<meta\b/i.test(tag)) {
      var key = /\b(?:name|property)="([^"]+)"/i.exec(tag);
      if (key && META_KEYS.test(key[1])) {
        tag = tag.replace(/\bcontent="([^"]*)"/i, function (m, val) { return 'content="' + encodeAttr(lookup(dict, decode(val))) + '"'; });
      }
    }
    return tag;
  }

  // Traduce în șirul HTML textele din noduri și atributele vizibile (aria-label, title, alt…).
  function translateHtml(html, lang) {
    var dict = UI[lang];
    if (!dict) return html;
    return html.replace(/<(script|style|textarea)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/gi, function (tok) {
      if (tok.charAt(0) === '<') return /^<(?:script|style|textarea|!--)/i.test(tok) ? tok : translateTag(tok, dict);
      var lead = /^\s*/.exec(tok)[0];
      var trail = /\s*$/.exec(tok)[0];
      var core = tok.slice(lead.length, tok.length - trail.length);
      if (!core) return tok;
      var v = lookup(dict, decode(core));
      return v === decode(core) ? tok : lead + encodeText(v) + trail;
    });
  }

  /* ---------- în browser: textele din elementele adăugate de JavaScript ---------- */
  function translateDom(node, lang) {
    var dict = UI[lang];
    if (!dict || !node) return;
    var doc = node.ownerDocument || node;
    function attrs(el) {
      ['aria-label', 'title', 'alt', 'placeholder'].forEach(function (a) {
        var v = el.getAttribute && el.getAttribute(a);
        if (v) { var tv = lookup(dict, v); if (tv !== v) el.setAttribute(a, tv); }
      });
    }
    if (node.nodeType === 3) {
      var p = node.parentNode && node.parentNode.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') return;
      var s = node.nodeValue;
      if (!s || !s.trim()) return;
      var lead = /^\s*/.exec(s)[0];
      var trail = /\s*$/.exec(s)[0];
      var core = s.slice(lead.length, s.length - trail.length);
      var v = lookup(dict, core);
      if (v !== core) node.nodeValue = lead + v + trail;
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) attrs(node);
    var w = doc.createTreeWalker(node, 1 | 4);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) {
        if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE') continue;
        attrs(n);
      } else translateDom(n, lang);
    }
  }

  // În browser, dicționarul interfeței vine în pagină (scris la construire): <script type="application/json" id="i18n-ui">.
  if (typeof document !== 'undefined' && document.getElementById) {
    var el = document.getElementById('i18n-ui');
    var pl = document.documentElement.lang;
    if (el && isLang(pl) && pl !== DEFAULT) {
      try { setUi(pl, JSON.parse(el.textContent)); } catch (e) { /* rămâne în română */ }
    }
  }

  return {
    DEFAULT: DEFAULT, LANGS: LANGS, META: META, MONTHS: MONTHS, isLang: isLang, norm: norm,
    setUi: setUi, hasUi: hasUi, t: t, lookup: lookup,
    fmtDate: fmtDate, num: num, plural: plural,
    localize: localize, localizeItem: localizeItem, deepMerge: deepMerge,
    translateHtml: translateHtml, translateDom: translateDom, KEEP: KEEP, SKIP: SKIP
  };
});
