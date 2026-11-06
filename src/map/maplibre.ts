/**
 * MapLibre 6 carga su worker como archivo aparte (relativo a su propio módulo).
 * Con el pre-empaquetado de Vite esa ruta se pierde, así que se la damos
 * explícitamente; `?url` hace que Vite copie el worker al build.
 */
import { setWorkerUrl } from 'maplibre-gl';
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(urlWorker);
