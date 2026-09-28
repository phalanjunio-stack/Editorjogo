// Kit de geometria do Construtor: junta caixas e faces por "parte" (parede, madeira, base, telhado,
// porta, ferro, vidro) com UV em metros alinhadas ao mundo — a textura continua de uma peça para a
// outra (tijolos alinhados em volta das janelas) e a madeira segue o comprimento da viga.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _t = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();

export class GeoAcc {
  constructor() {
    this.slots = new Map();
  }

  slot(name) {
    let s = this.slots.get(name);
    if (!s) { s = { pos: [], nor: [], uv: [], idx: [] }; this.slots.set(name, s); }
    return s;
  }

  /** Eixos da textura numa face: u horizontal (ou ao longo do "grain"), v subindo pela face. */
  static axes(n, grain = null, outT = _t, outB = _b) {
    if (grain) {
      outT.copy(grain).addScaledVector(n, -grain.dot(n));
      if (outT.lengthSq() > 1e-6) {
        outT.normalize();
        outB.crossVectors(n, outT);
        return;
      }
    }
    outT.crossVectors(UP, n);
    if (outT.lengthSq() < 1e-6) outT.set(1, 0, 0);
    outT.normalize();
    outB.crossVectors(n, outT);
  }

  /** Polígono plano (pontos em ordem anti-horária vistos de fora). */
  poly(slot, pts, { grain = null, uvOff = null, normal = null } = {}) {
    if (pts.length < 3) return;
    const s = this.slot(slot);
    if (normal) _n.copy(normal);
    else {
      // normal pelo método de Newell (serve para polígonos côncavos)
      _n.set(0, 0, 0);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        _n.x += (a.y - b.y) * (a.z + b.z);
        _n.y += (a.z - b.z) * (a.x + b.x);
        _n.z += (a.x - b.x) * (a.y + b.y);
      }
      if (_n.lengthSq() < 1e-12) return;
      _n.normalize();
    }
    GeoAcc.axes(_n, grain);
    const base = s.pos.length / 3;
    const ou = uvOff ? uvOff[0] : 0, ov = uvOff ? uvOff[1] : 0;
    for (const p of pts) {
      s.pos.push(p.x, p.y, p.z);
      s.nor.push(_n.x, _n.y, _n.z);
      s.uv.push(p.dot(_t) + ou, p.dot(_b) + ov);
    }
    if (pts.length === 3 || pts.length === 4) {
      s.idx.push(base, base + 1, base + 2);
      if (pts.length === 4) s.idx.push(base, base + 2, base + 3);
    } else {
      // triangula no plano da face
      const flat = pts.map((p) => new THREE.Vector2(p.dot(_t), p.dot(_b)));
      const tris = THREE.ShapeUtils.triangulateShape(flat, []);
      for (const t of tris) {
        const [a, b, c] = t.map((k) => flat[k]);
        const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        s.idx.push(base + t[0], base + (cr >= 0 ? t[1] : t[2]), base + (cr >= 0 ? t[2] : t[1]));
      }
    }
  }

  /**
   * Caixa orientada: centro c e três semi-eixos (vetores). Faces só para fora.
   * grain: direção da madeira/veio (por padrão o maior eixo, se opts.grain === 'long').
   */
  obox(slot, c, ax, ay, az, { grain = null, skip = null } = {}) {
    let g = grain;
    if (g === 'long') {
      const l = [ax, ay, az].sort((p, q) => q.lengthSq() - p.lengthSq())[0];
      g = l.clone().normalize();
    }
    const P = (sx, sy, sz) => c.clone().addScaledVector(ax, sx).addScaledVector(ay, sy).addScaledVector(az, sz);
    const faces = [
      ['px', [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)]],
      ['nx', [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)]],
      ['py', [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)]],
      ['ny', [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)]],
      ['pz', [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)]],
      ['nz', [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)]],
    ];
    // se os eixos formam um sistema "canhoto", inverte a ordem para as faces apontarem para fora
    const flip = new THREE.Vector3().crossVectors(ax, ay).dot(az) < 0;
    for (const [k, f] of faces) {
      if (skip && skip.includes(k)) continue;
      this.poly(slot, flip ? f.reverse() : f, { grain: g });
    }
  }

  /** Caixa alinhada a uma direção horizontal (yaw) — o caso mais comum. */
  box(slot, cx, cy, cz, sx, sy, sz, dir = null, opts = {}) {
    const d = dir ? new THREE.Vector3(dir.x, 0, dir.z).normalize() : new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3(-d.z, 0, d.x);
    this.obox(slot, new THREE.Vector3(cx, cy, cz), d.multiplyScalar(sx / 2), new THREE.Vector3(0, sy / 2, 0), side.multiplyScalar(sz / 2), opts);
  }

  /** Viga entre dois pontos (seção quadrada w×h), veio no comprimento. */
  beam(slot, a, b, w, h = w, up = UP) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return;
    const dir = d.clone().divideScalar(len);
    let side = new THREE.Vector3().crossVectors(dir, up);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    const nup = new THREE.Vector3().crossVectors(side, dir).normalize();
    const c = a.clone().add(b).multiplyScalar(0.5);
    this.obox(slot, c, dir.multiplyScalar(len / 2), nup.multiplyScalar(h / 2), side.multiplyScalar(w / 2), { grain: d.normalize() });
  }

  /** Prisma vertical com base poligonal (pilar, torre, fundação). */
  prism(slot, pts2, y0, y1, { top = true, bottom = false, sideSlot = null } = {}) {
    const n = pts2.length;
    const ccw = area2(pts2) > 0;
    const P = ccw ? pts2 : [...pts2].reverse();
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      this.poly(sideSlot || slot, [v3(a[0], y0, a[1]), v3(b[0], y0, b[1]), v3(b[0], y1, b[1]), v3(a[0], y1, a[1])].reverse());
    }
    if (top) this.poly(slot, P.map((p) => v3(p[0], y1, p[1])).reverse());
    if (bottom) this.poly(slot, P.map((p) => v3(p[0], y0, p[1])));
  }

  /** Copia uma geometria pronta (ex.: ExtrudeGeometry), refazendo as UVs em metros. */
  addGeometry(slot, geometry, matrix = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    const p = g.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      _e1.subVectors(b, a); _e2.subVectors(c, a);
      if (_e1.clone().cross(_e2).lengthSq() < 1e-12) continue;
      this.poly(slot, [a.clone(), b.clone(), c.clone()]);
    }
    if (g !== geometry) g.dispose();
  }

  /** Geometrias three.js por parte (UV em metros). */
  build() {
    const out = new Map();
    for (const [name, s] of this.slots) {
      if (!s.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
      g.setIndex(s.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(s.idx, 1) : new THREE.Uint16BufferAttribute(s.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.set(name, g);
    }
    return out;
  }
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function area2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Garante ordem anti-horária vista de cima (x para a direita, z para baixo na tela = sentido horário em x/z). */
export function ccwXZ(pts) {
  // em x/z com y para cima, "anti-horário visto de cima" é área negativa na fórmula x*z
  return area2(pts) < 0 ? pts : [...pts].reverse();
}

export function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

/** Desloca um polígono para fora (d > 0) mantendo os cantos em esquadro (miter). */
export function offsetPoly(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const n0 = edgeNormal(p0, p1), n1 = edgeNormal(p1, p2);
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cos = mx * n1[0] + mz * n1[1];
    const k = d / Math.max(0.25, cos);
    out.push([p1[0] + mx * k, p1[1] + mz * k]);
  }
  return out;
}

/** Normal para fora de uma aresta de polígono anti-horário (visto de cima). */
export function edgeNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  // anti-horário visto de cima (y para cima): girar a direção -90° em torno de Y
  return [-dz / l, dx / l];
}

export function isConvex(pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    if (!sign) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return true;
}

/** Retângulo? Devolve {c, d (eixo maior), a (meio comprimento), b (meia largura)} ou null. */
export function asRectangle(pts, tolDeg = 12) {
  if (pts.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
    if (Math.abs(cos) > Math.sin((tolDeg * Math.PI) / 180)) return null;
  }
  const e0 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], e1 = [pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]];
  const l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
  const long = l0 >= l1 ? e0 : e1;
  const ll = Math.max(l0, l1), ls = Math.min(l0, l1);
  return { c: centroid(pts), d: [long[0] / ll, long[1] / ll], a: ll / 2, b: ls / 2 };
}
