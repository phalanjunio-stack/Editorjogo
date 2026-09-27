// Aba "HTML": diálogos de NPC com editor, trechos prontos e prévia navegável no estilo L2.
import { section, button, buttonRow, hint, el, toast, pickFiles, readFileAs, downloadBlob, confirmBox, promptBox, modal, select } from '../ui/ui.js';
import { renderL2Html, l2Window, renderMultisellWindow } from '../l2/htmlPreview.js';
import { htmlTemplate, interpretBypass, validateHtml, fillBypass } from '../l2/htmlCore.js';
import { NPC_TYPES } from '../city/city.js';
import { debounce, uid } from '../core/util.js';

let selectedUid = null;
let previewPath = null;
const navStack = [];

function current(app) {
  const list = app.project.htmls;
  if (app.htmlOpenPath) {
    const h = list.find((x) => x.path === app.htmlOpenPath);
    app.htmlOpenPath = null;
    if (h) { selectedUid = h.uid; previewPath = null; navStack.length = 0; }
  }
  let h = list.find((x) => x.uid === selectedUid);
  if (!h && list.length) { h = list[0]; selectedUid = h.uid; }
  return h || null;
}

function snippets(app) {
  const b = app.project.server.bypass;
  const ms = app.project.multisells[0]?.listId || 900001;
  return [
    { label: 'Link: próxima página', title: 'Chat 1 = abre <npcId>-1.htm', code: `<a action="${fillBypass(b.chat, { n: 1 })}">Continuar</a><br>` },
    { label: 'Link: outra página', code: `<a action="${fillBypass(b.link, { pagina: 'default/30001-2.htm' })}">Ver mais</a><br>` },
    { label: 'Link: multisell', code: `<a action="${fillBypass(b.multisell, { id: ms })}">Comprar</a><br>` },
    { label: 'Link: teleporte', code: `<a action="${fillBypass(b.teleport, { id: 1 })}">Ir para Giran - <font color="LEVEL">10.000 Adena</font></a><br>` },
    { label: 'Link: quests', code: `<a action="${b.quest}">Quest</a><br>` },
    { label: 'Botão', code: `<button value="Comprar" action="${fillBypass(b.multisell, { id: ms })}" width=100 height=25 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF">` },
    { label: 'Texto amarelo', code: '<font color="LEVEL">texto</font>' },
    { label: 'Texto colorido', code: '<font color="00FF00">texto verde</font>' },
    { label: 'Linha separadora', code: '<img src="L2UI.SquareGray" width=270 height=1><br>' },
    { label: 'Centralizar', code: '<center>\n\n</center>' },
    { label: 'Quebra de linha', code: '<br>' },
    { label: 'Tabela 2 colunas', code: '<table width=270>\n<tr><td width=135>Esquerda</td><td width=135 align=right>Direita</td></tr>\n</table>' },
    { label: 'Campo de texto', code: '<edit var="valor" width=120 height=15>' },
    { label: 'Lista (combobox)', code: '<combobox width=120 var="opcao" list="Opção 1;Opção 2;Opção 3">' },
    { label: 'Nome do jogador', code: '%playername%' },
  ];
}

export const htmlMode = {
  id: 'html',
  label: 'HTML',
  icon: 'code',
  title: 'Diálogos dos NPCs (HTML do L2)',
  view: 'doc',
  hint: 'Edite à esquerda e veja no estilo do jogo à direita. Clique nos links da prévia para navegar entre páginas e abrir multisells.',

  enter(app) {
    this.app = app;
    this.refreshPreview = debounce(() => this._preview(), 200);
  },

  open(path) {
    const h = this.app.project.htmls.find((x) => x.path === path || x.uid === path);
    if (h) { selectedUid = h.uid; previewPath = null; navStack.length = 0; }
  },

  buildLeft(root, app) {
    const s = section(root, 'Páginas', { icon: 'code' });
    const cur = current(app);
    const list = el('div', { class: 'doc-list' });
    const sorted = [...app.project.htmls].sort((a, b) => a.path.localeCompare(b.path));
    for (const h of sorted) {
      const users = app.project.npcs.filter((n) => n.html === h.path).map((n) => n.name);
      const b = el('button', { class: `doc-item ${cur && h.uid === cur.uid ? 'active' : ''}`, type: 'button', title: users.length ? `Usada por: ${users.join(', ')}` : 'Nenhum NPC usa esta página diretamente' },
        el('span', { class: 'mono' }, h.path), users.length ? el('small', {}, `🧍 ${users.length}`) : null);
      b.addEventListener('click', () => { selectedUid = h.uid; previewPath = null; navStack.length = 0; app.refreshPanels(); app.refreshDoc(); });
      list.append(b);
    }
    if (!sorted.length) list.append(el('p', { class: 'hint' }, 'Nenhuma página ainda.'));
    s.append(list);
    buttonRow(s,
      button(null, 'Nova', async () => {
        const path = await promptBox('Caminho da página (dentro de data/html/)', 'default/900001.htm');
        if (!path) return;
        if (app.project.htmls.some((h) => h.path.toLowerCase() === path.toLowerCase())) return toast('Já existe uma página com esse caminho.', 'warn');
        this._mutate('Nova página', () => {
          const h = { uid: uid('html'), path: path.trim(), content: '<html><body>\nOlá, %playername%!<br>\n</body></html>\n' };
          app.project.htmls.push(h);
          selectedUid = h.uid;
        });
      }, { variant: 'primary', icon: 'plus' }),
      button(null, 'De modelo…', () => this._fromTemplate(app), { icon: 'sparkles' }),
    );
    buttonRow(s,
      button(null, 'Renomear', async () => {
        if (!cur) return;
        const path = await promptBox('Novo caminho', cur.path);
        if (!path || path === cur.path) return;
        this._mutate('Renomear página', () => {
          for (const n of app.project.npcs) if (n.html === cur.path) n.html = path;
          cur.path = path;
        });
      }, { icon: 'brush' }),
      button(null, 'Excluir', async () => {
        if (!cur) return;
        if (!(await confirmBox(`Excluir ${cur.path}?`, 'Excluir'))) return;
        this._mutate('Excluir página', () => {
          app.project.htmls = app.project.htmls.filter((h) => h.uid !== cur.uid);
          selectedUid = null;
        });
      }, { variant: 'danger', icon: 'trash' }),
    );
    button(s, 'Importar .htm do servidor…', async () => {
      const files = await pickFiles('.htm,.html', true);
      if (!files.length) return;
      const folder = await promptBox('Pasta dentro de data/html/ (ex.: merchant, default, teleporter)', 'default');
      if (folder === null) return;
      const contents = await Promise.all(files.map((f) => readFileAs(f, 'text')));
      this._mutate('Importar HTML', () => {
        files.forEach((f, i) => {
          const path = `${folder.replace(/\/+$/, '')}/${f.name}`;
          const existing = app.project.htmls.find((x) => x.path.toLowerCase() === path.toLowerCase());
          if (existing) { existing.content = contents[i]; selectedUid = existing.uid; return; }
          const h = { uid: uid('html'), path, content: contents[i] };
          app.project.htmls.push(h);
          selectedUid = h.uid;
        });
      });
      toast(`${files.length} página(s) importada(s).`, 'ok');
    }, { icon: 'upload' });
  },

  async _fromTemplate(app) {
    const opts = { type: 'Merchant', npcId: 900001, name: 'Mercador' };
    const r = await modal({
      title: 'Nova página a partir de modelo',
      body: (c) => {
        select(c, 'Tipo de NPC', opts, 'type', NPC_TYPES.filter((t) => t.id !== 'Monster').map((t) => ({ value: t.id, label: t.label })));
        const idIn = el('input', { type: 'number', value: opts.npcId });
        idIn.addEventListener('change', () => { opts.npcId = Number(idIn.value) || 900001; });
        c.append(el('label', { class: 'row' }, el('span', { class: 'row-label' }, 'ID do NPC'), idIn));
        const nm = el('input', { type: 'text', value: opts.name });
        nm.addEventListener('change', () => { opts.name = nm.value; });
        c.append(el('label', { class: 'row' }, el('span', { class: 'row-label' }, 'Nome'), nm));
      },
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Criar', value: 'ok', variant: 'primary' }],
    });
    if (r !== 'ok') return;
    const folders = { Merchant: 'merchant', Teleporter: 'teleporter', Warehouse: 'warehouse', Guard: 'guard' };
    const path = `${folders[opts.type] || 'default'}/${opts.npcId}.htm`;
    if (app.project.htmls.some((h) => h.path === path)) return toast(`${path} já existe.`, 'warn');
    this._mutate('Página de modelo', () => {
      const h = { uid: uid('html'), path, content: htmlTemplate(opts.type, { name: opts.name, multisellId: app.project.multisells[0]?.listId, bypass: app.project.server.bypass }) };
      app.project.htmls.push(h);
      selectedUid = h.uid;
    });
  },

  _mutate(label, fn) {
    const app = this.app;
    const snap = () => JSON.stringify({ htmls: app.project.htmls, npcs: app.project.npcs.map((n) => [n.uid, n.html]) });
    const before = snap(), bSel = selectedUid;
    fn();
    const after = snap(), aSel = selectedUid;
    const restore = (json, sel) => {
      const s = JSON.parse(json);
      app.project.htmls = s.htmls;
      const map = new Map(s.npcs);
      for (const n of app.project.npcs) if (map.has(n.uid)) n.html = map.get(n.uid);
      selectedUid = sel;
      if (app.mode === this) { app.refreshPanels(); app.refreshDoc(); }
    };
    app.history.push({ label, undo: () => restore(before, bSel), redo: () => restore(after, aSel) });
    app.markDirty();
    app.refreshPanels();
    app.refreshDoc();
  },

  buildDoc(root, app) {
    root.classList.add('doc-pad');
    const h = current(app);
    if (!h) {
      root.append(el('div', { class: 'empty' }, el('h2', {}, 'Nenhuma página HTML'), el('p', {}, 'Crie uma página nova ou use "De modelo…" para começar com um diálogo pronto.')));
      return;
    }
    const bar = el('div', { class: 'snippet-bar' });
    const ta = el('textarea', { class: 'code', spellcheck: 'false' });
    ta.value = h.content;
    for (const s of snippets(app)) {
      const b = el('button', { class: 'snippet', type: 'button', title: s.title || s.code }, s.label);
      b.addEventListener('click', () => {
        const { selectionStart: a, selectionEnd: z } = ta;
        ta.setRangeText(s.code, a, z, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input'));
      });
      bar.append(b);
    }
    ta.addEventListener('input', () => {
      h.content = ta.value;
      app.markDirty();
      previewPath = null;
      this.refreshPreview();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    root.append(
      el('div', { class: 'card' }, el('h2', { class: 'mono' }, `data/html/${h.path}`),
        el('p', { class: 'hint' }, 'Marcadores: %objectId% (obrigatório nos bypass de NPC), %playername%. "LEVEL" é o amarelo do L2.'),
        bar, ta),
    );
    this._warnBox = el('div', { class: 'card warn', hidden: true });
    root.append(this._warnBox);
    this._preview();
  },

  buildProps(root, app) {
    const s = section(root, 'Prévia no jogo', { icon: 'eye' });
    this._stage = el('div', { class: 'l2-stage' });
    s.append(this._stage);
    hint(s, 'Clique nos links: páginas do projeto abrem aqui, multisell mostra a loja.');
    const d = section(root, 'Arquivo', { icon: 'code' });
    buttonRow(d,
      button(null, 'Baixar .htm', () => {
        const h = current(app);
        if (h) downloadBlob(h.content, h.path.split('/').pop(), 'text/html');
      }, { icon: 'download' }),
    );
    this._preview();
  },

  _preview() {
    const app = this.app;
    const stage = this._stage;
    if (!stage) return;
    const h = current(app);
    stage.replaceChildren();
    if (!h) return;
    const path = previewPath || h.path;
    const page = app.project.htmls.find((x) => x.path.toLowerCase() === path.toLowerCase());
    if (!page) {
      stage.append(l2Window('Página não encontrada', el('div', { class: 'l2-body' }, `A página "${path}" não existe no projeto. Crie-a em "Nova".`), { onBack: () => this._back() }));
      return;
    }
    const { title, body } = renderL2Html(page.content, { onAction: (act) => this._onAction(act, page.path) });
    stage.append(l2Window(title || page.path.split('/').pop(), body, { onBack: navStack.length ? () => this._back() : null }));
    if (this._warnBox && page === h) {
      const w = validateHtml(h, app.project);
      this._warnBox.hidden = !w.length;
      this._warnBox.replaceChildren(el('h3', {}, 'Avisos'), el('ul', {}, ...w.map((x) => el('li', {}, x))));
    }
  },

  _back() {
    previewPath = navStack.pop() || null;
    this._preview();
  },

  _onAction(action, fromPath) {
    const app = this.app;
    const r = interpretBypass(action, fromPath);
    if (r.type === 'page') {
      navStack.push(previewPath || fromPath);
      previewPath = r.path;
      this._preview();
    } else if (r.type === 'multisell') {
      const ms = app.project.multisells.find((m) => Number(m.listId) === r.id);
      if (!ms) return toast(`Multisell ${r.id} não existe no projeto.`, 'warn');
      this._stage.replaceChildren(renderMultisellWindow(ms, (id) => app.itemDB.name(id)));
      const back = el('button', { class: 'btn small', type: 'button' }, '◀ Voltar ao diálogo');
      back.addEventListener('click', () => this._preview());
      this._stage.append(back);
    } else if (r.type === 'teleport') {
      toast(`Teleporte "${r.arg}" — no servidor isso leva o jogador ao destino configurado.`, 'info', 4000);
    } else if (r.type === 'quest') {
      toast('Abre a lista de quests do NPC (depende dos scripts do servidor).', 'info', 4000);
    } else {
      toast(`Comando do servidor: ${r.cmd} ${r.arg || ''}`, 'info', 4000);
    }
  },
};
