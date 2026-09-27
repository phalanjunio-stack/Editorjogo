// Conversão de coordenadas: editor (three.js, metros, Y para cima) -> Unreal Engine (cm, Z para cima).
// Eixos: X do editor -> X do UE, Z do editor (sul) -> Y do UE, Y do editor (cima) -> Z do UE.
import * as THREE from 'three';

export const toUELocation = (p) => [round2(p[0] * 100), round2(p[2] * 100), round2(p[1] * 100)];
export const toUEScale = (s) => [round3(s[0]), round3(s[2]), round3(s[1])];

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

// Rotação (graus, ordem XYZ do three) -> FRotator do UE [pitch, yaw, roll] em graus.
export function toUERotator(rotDeg) {
  _e.set(rotDeg[0] * THREE.MathUtils.DEG2RAD, rotDeg[1] * THREE.MathUtils.DEG2RAD, rotDeg[2] * THREE.MathUtils.DEG2RAD, 'XYZ');
  _m.makeRotationFromEuler(_e);
  const r = _m.elements; // coluna-maior: coluna k = imagem do eixo k
  const col = (k) => [r[k * 4], r[k * 4 + 1], r[k * 4 + 2]];
  const swap = (v) => [v[0], v[2], v[1]]; // S * v
  // R_ue = S R S  -> eixos do UE: S * (coluna de R correspondente ao eixo trocado)
  const X = swap(col(0));
  const Y = swap(col(2));
  const Z = swap(col(1));
  const pitch = Math.atan2(X[2], Math.hypot(X[0], X[1]));
  const yaw = Math.atan2(X[1], X[0]);
  // eixo Y de um rotator só com pitch e yaw (igual ao FMatrix::Rotator do UE)
  const SY = [-Math.sin(yaw), Math.cos(yaw), 0];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const roll = Math.atan2(dot(Z, SY), dot(Y, SY));
  const d = THREE.MathUtils.RAD2DEG;
  return [round2(pitch * d), round2(yaw * d), round2(roll * d)];
}

const round2 = (v) => Math.round(v * 100) / 100 + 0;
const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

// Parâmetros do Landscape para um heightmap de 16 bits.
export function landscapeParams(minH, maxH, size, res) {
  const maxAbs = Math.max(Math.abs(minH), Math.abs(maxH), 1);
  // Z (cm) = (valor - 32768) * escalaZ / 128
  const zScale = Math.ceil(((maxAbs * 100 * 128) / 32767) * 1.02 * 100) / 100;
  const xyScale = round3(((size / (res - 1)) * 100));
  const toValue = (h) => Math.max(0, Math.min(65535, Math.round(32768 + (h * 100 * 128) / zScale)));
  // Tamanhos recomendados pelo UE: 253 = 4x4 componentes, 505 = 8x8, 1009 = 16x16 (seções de 63 quads).
  const quads = res - 1;
  const components = quads % 63 === 0 ? quads / 63 : null;
  return { zScale, xyScale, toValue, sectionQuads: 63, sectionsPerComp: 1, components };
}
