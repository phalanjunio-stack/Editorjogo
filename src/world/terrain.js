// Terreno por heightmap: esculpir, pintar camadas de textura (splatmap), gerar montanhas,
// importar heightmaps e fornecer dados para grama/exportação.
import * as THREE from 'three';
import { Noise2D } from '../core/noise.js';
import { clamp, lerp, smoothstep, float32ToBase64, base64ToFloat32, bytesToBase64, base64ToBytes } from '../core/util.js';
import { LayerTextures } from './layerTextures.js';
import { loadDataUrl } from './pbrImport.js';
import { DEFAULT_LAYERS } from '../core/state.js';
import { TERRAIN_SETS } from '../assets.js';

export const LAYERS = 8;
export const LAYER_UI_COLORS = ['#6dbb4a', '#a57a4a', '#9a9a9a', '#e8f0ff', '#d9c08a', '#5e4a34', '#8f8a80', '#b89a70'];

const VERT_HEAD = /* glsl */ `
varying vec2 vTUv;
varying vec3 vTWorld;
varying vec3 vTNormal;
`;

const FRAG_HEAD = /* glsl */ `
varying vec2 vTUv;
varying vec3 vTWorld;
varying vec3 vTNormal;
uniform sampler2D uSplatA;
uniform sampler2D uSplatB;
uniform sampler2DArray uAlbedoArr;
uniform sampler2DArray uNormalArr;
uniform float uTiling[8];
uniform float uNormalStr[8];
uniform float uLayerLum[8];
uniform vec2 uBrushPos;
uniform float uBrushRadius;
uniform float uBrushOn;
uniform vec3 uBrushColor;
uniform float uGridOn;
uniform float uGridSize;
uniform float uWaterLevel;
uniform float uViewMode;

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// Mistura as 8 camadas. Só amostra as camadas presentes no ponto (textureGrad mantém o mipmap
// correto mesmo dentro do "if"). Normal triplanar com "whiteout blend".
// Mistura por altura: onde duas camadas se encontram, a parte "alta" da foto (pedras, torrões)
// aparece primeiro e a baixa (vãos, lama) some, como no chão de verdade. De longe mistura uma
// segunda escala da mesma foto para esconder a repetição.
const FRAG_BLEND = /* glsl */ `
  vec4 swA = texture2D(uSplatA, vTUv);
  vec4 swB = texture2D(uSplatB, vTUv);
  float tW[8];
  tW[0] = swA.r; tW[1] = swA.g; tW[2] = swA.b; tW[3] = swA.a;
  tW[4] = swB.r; tW[5] = swB.g; tW[6] = swB.b; tW[7] = swB.a;
  float tSum = max(swA.r + swA.g + swA.b + swA.a + swB.r + swB.g + swB.b + swB.a, 1e-4);
  vec3 tN = normalize(vTNormal);
  vec3 bw = pow(abs(tN), vec3(6.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 tAxis = sign(tN);
  vec3 tP = vTWorld;
  vec3 tDx = dFdx(tP), tDy = dFdy(tP);
  vec3 tAlb = vec3(0.0);
  vec3 tNrm = vec3(0.0);
  float tAO = 0.0;
  float tRough = 0.0;
  float tWs = 0.0;
  float tFar = smoothstep(25.0, 160.0, distance(vTWorld, cameraPosition));
  for (int i = 0; i < 8; i++) {
    float wi = tW[i] / tSum;
    if (wi < 0.004) continue;
    float s = uTiling[i];
    float L = float(i);
    float ns = uNormalStr[i];
#ifdef TRIPLANAR
    vec4 aX = textureGrad(uAlbedoArr, vec3(tP.zy * s, L), tDx.zy * s, tDy.zy * s);
    vec4 aY = textureGrad(uAlbedoArr, vec3(tP.xz * s, L), tDx.xz * s, tDy.xz * s);
    vec4 aZ = textureGrad(uAlbedoArr, vec3(tP.xy * s, L), tDx.xy * s, tDy.xy * s);
    vec4 nX = textureGrad(uNormalArr, vec3(tP.zy * s, L), tDx.zy * s, tDy.zy * s);
    vec4 nY = textureGrad(uNormalArr, vec3(tP.xz * s, L), tDx.xz * s, tDy.xz * s);
    vec4 nZ = textureGrad(uNormalArr, vec3(tP.xy * s, L), tDx.xy * s, tDy.xy * s);
    vec4 a = aX * bw.x + aY * bw.y + aZ * bw.z;
    float s2 = s * 0.29;
    vec4 fX = textureGrad(uAlbedoArr, vec3(tP.zy * s2 + 0.37, L), tDx.zy * s2, tDy.zy * s2);
    vec4 fY = textureGrad(uAlbedoArr, vec3(tP.xz * s2 + 0.37, L), tDx.xz * s2, tDy.xz * s2);
    vec4 fZ = textureGrad(uAlbedoArr, vec3(tP.xy * s2 + 0.37, L), tDx.xy * s2, tDy.xy * s2);
    vec4 aF = fX * bw.x + fY * bw.y + fZ * bw.z;
    a.rgb = mix(a.rgb, (a.rgb + aF.rgb) * 0.5, mix(0.3, 0.7, tFar));
    vec3 tnX = nX.xyz * 2.0 - 1.0; tnX.xy *= ns; tnX.z *= tAxis.x;
    vec3 tnY = nY.xyz * 2.0 - 1.0; tnY.xy *= ns; tnY.z *= tAxis.y;
    vec3 tnZ = nZ.xyz * 2.0 - 1.0; tnZ.xy *= ns; tnZ.z *= tAxis.z;
    tnX = vec3(tnX.xy + tN.zy, abs(tnX.z) * tN.x);
    tnY = vec3(tnY.xy + tN.xz, abs(tnY.z) * tN.y);
    tnZ = vec3(tnZ.xy + tN.xy, abs(tnZ.z) * tN.z);
    vec3 nw = normalize(tnX.zyx * bw.x + tnY.xzy * bw.y + tnZ.xyz * bw.z);
    float rg = nX.a * bw.x + nY.a * bw.y + nZ.a * bw.z;
#else
    vec4 a = textureGrad(uAlbedoArr, vec3(tP.xz * s, L), tDx.xz * s, tDy.xz * s);
    vec4 nn = textureGrad(uNormalArr, vec3(tP.xz * s, L), tDx.xz * s, tDy.xz * s);
    vec3 tnY = nn.xyz * 2.0 - 1.0; tnY.xy *= ns;
    tnY = vec3(tnY.xy + tN.xz, abs(tnY.z) * tN.y);
    vec3 nw = normalize(tnY.xzy);
    float rg = nn.a;
#endif
    float hn = dot(a.rgb, vec3(0.299, 0.587, 0.114)) * a.a / uLayerLum[i];
    float hw = wi * pow(clamp(hn, 0.05, 3.0), 3.0);
    tAlb += a.rgb * hw;
    tAO += a.a * hw;
    tNrm += nw * hw;
    tRough += rg * hw;
    tWs += hw;
  }
  tWs = max(tWs, 1e-5);
  tAlb /= tWs; tAO /= tWs; tNrm /= tWs; tRough /= tWs;
  float macro = 0.86 + 0.24 * tNoise(vTWorld.xz * 0.012) + 0.08 * tNoise(vTWorld.xz * 0.07);
  diffuseColor.rgb *= tAlb * mix(1.0, tAO, 0.85) * macro;
  float wet = 1.0 - smoothstep(uWaterLevel, uWaterLevel + 0.6, vTWorld.y);
  diffuseColor.rgb *= 1.0 - wet * 0.35;
  tRough = mix(tRough, 0.25, wet * 0.7);
  if (uViewMode > 0.5) {
    // mapa de inclinação: verde = anda, amarelo = rampa, vermelho = parede (útil para geodata)
    float slope = degrees(acos(clamp(tN.y, 0.0, 1.0)));
    vec3 sc = mix(vec3(0.2, 0.75, 0.3), vec3(0.95, 0.85, 0.2), smoothstep(15.0, 30.0, slope));
    sc = mix(sc, vec3(0.9, 0.2, 0.15), smoothstep(35.0, 45.0, slope));
    diffuseColor.rgb = sc * 0.8;
    tNrm = tN;
  }
`;

const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = clamp(tRough, 0.04, 1.0);
`;

const FRAG_NORMAL = /* glsl */ `
  normal = normalize((viewMatrix * vec4(normalize(tNrm), 0.0)).xyz);
`;

const FRAG_OVERLAY = /* glsl */ `
  if (uBrushOn > 0.5) {
    float bd = distance(vTWorld.xz, uBrushPos);
    float bwid = max(uBrushRadius * 0.03, 0.1);
    float ring = 1.0 - smoothstep(0.0, bwid, abs(bd - uBrushRadius));
    float inner = (1.0 - smoothstep(0.0, uBrushRadius, bd)) * 0.1;
    totalEmissiveRadiance += uBrushColor * (ring * 0.8 + inner);
  }
  if (uGridOn > 0.5) {
    vec2 gc = vTWorld.xz / uGridSize;
    vec2 gg = abs(fract(gc - 0.5) - 0.5) / fwidth(gc);
    float gline = 1.0 - min(min(gg.x, gg.y), 1.0);
    totalEmissiveRadiance += vec3(0.35, 0.33, 0.25) * gline * 0.5;
  }
`;

export class Terrain {
  constructor(app, { texSize = 1024 } = {}) {
    this.app = app;
    this.lt = new LayerTextures(texSize, LAYERS);
    this._sig = new Array(LAYERS).fill('');
    this.uniforms = {
      uSplatA: { value: null },
      uSplatB: { value: null },
      uAlbedoArr: { value: this.lt.albedo },
      uNormalArr: { value: this.lt.normal },
      uTiling: { value: new Float32Array(LAYERS).fill(0.25) },
      uNormalStr: { value: new Float32Array(LAYERS).fill(1) },
      uLayerLum: { value: new Float32Array(LAYERS).fill(0.2) },
      uViewMode: { value: 0 },
      uBrushPos: { value: new THREE.Vector2() },
      uBrushRadius: { value: 10 },
      uBrushOn: { value: 0 },
      uBrushColor: { value: new THREE.Color('#ffd27a') },
      uGridOn: { value: 0 },
      uGridSize: { value: 4 },
      uWaterLevel: { value: -1000 },
    };
    // Enquanto as fotos padrão carregam, cada camada fica com uma cor lisa.
    for (let i = 0; i < LAYERS; i++) {
      this.lt.fillFlat(i, LAYER_UI_COLORS[i]);
      this._sig[i] = this._signature(DEFAULT_LAYERS[i]);
    }
    this.defaults = [];
    this._defaultsReady = this._loadDefaults();
    this.setTiling(DEFAULT_LAYERS);
    this.material = this._makeMaterial();
    this.mesh = null;
    this.minH = 0;
    this.maxH = 0;
    this.stroke = null;
    this.softness = 0.7; // 0 = pincel duro, 1 = borda bem suave
  }

  _falloff(d) {
    return smoothstep(0, 1, (1 - d) / Math.max(0.05, this.softness));
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
    mat.defines = { TRIPLANAR: '' };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = VERT_HEAD + shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTUv = uv;
        vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
      shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
        .replace('#include <map_fragment>', FRAG_BLEND)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_OVERLAY}`);
    };
    mat.customProgramCacheKey = () => `terreno-v3-${'TRIPLANAR' in mat.defines}`;
    return mat;
  }

  // ---------------------------------------------------------------- criação
  create({ size, res, splatRes, heights = null, splat = null }) {
    this.size = size;
    this.res = res;
    this.splatRes = splatRes;
    this.cell = size / (res - 1);
    this.half = size / 2;
    this.heights = heights && heights.length === res * res ? heights : new Float32Array(res * res);

    const sN = splatRes * splatRes;
    this.splatF = new Float32Array(sN * LAYERS);
    this.splatA = new Uint8Array(sN * 4);
    this.splatB = new Uint8Array(sN * 4);
    if (splat && splat.length === sN * LAYERS) {
      for (let i = 0; i < sN * LAYERS; i++) this.splatF[i] = splat[i];
    } else if (splat && splat.length === sN * 4) {
      // projeto antigo (4 camadas)
      for (let i = 0; i < sN; i++) for (let c = 0; c < 4; c++) this.splatF[i * LAYERS + c] = splat[i * 4 + c];
    } else {
      for (let i = 0; i < sN; i++) this.splatF[i * LAYERS] = 255;
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.removeFromParent();
    }
    this.heightTex?.dispose();
    this.splatTexA?.dispose();
    this.splatTexB?.dispose();

    const geo = new THREE.BufferGeometry();
    const n = res * res;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        pos[k * 3] = -this.half + i * this.cell;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -this.half + j * this.cell;
        uv[k * 2] = i / (res - 1);
        uv[k * 2 + 1] = j / (res - 1);
      }
    }
    const idx = new Uint32Array((res - 1) * (res - 1) * 6);
    let o = 0;
    for (let j = 0; j < res - 1; j++) {
      for (let i = 0; i < res - 1; i++) {
        const a = j * res + i, b = a + 1, c = a + res, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'Terreno';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;

    this.heightTex = new THREE.DataTexture(this.heights, res, res, THREE.RedFormat, THREE.FloatType);
    this.heightTex.needsUpdate = true;
    const mk = (data) => {
      const t = new THREE.DataTexture(data, splatRes, splatRes, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    this.splatTexA = mk(this.splatA);
    this.splatTexB = mk(this.splatB);
    this.uniforms.uSplatA.value = this.splatTexA;
    this.uniforms.uSplatB.value = this.splatTexB;
    this._syncSplat(0, 0, splatRes - 1, splatRes - 1);

    this.updateRegion(0, 0, res - 1, res - 1);
    this.recomputeRange();
    this.app.events?.emit('terrain-rebuilt', this);
    return this.mesh;
  }

  // ---------------------------------------------------------------- amostragem
  heightAt(x, z) {
    const res = this.res;
    const gx = clamp((x + this.half) / this.cell, 0, res - 1.0001);
    const gz = clamp((z + this.half) / this.cell, 0, res - 1.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.heights;
    const k = j * res + i;
    return lerp(lerp(h[k], h[k + 1], fx), lerp(h[k + res], h[k + res + 1], fx), fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // Slope em graus.
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _v);
    return Math.acos(clamp(n.y, -1, 1)) / THREE.MathUtils.DEG2RAD;
  }

  inside(x, z) {
    return Math.abs(x) <= this.half && Math.abs(z) <= this.half;
  }

  // Raycast direto no heightmap (muito mais rápido do que testar triângulos).
  raycast(ray, out = new THREE.Vector3()) {
    const o = ray.origin, d = ray.direction;
    const lo = [-this.half, this.minH - 2, -this.half];
    const hi = [this.half, this.maxH + 2, this.half];
    let t0 = 0, t1 = 1e6;
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(da[a]) < 1e-9) {
        if (oa[a] < lo[a] || oa[a] > hi[a]) return null;
      } else {
        let ta = (lo[a] - oa[a]) / da[a], tb = (hi[a] - oa[a]) / da[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return null;
      }
    }
    const step = this.cell * 0.5;
    let prevT = t0;
    let prevAbove = o.y + d.y * t0 - this.heightAt(o.x + d.x * t0, o.z + d.z * t0) > 0;
    if (!prevAbove) return out.set(o.x + d.x * t0, this.heightAt(o.x + d.x * t0, o.z + d.z * t0), o.z + d.z * t0);
    for (let t = t0 + step; t <= t1 + step; t += step) {
      const tt = Math.min(t, t1);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const above = y - this.heightAt(x, z) > 0;
      if (!above) {
        let a = prevT, b = tt;
        for (let k = 0; k < 20; k++) {
          const m = (a + b) / 2;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          if (my - this.heightAt(mx, mz) > 0) a = m; else b = m;
        }
        const x2 = o.x + d.x * b, z2 = o.z + d.z * b;
        return out.set(x2, this.heightAt(x2, z2), z2);
      }
      prevT = tt;
      if (tt >= t1) break;
    }
    return null;
  }

  // ---------------------------------------------------------------- atualização da malha
  updateRegion(i0, j0, i1, j1) {
    const res = this.res;
    i0 = clamp(i0 - 1, 0, res - 1); j0 = clamp(j0 - 1, 0, res - 1);
    i1 = clamp(i1 + 1, 0, res - 1); j1 = clamp(j1 + 1, 0, res - 1);
    const pos = this.mesh.geometry.attributes.position;
    const nor = this.mesh.geometry.attributes.normal;
    const h = this.heights;
    const c2 = 2 * this.cell;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * res + i;
        pos.array[k * 3 + 1] = h[k];
        const hl = h[j * res + Math.max(i - 1, 0)], hr = h[j * res + Math.min(i + 1, res - 1)];
        const hd = h[Math.max(j - 1, 0) * res + i], hu = h[Math.min(j + 1, res - 1) * res + i];
        let nx = hl - hr, ny = c2, nz = hd - hu;
        const len = Math.hypot(nx, ny, nz);
        nor.array[k * 3] = nx / len;
        nor.array[k * 3 + 1] = ny / len;
        nor.array[k * 3 + 2] = nz / len;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.heightTex.needsUpdate = true;
  }

  recomputeRange() {
    let mn = Infinity, mx = -Infinity;
    for (const v of this.heights) { if (v < mn) mn = v; if (v > mx) mx = v; }
    this.minH = mn;
    this.maxH = mx;
  }

  _syncSplat(si0, sj0, si1, sj1) {
    const s = this.splatRes, F = this.splatF, A = this.splatA, B = this.splatB;
    for (let j = sj0; j <= sj1; j++) {
      for (let i = si0; i <= si1; i++) {
        const p = j * s + i, k = p * 4, f = p * LAYERS;
        A[k] = F[f]; A[k + 1] = F[f + 1]; A[k + 2] = F[f + 2]; A[k + 3] = F[f + 3];
        B[k] = F[f + 4]; B[k + 1] = F[f + 5]; B[k + 2] = F[f + 6]; B[k + 3] = F[f + 7];
      }
    }
    if (this.splatTexA) { this.splatTexA.needsUpdate = true; this.splatTexB.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- pincéis
  // kind: 'height' | 'paint' | 'both' (ferramenta Caminho mexe na altura e na pintura)
  beginStroke(kind, x, z) {
    this.stroke = {
      kind,
      beforeH: kind !== 'paint' ? this.heights.slice() : null,
      beforeS: kind !== 'height' ? this.splatF.slice() : null,
      rectH: null,
      rectS: null,
      flatHeight: this.heightAt(x, z),
    };
  }

  _grow(which, i0, j0, i1, j1) {
    const st = this.stroke;
    if (!st) return;
    const key = which === 'S' ? 'rectS' : 'rectH';
    const r = st[key];
    if (!r) st[key] = [i0, j0, i1, j1];
    else {
      r[0] = Math.min(r[0], i0); r[1] = Math.min(r[1], j0);
      r[2] = Math.max(r[2], i1); r[3] = Math.max(r[3], j1);
    }
  }

  _regionCommand(rect, W, ch, beforeArr, getTarget, afterApply) {
    const [i0, j0, i1, j1] = rect;
    const extract = (src) => {
      const out = new Float32Array((i1 - i0 + 1) * (j1 - j0 + 1) * ch);
      let o = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let c = 0; c < ch; c++) out[o++] = src[(j * W + i) * ch + c];
      return out;
    };
    const before = extract(beforeArr);
    const after = extract(getTarget());
    const apply = (data) => {
      const dst = getTarget();
      let o = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let c = 0; c < ch; c++) dst[(j * W + i) * ch + c] = data[o++];
      afterApply(i0, j0, i1, j1);
    };
    return { undo: () => apply(before), redo: () => apply(after) };
  }

  endStroke(label = 'Pincel') {
    const st = this.stroke;
    this.stroke = null;
    if (!st || (!st.rectH && !st.rectS)) return;
    this.recomputeRange();
    const parts = [];
    if (st.rectH) {
      parts.push(this._regionCommand(st.rectH, this.res, 1, st.beforeH, () => this.heights, (a, b, c, d) => { this.updateRegion(a, b, c, d); this.recomputeRange(); }));
    }
    if (st.rectS) {
      parts.push(this._regionCommand(st.rectS, this.splatRes, LAYERS, st.beforeS, () => this.splatF, (a, b, c, d) => this._syncSplat(a, b, c, d)));
    }
    const emit = () => this.app.events?.emit('terrain-changed');
    this.app.history?.push({
      label,
      undo: () => { for (const p of parts) p.undo(); emit(); },
      redo: () => { for (const p of parts) p.redo(); emit(); },
    });
    emit();
  }

  sculpt(tool, cx, cz, radius, strength, dt) {
    const res = this.res, h = this.heights, cell = this.cell;
    const i0 = clamp(Math.floor((cx - radius + this.half) / cell), 0, res - 1);
    const i1 = clamp(Math.ceil((cx + radius + this.half) / cell), 0, res - 1);
    const j0 = clamp(Math.floor((cz - radius + this.half) / cell), 0, res - 1);
    const j1 = clamp(Math.ceil((cz + radius + this.half) / cell), 0, res - 1);
    const src = tool === 'suavizar' || tool === 'erosao' || tool === 'caminho' ? h.slice() : null;
    const noise = tool === 'ruido' ? (this._sculptNoise ||= new Noise2D(1234)) : null;
    const flat = this.stroke?.flatHeight ?? 0;
    const talus = cell * 0.5;
    const at = (i, j) => src[clamp(j, 0, res - 1) * res + clamp(i, 0, res - 1)];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -this.half + i * cell, z = -this.half + j * cell;
        const d = Math.hypot(x - cx, z - cz) / radius;
        if (d >= 1) continue;
        const f = this._falloff(d);
        const k = j * res + i;
        const s = strength * dt * f;
        switch (tool) {
          case 'elevar': h[k] += s * 14; break;
          case 'abaixar': h[k] -= s * 14; break;
          case 'suavizar':
          case 'caminho': {
            const R = tool === 'caminho' ? 3 : 2;
            let sum = 0, cnt = 0;
            for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { sum += at(i + di, j + dj); cnt++; }
            h[k] = lerp(h[k], sum / cnt, clamp(s * (tool === 'caminho' ? 10 : 8), 0, 1));
            break;
          }
          case 'nivelar': h[k] = lerp(h[k], flat, clamp(s * 6, 0, 1)); break;
          case 'ruido': h[k] += noise.fbm(x * 0.06, z * 0.06, 3) * s * 12; break;
          case 'erosao': {
            // erosão térmica: material escorre para o vizinho mais baixo quando a encosta passa do limite
            const hk = at(i, j);
            let lowest = hk, li = i, lj = j;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const hn = at(i + di, j + dj);
              if (hn < lowest) { lowest = hn; li = i + di; lj = j + dj; }
            }
            const diff = hk - lowest;
            if (diff > talus && (li !== i || lj !== j)) {
              const move = (diff - talus) * 0.5 * clamp(s * 12, 0, 1);
              h[k] -= move;
              const nk = clamp(lj, 0, res - 1) * res + clamp(li, 0, res - 1);
              h[nk] += move * 0.9;
            }
            break;
          }
          default: break;
        }
        if (h[k] < this.minH) this.minH = h[k];
        if (h[k] > this.maxH) this.maxH = h[k];
      }
    }
    this.updateRegion(i0, j0, i1, j1);
    this._grow('H', Math.max(0, i0 - 1), Math.max(0, j0 - 1), Math.min(res - 1, i1 + 1), Math.min(res - 1, j1 + 1));
    if (tool === 'caminho') this.paint(7, cx, cz, radius * 0.75, strength * 1.5, dt);
  }

  paint(layer, cx, cz, radius, strength, dt) {
    const s = this.splatRes, texel = this.size / s;
    const i0 = clamp(Math.floor((cx - radius + this.half) / texel), 0, s - 1);
    const i1 = clamp(Math.ceil((cx + radius + this.half) / texel), 0, s - 1);
    const j0 = clamp(Math.floor((cz - radius + this.half) / texel), 0, s - 1);
    const j1 = clamp(Math.ceil((cz + radius + this.half) / texel), 0, s - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -this.half + (i + 0.5) * texel, z = -this.half + (j + 0.5) * texel;
        const d = Math.hypot(x - cx, z - cz) / radius;
        if (d >= 1) continue;
        const f = this._falloff(d);
        this._addWeight((j * s + i) * LAYERS, layer, strength * dt * f * 900);
      }
    }
    this._syncSplat(i0, j0, i1, j1);
    this._grow('S', i0, j0, i1, j1);
  }

  _addWeight(k, layer, amount) {
    const w = this.splatF;
    const nv = Math.min(255, w[k + layer] + amount);
    let others = 0;
    for (let c = 0; c < LAYERS; c++) if (c !== layer) others += w[k + c];
    const rest = 255 - nv;
    if (others > 1e-6) {
      const sc = rest / others;
      for (let c = 0; c < LAYERS; c++) if (c !== layer) w[k + c] *= sc;
      w[k + layer] = nv;
    } else {
      w[k + layer] = 255;
    }
  }

  // ---------------------------------------------------------------- geradores
  generate(kind, p) {
    const res = this.res, h = this.heights;
    const n = new Noise2D(p.seed | 0);
    const warp = new Noise2D((p.seed | 0) + 7);
    const H = p.height, S = Math.max(10, p.scale);
    const rough = p.roughness ?? 0.5;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -this.half + i * this.cell, z = -this.half + j * this.cell;
        const nx = x / S, nz = z / S;
        const d = Math.hypot(x, z) / this.half;
        const wx = nx + warp.fbm(nx * 0.5, nz * 0.5, 3) * 0.45;
        const wz = nz + warp.fbm(nx * 0.5 + 9, nz * 0.5 - 4, 3) * 0.45;
        const mountains = () => Math.pow(n.ridged(wx, wz, 6, 2, 0.4 + rough * 0.15), 1.25) * H * 1.35 + (n.fbm(nx * 0.5 + 10, nz * 0.5, 4) * 0.5 + 0.5) * 0.18 * H;
        let v = 0;
        switch (kind) {
          case 'montanhas': v = mountains(); break;
          case 'colinas': v = (n.fbm(wx, wz, 5, 2, 0.4 + rough * 0.2) * 0.5 + 0.5) * H * 0.45; break;
          case 'ilha': {
            const fall = 1 - smoothstep(0.35, 0.95, d);
            v = ((n.fbm(wx, wz, 5) * 0.5 + 0.5) * 0.5 * H + mountains() * 0.5) * fall - (1 - fall) * 10;
            break;
          }
          case 'vale': {
            const m = smoothstep(0.15, 0.85, d);
            v = mountains() * m + (n.fbm(wx * 2, wz * 2, 4) * 0.5 + 0.5) * H * 0.06;
            break;
          }
          case 'plano':
          default: v = 0;
        }
        if (p.plateau > 0 && kind !== 'plano') {
          const pd = Math.hypot(x, z);
          const t = smoothstep(p.plateau * 0.75, p.plateau * 1.35, pd);
          v = lerp(p.plateauHeight ?? 2, v, t);
        }
        h[j * res + i] = v;
      }
    }
    // duas passadas de suavização deixam as cristas mais naturais
    if (kind !== 'plano') {
      for (let pass = 0; pass < 2; pass++) {
        const src = h.slice();
        for (let j = 1; j < res - 1; j++) {
          for (let i = 1; i < res - 1; i++) {
            const k = j * res + i;
            h[k] = src[k] * 0.5 + (src[k - 1] + src[k + 1] + src[k - res] + src[k + res]) * 0.125;
          }
        }
      }
    }
    this.updateRegion(0, 0, res - 1, res - 1);
    this.recomputeRange();
    this.app.events?.emit('terrain-changed');
  }

  // Pinta automaticamente: grama no plano, terra em rampas, rocha nas encostas, neve no alto,
  // areia na beira da água, lama em baixadas úmidas.
  autoPaint(p) {
    const s = this.splatRes, texel = this.size / s;
    const n = new Noise2D(99);
    const w = this.splatF;
    const wt = new Float32Array(LAYERS);
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const x = -this.half + (i + 0.5) * texel, z = -this.half + (j + 0.5) * texel;
        const hgt = this.heightAt(x, z);
        const slope = this.slopeAt(x, z);
        const noise = n.fbm(x * 0.03, z * 0.03, 3);
        wt.fill(0);
        const rock = smoothstep(p.rockSlope - 7, p.rockSlope + 7, slope + noise * 6);
        const snow = smoothstep(p.snowHeight - 8, p.snowHeight + 8, hgt + noise * 10) * (1 - rock * 0.75);
        const sand = (1 - smoothstep(p.waterLevel + 0.6, p.waterLevel + 2.4, hgt)) * (1 - rock);
        const mud = smoothstep(0.35, 0.6, n.fbm(x * 0.05 + 40, z * 0.05, 2)) * (1 - smoothstep(p.waterLevel + 2, p.waterLevel + 6, hgt)) * (1 - sand) * 0.8;
        const dirt = (smoothstep(0.25, 0.55, noise) * 0.55 + smoothstep(18, 30, slope) * 0.8) * (1 - rock) * (1 - snow) * (1 - sand);
        wt[2] = rock;
        wt[3] = snow;
        wt[4] = sand;
        wt[5] = mud * (1 - rock) * (1 - snow);
        wt[1] = dirt;
        wt[0] = Math.max(0, 1 - rock - snow - sand - wt[5] - dirt);
        let sum = 0;
        for (let c = 0; c < LAYERS; c++) sum += wt[c];
        sum = sum || 1;
        const k = (j * s + i) * LAYERS;
        for (let c = 0; c < LAYERS; c++) w[k + c] = (wt[c] / sum) * 255;
      }
    }
    this._syncSplat(0, 0, s - 1, s - 1);
    this.app.events?.emit('terrain-changed');
  }

  fillLayer(layer) {
    const w = this.splatF;
    for (let k = 0; k < w.length; k += LAYERS) {
      for (let c = 0; c < LAYERS; c++) w[k + c] = 0;
      w[k + layer] = 255;
    }
    this._syncSplat(0, 0, this.splatRes - 1, this.splatRes - 1);
    this.app.events?.emit('terrain-changed');
  }

  // Importa heightmap de imagem (8 bits via canvas) ou RAW 16 bits (.r16/.raw).
  importHeightmap({ image, raw16, rawSize, minH, maxH }) {
    const res = this.res;
    let get = () => 0;
    if (image) {
      const c = document.createElement('canvas');
      c.width = c.height = res;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, res, res);
      const data = ctx.getImageData(0, 0, res, res).data;
      get = (i, j) => data[(j * res + i) * 4] / 255;
    } else if (raw16) {
      const N = rawSize;
      get = (i, j) => {
        const x = (i / (res - 1)) * (N - 1), y = (j / (res - 1)) * (N - 1);
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, N - 1), y1 = Math.min(y0 + 1, N - 1);
        const fx = x - x0, fy = y - y0;
        const g = (a, b) => raw16[b * N + a] / 65535;
        return lerp(lerp(g(x0, y0), g(x1, y0), fx), lerp(g(x0, y1), g(x1, y1), fx), fy);
      };
    }
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) this.heights[j * res + i] = lerp(minH, maxH, get(i, j));
    this.updateRegion(0, 0, res - 1, res - 1);
    this.recomputeRange();
    this.app.events?.emit('terrain-changed');
  }

  // ---------------------------------------------------------------- texturas das camadas
  // Miniaturas (canvas) e cor média de cada camada, para o Navegador de Conteúdo e o minimapa.
  get layerTextures() {
    return this.lt.previews.map((c) => ({ image: c }));
  }

  get layerAvg() {
    return this.lt.avg;
  }

  _signature(l) {
    return [l.texture?.length || 0, l.normal?.length || 0, l.rough?.length || 0, l.ao?.length || 0, !!l.normalDX, l.roughness ?? 0.9].join('|');
  }

  // Aplica as imagens da camada (cor, normal, rugosidade, AO). Sem cor, usa a textura padrão.
  // Fotos padrão (embutidas no editor) de cada camada.
  async _loadDefaults() {
    const load = (url) => loadDataUrl(url).catch(() => null);
    this.defaults = await Promise.all(TERRAIN_SETS.map(async (t) => {
      const [color, normal, arm] = await Promise.all([load(t.color), load(t.normal), load(t.arm)]);
      return { color, normal, arm };
    }));
    for (let i = 0; i < LAYERS; i++) this._write(i, DEFAULT_LAYERS[i], {});
    this.app.events?.emit('layers-changed');
  }

  // Mapas que faltarem na camada vêm da foto padrão (se a cor também for padrão).
  _write(i, layer, own) {
    const def = this.defaults[i] || {};
    const custom = !!own.color;
    const color = own.color || def.color;
    if (!color) return;
    this.lt.setLayer(i, {
      color,
      normal: own.normal || (custom ? null : def.normal),
      rough: own.rough,
      ao: own.ao,
      arm: custom ? null : def.arm,
      normalDX: own.normal ? !!layer.normalDX : false,
      roughness: layer.roughness ?? 0.9,
    });
    this.uniforms.uLayerLum.value[i] = Math.max(0.02, this.lt.lum[i]);
  }

  async setLayer(i, layer) {
    await this._defaultsReady;
    const sig = this._signature(layer);
    if (sig === this._sig[i]) return;
    const load = async (url) => {
      if (!url) return null;
      try { return await loadDataUrl(url); } catch { return null; }
    };
    const [color, normal, rough, ao] = await Promise.all([load(layer.texture), load(layer.normal), load(layer.rough), load(layer.ao)]);
    this._write(i, layer, { color, normal, rough, ao });
    this._sig[i] = sig;
    this.app.events?.emit('layers-changed');
  }

  setTextureSize(size) {
    if (!this.lt.setSize(size)) return;
    this.uniforms.uAlbedoArr.value = this.lt.albedo;
    this.uniforms.uNormalArr.value = this.lt.normal;
  }

  setTiling(layers) {
    for (let i = 0; i < LAYERS; i++) {
      this.uniforms.uTiling.value[i] = layers[i]?.tiling ?? 0.25;
      this.uniforms.uNormalStr.value[i] = layers[i]?.normalStrength ?? 1;
    }
  }

  setTriplanar(on) {
    if (on === 'TRIPLANAR' in this.material.defines) return;
    if (on) this.material.defines.TRIPLANAR = '';
    else delete this.material.defines.TRIPLANAR;
    this.material.needsUpdate = true;
  }

  setBrush(visible, x = 0, z = 0, radius = 10, colorHex = '#ffd27a') {
    this.uniforms.uBrushOn.value = visible ? 1 : 0;
    this.uniforms.uBrushPos.value.set(x, z);
    this.uniforms.uBrushRadius.value = radius;
    this.uniforms.uBrushColor.value.set(colorHex);
  }

  // Peso (0..1) de uma camada numa posição do mundo (bilinear).
  layerWeightAt(layer, x, z) {
    const s = this.splatRes;
    const gx = clamp(((x + this.half) / this.size) * s - 0.5, 0, s - 1.001);
    const gz = clamp(((z + this.half) / this.size) * s - 0.5, 0, s - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const w = this.splatF;
    const at = (a, b) => {
      const k = (b * s + a) * LAYERS;
      let sum = 0;
      for (let c = 0; c < LAYERS; c++) sum += w[k + c];
      return w[k + layer] / (sum || 1);
    };
    return lerp(lerp(at(i, j), at(i + 1, j), fx), lerp(at(i, j + 1), at(i + 1, j + 1), fx), fz);
  }

  // ---------------------------------------------------------------- serialização
  serialize() {
    const bytes = new Uint8Array(this.splatF.length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(this.splatF[i]);
    return { heights: float32ToBase64(this.heights), splat: bytesToBase64(bytes) };
  }

  static decode(t) {
    return {
      heights: t.heights ? base64ToFloat32(t.heights) : null,
      splat: t.splat ? base64ToBytes(t.splat) : null,
    };
  }
}

const _v = new THREE.Vector3();
