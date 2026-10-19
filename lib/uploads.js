'use strict';
// Încărcarea fișierelor: doar formate permise, verificate și după conținut, nu doar după extensie.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cfg = require('./config');
const { HttpError } = require('./errors');

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'zip'];
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sniff(ext, b) {
  if (!b.length) return false;
  const head = (n, enc = 'latin1') => b.subarray(0, n).toString(enc);
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return b[0] === 0xff && b[1] === 0xd8;
    case 'png':
      return b.subarray(0, 8).equals(PNG);
    case 'gif':
      return head(3) === 'GIF';
    case 'webp':
      return head(4) === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'pdf':
      return b.subarray(0, 1024).toString('latin1').includes('%PDF-');
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'odt':
    case 'ods':
    case 'odp':
    case 'zip':
      return b[0] === 0x50 && b[1] === 0x4b;
    case 'doc':
    case 'xls':
    case 'ppt':
      return b.subarray(0, 4).equals(OLE) || (b[0] === 0x50 && b[1] === 0x4b) || head(5) === '{\\rtf';
    case 'rtf':
      return head(5) === '{\\rtf';
    case 'txt':
    case 'csv':
      return !b.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

function slug(name) {
  const base = name.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'fisier';
}

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
