const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Carpeta donde vive el archivo .sqlite
const DB_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'piratas.db');

// Conexión única (singleton) a la base de datos
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/**
 * Inicializa las tablas base del juego.
 * Por ahora solo una tabla mínima "server_info" para
 * comprobar que la conexión y las escrituras funcionan.
 * Las tablas de jugadores, economía, etc. se agregan en pasos futuros.
 */
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT UNIQUE NOT NULL,
      valor TEXT NOT NULL,
      actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Usuarios: auth por email/password (NO hay login de Google) +
    -- estado de referidos, tiempo activo acumulado y estadísticas del barco.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      oro INTEGER NOT NULL DEFAULT 0,
      piratas INTEGER NOT NULL DEFAULT 0,

      -- Referidos por link (/register?ref=ID). No existe código manual.
      referred_by INTEGER REFERENCES users(id),

      -- Tiempo activo acumulado dentro del sistema (segundos, NO tiene
      -- que ser continuo). Cuando llega a 300s (5 min) se paga el
      -- referido, una sola vez.
      active_seconds INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT,
      referral_rewarded INTEGER NOT NULL DEFAULT 0,

      -- Barco / jugador
      nivel INTEGER NOT NULL DEFAULT 1,
      hp INTEGER NOT NULL DEFAULT 100,
      hp_max INTEGER NOT NULL DEFAULT 100,
      velas INTEGER NOT NULL DEFAULT 1,
      canones INTEGER NOT NULL DEFAULT 1,
      casco INTEGER NOT NULL DEFAULT 1,

      -- Producción pasiva de oro (se calcula incluso offline)
      last_production_at TEXT,

      -- Historial de combate PvP
      pvp_victorias INTEGER NOT NULL DEFAULT 0,
      pvp_derrotas INTEGER NOT NULL DEFAULT 0,
      last_battle_at TEXT,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
  `);

  // Migración suave: si la tabla users ya existía de un paso anterior
  // sin estas columnas, las agregamos ahora sin romper los datos.
  const columnasExistentes = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

  // Migración: la moneda del juego pasó de "barriles" a "oro". Si la
  // base de datos venía de un paso anterior con la columna vieja, la
  // renombramos (esto preserva todos los saldos ya acumulados).
  if (columnasExistentes.includes('barriles') && !columnasExistentes.includes('oro')) {
    db.exec('ALTER TABLE users RENAME COLUMN barriles TO oro');
    console.log('Migración: columna "barriles" renombrada a "oro"');
  }

  const columnasBarco = {
    nivel: 'INTEGER NOT NULL DEFAULT 1',
    hp: 'INTEGER NOT NULL DEFAULT 100',
    hp_max: 'INTEGER NOT NULL DEFAULT 100',
    velas: 'INTEGER NOT NULL DEFAULT 1',
    canones: 'INTEGER NOT NULL DEFAULT 1',
    casco: 'INTEGER NOT NULL DEFAULT 1',
    last_production_at: 'TEXT',
    pvp_victorias: 'INTEGER NOT NULL DEFAULT 0',
    pvp_derrotas: 'INTEGER NOT NULL DEFAULT 0',
    last_battle_at: 'TEXT',
    oro: 'INTEGER NOT NULL DEFAULT 0'
  };
  const columnasExistentesActualizadas = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  for (const [columna, definicion] of Object.entries(columnasBarco)) {
    if (!columnasExistentesActualizadas.includes(columna)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${columna} ${definicion}`);
      console.log(`Migración: columna "${columna}" agregada a users`);
    }
  }

  // Usuarios ya existentes sin marca de producción: arrancan a producir
  // desde ahora (no les regalamos ni les debemos oro retroactivos
  // por el tiempo antes de que existiera este sistema).
  db.prepare(`
    UPDATE users SET last_production_at = CURRENT_TIMESTAMP
    WHERE last_production_at IS NULL
  `).run();

  const stmt = db.prepare(`
    INSERT INTO server_info (clave, valor)
    VALUES ('estado', 'inicializado')
    ON CONFLICT(clave) DO UPDATE SET
      valor = excluded.valor,
      actualizado_en = CURRENT_TIMESTAMP
  `);
  stmt.run();

  console.log(`Base de datos lista en: ${DB_PATH}`);
}

module.exports = { db, initDatabase };
