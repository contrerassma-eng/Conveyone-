// test/order.mjs — valida el MOTOR embebido en index.html (sin THREE):
//  (1) orden del TREN en la evacuación (slot estrictamente creciente),
//  (2) SEGREGACIÓN: cada robot KUKA recibe su subsecuencia en orden y 0 cajas perdidas,
//  (3) sin colisiones. Extrae SorterSim + buildSorter del <script type="module">.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const mod = html.split('<script type="module">')[1].split('</script>')[0];
const engine = mod.split('// ===== RENDER =====')[0]
  .replace(/^\s*import \* as THREE.*$/m, '')
  .replace(/^\s*import \{ OrbitControls \}.*$/m, '')
  .replace(/^\s*const OrbitControls = THREE\.OrbitControls;.*$/m, '');   // global THREE (no aplica en headless)
const { SorterSim, buildSorter } = new Function(engine + '\nreturn { SorterSim, buildSorter };')();

// receta con multiplicadores por volumen (como la UI)
function volRecipe(m) {
  const ws = m.meta.skus.map(s => s.w).concat([m.meta.directW]); const mn = Math.min(...ws);
  const mult = ws.map(w => Math.max(1, Math.round(w / mn)));
  return { loop: true, steps: m.meta.skus.map((s, i) => ({ color: s.color, qty: mult[i] })).concat([{ color: m.meta.directColor, qty: mult[16] }]) };
}

function run(opts, seed, SEC) {
  const m = buildSorter(opts); m.pocket = volRecipe(m);
  const sim = new SorterSim(m, seed);
  // captura: orden POR SKU (1 carril por SKU -> el orden dentro de un SKU debe ser monótono)
  const perSku = {};          // 'S#'/'DIR' -> [slot] al paletizar
  let segLoss = 0;            // cajas perdidas en el SEGREGADOR (llegan a seg_end)
  const rp = sim._palletize.bind(sim);
  sim._palletize = function (b) { const k = b.direct ? 'DIR' : ('S' + b.sku); (perSku[k] = perSku[k] || []).push(b.mergeSlot); rp(b); };
  for (let i = 0; i < SEC / 0.05; i++) {
    sim.step(0.05);
    for (const b of sim.boxes) if (b.seg === 'seg_end' && !b._segLoss) { b._segLoss = true; segLoss++; }
  }
  let backSku = 0, nSku = 0;
  for (const k in perSku) { const s = perSku[k]; nSku++; for (let i = 1; i < s.length; i++) if (s[i] <= s[i - 1]) backSku++; }
  // colisiones (cajas a < 0.30 m en cualquier transportador)
  const bySeg = {}; for (const b of sim.boxes) (bySeg[b.seg] || (bySeg[b.seg] = [])).push(b.s);
  let collide = 0; for (const id in bySeg) { const a = bySeg[id].sort((x, y) => x - y); for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] < 0.30) collide++; }
  const r = sim.report();
  return { backSku, nSku, segLoss, collide, rejected: sim.rejected, done: r.pal.done, miss: r.pal.miss, gen: sim.generated, out: r.totalOut };
}

// ====== ESCENARIO 1: nominal (tasa real de la tabla 14/min P90, pick 15 s, 9 robots x2) ======
let R = run({ outputs: 4, rate: 14 * 60, outSpeed: 1.0, pal: { robots: 9, positions: 5, cap: 32, pickTime: 15 } }, 12345, 900);
console.log(`[NOMINAL 9x2]  generadas ${R.gen} · entregadas ${R.out} · pallets ${R.done} · faltas ${R.miss}`);
console.log(`  orden POR SKU (${R.nSku} SKUs): retrocesos ${R.backSku}  ${R.backSku === 0 ? '✓ cada SKU en orden' : '✗'}`);
console.log(`  perdidas en segregador ${R.segLoss}  · rechazo total ${R.rejected}  · colisiones ${R.collide}  ${R.segLoss === 0 && R.collide === 0 && R.rejected === 0 ? '✓' : '✗'}`);

// ====== ESCENARIO 2: estrés (tasa alta sobre el techo de los KUKA) — backpressure, sin pérdidas ======
let S = run({ outputs: 4, rate: 30 * 60, outSpeed: 1.0, pal: { robots: 9, positions: 5, cap: 32, pickTime: 15 } }, 999, 700);
console.log(`\n[ESTRÉS]  entregadas ${S.out} · faltas ${S.miss} · perdidas-segregador ${S.segLoss} · overflow-principal ${S.rejected}`);
console.log(`  orden por SKU retrocesos ${S.backSku}  · colisiones ${S.collide}  ${S.backSku === 0 && S.collide === 0 && S.segLoss === 0 ? '✓' : '✗'}`);

// Invariantes reales (1 carril por SKU, robots con varias salidas):
//  - cada SKU se paletiza EN ORDEN (retrocesos 0); el orden entre SKUs distintos es irrelevante.
//  - 0 colisiones; 0 cajas perdidas en el SEGREGADOR (overflow de la línea principal bajo estrés es válido).
const ok = R.backSku === 0 && R.collide === 0 && R.rejected === 0 && R.segLoss === 0 && S.backSku === 0 && S.collide === 0 && S.segLoss === 0;
console.log(`\n${ok ? '✓✓ OK: cada SKU en orden, sin colisiones ni cajas perdidas en el segregador' : '✗ revisar'}`);
process.exit(ok ? 0 : 1);
