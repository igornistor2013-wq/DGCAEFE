'use strict';
// Validare și curățare a datelor primite de la panoul de administrare.
// Regulile sunt în web/assets/js/admin-schemas.js, același fișier pe care îl folosește și administrarea
// direct pe GitHub (în browser); aici doar se leagă de ce știe serverul: fișierele de pe disc și lista programelor.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const store = require('./store');
const { bad } = require('./errors');
const core = require('../web/assets/js/admin-schemas.js');

const schemas = core.create({
  bad,
  fileExists: p => fs.existsSync(path.join(cfg.DATA_DIR, p)),
  programs: () => store.list('programs')
});

module.exports = { ...schemas, SECTIONS: core.SECTIONS, GROUPS: core.GROUPS, LEVELS: core.LEVELS, LEGAL_TYPES: core.LEGAL_TYPES };
