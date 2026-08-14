// build/box-standalone.mjs — genera dist/comportamiento-cajas-standalone.html:
// el simulador de COMPORTAMIENTO de la caja en UN solo archivo HTML, sin servidor, sin
// npm, sin CDN (es 2D con <canvas>, no usa three.js). Se abre con doble clic (file://)
// o servido. Se comparte como un único adjunto.
//
//   node build/box-standalone.mjs
//
// Toma comportamiento-cajas.html como plantilla y reemplaza los `import ./src/...` por
// el código de geometry.js + box-physics.js + box-layouts.js incrustado (mismo criterio
// de `strip` que build/standalone.mjs).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Quita imports locales y vuelve a scope de módulo los `export` (igual que standalone.mjs).
function strip(src) {
  return src
    .split('\n')
    .filter(l => !/^\s*import\s.*from\s+['"](\.\/|three)/.test(l))
    .filter(l => !/^\s*export\s+const\s+_internals\b/.test(l))  // debug-only (tests); evita choque de nombre al incrustar
    .filter(l => !/^\s*export\s+default\b/.test(l))
    .filter(l => !/^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(l))
    .map(l => l.replace(/^(\s*)export\s+(class|function|const|let|var)\b/, '$1$2'))
    .join('\n');
}

// Orden: geometry (define makePath) -> box-physics (lo usa) -> box-layouts.
const merged = [
  '// ===== módulos incrustados (geometry + box-physics + box-layouts) =====',
  strip(read('src/geometry.js')),
  strip(read('src/box-physics.js')),
  strip(read('src/box-layouts.js')),
].join('\n\n');

if (/^\s*(import|export)\b/m.test(merged)) throw new Error('quedaron import/export sin limpiar');

// Plantilla: la página tal cual, con los dos imports del módulo reemplazados por el
// código incrustado. El resto del script de la app queda igual.
const template = read('comportamiento-cajas.html');
const importBlock = /\s*import \{ BoxFlowSim, DEFAULTS \} from '\.\/src\/box-physics\.js';\n\s*import \{ buildBehaviorLine \} from '\.\/src\/box-layouts\.js';/;
if (!importBlock.test(template)) throw new Error('no encontré el bloque de imports en comportamiento-cajas.html');

let html = template
  .replace(importBlock, '\n' + merged + '\n')
  .replace('<title>Comportamiento de la caja', '<title>Comportamiento de la caja (autocontenido)');

// CLAVE para máxima compatibilidad (visores internos de WhatsApp/correo, file:// en
// móvil): ya no hay imports, así que el script va como <script> CLÁSICO en vez de
// type="module". Muchos webviews ignoran los módulos ES y dejan la página en blanco.
html = html.replace('<script type="module">', '<script>');

if (/from '\.\/src\//.test(html)) throw new Error('quedó algún import a ./src/ en el HTML');
if (/type="module"/.test(html)) throw new Error('quedó un type="module" en el standalone');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/comportamiento-cajas-standalone.html'), html);
console.log('dist/comportamiento-cajas-standalone.html generado:', (html.length / 1024).toFixed(0), 'KB');
