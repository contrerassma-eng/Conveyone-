/* ==========================================================================
   equipo.js — ficha de equipo.

   Muestra el render del ensamble CAD y, si el equipo lo tiene, carga el GLB
   real en el visor cuando el visitante lo pide. La carga es bajo demanda: los
   ensambles pesan varios MB y no se le imponen a quien solo mira la ficha.
   ========================================================================== */
import { EQUIPOS, equipoPorSlug } from '../../data/catalogo.js';
import { pcard } from './pcard.js';
import { revelar } from './site.js';

const $ = (id) => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('e');
const eq = equipoPorSlug(slug) || EQUIPOS[0];

/* --- cabecera y ficha ---------------------------------------------------- */
document.title = `${eq.nombre} ${eq.codigo} — Conveyone SpA`;
$('crumbNom').textContent = eq.nombre;
$('eqCod').textContent = eq.codigo;
$('eqNom').textContent = eq.nombre;
$('eqRes').textContent = eq.resumen;
$('eqTit2').textContent = eq.nombre;
$('eqDesc').textContent = eq.descripcion;

$('eqspecs').innerHTML = eq.specs
  .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
$('equsos').innerHTML = eq.usos.map((u) => `<span class="chip">${u}</span>`).join('');

/* --- acciones ------------------------------------------------------------ */
const acciones = [];
if (eq.engine) {
  acciones.push(`<a class="btn" href="configurador.html?m=${eq.engine}" style="width:100%">
    <span>Configurar y cotizar</span><span class="arw">&rarr;</span></a>`);
  acciones.push('<p class="cfg-legal">Ajusta las medidas en el configurador: el modelo se reconstruye y el despiece se cuenta pieza por pieza.</p>');
} else {
  acciones.push(`<a class="btn" href="contacto.html?eq=${eq.slug}" style="width:100%">
    <span>Solicitar cotización</span><span class="arw">&rarr;</span></a>`);
  acciones.push('<p class="cfg-legal">Este equipo se dimensiona con ingeniería según tu producto, tu cadencia y el espacio disponible.</p>');
}
$('eqacc').innerHTML = acciones.join('');

/* --- visual -------------------------------------------------------------- */
const img = $('eqimg');
if (eq.img) {
  img.src = 'assets/img/' + eq.img;
  img.alt = `${eq.nombre} ${eq.codigo}`;
} else {
  img.style.display = 'none';
  $('eqph').style.display = 'grid';
  $('eqph').innerHTML = '<span class="mono">Ficha sin render — consúltanos por el equipo</span>';
}

if (eq.glb) {
  $('eqcap').textContent = 'Ensamble CAD real · levantamiento del equipo fabricado';
  const boton = $('ver3d');
  boton.style.display = 'inline-flex';
  boton.addEventListener('click', abre3d, { once: true });
} else if (eq.engine) {
  $('eqcap').textContent = 'Representación del modelo paramétrico · las medidas cambian en el configurador';
}

async function abre3d() {
  $('ver3d').style.display = 'none';
  $('eq3dload').style.display = 'flex';
  try {
    const { montaVisor } = await import('./visor3d.js');
    const host = $('eqvis');
    const api = await montaVisor(host, 'assets/models/' + eq.glb, {
      ...(eq.vista3d || {}),
      material: eq.material3d,
      girar: true,
      fondo: 0xE7ECF3,
    });
    img.style.display = 'none';
    $('eq3dload').style.display = 'none';
    $('eq3dhud').style.display = 'flex';
    const g = $('eqGirar');
    g.classList.add('on');
    g.addEventListener('click', () => {
      g.classList.toggle('on');
      api.girar(g.classList.contains('on'));
    });
    const d = api.dims.map((v) => Math.round(v * 1000));
    $('eqcap').textContent = `Ensamble CAD real · envolvente ${d.join(' × ')} mm`;
  } catch (e) {
    $('eq3dload').innerHTML = '<span class="mono">No se pudo cargar el modelo 3D en este navegador.</span>';
  }
}

/* --- relacionados -------------------------------------------------------- */
const otros = EQUIPOS.filter((x) => x.slug !== eq.slug)
  .sort((a, b) => (b.familia === eq.familia) - (a.familia === eq.familia))
  .slice(0, 3);
$('relacionados').innerHTML = otros.map((x, i) => pcard(x, i * 0.06)).join('');
revelar($('relacionados'), 0.06);
