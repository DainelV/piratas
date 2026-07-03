const { db } = require('../db/database');

/**
 * Exige sesión activa Y que el usuario tenga is_admin = 1.
 * Se usa después de requireAuth (o hace su propio chequeo de sesión).
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'No tenés permisos de administrador' });
  }
  next();
}

module.exports = { requireAdmin };
