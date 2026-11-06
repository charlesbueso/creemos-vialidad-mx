# Creemos Vialidad MX · Guía completa

Laboratorio 3D para **soñar con números**: trazar líneas de transporte masivo sobre el relieve real del Valle de México, ver los viaductos, estaciones y trenes en 3D, y saber al instante qué dice la ingeniería: tiempo de viaje, pendientes, curvas, altura de las pilas, túneles y costo de orden de magnitud.

> "Creemos" se lee de dos formas: *creemos* que se puede y *creemos* (de crear). Las dos aplican.

## Arrancar

```bash
npm install
npm run dev          # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm test` | Pruebas del motor de ingeniería |
| `npm run analizar` | Analiza todas las propuestas desde la terminal (sin navegador) |
| `npm run analizar -- archivo.json --json` | Volcado completo de una propuesta |
| `npm run snap -- --p <id> --cam lng,lat,zoom,pitch,bearing --out capturas/x.png` | Captura de pantalla con el Chrome/Edge instalado (con `npm run dev` corriendo) |
| `npm run datos:transporte` | Vuelve a bajar la red actual (Metro, Metrobús, Tren Ligero, Suburbano, El Insurgente, Cablebús, Mexicable, Trolebús) desde OpenStreetMap |

## Qué hace

- **Mapa 3D real**: terreno SRTM (AWS Terrain Tiles), edificios 3D y calles de OpenStreetMap (OpenFreeMap), satélite opcional, relieve exagerable.
- **Red actual** con colores oficiales para ver con qué conecta cada idea.
- **Editor de trazos**: clic para poner puntos, arrastrar, clic derecho para borrar; modo estaciones aparte. Las curvas se generan solas como en una vía real (rectas + arcos circulares tangentes, con el radio más amplio que cabe).
- **Motor de ingeniería** (`src/engine`, TypeScript puro, corre igual en navegador y en Node):
  - Perfil vertical optimizado por programación dinámica: elige viaducto, túnel o rampa minimizando costo, respetando la pendiente máxima de cada tecnología, estaciones a nivel y tramos obligados (p. ej. "subterráneo bajo Reforma").
  - Simulación de marcha: aceleración con potencia constante, frenado, límite por curva (√(a·R)), efecto de pendiente y permanencia en estaciones. Servicio local y exprés.
  - Avisos de ingeniería en lenguaje claro: curvas fuera de norma, viaductos de 20 pisos, estaciones en curva o demasiado altas, portales de túnel…
  - Costo por tramo y estación con rangos explícitos.
- **3D con three.js** dentro de MapLibre: viaductos con pilas sobre el terreno real, estaciones con andenes y cubierta, trenes y cabinas de teleférico animados.
- **Simulación del viaje** con cámara libre, siguiendo al tren, o **desde la cabina**.
- **Perfil** de elevación y velocidad sincronizado con el mapa (pasa el cursor, o usa las flechas del teclado).

## Las propuestas son JSON

Cada archivo en `src/data/propuestas/*.json` aparece solo en la app. Esto permite versionarlas en git y pedírselas a Claude: "trázame una línea de Indios Verdes a Ciudad Universitaria por Insurgentes" → Claude escribe el JSON, corre `npm run analizar`, ajusta el trazo según los avisos y la ves en 3D.

```jsonc
{
  "id": "interlomas-reforma",
  "nombre": "Línea Poniente: Interlomas – Reforma",
  "color": "#2A78D6",                 // de la paleta validada (src/ui/paleta.ts)
  "tecnologia": "monorriel",          // monorriel | metro-elevado | metro-ligero | tren-regional | cablebus
  "descripcion": "…",
  "trazo": [[-99.2826, 19.3963], …],  // puntos de control [lng, lat]; las curvas se calculan
  "estaciones": [
    { "id": "interlomas", "nombre": "Interlomas", "lngLat": [-99.2826, 19.3963], "expres": true, "conexiones": ["…"] }
  ],
  "opciones": { "permitirTunel": true, "vMaxKmh": 100, "radioDisenoM": 600 },
  "restricciones": [{ "desdeKm": 1.2, "hastaKm": 8.8, "tipo": "tunel", "motivo": "…" }],
  "comparativa": { "autoLibreMin": 22, "autoPicoMin": 60, "fuente": "…" },
  "vista": { "centro": [-99.2655, 19.3905], "zoom": 15.4, "inclinacion": 73, "rumbo": 92 }
}
```

Lo que editas en la app se guarda en tu navegador. Si el archivo cambia y no habías tocado esa propuesta, la app toma la versión nueva; si ya la habías editado, te ofrece "Usar versión del archivo". **Exportar JSON** descarga tu versión para guardarla en la carpeta.

## Supuestos (léelos antes de citar una cifra)

- Las cifras son de **orden de magnitud** para comparar ideas entre sí, no sustituyen estudios de ingeniería, demanda ni costo.
- Terreno: SRTM ~30 m. En zonas con edificios altos el modelo incluye parte de ellos, así que puede marcar "lomas" donde hay torres.
- Costos por km y por estación: rangos amplios en `src/engine/tecnologias.ts`, con la referencia real de cada tecnología. Cuestiónalos y afínalos ahí.
- Tiempos en auto: los "sin tráfico" vienen de OSRM (OpenStreetMap); los de hora pico son supuestos editables por propuesta.
- No modela todavía: demanda, suelo (zona de lago y hundimientos), sismo, derecho de vía, ni impacto urbano. Ver "Siguientes pasos".

## Estructura

```
src/engine/      motor de ingeniería (sin dependencias de navegador) + pruebas
src/map/         MapLibre (capas, estilo) y CapaTres.ts (three.js: viaductos, estaciones, trenes)
src/ui/          panel, perfil, controles
src/state/       estado (zustand) y analizador en segundo plano
src/sim/         animación del viaje y cámaras
src/data/        propuestas JSON
scripts/         analizar, capturas, descarga de la red actual
public/data/     red actual de transporte (OSM)
```

## Siguientes pasos que más valor darían

1. **Demanda real**: cargar la Encuesta Origen-Destino 2017 (INEGI) para estimar pasajeros por línea y costo por pasajero.
2. **Suelo y riesgo**: zonificación geotécnica (Lomas / Transición / Lago) y hundimiento del Atlas de Riesgos CDMX para ajustar costos y cimentaciones.
3. **Derecho de vía**: penalizar trazos fuera de avenidas, camellones o barrancas federales.
4. **Red completa**: transbordos y tiempos puerta a puerta usando el GTFS de la CDMX.
5. **Compartir**: publicar propuestas con enlace y comentarios.

## Datos y licencias

Mapa © colaboradores de OpenStreetMap (ODbL), teselas de [OpenFreeMap](https://openfreemap.org). Terreno: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen/AWS, SRTM). Imágenes satelitales: Esri World Imagery (uso de prototipo, con atribución).
