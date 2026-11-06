import type { Feature, FeatureCollection } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource, Map as MapaML } from 'maplibre-gl';
import type { Analisis } from '../engine/analisis';
import type { LngLat } from '../engine/geo';
import { TERRARIUM_URL } from '../engine/terreno';
import type { Propuesta, TipoEstructura } from '../engine/tipos';

export const ESTILO_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const CENTRO_CDMX: LngLat = [-99.205, 19.41];

const ATRIB_TERRENO = 'Terreno: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles (AWS / Mapzen, SRTM)</a>';
const ATRIB_SAT = 'Imágenes: Esri, Maxar, Earthstar Geographics';

export function configurarBase(map: MapaML) {
  if (!map.getSource('terreno')) {
    map.addSource('terreno', {
      type: 'raster-dem',
      tiles: [TERRARIUM_URL],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 14,
      attribution: ATRIB_TERRENO,
    });
    map.addSource('terreno-sombra', { type: 'raster-dem', tiles: [TERRARIUM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 13 });
  }
  map.setTerrain({ source: 'terreno', exaggeration: 1 });
  const antesDeCalles = map.getLayer('tunnel_motorway_link_casing') ? 'tunnel_motorway_link_casing' : undefined;
  if (!map.getLayer('sombreado')) {
    map.addLayer(
      {
        id: 'sombreado',
        type: 'hillshade',
        source: 'terreno-sombra',
        paint: {
          'hillshade-exaggeration': 0.32,
          'hillshade-shadow-color': '#4a3b2c',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#6b5a48',
        },
      },
      antesDeCalles,
    );
  }
  if (!map.getSource('satelite')) {
    map.addSource('satelite', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATRIB_SAT,
    });
    map.addLayer({ id: 'satelite', type: 'raster', source: 'satelite', layout: { visibility: 'none' } }, antesDeCalles);
  }
  map.setSky({
    'sky-color': '#8fbbe6',
    'horizon-color': '#e6edf3',
    'fog-color': '#f2f2ef',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': 0,
  });
  if (map.getLayer('building-3d')) {
    map.setPaintProperty('building-3d', 'fill-extrusion-color', '#e9e4dc');
    map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.88);
  }
}

export function setSatelite(map: MapaML, on: boolean) {
  if (map.getLayer('satelite')) map.setLayoutProperty('satelite', 'visibility', on ? 'visible' : 'none');
  if (map.getLayer('sombreado')) map.setLayoutProperty('sombreado', 'visibility', on ? 'none' : 'visible');
}

export function setEdificios(map: MapaML, on: boolean) {
  if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', on ? 'visible' : 'none');
}

export function setRelieve(map: MapaML, exageracion: number) {
  map.setTerrain({ source: 'terreno', exaggeration: exageracion });
}

// ---------- Red actual ----------

const ANCHO_MODO: ExpressionSpecification = [
  'match',
  ['get', 'modo'],
  ['metro', 'interurbano', 'suburbano'],
  3.2,
  ['tren-ligero', 'cablebus', 'mexicable', 'trolebus-elevado'],
  2.6,
  ['metrobus', 'mexibus'],
  2,
  1.4,
];

export const MODOS_RIELES = ['metro', 'interurbano', 'suburbano', 'tren-ligero', 'cablebus', 'mexicable', 'trolebus-elevado', 'metrobus', 'mexibus'];

export function agregarRed(map: MapaML, datos: FeatureCollection) {
  if (map.getSource('red')) return;
  map.addSource('red', { type: 'geojson', data: datos, attribution: 'Red de transporte: © OpenStreetMap' });
  map.addLayer({
    id: 'red-lineas',
    type: 'line',
    source: 'red',
    filter: ['all', ['==', ['get', 'tipo'], 'linea'], ['in', ['get', 'modo'], ['literal', MODOS_RIELES]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['*', ANCHO_MODO, 0.6], 15, ['*', ANCHO_MODO, 1.6]],
      'line-opacity': 0.72,
    },
  });
  map.addLayer({
    id: 'red-estaciones',
    type: 'circle',
    source: 'red',
    minzoom: 11.5,
    filter: [
      'all',
      ['==', ['get', 'tipo'], 'estacion'],
      ['any', ['!', ['in', ['get', 'modo'], ['literal', ['metrobus', 'mexibus', 'trolebus']]]], ['>=', ['zoom'], 14]],
    ],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 2, 15, 4.5],
      'circle-color': '#ffffff',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11.5, 1.2, 15, 2.2],
    },
  });
  map.addLayer({
    id: 'red-etiquetas',
    type: 'symbol',
    source: 'red',
    minzoom: 13.2,
    filter: [
      'all',
      ['==', ['get', 'tipo'], 'estacion'],
      ['!', ['in', ['get', 'modo'], ['literal', ['metrobus', 'mexibus', 'trolebus']]]],
    ],
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-max-width': 8,
    },
    paint: { 'text-color': '#3b3f46', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  });
}

export function setRed(map: MapaML, red: boolean, trolebus: boolean) {
  const modos = trolebus ? [...MODOS_RIELES, 'trolebus'] : MODOS_RIELES;
  if (!map.getLayer('red-lineas')) return;
  map.setFilter('red-lineas', ['all', ['==', ['get', 'tipo'], 'linea'], ['in', ['get', 'modo'], ['literal', modos]]]);
  for (const id of ['red-lineas', 'red-estaciones', 'red-etiquetas']) map.setLayoutProperty(id, 'visibility', red ? 'visible' : 'none');
}

// ---------- Propuestas (2D sobre el terreno) ----------

export function agregarCapasPropuestas(map: MapaML) {
  if (map.getSource('propuestas')) return;
  map.addSource('propuestas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('cursor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const sel: ExpressionSpecification = ['==', ['get', 'sel'], 1];
  const elevado: ExpressionSpecification = ['==', ['get', 'estructura'], 'elevado'];
  map.addLayer({
    id: 'prop-sombra',
    type: 'line',
    source: 'propuestas',
    filter: ['==', ['get', 'tipo'], 'eje'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', sel, 6, 4], 16, ['case', sel, 14, 8]],
      // De cerca manda el 3D: el trazo elevado queda como huella tenue en el suelo
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, ['case', sel, 0.95, 0.55], 16.5, ['case', elevado, 0.2, ['case', sel, 0.95, 0.55]]],
    },
  });
  map.addLayer({
    id: 'prop-linea',
    type: 'line',
    source: 'propuestas',
    filter: ['all', ['==', ['get', 'tipo'], 'eje'], ['!=', ['get', 'estructura'], 'tunel']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', sel, 3.5, 2.2], 16, ['case', sel, 9, 5]],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, ['case', sel, 1, 0.6], 16.5, ['case', elevado, 0.3, ['case', sel, 1, 0.6]]],
    },
  });
  map.addLayer({
    id: 'prop-tunel',
    type: 'line',
    source: 'propuestas',
    filter: ['all', ['==', ['get', 'tipo'], 'eje'], ['==', ['get', 'estructura'], 'tunel']],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', sel, 3, 2], 16, ['case', sel, 7, 4]],
      'line-opacity': ['case', sel, 0.95, 0.55],
      'line-dasharray': [1.4, 1.1],
    },
  });
  map.addLayer({
    id: 'prop-borrador',
    type: 'line',
    source: 'propuestas',
    filter: ['==', ['get', 'tipo'], 'borrador'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'prop-est',
    type: 'circle',
    source: 'propuestas',
    filter: ['==', ['get', 'tipo'], 'estacion'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', sel, 4.5, 3], 16, ['case', sel, 9, 6]],
      'circle-color': '#ffffff',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': ['case', sel, 3, 2],
      'circle-opacity': ['case', sel, 1, 0.7],
      'circle-stroke-opacity': ['case', sel, 1, 0.7],
    },
  });
  map.addLayer({
    id: 'prop-est-et',
    type: 'symbol',
    source: 'propuestas',
    filter: ['==', ['get', 'tipo'], 'estacion'],
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['case', sel, 12.5, 10.5],
      'text-offset': [0, -1.3],
      'text-anchor': 'bottom',
      'text-max-width': 9,
      'text-allow-overlap': false,
      'symbol-sort-key': ['case', sel, 0, 1],
    },
    paint: { 'text-color': '#16191e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8, 'text-opacity': ['case', sel, 1, 0.75] },
  });
  map.addLayer({
    id: 'cursor',
    type: 'circle',
    source: 'cursor',
    paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#15181d', 'circle-stroke-width': 3 },
  });
}

export function datosPropuestas(
  propuestas: Propuesta[],
  analisis: Record<string, Analisis>,
  seleccion: string | null,
): FeatureCollection {
  const features: Feature[] = [];
  // La seleccionada al final para que se dibuje encima
  const orden = [...propuestas].sort((a, b) => Number(a.id === seleccion) - Number(b.id === seleccion));
  for (const p of orden) {
    const a = analisis[p.id];
    const s = p.id === seleccion ? 1 : 0;
    if (!a) {
      if (p.trazo.length >= 2)
        features.push({ type: 'Feature', properties: { tipo: 'borrador', id: p.id, color: p.color, sel: s }, geometry: { type: 'LineString', coordinates: p.trazo } });
      continue;
    }
    const m = a.alineamiento.muestras;
    const est = a.perfil.estructura;
    let inicio = 0;
    const cortar = (i0: number, i1: number, e: TipoEstructura) => {
      if (i1 - i0 < 1) return;
      features.push({
        type: 'Feature',
        properties: { tipo: 'eje', id: p.id, color: p.color, sel: s, estructura: e },
        geometry: { type: 'LineString', coordinates: m.slice(i0, i1 + 1).map((x) => x.lngLat) },
      });
    };
    for (let i = 1; i < m.length; i++) {
      if (est[i] !== est[inicio] || i === m.length - 1) {
        cortar(inicio, i, est[inicio]);
        inicio = i;
      }
    }
    for (const e of a.estaciones) {
      features.push({
        type: 'Feature',
        properties: { tipo: 'estacion', id: p.id, est: e.id, nombre: e.nombre, color: p.color, sel: s },
        geometry: { type: 'Point', coordinates: e.lngLat },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function actualizarPropuestas(map: MapaML, datos: FeatureCollection) {
  (map.getSource('propuestas') as GeoJSONSource | undefined)?.setData(datos);
}

export function setCursor(map: MapaML, ll: LngLat | null) {
  const src = map.getSource('cursor') as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: ll ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ll } }] : [],
  });
}
