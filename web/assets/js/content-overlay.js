/* Conținutul de pornire (seed/) peste conținutul salvat (storage/).
   Când o versiune nouă a paginii aduce conținut nou (o colecție nouă, texte actualizate, acte normative în plus), acesta
   trebuie să ajungă și la cine are deja conținut salvat din administrare, fără să șteargă ce a modificat acel om.
   Regulile sunt aceleași pe server (npm start), în construirea versiunii statice (GitHub Actions) și în administrarea
   direct pe GitHub (în browser), de aceea codul este într-un singur fișier, fără legături cu DOM-ul sau cu Node.

   seed/content/settings.json poartă numărul versiunii conținutului de pornire: „seedRev” (lipsa lui înseamnă 1).
   seed/upgrades.json descrie, pentru fiecare versiune nouă, ce se schimbă la cei care au deja conținut salvat:
     [ { "rev": 2,
         "settings": { "heroLead": [ "<vechea valoare implicită>", … ] },   // se înlocuiește doar dacă textul salvat este încă
                                                                            // identic cu una dintre valorile implicite vechi
         "add": { "legal": [ "<id>", … ] } } ]                              // înregistrări din seed care se adaugă dacă lipsesc
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
        for (const u of todo) {
          for (const [k, olds] of Object.entries(u.settings || {})) {
            if (sd[k] !== undefined && Array.isArray(olds) && olds.some(o => same(o, s[k]))) s[k] = clone(sd[k]);
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
