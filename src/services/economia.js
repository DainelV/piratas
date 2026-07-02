const DIVISOR_CAPACIDAD_POR_HP = 10;

function capacidadBarco(user) {
  return Math.floor(user.hp_max / DIVISOR_CAPACIDAD_POR_HP);
}

function costoReparacion(user) {
  const faltante = user.hp_max - user.hp;
  return faltante; // 1 oro por punto de HP faltante
}

module.exports = {
  DIVISOR_CAPACIDAD_POR_HP,
  capacidadBarco,
  costoReparacion
};