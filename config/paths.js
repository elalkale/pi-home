const path = require('path');
const fs = require('fs');

// ─── Rutas centralizadas del proyecto ────────────────────────────────────────
// Único sitio donde se definen las rutas a disco, para que ningún router
// tenga que calcular __dirname/'..'/... por su cuenta.
const ROOT_DIR   = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR   = path.join(ROOT_DIR, 'data');

// Asegurar que existe el directorio data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  SERVICES_FILE: path.join(DATA_DIR, 'services.json'),
  FIREWALL_FILE: path.join(DATA_DIR, 'firewall.json'),
  SYSSERVICES_FILE: path.join(DATA_DIR, 'sysservices.json'),
};
