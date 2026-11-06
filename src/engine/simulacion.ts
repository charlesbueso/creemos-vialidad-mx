/**
 * Simulación de marcha: perfil de velocidad con límites por curva, arranques
 * (con potencia constante arriba de media velocidad), frenado, efecto de la
 * pendiente y permanencia en estaciones. Es el método clásico de "ida y vuelta"
 * (aceleración hacia adelante, frenado hacia atrás).
 */
import type { Tecnologia } from './tecnologias';

const G = 9.81;

export interface EntradaMarcha {
  tec: Tecnologia;
  vMaxKmh: number;
  s: Float64Array;
  radio: Float64Array;
  pendiente: Float32Array;
  /** Cadenamientos donde el tren se detiene (incluye terminales) */
  paradas: number[];
}

export interface Marcha {
  /** Velocidad (m/s) en cada muestra */
  v: Float32Array;
  /** Límite de velocidad (m/s) en cada muestra (vía + curvas) */
  vLimite: Float32Array;
  /** Tiempo acumulado (s) al pasar por cada muestra (sin contar permanencia en esa muestra) */
  t: Float64Array;
  /** Curva tiempo → cadenamiento, con mesetas en estaciones (para animar) */
  tiempoS: { t: number; s: number }[];
  tiempoTotal: number;
  vPromedioKmh: number;
  vMaxAlcanzadaKmh: number;
}

export function simularMarcha(e: EntradaMarcha): Marcha {
  const { tec, s, radio, pendiente } = e;
  const n = s.length;
  const vMax = e.vMaxKmh / 3.6;
  const vLimite = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const vc = Number.isFinite(radio[i]) ? Math.sqrt(tec.aLateral * radio[i]) : Infinity;
    vLimite[i] = Math.min(vMax, vc);
  }

  // Índices de parada: se funden las que caen a menos de 30 m entre sí o de una terminal
  const crudos = e.paradas.map((p) => indiceCercano(s, p)).sort((a, b) => a - b);
  const idxParada: number[] = [0];
  for (const i of crudos) {
    if (s[i] - s[idxParada[idxParada.length - 1]] < 30) continue;
    if (s[n - 1] - s[i] < 30) continue;
    idxParada.push(i);
  }
  idxParada.push(n - 1);
  const esParada = new Uint8Array(n);
  for (const i of idxParada) esParada[i] = 1;

  const v = new Float32Array(n);
  if (tec.esCable) {
    // Velocidad de línea constante; las cabinas se desacoplan en estaciones
    for (let i = 0; i < n; i++) v[i] = vMax;
  } else {
    const vBase = vMax * 0.5;
    // Pasada hacia adelante: aceleración
    v[0] = 0;
    for (let i = 1; i < n; i++) {
      if (esParada[i - 1]) v[i - 1] = 0;
      const vp = v[i - 1];
      const traccion = vp <= vBase ? tec.aceleracion : (tec.aceleracion * vBase) / Math.max(vp, 0.1);
      const a = Math.max(0.05, traccion - G * pendiente[i] - 0.02);
      const dsi = s[i] - s[i - 1];
      v[i] = Math.min(vLimite[i], Math.sqrt(vp * vp + 2 * a * dsi));
    }
    for (const i of idxParada) v[i] = 0;
    v[n - 1] = 0;
    // Pasada hacia atrás: frenado
    for (let i = n - 2; i >= 0; i--) {
      if (esParada[i]) {
        v[i] = 0;
        continue;
      }
      const b = Math.max(0.3, tec.frenado + G * pendiente[i]);
      const dsi = s[i + 1] - s[i];
      v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * b * dsi));
    }
  }

  // Integración de tiempo
  const t = new Float64Array(n);
  const tiempoS: { t: number; s: number }[] = [{ t: 0, s: 0 }];
  let reloj = 0;
  for (let i = 1; i < n; i++) {
    const dsi = s[i] - s[i - 1];
    const vm = Math.max(0.3, (v[i] + v[i - 1]) / 2);
    reloj += dsi / vm;
    t[i] = reloj;
    tiempoS.push({ t: reloj, s: s[i] });
    if (esParada[i] && i !== n - 1) {
      reloj += tec.permanenciaS;
      tiempoS.push({ t: reloj, s: s[i] });
    }
  }
  let vMaxAlc = 0;
  for (let i = 0; i < n; i++) vMaxAlc = Math.max(vMaxAlc, v[i]);
  const L = s[n - 1];
  return {
    v,
    vLimite,
    t,
    tiempoS,
    tiempoTotal: reloj,
    vPromedioKmh: reloj > 0 ? (L / reloj) * 3.6 : 0,
    vMaxAlcanzadaKmh: vMaxAlc * 3.6,
  };
}

/** Índice de la muestra más cercana a un cadenamiento (la última muestra puede estar más cerca que ds). */
export function indiceCercano(s: Float64Array, valor: number): number {
  const n = s.length;
  if (n < 2) return 0;
  const ds = s[1] - s[0];
  let i = Math.min(n - 1, Math.max(0, Math.round(valor / ds)));
  if (i < n - 1 && Math.abs(s[i + 1] - valor) < Math.abs(s[i] - valor)) i++;
  return i;
}

/** Cadenamiento del tren en el tiempo t (búsqueda binaria sobre la curva tiempo→s). */
export function posicionEnTiempo(m: Marcha, t: number): number {
  const c = m.tiempoS;
  if (t <= 0) return 0;
  if (t >= c[c.length - 1].t) return c[c.length - 1].s;
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = c[lo];
  const b = c[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return a.s + (b.s - a.s) * f;
}

export function velocidadEn(m: Marcha, sArr: Float64Array, sq: number): number {
  const n = sArr.length;
  if (n < 2) return 0;
  const ds = sArr[1] - sArr[0];
  const i = Math.min(n - 2, Math.max(0, Math.floor(sq / ds)));
  const f = Math.min(1, Math.max(0, (sq - sArr[i]) / (sArr[i + 1] - sArr[i] || 1)));
  return m.v[i] + (m.v[i + 1] - m.v[i]) * f;
}
