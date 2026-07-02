const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { toPublicUser } = require('../models/user');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { evaluarSubida } = require('../services/leveling');
const { capacidadBarco } = require('../services/economia');
const { estadoReparacion } = require('../services/repair');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  user = aplicarProduccion(user.id);

  res.json({
    profile: toPublicUser(user),
    produccion: infoProduccion(user.nivel),
    nivelJugador: evaluarSubida(user),
    capacidadBodega: capacidadBarco(user),
    reparacion: estadoReparacion(user)
  });
});

module.exports = router;