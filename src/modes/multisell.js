// Aba "Multisell": lojas/trocas do servidor com prévia no estilo L2 e XML pronto.
import { section, button, buttonRow, hint, el, text, number, checkbox, toast, pickFiles, readFileAs, downloadBlob, confirmBox, modal, clear } from '../ui/ui.js';
import { newMultisell, newEntry, multisellToXml, xmlToMultisell, validateMultisell } from '../l2/multisell.js';
import { renderMultisellWindow } from '../l2/htmlPreview.js';
import { parseItemsFile } from '../l2/items.js';
import { npcMultisellLinks } from '../l2/htmlCore.js';
import { debounce, uid } from '../core/util.js';

let selectedUid = null;

function current(app) {
  const list = app.project.multisells;
  if (app.multisellOpenId) {
    const m = list.find((x) => Number(x.listId) === Number(app.multisellOpenId));
    app.multisellOpenId = null;
    if (m) selectedUid = m.uid;
  }
  let m = list.find((x) => x.uid === selectedUid);
  if (!m && list.length) { m = list[0]; selectedUid = m.uid; }
  return m || null;
}

function nextId(app) {
  const ids = app.project.multisells.map((m) => Number(m.listId) || 0);
  return Math.max(900000, ...ids) + 1;
}

function itemDatalist(app) {
  let dl = document.getElementById('dl-itens');
  if (!dl) {
    dl = el('datalist', { id: 'dl-itens' });
    document.body.append(dl);
  }
  clear(dl);
  for (const it of app.itemDB.all()) dl.append(el('option', { value: String(it.id) }, `${it.id} — ${it.name}`));
  return dl;
}

export const multisellMode = {
  id: 'loja',
  label: 'Loja',
  icon: 'coins',
  title: 'Lojas e trocas (multisell) do servidor',
  view: 'doc',
  hint: 'Cada multisell vira data/multisell/custom/<ID>.xml. Ligue ao NPC pelo HTML (link "Comprar") ou no painel do NPC.',

  enter(app) {
    this.app = app;
    itemDatalist(app);
    this.refreshPreview = debounce(() => this._preview(), 150);
  },

  select(uidOrListId) {
    const m = this.app.project.multisells.find((x) => x.uid === uidOrListId || Number(x.listId) === Number(uidOrListId));
    if (m) selectedUid = m.uid;
  },

  // Clique num item no Navegador de Conteúdo: adiciona à loja aberta.
  addItem(it) {
    const m = current(this.app);
    if (!m) return;
    this._mutate('Adicionar item', () => m.entries.push(newEntry(it.id, 1, 57, 1)));
    this.app.log(`${it.name} adicionado à loja ${m.listId} (ajuste o preço).`);
  },

  buildLeft(root, app) {
    const s = section(root, 'Multisells do projeto', { icon: 'coins' });
    const list = el('div', { class: 'doc-list' });
    const cur = current(app);
    for (const m of app.project.multisells) {
      const b = el('button', { class: `doc-item ${cur && m.uid === cur.uid ? 'active' : ''}`, type: 'button' }, el('b', {}, m.listId), el('span', {}, m.name || ''), el('small', {}, `${m.entries.length} itens`));
      b.addEventListener('click', () => { selectedUid = m.uid; app.refreshPanels(); app.refreshDoc(); });
      list.append(b);
    }
    if (!app.project.multisells.length) list.append(el('p', { class: 'hint' }, 'Nenhum multisell ainda.'));
    s.append(list);
    buttonRow(s,
      button(null, 'Novo', () => this._mutate('Novo multisell', () => {
        const m = newMultisell(nextId(app), 'Nova loja');
        m.entries.push(newEntry(1835, 1000, 57, 7000));
        app.project.multisells.push(m);
        selectedUid = m.uid;
      }), { variant: 'primary', icon: 'plus' }),
      button(null, 'Duplicar', () => cur && this._mutate('Duplicar multisell', () => {
        const m = JSON.parse(JSON.stringify(cur));
        m.uid = uid('ms');
        m.listId = nextId(app);
        m.name = `${cur.name} (cópia)`;
        app.project.multisells.push(m);
        selectedUid = m.uid;
      }), { icon: 'copy' }),
    );
    buttonRow(s,
      button(null, 'Importar XML…', async () => {
        const files = await pickFiles('.xml', true);
        for (const f of files) {
          const txt = await readFileAs(f, 'text');
          const idMatch = /(\d+)/.exec(f.name);
          const m = xmlToMultisell(txt, idMatch ? Number(idMatch[1]) : nextId(app), f.name.replace(/\.xml$/i, ''));
          this._mutate('Importar multisell', () => { app.project.multisells.push(m); selectedUid = m.uid; });
          toast(`${f.name}: ${m.entries.length} entradas importadas.`, 'ok');
        }
      }, { icon: 'upload' }),
      button(null, 'Excluir', async () => {
        if (!cur) return;
        if (!(await confirmBox(`Excluir o multisell ${cur.listId}?`, 'Excluir'))) return;
        this._mutate('Excluir multisell', () => {
          app.project.multisells = app.project.multisells.filter((m) => m.uid !== cur.uid);
          selectedUid = null;
        });
      }, { variant: 'danger', icon: 'trash' }),
    );

    const it = section(root, 'Itens conhecidos', { icon: 'item', open: false });
    hint(it, `${app.itemDB.all().length} itens na lista (${app.project.items.length} importados). Importe do seu servidor para ter nomes certos.`);
    button(it, 'Importar itens do servidor…', async () => {
      const files = await pickFiles('.xml,.txt,.csv', true);
      let total = 0;
      for (const f of files) {
        const items = parseItemsFile(await readFileAs(f, 'text'));
        const map = new Map(app.project.items.map((x) => [x.id, x]));
        for (const x of items) map.set(x.id, x);
        app.project.items = [...map.values()];
        total += items.length;
      }
      app.refreshItems();
      itemDatalist(app);
      app.contentBrowser.render();
      app.markDirty();
      app.refreshPanels();
      app.refreshDoc();
      toast(`${total} itens lidos.`, 'ok');
    }, { icon: 'upload', title: 'Aceita data/stats/items/*.xml do L2J/L2Mobius ou .txt/.csv "id;nome"' });
    hint(it, 'Aceita os XML de data/stats/items (pode escolher vários de uma vez) ou um .txt/.csv com "id;nome".');
  },

  _mutate(label, fn) {
    const app = this.app;
    const before = JSON.stringify(app.project.multisells);
    const beforeSel = selectedUid;
    fn();
    const after = JSON.stringify(app.project.multisells);
    const afterSel = selectedUid;
    const restore = (json, sel) => {
      app.project.multisells = JSON.parse(json);
      selectedUid = sel;
      if (app.mode === this) { app.refreshPanels(); app.refreshDoc(); }
    };
    app.history.push({ label, undo: () => restore(before, beforeSel), redo: () => restore(after, afterSel) });
    app.markDirty();
    app.refreshPanels();
    app.refreshDoc();
  },

  buildDoc(root, app) {
    const m = current(app);
    root.classList.add('doc-pad');
    if (!m) {
      root.append(el('div', { class: 'empty' }, el('h2', {}, 'Nenhum multisell'), el('p', {}, 'Clique em "Novo" à esquerda para criar sua primeira loja.')));
      return;
    }
    const changed = () => { app.markDirty(); this.refreshPreview(); };
    const head = el('div', { class: 'card' });
    head.append(el('h2', {}, `Multisell ${m.listId}`));
    const g = el('div', { class: 'grid2' });
    number(g, 'ID da lista', m, 'listId', { min: 1, step: 1, onChange: () => { changed(); app.refreshLeft(); }, title: 'Número usado no bypass: npc_%objectId%_multisell <ID>' });
    text(g, 'Nome (comentário)', m, 'name', { onChange: () => { changed(); app.refreshLeft(); } });
    const npcObj = { v: (m.npcs || []).join(', ') };
    text(g, 'NPCs permitidos', npcObj, 'v', {
      placeholder: 'ex.: 30001, 30002',
      onChange: (v) => { m.npcs = v.split(/[,;\s]+/).map(Number).filter((n) => n > 0); changed(); },
      title: 'NPCs que podem abrir esta lista. Os NPCs ligados pelo HTML entram sozinhos na exportação.',
    });
    checkbox(g, 'Cobrar imposto do castelo', m, 'applyTaxes', { onChange: changed });
    checkbox(g, 'Manter enchant do item', m, 'maintainEnchantment', { onChange: changed });
    checkbox(g, 'Multisell de chance', m, 'isChance', { onChange: () => { changed(); app.refreshDoc(); }, title: 'Só em versões novas do L2Mobius' });
    head.append(g);
    const auto = npcMultisellLinks(app.project).get(Number(m.listId));
    if (auto?.size) head.append(el('p', { class: 'hint' }, `Abrem esta loja pelo HTML: NPC ${[...auto].join(', ')} (entram automaticamente em <npcs>).`));
    root.append(head);

    // adicionar rápido
    const quick = el('div', { class: 'card' });
    quick.append(el('h3', {}, 'Adicionar item à venda'));
    const q = { id: 1835, count: 1, price: 7, priceId: 57 };
    const qg = el('div', { class: 'grid4' });
    this._itemField(qg, 'Item', q, 'id', app);
    number(qg, 'Quantidade', q, 'count', { min: 1, step: 1 });
    this._itemField(qg, 'Pago com', q, 'priceId', app);
    number(qg, 'Preço', q, 'price', { min: 1, step: 1 });
    quick.append(qg);
    buttonRow(quick,
      button(null, 'Adicionar', () => this._mutate('Adicionar item', () => m.entries.push(newEntry(Number(q.id), q.count, Number(q.priceId), q.price))), { variant: 'primary', icon: 'plus' }),
      button(null, 'Colar lista…', () => this._pasteList(m), { icon: 'copy', title: 'Várias linhas "id;quantidade;preço"' }),
      button(null, 'Entrada vazia', () => this._mutate('Nova entrada', () => m.entries.push({ uid: uid('ent'), productions: [], ingredients: [] })), { icon: 'plus' }),
    );
    root.append(quick);

    // entradas
    m.entries.forEach((e, idx) => root.append(this._entryCard(app, m, e, idx, changed)));
    const warn = validateMultisell(m);
    if (warn.length) root.append(el('div', { class: 'card warn' }, el('h3', {}, 'Avisos'), el('ul', {}, ...warn.map((w) => el('li', {}, w)))));
    this._preview();
  },

  _itemField(parent, label, obj, key, app, onChange) {
    const inp = el('input', { type: 'text', list: 'dl-itens', value: obj[key], class: 'item-input' });
    const name = el('span', { class: 'item-name' }, app.itemDB.name(obj[key]) || '?');
    inp.addEventListener('change', () => {
      const n = parseInt(inp.value, 10);
      if (!Number.isNaN(n)) obj[key] = n;
      inp.value = obj[key];
      name.textContent = app.itemDB.name(obj[key]) || '?';
      onChange?.();
    });
    const wrap = el('label', { class: 'row item-row' }, el('span', { class: 'row-label' }, label), el('span', { class: 'item-field' }, inp, name));
    parent.append(wrap);
    return inp;
  },

  _entryCard(app, m, e, idx, changed) {
    const card = el('div', { class: 'card entry' });
    const head = el('div', { class: 'entry-head' }, el('b', {}, `#${idx + 1}`));
    const move = (d) => this._mutate('Mover entrada', () => {
      const j = idx + d;
      if (j < 0 || j >= m.entries.length) return;
      [m.entries[idx], m.entries[j]] = [m.entries[j], m.entries[idx]];
    });
    head.append(el('span', { class: 'spacer' }),
      button(null, '↑', () => move(-1), { title: 'Subir' }),
      button(null, '↓', () => move(1), { title: 'Descer' }),
      button(null, '⧉', () => this._mutate('Duplicar entrada', () => { const c = JSON.parse(JSON.stringify(e)); c.uid = uid('ent'); m.entries.splice(idx + 1, 0, c); }), { title: 'Duplicar' }),
      button(null, '🗑', () => this._mutate('Excluir entrada', () => m.entries.splice(idx, 1)), { title: 'Excluir', variant: 'danger' }),
    );
    card.append(head);
    const col = (title, arr, kind) => {
      const box = el('div', { class: 'entry-col' }, el('h4', {}, title));
      arr.forEach((it, j) => {
        const r = el('div', { class: 'entry-line' });
        this._itemField(r, 'Item', it, 'id', app, changed);
        number(r, 'Qtd', it, 'count', { min: 1, step: 1, onChange: changed });
        number(r, 'Enchant', it, 'enchant', { min: 0, max: 65535, step: 1, onChange: changed });
        if (kind === 'prod' && m.isChance) number(r, 'Chance %', it, 'chance', { min: 0, max: 100, step: 0.01, onChange: changed });
        r.append(button(null, '✕', () => this._mutate('Remover linha', () => arr.splice(j, 1)), { title: 'Remover', variant: 'ghost' }));
        box.append(r);
      });
      box.append(button(null, kind === 'prod' ? '+ produto' : '+ custo', () => this._mutate('Adicionar linha', () => arr.push(kind === 'prod' ? { id: 57, count: 1, enchant: 0, chance: 100 } : { id: 57, count: 1, enchant: 0 })), { variant: 'ghost' }));
      return box;
    };
    card.append(el('div', { class: 'entry-cols' }, col('Recebe', e.productions, 'prod'), col('Paga', e.ingredients, 'ing')));
    return card;
  },

  async _pasteList(m) {
    let ta;
    const r = await modal({
      title: 'Colar lista de itens',
      body: (c) => {
        c.append(el('p', {}, 'Uma linha por item: id;quantidade;preço (em Adena). Ex.:'), el('pre', {}, '1835;1000;7000\n736;1;400\n6364;1;150000000'));
        ta = el('textarea', { rows: 10, style: { width: '100%' } });
        c.append(ta);
      },
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Adicionar', value: 'ok', variant: 'primary' }],
    });
    if (r !== 'ok') return;
    const rows = ta.value.split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((s) => s.trim())).filter((p) => /^\d+$/.test(p[0]));
    this._mutate('Colar lista', () => {
      for (const p of rows) m.entries.push(newEntry(Number(p[0]), Number(p[1]) || 1, 57, Number(p[2]) || 1));
    });
    toast(`${rows.length} itens adicionados.`, 'ok');
  },

  buildProps(root, app) {
    const s = section(root, 'Prévia no jogo', { icon: 'eye' });
    this._previewBox = el('div', { class: 'l2-stage' });
    s.append(this._previewBox);
    const x = section(root, 'XML do servidor', { icon: 'code' });
    this._xmlBox = el('textarea', { class: 'code small', readonly: true, rows: 14, spellcheck: 'false' });
    x.append(this._xmlBox);
    buttonRow(x,
      button(null, 'Baixar XML', () => {
        const m = current(app);
        if (m) downloadBlob(this._xml(m), `${m.listId}.xml`, 'application/xml');
      }, { icon: 'download' }),
      button(null, 'Copiar', async () => {
        try { await navigator.clipboard.writeText(this._xmlBox.value); toast('XML copiado.', 'ok'); } catch { this._xmlBox.select(); }
      }, { icon: 'copy' }),
    );
    hint(x, 'Salve em data/multisell/custom/ do servidor (ou use a aba Exportar para baixar tudo junto).');
    this._preview();
  },

  _xml(m) {
    const app = this.app;
    const auto = npcMultisellLinks(app.project).get(Number(m.listId));
    return multisellToXml(m, { itemName: (id) => app.itemDB.name(id), schemaPath: '../../../xsd/multisell.xsd', extraNpcs: auto ? [...auto] : [] });
  },

  _preview() {
    const app = this.app;
    const m = current(app);
    if (!this._previewBox || !this._xmlBox) return;
    this._previewBox.replaceChildren();
    if (!m) { this._xmlBox.value = ''; return; }
    this._previewBox.append(renderMultisellWindow(m, (id) => app.itemDB.name(id)));
    this._xmlBox.value = this._xml(m);
  },
};
