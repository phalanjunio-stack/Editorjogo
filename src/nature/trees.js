// Árvores realistas (tronco com casca, galhos e folhas de verdade) geradas pelo ez-tree.
// Cada tipo tem algumas variações prontas; as cópias no mapa compartilham a mesma malha,
// então mil árvores ocupam a memória de oito.
import * as THREE from 'three';
import { Tree, TreePreset } from 'ez-tree';
import { BARK, LEAVES } from '../assets.js';
import { loadTexture } from '../core/textureLoader.js';

// Vento compartilhado por todas as árvores (atualizado pelo App a cada quadro).
export const WIND = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uWindStrength: { value: 0.5 },
};

const KINDS = {
  arvore: { presets: ['Oak Medium', 'Ash Medium', 'Oak Small', 'Ash Small'], height: [8, 13] },
  pinheiro: { presets: ['Pine Medium', 'Pine Small', 'Pine Large'], height: [11, 17] },
  arbusto: { presets: ['Bush 1', 'Bush 2'], height: [1.2, 2] },
};
const SEEDS_PER_PRESET = 2;

function hash(n) {
  n = Math.imul((n ^ 61) ^ (n >>> 16), 9);
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}

// Balanço do vento: a árvore inteira verga (mais no alto) e as folhas tremulam.
function addWind(mat, leaves) {
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wBase = modelMatrix[3].xyz;
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float hb = max(wp.y - wBase.y, 0.0);
  float ph = dot(wBase.xz, vec2(0.071, 0.113));
  float sway = (sin(uTime * 0.8 + ph) * 0.7 + sin(uTime * 1.9 + ph * 1.7) * 0.3) * uWindStrength;
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * sway * hb * hb * 0.0018;
  ${leaves ? 'off += vec3(uWindDir.x, 0.5, uWindDir.y) * sin(uTime * 3.7 + dot(wp, vec3(0.9, 0.5, 0.7))) * 0.05 * uWindStrength;' : ''}
  transformed += inverse(mat3(modelMatrix)) * off;
}`);
    if (leaves) {
      s.fragmentShader = s.fragmentShader
        // a textura sobe com alfa pré-multiplicado (sem borda escura no mipmap): desfaz aqui
        // e de longe o mipmap "afina" o alfa e a copa sumiria: compensa pelo nível do mip
        .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  diffuseColor.rgb /= max(sampledDiffuseColor.a, 0.004);
  vec2 lUv = vMapUv * 512.0;
  vec2 lDx = dFdx(lUv), lDy = dFdy(lUv);
  float lMip = max(0.0, 0.5 * log2(max(dot(lDx, lDx), dot(lDy, lDy))));
  diffuseColor.a *= 1.0 + lMip * 0.35;
#endif`)
        // as normais da copa apontam para fora nos dois lados da folha (luz suave de copa)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  normal = normalize(vNormal);`);
    }
  };
  mat.customProgramCacheKey = () => (leaves ? 'arvore-folhas-v2' : 'arvore-casca-v1');
}

const materials = new Map();
function barkMaterial(o) {
  const b = o.bark;
  const key = `casca|${b.type}|${b.tint}|${b.textureScale.x},${b.textureScale.y}`;
  if (!materials.has(key)) {
    const set = BARK[b.type] || BARK.oak;
    const repeat = new THREE.Vector2(b.textureScale.x, 1 / b.textureScale.y);
    const m = new THREE.MeshStandardMaterial({
      name: 'casca',
      color: new THREE.Color(b.tint),
      map: loadTexture(set.color, { repeat }),
      normalMap: loadTexture(set.normal, { srgb: false, repeat }),
      roughness: 0.92,
    });
    addWind(m, false);
    materials.set(key, m);
  }
  return materials.get(key);
}

function leafMaterial(o, tint) {
  const type = LEAVES[o.leaves.type] ? o.leaves.type : 'oak';
  const key = `folhas|${type}|${tint.getHexString()}|${o.leaves.alphaTest}`;
  if (!materials.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      name: 'folhas',
      color: tint,
      map: loadTexture(LEAVES[type], { premultiply: true }),
      side: THREE.DoubleSide,
      alphaTest: o.leaves.alphaTest ?? 0.5,
      alphaToCoverage: true,
      roughness: 0.78,
    });
    addWind(m, true);
    materials.set(key, m);
  }
  return materials.get(key);
}

// Normais das folhas viradas para fora da copa: a árvore fica iluminada como um volume
// (e não como centenas de cartões soltos).
function roundLeafNormals(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  c.y -= (g.boundingBox.max.y - g.boundingBox.min.y) * 0.15;
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).sub(c).normalize();
    v.fromBufferAttribute(n, i);
    if (v.dot(d) < 0) v.negate();
    v.lerp(d, 0.7).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

const variants = new Map();
function variant(kind, seed) {
  const def = KINDS[kind];
  const count = def.presets.length * SEEDS_PER_PRESET;
  const idx = hash(Math.floor(Math.abs(seed ?? 1)) + 1) % count;
  const key = `${kind}:${idx}`;
  if (variants.has(key)) return variants.get(key);

  const json = structuredClone(TreePreset[def.presets[idx % def.presets.length]]);
  json.seed = (json.seed + 7919 * Math.floor(idx / def.presets.length)) % 65536;
  const tree = new Tree();
  tree.loadFromJson(json);
  const branches = tree.branchesMesh.geometry;
  const leaves = tree.leavesMesh.geometry;
  branches.computeBoundingBox();
  leaves.computeBoundingBox();
  const top = Math.max(branches.boundingBox.max.y, leaves.boundingBox.max.y) || 1;
  const [h0, h1] = def.height;
  const height = h0 + (h1 - h0) * ((hash(idx * 31 + 7) % 1000) / 1000);
  const s = height / top;
  for (const g of [branches, leaves]) {
    g.scale(s, s, s);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.shared = true; // não descartar ao apagar uma cópia
  }
  roundLeafNormals(leaves);
  tree.branchesMesh.material.dispose();
  tree.leavesMesh.material.dispose();
  const v = { branches, leaves, opts: tree.options, bark: barkMaterial(tree.options) };
  variants.set(key, v);
  return v;
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * @param {'arvore'|'pinheiro'|'arbusto'} kind
 * @param {string|null} color cor escolhida no editor (null = cor natural da folha)
 * @param {number} seed escolhe a variação
 */
export function buildTree(kind, color, seed) {
  const v = variant(kind, seed);
  const tint = color ? new THREE.Color(color).lerp(WHITE, 0.35) : new THREE.Color(v.opts.leaves.tint);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(v.branches, v.bark);
  const crown = new THREE.Mesh(v.leaves, leafMaterial(v.opts, tint));
  trunk.name = 'tronco';
  crown.name = 'copa';
  for (const m of [trunk, crown]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(trunk, crown);
  return g;
}

export const TREE_KINDS = Object.keys(KINDS);
