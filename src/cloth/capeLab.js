// Laboratório de capas e roupas: manequim animado (ou personagem importado) + tecido simulado.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ClothSim, makeClothMeshes, disposeClothMeshes } from './cloth.js';
import { Mannequin } from './mannequin.js';
import { DEG } from '../core/util.js';

export const CLOTH_PRESETS = [
  { name: 'Capa de cavaleiro', type: 'capa', width: 0.9, length: 1.25, cols: 16, rows: 22, shape: 'reta', flare: 0.35, stiffness: 0.95, bend: 0.35, damping: 0.02, mass: 1, colorOuter: '#7a1020', colorInner: '#c8a24a' },
  { name: 'Capa rasgada (sombria)', type: 'capa', width: 0.85, length: 1.35, cols: 16, rows: 24, shape: 'rasgada', flare: 0.5, stiffness: 0.9, bend: 0.2, damping: 0.02, mass: 0.8, colorOuter: '#1d1d24', colorInner: '#4a1d5e' },
  { name: 'Capa curta em V', type: 'capa', width: 0.8, length: 0.9, cols: 14, rows: 16, shape: 'v', flare: 0.25, stiffness: 0.97, bend: 0.45, damping: 0.03, mass: 1.2, colorOuter: '#1f3f7a', colorInner: '#d8d8e0' },
  { name: 'Manto de mago (saia longa)', type: 'saia', width: 0.9, length: 0.95, cols: 28, rows: 16, shape: 'reta', flare: 0.9, stiffness: 0.95, bend: 0.3, damping: 0.03, mass: 1, colorOuter: '#3b2a6b', colorInner: '#c9a33a', bodyRadius: 0.2 },
  { name: 'Saia de couro em tiras', type: 'saia', width: 0.9, length: 0.45, cols: 24, rows: 8, shape: 'pontas', flare: 0.5, stiffness: 0.98, bend: 0.5, damping: 0.04, mass: 1.5, colorOuter: '#5a3a22', colorInner: '#2a1a10', bodyRadius: 0.2 },
  { name: 'Bandeira de clã', type: 'bandeira', width: 2.4, length: 1.6, cols: 18, rows: 12, shape: 'reta', flare: 0, stiffness: 0.92, bend: 0.15, damping: 0.02, mass: 0.6, colorOuter: '#8a1c2b', colorInner: '#c9a33a' },
];

export class CapeLab {
  constructor(app) {
    this.app = app;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#1b212c');
    scene.fog = new THREE.Fog('#1b212c', 18, 45);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    this.camera.position.set(2.6, 1.9, -3.6);
    this.controls = new OrbitControls(this.camera, app.renderer.domElement);
    this.controls.target.set(0, 1.1, 0);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.maxDistance = 30;

    const hemi = new THREE.HemisphereLight('#cfe0ff', '#2a2320', 1.0);
    const key = new THREE.DirectionalLight('#fff1dd', 2.8);
    key.position.set(4, 7, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 0.5; sc.far = 30;
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight('#8fb4ff', 1.2);
    rim.position.set(-5, 4, -6);
    scene.add(hemi, key, rim);
    this.key = key;

    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: '#2d3442', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(28, 28, '#56627a', '#3a4252');
    grid.position.y = 0.002;
    scene.add(grid);

    this.mannequin = new Mannequin();
    scene.add(this.mannequin.root);

    // mastro para a bandeira
    this.pole = new THREE.Group();
    const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 10), new THREE.MeshStandardMaterial({ color: '#4a3322', roughness: 0.8 }));
    poleMesh.position.y = 2.5;
    poleMesh.castShadow = true;
    this.pole.add(poleMesh);
    this.poleAnchor = new THREE.Object3D();
    this.poleAnchor.position.set(0.06, 4.9, 0);
    this.pole.add(this.poleAnchor);
    scene.add(this.pole);

    this.character = null;
    this.anim = 'andando';
    this.animSpeed = 1;
    this.followCam = true;
    this.windOn = true;
    this.windDir = 200;
    this.emblemImage = null;
    this.charOpts = { bone: '', offsetX: 0, offsetY: 0, offsetZ: -0.12, followBone: false, rotX: 0, rotY: 0, rotZ: 0, clip: 0, bodyHeight: 0.62 };
    this.time = 0;
    this.envReady = false;
    this.anchorMatrix = new THREE.Matrix4();
    this.rebuild();
  }

  get preset() {
    return this.app.project.cloth.current;
  }

  ensureEnvironment() {
    if (this.envReady) return;
    const pmrem = new THREE.PMREMGenerator(this.app.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.envReady = true;
  }

  rebuild() {
    if (this.meshes) {
      this.meshes.removeFromParent();
      disposeClothMeshes(this.meshes);
    }
    this.sim?.dispose();
    this.sim = new ClothSim(this.preset);
    this.meshes = makeClothMeshes(this.sim, this.preset, this.emblemImage);
    this.scene.add(this.meshes);
    this._updateVisibility();
  }

  refreshMaterial() {
    if (!this.meshes) return;
    this.meshes.removeFromParent();
    disposeClothMeshes(this.meshes);
    this.meshes = makeClothMeshes(this.sim, this.preset, this.emblemImage);
    this.scene.add(this.meshes);
  }

  // Atualiza parâmetros que não mudam a malha (rigidez, vento...) sem reiniciar.
  updateParams() {
    Object.assign(this.sim.preset, this.preset);
    const inv = 1 / Math.max(0.05, this.preset.mass);
    for (let i = 0; i < this.sim.n; i++) if (this.sim.invMass[i] !== 0) this.sim.invMass[i] = inv;
    this.mannequin.setBodyRadius(this.preset.bodyRadius);
  }

  resetSim() {
    this.sim.initialized = false;
  }

  _updateVisibility() {
    const flag = this.preset.type === 'bandeira';
    this.pole.visible = flag;
    this.mannequin.root.visible = !flag && !this.character;
    if (this.character) this.character.root.visible = !flag;
  }

  async setEmblem(dataUrl) {
    if (!dataUrl) {
      this.emblemImage = null;
      this.preset.emblem = null;
    } else {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      this.emblemImage = img;
      this.preset.emblem = dataUrl;
    }
    this.refreshMaterial();
  }

  // ---------------------------------------------------------- personagem importado
  async importCharacter(file) {
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    let root, clips = [];
    if (ext === 'glb' || ext === 'gltf') {
      const g = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
      root = g.scene;
      clips = g.animations || [];
    } else if (ext === 'fbx') {
      root = new FBXLoader().parse(buf, '');
      clips = root.animations || [];
    } else throw new Error('Use .glb ou .fbx');
    this.removeCharacter();
    const wrap = new THREE.Group();
    wrap.add(root);
    // normaliza para ~1,8 m de altura, pés no chão, olhando para +Z
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const h = box.max.y - box.min.y || 1;
    const s = 1.8 / h;
    root.scale.multiplyScalar(s);
    wrap.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(wrap);
    root.position.y -= box2.min.y;
    root.position.x -= (box2.min.x + box2.max.x) / 2;
    root.position.z -= (box2.min.z + box2.max.z) / 2;
    const bones = [];
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      if (o.isBone) bones.push(o);
    });
    const mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    this.character = { root: wrap, mixer, clips, bones, action: null, name: file.name };
    const guess = bones.find((b) => /upper_?chest|spine_?0?3|spine2|chest/i.test(b.name)) || bones.find((b) => /neck/i.test(b.name)) || bones[0];
    this.charOpts.bone = guess ? guess.name : '';
    this.charOpts.clip = 0;
    this.playClip(0);
    this.scene.add(wrap);
    this._updateVisibility();
    this.resetSim();
    return this.character;
  }

  playClip(i) {
    const c = this.character;
    if (!c || !c.mixer) return;
    c.action?.stop();
    const clip = c.clips[i];
    if (clip) {
      c.action = c.mixer.clipAction(clip);
      c.action.play();
    }
  }

  removeCharacter() {
    if (!this.character) return;
    this.character.root.removeFromParent();
    this.character.root.traverse((o) => o.geometry?.dispose());
    this.character = null;
    this._updateVisibility();
    this.resetSim();
  }

  // ---------------------------------------------------------- por quadro
  _characterAnchor() {
    const c = this.character;
    const o = this.charOpts;
    const bone = c.bones.find((b) => b.name === o.bone);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const rootQuat = c.root.getWorldQuaternion(new THREE.Quaternion());
    if (bone) {
      bone.getWorldPosition(pos);
      if (o.followBone) bone.getWorldQuaternion(quat);
      else quat.copy(rootQuat);
    } else {
      c.root.getWorldPosition(pos);
      pos.y += 1.45;
      quat.copy(rootQuat);
    }
    const extra = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotX * DEG, o.rotY * DEG, o.rotZ * DEG));
    quat.multiply(extra);
    pos.add(new THREE.Vector3(o.offsetX, o.offsetY, o.offsetZ).applyQuaternion(quat));
    return this.anchorMatrix.compose(pos, quat, new THREE.Vector3(1, 1, 1));
  }

  _characterColliders() {
    const c = this.character;
    const base = c.root.getWorldPosition(new THREE.Vector3());
    const r = this.preset.bodyRadius;
    const top = this.charOpts.bodyHeight + 0.85;
    return [
      { a: base.clone().add(new THREE.Vector3(0, 0.95, 0)), b: base.clone().add(new THREE.Vector3(0, top, 0)), r },
      { a: base.clone().add(new THREE.Vector3(-0.1, 0.1, 0)), b: base.clone().add(new THREE.Vector3(-0.1, 0.9, 0)), r: 0.09 },
      { a: base.clone().add(new THREE.Vector3(0.1, 0.1, 0)), b: base.clone().add(new THREE.Vector3(0.1, 0.9, 0)), r: 0.09 },
    ];
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const P = this.preset;
    let anchor, colliders = [];
    const before = new THREE.Vector3();
    const subject = this.character ? this.character.root : this.mannequin.root;
    subject.getWorldPosition(before);

    if (P.type === 'bandeira') {
      this.pole.updateMatrixWorld(true);
      anchor = this.poleAnchor.matrixWorld;
    } else if (this.character) {
      this.character.mixer?.update(dt * this.animSpeed);
      this.character.root.updateMatrixWorld(true);
      anchor = this._characterAnchor(); // capa: osso do peito; saia: escolha o osso do quadril
      colliders = this._characterColliders();
    } else {
      this.mannequin.setBodyRadius(P.bodyRadius);
      this.mannequin.animate(dt, this.anim, this.animSpeed);
      anchor = P.type === 'saia' ? this.mannequin.waistAnchor.matrixWorld : this.mannequin.capeAnchor.matrixWorld;
      colliders = this.mannequin.colliders;
    }

    const wd = this.windDir * DEG;
    const wind = new THREE.Vector3(Math.cos(wd), 0, Math.sin(wd)).multiplyScalar(this.windOn ? P.windStrength : 0);
    this.sim.step(dt, anchor, colliders, wind, this.time, 0);

    // câmera acompanha o boneco quando ele anda
    if (this.followCam && P.type !== 'bandeira') {
      const after = new THREE.Vector3();
      subject.getWorldPosition(after);
      const d = after.sub(before);
      d.y = 0;
      this.camera.position.add(d);
      this.controls.target.add(d);
    }
    this.key.position.copy(this.controls.target).add(new THREE.Vector3(4, 7, 3));
    this.key.target.position.copy(this.controls.target);
    this.key.target.updateMatrixWorld();
    this.controls.update();
  }

  focus() {
    const subject = this.preset.type === 'bandeira' ? this.pole : this.character ? this.character.root : this.mannequin.root;
    const p = subject.getWorldPosition(new THREE.Vector3());
    const y = this.preset.type === 'bandeira' ? 4 : 1.1;
    this.controls.target.set(p.x, y, p.z);
    this.camera.position.set(p.x + 2.6, y + 0.8, p.z - 3.6);
  }
}
