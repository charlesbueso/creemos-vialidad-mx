// Descarga la red de transporte masivo del Valle de México desde OpenStreetMap
// (Overpass API) y la guarda simplificada en public/data/red-actual.geojson.
//
//   npm run datos:transporte
//
// Datos © colaboradores de OpenStreetMap, licencia ODbL.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BBOX = '19.05,-99.45,19.85,-98.85';
const SALIDA = join(process.cwd(), 'public', 'data', 'red-actual.geojson');
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const query = `[out:json][timeout:240];
(
  relation["type"="route"]["route"~"^(subway|light_rail|train|aerialway|trolleybus)$"](${BBOX});
  relation["type"="route"]["route"="bus"]["network"~"Metrob|Mexib",i](${BBOX});
)->.rutas;
.rutas out geom;
node(r.rutas)->.paradas;
.paradas out body;
nwr["aerialway"="station"](${BBOX});
out center tags;`;

const COLORES = {
  metro: {},
  metrobus: { 1: '#C8102E', 2: '#893894', 3: '#78A22F', 4: '#F39200', 5: '#09347A', 6: '#C21A7C', 7: '#00843D' },
  mexibus: {},
  cablebus: { 1: '#4DAF4A', 2: '#9C4F96', 3: '#E5A823' },
  mexicable: {},
  'tren-ligero': {},
  suburbano: {},
  interurbano: {},
  trolebus: {},
  'trolebus-elevado': {},
};
const COLOR_MODO = {
  metro: '#888888',
  metrobus: '#C8102E',
  mexibus: '#D4007A',
  cablebus: '#4DAF4A',
  mexicable: '#E6007E',
  'tren-ligero': '#0554BA',
  suburbano: '#BF1600',
  interurbano: '#8C1D40',
  trolebus: '#1C75BC',
  'trolebus-elevado': '#1A5FB4',
};

function clasificar(t) {
  const nombre = t.name ?? '';
  switch (t.route) {
    case 'subway':
      return { modo: 'metro', linea: (t.ref ?? nombre.match(/L[ií]nea\s+(\w+)/)?.[1] ?? '?').toUpperCase() };
    case 'light_rail':
      return { modo: 'tren-ligero', linea: 'TL' };
    case 'train':
      if (/suburbano/i.test(nombre + (t.network ?? ''))) return { modo: 'suburbano', linea: 'S1' };
      if (/insurgente|interurbano/i.test(nombre)) return { modo: 'interurbano', linea: 'TI' };
      return null;
    case 'aerialway':
      return /mexicable/i.test(nombre + (t.network ?? ''))
        ? { modo: 'mexicable', linea: t.ref ?? nombre.match(/L[ií]nea\s+(\w+)/)?.[1] ?? '1' }
        : { modo: 'cablebus', linea: t.ref ?? nombre.match(/L[ií]nea\s+(\w+)/)?.[1] ?? '1' };
    case 'trolleybus': {
      const elevado = /elevado/i.test(nombre) || t.ref === '11';
      const linea = t.ref ?? nombre.match(/L[ií]nea\s+(\w+)/)?.[1] ?? nombre;
      return { modo: elevado ? 'trolebus-elevado' : 'trolebus', linea: String(linea) };
    }
    case 'bus': {
      const red = t.network ?? '';
      if (/mexib/i.test(red)) {
        const m = (t.ref ?? '').match(/L\s*(\d+[A-Z]?)/i) ?? nombre.match(/L[ií]nea\s*(\d+[A-Z]?)/i);
        return { modo: 'mexibus', linea: m ? m[1].toUpperCase() : '?' };
      }
      const m = nombre.match(/L[ií]nea\s*(\d+)/i) ?? (t.ref ?? '').match(/L?(\d+)/i);
      return { modo: 'metrobus', linea: m ? m[1] : '?' };
    }
    default:
      return null;
  }
}

const R = 6371008.8;
const rad = Math.PI / 180;
function simplificar(coords, tolM) {
  if (coords.length < 3) return coords;
  const lat0 = coords[0][1] * rad;
  const P = coords.map(([x, y]) => [x * rad * Math.cos(lat0) * R, y * rad * R]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const pila = [[0, coords.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = P[a];
    const [bx, by] = P[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let dmax = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - P[i][1]) - (ax - P[i][0]) * (by - ay)) / L;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax > tolM && idx > 0) {
      keep[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}
const redondear = (c) => [+c[0].toFixed(5), +c[1].toFixed(5)];

async function main() {
  console.log('Consultando Overpass…');
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'creemos-vialidad-mx' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const datos = await res.json();
  const nodos = new Map();
  const estacionesCable = [];
  for (const e of datos.elements) {
    if (e.tags?.aerialway === 'station') {
      const lon = e.lon ?? e.center?.lon;
      const lat = e.lat ?? e.center?.lat;
      if (lon !== undefined && e.tags.name) estacionesCable.push({ lon, lat, nombre: e.tags.name });
    }
    if (e.type === 'node') nodos.set(e.id, e);
  }

  const lineas = new Map();
  for (const rel of datos.elements) {
    if (rel.type !== 'relation') continue;
    const c = clasificar(rel.tags ?? {});
    if (!c) continue;
    const clave = `${c.modo}:${c.linea}`;
    let L = lineas.get(clave);
    if (!L) {
      L = { ...c, nombres: new Set(), color: null, vias: new Map(), paradas: new Map() };
      lineas.set(clave, L);
    }
    if (rel.tags?.colour && !L.color) L.color = rel.tags.colour;
    if (rel.tags?.name) L.nombres.add(rel.tags.name);
    for (const m of rel.members ?? []) {
      if (m.type === 'way' && m.geometry && !/platform/.test(m.role ?? '')) {
        L.vias.set(m.ref, m.geometry.map((g) => [g.lon, g.lat]));
      } else if (m.type === 'node' && /^(stop|stop_entry_only|stop_exit_only|platform|platform_entry_only|platform_exit_only)$/.test(m.role ?? '')) {
        const n = nodos.get(m.ref);
        const nombre = n?.tags?.name;
        if (!n || !nombre) continue;
        const llave = nombre.replace(/^(Metro|Metrobús|Estación)\s+/i, '').trim();
        const p = L.paradas.get(llave) ?? { x: 0, y: 0, n: 0, esStop: false };
        const esStop = (m.role ?? '').startsWith('stop');
        if (esStop && !p.esStop) {
          p.x = p.y = p.n = 0;
          p.esStop = true;
        }
        if (esStop || !p.esStop) {
          p.x += n.lon;
          p.y += n.lat;
          p.n++;
        }
        L.paradas.set(llave, p);
      }
    }
  }

  // Las estaciones de teleférico no suelen ser miembros de la ruta: asignarlas a la línea más cercana
  for (const est of estacionesCable) {
    let mejor = null;
    let dMin = 150;
    for (const L of lineas.values()) {
      if (L.modo !== 'cablebus' && L.modo !== 'mexicable') continue;
      for (const via of L.vias.values()) {
        for (const [lon, lat] of via) {
          const d = Math.hypot((lon - est.lon) * 105000, (lat - est.lat) * 111000);
          if (d < dMin) {
            dMin = d;
            mejor = L;
          }
        }
      }
    }
    if (mejor && !mejor.paradas.has(est.nombre)) mejor.paradas.set(est.nombre, { x: est.lon, y: est.lat, n: 1, esStop: true });
  }

  const features = [];
  const orden = Object.keys(COLOR_MODO);
  for (const L of [...lineas.values()].sort((a, b) => orden.indexOf(a.modo) - orden.indexOf(b.modo))) {
    const color = (COLORES[L.modo]?.[L.linea] ?? L.color ?? COLOR_MODO[L.modo]).toUpperCase();
    const partes = [...L.vias.values()].map((c) => simplificar(c, 4).map(redondear)).filter((c) => c.length > 1);
    if (!partes.length) continue;
    const nombre = nombreLinea(L);
    features.push({
      type: 'Feature',
      properties: { tipo: 'linea', modo: L.modo, linea: L.linea, nombre, color },
      geometry: { type: 'MultiLineString', coordinates: partes },
    });
    for (const [nombreParada, p] of L.paradas) {
      features.push({
        type: 'Feature',
        properties: { tipo: 'estacion', modo: L.modo, linea: L.linea, nombre: nombreParada, color, lineaNombre: nombre },
        geometry: { type: 'Point', coordinates: redondear([p.x / p.n, p.y / p.n]) },
      });
    }
    console.log(`  ${nombre.padEnd(34)} ${String(partes.length).padStart(4)} tramos  ${String(L.paradas.size).padStart(3)} estaciones`);
  }
  const geojson = {
    type: 'FeatureCollection',
    metadata: { fuente: '© colaboradores de OpenStreetMap (ODbL)', generado: new Date().toISOString() },
    features,
  };
  await mkdir(dirname(SALIDA), { recursive: true });
  const texto = JSON.stringify(geojson);
  await writeFile(SALIDA, texto);
  console.log(`Guardado ${SALIDA} (${(texto.length / 1024).toFixed(0)} KB, ${features.length} elementos)`);
}

function nombreLinea(L) {
  const n = {
    metro: `Metro Línea ${L.linea}`,
    metrobus: `Metrobús Línea ${L.linea}`,
    mexibus: `Mexibús Línea ${L.linea}`,
    cablebus: `Cablebús Línea ${L.linea}`,
    mexicable: `Mexicable Línea ${L.linea}`,
    'tren-ligero': 'Tren Ligero',
    suburbano: 'Tren Suburbano',
    interurbano: 'Tren Interurbano "El Insurgente"',
    trolebus: `Trolebús ${/^\w{1,3}$/.test(L.linea) ? 'Línea ' + L.linea : L.linea}`,
    'trolebus-elevado': 'Trolebús Elevado',
  };
  return n[L.modo] ?? L.linea;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
