'use strict';
// Dicționarele de traducere (seed/i18n/*.json) pentru rusă și engleză.
//   ui.<limba>.json       textele interfeței (butoane, titluri, etichete): „text românesc → text tradus”
//   content.<limba>.json  textele conținutului (setări, proiecte, acte, programe, documente, evenimente, noutăți)
// Textul fără traducere rămâne în română. Cheile sunt textele românești exacte (spațiile multiple se strâng).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const I18n = require('../web/assets/js/i18n.js');

const DIR = path.join(cfg.SEED_DIR, 'i18n');
const cache = new Map();

function read(kind, lang) {
  const key = `${kind}.${lang}`;
  if (!cache.has(key)) {
    const f = path.join(DIR, `${key}.json`);
    cache.set(key, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  }
  return cache.get(key);
}

function check(lang) {
  if (!I18n.isLang(lang)) throw new Error(`Limbă necunoscută: „${lang}”.`);
  return lang;
}

// Dicționar cu cheile normalizate, gata de potrivire exactă.
function normalized(kind, lang) {
  const key = `n:${kind}.${lang}`;
  if (!cache.has(key)) {
    const out = Object.create(null);
    const src = read(kind, lang);
    for (const k of Object.keys(src)) if (src[k]) out[I18n.norm(k)] = src[k];
    cache.set(key, out);
  }
  return cache.get(key);
}

function uiDict(lang) {
  return lang === I18n.DEFAULT ? null : read('ui', check(lang));
}

// Încarcă dicționarul interfeței în modulul i18n (pentru translateHtml și t).
function loadUi(lang) {
  if (lang !== I18n.DEFAULT && !I18n.hasUi(lang)) I18n.setUi(lang, read('ui', check(lang)));
}

function contentDict(lang) {
  return lang === I18n.DEFAULT ? null : normalized('content', check(lang));
}

function reset() {
  cache.clear();
}

module.exports = { uiDict, loadUi, contentDict, reset, DIR };
