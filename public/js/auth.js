document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        const data = await API.post('/auth/login', { email, password });
        if (data.user) {
          window.location.href = '/dashboard.html';
        }
      } catch (error) {
        document.getElementById('error').textContent = error.message;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      // Obtener parámetro ref de la URL
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');

      try {
        const data = await API.post('/auth/register', { email, password, ref });
        if (data.user) {
          window.location.href = '/dashboard.html';
        }
      } catch (error) {
        document.getElementById('error').textContent = error.message;
      }
    });
  }

  // Cerrar sesión
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await API.post('/auth/logout');
        window.location.href = '/';
      } catch (error) {
        console.error('Error al cerrar sesión:', error);
      }
    });
  }

  // Verificar autenticación en páginas protegidas
  const protectedPages = ['/dashboard.html', '/perfil.html', '/pvp.html'];
  if (protectedPages.includes(window.location.pathname)) {
    API.get('/auth/me').catch(() => {
      window.location.href = '/login.html';
    });
  }
});