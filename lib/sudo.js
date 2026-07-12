const { spawnSync } = require('child_process');

// ─── Privilegios: wrappers de mínimo privilegio ──────────────────────────────
// En vez de dar NOPASSWD sobre iptables/systemctl completos (lo que permitiría
// CUALQUIER subcomando si algo sale mal), sudo solo puede invocar estos dos
// scripts, que validan internamente qué se les pide. Ver /deploy en el repo
// para el contenido de los scripts y el archivo sudoers de ejemplo.
const IPTABLES_WRAPPER  = '/usr/local/bin/pi-home-iptables';
const SYSTEMCTL_WRAPPER = '/usr/local/bin/pi-home-systemctl';

// Ejecuta un wrapper vía sudo con argumentos como array (nunca por shell,
// así que no hay interpolación de string que pueda inyectar comandos)
function sudoRun(wrapperPath, args, timeout = 5000) {
  const result = spawnSync('sudo', [wrapperPath, ...args], { timeout, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error((result.stderr || `exit code ${result.status}`).trim());
    err.stderr = result.stderr;
    throw err;
  }
  return result.stdout;
}

module.exports = { sudoRun, IPTABLES_WRAPPER, SYSTEMCTL_WRAPPER };
