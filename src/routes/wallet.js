const express = require('express');
const { requireAuth } = require('../middleware/auth');
const wallet = require('../services/wallet');

const router = express.Router();

/**
 * GET /api/wallet/tasas
 * Conversión clara: cuánto oro por CUP en depósito, cuánto CUP por oro
 * en retiro, mínimo de retiro, y el contacto de WhatsApp para coordinar
 * el pago en ambos casos.
 */
router.get('/tasas', requireAuth, (req, res) => {
  res.json(wallet.tasas());
});

/**
 * GET /api/wallet/historial
 * Historial de depósitos y retiros del usuario logueado.
 */
router.get('/historial', requireAuth, (req, res) => {
  res.json({ historial: wallet.historialUsuario(req.session.userId) });
});

/**
 * POST /api/wallet/depositos
 * body: { montoCup, telefono }
 * Crea una solicitud de depósito pendiente. No acredita oro todavía —
 * eso pasa cuando el admin la aprueba, después de coordinar el pago
 * por WhatsApp.
 */
router.post('/depositos', requireAuth, (req, res) => {
  const { montoCup, telefono } = req.body || {};
  const resultado = wallet.crearDeposito(req.session.userId, {
    montoCup: Number(montoCup),
    telefono
  });

  if (!resultado.ok) {
    const mensajes = {
      monto_invalido: 'Ingresá un monto en CUP válido',
      faltan_datos: 'Falta el teléfono de contacto'
    };
    return res.status(400).json({ error: mensajes[resultado.razon] || 'No se pudo crear el depósito', razon: resultado.razon });
  }

  res.status(201).json({
    ok: true,
    id: resultado.id,
    montoOro: resultado.montoOro,
    mensaje: `Solicitud creada. Comunicate por WhatsApp al ${wallet.WHATSAPP_CONTACTO} para coordinar el pago. Tu oro se acredita cuando el admin apruebe la solicitud.`
  });
});

/**
 * POST /api/wallet/retiros
 * body: { montoOro, telefono }
 * Crea una solicitud de retiro pendiente (descuenta el oro de una,
 * para que no se pueda gastar mientras está pendiente). Reglas:
 * mínimo 10.000 oro, 1 retiro por día.
 */
router.post('/retiros', requireAuth, (req, res) => {
  const { montoOro, telefono } = req.body || {};
  const resultado = wallet.crearRetiro(req.session.userId, {
    montoOro: Number(montoOro),
    telefono
  });

  if (!resultado.ok) {
    const mensajes = {
      monto_invalido: 'Ingresá una cantidad de oro válida',
      menor_al_minimo: `El mínimo para retirar es ${resultado.minimo} oro`,
      faltan_datos: 'Falta el teléfono de contacto',
      oro_insuficiente: `No tenés suficiente oro (tenés ${resultado.oroActual})`,
      un_retiro_por_dia: `Ya pediste un retiro hoy. Podés pedir otro en ~${resultado.horasRestantes}h`,
      usuario_no_encontrado: 'No autenticado'
    };
    return res.status(400).json({ error: mensajes[resultado.razon] || 'No se pudo crear el retiro', razon: resultado.razon });
  }

  res.status(201).json({
    ok: true,
    id: resultado.id,
    montoCup: resultado.montoCup,
    mensaje: `Solicitud creada. Comunicate por WhatsApp al ${wallet.WHATSAPP_CONTACTO} para coordinar el pago. El oro ya se descontó de tu cuenta mientras se procesa.`
  });
});

module.exports = router;
