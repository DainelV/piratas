const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { parseFechaDB } = require('../utils/fechas');

const router = express.Router();

const MAX_GAP_TO_COUNT_SECONDS = 60; // si pasó más de esto entre heartbeats, no se cuenta ese hueco
const MAX_INCREMENT_PER_TICK = 30; // tope por heartbeat, para evitar trampas

/**
 * POST /api/activity/heartbeat
 *
 * El front llama esto cada ~20s mientras la pestaña está visible.
 * Acumula `active_seconds` (tiempo activo total, informativo) y aplica
 * la producción pasiva de oro. El bono de referido YA NO depende de
 * esto — se acredita de una al registrarse (ver routes/auth.js).
 */
router.post('/heartbeat', requireAuth, (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Producción pasiva de oro: se calcula siempre, con reloj real,
  // más allá de si el usuario está activo o no en este momento.
  user = aplicarProduccion(user.id);

  const now = new Date();
  const last = user.last_heartbeat_at ? parseFechaDB(user.last_heartbeat_at) : now;
  const gapSeconds = Math.max(0, (now - last) / 1000);

  // Si el hueco es razonable (pestaña estuvo abierta y activa), lo sumamos
  // acotado a un máximo por tick. Huecos más grandes (pestaña cerrada,
  // compu dormida, etc.) no suman tiempo activo, pero tampoco rompen nada:
  // simplemente no cuentan, y se sigue acumulando desde acá.
  let increment = 0;
  if (gapSeconds <= MAX_GAP_TO_COUNT_SECONDS) {
    increment = Math.min(gapSeconds, MAX_INCREMENT_PER_TICK);
  }

  const newActiveSeconds = user.active_seconds + Math.round(increment);

  db.prepare(`
    UPDATE users
    SET active_seconds = ?, last_heartbeat_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newActiveSeconds, user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  res.json({
    activeSeconds: updated.active_seconds,
    oro: updated.oro,
    piratas: updated.piratas,
    produccion: infoProduccion(updated.nivel)
  });
});

module.exports = router;
