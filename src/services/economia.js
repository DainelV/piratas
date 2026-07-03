// Capacidad máxima de oro que puede almacenar un barco, en función
// del HP máximo del casco: capacidad = hp_max / 10. Se aplica de forma
// consistente en toda la economía (producción, referidos y PvP).
const DIVISOR_CAPACIDAD_POR_HP = 10;

function capacidadBarco(user) {
  return Math.round((user.hp_max / DIVISOR_CAPACIDAD_POR_HP) * 100) / 100;
}

/**
 * Cuánto espacio libre le queda a un usuario en su bodega.
 */
function espacioDisponible(user) {
  return Math.max(0, capacidadBarco(user) - user.oro);
}

module.exports = { DIVISOR_CAPACIDAD_POR_HP, capacidadBarco, espacioDisponible };
