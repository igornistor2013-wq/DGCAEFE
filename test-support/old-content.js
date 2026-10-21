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

// Proiectele investiționale așa cum le salva versiunea 3 a conținutului de pornire: cu etapă de maturitate, stare, progres și texte despre
// stadiu și întârzieri, fără partenerul de finanțare, localizarea sau rezultatele. Sunt reconstituite din conținutul de pornire actual.
const REV3_CLUSTERS = ['initiere', 'fezabilitate', 'maturitate', 'negociere', 'semnat'];
function rev3Investments() {
  return seedContent().investments.map((p, i) => ({
    id: p.id,
    order: p.order,
    name: 'Denumire veche ' + p.order,
    ministry: p.ministry,
    amount: p.amount,
    currency: p.currency,
    amountQual: p.amountQual,
    cluster: REV3_CLUSTERS[i % REV3_CLUSTERS.length],
    status: i % 4 === 0 ? 'termen' : 'intarziere',
    progress: 40 + i,
    stage: 30 + i,
    refStage: 35 + i,
    totalStages: 77,
    text: 'Stadiul actual al proiectului ' + p.order + '.',
    delays: 'Etape în întârziere:\n1. Scrisoarea de angajament',
    next: 'Pasul următor al proiectului ' + p.order + '.',
    links: [],
    published: true,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z'
  }));
}

/* Tot conținutul, așa cum îl avea cineva care folosea versiunea 3 (proiecte cu stare și progres, textele secțiunii „Investiții” implicite din
   acea versiune). `edits`: ce ar fi modificat administratorul în „settings”. */
function rev3Content(edits = {}) {
  const seed = seedContent();
  const growth = clone(seedUpgrades().find(u => u.rev === 4).settings.growth[1]);
  return { ...seed, investments: rev3Investments(), settings: { ...clone(seed.settings), seedRev: 3, growth, ...clone(edits) } };
}

/* Tot conținutul, așa cum îl avea cineva care folosea versiunea 4: proiectele aveau și „obiectivul economic” (theme), introducerea secțiunii
   „Investiții” vorbea despre cele cinci obiective, iar în „Despre direcție” exista nota despre Regulament (aboutNote). Restul este conținutul
   de pornire actual. `edits`: ce ar fi modificat administratorul în „settings”. */
const REV4_THEMES = { export: [3, 7, 8, 9], energie: [12, 13, 14, 16], agricultura: [2, 4, 17], cunoastere: [1, 5, 6, 11], social: [10, 15, 18, 19] };
const REV4_ABOUT_NOTE = 'Informațiile din această secțiune provin din Regulamentul de activitate al Direcției generale, aprobat de secretarul general al Guvernului în aprilie 2026. '
  + 'Activitatea Direcției se desfășoară în conformitate cu Hotărârea Guvernului nr. 377/2018, Legea nr. 181/2014 privind finanțele publice și responsabilitatea bugetar-fiscală, '
  + 'Legea nr. 595/1999 privind tratatele internaționale și celelalte acte din secțiunea „Cadrul legal”.';
function rev4Investments() {
  const themeOf = order => Object.keys(REV4_THEMES).find(t => REV4_THEMES[t].includes(order));
  return seedContent().investments.map(p => ({ ...p, theme: themeOf(p.order) }));
}
function rev4Content(edits = {}) {
  const seed = seedContent();
  const growth = clone(seedUpgrades().find(u => u.rev === 5).settings.growth[0]);
  return { ...seed, investments: rev4Investments(), settings: { ...clone(seed.settings), seedRev: 4, growth, aboutNote: REV4_ABOUT_NOTE, ...clone(edits) } };
}

// Scrie conținutul într-un folder de date („<dir>/content/<nume>.json”), în formatul serverului.
function writeContent(dir, content) {
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  for (const [name, value] of Object.entries(content)) fs.writeFileSync(path.join(dir, 'content', name + '.json'), JSON.stringify(value, null, 2) + '\n');
}

module.exports = { seedContent, seedUpgrades, oldContent, rev3Content, rev3Investments, rev4Content, rev4Investments, REV4_THEMES, REV4_ABOUT_NOTE, writeContent, REV1_SETTINGS, NAMES };
