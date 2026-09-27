// Esqueleto humanoide do EditorJogo ("nosso rig") e o reconhecimento dos ossos de outros
// esqueletos pelo nome: Lineage II / 3ds Max Biped (Bip01 ...), Mixamo (mixamorig:...),
// Unreal (pelvis, upperarm_l ...), Blender/Rigify (upper_arm.L ...) e os nossos (braco_E ...).
// Com esse "mapa" uma animação de qualquer um deles toca em qualquer outro (retarget.js).
// Sem dependências (roda também nos testes em Node).

// Ossos canônicos. parent = osso canônico acima (para achar direções e o encadeamento).
// Os nomes (name) são os do NOSSO esqueleto.
export const CANON = [
  { id: 'hips', name: 'quadril', parent: null },
  { id: 'spine', name: 'coluna', parent: 'hips' },
  { id: 'spine1', name: 'coluna1', parent: 'spine' },
  { id: 'chest', name: 'peito', parent: 'spine1' },
  { id: 'neck', name: 'pescoco', parent: 'chest' },
  { id: 'head', name: 'cabeca', parent: 'neck' },
];
for (const [s, S] of [['L', 'E'], ['R', 'D']]) {
  CANON.push(
    { id: `${s}_clavicle`, name: `clavicula_${S}`, parent: 'chest', side: s },
    { id: `${s}_upperarm`, name: `braco_${S}`, parent: `${s}_clavicle`, side: s },
    { id: `${s}_forearm`, name: `antebraco_${S}`, parent: `${s}_upperarm`, side: s },
    { id: `${s}_hand`, name: `mao_${S}`, parent: `${s}_forearm`, side: s },
    { id: `${s}_thigh`, name: `coxa_${S}`, parent: 'hips', side: s },
    { id: `${s}_calf`, name: `canela_${S}`, parent: `${s}_thigh`, side: s },
    { id: `${s}_foot`, name: `pe_${S}`, parent: `${s}_calf`, side: s },
    { id: `${s}_toe`, name: `dedos_pe_${S}`, parent: `${s}_foot`, side: s },
  );
  for (const [f, fname] of [['thumb', 'polegar'], ['index', 'indicador'], ['middle', 'medio'], ['ring', 'anelar'], ['pinky', 'minimo']]) {
    for (let k = 1; k <= 3; k++) {
      CANON.push({ id: `${s}_${f}${k}`, name: `${fname}${k}_${S}`, parent: k === 1 ? `${s}_hand` : `${s}_${f}${k - 1}`, side: s, finger: true });
    }
  }
}
export const CANON_BY_ID = new Map(CANON.map((c) => [c.id, c]));

// Qual osso canônico "aponta" para cada um (direção do osso = da cabeça dele até a do filho).
export const CANON_CHILD = {
  hips: 'spine', spine: 'spine1', spine1: 'chest', chest: 'neck', neck: 'head',
};
for (const s of ['L', 'R']) {
  Object.assign(CANON_CHILD, {
    [`${s}_clavicle`]: `${s}_upperarm`, [`${s}_upperarm`]: `${s}_forearm`, [`${s}_forearm`]: `${s}_hand`,
    [`${s}_hand`]: `${s}_middle1`, [`${s}_thigh`]: `${s}_calf`, [`${s}_calf`]: `${s}_foot`, [`${s}_foot`]: `${s}_toe`,
  });
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    CANON_CHILD[`${s}_${f}1`] = `${s}_${f}2`;
    CANON_CHILD[`${s}_${f}2`] = `${s}_${f}3`;
  }
}

const SIDE_L = new Set(['l', 'left', 'e', 'esq', 'esquerdo', 'esquerda']);
const SIDE_R = new Set(['r', 'right', 'd', 'dir', 'direito', 'direita']);
// prefixos que não dizem nada sobre o osso
const PREFIX = /^(mixamorig\d*|bip0?0?1|bip|b|def|org|mch|armature|ej|character\d*|cc_base|rig)$/;

/** Separa um nome de osso em palavras: "mixamorig:LeftUpLeg" -> [mixamorig, left, up, leg]. */
export function boneTokens(name) {
  return String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** { side: 'L'|'R'|'', base: 'upperarm' } */
export function parseBoneName(name) {
  let t = boneTokens(name);
  let stripped = false;
  // "Bip01 L Hand" -> [bip, 01, l, hand]: tira o prefixo e o número que vem colado nele
  while (t.length > 1 && (PREFIX.test(t[0]) || (stripped && /^\d+$/.test(t[0])))) {
    t = t.slice(1);
    stripped = true;
  }
  if (t.length === 1 && (PREFIX.test(t[0]) || /^\d+$/.test(t[0]))) return { side: '', base: '' };
  let side = '';
  const rest = [];
  for (const w of t) {
    if (!side && SIDE_L.has(w)) side = 'L';
    else if (!side && SIDE_R.has(w)) side = 'R';
    else rest.push(w);
  }
  return { side, base: rest.join('') };
}

// base do nome -> osso canônico (sem lado). A coluna é resolvida pela hierarquia depois.
const BASES = [
  [/^(pelvis|hips?|quadril|bacia)$/, 'hips'],
  [/^(neck0?1?|pescoco|neck1)$/, 'neck'],
  [/^(head|cabeca)$/, 'head'],
  [/^(clavicle|collar|shoulder|clavicula|ombro)$/, 'clavicle'],
  [/^(upperarm|arm|braco|upperarm0?1?)$/, 'upperarm'],
  [/^(forearm|lowerarm|elbow|antebraco)$/, 'forearm'],
  [/^(hand|wrist|mao)$/, 'hand'],
  [/^(thigh|upleg|upperleg|coxa)$/, 'thigh'],
  [/^(calf|leg|lowerleg|shin|knee|canela|perna)$/, 'calf'],
  [/^(foot|ankle|pe)$/, 'foot'],
  [/^(toe0?|toes|toebase|ball|dedospe|dedosdope)$/, 'toe'],
];
const SPINE = /^(spine\d*|spine0\d|chest|upperchest|torso|abdomen|coluna\d*|peito|tronco)$/;
// dedos: Mixamo "HandThumb1", Biped "Finger0/Finger01/Finger02", Unreal "thumb_01", nossos "polegar1"
const FINGER_WORDS = { thumb: 'thumb', polegar: 'thumb', index: 'index', indicador: 'index', middle: 'middle', medio: 'middle', ring: 'ring', anelar: 'ring', pinky: 'pinky', little: 'pinky', minimo: 'pinky' };
const BIPED_FINGER = ['thumb', 'index', 'middle', 'ring', 'pinky'];

function fingerOf(base) {
  const b = base.replace(/^hand/, '');
  let m = b.match(/^finger(\d)(\d)?$/); // Biped: Finger0 (polegar), Finger01, Finger02, Finger1 (indicador)...
  if (m) return `${BIPED_FINGER[Number(m[1])] || 'pinky'}${m[2] ? Number(m[2]) + 1 : 1}`;
  m = b.match(/^([a-z]+?)0?(\d)$/);
  if (m && FINGER_WORDS[m[1]]) return `${FINGER_WORDS[m[1]]}${Math.min(3, Math.max(1, Number(m[2])))}`;
  return null;
}

/**
 * Liga cada osso canônico a um osso do esqueleto.
 * @param {{name: string, parent: number}[]} bones  na ordem do esqueleto (pai antes do filho)
 * @returns {Map<string, number>} id canônico -> índice do osso
 */
export function mapHumanoid(bones) {
  const map = new Map();
  const info = bones.map((b) => parseBoneName(b.name));
  const take = (id, i) => { if (!map.has(id) && ![...map.values()].includes(i)) map.set(id, i); };
  info.forEach((p, i) => {
    for (const [re, id] of BASES) {
      if (!re.test(p.base)) continue;
      const needsSide = !['hips', 'neck', 'head'].includes(id);
      if (needsSide && !p.side) continue;
      if (!needsSide && p.side) continue;
      take(needsSide ? `${p.side}_${id}` : id, i);
      return;
    }
    if (p.side) {
      const f = fingerOf(p.base);
      if (f) take(`${p.side}_${f}`, i);
    }
  });
  // coluna: da pelve até o pai do pescoço (ou das clavículas), pela hierarquia
  const hips = map.get('hips');
  const top = map.get('neck') ?? map.get('L_clavicle') ?? map.get('L_upperarm');
  if (hips !== undefined && top !== undefined) {
    const chain = [];
    let j = bones[top].parent;
    if (map.get('neck') === undefined && map.has('L_clavicle')) j = bones[map.get('L_clavicle')].parent;
    while (j >= 0 && j !== hips) {
      chain.unshift(j);
      j = bones[j].parent;
    }
    const spineLike = chain.filter((k) => SPINE.test(info[k].base) || !info[k].base || /^spine/.test(info[k].base));
    const c = spineLike.length ? spineLike : chain;
    if (c.length) {
      map.set('chest', c[c.length - 1]);
      if (c.length >= 2) map.set('spine', c[0]);
      if (c.length >= 3) map.set('spine1', c[Math.floor((c.length - 1) / 2)] === c[0] ? c[1] : c[Math.floor((c.length - 1) / 2)]);
    }
  }
  // sem "hips" com nome claro (ex.: raiz "Bip01" do L2 fica na pelve): o pai das coxas
  if (!map.has('hips') && map.has('L_thigh')) map.set('hips', bones[map.get('L_thigh')].parent);
  return map;
}

/** Quantos ossos do corpo (sem dedos) foram reconhecidos — dá para saber se é humanoide. */
export function humanoidScore(map) {
  let n = 0;
  for (const c of CANON) if (!c.finger && map.has(c.id)) n++;
  return n;
}
export const BODY_BONES = CANON.filter((c) => !c.finger).length;

// ------------------------------------------------------------------ nosso esqueleto padrão
// Proporções de um adulto de 1,8 m em pose T (metros, Y para cima, olhando +Z, esquerda em +X).
// Usado no boneco padrão e como molde do rig automático.
export const STANDARD_POSE = {
  hips: [0, 0.98, 0],
  spine: [0, 1.1, 0],
  spine1: [0, 1.23, 0],
  chest: [0, 1.36, 0],
  neck: [0, 1.52, 0],
  head: [0, 1.62, 0.01],
  L_clavicle: [0.03, 1.47, 0.01], L_upperarm: [0.19, 1.45, -0.01], L_forearm: [0.47, 1.45, -0.02], L_hand: [0.73, 1.45, 0],
  L_thigh: [0.1, 0.93, 0], L_calf: [0.1, 0.5, 0.01], L_foot: [0.1, 0.08, -0.02], L_toe: [0.1, 0.02, 0.12],
};
for (const k of Object.keys(STANDARD_POSE)) {
  if (k.startsWith('L_')) {
    const p = STANDARD_POSE[k];
    STANDARD_POSE[`R_${k.slice(2)}`] = [-p[0], p[1], p[2]];
  }
}
// pontas (só para a direção do último osso e para os pesos)
export const STANDARD_TIPS = { head: [0, 1.8, 0.01], L_hand: [0.92, 1.45, 0.01], R_hand: [-0.92, 1.45, 0.01], L_toe: [0.1, 0.02, 0.2], R_toe: [-0.1, 0.02, 0.2] };
