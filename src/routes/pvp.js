const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listaEnemigos, pelear, rangoNiveles, cooldownRestante, cooldownMinutos } = require('../services/pvp');
const { estadoReparacion } = require('../services/repair');
const { db } = require('../db/database');

const router = express.Router();

router.get('/enemigos', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const rango = rangoNiveles(user.nivel);
  const enemigos = listaEnemigos(req.session.userId);
  const minutosRestantes = cooldownRestante(user);

  res.json({
    rango,
    enemigos,
    cooldown: {
      enCooldown: minutosRestantes > 0,
      minutosRestantes,
      cooldownTotalMinutos: cooldownMinutos(user.nivel)
    },
    reparacion: estadoReparacion(user)
  });
});

router.post('/pelear', requireAuth, (req, res) => {
  const { enemigoId } = req.body || {};
  const rivalId = Number(enemigoId);

  if (!Number.isInteger(rivalId)) {
    return res.status(400).json({ error: 'enemigoId inválido' });
  }

  const resultado = pelear(req.session.userId, rivalId);

  if (!resultado.ok) {
    if (resultado.razon === 'en_cooldown') {
      return res.status(429).json({
        error: `Todavía estás en cooldown. Esperá ${resultado.minutosRestantes} min más.`,
        razon: resultado.razon,
        minutosRestantes: resultado.minutosRestantes
      });
    }

    if (resultado.razon === 'necesita_reparar') {
      return res.status(400).json({
        error: `Tu barco está muy dañado (menos del 30% de HP). Repáralo antes de pelear (costo: ${resultado.costoReparacion} oro).`,
        razon: resultado.razon,
        costoReparacion: resultado.costoReparacion
      });
    }

    const mensajes = {
      usuario_no_encontrado: 'No se encontró al enemigo elegido',
      fuera_de_rango: 'Ese rival ya no está dentro de tu rango de nivel',
      no_podes_pelear_contra_vos_mismo: 'No podés pelear contra vos mismo'
    };

    return res.status(400).json({
      error: mensajes[resultado.razon] || 'No se pudo iniciar la batalla',
      razon: resultado.razon
    });
  }

  res.json(resultado);
});

module.exports = router;