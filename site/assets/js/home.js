/* ==========================================================================
   home.js — portada: grilla de equipos destacados.

   La portada abre con una toma cinematográfica del ensamble real; el 3D
   navegable vive en la ficha de cada equipo, donde el visitante ya decidió
   mirar ese equipo y vale la pena bajar varios MB.
   ========================================================================== */
import { DESTACADOS } from '../../data/catalogo.js';
import { pcard } from './pcard.js';
import { revelar } from './site.js';

const grid = document.getElementById('gridProd');
if (grid) {
  grid.innerHTML = DESTACADOS.map((e, i) => pcard(e, i * 0.09)).join('');
  revelar(grid, 0.09);
}
