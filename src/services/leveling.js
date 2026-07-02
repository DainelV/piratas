const { db } = require('../db/database');
const { aplicarProduccion } = require('./production');
const { costoReparacion } = require('./repair');

const NIVEL_MAXIMO = 100;

// A partir de este nivel, subir empieza a pedir referidos además de oro.
const NIVEL_DESDE_QUE_PIDE_REFERIDOS = 3;

// Cada 10 niveles (a partir del anterior) pide un referido activo más.
const NIVELES_POR_REFERIDO_EXTRA = 10;

/**
 * Costo en oro para subir DE `nivelActual` AL siguiente.
 *
 * No se especificó una tabla de costos exacta, así que se usa una curva
 * cuadrática simple (10 * nivel²) que crece de forma predecible:
 *   nivel 1 -> 2:   10 oro
 *   nivel 2 -> 3:   40 oro
 *   nivel 3 -> 4:   90 oro
 *   nivel 50 -> 51: 25.000 oro
 * Es fácil de ajustar cambiando FACTOR_COSTO si se quiere otra curva.
 */
const FACTOR_COSTO = 10;
function costoOro(nivelActual) {
  return Math.round(FACTOR_COSTO * nivelActual * nivelActual);
}

/**
 * Referidos activos (piratas) necesarios para subir DE `nivelActual`
 * al siguiente. Es un requisito de "tener al menos X", no se consume.
 *
 * - Niveles 1 y 2: 0 (solo hace falta oro)
 * - Nivel 3 en adelante: 1, y sube +1 cada 10 niveles
 *     nivel 3-12  -> 1 referido
 *     nivel 13-22 -> 2 referidos
 *     nivel 23-32 -> 3 referidos
 *     ...
 */
function referidosRequeridos(nivelActual) {
  if (nivelActual < NIVEL_DESDE_QUE_PIDE_REFERIDOS) return 0;
  const escalones = Math.floor((nivelActual - NIVEL_DESDE_QUE_PIDE_REFERIDOS) / NIVELES_POR_REFERIDO_EXTRA);
  return 1 + escalones;
}

/**
 * Nivel del barco = promedio de velas, cañones y casco.
 * Es una métrica aparte del nivel del jugador (que sube con oro/referidos).
 */
function nivelBarco(user) {
  return Math.round(((user.velas + user.canones + user.casco) / 3) * 100) / 100;
}

/**
 * Evalúa si el usuario puede subir de nivel ahora mismo, sin aplicar cambios.
 * Subir de nivel también paga la reparación automática del barco a 100%,
 * así que el costo total en oro es costoNivel + costoReparación.
 */
function evaluarSubida(user) {
  if (user.nivel >= NIVEL_MAXIMO) {
    return { puede: false, razon: 'nivel_maximo', costo: null, costoReparacion: null, costoTotal: null, referidosRequeridos: null };
  }

  const costoNivel = costoOro(user.nivel);
  const costoRep = costoReparacion(user);
  const costoTotal = Math.round((costoNivel + costoRep) * 100) / 100;
  const refReq = referidosRequeridos(user.nivel);

  if (user.oro < costoTotal) {
    return {
      puede: false,
      razon: 'oro_insuficiente',
      costo: costoNivel,
      costoReparacion: costoRep,
      costoTotal,
      referidosRequeridos: refReq
    };
  }
  if (user.piratas < refReq) {
    return {
      puede: false,
      razon: 'referidos_insuficientes',
      costo: costoNivel,
      costoReparacion: costoRep,
      costoTotal,
      referidosRequeridos: refReq
    };
  }
  return {
    puede: true,
    razon: null,
    costo: costoNivel,
    costoReparacion: costoRep,
    costoTotal,
    referidosRequeridos: refReq
  };
}

/**
 * Intenta subir de nivel UNA vez: gasta oro (costo del nivel +
 * reparación automática del barco a 100%, ver evaluarSubida), sube el
 * nivel, y deja el barco reparado al 100% de HP.
 * No toca piratas ya que los referidos son un requisito, no un recurso
 * que se consume.
 * Devuelve { ok, user, ...evaluación } — si ok es false, user no cambia.
 */
function subirNivel(userId) {
  // Aseguramos que el oro esté al día (incluye producción offline)
  // antes de chequear si alcanza para subir.
  let user = aplicarProduccion(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  const evaluacion = evaluarSubida(user);
  if (!evaluacion.puede) {
    return { ok: false, ...evaluacion, user };
  }

  db.prepare(`
    UPDATE users
    SET oro = oro - ?, nivel = nivel + 1, hp = hp_max
    WHERE id = ?
  `).run(evaluacion.costoTotal, userId);

  const userActualizado = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  return {
    ok: true,
    user: userActualizado,
    costoPagado: evaluacion.costo,
    costoReparacionPagado: evaluacion.costoReparacion,
    costoTotalPagado: evaluacion.costoTotal
  };
}

module.exports = {
  NIVEL_MAXIMO,
  NIVEL_DESDE_QUE_PIDE_REFERIDOS,
  costoOro,
  referidosRequeridos,
  nivelBarco,
  evaluarSubida,
  subirNivel
};
