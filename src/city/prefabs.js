// Biblioteca de peças prontas para montar cidades (estilo "arrastar e soltar" do UnrealEd 2).
// A forma é gerada por código, em metros; o acabamento usa texturas fotográficas (pedra de castelo,
// reboco, madeira, telha) e as árvores são modelos com galhos e folhas de verdade.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/util.js';
import { loadTexture } from '../core/textureLoader.js';
import { BUILDING_SETS, TERRAIN_SETS } from '../assets.js';
import { buildTree } from '../nature/trees.js';

const matCache = new Map();
export function mat(color, { rough = 0.85, metal = 0, emissive = null, glow = 1.6, flat = false, opacity = 1 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${glow}|${flat}|${opacity}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = glow; }
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; }
    m.name = key;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const setOf = (name) => (name === 'rock' ? TERRAIN_SETS[2] : BUILDING_SETS[name]);

/**
 * Material com textura fotográfica (cor + normal + ARM: oclusão, rugosidade).
 * As UVs das peças são em metros, então `tile` é o tamanho real de uma repetição.
 */
export function pbr(name, { tint = '#ffffff', tile = 2, normal = 1, rough = 1 } = {}) {
  const key = `pbr|${name}|${tint}|${tile}|${normal}|${rough}`;
  if (!matCache.has(key)) {
    const s = setOf(name);
    const repeat = 1 / tile;
    const arm = loadTexture(s.arm, { srgb: false, repeat });
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      map: loadTexture(s.color, { repeat }),
      normalMap: loadTexture(s.normal, { srgb: false, repeat }),
      roughnessMap: arm,
      aoMap: arm,
      roughness: rough,
      metalness: 0,
    });
    m.normalScale.set(normal, normal);
    m.name = key;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// Cor escolhida no editor vira um "tingimento" suave sobre a foto (telhado vermelho, azul...).
const WHITE = new THREE.Color(1, 1, 1);
const tintOf = (color, amount = 0.5) => `#${new THREE.Color(color).lerp(WHITE, 1 - amount).getHexString()}`;

const M = {
  stone: () => pbr('stone', { tile: 2.5 }),
  darkStone: () => pbr('stone', { tile: 2.5, tint: '#8d877e' }),
  plaster: () => pbr('plaster', { tile: 1.8, tint: '#f3ece0' }),
  marble: () => pbr('plaster', { tile: 3, tint: '#f4f1ea', rough: 0.7 }),
  wood: () => pbr('wood', { tile: 1.6, tint: '#c9a27a' }),
  darkWood: () => pbr('wood', { tile: 1.6, tint: '#7a5a40' }),
  roofTiles: (c) => pbr('roofTiles', { tile: 2, tint: c ? tintOf(c) : '#ffffff' }),
  roofSlates: (c) => pbr('roofSlates', { tile: 1.8, tint: c ? tintOf(c, 0.6) : '#ffffff' }),
  metal: () => mat('#55585e', { rough: 0.5, metal: 0.85 }),
  gold: () => mat('#d4a93c', { rough: 0.3, metal: 1 }),
  glass: () => mat('#1a2430', { rough: 0.08, metal: 0.4 }),
  water: () => mat('#1d4a52', { rough: 0.04, metal: 0.2, opacity: 0.82 }),
  lantern: () => mat('#ffcf73', { rough: 0.4, emissive: '#ffb347', glow: 9 }),
  bronze: () => mat('#7c5a32', { rough: 0.38, metal: 0.95 }),
  magic: () => mat('#6fd3ff', { rough: 0.3, emissive: '#38b6ff', glow: 7 }),
  cloth: (c) => mat(c, { rough: 1 }),
};

// ---------------------------------------------------------------- UVs em metros
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Faz a textura ter o mesmo tamanho real em qualquer peça (sem esticar):
// cilindros e cones usam a volta e a altura; o resto projeta cada face no seu próprio plano.
function meterUV(geo, off) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  const P = geo.parameters || {};
  if (geo.type === 'CylinderGeometry' || geo.type === 'ConeGeometry') {
    const rt = geo.type === 'ConeGeometry' ? 0 : P.radiusTop;
    const rb = geo.type === 'ConeGeometry' ? P.radius : P.radiusBottom;
    const side = (P.radialSegments + 1) * (P.heightSegments + 1);
    const slant = Math.hypot(P.height, rb - rt);
    const circ = Math.PI * (rt + rb);
    const diam = 2 * Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) {
      if (i < side) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * slant);
      else uv.setXY(i, uv.getX(i) * diam, uv.getY(i) * diam);
    }
    uv.needsUpdate = true;
    return;
  }
  if (geo.type === 'SphereGeometry') {
    const r = P.radius;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * Math.PI * r);
    uv.needsUpdate = true;
    return;
  }
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    _n.fromBufferAttribute(nor, i);
    _t.crossVectors(UP, _n);
    if (_t.lengthSq() < 1e-4) _t.set(1, 0, 0);
    _t.normalize();
    _b.crossVectors(_n, _t).normalize();
    _p.fromBufferAttribute(pos, i).add(off);
    uv.setXY(i, _p.dot(_t), _p.dot(_b));
  }
  uv.needsUpdate = true;
}

function mesh(geo, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (material.map) meterUV(geo, m.position);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0, ry = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, ry);
const cyl = (rt, rb, h, seg, m, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
const cone = (r, h, seg, m, x = 0, y = 0, z = 0) => mesh(new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z);

// Prisma triangular (empena) ao longo de Z.
function gable(w, d, h, m, y) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return mesh(g, m, 0, y, 0);
}

// Telhado de duas águas de verdade: empenas de parede + duas placas de telha com beiral.
function roof(g, w, d, h, roofMat, wallMat, y, overhang = 0.6) {
  g.add(gable(w, d, h, wallMat, y));
  const ang = Math.atan2(h, w / 2);
  const len = Math.hypot(w / 2, h) + overhang;
  const t = 0.16;
  for (const sx of [-1, 1]) {
    const geo = new THREE.BoxGeometry(len, t, d + overhang * 2);
    const slab = mesh(geo, roofMat);
    // fileiras de telha ao longo da cumeeira, descendo o telhado
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setXY(i, uv.getY(i), -sx * u);
    }
    slab.rotation.z = -sx * ang;
    const dx = sx * Math.cos(ang), dy = -Math.sin(ang); // direção "descendo" o telhado
    const nx = sx * Math.sin(ang), ny = Math.cos(ang); // para fora
    slab.position.set((dx * len + nx * t) / 2, y + h + (dy * len + ny * t) / 2, 0);
    g.add(slab);
  }
  // cumeeira
  const ridge = mesh(new THREE.CylinderGeometry(0.14, 0.14, d + overhang * 2, 8), roofMat, 0, y + h + t * 0.9, 0);
  ridge.rotation.x = Math.PI / 2;
  g.add(ridge);
}

function windowFrame(g, x, y, z, big) {
  g.add(box(1.1, 1.2, 0.08, M.glass(), x, y, z));
  g.add(box(1.36, 0.14, 0.24, M.darkWood(), x, y - 0.14, z + 0.04));
  g.add(box(1.3, 0.12, 0.14, M.darkWood(), x, y + 1.2, z + 0.02));
  g.add(box(0.08, 1.2, 0.12, M.darkWood(), x, y, z + 0.02));
  for (const sx of [-1, 1]) g.add(box(0.55, 1.25, 0.06, M.wood(), x + sx * 0.88, y - 0.02, z + 0.06));
  if (big) g.add(box(0.12, 1.2, 0.12, M.darkWood(), x, y, z + 0.02));
}

function house(color, seed, big = false) {
  const g = new THREE.Group();
  const W = big ? 11 : 8, D = big ? 9 : 6, H = big ? 7.5 : 4.5;
  g.add(box(W + 0.4, 0.7, D + 0.4, M.darkStone(), 0, -0.1));
  g.add(box(W, H, D, M.plaster(), 0, 0.6));
  // enxaimel: pilares, vigas e mãos-francesas de madeira escura
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.3, H, 0.3, M.darkWood(), sx * (W / 2 - 0.1), 0.6, sz * (D / 2 - 0.1)));
  for (const fz of [-1, 1]) {
    g.add(box(W + 0.1, 0.25, 0.3, M.darkWood(), 0, 0.6 + H * 0.5, fz * (D / 2 - 0.1)));
    g.add(box(W + 0.1, 0.25, 0.3, M.darkWood(), 0, 0.6 + H - 0.2, fz * (D / 2 - 0.1)));
  }
  for (const fx of [-1, 1]) g.add(box(0.3, 0.25, D + 0.1, M.darkWood(), fx * (W / 2 - 0.1), 0.6 + H * 0.5, 0));
  for (const sx of [-1, 1]) {
    const brace = box(0.22, H * 0.52, 0.22, M.darkWood(), sx * (W / 2 - 1.1), 0.6 + H * 0.5, D / 2 + 0.02);
    brace.rotation.z = sx * 0.5;
    g.add(brace);
  }
  roof(g, W, D, big ? 4 : 3, M.roofTiles(color || '#8b2e24'), M.plaster(), 0.6 + H);
  // porta com batente e degrau
  g.add(box(1.5, 2.4, 0.12, M.darkWood(), 0, 0.6, D / 2 + 0.03));
  g.add(box(1.9, 0.18, 0.3, M.darkWood(), 0, 3.0, D / 2 + 0.06));
  g.add(box(2.0, 0.25, 0.8, M.darkStone(), 0, 0, D / 2 + 0.45));
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), M.metal(), 0.5, 1.8, D / 2 + 0.12));
  for (const sx of big ? [-3.2, 3.2] : [-2.5, 2.5]) {
    windowFrame(g, sx, 1.8, D / 2 + 0.03, big);
    if (big) windowFrame(g, sx, 5.2, D / 2 + 0.03, big);
  }
  // chaminé de pedra
  g.add(box(0.9, 3.2, 0.9, M.darkStone(), W / 2 - 1.5, 0.6 + H + 0.4, -D / 4));
  g.add(box(1.1, 0.2, 1.1, M.darkStone(), W / 2 - 1.5, 0.6 + H + 3.6, -D / 4));
  if (big) {
    // placa da taverna
    g.add(box(0.12, 0.12, 1.4, M.darkWood(), W / 2 - 1, 4.2, D / 2 + 0.7));
    g.add(box(0.1, 0.9, 1.1, M.wood(), W / 2 - 1, 3.2, D / 2 + 0.9));
  }
  return g;
}

function tower(color) {
  const g = new THREE.Group();
  g.add(cyl(3.3, 3.6, 1, 24, M.darkStone()));
  g.add(cyl(3, 3.25, 13, 24, M.stone(), 0, 1));
  g.add(cyl(3.5, 3.5, 1.2, 24, M.darkStone(), 0, 14));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (i % 2 === 0) g.add(box(0.9, 1.1, 0.6, M.stone(), Math.cos(a) * 3.2, 15.2, Math.sin(a) * 3.2, -a + Math.PI / 2));
  }
  g.add(cone(3.9, 6, 24, M.roofSlates(color || '#2f4a78'), 0, 15.2));
  g.add(cyl(0.05, 0.05, 1.2, 6, M.metal(), 0, 21.1));
  for (const y of [5, 9]) g.add(box(0.35, 1.3, 0.3, M.glass(), 0, y, 3.02));
  g.add(box(1.4, 2.4, 0.3, M.darkWood(), 0, 1, 3.1));
  return g;
}

function wall() {
  const g = new THREE.Group();
  g.add(box(8, 6, 1.8, M.stone()));
  g.add(box(8.02, 0.6, 1.9, M.darkStone(), 0, 0));
  g.add(box(8.02, 0.25, 1.95, M.darkStone(), 0, 5.8));
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
    g.add(cone(2.4, 3, 4, M.roofSlates(color || '#2f4a78'), sx * 4.5, 11, 0));
  }
  g.add(box(6, 2.5, 3, M.stone(), 0, 7.5, 0));
  g.add(box(6.2, 0.4, 3.2, M.darkStone(), 0, 10, 0));
  for (const sx of [-1, 1]) g.add(box(2.9, 7.2, 0.25, M.darkWood(), sx * 1.5, 0, 0.2, sx * 0.5));
  for (let x = -2.5; x <= 2.5; x += 0.5) g.add(box(0.08, 2, 0.08, M.metal(), x, 5.5, -0.8));
  g.add(box(6, 0.1, 0.1, M.metal(), 0, 6.4, -0.8));
  return g;
}

function fountain() {
  const g = new THREE.Group();
  g.add(cyl(3.2, 3.4, 0.9, 32, M.stone()));
  g.add(cyl(2.8, 2.8, 0.05, 32, M.water(), 0, 0.75));
  g.add(cyl(0.35, 0.45, 2.2, 16, M.marble(), 0, 0.9));
  g.add(cyl(1.2, 0.5, 0.35, 24, M.marble(), 0, 3));
  g.add(cyl(1.05, 1.05, 0.04, 24, M.water(), 0, 3.3));
  g.add(mesh(new THREE.SphereGeometry(0.35, 24, 16), M.gold(), 0, 3.9, 0));
  return g;
}

function lamp() {
  const g = new THREE.Group();
  g.add(cyl(0.18, 0.22, 0.3, 12, M.darkStone()));
  g.add(cyl(0.07, 0.09, 3.2, 10, M.metal(), 0, 0.3));
  g.add(box(0.8, 0.06, 0.06, M.metal(), 0.35, 3.3, 0));
  g.add(box(0.3, 0.42, 0.3, M.lantern(), 0.7, 2.9, 0));
  g.add(cone(0.26, 0.2, 4, M.metal(), 0.7, 3.32, 0));
  return g;
}

// ---------------------------------------------------------------- pedras
// Ruído 3D simples (valor interpolado) para dar forma natural às pedras.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  ) * 2 - 1;
}

const rockGeoCache = new Map();
function rockGeometry(seed) {
  const k = Math.abs(Math.floor(seed || 3)) % 12;
  if (rockGeoCache.has(k)) return rockGeoCache.get(k);
  const r = rng(k + 11);
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const o = [r() * 50, r() * 50, r() * 50];
  const sx = 1.3 + r() * 0.5, sy = 0.75 + r() * 0.35, sz = 1.0 + r() * 0.4;
  // planos de quebra: a pedra fica com faces lascadas em vez de um "ovo" liso
  const cuts = Array.from({ length: 5 }, () => {
    const n = new THREE.Vector3(r() * 2 - 1, r() * 1.4 - 0.2, r() * 2 - 1).normalize();
    return { n, k: 0.72 + r() * 0.2 };
  });
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.32 * noise3(x * 1.1 + o[0], y * 1.1 + o[1], z * 1.1 + o[2])
      + 0.14 * noise3(x * 2.7 + o[1], y * 2.7 + o[2], z * 2.7 + o[0])
      + 0.05 * noise3(x * 7 + o[2], y * 7 + o[0], z * 7 + o[1]);
    v.set(x * d, y * d, z * d);
    for (const c of cuts) {
      const e = v.dot(c.n) - c.k;
      if (e > 0) v.addScaledVector(c.n, -e * 0.9);
    }
    let yy = v.y * sy;
    if (yy < -0.2) yy = -0.2 + (yy + 0.2) * 0.25; // base assentada no chão
    p.setXYZ(i, v.x * sx, yy + 0.35, v.z * sz);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.shared = true;
  rockGeoCache.set(k, g);
  return g;
}

// Pedra com textura "triplanar": projeta a foto de três lados e mistura, sem UVs e sem costura.
function rockMaterial(tint) {
  const key = `rocha|${tint}`;
  if (matCache.has(key)) return matCache.get(key);
  const s = setOf('rock');
  const m = new THREE.MeshStandardMaterial({
    color: tint,
    map: loadTexture(s.color),
    normalMap: loadTexture(s.normal, { srgb: false }),
    roughnessMap: loadTexture(s.arm, { srgb: false }),
    aoMap: loadTexture(s.arm, { srgb: false }),
    roughness: 1,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTpScale = { value: 0.45 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTpPos = position;\nvTpN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTpPos;
varying vec3 vTpN;
uniform float uTpScale;
uniform mat3 normalMatrix;
vec3 tpW() { vec3 w = pow(abs(normalize(vTpN)), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 tpSample(sampler2D t) {
  vec3 w = tpW(); vec3 p = vTpPos * uTpScale;
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}`)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'tpSample( map )'))
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'tpSample( roughnessMap )'))
      .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv )', 'tpSample( aoMap )'))
      .replace('#include <normal_fragment_maps>', `{
  vec3 on = normalize(vTpN);
  vec3 w = tpW();
  vec3 p = vTpPos * uTpScale;
  vec3 nx = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;
  nx.xy *= normalScale; ny.xy *= normalScale; nz.xy *= normalScale;
  vec3 ax = sign(on);
  nx.z *= ax.x; ny.z *= ax.y; nz.z *= ax.z;
  nx = vec3(nx.xy + on.zy, abs(nx.z) * on.x);
  ny = vec3(ny.xy + on.xz, abs(ny.z) * on.y);
  nz = vec3(nz.xy + on.xy, abs(nz.z) * on.z);
  normal = normalize(normalMatrix * normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z));
}`);
  };
  m.customProgramCacheKey = () => 'rocha-triplanar-v1';
  m.name = key;
  matCache.set(key, m);
  return m;
}

function rock(color, seed) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(rockGeometry(seed), rockMaterial(color ? tintOf(color, 0.6) : '#ffffff'));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

// ---------------------------------------------------------------- decoração
function stall(color) {
  const g = new THREE.Group();
  for (const sx of [-1.4, 1.4]) for (const sz of [-1, 1]) g.add(box(0.12, 2.6, 0.12, M.darkWood(), sx, 0, sz));
  g.add(box(3, 0.9, 1.2, M.wood(), 0, 0, 0.3));
  const aw = box(3.3, 0.06, 2.6, M.cloth(color || '#b8412e'), 0, 2.6, 0.2);
  aw.rotation.x = -0.18;
  g.add(aw);
  g.add(box(0.5, 0.35, 0.4, M.gold(), -0.8, 0.9, 0.3));
  g.add(box(0.5, 0.4, 0.4, M.darkWood(), 0.6, 0.9, 0.3));
  return g;
}

function statue() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.4, 2.2, M.marble()));
  g.add(box(2.5, 0.25, 2.5, M.darkStone(), 0, 1.4));
  const b = M.bronze();
  for (const sx of [-0.18, 0.18]) g.add(cyl(0.13, 0.15, 1.1, 12, b, sx, 1.65));
  g.add(cyl(0.3, 0.25, 1.0, 16, b, 0, 2.75));
  g.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), b, 0, 4.0, 0));
  g.add(cyl(0.08, 0.08, 0.9, 8, b, -0.42, 2.9));
  const arm = cyl(0.08, 0.08, 0.9, 8, b, 0.42, 3.1);
  arm.rotation.z = -0.9;
  g.add(arm);
  g.add(box(0.08, 1.6, 0.03, M.metal(), 0.95, 3.5, 0));
  return g;
}

function flag(color) {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.4, 0.4, 12, M.darkStone()));
  g.add(cyl(0.07, 0.09, 8, 10, M.darkWood(), 0, 0.4));
  g.add(mesh(new THREE.SphereGeometry(0.14, 12, 8), M.gold(), 0, 8.5, 0));
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
  g.add(cyl(0.42, 0.42, 1.1, 20, M.wood()));
  g.add(cyl(0.47, 0.47, 0.25, 20, M.wood(), 0, 0.42));
  for (const y of [0.12, 0.9]) g.add(cyl(0.44, 0.44, 0.06, 20, M.metal(), 0, y));
  return g;
}

function temple(color) {
  const g = new THREE.Group();
  g.add(box(18, 0.6, 26, M.stone()));
  g.add(box(16.5, 0.6, 24.5, M.stone(), 0, 0.6));
  g.add(box(15, 0.6, 23, M.marble(), 0, 1.2));
  for (const sz of [-10, -5, 0, 5, 10]) {
    for (const sx of [-6.5, 6.5]) g.add(cyl(0.55, 0.6, 8, 20, M.marble(), sx, 1.8, sz));
  }
  for (const sx of [-3.5, 0, 3.5]) for (const sz of [-10.5, 10.5]) g.add(cyl(0.55, 0.6, 8, 20, M.marble(), sx, 1.8, sz));
  g.add(box(15, 1, 23, M.marble(), 0, 9.8));
  g.add(box(10, 7, 16, M.marble(), 0, 1.8));
  roof(g, 15, 23, 3.5, M.roofSlates(color || '#6d7a8c'), M.marble(), 10.8, 0.5);
  g.add(box(2.4, 4, 0.2, M.darkWood(), 0, 1.8, 8.05));
  return g;
}

function teleportCircle() {
  const g = new THREE.Group();
  g.add(cyl(3, 3.2, 0.3, 32, M.darkStone()));
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
  g.add(cyl(1.1, 1.2, 1, 24, M.stone()));
  g.add(cyl(0.9, 0.9, 0.05, 24, M.water(), 0, 0.7));
  for (const sx of [-1, 1]) g.add(box(0.15, 2.4, 0.15, M.darkWood(), sx, 1, 0));
  roof(g, 2.4, 1.6, 0.8, M.roofTiles('#6b3a24'), M.darkWood(), 3.3, 0.2);
  const axle = cyl(0.08, 0.08, 2, 8, M.darkWood(), 0, 2.6);
  axle.rotation.z = Math.PI / 2;
  g.add(axle);
  return g;
}

// Árvores: cor igual à padrão = cor natural das folhas; outra cor tinge a copa (outono etc.).
const TREE_COLORS = { arvore: '#3f6e2a', pinheiro: '#2b4d2a', arbusto: '#4a7d2f' };
const tree = (kind) => (c, s) => buildTree(kind, c && c !== TREE_COLORS[kind] ? c : null, s);

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
  { id: 'arvore', name: 'Árvore', icon: '🌳', cat: 'Natureza', color: TREE_COLORS.arvore, build: tree('arvore') },
  { id: 'pinheiro', name: 'Pinheiro', icon: '🌲', cat: 'Natureza', color: TREE_COLORS.pinheiro, build: tree('pinheiro') },
  { id: 'arbusto', name: 'Arbusto', icon: '🌿', cat: 'Natureza', color: TREE_COLORS.arbusto, build: tree('arbusto') },
  { id: 'pedra', name: 'Pedra', icon: '🪨', cat: 'Natureza', color: '#8a8580', build: (c, s) => rock(c !== '#8a8580' ? c : null, s) },
];

export const PREFAB_MAP = new Map(PREFABS.map((p) => [p.id, p]));

export function buildPrefab(id, color, seed) {
  const def = PREFAB_MAP.get(id);
  if (!def) return new THREE.Group();
  const g = def.build(color || def.color, seed);
  g.userData.prefab = id;
  return g;
}
