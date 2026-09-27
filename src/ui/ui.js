// Pequena biblioteca de interface: painéis, controles ligados a propriedades, menus, toasts e janelas.
import { icon as svgIcon, hasIcon } from './icons.js';
import { ZipWriter } from '../core/zip.js';

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

// Ícone: nome de ícone SVG (ver icons.js) ou texto/emoji.
export function ico(name, size = 16) {
  if (!name) return null;
  if (hasIcon(name)) return svgIcon(name, size);
  return el('span', { class: 'emoji' }, name);
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

export function section(parent, title, { open = true, icon = '' } = {}) {
  const d = el('details', { class: 'section', open });
  d.append(el('summary', {}, svgIcon('chevronDown', 12, 'chev'), icon ? ico(icon, 14) : null, el('span', {}, title)));
  const body = el('div', { class: 'section-body' });
  d.append(body);
  parent.append(d);
  return body;
}

// Painel com cabeçalho (título + ações), como os docks das engines.
export function panelBox(title, iconName, { actions = [], cls = '' } = {}) {
  const head = el('div', { class: 'pbox-head' }, ico(iconName, 14), el('span', { class: 'pbox-title' }, title), el('span', { class: 'spacer' }), ...actions);
  const body = el('div', { class: 'pbox-body' });
  const root = el('div', { class: `pbox ${cls}` }, head, body);
  return { root, head, body };
}

export function row(parent, label, control, { title } = {}) {
  const r = el('label', { class: 'row', title });
  r.append(el('span', { class: 'row-label' }, label), control);
  parent.append(r);
  return r;
}

function fmt(v, step) {
  if (typeof v !== 'number') return String(v);
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  return v.toFixed(decimals);
}

// Slider com caixa numérica editável ao lado.
export function slider(parent, label, obj, key, { min = 0, max = 1, step = 0.01, onChange, onCommit, format, title } = {}) {
  const input = el('input', { type: 'range', min, max, step, value: obj[key] });
  const box = el('input', { type: 'text', class: 'num', value: format ? format(obj[key]) : fmt(obj[key], step), inputmode: 'decimal' });
  const paint = () => {
    const t = (Number(input.value) - min) / (max - min || 1);
    input.style.setProperty('--fill', `${Math.max(0, Math.min(1, t)) * 100}%`);
  };
  const wrap = el('span', { class: 'slider' }, input, box);
  input.addEventListener('input', () => {
    obj[key] = parseFloat(input.value);
    box.value = format ? format(obj[key]) : fmt(obj[key], step);
    paint();
    onChange?.(obj[key]);
  });
  input.addEventListener('change', () => onCommit?.(obj[key]));
  box.addEventListener('change', () => {
    let v = parseFloat(String(box.value).replace(',', '.'));
    if (format && /:/.test(box.value)) {
      const [h, m] = box.value.split(':').map(Number);
      v = h + (m || 0) / 60;
    }
    if (Number.isNaN(v)) v = obj[key];
    v = Math.max(min, Math.min(max, v));
    obj[key] = v;
    input.value = v;
    box.value = format ? format(v) : fmt(v, step);
    paint();
    onChange?.(v);
    onCommit?.(v);
  });
  paint();
  row(parent, label, wrap, { title });
  return {
    input,
    set(v) {
      obj[key] = v;
      input.value = v;
      box.value = format ? format(v) : fmt(v, step);
      paint();
    },
  };
}

export function number(parent, label, obj, key, { min, max, step = 1, onChange, title, width } = {}) {
  const input = el('input', { type: 'number', min, max, step, value: obj[key], style: width ? { width } : undefined });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) v = obj[key];
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    obj[key] = v;
    input.value = v;
    onChange?.(v);
  });
  row(parent, label, input, { title });
  return input;
}

export function text(parent, label, obj, key, { onChange, placeholder, title, live = false } = {}) {
  const input = el('input', { type: 'text', value: obj[key] ?? '', placeholder });
  input.addEventListener(live ? 'input' : 'change', () => {
    obj[key] = input.value;
    onChange?.(input.value);
  });
  row(parent, label, input, { title });
  return input;
}

export function select(parent, label, obj, key, options, { onChange, title } = {}) {
  const s = el('select');
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  for (const o of opts) s.append(el('option', { value: o.value }, o.label));
  s.value = obj[key] ?? '';
  s.addEventListener('change', () => {
    const o = opts.find((x) => String(x.value) === s.value);
    obj[key] = o ? o.value : s.value;
    onChange?.(obj[key]);
  });
  if (label === null) parent.append(s);
  else row(parent, label, s, { title });
  return s;
}

export function checkbox(parent, label, obj, key, { onChange, title } = {}) {
  const input = el('input', { type: 'checkbox' });
  input.checked = !!obj[key];
  input.addEventListener('change', () => {
    obj[key] = input.checked;
    onChange?.(input.checked);
  });
  const r = el('label', { class: 'check-row', title }, input, el('span', {}, label));
  parent.append(r);
  return input;
}

export function color(parent, label, obj, key, { onChange, title } = {}) {
  const input = el('input', { type: 'color', value: obj[key] });
  input.addEventListener('input', () => {
    obj[key] = input.value;
    onChange?.(input.value);
  });
  row(parent, label, input, { title });
  return input;
}

export function button(parent, label, onClick, { variant = '', title, icon } = {}) {
  const b = el('button', { class: `btn ${variant}`, title, type: 'button' }, icon ? ico(icon, 14) : null, label ? el('span', {}, label) : null);
  b.addEventListener('click', onClick);
  parent?.append(b);
  return b;
}

export function iconButton(iconName, title, onClick, { active = false, cls = '' } = {}) {
  const b = el('button', { class: `ibtn ${active ? 'active' : ''} ${cls}`, type: 'button', title }, ico(iconName, 16));
  b.addEventListener('click', onClick);
  return b;
}

export function buttonRow(parent, ...buttons) {
  const r = el('div', { class: 'btn-row' }, ...buttons);
  parent.append(r);
  return r;
}

export function hint(parent, content) {
  const h = el('p', { class: 'hint' }, content);
  parent.append(h);
  return h;
}

// Grade de ferramentas (botões com ícone). Retorna {setActive}.
export function toolGrid(parent, tools, active, onSelect, { cols = 4 } = {}) {
  const grid = el('div', { class: 'tool-grid', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  const buttons = new Map();
  for (const t of tools) {
    const b = el('button', { class: 'tool', type: 'button', title: t.title || t.label }, el('span', { class: 'tool-ico' }, ico(t.icon, 22)), el('span', { class: 'tool-label' }, t.label));
    b.addEventListener('click', () => {
      setActive(t.id);
      onSelect(t.id);
    });
    buttons.set(t.id, b);
    grid.append(b);
  }
  function setActive(id) {
    for (const [k, b] of buttons) b.classList.toggle('active', k === id);
  }
  setActive(active);
  parent.append(grid);
  return { setActive, el: grid };
}

// Grade de miniaturas (camadas, tipos de folhagem...).
export function thumbGrid(parent, items, active, onSelect, { cols = 4 } = {}) {
  const grid = el('div', { class: 'thumb-grid', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  for (const it of items) {
    const img = el('div', { class: 'thumb-img' });
    if (it.src) img.style.backgroundImage = `url("${it.src}")`;
    if (it.color) img.style.background = it.color;
    const b = el('button', { class: `thumb ${it.id === active ? 'active' : ''}`, type: 'button', title: it.title || it.label }, img, el('span', {}, it.label));
    b.addEventListener('click', () => onSelect(it.id));
    if (it.onContext) b.addEventListener('contextmenu', (e) => { e.preventDefault(); it.onContext(); });
    grid.append(b);
  }
  parent.append(grid);
  return grid;
}

// Menu suspenso. items: [{label, action, shortcut, checked, disabled, sep, icon}]
let openMenu = null;
export function closeMenus() {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
    document.querySelectorAll('.menu-open').forEach((b) => b.classList.remove('menu-open'));
  }
}
export function dropdown(anchor, items, { align = 'left' } = {}) {
  closeMenus();
  const m = el('div', { class: 'dropdown' });
  for (const it of items) {
    if (it.sep) { m.append(el('div', { class: 'dd-sep' })); continue; }
    if (it.header) { m.append(el('div', { class: 'dd-header' }, it.header)); continue; }
    const b = el('button', { class: `dd-item ${it.disabled ? 'disabled' : ''}`, type: 'button' },
      el('span', { class: 'dd-check' }, it.checked === undefined ? (it.icon ? ico(it.icon, 14) : '') : it.checked ? svgIcon('check', 14) : ''),
      el('span', { class: 'dd-label' }, it.label),
      it.shortcut ? el('span', { class: 'dd-key' }, it.shortcut) : null);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (it.disabled) return;
      if (!it.keepOpen) closeMenus();
      it.action?.();
      if (it.keepOpen && it.checked !== undefined) {
        it.checked = !it.checked;
        b.querySelector('.dd-check').replaceChildren(it.checked ? svgIcon('check', 14) : '');
      }
    });
    m.append(b);
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  let left = align === 'right' ? r.right - w : r.left;
  left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
  m.style.left = `${left}px`;
  m.style.top = `${r.bottom + 2}px`;
  anchor.classList.add('menu-open');
  openMenu = m;
  return m;
}
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.contains(e.target) && !e.target.closest?.('.menu-open')) closeMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

export function pickFiles(accept = '*', multiple = false) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    document.body.append(input);
    input.addEventListener('change', () => {
      resolve([...input.files]);
      input.remove();
    });
    input.click();
  });
}

let toastHost = null;
let toastHook = null;
export function setToastHook(fn) {
  toastHook = fn;
}
export function toast(message, type = 'info', ms = 3200) {
  toastHook?.(message, type);
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const t = el('div', { class: `toast ${type}` }, message);
  toastHost.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function modal({ title, body, buttons = [{ label: 'Fechar' }], wide = false }) {
  return new Promise((resolve) => {
    const back = el('div', { class: 'modal-back' });
    const box = el('div', { class: `modal ${wide ? 'wide' : ''}` });
    const head = el('div', { class: 'modal-head' }, el('h2', {}, title));
    const content = el('div', { class: 'modal-body' });
    if (typeof body === 'function') body(content);
    else if (body) content.append(body);
    const foot = el('div', { class: 'modal-foot' });
    const close = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    for (const b of buttons) {
      foot.append(button(null, b.label, () => close(b.value ?? b.label), { variant: b.variant || '' }));
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) close(null);
    });
    box.append(head, content, foot);
    back.append(box);
    document.body.append(back);
  });
}

export async function confirmBox(message, okLabel = 'Confirmar') {
  const r = await modal({
    title: 'Confirmar',
    body: el('p', {}, message),
    buttons: [{ label: 'Cancelar', value: false }, { label: okLabel, value: true, variant: 'primary' }],
  });
  return r === true;
}

export async function promptBox(title, value = '', placeholder = '') {
  let input;
  const r = await modal({
    title,
    body: (c) => {
      input = el('input', { type: 'text', value, placeholder, style: { width: '100%' } });
      c.append(input);
      setTimeout(() => { input.focus(); input.select(); }, 30);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') c.closest('.modal').querySelector('.btn.primary').click();
      });
    },
    buttons: [{ label: 'Cancelar', value: null }, { label: 'OK', value: 'ok', variant: 'primary' }],
  });
  return r === 'ok' ? input.value : null;
}

// Dentro do visualizador do Claude (artifact) os downloads passam pela capacidade "downloads",
// que só aceita algumas extensões: as outras (.xml, .htm, .glb...) vão dentro de um .zip.
const ARTIFACT_EXT = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip']);

async function artifactDownloads() {
  try {
    if (typeof window === 'undefined' || !window.claude?.use) return null;
    return await window.claude.use('downloads');
  } catch {
    return null;
  }
}

export async function downloadBlob(data, filename, mime = 'application/octet-stream') {
  let blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const dl = await artifactDownloads();
  if (dl) {
    let name = filename;
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (!ARTIFACT_EXT.has(ext)) {
      const z = new ZipWriter();
      z.add(filename, new Uint8Array(await blob.arrayBuffer()));
      blob = new Blob([await z.build()], { type: 'application/zip' });
      name = `${filename}.zip`;
    }
    try {
      await dl.save({ filename: name, data: blob });
    } catch (err) {
      if (err?.code !== 'declined') toast(`Não foi possível baixar ${name}${err?.message ? `: ${err.message}` : ''}.`, 'error', 6000);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

export function readFileAs(file, as = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (as === 'text') r.readAsText(file);
    else if (as === 'dataurl') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}
