'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cfg = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const { buildApi } = require('./lib/api');
const { trustProxySetting } = require('./lib/proxy');

const NOT_FOUND = `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagina nu a fost găsită</title>
<body style="font:18px/1.6 system-ui,sans-serif;max-width:36em;margin:15vh auto;padding:0 24px;color:#1b2535"><h1 style="font-size:1.6rem">Pagina nu a fost găsită</h1><p>Adresa nu există sau a fost mutată.</p><p><a href="/">Înapoi la prima pagină</a></p></body></html>`;

function createApp() {
  store.init();
  auth.init();

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
  app.get('/', (req, res) => res.sendFile(path.join(cfg.WEB_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));

  app.use((req, res) => res.status(404).type('html').send(NOT_FOUND));
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
