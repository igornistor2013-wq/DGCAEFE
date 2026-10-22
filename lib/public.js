'use strict';
// Construiește conținutul public (fără ciorne), folosit de /api/public și de versiunea statică.

// Proiectele investiționale publică doar date generale. Câmpurile pe care le aveau înainte (etapa de maturitate, starea,
// progresul, întârzierile, următorul pas, obiectivul economic) nu ajung niciodată la vizitatori, chiar dacă mai există în conținutul salvat.
const LEGACY_INVESTMENT_FIELDS = ['cluster', 'status', 'progress', 'stage', 'refStage', 'totalStages', 'delays', 'next', 'theme'];
const I18n = require('../web/assets/js/i18n.js');
const i18nData = require('./i18n-data');

function generalOnly(p) {
  const out = { ...p };
  for (const k of LEGACY_INVESTMENT_FIELDS) delete out[k];
  return out;
}

// Texte ale paginii care au fost scoase: dacă mai există într-un fișier salvat de o versiune anterioară, nu se publică
// (nota despre Regulament din „Despre direcție”).
const LEGACY_SETTINGS_KEYS = ['aboutNote'];

// `lang`: ro (implicit), ru sau en. Pentru ru/en textele se traduc cu dicționarul conținutului (seed/i18n), iar traducerile scrise în
// administrare (câmpul `tr` al fiecărui element) au prioritate; ce nu are traducere rămâne în română.
function buildPublic(get, lang = I18n.DEFAULT) {
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const news = get('news').filter(n => n.published !== false).slice().sort(byDateDesc);
  const gallery = get('gallery').slice().sort(byDateDesc);
  const events = get('events').slice();
  const documents = get('documents').slice();
  const legal = get('legal').slice();
  const programs = get('programs').slice().sort(byOrder);
  const investments = get('investments').filter(p => p.published !== false).map(generalOnly).sort((a, b) => byOrder(a, b) || String(a.name).localeCompare(String(b.name), 'ro'));
  // „seedRev” este o evidență internă a conținutului de pornire, nu un text al paginii.
  const { seedRev, ...settings } = get('settings'); // eslint-disable-line no-unused-vars
  for (const k of LEGACY_SETTINGS_KEYS) delete settings[k];

  let last = settings.updatedAt || '';
  for (const list of [news, gallery, events, documents, legal, programs, investments]) {
    for (const x of list) if (x.updatedAt && x.updatedAt > last) last = x.updatedAt;
  }

  const data = { generatedAt: new Date().toISOString(), lastUpdated: last, settings, programs, investments, news, documents, legal, events, gallery };
  return I18n.localize(data, lang, i18nData.contentDict(lang));
}

module.exports = { buildPublic, LEGACY_INVESTMENT_FIELDS, LEGACY_SETTINGS_KEYS };
