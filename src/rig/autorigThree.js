// Ponte do rig automático com o three.js: junta as malhas de um modelo estático numa malha só
// (pontos soldados, para achar os contornos e os vizinhos), e depois monta o personagem com o
// nosso esqueleto e os pesos calculados.
import * as THREE from 'three';
import { orientMesh, detectMarkers, skeletonFromMarkers, rigWeights, addJointLoops, decimate, flatTris, bounds } from './autorig.js';
import { STANDARD_BONES, standardBones } from './standard.js';
import { bindSkinned, captureRest } from './rig.js';

/**
 * Junta todas as malhas do objeto (no espaço dele). Pontos na mesma posição viram um só.
 * @returns {{mesh: {points: number[], tris: {p:number[], uv:number[][], mat:number}[]}, materials: THREE.Material[]}}
 */
export function meshFromObject(object) {
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const box = new THREE.Box3().setFromObject(object);
  const tol = Math.max(1e-9, box.getSize(new THREE.Vector3()).length() * 1e-6);
  const key = new Map();
  const points = [];
  const tris = [];
  const materials = [];
  const matIndex = new Map();
  const v = new THREE.Vector3();
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const gmat = mats.map((mt) => {
      if (!matIndex.has(mt)) { matIndex.set(mt, materials.length); materials.push(mt); }
      return matIndex.get(mt);
    });
    const pid = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const k = `${Math.round(v.x / tol)},${Math.round(v.y / tol)},${Math.round(v.z / tol)}`;
      let id = key.get(k);
      if (id === undefined) { id = points.length / 3; key.set(k, id); points.push(v.x, v.y, v.z); }
      pid[i] = id;
    }
    const idx = g.index ? g.index.array : null;
    const count = idx ? idx.length : pos.count;
    const flip = m.determinant() < 0;
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const gr of groups) {
      for (let t = gr.start; t + 2 < gr.start + gr.count; t += 3) {
        let c = [0, 1, 2].map((k) => (idx ? idx[t + k] : t + k));
        if (flip) c = [c[0], c[2], c[1]];
        const p = c.map((k) => pid[k]);
        if (p[0] === p[1] || p[1] === p[2] || p[0] === p[2]) continue;
        tris.push({ p, uv: c.map((k) => (uv ? [uv.getX(k), uv.getY(k)] : [0, 0])), mat: gmat[gr.materialIndex ?? 0] ?? gmat[0] });
      }
    }
  });
  if (!materials.length) materials.push(new THREE.MeshStandardMaterial({ color: '#b9a58e' }));
  return { mesh: { points, tris }, materials: materials.map((m) => m.clone()) };
}

/** Sessão do rig automático: malha orientada + marcadores que o usuário pode ajustar. */
export class AutoRigSession {
  constructor(object, name) {
    this.name = name;
    const { mesh, materials } = meshFromObject(object);
    this.materials = materials;
    const o = orientMesh(Float64Array.from(mesh.points));
    this.rotated = o.degrees;
    // pés no chão e centralizado (mais fácil de ver e de ajustar)
    const b = bounds(o.points);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    for (let i = 0; i < o.points.length; i += 3) { o.points[i] -= cx; o.points[i + 1] -= b.min[1]; o.points[i + 2] -= cz; }
    this.mesh = { points: Array.from(o.points), tris: mesh.tris };
    this.original = { points: [...this.mesh.points], tris: this.mesh.tris.map((t) => ({ ...t })) };
    this.markers = null;
    this.report = null;
    this.headless = false;
  }

  get triangles() {
    return this.mesh.tris.length;
  }

  get height() {
    const b = bounds(this.mesh.points);
    return b.size[1];
  }

  /** Reduz os polígonos (malhas de IA vêm com dezenas de milhares). */
  reduce(target) {
    const r = decimate(this.mesh, target);
    this.markers = null;
    return r;
  }

  detect({ headless = false } = {}) {
    this.headless = headless;
    const r = detectMarkers(Float64Array.from(this.mesh.points), flatTris(this.mesh), { headless });
    this.markers = r.markers;
    this.top = r.top;
    this.report = r.report;
    return r;
  }

  /** Cria o personagem: anéis nas juntas (opcional), nosso esqueleto e pesos. */
  build({ loops = true } = {}) {
    if (!this.markers) this.detect({ headless: this.headless });
    const mesh = { points: [...this.mesh.points], tris: this.mesh.tris.map((t) => ({ ...t })) };
    const nLoops = loops ? addJointLoops(mesh, this.markers) : 0;
    const { pose, tips } = skeletonFromMarkers(this.markers, { top: this.top, headless: this.headless });
    const unit = this.height / 1.8;
    const defs = STANDARD_BONES.map((b) => ({ name: b.name, parent: b.parent, canon: b.id, attach: b.attach }));
    const pts = Float64Array.from(mesh.points);
    const weights = rigWeights(pts, flatTris(mesh), defs, pose, tips);
    const { bones } = standardBones(pose, tips, unit);
    const geometry = geometryFromMesh(mesh, weights);
    const root = bindSkinned(this.name, geometry, this.materials, bones);
    return { root: captureRest(root), loops: nLoops };
  }
}

/** Geometria com UVs, normais suaves (por ponto) e pesos por ponto. */
export function geometryFromMesh(mesh, weights) {
  const nP = mesh.points.length / 3;
  // normais por ponto (pesadas pela área): sem quina nas costuras de UV
  const nrm = new Float32Array(nP * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const pt = (i, out) => out.set(mesh.points[i * 3], mesh.points[i * 3 + 1], mesh.points[i * 3 + 2]);
  for (const t of mesh.tris) {
    pt(t.p[0], a); pt(t.p[1], b); pt(t.p[2], c);
    n.subVectors(c, b).cross(a.clone().sub(b));
    for (const p of t.p) { nrm[p * 3] += n.x; nrm[p * 3 + 1] += n.y; nrm[p * 3 + 2] += n.z; }
  }
  const vkey = new Map();
  const pos = [], uv = [], nor = [], si = [], sw = [];
  const byMat = new Map();
  for (const t of mesh.tris) {
    const ids = t.p.map((p, k) => {
      const u = t.uv[k];
      const key = `${p}|${u[0].toFixed(5)}|${u[1].toFixed(5)}`;
      let id = vkey.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        vkey.set(key, id);
        pos.push(mesh.points[p * 3], mesh.points[p * 3 + 1], mesh.points[p * 3 + 2]);
        uv.push(u[0], u[1]);
        n.set(nrm[p * 3], nrm[p * 3 + 1], nrm[p * 3 + 2]).normalize();
        nor.push(n.x, n.y, n.z);
        const ws = weights[p] && weights[p].length ? weights[p] : [[1, 1]];
        for (let k2 = 0; k2 < 4; k2++) { si.push(ws[k2] ? ws[k2][0] : 0); sw.push(ws[k2] ? ws[k2][1] : 0); }
      }
      return id;
    });
    if (!byMat.has(t.mat)) byMat.set(t.mat, []);
    byMat.get(t.mat).push(...ids);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const index = [];
  let start = 0;
  for (const [mat, list] of [...byMat].sort((x, y) => x[0] - y[0])) {
    index.push(...list);
    g.addGroup(start, list.length, mat);
    start += list.length;
  }
  g.setIndex(index);
  return g;
}
