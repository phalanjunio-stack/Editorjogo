// Texturas procedurais (sem arquivos externos): grama, terra, rocha, neve e normal de água.
// Todas repetem sem emenda. O usuário pode trocar qualquer camada por uma imagem própria.
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

function mixRgb(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

// Desenha "pinceladas" repetíveis (quebram a uniformidade da grama/terra).
function strokes(ctx, size, count, seed, colorFn, lenMin, lenMax, width) {
  const r = rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    const len = lenMin + r() * (lenMax - lenMin);
    ctx.strokeStyle = colorFn(r);
    ctx.lineWidth = width * (0.6 + r() * 0.8);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
}

function blobs(ctx, size, count, seed, colorFn, rMin, rMax) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size;
    const rad = rMin + r() * (rMax - rMin);
    ctx.fillStyle = colorFn(r);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function makeGrassTexture(size = 512) {
  const big = makeFbm(11, 4, 4);
  const fine = makeFbm(12, 32, 3);
  const dark = [38, 66, 22], light = [104, 140, 52], dry = [128, 128, 60];
  const { canvas, ctx } = paint(size, (u, v, out) => {
    const b = big(u, v), f = fine(u, v);
    mixRgb(dark, light, clamp(b * 1.3 - 0.15 + (f - 0.5) * 0.5, 0, 1), out);
    const dr = clamp((big(u + 0.37, v + 0.71) - 0.55) * 3, 0, 1) * 0.5;
    mixRgb(out, dry, dr, out);
  });
  strokes(ctx, size, 2600, 5, (r) => `rgba(${20 + r() * 30},${55 + r() * 50},${10 + r() * 20},0.55)`, 5, 14, 1.4);
  strokes(ctx, size, 1400, 6, (r) => `rgba(${120 + r() * 50},${160 + r() * 40},${60 + r() * 30},0.45)`, 4, 10, 1.1);
  return toTexture(canvas);
}

export function makeDirtTexture(size = 512) {
  const big = makeFbm(21, 4, 4);
  const fine = makeFbm(22, 64, 2);
  const a = [74, 54, 36], b = [128, 98, 68];
  const { canvas, ctx } = paint(size, (u, v, out) => {
    const t = clamp(big(u, v) * 1.4 - 0.2 + (fine(u, v) - 0.5) * 0.6, 0, 1);
    mixRgb(a, b, t, out);
  });
  blobs(ctx, size, 420, 7, (r) => {
    const g = 90 + r() * 90;
    return `rgba(${g},${g * 0.9},${g * 0.78},0.75)`;
  }, 1.5, 4.5);
  blobs(ctx, size, 300, 8, () => 'rgba(40,28,18,0.35)', 2, 6);
  return toTexture(canvas);
}

export function makeRockTexture(size = 512) {
  const big = makeFbm(31, 4, 5);
  const crack = makeFbm(32, 8, 4);
  const strata = makeFbm(33, 2, 3);
  const a = [78, 76, 72], b = [150, 146, 138], moss = [70, 86, 50];
  return toTexture(paint(size, (u, v, out) => {
    const n = big(u, v);
    const c = Math.abs(crack(u, v) - 0.5);
    const s = Math.sin((v + strata(u, v) * 0.35) * Math.PI * 2 * 12) * 0.5 + 0.5;
    let t = clamp(n * 1.2 - 0.1 + s * 0.18, 0, 1);
    mixRgb(a, b, t, out);
    const k = clamp(1 - c * 14, 0, 1);
    out[0] *= 1 - k * 0.55; out[1] *= 1 - k * 0.55; out[2] *= 1 - k * 0.55;
    mixRgb(out, moss, clamp((big(u + 0.5, v + 0.2) - 0.62) * 3, 0, 0.45), out);
  }).canvas);
}

export function makeSnowTexture(size = 512) {
  const big = makeFbm(41, 4, 4);
  const fine = makeFbm(42, 64, 2);
  const a = [196, 206, 222], b = [250, 252, 255];
  const { canvas, ctx } = paint(size, (u, v, out) => {
    mixRgb(a, b, clamp(big(u, v) * 1.2 + (fine(u, v) - 0.5) * 0.3, 0, 1), out);
  });
  blobs(ctx, size, 900, 9, () => 'rgba(255,255,255,0.8)', 0.5, 1.2);
  return toTexture(canvas);
}

export function makeSandTexture(size = 512) {
  const big = makeFbm(61, 4, 4);
  const ripple = makeFbm(62, 2, 3);
  const fine = makeFbm(63, 128, 1);
  const a = [176, 150, 108], b = [222, 200, 156];
  return toTexture(paint(size, (u, v, out) => {
    const r = Math.sin((v * 22 + ripple(u, v) * 3) * Math.PI) * 0.5 + 0.5;
    mixRgb(a, b, clamp(big(u, v) * 1.1 + r * 0.18 + (fine(u, v) - 0.5) * 0.35 - 0.1, 0, 1), out);
  }).canvas);
}

export function makeMudTexture(size = 512) {
  const big = makeFbm(71, 4, 4);
  const wet = makeFbm(72, 8, 3);
  const a = [48, 38, 28], b = [92, 74, 52];
  const { canvas, ctx } = paint(size, (u, v, out) => {
    mixRgb(a, b, clamp(big(u, v) * 1.3 - 0.2, 0, 1), out);
    const puddle = clamp((wet(u, v) - 0.6) * 5, 0, 1);
    mixRgb(out, [36, 32, 30], puddle * 0.7, out);
  });
  blobs(ctx, size, 250, 10, () => 'rgba(20,14,8,0.35)', 2, 7);
  return toTexture(canvas);
}

export function makeCobbleTexture(size = 512) {
  const n = makeFbm(81, 16, 3);
  const r = rng(82);
  const cells = 8;
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + r() * 0.6) / cells, (j + 0.2 + r() * 0.6) / cells, 0.75 + r() * 0.35]);
  return toTexture(paint(size, (u, v, out) => {
    // Voronoi repetível (só as 9 células vizinhas): pedras com rejunte escuro
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9, tone = 1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj;
        const wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells;
        const p = pts[wj * cells + wi];
        const px = p[0] + Math.floor(ii / cells), py = p[1] + Math.floor(jj / cells);
        const dx = u - px, dy = v - py;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; tone = p[2]; } else if (d < d2) d2 = d;
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    const g = (110 + n(u, v) * 70) * tone;
    const mortar = clamp(edge * cells * 5, 0, 1);
    out[0] = lerp(52, g, mortar); out[1] = lerp(48, g * 0.97, mortar); out[2] = lerp(42, g * 0.92, mortar);
  }).canvas);
}

export function makePathTexture(size = 512) {
  const big = makeFbm(91, 4, 4);
  const fine = makeFbm(92, 64, 2);
  const a = [118, 96, 70], b = [160, 138, 104];
  const { canvas, ctx } = paint(size, (u, v, out) => {
    mixRgb(a, b, clamp(big(u, v) * 1.2 - 0.1 + (fine(u, v) - 0.5) * 0.5, 0, 1), out);
  });
  blobs(ctx, size, 900, 11, (r) => {
    const g = 110 + r() * 100;
    return `rgba(${g},${g * 0.95},${g * 0.88},0.85)`;
  }, 1, 2.8);
  return toTexture(canvas);
}

// Ordem das 8 camadas: Grama, Terra, Rocha, Neve, Areia, Lama, Pedra, Caminho
export const LAYER_GENERATORS = [makeGrassTexture, makeDirtTexture, makeRockTexture, makeSnowTexture, makeSandTexture, makeMudTexture, makeCobbleTexture, makePathTexture];

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
