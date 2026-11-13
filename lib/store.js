'use strict';
// Stocare simplă în fișiere JSON (un fișier pentru fiecare colecție), cu scriere atomică.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { filesIn } = require('../web/assets/js/admin-schemas.js');
const overlay = require('../web/assets/js/content-overlay.js');

const { COLLECTIONS, SINGLES, NAMES } = overlay;

const cache = {};
const chains = {};

const dataPath = (...p) => path.join(cfg.DATA_DIR, ...p);
const contentFile = name => dataPath('content', name + '.json');

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Fișierul ${file} este corupt: ${e.message}`);
  }
}

const seedPath = (...p) => path.join(cfg.SEED_DIR, ...p);

// Ce a adus o versiune nouă a conținutului de pornire (vezi web/assets/js/content-overlay.js).
function readUpgrades() {
  const file = seedPath('upgrades.json');
  return fs.existsSync(file) ? readJson(file) : [];
}

function writeNow(name, value) {
  const file = contentFile(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function init() {
  for (const d of ['content', 'uploads/img', 'uploads/docs', 'private']) fs.mkdirSync(dataPath(d), { recursive: true });
  const fresh = !fs.existsSync(contentFile('settings'));
  const stored = {};
  const seed = {};
  for (const name of NAMES) {
    if (fs.existsSync(contentFile(name))) stored[name] = readJson(contentFile(name));
    if (fs.existsSync(seedPath('content', name + '.json'))) seed[name] = readJson(seedPath('content', name + '.json'));
  }
  // Conținutul salvat rămâne al administratorului; din conținutul de pornire se completează doar ce lipsește sau ce nu a fost modificat.
  const { content, changed } = overlay.apply(stored, seed, readUpgrades());
  for (const name of NAMES) {
    cache[name] = content[name];
    if (changed.has(name)) writeNow(name, content[name]);
  }
  // Fișierele încărcate din conținutul de pornire (imaginile de exemplu): toate la prima pornire, apoi doar cele de care a ajuns să depindă conținutul.
  const seedUploads = seedPath('uploads');
  if (fs.existsSync(seedUploads)) {
    if (fresh) fs.cpSync(seedUploads, dataPath('uploads'), { recursive: true, force: false });
    else if (changed.size) {
      for (const f of allReferenced()) {
        const src = seedPath(f.slice(1));
        const dst = dataPath(f.slice(1));
        if (f.startsWith('/uploads/') && fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      }
    }
  }
}

function persist(name) {
  const data = JSON.stringify(cache[name], null, 2) + '\n';
  const file = contentFile(name);
  const tmp = `${file}.${process.pid}.tmp`;
  const job = (chains[name] || Promise.resolve()).catch(() => {}).then(async () => {
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, file);
  });
  chains[name] = job;
  return job;
}

const list = name => cache[name];
const find = (name, id) => cache[name].find(x => x.id === id);

async function create(name, item) {
  const now = new Date().toISOString();
  const rec = { id: newId(), ...item, createdAt: now, updatedAt: now };
  cache[name].unshift(rec);
  await persist(name);
  return rec;
}

async function update(name, id, patch) {
  const i = cache[name].findIndex(x => x.id === id);
  if (i < 0) return null;
  const old = cache[name][i];
  const rec = { ...old, ...patch, id: old.id, createdAt: old.createdAt, updatedAt: new Date().toISOString() };
  cache[name][i] = rec;
  await persist(name);
  return rec;
}

async function remove(name, id) {
  const i = cache[name].findIndex(x => x.id === id);
  if (i < 0) return false;
  cache[name].splice(i, 1);
  await persist(name);
  return true;
}

const getSettings = () => cache.settings;

async function setSettings(obj) {
  // „seedRev” nu vine de la formular: arată de la ce versiune a conținutului de pornire provin textele salvate.
  const keep = cache.settings && cache.settings.seedRev !== undefined ? { seedRev: cache.settings.seedRev } : {};
  cache.settings = { ...obj, ...keep, updatedAt: new Date().toISOString() };
  await persist('settings');
  return cache.settings;
}

/* ---------- fișiere încărcate ---------- */
function allReferenced() {
  const used = new Set();
  for (const name of [...COLLECTIONS, ...SINGLES]) for (const f of filesIn(cache[name])) used.add(f);
  return used;
}

// Șterge de pe disc fișierele din `candidates` care nu mai sunt folosite nicăieri.
async function pruneFiles(candidates) {
  const used = allReferenced();
  const root = dataPath('uploads') + path.sep;
  for (const f of candidates) {
    if (used.has(f)) continue;
    const abs = path.join(cfg.DATA_DIR, f);
    if (!abs.startsWith(root)) continue;
    try {
      await fsp.unlink(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Nu am putut șterge', f, e.message);
    }
  }
}

// Fișierele încărcate dar nefolosite niciodată (ex.: formular închis după încărcare) se șterg după o zi.
async function sweepOrphans(minAgeMs = 24 * 3600 * 1000) {
  const used = allReferenced();
  let removed = 0;
  for (const sub of ['img', 'docs']) {
    const dir = dataPath('uploads', sub);
    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (used.has(`/uploads/${sub}/${n}`)) continue;
      const abs = path.join(dir, n);
      try {
        const st = await fsp.stat(abs);
        if (st.isFile() && Date.now() - st.mtimeMs > minAgeMs) {
          await fsp.unlink(abs);
          removed++;
        }
      } catch {
        /* fișierul a dispărut între timp */
      }
    }
  }
  return removed;
}

module.exports = { COLLECTIONS, init, list, find, create, update, remove, getSettings, setSettings, filesIn, pruneFiles, sweepOrphans, dataPath };
