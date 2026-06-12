// build/modelador-standalone.mjs — genera dist/modelador-standalone.html: el MODELADOR
// completo en UN solo archivo HTML, sin servidor, sin npm, sin CDN (three.js r128 UMD
// incrustado + OrbitControls/VRButton globales). Se abre con doble clic (file://) y
// también funciona servido (https → habilita el botón VR en Quest).
//
//   node build/modelador-standalone.mjs
//
// Incluye EMBEBIDA la estación Niverplast de ejemplo (LBP acumulación → máquina con
// guillotina → gravedad OD30/3" con mini-mesas + rack de tapas + mesa inox) como
// layout inicial (si no hay uno guardado en localStorage).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createConveyorLibrary } from '../src/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Quita imports locales/three y convierte export X -> X (mismo criterio que standalone.mjs).
function strip(src) {
  return src
    .split('\n')
    .filter(l => !/^\s*import\s.*from\s+['"](\.\/|three)/.test(l))
    .filter(l => !/^\s*export\s+default\b/.test(l))
    .filter(l => !/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(l))
    .map(l => l.replace(/^(\s*)export\s+(class|function|const|let|var)\b/, '$1$2'))
    .join('\n');
}

// ---- layout semilla: la estación Niverplast MEJORADA (main line RECTO, sin descuadre) ----
function buildStationSeed() {
  const lib = createConveyorLibrary();
  const g = { instances: [], links: [] };
  const PI2 = Math.PI / 2;
  // MAIN LINE recto a lo largo de +z (rot = 90°): LBP (Intralox S1000, acumula) →
  // Niverplast (guillotina 15 c/min) → gravedad OD30/3" + mini-mesas → conveyor final.
  const lbp = lib.place('LBP', { x: 0, z: 0, rot: PI2 }, { length: 5 }); g.instances.push(lbp);
  const niv = lib.place('NIVERPLAST', null, { meterPerMin: 15 }); g.instances.push(niv); lib.connect(g, lbp.id, niv.id);
  const grr = lib.place('GRR', null, { length: 5 }); g.instances.push(grr); lib.connect(g, niv.id, grr.id);
  const ta = lib.place('TA', null, { length: 2.5 }); g.instances.push(ta); lib.connect(g, grr.id, ta.id);
  // CURVA de llegada que ALIMENTA la LBP desde un costado SIN doblar el main line
  // (se mueve la curva para que su salida coincida con la entrada de la LBP).
  const cv = lib.place('190-E24C', null, { angleDeg: 90, radius: 1.1, cw: true });
  g.instances.push(cv); lib.connect(g, cv.id, lbp.id, { snapWhich: 'from' });
  // ESTACIÓN MANUAL junto a la gravedad: 2 mesas (una por lado), rack, 4 operarios 2x lado
  const nz = grr.nodes.in.p, dir = grr.nodes.in.dir, fx = Math.cos(dir), fz = Math.sin(dir), px = Math.sin(dir), pz = -Math.cos(dir);
  const along = d => [nz[0] + fx * d, nz[1] + fz * d];
  const side = (p, s) => [p[0] + px * s, p[1] + pz * s];
  const place = (id, p, ov) => g.instances.push(lib.place(id, { x: p[0], z: p[1], rot: dir }, ov));
  place('INOXTABLE', side(along(2.5), 1.3), { length: 2, width: 0.8 });
  place('INOXTABLE', side(along(2.5), -1.3), { length: 2, width: 0.8 });
  place('LIDRACK', side(along(2.5), 2.2), { length: 3, width: 0.5, entryHeight: 1.3 });
  place('OPERATOR', side(along(1.5), 0.9)); place('OPERATOR', side(along(3.5), 0.9));
  place('OPERATOR', side(along(1.5), -0.9)); place('OPERATOR', side(along(3.5), -0.9));
  return JSON.parse(lib.serialize(g));
}

const merged = [
  '// ===== shims de globales (three UMD r128) =====',
  'const OrbitControls = THREE.OrbitControls;',
  'const VRButton = THREE.VRButton;',
  strip(read('src/geometry.js')),
  strip(read('src/engine.js')),
  strip(read('src/catalog.js')),
  strip(read('src/builder-ui.js')),
  'initBuilder();',
].join('\n\n');

if (/^\s*(import|export)\b/m.test(merged)) throw new Error('quedaron import/export sin limpiar');

const seed = JSON.stringify(buildStationSeed());
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#0e1116" />
<title>Modelador de transportadores · Hytrol 24" (autocontenido)</title>
<style>html,body{margin:0;height:100%;background:#0e1116}</style>
</head>
<body>
<script>/* diagnóstico: cualquier error se muestra (no más pantallas negras mudas) */
window.__errs = [];
window.showErr = function (m) {
  window.__errs.push(m);
  var d = document.getElementById('err');
  if (!d) { d = document.createElement('div'); d.id = 'err'; d.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:92%;z-index:99;background:#7a1020;color:#fff;font:12px/1.4 monospace;padding:9px 11px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(d); }
  d.textContent = '⚠ ' + window.__errs.join('\\n— ');
};
window.addEventListener('error', function (e) { window.showErr((e.message || 'error') + (e.filename ? '' : '') + (e.lineno ? ' @' + e.lineno : '')); }, true);
</script>
<script>/* three.js r128 (UMD, incrustado — funciona offline/file://) */
${read('vendor/three.min.js')}
</script>
<script>/* OrbitControls (variante global, sin export) + registro en THREE.* */
${strip(read('vendor/OrbitControls.global.js'))}
THREE.OrbitControls = OrbitControls;
</script>
<script>
${read('vendor/VRButton.js')}
</script>
<script>
if (typeof THREE === 'undefined') window.showErr('three.js no cargó');
else if (!THREE.OrbitControls) window.showErr('OrbitControls no registrado');
else if (!THREE.VRButton) window.showErr('VRButton no registrado');
</script>
<script>window.__seedLayout = ${seed};</script>
<script type="module">
${merged}
</script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/modelador-standalone.html'), html);
// también deja el layout suelto para cargar con 📂 en el modelador online
writeFileSync(join(root, 'dist/estacion-niverplast.layout.json'), JSON.stringify(buildStationSeed(), null, 2));
console.log('dist/modelador-standalone.html generado:', (html.length / 1024).toFixed(0), 'KB ·',
  buildStationSeed().instances.length, 'piezas en el layout semilla');
