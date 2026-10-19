'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Fișierul .env (opțional): variabilele din el se aplică doar dacă nu sunt deja setate în sistem.
// Alt fișier se poate indica prin ENV_FILE.
(function loadEnvFile() {
  const file = process.env.ENV_FILE || path.join(ROOT, '.env');
  if (typeof process.loadEnvFile !== 'function' || !fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.error(`Nu am putut citi fișierul ${file}: ${e.message}`);
  }
})();

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

module.exports = {
  ROOT,
  WEB_DIR: path.join(ROOT, 'web'),
  SEED_DIR: path.join(ROOT, 'seed'),
  // Aici se păstrează tot ce se modifică din panoul de administrare: conținut, fișiere încărcate, utilizatori.
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'storage')),
  PORT: num(process.env.PORT, 3000),
  HOST: process.env.HOST || '0.0.0.0',
  // "1" când aplicația rulează în spatele unui proxy (Render, Railway, nginx, Caddy etc.)
  TRUST_PROXY: process.env.TRUST_PROXY || '',
  // "true" / "false" / gol (automat: cookie securizat doar pe HTTPS)
  COOKIE_SECURE: process.env.COOKIE_SECURE || '',
  SESSION_HOURS: num(process.env.SESSION_HOURS, 8),
  MAX_IMAGE_MB: num(process.env.MAX_IMAGE_MB, 15),
  MAX_DOC_MB: num(process.env.MAX_DOC_MB, 50),
  // Folosite doar la prima pornire, când nu există încă niciun utilizator.
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || ''
};
