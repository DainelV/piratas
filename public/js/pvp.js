let cooldownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarEnemigos();

    // Refrescar enemigos cada 30 segundos
    setInterval(cargarEnemigos, 30000);

  } catch (error) {
    console.error('Error en PvP:', error);
    window.location.href = '/login.html';
  }
});

async function cargarEnemigos() {
  try {
    const data = await API.get('/pvp/enemigos');

    // Actualizar cooldown
    const cooldownEl = document.getElementById('cooldownStatus');
    if (data.cooldown.enCooldown) {
      cooldownEl.textContent = `⏳ En cooldown: ${Math.ceil(data.cooldown.minutosRestantes)} minutos restantes.`;
      document.getElementById('cooldownInfo').style.display = 'block';
    } else {
      cooldownEl.textContent = '✅ Listo para pelear.';
    }

    // Actualizar estado de reparación
    const repairEl = document.getElementById('estadoBarco');
    if (data.reparacion.puedePelear) {
      repairEl.textContent = `✅ Barco en condiciones (${data.reparacion.hpPct}% HP).`;
    } else {
      repairEl.innerHTML = `
        ❌ Barco muy dañado (${data.reparacion.hpPct}% HP). 
        <a href="/perfil.html">Reparar (costo: ${data.reparacion.costoReparacion} oro)</a>
      `;
    }

    // Mostrar enemigos
    const container = document.getElementById('enemigosContainer');
    if (data.enemigos.length === 0) {
      container.innerHTML = '<p>No hay rivales disponibles en tu rango de nivel.</p>';
      return;
    }

    container.innerHTML = data.enemigos.map(enemigo => `
      <div class="enemigo-item">
        <div class="enemigo-info">
          <span>🏴‍☠️ <strong>${enemigo.email}</strong></span>
          <span>Nivel: ${enemigo.nivel}</span>
          <span>Barco: ${enemigo.nivelBarco}</span>
          <span>HP: ${enemigo.hpPct}%</span>
          <span>⚔️ ${enemigo.pvp_victorias}V - ${enemigo.pvp_derrotas}D</span>
        </div>
        <button class="btn btn-secondary" onclick="pelear(${enemigo.id})" 
          ${!data.reparacion.puedePelear || data.cooldown.enCooldown ? 'disabled' : ''}>
          ⚔️ Pelear
        </button>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error cargando enemigos:', error);
  }
}

async function pelear(enemigoId) {
  try {
    const result = await API.post('/pvp/pelear', { enemigoId });

    const container = document.getElementById('resultadoContenido');
    const resultadoDiv = document.getElementById('resultadoBatalla');
    resultadoDiv.style.display = 'block';

    if (resultado.victoria) {
      container.innerHTML = `
        <p style="color: #51cf66; font-size: 1.5rem;">🏆 ¡VICTORIA!</p>
        <p>Has ganado ${resultado.oroGanado} oro.</p>
        <p>Daño infligido: ${resultado.danioInfligido} | Daño recibido: ${resultado.danioRecibido}</p>
        <p>Tu HP: ${resultado.user.hp} / ${resultado.user.hpMax}</p>
      `;
    } else {
      container.innerHTML = `
        <p style="color: #ff6b6b; font-size: 1.5rem;">💀 DERROTA</p>
        <p>Has perdido ${resultado.oroGanado} oro.</p>
        <p>Daño infligido: ${resultado.danioInfligido} | Daño recibido: ${resultado.danioRecibido}</p>
        <p>Tu HP: ${resultado.user.hp} / ${resultado.user.hpMax}</p>
      `;
    }

    // Recargar enemigos después de la batalla
    setTimeout(cargarEnemigos, 2000);

  } catch (error) {
    alert(error.message);
  }
}