// mb400.js — modelo MB400 (módulo de banda modular) para el motor del simulador.
//
// Banda modular ancha plana arrastrada por piñones (sprockets) sobre un eje en
// cada extremo, con tiras de desgaste, bastidores laterales, placas de extremo,
// patas/ruedas y motorreductor. Misma interfaz y mismo criterio de BOM que el
// resto (contado del plan). Ejes CAD: X=largo, Y=ancho, Z=vertical.

export const schema = {
  id: 'mb400',
  name: 'MB400 · Módulo de banda modular',
  params: [
    { key: 'length',           label: 'Largo (L)',         type: 'float', default: 2000, min: 600, max: 8000, step: 50, unit: 'mm' },
    { key: 'width',            label: 'Ancho útil (W)',    type: 'float', default: 400,  min: 200, max: 1200, step: 20, unit: 'mm' },
    { key: 'sprocket_d',       label: 'Piñón Ø',           type: 'float', default: 90,   min: 60,  max: 200,  step: 5,  unit: 'mm' },
    { key: 'sprocket_spacing', label: 'Paso de piñones',   type: 'float', default: 120,  min: 60,  max: 300,  step: 10, unit: 'mm' },
    { key: 'module_pitch',     label: 'Paso de módulo',    type: 'float', default: 50,   min: 25,  max: 100,  step: 5,  unit: 'mm' },
    { key: 'understructure',   label: 'Soporte (UGN)',     type: 'enum',  default: 'legs', options: ['legs', 'low'] },
    { key: 'leg_height',       label: 'Altura de patas',   type: 'float', default: 700,  min: 300, max: 1200, step: 10, unit: 'mm' },
    { key: 'drive_end',        label: 'Motriz (DM)',       type: 'enum',  default: 'left', options: ['left', 'right'] },
    { key: 'side_guides',      label: 'Guías laterales',   type: 'bool',  default: true },
    { key: 'casters',          label: 'Ruedas',            type: 'bool',  default: true },
    { key: 'bolts',            label: 'Tornillería',       type: 'bool',  default: true },
    { key: 'belt_color',       label: 'Color de banda',    type: 'color', default: '#1f5e5a' },
  ],
};

const FIXED = { rail: 40, belt_thk: 6, shaft_d: 25, sprocket_w: 28 };

export function defaults() {
  const o = {};
  for (const p of schema.params) o[p.key] = p.default;
  return o;
}

export function validate(raw = {}) {
  const p = { ...defaults(), ...raw, ...FIXED };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  p.length = clamp(+p.length, 600, 8000);
  p.width = clamp(+p.width, 200, 1200);
  p.sprocket_d = clamp(+p.sprocket_d, 60, 200);
  p.sprocket_spacing = clamp(+p.sprocket_spacing, 60, 300);
  p.module_pitch = clamp(+p.module_pitch, 25, 100);
  p.leg_height = clamp(+p.leg_height, 300, 1200);
  return p;
}

export function sprockets(p) { return Math.max(2, Math.round(p.width / p.sprocket_spacing) + 1); }
export function wearStrips(p) { return Math.max(2, Math.round(p.width / 80)); }

export function code(raw) {
  const p = validate(raw);
  const s = p.understructure === 'legs' ? 'S2' : 'S0';
  const la = p.side_guides ? 'LA2' : 'LA0';
  const ugn = p.understructure === 'legs' ? 'UGN2' : 'UGN0';
  const dm = p.drive_end === 'left' ? 'DM1' : 'DM2';
  return `MB400-Pro-FL-A-L${Math.round(p.length)}-W${Math.round(p.width)}-${s}-${la}-${ugn}-${dm}`;
}

export function backendParams(raw) {
  const p = validate(raw);
  return {
    length: p.length, width: p.width, sprocket_d: p.sprocket_d, sprocket_spacing: p.sprocket_spacing,
    module_pitch: p.module_pitch, understructure: p.understructure, leg_height: p.leg_height,
    drive_end: p.drive_end, side_guides: p.side_guides, casters: p.casters, bolts: p.bolts,
  };
}

export function buildPlan(raw) {
  const p = validate(raw);
  const ns = sprockets(p), nStrip = wearStrips(p);
  const R = p.sprocket_d / 2, Ln = p.length, W = p.width;
  const span = Ln - 2 * (R + 14);
  const beltLen = Math.round(2 * span + Math.PI * (p.sprocket_d + p.belt_thk));
  const cols = Math.max(1, Math.round(beltLen / p.module_pitch));
  const rows = Math.max(1, Math.round(W / 100));
  const driveSign = p.drive_end === 'left' ? -1 : 1;
  const Lni = Math.round(Ln), Wi = Math.round(W), sdi = Math.round(p.sprocket_d);

  const casterH = (p.understructure === 'legs' && p.casters) ? 60 : 0;
  const railZ = p.understructure === 'legs' ? casterH + p.leg_height : 70;
  const z = railZ + p.rail / 2 + R + 6;

  const parts = [];
  const derived = [];
  const part = (o) => { parts.push({ bomQty: 1, countsInBom: true, rot: null, ...o }); };
  const spY = Array.from({ length: ns }, (_, i) => -W / 2 + (W) * (i / (ns - 1)));

  // banda modular (lazo ancho)
  part({ id: 'belt', kind: 'beltLoop', mat: 'belt', args: { span, r: R + p.belt_thk, width: W }, pos: [0, 0, z],
    category: 'Banda', code: `MB400-BELT-MOD-W${Wi}`, desc: `Banda modular ${Wi} mm`, material: 'POM/PP', dim: `${Wi}x${beltLen} (perim.)` });

  // tiras de desgaste (UHMW) bajo la banda
  for (let i = 0; i < nStrip; i++) {
    const sy = -W / 2 + (W) * (i / (nStrip - 1));
    part({ id: `wear_${i}`, kind: 'box', mat: 'head_plate', args: { dx: span, dy: 18, dz: 8 }, pos: [0, sy, z - R + 2],
      category: 'Soporte', code: `MB400-WS-L${Lni}`, desc: 'Tira de desgaste UHMW', material: 'UHMW-PE', dim: `18x8x${Lni}` });
  }

  // ejes con piñones + rodamientos en cada extremo
  for (const sx of [-1, 1]) {
    const motriz = sx === driveSign;
    part({ id: `shaft_${sx}`, kind: 'cyl', axis: 'Y', mat: 'shaft', args: { d: p.shaft_d, len: W + 80 }, pos: [sx * span / 2, 0, z],
      category: 'Transmisión', code: motriz ? `MB400-SH-DRV-${Math.round(p.shaft_d)}` : `MB400-SH-IDL-${Math.round(p.shaft_d)}`,
      desc: motriz ? 'Eje motriz' : 'Eje conducido', material: 'Acero', dim: `Ø${Math.round(p.shaft_d)}x${Wi + 80}` });
    for (let i = 0; i < ns; i++) {
      part({ id: `pulley_${sx}_${i}`, kind: 'cyl', axis: 'Y', mat: motriz ? 'shaft' : 'pulley', args: { d: p.sprocket_d, len: p.sprocket_w }, pos: [sx * span / 2, spY[i], z],
        category: 'Transmisión', code: motriz ? `MB400-SPR-DRV-D${sdi}` : `MB400-SPR-IDL-D${sdi}`,
        desc: motriz ? 'Piñón motriz' : 'Piñón conducido', material: 'POM', dim: `Ø${sdi}x${p.sprocket_w}` });
    }
    part({ id: `bearing_${sx}`, kind: 'cyl', axis: 'Y', mat: 'bearing', bomQty: 2, args: { d: p.shaft_d * 1.6, len: 16 }, pos: [sx * span / 2, 0, z],
      category: 'Transmisión', code: 'MB400-BRG-UCF', desc: 'Rodamiento con soporte', material: 'Acero/fundición', dim: `Ø${Math.round(p.shaft_d)}` });
    // placa de extremo
    part({ id: `endplate_${sx}`, kind: 'box', mat: 'head_plate', args: { dx: 10, dy: W + 30, dz: p.sprocket_d + 20 }, pos: [sx * (span / 2 + 12), 0, z],
      category: 'Cabezal', code: 'MB400-EP', desc: 'Placa de extremo', material: 'Acero', dim: `${Wi + 30}x${sdi + 20}x10` });
  }

  // motorreductor (extremo motriz)
  {
    const mx = driveSign * (span / 2 + 90), my = -W / 2 - 60;
    part({ id: 'gearbox', kind: 'box', mat: 'motor', args: { dx: 160, dy: 96, dz: 72 }, pos: [mx, my, z],
      category: 'Accionamiento', code: 'MT-GM-160x72', desc: 'Motorreductor', material: 'Anodizado', dim: '160x72' });
    part({ id: 'motor_plate', kind: 'box', mat: 'motor_plate', args: { dx: 8, dy: 95, dz: 95 }, pos: [driveSign * (span / 2 + 16), my + 30, z],
      category: 'Accionamiento', code: 'MB400-MP', desc: 'Placa de motor', material: 'Aluminio', dim: '95x95x8' });
  }

  // bastidores laterales + travesaños
  const yExt = W / 2 + p.rail / 2 + 10;
  for (const yy of [-yExt, yExt]) {
    part({ id: `rail_${yy}`, kind: 'tslot', axis: 'X', mat: 'rail', args: { len: Ln, side: p.rail }, pos: [0, yy, railZ],
      category: 'Perfil', code: `MB400-PF-40-L${Lni}`, desc: 'Bastidor lateral (T-slot 40)', material: 'Aluminio anodizado', dim: `40x40x${Lni}` });
  }
  const crossX = [-span / 2 + R, 0, span / 2 - R];
  for (const xc of crossX) {
    part({ id: `cross_${xc}`, kind: 'tslot', axis: 'Y', mat: 'rail', args: { len: 2 * yExt, side: p.rail }, pos: [xc, 0, railZ - p.rail],
      category: 'Perfil', code: `MB400-PF-40-W${Wi}`, desc: 'Travesaño', material: 'Aluminio anodizado', dim: `40x40x${Math.round(2 * yExt)}` });
  }

  // guías laterales
  if (p.side_guides) {
    for (const yy of [-W / 2 - 4, W / 2 + 4]) {
      part({ id: `guide_${yy}`, kind: 'box', mat: 'rail', args: { dx: Ln, dy: 6, dz: 30 }, pos: [0, yy, z + R + 8],
        category: 'Soporte', code: `MB400-LA-L${Lni}`, desc: 'Guía lateral (LA)', material: 'Aluminio', dim: `6x30x${Lni}` });
    }
  }

  // patas + ruedas/pies
  let nLegs = 0;
  if (p.understructure === 'legs') {
    const legL = p.leg_height;
    for (const xc of [-span / 2 + R, span / 2 - R]) {
      for (const yy of [-yExt, yExt]) {
        part({ id: `leg_${Math.round(xc)}_${yy}`, kind: 'tslot', axis: 'Z', mat: 'rail', args: { len: legL, side: p.rail }, pos: [xc, yy, casterH + legL / 2],
          category: 'Perfil', code: 'MA4080', desc: 'Pata de soporte (UGN)', material: 'Aluminio anodizado', dim: `40x80x${Math.round(legL)}` });
        nLegs++;
        if (p.casters) {
          part({ id: `wheel_${Math.round(xc)}_${yy}`, kind: 'cyl', axis: 'X', mat: 'wheel', args: { d: 60, len: 18 }, pos: [xc, yy, 30],
            category: 'Soporte', code: 'MB400-CW-60', desc: 'Rueda con freno', material: 'Caucho/acero', dim: 'Ø60' });
          part({ id: `fork_${Math.round(xc)}_${yy}`, kind: 'box', mat: 'foot', countsInBom: false, args: { dx: 14, dy: 34, dz: 38 }, pos: [xc, yy, 36] });
        } else {
          part({ id: `foot_${Math.round(xc)}_${yy}`, kind: 'cyl', axis: 'Z', mat: 'foot', args: { d: 56, len: 50 }, pos: [xc, yy, 25],
            category: 'Soporte', code: 'MB400-FT-M12', desc: 'Pie nivelador M12', material: 'Acero', dim: 'Ø56' });
        }
        if (p.bolts) {
          for (let b = 0; b < 4; b++) {
            part({ id: `bolt_leg_${Math.round(xc)}_${yy}_${b}`, kind: 'cyl', dir: [0, 0, 1], mat: 'bolt', hideByDefault: true,
              args: { d: 6, len: 14 }, pos: [xc + (b % 2 ? 12 : -12), yy + (b < 2 ? 12 : -12), railZ + p.rail / 2],
              category: 'Tornillería', code: 'DIN912-M6x16', desc: 'Tornillo Allen M6', material: 'Acero 8.8', dim: 'M6x16' });
            derived.push({ category: 'Tornillería', code: 'MB400-TN-M6', desc: 'Tuerca en T M6', material: 'Acero', dim: 'M6', qty: 1 });
          }
        }
      }
    }
  }

  // derivadas
  derived.push({ category: 'Banda', code: 'MB400-MOD', desc: 'Módulo de banda (link)', material: 'POM', dim: `${p.module_pitch}mm`, qty: cols * rows });
  derived.push({ category: 'Conector', code: 'MB400-SB', desc: 'Soporte de eje (bracket)', material: 'Acero', dim: '—', qty: 4 });
  if (nLegs) derived.push({ category: 'Conector', code: 'MTB800-331', desc: 'Conector de esquina', material: 'Aluminio', dim: '48x48x36', qty: nLegs });
  derived.push({ category: 'Accionamiento', code: 'DM1-M10-M2', desc: 'Control board digital M10/M2', material: 'PCB', dim: '—', qty: 1 });

  return {
    meta: {
      model: 'mb400', code: code(p), width_mm: Wi, sprockets: ns, belt_modules: cols * rows,
      envelope_mm: [Math.round(Ln + 2 * (R + 24)), Math.round(W + p.rail + 20), Math.round((p.understructure === 'legs' ? p.leg_height : 60) + p.rail + p.sprocket_d)],
      belt_color: p.belt_color, scale_mm: 1,
    },
    params: p, parts, derived,
  };
}

export default { schema, defaults, validate, sprockets, wearStrips, code, backendParams, buildPlan };
