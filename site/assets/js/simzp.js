/* ==========================================================================
   simzp.js — simulador de la lógica de acumulación de cero presión (ZPA).

   Reproduce el control real de un transportador de rodillo motorizado 24 VDC:
   la línea se divide en ZONAS, cada zona tiene su fotocélula, su tarjeta y su
   motor. La tarjeta decide arrancar o parar su zona mirando solo el estado de
   la zona siguiente — no hay un PLC central diciéndole a cada caja qué hacer.

   Modos implementados (los tres del control estándar del rubro):

     cero      Cero presión. Cada zona detiene su caja en su punto de parada
               cuando la zona siguiente está ocupada. Las cajas nunca se tocan.
     singulado Al liberar la salida, se entrega DE A UNA: una zona solo arranca
               cuando la siguiente quedó completamente libre. Es lo que pide un
               lector, una pesadora o un desviador.
     tren      Al liberar la salida, TODAS las zonas arrancan a la vez y el
               grupo sale como un bloque. Evacúa el pulmón en el menor tiempo.

   El dibujo es una elevación lateral: rodillos, cajas, fotocélulas y el estado
   de cada zona. No pretende ser el motor de simulación de planta (ese vive en
   el simulador), sino mostrar la lógica con exactitud.
   ========================================================================== */

const MM = 1;                 // el modelo trabaja en milímetros
const ZONA = 900;             // largo de zona (mm) — rango real 450–900
const N_ZONAS = 5;
const LARGO = ZONA * N_ZONAS;
const CAJA_L = 400;           // largo de caja (mm)
const CAJA_H = 300;           // alto de caja (mm)
const HOLGURA = 130;          // separación mínima entre cajas (mm) — cero presión
const V = 0.55;               // velocidad de línea (mm/ms) ≈ 33 m/min
const ACEL = 0.0035;          // rampa de arranque y frenado (mm/ms²)
const ROD_D = 50;             // diámetro de rodillo (mm)
const ROD_PASO = 100;         // paso entre rodillos (mm)

export function montaSimZP(host, opts = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'simzp-cv';
  host.appendChild(cv);
  const ctx = cv.getContext('2d');

  const marca = new Image();
  marca.src = opts.logo || 'assets/img/mark.png';

  const est = {
    modo: 'cero',
    salidaLibre: true,     // false = el proceso de aguas abajo está detenido
    corriendo: true,
    cajas: [],
    siguienteId: 1,
    tGen: 0,
    liberando: -1,         // zona autorizada a entregar en modo singulado
  };

  /* --- geometría de zonas ------------------------------------------------
     La caja se detiene con su FRENTE en el punto de parada de la zona, que
     está al final de la zona. Así la zona queda ocupada y su fotocélula
     (justo antes del punto de parada) queda tapada. */
  const zonas = Array.from({ length: N_ZONAS }, (_, i) => ({
    i,
    ini: i * ZONA,
    fin: (i + 1) * ZONA,
    parada: (i + 1) * ZONA - 40,      // frente de la caja detenida
    ojo: (i + 1) * ZONA - 40 - CAJA_L / 2,
    motor: true,
    ocupada: false,
  }));

  const zonaDe = (frente) => {
    const i = Math.floor((frente - CAJA_L / 2) / ZONA);
    return Math.max(0, Math.min(N_ZONAS - 1, i));
  };

  /* --- lógica de control -------------------------------------------------
     Cada tarjeta decide sola. Este es el corazón del ZPA. */
  function decideMotores() {
    // 1) estado de ocupación: la fotocélula de la zona está tapada
    zonas.forEach((z) => {
      z.ocupada = est.cajas.some((b) => {
        const cola = b.s - CAJA_L;
        return cola <= z.ojo && b.s >= z.ojo;
      });
    });

    // 2) cada zona mira SOLO a la siguiente
    for (let i = N_ZONAS - 1; i >= 0; i--) {
      const z = zonas[i];
      const sig = zonas[i + 1];

      if (i === N_ZONAS - 1) {
        // la última zona entrega al proceso de aguas abajo
        z.motor = est.salidaLibre;
        continue;
      }

      if (est.modo === 'tren') {
        // liberación en lote: si la salida está libre, arrancan todas a la vez
        z.motor = est.salidaLibre;
      } else if (est.modo === 'singulado') {
        // se entrega de a una: la zona arranca cuando la siguiente quedó libre
        // Y ya se autorizó su turno
        z.motor = !sig.ocupada && sig.motor;
      } else {
        // cero presión: arranca si la siguiente está libre
        z.motor = !sig.ocupada;
      }
    }

    // en modo singulado, solo una zona entrega por vez hacia adelante
    if (est.modo === 'singulado' && est.salidaLibre) {
      let vistaOcupada = false;
      for (let i = N_ZONAS - 1; i >= 0; i--) {
        if (vistaOcupada) zonas[i].motor = false;
        if (zonas[i].ocupada) vistaOcupada = true;
      }
    }
  }

  /* --- avance ------------------------------------------------------------ */
  function paso(dt) {
    decideMotores();

    // ordenar de adelante hacia atrás para respetar la caja de adelante
    est.cajas.sort((a, b) => b.s - a.s);

    est.cajas.forEach((b, idx) => {
      const z = zonas[zonaDe(b.s)];
      const adelante = est.cajas[idx - 1];

      // tope 1: el punto de parada de su zona, si el motor está detenido
      let tope = Infinity;
      if (!z.motor) tope = Math.min(tope, z.parada);
      // tope 2: cero presión — nunca más cerca que la holgura
      if (adelante) tope = Math.min(tope, adelante.s - CAJA_L - HOLGURA);

      const objetivo = b.s < tope ? V : 0;
      // rampa: el rodillo no arranca ni frena de golpe
      if (b.v < objetivo) b.v = Math.min(objetivo, b.v + ACEL * dt);
      else if (b.v > objetivo) b.v = Math.max(objetivo, b.v - ACEL * dt);

      b.s = Math.min(b.s + b.v * dt, tope === Infinity ? b.s + b.v * dt : tope);
      b.rod += b.v * dt;       // giro acumulado, para dibujar los rodillos
    });

    // la caja sale de la línea
    est.cajas = est.cajas.filter((b) => b.s - CAJA_L < LARGO + 200);

    // alimentación por la cola
    est.tGen += dt;
    const ultima = est.cajas[est.cajas.length - 1];
    const hayEspacio = !ultima || ultima.s - CAJA_L > CAJA_L + HOLGURA;
    if (est.tGen > 1400 && hayEspacio && est.cajas.length < 7) {
      est.tGen = 0;
      est.cajas.push({ id: est.siguienteId++, s: 0, v: V, rod: 0 });
    }
  }

  /* --- dibujo ------------------------------------------------------------ */
  let escala = 1;
  let piso = 0;

  function medidas() {
    const w = host.clientWidth;
    const h = Math.max(230, Math.min(320, w * 0.30));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    escala = w / (LARGO + 1100);
    piso = h - 62;
    return { w, h };
  }

  function dibuja() {
    const { w, h } = medidas();
    const X = (mm) => 120 * escala + mm * escala;

    ctx.clearRect(0, 0, w, h);

    // --- bastidor y rodillos
    const yRod = piso;
    ctx.strokeStyle = '#C6CFDC';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(-120), yRod + ROD_D * escala / 2);
    ctx.lineTo(X(LARGO + 120), yRod + ROD_D * escala / 2);
    ctx.stroke();

    for (let s = 0; s <= LARGO; s += ROD_PASO) {
      const zi = Math.min(N_ZONAS - 1, Math.floor(s / ZONA));
      const activo = zonas[zi].motor;
      const r = (ROD_D * escala) / 2;
      const cx = X(s);
      const cy = yRod;
      const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
      g.addColorStop(0, activo ? '#F3F6FA' : '#E3E8EF');
      g.addColorStop(1, activo ? '#9FAEC1' : '#B7C0CD');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2.5, r), 0, Math.PI * 2);
      ctx.fill();
      // marca de giro: avanza solo si la zona está en marcha
      ctx.strokeStyle = 'rgba(22,35,60,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const a = (est.rodGiro || 0) * (activo ? 1 : 0) + s * 0.01;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }

    // --- límites de zona, fotocélulas y estado
    zonas.forEach((z) => {
      const x0 = X(z.ini);
      const x1 = X(z.fin);
      ctx.strokeStyle = 'rgba(22,35,60,.10)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, yRod - 130 * escala);
      ctx.lineTo(x1, yRod + 26);
      ctx.stroke();
      ctx.setLineDash([]);

      // fotocélula
      const xo = X(z.ojo);
      const tapada = z.ocupada;
      ctx.strokeStyle = tapada ? 'rgba(247,169,40,.9)' : 'rgba(47,168,224,.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xo, yRod - 6);
      ctx.lineTo(xo, yRod - CAJA_H * escala - 14);
      ctx.stroke();
      ctx.fillStyle = tapada ? '#F7A928' : '#2FA8E0';
      ctx.beginPath();
      ctx.arc(xo, yRod - CAJA_H * escala - 16, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // etiqueta de zona + LED de motor
      const cx = (x0 + x1) / 2;
      ctx.fillStyle = z.motor ? '#14996B' : '#C4562F';
      ctx.beginPath();
      ctx.arc(cx - 26, piso + 34, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#59637A';
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Z${z.i + 1} ${z.motor ? 'MARCHA' : 'PARADA'}`, cx - 16, piso + 38);
    });

    // --- cajas
    est.cajas.forEach((b) => {
      const x = X(b.s - CAJA_L);
      const y = piso - CAJA_H * escala - ROD_D * escala / 2;
      const bw = CAJA_L * escala;
      const bh = CAJA_H * escala;
      dibujaCaja(x, y, bw, bh, b);
    });

    // --- salida
    const xf = X(LARGO + 60);
    ctx.fillStyle = est.salidaLibre ? 'rgba(20,153,107,.14)' : 'rgba(196,86,47,.16)';
    ctx.fillRect(xf, piso - CAJA_H * escala - 30, w - xf, CAJA_H * escala + 46);
    ctx.fillStyle = est.salidaLibre ? '#14996B' : '#C4562F';
    ctx.font = '500 9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(est.salidaLibre ? 'SALIDA LIBRE' : 'SALIDA BLOQUEADA', xf + 6, piso - CAJA_H * escala - 16);
  }

  function dibujaCaja(x, y, w, h, b) {
    const prof = Math.min(11, h * 0.2);

    // cara superior, con la profundidad hacia atrás (no invade la holgura)
    ctx.fillStyle = '#D9B589';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - prof, y - prof);
    ctx.lineTo(x + w - prof, y - prof);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();

    // canto trasero
    ctx.fillStyle = '#A9814F';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - prof, y - prof);
    ctx.lineTo(x - prof, y + h - prof);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    // cara frontal
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#E3C49B');
    g.addColorStop(1, '#C39C6C');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90,60,25,.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);

    // cinta de sellado
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.fillRect(x, y + h * 0.14, w, h * 0.07);

    // logotipo
    if (marca.complete && marca.naturalWidth) {
      const lw = Math.min(w * 0.34, h * 0.46);
      const lh = lw * (marca.naturalHeight / marca.naturalWidth);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(marca, x + w / 2 - lw / 2, y + h * 0.46 - lh / 2, lw, lh);
      ctx.globalAlpha = 1;
    }

    // sombra en el piso
    ctx.fillStyle = 'rgba(22,35,60,.10)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, piso + 12, w * 0.46, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- bucle -------------------------------------------------------------- */
  let ultimo = performance.now();
  let vivo = true;
  function bucle(t) {
    if (!vivo) return;
    requestAnimationFrame(bucle);
    const dt = Math.min(48, t - ultimo);
    ultimo = t;
    if (est.corriendo) {
      paso(dt);
      est.rodGiro = (est.rodGiro || 0) + dt * 0.012;
    }
    dibuja();
  }
  requestAnimationFrame(bucle);

  // arranque con la línea ya poblada, para que se vea el efecto de inmediato
  for (let i = 0; i < 3; i++) est.cajas.push({ id: est.siguienteId++, s: -i * (CAJA_L + HOLGURA + 200), v: V, rod: 0 });

  const api = {
    modo(m) { est.modo = m; },
    salida(libre) { est.salidaLibre = libre; },
    play(on) { est.corriendo = on; },
    reset() {
      est.cajas = [];
      est.tGen = 0;
      for (let i = 0; i < 3; i++) est.cajas.push({ id: est.siguienteId++, s: -i * (CAJA_L + HOLGURA + 200), v: V, rod: 0 });
    },
    estado: () => est,
    destruir() { vivo = false; host.innerHTML = ''; },
  };
  return api;
}

export default { montaSimZP };
