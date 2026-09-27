// Gerador de arquivos .zip simples (sem dependências). Usa compressão deflate quando o
// navegador suporta CompressionStream('deflate-raw'); caso contrário, armazena sem compressão.
import { crc32 } from './crc32.js';
import { textToBytes } from './util.js';

async function deflateRaw(bytes) {
  try {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(cs);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const zlib = await import('node:zlib');
    return new Uint8Array(zlib.deflateRawSync(bytes));
  } catch {
    return null;
  }
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export class ZipWriter {
  constructor() {
    this.files = [];
  }

  /** @param {string} path  @param {string|Uint8Array} data */
  add(path, data) {
    const bytes = typeof data === 'string' ? textToBytes(data) : data;
    this.files.push({ path: path.replace(/\\/g, '/').replace(/^\/+/, ''), bytes });
  }

  has(path) {
    return this.files.some((f) => f.path === path);
  }

  async build() {
    const { time, date } = dosDateTime();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of this.files) {
      const name = textToBytes(f.path);
      const crc = crc32(f.bytes);
      let method = 0;
      let data = f.bytes;
      if (f.bytes.length > 64) {
        const comp = await deflateRaw(f.bytes);
        if (comp && comp.length < f.bytes.length) { method = 8; data = comp; }
      }
      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // nomes em UTF-8
      lv.setUint16(8, method, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, f.bytes.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);
      locals.push(lh, data);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, f.bytes.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      centrals.push(ch);
      offset += lh.length + data.length;
    }
    const cdSize = centrals.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.files.length, true);
    ev.setUint16(10, this.files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, end];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}
