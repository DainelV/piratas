const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { DIVISOR_CAPACIDAD_POR_HP } = require('../services/economia');

const router = express.Router();

const REFERRAL_THRESHOLD_SECONDS = 5 * 60; // 5 minutos
const MAX_GAP_TO_COUNT_SECONDS = 60; // si pasó más de esto entre heartbeats, no se cuenta ese hueco
const MAX_INCREMENT_PER_TICK = 30; // tope por heartbeat, para evitar trampas

/**
 * POST /api/activity/heartbeat
 *
 * El front llama esto cada ~20s mientras la pestaña está visible.
 * El tiempo activo NO tiene que ser continuo: se va acumulando en
 * `active_seconds` a través de múltiples sesiones/visitas. Apenas
 * un usuario referido acumula 5 minutos totales, se paga el referido
 * una única vez:
 *   +100 oro al usuario nuevo
 *   +1 pirata al referidor
 */
router.post('/heartbeat', requireAuth, (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    console.log("no user")
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Producción pasiva de oro: se calcula siempre, con reloj real,
  // más allá de si el usuario está activo o no en este momento.
  user = aplicarProduccion(user.id);

  const now = new Date();
  const last = user.last_heartbeat_at ? new Date(user.last_heartbeat_at) : now;
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

  const applyReward = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET active_seconds = ?, last_heartbeat_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newActiveSeconds, user.id);

    const cruzaUmbral =
      user.referred_by &&
      !user.referral_rewarded &&
      newActiveSeconds >= REFERRAL_THRESHOLD_SECONDS;

    if (cruzaUmbral) {
      // +100 oro al nuevo usuario, topeado por la capacidad de su bodega
      db.prepare(`
        UPDATE users
        SET oro = MIN(oro + 100, hp_max / ?), referral_rewarded = 1
        WHERE id = ?
      `).run(DIVISOR_CAPACIDAD_POR_HP, user.id);

      // +1 pirata al referidor
      db.prepare('UPDATE users SET piratas = piratas + 1 WHERE id = ?')
        .run(user.referred_by);

      return true;
    }
    return false;
  });

  const referidoAcreditado = applyReward();

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  res.json({
    activeSeconds: updated.active_seconds,
    remainingForReferral: user.referred_by && !updated.referral_rewarded
      ? Math.max(0, REFERRAL_THRESHOLD_SECONDS - updated.active_seconds)
      : null,
    referidoAcreditado,
    oro: updated.oro,
    piratas: updated.piratas,
    produccion: infoProduccion(updated.nivel)
  });
});

module.exports = router;
