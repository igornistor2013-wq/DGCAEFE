/* Panou de administrare — generatorul de formulare (câmpuri, încărcări, editor de text) și ferestrele de dialog. */
(function () {
  'use strict';

  const DG = window.DG;
  const ADM = window.ADM;
  const esc = DG.esc;
  const $ = ADM.$;
  let uidN = 0;

  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.');
    let c = o;
    for (let i = 0; i < ks.length - 1; i++) c = c[ks[i]] = c[ks[i]] || {};
    c[ks[ks.length - 1]] = v;
  };
  const idOf = (uid, name) => uid + '-' + name.replace(/\W+/g, '_');

  /* ---------- HTML pentru câmpuri ---------- */
  function options(list, cur) {
    return list
      .map(o => {
        const v = Array.isArray(o) ? o[0] : o.value;
        const l = Array.isArray(o) ? o[1] : o.label;
        return '<option value="' + esc(v) + '"' + (String(v) === String(cur == null ? '' : cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
      })
      .join('');
  }

  function labelHtml(f, id, tag) {
    const req = f.required ? '<span class="req" aria-hidden="true">*</span><span class="sr"> (obligatoriu)</span>' : '';
    const counter = f.max && (f.type === 'textarea' || f.type === 'rich') ? '<span class="counter" data-counter aria-hidden="true"></span>' : '';
    return tag === 'span' ? '<span class="lbl" id="' + id + '-l">' + esc(f.label) + req + '</span>' : '<label for="' + id + '">' + esc(f.label) + req + counter + '</label>';
  }

  function control(f, id, v) {
    const attrs = 'id="' + id + '" data-ctl' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.hint ? ' aria-describedby="' + id + '-h"' : '') + (f.required ? ' aria-required="true"' : '');
    switch (f.type) {
      case 'textarea':
        return '<textarea ' + attrs + ' rows="' + (f.rows || 3) + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') + '>' + esc(v) + '</textarea>';
      case 'lines':
        return '<textarea ' + attrs + ' rows="' + (f.rows || 4) + '">' + esc(Array.isArray(v) ? v.join('\n') : '') + '</textarea>';
      case 'select':
        return '<select ' + attrs + '>' + options(f.options, v) + '</select>';
      case 'number':
        return '<input type="number" ' + attrs + ' value="' + esc(v == null ? '' : v) + '" step="' + (f.step || 1) + '" inputmode="' + (f.step ? 'decimal' : 'numeric') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.maxv != null ? ' max="' + f.maxv + '"' : '') + '>';
      case 'decimal':
        // număr cu zecimale, scris cu virgulă sau cu punct: un câmp „number” respinge virgula în browserele cu alte setări de limbă
        return '<input type="text" ' + attrs + ' value="' + esc(v == null ? '' : String(v).replace('.', ',')) + '" inputmode="decimal" autocomplete="off" maxlength="20">';
      case 'date':
        return '<input type="date" ' + attrs + ' value="' + esc(v) + '">';
      default:
        return (
          '<input type="text" ' + attrs + ' value="' + esc(v) + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') + (f.type === 'url' ? ' inputmode="url" spellcheck="false" autocapitalize="none"' : '') + (f.list ? ' list="' + id + '-dl"' : '') + '>' +
          (f.list ? '<datalist id="' + id + '-dl">' + f.list.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>' : '')
        );
    }
  }

  function richHtml(f, id, v) {
    const b = (cmd, icon, text, extra) => '<button type="button" data-cmd="' + cmd + '"' + (extra || '') + '>' + DG.icon(icon) + '<span>' + text + '</span></button>';
    return (
      '<div class="rte"><div class="rte-bar" role="toolbar" aria-label="Formatare text">' +
      b('bold', 'bold', 'Aldin') + b('h', 'heading', 'Titlu') + b('ul', 'list', 'Listă') + b('ol', 'list', 'Listă numerotată') + b('link', 'link', 'Legătură') +
      '<span class="sep"></span>' + b('preview', 'eye', 'Previzualizare', ' aria-pressed="false"') +
      '</div><textarea id="' + id + '" data-ctl rows="' + (f.rows || 8) + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') + (f.hint ? ' aria-describedby="' + id + '-h"' : '') + '>' + esc(v) + '</textarea>' +
      '<div class="rte-prev" data-prev hidden tabindex="0" aria-label="Previzualizarea textului"></div></div>' +
      '<details class="rte-help"><summary>Cum se formatează textul</summary>' +
      '<p>Paragrafele se separă printr-un rând liber. Alte posibilități: <code>**text aldin**</code>, <code>## Titlu</code>, rânduri care încep cu <code>- </code> (listă), <code>1. </code> (listă numerotată) și <code>[text](https://adresa)</code> pentru legături. O adresă web scrisă direct devine automat legătură.</p></details>'
    );
  }

  function upHtml(f, id) {
    const accept = f.type === 'image' ? 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif' : ADM.EXT.doc.map(e => '.' + e).join(',');
    return (
      '<div class="up" data-up><div class="up-prev" data-prev></div><div class="up-body"><div class="up-name" data-name></div><div class="up-meta" data-meta></div>' +
      '<div class="up-bar" data-bar hidden><i></i></div><p class="up-msg" data-msg role="status"></p>' +
      '<div class="up-btns"><label class="btn btn-line">' + DG.icon('upload') + '<span data-pick>Alege fișier</span>' +
      '<input type="file" class="sr" accept="' + accept + '" data-file aria-label="' + esc(f.label) + ': alege fișier"' + (f.hint ? ' aria-describedby="' + id + '-h"' : '') + '></label>' +
      '<button type="button" class="btn btn-danger btn-sm" data-act="remove" hidden>Elimină</button></div></div></div>'
    );
  }

  function fieldHtml(f, v, uid) {
    if (f.type === 'heading') return '<div class="fsec"><h3>' + esc(f.label) + '</h3>' + (f.hint ? '<p class="hint">' + esc(f.hint) + '</p>' : '') + '</div>';
    const id = idOf(uid, f.name);
    const hint = f.hint ? '<p class="hint" id="' + id + '-h">' + esc(f.hint) + '</p>' : '';
    const attrs = 'class="fld w-' + (f.w || 'full') + '" data-name="' + esc(f.name) + '" data-type="' + f.type + '"';
    switch (f.type) {
      case 'checkbox':
        return '<div ' + attrs + '><label class="check"><input type="checkbox" id="' + id + '" data-ctl' + (v ? ' checked' : '') + (f.hint ? ' aria-describedby="' + id + '-h"' : '') + '><span>' + esc(f.label) + '</span></label>' + hint + '</div>';
      case 'image':
      case 'doc':
        return '<div ' + attrs + ' role="group" aria-labelledby="' + id + '-l">' + labelHtml(f, id, 'span') + upHtml(f, id) + hint + '</div>';
      case 'repeater':
        return (
          '<div ' + attrs + ' role="group" aria-labelledby="' + id + '-l">' + labelHtml(f, id, 'span') +
          '<p class="rep-empty" data-empty>' + esc(f.emptyText || 'Niciun element adăugat.') + '</p><div class="rep" data-rep></div>' +
          '<button type="button" class="btn btn-line btn-sm rep-add" data-act="add">' + DG.icon('plus') + esc(f.addLabel || 'Adaugă') + '</button>' + hint + '</div>'
        );
      case 'rich':
        return '<div ' + attrs + '>' + labelHtml(f, id) + richHtml(f, id, v) + hint + '</div>';
      default:
        return '<div ' + attrs + '>' + labelHtml(f, id) + control(f, id, v) + hint + '</div>';
    }
  }

  function setError(wrap, msg) {
    wrap.classList.toggle('invalid', !!msg);
    let p = wrap.querySelector(':scope > .fld-err');
    if (!msg) {
      if (p) p.remove();
      wrap.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
      return;
    }
    if (!p) {
      p = document.createElement('p');
      p.className = 'fld-err';
      p.setAttribute('role', 'alert');
      wrap.appendChild(p);
    }
    p.textContent = msg;
    const c = wrap.querySelector('[data-ctl]');
    if (c) c.setAttribute('aria-invalid', 'true');
  }

  /* ---------- rânduri repetabile ---------- */
  function rowHtml(f, vals, uid) {
    const rid = idOf(uid, f.name) + '-' + ++uidN;
    const subs = f.sub
      .map(sf => {
        const id = rid + '-' + sf.name;
        const raw = vals ? vals[sf.name] : '';
        const v = Array.isArray(raw) ? raw.join('\n') : raw; // liste de rânduri (de exemplu atribuțiile unei funcții) se arată câte una pe rând
        const common = 'id="' + id + '" data-sub="' + sf.name + '"' + (sf.max ? ' maxlength="' + sf.max + '"' : '') + (sf.placeholder ? ' placeholder="' + esc(sf.placeholder) + '"' : '');
        const input =
          sf.type === 'textarea'
            ? '<textarea ' + common + ' rows="' + (sf.rows || 3) + '">' + esc(v) + '</textarea>'
            : '<input type="text" ' + common + ' value="' + esc(v) + '"' + (sf.type === 'url' ? ' inputmode="url" spellcheck="false" autocapitalize="none"' : '') + '>';
        return '<div class="fld w-' + (sf.w || 'full') + '"><label for="' + id + '">' + esc(sf.label) + '</label>' + input + '</div>';
      })
      .join('');
    return (
      '<div class="rep-row" data-row><div class="rep-fields">' + subs + '</div><div class="rep-ctl">' +
      '<button type="button" class="icon-btn sm" data-act="up" aria-label="Mută rândul mai sus">' + DG.icon('chev-u') + '</button>' +
      '<button type="button" class="icon-btn sm" data-act="down" aria-label="Mută rândul mai jos">' + DG.icon('chev-d') + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-act="del" aria-label="Elimină rândul">' + DG.icon('trash') + '</button></div></div>'
    );
  }

  function wireRepeater(wrap, f, vals, uid) {
    const box = wrap.querySelector('[data-rep]');
    const empty = wrap.querySelector('[data-empty]');
    const add = wrap.querySelector('[data-act="add"]');
    const max = f.max || 20;
    const sync = () => {
      const n = box.children.length;
      empty.hidden = n > 0;
      add.disabled = n >= max;
      add.title = n >= max ? 'Ați atins numărul maxim de elemente (' + max + ').' : '';
    };
    (Array.isArray(vals) ? vals : []).forEach(v => box.insertAdjacentHTML('beforeend', rowHtml(f, v, uid)));
    sync();
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !wrap.contains(b)) return;
      const act = b.dataset.act;
      const row = b.closest('[data-row]');
      if (act === 'add') {
        if (box.children.length >= max) return;
        box.insertAdjacentHTML('beforeend', rowHtml(f, null, uid));
        sync();
        const first = box.lastElementChild.querySelector('input,textarea');
        if (first) first.focus();
      } else if (row && act === 'del') {
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        sync();
        (next ? next.querySelector('input,textarea') : add).focus();
      } else if (row && act === 'up' && row.previousElementSibling) {
        box.insertBefore(row, row.previousElementSibling);
        b.focus();
      } else if (row && act === 'down' && row.nextElementSibling) {
        box.insertBefore(row.nextElementSibling, row);
        b.focus();
      }
      wrap.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /* ---------- editor de text ---------- */
  function insertText(ta, start, end, text) {
    ta.focus();
    ta.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function lineRange(ta) {
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let e = v.indexOf('\n', ta.selectionEnd);
    if (e < 0) e = v.length;
    return [s, e];
  }

  function wireRich(wrap) {
    const ta = wrap.querySelector('textarea');
    const bar = wrap.querySelector('.rte-bar');
    const prev = wrap.querySelector('.rte-prev');
    bar.addEventListener('click', async e => {
      const b = e.target.closest('button[data-cmd]');
      if (!b) return;
      const cmd = b.dataset.cmd;
      if (cmd === 'preview') {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        prev.hidden = !on;
        ta.hidden = on;
        bar.querySelectorAll('button[data-cmd]:not([data-cmd="preview"])').forEach(x => (x.disabled = on));
        if (on) prev.innerHTML = DG.rich(ta.value) || '<p class="muted">Nu există încă text de afișat.</p>';
        else ta.focus();
        return;
      }
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      if (cmd === 'bold') {
        const sel = ta.value.slice(s, en) || 'text aldin';
        insertText(ta, s, en, '**' + sel + '**');
        ta.setSelectionRange(s + 2, s + 2 + sel.length);
      } else if (cmd === 'h' || cmd === 'ul' || cmd === 'ol') {
        const [ls, le] = lineRange(ta);
        const lines = ta.value.slice(ls, le).split('\n');
        let n = 0;
        const out = lines.map(l => {
          if (!l.trim()) return l;
          n++;
          const clean = l.replace(/^(#{2,3}\s+|[-*•]\s+|\d+[.)]\s+)/, '');
          return (cmd === 'h' ? '## ' : cmd === 'ul' ? '- ' : n + '. ') + clean;
        });
        insertText(ta, ls, le, out.join('\n'));
      } else if (cmd === 'link') {
        const picked = ta.value.slice(s, en);
        const r = await ADM.ask({
          title: 'Inserare legătură',
          ok: 'Inserează',
          fields: [
            { name: 'text', label: 'Textul legăturii', type: 'text', required: true, max: 200 },
            {
              name: 'url', label: 'Adresa web', type: 'url', required: true, placeholder: 'https://…', hint: 'Începe cu https:// (sau mailto: pentru o adresă de e-mail).',
              check: v => (/^(https?:\/\/|mailto:)[^\s)]+$/i.test(v) ? '' : 'Introduceți o adresă validă, care începe cu https://')
            }
          ],
          values: { text: picked, url: '' }
        });
        if (r) insertText(ta, s, en, '[' + r.text + '](' + r.url + ')');
        else ta.focus();
      }
    });
  }

  function wireCounter(wrap, f) {
    const ta = wrap.querySelector('textarea');
    const c = wrap.querySelector('[data-counter]');
    if (!ta || !c) return;
    const upd = () => {
      c.textContent = ta.value.length + ' / ' + f.max;
      c.classList.toggle('over', ta.value.length > f.max);
    };
    ta.addEventListener('input', upd);
    upd();
  }

  /* ---------- fotografii și documente ---------- */
  function wireUpload(wrap, f, initial) {
    const kind = f.type; // 'image' | 'doc'
    const up = wrap.querySelector('[data-up]');
    const prev = up.querySelector('[data-prev]');
    const nameEl = up.querySelector('[data-name]');
    const meta = up.querySelector('[data-meta]');
    const bar = up.querySelector('[data-bar]');
    const msg = up.querySelector('[data-msg]');
    const rm = up.querySelector('[data-act="remove"]');
    const input = up.querySelector('[data-file]');
    const pick = up.querySelector('[data-pick]');
    let blobUrl = '';
    wrap.__file = initial ? JSON.parse(JSON.stringify(initial)) : null;
    wrap.__busy = false;
    wrap.__cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };

    function paint() {
      const fl = wrap.__file;
      prev.innerHTML = fl && kind === 'image' ? '<img src="' + esc(blobUrl || ADM.fileUrl(fl.thumb || fl.path)) + '" alt="">' : DG.icon(kind === 'image' ? 'image' : 'file');
      nameEl.innerHTML = fl ? (kind === 'doc' ? '<a href="' + esc(ADM.fileUrl(fl.path)) + '" target="_blank" rel="noopener">' + esc(fl.name) + '</a>' : esc(fl.name)) : '<span class="muted">Niciun fișier ales</span>';
      meta.textContent = fl
        ? [kind === 'doc' ? DG.fileKind(fl.name).label : 'Imagine', DG.formatSize(fl.size)].filter(Boolean).join(' · ')
        : kind === 'image' ? 'JPG, PNG, WebP sau GIF. Imaginea este redimensionată automat.' : 'PDF, Word, Excel, PowerPoint, ODF, TXT, CSV sau ZIP, până la ' + ADM.limits.docMb + ' MB.';
      rm.hidden = !fl || wrap.__busy;
      pick.textContent = fl ? 'Înlocuiește' : 'Alege fișier';
      input.disabled = wrap.__busy;
    }

    function setBar(p) {
      bar.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    }

    async function handle(file) {
      if (!file || wrap.__busy) return;
      msg.className = 'up-msg';
      msg.textContent = '';
      const problem = ADM.checkFile(kind, file);
      if (problem) {
        msg.textContent = problem;
        msg.classList.add('err');
        return;
      }
      wrap.__busy = true;
      bar.hidden = false;
      setBar(0);
      paint();
      msg.textContent = kind === 'image' ? 'Se pregătește imaginea…' : 'Se încarcă…';
      try {
        let result;
        if (kind === 'image') {
          const pr = await ADM.processImage(file, { maxEdge: f.maxEdge || 2000, thumb: f.thumb ? 640 : 0 });
          msg.textContent = 'Se încarcă…';
          const total = pr.thumb ? 2 : 1;
          const main = await ADM.upload('image', pr.main, p => setBar(p / total));
          result = { path: main.path, name: main.name, size: main.size };
          if (pr.thumb) {
            const th = await ADM.upload('image', pr.thumb, p => setBar((1 + p) / total));
            result.thumb = th.path;
          }
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          blobUrl = URL.createObjectURL(pr.thumb || pr.main);
        } else {
          result = await ADM.upload('doc', file, setBar);
        }
        wrap.__file = result;
        setError(wrap, '');
        msg.textContent = '';
        wrap.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
        msg.textContent = e.message || 'Încărcarea a eșuat.';
        msg.classList.add('err');
      } finally {
        wrap.__busy = false;
        bar.hidden = true;
        paint();
      }
    }

    input.addEventListener('change', () => {
      handle(input.files[0]);
      input.value = '';
    });
    rm.addEventListener('click', () => {
      wrap.__file = null;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = '';
      msg.textContent = '';
      paint();
      wrap.dispatchEvent(new Event('input', { bubbles: true }));
    });
    ['dragenter', 'dragover'].forEach(t =>
      up.addEventListener(t, e => {
        e.preventDefault();
        up.classList.add('drag');
      })
    );
    ['dragleave', 'drop'].forEach(t =>
      up.addEventListener(t, e => {
        e.preventDefault();
        up.classList.remove('drag');
      })
    );
    up.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files.length) handle(e.dataTransfer.files[0]);
    });
    paint();
  }

  /* ---------- constructorul de formulare ---------- */
  ADM.buildForm = function (fields, values) {
    values = values || {};
    const uid = 'f' + ++uidN;
    const root = document.createElement('div');
    root.className = 'form-grid';
    root.innerHTML = fields.map(f => fieldHtml(f, f.type === 'heading' ? null : getPath(values, f.name), uid)).join('');

    const byName = {};
    fields.forEach(f => {
      if (f.type === 'heading') return;
      const wrap = root.querySelector('.fld[data-name="' + CSS.escape(f.name) + '"]');
      byName[f.name] = { f, wrap };
      const v = getPath(values, f.name);
      if (f.type === 'image' || f.type === 'doc') wireUpload(wrap, f, v);
      else if (f.type === 'repeater') wireRepeater(wrap, f, v, uid);
      else if (f.type === 'rich') wireRich(wrap);
      if (f.max && (f.type === 'textarea' || f.type === 'rich')) wireCounter(wrap, f);
    });

    function readOne(f, wrap) {
      switch (f.type) {
        case 'checkbox':
          return wrap.querySelector('[data-ctl]').checked;
        case 'lines':
          return wrap.querySelector('[data-ctl]').value.split('\n').map(s => s.trim()).filter(Boolean);
        case 'repeater':
          return Array.from(wrap.querySelectorAll('[data-row]'))
            .map(row => {
              const o = {};
              f.sub.forEach(sf => {
                o[sf.name] = row.querySelector('[data-sub="' + sf.name + '"]').value.trim();
              });
              return o;
            })
            .filter(o => Object.keys(o).some(k => o[k]));
        case 'image':
        case 'doc':
          return wrap.__file || null;
        default:
          return wrap.querySelector('[data-ctl]').value;
      }
    }

    function read() {
      const out = {};
      Object.keys(byName).forEach(n => setPath(out, n, readOne(byName[n].f, byName[n].wrap)));
      return out;
    }

    function applyShow() {
      const vals = read();
      Object.keys(byName).forEach(n => {
        const { f, wrap } = byName[n];
        if (f.showIf) wrap.hidden = !f.showIf(vals);
      });
    }

    root.addEventListener('input', e => {
      const wrap = e.target.closest ? e.target.closest('.fld[data-name]') : null;
      if (wrap && wrap.classList.contains('invalid')) setError(wrap, '');
      applyShow();
    });
    root.addEventListener('change', applyShow);
    applyShow();

    let snapshot = JSON.stringify(read());

    function validate() {
      let first = null;
      Object.keys(byName).forEach(n => {
        const { f, wrap } = byName[n];
        setError(wrap, '');
        if (wrap.hidden) return;
        const v = readOne(f, wrap);
        const blank = v == null || v === '' || (Array.isArray(v) && !v.length);
        let msg = '';
        if (wrap.__busy) msg = 'Așteptați să se termine încărcarea fișierului.';
        else if (f.required && blank) msg = 'Câmpul „' + f.label + '” este obligatoriu.';
        else if (f.type === 'url' && v && !(/^https?:\/\/[^\s<>"']+$/i.test(v) || (f.anchor && /^#[\w-]+$/.test(v)))) msg = 'Câmpul „' + f.label + '” trebuie să fie o adresă web care începe cu http:// sau https://.';
        else if (f.check) msg = f.check(v, read()) || '';
        if (msg) {
          setError(wrap, msg);
          if (!first) first = wrap;
        }
      });
      if (first) focusField(first);
      return !first;
    }

    function focusField(wrap) {
      const c = wrap.querySelector('[data-ctl],[data-sub],[data-file],[data-act]');
      wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (c && typeof c.focus === 'function') c.focus({ preventScroll: true });
    }

    return {
      el: root,
      read,
      validate,
      dirty: () => JSON.stringify(read()) !== snapshot,
      markClean: () => {
        snapshot = JSON.stringify(read());
      },
      busy: () => Object.keys(byName).some(n => byName[n].wrap.__busy),
      focusFirst: () => {
        const w = Object.keys(byName).map(n => byName[n].wrap).find(x => !x.hidden);
        if (w) {
          const c = w.querySelector('[data-ctl],[data-sub],[data-file]');
          if (c) c.focus({ preventScroll: true });
        }
      },
      // Mesajele serverului citează numele câmpului între „ ” — așa îl marcăm și în formular.
      markServerError(msg) {
        const hit = fields.find(f => f.type !== 'heading' && msg.indexOf('„' + f.label + '”') > -1 && !byName[f.name].wrap.hidden);
        if (hit) {
          setError(byName[hit.name].wrap, msg);
          focusField(byName[hit.name].wrap);
        }
      },
      destroy: () => Object.keys(byName).forEach(n => byName[n].wrap.__cleanup && byName[n].wrap.__cleanup())
    };
  };

  /* ---------- fereastra principală de editare ---------- */
  let current = null;

  ADM.openForm = function (o) {
    return new Promise(resolve => {
      const d = $('#recordDlg');
      const body = $('#recBody');
      const formEl = $('#recForm');
      const saveBtn = $('#recSave');
      const delBtn = $('#recDelete');
      const form = ADM.buildForm(o.fields, o.values);
      let saving = false;
      let finishing = false;

      $('#recTitle').textContent = o.title;
      body.innerHTML = '<div class="alert alert-error" id="recErr" role="alert" hidden></div>';
      body.appendChild(form.el);
      saveBtn.textContent = o.saveLabel || 'Salvează';
      delBtn.hidden = !o.onDelete;
      delBtn.lastChild.textContent = o.deleteLabel || 'Șterge';
      const err = $('#recErr');

      const showErr = m => {
        err.textContent = m;
        err.hidden = false;
        body.scrollTop = 0;
      };
      const setSaving = on => {
        saving = on;
        saveBtn.disabled = on;
        delBtn.disabled = on;
        $('#recCancel').disabled = on;
        saveBtn.textContent = on ? 'Se salvează…' : o.saveLabel || 'Salvează';
      };

      const state = {
        dirty: () => !finishing && form.dirty(),
        requestClose,
        abort: () => finish(null)
      };

      function finish(result) {
        finishing = true;
        const i = ADM.guards.indexOf(state.dirty);
        if (i > -1) ADM.guards.splice(i, 1);
        formEl.onsubmit = null;
        d.oncancel = null;
        d.onclose = null;
        d.onkeydown = null;
        $('#recClose').onclick = null;
        $('#recCancel').onclick = null;
        delBtn.onclick = null;
        if (d.open) d.close();
        form.destroy();
        body.innerHTML = '';
        current = null;
        resolve(result);
      }

      async function requestClose() {
        if (saving) return false;
        if (form.dirty()) {
          const ok = await ADM.confirm({ title: 'Închideți fără a salva?', message: 'Modificările făcute în acest formular se vor pierde.', ok: 'Închide fără salvare', danger: true });
          if (!ok) return false;
        }
        finish(null);
        return true;
      }

      formEl.onsubmit = async e => {
        e.preventDefault();
        if (saving) return;
        err.hidden = true;
        if (!form.validate()) return;
        setSaving(true);
        try {
          const rec = await o.onSave(form.read());
          setSaving(false);
          form.markClean();
          finish(rec || true);
        } catch (ex) {
          setSaving(false);
          showErr(ex.message);
          form.markServerError(ex.message);
        }
      };
      $('#recClose').onclick = requestClose;
      $('#recCancel').onclick = requestClose;
      d.oncancel = e => {
        e.preventDefault();
        requestClose();
      };
      // Dacă browserul închide totuși fereastra (a doua apăsare rapidă pe Esc), o redeschidem și cerem confirmarea.
      d.onclose = () => {
        if (!finishing) {
          d.showModal();
          requestClose();
        }
      };
      d.onkeydown = e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          formEl.requestSubmit();
        }
      };
      delBtn.onclick = async () => {
        if (saving) return;
        setSaving(true);
        try {
          const done = await o.onDelete();
          setSaving(false);
          if (done) {
            form.markClean();
            finish({ deleted: true });
          }
        } catch (ex) {
          setSaving(false);
          showErr(ex.message);
        }
      };

      current = state;
      ADM.guards.push(state.dirty);
      d.showModal();
      d.querySelector('.dlg-body').scrollTop = 0;
      form.focusFirst();
    });
  };

  ADM.closeForm = () => (current ? current.requestClose() : Promise.resolve(true));
  ADM.abortForm = () => {
    if (current) current.abort();
  };
  ADM.formOpen = () => !!current;

  /* ---------- fereastră mică de întrebări (ex.: adresa unei legături) ---------- */
  ADM.ask = function (o) {
    return new Promise(resolve => {
      const d = $('#askDlg');
      const body = $('#askBody');
      const formEl = $('#askForm');
      const form = ADM.buildForm(o.fields, o.values);
      let settled = false;
      $('#askTitle').textContent = o.title;
      $('#askOk').textContent = o.ok || 'Aplică';
      body.innerHTML = '';
      if (o.intro) body.insertAdjacentHTML('beforeend', '<p>' + esc(o.intro) + '</p>');
      body.appendChild(form.el);

      function done(v) {
        if (settled) return;
        settled = true;
        formEl.onsubmit = null;
        d.oncancel = null;
        d.onclose = null;
        $('#askClose').onclick = null;
        $('#askCancel').onclick = null;
        if (d.open) d.close();
        form.destroy();
        resolve(v);
      }
      formEl.onsubmit = e => {
        e.preventDefault();
        e.stopPropagation(); // nu trebuie să ajungă la formularul din spate
        if (form.validate()) done(form.read());
      };
      $('#askClose').onclick = () => done(null);
      $('#askCancel').onclick = () => done(null);
      d.oncancel = e => {
        e.preventDefault();
        done(null);
      };
      d.onclose = () => done(null);
      d.showModal();
      form.focusFirst();
    });
  };
})();
