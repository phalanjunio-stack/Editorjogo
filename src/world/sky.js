// Céu físico (Preetham) com nuvens animadas, sol/lua, estrelas, névoa e hora do dia.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { smoothstep, clamp, rng, DEG, debounce } from '../core/util.js';

const C = (hex) => new THREE.Color(hex);

export class SkySystem {
  constructor(app, scene) {
    this.app = app;
    this.scene = scene;

    this.sky = new Sky();
    this.sky.scale.setScalar(15000);
    this.sky.name = 'Céu';
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 800;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a3b2a, 0.8);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xbcd0e0, 0.001);
    scene.fog = this.fog;

    this.stars = this._makeStars();
    scene.add(this.stars);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.grassSun = new THREE.Color();
    this.grassAmbient = new THREE.Color();
    this.windDir2 = new THREE.Vector2(1, 0);
    this.windStrength = 0.5;
    this.day = 1;

    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(50);
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.pmrem = null;
    this.updateEnvSoon = debounce(() => this.updateEnvironment(), 300);
  }

  _makeStars() {
    const r = rng(42);
    const n = 2500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const y = Math.abs(u);
      pos[i * 3] = s * Math.cos(a) * 9000;
      pos[i * 3 + 1] = y * 9000 - 300;
      pos[i * 3 + 2] = s * Math.sin(a) * 9000;
      const b = 0.5 + r() * 0.5;
      col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * (0.85 + r() * 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const p = new THREE.Points(g, m);
    p.name = 'Estrelas';
    p.frustumCulled = false;
    p.renderOrder = -1;
    return p;
  }

  apply(p) {
    const dayPhase = (p.time - 6) / 12; // 0 = nascer, 0.5 = meio-dia, 1 = pôr do sol
    const elev = Math.sin(dayPhase * Math.PI) * 68;
    const az = p.sunAzimuth + (dayPhase - 0.5) * 150;
    this.sunDir.setFromSphericalCoords(1, (90 - elev) * DEG, az * DEG);
    const e = this.sunDir.y;
    const day = smoothstep(-0.08, 0.12, e);
    this.day = day;
    const golden = (1 - smoothstep(0.02, 0.35, e)) * day;

    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mie;
      u.mieDirectionalG.value = 0.8;
      u.cloudCoverage.value = this.cloudsOn === false ? 0 : p.cloudCoverage;
      u.cloudDensity.value = p.cloudDensity;
      u.cloudElevation.value = p.cloudElevation;
    }

    // Sol de dia, lua (azulada e fraca) à noite
    if (day > 0.001) {
      this.lightDir.copy(this.sunDir);
      this.sun.color.copy(C('#ffb46a')).lerp(C('#fff3e2'), smoothstep(0.02, 0.45, e));
      this.sun.intensity = 3.2 * day;
    } else {
      this.lightDir.copy(this.sunDir).negate();
      if (this.lightDir.y < 0.2) this.lightDir.y = 0.2;
      this.lightDir.normalize();
      this.sun.color.set('#8ea6ff');
      this.sun.intensity = 0.35;
    }
    this.hemi.color.copy(C('#1b2640')).lerp(C('#bcd6f2'), day);
    this.hemi.groundColor.copy(C('#141210')).lerp(C('#5d4c36'), day);
    this.hemi.intensity = 0.5 + 0.7 * day;

    const fogDay = C('#bfd3e6').lerp(C('#e7b58a'), golden * 0.8);
    const fogColor = C('#0a0f1c').lerp(fogDay, day);
    this.fog.color.copy(fogColor);
    this.fog.density = p.fog * 0.001;

    this.stars.material.opacity = clamp(1 - day * 1.4, 0, 1);

    const r = this.app.renderer;
    if (r) r.toneMappingExposure = p.exposure * (1 + (1 - day) * 0.6);

    // Cores usadas pela grama (shader próprio)
    this.grassSun.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.28);
    this.grassAmbient.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.35);

    const wd = p.windDir * DEG;
    this.windDir2.set(Math.cos(wd), Math.sin(wd));
    this.windStrength = p.windStrength;

    this.updateEnvSoon();
  }

  updateEnvironment() {
    const renderer = this.app.renderer;
    if (!renderer) return;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envSky.material.uniforms.showSunDisc.value = 0;
    this.envSky.material.uniforms.time.value = this.sky.material.uniforms.time.value;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.35 + 0.65 * this.day;
  }

  update(dt, focus, cloudSpeed = 1) {
    this.sky.material.uniforms.time.value += dt * cloudSpeed * 20;
    // A sombra acompanha o ponto que a câmera olha
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 350);
    this.sun.target.updateMatrixWorld();
  }
}
