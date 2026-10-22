#!/usr/bin/env node
'use strict';
// Verifică traducerile: arată textele din conținutul de pornire care au rămas în română în versiunile RU / EN.
//   node scripts/i18n-check.js          → raport (cod 0)
//   node scripts/i18n-check.js --strict → cod 1 dacă există texte netraduse
const path = require('path');
const fs = require('fs');
const I18n = require('../web/assets/js/i18n.js');
const { buildPublic } = require('../lib/public');
const i18nData = require('../lib/i18n-data');
const SEED = path.join(__dirname, '..', 'seed', 'content');

// Texte care se scriu la fel în toate limbile (nume proprii, adrese, denumiri de localități în forma lor oficială).
const SAME = /^(?:[\d\s.,:;\/–—+%()€$-]*|https?:\S+|\S+@\S+|[A-Z0-9+.\-/ ]{2,}|.*\bInterreg\b.*|.*\bURBACT\b.*)$/;

function listOf(name) { return JSON.parse(fs.readFileSync(path.join(SEED, name + '.json'), 'utf8')); }
function get(name) { const v = listOf(name); return v; }

function strings(v, out, p) {
  if (typeof v === 'string') out.push([p, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, out, p + '[' + i + ']'));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (!I18n.KEEP[k] && !I18n.SKIP[k] && k !== 'file') strings(v[k], out, p + '.' + k); });
}

function missing(lang) {
  const ro = [];
  const roData = buildPublic(get, 'ro');
  for (const k of Object.keys(roData)) if (k !== 'generatedAt' && k !== 'lastUpdated') strings(roData[k], ro, k);
  const roSet = new Set(ro.map(x => x[1]));
  const data = buildPublic(get, lang);
  const out = [];
  for (const k of Object.keys(data)) if (k !== 'generatedAt' && k !== 'lastUpdated') strings(data[k], out, k);
  const seen = new Set();
  return out.filter(([, s]) => {
    if (seen.has(s) || !roSet.has(s) || !/[A-Za-zĂÂÎȘȚăâîșț]{4}/.test(s) || SAME.test(s)) return false;
    seen.add(s);
    return true;
  });
}

if (require.main === module) {
  let bad = 0;
  for (const lang of ['ru', 'en']) {
    const m = missing(lang);
    console.log('== ' + lang + ': ' + m.length + ' text(e) rămase identice cu originalul românesc');
    m.slice(0, 60).forEach(([p, s]) => console.log('  ' + p + ': ' + s.slice(0, 100)));
    bad += m.length;
  }
  if (process.argv.includes('--strict') && bad) process.exit(1);
}
module.exports = { missing };
