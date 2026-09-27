// Pós-processamento: antisserrilhado (MSAA), sombra de contato (GTAO, só na qualidade Alta:
// escurece cantos, pé das paredes e o chão sob árvores) e um acerto de cor leve (saturação e vinheta).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.08 },
    uVignette: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSaturation), 0.0);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.2, 0.9, dot(d, d) * 2.0);
      gl_FragColor = c;
    }`,
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {{ao?: boolean}} [opts]
   */
  constructor(renderer, scene, camera, { ao = false } = {}) {
    this.renderer = renderer;
    const pr = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    const w = Math.max(1, Math.round(size.x * pr)), h = Math.max(1, Math.round(size.y * pr));
    // Com densidade de pixels alta a imagem já sai lisa; senão usa MSAA 4x.
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: pr >= 1.5 ? 0 : 4,
      depthTexture: ao ? new THREE.DepthTexture(w, h) : null,
    });
    const c = (this.composer = new EffectComposer(renderer, this.target));
    c.addPass(new RenderPass(scene, camera));
    if (ao) {
      // A oclusão lê a profundidade da própria cena (folhas recortadas e grama inclusas), sem
      // renderizar tudo de novo. As trocas de buffer por quadro são pares (a saída final não
      // troca), então a cena é sempre desenhada no renderTarget2 (o readBuffer inicial).
      // (passar a profundidade no construtor quebra no three r186 sem textura de normais; por isso
      // cria normal e troca depois — o alvo de normais do construtor nunca é desenhado)
      this.gtao = new GTAOPass(scene, camera, w, h);
      this.gtao.setGBuffer(c.renderTarget2.depthTexture);
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 12, distanceFallOff: 0.6 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      c.addPass(this.gtao);
    }
    c.addPass(new ShaderPass(GradeShader));
    const out = new OutputPass();
    out.needsSwap = false;
    c.addPass(out);
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    this.gtao?.dispose();
    this.target.depthTexture?.dispose();
    this.composer.dispose();
  }
}
