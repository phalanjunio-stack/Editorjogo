// Biblioteca de personagens do projeto: o boneco padrão, os importados (GLB/FBX/.psk do L2 ou do
// Verdant Rig) e os criados pelo rig automático. Cada um é guardado no projeto como GLB (malha +
// esqueleto + animações), o mesmo arquivo que serve para o jogo. NPCs e o jogador do modo Play
// usam cópias animadas deles.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readPsk, readPsa } from './actorx.js';
import { objectFromPsk, objectFromBones, clipsFromPsa, rigInfo, adaptClip, captureRest, resetPose, measureHeight, standardizeMaterials } from './rig.js';
import { buildDefaultCharacter, standardClips, guessSlots, ANIM_SLOTS } from './standard.js';
import { uid, bytesToBase64, base64ToBytes } from '../core/util.js';

export { ANIM_SLOTS };

export function defaultCharacterDef(extra = {}) {
  return {
    id: uid('pers'),
    name: 'Boneco padrão',
    kind: 'padrao',
    height: 1.8,
    colors: { skin: '#c9a98a', cloth: '#4a5a78', leather: '#4a3322' },
    glb: null,
    slots: {},
    ...extra,
  };
}

const ext = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

async function parseModel(name, bytes) {
  const e = ext(name);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (e === 'glb' || e === 'gltf') {
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    const root = gltf.scene;
    root.animations = gltf.animations || [];
    return root;
  }
  if (e === 'fbx') return standardizeMaterials(new FBXLoader().parse(buf, ''));
  if (e === 'psk') return objectFromPsk(readPsk(buf), { name: name.replace(/\.[^.]+$/, '') });
  throw new Error(`formato .${e} não suportado aqui (use GLB, FBX ou PSK)`);
}

function hasBones(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isBone) n++; });
  return n;
}

// Arredonda uma rotação para o eixo mais próximo (endireita personagens deitados/virados sem
// "entortar" uma pose que já está quase certa).
function snapQuat(q) {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const cols = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  m.extractBasis(cols[0], cols[1], cols[2]);
  for (const c of cols) {
    const a = [Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)];
    const k = a.indexOf(Math.max(...a));
    const s = Math.sign(c.getComponent(k)) || 1;
    c.set(0, 0, 0).setComponent(k, s);
  }
  cols[2].crossVectors(cols[0], cols[1]);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(cols[0], cols[1], cols[2]));
}

/** Modelo carregado + tudo que precisa para animar e posicionar em metros. */
class Template {
  constructor(def, root, clips) {
    this.def = def;
    this.root = captureRest(root);
    this.info = rigInfo(root);
    this.clips = new Map();
    for (const c of clips || []) this.clips.set(c.name, c);
    // de pé, olhando +Z, pés no chão, na altura pedida
    this.orient = this.info.score >= 8 ? snapQuat(this.info.frame) : new THREE.Quaternion();
    const probe = new THREE.Group();
    probe.quaternion.copy(this.orient);
    probe.add(root);
    resetPose(root);
    const { height, box } = measureHeight(probe);
    probe.remove(root);
    this.nativeHeight = height;
    this.minY = box.min.y;
  }

  get scale() {
    return (this.def.height || 1.8) / this.nativeHeight;
  }

  clipNames() {
    return [...this.clips.keys()];
  }
}

export class CharacterInstance {
  constructor(tpl) {
    this.tpl = tpl;
    this.object = new THREE.Group(); // quem usa posiciona/gira este
    this.object.name = tpl.def.name;
    this.fit = new THREE.Group();
    this.fit.quaternion.copy(tpl.orient);
    const s = tpl.scale;
    this.fit.scale.setScalar(s);
    this.fit.position.y = -tpl.minY * s;
    this.model = SkeletonUtils.clone(tpl.root);
    resetPose(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    this.fit.add(this.model);
    this.object.add(this.fit);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.current = null;
    this.slot = null;
    this.bones = new Map();
    this.model.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
  }

  /** Osso pelo id canônico ('chest', 'hips', 'R_hand'...). */
  canonBone(id) {
    const i = this.tpl.info.map.get(id);
    if (i === undefined) return null;
    return this.bones.get(this.tpl.info.bones[i].name) || null;
  }

  /** Toca o clipe ligado a um papel (parado, andar...). Devolve false se o personagem não tem. */
  play(slot, { fade = 0.25, loop, timeScale = 1 } = {}) {
    const name = this.tpl.def.slots?.[slot] || (this.tpl.clips.has(slot) ? slot : null);
    const clip = name ? this.tpl.clips.get(name) : null;
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    action.timeScale = timeScale;
    if (this.current === action) return true;
    const once = loop === false || (loop === undefined && clip.userData?.loop === false);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.play();
    if (this.current) this.current.crossFadeTo(action, fade, false);
    this.current = action;
    this.slot = slot;
    return true;
  }

  playClip(name, opts = {}) {
    const clip = this.tpl.clips.get(name);
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    action.reset().play();
    action.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = opts.loop === false;
    if (this.current && this.current !== action) this.current.crossFadeTo(action, opts.fade ?? 0.2, false);
    this.current = action;
    this.slot = null;
    return true;
  }

  setTimeScale(k) {
    if (this.current) this.current.timeScale = k;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.object.removeFromParent();
    // geometria e materiais são do modelo-base (compartilhados): não descarta
  }
}

export class CharacterLibrary {
  constructor(app) {
    this.app = app;
    this.templates = new Map(); // id -> Template
    this.packs = new Map(); // id -> { def, rig, info, clips }
    this.loading = new Map();
    this.version = 0;
  }

  get defs() {
    return this.app.project.characters;
  }

  def(id) {
    return this.defs.find((d) => d.id === id) || null;
  }

  /** Recarrega tudo do projeto (abrir/novo projeto). */
  async loadAll() {
    this.templates.clear();
    this.loading.clear();
    await Promise.all(this.defs.map((d) => this.ensure(d.id).catch((err) => this.app.log(`Personagem "${d.name}": ${err.message}`, 'warn'))));
    this.version++;
    this.app.events.emit('characters-changed');
  }

  /** Garante o modelo carregado (assíncrono para os GLB). */
  ensure(id) {
    if (this.templates.has(id)) return Promise.resolve(this.templates.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const def = this.def(id);
    if (!def) return Promise.reject(new Error('personagem não existe'));
    const p = this._build(def).then((t) => {
      this.templates.set(id, t);
      this.loading.delete(id);
      return t;
    }, (err) => {
      this.loading.delete(id);
      throw err;
    });
    this.loading.set(id, p);
    return p;
  }

  get(id) {
    return this.templates.get(id) || null;
  }

  async _build(def) {
    if (def.kind === 'padrao' || !def.glb) {
      const c = def.colors || {};
      const root = buildDefaultCharacter({ skin: c.skin, cloth: c.cloth, leather: c.leather, name: def.name });
      const clips = standardClips();
      def.slots = guessSlots(clips.map((x) => x.name), def.slots);
      return new Template(def, root, clips);
    }
    const bytes = base64ToBytes(def.glb);
    const root = await parseModel('p.glb', bytes);
    const tpl = new Template(def, root, root.animations);
    def.slots = guessSlots(tpl.clipNames(), def.slots);
    return tpl;
  }

  /** Cópia animada, pronta para pôr na cena. null se ainda está carregando. */
  instance(id) {
    const t = this.templates.get(id);
    if (!t) {
      this.ensure(id).then(() => this.app.events.emit('characters-changed')).catch(() => {});
      return null;
    }
    return new CharacterInstance(t);
  }

  // ---------------------------------------------------------------- importar
  /**
   * Importa um personagem: GLB/GLTF/FBX com esqueleto, ou .psk (+ .psa com as animações).
   * Malha sem esqueleto (OBJ, GLB estático) volta com { needsRig: true, object } para o rig automático.
   * @param {{name: string, bytes: Uint8Array}[]} files
   */
  async importFiles(files) {
    const model = files.find((f) => ['glb', 'gltf', 'fbx', 'psk', 'obj'].includes(ext(f.name)));
    if (!model) throw new Error('escolha um .glb, .fbx, .psk ou .obj');
    const baseName = model.name.replace(/\.[^.]+$/, '');
    let root;
    if (ext(model.name) === 'obj') {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      root = standardizeMaterials(new OBJLoader().parse(new TextDecoder().decode(model.bytes)));
    } else {
      root = await parseModel(model.name, model.bytes);
    }
    if (!hasBones(root)) return { needsRig: true, object: root, name: baseName };
    let clips = [...(root.animations || [])];
    // .psa junto: animações do mesmo esqueleto (L2 / Verdant Rig)
    for (const f of files.filter((x) => ext(x.name) === 'psa')) clips.push(...clipsFromPsa(readPsa(f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength)), root));
    clips = uniqueClips(clips);
    const def = defaultCharacterDef({ name: baseName, kind: 'importado', origin: ext(model.name) });
    await this._commit(def, root, clips);
    return { def };
  }

  /** Personagem vindo do rig automático (ou de qualquer objeto com esqueleto já montado). */
  async addRigged(name, root, clips = [], extra = {}) {
    const def = defaultCharacterDef({ name, kind: 'importado', origin: 'autorig', ...extra });
    await this._commit(def, root, clips);
    return def;
  }

  async _commit(def, root, clips) {
    captureRest(root);
    const tpl = new Template(def, root, clips);
    def.slots = guessSlots(tpl.clipNames(), def.slots);
    def.glb = await this.exportGlb(tpl);
    this.defs.push(def);
    this.templates.set(def.id, tpl);
    this.version++;
    this.app.events.emit('characters-changed');
    this.app.markDirty();
    return tpl;
  }

  /** GLB (base64) com a malha, o esqueleto na pose de descanso e todas as animações do personagem. */
  async exportGlb(tpl, { base64 = true } = {}) {
    resetPose(tpl.root);
    const scene = new THREE.Scene();
    const parent = tpl.root.parent;
    scene.add(tpl.root);
    try {
      const buf = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [...tpl.clips.values()], onlyVisible: false });
      return base64 ? bytesToBase64(new Uint8Array(buf)) : buf;
    } finally {
      scene.remove(tpl.root);
      parent?.add(tpl.root);
    }
  }

  /** GLB para o jogo, já em metros, de pé e com os pés no chão (baixar/usar em outra engine). */
  async exportGameGlb(id) {
    const tpl = await this.ensure(id);
    resetPose(tpl.root);
    const wrap = new THREE.Group();
    wrap.name = tpl.def.name;
    const fit = new THREE.Group();
    fit.quaternion.copy(tpl.orient);
    fit.scale.setScalar(tpl.scale);
    fit.position.y = -tpl.minY * tpl.scale;
    const clone = SkeletonUtils.clone(tpl.root);
    fit.add(clone);
    wrap.add(fit);
    const scene = new THREE.Scene();
    scene.add(wrap);
    return new GLTFExporter().parseAsync(scene, { binary: true, animations: [...tpl.clips.values()], onlyVisible: false });
  }

  async save(id) {
    const tpl = await this.ensure(id);
    if (tpl.def.kind !== 'padrao') tpl.def.glb = await this.exportGlb(tpl);
    this.version++;
    this.app.events.emit('characters-changed');
    this.app.markDirty();
  }

  remove(id) {
    const i = this.defs.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.defs.splice(i, 1);
    this.templates.delete(id);
    for (const n of this.app.project.npcs) if (n.character === id) n.character = null;
    if (this.app.project.player?.character === id) this.app.project.player.character = null;
    this.version++;
    this.app.events.emit('characters-changed');
    this.app.markDirty();
  }

  // ---------------------------------------------------------------- pacotes de animação
  /**
   * Pacote de animações para copiar para qualquer personagem: .psa (com o .psk do mesmo
   * esqueleto, se tiver), .fbx/.glb (ex.: Mixamo). Fica na sessão; com keep=true vai para o projeto.
   */
  async importPack(files, { keep = false } = {}) {
    const psa = files.find((f) => ext(f.name) === 'psa');
    const model = files.find((f) => ['glb', 'gltf', 'fbx', 'psk'].includes(ext(f.name)));
    let rig, clips, name;
    if (psa) {
      const data = readPsa(psa.bytes.buffer.slice(psa.bytes.byteOffset, psa.bytes.byteOffset + psa.bytes.byteLength));
      rig = model && ext(model.name) === 'psk' ? await parseModel(model.name, model.bytes) : objectFromBones(data.bones, 'esqueleto_psa');
      clips = clipsFromPsa(data, rig);
      name = psa.name.replace(/\.[^.]+$/, '');
    } else if (model) {
      rig = await parseModel(model.name, model.bytes);
      clips = rig.animations || [];
      name = model.name.replace(/\.[^.]+$/, '');
    } else {
      throw new Error('escolha um .psa (L2 / Verdant Rig) ou um .fbx/.glb com animações');
    }
    if (!clips.length) throw new Error('nenhuma animação encontrada no arquivo');
    const def = { id: uid('anim'), name, files: keep ? files.map((f) => ({ name: f.name, data: bytesToBase64(f.bytes) })) : null, count: clips.length };
    const pack = { def, rig: captureRest(rig), info: rigInfo(rig), clips: uniqueClips(clips) };
    if (pack.info.score < 8) throw new Error('o esqueleto das animações não parece humanoide (não achei pernas, braços e cabeça pelos nomes)');
    this.packs.set(def.id, pack);
    if (keep) this.app.project.animPacks.push(def);
    this.version++;
    this.app.events.emit('characters-changed');
    return pack;
  }

  /** Pacotes guardados no projeto: recarrega ao abrir. */
  async loadPacks() {
    this.packs.clear();
    for (const def of this.app.project.animPacks) {
      try {
        const files = def.files.map((f) => ({ name: f.name, bytes: base64ToBytes(f.data) }));
        const p = await this.importPack(files, { keep: false });
        this.packs.delete(p.def.id);
        p.def = def;
        this.packs.set(def.id, p);
      } catch (err) {
        this.app.log(`Pacote de animação "${def.name}": ${err.message}`, 'warn');
      }
    }
    // o boneco padrão é sempre um pacote: as animações dele servem para qualquer personagem
    const std = buildDefaultCharacter();
    this.packs.set('padrao', { def: { id: 'padrao', name: 'Animações do EditorJogo', count: 8 }, rig: std, info: rigInfo(std), clips: standardClips() });
  }

  /**
   * Copia clipes de um pacote (ou de outro personagem) para o personagem e liga ao papel.
   * @returns {Promise<string[]>} nomes dos clipes adicionados
   */
  async copyClips(charId, source, clipNames, { slot = null, inPlace = false } = {}) {
    const tpl = await this.ensure(charId);
    const src = source.startsWith?.('pers:') ? await this.ensure(source.slice(5)) : this.packs.get(source);
    if (!src) throw new Error('origem das animações não encontrada');
    const srcInfo = src.info;
    const added = [];
    for (const n of clipNames) {
      const clip = src.clips.get ? src.clips.get(n) : src.clips.find((c) => c.name === n);
      if (!clip) continue;
      let name = clip.name;
      let k = 2;
      while (tpl.clips.has(name) && tpl.clips.get(name).userData?.from !== clip.name) name = `${clip.name}_${k++}`;
      const out = adaptClip(clip, srcInfo, tpl.info, { name, inPlace });
      out.userData = { ...(clip.userData || {}), ...(out.userData || {}), from: clip.name };
      tpl.clips.set(name, out);
      added.push(name);
    }
    if (slot && added.length) tpl.def.slots[slot] = added[0];
    if (tpl.def.kind === 'padrao' && added.length) {
      // o boneco padrão passa a ser um personagem com GLB próprio (guarda as animações novas)
      tpl.def.kind = 'importado';
      tpl.def.origin = 'padrao';
    }
    await this.save(charId);
    return added;
  }
}

function uniqueClips(clips) {
  const seen = new Map();
  return clips.map((c) => {
    let n = c.name || 'animacao';
    const k = (seen.get(n) || 0) + 1;
    seen.set(n, k);
    if (k > 1) {
      n = `${n}_${k}`;
      const d = c.clone();
      d.name = n;
      return d;
    }
    return c;
  });
}
