// standalone.mjs — arnés de runtime del HTML autocontenido del MODELADOR: ejecuta el
// módulo fundido (motor + catálogo + builder-ui + initBuilder) con stubs de THREE y DOM.
// Caza errores de runtime (TDZ, API mal usada, ids de DOM faltantes) que node --check no ve.
//
//   node build/modelador-standalone.mjs && node test/standalone.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'dist/modelador-standalone.html');
if (!existsSync(file)) { console.error('falta dist/modelador-standalone.html (corre el build primero)'); process.exit(1); }
const html = readFileSync(file, 'utf8');
const mod = html.split('<script type="module">')[1].split('</script>')[0];

// ── chequeos ESTÁTICOS del HTML (la clase de bug que tumbó el primer build) ──
// 1) ningún <script> CLÁSICO puede contener import/export (SyntaxError silencioso)
const classicScripts = html.split(/<script(?![^>]*type="module")[^>]*>/).slice(1).map(s => s.split('</script>')[0]);
for (const [i, s] of classicScripts.entries()) {
  if (/^\s*(import|export)\b/m.test(s)) { console.error(`✗ script clásico #${i} contiene import/export (SyntaxError en navegador)`); process.exit(1); }
}
// 2) los globales que el módulo consume deben quedar REGISTRADOS por los scripts clásicos
if (!html.includes('THREE.OrbitControls = OrbitControls')) { console.error('✗ falta el registro THREE.OrbitControls'); process.exit(1); }
if (!html.includes('THREE.VRButton = VRButton')) { console.error('✗ falta el registro THREE.VRButton'); process.exit(1); }
// 3) overlay de diagnóstico presente (errores visibles, no pantalla negra muda)
if (!html.includes('window.showErr')) { console.error('✗ falta el overlay de diagnóstico'); process.exit(1); }
console.log('✓ HTML estático OK (sin export en scripts clásicos; OrbitControls/VRButton registrados; overlay presente)');

// ---------- stub de THREE (rico: vectores/quaternions/instancing encadenables) ----------
function V3(x = 0, y = 0, z = 0) {
  return { x, y, z,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    clone() { return V3(this.x, this.y, this.z); },
    sub() { return this; }, add() { return this; }, normalize() { return this; },
    multiplyScalar() { return this; }, addScaledVector() { return this; },
    crossVectors() { return this; }, applyMatrix4() { return this; }, applyAxisAngle() { return this; },
    setFromMatrixPosition() { return this; }, distanceTo() { return 1; }, length() { return 1; },
  };
}
class Obj {
  constructor() {
    Object.defineProperty(this, 'position', { value: V3(), configurable: true });
    Object.defineProperty(this, 'rotation', { value: { x: 0, y: 0, z: 0, order: 'XYZ', set() { } }, configurable: true });
    Object.defineProperty(this, 'scale', { value: V3(1, 1, 1), configurable: true });
    this.quaternion = { copy() { return this; }, setFromUnitVectors() { return this; } };
    this.material = { color: { setHex() { }, set() { } }, opacity: 0 };
    this.children = []; this.userData = {}; this.visible = true;
    this.instanceMatrix = { needsUpdate: false }; this.matrix = {}; this.matrixWorld = {};
  }
  add(o) { this.children.push(o); return this; } remove() { } rotateX() { return this; } rotateY() { return this; }
  updateMatrix() { } setMatrixAt() { } lookAt() { } updateProjectionMatrix() { } clone() { return new Obj(); }
  addEventListener() { } setFromPoints() { return this; } identity() { return this; } extractRotation() { return this; }
  setFromCamera() { } intersectObjects() { return []; }
}
const THREE = new Proxy({}, {
  get(t, p) {
    if (p === 'Color') return function () { return { setHex() { }, set() { } }; };
    if (p === 'Vector2') return function () { return { x: 0, y: 0, set() { } }; };
    if (p === 'Vector3') return function (x, y, z) { return V3(x, y, z); };
    if (p === 'Quaternion') return function () { return { copy() { return this; }, setFromUnitVectors() { return this; } }; };
    if (p === 'WebGLRenderer') return function () {
      return { setSize() { }, setPixelRatio() { }, render() { }, domElement: { addEventListener() { } },
        xr: { enabled: false, isPresenting: false, getController: () => new Obj(), getSession: () => null, addEventListener() { }, setSession() { }, setReferenceSpaceType() { } },
        setAnimationLoop(cb) { if (!cb) return; for (let i = 1; i <= 3; i++) try { cb(16 * i); } catch (e) { console.error('LOOP ERROR:', e.message); process.exit(2); } } };
    };
    if (p === 'OrbitControls') return function () { return { enabled: true, enableDamping: false, dampingFactor: 0, target: V3(), update() { }, addEventListener() { } }; };
    if (p === 'VRButton') return { createButton: () => El() };
    return function () { return new Obj(); };
  },
});

// ---------- stub de DOM ----------
function El() {
  const e = { value: '30', textContent: '', innerHTML: '', style: {}, children: [], checked: false, classList: { toggle() { }, add() { }, remove() { } },
    appendChild(c) { this.children.push(c); return c; }, querySelector() { return El(); }, querySelectorAll() { return []; },
    addEventListener() { }, setAttribute() { }, click() { }, firstChild: null,
    get clientWidth() { return 1200; }, get clientHeight() { return 800; } };
  return new Proxy(e, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'string' && /^on/.test(k)) return null; return undefined; }, set(t, k, v) { t[k] = v; return true; } });
}
const els = {};
const bodyEl = El(); const headEl = El();
// el scaffold inyecta HTML con innerHTML y luego mueve firstChild: simulamos vacío (los
// getElementById crean el elemento bajo demanda, como hace el harness de index.html)
globalThis.document = { getElementById: id => els[id] || (els[id] = El()), createElement: () => El(), head: headEl, body: bodyEl, addEventListener() { } };
globalThis.window = globalThis; globalThis.innerWidth = 1200; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => { }; globalThis.localStorage = { getItem: () => null, setItem: () => { } };
globalThis.URL = globalThis.URL || {}; globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.Blob = globalThis.Blob || function () { }; globalThis.FileReader = function () { return { readAsText() { } }; };
globalThis.THREE = THREE;

// el seed embebido del HTML
const seedMatch = html.match(/window\.__seedLayout = (\{.*?\});<\/script>/s);
if (seedMatch) globalThis.__seedLayout = JSON.parse(seedMatch[1]);

try {
  new Function(mod)();
  const seedOk = !!seedMatch && globalThis.__seedLayout.instances.length >= 5;
  console.log(`✓ módulo standalone OK (initBuilder corrió con seed de ${seedMatch ? globalThis.__seedLayout.instances.length : 0} piezas)`);
  if (!seedOk) { console.error('✗ seed embebido incompleto'); process.exit(1); }
} catch (e) {
  console.error('✗ RUNTIME ERROR:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
