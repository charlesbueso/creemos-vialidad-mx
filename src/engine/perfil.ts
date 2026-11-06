/**
 * Perfil vertical. Elige la altura de la vía en cada punto minimizando el costo
 * total (viaducto que encarece con la altura, túnel, rampas) sujeto a la
 * pendiente máxima de la tecnología, estaciones a nivel y restricciones del
 * usuario. Es programación dinámica sobre una malla de 50 m × 0.25 m.
 */
import type { Tecnologia } from './tecnologias';
import type { TipoEstructura } from './tipos';

export interface EntradaPerfil {
  tec: Tecnologia;
  /** Cadenamientos de las muestras finas (uniformes salvo la última) */
  s: Float64Array;
  /** Terreno en cada muestra fina (m s.n.m.) */
  terreno: Float32Array;
  permitirTunel: boolean;
  estacionesS: number[];
  restricciones: { s0: number; s1: number; tipo: TipoEstructura }[];
}

export interface Perfil {
  via: Float32Array;
  estructura: TipoEstructura[];
  /** Pendiente local (fracción, positiva = sube en el sentido del cadenamiento) */
  pendiente: Float32Array;
  /** Altura de vía sobre terreno (m); negativa en túnel */
  altura: Float32Array;
  torres?: number[];
  resumen: {
    pendienteMax: number;
    sPendienteMax: number;
    alturaMax: number;
    sAlturaMax: number;
    longElevado: number;
    longTunel: number;
    longSuperficie: number;
    numPilas: number;
  };
}

const COBERTURA_TUNEL = 12;
const DZ = 0.25;
const DS_DP = 50;

const promedio = (r: [number, number]) => (r[0] + r[1]) / 2;

export function calcularPerfil(e: EntradaPerfil): Perfil {
  return e.tec.esCable ? perfilCable(e) : perfilFerroviario(e);
}

function perfilFerroviario(e: EntradaPerfil): Perfil {
  const { tec, s, terreno } = e;
  const n = s.length;
  const L = s[n - 1];
  const hmin = tec.alturaMinViaM;
  const cElev = promedio(tec.costoMusdKm.elevado);
  const cTun = promedio(tec.costoMusdKm.tunel);
  const cBanda = cElev * 2.5;
  const costoEstElev = promedio(tec.costoEstacionMusd.elevada);
  const premioEstacionSub = promedio(tec.costoEstacionMusd.subterranea) - costoEstElev;
  const medioAnden = tec.andenM / 2 + 10;

  // Nodos gruesos
  const K = Math.max(1, Math.ceil(L / DS_DP));
  const sk = new Float64Array(K + 1);
  for (let k = 0; k <= K; k++) sk[k] = Math.min(L, k * DS_DP);
  const gMax = new Float64Array(K + 1).fill(-Infinity);
  const gMin = new Float64Array(K + 1).fill(Infinity);
  const gSum = new Float64Array(K + 1);
  const gCnt = new Float64Array(K + 1);
  for (let i = 0; i < n; i++) {
    const kc = Math.round(s[i] / DS_DP);
    for (const k of [kc - 1, kc, kc + 1]) {
      if (k < 0 || k > K) continue;
      if (Math.abs(s[i] - sk[k]) <= DS_DP / 2 + 1e-6) {
        gMax[k] = Math.max(gMax[k], terreno[i]);
        gMin[k] = Math.min(gMin[k], terreno[i]);
        gSum[k] += terreno[i];
        gCnt[k]++;
      }
    }
  }
  for (let k = 0; k <= K; k++) {
    if (gCnt[k] === 0) {
      const i = Math.min(n - 1, Math.round(sk[k] / (s[1] - s[0] || 10)));
      gMax[k] = gMin[k] = gSum[k] = terreno[i];
      gCnt[k] = 1;
    }
  }

  // Zonas de estación y restricciones por nodo
  const zona = new Int32Array(K + 1).fill(-1);
  const nodosZona: number[] = e.estacionesS.map(() => 0);
  e.estacionesS.forEach((se, zi) => {
    for (let k = 0; k <= K; k++) {
      if (Math.abs(sk[k] - se) <= medioAnden) {
        zona[k] = zi;
        nodosZona[zi]++;
      }
    }
  });
  const tipoForzado: (TipoEstructura | null)[] = new Array(K + 1).fill(null);
  for (const r of e.restricciones) {
    for (let k = 0; k <= K; k++) if (sk[k] >= r.s0 && sk[k] <= r.s1) tipoForzado[k] = r.tipo;
  }

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let k = 0; k <= K; k++) {
    zMin = Math.min(zMin, gMin[k]);
    zMax = Math.max(zMax, gMax[k]);
  }
  zMin -= 45;
  zMax += 70;
  const dz = Math.max(DZ, (zMax - zMin) / 2600);
  const NL = Math.ceil((zMax - zMin) / dz) + 1;

  const costoNodo = (k: number, l: number): number => {
    const z = zMin + l * dz;
    const he = z - gMax[k];
    const ht = z - gMin[k];
    const hm = z - gSum[k] / gCnt[k];
    let tipo: TipoEstructura;
    let c: number;
    if (he >= hmin) {
      tipo = 'elevado';
      c = cElev * (1 + 0.012 * (hm - hmin) + 0.03 * Math.max(0, hm - 35) + 0.08 * Math.max(0, hm - 60));
    } else if (ht <= -COBERTURA_TUNEL) {
      if (!e.permitirTunel && tipoForzado[k] !== 'tunel') return Infinity;
      tipo = 'tunel';
      c = cTun * (1 + 0.003 * Math.max(0, -ht - 25));
    } else {
      tipo = 'superficie';
      c = cBanda;
      if (tipoForzado[k] === 'superficie') c = promedio(tec.costoMusdKm.superficie);
    }
    const f = tipoForzado[k];
    if (f && f !== tipo) return Infinity;
    // Longitud representada por el nodo (km)
    const largo = ((k === 0 ? 0 : (sk[k] - sk[k - 1]) / 2) + (k === K ? 0 : (sk[k + 1] - sk[k]) / 2)) / 1000;
    let costo = c * largo;
    if (zona[k] >= 0) {
      const nz = Math.max(1, nodosZona[zona[k]]);
      if (tipo === 'tunel') costo += premioEstacionSub / nz;
      // Estaciones muy altas: más estructura, escaleras y elevadores
      else if (tipo === 'elevado') costo += (costoEstElev * 0.03 * Math.max(0, hm - 18)) / nz;
    }
    return costo;
  };

  // Programación dinámica
  let D = new Float64Array(NL);
  for (let l = 0; l < NL; l++) D[l] = costoNodo(0, l);
  const atras: Int16Array[] = [];
  for (let k = 1; k <= K; k++) {
    const paso = sk[k] - sk[k - 1];
    const plano = zona[k] >= 0 && zona[k] === zona[k - 1];
    const m = plano ? 0 : Math.floor((tec.pendienteMax * paso) / dz + 1e-9);
    const Dn = new Float64Array(NL).fill(Infinity);
    const bp = new Int16Array(NL);
    for (let l = 0; l < NL; l++) {
      const cn = costoNodo(k, l);
      if (cn === Infinity) continue;
      let best = Infinity;
      let bd = 0;
      const lo = Math.max(0, l - m);
      const hi = Math.min(NL - 1, l + m);
      for (let lp = lo; lp <= hi; lp++) {
        const v = D[lp];
        if (v < best || (v === best && Math.abs(lp - l) < Math.abs(bd))) {
          best = v;
          bd = lp - l;
        }
      }
      if (best === Infinity) continue;
      Dn[l] = best + cn;
      bp[l] = bd;
    }
    atras.push(bp);
    D = Dn;
  }
  let lFin = 0;
  for (let l = 1; l < NL; l++) if (D[l] < D[lFin]) lFin = l;
  const zNodo = new Float64Array(K + 1);
  let l = lFin;
  zNodo[K] = zMin + l * dz;
  for (let k = K; k >= 1; k--) {
    l = l + atras[k - 1][l];
    zNodo[k - 1] = zMin + l * dz;
  }
  if (!Number.isFinite(D[lFin])) {
    // Sin solución factible (restricciones contradictorias): fallback elevado simple
    for (let k = 0; k <= K; k++) zNodo[k] = gMax[k] + hmin;
  }

  // Interpolar a muestras finas
  const via = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const kf = Math.min(K - 1e-9, s[i] / DS_DP);
    const k0 = Math.floor(kf);
    const k1 = Math.min(K, k0 + 1);
    const f = sk[k1] > sk[k0] ? (s[i] - sk[k0]) / (sk[k1] - sk[k0]) : 0;
    via[i] = zNodo[k0] + (zNodo[k1] - zNodo[k0]) * f;
  }

  // Suavizado (curvas verticales aproximadas) + garantías finas
  const ds = n > 1 ? s[1] - s[0] : 10;
  const ventana = Math.max(1, Math.round(60 / ds));
  const suav = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let cnt = 0;
    for (let j = i - ventana; j <= i + ventana; j++) {
      if (j < 0 || j >= n) continue;
      acc += via[j];
      cnt++;
    }
    suav[i] = acc / cnt;
  }
  const elevadoOriginal = new Uint8Array(n);
  for (let i = 0; i < n; i++) elevadoOriginal[i] = via[i] - terreno[i] >= hmin - 1.5 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    via[i] = suav[i];
    if (elevadoOriginal[i]) via[i] = Math.max(via[i], terreno[i] + hmin);
  }
  // Estaciones a nivel: tomar el máximo de la zona
  const limite = new Float32Array(n).fill(tec.pendienteMax);
  for (const se of e.estacionesS) {
    let mx = -Infinity;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (Math.abs(s[i] - se) <= tec.andenM / 2) {
        idx.push(i);
        mx = Math.max(mx, via[i]);
      }
    }
    for (const i of idx) {
      via[i] = mx;
      limite[i] = 0.002;
    }
  }
  // Cotas mínimas que respetan pendiente (dos pasadas)
  for (let i = 1; i < n; i++) via[i] = Math.max(via[i], via[i - 1] - limite[i] * (s[i] - s[i - 1]));
  for (let i = n - 2; i >= 0; i--) via[i] = Math.max(via[i], via[i + 1] - limite[i + 1] * (s[i + 1] - s[i]));

  return resumir(tec, s, terreno, via);
}

function resumir(tec: Tecnologia, s: Float64Array, terreno: Float32Array, via: Float32Array, torres?: number[]): Perfil {
  const n = s.length;
  const estructura: TipoEstructura[] = new Array(n);
  const altura = new Float32Array(n);
  const pendiente = new Float32Array(n);
  let longElevado = 0;
  let longTunel = 0;
  let longSuperficie = 0;
  let alturaMax = 0;
  let sAlturaMax = 0;
  for (let i = 0; i < n; i++) {
    const h = via[i] - terreno[i];
    altura[i] = h;
    estructura[i] = tec.esCable || h >= tec.alturaMinViaM - 1.5 ? 'elevado' : h <= -8 ? 'tunel' : 'superficie';
    const largo = i === 0 ? 0 : s[i] - s[i - 1];
    if (estructura[i] === 'elevado') longElevado += largo;
    else if (estructura[i] === 'tunel') longTunel += largo;
    else longSuperficie += largo;
    if (estructura[i] === 'elevado' && h > alturaMax) {
      alturaMax = h;
      sAlturaMax = s[i];
    }
  }
  let pendienteMax = 0;
  let sPendienteMax = 0;
  const w = 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n - 1, i + w);
    const p = s[b] > s[a] ? (via[b] - via[a]) / (s[b] - s[a]) : 0;
    pendiente[i] = p;
    if (!tec.esCable && Math.abs(p) > Math.abs(pendienteMax)) {
      pendienteMax = p;
      sPendienteMax = s[i];
    }
  }
  const numPilas = torres ? torres.length : Math.round(longElevado / tec.claroM);
  return {
    via,
    estructura,
    pendiente,
    altura,
    torres,
    resumen: {
      pendienteMax: Math.abs(pendienteMax),
      sPendienteMax,
      alturaMax,
      sAlturaMax,
      longElevado,
      longTunel,
      longSuperficie,
      numPilas,
    },
  };
}

/**
 * Teleférico: torres cada `claroM` como máximo; el cable va recto entre torres.
 * Si el terreno intermedio invade el gálibo, se agrega una torre en el peor punto.
 */
function perfilCable(e: EntradaPerfil): Perfil {
  const { tec, s, terreno } = e;
  const n = s.length;
  const hTorre = tec.alturaMinViaM;
  const galibo = 10;
  const idx = new Set<number>([0, n - 1]);
  const ds = n > 1 ? s[1] - s[0] : 10;
  for (const se of e.estacionesS) idx.add(Math.min(n - 1, Math.max(0, Math.round(se / ds))));
  let torres = [...idx].sort((a, b) => a - b);
  // Dividir claros largos
  const divididas: number[] = [torres[0]];
  for (let t = 1; t < torres.length; t++) {
    const a = torres[t - 1];
    const b = torres[t];
    const partes = Math.ceil((s[b] - s[a]) / tec.claroM);
    for (let p = 1; p < partes; p++) divididas.push(Math.round(a + ((b - a) * p) / partes));
    divididas.push(b);
  }
  torres = divididas;
  const cota = (i: number) => terreno[i] + hTorre;
  for (let iter = 0; iter < 400; iter++) {
    let peor = -1;
    let peorDef = 0;
    for (let t = 1; t < torres.length; t++) {
      const a = torres[t - 1];
      const b = torres[t];
      for (let i = a + 1; i < b; i++) {
        const f = (s[i] - s[a]) / (s[b] - s[a]);
        const z = cota(a) + (cota(b) - cota(a)) * f;
        const def = terreno[i] + galibo - z;
        if (def > peorDef) {
          peorDef = def;
          peor = i;
        }
      }
    }
    if (peor < 0) break;
    torres.push(peor);
    torres.sort((a, b) => a - b);
  }
  const via = new Float32Array(n);
  for (let t = 1; t < torres.length; t++) {
    const a = torres[t - 1];
    const b = torres[t];
    for (let i = a; i <= b; i++) {
      const f = s[b] > s[a] ? (s[i] - s[a]) / (s[b] - s[a]) : 0;
      via[i] = cota(a) + (cota(b) - cota(a)) * f;
    }
  }
  return resumir(tec, s, terreno, via, torres.map((i) => s[i]));
}
