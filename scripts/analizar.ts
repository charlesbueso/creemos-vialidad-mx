/**
 * Analiza propuestas desde la terminal (útil para iterar trazos con Claude).
 *
 *   npm run analizar                          → todas las de src/data/propuestas
 *   npm run analizar -- ruta/a/propuesta.json → una en particular
 *   npm run analizar -- archivo.json --json   → volcado completo en JSON
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analizar, formatoMin, type Analisis } from '../src/engine/analisis';
import { MuestreadorTerreno } from '../src/engine/terreno';
import type { Propuesta } from '../src/engine/tipos';
import { cargadorNode } from './cargador-node';

const args = process.argv.slice(2);
const comoJson = args.includes('--json');
const rutas = args.filter((a) => !a.startsWith('--'));

async function main() {
  let archivos = rutas;
  if (archivos.length === 0) {
    const dir = join(process.cwd(), 'src', 'data', 'propuestas');
    archivos = (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  }
  const terreno = new MuestreadorTerreno(cargadorNode, 14);
  for (const archivo of archivos) {
    const p = JSON.parse(await readFile(archivo, 'utf8')) as Propuesta;
    const t0 = performance.now();
    const a = await analizar(p, terreno);
    const ms = performance.now() - t0;
    if (comoJson) console.log(JSON.stringify(resumenJson(a), null, 2));
    else imprimir(p, a, ms);
  }
}

function resumenJson(a: Analisis) {
  return {
    propuesta: a.propuestaId,
    tecnologia: a.tec.id,
    longitudKm: +(a.alineamiento.longitud / 1000).toFixed(3),
    tiempoLocalMin: +(a.local.tiempoTotal / 60).toFixed(2),
    tiempoExpresMin: a.expres ? +(a.expres.tiempoTotal / 60).toFixed(2) : null,
    vPromedioKmh: +a.local.vPromedioKmh.toFixed(1),
    pendienteMaxPct: +(a.perfil.resumen.pendienteMax * 100).toFixed(2),
    radioMinimoM: Number.isFinite(a.radioMinimo) ? Math.round(a.radioMinimo) : null,
    estructura: {
      elevadoKm: +(a.perfil.resumen.longElevado / 1000).toFixed(2),
      tunelKm: +(a.perfil.resumen.longTunel / 1000).toFixed(2),
      superficieKm: +(a.perfil.resumen.longSuperficie / 1000).toFixed(2),
    },
    alturaMaxM: Math.round(a.perfil.resumen.alturaMax),
    costoMusd: [Math.round(a.costo.min), Math.round(a.costo.max)],
    estaciones: a.estaciones.map((e, i) => ({
      nombre: e.nombre,
      km: +(e.s / 1000).toFixed(2),
      estructura: e.estructura,
      alturaM: Math.round(e.alturaVia),
      llegadaLocalMin: +(e.llegadaLocal / 60).toFixed(2),
      llegadaExpresMin: e.llegadaExpres === null ? null : +(e.llegadaExpres / 60).toFixed(2),
      indice: i,
    })),
    avisos: a.avisos,
    perfilCada100m: Array.from({ length: Math.floor(a.alineamiento.longitud / 100) + 1 }, (_, k) => {
      const i = Math.min(a.s.length - 1, Math.round((k * 100) / a.alineamiento.ds));
      return {
        km: +(a.s[i] / 1000).toFixed(1),
        terreno: Math.round(a.terreno[i]),
        via: Math.round(a.perfil.via[i]),
        tipo: a.perfil.estructura[i],
        kmh: Math.round(a.local.v[i] * 3.6),
      };
    }),
  };
}

function imprimir(p: Propuesta, a: Analisis, ms: number) {
  const r = a.perfil.resumen;
  const L = a.alineamiento.longitud;
  const lineas = [
    '',
    `■ ${p.nombre}  [${a.tec.nombre}]  (${ms.toFixed(0)} ms)`,
    `  Longitud ............ ${(L / 1000).toFixed(2)} km`,
    `  Servicio local ...... ${formatoMin(a.local.tiempoTotal)} min  (${a.estaciones.length} estaciones, ${a.local.vPromedioKmh.toFixed(0)} km/h promedio)`,
    a.expres ? `  Servicio exprés ..... ${formatoMin(a.expres.tiempoTotal)} min  (${a.expres.vPromedioKmh.toFixed(0)} km/h promedio)` : '',
    `  Velocidad máx ....... ${a.local.vMaxAlcanzadaKmh.toFixed(0)} de ${a.vMaxKmh} km/h`,
    `  Pendiente máx ....... ${(r.pendienteMax * 100).toFixed(1)} % (límite ${(a.tec.pendienteMax * 100).toFixed(0)} %) en km ${(r.sPendienteMax / 1000).toFixed(1)}`,
    `  Radio mínimo ........ ${Number.isFinite(a.radioMinimo) ? Math.round(a.radioMinimo) + ' m' : 'sin curvas'} (límite ${a.tec.radioMin} m)`,
    `  Estructura .......... elevado ${(r.longElevado / 1000).toFixed(1)} km · túnel ${(r.longTunel / 1000).toFixed(1)} km · superficie/rampa ${(r.longSuperficie / 1000).toFixed(1)} km`,
    `  Viaducto más alto ... ${Math.round(r.alturaMax)} m (km ${(r.sAlturaMax / 1000).toFixed(1)})`,
    `  Costo (orden de mag.) USD ${(a.costo.min / 1000).toFixed(1)}–${(a.costo.max / 1000).toFixed(1)} mil millones`,
    `  Estaciones:`,
    ...a.estaciones.map(
      (e, i) =>
        `    ${String(i + 1).padStart(2)}. ${e.nombre.padEnd(30)} km ${(e.s / 1000).toFixed(2).padStart(6)}  ${e.estructura.padEnd(10)} ${String(Math.round(e.alturaVia)).padStart(4)} m  local ${formatoMin(e.llegadaLocal).padStart(5)}${e.llegadaExpres !== null ? `  exprés ${formatoMin(e.llegadaExpres).padStart(5)}` : ''}${e.expres ? ' ★' : ''}`,
    ),
    a.avisos.length ? `  Avisos:` : '',
    ...a.avisos.map((v) => `    ${v.nivel === 'error' ? '✖' : v.nivel === 'aviso' ? '▲' : '·'} ${v.texto}`),
  ];
  console.log(lineas.filter(Boolean).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
