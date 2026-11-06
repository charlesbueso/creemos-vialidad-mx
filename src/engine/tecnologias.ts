/**
 * Catálogo de tecnologías. Los valores son de orden de magnitud para soñar con
 * números, NO son cifras de ingeniería de detalle. Cada preset cita su
 * referencia real para que cualquiera pueda cuestionarlo y afinarlo.
 */

export type TecnologiaId = 'monorriel' | 'metro-elevado' | 'metro-ligero' | 'tren-regional' | 'cablebus';

export interface Tecnologia {
  id: TecnologiaId;
  nombre: string;
  resumen: string;
  referencia: string;
  /** Velocidad máxima de operación (km/h) */
  vMaxKmh: number;
  /** Aceleración de arranque (m/s²) */
  aceleracion: number;
  /** Desaceleración de servicio (m/s²) */
  frenado: number;
  /** Aceleración lateral máxima aceptable en curva, incluyendo peralte (m/s²) */
  aLateral: number;
  /** Pendiente máxima sostenida (fracción: 0.06 = 6 %) */
  pendienteMax: number;
  /** Radio mínimo de curva en vía principal (m) */
  radioMin: number;
  /** Tiempo de permanencia en estación (s) */
  permanenciaS: number;
  /** Altura mínima de la vía sobre el suelo para librar calles (m) */
  alturaMinViaM: number;
  /** Separación típica entre pilas (m) */
  claroM: number;
  /** Separación entre ejes de vía (m); 0 = vía única centrada */
  entreEjesM: number;
  /** Sección de la viga/tablero por vía o total (m) */
  tablero: { tipo: 'vigas' | 'cajon' | 'cable'; anchoM: number; peralteM: number };
  /** Longitud de estación/andén (m) */
  andenM: number;
  /** Tren o cabina para el 3D */
  tren: { carros: number; largoCarroM: number; anchoM: number; altoM: number; baseSobreViaM: number };
  /** Capacidad (pasajeros por hora por sentido) */
  capacidadPphpd: [number, number];
  /** Costo de obra civil + sistemas, millones de USD por km */
  costoMusdKm: { elevado: [number, number]; tunel: [number, number]; superficie: [number, number] };
  /** Costo por estación, millones de USD */
  costoEstacionMusd: { elevada: [number, number]; subterranea: [number, number] };
  /** Teleférico: las cabinas no frenan en ruta, sólo pierden tiempo al cruzar estaciones */
  esCable?: boolean;
}

export const TECNOLOGIAS: Record<TecnologiaId, Tecnologia> = {
  monorriel: {
    id: 'monorriel',
    nombre: 'Monorriel elevado',
    resumen:
      'Tren de llantas que monta una viga de concreto. Sube pendientes fuertes y da curvas cerradas: ideal para lomas y barrancas.',
    referencia: 'Chongqing Líneas 2 y 3 (China); Monterrey Líneas 4 y 6 (en construcción).',
    vMaxKmh: 80,
    aceleracion: 1.0,
    frenado: 1.0,
    aLateral: 1.1,
    pendienteMax: 0.06,
    radioMin: 100,
    permanenciaS: 30,
    alturaMinViaM: 9,
    claroM: 24,
    entreEjesM: 3.7,
    tablero: { tipo: 'vigas', anchoM: 0.85, peralteM: 1.5 },
    andenM: 100,
    tren: { carros: 6, largoCarroM: 15, anchoM: 2.9, altoM: 3.4, baseSobreViaM: -0.9 },
    capacidadPphpd: [15000, 32000],
    costoMusdKm: { elevado: [45, 95], tunel: [150, 300], superficie: [35, 60] },
    costoEstacionMusd: { elevada: [12, 30], subterranea: [60, 140] },
  },
  'metro-elevado': {
    id: 'metro-elevado',
    nombre: 'Metro elevado (rueda férrea)',
    resumen:
      'Metro convencional sobre viaducto de cajón. Máxima capacidad, pero pide curvas amplias y pendientes suaves.',
    referencia: 'Tramo elevado de la Línea 12 y Línea B (CDMX); Metro de Santo Domingo; Línea 1 de Lima.',
    vMaxKmh: 90,
    aceleracion: 1.1,
    frenado: 1.1,
    aLateral: 1.0,
    pendienteMax: 0.04,
    radioMin: 250,
    permanenciaS: 30,
    alturaMinViaM: 10,
    claroM: 32,
    entreEjesM: 4.0,
    tablero: { tipo: 'cajon', anchoM: 9.6, peralteM: 2.2 },
    andenM: 150,
    tren: { carros: 7, largoCarroM: 19, anchoM: 2.9, altoM: 3.7, baseSobreViaM: 0.9 },
    capacidadPphpd: [35000, 60000],
    costoMusdKm: { elevado: [70, 160], tunel: [180, 400], superficie: [45, 90] },
    costoEstacionMusd: { elevada: [20, 45], subterranea: [80, 180] },
  },
  'metro-ligero': {
    id: 'metro-ligero',
    nombre: 'Metro ligero automático',
    resumen:
      'Trenes sin conductor, cortos y frecuentes (cada 90 s). Sube 6 % y cabe en avenidas medianas.',
    referencia: 'SkyTrain (Vancouver); REM (Montreal); Metro de Copenhague.',
    vMaxKmh: 90,
    aceleracion: 1.2,
    frenado: 1.2,
    aLateral: 1.1,
    pendienteMax: 0.06,
    radioMin: 120,
    permanenciaS: 25,
    alturaMinViaM: 9,
    claroM: 30,
    entreEjesM: 3.8,
    tablero: { tipo: 'cajon', anchoM: 8.2, peralteM: 2.0 },
    andenM: 90,
    tren: { carros: 4, largoCarroM: 17, anchoM: 2.65, altoM: 3.4, baseSobreViaM: 0.8 },
    capacidadPphpd: [20000, 35000],
    costoMusdKm: { elevado: [60, 130], tunel: [160, 350], superficie: [40, 80] },
    costoEstacionMusd: { elevada: [15, 35], subterranea: [70, 160] },
  },
  'tren-regional': {
    id: 'tren-regional',
    nombre: 'Tren regional rápido',
    resumen:
      'Para unir el Edomex con la ciudad: estaciones cada 5–10 km y 120 km/h, pero necesita curvas muy amplias.',
    referencia: 'Tren Interurbano México–Toluca "El Insurgente"; Tren Suburbano.',
    vMaxKmh: 130,
    aceleracion: 0.9,
    frenado: 0.9,
    aLateral: 0.9,
    pendienteMax: 0.035,
    radioMin: 450,
    permanenciaS: 45,
    alturaMinViaM: 10,
    claroM: 40,
    entreEjesM: 4.5,
    tablero: { tipo: 'cajon', anchoM: 11, peralteM: 2.6 },
    andenM: 200,
    tren: { carros: 5, largoCarroM: 25, anchoM: 3.0, altoM: 4.0, baseSobreViaM: 1.0 },
    capacidadPphpd: [20000, 40000],
    costoMusdKm: { elevado: [80, 170], tunel: [200, 420], superficie: [30, 70] },
    costoEstacionMusd: { elevada: [25, 60], subterranea: [90, 200] },
  },
  cablebus: {
    id: 'cablebus',
    nombre: 'Cablebús (teleférico)',
    resumen:
      'Cabinas colgadas de cable. Ignora barrancas y pendientes, es barato y rápido de construir, pero va a ~22 km/h.',
    referencia: 'Cablebús Líneas 1–3 (CDMX); Mexicable (Ecatepec); Metrocable (Medellín).',
    vMaxKmh: 21.6,
    aceleracion: 0.5,
    frenado: 0.5,
    aLateral: 10,
    pendienteMax: 1.0,
    radioMin: 0,
    permanenciaS: 60,
    alturaMinViaM: 25,
    claroM: 320,
    entreEjesM: 7,
    tablero: { tipo: 'cable', anchoM: 0.06, peralteM: 0.06 },
    andenM: 60,
    tren: { carros: 1, largoCarroM: 2.4, anchoM: 2.2, altoM: 2.6, baseSobreViaM: -3.4 },
    capacidadPphpd: [3000, 4500],
    costoMusdKm: { elevado: [12, 25], tunel: [12, 25], superficie: [12, 25] },
    costoEstacionMusd: { elevada: [6, 15], subterranea: [6, 15] },
    esCable: true,
  },
};

export const LISTA_TECNOLOGIAS = Object.values(TECNOLOGIAS);

/** Radio con el que una curva ya no obliga a bajar de la velocidad máxima. */
export function radioSinRestriccion(t: Tecnologia): number {
  const v = t.vMaxKmh / 3.6;
  return (v * v) / t.aLateral;
}
