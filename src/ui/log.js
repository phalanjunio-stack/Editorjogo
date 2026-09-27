// "Log do Editor": registra ações com horário (como nas engines).
import { el } from './ui.js';

export class EditorLog {
  constructor() {
    this.lines = [];
    this.el = el('div', { class: 'log-lines' });
  }

  add(message, type = 'info') {
    const d = new Date();
    const t = `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}]`;
    const line = el('div', { class: `log-line ${type}` }, el('span', { class: 'log-time' }, t), el('span', {}, String(message)));
    this.el.append(line);
    this.lines.push(line);
    if (this.lines.length > 300) this.lines.shift().remove();
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear() {
    this.el.replaceChildren();
    this.lines = [];
  }
}
