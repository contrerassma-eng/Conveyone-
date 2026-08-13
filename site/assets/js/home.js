/* ==========================================================================
   home.js — portada: visor 3D del hero + grilla de equipos destacados.

   El hero muestra el ENSAMBLE CAD REAL (el mismo levantamiento con el que se
   fabrica), no la representación esquemática del motor paramétrico. En pantalla
   chica o con movimiento reducido se deja el render estático: el GLB pesa
   varios MB y no vale la batería del visitante.
   ========================================================================== */
import { DESTACADOS } from '../../data/catalogo.js';
import { pcard } from './pcard.js';
import { revelar } from './site.js';

const HERO = {
  glb: 'assets/models/mc400-banda-plana.glb',
  img: 'assets/img/prod-banda-plana.png',
  material: 'acero',
  yaw: 30, pitch: 19, fit: 0.95,
  cap: 'MC400-Pro · banda plana · ensamble CAD real',
};

/* --- grilla de equipos --------------------------------------------------- */
const grid = document.getElementById('gridProd');
if (grid) {
  grid.innerHTML = DESTACADOS.map((e, i) => pcard(e, i * 0.09)).join('');
  revelar(grid, 0.09);
}

/* --- visor del hero ------------------------------------------------------ */
const box = document.getElementById('heroBox');
const cap = document.getElementById('heroCap');

function estatico() {
  if (!box || box.querySelector('img.fallback')) return;
  const im = document.createElement('img');
  im.className = 'fallback';
  im.src = HERO.img;
  im.alt = 'Transportador de banda plana MC400-Pro';
  im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
  box.insertBefore(im, box.firstChild);
}

async function iniciaHero() {
  if (!box) return;
  const liviano = window.innerWidth < 800
    || matchMedia('(prefers-reduced-motion:reduce)').matches
    || navigator.connection && navigator.connection.saveData;
  if (liviano) { estatico(); return; }

  const { montaVisor } = await import('./visor3d.js');
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0';
  box.insertBefore(host, box.firstChild);
  const api = await montaVisor(host, HERO.glb, {
    yaw: HERO.yaw, pitch: HERO.pitch, fit: HERO.fit,
    material: HERO.material, girar: true, fondo: 0xE7ECF3,
  });
  if (cap) {
    const d = api.dims.map((v) => Math.round(v * 1000));
    cap.textContent = `${HERO.cap} · ${d.join(' × ')} mm`;
  }
}

iniciaHero().catch(estatico);
