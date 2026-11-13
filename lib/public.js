'use strict';
// Construiește conținutul public (fără ciorne), folosit de /api/public și de versiunea statică.

// Câmpurile vechi ale proiectelor investiționale (etapa de maturitate, starea, progresul, întârzierile, următorul pas, obiectivul economic):
// se șterg din conținutul salvat la actualizare (seed/upgrades.json, versiunea 4 și 5).
const LEGACY_INVESTMENT_FIELDS = ['cluster', 'status', 'progress', 'stage', 'refStage', 'totalStages', 'delays', 'next', 'theme'];
const I18n = require('../web/assets/js/i18n.js');
const i18nData = require('./i18n-data');

// Texte ale paginii care au fost scoase: dacă mai există într-un fișier salvat de o versiune anterioară, nu se publică
// (nota despre Regulament din „Despre direcție”; textele listei de proiecte investiționale, înlocuită de panourile care duc la site-ul cu proiecte).
const LEGACY_SETTINGS_KEYS = ['aboutNote', 'growth'];

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
  // Lista proiectelor investiționale nu se mai trimite: pagina are doar panourile care duc la site-ul cu proiecte (settings.projects),
  // iar proiectele rămân în conținutul salvat. Fără ea, datele trimise la fiecare vizită sunt cu aproximativ un sfert mai mici.
  // „seedRev” este o evidență internă a conținutului de pornire, nu un text al paginii.
  const { seedRev, ...settings } = get('settings'); // eslint-disable-line no-unused-vars
  for (const k of LEGACY_SETTINGS_KEYS) delete settings[k];

  let last = settings.updatedAt || '';
  for (const list of [news, gallery, events, documents, legal, programs]) {
    for (const x of list) if (x.updatedAt && x.updatedAt > last) last = x.updatedAt;
  }

  const data = { generatedAt: new Date().toISOString(), lastUpdated: last, settings, programs, news, documents, legal, events, gallery };
  return I18n.localize(data, lang, i18nData.contentDict(lang));
}

module.exports = { buildPublic, LEGACY_INVESTMENT_FIELDS, LEGACY_SETTINGS_KEYS };
