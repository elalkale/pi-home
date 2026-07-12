const crypto = require('crypto');

// ─── Auth: API key para endpoints que modifican estado ───────────────────────
// El servidor ejecuta comandos con sudo (iptables, systemctl), así que cualquier
// POST/PUT/DELETE bajo /api debe venir acompañado de la cabecera X-API-Key.
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.warn('\n⚠️  ATENCIÓN: no hay API_KEY definida en .env');
  console.warn('   Todos los endpoints que modifican estado (POST/PUT/DELETE) quedarán');
  console.warn('   BLOQUEADOS hasta que definas API_KEY en tu archivo .env.\n');
}

// Comparación en tiempo constante para evitar timing attacks al validar la key
function isValidApiKey(provided) {
  if (!API_KEY || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Middleware: exige X-API-Key en toda mutación (POST/PUT/DELETE) bajo /api/*
// Las peticiones GET (solo lectura) quedan sin restringir.
function requireApiKey(req, res, next) {
  const mutating = ['POST', 'PUT', 'DELETE'].includes(req.method);
  if (!mutating) return next();

  const provided = req.get('X-API-Key');
  if (!isValidApiKey(provided)) {
    return res.status(401).json({ error: 'No autorizado · falta o es incorrecta la cabecera X-API-Key' });
  }
  next();
}

module.exports = { requireApiKey, isValidApiKey };
