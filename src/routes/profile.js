const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { toPublicUser } = require('../models/user');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { evaluarSubida } = require('../services/leveling');
const { estadoReparacion } = require('../services/repair');

const router = express.Router();

/**
 * GET /api/profile
 * Ficha completa del jugador logueado: nivel, HP, oro, piratas,
 * las tres piezas del barco (velas, cañones, casco), producción pasiva
 * (actual y del próximo nivel), requisitos para subir de nivel, y
 * estado de reparación (si puede pelear y cuánto costaría reparar a 100%).
 */
router.get('/', requireAuth, (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Suma lo producido offline desde la última vez que se calculó.
  user = aplicarProduccion(user.id);

  res.json({
    profile: toPublicUser(user),
    produccion: infoProduccion(user.nivel),
    nivelJugador: evaluarSubida(user),
    reparacion: estadoReparacion(user)
  });
});

module.exports = router;
