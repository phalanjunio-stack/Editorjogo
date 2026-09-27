// "Navegador de Conteúdo": pastas à esquerda e miniaturas à direita, como nas engines.
import { el, ico, clear } from './ui.js';
import { icon } from './icons.js';
import { PREFABS } from '../city/prefabs.js';
import { NPC_TYPES } from '../city/city.js';
import { FOLIAGE_PRESETS } from '../core/state.js';
import { CLOTH_PRESETS } from '../cloth/capeLab.js';
import { foliageThumb, textureThumb } from './thumbs.js';

const TREE = [
  { id: 'conteudo', label: 'Conteúdo', children: [
    { id: 'objetos', label: 'Objetos', children: [
      { id: 'Construções', label: 'Construções' },
      { id: 'Muralhas', label: 'Muralhas' },
      { id: 'Decoração', label: 'Decoração' },
      { id: 'Natureza', label: 'Natureza' },
      { id: 'malhas', label: 'Minhas malhas' },
    ] },
    { id: 'terreno', label: 'Terreno', children: [
      { id: 'texturas', label: 'Texturas' },
      { id: 'folhagem', label: 'Folhagem' },
    ] },
    { id: 'personagens', label: 'Personagens', children: [
      { id: 'npcs', label: 'NPCs' },
      { id: 'roupas', label: 'Roupas e capas' },
    ] },
    { id: 'gameplay', label: 'Gameplay', children: [
      { id: 'itens', label: 'Itens' },
      { id: 'lojas', label: 'Lojas (multisell)' },
      { id: 'paginas', label: 'Páginas HTML' },
    ] },
  ] },
];

function findPath(id, nodes = TREE, trail = []) {
  for (const n of nodes) {
    const t = [...trail, n];
    if (n.id === id) return t;
    if (n.children) {
      const r = findPath(id, n.children, t);
      if (r) return r;
    }
  }
  return null;
}

const foliageCache = new Map();
const itemColor = { Moeda: '#c9a33a', Consumível: '#4aa36a', Munição: '#7d8aa8', Enchant: '#6a7ee0', Material: '#8c7a5e', 'Arma S': '#c0503a', 'Armadura S': '#5a88c0', 'Joia épica': '#b25ad6' };

export class ContentBrowser {
  constructor(app, actions) {
    this.app = app;
    this.actions = actions; // funções fornecidas pelo main (selecionar peça, camada etc.)
    this.folder = 'Construções';
    this.query = '';
    this.expanded = new Set(['conteudo', 'objetos', 'terreno', 'personagens', 'gameplay']);
    this.treeEl = el('div', { class: 'cb-tree' });
    this.crumb = el('div', { class: 'cb-crumb' });
    this.search = el('input', { type: 'text', class: 'cb-search', placeholder: 'Buscar…' });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.renderGrid(); });
    this.grid = el('div', { class: 'cb-grid' });
    const right = el('div', { class: 'cb-right' },
      el('div', { class: 'cb-bar' }, this.crumb, el('label', { class: 'cb-searchbox' }, icon('search', 13), this.search)),
      this.grid);
    this.el = el('div', { class: 'cb' }, this.treeEl, right);
  }

  open(folder) {
    this.folder = folder;
    for (const n of findPath(folder) || []) this.expanded.add(n.id);
    this.render();
  }

  render() {
    this.renderTree();
    this.renderGrid();
  }

  renderTree() {
    clear(this.treeEl);
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        const open = this.expanded.has(n.id);
        const row = el('button', { class: `cb-node ${this.folder === n.id ? 'active' : ''}`, type: 'button', style: { paddingLeft: `${6 + depth * 12}px` } },
          n.children ? icon(open ? 'chevronDown' : 'chevronRight', 11, 'tw') : el('span', { class: 'tw' }),
          icon(open && n.children ? 'folderOpen' : 'folder', 14, 'folder-ico'),
          el('span', {}, n.label));
        row.addEventListener('click', () => {
          if (n.children) {
            if (this.expanded.has(n.id) && this.folder === n.id) this.expanded.delete(n.id);
            else this.expanded.add(n.id);
          }
          this.folder = n.id;
          this.render();
        });
        this.treeEl.append(row);
        if (n.children && open) walk(n.children, depth + 1);
      }
    };
    walk(TREE, 0);
  }

  _items() {
    const app = this.app;
    const A = this.actions;
    const f = this.folder;
    const out = [];
    const prefabCats = ['Construções', 'Muralhas', 'Decoração', 'Natureza'];
    const addPrefabs = (cat) => {
      for (const p of PREFABS.filter((x) => !cat || x.cat === cat)) {
        out.push({
          key: `p:${p.id}`,
          label: p.name,
          thumb: (cb) => app.thumbs.prefab(p.id, cb),
          active: app.city.placeRef === p.id && app.city.tool === 'colocar',
          onClick: () => A.placePrefab(p.id),
        });
      }
    };
    if (prefabCats.includes(f)) addPrefabs(f);
    if (f === 'objetos' || f === 'conteudo') addPrefabs(null);
    if (f === 'malhas' || f === 'objetos' || f === 'conteudo') {
      for (const m of app.project.customMeshes) {
        out.push({
          key: `m:${m.id}`,
          label: m.name,
          thumb: (cb) => app.thumbs.mesh(m.id, cb),
          active: app.city.placeRef === `mesh:${m.id}` && app.city.tool === 'colocar',
          onClick: () => A.placePrefab(`mesh:${m.id}`),
        });
      }
      if (f === 'malhas') out.push({ key: 'import', label: 'Importar malha…', iconName: 'upload', onClick: () => A.importMesh() });
    }
    if (f === 'texturas' || f === 'terreno') {
      app.project.terrain.layers.forEach((l, i) => {
        out.push({
          key: `t:${i}:${l.texture ? l.texture.length : 0}`,
          label: l.name,
          src: textureThumb(app.terrain.layerTextures[i]),
          active: A.activeLayer() === i,
          onClick: () => A.paintLayer(i),
        });
      });
    }
    if (f === 'folhagem' || f === 'terreno') {
      for (const p of FOLIAGE_PRESETS) {
        if (!foliageCache.has(p.id)) foliageCache.set(p.id, foliageThumb(p));
        out.push({ key: `f:${p.id}`, label: p.name, src: foliageCache.get(p.id), active: app.project.grass.preset === p.id, onClick: () => A.foliage(p) });
      }
    }
    if (f === 'npcs' || f === 'personagens') {
      for (const t of NPC_TYPES) {
        out.push({ key: `n:${t.id}`, label: t.label, iconName: 'user', color: t.color, active: app.city.tool === 'npc' && app.city.opts.npcType === t.id, onClick: () => A.npcType(t.id) });
      }
    }
    if (f === 'roupas' || f === 'personagens') {
      for (const p of [...CLOTH_PRESETS, ...app.project.cloth.presets]) {
        out.push({ key: `c:${p.name}`, label: p.name, iconName: p.type === 'bandeira' ? 'flag' : 'shirt', color: p.colorOuter, onClick: () => A.cloth(p) });
      }
    }
    if (f === 'itens' || f === 'gameplay') {
      const list = this.query ? app.itemDB.search(this.query, 200) : app.itemDB.all().slice(0, f === 'gameplay' ? 24 : 400);
      for (const it of list) {
        out.push({ key: `i:${it.id}`, label: it.name, sub: `#${it.id}`, iconName: 'item', color: itemColor[it.type] || '#7a8290', onClick: () => A.item(it), noFilter: true });
      }
    }
    if (f === 'lojas' || f === 'gameplay') {
      for (const m of app.project.multisells) out.push({ key: `ms:${m.uid}`, label: m.name, sub: `#${m.listId}`, iconName: 'coins', color: '#c9a33a', onClick: () => A.multisell(m) });
    }
    if (f === 'paginas' || f === 'gameplay') {
      for (const h of app.project.htmls) out.push({ key: `h:${h.uid}`, label: h.path.split('/').pop(), sub: h.path.split('/')[0], iconName: 'code', color: '#5aa9ff', onClick: () => A.html(h) });
    }
    return out;
  }

  renderGrid() {
    const path = findPath(this.folder) || [];
    clear(this.crumb);
    this.crumb.append(icon('folderOpen', 13));
    path.forEach((n, i) => {
      if (i) this.crumb.append(el('span', { class: 'sep' }, '›'));
      const b = el('button', { class: 'crumb', type: 'button' }, n.label);
      b.addEventListener('click', () => this.open(n.id));
      this.crumb.append(b);
    });
    clear(this.grid);
    const q = this.query;
    const items = this._items().filter((it) => it.noFilter || !q || it.label.toLowerCase().includes(q));
    if (!items.length) this.grid.append(el('p', { class: 'hint' }, q ? 'Nada encontrado.' : 'Pasta vazia.'));
    for (const it of items) {
      const img = el('div', { class: 'cb-img' });
      if (it.src) img.style.backgroundImage = `url("${it.src}")`;
      else if (it.thumb) {
        const url = it.thumb((u) => { if (u) img.style.backgroundImage = `url("${u}")`; img.classList.remove('loading'); });
        if (url) img.style.backgroundImage = `url("${url}")`;
        else img.classList.add('loading');
      } else if (it.iconName) {
        img.classList.add('cb-icon');
        if (it.color) img.style.color = it.color;
        img.append(ico(it.iconName, 30));
      }
      const card = el('button', { class: `cb-card ${it.active ? 'active' : ''}`, type: 'button', title: it.sub ? `${it.label} (${it.sub})` : it.label },
        img, el('span', { class: 'cb-label' }, it.label), it.sub ? el('span', { class: 'cb-sub' }, it.sub) : null);
      card.addEventListener('click', () => { it.onClick?.(); this.renderGrid(); });
      this.grid.append(card);
    }
  }
}

