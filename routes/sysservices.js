const express = require('express');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { SYSTEMCTL_WRAPPER } = require('../lib/sudo');
const { SYSSERVICES_FILE } = require('../config/paths');
const router = express.Router();

// ─── API: Servicios del Sistema (systemd) ────────────────────────────────────
const DEFAULT_SYSSERVICES = [
  { id: 1, name: 'nginx', displayName: 'Nginx', description: 'Servidor web' },
  { id: 2, name: 'ssh',   displayName: 'SSH',   description: 'Acceso remoto' }
];

function loadSysServices() {
  try {
    if (fs.existsSync(SYSSERVICES_FILE))
      return JSON.parse(fs.readFileSync(SYSSERVICES_FILE, 'utf8'));
  } catch (e) {}
  return DEFAULT_SYSSERVICES;
}

function saveSysServices(data) {
  fs.writeFileSync(SYSSERVICES_FILE, JSON.stringify(data, null, 2));
}

function getServiceStatus(serviceName) {
  try {
    const activeResult = spawnSync('systemctl', ['is-active', serviceName], { timeout: 3000, encoding: 'utf8' });
    const status = (activeResult.stdout || '').trim() || 'inactive';
    const enabledResult = spawnSync('systemctl', ['is-enabled', serviceName], { timeout: 3000, encoding: 'utf8' });
    const enabled = (enabledResult.stdout || '').trim() === 'enabled';
    return { status, enabled };
  } catch (e) {
    return { status: 'inactive', enabled: false };
  }
}

// GET: listar servicios con su estado en tiempo real
router.get('/', (req, res) => {
  const services = loadSysServices();
  const result = services.map(s => {
    const { status, enabled } = getServiceStatus(s.name);
    return { ...s, status, enabled };
  });
  res.json(result);
});

// POST: añadir un servicio a la lista
router.post('/', (req, res) => {
  const services = loadSysServices();
  const name = (req.body.name || '').trim().replace(/[^a-zA-Z0-9._@-]/g, '');
  if (!name) return res.status(400).json({ error: 'Nombre de servicio inválido' });
  if (services.find(s => s.name === name)) return res.status(400).json({ error: 'El servicio ya existe' });
  const newSvc = {
    id: Date.now(),
    name,
    displayName: req.body.displayName || name,
    description: (req.body.description || '').slice(0, 100)
  };
  services.push(newSvc);
  saveSysServices(services);
  const { status, enabled } = getServiceStatus(name);
  res.json({ ...newSvc, status, enabled });
});

// DELETE: quitar un servicio de la lista (no lo desinstala)
router.delete('/:id', (req, res) => {
  let services = loadSysServices();
  services = services.filter(s => s.id !== parseInt(req.params.id));
  saveSysServices(services);
  res.json({ ok: true });
});

// POST: acción sobre un servicio (start / stop / restart)
router.post('/:id/action', async (req, res) => {
  const services = loadSysServices();
  const svc = services.find(s => s.id === parseInt(req.params.id));
  if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });

  const action = req.body.action;
  if (!['start', 'stop', 'restart'].includes(action))
    return res.status(400).json({ error: 'Acción no válida' });

  // Sanitizar nombre (ya guardado sin caracteres peligrosos, doble check)
  const safeName = svc.name.replace(/[^a-zA-Z0-9._@-]/g, '');
  try {
    const result = spawnSync('sudo', [SYSTEMCTL_WRAPPER, action, safeName], { timeout: 10000, encoding: 'utf8' });
    if (result.status !== 0) {
      const errMsg = (result.stderr || result.error?.message || 'Error desconocido').trim();
      return res.status(500).json({ ok: false, error: errMsg });
    }
    // Pequeña pausa para que systemd actualice el estado
    await new Promise(r => setTimeout(r, 600));
    const { status, enabled } = getServiceStatus(safeName);
    res.json({ ok: true, status, enabled });
  } catch (e) {
    const errMsg = (e.stderr ? e.stderr.toString() : e.message).trim();
    res.status(500).json({ ok: false, error: errMsg });
  }
});

module.exports = router;
