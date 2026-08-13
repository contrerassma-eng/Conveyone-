/* productos.js — catálogo con filtro por familia. */
import { EQUIPOS, FAMILIAS } from '../../data/catalogo.js';
import { pcard } from './pcard.js';
import { revelar } from './site.js';

const grid = document.getElementById('gridProd');
const barra = document.getElementById('filtros');
const vacio = document.getElementById('vacio');

const familiasUsadas = FAMILIAS.filter((f) => EQUIPOS.some((e) => e.familia === f.id));
const opciones = [{ id: 'todo', nombre: 'Todos' }, { id: 'online', nombre: 'Configurables en línea' }]
  .concat(familiasUsadas);

barra.innerHTML = opciones
  .map((o, i) => `<button class="filtro${i === 0 ? ' on' : ''}" data-f="${o.id}">${o.nombre}</button>`)
  .join('');

function pinta(filtro) {
  const lista = EQUIPOS.filter((e) => {
    if (filtro === 'todo') return true;
    if (filtro === 'online') return !!e.engine;
    return e.familia === filtro;
  });
  grid.innerHTML = lista.map((e, i) => pcard(e, Math.min(i, 6) * 0.06)).join('');
  vacio.style.display = lista.length ? 'none' : 'block';
  revelar(grid, 0.045);
}

barra.addEventListener('click', (e) => {
  const b = e.target.closest('.filtro');
  if (!b) return;
  barra.querySelectorAll('.filtro').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  pinta(b.dataset.f);
});

// filtro inicial desde la URL: productos.html?f=online
const inicial = new URLSearchParams(location.search).get('f') || 'todo';
const btn = barra.querySelector(`[data-f="${CSS.escape(inicial)}"]`);
if (btn) {
  barra.querySelectorAll('.filtro').forEach((x) => x.classList.remove('on'));
  btn.classList.add('on');
}
pinta(btn ? inicial : 'todo');
