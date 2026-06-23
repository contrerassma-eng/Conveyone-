"""
mb400.py — Generador paramétrico MB400 (módulo de banda modular).
Conveyone · motor de catálogo. Misma interfaz que mt800.py.

Banda modular ancha arrastrada por piñones sobre un eje en cada extremo, con
tiras de desgaste, bastidores laterales, placas de extremo, patas/ruedas y
motorreductor. BOM contado de la geometría, MISMAS cantidades que el modelo
`mb400` del simulador JS (front == back). Ejes CAD: X=largo, Y=ancho, Z=vertical.
"""

from dataclasses import dataclass, asdict
import math
import cadquery as cq

import mt800  # reutiliza profile_t/beam/_band y la paleta de colores

COL = mt800.COL
L = cq.Location
V = cq.Vector


@dataclass
class MB400Params:
    length: float = 2000
    width: float = 400
    sprocket_d: float = 90
    sprocket_spacing: float = 120
    module_pitch: float = 50
    understructure: str = "legs"
    leg_height: float = 700
    drive_end: str = "left"
    side_guides: bool = True
    casters: bool = True
    bolts: bool = True
    rail: float = 40
    belt_thk: float = 6
    shaft_d: float = 25
    sprocket_w: float = 28

    def validate(self):
        self.length = float(max(600, min(8000, self.length)))
        self.width = float(max(200, min(1200, self.width)))
        self.sprocket_d = float(max(60, min(200, self.sprocket_d)))
        self.sprocket_spacing = float(max(60, min(300, self.sprocket_spacing)))
        self.module_pitch = float(max(25, min(100, self.module_pitch)))
        self.leg_height = float(max(300, min(1200, self.leg_height)))
        return self

    def sprockets(self):
        return int(max(2, round(self.width / self.sprocket_spacing) + 1))

    def wear_strips(self):
        return int(max(2, round(self.width / 80)))


MB400_SCHEMA = {
    "id": "mb400",
    "name": "MB400 · Módulo de banda modular",
    "params": [
        {"key": "length",           "label": "Largo (L)",       "type": "float", "default": 2000, "min": 600, "max": 8000, "step": 50, "unit": "mm"},
        {"key": "width",            "label": "Ancho útil (W)",  "type": "float", "default": 400,  "min": 200, "max": 1200, "step": 20, "unit": "mm"},
        {"key": "sprocket_d",       "label": "Piñón Ø",         "type": "float", "default": 90,   "min": 60,  "max": 200,  "step": 5,  "unit": "mm"},
        {"key": "sprocket_spacing", "label": "Paso de piñones", "type": "float", "default": 120,  "min": 60,  "max": 300,  "step": 10, "unit": "mm"},
        {"key": "module_pitch",     "label": "Paso de módulo",  "type": "float", "default": 50,   "min": 25,  "max": 100,  "step": 5,  "unit": "mm"},
        {"key": "understructure",   "label": "Soporte (UGN)",   "type": "enum",  "default": "legs", "options": ["legs", "low"]},
        {"key": "leg_height",       "label": "Altura de patas", "type": "float", "default": 700,  "min": 300, "max": 1200, "step": 10, "unit": "mm"},
        {"key": "drive_end",        "label": "Motriz (DM)",     "type": "enum",  "default": "left", "options": ["left", "right"]},
        {"key": "side_guides",      "label": "Guías laterales",  "type": "bool", "default": True},
        {"key": "casters",          "label": "Ruedas",          "type": "bool",  "default": True},
        {"key": "bolts",            "label": "Tornillería",     "type": "bool",  "default": True},
    ],
}


class _Ledger:
    def __init__(self):
        self.rows = []

    def rec(self, category, code, desc, dim, material, qty=1, source="geom"):
        self.rows.append({"category": category, "code": code, "desc": desc,
                          "qty": qty, "dim_mm": dim, "material": material, "source": source})

    def aggregate(self):
        out, order = {}, []
        for r in self.rows:
            k = r["code"]
            if k not in out:
                out[k] = dict(r); out[k]["qty"] = 0; order.append(k)
            out[k]["qty"] += r["qty"]
            if r["source"] == "geom":
                out[k]["source"] = "geom"
        return [dict(pos=i + 1, **out[k]) for i, k in enumerate(order)]


def _cyl_y(d, length):
    return cq.Workplane("XZ").circle(d / 2).extrude(length / 2, both=True)


def _assemble(params: MB400Params):
    p = params.validate()
    ns = p.sprockets()
    n_strip = p.wear_strips()
    R = p.sprocket_d / 2
    Ln, W = p.length, p.width
    span = Ln - 2 * (R + 14)
    belt_len = round(2 * span + math.pi * (p.sprocket_d + p.belt_thk))
    cols = max(1, round(belt_len / p.module_pitch))
    rows = max(1, round(W / 100))
    drive_sign = -1 if p.drive_end == "left" else 1
    Lni, Wi, sdi = int(Ln), int(W), int(p.sprocket_d)

    caster_h = 60 if (p.understructure == "legs" and p.casters) else 0
    railZ = (caster_h + p.leg_height) if p.understructure == "legs" else 70
    z = railZ + p.rail / 2 + R + 6

    asm = cq.Assembly(name="mb400")
    led = _Ledger()
    spY = [-W / 2 + W * (i / (ns - 1)) for i in range(ns)]

    # banda modular (lazo ancho)
    belt = mt800._band(span, p.sprocket_d, p.belt_thk, W)
    asm.add(belt.translate((0, 0, z)), name="belt", color=cq.Color(*COL["belt"]))
    led.rec("Banda", f"MB400-BELT-MOD-W{Wi}", f"Banda modular {Wi} mm", f"{Wi}x{belt_len} (perim.)", "POM/PP")

    # tiras de desgaste
    for i in range(n_strip):
        sy = -W / 2 + W * (i / (n_strip - 1))
        ws = cq.Workplane("XY").box(span, 18, 8).translate((0, sy, z - R + 2))
        asm.add(ws, name=f"wear_{i}", color=cq.Color(*COL["head_plate"]))
        led.rec("Soporte", f"MB400-WS-L{Lni}", "Tira de desgaste UHMW", f"18x8x{Lni}", "UHMW-PE")

    for sx in (-1, 1):
        motriz = (sx == drive_sign)
        shaft = _cyl_y(p.shaft_d, W + 80).translate((sx * span / 2, 0, z))
        asm.add(shaft, name=f"shaft_{sx}", color=cq.Color(*COL["shaft"]))
        led.rec("Transmisión",
                f"MB400-SH-DRV-{int(p.shaft_d)}" if motriz else f"MB400-SH-IDL-{int(p.shaft_d)}",
                "Eje motriz" if motriz else "Eje conducido", f"Ø{int(p.shaft_d)}x{Wi + 80}", "Acero")
        for i in range(ns):
            spr = _cyl_y(p.sprocket_d, p.sprocket_w).translate((sx * span / 2, spY[i], z))
            asm.add(spr, name=f"pulley_{sx}_{i}", color=cq.Color(*(COL["shaft"] if motriz else COL["pulley"])))
            led.rec("Transmisión",
                    f"MB400-SPR-DRV-D{sdi}" if motriz else f"MB400-SPR-IDL-D{sdi}",
                    "Piñón motriz" if motriz else "Piñón conducido", f"Ø{sdi}x{int(p.sprocket_w)}", "POM")
        brg = cq.Workplane("XY").box(60, 40, 40).translate((sx * span / 2, W / 2 + 20, z))
        brg = brg.union(cq.Workplane("XY").box(60, 40, 40).translate((sx * span / 2, -W / 2 - 20, z)))
        asm.add(brg, name=f"bearing_{sx}", color=cq.Color(*COL["bearing"]))
        led.rec("Transmisión", "MB400-BRG-UCF", "Rodamiento con soporte", f"Ø{int(p.shaft_d)}", "Acero/fundición", qty=2)
        ep = cq.Workplane("XY").box(10, W + 30, p.sprocket_d + 20).translate((sx * (span / 2 + 12), 0, z))
        asm.add(ep, name=f"endplate_{sx}", color=cq.Color(*COL["head_plate"]))
        led.rec("Cabezal", "MB400-EP", "Placa de extremo", f"{Wi + 30}x{sdi + 20}x10", "Acero")

    # motorreductor
    mx = drive_sign * (span / 2 + 90)
    my = -W / 2 - 60
    gear = cq.Workplane("XY").box(160, 96, 72).translate((mx, my, z))
    asm.add(gear, name="gearbox", color=cq.Color(*COL["motor"]))
    led.rec("Accionamiento", "MT-GM-160x72", "Motorreductor", "160x72", "Anodizado")
    mp = cq.Workplane("YZ").box(95, 95, 8).translate((drive_sign * (span / 2 + 16), my + 30, z))
    asm.add(mp, name="motor_plate", color=cq.Color(*COL["motor_plate"]))
    led.rec("Accionamiento", "MB400-MP", "Placa de motor", "95x95x8", "Aluminio")

    # bastidores + travesaños
    yExt = W / 2 + p.rail / 2 + 10
    for yy in (-yExt, yExt):
        asm.add(mt800.beam(Ln, "X", p.rail).translate((0, yy, railZ)), name=f"rail_{yy}", color=cq.Color(*COL["rail"]))
        led.rec("Perfil", f"MB400-PF-40-L{Lni}", "Bastidor lateral (T-slot 40)", f"40x40x{Lni}", "Aluminio anodizado")
    cross_x = (-span / 2 + R, 0, span / 2 - R)
    for xc in cross_x:
        asm.add(mt800.beam(2 * yExt, "Y", p.rail).translate((xc, 0, railZ - p.rail)), name=f"cross_{xc}", color=cq.Color(*COL["rail"]))
        led.rec("Perfil", f"MB400-PF-40-W{Wi}", "Travesaño", f"40x40x{int(2 * yExt)}", "Aluminio anodizado")

    # guías laterales
    if p.side_guides:
        for yy in (-W / 2 - 4, W / 2 + 4):
            g = cq.Workplane("XY").box(Ln, 6, 30).translate((0, yy, z + R + 8))
            asm.add(g, name=f"guide_{yy}", color=cq.Color(*COL["rail"]))
            led.rec("Soporte", f"MB400-LA-L{Lni}", "Guía lateral (LA)", f"6x30x{Lni}", "Aluminio")

    # patas + ruedas/pies + tornillería
    n_legs = 0
    if p.understructure == "legs":
        legL = p.leg_height
        for xc in (-span / 2 + R, span / 2 - R):
            for yy in (-yExt, yExt):
                asm.add(mt800.beam(legL, "Z", p.rail).translate((xc, yy, caster_h + legL / 2)),
                        name=f"leg_{int(xc)}_{yy}", color=cq.Color(*COL["rail"]))
                led.rec("Perfil", "MA4080", "Pata de soporte (UGN)", f"40x80x{int(legL)}", "Aluminio anodizado")
                n_legs += 1
                if p.casters:
                    wheel = cq.Workplane("YZ").circle(30).extrude(9, both=True).translate((xc, yy, 30))
                    asm.add(wheel, name=f"wheel_{int(xc)}_{yy}", color=cq.Color(*COL["wheel"]))
                    led.rec("Soporte", "MB400-CW-60", "Rueda con freno", "Ø60", "Caucho/acero")
                else:
                    foot = cq.Workplane("XY").circle(28).extrude(50).translate((xc, yy, 25))
                    asm.add(foot, name=f"foot_{int(xc)}_{yy}", color=cq.Color(*COL["foot"]))
                    led.rec("Soporte", "MB400-FT-M12", "Pie nivelador M12", "Ø56", "Acero")
                if p.bolts:
                    for b in range(4):
                        bx = xc + (12 if b % 2 else -12)
                        by = yy + (12 if b < 2 else -12)
                        bolt = cq.Workplane("XY").circle(3).extrude(14).translate((bx, by, railZ + p.rail / 2))
                        asm.add(bolt, name=f"bolt_{int(xc)}_{yy}_{b}", color=cq.Color(*COL["bolt"]))
                        led.rec("Tornillería", "DIN912-M6x16", "Tornillo Allen M6", "M6x16", "Acero 8.8")
                        led.rec("Tornillería", "MB400-TN-M6", "Tuerca en T M6", "M6", "Acero", source="derived")

    # derivadas
    led.rec("Banda", "MB400-MOD", "Módulo de banda (link)", f"{int(p.module_pitch)}mm", "POM", qty=cols * rows, source="derived")
    led.rec("Conector", "MB400-SB", "Soporte de eje (bracket)", "—", "Acero", qty=4, source="derived")
    if n_legs:
        led.rec("Conector", "MTB800-331", "Conector de esquina", "48x48x36", "Aluminio", qty=n_legs, source="derived")
    led.rec("Accionamiento", "DM1-M10-M2", "Control board digital M10/M2", "—", "PCB", qty=1, source="derived")

    return asm, led


def build(params: MB400Params) -> cq.Assembly:
    return _assemble(params)[0]


def bom(params: MB400Params) -> list:
    return _assemble(params)[1].aggregate()


def metrics(params: MB400Params) -> dict:
    p = params.validate()
    R = p.sprocket_d / 2
    rows = bom(p)
    total_h = (p.leg_height if p.understructure == "legs" else 60) + p.rail + p.sprocket_d
    return {
        "code": bom_code(p),
        "width_mm": p.width,
        "sprockets": p.sprockets(),
        "envelope_mm": [int(p.length + 2 * (R + 24)), int(p.width + p.rail + 20), int(total_h)],
        "bom_lines": len(rows),
        "total_parts": sum(r["qty"] for r in rows),
    }


def bom_code(params: MB400Params) -> str:
    p = params.validate()
    s = "S2" if p.understructure == "legs" else "S0"
    la = "LA2" if p.side_guides else "LA0"
    ugn = "UGN2" if p.understructure == "legs" else "UGN0"
    dm = "DM1" if p.drive_end == "left" else "DM2"
    return f"MB400-Pro-FL-A-L{int(p.length)}-W{int(p.width)}-{s}-{la}-{ugn}-{dm}"


def export(asm, stem, ang=0.3, tol=0.08):
    asm.export(f"{stem}.step")
    try:
        asm.export(f"{stem}.glb", tolerance=tol, angularTolerance=ang)
    except TypeError:
        asm.export(f"{stem}.glb")
    return {"step": f"{stem}.step", "glb": f"{stem}.glb"}


def export_bom(params: MB400Params, stem: str):
    import csv, json
    rows = bom(params)
    code = bom_code(params)
    with open(f"{stem}.bom.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Pos", "Categoría", "Código", "Descripción", "Cant.", "Dim (mm)", "Material", "Origen"])
        for r in rows:
            w.writerow([r["pos"], r["category"], r["code"], r["desc"], r["qty"], r["dim_mm"], r["material"], r["source"]])
    with open(f"{stem}.bom.json", "w") as f:
        json.dump({"code": code, "params": asdict(params), "lines": rows,
                   "total_parts": sum(r["qty"] for r in rows)}, f, indent=2, ensure_ascii=False)
    return {"csv": f"{stem}.bom.csv", "json": f"{stem}.bom.json", "code": code, "lines": rows}


if __name__ == "__main__":
    import time, os
    p = MB400Params()
    t = time.time(); asm = build(p); print("build:", round(time.time() - t, 2), "s")
    out = export(asm, "/tmp/mb400_demo")
    for k, v in out.items():
        print(f"  {k}: {os.path.getsize(v)//1024} KB")
    rows = bom(p)
    print(f"BOM: {len(rows)} líneas, {sum(r['qty'] for r in rows)} piezas")
    print("metrics:", metrics(p))
