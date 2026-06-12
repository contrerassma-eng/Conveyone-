import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
let body = html.split('<script type="module">')[1].split('</script>')[0]
  .replace(/await import\([^)]*\)/g,'(globalThis.__jspdf)');
function V3(x=0,y=0,z=0){return {x,y,z,set(){return this;},copy(){return this;}};}
class Obj{constructor(){Object.defineProperty(this,'position',{value:V3(),configurable:true});Object.defineProperty(this,'rotation',{value:{x:0,y:0,z:0,set(){}},configurable:true});Object.defineProperty(this,'scale',{value:V3(1,1,1),configurable:true});this.material={color:{setHex(){},set(){}}};this.children=[];this.userData={};this.visible=true;this.instanceMatrix={needsUpdate:false};this.matrix={};this.aspect=1;}
  add(o){this.children.push(o);return this;}remove(){}rotateX(){return this;}rotateY(){return this;}updateMatrix(){}setMatrixAt(){}lookAt(){}updateProjectionMatrix(){}clone(){return new Obj();}addEventListener(){}setFromPoints(){return this;}}
const mk=()=>new Obj();
const THREE=new Proxy({},{get(t,p){
  if(p==='Color')return function(){return {setHex(){},set(){}};};
  if(p==='Vector3')return function(x,y,z){return V3(x,y,z);};
  if(p==='WebGLRenderer')return function(){return {setSize(){},setPixelRatio(){},render(){},domElement:{},
    xr:{enabled:false,isPresenting:false,getController:()=>new Obj(),getSession:()=>null,addEventListener(){},setSession(){}},
    setAnimationLoop(cb){if(!cb)return;for(let i=1;i<=3;i++)try{cb(16*i);}catch(e){console.error('LOOP ERROR:',e.message);process.exit(2);}}};};
  if(p==='OrbitControls')return function(){return {enableDamping:false,dampingFactor:0,target:V3(),update(){},addEventListener(){}};};
  return function(){return mk();};
}});
function El(){const e={value:'4',textContent:'',innerHTML:'',style:{},children:[],checked:true,appendChild(c){this.children.push(c);},querySelector(){return El();},querySelectorAll(){return [];},addEventListener(){},setAttribute(){},getContext(){return {};},get clientWidth(){return 800;},get clientHeight(){return 600;}};
  return new Proxy(e,{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&/^on/.test(k))return null;return undefined;},set(t,k,v){t[k]=v;return true;}});}
const els={};
globalThis.THREE=THREE;
globalThis.document={getElementById:id=>els[id]||(els[id]=El()),createElement:()=>El(),addEventListener(){},body:El()};
globalThis.window=globalThis;globalThis.innerWidth=800;globalThis.innerHeight=600;globalThis.devicePixelRatio=1;
globalThis.addEventListener=()=>{};globalThis.performance={now:()=>0};globalThis.hasWebGL=()=>true;globalThis.showErr=m=>console.log('showErr:',m);
let rafN=0;globalThis.requestAnimationFrame=cb=>{if(rafN++<3)try{cb(16);}catch(e){console.error('LOOP ERROR:',e.message);process.exit(2);}};
globalThis.alert=m=>console.log('alert:',m);globalThis.__jspdf={jsPDF:function(){return {};}};
try{ new Function(body)(); console.log('✓ módulo OK (global THREE, build+render+loop), __ok='+globalThis.__ok); }
catch(e){ console.error('✗ RUNTIME ERROR:',e.message); console.error(e.stack.split('\n').slice(0,5).join('\n')); process.exit(1); }
