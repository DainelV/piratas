const { db } = require('../db/database');

// Por debajo de este % de HP, el barco no puede pelear hasta reparar.
const PORCENTAJE_MINIMO_PARA_PELEAR = 0.3; // 30%

// Costo de reparación: 1 oro por cada punto de HP faltante hasta el 100%.
const ORO_POR_PUNTO_DE_HP = 1;

function porcentajeHp(user) {
  if (user.hp_max <= 0) return 0;
  return user.hp / user.hp_max;
}

/**
 * HP faltante hasta el 100% (nunca negativo).
 */
function hpFaltante(user) {
  return Math.max(0, Math.round((user.hp_max - user.hp) * 100) / 100);
}

/**
 * Costo en oro para reparar el barco a 100%.
 */
function costoReparacion(user) {
  return Math.round(hpFaltante(user) * ORO_POR_PUNTO_DE_HP * 100) / 100;
}

/**
 * ¿Puede este barco entrar en batalla ahora mismo? Falso si su HP
 * cayó por debajo del 30% del total.
 */
function puedePelear(user) {
  return porcentajeHp(user) >= PORCENTAJE_MINIMO_PARA_PELEAR;
}

/**
 * Estado de reparación para mostrar en pantalla.
 */
function estadoReparacion(user) {
  return {
    hp: user.hp,
    hpMax: user.hp_max,
    porcentaje: Math.round(porcentajeHp(user) * 10000) / 100, // 0-100 con 2 decimales
    puedePelear: puedePelear(user),
    hpFaltante: hpFaltante(user),
    costoReparacion: costoReparacion(user)
  };
}

/**
 * Repara el barco a 100% si el usuario tiene oro suficiente.
 * Es una reparación completa (no parcial): o se paga todo el costo,
 * o no se repara nada.
 */
function reparar(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  const costo = costoReparacion(user);
  if (costo <= 0) {
    return { ok: true, yaEstabaCompleto: true, costoPagado: 0, user };
  }
  if (user.oro < costo) {
    return { ok: false, razon: 'oro_insuficiente', costo, oroActual: user.oro };
  }

  db.prepare('UPDATE users SET oro = oro - ?, hp = hp_max WHERE id = ?').run(costo, userId);

  const actualizado = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return { ok: true, yaEstabaCompleto: false, costoPagado: costo, user: actualizado };
}

module.exports = {
  PORCENTAJE_MINIMO_PARA_PELEAR,
  ORO_POR_PUNTO_DE_HP,
  porcentajeHp,
  hpFaltante,
  costoReparacion,
  puedePelear,
  estadoReparacion,
  reparar
};
