// test/order.mjs — valida el MOTOR embebido en index.html (sin THREE): orden del tren,
// huecos, congestión. Extrae SorterSim + buildSorter del <script type="module">.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// toma el cuerpo del módulo y corta antes del RENDER (que usa THREE)
const mod = html.split('<script type="module">')[1].split('</script>')[0];
const engine = mod
  .split('// ===== RENDER =====')[0]            // engine + layout, sin render ni arranque
  .replace(/^\s*import \* as THREE.*$/m, '')
  .replace(/^\s*import \{ OrbitControls \}.*$/m, '');

const factory = new Function(engine + '\nreturn { SorterSim, buildSorter, DANICH_SKUS };');
const { SorterSim, buildSorter } = factory();

// --- construye el modelo por defecto (4 columnas, receta = 16 SKUs + directo, 1 c/u) ---
const model = buildSorter({ outputs: 4, rate: 33 * 60, outSpeed: 0.95 });
const sim = new SorterSim(model, 12345);

// orden esperado del tren = el índice de cada SKU en la receta (0..15 = SKUs, 16 = directo)
const colorRank = new Map();
model.meta.skus.forEach((s, i) => colorRank.set(s.color, i));
colorRank.set(model.meta.directColor, model.meta.skus.length);

// engancha la entrega: cada caja que llega a 'deliv' la registramos en orden
const delivered = [];
const seg = sim.seg;
// instrumentamos _palletize para capturar el orden de llegada al sink de entrega
const realPal = sim._palletize.bind(sim);
sim._palletize = function (b) { delivered.push({ id: b.id, color: b.color, rank: colorRank.get(b.color), slot: b.mergeSlot }); realPal(b); };

const DT = 0.05, SEC = 600;
for (let i = 0; i < SEC / DT; i++) sim.step(DT);

// --- INVARIANTE REAL: las cajas se entregan en orden ESTRICTO de slot (slot = orden de receta) ---
const slots = delivered.map(d => d.slot);
let back = 0; for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) back++;
const seq = delivered.map(d => d.rank);
const inChain = sim.boxes.filter(o => { const s = sim.seg[o.seg]; return s.isLift || s.kind === 'flat'; }).length;
const onOut = sim.boxes.filter(o => o.seg === 'outfeed').length;
const pend = sim._pending.length;

console.log(`liberadas ${sim.released}  entregadas ${delivered.length}  rechazo ${sim.rejected}`);
console.log(`DESORDEN (slot no creciente): ${back} / ${delivered.length}  ${back === 0 ? '✓ ORDEN PERFECTO' : '-> revisar'}`);
console.log(`muestra slots: ${slots.slice(0, 40).join(',')}`);
console.log(`en cadena (elev+banda negra): ${inChain}  ·  en evacuación: ${onOut}  ·  pendientes-merge: ${pend}`);
console.log(`muestra entrega (rank): ${seq.slice(0, 40).join(',')}`);
// chequeo de colisiones en la evacuación: dos cajas a < 0.3 m
const out = sim.boxes.filter(o => o.seg === 'outfeed').map(o => o.s).sort((a, b) => a - b);
let collide = 0; for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < 0.3) collide++;
console.log(`colisiones en evacuación (gap<0.30): ${collide}`);
console.log(`generadas ${sim.generated}  en sistema ${sim.boxes.length}  buffers(ocup) ${sim.bufferLevels().reduce((a, g) => a + g.count, 0)}`);

// ====== ESCENARIO 2: salida lenta (estrés) + receta con multiplicadores por volumen ======
const m2 = buildSorter({ outputs: 4, rate: 45 * 60, outSpeed: 0.5 });
const ws = m2.meta.skus.map(s => s.w).concat([m2.meta.directW]); const mn = Math.min(...ws);
const mult = ws.map(w => Math.max(1, Math.round(w / mn)));
m2.pocket = { loop: true, interval: 0.15, steps: m2.meta.skus.map((s, i) => ({ color: s.color, qty: mult[i] })).concat([{ color: m2.meta.directColor, qty: mult[16] }]) };
const s2 = new SorterSim(m2, 999);
const d2 = []; const rank2 = new Map(); m2.meta.skus.forEach((s, i) => rank2.set(s.color, i)); rank2.set(m2.meta.directColor, 16);
const rp2 = s2._palletize.bind(s2); s2._palletize = function (b) { d2.push(b.mergeSlot); rp2(b); };
for (let i = 0; i < 600 / DT; i++) s2.step(DT);
let b2 = 0; for (let i = 1; i < d2.length; i++) if (d2[i] <= d2[i - 1]) b2++;
console.log(`\n[estrés salida lenta + multiplicadores] entregadas ${d2.length}  DESORDEN ${b2}  ${b2 === 0 ? '✓' : '✗'}  buffers ${s2.bufferLevels().reduce((a, g) => a + g.count, 0)}  rechazo ${s2.rejected}`);
