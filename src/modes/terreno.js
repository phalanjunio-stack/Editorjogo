// Aba "Terreno": esculpir, pintar 8 camadas, gerar/importar relevo e sistema de grama e folhagem.
import * as THREE from 'three';
import { section, slider, number, select, checkbox, color, button, buttonRow, hint, toolGrid, thumbGrid, el, ico, pickFiles, readFileAs, toast, text } from '../ui/ui.js';
import { importTextureSet, importSingleMap } from '../world/pbrImport.js';
import { classifyTexture } from '../world/pbrNames.js';
import { LAYER_UI_COLORS } from '../world/terrain.js';
import { FOLIAGE_PRESETS } from '../core/state.js';
import { foliageThumb, textureThumb } from '../ui/thumbs.js';

const TOOLS = [
  { id: 'elevar', label: 'Levantar', icon: 'raise', title: 'Levantar terreno (Shift = abaixar)' },
  { id: 'abaixar', label: 'Abaixar', icon: 'lower', title: 'Abaixar terreno' },
  { id: 'suavizar', label: 'Suavizar', icon: 'smooth', title: 'Suavizar' },
  { id: 'nivelar', label: 'Nivelar', icon: 'flatten', title: 'Nivelar na altura do clique (ótimo para cidades)' },
  { id: 'ruido', label: 'Ruído', icon: 'noise', title: 'Irregularidades naturais' },
  { id: 'erosao', label: 'Erosão', icon: 'erosion', title: 'Erosão: a terra escorre das encostas' },
  { id: 'pintar', label: 'Pintar', icon: 'brush', title: 'Pintar camada de textura (1-8 troca a camada)' },
  { id: 'caminho', label: 'Caminho', icon: 'road', title: 'Estrada: aplaina e pinta a camada Caminho' },
];

export const terrainState = {
  tool: 'elevar',
  radius: 14,
  strength: 0.5,
  softness: 0.7,
  layer: 0,
  painting: false,
  hover: null,
  shift: false,
  gen: { kind: 'montanhas', height: 80, scale: 200, roughness: 0.5, seed: 1234, plateau: 70, plateauHeight: 2 },
  auto: { rockSlope: 36, snowHeight: 70 },
  imp: { minH: 0, maxH: 100 },
  resize: { size: 512, res: 253 },
};
const st = terrainState;

function brushColor() {
  if (st.tool === 'pintar') return LAYER_UI_COLORS[st.layer];
  if (st.tool === 'caminho') return '#e0c08a';
  if (st.tool === 'abaixar' || (st.tool === 'elevar' && st.shift)) return '#ff8a5a';
  return '#5aa9ff';
}

function updateBrush(app) {
  const on = st.tool !== 'navegar' && st.hover;
  app.terrain.setBrush(!!on, st.hover?.x || 0, st.hover?.z || 0, st.radius, brushColor());
}

export function withTerrainUndo(app, label, fn) {
  const t = app.terrain;
  const bh = t.heights.slice(), bs = t.splatF.slice();
  fn();
  const ah = t.heights.slice(), as = t.splatF.slice();
  const apply = (h, s) => {
    t.heights.set(h);
    t.splatF.set(s);
    t._syncSplat(0, 0, t.splatRes - 1, t.splatRes - 1);
    t.updateRegion(0, 0, t.res - 1, t.res - 1);
    t.recomputeRange();
    app.city.onTerrainChanged();
    app.events.emit('terrain-changed');
  };
  app.history.push({ label, undo: () => apply(bh, bs), redo: () => apply(ah, as) });
  app.city.onTerrainChanged();
  app.markDirty();
}

export function applyFoliagePreset(app, p) {
  const g = app.project.grass;
  Object.assign(g, { preset: p.id, height: p.height, width: p.width, colorBase: p.colorBase, colorTip: p.colorTip, flowers: p.flowers, flowerA: p.flowerA, flowerB: p.flowerB, heads: p.heads || 0, headColor: p.headColor || '#d9b35a', stiff: p.stiff || 0, enabled: true });
  app.grass.applySettings(g);
  app.applyShow();
  app.markDirty();
  app.log(`Folhagem: ${p.name}`);
}

export const terrenoMode = {
  id: 'terreno',
  label: 'Terreno',
  icon: 'mountain',
  title: 'Esculpir, pintar texturas, gerar montanhas e grama',
  view: '3d',
  hint: 'Esquerdo: usar ferramenta • Direito: girar • Direito + WASD: voar • Meio: arrastar • Roda: zoom • Esc: sem ferramenta',

  enter(app) {
    this.app = app;
    app.terrain.softness = st.softness;
  },

  exit(app) {
    app.terrain.setBrush(false);
    if (st.painting) app.terrain.endStroke();
    st.painting = false;
    app.controls.mouseButtons.LEFT = null;
  },

  selectLayer(i) {
    st.layer = i;
    st.tool = 'pintar';
    this.app?.refreshPanels();
  },

  buildLeft(root, app) {
    const tools = section(root, 'Ferramentas de Terreno', { icon: 'mountain' });
    toolGrid(tools, TOOLS, st.tool, (id) => {
      st.tool = id;
      app.refreshPanels();
    });
    this.radiusSlider = slider(tools, 'Tamanho do Pincel', st, 'radius', { min: 1, max: 100, step: 0.5, onChange: () => updateBrush(app) });
    this.strengthSlider = slider(tools, 'Força', st, 'strength', { min: 0.02, max: 1, step: 0.01 });
    slider(tools, 'Suavidade', st, 'softness', { min: 0.05, max: 1, step: 0.01, onChange: (v) => { app.terrain.softness = v; } });

    const layers = section(root, 'Camadas de Pintura', { icon: 'layers' });
    thumbGrid(layers, app.project.terrain.layers.map((l, i) => ({
      id: i,
      label: l.name,
      src: textureThumb(app.terrain.layerTextures[i]),
      title: `${l.name} (tecla ${i + 1})`,
    })), st.tool === 'pintar' ? st.layer : -1, (i) => this.selectLayer(i));
    buttonRow(layers,
      button(null, 'Auto-pintar', () => withTerrainUndo(app, 'Auto-pintar', () => app.terrain.autoPaint({ ...st.auto, waterLevel: app.project.terrain.waterLevel })), { icon: 'wand', title: 'Rocha nas encostas, neve no alto, areia na beira da água, lama nas baixadas, grama no resto' }),
      button(null, 'Preencher', () => withTerrainUndo(app, 'Preencher camada', () => app.terrain.fillLayer(st.layer)), { title: 'Preenche o terreno todo com a camada selecionada' }),
    );

    const g = app.project.grass;
    const gr = section(root, 'Sistema de Grama e Folhagem', { icon: 'leaf' });
    const applyGrass = () => { app.grass.applySettings(g); app.applyShow(); app.markDirty(); };
    checkbox(gr, 'Mostrar grama', g, 'enabled', { onChange: applyGrass });
    slider(gr, 'Densidade', g, 'count', { min: 10000, max: 400000, step: 10000, onCommit: applyGrass, format: (v) => `${Math.round(v / 1000)}k` });
    slider(gr, 'Altura', g, 'height', { min: 0.1, max: 2, step: 0.01, onChange: applyGrass });
    slider(gr, 'Flores', g, 'flowers', { min: 0, max: 0.5, step: 0.01, onChange: applyGrass });
    slider(gr, 'Vento (Sway)', app.project.sky, 'windStrength', { min: 0, max: 2, step: 0.01, onChange: () => app.sky.apply(app.project.sky) });
    slider(gr, 'Distância de Render', g, 'radius', { min: 15, max: 150, step: 1, onCommit: applyGrass });
    gr.append(el('div', { class: 'sub-title' }, 'Tipos de Folhagem'));
    thumbGrid(gr, FOLIAGE_PRESETS.map((p) => ({ id: p.id, label: p.name, src: foliageThumb(p) })), g.preset, (id) => {
      applyFoliagePreset(app, FOLIAGE_PRESETS.find((p) => p.id === id));
      app.refreshPanels();
    }, { cols: 3 });
    gr.append(el('div', { class: 'sub-title' }, 'Nasce nas camadas'));
    const lays = el('div', { class: 'layer-checks' });
    app.project.terrain.layers.forEach((l, i) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = (g.layers || [0]).includes(i);
      cb.addEventListener('change', () => {
        const set = new Set(g.layers || [0]);
        if (cb.checked) set.add(i); else set.delete(i);
        g.layers = [...set].sort();
        applyGrass();
      });
      lays.append(el('label', { class: 'check-row' }, cb, el('span', {}, l.name)));
    });
    gr.append(lays);
    hint(gr, 'A grama nasce onde as camadas marcadas estão pintadas (ex.: juncos na Lama, capim na Terra).');

    const gen = section(root, 'Configurações do Terreno', { icon: 'sliders', open: false });
    select(gen, 'Gerar', st.gen, 'kind', [
      { value: 'montanhas', label: 'Montanhas' },
      { value: 'vale', label: 'Vale cercado por montanhas' },
      { value: 'colinas', label: 'Colinas suaves' },
      { value: 'ilha', label: 'Ilha' },
      { value: 'plano', label: 'Plano' },
    ]);
    slider(gen, 'Altura Máxima (m)', st.gen, 'height', { min: 5, max: 300, step: 1 });
    slider(gen, 'Escala (m)', st.gen, 'scale', { min: 30, max: 800, step: 5 });
    slider(gen, 'Rugosidade', st.gen, 'roughness', { min: 0, max: 1, step: 0.05 });
    slider(gen, 'Área plana (m)', st.gen, 'plateau', { min: 0, max: 200, step: 5 });
    slider(gen, 'Altura da área plana', st.gen, 'plateauHeight', { min: -10, max: 60, step: 0.5 });
    const seedRow = number(gen, 'Semente', st.gen, 'seed', { min: 0, max: 999999, step: 1 });
    buttonRow(gen,
      button(null, 'Sortear', () => { st.gen.seed = Math.floor(Math.random() * 999999); seedRow.value = st.gen.seed; }, { icon: 'dice' }),
      button(null, 'Gerar', () => {
        withTerrainUndo(app, 'Gerar terreno', () => {
          app.terrain.generate(st.gen.kind, st.gen);
          app.terrain.autoPaint({ ...st.auto, waterLevel: app.project.terrain.waterLevel });
        });
        toast('Terreno gerado! Ctrl+Z volta.', 'ok');
      }, { variant: 'primary', icon: 'sparkles' }),
    );
    slider(gen, 'Rocha a partir de (°)', st.auto, 'rockSlope', { min: 10, max: 70, step: 1 });
    slider(gen, 'Neve acima de (m)', st.auto, 'snowHeight', { min: 0, max: 300, step: 1 });

    const imp = section(root, 'Importar e Tamanho', { icon: 'upload', open: false });
    hint(imp, 'PNG/JPG em tons de cinza ou RAW 16 bits (.r16/.raw) — por exemplo de programas como World Machine ou Gaea.');
    slider(imp, 'Altura do preto (m)', st.imp, 'minH', { min: -100, max: 100, step: 1 });
    slider(imp, 'Altura do branco (m)', st.imp, 'maxH', { min: 0, max: 600, step: 1 });
    button(imp, 'Importar heightmap…', () => this._import(app), { icon: 'map' });
    st.resize.size = app.project.terrain.size;
    st.resize.res = app.project.terrain.res;
    select(imp, 'Tamanho', st.resize, 'size', [128, 256, 512, 768, 1024, 2048].map((v) => ({ value: v, label: `${v} m` })));
    select(imp, 'Resolução', st.resize, 'res', [
      { value: 127, label: '127 (rápido)' },
      { value: 253, label: '253 (padrão)' },
      { value: 505, label: '505 (detalhado)' },
      { value: 1009, label: '1009 (pesado)' },
    ]);
    button(imp, 'Aplicar tamanho/resolução', () => this._resizeTerrain(app), { title: 'Reamostra o relevo atual' });
  },

  async _import(app) {
    const [f] = await pickFiles('.png,.jpg,.jpeg,.r16,.raw');
    if (!f) return;
    try {
      if (/\.(r16|raw)$/i.test(f.name)) {
        const buf = await readFileAs(f, 'arraybuffer');
        const n = Math.round(Math.sqrt(buf.byteLength / 2));
        if (n * n * 2 !== buf.byteLength) throw new Error('RAW precisa ser quadrado, 16 bits.');
        const raw16 = new Uint16Array(buf);
        withTerrainUndo(app, 'Importar heightmap', () => app.terrain.importHeightmap({ raw16, rawSize: n, ...st.imp }));
      } else {
        const url = await readFileAs(f, 'dataurl');
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        withTerrainUndo(app, 'Importar heightmap', () => app.terrain.importHeightmap({ image: img, ...st.imp }));
      }
      toast('Heightmap importado.', 'ok');
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  },

  _resizeTerrain(app) {
    const t = app.terrain;
    const { size, res } = st.resize;
    if (size === t.size && res === t.res) return;
    const pr = app.project.terrain;
    const bytes = () => { const b = new Uint8Array(t.splatF.length); for (let i = 0; i < b.length; i++) b[i] = Math.round(t.splatF[i]); return b; };
    const old = { heights: t.heights.slice(), res: t.res, size: t.size, splat: bytes() };
    const nh = new Float32Array(res * res);
    const cell = size / (res - 1);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) nh[j * res + i] = t.heightAt(-size / 2 + i * cell, -size / 2 + j * cell);
    const apply = (s) => {
      pr.size = s.size;
      pr.res = s.res;
      const mesh = t.create({ size: s.size, res: s.res, splatRes: pr.splatRes, heights: s.heights.slice(), splat: s.splat.slice() });
      app.scene.add(mesh);
      app.grass.bindTerrain(t);
      app.water.setSize(s.size);
      app.city.onTerrainChanged();
      app.events.emit('terrain-changed');
      app.refreshLeft();
    };
    const next = { heights: nh, res, size, splat: bytes() };
    apply(next);
    app.history.push({ label: 'Tamanho do terreno', undo: () => apply(old), redo: () => apply(next) });
    app.markDirty();
    toast(`Terreno: ${size} m, ${res}×${res}.`, 'ok');
  },

  buildProps(root, app) {
    const p = app.project;
    const i = st.layer;
    const l = p.terrain.layers[i];
    const lay = section(root, `Camada: ${l.name}`, { icon: 'image' });
    const big = el('div', { class: 'prop-preview' });
    big.style.backgroundImage = `url("${textureThumb(app.terrain.layerTextures[i])}")`;
    const mapsIn = ['texture', 'normal', 'rough', 'ao'].filter((k) => l[k]).length;
    lay.append(el('div', { class: 'prop-head' }, big, el('div', {}, el('b', {}, l.name),
      el('div', { class: 'hint' }, `Camada ${i + 1} de 8 • ${l.texture ? `${mapsIn} mapa${mapsIn > 1 ? 's' : ''} PBR` : 'foto padrão (CC0)'}`))));
    text(lay, 'Nome', l, 'name', { onChange: () => { app.markDirty(); app.refreshLeft(); } });
    const apply = async (msg) => {
      await app.terrain.setLayer(i, l);
      app.markDirty();
      app.refreshPanels();
      if (msg) app.log(msg, 'ok');
    };
    button(lay, 'Carregar textura PBR (.zip ou imagens)…', async () => {
      const files = await pickFiles('.zip,.png,.jpg,.jpeg,.webp,.tga,.bmp', true);
      if (!files.length) return;
      try {
        app.log(`Lendo ${files.length} arquivo(s)…`);
        const r = await importTextureSet(files);
        Object.assign(l, { texture: null, normal: null, rough: null, ao: null }, r.maps, { normalDX: r.normalDX });
        await apply(`${l.name}: ${r.found.join(', ')}.`);
      } catch (err) {
        toast(`Não deu para importar: ${err.message}`, 'error', 6000);
      }
    }, { variant: 'primary', icon: 'upload', title: 'O .zip baixado do Poly Haven ou ambientCG, ou as imagens do conjunto (cor, normal, rugosidade, AO)' });

    const slots = el('div', { class: 'map-slots' });
    for (const [key, label] of [['texture', 'Cor'], ['normal', 'Normal'], ['rough', 'Rugosidade'], ['ao', 'Oclusão (AO)']]) {
      const img = el('div', { class: 'map-img' });
      if (l[key]) img.style.backgroundImage = `url("${l[key]}")`;
      else img.append(el('span', {}, !l.texture ? 'padrão' : key === 'normal' ? 'da cor' : '—'));
      const load = el('button', { class: 'ibtn tiny', type: 'button', title: `Carregar ${label}` }, ico('upload', 12));
      load.addEventListener('click', async () => {
        const [f] = await pickFiles('.png,.jpg,.jpeg,.webp,.tga,.bmp');
        if (!f) return;
        try {
          l[key] = await importSingleMap(f);
          if (key === 'normal') l.normalDX = classifyTexture(f.name).dx;
          await apply(`${l.name}: ${label.toLowerCase()} carregada.`);
        } catch (err) {
          toast(`Erro: ${err.message}`, 'error');
        }
      });
      const rm = el('button', { class: 'ibtn tiny', type: 'button', title: `Tirar ${label}`, disabled: !l[key] }, ico('x', 12));
      rm.addEventListener('click', async () => { l[key] = null; await apply(); });
      slots.append(el('div', { class: 'map-slot' }, img, el('span', { class: 'map-label' }, label), el('div', { class: 'map-btns' }, load, rm)));
    }
    lay.append(slots);
    slider(lay, 'Repetição', l, 'tiling', { min: 0.02, max: 1, step: 0.01, onChange: () => app.terrain.setTiling(p.terrain.layers), title: 'Menor = textura maior no chão' });
    slider(lay, 'Força do relevo', l, 'normalStrength', { min: 0, max: 3, step: 0.05, onChange: () => { app.terrain.setTiling(p.terrain.layers); app.markDirty(); } });
    if (l.texture && !l.rough) slider(lay, 'Rugosidade', l, 'roughness', { min: 0.05, max: 1, step: 0.01, onCommit: () => apply(), title: 'Baixo = brilhante/molhado, alto = fosco' });
    if (l.normal) checkbox(lay, 'Normal no padrão DirectX (Unreal)', l, 'normalDX', { onChange: () => apply(), title: 'Marque se o relevo parecer "afundado" onde deveria saltar' });
    button(lay, 'Voltar para a textura padrão', async () => {
      Object.assign(l, { texture: null, normal: null, rough: null, ao: null, normalDX: false });
      await apply(`${l.name}: textura padrão.`);
    }, { icon: 'rotate' });
    hint(lay, 'Texturas realistas grátis para qualquer uso (CC0): polyhaven.com e ambientcg.com. Baixe em 1K ou 2K e escolha o .zip aqui.');

    const g = p.grass;
    const gp = FOLIAGE_PRESETS.find((x) => x.id === g.preset);
    const fol = section(root, `Folhagem: ${gp ? gp.name : 'personalizada'}`, { icon: 'leaf' });
    const applyGrass = () => { app.grass.applySettings(g); app.markDirty(); };
    slider(fol, 'Largura da folha', g, 'width', { min: 0.02, max: 0.3, step: 0.005, onChange: applyGrass });
    color(fol, 'Cor da base', g, 'colorBase', { onChange: applyGrass });
    color(fol, 'Cor da ponta', g, 'colorTip', { onChange: applyGrass });
    color(fol, 'Flor 1', g, 'flowerA', { onChange: applyGrass });
    color(fol, 'Flor 2', g, 'flowerB', { onChange: applyGrass });

    const vis = section(root, 'Visualização', { icon: 'eye', open: false });
    checkbox(vis, 'Mostrar grade no chão', p.terrain, 'showGrid', { onChange: () => app.applyTerrainSettings() });
    slider(vis, 'Espaço da grade (m)', p.terrain, 'gridSize', { min: 1, max: 32, step: 1, onChange: () => app.applyTerrainSettings() });
    hint(vis, 'Em "Iluminado ▾" no topo do viewport dá para ver o mapa de inclinação (verde anda, vermelho é parede).');
  },

  onPointerDown(e, ctx) {
    const app = this.app;
    if (e.button !== 0 || st.tool === 'navegar') return;
    const hit = app.terrain.raycast(ctx.ray);
    if (!hit) return;
    st.hover = hit;
    st.shift = e.shiftKey;
    st.painting = true;
    const kind = st.tool === 'pintar' ? 'paint' : st.tool === 'caminho' ? 'both' : 'height';
    app.terrain.beginStroke(kind, hit.x, hit.z);
    app.canvas.setPointerCapture?.(e.pointerId);
  },

  onPointerMove(e, ctx) {
    const app = this.app;
    st.shift = e.shiftKey;
    st.hover = app.terrain.raycast(ctx.ray);
    updateBrush(app);
    if (st.hover) app.setCursorCoords(st.hover);
  },

  onPointerUp() {
    if (!st.painting) return;
    st.painting = false;
    const label = TOOLS.find((t) => t.id === st.tool)?.label || 'Pincel';
    this.app.terrain.endStroke(label);
    if (st.tool !== 'pintar') this.app.city.onTerrainChanged();
  },

  onPointerLeave() {
    st.hover = null;
    updateBrush(this.app);
  },

  update(dt, app) {
    app.controls.mouseButtons.LEFT = st.tool === 'navegar' ? THREE.MOUSE.ROTATE : null;
    if (!st.painting || !st.hover) return;
    const t = app.terrain;
    if (st.tool === 'pintar') {
      t.paint(st.layer, st.hover.x, st.hover.z, st.radius, st.strength, dt);
    } else {
      let tool = st.tool;
      if (tool === 'elevar' && st.shift) tool = 'abaixar';
      t.sculpt(tool, st.hover.x, st.hover.z, st.radius, st.strength, dt);
    }
  },

  onKeyDown(e) {
    const k = e.key;
    if (k === '[' || k === ']') {
      st.radius = Math.max(1, Math.min(100, st.radius + (k === ']' ? 2 : -2)));
      this.radiusSlider?.set(st.radius);
      updateBrush(this.app);
      return true;
    }
    if (/^[1-8]$/.test(k)) {
      this.selectLayer(Number(k) - 1);
      return true;
    }
    if (k === 'Escape') {
      st.tool = 'navegar';
      this.app.terrain.setBrush(false);
      this.app.refreshLeft();
      return true;
    }
    return false;
  },
};

