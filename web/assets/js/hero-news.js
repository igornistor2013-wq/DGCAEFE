/* Caruselul din cardul de sus al primei pagini.
   În dreapta cardului bleumarin se vede fotografia ultimei noutăți, cu un card sticlos pe ea (eticheta, data și titlul). Textul de prezentare
   (titlul direcției, căutarea) rămâne mereu la vedere, în stânga. După 10 secunde urmează, pe rând, cele mai noi 5 noutăți (în ordinea din
   rubrica „Noutăți”); după ultima se revine la prima. Derularea se oprește:
     - cu butonul de pauză (rămâne oprită până se apasă din nou);
     - cât timp cursorul mouse-ului este deasupra cardului, sau cât timp cursorul tastaturii (focusul) este în el;
     - cât timp pagina este ascunsă (altă filă).
   Cu săgețile și cu punctele se trece oricând la altă noutate. Cititoarele de ecran sunt anunțate de schimbare numai atunci,
   nu la fiecare 10 secunde.
   Diapozitivele și punctele le scrie aceeași funcție în HTML, la construirea paginii (lib/prerender.js), și în browser,
   deci prima afișare este identică și pagina nu „sare”. Fără noutăți, cardul rămâne doar cu textul de prezentare. Cu o singură noutate
   nu există săgeți, puncte sau derulare. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeroNews = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX = 5; // câte noutăți se derulează
  var SECONDS = 10; // cât stă fiecare noutate pe ecran

  // `h` = funcțiile de scriere din common.js: esc (text sigur), dateText (data unei noutăți), t (text din interfață, în limba paginii).
  function pick(news) {
    return Array.prototype.slice.call(news || [], 0, MAX);
  }

  function href(n) {
    return '#stire/' + n.id;
  }

  function tx(h, key) {
    var a = Array.prototype.slice.call(arguments, 2);
    if (h && h.t) return h.t.apply(null, [key].concat(a));
    return key.replace(/%(\d)/g, function (m, i) { return a[Number(i) - 1] === undefined ? m : a[Number(i) - 1]; });
  }

  // O noutate: fotografia mare pe fundal (dacă există), iar peste ea cardul sticlos cu eticheta, data și titlul (titlul duce la noutate).
  function slideHtml(n, i, h) {
    var date = h.dateText(n);
    var meta = (n.tag ? '<span class="hn-tag">' + h.esc(n.tag) + '</span>' : '') +
      (date ? '<time datetime="' + h.esc(n.date) + '">' + h.esc(date) + '</time>' : '');
    var src = n.image && (n.image.path || n.image.thumb); // fotografia mare; este decorativă, titlul duce la aceeași noutate
    var bg = src ? '<img src="' + h.esc(src) + '" class="hn-bg" alt="" width="1600" height="900"' + (i === 0 ? '' : ' loading="lazy"') + ' decoding="async">' : '';
    return '<div class="hn-slide' + (src ? ' has-pic' : '') + (i === 0 ? ' is-active' : '') + '">' + bg + '<div class="hn-card">' +
      (meta ? '<p class="hn-meta">' + meta + '</p>' : '') +
      '<p class="hn-title"><a href="' + h.esc(href(n)) + '">' + h.esc(n.title) + '</a></p>' +
      '</div></div>';
  }

  function slidesHtml(list, h) {
    return list.map(function (n, i) { return slideHtml(n, i, h); }).join('');
  }

  // Punctele de sub carusel: câte unul pentru fiecare noutate; cel curent este marcat cu aria-current.
  function dotsHtml(list, h, current) {
    if (list.length < 2) return '';
    current = current || 0;
    var out = [];
    for (var k = 0; k < list.length; k++) {
      var label = tx(h, 'Noutatea %1 din %2: %3', k + 1, list.length, list[k].title);
      out.push('<button type="button" class="hn-dot' + (k === current ? ' is-active' : '') + '" data-i="' + k + '" aria-label="' + h.esc(label) + '"' + (k === current ? ' aria-current="true"' : '') + '></button>');
    }
    return out.join('');
  }

  /* ---------- în browser: schimbarea la 10 secunde, săgețile și punctele ---------- */
  var S = null; // starea caruselului (în pagină există unul singur)

  // Text din interfață în limba paginii (h.t din common.js); fără el rămâne textul românesc, cu %1, %2… înlocuite.
  function tr(key) {
    return tx.apply(null, [S && S.h, key].concat(Array.prototype.slice.call(arguments, 1)));
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

  // Pozițiile sunt 0…n-1 (noutățile, cele mai noi primele). `announce`: cititoarele de ecran sunt anunțate (numai la schimbările cerute de vizitator).
  function show(i, announce) {
    var s = S;
    var total = s.n;
    i = ((i % total) + total) % total;
    s.i = i;
    s.slides.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
    s.dots.forEach(function (d, k) {
      d.classList.toggle('is-active', k === i);
      if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    if (announce) s.live.textContent = tr('Noutatea %1 din %2: %3', i + 1, s.n, s.titles[i]);
    sync();
  }

  function wire(box, rootEl) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !box.contains(b)) return;
      if (b.id === 'hnPrev') show(S.i - 1, true);
      else if (b.id === 'hnNext') show(S.i + 1, true);
      else if (b.id === 'hnPlay') {
        S.user = !S.user;
        S.live.textContent = S.user ? tr('Derularea automată a fost oprită.') : tr('Derularea automată a fost pornită.');
        sync();
      } else if (b.getAttribute('data-i') !== null) show(Number(b.getAttribute('data-i')), true);
    });
    // doar mouse-ul (pe ecranele tactile „deasupra” nu există și ar rămâne blocat după o atingere)
    function hovering(on) { if (on !== S.hover) { S.hover = on; sync(); } }
    rootEl.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering(true); });
    rootEl.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hovering(false); });
    // Plasă de siguranță: când un element de sub cursor este înlocuit (pictograma unui buton, punctele reconstruite), browserul
    // poate să nu mai trimită „pointerleave”, iar derularea ar rămâne oprită. Mișcarea cursorului corectează starea oricând.
    document.addEventListener('pointermove', function (e) {
      if (S.n && e.pointerType === 'mouse') hovering(S.root.contains(e.target));
    }, { passive: true });
    // focusul de la tastatură oprește derularea; clicul cu mouse-ul pe un buton nu o oprește
    rootEl.addEventListener('focusin', function (e) { var k = keyboardFocus(e.target); if (k !== S.focus) { S.focus = k; sync(); } });
    rootEl.addEventListener('focusout', function (e) {
      if (e.relatedTarget && rootEl.contains(e.relatedTarget)) return; // focusul trece pe alt element din interior
      if (S.focus) { S.focus = false; sync(); }
    });
    document.addEventListener('visibilitychange', function () { if (S && S.n) sync(); });
  }

  // `box` = #heroNews (noutățile și butoanele), `news` = noutățile publice (cele mai noi primele), `h` = funcțiile din common.js,
  // `rootEl` = tot cardul de sus (mouse-ul și tastatura din el opresc derularea); fără el, doar blocul noutăților.
  function render(box, news, h, rootEl) {
    var list = pick(news);
    if (!S) S = { i: 0, user: false, hover: false, focus: false, timer: 0, wired: false, n: 0 };
    var s = S;
    clearTimeout(s.timer);
    s.timer = 0;
    s.box = box;
    s.h = h;
    s.root = rootEl || box;
    s.n = list.length;
    box.hidden = !s.n;
    if (!s.n) return;
    var stage = box.querySelector('.hn-stage');
    stage.innerHTML = slidesHtml(list, h);
    s.slides = Array.prototype.slice.call(stage.children);
    s.titles = list.map(function (n) { return n.title; });
    s.play = box.querySelector('#hnPlay');
    s.live = box.querySelector('#hnLive');
    s.bar = box.querySelector('.hn-progress');
    box.querySelector('.hn-bar').hidden = s.n < 2; // o singură noutate: fără săgeți, puncte și pauză
    var dotsBox = box.querySelector('#hnDots');
    s.i = Math.min(s.i, s.n - 1);
    dotsBox.innerHTML = dotsHtml(list, h, s.i);
    s.dots = Array.prototype.slice.call(dotsBox.children);
    box.style.setProperty('--hn-ms', SECONDS * 1000 + 'ms');
    if (!s.wired) { s.wired = true; wire(box, s.root); }
    // noutățile au fost rescrise: dacă elementul care avea focusul a dispărut, browserul nu mai anunță plecarea focusului
    var a = document.activeElement;
    s.focus = !!(a && a !== document.body && s.root.contains(a) && keyboardFocus(a));
    show(s.i, false);
  }

  return { MAX: MAX, SECONDS: SECONDS, pick: pick, href: href, slidesHtml: slidesHtml, dotsHtml: dotsHtml, render: render };
});
