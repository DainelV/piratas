/**
 * Categorías de barco: cada 10 niveles del jugador, el barco mejora
 * visualmente (más mástiles, casco más grande, colores más "nobles").
 * No usa imágenes externas: genera un SVG simple a partir de la
 * categoría, así siempre carga sin depender de internet.
 */
const CATEGORIAS_BARCO = [
  { minNivel: 1,  nombre: 'Balandra',        mastiles: 1, escala: 0.75, casco: '#6b4a2f', vela: '#e8dcc0' },
  { minNivel: 10, nombre: 'Bergantín',       mastiles: 2, escala: 0.85, casco: '#5c3d24', vela: '#eee2c8' },
  { minNivel: 20, nombre: 'Goleta',          mastiles: 2, escala: 0.95, casco: '#4d3320', vela: '#f0e6cc' },
  { minNivel: 30, nombre: 'Fragata',         mastiles: 3, escala: 1.0,  casco: '#43301f', vela: '#f2e9d2' },
  { minNivel: 40, nombre: 'Corbeta',         mastiles: 3, escala: 1.08, casco: '#3c2a1c', vela: '#f4ecd8' },
  { minNivel: 50, nombre: 'Galeón',          mastiles: 3, escala: 1.18, casco: '#5a3a1e', vela: '#f7efd9' },
  { minNivel: 60, nombre: 'Galeón de Guerra',mastiles: 4, escala: 1.28, casco: '#6e4420', vela: '#f9f0da' },
  { minNivel: 70, nombre: 'Navío de Línea',  mastiles: 4, escala: 1.38, casco: '#7a4a22', vela: '#faf2dd' },
  { minNivel: 80, nombre: 'Buque Insignia',  mastiles: 5, escala: 1.5,  casco: '#8a5424', vela: '#fdf6e3', dorado: true },
  { minNivel: 90, nombre: 'Leviatán de los Mares', mastiles: 5, escala: 1.65, casco: '#3a2412', vela: '#ffe9a8', dorado: true }
];

function categoriaBarco(nivel) {
  let categoria = CATEGORIAS_BARCO[0];
  for (const c of CATEGORIAS_BARCO) {
    if (nivel >= c.minNivel) categoria = c;
  }
  const tier = CATEGORIAS_BARCO.indexOf(categoria) + 1;
  return { ...categoria, tier, totalTiers: CATEGORIAS_BARCO.length };
}

/**
 * Genera el markup SVG de un barco simple según su categoría.
 * Más mástiles = barco más avanzado. `dorado` agrega detalles en oro
 * para las categorías más altas.
 */
function svgBarco(nivel) {
  const c = categoriaBarco(nivel);
  const ancho = 140 * c.escala;
  const alto = 110 * c.escala;
  const colorRibete = c.dorado ? '#ffd166' : '#d8c69a';

  let mastilesSvg = '';
  const espaciado = 60 / (c.mastiles + 1);
  for (let i = 1; i <= c.mastiles; i++) {
    const x = 20 + espaciado * i;
    mastilesSvg += `
      <line x1="${x}" y1="55" x2="${x}" y2="10" stroke="#3d2817" stroke-width="2"/>
      <path d="M ${x} 14 L ${x + 14} 30 L ${x} 46 Z" fill="${c.vela}" stroke="${colorRibete}" stroke-width="0.6"/>
    `;
  }

  return `
    <svg viewBox="0 0 100 70" width="${ancho}" height="${alto}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barco categoría ${c.nombre}">
      <ellipse cx="50" cy="63" rx="30" ry="3" fill="#000" opacity="0.25"/>
      ${mastilesSvg}
      <path d="M 15 55 Q 50 70 85 55 L 78 50 Q 50 58 22 50 Z" fill="${c.casco}" stroke="${colorRibete}" stroke-width="1"/>
      ${c.dorado ? `<circle cx="50" cy="52" r="2" fill="${colorRibete}"/>` : ''}
    </svg>
  `;
}

function proximaMejoraNivel(nivel) {
  const siguiente = CATEGORIAS_BARCO.find(c => c.minNivel > nivel);
  return siguiente ? siguiente.minNivel : null;
}

/**
 * Inyecta el barco + nombre de categoría + tier dentro de un contenedor.
 */
function renderBarco(nivel, contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const c = categoriaBarco(nivel);
  const proximo = proximaMejoraNivel(nivel);
  cont.className = 'barco-visual';
  cont.innerHTML = `
    ${svgBarco(nivel)}
    <div class="barco-categoria">${c.nombre}</div>
    <div class="barco-tier">Categoría ${c.tier}/${c.totalTiers} · nivel ${nivel}${proximo ? ` · próxima mejora visual en nivel ${proximo}` : ' · categoría máxima'}</div>
  `;
}
