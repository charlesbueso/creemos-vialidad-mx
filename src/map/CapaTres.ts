/**
 * Capa three.js dentro de MapLibre: viaductos, pilas, estaciones y trenes
 * sobre el terreno real. Las coordenadas locales son metros (este, norte,
 * altitud) alrededor de un origen fijo; la altitud se corrige por latitud para
 * coincidir exactamente con el terreno de MapLibre.
 */
import * as maplibregl from 'maplibre-gl';
import { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapaML } from 'maplibre-gl';
import * as THREE from 'three';
import type { Analisis } from '../engine/analisis';
import type { LngLat } from '../engine/geo';
import type { Tecnologia } from '../engine/tecnologias';

const ORIGEN: LngLat = [-99.2, 19.4];
const RAD = Math.PI / 180;

interface Datos3D {
  n: number;
  s: Float64Array;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  zt: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  tec: Tecnologia;
  longitud: number;
}

interface Entrada {
  grupo: THREE.Group;
  datos: Datos3D;
  tren: THREE.Group | null;
  cabinas: THREE.InstancedMesh | null;
  color: string;
  geometrias: THREE.BufferGeometry[];
  materiales: THREE.Material[];
}

const MAT = {
  concreto: new THREE.MeshLambertMaterial({ color: 0xdcd7ce }),
  pila: new THREE.MeshLambertMaterial({ color: 0xcbc5ba }),
  techo: new THREE.MeshLambertMaterial({ color: 0xf4f4f2 }),
  anden: new THREE.MeshLambertMaterial({ color: 0xb9b6b0 }),
  vidrio: new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.38, depthWrite: false }),
  tren: new THREE.MeshLambertMaterial({ color: 0xf6f8fa }),
  ventanas: new THREE.MeshLambertMaterial({ color: 0x1b2430 }),
  cable: new THREE.LineBasicMaterial({ color: 0x30343a }),
  torre: new THREE.MeshLambertMaterial({ color: 0x9aa1a9 }),
};
const CAJA = new THREE.BoxGeometry(1, 1, 1);

export class CapaTres implements CustomLayerInterface {
  readonly id = 'creemos-3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapaML | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private escena = new THREE.Scene();
  private camara = new THREE.Camera();
  private origen = maplibregl.MercatorCoordinate.fromLngLat(ORIGEN, 0);
  private escala = this.origen.meterInMercatorCoordinateUnits();
  private cosLat0 = Math.cos(ORIGEN[1] * RAD);
  private entradas = new Map<string, Entrada>();
  private exageracion = 1;
  animando = false;

  onAdd(map: MapaML, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    const cielo = new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.35);
    cielo.position.set(0, 0, 1);
    const sol = new THREE.DirectionalLight(0xffffff, 1.7);
    sol.position.set(-0.45, -0.6, 1).normalize();
    this.escena.add(cielo, sol);
  }

  onRemove() {
    for (const id of [...this.entradas.keys()]) this.quitar(id);
    this.renderer?.dispose();
    this.renderer = null;
  }

  render(gl: WebGL2RenderingContext, opciones: CustomRenderMethodInput) {
    if (!this.renderer || !this.map) return;
    const m = new THREE.Matrix4().fromArray(opciones.defaultProjectionData.mainMatrix);
    const l = new THREE.Matrix4()
      .makeTranslation(this.origen.x, this.origen.y, 0)
      .scale(new THREE.Vector3(this.escala, -this.escala, this.escala * this.exageracion));
    this.camara.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderer.render(this.escena, this.camara);
    if (this.animando) this.map.triggerRepaint();
  }

  repintar() {
    this.map?.triggerRepaint();
  }

  setExageracion(e: number) {
    this.exageracion = e;
    this.repintar();
  }

  /** Metros locales para un punto y altitud (m s.n.m.). */
  local(ll: LngLat, alt: number): [number, number, number] {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(ll, 0);
    return [(mc.x - this.origen.x) / this.escala, -(mc.y - this.origen.y) / this.escala, (alt * this.cosLat0) / Math.cos(ll[1] * RAD)];
  }

  /** Punto geográfico de unas coordenadas locales. */
  aLngLat(x: number, y: number): LngLat {
    const mc = new maplibregl.MercatorCoordinate(this.origen.x + x * this.escala, this.origen.y - y * this.escala, 0);
    const ll = mc.toLngLat();
    return [ll.lng, ll.lat];
  }

  quitar(id: string) {
    const e = this.entradas.get(id);
    if (!e) return;
    this.escena.remove(e.grupo);
    if (e.tren) this.escena.remove(e.tren);
    e.geometrias.forEach((g) => g.dispose());
    e.materiales.forEach((m) => m.dispose());
    this.entradas.delete(id);
    this.repintar();
  }

  ids() {
    return [...this.entradas.keys()];
  }

  setPropuesta(id: string, a: Analisis, color: string) {
    this.quitar(id);
    const datos = this.datos(a);
    const geometrias: THREE.BufferGeometry[] = [];
    const materiales: THREE.Material[] = [];
    const acento = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
    materiales.push(acento);
    const grupo = new THREE.Group();
    grupo.name = id;
    const tec = a.tec;

    if (tec.esCable) {
      this.construirCable(grupo, a, datos, acento, geometrias);
    } else {
      this.construirViaducto(grupo, a, datos, acento, geometrias);
    }
    this.construirEstaciones(grupo, a, datos, acento, geometrias);
    grupo.traverse((o) => (o.frustumCulled = false));
    this.escena.add(grupo);

    const entrada: Entrada = { grupo, datos, tren: null, cabinas: null, color, geometrias, materiales };
    if (tec.esCable) entrada.cabinas = this.construirCabinas(grupo, datos, acento, geometrias);
    entrada.tren = this.construirTren(datos, acento);
    entrada.tren.traverse((o) => (o.frustumCulled = false));
    // En teleférico se ven todas las cabinas; el "tren" es sólo la cabina que sigue la cámara
    entrada.tren.visible = !tec.esCable;
    this.escena.add(entrada.tren);
    this.entradas.set(id, entrada);
    if (entrada.cabinas) this.moverCabinas(id, 0);
    // Tren estacionado en la primera estación
    const s0 = a.estaciones[0]?.s ?? 0;
    this.moverTren(id, Math.min(datos.longitud, s0 + tec.andenM / 2 - 2), 0);
    this.repintar();
  }

  private datos(a: Analisis): Datos3D {
    const m = a.alineamiento.muestras;
    const n = m.length;
    const d: Datos3D = {
      n,
      s: new Float64Array(n),
      x: new Float64Array(n),
      y: new Float64Array(n),
      z: new Float64Array(n),
      zt: new Float64Array(n),
      tx: new Float64Array(n),
      ty: new Float64Array(n),
      tec: a.tec,
      longitud: a.alineamiento.longitud,
    };
    for (let i = 0; i < n; i++) {
      const [x, y, z] = this.local(m[i].lngLat, a.perfil.via[i]);
      const f = z / (a.perfil.via[i] || 1);
      d.s[i] = m[i].s;
      d.x[i] = x;
      d.y[i] = y;
      d.z[i] = z;
      d.zt[i] = a.terreno[i] * f;
    }
    for (let i = 0; i < n; i++) {
      const a0 = Math.max(0, i - 1);
      const a1 = Math.min(n - 1, i + 1);
      const dx = d.x[a1] - d.x[a0];
      const dy = d.y[a1] - d.y[a0];
      const L = Math.hypot(dx, dy) || 1;
      d.tx[i] = dx / L;
      d.ty[i] = dy / L;
    }
    return d;
  }

  /** Interpolación en un cadenamiento. */
  private en(d: Datos3D, s: number) {
    const sc = Math.min(Math.max(s, 0), d.longitud);
    const ds = d.n > 1 ? d.s[1] - d.s[0] : 1;
    let i = Math.min(d.n - 2, Math.max(0, Math.floor(sc / ds)));
    while (i < d.n - 2 && d.s[i + 1] < sc) i++;
    const j = Math.min(d.n - 1, i + 1);
    const f = d.s[j] > d.s[i] ? (sc - d.s[i]) / (d.s[j] - d.s[i]) : 0;
    const lerp = (arr: Float64Array) => arr[i] + (arr[j] - arr[i]) * f;
    const tx = lerp(d.tx);
    const ty = lerp(d.ty);
    const tl = Math.hypot(tx, ty) || 1;
    const pend = d.s[j] > d.s[i] ? (d.z[j] - d.z[i]) / (d.s[j] - d.s[i]) : 0;
    return { x: lerp(d.x), y: lerp(d.y), z: lerp(d.z), zt: lerp(d.zt), tx: tx / tl, ty: ty / tl, pend };
  }

  // ---------- Viaducto ----------

  private construirViaducto(grupo: THREE.Group, a: Analisis, d: Datos3D, acento: THREE.Material, geos: THREE.BufferGeometry[]) {
    const tec = a.tec;
    const est = a.perfil.estructura;
    // Tramos visibles (todo lo que no es túnel)
    const tramos: [number, number][] = [];
    let i0 = -1;
    for (let i = 0; i < d.n; i++) {
      const visible = est[i] !== 'tunel';
      if (visible && i0 < 0) i0 = i;
      if ((!visible || i === d.n - 1) && i0 >= 0) {
        const i1 = visible ? i : i - 1;
        if (i1 > i0) tramos.push([Math.max(0, i0 - 1), Math.min(d.n - 1, i1 + 1)]);
        i0 = -1;
      }
    }
    const pos: number[] = [];
    const idx: number[] = [];
    // Franjas del color de la línea en los costados (identidad visual sobre el mapa claro)
    const posA: number[] = [];
    const idxA: number[] = [];
    const t = tec.tablero;
    for (const [a0, a1] of tramos) {
      if (t.tipo === 'vigas') {
        for (const lado of [-1, 1]) {
          const c = (lado * tec.entreEjesM) / 2;
          barrido(d, a0, a1, c, t.anchoM / 2, 0, t.peralteM, pos, idx);
          barrido(d, a0, a1, c + lado * (t.anchoM / 2 + 0.03), 0.04, -0.12, 0.42, posA, idxA);
        }
      } else {
        barrido(d, a0, a1, 0, t.anchoM / 2, -0.25, t.peralteM, pos, idx);
        // Pretiles
        for (const lado of [-1, 1]) {
          barrido(d, a0, a1, lado * (t.anchoM / 2 - 0.15), 0.15, 1.0, 1.25, pos, idx);
          barrido(d, a0, a1, lado * (t.anchoM / 2 + 0.04), 0.05, -0.35, 0.55, posA, idxA);
        }
      }
    }
    const malla = (p: number[], ix: number[], mat: THREE.Material) => {
      if (!p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(ix);
      g.computeVertexNormals();
      geos.push(g);
      grupo.add(new THREE.Mesh(g, mat));
    };
    malla(pos, idx, MAT.concreto);
    malla(posA, idxA, acento);

    // Pilas (no bajo estaciones: ellas llevan sus propios apoyos)
    const libre = (s: number) => a.estaciones.every((e) => Math.abs(e.s - s) > tec.andenM / 2 + 4);
    const pilas: { x: number; y: number; zTop: number; zBot: number; ang: number }[] = [];
    let sAcum = tec.claroM / 2;
    for (let i = 1; i < d.n; i++) {
      if (est[i] !== 'elevado') continue;
      while (sAcum <= d.s[i]) {
        if (sAcum >= d.s[i - 1] && libre(sAcum)) {
          const p = this.en(d, sAcum);
          const zTop = p.z - (t.tipo === 'vigas' ? t.peralteM : t.peralteM + 0.25);
          if (zTop - p.zt > 1.5) pilas.push({ x: p.x, y: p.y, zTop, zBot: p.zt - 30, ang: Math.atan2(p.ty, p.tx) });
        }
        sAcum += tec.claroM;
      }
    }
    if (pilas.length) {
      const anchoCol = t.tipo === 'vigas' ? 1.5 : 2.4;
      const col = new THREE.InstancedMesh(CAJA, MAT.pila, pilas.length);
      const cab = new THREE.InstancedMesh(CAJA, MAT.pila, pilas.length);
      const largoCab = t.tipo === 'vigas' ? tec.entreEjesM + 2.6 : 5;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const eje = new THREE.Vector3(0, 0, 1);
      pilas.forEach((p, k) => {
        q.setFromAxisAngle(eje, p.ang);
        const h = p.zTop - 1.3 - p.zBot;
        m4.compose(new THREE.Vector3(p.x, p.y, p.zBot + h / 2), q, new THREE.Vector3(anchoCol, anchoCol, h));
        col.setMatrixAt(k, m4);
        m4.compose(new THREE.Vector3(p.x, p.y, p.zTop - 0.65), q, new THREE.Vector3(2.0, largoCab, 1.3));
        cab.setMatrixAt(k, m4);
      });
      grupo.add(col, cab);
    }
  }

  // ---------- Teleférico ----------

  private construirCable(grupo: THREE.Group, a: Analisis, d: Datos3D, acento: THREE.Material, geos: THREE.BufferGeometry[]) {
    const tec = a.tec;
    for (const lado of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < d.n; i += 2) {
        const nx = -d.ty[i];
        const ny = d.tx[i];
        const o = (lado * tec.entreEjesM) / 2;
        pts.push(new THREE.Vector3(d.x[i] + nx * o, d.y[i] + ny * o, d.z[i]));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      geos.push(g);
      grupo.add(new THREE.Line(g, MAT.cable));
    }
    const torres = (a.perfil.torres ?? []).filter((s) => a.estaciones.every((e) => Math.abs(e.s - s) > 30));
    if (torres.length) {
      const col = new THREE.InstancedMesh(CAJA, MAT.torre, torres.length);
      const brazo = new THREE.InstancedMesh(CAJA, acento, torres.length);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      torres.forEach((s, k) => {
        const p = this.en(d, s);
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(p.ty, p.tx));
        const h = p.z + 1 - (p.zt - 10);
        m4.compose(new THREE.Vector3(p.x, p.y, p.zt - 10 + h / 2), q, new THREE.Vector3(1.6, 1.6, h));
        col.setMatrixAt(k, m4);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z + 0.8), q, new THREE.Vector3(1.0, tec.entreEjesM + 3, 0.8));
        brazo.setMatrixAt(k, m4);
      });
      grupo.add(col, brazo);
    }
  }

  private construirCabinas(grupo: THREE.Group, d: Datos3D, acento: THREE.Material, _geos: THREE.BufferGeometry[]) {
    const separacion = 70;
    const porSentido = Math.max(1, Math.floor(d.longitud / separacion));
    const im = new THREE.InstancedMesh(CAJA, acento, porSentido * 2);
    im.userData = { porSentido, separacion };
    im.frustumCulled = false;
    grupo.add(im);
    return im;
  }

  // ---------- Estaciones ----------

  private construirEstaciones(grupo: THREE.Group, a: Analisis, d: Datos3D, acento: THREE.Material, _geos: THREE.BufferGeometry[]) {
    const tec = a.tec;
    const ancho = tec.esCable ? 16 : tec.entreEjesM + tec.tren.anchoM + 2 * 4.2;
    const largo = tec.andenM;
    for (const e of a.estaciones) {
      const p = this.en(d, e.s);
      const ang = Math.atan2(p.ty, p.tx);
      const caja = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material) => {
        const m = new THREE.Mesh(CAJA, mat);
        m.position.set(p.x + cx * Math.cos(ang) - cy * Math.sin(ang), p.y + cx * Math.sin(ang) + cy * Math.cos(ang), cz);
        m.rotation.z = ang;
        m.scale.set(sx, sy, sz);
        grupo.add(m);
        return m;
      };
      if (e.estructura === 'tunel') {
        // Pabellón de acceso en superficie
        caja(0, 0, p.zt + 2.2, 16, 9, 4.4, MAT.vidrio);
        caja(0, 0, p.zt + 4.6, 17, 10, 0.5, MAT.techo);
        caja(0, 0, p.zt + 4.3, 17.2, 10.2, 0.25, acento);
        continue;
      }
      const piso = tec.esCable ? p.z - 3.6 : p.z + tec.tren.baseSobreViaM + 1.1;
      const techo = piso + (tec.esCable ? 9 : 5.2);
      const bandaAnden = 4.2;
      const yAnden = ancho / 2 - bandaAnden / 2;
      // Andenes laterales
      caja(0, -yAnden, piso - 0.5, largo, bandaAnden, 1.0, MAT.anden);
      caja(0, yAnden, piso - 0.5, largo, bandaAnden, 1.0, MAT.anden);
      // Muros de vidrio y cubierta
      caja(0, -ancho / 2, (piso + techo) / 2, largo, 0.25, techo - piso, MAT.vidrio);
      caja(0, ancho / 2, (piso + techo) / 2, largo, 0.25, techo - piso, MAT.vidrio);
      caja(0, 0, techo + 0.3, largo + 4, ancho + 2, 0.6, MAT.techo);
      caja(0, 0, techo - 0.15, largo + 4.2, ancho + 2.2, 0.35, acento);
      // Vestíbulo inferior y apoyos (sólo si hay altura)
      const altura = piso - p.zt;
      if (altura > 9) {
        caja(0, 0, piso - 4.2, largo * 0.45, ancho, 4.6, MAT.vidrio);
        caja(0, 0, piso - 1.6, largo * 0.47, ancho + 0.4, 0.6, MAT.concreto);
        const h = piso - 6.5 - (p.zt - 25);
        for (const fx of [-0.42, -0.14, 0.14, 0.42]) {
          for (const fy of [-0.3, 0.3]) caja(fx * largo, fy * ancho, p.zt - 25 + h / 2, 1.8, 1.8, h, MAT.pila);
        }
      } else {
        const h = piso - 1 - (p.zt - 25);
        for (const fx of [-0.42, -0.14, 0.14, 0.42]) caja(fx * largo, 0, p.zt - 25 + h / 2, 1.8, ancho * 0.7, h, MAT.pila);
      }
    }
  }

  // ---------- Tren ----------

  private construirTren(d: Datos3D, acento: THREE.Material): THREE.Group {
    const t = d.tec.tren;
    const tren = new THREE.Group();
    for (let k = 0; k < t.carros; k++) {
      const carro = new THREE.Group();
      const cuerpo = new THREE.Mesh(CAJA, MAT.tren);
      cuerpo.scale.set(t.largoCarroM, t.anchoM, t.altoM);
      const ventanas = new THREE.Mesh(CAJA, MAT.ventanas);
      ventanas.scale.set(t.largoCarroM * 0.92, t.anchoM + 0.04, t.altoM * 0.28);
      ventanas.position.z = t.altoM * 0.12;
      const franja = new THREE.Mesh(CAJA, acento);
      franja.scale.set(t.largoCarroM + 0.02, t.anchoM + 0.06, t.altoM * 0.12);
      franja.position.z = -t.altoM * 0.16;
      carro.add(cuerpo, ventanas, franja);
      tren.add(carro);
    }
    return tren;
  }

  /** Coloca el tren con la cabeza en el cadenamiento s. sentido: 0 = ida. */
  moverTren(id: string, s: number, _sentido = 0): { lngLat: LngLat; rumbo: number; z: number } | null {
    const e = this.entradas.get(id);
    if (!e || !e.tren) return null;
    const d = e.datos;
    const t = d.tec.tren;
    const lateral = -d.tec.entreEjesM / 2; // vía derecha
    const qYaw = new THREE.Quaternion();
    const qPitch = new THREE.Quaternion();
    const Z = new THREE.Vector3(0, 0, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    e.tren.children.forEach((carro, k) => {
      const sc = s - t.largoCarroM / 2 - k * (t.largoCarroM + 0.8);
      const p = this.en(d, sc);
      const nx = -p.ty;
      const ny = p.tx;
      carro.position.set(p.x + nx * lateral, p.y + ny * lateral, p.z + t.baseSobreViaM + t.altoM / 2);
      qYaw.setFromAxisAngle(Z, Math.atan2(p.ty, p.tx));
      qPitch.setFromAxisAngle(Y, -Math.atan(p.pend));
      carro.quaternion.copy(qYaw).multiply(qPitch);
      carro.visible = sc > -t.largoCarroM;
    });
    this.repintar();
    return this.puntoEn(id, s);
  }

  /** Posición, rumbo (grados, 0 = norte) y altitud real de un cadenamiento, sin mover nada. */
  puntoEn(id: string, s: number): { lngLat: LngLat; rumbo: number; z: number } | null {
    const e = this.entradas.get(id);
    if (!e) return null;
    const p = this.en(e.datos, s);
    const ll = this.aLngLat(p.x, p.y);
    return {
      lngLat: ll,
      rumbo: (90 - (Math.atan2(p.ty, p.tx) * 180) / Math.PI + 360) % 360,
      z: p.z / (this.cosLat0 / Math.cos(ll[1] * RAD)),
    };
  }

  /** Teleférico: todas las cabinas avanzan con el reloj. */
  moverCabinas(id: string, t: number) {
    const e = this.entradas.get(id);
    if (!e?.cabinas) return;
    const d = e.datos;
    const { porSentido, separacion } = e.cabinas.userData as { porSentido: number; separacion: number };
    const v = d.tec.vMaxKmh / 3.6;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Z = new THREE.Vector3(0, 0, 1);
    const tc = d.tec.tren;
    for (let sentido = 0; sentido < 2; sentido++) {
      for (let k = 0; k < porSentido; k++) {
        let s = (k * separacion + v * t) % d.longitud;
        if (sentido === 1) s = d.longitud - s;
        const p = this.en(d, s);
        const lateral = ((sentido === 0 ? -1 : 1) * d.tec.entreEjesM) / 2;
        q.setFromAxisAngle(Z, Math.atan2(p.ty, p.tx));
        m4.compose(
          new THREE.Vector3(p.x - p.ty * lateral, p.y + p.tx * lateral, p.z + tc.baseSobreViaM + tc.altoM / 2),
          q,
          new THREE.Vector3(tc.largoCarroM, tc.anchoM, tc.altoM),
        );
        e.cabinas.setMatrixAt(sentido * porSentido + k, m4);
      }
    }
    e.cabinas.instanceMatrix.needsUpdate = true;
    this.repintar();
  }

  esCable(id: string) {
    return !!this.entradas.get(id)?.cabinas;
  }
}

/**
 * Extruye una sección rectangular a lo largo del eje entre las muestras a0..a1.
 * offset: desplazamiento lateral (+ izquierda); medio: medio ancho;
 * arriba: elevación de la cara superior respecto a la vía; peralte: alto.
 */
function barrido(
  d: Datos3D,
  a0: number,
  a1: number,
  offset: number,
  medio: number,
  arriba: number,
  peralte: number,
  pos: number[],
  idx: number[],
) {
  const base = pos.length / 3;
  const cuenta = a1 - a0 + 1;
  // 4 caras × 2 vértices por muestra (aristas vivas)
  for (let i = a0; i <= a1; i++) {
    const nx = -d.ty[i];
    const ny = d.tx[i];
    const cx = d.x[i] + nx * offset;
    const cy = d.y[i] + ny * offset;
    const zTop = d.z[i] + arriba;
    const zBot = zTop - peralte;
    const L: [number, number] = [cx + nx * medio, cy + ny * medio];
    const R: [number, number] = [cx - nx * medio, cy - ny * medio];
    const TL = [L[0], L[1], zTop];
    const TR = [R[0], R[1], zTop];
    const BR = [R[0], R[1], zBot];
    const BL = [L[0], L[1], zBot];
    // cara superior, derecha, inferior, izquierda
    pos.push(...TL, ...TR, ...TR, ...BR, ...BR, ...BL, ...BL, ...TL);
  }
  for (let k = 0; k < cuenta - 1; k++) {
    for (let c = 0; c < 4; c++) {
      const a = base + k * 8 + c * 2;
      const b = a + 1;
      const a2 = a + 8;
      const b2 = b + 8;
      // Normales hacia afuera (verificado: cara superior apunta a +z)
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  // Tapas
  for (const [k, inv] of [
    [0, true],
    [cuenta - 1, false],
  ] as const) {
    const v = base + k * 8;
    const TL = v;
    const TR = v + 1;
    const BR = v + 3;
    const BL = v + 5;
    if (inv) idx.push(TL, BR, TR, TL, BL, BR);
    else idx.push(TL, TR, BR, TL, BR, BL);
  }
}
