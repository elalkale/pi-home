const express = require('express');
const fs = require('fs');
const { SERVICES_FILE } = require('../config/paths');
const router = express.Router();

// ─── API: Servicios (CRUD) ────────────────────────────────────────────────────
// Servicios por defecto si no existe el archivo
const DEFAULT_SERVICES = [
  {
    id: 1,
    name: 'Mi Web App',
    desc: 'Web con Tailwind + Express + Node.js',
    url: 'http://localhost:3000',
    port: ':3000',
    icon: '🌐',
    online: true,
    category: 'web'
  }
];

function loadServices() {
  try {
    if (fs.existsSync(SERVICES_FILE)) {
      return JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8'));
    }
  } catch (e) {}
  return DEFAULT_SERVICES;
}

function saveServices(services) {
  fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2));
}

// GET todos los servicios
router.get('/', (req, res) => {
  res.json(loadServices());
});

// POST añadir servicio
router.post('/', (req, res) => {
  const services = loadServices();
  const newService = {
    id: Date.now(),
    name: req.body.name || 'Nuevo servicio',
    desc: req.body.desc || '',
    url: req.body.url || '#',
    port: req.body.port || '',
    icon: req.body.icon || '🌐',
    online: true,
    category: req.body.category || 'web'
  };
  services.push(newService);
  saveServices(services);
  res.json(newService);
});

// DELETE eliminar servicio
router.delete('/:id', (req, res) => {
  let services = loadServices();
  services = services.filter(s => s.id !== parseInt(req.params.id));
  saveServices(services);
  res.json({ ok: true });
});

// PUT actualizar servicio
router.put('/:id', (req, res) => {
  const services = loadServices();
  const idx = services.findIndex(s => s.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  services[idx] = { ...services[idx], ...req.body };
  saveServices(services);
  res.json(services[idx]);
});

module.exports = router;
