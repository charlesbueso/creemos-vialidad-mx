# Creemos Vialidad MX — guía para Claude

Plataforma 3D (Vite + React 19 + MapLibre 6 + three.js + zustand) para trazar y evaluar transporte masivo en el Valle de México. Todo el texto de la app y del código está en español; mantenlo así.

## Flujo para proponer o ajustar una línea

1. Escribe/edita `src/data/propuestas/<id>.json` (formato en `docs/GUIA.md` y `src/engine/tipos.ts`). Usa coordenadas reales: geocodifica con Nominatim (User-Agent genérico, ≤1 req/s) u Overpass si hace falta.
2. `npm run analizar -- src/data/propuestas/<id>.json` → tiempos, perfil, costo y avisos. Itera hasta que no haya errores (✖) y los avisos (▲) sean intencionales. `--json` da el perfil cada 100 m.
3. Para ver el 3D: con `npm run dev` corriendo, `npm run snap -- --p <id> --cam lng,lat,zoom,pitch,bearing --out capturas/<nombre>.png` y lee la imagen. `--ui` muestra la interfaz; `--sim <seg>` coloca el tren.
4. Pon una `vista` (toma héroe) en el JSON cuando encuentres un buen ángulo.

## Reglas

- Las cifras son de orden de magnitud; no las presentes como ingeniería de detalle. Si cambias costos o parámetros en `src/engine/tecnologias.ts`, cita la referencia.
- Colores de propuestas: sólo de `PALETA` (`src/ui/paleta.ts`), en orden; nunca inventes tonos.
- El motor (`src/engine`) no debe depender del navegador: corre también en Node.
- MapLibre 6 no tiene export default: usa `import * as maplibregl from 'maplibre-gl'`. El worker se configura en `src/map/maplibre.ts`.
- Antes de terminar: `npm run typecheck`, `npm test`, `npm run build`.
