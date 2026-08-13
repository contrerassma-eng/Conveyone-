/* ==========================================================================
   cotizacion.js — lista de equipos configurados + envío de la solicitud.

   No hay backend: la solicitud se arma como correo con todo el detalle
   (código, parámetros y despiece) para que llegue completa a ingeniería. El día
   que exista un endpoint, solo cambia `envia()`.
   ========================================================================== */
import { cart } from './site.js';
import { equipoPorEngine } from '../../data/catalogo.js';

const DESTINO = 'scontreras@conveyone.tech';

const $ = (id) => document.getElementById(id);

function etiquetaParam(modeloId, key) {
  return key;
}

function pinta() {
  const items = cart.read();
  const host = $('lista');
  const vacia = $('vacia');
  const acc = $('acciones');

  vacia.style.display = items.length ? 'none' : 'block';
  acc.style.display = items.length ? 'flex' : 'none';
  $('form').closest('.cot-form').style.display = items.length ? 'block' : 'none';

  host.innerHTML = items.map((it) => {
    const eq = equipoPorEngine(it.modelo);
    const claves = Object.keys(it.params).filter((k) => !k.startsWith('_'));
    const chips = claves.slice(0, 8)
      .map((k) => `<span class="chip">${etiquetaParam(it.modelo, k)}: ${it.params[k]}</span>`).join('');
    return `
    <article class="cot-item" data-uid="${it.uid}">
      <div class="cot-img">
        ${eq ? `<img src="assets/img/prod-${eq.slug}.png" alt="${eq.nombre}" loading="lazy">` : ''}
      </div>
      <div class="cot-bd">
        <span class="code mono">${it.codigo}</span>
        <h3>${it.nombre}</h3>
        <div class="pcard-specs">${chips}</div>
        <span class="cot-meta mono">${it.lineas} líneas · ${it.piezas} piezas por unidad</span>
      </div>
      <div class="cot-side">
        <label class="cot-qty">
          <span>Cant.</span>
          <input type="number" min="1" max="99" value="${it.qty || 1}" data-qty>
        </label>
        <button class="cot-del" data-del title="Quitar de la lista">Quitar</button>
      </div>
    </article>`;
  }).join('');
}

/* --- interacción --------------------------------------------------------- */
$('lista').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (!del) return;
  cart.remove(del.closest('.cot-item').dataset.uid);
});

$('lista').addEventListener('change', (e) => {
  const inp = e.target.closest('[data-qty]');
  if (!inp) return;
  cart.setQty(inp.closest('.cot-item').dataset.uid, parseInt(inp.value, 10) || 1);
});

$('vaciar').addEventListener('click', () => {
  if (confirm('¿Vaciar la lista de cotización?')) cart.clear();
});

document.addEventListener('cart:change', pinta);
pinta();

/* --- envío --------------------------------------------------------------- */
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const campos = ['nombre', 'empresa', 'email'];
  let ok = true;
  campos.forEach((k) => {
    const el = $(k);
    const malo = !el.value.trim() || (k === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value));
    el.closest('.field').classList.toggle('err', malo);
    if (malo) ok = false;
  });
  if (!ok) {
    muestraAviso('Revisa los campos marcados: faltan datos para poder responderte.', false);
    return;
  }

  const items = cart.read();
  if (!items.length) {
    muestraAviso('Tu lista está vacía. Configura al menos un equipo.', false);
    return;
  }

  const cuerpo = redacta(items);
  const asunto = `Solicitud de cotización — ${$('empresa').value.trim()} (${items.length} equipo${items.length > 1 ? 's' : ''})`;
  const url = `mailto:${DESTINO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

  // el cuerpo también queda a mano por si el cliente de correo lo recorta
  navigator.clipboard && navigator.clipboard.writeText(cuerpo).catch(() => {});
  window.location.href = url;
  muestraAviso('Se abrió tu correo con la solicitud redactada. También la copiamos al portapapeles por si acaso.', true);
});

function redacta(items) {
  const L = [];
  L.push('SOLICITUD DE COTIZACIÓN — CONVEYONE SpA');
  L.push('');
  L.push(`Nombre:   ${$('nombre').value.trim()}`);
  L.push(`Empresa:  ${$('empresa').value.trim()}`);
  L.push(`Correo:   ${$('email').value.trim()}`);
  if ($('fono').value.trim()) L.push(`Teléfono: ${$('fono').value.trim()}`);
  if ($('ciudad').value.trim()) L.push(`Ciudad:   ${$('ciudad').value.trim()}`);
  L.push('');
  if ($('msg').value.trim()) {
    L.push('CONTEXTO DEL PROYECTO');
    L.push($('msg').value.trim());
    L.push('');
  }
  L.push('EQUIPOS SOLICITADOS');
  L.push('');
  items.forEach((it, i) => {
    L.push(`${i + 1}. ${it.nombre}  ×${it.qty || 1}`);
    L.push(`   Código: ${it.codigo}`);
    L.push(`   Despiece: ${it.lineas} líneas · ${it.piezas} piezas por unidad`);
    L.push('   Parámetros:');
    Object.keys(it.params).forEach((k) => L.push(`     - ${k}: ${it.params[k]}`));
    L.push('');
  });
  L.push('Generado desde el configurador de conveyone.tech');
  return L.join('\n');
}

function muestraAviso(txt, ok) {
  const n = $('aviso');
  n.style.display = 'flex';
  n.classList.toggle('ok', !!ok);
  $('avisoTxt').textContent = txt;
}
