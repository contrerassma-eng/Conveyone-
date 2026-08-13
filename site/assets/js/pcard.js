/* pcard.js — tarjeta de equipo, compartida por la portada y el catálogo. */

export function pcard(e, delay = 0) {
  const vis = e.img
    ? `<img src="assets/img/${e.img}" alt="${e.nombre} ${e.codigo}" loading="lazy" width="1600" height="1000">`
    : `<div class="pcard-ph">${silueta(e.familia)}</div>`;

  // la etiqueta dice qué puede hacer el cliente con este equipo AHORA
  let tag = '<span class="tag soon">Por ingeniería</span>';
  if (e.glb) tag = '<span class="tag">Ver en 3D real</span>';
  else if (e.engine) tag = '<span class="tag">Configurable en línea</span>';

  const destino = `equipo.html?e=${e.slug}`;
  const accion = e.glb ? 'Ver el equipo' : (e.engine ? 'Configurar' : 'Ver ficha');

  return `
  <a class="pcard" href="${destino}" data-rv data-rvd="${delay.toFixed(2)}">
    <div class="pcard-vis">${tag}${vis}</div>
    <div class="pcard-bd">
      <span class="code mono">${e.codigo}</span>
      <h3>${e.nombre}</h3>
      <p>${e.resumen}</p>
      <div class="pcard-specs">${e.chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      <div class="pcard-ft">
        <span class="link-arw">${accion} <span class="arw">&rarr;</span></span>
      </div>
    </div>
  </a>`;
}

/* Silueta neutra para los equipos que aún no tienen ensamble ni render propio. */
function silueta(familia) {
  const t = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
  const cuerpos = {
    rodillo: `<rect x="6" y="26" width="76" height="12" rx="2" ${t}/>`
      + Array.from({ length: 9 }, (_, i) => `<line x1="${11 + i * 8.6}" y1="26" x2="${11 + i * 8.6}" y2="38" ${t}/>`).join(''),
    curva: `<path d="M8 46a38 38 0 0 1 38-38" ${t}/><path d="M8 60a52 52 0 0 1 52-52" ${t}/>`,
    proceso: `<rect x="12" y="22" width="64" height="20" rx="3" ${t}/><path d="M28 22v-8h32v8" ${t}/>`,
    estruct: `<path d="M8 30h72" ${t}/><path d="M14 30v28M74 30v28" ${t}/><path d="M8 22h72" ${t}/>`,
  };
  const cuerpo = cuerpos[familia] || cuerpos.rodillo;
  return `<svg viewBox="0 0 88 64" width="150" height="110" aria-hidden="true">${cuerpo}
    <line x1="18" y1="38" x2="18" y2="58" ${t}/><line x1="70" y1="38" x2="70" y2="58" ${t}/></svg>`;
}

export default { pcard };
