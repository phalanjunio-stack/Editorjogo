// Importa texturas PBR para uma camada do terreno: .zip dos sites de textura, várias imagens
// soltas ou arquivos .tga. Tudo é reduzido para no máximo 1024 px e guardado no projeto em JPEG.
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { readZip } from '../core/unzip.js';
import { assignTextureSet, IMAGE_EXT } from './pbrNames.js';

const MAX = 1024;

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// bytes de imagem -> canvas (no máximo 1024 px, mantendo a proporção)
export async function decodeImage(name, bytes) {
  let src, w, h;
  if (/\.tga$/i.test(name)) {
    const tga = new TGALoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const full = canvasOf(tga.width, tga.height);
    const ctx = full.getContext('2d');
    const img = ctx.createImageData(tga.width, tga.height);
    img.data.set(tga.data);
    ctx.putImageData(img, 0, 0);
    src = full; w = tga.width; h = tga.height;
  } else {
    src = await createImageBitmap(new Blob([bytes]));
    w = src.width; h = src.height;
  }
  const scale = Math.min(1, MAX / Math.max(w, h));
  const c = canvasOf(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  return c;
}

// Separa um mapa ORM/ARM (R = oclusão, G = rugosidade) em duas imagens cinza.
function splitOrm(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const out = [canvasOf(c.width, c.height), canvasOf(c.width, c.height)];
  const imgs = out.map((o) => o.getContext('2d').createImageData(c.width, c.height));
  for (let k = 0; k < d.length; k += 4) {
    for (const [j, ch] of [[0, 0], [1, 1]]) {
      const v = d[k + ch];
      imgs[j].data[k] = imgs[j].data[k + 1] = imgs[j].data[k + 2] = v;
      imgs[j].data[k + 3] = 255;
    }
  }
  out.forEach((o, j) => o.getContext('2d').putImageData(imgs[j], 0, 0));
  return { ao: out[0], rough: out[1] };
}

export const toDataUrl = (canvas) => canvas.toDataURL('image/jpeg', 0.92);

// Arquivos (File[]) -> lista {name, bytes}, abrindo os .zip.
export async function expandFiles(files) {
  const out = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      for (const e of await readZip(bytes)) if (IMAGE_EXT.test(e.name)) out.push(e);
    } else if (IMAGE_EXT.test(f.name)) {
      out.push({ name: f.name, bytes });
    }
  }
  return out;
}

/**
 * Monta o conjunto PBR a partir dos arquivos escolhidos.
 * @returns {Promise<{maps: {texture?: string, normal?: string, rough?: string, ao?: string}, normalDX: boolean, found: string[]}>}
 */
export async function importTextureSet(files) {
  const entries = await expandFiles(files);
  if (!entries.length) throw new Error('nenhuma imagem encontrada (use PNG, JPG, WEBP, TGA ou um .zip com elas)');
  const set = assignTextureSet(entries.map((e) => e.name));
  const byName = new Map(entries.map((e) => [e.name, e]));
  const maps = {};
  const found = [];
  const load = (name) => decodeImage(name, byName.get(name).bytes);
  if (set.color) { maps.texture = toDataUrl(await load(set.color)); found.push('cor'); }
  if (set.normal) { maps.normal = toDataUrl(await load(set.normal)); found.push(set.normalDX ? 'normal (DirectX)' : 'normal'); }
  if (set.orm) {
    const { ao, rough } = splitOrm(await load(set.orm));
    if (!set.rough) maps.rough = toDataUrl(rough);
    if (!set.ao) maps.ao = toDataUrl(ao);
    found.push('ORM');
  }
  if (set.rough) { maps.rough = toDataUrl(await load(set.rough)); found.push('rugosidade'); }
  if (set.ao) { maps.ao = toDataUrl(await load(set.ao)); found.push('AO'); }
  if (!maps.texture && !maps.normal && !maps.rough && !maps.ao) throw new Error('não reconheci os mapas pelos nomes dos arquivos');
  return { maps, normalDX: set.normalDX, found };
}

// Uma imagem só, para um mapa específico.
export async function importSingleMap(file) {
  const [e] = await expandFiles([file]);
  if (!e) throw new Error('arquivo de imagem não suportado');
  return toDataUrl(await decodeImage(e.name, e.bytes));
}

export function loadDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = url;
  });
}
