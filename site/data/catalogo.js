/* ==========================================================================
   catalogo.js — catálogo de equipos del sitio. Única fuente de verdad para la
   grilla de productos, las fichas y el selector del configurador.

   Cada equipo declara cómo se representa. Hay dos representaciones y no son
   intercambiables:

     glb    → ENSAMBLE CAD REAL (levantamiento CADENAS PARTsolutions AP203):
              estructura, rodillos, motores, brackets, guardas y cableado.
              Es lo que se muestra al cliente. Se abre en el visor 3D.
     engine → MODELO PARAMÉTRICO del motor (simulator/src/engine): geometría
              esquemática que se reconstruye con cada parámetro y de la que se
              cuenta el despiece. Es lo que se configura en línea.

   Un equipo puede tener las dos: el GLB para mostrar cómo es de verdad, y el
   modelo paramétrico para dimensionarlo.
   ========================================================================== */

export const FAMILIAS = [
  { id: 'banda',   nombre: 'Banda' },
  { id: 'modular', nombre: 'Banda modular' },
  { id: 'rodillo', nombre: 'Rodillos 24 V' },
  { id: 'curva',   nombre: 'Curvas y desvíos' },
  { id: 'proceso', nombre: 'Estaciones de proceso' },
  { id: 'estruct', nombre: 'Estructuras' },
];

export const EQUIPOS = [
  /* ---------- equipos con ensamble CAD real ---------------------------- */
  {
    slug: 'banda-plana',
    codigo: 'MC400-Pro',
    nombre: 'Transportador de banda plana',
    familia: 'banda',
    img: 'prod-banda-plana.png',
    glb: 'mc400-banda-plana.glb',
    material3d: 'acero',
    vista3d: { yaw: 26, pitch: 17, fit: 0.92 },
    engine: null,
    resumen: 'Banda plana continua sobre bastidor de perfil de aluminio, con motorreductor lateral y patas regulables. El caballo de batalla del transporte de cajas y bandejas.',
    descripcion: 'La serie MC400-Pro es el transportador de banda plana de la línea: banda continua sobre cama deslizante, bastidor de perfil de aluminio anodizado, motorreductor lateral y patas regulables con pie nivelante. Se fabrica hasta 6 metros por tramo y se acopla en línea con curvas, espuelas y desvíos. El modelo 3D que puedes girar en esta página es el ensamble CAD real, no una representación.',
    specs: [
      ['Largo por tramo', 'hasta 6.000 mm'],
      ['Ancho de banda', '200 – 800 mm'],
      ['Altura de trabajo', '500 – 1.100 mm regulable'],
      ['Bastidor', 'Perfil de aluminio anodizado'],
      ['Accionamiento', 'Motorreductor lateral izq./der.'],
      ['Banda', 'PVC / PU, lisa o con grip'],
    ],
    chips: ['L hasta 6000', 'Banda continua', '3D real'],
    usos: ['Transporte de cajas', 'Enlace entre salas', 'Alimentación de estaciones'],
  },
  {
    slug: 'mdr-24v',
    codigo: 'ZP2026-MDR',
    nombre: 'Rodillos motorizados 24 V',
    familia: 'rodillo',
    img: 'prod-mdr-24v.png',
    glb: 'zp2026-mdr.glb',
    vista3d: { yaw: 34, pitch: 22, fit: 0.95 },
    engine: null,
    resumen: 'Rodillo vivo accionado por motor de 24 VDC dentro del rodillo. Sin cadenas, sin correas expuestas, con arranque y parada por zona.',
    descripcion: 'Transportador de rodillos motorizados de 24 VDC: el motor va dentro del rodillo y arrastra a los rodillos vecinos por correas internas. No hay cadenas ni transmisiones expuestas, el consumo cae drásticamente frente a un accionamiento central y cada zona parte y para sola. El ensamble incluye estructura, patas regulables, brackets, guardas laterales, escalerilla portacables y fuente de poder.',
    specs: [
      ['Largo por tramo', '1.500 – 3.000 mm'],
      ['Ancho entre guardas', 'hasta 838 mm'],
      ['Altura', '615 mm de bastidor + patas'],
      ['Rodillo', 'Ø 50 mm motorizado 24 VDC'],
      ['Velocidad', '8 – 50 m/min'],
      ['Control', 'Tarjeta por zona, 24 VDC'],
    ],
    chips: ['24 VDC', 'Motor en rodillo', '3D real'],
    usos: ['Transporte de cajas', 'Enlace entre zonas', 'Líneas de despacho'],
  },
  {
    slug: 'acumulacion-24v',
    codigo: 'ZP2026',
    nombre: 'Acumulación de cero presión 24 V',
    familia: 'rodillo',
    img: 'prod-acumulacion-24v.png',
    glb: 'zp2026-acumulacion.glb',
    vista3d: { yaw: 34, pitch: 22, fit: 0.95 },
    engine: null,
    resumen: 'El mismo bastidor de rodillo vivo, con control por zonas: cada caja se detiene sin empujar a la de adelante. Cero presión de verdad.',
    descripcion: 'Versión de acumulación del ZP2026. Cada zona tiene su sensor y su tarjeta: cuando la zona siguiente está ocupada, la zona detiene su caja sin que toque a la de adelante. Eso elimina el daño por presión, el atasco por empuje y el ruido de la línea. Es la solución estándar antes de un paletizado, una encajadora o cualquier punto donde el flujo se corta y hay que absorberlo.',
    specs: [
      ['Largo por tramo', '1.500 – 3.000 mm'],
      ['Zona de acumulación', '450 – 900 mm'],
      ['Ancho entre guardas', 'hasta 838 mm'],
      ['Rodillo', 'Ø 50 mm motorizado 24 VDC'],
      ['Acumulación', 'Cero presión por zona'],
      ['Control', 'Sensor + tarjeta por zona'],
    ],
    chips: ['Cero presión', 'Por zonas', '3D real'],
    usos: ['Buffer antes de paletizado', 'Absorber cambios de pallet', 'Zonas de espera'],
  },
  {
    slug: 'transferencia',
    codigo: 'CV-TR90',
    nombre: 'Transferencia y clasificación',
    familia: 'curva',
    img: 'prod-transferencia.png',
    glb: 'sorter-transferencia.glb',
    vista3d: { yaw: 42, pitch: 27, fit: 1.0 },
    engine: null,
    resumen: 'Módulo de transferencia a 90° montado en el hueco del equipo base, para sacar o meter producto sin romper el flujo de la troncal.',
    descripcion: 'Conjunto de clasificación con la transferencia de rodillos a 90° montada en el hueco real del equipo base. El módulo sube, gira el producto al plano transversal y lo entrega a la línea lateral. La ventana de admisión se calcula con el simulador de flujo, para que la caja entre sin choque ni tranque aun con la troncal cargada.',
    specs: [
      ['Ángulo de salida', '90°'],
      ['Rodillos de transferencia', 'Ø 63 mm'],
      ['Plano de banda', '52,3 mm sobre el base'],
      ['Modo', 'Extracción o incorporación'],
      ['Detección', 'Fotocélula por zona'],
      ['Control', '24 VDC / PLC'],
    ],
    chips: ['90°', 'Rodillos Ø63', '3D real'],
    usos: ['Clasificación por calidad', 'Reparto a varias líneas', 'Salida a repaso'],
  },

  /* ---------- equipos con modelo paramétrico configurable en línea ------ */
  {
    slug: 'mt800',
    codigo: 'MT800-Pro',
    nombre: 'Banda estrecha de perfil bajo',
    familia: 'banda',
    img: 'prod-mt800.png',
    glb: null,
    engine: 'mt800_pro',
    resumen: 'Bandas redondas paralelas sobre poleas independientes. Perfil bajo para transferir bandejas y punnets sin escalón entre equipos.',
    descripcion: 'La serie MT800-Pro resuelve el transporte de producto liviano donde la transferencia entre equipos debe ser directa y sin escalones. Las bandas redondas montadas sobre poleas independientes permiten un plano de transporte de baja altura, fácil de limpiar y mantener. Se configura en línea: al mover el largo o el ancho se recalculan bandas, poleas, travesaños y tornillería, y el despiece se cuenta sobre el modelo.',
    specs: [
      ['Largo (L)', '400 – 6.000 mm'],
      ['Ancho (W)', '80 – 1.500 mm'],
      ['Ancho de banda', '15 – 80 mm'],
      ['Altura de patas', '300 – 1.200 mm'],
      ['Accionamiento', 'Motorreductor lateral izq./der.'],
      ['Estructura', 'Perfil de aluminio anodizado'],
    ],
    chips: ['L 400–6000', 'W 80–1500', 'Configurable'],
    usos: ['Bandejas y punnets', 'Transferencia entre líneas', 'Salas de packing'],
  },
  {
    slug: 'mb400',
    codigo: 'MB400',
    nombre: 'Transportador de banda modular',
    familia: 'modular',
    img: 'prod-mb400.png',
    glb: null,
    engine: 'mb400',
    resumen: 'Banda modular plástica arrastrada por piñones, con tiras de desgaste y guías laterales. Robusto, lavable y apto para carga acumulada.',
    descripcion: 'La serie MB400 usa banda modular plástica accionada por piñones sobre eje, apoyada en tiras de desgaste. Es la opción cuando se necesita superficie continua, resistencia al lavado y capacidad de acumulación sin dañar el producto. Se configura en línea y se entrega con guías laterales regulables, placas de extremo y estructura con patas o versión baja para montaje sobre bancada.',
    specs: [
      ['Largo (L)', '600 – 8.000 mm'],
      ['Ancho útil (W)', '200 – 1.200 mm'],
      ['Paso de módulo', '25 – 100 mm'],
      ['Piñones', 'Ø 60 – 200 mm'],
      ['Accionamiento', 'Motorreductor extremo izq./der.'],
      ['Higiene', 'Apto lavado, banda desmontable'],
    ],
    chips: ['L 600–8000', 'W 200–1200', 'Configurable'],
    usos: ['Fruta a granel', 'Zonas húmedas', 'Acumulación'],
  },
  {
    slug: 'mc400-curva',
    codigo: 'MC400-C',
    nombre: 'Curva de transferencia',
    familia: 'curva',
    img: 'prod-mc400.png',
    glb: null,
    engine: 'mc400',
    resumen: 'Curva de 30°, 45°, 60° o 90° con rodillos radiales, para cambiar de dirección sin perder la orientación del producto.',
    descripcion: 'La curva MC400-C resuelve el cambio de dirección dentro de la línea manteniendo el producto orientado. Los rodillos radiales se reparten por el ángulo con paso configurable y los bastidores interior y exterior siguen el arco. Se especifica por ángulo, radio interior y ancho útil, y se acopla directamente a los tramos rectos.',
    specs: [
      ['Ángulo', '30° · 45° · 60° · 90°'],
      ['Radio interior', '200 – 1.000 mm'],
      ['Ancho útil (W)', '150 – 600 mm'],
      ['Paso de rodillos', '40 – 160 mm'],
      ['Rodillo', 'Ø 25 – 80 mm'],
      ['Accionamiento', 'Motriz en entrada o salida'],
    ],
    chips: ['30–90°', 'R 200–1000', 'Configurable'],
    usos: ['Cambio de dirección', 'Retorno de bandejas', 'Enlace entre salas'],
  },

  /* ---------- equipos por ingeniería ------------------------------------ */
  {
    slug: 'gravedad',
    codigo: 'CV-GRV',
    nombre: 'Rodillos por gravedad',
    familia: 'rodillo',
    img: null, glb: null, engine: null,
    resumen: 'Tramos sin motorización con pendiente calculada. Solución económica para descarga y zonas de picking.',
    descripcion: 'Transportador de rodillos libres montado con pendiente. Sin consumo eléctrico y con mantenimiento mínimo, resuelve descargas, mesas de acumulación por gravedad y zonas de picking. La pendiente se calcula según peso y base de la caja para lograr velocidad controlada.',
    specs: [
      ['Rodillo', 'Ø 50 mm · paso 75/100 mm'],
      ['Ancho útil', '300 – 1.000 mm'],
      ['Pendiente', '2 – 5 % según carga'],
      ['Estructura', 'Perfil de acero galvanizado'],
      ['Patas', 'Regulables 600 – 1.100 mm'],
      ['Accesorios', 'Guías, topes, curvas'],
    ],
    chips: ['Sin energía', 'Pendiente calculada', 'Económico'],
    usos: ['Descarga de camión', 'Picking', 'Mesas de acumulación'],
  },
  {
    slug: 'espuela',
    codigo: 'CV-SPU',
    nombre: 'Espuela de incorporación',
    familia: 'curva',
    img: null, glb: null, engine: null,
    resumen: 'Incorporación o extracción de producto en 30°/45°, con nodo de traspaso calculado para no romper el flujo.',
    descripcion: 'Módulo de incorporación o extracción lateral que une una línea secundaria con la troncal. El ángulo de entrada, el punto de registro y la ventana de admisión se calculan con el simulador de flujo para garantizar que la caja entre sin choque ni tranque, incluso con la troncal cargada.',
    specs: [
      ['Ángulo', '30° · 45° (otros a pedido)'],
      ['Modo', 'Incorporación o extracción'],
      ['Disparo', 'Automático o manual'],
      ['Admisión', 'Ventana calculada por simulación'],
      ['Detección', 'Fotocélula por zona'],
      ['Control', '24 VDC / PLC'],
    ],
    chips: ['30° / 45°', 'Nodo simulado', 'Auto o manual'],
    usos: ['Unir líneas de packing', 'Sacar producto a repaso', 'Alimentar encajadoras'],
  },
  {
    slug: 'omniwheel',
    codigo: 'CV-OMW',
    nombre: 'Desviador de ruedas omnidireccionales',
    familia: 'curva',
    img: null, glb: null, engine: null,
    resumen: 'Módulo en línea con grilla de ruedas omni que expulsa la caja a 90° o la desvía a 30° sin detener el flujo.',
    descripcion: 'Módulo insertado en línea con filas alternadas de ruedas de avance y ruedas transversales. En modo dinámico desvía la caja en movimiento a 30°; en modo detenido, la fotocélula final la retiene el tiempo justo y la expulsa a 90°. Cada fila lleva su motor de 60 W con transmisión por correa síncrona interior.',
    specs: [
      ['Módulo', '24" fijas en línea'],
      ['Modos', 'Dinámico 30° · detenido 90°'],
      ['Salidas', 'Izquierda y/o derecha'],
      ['Motorización', 'UniDrive 60 W por fila'],
      ['Detección', 'Fotocélula de fin de módulo'],
      ['Control', '24 VDC'],
    ],
    chips: ['30° / 90°', 'Sin detener línea', 'Doble salida'],
    usos: ['Clasificación por calidad', 'Reparto a varias líneas', 'Salida a repaso'],
  },
  {
    slug: 'tobogan',
    codigo: 'CV-CHT',
    nombre: 'Tobogán de descarga',
    familia: 'proceso',
    img: null, glb: null, engine: null,
    resumen: 'Bajada multinivel con curva de entrada, rack y tope, calculada para que la caja llegue frenada y sin girar.',
    descripcion: 'Tobogán de bajada entre niveles con geometría calculada: curva de entrada sin fricción, tramo recto con ángulo de deslizamiento, rack de frenado y tope final. El modelo físico verifica velocidad terminal, riesgo de acuñamiento y giro de la caja antes de fabricar, para que ninguna caja llegue volcada ni atascada.',
    specs: [
      ['Desnivel', 'Según proyecto'],
      ['Carriles', '1 – 4'],
      ['Frenado', 'Rack de fricción'],
      ['Cálculo', 'Velocidad terminal y acuñamiento'],
      ['Material', 'Acero inoxidable o galvanizado'],
      ['Tope', 'Final regulable'],
    ],
    chips: ['Multinivel', 'Frenado calculado', 'Multi-carril'],
    usos: ['Bajada entre pisos', 'Descarga a pallet', 'Alimentar encajadoras'],
  },
  {
    slug: 'estaciones',
    codigo: 'CV-OP',
    nombre: 'Estaciones de trabajo',
    familia: 'proceso',
    img: null, glb: null, engine: null,
    resumen: 'Puestos de operaria dimensionados por cadencia real: alcance, altura, iluminación y acumulación previa.',
    descripcion: 'Puestos de trabajo integrados a la línea, dimensionados con la cadencia real de la operaria (tiempo base, variabilidad y curva de fatiga) obtenida del simulador. Incluye altura y alcance ergonómicos, acumulación previa suficiente para absorber la variabilidad y evacuación que no genere cuello de botella.',
    specs: [
      ['Altura de trabajo', '850 – 1.000 mm regulable'],
      ['Alcance', 'Máx. 600 mm'],
      ['Acumulación previa', 'Dimensionada por simulación'],
      ['Iluminación', 'LED 500 – 750 lux'],
      ['Superficie', 'Inoxidable AISI 304'],
      ['Accesorios', 'Repisas, canaletas, tolvas'],
    ],
    chips: ['Ergonómico', 'Cadencia simulada', 'Inoxidable'],
    usos: ['Selección y repaso', 'Encajado manual', 'Control de calidad'],
  },
  {
    slug: 'pasarelas',
    codigo: 'CV-PAS',
    nombre: 'Pasarelas y estructuras',
    familia: 'estruct',
    img: null, glb: null, engine: null,
    resumen: 'Pasarelas de tránsito sobre línea, con pasamanos, escaleras y placa antideslizante, cubicadas al perno.',
    descripcion: 'Pasarelas de tránsito sobre la línea con marco y patas de perfil estructural, viguetas calculadas por luz, placa diamantada remachada y pasamanos tubular con vano automático en el acceso de escalera. Se entrega con la cubicación completa y los part numbers de cada perfil.',
    specs: [
      ['Luz entre apoyos', '≤ 500 mm entre viguetas'],
      ['Marco / patas', 'Perfil 120 × 40 mm'],
      ['Viguetas', 'Perfil 80 × 40 mm'],
      ['Piso', 'Placa diamantada 4 mm'],
      ['Pasamanos', 'Tubo Ø 40 mm'],
      ['Escaleras', 'Sube / baja con vano en baranda'],
    ],
    chips: ['Placa 4 mm', 'Pasamanos Ø40', 'Cubicado'],
    usos: ['Cruce sobre línea', 'Acceso a entrepiso', 'Mantención'],
  },
  {
    slug: 'paletizado',
    codigo: 'CV-PLT',
    nombre: 'Zona de paletizado',
    familia: 'proceso',
    img: null, glb: null, engine: null,
    resumen: 'Salida a pallet con patrón de apilado, cambio de pallet y acumulación aguas arriba.',
    descripcion: 'Estación final de línea donde la caja máster se deposita sobre el pallet siguiendo un patrón de apilado definido. Incluye la acumulación aguas arriba necesaria para absorber el cambio de pallet sin detener la producción y la señalización de pallet completo.',
    specs: [
      ['Pallet', 'Chileno / Euro / Americano'],
      ['Patrón', 'Definido por caja y mosaico'],
      ['Altura de carga', 'Hasta 2.000 mm'],
      ['Cambio de pallet', 'Manual o asistido'],
      ['Acumulación', 'Dimensionada por simulación'],
      ['Señalización', 'Baliza de pallet completo'],
    ],
    chips: ['Patrón de apilado', 'Cambio de pallet', 'Con buffer'],
    usos: ['Fin de línea', 'Salida a cámara', 'Despacho'],
  },
];

export const CONFIGURABLES = EQUIPOS.filter((e) => e.engine);
export const CON_3D = EQUIPOS.filter((e) => e.glb);
/** Los tres que abren la portada: ensambles reales, no esquemas. */
export const DESTACADOS = ['banda-plana', 'acumulacion-24v', 'mdr-24v']
  .map((s) => EQUIPOS.find((e) => e.slug === s));

export function equipoPorSlug(slug) {
  return EQUIPOS.find((e) => e.slug === slug) || null;
}
export function equipoPorEngine(id) {
  return EQUIPOS.find((e) => e.engine === id) || null;
}

export default { FAMILIAS, EQUIPOS, CONFIGURABLES, CON_3D, DESTACADOS, equipoPorSlug, equipoPorEngine };
