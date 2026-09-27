// Normal da água gerada por código (repete sem emenda). As camadas do terreno usam fotos
// (assets/textures) e o usuário pode trocar qualquer uma por uma textura própria.
import * as THREE from 'three';
import { rng, clamp, lerp } from '../core/util.js';

function periodicNoise(seed, period) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * period + x0], b = g[y0 * period + x1];
    const c = g[y1 * period + x0], d = g[y1 * period + x1];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
}

// fBm periódico: u, v em [0,1). Retorna ~[0,1].
function makeFbm(seed, basePeriod, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({ n: periodicNoise(seed + o * 101, basePeriod << o), p: basePeriod << o, a: Math.pow(0.5, o) });
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (u, v) => {
    let s = 0;
    for (const l of layers) s += l.n(u * l.p, v * l.p) * l.a;
    return s / norm;
  };
}

function toTexture(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function paint(size, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const col = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, col);
      const i = (y * size + x) * 4;
      d[i] = clamp(col[0], 0, 255);
      d[i + 1] = clamp(col[1], 0, 255);
      d[i + 2] = clamp(col[2], 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx };
}

export function makeWaterNormalTexture(size = 256) {
  const h = makeFbm(51, 8, 4);
  const hv = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hv[y * size + x] = h(x / size, y / size);
  const { canvas } = paint(size, (u, v, out) => {
    const x = Math.floor(u * size), y = Math.floor(v * size);
    const l = hv[y * size + ((x - 1 + size) % size)], r = hv[y * size + ((x + 1) % size)];
    const d = hv[((y - 1 + size) % size) * size + x], t = hv[((y + 1) % size) * size + x];
    const nx = (l - r) * 6, ny = (d - t) * 6;
    const len = Math.hypot(nx, ny, 1);
    out[0] = (nx / len * 0.5 + 0.5) * 255;
    out[1] = (ny / len * 0.5 + 0.5) * 255;
    out[2] = (1 / len * 0.5 + 0.5) * 255;
  });
  return toTexture(canvas, false);
}
