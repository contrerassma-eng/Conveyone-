"""
sorter.py — Generador paramétrico de sorter multibanda (banda estrecha).
Conveyone · motor de catálogo tipo eCATALOG.

Produce geometría B-Rep real con CadQuery (OpenCASCADE) y exporta:
  - STEP (AP214, con colores por componente) -> CAD nativo del cliente
  - GLB  (teselado con materiales)           -> visor web

Convención de ejes (CAD, Z arriba):
  X = largo de banda
  Y = ancho del sorter (reparto de bandas / eje motriz)
  Z = vertical
"""

from dataclasses import dataclass, asdict
import math
import cadquery as cq


# --------------------------------------------------------------------------
# Parámetros (mm). Defaults mapeados al plano: 3 bandas, Min.50, Ø20, 160x72.
# --------------------------------------------------------------------------
@dataclass
class SorterParams:
    lanes: int = 3            # número de bandas
    belt_length: float = 720  # distancia entre centros de polea
    pulley_d: float = 52      # diámetro de polea
    belt_width: float = 46    # ancho de banda
    belt_thk: float = 3.2     # espesor de banda
    plate_thk: float = 6      # espesor del bracket lateral
    plate_gap: float = 2.5    # holgura banda <-> bracket
    lane_gap: float = 50      # separación entre bandas (Min.50)
    shaft_d: float = 20       # diámetro del eje motriz (Ø20)
    frame_h: float = 540      # altura del chasis hasta apoyo de bandas
    profile: float = 40       # lado del perfil estructural (40x40)
    caster_d: float = 50      # diámetro de rueda
    motor_box_l: float = 160  # largo caja motorreductor
    motor_box_h: float = 104  # alto caja motorreductor
    motor_box_w: float = 96   # ancho caja motorreductor

    def validate(self):
        self.lanes = int(max(1, min(8, self.lanes)))
        self.belt_length = float(max(200, min(2400, self.belt_length)))
        self.pulley_d = float(max(20, min(120, self.pulley_d)))
        self.belt_width = float(max(20, min(120, self.belt_width)))
        return self


# Paleta de colores por componente (RGBA 0..1)
COL = {
    "alu":     (0.80, 0.81, 0.83, 1.0),
    "bracket": (0.86, 0.87, 0.89, 1.0),
    "steel":   (0.74, 0.76, 0.78, 1.0),
    "shaft":   (0.70, 0.72, 0.74, 1.0),
    "belt":    (0.09, 0.09, 0.10, 1.0),
    "motor":   (0.30, 0.31, 0.34, 1.0),
    "motorbox":(0.36, 0.37, 0.40, 1.0),
    "wheel":   (0.10, 0.10, 0.11, 1.0),
}


# --------------------------------------------------------------------------
# Componentes
# --------------------------------------------------------------------------
def _profile_t(length: float, side: float = 40.0):
    """Perfil estructural side x side con ranura en T en las 4 caras + canal
    central. Extruido a lo largo de Z. Devuelve un Workplane."""
    h = side / 2.0
    prof = cq.Workplane("XY").rect(side, side).extrude(length)

    # cortador en T para una cara (mirando +Y, centrado en X)
    mouth = cq.Workplane("XY").box(8, 7, length).translate((0, h - 3.5, length / 2))
    cham = cq.Workplane("XY").box(16, 8, length).translate((0, h - 11, length / 2))
    cutter = mouth.union(cham)

    for ang in (0, 90, 180, 270):
        prof = prof.cut(cutter.rotate((0, 0, 0), (0, 0, 1), ang))

    # canal central
    prof = prof.cut(cq.Workplane("XY").circle(3.4).extrude(length))
    return prof


def _beam(length, axis, side=40.0):
    """Perfil T orientado a lo largo de 'axis' ('X','Y','Z')."""
    b = _profile_t(length, side)  # a lo largo de Z, origen en z=0..length
    b = b.translate((0, 0, -length / 2))  # centrar
    if axis == "X":
        b = b.rotate((0, 0, 0), (0, 1, 0), 90)
    elif axis == "Y":
        b = b.rotate((0, 0, 0), (1, 0, 0), 90)
    return b


def _band(L, pulley_d, belt_thk, width):
    """Banda hueca racetrack (sección rectangular) centrada en origen,
    eje de ancho a lo largo de Y, plano del lazo en XZ."""
    r_in = pulley_d / 2.0
    r_out = r_in + belt_thk
    outer = cq.Workplane("XZ").slot2D(L + 2 * r_out, 2 * r_out).extrude(width / 2, both=True)
    inner = cq.Workplane("XZ").slot2D(L + 2 * r_in, 2 * r_in).extrude(width, both=True)
    return outer.cut(inner)


def _pulley(pulley_d, width, bore):
    """Polea con barreno y dos pestañas (flanges)."""
    R = pulley_d / 2.0
    roll = cq.Workplane("XZ").circle(R).extrude(width / 2, both=True)
    roll = roll.cut(cq.Workplane("XZ").circle(bore / 2).extrude(width, both=True))
    fl = cq.Workplane("XZ").circle(R * 1.06).extrude(2)
    roll = roll.union(fl.translate((0, width / 2, 0)))
    roll = roll.union(fl.translate((0, -width / 2 - 2, 0)))
    return roll


def _bracket(L, pulley_d, thk, bore):
    """Placa lateral racetrack con agujeros de eje y patrón de tornillos."""
    R = pulley_d / 2.0
    plate = cq.Workplane("XZ").slot2D(L + 2 * R, 2 * R).extrude(thk / 2, both=True)
    # agujeros de eje en los centros de polea
    plate = plate.cut(cq.Workplane("XZ").pushPoints([(L / 2, 0), (-L / 2, 0)])
                      .circle(bore / 2).extrude(thk, both=True))
    # patrón de tornillos M5 a lo largo de la barra
    pts = [(x, z) for x in (-L * 0.30, 0, L * 0.30) for z in (R * 0.45, -R * 0.45)]
    plate = plate.cut(cq.Workplane("XZ").pushPoints(pts).circle(2.5).extrude(thk, both=True))
    # ranura ovalada de montaje (slot) cerca de cada extremo
    for sx in (-1, 1):
        slot = cq.Workplane("XZ").slot2D(18, 6, 90).extrude(thk, both=True)
        plate = plate.cut(slot.translate((sx * L * 0.42, 0, 0)))
    return plate


def _motor(p: SorterParams, z):
    """Motorreductor: caja + barril con aletas + eje de salida + placa."""
    bl, bh, bw = p.motor_box_l, p.motor_box_h, p.motor_box_w
    box = cq.Workplane("XY").box(bl, bw, bh).translate((0, 0, z - 6))
    # barril a lo largo de Y (hacia -Y, detrás de la caja)
    barrel = cq.Workplane("XZ").circle(43).extrude(75).translate((8, -bw / 2, z - 6))
    body = box.union(barrel)
    # aletas de refrigeración
    for k in range(7):
        fin = cq.Workplane("XZ").circle(48).extrude(3)
        body = body.union(fin.translate((8, -bw / 2 - 12 - k * 9, z - 6)))
    # eje de salida hacia +Y (al eje motriz)
    out = cq.Workplane("XZ").circle(p.shaft_d / 2).extrude(40)
    body = body.union(out.translate((0, bw / 2, z)))
    # placa de montaje al chasis
    plate = cq.Workplane("YZ").box(150, 150, 8).translate((-bl / 2 - 4, 0, z - 10))
    body = body.union(plate)
    return body


# --------------------------------------------------------------------------
# Ensamblaje
# --------------------------------------------------------------------------
def build(params: SorterParams) -> cq.Assembly:
    p = params.validate()
    R = p.pulley_d / 2.0
    L = p.belt_length
    half = p.belt_width / 2 + p.plate_gap + p.plate_thk
    coreW = p.lanes * (2 * half) + (p.lanes - 1) * p.lane_gap
    z = p.frame_h + R + 4  # altura del eje de poleas
    lane_y = [-coreW / 2 + half + i * (2 * half + p.lane_gap) for i in range(p.lanes)]

    asm = cq.Assembly(name="sorter_multibanda")

    # --- bandas, poleas, brackets por lane ---
    band_proto = _band(L, p.pulley_d, p.belt_thk, p.belt_width)
    drive_pulley = _pulley(p.pulley_d, p.belt_width, p.shaft_d)
    idler_pulley = _pulley(p.pulley_d, p.belt_width, 12)
    drive_bracket = _bracket(L, p.pulley_d, p.plate_thk, p.shaft_d)

    for i, y in enumerate(lane_y):
        asm.add(band_proto.translate((0, y, z)), name=f"belt_{i}", color=cq.Color(*COL["belt"]))
        # polea motriz (lado -X) e idler (lado +X)
        asm.add(drive_pulley.translate((-L / 2, y, z)), name=f"pulley_drive_{i}", color=cq.Color(*COL["steel"]))
        asm.add(idler_pulley.translate((L / 2, y, z)), name=f"pulley_idler_{i}", color=cq.Color(*COL["steel"]))
        # brackets a ambos lados del ancho de banda
        for s in (-1, 1):
            yb = y + s * (p.belt_width / 2 + p.plate_gap + p.plate_thk / 2)
            asm.add(drive_bracket.translate((0, yb, z)), name=f"bracket_{i}_{s}",
                    color=cq.Color(*COL["bracket"]))

    # --- eje motriz Ø20 (a lo largo de Y, atraviesa poleas motrices) ---
    y0, yn = lane_y[0], lane_y[-1]
    motor_y = y0 - 130
    shaft_len = (yn + p.belt_width / 2 + 14) - (motor_y + 30)
    shaft = cq.Workplane("XZ").circle(p.shaft_d / 2).extrude(shaft_len)
    shaft = shaft.translate((-L / 2, motor_y + 30, z))
    asm.add(shaft, name="drive_shaft", color=cq.Color(*COL["shaft"]))
    # acoples por lane
    for i, y in enumerate(lane_y):
        cpl = cq.Workplane("XZ").circle(p.shaft_d * 0.78).extrude(11, both=True)
        asm.add(cpl.translate((-L / 2, y, z)), name=f"coupling_{i}", color=cq.Color(*COL["steel"]))

    # --- motorreductor ---
    asm.add(_motor(p, z).translate((-L / 2, motor_y, 0)), name="gearmotor",
            color=cq.Color(*COL["motorbox"]))

    # --- chasis (perfil T) ---
    zExt = coreW / 2 + 26
    xExt = L / 2 + 70
    leg_h = p.frame_h - p.caster_d
    leg = _beam(leg_h, "Z", p.profile)
    for (x, yy) in [(-xExt, -zExt), (xExt, -zExt), (-xExt, zExt), (xExt, zExt)]:
        asm.add(leg.translate((x, yy, p.caster_d + leg_h / 2)),
                name=f"leg_{x}_{yy}", color=cq.Color(*COL["alu"]))
    # vigas longitudinales (a lo largo de X) en ambos extremos de Y
    long_beam = _beam(2 * xExt, "X", p.profile)
    for yy in (-zExt, zExt):
        asm.add(long_beam.translate((0, yy, p.frame_h - p.profile / 2)),
                name=f"rail_top_{yy}", color=cq.Color(*COL["alu"]))
        asm.add(long_beam.translate((0, yy, p.caster_d + p.profile / 2 + 40)),
                name=f"rail_bot_{yy}", color=cq.Color(*COL["alu"]))
    # travesaños (a lo largo de Y) bajo poleas
    cross = _beam(2 * zExt, "Y", p.profile)
    for x in (-L / 2, L / 2, 0):
        asm.add(cross.translate((x, 0, p.frame_h - p.profile / 2)),
                name=f"cross_{x}", color=cq.Color(*COL["alu"]))

    # --- ruedas (casters) ---
    cw = p.caster_d
    wheel = cq.Workplane("YZ").circle(cw / 2).extrude(20, both=True)  # eje a lo largo de X
    for (x, yy) in [(-xExt, -zExt), (xExt, -zExt), (-xExt, zExt), (xExt, zExt)]:
        asm.add(wheel.translate((x, yy, cw / 2)), name=f"wheel_{x}_{yy}",
                color=cq.Color(*COL["wheel"]))
        fork = cq.Workplane("XY").box(14, 36, cw - 26).translate((x, yy, cw / 2 + 6))
        asm.add(fork, name=f"fork_{x}_{yy}", color=cq.Color(*COL["wheel"]))

    return asm


# --------------------------------------------------------------------------
# Métricas (lo que iría en el panel de propiedades del catálogo)
# --------------------------------------------------------------------------
def metrics(params: SorterParams) -> dict:
    p = params.validate()
    half = p.belt_width / 2 + p.plate_gap + p.plate_thk
    coreW = p.lanes * (2 * half) + (p.lanes - 1) * p.lane_gap
    total_w = coreW + 2 * 26
    total_l = p.belt_length + 2 * 70
    total_h = p.frame_h + p.pulley_d / 2 + 4 + p.belt_thk
    return {
        "lanes": p.lanes,
        "belt_length_mm": round(p.belt_length, 1),
        "envelope_mm": [round(total_l, 1), round(total_w, 1), round(total_h, 1)],
        "lane_pitch_mm": round(2 * half + p.lane_gap, 1),
        "shaft_d_mm": p.shaft_d,
        "pulley_d_mm": p.pulley_d,
        "belt_width_mm": p.belt_width,
    }


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def export(asm: cq.Assembly, stem: str):
    """Exporta STEP (B-Rep + color) y GLB (teselado + materiales)."""
    step_path = f"{stem}.step"
    glb_path = f"{stem}.glb"
    asm.export(step_path)
    # GLB con teselación fina para curvas suaves
    try:
        asm.export(glb_path, tolerance=0.05, angularTolerance=0.2)
    except TypeError:
        asm.export(glb_path)
    return {"step": step_path, "glb": glb_path}


if __name__ == "__main__":
    import time, os
    t0 = time.time()
    p = SorterParams()
    asm = build(p)
    print("build:", round(time.time() - t0, 2), "s")
    t1 = time.time()
    out = export(asm, "/home/claude/out/sorter_demo")
    print("export:", round(time.time() - t1, 2), "s")
    for k, v in out.items():
        print(f"  {k}: {os.path.getsize(v)//1024} KB  {v}")
    print("metrics:", metrics(p))
