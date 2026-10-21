'use strict';
// Derulatorul de noutăți din partea de sus a primei pagini (web/assets/js/hero-news.js): alegerea celor mai noi 10, textul
// diapozitivelor, schimbarea la 10 secunde, butoanele, pauza, mouse-ul și tastatura, pagina ascunsă. Rulează fără browser,
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
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, extra) { for (const fn of this.listeners[type] || []) fn(Object.assign({ type, target: this, relatedTarget: null }, extra)); }
  querySelector(sel) { return this.refs[sel] || null; }
  contains(el) { return el === this || this.members.some(m => m === el || m.children.includes(el)); }
  closest(sel) { return sel === 'button' && this.isButton ? this : null; }
  matches(sel) { return sel === ':focus-visible' ? this.focusVisible : false; }
  set innerHTML(html) {
    this.html = html;
    this.children = Array.from({ length: (html.match(/class="hn-slide/g) || []).length }, () => new El());
  }
  get innerHTML() { return this.html || ''; }
}

// pagina: blocul, textul de prezentare, cele trei butoane, contorul, mesajul pentru cititoarele de ecran, bara de progres
function makePage() {
  const box = new El('heroNews');
  const lead = new El('introLead');
  const stage = new El();
  const prev = new El('hnPrev');
  const play = new El('hnPlay');
  const next = new El('hnNext');
  for (const b of [prev, play, next]) b.isButton = true;
  const use = new El();
  use.setAttribute('href', '#i-pause');
  play.refs.use = use;
  play.setAttribute('aria-label', 'Oprește derularea automată');
  const num = new El('hnNum');
  const more = new El('hnMore');
  const live = new El('hnLive');
  const bar = new El();
  const total = new El('hnTotal');
  Object.assign(box.refs, { '.hn-stage': stage, '#hnNum': num, '#hnMore': more, '#hnPlay': play, '#hnLive': live, '.hn-progress': bar, '#hnTotal': total });
  box.members = [stage, prev, play, next, num, more, live, bar, total, use];
  const outside = new El('afara');
  return { box, lead, stage, prev, play, next, use, num, more, live, bar, total, outside };
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
  H.render(page.box, page.lead, list, DG);
  const ctx = {
    H, doc, list, ...page,
    tick: ms => mock.timers.tick(ms),
    active: () => page.stage.children.findIndex(c => c.classList.contains('is-active')),
    click: b => page.box.dispatch('click', { target: b }),
    hold: () => page.box.getAttribute('data-hold'),
    run: () => page.box.getAttribute('data-run'),
    rerender: l => H.render(page.box, page.lead, l || list, DG)
  };
  return ctx;
}

test('pick: primele 10 în ordinea primită, fără listă nu se alege nimic', () => {
  const H = fresh();
  assert.equal(H.MAX, 10);
  assert.equal(H.SECONDS, 10);
  const list = news(15);
  assert.deepEqual(H.pick(list).map(n => n.id), list.slice(0, 10).map(n => n.id));
  assert.equal(H.pick(list.slice(0, 3)).length, 3);
  assert.notEqual(H.pick(list), list, 'o copie, lista originală nu se atinge');
  assert.equal(list.length, 15);
  for (const x of [null, undefined, [], {}]) assert.deepEqual(H.pick(x), []);
});

test('diapozitivul: titlul duce la noutate, data este <time>, eticheta și rezumatul apar doar dacă există, textele sunt scrise sigur', () => {
  const H = fresh();
  const [a, b] = news(2);
  const html = H.slidesHtml([a, b], DG);
  const slides = html.split('<div class="hn-slide').slice(1);
  assert.equal(slides.length, 2);
  assert.ok(slides[0].startsWith(' is-active">'), 'prima este cea vizibilă');
  assert.ok(slides[1].startsWith('">'), 'celelalte sunt ascunse');
  assert.match(slides[0], /<span class="hn-tag">Apel<\/span><time datetime="2026-03-28">28 martie 2026<\/time>/);
  assert.match(slides[0], /<p class="hn-title"><a href="#stire\/n1">Noutatea 1<\/a><\/p>/);
  assert.match(slides[0], /<p class="hn-sum">Rezumat 1<\/p>/);
  assert.doesNotMatch(slides[1], /hn-tag|hn-sum/, 'fără etichetă și fără rezumat nu se scriu elemente goale');
  // o noutate fără dată și fără nimic altceva decât titlul
  assert.equal(H.slidesHtml([{ id: 'x', title: 'Doar titlul' }], DG), '<div class="hn-slide is-active"><p class="hn-title"><a href="#stire/x">Doar titlul</a></p></div>');
  // nimic din text nu devine cod
  const evil = H.slidesHtml([{ id: 'a"b', title: '<img src=x onerror=alert(1)>', tag: '<b>', summary: '</p><script>1</script>', date: '2026-01-02' }], DG);
  assert.doesNotMatch(evil, /<img|<b>|<script/);
  assert.match(evil, /href="#stire\/a&quot;b"/);
  assert.equal(H.href({ id: 'n7' }), '#stire/n7');
  assert.equal(H.slidesHtml([], DG), '');
});

test('din 12 noutăți se derulează 10, la 10 secunde, cu întoarcere la prima; schimbările automate nu sunt anunțate', t => {
  const p = setup(t, 12);
  assert.equal(p.stage.children.length, 10);
  assert.equal(p.total.textContent, '10');
  assert.equal(p.active(), 0);
  assert.equal(p.num.textContent, '1');
  assert.equal(p.more.getAttribute('href'), '#stire/n1');
  assert.equal(p.lead.hidden, true, 'textul de prezentare lasă locul noutăților');
  assert.equal(p.box.hidden, false);
  assert.equal(p.run(), 'true');
  assert.equal(p.box.style.props['--hn-ms'], '10000ms');
  p.tick(9999);
  assert.equal(p.active(), 0, 'la 9,999 secunde încă prima');
  p.tick(1);
  assert.equal(p.active(), 1, 'la 10 secunde a doua');
  assert.equal(p.num.textContent, '2');
  assert.equal(p.more.getAttribute('href'), '#stire/n2');
  for (let i = 2; i < 10; i++) {
    p.tick(10000);
    assert.equal(p.active(), i);
    assert.equal(p.num.textContent, String(i + 1));
  }
  p.tick(10000);
  assert.equal(p.active(), 0, 'după a 10-a, din nou prima');
  assert.equal(p.live.textContent, '', 'cititoarele de ecran nu sunt întrerupte la fiecare 10 secunde');
  assert.equal(p.bar.classList.contains('run'), true, 'bara de progres pornește de la zero la fiecare schimbare');
});

test('butoanele „înapoi” și „înainte” trec în cerc, anunță schimbarea și repornesc numărătoarea', t => {
  const p = setup(t, 5);
  p.click(p.next);
  assert.equal(p.active(), 1);
  assert.equal(p.live.textContent, 'Noutatea 2 din 5: Noutatea 2');
  p.click(p.prev);
  p.click(p.prev);
  assert.equal(p.active(), 4, 'înapoi de la prima duce la ultima');
  assert.equal(p.live.textContent, 'Noutatea 5 din 5: Noutatea 5');
  p.click(p.next);
  assert.equal(p.active(), 0, 'înainte de la ultima duce la prima');
  // după o schimbare făcută de vizitator, următoarea vine abia după alte 10 secunde
  p.tick(9000);
  p.click(p.next);
  p.tick(9999);
  assert.equal(p.active(), 1);
  p.tick(1);
  assert.equal(p.active(), 2);
  // un clic pe altceva din bloc nu face nimic
  p.click(p.outside);
  assert.equal(p.active(), 2);
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
  assert.equal(p.active(), 0, 'în pauză nu se schimbă nimic, oricât ar trece');
  p.click(p.next);
  assert.equal(p.active(), 1, 'în pauză se poate trece manual');
  p.tick(60000);
  assert.equal(p.active(), 1, 'și rămâne în pauză');
  p.click(p.play);
  assert.equal(p.play.getAttribute('aria-label'), 'Oprește derularea automată');
  assert.equal(p.use.getAttribute('href'), '#i-pause');
  assert.equal(p.live.textContent, 'Derularea automată a fost pornită.');
  assert.deepEqual([p.run(), p.hold()], ['true', '']);
  p.tick(9999);
  assert.equal(p.active(), 1);
  p.tick(1);
  assert.equal(p.active(), 2);
});

test('mouse-ul deasupra oprește derularea; atingerea cu degetul nu; dacă browserul nu mai anunță plecarea mouse-ului, mișcarea lui corectează starea', t => {
  const p = setup(t, 4);
  p.box.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(p.hold(), 'mouse');
  p.tick(60000);
  assert.equal(p.active(), 0, 'cu mouse-ul deasupra nu se schimbă');
  p.tick(0);
  p.box.dispatch('pointerleave', { pointerType: 'mouse' });
  assert.equal(p.hold(), '');
  p.tick(9999);
  assert.equal(p.active(), 0, 'după plecare, 10 secunde întregi');
  p.tick(1);
  assert.equal(p.active(), 1);

  // ecranele tactile nu au „deasupra”: ar rămâne blocat după o atingere
  p.box.dispatch('pointerenter', { pointerType: 'touch' });
  p.box.dispatch('pointerenter', { pointerType: 'pen' });
  assert.equal(p.hold(), '');

  // „pointerleave” pierdut (de exemplu, pictograma de sub cursor a fost înlocuită): mișcarea cursorului în afara blocului eliberează derularea
  p.box.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(p.hold(), 'mouse');
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.next });
  assert.equal(p.hold(), 'mouse', 'mișcare în interior: rămâne oprită');
  p.doc.dispatch('pointermove', { pointerType: 'touch', target: p.outside });
  assert.equal(p.hold(), 'mouse', 'mișcarea unui deget nu schimbă nimic');
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.outside });
  assert.equal(p.hold(), '', 'mouse-ul în afara blocului: derularea reia');
  p.tick(10000);
  assert.equal(p.active(), 2);
  // mouse-ul poate intra și prin mișcare (fără „pointerenter”)
  p.doc.dispatch('pointermove', { pointerType: 'mouse', target: p.stage.children[0] });
  assert.equal(p.hold(), 'mouse');
});

test('focusul de la tastatură înăuntru oprește derularea; focusul dat de un clic cu mouse-ul nu; trecerea între butoane nu o repornește', t => {
  const p = setup(t, 4);
  p.next.focusVisible = false; // focus dat de clic, nu de tastatură
  p.box.dispatch('focusin', { target: p.next });
  assert.equal(p.hold(), '', 'clicul cu mouse-ul pe un buton nu oprește derularea');
  p.next.focusVisible = true;
  p.box.dispatch('focusin', { target: p.prev });
  assert.equal(p.hold(), 'tastatură');
  p.tick(60000);
  assert.equal(p.active(), 0);
  // focusul trece de pe un buton pe altul din bloc: rămâne oprită
  p.box.dispatch('focusout', { target: p.prev, relatedTarget: p.next });
  p.box.dispatch('focusin', { target: p.next });
  assert.equal(p.hold(), 'tastatură');
  // focusul iese din bloc
  p.box.dispatch('focusout', { target: p.next, relatedTarget: null });
  assert.equal(p.hold(), '');
  p.tick(10000);
  assert.equal(p.active(), 1);
});

test('cât timp pagina este ascunsă (altă filă) nu se schimbă nimic; la întoarcere numărătoarea reîncepe', t => {
  const p = setup(t, 4);
  p.tick(7000);
  p.doc.hidden = true;
  p.doc.dispatch('visibilitychange');
  assert.deepEqual([p.run(), p.hold()], ['false', 'ascunsă']);
  p.tick(60000);
  assert.equal(p.active(), 0);
  p.doc.hidden = false;
  p.doc.dispatch('visibilitychange');
  assert.deepEqual([p.run(), p.hold()], ['true', '']);
  p.tick(9999);
  assert.equal(p.active(), 0);
  p.tick(1);
  assert.equal(p.active(), 1);
});

test('o singură noutate: se vede, fără butoane și fără schimbare', t => {
  const one = setup(t, 1);
  assert.equal(one.stage.children.length, 1);
  assert.equal(one.box.classList.contains('hn-single'), true);
  assert.equal(one.total.textContent, '1');
  assert.equal(one.run(), 'false');
  one.tick(60000);
  assert.equal(one.active(), 0);
  assert.equal(one.lead.hidden, true);
  assert.equal(one.box.hidden, false);
});

test('nicio noutate: rămâne textul de prezentare, fără derulator și fără numărătoare', t => {
  const none = setup(t, 0);
  assert.equal(none.box.hidden, true);
  assert.equal(none.lead.hidden, false, 'fără noutăți se vede textul de prezentare');
  assert.equal(none.stage.children.length, 0);
  assert.equal(none.run(), null, 'nu pornește nicio numărătoare');
  none.tick(60000);
  assert.equal(none.active(), -1);
});

test('rescrierea paginii (după ce se află că cel care o vede este administrator) păstrează noutatea afișată și nu dublează ascultătorii', t => {
  const p = setup(t, 6);
  p.click(p.next);
  p.click(p.next);
  p.click(p.next);
  assert.equal(p.active(), 3);
  p.rerender();
  assert.equal(p.active(), 3, 'rămâne la aceeași noutate');
  assert.equal(p.num.textContent, '4');
  assert.equal(p.box.listeners.click.length, 1);
  assert.equal(p.box.listeners.pointerenter.length, 1);
  assert.equal(p.doc.listeners.pointermove.length, 1);
  assert.equal(p.doc.listeners.visibilitychange.length, 1);
  p.tick(9999);
  assert.equal(p.active(), 3);
  p.tick(1);
  assert.equal(p.active(), 4, 'numărătoarea reîncepe o singură dată (un singur ceas)');

  // mai puține noutăți decât indicele curent: se revine în limite
  p.rerender(news(3));
  assert.equal(p.stage.children.length, 3);
  assert.equal(p.active(), 2);
  assert.equal(p.total.textContent, '3');
  // ultima noutate este ștearsă: rămâne textul de prezentare, iar ceasul se oprește
  p.rerender([]);
  assert.equal(p.box.hidden, true);
  assert.equal(p.lead.hidden, false);
  const before = p.active();
  p.tick(60000);
  assert.equal(p.active(), before, 'ceasul s-a oprit: nimic nu se mai schimbă');
  // și revin
  p.rerender(news(2));
  assert.equal(p.box.hidden, false);
  assert.equal(p.lead.hidden, true);
  assert.equal(p.stage.children.length, 2);
});

test('la rescrierea paginii, focusul rămas pe un element dispărut nu ține derularea oprită', t => {
  const p = setup(t, 4);
  p.prev.focusVisible = true;
  p.doc.activeElement = p.prev;
  p.box.dispatch('focusin', { target: p.prev });
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

test('browserul scrie diapozitivele cu aceeași funcție ca la construirea paginii: prima afișare nu se schimbă', t => {
  const p = setup(t, 12);
  assert.equal(p.stage.innerHTML, p.H.slidesHtml(p.H.pick(p.list), DG));
  assert.equal(p.stage.innerHTML, require('../lib/prerender').fillIndex(fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8'), { news: p.list }).match(/<div class="hn-stage">([\s\S]*?)<\/div>\s*<div class="hn-bar">/)[1]);
});

test('common.js se poate încărca și fără browser (pentru construirea paginii) și are pictogramele derulatorului', () => {
  assert.equal(typeof DG.esc, 'function');
  assert.equal(typeof DG.dateText, 'function');
  assert.equal(DG.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(DG.dateText({ date: '2026-03-04' }), '4 martie 2026');
  assert.equal(DG.dateText({ date: '2026-03-04', dateLabel: 'Primăvara 2026' }), 'Primăvara 2026');
  // fiecare pictogramă folosită în partea de sus a paginii există în setul de pictograme
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'js', 'common.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
  const hero = /<section class="hero-news"[\s\S]*?<\/section>/.exec(html)[0];
  const used = [...hero.matchAll(/href="#i-([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(used)].sort(), ['arrow-r', 'chev-l', 'chev-r', 'pause']);
  for (const name of [...used, 'play']) assert.match(src, new RegExp(`(?:^|\\n)\\s+'?${name}'?: '<`), `pictograma ${name}`);
});
