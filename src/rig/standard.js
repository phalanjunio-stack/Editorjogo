// Nosso esqueleto padrão (EditorJogo) e o boneco padrão com pele + animações feitas por código.
// Metros, Y para cima, olhando +Z, esquerda em +X, pose T. Rotações de descanso = identidade:
// cada osso só tem o deslocamento até o pai, então os ângulos das animações são simples.
import * as THREE from 'three';
import { CANON, STANDARD_POSE, STANDARD_TIPS } from './humanoid.js';
import { bindSkinned, captureRest } from './rig.js';

// Ossos do corpo (sem dedos) + raiz no chão + pontos de encaixe (arma, escudo, capa).
export const STANDARD_BONES = [
  { name: 'raiz', parent: null, at: () => [0, 0, 0] },
  ...CANON.filter((c) => !c.finger).map((c) => ({
    name: c.name,
    id: c.id,
    parent: c.parent ? CANON.find((p) => p.id === c.parent).name : 'raiz',
    at: (pose) => pose[c.id],
  })),
  { name: 'arma_D', parent: 'mao_D', at: (pose, tips) => tips.R_hand, attach: true },
  { name: 'escudo_E', parent: 'mao_E', at: (pose, tips) => tips.L_hand, attach: true },
  { name: 'capa', parent: 'peito', at: (pose, tips, u = 1) => [pose.chest[0], pose.chest[1] + 0.1 * u, pose.chest[2] - 0.13 * u], attach: true },
];

/**
 * Cria os ossos do nosso esqueleto nas posições dadas (marcadores do rig automático ou a pose padrão).
 * @param {Record<string, number[]>} pose  posição (mundo) de cada osso canônico
 * @param {Record<string, number[]>} tips  pontas: cabeça, mãos, dedos do pé
 * @param {number} unit  tamanho da malha em relação ao boneco de 1,8 m (altura ÷ 1,8): 1 em metros, ~42 numa malha de 76 unidades
 */
export function standardBones(pose = STANDARD_POSE, tips = STANDARD_TIPS, unit = 1) {
  const byName = new Map();
  const world = new Map();
  const bones = [];
  for (const def of STANDARD_BONES) {
    const p = def.at(pose, tips, unit);
    if (!p) continue;
    const bone = new THREE.Bone();
    bone.name = def.name;
    bone.userData.canon = def.id || null;
    if (def.attach) bone.userData.attach = true;
    const parentName = def.parent;
    const parentWorld = parentName ? world.get(parentName) : [0, 0, 0];
    bone.position.set(p[0] - parentWorld[0], p[1] - parentWorld[1], p[2] - parentWorld[2]);
    if (parentName) byName.get(parentName).add(bone);
    byName.set(def.name, bone);
    world.set(def.name, p);
    bones.push(bone);
  }
  return { bones, byName, world };
}

// ------------------------------------------------------------------ boneco padrão
function geomBuilder() {
  const pos = [], idx = [], sIdx = [], sW = [], groups = new Map();
  const tri = (mat, a, b, c) => {
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat).push(a, b, c);
  };
  const vert = (p, weights) => {
    pos.push(p.x, p.y, p.z);
    const ws = weights.slice(0, 4);
    for (let k = 0; k < 4; k++) {
      sIdx.push(ws[k] ? ws[k][0] : 0);
      sW.push(ws[k] ? ws[k][1] : 0);
    }
    return pos.length / 3 - 1;
  };
  return { pos, idx, sIdx, sW, groups, tri, vert };
}

// Tubo de a até b (raios r0 -> r1). Perto do começo mistura com o osso pai (dobra suave).
function tube(G, a, b, r0, r1, bone, parent, mat, { sides = 14, rings = 6, blend = 0.35, sx = 1, sz = 1 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const axis = B.clone().sub(A);
  const len = axis.length() || 1;
  const d = axis.clone().divideScalar(len);
  const ref = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize();
  const v = new THREE.Vector3().crossVectors(d, u).normalize();
  const base = G.pos.length / 3;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const r = r0 + (r1 - r0) * t;
    const c = A.clone().addScaledVector(axis, t);
    const w = parent !== null && t < blend ? 0.5 * (1 - t / blend) : 0;
    const weights = w > 0 ? [[bone, 1 - w], [parent, w]] : [[bone, 1]];
    for (let s = 0; s < sides; s++) {
      const ang = (2 * Math.PI * s) / sides;
      const p = c.clone().addScaledVector(u, Math.cos(ang) * r * sx).addScaledVector(v, Math.sin(ang) * r * sz);
      G.vert(p, weights);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < sides; s++) {
      const i0 = base + ring * sides + s, i1 = base + ring * sides + ((s + 1) % sides);
      const i2 = i0 + sides, i3 = i1 + sides;
      G.tri(mat, i0, i1, i2);
      G.tri(mat, i1, i3, i2);
    }
  }
}

function ellipsoid(G, c, rx, ry, rz, weights, mat, { seg = 16, rings = 12 } = {}) {
  const base = G.pos.length / 3;
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      G.vert(new THREE.Vector3(c[0] + Math.sin(th) * Math.cos(ph) * rx, c[1] + Math.cos(th) * ry, c[2] + Math.sin(th) * Math.sin(ph) * rz), weights);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + seg + 1;
      G.tri(mat, a, a + 1, b);
      G.tri(mat, a + 1, b + 1, b);
    }
  }
}

/**
 * Boneco padrão (1,8 m) com pele: um manequim de túnica e botas, pronto para animar e para
 * servir de NPC até você importar os seus personagens.
 */
export function buildDefaultCharacter({ skin = '#c9a98a', cloth = '#4a5a78', leather = '#4a3322', name = 'Boneco padrão' } = {}) {
  const { bones, byName } = standardBones();
  const I = new Map(bones.map((b, i) => [b.name, i]));
  const P = STANDARD_POSE, T = STANDARD_TIPS;
  const G = geomBuilder();
  const b = (n) => I.get(n);
  // tronco
  tube(G, P.hips, P.spine, 0.15, 0.145, b('quadril'), null, 1, { sx: 1.2, sz: 0.85 });
  tube(G, P.spine, P.spine1, 0.145, 0.15, b('coluna'), b('quadril'), 1, { sx: 1.2, sz: 0.82 });
  tube(G, P.spine1, P.chest, 0.15, 0.165, b('coluna1'), b('coluna'), 1, { sx: 1.25, sz: 0.8 });
  tube(G, P.chest, P.neck, 0.165, 0.12, b('peito'), b('coluna1'), 1, { sx: 1.3, sz: 0.78 });
  ellipsoid(G, [P.hips[0], P.hips[1] - 0.04, P.hips[2]], 0.18, 0.1, 0.13, [[b('quadril'), 1]], 1);
  // ombros (capinhas na túnica)
  for (const s of ['E', 'D']) {
    const up = s === 'E' ? P.L_upperarm : P.R_upperarm;
    ellipsoid(G, up, 0.075, 0.07, 0.075, [[b(`braco_${s}`), 0.5], [b(`clavicula_${s}`), 0.5]], 1, { seg: 12, rings: 8 });
  }
  // pescoço e cabeça
  tube(G, P.neck, P.head, 0.055, 0.052, b('pescoco'), b('peito'), 0, { sides: 12, rings: 3 });
  ellipsoid(G, [P.head[0], P.head[1] + 0.09, P.head[2] + 0.01], 0.095, 0.12, 0.11, [[b('cabeca'), 1]], 0);
  // braços
  for (const [s, L] of [['E', 'L'], ['D', 'R']]) {
    tube(G, P[`${L}_upperarm`], P[`${L}_forearm`], 0.056, 0.046, b(`braco_${s}`), b(`clavicula_${s}`), 0, { blend: 0.25 });
    tube(G, P[`${L}_forearm`], P[`${L}_hand`], 0.046, 0.036, b(`antebraco_${s}`), b(`braco_${s}`), 0, { blend: 0.3 });
    const h = P[`${L}_hand`], tip = T[`${L}_hand`];
    ellipsoid(G, [(h[0] + tip[0]) / 2, h[1] - 0.005, (h[2] + tip[2]) / 2], 0.085, 0.022, 0.045, [[b(`mao_${s}`), 1]], 0, { seg: 12, rings: 8 });
    // pernas: calça da túnica até o joelho, bota até o pé
    tube(G, P[`${L}_thigh`], P[`${L}_calf`], 0.085, 0.062, b(`coxa_${s}`), b('quadril'), 1, { blend: 0.3 });
    tube(G, P[`${L}_calf`], P[`${L}_foot`], 0.062, 0.048, b(`canela_${s}`), b(`coxa_${s}`), 2, { blend: 0.3 });
    const f = P[`${L}_foot`], t = P[`${L}_toe`];
    ellipsoid(G, [f[0], 0.045, (f[2] + t[2]) / 2 + 0.01], 0.05, 0.045, 0.12, [[b(`pe_${s}`), 1]], 2, { seg: 12, rings: 8 });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(G.sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(G.sW, 4));
  const index = [];
  let start = 0;
  for (const mat of [0, 1, 2]) {
    const list = G.groups.get(mat) || [];
    index.push(...list);
    g.addGroup(start, list.length, mat);
    start += list.length;
  }
  g.setIndex(index);
  g.computeVertexNormals();
  const mats = [
    new THREE.MeshStandardMaterial({ name: 'pele', color: skin, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ name: 'tunica', color: cloth, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ name: 'couro', color: leather, roughness: 0.7 }),
  ];
  const root = bindSkinned(name, g, mats, bones);
  root.userData.standard = true;
  void byName;
  return captureRest(root);
}

// ------------------------------------------------------------------ animações feitas por código
const D2R = Math.PI / 180;

/**
 * Gera um clipe amostrando uma função de pose.
 * pose(t) -> { ossos: {nome: [x, y, z] graus (Euler XYZ, relativo ao descanso)}, quadril: [dx, dy, dz] }
 */
function makeClip(name, duration, pose, { fps = 30, loop = true, speed = 0 } = {}) {
  const frames = Math.round(duration * fps) + 1;
  const times = new Float32Array(frames);
  const rot = new Map();
  const hips = new Float32Array(frames * 3);
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  const hipsRest = STANDARD_POSE.hips;
  for (let f = 0; f < frames; f++) {
    const t = loop && f === frames - 1 ? 0 : (f / (frames - 1)) * duration;
    times[f] = (f / (frames - 1)) * duration;
    const p = pose(loop ? t : Math.min(t, duration), duration);
    for (const [bone, a] of Object.entries(p.ossos || {})) {
      if (!rot.has(bone)) rot.set(bone, new Float32Array(frames * 4).fill(0).map((_, k) => (k % 4 === 3 ? 1 : 0)));
      e.set(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'XYZ');
      q.setFromEuler(e);
      rot.get(bone).set([q.x, q.y, q.z, q.w], f * 4);
    }
    const o = p.quadril || [0, 0, 0];
    hips.set([hipsRest[0] + o[0], hipsRest[1] + o[1], hipsRest[2] + o[2]], f * 3);
  }
  const tracks = [...rot].map(([bone, v]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, v));
  tracks.push(new THREE.VectorKeyframeTrack('quadril.position', times, hips));
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { source: 'padrao', loop, speed };
  return clip;
}

const S = Math.sin, C = Math.cos, TAU = Math.PI * 2;
const pos = (x) => Math.max(0, x);
// braços caídos ao lado do corpo (a pose de descanso é T)
const ARMS_DOWN = 76;

function arms(o, { swingL = 0, swingR = 0, elbow = 12, down = ARMS_DOWN, outL = 0, outR = 0 } = {}) {
  o.braco_E = [swingL, outL, -down];
  o.braco_D = [swingR, -outR, down];
  o.antebraco_E = [0, -elbow, 0];
  o.antebraco_D = [0, elbow, 0];
}

export function standardClips() {
  const clips = [];
  // parado: respiração e um leve balanço
  clips.push(makeClip('parado', 3, (t) => {
    const p = (TAU * t) / 3;
    const o = {};
    arms(o, { swingL: 3 * S(p), swingR: 3 * S(p + 0.4), elbow: 10 + 3 * S(p) });
    o.peito = [1.5 * S(p), 0, 0];
    o.coluna = [1, 0, 0.8 * S(p * 0.5)];
    o.cabeca = [2 * S(p + 1), 4 * S(p * 0.5), 0];
    o.coxa_E = [0, 0, 1.5];
    o.coxa_D = [0, 0, -1.5];
    return { ossos: o, quadril: [0.008 * S(p * 0.5), -0.005 + 0.004 * S(p), 0] };
  }));
  // andar
  const walk = (name, T, amp, knee, armAmp, elbow, lean, bob, speed, twist) => makeClip(name, T, (t) => {
    const p = (TAU * t) / T;
    const o = {};
    o.coxa_E = [-amp * S(p), 0, 0];
    o.coxa_D = [amp * S(p), 0, 0];
    o.canela_E = [8 + knee * pos(C(p)) ** 1.2, 0, 0];
    o.canela_D = [8 + knee * pos(-C(p)) ** 1.2, 0, 0];
    o.pe_E = [amp * 0.35 * S(p) - 6, 0, 0];
    o.pe_D = [-amp * 0.35 * S(p) - 6, 0, 0];
    arms(o, { swingL: armAmp * S(p), swingR: -armAmp * S(p), elbow: elbow + elbow * 0.5 * pos(-S(p)), down: ARMS_DOWN - 4 });
    o.antebraco_D = [0, elbow + elbow * 0.5 * pos(S(p)), 0];
    o.quadril = [0, twist * S(p), 0];
    o.coluna = [lean * 0.5, -twist * 0.6 * S(p), 0];
    o.peito = [lean * 0.5, -twist * 0.8 * S(p), 0];
    o.cabeca = [-lean * 0.6, twist * 0.5 * S(p), 0];
    return { ossos: o, quadril: [0, -bob + bob * C(2 * p), 0] };
  }, { speed });
  clips.push(walk('andar', 0.8, 32, 45, 24, 14, 3, 0.03, 2.4, 6));
  clips.push(walk('correr', 0.6, 48, 95, 45, 75, 14, 0.06, 5.8, 10));
  // pular (no ar): pernas encolhidas e braços abertos, balançando de leve
  clips.push(makeClip('pular', 0.9, (t) => {
    const p = (TAU * t) / 0.9;
    const o = {};
    o.coxa_E = [-45 + 5 * S(p), 0, 3];
    o.coxa_D = [-25 - 5 * S(p), 0, -3];
    o.canela_E = [70, 0, 0];
    o.canela_D = [55, 0, 0];
    arms(o, { swingL: -20, swingR: -20, down: 35 + 5 * S(p), elbow: 30 });
    o.coluna = [8, 0, 0];
    return { ossos: o, quadril: [0, 0.02 * S(p), 0] };
  }, { speed: 0 }));
  // atacar: golpe de espada de cima para baixo com a mão direita
  clips.push(makeClip('atacar', 0.9, (t) => {
    const k = t / 0.9;
    const wind = Math.min(1, k / 0.35), hit = Math.min(1, Math.max(0, (k - 0.35) / 0.2)), back = Math.max(0, (k - 0.7) / 0.3);
    const swing = (1 - back) * (-110 * wind * (1 - hit) + 60 * hit) + back * 0;
    const o = {};
    arms(o, { down: ARMS_DOWN - 10, elbow: 20 });
    o.braco_D = [swing, 25 * hit * (1 - back), ARMS_DOWN * (1 - wind * 0.7) * (1 - hit) + (ARMS_DOWN - 20) * hit * (1 - back) + ARMS_DOWN * back];
    o.antebraco_D = [0, 60 * wind * (1 - hit) + 15, 0];
    o.coluna = [5 * hit, -20 * wind * (1 - hit) + 25 * hit * (1 - back), 0];
    o.peito = [8 * hit * (1 - back), -10 * wind * (1 - hit) + 15 * hit * (1 - back), 0];
    o.coxa_E = [-25 * Math.min(1, k * 3) * (1 - back), 0, 0];
    o.canela_E = [20 * Math.min(1, k * 3) * (1 - back), 0, 0];
    o.coxa_D = [15 * Math.min(1, k * 3) * (1 - back), 0, 0];
    return { ossos: o, quadril: [0, -0.05 * Math.min(1, k * 3) * (1 - back), 0.06 * hit * (1 - back)] };
  }, { loop: false }));
  // morrer: os joelhos cedem e cai de costas
  clips.push(makeClip('morrer', 1.6, (t) => {
    const k = Math.min(1, t / 1.2);
    const e = k * k * (3 - 2 * k);
    const o = {};
    o.quadril = [-80 * e, 0, 5 * e];
    o.coxa_E = [-30 * Math.sin(Math.PI * k) + 10 * e, 0, 8 * e];
    o.coxa_D = [-20 * Math.sin(Math.PI * k) + 5 * e, 0, -12 * e];
    o.canela_E = [60 * Math.sin(Math.PI * k) + 10 * e, 0, 0];
    o.canela_D = [50 * Math.sin(Math.PI * k) + 15 * e, 0, 0];
    arms(o, { down: ARMS_DOWN * (1 - e) + 20 * e, swingL: 20 * e, swingR: 30 * e, elbow: 20 });
    o.cabeca = [-20 * e, 15 * e, 0];
    return { ossos: o, quadril: [0, -0.84 * e, -0.3 * e] };
  }, { loop: false }));
  // acenar
  clips.push(makeClip('acenar', 1.6, (t) => {
    const p = (TAU * t) / 0.8;
    const o = {};
    arms(o, { elbow: 10 });
    o.braco_D = [-10, 0, -60];
    o.antebraco_D = [0, 0, -40 + 25 * S(p)];
    o.cabeca = [0, -8, 0];
    return { ossos: o, quadril: [0, 0, 0] };
  }));
  // conjurar: braços à frente, mãos subindo e descendo
  clips.push(makeClip('conjurar', 1.5, (t) => {
    const p = (TAU * t) / 1.5;
    const o = {};
    o.braco_E = [-10 * S(p), -70, -15 - 10 * S(p)];
    o.braco_D = [-10 * S(p), 70, 15 + 10 * S(p)];
    o.antebraco_E = [0, -20, 10 * S(p)];
    o.antebraco_D = [0, 20, -10 * S(p)];
    o.coluna = [-6 + 3 * S(p), 0, 0];
    o.cabeca = [-8, 0, 0];
    return { ossos: o, quadril: [0, 0.01 * S(p), 0] };
  }));
  return clips;
}

// Papéis de animação que o jogo usa (o personagem liga cada um a um clipe).
export const ANIM_SLOTS = [
  { id: 'parado', label: 'Parado' },
  { id: 'andar', label: 'Andar' },
  { id: 'correr', label: 'Correr' },
  { id: 'pular', label: 'Pular (no ar)' },
  { id: 'atacar', label: 'Atacar' },
  { id: 'conjurar', label: 'Magia' },
  { id: 'morrer', label: 'Morrer' },
  { id: 'acenar', label: 'Acenar / falar' },
];

// Palavras que ajudam a achar o clipe de cada papel nas animações importadas (L2, Mixamo...).
export const SLOT_HINTS = {
  parado: ['parado', 'idle', 'wait', 'stand', 'breath'],
  andar: ['andar', 'walk'],
  correr: ['correr', 'run', 'sprint', 'jog'],
  pular: ['pular', 'jump', 'fall', 'air'],
  atacar: ['atacar', 'attack', 'atk', 'slash', 'hit', 'swing', 'punch'],
  conjurar: ['conjurar', 'cast', 'spell', 'magic', 'skill'],
  morrer: ['morrer', 'death', 'die', 'dead', 'dying'],
  acenar: ['acenar', 'wave', 'talk', 'greet', 'social'],
};

/** Escolhe um clipe para cada papel pelos nomes (o usuário pode trocar depois). */
export function guessSlots(clipNames, current = {}) {
  const out = { ...current };
  for (const s of ANIM_SLOTS) {
    if (out[s.id] && clipNames.includes(out[s.id])) continue;
    const hints = SLOT_HINTS[s.id];
    let best = null;
    for (const n of clipNames) {
      const l = n.toLowerCase();
      const rank = hints.findIndex((h) => l.includes(h));
      if (rank < 0) continue;
      // prefere nomes curtos ("Run" em vez de "RunAttack") e sem "wait/battle" misturados
      const score = rank * 100 + l.length;
      if (!best || score < best.score) best = { n, score };
    }
    if (best) out[s.id] = best.n;
  }
  return out;
}
