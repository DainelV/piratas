const { db } = require('../db/database');
const { capacidadBarco } = require('./economia');

const ORO_POR_MINUTO_POR_NIVEL = 0.01;
const NIVEL_MAXIMO = 100;

function produccionPorMinuto(nivel) {
  return nivel * ORO_POR_MINUTO_POR_NIVEL;
}

function aplicarProduccion(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const ahora = new Date();
  const ultima = user.last_production_at ? new Date(user.last_production_at) : ahora;
  const minutosTranscurridos = Math.max(0, (ahora - ultima) / 60000);

  if (minutosTranscurridos <= 0) {
    return user;
  }

  const tasa = produccionPorMinuto(user.nivel);
  const producido = tasa * minutosTranscurridos;
  const capacidad = capacidadBarco(user);
  const nuevoOro = Math.min(capacidad, Math.round((user.oro + producido) * 1e6) / 1e6);

  db.prepare(`
    UPDATE users SET oro = ?, last_production_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(nuevoOro, userId);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

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