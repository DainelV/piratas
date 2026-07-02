const { db } = require('../db/database');
const { capacidadBarco, costoReparacion } = require('./economia');
const { aplicarProduccion } = require('./production');

const NIVEL_MAXIMO = 100;

function nivelBarco(user) {
  return Math.round(((user.velas + user.canones + user.casco) / 3) * 100) / 100;
}

function evaluarSubida(user) {
  if (user.nivel >= NIVEL_MAXIMO) {
    return { puede: false, razon: 'nivel_maximo' };
  }

  const proximoNivel = user.nivel + 1;
  const costoNivel = proximoNivel * 10; // 10 oro por nivel
  const costoRep = costoReparacion(user);
  const costoTotal = costoNivel + costoRep;

  // A partir del nivel 3 se necesitan referidos
  const referidosRequeridos = user.nivel >= 3 ? Math.floor((user.nivel - 1) / 10) + 1 : 0;

  if (user.oro < costoTotal) {
    return { puede: false, razon: 'oro_insuficiente', costo: costoNivel, costoReparacion: costoRep, costoTotal, referidosRequeridos };
  }

  if (user.piratas < referidosRequeridos) {
    return { puede: false, razon: 'referidos_insuficientes', costo: costoNivel, costoReparacion: costoRep, costoTotal, referidosRequeridos };
  }

  return { puede: true, costo: costoNivel, costoReparacion: costoRep, costoTotal, referidosRequeridos };
}

function subirNivel(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  const evaluacion = evaluarSubida(user);
  if (!evaluacion.puede) {
    return { ok: false, ...evaluacion };
  }

  const { costo, costoReparacion: costoRep, costoTotal } = evaluacion;

  db.transaction(() => {
    // Descontar oro
    db.prepare('UPDATE users SET oro = oro - ? WHERE id = ?').run(costoTotal, userId);
    // Subir nivel
    db.prepare('UPDATE users SET nivel = nivel + 1 WHERE id = ?').run(userId);
    // Reparar barco al 100%
    db.prepare('UPDATE users SET hp = hp_max WHERE id = ?').run(userId);
  })();

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return {
    ok: true,
    costoPagado: costo,
    costoReparacionPagado: costoRep,
    costoTotalPagado: costoTotal,
    user: updatedUser
  };
}

module.exports = {
  evaluarSubida,
  nivelBarco,
  subirNivel,
  NIVEL_MAXIMO
};