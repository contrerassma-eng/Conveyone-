"""
mt800.py — Generador paramétrico MT800-Pro (transportador de banda estrecha).
Conveyone · motor de catálogo. Calibrado al STEP real del MT800-Pro.

Esquema de catálogo (del código MT800-Pro-FL-A-L3000-W600-25TU1-S2-LA2-UGN2-DM1):
    L  = largo (mm)
    W  = ancho total (mm)        -> nº de bandas = W / pitch
    T  = ancho de banda (mm)
    UGN= understructure (low | legs)
    DM = posición de accionamiento (extremo motriz)
    LA = guías laterales

Discrimina 12 categorías de material (perfiles vs accesorios):
    perfil de banda, riel de chasis, placa de cabezal, polea, rodamiento,
    banda, eje, tornillería, motor, placa de motor, pie nivelador, rueda.

BOM contado de la geometría
---------------------------
A diferencia de un BOM por fórmula (lo que hace 3Dfindit/PARTcommunity), aquí el
despiece se **cuenta de la geometría realmente colocada**: cada `asm.add(...)`
que representa una pieza de catálogo se registra en un *ledger* con su código,
descripción, material y cantidad. `bom()` agrega ese ledger. Resultado: el BOM
no puede divergir del modelo —si cambias parámetros o geometría, las cantidades
se recalculan solas y siguen siendo exactas (p. ej. 140 tornillos reales, no 108
estimados). Las pocas líneas que no se modelan como sólido (tornillería en T 1:1
con cada tornillo, conectores estructurales, control board) se marcan con
`source="derived"` y se derivan de los conteos geométricos.

Ejes (CAD, Z arriba): X=largo  Y=ancho/reparto de bandas  Z=vertical
"""

from dataclasses import dataclass, asdict
import cadquery as cq

L = cq.Location
V = cq.Vector


@dataclass
class MT800Params:
    length: float = 1400      # L  (catálogo: 3000)
    width: float = 600        # W  ancho total
    belt_width: float = 25    # T  ancho de banda
    belt_pitch: float = 85    # paso entre bandas (W/pitch -> nº bandas)
    pulley_d: float = 34      # diámetro de polea de banda
    profile_h: float = 80     # alto del perfil de banda
    profile_w: float = 25     # ancho del perfil de banda
    rail: float = 40          # lado del perfil de chasis (T-slot)
    plate_thk: float = 8      # espesor de placa de cabezal
    understructure: str = "legs"   # 'low' | 'legs'
    leg_height: float = 700   # altura de patas (si understructure='legs')
    side_guides: bool = True  # LA: guías laterales
    casters: bool = True
    belt_color: str = "#161616"
    drive_end: str = "left"   # DM
    bolts: bool = True        # tornillería visible (STEP); off para visor ligero

    def validate(self):
        self.length = float(max(400, min(6000, self.length)))
        self.width = float(max(80, min(1500, self.width)))
        self.belt_width = float(max(15, min(80, self.belt_width)))
        return self

    def lanes(self):
        return int(max(1, round(self.width / self.belt_pitch)))


# RGBA 0..1  — 12 categorías para discriminar perfiles y accesorios
COL = {
    "belt_profile": (0.78, 0.79, 0.81, 1),  # perfil de banda, aluminio claro
    "rail":         (0.63, 0.65, 0.68, 1),  # perfil de chasis, anodizado
    "head_plate":   (0.87, 0.88, 0.90, 1),  # placa mecanizada, brillante
    "pulley":       (0.72, 0.74, 0.77, 1),  # polea, acero
    "bearing":      (0.50, 0.52, 0.56, 1),  # rodamiento, cromo oscuro
    "belt":         (0.09, 0.09, 0.10, 1),  # banda
    "shaft":        (0.69, 0.71, 0.74, 1),  # eje
    "bolt":         (0.40, 0.41, 0.44, 1),  # tornillería, zinc
    "motor":        (0.27, 0.28, 0.31, 1),  # motor, anodizado oscuro
    "motor_plate":  (0.81, 0.82, 0.84, 1),  # placa de motor
    "foot":         (0.34, 0.35, 0.38, 1),  # pie nivelador
    "wheel":        (0.12, 0.12, 0.13, 1),  # rueda
}


# --------------------------------------------------------------------------
# Perfiles
# --------------------------------------------------------------------------
def profile_t(length, side):
    """Perfil estructural T-slot side x side, extruido a lo largo de Z."""
    h = side / 2.0
    p = cq.Workplane("XY").rect(side, side).extrude(length)
    mouth = cq.Workplane("XY").box(8, 7, length).translate((0, h - 3.5, length / 2))
    cham = cq.Workplane("XY").box(15, 8, length).translate((0, h - 11, length / 2))
    cutter = mouth.union(cham)
    for a in (0, 90, 180, 270):
        p = p.cut(cutter.rotate((0, 0, 0), (0, 0, 1), a))
    p = p.cut(cq.Workplane("XY").circle(3.2).extrude(length))
    return p


def beam(length, axis, side):
    """Perfil T-slot centrado, orientado a lo largo de 'axis' ('X','Y','Z')."""
    b = profile_t(length, side).translate((0, 0, -length / 2))
    if axis == "X":
        b = b.rotate((0, 0, 0), (0, 1, 0), 90)
    elif axis == "Y":
        b = b.rotate((0, 0, 0), (1, 0, 0), 90)
    return b


def belt_profile(length, ph, pw):
    """Perfil de banda: sección alta y delgada con cabeza de guía y ranura T
    lateral. Extruido a lo largo de X (eje de banda)."""
    # cuerpo
    body = cq.Workplane("YZ").rect(pw, ph).extrude(length)
    body = body.translate((-length / 2, 0, 0))
    # ranura T lateral (una por cara ancha)
    for s in (-1, 1):
        mouth = cq.Workplane("YZ").rect(7, 14).extrude(length).translate((length / 2, s * (pw / 2 - 3), 0))
        cham = cq.Workplane("YZ").rect(7, 22).extrude(length).translate((length / 2, s * (pw / 2 - 9), 0))
        body = body.cut(mouth.union(cham))
    # rebaje superior (cabeza donde corre la banda)
    return body


# --------------------------------------------------------------------------
# Accesorios
# --------------------------------------------------------------------------
def pulley(pd, bw, bore):
    """Polea (eje a lo largo de Y) centrada en origen."""
    R = pd / 2
    roll = cq.Workplane("XZ").circle(R).extrude(bw / 2, both=True)
    roll = roll.cut(cq.Workplane("XZ").circle(bore / 2).extrude(bw, both=True))
    return roll


def bearing(pd, bw):
    """Par de anillos de rodamiento (uno en cada extremo de la polea).
    Modelado como un sólido = 2 rodamientos físicos."""
    R = pd / 2
    ring = cq.Workplane("XZ").circle(R * 0.62).extrude(3).translate((0, bw / 2 - 1.5, 0))
    ring = ring.cut(cq.Workplane("XZ").circle(R * 0.30).extrude(6).translate((0, bw / 2 - 1.5, 0)))
    ring2 = ring.translate((0, -(bw - 3), 0))
    return ring.union(ring2)


def head_plate(pd, thk, span):
    """Placa lateral de cabezal: racetrack mecanizado con barrenos de eje,
    cuadrícula de agujeros M5 y ranura ovalada de tensado (como la foto).
    Plano de la placa = XZ, espesor a lo largo de Y."""
    R = pd / 2 + 6
    plate = cq.Workplane("XZ").slot2D(span + 2 * R, 2 * R).extrude(thk / 2, both=True)
    # barrenos de eje en los focos
    plate = plate.cut(cq.Workplane("XZ").pushPoints([(span / 2, 0), (-span / 2, 0)])
                      .circle(5).extrude(thk, both=True))
    # cuadrícula de agujeros M5
    grid = [(x, z) for x in (-span * 0.22, 0, span * 0.22) for z in (R * 0.5, 0, -R * 0.5)]
    plate = plate.cut(cq.Workplane("XZ").pushPoints(grid).circle(2.5).extrude(thk, both=True))
    # ranura ovalada de tensado en cada extremo
    for sx in (-1, 1):
        slot = cq.Workplane("XZ").slot2D(16, 5.5, 90).extrude(thk, both=True)
        plate = plate.cut(slot.translate((sx * span * 0.5, 0, 0)))
    return plate, grid


def bolt(head_d=8.5, head_h=3, shank_d=5, shank_h=10):
    """Tornillo Allen (cabeza cilíndrica), eje a lo largo de Y."""
    head = cq.Workplane("XZ").circle(head_d / 2).extrude(head_h)
    head = head.cut(cq.Workplane("XZ").polygon(6, head_d * 0.55).extrude(head_h * 0.6))
    shank = cq.Workplane("XZ").circle(shank_d / 2).extrude(-shank_h)
    return head.union(shank)


def motor_unit(shaft_d):
    """Cabezal motriz: placa de motor con agujeros perimetrales + buje +
    cuerpo del motor 160x72. Salida a lo largo de +Y."""
    plate = cq.Workplane("XZ").rect(95, 95).extrude(8)
    # buje central
    plate = plate.union(cq.Workplane("XZ").circle(18).extrude(10))
    plate = plate.cut(cq.Workplane("XZ").circle(11).extrude(20))
    # agujeros perimetrales
    holes = [(x, z) for x in (-38, 38) for z in (-38, 0, 38)] + [(0, -38), (0, 38)]
    plate = plate.cut(cq.Workplane("XZ").pushPoints(holes).circle(3).extrude(8))
    plate = plate.translate((0, 0, 0))
    return plate


# banda hueca racetrack
def _band(span, pulley_d, belt_thk, width):
    r_in = pulley_d / 2
    r_out = r_in + belt_thk
    outer = cq.Workplane("XZ").slot2D(span + 2 * r_out, 2 * r_out).extrude(width / 2, both=True)
    inner = cq.Workplane("XZ").slot2D(span + 2 * r_in, 2 * r_in).extrude(width, both=True)
    return outer.cut(inner)


# --------------------------------------------------------------------------
# Ledger del BOM — registra cada pieza de catálogo a medida que se ensambla
# --------------------------------------------------------------------------
class _Ledger:
    """Acumula líneas de BOM ancladas a la geometría colocada."""

    def __init__(self):
        self.rows = []

    def rec(self, category, code, desc, dim, material, qty=1, source="geom"):
        self.rows.append({
            "category": category, "code": code, "desc": desc,
            "qty": qty, "dim_mm": dim, "material": material, "source": source,
        })

    def aggregate(self):
        """Agrupa por código, conserva el orden de primera aparición."""
        out, order = {}, []
        for r in self.rows:
            k = r["code"]
            if k not in out:
                out[k] = dict(r)
                out[k]["qty"] = 0
                order.append(k)
            out[k]["qty"] += r["qty"]
            # si alguna aparición es geométrica, la línea es geométrica
            if r["source"] == "geom":
                out[k]["source"] = "geom"
        return [dict(pos=i + 1, **out[k]) for i, k in enumerate(order)]


# --------------------------------------------------------------------------
# Ensamblaje (geometría + ledger en una sola pasada)
# --------------------------------------------------------------------------
def _assemble(params: MT800Params):
    """Construye el ensamblaje y, en la misma pasada, el ledger del BOM.
    Devuelve (asm, ledger)."""
    p = params.validate()
    n = p.lanes()
    R = p.pulley_d / 2
    Ln = p.length
    bw = p.belt_width
    pitch = p.width / n
    span = Ln - 2 * (R + 14)
    belt_len = round(2 * span + 3.1416 * (p.pulley_d + 6))  # longitud desarrollada
    lane_y = [-p.width / 2 + pitch / 2 + i * pitch for i in range(n)]
    drive_sign = -1 if p.drive_end == "left" else 1

    caster_h = 60 if (p.understructure == "legs" and p.casters) else 0
    railZ = (caster_h + p.leg_height) if p.understructure == "legs" else 70
    z = railZ + p.rail / 2 + p.profile_h / 2 + R + 6

    asm = cq.Assembly(name="mt800_pro")
    led = _Ledger()

    Ln_i, W_i, bw_i, pd_i = int(Ln), int(p.width), int(bw), int(p.pulley_d)

    proto_profile = belt_profile(Ln, p.profile_h, p.profile_w)
    proto_belt = _band(span, p.pulley_d, 3, bw)
    proto_pulley = pulley(p.pulley_d, bw, 12)
    proto_bearing = bearing(p.pulley_d, bw)
    plate_span = 150
    proto_plate, grid = head_plate(p.pulley_d, p.plate_thk, plate_span)
    proto_bolt = bolt()

    for i, y in enumerate(lane_y):
        asm.add(proto_profile, loc=L(V(0, y, z - R - p.profile_h / 2)),
                name=f"profile_{i}", color=cq.Color(*COL["belt_profile"]))
        led.rec("Perfil", f"MT800-05-301-W{bw_i}-L{Ln_i}", "Perfil de banda (guía)",
                f"{bw_i + 5}x80x{Ln_i}", "Aluminio")

        asm.add(proto_belt, loc=L(V(0, y, z)), name=f"belt_{i}", color=cq.Color(*COL["belt"]))
        led.rec("Banda", f"MT800-BELT-PVC-W{bw_i}", f"Banda PVC {bw_i} mm",
                f"{bw_i}x{belt_len} (perim.)", "PVC")

        for sx in (-1, 1):
            motriz = (sx == drive_sign)
            asm.add(proto_pulley, loc=L(V(sx * span / 2, y, z)),
                    name=f"pulley_{i}_{sx}", color=cq.Color(*COL["pulley"]))
            if motriz:
                led.rec("Transmisión", f"MT800-PUL-D{pd_i}", "Polea motriz", f"Ø{pd_i}x{bw_i}", "Acero")
            else:
                led.rec("Transmisión", f"MT800-PUL-D{pd_i}-I", "Polea idler", f"Ø{pd_i}x{bw_i}", "Acero")

            asm.add(proto_bearing, loc=L(V(sx * span / 2, y, z)),
                    name=f"bearing_{i}_{sx}", color=cq.Color(*COL["bearing"]))
            led.rec("Transmisión", "MT800-BRG-625", "Rodamiento", "Ø16x5", "Acero cromado", qty=2)

            for sp in (-1, 1):
                yb = y + sp * (bw / 2 + p.plate_thk / 2 + 1)
                px = sx * (span / 2 - plate_span / 2 + R)
                asm.add(proto_plate, loc=L(V(px, yb, z)),
                        name=f"plate_{i}_{sx}_{sp}", color=cq.Color(*COL["head_plate"]))
                if motriz:
                    led.rec("Cabezal", "MTB800-207", "Placa de cabezal motriz", "250x220x6", "Aluminio mecanizado")
                else:
                    led.rec("Cabezal", "MTB800-207-I", "Placa de cabezal idler (tensor)", "250x220x6", "Aluminio mecanizado")
                if p.bolts:
                    for (gx, gz) in grid[::2]:
                        by = yb + sp * (p.plate_thk / 2 + 1)
                        asm.add(proto_bolt, loc=L(V(px + gx, by, z + gz), V(1, 0, 0), 90 if sp > 0 else -90),
                                name=f"bolt_{i}_{sx}_{sp}_{gx}_{gz}", color=cq.Color(*COL["bolt"]))
                        led.rec("Tornillería", "DIN912-M5x12", "Tornillo Allen M5", "M5x12", "Acero 8.8")
                        # cada tornillo lleva su tuerca en T (1:1 con la geometría)
                        led.rec("Tornillería", "MT800-TN-M5", "Tuerca en T M5", "M5", "Acero", source="derived")

    shaft = cq.Workplane("XZ").circle(6).extrude((lane_y[-1] - lane_y[0]) + bw + 40)
    shaft = shaft.translate((drive_sign * span / 2, lane_y[0] - bw / 2 - 20, z))
    asm.add(shaft, name="drive_shaft", color=cq.Color(*COL["shaft"]))
    led.rec("Transmisión", "MT800-SH-12", "Eje motriz", f"Ø12x{W_i + 40}", "Acero")

    mx = drive_sign * (span / 2)
    my = lane_y[0] - 70
    asm.add(motor_unit(12), loc=L(V(mx, my + 30, z)), name="motor_plate", color=cq.Color(*COL["motor_plate"]))
    led.rec("Accionamiento", "MTB800-207-M", "Placa de motor", "95x95x8", "Aluminio")
    gear = cq.Workplane("XY").box(160, 96, 72).translate((mx, my - 30, z))
    asm.add(gear, name="gearbox", color=cq.Color(*COL["motor"]))
    led.rec("Accionamiento", "MT800-GM-160x72", "Motorreductor", "160x72", "Anodizado")
    # barril del motor: parte del motorreductor (no se cuenta aparte)
    barrel = cq.Workplane("XZ").circle(36).extrude(70).translate((mx + 6, my - 78, z))
    asm.add(barrel, name="motor_body", color=cq.Color(*COL["motor"]))

    yExt = p.width / 2 + p.rail / 2 + 6
    for yy in (-yExt, yExt):
        asm.add(beam(Ln, "X", p.rail), loc=L(V(0, yy, railZ)),
                name=f"rail_{yy}", color=cq.Color(*COL["rail"]))
        led.rec("Perfil", f"MT800-PF-40-L{Ln_i}", "Riel de chasis (T-slot 40)", f"40x40x{Ln_i}", "Aluminio anodizado")
    cross_x = (-span / 2 + R, 0, span / 2 - R)
    for xc in cross_x:
        asm.add(beam(2 * yExt, "Y", p.rail), loc=L(V(xc, 0, railZ - p.rail)),
                name=f"cross_{xc}", color=cq.Color(*COL["rail"]))
        led.rec("Perfil", f"MT800-PF-40-W{W_i}", "Travesaño de chasis", f"40x40x{int(2 * yExt)}", "Aluminio anodizado")

    if p.side_guides:
        guide = cq.Workplane("YZ").rect(6, 26).extrude(Ln).translate((-Ln / 2, 0, 0))
        for yy in (lane_y[0] - pitch / 2, lane_y[-1] + pitch / 2):
            asm.add(guide, loc=L(V(0, yy, z + R + 8)), name=f"guide_{yy}", color=cq.Color(*COL["rail"]))
            led.rec("Soporte", f"MT800-LA2-L{Ln_i}", "Guía lateral (LA)", f"6x26x{Ln_i}", "Aluminio")

    n_legs = 0
    if p.understructure == "legs":
        legL = p.leg_height
        for xc in (-span / 2 + R, span / 2 - R):
            for yy in (-yExt, yExt):
                asm.add(beam(legL, "Z", p.rail), loc=L(V(xc, yy, caster_h + legL / 2)),
                        name=f"leg_{xc}_{yy}", color=cq.Color(*COL["rail"]))
                led.rec("Perfil", "MTB800-302", "Pata de soporte (UGN)", f"40x40x{int(legL)}", "Aluminio anodizado")
                n_legs += 1
                if p.casters:
                    cw = 60
                    wheel = cq.Workplane("YZ").circle(cw / 2).extrude(18, both=True).translate((xc, yy, cw / 2))
                    asm.add(wheel, name=f"wheel_{xc}_{yy}", color=cq.Color(*COL["wheel"]))
                    led.rec("Soporte", "MT800-CW-60", "Rueda con freno", "Ø60", "Caucho/acero")
                    # horquilla: parte de la rueda (no se cuenta aparte)
                    fork = cq.Workplane("XY").box(14, 34, cw - 22).translate((xc, yy, cw / 2 + 6))
                    asm.add(fork, name=f"fork_{xc}_{yy}", color=cq.Color(*COL["foot"]))
                else:
                    foot = cq.Workplane("XY").circle(28).extrude(10).translate((xc, yy, 5))
                    rod = cq.Workplane("XY").circle(7).extrude(40).translate((xc, yy, 25))
                    asm.add(foot.union(rod), name=f"foot_{xc}_{yy}", color=cq.Color(*COL["foot"]))
                    led.rec("Soporte", "MT800-FT-M12", "Pie nivelador M12", "Ø56", "Acero")

    # --- líneas derivadas (no modeladas como sólido) tras los conteos geométricos ---
    led.rec("Conector", "MT800-217", "Tope de banda", "45x15x15", "Aluminio", qty=2 * n, source="derived")
    led.rec("Conector", "MTB800-301", "Soporte de travesaño", "64x28x28", "Aluminio", qty=2 * len(cross_x), source="derived")
    if n_legs:
        led.rec("Conector", "MTB800-331", "Conector de esquina", "48x48x36", "Aluminio", qty=n_legs, source="derived")
    led.rec("Accionamiento", "DM1-M10-M2", "Control board digital M10/M2", "—", "PCB", qty=1, source="derived")

    return asm, led


def build(params: MT800Params) -> cq.Assembly:
    asm, _ = _assemble(params)
    return asm


def bom(params: MT800Params) -> list:
    """Despiece (BOM) contado de la geometría realmente colocada.
    Cada línea lleva: pos, category, code, desc, qty, dim_mm, material, source."""
    _, led = _assemble(params)
    return led.aggregate()


def metrics(params: MT800Params) -> dict:
    p = params.validate()
    n = p.lanes()
    base = p.leg_height if p.understructure == "legs" else 60
    total_h = base + p.profile_h + p.pulley_d + 8
    rows = bom(p)
    return {
        "code": bom_code(p),
        "lanes": n,
        "belt_width_mm": p.belt_width,
        "envelope_mm": [round(p.length, 1), round(p.width + p.rail + 12, 1), round(total_h, 1)],
        "pitch_mm": round(p.width / n, 1),
        "understructure": p.understructure,
        "material_groups": len(COL),
        "bom_lines": len(rows),
        "total_parts": sum(r["qty"] for r in rows),
    }


def export(asm, stem, ang=0.25, tol=0.06):
    asm.export(f"{stem}.step")
    try:
        asm.export(f"{stem}.glb", tolerance=tol, angularTolerance=ang)
    except TypeError:
        asm.export(f"{stem}.glb")
    return {"step": f"{stem}.step", "glb": f"{stem}.glb"}


def bom_code(params: MT800Params) -> str:
    p = params.validate()
    s = "S2" if p.understructure == "legs" else "S0"
    la = "LA2" if p.side_guides else "LA0"
    ugn = "UGN2" if p.understructure == "legs" else "UGN0"
    dm = "DM1" if p.drive_end == "left" else "DM2"
    return f"MT800-Pro-FL-A-L{int(p.length)}-W{int(p.width)}-{int(p.belt_width)}TU1-{s}-{la}-{ugn}-{dm}"


def export_bom(params: MT800Params, stem: str):
    import csv, json
    rows = bom(params)
    code = bom_code(params)
    with open(f"{stem}.bom.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Pos", "Categoría", "Código", "Descripción", "Cant.", "Dim (mm)", "Material", "Origen"])
        for r in rows:
            w.writerow([r["pos"], r["category"], r["code"], r["desc"], r["qty"],
                        r["dim_mm"], r["material"], r["source"]])
    with open(f"{stem}.bom.json", "w") as f:
        json.dump({"code": code, "params": asdict(params), "lines": rows,
                   "total_parts": sum(r["qty"] for r in rows)}, f, indent=2, ensure_ascii=False)
    return {"csv": f"{stem}.bom.csv", "json": f"{stem}.bom.json", "code": code, "lines": rows}


if __name__ == "__main__":
    import time, os
    p = MT800Params(length=1400, width=600)
    t = time.time(); asm = build(p); print("build:", round(time.time() - t, 2), "s")
    t = time.time(); out = export(asm, "/tmp/mt800_demo"); print("export:", round(time.time() - t, 2), "s")
    for k, v in out.items():
        print(f"  {k}: {os.path.getsize(v)//1024} KB")
    rows = bom(p)
    print(f"BOM: {len(rows)} líneas, {sum(r['qty'] for r in rows)} piezas")
    print("metrics:", metrics(p))
