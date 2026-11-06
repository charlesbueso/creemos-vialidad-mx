import * as maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { indiceCercano } from './engine/simulacion';
import { MapView, type ApiMapa } from './map/MapView';
import { useAnalizador } from './state/analizador';
import { analisisSeleccionado, propuestaSeleccionada, useEstado } from './state/store';
import { BandaEdicion, BarraSim, Controles, type Vista } from './ui/Controles';
import { colorOscuro, NEUTRO } from './ui/paleta';
import { Panel, type AccionesMapa } from './ui/Panel';
import { Perfil } from './ui/Perfil';

const PARAMS = new URLSearchParams(location.search);
const SIN_UI = PARAMS.get('ui') === '0';
const CAM_URL = PARAMS.get('cam');

export default function App() {
  useAnalizador();
  const [api, setApi] = useState<ApiMapa | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState(true);
  const a = useEstado(analisisSeleccionado);
  const p = useEstado(propuestaSeleccionada);
  const sim = useEstado((s) => s.sim);
  const aviso = useEstado((s) => s.aviso);
  const notificar = useEstado((s) => s.notificar);
  const yaEncuadrado = useRef<string | null>(null);

  // Parámetros de URL (útiles para compartir vistas y para capturas automáticas)
  useEffect(() => {
    const st = useEstado.getState();
    const id = PARAMS.get('p');
    if (id && st.propuestas.some((x) => x.id === id)) st.seleccionar(id);
    if (PARAMS.get('sat') === '1') st.setCapas({ satelite: true });
    if (PARAMS.get('relieve')) st.setCapas({ relieve: Number(PARAMS.get('relieve')) || 1 });
  }, []);

  const padding = useMemo(
    () => (SIN_UI ? { top: 60, bottom: 60, left: 60, right: 60 } : { top: 80, bottom: (perfilAbierto ? 236 : 0) + 60, left: 440, right: 250 }),
    [perfilAbierto],
  );

  const vistaGeneral = useCallback(() => {
    const st = useEstado.getState();
    const an = analisisSeleccionado(st);
    if (!api || !an) return;
    const m = an.alineamiento.muestras;
    const b = new maplibregl.LngLatBounds(m[0].lngLat, m[0].lngLat);
    for (const x of m) b.extend(x.lngLat);
    const ini = m[0].lngLat;
    const fin = m[m.length - 1].lngLat;
    const rumbo = (Math.atan2((fin[0] - ini[0]) * Math.cos((ini[1] * Math.PI) / 180), fin[1] - ini[1]) * 180) / Math.PI;
    const bearing = ((rumbo - 90 + 540) % 360) - 180;
    const cam = api.map.cameraForBounds(b, { padding, bearing });
    if (cam) api.map.flyTo({ ...cam, zoom: (cam.zoom ?? 13) - 0.35, pitch: 60, bearing, duration: 1800, essential: true });
  }, [api, padding]);

  const irA = useCallback(
    (s: number) => {
      const st = useEstado.getState();
      const an = analisisSeleccionado(st);
      if (!api || !an) return;
      const i = indiceCercano(an.s, s);
      const m = an.alineamiento.muestras[i];
      st.setCursor(s);
      const rumbo = (90 - (Math.atan2(m.ty, m.tx) * 180) / Math.PI + 360) % 360;
      api.map.flyTo({ center: m.lngLat, zoom: 16.2, pitch: 64, bearing: rumbo - 70, duration: 1600, essential: true, padding });
    },
    [api, padding],
  );

  const acciones: AccionesMapa = useMemo(
    () => ({
      vistaGeneral,
      irA,
      simular: () => {
        const st = useEstado.getState();
        st.setEditando(false);
        st.setSim({ activa: true, reproduciendo: true, t: 0, servicio: analisisSeleccionado(st)?.expres ? st.sim.servicio : 'local' });
      },
      sobrevolar: () => {
        const an = analisisSeleccionado(useEstado.getState());
        if (an && api) {
          useEstado.getState().setSim({ activa: false, reproduciendo: false });
          api.sim.sobrevolar(an);
        }
      },
    }),
    [vistaGeneral, irA, api],
  );

  const irVista = useCallback(
    (v: Vista) => api?.map.flyTo({ center: v.center, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing, duration: 1800, essential: true }),
    [api],
  );

  // Encuadrar al cambiar de propuesta (cuando ya hay análisis)
  useEffect(() => {
    if (!api || !a || !p || a.propuestaId !== p.id) return;
    if (yaEncuadrado.current === p.id) return;
    const primera = yaEncuadrado.current === null;
    yaEncuadrado.current = p.id;
    if (primera && CAM_URL) {
      const [lng, lat, zoom, pitch, bearing] = CAM_URL.split(',').map(Number);
      api.map.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
    } else if (primera && PARAMS.get('vista') === 'general') {
      vistaGeneral();
    } else if (p.vista) {
      // La "toma héroe" que trae la propuesta
      const v = p.vista;
      const mover = primera ? api.map.jumpTo.bind(api.map) : api.map.flyTo.bind(api.map);
      mover({ center: v.centro, zoom: v.zoom, pitch: v.inclinacion, bearing: v.rumbo, ...(primera ? {} : { duration: 2200, essential: true }) });
    } else {
      vistaGeneral();
    }
    const tSim = PARAMS.get('sim');
    if (primera && tSim) {
      useEstado.getState().setSim({ activa: true, reproduciendo: false, t: Number(tSim) || 0, servicio: PARAMS.get('servicio') === 'expres' ? 'expres' : 'local' });
    }
  }, [api, a, p, vistaGeneral]);

  // Reproducción
  useEffect(() => {
    if (!api) return;
    if (sim.activa && sim.reproduciendo) api.sim.iniciar(sim.t);
    else {
      api.sim.detener();
      if (sim.activa) api.sim.colocar(sim.t);
    }
    // sim.t sólo se usa al arrancar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, sim.activa, sim.reproduciendo, sim.servicio]);

  useEffect(() => {
    if (!api || !sim.activa || sim.reproduciendo) return;
    api.sim.colocar(sim.t);
  }, [api, sim.t, sim.activa, sim.reproduciendo]);

  // Al dejar la cabina (otra cámara o cerrar la simulación) se vuelve a anclar la cámara al suelo
  useEffect(() => {
    if (!api) return;
    if (!sim.activa || sim.camara !== 'cabina') api.sim.salirDeCabina();
  }, [api, sim.activa, sim.camara]);

  // Al cerrar la simulación, el tren vuelve a la terminal
  useEffect(() => {
    if (!api || sim.activa) return;
    const an = analisisSeleccionado(useEstado.getState());
    if (an) api.capa.moverTren(an.propuestaId, Math.min(an.alineamiento.longitud, (an.estaciones[0]?.s ?? 0) + an.tec.andenM / 2 - 2));
  }, [api, sim.activa]);

  // Atajos de teclado
  useEffect(() => {
    const alTecla = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const st = useEstado.getState();
      if (ev.key === 'Escape') {
        if (st.editando) st.setEditando(false);
        else if (st.sim.activa) st.setSim({ activa: false, reproduciendo: false, t: 0 });
      } else if (ev.key === 'e' || ev.key === 'E') {
        if (st.seleccion) st.setEditando(!st.editando);
      } else if (st.editando && (ev.key === 't' || ev.key === 'T')) st.setModoEdicion('trazo');
      else if (st.editando && (ev.key === 's' || ev.key === 'S')) st.setModoEdicion('estaciones');
      else if (ev.key === ' ' && st.sim.activa) {
        ev.preventDefault();
        st.setSim({ reproduciendo: !st.sim.reproduciendo });
      }
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => notificar(null), 3200);
    return () => clearTimeout(t);
  }, [aviso, notificar]);

  const conPerfil = !!(a && p && perfilAbierto);
  return (
    <div className={`app ${SIN_UI ? 'sin-ui' : ''}`}>
      <MapView onApi={setApi} />
      {!SIN_UI && (
        <>
          <Panel acciones={acciones} />
          <Controles irVista={irVista} />
          <BandaEdicion />
          <BarraSim conPerfil={conPerfil} />
          {a && p && (
            <section className="perfil vidrio" aria-label="Perfil del trazo" style={perfilAbierto ? undefined : { height: 'auto' }}>
              <div className="perfil-cabeza">
                <h3>Perfil · {p.nombre}</h3>
                <div className="leyenda">
                  <span>
                    <i style={{ background: colorOscuro(p.color) }} /> Vía
                  </span>
                  <span>
                    <i className="area" style={{ background: NEUTRO.terreno, opacity: 0.6 }} /> Terreno
                  </span>
                  <span>
                    <i style={{ background: colorOscuro(p.color), opacity: 0.45 }} /> Vía en túnel
                  </span>
                  <span>
                    <i style={{ background: colorOscuro(p.color) }} /> Velocidad
                  </span>
                  <span>
                    <i style={{ background: NEUTRO.limite }} /> Límite (curvas)
                  </span>
                </div>
                <span style={{ flex: 1 }} />
                {a.expres && (
                  <div className="seg" role="group" aria-label="Servicio mostrado">
                    {(['local', 'expres'] as const).map((sv) => (
                      <button key={sv} aria-pressed={sim.servicio === sv} onClick={() => useEstado.getState().setSim({ servicio: sv })}>
                        {sv === 'local' ? 'Local' : 'Exprés'}
                      </button>
                    ))}
                  </div>
                )}
                <button className="boton mini" onClick={() => setPerfilAbierto(!perfilAbierto)} aria-expanded={perfilAbierto}>
                  {perfilAbierto ? 'Ocultar' : 'Mostrar perfil'}
                </button>
              </div>
              {perfilAbierto && <Perfil a={a} color={p.color} servicio={sim.servicio} />}
            </section>
          )}
          {aviso && <div className="toast vidrio">{aviso}</div>}
        </>
      )}
    </div>
  );
}
