'use strict';
// Încărcarea fișierelor: doar formate permise, verificate și după conținut, nu doar după extensie.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cfg = require('./config');
const { HttpError } = require('./errors');
// Verificarea după conținut și formatele permise sunt comune cu administrarea din browser (GitHub).
const { sniff, slug, IMG_EXT, DOC_EXT } = require('../web/assets/js/admin-schemas.js');

// multer decodează uneori numele în latin1; îl readucem la UTF-8 când este cazul.
function fixName(n) {
  if ([...n].some(ch => ch.charCodeAt(0) > 255)) return n;
  const re = Buffer.from(n, 'latin1').toString('utf8');
  return re.includes('�') ? n : re;
}

const limits = kind => ({ fileSize: (kind === 'image' ? cfg.MAX_IMAGE_MB : cfg.MAX_DOC_MB) * 1024 * 1024, files: 1, fields: 5 });
const uploaders = {
  image: multer({ storage: multer.memoryStorage(), limits: limits('image') }).single('file'),
  doc: multer({ storage: multer.memoryStorage(), limits: limits('doc') }).single('file')
};

function handler(req, res, next) {
  const kind = req.params.kind;
  if (!uploaders[kind]) return next(new HttpError(404, 'Tip de încărcare necunoscut.'));
  uploaders[kind](req, res, async err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `Fișierul depășește dimensiunea maximă permisă (${kind === 'image' ? cfg.MAX_IMAGE_MB : cfg.MAX_DOC_MB} MB).`));
      return next(new HttpError(400, `Încărcarea a eșuat: ${err.message}`));
    }
    try {
      const f = req.file;
      if (!f) throw new HttpError(400, 'Nu a fost trimis niciun fișier.');
      const original = fixName(f.originalname);
      const ext = path.extname(original).slice(1).toLowerCase();
      const allowed = kind === 'image' ? IMG_EXT : DOC_EXT;
      if (!allowed.includes(ext)) throw new HttpError(400, `Format neacceptat (.${ext || '?'}). Formate permise: ${allowed.join(', ')}.`);
      if (!sniff(ext, f.buffer)) throw new HttpError(400, 'Conținutul fișierului nu corespunde formatului indicat de extensie.');
      const sub = kind === 'image' ? 'img' : 'docs';
      const name = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}-${slug(original)}.${ext === 'jpeg' ? 'jpg' : ext}`;
      await fs.promises.writeFile(path.join(cfg.DATA_DIR, 'uploads', sub, name), f.buffer, { flag: 'wx' });
      res.status(201).json({ path: `/uploads/${sub}/${name}`, name: original, size: f.size });
    } catch (e) {
      next(e);
    }
  });
}

module.exports = { handler, IMG_EXT, DOC_EXT };
