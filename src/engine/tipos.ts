import type { LngLat } from './geo';
import type { TecnologiaId } from './tecnologias';

/**
 * Formato de una propuesta. Es JSON plano a propósito: se puede editar en la
 * app, a mano, o pedírselo a Claude, y versionarse en git
 * (src/data/propuestas/*.json).
 */
export interface Propuesta {
  id: string;
  nombre: string;
  color: string;
  tecnologia: TecnologiaId;
  descripcion?: string;
  /** Puntos de control del eje, en orden. Las curvas se generan solas entre ellos. */
  trazo: LngLat[];
  /** Las estaciones se proyectan sobre el eje; la primera y la última deberían ser terminales. */
  estaciones: Estacion[];
  opciones?: OpcionesPropuesta;
  /** Tramos donde se impone el tipo de estructura (p. ej. subterráneo bajo Reforma). */
  restricciones?: Restriccion[];
  comparativa?: Comparativa;
  /** Cámara sugerida al abrir la propuesta (la "toma héroe"). */
  vista?: VistaCamara;
}

export interface VistaCamara {
  centro: LngLat;
  zoom: number;
  /** grados desde la vertical (0 = cenital) */
  inclinacion: number;
  /** grados desde el norte */
  rumbo: number;
}

export interface Estacion {
  id: string;
  nombre: string;
  lngLat: LngLat;
  /** El servicio exprés se detiene aquí. Las terminales siempre cuentan. */
  expres?: boolean;
  conexiones?: string[];
}

export interface OpcionesPropuesta {
  /** Permitir que el perfil vaya en túnel cuando sea más barato que un viaducto altísimo. Default: true */
  permitirTunel?: boolean;
  /** Sobrescribir el radio máximo de diseño (m). Por defecto: el radio que permite ir a velocidad máxima. */
  radioDisenoM?: number;
  /** Sobrescribir la velocidad máxima (km/h). */
  vMaxKmh?: number;
}

export type TipoEstructura = 'elevado' | 'tunel' | 'superficie';

export interface Restriccion {
  desdeKm: number;
  hastaKm: number;
  tipo: TipoEstructura;
  motivo?: string;
}

export interface Comparativa {
  /** Minutos en auto sin tráfico (p. ej. OSRM). */
  autoLibreMin?: number;
  /** Minutos en auto en hora pico (supuesto editable). */
  autoPicoMin?: number;
  /** Km por carretera. */
  autoKm?: number;
  fuente?: string;
}
