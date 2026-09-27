// Aba "Mundo": céu, hora do dia, nuvens, névoa, vento, água e dados gerais do mapa.
import * as THREE from 'three';
import { section, slider, checkbox, button, buttonRow, hint, el, text, number } from '../ui/ui.js';
import { l2TileOrigin, L2_TILE_SIZE } from '../core/util.js';

const TIME_PRESETS = [
  { label: 'Amanhecer', icon: 'sun', t: 6.4 },
  { label: 'Manhã', icon: 'sun', t: 9 },
  { label: 'Meio-dia', icon: 'sun', t: 12.5 },
  { label: 'Pôr do sol', icon: 'sun', t: 17.9 },
  { label: 'Noite', icon: 'moon', t: 22.5 },
];

export const mundoMode = {
  id: 'mundo',
  label: 'Mundo',
  icon: 'globe',
  title: 'Céu, hora do dia, nuvens, névoa, vento e água',
  view: '3d',
  hint: 'Direito: girar • Direito + WASD: voar • Meio: arrastar • Roda: zoom • F5: jogar',

  enter(app) {
    this.app = app;
  },

  exit(app) {
    app.controls.mouseButtons.LEFT = null;
  },

  update(dt, app) {
    app.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  },

  buildLeft(root, app) {
    const p = app.project;
    const applySky = () => { app.sky.apply(p.sky); app.markDirty(); };
    const sky = section(root, 'Céu e Hora do Dia', { icon: 'sun' });
    const timeSlider = slider(sky, 'Hora', p.sky, 'time', {
      min: 0, max: 24, step: 0.05, onChange: applySky,
      format: (v) => `${String(Math.floor(v) % 24).padStart(2, '0')}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`,
    });
    const presets = el('div', { class: 'chip-row' });
    for (const tp of TIME_PRESETS) {
      presets.append(button(null, tp.label, () => { timeSlider.set(tp.t); applySky(); }, { icon: tp.icon, variant: 'tag' }));
    }
    sky.append(presets);
    slider(sky, 'Direção do sol (°)', p.sky, 'sunAzimuth', { min: 0, max: 360, step: 1, onChange: applySky });
    slider(sky, 'Exposição', p.sky, 'exposure', { min: 0.1, max: 1.5, step: 0.01, onChange: applySky });
    slider(sky, 'Turbidez', p.sky, 'turbidity', { min: 0.5, max: 20, step: 0.1, onChange: applySky, title: 'Poeira no ar: deixa o céu mais branco e o pôr do sol mais laranja' });
    slider(sky, 'Azul do céu', p.sky, 'rayleigh', { min: 0, max: 4, step: 0.05, onChange: applySky });

    const cl = section(root, 'Nuvens', { icon: 'cloud' });
    slider(cl, 'Cobertura', p.sky, 'cloudCoverage', { min: 0, max: 1, step: 0.01, onChange: applySky });
    slider(cl, 'Densidade', p.sky, 'cloudDensity', { min: 0, max: 1, step: 0.01, onChange: applySky });
    slider(cl, 'Altura', p.sky, 'cloudElevation', { min: 0, max: 1, step: 0.01, onChange: applySky });
    slider(cl, 'Velocidade', p.sky, 'cloudSpeed', { min: 0, max: 5, step: 0.1, onChange: () => app.markDirty() });

    const fog = section(root, 'Névoa e Vento', { icon: 'wind' });
    slider(fog, 'Névoa', p.sky, 'fog', { min: 0, max: 6, step: 0.05, onChange: applySky });
    slider(fog, 'Vento (força)', p.sky, 'windStrength', { min: 0, max: 2, step: 0.01, onChange: applySky });
    slider(fog, 'Vento (direção °)', p.sky, 'windDir', { min: 0, max: 360, step: 1, onChange: applySky });
    hint(fog, 'O vento balança a grama, as bandeiras e a capa no modo Play.');

    const wa = section(root, 'Água', { icon: 'droplet' });
    checkbox(wa, 'Mostrar água', p.terrain, 'waterEnabled', { onChange: () => { app.applyTerrainSettings(); app.markDirty(); } });
    slider(wa, 'Nível (m)', p.terrain, 'waterLevel', { min: -50, max: 100, step: 0.1, onChange: () => { app.applyTerrainSettings(); app.markDirty(); } });
  },

  buildProps(root, app) {
    const p = app.project;
    const s = p.server;
    const w = section(root, 'Mundo', { icon: 'globe' });
    text(w, 'Nome do projeto', p, 'name', { onChange: (v) => { p.name = v.trim() || 'Meu Mundo'; app.markDirty(); app.hierarchy.render(); } });
    w.append(el('div', { class: 'kv' },
      el('span', {}, 'Terreno'), el('b', {}, `${p.terrain.size} × ${p.terrain.size} m`),
      el('span', {}, 'Resolução'), el('b', {}, `${p.terrain.res} × ${p.terrain.res}`),
      el('span', {}, 'Altura'), el('b', {}, `${app.terrain.minH.toFixed(1)} a ${app.terrain.maxH.toFixed(1)} m`),
      el('span', {}, 'Objetos'), el('b', {}, p.objects.length),
      el('span', {}, 'NPCs'), el('b', {}, p.npcs.length),
      el('span', {}, 'Zonas'), el('b', {}, p.zones.length)));

    const l2 = section(root, 'Posição no mundo L2', { icon: 'map' });
    const upd = () => { app.markDirty(); app.refreshRight(); };
    number(l2, 'Tile X', s, 'tileX', { min: 10, max: 30, step: 1, onChange: upd });
    number(l2, 'Tile Y', s, 'tileY', { min: 10, max: 30, step: 1, onChange: upd });
    slider(l2, 'Unid. L2 por metro', s, 'unitsPerMeter', { min: 4, max: 128, step: 1, onCommit: upd });
    number(l2, 'Z do chão', s, 'zBase', { step: 10, onChange: upd });
    const o = l2TileOrigin(s.tileX, s.tileY);
    const cover = (p.terrain.size * s.unitsPerMeter) / L2_TILE_SIZE;
    hint(l2, `Tile ${s.tileX}_${s.tileY}: X ${o.x}…${o.x + L2_TILE_SIZE}, Y ${o.y}…${o.y + L2_TILE_SIZE}. O terreno ocupa ${(cover * 100).toFixed(0)}% do tile.${cover > 1 ? ' ⚠ Maior que um tile: diminua as unidades por metro.' : ''}`);

    const q = section(root, 'Qualidade gráfica', { icon: 'sliders', open: false });
    buttonRow(q, ...['alta', 'media', 'baixa'].map((k) => button(null, { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[k], () => app.setQuality(k), { variant: app.quality === k ? 'primary' : '' })));
    hint(q, 'Alta: sombra de contato e imagem mais nítida (placa de vídeo boa). Média: antisserrilhado e sombras. Baixa: PCs fracos e notebooks (menos grama, sem sombras).');
  },
};
