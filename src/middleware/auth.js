const { db } = require('../db/database');

/**
 * Middleware que exige sesión activa Y que la cuenta no esté baneada.
 * Si baneás a alguien mientras tiene la sesión abierta, este chequeo
 * lo corta en su próximo request (no hace falta invalidar la sesión
 * a mano).
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const user = db.prepare('SELECT baneado, baneado_motivo FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (user.baneado) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Esta cuenta fue baneada' + (user.baneado_motivo ? `: ${user.baneado_motivo}` : '.') });
  }
  next();
}

module.exports = { requireAuth };
