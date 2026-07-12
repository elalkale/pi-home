const express = require('express');
const http = require('http');
const router = express.Router();

// ─── API: Pi-hole v6 ──────────────────────────────────────────────────────────
const PIHOLE_BASE = process.env.PIHOLE_URL || 'http://localhost';
const PIHOLE_PASS = process.env.PIHOLE_PASSWORD || '';

let piholeSession = { sid: null, expiresAt: 0 };

async function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Respuesta no válida de Pi-hole')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getPiholeSession() {
  // Reutilizar sesión si aún es válida (con 60s de margen)
  if (piholeSession.sid && Date.now() < piholeSession.expiresAt - 60000) {
    return piholeSession.sid;
  }

  const payload = JSON.stringify({ password: PIHOLE_PASS });
  const url = new URL(`${PIHOLE_BASE}/api/auth`);
  const res = await httpRequest({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  const sid = res.body?.session?.sid;
  const validity = res.body?.session?.validity || 1800;
  if (!sid) throw new Error('No se pudo autenticar con Pi-hole');

  piholeSession = { sid, expiresAt: Date.now() + validity * 1000 };
  return sid;
}

async function piholeGet(path) {
  const sid = await getPiholeSession();
  const url = new URL(`${PIHOLE_BASE}${path}`);
  return httpRequest({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + (url.search || ''),
    method: 'GET',
    headers: { 'X-FTL-SID': sid }
  });
}

async function piholePost(path, data = {}) {
  const sid = await getPiholeSession();
  const payload = JSON.stringify(data);
  const url = new URL(`${PIHOLE_BASE}${path}`);
  return httpRequest({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-FTL-SID': sid
    }
  }, payload);
}

// GET estadísticas
router.get('/', async (req, res) => {
  try {
    const [summary, clients] = await Promise.all([
      piholeGet('/api/stats/summary'),
      piholeGet('/api/stats/clients')
    ]);

    const s = summary.body;
    res.json({
      status:            s.status ?? 'unknown',
      domains_blocked:   s.gravity?.domains_being_blocked ?? 0,
      dns_queries_today: s.queries?.total ?? 0,
      ads_blocked_today: s.queries?.blocked ?? 0,
      ads_percent:       parseFloat(s.queries?.percent_blocked ?? 0).toFixed(1),
      unique_clients:    s.clients?.active ?? 0,
      queries_cached:    s.queries?.cached ?? 0,
      replies_ip:        s.replies?.IP ?? 0,
    });
  } catch (e) {
    res.status(503).json({ error: 'No se puede conectar con Pi-hole', detail: e.message });
  }
});

// POST enable / disable
router.post('/toggle', async (req, res) => {
  try {
    const { enable, seconds } = req.body;
    const path = enable ? '/api/dns/blocking' : '/api/dns/blocking';
    const body = enable
      ? { blocking: true }
      : { blocking: false, ...(seconds ? { timer: seconds } : {}) };

    const result = await piholePost(path, body);
    res.json({ blocking: result.body?.blocking });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

module.exports = router;
