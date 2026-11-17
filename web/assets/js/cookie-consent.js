/* Consimțământul pentru fișierele cookie (Legea nr. 195 din 25.07.2024 privind protecția datelor cu caracter personal).

   Ce face:
     - la prima vizită (și după 12 luni, sau când se schimbă versiunea regulilor) arată o bandă în partea de jos: „Respinge toate”, „Configurează”,
       „Acceptă toate”; „Respinge” este la fel de la îndemână ca „Acceptă”;
     - „Configurează” deschide fereastra cu categoriile; cele care nu sunt strict necesare sunt oprite implicit, nimic nu este pre-bifat;
     - alegerea se poate schimba oricând din „Setări cookie” (subsolul paginii), la fel de ușor ca la prima alegere;
     - alegerea este păstrată în browser (localStorage, cheia „dgaefe.consent”): este strict necesară și nu se trimite nicăieri.

   Categorii:
     necessary  — mereu active (sesiunea de administrare, memorarea acestei alegeri); nu cer acord;
     analytics  — statistica vizitelor; în prezent pagina nu folosește niciun instrument de statistică;
     external   — conținut al altor furnizori (harta Google de la „Contacte”): se încarcă numai cu acord.

   Pentru programatori: orice <script type="text/plain" data-consent="analytics" data-src="…"> (sau cu cod în el) pornește numai după acordul dat
   pentru categoria respectivă; la fel <iframe data-consent="external" data-src="…">. Codul paginii întreabă prin DGConsent.has('external')
   și ascultă evenimentul „dg:consent” de pe document. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DGConsent = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var KEY = 'dgaefe.consent';
  var VERSION = 1; // se mărește când se schimbă categoriile: toți vizitatorii sunt întrebați din nou
  var MAX_AGE = 365 * 24 * 3600 * 1000; // alegerea este valabilă 12 luni
  var CATS = ['analytics', 'external'];

  // Citește alegerea salvată; orice nu este în regulă (alt format, altă versiune, prea veche, dată din viitor) înseamnă „nu s-a ales încă”.
  function parse(raw, now) {
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    if (!v || typeof v !== 'object' || v.v !== VERSION || typeof v.t !== 'number') return null;
    if (v.t > now + 60000 || now - v.t > MAX_AGE) return null;
    var c = {};
    CATS.forEach(function (k) { c[k] = !!(v.c && v.c[k] === true); });
    return { t: v.t, c: c };
  }

  // Alegerea de salvat; „choice” poate fi 'all', 'none' sau un obiect cu categoriile bifate.
  function make(choice, now) {
    var c = {};
    CATS.forEach(function (k) { c[k] = choice === 'all' ? true : (choice && typeof choice === 'object' && choice[k] === true); });
    return { v: VERSION, t: now, c: c };
  }

  var api = { KEY: KEY, VERSION: VERSION, MAX_AGE: MAX_AGE, CATS: CATS, parse: parse, make: make };
  if (!root || !root.document) return api;

  var doc = root.document;
  var state = null; // {t, c} sau null cât timp nu s-a ales

  function read() {
    try { return parse(root.localStorage.getItem(KEY), Date.now()); } catch (e) { return null; }
  }
  function write(rec) {
    try { root.localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* stocarea poate fi blocată: banda reapare la următoarea vizită */ }
  }
  function forget() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* nimic de șters */ }
  }

  function has(cat) { return !!(state && state.c[cat]); }

  function $(s) { return doc.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); }

  // Scripturile și cadrele marcate data-consent pornesc numai pentru categoriile acceptate.
  function activate() {
    $$('script[type="text/plain"][data-consent], iframe[data-consent]').forEach(function (el) {
      if (!has(el.getAttribute('data-consent'))) return;
      if (el.tagName === 'IFRAME') {
        if (!el.getAttribute('src') && el.getAttribute('data-src')) el.setAttribute('src', el.getAttribute('data-src'));
        return;
      }
      var s = doc.createElement('script');
      if (el.getAttribute('data-src')) s.src = el.getAttribute('data-src');
      else s.text = el.text;
      el.parentNode.replaceChild(s, el);
    });
    // categoria retrasă: cadrele pornite pe baza ei se opresc
    $$('iframe[data-consent]').forEach(function (el) {
      if (!has(el.getAttribute('data-consent')) && el.getAttribute('src')) el.removeAttribute('src');
    });
  }

  var banner, dlg, lastFocus;

  function showBanner(on) {
    if (!banner) return;
    banner.hidden = !on;
    doc.body.classList.toggle('cc-open', on);
  }

  function syncSwitches() {
    CATS.forEach(function (k) {
      var i = $('#cc-' + k);
      if (i) i.checked = has(k);
    });
  }

  function save(choice) {
    var rec = make(choice, Date.now());
    state = { t: rec.t, c: rec.c };
    write(rec);
    showBanner(false);
    syncSwitches();
    activate();
    var ev;
    try { ev = new root.CustomEvent('dg:consent', { detail: { analytics: has('analytics'), external: has('external') } }); } catch (e) {
      ev = doc.createEvent('CustomEvent');
      ev.initCustomEvent('dg:consent', false, false, { analytics: has('analytics'), external: has('external') });
    }
    doc.dispatchEvent(ev);
  }

  function openDialog() {
    if (!dlg) return;
    lastFocus = doc.activeElement;
    syncSwitches();
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  function chosen() {
    var c = {};
    CATS.forEach(function (k) { var i = $('#cc-' + k); c[k] = !!(i && i.checked); });
    return c;
  }

  function init() {
    banner = $('#cc');
    dlg = $('#ccDlg');
    state = read();
    syncSwitches();
    if (!state) showBanner(true);
    activate();

    doc.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-cc]') : null;
      if (!b) return;
      var a = b.getAttribute('data-cc');
      if (a === 'accept') { save('all'); if (dlg && dlg.open) dlg.close(); }
      else if (a === 'reject') { save('none'); if (dlg && dlg.open) dlg.close(); }
      else if (a === 'save') { save(chosen()); if (dlg && dlg.open) dlg.close(); }
      else if (a === 'open') { e.preventDefault(); openDialog(); }
      else if (a === 'close' && dlg && dlg.open) dlg.close();
    });
    if (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg) dlg.close(); // click pe fundal
      });
      dlg.addEventListener('close', function () {
        if (lastFocus && lastFocus.focus && doc.contains(lastFocus) && !lastFocus.closest('[hidden]')) lastFocus.focus();
      });
    }
  }

  api.has = has;
  api.get = function () { return state ? { analytics: has('analytics'), external: has('external'), t: state.t } : null; };
  api.open = openDialog;
  api.reset = function () { forget(); state = null; syncSwitches(); showBanner(true); activate(); };
  api.init = init;

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
  return api;
});
