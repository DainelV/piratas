const { db } = require('../db/database');

/**
 * Lista de usuarios para el panel admin, con búsqueda opcional por email.
 */
function listarUsuarios(busqueda) {
  let filas;
  if (busqueda) {
    filas = db.prepare(`
      SELECT id, email, nombre, nivel, hp, hp_max, oro, piratas, velas, canones, casco,
             pvp_victorias, pvp_derrotas, is_admin, baneado, baneado_motivo, created_at
      FROM users WHERE email LIKE ? OR nombre LIKE ? ORDER BY id ASC
    `).all(`%${busqueda}%`, `%${busqueda}%`);
  } else {
    filas = db.prepare(`
      SELECT id, email, nombre, nivel, hp, hp_max, oro, piratas, velas, canones, casco,
             pvp_victorias, pvp_derrotas, is_admin, baneado, baneado_motivo, created_at
      FROM users ORDER BY id ASC
    `).all();
  }
  return filas.map(f => ({
    id: f.id,
    email: f.email,
    nombre: f.nombre,
    nivel: f.nivel,
    hp: f.hp,
    hpMax: f.hp_max,
    oro: f.oro,
    piratas: f.piratas,
    velas: f.velas,
    canones: f.canones,
    casco: f.casco,
    pvpVictorias: f.pvp_victorias,
    pvpDerrotas: f.pvp_derrotas,
    isAdmin: !!f.is_admin,
    baneado: !!f.baneado,
    baneadoMotivo: f.baneado_motivo,
    createdAt: f.created_at
  }));
}

/**
 * Modifica nivel, HP y/o oro de un usuario a mano (herramienta de admin).
 * Solo toca los campos que vienen definidos en `cambios`.
 */
function modificarUsuario(id, cambios) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, razon: 'no_encontrado' };

  let nivel = user.nivel;
  let hp = user.hp;
  let oro = user.oro;

  if (cambios.nivel !== undefined) {
    const n = Number(cambios.nivel);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return { ok: false, razon: 'nivel_invalido' };
    }
    nivel = n;
  }
  if (cambios.hp !== undefined) {
    const h = Number(cambios.hp);
    if (!Number.isFinite(h) || h < 0 || h > user.hp_max) {
      return { ok: false, razon: 'hp_invalido', hpMax: user.hp_max };
    }
    hp = h;
  }
  if (cambios.oro !== undefined) {
    const o = Number(cambios.oro);
    if (!Number.isFinite(o) || o < 0) {
      return { ok: false, razon: 'oro_invalido' };
    }
    oro = o;
  }

  db.prepare('UPDATE users SET nivel = ?, hp = ?, oro = ? WHERE id = ?').run(nivel, hp, oro, id);

  return { ok: true, user: db.prepare('SELECT * FROM users WHERE id = ?').get(id) };
}

function banearUsuario(id, motivo) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, razon: 'no_encontrado' };
  db.prepare('UPDATE users SET baneado = 1, baneado_motivo = ? WHERE id = ?').run(motivo || null, id);
  return { ok: true };
}

function desbanearUsuario(id) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, razon: 'no_encontrado' };
  db.prepare('UPDATE users SET baneado = 0, baneado_motivo = NULL WHERE id = ?').run(id);
  return { ok: true };
}

/**
 * Estadísticas globales del juego para el panel admin.
 */
function estadisticasGlobales() {
  const totales = db.prepare(`
    SELECT
      COUNT(*) AS totalUsuarios,
      COALESCE(SUM(oro), 0) AS oroEnCirculacion,
      COALESCE(SUM(piratas), 0) AS totalReferidos,
      COALESCE(SUM(pvp_victorias), 0) AS totalBatallas,
      COALESCE(AVG(nivel), 0) AS nivelPromedio,
      SUM(CASE WHEN baneado = 1 THEN 1 ELSE 0 END) AS totalBaneados,
      SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS totalAdmins
    FROM users
  `).get();

  const activos24h = db.prepare(`
    SELECT COUNT(*) AS n FROM users
    WHERE last_heartbeat_at IS NOT NULL AND last_heartbeat_at >= datetime('now', '-24 hours')
  `).get().n;

  const transacciones = db.prepare(`
    SELECT
      SUM(CASE WHEN tipo = 'deposito' AND estado = 'pendiente' THEN 1 ELSE 0 END) AS depositosPendientes,
      SUM(CASE WHEN tipo = 'retiro' AND estado = 'pendiente' THEN 1 ELSE 0 END) AS retirosPendientes,
      COALESCE(SUM(CASE WHEN tipo = 'deposito' AND estado = 'aprobado' THEN monto_oro ELSE 0 END), 0) AS oroDepositadoAprobado,
      COALESCE(SUM(CASE WHEN tipo = 'retiro' AND estado = 'aprobado' THEN monto_oro ELSE 0 END), 0) AS oroRetiradoAprobado,
      COALESCE(SUM(CASE WHEN tipo = 'deposito' AND estado = 'aprobado' THEN monto_cup ELSE 0 END), 0) AS cupDepositadoAprobado,
      COALESCE(SUM(CASE WHEN tipo = 'retiro' AND estado = 'aprobado' THEN monto_cup ELSE 0 END), 0) AS cupRetiradoAprobado
    FROM transacciones
  `).get();

  return {
    totalUsuarios: totales.totalUsuarios,
    oroEnCirculacion: Math.round(totales.oroEnCirculacion * 100) / 100,
    totalReferidos: totales.totalReferidos,
    totalBatallas: totales.totalBatallas,
    nivelPromedio: Math.round(totales.nivelPromedio * 100) / 100,
    totalBaneados: totales.totalBaneados,
    totalAdmins: totales.totalAdmins,
    activosUltimas24h: activos24h,
    depositosPendientes: transacciones.depositosPendientes || 0,
    retirosPendientes: transacciones.retirosPendientes || 0,
    oroDepositadoAprobado: transacciones.oroDepositadoAprobado,
    oroRetiradoAprobado: transacciones.oroRetiradoAprobado,
    cupDepositadoAprobado: transacciones.cupDepositadoAprobado,
    cupRetiradoAprobado: transacciones.cupRetiradoAprobado
  };
}

module.exports = {
  listarUsuarios,
  modificarUsuario,
  banearUsuario,
  desbanearUsuario,
  estadisticasGlobales
};
