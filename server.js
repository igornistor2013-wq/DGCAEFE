'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cfg = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { buildApi } = require('./lib/api');
const { trustProxySetting } = require('./lib/proxy');
const { buildPublic } = require('./lib/public');
const prerender = require('./lib/prerender');
const I18n = require('./web/assets/js/i18n.js');

const NOT_FOUND = `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina nu a fost găsită</title>
<body style="font:18px/1.6 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 24px;color:#1b2535"><h1 style="font-size:1.6rem">Pagina nu a fost găsită</h1><p>Adresa nu există sau a fost mutată.</p><p><a href="/">Înapoi la prima pagină</a></p></body></html>`;

// Prima pagină și pagina „404” pornesc de la șabloanele din web/, completate cu textele din setări (vezi lib/prerender.js).
const readWeb = name => fs.readFileSync(path.join(cfg.WEB_DIR, name), 'utf8');

function createApp() {
  store.init();
  auth.init();
  const siteUrl = prerender.normalizeSiteUrl(cfg.SITE_URL);

  const app = express();
  app.disable('x-powered-by');
  const trust = trustProxySetting(cfg.TRUST_PROXY);
  if (trust !== false) app.set('trust proxy', trust);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ['https://www.google.com'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"]
        }
      }
    })
  );
  app.use(compression());

  app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
  app.use('/api', buildApi());

  // Scripturile și stilurile se verifică la fiecare încărcare (cu ETag: dacă nu s-au schimbat, răspunsul este „304”), ca o versiune nouă să apară
  // imediat; fonturile și imaginile rămân în memoria browserului 7 zile.
  for (const dir of ['js', 'css']) app.use(`/assets/${dir}`, express.static(path.join(cfg.WEB_DIR, 'assets', dir), { maxAge: 0 }));
  app.use('/assets', express.static(path.join(cfg.WEB_DIR, 'assets'), { maxAge: '7d' }));
  app.use('/uploads', express.static(path.join(cfg.DATA_DIR, 'uploads'), { maxAge: '30d', immutable: true, index: false }));
  app.use(
    '/admin',
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      next();
    },
    express.static(path.join(cfg.WEB_DIR, 'admin'), { index: 'index.html' })
  );
  // Prima pagină în fiecare limbă: / (română), /ru și /en; ru.html, en.html și index.html sunt aceleași pagini (legăturile din comutatorul de limbă).
  const homePage = lang => (req, res) => {
    const html = prerender.fillIndex(readWeb('index.html'), buildPublic(store.list, lang), { siteUrl, lang });
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  };
  for (const lang of I18n.LANGS) {
    const m = I18n.META[lang];
    app.get(lang === I18n.DEFAULT ? ['/', '/index.html'] : [m.path, `/${m.file}`], homePage(lang));
  }
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(prerender.robotsTxt(siteUrl)));

  app.use((req, res) => {
    let html;
    try {
      html = prerender.fillNotFound(readWeb('404.html'), buildPublic(store.list), '/');
    } catch (e) {
      html = NOT_FOUND; // dacă șablonul lipsește sau nu poate fi citit, răspunsul simplu de mai sus
    }
    res.status(404).set('Cache-Control', 'no-cache').type('html').send(html);
  });
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(cfg.PORT, cfg.HOST, () => {
    console.log(`Serverul rulează pe http://localhost:${cfg.PORT}  (administrare: /admin/)`);
    console.log(`Date păstrate în: ${cfg.DATA_DIR}`);
  });
  const sweep = () => store.sweepOrphans().catch(e => console.error('Curățarea fișierelor:', e.message));
  sweep();
  setInterval(sweep, 6 * 3600 * 1000).unref();
}

module.exports = { createApp };
