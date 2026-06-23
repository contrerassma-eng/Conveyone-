// mt800.js — modelo MT800-Pro para el motor del simulador.
//
// Una sola fuente de verdad: buildPlan(params) devuelve un PLAN = lista de piezas
// COLOCADAS (code, transform, primitiva geométrica) + líneas derivadas. De ese plan
// salen las tres cosas que pediste:
//   - representación exacta  -> el render dibuja cada pieza del plan
//   - BOM                    -> se CUENTA del plan (bom.js), no por fórmula
//   - exportación STEP       -> los mismos params van al backend CadQuery (B-Rep real)
//
// Espejo 1:1 de backend/mhaste/src/mt800.py, así el BOM del simulador y el del
// STEP coinciden exactamente.
//
// Ejes (convención CAD, Z arriba): X = largo, Y = ancho/reparto, Z = vertical.

export const schema = {
  id: 'mt800_pro',
  name: 'MT800-Pro · Transportador de banda estrecha',
  params: [
    { key: 'length',         label: 'Largo (L)',         type: 'float', default: 1400, min: 400, max: 6000, step: 50, unit: 'mm' },
    { key: 'width',          label: 'Ancho (W)',         type: 'float', default: 600,  min: 80,  max: 1500, step: 20, unit: 'mm' },
    { key: 'belt_width',     label: 'Banda (T)',         type: 'float', default: 25,   min: 15,  max: 80,   step: 5,  unit: 'mm' },
    { key: 'belt_pitch',     label: 'Paso entre bandas', type: 'float', default: 85,   min: 30,  max: 200,  step: 5,  unit: 'mm' },
    { key: 'pulley_d',       label: 'Polea Ø',           type: 'float', default: 34,   min: 20,  max: 80,   step: 2,  unit: 'mm' },
    { key: 'understructure', label: 'Soporte (UGN)',     type: 'enum',  default: 'legs', options: ['legs', 'low'] },
    { key: 'leg_height',     label: 'Altura de patas',   type: 'float', default: 700,  min: 300, max: 1200, step: 10, unit: 'mm' },
    { key: 'drive_end',      label: 'Motriz (DM)',       type: 'enum',  default: 'left', options: ['left', 'right'] },
    { key: 'side_guides',    label: 'Guías laterales',   type: 'bool',  default: true },
    { key: 'casters',        label: 'Ruedas',            type: 'bool',  default: true },
    { key: 'bolts',          label: 'Tornillería',       type: 'bool',  default: true },
    { key: 'belt_color',     label: 'Color de banda',    type: 'color', default: '#161616' },
  ],
};

// constantes no expuestas en el panel (calibradas al STEP real)
const FIXED = { profile_h: 80, profile_w: 25, rail: 40, plate_thk: 8 };

export function defaults() {
  const o = {};
  for (const p of schema.params) o[p.key] = p.default;
  return o;
}

export function validate(raw = {}) {
  const p = { ...defaults(), ...raw, ...FIXED };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  p.length = clamp(+p.length, 400, 6000);
  p.width = clamp(+p.width, 80, 1500);
  p.belt_width = clamp(+p.belt_width, 15, 80);
  p.belt_pitch = clamp(+p.belt_pitch, 30, 200);
  p.pulley_d = clamp(+p.pulley_d, 20, 80);
  p.leg_height = clamp(+p.leg_height, 300, 1200);
  return p;
}

export function lanes(p) {
  return Math.max(1, Math.round(p.width / p.belt_pitch));
}

export function code(raw) {
  const p = validate(raw);
  const s = p.understructure === 'legs' ? 'S2' : 'S0';
  const la = p.side_guides ? 'LA2' : 'LA0';
  const ugn = p.understructure === 'legs' ? 'UGN2' : 'UGN0';
  const dm = p.drive_end === 'left' ? 'DM1' : 'DM2';
  return `MT800-Pro-FL-A-L${Math.round(p.length)}-W${Math.round(p.width)}-${Math.round(p.belt_width)}TU1-${s}-${la}-${ugn}-${dm}`;
}

// los params que entiende el backend (POST /generate -> STEP/GLB/BOM)
export function backendParams(raw) {
  const p = validate(raw);
  return {
    length: p.length, width: p.width, belt_width: p.belt_width, belt_pitch: p.belt_pitch,
    pulley_d: p.pulley_d, understructure: p.understructure, leg_height: p.leg_height,
    drive_end: p.drive_end, side_guides: p.side_guides, casters: p.casters, bolts: p.bolts,
  };
}

// ---- el plan: piezas colocadas (fuente de verdad de geometría + BOM) ----
export function buildPlan(raw) {
  const p = validate(raw);
  const n = lanes(p);
  const R = p.pulley_d / 2;
  const Ln = p.length, bw = p.belt_width;
  const pitch = p.width / n;
  const span = Ln - 2 * (R + 14);
  const beltLen = Math.round(2 * span + Math.PI * (p.pulley_d + 6));
  const laneY = Array.from({ length: n }, (_, i) => -p.width / 2 + pitch / 2 + i * pitch);
  const driveSign = p.drive_end === 'left' ? -1 : 1;
  const casterH = (p.understructure === 'legs' && p.casters) ? 60 : 0;
  const railZ = p.understructure === 'legs' ? casterH + p.leg_height : 70;
  const z = railZ + p.rail / 2 + p.profile_h / 2 + R + 6;
  const Lni = Math.round(Ln), Wi = Math.round(p.width), bwi = Math.round(bw), pdi = Math.round(p.pulley_d);

  const parts = [];
  const derived = [];
  const part = (o) => { parts.push({ bomQty: 1, countsInBom: true, rot: null, ...o }); };

  for (let i = 0; i < n; i++) {
    const y = laneY[i];
    part({ id: `profile_${i}`, kind: 'box', mat: 'belt_profile',
      args: { dx: Ln, dy: p.profile_w, dz: p.profile_h }, pos: [0, y, z - R - p.profile_h / 2],
      category: 'Perfil', code: `MT800-05-301-W${bwi}-L${Lni}`, desc: 'Perfil de banda (guía)',
      material: 'Aluminio', dim: `${bwi + 5}x80x${Lni}` });

    part({ id: `belt_${i}`, kind: 'beltLoop', mat: 'belt',
      args: { span, r: R + 3, width: bw }, pos: [0, y, z],
      category: 'Banda', code: `MT800-BELT-PVC-W${bwi}`, desc: `Banda PVC ${bwi} mm`,
      material: 'PVC', dim: `${bwi}x${beltLen} (perim.)` });

    for (const sx of [-1, 1]) {
      const motriz = sx === driveSign;
      part({ id: `pulley_${i}_${sx}`, kind: 'cyl', axis: 'Y', mat: 'pulley',
        args: { d: p.pulley_d, len: bw }, pos: [sx * span / 2, y, z],
        category: 'Transmisión',
        code: motriz ? `MT800-PUL-D${pdi}` : `MT800-PUL-D${pdi}-I`,
        desc: motriz ? 'Polea motriz' : 'Polea idler', material: 'Acero', dim: `Ø${pdi}x${bwi}` });

      part({ id: `bearing_${i}_${sx}`, kind: 'cyl', axis: 'Y', mat: 'bearing', bomQty: 2,
        args: { d: p.pulley_d * 0.62, len: bw - 3 }, pos: [sx * span / 2, y, z],
        category: 'Transmisión', code: 'MT800-BRG-625', desc: 'Rodamiento',
        material: 'Acero cromado', dim: 'Ø16x5' });

      for (const sp of [-1, 1]) {
        const yb = y + sp * (bw / 2 + p.plate_thk / 2 + 1);
        const px = sx * (span / 2 - 150 / 2 + R);
        part({ id: `plate_${i}_${sx}_${sp}`, kind: 'box', mat: 'head_plate',
          args: { dx: 150, dy: p.plate_thk, dz: p.pulley_d + 12 }, pos: [px, yb, z],
          category: 'Cabezal',
          code: motriz ? 'MTB800-207' : 'MTB800-207-I',
          desc: motriz ? 'Placa de cabezal motriz' : 'Placa de cabezal idler (tensor)',
          material: 'Aluminio mecanizado', dim: '250x220x6' });

        if (p.bolts) {
          const Rp = p.pulley_d / 2 + 6;
          const gx = [-150 * 0.22, -150 * 0.22, 0, 150 * 0.22, 150 * 0.22];
          const gz = [Rp * 0.5, -Rp * 0.5, 0, Rp * 0.5, -Rp * 0.5];
          for (let k = 0; k < 5; k++) {
            const by = yb + sp * (p.plate_thk / 2 + 1);
            part({ id: `bolt_${i}_${sx}_${sp}_${k}`, kind: 'cyl', axis: 'Y', mat: 'bolt',
              hideByDefault: true, args: { d: 5, len: 12 }, pos: [px + gx[k], by, z + gz[k]],
              category: 'Tornillería', code: 'DIN912-M5x12', desc: 'Tornillo Allen M5',
              material: 'Acero 8.8', dim: 'M5x12' });
            // tuerca en T: 1:1 con cada tornillo (no se modela como sólido)
            derived.push({ category: 'Tornillería', code: 'MT800-TN-M5', desc: 'Tuerca en T M5',
              material: 'Acero', dim: 'M5', qty: 1 });
          }
        }
      }
    }
  }

  // eje motriz
  {
    const len = (laneY[n - 1] - laneY[0]) + bw + 40;
    const cy = laneY[0] - bw / 2 - 20 + len / 2;
    part({ id: 'drive_shaft', kind: 'cyl', axis: 'Y', mat: 'shaft',
      args: { d: 12, len }, pos: [driveSign * span / 2, cy, z],
      category: 'Transmisión', code: 'MT800-SH-12', desc: 'Eje motriz', material: 'Acero', dim: `Ø12x${Wi + 40}` });
  }

  // motorreductor
  {
    const mx = driveSign * span / 2;
    const my = laneY[0] - 70;
    part({ id: 'motor_plate', kind: 'box', mat: 'motor_plate',
      args: { dx: 95, dy: 8, dz: 95 }, pos: [mx, my + 30, z],
      category: 'Accionamiento', code: 'MTB800-207-M', desc: 'Placa de motor', material: 'Aluminio', dim: '95x95x8' });
    part({ id: 'gearbox', kind: 'box', mat: 'motor',
      args: { dx: 160, dy: 96, dz: 72 }, pos: [mx, my - 30, z],
      category: 'Accionamiento', code: 'MT800-GM-160x72', desc: 'Motorreductor', material: 'Anodizado', dim: '160x72' });
    // barril: parte del motorreductor (no cuenta en BOM)
    part({ id: 'motor_body', kind: 'cyl', axis: 'Y', mat: 'motor', countsInBom: false,
      args: { d: 72, len: 70 }, pos: [mx + 6, my - 78, z] });
  }

  // chasis: rieles + travesaños
  const yExt = p.width / 2 + p.rail / 2 + 6;
  for (const yy of [-yExt, yExt]) {
    part({ id: `rail_${yy}`, kind: 'tslot', axis: 'X', mat: 'rail',
      args: { len: Ln, side: p.rail }, pos: [0, yy, railZ],
      category: 'Perfil', code: `MT800-PF-40-L${Lni}`, desc: 'Riel de chasis (T-slot 40)',
      material: 'Aluminio anodizado', dim: `40x40x${Lni}` });
  }
  const crossX = [-span / 2 + R, 0, span / 2 - R];
  for (const xc of crossX) {
    part({ id: `cross_${xc}`, kind: 'tslot', axis: 'Y', mat: 'rail',
      args: { len: 2 * yExt, side: p.rail }, pos: [xc, 0, railZ - p.rail],
      category: 'Perfil', code: `MT800-PF-40-W${Wi}`, desc: 'Travesaño de chasis',
      material: 'Aluminio anodizado', dim: `40x40x${Math.round(2 * yExt)}` });
  }

  // guías laterales
  if (p.side_guides) {
    for (const yy of [laneY[0] - pitch / 2, laneY[n - 1] + pitch / 2]) {
      part({ id: `guide_${yy}`, kind: 'box', mat: 'rail',
        args: { dx: Ln, dy: 6, dz: 26 }, pos: [0, yy, z + R + 8],
        category: 'Soporte', code: `MT800-LA2-L${Lni}`, desc: 'Guía lateral (LA)',
        material: 'Aluminio', dim: `6x26x${Lni}` });
    }
  }

  // patas + ruedas/pies
  let nLegs = 0;
  if (p.understructure === 'legs') {
    const legL = p.leg_height;
    for (const xc of [-span / 2 + R, span / 2 - R]) {
      for (const yy of [-yExt, yExt]) {
        part({ id: `leg_${xc}_${yy}`, kind: 'tslot', axis: 'Z', mat: 'rail',
          args: { len: legL, side: p.rail }, pos: [xc, yy, casterH + legL / 2],
          category: 'Perfil', code: 'MTB800-302', desc: 'Pata de soporte (UGN)',
          material: 'Aluminio anodizado', dim: `40x40x${Math.round(legL)}` });
        nLegs++;
        if (p.casters) {
          part({ id: `wheel_${xc}_${yy}`, kind: 'cyl', axis: 'X', mat: 'wheel',
            args: { d: 60, len: 18 }, pos: [xc, yy, 30],
            category: 'Soporte', code: 'MT800-CW-60', desc: 'Rueda con freno', material: 'Caucho/acero', dim: 'Ø60' });
          part({ id: `fork_${xc}_${yy}`, kind: 'box', mat: 'foot', countsInBom: false,
            args: { dx: 14, dy: 34, dz: 38 }, pos: [xc, yy, 36] });
        } else {
          part({ id: `foot_${xc}_${yy}`, kind: 'cyl', axis: 'Z', mat: 'foot',
            args: { d: 56, len: 50 }, pos: [xc, yy, 25],
            category: 'Soporte', code: 'MT800-FT-M12', desc: 'Pie nivelador M12', material: 'Acero', dim: 'Ø56' });
        }
      }
    }
  }

  // líneas derivadas (no modeladas como sólido)
  derived.push({ category: 'Conector', code: 'MT800-217', desc: 'Tope de banda', material: 'Aluminio', dim: '45x15x15', qty: 2 * n });
  derived.push({ category: 'Conector', code: 'MTB800-301', desc: 'Soporte de travesaño', material: 'Aluminio', dim: '64x28x28', qty: 2 * crossX.length });
  if (nLegs) derived.push({ category: 'Conector', code: 'MTB800-331', desc: 'Conector de esquina', material: 'Aluminio', dim: '48x48x36', qty: nLegs });
  derived.push({ category: 'Accionamiento', code: 'DM1-M10-M2', desc: 'Control board digital M10/M2', material: 'PCB', dim: '—', qty: 1 });

  return {
    meta: {
      model: 'mt800_pro', code: code(p), lanes: n,
      envelope_mm: [Math.round(Ln), Math.round(p.width + p.rail + 12),
        Math.round((p.understructure === 'legs' ? p.leg_height : 60) + p.profile_h + p.pulley_d + 8)],
      pitch_mm: Math.round((p.width / n) * 10) / 10,
      belt_color: p.belt_color, scale_mm: 1,
    },
    params: p,
    parts,
    derived,
  };
}

export default { schema, defaults, validate, lanes, code, backendParams, buildPlan };
