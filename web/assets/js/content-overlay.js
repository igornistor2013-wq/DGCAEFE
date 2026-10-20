/* Conținutul de pornire (seed/) peste conținutul salvat (storage/).
   Când o versiune nouă a paginii aduce conținut nou (o colecție nouă, texte actualizate, acte normative în plus), acesta
   trebuie să ajungă și la cine are deja conținut salvat din administrare, fără să șteargă ce a modificat acel om.
   Regulile sunt aceleași pe server (npm start), în construirea versiunii statice (GitHub Actions) și în administrarea
   direct pe GitHub (în browser), de aceea codul este într-un singur fișier, fără legături cu DOM-ul sau cu Node.

   seed/content/settings.json poartă numărul versiunii conținutului de pornire: „seedRev” (lipsa lui înseamnă 1).
   seed/upgrades.json descrie, pentru fiecare versiune nouă, ce se schimbă la cei care au deja conținut salvat:
     [ { "rev": 2,
         "settings": { "heroLead": [ "<vechea valoare implicită>", … ],     // se înlocuiește doar dacă textul salvat este încă
                       "growth.note": [ "<vechea valoare>", … ] },          // identic cu una dintre valorile implicite vechi; cheia
                                                                            // poate avea puncte, pentru un text dintr-un grup („growth.note”)
         "add": { "legal": [ "<id>", … ] },                                 // înregistrări din seed care se adaugă dacă lipsesc
         "migrate": { "investments": {                                      // înregistrările salvate în forma veche se aduc la forma nouă:
           "drop": [ "<câmp care nu mai există>", … ],                      //   câmpurile acestea se șterg (o înregistrare care nu le mai are nu se atinge)
           "replace": [ "<câmp>", … ],                                      //   aceste câmpuri se iau din înregistrarea din seed cu același id
           "fill": [ "<câmp nou>", … ] } } } ]                              //   aceste câmpuri se completează din seed dacă lipsesc
   Un text modificat de om nu se atinge niciodată. Cheile de texte care lipsesc cu totul se completează din seed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ContentOverlay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLLECTIONS = ['news', 'documents', 'events', 'legal', 'programs', 'gallery', 'investments'];
  const SINGLES = ['settings'];
  const NAMES = COLLECTIONS.concat(SINGLES);

  const clone = v => JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  // Aceeași înregistrare, chiar dacă a primit alt identificator (de exemplu un act introdus de mână, cu același număr).
  function duplicate(name, rec, list) {
    return list.some(x => {
      if (x.id === rec.id) return true;
      if (name === 'legal') return x.type === rec.type && String(x.nr) === String(rec.nr) && x.year === rec.year;
      return false;
    });
  }

  /* stored:   { nume: valoarea citită din storage/, sau undefined dacă fișierul nu există }
     seed:     { nume: valoarea din seed/ }
     upgrades: lista din seed/upgrades.json
     Întoarce { content, changed }: conținutul de folosit și numele fișierelor care diferă de ce era salvat
     (cele care trebuie scrise la următoarea salvare, ca să nu se piardă la o nouă actualizare a conținutului de pornire). */
  function apply(stored, seed, upgrades) {
    stored = stored || {};
    seed = seed || {};
    const steps = (Array.isArray(upgrades) ? upgrades : []).filter(u => u && Number.isInteger(u.rev)).sort((a, b) => a.rev - b.rev);
    const content = {};
    const changed = new Set();

    for (const name of COLLECTIONS) {
      if (stored[name] === undefined || stored[name] === null) {
        content[name] = Array.isArray(seed[name]) ? clone(seed[name]) : [];
        changed.add(name);
      } else content[name] = clone(stored[name]);
    }

    const sd = isObj(seed.settings) ? seed.settings : {};
    const seedRev = Number(sd.seedRev) || 1;
    if (!isObj(stored.settings)) {
      content.settings = clone(sd);
      if (!content.settings.seedRev) content.settings.seedRev = seedRev;
      changed.add('settings');
    } else {
      const s = clone(stored.settings);
      const rev = Number(s.seedRev) || 1;
      if (rev < seedRev) {
        const todo = steps.filter(u => u.rev > rev && u.rev <= seedRev);
        // 1. cheile care lipsesc cu totul se iau din seed
        for (const k of Object.keys(sd)) if (s[k] === undefined) s[k] = clone(sd[k]);
        // 2. textele rămase neschimbate față de vechea valoare implicită se înlocuiesc cu cele noi
        //    (cheia „grup.text” se referă la un text din interiorul unui grup, de exemplu „growth.note”)
        for (const u of todo) {
          for (const [k, olds] of Object.entries(u.settings || {})) {
            if (!Array.isArray(olds)) continue;
            const path = k.split('.');
            const last = path.pop();
            const walk = o => path.reduce((a, p) => (isObj(a) ? a[p] : undefined), o);
            const want = walk(sd);
            const here = walk(s);
            if (!isObj(want) || !isObj(here) || want[last] === undefined) continue;
            if (olds.some(o => same(o, here[last]))) here[last] = clone(want[last]);
          }
        }
        // 3. înregistrările noi din seed se adaugă dacă lipsesc (și dacă nu le-a introdus deja cineva de mână)
        for (const u of todo) {
          for (const [name, ids] of Object.entries(u.add || {})) {
            if (!COLLECTIONS.includes(name) || !Array.isArray(ids)) continue;
            for (const id of ids) {
              const rec = (Array.isArray(seed[name]) ? seed[name] : []).find(x => x.id === id);
              if (rec && !duplicate(name, rec, content[name])) {
                content[name].push(clone(rec));
                changed.add(name);
              }
            }
          }
        }
        // 4. înregistrările salvate în forma veche (cu câmpuri care nu mai există) se aduc la forma nouă
        for (const u of todo) {
          for (const [name, spec] of Object.entries(u.migrate || {})) {
            if (!COLLECTIONS.includes(name) || !isObj(spec) || !Array.isArray(content[name])) continue;
            const list = k => (Array.isArray(spec[k]) ? spec[k] : []);
            const seeds = Array.isArray(seed[name]) ? seed[name] : [];
            for (const rec of content[name]) {
              if (!isObj(rec) || !list('drop').some(k => k in rec)) continue;
              const from = seeds.find(x => x && x.id === rec.id);
              for (const k of list('drop')) delete rec[k];
              if (from) {
                for (const k of list('replace')) if (from[k] !== undefined) rec[k] = clone(from[k]);
                for (const k of list('fill')) if (rec[k] === undefined && from[k] !== undefined) rec[k] = clone(from[k]);
              }
              changed.add(name);
            }
          }
        }
        s.seedRev = seedRev;
        if (sd.updatedAt && (!s.updatedAt || sd.updatedAt > s.updatedAt)) s.updatedAt = sd.updatedAt;
        changed.add('settings');
      }
      content.settings = s;
    }
    return { content, changed };
  }

  return { apply, COLLECTIONS, SINGLES, NAMES };
});
