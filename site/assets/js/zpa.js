/* ==========================================================================
   zpa.js — motor de la lógica de acumulación de cero presión (ZPA).

   Sin dibujo. Calcula el estado de las zonas y la posición de las cajas, y lo
   consumen tanto el visor 3D sobre el modelo CAD real como la vista 2D.

   El control es el real de un rodillo motorizado 24 VDC: la línea se divide en
   ZONAS y cada zona tiene fotocélula, tarjeta y motor. La tarjeta decide
   arrancar o parar mirando SOLO la zona siguiente. No hay un PLC central
   diciéndole a cada caja qué hacer.

   Modos:
     cero      Cada zona detiene su caja en su punto de parada cuando la zona
               siguiente está ocupada. Las cajas nunca se tocan.
     singulado Se entrega de a una: una zona arranca cuando la siguiente quedó
               completamente libre. Lo que pide un lector o un desviador.
     tren      Al liberar la salida arrancan todas las zonas a la vez y el
               grupo sale como un bloque.
   ========================================================================== */

export const PRESETS = {
  // ZP2026: 3.000 mm de tramo, cuatro zonas de 750 mm
  zp2026: { largo: 3000, zonas: 4, cajaL: 400, cajaW: 300, cajaH: 220 },
};

export function creaZPA(cfg = {}) {
  const C = {
    largo: 3000,
    zonas: 4,
    cajaL: 400,
    holgura: 130,       // separación mínima entre cajas (mm)
    v: 0.5,             // velocidad de línea (mm/ms) ≈ 30 m/min
    acel: 0.0032,       // rampa de arranque y frenado (mm/ms²)
    margenParada: 40,   // el frente se detiene esta distancia antes del fin de zona
    cadencia: 1500,     // ms entre cajas que entran
    maxCajas: 8,
    ...cfg,
  };
  const LZ = C.largo / C.zonas;

  const zonas = Array.from({ length: C.zonas }, (_, i) => ({
    i,
    ini: i * LZ,
    fin: (i + 1) * LZ,
    parada: (i + 1) * LZ - C.margenParada,
    // la fotocélula queda tapada por una caja detenida en el punto de parada
    ojo: (i + 1) * LZ - C.margenParada - C.cajaL * 0.5,
    motor: true,
    ocupada: false,
  }));

  const est = {
    modo: 'cero',
    salidaLibre: true,
    cajas: [],
    id: 1,
    tGen: 0,
  };

  const zonaDe = (frente) => {
    const i = Math.floor((frente - C.cajaL / 2) / LZ);
    return Math.max(0, Math.min(C.zonas - 1, i));
  };

  function decideMotores() {
    zonas.forEach((z) => {
      z.ocupada = est.cajas.some((b) => b.s - C.cajaL <= z.ojo && b.s >= z.ojo);
    });

    for (let i = C.zonas - 1; i >= 0; i--) {
      const z = zonas[i];
      if (i === C.zonas - 1) { z.motor = est.salidaLibre; continue; }
      const sig = zonas[i + 1];
      if (est.modo === 'tren') z.motor = est.salidaLibre;
      else if (est.modo === 'singulado') z.motor = !sig.ocupada && sig.motor;
      else z.motor = !sig.ocupada;
    }

    // singulado: solo la zona de más adelante entrega; las de atrás esperan turno
    if (est.modo === 'singulado' && est.salidaLibre) {
      let hayOcupadaAdelante = false;
      for (let i = C.zonas - 1; i >= 0; i--) {
        if (hayOcupadaAdelante) zonas[i].motor = false;
        if (zonas[i].ocupada) hayOcupadaAdelante = true;
      }
    }
  }

  function paso(dt) {
    decideMotores();
    est.cajas.sort((a, b) => b.s - a.s);

    est.cajas.forEach((b, idx) => {
      const z = zonas[zonaDe(b.s)];
      const adelante = est.cajas[idx - 1];

      let tope = Infinity;
      if (!z.motor) tope = Math.min(tope, z.parada);
      if (adelante) tope = Math.min(tope, adelante.s - C.cajaL - C.holgura);

      const objetivo = b.s < tope - 0.5 ? C.v : 0;
      if (b.v < objetivo) b.v = Math.min(objetivo, b.v + C.acel * dt);
      else if (b.v > objetivo) b.v = Math.max(objetivo, b.v - C.acel * dt);

      const nueva = b.s + b.v * dt;
      b.s = tope === Infinity ? nueva : Math.min(nueva, tope);
    });

    est.cajas = est.cajas.filter((b) => b.s - C.cajaL < C.largo + 400);

    est.tGen += dt;
    const cola = est.cajas[est.cajas.length - 1];
    const espacio = !cola || cola.s - C.cajaL > C.holgura;
    if (est.tGen > C.cadencia && espacio && est.cajas.length < C.maxCajas) {
      est.tGen = 0;
      // entra con el cuerpo completo sobre el tramo, como si viniera del
      // equipo de aguas arriba
      est.cajas.push({ id: est.id++, s: C.cajaL, v: C.v });
    }
  }

  function siembra() {
    est.cajas = [];
    est.tGen = 0;
    // repartidas sobre el tramo, para que se vea la línea poblada al abrir
    const paso = (C.largo - C.cajaL * 1.5) / 3;
    for (let i = 0; i < 3; i++) {
      est.cajas.push({ id: est.id++, s: C.cajaL + i * paso, v: C.v });
    }
  }
  siembra();

  return {
    cfg: C,
    zonas,
    estado: est,
    paso,
    reset: siembra,
    modo(m) { est.modo = m; },
    salida(libre) { est.salidaLibre = libre; },
  };
}

export default { creaZPA, PRESETS };
