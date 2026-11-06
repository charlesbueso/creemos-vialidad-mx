import * as maplibregl from 'maplibre-gl';
import { type Map as MapaML, type MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { indiceCercano } from '../engine/simulacion';
import type { LngLat } from '../engine/geo';
import { propuestaSeleccionada, useEstado } from '../state/store';
import { Simulador } from '../sim/simulador';
import { CapaTres } from './CapaTres';
import {
  actualizarPropuestas,
  agregarCapasPropuestas,
  agregarRed,
  configurarBase,
  datosPropuestas,
  ESTILO_URL,
  setCursor,
  setEdificios,
  setRed,
  setRelieve,
  setSatelite,
} from './capas';

export interface ApiMapa {
  map: MapaML;
  capa: CapaTres;
  sim: Simulador;
}

declare global {
  interface Window {
    __creemos?: ApiMapa & { listo: boolean };
  }
}

const CAPAS_CLIC = ['prop-linea', 'prop-tunel', 'prop-est', 'prop-sombra'];

export function MapView({ onApi }: { onApi: (api: ApiMapa) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<ApiMapa | null>(null);
  const colores = useRef(new Map<string, string>());
  const construidos = useRef(new Map<string, unknown>());

  // Crear mapa
  useEffect(() => {
    const map = new maplibregl.Map({
      container: contenedor.current!,
      style: ESTILO_URL,
      center: [-99.236, 19.405],
      zoom: 12.9,
      pitch: 62,
      bearing: -32,
      maxPitch: 85,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    let vivo = true;
    map.on('load', async () => {
      configurarBase(map);
      try {
        const red = await fetch(`${import.meta.env.BASE_URL}data/red-actual.geojson`).then((r) => r.json());
        if (vivo) agregarRed(map, red);
      } catch (e) {
        console.warn('No se pudo cargar la red actual', e);
      }
      if (!vivo) return;
      agregarCapasPropuestas(map);
      const capa = new CapaTres();
      map.addLayer(capa);
      const sim = new Simulador(map, capa);
      const nuevaApi = { map, capa, sim };
      window.__creemos = { ...nuevaApi, listo: false };
      setApi(nuevaApi);
      onApi(nuevaApi);
    });
    return () => {
      vivo = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capas
  const capas = useEstado((s) => s.capas);
  useEffect(() => {
    if (!api) return;
    const { map, capa } = api;
    setRed(map, capas.red, capas.trolebus);
    setEdificios(map, capas.edificios);
    setSatelite(map, capas.satelite);
    setRelieve(map, capas.relieve);
    capa.setExageracion(capas.relieve);
  }, [api, capas]);

  // Propuestas: 2D + 3D
  const propuestas = useEstado((s) => s.propuestas);
  const analisis = useEstado((s) => s.analisis);
  const seleccion = useEstado((s) => s.seleccion);
  useEffect(() => {
    if (!api) return;
    const { map, capa } = api;
    actualizarPropuestas(map, datosPropuestas(propuestas, analisis, seleccion));
    const vivos = new Set<string>();
    for (const p of propuestas) {
      const a = analisis[p.id];
      if (!a) continue;
      vivos.add(p.id);
      if (construidos.current.get(p.id) !== a || colores.current.get(p.id) !== p.color) {
        capa.setPropuesta(p.id, a, p.color);
        construidos.current.set(p.id, a);
        colores.current.set(p.id, p.color);
      }
    }
    for (const id of capa.ids()) {
      if (!vivos.has(id)) {
        capa.quitar(id);
        construidos.current.delete(id);
      }
    }
    const sel = seleccion ? analisis[seleccion] : null;
    if (window.__creemos && sel) {
      map.once('idle', () => {
        if (window.__creemos) window.__creemos.listo = true;
      });
    }
  }, [api, propuestas, analisis, seleccion]);

  // Cursor del perfil → punto en el mapa
  const cursorS = useEstado((s) => s.cursorS);
  useEffect(() => {
    if (!api) return;
    const st = useEstado.getState();
    const a = st.seleccion ? st.analisis[st.seleccion] : null;
    if (cursorS === null || !a) return setCursor(api.map, null);
    const i = indiceCercano(a.s, cursorS);
    setCursor(api.map, a.alineamiento.muestras[i].lngLat);
  }, [api, cursorS]);

  // Clics: seleccionar o editar
  const editando = useEstado((s) => s.editando);
  const modoEdicion = useEstado((s) => s.modoEdicion);
  useEffect(() => {
    if (!api) return;
    const { map } = api;
    const alClic = (ev: MapMouseEvent) => {
      const st = useEstado.getState();
      const ll: LngLat = [+ev.lngLat.lng.toFixed(6), +ev.lngLat.lat.toFixed(6)];
      if (st.editando) {
        if (st.modoEdicion === 'estaciones') st.agregarEstacion(ll);
        else {
          const p = propuestaSeleccionada(st);
          st.agregarPunto(ll, p ? indiceInsercion(map, p.trazo, ev.point) : undefined);
        }
        return;
      }
      const capasVivas = CAPAS_CLIC.filter((c) => map.getLayer(c));
      const f = map.queryRenderedFeatures(ev.point, { layers: capasVivas })[0];
      if (f?.properties?.id && f.properties.id !== st.seleccion) st.seleccionar(String(f.properties.id));
    };
    const encima = (ev: MapMouseEvent) => {
      if (useEstado.getState().editando) {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const capasVivas = CAPAS_CLIC.filter((c) => map.getLayer(c));
      const f = map.queryRenderedFeatures(ev.point, { layers: capasVivas })[0];
      map.getCanvas().style.cursor = f ? 'pointer' : '';
    };
    map.on('click', alClic);
    map.on('mousemove', encima);
    if (editando) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    return () => {
      map.off('click', alClic);
      map.off('mousemove', encima);
    };
  }, [api, editando, modoEdicion]);

  // Marcadores de edición
  const propuesta = useEstado(propuestaSeleccionada);
  const marcadores = useRef<{ puntos: maplibregl.Marker[]; estaciones: Map<string, maplibregl.Marker> }>({
    puntos: [],
    estaciones: new Map(),
  });
  const arrastrando = useRef(false);
  useEffect(() => {
    const mk = marcadores.current;
    const limpiar = () => {
      mk.puntos.forEach((m) => m.remove());
      mk.estaciones.forEach((m) => m.remove());
      mk.puntos = [];
      mk.estaciones = new Map();
    };
    if (!api || !editando || !propuesta) {
      limpiar();
      return;
    }
    if (arrastrando.current) return;
    const { map } = api;
    const color = propuesta.color;
    // Puntos del trazo
    if (mk.puntos.length !== propuesta.trazo.length) {
      mk.puntos.forEach((m) => m.remove());
      mk.puntos = propuesta.trazo.map((ll, i) => {
        const el = document.createElement('div');
        el.className = 'mk-punto';
        el.style.setProperty('--mk-color', color);
        el.textContent = String(i + 1);
        el.title = 'Arrastra para mover · clic derecho para borrar';
        const m = new maplibregl.Marker({ element: el, draggable: modoEdicion === 'trazo' }).setLngLat(ll).addTo(map);
        m.on('dragstart', () => (arrastrando.current = true));
        m.on('drag', () => {
          const p = m.getLngLat();
          useEstado.getState().moverPunto(i, [+p.lng.toFixed(6), +p.lat.toFixed(6)]);
        });
        m.on('dragend', () => (arrastrando.current = false));
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          useEstado.getState().quitarPunto(i);
        });
        return m;
      });
    } else {
      mk.puntos.forEach((m, i) => {
        m.setLngLat(propuesta.trazo[i]);
        m.setDraggable(modoEdicion === 'trazo');
        m.getElement().style.opacity = modoEdicion === 'trazo' ? '1' : '0.45';
      });
    }
    // Estaciones
    const ids = new Set(propuesta.estaciones.map((e) => e.id));
    for (const [id, m] of mk.estaciones) {
      if (!ids.has(id)) {
        m.remove();
        mk.estaciones.delete(id);
      }
    }
    propuesta.estaciones.forEach((e, k) => {
      let m = mk.estaciones.get(e.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'mk-estacion';
        el.style.setProperty('--mk-color', color);
        el.title = `${e.nombre} · arrastra para mover · clic derecho para borrar`;
        m = new maplibregl.Marker({ element: el, draggable: true, offset: [0, -16] }).setLngLat(e.lngLat).addTo(map);
        m.on('dragstart', () => (arrastrando.current = true));
        m.on('dragend', () => {
          arrastrando.current = false;
          const p = m!.getLngLat();
          useEstado.getState().moverEstacion(e.id, [+p.lng.toFixed(6), +p.lat.toFixed(6)]);
        });
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          useEstado.getState().quitarEstacion(e.id);
        });
        mk.estaciones.set(e.id, m);
      } else {
        m.setLngLat(e.lngLat);
      }
      m.getElement().textContent = String(k + 1);
      m.setDraggable(modoEdicion === 'estaciones');
      m.getElement().style.opacity = modoEdicion === 'estaciones' ? '1' : '0.5';
    });
  }, [api, editando, propuesta, modoEdicion]);

  useEffect(() => () => {
    marcadores.current.puntos.forEach((m) => m.remove());
    marcadores.current.estaciones.forEach((m) => m.remove());
  }, []);

  return <div ref={contenedor} className="mapa" aria-label="Mapa 3D del Valle de México" />;
}

/** Si el clic cae cerca de un tramo del trazo, inserta ahí; si no, al final. */
function indiceInsercion(map: MapaML, trazo: LngLat[], punto: { x: number; y: number }): number | undefined {
  let mejor: { d: number; i: number } | null = null;
  for (let i = 0; i < trazo.length - 1; i++) {
    const a = map.project(trazo[i]);
    const b = map.project(trazo[i + 1]);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((punto.x - a.x) * vx + (punto.y - a.y) * vy) / L2));
    const d = Math.hypot(punto.x - (a.x + vx * t), punto.y - (a.y + vy * t));
    if (t > 0.02 && t < 0.98 && (!mejor || d < mejor.d)) mejor = { d, i: i + 1 };
  }
  return mejor && mejor.d < 14 ? mejor.i : undefined;
}
