/**
 * Utilidades geográficas. Todo el motor trabaja en un plano local (metros)
 * centrado en el proyecto: a escala de ciudad (<60 km) el error de una
 * proyección equirectangular local es despreciable (<0.1%).
 */

export type LngLat = [lng: number, lat: number];

export const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export interface LocalFrame {
  origin: LngLat;
  /** metros por grado de longitud en el origen */
  mPerDegLng: number;
  /** metros por grado de latitud */
  mPerDegLat: number;
}

export function makeFrame(origin: LngLat): LocalFrame {
  return {
    origin,
    mPerDegLng: EARTH_RADIUS * RAD * Math.cos(origin[1] * RAD),
    mPerDegLat: EARTH_RADIUS * RAD,
  };
}

export function toLocal(f: LocalFrame, p: LngLat): [number, number] {
  return [(p[0] - f.origin[0]) * f.mPerDegLng, (p[1] - f.origin[1]) * f.mPerDegLat];
}

export function toLngLat(f: LocalFrame, x: number, y: number): LngLat {
  return [f.origin[0] + x / f.mPerDegLng, f.origin[1] + y / f.mPerDegLat];
}

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function centroid(points: LngLat[]): LngLat {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** Rumbo en grados (0 = norte, sentido horario) de a hacia b en el plano local. */
export function bearingDeg(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}
