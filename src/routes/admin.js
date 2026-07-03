const express = require('express');
const { requireAdmin } = require('../middleware/admin');
const wallet = require('../services/wallet');
const adminPanel = require('../services/adminPanel');

const router = express.Router();

/**
 * GET /api/admin/transacciones
 * Lista de depósitos/retiros pendientes de aprobar o rechazar.
 * (Sirve también como fuente de "notificaciones": el front la sondea
 * cada tanto y avisa cuando aparecen ids nuevos.)
 */
router.get('/transacciones', requireAdmin, (req, res) => {
  res.json({ pendientes: wallet.listarPendientes() });
});

/**
 * POST /api/admin/transacciones/:id/aprobar
 * body: { nota? }
 */
router.post('/transacciones/:id/aprobar', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const resultado = wallet.aprobarTransaccion(id, req.body?.nota);

  if (!resultado.ok) {
    const mensajes = { no_encontrada: 'No se encontró esa transacción', ya_resuelta: 'Esa transacción ya fue resuelta' };
    return res.status(400).json({ error: mensajes[resultado.razon] || 'No se pudo aprobar', razon: resultado.razon });
  }
  res.json({ ok: true });
});

/**
 * POST /api/admin/transacciones/:id/rechazar
 * body: { nota? }
 */
router.post('/transacciones/:id/rechazar', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const resultado = wallet.rechazarTransaccion(id, req.body?.nota);

  if (!resultado.ok) {
    const mensajes = { no_encontrada: 'No se encontró esa transacción', ya_resuelta: 'Esa transacción ya fue resuelta' };
    return res.status(400).json({ error: mensajes[resultado.razon] || 'No se pudo rechazar', razon: resultado.razon });
  }
  res.json({ ok: true });
});

/**
 * GET /api/admin/usuarios?q=busqueda
 * Lista de usuarios (con búsqueda opcional por email) para el panel admin.
 */
router.get('/usuarios', requireAdmin, (req, res) => {
  res.json({ usuarios: adminPanel.listarUsuarios(req.query.q) });
});

/**
 * PATCH /api/admin/usuarios/:id
 * body: { nivel?, hp?, oro? }
 * Modifica nivel, HP y/o oro de un usuario a mano.
 */
router.patch('/usuarios/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { nivel, hp, oro } = req.body || {};
  const resultado = adminPanel.modificarUsuario(id, { nivel, hp, oro });

  if (!resultado.ok) {
    const mensajes = {
      no_encontrado: 'No se encontró ese usuario',
      nivel_invalido: 'El nivel debe ser un entero entre 1 y 100',
      hp_invalido: `El HP debe estar entre 0 y ${resultado.hpMax}`,
      oro_invalido: 'El oro no puede ser negativo'
    };
    return res.status(400).json({ error: mensajes[resultado.razon] || 'No se pudo modificar', razon: resultado.razon });
  }
  res.json({ ok: true });
});

/**
 * POST /api/admin/usuarios/:id/banear
 * body: { motivo? }
 */
router.post('/usuarios/:id/banear', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const resultado = adminPanel.banearUsuario(id, req.body?.motivo);
  if (!resultado.ok) {
    return res.status(400).json({ error: 'No se encontró ese usuario', razon: resultado.razon });
  }
  res.json({ ok: true });
});

/**
 * POST /api/admin/usuarios/:id/desbanear
 */
router.post('/usuarios/:id/desbanear', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const resultado = adminPanel.desbanearUsuario(id);
  if (!resultado.ok) {
    return res.status(400).json({ error: 'No se encontró ese usuario', razon: resultado.razon });
  }
  res.json({ ok: true });
});

/**
 * GET /api/admin/estadisticas
 * Estadísticas globales: usuarios, oro en circulación, actividad, etc.
 */
router.get('/estadisticas', requireAdmin, (req, res) => {
  res.json(adminPanel.estadisticasGlobales());
});

module.exports = router;
