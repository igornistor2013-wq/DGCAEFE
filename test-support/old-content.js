'use strict';
// Conținutul pe care îl avea cineva care folosise deja pagina înainte de versiunea 2 a conținutului de pornire
// (fără colecția „investments”, fără cheia „seedRev”, cu 8 acte normative și cu textele implicite vechi).
// Este reconstituit din conținutul de pornire actual și din seed/upgrades.json, ca testele să nu depindă de un fișier vechi păstrat separat.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NAMES = ['news', 'documents', 'events', 'legal', 'programs', 'gallery', 'investments', 'settings'];
// Cheile pe care le avea „settings” în versiunea 1.
const REV1_SETTINGS = ['aboutP1', 'aboutP2', 'contact', 'duties', 'footerNote', 'heroLead', 'heroTitle', 'orgName', 'parentName', 'quickLinks', 'updatedAt'];

const clone = v => JSON.parse(JSON.stringify(v));
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

const seedContent = () => Object.fromEntries(NAMES.map(n => [n, readJson('seed', 'content', n + '.json')]));
const seedUpgrades = () => readJson('seed', 'upgrades.json');

/* `edits`: ce ar fi modificat administratorul în „settings” (se pun peste valorile implicite vechi).
   Rezultatul are doar fișierele pe care le crease versiunea 1 (fără „investments”). */
function oldContent(edits = {}) {
  const seed = seedContent();
  const step = seedUpgrades().find(u => u.rev === 2);
  const added = new Set(step.add.legal);
  const settings = {};
  for (const k of REV1_SETTINGS) settings[k] = clone(seed.settings[k]);
  for (const [k, olds] of Object.entries(step.settings)) settings[k] = clone(olds[0]);
  settings.updatedAt = '2026-10-10T08:00:00.000Z';
  return {
    news: seed.news,
    documents: seed.documents,
    events: seed.events,
    programs: seed.programs,
    gallery: seed.gallery,
    legal: seed.legal.filter(x => !added.has(x.id)),
    settings: { ...settings, ...clone(edits) }
  };
}

// Scrie conținutul într-un folder de date („<dir>/content/<nume>.json”), în formatul serverului.
function writeContent(dir, content) {
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  for (const [name, value] of Object.entries(content)) fs.writeFileSync(path.join(dir, 'content', name + '.json'), JSON.stringify(value, null, 2) + '\n');
}

module.exports = { seedContent, seedUpgrades, oldContent, writeContent, REV1_SETTINGS, NAMES };
