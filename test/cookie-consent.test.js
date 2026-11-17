'use strict';
// Fereastra de consimțământ pentru fișierele cookie (Legea nr. 195 din 25.07.2024): alegerea, expirarea, harta Google și textele paginii.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CC = require('../web/assets/js/cookie-consent.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'web', f), 'utf8');
const html = read('index.html');
const css = read('assets/css/site.css');
const site = read('assets/js/site.js');
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);

test('alegerea: „acceptă toate”, „respinge toate” și alegerea pe categorii', () => {
  assert.deepEqual(CC.make('all', NOW).c, { analytics: true, external: true });
  assert.deepEqual(CC.make('none', NOW).c, { analytics: false, external: false });
  assert.deepEqual(CC.make({ external: true }, NOW).c, { analytics: false, external: true });
  // numai valoarea „true” contează; nimic nu este pre-bifat
  assert.deepEqual(CC.make({ analytics: 'da', external: 1 }, NOW).c, { analytics: false, external: false });
  assert.equal(CC.make('all', NOW).v, CC.VERSION);
});

test('alegerea salvată: se citește înapoi; formatele greșite, versiunea veche, alegerea expirată sau din viitor înseamnă „nu s-a ales”', () => {
  const ok = JSON.stringify(CC.make({ external: true }, NOW - 1000));
  assert.deepEqual(CC.parse(ok, NOW).c, { analytics: false, external: true });
  assert.equal(CC.parse(null, NOW), null);
  assert.equal(CC.parse('nu e json', NOW), null);
  assert.equal(CC.parse('[]', NOW), null);
  assert.equal(CC.parse(JSON.stringify({ v: CC.VERSION + 1, t: NOW, c: { external: true } }), NOW), null, 'altă versiune a regulilor');
  assert.equal(CC.parse(JSON.stringify(CC.make('all', NOW - CC.MAX_AGE - 1)), NOW), null, 'peste 12 luni');
  assert.ok(CC.parse(JSON.stringify(CC.make('all', NOW - CC.MAX_AGE + 1000)), NOW), 'chiar înainte de 12 luni');
  assert.equal(CC.parse(JSON.stringify(CC.make('all', NOW + 3600 * 1000)), NOW), null, 'dată din viitor');
  // o categorie necunoscută sau lipsă nu devine „acceptată”
  assert.deepEqual(CC.parse(JSON.stringify({ v: CC.VERSION, t: NOW, c: { analytics: true, ads: true } }), NOW).c, { analytics: true, external: false });
});

test('pagina: banda și fereastra de setări, cu „Respinge” la fel de la îndemână ca „Acceptă”, și linkul din subsol', () => {
  assert.match(html, /<div class="cc" id="cc" role="region" aria-labelledby="ccTitle" hidden>/);
  const band = /<div class="cc" id="cc"[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0];
  assert.match(band, /data-cc="reject"[^>]*>Respinge toate/);
  assert.match(band, /data-cc="open"[^>]*>Configurează/);
  assert.match(band, /data-cc="accept"[^>]*>Acceptă toate/);
  assert.match(band, /class="btn btn-primary" type="button" data-cc="reject"/, 'același aspect ca „Acceptă toate”');
  assert.match(band, /Legii nr\. 195 din 25\.07\.2024/);
  assert.match(html, /<dialog class="dlg cc-dlg" id="ccDlg" aria-labelledby="ccDlgTitle">/);
  // categoriile care nu sunt strict necesare sunt oprite implicit (fără „checked”)
  for (const id of ['cc-analytics', 'cc-external']) {
    const m = new RegExp(`<input type="checkbox" id="${id}"[^>]*>`).exec(html);
    assert.ok(m, id);
    assert.doesNotMatch(m[0], /checked/);
    assert.match(m[0], /aria-label="[^"]+"/);
  }
  assert.match(html, /<button class="foot-link" type="button" data-cc="open">Setări cookie<\/button>/);
  // scriptul se încarcă înaintea celui al paginii
  assert.ok(html.indexOf('assets/js/cookie-consent.js') > 0 && html.indexOf('assets/js/cookie-consent.js') < html.indexOf('assets/js/site.js'));
});

test('stiluri: banda nu acoperă butonul „înapoi sus”, comutatoarele se văd și de la tastatură, nimic nu se tipărește', () => {
  assert.match(css, /body\.cc-open \.totop\{display:none\}/);
  assert.match(css, /\.cc-sw input:focus-visible\+\.cc-sw-ui\{outline/);
  assert.match(css, /\.cc,\.cc-dlg,\.foot-link,/, 'ascunse la tipărire');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.cc-sw-ui/);
});

test('harta Google se încarcă automat numai cu acordul pentru „conținut al altor furnizori”; retragerea acordului o scoate', () => {
  assert.match(site, /\(mapOn \|\| consent\('external'\)\) \? mapFrame\(c\.mapEmbed\) : mapGate\(c\)/);
  assert.match(site, /addEventListener\('dg:consent'/);
  assert.match(site, /if \(!consent\('external'\)\) mapOn = false;/);
});

test('traducerile ruse și engleze ale textelor din fereastra de cookie există', () => {
  for (const l of ['ru', 'en']) {
    const d = JSON.parse(read('../seed/i18n/ui.' + l + '.json'));
    for (const k of ['Fișiere cookie', 'Respinge toate', 'Acceptă toate', 'Configurează', 'Setări cookie', 'Salvează alegerea', 'Strict necesare', 'Mereu active', 'Conținut al altor furnizori', 'Detalii și politica cookie']) {
      assert.ok(d[k] && d[k] !== k, `${l}: ${k}`);
    }
  }
});
