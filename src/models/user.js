function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    oro: user.oro,
    piratas: user.piratas,
    referredBy: user.referred_by,
    referralRewarded: !!user.referral_rewarded,
    activeSeconds: user.active_seconds,
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