'use strict';
// Caruselul din partea de sus a primei pagini (web/assets/js/hero-news.js): alegerea celor mai noi 5, textul
// diapozitivelor și al punctelor, prezentarea ca prim diapozitiv, schimbarea la 10 secunde, săgețile, punctele, pauza, mouse-ul și tastatura, pagina ascunsă. Rulează fără browser,
// cu un DOM foarte mic și timp simulat. (Comportamentul s-a verificat și într-un browser real, cu timp simulat.) Rulează cu: npm test
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { mock } = test;
const assert = require('node:assert/strict');

const DG = require('../web/assets/js/common.js');
const MODULE = require.resolve('../web/assets/js/hero-news.js');
const fresh = () => {
  delete require.cache[MODULE]; // fiecare probă pornește cu un derulator nou (starea lui este în modul)
  return require(MODULE);
};

const news = n => Array.from({ length: n }, (_, i) => ({ id: `n${i + 1}`, title: `Noutatea ${i + 1}`, date: `2026-03-${String(28 - i).padStart(2, '0')}`, tag: i === 0 ? 'Apel' : '', summary: i === 1 ? '' : `Rezumat ${i + 1}` }));

// ---------- un DOM foarte mic, cât îi trebuie derulatorului ----------
class Cls {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
}
class El {
  constructor(id) {
    this.id = id || '';
    this.attrs = {};
    this.classList = new Cls();
    this.listeners = {};
    this.children = [];
    this.members = [];
    this.refs = {};
    this.textContent = '';
    this.hidden = false;
    this.offsetWidth = 1;
    this.focusVisible = true;
    this.isButton = false;
    this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, extra) { for (const fn of this.listeners[type] || []) fn(Object.assign({ type, target: this, relatedTarget: null }, extra)); }
  querySelector(sel) { return this.refs[sel] || null; }
  contains(el) { return el === this || this.members.some(m => m === el || m.children.includes(el)); }
  closest(sel) { return sel === 'button' && this.isButton ? this : null; }
  matches(sel) { return sel === ':focus-visible' ? this.focusVisible : false; }
  set innerHTML(html) {
    this.html = html;
    // diapozitivele (hn-slide) și punctele (hn-dot, cu butoane numerotate) pe care le scrie scriptul
    this.children = (html.match(/class="hn-(?:slide|dot)\b/g) || []).map((m, i) => {
      const c = new El();
      if (m.includes('hn-dot')) { c.isButton = true; c.setAttribute('data-i', String(i)); }
      return c;
    });
  }
  get innerHTML() { return this.html || ''; }
}

// pagina: blocul cu noutăți, textul lung de prezentare, prezentarea (titlu, căutare), săgețile, pauza, punctele, mesajul pentru cititoarele de ecran, bara de progres
function makePage() {
  const box = new El('heroNews');
  const root = new El('top');
  const main = new El('introMain');
  const lead = new El('introLead');
  const search = new El('heroQ');
  const stage = new El();
  const dotsBox = new El('hnDots');
  const prev = new El('hnPrev');
  const play = new El('hnPlay');
  const next = new El('hnNext');
  for (const b of [prev, play, next]) b.isButton = true;
  const use = new El();
  use.setAttribute('href', '#i-pause');
  play.refs.use = use;
  play.setAttribute('aria-label', 'Oprește derularea automată');
  const live = new El('hnLive');
  const bar = new El();
  Object.assign(box.refs, { '.hn-stage': stage, '#hnDots': dotsBox, '#hnPlay': play, '#hnLive': live, '.hn-progress': bar });
  box.members = [stage, dotsBox, prev, play, next, live, bar, use];
  root.members = [box, main, search, lead, ...box.members];
  const outside = new El('afara');
  return { box, root, main, lead, search, stage, dotsBox, prev, play, next, use, live, bar, outside };
}

function setup(t, count) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const doc = new El('document');
  doc.hidden = false;
  doc.body = new El('body');
  doc.activeElement = doc.body;
  global.document = doc;
  t.after(() => {
    mock.timers.reset();
    delete global.document;
  });
  const page = makePage();
  const H = fresh();
  const list = news(count);
  const draw = l => H.render(page.box, page.lead, l || list, DG, page.main, page.root);
  draw();
  return {
    H, doc, list, ...page,
    tick: ms => mock.timers.tick(ms),
    // poziția: 0 = prezentarea, 1…n = noutățile; -1 = nu există carusel
    pos: () => (page.stage.children.length ? (page.box.classList.contains('is-intro') ? 0 : page.stage.children.findIndex(c => c.classList.contains('is-active')) + 1) : -1),
    dot: () => page.dotsBox.children.findIndex(c => c.classList.contains('is-active')),
    click: b => page.box.dispatch('click', { target: b }),
    hold: () => page.box.getAttribute('data-hold'),
    run: () => page.box.getAttribute('data-run'),
    rerender: l => draw(l)
  };
}

test('pick: primele 5 în ordinea primită, fără listă nu se alege nimic', () => {
  const H = fresh();
  assert.equal(H.MAX, 5);
  assert.equal(H.SECONDS, 10);
  const list = news(15);
  assert.deepEqual(H.pick(list).map(n => n.id), list.slice(0, 5).map(n => n.id));
  assert.equal(H.pick(list.slice(0, 3)).length, 3);
  assert.notEqual(H.pick(list), list, 'o copie, lista originală nu se atinge');
  assert.equal(list.length, 15);
  for (const x of [null, undefined, [], {}]) assert.deepEqual(H.pick(x), []);
});

test('diapozitivul: titlul duce la noutate, data este <time>, eticheta și rezumatul apar doar dacă există, fotografia mare e pe fundal, textele sunt scrise sigur', () => {
  const H = fresh();
  const [a, b] = news(2);
  const html = H.slidesHtml([a, b], DG);
  const slides = html.split('<div class="hn-slide').slice(1);
  assert.equal(slides.length, 2);
  assert.ok(slides.every(x => x.startsWith('"><div class="wrap hn-in"><div class="hn-text">')), 'niciunul nu e vizibil de la început: se vede prezentarea');
  assert.match(slides[0], /<span class="hn-tag">Apel<\/span><time datetime="2026-03-28">28 martie 2026<\/time>/);
  assert.match(slides[0], /<p class="hn-title"><a href="#stire\/n1">Noutatea 1<\/a><\/p>/);
  assert.match(slides[0], /<p class="hn-sum">Rezumat 1<\/p>/);
  assert.match(slides[0], /<a class="btn hn-go" href="#stire\/n1" tabindex="-1" aria-hidden="true">Citește mai departe /);
  assert.doesNotMatch(slides[1], /hn-tag|hn-sum/, 'fără etichetă și fără rezumat nu se scriu elemente goale');
  assert.doesNotMatch(html, /hn-bg/, 'fără fotografie nu există imagine de fundal');
  // fotografia: cea mare; prima nu este amânată, celelalte se încarcă la nevoie
  const pic = H.slidesHtml([{ id: 'p', title: 'T', image: { path: 'uploads/img/a.jpg', thumb: 'uploads/img/a-t.jpg' } }, { id: 'q', title: 'U', image: { thumb: 'uploads/img/b-t.jpg' } }], DG);
  assert.match(pic, /<div class="hn-slide has-pic"><img src="uploads\/img\/a\.jpg" class="hn-bg" alt="" width="1600" height="900" decoding="async">/);
  assert.match(pic, /<img src="uploads\/img\/b-t\.jpg" class="hn-bg" alt="" width="1600" height="900" loading="lazy" decoding="async">/);
  // nimic din text nu devine cod
  const evil = H.slidesHtml([{ id: 'a"b', title: '<img src=x onerror=alert(1)>', tag: '<b>', summary: '</p><script>1</script>', date: '2026-01-02' }], DG);
  assert.doesNotMatch(evil, /<img|<b>|<script/);
  assert.match(evil, /href="#stire\/a&quot;b"/);
  assert.equal(H.href({ id: 'n7' }), '#stire/n7');
  assert.equal(H.slidesHtml([], DG), '');
});

test('punctele: unul pentru prezentare și unul pentru fiecare noutate, cel curent este marcat; etichetele vin din dicționarul limbii', () => {
  const H = fresh();
  const html = H.dotsHtml(news(2), DG, 1);
  assert.equal(html, '<button type="button" class="hn-dot" data-i="0" aria-label="Prezentarea direcției"></button>' +
    '<button type="button" class="hn-dot is-active" data-i="1" aria-label="Noutatea 1 din 2: Noutatea 1" aria-current="true"></button>' +
    '<button type="button" class="hn-dot" data-i="2" aria-label="Noutatea 2 din 2: Noutatea 2"></button>');
  assert.equal(H.dotsHtml([], DG), '');
  assert.match(H.dotsHtml(news(1), { esc: DG.esc, dateText: DG.dateText, t: k => `[${k}]` }, 0), /aria-label="\[Prezentarea direcției\]"/);
});

test('prezentarea e prima; din 12 noutăți se derulează 5, la 10 secunde fiecare, apoi se revine la prezentare; schimbările automate nu sunt anunțate', t => {
  const p = setup(t, 12);
  assert.equal(p.stage.children.length, 5);
  assert.equal(p.dotsBox.children.length, 6);
  assert.equal(p.pos(), 0, 'la început se vede prezentarea');
  assert.equal(p.box.classList.contains('is-intro'), true);
  assert.equal(p.dot(), 0);
  assert.equal(p.main.getAttribute('inert'), null, 'prezentarea se poate folosi (căutare, linkuri)');
  assert.equal(p.lead.hidden, false, 'textul de sub titlu rămâne la vedere, în primul diapozitiv');
  assert.equal(p.box.hidden, false);
  assert.equal(p.run(), 'true');
  assert.equal(p.box.style.props['--hn-ms'], '10000ms');
  p.tick(9999);
  assert.equal(p.pos(), 0, 'la 9,999 secunde încă prezentarea');
  p.tick(1);
  assert.equal(p.pos(), 1, 'la 10 secunde prima noutate');
  assert.equal(p.dot(), 1);
  assert.equal(p.main.getAttribute('inert'), '', 'cât timp se vede o noutate, prezentarea din spate nu se mai atinge');
  for (let i = 2; i <= 5; i++) {
    p.tick(10000);
    assert.equal(p.pos(), i);
    assert.equal(p.dot(), i);
  }
  p.tick(10000);
  assert.equal(p.pos(), 0, 'după a 5-a noutate, din nou prezentarea');
  assert.equal(p.main.getAttribute('inert'), null);
  assert.equal(p.live.textContent, '', 'cititoarele de ecran nu sunt întrerupte la fiecare 10 secunde');
  assert.equal(p.bar.classList.contains('run'), true, 'bara de progres pornește de la zero la fiecare schimbare');
});

test('săgețile trec în cerc (prezentarea face parte din cerc), anunță schimbarea și repornesc numărătoarea', t => {
  const p = setup(t, 3);
  p.click(p.prev);
  assert.equal(p.pos(), 3, 'înapoi de la prezentare duce la ultima noutate');
  assert.equal(p.live.textContent, 'Noutatea 3 din 3: Noutatea 3');
  p.click(p.next);
  assert.equal(p.pos(), 0, 'înainte de la ultima duce la prezentare');
  assert.equal(p.live.textContent, 'Prezentarea direcției');
  p.click(p.next);
  assert.equal(p.pos(), 1);
  assert.equal(p.live.textContent, 'Noutatea 1 din 3: Noutatea 1');
  // după o schimbare făcută de vizitator, următoarea vine abia după alte 10 secunde
  p.tick(9000);
  p.click(p.next);
  p.tick(9999);
  assert.equal(p.pos(), 2);
  p.tick(1);
  assert.equal(p.pos(), 3);
  // un clic pe altceva din bloc nu face nimic
  p.click(p.outside);
  assert.equal(p.pos(), 3);
});

test('punctele duc direct la diapozitivul lor, inclusiv la prezentare', t => {
  const p = setup(t, 5);
  p.click(p.dotsBox.children[4]);
  assert.equal(p.pos(), 4);
  assert.equal(p.dot(), 4);
  assert.equal(p.live.textContent, 'Noutatea 4 din 5: Noutatea 4');
  assert.equal(p.dotsBox.children[4].getAttribute('aria-current'), 'true');
  assert.equal(p.dotsBox.children[0].getAttribute('aria-current'), null);
  p.click(p.dotsBox.children[0]);
  assert.equal(p.pos(), 0);
  assert.equal(p.live.textContent, 'Prezentarea direcției');
  p.tick(9999);
  assert.equal(p.pos(), 0, 'după un clic, 10 secunde întregi');
  p.tick(1);
  assert.equal(p.pos(), 1);
});

test('pauza: oprește pentru totdeauna, are etichetă și pictogramă potrivite, iar „pornește” reia cu 10 secunde întregi', t => {
  const p = setup(t, 4);
  p.click(p.play);
  assert.equal(p.play.getAttribute('aria-label'), 'Pornește derularea automată');
  assert.equal(p.use.getAttribute('href'), '#i-play');
  assert.equal(p.live.textContent, 'Derularea automată a fost oprită.');
  assert.deepEqual([p.run(), p.hold()], ['false', 'pauză']);
  assert.equal(p.bar.classList.contains('run'), false);
  p.tick(5 * 60 * 1000);
  assert.equal(p.pos(), 0, 'în pauză nu se schimbă nimic, oricât ar trece');
  p.click(p.next);
  assert.equal(p.pos(), 1, 'în pauză se poate trece manual');
  p.tick(60000);
  assert.equal(p.pos(), 1, 'și rămâne în pauză');
  p.click(p.play);
  assert.equal(p.play.getAttribute('aria-label'), 'Oprește derularea automată');
  assert.equal(p.use.getAttribute('href'), '#i-pause');
  assert.equal(p.live.textContent, 'Derularea automată a fost pornită.');
  assert.deepEqual([p.run(), p.hold()], ['true', '']);
  p.tick(9999);
  assert.equal(p.pos(), 1);
  p.tick(1);
  assert.equal(p.pos(), 2);
});

test('mouse-ul deasupra blocului de sus oprește derularea; atingerea cu degetul nu; dacă browserul nu mai anunță plecarea mouse-ului, mișcarea lui corectează starea', t => {
  const p = setup(t, 4);
  p.root.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(p.hold(), 'mouse');
  p.tick(60000);
  assert.equal(p.pos(), 0, 'cu mouse-ul deasupra nu se schimbă');
  p.root.dispatch('pointerleave', { pointerType: 'mouse' });
  assert.equal(p.hold(), '');
  p.tick(9999);
  assert.equal(p.pos(), 0, 'după plecare, 10 secunde întregi');
  p.tick(1);
  assert.equal(p.pos(), 1);

  // ecranele tactile nu au „deasupra”: ar rămâne blocat după o atingere
  p.root.dispatch('pointerenter', { pointerType: 'touch' });
  p.root.dispatch('pointerenter', { pointerType: 'pen' });
  assert.equal(p.hold(), '');

  // „pointerleave” pierdut: mișcarea cursorului în afara blocului eliberează derularea
  p.root.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(p.hold(), 'mouse');
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.next });
  assert.equal(p.hold(), 'mouse', 'mișcare în interior: rămâne oprită');
  p.doc.dispatch('pointermove', { pointerType: 'touch', target: p.outside });
  assert.equal(p.hold(), 'mouse', 'mișcarea unui deget nu schimbă nimic');
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.outside });
  assert.equal(p.hold(), '', 'mouse-ul în afara blocului: derularea reia');
  p.tick(10000);
  assert.equal(p.pos(), 2);
  // mouse-ul poate intra și prin mișcare (fără „pointerenter”), de exemplu peste căutarea din prezentare
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.search });
  assert.equal(p.hold(), 'mouse');
});

test('focusul de la tastatură oriunde în blocul de sus (și în căutare) oprește derularea; focusul dat de un clic cu mouse-ul nu; trecerea între elemente nu o repornește', t => {
  const p = setup(t, 4);
  p.next.focusVisible = false; // focus dat de clic, nu de tastatură
  p.root.dispatch('focusin', { target: p.next });
  assert.equal(p.hold(), '', 'clicul cu mouse-ul pe un buton nu oprește derularea');
  p.next.focusVisible = true;
  p.root.dispatch('focusin', { target: p.search });
  assert.equal(p.hold(), 'tastatură', 'cine scrie în căutare nu este întrerupt');
  p.tick(60000);
  assert.equal(p.pos(), 0);
  // focusul trece de pe un element pe altul din bloc: rămâne oprită
  p.root.dispatch('focusout', { target: p.search, relatedTarget: p.next });
  p.root.dispatch('focusin', { target: p.next });
  assert.equal(p.hold(), 'tastatură');
  // focusul iese din bloc
  p.root.dispatch('focusout', { target: p.next, relatedTarget: null });
  assert.equal(p.hold(), '');
  p.tick(10000);
  assert.equal(p.pos(), 1);
});

test('cât timp pagina este ascunsă (altă filă) nu se schimbă nimic; la întoarcere numărătoarea reîncepe', t => {
  const p = setup(t, 4);
  p.tick(7000);
  p.doc.hidden = true;
  p.doc.dispatch('visibilitychange');
  assert.deepEqual([p.run(), p.hold()], ['false', 'ascunsă']);
  p.tick(60000);
  assert.equal(p.pos(), 0);
  p.doc.hidden = false;
  p.doc.dispatch('visibilitychange');
  assert.deepEqual([p.run(), p.hold()], ['true', '']);
  p.tick(9999);
  assert.equal(p.pos(), 0);
  p.tick(1);
  assert.equal(p.pos(), 1);
});

test('o singură noutate: prezentarea, apoi noutatea, apoi din nou prezentarea', t => {
  const one = setup(t, 1);
  assert.equal(one.stage.children.length, 1);
  assert.equal(one.dotsBox.children.length, 2);
  assert.equal(one.run(), 'true');
  assert.equal(one.pos(), 0);
  one.tick(10000);
  assert.equal(one.pos(), 1);
  one.tick(10000);
  assert.equal(one.pos(), 0);
  assert.equal(one.lead.hidden, false);
  assert.equal(one.box.hidden, false);
});

test('nicio noutate: rămâne doar prezentarea, fără carusel și fără numărătoare', t => {
  const none = setup(t, 0);
  assert.equal(none.box.hidden, true);
  assert.equal(none.lead.hidden, false, 'fără noutăți se vede textul de prezentare');
  assert.equal(none.stage.children.length, 0);
  assert.equal(none.run(), null, 'nu pornește nicio numărătoare');
  assert.equal(none.main.getAttribute('inert'), null);
  none.tick(60000);
  assert.equal(none.pos(), -1);
});

test('rescrierea paginii (după ce se află că cel care o vede este administrator) păstrează diapozitivul afișat și nu dublează ascultătorii', t => {
  const p = setup(t, 3);
  p.click(p.next);
  p.click(p.next);
  p.click(p.next);
  assert.equal(p.pos(), 3);
  p.rerender();
  assert.equal(p.pos(), 3, 'rămâne la același diapozitiv');
  assert.equal(p.dot(), 3);
  assert.equal(p.box.listeners.click.length, 1);
  assert.equal(p.root.listeners.pointerenter.length, 1);
  assert.equal(p.root.listeners.focusin.length, 1);
  assert.equal(p.doc.listeners.pointermove.length, 1);
  assert.equal(p.doc.listeners.visibilitychange.length, 1);
  p.tick(9999);
  assert.equal(p.pos(), 3);
  p.tick(1);
  assert.equal(p.pos(), 0, 'numărătoarea reîncepe o singură dată (un singur ceas); după ultima vine prezentarea');

  // mai puține noutăți decât poziția curentă: se revine în limite
  p.click(p.prev);
  assert.equal(p.pos(), 3);
  p.rerender(news(2));
  assert.equal(p.stage.children.length, 2);
  assert.equal(p.dotsBox.children.length, 3);
  assert.equal(p.pos(), 2);
  // ultima noutate este ștearsă: rămâne doar prezentarea, iar ceasul se oprește
  p.rerender([]);
  assert.equal(p.box.hidden, true);
  assert.equal(p.lead.hidden, false);
  assert.equal(p.main.getAttribute('inert'), null, 'prezentarea nu rămâne blocată');
  const before = p.pos();
  p.tick(60000);
  assert.equal(p.pos(), before, 'ceasul s-a oprit: nimic nu se mai schimbă');
  // și revin
  p.rerender(news(2));
  assert.equal(p.box.hidden, false);
  assert.equal(p.lead.hidden, false);
  assert.equal(p.stage.children.length, 2);
});

test('la rescrierea paginii, focusul rămas pe un element dispărut nu ține derularea oprită', t => {
  const p = setup(t, 4);
  p.prev.focusVisible = true;
  p.doc.activeElement = p.prev;
  p.root.dispatch('focusin', { target: p.prev });
  assert.equal(p.hold(), 'tastatură');
  p.doc.activeElement = p.doc.body; // elementul cu focus a fost înlocuit; browserul nu mai anunță plecarea focusului
  p.rerender();
  assert.equal(p.hold(), '');
  assert.equal(p.run(), 'true');
  // iar un focus de tastatură rămas înăuntru se păstrează
  p.doc.activeElement = p.next;
  p.rerender();
  assert.equal(p.hold(), 'tastatură');
});

test('browserul scrie diapozitivele și punctele cu aceleași funcții ca la construirea paginii: prima afișare nu se schimbă', t => {
  const p = setup(t, 12);
  assert.equal(p.stage.innerHTML, p.H.slidesHtml(p.H.pick(p.list), DG));
  assert.equal(p.dotsBox.innerHTML, p.H.dotsHtml(p.H.pick(p.list), DG, 0));
  const built = require('../lib/prerender').fillIndex(fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8'), { news: p.list });
  assert.equal(p.stage.innerHTML, built.match(/<div class="hn-stage">([\s\S]*?)<\/div>\s*<button class="hn-arrow hn-prev"/)[1]);
  assert.equal(p.dotsBox.innerHTML, built.match(/<div class="hn-dots" id="hnDots">([\s\S]*?)<\/div>/)[1]);
});

test('common.js se poate încărca și fără browser (pentru construirea paginii) și are pictogramele caruselului', () => {
  assert.equal(typeof DG.esc, 'function');
  assert.equal(typeof DG.dateText, 'function');
  assert.equal(DG.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(DG.dateText({ date: '2026-03-04' }), '4 martie 2026');
  assert.equal(DG.dateText({ date: '2026-03-04', dateLabel: 'Primăvara 2026' }), 'Primăvara 2026');
  // fiecare pictogramă folosită în carusel există în setul de pictograme
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'js', 'common.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const hero = /<div class="hero-news[\s\S]*?<p class="sr" id="hnLive"/.exec(html)[0];
  const used = [...hero.matchAll(/href="#i-([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(used)].sort(), ['chev-l', 'chev-r', 'pause']);
  for (const name of [...used, 'play', 'arrow-r']) assert.match(src, new RegExp(`(?:^|\\n)\\s+'?${name}'?: '<`), `pictograma ${name}`);
});
