// Aba "Construtor": monta casas, castelo, muros, torre, portão, telhado e ponte marcando os cantos
// no chão, sem Blender. Cada parte (parede, madeira, base, telhado, porta, ferragens) tem o seu
// material da biblioteca, com presets A/B/C, envelhecimento (musgo, sujeira, umidade, desgaste,
// reboco caindo) e variação por semente. Vira malha GLB quando quiser.
import * as THREE from 'three';
import { section, slider, select, checkbox, color, button, buttonRow, hint, toolGrid, el, text, toast, confirmBox, downloadBlob } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { STRUCT_TYPES, STRUCT_TYPE_MAP, SLOTS, PRESETS, newStructure, generateStructure } from '../build/structure.js';
import { centroid } from '../build/geom.js';
import { MAT_CATEGORIES } from '../materials/library.js';
import { uid, bytesToBase64, slug, debounce } from '../core/util.js';

const st = {
  tool: 'casa',
  points: [],
  hover: null,
  drafts: {},
  activeSlot: 'parede',
  preview: null,
  previewAt: 0,
  editBefore: null,
};

const TOOLS = [
  { id: 'selecionar', label: 'Selecionar', icon: 'cursor', title: 'Selecionar uma construção para editar (W/E/R move, gira, escala)' },
  ...STRUCT_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon, title: t.hint })),
];

const ROOF_TYPES = [
  { value: 'duas', label: 'Duas águas' },
  { value: 'quatro', label: 'Quatro águas' },
  { value: 'plano', label: 'Plano' },
  { value: 'ameias', label: 'Plano com ameias' },
  { value: 'cone', label: 'Cone (torre)' },
];

// parâmetros de cada tipo: [chave, rótulo, min, max, passo] ou [chave, rótulo, opções] ou [chave, rótulo, 'bool']
const P = {
  floors: ['floors', 'Andares', 1, 6, 1],
  floorH: ['floorH', 'Altura do andar (m)', 2.2, 5, 0.1],
  thick: ['thick', 'Espessura da parede (m)', 0.15, 4, 0.05],
  width: ['width', 'Largura (m)', 2, 30, 0.5],
  height: ['height', 'Altura (m)', 2, 30, 0.5],
  roofType: ['roofType', 'Telhado', ROOF_TYPES],
  roofPitch: ['roofPitch', 'Inclinação do telhado (°)', 10, 65, 1],
  overhang: ['overhang', 'Beiral (m)', 0, 1.5, 0.05],
  timber: ['timber', 'Enxaimel (madeira aparente)', [{ value: 'nenhum', label: 'Nenhum' }, { value: 'superior', label: 'Andares de cima' }, { value: 'todos', label: 'Todos os andares' }]],
  groundStone: ['groundStone', 'Térreo de pedra', 'bool'],
  postSpacing: ['postSpacing', 'Distância entre pilares (m)', 0.8, 4, 0.1],
  windows: ['windows', 'Janelas', 'bool'],
  windowSpacing: ['windowSpacing', 'Espaço entre janelas (m)', 1.8, 8, 0.1],
  door: ['door', 'Porta', 'bool'],
  shutters: ['shutters', 'Venezianas', 'bool'],
  chimney: ['chimney', 'Chaminé', 'bool'],
  baseH: ['baseH', 'Altura da base de pedra (m)', 0.1, 2, 0.05],
  foundation: ['foundation', 'Fundação abaixo do chão (m)', 0.2, 12, 0.1],
  crenels: ['crenels', 'Ameias', 'bool'],
  towers: ['towers', 'Torres nos cantos', 'bool'],
  towerRadius: ['towerRadius', 'Raio das torres (m)', 1.2, 8, 0.1],
  keep: ['keep', 'Torre de menagem', 'bool'],
  closed: ['closed', 'Fechar o contorno', 'bool'],
  sides: ['sides', 'Lados da torre', 6, 24, 1],
  arches: ['arches', 'Arcos', 1, 9, 1],
  bridgeStyle: ['bridgeStyle', 'Estilo', [{ value: 'pedra', label: 'Pedra com arcos' }, { value: 'madeira', label: 'Madeira sobre estacas' }]],
  railing: ['railing', 'Parapeito / corrimão', 'bool'],
  collision: ['collision', 'Colisão no Play', 'bool'],
  lod: ['lod', 'LOD (versão leve de longe)', 'bool'],
};
const TYPE_FIELDS = {
  casa: ['floors', 'floorH', 'width', 'thick', 'roofType', 'roofPitch', 'overhang', 'timber', 'groundStone', 'postSpacing', 'windows', 'windowSpacing', 'door', 'shutters', 'chimney', 'baseH', 'foundation'],
  castelo: ['height', 'thick', 'crenels', 'towers', 'towerRadius', 'roofType', 'keep', 'floors', 'floorH', 'foundation'],
  muros: ['height', 'thick', 'crenels', 'towers', 'towerRadius', 'closed', 'foundation'],
  torre: ['towerRadius', 'sides', 'floors', 'floorH', 'thick', 'roofType', 'roofPitch', 'overhang', 'foundation'],
  portao: ['height', 'thick', 'towerRadius', 'crenels', 'foundation'],
  telhado: ['height', 'roofType', 'roofPitch', 'overhang', 'postSpacing'],
  ponte: ['width', 'arches', 'bridgeStyle', 'railing'],
};

const WEATHER = [
  ['colorVar', 'Variação de cor'],
  ['wear', 'Desgaste'],
  ['moss', 'Musgo'],
  ['dirt', 'Sujeira embaixo'],
  ['humidity', 'Umidade'],
  ['damage', 'Dano no reboco (mistura)'],
  ['grout', 'Profundidade do rejunte'],
  ['normal', 'Força do relevo (normal)', 0, 2],
  ['parallax', 'Altura / parallax', 0, 2],
];

function draft(type) {
  if (!st.drafts[type]) st.drafts[type] = newStructure(type, []);
  return st.drafts[type];
}

export const construtorMode = {
  id: 'construtor',
  label: 'Construtor',
  short: 'Construir',
  icon: 'building',
  title: 'Construtor de casas, castelos, muros, torres, portões, telhados e pontes (marcando os cantos no chão)',
  view: '3d',

  enter(app) {
    this.app = app;
    this._offSel = app.events.on('selection-changed', () => app.refreshPanels());
    this._refreshSoon = debounce((id) => { app.city.refreshStructure(id); app.contentBrowser.renderGrid(); }, 90);
    this._previewSoon = debounce(() => this._updatePreview(), 60);
    this.setTool(st.tool);
    const sel = this.selectedDef();
    if (sel) st.tool = 'selecionar';
  },

  exit(app) {
    this._offSel?.();
    this._clearDrawing();
    app.city.setGhost(null);
  },

  // ------------------------------------------------------------ alvo da edição
  selectedObject() {
    const c = this.app.city;
    if (c.selected?.kind !== 'object') return null;
    const o = c.getData('object', c.selected.uid);
    return o?.kind === 'struct' ? o : null;
  },

  selectedDef() {
    const o = this.selectedObject();
    return o ? (this.app.project.structures || []).find((d) => d.id === o.ref) || null : null;
  },

  /** O que os painéis editam: a construção selecionada ou o rascunho da próxima. */
  target() {
    return this.selectedDef() || draft(st.tool === 'selecionar' || st.tool === 'copiar' ? 'casa' : st.tool);
  },

  /** Aplica uma mudança. live=true (sliders): refaz rápido e só grava no desfazer ao soltar. */
  change(label, fn, { live = false, commit = true } = {}) {
    const app = this.app;
    const def = this.selectedDef();
    if (!def) {
      fn(this.target());
      this._previewSoon();
      return;
    }
    if (!st.editBefore) st.editBefore = app.city.snapshot();
    fn(def);
    def.rev = (def.rev || 0) + 1;
    if (live) this._refreshSoon(def.id);
    else app.city.refreshStructure(def.id);
    if (commit) {
      app.city._pushSnapshot(label, st.editBefore, app.city.snapshot());
      st.editBefore = null;
      app.hierarchySoon?.();
    }
  },

  setTool(id) {
    const app = this.app;
    st.tool = id;
    this._clearDrawing();
    app.city.setGhost(id === 'copiar' && this.selectedDef() ? `struct:${this.selectedDef().id}` : null);
    if (id !== 'selecionar' && id !== 'copiar') app.city.select(null);
    const t = STRUCT_TYPE_MAP.get(id);
    app.status(t ? `${t.hint} • Enter termina • Backspace desfaz ponto • Esc cancela` : id === 'copiar' ? 'Clique no chão para colocar outra cópia • [ ] gira • Esc para' : 'Clique numa construção para editar • W mover • E girar • R escalar • Del apaga');
    app.refreshPanels();
  },

  // ------------------------------------------------------------ painéis
  buildLeft(root, app) {
    const s = section(root, 'Construtor', { icon: 'building' });
    toolGrid(s, TOOLS, st.tool, (id) => this.setTool(id), { cols: 4 });
    const t = STRUCT_TYPE_MAP.get(st.tool);
    if (t) {
      hint(s, t.hint);
      s.append(el('div', { class: 'build-count' }, `${st.points.length} ponto(s) marcado(s)`));
      buttonRow(s,
        button(null, 'Terminar', () => { if (!this.finish()) toast('Faltam pontos.', 'warn'); }, { variant: 'primary', icon: 'check' }),
        button(null, 'Desfazer ponto', () => { st.points.pop(); this._syncPath(); }, { icon: 'undo' }),
        button(null, 'Cancelar', () => this._clearDrawing(), { icon: 'x' }),
      );
    } else if (st.tool === 'selecionar') {
      hint(s, 'Escolha um tipo acima e clique nos cantos no chão — as paredes e o telhado aparecem sozinhos. Ou clique numa construção para editar os materiais e o envelhecimento.');
    }

    const def = this.target();
    const pr = section(root, 'Presets de acabamento', { icon: 'sparkles' });
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = button(pr, p.label, () => this.change(`Preset ${k}`, (d) => applyPreset(d, k)) || this.app.refreshPanels(), { title: p.hint });
      b.classList.add('preset-btn');
      pr.append(el('p', { class: 'hint tight' }, p.hint));
    }

    const ps = section(root, `Parâmetros — ${STRUCT_TYPE_MAP.get(def.type)?.label || def.type}`, { icon: 'sliders' });
    const view = { ...def.params };
    for (const k of [...(TYPE_FIELDS[def.type] || []), 'collision', 'lod']) this._field(ps, view, P[k]);
    hint(ps, 'Auto UV: as texturas são aplicadas em metros reais, contínuas de uma parede para a outra.');
  },

  _field(parent, p, spec) {
    if (!spec) return;
    const [key, label, a, b, step] = spec;
    if (Array.isArray(a)) select(parent, label, p, key, a, { onChange: (v) => this.change(label, (d) => { d.params[key] = v; }) });
    else if (a === 'bool') checkbox(parent, label, p, key, { onChange: (v) => this.change(label, (d) => { d.params[key] = v; }) });
    else {
      slider(parent, label, p, key, {
        min: a, max: b, step,
        onChange: (v) => this.change(label, (d) => { d.params[key] = v; }, { live: true, commit: false }),
        onCommit: (v) => this.change(label, (d) => { d.params[key] = v; }, { live: true }),
      });
    }
  },

  buildProps(root, app) {
    const def = this.target();
    const obj = this.selectedObject();
    const lib = app.materials;
    if (obj) {
      const head = section(root, def.name, { icon: 'building' });
      const thumb = el('div', { class: 'prop-preview' });
      const u = app.thumbs.structure(def.id, (x) => { thumb.style.backgroundImage = `url("${x}")`; });
      if (u) thumb.style.backgroundImage = `url("${u}")`;
      const copies = app.project.objects.filter((o) => o.kind === 'struct' && o.ref === def.id).length;
      head.append(el('div', { class: 'prop-head' }, thumb, el('div', {}, el('b', {}, STRUCT_TYPE_MAP.get(def.type)?.label), el('div', { class: 'hint' }, `${copies} cópia(s) no mundo — editar muda todas.`))));
      text(head, 'Nome', { name: def.name }, 'name', { onChange: (v) => this.change('Nome da construção', (d) => { d.name = v; for (const o of app.project.objects) if (o.ref === d.id && o.kind === 'struct') o.name = v; }) });
      buttonRow(head,
        button(null, 'Colocar cópia', () => this.setTool('copiar'), { icon: 'plus', title: 'Clique no chão para pôr outra igual' }),
        button(null, 'Separar', () => this.separate(), { icon: 'copy', title: 'Esta cópia vira uma construção própria (editar não muda as outras)' }),
      );
      buttonRow(head,
        button(null, 'Focar', () => app.focusSelection(), { icon: 'target' }),
        button(null, 'Excluir', () => app.city.deleteSelected(), { variant: 'danger', icon: 'trash' }),
      );
    } else {
      const s = section(root, 'Próxima construção', { icon: 'building' });
      hint(s, 'Os materiais e o envelhecimento abaixo valem para a próxima construção deste tipo. Selecione uma construção pronta para mudar só ela.');
    }

    // materiais por parte
    const ms = section(root, 'Materiais por parte', { icon: 'image' });
    hint(ms, 'Clique numa parte e depois num material no Navegador de Conteúdo (embaixo), ou escolha na lista.');
    for (const slot of SLOTS) this._slotRow(ms, def, slot, lib);

    const ws = section(root, 'Envelhecimento', { icon: 'droplet' });
    const wv = { ...def.weather };
    for (const [k, label, min = 0, max = 1] of WEATHER) {
      slider(ws, label, wv, k, {
        min, max, step: 0.05,
        onChange: (v) => this.change(label, (d) => { d.weather[k] = v; }, { live: true, commit: false }),
        onCommit: (v) => this.change(label, (d) => { d.weather[k] = v; }, { live: true }),
      });
    }
    hint(ws, 'Musgo cresce nas partes viradas para cima, perto do chão e nas frestas; sujeira sobe do chão; umidade escurece a base; o dano no reboco mostra o material de "Misturar com".');

    const vs = section(root, 'Variação', { icon: 'dice', open: false });
    const vv = { uvOffset: true, randomRot: false, ...(def.variation || {}) };
    checkbox(vs, 'Deslocar a textura (cada construção diferente)', vv, 'uvOffset', { onChange: (v) => this.change('Variação', (d) => { d.variation = { ...vv, uvOffset: v }; }) });
    checkbox(vs, 'Girar a textura (pedra e reboco)', vv, 'randomRot', { onChange: (v) => this.change('Variação', (d) => { d.variation = { ...vv, randomRot: v }; }) });
    button(vs, 'Nova variação', () => this.change('Nova variação', (d) => { d.seed = Math.floor(Math.random() * 100000); }), { icon: 'dice', title: 'Troca a semente: muda manchas, musgo, enxaimel e deslocamento da textura' });

    if (obj) {
      const cv = section(root, 'Converter em malha', { icon: 'package', open: false });
      hint(cv, 'Gera um .glb com as texturas (sem o envelhecimento procedural). Serve para usar em outro programa ou como malha comum aqui.');
      buttonRow(cv,
        button(null, 'Minhas malhas', () => this.toMesh(false), { icon: 'cube' }),
        button(null, 'Baixar .glb', () => this.toMesh(true), { icon: 'download' }),
      );
    }
  },

  _slotRow(parent, def, slot, lib) {
    const sd = { mat: 'reboco', uv: 1, ...(def.slots[slot.id] || {}) };
    const active = st.activeSlot === slot.id;
    const box = el('div', { class: `slot-row ${active ? 'active' : ''}` });
    const img = el('div', { class: 'slot-sphere' });
    const set = (u) => { if (u) img.style.backgroundImage = `url("${u}")`; };
    set(this.app.thumbs.material(sd.mat, set));
    const matSel = this._matSelect(lib, sd.mat, slot.cats, (v) => this.change(`Material: ${slot.label}`, (d) => { d.slots[slot.id].mat = v; }));
    const head = el('div', { class: 'slot-head' }, img, el('div', { class: 'slot-main' }, el('b', {}, slot.label), matSel));
    head.addEventListener('click', (e) => {
      if (e.target.tagName === 'SELECT') return;
      st.activeSlot = slot.id;
      this.app.refreshRight();
      const cat = slot.cats[0];
      this.app.contentBrowser.open(`mat-${cat}`);
    });
    box.append(head);
    if (active) {
      const body = el('div', { class: 'slot-body' });
      color(body, 'Tinta', { v: sd.tint || '#ffffff' }, 'v', { onChange: (v) => this.change('Tinta', (d) => { d.slots[slot.id].tint = v; }, { live: true, commit: false }) });
      slider(body, 'Escala da textura', { uv: sd.uv || 1 }, 'uv', {
        min: 0.25, max: 4, step: 0.05,
        onChange: (v) => this.change('Escala da textura', (d) => { d.slots[slot.id].uv = v; }, { live: true, commit: false }),
        onCommit: (v) => this.change('Escala da textura', (d) => { d.slots[slot.id].uv = v; }, { live: true }),
      });
      if (slot.id === 'parede' || slot.id === 'base') {
        const bl = this._matSelect(lib, sd.blend || '', ['tijolo', 'pedra', 'madeira'], (v) => this.change('Misturar com', (d) => { d.slots[slot.id].blend = v || null; }), true);
        body.append(el('label', { class: 'row' }, el('span', { class: 'row-label' }, 'Misturar com'), bl));
      }
      box.append(body);
    }
    parent.append(box);
  },

  _matSelect(lib, value, cats, onChange, allowNone = false) {
    const s = el('select');
    if (allowNone) s.append(el('option', { value: '' }, '— nenhum —'));
    const order = [...cats, ...MAT_CATEGORIES.map((c) => c.id).filter((c) => !cats.includes(c))];
    for (const c of order) {
      const list = lib.list(c);
      if (!list.length) continue;
      const g = el('optgroup', { label: MAT_CATEGORIES.find((x) => x.id === c)?.label || c });
      for (const m of list) g.append(el('option', { value: m.id }, m.name));
      s.append(g);
    }
    s.value = value || '';
    s.addEventListener('change', () => onChange(s.value));
    return s;
  },

  /** Clique num material no Navegador de Conteúdo: vai para a parte ativa. */
  assignMaterial(app, id) {
    const slot = SLOTS.find((x) => x.id === st.activeSlot);
    this.change(`Material: ${slot?.label || st.activeSlot}`, (d) => { d.slots[st.activeSlot] = { uv: 1, ...(d.slots[st.activeSlot] || {}), mat: id }; });
    this._previewSoon?.();
    app.refreshRight();
    app.log(`${slot?.label}: ${app.materials.get(id)?.name}`);
  },

  // ------------------------------------------------------------ desenho no chão
  _syncPath() {
    const c = this.app.city;
    c.pathPoints = st.points.map((p) => [p[0], p[1]]);
    c._updatePathLine(st.hover);
    this._previewSoon();
    this.app.refreshLeft();
  },

  _clearDrawing() {
    st.points = [];
    st.hover = null;
    const c = this.app?.city;
    if (!c) return;
    c.clearPath();
    this._removePreview();
  },

  _removePreview() {
    if (!st.preview) return;
    st.preview.removeFromParent();
    st.preview.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    st.preview = null;
  },

  _buildDef(points, { forPreview = false } = {}) {
    return structureDefAt(this.app, st.tool, points, draft(st.tool), { forPreview });
  },

  _minPoints() {
    const t = STRUCT_TYPE_MAP.get(st.tool);
    return t ? t.min : 99;
  },

  _updatePreview() {
    this._removePreview();
    const t = STRUCT_TYPE_MAP.get(st.tool);
    if (!t) return;
    const pts = st.hover && st.points.length && !(t.pick === 'center' && st.points.length >= 2) ? [...st.points, [st.hover.x, st.hover.z]] : [...st.points];
    const need = t.pick === 'center' ? 1 : t.min;
    if (pts.length < need) return;
    if (t.pick === 'two' && pts.length > 2) pts.length = 2;
    try {
      const { def, pos } = this._buildDef(pts, { forPreview: true });
      if (def.type === 'torre' && pts.length === 1) def.points = [[0, 0]];
      const { group } = this.app.city.buildStructureGroup(def, { lod: false });
      group.position.copy(pos);
      group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.app.city.helpers.add(group);
      st.preview = group;
    } catch (err) {
      console.warn('prévia', err);
    }
  },

  finish() {
    const app = this.app;
    const t = STRUCT_TYPE_MAP.get(st.tool);
    if (!t) return false;
    const pts = [...st.points];
    if (pts.length < t.min) return false;
    if (t.pick === 'two') pts.length = 2;
    const { def, pos } = this._buildDef(pts);
    if (def.type === 'torre' && pts.length > 2) def.points = def.points.slice(0, 2);
    const c = app.city;
    const o = c.commit(`Construir: ${def.name}`, () => {
      (app.project.structures ||= []).push(def);
      return c.addObject(`struct:${def.id}`, pos);
    });
    this._clearDrawing();
    st.tool = 'selecionar';
    c.select('object', o.uid);
    app.refreshPanels();
    app.contentBrowser.renderGrid();
    app.hierarchy.render();
    app.log(`${def.name} construída. Ajuste materiais e envelhecimento à direita.`, 'ok');
    app.status('Construção pronta! Troque materiais e envelhecimento à direita, ou escolha outro tipo para continuar.');
    return true;
  },

  separate() {
    const app = this.app;
    const obj = this.selectedObject();
    const def = this.selectedDef();
    if (!obj || !def) return;
    app.city.commit('Separar construção', () => {
      const copy = JSON.parse(JSON.stringify(def));
      copy.id = uid('est');
      copy.name = `${def.name} (cópia)`;
      copy.rev = 0;
      app.project.structures.push(copy);
      obj.ref = copy.id;
      obj.name = copy.name;
      app.city.refreshNode('object', obj.uid);
    });
    app.refreshPanels();
  },

  async toMesh(download) {
    const app = this.app;
    const def = this.selectedDef();
    if (!def) return;
    try {
      const bytes = await structureToGlb(app, def);
      if (download) {
        downloadBlob(bytes, `${slug(def.name, 'construcao')}.glb`, 'model/gltf-binary');
        return;
      }
      const entry = { id: uid('malha'), name: def.name, format: 'glb', data: bytesToBase64(new Uint8Array(bytes)), scale: 1 };
      await app.city.loadCustomMesh(entry);
      app.project.customMeshes.push(entry);
      app.markDirty();
      app.contentBrowser.open('malhas');
      toast(`"${def.name}" salva em Minhas malhas.`, 'ok');
    } catch (err) {
      toast(`Não deu para converter: ${err.message}`, 'error', 6000);
    }
  },

  // ------------------------------------------------------------ entrada
  onPointerDown(e, ctx) {
    const app = this.app;
    const c = app.city;
    if (e.button !== 0) return;
    if (c.gizmo.dragging || (c.gizmo.object && c.gizmo.axis)) return;
    const hit = app.terrain.raycast(ctx.ray);
    if (st.tool === 'selecionar') {
      const pick = c.pick(ctx.raycaster);
      const o = pick?.kind === 'object' ? c.getData('object', pick.uid) : null;
      c.select(o?.kind === 'struct' ? 'object' : null, o?.kind === 'struct' ? pick.uid : null);
      app.refreshPanels();
      app.hierarchy.render();
      return;
    }
    if (st.tool === 'copiar') {
      const def = this.selectedDef();
      if (!hit || !def) return;
      const p = c.snapPoint(hit);
      const obj = c.commit('Colocar cópia', () => c.addObject(`struct:${def.id}`, p, { yaw: c.placeRot }));
      c.select('object', obj.uid);
      c.setGhost(`struct:${def.id}`);
      return;
    }
    if (!hit) return;
    const p = c.snapPoint(hit);
    st.points.push([p.x, p.z]);
    const t = STRUCT_TYPE_MAP.get(st.tool);
    if ((t.pick === 'two' || t.pick === 'center') && st.points.length >= 2) { this.finish(); return; }
    this._syncPath();
  },

  onPointerMove(e, ctx) {
    const app = this.app;
    const hit = app.terrain.raycast(ctx.ray);
    if (hit) app.setCursorCoords(hit);
    if (st.tool === 'copiar') { app.city.moveGhost(hit); return; }
    if (!STRUCT_TYPE_MAP.has(st.tool)) return;
    st.hover = hit ? app.city.snapPoint(hit) : null;
    app.city.hoverPath(st.hover);
    const now = performance.now();
    if (st.points.length && now - st.previewAt > 110) {
      st.previewAt = now;
      this._updatePreview();
    }
  },

  onDblClick() {
    const t = STRUCT_TYPE_MAP.get(st.tool);
    if (t && (t.pick === 'poly' || t.pick === 'line')) {
      st.points.pop();
      this.finish();
    }
  },

  onPointerLeave() {
    st.hover = null;
    this.app.city.moveGhost(null);
  },

  onKeyDown(e) {
    const app = this.app;
    const c = app.city;
    const k = e.key, kl = k.toLowerCase();
    if (k === 'Escape') {
      if (st.points.length) this._clearDrawing();
      else if (st.tool !== 'selecionar') this.setTool('selecionar');
      else c.select(null);
      app.refreshPanels();
      return true;
    }
    if (k === 'Enter') { if (!this.finish()) toast('Faltam pontos.', 'warn'); return true; }
    if (k === 'Backspace' && st.points.length) { st.points.pop(); this._syncPath(); return true; }
    if (k === 'Delete') { c.deleteSelected(); app.refreshPanels(); return true; }
    if ((e.ctrlKey || e.metaKey) && kl === 'd') { c.duplicateSelected(); return true; }
    if (k === 'End') { c.dropSelectedToGround(); return true; }
    if (kl === 'f') { app.focusSelection(); return true; }
    if (k === '[' || k === ']') {
      const d = k === ']' ? 15 : -15;
      if (st.tool === 'copiar') c.placeRot = (c.placeRot + d + 360) % 360;
      else c.rotateSelected(d);
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (c.selected) {
      if (kl === 'w') { c.setGizmoMode('translate'); return true; }
      if (kl === 'e') { c.setGizmoMode('rotate'); return true; }
      if (kl === 'r') { c.setGizmoMode('scale'); return true; }
    }
    if (kl === 'q') { this.setTool('selecionar'); return true; }
    return false;
  },
};

/**
 * Monta a definição de uma construção a partir de pontos no mundo ([x, z]) e do modelo `base`
 * (parâmetros, materiais e envelhecimento). Devolve {def, pos} — pos é onde o objeto fica.
 */
export function structureDefAt(app, type, points, base = null, { forPreview = false } = {}) {
  const T = app.terrain;
  const d = base || newStructure(type, []);
  let origin;
  if (type === 'torre') origin = points[0];
  else if (type === 'portao' || type === 'ponte') origin = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
  else origin = centroid(points);
  const local = points.map((p) => [p[0] - origin[0], p[1] - origin[1]]);
  // chão embaixo do contorno: a construção fica no ponto mais alto e a fundação desce até o mais baixo
  const samples = [];
  const ring = type === 'torre' ? circle(points[0], points[1] ? Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) : d.params.towerRadius) : points;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k < n; k++) samples.push(T.heightAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
  }
  const maxH = Math.max(...samples), minH = Math.min(...samples);
  let y = maxH;
  let profile = null;
  if (type === 'ponte') {
    const [a, b] = points;
    y = Math.max(T.heightAt(a[0], a[1]), T.heightAt(b[0], b[1]));
    profile = [];
    for (let k = 0; k <= 24; k++) profile.push(Math.round((T.heightAt(a[0] + ((b[0] - a[0]) * k) / 24, a[1] + ((b[1] - a[1]) * k) / 24) - y) * 100) / 100);
  }
  const def = newStructure(type, local, { id: forPreview ? 'preview' : uid('est'), profile, seed: d.seed });
  def.params = { ...d.params, foundation: Math.max(d.params.foundation, Math.round((maxH - minH + 0.6) * 10) / 10) };
  def.slots = JSON.parse(JSON.stringify(d.slots));
  def.weather = { ...d.weather };
  def.variation = { ...(d.variation || { uvOffset: true, randomRot: false }) };
  const count = (app.project.structures || []).filter((s) => s.type === type).length + 1;
  def.name = `${STRUCT_TYPE_MAP.get(type).label} ${count}`;
  return { def, pos: new THREE.Vector3(origin[0], y, origin[1]) };
}

/** Aplica um preset (A, B, C) numa definição. */
export function applyPreset(def, key) {
  const p = PRESETS[key];
  if (!p) throw new Error(`Preset ${key} não existe (use A, B ou C)`);
  for (const [slot, v] of Object.entries(p.slots)) def.slots[slot] = { uv: 1, ...v };
  Object.assign(def.weather, p.weather);
  if (def.type === 'casa') Object.assign(def.params, p.params);
}

function circle(c, r, n = 16) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r]);
  return out;
}

/** Construção -> .glb com texturas (UVs já divididas pelo tamanho real de cada material). */
export async function structureToGlb(app, def) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const r = generateStructure({ ...def, params: { ...def.params, lod: false } });
  const group = new THREE.Group();
  group.name = def.name;
  for (const [slot, geo] of r.geos) {
    let mat;
    if (slot === 'vidro') mat = new THREE.MeshStandardMaterial({ name: 'vidro', color: '#1c2630', roughness: 0.08, metalness: 0.35 });
    else {
      const sd = { uv: 1, ...(def.slots[slot] || { mat: 'reboco' }) };
      const layer = app.materials.layer(sd.mat, { tint: sd.tint });
      // cópias das texturas gravadas como JPEG (o .glb fica bem menor que em PNG)
      const jpg = (t) => { if (!t) return null; const c = t.clone(); c.userData = { ...c.userData, mimeType: 'image/jpeg' }; return c; };
      for (const k2 of ['color', 'normal', 'arh']) layer[k2] = jpg(layer[k2]);
      const k = 1 / (layer.tile * (sd.uv || 1));
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
      mat = new THREE.MeshStandardMaterial({
        name: `${slot}_${sd.mat}`,
        color: layer.tint || '#ffffff',
        map: layer.color,
        normalMap: layer.normal,
        roughnessMap: layer.metalness ? null : layer.arh,
        aoMap: layer.arh,
        roughness: layer.roughness ?? 1,
        metalness: layer.metalness || 0,
      });
    }
    const m = new THREE.Mesh(geo, mat);
    m.name = slot;
    group.add(m);
  }
  const bytes = await new GLTFExporter().parseAsync(group, { binary: true });
  group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return bytes;
}
