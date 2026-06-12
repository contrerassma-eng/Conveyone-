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

// ---- layout semilla: la estación Niverplast de ejemplo (se construye con la librería real) ----
function buildStationSeed() {
  const lib = createConveyorLibrary();
  const g = { instances: [], links: [] };
  const add = (id, ov) => { const last = g.instances[g.instances.length - 1]; const i = lib.place(id, null, ov); g.instances.push(i); if (last) lib.connect(g, last.id, i.id); return i; };
  add('LBP-CURVE', { angleDeg: 90, radius: 1.2, cw: false });   // curva celeste de llegada
  add('LBP', { length: 5 });                                     // acumulación (lo celeste)
  add('NIVERPLAST', {});                                          // guillotina al ingreso
  const grr = add('GRR', { length: 4 });                          // gravedad 700 mm + mini-mesas
  // elementos estáticos junto a la gravedad (lado derecho del flujo final)
  const n = grr.nodes.in, dir = n.dir;
  const px = Math.cos(dir), pz = Math.sin(dir);
  g.instances.push(lib.place('LIDRACK', { x: n.p[0] + px * 1.5 + 1.2, z: n.p[1] + pz * 1.5 - 1.4, rot: dir }));
  g.instances.push(lib.place('INOXTABLE', { x: n.p[0] + px * 3.0 + 1.2, z: n.p[1] + pz * 3.0 - 1.4, rot: dir }));
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
<script>/* three.js r128 (UMD, incrustado — funciona offline/file://) */
${read('vendor/three.min.js')}
</script>
<script>
${read('vendor/OrbitControls.global.js')}
</script>
<script>
${read('vendor/VRButton.js')}
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
console.log('dist/modelador-standalone.html generado:', (html.length / 1024).toFixed(0), 'KB ·',
  buildStationSeed().instances.length, 'piezas en el layout semilla');
