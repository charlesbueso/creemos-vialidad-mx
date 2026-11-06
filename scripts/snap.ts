/**
 * Captura de pantalla de la app con el Chrome/Edge instalado (sin descargar navegadores).
 * Sirve para revisar propuestas sin abrir el navegador, y para que Claude "vea" el 3D.
 *
 *   npm run dev                      (en otra terminal)
 *   npm run snap -- --p interlomas-reforma --cam -99.25,19.39,15.5,65,60 --out capturas/bosques.png
 *
 * Opciones: --url (default http://localhost:5173) --p <id> --cam lng,lat,zoom,pitch,bearing
 *           --ui (mostrar la interfaz) --sim <segundos> --servicio expres --sat --w 1600 --h 1000
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true') : d;
};

async function main() {
  const base = opt('url', 'http://localhost:5173')!;
  const q = new URLSearchParams();
  if (opt('p')) q.set('p', opt('p')!);
  if (opt('cam')) q.set('cam', opt('cam')!);
  if (!opt('ui')) q.set('ui', '0');
  if (opt('sim')) q.set('sim', opt('sim')!);
  if (opt('servicio')) q.set('servicio', opt('servicio')!);
  if (opt('sat')) q.set('sat', '1');
  if (opt('relieve')) q.set('relieve', opt('relieve')!);
  const url = `${base}/?${q}`;
  const salida = opt('out', 'capturas/captura.png')!;
  const w = Number(opt('w', '1600'));
  const h = Number(opt('h', '1000'));

  let navegador;
  for (const channel of ['chrome', 'msedge']) {
    try {
      navegador = await chromium.launch({
        channel,
        headless: true,
        args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=swiftshader'],
      });
      break;
    } catch {
      /* probar el siguiente */
    }
  }
  if (!navegador) throw new Error('No encontré Chrome ni Edge instalados.');
  const pagina = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errores: string[] = [];
  pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  pagina.on('pageerror', (e) => errores.push(String(e)));
  console.log('Abriendo', url);
  await pagina.goto(url, { waitUntil: 'domcontentloaded' });
  await pagina.waitForFunction(() => window.__creemos?.listo === true, null, { timeout: 120_000 });
  // Dejar que terminen de llegar teselas y que el mapa quede quieto.
  // (Como texto: tsx inyecta helpers como __name que no existen en el navegador.)
  await pagina.evaluate(`new Promise((ok) => {
    const m = window.__creemos.map;
    const fin = () => setTimeout(ok, 2500);
    if (m.loaded() && m.areTilesLoaded()) fin(); else m.once('idle', fin);
    setTimeout(ok, 30000);
  })`);
  await mkdir(dirname(salida), { recursive: true });
  await pagina.screenshot({ path: salida });
  console.log('Guardado', salida);
  if (errores.length) console.log('Errores en consola:\n  ' + errores.slice(0, 10).join('\n  '));
  await navegador.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
