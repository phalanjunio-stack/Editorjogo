// Biblioteca de materiais PBR: os conjuntos embutidos (fotos do Poly Haven) e os que o usuário
// importa (pasta, .zip ou arquivos soltos, reconhecidos pelos nomes). Cada material tem até 5 mapas:
// cor, normal, rugosidade, oclusão (AO), altura e metal. Os mapas cinza são juntados num só (ARH:
// R oclusão, G rugosidade, B altura) para o shader do Construtor.
import * as THREE from 'three';
import { loadTexture } from '../core/textureLoader.js';
import { MATERIAL_SETS, BUILDING_SETS, TERRAIN_SETS } from '../assets.js';
import { groupMaterialFiles, IMAGE_EXT } from '../world/pbrNames.js';
import { decodeImage } from '../world/pbrImport.js';
import { readZip } from '../core/unzip.js';
import { uid } from '../core/util.js';
import { weatherMaterial } from './weather.js';

export const MAT_CATEGORIES = [
  { id: 'tijolo', label: 'Tijolo e reboco', icon: 'wall' },
  { id: 'madeira', label: 'Madeira', icon: 'trees' },
  { id: 'pedra', label: 'Pedra', icon: 'stone' },
  { id: 'telhado', label: 'Telhado', icon: 'home' },
  { id: 'detalhe', label: 'Detalhes', icon: 'item' },
  { id: 'chao', label: 'Chão e terreno', icon: 'mountain' },
  { id: 'decalque', label: 'Decalques', icon: 'image' },
  { id: 'outro', label: 'Outros', icon: 'cube' },
];
export const CATEGORY_MAP = new Map(MAT_CATEGORIES.map((c) => [c.id, c]));

// tile = tamanho real de uma repetição da foto, em metros; depth = profundidade do relevo em metros
const B = (id, name, category, set, tile, extra = {}) => ({
  id, name, category, builtin: true, tile, tint: '#ffffff', roughness: 1, metalness: 0, normalScale: 1, depth: 0.025,
  maps: { color: set.color, normal: set.normal, arh: set.arh || set.arm }, hasHeight: !!set.arh || extra.hasHeight, ...extra,
});
const MS = MATERIAL_SETS, BS = BUILDING_SETS;
export const BUILTIN_MATERIALS = [
  B('tijolo_novo', 'Tijolo novo', 'tijolo', MS.tijolo_novo, 1, { depth: 0.02 }),
  B('tijolo_velho', 'Tijolo envelhecido', 'tijolo', MS.tijolo_velho, 2, { depth: 0.025 }),
  B('tijolo_rebocado', 'Tijolo rebocado', 'tijolo', MS.tijolo_rebocado, 1.5),
  B('reboco', 'Reboco', 'tijolo', BS.plaster, 2, { hasHeight: true, depth: 0.012 }),
  B('reboco_quebrado', 'Reboco quebrado', 'tijolo', MS.reboco_quebrado, 1.85),
  B('reboco_musgo', 'Reboco com musgo', 'tijolo', MS.reboco_musgo, 1.8),
  B('taipa', 'Taipa (barro)', 'tijolo', MS.taipa, 2, { depth: 0.015 }),
  B('madeira', 'Madeira medieval', 'madeira', BS.wood, 2, { hasHeight: true, depth: 0.01 }),
  B('madeira_escura', 'Madeira escura', 'madeira', MS.madeira_escura, 2, { depth: 0.01 }),
  B('madeira_clara', 'Madeira clara', 'madeira', MS.madeira_clara, 0.5, { depth: 0.008 }),
  B('madeira_velha', 'Madeira envelhecida', 'madeira', MS.madeira_velha, 2, { depth: 0.01 }),
  B('madeira_rachada', 'Madeira rachada', 'madeira', MS.madeira_rachada, 2, { depth: 0.012 }),
  B('madeira_umida', 'Madeira úmida (musgo)', 'madeira', MS.madeira_umida, 1, { depth: 0.012 }),
  B('toras', 'Toras (cabana)', 'madeira', MS.toras, 1.25, { depth: 0.05 }),
  B('pedra', 'Pedra de castelo', 'pedra', BS.stone, 2.5, { hasHeight: true, depth: 0.04 }),
  B('pedra_bruta', 'Pedra bruta', 'pedra', MS.pedra_bruta, 1.52, { depth: 0.05 }),
  B('pedra_talhada', 'Pedra talhada', 'pedra', MS.pedra_talhada, 2.1, { depth: 0.035 }),
  B('alvenaria_pesada', 'Alvenaria pesada', 'pedra', MS.alvenaria_pesada, 2.5, { depth: 0.05 }),
  B('bloco_antigo', 'Bloco antigo', 'pedra', MS.bloco_antigo, 1.5, { depth: 0.04 }),
  B('pedra_musgo', 'Pedra com musgo', 'pedra', MS.pedra_musgo, 2, { depth: 0.035 }),
  B('telha', 'Telha cerâmica', 'telhado', BS.roofTiles, 2.5, { hasHeight: true, depth: 0.04 }),
  B('telha_velha', 'Telha velha', 'telhado', MS.telha_velha, 1.5, { depth: 0.035 }),
  B('ardosia', 'Ardósia', 'telhado', BS.roofSlates, 3, { hasHeight: true, depth: 0.025 }),
  B('shingle_madeira', 'Shingle de madeira', 'telhado', MS.shingle_madeira, 1.57, { depth: 0.02 }),
  B('palha', 'Palha (sapê)', 'telhado', MS.palha, 1.2, { depth: 0.05 }),
  B('porta_madeira', 'Porta de madeira', 'detalhe', MS.porta_madeira, 2, { depth: 0.012 }),
  B('ferro_velho', 'Ferro enferrujado', 'detalhe', MS.ferro_velho, 1, { metalness: 0.55, depth: 0.004 }),
  B('tecido_corda', 'Tecido / corda', 'detalhe', MS.tecido_corda, 0.27, { depth: 0.004 }),
  ...['Grama', 'Terra', 'Rocha', 'Neve', 'Areia', 'Lama', 'Calçamento', 'Trilha'].map((n, i) =>
    B(`chao_${i}`, n, 'chao', TERRAIN_SETS[i], [2, 2, 3, 2, 15, 1.3, 1, 2.17][i], { hasHeight: false })),
];
const BUILTIN_MAP = new Map(BUILTIN_MATERIALS.map((m) => [m.id, m]));

const MAX = 1024;
const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function grayData(c, S) {
  const t = canvasOf(S, S);
  const x = t.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0, S, S);
  return x.getImageData(0, 0, S, S).data;
}

/** Junta AO, rugosidade e altura (ou um ORM) numa imagem ARH. */
function packArh({ ao, rough, orm, height }, S) {
  const c = canvasOf(S, S);
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(S, S);
  const o = orm ? grayData(orm, S) : null;
  const a = ao ? grayData(ao, S) : null;
  const r = rough ? grayData(rough, S) : null;
  const h = height ? grayData(height, S) : null;
  let lo = 255, hi = 0;
  if (h) for (let k = 0; k < h.length; k += 4) { if (h[k] < lo) lo = h[k]; if (h[k] > hi) hi = h[k]; }
  const hk = 255 / Math.max(1, hi - lo);
  for (let k = 0; k < out.data.length; k += 4) {
    out.data[k] = a ? a[k] : o ? o[k] : 255;
    out.data[k + 1] = r ? r[k] : o ? o[k + 1] : 200;
    out.data[k + 2] = h ? Math.round((h[k] - lo) * hk) : 128;
    out.data[k + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function flipGreen(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let k = 1; k < d.data.length; k += 4) d.data[k] = 255 - d.data[k];
  ctx.putImageData(d, 0, 0);
  return c;
}

const jpeg = (c) => c.toDataURL('image/jpeg', 0.9);

export class MaterialLibrary {
  constructor(app) {
    this.app = app;
    this.cache = new Map(); // chave -> THREE.Material
    this.texCache = new Map(); // id -> {color, normal, arh}
  }

  get user() {
    return (this.app.project.materials ||= []);
  }

  list(category = null) {
    const all = [...BUILTIN_MATERIALS, ...this.user];
    return category ? all.filter((m) => m.category === category) : all;
  }

  get(id) {
    return BUILTIN_MAP.get(id) || this.user.find((m) => m.id === id) || null;
  }

  /** Texturas three.js do material (as do usuário são montadas na primeira vez). */
  textures(id) {
    const m = this.get(id);
    if (!m) return null;
    const key = `${id}|${m.rev || 0}`;
    if (this.texCache.has(key)) return this.texCache.get(key);
    let t;
    if (m.builtin || m.maps.arh) {
      t = {
        color: m.maps.color ? loadTexture(m.maps.color) : null,
        normal: m.maps.normal ? loadTexture(m.maps.normal, { srgb: false }) : null,
        arh: m.maps.arh ? loadTexture(m.maps.arh, { srgb: false }) : null,
      };
    } else {
      t = { color: m.maps.color ? loadTexture(m.maps.color) : null, normal: m.maps.normal ? loadTexture(m.maps.normal, { srgb: false }) : null, arh: null };
    }
    this.texCache.set(key, t);
    return t;
  }

  /** Dados para o shader: texturas + tamanho, tinta etc. */
  layer(id, overrides = {}) {
    const m = this.get(id) || BUILTIN_MAP.get('reboco');
    const t = this.textures(m.id);
    return { ...t, tile: m.tile, tint: overrides.tint || m.tint, roughness: m.roughness, metalness: m.metalness, normalScale: m.normalScale, hasHeight: m.hasHeight !== false, depth: m.depth ?? 0.025 };
  }

  /**
   * Material three.js (com envelhecimento) — reaproveitado quando os parâmetros são iguais.
   * slot: {mat, tint, uv, blend, rot}; weather: WEATHER_DEFAULTS + seed
   */
  material(slot, weather = {}) {
    const key = JSON.stringify([slot.mat, slot.tint, slot.uv, slot.blend, slot.blendTint, slot.rot, weather, this.get(slot.mat)?.rev, this.get(slot.blend)?.rev]);
    let m = this.cache.get(key);
    if (!m) {
      const a = this.layer(slot.mat, { tint: slot.tint });
      const b = slot.blend ? this.layer(slot.blend, { tint: slot.blendTint }) : null;
      m = weatherMaterial(a, b, { ...weather, uvScale: slot.uv || 1, uvRot: slot.rot || 0 });
      m.name = `${slot.mat}${slot.blend ? `+${slot.blend}` : ''}`;
      this.cache.set(key, m);
    }
    return m;
  }

  /** Esfera de prévia (para as miniaturas e a aba Materiais). */
  previewObject(id, weather = { colorVar: 0, wear: 0, moss: 0, dirt: 0, humidity: 0 }) {
    const g = new THREE.SphereGeometry(0.5, 64, 40);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI, uv.getY(i) * Math.PI * 0.5);
    const mesh = new THREE.Mesh(g, this.material({ mat: id, uv: 1 }, { ...weather, parallax: 0.6 }));
    mesh.position.y = 0.5;
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.userData.keepGeometry = false;
    return grp;
  }

  // ------------------------------------------------------------ importar
  /**
   * Importa materiais de arquivos {name, bytes} (pastas e .zip já abertos ou não).
   * @returns {Promise<object[]>} materiais criados
   */
  async importEntries(entries, { category = null, name = null } = {}) {
    const flat = [];
    for (const e of entries) {
      if (/\.zip$/i.test(e.name)) {
        const base = e.name.replace(/\.zip$/i, '').split(/[\\/]/).pop();
        for (const z of await readZip(e.bytes)) flat.push({ name: `${base}/${z.name}`, bytes: z.bytes });
      } else if (IMAGE_EXT.test(e.name)) flat.push(e);
    }
    const byName = new Map(flat.map((e) => [e.name, e]));
    const groups = groupMaterialFiles(flat.map((e) => e.name));
    if (!groups.length) throw new Error('não achei texturas (cor ou normal) nesses arquivos');
    const made = [];
    for (const g of groups) {
      const load = async (f) => (f ? decodeImage(f, byName.get(f).bytes) : null);
      const [color, normal, rough, ao, orm, height, metal] = await Promise.all(['color', 'normal', 'rough', 'ao', 'orm', 'height', 'metal'].map((k) => load(g.files[k])));
      const S = Math.min(MAX, Math.max(color?.width || 0, normal?.width || 0, 256));
      const maps = {};
      if (color) maps.color = jpeg(color);
      if (normal) maps.normal = jpeg(g.files.normalDX ? flipGreen(normal) : normal);
      if (rough || ao || orm || height) maps.arh = jpeg(packArh({ ao, rough, orm, height }, S));
      let metalness = 0;
      if (metal) {
        const d = grayData(metal, 64);
        let s = 0;
        for (let k = 0; k < d.length; k += 4) s += d[k];
        metalness = Math.round((s / (d.length / 4) / 255) * 100) / 100;
      }
      const found = Object.entries(g.files).filter(([k, v]) => v && k !== 'normalDX').map(([k]) => k);
      const mat = {
        id: uid('mat'),
        name: groups.length === 1 && name ? name : g.name,
        category: category || guessCategory(`${g.dir} ${g.name}`),
        tile: 2,
        tint: '#ffffff',
        roughness: 1,
        metalness,
        normalScale: 1,
        depth: 0.025,
        hasHeight: !!height,
        maps,
        found,
      };
      this.user.push(mat);
      made.push(mat);
    }
    this.app.markDirty?.();
    this.app.events?.emit('materials-changed');
    return made;
  }

  /** Troca um mapa de um material do usuário (kind: color, normal, rough, ao, height). */
  async replaceMap(id, kind, entry) {
    const m = this.user.find((x) => x.id === id);
    if (!m) throw new Error('só dá para trocar mapas dos seus materiais');
    const img = await decodeImage(entry.name, entry.bytes);
    if (kind === 'color') m.maps.color = jpeg(img);
    else if (kind === 'normal') m.maps.normal = jpeg(img);
    else {
      const cur = m.maps.arh ? await loadImageCanvas(m.maps.arh) : null;
      const S = Math.min(MAX, Math.max(img.width, 256));
      const split = cur ? splitArh(cur, S) : {};
      split[kind === 'height' ? 'height' : kind] = img;
      m.maps.arh = jpeg(packArh(split, S));
      if (kind === 'height') m.hasHeight = true;
    }
    this.touch(m);
  }

  /** Mapas no formato das camadas do terreno ({texture, normal, rough, ao}). */
  async terrainMaps(id) {
    const m = this.get(id);
    if (!m) throw new Error('material não existe');
    const out = { texture: m.maps.color || null, normal: m.maps.normal || null, rough: null, ao: null };
    if (m.maps.arh) {
      const c = await loadImageCanvas(m.maps.arh);
      const S = Math.min(MAX, c.width);
      const { ao, rough } = splitArh(c, S);
      out.ao = jpeg(ao);
      out.rough = jpeg(rough);
    }
    return out;
  }

  /** Cópia editável de um material (os embutidos não mudam). */
  duplicate(id) {
    const m = this.get(id);
    if (!m) return null;
    const copy = { ...JSON.parse(JSON.stringify(m)), id: uid('mat'), name: `${m.name} (cópia)`, builtin: false, rev: 0 };
    delete copy.builtin;
    this.user.push(copy);
    this.touch(copy);
    return copy;
  }

  touch(m) {
    m.rev = (m.rev || 0) + 1;
    this.app.markDirty?.();
    this.app.events?.emit('materials-changed');
  }

  remove(id) {
    const p = this.app.project;
    p.materials = this.user.filter((m) => m.id !== id);
    this.app.markDirty?.();
    this.app.events?.emit('materials-changed');
  }
}

function loadImageCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = canvasOf(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = url;
  });
}

function splitArh(c, S) {
  const d = grayData(c, S);
  const mk = (ch) => {
    const o = canvasOf(S, S);
    const x = o.getContext('2d');
    const img = x.createImageData(S, S);
    for (let k = 0; k < d.length; k += 4) { img.data[k] = img.data[k + 1] = img.data[k + 2] = d[k + ch]; img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0);
    return o;
  };
  return { ao: mk(0), rough: mk(1), height: mk(2) };
}

const CATEGORY_WORDS = [
  ['telhado', /roof|telha|telhado|slate|ardosia|shingle|thatch|palha|sape/],
  ['tijolo', /brick|tijolo|plaster|reboco|stucco|taipa|adobe|clay|barro/],
  ['madeira', /wood|madeira|plank|tabua|timber|log|tora|bark/],
  ['pedra', /stone|pedra|rock|rocha|cobble|masonry|castle|block|granite|marble/],
  ['detalhe', /metal|iron|ferro|rust|door|porta|window|janela|rope|corda|fabric|tecido/],
  ['chao', /ground|grass|grama|dirt|terra|sand|areia|mud|lama|soil|gravel|path|floor|chao/],
  ['decalque', /decal|decalque|leak|stain|mancha|crack|rachadura/],
];

export function guessCategory(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(t)) return cat;
  return 'outro';
}
