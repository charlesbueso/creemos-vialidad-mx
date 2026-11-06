import assert from 'node:assert/strict';
import { test } from 'node:test';
import { construirAlineamiento, proyectar } from './alineamiento';
import { makeFrame, toLngLat, type LngLat } from './geo';
import { calcularPerfil } from './perfil';
import { simularMarcha } from './simulacion';
import { TECNOLOGIAS } from './tecnologias';

const frame = makeFrame([-99.2, 19.4]);
const ll = (x: number, y: number): LngLat => toLngLat(frame, x, y);

test('una recta mide lo que debe', () => {
  const al = construirAlineamiento([ll(0, 0), ll(3000, 0)], 500);
  assert.ok(Math.abs(al.longitud - 3000) < 2, `longitud ${al.longitud}`);
  assert.equal(al.curvas.length, 0);
});

test('una esquina de 90° se vuelve curva circular tangente con el radio pedido', () => {
  const al = construirAlineamiento([ll(0, 0), ll(2000, 0), ll(2000, 2000)], 400);
  assert.equal(al.curvas.length, 1);
  assert.ok(Math.abs(al.curvas[0].radio - 400) < 1);
  // Longitud = 2·(2000 − 400) + π·400/2
  const esperado = 2 * 1600 + (Math.PI * 400) / 2;
  assert.ok(Math.abs(al.longitud - esperado) < 2, `${al.longitud} vs ${esperado}`);
  // Continuidad: ningún salto entre muestras mayor al paso
  for (let i = 1; i < al.muestras.length; i++) {
    const a = al.muestras[i - 1];
    const b = al.muestras[i];
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) <= al.ds + 0.01);
  }
});

test('si no cabe el radio, se usa el más amplio posible', () => {
  const al = construirAlineamiento([ll(0, 0), ll(200, 0), ll(200, 200)], 1000);
  assert.equal(al.curvas.length, 1);
  assert.ok(al.curvas[0].radio < 200 && al.curvas[0].radio > 150, `radio ${al.curvas[0].radio}`);
});

test('proyectar encuentra el cadenamiento y la distancia lateral', () => {
  const al = construirAlineamiento([ll(0, 0), ll(3000, 0)], 500);
  const p = proyectar(al, ll(1200, 35));
  assert.ok(Math.abs(p.s - 1200) < 1);
  assert.ok(Math.abs(p.distancia - 35) < 1);
});

function malla(L: number, ds = 10) {
  const n = Math.round(L / ds) + 1;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = i * ds;
  return s;
}

test('terreno plano: viaducto a la altura mínima', () => {
  const tec = TECNOLOGIAS.monorriel;
  const s = malla(3000);
  const terreno = new Float32Array(s.length).fill(2240);
  const p = calcularPerfil({ tec, s, terreno, permitirTunel: true, estacionesS: [], restricciones: [] });
  for (let i = 0; i < s.length; i++) {
    assert.ok(Math.abs(p.via[i] - (2240 + tec.alturaMinViaM)) < 0.6, `via ${p.via[i]} en ${s[i]}`);
    assert.equal(p.estructura[i], 'elevado');
  }
});

test('nunca excede la pendiente máxima, aun con lomas abruptas', () => {
  const tec = TECNOLOGIAS['metro-elevado'];
  const s = malla(6000);
  const terreno = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) terreno[i] = 2300 + 60 * Math.sin(s[i] / 400) + (s[i] > 3000 ? 80 : 0);
  const p = calcularPerfil({ tec, s, terreno, permitirTunel: true, estacionesS: [1500, 4500], restricciones: [] });
  for (let i = 1; i < s.length; i++) {
    const g = Math.abs(p.via[i] - p.via[i - 1]) / (s[i] - s[i - 1]);
    assert.ok(g <= tec.pendienteMax + 1e-3, `pendiente ${g} en ${s[i]}`);
  }
  // Estaciones a nivel
  for (const se of [1500, 4500]) {
    const i0 = Math.round((se - 40) / 10);
    const i1 = Math.round((se + 40) / 10);
    assert.ok(Math.abs(p.via[i1] - p.via[i0]) < 0.5);
  }
});

test('restricción de túnel se respeta', () => {
  const tec = TECNOLOGIAS.monorriel;
  const s = malla(5000);
  const terreno = new Float32Array(s.length).fill(2300);
  const p = calcularPerfil({
    tec,
    s,
    terreno,
    permitirTunel: true,
    estacionesS: [],
    restricciones: [{ s0: 2000, s1: 3000, tipo: 'tunel' }],
  });
  for (let i = 0; i < s.length; i++) if (s[i] >= 2050 && s[i] <= 2950) assert.equal(p.estructura[i], 'tunel', `en ${s[i]}`);
});

test('marcha: 2 km en recta con velocidad tope coincide con la cinemática', () => {
  const tec = { ...TECNOLOGIAS.monorriel, aceleracion: 1, frenado: 1 };
  const s = malla(2000);
  const radio = new Float64Array(s.length).fill(Infinity);
  const pendiente = new Float32Array(s.length);
  const m = simularMarcha({ tec, vMaxKmh: 72, s, radio, pendiente, paradas: [0, 2000] });
  // Sin potencia constante sería 2000/20 + 20 = 120 s; la tracción decreciente lo hace algo mayor
  assert.ok(m.tiempoTotal > 118 && m.tiempoTotal < 140, `t = ${m.tiempoTotal}`);
  assert.ok(Math.abs(m.vMaxAlcanzadaKmh - 72) < 0.5);
});

test('marcha: las paradas intermedias suman permanencia', () => {
  const tec = TECNOLOGIAS.monorriel;
  const s = malla(4000);
  const radio = new Float64Array(s.length).fill(Infinity);
  const pendiente = new Float32Array(s.length);
  const directo = simularMarcha({ tec, vMaxKmh: 80, s, radio, pendiente, paradas: [0, 4000] });
  const conParada = simularMarcha({ tec, vMaxKmh: 80, s, radio, pendiente, paradas: [0, 2000, 4000] });
  assert.ok(conParada.tiempoTotal - directo.tiempoTotal > tec.permanenciaS);
});
