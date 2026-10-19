'use strict';
// Stocare simplă în fișiere JSON (un fișier pentru fiecare colecție), cu scriere atomică.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

const COLLECTIONS = ['news', 'documents', 'events', 'legal', 'programs', 'gallery'];
const SINGLES = ['settings'];
const UPLOAD_RE = /\/uploads\/(?:img|docs)\/[\w.-]+/g;

const cache = {};
const chains = {};

const dataPath = (...p) => path.join(cfg.DATA_DIR, ...p);
const contentFile = name => dataPath('content', name + '.json');

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function init() {
  for (const d of ['content', 'uploads/img', 'uploads/docs', 'private']) fs.mkdirSync(dataPath(d), { recursive: true });
  const fresh = !fs.existsSync(contentFile('settings'));
  for (const name of [...COLLECTIONS, ...SINGLES]) {
    const file = contentFile(name);
    if (!fs.existsSync(file)) {
      const seed = path.join(cfg.SEED_DIR, 'content', name + '.json');
      if (fs.existsSync(seed)) fs.copyFileSync(seed, file);
      else fs.writeFileSync(file, SINGLES.includes(name) ? '{}' : '[]');
    }
    try {
      cache[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`Fișierul ${file} este corupt: ${e.message}`);
    }
  }
  if (fresh) {
    const seedUploads = path.join(cfg.SEED_DIR, 'uploads');
    if (fs.existsSync(seedUploads)) fs.cpSync(seedUploads, dataPath('uploads'), { recursive: true, force: false });
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
  cache.settings = { ...obj, updatedAt: new Date().toISOString() };
  await persist('settings');
  return cache.settings;
}

/* ---------- fișiere încărcate ---------- */
const filesIn = obj => new Set(JSON.stringify(obj === undefined ? null : obj).match(UPLOAD_RE) || []);

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
