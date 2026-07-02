const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'piratas.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT UNIQUE NOT NULL,
      valor TEXT NOT NULL,
      actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      oro INTEGER NOT NULL DEFAULT 0,
      piratas INTEGER NOT NULL DEFAULT 0,
      referred_by INTEGER REFERENCES users(id),
      active_seconds INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT,
      referral_rewarded INTEGER NOT NULL DEFAULT 0,
      nivel INTEGER NOT NULL DEFAULT 1,
      hp INTEGER NOT NULL DEFAULT 100,
      hp_max INTEGER NOT NULL DEFAULT 100,
      velas INTEGER NOT NULL DEFAULT 1,
      canones INTEGER NOT NULL DEFAULT 1,
      casco INTEGER NOT NULL DEFAULT 1,
      last_production_at TEXT,
      pvp_victorias INTEGER NOT NULL DEFAULT 0,
      pvp_derrotas INTEGER NOT NULL DEFAULT 0,
      last_battle_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
  `);

  // Migración: agregar columnas faltantes si es necesario
  const columnasExistentes = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
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
    last_battle_at: 'TEXT'
  };

  for (const [columna, definicion] of Object.entries(columnasBarco)) {
    if (!columnasExistentes.includes(columna)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${columna} ${definicion}`);
      console.log(`Migración: columna "${columna}" agregada a users`);
    }
  }

  // Usuarios existentes sin marca de producción: arrancan a producir desde ahora
  db.prepare(`
    UPDATE users SET last_production_at = CURRENT_TIMESTAMP WHERE last_production_at IS NULL
  `).run();

  const stmt = db.prepare(`
    INSERT INTO server_info (clave, valor) VALUES ('estado', 'inicializado')
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = CURRENT_TIMESTAMP
  `);
  stmt.run();

  console.log(`Base de datos lista en: ${DB_PATH}`);
}

module.exports = { db, initDatabase };