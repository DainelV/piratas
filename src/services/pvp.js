const { db } = require('../db/database');
const { aplicarProduccion } = require('./production');
const { puedePelear, costoReparacion } = require('./repair');
const { parseFechaDB } = require('../utils/fechas');

// A partir de este nivel el rango de matchmaking deja de ser "mismo nivel"
// y pasa a ser ±3 niveles.
const NIVEL_LIMITE_MISMO_NIVEL = 5;
const RANGO_NIVELES = 3;

// Minutos para considerar a alguien "activo" en la lista (solo es
// informativo: un jugador inactivo también puede ser atacado).
const MINUTOS_PARA_CONSIDERAR_ACTIVO = 15;

const TURNOS_MAXIMOS = 100; // tope de seguridad para que ninguna batalla quede infinita
const DANO_MINIMO = 1; // toda mejora de evasión no puede dejar el daño en 0 o negativo

// Recompensa: 5% del oro que tiene el perdedor en el momento de la
// batalla. Ya no hay tope por capacidad de bodega del ganador.
const PORCENTAJE_BOTIN = 0.05;

// Cooldown entre batallas iniciadas por un mismo jugador.
const COOLDOWN_BASE_MINUTOS = 5;
const COOLDOWN_EXTRA_POR_CADA_10_NIVELES = 10;

/**
 * Rango de niveles válidos para el matchmaking de un jugador.
 * - Nivel 1 a 5: solo mismo nivel
 * - Nivel 6+: ±3 niveles (acotado a 1-100)
 */
function rangoNiveles(nivelJugador) {
  if (nivelJugador <= NIVEL_LIMITE_MISMO_NIVEL) {
    return { min: nivelJugador, max: nivelJugador };
  }
  return {
    min: Math.max(1, nivelJugador - RANGO_NIVELES),
    max: Math.min(100, nivelJugador + RANGO_NIVELES)
  };
}

/**
 * Cooldown (en minutos) entre batallas para un jugador de determinado
 * nivel: 5 minutos base para los primeros niveles (1 a 10), y +10
 * minutos cada 10 niveles a partir de ahí.
 *   nivel 1-10:  5 min
 *   nivel 11-20: 15 min
 *   nivel 21-30: 25 min
 *   ...
 */
function cooldownMinutos(nivel) {
  const escalones = Math.floor((nivel - 1) / 10);
  return COOLDOWN_BASE_MINUTOS + COOLDOWN_EXTRA_POR_CADA_10_NIVELES * escalones;
}

/**
 * Minutos restantes de cooldown para un usuario (0 si ya puede pelear).
 */
function cooldownRestante(user) {
  if (!user.last_battle_at) return 0;
  const cooldownTotalMs = cooldownMinutos(user.nivel) * 60000;
  const transcurridoMs = Date.now() - parseFechaDB(user.last_battle_at).getTime();
  const restanteMs = cooldownTotalMs - transcurridoMs;
  return restanteMs > 0 ? Math.ceil(restanteMs / 60000) : 0;
}

/**
 * Lista de posibles rivales dentro del rango de nivel del usuario, para
 * que el usuario elija contra quién pelear. Incluye tanto activos como
 * inactivos (un jugador inactivo también puede ser atacado y perder
 * oro) — se marca con `activo` solo a modo informativo.
 */
function listaEnemigos(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];

  const { min, max } = rangoNiveles(user.nivel);

  const filas = db.prepare(`
    SELECT id, nombre, nivel, hp, hp_max, velas, canones, casco, oro,
           pvp_victorias, pvp_derrotas, last_heartbeat_at
    FROM users
    WHERE id != ?
      AND nivel BETWEEN ? AND ?
    ORDER BY nivel ASC
  `).all(userId, min, max);

  const ahora = Date.now();
  const umbralActivoMs = MINUTOS_PARA_CONSIDERAR_ACTIVO * 60000;

  return filas.map(f => ({
    id: f.id,
    alias: f.nombre || `Pirata #${f.id}`, // identificamos por nombre; no exponemos el email
    nivel: f.nivel,
    hp: f.hp,
    hpMax: f.hp_max,
    velas: f.velas,
    canones: f.canones,
    casco: f.casco,
    oro: Math.round(f.oro * 100) / 100, // botín visible: cuánto se le puede robar
    victorias: f.pvp_victorias,
    derrotas: f.pvp_derrotas,
    activo: !!f.last_heartbeat_at && (ahora - parseFechaDB(f.last_heartbeat_at).getTime()) <= umbralActivoMs
  }));
}

/**
 * daño = cañones + (HP del casco / 10) - (evasión por velas del rival * 0.5)
 * "HP del casco" es el hp_max del barco; la evasión la aporta el stat
 * `velas` de quien RECIBE el golpe.
 */
function calcularDano(atacante, defensor) {
  const bruto = atacante.canones + (atacante.hp_max / 10) - (defensor.velas * 0.5);
  return Math.max(DANO_MINIMO, Math.round(bruto * 100) / 100);
}

/**
 * Simula la batalla completa turno por turno. El retador (quien elige
 * pelear) ataca primero.
 */
function simularBatalla(retador, rival) {
  const danoRetador = calcularDano(retador, rival);
  const danoRival = calcularDano(rival, retador);

  let hpRetador = retador.hp;
  let hpRival = rival.hp;

  const turnos = [];
  let turno = 0;
  let ganador = null;

  while (turno < TURNOS_MAXIMOS) {
    turno++;

    hpRival = Math.max(0, hpRival - danoRetador);
    turnos.push({ turno, quienAtaca: 'retador', dano: danoRetador, hpRivalRestante: hpRival, hpRetadorRestante: hpRetador });
    if (hpRival <= 0) { ganador = 'retador'; break; }

    hpRetador = Math.max(0, hpRetador - danoRival);
    turnos.push({ turno, quienAtaca: 'rival', dano: danoRival, hpRivalRestante: hpRival, hpRetadorRestante: hpRetador });
    if (hpRetador <= 0) { ganador = 'rival'; break; }
  }

  if (!ganador) {
    const pctRetador = hpRetador / retador.hp_max;
    const pctRival = hpRival / rival.hp_max;
    ganador = pctRetador >= pctRival ? 'retador' : 'rival';
  }

  return {
    ganador,
    turnos,
    hpFinalRetador: Math.max(1, hpRetador),
    hpFinalRival: Math.max(1, hpRival),
    danoPorTurnoRetador: danoRetador,
    danoPorTurnoRival: danoRival
  };
}

/**
 * Ejecuta una pelea real entre el usuario logueado (retador) y un
 * enemigo elegido por id.
 *
 * Reglas de esta etapa:
 *  - Cooldown entre batallas iniciadas por el retador (ver cooldownMinutos)
 *  - Ganador: recibe el 5% del oro que tiene el perdedor (se lo "roba",
 *    no se imprime dinero de la nada). Sin tope por capacidad de bodega.
 *  - Perdedor: pierde la batalla y ese oro robado, esté online
 *    o no (un jugador inactivo también puede ser atacado y perder
 *    oro)
 */
function pelear(retadorId, rivalId) {
  if (retadorId === rivalId) {
    return { ok: false, razon: 'no_podes_pelear_contra_vos_mismo' };
  }

  // Oro al día para ambos (incluye lo producido offline) antes de
  // chequear cooldown, rango y de calcular el botín.
  const retador = aplicarProduccion(retadorId);
  const rival = aplicarProduccion(rivalId);

  if (!retador || !rival) {
    return { ok: false, razon: 'usuario_no_encontrado' };
  }

  const minutosRestantesCooldown = cooldownRestante(retador);
  if (minutosRestantesCooldown > 0) {
    return { ok: false, razon: 'en_cooldown', minutosRestantes: minutosRestantesCooldown };
  }

  // Barco dañado por debajo del 30% de su HP: no puede pelear hasta reparar.
  if (!puedePelear(retador)) {
    return { ok: false, razon: 'necesita_reparar', costoReparacion: costoReparacion(retador) };
  }

  const { min, max } = rangoNiveles(retador.nivel);
  if (rival.nivel < min || rival.nivel > max) {
    return { ok: false, razon: 'fuera_de_rango', min, max };
  }

  const resultado = simularBatalla(retador, rival);
  const ganadorEsRetador = resultado.ganador === 'retador';

  const perdedorUser = ganadorEsRetador ? rival : retador;

  const recompensaNominal = Math.round(perdedorUser.oro * PORCENTAJE_BOTIN * 100) / 100;

  // Lo que realmente se transfiere: no puede ser más de lo que el
  // perdedor tiene (ya lo es, al ser un % de su propio oro), pero no
  // hay tope por la capacidad de bodega del ganador.
  const oroTransferido = Math.max(0, Math.min(recompensaNominal, perdedorUser.oro));

  const transaccion = db.transaction(() => {
    db.prepare(`
      UPDATE users SET hp = ?,
        pvp_victorias = pvp_victorias + ?,
        pvp_derrotas = pvp_derrotas + ?,
        oro = oro + ?
      WHERE id = ?
    `).run(
      resultado.hpFinalRetador,
      ganadorEsRetador ? 1 : 0,
      ganadorEsRetador ? 0 : 1,
      ganadorEsRetador ? oroTransferido : -oroTransferido,
      retadorId
    );

    db.prepare(`
      UPDATE users SET hp = ?,
        pvp_victorias = pvp_victorias + ?,
        pvp_derrotas = pvp_derrotas + ?,
        oro = oro + ?
      WHERE id = ?
    `).run(
      resultado.hpFinalRival,
      ganadorEsRetador ? 0 : 1,
      ganadorEsRetador ? 1 : 0,
      ganadorEsRetador ? -oroTransferido : oroTransferido,
      rivalId
    );

    // El cooldown se aplica siempre al retador (quien inició la
    // batalla), gane o pierda.
    db.prepare('UPDATE users SET last_battle_at = CURRENT_TIMESTAMP WHERE id = ?').run(retadorId);
  });
  transaccion();

  return {
    ok: true,
    ganador: ganadorEsRetador ? 'retador' : 'rival',
    turnos: resultado.turnos,
    hpFinalRetador: resultado.hpFinalRetador,
    hpFinalRival: resultado.hpFinalRival,
    danoPorTurnoRetador: resultado.danoPorTurnoRetador,
    danoPorTurnoRival: resultado.danoPorTurnoRival,
    recompensaNominal,
    oroTransferido,
    cooldownMinutos: cooldownMinutos(retador.nivel)
  };
}

module.exports = {
  rangoNiveles,
  listaEnemigos,
  calcularDano,
  simularBatalla,
  pelear,
  cooldownMinutos,
  cooldownRestante,
  NIVEL_LIMITE_MISMO_NIVEL,
  RANGO_NIVELES,
  PORCENTAJE_BOTIN
};
