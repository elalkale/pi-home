const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8888;

// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── API: Información del sistema ────────────────────────────────────────────
app.get('/api/system', (req, res) => {
  const uptime = os.uptime(); // segundos
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Temperatura CPU (solo disponible en Raspberry Pi)
  let cpuTemp = null;
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    cpuTemp = (parseInt(raw.trim()) / 1000).toFixed(1);
  } catch (e) {
    cpuTemp = 'N/A';
  }

  // Uso de disco
  let diskInfo = { used: 'N/A', total: 'N/A', percent: 0 };
  try {
    const { execSync } = require('child_process');
    const dfOutput = execSync("df -BG / | tail -1").toString().trim().split(/\s+/);
    diskInfo = {
      total: dfOutput[1],
      used: dfOutput[2],
      percent: parseInt(dfOutput[4])
    };
  } catch (e) {}

  res.json({
    uptime: { days, hours, mins, raw: uptime },
    memory: {
      total: (totalMem / 1024 / 1024 / 1024).toFixed(1),
      used: (usedMem / 1024 / 1024 / 1024).toFixed(1),
      percent: Math.round((usedMem / totalMem) * 100)
    },
    cpu: {
      temp: cpuTemp,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'ARM'
    },
    disk: diskInfo,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  });
});

// ─── API: Servicios (CRUD) ────────────────────────────────────────────────────
const SERVICES_FILE = path.join(__dirname, 'data', 'services.json');

// Asegurar que existe el directorio data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

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
app.get('/api/services', (req, res) => {
  res.json(loadServices());
});

// POST añadir servicio
app.post('/api/services', (req, res) => {
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
app.delete('/api/services/:id', (req, res) => {
  let services = loadServices();
  services = services.filter(s => s.id !== parseInt(req.params.id));
  saveServices(services);
  res.json({ ok: true });
});

// PUT actualizar servicio
app.put('/api/services/:id', (req, res) => {
  const services = loadServices();
  const idx = services.findIndex(s => s.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  services[idx] = { ...services[idx], ...req.body };
  saveServices(services);
  res.json(services[idx]);
});

// ─── Ruta principal ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍓 Pi Home Dashboard corriendo en:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Red:     http://${getLocalIP()}:${PORT}\n`);
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
