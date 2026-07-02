const { db } = require('../db/database');
const { aplicarProduccion } = require('./production');
const { estadoReparacion } = require('./repair');

const COOLDOWN_BASE_MINUTOS = 5;
const RANGO_NIVELES = 5;

function rangoNiveles(nivel) {
  return {
    min: Math.max(1, nivel - RANGO_NIVELES),
    max: nivel + RANGO_NIVELES
  };
}

function cooldownMinutos(nivel) {
  return COOLDOWN_BASE_MINUTOS + Math.floor(nivel / 10);
}

function cooldownRestante(user) {
  if (!user.last_battle_at) return 0;
  const ahora = new Date();
  const ultima = new Date(user.last_battle_at);
  const diffMs = ahora - ultima;
  const diffMin = diffMs / 60000;
  const cooldown = cooldownMinutos(user.nivel);
  return Math.max(0, cooldown - diffMin);
}

function listaEnemigos(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];

  const rango = rangoNiveles(user.nivel);
  const enemigos = db.prepare(`
    SELECT id, email, nivel, hp, hp_max, velas, canones, casco, pvp_victorias, pvp_derrotas
    FROM users
    WHERE id != ? AND nivel BETWEEN ? AND ?
    ORDER BY RANDOM()
    LIMIT 20
  `).all(userId, rango.min, rango.max);

  return enemigos.map(e => ({
    ...e,
    hpPct: Math.round((e.hp / e.hp_max) * 100),
    nivelBarco: Math.round(((e.velas + e.canones + e.casco) / 3) * 100) / 100
  }));
}

function pelear(userId, rivalId) {
  if (userId === rivalId) {
    return { ok: false, razon: 'no_podes_pelear_contra_vos_mismo' };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  const rival = db.prepare('SELECT * FROM users WHERE id = ?').get(rivalId);
  if (!rival) return { ok: false, razon: 'usuario_no_encontrado' };

  // Verificar cooldown
  const cooldown = cooldownRestante(user);
  if (cooldown > 0) {
    return { ok: false, razon: 'en_cooldown', minutosRestantes: Math.ceil(cooldown) };
  }

  // Verificar que el barco esté en condiciones de pelear
  const estado = estadoReparacion(user);
  if (!estado.puedePelear) {
    return { ok: false, razon: 'necesita_reparar', costoReparacion: estado.costoReparacion };
  }

  // Verificar que el rival esté dentro del rango
  const rango = rangoNiveles(user.nivel);
  if (rival.nivel < rango.min || rival.nivel > rango.max) {
    return { ok: false, razon: 'fuera_de_rango' };
  }

  // Simulación de batalla por turnos
  let userHp = user.hp;
  let rivalHp = rival.hp;

  // Fuerza de ataque: nivel + (velas + canones + casco) / 3
  const userPower = user.nivel + (user.velas + user.canones + user.casco) / 3;
  const rivalPower = rival.nivel + (rival.velas + rival.canones + rival.casco) / 3;

  // Batalla de 5 turnos
  for (let i = 0; i < 5; i++) {
    const userAttack = userPower * (0.8 + Math.random() * 0.4);
    const rivalAttack = rivalPower * (0.8 + Math.random() * 0.4);

    rivalHp -= userAttack * 0.1;
    userHp -= rivalAttack * 0.1;

    if (rivalHp <= 0 || userHp <= 0) break;
  }

  const userGano = userHp > rivalHp;

  // Aplicar daño real
  const damageToUser = Math.max(0, Math.floor((user.hp - userHp) * 0.5));
  const damageToRival = Math.max(0, Math.floor((rival.hp - rivalHp) * 0.5));

  // Oro en juego: 10% del oro del perdedor (mínimo 1, máximo 100)
  const oroEnJuego = Math.min(100, Math.max(1, Math.floor((userGano ? rival.oro : user.oro) * 0.1)));

  db.transaction(() => {
    // Actualizar HP
    db.prepare('UPDATE users SET hp = hp - ? WHERE id = ?').run(damageToUser, userId);
    db.prepare('UPDATE users SET hp = hp - ? WHERE id = ?').run(damageToRival, rivalId);

    // Asegurar que el HP no baje de 0
    db.prepare('UPDATE users SET hp = MAX(0, hp) WHERE id = ?').run(userId);
    db.prepare('UPDATE users SET hp = MAX(0, hp) WHERE id = ?').run(rivalId);

    // Transferir oro
    if (userGano) {
      db.prepare('UPDATE users SET oro = oro + ? WHERE id = ?').run(oroEnJuego, userId);
      db.prepare('UPDATE users SET oro = MAX(0, oro - ?) WHERE id = ?').run(oroEnJuego, rivalId);
    } else {
      db.prepare('UPDATE users SET oro = oro + ? WHERE id = ?').run(oroEnJuego, rivalId);
      db.prepare('UPDATE users SET oro = MAX(0, oro - ?) WHERE id = ?').run(oroEnJuego, userId);
    }

    // Actualizar estadísticas
    if (userGano) {
      db.prepare('UPDATE users SET pvp_victorias = pvp_victorias + 1 WHERE id = ?').run(userId);
      db.prepare('UPDATE users SET pvp_derrotas = pvp_derrotas + 1 WHERE id = ?').run(rivalId);
    } else {
      db.prepare('UPDATE users SET pvp_victorias = pvp_victorias + 1 WHERE id = ?').run(rivalId);
      db.prepare('UPDATE users SET pvp_derrotas = pvp_derrotas + 1 WHERE id = ?').run(userId);
    }

    // Actualizar última batalla
    db.prepare('UPDATE users SET last_battle_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  })();

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const updatedRival = db.prepare('SELECT * FROM users WHERE id = ?').get(rivalId);

  // Aplicar producción después de la batalla (por si ganó oro)
  aplicarProduccion(userId);

  return {
    ok: true,
    victoria: userGano,
    oroGanado: oroEnJuego,
    danioRecibido: damageToUser,
    danioInfligido: damageToRival,
    user: updatedUser,
    rival: updatedRival
  };
}

module.exports = {
  listaEnemigos,
  pelear,
  rangoNiveles,
  cooldownRestante,
  cooldownMinutos
};