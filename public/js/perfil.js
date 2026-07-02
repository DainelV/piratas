document.addEventListener('DOMContentLoaded', async () => {
    try {
      const data = await API.get('/profile');
      const user = data.profile;
  
      document.getElementById('email').textContent = user.email;
      document.getElementById('nivel').textContent = user.nivel;
      document.getElementById('oro').textContent = Math.round(user.oro);
      document.getElementById('piratas').textContent = user.piratas;
      document.getElementById('hp').textContent = user.hp;
      document.getElementById('hpMax').textContent = user.hpMax;
      document.getElementById('velas').textContent = user.velas;
      document.getElementById('canones').textContent = user.canones;
      document.getElementById('casco').textContent = user.casco;
      document.getElementById('nivelBarco').textContent = user.nivelBarco;
      document.getElementById('victorias').textContent = user.pvpVictorias;
      document.getElementById('derrotas').textContent = user.pvpDerrotas;
  
      // Información de nivel
      const levelInfo = data.nivelJugador;
      const levelEl = document.getElementById('levelInfo');
      if (levelInfo.puede) {
        levelEl.innerHTML = `
          <p>✅ Puedes subir al nivel ${user.nivel + 1}.</p>
          <p>Costo: ${levelInfo.costoTotal} oro (${levelInfo.costo} de nivel + ${levelInfo.costoReparacion} de reparación).</p>
          ${levelInfo.referidosRequeridos > 0 ? `<p>Referidos necesarios: ${levelInfo.referidosRequeridos}</p>` : ''}
        `;
        document.getElementById('subirNivelBtn').disabled = false;
        document.getElementById('levelError').textContent = '';
      } else if (levelInfo.razon === 'nivel_maximo') {
        levelEl.innerHTML = `<p>🏆 ¡Has alcanzado el nivel máximo (${user.nivel})!</p>`;
        document.getElementById('subirNivelBtn').disabled = true;
      } else {
        let mensaje = '';
        if (levelInfo.razon === 'oro_insuficiente') {
          mensaje = `💰 Te falta oro. Necesitas ${levelInfo.costoTotal} (${levelInfo.costo} de nivel + ${levelInfo.costoReparacion} de reparación).`;
        } else if (levelInfo.razon === 'referidos_insuficientes') {
          mensaje = `👥 Necesitas ${levelInfo.referidosRequeridos} referidos activos.`;
        }
        levelEl.innerHTML = `<p>❌ No puedes subir de nivel.</p><p>${mensaje}</p>`;
        document.getElementById('subirNivelBtn').disabled = true;
      }
  
      // Información de reparación
      const repairInfo = data.reparacion;
      const repairEl = document.getElementById('reparacionInfo');
      if (user.hp < user.hpMax) {
        repairEl.textContent = `Costo de reparación: ${repairInfo.costoReparacion} oro.`;
        document.getElementById('repararBtn').disabled = false;
      } else {
        repairEl.textContent = '✅ Barco en perfecto estado.';
        document.getElementById('repararBtn').disabled = true;
      }
  
      // Evento de reparación
      document.getElementById('repararBtn').addEventListener('click', async () => {
        try {
          const result = await API.post('/repair');
          if (result.ok) {
            alert(`Barco reparado por ${result.costoPagado} oro.`);
            window.location.reload();
          }
        } catch (error) {
          alert(error.message);
        }
      });
  
      // Evento de subir nivel
      document.getElementById('subirNivelBtn').addEventListener('click', async () => {
        try {
          const result = await API.post('/level/subir');
          if (result.ok) {
            alert(`¡Subiste al nivel ${result.estado.nivel}! Gastaste ${result.costoTotalPagado} oro.`);
            window.location.reload();
          }
        } catch (error) {
          document.getElementById('levelError').textContent = error.message;
        }
      });
  
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      window.location.href = '/login.html';
    }
  });