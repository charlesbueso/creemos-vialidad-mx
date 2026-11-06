/**
 * Orquesta el análisis completo de una propuesta: eje → terreno → perfil →
 * marcha (servicio local y exprés) → costo → avisos de ingeniería.
 * No depende del navegador: el mismo código corre en `npm run analizar`.
 */
import { construirAlineamiento, proyectar, type Alineamiento } from './alineamiento';
import type { LngLat } from './geo';
import { calcularPerfil, type Perfil } from './perfil';
import { indiceCercano, simularMarcha, type Marcha } from './simulacion';
import { TECNOLOGIAS, type Tecnologia } from './tecnologias';
import type { MuestreadorTerreno } from './terreno';
import type { Propuesta, TipoEstructura } from './tipos';

export interface EstacionAnalizada {
  id: string;
  nombre: string;
  s: number;
  distanciaEje: number;
  expres: boolean;
  lngLat: LngLat;
  estructura: TipoEstructura;
  cotaVia: number;
  alturaVia: number;
  conexiones: string[];
  /** Llegada desde el origen, servicio local (s) */
  llegadaLocal: number;
  /** Paso o llegada en servicio exprés (s) */
  llegadaExpres: number | null;
}

export interface Aviso {
  nivel: 'error' | 'aviso' | 'info';
  texto: string;
  s?: number;
}

export interface Analisis {
  propuestaId: string;
  tec: Tecnologia;
  vMaxKmh: number;
  radioDiseno: number;
  alineamiento: Alineamiento;
  s: Float64Array;
  radio: Float64Array;
  terreno: Float32Array;
  perfil: Perfil;
  estaciones: EstacionAnalizada[];
  local: Marcha;
  expres: Marcha | null;
  costo: { min: number; max: number; lineaMin: number; lineaMax: number; estacionesMin: number; estacionesMax: number };
  avisos: Aviso[];
  radioMinimo: number;
  sRadioMinimo: number;
}

const km = (m: number) => (m / 1000).toFixed(1);

export async function analizar(p: Propuesta, terreno: MuestreadorTerreno): Promise<Analisis> {
  const tec = TECNOLOGIAS[p.tecnologia] ?? TECNOLOGIAS.monorriel;
  const vMaxKmh = p.opciones?.vMaxKmh ?? tec.vMaxKmh;
  const vMax = vMaxKmh / 3.6;
  // Radio de diseño: el que permite ir a velocidad máxima; si no cabe, el más amplio posible
  const radioDiseno = tec.esCable ? 0 : (p.opciones?.radioDisenoM ?? Math.max(tec.radioMin, (vMax * vMax) / tec.aLateral));
  const al = construirAlineamiento(p.trazo, radioDiseno, 10);
  const n = al.muestras.length;
  const s = new Float64Array(n);
  const radio = new Float64Array(n);
  al.muestras.forEach((m, i) => {
    s[i] = m.s;
    radio[i] = m.radio;
  });
  const ter = await terreno.elevaciones(al.muestras.map((m) => m.lngLat));

  // Estaciones proyectadas al eje, en orden de cadenamiento
  const est = p.estaciones
    .map((e) => {
      const pr = proyectar(al, e.lngLat);
      return { e, s: pr.s, distancia: pr.distancia };
    })
    .sort((a, b) => a.s - b.s);

  const restricciones = (p.restricciones ?? []).map((r) => ({ s0: r.desdeKm * 1000, s1: r.hastaKm * 1000, tipo: r.tipo }));
  const perfil = calcularPerfil({
    tec,
    s,
    terreno: ter,
    permitirTunel: p.opciones?.permitirTunel ?? true,
    estacionesS: est.map((x) => x.s),
    restricciones,
  });

  const idx = (sq: number) => indiceCercano(s, sq);
  // En teleférico las cabinas paran en todas las estaciones: no hay exprés
  const esExpres = est.map((x, k) => tec.esCable || k === 0 || k === est.length - 1 || !!x.e.expres);
  const paradasLocal = [0, ...est.map((x) => x.s), al.longitud];
  const local = simularMarcha({ tec, vMaxKmh, s, radio, pendiente: perfil.pendiente, paradas: paradasLocal });
  const paradasExpres = [0, ...est.filter((_, k) => esExpres[k]).map((x) => x.s), al.longitud];
  const hayExpres = esExpres.some((x) => !x);
  const expres = hayExpres
    ? simularMarcha({ tec, vMaxKmh, s, radio, pendiente: perfil.pendiente, paradas: paradasExpres })
    : null;

  const estaciones: EstacionAnalizada[] = est.map((x, k) => {
    const i = idx(x.s);
    const m = al.muestras[i];
    return {
      id: x.e.id,
      nombre: x.e.nombre,
      s: x.s,
      distanciaEje: x.distancia,
      expres: esExpres[k],
      lngLat: m.lngLat,
      estructura: perfil.estructura[i],
      cotaVia: perfil.via[i],
      alturaVia: perfil.altura[i],
      conexiones: x.e.conexiones ?? [],
      llegadaLocal: local.t[i],
      llegadaExpres: expres ? expres.t[i] : null,
    };
  });

  // Costo
  const prom = (r: [number, number], f: number) => [r[0] * f, r[1] * f] as const;
  let lineaMin = 0;
  let lineaMax = 0;
  for (let i = 1; i < n; i++) {
    const largoKm = (s[i] - s[i - 1]) / 1000;
    const tipo = perfil.estructura[i];
    let f = 1;
    if (tipo === 'elevado' && !tec.esCable) {
      const h = perfil.altura[i];
      f = 1 + 0.012 * Math.max(0, h - tec.alturaMinViaM) + 0.03 * Math.max(0, h - 35) + 0.08 * Math.max(0, h - 60);
    }
    const [a, b] = prom(tec.costoMusdKm[tipo], f * largoKm);
    lineaMin += a;
    lineaMax += b;
  }
  let estacionesMin = 0;
  let estacionesMax = 0;
  for (const e of estaciones) {
    const r = e.estructura === 'tunel' ? tec.costoEstacionMusd.subterranea : tec.costoEstacionMusd.elevada;
    estacionesMin += r[0];
    estacionesMax += r[1];
  }

  // Avisos de ingeniería
  const avisos: Aviso[] = [];
  let radioMinimo = Infinity;
  let sRadioMinimo = 0;
  for (const c of al.curvas) {
    if (c.radio < radioMinimo) {
      radioMinimo = c.radio;
      sRadioMinimo = (c.s0 + c.s1) / 2;
    }
    if (tec.esCable) continue;
    if (c.radio < tec.radioMin) {
      avisos.push({
        nivel: 'error',
        s: c.s0,
        texto: `Curva de R = ${Math.round(c.radio)} m en el km ${km(c.s0)}: ${tec.nombre} necesita al menos ${tec.radioMin} m. Separa los puntos o abre el ángulo.`,
      });
    } else {
      const vc = Math.sqrt(tec.aLateral * c.radio) * 3.6;
      if (vc < vMaxKmh * 0.6 && c.deflexionDeg > 8) {
        avisos.push({
          nivel: 'info',
          s: c.s0,
          texto: `La curva del km ${km(c.s0)} (R = ${Math.round(c.radio)} m) obliga a bajar a ${Math.round(vc)} km/h.`,
        });
      }
    }
  }
  if (tec.esCable && al.curvas.length === 0 && p.trazo.length > 2) {
    avisos.push({
      nivel: 'info',
      texto: 'En teleférico cada quiebre del trazo es una estación de ángulo (cuesta casi como una estación).',
    });
  }
  const r = perfil.resumen;
  if (!tec.esCable && r.alturaMax > 40) {
    avisos.push({
      nivel: 'aviso',
      s: r.sAlturaMax,
      texto: `Viaducto de ${Math.round(r.alturaMax)} m de alto en el km ${km(r.sAlturaMax)} (≈ ${Math.round(r.alturaMax / 3)} pisos). Revisa si conviene túnel o rodear la barranca.`,
    });
  }
  if (r.longTunel > 0) {
    avisos.push({
      nivel: 'info',
      texto: `${km(r.longTunel)} km en túnel: el optimizador lo eligió porque un viaducto ahí sería más alto y caro.`,
    });
  }
  // Cada túnel tiene dos portales; hasta ~300 m de rampa por portal es normal
  const portales = contarTramos(perfil.estructura, 'tunel') * 2;
  if (r.longSuperficie > 200 && r.longTunel > 0 && r.longSuperficie <= portales * 300) {
    avisos.push({
      nivel: 'info',
      texto: `≈ ${km(r.longSuperficie)} km son rampas de entrada y salida de túnel (portales): necesitan espacio en superficie.`,
    });
  } else if (r.longSuperficie > 200) {
    avisos.push({
      nivel: 'aviso',
      texto: `${km(r.longSuperficie)} km quedan a nivel de calle o en rampa: en ciudad eso parte avenidas. Ajusta el trazo o permite túnel.`,
    });
  }
  for (const e of estaciones) {
    if (e.distanciaEje > 80) {
      avisos.push({ nivel: 'aviso', s: e.s, texto: `La estación ${e.nombre} está a ${Math.round(e.distanciaEje)} m del trazo.` });
    }
    if (!tec.esCable && e.estructura === 'elevado' && e.alturaVia > 25) {
      avisos.push({
        nivel: 'aviso',
        s: e.s,
        texto: `La estación ${e.nombre} queda a ${Math.round(e.alturaVia)} m del suelo: muévela a terreno más alto o planea elevadores de gran capacidad.`,
      });
    }
    const i = idx(e.s);
    if (!tec.esCable && Number.isFinite(radio[i]) && radio[i] < 400) {
      avisos.push({ nivel: 'aviso', s: e.s, texto: `La estación ${e.nombre} cae en curva (R = ${Math.round(radio[i])} m): los andenes deben ir en recta.` });
    }
  }
  for (let k = 1; k < estaciones.length; k++) {
    const d = estaciones[k].s - estaciones[k - 1].s;
    if (!tec.esCable && d < 600) {
      avisos.push({ nivel: 'aviso', s: estaciones[k].s, texto: `${estaciones[k - 1].nombre} y ${estaciones[k].nombre} están a sólo ${Math.round(d)} m.` });
    }
  }
  if (estaciones.length > 0) {
    if (estaciones[0].s > 200) avisos.push({ nivel: 'aviso', texto: 'El trazo empieza antes de la primera estación: ¿falta una terminal?' });
    if (al.longitud - estaciones[estaciones.length - 1].s > 200)
      avisos.push({ nivel: 'aviso', texto: 'El trazo sigue después de la última estación: ¿falta una terminal?' });
  }

  return {
    propuestaId: p.id,
    tec,
    vMaxKmh,
    radioDiseno,
    alineamiento: al,
    s,
    radio,
    terreno: ter,
    perfil,
    estaciones,
    local,
    expres,
    costo: {
      min: lineaMin + estacionesMin,
      max: lineaMax + estacionesMax,
      lineaMin,
      lineaMax,
      estacionesMin,
      estacionesMax,
    },
    avisos,
    radioMinimo,
    sRadioMinimo,
  };
}

function contarTramos(estructura: TipoEstructura[], tipo: TipoEstructura): number {
  let c = 0;
  for (let i = 0; i < estructura.length; i++) if (estructura[i] === tipo && (i === 0 || estructura[i - 1] !== tipo)) c++;
  return c;
}

export function formatoMin(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg - m * 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
