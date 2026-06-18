import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
const mod = html.split('<script type="module">')[1].split('</script>')[0];
const engine = mod.split('// ===== RENDER =====')[0]
  .replace(/^\s*import \* as THREE.*$/m,'')
  .replace(/^\s*import \{ OrbitControls \}.*$/m,'')
  .replace(/^\s*const OrbitControls = THREE\.OrbitControls;.*$/m,'');
const { SorterSim, buildSorter } = new Function(engine+'\nreturn { SorterSim, buildSorter };')();

// Defaults de la UI: 24 c/min, 6 robots balanceados, batchCap 4, pick 15s
const m = buildSorter({ outputs:4, rate:24*60, outSpeed:24*0.024, batchCap:4, pal:{robots:6,positions:10,cap:32,pickTime:15} });
const sim = new SorterSim(m, 7);
let peakBuf=0, rejected=0, peakBoxes=0;
const bufIds = Object.keys(sim.seg).filter(id=>sim.seg[id].kind==='buffer');
const cap = bufIds.reduce((a,id)=>a+(sim.seg[id].cap||10),0);
for(let i=0;i<1800/0.05;i++){ // 30 min
  sim.step(0.05);
  let bt=0; for(const id of bufIds) bt+=sim.seg[id].count||0;
  if(bt>peakBuf)peakBuf=bt;
  if(sim.boxes.length>peakBoxes)peakBoxes=sim.boxes.length;
}
const r=sim.report();
// carga por robot
const load={}; m.meta.skus.forEach(s=>load[s.robot]=(load[s.robot]||0)+s.w); load[m.meta.directRobot]=(load[m.meta.directRobot]||0)+m.meta.directW;
console.log('robots usados', m.meta.pal.robots, 'conv', m.meta.nconv);
console.log('carga por robot (frac flujo):', Object.entries(load).map(([r,w])=>`R${r}:${(w*100).toFixed(0)}%`).join(' '));
console.log('generadas', sim.generated, 'entregadas', r.totalOut, 'rechazo(obstrucción) ', sim.rejected);
console.log(`buffers pico ${peakBuf}/${cap} (${(100*peakBuf/cap).toFixed(0)}%) · max cajas en sistema ${peakBoxes}`);
const ok = sim.rejected===0 && peakBuf < cap*0.9;
console.log(ok?'✓✓ sin obstrucción, buffers holgados':'✗ riesgo de obstrucción');
process.exit(ok?0:1);
