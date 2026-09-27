// Renderiza HTML de NPC no estilo da janela do Lineage 2. Nada é injetado com innerHTML:
// o texto é lido com DOMParser e reconstruído só com elementos permitidos (sem scripts).

const L2_COLORS = { LEVEL: '#d9c46e' };

function safeColor(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (L2_COLORS[s.toUpperCase()]) return L2_COLORS[s.toUpperCase()];
  if (/^#?[0-9a-f]{6}$/i.test(s)) return s.startsWith('#') ? s : `#${s}`;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return null;
}

function safeSize(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{1,4}$/.test(s)) return `${Math.min(Number(s), 2000)}px`;
  if (/^\d{1,3}%$/.test(s)) return s;
  return null;
}

// L2 usa tags "vazias" que o HTML normal trataria como contêiner.
export function preprocessL2(src) {
  return String(src || '')
    .replace(/<br1\s*\/?>/gi, '<br data-l2="1">')
    .replace(/<\/button>/gi, '')
    .replace(/<button\b([^>]*?)\/?>/gi, '<l2button$1></l2button>')
    .replace(/<edit\b([^>]*?)\/?>/gi, '<l2edit$1></l2edit>')
    .replace(/<combobox\b([^>]*?)\/?>/gi, '<l2combo$1></l2combo>')
    .replace(/<multiedit\b([^>]*?)\/?>/gi, '<l2multiedit$1></l2multiedit>');
}

const VARS = { '%objectId%': '268435456', '%playername%': 'Jogador', '%npcname%': 'NPC' };
const replaceVars = (s) => s.replace(/%objectId%|%playername%|%npcname%/g, (m) => VARS[m]);

/**
 * @param {string} src HTML do L2
 * @param {{onAction:(action:string)=>void}} ctx
 * @returns {{title:string, body:HTMLElement}}
 */
export function renderL2Html(src, ctx) {
  const doc = new DOMParser().parseFromString(preprocessL2(src), 'text/html');
  const out = document.createElement('div');
  out.className = 'l2-body';

  const walk = (node, parent) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        parent.append(document.createTextNode(replaceVars(ch.nodeValue)));
        continue;
      }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName.toLowerCase();
      const attr = (k) => ch.getAttribute(k);
      let el = null;
      switch (tag) {
        case 'script': case 'style': case 'iframe': case 'object': case 'title': case 'head':
          continue;
        case 'br':
          el = document.createElement('br');
          if (attr('data-l2')) el.className = 'br1';
          parent.append(el);
          continue;
        case 'center':
          el = document.createElement('div');
          el.className = 'l2-center';
          break;
        case 'font': {
          el = document.createElement('span');
          const c = safeColor(attr('color'));
          if (c) el.style.color = c;
          break;
        }
        case 'a': {
          el = document.createElement('span');
          el.className = 'l2-link';
          const action = attr('action') || '';
          el.title = action;
          el.addEventListener('click', () => ctx.onAction(action));
          break;
        }
        case 'l2button': {
          const b = document.createElement('span');
          b.className = 'l2-btn';
          b.textContent = replaceVars(attr('value') || '');
          const w = safeSize(attr('width')), h = safeSize(attr('height'));
          if (w) b.style.width = w;
          if (h) b.style.height = h;
          const action = attr('action') || '';
          b.title = action;
          b.addEventListener('click', () => ctx.onAction(action));
          parent.append(b);
          continue;
        }
        case 'img': {
          const s = attr('src') || '';
          const d = document.createElement('span');
          const w = safeSize(attr('width')) || '32px', h = safeSize(attr('height')) || '32px';
          d.style.width = w;
          d.style.height = h;
          d.title = s;
          if (/SquareWhite/i.test(s)) d.className = 'l2-img bar white';
          else if (/SquareGray/i.test(s)) d.className = 'l2-img bar gray';
          else if (/SquareBlank/i.test(s)) d.className = 'l2-img blank';
          else {
            d.className = 'l2-img icon';
            d.textContent = s.split('.').pop().slice(0, 3);
          }
          parent.append(d);
          continue;
        }
        case 'table': case 'tr': case 'td': {
          el = document.createElement(tag);
          const w = safeSize(attr('width'));
          if (w) el.style.width = w;
          const h = safeSize(attr('height'));
          if (h) el.style.height = h;
          const bg = safeColor(attr('bgcolor'));
          if (bg) el.style.background = bg;
          const al = attr('align');
          if (al && /^(left|right|center)$/i.test(al)) el.style.textAlign = al.toLowerCase();
          const va = attr('valign');
          if (va && /^(top|middle|bottom)$/i.test(va)) el.style.verticalAlign = va.toLowerCase();
          if (tag === 'table') {
            const b = Number(attr('border') || 0);
            if (b > 0) el.classList.add('bordered');
            const cp = Number(attr('cellpadding') || 0);
            if (cp > 0) el.style.setProperty('--cp', `${Math.min(cp, 20)}px`);
            el.style.borderSpacing = `${Math.min(Number(attr('cellspacing') || 0), 20)}px`;
          }
          break;
        }
        case 'l2edit': {
          el = document.createElement('input');
          el.className = 'l2-edit';
          const w = safeSize(attr('width'));
          if (w) el.style.width = w;
          el.placeholder = attr('var') || '';
          parent.append(el);
          continue;
        }
        case 'l2multiedit': {
          el = document.createElement('textarea');
          el.className = 'l2-edit';
          const w = safeSize(attr('width')), h = safeSize(attr('height'));
          if (w) el.style.width = w;
          if (h) el.style.height = h;
          parent.append(el);
          continue;
        }
        case 'l2combo': {
          el = document.createElement('select');
          el.className = 'l2-edit';
          for (const o of (attr('list') || '').split(';').filter(Boolean)) {
            const op = document.createElement('option');
            op.textContent = o;
            el.append(op);
          }
          const w = safeSize(attr('width'));
          if (w) el.style.width = w;
          parent.append(el);
          continue;
        }
        default:
          el = null;
      }
      if (el) {
        parent.append(el);
        walk(ch, el);
      } else {
        walk(ch, parent);
      }
    }
  };
  walk(doc.body || doc.documentElement, out);
  return { title: doc.title || '', body: out };
}

// Janela no visual L2 (moldura, título, botão fechar).
export function l2Window(title, content, { onBack = null } = {}) {
  const win = document.createElement('div');
  win.className = 'l2-window';
  const head = document.createElement('div');
  head.className = 'l2-title';
  const t = document.createElement('span');
  t.textContent = title || 'Diálogo';
  head.append(t);
  if (onBack) {
    const back = document.createElement('span');
    back.className = 'l2-back';
    back.textContent = '◀';
    back.title = 'Voltar';
    back.addEventListener('click', onBack);
    head.prepend(back);
  }
  const x = document.createElement('span');
  x.className = 'l2-x';
  x.textContent = '×';
  head.append(x);
  const body = document.createElement('div');
  body.className = 'l2-content';
  body.append(content);
  win.append(head, body);
  return win;
}

// Janela de multisell estilo L2 (lista de produtos e ingredientes).
export function renderMultisellWindow(ms, itemName) {
  const list = document.createElement('div');
  list.className = 'l2-ms';
  if (!ms.entries.length) {
    list.textContent = 'Nenhum item nesta lista.';
  }
  for (const e of ms.entries) {
    const row = document.createElement('div');
    row.className = 'l2-ms-row';
    for (const p of e.productions) {
      const it = document.createElement('div');
      it.className = 'l2-ms-prod';
      const ico = document.createElement('span');
      ico.className = 'l2-img icon';
      const nm = itemName(p.id) || `Item ${p.id}`;
      ico.textContent = nm.slice(0, 2);
      const label = document.createElement('span');
      label.textContent = `${p.enchant > 0 ? `+${p.enchant} ` : ''}${nm}${p.count > 1 ? ` (${p.count})` : ''}${ms.isChance ? ` — ${p.chance}%` : ''}`;
      it.append(ico, label);
      row.append(it);
    }
    const ing = document.createElement('div');
    ing.className = 'l2-ms-ing';
    ing.textContent = 'Custo: ' + (e.ingredients.map((i) => `${itemName(i.id) || `Item ${i.id}`} x${Number(i.count).toLocaleString('pt-BR')}`).join(' + ') || 'grátis');
    row.append(ing);
    list.append(row);
  }
  return l2Window(`Multisell ${ms.listId} — ${ms.name || ''}`, list);
}
