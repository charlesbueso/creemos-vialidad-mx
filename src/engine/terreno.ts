/**
 * Muestreo de elevación usando teselas Terrarium (AWS Open Data, derivadas de
 * SRTM ~30 m). El mismo código corre en el navegador y en Node: sólo cambia el
 * "loader" que decodifica el PNG.
 */
import type { LngLat } from './geo';

export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export interface TeselaDecodificada {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8Array | Uint8ClampedArray;
}

export type CargadorTesela = (url: string) => Promise<TeselaDecodificada>;

export function urlTesela(z: number, x: number, y: number, plantilla = TERRARIUM_URL): string {
  return plantilla.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export class MuestreadorTerreno {
  private cache = new Map<string, Promise<Float32Array>>();
  private size = 256;

  constructor(
    private cargar: CargadorTesela,
    public zoom = 14,
    private plantilla = TERRARIUM_URL,
  ) {}

  private tesela(x: number, y: number): Promise<Float32Array> {
    const key = `${this.zoom}/${x}/${y}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.cargar(urlTesela(this.zoom, x, y, this.plantilla)).then((t) => {
        this.size = t.width;
        const out = new Float32Array(t.width * t.height);
        const d = t.data;
        for (let i = 0, j = 0; i < out.length; i++, j += 4) {
          out[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
        }
        return out;
      });
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  /** Coordenadas de píxel global (en el zoom de trabajo) para un punto. */
  private pixel(p: LngLat): [number, number] {
    const n = 2 ** this.zoom * this.size;
    const lat = (p[1] * Math.PI) / 180;
    const x = ((p[0] + 180) / 360) * n;
    const y = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
    return [x - 0.5, y - 0.5];
  }

  async elevaciones(puntos: LngLat[]): Promise<Float32Array> {
    // Primero averiguar el tamaño real de tesela (256 en Terrarium)
    const size = this.size;
    const necesarias = new Set<string>();
    const px = puntos.map((p) => this.pixel(p));
    for (const [x, y] of px) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      for (const [ix, iy] of [
        [x0, y0],
        [x0 + 1, y0],
        [x0, y0 + 1],
        [x0 + 1, y0 + 1],
      ]) {
        necesarias.add(`${Math.floor(ix / size)}/${Math.floor(iy / size)}`);
      }
    }
    const teselas = new Map<string, Float32Array>();
    await Promise.all(
      [...necesarias].map(async (k) => {
        const [tx, ty] = k.split('/').map(Number);
        teselas.set(k, await this.tesela(tx, ty));
      }),
    );
    const valor = (ix: number, iy: number): number => {
      const tx = Math.floor(ix / size);
      const ty = Math.floor(iy / size);
      const t = teselas.get(`${tx}/${ty}`);
      if (!t) return 0;
      const lx = ix - tx * size;
      const ly = iy - ty * size;
      return t[ly * size + lx];
    };
    const out = new Float32Array(puntos.length);
    px.forEach(([x, y], i) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const a = valor(x0, y0);
      const b = valor(x0 + 1, y0);
      const c = valor(x0, y0 + 1);
      const d = valor(x0 + 1, y0 + 1);
      out[i] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    });
    return out;
  }
}

/** Cargador para navegador: decodifica el PNG sin gestión de color para no alterar los valores. */
export const cargadorNavegador: CargadorTesela = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terreno ${res.status} ${url}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Sin contexto 2D');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width: img.width, height: img.height, data: img.data };
};
