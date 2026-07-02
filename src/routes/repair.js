const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { estadoReparacion, reparar, PORCENTAJE_MINIMO_PARA_PELEAR } = require('../services/repair');
const { toPublicUser } = require('../models/user');

const router = express.Router();

/**
 * GET /api/repair/estado
 * Estado de reparación del barco: HP actual/máximo, si puede pelear
 * (>= 30% HP) y cuánto costaría repararlo al 100% ahora mismo.
 */
router.get('/estado', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  res.json({
    ...estadoReparacion(user),
    umbralMinimoPct: PORCENTAJE_MINIMO_PARA_PELEAR * 100
  });
});

/**
 * POST /api/repair
 * Repara el barco al 100% de HP. Costo en oro = HP faltante hasta
 * el 100% (1 oro por punto de HP). Reparación completa únicamente.
 */
router.post('/', requireAuth, (req, res) => {
  const resultado = reparar(req.session.userId);

  if (!resultado.ok) {
    const mensajes = {
      oro_insuficiente: `Te falta oro. Necesitás ${resultado.costo}.`,
      usuario_no_encontrado: 'No autenticado'
    };
    return res.status(400).json({
      error: mensajes[resultado.razon] || 'No se pudo reparar',
      razon: resultado.razon,
      costo: resultado.costo
    });
  }

  res.json({
    ok: true,
    yaEstabaCompleto: resultado.yaEstabaCompleto,
    costoPagado: resultado.costoPagado,
    user: toPublicUser(resultado.user)
  });
});

module.exports = router;
