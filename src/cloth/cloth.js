// Simulação de tecido (Verlet + restrições de distância), usada em capas, saias/mantos e bandeiras.
// Simples de ajustar: rigidez, dobra, peso,
// amortecimento, vento e colisão com cápsulas do corpo.
import * as THREE from 'three';
import { rng, clamp } from '../core/util.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

function shapeFactor(shape, u, rand) {
  const x = 2 * u - 1;
  switch (shape) {
    case 'v': return 0.72 + 0.28 * (1 - Math.abs(x));
    case 'redonda': return 0.78 + 0.22 * Math.sqrt(Math.max(0, 1 - x * x));
    case 'pontas': return 0.84 + 0.16 * Math.abs(Math.sin(u * Math.PI * 4));
    case 'rasgada': return 0.8 + 0.2 * rand;
    default: return 1;
  }
}

export class ClothSim {
  /**
   * @param {object} preset  ver defaultClothPreset()
   */
  constructor(preset) {
    this.preset = { ...preset };
    this.build();
  }

  build() {
    const P = this.preset;
    const type = P.type;
    const cols = Math.max(3, Math.round(P.cols));
    const rows = Math.max(3, Math.round(P.rows));
    const loop = type === 'saia';
    this.cols = cols;
    this.rows = rows;
    this.loop = loop;
    const n = cols * rows;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.rest = new Float32Array(n * 3); // posição de repouso no espaço da âncora
    this.invMass = new Float32Array(n).fill(1 / Math.max(0.05, P.mass));
    this.pins = [];
    const r = rng(7);
    const colRand = Array.from({ length: cols }, () => r());

    for (let row = 0; row < rows; row++) {
      const v = row / (rows - 1);
      for (let c = 0; c < cols; c++) {
        const u = loop ? c / cols : c / (cols - 1);
        const k = row * cols + c;
        let x = 0, y = 0, z = 0;
        if (type === 'capa') {
          const L = P.length * shapeFactor(P.shape, u, colRand[c]);
          const xs = (u - 0.5) * P.width;
          const wrap = Math.pow(Math.abs(2 * u - 1), 2);
          x = xs * (1 + P.flare * v);
          y = -v * L;
          z = -0.02 + wrap * 0.14 * (1 - v) - v * 0.06;
        } else if (type === 'saia') {
          const a = u * Math.PI * 2;
          const L = P.length * shapeFactor(P.shape, u, colRand[c]);
          const rad = P.bodyRadius + 0.04 + P.flare * v * 0.35;
          x = Math.sin(a) * rad;
          z = Math.cos(a) * rad;
          y = -v * L;
        } else {
          // bandeira: presa na coluna 0 (mastro), cresce em +X
          x = u * P.width;
          y = -v * P.length;
          z = 0;
        }
        this.rest[k * 3] = x;
        this.rest[k * 3 + 1] = y;
        this.rest[k * 3 + 2] = z;
        const pinned = type === 'bandeira' ? c === 0 : row === 0;
        if (pinned) {
          this.invMass[k] = 0;
          this.pins.push(k);
        }
      }
    }

    // Restrições: 0 = estrutural, 1 = cisalhamento, 2 = dobra
    const cons = [];
    const idx = (c, row) => row * cols + ((c + cols) % cols);
    const add = (a, b, kind) => cons.push(a, b, kind);
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const hasR = loop || c + 1 < cols;
        const hasR2 = loop || c + 2 < cols;
        if (hasR) add(idx(c, row), idx(c + 1, row), 0);
        if (row + 1 < rows) add(idx(c, row), idx(c, row + 1), 0);
        if (hasR && row + 1 < rows) {
          add(idx(c, row), idx(c + 1, row + 1), 1);
          add(idx(c + 1, row), idx(c, row + 1), 1);
        }
        if (hasR2) add(idx(c, row), idx(c + 2, row), 2);
        if (row + 2 < rows) add(idx(c, row), idx(c, row + 2), 2);
      }
    }
    const m = cons.length / 3;
    this.cA = new Uint32Array(m);
    this.cB = new Uint32Array(m);
    this.cK = new Uint8Array(m);
    this.cRest = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const a = cons[i * 3], b = cons[i * 3 + 1];
      this.cA[i] = a;
      this.cB[i] = b;
      this.cK[i] = cons[i * 3 + 2];
      this.cRest[i] = Math.hypot(
        this.rest[a * 3] - this.rest[b * 3],
        this.rest[a * 3 + 1] - this.rest[b * 3 + 1],
        this.rest[a * 3 + 2] - this.rest[b * 3 + 2],
      );
    }

    this._buildGeometry();
    this.initialized = false;
  }

  _buildGeometry() {
    const { cols, rows, loop } = this;
    const vcols = loop ? cols + 1 : cols; // coluna extra na costura da saia (UV contínuo)
    const nv = vcols * rows;
    this.vertexParticle = new Uint32Array(nv);
    const uv = new Float32Array(nv * 2);
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < vcols; c++) {
        const v = row * vcols + c;
        this.vertexParticle[v] = row * cols + (c % cols);
        const u = c / (vcols - 1);
        uv[v * 2] = this.preset.type === 'capa' ? 1 - u : u;
        uv[v * 2 + 1] = 1 - row / (rows - 1);
      }
    }
    const index = [];
    for (let row = 0; row < rows - 1; row++) {
      for (let c = 0; c < vcols - 1; c++) {
        const a = row * vcols + c, b = a + 1, cc = a + vcols, d = cc + 1;
        index.push(a, b, cc, b, d, cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.geometry?.dispose();
    this.geometry = geo;
  }

  // Coloca o tecido na pose de repouso (sem velocidade).
  reset(anchorMatrix) {
    for (let i = 0; i < this.n; i++) {
      _p.fromArray(this.rest, i * 3).applyMatrix4(anchorMatrix);
      _p.toArray(this.pos, i * 3);
      _p.toArray(this.prev, i * 3);
    }
    this.initialized = true;
    this.updateGeometry();
  }

  /**
   * @param {number} dt
   * @param {THREE.Matrix4} anchorMatrix  matriz mundial da âncora (ombros, cintura, mastro)
   * @param {Array<{a:THREE.Vector3,b:THREE.Vector3,r:number}>} colliders
   * @param {THREE.Vector3} wind  vetor de vento (m/s)
   * @param {number} time
   * @param {number|null} groundY
   */
  step(dt, anchorMatrix, colliders = [], wind = null, time = 0, groundY = null) {
    // âncora "teletransportada" (mais de 3 m num quadro): recomeça em repouso em vez de esticar
    _q.setFromMatrixPosition(anchorMatrix);
    if (this.initialized && this._lastAnchor && _q.distanceToSquared(this._lastAnchor) > 9) this.initialized = false;
    (this._lastAnchor ||= new THREE.Vector3()).copy(_q);
    if (!this.initialized) this.reset(anchorMatrix);
    if (!(dt > 1e-4)) return; // quadro sem tempo: nada a simular (evita divisão por zero)
    const P = this.preset;
    dt = Math.min(dt, 1 / 30);
    const sub = 3;
    const h = dt / sub;
    const damp = clamp(P.damping, 0, 0.5);
    const pos = this.pos, prev = this.prev, inv = this.invMass;
    const nor = this.geometry.attributes.normal.array;
    const vp = this.vertexParticle;
    // normais por partícula (aproximadas a partir da malha renderizada)
    if (!this._pn || this._pn.length !== this.n * 3) this._pn = new Float32Array(this.n * 3);
    const pn = this._pn;
    for (let v = 0; v < vp.length; v++) {
      const k = vp[v];
      pn[k * 3] = nor[v * 3]; pn[k * 3 + 1] = nor[v * 3 + 1]; pn[k * 3 + 2] = nor[v * 3 + 2];
    }
    const g = -P.gravity;
    const aero = 0.35 / Math.max(0.1, P.mass);
    const turb = P.windTurbulence;

    for (let s = 0; s < sub; s++) {
      const t = time + s * h;
      for (let i = 0; i < this.n; i++) {
        if (inv[i] === 0) continue;
        const i3 = i * 3;
        const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
        let vx = (x - prev[i3]) * (1 - damp);
        let vy = (y - prev[i3 + 1]) * (1 - damp);
        let vz = (z - prev[i3 + 2]) * (1 - damp);
        let ax = 0, ay = g, az = 0;
        if (wind) {
          const gust = 1 + turb * (Math.sin(t * 2.1 + x * 0.9 + z * 0.4) * 0.6 + Math.sin(t * 5.3 + y * 1.7 + i * 0.37) * 0.4);
          const rx = wind.x * gust - vx / h, ry = wind.y * gust - vy / h, rz = wind.z * gust - vz / h;
          const nx = pn[i3], ny = pn[i3 + 1], nz = pn[i3 + 2];
          const dn = (rx * nx + ry * ny + rz * nz) * aero;
          ax += nx * dn + rx * 0.02;
          ay += ny * dn + ry * 0.02;
          az += nz * dn + rz * 0.02;
        }
        prev[i3] = x; prev[i3 + 1] = y; prev[i3 + 2] = z;
        // limita velocidade para nunca "explodir"
        const maxStep = 0.5;
        vx = clamp(vx + ax * h * h, -maxStep, maxStep);
        vy = clamp(vy + ay * h * h, -maxStep, maxStep);
        vz = clamp(vz + az * h * h, -maxStep, maxStep);
        pos[i3] = x + vx;
        pos[i3 + 1] = y + vy;
        pos[i3 + 2] = z + vz;
      }
      this._pin(anchorMatrix);
      this._solve(colliders, groundY);
    }
    this.updateGeometry();
  }

  _pin(m) {
    for (const k of this.pins) {
      _p.fromArray(this.rest, k * 3).applyMatrix4(m);
      _p.toArray(this.pos, k * 3);
      _p.toArray(this.prev, k * 3);
    }
  }

  _solve(colliders, groundY) {
    const P = this.preset;
    const pos = this.pos, inv = this.invMass;
    const stiff = [clamp(P.stiffness, 0.05, 1), clamp(P.stiffness * 0.7, 0.02, 1), clamp(P.bend, 0, 1)];
    const iters = Math.max(1, Math.round(P.iterations / 3));
    const m = this.cA.length;
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < m; c++) {
        const k = stiff[this.cK[c]];
        if (k <= 0) continue;
        const a = this.cA[c] * 3, b = this.cB[c] * 3;
        const wa = inv[this.cA[c]], wb = inv[this.cB[c]];
        const w = wa + wb;
        if (w === 0) continue;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - this.cRest[c]) / d) * k / w;
        pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
      }
      if (P.collision && colliders.length) this._collide(colliders);
      if (groundY !== null) {
        for (let i = 0; i < this.n; i++) if (pos[i * 3 + 1] < groundY + 0.01) pos[i * 3 + 1] = groundY + 0.01;
      }
    }
  }

  _collide(colliders) {
    const pos = this.pos, inv = this.invMass;
    for (let i = 0; i < this.n; i++) {
      if (inv[i] === 0) continue;
      _p.fromArray(pos, i * 3);
      for (const col of colliders) {
        // ponto mais próximo no segmento a-b
        _a.subVectors(col.b, col.a);
        const len2 = _a.lengthSq();
        let t = len2 > 0 ? _b.subVectors(_p, col.a).dot(_a) / len2 : 0;
        t = clamp(t, 0, 1);
        _q.copy(col.a).addScaledVector(_a, t);
        _b.subVectors(_p, _q);
        const d = _b.length();
        const r = col.r + 0.015;
        if (d < r) {
          if (d < 1e-5) _b.set(0, 0, -1); else _b.divideScalar(d);
          _p.copy(_q).addScaledVector(_b, r);
        }
      }
      _p.toArray(pos, i * 3);
    }
  }

  updateGeometry() {
    const pa = this.geometry.attributes.position.array;
    const vp = this.vertexParticle;
    for (let v = 0; v < vp.length; v++) {
      const k = vp[v] * 3;
      pa[v * 3] = this.pos[k];
      pa[v * 3 + 1] = this.pos[k + 1];
      pa[v * 3 + 2] = this.pos[k + 2];
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry?.dispose();
  }
}

// Textura da capa: cor principal, faixa de acabamento e emblema centralizado.
export function makeClothTexture(preset, emblemImage = null) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = preset.colorOuter;
  ctx.fillRect(0, 0, 512, 512);
  // leve variação de tecido
  const r = rng(3);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},0.035)`;
    ctx.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  if (preset.type !== 'bandeira') {
    ctx.fillStyle = preset.colorInner;
    ctx.fillRect(0, 490, 512, 22);
    ctx.fillRect(0, 474, 512, 5);
  } else {
    ctx.strokeStyle = preset.colorInner;
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 498, 498);
  }
  if (emblemImage) {
    const s = preset.type === 'bandeira' ? 300 : 230;
    const cy = preset.type === 'bandeira' ? 256 : 190;
    ctx.drawImage(emblemImage, 256 - s / 2, cy - s / 2, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Cria as duas faces do tecido (fora e dentro com cores diferentes).
export function makeClothMeshes(sim, preset, emblemImage = null) {
  const map = makeClothTexture(preset, emblemImage);
  const outer = new THREE.MeshStandardMaterial({ map, side: THREE.FrontSide, roughness: 1 - preset.shininess * 0.6, metalness: 0, envMapIntensity: 0.5 });
  const inner = new THREE.MeshStandardMaterial({ color: preset.colorInner, side: THREE.BackSide, roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
  const group = new THREE.Group();
  const a = new THREE.Mesh(sim.geometry, outer);
  const b = new THREE.Mesh(sim.geometry, inner);
  for (const m of [a, b]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
  }
  group.userData.materials = [outer, inner];
  return group;
}

export function disposeClothMeshes(group) {
  for (const m of group.userData.materials || []) {
    m.map?.dispose();
    m.dispose();
  }
}
