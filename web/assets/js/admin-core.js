/* Panou de administrare — nucleul: cereri către server, încărcarea fișierelor, pregătirea imaginilor, confirmări. */
(function () {
  'use strict';

  const DG = window.DG;

  const ADM = (window.ADM = {
    csrf: '',
    user: '',
    limits: { imageMb: 15, docMb: 50 },
    minPassword: 10,
    data: {}, // listele aduse de pe server (știri, documente etc.)
    settings: null,
    guards: [], // funcții care spun dacă există modificări nesalvate
    onSessionLost: null
  });

  const $ = (ADM.$ = (s, r) => (r || document).querySelector(s));
  ADM.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  ADM.ApiError = ApiError;

  ADM.applySession = function (s) {
    ADM.csrf = s.csrf || '';
    ADM.user = s.user || ADM.user;
    if (s.limits) ADM.limits = s.limits;
    if (s.minPassword) ADM.minPassword = s.minPassword;
  };

  ADM.isDirty = () => ADM.guards.some(g => g());

  // Schimbă adresa din bară fără să declanșeze din nou rutarea (folosit când se închide un formular).
  ADM.hash = location.hash || '#/';
  ADM.navigate = function (h) {
    history.replaceState(null, '', h);
    ADM.hash = h;
  };

  /* ---------- cereri JSON ---------- */
  // Administrarea direct pe GitHub (admin-github.js) preia toate cererile și le execută în browser, fără server.
  const asApiError = e => (e instanceof ApiError ? e : new ApiError((e && e.status) || 0, (e && e.message) || 'Eroare neașteptată.'));

  async function send(method, url, body) {
    if (ADM.local) {
      try {
        return await ADM.local.request(method, url, body);
      } catch (e) {
        throw asApiError(e);
      }
    }
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = ADM.csrf;
    const init = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new ApiError(0, 'Nu se poate contacta serverul. Verificați conexiunea la internet și încercați din nou.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* răspuns fără conținut JSON */
    }
    if (res.ok) return data;
    throw new ApiError(res.status, (data && data.error) || 'Eroare neașteptată (' + res.status + ').');
  }
  ADM.rawPost = (url, body) => send('POST', url, body);

  async function refreshCsrf() {
    try {
      const s = await send('GET', '/api/session');
      if (s.authenticated && s.csrf && s.csrf !== ADM.csrf) {
        ADM.applySession(s);
        return true;
      }
    } catch (e) {
      /* ignorat */
    }
    return false;
  }

  // Dacă sesiunea a expirat în timp ce cineva completa un formular, cerem doar parola, fără să pierdem datele.
  let reauthPromise = null;
  ADM.reauth = function () {
    if (!reauthPromise) {
      reauthPromise = openReauth().finally(() => {
        reauthPromise = null;
      });
    }
    return reauthPromise;
  };

  function openReauth() {
    return new Promise((resolve, reject) => {
      const d = $('#reauthDlg');
      const form = $('#raForm');
      const pass = $('#raPass');
      const err = $('#raErr');
      const okBtn = $('#raOk');
      let done = false;
      $('#raUser').value = ADM.user;
      pass.value = '';
      err.hidden = true;

      function finish(ok, value) {
        if (done) return;
        done = true;
        form.onsubmit = null;
        d.oncancel = null;
        d.onclose = null;
        $('#raCancel').onclick = null;
        if (d.open) d.close();
        if (ok) resolve(value);
        else reject(value);
      }
      const giveUp = () => finish(false, new ApiError(401, 'Sesiunea a expirat. Autentificați-vă din nou.'));

      form.onsubmit = async e => {
        e.preventDefault();
        if (!pass.value) {
          err.textContent = ADM.noUsername ? 'Introduceți jetonul GitHub.' : 'Introduceți parola.';
          err.hidden = false;
          pass.focus();
          return;
        }
        okBtn.disabled = true;
        try {
          const s = await send('POST', '/api/login', { username: ADM.user, password: pass.value });
          ADM.applySession(s);
          finish(true);
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          pass.select();
        } finally {
          okBtn.disabled = false;
        }
      };
      $('#raCancel').onclick = giveUp;
      d.oncancel = e => {
        e.preventDefault();
        giveUp();
      };
      d.onclose = giveUp;
      d.showModal();
      pass.focus();
    });
  }

  ADM.api = async function (method, url, body) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(method, url, body);
      } catch (e) {
        if (!(e instanceof ApiError) || attempt >= 2) throw e;
        if (e.status === 401 && url !== '/api/login') {
          try {
            await ADM.reauth();
          } catch (x) {
            if (ADM.onSessionLost) ADM.onSessionLost();
            throw e;
          }
          continue;
        }
        if (e.status === 403 && method !== 'GET' && attempt === 0 && (await refreshCsrf())) continue;
        throw e;
      }
    }
  };
  ADM.get = url => ADM.api('GET', url);

  /* ---------- încărcarea fișierelor ---------- */
  const EXT = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', 'zip']
  };
  ADM.EXT = EXT;
  const MAX_ORIGINAL_IMAGE = 80 * 1048576;

  // Verificări rapide înainte de încărcare; serverul le repetă oricum, după conținut.
  ADM.checkFile = function (kind, file) {
    const m = /\.([^.]+)$/.exec(file.name);
    const ext = m ? m[1].toLowerCase() : '';
    if (!ext || EXT[kind].indexOf(ext) < 0) return 'Format neacceptat' + (ext ? ' (.' + ext + ')' : '') + '. Formate permise: ' + EXT[kind].join(', ') + '.';
    if (!file.size) return 'Fișierul este gol.';
    if (kind === 'doc' && file.size > ADM.limits.docMb * 1048576) return 'Fișierul are ' + DG.formatSize(file.size) + ', iar limita este ' + ADM.limits.docMb + ' MB.';
    if (kind === 'image' && file.size > MAX_ORIGINAL_IMAGE) return 'Fotografia are ' + DG.formatSize(file.size) + ' și este prea mare pentru a fi pregătită în browser.';
    return '';
  };

  function xhrUpload(kind, file, onProgress) {
    if (ADM.local) return ADM.local.upload(kind, file, onProgress).catch(e => Promise.reject(asApiError(e)));
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const x = new XMLHttpRequest();
      x.open('POST', '/api/admin/upload/' + kind);
      x.setRequestHeader('X-CSRF-Token', ADM.csrf);
      x.setRequestHeader('Accept', 'application/json');
      x.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      x.onerror = () => reject(new ApiError(0, 'Încărcarea a fost întreruptă. Verificați conexiunea la internet.'));
      x.onload = () => {
        let data = null;
        try {
          data = JSON.parse(x.responseText);
        } catch (e) {
          /* fără JSON */
        }
        if (x.status >= 200 && x.status < 300 && data) resolve(data);
        else reject(new ApiError(x.status, (data && data.error) || 'Încărcarea a eșuat (' + x.status + ').'));
      };
      x.send(fd);
    });
  }

  ADM.upload = async function (kind, file, onProgress) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await xhrUpload(kind, file, onProgress);
      } catch (e) {
        if (attempt === 0 && e.status === 401) {
          try {
            await ADM.reauth();
          } catch (x) {
            if (ADM.onSessionLost) ADM.onSessionLost();
            throw e;
          }
          continue;
        }
        if (attempt === 0 && e.status === 403 && (await refreshCsrf())) continue;
        throw e;
      }
    }
  };

  // Adresa sub care se vede un fișier încărcat (previzualizare în panou) și adresa lui pe pagina publică.
  // Pe server sunt chiar căile salvate; în administrarea pe GitHub ele diferă (admin-github.js le înlocuiește).
  ADM.fileUrl = p => p;
  ADM.pubUrl = p => p;
  // Mai multe operațiuni deodată (în administrarea pe GitHub se salvează într-un singur commit).
  ADM.canBatch = false;
  ADM.batch = async function (ops) {
    if (ADM.local && ADM.local.batch) return ADM.local.batch(ops);
    const out = [];
    for (const o of ops) out.push(await ADM.api(o.method, o.url, o.body));
    return out;
  };
  ADM.uploadSlots = 2; // câte fotografii se încarcă în paralel în galerie
  ADM.where = 'de pe server'; // unde se păstrează fișierele (pentru mesajele de confirmare)

  /* ---------- pregătirea fotografiilor în browser ----------
     Fotografiile se redimensionează și se salvează din nou ca JPEG: se elimină datele ascunse
     (locația GPS, modelul aparatului), orientarea este aplicată, iar încărcarea e mult mai rapidă. */
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try {
        const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          src: b,
          w: b.width,
          h: b.height,
          close() {
            if (b.close) b.close();
          }
        };
      } catch (e) {
        /* încercăm și cu elementul <img> */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        src: img,
        w: img.naturalWidth,
        h: img.naturalHeight,
        close() {
          URL.revokeObjectURL(url);
        }
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error('Imaginea nu poate fi citită. Încercați un alt fișier (JPG, PNG sau WebP).');
    }
  }

  function toJpeg(img, edge, quality, name) {
    const scale = Math.min(1, edge / Math.max(img.w, img.h));
    const w = Math.max(1, Math.round(img.w * scale));
    const h = Math.max(1, Math.round(img.h * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG-urile transparente primesc fundal alb
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.src, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      c.toBlob(
        b => (b ? resolve(new File([b], name, { type: 'image/jpeg' })) : reject(new Error('Imaginea nu a putut fi pregătită pentru încărcare.'))),
        'image/jpeg',
        quality
      );
    });
  }

  ADM.processImage = async function (file, opts) {
    const maxEdge = (opts && opts.maxEdge) || 2000;
    const thumbEdge = (opts && opts.thumb) || 0;
    if (/\.gif$/i.test(file.name)) return { main: file, thumb: null }; // GIF-urile animate rămân neschimbate
    const img = await decodeImage(file);
    try {
      if (img.w * img.h > 150e6) throw new Error('Imaginea are prea multe puncte (peste 150 de megapixeli).');
      const base = file.name.replace(/\.[^.]+$/, '') || 'fotografie';
      const main = await toJpeg(img, maxEdge, 0.86, base + '.jpg');
      const thumb = thumbEdge ? await toJpeg(img, thumbEdge, 0.8, base + '-t.jpg') : null;
      return { main, thumb };
    } finally {
      img.close();
    }
  };

  /* ---------- confirmare ---------- */
  ADM.confirm = function (o) {
    return new Promise(resolve => {
      const d = $('#confirmDlg');
      $('#cfTitle').textContent = o.title;
      $('#cfMsg').textContent = o.message || '';
      const ok = $('#cfOk');
      ok.textContent = o.ok || 'Confirmă';
      ok.className = 'btn ' + (o.danger ? 'btn-danger-solid' : 'btn-primary');
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
      $('#cfCancel').focus(); // la acțiuni cu efect ireversibil, focalizarea cade pe „Anulează”
    });
  };

  /* ---------- diverse ---------- */
  ADM.plural = function (n, one, many) {
    const m = n % 100;
    const de = n >= 20 && (m === 0 || m >= 20) ? ' de' : '';
    return n + (n === 1 ? ' ' + one : de + ' ' + many);
  };

  ADM.fmtDateTime = function (iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  ADM.busy = function (btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  };

  ADM.byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  ADM.byUpdatedDesc = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

  // Pregătește o listă de valori distincte pentru sugestiile din câmpurile text.
  ADM.distinct = (list, key) => Array.from(new Set(list.map(x => x[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ro'));

  window.addEventListener('beforeunload', e => {
    if (ADM.isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
