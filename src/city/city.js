// Editor de cidade: objetos (peças prontas ou malhas importadas), NPCs (spawns) e zonas.
// Fluxo inspirado no UnrealEd 2 do Lineage 2: escolhe a peça, clica no chão, ajusta com o gizmo.
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildPrefab, PREFAB_MAP } from './prefabs.js';
import { ClothSim, makeClothMeshes, disposeClothMeshes } from '../cloth/cloth.js';
import { defaultClothPreset, npcDefaults } from '../core/state.js';
import { uid, DEG, base64ToBytes } from '../core/util.js';

export const NPC_TYPES = [
  { id: 'Merchant', label: 'Mercador', color: '#e0b84a' },
  { id: 'Teleporter', label: 'Gatekeeper (teleporte)', color: '#4ab0e0' },
  { id: 'Warehouse', label: 'Armazém', color: '#a07cd0' },
  { id: 'Buffer', label: 'Buffer', color: '#50d090' },
  { id: 'Guard', label: 'Guarda', color: '#d05050' },
  { id: 'Folk', label: 'Morador', color: '#cfcfcf' },
  { id: 'Monster', label: 'Monstro', color: '#9b2335' },
];
export const NPC_TYPE_MAP = new Map(NPC_TYPES.map((t) => [t.id, t]));

export const ZONE_TYPES = [
  { id: 'PeaceZone', label: 'Zona de paz', color: '#3ecf6e' },
  { id: 'TownZone', label: 'Cidade (TownZone)', color: '#4a9cff' },
  { id: 'ArenaZone', label: 'Arena PvP', color: '#ff4a4a' },
  { id: 'NoLandingZone', label: 'Sem pouso (wyvern)', color: '#ffb84a' },
  { id: 'SwampZone', label: 'Pântano (lentidão)', color: '#8a7a3a' },
];
export const ZONE_TYPE_MAP = new Map(ZONE_TYPES.map((t) => [t.id, t]));

const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.35, depthWrite: false });

function labelSprite(title, name, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const draw = (txt, y, size, fill) => {
    ctx.font = `bold ${size}px Tahoma, Verdana, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(txt, 256, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, 256, y);
  };
  if (title) draw(title, 50, 34, '#f2d25a');
  draw(name || 'NPC', title ? 100 : 80, 40, color);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 5;
  return s;
}

export class CityEditor {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'Cidade';
    this.objectsGroup = new THREE.Group();
    this.npcsGroup = new THREE.Group();
    this.zonesGroup = new THREE.Group();
    this.clothGroup = new THREE.Group();
    this.helpers = new THREE.Group();
    this.root.add(this.objectsGroup, this.npcsGroup, this.zonesGroup, this.clothGroup, this.helpers);

    this.nodes = new Map();
    this.cloths = new Map();
    this.npcChars = new Map(); // uid do NPC -> personagem animado (aba Personagens)
    this.meshTemplates = new Map();
    this.selected = null;

    this.tool = 'selecionar';
    this.placeRef = 'casa';
    this.placeRot = 0;
    this.opts = {
      snapGround: true,
      grid: 0,
      rotSnap: 15,
      randomRot: false,
      scatterRadius: 12,
      scatterDensity: 0.5,
      scatterSpacing: 4,
      scatterScaleMin: 0.8,
      scatterScaleMax: 1.3,
      scatterMaxSlope: 35,
      scatterSet: ['arvore', 'pinheiro', 'arbusto', 'pedra'],
      wallTowers: true,
      wallClosed: true,
      zoneType: 'PeaceZone',
      npcType: 'Merchant',
    };
    this.pathPoints = [];
    this.pathLine = null;
    this.ghost = null;

    const gizmo = new TransformControls(app.camera, app.renderer.domElement);
    gizmo.setSize(0.9);
    this.gizmo = gizmo;
    this.gizmoHelper = gizmo.getHelper();
    app.scene.add(this.gizmoHelper);
    gizmo.addEventListener('dragging-changed', (e) => {
      app.controls.enabled = !e.value;
      if (e.value) this._dragBefore = this.snapshot();
      else if (this._dragBefore) {
        const before = this._dragBefore;
        this._dragBefore = null;
        this._pushSnapshot('Mover/Girar/Escalar', before, this.snapshot());
        this.app.events.emit('selection-changed', this.selected);
      }
    });
    gizmo.addEventListener('objectChange', () => this._onGizmoChange());
  }

  get project() {
    return this.app.project;
  }

  // ------------------------------------------------------------ desfazer
  snapshot() {
    const p = this.project;
    return JSON.stringify({ objects: p.objects, npcs: p.npcs, zones: p.zones });
  }

  restore(json) {
    const s = JSON.parse(json);
    Object.assign(this.project, s);
    const sel = this.selected;
    this.rebuildAll();
    if (sel && this.nodes.has(sel.uid)) this.select(sel.kind, sel.uid);
    else this.select(null);
  }

  _pushSnapshot(label, before, after) {
    if (before === after) return;
    this.app.history.push({ label, undo: () => this.restore(before), redo: () => this.restore(after) });
    this.app.markDirty();
  }

  commit(label, fn) {
    const before = this.snapshot();
    const r = fn();
    this._pushSnapshot(label, before, this.snapshot());
    return r;
  }

  // ------------------------------------------------------------ construção dos nós
  rebuildAll() {
    this.gizmo.detach();
    for (const [, c] of this.cloths) this._disposeCloth(c);
    this.cloths.clear();
    for (const g of [this.objectsGroup, this.npcsGroup, this.zonesGroup]) {
      for (const ch of [...g.children]) this._disposeNode(ch);
      g.clear();
    }
    this.nodes.clear();
    for (const o of this.project.objects) this._addObjectNode(o);
    for (const n of this.project.npcs) this._addNpcNode(n);
    for (const z of this.project.zones) this._addZoneNode(z);
  }

  _disposeNode(node) {
    if (!node) return;
    // Peças prontas geram geometria própria (menos árvores e pedras, que reaproveitam variações);
    // malhas importadas compartilham a do modelo.
    const shared = node.userData.sharedGeometry;
    const ownMaterials = node.userData.kind === 'npc' || node.userData.kind === 'zone';
    if (node.userData.kind === 'npc' && this.npcChars.has(node.userData.uid)) {
      this.npcChars.get(node.userData.uid).dispose();
      this.npcChars.delete(node.userData.uid);
    }
    node.traverse((o) => {
      if (o.userData.keepResources) return; // malha/materiais do personagem são do modelo-base
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); return; }
      if ((o.isMesh || o.isLine || o.isPoints) && (!shared || o.userData.ownGeometry) && !o.geometry?.userData.shared) o.geometry?.dispose();
      if (ownMaterials && o.material && !o.isSprite) o.material.dispose();
    });
  }

  _buildObject(o) {
    if (o.kind === 'mesh') {
      const tpl = this.meshTemplates.get(o.ref);
      if (!tpl) {
        const g = new THREE.Group();
        const miss = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ff00ff', wireframe: true }));
        miss.position.y = 0.5;
        miss.userData.ownGeometry = true;
        g.add(miss);
        return g;
      }
      return SkeletonUtils.clone(tpl);
    }
    return buildPrefab(o.ref, o.color, o.seed);
  }

  _addObjectNode(o) {
    const node = this._buildObject(o);
    node.userData.sharedGeometry = o.kind === 'mesh';
    node.userData.uid = o.uid;
    node.userData.kind = 'object';
    this._applyTransform(node, o);
    this.objectsGroup.add(node);
    this.nodes.set(o.uid, node);
    if (node.userData.cloth) this._addCloth(o, node);
    return node;
  }

  _applyTransform(node, o) {
    node.position.fromArray(o.pos);
    node.rotation.set(o.rot[0] * DEG, o.rot[1] * DEG, o.rot[2] * DEG);
    node.scale.fromArray(o.scale);
    node.updateMatrixWorld(true);
  }

  _addCloth(o, node) {
    const info = node.userData.cloth;
    const anchor = node.getObjectByName('ancora_tecido');
    const preset = {
      ...defaultClothPreset(),
      type: 'bandeira',
      width: info.width,
      length: info.length,
      cols: 14,
      rows: 10,
      stiffness: 0.9,
      bend: 0.15,
      damping: 0.03,
      iterations: 6,
      mass: 0.6,
      windTurbulence: 0.8,
      collision: false,
      colorOuter: o.color || info.color,
      colorInner: '#c9a33a',
    };
    const sim = new ClothSim(preset);
    const meshes = makeClothMeshes(sim, preset);
    this.clothGroup.add(meshes);
    anchor.updateMatrixWorld(true);
    sim.reset(anchor.matrixWorld);
    this.cloths.set(o.uid, { sim, meshes, anchor });
  }

  _disposeCloth(c) {
    c.meshes.removeFromParent();
    disposeClothMeshes(c.meshes);
    c.sim.dispose();
  }

  _addNpcNode(n) {
    const t = NPC_TYPE_MAP.get(n.type) || NPC_TYPES[5];
    const g = new THREE.Group();
    // aparência: o personagem escolhido (animado) ou o marcador colorido
    const inst = n.character ? this.app.characters?.instance(n.character) : null;
    let top = 2.6;
    if (inst) {
      inst.object.rotation.y = Math.PI / 2; // o personagem olha +Z; o NPC olha +X (heading)
      inst.object.traverse((o) => { o.userData.keepResources = true; });
      inst.play('parado', { fade: 0 });
      inst.mixer.setTime(Math.random() * 3); // cada um num ponto da animação
      this.npcChars.set(n.uid, inst);
      g.add(inst.object);
      top = (inst.tpl.def.height || 1.8) + 0.5;
    } else {
      const m = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6, emissive: t.color, emissiveIntensity: 0.15 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 12), m);
      body.position.y = 0.87;
      body.castShadow = true;
      body.userData.ownGeometry = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), m);
      head.position.y = 1.78;
      head.userData.ownGeometry = true;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      arrow.rotation.z = -Math.PI / 2;
      arrow.position.set(0.65, 1.1, 0);
      arrow.userData.ownGeometry = true;
      g.add(body, head, arrow);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: t.color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.userData.ownGeometry = true;
    const label = labelSprite(n.title, `${n.name} [${n.npcId}]`);
    label.position.y = top;
    label.visible = this.showLabels !== false;
    g.add(ring, label);
    if (n.count > 1 && n.radius > 0) {
      const area = new THREE.Mesh(new THREE.RingGeometry(n.radius - 0.1, n.radius, 48), new THREE.MeshBasicMaterial({ color: t.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
      area.rotation.x = -Math.PI / 2;
      area.position.y = 0.1;
      area.userData.ownGeometry = true;
      g.add(area);
    }
    g.userData.uid = n.uid;
    g.userData.kind = 'npc';
    g.position.fromArray(n.pos);
    g.rotation.y = -n.heading * DEG;
    this.npcsGroup.add(g);
    this.nodes.set(n.uid, g);
    return g;
  }

  _addZoneNode(z) {
    const t = ZONE_TYPE_MAP.get(z.type) || { color: '#ff9f40' };
    const g = new THREE.Group();
    g.userData.uid = z.uid;
    g.userData.kind = 'zone';
    const pts = z.points;
    if (pts.length >= 2) {
      const wallPos = [];
      const linePos = [];
      const H = 10;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(len / 3));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps;
          const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0;
          const x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
          const y0 = this.app.terrain.heightAt(x0, z0), y1 = this.app.terrain.heightAt(x1, z1);
          wallPos.push(x0, y0, z0, x1, y1, z1, x1, y1 + H, z1, x0, y0, z0, x1, y1 + H, z1, x0, y0 + H, z0);
          linePos.push(x0, y0 + 0.25, z0, x1, y1 + 0.25, z1);
        }
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
      const uvs = [];
      for (let i = 0; i < wallPos.length / 18; i++) uvs.push(0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1);
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const wm = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(t.color) } },
        vertexShader: 'varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; varying float vH; void main(){ gl_FragColor = vec4(uColor, (1.0 - vH) * 0.45); }',
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const wall = new THREE.Mesh(wg, wm);
      wall.userData.ownGeometry = true;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
      const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: t.color }));
      line.userData.ownGeometry = true;
      g.add(wall, line);
      // rótulo no centro
      let cx = 0, cz = 0;
      for (const p of pts) { cx += p[0]; cz += p[1]; }
      cx /= n; cz /= n;
      const lbl = labelSprite(ZONE_TYPE_MAP.get(z.type)?.label || z.type, z.name, t.color);
      lbl.position.set(cx, this.app.terrain.heightAt(cx, cz) + 12, cz);
      lbl.scale.set(8, 2, 1);
      lbl.visible = this.showLabels !== false;
      g.add(lbl);
    }
    this.zonesGroup.add(g);
    this.nodes.set(z.uid, g);
    return g;
  }

  refreshNode(kind, uid) {
    const old = this.nodes.get(uid);
    if (old) {
      this._disposeNode(old);
      old.removeFromParent();
    }
    if (this.cloths.has(uid)) {
      this._disposeCloth(this.cloths.get(uid));
      this.cloths.delete(uid);
    }
    const list = kind === 'object' ? this.project.objects : kind === 'npc' ? this.project.npcs : this.project.zones;
    const data = list.find((x) => x.uid === uid);
    if (!data) return null;
    const node = kind === 'object' ? this._addObjectNode(data) : kind === 'npc' ? this._addNpcNode(data) : this._addZoneNode(data);
    if (this.selected?.uid === uid && kind !== 'zone') this.gizmo.attach(node);
    return node;
  }

  refreshZones() {
    for (const z of this.project.zones) this.refreshNode('zone', z.uid);
  }

  // ------------------------------------------------------------ malhas importadas
  async loadCustomMesh(entry) {
    const bytes = base64ToBytes(entry.data);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    let obj;
    const fmt = entry.format.toLowerCase();
    if (fmt === 'glb' || fmt === 'gltf') {
      const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
      obj = gltf.scene;
    } else if (fmt === 'fbx') {
      obj = new FBXLoader().parse(buf, '');
    } else if (fmt === 'obj') {
      obj = new OBJLoader().parse(new TextDecoder().decode(bytes));
    } else {
      throw new Error(`Formato não suportado: ${fmt}`);
    }
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    const wrap = new THREE.Group();
    obj.scale.multiplyScalar(entry.scale || 1);
    wrap.add(obj);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    if (Number.isFinite(box.min.y)) obj.position.y -= box.min.y;
    wrap.name = entry.name;
    this.meshTemplates.set(entry.id, wrap);
    return wrap;
  }

  meshSize(id) {
    const t = this.meshTemplates.get(id);
    if (!t) return null;
    return new THREE.Box3().setFromObject(t).getSize(new THREE.Vector3());
  }

  // ------------------------------------------------------------ criação de dados
  newObject(ref, pos, extra = {}) {
    const isMesh = ref.startsWith('mesh:');
    const def = isMesh ? null : PREFAB_MAP.get(ref);
    return {
      uid: uid('obj'),
      kind: isMesh ? 'mesh' : 'prefab',
      ref: isMesh ? ref.slice(5) : ref,
      name: isMesh ? this.project.customMeshes.find((m) => m.id === ref.slice(5))?.name || 'Malha' : def?.name || ref,
      pos: [pos.x, pos.y, pos.z],
      rot: [0, extra.yaw ?? 0, 0],
      scale: [extra.scale ?? 1, extra.scale ?? 1, extra.scale ?? 1],
      color: def?.color || null,
      seed: Math.floor(Math.random() * 100000),
    };
  }

  addObject(ref, pos, extra) {
    const o = this.newObject(ref, pos, extra);
    this.project.objects.push(o);
    this._addObjectNode(o);
    return o;
  }

  addNpc(pos, data = {}) {
    const type = data.type || this.opts.npcType;
    const t = NPC_TYPE_MAP.get(type);
    const n = {
      ...npcDefaults(type),
      ...data,
      uid: uid('npc'),
      npcId: data.npcId ?? 30001,
      name: data.name ?? (t ? t.label.split(' ')[0] : 'NPC'),
      title: data.title ?? '',
      type,
      pos: [pos.x, pos.y, pos.z],
      heading: data.heading ?? 90,
      respawn: data.respawn ?? 60,
      html: data.html ?? '',
      multisell: data.multisell ?? '',
      count: data.count ?? 1,
      radius: data.radius ?? 0,
    };
    this.project.npcs.push(n);
    this._addNpcNode(n);
    return n;
  }

  addZone(points, data = {}) {
    const z = {
      uid: uid('zona'),
      name: data.name ?? `zona_${this.project.zones.length + 1}`,
      type: data.type ?? this.opts.zoneType,
      points: points.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]),
      minZ: data.minZ ?? null,
      maxZ: data.maxZ ?? null,
    };
    this.project.zones.push(z);
    this._addZoneNode(z);
    return z;
  }

  getData(kind, id) {
    const list = kind === 'object' ? this.project.objects : kind === 'npc' ? this.project.npcs : this.project.zones;
    return list.find((x) => x.uid === id);
  }

  deleteSelected() {
    const s = this.selected;
    if (!s) return;
    this.commit('Excluir', () => {
      const key = s.kind === 'object' ? 'objects' : s.kind === 'npc' ? 'npcs' : 'zones';
      this.project[key] = this.project[key].filter((x) => x.uid !== s.uid);
      this.select(null);
      this.refreshNode(s.kind, s.uid);
    });
  }

  duplicateSelected() {
    const s = this.selected;
    if (!s || s.kind === 'zone') return;
    this.commit('Duplicar', () => {
      const src = this.getData(s.kind, s.uid);
      const copy = JSON.parse(JSON.stringify(src));
      copy.uid = uid(s.kind === 'object' ? 'obj' : 'npc');
      copy.pos[0] += 2;
      copy.pos[2] += 2;
      if (this.opts.snapGround) copy.pos[1] = this.app.terrain.heightAt(copy.pos[0], copy.pos[2]);
      if (s.kind === 'object') { this.project.objects.push(copy); this._addObjectNode(copy); }
      else { this.project.npcs.push(copy); this._addNpcNode(copy); }
      this.select(s.kind, copy.uid);
    });
  }

  dropSelectedToGround() {
    const s = this.selected;
    if (!s || s.kind === 'zone') return;
    this.commit('Colocar no chão', () => {
      const d = this.getData(s.kind, s.uid);
      d.pos[1] = this.app.terrain.heightAt(d.pos[0], d.pos[2]);
      this.nodes.get(s.uid).position.y = d.pos[1];
      this._syncCloth(s.uid);
    });
    this.app.events.emit('selection-changed', this.selected);
  }

  rotateSelected(deg) {
    const s = this.selected;
    if (!s || s.kind === 'zone') return;
    this.commit('Girar', () => {
      const d = this.getData(s.kind, s.uid);
      if (s.kind === 'npc') {
        d.heading = (((d.heading - deg) % 360) + 360) % 360;
        this.nodes.get(s.uid).rotation.y = -d.heading * DEG;
      } else {
        d.rot[1] = (d.rot[1] + deg) % 360;
        this._applyTransform(this.nodes.get(s.uid), d);
        this._syncCloth(s.uid);
      }
    });
    this.app.events.emit('selection-changed', this.selected);
  }

  // ------------------------------------------------------------ seleção e gizmo
  select(kind, id) {
    if (!kind) {
      this.selected = null;
      this.gizmo.detach();
    } else {
      this.selected = { kind, uid: id };
      const node = this.nodes.get(id);
      if (kind === 'zone' || !node) this.gizmo.detach();
      else {
        this.gizmo.attach(node);
        this.setGizmoMode(kind === 'npc' && this.gizmo.mode === 'scale' ? 'translate' : this.gizmo.mode);
      }
    }
    this.app.events.emit('selection-changed', this.selected);
  }

  setGizmoMode(mode) {
    if (this.selected?.kind === 'npc' && mode === 'scale') return;
    this.gizmo.setMode(mode);
    if (mode === 'rotate') {
      this.gizmo.showX = this.gizmo.showZ = this.selected?.kind !== 'npc';
      this.gizmo.showY = true;
    } else {
      this.gizmo.showX = this.gizmo.showY = this.gizmo.showZ = true;
    }
    this.app.events.emit('gizmo-mode', mode);
  }

  applySnapSettings() {
    this.gizmo.setTranslationSnap(this.opts.grid > 0 ? this.opts.grid : null);
    this.gizmo.setRotationSnap(this.opts.rotSnap > 0 ? this.opts.rotSnap * DEG : null);
  }

  _onGizmoChange() {
    const s = this.selected;
    if (!s) return;
    const node = this.nodes.get(s.uid);
    const d = this.getData(s.kind, s.uid);
    if (!node || !d) return;
    if (this.opts.snapGround && this.gizmo.mode === 'translate' && this.gizmo.axis !== 'Y') {
      node.position.y = this.app.terrain.heightAt(node.position.x, node.position.z);
    }
    d.pos = [round3(node.position.x), round3(node.position.y), round3(node.position.z)];
    if (s.kind === 'npc') {
      d.heading = (((-node.rotation.y / DEG) % 360) + 360) % 360;
      node.rotation.x = 0;
      node.rotation.z = 0;
    } else {
      d.rot = [round3(node.rotation.x / DEG), round3(node.rotation.y / DEG), round3(node.rotation.z / DEG)];
      d.scale = [round3(node.scale.x), round3(node.scale.y), round3(node.scale.z)];
      this._syncCloth(s.uid);
    }
    this.app.events.emit('selection-moved', this.selected);
  }

  _syncCloth(id) {
    const c = this.cloths.get(id);
    if (c) {
      c.anchor.updateMatrixWorld(true);
      c.sim.reset(c.anchor.matrixWorld);
    }
  }

  pick(raycaster) {
    const hits = raycaster.intersectObjects([this.objectsGroup, this.npcsGroup, this.clothGroup], true);
    for (const h of hits) {
      let o = h.object;
      if (o.parent?.parent === this.clothGroup || o.parent === this.clothGroup) {
        for (const [id, c] of this.cloths) if (c.meshes === o.parent || c.meshes === o) return { kind: 'object', uid: id };
      }
      while (o && !o.userData.uid) o = o.parent;
      if (o) return { kind: o.userData.kind, uid: o.userData.uid };
    }
    // zonas: clicar dentro do polígono
    const t = this.app.terrain.raycast(raycaster.ray, new THREE.Vector3());
    if (t) {
      for (const z of [...this.project.zones].reverse()) {
        if (pointInPoly(t.x, t.z, z.points)) return { kind: 'zone', uid: z.uid };
      }
    }
    return null;
  }

  // ------------------------------------------------------------ fantasma de posicionamento
  setGhost(ref) {
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost = null;
    }
    if (!ref) return;
    let g;
    if (ref === 'npc') {
      g = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 8), ghostMaterial);
      g.position.y = 0.87;
      const w = new THREE.Group();
      w.add(g);
      g = w;
    } else if (ref.startsWith('mesh:')) {
      const t = this.meshTemplates.get(ref.slice(5));
      g = t ? t.clone(true) : new THREE.Group();
    } else {
      g = buildPrefab(ref, null, 1);
    }
    g.traverse((o) => {
      if (o.isMesh) { o.material = ghostMaterial; o.castShadow = false; o.receiveShadow = false; }
    });
    g.visible = false;
    this.ghost = g;
    this.helpers.add(g);
  }

  moveGhost(p) {
    if (!this.ghost) return;
    if (!p) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.copy(this.snapPoint(p));
    this.ghost.rotation.y = this.placeRot * DEG;
  }

  snapPoint(p) {
    const out = p.clone();
    if (this.opts.grid > 0) {
      out.x = Math.round(out.x / this.opts.grid) * this.opts.grid;
      out.z = Math.round(out.z / this.opts.grid) * this.opts.grid;
      out.y = this.app.terrain.heightAt(out.x, out.z);
    }
    return out;
  }

  // ------------------------------------------------------------ ferramentas de caminho (zona/muralha)
  addPathPoint(p) {
    this.pathPoints.push([p.x, p.z]);
    this._updatePathLine();
  }

  popPathPoint() {
    this.pathPoints.pop();
    this._updatePathLine();
  }

  clearPath() {
    this.pathPoints = [];
    this._updatePathLine();
  }

  _updatePathLine(hover = null) {
    if (this.pathLine) {
      this.pathLine.geometry.dispose();
      this.pathLine.removeFromParent();
      this.pathLine = null;
    }
    const pts = [...this.pathPoints];
    if (hover) pts.push([hover.x, hover.z]);
    if (pts.length < 1) return;
    const arr = [];
    for (const p of pts) arr.push(p[0], this.app.terrain.heightAt(p[0], p[1]) + 0.4, p[1]);
    if (this.tool === 'zona' && pts.length > 2) arr.push(arr[0], arr[1], arr[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const color = this.tool === 'zona' ? ZONE_TYPE_MAP.get(this.opts.zoneType)?.color || '#fff' : '#ffd27a';
    this.pathLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false }));
    this.pathLine.renderOrder = 10;
    const dots = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 8, sizeAttenuation: false, depthTest: false }));
    dots.renderOrder = 10;
    this.pathLine.add(dots);
    this.helpers.add(this.pathLine);
  }

  hoverPath(p) {
    if (this.pathPoints.length) this._updatePathLine(p);
  }

  finishZone() {
    if (this.pathPoints.length < 3) return false;
    const pts = this.pathPoints;
    const z = this.commit('Criar zona', () => this.addZone(pts));
    this.clearPath();
    this.select('zone', z.uid);
    return true;
  }

  finishWall() {
    const pts = this.pathPoints;
    if (pts.length < 2) return false;
    this.commit('Muralha automática', () => {
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
      if (this.opts.wallClosed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
      const T = this.app.terrain;
      for (const [a, b] of segs) {
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 1) continue;
        const count = Math.max(1, Math.round(len / 8));
        const sx = len / (count * 8);
        const yaw = -Math.atan2(dz, dx) / DEG;
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count;
          const x = a[0] + dx * t, z = a[1] + dz * t;
          const o = this.newObject('muralha', new THREE.Vector3(x, T.heightAt(x, z) - 0.3, z), { yaw });
          o.scale = [round3(sx), 1, 1];
          this.project.objects.push(o);
          this._addObjectNode(o);
        }
      }
      if (this.opts.wallTowers) {
        const towerPts = this.opts.wallClosed ? pts : pts;
        for (const p of towerPts) this.addObject('torre', new THREE.Vector3(p[0], T.heightAt(p[0], p[1]) - 0.3, p[1]));
      }
    });
    this.clearPath();
    return true;
  }

  // ------------------------------------------------------------ espalhar (pintar objetos)
  scatterAt(center, erase = false) {
    const T = this.app.terrain;
    const R = this.opts.scatterRadius;
    const set = this.opts.scatterSet.filter((id) => PREFAB_MAP.has(id) || id.startsWith('mesh:'));
    if (erase) {
      const keep = [];
      for (const o of this.project.objects) {
        const ref = o.kind === 'mesh' ? `mesh:${o.ref}` : o.ref;
        const d = Math.hypot(o.pos[0] - center.x, o.pos[2] - center.z);
        if (d < R && set.includes(ref)) {
          const node = this.nodes.get(o.uid);
          this._disposeNode(node);
          node.removeFromParent();
          this.nodes.delete(o.uid);
          if (this.selected?.uid === o.uid) this.select(null);
        } else keep.push(o);
      }
      this.project.objects = keep;
      return;
    }
    if (!set.length) return;
    const tries = Math.max(1, Math.round(this.opts.scatterDensity * 6));
    const spacing = this.opts.scatterSpacing;
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (!T.inside(x, z)) continue;
      if (T.slopeAt(x, z) > this.opts.scatterMaxSlope) continue;
      const y = T.heightAt(x, z);
      if (this.project.terrain.waterEnabled && y < this.project.terrain.waterLevel + 0.3) continue;
      let ok = true;
      for (const o of this.project.objects) {
        if (Math.abs(o.pos[0] - x) < spacing && Math.abs(o.pos[2] - z) < spacing && Math.hypot(o.pos[0] - x, o.pos[2] - z) < spacing) { ok = false; break; }
      }
      if (!ok) continue;
      const ref = set[Math.floor(Math.random() * set.length)];
      const s = this.opts.scatterScaleMin + Math.random() * (this.opts.scatterScaleMax - this.opts.scatterScaleMin);
      this.addObject(ref, new THREE.Vector3(x, y - 0.1, z), { yaw: Math.random() * 360, scale: round3(s) });
    }
  }

  // ------------------------------------------------------------ por quadro
  /** Personagens carregados/alterados: refaz os NPCs que usam personagem. */
  refreshCharacters() {
    for (const n of this.project.npcs) {
      const has = this.npcChars.has(n.uid);
      if (n.character || has) this.refreshNode('npc', n.uid);
    }
  }

  update(dt, time) {
    // NPCs animados (só os perto da câmera, para não pesar)
    if (this.npcChars.size && this.npcsGroup.visible) {
      const cam = this.app.camera.position;
      for (const [, inst] of this.npcChars) {
        inst.object.getWorldPosition(_tmp);
        if (_tmp.distanceTo(cam) < 160) inst.update(dt);
      }
    }
    if (!this.cloths.size) return;
    const sky = this.app.sky;
    const wind = _wind.set(sky.windDir2.x, 0, sky.windDir2.y).multiplyScalar(2 + sky.windStrength * 9);
    const cam = this.app.camera.position;
    for (const [, c] of this.cloths) {
      c.anchor.getWorldPosition(_tmp);
      if (_tmp.distanceTo(cam) > 220) continue;
      c.sim.step(dt, c.anchor.matrixWorld, [], wind, time);
    }
  }

  // Terreno mudou: reposiciona zonas (que seguem o relevo).
  onTerrainChanged() {
    this.refreshZones();
  }
}

const _wind = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const round3 = (v) => Math.round(v * 1000) / 1000;

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
