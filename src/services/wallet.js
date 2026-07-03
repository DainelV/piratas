const { db } = require('../db/database');
const { parseFechaDB } = require('../utils/fechas');

// DEPÓSITOS: 1 CUP = 70 oro
const ORO_POR_CUP_DEPOSITO = 70;

// RETIROS: 100 oro = 1 CUP
const ORO_POR_CUP_RETIRO = 100;
const RETIRO_MINIMO_ORO = 10000;
const HORAS_ENTRE_RETIROS = 24; // "1 retiro por día"

// La coordinación del pago (tanto depósitos como retiros) se hace por
// WhatsApp, fuera del sistema. Acá solo queda registrada la solicitud.
const WHATSAPP_CONTACTO = '55858321';

function montoOroPorDeposito(montoCup) {
  return Math.round(montoCup * ORO_POR_CUP_DEPOSITO * 100) / 100;
}

function montoCupPorRetiro(montoOro) {
  return Math.round((montoOro / ORO_POR_CUP_RETIRO) * 100) / 100;
}

/**
 * Info de conversión clara para mostrar en pantalla antes de depositar/retirar.
 */
function tasas() {
  return {
    deposito: { oroPorCup: ORO_POR_CUP_DEPOSITO, whatsapp: WHATSAPP_CONTACTO },
    retiro: {
      oroPorCup: ORO_POR_CUP_RETIRO,
      minimoOro: RETIRO_MINIMO_ORO,
      horasEntreRetiros: HORAS_ENTRE_RETIROS,
      whatsapp: WHATSAPP_CONTACTO
    }
  };
}

/**
 * Crea una solicitud de DEPÓSITO. Queda "pendiente": no se acredita
 * oro hasta que un admin la aprueba (después de coordinar el pago por
 * WhatsApp), ver aprobarTransaccion.
 */
function crearDeposito(userId, { montoCup, telefono }) {
  if (!(montoCup > 0)) {
    return { ok: false, razon: 'monto_invalido' };
  }
  if (!telefono) {
    return { ok: false, razon: 'faltan_datos' };
  }

  const montoOro = montoOroPorDeposito(montoCup);

  const resultado = db.prepare(`
    INSERT INTO transacciones (user_id, tipo, monto_cup, monto_oro, telefono, estado)
    VALUES (?, 'deposito', ?, ?, ?, 'pendiente')
  `).run(userId, montoCup, montoOro, String(telefono).trim());

  return { ok: true, id: resultado.lastInsertRowid, montoOro };
}

/**
 * ¿Puede este usuario pedir un retiro ahora? (1 por día, sobre
 * cualquier solicitud hecha en las últimas 24h, sea cual sea su estado).
 */
function puedeRetirarHoy(userId) {
  const ultimo = db.prepare(`
    SELECT creado_en FROM transacciones
    WHERE user_id = ? AND tipo = 'retiro'
    ORDER BY creado_en DESC LIMIT 1
  `).get(userId);
  if (!ultimo) return { puede: true };

  const transcurridoMs = Date.now() - parseFechaDB(ultimo.creado_en).getTime();
  const horasTranscurridas = transcurridoMs / 3600000;
  if (horasTranscurridas < HORAS_ENTRE_RETIROS) {
    return { puede: false, horasRestantes: Math.ceil(HORAS_ENTRE_RETIROS - horasTranscurridas) };
  }
  return { puede: true };
}

/**
 * Crea una solicitud de RETIRO. El oro se descuenta de inmediato (para
 * que no lo pueda gastar mientras el retiro está pendiente); si el
 * admin lo rechaza, se le devuelve (ver rechazarTransaccion). El pago
 * en CUP se coordina por WhatsApp una vez aprobado.
 */
function crearRetiro(userId, { montoOro, telefono }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, razon: 'usuario_no_encontrado' };

  if (!(montoOro > 0)) {
    return { ok: false, razon: 'monto_invalido' };
  }
  if (montoOro < RETIRO_MINIMO_ORO) {
    return { ok: false, razon: 'menor_al_minimo', minimo: RETIRO_MINIMO_ORO };
  }
  if (!telefono) {
    return { ok: false, razon: 'faltan_datos' };
  }
  if (user.oro < montoOro) {
    return { ok: false, razon: 'oro_insuficiente', oroActual: user.oro };
  }

  const chequeoDiario = puedeRetirarHoy(userId);
  if (!chequeoDiario.puede) {
    return { ok: false, razon: 'un_retiro_por_dia', horasRestantes: chequeoDiario.horasRestantes };
  }

  const montoCup = montoCupPorRetiro(montoOro);

  const transaccion = db.transaction(() => {
    db.prepare('UPDATE users SET oro = oro - ? WHERE id = ?').run(montoOro, userId);
    return db.prepare(`
      INSERT INTO transacciones (user_id, tipo, monto_cup, monto_oro, telefono, estado)
      VALUES (?, 'retiro', ?, ?, ?, 'pendiente')
    `).run(userId, montoCup, montoOro, String(telefono).trim());
  });
  const resultado = transaccion();

  return { ok: true, id: resultado.lastInsertRowid, montoCup };
}

function historialUsuario(userId) {
  return db.prepare(`
    SELECT id, tipo, monto_cup, monto_oro, telefono, estado, nota_admin, creado_en, resuelto_en
    FROM transacciones WHERE user_id = ? ORDER BY creado_en DESC
  `).all(userId);
}

function listarPendientes() {
  return db.prepare(`
    SELECT t.*, u.email
    FROM transacciones t
    JOIN users u ON u.id = t.user_id
    WHERE t.estado = 'pendiente'
    ORDER BY t.creado_en ASC
  `).all();
}

/**
 * Aprueba una transacción pendiente:
 *  - depósito: recién ACÁ se acredita el oro
 *  - retiro: el oro ya se había descontado al pedirlo, así que solo
 *    queda registrado como pagado (el pago en CUP se coordina por WhatsApp)
 */
function aprobarTransaccion(id, notaAdmin) {
  const tx = db.prepare('SELECT * FROM transacciones WHERE id = ?').get(id);
  if (!tx) return { ok: false, razon: 'no_encontrada' };
  if (tx.estado !== 'pendiente') return { ok: false, razon: 'ya_resuelta' };

  const transaccion = db.transaction(() => {
    if (tx.tipo === 'deposito') {
      db.prepare('UPDATE users SET oro = oro + ? WHERE id = ?').run(tx.monto_oro, tx.user_id);
    }
    db.prepare(`
      UPDATE transacciones SET estado = 'aprobado', nota_admin = ?, resuelto_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(notaAdmin || null, id);
  });
  transaccion();

  return { ok: true };
}

/**
 * Rechaza una transacción pendiente:
 *  - depósito: no se acredita nada (nunca se había acreditado)
 *  - retiro: se le devuelve el oro al usuario (se le había descontado al pedirlo)
 */
function rechazarTransaccion(id, notaAdmin) {
  const tx = db.prepare('SELECT * FROM transacciones WHERE id = ?').get(id);
  if (!tx) return { ok: false, razon: 'no_encontrada' };
  if (tx.estado !== 'pendiente') return { ok: false, razon: 'ya_resuelta' };

  const transaccion = db.transaction(() => {
    if (tx.tipo === 'retiro') {
      db.prepare('UPDATE users SET oro = oro + ? WHERE id = ?').run(tx.monto_oro, tx.user_id);
    }
    db.prepare(`
      UPDATE transacciones SET estado = 'rechazado', nota_admin = ?, resuelto_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(notaAdmin || null, id);
  });
  transaccion();

  return { ok: true };
}

module.exports = {
  ORO_POR_CUP_DEPOSITO,
  ORO_POR_CUP_RETIRO,
  RETIRO_MINIMO_ORO,
  HORAS_ENTRE_RETIROS,
  WHATSAPP_CONTACTO,
  montoOroPorDeposito,
  montoCupPorRetiro,
  tasas,
  crearDeposito,
  puedeRetirarHoy,
  crearRetiro,
  historialUsuario,
  listarPendientes,
  aprobarTransaccion,
  rechazarTransaccion
};
