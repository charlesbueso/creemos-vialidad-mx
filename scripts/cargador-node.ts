/** Cargador de teselas de terreno para Node, con caché en disco (.cache/terreno). */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { CargadorTesela } from '../src/engine/terreno';

const CACHE = join(process.cwd(), '.cache', 'terreno');

export const cargadorNode: CargadorTesela = async (url) => {
  const archivo = join(CACHE, createHash('sha1').update(url).digest('hex') + '.png');
  let buf: Buffer;
  try {
    buf = await readFile(archivo);
  } catch {
    const res = await fetch(url, { headers: { 'User-Agent': 'creemos-vialidad-mx' } });
    if (!res.ok) throw new Error(`Terreno ${res.status} ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
    await mkdir(CACHE, { recursive: true });
    await writeFile(archivo, buf);
  }
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
};
