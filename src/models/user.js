/**
 * Convierte una fila cruda de la tabla `users` en el objeto que
 * se expone al front (sin password_hash ni columnas internas).
 */
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    isAdmin: !!user.is_admin,

    // Recursos / referidos
    oro: user.oro,
    piratas: user.piratas,
    referredBy: user.referred_by,
    referralRewarded: !!user.referral_rewarded,
    activeSeconds: user.active_seconds,

    // Barco / jugador
    nivel: user.nivel,
    hp: user.hp,
    hpMax: user.hp_max,
    velas: user.velas,
    canones: user.canones,
    casco: user.casco,
    nivelBarco: Math.round(((user.velas + user.canones + user.casco) / 3) * 100) / 100,
    pvpVictorias: user.pvp_victorias,
    pvpDerrotas: user.pvp_derrotas,

    createdAt: user.created_at
  };
}

module.exports = { toPublicUser };
