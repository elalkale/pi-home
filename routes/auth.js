const express = require('express');
const router = express.Router();

// Endpoint para que el frontend valide una key sin ejecutar ninguna acción real
router.post('/verify', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
