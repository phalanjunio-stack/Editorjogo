// Grama instanciada na GPU que acompanha a câmera. A altura vem do heightmap e a densidade
// vem da camada "Grama" da splatmap, então pintar grama no terreno já faz a grama nascer.
import * as THREE from 'three';
import { rng } from '../core/util.js';

const VERT = /* glsl */ `
precision highp float;
uniform sampler2D uHeight;
uniform sampler2D uSplatA;
uniform sampler2D uSplatB;
uniform float uRes;
uniform float uSize;
uniform float uRadius;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uBladeH;
uniform float uBladeW;
uniform float uWaterLevel;
uniform vec3 uColorBase;
uniform vec3 uColorTip;
uniform float uFlowers;
uniform vec3 uFlowerA;
uniform vec3 uFlowerB;
uniform float uHeads;
uniform vec4 uMaskA;
uniform vec4 uMaskB;
uniform vec3 uHeadColor;
uniform float uStiff;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
attribute vec2 aOffset;
attribute vec4 aRnd;
varying vec3 vColor;
#include <fog_pars_vertex>

float heightAt(vec2 p) {
  float cell = uSize / (uRes - 1.0);
  vec2 g = clamp((p + uSize * 0.5) / cell, vec2(0.0), vec2(uRes - 1.001));
  ivec2 i0 = ivec2(floor(g));
  vec2 f = fract(g);
  float h00 = texelFetch(uHeight, i0, 0).r;
  float h10 = texelFetch(uHeight, i0 + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, i0 + ivec2(0, 1), 0).r;
  float h11 = texelFetch(uHeight, i0 + ivec2(1, 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

void main() {
  vec2 cam = cameraPosition.xz;
  vec2 wp = cam + mod(aOffset - cam + uRadius, vec2(2.0 * uRadius)) - uRadius;
  float dist = length(wp - cam);
  float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius, dist);
  vec2 uv = (wp + uSize * 0.5) / uSize;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 sa = texture(uSplatA, uv);
  vec4 sb = texture(uSplatB, uv);
  float gw = (dot(sa, uMaskA) + dot(sb, uMaskB)) / max(sa.r + sa.g + sa.b + sa.a + sb.r + sb.g + sb.b + sb.a, 1e-3);
  float h = heightAt(wp);
  float keep = step(aRnd.x, gw * 1.15 - 0.1) * inside * step(uWaterLevel + 0.15, h);
  float scale = keep * fade;

  float t = position.y;
  float ang = aRnd.z * 6.2831853;
  vec2 side = vec2(cos(ang), sin(ang));
  float flower = step(fract(aRnd.w * 7.31 + aRnd.x * 3.7), uFlowers);
  // pendão/espiga (trigo, juncos): cabeça alongada no alto da folha
  float head = step(fract(aRnd.w * 5.13 + aRnd.y * 2.31), uHeads) * (1.0 - flower);
  float bladeH = uBladeH * mix(0.55, 1.35, aRnd.y) * scale * (1.0 + flower * 0.25 + head * 0.12);

  // vento: rajadas lentas + tremor rápido
  float phase = dot(wp, uWindDir);
  float gust = sin(uTime * 0.9 - phase * 0.08) * 0.5 + 0.5;
  float flutter = sin(uTime * 3.1 - phase * 0.6 + aRnd.w * 6.28) * 0.5 + 0.5;
  float bend = (uWind * (0.25 + 0.75 * gust) * (0.6 + 0.4 * flutter) + 0.12 * (aRnd.w - 0.5)) * t * t * (1.0 - uStiff * 0.7);

  vec3 pos;
  float headW = 1.0 + flower * 2.2 * smoothstep(0.55, 0.75, t) * (1.0 - smoothstep(0.85, 1.0, t))
    + head * 1.6 * smoothstep(0.62, 0.72, t) * (1.0 - smoothstep(0.92, 1.0, t));
  pos.xz = wp + side * position.x * uBladeW * headW * (0.4 + scale * 0.6) + uWindDir * bend * bladeH;
  pos.y = h + t * bladeH * (1.0 - 0.35 * bend * bend) - 0.03;

  vec3 base = uColorBase * mix(0.75, 1.15, aRnd.y);
  vec3 tip = mix(uColorTip, uColorTip * vec3(1.15, 1.05, 0.7), aRnd.w);
  vec3 albedo = mix(base, tip, t);
  vec3 petal = mix(uFlowerA, uFlowerB, step(0.5, fract(aRnd.z * 13.7)));
  albedo = mix(albedo, petal * 1.1, flower * smoothstep(0.62, 0.9, t));
  albedo = mix(albedo, uHeadColor * mix(0.8, 1.1, aRnd.z), head * smoothstep(0.6, 0.72, t));
  float sunUp = clamp(uSunDir.y * 1.5, 0.0, 1.0);
  float light = mix(0.45, 1.0, t) * (0.55 + 0.45 * sunUp);
  vColor = albedo * (uAmbient + uSunColor * light);

  vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function bladeGeometry() {
  // 7 vértices, 5 triângulos; x = largura relativa, y = altura normalizada 0..1
  const pts = [
    [-0.5, 0], [0.5, 0],
    [-0.42, 0.35], [0.42, 0.35],
    [-0.28, 0.7], [0.28, 0.7],
    [0, 1],
  ];
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = 0; });
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  return { pos, idx };
}

export class Grass {
  constructor(app) {
    this.app = app;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uHeight: { value: null },
        uSplatA: { value: null },
        uSplatB: { value: null },
        uFlowers: { value: 0 },
        uFlowerA: { value: new THREE.Color() },
        uFlowerB: { value: new THREE.Color() },
        uHeads: { value: 0 },
        uMaskA: { value: new THREE.Vector4(1, 0, 0, 0) },
        uMaskB: { value: new THREE.Vector4(0, 0, 0, 0) },
        uHeadColor: { value: new THREE.Color('#d9b35a') },
        uStiff: { value: 0 },
        uRes: { value: 2 },
        uSize: { value: 512 },
        uRadius: { value: 45 },
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uWind: { value: 0.5 },
        uBladeH: { value: 0.65 },
        uBladeW: { value: 0.07 },
        uWaterLevel: { value: -1000 },
        uColorBase: { value: new THREE.Color() },
        uColorTip: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
      },
    ]);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = null;
    this.count = 0;
  }

  build(count, radius) {
    if (this.mesh && this.count === count && this.radius === radius) return this.mesh;
    const parent = this.mesh?.parent;
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.removeFromParent();
    }
    this.count = count;
    this.radius = radius;
    const { pos, idx } = bladeGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const off = new Float32Array(count * 2);
    const rnd = new Float32Array(count * 4);
    const r = rng(777);
    for (let i = 0; i < count; i++) {
      off[i * 2] = (r() * 2 - 1) * radius;
      off[i * 2 + 1] = (r() * 2 - 1) * radius;
      rnd[i * 4] = r();
      rnd[i * 4 + 1] = r();
      rnd[i * 4 + 2] = r();
      rnd[i * 4 + 3] = r();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = count;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'Grama';
    this.mesh.frustumCulled = false;
    this.uniforms.uRadius.value = radius;
    if (parent) parent.add(this.mesh);
    return this.mesh;
  }

  bindTerrain(terrain) {
    this.uniforms.uHeight.value = terrain.heightTex;
    this.uniforms.uSplatA.value = terrain.splatTexA;
    this.uniforms.uSplatB.value = terrain.splatTexB;
    this.uniforms.uRes.value = terrain.res;
    this.uniforms.uSize.value = terrain.size;
  }

  applySettings(g) {
    this.build(Math.max(1000, Math.min(Math.round(g.count), this.maxCount || Infinity)), g.radius);
    this.uniforms.uBladeH.value = g.height;
    this.uniforms.uBladeW.value = g.width;
    this.uniforms.uColorBase.value.set(g.colorBase);
    this.uniforms.uColorTip.value.set(g.colorTip);
    this.uniforms.uFlowers.value = g.flowers ?? 0;
    this.uniforms.uFlowerA.value.set(g.flowerA || '#ffffff');
    this.uniforms.uFlowerB.value.set(g.flowerB || '#ffffff');
    this.uniforms.uHeads.value = g.heads || 0;
    this.uniforms.uHeadColor.value.set(g.headColor || '#d9b35a');
    this.uniforms.uStiff.value = g.stiff || 0;
    // em quais camadas do terreno a grama nasce (padrão: só na Grama)
    const on = (i) => ((g.layers || [0]).includes(i) ? 1 : 0);
    this.uniforms.uMaskA.value.set(on(0), on(1), on(2), on(3));
    this.uniforms.uMaskB.value.set(on(4), on(5), on(6), on(7));
    if (this.mesh) this.mesh.visible = g.enabled;
  }

  update(time, sky) {
    this.uniforms.uTime.value = time;
    if (sky) {
      this.uniforms.uSunDir.value.copy(sky.sunDir);
      this.uniforms.uSunColor.value.copy(sky.grassSun);
      this.uniforms.uAmbient.value.copy(sky.grassAmbient);
      this.uniforms.uWindDir.value.copy(sky.windDir2);
      this.uniforms.uWind.value = sky.windStrength;
    }
  }
}
