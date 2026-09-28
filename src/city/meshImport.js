// Malhas de cenário com as texturas que vêm junto: GLB, GLTF (+ .bin + imagens), OBJ (+ .mtl + imagens)
// e FBX (texturas pelo nome do arquivo). As imagens da mesma pasta são guardadas no projeto e, quando
// o modelo não diz qual textura usar, elas são ligadas pelo nome ("Parede" -> parede_color.png,
// parede_normal.png...) — basta a pasta ter as texturas com os nomes certos.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { base64ToBytes } from '../core/util.js';
import { groupMaterialFiles, IMAGE_EXT, tokens } from '../world/pbrNames.js';
import { standardizeMaterials } from '../rig/rig.js';

export const MODEL_EXT = /\.(glb|gltf|fbx|obj)$/i;
export const RESOURCE_EXT = /\.(bin|mtl|png|jpe?g|webp|tga|bmp|gif|ktx2)$/i;

const base = (n) => n.split(/[\\/]/).pop().split('?')[0].toLowerCase();
const dirOf = (n) => n.split(/[\\/]/).slice(0, -1).join('/');

/**
 * Separa os arquivos em modelos, cada um com os recursos da mesma pasta (ou todos, se houver um modelo só).
 * @param {{name: string, bytes: Uint8Array}[]} entries
 */
export function groupModelFiles(entries) {
  const models = entries.filter((e) => MODEL_EXT.test(e.name));
  const res = entries.filter((e) => RESOURCE_EXT.test(e.name));
  return models.map((m) => {
    const d = dirOf(m.name);
    const same = res.filter((r) => dirOf(r.name) === d || dirOf(r.name).startsWith(d ? `${d}/` : ''));
    return { model: m, resources: models.length === 1 ? res : same };
  });
}

function mimeOf(name) {
  const e = name.split('.').pop().toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', bin: 'application/octet-stream', mtl: 'text/plain', tga: 'image/x-tga' }[e] || 'application/octet-stream';
}

/** Gerenciador que encontra os arquivos guardados pelo nome (sem ligar para a pasta ou maiúsculas). */
function managerFor(files) {
  const urls = new Map();
  const blobs = [];
  for (const [name, data] of Object.entries(files || {})) {
    const url = URL.createObjectURL(new Blob([base64ToBytes(data)], { type: mimeOf(name) }));
    blobs.push(url);
    urls.set(base(name), url);
    urls.set(name.toLowerCase(), url);
  }
  const m = new THREE.LoadingManager();
  m.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    let u = url;
    try { u = decodeURIComponent(url); } catch { /* fica como está */ }
    return urls.get(u.toLowerCase()) || urls.get(base(u)) || url;
  });
  m.addHandler(/\.tga$/i, new TGALoader(m));
  return { manager: m, dispose: () => setTimeout(() => blobs.forEach((b) => URL.revokeObjectURL(b)), 30000), has: (n) => urls.has(base(n)) };
}

const waitManager = (m) => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  m.onLoad = finish;
  m.onError = () => {};
  setTimeout(finish, 15000);
  // se nada estiver carregando, onLoad não é chamado
  setTimeout(() => { if (!m.itemsLoaded && !m.itemsTotal) finish(); }, 50);
});

/**
 * Carrega o modelo de uma entrada {format, data, files} com as texturas.
 * @returns {Promise<{object: THREE.Object3D, report: string[]}>}
 */
export async function loadModel(entry) {
  const bytes = base64ToBytes(entry.data);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fmt = entry.format.toLowerCase();
  const { manager, dispose } = managerFor(entry.files);
  let obj;
  try {
    if (fmt === 'glb' || fmt === 'gltf') {
      const src = fmt === 'gltf' ? new TextDecoder().decode(bytes) : buf;
      const gltf = await new Promise((res, rej) => new GLTFLoader(manager).parse(src, '', res, rej));
      obj = gltf.scene;
    } else if (fmt === 'fbx') {
      obj = new FBXLoader(manager).parse(buf, '');
      await waitManager(manager);
      standardizeMaterials(obj);
    } else if (fmt === 'obj') {
      const text = new TextDecoder().decode(bytes);
      const loader = new OBJLoader(manager);
      const lib = text.match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
      const mtlName = Object.keys(entry.files || {}).find((n) => /\.mtl$/i.test(n) && (!lib || base(n) === base(lib))) || Object.keys(entry.files || {}).find((n) => /\.mtl$/i.test(n));
      if (mtlName) {
        const mtl = new MTLLoader(manager).parse(new TextDecoder().decode(base64ToBytes(entry.files[mtlName])), '');
        mtl.preload();
        loader.setMaterials(mtl);
      }
      obj = loader.parse(text);
      await waitManager(manager);
      standardizeMaterials(obj);
    } else {
      throw new Error(`Formato não suportado: ${fmt}`);
    }
  } finally {
    dispose();
  }
  const report = await autoLinkTextures(obj, entry.files || {});
  return { object: obj, report };
}

const loader = new THREE.TextureLoader();
const loadTex = (files, name, srgb) => new Promise((resolve) => {
  const url = URL.createObjectURL(new Blob([base64ToBytes(files[name])], { type: mimeOf(name) }));
  const t = loader.load(url, () => { URL.revokeObjectURL(url); resolve(t); }, undefined, () => { URL.revokeObjectURL(url); resolve(null); });
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
});

const norm = (s) => tokens(`${s}.x`).filter((t) => !/^\d+$/.test(t) && !['mat', 'material', 'mtl', 'm', 't'].includes(t));

/**
 * Liga as texturas da pasta aos materiais sem textura, pelo nome do material ou da malha.
 * Um conjunto só -> vale para todos os materiais sem textura.
 */
export async function autoLinkTextures(object, files) {
  const names = Object.keys(files).filter((n) => IMAGE_EXT.test(n));
  const report = [];
  if (!names.length) return report;
  const groups = groupMaterialFiles(names);
  if (!groups.length) return report;
  const mats = [];
  object.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m && !mats.some((x) => x.m === m)) mats.push({ m, mesh: o.name });
  });
  const score = (g, m) => {
    const a = new Set([...norm(g.name), ...norm(g.dir.split('/').pop() || '')]);
    const b = [...norm(m.m.name || ''), ...norm(m.mesh || '')];
    return b.filter((t) => a.has(t)).length;
  };
  for (const item of mats) {
    const m = item.m;
    if (m.map && m.normalMap) continue;
    let best = null, bs = 0;
    for (const g of groups) { const s = score(g, item); if (s > bs) { bs = s; best = g; } }
    if (!best && groups.length === 1 && !m.map) best = groups[0];
    if (!best) continue;
    const f = best.files;
    if (f.color && !m.map) { m.map = await loadTex(files, f.color, true); if (m.color) m.color.set('#ffffff'); }
    if (f.normal && !m.normalMap) { m.normalMap = await loadTex(files, f.normal, false); if (f.normalDX) m.normalScale.set(1, -1); }
    if (m.isMeshStandardMaterial) {
      if (f.orm && !m.roughnessMap) {
        const t = await loadTex(files, f.orm, false);
        m.roughnessMap = t; m.metalnessMap = t; m.aoMap = t;
        m.roughness = 1; m.metalness = 1;
      }
      if (f.rough && !m.roughnessMap) { m.roughnessMap = await loadTex(files, f.rough, false); m.roughness = 1; }
      if (f.ao && !m.aoMap) m.aoMap = await loadTex(files, f.ao, false);
      if (f.metal && !m.metalnessMap) { m.metalnessMap = await loadTex(files, f.metal, false); m.metalness = 1; }
    }
    m.needsUpdate = true;
    report.push(`${m.name || item.mesh || 'material'} → ${best.name}`);
  }
  return report;
}
