'use strict';
// Construiește conținutul public (fără ciorne), folosit de /api/public și de versiunea statică.

function buildPublic(get) {
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const news = get('news').filter(n => n.published !== false).slice().sort(byDateDesc);
  const gallery = get('gallery').slice().sort(byDateDesc);
  const events = get('events').slice();
  const documents = get('documents').slice();
  const legal = get('legal').slice();
  const programs = get('programs').slice().sort(byOrder);
  const investments = get('investments').filter(p => p.published !== false).slice().sort((a, b) => byOrder(a, b) || String(a.name).localeCompare(String(b.name), 'ro'));
  // „seedRev” este o evidență internă a conținutului de pornire, nu un text al paginii.
  const { seedRev, ...settings } = get('settings'); // eslint-disable-line no-unused-vars

  let last = settings.updatedAt || '';
  for (const list of [news, gallery, events, documents, legal, programs, investments]) {
    for (const x of list) if (x.updatedAt && x.updatedAt > last) last = x.updatedAt;
  }

  return { generatedAt: new Date().toISOString(), lastUpdated: last, settings, programs, investments, news, documents, legal, events, gallery };
}

module.exports = { buildPublic };
