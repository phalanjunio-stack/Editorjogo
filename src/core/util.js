// Utilidades gerais sem dependência do three.js (podem rodar no Node para testes).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

// Gerador pseudo-aleatório com semente (mulberry32).
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Nome seguro para arquivos/pastas.
export function slug(s, fallback = 'item') {
  const out = String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || fallback;
}

// ---- base64 <-> bytes (funciona no navegador e no Node) ----
export function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const float32ToBase64 = (arr) => bytesToBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
export const base64ToFloat32 = (b64) => {
  const bytes = base64ToBytes(b64);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
};

export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

// ---- Coordenadas L2 ----
// O mundo do Lineage 2 é dividido em regiões (tiles) de 32768 unidades.
// Tile X=20 e Y=18 começam na coordenada 0 (mesma convenção do L2J: TILE_ZERO_COORD_X/Y).
export const L2_TILE_SIZE = 32768;
export const L2_TILE_ZERO_X = 20;
export const L2_TILE_ZERO_Y = 18;

export function l2TileOrigin(tileX, tileY) {
  return { x: (tileX - L2_TILE_ZERO_X) * L2_TILE_SIZE, y: (tileY - L2_TILE_ZERO_Y) * L2_TILE_SIZE };
}

// Converte posição do editor (metros, Y para cima, Z para o sul) em coordenadas do servidor L2.
// O centro do terreno fica no centro do tile escolhido.
export function editorToL2(pos, server) {
  const o = l2TileOrigin(server.tileX, server.tileY);
  const k = server.unitsPerMeter;
  return {
    x: Math.round(o.x + L2_TILE_SIZE / 2 + pos.x * k),
    y: Math.round(o.y + L2_TILE_SIZE / 2 + pos.z * k),
    z: Math.round(server.zBase + pos.y * k),
  };
}

export function l2ToEditor(l2, server) {
  const o = l2TileOrigin(server.tileX, server.tileY);
  const k = server.unitsPerMeter;
  return {
    x: (l2.x - o.x - L2_TILE_SIZE / 2) / k,
    y: (l2.z - server.zBase) / k,
    z: (l2.y - o.y - L2_TILE_SIZE / 2) / k,
  };
}

// Heading do L2: 0..65535 = 0..360°, 0 olhando para +X (leste), crescendo em direção a +Y (sul).
// No editor guardamos o ângulo em graus com a mesma convenção (0 = leste, 90 = sul).
export function degToHeading(deg) {
  const d = ((deg % 360) + 360) % 360;
  return Math.round((d / 360) * 65536) % 65536;
}
export function headingToDeg(h) {
  return (h / 65536) * 360;
}

export function debounce(fn, ms = 200) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
