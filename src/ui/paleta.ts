/**
 * Paleta categórica validada (orden fijo, nunca ciclado). El valor "claro" se
 * usa sobre el mapa; el "oscuro" sobre el panel. Validada con el script de
 * dataviz: slots 1–3 pasan todos los pares en ambos modos.
 */
export const PALETA: { claro: string; oscuro: string; nombre: string }[] = [
  { claro: '#2A78D6', oscuro: '#3987E5', nombre: 'Azul' },
  { claro: '#EB6834', oscuro: '#D95926', nombre: 'Naranja' },
  { claro: '#1BAF7A', oscuro: '#199E70', nombre: 'Aqua' },
  { claro: '#EDA100', oscuro: '#C98500', nombre: 'Amarillo' },
  { claro: '#E87BA4', oscuro: '#D55181', nombre: 'Magenta' },
  { claro: '#008300', oscuro: '#008300', nombre: 'Verde' },
  { claro: '#6250D6', oscuro: '#9085E9', nombre: 'Violeta' },
  { claro: '#E34948', oscuro: '#E66767', nombre: 'Rojo' },
];

/** Paso para el panel oscuro del color de una propuesta (si es de la paleta). */
export function colorOscuro(hex: string): string {
  const h = hex.toUpperCase();
  return PALETA.find((p) => p.claro === h)?.oscuro ?? hex;
}

/** Color para propuestas más allá de la octava: neutro, nunca un tono inventado. */
export const COLOR_OTRAS = '#8B8E96';

/** Siguiente color libre de la paleta, en orden; sin ciclar. */
export function siguienteColor(usados: string[]): string {
  const set = new Set(usados.map((u) => u.toUpperCase()));
  return PALETA.find((p) => !set.has(p.claro))?.claro ?? COLOR_OTRAS;
}

/** Neutros del panel (texto y gráficas). */
export const NEUTRO = {
  terreno: '#9A8F7D',
  limite: '#8B8E96',
  rejilla: '#2A2E35',
};
