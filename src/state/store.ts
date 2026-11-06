import { create } from 'zustand';
import type { Analisis } from '../engine/analisis';
import type { LngLat } from '../engine/geo';
import type { Estacion, Propuesta } from '../engine/tipos';
import { firma, SEMILLAS } from '../data/semillas';
import { siguienteColor } from '../ui/paleta';

const CLAVE = 'creemos-vialidad:v1';

export interface Meta {
  /** Firma del archivo semilla del que viene */
  firma?: string;
  /** El usuario la modificó en la app */
  editada: boolean;
  /** El archivo cambió después de que el usuario la editó */
  versionArchivo?: boolean;
}

export type ModoEdicion = 'trazo' | 'estaciones';
export type Camara = 'libre' | 'seguir' | 'cabina';

export interface Capas {
  red: boolean;
  trolebus: boolean;
  edificios: boolean;
  satelite: boolean;
  relieve: number;
}

export interface Sim {
  activa: boolean;
  reproduciendo: boolean;
  servicio: 'local' | 'expres';
  t: number;
  velocidad: number;
  camara: Camara;
}

interface Estado {
  propuestas: Propuesta[];
  meta: Record<string, Meta>;
  eliminadas: string[];
  seleccion: string | null;
  analisis: Record<string, Analisis>;
  errores: Record<string, string>;
  editando: boolean;
  modoEdicion: ModoEdicion;
  capas: Capas;
  sim: Sim;
  cursorS: number | null;
  aviso: string | null;

  seleccionar: (id: string | null) => void;
  actualizar: (id: string, cambio: Partial<Propuesta> | ((p: Propuesta) => Partial<Propuesta>)) => void;
  nueva: () => void;
  duplicar: (id: string) => void;
  eliminar: (id: string) => void;
  importar: (p: Propuesta) => void;
  usarVersionArchivo: (id: string) => void;
  restaurarEjemplos: () => void;
  setAnalisis: (id: string, a: Analisis | null) => void;
  setError: (id: string, e: string | null) => void;
  setEditando: (v: boolean) => void;
  setModoEdicion: (m: ModoEdicion) => void;
  setCapas: (c: Partial<Capas>) => void;
  setSim: (s: Partial<Sim>) => void;
  setCursor: (s: number | null) => void;
  notificar: (msg: string | null) => void;

  agregarPunto: (ll: LngLat, indice?: number) => void;
  moverPunto: (i: number, ll: LngLat) => void;
  quitarPunto: (i: number) => void;
  agregarEstacion: (ll: LngLat) => void;
  moverEstacion: (id: string, ll: LngLat) => void;
  quitarEstacion: (id: string) => void;
  actualizarEstacion: (id: string, cambio: Partial<Estacion>) => void;
}

interface Guardado {
  propuestas: Propuesta[];
  meta: Record<string, Meta>;
  eliminadas: string[];
  seleccion: string | null;
  capas?: Capas;
}

function leer(): Guardado | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as Guardado) : null;
  } catch {
    return null;
  }
}

/** Mezcla lo guardado con los archivos semilla actuales sin perder ediciones. */
function inicial(): Pick<Estado, 'propuestas' | 'meta' | 'eliminadas' | 'seleccion' | 'capas'> {
  const g = leer();
  const propuestas = g?.propuestas ? [...g.propuestas] : [];
  const meta: Record<string, Meta> = { ...(g?.meta ?? {}) };
  const eliminadas = g?.eliminadas ?? [];
  for (const s of SEMILLAS) {
    const f = firma(s);
    const i = propuestas.findIndex((p) => p.id === s.id);
    if (i < 0) {
      if (!eliminadas.includes(s.id)) {
        propuestas.push(structuredClone(s));
        meta[s.id] = { firma: f, editada: false };
      }
    } else if (meta[s.id]?.firma !== f) {
      if (!meta[s.id]?.editada) {
        propuestas[i] = structuredClone(s);
        meta[s.id] = { firma: f, editada: false };
      } else {
        meta[s.id] = { ...meta[s.id], versionArchivo: true };
      }
    }
  }
  const seleccion = g?.seleccion && propuestas.some((p) => p.id === g.seleccion) ? g.seleccion : (propuestas[0]?.id ?? null);
  return {
    propuestas,
    meta,
    eliminadas,
    seleccion,
    capas: { red: true, trolebus: false, edificios: true, satelite: false, relieve: 1, ...(g?.capas ?? {}) },
  };
}

let idSecuencia = 0;
const nuevoId = (base: string) => `${base}-${Date.now().toString(36)}${(idSecuencia++).toString(36)}`;

export const useEstado = create<Estado>()((set, get) => {
  const marcarEditada = (id: string) => {
    const m = get().meta[id] ?? { editada: true };
    return { ...get().meta, [id]: { ...m, editada: true } };
  };
  const modificar = (id: string, f: (p: Propuesta) => Propuesta) =>
    set((st) => ({
      propuestas: st.propuestas.map((p) => (p.id === id ? f(p) : p)),
      meta: marcarEditada(id),
    }));
  const sel = () => get().propuestas.find((p) => p.id === get().seleccion);

  return {
    ...inicial(),
    analisis: {},
    errores: {},
    editando: false,
    modoEdicion: 'trazo',
    sim: { activa: false, reproduciendo: false, servicio: 'local', t: 0, velocidad: 10, camara: 'seguir' },
    cursorS: null,
    aviso: null,

    seleccionar: (id) => set({ seleccion: id, editando: false, sim: { ...get().sim, activa: false, reproduciendo: false, t: 0 } }),
    actualizar: (id, cambio) => modificar(id, (p) => ({ ...p, ...(typeof cambio === 'function' ? cambio(p) : cambio) })),
    nueva: () => {
      const id = nuevoId('linea');
      const p: Propuesta = {
        id,
        nombre: 'Nueva línea',
        color: siguienteColor(get().propuestas.map((x) => x.color)),
        tecnologia: 'monorriel',
        descripcion: '',
        trazo: [],
        estaciones: [],
        opciones: { permitirTunel: true },
        restricciones: [],
      };
      set((st) => ({
        propuestas: [...st.propuestas, p],
        meta: { ...st.meta, [id]: { editada: true } },
        seleccion: id,
        editando: true,
        modoEdicion: 'trazo',
      }));
    },
    duplicar: (id) => {
      const o = get().propuestas.find((p) => p.id === id);
      if (!o) return;
      const nid = nuevoId(o.id.replace(/-[a-z0-9]{6,}$/, ''));
      const copia: Propuesta = {
        ...structuredClone(o),
        id: nid,
        nombre: `${o.nombre} (variante)`,
        color: siguienteColor(get().propuestas.map((x) => x.color)),
      };
      set((st) => ({ propuestas: [...st.propuestas, copia], meta: { ...st.meta, [nid]: { editada: true } }, seleccion: nid }));
    },
    eliminar: (id) =>
      set((st) => {
        const propuestas = st.propuestas.filter((p) => p.id !== id);
        const esSemilla = SEMILLAS.some((s) => s.id === id);
        return {
          propuestas,
          eliminadas: esSemilla ? [...st.eliminadas, id] : st.eliminadas,
          seleccion: st.seleccion === id ? (propuestas[0]?.id ?? null) : st.seleccion,
          editando: false,
        };
      }),
    importar: (p) => {
      const existe = get().propuestas.some((x) => x.id === p.id);
      const id = existe ? nuevoId(p.id) : p.id;
      set((st) => ({
        propuestas: [...st.propuestas, { ...p, id }],
        meta: { ...st.meta, [id]: { editada: true } },
        seleccion: id,
      }));
    },
    usarVersionArchivo: (id) => {
      const s = SEMILLAS.find((x) => x.id === id);
      if (!s) return;
      set((st) => ({
        propuestas: st.propuestas.map((p) => (p.id === id ? structuredClone(s) : p)),
        meta: { ...st.meta, [id]: { firma: firma(s), editada: false } },
      }));
    },
    restaurarEjemplos: () =>
      set((st) => {
        const propuestas = [...st.propuestas];
        const meta = { ...st.meta };
        for (const s of SEMILLAS) {
          const i = propuestas.findIndex((p) => p.id === s.id);
          if (i >= 0) propuestas[i] = structuredClone(s);
          else propuestas.push(structuredClone(s));
          meta[s.id] = { firma: firma(s), editada: false };
        }
        return { propuestas, meta, eliminadas: [] };
      }),
    setAnalisis: (id, a) =>
      set((st) => {
        const analisis = { ...st.analisis };
        if (a) analisis[id] = a;
        else delete analisis[id];
        return { analisis };
      }),
    setError: (id, e) =>
      set((st) => {
        const errores = { ...st.errores };
        if (e) errores[id] = e;
        else delete errores[id];
        return { errores };
      }),
    setEditando: (v) => set({ editando: v, sim: { ...get().sim, activa: false, reproduciendo: false } }),
    setModoEdicion: (m) => set({ modoEdicion: m }),
    setCapas: (c) => set((st) => ({ capas: { ...st.capas, ...c } })),
    setSim: (s) => set((st) => ({ sim: { ...st.sim, ...s } })),
    setCursor: (s) => set({ cursorS: s }),
    notificar: (msg) => set({ aviso: msg }),

    agregarPunto: (ll, indice) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => {
        const trazo = [...x.trazo];
        if (indice === undefined) trazo.push(ll);
        else trazo.splice(indice, 0, ll);
        return { ...x, trazo };
      });
    },
    moverPunto: (i, ll) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => ({ ...x, trazo: x.trazo.map((q, k) => (k === i ? ll : q)) }));
    },
    quitarPunto: (i) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => ({ ...x, trazo: x.trazo.filter((_, k) => k !== i) }));
    },
    agregarEstacion: (ll) => {
      const p = sel();
      if (!p) return;
      const n = p.estaciones.length + 1;
      modificar(p.id, (x) => ({
        ...x,
        estaciones: [...x.estaciones, { id: nuevoId('est'), nombre: `Estación ${n}`, lngLat: ll }],
      }));
    },
    moverEstacion: (id, ll) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => ({ ...x, estaciones: x.estaciones.map((e) => (e.id === id ? { ...e, lngLat: ll } : e)) }));
    },
    quitarEstacion: (id) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => ({ ...x, estaciones: x.estaciones.filter((e) => e.id !== id) }));
    },
    actualizarEstacion: (id, cambio) => {
      const p = sel();
      if (!p) return;
      modificar(p.id, (x) => ({ ...x, estaciones: x.estaciones.map((e) => (e.id === id ? { ...e, ...cambio } : e)) }));
    },
  };
});

// Persistencia (con pausa breve para no escribir en cada arrastre)
let temporizador: ReturnType<typeof setTimeout> | undefined;
useEstado.subscribe((st, prev) => {
  if (st.propuestas === prev.propuestas && st.seleccion === prev.seleccion && st.capas === prev.capas && st.meta === prev.meta) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    try {
      const g: Guardado = { propuestas: st.propuestas, meta: st.meta, eliminadas: st.eliminadas, seleccion: st.seleccion, capas: st.capas };
      localStorage.setItem(CLAVE, JSON.stringify(g));
    } catch {
      /* almacenamiento no disponible: la app sigue funcionando */
    }
  }, 400);
});

export const propuestaSeleccionada = (st: Estado) => st.propuestas.find((p) => p.id === st.seleccion) ?? null;
export const analisisSeleccionado = (st: Estado) => (st.seleccion ? (st.analisis[st.seleccion] ?? null) : null);
