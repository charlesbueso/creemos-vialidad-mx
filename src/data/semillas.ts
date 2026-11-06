import type { Propuesta } from '../engine/tipos';

/**
 * Cualquier .json en src/data/propuestas aparece solo en la app.
 * Así Claude (o tú) puede proponer líneas escribiendo archivos.
 */
const modulos = import.meta.glob<{ default: Propuesta }>('./propuestas/*.json', { eager: true });

const ORDEN = ['interlomas-reforma', 'expres-10-minutos', 'cablebus-interlomas-santa-fe'];
const posicion = (id: string) => {
  const i = ORDEN.indexOf(id);
  return i < 0 ? ORDEN.length : i;
};

export const SEMILLAS: Propuesta[] = Object.values(modulos)
  .map((m) => m.default)
  .sort((a, b) => posicion(a.id) - posicion(b.id) || a.nombre.localeCompare(b.nombre));

/** Firma corta del contenido, para detectar cuando un archivo cambia. */
export function firma(p: Propuesta): string {
  const s = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
