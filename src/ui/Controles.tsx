import { formatoMin } from '../engine/analisis';
import { posicionEnTiempo, velocidadEn } from '../engine/simulacion';
import { analisisSeleccionado, useEstado, type Camara } from '../state/store';
import { Icono } from './iconos';

export interface Vista {
  nombre: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export const VISTAS: Vista[] = [
  { nombre: 'Valle', center: [-99.15, 19.43], zoom: 10.4, pitch: 50, bearing: -10 },
  { nombre: 'Interlomas', center: [-99.276, 19.392], zoom: 14.6, pitch: 66, bearing: 58 },
  { nombre: 'Lomas', center: [-99.226, 19.41], zoom: 14.4, pitch: 64, bearing: -28 },
  { nombre: 'Reforma', center: [-99.182, 19.425], zoom: 15.2, pitch: 64, bearing: 70 },
];

export function Controles({ irVista }: { irVista: (v: Vista) => void }) {
  const capas = useEstado((s) => s.capas);
  const setCapas = useEstado((s) => s.setCapas);
  const chip = (clave: 'red' | 'trolebus' | 'edificios' | 'satelite', texto: string) => (
    <button className="chip" aria-pressed={capas[clave]} onClick={() => setCapas({ [clave]: !capas[clave] })}>
      {texto}
    </button>
  );
  return (
    <div className="controles vidrio" role="region" aria-label="Capas del mapa">
      <h3>Capas</h3>
      <div className="chips">
        {chip('red', 'Red actual')}
        {chip('trolebus', 'Trolebús')}
        {chip('edificios', 'Edificios 3D')}
        {chip('satelite', 'Satélite')}
      </div>
      <h3>Relieve</h3>
      <div className="seg" role="group" aria-label="Exageración del relieve">
        {[1, 1.5, 2.5].map((e) => (
          <button key={e} aria-pressed={capas.relieve === e} onClick={() => setCapas({ relieve: e })}>
            ×{e.toLocaleString('es-MX')}
          </button>
        ))}
      </div>
      <h3>Ir a</h3>
      <div className="chips">
        {VISTAS.map((v) => (
          <button key={v.nombre} className="chip" onClick={() => irVista(v)}>
            {v.nombre}
          </button>
        ))}
      </div>
      <div className="leyenda-red" aria-label="Leyenda">
        <i style={{ background: '#fff', height: 6, border: '2px solid #3987e5' }} />
        <span>Propuesta (3D: viaducto y estaciones)</span>
        <i style={{ background: 'repeating-linear-gradient(90deg,#3987e5 0 5px,transparent 5px 9px)' }} />
        <span>Tramo en túnel</span>
        <i style={{ background: 'linear-gradient(90deg,#F04E98,#005EB8,#AF9800)' }} />
        <span>Red actual, con su color oficial</span>
      </div>
    </div>
  );
}

export function BandaEdicion() {
  const editando = useEstado((s) => s.editando);
  const modo = useEstado((s) => s.modoEdicion);
  const setModo = useEstado((s) => s.setModoEdicion);
  const setEditando = useEstado((s) => s.setEditando);
  if (!editando) return null;
  return (
    <div className="banda vidrio" role="region" aria-label="Edición del trazo">
      <div className="seg" role="group" aria-label="Qué editar">
        <button aria-pressed={modo === 'trazo'} onClick={() => setModo('trazo')}>
          Trazo <kbd>T</kbd>
        </button>
        <button aria-pressed={modo === 'estaciones'} onClick={() => setModo('estaciones')}>
          Estaciones <kbd>S</kbd>
        </button>
      </div>
      <span className="texto">
        {modo === 'trazo'
          ? 'Clic: agregar punto (cerca de la línea lo inserta) · arrastra para mover · clic derecho para borrar'
          : 'Clic: agregar estación · arrastra para moverla · clic derecho para borrar'}
      </span>
      <button className="boton primario" onClick={() => setEditando(false)}>
        Listo <kbd style={{ background: 'transparent', color: '#fff', borderColor: 'rgb(255 255 255 / 0.5)' }}>Esc</kbd>
      </button>
    </div>
  );
}

export function BarraSim({ conPerfil }: { conPerfil: boolean }) {
  const sim = useEstado((s) => s.sim);
  const setSim = useEstado((s) => s.setSim);
  const a = useEstado(analisisSeleccionado);
  if (!sim.activa || !a) return null;
  const marcha = sim.servicio === 'expres' && a.expres ? a.expres : a.local;
  const s = posicionEnTiempo(marcha, sim.t);
  const v = velocidadEn(marcha, a.s, s) * 3.6;
  // Mismo umbral que la simulación usa para fundir paradas (30 m)
  const proxima = a.estaciones.find((e) => e.s > s + 30);
  const camaras: { id: Camara; texto: string }[] = [
    { id: 'libre', texto: 'Libre' },
    { id: 'seguir', texto: 'Seguir' },
    { id: 'cabina', texto: 'Cabina' },
  ];
  const terminado = sim.t >= marcha.tiempoTotal;
  return (
    <div className={`sim vidrio ${conPerfil ? '' : 'sin-perfil'}`} role="region" aria-label="Simulación del viaje">
      <button
        className="boton primario"
        onClick={() => setSim(terminado ? { t: 0, reproduciendo: true } : { reproduciendo: !sim.reproduciendo })}
        aria-label={sim.reproduciendo ? 'Pausar' : 'Reproducir'}
      >
        {sim.reproduciendo ? <Icono.pausa /> : <Icono.play />}
      </button>
      <div className="reloj" aria-live="off">
        {formatoMin(sim.t)}
      </div>
      <div className="dato">
        de <b>{formatoMin(marcha.tiempoTotal)}</b>
      </div>
      <div className="dato">
        velocidad <b>{Math.round(v)} km/h</b>
      </div>
      <div className="dato" style={{ minWidth: 120 }}>
        {terminado ? 'llegada' : 'siguiente'} <b>{terminado ? a.estaciones[a.estaciones.length - 1]?.nombre : (proxima?.nombre ?? '—')}</b>
      </div>
      {a.expres && (
        <div className="seg" role="group" aria-label="Servicio">
          {(['local', 'expres'] as const).map((sv) => (
            <button key={sv} aria-pressed={sim.servicio === sv} onClick={() => setSim({ servicio: sv, t: 0 })}>
              {sv === 'local' ? 'Local' : 'Exprés'}
            </button>
          ))}
        </div>
      )}
      <div className="seg" role="group" aria-label="Velocidad de reproducción">
        {[1, 5, 10, 30].map((x) => (
          <button key={x} aria-pressed={sim.velocidad === x} onClick={() => setSim({ velocidad: x })}>
            ×{x}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Cámara">
        {camaras.map((cm) => (
          <button key={cm.id} aria-pressed={sim.camara === cm.id} onClick={() => setSim({ camara: cm.id })}>
            {cm.texto}
          </button>
        ))}
      </div>
      <button className="boton mini" onClick={() => setSim({ activa: false, reproduciendo: false, t: 0 })} aria-label="Cerrar simulación">
        ×
      </button>
    </div>
  );
}
