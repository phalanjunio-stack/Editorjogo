// Codificador PNG em tons de cinza (8 ou 16 bits), necessário para exportar
// heightmaps de 16 bits que o Landscape do Unreal Engine 5 aceita.
import { crc32 } from './crc32.js';

async function zlibCompress(bytes) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate'); // "deflate" = formato zlib (RFC 1950), o que o PNG exige
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.deflateSync(bytes));
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Uint16Array} pixels  uma amostra por pixel, linha 0 = topo
 * @param {8|16} bitDepth
 */
export async function encodeGrayPNG(width, height, pixels, bitDepth = 16) {
  const bpp = bitDepth / 8;
  const stride = width * bpp + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0; // filtro "None"
    for (let x = 0; x < width; x++) {
      const v = pixels[y * width + x];
      if (bitDepth === 16) {
        raw[row + 1 + x * 2] = (v >> 8) & 255; // PNG usa big-endian
        raw[row + 2 + x * 2] = v & 255;
      } else {
        raw[row + 1 + x] = v & 255;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = 0; // tons de cinza
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = await zlibCompress(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
