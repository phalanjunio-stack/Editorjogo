// Descobre qual mapa PBR é cada arquivo pelo nome, nos padrões mais comuns:
//   Poly Haven:  rocks_diff_2k.jpg, rocks_nor_gl_2k.jpg, rocks_rough_2k.jpg, rocks_arm_2k.jpg
//   ambientCG:   Rock030_2K-JPG_Color.jpg, _NormalGL.jpg, _NormalDX.jpg, _Roughness.jpg, _AmbientOcclusion.jpg
//   Megascans:   Rock_Albedo.jpg, Rock_Normal.jpg, Rock_Roughness.jpg, Rock_AO.jpg
//   Unreal:      T_Rock_D.png, T_Rock_N.png, T_Rock_R.png, T_Rock_ORM.png (normais no padrão DirectX)

export const IMAGE_EXT = /\.(png|jpe?g|webp|tga|bmp|gif)$/i;

const SKIP = new Set(['preview', 'thumb', 'thumbnail', 'disp', 'displacement', 'height', 'bump', 'metal', 'metallic', 'metalness', 'opacity', 'alpha', 'mask', 'emissive', 'emission', 'specular', 'spec', 'gloss', 'glossiness', 'cavity', 'translucency', 'idmap', 'id', 'sss']);
const ORM = new Set(['orm', 'arm']);
const NORMAL = new Set(['normal', 'normalgl', 'normaldx', 'nrm', 'nor', 'nml', 'norm', 'n']);
const ROUGH = new Set(['rough', 'roughness', 'r']);
const AO = new Set(['ao', 'ambientocclusion', 'occlusion', 'ambient']);
const COLOR = new Set(['albedo', 'basecolor', 'diffuse', 'diff', 'color', 'colour', 'col', 'd', 'bc', 'alb', 'base']);

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
