// Biblioteca de peças prontas para montar cidades (estilo "arrastar e soltar" do UnrealEd 2).
// Tudo é gerado por código, em metros, então não precisa de arquivos de modelo.
import * as THREE from 'three';
import { rng } from '../core/util.js';

const matCache = new Map();
export function mat(color, { rough = 0.85, metal = 0, emissive = null, flat = false, opacity = 1 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${flat}|${opacity}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1.6; }
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
    m.name = key;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const M = {
  stone: () => mat('#b5ad9e', { rough: 0.92 }),
  darkStone: () => mat('#7d776d', { rough: 0.95 }),
  plaster: () => mat('#e6dcc6', { rough: 0.9 }),
  wood: () => mat('#7a5534', { rough: 0.85 }),
  darkWood: () => mat('#4a3322', { rough: 0.85 }),
  metal: () => mat('#5f6168', { rough: 0.45, metal: 0.7 }),
  gold: () => mat('#c9a33a', { rough: 0.35, metal: 0.9 }),
  glass: () => mat('#1d2633', { rough: 0.2, metal: 0.3 }),
  water: () => mat('#3a86a8', { rough: 0.05, metal: 0.1, opacity: 0.85 }),
  lantern: () => mat('#ffcf73', { rough: 0.4, emissive: '#ffb347' }),
  foliage: (c) => mat(c || '#3f6e2a', { rough: 0.9, flat: true }),
  bronze: () => mat('#8a6a3c', { rough: 0.4, metal: 0.8 }),
  magic: () => mat('#6fd3ff', { rough: 0.3, emissive: '#38b6ff' }),
};

function mesh(geo, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0, ry = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, ry);
const cyl = (rt, rb, h, seg, m, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
const cone = (r, h, seg, m, x = 0, y = 0, z = 0) => mesh(new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z);

// Telhado de duas águas (prisma triangular) ao longo de Z.
function gable(w, d, h, m, y) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return mesh(g, m, 0, y, 0);
}

function house(color, seed, big = false) {
  const g = new THREE.Group();
  const W = big ? 11 : 8, D = big ? 9 : 6, H = big ? 7.5 : 4.5;
  g.add(box(W + 0.4, 0.6, D + 0.4, M.darkStone()));
  g.add(box(W, H, D, M.plaster(), 0, 0.6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.3, H, 0.3, M.darkWood(), sx * (W / 2 - 0.1), 0.6, sz * (D / 2 - 0.1)));
  g.add(box(W + 0.1, 0.25, 0.3, M.darkWood(), 0, 0.6 + H * 0.5, D / 2 - 0.1));
  g.add(gable(W + 1, D + 1.2, big ? 4 : 3, mat(color || '#8b2e24', { rough: 0.8 }), 0.6 + H));
  g.add(box(1.4, 2.3, 0.15, M.darkWood(), 0, 0.6, D / 2 + 0.03));
  for (const sx of big ? [-3.2, 3.2] : [-2.5, 2.5]) {
    g.add(box(1.2, 1.1, 0.1, M.glass(), sx, 2.2, D / 2 + 0.04));
    g.add(box(1.4, 0.15, 0.2, M.darkWood(), sx, 2.1, D / 2 + 0.05));
    if (big) g.add(box(1.2, 1.1, 0.1, M.glass(), sx, 5.2, D / 2 + 0.04));
  }
  g.add(box(0.9, 3, 0.9, M.darkStone(), W / 2 - 1.5, 0.6 + H + 0.5, -D / 4));
  if (big) {
    // placa da taverna
    g.add(box(0.12, 0.12, 1.4, M.darkWood(), W / 2 - 1, 4.2, D / 2 + 0.7));
    g.add(box(0.1, 0.9, 1.1, M.wood(), W / 2 - 1, 3.2, D / 2 + 0.9));
  }
  return g;
}

function tower(color) {
  const g = new THREE.Group();
  g.add(cyl(3.2, 3.5, 1, 12, M.darkStone()));
  g.add(cyl(3, 3.2, 13, 12, M.stone(), 0, 1));
  g.add(cyl(3.5, 3.5, 1.2, 12, M.darkStone(), 0, 14));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i % 2 === 0) g.add(box(0.8, 1, 0.6, M.stone(), Math.cos(a) * 3.2, 15.2, Math.sin(a) * 3.2, -a));
  }
  g.add(cone(3.9, 5.5, 12, mat(color || '#2f4a78', { rough: 0.75 }), 0, 15.2));
  for (const y of [5, 9]) g.add(box(0.35, 1.3, 0.2, M.glass(), 0, y, 3.05));
  g.add(box(1.4, 2.4, 0.2, M.darkWood(), 0, 1, 3.1));
  return g;
}

function wall() {
  const g = new THREE.Group();
  g.add(box(8, 6, 1.8, M.stone()));
  g.add(box(8.02, 0.6, 1.9, M.darkStone(), 0, 0));
  for (let x = -3.5; x <= 3.5; x += 1.4) {
    g.add(box(0.8, 1, 0.5, M.stone(), x, 6, 0.65));
    g.add(box(0.8, 1, 0.5, M.stone(), x, 6, -0.65));
  }
  return g;
}

function gate(color) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(box(3, 10, 3.2, M.stone(), sx * 4.5, 0, 0));
    g.add(box(3.4, 1, 3.6, M.darkStone(), sx * 4.5, 10, 0));
    g.add(cone(2.4, 3, 4, mat(color || '#2f4a78'), sx * 4.5, 11, 0));
  }
  g.add(box(6, 2.5, 3, M.stone(), 0, 7.5, 0));
  g.add(box(6.2, 0.4, 3.2, M.darkStone(), 0, 10, 0));
  for (const sx of [-1, 1]) g.add(box(2.9, 7.2, 0.25, M.darkWood(), sx * 1.5, 0, 0.2, sx * 0.5));
  for (let x = -2.5; x <= 2.5; x += 1) g.add(box(0.08, 2, 0.08, M.metal(), x, 5.5, -0.8));
  return g;
}

function fountain() {
  const g = new THREE.Group();
  g.add(cyl(3.2, 3.4, 0.9, 8, M.stone()));
  g.add(cyl(2.8, 2.8, 0.05, 16, M.water(), 0, 0.75));
  g.add(cyl(0.35, 0.45, 2.2, 10, M.stone(), 0, 0.9));
  g.add(cyl(1.2, 0.5, 0.35, 12, M.stone(), 0, 3));
  g.add(cyl(1.05, 1.05, 0.04, 16, M.water(), 0, 3.3));
  g.add(mesh(new THREE.SphereGeometry(0.35, 16, 12), M.gold(), 0, 3.9, 0));
  return g;
}

function lamp() {
  const g = new THREE.Group();
  g.add(cyl(0.18, 0.22, 0.3, 8, M.darkStone()));
  g.add(cyl(0.07, 0.09, 3.2, 8, M.metal(), 0, 0.3));
  g.add(box(0.8, 0.06, 0.06, M.metal(), 0.35, 3.3, 0));
  g.add(box(0.3, 0.42, 0.3, M.lantern(), 0.7, 2.9, 0));
  g.add(cone(0.26, 0.2, 4, M.metal(), 0.7, 3.32, 0));
  return g;
}

function tree(color, seed) {
  const r = rng(seed || 1);
  const g = new THREE.Group();
  const h = 3.5 + r() * 1.5;
  g.add(cyl(0.22, 0.38, h, 7, mat('#5b4030', { rough: 0.95 })));
  const blobs = 3 + Math.floor(r() * 2);
  for (let i = 0; i < blobs; i++) {
    const rad = 1.4 + r() * 1.1;
    const geo = new THREE.IcosahedronGeometry(rad, 1);
    g.add(mesh(geo, M.foliage(color), (r() - 0.5) * 1.8, h + (r() - 0.2) * 1.4, (r() - 0.5) * 1.8));
  }
  return g;
}

function pine(color, seed) {
  const r = rng(seed || 2);
  const g = new THREE.Group();
  const s = 0.8 + r() * 0.5;
  g.add(cyl(0.18 * s, 0.3 * s, 2 * s, 6, mat('#4b3526')));
  for (let i = 0; i < 4; i++) {
    const rad = (2.6 - i * 0.55) * s;
    g.add(cone(rad, 2.6 * s, 8, M.foliage(color || '#2b4d2a'), 0, (1.4 + i * 1.5) * s));
  }
  return g;
}

function rock(color, seed) {
  const r = rng(seed || 3);
  const geo = new THREE.IcosahedronGeometry(1.4, 1);
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.75 + r() * 0.5);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k * 1.2, p.getY(i) * k * 0.75, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(mesh(geo, mat(color || '#8a8580', { rough: 0.95, flat: true }), 0, 0.6, 0));
  return g;
}

function bush(color, seed) {
  const r = rng(seed || 4);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(mesh(new THREE.IcosahedronGeometry(0.6 + r() * 0.4, 1), M.foliage(color || '#4a7d2f'), (r() - 0.5) * 1.1, 0.5 + r() * 0.2, (r() - 0.5) * 1.1));
  }
  return g;
}

function stall(color) {
  const g = new THREE.Group();
  for (const sx of [-1.4, 1.4]) for (const sz of [-1, 1]) g.add(box(0.12, 2.6, 0.12, M.darkWood(), sx, 0, sz));
  g.add(box(3, 0.9, 1.2, M.wood(), 0, 0, 0.3));
  const aw = box(3.3, 0.08, 2.6, mat(color || '#b8412e', { rough: 0.9 }), 0, 2.6, 0.2);
  aw.rotation.x = -0.18;
  g.add(aw);
  g.add(box(0.5, 0.35, 0.4, M.gold(), -0.8, 0.9, 0.3));
  g.add(box(0.5, 0.4, 0.4, M.darkWood(), 0.6, 0.9, 0.3));
  return g;
}

function statue() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.4, 2.2, M.stone()));
  g.add(box(2.5, 0.25, 2.5, M.darkStone(), 0, 1.4));
  const b = M.bronze();
  for (const sx of [-0.18, 0.18]) g.add(cyl(0.13, 0.15, 1.1, 8, b, sx, 1.65));
  g.add(cyl(0.3, 0.25, 1.0, 10, b, 0, 2.75));
  g.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), b, 0, 4.0, 0));
  g.add(cyl(0.08, 0.08, 0.9, 6, b, -0.42, 2.9));
  const arm = cyl(0.08, 0.08, 0.9, 6, b, 0.42, 3.1);
  arm.rotation.z = -0.9;
  g.add(arm);
  g.add(box(0.08, 1.6, 0.03, M.metal(), 0.95, 3.5, 0));
  return g;
}

function flag(color) {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.4, 0.4, 8, M.darkStone()));
  g.add(cyl(0.07, 0.09, 8, 8, M.darkWood(), 0, 0.4));
  g.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), M.gold(), 0, 8.5, 0));
  // ponto onde o tecido é preso (a simulação é criada pelo editor da cidade)
  const anchor = new THREE.Object3D();
  anchor.name = 'ancora_tecido';
  anchor.position.set(0.08, 8.2, 0);
  g.add(anchor);
  g.userData.cloth = { width: 2.6, length: 1.7, color: color || '#8a1c2b' };
  return g;
}

function crate() {
  const g = new THREE.Group();
  g.add(box(1, 1, 1, M.wood()));
  for (const y of [0, 0.92]) g.add(box(1.04, 0.08, 1.04, M.darkWood(), 0, y));
  return g;
}

function barrel() {
  const g = new THREE.Group();
  g.add(cyl(0.42, 0.42, 1.1, 14, M.wood()));
  g.add(cyl(0.47, 0.47, 0.25, 14, M.wood(), 0, 0.42));
  for (const y of [0.12, 0.9]) g.add(cyl(0.44, 0.44, 0.06, 14, M.metal(), 0, y));
  return g;
}

function temple(color) {
  const g = new THREE.Group();
  g.add(box(18, 0.6, 26, M.stone()));
  g.add(box(16.5, 0.6, 24.5, M.stone(), 0, 0.6));
  g.add(box(15, 0.6, 23, M.plaster(), 0, 1.2));
  for (const sz of [-10, -5, 0, 5, 10]) {
    for (const sx of [-6.5, 6.5]) g.add(cyl(0.55, 0.6, 8, 14, M.plaster(), sx, 1.8, sz));
  }
  for (const sx of [-3.5, 0, 3.5]) for (const sz of [-10.5, 10.5]) g.add(cyl(0.55, 0.6, 8, 14, M.plaster(), sx, 1.8, sz));
  g.add(box(15, 1, 23, M.stone(), 0, 9.8));
  g.add(box(10, 7, 16, M.plaster(), 0, 1.8));
  const roof = gable(16, 24, 3.5, mat(color || '#6d7a8c', { rough: 0.7 }), 10.8);
  roof.rotation.y = 0;
  g.add(roof);
  g.add(box(2.4, 4, 0.2, M.darkWood(), 0, 1.8, 8.05));
  return g;
}

function teleportCircle() {
  const g = new THREE.Group();
  g.add(cyl(3, 3.2, 0.3, 24, M.darkStone()));
  const ring = mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 48), M.magic(), 0, 0.34, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(box(0.35, 1.6, 0.35, M.stone(), Math.cos(a) * 2.9, 0.3, Math.sin(a) * 2.9, -a));
    g.add(mesh(new THREE.OctahedronGeometry(0.18), M.magic(), Math.cos(a) * 2.9, 2.2, Math.sin(a) * 2.9));
  }
  return g;
}

function bridge() {
  const g = new THREE.Group();
  g.add(box(3.2, 0.3, 14, M.wood(), 0, 0.6));
  for (let z = -6.5; z <= 6.5; z += 2.6) {
    for (const sx of [-1.5, 1.5]) g.add(box(0.2, 1.8, 0.2, M.darkWood(), sx, 0, z));
  }
  for (const sx of [-1.5, 1.5]) g.add(box(0.15, 0.15, 14, M.darkWood(), sx, 1.7, 0));
  return g;
}

function well() {
  const g = new THREE.Group();
  g.add(cyl(1.1, 1.2, 1, 12, M.stone()));
  g.add(cyl(0.9, 0.9, 0.05, 12, M.water(), 0, 0.7));
  for (const sx of [-1, 1]) g.add(box(0.15, 2.4, 0.15, M.darkWood(), sx, 1, 0));
  g.add(gable(2.6, 1.8, 0.8, mat('#6b3a24'), 3.3));
  g.add(cyl(0.08, 0.08, 2, 6, M.darkWood(), 0, 2.6).rotateZ(Math.PI / 2));
  return g;
}

export const PREFABS = [
  { id: 'casa', name: 'Casa', icon: '🏠', cat: 'Construções', color: '#8b2e24', build: (c, s) => house(c, s) },
  { id: 'taverna', name: 'Taverna / Casa grande', icon: '🏡', cat: 'Construções', color: '#5a3a28', build: (c, s) => house(c, s, true) },
  { id: 'templo', name: 'Templo', icon: '🏛️', cat: 'Construções', color: '#6d7a8c', build: (c) => temple(c) },
  { id: 'torre', name: 'Torre', icon: '🗼', cat: 'Muralhas', color: '#2f4a78', build: (c) => tower(c) },
  { id: 'muralha', name: 'Muralha (8 m)', icon: '🧱', cat: 'Muralhas', color: null, build: () => wall() },
  { id: 'portao', name: 'Portão', icon: '⛩️', cat: 'Muralhas', color: '#2f4a78', build: (c) => gate(c) },
  { id: 'fonte', name: 'Fonte', icon: '⛲', cat: 'Decoração', color: null, build: () => fountain() },
  { id: 'poste', name: 'Poste com lanterna', icon: '🏮', cat: 'Decoração', color: null, build: () => lamp() },
  { id: 'barraca', name: 'Barraca de mercador', icon: '⛺', cat: 'Decoração', color: '#b8412e', build: (c) => stall(c) },
  { id: 'estatua', name: 'Estátua', icon: '🗿', cat: 'Decoração', color: null, build: () => statue() },
  { id: 'bandeira', name: 'Bandeira (tecido)', icon: '🚩', cat: 'Decoração', color: '#8a1c2b', build: (c) => flag(c) },
  { id: 'teleporte', name: 'Círculo de teleporte', icon: '🌀', cat: 'Decoração', color: null, build: () => teleportCircle() },
  { id: 'poco', name: 'Poço', icon: '🪣', cat: 'Decoração', color: null, build: () => well() },
  { id: 'caixote', name: 'Caixote', icon: '📦', cat: 'Decoração', color: null, build: () => crate() },
  { id: 'barril', name: 'Barril', icon: '🛢️', cat: 'Decoração', color: null, build: () => barrel() },
  { id: 'ponte', name: 'Ponte de madeira', icon: '🌉', cat: 'Construções', color: null, build: () => bridge() },
  { id: 'arvore', name: 'Árvore', icon: '🌳', cat: 'Natureza', color: '#3f6e2a', build: (c, s) => tree(c, s) },
  { id: 'pinheiro', name: 'Pinheiro', icon: '🌲', cat: 'Natureza', color: '#2b4d2a', build: (c, s) => pine(c, s) },
  { id: 'arbusto', name: 'Arbusto', icon: '🌿', cat: 'Natureza', color: '#4a7d2f', build: (c, s) => bush(c, s) },
  { id: 'pedra', name: 'Pedra', icon: '🪨', cat: 'Natureza', color: '#8a8580', build: (c, s) => rock(c, s) },
];

export const PREFAB_MAP = new Map(PREFABS.map((p) => [p.id, p]));

export function buildPrefab(id, color, seed) {
  const def = PREFAB_MAP.get(id);
  if (!def) return new THREE.Group();
  const g = def.build(color || def.color, seed);
  g.userData.prefab = id;
  return g;
}
