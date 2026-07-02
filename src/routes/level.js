const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { aplicarProduccion, infoProduccion } = require('../services/production');
const { evaluarSubida, nivelBarco, subirNivel, NIVEL_MAXIMO } = require('../services/leveling');

const router = express.Router();

function estadoParaUsuario(user) {
  const evaluacion = evaluarSubida(user);
  return {
    nivel: user.nivel,
    nivelMaximo: NIVEL_MAXIMO,
    nivelBarco: nivelBarco(user),
    oro: user.oro,
    piratas: user.piratas,
    puedeSubir: evaluacion.puede,
    razon: evaluacion.razon,
    costoProximoNivel: evaluacion.costo,
    costoReparacion: evaluacion.costoReparacion,
    costoTotalProximoNivel: evaluacion.costoTotal,
    referidosRequeridos: evaluacion.referidosRequeridos,
    produccion: infoProduccion(user.nivel)
  };
}

/**
 * GET /api/level/estado
 * Info de nivel del jugador: nivel actual, nivel del barco (promedio
 * de velas/cañones/casco), costo en oro y referidos requeridos
 * para el próximo nivel (incluye la reparación automática a 100% que
 * se paga al subir), y si ya puede subir.
 */
router.get('/estado', requireAuth, (req, res) => {
  const user = aplicarProduccion(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  res.json(estadoParaUsuario(user));
});

/**
 * POST /api/level/subir
 * Intenta subir un nivel. Reglas:
 *  - Nivel 1 a 3: solo pide oro
 *  - Nivel 3+: pide oro + un mínimo de referidos activos (piratas),
 *    y ese mínimo sube +1 cada 10 niveles
 * Cada nivel aumenta la producción (ya calculada por nivel), desbloquea
 * mejoras (el tope de mejora de velas/cañones/casco queda ligado al nivel),
 * y paga automáticamente la reparación del barco a 100% de HP (el costo
 * de esa reparación se suma al costo del nivel).
 */
router.post('/subir', requireAuth, (req, res) => {
  const resultado = subirNivel(req.session.userId);

  if (!resultado.ok) {
    const mensajes = {
      nivel_maximo: 'Ya estás en el nivel máximo (100)',
      oro_insuficiente: `Te falta oro. Necesitás ${resultado.costoTotal} en total (${resultado.costo} del nivel + ${resultado.costoReparacion} de reparación).`,
      referidos_insuficientes: `Te faltan referidos activos. Necesitás ${resultado.referidosRequeridos}.`,
      usuario_no_encontrado: 'No autenticado'
    };
    return res.status(400).json({
      error: mensajes[resultado.razon] || 'No se pudo subir de nivel',
      razon: resultado.razon,
      costo: resultado.costo,
      costoReparacion: resultado.costoReparacion,
      costoTotal: resultado.costoTotal,
      referidosRequeridos: resultado.referidosRequeridos
    });
  }

  res.json({
    ok: true,
    costoPagado: resultado.costoPagado,
    costoReparacionPagado: resultado.costoReparacionPagado,
    costoTotalPagado: resultado.costoTotalPagado,
    estado: estadoParaUsuario(resultado.user)
  });
});

module.exports = router;
