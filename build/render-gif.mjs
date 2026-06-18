// render-gif.mjs — Render headless de la simulación a GIF (vista superior) usando un
// codificador puro-JS (omggif). Útil para previsualizar la simulación sin navegador.
//   node build/render-gif.mjs
import { GifWriter } from 'omggif';
import { writeFileSync } from 'node:fs';
import { ConveyorSim } from '../src/engine.js';
import { buildBufferedSorter } from '../src/layouts.js';

const W=900,H=560,M=28;
const PAL=[0x0d1117,0x3a4150,0x6b7a8f,0x26c6da,0x3f51b5,0xb71c1c,0x2e7d32,0x8e24aa,
  0xe53935,0x1e88e5,0x43a047,0xfdd835,0xfb8c00,0x8e24aa,0x00acc1,0xd81b60,0xc8a073];
while(PAL.length<32)PAL.push(0);
const CI={red:8,blue:9,green:10,yellow:11,orange:12,purple:13,cyan:14,pink:15};
const kindCI=k=>({belt:1,sort:2,elevator:3,buffer:4,reject:5,source:6,sink:7,pull:4})[k]||1;

const sim=new ConveyorSim(buildBufferedSorter({outputs:6}),{seed:1});
sim.run(10);
const f0=sim.frame();
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
for(const s of f0.segments)for(const p of s.points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);}
const sc=Math.min((W-2*M)/(maxX-minX),(H-2*M)/(maxZ-minZ));
const PX=x=>Math.round(M+(x-minX)*sc), PY=z=>Math.round(H-M-(z-minZ)*sc);
const put=(b,x,y,c)=>{if(x>=0&&x<W&&y>=0&&y<H)b[y*W+x]=c;};
function line(b,x0,y0,x1,y1,c){let dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,e=dx+dy;for(;;){put(b,x0,y0,c);if(x0===x1&&y0===y1)break;let e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
const rect=(b,cx,cy,r,c)=>{for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)put(b,x,y,c);};

const nFrames=110;
const out=Buffer.alloc(W*H*nFrames+300000);
const gw=new GifWriter(out,W,H,{palette:PAL,loop:0});
for(let fr=0;fr<nFrames;fr++){
  const b=new Uint8Array(W*H);
  const f=sim.frame();
  for(const s of f.segments){const c=kindCI(s.kind);for(let i=0;i<s.points.length-1;i++)line(b,PX(s.points[i][0]),PY(s.points[i][2]),PX(s.points[i+1][0]),PY(s.points[i+1][2]),c);}
  for(const bx of f.boxes){const c=(bx.color&&CI[bx.color]!=null)?CI[bx.color]:16;rect(b,PX(bx.x),PY(bx.z),3,c);}
  gw.addFrame(0,0,W,H,b,{delay:7});
  for(let k=0;k<9;k++)sim.step(0.033);
}
const gif=out.slice(0,gw.end());
writeFileSync('dist/simulacion.gif',gif);
console.log('GIF dist/simulacion.gif:',gif.length,'bytes,',nFrames,'frames');
