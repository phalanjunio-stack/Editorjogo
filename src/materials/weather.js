// Shader dos materiais da biblioteca (usado pelo Construtor): foto PBR com relevo (parallax pela
// altura), mistura com um 2º material (reboco caindo e mostrando o tijolo), e envelhecimento
// procedural em espaço de mundo: variação de cor, desgaste, musgo, sujeira embaixo e umidade.
// As UVs da geometria são em metros; cada material diz quantos metros tem uma repetição da foto.
import * as THREE from 'three';

export const WEATHER_DEFAULTS = {
  colorVar: 0.35, // variação de cor
  wear: 0.25, // desgaste
  moss: 0.15, // musgo
  dirt: 0.35, // sujeira embaixo
  humidity: 0.2, // umidade
  damage: 0.0, // dano no reboco (mostra o material de baixo)
  grout: 0.5, // profundidade do rejunte
  normal: 1, // força do relevo
  parallax: 0.6, // altura / parallax
};

const GLSL_COMMON = /* glsl */ `
uniform sampler2D uColA, uNorA, uArhA, uColB, uNorB, uArhB;
uniform vec3 uTintA, uTintB;
uniform vec4 uTile; // x,y: metros por repetição de A e B; z: escala UV; w: rotação da textura
uniform vec2 uUvOff;
uniform float uHasB, uHeightA, uHeightB, uNormA, uNormB, uRoughA, uRoughB, uMetalA, uMetalB;
uniform float uColorVar, uWear, uMoss, uDirt, uHumid, uDamage, uGrout, uNormal, uParallax, uSeed;
varying vec3 vWxPos;
varying vec3 vWxNrm;
varying vec3 vWxObj;

float wxHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wxNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wxHash(i), wxHash(i + vec3(1, 0, 0)), f.x), mix(wxHash(i + vec3(0, 1, 0)), wxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wxHash(i + vec3(0, 0, 1)), wxHash(i + vec3(1, 0, 1)), f.x), mix(wxHash(i + vec3(0, 1, 1)), wxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wxFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * wxNoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
mat3 wxFrame(vec3 eye, vec3 n, vec2 uv) {
  vec3 q0 = dFdx(eye), q1 = dFdy(eye);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, n), q0p = cross(n, q0);
  vec3 T = q1p * st0.x + q0p * st1.x;
  vec3 B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * s, B * s, n);
}
`;

// Substitui o map_fragment: calcula UV com relevo, mistura A/B, envelhecimento e deixa prontos
// wxArh (oclusão, rugosidade, altura), wxNt (normal no espaço da textura) e as máscaras.
const MAP_FRAGMENT = /* glsl */ `
  vec3 wxNv = normalize(vNormal);
  #ifdef DOUBLE_SIDED
    wxNv *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  float wxC = cos(uTile.w), wxS = sin(uTile.w);
  vec2 wxM = (mat2(wxC, wxS, -wxS, wxC) * vUv) * uTile.z + uUvOff; // metros
  mat3 wxTBN = wxFrame(-vViewPosition, wxNv, wxM);
  // relevo: parallax com oclusão (só de perto)
  float wxDist = length(vViewPosition);
  float wxPx = uParallax * uHeightA * smoothstep(28.0, 6.0, wxDist);
  if (wxPx > 0.0005) {
    vec3 vt = normalize(vec3(dot(wxTBN[0], vViewPosition), dot(wxTBN[1], vViewPosition), dot(wxNv, vViewPosition)));
    vec2 gx = dFdx(wxM / uTile.x), gy = dFdy(wxM / uTile.x);
    float layers = mix(14.0, 5.0, abs(vt.z));
    vec2 stepM = (vt.xy / max(vt.z, 0.25)) * wxPx / layers;
    float depth = 0.0, dl = 1.0 / layers;
    vec2 m = wxM;
    float h = 1.0 - textureGrad(uArhA, m / uTile.x, gx, gy).b;
    for (int i = 0; i < 14; i++) {
      if (depth >= h) break;
      m -= stepM;
      h = 1.0 - textureGrad(uArhA, m / uTile.x, gx, gy).b;
      depth += dl;
    }
    vec2 prev = m + stepM;
    float after = h - depth;
    float before = (1.0 - textureGrad(uArhA, prev / uTile.x, gx, gy).b) - depth + dl;
    wxM = mix(m, prev, clamp(after / (after - before + 1e-5), 0.0, 1.0));
  }
  vec2 wxUvA = wxM / uTile.x, wxUvB = wxM / uTile.y;
  vec4 wxColA = texture2D(uColA, wxUvA);
  vec3 wxArh = texture2D(uArhA, wxUvA).rgb;
  wxArh.b = mix(0.5, wxArh.b, uHeightA);
  vec3 wxNt = texture2D(uNorA, wxUvA).xyz * 2.0 - 1.0;
  wxNt.xy *= uNormA;
  vec3 wxAlb = wxColA.rgb * uTintA;
  float wxRough = wxArh.g * uRoughA;
  float wxMetal = uMetalA;
  vec3 wp = vWxPos + uSeed * 13.1;
  float n1 = wxFbm(wp * 0.33);
  float n2 = wxFbm(wp * 1.4 + 5.0);
  float n3 = wxNoise(wp * 7.0);
  // 2º material por baixo (reboco quebrado, pedra aparecendo...)
  float wxMaskB = 0.0;
  if (uHasB > 0.5 && uDamage > 0.0) {
    float t = n2 * 0.75 + n3 * 0.15 + (0.5 - wxArh.b) * 0.25;
    wxMaskB = smoothstep(1.02 - uDamage, 1.08 - uDamage, t);
    vec3 cb = texture2D(uColB, wxUvB).rgb * uTintB;
    vec3 ab = texture2D(uArhB, wxUvB).rgb;
    ab.b = mix(0.5, ab.b, uHeightB);
    vec3 nb = texture2D(uNorB, wxUvB).xyz * 2.0 - 1.0;
    nb.xy *= uNormB;
    // borda do reboco: um pouco mais escura
    float edge = smoothstep(0.0, 0.5, wxMaskB) * (1.0 - smoothstep(0.5, 1.0, wxMaskB));
    wxAlb = mix(wxAlb, cb, wxMaskB) * (1.0 - edge * 0.35);
    wxArh = mix(wxArh, vec3(ab.r * (1.0 - edge * 0.4), ab.g, ab.b * 0.8), wxMaskB);
    wxNt = mix(wxNt, nb, wxMaskB);
    wxRough = mix(wxRough, ab.g * uRoughB, wxMaskB);
    wxMetal = mix(wxMetal, uMetalB, wxMaskB);
  }
  vec3 wn = normalize(vWxNrm);
  float up = wn.y;
  float y = vWxObj.y;
  // rejunte: fundo mais escuro nas partes baixas do relevo
  float grout = pow(1.0 - wxArh.b, 2.2) * uGrout * step(0.001, uHeightA);
  wxAlb *= 1.0 - grout * 0.55;
  wxArh.r *= 1.0 - grout * 0.5;
  // variação de cor em manchas grandes
  float lum = dot(wxAlb, vec3(0.299, 0.587, 0.114));
  wxAlb *= 1.0 + (n1 - 0.5) * 0.7 * uColorVar;
  wxAlb = mix(wxAlb, mix(vec3(lum), wxAlb, 1.0 + (n3 - 0.5) * 0.6), uColorVar * 0.5);
  // desgaste: manchas desbotadas e mais ásperas
  float wear = smoothstep(0.58, 0.78, n2 + uWear * 0.45 - 0.2 + (wxArh.b - 0.5) * 0.3) * uWear;
  wxAlb = mix(wxAlb, vec3(lum) * 1.08 + 0.03, wear * 0.55);
  wxRough = mix(wxRough, 1.0, wear * 0.5);
  // umidade: embaixo e nas manchas, mais escuro e brilhante
  float wet = uHumid * (1.0 - smoothstep(0.0, 3.0, y) * 0.75) * (0.55 + 0.45 * n1);
  wxAlb *= 1.0 - wet * 0.4;
  wxRough *= 1.0 - wet * 0.55;
  // sujeira: barro subindo do chão
  float dirt = uDirt * (1.0 - smoothstep(0.0, 1.3 + n1 * 0.8, y)) * (0.55 + 0.45 * n2);
  dirt += uDirt * 0.25 * smoothstep(0.7, 0.9, n3 * 0.5 + n2 * 0.6) * (1.0 - abs(up));
  wxAlb = mix(wxAlb, wxAlb * vec3(0.52, 0.45, 0.36), clamp(dirt, 0.0, 1.0));
  // musgo: virado para cima, perto do chão, nas frestas e onde é úmido
  float mossAmt = uMoss * (0.45 + 0.55 * max(up, 0.0)) + uHumid * 0.25 * uMoss;
  float moss = smoothstep(0.62, 0.8, n2 * 0.8 + n3 * 0.25 + (0.5 - wxArh.b) * 0.5 + mossAmt * 0.7 - smoothstep(0.0, 6.0, y) * 0.15 * (1.0 - max(up, 0.0))) * step(0.001, uMoss);
  vec3 mossCol = mix(vec3(0.12, 0.17, 0.05), vec3(0.3, 0.36, 0.12), n3);
  wxAlb = mix(wxAlb, mossCol, moss * 0.9);
  wxRough = mix(wxRough, 0.95, moss);
  wxNt.xy *= 1.0 - moss * 0.6;
  diffuseColor.rgb *= wxAlb;
`;

const ROUGHNESS_FRAGMENT = /* glsl */ `float roughnessFactor = clamp(roughness * wxRough, 0.04, 1.0);`;
const METALNESS_FRAGMENT = /* glsl */ `float metalnessFactor = metalness * wxMetal;`;
const NORMAL_MAPS = /* glsl */ `
  {
    vec3 mn = wxNt;
    mn.xy *= uNormal;
    normal = normalize(mat3(wxTBN[0], wxTBN[1], normal) * mn);
  }
`;
const AO_FRAGMENT = /* glsl */ `
  {
    float ambientOcclusion = wxArh.r;
    reflectedLight.indirectDiffuse *= ambientOcclusion;
    #if defined( USE_ENVMAP ) && defined( STANDARD )
      float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
      reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
    #endif
  }
`;

const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
const FLAT_NORMAL = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
const MID_ARH = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 200, 128, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/**
 * Material PBR com envelhecimento.
 * @param {object} a  {color, normal, arh: THREE.Texture, tile, tint, roughness, metalness, normalScale, hasHeight}
 * @param {object|null} b  segundo material (mesmo formato) ou null
 * @param {object} w  parâmetros (WEATHER_DEFAULTS) + {uvScale, uvRot, uvOff:[x,y], seed}
 */
export function weatherMaterial(a, b, w = {}) {
  const p = { ...WEATHER_DEFAULTS, ...w };
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 1 });
  mat.defines = { USE_UV: '' };
  const uniforms = {
    uColA: { value: a.color || WHITE },
    uNorA: { value: a.normal || FLAT_NORMAL },
    uArhA: { value: a.arh || MID_ARH },
    uColB: { value: b?.color || WHITE },
    uNorB: { value: b?.normal || FLAT_NORMAL },
    uArhB: { value: b?.arh || MID_ARH },
    uTintA: { value: new THREE.Color(a.tint || '#ffffff') },
    uTintB: { value: new THREE.Color(b?.tint || '#ffffff') },
    uTile: { value: new THREE.Vector4(a.tile || 2, b?.tile || 2, 1 / (p.uvScale || 1), p.uvRot || 0) },
    uUvOff: { value: new THREE.Vector2(...(p.uvOff || [0, 0])) },
    uHasB: { value: b ? 1 : 0 },
    uHeightA: { value: a.hasHeight === false ? 0 : 1 },
    uHeightB: { value: b && b.hasHeight !== false ? 1 : 0 },
    uNormA: { value: a.normalScale ?? 1 },
    uNormB: { value: b?.normalScale ?? 1 },
    uRoughA: { value: a.roughness ?? 1 },
    uRoughB: { value: b?.roughness ?? 1 },
    uMetalA: { value: a.metalness ?? 0 },
    uMetalB: { value: b?.metalness ?? 0 },
    uColorVar: { value: p.colorVar },
    uWear: { value: p.wear },
    uMoss: { value: p.moss },
    uDirt: { value: p.dirt },
    uHumid: { value: p.humidity },
    uDamage: { value: b ? p.damage : 0 },
    uGrout: { value: p.grout },
    uNormal: { value: p.normal },
    uParallax: { value: p.parallax * (a.depth ?? 0.025) },
    uSeed: { value: p.seed || 0 },
  };
  mat.userData.weather = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWxPos;\nvarying vec3 vWxNrm;\nvarying vec3 vWxObj;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vWxObj = transformed;\n  vWxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWxNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_FRAGMENT)
      .replace('#include <metalnessmap_fragment>', METALNESS_FRAGMENT)
      .replace('#include <normal_fragment_maps>', NORMAL_MAPS)
      .replace('#include <aomap_fragment>', AO_FRAGMENT);
  };
  mat.customProgramCacheKey = () => 'wx1';
  return mat;
}

/** Atualiza os controles de envelhecimento sem recriar o material. */
export function setWeather(mat, w) {
  const u = mat.userData.weather;
  if (!u) return;
  const map = { colorVar: 'uColorVar', wear: 'uWear', moss: 'uMoss', dirt: 'uDirt', humidity: 'uHumid', grout: 'uGrout', normal: 'uNormal' };
  for (const [k, n] of Object.entries(map)) if (w[k] !== undefined) u[n].value = w[k];
  if (w.damage !== undefined) u.uDamage.value = u.uHasB.value ? w.damage : 0;
}
