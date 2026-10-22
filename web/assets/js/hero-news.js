/* Noutățile din partea de sus a primei pagini.
   În locul textului de prezentare se derulează, pe rând, ultimele 3 noutăți (cele mai noi, în ordinea din rubrica „Noutăți”),
   câte 10 secunde fiecare. Derularea se oprește:
     - cu butonul de pauză (rămâne oprită până se apasă din nou);
     - cât timp cursorul mouse-ului este deasupra, sau cât timp cursorul tastaturii (focusul) este înăuntru;
     - cât timp pagina este ascunsă (altă filă).
   Cu butoanele „înapoi” și „înainte” se trece oricând la altă noutate. Cititoarele de ecran sunt anunțate de schimbare numai atunci,
   nu la fiecare 10 secunde.
   Diapozitivele le scrie aceeași funcție în HTML, la construirea paginii (lib/prerender.js), și în browser, deci prima afișare este
   identică și pagina nu „sare”. Fără noutăți rămâne la vedere textul de prezentare. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeroNews = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX = 3; // câte noutăți se derulează
  var SECONDS = 10; // cât stă fiecare pe ecran

  // `h` = funcțiile de scriere din common.js: esc (text sigur), dateText (data unei noutăți), icon (pictograma).
  function pick(news) {
    return Array.prototype.slice.call(news || [], 0, MAX);
  }

  function href(n) {
    return '#stire/' + n.id;
  }

  function slideHtml(n, i, h) {
    var date = h.dateText(n);
    var meta = (n.tag ? '<span class="hn-tag">' + h.esc(n.tag) + '</span>' : '') +
      (date ? '<time datetime="' + h.esc(n.date) + '">' + h.esc(date) + '</time>' : '');
    // fotografia noutății (dacă are una), alături de text; este decorativă, deoarece titlul de alături duce la aceeași noutate
    var src = n.image && (n.image.thumb || n.image.path);
    var pic = src ? '<a class="hn-pic" href="' + h.esc(href(n)) + '" tabindex="-1" aria-hidden="true"><img src="' + h.esc(src) + '" alt="" width="640" height="360"' + (i === 0 ? '' : ' loading="lazy"') + '></a>' : '';
    var text = (meta ? '<p class="hn-meta">' + meta + '</p>' : '') +
      '<p class="hn-title"><a href="' + h.esc(href(n)) + '">' + h.esc(n.title) + '</a></p>' +
      (n.summary ? '<p class="hn-sum">' + h.esc(n.summary) + '</p>' : '');
    return '<div class="hn-slide' + (i === 0 ? ' is-active' : '') + (src ? ' has-pic' : '') + '">' +
      (src ? pic + '<div class="hn-text">' + text + '</div>' : text) + '</div>';
  }

  function slidesHtml(list, h) {
    return list.map(function (n, i) { return slideHtml(n, i, h); }).join('');
  }

  /* ---------- în browser: schimbarea la 10 secunde și butoanele ---------- */
  var S = null; // starea derulatorului (în pagină există unul singur)

  // Text din interfață în limba paginii (h.t din common.js); fără el rămâne textul românesc, cu %1, %2… înlocuite.
  function tr(key) {
    var h = S && S.h;
    var a = Array.prototype.slice.call(arguments, 1);
    if (h && h.t) return h.t.apply(null, [key].concat(a));
    return key.replace(/%(\d)/g, function (m, i) { return a[Number(i) - 1] === undefined ? m : a[Number(i) - 1]; });
  }

  function keyboardFocus(el) {
    try { return el.matches(':focus-visible'); } catch (e) { return true; }
  }

  // Pornește (sau oprește) numărătoarea până la următoarea noutate și pune butonul și bara de progres în starea potrivită.
  function sync() {
    var s = S;
    clearTimeout(s.timer);
    s.timer = 0;
    var run = s.n > 1 && !s.user && !s.hover && !s.focus && !document.hidden;
    s.bar.classList.remove('run');
    if (run) {
      void s.bar.offsetWidth; // repornește bara de progres de la zero
      s.bar.classList.add('run');
      s.timer = setTimeout(function () { show(s.i + 1, false); }, SECONDS * 1000);
    }
    // Atributele se scriu doar dacă s-au schimbat: o pictogramă „use” rescrisă în timp ce se apasă pe buton nu mai primește clicul.
    var label = s.user ? tr('Pornește derularea automată') : tr('Oprește derularea automată');
    if (s.play.getAttribute('aria-label') !== label) s.play.setAttribute('aria-label', label);
    var use = s.play.querySelector('use');
    var icon = s.user ? '#i-play' : '#i-pause';
    if (use.getAttribute('href') !== icon) use.setAttribute('href', icon);
    s.box.setAttribute('data-run', run ? 'true' : 'false');
    // de ce stă pe loc (pentru teste și pentru stiluri): pauza apăsată, mouse-ul deasupra, focusul de la tastatură, pagina ascunsă
    s.box.setAttribute('data-hold', [s.user && 'pauză', s.hover && 'mouse', s.focus && 'tastatură', document.hidden && 'ascunsă'].filter(Boolean).join(' '));
  }

  // `announce`: cititoarele de ecran sunt anunțate (numai la schimbările cerute de vizitator).
  function show(i, announce) {
    var s = S;
    i = ((i % s.n) + s.n) % s.n;
    s.i = i;
    s.slides.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
    s.num.textContent = String(i + 1);
    s.more.setAttribute('href', s.hrefs[i]);
    if (announce) s.live.textContent = tr('Noutatea %1 din %2: %3', i + 1, s.n, s.titles[i]);
    sync();
  }

  function wire(box) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !box.contains(b)) return;
      if (b.id === 'hnPrev') show(S.i - 1, true);
      else if (b.id === 'hnNext') show(S.i + 1, true);
      else if (b.id === 'hnPlay') {
        S.user = !S.user;
        S.live.textContent = S.user ? tr('Derularea automată a fost oprită.') : tr('Derularea automată a fost pornită.');
        sync();
      }
    });
    // doar mouse-ul (pe ecranele tactile „deasupra” nu există și ar rămâne blocat după o atingere)
    function hovering(on) { if (on !== S.hover) { S.hover = on; sync(); } }
    box.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering(true); });
    box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hovering(false); });
    // Plasă de siguranță: când un element de sub cursor este înlocuit (pictograma unui buton, noutățile reconstruite), browserul
    // poate să nu mai trimită „pointerleave”, iar derularea ar rămâne oprită. Mișcarea cursorului corectează starea oricând.
    document.addEventListener('pointermove', function (e) {
      if (S.n && e.pointerType === 'mouse') hovering(S.box.contains(e.target));
    }, { passive: true });
    // focusul de la tastatură oprește derularea; clicul cu mouse-ul pe un buton nu o oprește
    box.addEventListener('focusin', function (e) { var k = keyboardFocus(e.target); if (k !== S.focus) { S.focus = k; sync(); } });
    box.addEventListener('focusout', function (e) {
      if (e.relatedTarget && box.contains(e.relatedTarget)) return; // focusul trece pe alt element din interior
      if (S.focus) { S.focus = false; sync(); }
    });
    document.addEventListener('visibilitychange', function () { if (S && S.n) sync(); });
  }

  // `box` = #heroNews, `lead` = textul de prezentare (se ascunde cât timp există noutăți), `news` = noutățile publice (cele mai noi primele).
  function render(box, lead, news, h) {
    var list = pick(news);
    if (!S) S = { i: 0, user: false, hover: false, focus: false, timer: 0, wired: false, n: 0 };
    var s = S;
    clearTimeout(s.timer);
    s.timer = 0;
    s.box = box;
    s.h = h;
    s.n = list.length;
    box.hidden = !s.n;
    lead.hidden = s.n > 0;
    if (!s.n) return;
    var stage = box.querySelector('.hn-stage');
    stage.innerHTML = slidesHtml(list, h);
    s.slides = Array.prototype.slice.call(stage.children);
    s.hrefs = list.map(href);
    s.titles = list.map(function (n) { return n.title; });
    s.num = box.querySelector('#hnNum');
    s.more = box.querySelector('#hnMore');
    s.play = box.querySelector('#hnPlay');
    s.live = box.querySelector('#hnLive');
    s.bar = box.querySelector('.hn-progress');
    box.querySelector('#hnTotal').textContent = String(s.n);
    box.classList.toggle('hn-single', s.n < 2);
    box.style.setProperty('--hn-ms', SECONDS * 1000 + 'ms');
    if (!s.wired) { s.wired = true; wire(box); }
    // noutățile au fost rescrise: dacă elementul care avea focusul a dispărut, browserul nu mai anunță plecarea focusului
    var a = document.activeElement;
    s.focus = !!(a && a !== document.body && box.contains(a) && keyboardFocus(a));
    show(Math.min(s.i, s.n - 1), false);
  }

  return { MAX: MAX, SECONDS: SECONDS, pick: pick, href: href, slidesHtml: slidesHtml, render: render };
});
