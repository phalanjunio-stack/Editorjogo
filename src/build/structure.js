// Geradores do Construtor: casa (paredes com portas e janelas, enxaimel, base de pedra, telhado de
// duas ou quatro águas, chaminé), castelo, muros com ameias, torre, portão e ponte com arcos.
// Tudo em metros, no espaço da construção (origem no ponto em que ela foi colocada, y = 0 no chão
// mais alto do contorno). Cada peça vai para uma "parte" com material próprio:
//   parede, madeira, base, telhado, porta, ferro, vidro
import * as THREE from 'three';
import { GeoAcc, v3, ccwXZ, centroid, offsetPoly, edgeNormal, asRectangle, isConvex } from './geom.js';
import { rng } from '../core/util.js';

export const STRUCT_TYPES = [
  { id: 'casa', label: 'Casa', icon: 'home', pick: 'poly', min: 2, hint: 'Clique nos cantos da casa (o 1º lado é a frente, com a porta). 2 cliques = retângulo com a Largura do painel.' },
  { id: 'castelo', label: 'Castelo', icon: 'castle', pick: 'poly', min: 3, hint: 'Clique nos cantos da muralha do castelo (o 1º lado recebe o portão). Torres nos cantos e torre de menagem no meio.' },
  { id: 'muros', label: 'Muros', icon: 'wall', pick: 'line', min: 2, hint: 'Clique ao longo do muro. Enter termina (marque "Fechar" para ligar o último ao primeiro).' },
  { id: 'torre', label: 'Torre', icon: 'building', pick: 'center', min: 1, hint: '1º clique no centro, 2º clique define o raio (ou Enter para usar o raio do painel).' },
  { id: 'portao', label: 'Portão', icon: 'shield', pick: 'two', min: 2, hint: 'Clique nos dois lados da passagem.' },
  { id: 'telhado', label: 'Telhado', icon: 'home', pick: 'poly', min: 3, hint: 'Clique nos cantos da área coberta (alpendre ou mercado): telhado sobre pilares.' },
  { id: 'ponte', label: 'Ponte', icon: 'road', pick: 'two', min: 2, hint: 'Clique nas duas margens. A ponte liga os dois pontos com arcos e pilares até o chão.' },
];
export const STRUCT_TYPE_MAP = new Map(STRUCT_TYPES.map((t) => [t.id, t]));

export const SLOTS = [
  { id: 'parede', label: 'Parede (preenchimento)', cats: ['tijolo', 'pedra', 'madeira'] },
  { id: 'madeira', label: 'Madeira (estrutura)', cats: ['madeira'] },
  { id: 'base', label: 'Base / fundação', cats: ['pedra', 'tijolo'] },
  { id: 'telhado', label: 'Telhado', cats: ['telhado', 'madeira'] },
  { id: 'porta', label: 'Porta e janelas', cats: ['detalhe', 'madeira'] },
  { id: 'ferro', label: 'Ferragens', cats: ['detalhe'] },
];

export const BASE_PARAMS = {
  floors: 2, floorH: 3, thick: 0.35, baseH: 0.6, foundation: 0.8,
  roofType: 'duas', roofPitch: 40, overhang: 0.55,
  timber: 'superior', groundStone: false, postSpacing: 1.6,
  windows: true, windowSpacing: 3.2, door: true, shutters: true, chimney: true,
  width: 6, height: 8, crenels: true, towers: true, towerRadius: 3.2, sides: 12, keep: true, closed: true,
  arches: 3, bridgeStyle: 'pedra', railing: true,
  autoUV: true, collision: true, lod: true,
};

export const TYPE_PARAMS = {
  casa: {},
  castelo: { thick: 2.4, height: 9, towerRadius: 3.6, floors: 3, floorH: 4, roofType: 'ameias' },
  muros: { thick: 1.6, height: 6, towers: false, closed: false },
  torre: { floors: 3, floorH: 3.6, thick: 0.9, roofType: 'cone', roofPitch: 55, towerRadius: 3.2 },
  portao: { height: 7, thick: 3, towerRadius: 2.6 },
  telhado: { roofType: 'quatro', roofPitch: 30, height: 3, postSpacing: 3 },
  ponte: { width: 4, arches: 3, height: 1 },
};

export const PRESETS = {
  A: {
    label: 'A — Simples',
    hint: 'Tijolo envelhecido, madeira escura, base de pedra bruta e telha velha.',
    slots: { parede: { mat: 'tijolo_velho' }, madeira: { mat: 'madeira_escura' }, base: { mat: 'pedra_bruta' }, telhado: { mat: 'telha_velha' }, porta: { mat: 'porta_madeira' }, ferro: { mat: 'ferro_velho' } },
    weather: { colorVar: 0.4, wear: 0.35, moss: 0.25, dirt: 0.5, humidity: 0.3, damage: 0, grout: 0.6 },
    params: { timber: 'superior', groundStone: false },
  },
  B: {
    label: 'B — Rebocada',
    hint: 'Reboco caindo e mostrando o tijolo, madeira envelhecida, pedra talhada e telha cerâmica.',
    slots: { parede: { mat: 'reboco', blend: 'tijolo_velho', tint: '#efe6d6' }, madeira: { mat: 'madeira_velha' }, base: { mat: 'pedra_talhada' }, telhado: { mat: 'telha' }, porta: { mat: 'porta_madeira' }, ferro: { mat: 'ferro_velho' } },
    weather: { colorVar: 0.3, wear: 0.3, moss: 0.15, dirt: 0.4, humidity: 0.25, damage: 0.4, grout: 0.5 },
    params: { timber: 'todos', groundStone: false },
  },
  C: {
    label: 'C — Nobre',
    hint: 'Térreo de alvenaria pesada, reboco claro com madeira escura, telhado de ardósia.',
    slots: { parede: { mat: 'reboco', blend: 'pedra_talhada', tint: '#f6f0e4' }, madeira: { mat: 'madeira_escura', tint: '#b9a48c' }, base: { mat: 'alvenaria_pesada' }, telhado: { mat: 'ardosia' }, porta: { mat: 'porta_madeira' }, ferro: { mat: 'ferro_velho' } },
    weather: { colorVar: 0.2, wear: 0.12, moss: 0.08, dirt: 0.25, humidity: 0.12, damage: 0.08, grout: 0.45 },
    params: { timber: 'superior', groundStone: true, floors: 3 },
  },
};

const STONE_SLOTS = { parede: { mat: 'pedra_talhada' }, madeira: { mat: 'madeira_escura' }, base: { mat: 'bloco_antigo' }, telhado: { mat: 'ardosia' }, porta: { mat: 'porta_madeira' }, ferro: { mat: 'ferro_velho' } };
export const TYPE_SLOTS = {
  castelo: STONE_SLOTS,
  muros: { ...STONE_SLOTS, parede: { mat: 'alvenaria_pesada' } },
  torre: { ...STONE_SLOTS, parede: { mat: 'pedra' } },
  portao: STONE_SLOTS,
  ponte: { ...STONE_SLOTS, parede: { mat: 'pedra_bruta' }, madeira: { mat: 'madeira_velha' } },
  telhado: { ...PRESETS.A.slots, telhado: { mat: 'palha' } },
};

/** Estrutura nova com os padrões do tipo. */
export function newStructure(type, points, extra = {}) {
  const preset = PRESETS.A;
  return {
    id: extra.id,
    name: extra.name || STRUCT_TYPE_MAP.get(type)?.label || 'Construção',
    type,
    points: points.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]),
    params: { ...BASE_PARAMS, ...preset.params, ...TYPE_PARAMS[type], ...(extra.params || {}) },
    slots: JSON.parse(JSON.stringify(TYPE_SLOTS[type] || preset.slots)),
    weather: { ...preset.weather, normal: 1, parallax: 0.6 },
    variation: { uvOffset: true, randomRot: false },
    seed: extra.seed ?? Math.floor(Math.random() * 100000),
    profile: extra.profile || null,
    rev: 0,
  };
}

// ---------------------------------------------------------------- utilidades 2D/3D
const D2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dirV = (a, b) => { const l = D2(a, b) || 1; return v3((b[0] - a[0]) / l, 0, (b[1] - a[1]) / l); };

/**
 * Parede reta de a até b (centro da espessura na linha), com aberturas.
 * openings: [{u0, u1, v0, v1}] com u em metros desde a, v = altura absoluta.
 */
function wallRun(acc, slot, a, b, t, y0, y1, openings = [], { ext0 = 0, ext1 = 0 } = {}) {
  const L = D2(a, b);
  const d = dirV(a, b);
  const us = new Set([-ext0, L + ext1]);
  for (const o of openings) { us.add(Math.max(-ext0, o.u0)); us.add(Math.min(L + ext1, o.u1)); }
  const cuts = [...us].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const u0 = cuts[i], u1 = cuts[i + 1];
    if (u1 - u0 < 0.005) continue;
    const um = (u0 + u1) / 2;
    const holes = openings.filter((o) => o.u0 <= um && o.u1 >= um).map((o) => [Math.max(y0, o.v0), Math.min(y1, o.v1)]).sort((p, q) => p[0] - q[0]);
    let v = y0;
    const segs = [];
    for (const [h0, h1] of holes) { if (h0 > v) segs.push([v, h0]); v = Math.max(v, h1); }
    if (v < y1) segs.push([v, y1]);
    for (const [v0, v1] of segs) {
      if (v1 - v0 < 0.005) continue;
      const p = lerp2(a, b, um / L);
      acc.box(slot, p[0], (v0 + v1) / 2, p[1], u1 - u0, v1 - v0, t, d);
    }
  }
}

/** Ponto na face externa de uma parede (u ao longo, off para fora da linha central). */
function onWall(a, b, u, off, y) {
  const L = D2(a, b) || 1;
  const n = edgeNormal(a, b);
  return v3(a[0] + ((b[0] - a[0]) * u) / L + n[0] * off, y, a[1] + ((b[1] - a[1]) * u) / L + n[1] * off);
}

/** Laje fina: face de cima com o material do telhado, de baixo e bordas com madeira. */
function slab(acc, top, thick, topSlot = 'telhado', underSlot = 'madeira') {
  const n = new THREE.Vector3();
  for (let i = 0; i < top.length; i++) {
    const a = top[i], b = top[(i + 1) % top.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  n.normalize();
  const bot = top.map((p) => p.clone().addScaledVector(n, -thick));
  acc.poly(topSlot, top);
  acc.poly(underSlot, [...bot].reverse());
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length;
    acc.poly(underSlot, [bot[i], bot[j], top[j], top[i]]);
  }
}

/** Ameias (merlões) ao longo de uma linha, no topo y. */
function merlons(acc, slot, a, b, off, y, { w = 0.9, gap = 0.7, h = 1.1, depth = 0.55 } = {}) {
  const L = D2(a, b);
  const n = Math.max(1, Math.floor((L + gap) / (w + gap)));
  const used = n * w + (n - 1) * gap;
  const start = (L - used) / 2;
  const d = dirV(a, b);
  for (let i = 0; i < n; i++) {
    const u = start + i * (w + gap) + w / 2;
    const p = onWall(a, b, u, off, y + h / 2);
    acc.box(slot, p.x, p.y, p.z, w, h, depth, d);
  }
}

// ---------------------------------------------------------------- janelas, portas e enxaimel
function windowAt(acc, a, b, t, u, y0, w, h, { shutters = true, low = false } = {}) {
  if (low) return;
  const d = dirV(a, b);
  const ft = 0.1; // moldura
  const face = t / 2;
  // moldura (madeira) um pouco saliente
  const jamb = (uu) => { const p = onWall(a, b, uu, face + 0.02, y0 + h / 2); acc.box('madeira', p.x, p.y, p.z, ft, h + ft * 2, 0.12, d, { grain: v3(0, 1, 0) }); };
  jamb(u - w / 2 - ft / 2);
  jamb(u + w / 2 + ft / 2);
  const head = onWall(a, b, u, face + 0.02, y0 + h + ft / 2);
  acc.box('madeira', head.x, head.y, head.z, w, ft, 0.12, d, { grain: d });
  // peitoril de pedra
  const sill = onWall(a, b, u, face + 0.05, y0 - 0.05);
  acc.box('base', sill.x, sill.y, sill.z, w + 0.3, 0.1, 0.22, d);
  // vidro recuado e a cruz da janela
  const g = onWall(a, b, u, 0.02, y0 + h / 2);
  acc.box('vidro', g.x, g.y, g.z, w, h, 0.03, d);
  const mx = onWall(a, b, u, 0.06, y0 + h / 2);
  acc.box('madeira', mx.x, mx.y, mx.z, 0.05, h, 0.05, d, { grain: v3(0, 1, 0) });
  acc.box('madeira', mx.x, mx.y, mx.z, w, 0.05, 0.05, d, { grain: d });
  // venezianas abertas encostadas na parede
  if (shutters) {
    for (const s of [-1, 1]) {
      const p = onWall(a, b, u + s * (w / 2 + ft + w / 4 + 0.02), face + 0.04, y0 + h / 2);
      acc.box('porta', p.x, p.y, p.z, w / 2, h, 0.04, d);
    }
  }
}

function doorAt(acc, a, b, t, u, y0, w, h, ground) {
  const d = dirV(a, b);
  const face = t / 2;
  const ft = 0.14;
  for (const s of [-1, 1]) {
    const p = onWall(a, b, u + s * (w / 2 + ft / 2), face + 0.03, y0 + h / 2 + ft / 2);
    acc.box('madeira', p.x, p.y, p.z, ft, h + ft, 0.16, d, { grain: v3(0, 1, 0) });
  }
  const top = onWall(a, b, u, face + 0.03, y0 + h + ft / 2);
  acc.box('madeira', top.x, top.y, top.z, w + ft * 2, ft, 0.16, d, { grain: d });
  // folha da porta recuada
  const leaf = onWall(a, b, u, face - 0.12, y0 + h / 2);
  acc.box('porta', leaf.x, leaf.y, leaf.z, w, h, 0.07, d, { grain: v3(0, 1, 0) });
  // dobradiças e argola de ferro
  for (const yy of [0.35, h - 0.35]) {
    const p = onWall(a, b, u - w / 2 + 0.3, face - 0.07, y0 + yy);
    acc.box('ferro', p.x, p.y, p.z, 0.55, 0.06, 0.03, d);
  }
  const ring = onWall(a, b, u + w / 2 - 0.2, face - 0.06, y0 + h * 0.5);
  acc.box('ferro', ring.x, ring.y, ring.z, 0.08, 0.14, 0.04, d);
  // degrau de pedra
  const step = onWall(a, b, u, face + 0.3, (ground + y0) / 2);
  acc.box('base', step.x, step.y, step.z, w + 0.5, y0 - ground, 0.6, d);
}

/** Enxaimel numa parede: vigas horizontais, pilares (nas aberturas e a cada `spacing`) e mãos-francesas. */
function timberFrame(acc, a, b, t, y0, y1, openings, spacing, rnd) {
  const L = D2(a, b);
  const tw = 0.2, off = t / 2 + 0.02;
  const d = dirV(a, b);
  const beamH = (u0, u1, y) => {
    if (u1 - u0 < 0.05) return;
    const p = onWall(a, b, (u0 + u1) / 2, off, y);
    acc.box('madeira', p.x, p.y, p.z, u1 - u0, tw, 0.12, d, { grain: d });
  };
  const post = (u, ya, yb) => {
    if (yb - ya < 0.05) return;
    const p = onWall(a, b, u, off, (ya + yb) / 2);
    acc.box('madeira', p.x, p.y, p.z, tw, yb - ya, 0.12, d, { grain: v3(0, 1, 0) });
  };
  beamH(-t / 2, L + t / 2, y0 + tw / 2);
  beamH(-t / 2, L + t / 2, y1 - tw / 2);
  const ya = y0 + tw, yb = y1 - tw;
  // posições dos pilares
  const ops = openings.filter((o) => o.v1 > y0 && o.v0 < y1);
  const us = [tw / 2, L - tw / 2];
  for (const o of ops) us.push(o.u0 - tw / 2 - 0.1, o.u1 + tw / 2 + 0.1);
  us.sort((p, q) => p - q);
  const all = [];
  for (let i = 0; i < us.length; i++) {
    all.push(us[i]);
    const next = us[i + 1];
    if (next === undefined) break;
    const gap = next - us[i];
    const inside = ops.some((o) => us[i] >= o.u0 - 0.5 && next <= o.u1 + 0.5);
    if (inside) continue;
    const n = Math.floor(gap / spacing);
    for (let k = 1; k < n; k++) all.push(us[i] + (gap * k) / n);
  }
  const posts = [...new Set(all.map((u) => Math.round(u * 1000) / 1000))].filter((u) => u >= 0 && u <= L).sort((p, q) => p - q);
  for (const u of posts) {
    if (ops.some((o) => u > o.u0 && u < o.u1)) continue;
    post(u, ya, yb);
  }
  // travessas embaixo/em cima das janelas e mãos-francesas nos painéis cheios
  for (const o of ops) {
    if (o.v0 > ya + 0.1) beamH(o.u0 - 0.1, o.u1 + 0.1, o.v0 - tw / 2 - 0.05);
    if (o.v1 < yb - 0.1) beamH(o.u0 - 0.1, o.u1 + 0.1, o.v1 + tw / 2 + 0.05);
  }
  let flip = rnd() < 0.5;
  for (let i = 0; i < posts.length - 1; i++) {
    const u0 = posts[i] + tw / 2, u1 = posts[i + 1] - tw / 2;
    if (u1 - u0 < 0.5) continue;
    if (ops.some((o) => o.u1 > u0 && o.u0 < u1)) continue;
    const A = onWall(a, b, flip ? u0 : u1, off - 0.005, ya);
    const B = onWall(a, b, flip ? u1 : u0, off - 0.005, yb);
    acc.beam('madeira', A, B, tw * 0.85, 0.11, v3(-edgeNormal(a, b)[0], 0, -edgeNormal(a, b)[1]));
    flip = !flip;
  }
}

// ---------------------------------------------------------------- telhados
function gableRoof(acc, rect, top, p, low, wallSlot, thick) {
  const { c, d, a, b } = rect;
  const tan = Math.tan((p.roofPitch * Math.PI) / 180);
  const o = p.overhang, rt = 0.18;
  const s = [-d[1], d[0]];
  const P = (along, across, y) => v3(c[0] + d[0] * along + s[0] * across, y, c[1] + d[1] * along + s[1] * across);
  const yr = top + b * tan;
  const ye = top - o * tan;
  const A = a + o;
  for (const side of [1, -1]) {
    const q = side * (b + o);
    let pts = [P(-A, q, ye + rt), P(A, q, ye + rt), P(A, 0, yr + rt), P(-A, 0, yr + rt)];
    if (side < 0) pts = [P(A, q, ye + rt), P(-A, q, ye + rt), P(-A, 0, yr + rt), P(A, 0, yr + rt)];
    slab(acc, pts, rt);
  }
  // cumeeira
  if (!low) acc.beam('telhado', P(-A, 0, yr + rt + 0.02), P(A, 0, yr + rt + 0.02), 0.34, 0.16);
  // oitões (triângulos das pontas)
  for (const e of [1, -1]) {
    const x = e * (a - thick / 2);
    const tri = [P(x, -b, top), P(x, b, top), P(x, 0, yr)];
    const back = tri.map((q) => q.clone().add(v3(-d[0] * thick * e * 0.5, 0, -d[1] * thick * e * 0.5)));
    const front = tri.map((q) => q.clone().add(v3(d[0] * thick * e * 0.5, 0, d[1] * thick * e * 0.5)));
    acc.poly(wallSlot, e > 0 ? [...front].reverse() : front);
    acc.poly(wallSlot, e > 0 ? back : [...back].reverse());
    if (!low && p.timber !== 'nenhum') {
      const f = (x0, y0, x1, y1) => acc.beam('madeira', P(e * (a + 0.02), x0, y0), P(e * (a + 0.02), x1, y1), 0.18, 0.12);
      f(-b, top + 0.1, b, top + 0.1);
      f(0, top + 0.1, 0, yr - 0.05);
      f(-b * 0.55, top + 0.1, 0, top + (b * tan) * 0.62);
      f(b * 0.55, top + 0.1, 0, top + (b * tan) * 0.62);
    }
  }
  return yr + rt;
}

function hipRoof(acc, rect, top, p) {
  const { c, d, a, b } = rect;
  const tan = Math.tan((p.roofPitch * Math.PI) / 180);
  const o = p.overhang, rt = 0.18;
  const s = [-d[1], d[0]];
  const P = (along, across, y) => v3(c[0] + d[0] * along + s[0] * across, y + rt, c[1] + d[1] * along + s[1] * across);
  const A = a + o, Bw = b + o;
  const ye = top - o * tan, yr = top + b * tan;
  const r = Math.max(0, a - b);
  const E = [P(-A, Bw, ye), P(A, Bw, ye), P(A, -Bw, ye), P(-A, -Bw, ye)];
  const R0 = P(-r, 0, yr), R1 = P(r, 0, yr);
  slab(acc, [E[0], E[1], R1, R0], rt);
  slab(acc, [E[2], E[3], R0, R1], rt);
  slab(acc, [E[1], E[2], R1], rt);
  slab(acc, [E[3], E[0], R0], rt);
  if (r > 0.1) acc.beam('telhado', R0.clone().setY(yr + rt + 0.02), R1.clone().setY(yr + rt + 0.02), 0.32, 0.15);
  return yr + rt;
}

function tentRoof(acc, pts, top, p) {
  const tan = Math.tan((p.roofPitch * Math.PI) / 180);
  const o = p.overhang, rt = 0.18;
  const c = centroid(pts);
  let rin = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = edgeNormal(a, b);
    rin = Math.min(rin, Math.abs((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1]));
  }
  const ye = top - o * tan, ya = top + rin * tan;
  const eave = offsetPoly(pts, o).map((q) => v3(q[0], ye + rt, q[1]));
  const apex = v3(c[0], ya + rt, c[1]);
  for (let i = 0; i < eave.length; i++) slab(acc, [eave[i], eave[(i + 1) % eave.length], apex], rt);
  return ya + rt;
}

function coneRoof(acc, cx, cz, r, top, p, sides) {
  const tan = Math.tan((p.roofPitch * Math.PI) / 180);
  const o = p.overhang + 0.2, rt = 0.18;
  const R = r + o;
  const ye = top - o * tan, ya = top + r * tan;
  const n = Math.max(12, sides * 2);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const ang = (-i / n) * Math.PI * 2;
    ring.push(v3(cx + Math.cos(ang) * R, ye + rt, cz + Math.sin(ang) * R));
  }
  const apex = v3(cx, ya + rt, cz);
  for (let i = 0; i < n; i++) slab(acc, [ring[i], ring[(i + 1) % n], apex], rt);
  acc.beam('ferro', apex, apex.clone().setY(apex.y + 1.2), 0.08, 0.08);
  return ya + rt;
}

function flatRoof(acc, pts, top, p, crenel, wallSlot) {
  acc.prism('base', pts, top - 0.25, top, { top: true, sideSlot: wallSlot });
  if (crenel) {
    const para = offsetPoly(pts, -0.22);
    for (let i = 0; i < para.length; i++) {
      const a = para[i], b = para[(i + 1) % para.length];
      wallRun(acc, wallSlot, a, b, 0.45, top, top + 0.9, [], { ext0: 0.22, ext1: 0.22 });
      merlons(acc, wallSlot, a, b, 0, top + 0.9, { depth: 0.45 });
    }
  }
  return top + 2;
}

// ---------------------------------------------------------------- tipos
function house(acc, def, low, out) {
  const p = def.params;
  const rnd = rng(def.seed || 1);
  let orig = def.points;
  if (orig.length === 2) {
    // 2 cliques: a frente e a largura do painel para trás
    const [a, b] = orig;
    const n = edgeNormal(a, b);
    orig = [a, b, [b[0] - n[0] * p.width, b[1] - n[1] * p.width], [a[0] - n[0] * p.width, a[1] - n[1] * p.width]];
  }
  const pts = ccwXZ(orig);
  // o 1º lado clicado é a frente (porta)
  const same = (u, w) => Math.abs(u[0] - w[0]) < 1e-6 && Math.abs(u[1] - w[1]) < 1e-6;
  let front = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((same(a, orig[0]) && same(b, orig[1])) || (same(a, orig[1]) && same(b, orig[0]))) { front = i; break; }
  }
  const t = p.thick;
  const inner = offsetPoly(pts, -t / 2);
  const baseY = p.baseH;
  const topY = baseY + p.floors * p.floorH;
  // base / fundação de pedra
  acc.prism('base', offsetPoly(pts, 0.06), -p.foundation, baseY, { top: true });
  const n = inner.length;
  for (let i = 0; i < n; i++) {
    const a = inner[i], b = inner[(i + 1) % n];
    const L = D2(a, b);
    for (let f = 0; f < p.floors; f++) {
      const y0 = baseY + f * p.floorH, y1 = y0 + p.floorH;
      const ops = [];
      const isFront = i === front;
      if (!low && f === 0 && isFront && p.door && L > 2) ops.push({ u0: L / 2 - 0.6, u1: L / 2 + 0.6, v0: y0, v1: y0 + 2.2, door: true });
      if (!low && p.windows) {
        const cnt = Math.max(0, Math.floor((L - 0.6) / p.windowSpacing));
        for (let k = 0; k < cnt; k++) {
          const u = (L * (k + 0.5)) / cnt;
          const w = 0.9, h = Math.min(1.3, p.floorH - 1.3);
          const o = { u0: u - w / 2, u1: u + w / 2, v0: y0 + 0.95, v1: y0 + 0.95 + h };
          if (ops.some((q) => q.door && o.u1 > q.u0 - 0.6 && o.u0 < q.u1 + 0.6)) continue;
          if (h > 0.5) ops.push(o);
        }
      }
      const stoneFloor = p.groundStone && f === 0;
      wallRun(acc, stoneFloor ? 'base' : 'parede', a, b, t, y0, y1, ops, { ext0: t / 2, ext1: t / 2 });
      for (const o of ops) {
        if (o.door) doorAt(acc, a, b, t, (o.u0 + o.u1) / 2, o.v0, o.u1 - o.u0, o.v1 - o.v0, -p.foundation);
        else windowAt(acc, a, b, t, (o.u0 + o.u1) / 2, o.v0, o.u1 - o.u0, o.v1 - o.v0, { shutters: p.shutters });
      }
      const timbered = !low && !stoneFloor && (p.timber === 'todos' || (p.timber === 'superior' && f > 0));
      if (timbered) timberFrame(acc, a, b, t, y0, y1, ops, p.postSpacing, rnd);
      // viga de piso entre andares
      if (!low && f > 0 && !timbered) {
        const q = onWall(a, b, L / 2, t / 2 + 0.03, y0);
        acc.box('madeira', q.x, q.y, q.z, L + t, 0.18, 0.1, dirV(a, b), { grain: dirV(a, b) });
      }
    }
    out.colliders.push({ a: pts[i], b: pts[(i + 1) % n], t: 0.2, h: topY });
  }
  // pilares dos cantos (madeira no enxaimel, pedra no resto)
  if (!low) {
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const cn = offsetPoly(pts, -0.1)[i];
      const slot = p.timber !== 'nenhum' ? 'madeira' : 'base';
      acc.beam(slot, v3(cn[0], baseY + (p.groundStone && slot === 'madeira' ? p.floorH : 0), cn[1]), v3(cn[0], topY, cn[1]), 0.26, 0.26);
      void q;
    }
  }
  // telhado
  const rect = asRectangle(pts);
  let peak = topY;
  if (p.roofType === 'plano' || p.roofType === 'ameias') peak = flatRoof(acc, pts, topY, p, p.roofType === 'ameias', 'parede');
  else if (rect && p.roofType === 'duas') peak = gableRoof(acc, rect, topY, p, low, 'parede', t);
  else if (rect) peak = hipRoof(acc, rect, topY, p);
  else if (isConvex(pts)) peak = tentRoof(acc, pts, topY, p);
  else peak = flatRoof(acc, pts, topY, p, false, 'parede');
  // chaminé
  if (!low && p.chimney && rect && p.roofType !== 'plano' && p.roofType !== 'ameias') {
    const { c, d, a, b } = rect;
    const s = [-d[1], d[0]];
    const x = c[0] + d[0] * a * 0.5 + s[0] * b * 0.35, z = c[1] + d[1] * a * 0.5 + s[1] * b * 0.35;
    acc.box('base', x, (topY + peak + 1) / 2, z, 0.75, peak + 1 - topY, 0.75, v3(d[0], 0, d[1]));
    acc.box('base', x, peak + 1.05, z, 0.95, 0.12, 0.95, v3(d[0], 0, d[1]));
  }
  out.height = peak;
}

function roofOnly(acc, def, low, out) {
  const p = def.params;
  const pts = ccwXZ(def.points);
  const top = p.height;
  for (const q of offsetPoly(pts, -0.15)) acc.beam('madeira', v3(q[0], -0.3, q[1]), v3(q[0], top, q[1]), 0.28, 0.28);
  // vigas do contorno e pilares intermediários
  for (let i = 0; i < pts.length; i++) {
    const a = offsetPoly(pts, -0.15)[i], b = offsetPoly(pts, -0.15)[(i + 1) % pts.length];
    acc.beam('madeira', v3(a[0], top - 0.12, a[1]), v3(b[0], top - 0.12, b[1]), 0.26, 0.24);
    const L = D2(a, b);
    const cnt = Math.floor(L / Math.max(1.5, p.postSpacing));
    for (let k = 1; k < cnt; k++) {
      const q = lerp2(a, b, k / cnt);
      acc.beam('madeira', v3(q[0], -0.3, q[1]), v3(q[0], top, q[1]), 0.22, 0.22);
    }
  }
  const rect = asRectangle(pts);
  const peak = rect && p.roofType === 'duas' ? gableRoofOpen(acc, rect, top, p) : rect ? hipRoof(acc, rect, top, p) : isConvex(pts) ? tentRoof(acc, pts, top, p) : flatRoof(acc, pts, top, p, false, 'madeira');
  out.height = peak;
  void low;
}

function gableRoofOpen(acc, rect, top, p) {
  // duas águas sem oitão de parede (alpendre): só tesouras de madeira
  const peak = gableRoof(acc, rect, top, { ...p, timber: 'nenhum' }, true, 'madeira', 0.2);
  return peak;
}

function towerAt(acc, cx, cz, r, p, { floors, floorH, low, door = true, top = 'cone', sides = 12, wallSlot = 'parede', out = null, doorDir = 0 }) {
  const n = Math.max(6, sides);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (-i / n) * Math.PI * 2 + doorDir;
    pts.push([cx + Math.cos(ang) * r, cz + Math.sin(ang) * r]);
  }
  const t = Math.min(p.thick, r * 0.45);
  const baseY = 0.4;
  const topY = baseY + floors * floorH;
  acc.prism('base', offsetPoly(ccwXZ(pts), 0.15), -p.foundation, baseY, { top: true });
  const inner = offsetPoly(ccwXZ(pts), -t / 2);
  const m = inner.length;
  for (let i = 0; i < m; i++) {
    const a = inner[i], b = inner[(i + 1) % m];
    const L = D2(a, b);
    for (let f = 0; f < floors; f++) {
      const y0 = baseY + f * floorH, y1 = y0 + floorH;
      const ops = [];
      if (!low && door && f === 0 && i === 0) ops.push({ u0: L / 2 - 0.55, u1: L / 2 + 0.55, v0: y0, v1: y0 + 2.3, door: true });
      else if (!low && f > 0 && i % 3 === f % 3) ops.push({ u0: L / 2 - 0.2, u1: L / 2 + 0.2, v0: y0 + 1, v1: y0 + 2.2, slit: true });
      wallRun(acc, wallSlot, a, b, t, y0, y1, ops, { ext0: t * 0.3, ext1: t * 0.3 });
      for (const o of ops) {
        if (o.door) doorAt(acc, a, b, t, L / 2, o.v0, o.u1 - o.u0, o.v1 - o.v0, -p.foundation);
        else {
          const g = onWall(a, b, L / 2, -t * 0.2, (o.v0 + o.v1) / 2);
          acc.box('vidro', g.x, g.y, g.z, o.u1 - o.u0, o.v1 - o.v0, 0.03, dirV(a, b));
        }
      }
    }
    if (out) out.colliders.push({ a: pts[i], b: pts[(i + 1) % m], t: 0.3, h: topY });
  }
  // cinta de pedra e topo
  if (!low) {
    for (let f = 1; f < floors; f++) acc.prism('base', offsetPoly(ccwXZ(pts), 0.06), baseY + f * floorH - 0.12, baseY + f * floorH + 0.12, { top: false });
  }
  let peak;
  if (top === 'cone') peak = coneRoof(acc, cx, cz, r, topY, p, n);
  else {
    acc.prism(wallSlot, ccwXZ(pts), topY - 0.2, topY + 0.05, { top: true });
    const ring = offsetPoly(ccwXZ(pts), 0.25);
    acc.prism('base', ring, topY - 0.25, topY + 0.05, { top: true });
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      wallRun(acc, wallSlot, a, b, 0.5, topY + 0.05, topY + 1, [], { ext0: 0.25, ext1: 0.25 });
      if (!low) merlons(acc, wallSlot, a, b, 0, topY + 1, { depth: 0.5, w: 0.8, gap: 0.6 });
    }
    peak = topY + 2.1;
  }
  return peak;
}

function tower(acc, def, low, out) {
  const p = def.params;
  const [c, e] = def.points;
  const r = e ? Math.max(1.2, D2(c, e)) : p.towerRadius;
  out.height = towerAt(acc, c[0], c[1], r, p, { floors: p.floors, floorH: p.floorH, low, top: p.roofType === 'cone' ? 'cone' : 'ameias', sides: p.sides, out });
}

/** Muro reto com passarela e ameias. */
function curtain(acc, a, b, p, low, out, { gapAt = null } = {}) {
  const t = p.thick, H = p.height;
  const L = D2(a, b);
  const ops = gapAt ? [{ u0: gapAt - 2.2, u1: gapAt + 2.2, v0: -1, v1: 5.2, gate: true }] : [];
  wallRun(acc, 'parede', a, b, t, -p.foundation, H, ops, { ext0: t / 2, ext1: t / 2 });
  // base mais larga (sapata)
  wallRun(acc, 'base', a, b, t + 0.5, -p.foundation, 0.6, ops, { ext0: t / 2 + 0.25, ext1: t / 2 + 0.25 });
  if (p.crenels) {
    const n = edgeNormal(a, b);
    const oa = [a[0] + (n[0] * (t / 2 - 0.25)), a[1] + (n[1] * (t / 2 - 0.25))];
    const ob = [b[0] + (n[0] * (t / 2 - 0.25)), b[1] + (n[1] * (t / 2 - 0.25))];
    wallRun(acc, 'parede', oa, ob, 0.5, H, H + 0.9, [], { ext0: 0.25, ext1: 0.25 });
    if (!low) merlons(acc, 'parede', oa, ob, 0, H + 0.9, { depth: 0.5 });
  }
  if (gapAt !== null && !low) {
    // portão de madeira e grade levadiça
    const d = dirV(a, b);
    for (const s of [-1, 1]) {
      const q = onWall(a, b, gapAt + s * 1.1, -t * 0.1, 2.4);
      acc.box('porta', q.x, q.y, q.z, 2.1, 4.8, 0.12, d, { grain: v3(0, 1, 0) });
    }
    const pc = onWall(a, b, gapAt, t * 0.3, 4.4);
    for (let k = -4; k <= 4; k++) {
      const q = pc.clone().addScaledVector(d, k * 0.5);
      acc.box('ferro', q.x, q.y, q.z, 0.06, 1.6, 0.06, d);
    }
    for (const yy of [3.8, 4.4, 5]) acc.box('ferro', pc.x, yy, pc.z, 4.2, 0.06, 0.06, d);
    const lin = onWall(a, b, gapAt, 0, 5.4);
    acc.box('base', lin.x, lin.y, lin.z, 4.8, 0.45, t + 0.1, d);
  }
  const segs = gapAt === null ? [[0, L]] : [[0, gapAt - 2.2], [gapAt + 2.2, L]];
  for (const [u0, u1] of segs) if (u1 - u0 > 0.1) out.colliders.push({ a: lerp2(a, b, u0 / L), b: lerp2(a, b, u1 / L), t, h: H });
}

function walls(acc, def, low, out) {
  const p = def.params;
  const pts = def.points;
  const closed = p.closed && pts.length > 2;
  const list = closed ? ccwXZ(pts) : pts;
  const m = closed ? list.length : list.length - 1;
  for (let i = 0; i < m; i++) curtain(acc, list[i], list[(i + 1) % list.length], p, low, out);
  if (p.towers) for (const q of list) towerAt(acc, q[0], q[1], p.towerRadius, { ...p, thick: 1 }, { floors: 1, floorH: p.height + 1.5, low, door: false, top: 'ameias', sides: 10, out });
  out.height = p.height + 3;
}

function castle(acc, def, low, out) {
  const p = def.params;
  const pts = ccwXZ(def.points);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const gate = i === 0 && D2(a, b) > 8 ? D2(a, b) / 2 : null;
    curtain(acc, a, b, p, low, out, { gapAt: gate });
  }
  if (p.towers) for (const q of pts) towerAt(acc, q[0], q[1], p.towerRadius, { ...p, thick: 1.1 }, { floors: 1, floorH: p.height + 4, low, door: false, top: p.roofType === 'cone' ? 'cone' : 'ameias', sides: 12, out });
  // torre de menagem no meio
  if (p.keep) {
    const c = centroid(pts);
    let rin = Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const nn = edgeNormal(a, b);
      rin = Math.min(rin, Math.abs((c[0] - a[0]) * nn[0] + (c[1] - a[1]) * nn[1]));
    }
    const h = Math.max(4, Math.min(11, rin * 0.45));
    const keepDef = { points: [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]], seed: def.seed, params: { ...p, thick: 0.9, timber: 'nenhum', groundStone: false, roofType: 'quatro', windowSpacing: 3.5, chimney: false, shutters: false, door: true } };
    const sub = { colliders: [] };
    house(acc, keepDef, low, sub);
    out.colliders.push(...sub.colliders);
    out.height = Math.max(p.height + 6, sub.height);
  } else out.height = p.height + 6;
}

function gatehouse(acc, def, low, out) {
  const p = def.params;
  const [a, b] = def.points;
  const L = D2(a, b);
  const d = dirV(a, b);
  const r = p.towerRadius;
  for (const q of [a, b]) towerAt(acc, q[0], q[1], r, { ...p, thick: 1 }, { floors: 1, floorH: p.height + 3, low, door: false, top: 'ameias', sides: 12, out });
  // bloco sobre a passagem
  const n = edgeNormal(a, b);
  const t = p.thick;
  const inner = [a[0] + d.x * r * 0.7, a[1] + d.z * r * 0.7], innerB = [b[0] - d.x * r * 0.7, b[1] - d.z * r * 0.7];
  const span = D2(inner, innerB);
  const gw = Math.min(4.4, span - 1);
  const ops = [{ u0: span / 2 - gw / 2, u1: span / 2 + gw / 2, v0: -1, v1: 5.2 }];
  wallRun(acc, 'parede', inner, innerB, t, -p.foundation, p.height, ops);
  if (p.crenels) {
    for (const s of [1, -1]) {
      const oa = [inner[0] + n[0] * s * (t / 2 - 0.25), inner[1] + n[1] * s * (t / 2 - 0.25)];
      const ob = [innerB[0] + n[0] * s * (t / 2 - 0.25), innerB[1] + n[1] * s * (t / 2 - 0.25)];
      wallRun(acc, 'parede', oa, ob, 0.5, p.height, p.height + 0.9);
      if (!low) merlons(acc, 'parede', oa, ob, 0, p.height + 0.9, { depth: 0.5 });
    }
  }
  if (!low) {
    const lin = onWall(inner, innerB, span / 2, 0, 5.4);
    acc.box('base', lin.x, lin.y, lin.z, gw + 0.6, 0.45, t + 0.1, d);
    for (const s of [-1, 1]) {
      const q = onWall(inner, innerB, span / 2 + s * (gw / 4), -t * 0.35, 2.4);
      acc.box('porta', q.x, q.y, q.z, gw / 2 - 0.05, 4.8, 0.12, d, { grain: v3(0, 1, 0) });
    }
    const pc = onWall(inner, innerB, span / 2, t * 0.35, 4.2);
    for (let k = -4; k <= 4; k++) {
      const q = pc.clone().addScaledVector(d, (k * gw) / 9);
      acc.box('ferro', q.x, q.y, q.z, 0.06, 2, 0.06, d);
    }
    for (const yy of [3.4, 4.2, 5]) acc.box('ferro', pc.x, yy, pc.z, gw, 0.06, 0.06, d);
  }
  out.colliders.push({ a: inner, b: lerp2(inner, innerB, (span / 2 - gw / 2) / span), t, h: p.height }, { a: lerp2(inner, innerB, (span / 2 + gw / 2) / span), b: innerB, t, h: p.height });
  out.height = p.height + 4;
  void L;
}

function bridge(acc, def, low, out) {
  const p = def.params;
  const [a, b] = def.points;
  const L = D2(a, b);
  const d = dirV(a, b);
  const W = p.width;
  const prof = def.profile || [0, 0];
  const groundAt = (u) => {
    const k = (u / L) * (prof.length - 1);
    const i = Math.max(0, Math.min(prof.length - 2, Math.floor(k)));
    const f = k - i;
    return prof[i] * (1 - f) + prof[i + 1] * f;
  };
  const deckY = Math.max(prof[0], prof[prof.length - 1]) + 0.35;
  const rise = Math.min(2.5, L * 0.06) * (p.bridgeStyle === 'pedra' ? 1 : 0.3);
  const yAt = (u) => deckY + Math.sin((u / L) * Math.PI) * rise;
  const low2 = Math.min(...prof) - 1.5;
  const n = edgeNormal(a, b);
  const P = (u, side, y) => v3(a[0] + d.x * u + n[0] * side, y, a[1] + d.z * u + n[1] * side);
  const segs = Math.max(8, Math.round(L / 1.2));
  // tabuleiro
  const deckSlot = p.bridgeStyle === 'pedra' ? 'base' : 'madeira';
  for (let i = 0; i < segs; i++) {
    const u0 = (L * i) / segs, u1 = (L * (i + 1)) / segs;
    const top = [P(u0, W / 2, yAt(u0)), P(u1, W / 2, yAt(u1)), P(u1, -W / 2, yAt(u1)), P(u0, -W / 2, yAt(u0))];
    slab(acc, top, 0.4, deckSlot, deckSlot === 'base' ? 'parede' : 'madeira');
  }
  if (p.bridgeStyle === 'pedra') {
    // paredes laterais com arcos (forma extrudada)
    const N = Math.max(1, p.arches | 0);
    const shape = new THREE.Shape();
    shape.moveTo(0, yAt(0) - 0.4);
    for (let i = 1; i <= segs; i++) shape.lineTo((L * i) / segs, yAt((L * i) / segs) - 0.4);
    shape.lineTo(L, low2);
    shape.lineTo(0, low2);
    shape.closePath();
    const pier = Math.max(0.8, L * 0.06);
    const span = (L - pier * (N + 1)) / N;
    for (let k = 0; k < N; k++) {
      const x0 = pier + k * (span + pier), x1 = x0 + span;
      const cx = (x0 + x1) / 2;
      const crown = yAt(cx) - 1.2;
      const springY = Math.min(crown - 0.6, Math.max(low2 + 0.3, Math.min(groundAt(x0), groundAt(x1)) - 0.2));
      if (springY < low2 + 0.2 || span < 1) continue;
      const ry = crown - springY;
      const hole = new THREE.Path();
      hole.moveTo(x0, low2 + 0.05);
      hole.lineTo(x1, low2 + 0.05);
      hole.lineTo(x1, springY);
      hole.absellipse(cx, springY, span / 2, ry, 0, Math.PI, false);
      hole.lineTo(x0, low2 + 0.05);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 10 });
    // forma no plano (u, y) extrudada em z -> para o espaço da ponte
    const m = new THREE.Matrix4().makeBasis(d, v3(0, 1, 0), v3(n[0], 0, n[1])).setPosition(a[0] - n[0] * W / 2, 0, a[1] - n[1] * W / 2);
    acc.addGeometry('parede', geo, m);
    geo.dispose();
    if (p.railing) {
      for (const s of [1, -1]) {
        for (let i = 0; i < segs; i++) {
          const u0 = (L * i) / segs, u1 = (L * (i + 1)) / segs;
          const A = P(u0, s * (W / 2 - 0.2), yAt(u0) + 0.45), B = P(u1, s * (W / 2 - 0.2), yAt(u1) + 0.45);
          acc.beam('parede', A, B, 0.4, 0.9);
          if (!low) acc.beam('base', A.clone().setY(A.y + 0.5), B.clone().setY(B.y + 0.5), 0.5, 0.12);
        }
      }
    }
  } else {
    // ponte de madeira sobre estacas
    const cnt = Math.max(2, Math.round(L / Math.max(2, p.postSpacing * 2)));
    for (let k = 0; k <= cnt; k++) {
      const u = (L * k) / cnt;
      for (const s of [1, -1]) {
        const top = P(u, s * (W / 2 - 0.15), yAt(u) - 0.35);
        const bot = P(u, s * (W / 2 - 0.15), Math.min(groundAt(u) - 0.6, top.y - 0.5));
        acc.beam('madeira', bot, top, 0.3, 0.3);
        if (p.railing) acc.beam('madeira', P(u, s * (W / 2 - 0.1), yAt(u)), P(u, s * (W / 2 - 0.1), yAt(u) + 1.05), 0.14, 0.14);
      }
      if (k < cnt && !low) {
        const u2 = (L * (k + 1)) / cnt;
        acc.beam('madeira', P(u, W / 2 - 0.15, groundAt(u) * 0.5 + yAt(u) * 0.5 - 0.4), P(u2, -W / 2 + 0.15, yAt(u2) - 0.45), 0.14, 0.14);
      }
    }
    if (p.railing) {
      for (const s of [1, -1]) {
        for (let i = 0; i < segs; i++) {
          const u0 = (L * i) / segs, u1 = (L * (i + 1)) / segs;
          acc.beam('madeira', P(u0, s * (W / 2 - 0.1), yAt(u0) + 1.05), P(u1, s * (W / 2 - 0.1), yAt(u1) + 1.05), 0.12, 0.1);
          if (!low) acc.beam('ferro', P(u0, s * (W / 2 - 0.1), yAt(u0) + 0.55), P(u1, s * (W / 2 - 0.1), yAt(u1) + 0.55), 0.03, 0.03);
        }
      }
    }
  }
  out.deck = { a, b, w: W, y0: yAt(0), y1: yAt(L), rise };
  out.height = deckY + rise + 1.5;
}

const GENERATORS = { casa: house, castelo: castle, muros: walls, torre: tower, portao: gatehouse, telhado: roofOnly, ponte: bridge };

/**
 * Gera as geometrias da construção.
 * @returns {{geos: Map<string, THREE.BufferGeometry>, low: Map|null, colliders: object[], deck: object|null, height: number}}
 */
export function generateStructure(def) {
  const gen = GENERATORS[def.type] || house;
  const out = { colliders: [], deck: null, height: 0 };
  const acc = new GeoAcc();
  gen(acc, def, false, out);
  let low = null;
  if (def.params.lod && def.type !== 'ponte') {
    const accL = new GeoAcc();
    gen(accL, def, true, { colliders: [], deck: null, height: 0 });
    low = accL.build();
  }
  return { geos: acc.build(), low, colliders: def.params.collision ? out.colliders : [], deck: out.deck, height: out.height };
}
