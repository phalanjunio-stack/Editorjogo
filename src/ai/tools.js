// O que cada ferramenta do assistente faz dentro do editor. Toda mudança passa pelo histórico
// (Ctrl+Z desfaz) e os painéis são atualizados no fim.
import * as THREE from 'three';
import { TOOL_DEFS, TOOL_MAP, validateInput, LAYER_NAMES, NPC_TYPE_IDS } from './toolDefs.js';
import { PREFAB_MAP, PREFABS } from '../city/prefabs.js';
import { pointInPoly } from '../city/city.js';
import { withTerrainUndo, applyFoliagePreset } from '../modes/terreno.js';
import { FOLIAGE_PRESETS } from '../core/state.js';
import { validateProject } from '../l2/serverExport.js';
import { newMultisell, newEntry } from '../l2/multisell.js';
import { uid, clamp, DEG, editorToL2 } from '../core/util.js';

const r2 = (v) => Math.round(v * 100) / 100;
const MAX_RESULT = 30000;

/** Desfazer para partes do projeto que não são da cidade (lojas, páginas, jogador...). */
export function withProjectUndo(app, label, keys, fn, after = () => {}) {
  const snap = () => JSON.stringify(keys.map((k) => app.project[k]));
  const before = snap();
  const r = fn();
  const now = snap();
  if (now !== before) {
    const apply = (s) => {
      const vals = JSON.parse(s);
      keys.forEach((k, i) => { app.project[k] = vals[i]; });
      after();
      app.refreshPanels();
      if (app.mode?.buildDoc) app.refreshDoc();
    };
    app.history.push({ label, undo: () => apply(before), redo: () => apply(now) });
    app.markDirty();
  }
  return r;
}

function refsOk(app, ref) {
  if (PREFAB_MAP.has(ref)) return true;
  if (ref.startsWith('mesh:')) return app.project.customMeshes.some((m) => m.id === ref.slice(5));
  if (ref.startsWith('struct:')) return (app.project.structures || []).some((s) => s.id === ref.slice(7));
  return false;
}

function refError(app, ref) {
  const meshes = app.project.customMeshes.map((m) => `mesh:${m.id}`);
  const structs = (app.project.structures || []).map((s) => `struct:${s.id}`);
  return `Peça "${ref}" não existe. Use: ${[...PREFAB_MAP.keys(), ...meshes, ...structs].join(', ')}`;
}

function findAny(app, id) {
  const p = app.project;
  const s = String(id);
  const o = p.objects.find((x) => x.uid === s);
  if (o) return { kind: 'object', data: o };
  const n = p.npcs.find((x) => x.uid === s);
  if (n) return { kind: 'npc', data: n };
  const z = p.zones.find((x) => x.uid === s);
  if (z) return { kind: 'zone', data: z };
  const m = p.multisells.find((x) => String(x.listId) === s || x.uid === s);
  if (m) return { kind: 'shop', data: m };
  const h = p.htmls.find((x) => x.path.toLowerCase() === s.toLowerCase() || x.uid === s);
  if (h) return { kind: 'page', data: h };
  const c = p.characters.find((x) => x.id === s);
  if (c) return { kind: 'character', data: { ...c, glb: c.glb ? `(${Math.round(c.glb.length / 1024)} KB)` : null } };
  const st = (p.structures || []).find((x) => x.id === s);
  if (st) return { kind: 'structure', data: st };
  const mt = (p.materials || []).find((x) => x.id === s);
  if (mt) return { kind: 'material', data: { ...mt, maps: Object.keys(mt.maps || {}) } };
  return null;
}

function npcSummary(n) {
  return { uid: n.uid, name: n.name, title: n.title || undefined, type: n.type, npcId: n.npcId, level: n.level, x: r2(n.pos[0]), z: r2(n.pos[2]), count: n.count > 1 ? n.count : undefined, html: n.html || undefined, multisell: n.multisell || undefined, character: n.character || undefined };
}

function objSummary(o) {
  return { uid: o.uid, ref: o.kind === 'mesh' ? `mesh:${o.ref}` : o.kind === 'struct' ? `struct:${o.ref}` : o.ref, name: o.name, x: r2(o.pos[0]), y: r2(o.pos[1]), z: r2(o.pos[2]), yaw: r2(o.rot[1]), scale: o.scale[0] !== 1 ? r2(o.scale[0]) : undefined };
}

function zoneCenter(z) {
  let x = 0, y = 0;
  for (const p of z.points) { x += p[0]; y += p[1]; }
  return [x / z.points.length, y / z.points.length];
}

/** Pontos a cada `step` metros ao longo da linha (para o pincel não pular). */
function densify(points, step) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    out.push(a);
    const b = points[i + 1];
    if (!b) break;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(d / step);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------- análise
const SERVICE_ROLES = [
  ['Teleporter', 'Gatekeeper (teleporte)'],
  ['Warehouse', 'Armazém'],
  ['Merchant', 'Mercador'],
  ['Buffer', 'Buffer'],
  ['Guard', 'Guardas'],
];

export function analyzeWorld(app) {
  const p = app.project;
  const T = app.terrain;
  const issues = [];
  const add = (level, area, text) => issues.push({ level, area, text });
  const towns = p.zones.filter((z) => z.type === 'TownZone' || z.type === 'PeaceZone');
  const peace = p.zones.filter((z) => z.type === 'PeaceZone');
  const inside = (n, list) => list.some((z) => pointInPoly(n.pos[0], n.pos[2], z.points));

  // terreno
  const range = T.maxH - T.minH;
  if (range < 1) add('media', 'terreno', 'O terreno está plano: gere montanhas/colinas ou esculpa relevo em volta da cidade.');
  const counts = new Array(8).fill(0);
  let samples = 0;
  const step = T.size / 24;
  for (let x = -T.size / 2 + step / 2; x < T.size / 2; x += step) {
    for (let z = -T.size / 2 + step / 2; z < T.size / 2; z += step) {
      let best = 0, bw = -1;
      for (let l = 0; l < 8; l++) { const w = T.layerWeightAt(l, x, z); if (w > bw) { bw = w; best = l; } }
      counts[best]++;
      samples++;
    }
  }
  const cover = Object.fromEntries(LAYER_NAMES.map((n, i) => [n, Math.round((counts[i] / samples) * 100)]));
  if (cover.Grama > 92) add('baixa', 'terreno', 'Quase tudo é grama: use Auto-pintar ou pinte terra, rocha e caminhos para dar variedade.');
  if (!cover.Caminho) add('baixa', 'terreno', 'Não há caminhos pintados: ligue a cidade às áreas de caça com a ferramenta Caminho.');

  // cidade e serviços
  if (!towns.length) add('alta', 'zonas', 'Não há cidade: desenhe uma zona de paz (PeaceZone) e uma TownZone em volta da vila.');
  const byType = {};
  for (const n of p.npcs) byType[n.type] = (byType[n.type] || 0) + 1;
  for (const [t, label] of SERVICE_ROLES) if (!byType[t]) add(t === 'Guard' || t === 'Buffer' ? 'media' : 'alta', 'npcs', `Falta ${label} na cidade.`);
  if (!byType.Monster) add('alta', 'npcs', 'Não há monstros: crie áreas de caça fora da cidade (spawns com quantidade e raio).');
  for (const n of p.npcs) {
    if (n.type === 'Monster' && inside(n, peace)) add('alta', 'npcs', `Monstro "${n.name}" (${n.uid}) está dentro de uma zona de paz.`);
    if (n.type !== 'Monster' && towns.length && !inside(n, towns)) add('baixa', 'npcs', `NPC "${n.name}" (${n.type}) está fora das zonas de cidade.`);
    if (n.type === 'Merchant' && !n.multisell) add('media', 'lojas', `Mercador "${n.name}" não tem loja (multisell).`);
  }
  for (const m of p.multisells) if (!m.entries.length) add('media', 'lojas', `A loja ${m.listId} (${m.name}) está vazia.`);
  const monsters = p.npcs.filter((n) => n.type === 'Monster');
  if (monsters.length) {
    const lv = monsters.map((n) => n.level || 1);
    const spread = Math.max(...lv) - Math.min(...lv);
    if (monsters.length >= 3 && spread < 3) add('baixa', 'npcs', 'Todos os monstros têm quase o mesmo level: faça uma progressão (mais fortes longe da cidade).');
  }

  // objetos
  let outside = 0, underwater = 0;
  const wl = p.terrain.waterEnabled ? p.terrain.waterLevel : -1e9;
  for (const o of p.objects) {
    if (!T.inside(o.pos[0], o.pos[2])) outside++;
    else if (o.pos[1] + 0.5 < wl && !['ponte'].includes(o.ref)) underwater++;
  }
  if (outside) add('media', 'objetos', `${outside} objeto(s) fora do terreno.`);
  if (underwater) add('media', 'objetos', `${underwater} objeto(s) debaixo da água.`);
  const buildings = p.objects.filter((o) => ['casa', 'taverna', 'templo'].includes(o.ref) || o.kind === 'struct');
  const nature = p.objects.filter((o) => PREFAB_MAP.get(o.ref)?.cat === 'Natureza');
  if (towns.length && buildings.length < 4) add('media', 'objetos', `A cidade tem só ${buildings.length} construção(ões): uma vila de L2 costuma ter 8+ (casas, taverna, templo, armazém, loja).`);
  if (nature.length < 20) add('baixa', 'objetos', 'Pouca natureza: espalhe árvores, arbustos e pedras em volta da cidade e nas áreas de caça.');

  // personagens
  const noChar = p.npcs.filter((n) => !n.character).length;
  if (noChar) add('baixa', 'personagens', `${noChar} NPC(s) aparecem como marcador (sem personagem 3D).`);
  if (!p.player.character) add('baixa', 'personagens', 'O Play usa o boneco de teste: escolha um personagem para o jogador na aba Rig.');

  for (const w of validateProject(p)) add('media', 'servidor', w);
  return {
    resumo: { objetos: p.objects.length, construcoes: buildings.length, natureza: nature.length, npcs: p.npcs.length, npcsPorTipo: byType, zonas: p.zones.length, lojas: p.multisells.length, paginas: p.htmls.length, personagens: p.characters.length, coberturaTerreno: cover },
    problemas: issues.slice(0, 80),
    totalProblemas: issues.length,
  };
}

export const PROGRAM_INFO = {
  abas: {
    Mundo: 'hora do dia, sol, nuvens, névoa, vento, água',
    Terreno: 'gerar relevo, esculpir (elevar, abaixar, suavizar, nivelar, ruído, erosão, caminho), 8 camadas PBR, heightmap, grama e folhagem',
    Objetos: 'peças prontas, malhas GLB/FBX/OBJ, muralha automática, espalhar natureza, gizmo',
    Construtor: 'casas, castelo, muros, torre, portão, telhado e ponte marcando os cantos no chão; materiais por parte, presets A/B/C, desgaste, musgo, sujeira, umidade; vira malha GLB',
    Materiais: 'biblioteca PBR (cor, normal, rugosidade, AO, altura, metal) por categoria: tijolo, madeira, pedra, telhado, decalques; importa pasta ou .zip pelos nomes',
    NPC: 'spawns com level/HP/MP, IA, drops, página, loja; zonas de paz/cidade/arena',
    Rig: 'personagens com o nosso esqueleto, rig automático, animações copiadas (PSK/PSA do L2, FBX/GLB) e usadas nos NPCs e no Play',
    Roupa: 'capas, mantos e bandeiras com física de tecido',
    Loja: 'multisell com prévia do jogo',
    HTML: 'diálogos dos NPCs com prévia L2',
    Play: 'andar pelo mapa em 3ª pessoa e falar com NPCs',
    Exportar: 'pacote do servidor L2J/L2Mobius (spawns, zonas, NPCs, lojas, HTML, SQL) com validação',
  },
  naoFazAinda: [
    'Não gera o mapa para o cliente original do Lineage 2 (UE2 .unr); o cenário existe no editor e no Play.',
    'Não gera geodata para o servidor.',
    'Terreno é um mapa de altura só: sem cavernas, túneis ou penhascos negativos; um terreno por projeto (sem streaming de vários tiles).',
    'Água é um plano numa altura só (sem rios com correnteza nem cachoeiras).',
    'Sem editor de quests, de itens/armas/armaduras, de skills ou de classes.',
    'NPCs não têm rotas de patrulha nem falas automáticas; monstros só nascem no raio do spawn.',
    'Sem interiores/dungeons com portas, nem cerco de castelo.',
    'Sem som, música ou efeitos de partículas (magias).',
    'Play é só para testar sozinho: sem combate real, sem multiplayer.',
    'Personagens: 8 papéis de animação (parado, andar, correr, pular, atacar, conjurar, morrer, acenar), sem rosto animado nem troca de equipamento.',
  ],
};

// ---------------------------------------------------------------- execução
export class AssistantTools {
  constructor(app) {
    this.app = app;
    this.allowScripts = false;
    this.onActivity = null; // (texto) → mostra no chat
  }

  get defs() {
    return TOOL_DEFS;
  }

  /** Executa uma ferramenta. Devolve {text, image?} ou lança erro com mensagem para o Claude. */
  async run(name, input = {}) {
    const def = TOOL_MAP.get(name);
    if (!def) throw new Error(`Ferramenta desconhecida: ${name}`);
    const err = validateInput(def.input_schema, input ?? {});
    if (err) throw new Error(`Entrada inválida: ${err}`);
    const fn = this[`_${name}`];
    if (!fn) throw new Error(`Ferramenta ${name} não está disponível nesta versão.`);
    const out = await fn.call(this, input ?? {});
    if (def.mutates) this._touch();
    if (out && out.image) return { text: out.text || '', image: out.image };
    let text = typeof out === 'string' ? out : JSON.stringify(out ?? { ok: true });
    if (text.length > MAX_RESULT) text = `${text.slice(0, MAX_RESULT)}… (cortado; use filtro/limite)`;
    return { text };
  }

  _touch() {
    const app = this.app;
    app.refreshPanels();
    if (app.mode?.buildDoc) app.refreshDoc();
    app.hierarchySoon?.();
    app.contentBrowser?.renderGrid();
    app.minimap && (app.minimap.dirty = true);
  }

  get T() {
    return this.app.terrain;
  }

  groundY(x, z) {
    return this.T.heightAt(x, z);
  }

  // ------------------------------------------------------------ leitura
  _get_overview() {
    const app = this.app, p = app.project, T = this.T;
    const npcsByType = {};
    for (const n of p.npcs) npcsByType[n.type] = (npcsByType[n.type] || 0) + 1;
    const objByRef = {};
    for (const o of p.objects) { const k = o.kind === 'mesh' ? 'malha' : o.kind === 'struct' ? 'construtor' : o.ref; objByRef[k] = (objByRef[k] || 0) + 1; }
    return {
      projeto: p.name,
      aba: app.mode?.id,
      terreno: { tamanho: T.size, alturaMin: r2(T.minH), alturaMax: r2(T.maxH), agua: p.terrain.waterEnabled ? p.terrain.waterLevel : null, camadas: p.terrain.layers.map((l) => l.name) },
      ceu: { hora: p.sky.time, nuvens: p.sky.cloudCoverage, nevoa: p.sky.fog, vento: p.sky.windStrength },
      grama: { tipo: p.grass.preset, ligada: p.grass.enabled, densidade: p.grass.count },
      quantidades: { objetos: p.objects.length, npcs: p.npcs.length, zonas: p.zones.length, lojas: p.multisells.length, paginas: p.htmls.length, personagens: p.characters.length, malhas: p.customMeshes.length, materiais: (p.materials || []).length, construcoes: (p.structures || []).length },
      npcsPorTipo: npcsByType,
      objetosPorPeca: objByRef,
      zonas: p.zones.map((z) => ({ uid: z.uid, nome: z.name, tipo: z.type, centro: zoneCenter(z).map(r2) })),
      selecao: app.city.selected,
      camera: { alvo: app.controls.target.toArray().map(r2) },
      jogador: p.player.character,
    };
  }

  _analyze_world() {
    return analyzeWorld(this.app);
  }

  _program_info() {
    return PROGRAM_INFO;
  }

  _list_things({ what, filter = '', limit = 60 }) {
    const p = this.app.project;
    const f = filter.toLowerCase();
    const match = (...xs) => !f || xs.some((x) => String(x ?? '').toLowerCase().includes(f));
    let list;
    switch (what) {
      case 'objects': list = p.objects.filter((o) => match(o.name, o.ref, o.kind)).map(objSummary); break;
      case 'npcs': list = p.npcs.filter((n) => match(n.name, n.type, n.title, n.npcId)).map(npcSummary); break;
      case 'zones': list = p.zones.filter((z) => match(z.name, z.type)).map((z) => ({ uid: z.uid, name: z.name, type: z.type, center: zoneCenter(z).map(r2), points: z.points.length })); break;
      case 'shops': list = p.multisells.filter((m) => match(m.name, m.listId)).map((m) => ({ listId: m.listId, name: m.name, entries: m.entries.length, npcs: m.npcs })); break;
      case 'pages': list = p.htmls.filter((h) => match(h.path)).map((h) => ({ path: h.path, size: h.content.length })); break;
      case 'characters': list = p.characters.filter((c) => match(c.name, c.kind)).map((c) => ({ id: c.id, name: c.name, kind: c.kind, height: c.height, slots: c.slots })); break;
      case 'prefabs': list = PREFABS.filter((x) => match(x.id, x.name, x.cat)).map((x) => ({ ref: x.id, name: x.name, cat: x.cat })); break;
      case 'meshes': list = p.customMeshes.filter((m) => match(m.name)).map((m) => ({ ref: `mesh:${m.id}`, name: m.name, format: m.format, textures: m.textures ? Object.keys(m.textures).length : 0 })); break;
      case 'materials': list = (this.app.materials?.list() || []).filter((m) => match(m.name, m.category, m.id)).map((m) => ({ id: m.id, name: m.name, category: m.category, builtin: !!m.builtin })); break;
      case 'structures': list = (p.structures || []).filter((s) => match(s.name, s.type)).map((s) => ({ ref: `struct:${s.id}`, name: s.name, type: s.type })); break;
      default: throw new Error('Coleção desconhecida');
    }
    const total = list.length;
    return { total, items: list.slice(0, clamp(limit | 0 || 60, 1, 300)) };
  }

  _get_item({ id }) {
    const r = findAny(this.app, id);
    if (!r) throw new Error(`Nada com o id "${id}".`);
    const d = r.data;
    if (r.kind === 'npc') {
      const l2 = editorToL2({ x: d.pos[0], y: d.pos[1], z: d.pos[2] }, this.app.project.server);
      return { kind: r.kind, ...d, l2 };
    }
    return { kind: r.kind, ...d };
  }

  _terrain_info({ center = [0, 0], size, grid = 7 }) {
    const T = this.T;
    const n = clamp(grid | 0 || 7, 3, 12);
    const S = clamp(size || T.size, 4, T.size);
    const rows = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = center[0] + (i / (n - 1) - 0.5) * S, z = center[1] + (j / (n - 1) - 0.5) * S;
        if (!T.inside(x, z)) continue;
        let best = 0, bw = -1;
        for (let l = 0; l < 8; l++) { const w = T.layerWeightAt(l, x, z); if (w > bw) { bw = w; best = l; } }
        const h = T.heightAt(x, z);
        const water = this.app.project.terrain.waterEnabled && h < this.app.project.terrain.waterLevel;
        rows.push([r2(x), r2(z), r2(h), Math.round(T.slopeAt(x, z)), LAYER_NAMES[best] + (water ? ' (água)' : '')]);
      }
    }
    return { colunas: ['x', 'z', 'altura', 'inclinacao', 'camada'], pontos: rows, tamanhoTerreno: T.size };
  }

  async _screenshot({ width = 900 }) {
    const app = this.app;
    if (app.mode?.view !== '3d' && !app.playing) {
      app.setMode('mundo');
      await nextFrame();
      await nextFrame();
    }
    const w = clamp(width | 0 || 900, 320, 1400);
    app.controls.update();
    app.sky.update(0, app.controls.target, 0);
    if (app.post) app.post.render(0);
    else app.renderer.render(app.scene, app.camera);
    const src = app.renderer.domElement;
    const h = Math.round((w * src.height) / Math.max(1, src.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.8);
    const t = app.controls.target;
    return { text: `Vista ${w}x${h}, câmera em [${app.camera.position.toArray().map(Math.round)}] olhando para [${[t.x, t.y, t.z].map(Math.round)}].`, image: { mediaType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), blob: () => new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8)) } };
  }

  _set_camera({ target, distance = 60, pitch = 35, yaw = 0 }) {
    const app = this.app;
    const [x, z] = target;
    const y = this.groundY(x, z);
    const d = clamp(distance, 2, 2500), pa = clamp(pitch, 2, 89.5) * DEG, ya = yaw * DEG;
    app.controls.target.set(x, y, z);
    app.camera.position.set(x + Math.sin(ya) * Math.cos(pa) * d, y + Math.sin(pa) * d, z + Math.cos(ya) * Math.cos(pa) * d);
    app.controls.update();
    return { ok: true, camera: app.camera.position.toArray().map(r2) };
  }

  // ------------------------------------------------------------ mundo
  _set_sky(i) {
    const app = this.app, s = app.project.sky;
    for (const k of ['time', 'sunAzimuth', 'cloudCoverage', 'cloudDensity', 'fog', 'windDir', 'windStrength', 'exposure']) if (i[k] !== undefined) s[k] = i[k];
    s.time = ((s.time % 24) + 24) % 24;
    app.sky.apply(s);
    if (i.waterEnabled !== undefined || i.waterLevel !== undefined) {
      if (i.waterEnabled !== undefined) app.project.terrain.waterEnabled = i.waterEnabled;
      if (i.waterLevel !== undefined) app.project.terrain.waterLevel = i.waterLevel;
      app.applyTerrainSettings();
    }
    app.markDirty();
    app.refreshViewportBar();
    this._touch();
    return { ok: true, sky: s };
  }

  _terrain_generate(i) {
    const app = this.app;
    const p = { seed: i.seed ?? Math.floor(Math.random() * 99999), height: i.height ?? 80, scale: i.scale ?? 200, roughness: i.roughness ?? 0.5, plateau: i.plateau ?? 0, plateauHeight: i.plateauHeight ?? 2 };
    withTerrainUndo(app, `Assistente: gerar ${i.kind}`, () => {
      app.terrain.generate(i.kind, p);
      app.terrain.autoPaint({ rockSlope: 36, snowHeight: Math.max(20, p.height * 1.05), waterLevel: app.project.terrain.waterLevel });
    });
    return { ok: true, ...p, alturaMin: r2(app.terrain.minH), alturaMax: r2(app.terrain.maxH) };
  }

  _terrain_sculpt({ tool, points, radius = 12, strength = 0.5, passes = 3 }) {
    const T = this.T;
    const R = clamp(radius, 1, 120);
    const pts = densify(points, R * 0.35);
    T.beginStroke(tool === 'caminho' ? 'both' : 'height', pts[0][0], pts[0][1]);
    for (let k = 0; k < clamp(passes | 0 || 1, 1, 20); k++) for (const [x, z] of pts) T.sculpt(tool, x, z, R, clamp(strength, 0.01, 1), 1 / 30);
    T.endStroke(`Assistente: ${tool}`);
    this.app.city.onTerrainChanged();
    this.app.markDirty();
    return { ok: true, pontos: pts.length, alturaNoInicio: r2(T.heightAt(pts[0][0], pts[0][1])) };
  }

  _terrain_paint({ layer, points, radius = 8, strength = 0.8 }) {
    const T = this.T;
    if (layer < 0 || layer > 7) throw new Error('layer vai de 0 a 7');
    const pts = densify(points, Math.max(0.5, radius * 0.3));
    T.beginStroke('paint', pts[0][0], pts[0][1]);
    for (let k = 0; k < 3; k++) for (const [x, z] of pts) T.paint(layer, x, z, clamp(radius, 0.5, 120), clamp(strength, 0.01, 1), 0.05);
    T.endStroke(`Assistente: pintar ${LAYER_NAMES[layer]}`);
    this.app.markDirty();
    return { ok: true, camada: LAYER_NAMES[layer], pontos: pts.length };
  }

  _terrain_auto_paint({ rockSlope = 36, snowHeight = 85 }) {
    const app = this.app;
    withTerrainUndo(app, 'Assistente: auto-pintar', () => app.terrain.autoPaint({ rockSlope, snowHeight, waterLevel: app.project.terrain.waterLevel }));
    return { ok: true };
  }

  _set_grass(i) {
    const app = this.app, g = app.project.grass;
    if (i.preset) {
      const p = FOLIAGE_PRESETS.find((x) => x.id === i.preset || x.name.toLowerCase() === i.preset.toLowerCase());
      if (!p) throw new Error(`Tipo de grama "${i.preset}" não existe. Tipos: ${FOLIAGE_PRESETS.map((x) => x.id).join(', ')}`);
      applyFoliagePreset(app, p);
    }
    for (const k of ['enabled', 'count', 'radius', 'height', 'flowers', 'colorBase', 'colorTip']) if (i[k] !== undefined) g[k] = i[k];
    g.count = clamp(g.count, 10000, 400000);
    g.radius = clamp(g.radius, 15, 150);
    app.grass.applySettings(g);
    app.applyShow();
    app.markDirty();
    this._touch();
    return { ok: true, grass: g, tipos: FOLIAGE_PRESETS.map((x) => x.id) };
  }

  // ------------------------------------------------------------ objetos
  _place_objects({ items }) {
    const app = this.app, c = app.city;
    for (const it of items) if (!refsOk(app, it.ref)) throw new Error(refError(app, it.ref));
    const made = c.commit(`Assistente: colocar ${items.length} peça(s)`, () => items.map((it) => {
      const y = it.y ?? this.groundY(it.x, it.z) - (['muralha', 'torre', 'portao'].includes(it.ref) ? 0.3 : 0);
      const o = c.addObject(it.ref, new THREE.Vector3(it.x, y, it.z), { yaw: it.yaw ?? 0, scale: it.scale ?? 1 });
      return { uid: o.uid, name: o.name };
    }));
    return { ok: true, criados: made };
  }

  _edit_objects({ items }) {
    const app = this.app, c = app.city;
    const missing = items.filter((it) => !app.project.objects.some((o) => o.uid === it.uid)).map((it) => it.uid);
    if (missing.length) throw new Error(`Objetos não encontrados: ${missing.join(', ')}`);
    c.commit(`Assistente: editar ${items.length} objeto(s)`, () => {
      for (const it of items) {
        if (it.delete) {
          app.project.objects = app.project.objects.filter((o) => o.uid !== it.uid);
          if (c.selected?.uid === it.uid) c.select(null);
          c.refreshNode('object', it.uid);
          continue;
        }
        const o = app.project.objects.find((x) => x.uid === it.uid);
        if (it.x !== undefined) o.pos[0] = it.x;
        if (it.z !== undefined) o.pos[2] = it.z;
        if (it.y !== undefined) o.pos[1] = it.y;
        else if (it.x !== undefined || it.z !== undefined) o.pos[1] = this.groundY(o.pos[0], o.pos[2]);
        if (it.yaw !== undefined) o.rot[1] = it.yaw;
        if (it.scale !== undefined) o.scale = [it.scale, it.scale, it.scale];
        if (it.name !== undefined) o.name = it.name;
        if (it.color !== undefined) o.color = it.color;
        c.refreshNode('object', it.uid);
      }
    });
    return { ok: true };
  }

  _scatter_nature({ center, radius, count, refs = ['arvore', 'pinheiro', 'arbusto', 'pedra'], spacing = 4, maxSlope = 32, scaleMin = 0.8, scaleMax = 1.3 }) {
    const app = this.app, c = app.city, T = this.T;
    for (const r of refs) if (!refsOk(app, r)) throw new Error(refError(app, r));
    const n = clamp(count | 0, 1, 300);
    const wl = app.project.terrain.waterEnabled ? app.project.terrain.waterLevel + 0.3 : -1e9;
    const peace = app.project.zones.filter((z) => z.type === 'PeaceZone' || z.type === 'TownZone');
    const placed = [];
    c.commit(`Assistente: espalhar ${n} peça(s)`, () => {
      for (let tries = 0; placed.length < n && tries < n * 30; tries++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * radius;
        const x = center[0] + Math.cos(a) * rr, z = center[1] + Math.sin(a) * rr;
        if (!T.inside(x, z) || T.slopeAt(x, z) > maxSlope) continue;
        const y = T.heightAt(x, z);
        if (y < wl) continue;
        const ref = refs[Math.floor(Math.random() * refs.length)];
        const tree = PREFAB_MAP.get(ref)?.cat === 'Natureza' && ref !== 'pedra';
        if (tree && peace.some((zn) => pointInPoly(x, z, zn.points))) continue;
        let ok = true;
        for (const o of app.project.objects) if (Math.abs(o.pos[0] - x) < spacing && Math.abs(o.pos[2] - z) < spacing && Math.hypot(o.pos[0] - x, o.pos[2] - z) < spacing) { ok = false; break; }
        if (!ok) continue;
        const s = scaleMin + Math.random() * (scaleMax - scaleMin);
        placed.push(c.addObject(ref, new THREE.Vector3(x, y - 0.1, z), { yaw: Math.random() * 360, scale: Math.round(s * 1000) / 1000 }).uid);
      }
    });
    return { ok: true, colocados: placed.length, pedidos: n, nota: placed.length < n ? 'Faltou lugar (encosta, água, cidade ou espaçamento).' : undefined };
  }

  _build_wall({ points, closed = true, towers = true }) {
    const c = this.app.city;
    const before = c.project.objects.length;
    const prev = { closed: c.opts.wallClosed, towers: c.opts.wallTowers };
    c.opts.wallClosed = closed;
    c.opts.wallTowers = towers;
    c.pathPoints = points.map((p) => [p[0], p[1]]);
    const ok = c.finishWall();
    Object.assign(c.opts, { wallClosed: prev.closed, wallTowers: prev.towers });
    return { ok, pecas: c.project.objects.length - before };
  }

  // ------------------------------------------------------------ NPCs e zonas
  _add_npcs({ items }) {
    const app = this.app, c = app.city;
    const chars = new Set(app.project.characters.map((x) => x.id));
    for (const it of items) if (it.character && !chars.has(it.character)) throw new Error(`Personagem "${it.character}" não existe.`);
    const npcs = app.project.npcs;
    const freeId = (type) => {
      const base = type === 'Monster' ? 20001 : 30001;
      const used = new Set(npcs.map((n) => n.npcId));
      let id = base;
      while (used.has(id)) id++;
      return id;
    };
    const made = c.commit(`Assistente: ${items.length} NPC(s)`, () => items.map((it) => {
      const { x, z, multisell, ...data } = it;
      if (multisell !== undefined) data.multisell = String(multisell);
      // sem ID: o mesmo de um NPC igual (mesmo nome e tipo) ou o próximo livre
      if (data.npcId === undefined) data.npcId = npcs.find((n) => n.type === it.type && n.name === it.name)?.npcId ?? freeId(it.type);
      const n = c.addNpc(new THREE.Vector3(x, this.groundY(x, z), z), data);
      return { uid: n.uid, name: n.name, type: n.type, npcId: n.npcId };
    }));
    return { ok: true, criados: made };
  }

  _edit_npcs({ items }) {
    const app = this.app, c = app.city;
    const ALLOWED = { name: 'string', title: 'string', npcId: 'number', type: 'string', level: 'number', hp: 'number', mp: 'number', heading: 'number', count: 'number', radius: 'number', respawn: 'number', html: 'string', multisell: 'string', character: 'string', aggressive: 'boolean', aggroRange: 'number', race: 'string' };
    for (const it of items) {
      if (!app.project.npcs.some((n) => n.uid === it.uid)) throw new Error(`NPC ${it.uid} não existe.`);
      if (it.type && !NPC_TYPE_IDS.includes(it.type)) throw new Error(`Tipo ${it.type} inválido.`);
    }
    c.commit(`Assistente: editar ${items.length} NPC(s)`, () => {
      for (const it of items) {
        if (it.delete) {
          app.project.npcs = app.project.npcs.filter((n) => n.uid !== it.uid);
          if (c.selected?.uid === it.uid) c.select(null);
          c.refreshNode('npc', it.uid);
          continue;
        }
        const n = app.project.npcs.find((x) => x.uid === it.uid);
        for (const [k, t] of Object.entries(ALLOWED)) {
          if (it[k] === undefined) continue;
          if (k === 'character') n.character = it.character || null;
          else if (t === 'number') n[k] = Number(it[k]);
          else if (t === 'boolean') n[k] = !!it[k];
          else n[k] = String(it[k]);
        }
        if (it.x !== undefined || it.z !== undefined) {
          n.pos[0] = Number(it.x ?? n.pos[0]);
          n.pos[2] = Number(it.z ?? n.pos[2]);
          n.pos[1] = this.groundY(n.pos[0], n.pos[2]);
        }
        c.refreshNode('npc', it.uid);
      }
    });
    return { ok: true };
  }

  _add_zone({ name, type, points }) {
    const c = this.app.city;
    const z = c.commit('Assistente: criar zona', () => c.addZone(points, { name, type }));
    return { ok: true, uid: z.uid, name: z.name };
  }

  // ------------------------------------------------------------ lojas e páginas
  _upsert_shop({ listId, name, npcIds = [], entries }) {
    const app = this.app, p = app.project;
    let id = listId;
    withProjectUndo(app, `Assistente: loja ${name}`, ['multisells'], () => {
      let m = id ? p.multisells.find((x) => Number(x.listId) === id) : null;
      if (!m) {
        id = id || Math.max(900000, ...p.multisells.map((x) => Number(x.listId) || 0)) + 1;
        m = newMultisell(id, name);
        p.multisells.push(m);
      }
      m.name = name;
      m.npcs = npcIds;
      m.entries = entries.map((e) => newEntry(e.itemId, e.count ?? 1, e.priceId ?? 57, e.price));
    });
    return { ok: true, listId: id, entradas: entries.length };
  }

  _upsert_page({ path, content }) {
    const app = this.app, p = app.project;
    const clean = path.trim().replace(/^\/+/, '');
    if (!/\.html?$/i.test(clean)) throw new Error('O caminho deve terminar em .htm ou .html');
    let created = false;
    withProjectUndo(app, `Assistente: página ${clean}`, ['htmls'], () => {
      const h = p.htmls.find((x) => x.path.toLowerCase() === clean.toLowerCase());
      if (h) h.content = content;
      else { p.htmls.push({ uid: uid('html'), path: clean, content }); created = true; }
    });
    return { ok: true, path: clean, criada: created };
  }

  // ------------------------------------------------------------ personagens
  _set_character({ target, character }) {
    const app = this.app, p = app.project, c = app.city;
    const id = character || null;
    if (id && !p.characters.some((x) => x.id === id)) throw new Error(`Personagem "${id}" não existe. Existentes: ${p.characters.map((x) => `${x.id} (${x.name})`).join(', ')}`);
    if (target === 'player') {
      withProjectUndo(app, 'Assistente: personagem do jogador', ['player'], () => { p.player.character = id; });
      return { ok: true };
    }
    const list = target.startsWith('type:') ? p.npcs.filter((n) => n.type === target.slice(5)) : p.npcs.filter((n) => n.uid === target);
    if (!list.length) throw new Error('Nenhum NPC encontrado para esse alvo.');
    c.commit('Assistente: aparência de NPC', () => { for (const n of list) { n.character = id; c.refreshNode('npc', n.uid); } });
    return { ok: true, npcs: list.length };
  }

  // ------------------------------------------------------------ editor
  _editor_action({ action, arg = '' }) {
    const app = this.app;
    const TAB = { mundo: 'mundo', terreno: 'terreno', objetos: 'objetos', npc: 'npc', personagens: 'personagens', rig: 'personagens', construtor: 'construtor', materiais: 'materiais', roupa: 'roupa', loja: 'loja', html: 'html', exportar: 'exportar' };
    switch (action) {
      case 'undo': app.undo(); return { ok: true };
      case 'redo': app.redo(); return { ok: true };
      case 'save': app.saveProject(); return { ok: true, nota: 'O navegador baixou o .json do projeto.' };
      case 'open_tab': {
        const id = TAB[arg.toLowerCase()];
        if (!id || !app.modes.some((m) => m.id === id)) throw new Error(`Aba desconhecida: ${arg}`);
        app.setMode(id);
        return { ok: true };
      }
      case 'select':
      case 'focus': {
        const r = findAny(app, arg);
        if (!r || !['object', 'npc', 'zone'].includes(r.kind)) throw new Error('Informe o uid de um objeto, NPC ou zona.');
        app.setMode(r.kind === 'object' ? 'objetos' : 'npc');
        app.city.select(r.kind, arg);
        if (action === 'focus') app.focusSelection();
        app.refreshPanels();
        return { ok: true };
      }
      case 'validate': return { avisos: validateProject(app.project) };
      default: throw new Error('Ação desconhecida');
    }
  }

  async _run_script({ code }) {
    if (!this.allowScripts) throw new Error('Scripts estão desligados. Peça ao usuário para marcar "Permitir scripts" no painel do assistente, ou use as outras ferramentas.');
    const app = this.app;
    const keys = ['objects', 'npcs', 'zones', 'multisells', 'htmls', 'player', 'grass', 'sky', 'structures', 'materials'];
    let result;
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const before = JSON.stringify(keys.map((k) => app.project[k]));
    result = await new AsyncFunction('app', 'THREE', code)(app, THREE);
    const after = JSON.stringify(keys.map((k) => app.project[k]));
    if (before !== after) {
      const apply = (s) => {
        JSON.parse(s).forEach((v, i) => { app.project[keys[i]] = v; });
        app.city.rebuildAll();
        app.sky.apply(app.project.sky);
        app.grass.applySettings(app.project.grass);
        app.refreshPanels();
      };
      app.history.push({ label: 'Assistente: script', undo: () => apply(before), redo: () => apply(after) });
      app.markDirty();
    }
    try {
      return { ok: true, resultado: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
    } catch {
      return { ok: true, resultado: String(result) };
    }
  }
}
