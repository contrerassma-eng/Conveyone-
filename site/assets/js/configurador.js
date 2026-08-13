/* ==========================================================================
   configurador.js — aplicación del configurador.

   Una sola fuente de verdad: `configure(modelo, params)` devuelve el plan, y del
   plan salen las tres cosas que ve el cliente — el 3D, el despiece y el código.
   El visor 3D es opcional: si el motor gráfico no carga, el resto sigue vivo.
   ========================================================================== */
import { cart } from './site.js';
import { equipoPorEngine } from '../../data/catalogo.js';

const ENGINE = '../../../simulator/src/engine/index.js';
const RENDER = '../../../simulator/src/render/babylonView.js';

const $ = (id) => document.getElementById(id);
const cfg = document.querySelector('.cfg');

let motor = null;      // módulo del motor
let vista = null;      // visor Babylon (o null)
let modelo = null;     // modelo activo
let params = null;     // parámetros activos
let ultimo = null;     // último resultado de configure()
let timer = null;

/* --- arranque ------------------------------------------------------------ */
init().catch((e) => {
  $('cargando').style.display = 'none';
  $('fallo').style.display = 'flex';
  $('fallo').querySelector('p').textContent = 'Detalle: ' + (e && e.message ? e.message : e);
});

async function init() {
  motor = await import(ENGINE);

  // el visor es opcional
  try {
    if (!window.BABYLON) throw new Error('Babylon.js no cargó');
    const { createView } = await import(RENDER);
    vista = createView($('cv'), {});
    $('cargando').style.display = 'none';
    // el lienzo nace dentro de una grilla que aún no tiene medidas finales:
    // sin este empujón el motor conserva el tamaño inicial y el encuadre falla
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  } catch (e) {
    vista = null;
    $('cargando').style.display = 'none';
    $('fallo').style.display = 'flex';
  }

  pintaSelector();
  const pedido = new URLSearchParams(location.search).get('m');
  const ids = motor.listModels().map((m) => m.id);
  cargaModelo(ids.includes(pedido) ? pedido : ids[0]);
  conectaVista();
  conectaTabs();
  conectaCotizacion();
}

/* --- selector de equipo -------------------------------------------------- */
function pintaSelector() {
  $('modelSel').innerHTML = motor.listModels().map((m) => {
    const eq = equipoPorEngine(m.id);
    const [cod, nom] = m.name.split('·').map((s) => s.trim());
    return `<button data-id="${m.id}"><b>${cod}</b><span>${eq ? eq.nombre : nom}</span></button>`;
  }).join('');

  $('modelSel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('on')) return;
    cargaModelo(b.dataset.id);
    const u = new URL(location.href);
    u.searchParams.set('m', b.dataset.id);
    history.replaceState(null, '', u);
  });
}

function cargaModelo(id) {
  modelo = motor.getModel(id);
  params = { ...modelo.defaults() };
  $('modelSel').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  pintaCampos();
  actualiza(true);
}

/* --- panel de parámetros ------------------------------------------------- */
const PALETA = ['#161616', '#1b3a6b', '#1f5e5a', '#5a4a1f', '#8c8f94'];

function pintaCampos() {
  const host = $('campos');
  host.innerHTML = '';

  for (const f of modelo.schema.params) {
    const wrap = document.createElement('div');

    if (f.type === 'float' || f.type === 'int') {
      wrap.className = 'fld';
      wrap.innerHTML = `<label>${f.label}<span class="v">${params[f.key]}${f.unit ? ' ' + f.unit : ''}</span></label>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${params[f.key]}">`;
      const inp = wrap.querySelector('input');
      const val = wrap.querySelector('.v');
      inp.addEventListener('input', () => {
        params[f.key] = parseFloat(inp.value);
        val.textContent = inp.value + (f.unit ? ' ' + f.unit : '');
        actualiza(true);
      });

    } else if (f.type === 'enum') {
      wrap.className = 'fld';
      wrap.innerHTML = `<label>${f.label}</label><div class="seg">`
        + f.options.map((o) => `<button data-v="${o}"${String(o) === String(params[f.key]) ? ' class="on"' : ''}>${etiqueta(o)}</button>`).join('')
        + '</div>';
      wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        params[f.key] = b.dataset.v;
        actualiza(true);
      }));

    } else if (f.type === 'bool') {
      wrap.className = 'tg';
      wrap.innerHTML = `<span>${f.label}</span><div class="toggle${params[f.key] ? ' on' : ''}"></div>`;
      const t = wrap.querySelector('.toggle');
      t.addEventListener('click', () => {
        t.classList.toggle('on');
        params[f.key] = t.classList.contains('on');
        actualiza(true);
      });

    } else if (f.type === 'color') {
      wrap.className = 'fld';
      wrap.innerHTML = `<label>${f.label}</label><div class="sw">`
        + PALETA.map((c) => `<button data-c="${c}" style="background:${c}"${c === params[f.key] ? ' class="on"' : ''} aria-label="Color ${c}"></button>`).join('')
        + '</div>';
      wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        params[f.key] = b.dataset.c;
        if (vista) vista.setBeltColor(b.dataset.c);
        actualiza(false);
      }));
    }
    host.appendChild(wrap);
  }
}

/* Traduce los valores de enum del motor a algo legible en el panel. */
function etiqueta(v) {
  const dic = {
    legs: 'Patas', low: 'Baja', left: 'Izq.', right: 'Der.', start: 'Entrada', end: 'Salida',
  };
  return dic[v] != null ? dic[v] : (isNaN(v) ? v : v + '°');
}

/* --- ciclo de actualización ---------------------------------------------- */
function actualiza(reconstruir) {
  const res = motor.configure(modelo.schema.id, params);
  ultimo = res;

  if (reconstruir && vista) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      vista.setPlan(res.plan);
      if (params.belt_color) vista.setBeltColor(params.belt_color);
      encuadraAncho();
    }, 45);
  }
  pintaBom(res);
  pintaInfo(res);
}

function pintaInfo(res) {
  $('code').textContent = res.code;
  const m = res.plan.meta;
  const e = m.envelope_mm;
  const partes = [];
  if (m.lanes != null) partes.push(`bandas <b>${m.lanes}</b>`);
  if (m.pitch_mm != null) partes.push(`paso <b>${m.pitch_mm}</b> mm`);
  if (m.rollers != null) partes.push(`rodillos <b>${m.rollers}</b>`);
  if (m.angle != null) partes.push(`ángulo <b>${m.angle}°</b>`);
  if (e) partes.push(`envolvente <b>${e.join(' × ')}</b> mm`);
  $('stats').innerHTML = partes.join('<br>');
}

function pintaBom(res) {
  $('tot').textContent = res.bom.length + ' líneas · ' + res.total_parts + ' piezas';
  const host = $('bom');
  host.innerHTML = '';
  const cats = new Map();
  res.bom.forEach((r) => {
    if (!cats.has(r.category)) cats.set(r.category, []);
    cats.get(r.category).push(r);
  });
  cats.forEach((filas, cat) => {
    const h = document.createElement('div');
    h.className = 'bcat';
    h.textContent = cat;
    host.appendChild(h);
    filas.forEach((r) => {
      const d = document.createElement('div');
      d.className = 'brow';
      const der = r.source === 'derived' ? ' <span class="der">derivada</span>' : '';
      d.innerHTML = `<div class="c">${r.code}${der}</div><div class="q">×${r.qty}</div><div class="d">${r.desc}</div>`;
      host.appendChild(d);
    });
  });
}

/* El encuadre del motor calcula el radio sin mirar la relación de aspecto: en
   un visor más alto que ancho, un equipo largo se sale por los costados. Se
   corrige abriendo la cámara en proporción a lo estrecho que sea el lienzo. */
function encuadraAncho() {
  if (!vista || !vista.camera) return;
  const cv = $('cv');
  const asp = cv.clientWidth / Math.max(1, cv.clientHeight);
  const REF = 1.75;
  if (asp < REF) vista.camera.radius *= REF / asp;
}

/* --- controles del visor ------------------------------------------------- */
function conectaVista() {
  const par = (id, fn, inicial) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', () => {
      el.classList.toggle('on');
      if (vista && fn) fn(el.classList.contains('on'));
    });
    if (vista && fn) fn(inicial);
  };
  par('vBolts', (on) => vista.setShowBolts && vista.setShowBolts(on), false);
  par('vAnim', (on) => vista.setAnim && vista.setAnim(on), true);
  par('vRot', (on) => vista.setAutoRotate && vista.setAutoRotate(on), false);

  $('reset').addEventListener('click', () => {
    params = { ...modelo.defaults() };
    pintaCampos();
    actualiza(true);
  });

  $('csv').addEventListener('click', () => {
    if (!ultimo) return;
    const csv = motor.bomToCSV(ultimo.bom);
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimo.code + '-despiece.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
}

/* --- pestañas (móvil) ---------------------------------------------------- */
function conectaTabs() {
  cfg.dataset.tab = 'params';
  document.querySelector('.cfg-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('.cfg-tabs button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    cfg.dataset.tab = b.dataset.tab;
    if (vista && b.dataset.tab === 'view') setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  });
}

/* --- agregar a la cotización --------------------------------------------- */
function conectaCotizacion() {
  const ver = $('verLista');
  const refresca = () => { ver.style.display = cart.count() ? 'block' : 'none'; };
  refresca();
  document.addEventListener('cart:change', refresca);

  $('add').addEventListener('click', () => {
    if (!ultimo) return;
    const eq = equipoPorEngine(modelo.schema.id);
    cart.add({
      modelo: modelo.schema.id,
      nombre: eq ? eq.nombre : modelo.schema.name,
      codigo: ultimo.code,
      qty: Math.max(1, parseInt($('qty').value, 10) || 1),
      piezas: ultimo.total_parts,
      lineas: ultimo.bom.length,
      params: { ...params },
    });
    aviso('Equipo agregado a tu cotización');
    refresca();
  });
}

function aviso(txt) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="m5 12 5 5L19 7"/></svg></span><span class="txt"></span>';
    document.body.appendChild(t);
  }
  t.querySelector('.txt').textContent = txt;
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => t.classList.remove('on'), 2600);
}
