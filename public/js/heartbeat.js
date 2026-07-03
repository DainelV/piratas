/**
 * Envía un heartbeat al servidor cada 20s, solo mientras la pestaña
 * está visible/activa. Esto es lo que va acumulando el tiempo activo
 * (no tiene que ser continuo: si cerrás la pestaña y volvés después,
 * sigue sumando desde donde quedó).
 */
function iniciarHeartbeat(onUpdate) {
  const INTERVALO_MS = 20000;

  async function latido() {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/api/activity/heartbeat', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      if (onUpdate) onUpdate(data);
    } catch (err) {
      // silencioso: si falla un heartbeat, probamos de nuevo en el próximo tick
    }
  }

  latido(); // primer latido al cargar
  setInterval(latido, INTERVALO_MS);
}
