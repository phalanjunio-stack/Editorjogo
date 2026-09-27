// Minimapa: visão de cima do terreno (cores das camadas + relevo sombreado), com zonas,
// NPCs, objetos e a posição/direção da câmera. Clique para levar a câmera até o ponto.
import { el } from './ui.js';
import { LAYER_UI_COLORS, LAYERS } from '../world/terrain.js';
import { NPC_TYPE_MAP, ZONE_TYPE_MAP } from '../city/city.js';
import { editorToL2, debounce } from '../core/util.js';

const BASE = 256;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Minimap {
  constructor(app) {
    this.app = app;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = BASE;
    this.views = [];
    this.filter = 'tudo';
    this.dirty = true;
    this.rebuildSoon = debounce(() => { this.dirty = true; }, 400);
    app.events.on('terrain-changed', () => this.rebuildSoon());
    app.events.on('project-loaded', () => { this.dirty = true; });
  }

  // Cria uma visão (canvas) ligada ao minimapa. onHover recebe coordenadas do mundo.
  // fit: 'contain' mostra o mapa inteiro; 'cover' preenche o painel centrado na câmera.
  view(cls, { onHover, fit = 'contain' } = {}) {
    const c = el('canvas', { class: cls });
    const v = { canvas: c, onHover, fit, ox: 0, oy: 0, S: 1, dpr: 1 };
    c.addEventListener('pointerdown', (e) => {
      const p = this._toWorld(v, e);
      if (p) this._goTo(p.x, p.z);
    });
    c.addEventListener('pointermove', (e) => {
      const p = this._toWorld(v, e);
      if (p && onHover) onHover(p);
    });
    this.views.push(v);
    return c;
  }

  _toWorld(v, e) {
    const r = v.canvas.getBoundingClientRect();
    const T = this.app.terrain;
    if (!T.size) return null;
    const d = v.dpr || 1;
    const u = ((e.clientX - r.left) * d - v.ox) / v.S, w = ((e.clientY - r.top) * d - v.oy) / v.S;
    if (u < 0 || u > 1 || w < 0 || w > 1) return null;
    const x = (u - 0.5) * T.size, z = (w - 0.5) * T.size;
    return { x, y: T.heightAt(x, z), z };
  }

  _goTo(x, z) {
    const app = this.app;
    if (app.playing) return;
    const ctrl = app.mode?.view === 'cloth' ? null : app.controls;
    if (!ctrl) return;
    const off = app.camera.position.clone().sub(ctrl.target);
    ctrl.target.set(x, app.terrain.heightAt(x, z), z);
    app.camera.position.copy(ctrl.target).add(off);
  }

  _buildBase() {
    const T = this.app.terrain;
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(BASE, BASE);
    // cor média de cada textura (cai para as cores fixas se ainda não houver)
    const cols = LAYER_UI_COLORS.map((h, i) => T.layerAvg?.[i] || hexToRgb(h));
    const water = this.app.project.terrain.waterEnabled ? this.app.project.terrain.waterLevel : -1e9;
    const range = Math.max(1, T.maxH - T.minH);
    for (let j = 0; j < BASE; j++) {
      for (let i = 0; i < BASE; i++) {
        const x = ((i + 0.5) / BASE - 0.5) * T.size, z = ((j + 0.5) / BASE - 0.5) * T.size;
        const h = T.heightAt(x, z);
        let r = 0, g = 0, b = 0;
        for (let l = 0; l < LAYERS; l++) {
          const w = T.layerWeightAt(l, x, z);
          if (w <= 0.001) continue;
          r += cols[l][0] * w; g += cols[l][1] * w; b += cols[l][2] * w;
        }
        // relevo sombreado (luz do noroeste)
        const e = T.size / BASE;
        const dx = T.heightAt(x + e, z) - T.heightAt(x - e, z);
        const dz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
        const shade = Math.max(0.35, Math.min(1.35, 1 + (-dx - dz) / (4 * e)));
        const alt = 0.8 + ((h - T.minH) / range) * 0.35;
        r *= shade * alt; g *= shade * alt; b *= shade * alt;
        if (h < water) {
          const d = Math.min(1, (water - h) / 6);
          r = 40 + 20 * (1 - d); g = 90 + 30 * (1 - d); b = 120 + 30 * (1 - d);
        }
        const k = (j * BASE + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dirty = false;
  }

  draw() {
    if (!this.app.terrain.size) return;
    if (this.dirty) this._buildBase();
    for (const v of this.views) {
      const c = v.canvas;
      if (!c.isConnected || c.offsetParent === null) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(c.clientWidth * dpr)), H = Math.max(1, Math.round(c.clientHeight * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      this._drawView(v, c.getContext('2d'), W, H, dpr);
    }
  }

  _drawView(v, ctx, W, H, dpr) {
    const app = this.app;
    const T = app.terrain;
    const p = app.project;
    let S, ox, oy;
    if (v.fit === 'cover') {
      // preenche o painel e acompanha a câmera (sem sair das bordas do mapa)
      S = Math.max(W, H) * 1.15;
      const focus = app.playing ? app.play.char.root.position : app.controls.target;
      const fx = (focus.x / T.size + 0.5) * S, fz = (focus.z / T.size + 0.5) * S;
      ox = Math.min(0, Math.max(W - S, W / 2 - fx));
      oy = Math.min(0, Math.max(H - S, H / 2 - fz));
    } else {
      S = Math.min(W, H);
      ox = (W - S) / 2;
      oy = (H - S) / 2;
    }
    Object.assign(v, { S, ox, oy, dpr });
    const toPx = (x, z) => [ox + (x / T.size + 0.5) * S, oy + (z / T.size + 0.5) * S];
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, ox, oy, S, S);
    const f = this.filter;
    // objetos
    if (f === 'tudo') {
      ctx.fillStyle = 'rgba(235,225,200,0.75)';
      const r = Math.max(1, 1.2 * dpr);
      for (const o of p.objects) {
        const [x, y] = toPx(o.pos[0], o.pos[2]);
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
    // zonas
    if (f === 'tudo' || f === 'zonas') {
      for (const z of p.zones) {
        if (z.points.length < 3) continue;
        const col = ZONE_TYPE_MAP.get(z.type)?.color || '#ffb84a';
        ctx.beginPath();
        z.points.forEach((pt, i) => {
          const [x, y] = toPx(pt[0], pt[1]);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.globalAlpha = f === 'zonas' ? 0.25 : 0.1;
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // NPCs / spawns
    if (f === 'tudo' || f === 'spawns') {
      for (const n of p.npcs) {
        const [x, y] = toPx(n.pos[0], n.pos[2]);
        const col = NPC_TYPE_MAP.get(n.type)?.color || '#fff';
        if (n.count > 1 && n.radius > 0) {
          ctx.beginPath();
          ctx.arc(x, y, (n.radius / T.size) * S, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.lineWidth = dpr;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, (f === 'spawns' ? 3.5 : 2.6) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    }
    // câmera (ou personagem no modo Play)
    const cam = app.playing ? app.play.char.root.position : app.camera.position;
    const target = app.playing ? null : app.controls.target;
    const [cx, cy] = toPx(cam.x, cam.z);
    let ang;
    if (target) ang = Math.atan2(target.z - cam.z, target.x - cam.x);
    else ang = app.play.facing;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(9 * dpr, 0);
    ctx.lineTo(-5 * dpr, 5.5 * dpr);
    ctx.lineTo(-2 * dpr, 0);
    ctx.lineTo(-5 * dpr, -5.5 * dpr);
    ctx.closePath();
    ctx.fillStyle = '#3d8bff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    ctx.restore();
  }

  coordsText(p) {
    const l2 = editorToL2(p, this.app.project.server);
    return `X: ${l2.x}   Y: ${l2.y}   Z: ${l2.z}`;
  }
}
