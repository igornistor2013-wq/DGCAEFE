'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const store = require('./store');
const auth = require('./auth');
const audit = require('./audit');
const schemas = require('./schemas');
const uploads = require('./uploads');
const staticSite = require('./static-site');
const cfg = require('./config');
const { buildPublic } = require('./public');
const I18n = require('../web/assets/js/i18n.js');
const { HttpError } = require('./errors');

function buildApi() {
  const api = express.Router();

  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });
  api.use(express.json({ limit: '1mb' }));
  api.use(auth.attach);

  /* ---------- public ---------- */
  api.get('/public', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(buildPublic(store.list, I18n.isLang(req.query.lang) ? req.query.lang : I18n.DEFAULT));
  });

  /* ---------- sesiune ---------- */
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Prea multe încercări de autentificare. Încercați din nou peste 15 minute.' }
  });

  // Datele de care panoul de administrare are nevoie ca să valideze din timp încărcările și parolele.
  const sessionInfo = (user, csrf) => ({
    authenticated: true,
    user,
    csrf,
    limits: { imageMb: cfg.MAX_IMAGE_MB, docMb: cfg.MAX_DOC_MB },
    minPassword: auth.MIN_PASSWORD
  });

  api.get('/session', (req, res) => {
    res.json(req.session ? sessionInfo(req.session.user, req.session.csrf) : { authenticated: false });
  });

  api.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const user = await auth.verifyLogin(username, password);
    if (!user) {
      audit.log(String(username || '').slice(0, 40), 'login-failed', 'auth', req.ip);
      throw new HttpError(401, 'Utilizator sau parolă incorecte.');
    }
    const { csrf } = auth.issueSession(req, res, user);
    audit.log(user.username, 'login', 'auth', '');
    res.json(sessionInfo(user.username, csrf));
  });

  api.post('/logout', (req, res) => {
    if (req.session) audit.log(req.session.user, 'logout', 'auth', '');
    auth.clearSession(req, res);
    res.json({ ok: true });
  });

  /* ---------- administrare ---------- */
  const admin = express.Router();
  admin.use(auth.requireAuth, auth.requireCsrf);

  for (const col of ['news', 'documents', 'events', 'legal', 'gallery', 'investments']) {
    const sc = schemas[col];
    admin.get(`/${col}`, (req, res) => res.json(store.list(col)));

    admin.post(`/${col}`, async (req, res) => {
      const rec = await store.create(col, sc.clean(req.body || {}, null));
      audit.log(req.session.user, 'create', col, sc.label(rec));
      res.status(201).json(rec);
    });

    admin.put(`/${col}/:id`, async (req, res) => {
      const ex = store.find(col, req.params.id);
      if (!ex) throw new HttpError(404, 'Elementul nu a fost găsit.');
      const before = store.filesIn(ex);
      const rec = await store.update(col, ex.id, sc.clean(req.body || {}, ex));
      await store.pruneFiles(before);
      audit.log(req.session.user, 'update', col, sc.label(rec));
      res.json(rec);
    });

    admin.delete(`/${col}/:id`, async (req, res) => {
      const ex = store.find(col, req.params.id);
      if (!ex) throw new HttpError(404, 'Elementul nu a fost găsit.');
      await store.remove(col, ex.id);
      await store.pruneFiles(store.filesIn(ex));
      audit.log(req.session.user, 'delete', col, sc.label(ex));
      res.json({ ok: true });
    });
  }

  admin.get('/programs', (req, res) => res.json(store.list('programs')));
  admin.put('/programs/:id', async (req, res) => {
    const ex = store.find('programs', req.params.id);
    if (!ex) throw new HttpError(404, 'Programul nu a fost găsit.');
    const rec = await store.update('programs', ex.id, schemas.programs.clean(req.body || {}, ex));
    audit.log(req.session.user, 'update', 'programs', rec.name);
    res.json(rec);
  });

  admin.get('/settings', (req, res) => res.json(store.getSettings()));
  admin.put('/settings', async (req, res) => {
    const saved = await store.setSettings(schemas.cleanSettings(req.body));
    audit.log(req.session.user, 'update', 'settings', 'Texte pagină');
    res.json(saved);
  });

  admin.post('/upload/:kind', uploads.handler);

  admin.post('/password', async (req, res) => {
    const { current, next } = req.body || {};
    const user = await auth.changePassword(req.session.user, current, next);
    const { csrf } = auth.issueSession(req, res, user);
    audit.log(user.username, 'password', 'auth', '');
    res.json({ ok: true, csrf });
  });

  admin.get('/audit', (req, res) => res.json(audit.recent(100)));

  // Arhivă ZIP trimisă direct în răspuns (copie de siguranță și export static).
  async function sendZip(req, res, next, filename, fill) {
    const { ZipArchive } = await import('archiver');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.zip"`);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('warning', e => console.warn('Arhivă ZIP:', e.message));
    zip.on('error', next);
    zip.pipe(res);
    fill(zip);
    await zip.finalize();
  }

  admin.get('/backup', (req, res, next) =>
    sendZip(req, res, next, 'dgaefe-copie', zip => {
      zip.directory(store.dataPath('content'), 'content');
      zip.directory(store.dataPath('uploads'), 'uploads');
      audit.log(req.session.user, 'backup', 'system', '');
    })
  );

  admin.get('/export-static', (req, res, next) =>
    sendZip(req, res, next, 'dgaefe-site-static', zip => {
      for (const e of staticSite.entries(store.list, cfg.DATA_DIR, { seedDir: cfg.SEED_DIR })) {
        if (e.file) zip.file(e.file, { name: e.name });
        else zip.append(e.text, { name: e.name });
      }
      audit.log(req.session.user, 'export', 'system', 'site static');
    })
  );

  api.use('/admin', admin);

  /* ---------- erori ---------- */
  api.use((req, res) => res.status(404).json({ error: 'Resursa nu există.' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (res.headersSent) return res.destroy();
    let status = err.status || 500;
    let message = err.message;
    if (err.type === 'entity.parse.failed') [status, message] = [400, 'Datele trimise sunt invalide (JSON).'];
    if (err.type === 'entity.too.large') [status, message] = [413, 'Cererea este prea mare.'];
    if (status >= 500) {
      console.error(err);
      message = 'Eroare internă a serverului.';
    }
    res.status(status).json({ error: message });
  });

  return api;
}

module.exports = { buildApi };
