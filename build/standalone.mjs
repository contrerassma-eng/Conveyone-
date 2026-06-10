// build/standalone.mjs — genera dist/standalone.html: un único archivo que abre la
// simulación SIN servidor ni npm install (Three.js se carga desde CDN). Pensado para
// abrirlo directo en el móvil.
//
//   node build/standalone.mjs
//
// Funde src/geometry.js + engine.js + layouts.js + render.js en un solo módulo,
// quitando los import/export locales, y lo inyecta en examples/index.html.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Quita imports locales y la importación de three; convierte export X -> X.
function strip(src) {
  return src
    .split('\n')
    .filter(l => !/^\s*import\s.*from\s+['"](\.\/|three)/.test(l)) // imports locales y de three
    .filter(l => !/^\s*export\s+default\b/.test(l))                 // export default ...
    .filter(l => !/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(l))         // export { a, b };
    .map(l => l.replace(/^(\s*)export\s+(class|function|const|let|var)\b/, '$1$2'))
    .join('\n');
}

// Import directo desde el CDN (sin importmap) -> máxima compatibilidad, también file://
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
const merged = [
  `import * as THREE from '${THREE_CDN}';`,
  strip(read('src/geometry.js')),
  strip(read('src/engine.js')),
  strip(read('src/layouts.js')),
  strip(read('src/render.js')),
].join('\n\n');

// En examples/index.html, reemplaza las 3 importaciones desde ../src por el código fundido.
const html = read('examples/index.html');
const importBlock =
  "import { ConveyorSim } from '../src/engine.js';\n" +
  "    import { mountSim } from '../src/render.js';\n" +
  "    import { buildComb, buildSorter4500, buildBufferedSorter } from '../src/layouts.js';";

if (!html.includes(importBlock)) {
  console.error('No se encontró el bloque de imports esperado en examples/index.html');
  process.exit(1);
}

const out = html
  .replace('<title>Conveyor Sim</title>', '<title>Conveyor Sim (standalone)</title>')
  // el standalone no usa importmap (importa three por URL directa); quítalo para evitar
  // incompatibilidades en navegadores móviles.
  .replace(/\s*<!-- Three\.js desde CDN[^>]*-->\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(importBlock, merged);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/standalone.html'), out);
console.log('dist/standalone.html generado (' + out.length + ' bytes)');
