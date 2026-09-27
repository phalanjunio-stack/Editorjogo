// Carrega texturas embutidas (data URL) uma vez só e conta quantas ainda estão carregando,
// para as miniaturas do Navegador de Conteúdo esperarem as texturas antes de fotografar.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();
let pending = 0;

/**
 * @param {string} url
 * @param {{srgb?: boolean, repeat?: number|{x: number, y: number}|null, premultiply?: boolean}} [opts]
 */
export function loadTexture(url, { srgb = true, repeat = null, premultiply = false } = {}) {
  const r = typeof repeat === 'number' ? { x: repeat, y: repeat } : repeat;
  const key = `${url}|${r ? `${r.x},${r.y}` : ''}|${srgb}|${premultiply}`;
  if (!cache.has(key)) {
    pending++;
    const done = () => { pending--; };
    const t = loader.load(url, done, undefined, done);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.premultiplyAlpha = premultiply;
    if (r) t.repeat.set(r.x, r.y);
    cache.set(key, t);
  }
  return cache.get(key);
}

export const texturesPending = () => pending;
