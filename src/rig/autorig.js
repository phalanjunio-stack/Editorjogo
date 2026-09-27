// Rig automático (estilo AccuRIG): acha as juntas numa malha humanoide em pose T ou A, monta o
// NOSSO esqueleto nelas e calcula os pesos da pele. Porte de verdantrig/autorig.py e skinning.py
// para o navegador, com o esqueleto padrão do EditorJogo como molde (proporções de humano).
//
// Espaço: Y para cima, personagem olhando +Z, esquerda em +X (a malha é girada para isso).
// Malha: points (Float64Array x,y,z...), tris (Int32Array a,b,c... índices de pontos).
// Sem dependências do three.js (roda nos testes em Node).
import { STANDARD_POSE, STANDARD_TIPS } from './humanoid.js';

const UP = 1; // eixo da altura
const LAT = 0; // lateral (esquerda = +)
const FWD = 2; // frente = +

const P = (pts, i) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function mean(pts) {
  const n = pts.length || 1;
  const s = [0, 0, 0];
  for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
  return [s[0] / n, s[1] / n, s[2] / n];
}

// Marcadores (juntas) e o osso canônico de cada um.
export const MARKERS = [
  { id: 'pelvis', label: 'Pelve', canon: 'hips' },
  { id: 'chest', label: 'Peito', canon: 'chest' },
  { id: 'neck', label: 'Pescoço', canon: 'neck' },
  { id: 'head', label: 'Cabeça', canon: 'head' },
];
for (const [s, nome] of [['L', 'esq.'], ['R', 'dir.']]) {
  MARKERS.push(
    { id: `${s}_shoulder`, label: `Ombro ${nome}`, canon: `${s}_upperarm`, side: s },
    { id: `${s}_elbow`, label: `Cotovelo ${nome}`, canon: `${s}_forearm`, side: s },
    { id: `${s}_wrist`, label: `Pulso ${nome}`, canon: `${s}_hand`, side: s },
    { id: `${s}_hip`, label: `Quadril ${nome}`, canon: `${s}_thigh`, side: s },
    { id: `${s}_knee`, label: `Joelho ${nome}`, canon: `${s}_calf`, side: s },
    { id: `${s}_ankle`, label: `Tornozelo ${nome}`, canon: `${s}_foot`, side: s },
    { id: `${s}_toe`, label: `Dedos do pé ${nome}`, canon: `${s}_toe`, side: s },
  );
}
export const MARKER_BY_ID = new Map(MARKERS.map((m) => [m.id, m]));
const mirrorId = (id) => (id.startsWith('L_') ? `R_${id.slice(2)}` : id.startsWith('R_') ? `L_${id.slice(2)}` : null);

// Molde: posições do nosso esqueleto padrão (só as proporções importam).
const TW = Object.fromEntries(MARKERS.map((m) => [m.id, STANDARD_POSE[m.canon]]));
const T_GROUND = Math.min(...Object.values(STANDARD_POSE).map((p) => p[UP]));
const T_TOP = STANDARD_TIPS.head[UP];
const tz = (id) => TW[id][UP];
const tratio = (id, a, b) => (tz(id) - (a === 'ground' ? T_GROUND : tz(a))) / (tz(b) - (a === 'ground' ? T_GROUND : tz(a)));

// ------------------------------------------------------------------ geometria básica
export function bounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = points[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, size: sub(max, min) };
}

/** Vizinhos de cada ponto pelas arestas. */
export function meshNeighbors(nPoints, tris) {
  const nb = Array.from({ length: nPoints }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    nb[a].add(b); nb[a].add(c);
    nb[b].add(a); nb[b].add(c);
    nb[c].add(a); nb[c].add(b);
  }
  return nb;
}

/**
 * Gira a malha em torno do eixo vertical (0/90/180/270°) para olhar +Z com a esquerda em +X
 * (os braços abertos ficam no eixo mais largo; os pés apontam para a frente).
 * @returns {{points: Float64Array, degrees: number}}
 */
export function orientMesh(points) {
  const b = bounds(points);
  const H = b.size[UP] || 1;
  const ymin = b.min[UP];
  const latAxis = b.size[0] > b.size[2] ? 0 : 2;
  const fwdAxis = latAxis === 0 ? 2 : 0;
  const sole = [], shin = [];
  for (let i = 0; i < points.length / 3; i++) {
    const y = points[i * 3 + UP];
    if (y < ymin + 0.035 * H) sole.push(P(points, i));
    else if (y > ymin + 0.06 * H && y < ymin + 0.18 * H) shin.push(P(points, i));
  }
  let fsign = 1;
  if (sole.length && shin.length) fsign = mean(sole)[fwdAxis] >= mean(shin)[fwdAxis] ? 1 : -1;
  // vetor "frente" da malha no plano XZ -> ângulo até +Z
  const mv = [0, 0];
  mv[fwdAxis === 0 ? 0 : 1] = fsign; // [x, z]
  let ang = Math.atan2(mv[0], mv[1]); // 0 = +Z
  ang = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
  const deg = ((Math.round((-ang * 180) / Math.PI) % 360) + 360) % 360;
  if (!deg) return { points: Float64Array.from(points), degrees: 0 };
  const c = Math.cos(-ang), s = Math.sin(-ang);
  const out = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], z = points[i + 2];
    // rotação em Y por -ang: leva a frente da malha para +Z
    out[i] = x * c + z * s;
    out[i + 1] = points[i + 1];
    out[i + 2] = -x * s + z * c;
  }
  return { points: out, degrees: deg };
}

/**
 * Corta a malha no plano horizontal y. Devolve os contornos (cada parte separada).
 * withEdges: [{pts, edges}] com as arestas (pares de pontos) cortadas.
 */
export function crossSection(points, tris, y, withEdges = false) {
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    let x = a;
    while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; }
    return r;
  };
  const hit = new Map();
  const nP = points.length / 3;
  for (let t = 0; t < tris.length; t += 3) {
    let first = -1;
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
      const ya = points[a * 3 + UP], yb = points[b * 3 + UP];
      if ((ya - y) * (yb - y) < 0 || (ya === y) !== (yb === y)) {
        const key = a < b ? a * nP + b : b * nP + a;
        if (!hit.has(key)) {
          const d = yb - ya;
          const k = d === 0 ? 0 : (y - ya) / d;
          hit.set(key, [points[a * 3] + (points[b * 3] - points[a * 3]) * k, y, points[a * 3 + 2] + (points[b * 3 + 2] - points[a * 3 + 2]) * k]);
          parent.set(key, key);
        }
        if (first < 0) first = key;
        else {
          const ra = find(first), rb = find(key);
          if (ra !== rb) parent.set(ra, rb);
        }
      }
    }
  }
  const loops = new Map();
  for (const [key, pt] of hit) {
    const r = find(key);
    if (!loops.has(r)) loops.set(r, { pts: [], edges: [] });
    const L = loops.get(r);
    L.pts.push(pt);
    L.edges.push([Math.floor(key / nP), key % nP]);
  }
  return withEdges ? [...loops.values()] : [...loops.values()].map((l) => l.pts);
}

// ------------------------------------------------------------------ detecção das juntas
/**
 * Acha as 18 juntas numa malha humanoide já orientada (olhando +Z). Com triângulos usa cortes
 * transversais (contornos fechados), bem mais confiável em malhas de poucos polígonos.
 * @returns {{markers: Record<string, number[]>, report: {info: string[], warnings: string[]}}}
 */
export function detectMarkers(points, tris, { headless = false } = {}) {
  const rep = { info: [], warnings: [] };
  const n = points.length / 3;
  const b = bounds(points);
  const ymin = b.min[UP], ymax = b.max[UP];
  const H = ymax - ymin || 1;
  const lats = [];
  for (let i = 0; i < n; i++) lats.push(points[i * 3 + LAT]);
  lats.sort((a, c) => a - c);
  const cLat = lats[Math.floor(n / 2)];
  const sideOf = (p) => p[LAT] - cLat; // > 0 = esquerda do personagem
  const all = Array.from({ length: n }, (_, i) => P(points, i));
  const slab = (y, half = 0.012 * H, pts = all) => pts.filter((p) => Math.abs(p[UP] - y) <= half);
  const mk = (latOff, fwd, y) => { const v = [0, 0, 0]; v[LAT] = cLat + latOff; v[FWD] = fwd; v[UP] = y; return v; };
  const secCache = new Map();
  const sections = (y) => {
    const k = Math.round(y * 1e5) / 1e5;
    if (!secCache.has(k)) secCache.set(k, tris && tris.length ? crossSection(points, tris, k) : []);
    return secCache.get(k);
  };
  const hasTris = !!(tris && tris.length);

  // ---- alturas relativas do molde
  const tHip = (tz('L_hip') + tz('R_hip')) / 2;
  const tNeck = tz('neck');
  let estHip;
  if (headless) estHip = ymin + ((tHip - T_GROUND) / (tNeck - T_GROUND)) * H;
  else estHip = ymin + ((tHip - T_GROUND) / (T_TOP - T_GROUND)) * H;

  // topo das pernas separadas (mesmo sob saia): subindo das canelas, a última altura com contorno de perna dos dois lados
  let legsTop = null;
  if (hasTris) {
    for (let y = ymin + 0.12 * H; y < ymin + 0.8 * H; y += 0.005 * H) {
      let left = false, right = false;
      for (const lp of sections(y)) {
        if (lp.length < 3) continue;
        const sv = lp.map(sideOf);
        if (Math.min(...sv) > 0.003 * H) left = true;
        else if (Math.max(...sv) < -0.003 * H) right = true;
      }
      if (left && right) legsTop = y;
      else if (legsTop !== null && y - legsTop > 0.03 * H) break;
    }
  }
  // vão entre as pernas subindo dos joelhos
  const central = all.filter((p) => Math.abs(sideOf(p)) < 0.16 * H);
  let crotchGap = null;
  for (let y = ymin + 0.12 * H; y < ymin + 0.75 * H; y += 0.004 * H) {
    if (hasTris) {
      if (sections(y).some((lp) => {
        const sv = lp.map(sideOf);
        return Math.min(...sv) < -0.01 * H && Math.max(...sv) > 0.01 * H && Math.abs(mean(lp)[LAT] - cLat) < 0.05 * H;
      })) { crotchGap = y; break; }
    } else {
      const sl = slab(y, 0.006 * H, central);
      if (sl.length && sl.some((p) => Math.abs(sideOf(p)) < 0.012 * H)) { crotchGap = y; break; }
    }
  }
  let hipY;
  if (legsTop !== null && legsTop > ymin + 0.25 * H && Math.abs(legsTop + 0.03 * H - estHip) < 0.2 * H) {
    hipY = legsTop + 0.03 * H;
    if (crotchGap === null || Math.abs(crotchGap + 0.03 * H - hipY) > 0.05 * H) rep.info.push('quadril pelo topo das pernas (malha com saia ou pernas juntas)');
  } else if (crotchGap !== null && Math.abs(crotchGap + 0.03 * H - estHip) < 0.05 * H) {
    hipY = crotchGap + 0.03 * H;
  } else {
    hipY = estHip;
    rep.info.push('quadril pela proporção do molde (as pernas se encostam ou não há vão claro)');
  }
  const crotchY = hipY - 0.03 * H;
  const ankleY = ymin + ((tz('L_ankle') - T_GROUND) / (tHip - T_GROUND)) * (hipY - ymin);
  const kneeY = ankleY + tratio('L_knee', 'L_ankle', 'L_hip') * (hipY - ankleY);

  const legs = {};
  for (const [sd, sign] of [['L', 1], ['R', -1]]) {
    const sidePts = central.filter((p) => sideOf(p) * sign > 0.004 * H);
    const res = {};
    for (const [key, yy] of [['hip', hipY - 0.06 * H], ['knee', kneeY], ['ankle', ankleY]]) {
      let c = null;
      if (hasTris) {
        const loops = sections(yy).filter((lp) => Math.abs(mean(lp)[LAT] - cLat) < 0.2 * H);
        const mine = loops.filter((lp) => sideOf(mean(lp)) * sign > 0.004 * H);
        if (mine.length) c = mean(mine.reduce((a, x) => (x.length > a.length ? x : a)));
      }
      if (!c) {
        const s = slab(yy, 0.02 * H, sidePts);
        c = s.length ? mean(s) : null;
      }
      if (!c) {
        rep.warnings.push(`perna ${sd}: nada na altura do ${key}`);
        c = mk(sign * 0.05 * H, 0, yy);
      }
      res[key] = [c[0], key === 'hip' ? hipY : yy, c[2]];
    }
    const foot = sidePts.filter((p) => p[UP] < ymin + 0.05 * H);
    const ank = res.ankle;
    const toe = [...ank];
    if (foot.length) {
      const tip = foot.reduce((a, p) => (p[FWD] > a[FWD] ? p : a));
      toe[FWD] = ank[FWD] + 0.7 * (tip[FWD] - ank[FWD]);
      toe[LAT] = tip[LAT] * 0.5 + ank[LAT] * 0.5;
    } else {
      toe[FWD] = ank[FWD] + 0.06 * H;
      rep.warnings.push(`pé ${sd}: ponta não encontrada, dedos estimados (confira o marcador)`);
    }
    toe[UP] = ymin + 0.015 * H;
    res.toe = toe;
    legs[sd] = res;
  }

  const pelvisY = hipY + ((tz('pelvis') - tHip) / (tHip - T_GROUND)) * (hipY - ymin);
  const centerLoop = (loops) => {
    let best = null;
    for (const lp of loops) {
      const sv = lp.map(sideOf);
      if (Math.min(...sv) < 0 && 0 < Math.max(...sv) && (!best || lp.length > best.length)) best = lp;
    }
    return best;
  };
  const bodyMidF = (y) => {
    if (!hasTris) return null;
    const lp = centerLoop(sections(y));
    if (!lp) return null;
    const fs = lp.map((p) => p[FWD]);
    return (Math.min(...fs) + Math.max(...fs)) / 2;
  };
  let fwd0 = bodyMidF(pelvisY);
  if (fwd0 === null) {
    const s = slab(pelvisY, 0.02 * H, central);
    fwd0 = s.length ? mean(s)[FWD] : all.map((p) => p[FWD]).sort((a, c) => a - c)[Math.floor(n / 2)];
  }

  // ---- pescoço e cabeça
  let neckY, headY = null;
  if (headless) neckY = ymax - 0.01 * H;
  else {
    headY = ymax - 0.12 * H;
    const span = tz('head') - tz('neck');
    const body = tz('head') - T_GROUND;
    neckY = headY - (span / body) * (headY - ymin);
  }
  const nearAxis = all.filter((p) => Math.abs(sideOf(p)) < 0.06 * H);
  const neckS = slab(neckY, 0.02 * H, nearAxis);
  const neckF = neckS.length ? mean(neckS)[FWD] : fwd0;
  const chestY = pelvisY + tratio('chest', 'pelvis', 'neck') * (neckY - pelvisY);

  // ---- tronco e braços
  let half = 0.1 * H;
  const torsoLoop = hasTris ? centerLoop(sections(chestY)) : null;
  if (torsoLoop) half = Math.max(0.04 * H, Math.max(...torsoLoop.map((p) => Math.abs(sideOf(p)))));
  else {
    const cs = slab(chestY, 0.03 * H, all.filter((p) => Math.abs(sideOf(p)) < 0.3 * H));
    if (cs.length) {
      const vals = cs.map(sideOf).sort((a, c) => a - c);
      let k0 = 0;
      for (let k = 1; k < vals.length; k++) if (Math.abs(vals[k]) < Math.abs(vals[k0])) k0 = k;
      let hi = k0, lo = k0;
      while (hi + 1 < vals.length && vals[hi + 1] - vals[hi] <= 0.02 * H) hi++;
      while (lo > 0 && vals[lo] - vals[lo - 1] <= 0.02 * H) lo--;
      half = Math.max(0.04 * H, (vals[hi] - vals[lo]) / 2);
    }
  }
  const shY = pelvisY + tratio('L_shoulder', 'pelvis', 'neck') * (neckY - pelvisY);
  let nb = null;
  const arms = {};
  const armLen = len(sub(TW.L_elbow, TW.L_shoulder)) + len(sub(TW.L_wrist, TW.L_elbow));
  const handLen = 0.105 * (T_TOP - T_GROUND);
  const elR = len(sub(TW.L_elbow, TW.L_shoulder)) / armLen;
  const tH = T_TOP - T_GROUND;
  for (const [sd, sign] of [['L', 1], ['R', -1]]) {
    const shoulder = mk(sign * half * 0.95, neckF, shY);
    // pontos do braço: fora do tronco, na região LIGADA ao ombro (as coxas ficam de fora)
    let armPts = [];
    const outside = [];
    for (let i = 0; i < n; i++) if (sideOf(all[i]) * sign > half + 0.025 * H) outside.push(i);
    if (!hasTris) armPts = outside.map((i) => all[i]).filter((p) => p[UP] > crotchY + 0.02 * H);
    else {
      if (!nb) nb = meshNeighbors(n, tris);
      const cand = new Set(outside);
      const seen = new Set();
      const comps = [];
      let best = null, bestD = Infinity;
      for (const k of outside) {
        if (seen.has(k)) continue;
        const comp = [], stack = [k];
        seen.add(k);
        while (stack.length) {
          const v = stack.pop();
          comp.push(v);
          for (const u of nb[v]) if (cand.has(u) && !seen.has(u)) { seen.add(u); stack.push(u); }
        }
        if (comp.length < 8) continue;
        comps.push(comp);
        let d = Infinity;
        for (const v of comp) d = Math.min(d, len(sub(all[v], shoulder)));
        if (d < bestD) { best = comp; bestD = d; }
      }
      if (best && bestD <= 0.12 * H) {
        armPts = best.map((v) => all[v]);
        // braço em pedaços soltos (ombreira, manga, luva...): junta os pedaços encostados
        const reach = () => Math.max(...armPts.map((p) => len(sub(p, shoulder))));
        const used = new Set([best]);
        let grew = true;
        while (reach() < 0.3 * H && grew) {
          grew = false;
          for (const c of comps) {
            if (used.has(c) || c.length * armPts.length > 4e6) continue;
            const pts = c.map((v) => all[v]);
            if (pts.every((p) => p[UP] < crotchY)) continue;
            let d = Infinity;
            for (const a of pts) for (const q of armPts) { const dd = len(sub(a, q)); if (dd < d) d = dd; }
            if (d < 0.03 * H) { armPts = armPts.concat(pts); used.add(c); grew = true; }
          }
        }
      }
    }
    let tip = null, tipD = 0;
    for (const p of armPts) { const d = len(sub(p, shoulder)); if (d > tipD) { tipD = d; tip = p; } }
    if (!tip || tipD < 0.15 * H) {
      rep.warnings.push(`braço ${sd}: estimado pelas proporções (confira cotovelo e pulso)`);
      const k = H / tH;
      const tw0 = TW[`${sd}_shoulder`];
      arms[sd] = {
        shoulder,
        elbow: add(shoulder, scale(sub(TW[`${sd}_elbow`], tw0), k)),
        wrist: add(shoulder, scale(sub(TW[`${sd}_wrist`], tw0), k)),
      };
      continue;
    }
    const kk = armLen / (armLen + handLen);
    let wrist = add(shoulder, scale(sub(tip, shoulder), kk));
    const elbowGuess = add(shoulder, scale(sub(wrist, shoulder), elR));
    const nearE = armPts.filter((p) => len(sub(p, elbowGuess)) < 0.04 * H);
    const elbow = nearE.length ? mean(nearE) : elbowGuess;
    const nearW = armPts.filter((p) => len(sub(p, wrist)) < 0.025 * H);
    if (nearW.length) wrist = mean(nearW);
    arms[sd] = { shoulder, elbow, wrist };
  }
  let chestF = bodyMidF(chestY);
  if (chestF === null) chestF = fwd0 * 0.5 + neckF * 0.5;
  const out = { pelvis: mk(0, fwd0, pelvisY), chest: mk(0, chestF, chestY), neck: mk(0, neckF, neckY) };
  if (headY !== null) {
    const hs = slab(headY, 0.02 * H, nearAxis);
    out.head = mk(0, hs.length ? mean(hs)[FWD] : neckF, headY);
  }
  for (const sd of ['L', 'R']) {
    for (const [k, v] of Object.entries(legs[sd])) out[`${sd}_${k}`] = v;
    for (const [k, v] of Object.entries(arms[sd])) out[`${sd}_${k}`] = v;
  }
  rep.info.push(`altura da malha: ${H.toFixed(2)} unidades; ${Object.keys(out).length} marcadores`);
  return { markers: out, report: rep, height: H, ground: ymin, top: ymax };
}

/** Copia um lado para o outro espelhando no plano central (X). */
export function symmetrize(markers, source = 'L') {
  const centers = Object.entries(markers).filter(([k]) => !MARKER_BY_ID.get(k)?.side).map(([, v]) => v);
  const c = centers.length ? mean(centers)[LAT] : 0;
  const out = { ...markers };
  for (const [k, v] of Object.entries(markers)) {
    const m = MARKER_BY_ID.get(k);
    if (!m) continue;
    if (m.side === source) {
      const w = [...v];
      w[LAT] = 2 * c - v[LAT];
      out[mirrorId(k)] = w;
    } else if (!m.side) {
      const w = [...v];
      w[LAT] = c;
      out[k] = w;
    }
  }
  return out;
}

// ------------------------------------------------------------------ esqueleto nos marcadores
/**
 * Posições dos ossos do nosso esqueleto a partir das juntas.
 * @returns {{pose: Record<string, number[]>, tips: Record<string, number[]>}}
 */
export function skeletonFromMarkers(m, { top = null, headless = false } = {}) {
  const pose = {
    hips: m.pelvis,
    spine: lerp(m.pelvis, m.chest, 1 / 3),
    spine1: lerp(m.pelvis, m.chest, 2 / 3),
    chest: m.chest,
    neck: m.neck,
    head: m.head || add(m.neck, scale(sub(m.neck, m.chest), 0.35)),
  };
  const H = (top ?? m.head?.[UP] ?? m.neck[UP]) - Math.min(m.L_toe[UP], m.R_toe[UP]);
  for (const s of ['L', 'R']) {
    const sh = m[`${s}_shoulder`];
    const cl = lerp(m.neck, sh, 0.18);
    cl[UP] = sh[UP] + 0.012 * H;
    Object.assign(pose, {
      [`${s}_clavicle`]: cl,
      [`${s}_upperarm`]: sh,
      [`${s}_forearm`]: m[`${s}_elbow`],
      [`${s}_hand`]: m[`${s}_wrist`],
      [`${s}_thigh`]: m[`${s}_hip`],
      [`${s}_calf`]: m[`${s}_knee`],
      [`${s}_foot`]: m[`${s}_ankle`],
      [`${s}_toe`]: m[`${s}_toe`],
    });
  }
  const tips = {
    head: headless || top === null ? add(pose.head, scale(sub(pose.head, pose.neck), 1.5)) : [pose.head[0], top, pose.head[2]],
  };
  for (const s of ['L', 'R']) {
    tips[`${s}_hand`] = add(pose[`${s}_hand`], scale(sub(pose[`${s}_hand`], pose[`${s}_forearm`]), 0.42));
    const t = [...pose[`${s}_toe`]];
    t[FWD] += 0.045 * H;
    tips[`${s}_toe`] = t;
  }
  return { pose, tips };
}

// ------------------------------------------------------------------ pesos
function segDist(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const den = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = den < 1e-12 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / den));
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t), p[2] - (a[2] + ab[2] * t));
}

/**
 * Pesos "de família" como no AccuRIG: cada ponto mistura o osso mais próximo só com o pai e os
 * filhos dele (a coxa esquerda nunca puxa a direita, o braço não puxa as costelas).
 * @param {{name: string, parent: number, head: number[], tails: number[][], deform: boolean}[]} bones
 * @returns {Array<Array<[number, number]>>} por ponto: [[osso, peso]...]
 */
export function familyWeights(points, bones, { maxInfluences = 4, falloff = 4 } = {}) {
  const deform = bones.map((b, i) => (b.deform ? i : -1)).filter((i) => i >= 0);
  const dset = new Set(deform);
  const family = new Map();
  for (const i of deform) {
    const fam = new Set([i]);
    if (dset.has(bones[i].parent)) fam.add(bones[i].parent);
    bones.forEach((c, j) => { if (c.parent === i && dset.has(j)) fam.add(j); });
    family.set(i, [...fam]);
  }
  const n = points.length / 3;
  const out = new Array(n);
  const dist = new Float64Array(bones.length);
  for (let k = 0; k < n; k++) {
    const p = P(points, k);
    let best = -1;
    for (const i of deform) {
      let d = Infinity;
      for (const t of bones[i].tails) d = Math.min(d, segDist(p, bones[i].head, t));
      dist[i] = d;
      if (best < 0 || d < dist[best]) best = i;
    }
    const nearest = Math.max(dist[best], 1e-6);
    const cands = family.get(best).slice().sort((a, b) => dist[a] - dist[b]).slice(0, maxInfluences);
    let raw = cands.filter((i) => dist[i] <= nearest * 2.5 + 1e-6).map((i) => [i, 1 / Math.max(dist[i], 1e-6) ** falloff]);
    let t = raw.reduce((s, x) => s + x[1], 0);
    raw = raw.map(([i, w]) => [i, w / t]).filter((x) => x[1] >= 0.02);
    t = raw.reduce((s, x) => s + x[1], 0);
    out[k] = raw.map(([i, w]) => [i, w / t]);
  }
  return out;
}

/** Suaviza os pesos andando pelas arestas (uma perna não contamina a outra). */
export function diffuseWeights(weights, neighbors, { iterations = 2, keep = 0.6, maxInfluences = 4 } = {}) {
  let cur = weights.map((ws) => new Map(ws));
  for (let it = 0; it < iterations; it++) {
    const next = new Array(cur.length);
    for (let i = 0; i < cur.length; i++) {
      const nbs = neighbors[i];
      if (!nbs || !nbs.size) { next[i] = cur[i]; continue; }
      const acc = new Map();
      for (const [k, v] of cur[i]) acc.set(k, v * keep);
      const share = (1 - keep) / nbs.size;
      for (const j of nbs) for (const [k, v] of cur[j]) acc.set(k, (acc.get(k) || 0) + v * share);
      next[i] = acc;
    }
    cur = next;
  }
  return cur.map((m) => {
    let top = [...m].sort((a, b) => b[1] - a[1]).slice(0, maxInfluences);
    const kept = top.filter((x) => x[1] >= 0.02);
    top = kept.length ? kept : top.slice(0, 1);
    const t = top.reduce((s, x) => s + x[1], 0) || 1;
    return top.map(([k, v]) => [k, v / t]);
  });
}

/**
 * Tudo: ossos do nosso esqueleto nos marcadores + pesos.
 * @param {{name: string, parent: string|null, canon?: string, attach?: boolean}[]} boneDefs  STANDARD_BONES
 */
export function rigWeights(points, tris, boneDefs, pose, tips, { smooth = 2 } = {}) {
  const idx = new Map(boneDefs.map((b, i) => [b.name, i]));
  const bones = boneDefs.map((b) => {
    const head = b.canon ? pose[b.canon] : b.name === 'raiz' ? [pose.hips[0], Math.min(pose.L_toe[UP], pose.R_toe[UP]), pose.hips[2]] : null;
    return { name: b.name, parent: b.parent ? idx.get(b.parent) : -1, head, canon: b.canon, deform: !!b.canon && !b.attach, tails: [] };
  });
  bones.forEach((b, i) => {
    if (!b.deform) return;
    const kids = bones.filter((c) => c.parent === i && c.deform);
    if (kids.length) b.tails = kids.map((c) => c.head);
    else if (tips[b.canon]) b.tails = [tips[b.canon]];
    else {
      const par = bones[b.parent];
      b.tails = [add(b.head, scale(sub(b.head, par.head), 0.8))];
    }
  });
  let w = familyWeights(points, bones);
  if (smooth) w = diffuseWeights(w, meshNeighbors(points.length / 3, tris), { iterations: smooth, keep: 0.6 });
  return w;
}

// ------------------------------------------------------------------ anéis nas juntas
const JOINT_LOOPS = [];
for (const s of ['L', 'R']) {
  JOINT_LOOPS.push([`${s}_elbow`, `${s}_shoulder`, `${s}_wrist`], [`${s}_knee`, `${s}_hip`, `${s}_ankle`], [`${s}_wrist`, `${s}_elbow`, null], [`${s}_ankle`, `${s}_knee`, `${s}_toe`]);
}

/**
 * Corta a malha com um anel de vértices em cada junta (cotovelo, joelho, pulso, tornozelo).
 * Malhas geradas por IA não têm vértices onde o membro dobra e a pele "quebra" ao animar.
 * mesh: { points: number[], tris: [{p:[a,b,c], uv:[[u,v],[u,v],[u,v]], mat}] }
 * @returns {number} quantos anéis foram cortados
 */
export function addJointLoops(mesh, markers, radius = 0.45) {
  let done = 0;
  for (const [jid, aid, bid] of JOINT_LOOPS) {
    if (!markers[jid] || !markers[aid]) continue;
    const j = markers[jid], a = markers[aid];
    const d1 = sub(j, a);
    if (len(d1) < 1e-6) continue;
    let nrm = scale(d1, 1 / len(d1));
    if (bid && markers[bid] && len(sub(markers[bid], j)) > 1e-6) {
      const d2 = sub(markers[bid], j);
      const m = add(nrm, scale(d2, 1 / len(d2)));
      if (len(m) > 1e-6) nrm = scale(m, 1 / len(m));
    }
    if (cutPlane(mesh, j, nrm, radius * len(d1))) done++;
  }
  return done;
}

function cutPlane(mesh, origin, normal, radius) {
  const pts = mesh.points;
  const eps = 1e-7;
  const dc = new Map();
  const d = (i) => {
    if (!dc.has(i)) dc.set(i, (pts[i * 3] - origin[0]) * normal[0] + (pts[i * 3 + 1] - origin[1]) * normal[1] + (pts[i * 3 + 2] - origin[2]) * normal[2]);
    return dc.get(i);
  };
  const crosses = (a, b) => (d(a) > eps && d(b) < -eps) || (d(a) < -eps && d(b) > eps);
  const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const cut = new Set();
  for (const t of mesh.tris) {
    const cen = [0, 1, 2].map((k) => (pts[t.p[0] * 3 + k] + pts[t.p[1] * 3 + k] + pts[t.p[2] * 3 + k]) / 3);
    if (len(sub(cen, origin)) > radius) continue;
    for (let k = 0; k < 3; k++) {
      const a = t.p[k], b = t.p[(k + 1) % 3];
      if (crosses(a, b)) cut.add(ek(a, b));
    }
  }
  if (!cut.size) return false;
  const newPt = new Map();
  const edgePoint = (a, b) => {
    const key = ek(a, b);
    if (!newPt.has(key)) {
      const t = d(a) / (d(a) - d(b));
      for (let k = 0; k < 3; k++) pts.push(pts[a * 3 + k] + (pts[b * 3 + k] - pts[a * 3 + k]) * t);
      newPt.set(key, pts.length / 3 - 1);
    }
    return newPt.get(key);
  };
  const lerpUv = (a, ua, b, ub) => {
    const t = d(a) / (d(a) - d(b));
    return [ua[0] + (ub[0] - ua[0]) * t, ua[1] + (ub[1] - ua[1]) * t];
  };
  const out = [];
  for (const t of mesh.tris) {
    const edges = [0, 1, 2].filter((k) => cut.has(ek(t.p[k], t.p[(k + 1) % 3])));
    if (!edges.length) { out.push(t); continue; }
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = t.p[k], b = t.p[(k + 1) % 3];
      poly.push({ p: a, uv: t.uv[k], d: d(a), cut: false });
      if (edges.includes(k)) poly.push({ p: edgePoint(a, b), uv: lerpUv(a, t.uv[k], b, t.uv[(k + 1) % 3]), d: 0, cut: true });
    }
    if (edges.length === 1) {
      const k = poly.findIndex((x) => x.cut);
      const m = poly[k], prev = poly[(k + 3) % 4], next = poly[(k + 1) % 4], opp = poly[(k + 2) % 4];
      out.push({ p: [prev.p, m.p, opp.p], uv: [prev.uv, m.uv, opp.uv], mat: t.mat });
      out.push({ p: [m.p, next.p, opp.p], uv: [m.uv, next.uv, opp.uv], mat: t.mat });
      continue;
    }
    for (const part of [poly.filter((x) => x.d >= 0), poly.filter((x) => x.d <= 0)]) {
      for (let k = 1; k < part.length - 1; k++) out.push({ p: [part[0].p, part[k].p, part[k + 1].p], uv: [part[0].uv, part[k].uv, part[k + 1].uv], mat: t.mat });
    }
  }
  mesh.tris = out;
  return true;
}

// ------------------------------------------------------------------ redução de polígonos
// Erro quadrático (Garland & Heckbert). Bordas abertas são preservadas; passos que virariam
// triângulos do avesso são recusados. mesh: { points: number[], tris: [{p, uv, mat}] }
class Heap {
  constructor() { this.a = []; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const planeQ = (a, b, c, d, w) => [w * a * a, w * a * b, w * a * c, w * a * d, w * b * b, w * b * c, w * b * d, w * c * c, w * c * d, w * d * d];
const qErr = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
const triNormal = (a, b, c) => {
  const u = sub(b, a), v = sub(c, a);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

export function decimate(mesh, target, onProgress) {
  const pos = [];
  for (let i = 0; i < mesh.points.length / 3; i++) pos.push(P(mesh.points, i));
  const faces = mesh.tris.map((t) => ({ p: [...t.p], uv: t.uv, mat: t.mat, alive: true }));
  let alive = faces.length;
  if (alive <= target) return { before: alive, after: alive };
  const vf = pos.map(() => new Set());
  faces.forEach((f, fi) => f.p.forEach((v) => vf[v].add(fi)));
  const Q = pos.map(() => new Array(10).fill(0));
  const edgeCount = new Map();
  const ek = (u, v) => (u < v ? `${u},${v}` : `${v},${u}`);
  for (const f of faces) {
    const [a, b, c] = f.p.map((v) => pos[v]);
    let n = triNormal(a, b, c);
    const ln = len(n);
    if (ln < 1e-20) continue;
    n = scale(n, 1 / ln);
    const q = planeQ(n[0], n[1], n[2], -(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]), ln * 0.5);
    for (const v of f.p) for (let k = 0; k < 10; k++) Q[v][k] += q[k];
    for (let k = 0; k < 3; k++) {
      const key = ek(f.p[k], f.p[(k + 1) % 3]);
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  let sc = 0;
  for (const key of edgeCount.keys()) { const [u, v] = key.split(',').map(Number); sc += len(sub(pos[u], pos[v])); }
  sc /= Math.max(1, edgeCount.size);
  // bordas: plano perpendicular com peso alto (a borda não "anda")
  for (const f of faces) {
    const [a, b, c] = f.p.map((v) => pos[v]);
    const n = triNormal(a, b, c);
    for (let k = 0; k < 3; k++) {
      const u = f.p[k], v = f.p[(k + 1) % 3];
      if (edgeCount.get(ek(u, v)) !== 1) continue;
      const e = sub(pos[v], pos[u]);
      let pp = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]];
      const ln = len(pp);
      if (ln < 1e-20) continue;
      pp = scale(pp, 1 / ln);
      const q = planeQ(pp[0], pp[1], pp[2], -(pp[0] * pos[u][0] + pp[1] * pos[u][1] + pp[2] * pos[u][2]), 1000 * sc * sc);
      for (let k2 = 0; k2 < 10; k2++) { Q[u][k2] += q[k2]; Q[v][k2] += q[k2]; }
    }
  }
  const version = new Int32Array(pos.length);
  const removed = new Uint8Array(pos.length);
  const heap = new Heap();
  const push = (u, v) => {
    const q = Q[u].map((x, k) => x + Q[v][k]);
    const mid = lerp(pos[u], pos[v], 0.5);
    const cands = [[qErr(q, ...pos[u]), pos[u]], [qErr(q, ...pos[v]), pos[v]], [qErr(q, ...mid), mid]];
    const best = cands.reduce((a, c) => (c[0] < a[0] ? c : a));
    heap.push([best[0], u, v, version[u], version[v], best[1]]);
  };
  for (const key of edgeCount.keys()) { const [u, v] = key.split(',').map(Number); push(u, v); }
  const flips = (v, np, skip) => {
    for (const fi of vf[v]) {
      if (skip.has(fi) || !faces[fi].alive) continue;
      const f = faces[fi];
      const pts = f.p.map((x) => pos[x]);
      const before = triNormal(...pts);
      const after = triNormal(...f.p.map((x, k) => (x === v ? np : pts[k])));
      if (before[0] * after[0] + before[1] * after[1] + before[2] * after[2] <= 0) return true;
    }
    return false;
  };
  const total = alive;
  while (alive > target && heap.size) {
    const [, u, v, vu, vv, p] = heap.pop();
    if (removed[u] || removed[v] || vu !== version[u] || vv !== version[v]) continue;
    const shared = new Set([...vf[u]].filter((fi) => vf[v].has(fi)));
    if (!shared.size) continue;
    const nbU = new Set(), nbV = new Set();
    for (const fi of vf[u]) if (faces[fi].alive) faces[fi].p.forEach((x) => x !== u && nbU.add(x));
    for (const fi of vf[v]) if (faces[fi].alive) faces[fi].p.forEach((x) => x !== v && nbV.add(x));
    let common = 0;
    for (const x of nbU) if (nbV.has(x)) common++;
    if (common > shared.size) continue;
    if (flips(u, p, shared) || flips(v, p, shared)) continue;
    pos[u] = p;
    for (let k = 0; k < 10; k++) Q[u][k] += Q[v][k];
    for (const fi of shared) {
      if (!faces[fi].alive) continue;
      faces[fi].alive = false;
      alive--;
      faces[fi].p.forEach((x) => vf[x].delete(fi));
    }
    for (const fi of [...vf[v]]) {
      const f = faces[fi];
      f.p = f.p.map((x) => (x === v ? u : x));
      vf[u].add(fi);
    }
    vf[v].clear();
    removed[v] = 1;
    version[u]++;
    const around = new Set();
    for (const fi of vf[u]) faces[fi].p.forEach((x) => x !== u && around.add(x));
    for (const w of around) push(Math.min(u, w), Math.max(u, w));
    if (onProgress && alive % 2000 === 0) onProgress((total - alive) / Math.max(1, total - target));
  }
  // compacta
  const remap = new Map();
  const np = [];
  const tris = [];
  for (const f of faces) {
    if (!f.alive) continue;
    const ids = f.p.map((old) => {
      if (!remap.has(old)) { remap.set(old, np.length / 3); np.push(...pos[old]); }
      return remap.get(old);
    });
    if (new Set(ids).size === 3) tris.push({ p: ids, uv: f.uv, mat: f.mat });
  }
  mesh.points = np;
  mesh.tris = tris;
  return { before: total, after: tris.length };
}

/** Índices planos (Int32Array) dos triângulos de uma malha {tris: [{p}]} */
export function flatTris(mesh) {
  const out = new Int32Array(mesh.tris.length * 3);
  mesh.tris.forEach((t, i) => out.set(t.p, i * 3));
  return out;
}
