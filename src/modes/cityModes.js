// Abas "Objetos" (peças, natureza, muralhas) e "NPC" (spawns, dados do NPC, zonas).
// As duas compartilham o editor de cidade (seleção, gizmo W/E/R, desfazer).
import { section, slider, number, select, checkbox, color, button, buttonRow, hint, toolGrid, el, text, toast, promptBox, readFileAs, pickFiles, confirmBox } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { PREFABS, PREFAB_MAP } from '../city/prefabs.js';
import { NPC_TYPES, NPC_TYPE_MAP, ZONE_TYPES } from '../city/city.js';
import { htmlTemplate, htmlPathFor } from '../l2/htmlCore.js';
import { editorToL2, l2ToEditor, degToHeading, headingToDeg, bytesToBase64, uid } from '../core/util.js';

const HINTS = {
  selecionar: 'Clique para selecionar • W mover • E girar • R escalar • Del apagar • Ctrl+D duplicar • End grudar no chão • F focar',
  colocar: 'Clique no chão para colocar • [ ] gira a peça • escolha a peça no Navegador de Conteúdo • Esc: Selecionar',
  espalhar: 'Arraste para espalhar • Shift + arrastar apaga • marque os tipos no painel',
  muralha: 'Clique nos cantos da muralha • Enter ou duplo clique termina • Backspace desfaz ponto • Esc cancela',
  npc: 'Clique no chão para colocar o NPC • ajuste ID, IA, drops, HTML e loja em Propriedades',
  zona: 'Clique nos cantos da zona • Enter ou duplo clique termina • Backspace desfaz ponto • Esc cancela',
};

const RACES = ['HUMAN', 'ELF', 'DARK_ELF', 'ORC', 'DWARF', 'KAMAEL', 'ANIMAL', 'BEAST', 'BUG', 'PLANT', 'UNDEAD', 'DEMONIC', 'DRAGON', 'GIANT', 'ANGEL', 'CONSTRUCT', 'ETC'];

const st = { scattering: false, scatterBefore: null, lastScatter: 0, hover: null, erase: false };

// ------------------------------------------------------------------ base comum
const base = {
  view: '3d',

  enter(app) {
    this.app = app;
    const c = app.city;
    c.applySnapSettings();
    this._offSel = app.events.on('selection-changed', () => { app.refreshRight(); });
    this._offMove = app.events.on('selection-moved', () => this._updateTransformFields());
    this._offGizmo = app.events.on('gizmo-mode', () => app.refreshViewportBar());
    this.setTool(this.tools.some((t) => t.id === c.tool) ? c.tool : 'selecionar');
  },

  exit(app) {
    this._offSel?.();
    this._offMove?.();
    this._offGizmo?.();
    app.city.setGhost(null);
    app.city.clearPath();
    app.terrain.setBrush(false);
  },

  setTool(id) {
    const app = this.app;
    const c = app.city;
    c.tool = id;
    c.clearPath();
    c.setGhost(id === 'colocar' ? c.placeRef : id === 'npc' ? 'npc' : null);
    if (id !== 'selecionar') c.gizmo.detach();
    else if (c.selected && c.selected.kind !== 'zone') c.select(c.selected.kind, c.selected.uid);
    app.terrain.setBrush(false);
    app.status(HINTS[id]);
    app.refreshLeft();
    app.contentBrowser?.renderGrid();
  },

  _toolsSection(root, app) {
    const c = app.city;
    const tools = section(root, this.toolTitle, { icon: this.icon });
    toolGrid(tools, this.tools, c.tool, (id) => this.setTool(id), { cols: 4 });
    return tools;
  },

  _snapSection(root, app) {
    const c = app.city;
    const snap = section(root, 'Encaixe', { icon: 'magnet', open: false });
    checkbox(snap, 'Grudar no chão', c.opts, 'snapGround');
    select(snap, 'Grade (m)', c.opts, 'grid', [0, 0.25, 0.5, 1, 2, 4, 8].map((v) => ({ value: v, label: v ? `${v} m` : 'livre' })), { onChange: () => { c.applySnapSettings(); app.refreshViewportBar(); } });
    select(snap, 'Girar de (°)', c.opts, 'rotSnap', [0, 5, 15, 45, 90].map((v) => ({ value: v, label: v ? `${v}°` : 'livre' })), { onChange: () => c.applySnapSettings() });
  },

  _pathButtons(s, app, finish) {
    const c = app.city;
    buttonRow(s,
      button(null, 'Terminar', () => { if (!finish()) toast('Faltam pontos.', 'warn'); }, { variant: 'primary', icon: 'check' }),
      button(null, 'Desfazer ponto', () => c.popPathPoint(), { icon: 'undo' }),
      button(null, 'Cancelar', () => c.clearPath(), { icon: 'x' }),
    );
  },

  // ------------------------------------------------------------ propriedades
  buildProps(root, app) {
    const c = app.city;
    const sel = c.selected;
    const data = sel ? c.getData(sel.kind, sel.uid) : null;
    this._fields = null;
    this._l2info = null;
    if (!data) return this._emptyProps(root, app);
    if (sel.kind === 'object') this._objectProps(root, app, data);
    else if (sel.kind === 'npc') this._npcProps(root, app, data);
    else this._zoneProps(root, app, data);
  },

  _emptyProps(root, app) {
    const p = app.project;
    const s = section(root, 'Nada selecionado', { icon: 'info' });
    s.append(el('div', { class: 'kv' },
      el('span', {}, 'Objetos'), el('b', {}, p.objects.length),
      el('span', {}, 'NPCs'), el('b', {}, p.npcs.length),
      el('span', {}, 'Zonas'), el('b', {}, p.zones.length)));
    hint(s, 'Clique num objeto no viewport ou na Hierarquia do Mundo para ver e editar as propriedades.');
  },

  _edit(app, label, fn) {
    app.city.commit(label, fn);
  },

  _vec3Row(parent, label, values, step, onSet, keys = ['x', 'y', 'z']) {
    const grid = el('div', { class: 'xyz' });
    const inputs = [];
    keys.forEach((k, i) => {
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: values[i], title: `${k.toUpperCase()} (passo ${step})` });
      inp.addEventListener('change', () => onSet(i, parseFloat(String(inp.value).replace(',', '.'))));
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        inp.value = String(Math.round(((parseFloat(inp.value) || 0) + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000);
        inp.dispatchEvent(new Event('change'));
      });
      inputs.push(inp);
      grid.append(el('label', { class: `ax ax-${'xyz'[i]}` }, el('span', {}, k.toUpperCase()), inp));
    });
    parent.append(el('div', { class: 'row vec' }, el('span', { class: 'row-label' }, label), grid));
    return inputs;
  },

  _objectProps(root, app, o) {
    const c = app.city;
    const def = o.kind === 'prefab' ? PREFAB_MAP.get(o.ref) : null;
    const head = section(root, def ? def.name : o.name, { icon: 'cube' });
    const thumb = el('div', { class: 'prop-preview' });
    const url = o.kind === 'prefab' ? app.thumbs.prefab(o.ref, (u) => { thumb.style.backgroundImage = `url("${u}")`; }) : app.thumbs.mesh(o.ref, (u) => { thumb.style.backgroundImage = `url("${u}")`; });
    if (url) thumb.style.backgroundImage = `url("${url}")`;
    head.append(el('div', { class: 'prop-head' }, thumb, el('div', {}, el('b', {}, o.name), el('div', { class: 'hint' }, def ? `Peça: ${def.cat}` : 'Malha importada'))));
    text(head, 'Nome', o, 'name', { onChange: () => { app.markDirty(); app.hierarchy.render(); } });

    const tr = section(root, 'Transform', { icon: 'move' });
    const apply = () => {
      c._applyTransform(c.nodes.get(o.uid), o);
      c._syncCloth(o.uid);
      app.markDirty();
    };
    this._fields = {
      pos: this._vec3Row(tr, 'Posição (m)', o.pos.map((v) => v.toFixed(2)), 0.1, (i, v) => this._edit(app, 'Mover', () => { o.pos[i] = v || 0; apply(); })),
      rot: this._vec3Row(tr, 'Rotação (°)', o.rot.map((v) => Math.round(v)), 1, (i, v) => this._edit(app, 'Girar', () => { o.rot[i] = v || 0; apply(); })),
      scale: this._vec3Row(tr, 'Escala', o.scale, 0.05, (i, v) => this._edit(app, 'Escalar', () => { o.scale[i] = Math.max(0.01, v || 1); apply(); })),
    };
    if (def?.color) {
      const ap = section(root, 'Aparência', { icon: 'image' });
      color(ap, 'Cor principal', o, 'color', { onChange: () => { c.refreshNode('object', o.uid); app.markDirty(); } });
      if (['arvore', 'pedra', 'arbusto', 'pinheiro'].includes(o.ref)) {
        button(ap, 'Nova variação', () => this._edit(app, 'Variação', () => { o.seed = Math.floor(Math.random() * 100000); c.refreshNode('object', o.uid); }), { icon: 'dice' });
      }
    }
    this._commonButtons(section(root, 'Ações', { icon: 'sliders' }), app);
  },

  _updateTransformFields() {
    const app = this.app;
    const sel = app.city.selected;
    const f = this._fields;
    if (!sel || !f) return;
    const o = app.city.getData(sel.kind, sel.uid);
    if (!o) return;
    if (sel.kind === 'npc') {
      const l2 = editorToL2({ x: o.pos[0], y: o.pos[1], z: o.pos[2] }, app.project.server);
      f.pos[0].value = l2.x; f.pos[1].value = l2.y; f.pos[2].value = l2.z;
      if (f.heading) f.heading.value = degToHeading(o.heading);
      return;
    }
    f.pos.forEach((inp, i) => { inp.value = o.pos[i].toFixed(2); });
    f.rot.forEach((inp, i) => { inp.value = Math.round(o.rot[i]); });
    f.scale.forEach((inp, i) => { inp.value = o.scale[i]; });
  },

  _commonButtons(s, app) {
    const c = app.city;
    buttonRow(s,
      button(null, 'Duplicar', () => c.duplicateSelected(), { title: 'Ctrl+D', icon: 'copy' }),
      button(null, 'No chão', () => c.dropSelectedToGround(), { title: 'End', icon: 'download' }),
      button(null, 'Focar', () => this.focusSelected(), { title: 'F', icon: 'target' }),
      button(null, 'Excluir', () => c.deleteSelected(), { variant: 'danger', title: 'Delete', icon: 'trash' }),
    );
  },

  _npcProps(root, app, n) {
    const c = app.city;
    const refresh = () => { c.refreshNode('npc', n.uid); app.markDirty(); app.hierarchy.render(); };
    const edit = (label) => () => this._edit(app, label, refresh);
    const t = NPC_TYPE_MAP.get(n.type);
    const head = section(root, `NPC (${n.name})`, { icon: 'user' });
    const badge = el('div', { class: 'prop-preview icon', style: { color: t?.color || '#fff' } }, icon(n.type === 'Monster' ? 'sword' : 'user', 34));
    head.append(el('div', { class: 'prop-head' }, badge, el('div', {}, el('b', {}, n.name), el('div', { class: 'hint' }, `${t?.label || n.type} • ID ${n.npcId}`))));

    const tr = section(root, 'Transform', { icon: 'move' });
    const server = app.project.server;
    const l2 = editorToL2({ x: n.pos[0], y: n.pos[1], z: n.pos[2] }, server);
    const node = () => c.nodes.get(n.uid);
    const setL2 = (i, v) => this._edit(app, 'Mover NPC', () => {
      const cur = editorToL2({ x: n.pos[0], y: n.pos[1], z: n.pos[2] }, server);
      const arr = [cur.x, cur.y, cur.z];
      arr[i] = Math.round(v || 0);
      const e = l2ToEditor({ x: arr[0], y: arr[1], z: arr[2] }, server);
      n.pos = [e.x, i === 2 ? e.y : app.terrain.heightAt(e.x, e.z), e.z];
      node().position.fromArray(n.pos);
      app.markDirty();
    });
    this._fields = { pos: this._vec3Row(tr, 'Posição (L2)', [l2.x, l2.y, l2.z], 1, setL2) };
    const hObj = { h: degToHeading(n.heading) };
    const hIn = el('input', { type: 'number', min: 0, max: 65535, step: 1024, value: hObj.h });
    hIn.addEventListener('change', () => this._edit(app, 'Girar NPC', () => {
      n.heading = headingToDeg(((parseInt(hIn.value, 10) || 0) % 65536 + 65536) % 65536);
      node().rotation.y = (-n.heading * Math.PI) / 180;
      app.markDirty();
    }));
    this._fields.heading = hIn;
    tr.append(el('div', { class: 'row', title: 'Heading do L2: 0 = leste, 16384 = sul, 32768 = oeste, 49152 = norte' }, el('span', { class: 'row-label' }, 'Heading'), hIn));

    const d = section(root, 'NPC Data', { icon: 'info' });
    number(d, 'ID', n, 'npcId', { min: 1, step: 1, onChange: edit('ID do NPC'), title: 'Precisa existir em data/stats/npcs (ou marque "NPC novo")' });
    text(d, 'Nome', n, 'name', { onChange: edit('Nome do NPC') });
    text(d, 'Título', n, 'title', { onChange: edit('Título do NPC') });
    number(d, 'Level', n, 'level', { min: 1, max: 120, step: 1, onChange: () => app.markDirty() });
    number(d, 'HP', n, 'hp', { min: 1, step: 100, onChange: () => app.markDirty() });
    number(d, 'MP', n, 'mp', { min: 0, step: 100, onChange: () => app.markDirty() });
    select(d, 'Facção', n, 'type', NPC_TYPES.map((x) => ({ value: x.id, label: x.label })), { onChange: edit('Tipo do NPC') });
    select(d, 'Raça', n, 'race', RACES, { onChange: () => app.markDirty() });
    const looks = [{ value: '', label: 'Marcador (cápsula)' }, ...app.project.characters.map((ch) => ({ value: ch.id, label: `Personagem: ${ch.name}` }))];
    const look = { v: n.character || '' };
    select(d, 'Aparência', look, 'v', looks, {
      onChange: (v) => this._edit(app, 'Aparência do NPC', () => { n.character = v || null; refresh(); }),
      title: 'Como o NPC aparece no editor e no modo Play (crie personagens na aba Personagens)',
    });
    checkbox(d, 'NPC novo (gerar template no servidor)', n, 'customTemplate', { onChange: () => { app.markDirty(); app.refreshRight(); }, title: 'Cria data/stats/npcs/custom/… com Level, HP, MP, IA e drops' });
    if (n.customTemplate) number(d, 'Aparência (displayId)', n, 'displayId', { min: 0, step: 1, onChange: () => app.markDirty(), title: 'ID de um NPC existente cujo modelo 3D o cliente vai usar' });

    const ai = section(root, 'IA e Spawn', { icon: 'target' });
    checkbox(ai, 'Agressivo', n, 'aggressive', { onChange: () => app.markDirty() });
    number(ai, 'Raio de visão', n, 'aggroRange', { min: 0, max: 3000, step: 10, onChange: () => app.markDirty(), title: 'aggroRange, em unidades do L2' });
    number(ai, 'Respawn (s)', n, 'respawn', { min: 1, step: 1, onChange: () => app.markDirty() });
    number(ai, 'Quantidade', n, 'count', { min: 1, max: 100, step: 1, onChange: edit('Quantidade') });
    number(ai, 'Raio de spawn (m)', n, 'radius', { min: 0, max: 200, step: 1, onChange: edit('Raio') });

    const dl = section(root, 'Drop List', { icon: 'coins' });
    const list = el('div', { class: 'drop-list' });
    const renderDrops = () => {
      list.replaceChildren();
      n.drops.forEach((dr, i) => {
        const idIn = el('input', { type: 'text', list: 'dl-itens', value: dr.id, class: 'drop-id', title: 'ID do item' });
        const nm = el('span', { class: 'drop-name' }, app.itemDB.name(dr.id) || '?');
        idIn.addEventListener('change', () => { dr.id = parseInt(idIn.value, 10) || 0; nm.textContent = app.itemDB.name(dr.id) || '?'; app.markDirty(); });
        const ch = el('input', { type: 'number', value: dr.chance, min: 0, max: 100, step: 0.1, class: 'drop-ch', title: 'Chance %' });
        ch.addEventListener('change', () => { dr.chance = parseFloat(ch.value) || 0; app.markDirty(); });
        const mn = el('input', { type: 'number', value: dr.min, min: 1, class: 'drop-n', title: 'Mínimo' });
        mn.addEventListener('change', () => { dr.min = parseInt(mn.value, 10) || 1; app.markDirty(); });
        const mx = el('input', { type: 'number', value: dr.max, min: 1, class: 'drop-n', title: 'Máximo' });
        mx.addEventListener('change', () => { dr.max = parseInt(mx.value, 10) || 1; app.markDirty(); });
        const rm = el('button', { class: 'ibtn tiny', type: 'button', title: 'Remover' }, icon('minus', 12));
        rm.addEventListener('click', () => { n.drops.splice(i, 1); app.markDirty(); renderDrops(); });
        list.append(el('div', { class: 'drop-row' }, el('div', { class: 'drop-item' }, idIn, nm), ch, el('span', { class: 'pct' }, '%'), mn, mx, rm));
      });
      if (!n.drops.length) list.append(el('p', { class: 'hint' }, 'Sem drops. Monstros costumam dropar Adena (57).'));
    };
    renderDrops();
    dl.append(el('div', { class: 'drop-head' }, el('span', {}, 'Item'), el('span', {}, 'Chance'), el('span', {}, 'Mín / Máx')), list);
    button(dl, 'Adicionar drop', () => { n.drops.push({ id: 57, chance: 70, min: 10, max: 50 }); app.markDirty(); renderDrops(); }, { icon: 'plus' });
    hint(dl, 'Os drops vão no template do NPC novo (marque "NPC novo" acima).');

    const dg = section(root, 'Diálogo e Loja', { icon: 'chat' });
    const pages = [{ value: '', label: '(nenhuma)' }, ...app.project.htmls.map((h) => ({ value: h.path, label: h.path }))];
    select(dg, 'Página HTML', n, 'html', pages, { onChange: () => app.markDirty() });
    const lists = [{ value: '', label: '(nenhum)' }, ...app.project.multisells.map((m) => ({ value: String(m.listId), label: `${m.listId} — ${m.name}` }))];
    const msObj = { v: n.multisell ? String(n.multisell) : '' };
    select(dg, 'Multisell', msObj, 'v', lists, { onChange: (v) => { n.multisell = v ? Number(v) : ''; app.markDirty(); } });
    buttonRow(dg,
      button(null, 'Criar HTML', () => {
        const path = htmlPathFor(n);
        let page = app.project.htmls.find((h) => h.path === path);
        if (!page) {
          page = { uid: uid('html'), path, content: htmlTemplate(n.type, { name: n.name, multisellId: Number(n.multisell) || 0, bypass: app.project.server.bypass }) };
          app.project.htmls.push(page);
        }
        n.html = path;
        app.markDirty();
        app.refreshRight();
        app.hierarchy.render();
        app.log(`Página ${path} ligada a ${n.name}.`);
      }, { icon: 'sparkles', title: 'Cria uma página inicial pelo tipo do NPC' }),
      button(null, 'Abrir HTML', () => {
        if (!n.html) return toast('Este NPC não tem página ainda.', 'warn');
        app.openHtml(n.html);
      }, { icon: 'code' }),
      n.multisell ? button(null, 'Abrir loja', () => app.openMultisell(Number(n.multisell)), { icon: 'coins' }) : null,
    );
    this._commonButtons(section(root, 'Ações', { icon: 'sliders' }), app);
  },

  _zoneProps(root, app, z) {
    const c = app.city;
    const s = section(root, 'Zona', { icon: 'hexagon' });
    const refresh = () => { c.refreshNode('zone', z.uid); app.markDirty(); app.hierarchy.render(); };
    text(s, 'Nome', z, 'name', { onChange: () => this._edit(app, 'Nome da zona', refresh) });
    select(s, 'Tipo', z, 'type', ZONE_TYPES.map((t) => ({ value: t.id, label: t.label })), { onChange: () => this._edit(app, 'Tipo da zona', refresh) });
    const mk = (key, label) => {
      const inp = el('input', { type: 'number', value: z[key] ?? '', placeholder: String(app.project.server[key === 'minZ' ? 'zoneMinZ' : 'zoneMaxZ']) });
      inp.addEventListener('change', () => { z[key] = inp.value === '' ? null : Number(inp.value); app.markDirty(); });
      s.append(el('label', { class: 'row' }, el('span', { class: 'row-label' }, label), inp));
    };
    mk('minZ', 'Z mínimo (L2)');
    mk('maxZ', 'Z máximo (L2)');
    hint(s, `${z.points.length} pontos. Deixe Z vazio para usar o padrão da aba Exportar.`);
    buttonRow(s,
      button(null, 'Focar', () => this.focusSelected(), { icon: 'target' }),
      button(null, 'Excluir', () => c.deleteSelected(), { variant: 'danger', icon: 'trash' }),
    );
  },

  focusSelected() {
    this.app.focusSelection();
  },

  // ------------------------------------------------------------ entrada
  onPointerDown(e, ctx) {
    const app = this.app;
    const c = app.city;
    if (e.button !== 0) return;
    if (c.gizmo.dragging || (c.gizmo.object && c.gizmo.axis)) return;
    const hit = app.terrain.raycast(ctx.ray);
    switch (c.tool) {
      case 'selecionar': {
        const pick = c.pick(ctx.raycaster);
        if (pick) {
          c.select(pick.kind, pick.uid);
          const want = pick.kind === 'object' ? 'objetos' : 'npc';
          if (this.id !== want) app.setMode(want);
        } else c.select(null);
        app.hierarchy.reveal(pick?.uid);
        app.hierarchy.render();
        break;
      }
      case 'colocar': {
        if (!hit) return;
        const p = c.snapPoint(hit);
        const o = c.commit('Colocar peça', () => c.addObject(c.placeRef, p, { yaw: c.placeRot }));
        app.status(`${o.name} colocada. Continue clicando ou Esc para selecionar.`);
        break;
      }
      case 'npc': {
        if (!hit) return;
        const n = c.commit('Colocar NPC', () => c.addNpc(c.snapPoint(hit)));
        c.tool = 'selecionar';
        c.setGhost(null);
        c.select('npc', n.uid);
        app.refreshLeft();
        app.hierarchy.reveal(n.uid);
        app.hierarchy.render();
        app.status('NPC criado! Ajuste ID, dados, drops, HTML e loja em Propriedades.');
        break;
      }
      case 'espalhar':
        if (!hit) return;
        st.scattering = true;
        st.erase = e.shiftKey;
        st.scatterBefore = c.snapshot();
        st.hover = hit;
        c.scatterAt(hit, st.erase);
        app.canvas.setPointerCapture?.(e.pointerId);
        break;
      case 'muralha':
      case 'zona':
        if (hit) c.addPathPoint(c.snapPoint(hit));
        break;
      default:
    }
  },

  onPointerMove(e, ctx) {
    const app = this.app;
    const c = app.city;
    const hit = app.terrain.raycast(ctx.ray);
    st.hover = hit;
    if (c.tool === 'colocar' || c.tool === 'npc') c.moveGhost(hit);
    if (c.tool === 'espalhar') app.terrain.setBrush(!!hit, hit?.x, hit?.z, c.opts.scatterRadius, e.shiftKey ? '#ff6a6a' : '#7fe08a');
    if (c.tool === 'muralha' || c.tool === 'zona') c.hoverPath(hit ? c.snapPoint(hit) : null);
    if (hit) app.setCursorCoords(hit);
  },

  onPointerUp() {
    const c = this.app.city;
    if (st.scattering) {
      st.scattering = false;
      c._pushSnapshot(st.erase ? 'Apagar espalhados' : 'Espalhar', st.scatterBefore, c.snapshot());
      st.scatterBefore = null;
      this.app.hierarchy.render();
    }
  },

  onPointerLeave() {
    this.app.city.moveGhost(null);
    if (this.app.city.tool === 'espalhar') this.app.terrain.setBrush(false);
  },

  onDblClick() {
    const c = this.app.city;
    if (c.tool === 'zona') { c.popPathPoint(); c.finishZone(); }
    if (c.tool === 'muralha') { c.popPathPoint(); c.finishWall(); }
  },

  update(dt, app) {
    if (st.scattering && st.hover) {
      st.lastScatter += dt;
      if (st.lastScatter > 0.08) {
        st.lastScatter = 0;
        app.city.scatterAt(st.hover, st.erase);
      }
    }
  },

  onKeyDown(e) {
    const app = this.app;
    const c = app.city;
    const k = e.key;
    const kl = k.toLowerCase();
    if (k === 'Escape') {
      if (c.pathPoints.length) c.clearPath();
      else if (c.tool !== 'selecionar') this.setTool('selecionar');
      else c.select(null);
      return true;
    }
    if (k === 'Enter') {
      if (c.tool === 'zona') return c.finishZone() || true;
      if (c.tool === 'muralha') return c.finishWall() || true;
    }
    if (k === 'Backspace' && c.pathPoints.length) { c.popPathPoint(); return true; }
    if (k === 'Delete') { c.deleteSelected(); return true; }
    if ((e.ctrlKey || e.metaKey) && kl === 'd') { c.duplicateSelected(); return true; }
    if (k === 'End') { c.dropSelectedToGround(); return true; }
    if (kl === 'f') { this.focusSelected(); return true; }
    if (k === '[' || k === ']') {
      const d = k === ']' ? 15 : -15;
      if (c.tool === 'colocar') { c.placeRot = (c.placeRot + d + 360) % 360; if (st.hover) c.moveGhost(st.hover); }
      else c.rotateSelected(d);
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (kl === 'q') { this.setTool('selecionar'); return true; }
    if (c.selected && c.selected.kind !== 'zone') {
      if (kl === 'w') { c.setGizmoMode('translate'); return true; }
      if (kl === 'e') { c.setGizmoMode('rotate'); return true; }
      if (kl === 'r') { c.setGizmoMode('scale'); return true; }
    }
    return false;
  },
};

// ------------------------------------------------------------------ Objetos
export const objetosMode = {
  ...base,
  id: 'objetos',
  label: 'Objetos',
  icon: 'cube',
  title: 'Peças, natureza, muralhas e suas malhas (GLB/FBX/OBJ)',
  hint: HINTS.selecionar,
  toolTitle: 'Ferramentas de Objetos',
  tools: [
    { id: 'selecionar', label: 'Selecionar', icon: 'cursor', title: 'Selecionar e mover (Q). W/E/R = mover/girar/escalar' },
    { id: 'colocar', label: 'Colocar', icon: 'plus', title: 'Colocar a peça escolhida no Navegador de Conteúdo' },
    { id: 'espalhar', label: 'Espalhar', icon: 'trees', title: 'Pintar árvores e pedras (Shift = apagar)' },
    { id: 'muralha', label: 'Muralha', icon: 'castle', title: 'Muralha automática: clique os cantos, Enter termina' },
  ],

  selectPlacement(ref) {
    this.app.city.placeRef = ref;
    this.setTool('colocar');
  },

  buildLeft(root, app) {
    const c = app.city;
    this._toolsSection(root, app);
    if (c.tool === 'colocar') {
      const s = section(root, 'Colocar peça', { icon: 'plus' });
      const ref = c.placeRef;
      const def = ref.startsWith('mesh:') ? null : PREFAB_MAP.get(ref);
      const name = def ? def.name : app.project.customMeshes.find((m) => `mesh:${m.id}` === ref)?.name || ref;
      const thumb = el('div', { class: 'prop-preview' });
      const url = def ? app.thumbs.prefab(ref, (u) => { thumb.style.backgroundImage = `url("${u}")`; }) : app.thumbs.mesh(ref.slice(5), (u) => { thumb.style.backgroundImage = `url("${u}")`; });
      if (url) thumb.style.backgroundImage = `url("${url}")`;
      s.append(el('div', { class: 'prop-head' }, thumb, el('div', {}, el('b', {}, name), el('div', { class: 'hint' }, 'Escolha outra no Navegador de Conteúdo'))));
      slider(s, 'Rotação ao colocar (°)', c, 'placeRot', { min: 0, max: 345, step: 15, onChange: () => st.hover && c.moveGhost(st.hover) });
      checkbox(s, 'Rotação aleatória', c.opts, 'randomRot');
    }
    if (c.tool === 'espalhar') this._scatterPanel(root, app);
    if (c.tool === 'muralha') {
      const s = section(root, 'Muralha automática', { icon: 'castle' });
      checkbox(s, 'Torres nos cantos', c.opts, 'wallTowers');
      checkbox(s, 'Fechar o contorno', c.opts, 'wallClosed');
      hint(s, 'Clique nos cantos no chão e aperte Enter. Cada trecho vira peças de 8 m ajustadas; depois troque um trecho por um Portão.');
      this._pathButtons(s, app, () => c.finishWall());
    }
    const imp = section(root, 'Minhas malhas', { icon: 'upload', open: c.tool === 'selecionar' });
    button(imp, 'Importar malha (GLB, FBX, OBJ)…', () => this.importMesh(), { icon: 'upload' });
    hint(imp, 'Construções e props feitos no Blender. Exporte como .glb (texturas embutidas). FBX em centímetros: escala 0.01. Elas aparecem em Conteúdo › Objetos › Minhas malhas.');
    this._snapSection(root, app);
  },

  async importMesh() {
    const app = this.app;
    const files = await pickFiles('.glb,.gltf,.fbx,.obj', true);
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      const scaleStr = await promptBox(`Escala de "${f.name}" (1 = metros; 0.01 = centímetros)`, ext === 'fbx' ? '0.01' : '1');
      if (scaleStr === null) continue;
      if (ext === 'gltf') toast('Arquivos .gltf com texturas separadas não funcionam: exporte como .glb (tudo em um arquivo).', 'warn', 6000);
      const buf = new Uint8Array(await readFileAs(f, 'arraybuffer'));
      const entry = { id: uid('malha'), name: f.name.replace(/\.[^.]+$/, ''), format: ext === 'gltf' ? 'glb' : ext, data: bytesToBase64(buf), scale: parseFloat(scaleStr) || 1 };
      try {
        await app.city.loadCustomMesh(entry);
        app.project.customMeshes.push(entry);
        const size = app.city.meshSize(entry.id);
        app.log(`Malha "${entry.name}" importada (${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m).`);
        app.markDirty();
        app.contentBrowser.open('malhas');
        this.selectPlacement(`mesh:${entry.id}`);
      } catch (err) {
        toast(`Erro ao importar ${f.name}: ${err.message}`, 'error', 6000);
      }
    }
  },

  async removeMesh(id) {
    const app = this.app;
    const m = app.project.customMeshes.find((x) => x.id === id);
    if (!m || !(await confirmBox(`Remover a malha "${m.name}"? Objetos que a usam também serão apagados.`, 'Remover'))) return;
    app.city.commit('Remover malha', () => {
      app.project.customMeshes = app.project.customMeshes.filter((x) => x.id !== id);
      app.project.objects = app.project.objects.filter((o) => !(o.kind === 'mesh' && o.ref === id));
      app.city.meshTemplates.delete(id);
      app.city.rebuildAll();
    });
    app.contentBrowser.render();
  },

  _scatterPanel(root, app) {
    const c = app.city;
    const s = section(root, 'Espalhar natureza', { icon: 'trees' });
    const natural = PREFABS.filter((p) => p.cat === 'Natureza' || ['barril', 'caixote', 'poste'].includes(p.id));
    const list = el('div', { class: 'check-list' });
    const all = [...natural.map((p) => ({ ref: p.id, name: p.name })), ...app.project.customMeshes.map((m) => ({ ref: `mesh:${m.id}`, name: m.name }))];
    for (const it of all) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = c.opts.scatterSet.includes(it.ref);
      cb.addEventListener('change', () => {
        c.opts.scatterSet = cb.checked ? [...c.opts.scatterSet, it.ref] : c.opts.scatterSet.filter((x) => x !== it.ref);
      });
      list.append(el('label', { class: 'check' }, cb, it.name));
    }
    s.append(list);
    slider(s, 'Raio (m)', c.opts, 'scatterRadius', { min: 2, max: 60, step: 1 });
    slider(s, 'Densidade', c.opts, 'scatterDensity', { min: 0.05, max: 1, step: 0.05 });
    slider(s, 'Espaço mínimo (m)', c.opts, 'scatterSpacing', { min: 0.5, max: 20, step: 0.5 });
    slider(s, 'Escala mínima', c.opts, 'scatterScaleMin', { min: 0.2, max: 3, step: 0.05 });
    slider(s, 'Escala máxima', c.opts, 'scatterScaleMax', { min: 0.2, max: 3, step: 0.05 });
    slider(s, 'Inclinação máx. (°)', c.opts, 'scatterMaxSlope', { min: 5, max: 80, step: 1 });
    hint(s, 'Arraste no terreno. Shift apaga só os tipos marcados.');
  },
};

// ------------------------------------------------------------------ NPC
export const npcMode = {
  ...base,
  id: 'npc',
  label: 'NPC',
  icon: 'user',
  title: 'NPCs (spawns), dados, IA, drops e zonas do servidor',
  hint: HINTS.selecionar,
  toolTitle: 'Ferramentas de NPC',
  tools: [
    { id: 'selecionar', label: 'Selecionar', icon: 'cursor', title: 'Selecionar e mover (Q)' },
    { id: 'npc', label: 'NPC', icon: 'user', title: 'Colocar NPC (spawn do servidor)' },
    { id: 'zona', label: 'Zona', icon: 'hexagon', title: 'Desenhar zona (paz, cidade, PvP)' },
  ],

  selectNpcType(type) {
    this.app.city.opts.npcType = type;
    this.setTool('npc');
  },

  buildLeft(root, app) {
    const c = app.city;
    this._toolsSection(root, app);
    const s = section(root, 'Tipo do novo NPC', { icon: 'user' });
    const grid = el('div', { class: 'type-grid' });
    for (const t of NPC_TYPES) {
      const b = el('button', { class: `type-btn ${c.opts.npcType === t.id ? 'active' : ''}`, type: 'button', title: t.label },
        el('span', { class: 'type-ico', style: { color: t.color } }, icon(t.id === 'Monster' ? 'sword' : 'user', 18)), el('span', {}, t.label));
      b.addEventListener('click', () => this.selectNpcType(t.id));
      grid.append(b);
    }
    s.append(grid);
    hint(s, 'O NPC vira uma linha de spawn no servidor. O ID precisa existir no datapack — ou marque "NPC novo" nas Propriedades para gerar o template.');
    if (c.tool === 'zona') {
      const z = section(root, 'Nova zona', { icon: 'hexagon' });
      select(z, 'Tipo', c.opts, 'zoneType', ZONE_TYPES.map((t) => ({ value: t.id, label: t.label })), { onChange: () => c._updatePathLine() });
      hint(z, 'Zona de paz impede PvP; TownZone define a cidade; Arena libera PvP sem karma.');
      this._pathButtons(z, app, () => c.finishZone());
    }
    const lst = section(root, 'NPCs e zonas do mapa', { icon: 'map', open: false });
    const box = el('div', { class: 'mini-list' });
    for (const n of app.project.npcs) {
      const r = el('button', { class: `mini-row ${c.selected?.uid === n.uid ? 'active' : ''}`, type: 'button' }, el('span', { class: 'dot', style: { background: NPC_TYPE_MAP.get(n.type)?.color } }), `${n.name} [${n.npcId}]`);
      r.addEventListener('click', () => { c.select('npc', n.uid); this.focusSelected(); });
      box.append(r);
    }
    for (const zz of app.project.zones) {
      const r = el('button', { class: `mini-row ${c.selected?.uid === zz.uid ? 'active' : ''}`, type: 'button' }, icon('hexagon', 12), `${zz.name}`);
      r.addEventListener('click', () => { c.select('zone', zz.uid); this.focusSelected(); });
      box.append(r);
    }
    lst.append(box);
    this._snapSection(root, app);
  },
};
