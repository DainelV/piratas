const { db } = require('../db/database');
const { costoReparacion } = require('./economia');

const PORCENTAJE_MINIMO_PARA_PELEAR = 0.30;

function estadoReparacion(user) {
  const hpPct = user.hp / user.hp_max;
  return {
    hp: user.hp,
    hpMax: user.hp_max,
    hpPct: Math.round(hpPct * 100),
    puedePelear: hpPct >= PORCENTAJE_MINIMO_PARA_PELEAR,
    costoReparacion: costoReparacion(user)
  };
}

function reparar(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  if (user.hp >= user.hp_max) {
    return { ok: true, yaEstabaCompleto: true, user };
  }

  const costo = costoReparacion(user);
  if (user.oro < costo) {
    return { ok: false, razon: 'oro_insuficiente', costo };
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET oro = oro - ? WHERE id = ?').run(costo, userId);
    db.prepare('UPDATE users SET hp = hp_max WHERE id = ?').run(userId);
  })();

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return { ok: true, yaEstabaCompleto: false, costoPagado: costo, user: updatedUser };
}

module.exports = {
  estadoReparacion,
  reparar,
  PORCENTAJE_MINIMO_PARA_PELEAR
};