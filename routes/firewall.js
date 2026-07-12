const express = require('express');
const fs = require('fs');
const { sudoRun, IPTABLES_WRAPPER } = require('../lib/sudo');
const { FIREWALL_FILE } = require('../config/paths');
const router = express.Router();

// ─── API: Firewall (iptables) ─────────────────────────────────────────────────

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

// Lista las reglas NAT/PREROUTING actuales vía el wrapper (equivalente a
// `iptables -t nat -L PREROUTING -n --line-numbers`, pero sin sudo abierto)
function iptList() {
  return sudoRun(IPTABLES_WRAPPER, ['list']);
}

// Añade una regla de redirección NAT vía el wrapper
function iptAdd(proto, srcPort, dstPort) {
  return sudoRun(IPTABLES_WRAPPER, ['add', proto, String(srcPort), String(dstPort)]);
}

// Borra una regla NAT por número de línea vía el wrapper
function iptDel(lineNum) {
  return sudoRun(IPTABLES_WRAPPER, ['del', String(lineNum)]);
}

// Persiste las reglas para que sobrevivan a reinicios
function iptSave() {
  return sudoRun(IPTABLES_WRAPPER, ['save']);
}

// Elimina SOLO las reglas de PREROUTING marcadas con el comentario pi-home-fw
// Las borra una a una con -D para no afectar reglas de otros programas
function clearPiHomeRules() {
  try {
    // Obtenemos las reglas numeradas
    const out = iptList().split('\n');

    // Buscamos líneas que contengan nuestro comentario, de abajo a arriba
    // (para que los números de línea no cambien al borrar)
    const linesToDelete = out
      .filter(l => l.includes(FW_COMMENT))
      .map(l => parseInt(l.trim().split(/\s+/)[0]))
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a); // orden descendente

    for (const lineNum of linesToDelete) {
      try { iptDel(lineNum); } catch (e) { /* seguimos con el resto */ }
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

// Valida que un puerto sea un entero dentro del rango válido (1-65535).
// OJO: usar solo "!port" NO detecta negativos (-5 es "truthy" en JS), por
// eso se valida explícitamente el rango con < 1 en vez de confiar en falsy.
function isValidPort(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
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

      if (!proto || !isValidPort(srcPort) || !isValidPort(dstPort)) {
        errors.push(`Regla inválida id=${rule.id}: proto=${r.proto} src=${r.srcPort} dst=${r.dstPort}`);
        continue;
      }

      // Añadir con comentario para poder identificarla después
      try {
        iptAdd(proto, srcPort, dstPort);
        applied++;
      } catch (e) {
        errors.push(`[${proto.toUpperCase()}] :${srcPort}→:${dstPort} — ${e.message}`);
      }
    }
  }

  // 4. Persistir reglas para que sobrevivan a reinicios (requiere iptables-persistent)
  try {
    iptSave();
  } catch(e) { /* no crítico si no está instalado */ }

  if (errors.length > 0) {
    return { ok: false, applied, errors };
  }
  return { ok: true, msg: `${applied} regla(s) aplicadas correctamente`, applied };
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET estado del firewall
router.get('/', (req, res) => {
  const fw = loadFirewall();
  // Leer reglas reales activas en iptables para mostrar estado real
  try {
    const out = iptList();
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
router.post('/toggle', (req, res) => {
  const fw = loadFirewall();
  fw.enabled = !fw.enabled;
  saveFirewall(fw);
  const result = applyIptables(fw);
  res.json({ enabled: fw.enabled, ...result });
});

// POST añadir regla
router.post('/rules', (req, res) => {
  const fw = loadFirewall();
  const srcPort = parseInt(req.body.srcPort);
  const dstPort = parseInt(req.body.dstPort);
  const proto   = ['tcp','udp','both'].includes(req.body.proto) ? req.body.proto : 'tcp';

  if (!isValidPort(srcPort) || !isValidPort(dstPort))
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
router.put('/rules/:id', (req, res) => {
  const fw  = loadFirewall();
  const idx = fw.rules.findIndex(r => r.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Regla no encontrada' });

  const updated = { ...fw.rules[idx], ...req.body, id: fw.rules[idx].id };
  updated.srcPort = parseInt(updated.srcPort);
  updated.dstPort = parseInt(updated.dstPort);
  if (!['tcp','udp','both'].includes(updated.proto)) updated.proto = 'tcp';
  if (!isValidPort(updated.srcPort) || !isValidPort(updated.dstPort))
    return res.status(400).json({ error: 'Puertos inválidos' });

  fw.rules[idx] = updated;
  saveFirewall(fw);
  const applyResult = fw.enabled ? applyIptables(fw) : { ok: true, msg: 'Guardada (firewall inactivo)' };
  res.json({ rule: fw.rules[idx], applyResult });
});

// DELETE eliminar regla
router.delete('/rules/:id', (req, res) => {
  const fw = loadFirewall();
  fw.rules = fw.rules.filter(r => r.id !== parseInt(req.params.id));
  saveFirewall(fw);
  const applyResult = fw.enabled ? applyIptables(fw) : { ok: true, msg: 'Eliminada (firewall inactivo)' };
  res.json({ ok: true, applyResult });
});

// POST re-aplicar todas las reglas activas ahora mismo
router.post('/apply', (req, res) => {
  const fw = loadFirewall();
  const result = applyIptables(fw);
  res.json(result);
});

module.exports = router;
