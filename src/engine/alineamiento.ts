/**
 * Alineamiento horizontal: convierte puntos de control en un eje ferroviario
 * real hecho de rectas y curvas circulares tangentes (como se diseña una vía),
 * usando en cada vértice el radio más amplio que cabe entre sus vecinos.
 */
import { centroid, makeFrame, toLngLat, toLocal, type LngLat, type LocalFrame } from './geo';

export interface Muestra {
  /** Cadenamiento (m desde el inicio) */
  s: number;
  x: number;
  y: number;
  lngLat: LngLat;
  /** Tangente unitaria en el plano local (este, norte) */
  tx: number;
  ty: number;
  /** Radio de curva en esta muestra; Infinity en recta */
  radio: number;
}

export interface CurvaInfo {
  vertice: number;
  radio: number;
  deflexionDeg: number;
  s0: number;
  s1: number;
  lngLat: LngLat;
}

export interface Alineamiento {
  frame: LocalFrame;
  longitud: number;
  ds: number;
  muestras: Muestra[];
  curvas: CurvaInfo[];
}

type Vec = [number, number];

interface Recta {
  tipo: 'recta';
  s0: number;
  largo: number;
  a: Vec;
  u: Vec;
}
interface Arco {
  tipo: 'arco';
  s0: number;
  largo: number;
  c: Vec;
  /** Vector del centro al punto inicial */
  r0: Vec;
  /** Tangente al inicio */
  u0: Vec;
  radio: number;
  /** +1 vuelta a la izquierda, -1 a la derecha */
  giro: 1 | -1;
}
type Elemento = Recta | Arco;

const rot = (v: Vec, ang: number): Vec => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

export function construirAlineamiento(trazo: LngLat[], radioDeseado: number, ds = 10): Alineamiento {
  const frame = makeFrame(trazo.length ? centroid(trazo) : [-99.17, 19.42]);
  // Puntos locales sin duplicados consecutivos
  const P: Vec[] = [];
  for (const p of trazo) {
    const q = toLocal(frame, p);
    const last = P[P.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1) P.push(q);
  }
  if (P.length < 2) {
    const m = P[0] ?? [0, 0];
    return {
      frame,
      longitud: 0,
      ds,
      curvas: [],
      muestras: [{ s: 0, x: m[0], y: m[1], lngLat: toLngLat(frame, m[0], m[1]), tx: 1, ty: 0, radio: Infinity }],
    };
  }

  const n = P.length;
  const L: number[] = [];
  const U: Vec[] = [];
  for (let j = 0; j < n - 1; j++) {
    const dx = P[j + 1][0] - P[j][0];
    const dy = P[j + 1][1] - P[j][1];
    const len = Math.hypot(dx, dy);
    L.push(len);
    U.push([dx / len, dy / len]);
  }

  // Deflexión y tangente deseada en cada vértice interior
  const theta = new Array<number>(n).fill(0);
  const giro = new Array<1 | -1>(n).fill(1);
  const T = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = U[i - 1];
    const b = U[i];
    const cross = a[0] * b[1] - a[1] * b[0];
    const dot = a[0] * b[0] + a[1] * b[1];
    const th = Math.atan2(Math.abs(cross), dot);
    if (th < 0.002) continue; // prácticamente recto
    theta[i] = th;
    giro[i] = cross >= 0 ? 1 : -1;
    T[i] = radioDeseado * Math.tan(th / 2);
  }
  // Ajustar tangentes para que quepan en cada tramo (cada curva puede usar hasta 49 % de cada recta vecina... o todo si la otra no lo usa)
  const k = new Array<number>(n - 1).fill(1);
  for (let j = 0; j < n - 1; j++) {
    const need = T[j] + T[j + 1];
    const avail = L[j] * 0.98;
    if (need > avail) k[j] = avail / need;
  }
  const Tf = T.map((t, i) => {
    if (i === 0 || i === n - 1) return 0;
    return t * Math.min(k[i - 1], k[i]);
  });

  // Construir elementos
  const elems: Elemento[] = [];
  const curvas: CurvaInfo[] = [];
  let s = 0;
  for (let j = 0; j < n - 1; j++) {
    const a: Vec = [P[j][0] + U[j][0] * Tf[j], P[j][1] + U[j][1] * Tf[j]];
    const largo = L[j] - Tf[j] - Tf[j + 1];
    if (largo > 1e-6) {
      elems.push({ tipo: 'recta', s0: s, largo, a, u: U[j] });
      s += largo;
    }
    const i = j + 1;
    if (i < n - 1 && Tf[i] > 1e-6) {
      const r = Tf[i] / Math.tan(theta[i] / 2);
      const u0 = U[i - 1];
      const A: Vec = [P[i][0] - u0[0] * Tf[i], P[i][1] - u0[1] * Tf[i]];
      const nrm: Vec = giro[i] === 1 ? [-u0[1], u0[0]] : [u0[1], -u0[0]];
      const c: Vec = [A[0] + nrm[0] * r, A[1] + nrm[1] * r];
      const largoArco = r * theta[i];
      elems.push({ tipo: 'arco', s0: s, largo: largoArco, c, r0: [A[0] - c[0], A[1] - c[1]], u0, radio: r, giro: giro[i] });
      curvas.push({
        vertice: i,
        radio: r,
        deflexionDeg: (theta[i] * 180) / Math.PI,
        s0: s,
        s1: s + largoArco,
        lngLat: toLngLat(frame, P[i][0], P[i][1]),
      });
      s += largoArco;
    }
  }
  const longitud = s;

  // Remuestreo uniforme
  const muestras: Muestra[] = [];
  let e = 0;
  const total = Math.max(1, Math.ceil(longitud / ds));
  for (let q = 0; q <= total; q++) {
    const sq = Math.min(longitud, q * ds);
    while (e < elems.length - 1 && sq > elems[e].s0 + elems[e].largo) e++;
    const el = elems[e];
    const d = Math.min(Math.max(sq - el.s0, 0), el.largo);
    let x: number, y: number, tx: number, ty: number, radio: number;
    if (el.tipo === 'recta') {
      x = el.a[0] + el.u[0] * d;
      y = el.a[1] + el.u[1] * d;
      tx = el.u[0];
      ty = el.u[1];
      radio = Infinity;
    } else {
      const ang = (d / el.radio) * el.giro;
      const rv = rot(el.r0, ang);
      x = el.c[0] + rv[0];
      y = el.c[1] + rv[1];
      const t = rot(el.u0, ang);
      tx = t[0];
      ty = t[1];
      radio = el.radio;
    }
    muestras.push({ s: sq, x, y, lngLat: toLngLat(frame, x, y), tx, ty, radio });
  }
  return { frame, longitud, ds, muestras, curvas };
}

/** Proyecta un punto al eje: cadenamiento más cercano y distancia lateral. */
export function proyectar(al: Alineamiento, p: LngLat): { s: number; distancia: number } {
  const [px, py] = toLocal(al.frame, p);
  const m = al.muestras;
  let best = { s: 0, distancia: Infinity };
  for (let i = 0; i < m.length - 1; i++) {
    const ax = m[i].x;
    const ay = m[i].y;
    const bx = m[i + 1].x;
    const by = m[i + 1].y;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy || 1e-9;
    const t = Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2));
    const cx = ax + vx * t;
    const cy = ay + vy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best.distancia) best = { s: m[i].s + (m[i + 1].s - m[i].s) * t, distancia: d };
  }
  if (m.length === 1) best = { s: 0, distancia: Math.hypot(px - m[0].x, py - m[0].y) };
  return best;
}

/** Interpola posición y tangente en un cadenamiento arbitrario. */
export function puntoEn(al: Alineamiento, s: number): { x: number; y: number; tx: number; ty: number; i: number; f: number } {
  const m = al.muestras;
  if (m.length === 1) return { x: m[0].x, y: m[0].y, tx: m[0].tx, ty: m[0].ty, i: 0, f: 0 };
  const sc = Math.min(Math.max(s, 0), al.longitud);
  let i = Math.min(m.length - 2, Math.floor(sc / al.ds));
  while (i > 0 && m[i].s > sc) i--;
  while (i < m.length - 2 && m[i + 1].s < sc) i++;
  const a = m[i];
  const b = m[i + 1];
  const f = b.s > a.s ? (sc - a.s) / (b.s - a.s) : 0;
  const tx = a.tx + (b.tx - a.tx) * f;
  const ty = a.ty + (b.ty - a.ty) * f;
  const tl = Math.hypot(tx, ty) || 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: tx / tl, ty: ty / tl, i, f };
}
