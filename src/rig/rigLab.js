// Estúdio da aba Personagens: mostra o personagem escolhido tocando as animações, o esqueleto
// por cima e, no rig automático, a malha nova com os marcadores das juntas para ajustar.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MARKERS, MARKER_BY_ID, skeletonFromMarkers, symmetrize } from './autorig.js';
import { geometryFromMesh } from './autorigThree.js';
import { STANDARD_BONES } from './standard.js';

const SIDE_COLOR = { L: '#3fcf6a', R: '#4a8cff', '': '#ffae3a' };

export class RigLab {
  constructor(app) {
    this.app = app;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#1b212c');
    scene.fog = new THREE.Fog('#1b212c', 14, 40);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 200);
    this.camera.position.set(1.8, 1.5, 3.4);
    const dom = app.renderer.domElement;
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.maxDistance = 40;

    const hemi = new THREE.HemisphereLight('#d6e4ff', '#2a2320', 1.1);
    const key = new THREE.DirectionalLight('#fff1dd', 2.6);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight('#8fb4ff', 1.3);
    rim.position.set(-4, 3, -5);
    scene.add(hemi, key, rim);
    this.key = key;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshStandardMaterial({ color: '#2d3442', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(20, 40, '#56627a', '#3a4252');
    grid.position.y = 0.002;
    scene.add(ground, grid);

    this.stage = new THREE.Group(); // personagem
    this.editGroup = new THREE.Group(); // rig automático (malha + marcadores)
    scene.add(this.stage, this.editGroup);

    this.gizmo = new TransformControls(this.camera, dom);
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => { this.controls.enabled = !e.value && this._active(); });
    this.gizmo.addEventListener('objectChange', () => this._markerMoved());
    scene.add(this.gizmo.getHelper());

    this.inst = null;
    this.charId = null;
    this.clip = null;
    this.playing = true;
    this.speed = 1;
    this.turntable = false;
    this.showSkeleton = false;
    this.skeletonHelper = null;
    this.session = null;
    this.symmetry = true;
    this.markerMeshes = new Map();
    this.selectedMarker = null;
    this.envReady = false;
    this.raycaster = new THREE.Raycaster();

    dom.addEventListener('pointerdown', (e) => this._pointerDown(e));
  }

  _active() {
    return this.app.mode?.view === 'rig';
  }

  ensureEnvironment() {
    if (this.envReady) return;
    const pmrem = new THREE.PMREMGenerator(this.app.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.envReady = true;
  }

  // ---------------------------------------------------------------- personagem
  setCharacter(id) {
    this.inst?.dispose();
    this.inst = null;
    this.skeletonHelper?.removeFromParent();
    this.skeletonHelper = null;
    this.charId = id;
    if (!id) return;
    const inst = this.app.characters.instance(id);
    if (!inst) return; // ainda carregando: o evento characters-changed chama de novo
    this.inst = inst;
    this.stage.add(inst.object);
    this.setShowSkeleton(this.showSkeleton);
    this.play(this.clip || 'parado');
  }

  /** Toca um papel (parado, andar...) ou um clipe pelo nome. */
  play(name) {
    this.clip = name;
    const inst = this.inst;
    if (!inst) return;
    const slotClip = inst.tpl.def.slots?.[name];
    const ok = slotClip ? inst.play(name, { fade: 0.2, loop: true }) : inst.playClip(name, { fade: 0.2 });
    if (!ok) inst.play('parado', { loop: true });
    if (inst.current) {
      inst.current.setLoop(THREE.LoopRepeat, Infinity);
      inst.current.clampWhenFinished = false;
      inst.current.paused = !this.playing;
      inst.setTimeScale(this.speed);
    }
  }

  setPlaying(on) {
    this.playing = on;
    if (this.inst?.current) this.inst.current.paused = !on;
  }

  setSpeed(k) {
    this.speed = k;
    this.inst?.setTimeScale(k);
  }

  setShowSkeleton(on) {
    this.showSkeleton = on;
    this.skeletonHelper?.removeFromParent();
    this.skeletonHelper = null;
    if (on && this.inst) {
      this.skeletonHelper = new THREE.SkeletonHelper(this.inst.model);
      this.skeletonHelper.material.depthTest = false;
      this.skeletonHelper.material.linewidth = 2;
      this.scene.add(this.skeletonHelper);
    }
  }

  /** Posição da animação (0..1), para a linha do tempo. */
  get progress() {
    const a = this.inst?.current;
    if (!a) return 0;
    const d = a.getClip().duration || 1;
    return (a.time % d) / d;
  }

  seek(k) {
    const a = this.inst?.current;
    if (!a) return;
    a.time = k * a.getClip().duration;
    this.inst.mixer.update(0);
  }

  focus() {
    const h = this.session ? 1.8 : this.inst?.tpl.def.height || 1.8;
    this.controls.target.set(0, h * 0.52, 0);
    this.camera.position.set(h * 1.05, h * 0.85, h * 1.95);
  }

  // ---------------------------------------------------------------- rig automático
  /** Mostra a malha da sessão (sem esqueleto) em metros, com os marcadores. */
  startSession(session) {
    this.endSession();
    this.session = session;
    this.stage.visible = false;
    const k = 1.8 / session.height;
    this.editGroup.scale.setScalar(k);
    const g = geometryFromMesh(session.mesh, []);
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    const mesh = new THREE.Mesh(g, session.materials.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.72;
      c.depthWrite = false;
      return c;
    }));
    mesh.name = 'malha_rig';
    this.editGroup.add(mesh);
    this.editMesh = mesh;
    this.bonesLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe08a', depthTest: false, transparent: true }));
    this.bonesLine.renderOrder = 10;
    this.editGroup.add(this.bonesLine);
    this.refreshMarkers();
    this.focus();
  }

  endSession() {
    this.gizmo.detach();
    for (const o of [...this.editGroup.children]) {
      o.geometry?.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
      o.removeFromParent();
    }
    this.markerMeshes.clear();
    this.selectedMarker = null;
    this.session = null;
    this.stage.visible = true;
  }

  refreshMarkers() {
    const s = this.session;
    for (const [, m] of this.markerMeshes) { m.geometry.dispose(); m.material.dispose(); m.removeFromParent(); }
    this.markerMeshes.clear();
    this.gizmo.detach();
    if (!s?.markers) { this._updateBonesLine(); return; }
    const r = s.height * 0.014;
    for (const def of MARKERS) {
      const p = s.markers[def.id];
      if (!p) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: SIDE_COLOR[def.side || ''], depthTest: false, transparent: true }));
      m.renderOrder = 20;
      m.position.fromArray(p);
      m.userData.marker = def.id;
      this.editGroup.add(m);
      this.markerMeshes.set(def.id, m);
    }
    if (this.selectedMarker && this.markerMeshes.has(this.selectedMarker)) this.gizmo.attach(this.markerMeshes.get(this.selectedMarker));
    this._updateBonesLine();
  }

  _updateBonesLine() {
    const s = this.session;
    const pts = [];
    if (s?.markers) {
      const { pose, tips } = skeletonFromMarkers(s.markers, { top: s.top, headless: s.headless });
      for (const b of STANDARD_BONES) {
        if (!b.id || b.attach) continue;
        const parent = STANDARD_BONES.find((x) => x.name === b.parent);
        if (parent?.id && pose[parent.id] && pose[b.id]) pts.push(...pose[parent.id], ...pose[b.id]);
      }
      for (const [id, t] of Object.entries(tips)) if (pose[id]) pts.push(...pose[id], ...t);
    }
    this.bonesLine.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.bonesLine.geometry = g;
  }

  selectMarker(id) {
    this.selectedMarker = id;
    const m = id && this.markerMeshes.get(id);
    if (m) this.gizmo.attach(m);
    else this.gizmo.detach();
    for (const [k, mm] of this.markerMeshes) mm.scale.setScalar(k === id ? 1.6 : 1);
    this.app.events.emit('rig-marker', id);
  }

  _markerMoved() {
    const s = this.session;
    const m = this.gizmo.object;
    if (!s || !m?.userData.marker) return;
    const id = m.userData.marker;
    s.markers[id] = m.position.toArray();
    if (this.symmetry) {
      const side = MARKER_BY_ID.get(id)?.side;
      s.markers = symmetrize(s.markers, side || 'L');
      for (const [k, mm] of this.markerMeshes) if (k !== id) mm.position.fromArray(s.markers[k]);
    }
    this._updateBonesLine();
  }

  _pointerDown(e) {
    if (!this._active() || !this.session || e.button !== 0 || this.gizmo.dragging) return;
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.markerMeshes.values()], false);
    if (hits.length) this.selectMarker(hits[0].object.userData.marker);
  }

  // ---------------------------------------------------------------- quadro
  update(dt) {
    this.ensureEnvironment();
    if (this.controls.enabled) this.controls.update();
    if (this.inst) {
      if (this.turntable) this.inst.object.rotation.y += dt * 0.6;
      this.inst.update(dt);
    }
  }
}
