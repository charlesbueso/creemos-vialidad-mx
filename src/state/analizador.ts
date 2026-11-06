import { useEffect } from 'react';
import { analizar } from '../engine/analisis';
import { cargadorNavegador, MuestreadorTerreno } from '../engine/terreno';
import { useEstado } from './store';

/** Un solo muestreador para toda la app: las teselas de terreno quedan en caché. */
export const terreno = new MuestreadorTerreno(cargadorNavegador, 14);

const versiones = new Map<string, string>();
const pendientes = new Map<string, ReturnType<typeof setTimeout>>();

/** Recalcula cada propuesta cuando cambia algo que afecta la ingeniería (no el nombre ni el color). */
export function useAnalizador() {
  const propuestas = useEstado((s) => s.propuestas);
  useEffect(() => {
    const { setAnalisis, setError } = useEstado.getState();
    const vivos = new Set(propuestas.map((p) => p.id));
    for (const id of [...versiones.keys()]) {
      if (!vivos.has(id)) {
        versiones.delete(id);
        setAnalisis(id, null);
      }
    }
    for (const p of propuestas) {
      const clave = JSON.stringify([p.trazo, p.estaciones, p.tecnologia, p.opciones, p.restricciones]);
      if (versiones.get(p.id) === clave) continue;
      versiones.set(p.id, clave);
      clearTimeout(pendientes.get(p.id));
      if (p.trazo.length < 2) {
        setAnalisis(p.id, null);
        continue;
      }
      pendientes.set(
        p.id,
        setTimeout(async () => {
          try {
            const a = await analizar(p, terreno);
            if (versiones.get(p.id) !== clave) return; // llegó un cambio más nuevo
            setAnalisis(p.id, a);
            setError(p.id, null);
          } catch (e) {
            console.error(e);
            setError(p.id, e instanceof Error ? e.message : String(e));
          }
        }, 160),
      );
    }
  }, [propuestas]);
}
