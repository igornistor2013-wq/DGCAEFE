/* Caruselul din partea de sus a primei pagini.
   Primul diapozitiv este întotdeauna prezentarea (titlul direcției, căutarea și accesul rapid). După 10 secunde urmează, pe rând,
   ultimele 5 noutăți (cele mai noi, în ordinea din rubrica „Noutăți”), fiecare pe fotografia ei, câte 10 secunde; după ultima se
   revine la prezentare. Derularea se oprește:
     - cu butonul de pauză (rămâne oprită până se apasă din nou);
     - cât timp cursorul mouse-ului este deasupra, sau cât timp cursorul tastaturii (focusul) este în partea de sus a paginii;
     - cât timp pagina este ascunsă (altă filă).
   Cu săgețile și cu punctele se trece oricând la alt diapozitiv. Cititoarele de ecran sunt anunțate de schimbare numai atunci,
   nu la fiecare 10 secunde.
   Diapozitivele noutăților și punctele le scrie aceeași funcție în HTML, la construirea paginii (lib/prerender.js), și în browser,
   deci prima afișare este identică și pagina nu „sare”. Fără noutăți rămâne la vedere doar prezentarea, fără carusel. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeroNews = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX = 5; // câte noutăți se derulează (după prezentare)
  var SECONDS = 10; // cât stă fiecare diapozitiv pe ecran

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

  // Un diapozitiv de noutate: fotografia pe tot fundalul (dacă există), peste ea eticheta, data, titlul, rezumatul și butonul.
  function slideHtml(n, i, h) {
    var date = h.dateText(n);
    var meta = (n.tag ? '<span class="hn-tag">' + h.esc(n.tag) + '</span>' : '') +
      (date ? '<time datetime="' + h.esc(n.date) + '">' + h.esc(date) + '</time>' : '');
    var src = n.image && (n.image.path || n.image.thumb); // fotografia mare; este decorativă, titlul duce la aceeași noutate
    var bg = src ? '<img src="' + h.esc(src) + '" class="hn-bg" alt="" width="1600" height="900"' + (i === 0 ? '' : ' loading="lazy"') + ' decoding="async">' : '';
    return '<div class="hn-slide' + (src ? ' has-pic' : '') + '">' + bg + '<div class="wrap hn-in"><div class="hn-text">' +
      (meta ? '<p class="hn-meta">' + meta + '</p>' : '') +
      '<p class="hn-title"><a href="' + h.esc(href(n)) + '">' + h.esc(n.title) + '</a></p>' +
      (n.summary ? '<p class="hn-sum">' + h.esc(n.summary) + '</p>' : '') +
      '<a class="btn hn-go" href="' + h.esc(href(n)) + '" tabindex="-1" aria-hidden="true">' + h.esc(tx(h, 'Citește mai departe')) + ' ' + (h.icon ? h.icon('arrow-r') : '') + '</a>' +
      '</div></div></div>';
  }

  function slidesHtml(list, h) {
    return list.map(function (n, i) { return slideHtml(n, i, h); }).join('');
  }

  // Punctele de sub carusel: unul pentru prezentare și câte unul pentru fiecare noutate; cel curent este marcat cu aria-current.
  function dotsHtml(list, h, current) {
    if (!list.length) return '';
    current = current || 0;
    var out = [];
    for (var k = 0; k <= list.length; k++) {
      var label = k === 0 ? tx(h, 'Prezentarea direcției') : tx(h, 'Noutatea %1 din %2: %3', k, list.length, list[k - 1].title);
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

  // Pornește (sau oprește) numărătoarea până la următorul diapozitiv și pune butonul și bara de progres în starea potrivită.
  function sync() {
    var s = S;
    clearTimeout(s.timer);
    s.timer = 0;
    var run = s.n > 0 && !s.user && !s.hover && !s.focus && !document.hidden;
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

  // Poziția 0 este prezentarea; pozițiile 1…n sunt noutățile. `announce`: cititoarele de ecran sunt anunțate (numai la schimbările cerute de vizitator).
  function show(i, announce) {
    var s = S;
    var total = s.n + 1;
    i = ((i % total) + total) % total;
    s.i = i;
    s.slides.forEach(function (el, k) { el.classList.toggle('is-active', k === i - 1); });
    s.box.classList.toggle('is-intro', i === 0);
    // cât timp se vede o noutate, prezentarea din spatele ei nu se mai poate atinge nici cu tastatura
    if (s.main) { if (i === 0) s.main.removeAttribute('inert'); else s.main.setAttribute('inert', ''); }
    s.dots.forEach(function (d, k) {
      d.classList.toggle('is-active', k === i);
      if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    if (announce) s.live.textContent = i === 0 ? tr('Prezentarea direcției') : tr('Noutatea %1 din %2: %3', i, s.n, s.titles[i - 1]);
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

  // `box` = #heroNews (diapozitivele noutăților și butoanele), `lead` = textul de prezentare (se ascunde cât timp există noutăți),
  // `news` = noutățile publice (cele mai noi primele), `h` = funcțiile din common.js, `main` = prezentarea (titlul, căutarea, accesul rapid),
  // `rootEl` = tot blocul de sus al paginii (mouse-ul și tastatura din el opresc derularea); fără ele, doar blocul noutăților.
  function render(box, lead, news, h, main, rootEl) {
    var list = pick(news);
    if (!S) S = { i: 0, user: false, hover: false, focus: false, timer: 0, wired: false, n: 0 };
    var s = S;
    clearTimeout(s.timer);
    s.timer = 0;
    s.box = box;
    s.h = h;
    s.main = main || null;
    s.root = rootEl || box;
    s.n = list.length;
    box.hidden = !s.n;
    lead.hidden = s.n > 0;
    if (!s.n) {
      if (s.main) s.main.removeAttribute('inert');
      return;
    }
    var stage = box.querySelector('.hn-stage');
    stage.innerHTML = slidesHtml(list, h);
    s.slides = Array.prototype.slice.call(stage.children);
    s.titles = list.map(function (n) { return n.title; });
    s.play = box.querySelector('#hnPlay');
    s.live = box.querySelector('#hnLive');
    s.bar = box.querySelector('.hn-progress');
    var dotsBox = box.querySelector('#hnDots');
    s.i = Math.min(s.i, s.n);
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
