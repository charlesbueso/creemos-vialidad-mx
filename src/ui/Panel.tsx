import { useRef } from 'react';
import { formatoMin, type Analisis, type Aviso } from '../engine/analisis';
import { LISTA_TECNOLOGIAS, TECNOLOGIAS, type TecnologiaId } from '../engine/tecnologias';
import type { Propuesta, Restriccion, TipoEstructura } from '../engine/tipos';
import { analisisSeleccionado, propuestaSeleccionada, useEstado } from '../state/store';
import { Icono, Logo } from './iconos';
import { colorOscuro, PALETA } from './paleta';

export interface AccionesMapa {
  vistaGeneral: () => void;
  simular: () => void;
  sobrevolar: () => void;
  irA: (s: number) => void;
}

const km = (m: number, d = 1) => (m / 1000).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const minutos = (s: number) => (s / 60).toLocaleString('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const miles = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
const musd = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} mil M` : `${miles(n)} M`);

export function Panel({ acciones }: { acciones: AccionesMapa }) {
  const propuestas = useEstado((s) => s.propuestas);
  const analisis = useEstado((s) => s.analisis);
  const seleccion = useEstado((s) => s.seleccion);
  const seleccionar = useEstado((s) => s.seleccionar);
  const nueva = useEstado((s) => s.nueva);
  const importar = useEstado((s) => s.importar);
  const restaurar = useEstado((s) => s.restaurarEjemplos);
  const notificar = useEstado((s) => s.notificar);
  const archivo = useRef<HTMLInputElement>(null);

  const alImportar = async (f: File | undefined) => {
    if (!f) return;
    try {
      const p = JSON.parse(await f.text()) as Propuesta;
      if (!p.id || !Array.isArray(p.trazo) || !Array.isArray(p.estaciones)) throw new Error('Formato inválido');
      if (!TECNOLOGIAS[p.tecnologia]) p.tecnologia = 'monorriel';
      importar(p);
      notificar(`Importada: ${p.nombre}`);
    } catch (e) {
      notificar(`No se pudo importar: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <aside className="panel vidrio" aria-label="Propuestas">
      <header className="panel-cabeza">
        <Logo />
        <div className="marca">
          <h1>Creemos Vialidad MX</h1>
          <p>Laboratorio 3D de transporte para el Valle de México</p>
        </div>
      </header>
      <div className="panel-cuerpo">
        <section className="seccion">
          <h2>
            Propuestas
            <span className="fila-botones">
              <button className="boton mini" onClick={nueva} title="Trazar una línea nueva">
                <Icono.mas /> Nueva
              </button>
              <button className="boton mini" onClick={() => archivo.current?.click()} title="Importar un archivo .json">
                <Icono.subir /> Importar
              </button>
              <input ref={archivo} type="file" accept=".json,application/json" hidden onChange={(e) => alImportar(e.target.files?.[0])} />
            </span>
          </h2>
          <div className="lista">
            {propuestas.map((p) => {
              const a = analisis[p.id];
              return (
                <button key={p.id} className="tarjeta" aria-pressed={p.id === seleccion} onClick={() => seleccionar(p.id)}>
                  <span className="franja" style={{ background: colorOscuro(p.color) }} />
                  <span>
                    <div className="t-nombre">{p.nombre}</div>
                    <div className="t-meta">
                      {TECNOLOGIAS[p.tecnologia]?.nombre ?? p.tecnologia}
                      {a ? ` · ${km(a.alineamiento.longitud)} km · ${a.estaciones.length} est.` : p.trazo.length < 2 ? ' · sin trazo' : ' · calculando…'}
                    </div>
                  </span>
                  <span className="t-tiempo">
                    {a ? (
                      <>
                        {minutos((a.expres ?? a.local).tiempoTotal)} <small>min</small>
                      </>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {propuestas.length === 0 && (
            <p className="descripcion">
              No hay propuestas.{' '}
              <button className="boton mini" onClick={restaurar}>
                Restaurar ejemplos
              </button>
            </p>
          )}
        </section>
        <Detalle acciones={acciones} />
        <section className="seccion">
          <p className="descripcion" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Cifras de orden de magnitud para comparar ideas, no ingeniería de detalle. Terreno SRTM ~30 m; red actual ©
            OpenStreetMap. Las propuestas viven en tu navegador y en <code>src/data/propuestas/*.json</code>.{' '}
            <button className="boton mini" onClick={restaurar} style={{ marginTop: 6 }}>
              Restaurar ejemplos
            </button>
          </p>
        </section>
      </div>
    </aside>
  );
}

function Detalle({ acciones }: { acciones: AccionesMapa }) {
  const p = useEstado(propuestaSeleccionada);
  const a = useEstado(analisisSeleccionado);
  const meta = useEstado((s) => (s.seleccion ? s.meta[s.seleccion] : undefined));
  const error = useEstado((s) => (s.seleccion ? s.errores[s.seleccion] : undefined));
  const actualizar = useEstado((s) => s.actualizar);
  const editando = useEstado((s) => s.editando);
  const setEditando = useEstado((s) => s.setEditando);
  const duplicar = useEstado((s) => s.duplicar);
  const eliminar = useEstado((s) => s.eliminar);
  const usarVersionArchivo = useEstado((s) => s.usarVersionArchivo);
  if (!p) return null;
  const tec = TECNOLOGIAS[p.tecnologia] ?? TECNOLOGIAS.monorriel;
  const cambiar = (c: Partial<Propuesta>) => actualizar(p.id, c);

  const exportar = () => {
    const blob = new Blob([JSON.stringify(p, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${p.id}.json`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <section className="seccion">
        <input className="titulo-editable" value={p.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} aria-label="Nombre de la propuesta" />
        {p.descripcion && <p className="descripcion">{p.descripcion}</p>}
        {meta?.versionArchivo && (
          <p className="descripcion" style={{ color: 'var(--text-primary)' }}>
            El archivo de esta propuesta cambió.{' '}
            <button className="boton mini" onClick={() => usarVersionArchivo(p.id)}>
              Usar versión del archivo
            </button>
          </p>
        )}
        <div className="fila-botones" style={{ marginTop: 12 }}>
          <button className={`boton ${editando ? 'activo' : ''}`} onClick={() => setEditando(!editando)} aria-pressed={editando}>
            <Icono.lapiz /> {editando ? 'Terminar edición' : 'Editar trazo'}
          </button>
          <button className="boton primario" onClick={acciones.simular} disabled={!a}>
            <Icono.play /> Simular viaje
          </button>
          <button className="boton" onClick={acciones.sobrevolar} disabled={!a} title="Recorrido aéreo del trazo">
            <Icono.avion /> Sobrevolar
          </button>
          <button className="boton" onClick={acciones.vistaGeneral} disabled={!a} title="Encuadrar la línea">
            <Icono.ojo /> Encuadrar
          </button>
        </div>
      </section>

      {error && (
        <section className="seccion">
          <ul className="avisos">
            <li className="aviso">
              <Icono.error />
              <span>
                <b>No se pudo calcular:</b> {error}
              </span>
            </li>
          </ul>
        </section>
      )}

      {a ? (
        <Resultados p={p} a={a} irA={acciones.irA} />
      ) : (
        <section className="seccion">
          <p className="descripcion">
            {p.trazo.length < 2
              ? 'Activa "Editar trazo" y haz clic en el mapa para poner al menos dos puntos. Luego cambia a "Estaciones" para ubicarlas.'
              : 'Calculando terreno, perfil y tiempos…'}
          </p>
        </section>
      )}

      <section className="seccion">
        <h2>Tecnología</h2>
        <label className="campo">
          <select value={p.tecnologia} onChange={(e) => cambiar({ tecnologia: e.target.value as TecnologiaId })}>
            {LISTA_TECNOLOGIAS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <p className="tec-resumen">{tec.resumen}</p>
        <p className="tec-ref">Referencia: {tec.referencia}</p>
        <div className="tiles" style={{ marginTop: 10 }}>
          <Tile etiqueta="Vel. máxima" valor={`${p.opciones?.vMaxKmh ?? tec.vMaxKmh}`} unidad="km/h" />
          <Tile etiqueta="Pendiente máx." valor={`${(tec.pendienteMax * 100).toLocaleString('es-MX')}`} unidad="%" />
          <Tile etiqueta="Radio mínimo" valor={tec.radioMin ? miles(tec.radioMin) : '—'} unidad={tec.radioMin ? 'm' : ''} />
          <Tile etiqueta="Capacidad" valor={`${miles(tec.capacidadPphpd[0] / 1000)}–${miles(tec.capacidadPphpd[1] / 1000)} mil`} unidad="pas/h/sentido" />
        </div>
        <div className="campo">
          <span>Color</span>
          <div className="colores">
            {PALETA.map((c) => (
              <button
                key={c.claro}
                className="color-op"
                style={{ background: c.claro }}
                aria-pressed={p.color.toUpperCase() === c.claro}
                aria-label={c.nombre}
                title={c.nombre}
                onClick={() => cambiar({ color: c.claro })}
              />
            ))}
          </div>
        </div>
      </section>

      <Avanzado p={p} />

      <section className="seccion">
        <div className="fila-botones">
          <button className="boton" onClick={exportar} title="Descargar como .json (guárdalo en src/data/propuestas para versionarlo)">
            <Icono.bajar /> Exportar JSON
          </button>
          <button className="boton" onClick={() => duplicar(p.id)}>
            <Icono.copiar /> Duplicar
          </button>
          <button
            className="boton peligro"
            onClick={() => {
              if (confirm(`¿Eliminar "${p.nombre}"? Si es un ejemplo, puedes restaurarlo después.`)) eliminar(p.id);
            }}
          >
            <Icono.basura /> Eliminar
          </button>
        </div>
      </section>
    </>
  );
}

function Resultados({ p, a, irA }: { p: Propuesta; a: Analisis; irA: (s: number) => void }) {
  const r = a.perfil.resumen;
  const c = colorOscuro(p.color);
  const L = a.alineamiento.longitud;
  const comp = p.comparativa ?? {};
  const barras: { et: string; min: number; color: string }[] = [];
  if (a.expres) barras.push({ et: 'Tren exprés', min: a.expres.tiempoTotal / 60, color: c });
  barras.push({ et: a.expres ? 'Tren local' : 'Tren', min: a.local.tiempoTotal / 60, color: c });
  if (comp.autoLibreMin) barras.push({ et: 'Auto sin tráfico', min: comp.autoLibreMin, color: '#5d616b' });
  if (comp.autoPicoMin) barras.push({ et: 'Auto hora pico', min: comp.autoPicoMin, color: '#5d616b' });
  const maxMin = Math.max(...barras.map((b) => b.min));
  const principal = a.expres ?? a.local;
  const ahorro = comp.autoPicoMin ? comp.autoPicoMin - principal.tiempoTotal / 60 : null;
  const estructura = (t: TipoEstructura) => (t === 'elevado' ? 'elevada' : t === 'tunel' ? 'subterránea' : 'a nivel');

  return (
    <>
      <section className="seccion">
        <h2>Tiempo de viaje</h2>
        <div className="heroe">
          <span className="cifra">{minutos(principal.tiempoTotal)}</span>
          <span className="unidad">min {a.expres ? 'en exprés' : 'de punta a punta'}</span>
        </div>
        <p className="heroe-sub">
          {a.estaciones[0]?.nombre ?? 'Inicio'} → {a.estaciones[a.estaciones.length - 1]?.nombre ?? 'Fin'}
          {ahorro !== null && ahorro > 0 ? ` · ${miles(ahorro)} min menos que en auto en hora pico` : ''}
        </p>
        <div className="barras" role="table" aria-label="Comparación de tiempos de viaje">
          {barras.map((b) => (
            <div key={b.et} role="row" style={{ display: 'contents' }}>
              <span className="b-et" role="cell">
                {b.et}
              </span>
              <span className="b-pista" role="cell">
                <span className="b-barra" style={{ width: `${(b.min / maxMin) * 100}%`, background: b.color }} />
              </span>
              <span className="b-val" role="cell">
                {b.min.toLocaleString('es-MX', { maximumFractionDigits: 1 })} min
              </span>
            </div>
          ))}
        </div>
        {comp.fuente && <p className="tec-ref" style={{ marginTop: 8 }}>{comp.fuente}</p>}
      </section>

      <section className="seccion">
        <h2>Ingeniería</h2>
        <div className="tiles">
          <Tile etiqueta="Longitud" valor={km(L, 1)} unidad="km" nota={`${a.estaciones.length} estaciones`} />
          <Tile etiqueta="Velocidad promedio" valor={miles(principal.vPromedioKmh)} unidad="km/h" nota={`máx. ${miles(a.local.vMaxAlcanzadaKmh)} km/h`} />
          {!a.tec.esCable && (
            <Tile
              etiqueta="Pendiente máxima"
              valor={(r.pendienteMax * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })}
              unidad="%"
              nota={`límite ${(a.tec.pendienteMax * 100).toLocaleString('es-MX')} %`}
            />
          )}
          {!a.tec.esCable && (
            <Tile
              etiqueta="Curva más cerrada"
              valor={Number.isFinite(a.radioMinimo) ? miles(a.radioMinimo) : '—'}
              unidad={Number.isFinite(a.radioMinimo) ? 'm' : ''}
              nota={`mínimo ${miles(a.tec.radioMin)} m`}
              estado={a.radioMinimo < a.tec.radioMin ? 'error' : undefined}
            />
          )}
          <Tile
            etiqueta={a.tec.esCable ? 'Cable más alto' : 'Viaducto más alto'}
            valor={miles(r.alturaMax)}
            unidad="m"
            nota={`≈ ${miles(r.alturaMax / 3)} pisos`}
            estado={!a.tec.esCable && r.alturaMax > 40 ? 'aviso' : undefined}
          />
          <Tile
            etiqueta="Estructura"
            valor={`${miles((r.longElevado / L) * 100)} %`}
            unidad={a.tec.esCable ? 'aéreo' : 'elevado'}
            nota={r.longTunel > 0 ? `${km(r.longTunel)} km en túnel` : 'sin túneles'}
          />
          <Tile etiqueta="Costo estimado" valor={`${musd(a.costo.min)}–${musd(a.costo.max)}`} unidad="USD" nota={`≈ ${miles(a.costo.max / (L / 1000))} M USD/km (alto)`} />
          <Tile etiqueta={a.tec.esCable ? 'Torres' : 'Pilas'} valor={miles(r.numPilas)} unidad="" nota={a.tec.esCable ? 'incluye estaciones' : `cada ${a.tec.claroM} m`} />
        </div>
      </section>

      {a.avisos.length > 0 && (
        <section className="seccion">
          <h2>Lo que dice la ingeniería</h2>
          <ul className="avisos">
            {a.avisos.map((v, k) => (
              <AvisoItem key={k} v={v} irA={irA} />
            ))}
          </ul>
        </section>
      )}

      <section className="seccion">
        <h2>Estaciones</h2>
        <Estaciones a={a} color={c} irA={irA} estructura={estructura} />
      </section>
    </>
  );
}

function AvisoItem({ v, irA }: { v: Aviso; irA: (s: number) => void }) {
  const I = v.nivel === 'error' ? Icono.error : v.nivel === 'aviso' ? Icono.aviso : Icono.info;
  const etiqueta = v.nivel === 'error' ? 'Error' : v.nivel === 'aviso' ? 'Aviso' : 'Nota';
  return (
    <li
      className="aviso"
      data-s={v.s !== undefined ? v.s : undefined}
      onClick={() => v.s !== undefined && irA(v.s)}
      title={v.s !== undefined ? 'Ver en el mapa' : undefined}
    >
      <I />
      <span>
        <b>{etiqueta}:</b> {v.texto}
      </span>
    </li>
  );
}

function Estaciones({ a, color, irA, estructura }: { a: Analisis; color: string; irA: (s: number) => void; estructura: (t: TipoEstructura) => string }) {
  const actualizarEstacion = useEstado((s) => s.actualizarEstacion);
  const quitarEstacion = useEstado((s) => s.quitarEstacion);
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th></th>
          <th>Nombre</th>
          <th className="num">km</th>
          <th className="num">Altura</th>
          <th className="num">Llega</th>
          <th title="Para el servicio exprés">Exp.</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {a.estaciones.map((e, k) => {
          const terminal = k === 0 || k === a.estaciones.length - 1;
          return (
            <tr key={e.id}>
              <td>
                <button className="estrella" style={{ color }} onClick={() => irA(e.s)} aria-label={`Ver ${e.nombre} en el mapa`} title="Ver en el mapa">
                  <span className="punto-est" />
                </button>
              </td>
              <td>
                <input className="nombre-est" value={e.nombre} onChange={(ev) => actualizarEstacion(e.id, { nombre: ev.target.value })} aria-label="Nombre de estación" />
                <div style={{ color: 'var(--text-muted)', fontSize: 11, paddingLeft: 5 }}>
                  {estructura(e.estructura)}
                  {e.conexiones.length ? ` · ${e.conexiones.join(', ')}` : ''}
                </div>
              </td>
              <td className="num">{km(e.s, 1)}</td>
              <td className="num">{e.estructura === 'tunel' ? `−${miles(-e.alturaVia)}` : miles(e.alturaVia)} m</td>
              <td className="num">{formatoMin(e.llegadaLocal)}</td>
              <td>
                <button
                  className="estrella"
                  aria-pressed={e.expres}
                  disabled={terminal || a.tec.esCable}
                  onClick={() => actualizarEstacion(e.id, { expres: !e.expres })}
                  title={terminal ? 'Las terminales siempre son parada' : 'Parada del servicio exprés'}
                >
                  {e.expres ? '★' : '☆'}
                </button>
              </td>
              <td>
                <button className="estrella" onClick={() => quitarEstacion(e.id)} aria-label={`Quitar ${e.nombre}`} title="Quitar estación">
                  ×
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Tile({ etiqueta, valor, unidad, nota, estado }: { etiqueta: string; valor: string; unidad: string; nota?: string; estado?: 'error' | 'aviso' }) {
  return (
    <div className="tile">
      <div className="tl">{etiqueta}</div>
      <div className="tv">
        {valor} {unidad && <small>{unidad}</small>}
      </div>
      {estado && (
        <div className="marca-estado">
          {estado === 'error' ? <Icono.error /> : <Icono.aviso />}
          <span>{estado === 'error' ? 'fuera de norma' : 'revisar'}</span>
        </div>
      )}
      {nota && <div className="tn">{nota}</div>}
    </div>
  );
}

function Avanzado({ p }: { p: Propuesta }) {
  const actualizar = useEstado((s) => s.actualizar);
  const op = p.opciones ?? {};
  const setOp = (c: Partial<NonNullable<Propuesta['opciones']>>) => actualizar(p.id, { opciones: { ...op, ...c } });
  const rs = p.restricciones ?? [];
  const setRs = (r: Restriccion[]) => actualizar(p.id, { restricciones: r });
  const comp = p.comparativa ?? {};
  const num = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <section className="seccion">
      <details className="avanzado">
        <summary>Ajustes de diseño y supuestos</summary>
        <label className="casilla">
          <input type="checkbox" checked={op.permitirTunel ?? true} onChange={(e) => setOp({ permitirTunel: e.target.checked })} />
          Permitir túnel donde el viaducto sería demasiado alto
        </label>
        <div className="campos-2">
          <label className="campo">
            <span>Velocidad máx. (km/h)</span>
            <input type="number" min={10} max={200} placeholder={String(TECNOLOGIAS[p.tecnologia]?.vMaxKmh)} value={op.vMaxKmh ?? ''} onChange={(e) => setOp({ vMaxKmh: num(e.target.value) })} />
          </label>
          <label className="campo">
            <span>Radio de diseño (m)</span>
            <input type="number" min={0} max={3000} placeholder="auto" value={op.radioDisenoM ?? ''} onChange={(e) => setOp({ radioDisenoM: num(e.target.value) })} />
          </label>
          <label className="campo">
            <span>Auto sin tráfico (min)</span>
            <input type="number" min={0} value={comp.autoLibreMin ?? ''} onChange={(e) => actualizar(p.id, { comparativa: { ...comp, autoLibreMin: num(e.target.value) } })} />
          </label>
          <label className="campo">
            <span>Auto hora pico (min)</span>
            <input type="number" min={0} value={comp.autoPicoMin ?? ''} onChange={(e) => actualizar(p.id, { comparativa: { ...comp, autoPicoMin: num(e.target.value) } })} />
          </label>
        </div>
        <div className="campo">
          <span>Tramos con estructura obligada (km)</span>
          {rs.map((r, k) => (
            <div className="restriccion" key={k}>
              <input className="entrada" type="number" step={0.1} value={r.desdeKm} aria-label="Desde km" onChange={(e) => setRs(rs.map((x, j) => (j === k ? { ...x, desdeKm: Number(e.target.value) } : x)))} />
              <input className="entrada" type="number" step={0.1} value={r.hastaKm} aria-label="Hasta km" onChange={(e) => setRs(rs.map((x, j) => (j === k ? { ...x, hastaKm: Number(e.target.value) } : x)))} />
              <select className="entrada" value={r.tipo} onChange={(e) => setRs(rs.map((x, j) => (j === k ? { ...x, tipo: e.target.value as TipoEstructura } : x)))}>
                <option value="tunel">Túnel</option>
                <option value="elevado">Elevado</option>
                <option value="superficie">Superficie</option>
              </select>
              <button className="estrella" onClick={() => setRs(rs.filter((_, j) => j !== k))} aria-label="Quitar tramo">
                ×
              </button>
            </div>
          ))}
          <div>
            <button className="boton mini" style={{ marginTop: 6 }} onClick={() => setRs([...rs, { desdeKm: 0, hastaKm: 1, tipo: 'tunel' }])}>
              <Icono.mas /> Agregar tramo
            </button>
          </div>
        </div>
        <label className="campo">
          <span>Descripción</span>
          <textarea value={p.descripcion ?? ''} onChange={(e) => actualizar(p.id, { descripcion: e.target.value })} />
        </label>
      </details>
    </section>
  );
}
