/**
 * Muestra un tutorial dismissible dentro de un contenedor. Se recuerda
 * si el usuario ya lo cerró (localStorage, por clave), y queda un
 * botón "❓ Ayuda" para volver a abrirlo cuando quiera.
 *
 * uso: mostrarTutorial('tutorial_perfil', contenedorEl, '<h3>...</h3><p>...</p>')
 */
function mostrarTutorial(clave, contenedor, contenidoHtml) {
  if (!contenedor) return;

  const cerrado = localStorage.getItem('tutorial_cerrado_' + clave) === '1';

  function pintarBoton() {
    contenedor.innerHTML = `<button class="btn-ayuda" type="button">❓ Ver tutorial</button>`;
    contenedor.querySelector('button').addEventListener('click', pintarCaja);
  }

  function pintarCaja() {
    contenedor.innerHTML = `
      <div class="tutorial-box">
        <button class="cerrar-tutorial" type="button" aria-label="Cerrar tutorial">✕</button>
        ${contenidoHtml}
      </div>
    `;
    contenedor.querySelector('.cerrar-tutorial').addEventListener('click', () => {
      localStorage.setItem('tutorial_cerrado_' + clave, '1');
      pintarBoton();
    });
  }

  if (cerrado) {
    pintarBoton();
  } else {
    pintarCaja();
  }
}
