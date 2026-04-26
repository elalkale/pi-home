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

// ─── API: Firewall (iptables) ─────────────────────────────────────────────────
const { execSync } = require('child_process');
const FIREWALL_FILE = path.join(__dirname, 'data', 'firewall.json');

// Comentario único que identifica reglas gestionadas por pi-home
// Se usa con el módulo "comment" de iptables para poder borrarlas selectivamente
const FW_COMMENT = 'pi-home-fw';

const DEFAULT_FIREWALL = {
  enabled: false,
  rules: [
    { id: 1, proto: 'tcp',  srcPort: 80,   dstPort: 8080, comment: 'HTTP → App web',      active: true  },
    { id: 2, proto: 'tcp',  srcPort: 443,  dstPort: 8443, comment: 'HTTPS → App web SSL', active: false },
    { id: 3, proto: 'udp',  srcPort: 1194, dstPort: 1194, comment: 'OpenVPN',              active: true  }
  ]
};

function loadFirewall() {
  try {
    if (fs.existsSync(FIREWALL_FILE))
      return JSON.parse(fs.readFileSync(FIREWALL_FILE, 'utf8'));
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_FIREWALL));
}

function saveFirewall(data) {
  fs.writeFileSync(FIREWALL_FILE, JSON.stringify(data, null, 2));
}

// Ejecuta un comando iptables con sudo, devuelve { ok, output, error }
function ipt(cmd) {
  try {
    const output = execSync(`sudo iptables ${cmd}`, { timeout: 5000 }).toString().trim();
    return { ok: true, output };
  } catch (e) {
    const error = (e.stderr ? e.stderr.toString() : e.message).trim();
    console.error(`[iptables ERROR] sudo iptables ${cmd}\n  → ${error}`);
    return { ok: false, error };
  }
}

// Elimina SOLO las reglas de PREROUTING marcadas con el comentario pi-home-fw
// Las borra una a una con -D para no afectar reglas de otros programas
function clearPiHomeRules() {
  try {
    // Obtenemos las reglas numeradas
    const out = execSync('sudo iptables -t nat -L PREROUTING --line-numbers -n', { timeout: 5000 })
      .toString().split('\n');

    // Buscamos líneas que contengan nuestro comentario, de abajo a arriba
    // (para que los números de línea no cambien al borrar)
    const linesToDelete = out
      .filter(l => l.includes(FW_COMMENT))
      .map(l => parseInt(l.trim().split(/\s+/)[0]))
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a); // orden descendente

    for (const lineNum of linesToDelete) {
      ipt(`-t nat -D PREROUTING ${lineNum}`);
    }
    return { ok: true, removed: linesToDelete.length };
  } catch (e) {
    console.error('[clearPiHomeRules ERROR]', e.message);
    return { ok: false, error: e.message };
  }
}

// Expande una regla con proto "both" en dos entradas [tcp, udp]
function expandProtos(rule) {
  if (rule.proto === 'both') return ['tcp', 'udp'].map(p => ({ ...rule, proto: p }));
  return [rule];
}

// Aplica/limpia reglas iptables reales
function applyIptables(fwData) {
  // 1. Borrar SOLO las reglas anteriores de pi-home
  const cleared = clearPiHomeRules();
  if (!cleared.ok) {
    return { ok: false, errors: [`No se pudieron limpiar reglas previas: ${cleared.error}`] };
  }

  // 2. Si el firewall está desactivado, solo limpiar y salir
  if (!fwData.enabled) {
    return { ok: true, msg: 'Firewall desactivado · reglas eliminadas', removed: cleared.removed };
  }

  // 3. Aplicar reglas activas
  const activeRules = fwData.rules.filter(r => r.active);
  const errors = [];
  let applied = 0;

  for (const rule of activeRules) {
    for (const r of expandProtos(rule)) {
      // Sanitizar entradas para evitar inyección de comandos
      const proto   = ['tcp','udp'].includes(r.proto) ? r.proto : null;
      const srcPort = parseInt(r.srcPort);
      const dstPort = parseInt(r.dstPort);

      if (!proto || !srcPort || !dstPort || srcPort > 65535 || dstPort > 65535) {
        errors.push(`Regla inválida id=${rule.id}: proto=${r.proto} src=${r.srcPort} dst=${r.dstPort}`);
        continue;
      }

      // Añadir con comentario para poder identificarla después
      const result = ipt(
        `-t nat -A PREROUTING -p ${proto} --dport ${srcPort} -j REDIRECT --to-port ${dstPort} -m comment --comment "${FW_COMMENT}"`
      );

      if (result.ok) {
        applied++;
      } else {
        errors.push(`[${proto.toUpperCase()}] :${srcPort}→:${dstPort} — ${result.error}`);
      }
    }
  }

  // 4. Persistir reglas para que sobrevivan a reinicios (requiere iptables-persistent)
  try {
    execSync('sudo netfilter-persistent save 2>/dev/null || sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true', { timeout: 5000 });
  } catch(e) { /* no crítico si no está instalado */ }

  if (errors.length > 0) {
    return { ok: false, applied, errors };
  }
  return { ok: true, msg: `${applied} regla(s) aplicadas correctamente`, applied };
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET estado del firewall
app.get('/api/firewall', (req, res) => {
  const fw = loadFirewall();
  // Leer reglas reales activas en iptables para mostrar estado real
  try {
    const out = execSync('sudo iptables -t nat -L PREROUTING -n --line-numbers', { timeout: 3000 }).toString();
    const piHomeLines = out.split('\n').filter(l => l.includes(FW_COMMENT));
    fw.iptablesActive   = piHomeLines.length > 0;
    fw.iptablesRuleCount = piHomeLines.length;
  } catch(e) {
    fw.iptablesActive    = false;
    fw.iptablesRuleCount = 0;
    fw.iptablesError     = 'No se pudo leer iptables (¿falta sudo NOPASSWD?)';
  }
  res.json(fw);
});

// POST toggle on/off
app.post('/api/firewall/toggle', (req, res) => {
  const fw = loadFirewall();
  fw.enabled = !fw.enabled;
  saveFirewall(fw);
  const result = applyIptables(fw);
  res.json({ enabled: fw.enabled, ...result });
});

// POST añadir regla
app.post('/api/firewall/rules', (req, res) => {
  const fw = loadFirewall();
  const srcPort = parseInt(req.body.srcPort);
  const dstPort = parseInt(req.body.dstPort);
  const proto   = ['tcp','udp','both'].includes(req.body.proto) ? req.body.proto : 'tcp';

  if (!srcPort || !dstPort || srcPort > 65535 || dstPort > 65535)
    return res.status(400).json({ error: 'Puertos inválidos (rango 1-65535)' });

  const newRule = {
    id:      Date.now(),
    proto,
    srcPort,
    dstPort,
    comment: (req.body.comment || '').slice(0, 80),
    active:  req.body.active !== false
  };
  fw.rules.push(newRule);
  saveFirewall(fw);
  const applyResult = fw.enabled ? applyIptables(fw) : { ok: true, msg: 'Guardada (firewall inactivo)' };
  res.json({ rule: newRule, applyResult });
});

// PUT actualizar regla
app.put('/api/firewall/rules/:id', (req, res) => {
  const fw  = loadFirewall();
  const idx = fw.rules.findIndex(r => r.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada' });

  const updated = { ...fw.rules[idx], ...req.body, id: fw.rules[idx].id };
  updated.srcPort = parseInt(updated.srcPort);
  updated.dstPort = parseInt(updated.dstPort);
  if (!['tcp','udp','both'].includes(updated.proto)) updated.proto = 'tcp';
  if (!updated.srcPort || !updated.dstPort || updated.srcPort > 65535 || updated.dstPort > 65535)
    return res.status(400).json({ error: 'Puertos inválidos' });

  fw.rules[idx] = updated;
  saveFirewall(fw);
  const applyResult = fw.enabled ? applyIptables(fw) : { ok: true, msg: 'Guardada (firewall inactivo)' };
  res.json({ rule: fw.rules[idx], applyResult });
});

// DELETE eliminar regla
app.delete('/api/firewall/rules/:id', (req, res) => {
  const fw = loadFirewall();
  fw.rules = fw.rules.filter(r => r.id !== parseInt(req.params.id));
  saveFirewall(fw);
  const applyResult = fw.enabled ? applyIptables(fw) : { ok: true, msg: 'Eliminada (firewall inactivo)' };
  res.json({ ok: true, applyResult });
});

// POST re-aplicar todas las reglas activas ahora mismo
app.post('/api/firewall/apply', (req, res) => {
  const fw = loadFirewall();
  const result = applyIptables(fw);
  res.json(result);
});

// ─── API: Servicios del Sistema (systemd) ────────────────────────────────────
const SYSSERVICES_FILE = path.join(__dirname, 'data', 'sysservices.json');

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
    const { spawnSync } = require('child_process');
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
app.get('/api/sysservices', (req, res) => {
  const services = loadSysServices();
  const result = services.map(s => {
    const { status, enabled } = getServiceStatus(s.name);
    return { ...s, status, enabled };
  });
  res.json(result);
});

// POST: añadir un servicio a la lista
app.post('/api/sysservices', (req, res) => {
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
app.delete('/api/sysservices/:id', (req, res) => {
  let services = loadSysServices();
  services = services.filter(s => s.id !== parseInt(req.params.id));
  saveSysServices(services);
  res.json({ ok: true });
});

// POST: acción sobre un servicio (start / stop / restart)
app.post('/api/sysservices/:id/action', async (req, res) => {
  const services = loadSysServices();
  const svc = services.find(s => s.id === parseInt(req.params.id));
  if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });

  const action = req.body.action;
  if (!['start', 'stop', 'restart'].includes(action))
    return res.status(400).json({ error: 'Acción no válida' });

  // Sanitizar nombre (ya guardado sin caracteres peligrosos, doble check)
  const safeName = svc.name.replace(/[^a-zA-Z0-9._@-]/g, '');
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('sudo', ['systemctl', action, safeName], { timeout: 10000, encoding: 'utf8' });
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
