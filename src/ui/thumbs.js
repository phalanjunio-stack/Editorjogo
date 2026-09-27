// Miniaturas 3D das peças para o Navegador de Conteúdo (renderizadas uma vez e guardadas).
import * as THREE from 'three';
import { buildPrefab } from '../city/prefabs.js';
import { texturesPending } from '../core/textureLoader.js';

const SIZE = 128;

export class ThumbRenderer {
  constructor(app) {
    this.app = app;
    this.cache = new Map();
    this.queue = [];
    this.listeners = new Map();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2e36');
    const hemi = new THREE.HemisphereLight('#dfe9ff', '#3a3228', 1.4);
    const key = new THREE.DirectionalLight('#fff4e0', 2.6);
    key.position.set(3, 5, 4);
    this.scene.add(hemi, key);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    this.ground = ground;
    this.scene.add(ground);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
    this.rt = null;
  }

  // Retorna a URL se já existir; senão agenda e chama cb quando ficar pronta.
  get(key, build, cb) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
      this.queue.push({ key, build });
    }
    if (cb) this.listeners.get(key).push(cb);
    return null;
  }

  prefab(id, cb) {
    return this.get(`prefab:${id}`, () => buildPrefab(id, null, 7), cb);
  }

  mesh(id, cb) {
    return this.get(`mesh:${id}`, () => {
      const t = this.app.city.meshTemplates.get(id);
      return t ? t.clone(true) : new THREE.Group();
    }, cb);
  }

  // Processa algumas miniaturas por quadro para não travar a interface.
  pump(max = 2) {
    // espera as texturas carregarem para a foto não sair preta
    if (texturesPending()) return;
    const r = this.app.renderer;
    for (let n = 0; n < max && this.queue.length; n++) {
      const job = this.queue[0];
      let url = '';
      try {
        job.obj ??= job.build();
        if (texturesPending()) return; // a peça acabou de pedir texturas: fotografa depois
        url = this._render(r, job.obj);
      } catch (err) {
        console.warn('miniatura', job.key, err);
      }
      this.queue.shift();
      this.cache.set(job.key, url);
      for (const cb of this.listeners.get(job.key) || []) cb(url);
      this.listeners.delete(job.key);
    }
  }

  _render(renderer, obj) {
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62 || 1;
    this.ground.scale.setScalar(radius * 1.6);
    this.ground.position.set(center.x, box.min.y, center.z);
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360);
    const dir = new THREE.Vector3(0.9, 0.62, 1.05).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = dist / 50;
    this.camera.far = dist * 5;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);

    const prevTarget = renderer.getRenderTarget();
    const prevExposure = renderer.toneMappingExposure;
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.toneMappingExposure = 0.9;
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    const px = new Uint8Array(SIZE * SIZE * 4);
    renderer.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, px);
    renderer.setRenderTarget(prevTarget);
    renderer.toneMappingExposure = prevExposure;
    renderer.shadowMap.enabled = prevShadow;
    this.scene.remove(obj);
    obj.traverse((o) => { if (o.isMesh && !obj.userData.keepGeometry && obj.userData.prefab && !o.geometry?.userData.shared) o.geometry?.dispose(); });

    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    // WebGL lê de baixo para cima: inverte as linhas
    for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
}

// Miniatura desenhada (sem 3D) para tipos de folhagem.
export function foliageThumb(p) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#3b4a5c');
  g.addColorStop(1, '#232a33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  let seed = p.id.length * 97 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 70;
  for (let i = 0; i < n; i++) {
    const x = 6 + rnd() * 84;
    const h = (18 + rnd() * 50) * Math.min(1.6, p.height / 0.6);
    const lean = (rnd() - 0.5) * 16;
    const grad = ctx.createLinearGradient(0, 92, 0, 92 - h);
    grad.addColorStop(0, p.colorBase);
    grad.addColorStop(1, p.colorTip);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 94);
    ctx.quadraticCurveTo(x + lean * 0.3, 94 - h * 0.6, x + lean, 94 - h);
    ctx.stroke();
    if (rnd() < p.flowers * 2.2) {
      ctx.fillStyle = rnd() < 0.5 ? p.flowerA : p.flowerB;
      ctx.beginPath();
      ctx.arc(x + lean, 94 - h, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c.toDataURL('image/png');
}

// Miniatura de uma camada de textura a partir da textura do terreno.
export function textureThumb(tex) {
  const img = tex?.image;
  if (!img) return '';
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  try {
    c.getContext('2d').drawImage(img, 0, 0, 96, 96);
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return '';
  }
}
