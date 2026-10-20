'use strict';
// Simulator minimal al API-ului GitHub (Git Data), pentru teste: depozit în memorie, jetoane, conflicte, limitări.
// Folosit de test/github.test.js (Node) și de verificările din browser.
const http = require('http');
const crypto = require('crypto');

const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
const blobSha = buf => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

function createMockGitHub(opts = {}) {
  const owner = opts.owner || 'org';
  const repo = opts.repo || 'site';
  const branch = opts.branch || 'main';

  const s = {
    owner,
    repo,
    branch,
    // jetoane: ce poate face fiecare
    tokens: {
      'tok-ok': { login: 'editor', id: 4242, name: 'Ana Editor', read: true, write: true },
      'tok-read': { login: 'cititor', id: 77, name: 'Doar Citire', read: true, write: false, rolePush: false },
      // jeton cu acces la depozit, dar fără „Contents: Read and write” (contul în sine are drept de scriere)
      'tok-fine-ro': { login: 'editor', id: 4242, name: 'Ana Editor', read: true, write: false, rolePush: true },
      'tok-other': { login: 'altcineva', id: 99, name: 'Alt Cont', read: false, write: false }
    },
    blobs: new Map(), // sha -> Buffer
    trees: new Map(), // sha -> Map(cale -> { sha, mode })
    commits: new Map(), // sha -> { sha, tree, parents, message, author, committer }
    refs: new Map(), // 'heads/main' -> sha
    requests: [], // jurnal: { method, path, query }
    archived: false,
    failures: [], // { method, test(path), status, body, headers, times }
    hooks: {} // beforePatch, ...
  };

  const addBlob = content => {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const sha = blobSha(buf);
    s.blobs.set(sha, buf);
    return sha;
  };

  const treeSha = map =>
    sha1(
      [...map.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([p, e]) => `${e.mode} ${p}\0${e.sha}`)
        .join('\n')
    );

  const addTree = map => {
    const sha = treeSha(map);
    s.trees.set(sha, map);
    return sha;
  };

  let clock = Date.parse('2026-10-01T09:00:00Z');
  const tick = () => new Date((clock += 60000)).toISOString();

  function addCommit({ tree, parents, message, author }) {
    const a = author || { name: 'Sistem', email: 'sistem@example.org', date: tick() };
    const sha = sha1(JSON.stringify({ tree, parents, message, a, n: s.commits.size }));
    s.commits.set(sha, { sha, tree, parents, message, author: a, committer: a });
    return sha;
  }

  const head = () => s.refs.get('heads/' + branch);
  const headTree = () => s.trees.get(s.commits.get(head()).tree);

  // Pregătește depozitul: files = { cale: text|Buffer }
  function init(files) {
    const map = new Map();
    for (const [p, c] of Object.entries(files)) map.set(p, { sha: addBlob(c), mode: '100644' });
    const t = addTree(map);
    const c = addCommit({ tree: t, parents: [], message: 'Pornire' });
    s.refs.set('heads/' + branch, c);
    return c;
  }

  // Un commit făcut de altcineva (simulează o modificare simultană): files = { cale: text|Buffer|null }
  function commitFiles(files, message = 'Modificare externă', author) {
    const base = new Map(headTree());
    for (const [p, c] of Object.entries(files)) {
      if (c === null) base.delete(p);
      else base.set(p, { sha: addBlob(c), mode: '100644' });
    }
    const t = addTree(base);
    const c = addCommit({ tree: t, parents: [head()], message, author });
    s.refs.set('heads/' + branch, c);
    return c;
  }

  const fileBuf = p => {
    const e = headTree().get(p);
    return e ? s.blobs.get(e.sha) : null;
  };
  const fileText = p => {
    const b = fileBuf(p);
    return b ? b.toString('utf8') : null;
  };
  const files = prefix => [...headTree().keys()].filter(p => !prefix || p.startsWith(prefix)).sort();

  function isAncestor(a, b) {
    // a este strămoș (sau egal) al lui b
    const seen = new Set();
    const stack = [b];
    while (stack.length) {
      const c = stack.pop();
      if (c === a) return true;
      if (seen.has(c)) continue;
      seen.add(c);
      const cm = s.commits.get(c);
      if (cm) stack.push(...cm.parents);
    }
    return false;
  }

  /* ---------- HTTP ---------- */
  const json = (res, status, body, headers = {}) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(text);
  };
  const err = (res, status, message, headers) => json(res, status, { message, documentation_url: 'https://docs.github.com/rest' }, headers);

  function treeListing(map) {
    const out = [];
    const dirs = new Set();
    for (const [p, e] of map) {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      out.push({ path: p, mode: e.mode, type: 'blob', sha: e.sha, size: s.blobs.get(e.sha) ? s.blobs.get(e.sha).length : 0 });
    }
    for (const d of dirs) out.push({ path: d, mode: '040000', type: 'tree', sha: sha1('dir:' + d) });
    return out.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    const path = decodeURIComponent(url.pathname);
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    // Exact lista din documentația GitHub („Using CORS and JSONP to make cross-origin requests”): orice alt antet personalizat ar eșua în browser.
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Access-Control-Expose-Headers', 'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, X-GitHub-Request-Id, Deprecation, Sunset');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    s.requests.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), headers: Object.keys(req.headers) });

    // eșecuri programate de teste
    for (const f of s.failures) {
      if (f.times > 0 && (!f.method || f.method === req.method) && f.test(path)) {
        f.times--;
        if (f.drop) return req.socket.destroy();
        return json(res, f.status, f.body || { message: 'Eroare simulată' }, f.headers || {});
      }
    }

    const auth = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const who = auth && s.tokens[auth[1]];
    if (!who) return err(res, 401, 'Bad credentials');

    try {
      if (req.method === 'GET' && path === '/user') return json(res, 200, { login: who.login, id: who.id, name: who.name });

      const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path);
      if (!m) return err(res, 404, 'Not Found');
      if (m[1] !== owner || m[2] !== repo || !who.read) return err(res, 404, 'Not Found');
      const sub = m[3] || '';

      const needWrite = () => {
        if (who.write) return false;
        err(res, 403, 'Resource not accessible by personal access token');
        return true;
      };

      if (req.method === 'GET' && sub === '') {
        return json(res, 200, { name: repo, full_name: `${owner}/${repo}`, default_branch: branch, archived: s.archived, permissions: { admin: false, push: who.rolePush === undefined ? who.write : who.rolePush, pull: true } });
      }

      let r;
      if (req.method === 'GET' && (r = /^\/git\/ref\/heads\/(.+)$/.exec(sub))) {
        const sha = s.refs.get('heads/' + r[1]);
        if (!sha) return err(res, 404, 'Not Found');
        return json(res, 200, { ref: 'refs/heads/' + r[1], object: { sha, type: 'commit' } });
      }
      if (req.method === 'GET' && (r = /^\/git\/commits\/([0-9a-f]+)$/.exec(sub))) {
        const c = s.commits.get(r[1]);
        if (!c) return err(res, 404, 'Not Found');
        return json(res, 200, { sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map(sha => ({ sha })), message: c.message, author: c.author });
      }
      if (req.method === 'GET' && (r = /^\/git\/trees\/([0-9a-f]+)$/.exec(sub))) {
        const t = s.trees.get(r[1]);
        if (!t) return err(res, 404, 'Not Found');
        const all = treeListing(t);
        const list = url.searchParams.get('recursive') ? all : all.filter(e => !e.path.includes('/'));
        return json(res, 200, { sha: r[1], tree: list, truncated: false });
      }
      if (req.method === 'GET' && (r = /^\/git\/blobs\/([0-9a-f]+)$/.exec(sub))) {
        const b = s.blobs.get(r[1]);
        if (!b) return err(res, 404, 'Not Found');
        if (/raw/.test(req.headers.accept || '')) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          return res.end(b);
        }
        return json(res, 200, { sha: r[1], size: b.length, encoding: 'base64', content: b.toString('base64') });
      }
      if (req.method === 'POST' && sub === '/git/blobs') {
        if (needWrite()) return;
        const b = await body(req);
        if (b.content === undefined) return err(res, 422, 'Invalid request: content is required');
        const buf = b.encoding === 'base64' ? Buffer.from(b.content, 'base64') : Buffer.from(String(b.content), 'utf8');
        return json(res, 201, { sha: addBlob(buf) });
      }
      if (req.method === 'POST' && sub === '/git/trees') {
        if (needWrite()) return;
        const b = await body(req);
        const base = b.base_tree ? s.trees.get(b.base_tree) : new Map();
        if (!base) return err(res, 422, 'The tree base_tree does not exist');
        const map = new Map(base);
        const seen = new Set();
        for (const e of b.tree || []) {
          if (!e.path || e.path.startsWith('/') || e.path.includes('//')) return err(res, 422, 'Invalid tree path');
          if (seen.has(e.path)) return err(res, 422, `tree contains duplicate paths: ${e.path}`);
          seen.add(e.path);
          if (e.sha === null) map.delete(e.path);
          else if (typeof e.content === 'string') map.set(e.path, { sha: addBlob(e.content), mode: e.mode || '100644' });
          else if (e.sha) {
            if (!s.blobs.has(e.sha)) return err(res, 422, `GitRPC::BadObjectState: ${e.sha} is not a valid object`);
            map.set(e.path, { sha: e.sha, mode: e.mode || '100644' });
          } else return err(res, 422, 'Must supply either sha or content for each tree entry');
        }
        const sha = addTree(map);
        return json(res, 201, { sha, tree: treeListing(map).filter(e => !e.path.includes('/')) });
      }
      if (req.method === 'POST' && sub === '/git/commits') {
        if (needWrite()) return;
        const b = await body(req);
        if (!s.trees.has(b.tree)) return err(res, 422, 'Tree SHA does not exist');
        for (const p of b.parents || []) if (!s.commits.has(p)) return err(res, 422, 'Parent SHA does not exist');
        const author = b.author ? { name: b.author.name, email: b.author.email, date: b.author.date || tick() } : { name: who.name, email: `${who.id}+${who.login}@users.noreply.github.com`, date: tick() };
        const sha = addCommit({ tree: b.tree, parents: b.parents || [], message: b.message || '', author });
        return json(res, 201, { sha, tree: { sha: b.tree }, parents: (b.parents || []).map(x => ({ sha: x })), message: b.message, author });
      }
      if (req.method === 'PATCH' && (r = /^\/git\/refs\/heads\/(.+)$/.exec(sub))) {
        if (needWrite()) return;
        const b = await body(req);
        if (s.hooks.beforePatch) await s.hooks.beforePatch();
        const cur = s.refs.get('heads/' + r[1]);
        if (!cur) return err(res, 422, 'Reference does not exist');
        if (!s.commits.has(b.sha)) return err(res, 422, 'Object does not exist');
        if (!b.force && !isAncestor(cur, b.sha)) return err(res, 422, 'Update is not a fast forward');
        s.refs.set('heads/' + r[1], b.sha);
        if (s.hooks.dropAfterPatch) {
          s.hooks.dropAfterPatch = false; // modificarea s-a făcut, dar răspunsul se pierde
          return req.socket.destroy();
        }
        return json(res, 200, { ref: 'refs/heads/' + r[1], object: { sha: b.sha, type: 'commit' } });
      }
      if (req.method === 'GET' && sub === '/commits') {
        const start = s.refs.get('heads/' + (url.searchParams.get('sha') || branch));
        if (!start) return err(res, 404, 'Not Found');
        const prefix = url.searchParams.get('path');
        const per = Number(url.searchParams.get('per_page') || 30);
        const out = [];
        let cur = start;
        while (cur && out.length < per) {
          const c = s.commits.get(cur);
          const t = s.trees.get(c.tree);
          const pt = c.parents[0] ? s.trees.get(s.commits.get(c.parents[0]).tree) : new Map();
          let touched = true;
          if (prefix) {
            const pick = map => [...map.entries()].filter(([p]) => p === prefix || p.startsWith(prefix + '/')).map(([p, e]) => p + e.sha).sort().join('|');
            touched = pick(t) !== pick(pt);
          }
          if (touched) {
            const em = /^(\d+)\+(.+)@users\.noreply\.github\.com$/.exec(c.author.email || '');
            out.push({ sha: c.sha, commit: { message: c.message, author: c.author }, author: em ? { login: em[2], id: Number(em[1]) } : null });
          }
          cur = c.parents[0];
        }
        return json(res, 200, out);
      }
      if (req.method === 'GET' && (r = /^\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(sub))) {
        const [, a, b] = r;
        if (!s.commits.has(a) || !s.commits.has(b)) return err(res, 404, 'Not Found');
        const status = a === b ? 'identical' : isAncestor(a, b) ? 'ahead' : isAncestor(b, a) ? 'behind' : 'diverged';
        return json(res, 200, { status });
      }
      return err(res, 404, 'Not Found');
    } catch (e) {
      return err(res, 500, 'Mock error: ' + e.message);
    }
  };

  const server = http.createServer((req, res) => {
    handler(req, res).catch(e => {
      if (!res.headersSent) err(res, 500, 'Mock error: ' + e.message);
    });
  });

  return {
    state: s,
    init,
    commitFiles,
    fileText,
    fileBuf,
    files,
    head,
    headTree,
    commits: () => s.commits,
    failNext: (method, test, status, extra = {}) => s.failures.push({ method, test: typeof test === 'function' ? test : p => p.includes(test), status, times: extra.times || 1, body: extra.body, headers: extra.headers, drop: extra.drop }),
    count: (method, test) => s.requests.filter(r => (!method || r.method === method) && (!test || (typeof test === 'function' ? test(r.path) : r.path.includes(test)))).length,
    resetLog: () => (s.requests.length = 0),
    listen: (port = 0) =>
      new Promise(resolve => {
        server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, port: server.address().port }));
      }),
    close: () =>
      new Promise(resolve => {
        server.closeAllConnections && server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

module.exports = { createMockGitHub, blobSha };
