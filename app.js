const path = require('path');
const express = require('express');

const { PUBLIC_DIR } = require('./config/paths');
const { requireApiKey } = require('./middleware/auth');

const authRoutes        = require('./routes/auth');
const systemRoutes      = require('./routes/system');
const servicesRoutes    = require('./routes/services');
const firewallRoutes    = require('./routes/firewall');
const sysservicesRoutes = require('./routes/sysservices');
const piholeRoutes      = require('./routes/pihole');

const app = express();

// Servir archivos estáticos desde /public
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use('/api', requireApiKey);

// ─── Routers ──────────────────────────────────────────────────────────────────
// Cada dominio vive en su propio archivo bajo routes/, auditable por separado.
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/firewall', firewallRoutes);
app.use('/api/sysservices', sysservicesRoutes);
app.use('/api/pihole', piholeRoutes);

// ─── Ruta principal ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

module.exports = app;
