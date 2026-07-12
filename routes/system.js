const express = require('express');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const router = express.Router();

// ─── API: Información del sistema ────────────────────────────────────────────
router.get('/', (req, res) => {
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

module.exports = router;
