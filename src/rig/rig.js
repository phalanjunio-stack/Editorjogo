// Personagens com esqueleto no three.js: montar a partir do .psk/.psa, analisar qualquer rig
// (GLB, FBX, .psk) e copiar animações de um esqueleto para outro (retarget).
//
// Retarget por direção dos ossos, num referencial comum (em pé, olhando para a frente, esquerda
// num lado fixo): cada osso do destino gira como o osso equivalente da origem gira a partir da
// pose de descanso dela, com uma correção fixa que alinha as poses de descanso (pose T x pose A).
// O quadril também anda (pulo, balanço), na escala da altura do personagem.
import * as THREE from 'three';
import { ueToViewPos, ueToViewQuat, trueLocalRot } from './actorx.js';
import { mapHumanoid, humanoidScore, CANON_CHILD } from './humanoid.js';

export const safeName = (n) => THREE.PropertyBinding.sanitizeNodeName(String(n)) || 'osso';

function uniqueNamer() {
  const used = new Set();
  return (n) => {
    let s = safeName(n);
    let k = 2;
    while (used.has(s)) s = `${safeName(n)}_${k++}`;
    used.add(s);
    return s;
  };
}

// ------------------------------------------------------------------ .psk -> SkinnedMesh
/** Ossos a partir da lista do ActorX (REFSKELT ou BONENAMES). */
export function bonesFromActorX(list) {
  const unique = uniqueNamer();
  const bones = list.map((b, i) => {
    const bone = new THREE.Bone();
    bone.name = unique(b.name);
    bone.userData.srcName = b.name;
    const q = ueToViewQuat(trueLocalRot(b, i));
    bone.quaternion.set(q[0], q[1], q[2], q[3]).normalize();
    const p = ueToViewPos(b.pos);
    bone.position.set(p[0], p[1], p[2]);
    return bone;
  });
  list.forEach((b, i) => {
    if (i > 0) (bones[b.parent] && b.parent !== i ? bones[b.parent] : bones[0]).add(bones[i]);
  });
  return bones;
}

const PALETTE = ['#b9a58e', '#8a6f58', '#6d7684', '#a08a6a', '#7b5b4a', '#9aa3ad'];

/**
 * Monta o personagem de um .psk (malha, UVs, materiais e pesos), já em pé (Y para cima).
 * Fica na unidade do arquivo; quem usa escala para a altura desejada.
 */
export function objectFromPsk(psk, { name = 'personagem' } = {}) {
  const bones = bonesFromActorX(psk.bones);
  const nW = psk.wedges.length;
  const pos = new Float32Array(nW * 3);
  const uv = new Float32Array(nW * 2);
  const skinIndex = new Uint16Array(nW * 4);
  const skinWeight = new Float32Array(nW * 4);
  // pesos por ponto, os 4 maiores
  const perPoint = new Map();
  for (const w of psk.weights) {
    if (!(w.w > 0)) continue;
    if (!perPoint.has(w.point)) perPoint.set(w.point, []);
    perPoint.get(w.point).push([w.bone, w.w]);
  }
  for (const [k, list] of perPoint) {
    list.sort((a, b) => b[1] - a[1]);
    perPoint.set(k, list.slice(0, 4));
  }
  psk.wedges.forEach((w, i) => {
    const p = ueToViewPos([psk.points[w.point * 3], psk.points[w.point * 3 + 1], psk.points[w.point * 3 + 2]]);
    pos.set(p, i * 3);
    uv[i * 2] = w.u;
    uv[i * 2 + 1] = 1 - w.v;
    const ws = perPoint.get(w.point) || [[0, 1]];
    const tot = ws.reduce((s, x) => s + x[1], 0) || 1;
    ws.forEach(([b, v], k) => { skinIndex[i * 4 + k] = b; skinWeight[i * 4 + k] = v / tot; });
  });
  // faces: horário no .psk -> anti-horário no three; agrupadas por material
  const faces = [...psk.faces].sort((a, b) => a.mat - b.mat);
  const index = new Uint32Array(faces.length * 3);
  const g = new THREE.BufferGeometry();
  let start = 0;
  faces.forEach((f, i) => {
    index[i * 3] = f.w[0];
    index[i * 3 + 1] = f.w[2];
    index[i * 3 + 2] = f.w[1];
    if (i === faces.length - 1 || faces[i + 1].mat !== f.mat) {
      g.addGroup(start * 3, (i + 1 - start) * 3, f.mat);
      start = i + 1;
    }
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  const nMat = Math.max(1, psk.materials.length, ...psk.faces.map((f) => f.mat + 1));
  const mats = Array.from({ length: nMat }, (_, i) => new THREE.MeshStandardMaterial({
    name: psk.materials[i] || `material_${i}`, color: PALETTE[i % PALETTE.length], roughness: 0.75,
  }));
  return bindSkinned(name, g, mats, bones);
}

/** Junta geometria (com skinIndex/skinWeight) + ossos num personagem pronto para animar. */
export function bindSkinned(name, geometry, materials, bones) {
  const root = new THREE.Group();
  root.name = name;
  const mesh = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.name = `${name}_malha`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // a caixa da malha parada não acompanha a animação
  root.add(mesh, bones[0]);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
  return root;
}

/** Só o esqueleto (para tocar/copiar as animações de um .psa sem a malha). */
export function objectFromBones(list, name = 'esqueleto') {
  const root = new THREE.Group();
  root.name = name;
  const bones = bonesFromActorX(list);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  return root;
}

// ------------------------------------------------------------------ .psa -> clipes
/**
 * Cada sequência do .psa vira um AnimationClip (com o 1º quadro repetido no fim: as animações
 * do L2 dão a volta do último para o primeiro).
 * @param {object} psa  readPsa()
 * @param {THREE.Object3D} [target] esqueleto que vai tocar: casa os nomes ignorando maiúsculas
 */
export function clipsFromPsa(psa, target = null) {
  const byLower = new Map();
  target?.traverse((o) => { if (o.isBone) byLower.set(String(o.userData.srcName || o.name).toLowerCase(), o.name); });
  const unique = uniqueNamer();
  const names = psa.bones.map((b) => byLower.get(b.name.toLowerCase()) || unique(b.name));
  const nb = psa.bones.length;
  const K = psa.keys;
  return psa.sequences.map((seq) => {
    const frames = Math.max(1, seq.frames);
    const rate = seq.rate > 0 ? seq.rate : 30;
    const times = new Float32Array(frames + 1);
    for (let f = 0; f <= frames; f++) times[f] = f / rate;
    const tracks = [];
    for (let k = 0; k < nb; k++) {
      const q = new Float32Array((frames + 1) * 4);
      const p = new Float32Array((frames + 1) * 3);
      let prev = null;
      for (let f = 0; f <= frames; f++) {
        const o = ((seq.first + (f % frames)) * nb + k) * 8;
        const raw = [K[o + 3], K[o + 4], K[o + 5], K[o + 6]];
        const loc = k === 0 ? raw : [-raw[0], -raw[1], -raw[2], raw[3]];
        const v = ueToViewQuat(loc);
        if (prev && prev[0] * v[0] + prev[1] * v[1] + prev[2] * v[2] + prev[3] * v[3] < 0) for (let c = 0; c < 4; c++) v[c] = -v[c];
        q.set(v, f * 4);
        prev = v;
        p.set(ueToViewPos([K[o], K[o + 1], K[o + 2]]), f * 3);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${names[k]}.quaternion`, times, q));
      tracks.push(new THREE.VectorKeyframeTrack(`${names[k]}.position`, times, p));
    }
    const clip = new THREE.AnimationClip(seq.name, frames / rate, tracks);
    clip.userData = { source: 'psa', rate };
    return clip;
  });
}

// ------------------------------------------------------------------ análise de um rig
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

/**
 * Tudo que o retarget precisa saber de um personagem/esqueleto:
 * ossos (pai antes do filho), mapa humanoide, pose de descanso no espaço do objeto e o
 * referencial (para onde ele olha).
 */
/** Guarda a pose de descanso de cada osso (chame logo ao carregar, antes de tocar animações). */
export function captureRest(object) {
  object.traverse((o) => {
    if (o.isBone && !o.userData.rest) o.userData.rest = { p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray() };
  });
  return object;
}

/** Volta todos os ossos para a pose de descanso. */
export function resetPose(object) {
  object.traverse((o) => {
    const r = o.isBone && o.userData.rest;
    if (r) { o.position.fromArray(r.p); o.quaternion.fromArray(r.q); o.scale.fromArray(r.s); }
  });
}

export function rigInfo(object) {
  captureRest(object);
  const bones = [];
  object.traverse((o) => { if (o.isBone) bones.push(o); });
  const index = new Map(bones.map((b, i) => [b, i]));
  const list = bones.map((b) => ({ name: b.userData.srcName || b.name, parent: index.has(b.parent) ? index.get(b.parent) : -1 }));
  const map = mapHumanoid(list);
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  // pai (não osso) de cada osso de cima: fica parado
  const base = bones.map((b, i) => (list[i].parent >= 0 ? null : new THREE.Matrix4().multiplyMatrices(inv, b.parent ? b.parent.matrixWorld : new THREE.Matrix4())));
  const restLocal = bones.map((b) => {
    const r = b.userData.rest;
    return { p: new THREE.Vector3().fromArray(r.p), q: new THREE.Quaternion().fromArray(r.q), s: new THREE.Vector3().fromArray(r.s) };
  });
  const restWorld = [];
  bones.forEach((b, i) => {
    const m = new THREE.Matrix4().compose(restLocal[i].p, restLocal[i].q, restLocal[i].s);
    restWorld.push(new THREE.Matrix4().multiplyMatrices(list[i].parent >= 0 ? restWorld[list[i].parent] : base[i], m));
  });
  const restPos = restWorld.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const restQuat = restWorld.map((m) => { const q = new THREE.Quaternion(); m.decompose(_s, q, new THREE.Vector3()); return q; });
  const info = { object, bones, list, map, restPos, restQuat, restWorld, restLocal, base, index };
  info.frame = rigFrame(info);
  info.score = humanoidScore(map);
  return info;
}

const P = (info, id) => (info.map.has(id) ? info.restPos[info.map.get(id)] : null);

/** Quaternion que leva o espaço do objeto para o referencial comum (esquerda +X, cima +Y, frente +Z). */
function rigFrame(info) {
  const pick = (...ids) => ids.map((id) => P(info, id)).find(Boolean);
  const L = pick('L_upperarm', 'L_thigh', 'L_clavicle', 'L_hand');
  const R = pick('R_upperarm', 'R_thigh', 'R_clavicle', 'R_hand');
  const top = pick('head', 'neck', 'chest');
  const lf = P(info, 'L_foot'), rf = P(info, 'R_foot');
  const bottom = lf && rf ? lf.clone().add(rf).multiplyScalar(0.5) : pick('hips');
  if (!L || !R || !top || !bottom) return new THREE.Quaternion();
  const left = L.clone().sub(R.clone());
  const up = top.clone().sub(bottom);
  if (left.lengthSq() < 1e-12 || up.lengthSq() < 1e-12) return new THREE.Quaternion();
  up.normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
  const lx = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // colunas = eixos do personagem no espaço do objeto; a inversa leva para o referencial comum
  const m = new THREE.Matrix4().makeBasis(lx, up, fwd);
  return new THREE.Quaternion().setFromRotationMatrix(m).invert();
}

/** Altura do quadril acima dos pés, no referencial comum (para escalar o movimento do quadril). */
function hipsHeight(info) {
  const h = P(info, 'hips');
  if (!h) return 1;
  const feet = ['L_foot', 'R_foot', 'L_toe', 'R_toe'].map((id) => P(info, id)).filter(Boolean);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(info.frame.clone().invert());
  const low = feet.length ? Math.min(...feet.map((p) => p.dot(up))) : 0;
  return Math.max(1e-6, h.dot(up) - low);
}

/** Direção de descanso de um osso canônico (da cabeça dele até o filho), no referencial comum. */
function restDir(info, id) {
  const i = info.map.get(id);
  const childId = CANON_CHILD[id];
  let a = info.restPos[i], b = null;
  if (childId && info.map.has(childId)) b = P(info, childId);
  else {
    // ponta: segue a direção do pai canônico (cabeça, mão sem dedos, dedos do pé)
    const kids = info.bones[i].children.filter((c) => c.isBone);
    if (kids.length) b = info.restPos[info.index.get(kids[0])];
  }
  if (!b || b.distanceToSquared(a) < 1e-12) return null;
  return b.clone().sub(a).normalize().applyQuaternion(info.frame);
}

// ------------------------------------------------------------------ retarget
function trackTable(clip) {
  const t = new Map();
  for (const tr of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(tr.name);
    if (!t.has(nodeName)) t.set(nodeName, {});
    t.get(nodeName)[propertyName] = tr.createInterpolant();
  }
  return t;
}

/** Os dois esqueletos têm os mesmos ossos (nomes)? Então a animação toca sem conversão. */
export function sameSkeleton(src, dst) {
  if (src.bones.length !== dst.bones.length) return false;
  const names = new Set(dst.bones.map((b) => String(b.userData.srcName || b.name).toLowerCase()));
  return src.bones.every((b) => names.has(String(b.userData.srcName || b.name).toLowerCase()));
}

/**
 * Copia um clipe de um rig (src) para outro (dst). Devolve um AnimationClip novo, com trilhas
 * de rotação nos ossos equivalentes do destino e a posição do quadril.
 * @param {{fps?: number, inPlace?: boolean, name?: string}} [opts]
 */
export function retargetClip(clip, src, dst, { fps = 30, inPlace = false, name } = {}) {
  const table = trackTable(clip);
  const nS = src.bones.length, nD = dst.bones.length;
  // pares canônicos presentes nos dois
  const pairs = [];
  const dstCanon = new Map();
  for (const [id, di] of dst.map) {
    if (!src.map.has(id)) continue;
    const si = src.map.get(id);
    const ds = restDir(src, id), dd = restDir(dst, id);
    const corr = ds && dd ? new THREE.Quaternion().setFromUnitVectors(ds, dd).invert() : new THREE.Quaternion();
    pairs.push({ id, si, di, corr });
    dstCanon.set(di, pairs[pairs.length - 1]);
  }
  if (!pairs.length) throw new Error('nenhum osso em comum (os esqueletos não parecem humanoides)');

  const Fs = src.frame, Ft = dst.frame, FtInv = Ft.clone().invert(), FsInv = Fs.clone().invert();
  const hipsS = src.map.get('hips'), hipsD = dst.map.get('hips');
  const k = hipsS !== undefined && hipsD !== undefined ? hipsHeight(dst) / hipsHeight(src) : 1;

  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = Math.min(clip.duration, f / fps);
  const outQ = new Map();
  for (const pr of pairs) outQ.set(pr.di, new Float32Array(frames * 4));
  const outHips = hipsD !== undefined && hipsS !== undefined ? new Float32Array(frames * 3) : null;

  // buffers
  const sW = Array.from({ length: nS }, () => new THREE.Matrix4());
  const sQ = Array.from({ length: nS }, () => new THREE.Quaternion());
  const dW = Array.from({ length: nD }, () => new THREE.Matrix4());
  const dQ = Array.from({ length: nD }, () => new THREE.Quaternion());
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), v = new THREE.Vector3();
  const prevQ = new Map();

  for (let f = 0; f < frames; f++) {
    const t = times[f];
    // ---- pose da origem
    for (let i = 0; i < nS; i++) {
      const b = src.bones[i];
      const r = src.restLocal[i];
      const tr = table.get(b.name);
      lp.copy(r.p);
      lq.copy(r.q);
      if (tr?.quaternion) lq.fromArray(tr.quaternion.evaluate(t)).normalize();
      if (tr?.position) lp.fromArray(tr.position.evaluate(t));
      tmpM.compose(lp, lq, r.s);
      const par = src.list[i].parent;
      sW[i].multiplyMatrices(par >= 0 ? sW[par] : src.base[i], tmpM);
      sW[i].decompose(v, sQ[i], ls);
    }
    // ---- pose do destino
    for (let i = 0; i < nD; i++) {
      const r = dst.restLocal[i];
      const par = dst.list[i].parent;
      const parentW = par >= 0 ? dW[par] : dst.base[i];
      const pr = dstCanon.get(i);
      lp.copy(r.p);
      if (pr) {
        // D = Fs · Qs(t) · Qs_rest⁻¹ · Fs⁻¹ ; Qt(t) = Ft⁻¹ · D · C⁻¹ · Ft · Qt_rest
        tmpQ.copy(Fs).multiply(sQ[pr.si]).multiply(src.restQuat[pr.si].clone().invert()).multiply(FsInv);
        const world = FtInv.clone().multiply(tmpQ).multiply(pr.corr).multiply(Ft).multiply(dst.restQuat[i]);
        const parQ = par >= 0 ? dQ[par] : quatOf(dst.base[i]);
        lq.copy(parQ).invert().multiply(world).normalize();
        const pq = prevQ.get(i);
        if (pq && pq.dot(lq) < 0) lq.set(-lq.x, -lq.y, -lq.z, -lq.w);
        prevQ.set(i, lq.clone());
        outQ.get(i).set([lq.x, lq.y, lq.z, lq.w], f * 4);
        if (i === hipsD && outHips) {
          // movimento do quadril: o da origem, no referencial comum, na escala do destino
          const ds = new THREE.Vector3().setFromMatrixPosition(sW[hipsS]).sub(src.restPos[hipsS]).applyQuaternion(Fs).multiplyScalar(k);
          if (inPlace) { ds.x = 0; ds.z = 0; }
          const wp = dst.restPos[i].clone().add(ds.applyQuaternion(FtInv));
          lp.copy(wp.applyMatrix4(tmpM.copy(parentW).invert()));
          outHips.set([lp.x, lp.y, lp.z], f * 3);
        }
      } else {
        lq.copy(r.q);
      }
      tmpM.compose(lp, lq, r.s);
      dW[i].multiplyMatrices(parentW, tmpM);
      dW[i].decompose(v, dQ[i], ls);
    }
  }
  const tracks = [];
  for (const pr of pairs) tracks.push(new THREE.QuaternionKeyframeTrack(`${dst.bones[pr.di].name}.quaternion`, times, outQ.get(pr.di)));
  if (outHips) tracks.push(new THREE.VectorKeyframeTrack(`${dst.bones[hipsD].name}.position`, times, outHips));
  const out = new THREE.AnimationClip(name || clip.name, clip.duration, tracks);
  out.userData = { ...(clip.userData || {}), retargeted: true, from: clip.name };
  return out;
}

function quatOf(m) {
  const q = new THREE.Quaternion();
  m.decompose(_s, q, new THREE.Vector3());
  return q;
}

/**
 * Prepara um clipe para tocar em "dst": se o esqueleto é o mesmo, só acerta os nomes das
 * trilhas; senão faz o retarget.
 */
export function adaptClip(clip, src, dst, opts = {}) {
  // mesmo esqueleto e mesmo tamanho: só acerta os nomes (senão o quadril andaria na escala errada)
  if (sameSkeleton(src, dst) && Math.abs(hipsHeight(dst) / hipsHeight(src) - 1) < 0.02) {
    const byLower = new Map(dst.bones.map((b) => [String(b.userData.srcName || b.name).toLowerCase(), b.name]));
    const srcLower = new Map(src.bones.map((b) => [b.name, String(b.userData.srcName || b.name).toLowerCase()]));
    const tracks = clip.tracks.map((tr) => {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(tr.name);
      const to = byLower.get(srcLower.get(nodeName) || nodeName.toLowerCase()) || nodeName;
      const c = tr.clone();
      c.name = `${to}.${propertyName}`;
      return c;
    });
    const out = new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);
    out.userData = { ...(clip.userData || {}) };
    return out;
  }
  return retargetClip(clip, src, dst, opts);
}

/** Material PBR equivalente (FBX e OBJ vêm com Phong/Lambert; o GLB do jogo usa PBR). */
export function toStandardMaterial(m) {
  if (!m || m.isMeshStandardMaterial) return m;
  const out = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color ? m.color.clone() : new THREE.Color('#ffffff'),
    map: m.map || null,
    normalMap: m.normalMap || null,
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0),
    emissiveMap: m.emissiveMap || null,
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || 0,
    side: m.side,
    roughness: 0.8,
    metalness: 0,
  });
  return out;
}

export function standardizeMaterials(object) {
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(toStandardMaterial) : toStandardMaterial(o.material);
  });
  return object;
}

/** Altura (Y) do personagem em pé, na unidade dele, pela malha ou pelos ossos. */
export function measureHeight(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let has = false;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      has = true;
    }
  });
  if (!has) object.traverse((o) => { if (o.isBone) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  return { height: Math.max(1e-6, box.max.y - box.min.y), box };
}
