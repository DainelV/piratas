const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { DIVISOR_CAPACIDAD_POR_HP } = require('../services/economia');

const router = express.Router();
const REFERRAL_THRESHOLD_SECONDS = 5 * 60; // 5 minutos
const MAX_GAP_TO_COUNT_SECONDS = 60;
const MAX_INCREMENT_PER_TICK = 30;

// POST /api/activity/heartbeat
router.post('/heartbeat', requireAuth, (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  user = aplicarProduccion(user.id);

  const now = new Date();
  const last = user.last_heartbeat_at ? new Date(user.last_heartbeat_at) : now;
  const gapSeconds = Math.max(0, (now - last) / 1000);

  let increment = 0;
  if (gapSeconds <= MAX_GAP_TO_COUNT_SECONDS) {
    increment = Math.min(gapSeconds, MAX_INCREMENT_PER_TICK);
  }

  const newActiveSeconds = user.active_seconds + Math.round(increment);

  const applyReward = db.transaction(() => {
    db.prepare(`
      UPDATE users SET active_seconds = ?, last_heartbeat_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newActiveSeconds, user.id);

    const cruzaUmbral = user.referred_by && !user.referral_rewarded && newActiveSeconds >= REFERRAL_THRESHOLD_SECONDS;
    if (cruzaUmbral) {
      // +100 oro al nuevo usuario, topeado por capacidad
      db.prepare(`
        UPDATE users SET oro = MIN(oro + 100, hp_max / ?), referral_rewarded = 1 WHERE id = ?
      `).run(DIVISOR_CAPACIDAD_POR_HP, user.id);
      // +1 pirata al referidor
      db.prepare('UPDATE users SET piratas = piratas + 1 WHERE id = ?').run(user.referred_by);
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