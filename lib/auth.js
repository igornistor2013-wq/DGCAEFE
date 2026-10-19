'use strict';
// Autentificare: parole cu bcrypt, sesiuni semnate (HMAC) în cookie HttpOnly, protecție CSRF.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const { HttpError } = require('./errors');

const COOKIE = 'dgaefe_session';
const COST = Number(process.env.BCRYPT_COST) || 11;
const MIN_PASSWORD = 10;

const usersFile = () => path.join(cfg.DATA_DIR, 'private', 'users.json');
const secretFile = () => path.join(cfg.DATA_DIR, 'private', 'session.key');

let users = [];
let secret = '';
let dummyHash = '';

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeUsers(list) {
  const tmp = `${usersFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, usersFile());
}

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw new HttpError(400, `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);
  if (p.length > 200) throw new HttpError(400, 'Parola este prea lungă (maximum 200 de caractere).');
}

function banner(user, password) {
  const line = '='.repeat(62);
  console.log(`\n${line}\n Cont de administrator creat\n   Utilizator: ${user}\n   Parola:     ${password}\n\n Schimbați parola din panoul de administrare (secțiunea Cont).\n${line}\n`);
}

function init() {
  fs.mkdirSync(path.dirname(usersFile()), { recursive: true });
  if (fs.existsSync(secretFile())) secret = fs.readFileSync(secretFile(), 'utf8').trim();
  if (!secret) {
    secret = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(secretFile(), secret, { mode: 0o600 });
  }
  dummyHash = bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), COST);
  users = readUsers();
  if (!users) {
    const generated = !cfg.ADMIN_PASSWORD;
    const password = cfg.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    if (!generated && password.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);
    users = [{ username: cfg.ADMIN_USER, hash: bcrypt.hashSync(password, COST), ver: 1, createdAt: new Date().toISOString() }];
    writeUsers(users);
    if (generated) banner(cfg.ADMIN_USER, password);
  }
}

/* ---------- parole ---------- */
async function verifyLogin(username, password) {
  const u = users.find(x => x.username === String(username || '').trim());
  const ok = await bcrypt.compare(String(password || '').slice(0, 200), u ? u.hash : dummyHash);
  return ok && u ? u : null;
}

async function changePassword(username, current, next) {
  const u = users.find(x => x.username === username);
  if (!u || !(await bcrypt.compare(String(current || '').slice(0, 200), u.hash))) throw new HttpError(400, 'Parola curentă este incorectă.');
  validatePassword(next);
  if (next === current) throw new HttpError(400, 'Parola nouă trebuie să fie diferită de cea curentă.');
  u.hash = await bcrypt.hash(next, COST);
  u.ver = (u.ver || 1) + 1; // invalidează toate sesiunile existente
  u.updatedAt = new Date().toISOString();
  writeUsers(users);
  return u;
}

// Pentru scriptul din linia de comandă (rulează fără server).
function setPasswordOffline(username, password) {
  validatePassword(password);
  fs.mkdirSync(path.dirname(usersFile()), { recursive: true });
  const list = readUsers() || [];
  let u = list.find(x => x.username === username);
  if (!u) {
    u = { username, ver: 0, createdAt: new Date().toISOString() };
    list.push(u);
  }
  u.hash = bcrypt.hashSync(password, COST);
  u.ver = (u.ver || 0) + 1;
  u.updatedAt = new Date().toISOString();
  writeUsers(list);
  return u;
}

/* ---------- sesiuni ---------- */
const sign = body => crypto.createHmac('sha256', secret).update(body).digest('base64url');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie malformat, îl ignorăm */
    }
  }
  return out;
}

function cookieString(req, value, maxAgeSec) {
  const secure = cfg.COOKIE_SECURE === 'true' || (cfg.COOKIE_SECURE !== 'false' && req.secure);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

function issueSession(req, res, user) {
  const ttl = cfg.SESSION_HOURS * 3600 * 1000;
  const payload = { u: user.username, v: user.ver, exp: Date.now() + ttl, c: crypto.randomBytes(16).toString('base64url') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  res.setHeader('Set-Cookie', cookieString(req, `${body}.${sign(body)}`, Math.floor(ttl / 1000)));
  return { csrf: payload.c };
}

function clearSession(req, res) {
  res.setHeader('Set-Cookie', cookieString(req, '', 0));
}

function readSession(req) {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
  const u = users.find(x => x.username === p.u && x.ver === p.v);
  return u ? { user: u.username, csrf: p.c } : null;
}

/* ---------- middleware ---------- */
function attach(req, res, next) {
  req.session = readSession(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.session) return next(new HttpError(401, 'Autentificare necesară.'));
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = (cfg.TRUST_PROXY && req.get('x-forwarded-host')) || req.get('host');
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) return next(new HttpError(403, 'Cerere refuzată: origine neacceptată.'));
  }
  const token = Buffer.from(req.get('x-csrf-token') || '');
  const expected = Buffer.from((req.session && req.session.csrf) || '');
  if (!expected.length || token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
    return next(new HttpError(403, 'Token de securitate invalid. Reîncărcați pagina și autentificați-vă din nou.'));
  }
  next();
}

module.exports = { init, verifyLogin, changePassword, setPasswordOffline, issueSession, clearSession, attach, requireAuth, requireCsrf, MIN_PASSWORD };
