// Aba "Exportar": configurações do servidor, validação e pacotes (.zip) para o servidor e para o UE5.
import { section, number, select, text, button, buttonRow, hint, el, slider } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { buildServerFiles, validateProject } from '../l2/serverExport.js';
import { DEFAULT_BYPASS } from '../core/state.js';
import { formatBytes, l2TileOrigin, L2_TILE_SIZE } from '../core/util.js';

export const exportMode = {
  id: 'exportar',
  label: 'Exportar',
  icon: 'package',
  tab: false,
  title: 'Gerar arquivos para o servidor L2 e para o Unreal Engine 5',
  view: 'doc',
  hint: 'Baixe o pacote do servidor (XML/HTML/SQL) e o pacote do UE5 (heightmap, camadas, malhas e script).',

  enter(app) {
    this.app = app;
  },

  buildLeft(root, app) {
    const s = app.project.server;
    const sv = section(root, 'Servidor', { icon: 'server' });
    select(sv, 'Pacote', s, 'pack', [
      { value: 'l2mobius', label: 'L2Mobius / L2J Server (XML)' },
      { value: 'l2j', label: 'L2J High Five (SQL + XML)' },
      { value: 'outro', label: 'Outro (aCis, Lucera...)' },
    ], { onChange: () => app.markDirty() });
    hint(sv, 'Todos recebem os mesmos arquivos; o LEIA-ME explica onde cada um vai.');

    const co = section(root, 'Coordenadas no mundo L2', { icon: 'map' });
    const upd = () => { app.markDirty(); app.refreshDoc(); };
    number(co, 'Tile X', s, 'tileX', { min: 10, max: 30, step: 1, onChange: upd, title: 'Região do mapa (ex.: Giran fica perto de 22_22)' });
    number(co, 'Tile Y', s, 'tileY', { min: 10, max: 30, step: 1, onChange: upd });
    slider(co, 'Unidades L2 por metro', s, 'unitsPerMeter', { min: 4, max: 128, step: 1, onChange: upd });
    number(co, 'Z do chão (altura 0)', s, 'zBase', { step: 10, onChange: upd });
    number(co, 'Zona: Z mínimo', s, 'zoneMinZ', { step: 100, onChange: upd });
    number(co, 'Zona: Z máximo', s, 'zoneMaxZ', { step: 100, onChange: upd });
    const o = l2TileOrigin(s.tileX, s.tileY);
    const cover = (app.project.terrain.size * s.unitsPerMeter) / L2_TILE_SIZE;
    hint(co, `O tile ${s.tileX}_${s.tileY} vai de X ${o.x} a ${o.x + L2_TILE_SIZE} e Y ${o.y} a ${o.y + L2_TILE_SIZE}. Seu terreno ocupa ${(cover * 100).toFixed(0)}% da largura do tile.${cover > 1 ? ' ⚠ Maior que um tile: diminua as unidades por metro.' : ''}`);

    const bp = section(root, 'Comandos de bypass (HTML)', { icon: 'code', open: false });
    hint(bp, 'Modelos usados nos trechos e nos HTML gerados. {n}, {id} e {pagina} são trocados automaticamente.');
    for (const [k, label] of [['chat', 'Próxima página'], ['link', 'Abrir página'], ['multisell', 'Multisell'], ['teleport', 'Teleporte'], ['quest', 'Quests']]) {
      text(bp, label, s.bypass, k, { onChange: () => app.markDirty() });
    }
    button(bp, 'Restaurar padrão', () => { s.bypass = { ...DEFAULT_BYPASS }; app.markDirty(); app.refreshLeft(); });
  },

  buildDoc(root, app) {
    root.classList.add('doc-pad');
    const p = app.project;
    const summary = el('div', { class: 'card' },
      el('h2', { class: 'with-ico' }, icon('package', 18), p.name),
      el('div', { class: 'stats big' },
        ...[['mountain', `${p.terrain.size} m (${p.terrain.res}²)`], ['cube', `${p.objects.length} objetos`], ['user', `${p.npcs.length} NPCs`], ['hexagon', `${p.zones.length} zonas`], ['coins', `${p.multisells.length} lojas`], ['code', `${p.htmls.length} páginas`]]
          .map(([ic, t]) => el('span', { class: 'with-ico' }, icon(ic, 13), t))),
    );
    root.append(summary);

    const srv = el('div', { class: 'card' }, el('h3', { class: 'with-ico' }, icon('server', 15), 'Pacote do servidor (L2J / L2Mobius)'),
      el('p', {}, 'Multisells em XML, páginas HTML, spawns dos NPCs (XML + SQL), zonas e um LEIA-ME explicando onde colocar cada arquivo.'));
    buttonRow(srv,
      button(null, 'Baixar pacote do servidor (.zip)', () => app.exportServer(), { variant: 'primary', icon: 'download' }),
    );
    const { files } = buildServerFiles(p, { heightAt: (x, z) => app.terrain.heightAt(x, z), itemName: (id) => app.itemDB.name(id) });
    const tree = el('ul', { class: 'file-tree' });
    for (const f of files) {
      const li = el('li', {}, el('span', { class: 'mono' }, f.path), el('small', {}, formatBytes(f.content.length)));
      const b = el('button', { class: 'btn tiny ghost', type: 'button', title: 'Ver conteúdo' }, 'ver');
      b.addEventListener('click', () => {
        this._viewer.value = f.content;
        this._viewerTitle.textContent = f.path;
      });
      li.append(b);
      tree.append(li);
    }
    srv.append(tree);
    this._viewerTitle = el('div', { class: 'mono hint' }, 'Clique em "ver" para inspecionar um arquivo.');
    this._viewer = el('textarea', { class: 'code small', readonly: true, rows: 12, spellcheck: 'false' });
    srv.append(this._viewerTitle, this._viewer);
    root.append(srv);

    const ue = el('div', { class: 'card' }, el('h3', { class: 'with-ico' }, icon('package', 15), 'Pacote do Unreal Engine 5'),
      el('p', {}, 'Heightmap 16 bits (PNG e RAW) com os valores de escala certos, uma imagem por camada de textura, todas as peças da cidade em GLB, a capa atual, cena.json com as posições e o script Python que monta tudo no UE5.'));
    buttonRow(ue,
      button(null, 'Baixar pacote UE5 (.zip)', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { await app.exportUE5(); } finally { btn.disabled = false; }
      }, { variant: 'primary', icon: 'download' }),
    );
    ue.append(el('p', { class: 'hint' }, 'No UE5: importe o heightmap pelo modo Landscape usando as escalas do LEIA-ME_UE5.txt, depois rode importar_cena.py (Tools > Execute Python Script).'));
    root.append(ue);

    const w = validateProject(p);
    const wc = el('div', { class: `card ${w.length ? 'warn' : 'ok'}` }, el('h3', { class: 'with-ico' }, icon(w.length ? 'info' : 'check', 15), w.length ? `${w.length} avisos` : 'Tudo certo'));
    if (w.length) wc.append(el('ul', {}, ...w.map((x) => el('li', {}, x))));
    else wc.append(el('p', {}, 'Nenhum problema encontrado nos NPCs, páginas e multisells.'));
    root.append(wc);

    const proj = el('div', { class: 'card' }, el('h3', { class: 'with-ico' }, icon('save', 15), 'Projeto'),
      el('p', {}, 'O arquivo .json guarda tudo (terreno, pintura, objetos, malhas importadas, NPCs, lojas e páginas). Guarde junto com o seu servidor no Git.'));
    buttonRow(proj, button(null, 'Salvar projeto (.json)', () => app.saveProject(), { icon: 'save' }));
    root.append(proj);
  },

  buildProps(root, app) {
    const w = validateProject(app.project);
    const v = section(root, w.length ? `Validação (${w.length} avisos)` : 'Validação', { icon: w.length ? 'info' : 'check' });
    if (!w.length) v.append(el('p', {}, 'Nenhum problema nos NPCs, páginas e lojas.'));
    else v.append(el('ul', { class: 'warn-list' }, ...w.map((x) => el('li', {}, x))));
    const q = section(root, 'Exportar agora', { icon: 'download' });
    button(q, 'Pacote do servidor (.zip)', () => app.exportServer(), { variant: 'primary', icon: 'server' });
    button(q, 'Pacote UE5 (.zip)', () => app.exportUE5(), { icon: 'package' });
    button(q, 'Salvar projeto (.json)', () => app.saveProject(), { icon: 'save' });
  },
};
