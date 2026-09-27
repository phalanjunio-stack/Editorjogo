// "Hierarquia do Mundo": árvore com tudo que existe no projeto.
import { el, clear } from './ui.js';
import { icon } from './icons.js';
import { PREFAB_MAP } from '../city/prefabs.js';
import { NPC_TYPES } from '../city/city.js';

const MAX_CHILDREN = 300;

export class Hierarchy {
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    this.expanded = new Set(['mundo', 'folhagem']);
    this.query = '';
    this.search = el('input', { type: 'text', class: 'tree-search', placeholder: 'Buscar…' });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.render(); });
    const clearBtn = el('button', { class: 'ibtn tiny', type: 'button', title: 'Limpar busca' }, icon('x', 12));
    clearBtn.addEventListener('click', () => { this.search.value = ''; this.query = ''; this.render(); });
    this.list = el('div', { class: 'tree' });
    this.el = el('div', { class: 'hier' }, el('label', { class: 'tree-searchbox' }, icon('search', 13), this.search, clearBtn), this.list);
  }

  _model() {
    const app = this.app;
    const p = app.project;
    const A = this.actions;
    const sel = app.city.selected;
    const objLeaf = (o) => ({ id: o.uid, label: o.name, icon: 'cube', selected: sel?.uid === o.uid, onClick: () => A.selectObject('object', o.uid) });
    const byCat = (cats) => p.objects.filter((o) => cats.includes(o.kind === 'mesh' ? 'Minhas malhas' : PREFAB_MAP.get(o.ref)?.cat));
    const natural = byCat(['Natureza']);
    const trees = natural.filter((o) => o.ref === 'arvore' || o.ref === 'pinheiro');
    const others = natural.filter((o) => o.ref !== 'arvore' && o.ref !== 'pinheiro');
    const show = app.show;
    const group = (id, label, ic, list, extra = {}) => ({ id, label, icon: ic, count: list.length, children: list.slice(0, MAX_CHILDREN).map(objLeaf), ...extra });
    return [{
      id: 'mundo', label: p.name || 'Mundo', icon: 'globe', children: [
        { id: 'terreno', label: 'Terreno', icon: 'mountain', onClick: () => A.mode('terreno'), selected: app.mode?.id === 'terreno' },
        { id: 'luz', label: 'Iluminação e céu', icon: 'sun', onClick: () => A.mode('mundo'), selected: app.mode?.id === 'mundo' },
        { id: 'agua', label: 'Água', icon: 'droplet', onClick: () => A.mode('mundo'), eye: 'agua', visible: show.agua },
        { id: 'folhagem', label: 'Folhagem', icon: 'leaf', children: [
          { id: 'grama', label: 'Camada de grama', icon: 'leaf', onClick: () => A.mode('terreno'), eye: 'grama', visible: show.grama },
          group('arvores', 'Árvores', 'trees', trees),
          group('pedras', 'Arbustos e pedras', 'stone', others),
        ] },
        group('construcoes', 'Construções', 'building', byCat(['Construções']), { eye: 'objetos', visible: show.objetos }),
        group('muralhas', 'Muralhas', 'castle', byCat(['Muralhas'])),
        group('decoracao', 'Decoração', 'sparkles', byCat(['Decoração'])),
        group('malhas', 'Minhas malhas', 'cube', byCat(['Minhas malhas'])),
        { id: 'npcs', label: 'NPCs', icon: 'user', count: p.npcs.length, eye: 'npcs', visible: show.npcs, children: NPC_TYPES.map((t) => {
          const list = p.npcs.filter((n) => n.type === t.id);
          return list.length ? { id: `npc-${t.id}`, label: t.label, icon: t.id === 'Monster' ? 'sword' : 'user', count: list.length, children: list.map((n) => ({ id: n.uid, label: `${n.name} [${n.npcId}]`, icon: 'user', selected: sel?.uid === n.uid, onClick: () => A.selectObject('npc', n.uid) })) } : null;
        }).filter(Boolean) },
        { id: 'zonas', label: 'Zonas', icon: 'hexagon', count: p.zones.length, eye: 'zonas', visible: show.zonas, children: p.zones.map((z) => ({ id: z.uid, label: `${z.name} (${z.type})`, icon: 'hexagon', selected: sel?.uid === z.uid, onClick: () => A.selectObject('zone', z.uid) })) },
        { id: 'lojas', label: 'Lojas (multisell)', icon: 'coins', count: p.multisells.length, children: p.multisells.map((m) => ({ id: m.uid, label: `${m.listId} — ${m.name}`, icon: 'coins', onClick: () => A.multisell(m) })) },
        { id: 'dialogos', label: 'Diálogos (HTML)', icon: 'code', count: p.htmls.length, children: p.htmls.map((h) => ({ id: h.uid, label: h.path, icon: 'chat', onClick: () => A.html(h) })) },
        { id: 'roupas', label: 'Roupas e capas', icon: 'shirt', onClick: () => A.mode('roupa'), selected: app.mode?.id === 'roupa' },
      ],
    }];
  }

  render() {
    const q = this.query;
    clear(this.list);
    const matches = (n) => !q || n.label.toLowerCase().includes(q) || (n.children || []).some(matches);
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        if (!matches(n)) continue;
        const hasKids = n.children && n.children.length > 0;
        const open = q ? true : this.expanded.has(n.id);
        const row = el('div', { class: `tree-row ${n.selected ? 'selected' : ''}`, style: { paddingLeft: `${4 + depth * 14}px` } });
        const tw = el('span', { class: 'tw' }, hasKids ? icon(open ? 'chevronDown' : 'chevronRight', 11) : '');
        tw.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.expanded.has(n.id)) this.expanded.delete(n.id); else this.expanded.add(n.id);
          this.render();
        });
        row.append(tw, icon(n.icon || 'folder', 14, 'tree-ico'), el('span', { class: 'tree-label' }, n.label));
        if (n.count !== undefined) row.append(el('span', { class: 'tree-count' }, n.count));
        if (n.eye) {
          const eye = el('span', { class: `tree-eye ${n.visible ? '' : 'off'}`, title: n.visible ? 'Esconder' : 'Mostrar' }, icon('eye', 13));
          eye.addEventListener('click', (e) => { e.stopPropagation(); this.actions.toggleShow(n.eye); });
          row.append(eye);
        }
        row.addEventListener('click', () => {
          if (n.onClick) n.onClick();
          else if (hasKids) {
            if (this.expanded.has(n.id)) this.expanded.delete(n.id); else this.expanded.add(n.id);
            this.render();
          }
        });
        this.list.append(row);
        if (hasKids && open) walk(n.children, depth + 1);
      }
    };
    walk(this._model(), 0);
    this.list.querySelector('.tree-row.selected')?.scrollIntoView({ block: 'nearest' });
  }

  reveal(uid) {
    const p = this.app.project;
    const o = p.objects.find((x) => x.uid === uid);
    if (o) {
      this.expanded.add('mundo');
      const cat = o.kind === 'mesh' ? 'malhas' : { Construções: 'construcoes', Muralhas: 'muralhas', Decoração: 'decoracao', Natureza: 'folhagem' }[PREFAB_MAP.get(o.ref)?.cat];
      if (cat) this.expanded.add(cat);
      if (cat === 'folhagem') this.expanded.add(o.ref === 'arvore' || o.ref === 'pinheiro' ? 'arvores' : 'pedras');
    }
    const n = p.npcs.find((x) => x.uid === uid);
    if (n) { this.expanded.add('npcs'); this.expanded.add(`npc-${n.type}`); }
    if (p.zones.some((z) => z.uid === uid)) this.expanded.add('zonas');
  }
}
