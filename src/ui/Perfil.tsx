import { useEffect, useMemo, useRef, useState } from 'react';
import { formatoMin, type Analisis } from '../engine/analisis';
import { indiceCercano, posicionEnTiempo } from '../engine/simulacion';
import { useEstado } from '../state/store';
import { colorOscuro, NEUTRO } from './paleta';

const M = { izq: 66, der: 14, arriba: 30, medio: 18, abajo: 20 };

function ticks(min: number, max: number, objetivo: number): number[] {
  const rango = max - min || 1;
  const paso0 = rango / objetivo;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= paso0) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) out.push(+v.toFixed(6));
  return out;
}

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });

export function Perfil({ a, color, servicio }: { a: Analisis; color: string; servicio: 'local' | 'expres' }) {
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 800, h: 180 });
  const [hover, setHover] = useState<number | null>(null);
  const setCursor = useEstado((s) => s.setCursor);
  const sim = useEstado((s) => s.sim);
  const c = colorOscuro(color);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: Math.max(320, e.contentRect.width), h: Math.max(120, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marcha = servicio === 'expres' && a.expres ? a.expres : a.local;
  const g = useMemo(() => {
    const { w, h } = tam;
    const n = a.s.length;
    const L = a.alineamiento.longitud || 1;
    const altoUtil = h - M.arriba - M.medio - M.abajo;
    const hElev = altoUtil * 0.62;
    const hVel = altoUtil - hElev;
    const y0Elev = M.arriba;
    const y0Vel = M.arriba + hElev + M.medio;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < n; i++) {
      zMin = Math.min(zMin, a.terreno[i], a.perfil.via[i]);
      zMax = Math.max(zMax, a.terreno[i], a.perfil.via[i]);
    }
    const tz = ticks(zMin - 8, zMax + 8, 4);
    const zLo = Math.min(tz[0], zMin - 8);
    const zHi = Math.max(tz[tz.length - 1], zMax + 8);
    const vTope = Math.max(...Array.from(marcha.vLimite)) * 3.6;
    const tv = ticks(0, vTope, 2);
    const vHi = Math.max(tv[tv.length - 1], vTope * 1.05);
    const X = (s: number) => M.izq + (s / L) * (w - M.izq - M.der);
    const YE = (z: number) => y0Elev + hElev - ((z - zLo) / (zHi - zLo)) * hElev;
    const YV = (v: number) => y0Vel + hVel - (v / vHi) * hVel;
    const paso = Math.max(1, Math.floor(n / (w - M.izq - M.der)));
    const idx: number[] = [];
    for (let i = 0; i < n; i += paso) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    const linea = (f: (i: number) => [number, number]) => idx.map((i, k) => `${k ? 'L' : 'M'}${f(i)[0].toFixed(1)},${f(i)[1].toFixed(1)}`).join('');
    const terreno = linea((i) => [X(a.s[i]), YE(a.terreno[i])]);
    const terrenoArea = `${terreno}L${X(L).toFixed(1)},${(y0Elev + hElev).toFixed(1)}L${X(0).toFixed(1)},${(y0Elev + hElev).toFixed(1)}Z`;
    // Vía: tramos visibles y en túnel por separado
    const tramos: { d: string; tunel: boolean }[] = [];
    let actual: number[] = [];
    let tunel = a.perfil.estructura[0] === 'tunel';
    for (const i of idx) {
      const t = a.perfil.estructura[i] === 'tunel';
      if (t !== tunel && actual.length) {
        actual.push(i);
        tramos.push({ d: actual.map((j, k) => `${k ? 'L' : 'M'}${X(a.s[j]).toFixed(1)},${YE(a.perfil.via[j]).toFixed(1)}`).join(''), tunel });
        actual = [];
        tunel = t;
      }
      actual.push(i);
    }
    if (actual.length > 1)
      tramos.push({ d: actual.map((j, k) => `${k ? 'L' : 'M'}${X(a.s[j]).toFixed(1)},${YE(a.perfil.via[j]).toFixed(1)}`).join(''), tunel });
    // Pilas (muestra representativa)
    const sepPilas = Math.max(a.tec.claroM, L / 140);
    const pilas: string[] = [];
    for (let s = sepPilas / 2; s < L; s += sepPilas) {
      const i = indiceCercano(a.s, s);
      if (a.perfil.estructura[i] !== 'elevado' || a.perfil.altura[i] < 3) continue;
      pilas.push(`M${X(a.s[i]).toFixed(1)},${YE(a.perfil.via[i]).toFixed(1)}V${YE(a.terreno[i]).toFixed(1)}`);
    }
    const vel = linea((i) => [X(a.s[i]), YV(marcha.v[i] * 3.6)]);
    const velArea = `${vel}L${X(L).toFixed(1)},${YV(0).toFixed(1)}L${X(0).toFixed(1)},${YV(0).toFixed(1)}Z`;
    const lim = linea((i) => [X(a.s[i]), YV(marcha.vLimite[i] * 3.6)]);
    // Etiquetas de estación sin choques: dos renglones; si no caben, la tabla las tiene todas
    const etiquetas: { x: number; texto: string; y: number }[] = [];
    const finRenglon = [-Infinity, -Infinity];
    for (const e of a.estaciones) {
      const x = X(e.s);
      const ancho = e.nombre.length * 5.7;
      const x0 = Math.min(Math.max(x - ancho / 2, 2), w - M.der - ancho);
      const r = finRenglon.findIndex((f) => x0 > f + 8);
      if (r >= 0) {
        etiquetas.push({ x: x0 + ancho / 2, texto: e.nombre, y: r === 0 ? M.arriba - 19 : M.arriba - 7 });
        finRenglon[r] = x0 + ancho;
      }
    }
    const kmTicks = ticks(0, L / 1000, Math.max(3, Math.floor((w - 60) / 90)));
    const tMax = a.perfil.resumen.alturaMax;
    const iMax = indiceCercano(a.s, a.perfil.resumen.sAlturaMax);
    return {
      w, h, X, YE, YV, terreno, terrenoArea, tramos, pilas, vel, velArea, lim, etiquetas, tz, tv, zLo, zHi, kmTicks,
      y0Elev, hElev, y0Vel, hVel, L, alturaMax: tMax > 15 ? { x: X(a.s[iMax]), y: YE(a.perfil.via[iMax]), t: Math.round(tMax) } : null,
    };
  }, [a, tam, marcha]);

  const seleccionar = (s: number | null) => {
    setHover(s);
    setCursor(s);
  };
  const alMover = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = ev.clientX - r.left;
    const s = ((x - M.izq) / (g.w - M.izq - M.der)) * g.L;
    seleccionar(Math.min(g.L, Math.max(0, s)));
  };
  const alTecla = (ev: React.KeyboardEvent) => {
    const paso = ev.shiftKey ? 1000 : 100;
    if (ev.key === 'ArrowRight') seleccionar(Math.min(g.L, (hover ?? 0) + paso));
    else if (ev.key === 'ArrowLeft') seleccionar(Math.max(0, (hover ?? 0) - paso));
    else if (ev.key === 'Escape') seleccionar(null);
    else return;
    ev.preventDefault();
  };

  const i = hover !== null ? indiceCercano(a.s, hover) : -1;
  const sTren = sim.activa ? posicionEnTiempo(marcha, sim.t) : null;
  const iTren = sTren !== null ? indiceCercano(a.s, sTren) : -1;

  return (
    <div ref={caja} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      <svg
        className="perfil-svg"
        width={g.w}
        height={g.h}
        viewBox={`0 0 ${g.w} ${g.h}`}
        onPointerMove={alMover}
        onPointerLeave={() => seleccionar(null)}
        onKeyDown={alTecla}
        onFocus={() => hover === null && seleccionar(0)}
        onBlur={() => seleccionar(null)}
        tabIndex={0}
        role="img"
        aria-label={`Perfil de ${(g.L / 1000).toFixed(1)} km: altura de vía y terreno, y velocidad. Usa las flechas para recorrerlo.`}
      >
        {/* Rejilla y ejes */}
        {g.tz.map((z, k) => (
          <g key={`z${z}`}>
            <line x1={M.izq} x2={g.w - M.der} y1={g.YE(z)} y2={g.YE(z)} stroke={NEUTRO.rejilla} strokeWidth={1} />
            <text x={M.izq - 6} y={g.YE(z) + 3.5} textAnchor="end">
              {fmt(z)}
              {k === g.tz.length - 1 ? ' m' : ''}
            </text>
          </g>
        ))}
        {g.tv.map((v, k) => (
          <g key={`v${v}`}>
            <line x1={M.izq} x2={g.w - M.der} y1={g.YV(v)} y2={g.YV(v)} stroke={NEUTRO.rejilla} strokeWidth={1} />
            <text x={M.izq - 6} y={g.YV(v) + 3.5} textAnchor="end">
              {fmt(v)}
              {k === g.tv.length - 1 ? ' km/h' : ''}
            </text>
          </g>
        ))}
        {g.kmTicks.map((k) => (
          <text key={`k${k}`} x={g.X(k * 1000)} y={g.h - 5} textAnchor="middle">
            {k === 0 ? '0 km' : k.toLocaleString('es-MX')}
          </text>
        ))}

        {/* Elevación */}
        <path d={g.terrenoArea} fill={NEUTRO.terreno} fillOpacity={0.16} />
        <path d={g.pilas.join('')} stroke={NEUTRO.terreno} strokeOpacity={0.45} strokeWidth={1} />
        <path d={g.terreno} fill="none" stroke={NEUTRO.terreno} strokeWidth={2} strokeLinejoin="round" />
        {g.tramos.map((t, k) => (
          <path key={k} d={t.d} fill="none" stroke={c} strokeWidth={2} strokeOpacity={t.tunel ? 0.45 : 1} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {a.estaciones.map((e) => (
          <circle key={e.id} cx={g.X(e.s)} cy={g.YE(e.cotaVia)} r={4} fill={c} stroke="var(--surface-1)" strokeWidth={2} />
        ))}
        {g.etiquetas.map((e) => (
          <text key={e.texto + e.x} className="et-est" x={e.x} y={e.y} textAnchor="middle">
            {e.texto}
          </text>
        ))}
        {g.alturaMax && (
          <text x={g.alturaMax.x + 6} y={g.alturaMax.y - 6} style={{ fill: 'var(--text-secondary)' }}>
            viaducto de {g.alturaMax.t} m
          </text>
        )}

        {/* Velocidad */}
        <path d={g.lim} fill="none" stroke={NEUTRO.limite} strokeWidth={2} strokeOpacity={0.8} strokeLinejoin="round" />
        <path d={g.velArea} fill={c} fillOpacity={0.1} />
        <path d={g.vel} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />

        {/* Tren */}
        {iTren >= 0 && (
          <g>
            <circle cx={g.X(a.s[iTren])} cy={g.YE(a.perfil.via[iTren])} r={5} fill="#fff" stroke={c} strokeWidth={3} />
            <circle cx={g.X(a.s[iTren])} cy={g.YV(marcha.v[iTren] * 3.6)} r={5} fill="#fff" stroke={c} strokeWidth={3} />
          </g>
        )}

        {/* Mira */}
        {i >= 0 && (
          <g pointerEvents="none">
            <line x1={g.X(a.s[i])} x2={g.X(a.s[i])} y1={M.arriba - 2} y2={g.h - M.abajo} stroke="var(--text-muted)" strokeWidth={1} />
            <circle cx={g.X(a.s[i])} cy={g.YE(a.perfil.via[i])} r={4} fill={c} stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={g.X(a.s[i])} cy={g.YE(a.terreno[i])} r={4} fill={NEUTRO.terreno} stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={g.X(a.s[i])} cy={g.YV(marcha.v[i] * 3.6)} r={4} fill={c} stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {i >= 0 && <Tooltip a={a} i={i} x={g.X(a.s[i])} ancho={g.w} color={c} marcha={marcha} />}
    </div>
  );
}

function Tooltip({ a, i, x, ancho, color, marcha }: { a: Analisis; i: number; x: number; ancho: number; color: string; marcha: Analisis['local'] }) {
  const h = a.perfil.altura[i];
  const tipo = a.perfil.estructura[i];
  const izquierda = x > ancho - 210;
  const estructura = tipo === 'elevado' ? `viaducto, ${Math.round(h)} m sobre el suelo` : tipo === 'tunel' ? `túnel, ${Math.round(-h)} m bajo el suelo` : 'rampa / a nivel';
  return (
    <div className="tooltip" style={{ left: izquierda ? x - 196 : x + 14, top: 8 }}>
      <div className="tt-titulo">
        km {(a.s[i] / 1000).toFixed(2)} · {estructura}
      </div>
      <div className="tt-fila">
        <i style={{ background: color }} />
        <span>Vía</span>
        <b>{fmt(a.perfil.via[i])} m</b>
      </div>
      <div className="tt-fila">
        <i style={{ background: NEUTRO.terreno }} />
        <span>Terreno</span>
        <b>{fmt(a.terreno[i])} m</b>
      </div>
      <div className="tt-fila">
        <i style={{ background: 'transparent' }} />
        <span>Pendiente</span>
        <b>{(a.perfil.pendiente[i] * 100).toFixed(1)} %</b>
      </div>
      <div className="tt-fila">
        <i style={{ background: color }} />
        <span>Velocidad</span>
        <b>{Math.round(marcha.v[i] * 3.6)} km/h</b>
      </div>
      <div className="tt-fila">
        <i style={{ background: NEUTRO.limite }} />
        <span>Límite</span>
        <b>{Math.round(marcha.vLimite[i] * 3.6)} km/h</b>
      </div>
      <div className="tt-fila">
        <i style={{ background: 'transparent' }} />
        <span>Tiempo desde el origen</span>
        <b>{formatoMin(marcha.t[i])}</b>
      </div>
    </div>
  );
}
