// Modelo do projeto (tudo que é salvo no arquivo .json) + eventos + desfazer/refazer.

export const PROJECT_FORMAT = 'editorjogo';
export const PROJECT_VERSION = 1;

export const DEFAULT_BYPASS = {
  chat: 'bypass -h npc_%objectId%_Chat {n}',
  link: 'bypass -h npc_%objectId%_link {pagina}',
  multisell: 'bypass -h npc_%objectId%_multisell {id}',
  teleport: 'bypass -h npc_%objectId%_goto {id}',
  quest: 'bypass -h npc_%objectId%_Quest',
};

export const LAYER_COUNT = 8;
// Cada camada: cor (texture), normal, rugosidade (rough) e oclusão (ao) como imagens opcionais.
// Sem imagem de cor usa a foto padrão da camada; com cor própria e sem normal, o relevo é gerado a partir da cor.
const layer = (name, tiling, roughness) => ({ name, tiling, roughness, normalStrength: 1, normalDX: false, texture: null, normal: null, rough: null, ao: null });
// Repetição = 1 / tamanho real da foto em metros (a grama padrão cobre 2,5 m, a rocha 5 m...).
export const DEFAULT_LAYERS = [
  layer('Grama', 0.4, 0.95),
  layer('Terra', 0.4, 0.95),
  layer('Rocha', 0.2, 0.85),
  layer('Neve', 0.3, 0.55),
  layer('Areia', 0.35, 0.95),
  layer('Lama', 0.35, 0.6),
  layer('Pedra', 0.45, 0.8),
  layer('Caminho', 0.4, 0.95),
];

// Tipos de folhagem (presets do sistema de grama).
export const FOLIAGE_PRESETS = [
  { id: 'curta', name: 'Grama Curta', height: 0.45, width: 0.07, colorBase: '#24491a', colorTip: '#94c056', flowers: 0, flowerA: '#f3efe4', flowerB: '#f2d04a' },
  { id: 'alta', name: 'Grama Alta', height: 1.1, width: 0.06, colorBase: '#26461a', colorTip: '#b3c468', flowers: 0.02, flowerA: '#f3efe4', flowerB: '#f2d04a' },
  { id: 'flor', name: 'Flor Silvestre', height: 0.55, width: 0.07, colorBase: '#24491a', colorTip: '#8fbf55', flowers: 0.16, flowerA: '#f4f1e6', flowerB: '#9a6ad6' },
  { id: 'campo', name: 'Campo Florido', height: 0.6, width: 0.07, colorBase: '#2a4d1b', colorTip: '#a4c75e', flowers: 0.3, flowerA: '#f2cf3c', flowerB: '#d8403a' },
  { id: 'floresta', name: 'Grama de Floresta', height: 0.5, width: 0.08, colorBase: '#16300f', colorTip: '#4f7d2c', flowers: 0.03, flowerA: '#dfe8f5', flowerB: '#7fa3e8' },
  { id: 'seco', name: 'Capim Seco', height: 0.8, width: 0.05, colorBase: '#5a5528', colorTip: '#d8c27a', flowers: 0, flowerA: '#f3efe4', flowerB: '#f2d04a' },
];

export function defaultClothPreset() {
  return {
    name: 'Capa padrão',
    type: 'capa', // capa | saia | bandeira
    width: 0.9,
    length: 1.25,
    cols: 16,
    rows: 22,
    shape: 'reta', // reta | pontas | v | redonda | rasgada
    flare: 0.35,
    gravity: 9.8,
    stiffness: 0.95,
    bend: 0.35,
    damping: 0.02,
    iterations: 12,
    mass: 1,
    windStrength: 2.5,
    windTurbulence: 0.6,
    collision: true,
    bodyRadius: 0.2,
    colorOuter: '#7a1020',
    colorInner: '#c8a24a',
    emblem: null,
    shininess: 0.4,
  };
}

export function defaultProject() {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: 'Minha Cidade',
    server: {
      pack: 'l2mobius',
      tileX: 20,
      tileY: 18,
      unitsPerMeter: 32,
      zBase: -3500,
      zoneMinZ: -5000,
      zoneMaxZ: 1000,
      bypass: { ...DEFAULT_BYPASS },
    },
    terrain: {
      size: 512,
      res: 253,
      splatRes: 512,
      heights: null, // base64 Float32
      splat: null, // base64 RGBA8
      layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
      waterEnabled: true,
      waterLevel: -1.5,
      showGrid: false,
      gridSize: 4,
    },
    sky: {
      time: 10.5,
      sunAzimuth: 140,
      turbidity: 3,
      rayleigh: 1.2,
      mie: 0.005,
      cloudCoverage: 0.45,
      cloudDensity: 0.55,
      cloudSpeed: 1,
      cloudElevation: 0.5,
      fog: 0.9,
      exposure: 0.5,
      windDir: 35,
      windStrength: 0.6,
    },
    grass: {
      enabled: true,
      preset: 'flor',
      count: 90000,
      radius: 45,
      height: 0.55,
      width: 0.07,
      colorBase: '#24491a',
      colorTip: '#8fbf55',
      flowers: 0.12,
      flowerA: '#f4f1e6',
      flowerB: '#9a6ad6',
    },
    objects: [], // { uid, kind:'prefab'|'mesh', ref, name, pos:[x,y,z], rot:[x,y,z], scale:[x,y,z], color, seed }
    npcs: [], // { uid, npcId, name, title, type, pos:[x,y,z], heading, respawn, html, multisell, count, radius }
    zones: [], // { uid, name, type, points:[[x,z]...], minZ, maxZ }
    customMeshes: [], // { id, name, format, data(base64), scale }
    multisells: [], // { uid, listId, name, npcs:[ids], applyTaxes, maintainEnchantment, entries:[{ingredients:[], productions:[]}] }
    htmls: [], // { uid, path, content }
    items: [], // itens importados { id, name, type }
    cloth: { current: defaultClothPreset(), presets: [] },
  };
}

// Garante que projetos antigos/incompletos recebam os campos novos.
export function normalizeProject(p) {
  const d = defaultProject();
  const out = { ...d, ...p };
  out.server = { ...d.server, ...(p.server || {}) };
  out.server.bypass = { ...DEFAULT_BYPASS, ...((p.server && p.server.bypass) || {}) };
  out.terrain = { ...d.terrain, ...(p.terrain || {}) };
  const layers = (out.terrain.layers || []).slice(0, LAYER_COUNT);
  out.terrain.layers = DEFAULT_LAYERS.map((def, i) => ({ ...def, ...(layers[i] || {}) }));
  out.sky = { ...d.sky, ...(p.sky || {}) };
  out.grass = { ...d.grass, ...(p.grass || {}) };
  out.cloth = { current: { ...defaultClothPreset(), ...((p.cloth && p.cloth.current) || {}) }, presets: (p.cloth && p.cloth.presets) || [] };
  for (const k of ['objects', 'npcs', 'zones', 'customMeshes', 'multisells', 'htmls', 'items']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  out.npcs = out.npcs.map((n) => ({ ...npcDefaults(n.type), ...n }));
  return out;
}

// Dados de NPC além do spawn (usados no template de NPC novo do servidor).
export function npcDefaults(type = 'Folk') {
  const monster = type === 'Monster';
  return {
    level: monster ? 20 : 70,
    hp: monster ? 1200 : 2444,
    mp: monster ? 400 : 1345,
    race: monster ? 'ANIMAL' : 'HUMAN',
    aggressive: false,
    aggroRange: monster ? 300 : 0,
    drops: [],
    customTemplate: false,
    displayId: 0,
  };
}

export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.map.get(ev)?.delete(fn);
  }
  emit(ev, ...args) {
    const s = this.map.get(ev);
    if (s) for (const fn of [...s]) fn(...args);
  }
}

export class History {
  constructor(limit = 60) {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = limit;
    this.onChange = null;
  }
  push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange?.();
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return null;
    c.undo();
    this.redoStack.push(c);
    this.onChange?.();
    return c.label;
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return null;
    c.redo();
    this.undoStack.push(c);
    this.onChange?.();
    return c.label;
  }
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange?.();
  }
}
