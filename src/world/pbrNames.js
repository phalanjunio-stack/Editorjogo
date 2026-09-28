// Descobre qual mapa PBR é cada arquivo pelo nome, nos padrões mais comuns:
//   Poly Haven:  rocks_diff_2k.jpg, rocks_nor_gl_2k.jpg, rocks_rough_2k.jpg, rocks_arm_2k.jpg
//   ambientCG:   Rock030_2K-JPG_Color.jpg, _NormalGL.jpg, _NormalDX.jpg, _Roughness.jpg, _AmbientOcclusion.jpg
//   Megascans:   Rock_Albedo.jpg, Rock_Normal.jpg, Rock_Roughness.jpg, Rock_AO.jpg
//   Unreal:      T_Rock_D.png, T_Rock_N.png, T_Rock_R.png, T_Rock_ORM.png (normais no padrão DirectX)

export const IMAGE_EXT = /\.(png|jpe?g|webp|tga|bmp|gif)$/i;

const SKIP = new Set(['preview', 'thumb', 'thumbnail', 'disp', 'displacement', 'height', 'bump', 'metal', 'metallic', 'metalness', 'opacity', 'alpha', 'mask', 'emissive', 'emission', 'specular', 'spec', 'gloss', 'glossiness', 'cavity', 'translucency', 'idmap', 'id', 'sss']);
const ORM = new Set(['orm', 'arm']);
const NORMAL = new Set(['normal', 'normalgl', 'normaldx', 'nrm', 'nor', 'nml', 'norm', 'n']);
const ROUGH = new Set(['rough', 'roughness', 'r', 'rugosidade', 'aspereza']);
const AO = new Set(['ao', 'ambientocclusion', 'occlusion', 'ambient', 'oclusao']);
const COLOR = new Set(['albedo', 'basecolor', 'diffuse', 'diff', 'color', 'colour', 'col', 'd', 'bc', 'alb', 'base', 'cor', 'difusa']);

export function tokens(filename) {
  const base = filename.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  return base.toLowerCase().split(/[_\-\s.]+/).filter(Boolean);
}

/**
 * @returns {{kind: 'color'|'normal'|'rough'|'ao'|'orm'|null, dx: boolean}}
 */
export function classifyTexture(filename) {
  if (!IMAGE_EXT.test(filename)) return { kind: null, dx: false };
  const t = tokens(filename);
  const has = (set) => t.some((x) => set.has(x));
  const unrealNaming = t[0] === 't';
  if (has(SKIP)) return { kind: null, dx: false };
  if (has(ORM)) return { kind: 'orm', dx: false };
  if (has(NORMAL)) {
    const gl = t.includes('gl') || t.includes('normalgl') || t.includes('opengl');
    const dx = t.includes('dx') || t.includes('normaldx') || t.includes('directx') || (unrealNaming && !gl);
    return { kind: 'normal', dx };
  }
  if (has(ROUGH)) return { kind: 'rough', dx: false };
  if (has(AO)) return { kind: 'ao', dx: false };
  if (has(COLOR)) return { kind: 'color', dx: false };
  return { kind: null, dx: false };
}

/**
 * Monta um conjunto a partir de vários arquivos. Se nenhum for reconhecido como cor
 * e sobrar exatamente um arquivo sem tipo, ele vira a cor.
 * @param {string[]} names
 * @returns {{color?: string, normal?: string, rough?: string, ao?: string, orm?: string, normalDX: boolean}}
 */
export function assignTextureSet(names) {
  const set = { normalDX: false };
  const unknown = [];
  // prefere GL quando o pacote traz as duas versões da normal
  const sorted = [...names].sort((a, b) => Number(classifyTexture(a).dx) - Number(classifyTexture(b).dx));
  for (const name of sorted) {
    if (!IMAGE_EXT.test(name)) continue;
    const { kind, dx } = classifyTexture(name);
    if (!kind) { if (!isSkipped(name)) unknown.push(name); continue; }
    if (set[kind]) continue;
    set[kind] = name;
    if (kind === 'normal') set.normalDX = dx;
  }
  if (!set.color && unknown.length === 1) set.color = unknown[0];
  return set;
}

function isSkipped(name) {
  return tokens(name).some((x) => SKIP.has(x));
}

// ---------------------------------------------------------------- biblioteca de materiais
// Aqui altura e metal também contam (3 a 5 mapas por material).
const HEIGHT = new Set(['disp', 'displacement', 'height', 'bump', 'heightmap', 'h', 'altura', 'relevo']);
const METAL = new Set(['metal', 'metallic', 'metalness', 'm', 'metalico']);
const NOISE = new Set(['1k', '2k', '4k', '8k', '16k', 'jpg', 'jpeg', 'png', 'tga', 'webp', 'gl', 'dx', 'opengl', 'directx', 'map', 'tex', 'texture']);

/** Como classifyTexture, mas reconhece também altura e metal. */
export function classifyMap(filename) {
  if (!IMAGE_EXT.test(filename)) return { kind: null, dx: false };
  const t = tokens(filename);
  const last = t[t.length - 1];
  if (t.some((x) => HEIGHT.has(x) && x !== 'h') || (t[0] === 't' && last === 'h')) return { kind: 'height', dx: false };
  if (t.some((x) => METAL.has(x) && x !== 'm') || (t[0] === 't' && last === 'm')) return { kind: 'metal', dx: false };
  return classifyTexture(filename);
}

const CHANNEL_WORDS = new Set([...ORM, ...NORMAL, ...ROUGH, ...AO, ...COLOR, ...HEIGHT, ...METAL, ...SKIP]);

/** Nome base do material: tira o tipo de mapa, resolução e extensão ("Tijolo_2K_Normal.png" -> "tijolo"). */
export function materialBaseName(filename) {
  const t = tokens(filename).filter((x) => !NOISE.has(x) && !/^\d+k$/.test(x));
  const kept = t.filter((x, i) => !(CHANNEL_WORDS.has(x) && (x.length > 1 || i === t.length - 1)));
  const out = (kept[0] === 't' ? kept.slice(1) : kept).join('_');
  return out || 'material';
}

/**
 * Separa uma lista de arquivos (com pastas) em materiais: cada pasta, ou cada nome base dentro
 * de uma pasta com vários materiais, vira um conjunto {name, files: {color, normal, rough, ao, orm, height, metal}}.
 * @param {string[]} names caminhos relativos ("Tijolos/Tijolo_Color.png")
 */
export function groupMaterialFiles(names) {
  const imgs = names.filter((n) => IMAGE_EXT.test(n));
  const byDir = new Map();
  for (const n of imgs) {
    const parts = n.split(/[\\/]/);
    const dir = parts.slice(0, -1).join('/');
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(n);
  }
  const groups = [];
  for (const [dir, files] of byDir) {
    const bases = new Map();
    for (const f of files) {
      const b = materialBaseName(f);
      if (!bases.has(b)) bases.set(b, []);
      bases.get(b).push(f);
    }
    // uma pasta = um material quando os nomes base quase não variam (ex.: só "tijolo")
    const dirName = dir.split('/').pop();
    const lists = bases.size > 1 && [...bases.values()].some((l) => l.length > 1) ? [...bases.entries()] : [[dirName || [...bases.keys()][0], files]];
    for (const [base, list] of lists) {
      const set = { normalDX: false };
      const unknown = [];
      const sorted = [...list].sort((a, b) => Number(classifyMap(a).dx) - Number(classifyMap(b).dx));
      for (const f of sorted) {
        const { kind, dx } = classifyMap(f);
        if (!kind) { if (!tokens(f).some((x) => SKIP.has(x) && !HEIGHT.has(x) && !METAL.has(x))) unknown.push(f); continue; }
        if (set[kind]) continue;
        set[kind] = f;
        if (kind === 'normal') set.normalDX = dx;
      }
      if (!set.color && unknown.length === 1) set.color = unknown[0];
      if (set.color || set.normal) groups.push({ name: base.replace(/_/g, ' '), dir, files: set });
    }
  }
  return groups;
}
