/**
 * Bucle de animación: mueve el tren según la marcha simulada (tiempo real ×N)
 * y, si se pide, lleva la cámara detrás del tren o en la cabina.
 * También hace el "sobrevuelo" cinematográfico del trazo.
 */
import * as maplibregl from 'maplibre-gl';
import { type Map as MapaML } from 'maplibre-gl';
import type { Analisis } from '../engine/analisis';
import { posicionEnTiempo } from '../engine/simulacion';
import type { CapaTres } from '../map/CapaTres';
import { analisisSeleccionado, useEstado } from '../state/store';

export class Simulador {
  private raf = 0;
  private ultimo = 0;
  private t = 0;
  private ultimoEnvio = 0;
  private rumboSuave: number | null = null;
  private vuelo: { s: number; a: Analisis } | null = null;

  constructor(
    private map: MapaML,
    private capa: CapaTres,
  ) {}

  iniciar(desde: number) {
    this.t = desde;
    this.ultimo = performance.now();
    this.rumboSuave = null;
    this.capa.animando = true;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.paso);
  }

  /**
   * Detiene la animación. No toca el anclaje de la cámara al suelo: al pausar en
   * modo cabina, reactivarlo bajaba el centro al terreno y metía la cámara bajo tierra.
   */
  detener() {
    cancelAnimationFrame(this.raf);
    this.capa.animando = false;
    this.vuelo = null;
  }

  /** Sale de la vista de cabina: vuelve a anclar la cámara al suelo en una pose segura detrás del tren. */
  salirDeCabina() {
    if (this.map.getCenterClampedToGround()) return;
    const st = useEstado.getState();
    const a = analisisSeleccionado(st);
    this.map.setCenterClampedToGround(true);
    if (!a) return;
    const marcha = st.sim.servicio === 'expres' && a.expres ? a.expres : a.local;
    const info = this.capa.puntoEn(a.propuestaId, posicionEnTiempo(marcha, st.sim.t));
    if (info) this.map.jumpTo({ center: info.lngLat, bearing: info.rumbo, pitch: 62, zoom: 16.2 });
  }

  /** Coloca el tren en un instante sin animar (para capturas o al pausar). */
  colocar(t: number) {
    const st = useEstado.getState();
    const a = analisisSeleccionado(st);
    if (!a) return;
    const marcha = st.sim.servicio === 'expres' && a.expres ? a.expres : a.local;
    const s = posicionEnTiempo(marcha, t);
    this.capa.moverTren(a.propuestaId, s);
    if (this.capa.esCable(a.propuestaId)) this.capa.moverCabinas(a.propuestaId, t);
  }

  sobrevolar(a: Analisis) {
    this.vuelo = { s: 0, a };
    this.ultimo = performance.now();
    this.rumboSuave = null;
    this.capa.animando = true;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.paso);
  }

  private paso = (ahora: number) => {
    // Tope de 0.5 s por cuadro: equipos lentos no frenan el reloj, pero volver de otra pestaña no da saltos enormes
    const dtReal = Math.min(0.5, (ahora - this.ultimo) / 1000);
    this.ultimo = ahora;
    if (this.vuelo) {
      this.pasoVuelo(dtReal);
      return;
    }
    const st = useEstado.getState();
    const a = analisisSeleccionado(st);
    if (!a || !st.sim.reproduciendo) {
      this.detener();
      return;
    }
    const marcha = st.sim.servicio === 'expres' && a.expres ? a.expres : a.local;
    this.t = Math.min(marcha.tiempoTotal, this.t + dtReal * st.sim.velocidad);
    const s = posicionEnTiempo(marcha, this.t);
    const info = this.capa.moverTren(a.propuestaId, s);
    if (this.capa.esCable(a.propuestaId)) this.capa.moverCabinas(a.propuestaId, this.t);
    if (info) this.camara(st.sim.camara, info, a, s);

    const fin = this.t >= marcha.tiempoTotal;
    if (ahora - this.ultimoEnvio > 100 || fin) {
      this.ultimoEnvio = ahora;
      st.setSim({ t: this.t, reproduciendo: !fin });
    }
    if (fin) {
      this.detener();
      return;
    }
    this.raf = requestAnimationFrame(this.paso);
  };

  private pasoVuelo(dt: number) {
    const v = this.vuelo!;
    const L = v.a.alineamiento.longitud;
    v.s += dt * Math.max(250, L / 45);
    const s = Math.min(L, v.s);
    const info = this.capa.puntoEn(v.a.propuestaId, s);
    if (info) {
      const rumbo = this.suavizar(info.rumbo, 0.04);
      this.map.jumpTo({ center: info.lngLat, bearing: rumbo, pitch: 66, zoom: 15.3 });
    }
    if (v.s >= L) {
      this.detener();
      return;
    }
    this.raf = requestAnimationFrame(this.paso);
  }

  private suavizar(rumbo: number, k: number) {
    if (this.rumboSuave === null) this.rumboSuave = rumbo;
    let d = rumbo - this.rumboSuave;
    d = ((d + 540) % 360) - 180;
    this.rumboSuave = (this.rumboSuave + d * k + 360) % 360;
    return this.rumboSuave;
  }

  private camara(modo: string, info: { lngLat: [number, number]; rumbo: number; z: number }, a: Analisis, s: number) {
    if (modo === 'seguir') {
      this.map.setCenterClampedToGround(true);
      const rumbo = this.suavizar(info.rumbo, 0.06);
      this.map.jumpTo({ center: info.lngLat, bearing: rumbo, pitch: 64, zoom: 16.4 });
    } else if (modo === 'cabina') {
      this.map.setCenterClampedToGround(false);
      const adelante = this.capa.puntoEn(a.propuestaId, Math.min(a.alineamiento.longitud, s + 220));
      if (!adelante) return;
      const e = this.map.getTerrain()?.exaggeration ?? 1;
      const desde = new maplibregl.LngLat(info.lngLat[0], info.lngLat[1]);
      const hacia = new maplibregl.LngLat(adelante.lngLat[0], adelante.lngLat[1]);
      const cam = this.map.calculateCameraOptionsFromTo(desde, (info.z + 5) * e, hacia, (adelante.z + 3) * e);
      this.map.jumpTo(cam);
    }
  }
}
