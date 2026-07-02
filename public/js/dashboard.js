document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await API.get('/auth/me');
    const user = data.user;

    document.getElementById('nivel').textContent = user.nivel;
    document.getElementById('hp').textContent = user.hp;
    document.getElementById('hpMax').textContent = user.hpMax;
    document.getElementById('velas').textContent = user.velas;
    document.getElementById('canones').textContent = user.canones;
    document.getElementById('casco').textContent = user.casco;
    document.getElementById('oro').textContent = Math.round(user.oro);
    document.getElementById('piratas').textContent = user.piratas;
    document.getElementById('produccion').textContent = data.produccion.oroPorMinuto.toFixed(2);
    document.getElementById('victorias').textContent = user.pvpVictorias;
    document.getElementById('derrotas').textContent = user.pvpDerrotas;
    document.getElementById('nivelBarco').textContent = user.nivelBarco;

    // Enlace de referido
    const referralLink = document.getElementById('referralLink');
    if (referralLink) {
      referralLink.value = `${window.location.origin}/register.html?ref=${user.id}`;
    }

    // Progreso de referido
    const progressEl = document.getElementById('referralProgress');
    if (user.referredBy && !user.referralRewarded) {
      const progress = Math.min(100, (user.activeSeconds / 300) * 100);
      progressEl.innerHTML = `
        <p>Progreso para recompensa de referido: ${Math.round(progress)}%</p>
        <div class="bar"><div class="bar-fill" style="width: ${progress}%"></div></div>
        <p>${Math.round(user.activeSeconds)}s / 300s</p>
      `;
    } else if (user.referralRewarded) {
      progressEl.textContent = '✅ ¡Recompensa de referido ya recibida!';
    } else if (!user.referredBy) {
      progressEl.textContent = '💡 Invita a tus amigos para ganar recompensas.';
    }

    // Heartbeat cada 20 segundos
    setInterval(async () => {
      try {
        const heartbeat = await API.post('/activity/heartbeat');
        document.getElementById('oro').textContent = Math.round(heartbeat.oro);
        document.getElementById('piratas').textContent = heartbeat.piratas;
        if (heartbeat.referidoAcreditado) {
          alert('¡Felicidades! Has ganado +100 oro y tu referidor ha ganado +1 pirata.');
        }
      } catch (error) {
        console.error('Error en heartbeat:', error);
      }
    }, 20000);

  } catch (error) {
    console.error('Error al cargar dashboard:', error);
    window.location.href = '/login.html';
  }
});

function copiarReferral() {
  const input = document.getElementById('referralLink');
  input.select();
  document.execCommand('copy');
  alert('Enlace de invitación copiado al portapapeles.');
}