const { db } = require('../db/database');
const { capacidadBarco } = require('./economia');

// Nivel 1 = 0.01 oro/min. Escala linealmente con el nivel del barco.
const ORO_POR_MINUTO_POR_NIVEL = 10;
const NIVEL_MAXIMO = 100;

/**
 * Producción de oro por minuto para un nivel dado.
 */
function produccionPorMinuto(nivel) {
  return nivel * ORO_POR_MINUTO_POR_NIVEL;
}

/**
 * Aplica la producción pasiva acumulada desde la última vez que se
 * calculó (last_production_at) hasta ahora, la suma a oro, y
 * actualiza la marca de tiempo. Funciona igual haya estado el usuario
 * online u offline: es tiempo de reloj real, no heartbeats.
 *
 * La producción está limitada por la capacidad de bodega del barco
 * (hp_max / 10): si ya está llena, se sigue "produciendo" en el
 * sentido de que el tiempo avanza, pero el excedente no entra.
 *
 * Devuelve la fila de usuario ya actualizada.
 */
function aplicarProduccion(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    console.log("no user prod")
    return null;}

  const ahora = new Date();
  const ultima = user.last_production_at ? new Date(user.last_production_at) : ahora;
  const minutosTranscurridos = Math.max(0, (ahora - ultima) / 60000);

  if (minutosTranscurridos <= 0) {
    return user;
  }

  const tasa = produccionPorMinuto(user.nivel);
  const producido = tasa * minutosTranscurridos;
  const capacidad = capacidadBarco(user);

  // Redondeamos a 6 decimales al guardar para evitar arrastrar
  // basura de punto flotante en la base de datos, y topeamos por
  // la capacidad de bodega.
  const nuevoOro = Math.min(
    capacidad,
    Math.round((user.oro + producido) * 1e6) / 1e6
  );

  db.prepare(`
    UPDATE users
    SET oro = ?, last_production_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nuevoOro, userId);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

/**
 * Info de producción para mostrar en pantalla: la tasa actual y la
 * tasa que tendría en el próximo nivel (si ya está en el máximo,
 * "próximo nivel" es igual al actual).
 */
function infoProduccion(nivel) {
  const siguienteNivel = Math.min(nivel + 1, NIVEL_MAXIMO);
  return {
    nivelActual: nivel,
    oroPorMinuto: produccionPorMinuto(nivel),
    oroPorHora: produccionPorMinuto(nivel) * 60,
    proximoNivel: siguienteNivel,
    oroPorMinutoProximoNivel: produccionPorMinuto(siguienteNivel),
    oroPorHoraProximoNivel: produccionPorMinuto(siguienteNivel) * 60,
    esNivelMaximo: nivel >= NIVEL_MAXIMO
  };
}

module.exports = {
  aplicarProduccion,
  infoProduccion,
  produccionPorMinuto,
  ORO_POR_MINUTO_POR_NIVEL,
  NIVEL_MAXIMO
};
