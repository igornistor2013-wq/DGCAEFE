/* Utilitare comune pentru pagina publică și panoul de administrare. */
(function () {
  'use strict';

  // Limba paginii (ro, ru, en): în browser, din <html lang>; în Node (construirea paginilor) se dă explicit funcțiilor.
  var I18n = typeof module === 'object' && module.exports ? require('./i18n.js') : window.I18n;
  var PAGE_LANG = 'ro';
  if (typeof document !== 'undefined' && I18n && I18n.isLang(document.documentElement.lang)) PAGE_LANG = document.documentElement.lang;

  var MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Căutare fără diacritice și fără diferențe între majuscule și minuscule.
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function terms(q) {
    return norm(q).split(/\s+/).filter(Boolean);
  }
  function matches(hay, q) {
    var h = norm(hay);
    return terms(q).every(function (t) {
      return h.indexOf(t) > -1;
    });
  }

  function fmtDate(iso, lang) {
    if (I18n) return I18n.fmtDate(lang || PAGE_LANG, iso);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); // panoul de administrare nu încarcă i18n.js: doar română
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1] : '';
  }
  function dateText(item, lang) {
    return (item && (item.dateLabel || fmtDate(item.date, lang))) || '';
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatSize(bytes, lang) {
    lang = lang || PAGE_LANG;
    if (!bytes && bytes !== 0) return '';
    var u = lang === 'ru' ? ['Б', 'КБ', 'МБ'] : ['B', 'KB', 'MB'];
    if (bytes < 1024) return bytes + ' ' + u[0];
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' ' + u[1];
    var m = (bytes / 1048576).toFixed(1);
    return (lang === 'en' ? m : m.replace('.', ',')) + ' ' + u[2];
  }

  /* ---------- text formatat (sigur) ----------
     Se scapă mai întâi tot textul; sunt permise doar: paragrafe, liste, titluri (## și ###),
     **text aldin**, [text](adresă) și adrese web scrise direct. */
  var INLINE = /\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:|\/?uploads\/)[^\s)]{1,1000})\)|\*\*([^*\n]{1,300})\*\*|(https?:\/\/[^\s<>"'\]]+)/g;

  function link(href, text) {
    var external = /^https?:/i.test(href);
    return '<a href="' + esc(href) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(text) + '</a>';
  }

  function inline(s) {
    var out = '';
    var last = 0;
    var m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1] !== undefined) {
        out += link(m[2], m[1]);
      } else if (m[3] !== undefined) {
        out += '<strong>' + esc(m[3]) + '</strong>';
      } else {
        var url = m[4];
        var trail = '';
        while (/[.,;:!?)]$/.test(url)) {
          trail = url.slice(-1) + trail;
          url = url.slice(0, -1);
        }
        out += link(url, url) + esc(trail);
      }
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  function rich(text) {
    var out = [];
    var para = [];
    var list = null; // { tag, items }
    function flushPara() {
      if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>');
      para = [];
    }
    function flushList() {
      if (list) out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.tag + '>');
      list = null;
    }
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var m;
      if (!line.trim()) {
        flushPara();
        flushList();
      } else if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) {
        flushPara();
        flushList();
        var h = m[1].length + 1;
        out.push('<h' + h + '>' + inline(m[2]) + '</h' + h + '>');
      } else if ((m = /^\s*[-*•]\s+(.+)$/.exec(line))) {
        flushPara();
        if (!list || list.tag !== 'ul') {
          flushList();
          list = { tag: 'ul', items: [] };
        }
        list.items.push(m[1]);
      } else if ((m = /^\s*\d+[.)]\s+(.+)$/.exec(line))) {
        flushPara();
        if (!list || list.tag !== 'ol') {
          flushList();
          list = { tag: 'ol', items: [] };
        }
        list.items.push(m[1]);
      } else {
        flushList();
        para.push(line.trim());
      }
    });
    flushPara();
    flushList();
    return out.join('');
  }

  /* ---------- tipul fișierului ---------- */
  function fileKind(nameOrUrl) {
    var s = String(nameOrUrl || '').split(/[?#]/)[0];
    var m = /\.([a-z0-9]{2,5})$/i.exec(s);
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'pdf') return { label: 'PDF', cls: 'pdf' };
    if (/^(docx?|odt|rtf|txt)$/.test(ext)) return { label: 'DOC', cls: 'doc' };
    if (/^(xlsx?|ods|csv)$/.test(ext)) return { label: 'XLS', cls: 'xls' };
    if (/^(pptx?|odp)$/.test(ext)) return { label: 'PPT', cls: 'ppt' };
    if (ext === 'zip') return { label: 'ZIP', cls: 'zip' };
    if (/^(jpe?g|png|gif|webp)$/.test(ext)) return { label: 'IMG', cls: 'img' };
    return { label: 'LINK', cls: 'web' };
  }

  /* ---------- pictograme ---------- */
  var PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'arrow-l': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-r': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    pause: '<rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor"/><rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
    'chev-l': '<path d="m15 18-6-6 6-6"/>',
    'chev-r': '<path d="m9 18 6-6-6-6"/>',
    'chev-d': '<path d="m6 9 6 6 6-6"/>',
    'chev-u': '<path d="m18 15-6-6-6 6"/>',
    'arrow-u': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    history: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    orbit: '<rect x="2.5" y="2.5" width="19" height="19" rx="2.5"/><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="10.5" y="10.5" width="3" height="3" rx=".5"/>',
    audit: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    partner: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    expand: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
    contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>',
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    move: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>'
  };

  function icon(name, cls) {
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
  }

  function sprite() {
    if (document.getElementById('dg-sprite')) return;
    var html = '<svg id="dg-sprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    Object.keys(PATHS).forEach(function (k) {
      html += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + PATHS[k] + '</symbol>';
    });
    html += '</defs></svg>';
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  /* ---------- mesaje scurte ---------- */
  function toast(message, kind) {
    var box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.innerHTML = icon(kind === 'error' ? 'alert' : 'check') + '<span>' + esc(message) + '</span>';
    box.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('show');
    });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () {
        el.remove();
      }, 250);
    }, kind === 'error' ? 6500 : 3200);
  }

  function copyText(text, okMessage) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) {
        /* ignorat */
      }
      ta.remove();
    }
    var done = function () {
      toast(okMessage || t('Copiat în clipboard'));
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallback(); done(); });
    else {
      fallback();
      done();
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  // Text din interfață în limba paginii; cheia este textul românesc, iar %1, %2… se înlocuiesc cu argumentele date.
  function t(key) {
    var out = I18n ? I18n.t(PAGE_LANG, key) : key;
    var a = arguments;
    return a.length > 1 ? out.replace(/%(\d)/g, function (m, i) { return a[Number(i)] === undefined ? m : a[Number(i)]; }) : out;
  }

  var api = { t: t, lang: PAGE_LANG, MONTHS: MONTHS, esc: esc, norm: norm, terms: terms, matches: matches, fmtDate: fmtDate, dateText: dateText, today: today, formatSize: formatSize, rich: rich, fileKind: fileKind, icon: icon, sprite: sprite, toast: toast, copyText: copyText, debounce: debounce };
  // În Node (construirea paginii) se folosesc doar funcțiile care scriu text: aceleași reguli ca în browser, fără să atingă o pagină.
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  window.DG = api;
  sprite();
})();
