const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, initDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const activityRoutes = require('./routes/activity');
const profileRoutes = require('./routes/profile');
const levelRoutes = require('./routes/level');
const pvpRoutes = require('./routes/pvp');
const repairRoutes = require('./routes/repair');

const app = express();
const PORT = process.env.PORT || 8000;

// Inicializar base de datos
initDatabase();

app.use(express.json());

// Configuración de sesiones
app.use(session({
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'piratas-del-caribe-dev-secret-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 días
  }
}));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/level', levelRoutes);
app.use('/api/pvp', pvpRoutes);
app.use('/api/repair', repairRoutes);

// Archivos estáticos (páginas del juego)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta de estado
app.get('/api/status', (req, res) => {
  const row = db.prepare('SELECT valor, actualizado_en FROM server_info WHERE clave = ?').get('estado');
  res.json({
    servidor: 'ok',
    juego: 'Piratas del Caribe',
    baseDeDatos: row || null
  });
});

app.listen(PORT, () => {
  console.log(`⚓ Servidor de Piratas del Caribe corriendo en http://localhost:${PORT}`);
});