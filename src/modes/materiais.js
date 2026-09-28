// Aba "Materiais": biblioteca PBR com esferas de prévia, filtro por categoria e importação de
// pastas/.zip/imagens (os mapas são reconhecidos pelos nomes: Color, Normal, Roughness, AO, Height, Metal).
import { section, slider, number, select, color, button, buttonRow, hint, el, text, pickFiles, pickFolder, filesToEntries, toast, confirmBox } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { MAT_CATEGORIES, CATEGORY_MAP } from '../materials/library.js';

const st = { cat: '', query: '', sel: 'tijolo_velho', preview: { colorVar: 0.3, wear: 0.2, moss: 0, dirt: 0, humidity: 0 } };
const MAP_LABELS = { color: 'Cor', normal: 'Normal', rough: 'Rugosidade', ao: 'Oclusão (AO)', orm: 'ORM', height: 'Altura', metal: 'Metal' };

export async function importMaterials(app, entries, opts = {}) {
  app.log(`Lendo ${entries.length} arquivo(s) de textura…`);
  const made = await app.materials.importEntries(entries, opts);
  const txt = made.map((m) => `${m.name} (${(m.found || []).map((k) => MAP_LABELS[k] || k).join(', ')})`).join('; ');
  app.log(`Materiais importados: ${txt}`, 'ok');
  toast(`${made.length} material(is) importado(s).`, 'ok');
  if (made[0]) st.sel = made[0].id;
  return made;
}

export const materiaisMode = {
  id: 'materiais',
  label: 'Materiais',
  short: 'Materiais',
  icon: 'image',
  title: 'Biblioteca de materiais PBR (tijolo, madeira, pedra, telhado, detalhes)',
  view: 'doc',
  hint: 'Materiais PBR para o Construtor e o terreno. Importe uma pasta ou .zip: os mapas são reconhecidos pelos nomes dos arquivos.',

  enter(app) {
    this.app = app;
  },

  select(app, id) {
    st.sel = id;
    if (app.mode?.id === 'materiais') { app.refreshPanels(); app.refreshDoc(); }
  },

  buildLeft(root, app) {
    const lib = app.materials;
    const s = section(root, 'Categorias', { icon: 'layers' });
    const list = el('div', { class: 'doc-list' });
    const all = lib.list();
    const item = (id, label, n, iconName) => {
      const b = el('button', { class: `doc-item ${st.cat === id ? 'active' : ''}`, type: 'button' }, icon(iconName, 14), el('span', {}, label), el('small', {}, String(n)));
      b.addEventListener('click', () => { st.cat = id; app.refreshLeft(); app.refreshDoc(); });
      list.append(b);
    };
    item('', 'Todos', all.length, 'folder');
    for (const c of MAT_CATEGORIES) item(c.id, c.label, all.filter((m) => m.category === c.id).length, c.icon);
    s.append(list);

    const im = section(root, 'Importar materiais', { icon: 'upload' });
    const cat = { v: '' };
    select(im, 'Categoria', cat, 'v', [{ value: '', label: 'Automática (pelo nome)' }, ...MAT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]);
    const run = async (files) => {
      if (!files.length) return;
      try {
        await importMaterials(app, await filesToEntries(files), { category: cat.v || null });
        app.refreshPanels();
        app.refreshDoc();
      } catch (err) {
        toast(`Não deu para importar: ${err.message}`, 'error', 6000);
      }
    };
    buttonRow(im,
      button(null, 'Pasta…', async () => run(await pickFolder()), { variant: 'primary', icon: 'folderOpen', title: 'Uma pasta com as texturas; cada subpasta (ou cada nome) vira um material' }),
      button(null, '.zip ou imagens…', async () => run(await pickFiles('.zip,.png,.jpg,.jpeg,.webp,.tga,.bmp', true)), { icon: 'upload' }),
    );
    hint(im, 'Nomes reconhecidos: Color/BaseColor/Albedo/diff, Normal (GL ou DX), Roughness, AO, ORM/ARM, Height/Displacement e Metal/Metallic. Funciona com Poly Haven, ambientCG, Megascans e Unreal (T_Nome_D/N/ORM).');

    const lv = section(root, 'Como usar', { icon: 'info', open: false });
    hint(lv, 'Três níveis, como nos jogos grandes: 1) material base (tijolo, madeira, pedra, telha); 2) mistura com um segundo material (reboco caindo e mostrando o tijolo, pedra aparecendo); 3) decalques e envelhecimento (musgo, sujeira embaixo, umidade, desgaste). No Construtor, cada parte da casa tem o seu material e os controles de envelhecimento.');
  },

  buildDoc(root, app) {
    const lib = app.materials;
    const pad = el('div', { class: 'doc-pad' });
    const q = el('input', { type: 'text', class: 'mat-search', placeholder: 'Buscar material…', value: st.query });
    q.addEventListener('input', () => { st.query = q.value; renderGrid(); });
    const title = CATEGORY_MAP.get(st.cat)?.label || 'Todos os materiais';
    pad.append(el('div', { class: 'mat-head' }, el('h2', {}, title), q));
    const grid = el('div', { class: 'mat-grid' });
    pad.append(grid);
    const renderGrid = () => {
      grid.replaceChildren();
      const f = st.query.toLowerCase();
      const mats = lib.list(st.cat || null).filter((m) => !f || m.name.toLowerCase().includes(f) || m.id.includes(f));
      for (const m of mats) {
        const img = el('div', { class: 'mat-sphere' });
        const set = (url) => { if (url) img.style.backgroundImage = `url("${url}")`; };
        set(app.thumbs.material(m.id, set));
        const card = el('button', { class: `mat-card ${m.id === st.sel ? 'active' : ''}`, type: 'button', title: m.name }, img,
          el('b', {}, m.name), el('small', {}, `${CATEGORY_MAP.get(m.category)?.label || m.category}${m.builtin ? '' : ' • seu'}`));
        card.addEventListener('click', () => { st.sel = m.id; grid.querySelectorAll('.mat-card').forEach((c) => c.classList.toggle('active', c === card)); app.refreshRight(); });
        grid.append(card);
      }
      if (!mats.length) grid.append(el('p', { class: 'hint' }, 'Nenhum material aqui. Importe uma pasta de texturas na esquerda.'));
    };
    renderGrid();
    root.append(pad);
  },

  buildProps(root, app) {
    const lib = app.materials;
    const m = lib.get(st.sel);
    if (!m) { hint(root, 'Escolha um material.'); return; }
    const s = section(root, m.name, { icon: 'image' });
    const big = el('div', { class: 'mat-big' });
    const setBig = (url) => { if (url) big.style.backgroundImage = `url("${url}")`; };
    const refreshBig = () => setBig(app.thumbs.material(m.id, setBig, 256, st.preview));
    refreshBig();
    s.append(big);
    const pv = st.preview;
    const upd = () => refreshBig();
    for (const [k, label] of [['colorVar', 'Variação de cor'], ['wear', 'Desgaste'], ['moss', 'Musgo'], ['dirt', 'Sujeira'], ['humidity', 'Umidade']]) {
      slider(s, label, pv, k, { min: 0, max: 1, step: 0.05, onCommit: upd });
    }
    hint(s, 'Os controles acima só mudam a prévia; no Construtor cada construção tem os seus.');

    const p = section(root, 'Propriedades', { icon: 'sliders' });
    const edit = !m.builtin;
    const changed = () => { lib.touch(m); app.thumbs.forget(`mat:${m.id}:`); refreshBig(); app.refreshDoc(); };
    if (edit) {
      text(p, 'Nome', m, 'name', { onChange: () => { lib.touch(m); app.refreshDoc(); } });
      select(p, 'Categoria', m, 'category', MAT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), { onChange: () => { lib.touch(m); app.refreshPanels(); app.refreshDoc(); } });
      slider(p, 'Tamanho real (m)', m, 'tile', { min: 0.1, max: 10, step: 0.05, onCommit: changed, title: 'Quantos metros a foto cobre antes de repetir' });
      color(p, 'Tinta', m, 'tint', { onChange: changed });
      slider(p, 'Rugosidade', m, 'roughness', { min: 0, max: 2, step: 0.05, onCommit: changed });
      slider(p, 'Metal', m, 'metalness', { min: 0, max: 1, step: 0.05, onCommit: changed });
      slider(p, 'Força da normal', m, 'normalScale', { min: 0, max: 3, step: 0.05, onCommit: changed });
      slider(p, 'Profundidade do relevo (m)', m, 'depth', { min: 0, max: 0.12, step: 0.005, onCommit: changed });
    } else {
      p.append(el('p', { class: 'hint' }, `Material embutido (foto do Poly Haven, CC0). Tamanho real ${m.tile} m, relevo ${Math.round((m.depth || 0) * 1000)} mm.`));
      button(p, 'Duplicar para editar', () => { const c = lib.duplicate(m.id); st.sel = c.id; app.refreshPanels(); app.refreshDoc(); }, { icon: 'copy' });
    }

    const mp = section(root, 'Mapas', { icon: 'layers' });
    const have = { color: !!m.maps.color, normal: !!m.maps.normal, 'rough/ao/altura': !!m.maps.arh };
    mp.append(el('div', { class: 'mat-maps' }, ...Object.entries(have).map(([k, v]) => el('span', { class: `chip ${v ? 'on' : ''}` }, k))));
    if (edit) {
      const row = el('div', { class: 'btn-row wrap' });
      for (const kind of ['color', 'normal', 'rough', 'ao', 'height']) {
        row.append(button(null, MAP_LABELS[kind], async () => {
          const [f] = await pickFiles('.png,.jpg,.jpeg,.webp,.tga,.bmp');
          if (!f) return;
          try {
            await lib.replaceMap(m.id, kind, (await filesToEntries([f]))[0]);
            app.thumbs.forget(`mat:${m.id}:`);
            app.refreshPanels();
            app.refreshDoc();
          } catch (err) { toast(err.message, 'error'); }
        }, { title: `Trocar o mapa de ${MAP_LABELS[kind]}` }));
      }
      mp.append(el('div', { class: 'sub-title' }, 'Trocar um mapa'), row);
    }

    const use = section(root, 'Usar', { icon: 'wand' });
    const layer = { i: 0 };
    select(use, 'Camada do terreno', layer, 'i', app.project.terrain.layers.map((l, i) => ({ value: i, label: `${i + 1}. ${l.name}` })), { onChange: (v) => { layer.i = Number(v); } });
    button(use, 'Aplicar no terreno', async () => {
      const l = app.project.terrain.layers[layer.i];
      Object.assign(l, { texture: null, normal: null, rough: null, ao: null }, await lib.terrainMaps(m.id), { normalDX: false, tiling: Math.round((1 / m.tile) * 100) / 100 });
      await app.terrain.setLayer(layer.i, l);
      app.terrain.setTiling(app.project.terrain.layers);
      app.markDirty();
      app.events.emit('layers-changed');
      app.log(`Camada ${layer.i + 1} do terreno agora usa ${m.name}.`, 'ok');
    }, { icon: 'mountain' });
    hint(use, 'No Construtor, escolha o material em cada parte (parede, madeira, base, telhado, detalhes).');
    if (edit) {
      button(use, 'Excluir material', async () => {
        if (!(await confirmBox(`Excluir "${m.name}"? As construções que usam ele voltam ao material padrão.`, 'Excluir'))) return;
        lib.remove(m.id);
        st.sel = 'tijolo_velho';
        app.refreshPanels();
        app.refreshDoc();
      }, { variant: 'danger', icon: 'trash' });
    }
  },
};
