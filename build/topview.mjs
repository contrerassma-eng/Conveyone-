// build/topview.mjs — vista en PLANTA (top-down) de un layout, en SVG (+PNG si hay
// cairosvg). Útil para auditar que el plano no se descuadre.
//   node build/topview.mjs [dist/estacion-niverplast.layout.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createConveyorLibrary } from '../src/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || 'dist/estacion-niverplast.layout.json';
const lib = createConveyorLibrary();
const G = lib.hydrate(readFileSync(join(root, src), 'utf8'));

const COL = { roller: '#7fb3ff', accum: '#7fb3ff', belt: '#6fe3c8', incline: '#9ad27a', transfer: '#e0a24a', divert: '#e0a24a', merge: '#b48be0', gravity: '#9fd0ff', machine: '#ff7a5a', prop: '#cfd6dd' };
function poly(inst) {
  const n = inst.nodes, c = inst.cfg;
  if (inst.family === 'curve') { const p = [], N = 18; for (let i = 0; i <= N; i++) { const a = n._a0 + (n._a1 - n._a0) * i / N; p.push([n._center[0] + c.radius * Math.cos(a), n._center[1] + c.radius * Math.sin(a)]); } return p; }
  if (inst.family === 'transfer') return [n.in.p, n._mid, n.out.p];
  return [n.in.p, n.out.p];
}
// recoge puntos para los límites
const pts = [];
for (const inst of G.instances) { if (inst.family === 'prop') pts.push([inst.pose.x, inst.pose.z]); else for (const p of poly(inst)) pts.push(p); }
const mnx = Math.min(...pts.map(p => p[0])) - 1, mxx = Math.max(...pts.map(p => p[0])) + 1;
const mnz = Math.min(...pts.map(p => p[1])) - 1, mxz = Math.max(...pts.map(p => p[1])) + 1;
const S = 60, W = (mxx - mnx) * S, H = (mxz - mnz) * S;          // 60 px/m
const X = x => ((x - mnx) * S).toFixed(1), Y = z => ((z - mnz) * S).toFixed(1);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}"><rect width="100%" height="100%" fill="#0e1116"/>`;
// grilla de 1 m
for (let x = Math.ceil(mnx); x <= mxx; x++) svg += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" stroke="#1c2430" stroke-width="1"/>`;
for (let z = Math.ceil(mnz); z <= mxz; z++) svg += `<line x1="0" y1="${Y(z)}" x2="${W}" y2="${Y(z)}" stroke="#1c2430" stroke-width="1"/>`;

for (const inst of G.instances) {
  const col = COL[inst.family] || '#888';
  if (inst.family === 'prop') {
    const L = (inst.cfg.length || 1) * S, Wd = (inst.cfg.width || 0.6) * S, r = inst.pose.rot * 180 / Math.PI;
    const tag = inst.model === 'OPERATOR' ? '#ffd23a' : inst.model === 'LIDRACK' ? '#8fa3bd' : '#cfd6dd';
    if (inst.model === 'OPERATOR') svg += `<circle cx="${X(inst.pose.x)}" cy="${Y(inst.pose.z)}" r="9" fill="${tag}"/>`;
    else svg += `<g transform="translate(${X(inst.pose.x)},${Y(inst.pose.z)}) rotate(${r})"><rect x="${-Wd / 2}" y="${-L / 2}" width="${Wd}" height="${L}" fill="${tag}" opacity="0.55" stroke="#fff" stroke-width="1"/></g>`;
    svg += `<text x="${X(inst.pose.x)}" y="${(+Y(inst.pose.z) - 12)}" fill="#cfd6dd" font-size="11" text-anchor="middle">${inst.model}</text>`;
    continue;
  }
  const pp = poly(inst), wpx = (inst.cfg.width || 0.6) * S;
  let d = 'M ' + pp.map(p => `${X(p[0])} ${Y(p[1])}`).join(' L ');
  svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wpx}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
  // flecha de flujo en el medio
  const a = pp[Math.floor(pp.length / 2) - 1] || pp[0], b = pp[Math.floor(pp.length / 2)] || pp[1];
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ang = Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0])) * 180 / Math.PI;
  svg += `<g transform="translate(${X(mx)},${Y(mz)}) rotate(${ang})"><path d="M -7 -5 L 7 0 L -7 5 Z" fill="#0e1116"/></g>`;
  svg += `<text x="${X(pp[0][0])}" y="${(+Y(pp[0][1]) - 8)}" fill="#dfe7f3" font-size="11" text-anchor="middle">${inst.model}</text>`;
  if (inst.family === 'machine') svg += `<g transform="translate(${X(pp[0][0])},${Y(pp[0][1])})"><rect x="-3" y="-${wpx / 2}" width="6" height="${wpx}" fill="#f4c11e"/></g>`; // guillotina
}
svg += `<text x="10" y="${H - 10}" fill="#7f8ca3" font-size="12">vista en planta · 1 cuadro = 1 m</text></svg>`;
const svgPath = join(root, 'dist/estacion-topview.svg');
writeFileSync(svgPath, svg);
let pngMsg = '(sin PNG: cairosvg no disponible)';
try { execFileSync('python3', ['-c', `import cairosvg; cairosvg.svg2png(url=${JSON.stringify(svgPath)}, write_to=${JSON.stringify(join(root, 'dist/estacion-topview.png'))}, output_width=${Math.round(W)})`]); pngMsg = 'dist/estacion-topview.png'; } catch (e) { }
console.log('top-view:', svgPath, '·', pngMsg, `· ${(mxx - mnx).toFixed(1)}×${(mxz - mnz).toFixed(1)} m`);
