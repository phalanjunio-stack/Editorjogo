// EditorJogo — editor de mundo para servidores estilo Lineage 2 (L2J/L2Mobius).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { defaultProject, normalizeProject, Emitter, History, PROJECT_FORMAT } from './core/state.js';
import { slug, formatBytes, debounce } from './core/util.js';
import { el, clear, toast, modal, downloadBlob, pickFiles, readFileAs, confirmBox, panelBox, dropdown, iconButton, setToastHook, closeMenus } from './ui/ui.js';
import { icon } from './ui/icons.js';
import { Terrain } from './world/terrain.js';
import { Grass } from './world/grass.js';
import { SkySystem } from './world/sky.js';
import { Water } from './world/water.js';
import { CityEditor } from './city/city.js';
import { CapeLab } from './cloth/capeLab.js';
import { ItemDB, parseItemsFile } from './l2/items.js';
import { buildServerFiles } from './l2/serverExport.js';
import { ZipWriter } from './core/zip.js';
import { mundoMode } from './modes/mundo.js';
import { terrenoMode, terrainState, withTerrainUndo, applyFoliagePreset } from './modes/terreno.js';
import { objetosMode, npcMode } from './modes/cityModes.js';
import { clothMode } from './modes/cloth.js';
import { multisellMode } from './modes/multisell.js';
import { htmlMode } from './modes/html.js';
import { exportMode } from './modes/export.js';
import { populateExample } from './example.js';
import { showHelp, showAbout } from './modes/help.js';
import { EditorLog } from './ui/log.js';
import { Minimap } from './ui/minimap.js';
import { ThumbRenderer } from './ui/thumbs.js';
import { PostFX } from './world/post.js';
import { WIND } from './nature/trees.js';
import { ContentBrowser } from './ui/contentBrowser.js';
import { Hierarchy } from './ui/hierarchy.js';
import { PlayMode } from './play/play.js';

export const APP_NAME = 'EDITORJOGO';
const AUTOSAVE_KEY = 'editorjogo:autosave';
const QUALITY_KEY = 'editorjogo:qualidade';

// Perfis de qualidade gráfica (preferência do navegador, não vai para o projeto).
export const QUALITY = {
  alta: { label: 'Alta', dpr: 2, shadows: true, shadowSize: 2048, terrainShadow: true, grassMax: 400000, triplanar: true, texSize: 1024, post: true, ao: true },
  media: { label: 'Média', dpr: 1, shadows: true, shadowSize: 1024, terrainShadow: false, grassMax: 120000, triplanar: true, texSize: 1024, post: true, ao: false },
  baixa: { label: 'Baixa', dpr: 0.75, shadows: false, shadowSize: 512, terrainShadow: false, grassMax: 30000, triplanar: false, texSize: 512, post: false, ao: false },
};

function loadQuality() {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (q && QUALITY[q]) return q;
  } catch { /* sem armazenamento */ }
  return window.matchMedia?.('(pointer: coarse)').matches ? 'media' : 'alta';
}

const TIME_PRESETS = [['Amanhecer', 6.4], ['Manhã', 9], ['Meio-dia', 12.5], ['Pôr do sol', 17.9], ['Noite', 22.5]];

class App {
  constructor(root) {
    this.root = root;
    this.events = new Emitter();
    this.history = new History(60);
    this.project = defaultProject();
    this.itemDB = new ItemDB();
    this.dirty = false;
    this.mode = null;
    this.keys = new Set();
    this.rmbDown = false;
    this.time = 0;
    this.playing = false;
    this.show = { grama: true, agua: true, nuvens: true, objetos: true, npcs: true, zonas: true, rotulos: true, sombras: true, minimapa: true };
    this.viewMode = 'iluminado';
    this.modes = [mundoMode, terrenoMode, objetosMode, npcMode, clothMode, multisellMode, htmlMode, exportMode];
    this.quality = loadQuality();
    this.editorLog = new EditorLog();
    this.log = (msg, type = 'info') => this.editorLog.add(msg, type);
    setToastHook((msg, type) => this.log(msg, type));
    this._buildDom();
    this._initThree();
    this._initPanels();
    this._initInput();
    this.history.onChange = () => {
      this._updateUndoButtons();
      const last = this.history.undoStack.at(-1);
      if (last && last !== this._lastLogged) {
        this._lastLogged = last;
        this.log(last.label);
      }
      this.hierarchySoon();
    };
  }

  // ---------------------------------------------------------------- DOM
  _buildDom() {
    const brand = el('div', { class: 'brand' }, el('span', { class: 'brand-logo' }, icon('shield', 20)), el('span', {}, APP_NAME));
    this.menuRow = el('nav', { class: 'menus' });
    this.playBtn = el('button', { class: 'play-btn', type: 'button', title: 'Andar pelo mapa e falar com os NPCs (F5)' }, icon('play', 14), el('span', {}, 'Play (F5)'));
    this.playBtn.addEventListener('click', () => this.togglePlay());
    const exportBtn = el('button', { class: 'top-btn', type: 'button', title: 'Gerar os arquivos do servidor' }, icon('package', 15), el('span', {}, 'Exportar'));
    exportBtn.addEventListener('click', () => this.setMode('exportar'));
    this.serverSel = el('select', { class: 'server-sel', title: 'Pacote do servidor' },
      el('option', { value: 'l2mobius' }, 'Servidor: L2Mobius'),
      el('option', { value: 'l2j' }, 'Servidor: L2J High Five'),
      el('option', { value: 'outro' }, 'Servidor: outro'));
    this.serverSel.addEventListener('change', () => { this.project.server.pack = this.serverSel.value; this.markDirty(); this.log(`Pacote do servidor: ${this.serverSel.selectedOptions[0].textContent}`); });
    this.undoBtn = iconButton('undo', 'Desfazer (Ctrl+Z)', () => this.undo());
    this.redoBtn = iconButton('redo', 'Refazer (Ctrl+Y)', () => this.redo());
    const saveBtn = iconButton('save', 'Salvar projeto (Ctrl+S)', () => this.saveProject());
    const top = el('header', { class: 'menubar' }, brand, this.menuRow, el('span', { class: 'spacer' }), this.undoBtn, this.redoBtn, saveBtn, this.playBtn, exportBtn, this.serverSel);

    // esquerda: abas de modo + ferramentas
    this.modeTabs = el('nav', { class: 'mode-tabs' });
    this.tabButtons = new Map();
    for (const m of this.modes.filter((x) => x.tab !== false)) {
      const b = el('button', { class: 'mode-tab', type: 'button', title: m.title || m.label }, icon(m.icon, 20), el('span', {}, m.label));
      b.addEventListener('click', () => this.setMode(m.id));
      this.tabButtons.set(m.id, b);
      this.modeTabs.append(b);
    }
    this.left = el('div', { class: 'left-body' });
    const leftCol = el('aside', { class: 'col-left' }, this.modeTabs, this.left);

    // centro: viewport 3D ou documento
    this.canvas = el('canvas', { class: 'gl' });
    this.vpOverlayRoot = el('div', { class: 'vp-overlay' });
    this.hintEl = el('div', { class: 'vp-hint' });
    this.vpLeftBar = el('div', { class: 'vp-bar left' });
    this.vpRightBar = el('div', { class: 'vp-bar right' });
    this.vpMiniWrap = el('div', { class: 'vp-minimap' });
    this.vpOverlayRoot.append(this.vpLeftBar, this.vpRightBar, this.vpMiniWrap, this.hintEl);
    this.viewport = el('div', { class: 'viewport' }, this.canvas, this.vpOverlayRoot);
    this.docview = el('div', { class: 'docview', hidden: true });
    const center = el('section', { class: 'center' }, this.viewport, this.docview);

    // direita: hierarquia + propriedades
    this.hierBox = panelBox('Hierarquia do Mundo', 'layers', { cls: 'hier-box' });
    this.propsBox = panelBox('Propriedades', 'sliders', { cls: 'props-box' });
    this.right = this.propsBox.body;
    const rightCol = el('aside', { class: 'col-right' }, this.hierBox.root, this.propsBox.root);

    // embaixo: navegador de conteúdo, minimapa e log
    const hideDock = iconButton('x', 'Esconder painéis de baixo (Janela › Navegador de Conteúdo)', () => this.toggleDock(false), { cls: 'tiny' });
    this.cbBox = panelBox('Navegador de Conteúdo', 'folder', { cls: 'cb-box', actions: [hideDock] });
    this.mapBox = panelBox('Minimapa / Visão do Mundo', 'map', { cls: 'map-box' });
    const clearLog = iconButton('trash', 'Limpar log', () => this.editorLog.clear(), { cls: 'tiny' });
    this.logBox = panelBox('Log do Editor', 'terminal', { cls: 'log-box', actions: [clearLog] });
    this.logBox.body.append(this.editorLog.el);
    const dock = el('section', { class: 'dock' }, this.cbBox.root, el('div', { class: 'dock-right' }, this.mapBox.root, this.logBox.root));

    this.workspace = el('main', { class: 'workspace' }, leftCol, center, rightCol, dock);
    this.root.append(top, this.workspace);
    this._buildMenus();
  }

  // ---------------------------------------------------------------- menus
  _buildMenus() {
    const Q = (k) => ({ label: `Qualidade ${QUALITY[k].label}`, checked: this.quality === k, action: () => this.setQuality(k) });
    const showItem = (k, label) => ({ label, checked: this.show[k], keepOpen: true, action: () => { this.show[k] = !this.show[k]; this.applyShow(); } });
    const gen = (kind, label) => ({
      label,
      icon: 'mountain',
      action: () => {
        this.setMode('terreno');
        withTerrainUndo(this, `Gerar ${label.toLowerCase()}`, () => {
          this.terrain.generate(kind, { ...terrainState.gen, seed: Math.floor(Math.random() * 99999) });
          this.terrain.autoPaint({ ...terrainState.auto, waterLevel: this.project.terrain.waterLevel });
        });
      },
    });
    const sel = () => this.city.selected && this.city.selected.kind !== 'zone';
    const menus = [
      ['Arquivo', () => [
        { label: 'Novo projeto…', icon: 'fileNew', action: () => this.newProjectDialog() },
        { label: 'Abrir…', icon: 'folderOpen', shortcut: 'Ctrl+O', action: () => this.openProject() },
        { label: 'Salvar', icon: 'save', shortcut: 'Ctrl+S', action: () => this.saveProject() },
        { sep: true },
        { label: 'Exportar pacote do servidor (.zip)', icon: 'server', action: () => this.exportServer() },
        { label: 'Painel de exportação…', icon: 'sliders', action: () => this.setMode('exportar') },
        { sep: true },
        { label: 'Importar malha (GLB/FBX/OBJ)…', icon: 'upload', action: () => { this.setMode('objetos'); objetosMode.importMesh(); } },
        { label: 'Importar heightmap…', icon: 'map', action: () => { this.setMode('terreno'); terrenoMode._import(this); } },
      ]],
      ['Editar', () => [
        { label: 'Desfazer', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !this.history.undoStack.length, action: () => this.undo() },
        { label: 'Refazer', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !this.history.redoStack.length, action: () => this.redo() },
        { sep: true },
        { label: 'Duplicar', icon: 'copy', shortcut: 'Ctrl+D', disabled: !sel(), action: () => this.city.duplicateSelected() },
        { label: 'Excluir', icon: 'trash', shortcut: 'Del', disabled: !this.city.selected, action: () => this.city.deleteSelected() },
        { label: 'Colocar no chão', icon: 'download', shortcut: 'End', disabled: !sel(), action: () => this.city.dropSelectedToGround() },
        { label: 'Focar seleção', icon: 'target', shortcut: 'F', disabled: !this.city.selected, action: () => this.focusSelection() },
        { label: 'Desmarcar', shortcut: 'Esc', action: () => this.city.select(null) },
      ]],
      ['Mundo', () => [
        ...TIME_PRESETS.map(([label, t]) => ({ label, icon: t > 20 ? 'moon' : 'sun', action: () => this.setTime(t) })),
        { sep: true },
        { label: 'Céu, nuvens, névoa e água…', icon: 'globe', action: () => this.setMode('mundo') },
      ]],
      ['Terreno', () => [
        { label: 'Ferramentas de terreno', icon: 'brush', action: () => this.setMode('terreno') },
        { sep: true },
        gen('montanhas', 'Montanhas'),
        gen('vale', 'Vale'),
        gen('colinas', 'Colinas'),
        gen('ilha', 'Ilha'),
        { label: 'Auto-pintar texturas', icon: 'wand', action: () => withTerrainUndo(this, 'Auto-pintar', () => this.terrain.autoPaint({ ...terrainState.auto, waterLevel: this.project.terrain.waterLevel })) },
        { sep: true },
        { label: 'Mapa de inclinação (geodata)', checked: this.viewMode === 'inclinacao', action: () => this.setViewMode(this.viewMode === 'inclinacao' ? 'iluminado' : 'inclinacao') },
      ]],
      ['Objetos', () => [
        { label: 'Selecionar e mover', icon: 'cursor', shortcut: 'Q', action: () => { this.setMode('objetos'); objetosMode.setTool('selecionar'); } },
        { label: 'Colocar peça', icon: 'plus', action: () => { this.setMode('objetos'); objetosMode.setTool('colocar'); } },
        { label: 'Espalhar natureza', icon: 'trees', action: () => { this.setMode('objetos'); objetosMode.setTool('espalhar'); } },
        { label: 'Muralha automática', icon: 'castle', action: () => { this.setMode('objetos'); objetosMode.setTool('muralha'); } },
        { sep: true },
        { label: 'Importar malha…', icon: 'upload', action: () => { this.setMode('objetos'); objetosMode.importMesh(); } },
      ]],
      ['NPC', () => [
        { label: 'Novo NPC', icon: 'user', action: () => { this.setMode('npc'); npcMode.setTool('npc'); } },
        { label: 'Nova zona', icon: 'hexagon', action: () => { this.setMode('npc'); npcMode.setTool('zona'); } },
      ]],
      ['Jogabilidade', () => [
        { label: this.playing ? 'Parar (F5)' : 'Play — andar pelo mapa', icon: 'play', shortcut: 'F5', action: () => this.togglePlay() },
        { sep: true },
        { label: 'Lojas (multisell)', icon: 'coins', action: () => this.setMode('loja') },
        { label: 'Diálogos (HTML)', icon: 'code', action: () => this.setMode('html') },
        { label: 'Roupas e capas', icon: 'shirt', action: () => this.setMode('roupa') },
      ]],
      ['Render', () => [
        Q('alta'), Q('media'), Q('baixa'),
        { sep: true },
        showItem('grama', 'Grama'), showItem('agua', 'Água'), showItem('nuvens', 'Nuvens'), showItem('sombras', 'Sombras'), showItem('rotulos', 'Nomes dos NPCs'),
      ]],
      ['Ferramentas', () => [
        { label: 'Validar projeto', icon: 'check', action: () => this.setMode('exportar') },
        { label: 'Importar itens do servidor…', icon: 'item', action: () => this.importItems() },
        { label: 'Limpar log', icon: 'trash', action: () => this.editorLog.clear() },
      ]],
      ['Janela', () => [
        { label: 'Navegador de Conteúdo, Minimapa e Log', checked: !this.workspace.classList.contains('no-dock'), action: () => this.toggleDock() },
        { label: 'Minimapa no viewport', checked: this.show.minimapa, action: () => { this.show.minimapa = !this.show.minimapa; this.applyShow(); } },
        { label: 'Tela cheia', icon: 'maximize', action: () => { const r = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); r?.catch?.(() => toast('Tela cheia não está disponível aqui.', 'warn')); } },
      ]],
      ['Ajuda', () => [
        { label: 'Guia e atalhos', icon: 'help', shortcut: 'F1', action: () => showHelp() },
        { label: 'Sobre', icon: 'info', action: () => showAbout(APP_NAME) },
      ]],
    ];
    for (const [label, items] of menus) {
      const b = el('button', { class: 'menu', type: 'button' }, label);
      b.addEventListener('click', () => {
        if (b.classList.contains('menu-open')) return closeMenus();
        dropdown(b, items());
      });
      b.addEventListener('mouseenter', () => {
        if (document.querySelector('.menus .menu-open') && !b.classList.contains('menu-open')) dropdown(b, items());
      });
      this.menuRow.append(b);
    }
  }

  // ---------------------------------------------------------------- three.js
  _initThree() {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.5;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 20000);
    this.camera.position.set(0, 90, 160);
    const c = (this.controls = new OrbitControls(this.camera, this.canvas));
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = false;
    c.zoomToCursor = true;
    c.maxPolarAngle = Math.PI * 0.495;
    c.minDistance = 1;
    c.maxDistance = 3000;

    this.sky = new SkySystem(this, this.scene);
    this.terrain = new Terrain(this, { texSize: QUALITY[this.quality].texSize });
    this.grass = new Grass(this);
    this.water = new Water();
    this.scene.add(this.water.mesh);
    this.city = new CityEditor(this);
    this.scene.add(this.city.root);
    this.capeLab = new CapeLab(this);
    this.play = new PlayMode(this);

    this.raycaster = new THREE.Raycaster();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._mapAcc = 0;

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(this.viewport);
    this._resize();
    this.events.on('terrain-changed', () => this.markDirty());
  }

  _initPanels() {
    this.thumbs = new ThumbRenderer(this);
    const A = {
      mode: (id) => this.setMode(id),
      selectObject: (kind, uid) => {
        this.setMode(kind === 'object' ? 'objetos' : 'npc');
        if (this.city.tool !== 'selecionar') (kind === 'object' ? objetosMode : npcMode).setTool('selecionar');
        this.city.select(kind, uid);
        this.focusSelection();
        this.hierarchy.render();
      },
      multisell: (m) => this.openMultisell(m.listId),
      html: (h) => this.openHtml(h.path),
      toggleShow: (k) => { this.show[k] = !this.show[k]; this.applyShow(); },
      placePrefab: (ref) => { this.setMode('objetos'); objetosMode.selectPlacement(ref); },
      importMesh: () => { this.setMode('objetos'); objetosMode.importMesh(); },
      activeLayer: () => (this.mode?.id === 'terreno' && terrainState.tool === 'pintar' ? terrainState.layer : -1),
      paintLayer: (i) => { this.setMode('terreno'); terrenoMode.selectLayer(i); },
      foliage: (p) => { applyFoliagePreset(this, p); if (this.mode?.id === 'terreno') this.refreshPanels(); },
      npcType: (t) => { this.setMode('npc'); npcMode.selectNpcType(t); },
      cloth: (p) => { this.setMode('roupa'); clothMode.applyPreset(p); },
      item: (it) => {
        if (this.mode?.id === 'loja') multisellMode.addItem(it);
        else this.log(`Item ${it.id}: ${it.name}${it.type ? ` (${it.type})` : ''} — abra a aba Loja e clique para adicionar à venda.`);
      },
    };
    this.contentBrowser = new ContentBrowser(this, A);
    this.cbBox.body.append(this.contentBrowser.el);
    this.hierarchy = new Hierarchy(this, A);
    this.hierBox.body.append(this.hierarchy.el);
    this.hierarchySoon = debounce(() => this.hierarchy.render(), 250);

    this.minimap = new Minimap(this);
    this.events.on('layers-changed', () => {
      this.minimap.rebuildSoon();
      this.contentBrowser.renderGrid();
    });
    this.coordsEl = el('span', { class: 'map-coords' }, 'X: —   Y: —   Z: —');
    const tabs = el('div', { class: 'map-tabs' });
    for (const [id, label] of [['tudo', 'Minimapa'], ['zonas', 'Zonas'], ['spawns', 'Spawns']]) {
      const b = el('button', { class: `map-tab ${id === 'tudo' ? 'active' : ''}`, type: 'button' }, label);
      b.addEventListener('click', () => {
        this.minimap.filter = id;
        tabs.querySelectorAll('.map-tab').forEach((x) => x.classList.toggle('active', x === b));
      });
      tabs.append(b);
    }
    const onHover = (p) => { this.coordsEl.textContent = this.minimap.coordsText(p); };
    this.mapBox.body.append(this.minimap.view('map-canvas', { onHover, fit: 'cover' }), el('div', { class: 'map-foot' }, tabs, this.coordsEl));
    this.vpMiniWrap.append(this.minimap.view('mini-canvas', { onHover }));
    this._buildViewportBars();
    this.log(`${APP_NAME} iniciado. Clique em Ajuda › Guia e atalhos para começar.`);
  }

  _resize() {
    const w = Math.max(1, this.viewport.clientWidth), h = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.capeLab.camera.aspect = w / h;
    this.capeLab.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- barras do viewport
  _buildViewportBars() {
    const pill = (iconName, label, items) => {
      const b = el('button', { class: 'pill', type: 'button' }, icon(iconName, 14), el('span', {}, label), icon('chevronDown', 11));
      b.addEventListener('click', () => (b.classList.contains('menu-open') ? closeMenus() : dropdown(b, items())));
      return b;
    };
    const L = this.vpLeftBar;
    L.append(
      pill('camera', 'Perspectiva', () => [
        { label: 'Perspectiva livre', action: () => this.cameraPreset('livre') },
        { label: 'Vista de cima', action: () => this.cameraPreset('cima') },
        { label: 'Enquadrar terreno', action: () => this.frameTerrain() },
        { label: 'Focar seleção', shortcut: 'F', disabled: !this.city.selected, action: () => this.focusSelection() },
      ]),
      pill('bulb', 'Iluminado', () => [
        { label: 'Iluminado', checked: this.viewMode === 'iluminado', action: () => this.setViewMode('iluminado') },
        { label: 'Inclinação (geodata)', checked: this.viewMode === 'inclinacao', action: () => this.setViewMode('inclinacao') },
        { label: 'Aramado', checked: this.viewMode === 'aramado', action: () => this.setViewMode('aramado') },
      ]),
      pill('eye', 'Mostrar', () => [
        ...[['grama', 'Grama'], ['agua', 'Água'], ['nuvens', 'Nuvens'], ['objetos', 'Objetos'], ['npcs', 'NPCs'], ['zonas', 'Zonas'], ['rotulos', 'Nomes'], ['sombras', 'Sombras'], ['minimapa', 'Minimapa']]
          .map(([k, label]) => ({ label, checked: this.show[k], keepOpen: true, action: () => { this.show[k] = !this.show[k]; this.applyShow(); } })),
        { sep: true },
        { label: 'Grade no chão', checked: this.project.terrain.showGrid, keepOpen: true, action: () => { this.project.terrain.showGrid = !this.project.terrain.showGrid; this.applyTerrainSettings(); } },
      ]),
    );
    this.refreshViewportBar();
  }

  refreshViewportBar() {
    const R = this.vpRightBar;
    clear(R);
    const c = this.city;
    const grp = (...items) => el('div', { class: 'tb-group' }, ...items);
    const gridOn = this.project.terrain.showGrid;
    R.append(
      grp(
        iconButton('grid', 'Grade no chão', () => { this.project.terrain.showGrid = !gridOn; this.applyTerrainSettings(); this.refreshViewportBar(); }, { active: gridOn }),
        this._snapButton(),
      ),
      grp(
        iconButton('move', 'Mover (W)', () => c.setGizmoMode('translate'), { active: c.gizmo.mode === 'translate' }),
        iconButton('rotate', 'Girar (E)', () => c.setGizmoMode('rotate'), { active: c.gizmo.mode === 'rotate' }),
        iconButton('scale', 'Escalar (R)', () => c.setGizmoMode('scale'), { active: c.gizmo.mode === 'scale' }),
      ),
      grp(
        iconButton(this.project.sky.time > 19.5 || this.project.sky.time < 5.5 ? 'moon' : 'sun', 'Hora do dia', (e) => dropdown(e.currentTarget, TIME_PRESETS.map(([label, t]) => ({ label, action: () => this.setTime(t) }))), {}),
        iconButton('mountain', 'Mapa de inclinação (geodata)', () => this.setViewMode(this.viewMode === 'inclinacao' ? 'iluminado' : 'inclinacao'), { active: this.viewMode === 'inclinacao' }),
      ),
      el('span', { class: 'fps' }, this._fpsText || ''),
    );
    this.fpsEl = R.querySelector('.fps');
  }

  _snapButton() {
    const c = this.city;
    const b = el('button', { class: 'ibtn snap', type: 'button', title: 'Encaixe na grade (objetos)' }, icon('magnet', 15), el('span', {}, c.opts.grid ? String(c.opts.grid) : 'livre'));
    b.addEventListener('click', () => dropdown(b, [0, 0.25, 0.5, 1, 2, 4, 8].map((v) => ({
      label: v ? `${v} m` : 'Livre',
      checked: c.opts.grid === v,
      action: () => { c.opts.grid = v; c.applySnapSettings(); this.refreshViewportBar(); },
    })), { align: 'right' }));
    return b;
  }

  // ---------------------------------------------------------------- entrada
  _initInput() {
    const cv = this.canvas;
    const ctx = (e) => {
      const rect = cv.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      return { ndc, ray: this.raycaster.ray, raycaster: this.raycaster };
    };
    const active = () => this.mode?.view === '3d' && !this.playing;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) this.rmbDown = true;
      cv.focus();
      closeMenus();
      if (active()) this.mode.onPointerDown?.(e, ctx(e));
    });
    cv.addEventListener('pointermove', (e) => { if (active()) this.mode.onPointerMove?.(e, ctx(e)); });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rmbDown = false;
      if (active()) this.mode.onPointerUp?.(e, ctx(e));
    });
    cv.addEventListener('dblclick', (e) => { if (active()) this.mode.onDblClick?.(e, ctx(e)); });
    cv.addEventListener('pointerleave', () => { if (active()) this.mode.onPointerLeave?.(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.tabIndex = 0;

    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const k = e.key.toLowerCase();
      if (e.key === 'F5') {
        e.preventDefault();
        this.togglePlay();
        return;
      }
      if (this.playing) return;
      if (e.key === 'F1') { e.preventDefault(); showHelp(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); this.saveProject(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'o') { e.preventDefault(); this.openProject(); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.redo(); return; }
      if (this.rmbDown && ['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
        return;
      }
      if (this.mode?.onKeyDown?.(e)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.rmbDown = false; });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        this.autosave();
        e.preventDefault();
      }
    });
  }

  // Voo livre: segure o botão direito e use W A S D (Q/E desce/sobe, Shift = rápido).
  _fly(dt) {
    if (!this.rmbDown || !this.keys.size) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.max(8, dist * 0.9) * (this.keys.has('shift') ? 3 : 1) * dt;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('w')) move.add(fwd);
    if (this.keys.has('s')) move.sub(fwd);
    if (this.keys.has('d')) move.add(right);
    if (this.keys.has('a')) move.sub(right);
    if (this.keys.has('e')) move.y += 1;
    if (this.keys.has('q')) move.y -= 1;
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  // ---------------------------------------------------------------- modos e painéis
  setMode(id) {
    const next = this.modes.find((m) => m.id === id);
    if (!next || next === this.mode) return;
    if (this.playing && next.view !== '3d') this.play.stop();
    this.mode?.exit?.(this);
    this.mode = next;
    for (const [k, b] of this.tabButtons) b.classList.toggle('active', k === id);
    const is3d = next.view === '3d' || next.view === 'cloth';
    this.viewport.hidden = !is3d;
    this.docview.hidden = is3d;
    this.viewport.classList.toggle('cloth', next.view === 'cloth');
    this.workspace.classList.toggle('doc-mode', !is3d);
    this.controls.enabled = next.view === '3d' && !this.playing;
    this.capeLab.controls.enabled = next.view === 'cloth';
    next.enter?.(this);
    this.refreshPanels();
    clear(this.docview);
    this.docview.className = 'docview';
    if (!is3d) next.buildDoc?.(this.docview, this);
    this.status(next.hint || '');
    // o Navegador de Conteúdo acompanha a aba
    const objFolders = ['Construções', 'Muralhas', 'Decoração', 'Natureza', 'malhas', 'objetos'];
    const folder = { terreno: 'texturas', npc: 'npcs', roupa: 'roupas', loja: 'itens', html: 'paginas' }[id]
      || (id === 'objetos' && !objFolders.includes(this.contentBrowser.folder) ? 'Construções' : null);
    if (folder && folder !== this.contentBrowser.folder) this.contentBrowser.open(folder);
    this.contentBrowser.renderGrid();
    this.hierarchy.render();
    requestAnimationFrame(() => this._resize());
  }

  refreshPanels() {
    this.refreshLeft();
    this.refreshRight();
  }

  refreshLeft() {
    const st = this.left.scrollTop;
    clear(this.left);
    this.mode?.buildLeft?.(this.left, this);
    this.left.scrollTop = st;
  }

  refreshRight() {
    const st = this.right.scrollTop;
    clear(this.right);
    this.mode?.buildProps?.(this.right, this);
    this.right.scrollTop = st;
    this.hierarchySoon?.();
  }

  refreshDoc() {
    if (this.mode?.buildDoc) {
      clear(this.docview);
      this.docview.className = 'docview';
      this.mode.buildDoc(this.docview, this);
    }
  }

  openMultisell(listId) {
    multisellMode.select(listId);
    if (this.mode?.id === 'loja') { this.refreshPanels(); this.refreshDoc(); } else this.setMode('loja');
  }

  openHtml(path) {
    htmlMode.open(path);
    if (this.mode?.id === 'html') { this.refreshPanels(); this.refreshDoc(); } else this.setMode('html');
  }

  status(text) {
    this.hintEl.textContent = text;
  }

  setCursorCoords(p) {
    this.coordsEl.textContent = this.minimap.coordsText(p);
  }

  focusSelection() {
    const sel = this.city.selected;
    if (!sel) return;
    const d = this.city.getData(sel.kind, sel.uid);
    if (!d) return;
    let target;
    if (sel.kind === 'zone') {
      let x = 0, z = 0;
      for (const p of d.points) { x += p[0]; z += p[1]; }
      x /= d.points.length; z /= d.points.length;
      target = new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
    } else target = new THREE.Vector3().fromArray(d.pos);
    const off = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(sel.kind === 'zone' ? 60 : 18);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(off);
  }

  cameraPreset(kind) {
    const t = this.controls.target;
    const dist = this.camera.position.distanceTo(t);
    if (kind === 'cima') this.camera.position.set(t.x, t.y + Math.max(dist, 60), t.z + 0.01);
    else this.camera.position.set(t.x, t.y + dist * 0.5, t.z + dist * 0.85);
  }

  setTime(t) {
    this.project.sky.time = t;
    this.sky.apply(this.project.sky);
    this.markDirty();
    if (this.mode?.id === 'mundo') this.refreshLeft();
    this.refreshViewportBar();
  }

  setViewMode(m) {
    this.viewMode = m;
    this.terrain.uniforms.uViewMode.value = m === 'inclinacao' ? 1 : 0;
    this.terrain.material.wireframe = m === 'aramado';
    this.vpLeftBar.querySelectorAll('.pill span')[1].textContent = { iluminado: 'Iluminado', inclinacao: 'Inclinação', aramado: 'Aramado' }[m];
    this.refreshViewportBar();
  }

  applyShow() {
    const s = this.show;
    const q = QUALITY[this.quality];
    if (this.grass.mesh) this.grass.mesh.visible = s.grama && this.project.grass.enabled;
    this.water.mesh.visible = s.agua && this.project.terrain.waterEnabled;
    this.city.objectsGroup.visible = s.objetos;
    this.city.clothGroup.visible = s.objetos;
    this.city.npcsGroup.visible = s.npcs;
    this.city.zonesGroup.visible = s.zonas;
    this.city.showLabels = s.rotulos;
    this.city.root.traverse((o) => { if (o.isSprite) o.visible = s.rotulos; });
    this.sky.cloudsOn = s.nuvens;
    this.sky.apply(this.project.sky);
    this.sky.sun.castShadow = s.sombras && q.shadows;
    this.vpMiniWrap.hidden = !s.minimapa;
    this.hierarchySoon?.();
  }

  toggleDock(force) {
    const hide = force === undefined ? !this.workspace.classList.contains('no-dock') : !force;
    this.workspace.classList.toggle('no-dock', hide);
    requestAnimationFrame(() => this._resize());
  }

  togglePlay() {
    if (this.playing) this.play.stop();
    else {
      if (this.mode?.view !== '3d') this.setMode('mundo');
      this.play.start();
    }
    this.playBtn.classList.toggle('stop', this.playing);
    this.playBtn.querySelector('span').textContent = this.playing ? 'Parar (F5)' : 'Play (F5)';
  }

  markDirty() {
    this.dirty = true;
    document.title = `• ${this.project.name} — EditorJogo`;
  }

  _updateUndoButtons() {
    const u = this.history.undoStack.at(-1), r = this.history.redoStack.at(-1);
    this.undoBtn.disabled = !u;
    this.redoBtn.disabled = !r;
    this.undoBtn.title = u ? `Desfazer: ${u.label} (Ctrl+Z)` : 'Nada para desfazer';
    this.redoBtn.title = r ? `Refazer: ${r.label} (Ctrl+Y)` : 'Nada para refazer';
  }

  undo() {
    const l = this.history.undo();
    if (l) { this.log(`Desfeito: ${l}`); this.markDirty(); this.refreshPanels(); if (this.mode?.buildDoc) this.refreshDoc(); }
  }

  redo() {
    const l = this.history.redo();
    if (l) { this.log(`Refeito: ${l}`); this.markDirty(); this.refreshPanels(); if (this.mode?.buildDoc) this.refreshDoc(); }
  }

  setQuality(k) {
    this.quality = k;
    try { localStorage.setItem(QUALITY_KEY, k); } catch { /* ignora */ }
    this.applyQuality();
    this.log(`Qualidade gráfica: ${QUALITY[k].label}`);
    if (this.mode?.id === 'mundo') this.refreshRight();
  }

  applyQuality() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.shadowMap.enabled = q.shadows;
    this.capeLab.key.castShadow = q.shadows;
    if (this.sky.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sky.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sky.sun.shadow.map?.dispose();
      this.sky.sun.shadow.map = null;
    }
    if (this.terrain.mesh) this.terrain.mesh.castShadow = q.terrainShadow;
    this.terrain.setTriplanar(q.triplanar);
    this.terrain.setTextureSize(q.texSize);
    this.grass.maxCount = q.grassMax;
    this.grass.applySettings(this.project.grass);
    // pós-processamento: recriado quando muda a qualidade (o MSAA depende da densidade de pixels)
    this.post?.dispose();
    this.post = q.post ? new PostFX(this.renderer, this.scene, this.camera, { ao: q.ao }) : null;
    this.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.applyShow();
    this._resize();
  }

  // ---------------------------------------------------------------- projeto
  refreshItems() {
    this.itemDB = new ItemDB(this.project.items);
  }

  async importItems() {
    const files = await pickFiles('.xml,.txt,.csv', true);
    let total = 0;
    for (const f of files) {
      const items = parseItemsFile(await readFileAs(f, 'text'));
      const map = new Map(this.project.items.map((x) => [x.id, x]));
      for (const x of items) map.set(x.id, x);
      this.project.items = [...map.values()];
      total += items.length;
    }
    if (!files.length) return;
    this.refreshItems();
    this.markDirty();
    this.contentBrowser.open('itens');
    toast(`${total} itens lidos.`, 'ok');
  }

  async applyProject(p) {
    this.project = normalizeProject(p);
    const pr = this.project;
    this.serverSel.value = pr.server.pack;
    this.refreshItems();
    const dec = Terrain.decode(pr.terrain);
    const mesh = this.terrain.create({ size: pr.terrain.size, res: pr.terrain.res, splatRes: pr.terrain.splatRes, heights: dec.heights, splat: dec.splat });
    this.scene.add(mesh);
    for (let i = 0; i < pr.terrain.layers.length; i++) await this.terrain.setLayer(i, pr.terrain.layers[i]);
    this.terrain.setTiling(pr.terrain.layers);
    this.grass.bindTerrain(this.terrain);
    this.grass.maxCount = QUALITY[this.quality].grassMax;
    this.grass.applySettings(pr.grass);
    if (!this.grass.mesh.parent) this.scene.add(this.grass.mesh);
    mesh.castShadow = QUALITY[this.quality].terrainShadow;
    this.water.setSize(pr.terrain.size);
    this.applyTerrainSettings();
    this.sky.apply(pr.sky);
    this.city.meshTemplates.clear();
    for (const m of pr.customMeshes) {
      try { await this.city.loadCustomMesh(m); } catch (err) { toast(`Não consegui carregar a malha ${m.name}: ${err.message}`, 'error'); }
    }
    this.city.rebuildAll();
    this.city.select(null);
    this.capeLab.emblemImage = null;
    if (pr.cloth.current.emblem) await this.capeLab.setEmblem(pr.cloth.current.emblem).catch(() => {});
    this.capeLab.rebuild();
    this.history.clear();
    this.dirty = false;
    document.title = `${pr.name} — EditorJogo`;
    this.frameTerrain();
    this.applyShow();
    this.events.emit('project-loaded');
    if (this.mode) {
      this.refreshPanels();
      if (this.mode.buildDoc) this.refreshDoc();
    }
    this.contentBrowser?.render();
    this.hierarchy?.render();
  }

  applyTerrainSettings() {
    const t = this.project.terrain;
    this.water.apply(t);
    this.terrain.uniforms.uWaterLevel.value = t.waterEnabled ? t.waterLevel : -1e5;
    this.grass.uniforms.uWaterLevel.value = t.waterEnabled ? t.waterLevel : -1e5;
    this.terrain.uniforms.uGridOn.value = t.showGrid ? 1 : 0;
    this.terrain.uniforms.uGridSize.value = t.gridSize;
    this.water.mesh.visible = this.show.agua && t.waterEnabled;
    this.minimap?.rebuildSoon();
  }

  frameTerrain() {
    const t = this.terrain;
    const h = t.heightAt(0, 0);
    this.controls.target.set(0, h, 0);
    this.camera.position.set(0, h + t.size * 0.2, t.size * 0.3);
    this.controls.update();
  }

  serialize() {
    const t = this.terrain.serialize();
    this.project.terrain.heights = t.heights;
    this.project.terrain.splat = t.splat;
    this.project.format = PROJECT_FORMAT;
    return JSON.stringify(this.project);
  }

  saveProject() {
    const json = this.serialize();
    downloadBlob(json, `${slug(this.project.name, 'projeto')}.editorjogo.json`, 'application/json');
    this.dirty = false;
    document.title = `${this.project.name} — EditorJogo`;
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* armazenamento indisponível */ }
    toast(`Projeto salvo (${formatBytes(json.length)}).`, 'ok');
  }

  autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, this.serialize());
      return true;
    } catch {
      return false;
    }
  }

  async openProject() {
    const [file] = await pickFiles('.json,application/json');
    if (!file) return;
    if (this.dirty && !(await confirmBox('Há mudanças não salvas. Abrir outro projeto mesmo assim?', 'Abrir'))) return;
    try {
      const data = JSON.parse(await readFileAs(file, 'text'));
      if (data.format !== PROJECT_FORMAT) throw new Error('Este arquivo não é um projeto do EditorJogo.');
      await this.applyProject(data);
      toast(`Projeto "${this.project.name}" aberto.`, 'ok');
    } catch (err) {
      toast(`Erro ao abrir: ${err.message}`, 'error', 6000);
    }
  }

  async newProjectDialog() {
    const choice = await modal({
      title: 'Novo projeto',
      body: el('div', {},
        el('p', {}, 'Como você quer começar?'),
        el('ul', { class: 'plain' },
          el('li', {}, el('b', {}, 'Vila de exemplo: '), 'vale com montanhas, cidade murada, NPCs, lojas e diálogos prontos para estudar.'),
          el('li', {}, el('b', {}, 'Montanhas: '), 'terreno montanhoso com uma área plana no meio para você construir.'),
          el('li', {}, el('b', {}, 'Plano: '), 'terreno liso, liberdade total.'),
        )),
      buttons: [
        { label: 'Cancelar', value: null },
        { label: 'Plano', value: 'plano' },
        { label: 'Montanhas', value: 'montanhas' },
        { label: 'Vila de exemplo', value: 'exemplo', variant: 'primary' },
      ],
    });
    if (!choice) return;
    if (this.dirty && !(await confirmBox('Há mudanças não salvas. Começar um novo projeto mesmo assim?', 'Começar novo'))) return;
    await this.newProject(choice);
  }

  async newProject(kind = 'exemplo') {
    if (this.playing) this.play.stop();
    const p = defaultProject();
    await this.applyProject(p);
    if (kind === 'exemplo') {
      populateExample(this);
    } else if (kind === 'montanhas') {
      this.project.name = 'Novo Mundo';
      this.terrain.generate('montanhas', { seed: Math.floor(Math.random() * 9999), height: 80, scale: 200, roughness: 0.5, plateau: 70, plateauHeight: 2 });
      this.terrain.autoPaint({ rockSlope: 36, snowHeight: 85, waterLevel: this.project.terrain.waterLevel });
    } else {
      this.project.name = 'Novo Mundo';
      this.project.terrain.waterEnabled = false;
      this.applyTerrainSettings();
    }
    this.city.rebuildAll();
    this.frameTerrain();
    this.history.clear();
    this.dirty = false;
    document.title = `${this.project.name} — EditorJogo`;
    this.applyShow();
    this.minimap.dirty = true;
    this.refreshPanels();
    if (this.mode?.buildDoc) this.refreshDoc();
    this.contentBrowser.render();
    this.hierarchy.render();
    this.log(`Projeto "${this.project.name}" criado.`);
  }

  // ---------------------------------------------------------------- exportação
  async _zip(files, name) {
    const z = new ZipWriter();
    for (const f of files) z.add(f.path, f.content ?? f.data);
    const bytes = await z.build();
    downloadBlob(bytes, name, 'application/zip');
    return bytes.length;
  }

  async exportServer() {
    const { files, warnings } = buildServerFiles(this.project, { heightAt: (x, z) => this.terrain.heightAt(x, z), itemName: (id) => this.itemDB.name(id) });
    const size = await this._zip(files, `servidor_${slug(this.project.name)}.zip`);
    toast(`Pacote do servidor gerado (${files.length} arquivos, ${formatBytes(size)}).${warnings.length ? ` ${warnings.length} avisos — veja em Exportar.` : ''}`, warnings.length ? 'warn' : 'ok', 5000);
  }

  // ---------------------------------------------------------------- loop
  start() {
    const loop = (ts) => {
      requestAnimationFrame(loop);
      this.timer.update(ts);
      const raw = this.timer.getDelta();
      const dt = Math.min(raw, 0.1);
      this.time += dt;
      this._fpsAcc += raw;
      this._fpsFrames++;
      if (this._fpsAcc > 0.5) {
        this._fpsText = `${Math.round(this._fpsFrames / this._fpsAcc)} FPS`;
        if (this.fpsEl) this.fpsEl.textContent = this._fpsText;
        this._fpsAcc = 0;
        this._fpsFrames = 0;
      }
      const view = this.mode?.view;
      if (this.playing) {
        this.play.update(dt);
      } else {
        this.mode?.update?.(dt, this);
      }
      if (view === '3d' || this.playing) {
        if (!this.playing) {
          this._fly(dt);
          this.controls.update();
        }
        this.sky.update(dt, this.playing ? this.play.char.root.position : this.controls.target, this.project.sky.cloudSpeed);
        this.grass.update(this.time, this.sky);
        WIND.uTime.value = this.time;
        WIND.uWindDir.value.copy(this.sky.windDir2);
        WIND.uWindStrength.value = this.sky.windStrength;
        this.water.update(this.time);
        this.city.update(dt, this.time);
        if (this.post) this.post.render(dt);
        else this.renderer.render(this.scene, this.camera);
      } else if (view === 'cloth') {
        this.capeLab.ensureEnvironment();
        this.capeLab.update(dt);
        this.renderer.render(this.capeLab.scene, this.capeLab.camera);
      }
      this._mapAcc += dt;
      if (this._mapAcc > 0.12) {
        this._mapAcc = 0;
        this.minimap.draw();
      }
      if (this.thumbs.queue.length) this.thumbs.pump(2);
    };
    requestAnimationFrame(loop);
    setInterval(() => { if (this.dirty) this.autosave(); }, 60000);
  }
}

async function boot() {
  const root = document.getElementById('app');
  let app;
  try {
    app = new App(root);
  } catch (err) {
    root.append(el('div', { class: 'fatal' }, el('h2', {}, 'Não foi possível iniciar o 3D'), el('p', {}, 'Seu navegador precisa de WebGL 2 (Chrome, Edge ou Firefox atualizados).'), el('pre', {}, String(err && err.message))));
    return;
  }
  window.editorJogo = app;
  let restored = false;
  let saved = null;
  try { saved = localStorage.getItem(AUTOSAVE_KEY); } catch { saved = null; }
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const r = await modal({
        title: 'Recuperar trabalho',
        body: el('p', {}, `Encontrei um salvamento automático de "${data.name}". Quer continuar de onde parou?`),
        buttons: [{ label: 'Descartar', value: false }, { label: 'Recuperar', value: true, variant: 'primary' }],
      });
      if (r) {
        await app.applyProject(data);
        app.dirty = true;
        restored = true;
      } else {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignora */ }
      }
    } catch { /* salvamento corrompido: ignora */ }
  }
  if (!restored) await app.newProject('exemplo');
  app.setMode('terreno');
  app.applyQuality();
  app.start();
  document.body.classList.add('ready');
}

boot();

