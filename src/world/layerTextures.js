// Texturas PBR das 8 camadas do terreno, guardadas em dois "texture arrays" (assim o shader usa
// só 2 texturas em vez de 32, o que cabe em qualquer placa de vídeo):
//   albedo: RGB = cor, A = oclusão (AO)
//   normal: RGB = normal (+verde = +v), A = rugosidade
import * as THREE from 'three';

function makeArray(data, size, count, srgb) {
  const t = new THREE.DataArrayTexture(data, size, size, count);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

let scratch = null;
function pixels(src, size) {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.getContext('2d', { willReadFrequently: true });
  }
  scratch.width = scratch.height = size;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(src, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export class LayerTextures {
  constructor(size = 1024, count = 8) {
    this.count = count;
    this.sources = new Array(count).fill(null);
    this.previews = Array.from({ length: count }, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      return c;
    });
    this.avg = Array.from({ length: count }, () => [128, 128, 128]);
    this._alloc(size);
  }

  _alloc(size) {
    this.size = size;
    const n = size * size * 4 * this.count;
    this.albedo?.dispose();
    this.normal?.dispose();
    this.albedoData = new Uint8Array(n);
    this.normalData = new Uint8Array(n);
    this.albedo = makeArray(this.albedoData, size, this.count, true);
    this.normal = makeArray(this.normalData, size, this.count, false);
  }

  // Muda a resolução (qualidade gráfica). Retorna true se recriou as texturas.
  setSize(size) {
    if (size === this.size) return false;
    this._alloc(size);
    for (let i = 0; i < this.count; i++) if (this.sources[i]) this._write(i, true);
    return true;
  }

  /**
   * @param {number} i
   * @param {{color: CanvasImageSource, normal?: CanvasImageSource|null, rough?: CanvasImageSource|null,
   *          ao?: CanvasImageSource|null, normalDX?: boolean, roughness?: number}} src
   */
  setLayer(i, src) {
    this.sources[i] = src;
    this._write(i, false);
  }

  _write(i, full) {
    const S = this.size, src = this.sources[i];
    const A = this.albedoData, N = this.normalData;
    const off = i * S * S * 4;
    const col = pixels(src.color, S).slice();
    const ao = src.ao ? pixels(src.ao, S).slice() : null;
    let sr = 0, sg = 0, sb = 0;
    for (let k = 0; k < S * S * 4; k += 4) {
      A[off + k] = col[k];
      A[off + k + 1] = col[k + 1];
      A[off + k + 2] = col[k + 2];
      A[off + k + 3] = ao ? ao[k] : 255;
      sr += col[k]; sg += col[k + 1]; sb += col[k + 2];
    }
    const px = S * S;
    this.avg[i] = [sr / px, sg / px, sb / px];

    const rough = src.rough ? pixels(src.rough, S).slice() : null;
    const baseRough = Math.round((src.roughness ?? 0.9) * 255);
    if (src.normal) {
      const nrm = pixels(src.normal, S);
      // As imagens sobem sem inverter o eixo v: a normal "OpenGL" (verde = para cima na imagem)
      // precisa do verde invertido; a "DirectX" (padrão do Unreal) já está no sentido certo.
      for (let k = 0; k < S * S * 4; k += 4) {
        N[off + k] = nrm[k];
        N[off + k + 1] = src.normalDX ? nrm[k + 1] : 255 - nrm[k + 1];
        N[off + k + 2] = nrm[k + 2];
        N[off + k + 3] = rough ? rough[k] : baseRough;
      }
    } else {
      this._deriveNormal(col, S, off, rough, baseRough);
    }

    const pv = this.previews[i].getContext('2d');
    pv.clearRect(0, 0, 128, 128);
    pv.drawImage(src.color, 0, 0, 128, 128);

    for (const t of [this.albedo, this.normal]) {
      if (!full) t.addLayerUpdate(i);
      t.needsUpdate = true;
    }
  }

  // Sem mapa normal: cria um relevo a partir da claridade da cor (pedras claras "saltam").
  _deriveNormal(col, S, off, rough, baseRough) {
    const N = this.normalData;
    const h = new Float32Array(S * S);
    for (let p = 0, k = 0; p < S * S; p++, k += 4) h[p] = (col[k] * 0.299 + col[k + 1] * 0.587 + col[k + 2] * 0.114) / 255;
    // suaviza 3x3 (tira o chiado)
    const b = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      const y0 = ((y - 1 + S) % S) * S, y1 = y * S, y2 = ((y + 1) % S) * S;
      for (let x = 0; x < S; x++) {
        const x0 = (x - 1 + S) % S, x2 = (x + 1) % S;
        b[y1 + x] = (h[y0 + x0] + h[y0 + x] + h[y0 + x2] + h[y1 + x0] + h[y1 + x] + h[y1 + x2] + h[y2 + x0] + h[y2 + x] + h[y2 + x2]) / 9;
      }
    }
    const k = 5 * (S / 512);
    for (let y = 0; y < S; y++) {
      const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, yc = y * S;
      for (let x = 0; x < S; x++) {
        const dx = b[yc + (x + 1) % S] - b[yc + (x - 1 + S) % S];
        const dy = b[yp + x] - b[ym + x];
        let nx = -dx * k, ny = -dy * k, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const q = off + (yc + x) * 4;
        N[q] = (nx * 0.5 + 0.5) * 255;
        N[q + 1] = (ny * 0.5 + 0.5) * 255;
        N[q + 2] = (nz * 0.5 + 0.5) * 255;
        N[q + 3] = rough ? rough[(yc + x) * 4] : baseRough;
      }
    }
  }

  dispose() {
    this.albedo.dispose();
    this.normal.dispose();
  }
}
