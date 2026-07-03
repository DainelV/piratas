const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');
const { toPublicUser } = require('../models/user');
const { aplicarProduccion, infoProduccion } = require('../services/production');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE_REGEX = /^[a-zA-ZÀ-ÿ0-9 _-]{2,20}$/;
const SALT_ROUNDS = 10;
const ORO_INICIAL = 100;
const ORO_BONO_REFERIDO = 100;
const publicUser = toPublicUser;

/**
 * POST /api/auth/register
 * body: { email, password, nombre, ref? }
 *
 * "ref" viene del link /register?ref=ID (el front se lo agrega solo).
 * No existe carga manual de código de referido.
 */
router.post('/register', (req, res) => {
  const { email, password, nombre, ref } = req.body || {};

  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio || !NOMBRE_REGEX.test(nombreLimpio)) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 20 caracteres (letras, números, espacios, guiones)' });
  }

  const emailNorm = String(email).trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (existing) {
    return res.status(409).json({ error: 'Ese email ya está registrado' });
  }

  // Validar referido: tiene que existir y no puede ser el mismo usuario
  // (a esta altura el usuario nuevo todavía no tiene id, así que solo
  // chequeamos que el referente exista).
  let referredBy = null;
  if (ref !== undefined && ref !== null && ref !== '') {
    const refId = Number(ref);
    if (Number.isInteger(refId)) {
      const referrer = db.prepare('SELECT id FROM users WHERE id = ?').get(refId);
      if (referrer) {
        referredBy = referrer.id;
      }
    }
  }

  const passwordHash = bcrypt.hashSync(String(password), SALT_ROUNDS);

  const insert = db.prepare(`
    INSERT INTO users (email, nombre, password_hash, oro, referred_by, last_heartbeat_at, last_production_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const result = insert.run(emailNorm, nombreLimpio, passwordHash, ORO_INICIAL, referredBy);

  // Si vino de un link de referido, se acredita YA (sin esperar
  // 5 minutos activo): +100 oro al nuevo usuario, +1 pirata al referidor.
  if (referredBy) {
    const transaccion = db.transaction(() => {
      db.prepare('UPDATE users SET oro = oro + ?, referral_rewarded = 1 WHERE id = ?')
        .run(ORO_BONO_REFERIDO, result.lastInsertRowid);
      db.prepare('UPDATE users SET piratas = piratas + 1 WHERE id = ?')
        .run(referredBy);
    });
    transaccion();
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // Auto-login tras registrarse
  req.session.userId = user.id;

  res.status(201).json({ user: publicUser(user), produccion: infoProduccion(user.nivel) });
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm);

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  if (user.baneado) {
    return res.status(403).json({ error: 'Esta cuenta fue baneada' + (user.baneado_motivo ? `: ${user.baneado_motivo}` : '.') });
  }

  req.session.userId = user.id;

  // Al entrar, sumamos toda la producción generada mientras estuvo offline.
  const userActualizado = aplicarProduccion(user.id);

  res.json({ user: publicUser(userActualizado), produccion: infoProduccion(userActualizado.nivel) });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

/**
 * GET /api/auth/me
 * Devuelve el usuario logueado (o 401 si no hay sesión).
 */
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (user.baneado) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Esta cuenta fue baneada' + (user.baneado_motivo ? `: ${user.baneado_motivo}` : '.') });
  }
  user = aplicarProduccion(user.id);
  res.json({ user: publicUser(user), produccion: infoProduccion(user.nivel) });
});

module.exports = router;
