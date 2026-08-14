// mc400.js — modelo MC400 (curva de banda/rodillos) para el motor del simulador.
//
// Misma interfaz que mt800.js: schema / defaults / validate / code / backendParams
// / buildPlan. El plan es la fuente de verdad: de ahí salen render, BOM contado y
// los params para el STEP del backend.
//
// Geometría: curva en el plano XY (centro del arco en el origen), rodillos
// radiales repartidos por el ángulo, bastidores interior/exterior como arcos,
// banda como sector anular, placas de extremo radiales. Z arriba.

const D2R = Math.PI / 180;

export const schema = {
  id: 'mc400',
  name: 'MC400 · Curva de banda',
  params: [
    { key: 'angle',        label: 'Ángulo de curva', type: 'enum',  default: 90, options: [30, 45, 60, 90] },
    { key: 'inner_radius', label: 'Radio interior',  type: 'float', default: 400, min: 200, max: 1000, step: 20, unit: 'mm' },
    { key: 'width',        label: 'Ancho útil (W)',  type: 'float', default: 300, min: 150, max: 600,  step: 10, unit: 'mm' },
    { key: 'roller_pitch', label: 'Paso de rodillos',type: 'float', default: 80,  min: 40,  max: 160,  step: 5,  unit: 'mm' },
    { key: 'roller_d',     label: 'Rodillo Ø',       type: 'float', default: 40,  min: 25,  max: 80,   step: 2,  unit: 'mm' },
    { key: 'understructure', label: 'Soporte (UGN)', type: 'enum',  default: 'legs', options: ['legs', 'low'] },
    { key: 'leg_height',   label: 'Altura de patas', type: 'float', default: 700, min: 300, max: 1200, step: 10, unit: 'mm' },
    { key: 'drive_end',    label: 'Motriz (DM)',     type: 'enum',  default: 'start', options: ['start', 'end'] },
    { key: 'side_guides',  label: 'Guías laterales',  type: 'bool', default: true },
    { key: 'casters',      label: 'Ruedas',          type: 'bool',  default: true },
    { key: 'bolts',        label: 'Tornillería',     type: 'bool',  default: true },
    { key: 'belt_color',   label: 'Color de banda',  type: 'color', default: '#161616' },
  ],
};

const FIXED = { rail: 40, frame_t: 30, frame_h: 60 };

export function defaults() {
  const o = {};
  for (const p of schema.params) o[p.key] = p.default;
  return o;
}

export function validate(raw = {}) {
  const p = { ...defaults(), ...raw, ...FIXED };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  p.angle = [30, 45, 60, 90].includes(+p.angle) ? +p.angle : 90;
  p.inner_radius = clamp(+p.inner_radius, 200, 1000);
  p.width = clamp(+p.width, 150, 600);
  p.roller_pitch = clamp(+p.roller_pitch, 40, 160);
  p.roller_d = clamp(+p.roller_d, 25, 80);
  p.leg_height = clamp(+p.leg_height, 300, 1200);
  return p;
}

export function rollerCount(p) {
  const rMid = p.inner_radius + p.width / 2;
  const arc = rMid * p.angle * D2R;
  return Math.max(2, Math.round(arc / p.roller_pitch) + 1);
}

export function code(raw) {
  const p = validate(raw);
  const s = p.understructure === 'legs' ? 'S2' : 'S0';
  const la = p.side_guides ? 'LA2' : 'LA0';
  const ugn = p.understructure === 'legs' ? 'UGN2' : 'UGN0';
  const dm = p.drive_end === 'start' ? 'DM1' : 'DM2';
  return `MC400-Pro-${p.angle}-A-R${Math.round(p.inner_radius)}-W${Math.round(p.width)}-${s}-${la}-${ugn}-${dm}`;
}

export function backendParams(raw) {
  const p = validate(raw);
  return {
    angle: p.angle, inner_radius: p.inner_radius, width: p.width, roller_pitch: p.roller_pitch,
    roller_d: p.roller_d, understructure: p.understructure, leg_height: p.leg_height,
    drive_end: p.drive_end, side_guides: p.side_guides, casters: p.casters, bolts: p.bolts,
  };
}

export function buildPlan(raw) {
  const p = validate(raw);
  const n = rollerCount(p);
  const Rin = p.inner_radius, Rout = p.inner_radius + p.width, Rmid = Rin + p.width / 2;
  const ang = p.angle, angR = ang * D2R;
  const Ri = Math.round(Rin), Wi = Math.round(p.width), rdi = Math.round(p.roller_d);

  const casterH = (p.understructure === 'legs' && p.casters) ? 60 : 0;
  const railZ = p.understructure === 'legs' ? casterH + p.leg_height : 70;
  const z = railZ + p.rail / 2 + p.roller_d / 2 + 6;
  const beltTop = z + p.roller_d / 2 + 2;

  const parts = [];
  const derived = [];
  const part = (o) => { parts.push({ bomQty: 1, countsInBom: true, rot: null, ...o }); };
  const at = (R, th) => [R * Math.cos(th), R * Math.sin(th), 0];

  // bastidores interior y exterior (arcos)
  part({ id: 'frame_in', kind: 'arc', mat: 'rail',
    args: { radius: Rin, a0: 0, a1: angR, w: p.frame_t, h: p.frame_h }, pos: [0, 0, z],
    category: 'Perfil', code: `MC400-SF-IN-R${Ri}`, desc: 'Bastidor interior (arco)', material: 'Aluminio anodizado', dim: `R${Ri}·${ang}°` });
  part({ id: 'frame_out', kind: 'arc', mat: 'rail',
    args: { radius: Rout, a0: 0, a1: angR, w: p.frame_t, h: p.frame_h }, pos: [0, 0, z],
    category: 'Perfil', code: `MC400-SF-OUT-R${Math.round(Rout)}`, desc: 'Bastidor exterior (arco)', material: 'Aluminio anodizado', dim: `R${Math.round(Rout)}·${ang}°` });

  // banda (sector anular)
  part({ id: 'belt', kind: 'beltArc', mat: 'belt',
    args: { rIn: Rin + 6, rOut: Rout - 6, a0: 0, a1: angR }, pos: [0, 0, beltTop],
    category: 'Banda', code: `MC400-BELT-PVC-W${Wi}`, desc: `Banda PVC curva ${Wi} mm`, material: 'PVC', dim: `${Wi}·${ang}°` });

  const driveK = p.drive_end === 'start' ? 0 : n - 1;
  // rodillos radiales + rodamientos + tornillería
  for (let k = 0; k < n; k++) {
    const th = (k / (n - 1)) * angR;
    const dir = [Math.cos(th), Math.sin(th), 0];
    const motriz = k === driveK;
    part({ id: `roller_${k}`, kind: 'cyl', dir, mat: motriz ? 'shaft' : 'pulley',
      args: { d: p.roller_d, len: p.width }, pos: at(Rmid, th).map((v, i) => i === 2 ? z : v),
      category: 'Transmisión',
      code: motriz ? `MC400-DRV-W${Wi}` : `MC400-ROL-W${Wi}`,
      desc: motriz ? 'Rodillo motriz (cónico)' : 'Rodillo cónico', material: 'Acero', dim: `Ø${rdi}xW${Wi}` });

    part({ id: `bearing_${k}`, kind: 'cyl', dir, mat: 'bearing', bomQty: 2,
      args: { d: p.roller_d * 0.6, len: p.width - 4 }, pos: at(Rmid, th).map((v, i) => i === 2 ? z : v),
      category: 'Transmisión', code: 'MC400-BRG-625', desc: 'Rodamiento', material: 'Acero cromado', dim: 'Ø16x5' });

    if (p.bolts) {
      for (const R of [Rin, Rout]) {
        for (const off of [-1, 1]) {
          const tth = th + off * 0.012;
          part({ id: `bolt_${k}_${Math.round(R)}_${off}`, kind: 'cyl', dir: [0, 0, 1], mat: 'bolt',
            hideByDefault: true, args: { d: 5, len: 12 }, pos: [R * Math.cos(tth), R * Math.sin(tth), z],
            category: 'Tornillería', code: 'DIN912-M5x12', desc: 'Tornillo Allen M5', material: 'Acero 8.8', dim: 'M5x12' });
          derived.push({ category: 'Tornillería', code: 'MT800-TN-M5', desc: 'Tuerca en T M5', material: 'Acero', dim: 'M5', qty: 1 });
        }
      }
    }
  }

  // placas de extremo (radiales) en θ=0 y θ=ang
  for (const th of [0, angR]) {
    part({ id: `endplate_${Math.round(th * 100)}`, kind: 'box', mat: 'head_plate', yaw: th,
      args: { dx: p.width, dy: 8, dz: p.roller_d + 16 }, pos: [Rmid * Math.cos(th), Rmid * Math.sin(th), z],
      category: 'Cabezal', code: 'MC400-EP-W' + Wi, desc: 'Placa de extremo', material: 'Aluminio mecanizado', dim: `${Wi}x${rdi + 16}x8` });
  }

  // motorreductor en el extremo motriz
  {
    const th = p.drive_end === 'start' ? -0.10 : angR + 0.10;
    const mr = Rout + 90;
    part({ id: 'gearbox', kind: 'box', mat: 'motor', yaw: th,
      args: { dx: 96, dy: 160, dz: 72 }, pos: [mr * Math.cos(th), mr * Math.sin(th), z],
      category: 'Accionamiento', code: 'MT-GM-160x72', desc: 'Motorreductor', material: 'Anodizado', dim: '160x72' });
    part({ id: 'motor_plate', kind: 'box', mat: 'motor_plate', yaw: th,
      args: { dx: 95, dy: 8, dz: 95 }, pos: [(Rout + 10) * Math.cos(th), (Rout + 10) * Math.sin(th), z],
      category: 'Accionamiento', code: 'MC400-MP', desc: 'Placa de motor', material: 'Aluminio', dim: '95x95x8' });
  }

  // guías laterales (interior + exterior)
  if (p.side_guides) {
    part({ id: 'guide_in', kind: 'arc', mat: 'rail',
      args: { radius: Rin - 3, a0: 0, a1: angR, w: 6, h: 26 }, pos: [0, 0, beltTop + 14],
      category: 'Soporte', code: 'MC400-LA-IN', desc: 'Guía lateral interior (LA)', material: 'Aluminio', dim: `R${Ri}` });
    part({ id: 'guide_out', kind: 'arc', mat: 'rail',
      args: { radius: Rout + 3, a0: 0, a1: angR, w: 6, h: 26 }, pos: [0, 0, beltTop + 14],
      category: 'Soporte', code: 'MC400-LA-OUT', desc: 'Guía lateral exterior (LA)', material: 'Aluminio', dim: `R${Math.round(Rout)}` });
  }

  // patas + ruedas/pies en las 4 esquinas del arco
  let nLegs = 0;
  if (p.understructure === 'legs') {
    const legL = p.leg_height;
    const corners = [[Rin, 0.05], [Rout, 0.05], [Rin, angR - 0.05], [Rout, angR - 0.05]];
    for (const [R, th] of corners) {
      const x = R * Math.cos(th), y = R * Math.sin(th);
      part({ id: `leg_${Math.round(x)}_${Math.round(y)}`, kind: 'tslot', axis: 'Z', mat: 'rail',
        args: { len: legL, side: p.rail }, pos: [x, y, casterH + legL / 2],
        category: 'Perfil', code: 'MA4080', desc: 'Pata de soporte (UGN)', material: 'Aluminio anodizado', dim: `40x80x${Math.round(legL)}` });
      nLegs++;
      if (p.casters) {
        part({ id: `wheel_${Math.round(x)}_${Math.round(y)}`, kind: 'cyl', axis: 'X', mat: 'wheel',
          args: { d: 60, len: 18 }, pos: [x, y, 30],
          category: 'Soporte', code: 'MC400-CW-60', desc: 'Rueda con freno', material: 'Caucho/acero', dim: 'Ø60' });
        part({ id: `fork_${Math.round(x)}_${Math.round(y)}`, kind: 'box', mat: 'foot', countsInBom: false,
          args: { dx: 14, dy: 34, dz: 38 }, pos: [x, y, 36] });
      } else {
        part({ id: `foot_${Math.round(x)}_${Math.round(y)}`, kind: 'cyl', axis: 'Z', mat: 'foot',
          args: { d: 56, len: 50 }, pos: [x, y, 25],
          category: 'Soporte', code: 'MC400-FT-M12', desc: 'Pie nivelador M12', material: 'Acero', dim: 'Ø56' });
      }
    }
  }

  // derivadas
  derived.push({ category: 'Conector', code: 'MC400-RB', desc: 'Soporte de rodillo', material: 'Aluminio', dim: '40x28x28', qty: 2 * n });
  if (nLegs) derived.push({ category: 'Conector', code: 'MTB800-331', desc: 'Conector de esquina', material: 'Aluminio', dim: '48x48x36', qty: nLegs });
  derived.push({ category: 'Accionamiento', code: 'DM1-M10-M2', desc: 'Control board digital M10/M2', material: 'PCB', dim: '—', qty: 1 });

  return {
    meta: {
      model: 'mc400', code: code(p), angle: ang, rollers: n,
      envelope_mm: [Math.round(Rout), Math.round(Rout), Math.round((p.understructure === 'legs' ? p.leg_height : 60) + p.frame_h + p.roller_d)],
      radius_mm: [Ri, Math.round(Rout)],
      belt_color: p.belt_color, scale_mm: 1, arc_center: [0, 0],
    },
    params: p,
    parts,
    derived,
  };
}

export default { schema, defaults, validate, rollerCount, code, backendParams, buildPlan };
