"""
mc400.py — Generador paramétrico MC400 (curva de banda/rodillos).
Conveyone · motor de catálogo. Misma interfaz que mt800.py:
    build / metrics / bom / bom_code / export / export_bom

Curva en el plano XY (centro del arco en el origen). Rodillos radiales
repartidos por el ángulo, bastidores interior/exterior como arcos (revolve),
banda como sector anular, placas de extremo radiales. Z arriba.

BOM contado de la geometría (mismo criterio y MISMAS cantidades que el modelo
JS del simulador: front == back).
"""

from dataclasses import dataclass, asdict
import math
import cadquery as cq

L = cq.Location
V = cq.Vector


@dataclass
class MC400Params:
    angle: float = 90          # ángulo de curva (30/45/60/90)
    inner_radius: float = 400  # radio interior
    width: float = 300         # ancho útil
    roller_pitch: float = 80   # paso entre rodillos (arco)
    roller_d: float = 40       # diámetro de rodillo
    understructure: str = "legs"
    leg_height: float = 700
    drive_end: str = "start"   # 'start' | 'end'
    side_guides: bool = True
    casters: bool = True
    bolts: bool = True
    rail: float = 40           # lado del perfil de pata
    frame_t: float = 30        # ancho del bastidor
    frame_h: float = 60        # alto del bastidor

    def validate(self):
        self.angle = 90 if int(self.angle) not in (30, 45, 60, 90) else int(self.angle)
        self.inner_radius = float(max(200, min(1000, self.inner_radius)))
        self.width = float(max(150, min(600, self.width)))
        self.roller_pitch = float(max(40, min(160, self.roller_pitch)))
        self.roller_d = float(max(25, min(80, self.roller_d)))
        self.leg_height = float(max(300, min(1200, self.leg_height)))
        return self

    def rollers(self):
        rmid = self.inner_radius + self.width / 2
        arc = rmid * self.angle * math.pi / 180
        return int(max(2, round(arc / self.roller_pitch) + 1))


COL = {
    "rail":       (0.63, 0.65, 0.68, 1),
    "head_plate": (0.87, 0.88, 0.90, 1),
    "pulley":     (0.72, 0.74, 0.77, 1),
    "shaft":      (0.69, 0.71, 0.74, 1),
    "bearing":    (0.50, 0.52, 0.56, 1),
    "belt":       (0.09, 0.09, 0.10, 1),
    "bolt":       (0.40, 0.41, 0.44, 1),
    "motor":      (0.27, 0.28, 0.31, 1),
    "motor_plate":(0.81, 0.82, 0.84, 1),
    "foot":       (0.34, 0.35, 0.38, 1),
    "wheel":      (0.12, 0.12, 0.13, 1),
}

MC400_SCHEMA = {
    "id": "mc400",
    "name": "MC400 · Curva de banda",
    "params": [
        {"key": "angle",        "label": "Ángulo de curva", "type": "enum",  "default": 90, "options": [30, 45, 60, 90]},
        {"key": "inner_radius", "label": "Radio interior",  "type": "float", "default": 400, "min": 200, "max": 1000, "step": 20, "unit": "mm"},
        {"key": "width",        "label": "Ancho útil (W)",  "type": "float", "default": 300, "min": 150, "max": 600,  "step": 10, "unit": "mm"},
        {"key": "roller_pitch", "label": "Paso de rodillos","type": "float", "default": 80,  "min": 40,  "max": 160,  "step": 5,  "unit": "mm"},
        {"key": "roller_d",     "label": "Rodillo Ø",       "type": "float", "default": 40,  "min": 25,  "max": 80,   "step": 2,  "unit": "mm"},
        {"key": "understructure","label": "Soporte (UGN)",  "type": "enum",  "default": "legs", "options": ["legs", "low"]},
        {"key": "leg_height",   "label": "Altura de patas", "type": "float", "default": 700, "min": 300, "max": 1200, "step": 10, "unit": "mm"},
        {"key": "drive_end",    "label": "Motriz (DM)",     "type": "enum",  "default": "start", "options": ["start", "end"]},
        {"key": "side_guides",  "label": "Guías laterales",  "type": "bool", "default": True},
        {"key": "casters",      "label": "Ruedas",          "type": "bool",  "default": True},
        {"key": "bolts",        "label": "Tornillería",     "type": "bool",  "default": True},
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


def _roller(rd, length, bore=0):
    r = cq.Workplane("YZ").circle(rd / 2).extrude(length)
    if bore:
        r = r.cut(cq.Workplane("YZ").circle(bore / 2).extrude(length))
    return r


def _assemble(params: MC400Params):
    p = params.validate()
    n = p.rollers()
    Rin = p.inner_radius
    Rout = p.inner_radius + p.width
    Rmid = Rin + p.width / 2
    ang = p.angle
    angR = math.radians(ang)
    Wi, Ri, rdi = int(p.width), int(Rin), int(p.roller_d)

    caster_h = 60 if (p.understructure == "legs" and p.casters) else 0
    railZ = (caster_h + p.leg_height) if p.understructure == "legs" else 70
    z = railZ + p.rail / 2 + p.roller_d / 2 + 6
    belt_top = z + p.roller_d / 2 + 2

    asm = cq.Assembly(name="mc400")
    led = _Ledger()

    def rot(solid, th_deg):
        return solid.rotate((0, 0, 0), (0, 0, 1), th_deg)

    # bastidores interior/exterior (revolve de un perfil rect alrededor de Z)
    frame_in = cq.Workplane("XZ").center(Rin, z).rect(p.frame_t, p.frame_h).revolve(ang, (0, 0, 0), (0, 0, 1))
    asm.add(frame_in, name="frame_in", color=cq.Color(*COL["rail"]))
    led.rec("Perfil", f"MC400-SF-IN-R{Ri}", "Bastidor interior (arco)", f"R{Ri}·{ang}°", "Aluminio anodizado")
    frame_out = cq.Workplane("XZ").center(Rout, z).rect(p.frame_t, p.frame_h).revolve(ang, (0, 0, 0), (0, 0, 1))
    asm.add(frame_out, name="frame_out", color=cq.Color(*COL["rail"]))
    led.rec("Perfil", f"MC400-SF-OUT-R{int(Rout)}", "Bastidor exterior (arco)", f"R{int(Rout)}·{ang}°", "Aluminio anodizado")

    # banda (sector anular)
    belt = cq.Workplane("XZ").center(Rmid, belt_top).rect(p.width - 12, 3).revolve(ang, (0, 0, 0), (0, 0, 1))
    asm.add(belt, name="belt", color=cq.Color(*COL["belt"]))
    led.rec("Banda", f"MC400-BELT-PVC-W{Wi}", f"Banda PVC curva {Wi} mm", f"{Wi}·{ang}°", "PVC")

    drive_k = 0 if p.drive_end == "start" else n - 1
    for k in range(n):
        th = (k / (n - 1)) * ang  # grados
        motriz = (k == drive_k)
        roller = rot(_roller(p.roller_d, p.width, bore=12).translate((Rin, 0, z)), th)
        asm.add(roller, name=f"roller_{k}", color=cq.Color(*(COL["shaft"] if motriz else COL["pulley"])))
        if motriz:
            led.rec("Transmisión", f"MC400-DRV-W{Wi}", "Rodillo motriz (cónico)", f"Ø{rdi}xW{Wi}", "Acero")
        else:
            led.rec("Transmisión", f"MC400-ROL-W{Wi}", "Rodillo cónico", f"Ø{rdi}xW{Wi}", "Acero")

        ring = cq.Workplane("YZ").circle(p.roller_d * 0.3).extrude(3)
        ring = ring.cut(cq.Workplane("YZ").circle(p.roller_d * 0.16).extrude(3))
        bearing = ring.translate((Rin + 2, 0, z)).union(ring.translate((Rin + p.width - 5, 0, z)))
        asm.add(rot(bearing, th), name=f"bearing_{k}", color=cq.Color(*COL["bearing"]))
        led.rec("Transmisión", "MC400-BRG-625", "Rodamiento", "Ø16x5", "Acero cromado", qty=2)

        if p.bolts:
            for R in (Rin, Rout):
                for off in (-1, 1):
                    th_b = th + off * 0.7  # grados
                    b = cq.Workplane("XY").circle(2.5).extrude(12)
                    b = b.translate((R, 0, z)).rotate((0, 0, 0), (0, 0, 1), th_b)
                    asm.add(b, name=f"bolt_{k}_{int(R)}_{off}", color=cq.Color(*COL["bolt"]))
                    led.rec("Tornillería", "DIN912-M5x12", "Tornillo Allen M5", "M5x12", "Acero 8.8")
                    led.rec("Tornillería", "MT800-TN-M5", "Tuerca en T M5", "M5", "Acero", source="derived")

    # placas de extremo radiales
    for th in (0.0, float(ang)):
        plate = cq.Workplane("YZ").rect(p.width, p.roller_d + 16).extrude(8)
        plate = plate.translate((Rmid - 4, 0, z)).rotate((0, 0, 0), (0, 0, 1), th)
        asm.add(plate, name=f"endplate_{int(th)}", color=cq.Color(*COL["head_plate"]))
        led.rec("Cabezal", f"MC400-EP-W{Wi}", "Placa de extremo", f"{Wi}x{rdi + 16}x8", "Aluminio mecanizado")

    # motorreductor en el extremo motriz
    th_m = -8.0 if p.drive_end == "start" else float(ang) + 8.0
    gear = cq.Workplane("XY").box(96, 160, 72).translate((Rout + 90, 0, z)).rotate((0, 0, 0), (0, 0, 1), th_m)
    asm.add(gear, name="gearbox", color=cq.Color(*COL["motor"]))
    led.rec("Accionamiento", "MT-GM-160x72", "Motorreductor", "160x72", "Anodizado")
    mp = cq.Workplane("XY").box(95, 95, 8).translate((Rout + 10, 0, z)).rotate((0, 0, 0), (0, 0, 1), th_m)
    asm.add(mp, name="motor_plate", color=cq.Color(*COL["motor_plate"]))
    led.rec("Accionamiento", "MC400-MP", "Placa de motor", "95x95x8", "Aluminio")

    # guías laterales (interior + exterior)
    if p.side_guides:
        gi = cq.Workplane("XZ").center(Rin - 3, belt_top + 14).rect(6, 26).revolve(ang, (0, 0, 0), (0, 0, 1))
        asm.add(gi, name="guide_in", color=cq.Color(*COL["rail"]))
        led.rec("Soporte", "MC400-LA-IN", "Guía lateral interior (LA)", f"R{Ri}", "Aluminio")
        go = cq.Workplane("XZ").center(Rout + 3, belt_top + 14).rect(6, 26).revolve(ang, (0, 0, 0), (0, 0, 1))
        asm.add(go, name="guide_out", color=cq.Color(*COL["rail"]))
        led.rec("Soporte", "MC400-LA-OUT", "Guía lateral exterior (LA)", f"R{int(Rout)}", "Aluminio")

    # patas + ruedas/pies en las 4 esquinas del arco
    n_legs = 0
    if p.understructure == "legs":
        legL = p.leg_height
        corners = [(Rin, 3.0), (Rout, 3.0), (Rin, ang - 3.0), (Rout, ang - 3.0)]
        for (R, th) in corners:
            leg = cq.Workplane("XY").box(40, 80, legL).translate((R, 0, caster_h + legL / 2)).rotate((0, 0, 0), (0, 0, 1), th)
            asm.add(leg, name=f"leg_{int(R)}_{int(th)}", color=cq.Color(*COL["rail"]))
            led.rec("Perfil", "MA4080", "Pata de soporte (UGN)", f"40x80x{int(legL)}", "Aluminio anodizado")
            n_legs += 1
            if p.casters:
                wheel = _roller(60, 18).translate((R - 9, 0, 30)).rotate((0, 0, 0), (0, 0, 1), th)
                asm.add(wheel, name=f"wheel_{int(R)}_{int(th)}", color=cq.Color(*COL["wheel"]))
                led.rec("Soporte", "MC400-CW-60", "Rueda con freno", "Ø60", "Caucho/acero")
            else:
                foot = cq.Workplane("XY").circle(28).extrude(50).translate((R, 0, 25)).rotate((0, 0, 0), (0, 0, 1), th)
                asm.add(foot, name=f"foot_{int(R)}_{int(th)}", color=cq.Color(*COL["foot"]))
                led.rec("Soporte", "MC400-FT-M12", "Pie nivelador M12", "Ø56", "Acero")

    # derivadas
    led.rec("Conector", "MC400-RB", "Soporte de rodillo", "40x28x28", "Aluminio", qty=2 * n, source="derived")
    if n_legs:
        led.rec("Conector", "MTB800-331", "Conector de esquina", "48x48x36", "Aluminio", qty=n_legs, source="derived")
    led.rec("Accionamiento", "DM1-M10-M2", "Control board digital M10/M2", "—", "PCB", qty=1, source="derived")

    return asm, led


def build(params: MC400Params) -> cq.Assembly:
    asm, _ = _assemble(params)
    return asm


def bom(params: MC400Params) -> list:
    _, led = _assemble(params)
    return led.aggregate()


def metrics(params: MC400Params) -> dict:
    p = params.validate()
    n = p.rollers()
    Rout = p.inner_radius + p.width
    rows = bom(p)
    total_h = (p.leg_height if p.understructure == "legs" else 60) + p.frame_h + p.roller_d
    return {
        "code": bom_code(p),
        "angle_deg": p.angle,
        "rollers": n,
        "radius_mm": [int(p.inner_radius), int(Rout)],
        "envelope_mm": [int(Rout), int(Rout), int(total_h)],
        "width_mm": p.width,
        "bom_lines": len(rows),
        "total_parts": sum(r["qty"] for r in rows),
    }


def bom_code(params: MC400Params) -> str:
    p = params.validate()
    s = "S2" if p.understructure == "legs" else "S0"
    la = "LA2" if p.side_guides else "LA0"
    ugn = "UGN2" if p.understructure == "legs" else "UGN0"
    dm = "DM1" if p.drive_end == "start" else "DM2"
    return f"MC400-Pro-{p.angle}-A-R{int(p.inner_radius)}-W{int(p.width)}-{s}-{la}-{ugn}-{dm}"


def export(asm, stem, ang=0.3, tol=0.08):
    asm.export(f"{stem}.step")
    try:
        asm.export(f"{stem}.glb", tolerance=tol, angularTolerance=ang)
    except TypeError:
        asm.export(f"{stem}.glb")
    return {"step": f"{stem}.step", "glb": f"{stem}.glb"}


def export_bom(params: MC400Params, stem: str):
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
    p = MC400Params()
    t = time.time(); asm = build(p); print("build:", round(time.time() - t, 2), "s")
    out = export(asm, "/tmp/mc400_demo")
    for k, v in out.items():
        print(f"  {k}: {os.path.getsize(v)//1024} KB")
    rows = bom(p)
    print(f"BOM: {len(rows)} líneas, {sum(r['qty'] for r in rows)} piezas")
    print("metrics:", metrics(p))
