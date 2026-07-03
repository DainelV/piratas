/**
 * SQLite's CURRENT_TIMESTAMP guarda fechas en UTC con formato
 * "YYYY-MM-DD HH:MM:SS" — sin la "T" ni la "Z" del estándar ISO 8601.
 *
 * Node (V8) interpreta esa cadena como hora LOCAL del proceso, no como
 * UTC, salvo que se lo indiquemos explícitamente. Si el servidor no
 * corre en UTC (ej. Cuba, UTC-4/-5), esto desalinea todos los cálculos
 * de tiempo transcurrido: la fecha guardada termina "en el futuro"
 * respecto al reloj real, y todo lo que dependa de restar fechas
 * (producción de oro, cooldowns, actividad, etc.) da 0 o negativo.
 *
 * Esta función fuerza el formato ISO UTC antes de parsear, así no
 * importa en qué zona horaria corra el servidor.
 */
function parseFechaDB(valor) {
  if (!valor) return null;
  // Si ya viene en formato ISO con T/Z, la dejamos como está.
  if (/[TZ]/.test(valor)) return new Date(valor);
  return new Date(valor.replace(' ', 'T') + 'Z');
}

module.exports = { parseFechaDB };
