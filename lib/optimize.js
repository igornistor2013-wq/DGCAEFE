'use strict';
// Comprimă fișierele versiunii statice, după ce a fost scrisă în dist/: scripturile și stilurile se minifică (esbuild),
// fotografiile încărcate se recomprimă (sharp). Ambele pachete sunt opționale: dacă lipsesc, fișierele rămân neschimbate.
// Nu schimbă conținutul, doar dimensiunea: pagina arată și se comportă la fel, dar se încarcă mai repede.
const fs = require('fs');
const path = require('path');

function optional(name) {
  try { return require(name); } catch (e) { return null; }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const MAIN_EDGE = 1600; // fotografia mare: suficient pentru ecrane late, de peste 2 ori mai puțin decât 2000 px la aceeași calitate
const THUMB_EDGE = 640;

async function optimize(outDir) {
  const stats = { js: 0, css: 0, img: 0, saved: 0, tools: [] };
  const esbuild = optional('esbuild');
  const sharp = optional('sharp');
  const files = walk(outDir);
  const shrink = (file, buf) => {
    const before = fs.statSync(file).size;
    if (buf.length >= before) return false;
    fs.writeFileSync(file, buf);
    stats.saved += before - buf.length;
    return true;
  };

  if (esbuild) {
    stats.tools.push('esbuild');
    for (const f of files) {
      const rel = path.relative(outDir, f).split(path.sep).join('/');
      if (!/^assets\/(js|css)\/[^/]+\.(js|css)$/.test(rel) || /\.min\.(js|css)$/.test(rel)) continue;
      const isJs = rel.endsWith('.js');
      const r = await esbuild.transform(fs.readFileSync(f, 'utf8'), { loader: isJs ? 'js' : 'css', minify: true, legalComments: 'none', target: isJs ? 'es2019' : undefined });
      if (shrink(f, Buffer.from(r.code))) stats[isJs ? 'js' : 'css']++;
    }
  }

  if (sharp) {
    stats.tools.push('sharp');
    for (const f of files) {
      const rel = path.relative(outDir, f).split(path.sep).join('/');
      if (!/^uploads\/.+\.jpe?g$/i.test(rel)) continue;
      const thumb = /-t\.jpe?g$/i.test(rel);
      const buf = await sharp(f).rotate().resize({ width: thumb ? THUMB_EDGE : MAIN_EDGE, height: thumb ? THUMB_EDGE : MAIN_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: thumb ? 72 : 78, mozjpeg: true, progressive: true }).toBuffer();
      if (shrink(f, buf)) stats.img++;
    }
  }
  return stats;
}

module.exports = { optimize };
